import { describe, expect, it } from 'vitest'
import {
  buildDialogueOptionMessages,
  buildFallbackOptions,
  parseDialogueOptions
} from '../services/dialogueOptions'

describe('dialogueOptions', () => {
  it('parses JSON dialogue options', () => {
    const options = parseDialogueOptions('{"options":["追问失踪线索","质疑他的隐瞒","提出一起调查"]}')

    expect(options).toEqual(['追问失踪线索', '质疑他的隐瞒', '提出一起调查'])
  })

  it('parses numbered line dialogue options', () => {
    const options = parseDialogueOptions('1. 问清港口的异常\n2. 亮出刚找到的令牌\n3. 暂时装作相信')

    expect(options).toEqual(['问清港口的异常', '亮出刚找到的令牌', '暂时装作相信'])
  })

  it('builds fallback options around the current speaker', () => {
    expect(buildFallbackOptions({ speaker: '林霁舰长' })[0]).toBe('追问林霁舰长的意图')
  })

  it('passes recent story context into the option prompt', () => {
    const messages = buildDialogueOptionMessages({
      context: { speaker: '林霁舰长', dialogue: '所有人立刻撤离。' },
      playerCharacter: { name: '沈述' },
      recentMessages: [
        { role: 'user', content: '我检查控制台。' },
        { role: 'assistant', content: '警报声响起，舰桥灯光转为红色。' }
      ]
    })

    expect(messages[1].content).toContain('玩家角色：沈述')
    expect(messages[1].content).toContain('说话角色：林霁舰长')
    expect(messages[1].content).toContain('警报声响起')
  })
})
