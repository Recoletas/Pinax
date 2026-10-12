/**
 * 章回结算服务（W5·B5）——kit 体系标准「章回结算五件」的 Pinax 侧纯逻辑实现。
 *
 * 体系标准：storyflow-kit knowledge/continuity/worldbook.md §三（结算五件表）与 §四
 * （RAG 规则：下一章写手只读章账末节=handoff）；文案基准 = shared/worldbookFileContract.js
 * buildWorldbookAuxFiles（章账/伏笔台账骨架）与 kit tools/worldbook.py DISCIPLINE。
 *
 * 红线（工单 W5）：
 * - 外围禁直写正文：本模块只产世界书侧数据（章账/人物状态/交接/伏笔台账/世界揭示清单），
 *   绝不接触章节正文；所有写入都经 applyChapterSettlement 的显式调用（草案→确认→写入），
 *   settlementFromTurn 只返回草案，零副作用。
 * - 静态档案段（背景/性格/外貌等）不可被 advanceCharacterState 改写——只动
 *   【当前状态】（改写）与【变动史】（追加）两个滚动段。
 * - 底牌（status:draft + 底牌标记）永不入正文：isCovertCardEntry 供注入端显式排除。
 *
 * 数据可得性（B4 之前的资料形态）：章账/伏笔台账以「结算条目」形态随 worldStore 走
 * （A3 双写接缝自动落盘到项目世界书目录）；文件侧骨架件不存在对应条目时，结算从
 * buildWorldbookAuxFiles 的骨架文案起步（幂等、不造新数据源）。
 *
 * 本模块零 Vue/store 依赖；写入侧经注入的 repository 接口（页面装配 worldStore，
 * 冒烟注入内存 mock），node 直载可测。
 */
import { buildWorldbookAuxFiles } from '../../../shared/worldbookFileContract.js'

/* ---------- 结算条目（章账/伏笔台账的运行时载体） ---------- */

/**
 * 结算条目名（=文件名，A3 同步落盘位置）：
 * - 章账 type=event → 世界书/编年/章账（结算）.md（编年域，kit 章账同域）；
 * - 伏笔台账 type=general → 世界书/设定/伏笔台账（结算）.md。
 * 刻意不与体系标准骨架件路径（编年/章账.md、伏笔/台账.md）重名：A2 读侧 aux-skip
 * 会跳过骨架路径，重名条目在文件优先加载时会从运行时消失（实测 server 读侧规则）。
 */
export const CHAPTER_LEDGER_ENTRY_NAME = '章账（结算）'
export const FORESHADOW_LEDGER_ENTRY_NAME = '伏笔台账（结算）'

/** 结算条目的 frontmatter 标记（extra.auxRole 双保险：改名后仍可识别） */
export const LEDGER_AUX_ROLES = { chapter: 'chapter-ledger', foreshadow: 'foreshadow-ledger' }

/** 章账骨架文案（与 A2 骨架件同源，结算从骨架起步） */
export function chapterLedgerSkeleton({ variant = 'novel' } = {}) {
  return buildWorldbookAuxFiles({ variant })['编年/章账.md']
}

/** 伏笔台账骨架文案 */
export function foreshadowLedgerSkeleton() {
  return buildWorldbookAuxFiles()['伏笔/台账.md']
}

function entryNameOf(entry) {
  return String(entry?.name ?? entry?.title ?? '').trim()
}

/** 章账结算条目判定（按名 + auxRole 双通道；普通条目永不误伤） */
export function isChapterLedgerEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  return entryNameOf(entry) === CHAPTER_LEDGER_ENTRY_NAME
    || String(entry?.extra?.auxRole ?? '') === LEDGER_AUX_ROLES.chapter
}

/** 伏笔台账结算条目判定 */
export function isForeshadowLedgerEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  return entryNameOf(entry) === FORESHADOW_LEDGER_ENTRY_NAME
    || String(entry?.extra?.auxRole ?? '') === LEDGER_AUX_ROLES.foreshadow
}

/* ---------- 底牌（永不入正文；注入端显式排除的判定真源） ---------- */

/**
 * 底牌条目判定：status:'draft' 且带底牌标记（cat/tags 含「底牌」，或名为暗线底牌/底牌）。
 * kit 红线：底牌/暗线底牌.md status:draft 永不入正文；骨架件本身无 cat 字段、
 * 以 tags [底牌, 暗线] 标记，故 tags/名同样是有效信号（宁可多挡，不可漏放）。
 */
export function isCovertCardEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const status = String(entry.status ?? '').trim().toLowerCase()
  if (status !== 'draft') return false
  const catList = Array.isArray(entry.cat)
    ? entry.cat.map((item) => String(item ?? ''))
    : (entry.cat ? [String(entry.cat)] : [])
  if (catList.some((item) => item.includes('底牌'))) return true
  const tagList = Array.isArray(entry.tags) ? entry.tags.map((item) => String(item ?? '')) : []
  if (tagList.some((item) => item.includes('底牌'))) return true
  const name = entryNameOf(entry)
  return name.includes('暗线底牌') || name.includes('底牌')
}

/* ---------- 章账（ledger 文本变换：string in → string out，纯函数） ---------- */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [items])
    .map((item) => String(item ?? '').replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
}

function appendSection(ledger, heading, bodyLines) {
  const base = String(ledger ?? '').replace(/\s+$/, '')
  const prefix = base ? `${base}\n\n` : ''
  return `${prefix}${heading}\n\n${bodyLines.join('\n')}\n`
}

/**
 * 章卡追加（结算件 1：一句话+梗点+钩型+新名目 → 章账一节）。
 * - 同名章节（heading 以 chapterTitle 开头）已存在 → 原样返回（幂等，防双击重复结算）。
 * - summary/hook/newTerms 缺省字段不产出行；chapterTitle 必填（空 → 原样返回）。
 */
export function appendChapterCard(ledger, { chapterTitle, summary = '', hook = '', newTerms = [] } = {}) {
  const title = String(chapterTitle ?? '').trim()
  if (!title) return String(ledger ?? '')
  const headingRe = new RegExp(`^##\\s*${escapeRegExp(title)}(?:[^\\n]*)$`, 'm')
  if (headingRe.test(String(ledger ?? ''))) return String(ledger ?? '')
  const terms = normalizeItems(newTerms)
  const lines = []
  if (String(summary ?? '').trim()) lines.push(`- 一句话：${String(summary).trim()}`)
  if (String(hook ?? '').trim()) lines.push(`- 梗点/钩子：${String(hook).trim()}`)
  if (terms.length) lines.push(`- 新名目：${terms.join('、')}`)
  if (!lines.length) lines.push('- （待补）')
  return appendSection(ledger, `## ${title}（章卡）`, lines)
}

/** 交接条数下限（kit：下一章写手必知的 3-5 条） */
export const HANDOFF_MIN_ITEMS = 3
export const HANDOFF_MAX_ITEMS = 5

/**
 * 交接追加（结算件 3：3-5 条 → 章账末节=handoff）。
 * - 条数 <3 → 原样返回（交接语义不达标的章节不产生伪 handoff）；
 * - >5 条截前 5；末节语义 = 追加的这节就是最后一节（kit：只读末节）；
 * - 同章重结算（同标题交接节已存在）→ 原位替换该节正文，不产生重复交接节；
 * - options.chapterTitle 用于节标题（「交接 · 第N章」，可省）。
 */
export function appendHandoff(ledger, items, { chapterTitle = '' } = {}) {
  const normalized = normalizeItems(items).slice(0, HANDOFF_MAX_ITEMS)
  if (normalized.length < HANDOFF_MIN_ITEMS) return String(ledger ?? '')
  const title = String(chapterTitle ?? '').trim()
  const heading = title ? `## 交接 · ${title}（下一章 handoff）` : '## 交接（下一章 handoff）'
  const body = normalized.map((item) => `- ${item.replace(/\n+/g, ' ')}`).join('\n')
  const text = String(ledger ?? '').replace(/\r\n/g, '\n')
  const headingRe = new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'm')
  const existing = headingRe.exec(text)
  if (existing) {
    // 原位替换：从标题行后到下一节标题（或文末）整段换成新交接
    const valueStart = existing.index + heading.length
    const nextRe = /^##[^\n]*$/gm
    nextRe.lastIndex = valueStart
    const next = nextRe.exec(text)
    const end = next ? next.index : text.length
    const tail = end < text.length ? `\n\n${text.slice(end)}` : '\n'
    return `${text.slice(0, valueStart)}\n\n${body}${tail}`
  }
  return appendSection(text, heading, normalized.map((item) => `- ${item.replace(/\n+/g, ' ')}`))
}

/**
 * 章账末节提取（kit §四：下一章写手只读末节=handoff）。
 * 返回最后一个 `## ` 节的正文（不含标题行）；无节 → ''。章账以结算条目形态存在时，
 * 注入端用它把「末节」送进上下文，非末节历史绝不进。
 */
export function extractHandoffSection(ledger) {
  const text = String(ledger ?? '').replace(/\r\n/g, '\n')
  const headingRe = /^##[^\n]*$/gm
  let last = null
  let match
  while ((match = headingRe.exec(text))) {
    last = { start: match.index + match[0].length, heading: match[0] }
    headingRe.lastIndex = match.index + match[0].length
  }
  if (!last) return ''
  return text.slice(last.start, text.length).trim()
}

/* ---------- 人物状态推进（结算件 2：当前状态改写 + 变动史追加） ---------- */

export const CHARACTER_STATE_LABEL = '当前状态'
export const CHARACTER_HISTORY_LABEL = '变动史'

/** 滚动维度（kit：伤/钱/知情/关系/位置）——静态档案段（背景/性格/外貌）永不在此列 */
export const CHARACTER_STATE_DIMENSIONS = [
  { key: 'injury', label: '伤势' },
  { key: 'money', label: '财物' },
  { key: 'knowledge', label: '知情' },
  { key: 'relations', label: '关系' },
  { key: 'location', label: '位置' }
]

const LABELED_BLOCK_NEXT_RE = /^【([^】\n]{1,40})】[ \t]?/gm

function findLabeledBlock(text, label) {
  const re = new RegExp(`^【(${escapeRegExp(label)})】[ \t]?`, 'm')
  const match = re.exec(text)
  if (!match) return null
  const valueStart = match.index + match[0].length
  // 下一块定位必须带 g（lastIndex 才生效），从本块值起点向后找，避免回卷到文首
  const nextRe = new RegExp(LABELED_BLOCK_NEXT_RE.source, 'gm')
  nextRe.lastIndex = valueStart
  const next = nextRe.exec(text)
  const end = next ? next.index : text.length
  return { start: match.index, valueStart, end, value: text.slice(valueStart, end) }
}

function replaceBlockValue(text, block, nextValue) {
  return `${text.slice(0, block.valueStart)}${nextValue}${text.slice(block.end)}`
}

/**
 * 正文标签块的定位手术写回（表格对「未建档行」的编辑口径，与 advanceCharacterState 同一套
 * 底层件：findLabeledBlock + replaceBlockValue）：
 * - 有该【标签】块 → 只替换块值，其余字节原样（块值后的原有换行保留，缺失则补一个换行）；
 * - 无该块且有新值 → 文末新建 `【标签】值`（追加不重排，绝不动别人家的块）；
 * - 无该块且新值为空 → 原文返回（零写入语义）；
 * - 清空已有块 → 整块摘除（含【标签】本身），注入文本里不留空壳。
 */
export function setLabeledBlock(content, label, nextValue) {
  const text = String(content ?? '').replace(/\r\n/g, '\n')
  const name = String(label ?? '').trim()
  const value = String(nextValue ?? '').trim()
  if (!name) return text
  const block = findLabeledBlock(text, name)
  if (block) {
    if (!value) return `${text.slice(0, block.start)}${text.slice(block.end)}`.replace(/\n{3,}/g, '\n\n')
    const trailing = String(block.value).match(/\s*$/)[0]
    return replaceBlockValue(text, block, `${value}${trailing.includes('\n') ? trailing : '\n'}`)
  }
  if (!value) return text
  return `${text.replace(/\s+$/, '')}\n\n【${name}】${value}\n`
}

function dimensionLinesOf(value) {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * 人物条目状态推进（纯函数）：
 * - 【当前状态】段改写：有变动的维度行（`伤势：…`）替换，缺失的追加；整段缺失则在文末新建；
 * - 【变动史】段追加：一条 `- <章名|日期>：伤势 …；位置 …`（含 note 备注）；整段缺失则新建；
 * - 背景/性格/外貌等静态段：字节不动（只做 【当前状态】/【变动史】两块的定位手术）；
 * - 无任何变动 → 原条目原样返回（零写入语义）。
 *
 * @param {object} entry 运行时条目（content=注入真相）
 * @param {object} deltas { injury?, money?, knowledge?, relations?, location?, note?, chapter? }
 * @returns {object} 新条目（浅拷贝，content 更新）
 */
export function advanceCharacterState(entry, deltas = {}) {
  if (!entry || typeof entry !== 'object') return entry
  const source = deltas && typeof deltas === 'object' ? deltas : {}
  const changed = CHARACTER_STATE_DIMENSIONS
    .map(({ key, label }) => ({ key, label, text: String(source[key] ?? '').trim() }))
    .filter((item) => item.text)
  const note = String(source.note ?? '').trim()
  if (!changed.length && !note) return entry

  let content = String(entry.content ?? '').replace(/\r\n/g, '\n')

  // 1) 【当前状态】改写（缺段则文末新建）
  const stateBlock = findLabeledBlock(content, CHARACTER_STATE_LABEL)
  if (stateBlock) {
    const lines = dimensionLinesOf(stateBlock.value)
    for (const item of changed) {
      const lineRe = new RegExp(`^${escapeRegExp(item.label)}\\s*[:：]`)
      const index = lines.findIndex((line) => lineRe.test(line))
      const nextLine = `${item.label}：${item.text}`
      if (index >= 0) lines[index] = nextLine
      else lines.push(nextLine)
    }
    const trailing = stateBlock.value.endsWith('\n\n') ? '\n\n' : '\n'
    content = replaceBlockValue(content, stateBlock, `${lines.join('\n')}${trailing}`)
  } else {
    // 文末新建：与改写路径同形（标签行后直接接首行值），保证重放幂等
    const stateLines = changed.map((item) => `${item.label}：${item.text}`)
    content = `${content.replace(/\s+$/, '')}\n\n【${CHARACTER_STATE_LABEL}】${stateLines.join('\n')}\n`
  }

  // 2) 【变动史】追加（缺段则文末新建；同一条记录不重复追加）
  const stamp = String(source.chapter ?? '').trim() || new Date().toISOString().slice(0, 10)
  const summary = changed.map((item) => `${item.label} ${item.text}`).join('；')
  const record = `- ${stamp}：${summary}${note ? `（${note}）` : ''}`
  const historyBlock = findLabeledBlock(content, CHARACTER_HISTORY_LABEL)
  if (historyBlock) {
    if (historyBlock.value.includes(record)) return { ...entry, content }
    const lines = dimensionLinesOf(historyBlock.value)
    lines.push(record)
    content = replaceBlockValue(content, historyBlock, `${lines.join('\n')}\n`)
  } else {
    content = `${content.replace(/\s+$/, '')}\n\n【${CHARACTER_HISTORY_LABEL}】${record}\n`
  }

  return { ...entry, content }
}

/* ---------- 伏笔台账（结算件 4：行级 upsert，open|paid|retired 机器可读） ---------- */

export const FORESHADOW_STATUSES = ['open', 'paid', 'retired']

const FORESHADOW_HEADER_RE = /^\|\s*fid\s*\|/m

function foreshadowCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '／').trim()
}

function foreshadowRow({ fid, content, plantedAt, dueBy, status }) {
  return `| ${foreshadowCell(fid)} | ${foreshadowCell(content)} | ${foreshadowCell(plantedAt)} | ${foreshadowCell(dueBy)} | ${foreshadowCell(status)} |`
}

/**
 * 伏笔台账行级 upsert（ledger=台账 md 文本）：
 * - fid 必填；已有同 fid 行 → 原位替换（回收/顺期=改 status/dueBy）；无 → 表尾追加；
 * - status 归一到 open|paid|retired（非法值回 open，kit 状态机机器可读）；
 * - 表头缺失（非骨架起步）→ 文末补齐骨架表头再落行。
 */
export function updateForeshadowLedger(ledger, { fid, content = '', plantedAt = '', dueBy = '', status = 'open' } = {}) {
  const id = foreshadowCell(fid)
  if (!id) return String(ledger ?? '')
  const normalizedStatus = FORESHADOW_STATUSES.includes(String(status ?? '').trim().toLowerCase())
    ? String(status).trim().toLowerCase()
    : 'open'
  const row = foreshadowRow({ fid: id, content, plantedAt, dueBy, status: normalizedStatus })
  let text = String(ledger ?? '').replace(/\r\n/g, '\n')
  if (!FORESHADOW_HEADER_RE.test(text)) {
    text = `${text.replace(/\s+$/, '')}\n\n${foreshadowLedgerSkeleton()}`
  }
  const lines = text.split('\n')
  const rowIndex = lines.findIndex((line) => {
    if (!line.startsWith('|')) return false
    return String(line.split('|')[1] ?? '').trim() === id
  })
  if (rowIndex >= 0) {
    lines[rowIndex] = row
    return `${lines.join('\n')}`
  }
  let insertAt = lines.length
  while (insertAt > 0 && String(lines[insertAt - 1] ?? '').trim() === '') insertAt -= 1
  lines.splice(insertAt, 0, row)
  const out = lines.join('\n')
  return out.endsWith('\n') ? out : `${out}\n`
}

/** 台账表头列名（与骨架件首行同一套词；冒烟断言两者一致，防骨架改了这边漂移） */
export const FORESHADOW_LEDGER_LABELS = ['fid', '内容', '埋点', '预定回收', '状态']

/**
 * 伏笔台账行解析（纯函数）：只认表格行，跳过表头与分隔行。
 * 列序按 FORESHADOW_LEDGER_LABELS；status 归一到 open|paid|retired（非法值→open，与 upsert 同口径）。
 */
export function parseForeshadowLedger(ledger) {
  const rows = []
  for (const line of String(ledger ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length < FORESHADOW_LEDGER_LABELS.length) continue
    if (cells[0] === FORESHADOW_LEDGER_LABELS[0] || /^[-:\s]*$/.test(cells[0])) continue
    rows.push({
      fid: cells[0],
      content: cells[1],
      plantedAt: cells[2],
      dueBy: cells[3],
      status: FORESHADOW_STATUSES.includes(cells[4]) ? cells[4] : 'open'
    })
  }
  return rows
}

/**
 * 伏笔台账删行（纯函数，补齐 upsert 缺的那一手）：按 fid 整行摘除。
 * fid 为空或无命中 → 原文原样返回（零写入语义，调用方据此可以不落盘）。
 */
export function removeForeshadowLedgerRow(ledger, fid) {
  const id = foreshadowCell(fid)
  const text = String(ledger ?? '').replace(/\r\n/g, '\n')
  if (!id) return text
  const lines = text.split('\n')
  const rowIndex = lines.findIndex((line) => line.startsWith('|')
    && String(line.split('|')[1] ?? '').trim() === id)
  if (rowIndex < 0) return text
  lines.splice(rowIndex, 1)
  return `${lines.join('\n')}`
}

/** 伏笔台账条目的建档载荷（与结算落库同一形状：type=general、extra.auxRole 双保险识别） */
export function foreshadowLedgerEntryDraft() {
  return ledgerEntryPayload(
    FORESHADOW_LEDGER_ENTRY_NAME,
    'general',
    LEDGER_AUX_ROLES.foreshadow,
    foreshadowLedgerSkeleton()
  )
}

/* ---------- 世界揭示（结算件 5：清单，供采纳进设定条目） ---------- */

/**
 * 世界揭示清单登记（纯函数）：facts 追加进 settlement.worldReveals 形状的清单。
 * - settlement: { worldReveals?: [{ text, name?, adopted? }] }；返回**新清单**（原对象不动）；
 * - 去空、按 text 去重（含已有项）；新项 adopted:false（采纳=显式写入动作的事）。
 */
export function recordWorldReveal(settlement, facts) {
  const existing = Array.isArray(settlement?.worldReveals) ? settlement.worldReveals : []
  const out = existing
    .filter((item) => item && typeof item === 'object' && String(item.text ?? '').trim())
    .map((item) => ({ ...item, text: String(item.text).trim() }))
  const seen = new Set(out.map((item) => item.text))
  for (const fact of normalizeItems(facts)) {
    const text = fact.replace(/\s+/g, ' ')
    if (seen.has(text)) continue
    seen.add(text)
    out.push({ text, name: '', adopted: false })
  }
  return out
}

/* ---------- 草案（settlementFromTurn：本地确定性抽取，零写入） ---------- */

function firstSentenceOf(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!source) return ''
  const first = source.split(/(?<=[。！？!?\n])/)[0] || source
  const trimmed = first.trim()
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

function knownVocabularyOf(entries) {
  const vocab = new Set()
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') continue
    for (const value of [entry.name, entry.title, ...(Array.isArray(entry.keys) ? entry.keys : [])]) {
      const key = String(value ?? '').trim()
      if (key) vocab.add(key)
    }
  }
  return vocab
}

/**
 * 从一轮产出生成**结算草案**（本地确定性正则抽取，不做任何自动写入——
 * 返回值即草案，逐项人工确认后才可能经 applyChapterSettlement 落库）：
 * - 章卡一句话 = 首句（≤80 字）；梗点/钩型留空（作者填）；
 * - 人物提及 = 条目 name/title/keys 在正文中的出现（确定性子串匹配）；
 * - 新名目 = 《》/「」/『』引号名目 + 大写开头的拉丁专名，剔除已知词表；
 * - 交接/伏笔/揭示清单留空（草案只敢提：提及与名目，交接必须作者亲笔 3-5 条）。
 */
export function settlementFromTurn({ chapterTitle = '', text = '', entries = [] } = {}) {
  const source = String(text ?? '')
  const vocab = knownVocabularyOf(entries)
  const isKnown = (term) => vocab.has(String(term ?? '').trim())

  const mentions = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') continue
    const candidates = [entry.name, entry.title, ...(Array.isArray(entry.keys) ? entry.keys : [])]
      .map((value) => String(value ?? '').trim())
      .filter((value) => value && value.length >= 2 && source.includes(value))
    if (!candidates.length) continue
    mentions.push({ entryId: String(entry.id ?? ''), name: entryNameOf(entry) || candidates[0], matchedKeys: [...new Set(candidates)] })
  }

  const quoted = []
  const quotedRe = /[《]([^《》\n]{1,16})[》]|[「]([^「」\n]{1,16})[」]|[『]([^『』\n]{1,16})[』]/g
  let match
  while ((match = quotedRe.exec(source))) {
    const term = (match[1] || match[2] || match[3] || '').trim()
    if (term && !quoted.includes(term)) quoted.push(term)
  }
  const latin = []
  const latinRe = /\b[A-Z][a-zA-Z]{2,}\b/g
  while ((match = latinRe.exec(source))) {
    if (!latin.includes(match[0])) latin.push(match[0])
  }
  const newTerms = [...quoted, ...latin]
    .filter((term) => !isKnown(term))
    .slice(0, 8)

  return {
    chapterTitle: String(chapterTitle ?? '').trim(),
    chapterCard: { summary: firstSentenceOf(source), hook: '', newTerms },
    mentions,
    characterStates: mentions.map((mention) => ({
      entryId: mention.entryId,
      name: mention.name,
      deltas: { injury: '', money: '', knowledge: '', relations: '', location: '', note: '' }
    })),
    handoff: [],
    foreshadow: [],
    worldReveals: [],
    generatedAt: new Date().toISOString()
  }
}

/* ---------- 显式写入（草案→确认→写入；repository 经注入） ---------- */

/**
 * settlement repository 接口（页面装配 worldStore——结算写入走既有保存接缝，
 * A3 双写自动落文件；冒烟注入内存 mock）：
 *   {
 *     listEntries(): Entry[],
 *     addEntry(payload): Promise<Entry>,
 *     updateEntry(entryId, updates): Promise<Entry>
 *   }
 */
export function createSettlementChannel({ listEntries, addEntry, updateEntry } = {}) {
  for (const [name, fn] of [['listEntries', listEntries], ['addEntry', addEntry], ['updateEntry', updateEntry]]) {
    if (typeof fn !== 'function') throw new Error(`settlement channel 缺少 ${name}`)
  }
  return { listEntries, addEntry, updateEntry }
}

function ledgerEntryPayload(name, type, auxRole, content) {
  return {
    name,
    type,
    keys: [],
    keysSecondary: [],
    content,
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: null },
    extra: { auxRole },
    metadata: { importSource: 'chapter-settlement', basis: 'creative' }
  }
}

async function upsertLedgerEntry(channel, predicate, skeleton, name, type, auxRole, nextContent) {
  const existing = (channel.listEntries() || []).find((entry) => predicate(entry))
  if (existing) {
    return channel.updateEntry(existing.id, { content: nextContent })
  }
  const payload = ledgerEntryPayload(name, type, auxRole, nextContent || skeleton())
  return channel.addEntry(payload)
}

function settlementHasCard(settlement) {
  const card = settlement?.chapterCard
  return Boolean(card) && (String(card.summary ?? '').trim() || String(card.hook ?? '').trim()
    || (Array.isArray(card.newTerms) && card.newTerms.length) || String(settlement?.chapterTitle ?? '').trim())
}

/**
 * 结算五件的显式落库（唯一写入入口；页面「写入」按钮逐件调用，绝不静默）。
 *
 * @param {object} channel createSettlementChannel 产物
 * @param {object} settlement 草案（settlementFromTurn 形状 + 人工编辑结果）
 * @param {{ pieces?: string[] }} [options] 结算件过滤，缺省=全件；
 *   'chapterCard' 章卡+'handoff' 交接合并为一次章账写入（末节=交接）
 * @returns {Promise<object>} { results: { [piece]: { ok, error?, skipped?, entryId? } } }
 *   单件失败不上抛（逐件收集 error），调用方逐件呈现。
 */
export async function applyChapterSettlement(channel, settlement, { pieces } = {}) {
  const wanted = Array.isArray(pieces) && pieces.length
    ? new Set(pieces)
    : new Set(['chapterCard', 'handoff', 'characterStates', 'foreshadow', 'worldReveals'])
  const results = {}
  const data = settlement && typeof settlement === 'object' ? settlement : {}

  // 件 1+3：章卡 + 交接 → 章账（追加节 + 末节=handoff）
  if (wanted.has('chapterCard') || wanted.has('handoff')) {
    try {
      const current = (channel.listEntries() || []).find((entry) => isChapterLedgerEntry(entry))
      let ledger = current?.content || chapterLedgerSkeleton()
      let cardOk = false
      let handoffOk = false
      if (wanted.has('chapterCard') && settlementHasCard(data)) {
        ledger = appendChapterCard(ledger, {
          chapterTitle: data.chapterTitle,
          summary: data.chapterCard?.summary,
          hook: data.chapterCard?.hook,
          newTerms: data.chapterCard?.newTerms
        })
        cardOk = ledger !== (current?.content || chapterLedgerSkeleton())
      }
      if (wanted.has('handoff')) {
        const before = ledger
        ledger = appendHandoff(ledger, data.handoff, { chapterTitle: data.chapterTitle })
        handoffOk = ledger !== before
      }
      if (ledger === (current?.content || chapterLedgerSkeleton())) {
        results.chapterCard = { ok: true, skipped: true }
        if (wanted.has('handoff')) results.handoff = { ok: true, skipped: true }
      } else {
        const saved = await upsertLedgerEntry(
          channel, isChapterLedgerEntry, chapterLedgerSkeleton,
          CHAPTER_LEDGER_ENTRY_NAME, 'event', LEDGER_AUX_ROLES.chapter, ledger
        )
        results.chapterCard = wanted.has('chapterCard')
          ? { ok: true, skipped: !cardOk, entryId: saved?.id }
          : { ok: true, skipped: true }
        if (wanted.has('handoff')) results.handoff = { ok: true, skipped: !handoffOk, entryId: saved?.id }
      }
    } catch (error) {
      if (wanted.has('chapterCard')) results.chapterCard = { ok: false, error: String(error?.message || error) }
      if (wanted.has('handoff')) results.handoff = { ok: false, error: String(error?.message || error) }
    }
  }

  // 件 2：人物状态推进（当前状态改写 + 变动史追加，走 updateEntry 保存接缝）
  if (wanted.has('characterStates')) {
    const rows = Array.isArray(data.characterStates) ? data.characterStates : []
    const applied = []
    const errors = []
    const skipped = []
    for (const row of rows) {
      if (!row?.entryId) continue
      const hasDelta = CHARACTER_STATE_DIMENSIONS.some(({ key }) => String(row?.deltas?.[key] ?? '').trim())
        || String(row?.deltas?.note ?? '').trim()
      if (!hasDelta) { skipped.push(row.entryId); continue }
      const entry = (channel.listEntries() || []).find((item) => item.id === row.entryId)
      if (!entry) { errors.push(`${row.name || row.entryId}: 条目不存在`); continue }
      try {
        const updated = advanceCharacterState(entry, row.deltas)
        if (updated.content === entry.content) { skipped.push(row.entryId); continue }
        const saved = await channel.updateEntry(row.entryId, { content: updated.content })
        applied.push(saved?.id || row.entryId)
      } catch (error) {
        errors.push(`${row.name || row.entryId}: ${String(error?.message || error)}`)
      }
    }
    results.characterStates = {
      ok: errors.length === 0,
      applied,
      skipped,
      ...(errors.length ? { error: errors.join('；') } : {})
    }
  }

  // 件 4：伏笔变动 → 台账（行级 upsert）
  if (wanted.has('foreshadow')) {
    try {
      const rows = (Array.isArray(data.foreshadow) ? data.foreshadow : [])
        .filter((row) => String(row?.fid ?? '').trim())
      if (!rows.length) {
        results.foreshadow = { ok: true, skipped: true }
      } else {
        const current = (channel.listEntries() || []).find((entry) => isForeshadowLedgerEntry(entry))
        let ledgerText = current?.content || foreshadowLedgerSkeleton()
        for (const row of rows) ledgerText = updateForeshadowLedger(ledgerText, row)
        const saved = await upsertLedgerEntry(
          channel, isForeshadowLedgerEntry, foreshadowLedgerSkeleton,
          FORESHADOW_LEDGER_ENTRY_NAME, 'general', LEDGER_AUX_ROLES.foreshadow, ledgerText
        )
        results.foreshadow = { ok: true, entryId: saved?.id }
      }
    } catch (error) {
      results.foreshadow = { ok: false, error: String(error?.message || error) }
    }
  }

  // 件 5：世界揭示 → 采纳为新设定条目（lore；逐条显式）
  if (wanted.has('worldReveals')) {
    const reveals = (Array.isArray(data.worldReveals) ? data.worldReveals : [])
      .filter((item) => item && typeof item === 'object' && String(item.text ?? '').trim() && item.adopted !== true)
    const applied = []
    const errors = []
    for (const [index, reveal] of reveals.entries()) {
      const text = String(reveal.text).trim()
      const name = String(reveal.name ?? '').trim() || `世界揭示 ${index + 1}`
      try {
        const saved = await channel.addEntry({
          name,
          type: 'lore',
          keys: [],
          keysSecondary: [],
          content: text,
          injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: null },
          metadata: { importSource: 'chapter-settlement', basis: 'creative' }
        })
        applied.push(saved?.id || name)
      } catch (error) {
        errors.push(`${name}: ${String(error?.message || error)}`)
      }
    }
    results.worldReveals = {
      ok: errors.length === 0,
      applied,
      ...(errors.length ? { error: errors.join('；') } : {})
    }
  }

  return { results }
}
