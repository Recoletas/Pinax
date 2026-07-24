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
import {
  applyWritingSuggestion,
  buildWritingAgentInput,
  createWritingRevision,
  shouldTriggerWritingAgent,
  undoWritingSuggestion
} from '@/composables/useWritingAgent'
import {
  applyWritingAgentTransaction,
  undoWritingAgentTransaction
} from '@/services/agents/writingAgentTransaction'
import {
  buildSuggestionDomainAction,
  buildWritingProfessionalActions,
  buildWritingProfessionalTarget
} from '@/services/agents/writingProfessionalActions'

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

    const prose = '雨沿着旧窗缓慢落下。她没有回头，只把信压在灯下。走廊尽头的钟声已经停了很久，门外也始终没有人说话。'
    expect(shouldTriggerWritingAgent({
      content: prose,
      cursorPos: prose.length,
      inputType: 'insertText'
    })).toBe(true)
    for (const inputType of ['insertFromPaste', 'historyUndo', 'historyRedo']) {
      expect(shouldTriggerWritingAgent({
        content: prose,
        cursorPos: prose.length,
        inputType
      })).toBe(false)
    }
    expect(shouldTriggerWritingAgent({
      content: prose,
      cursorPos: prose.length,
      composing: true
    })).toBe(false)

    const applied = applyWritingSuggestion(prose, prose.length, '门外传来脚步声。她握紧了笔。', 'unit')
    expect(applied.inserted).toBe('门外传来脚步声。')
    const receipt = {
      before: prose,
      cursorBefore: prose.length,
      cursorAfter: applied.newCursorPos,
      afterRevision: createWritingRevision(applied.content, applied.newCursorPos)
    }
    expect(undoWritingSuggestion(applied.content, receipt)).toMatchObject({
      ok: true,
      content: prose,
      cursorPos: prose.length
    })
    expect(undoWritingSuggestion(`${applied.content}改`, receipt)).toMatchObject({
      ok: false,
      reason: 'revision-changed'
    })

    const agentInput = buildWritingAgentInput({
      content: prose,
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterTitle: '雨夜',
      outlineItems: [],
      inboxAssets: [],
      selectedInboxIds: [],
      referenceAsset: null,
      worldbook: null
    }, prose.length)
    expect(agentInput.envelope).toMatchObject({
      surface: 'writing',
      target: {
        type: 'cursor-window',
        id: 'chapter-1',
        revision: createWritingRevision(prose, prose.length)
      }
    })
    expect(agentInput.envelope.blocks.map((block) => block.kind)).toEqual(['rules', 'scene'])
    expect(agentInput.ledger.parts.some((part) => part.purpose === 'writing-cursor-window')).toBe(true)
    expect(agentInput.ledger.parts.every((part) => !Object.prototype.hasOwnProperty.call(part, 'content'))).toBe(true)

    const transaction = applyWritingAgentTransaction('甲段。乙段。', [
      { type: 'text-patch', range: { start: 0, end: 2 }, baseText: '甲段', content: '开场' },
      { type: 'text-patch', range: { start: 3, end: 5 }, baseText: '乙段', content: '收束' }
    ], { resultId: 'result-1', chapterId: 'chapter-1', cursorBefore: 5 })
    expect(transaction).toMatchObject({ ok: true, content: '开场。收束。' })
    expect(undoWritingAgentTransaction(transaction.content, transaction.receipt, 'chapter-1'))
      .toMatchObject({ ok: true, content: '甲段。乙段。', cursorPos: 5 })
    expect(undoWritingAgentTransaction(`${transaction.content}改`, transaction.receipt, 'chapter-1'))
      .toMatchObject({ ok: false, reason: 'revision-changed' })
    expect(applyWritingAgentTransaction('甲段。乙段。', [
      { type: 'text-patch', range: { start: 0, end: 2 }, baseText: '旧文', content: '开场' },
      { type: 'text-patch', range: { start: 3, end: 5 }, baseText: '乙段', content: '收束' }
    ])).toMatchObject({ ok: false, reason: 'stale-base-text', actionIndex: 0 })

    expect(buildWritingProfessionalActions({ hasSelection: false, hasParagraph: true }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: '扩写选区', disabled: true, taskType: 'writing.fix.selection' }),
        expect.objectContaining({ label: '补强段落衔接', disabled: false, taskType: 'writing.fix.paragraph' })
      ]))
    expect(buildWritingProfessionalTarget({ scope: 'selection' }, {
      selection: { start: 2, end: 4, text: '片段' }
    })).toEqual({
      kind: 'selection',
      range: { start: 2, end: 4 },
      text: '片段'
    })
    expect(buildSuggestionDomainAction('create-asset', { content: '保留这个伏笔' }, {
      resultId: 'result-1',
      chapterId: 'chapter-1',
      projectId: 'book-1',
      index: 0
    })).toMatchObject({
      type: 'create-asset',
      asset: {
        kind: 'inspiration',
        content: '保留这个伏笔',
        projectId: 'book-1',
        source: { chapterId: 'chapter-1' }
      }
    })
  })
})
