import { describe, it, expect } from 'vitest'
import {
  splitSentences,
  normalizeForKey,
  mergeUniqueSentences,
} from '../../shared/placeDescriptionMerge.js'

describe('placeDescriptionMerge.splitSentences', () => {
  it('空字符串返回 []', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n  ')).toEqual([])
  })

  it('中文标点切分,保留原标点', () => {
    const r = splitSentences('你好。世界！你好吗？')
    // 每个终结标点都构成独立切分
    expect(r).toEqual(['你好。', '世界！', '你好吗？'])
  })

  it('英文标点切分', () => {
    const r = splitSentences('Hello world. How are you? Fine!')
    expect(r).toEqual(['Hello world.', 'How are you?', 'Fine!'])
  })

  it('中英混合', () => {
    const r = splitSentences('云海翻涌。Silver ships appeared. 没人应答')
    expect(r).toEqual(['云海翻涌。', 'Silver ships appeared.', '没人应答'])
  })

  it('换行切分', () => {
    const r = splitSentences('第一段。\n第二段。\n第三段')
    expect(r).toEqual(['第一段。', '第二段。', '第三段'])
  })
})

describe('placeDescriptionMerge.normalizeForKey', () => {
  it('去空白与中英标点,转小写', () => {
    expect(normalizeForKey('Hello, World! 你好。')).toBe('helloworld你好')
  })
})

describe('placeDescriptionMerge.mergeUniqueSentences', () => {
  it('空 user + 有 ai → 直接返回 ai', () => {
    const r = mergeUniqueSentences('', '夜幕降临。寒鸦掠过。')
    expect(r.text).toBe('夜幕降临。寒鸦掠过。')
    expect(r.addedCount).toBe(2)
    expect(r.dedupedCount).toBe(0)
  })

  it('有 user + 空 ai → 直接返回 user', () => {
    const r = mergeUniqueSentences('夜幕降临。', '')
    expect(r.text).toBe('夜幕降临。')
    expect(r.addedCount).toBe(0)
    expect(r.dedupedCount).toBe(0)
  })

  it('有 user + 有 ai 无重复 → user + 分隔符 + ai', () => {
    const r = mergeUniqueSentences(
      '夜幕降临。',
      '寒鸦掠过。钟声响起。'
    )
    expect(r.text).toBe('夜幕降临。\n\n—补全：\n寒鸦掠过。钟声响起。')
    expect(r.addedCount).toBe(2)
    expect(r.dedupedCount).toBe(0)
  })

  it('完全重复 → 仅 user', () => {
    const r = mergeUniqueSentences(
      '夜幕降临。寒鸦掠过。',
      '夜幕降临。寒鸦掠过。'
    )
    expect(r.text).toBe('夜幕降临。寒鸦掠过。')
    expect(r.addedCount).toBe(0)
    expect(r.dedupedCount).toBe(2)
  })

  it('真正的字符级子串过滤:AI 短句被 user 长句包含 → 跳过', () => {
    // user: "云海翻涌,Silver ships appeared,没人应答"
    // ai:   "Silver ships appeared"(短句,被 user 完整包含)
    const user = '云海翻涌,Silver ships appeared,没人应答。'
    const ai = 'Silver ships appeared。远处传来号角。'
    const r = mergeUniqueSentences(user, ai)
    expect(r.text).toBe(user + '\n\n—补全：\n远处传来号角。')
    expect(r.addedCount).toBe(1)
    expect(r.dedupedCount).toBe(1)
  })

  it('deterministic:相同输入两次结果完全相同', () => {
    const a = mergeUniqueSentences(
      '古老的城门。锈迹斑斑。',
      '古老的城门。远处传来钟声。'
    )
    const b = mergeUniqueSentences(
      '古老的城门。锈迹斑斑。',
      '古老的城门。远处传来钟声。'
    )
    expect(a.text).toBe(b.text)
    expect(a.addedCount).toBe(b.addedCount)
    expect(a.dedupedCount).toBe(b.dedupedCount)
  })
})