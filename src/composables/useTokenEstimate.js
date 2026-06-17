/**
 * useTokenEstimate - 统一轻量 token 估算
 *
 * cl100k 对齐启发式(精度 ±15-20%,UI 进度条足够):
 * - CJK (Han / Hiragana / Katakana / Hangul): 1.0 char/token
 * - printable ASCII (0x20-0x7E): 0.3 char/token (≈ 1/3.3 chars/token for cl100k English)
 * - other (CJK 标点 / emoji / 其他 non-ASCII 符号): 0.5 char/token
 *   (避免被 drop;cl100k 对 fullwidth 标点/emoji 单字符 token 较 CJK 略低)
 * - whitespace (U+0020 / U+3000 / 等): 不计 token
 *
 * 不引入 js-tiktoken direct dep(transitive 走 25MB Wasm,bundle 影响未审计)。
 * 真实精确度需 server-side 配合,前端无法解决。
 */

const CJK_PATTERN = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u
const ASCII_PATTERN = /^[\x20-\x7E]$/
const WHITESPACE_PATTERN = /^\s$/u

export function estimateTokens(text) {
  const value = String(text || '')
  if (!value) return 0

  let cjk = 0
  let ascii = 0
  let other = 0

  for (const char of value) {
    if (CJK_PATTERN.test(char)) cjk += 1
    else if (ASCII_PATTERN.test(char)) ascii += 1
    else if (!WHITESPACE_PATTERN.test(char)) other += 1
  }

  return Math.ceil(cjk * 1.0 + ascii * 0.3 + other * 0.5)
}

export default estimateTokens
