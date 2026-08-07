/**
 * 地点描述的「句子级」合并工具。
 *
 * 用途:PlaceCatalog 的 AI 补全（applyFleshOut）— 不再"长者胜"覆盖用户原文,
 *      改为:保留用户句子逐字不变,把 AI 返回的、用户没说过的新句子追加在后面。
 *
 * 设计要点:
 *  - 中英标点都识别:`。！？\n` + `.!?\n` + 长省略号 `……`/`...`
 *  - 归一化键用于去重:小写 + 去所有空白与中英标点
 *  - 子串过滤:用户的整句(去标点后 ≥ 8 字符)若已包含 AI 句的去标点形式,则跳过 AI 句
 *    (避免 AI 把用户的"夜幕降临,寒鸦掠过荒原"改写成"夜幕笼罩,寒鸦掠过荒原"被当成"新句")
 *  - 完全 deterministic:相同输入两次合并结果完全相同
 *
 * 不做的事:
 *  - 不做语义相似度(没有 embedding 接入);仅做字面 / 子串级别的去重
 *  - 不修改任何用户文本(包括空白、标点)— 用户字一个不丢
 *  - 不做断句纠错:有缺陷的输入(连续标点 / 无结尾标点)按字面切
 */

const SENTENCE_SPLIT_RE = /([。！？\.!?\n]+)/u
const NORMALIZE_STRIP_RE = /[\s.,;:!?。，；：！？、·…—\-_'"()\[\]【】{}<>《》]+/gu
const MIN_SUBSTRING_MATCH_LEN = 8
const FALLBACK_SENTINEL = '__NONE__'

/**
 * 切句子。保留原标点;空字符串 / 纯空白返回 []。
 *
 * @param {string} text
 * @returns {string[]}  切好的句子(不含切分符)
 */
export function splitSentences(text) {
  if (typeof text !== 'string') return []
  const trimmed = text.trim()
  if (!trimmed) return []

  // 把切分符前/后拆开:splitSentences("你好。世界！") → ["你好","世界",""]
  const parts = trimmed.split(SENTENCE_SPLIT_RE)
  const out = []
  for (let i = 0; i < parts.length; i += 2) {
    const s = parts[i] || ''
    const tail = parts[i + 1] || ''
    if (!s && !tail) continue
    // 把尾标点附加到当前句,保持原标点
    out.push((s + tail).trim())
  }
  return out.filter((s) => s.length > 0)
}

/**
 * 把字符串归一化用于去重键:小写 + 去空白与所有中英标点。
 *
 * @param {string} s
 * @returns {string}
 */
export function normalizeForKey(s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().replace(NORMALIZE_STRIP_RE, '')
}

/**
 * 合并两段描述。
 *
 *  - 永远保留 userText 完整原文(用户字一个不丢)
 *  - aiText 中按句子顺序过滤:已在 userText 中、或被 userText 长句包含的,跳过
 *  - 至少 1 句被接受时,追加 '\n\n—补全：\n' + 接受句数组(原顺序)
 *  - 全部被过滤时,只返回 userText,addedCount=0
 *
 * @param {string} userText
 * @param {string} aiText
 * @param {{ separator?: string }} [opts]
 * @returns {{ text: string, addedCount: number, dedupedCount: number }}
 */
export function mergeUniqueSentences(userText, aiText, opts = {}) {
  const separator = opts.separator || '\n\n—补全：\n'
  const safeUser = typeof userText === 'string' ? userText : ''
  const safeAi = typeof aiText === 'string' ? aiText : ''

  if (!safeUser.trim() && !safeAi.trim()) {
    return { text: '', addedCount: 0, dedupedCount: 0 }
  }
  if (!safeAi.trim()) {
    return { text: safeUser, addedCount: 0, dedupedCount: 0 }
  }
  if (!safeUser.trim()) {
    return { text: safeAi, addedCount: splitSentences(safeAi).length, dedupedCount: 0 }
  }

  const userSentences = splitSentences(safeUser)
  const userKeys = new Set()
  const userLongKeys = []
  for (const s of userSentences) {
    const k = normalizeForKey(s)
    if (!k) continue
    userKeys.add(k)
    if (k.length >= MIN_SUBSTRING_MATCH_LEN) userLongKeys.push(k)
  }

  const aiSentences = splitSentences(safeAi)
  const accepted = []
  let dedupedCount = 0
  for (const s of aiSentences) {
    const k = normalizeForKey(s)
    if (!k) continue
    if (userKeys.has(k)) {
      dedupedCount++
      continue
    }
    // 子串过滤:AI 句被用户某长句完全包含,则认为是改写
    if (k.length >= MIN_SUBSTRING_MATCH_LEN) {
      // 用 user 的长句列表(去标点后的字符串 ≥ 8 字符)做包含检查
      let absorbed = false
      for (const uk of userLongKeys) {
        if (uk.includes(k)) {
          absorbed = true
          break
        }
      }
      if (absorbed) {
        dedupedCount++
        continue
      }
    } else {
      // AI 句很短(去标点 < 8 字符),检查是否被任一用户长句包含
      let absorbed = false
      for (const uk of userLongKeys) {
        if (uk.includes(k)) {
          absorbed = true
          break
        }
      }
      if (absorbed) {
        dedupedCount++
        continue
      }
    }
    accepted.push(s)
  }

  if (accepted.length === 0) {
    return { text: safeUser, addedCount: 0, dedupedCount }
  }

  return {
    text: safeUser + separator + accepted.join(''),
    addedCount: accepted.length,
    dedupedCount,
  }
}

export const _INTERNAL = Object.freeze({
  FALLBACK_SENTINEL,
  SENTENCE_SPLIT_RE,
  NORMALIZE_STRIP_RE,
  MIN_SUBSTRING_MATCH_LEN,
})