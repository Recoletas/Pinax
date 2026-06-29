import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  buildSelectionSource,
  createAssetFromSelection,
  parseInsertBackQuery,
  parseSelectionBackJump,
  resolveInsertOffset,
  spliceTextAt
} from '@/services/writingSelectionCapture'
import { listNarrativeAssets } from '@/services/narrativeAssets'

const WRITING_VUE_PATH = resolve(__dirname, '../pages/Writing.vue')

function readWritingVue() {
  return readFileSync(WRITING_VUE_PATH, 'utf8')
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEYS.NARRATIVE_ASSETS)
})

describe('buildSelectionSource', () => {
  it('returns the canonical chapter selection shape', () => {
    const source = buildSelectionSource({
      chapterId: 'chap-1',
      offset: 42,
      length: 8,
      snippet: '暮湾的雾在黄昏前变得很厚。'
    })

    expect(source).toEqual({
      type: 'chapter',
      id: 'chap-1',
      messageIds: [],
      chapterId: 'chap-1',
      selectorOffset: 42,
      selectorLength: 8,
      selectorSnippet: '暮湾的雾在黄昏前变得很厚。'
    })
  })

  it('collapses whitespace and clamps the snippet', () => {
    const source = buildSelectionSource({
      chapterId: 'c',
      offset: 0,
      length: 0,
      snippet: '  multiple\n\nwhitespace   runs   '
    })
    expect(source.selectorSnippet).toBe('multiple whitespace runs')
  })

  it('clamps negative offsets and lengths to zero', () => {
    const source = buildSelectionSource({
      chapterId: 'c',
      offset: -5,
      length: -2
    })
    expect(source.selectorOffset).toBe(0)
    expect(source.selectorLength).toBe(0)
    expect(source.chapterId).toBe('c')
  })
})

describe('createAssetFromSelection', () => {
  it('persists selection metadata into the asset source', () => {
    const result = createAssetFromSelection({
      chapterId: 'chap-9',
      content: '这是一段被选中的正文。',
      offset: 120,
      length: 10,
      snippet: '被选中的正文',
      projectId: 'book-1'
    })

    expect(result.ok).toBe(true)
    expect(typeof result.assetId).toBe('string')
    expect(result.source).toMatchObject({
      type: 'chapter',
      id: 'chap-9',
      chapterId: 'chap-9',
      selectorOffset: 120,
      selectorLength: 10,
      selectorSnippet: '被选中的正文'
    })

    const stored = listNarrativeAssets({ status: 'inbox' })
    expect(stored).toHaveLength(1)
    expect(stored[0].kind).toBe('inspiration')
    expect(stored[0].status).toBe('inbox')
    expect(stored[0].projectId).toBe('book-1')
    expect(stored[0].source).toMatchObject({
      type: 'chapter',
      chapterId: 'chap-9',
      selectorOffset: 120,
      selectorLength: 10,
      selectorSnippet: '被选中的正文'
    })
  })

  it('uses default kind and status when not provided', () => {
    const result = createAssetFromSelection({
      chapterId: 'chap-2',
      content: '片段内容',
      offset: 0,
      length: 4
    })
    expect(result.ok).toBe(true)
    const stored = listNarrativeAssets({ status: 'inbox' })
    expect(stored[0].kind).toBe('inspiration')
    expect(stored[0].status).toBe('inbox')
  })

  it('rejects missing chapterId', () => {
    const result = createAssetFromSelection({
      chapterId: '',
      content: '片段内容',
      offset: 0,
      length: 4
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no-chapter')
  })

  it('rejects empty content', () => {
    const result = createAssetFromSelection({
      chapterId: 'chap-3',
      content: '   ',
      offset: 0,
      length: 4
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no-content')
  })

  it('rejects bad offset', () => {
    const result = createAssetFromSelection({
      chapterId: 'chap-4',
      content: '片段',
      offset: 'not-a-number',
      length: 2
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bad-offset')
  })

  it('rejects bad length', () => {
    const result = createAssetFromSelection({
      chapterId: 'chap-5',
      content: '片段',
      offset: 0,
      length: 0
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bad-length')
  })
})

describe('parseSelectionBackJump', () => {
  it('parses a valid back-jump query', () => {
    expect(parseSelectionBackJump({
      chapterId: 'chap-1',
      selectorOffset: '40',
      selectorLength: '12'
    })).toEqual({ chapterId: 'chap-1', offset: 40, length: 12 })
  })

  it('returns null when chapterId is missing', () => {
    expect(parseSelectionBackJump({ selectorOffset: '10' })).toBeNull()
  })

  it('returns null when offset is invalid', () => {
    expect(parseSelectionBackJump({
      chapterId: 'chap-1',
      selectorOffset: 'abc'
    })).toBeNull()
  })

  it('defaults length to zero when missing', () => {
    expect(parseSelectionBackJump({
      chapterId: 'chap-1',
      selectorOffset: '5'
    })).toEqual({ chapterId: 'chap-1', offset: 5, length: 0 })
  })

  it('tolerates non-string query values', () => {
    expect(parseSelectionBackJump({
      chapterId: '  chap-7  ',
      selectorOffset: 12,
      selectorLength: 3
    })).toEqual({ chapterId: 'chap-7', offset: 12, length: 3 })
  })
})

describe('parseInsertBackQuery', () => {
  it('parses a valid insert-back query', () => {
    expect(parseInsertBackQuery({
      chapterId: 'chap-3',
      insertAssetId: 'asset_xyz'
    })).toEqual({ chapterId: 'chap-3', insertAssetId: 'asset_xyz' })
  })

  it('returns null when chapterId is missing', () => {
    expect(parseInsertBackQuery({ insertAssetId: 'asset_xyz' })).toBeNull()
  })

  it('returns null when insertAssetId is missing', () => {
    expect(parseInsertBackQuery({ chapterId: 'chap-3' })).toBeNull()
  })

  it('returns null for blank values', () => {
    expect(parseInsertBackQuery({ chapterId: '', insertAssetId: 'asset_xyz' })).toBeNull()
    expect(parseInsertBackQuery({ chapterId: '   ', insertAssetId: 'asset_xyz' })).toBeNull()
    expect(parseInsertBackQuery({ chapterId: 'chap-3', insertAssetId: '   ' })).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(parseInsertBackQuery({
      chapterId: '  chap-9  ',
      insertAssetId: ' asset_abc '
    })).toEqual({ chapterId: 'chap-9', insertAssetId: 'asset_abc' })
  })
})

describe('spliceTextAt', () => {
  it('inserts at the start', () => {
    const r = spliceTextAt('world', 'hello ', 0)
    expect(r.text).toBe('hello world')
    expect(r.insertStart).toBe(0)
    expect(r.insertEnd).toBe(6)
  })

  it('inserts in the middle', () => {
    const r = spliceTextAt('hello world', 'big ', 6)
    expect(r.text).toBe('hello big world')
    expect(r.insertStart).toBe(6)
    expect(r.insertEnd).toBe(10)
  })

  it('inserts at the end', () => {
    const r = spliceTextAt('hello', ' world', 5)
    expect(r.text).toBe('hello world')
    expect(r.insertStart).toBe(5)
    expect(r.insertEnd).toBe(11)
  })

  it('clamps negative offset to 0', () => {
    const r = spliceTextAt('world', 'hello ', -3)
    expect(r.text).toBe('hello world')
    expect(r.insertStart).toBe(0)
  })

  it('clamps overflow offset to content length', () => {
    const r = spliceTextAt('hello', ' world', 999)
    expect(r.text).toBe('hello world')
    expect(r.insertStart).toBe(5)
  })

  it('floors fractional offsets', () => {
    const r = spliceTextAt('hello world', 'X', 5.7)
    expect(r.text).toBe('helloX world')
    expect(r.insertStart).toBe(5)
  })

  it('coerces non-numeric offset to 0', () => {
    const r = spliceTextAt('world', 'hello ', 'not-a-number')
    expect(r.text).toBe('hello world')
    expect(r.insertStart).toBe(0)
  })

  it('handles empty insert text', () => {
    const r = spliceTextAt('hello', '', 2)
    expect(r.text).toBe('hello')
    expect(r.insertStart).toBe(2)
    expect(r.insertEnd).toBe(2)
  })

  it('handles empty content', () => {
    const r = spliceTextAt('', 'hello', 0)
    expect(r.text).toBe('hello')
    expect(r.insertStart).toBe(0)
    expect(r.insertEnd).toBe(5)
  })
})

describe('resolveInsertOffset', () => {
  it('prefers the asset source selectorOffset when valid', () => {
    expect(resolveInsertOffset({
      chapterText: '0123456789',
      asset: { source: { selectorOffset: 5 } }
    })).toBe(5)
  })

  it('falls back to chapter end when selectorOffset is missing', () => {
    expect(resolveInsertOffset({
      chapterText: '01234',
      asset: { source: {} }
    })).toBe(5)
  })

  it('falls back to chapter end when selectorOffset is negative', () => {
    expect(resolveInsertOffset({
      chapterText: '01234',
      asset: { source: { selectorOffset: -3 } }
    })).toBe(5)
  })

  it('clamps a selectorOffset beyond the chapter end to chapter length', () => {
    expect(resolveInsertOffset({
      chapterText: 'abc',
      asset: { source: { selectorOffset: 999 } }
    })).toBe(3)
  })

  it('handles missing asset gracefully', () => {
    expect(resolveInsertOffset({ chapterText: 'abc' })).toBe(3)
    expect(resolveInsertOffset({ chapterText: 'abc', asset: null })).toBe(3)
  })

  it('handles empty chapter', () => {
    expect(resolveInsertOffset({ chapterText: '', asset: { source: { selectorOffset: 5 } } })).toBe(0)
    expect(resolveInsertOffset({ chapterText: '', asset: { source: {} } })).toBe(0)
  })
})

describe('Writing.vue wiring (static)', () => {
  it('imports createAssetFromSelection from the helper service', () => {
    const src = readWritingVue()
    expect(src).toMatch(/import\s*\{[^}]*createAssetFromSelection[^}]*\}\s*from\s*['"]\.\.\/services\/writingSelectionCapture['"]/)
  })

  it('imports parseSelectionBackJump from the helper service', () => {
    const src = readWritingVue()
    expect(src).toMatch(/import\s*\{[^}]*parseSelectionBackJump[^}]*\}\s*from\s*['"]\.\.\/services\/writingSelectionCapture['"]/)
  })

  it('imports parseInsertBackQuery from the helper service', () => {
    const src = readWritingVue()
    expect(src).toMatch(/import\s*\{[^}]*parseInsertBackQuery[^}]*\}\s*from\s*['"]\.\.\/services\/writingSelectionCapture['"]/)
  })

  it('imports spliceTextAt + resolveInsertOffset from the helper service', () => {
    const src = readWritingVue()
    expect(src).toMatch(/import\s*\{[^}]*spliceTextAt[^}]*\}\s*from\s*['"]\.\.\/services\/writingSelectionCapture['"]/)
    expect(src).toMatch(/import\s*\{[^}]*resolveInsertOffset[^}]*\}\s*from\s*['"]\.\.\/services\/writingSelectionCapture['"]/)
  })

  it('imports useRoute from vue-router for query handling', () => {
    const src = readWritingVue()
    expect(src).toMatch(/import\s*\{[^}]*useRoute[^}]*\}\s*from\s*['"]vue-router['"]/)
  })

  it('renders the capture-selection button in the editor toolbar', () => {
    const src = readWritingVue()
    expect(src).toMatch(/data-test=["']capture-selection["']/)
    expect(src).toMatch(/@click=["']captureSelectionAsAsset["']/)
    expect(src).toMatch(/>收为素材</)
  })

  it('disables the capture button when no selection is available', () => {
    const src = readWritingVue()
    expect(src).toMatch(/:disabled=["']!canCaptureSelection["']/)
  })

  it('reads the back-jump query on mount and clears it after applying', () => {
    const src = readWritingVue()
    expect(src).toMatch(/parseSelectionBackJump\(route\.query\)/)
    expect(src).toMatch(/router\.replace\(\{\s*query:\s*\{\}\s*\}\)/)
  })

  it('routes the captured asset to Notes.vue with assetId + from query', () => {
    const src = readWritingVue()
    expect(src).toMatch(/name:\s*['"]materials['"]/)
    expect(src).toMatch(/from:\s*['"]writing-selection['"]/)
    expect(src).toMatch(/assetId:\s*result\.assetId/)
  })

  it('reads the insert-back query and wires the perform helper', () => {
    const src = readWritingVue()
    expect(src).toMatch(/parseInsertBackQuery\(route\.query\)/)
    expect(src).toMatch(/tryApplyPendingInsertBack/)
    expect(src).toMatch(/performInsertAtChapter/)
  })

  it('finds the target chapter across all books for cross-book insert-back', () => {
    const src = readWritingVue()
    expect(src).toMatch(/findChapterAcrossBooks/)
    expect(src).toMatch(/openBookAtChapter/)
  })

  it('uses listNarrativeAssets to load the asset for insert-back', () => {
    const src = readWritingVue()
    // Already imported at top, used inside tryApplyPendingInsertBack
    expect(src).toMatch(/listNarrativeAssets\(\s*\{\s*status:\s*null\s*\}\s*\)/)
  })
})