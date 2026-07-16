import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  buildSelectionSource,
  createAssetFromSelection,
  parseInsertBackQuery,
  parseSelectionBackJump,
  spliceTextAt
} from '@/services/writingSelectionCapture'
import { listNarrativeAssets } from '@/services/narrativeAssets'

describe('writingSelectionCapture core flow', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
  })

  it('builds a normalized chapter selection source', () => {
    expect(buildSelectionSource({
      chapterId: 'chapter-1',
      offset: 12.8,
      length: 7.2,
      snippet: '  晨雾\n中的渡口  '
    })).toEqual({
      type: 'chapter',
      id: 'chapter-1',
      messageIds: [],
      chapterId: 'chapter-1',
      selectorOffset: 12,
      selectorLength: 7,
      selectorSnippet: '晨雾 中的渡口'
    })
  })

  it('stores a selected chapter fragment with a source ref', () => {
    const result = createAssetFromSelection({
      chapterId: 'chapter-9',
      content: '这是一段被选中的正文。',
      offset: 120,
      length: 10,
      projectId: 'book-1'
    })

    expect(result.ok).toBe(true)
    const [asset] = listNarrativeAssets({ status: 'inbox' })
    expect(asset).toMatchObject({
      projectId: 'book-1',
      source: { chapterId: 'chapter-9', selectorOffset: 120, selectorLength: 10 }
    })
    expect(asset.sourceRefs).toEqual([expect.objectContaining({
      refType: 'chapter', refId: 'chapter-9', projectId: 'book-1'
    })])
  })

  it('reuses the asset when the same chapter fragment is saved twice', () => {
    const input = { chapterId: 'chapter-2', content: '重复片段', offset: 3, length: 4, projectId: 'book-1' }
    const first = createAssetFromSelection(input)
    const second = createAssetFromSelection(input)

    expect(second).toMatchObject({ ok: true, assetId: first.assetId, deduplicated: true })
    expect(listNarrativeAssets({ status: null })).toHaveLength(1)
  })

  it('rejects incomplete or invalid selections without writing an asset', () => {
    expect(createAssetFromSelection({ content: '片段', offset: 0, length: 2 }).reason).toBe('no-chapter')
    expect(createAssetFromSelection({ chapterId: 'c', content: '', offset: 0, length: 2 }).reason).toBe('no-content')
    expect(createAssetFromSelection({ chapterId: 'c', content: '片段', offset: 'bad', length: 2 }).reason).toBe('bad-offset')
    expect(createAssetFromSelection({ chapterId: 'c', content: '片段', offset: 0, length: 0 }).reason).toBe('bad-length')
    expect(listNarrativeAssets({ status: null })).toHaveLength(0)
  })

  it('parses safe source and insert-back queries', () => {
    expect(parseSelectionBackJump({ chapterId: ' chapter-3 ', selectorOffset: '8', selectorLength: '5' }))
      .toEqual({ chapterId: 'chapter-3', offset: 8, length: 5 })
    expect(parseSelectionBackJump({ chapterId: 'chapter-3', selectorOffset: 'bad' })).toBeNull()
    expect(parseInsertBackQuery({ chapterId: ' chapter-3 ', insertAssetId: ' asset-1 ' }))
      .toEqual({ chapterId: 'chapter-3', insertAssetId: 'asset-1' })
    expect(parseInsertBackQuery({ chapterId: 'chapter-3' })).toBeNull()
  })

  it('splices text at a clamped insertion point', () => {
    expect(spliceTextAt('world', 'hello ', -1)).toEqual({ text: 'hello world', insertStart: 0, insertEnd: 6 })
    expect(spliceTextAt('hello', ' world', 999)).toEqual({ text: 'hello world', insertStart: 5, insertEnd: 11 })
  })
})
