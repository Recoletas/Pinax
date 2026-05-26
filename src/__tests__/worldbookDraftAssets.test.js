import { describe, expect, it } from 'vitest'
import {
  buildWorldbookEntryFromAsset,
  canConvertAssetToWorldbookEntry
} from '@/services/worldbookDraftAssets'

describe('worldbookDraftAssets', () => {
  it('builds a worldbook entry from labeled draft content', () => {
    const entry = buildWorldbookEntryFromAsset({
      id: 'asset-a',
      kind: 'worldbook-draft',
      title: '备用标题',
      content: `名称：林舟
关键词：林舟、信使
类型：人物
内容：林舟是谨慎的信使，习惯先观察再行动。`
    })

    expect(entry.name).toBe('林舟')
    expect(entry.keys).toEqual(['林舟', '信使'])
    expect(entry.type).toBe('character')
    expect(entry.content).toBe('林舟是谨慎的信使，习惯先观察再行动。')
    expect(entry.metadata.importSource).toBe('narrative-asset')
    expect(entry.metadata.sourceAssetId).toBe('asset-a')
  })

  it('falls back to asset title and content when no labels exist', () => {
    const entry = buildWorldbookEntryFromAsset({
      kind: 'worldbook-draft',
      title: '雾港',
      content: '雾港常年潮湿，夜里灯塔会短暂熄灭。'
    })

    expect(entry.name).toBe('雾港')
    expect(entry.keys).toEqual(['雾港'])
    expect(entry.type).toBe('general')
    expect(entry.content).toBe('雾港常年潮湿，夜里灯塔会短暂熄灭。')
  })

  it('rejects empty drafts and only allows worldbook draft assets', () => {
    expect(canConvertAssetToWorldbookEntry({ kind: 'worldbook-draft', content: '设定' })).toBe(true)
    expect(canConvertAssetToWorldbookEntry({ kind: 'draft-prose', content: '设定' })).toBe(false)

    expect(() => buildWorldbookEntryFromAsset({ kind: 'worldbook-draft', content: '  ' }))
      .toThrow('世界书草稿内容不能为空')
  })
})
