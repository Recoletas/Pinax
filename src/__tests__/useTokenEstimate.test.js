import { describe, expect, it } from 'vitest'
import { estimateTokens } from '../composables/useTokenEstimate'

describe('useTokenEstimate (cl100k-aligned heuristic: CJK 1.0 + ASCII 0.3 + other 0.5)', () => {
  it('1000 Han chars ≈ 1000 tokens (±15%)', () => {
    const text = '中'.repeat(1000)
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThanOrEqual(850)
    expect(tokens).toBeLessThanOrEqual(1150)
  })

  it('1000 printable ASCII chars ≈ 300 tokens (±15%)', () => {
    const text = 'a'.repeat(1000)
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThanOrEqual(255)
    expect(tokens).toBeLessThanOrEqual(345)
  })

  it('500 Han + 500 ASCII ≈ 650 tokens (±15%)', () => {
    const text = '中'.repeat(500) + 'a'.repeat(500)
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThanOrEqual(550)
    expect(tokens).toBeLessThanOrEqual(750)
  })

  it('Japanese (Hiragana/Katakana) and Korean (Hangul) counted as CJK', () => {
    const japanese = 'ひらがなカタカナ'.repeat(50)  // 8 chars × 50 = 400
    const korean = '한국어'.repeat(33)  // 3 chars × 33 = 99
    const totalChars = 400 + 99  // 499
    const tokens = estimateTokens(japanese + korean)
    // All CJK (1.0 char/token); 499 chars ≈ 499 tokens
    expect(tokens).toBeGreaterThanOrEqual(Math.floor(totalChars * 0.85))
    expect(tokens).toBeLessThanOrEqual(Math.ceil(totalChars * 1.15))
  })

  it('Chinese punctuation / emoji / non-ASCII symbols are not dropped (counted in "other" bucket)', () => {
    // ， = U+FF0C fullwidth comma, 。 = U+3002 ideographic period
    // 😀 = U+1F600 emoji (surrogate pair in JS, single code point in Unicode)
    const text = '你好，世界！😀。'.repeat(10)  // ~60 chars
    const tokens = estimateTokens(text)
    // Should not return 0 — the punctuation/emoji must be counted
    expect(tokens).toBeGreaterThan(0)
    // CJK chars: 你好世界! = 4 chars × 10 = 40 CJK
    // Other: ，！😀。 = 4 chars × 10 = 40 "other"
    // 40 * 1.0 + 40 * 0.5 = 60 tokens
    expect(tokens).toBeGreaterThanOrEqual(45)
    expect(tokens).toBeLessThanOrEqual(75)
  })

  it('empty / null / undefined returns 0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
    expect(estimateTokens(undefined)).toBe(0)
    expect(estimateTokens(0)).toBe(0)
  })
})
