import { describe, expect, it } from 'vitest'
import { applyAdvisorReplacement } from '../services/advisorResultApplier'

describe('advisorResultApplier', () => {
  it('applies a valid replacement and returns the next cursor position', () => {
    const result = applyAdvisorReplacement('春天来了，花开了。', {
      mode: 'replace',
      targetRange: { start: 5, end: 8 },
      baseText: '花开了',
      replacement: '桃花开了'
    })

    expect(result).toMatchObject({
      ok: true,
      content: '春天来了，桃花开了。',
      cursorPos: 9
    })
  })

  it('rejects stale base text', () => {
    const result = applyAdvisorReplacement('春天来了，花谢了。', {
      mode: 'replace',
      targetRange: { start: 5, end: 8 },
      baseText: '花开了',
      replacement: '桃花开了'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'stale-base-text',
      message: '原文已变化，请重新生成建议。'
    })
  })

  it('rejects invalid ranges', () => {
    const result = applyAdvisorReplacement('短句', {
      mode: 'replace',
      targetRange: { start: 0, end: 99 },
      replacement: '新句'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid-range'
    })
  })

  it('rejects non-replacement results', () => {
    const result = applyAdvisorReplacement('原文', {
      mode: 'review',
      targetRange: { start: 0, end: 2 },
      replacement: '新文'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'not-replace'
    })
  })
})
