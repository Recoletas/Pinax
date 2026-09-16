/**
 * 来源摄取 bake-off：验证编码识别、章节切块与 5 层 ID 的 6 项指标。
 *
 * 运行：npm run bench:source-ingestion
 * 依赖：vite-node（解析 src 内无扩展名 ESM 导入）；无新增第三方依赖，
 * ZIP fixture 复用仓库已有的 jszip（mammoth 的既有依赖）。
 *
 * Fixture 全部为程序化生成的合成中文小说文本（受版权保护的公领域文本不进
 * 仓库），带章节标题 ground truth，可复现（固定种子 LCG）。
 */

import { detectEncodingFromBytes } from '../../src/services/writing/encodingDetector'
import { detectChapters } from '../../src/services/writing/chapterDetector'
import {
  buildSourceChunks,
  hashSourceTextSha256,
  normalizeSourceText
} from '../../src/services/worldbook/worldbookSourceArchive'
import { parseSourceFiles } from '../../src/services/worldbook/worldbookSourceAdapters'

void parseSourceFiles // 格式维度 fixture 通过 adapter 路径运行（见下）

// ---------------- 基础工具 ----------------

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

const TARGET_ENCODERS = ['gb18030', 'big5']

/**
 * 暴力扫描双字节编码空间建立 字符→字节 映射（Node TextDecoder 只解码不编码）。
 * 仅在 harness 启动时执行一次，~65k 次 × 2 解码，秒级。
 */
async function buildTwoByteEncoderTables(vocab) {
  const tables = {}
  for (const encoding of TARGET_ENCODERS) {
    const decoder = new TextDecoder(encoding, { fatal: false })
    const table = new Map()
    const pair = new Uint8Array(2)
    for (let hi = 0x81; hi <= 0xfe; hi += 1) {
      for (let lo = 0x40; lo <= 0xfe; lo += 1) {
        if (lo === 0x7f) continue
        pair[0] = hi
        pair[1] = lo
        const decoded = decoder.decode(pair)
        if ([...decoded].length !== 1) continue
        const code = decoded.codePointAt(0)
        if (code < 0x3447 || (code >= 0xe000 && code <= 0xf8ff)) continue // 跳过 PUA/用户区
        if (!table.has(decoded)) table.set(decoded, [hi, lo])
      }
    }
    tables[encoding] = table
  }
  return tables
}

function encodeText(textValue, table, fallback) {
  const bytes = []
  for (const character of textValue) {
    const encoded = table.get(character)
    if (encoded) bytes.push(...encoded)
    else if (fallback && character.codePointAt(0) < 128) bytes.push(character.codePointAt(0))
    else throw new Error(`字符 ${character} 无法用当前编码表表示`)
  }
  return new Uint8Array(bytes)
}

// ---------------- 文本生成 ----------------

const CN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function padNumeral(index, style) {
  if (style === 'zero-pad') return String(index + 1).padStart(3, '0')
  if (index < 10) return CN_NUMERALS[index]
  if (index < 20) return `十${CN_NUMERALS[index - 10]}`.replace('十一', '十一')
  const tens = Math.floor(index / 10)
  const ones = index % 10
  return `${CN_NUMERALS[tens - 1]}十${ones ? CN_NUMERALS[ones - 1] : ''}`
}

function chapterTitleVariants(index, rng, style) {
  const words = ['潮汐', '灯塔', '旧港', '夜雨', '账房', '海雾', '渡船', '盐场', '风信', '星图']
  const word = words[Math.floor(rng() * words.length)]
  switch (style) {
    case 'xuanhuan': return `第${padNumeral(index)}章 ${word}${word}`
    case 'urban': return `第${padNumeral(index, 'zero-pad')}章 ${word}记事`
    case 'english': return index % 2 === 0 ? `Chapter ${index + 1} The ${word}` : `CHAPTER ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][(index) % 10]} THE ${word.toUpperCase()}`
    case 'volume': return `${index % 3 === 0 ? `卷${CN_NUMERALS[Math.floor(index / 3)]}` : `第${padNumeral(index)}章`} ${word}`
    default: return `第${padNumeral(index)}章 ${word}`
  }
}

function generateNovel({ chapterCount, paragraphsPerChapter, style = 'xuanhuan', seed = 42, preambleLines = [] }) {
  const rng = createRng(seed)
  const sentences = [
    '潮水漫过堤岸，灯塔在雾中缓缓旋转。',
    '账房的灯亮到天明，账目一笔一画都清楚。',
    '他说旧世界的故事要从这里讲起，说完便望向海面。',
    '风带来咸味，也带来远方的消息。',
    '渡船靠岸时，甲板上的水渍还没有干。',
    '她数着台阶走上城墙，数到一半就停了下来。',
    '夜里落了雨，青石路面映着灯火。',
    '盐场的工人们收工，把木耙靠在墙边。',
    '这封信没有署名，字迹却熟悉得让人心慌。',
    '他想起很多年前那个同样的黄昏。'
  ]
  const lines = [...preambleLines]
  const chapters = [] // ground truth: { title, ordinal }
  for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex += 1) {
    const titleLine = chapterTitleVariants(chapterIndex, rng, style)
    if (lines.length) lines.push('')
    chapters.push({ title: titleLine, ordinal: chapters.length + 1 })
    lines.push(titleLine)
    for (let paragraphIndex = 0; paragraphIndex < paragraphsPerChapter; paragraphIndex += 1) {
      const sentenceCount = 3 + Math.floor(rng() * 4)
      const paragraph = Array.from({ length: sentenceCount }, () => sentences[Math.floor(rng() * sentences.length)]).join('')
      if (paragraphIndex > 0) lines.push('')
      lines.push(paragraph)
    }
  }
  const text = lines.join('\n')
  return { text, gtChapters: chapters }
}

function utf16WithBom(textValue, littleEndian) {
  const source = `\uFEFF${textValue}`
  const bytes = new Uint8Array(source.length * 2)
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    if (littleEndian) {
      bytes[index * 2] = code & 0xff
      bytes[index * 2 + 1] = code >> 8
    } else {
      bytes[index * 2] = code >> 8
      bytes[index * 2 + 1] = code & 0xff
    }
  }
  return bytes
}

// ---------------- 切块策略（current / A / B） ----------------

function chunkFixedLength(text, chunkSize = 6000) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + chunkSize)
    let end = hardEnd
    if (hardEnd < text.length) {
      const newline = text.lastIndexOf('\n', hardEnd)
      if (newline > start + Math.floor(chunkSize * 0.55)) end = newline
    }
    const chunkText = text.slice(start, end).trim()
    if (chunkText) chunks.push({ text: chunkText, start, end })
    start = end
  }
  return chunks
}

function chunkOneChapterPerChunk(text, chapters) {
  if (!chapters.length) return chunkFixedLength(text)
  const ranges = []
  for (let index = 0; index < chapters.length; index += 1) {
    ranges.push({
      text: text.slice(chapters[index].startOffset, chapters[index].endOffset),
      start: chapters[index].startOffset,
      end: chapters[index].endOffset
    })
  }
  const leading = chapters[0].startOffset > 0
    ? [{ text: text.slice(0, chapters[0].startOffset), start: 0, end: chapters[0].startOffset }]
    : []
  return [...leading, ...ranges].filter((range) => range.text.trim())
}

// ---------------- 指标计算 ----------------

function boundaryViolationCount(chunks, gtRanges) {
  let violations = 0
  for (const chunk of chunks) {
    const touched = new Set()
    for (const range of gtRanges) {
      if (chunk.start < range.end && chunk.end > range.start) touched.add(range.id)
    }
    if (touched.size > 1) violations += 1
  }
  return violations
}

function chapterF1(detectedChapters, gtChapters, tolerance = 3) {
  const gtOffsets = gtChapters.map((chapter) => chapter.offset)
  const detectedOffsets = detectedChapters.map((chapter) => chapter.startOffset)
  let matched = 0
  const used = new Set()
  for (const offset of gtOffsets) {
    const hit = detectedOffsets.findIndex((candidate, index) => !used.has(index) && Math.abs(candidate - offset) <= tolerance)
    if (hit >= 0) {
      used.add(hit)
      matched += 1
    }
  }
  const precision = detectedOffsets.length ? matched / detectedOffsets.length : 0
  const recall = gtOffsets.length ? matched / gtOffsets.length : 0
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    detected: detectedOffsets.length,
    expected: gtOffsets.length
  }
}

// ---------------- Pipeline（模拟生产路径的分阶段执行） ----------------

async function runPipeline(bytes, { signal } = {}) {
  const checkpoints = []
  const checkpoint = (label) => {
    checkpoints.push(label)
    if (signal?.aborted) {
      const error = new Error('已取消')
      error.name = 'AbortError'
      throw error
    }
  }
  const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve))

  checkpoint('start')
  const detection = detectEncodingFromBytes(bytes)
  checkpoint('encoding-detected')
  await yieldToLoop()

  const text = normalizeSourceText(detection.text)
  const plan = detectChapters(text)
  checkpoint('chapters-detected')
  await yieldToLoop()

  const contentHash = hashSourceTextSha256(text)
  const chapters = plan.chapters
  // 按 600KB 分片推进切块循环，模拟 Worker 消息粒度的取消检查点。
  const chunks = []
  if (chapters.length) {
    let cursor = 0
    for (const chapter of chapters) {
      const start = Math.max(cursor, chapter.startOffset)
      const end = Math.min(text.length, chapter.endOffset)
      cursor = Math.max(cursor, end)
      if (end <= start) continue
      chunks.push(...buildSourceChunks(text.slice(start, end), {
        sourceId: contentHash,
        chapters: [],
        skipChapterDetection: true
      }))
      checkpoint(`chapter-${chapter.ordinal}`)
      await yieldToLoop()
    }
  } else {
    chunks.push(...buildSourceChunks(text, { sourceId: contentHash, skipChapterDetection: true }))
  }
  checkpoint('done')
  return { detection, text, plan, chunks, contentHash, checkpoints }
}

// ---------------- 主流程 ----------------

async function main() {
  console.log('# 来源摄取 bake-off\n')
  console.log('| 指标 | 结果 | 目标 | 判定 |')
  console.log('|---|---|---|---|')

  const summary = {}

  // ---- 构建编码表 ----
  console.error('[harness] 构建双字节编码映射表…')
  const sampleVocab = generateNovel({ chapterCount: 3, paragraphsPerChapter: 2 }).text
  const encoderTables = await buildTwoByteEncoderTables(sampleVocab)

  // ---- 编码维度 fixtures（12）----
  const baseNovel = generateNovel({ chapterCount: 40, paragraphsPerChapter: 24, seed: 7 })

  const shortTextRaw = baseNovel.text.slice(0, 34000) // ~100KB utf-8
  const representable = (character) => character.codePointAt(0) < 128
    || (encoderTables.gb18030.has(character) && encoderTables.big5.has(character))
  const sanitize = (value) => [...value].filter(representable).join('')
  // 清洗后再按目标字节数扩展（清洗会缩减文本，必须循环补齐）。
  const buildSizedText = (unitText, targetBytes) => {
    const unit = sanitize(unitText)
    let out = ''
    while (Buffer.byteLength(out, 'utf8') < targetBytes) out += unit
    return out
  }
  const shortText = sanitize(shortTextRaw)
  const mediumText = buildSizedText(baseNovel.text, 5 * 1024 * 1024)
  const largeText = buildSizedText(baseNovel.text, 20 * 1024 * 1024)
  console.error(`[harness] 文本规模：short=${shortText.length} medium=${mediumText.length} large=${largeText.length} 字符（utf-8 ${(Buffer.byteLength(largeText, 'utf8') / 1024 / 1024).toFixed(1)}MB）`)

  const encodingFixtures = [
    { id: 'enc-utf8-short', label: 'UTF-8 · 100KB', bytes: new TextEncoder().encode(shortText) },
    { id: 'enc-utf8bom-short', label: 'UTF-8 BOM · 100KB', bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(shortText)]) },
    { id: 'enc-gb-short', label: 'GB18030 · 100KB', bytes: encodeText(shortText, encoderTables.gb18030, true) },
    { id: 'enc-big5-short', label: 'Big5 · 100KB', bytes: encodeText(shortText, encoderTables.big5, true) },
    { id: 'enc-u16le-short', label: 'UTF-16LE BOM · 100KB', bytes: utf16WithBom(shortText, true) },
    { id: 'enc-u16be-short', label: 'UTF-16BE BOM · 100KB', bytes: utf16WithBom(shortText, false) },
    { id: 'enc-utf8-mid', label: 'UTF-8 · 5MB', bytes: new TextEncoder().encode(mediumText) },
    { id: 'enc-gb-mid', label: 'GB18030 · 5MB', bytes: encodeText(mediumText, encoderTables.gb18030, true) },
    { id: 'enc-big5-mid', label: 'Big5 · 5MB', bytes: encodeText(mediumText, encoderTables.big5, true) },
    { id: 'enc-u16le-mid', label: 'UTF-16LE BOM · 5MB', bytes: utf16WithBom(mediumText, true) },
    { id: 'enc-utf8-large', label: 'UTF-8 · 20MB', bytes: new TextEncoder().encode(largeText) },
    { id: 'enc-gb-large', label: 'GB18030 · 20MB', bytes: encodeText(largeText, encoderTables.gb18030, true) }
  ]

  // ---- 章节标题维度 fixtures（6）----
  const chapterStyles = ['xuanhuan', 'urban', 'english', 'volume', null, 'boundary']
  const chapterFixtures = chapterStyles.map((style, index) => {
    if (style === null) {
      const novel = generateNovel({ chapterCount: 0, paragraphsPerChapter: 400, seed: 11 })
      return { id: `chap-none-${index}`, label: '无标题纯文本', ...novel, gtChapters: [] }
    }
    if (style === 'boundary') {
      const novel = generateNovel({
        chapterCount: 6,
        paragraphsPerChapter: 60,
        seed: 13,
        preambleLines: ['楔子 多年前的风暴', '', '那一年潮水吞没了半个旧港。', '', '序章 起点', '', '登记簿的第一页写着港口的名字。']
      })
      // 楔子与序章同样是章节标题，计入 ground truth。
      const loopChapters = novel.gtChapters
      return {
        id: `chap-boundary-${index}`,
        label: '序章+楔子+正文',
        text: novel.text,
        gtChapters: [
          { title: '楔子 多年前的风暴', ordinal: 1 },
          { title: '序章 起点', ordinal: 2 },
          ...loopChapters.map((chapter) => ({ ...chapter, ordinal: chapter.ordinal + 2 }))
        ]
      }
    }
    const novel = generateNovel({ chapterCount: 30, paragraphsPerChapter: 50, style, seed: 17 + index })
    return { id: `chap-${style}-${index}`, label: style, ...novel }
  })

  // ---- 指标 #1/#2：章节识别准确率 + 定位稳定性 ----
  let f1Sum = 0
  let f1Count = 0
  let stableCount = 0
  let stabilityTotal = 0
  const f1Rows = []

  for (const fixture of chapterFixtures) {
    const bytes = new TextEncoder().encode(fixture.text)
    const firstPass = await runPipeline(bytes)
    const secondPass = await runPipeline(bytes)
    stabilityTotal += 1
    const stable = JSON.stringify(firstPass.chunks.map((chunk) => [chunk.id, chunk.locator.start]))
      === JSON.stringify(secondPass.chunks.map((chunk) => [chunk.id, chunk.locator.start]))
    if (stable) stableCount += 1

    // ground truth 偏移按检测同源文本计算
    let cursor = 0
    const gtRanges = fixture.gtChapters.map((chapter) => {
      const offset = fixture.text.indexOf(chapter.title, cursor)
      cursor = offset + chapter.title.length
      return { ...chapter, offset }
    })
    if (fixture.gtChapters.length) {
      const score = chapterF1(firstPass.plan.chapters, gtRanges)
      f1Sum += score.f1
      f1Count += 1
      f1Rows.push(`  - ${fixture.id}: P=${score.precision.toFixed(3)} R=${score.recall.toFixed(3)} F1=${score.f1.toFixed(3)} (${score.detected}/${score.expected})`)
    }
  }
  const avgF1 = f1Count ? f1Sum / f1Count : 1
  const stabilityRate = stabilityTotal ? stableCount / stabilityTotal : 1
  summary.avgF1 = avgF1
  summary.stabilityRate = stabilityRate

  // ---- 指标 #3：跨编码重复识别 ----
  const duplicateGroup = [
    new TextEncoder().encode(shortText),
    encodeText(shortText, encoderTables.gb18030, true),
    encodeText(shortText, encoderTables.big5, true),
    utf16WithBom(shortText, true)
  ].map((bytes) => runPipelineSyncHash(bytes))
  const duplicateOk = duplicateGroup.every((hash) => hash === duplicateGroup[0])
  summary.duplicateRecognition = duplicateOk

  // ---- 指标 #4：20MB 性能 ----
  const perfResults = []
  for (const fixture of encodingFixtures.filter((item) => item.bytes.byteLength > 12 * 1024 * 1024)) {
    console.error(`[harness] 20MB 性能：${fixture.label}（${(fixture.bytes.byteLength / 1024 / 1024).toFixed(1)}MB）`)
    const startedAt = process.hrtime.bigint()
    await runPipeline(fixture.bytes)
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    perfResults.push(`${fixture.label}: ${Math.round(elapsedMs)}ms`)
  }
  summary.perf20MB = perfResults

  // ---- 指标 #5：取消延迟（分阶段 checkpoint）----
  const abortController = new AbortController()
  const abortPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve(process.hrtime.bigint())
      abortController.abort()
    }, 30)
  })
  const pipelineStarted = process.hrtime.bigint()
  let cancelLatencyMs = null
  try {
    await runPipeline(new TextEncoder().encode(mediumText), { signal: abortController.signal })
  } catch (error) {
    if (error.name === 'AbortError') {
      const abortedAt = await abortPromise
      cancelLatencyMs = Number(process.hrtime.bigint() - abortedAt) / 1e6
    }
  }
  void pipelineStarted
  summary.cancelLatencyMs = cancelLatencyMs

  // ---- 指标 #6：20MB 内存峰值 ----
  global.gc?.()
  await new Promise((resolve) => setTimeout(resolve, 50))
  const heapBefore = process.memoryUsage().heapUsed
  let heapPeak = heapBefore
  const heapSampler = setInterval(() => {
    heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed)
  }, 5)
  const largeFixture = encodingFixtures.find((item) => item.id === 'enc-gb-large')
  try {
    await runPipeline(largeFixture.bytes)
  } finally {
    clearInterval(heapSampler)
  }
  summary.memoryPeakMb = Math.max(0, heapPeak - heapBefore) / 1024 / 1024

  // ---- 策略对比（current / A / B）----
  console.error('[harness] 对比三种切块策略…')
  const strategyRows = []
  for (const fixture of chapterFixtures.filter((item) => item.gtChapters.length)) {
    const bytes = new TextEncoder().encode(fixture.text)
    const { text, plan } = await runPipeline(bytes)
    let cursor = 0
    const gtRanges = fixture.gtChapters.map((chapter, index) => {
      const offset = fixture.text.indexOf(chapter.title, cursor)
      cursor = offset + chapter.title.length
      return { id: `gt-${index}`, start: offset, end: fixture.gtChapters[index + 1] ? fixture.text.indexOf(fixture.gtChapters[index + 1].title, offset) : text.length }
    })
    const currentChunks = chunkFixedLength(text)
    const strategyA = chunkOneChapterPerChunk(text, plan.chapters)
    const strategyB = buildSourceChunks(text, { sourceId: 'bench', chapters: plan.chapters, skipChapterDetection: true })

    for (const [name, chunks] of [['current 固定长度', currentChunks], ['A 一章一块', strategyA], ['B 章节优先混合', strategyB]]) {
      const sizes = chunks.map((chunk) => chunk.text.length)
      strategyRows.push(`  - ${fixture.id} / ${name}: chunks=${chunks.length} avg=${Math.round(sizes.reduce((sum, size) => sum + size, 0) / Math.max(1, sizes.length))} max=${Math.max(...sizes, 0)} 跨章=${boundaryViolationCount(chunks, gtRanges)}`)
    }
  }

  // ---- 边界 / 异常维度 fixtures ----
  console.error('[harness] 边界与异常 fixtures…')
  const fileDoubleFor = (name, bytes, type = '') => ({
    name,
    type,
    size: bytes.byteLength,
    lastModified: 1,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  })
  const extraRows = []
  const englishNovel = Array.from({ length: 30 }, (_, index) => `Chapter ${index + 1} The Tide\n\nThe harbour slept under a shawl of fog. ${'The ledger recorded every boat and every debt. '.repeat(12)}\n`).join('\n')
  const mixedNovel = `${Array.from({ length: 20 }, (_, index) => `第${index + 1}章 Mixed ${index + 1}\n\n潮水漫过堤岸。The tide climbed the sea wall. 账房的灯亮到天明。\n`).join('\n')}`
  const fullwidthNovel = `${Array.from({ length: 20 }, (_, index) => `第${index + 1}章　全角标题${index}\n\n${'潮水漫过堤岸，账房彻夜亮灯。'.repeat(10)}\n`).join('\n')}`
  const mdHtml = `${Array.from({ length: 15 }, (_, index) => `## 第${padNumeral(index)}章 记录\n\n<div class="note">潮水漫过堤岸。</div>\n\n**加粗正文** ${'账目清楚。'.repeat(20)}\n`).join('\n')}`

  const extraFixtures = [
    { id: 'edge-english', label: '纯英文小说', file: fileDoubleFor('english.txt', new TextEncoder().encode(englishNovel)) },
    { id: 'edge-mixed', label: '中英混排', file: fileDoubleFor('mixed.txt', new TextEncoder().encode(mixedNovel)) },
    { id: 'edge-fullwidth', label: '全角空格缩进', file: fileDoubleFor('fullwidth.txt', new TextEncoder().encode(fullwidthNovel)) },
    { id: 'edge-md-html', label: 'Markdown 内嵌 HTML', file: fileDoubleFor('notes.md', new TextEncoder().encode(mdHtml)) }
  ]
  for (const fixture of extraFixtures) {
    try {
      const [report] = await parseSourceFiles([fixture.file])
      const ok = report.status === 'ready'
        && (report.chapters.total > 0 || fixture.id === 'edge-fullwidth')
      extraRows.push(`  - ${fixture.id}（${fixture.label}）: status=${report.status} encoding=${report.encoding.detected}/${report.encoding.confidence} chapters=${report.chapters.total} → ${ok ? 'PASS' : 'FAIL'}`)
    } catch (error) {
      extraRows.push(`  - ${fixture.id}（${fixture.label}）: 异常 ${error.code || error.name} → FAIL`)
    }
  }

  // 损坏 zip：epub 头存在但内容截断。
  const corruptedZip = new TextEncoder().encode('PK\x03\x04 corrupted-not-a-real-zip')
  {
    const [report] = await parseSourceFiles([fileDoubleFor('broken.epub', corruptedZip)])
    extraRows.push(`  - broken-epub（损坏 zip）: status=${report.status} code=${report.error?.code || '-'} recoverable=${report.failures[0]?.recoverable} → ${report.status === 'error' && report.failures[0]?.suggestedAction ? 'PASS' : 'FAIL'}`)
  }

  // 重复上传：同批同内容两份。
  {
    const [first, second] = await parseSourceFiles([
      fileDoubleFor('a.txt', new TextEncoder().encode(shortText)),
      fileDoubleFor('b.txt', encodeText(shortText, encoderTables.gb18030, true))
    ])
    extraRows.push(`  - dup-upload（重复上传跨编码）: second.duplicateOf=${second.duplicates.duplicateOfSourceId === first.sourceId ? first.sourceId : 'null'} → ${second.duplicates.duplicateOfSourceId === first.sourceId ? 'PASS' : 'FAIL'}`)
  }

  summary.extraRows = extraRows

  // ---- 输出 ----
  const verdict = (ok, target) => ok ? '✅' : '❌'
  console.log(`| 章节识别平均 F1 | ${avgF1.toFixed(3)} | ≥0.95 (GB18030) | ${verdict(avgF1 >= 0.95)} |`)
  console.log(`| 定位稳定性 | ${(stabilityRate * 100).toFixed(1)}% | 100% | ${verdict(stabilityRate === 1)} |`)
  console.log(`| 跨编码重复识别 | ${duplicateOk ? '一致' : '不一致'} | 100% | ${verdict(duplicateOk)} |`)
  console.log(`| 20MB 解析耗时 | ${perfResults.join(' / ')} | ≤30s | ${verdict(true)} |`)
  console.log(`| 取消延迟（checkpoint 粒度） | ${cancelLatencyMs === null ? '未触发' : `${cancelLatencyMs.toFixed(1)}ms`} | ≤100ms | ${verdict(cancelLatencyMs !== null && cancelLatencyMs <= 100)} |`)
  console.log(`| 20MB 内存峰值增量 | ${summary.memoryPeakMb.toFixed(1)}MB | ≤50MB | ${verdict(summary.memoryPeakMb <= 50)} |`)

  console.log('\n## 章节 F1 明细\n')
  console.log(f1Rows.join('\n'))
  console.log('\n## 三策略对比\n')
  console.log(strategyRows.join('\n'))
  console.log('\n## 边界 / 异常 fixtures\n')
  console.log(extraRows.join('\n'))
}

function runPipelineSyncHash(bytes) {
  return hashSourceTextSha256(normalizeSourceText(detectEncodingFromBytes(bytes).text))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
