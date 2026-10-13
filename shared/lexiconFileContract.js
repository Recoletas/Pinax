/**
 * 词汇表文件契约（pinax-lexicon@1）——项目根「词汇表.json」三段式。
 *
 * 设计账：docs/plan/lexicon-style-quantification-survey-20261009.md §3.1/§3.2。
 * 文件即真相：模块化资料在本地文件夹用 md/json 归纳存储，前端只负责可视化；
 * agent 侧经服务端 readLexicon 读回，编译成紧凑指令段注入 kernel（复用 local-rules
 * 块预算，不新增块类型）。三段式：
 * - banned: [{ word, level: 1|2, note }]——一级=零容忍（任何位置不得出现）；二级=单段 ≤3 次配额。
 * - own:    [{ word, note }]——本书专有词，产物应使用。
 * - canon:  [{ term, aliases[], ref }]——专名口径：正名 + 禁用别名（Pinax 扩展段，kit 无此字段）。
 *
 * 容错纪律（对齐 worldbookFileContract/outlineView 读侧）：损坏/缺字段→空数组+warnings，
 * 绝不抛错；全空串/非对象项过滤。纯函数、零依赖，node 冒烟可直接 import。
 */

export const LEXICON_FORMAT = 'pinax-lexicon@1'
/** 项目根词汇表文件名（固定，不随项目名变）。 */
export const LEXICON_FILE_NAME = '词汇表.json'
/** compileLexiconPrompt 产物预算（字符）；超限按级别裁剪：一级全保、二级只留计数。 */
export const LEXICON_PROMPT_BUDGET = 700

function text(value) {
  return String(value ?? '').trim()
}

function normalizeBannedEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const word = text(raw.word)
  if (!word) return null
  return { word, level: Number(raw.level) === 1 ? 1 : 2, note: text(raw.note) }
}

function normalizeOwnEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const word = text(raw.word)
  if (!word) return null
  return { word, note: text(raw.note) }
}

function normalizeCanonEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const term = text(raw.term)
  if (!term) return null
  const aliases = [...new Set((Array.isArray(raw.aliases) ? raw.aliases : [])
    .map((alias) => text(alias))
    .filter(Boolean))]
  return { term, aliases, ref: text(raw.ref) }
}

function normalizeSections(source) {
  const sections = source && typeof source === 'object' ? source : {}
  const pick = (key, normalize) => (Array.isArray(sections[key]) ? sections[key] : [])
    .map(normalize)
    .filter(Boolean)
  return { banned: pick('banned', normalizeBannedEntry), own: pick('own', normalizeOwnEntry), canon: pick('canon', normalizeCanonEntry) }
}

/** 组装词汇表文件文本：2 空格缩进 JSON + 尾换行（canonical 落盘形状）。 */
export function buildLexiconFile({ project = '', banned = [], own = [], canon = [] } = {}) {
  const { banned: bannedOut, own: ownOut, canon: canonOut } = normalizeSections({ banned, own, canon })
  const file = {
    format: LEXICON_FORMAT,
    project: text(project),
    banned: bannedOut,
    own: ownOut,
    canon: canonOut
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * 容错解析词汇表文件文本（或已解析对象）：
 * → { format, project, exists, banned, own, canon, warnings }。
 * - 空串/空白 → exists:false（调用方 fail-open 当无文件）。
 * - 损坏 JSON / 非对象 → exists:true + 空数组 + warning（文件在但读不出结构）。
 * - format 缺失/不一致 → warning-only，仍按字段尽力读取。
 */
export function parseLexiconFile(raw) {
  if (typeof raw === 'string' && !raw.trim()) {
    return { format: '', project: '', exists: false, banned: [], own: [], canon: [], warnings: [] }
  }
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        format: '', project: '', exists: true, banned: [], own: [], canon: [],
        warnings: [`${LEXICON_FILE_NAME} 不是有效 JSON，已按空词表处理。`]
      }
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      format: '', project: '', exists: true, banned: [], own: [], canon: [],
      warnings: [`${LEXICON_FILE_NAME} 结构不符合预期（顶层应为对象），已按空词表处理。`]
    }
  }
  const warnings = []
  const format = typeof parsed.format === 'string' ? parsed.format.trim() : ''
  if (!format) warnings.push(`${LEXICON_FILE_NAME} 缺少 format 字段，已按字段尽力读取。`)
  else if (format !== LEXICON_FORMAT) warnings.push(`${LEXICON_FILE_NAME} format=${format} 与当前支持 ${LEXICON_FORMAT} 不一致，已按字段尽力读取。`)
  const sections = normalizeSections(parsed)
  return {
    format,
    project: typeof parsed.project === 'string' ? parsed.project.trim() : '',
    exists: true,
    ...sections,
    warnings
  }
}

/**
 * 编译词汇表为紧凑中文指令串（注入 kernel local-rules 块的「词汇表」段）：
 * 禁用一级词=零容忍列表；二级词=「单段 ≤3」配额提示；own=「产物应使用」；
 * canon=正名→禁用别名对照。空段省略；整体 ≤ LEXICON_PROMPT_BUDGET 字符，
 * 超限按级别裁剪（一级全保，二级降为计数，再降 own/canon 细节，最后硬截断）。
 * 空词表 → ''（调用方省略整段）。
 */
export function compileLexiconPrompt(lexicon) {
  const { banned, own, canon } = normalizeSections(lexicon)
  const level1 = banned.filter((item) => item.level === 1)
  const level2 = banned.filter((item) => item.level !== 1)

  const build = ({ level2CountOnly = false, ownNotes = true, canonAliases = true } = {}) => {
    const segments = []
    if (level1.length) segments.push(`禁用一级词（零容忍，正文任何位置不得出现）：${level1.map((item) => item.word).join('、')}。`)
    if (level2.length) {
      segments.push(level2CountOnly
        ? `禁用二级词共 ${level2.length} 个：单段各 ≤3 次。`
        : `禁用二级词（单段各 ≤3 次）：${level2.map((item) => item.word).join('、')}。`)
    }
    if (own.length) {
      segments.push(ownNotes
        ? `本书专用词（行文应使用）：${own.map((item) => (item.note ? `${item.word}（${item.note}）` : item.word)).join('、')}。`
        : `本书专用词（行文应使用）：${own.map((item) => item.word).join('、')}。`)
    }
    if (canon.length) {
      segments.push(canonAliases
        ? `专名口径：${canon.map((item) => (item.aliases.length ? `${item.term}→禁用别名 ${item.aliases.join('/')}` : item.term)).join('；')}。`
        : `专名口径：${canon.map((item) => item.term).join('、')}。`)
    }
    return segments.join('')
  }

  // 裁剪阶梯：全量 → 二级只留计数 → own 去备注 → canon 去别名 → 硬截断。一级词在每级都全保。
  const ladder = [
    {},
    { level2CountOnly: true },
    { level2CountOnly: true, ownNotes: false },
    { level2CountOnly: true, ownNotes: false, canonAliases: false }
  ]
  for (const options of ladder) {
    const candidate = build(options)
    if (candidate.length <= LEXICON_PROMPT_BUDGET) return candidate
  }
  return build({ level2CountOnly: true, ownNotes: false, canonAliases: false }).slice(0, LEXICON_PROMPT_BUDGET)
}

export default {
  LEXICON_FORMAT,
  LEXICON_FILE_NAME,
  LEXICON_PROMPT_BUDGET,
  buildLexiconFile,
  parseLexiconFile,
  compileLexiconPrompt
}
