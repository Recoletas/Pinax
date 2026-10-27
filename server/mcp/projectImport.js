import fs from 'node:fs'
import path from 'node:path'
import { parseWorldbookEntryFile } from '../services/localMirrorService.js'
import { resolveProject } from './localProjects.js'
import { writeRule, writeWorldbookEntry, importChapter } from './imports.js'

// 批次 8：整目录导入。把作者既有的素材目录（任何形态）按确定性类别吃进标准目录。
// 默认只出计划（dryRun:true），落盘必须显式 dryRun:false；源目录永远只读。
// 分类只认目录名/文件名/正文标题的确定性形态，认不出的一律记账上报，不替作者编类别。

const MAX_SOURCE_FILES = 400
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 32 * 1024 * 1024

// 源目录顶层名 → 类别；Pinax 标准目录名与常见别名（kit 式）都在这里。
const CATEGORY_BY_DIR = Object.freeze({
  正文: 'chapter',
  大纲: 'outline',
  世界书: 'worldbook',
  规则: 'rule',
  约束: 'rule',
  构思: 'idea',
  资料: 'source',
  素材: 'source',
  参考: 'source',
  归档: 'source',
  日志: 'log'
})

// 项目内允许写入的顶层目录（白名单；越出即拒绝，绝不写到项目外）。
const ALLOWED_PROJECT_DIRS = new Set(['正文', '大纲', '世界书', '构思', '资料', '日志', '约束'])

const CHAPTER_HEADING = /^\s*(?:#{1,6}\s*)?(?:第\s*([0-9零一二三四五六七八九十百千两]+)\s*[章节回]\s*[·・:：、,，.。_\-—]?\s*([^\n]{0,60})|([0-9]{1,3})\s*[._\-—]\s*([^\n]{1,60}))/u
const CHAPTER_DIR_NAME = /第\s*[0-9零一二三四五六七八九十百千两]+\s*[章节回]/u
const OUTLINE_NAME = /大纲|梗概|细纲|分集|节拍/u
const PROSE_NAME = /^(?:小说|正文|原稿|初稿)(?:[.。_-].*)?$/u
const TITLE_NOISE = /^[\s·・:：、,，.。_\-—"'「」『』《》〈〉“”‘’]+|[”“‘’'「」『』《》〈〉\s]+$/gu

const CHINESE_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 两: 2 }
const KIND_BY_PREFIX = Object.freeze({
  人物: 'character', 角色: 'character', 地点: 'location', 地理: 'location', 场景: 'location',
  组织: 'organization', 势力: 'organization', 事件: 'event', 编年: 'event', 编年史: 'event',
  资料: 'source', 设定: 'general', 真相: 'general', 剧作: 'general'
})

function failure(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim()
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

/** 中文数字 → 阿拉伯数字（支持到千位；认不出返回 null，不猜）。 */
export function parseChapterNumber(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  if (/^\d+$/u.test(text)) return Number(text)
  if (!/^[零一二三四五六七八九十百千两]+$/u.test(text)) return null
  const unit = { 十: 10, 百: 100, 千: 1000 }
  let total = 0
  let current = 0
  for (const char of text) {
    if (CHINESE_DIGITS[char] !== undefined) current = CHINESE_DIGITS[char]
    else if (unit[char]) { total += (current || 1) * unit[char]; current = 0 }
    else return null
  }
  return total + current
}

function cleanTitle(value) {
  const text = normalizeText(String(value ?? '').replace(TITLE_NOISE, ''))
  return text.length >= 2 && /[^\p{P}\s]/u.test(text) ? text.slice(0, 60) : ''
}

const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/gu

/** 单个路径片段的安全化：非法字符与分隔符换成下划线，认不出安全名就返回空串。 */
function safeSegment(value) {
  const text = String(value ?? '').replace(ILLEGAL_NAME_CHARS, '_').replace(TITLE_NOISE, '').replace(/\s+/gu, ' ').trim()
  if (!text || text === '.' || text === '..') return ''
  return text.slice(0, 120)
}

/** 保留源目录层级的项目内相对名（每一段单独安全化）。 */
function safeRelative(tail, name) {
  const dirs = String(tail || '').split('/').map(safeSegment).filter(Boolean)
  const file = safeSegment(name) || '未命名'
  return [...dirs, file].join('/')
}

const BINARY_EXTENSION = /\.(?:jpg|jpeg|png|gif|webp|bmp|tiff|ico|mp3|mp4|m4a|wav|flac|aac|psd|clip|avi|mov|ttf|otf|woff2?|eot|zip|7z|rar|gz|tar|exe|dll|so|dylib|pdf|docx?|xlsx?|pptx?)$/iu
const TEXT_EXTENSION = /\.(?:md|txt|markdown|json)$/iu

function readSourceFile(file) {
  let text
  try { text = fs.readFileSync(file, 'utf-8') } catch { return null }
  if (Buffer.byteLength(text, 'utf-8') > MAX_SOURCE_FILE_BYTES) return null
  // 二进制/非文本：出现 NUL 直接判不可读，避免把乱码灌进项目。
  if (text.includes('\u0000')) return null
  return text
}

function walkSource(root, { maxDepth = 12 }) {
  const found = []
  const symlinks = []
  const tooDeep = []
  function visit(dir, depth, chain) {
    if (depth > maxDepth) { tooDeep.push(relative(root, dir)); return }
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of [...entries].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) { symlinks.push(relative(root, file)); continue }
      if (entry.isDirectory()) {
        if (entry.name === '.kb' || entry.name.startsWith('.')) continue
        // 作者目录里可能已经有桌面轨的 pinax/ 骨架（manuscript/assets/reference），不是导入对象。
        if (depth === 0 && entry.name === 'pinax') continue
        visit(file, depth + 1, [...chain, entry.name])
        continue
      }
      if (entry.isFile()) found.push({ file, relative: relative(root, file), chain: [...chain, entry.name] })
    }
  }
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) visit(root, 0, [])
  return { files: found, symlinks, tooDeep }
}

function stripExtension(name) {
  return name.replace(/\.(?:md|txt|markdown|json)$/iu, '').trim()
}

/** 从文件名/父目录/正文开头里取章节序号与标题；取不到返回 null（不编）。 */
function chapterShapeOf({ name, parents, text }) {
  const candidates = [stripExtension(name), ...parents.slice().reverse(), ...String(text || '').split('\n').slice(0, 8)]
  for (const candidate of candidates) {
    const line = String(candidate || '')
    const matched = CHAPTER_HEADING.exec(line)
    if (!matched) continue
    const number = parseChapterNumber(matched[1]) ?? parseChapterNumber(matched[3])
    const title = cleanTitle(matched[2] || matched[4] || '')
    if (number !== null || title) return { number, title: title || cleanTitle(stripExtension(line)) || line.trim().slice(0, 20) }
  }
  return null
}

function worldbookCategory(kind) {
  const map = { character: '人物', location: '地理', organization: '势力', event: '编年', source: '资料' }
  return map[String(kind || '').trim()] || '设定'
}

/** frontmatter 是否为可解析的 JSON 方言（kit 世界书用法）；不是返回 null。 */
function jsonFrontmatter(text) {
  const matched = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''))
  if (!matched) return null
  try {
    const parsed = JSON.parse(matched[1])
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function guessKind({ cleanName, parents }) {
  const prefix = String(cleanName || '').split(/[-_·]/u)[0]
  if (KIND_BY_PREFIX[prefix]) return KIND_BY_PREFIX[prefix]
  const parent = parents.slice(-1)[0]
  return KIND_BY_PREFIX[parent] || null
}

/** 单文件分类：只认确定性形态，认不出归 skip 并给出原因。 */
function classifyFile({ entry, text, worldbookMode }) {
  const name = path.posix.basename(entry.relative)
  const parents = entry.chain.slice(0, -1)
  const topDir = entry.chain[0]
  const tail = parents.length ? parents.slice(1).join('/') : ''
  const cleanName = stripExtension(name)
  const category = CATEGORY_BY_DIR[topDir]

  if (BINARY_EXTENSION.test(name)) {
    return { decision: 'skip', reason: 'binary-not-importable', detail: '图片/音视频/字体/压缩包/PDF 不是文本导入对象，保留在源目录' }
  }

  if (/\.json$/iu.test(name)) {
    let parsed = null
    try { parsed = JSON.parse(text) } catch { parsed = null }
    if (!parsed) return { decision: 'skip', reason: 'json-invalid', detail: `JSON 解析失败（${entry.relative}）` }

    if (topDir === '大纲' && cleanName.toLowerCase() === 'outline') {
      if (!Array.isArray(parsed.nodes)) {
        return { decision: 'skip', reason: 'outline-json-invalid', detail: '大纲/outline.json 缺 nodes 数组，未导入（不替作者补节点）' }
      }
      return { decision: 'outline-json', name: 'outline', target: '大纲/outline.json', nodes: parsed.nodes.length, chars: normalizeText(text).length }
    }
    if (topDir === '世界书' && /^(?:graph|manifest)$/iu.test(cleanName)) {
      return {
        decision: 'skip',
        reason: 'graph-owned-by-indexer',
        detail: `世界书/${cleanName}.json 由索引器按 世界书/ 条目重建（buildWorldbookGraphFile），不是作者可导入的事实源；导条目而不是导 graph（${entry.relative}）`
      }
    }
    if (parsed.docId && Array.isArray(parsed.chunks)) {
      return { decision: 'source-json', name: cleanName || '归档', target: `资料/归档/${safeSegment(cleanName) || '归档'}.json`, chunks: parsed.chunks.length, chars: normalizeText(text).length }
    }
    return { decision: 'skip', reason: 'json-not-routed', detail: `未识别的 JSON（${entry.relative}）；只有 大纲/outline.json 与归档格式（含 docId + chunks 数组）的 资料/归档/*.json 有固定去处，世界书/graph|manifest.json 由索引器重建、不导入` }
  }

  if (!/\.(?:md|txt|markdown)$/iu.test(name)) {
    return { decision: 'skip', reason: 'not-text', detail: '只导入 md/txt/markdown/json' }
  }

  if (category === 'worldbook') {
    const isAuxiliary = /^0\d[-_]/u.test(name) || /^(?:README|纪律|台账|章账|索引|知识图谱)$/u.test(cleanName) || /^(?:README|纪律|台账|章账)$/u.test(name)
    if (isAuxiliary) {
      return { decision: 'auxiliary', name: cleanName || '世界书辅助', target: `资料/世界书辅助/${safeSegment(cleanName) || '世界书辅助'}.md`, chars: normalizeText(text).length }
    }
    const parsed = parseWorldbookEntryFile(text)
    if (!parsed.ok) {
      const dialect = jsonFrontmatter(text)
      if (worldbookMode === 'wrap' && dialect) {
        const body = String(text).replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---/, '').replace(/^\r?\n+/, '').trim()
        if (!body) return { decision: 'skip', reason: 'worldbook-empty-body', detail: `世界书条目正文为空（${entry.relative}）` }
        const kind = guessKind({ cleanName, parents }) || 'general'
        const wrappedName = cleanTitle(String(dialect.title || '')) || cleanName
        const categoryDir = worldbookCategory(kind)
        return {
          decision: 'worldbook',
          wrapped: true,
          name: wrappedName,
          categoryDir,
          type: kind,
          target: `世界书/${categoryDir}/${safeSegment(wrappedName)}.md`,
          id: null,
          keys: Array.isArray(dialect.tags) ? dialect.tags.map((v) => String(v)).filter(Boolean).slice(0, 50) : [],
          tags: Array.isArray(dialect.tags) ? dialect.tags.map((v) => String(v)).filter(Boolean).slice(0, 50) : [],
          summary: cleanTitle(String(dialect.summary || '')),
          body,
          chars: body.length
        }
      }
      return {
        decision: 'skip',
        reason: 'worldbook-not-conform',
        code: parsed.error?.code || 'PARSE_FAILED',
        detail: worldbookMode === 'wrap'
          ? `世界书条目不合契约 v2 且 frontmatter 不是可解析的 JSON 方言（${parsed.error?.message || '解析失败'}）；请用 pinax_worldbook_write 按作者给定文本重写`
          : `世界书条目不合契约 v2（${parsed.error?.message || '解析失败'}）；strict 模式不改写作者文本。frontmatter 是 JSON 方言的可用 worldbookMode:"wrap" 重跑，或单条用 pinax_worldbook_write`
      }
    }
    const entryName = cleanTitle(parsed.entry.name) || cleanName
    const categoryDir = worldbookCategory(parsed.entry.kind)
    return {
      decision: 'worldbook',
      name: entryName,
      categoryDir,
      target: `世界书/${categoryDir}/${safeSegment(entryName)}.md`,
      type: String(parsed.entry.kind || 'general'),
      id: parsed.entry.id || null,
      keys: Array.isArray(parsed.entry.keys) ? parsed.entry.keys.slice(0, 50) : [],
      tags: Array.isArray(parsed.entry.tags) ? parsed.entry.tags.slice(0, 50) : [],
      summary: parsed.entry.summary || '',
      body: String(parsed.entry.content || ''),
      chars: String(parsed.entry.content || '').length
    }
  }

  if (category === 'rule') {
    if (parents.length > 1) return { decision: 'skip', reason: 'rule-nested', detail: `约束只认单层文件（${entry.relative}）；请把内容并入一个文件或放到项目 约束/ 下` }
    return { decision: 'rule', name: cleanName, target: `约束/${safeSegment(cleanName)}.md`, chars: normalizeText(text).length }
  }

  const inChapterDir = parents.some((dir) => CHAPTER_DIR_NAME.test(dir))
  if (category === 'chapter' || (!category && inChapterDir && PROSE_NAME.test(name))) {
    const shape = chapterShapeOf({ name, parents, text })
    if (!shape) {
      return { decision: 'skip', reason: 'chapter-unidentified', detail: `认不出章节序号与标题（${entry.relative}）；正文需要 第N章 标题或 NNN-标题 形态（文件名、章节目录名或正文开头任一命中），不替作者编号` }
    }
    if (!shape.number) {
      return { decision: 'skip', reason: 'chapter-unnumbered', detail: `有标题但认不出序号（${entry.relative}）；确认后请用 pinax_chapter_import 指定 chapterNumber` }
    }
    return { decision: 'chapter', number: shape.number, title: shape.title || `第${shape.number}章`, target: `正文/${String(shape.number).padStart(3, '0')}-${safeSegment(shape.title || `第${shape.number}章`)}.md`, chars: normalizeText(text).length }
  }

  // 章节目录里的非正文兄弟（剧本/分镜/导演小记/提示词等衍生品）→ 资料/章节衍生/。
  if (inChapterDir) {
    const chapterDir = parents.slice().reverse().find((dir) => CHAPTER_DIR_NAME.test(dir))
    return {
      decision: 'material',
      name: cleanName,
      target: `资料/章节衍生/${safeSegment(chapterDir)}/${safeSegment(cleanName) || '衍生品'}.md`,
      chars: normalizeText(text).length,
      note: '章节目录内的非正文衍生品（剧本/分镜/提示词等），按 资料/ 收录；不想收可用 exclude 排除'
    }
  }

  if (category === 'outline' || (!category && OUTLINE_NAME.test(name))) {
    return { decision: 'outline', name: cleanName, target: `大纲/${safeRelative(tail, cleanName)}.md`, chars: normalizeText(text).length }
  }
  if (category === 'idea') return { decision: 'idea', name: cleanName, target: `构思/${safeRelative(tail, cleanName)}.md`, chars: normalizeText(text).length }
  if (category === 'source') return { decision: 'source', name: cleanName, target: `资料/${safeRelative(tail, cleanName)}.md`, chars: normalizeText(text).length }
  if (category === 'log') return { decision: 'log', name: cleanName, target: `日志/${safeRelative(tail, cleanName)}.md`, chars: normalizeText(text).length }

  return {
    decision: 'skip',
    reason: 'unmapped',
    detail: `顶层目录「${topDir || path.posix.dirname(entry.relative)}」与文件名都没有固定类别（${entry.relative}）；需要导入请归入 正文/大纲/世界书/规则|约束/构思|素材/资料/日志 之一，或让章节文件位于 第N章-标题/ 目录并命名为 小说.md`
  }
}

function projectTarget(root, target) {
  if (!target || typeof target !== 'string') throw failure('ERR_TARGET_MISSING', '缺少目标路径，未写入。')
  if (target.includes('\\') || target.includes(':')) throw failure('ERR_TARGET_INVALID', `目标路径非法：${target}`)
  const segments = target.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw failure('ERR_TARGET_INVALID', `目标路径含越界片段：${target}`)
  if (!ALLOWED_PROJECT_DIRS.has(segments[0])) throw failure('ERR_TARGET_FORBIDDEN', `只允许写入项目标准目录（${[...ALLOWED_PROJECT_DIRS].join('/')}）：${target}`)
  const absolute = path.resolve(root, segments.join(path.sep))
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (!absolute.toLowerCase().startsWith(prefix.toLowerCase())) throw failure('ERR_TARGET_OUTSIDE', `目标越出项目根：${target}`)
  return absolute
}

/** 大纲/构思/资料/日志/JSON 归档：受控落盘（幂等：同内容复用，不同内容默认拒绝）。 */
function writeControlledFile({ root, target, text, overwrite }) {
  const absolute = projectTarget(root, target)
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
    const existing = fs.readFileSync(absolute, 'utf-8').replace(/\r\n?/g, '\n').trim()
    if (existing === text) return { created: false, reused: true, warnings: ['目标已存在且内容相同，未重复写入。'] }
    if (!overwrite) throw failure('ERR_FILE_EXISTS', `${target} 已存在且内容不同；确认覆盖请传 overwrite:true。`)
    fs.writeFileSync(absolute, `${text}\n`, 'utf-8')
    return { created: false, reused: false, warnings: ['已覆盖目标文件。'] }
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, `${text}\n`, { encoding: 'utf-8', flag: 'wx' })
  return { created: true, reused: false, warnings: [] }
}

/** 整目录导入：先出计划，dryRun:false 才落盘。落盘复用既有单文件写工具，不重写落盘规则。 */
export function importFolder({
  projectPath,
  projectId,
  sourcePath,
  dryRun = true,
  overwrite = false,
  maxFiles = MAX_SOURCE_FILES,
  include,
  exclude,
  worldbookMode = 'strict'
} = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const requestedSource = typeof sourcePath === 'string' ? sourcePath.trim() : ''
  if (!requestedSource) throw failure('ERR_SOURCE_REQUIRED', '请提供 sourcePath（要导入的目录绝对路径）。')
  if (!path.isAbsolute(requestedSource)) throw failure('ERR_PATH_NOT_ABSOLUTE', 'sourcePath 必须是绝对路径。')
  if (requestedSource.includes('..')) throw failure('ERR_PATH_INVALID', 'sourcePath 不允许包含 ..。')
  const mode = String(worldbookMode || 'strict').trim().toLowerCase()
  if (mode !== 'strict' && mode !== 'wrap') throw failure('ERR_WORLDBOOK_MODE', 'worldbookMode 只能是 strict 或 wrap。')
  const sourceRoot = path.resolve(requestedSource)
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw failure('ERR_DIR_NOT_FOUND', `源目录不存在或不是目录：${sourceRoot}`)
  }
  if (sourceRoot.toLowerCase() === resolved.root.toLowerCase()) {
    throw failure('ERR_SOURCE_IS_PROJECT', 'sourcePath 不能就是项目文件夹本身；请指向作者的素材目录。')
  }

  const limit = Math.max(1, Math.min(2000, Number(maxFiles) || MAX_SOURCE_FILES))
  const includePatterns = (Array.isArray(include) ? include : []).map((p) => String(p)).filter(Boolean)
  const excludePatterns = (Array.isArray(exclude) ? exclude : []).map((p) => String(p)).filter(Boolean)
  const hits = (list, file) => list.some((pattern) => file.includes(pattern))

  const scanned = walkSource(sourceRoot, { maxDepth: 12 })
  const plan = []
  const skipped = []
  let bytesSeen = 0
  let considered = 0

  for (const entry of scanned.files) {
    if (considered >= limit) { skipped.push({ file: entry.relative, reason: 'over-limit', detail: `已达 maxFiles=${limit}，其余未处理` }); continue }
    if (includePatterns.length && !hits(includePatterns, entry.relative)) { skipped.push({ file: entry.relative, reason: 'filtered-out', detail: '按 include 白名单排除' }); continue }
    if (excludePatterns.length && hits(excludePatterns, entry.relative)) { skipped.push({ file: entry.relative, reason: 'filtered-out', detail: '按 exclude 排除' }); continue }
    const baseName = path.posix.basename(entry.relative)
    if (BINARY_EXTENSION.test(baseName)) {
      skipped.push({ file: entry.relative, reason: 'binary-not-importable', detail: '图片/音视频/字体/压缩包/PDF 不是文本导入对象，保留在源目录' })
      continue
    }
    if (!TEXT_EXTENSION.test(baseName)) {
      skipped.push({ file: entry.relative, reason: 'not-text', detail: '只导入 md/txt/markdown/json' })
      continue
    }
    let stat
    try { stat = fs.statSync(path.join(sourceRoot, entry.relative)) } catch { continue }
    if (stat.size > MAX_SOURCE_FILE_BYTES) {
      skipped.push({ file: entry.relative, reason: 'file-too-large', detail: `超过 ${MAX_SOURCE_FILE_BYTES} 字节单文件上限` })
      continue
    }
    if (bytesSeen + stat.size > MAX_TOTAL_BYTES) {
      skipped.push({ file: entry.relative, reason: 'total-too-large', detail: `累计超过 ${MAX_TOTAL_BYTES} 字节上限` })
      continue
    }
    considered++
    bytesSeen += stat.size
    const text = readSourceFile(path.join(sourceRoot, entry.relative))
    if (text === null) { skipped.push({ file: entry.relative, reason: 'unreadable', detail: '读取失败、超限或含二进制字节' }); continue }
    const classified = classifyFile({ entry, text, worldbookMode: mode })
    if (classified.decision === 'skip') {
      skipped.push({ file: entry.relative, reason: classified.reason, code: classified.code || null, detail: classified.detail || '' })
      continue
    }
    plan.push({
      source: entry.relative,
      bytes: stat.size,
      chars: classified.chars ?? normalizeText(text).length,
      ...classified,
      text
    })
  }

  // 同源内容收敛：规则/约束 双写、世界书 平铺原文与副本 都在这一步合并，只留第一份。
  const seenContent = new Map()
  const seenTarget = new Map()
  const deduped = []
  const collapsed = []
  for (const item of plan) {
    const key = normalizeText(item.text)
    if (!key) { collapsed.push({ file: item.source, reason: 'empty-file', kept: null }); continue }
    const bodyKey = item.decision === 'worldbook' ? `wb:${item.name}:${normalizeText(item.body)}` : key
    const holder = seenContent.get(bodyKey)
    if (holder) { collapsed.push({ file: item.source, reason: 'duplicate-content', kept: holder }); continue }
    const targetKey = item.decision === 'chapter'
      ? `正文#${item.number ?? 'auto'}`
      : `${item.target || item.decision}:${item.name || item.source}`
    const previous = seenTarget.get(targetKey)
    if (previous) { collapsed.push({ file: item.source, reason: 'same-slot', kept: previous }); continue }
    seenContent.set(bodyKey, item.source)
    seenTarget.set(targetKey, item.source)
    deduped.push(item)
  }

  const byDecision = {}
  for (const item of deduped) byDecision[item.decision] = (byDecision[item.decision] || 0) + 1
  const byReason = {}
  for (const item of skipped) byReason[item.reason] = (byReason[item.reason] || 0) + 1

  const warnings = [
    '正文/ 与 大纲/ 不在 RAG 输入集（世界书/资料/规则/约束/文风）里；要让 Agent 查到设定，需要 世界书 与 约束 有内容并跑 pinax_project_index。',
    '源目录只读：本工具不写、不改、不删 sourcePath 下的任何文件。'
  ]
  const ragInputs = deduped.filter((item) => /^(?:世界书|资料|约束|规则)\//.test(String(item.target || ''))).length
  if (ragInputs > 400) warnings.push(`会进 RAG 的文件已有 ${ragInputs} 个：索引器在 500 张卡 / 2000 文件处整次拒绝（KNOWLEDGE_LIMIT），建议用 exclude 分批导入。`)
  if (scanned.symlinks.length) warnings.push(`源目录含 ${scanned.symlinks.length} 个符号链接，已跳过（知识索引遇到符号链接会整次拒绝）。`)
  if (scanned.tooDeep.length) warnings.push(`源目录有 ${scanned.tooDeep.length} 处层级超过 12 层，已跳过。`)
  if (byReason['worldbook-not-conform']) warnings.push(`有 ${byReason['worldbook-not-conform']} 个世界书文件不合契约 v2；若其 frontmatter 是 JSON 方言，可传 worldbookMode:"wrap" 用作者原文重跑（名称取 frontmatter.title，类型取文件名前缀）。`)
  if (dryRun) warnings.unshift('当前是计划模式（dryRun 默认 true），未写入任何文件；核对 items 的 target 后传 dryRun:false 落盘。')

  const report = {
    mode: dryRun ? 'plan' : 'apply',
    sourceRoot,
    project: { projectId: resolved.manifest?.projectId || null, name: resolved.manifest?.name || null, rootPath: resolved.root },
    scanned: scanned.files.length,
    considered,
    bytes: bytesSeen,
    importable: deduped.length,
    collapsedCount: collapsed.length,
    skippedCount: skipped.length,
    decisions: byDecision,
    skipReasons: byReason,
    items: deduped.map((item) => ({
      source: item.source,
      decision: item.decision,
      target: item.target,
      name: item.name || null,
      number: item.number ?? null,
      title: item.title ?? null,
      type: item.type ?? null,
      categoryDir: item.categoryDir ?? null,
      wrapped: item.wrapped === true || undefined,
      note: item.note || null,
      chars: item.chars
    })),
    skipped,
    collapsed,
    written: [],
    writeFailures: [],
    next: deduped.length
      ? (dryRun
        ? ['核对 items 的 decision 与 target', '需要调整类别就用 include/exclude 再跑一次计划', '传 dryRun:false 落盘', '跑 pinax_project_index 同步 RAG']
        : ['跑 pinax_project_index 同步 RAG', '用 project-bootstrap 状态卡复核剩余问题'])
      : ['没有可导入文件：按 skipped 的 reason 处置源目录或改 include/exclude']
  }
  if (dryRun) return report

  for (const item of deduped) {
    const text = normalizeText(item.text)
    try {
      if (item.decision === 'rule') {
        const result = writeRule({ projectPath: resolved.root, name: item.name, content: text, overwrite })
        report.written.push({ source: item.source, target: result.file, created: Boolean(result.created), reused: Boolean(result.reused), warnings: result.warnings || [] })
      } else if (item.decision === 'worldbook') {
        const result = writeWorldbookEntry({
          projectPath: resolved.root,
          name: item.name,
          content: item.body || text,
          type: item.type,
          id: item.id || undefined,
          keys: item.keys,
          tags: item.tags,
          summary: item.summary || undefined,
          overwrite
        })
        report.written.push({ source: item.source, target: result.file, created: Boolean(result.created), reused: Boolean(result.reused), warnings: result.warnings || [] })
      } else if (item.decision === 'chapter') {
        const result = importChapter({
          projectPath: resolved.root,
          title: item.title || `第${item.number}章`,
          content: text,
          chapterNumber: item.number,
          overwrite
        })
        report.written.push({ source: item.source, target: result.chapter?.file || null, created: Boolean(result.created), reused: Boolean(result.reused), warnings: result.warnings || [] })
      } else {
        const written = writeControlledFile({ root: resolved.root, target: item.target, text, overwrite })
        report.written.push({ source: item.source, target: item.target, created: written.created, reused: written.reused, warnings: written.warnings })
      }
    } catch (error) {
      const record = { source: item.source, target: item.target || null, reason: 'write-failed', code: error.code || 'ERR_WRITE_FAILED', detail: String(error.message || error) }
      report.writeFailures.push(record)
      skipped.push(record)
    }
  }
  report.writtenCount = report.written.length
  report.createdCount = report.written.filter((item) => item.created).length
  report.reusedCount = report.written.filter((item) => item.reused).length
  report.failedCount = report.writeFailures.length
  report.skipReasons = { ...byReason }
  for (const record of report.writeFailures) report.skipReasons[record.code || 'write-failed'] = (report.skipReasons[record.code || 'write-failed'] || 0) + 1
  report.skipped = skipped
  report.skippedCount = skipped.length
  if (report.failedCount) warnings.push(`有 ${report.failedCount} 个文件写入失败，见 writeFailures；修正后重跑即可（已写入的不受影响）。`)
  return report
}
