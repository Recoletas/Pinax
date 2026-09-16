import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import JSZip from 'jszip'
import {
  detectByteOrderMark,
  detectEncodingFromBytes,
  normalizeEncodingDetection,
  scoreDecodedText
} from '@/services/writing/encodingDetector'
import {
  CHINESE_CHAPTER_RE,
  ENGLISH_CHAPTER_RE,
  VOLUME_CHAPTER_RE,
  detectChapters,
  findChapterMarks
} from '@/services/writing/chapterDetector'
import { computeUnmatchedRanges } from '../../shared/chapterContract'
import {
  buildSourceChunks,
  buildWorkId,
  createFileInstanceId,
  hashSourceTextSha256,
  normalizeSourceArtifact
} from '@/services/worldbook/worldbookSourceArchive'
import { detectSourceKind, parseSourceFiles } from '@/services/worldbook/worldbookSourceAdapters'
import { selectSourceChunks } from '@/services/worldbook/worldbookSourceSelection'
import { extractEpub } from '@/services/writing/epubAdapter'

// ---------- 编码 fixture 构造（无新依赖，纯手工字节表） ----------

const GB18030_TABLE = {
  26126: [195, 247], 28526: [179, 177], 30028: [189, 231], 65292: [163, 172], 20107: [202, 194],
  26087: [190, 201], 28207: [184, 219], 37324: [192, 239], 19968: [210, 187], 28779: [187, 240],
  25925: [185, 202], 20108: [182, 254], 36825: [213, 226], 22987: [202, 188], 19990: [202, 192],
  22812: [210, 185], 10: [10], 30340: [181, 196], 31532: [181, 218], 21619: [206, 182],
  28781: [195, 240], 39118: [183, 231], 38632: [211, 234], 12290: [161, 163], 24102: [180, 248],
  21688: [207, 204], 26202: [205, 237], 20174: [180, 211], 31456: [213, 194], 26469: [192, 180],
  32: [32], 24320: [191, 170], 28783: [181, 198], 22312: [212, 218], 28023: [186, 163], 27728: [207, 171]
}

const BIG5_TABLE = {
  40569: [196, 208], 30028: [172, 201], 65292: [161, 65], 20107: [168, 198], 20358: [168, 211],
  19968: [164, 64], 24118: [177, 97], 36889: [179, 111], 28779: [164, 245], 25925: [172, 71],
  20108: [164, 71], 22987: [169, 108], 19990: [165, 64], 22812: [169, 93], 24478: [177, 113],
  38728: [198, 70], 10: [10], 30340: [170, 186], 39080: [173, 183], 31532: [178, 196],
  35041: [184, 204], 38632: [171, 66], 21619: [168, 253], 12290: [161, 67], 34389: [179, 66],
  29642: [172, 192], 31456: [179, 185], 38348: [193, 241], 38283: [182, 125], 32: [32],
  23665: [164, 115], 29128: [191, 79], 33290: [194, 194]
}

function encodeWithTable(textValue, table) {
  const bytes = []
  for (const character of textValue) {
    const code = character.codePointAt(0)
    const pair = table[code]
    if (!pair) throw new Error(`编码表缺少字符: ${character}`)
    bytes.push(...pair)
  }
  return new Uint8Array(bytes)
}

const SIMPLIFIED_SAMPLE = '第一章 潮汐港的夜晚\n海风带来咸味，灯火明灭。旧世界的故事从这里开始。\n第二章 夜雨\n旧港的灯火在夜里明灭。'

function fileDouble(name, bytes, type = '') {
  return {
    name,
    type,
    size: bytes.byteLength,
    lastModified: 1,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }
}

describe('来源摄取内核', () => {
  it("编码识别：BOM 与多候选评分区分 UTF-8/GB18030/Big5/UTF-16 (#1)（合并4例）", async () => {
{
const utf8 = new TextEncoder().encode(SIMPLIFIED_SAMPLE)
    expect(detectEncodingFromBytes(utf8).encoding).toBe('utf-8')

    const bomUtf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])
    expect(detectByteOrderMark(bomUtf8)).toMatchObject({ encoding: 'utf-8' })
    const utf8BomResult = detectEncodingFromBytes(bomUtf8)
    expect(utf8BomResult.encoding).toBe('utf-8')
    expect(utf8BomResult.confidence).toBe('high')
    expect(utf8BomResult.text.startsWith('第一章')).toBe(true)

    const utf16le = Buffer.from(`\uFEFF${SIMPLIFIED_SAMPLE}`, 'utf16le')
    expect(detectEncodingFromBytes(new Uint8Array(utf16le))).toMatchObject({ encoding: 'utf-16le', confidence: 'high' })

    const utf16be = new Uint8Array(utf16le.length)
    for (let index = 0; index < utf16le.length; index += 2) {
      utf16be[index] = utf16le[index + 1]
      utf16be[index + 1] = utf16le[index]
    }
    expect(detectEncodingFromBytes(utf16be)).toMatchObject({ encoding: 'utf-16be' })

    // GB18030 / Big5 都能"成功"解码任意字节流，必须靠内容评分区分。
    const gbResult = detectEncodingFromBytes(encodeWithTable(SIMPLIFIED_SAMPLE, GB18030_TABLE))
    expect(gbResult.encoding).toBe('gb18030')
    expect(gbResult.confidence).toBe('high')
    expect(gbResult.text.replace(/\r/g, '')).toBe(SIMPLIFIED_SAMPLE)

    const traditional = '第一章 靈山夜雨\n燈火闌珊處，風帶來鹹味。舊世界的故事從這裡開始。\n第二章 處處'
    const big5Result = detectEncodingFromBytes(encodeWithTable(traditional, BIG5_TABLE))
    expect(big5Result.encoding).toBe('big5')
    const big5AsGb = big5Result.candidates.find((candidate) => candidate.encoding === 'gb18030')
    expect(big5AsGb.score).toBeLessThan(big5Result.candidates[0].score)

    // 纯西文文本在三个候选下得分并列时必须保持 utf-8 优先。
    const english = detectEncodingFromBytes(new TextEncoder().encode('Chapter 1 The Tide\nThe harbour slept under fog.'))
    expect(english.encoding).toBe('utf-8')
    expect(english.confidence).toBe('high')

    // 低置信度返回 warnings 而不是拒绝；乱码率进入评分。
    const garbage = new Uint8Array(512)
    for (let index = 0; index < garbage.length; index += 1) garbage[index] = (index * 37 + 11) % 256
    const garbageResult = detectEncodingFromBytes(garbage)
    expect(garbageResult.confidence === 'low' || garbageResult.warnings.length > 0).toBe(true)
    expect(scoreDecodedText('\ufffd\ufffd\ufffd中文').replacementRate).toBeGreaterThan(0.4)
    expect(normalizeEncodingDetection({ encoding: 'utf-8', confidence: 'high', candidates: [], warnings: [] }))
      .toMatchObject({ detected: 'utf-8', confidence: 'high' })
}
{
const text = [
      '序章 起点',
      '正文一段。',
      '第一章 潮汐',
      '## 第二章 夜雨',
      '卷二 大潮',
      'Chapter 3 The Tide',
      'CHAPTER IV THE STORM',
      '尾声 尾声标题'
    ].join('\n')
    expect(findChapterMarks(text)).toHaveLength(7)
    const plan = detectChapters(text)
    expect(plan.chapters.map((chapter) => chapter.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(plan.chapters[0]).toMatchObject({ title: '序章 起点', startOffset: 0 })
    expect(plan.chapters[6].endOffset).toBe(text.length)
    expect(plan.unmatchedRanges).toEqual([])
    expect(CHINESE_CHAPTER_RE.test('第一章　全角空格标题')).toBe(true)
    expect(VOLUME_CHAPTER_RE.test('卷一 大潮')).toBe(true)
    expect(ENGLISH_CHAPTER_RE.test('Chapter One: The Beginning')).toBe(true)

    const sparsePlan = detectChapters([
      '前导说明：第一章提到过潮汐的规则。',
      '',
      '第一章 真正的标题',
      '正文。',
      '这个句子以句号结尾。第二章 不是标题因为带句号。',
      '第三章 正常'
    ].join('\n'))
    expect(sparsePlan.chapters).toHaveLength(2)
    expect(sparsePlan.confidence).toBe('medium')
    expect(sparsePlan.unmatchedRanges.length).toBeGreaterThanOrEqual(1)
    const first = sparsePlan.chapters[0]
    expect(computeUnmatchedRanges(sparsePlan.chapters, first.startOffset)).toEqual([{ start: 0, end: first.startOffset }])
}
{
const paragraph = '潮水漫过堤岸，灯塔在雾中旋转。港口的账房彻夜亮着灯。'
    const longBody = `${paragraph}\n`.repeat(120)
    const content = `第一章 潮汐\n${longBody}\n第二章 夜雨\n${longBody}`
    const options = { sourceId: 'sha256-abcdef0123456789', chunkSize: 900 }
    const firstPass = buildSourceChunks(content, options)
    const secondPass = buildSourceChunks(content, options)
    expect(firstPass.map((chunk) => chunk.id)).toEqual(secondPass.map((chunk) => chunk.id))
    expect(firstPass.map((chunk) => chunk.locator.start)).toEqual(secondPass.map((chunk) => chunk.locator.start))

    expect(firstPass.filter((chunk) => chunk.chapterId === 'sha256-abcdef0123456789:chapter:1').length).toBeGreaterThan(1)
    for (const chunk of firstPass) {
      expect(chunk.chapterId).not.toBeNull()
      if (chunk.text.includes('夜雨')) expect(chunk.chapterId.endsWith(':chapter:2')).toBe(true)
    }

    const plain = buildSourceChunks('普通段落一。\n\n普通段落二。'.repeat(200), {
      sourceId: 'sha256-fedcba9876543210',
      chunkSize: 600
    })
    expect(plain.some((chunk) => chunk.chapterId === null)).toBe(true)
}
{
const sample = '潮汐港登记簿·第一卷'
    const hex = hashSourceTextSha256(sample)
    expect(hex).toBe(`sha256-${createHash('sha256').update(sample, 'utf8').digest('hex').slice(0, 16)}`)

    const workId = buildWorkId({ title: '潮汐港志', author: '陆沉' })
    expect(workId).toMatch(/^work-[\p{Script=Han}a-z0-9-]+-[0-9a-f]{8}$/u)
    expect(buildWorkId({})).toBeNull()
    expect(createFileInstanceId()).toMatch(/^upload-/)

    const artifact = normalizeSourceArtifact({
      id: 'legacy-source-fnv1a1234',
      content: sample,
      legacyContentHash: 'fnv1a-12345678',
      fileInstanceId: 'upload-test-1',
      workMeta: { title: '潮汐港志', author: '陆沉' },
      epubMetadata: { title: '潮汐港志', author: '', language: 'zh', identifier: 'urn:isbn:test' },
      chapters: [{ title: '第一章', ordinal: 1, startOffset: 0, endOffset: 10 }]
    })
    expect(artifact.contentHash).toBe(hex)
    expect(artifact.legacyContentHash).toBe('fnv1a-12345678')
    expect(artifact.fileInstanceId).toBe('upload-test-1')
    expect(artifact.workId).toBe(workId)
    expect(artifact.epubMetadata).toMatchObject({ language: 'zh' })
    expect(artifact.chapters[0].chapterId).toBe(`${artifact.id}:chapter:1`)
    expect(['high', 'medium', 'low']).toContain(artifact.chapterDetectionConfidence)
    expect(Array.isArray(artifact.unmatchedRanges)).toBe(true)
}
})

  it("跨编码重复识别与批内 duplicates 标记 (#4)（合并3例）", async () => {
{
const [utf8Report, gbReport] = await parseSourceFiles([
      fileDouble('小说A.txt', new TextEncoder().encode(SIMPLIFIED_SAMPLE)),
      fileDouble('改名了.txt', encodeWithTable(SIMPLIFIED_SAMPLE, GB18030_TABLE))
    ])
    expect(utf8Report.status).toBe('ready')
    expect(gbReport.status).toBe('ready')
    expect(gbReport.artifact.contentHash).toBe(utf8Report.artifact.contentHash)
    expect(gbReport.artifact.id).toBe(utf8Report.artifact.id)
    expect(gbReport.duplicates.duplicateOfSourceId).toBe(utf8Report.sourceId)
    expect(gbReport.encoding.detected).toBe('gb18030')
    expect(utf8Report.encoding.detected).toBe('utf-8')
}
{
const heading = (title) => `${title}\n${'潮水漫过堤岸，账房的灯亮到天明。'.repeat(6)}\n`
    const content = `第一章 潮汐\n${heading('x')}${heading('y')}${heading('z')}第二章 夜雨\n${'旧港的故事还在继续。'.repeat(20)}`
    const report = (await parseSourceFiles([fileDouble('潮汐.txt', new TextEncoder().encode(content))]))[0]

    expect(report.status).toBe('ready')
    expect(report.fileName).toBe('潮汐.txt')
    expect(Array.isArray(report.chunks)).toBe(true)
    expect(report.parseMetrics.durationMs).toBeGreaterThanOrEqual(0)
    expect(report.schemaVersion).toBe(1)
    expect(report.encoding).toMatchObject({ detected: 'utf-8' })
    expect(report.chapters.total).toBe(2)
    expect(report.chunks.total).toBe(report.chunks.length)
    expect(report.chunks.avgChunkSize).toBeGreaterThan(0)
    expect(report.performance.parseSizeBytes).toBeGreaterThan(0)
    expect(report.failures).toEqual([])
    expect(report.userActions).toEqual([])

    const reports = await parseSourceFiles([
      fileDouble('坏文件.pdf', new Uint8Array([37, 80, 68, 70]), 'application/pdf'),
      fileDouble('脚本.exe', new TextEncoder().encode('MZ'), 'application/x-msdownload')
    ])
    const pdfReport = reports[0]
    expect(pdfReport.status).toBe('error')
    expect(pdfReport.failures[0]).toMatchObject({ recoverable: true })
    expect(pdfReport.failures[0].suggestedAction.command).toBeTruthy()
    expect(pdfReport.userActions.length).toBeGreaterThan(0)
    expect(reports[1]).toMatchObject({ status: 'error', format: '' })
    expect(reports[1].userActions[0].command).toBe('convert-and-reupload')
}
{
const body = (n) => `第${['一', '二', '三'][n]}章 章节${n}\n${'潮汐与灯塔的记录，账目清楚。'.repeat(30)}\n`
    const docContent = `${body(0)}${body(1)}${body(2)}`
    const selected = selectSourceChunks({
      sourceDocuments: [{ id: 'a', title: '潮汐志', content: docContent }],
      sectionLabel: '历史',
      fieldLabel: '潮汐',
      maxChunks: 3,
      maxChunksPerSource: 3
    })
    expect(selected.chunks.length).toBeGreaterThan(0)
    expect(selected.context).toContain('章节「')
}
})

  function spineXhtml(title, paragraphs) {
    return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body></html>`
  }

  async function buildEpub({ withOpf = false }) {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    if (withOpf) {
      zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
      zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>潮汐港</dc:title><dc:creator>陆沉</dc:creator><dc:language>zh</dc:language><dc:identifier>urn:uuid:test-1</dc:identifier></metadata><manifest><item id="c2" href="text/chap-b.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/chap-a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
      zip.file('OEBPS/text/chap-b.xhtml', spineXhtml('第二章 夜雨', ['夜雨落在旧港。']))
      zip.file('OEBPS/text/chap-a.xhtml', spineXhtml('第一章 潮汐', ['潮水漫过堤岸。']))
    } else {
      zip.file('OEBPS/b.xhtml', spineXhtml('B', ['乙']))
      zip.file('OEBPS/a.xhtml', spineXhtml('A', ['甲']))
    }
    return zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' })
  }

  it('EPUB：按 OPF spine 顺序解析、metadata 抽取、OPF 缺失退化警告 (#3)', async () => {
    const buffer = await buildEpub({ withOpf: true })
    const extracted = await extractEpub(buffer)
    expect(extracted.metadata).toMatchObject({ title: '潮汐港', author: '陆沉', language: 'zh' })
    expect(extracted.parts).toHaveLength(2)
    expect(extracted.parts[0].text).toContain('潮水漫过堤岸')
    expect(extracted.spineTitles[0]).toContain('第一章')

    const report = (await parseSourceFiles([fileDouble('潮汐港.epub', new Uint8Array(buffer), 'application/epub+zip')]))[0]
    expect(report.status).toBe('ready')
    expect(report.format).toBe('epub')
    expect(report.artifact.epubMetadata.title).toBe('潮汐港')
    expect(report.artifact.chapters.length).toBe(2)
    const firstChapter = report.artifact.chapters.find((chapter) => chapter.ordinal === 1)
    const secondChapter = report.artifact.chapters.find((chapter) => chapter.ordinal === 2)
    expect(firstChapter.detectionBasis).toBe('opff')
    expect(secondChapter.startOffset).toBeGreaterThan(firstChapter.startOffset)
    expect(report.chunks.every((chunk) => chunk.chapterId)).toBe(true)
    const firstChapterChunks = report.chunks.filter((chunk) => chunk.chapterId === firstChapter.chapterId)
    expect(firstChapterChunks.map((chunk) => chunk.text).join('')).toContain('潮水漫过堤岸')
    expect(report.chunks[report.chunks.length - 1].text).toContain('夜雨落在旧港')

    const fallbackBuffer = await buildEpub({ withOpf: false })
    const fallback = await extractEpub(fallbackBuffer)
    expect(fallback.warnings.join('')).toContain('文件名顺序')
    expect(fallback.parts[0].text).toContain('甲')

    const fallbackReport = (await parseSourceFiles([fileDouble('broken.epub', new Uint8Array(fallbackBuffer))]))[0]
    expect(fallbackReport.status).toBe('ready')
    expect(fallbackReport.artifact.warnings.join('')).toContain('文件名顺序')

    expect(detectSourceKind({ name: 'a.epub', type: '' })).toBe('epub')
    expect(detectSourceKind({ name: 'a.txt', type: 'application/epub+zip' })).toBe('epub')
  })
})
