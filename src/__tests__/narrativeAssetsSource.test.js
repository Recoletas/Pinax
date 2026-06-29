import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  addNarrativeAsset,
  createChapterSelectionSource,
  createNarrativeAsset,
  getAssetSourceDetail,
  getAssetSourceLabel,
  isChapterSelectionSource,
  listNarrativeAssets,
  updateNarrativeAsset
} from '@/services/narrativeAssets'

describe('narrativeAssets source schema (W1)', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
  })

  describe('backward compat: 旧 source shape 不变', () => {
    it('legacy {type:id:messageIds} 三字段完整保留', () => {
      const asset = createNarrativeAsset({
        content: '老素材',
        kind: 'draft-prose',
        source: { type: 'experience-session', id: 'session-a', messageIds: ['m1', 'm2'] }
      })
      expect(asset.source.type).toBe('experience-session')
      expect(asset.source.id).toBe('session-a')
      expect(asset.source.messageIds).toEqual(['m1', 'm2'])
    })

    it('legacy manual source (无 id/messageIds) 仍正常', () => {
      const asset = createNarrativeAsset({
        content: '手动素材',
        source: { type: 'manual' }
      })
      expect(asset.source.type).toBe('manual')
      expect(asset.source.id).toBe('')
      expect(asset.source.messageIds).toEqual([])
    })

    it('旧 source 的新字段一律 fallback 为 null', () => {
      const asset = createNarrativeAsset({
        content: '旧来源',
        source: { type: 'experience-session', id: 's' }
      })
      expect(asset.source.chapterId).toBeNull()
      expect(asset.source.selectorOffset).toBeNull()
      expect(asset.source.selectorLength).toBeNull()
      expect(asset.source.selectorSnippet).toBeNull()
    })

    it('未提供 source 时仍走默认 manual + 空 messageIds', () => {
      const asset = createNarrativeAsset({ content: '无 source' })
      expect(asset.source.type).toBe('manual')
      expect(asset.source.id).toBe('')
      expect(asset.source.messageIds).toEqual([])
      expect(asset.source.chapterId).toBeNull()
    })

    it('getAssetSourceDetail 输出保持原样(体验会话 2 段)', () => {
      expect(
        getAssetSourceDetail({ type: 'experience-session', id: 'session-a', messageIds: ['m1', 'm2'] })
      ).toBe('体验会话 · session-a · 2 段')
    })

    it('getAssetSourceLabel(type=chapter) 已是 "章节" 不需再改', () => {
      expect(getAssetSourceLabel({ type: 'chapter' })).toBe('章节')
    })
  })

  describe('createChapterSelectionSource', () => {
    it('建立 normalized 章节选区 source', () => {
      const source = createChapterSelectionSource({
        chapterId: 'ch_123',
        offset: 42,
        length: 26,
        snippet: '被选中的片段'
      })
      expect(source.type).toBe('chapter')
      expect(source.id).toBe('ch_123')
      expect(source.chapterId).toBe('ch_123')
      expect(source.selectorOffset).toBe(42)
      expect(source.selectorLength).toBe(26)
      expect(source.selectorSnippet).toBe('被选中的片段')
      expect(source.messageIds).toEqual([])
    })

    it('允许只传 chapterId (offset/length/snippet 缺省 = null)', () => {
      const source = createChapterSelectionSource({ chapterId: 'ch_only' })
      expect(source.chapterId).toBe('ch_only')
      expect(source.selectorOffset).toBeNull()
      expect(source.selectorLength).toBeNull()
      expect(source.selectorSnippet).toBeNull()
    })

    it('chapterId 缺失/空白/纯空格时抛错', () => {
      expect(() => createChapterSelectionSource({})).toThrow(/chapterId/)
      expect(() => createChapterSelectionSource({ chapterId: '' })).toThrow(/chapterId/)
      expect(() => createChapterSelectionSource({ chapterId: '   ' })).toThrow(/chapterId/)
    })

    it('snippet > 60 字符自动截断到 60', () => {
      const long = '一'.repeat(80)
      const source = createChapterSelectionSource({
        chapterId: 'ch', offset: 0, length: 80, snippet: long
      })
      expect(source.selectorSnippet).toHaveLength(60)
    })

    it('空白 snippet 归一为 null', () => {
      const source = createChapterSelectionSource({
        chapterId: 'ch', offset: 0, length: 5, snippet: '   '
      })
      expect(source.selectorSnippet).toBeNull()
    })

    it('chapterId 前后空白被 trim', () => {
      const source = createChapterSelectionSource({ chapterId: '  ch_trim  ' })
      expect(source.chapterId).toBe('ch_trim')
      expect(source.id).toBe('ch_trim')
    })
  })

  describe('selector offset/length normalize (invalid → null, 一致)', () => {
    it('offset 非法值独立归一为 null, 合法 length 保留', () => {
      const cases = [
        { offset: -5, length: 10, expectedLength: 10 },
        { offset: NaN, length: 5, expectedLength: 5 },
        { offset: Infinity, length: 5, expectedLength: 5 },
        { offset: 'abc', length: 5, expectedLength: 5 }
      ]
      cases.forEach(({ offset, length, expectedLength }) => {
        const asset = createNarrativeAsset({
          content: 'x',
          source: { type: 'chapter', chapterId: 'ch', selectorOffset: offset, selectorLength: length }
        })
        expect(asset.source.selectorOffset).toBeNull()
        expect(asset.source.selectorLength).toBe(expectedLength)
      })
    })

    it('length 非法值独立归一为 null, 合法 offset 保留', () => {
      const cases = [
        { offset: 10, length: -3 },
        { offset: 10, length: 'xyz' },
        { offset: 10, length: NaN }
      ]
      cases.forEach(({ offset, length }) => {
        const asset = createNarrativeAsset({
          content: 'x',
          source: { type: 'chapter', chapterId: 'ch', selectorOffset: offset, selectorLength: length }
        })
        expect(asset.source.selectorOffset).toBe(offset)
        expect(asset.source.selectorLength).toBeNull()
      })
    })

    it('0 是合法 offset, 不是 fallback', () => {
      const asset = createNarrativeAsset({
        content: 'x',
        source: { type: 'chapter', chapterId: 'ch', selectorOffset: 0, selectorLength: 5 }
      })
      expect(asset.source.selectorOffset).toBe(0)
      expect(asset.source.selectorLength).toBe(5)
    })

    it('0 是合法 length (零长选区 = 光标位置)', () => {
      const asset = createNarrativeAsset({
        content: 'x',
        source: { type: 'chapter', chapterId: 'ch', selectorOffset: 10, selectorLength: 0 }
      })
      expect(asset.source.selectorOffset).toBe(10)
      expect(asset.source.selectorLength).toBe(0)
    })

    it('小数向下取整 (42.7 → 42)', () => {
      const asset = createNarrativeAsset({
        content: 'x',
        source: { type: 'chapter', chapterId: 'ch', selectorOffset: 42.7, selectorLength: 10.9 }
      })
      expect(asset.source.selectorOffset).toBe(42)
      expect(asset.source.selectorLength).toBe(10)
    })

    it('数字字符串 coerce', () => {
      const asset = createNarrativeAsset({
        content: 'x',
        source: { type: 'chapter', chapterId: 'ch', selectorOffset: '42', selectorLength: '8' }
      })
      expect(asset.source.selectorOffset).toBe(42)
      expect(asset.source.selectorLength).toBe(8)
    })

    it('空字符串 / null / undefined → null', () => {
      const asset = createNarrativeAsset({
        content: 'x',
        source: { type: 'chapter', chapterId: 'ch', selectorOffset: '', selectorLength: null }
      })
      expect(asset.source.selectorOffset).toBeNull()
      expect(asset.source.selectorLength).toBeNull()
    })
  })

  describe('getAssetSourceDetail (章节选区展示)', () => {
    it('完整字段时输出 "章节 · ch_123 · 42-68"', () => {
      const detail = getAssetSourceDetail({
        type: 'chapter',
        id: 'ch_123',
        chapterId: 'ch_123',
        selectorOffset: 42,
        selectorLength: 26
      })
      expect(detail).toBe('章节 · ch_123 · 42-68')
    })

    it('chapterId 缺失时不展示 range, 不展示 id', () => {
      expect(getAssetSourceDetail({ type: 'chapter' })).toBe('章节')
    })

    it('只有 chapterId 无 offset/length → "章节 · ch_xxx" 不挂尾巴', () => {
      expect(
        getAssetSourceDetail({ type: 'chapter', id: 'ch_only', chapterId: 'ch_only' })
      ).toBe('章节 · ch_only')
    })

    it('只有 offset 没有 length → 不挂 range', () => {
      expect(
        getAssetSourceDetail({
          type: 'chapter', id: 'ch', chapterId: 'ch', selectorOffset: 10
        })
      ).toBe('章节 · ch')
    })

    it('chapterId 与 id 不一致时, 优先展示 chapterId (避免重复 ch_xxx · ch_xxx)', () => {
      const detail = getAssetSourceDetail({
        type: 'chapter',
        id: 'old-id',
        chapterId: 'ch_real',
        selectorOffset: 5,
        selectorLength: 5
      })
      expect(detail).toBe('章节 · ch_real · 5-10')
      expect(detail).not.toContain('old-id')
    })

    it('offset/length 是无效值时不挂 range (length < 0)', () => {
      const detail = getAssetSourceDetail({
        type: 'chapter', id: 'ch', chapterId: 'ch',
        selectorOffset: 5, selectorLength: -3
      })
      expect(detail).toBe('章节 · ch')
    })

    it('输入 null/undefined/非对象时优雅降级', () => {
      expect(getAssetSourceDetail(null)).toBe('手动录入')
      expect(getAssetSourceDetail(undefined)).toBe('手动录入')
      expect(getAssetSourceDetail('xxx')).toBe('手动录入')
    })
  })

  describe('isChapterSelectionSource', () => {
    it('type=chapter + 有 chapterId → true', () => {
      expect(isChapterSelectionSource({
        type: 'chapter', chapterId: 'ch_123',
        selectorOffset: 42, selectorLength: 26
      })).toBe(true)
    })

    it('type=chapter 但缺 chapterId → false', () => {
      expect(isChapterSelectionSource({ type: 'chapter' })).toBe(false)
      expect(isChapterSelectionSource({ type: 'chapter', chapterId: '' })).toBe(false)
      expect(isChapterSelectionSource({ type: 'chapter', chapterId: null })).toBe(false)
      expect(isChapterSelectionSource({ type: 'chapter', chapterId: '   ' })).toBe(false)
    })

    it('非 chapter 类型 → false', () => {
      expect(isChapterSelectionSource({ type: 'manual' })).toBe(false)
      expect(isChapterSelectionSource({ type: 'experience-session', id: 's' })).toBe(false)
      expect(isChapterSelectionSource({ type: 'note-image', id: 'i' })).toBe(false)
    })

    it('null/undefined/字符串/数字 → false (防御)', () => {
      expect(isChapterSelectionSource(null)).toBe(false)
      expect(isChapterSelectionSource(undefined)).toBe(false)
      expect(isChapterSelectionSource('chapter')).toBe(false)
      expect(isChapterSelectionSource(42)).toBe(false)
      expect(isChapterSelectionSource({})).toBe(false)
    })

    it('chapterId 即便无 offset/length 仍判 true (offset 丢失 ≠ 不是章节源)', () => {
      expect(isChapterSelectionSource({ type: 'chapter', chapterId: 'ch' })).toBe(true)
    })
  })

  describe('createNarrativeAsset 接收并保留新字段', () => {
    it('经 createChapterSelectionSource 接入 → 字段全部保留', () => {
      const source = createChapterSelectionSource({
        chapterId: 'ch_abc', offset: 10, length: 20, snippet: '部分片段'
      })
      const asset = addNarrativeAsset({
        content: '从章节选区来的素材',
        kind: 'draft-prose',
        source
      })
      expect(asset.source.type).toBe('chapter')
      expect(asset.source.id).toBe('ch_abc')
      expect(asset.source.chapterId).toBe('ch_abc')
      expect(asset.source.selectorOffset).toBe(10)
      expect(asset.source.selectorLength).toBe(20)
      expect(asset.source.selectorSnippet).toBe('部分片段')
    })

    it('手动 source 对象直接传入 → 字段全部保留', () => {
      const asset = addNarrativeAsset({
        content: '手动指定来源字段',
        kind: 'event',
        source: {
          type: 'chapter',
          id: 'ch_xyz',
          chapterId: 'ch_xyz',
          selectorOffset: 5,
          selectorLength: 12,
          selectorSnippet: 'hello world'
        }
      })
      expect(asset.source.chapterId).toBe('ch_xyz')
      expect(asset.source.selectorOffset).toBe(5)
      expect(asset.source.selectorLength).toBe(12)
      expect(asset.source.selectorSnippet).toBe('hello world')
    })

    it('listNarrativeAssets({sourceType:"chapter"}) 能筛出章节来源', () => {
      addNarrativeAsset({ content: 'a', source: { type: 'chapter', chapterId: 'ch_1' } })
      addNarrativeAsset({ content: 'b', source: { type: 'manual' } })
      const chapterAssets = listNarrativeAssets({ sourceType: 'chapter' })
      expect(chapterAssets).toHaveLength(1)
      expect(chapterAssets[0].source.chapterId).toBe('ch_1')
    })

    it('schemaVersion 保持 1 (无 migration 触发)', () => {
      const asset = addNarrativeAsset({
        content: 'x',
        source: createChapterSelectionSource({ chapterId: 'ch_1' })
      })
      expect(asset.schemaVersion).toBe(1)
    })
  })

  describe('updateNarrativeAsset patch 路径', () => {
    it('patch 含 source → 走 normalizeSource 重建', () => {
      const asset = addNarrativeAsset({ content: 'x', kind: 'inspiration' })
      const updated = updateNarrativeAsset(asset.id, {
        source: createChapterSelectionSource({
          chapterId: 'ch_update', offset: 100, length: 50, snippet: '更新来源'
        })
      })
      expect(updated.source.type).toBe('chapter')
      expect(updated.source.chapterId).toBe('ch_update')
      expect(updated.source.selectorOffset).toBe(100)
      expect(updated.source.selectorLength).toBe(50)
      expect(updated.source.selectorSnippet).toBe('更新来源')
    })

    it('patch 不含 source → 保留旧 source (含新字段)', () => {
      const source = createChapterSelectionSource({
        chapterId: 'ch_pres', offset: 1, length: 2, snippet: '保留'
      })
      const asset = addNarrativeAsset({ content: 'x', source })
      const updated = updateNarrativeAsset(asset.id, { title: 'new title' })
      expect(updated.source.chapterId).toBe('ch_pres')
      expect(updated.source.selectorOffset).toBe(1)
      expect(updated.source.selectorLength).toBe(2)
      expect(updated.source.selectorSnippet).toBe('保留')
    })

    it('patch 含非法 offset/length → 归一为 null (不污染旧值之外的字段)', () => {
      const asset = addNarrativeAsset({ content: 'x', kind: 'inspiration' })
      const updated = updateNarrativeAsset(asset.id, {
        source: { type: 'chapter', chapterId: 'ch_bad', selectorOffset: -5, selectorLength: 'xyz' }
      })
      expect(updated.source.chapterId).toBe('ch_bad')
      expect(updated.source.selectorOffset).toBeNull()
      expect(updated.source.selectorLength).toBeNull()
    })

    it('patch 清空 source 为 null → 走默认 manual 归一', () => {
      const asset = addNarrativeAsset({
        content: 'x',
        source: createChapterSelectionSource({ chapterId: 'ch_x' })
      })
      const updated = updateNarrativeAsset(asset.id, { source: null })
      expect(updated.source.type).toBe('manual')
      expect(updated.source.chapterId).toBeNull()
    })
  })
})