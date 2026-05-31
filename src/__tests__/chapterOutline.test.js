import { describe, expect, it } from 'vitest'
import {
  addAssetsToChapterOutline,
  buildChapterOutlineContext,
  createChapterOutlineItemFromAsset,
  removeChapterOutlineItem
} from '@/services/chapterOutline'

describe('chapterOutline', () => {
  it('creates outline items from narrative assets', () => {
    const item = createChapterOutlineItemFromAsset({
      id: 'asset-1',
      kind: 'event',
      title: '雾港冲突',
      content: '主角在雾港发现旧案线索。',
      projectId: 'book-1',
      source: {
        type: 'experience-session',
        id: 'session-1',
        messageIds: ['m1']
      }
    })

    expect(item).toMatchObject({
      assetId: 'asset-1',
      assetKind: 'event',
      title: '雾港冲突',
      content: '主角在雾港发现旧案线索。',
      source: {
        type: 'narrative-asset',
        projectId: 'book-1',
        sourceType: 'experience-session',
        sourceId: 'session-1',
        messageIds: ['m1']
      }
    })
  })

  it('adds assets without duplicating existing asset outline items', () => {
    const firstAsset = {
      id: 'asset-1',
      kind: 'event',
      title: '旧线索',
      content: '旧线索已经进入纲要。'
    }
    const current = [createChapterOutlineItemFromAsset(firstAsset)]

    const result = addAssetsToChapterOutline(current, [
      firstAsset,
      {
        id: 'asset-2',
        kind: 'draft-prose',
        title: '正文候选',
        content: '她终于意识到信上的字迹被改过。'
      }
    ])

    expect(result.addedItems).toHaveLength(1)
    expect(result.skippedCount).toBe(1)
    expect(result.items).toHaveLength(2)
    expect(result.items[1].assetId).toBe('asset-2')
  })

  it('builds outline context for generation prompts', () => {
    const result = buildChapterOutlineContext([
      createChapterOutlineItemFromAsset({
        id: 'asset-1',
        kind: 'character-fact',
        title: '林舟的顾虑',
        content: '林舟不信任雾港守卫。'
      })
    ])

    expect(result).toContain('【章节纲要】')
    expect(result).toContain('林舟的顾虑')
    expect(result).toContain('人物事实')
  })

  it('removes outline items by id', () => {
    const first = createChapterOutlineItemFromAsset({
      id: 'asset-1',
      content: '第一条。'
    })
    const second = createChapterOutlineItemFromAsset({
      id: 'asset-2',
      content: '第二条。'
    })

    expect(removeChapterOutlineItem([first, second], first.id)).toEqual([second])
  })
})
