import { describe, expect, it } from 'vitest'
import {
  buildCopilotMessages,
  extractCopilotWindow,
  insertCopilotSuggestion,
  normalizeCopilotSuggestion
} from '../composables/useCopilot'

describe('useCopilot helpers', () => {
  it('extracts text around the cursor with separate before and after parts', () => {
    const content = '第一段。\n\n第二段正在推进，角色走到门前。后文保持。'
    const cursorPos = content.indexOf('后文')
    const result = extractCopilotWindow(content, cursorPos, { upstream: 20, downstream: 10 })

    expect(result.before).toContain('第二段正在推进')
    expect(result.after).toContain('后文')
    expect(result.contextText).toBe(result.before + result.after)
  })

  it('normalizes model output for direct inline insertion', () => {
    const result = normalizeCopilotSuggestion('续写：\n```text\n他停在门前，听见里面传来压低的争执声。\n```', 80)

    expect(result).toBe('他停在门前，听见里面传来压低的争执声。')
  })

  it('drops meta lines that do not carry insertable prose', () => {
    const result = normalizeCopilotSuggestion('思考：这里应该先压住节奏。\n他停在门前，抬手敲门。', 80)

    expect(result).toBe('他停在门前，抬手敲门。')
  })

  it('returns empty for explanation-only answers', () => {
    const result = normalizeCopilotSuggestion('这段可以先补充角色动机，再承接后文。建议写得更克制。', 80)

    expect(result).toBe('')
  })

  it('extracts prose from answer-like responses only when a clean prose line exists', () => {
    const result = normalizeCopilotSuggestion('可以这样写：\n他停在门前，抬手敲了三下。', 80)

    expect(result).toBe('他停在门前，抬手敲了三下。')
  })

  it('inserts suggestion at the cursor without losing the suffix text', () => {
    const result = insertCopilotSuggestion('AlphaOmega', 5, 'Beta')

    expect(result.content).toBe('Alpha BetaOmega')
    expect(result.newCursorPos).toBe(10)
  })

  it('builds copilot messages with matched worldbook context', () => {
    const result = buildCopilotMessages({
      content: '林舟站在城门下，握紧了手里的信。她抬头看向远处。',
      cursorPos: 19,
      chapterTitle: '城门',
      worldbook: {
        name: '测试世界',
        entries: [
          {
            id: 'role-1',
            name: '林舟',
            type: 'character',
            content: '林舟是谨慎的信使。',
            keys: ['林舟']
          }
        ]
      }
    })

    expect(result.matchedEntries.map((entry) => entry.id)).toEqual(['role-1'])
    expect(result.messages.some((message) => message.content.includes('林舟是谨慎的信使'))).toBe(true)
    expect(result.messages[0].content).toContain('禁止思考')
    expect(result.messages[0].content).toContain('禁止回答用户')
    expect(result.messages.at(-1).content).toContain('当前章节：城门')
    expect(result.messages.at(-1).content).toContain('【光标前】')
    expect(result.messages.at(-1).content).toContain('【光标后】')
  })
})
