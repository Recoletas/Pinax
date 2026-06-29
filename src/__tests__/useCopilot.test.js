import { describe, expect, it } from 'vitest'
import {
  buildCopilotMessages,
  extractCopilotWindow,
  insertCopilotSuggestion,
  normalizeCopilotExtraContext,
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

  it('clips extra reference context before sending it to the model', () => {
    const result = normalizeCopilotExtraContext('第一段第一句足够长。\n\n第二段会很长很长很长。第三句。', 16)

    expect(result).toBe('第一段第一句足够长。')
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

  it('includes selected asset context in copilot messages', () => {
    const result = buildCopilotMessages({
      content: '林舟站在城门下，握紧了手里的信。她抬头看向远处。',
      cursorPos: 19,
      chapterTitle: '城门',
      extraContext: '标题：旧案线索\n类型：剧情事件\n林舟必须在入城前发现信上的暗号。'
    })

    expect(result.messages[0].content).toContain('参考素材')
    expect(result.messages.at(-1).content).toContain('【参考素材】')
    expect(result.messages.at(-1).content).toContain('林舟必须在入城前发现信上的暗号')
  })

  // WA-D: new structured `references` input — composed from
  // referenceAsset + selected inbox + outline context under one budget.
  it('accepts a structured references payload and composes the reference block', () => {
    const result = buildCopilotMessages({
      content: '林舟站在城门下，握紧了手里的信。她抬头看向远处。',
      cursorPos: 19,
      chapterTitle: '城门',
      references: {
        referenceAsset: {
          id: 'a-pin',
          kind: 'event',
          kindLabel: '剧情事件',
          title: '旧案线索',
          content: '林舟必须在入城前发现信上的暗号。',
          source: null
        },
        inboxAssets: [],
        selectedInboxIds: [],
        outlineContext: '',
        currentChapterId: 'c-1',
        currentBookId: 'b-1'
      }
    })

    expect(result.messages.at(-1).content).toContain('【参考素材】')
    expect(result.messages.at(-1).content).toContain('标题：旧案线索')
    expect(result.messages.at(-1).content).toContain('类型：剧情事件')
    expect(result.referenceContext).toContain('【参考素材】')
    expect(result.referenceBudgetReport).not.toBeNull()
    expect(result.referenceBudgetReport.assetBlocksIncluded).toBe(1)
  })

  it('references payload composes outline + pinned + inbox in prompt order', () => {
    const result = buildCopilotMessages({
      content: '黄昏时分。\n\n索德把钥匙放在桌上。',
      cursorPos: 10,
      chapterTitle: '灰墙',
      references: {
        referenceAsset: {
          id: 'a-pin', kind: 'event', kindLabel: '剧情事件',
          title: '钉素材', content: '钉素材内容。', source: null
        },
        inboxAssets: [{
          id: 'a-inb', kind: 'inspiration', kindLabel: '灵感',
          title: '收件箱素材', content: '收件箱素材内容。'
        }],
        selectedInboxIds: ['a-inb'],
        outlineContext: '【章节纲要】\n1. 纲要条目',
        currentChapterId: 'c-1',
        currentBookId: 'b-1'
      }
    })

    const userPrompt = result.messages.at(-1).content
    const idxOutline = userPrompt.indexOf('【章节纲要】')
    const idxRef = userPrompt.indexOf('【参考素材】')
    const idxInbox = userPrompt.indexOf('【已选素材】')

    expect(idxOutline).toBeGreaterThan(-1)
    expect(idxRef).toBeGreaterThan(idxOutline)
    expect(idxInbox).toBeGreaterThan(idxRef)
    expect(result.referenceContext).toContain('钉素材')
    expect(result.referenceContext).toContain('收件箱素材')
  })

  it('references payload trims inbox assets when the budget runs out', () => {
    const inboxAssets = []
    for (let i = 0; i < 6; i += 1) {
      inboxAssets.push({
        id: `a-${i}`,
        kind: 'event',
        kindLabel: '剧情事件',
        title: `素材 ${i}`,
        content: 'A'.repeat(200)
      })
    }
    const result = buildCopilotMessages({
      content: '黄昏时分。\n\n索德把钥匙放在桌上。',
      cursorPos: 10,
      chapterTitle: '灰墙',
      references: {
        referenceAsset: null,
        inboxAssets,
        selectedInboxIds: inboxAssets.map((a) => a.id),
        outlineContext: '',
        currentChapterId: 'c-1',
        currentBookId: 'b-1',
        budget: { totalChars: 360, perAssetChars: 100, outlineChars: 0 }
      }
    })

    // 360 / 100 = at most 3 inbox blocks
    expect(result.referenceBudgetReport.assetBlocksIncluded).toBeLessThanOrEqual(3)
    expect(result.referenceBudgetReport.assetBlocksDropped).toBeGreaterThanOrEqual(3)
    expect(result.referenceBudgetReport.overflowed).toBe(false)
  })

  it('prefers the new references payload over the legacy extraContext string when both are provided', () => {
    const result = buildCopilotMessages({
      content: '黄昏时分。\n\n索德把钥匙放在桌上。',
      cursorPos: 10,
      chapterTitle: '灰墙',
      // Legacy string
      extraContext: 'legacy-string-should-not-appear',
      // New structured path wins
      references: {
        referenceAsset: {
          id: 'a-pin', kind: 'event', kindLabel: '剧情事件',
          title: '新路径素材', content: '新路径素材内容。', source: null
        },
        inboxAssets: [],
        selectedInboxIds: [],
        outlineContext: '',
        currentChapterId: 'c-1',
        currentBookId: 'b-1'
      }
    })

    expect(result.messages.at(-1).content).toContain('新路径素材')
    expect(result.messages.at(-1).content).not.toContain('legacy-string-should-not-appear')
  })

  it('falls back to the legacy extraContext string when no references payload is provided', () => {
    const result = buildCopilotMessages({
      content: '黄昏时分。\n\n索德把钥匙放在桌上。',
      cursorPos: 10,
      chapterTitle: '灰墙',
      extraContext: 'legacy-fallback-string'
    })

    expect(result.referenceContext).toBe('legacy-fallback-string')
    expect(result.referenceBudgetReport).toBeNull()
    expect(result.messages.at(-1).content).toContain('【参考素材】')
    expect(result.messages.at(-1).content).toContain('legacy-fallback-string')
  })
})
