// NC04：自动记忆提取的准入判定（纯函数，无模型调用、无存储副作用）。
// 目标：`a` / `asdfgh` / `aaaaaa` / 空白与纯格式这类无意义输入零候选；
// “他死了”“门没锁”、英文短句、NASA 等合法缩写不被长度或语言一刀切拒绝。
// 判定只回答“这段改动是否值得进入提取流程”，不判断事实真假。

export const MEMORY_ELIGIBILITY_REASONS = Object.freeze([
  'empty',
  'missing-source-ref',
  'noise',
  'already-processed',
  'eligible'
])

const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/
const LATIN_TOKEN_PATTERN = /[A-Za-z][A-Za-z'-]+|[A-Za-z]/
// 常见有意义的单字母拉丁缩写（人名首字母/单位）；其余单字母视为误触。
const LATIN_SINGLE_OK = new Set(['A', 'B', 'I'])

function hasWordLikeLatinToken(text) {
  const tokens = String(text).split(/[^A-Za-z'-]+/).filter(Boolean)
  for (const token of tokens) {
    if (token.length === 1) {
      if (LATIN_SINGLE_OK.has(token)) return true
      continue
    }
    // 三连重复（aaaa）或超长辅音串（asdfgh 的 sdfgh）是键盘噪声特征。
    if (/(.)\1\1/.test(token)) continue
    if (/[bcdfghjklmnpqrstvwxz]{4,}/i.test(token)) continue
    if (!/[aeiouAEIOU]/.test(token)) continue
    const distinct = new Set(token.toLowerCase()).size
    if (distinct / token.length < 0.34) continue
    return true
  }
  return false
}

function isKeyboardNoise(text) {
  const compact = String(text || '').replace(/\s+/g, '')
  if (!compact) return true
  const cjkCount = (compact.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkCount >= 1) return false
  // 无 CJK：逐 latin token 判断；没有 word-like token 即噪声。
  const latinTokens = compact.split(/[^A-Za-z'-]+/).filter(Boolean)
  if (!latinTokens.length) return true
  return !hasWordLikeLatinToken(compact)
}

function fingerprintText(text) {
  let hash = 2166136261
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * @param {object} input
 * @param {string} input.text 变更文本（changedText 或整块文本）
 * @param {Array} input.sourceRefs 来源 refs；自动路径必须有块级来源
 * @param {string} input.revision 来源 revision（用于指纹去重）
 * @param {Iterable<string>} [input.processedFingerprints] 已处理内容指纹（来源+文本）
 */
export function evaluateMemoryEligibility({ text = '', sourceRefs = [], revision = '', processedFingerprints = null } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return { eligible: false, reason: 'empty', fingerprint: '' }
  const refs = (Array.isArray(sourceRefs) ? sourceRefs : []).filter(Boolean)
  if (!refs.length) return { eligible: false, reason: 'missing-source-ref', fingerprint: '' }
  // 噪声判定基于去除标点后的内容；纯标点/数字/单符号改动不进入提取。
  const meaningful = value.replace(/[0-9\s\p{P}\p{S}]/gu, '')
  if (!meaningful || isKeyboardNoise(meaningful)) {
    return { eligible: false, reason: 'noise', fingerprint: '' }
  }
  const fingerprint = `${revision || ''}:${fingerprintText(value)}`
  if (processedFingerprints && typeof processedFingerprints.has === 'function' && processedFingerprints.has(fingerprint)) {
    return { eligible: false, reason: 'already-processed', fingerprint }
  }
  return { eligible: true, reason: 'eligible', fingerprint }
}

export function createEligibilityFingerprintSet(values) {
  return new Set((Array.isArray(values) ? values : []).map((value) => String(value || '')).filter(Boolean))
}

export { CJK_PATTERN, LATIN_TOKEN_PATTERN }
