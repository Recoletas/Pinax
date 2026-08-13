// 叙事质量自动指标（C7）—— 纯文本启发式，不依赖 LLM。
// 输入统一为 turns：[{ input, response }]，按时间顺序。供 report 与 release-gate 共用。
function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function ratio(numerator, denominator) {
  if (!denominator) return null
  return Number((numerator / denominator).toFixed(4))
}

function cjkCount(value) {
  const matches = String(value ?? '').match(/[\u4e00-\u9fff]/g)
  return matches ? matches.length : 0
}

function splitSentences(value) {
  return String(value ?? '')
    .split(/[。！？!?…]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function charGrams(value, size) {
  const source = cleanText(value)
  const set = new Set()
  for (let index = 0; index + size <= source.length; index += 1) {
    set.add(source.slice(index, index + size))
  }
  return set
}

// 1. 短回合率：正文 < 240 中文字的回合比例（不含明确短答场景的标注）。
export function shortTurnRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const short = list.filter((turn) => cjkCount(turn?.response) < 240).length
  return ratio(short, list.length)
}

// 2. 相邻开头相似率：相邻 assistant 开头 80 字的 3-gram/Jaccard ≥0.6 的比例。
export function openingSimilarityRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length < 2) return null
  let similar = 0
  let pairs = 0
  for (let index = 1; index < list.length; index += 1) {
    const prev = charGrams(cleanText(list[index - 1]?.response).slice(0, 80), 3)
    const curr = charGrams(cleanText(list[index]?.response).slice(0, 80), 3)
    if (!prev.size || !curr.size) continue
    pairs += 1
    let intersection = 0
    for (const gram of curr) if (prev.has(gram)) intersection += 1
    const union = prev.size + curr.size - intersection
    if (union && intersection / union >= 0.6) similar += 1
  }
  return ratio(similar, pairs)
}

// 3. 末尾锚点命中率：上一轮末句中的候选专名/关键名词在下一轮开头复现，或末句 3-gram 接续。
//    比纯字符 n-gram 更贴近"人物/动作/台词得到承接"的语义。
export function tailAnchorCarryRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length < 2) return null
  let carried = 0
  let pairs = 0
  for (let index = 1; index < list.length; index += 1) {
    const tail = splitSentences(list[index - 1]?.response).at(-1) || ''
    const head = cleanText(list[index]?.response).slice(0, 150)
    if (!tail || !head) continue
    pairs += 1
    const tailNouns = (tail.match(/[\u4e00-\u9fff]{2,4}/g) || []).filter((token) => !NOVELTY_STOPLIST.has(token))
    let hit = false
    for (const noun of tailNouns) {
      if (head.includes(noun)) { hit = true; break }
    }
    if (!hit) {
      const trigrams = charGrams(tail, 3)
      for (let cursor = 0; cursor + 3 <= head.length; cursor += 1) {
        if (trigrams.has(head.slice(cursor, cursor + 3))) { hit = true; break }
      }
    }
    if (hit) carried += 1
  }
  return ratio(carried, pairs)
}

// 4. 段落碎片率：大量单句短段（≥4 段且 <30 字短段占比 ≥60%）的回合比例。
export function fragmentedParagraphRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const fragmented = list.filter((turn) => {
    const blocks = String(turn?.response || '')
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean)
    const shortBlocks = blocks.filter((block) => cjkCount(block) > 0 && cjkCount(block) < 30)
    return blocks.length >= 4 && shortBlocks.length / blocks.length >= 0.6
  }).length
  return ratio(fragmented, list.length)
}

// 5. 无来源新专名率：正文出现"全序列输入中均不存在"的候选专名（2-4 字连续短语，去停用词）的比例。
// 注：这是文本代理指标，未核对 Kernel/世界书/工具证据；完整判定需 smoke 按轮捕获 Kernel+evidence。
const NOVELTY_STOPLIST = new Set([
  '没有', '什么', '这个', '那个', '一个', '一下', '自己', '我们', '你们', '他们',
  '这里', '那里', '现在', '已经', '还是', '但是', '因为', '所以', '如果', '然后',
  '可能', '应该', '一定', '很多', '一些', '开始', '继续', '仍然', '已经'
])

export function unexplainedNoveltyRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  // P1-4：known 只纳入"截至当前回合之前"的输入与回复中的专名，避免未来信息泄漏。
  const known = new Set()
  const foldNouns = (text) => {
    for (const token of (String(text || '').match(/[\u4e00-\u9fff]{2,4}/g) || [])) {
      if (!NOVELTY_STOPLIST.has(token)) known.add(token)
    }
  }
  let novel = 0
  let evaluated = 0
  for (const turn of list) {
    const responseTokens = String(turn?.response || '').match(/[\u4e00-\u9fff]{2,4}/g) || []
    if (responseTokens.length) {
      evaluated += 1
      const unseen = [...new Set(responseTokens)]
        .filter((token) => !NOVELTY_STOPLIST.has(token) && !known.has(token))
      if (unseen.length > 0) novel += 1
    }
    // 本回合结束后才把它的输入/回复纳入已知（供后续回合）
    foldNouns(turn?.input)
    foldNouns(turn?.response)
  }
  return ratio(novel, evaluated)
}

// 6. 玩家控制权违规率：替玩家决定/行动/总结心理的回合比例（启发式）。
export function playerAgencyViolationRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const PATTERNS = [
    /你(决定|选择|打算|会|要)去/,
    /你感到|你意识到|你明白|你知道|你觉得/,
    /你(转身|走出|伸手|点头|摇头)/
  ]
  const violating = list.filter((turn) => (
    PATTERNS.some((pattern) => pattern.test(String(turn?.response || '')))
  )).length
  return ratio(violating, list.length)
}

export function summarizeNarrativeQuality(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  return {
    turnCount: list.length,
    shortTurnRate: shortTurnRate(list),
    openingSimilarityRate: openingSimilarityRate(list),
    tailAnchorCarryRate: tailAnchorCarryRate(list),
    fragmentedParagraphRate: fragmentedParagraphRate(list),
    unexplainedNoveltyRate: unexplainedNoveltyRate(list),
    playerAgencyViolationRate: playerAgencyViolationRate(list)
  }
}

export default {
  shortTurnRate,
  openingSimilarityRate,
  tailAnchorCarryRate,
  fragmentedParagraphRate,
  unexplainedNoveltyRate,
  playerAgencyViolationRate,
  summarizeNarrativeQuality
}
