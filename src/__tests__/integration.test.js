/**
 * 核心服务集成测试（精简版）
 */

import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { UniqueID } from '@tiptap/extension-unique-id'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicAdaptationPlanner from '../components/media/ComicAdaptationPlanner.vue'
import ComicCompositionCanvas from '../components/media/ComicCompositionCanvas.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
import ComicStageWorkbench from '../components/media/ComicStageWorkbench.vue'
import ImageGenerationWorkbench from '../components/media/ImageGenerationWorkbench.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import ContourField from '../components/workbench/ContourField.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import NarrativeTurn from '../components/experience/NarrativeTurn.vue'
import WritingNotebookEditor from '../components/writing/WritingNotebookEditor.vue'
import {
  buildSystemPrompt,
  buildPromptSequence,
  buildNarrativeConstraints
} from '../services/experimental/promptBuilder'
import { getShotTypes, inferShotTypeFromEmotion } from '../types/director'
import {
  buildEditingPackage,
  buildEditingPackageZip,
  extractShotsFromChapter,
  extractShotsFromNarrativeAssets,
  extractShotsFromRelationCanvas,
  extractShotsFromProseEssay,
  toFCPXML,
  toJianyingDraft,
  toMarkdown,
  toPremiereCSV
} from '../services/media/shotExporter'
import {
  createImageModelConfigDraft,
  generateImage,
  getImageProviderCapabilities,
  IMAGE_MODEL_TYPES,
  testImageProviderConnection
} from '../services/media/imageProviderService'
import {
  deleteImageProviderConfig,
  listImageProviderConfigs,
  saveImageProviderConfig
} from '../services/media/imageProviderConfigStore'
import {
  addGeneratedImageToLibrary,
  deleteMediaAsset,
  getMediaAsset,
  loadGeneratedImageLibrary,
  listMediaAssets,
  saveMediaAsset
} from '../services/media/mediaAssetStore'
import {
  migrateCanvasAttachedImages,
  serializeCanvasCards
} from '../services/media/canvasImageAssetBridge'
import { saveProseCanvasWorkspace } from '../services/canvas/proseCanvasRepository.js'
import {
  addComicPanelTake,
  addComicPanelStageArtifact,
  approveComicPanelStageArtifact,
  buildComicPageManifest,
  canBatchGenerateComicPage,
  confirmComicSequenceVisualBible,
  createComicPage,
  listComicSequencePages,
  listComicPages,
  saveComicPage,
  saveComicPages,
  selectComicPanelStageArtifact,
  updateComicPageColorMode,
  updateComicPageComposition,
  updateComicPanel,
  updateComicPanelStage,
  updateComicVisualBible
} from '../services/media/comicPageStore'
import {
  buildComicAdaptationMessages,
  buildComicPagesFromAdaptation,
  buildComicReferenceCatalog,
  parseComicAdaptationCandidates
} from '../services/media/comicAdaptationService'
import {
  addComicDirectionControl,
  getComicFrameBounds,
  mergeComicPanelWithNext,
  reorderComicPanel,
  resizeComicPanelFrame,
  setComicCompositionFormat,
  setComicPanelGutter,
  splitComicPanel,
  updateComicPanelDirection
} from '../services/media/comicCompositionService'
import {
  archiveUploadedComicStage,
  buildComicStagePrompt,
  getComicBatchEligiblePanels,
  getComicProductionRoute,
  getComicStageGate,
  getComicStageInputRevision,
  runComicStageGeneration
} from '../services/media/comicProductionService'
import {
  getComicImageStyle,
  getComicPanelRect,
  getComicPanelImageSize,
  getComicPanelRects,
  getDefaultComicPanelFrame
} from '../services/media/comicLayout'
import {
  buildComicScriptMessages,
  parseComicScript
} from '../services/media/comicScriptService'
import { buildComicPanelImageRequest } from '../services/media/comicImagePrompt'
import { analyzeComicLettering, buildComicPublicationReport, estimateLineCount } from '../services/media/comicLetteringService'
import { renderRPText } from '../services/rpTextRenderer'
import { runGenerationRetryPlan } from '../services/generationRetry'
import {
  buildNarrativeFormatInstructions,
  createNarrativeMessageId,
  ensureNarrativeMessage,
  NARRATIVE_PRESENTATION_VERSION,
  parseNarrativePresentation,
  parseMarkedBlocks
} from '../services/narrativePresentation'
import {
  buildNarrativeTurnNote,
  buildNarrativeVoiceContract
} from '../services/agents/narrativeVoicePolicy'
import {
  resolveMarkdownHeadingShortcut,
  resolveWritingCommandMenuPosition
} from '../services/writing/liveMarkdownPreview.js'
import {
  editorContentToWritingDocument,
  createWritingDocument,
  getWritingNodeLocation,
  getWritingDocumentMarkdown,
  getWritingMarkdownPosition,
  migrateWritingDocumentToV3,
  normalizeWritingUnitBoundaries,
  validateWritingDocument,
  writingDocumentToEditorContent
} from '../services/writing/writingDocumentSchema.js'
import {
  createWritingCandidateRequest,
  getWritingCandidateStaleReason,
  normalizeWritingCandidateResponse
} from '../services/writing/writingCandidates.js'
import {
  createWritingAnnotation,
  createWritingSelector,
  reconcileWritingAnnotations,
  resolveWritingAnnotation
} from '../services/writing/writingAnnotations.js'
import {
  WritingDocumentNode,
  WritingNodeAttributes,
  WritingUnitNode
} from '../services/writing/writingUnitExtension.js'
import { buildWritingAgentInput } from '../composables/useWritingAgent.js'
import {
  buildWritingBlockHistoryEntries,
  normalizeWritingBlockHistoryEntry
} from '../../shared/writingBlockHistoryContract.js'
import { createWritingSnapshot } from '../../shared/writingSnapshotContract.js'
import {
  listWritingSnapshots,
  normalizeStoredWritingSnapshot,
  saveWritingSnapshot,
  previewWritingSnapshotCleanup,
  cleanWritingSnapshotPreview
} from '../services/writing/writingSnapshots.js'
import {
  listWritingRecoveryDrafts,
  saveWritingRecoveryDraft
} from '../services/writing/writingRecovery.js'
import {
  inspectChineseQuoteNesting,
  normalizeWritingReviewFindings,
  validateWritingReviewReplacement
} from '../../shared/writingReviewContract.js'
import {
  assessAuthoringReviewFreshness,
  collectLocalAuthoringProofingFindings,
  createAuthoringReviewBatchContext,
  createAuthoringReviewSession,
  getAuthoringReviewWorldbookRevision,
  markAuthoringReviewFindingsApplied,
  mergeAuthoringReviewFindings,
  prepareAuthoringReviewTransaction,
  rebaseAuthoringReviewSessionAfterTransaction
} from '../services/agents/authoring/authoringReviewSession.js'
import { loadAuthoringReviewRun, removeAuthoringReviewRun, saveAuthoringReviewRun } from '../services/agents/authoring/authoringReviewRunStore.js'
import { buildAuthoringReviewRewriteTarget, compareAuthoringReviewRewriteTarget } from '../services/agents/authoring/authoringReviewRewriteTarget.js'
import { loadImageGenerationRun, removeImageGenerationRun, saveImageGenerationRun } from '../services/media/imageGenerationRunStore.js'
import {
  applyWritingDocumentTextPatches,
  applyAuthoringReplacePlan,
  buildAuthoringPositionIndex as buildAuthoringProjectSearchIndex,
  createAuthoringReplacePlan,
  reconcileAuthoringSearchFinding,
  searchAuthoringPositionIndex
} from '../services/authoring/authoringProjectSearch.js'
import {
  normalizeWritingHistoryPreferences,
  planWritingMilestoneSnapshot,
  recordWritingMilestoneSnapshot,
  recordWritingProtectionSnapshot
} from '../services/writing/writingAutomaticHistory.js'
import { buildWritingQualityReport } from '../../shared/writingQualityContract.js'
import {
  appendExperienceTurnToChapter,
  getExperienceTurnImportEligibility
} from '../services/writing/writingExperienceImport.js'
// P4：可信说话者注册表
import { buildSpeakerRegistry, resolveSpeakerName } from '../../shared/narrativeSpeakerContract'
// P6：SceneThread 滚动合并
import { buildNarrativeSceneThread } from '../services/agents/narrativeSceneThread'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('PromptBuilder', () => {
  it('builds system prompt, preserves dialogue punctuation, and keeps pane keyboard navigation accessible', async () => {
    const writingFixtures = [
      ['empty chapter', '', 1, ['passage']],
      ['plain prose', '甲。\n\n乙。', 1, ['passage']],
      ['scene boundary', '# 第一幕\n\n甲。\n\n---\n\n乙。', 3, ['scene', 'passage', 'passage']],
      ['note and source', '> 作者注：核对时间\n\n> 来源：访谈 A', 2, ['note', 'source']]
    ]
    writingFixtures.forEach(([_name, markdown, unitCount, kinds]) => {
      const document = createWritingDocument(markdown)
      expect(validateWritingDocument(document)).toEqual({ valid: true, errors: [] })
      expect(document.schemaVersion).toBe(3)
      expect(document.content).toHaveLength(unitCount)
      expect(document.content.map((unit) => unit.attrs.kind)).toEqual(kinds)
      expect(new Set(document.content.map((unit) => unit.attrs.unitId)).size).toBe(unitCount)
      const nodes = document.content.flatMap((unit) => unit.content)
      expect(new Set(nodes.map((node) => node.attrs.nodeId)).size).toBe(nodes.length)
    })

    const v2 = {
      schemaVersion: 2,
      revision: 4,
      content: [
        { type: 'sceneHeading', attrs: { blockId: 'h1', revision: 1, kind: 'scene-heading', level: 1 }, content: [{ type: 'text', text: '第一幕' }] },
        { type: 'paragraph', attrs: { blockId: 'p1', revision: 2, kind: 'prose' }, content: [{ type: 'text', text: '甲。' }] },
        { type: 'paragraph', attrs: { blockId: 'p2', revision: 0, kind: 'prose' }, content: [{ type: 'text', text: '乙。' }] }
      ],
      meta: { trailingMarkdown: '' }
    }
    const migrated = migrateWritingDocumentToV3(v2)
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.revision).toBe(4)
    expect(migrated.content).toHaveLength(1)
    expect(migrated.content[0].attrs).toMatchObject({
      unitId: 'unit-v2-h1', unitRevision: 2, kind: 'scene', originRefs: []
    })
    expect(migrated.content[0].content.map((node) => node.attrs.nodeId)).toEqual(['h1', 'p1', 'p2'])
    expect(getWritingNodeLocation(migrated, 'p2')).toMatchObject({ unitId: 'unit-v2-h1', nodeId: 'p2' })

    const passageDocument = createWritingDocument([
      '第一段。', '第二段。', '第三段。', '第四段。', '第五段。', '第六段。', '第七段。'
    ].join('\n\n'))
    expect(passageDocument.content.map((unit) => unit.content.length)).toEqual([3, 3, 1])
    expect(createWritingDocument([
      '第一段。', '第二段。', '第三段。', '第四段。', '第五段。', '第六段。', '第七段。'
    ].join('\n\n')).content.map((unit) => unit.attrs.unitId)).toEqual(
      passageDocument.content.map((unit) => unit.attrs.unitId)
    )

    const legacyUnit = {
      ...passageDocument,
      content: [{
        ...passageDocument.content[0],
        attrs: { ...passageDocument.content[0].attrs, unitId: 'legacy-whole-chapter' },
        content: passageDocument.content.flatMap((unit) => unit.content)
      }],
      meta: { sourceHash: 'legacy' }
    }
    const normalizedLegacy = normalizeWritingUnitBoundaries(legacyUnit)
    expect(normalizedLegacy.content.map((unit) => unit.content.length)).toEqual([3, 3, 1])
    expect(normalizedLegacy.content[0].attrs.unitId).toBe('legacy-whole-chapter')
    expect(normalizeWritingUnitBoundaries(normalizedLegacy)).toBe(normalizedLegacy)
    expect(normalizedLegacy.content.flatMap((unit) => unit.content).map((node) => node.attrs.nodeId)).toEqual(
      legacyUnit.content[0].content.map((node) => node.attrs.nodeId)
    )

    const generatedLegacy = {
      ...legacyUnit,
      content: [{
        ...legacyUnit.content[0],
        attrs: {
          ...legacyUnit.content[0].attrs,
          originRefs: [{ type: 'authoring-turn', requestId: 'request-1', sourceRevision: 1 }]
        }
      }]
    }
    expect(normalizeWritingUnitBoundaries(generatedLegacy).content).toHaveLength(1)

    const makeUnitEditor = (document) => new Editor({
      extensions: [
        StarterKit.configure({ document: false }),
        WritingDocumentNode,
        WritingUnitNode,
        WritingNodeAttributes,
        UniqueID.configure({
          types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
          attributeName: 'nodeId'
        })
      ],
      content: { type: 'doc', content: writingDocumentToEditorContent(document) }
    })
    let splitTransition = null
    const unitEditor = makeUnitEditor(createWritingDocument('甲。'))
    unitEditor.on('transaction', ({ transaction }) => {
      splitTransition = transaction.getMeta('writingUnitTransition') || splitTransition
    })
    unitEditor.commands.setTextSelection(3)
    expect(unitEditor.commands.splitBlock()).toBe(true)
    expect(unitEditor.getJSON().content).toHaveLength(1)
    expect(unitEditor.getJSON().content[0].content).toHaveLength(2)
    expect(unitEditor.commands.splitWritingUnit()).toBe(true)
    const splitEditorJson = unitEditor.getJSON()
    expect(splitEditorJson.content).toHaveLength(2)
    expect(splitEditorJson.content[0].attrs.unitId).not.toBe(splitEditorJson.content[1].attrs.unitId)
    expect(unitEditor.state.selection.$from.node(1).attrs.unitId).toBe(splitEditorJson.content[1].attrs.unitId)
    splitEditorJson.content.forEach((unit) => {
      unit.content.forEach((node) => {
        expect(splitTransition.nodeUnitMap[node.attrs.nodeId]).toBe(unit.attrs.unitId)
      })
    })
    const mergeDocument = editorContentToWritingDocument(splitEditorJson)
    expect(unitEditor.commands.undo()).toBe(true)
    expect(unitEditor.getJSON().content).toHaveLength(1)
    expect(unitEditor.commands.mergeWritingUnit('next')).toBe(false)
    unitEditor.destroy()

    const splitMidNode = (markdown, nodeIndex, localOffset) => {
      const editor = makeUnitEditor(createWritingDocument(markdown))
      const before = editor.getJSON()
      const unit = editor.state.doc.child(0)
      let nodeStart = 1
      for (let index = 0; index < nodeIndex; index += 1) nodeStart += unit.child(index).nodeSize
      let dispatchCount = 0
      editor.on('transaction', ({ transaction }) => {
        if (transaction.getMeta('writingUnitTransition')?.type === 'split') dispatchCount += 1
      })
      editor.commands.setTextSelection(nodeStart + 1 + localOffset)
      const commandResult = editor.commands.splitWritingUnit()
      const after = editor.getJSON()
      const undoResult = editor.commands.undo()
      const restored = editor.getJSON()
      editor.destroy()
      return { before, after, restored, commandResult, dispatchCount, undoResult }
    }
    const firstNodeSplit = splitMidNode('甲乙。\n\n丙丁。', 0, 1)
    const laterNodeSplit = splitMidNode('甲乙。\n\n丙丁。', 1, 1)
    ;[firstNodeSplit, laterNodeSplit].forEach((result) => {
      expect(result.commandResult).toBe(true)
      expect(result.dispatchCount).toBe(1)
      expect(result.after.content).toHaveLength(2)
      expect(result.undoResult).toBe(true)
      expect(result.restored).toEqual(result.before)
    })

    let unitTransition = null
    const mergeEditor = makeUnitEditor(mergeDocument)
    mergeEditor.on('transaction', ({ transaction }) => {
      unitTransition = transaction.getMeta('writingUnitTransition') || unitTransition
    })
    const leftUnitId = mergeEditor.getJSON().content[0].attrs.unitId
    const rightUnitId = mergeEditor.getJSON().content[1].attrs.unitId
    mergeEditor.commands.setTextSelection(mergeEditor.state.doc.child(0).nodeSize + 2)
    const rightCursorParentText = mergeEditor.state.selection.$from.parent.textContent
    expect(mergeEditor.commands.mergeWritingUnit('previous')).toBe(true)
    expect(mergeEditor.getJSON().content).toHaveLength(1)
    expect(mergeEditor.getJSON().content[0].attrs.unitId).toBe(leftUnitId)
    expect(mergeEditor.state.selection.$from.node(1).attrs.unitId).toBe(leftUnitId)
    expect(mergeEditor.state.selection.$from.parent.textContent).toBe(rightCursorParentText)
    expect(unitTransition).toMatchObject({ type: 'merge', keptUnitId: leftUnitId, removedUnitId: rightUnitId })
    expect(mergeEditor.commands.undo()).toBe(true)
    expect(mergeEditor.getJSON().content).toHaveLength(2)
    mergeEditor.commands.setTextSelection(mergeEditor.state.doc.child(0).nodeSize + 2)
    const movedCursorOffset = mergeEditor.state.selection.from - mergeEditor.state.doc.child(0).nodeSize
    expect(mergeEditor.commands.moveWritingUnit('up')).toBe(true)
    expect(mergeEditor.state.selection.$from.node(1).attrs.unitId).toBe(rightUnitId)
    expect(mergeEditor.state.selection.from).toBe(movedCursorOffset)
    mergeEditor.getJSON().content.forEach((unit) => {
      unit.content.forEach((node) => {
        expect(unitTransition.nodeUnitMap[node.attrs.nodeId]).toBe(unit.attrs.unitId)
      })
    })
    expect(mergeEditor.commands.undo()).toBe(true)
    mergeEditor.destroy()

    const boundaryEditor = makeUnitEditor(createWritingDocument([
      '左一。', '左二。', '左三。', '右一。'
    ].join('\n\n')))
    const boundaryBefore = boundaryEditor.getJSON()
    expect(boundaryBefore.content).toHaveLength(2)
    const firstUnitSize = boundaryEditor.state.doc.child(0).nodeSize
    // 右单元开头的 Backspace 与左单元末尾的 Delete 都不能借 ProseMirror
    // 默认 join 行为静默抹掉业务 writingUnit 边界。
    boundaryEditor.commands.setTextSelection(firstUnitSize + 2)
    boundaryEditor.commands.keyboardShortcut('Backspace')
    expect(boundaryEditor.getJSON()).toEqual(boundaryBefore)
    boundaryEditor.commands.setTextSelection(firstUnitSize - 2)
    boundaryEditor.commands.keyboardShortcut('Delete')
    expect(boundaryEditor.getJSON()).toEqual(boundaryBefore)
    // 合并仍是显式结构命令，并产生可撤销的一次事务。
    boundaryEditor.commands.setTextSelection(firstUnitSize + 2)
    expect(boundaryEditor.commands.mergeWritingUnit('previous')).toBe(true)
    expect(boundaryEditor.getJSON().content).toHaveLength(1)
    expect(boundaryEditor.commands.undo()).toBe(true)
    expect(boundaryEditor.getJSON()).toEqual(boundaryBefore)
    boundaryEditor.destroy()

    const cursorDocument = editorContentToWritingDocument({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'first' }, content: [{ type: 'text', text: '前文' }] },
        { type: 'paragraph', attrs: { blockId: 'blank' }, content: [] }
      ]
    })
    const cursorMarkdown = getWritingDocumentMarkdown(cursorDocument)
    expect(getWritingMarkdownPosition(cursorDocument, 'blank', 0)).toBe(cursorMarkdown.lastIndexOf('\n'))
    expect(getWritingMarkdownPosition(cursorDocument, 'missing', 0)).toBeNull()

    expect(resolveMarkdownHeadingShortcut({
      nodeType: 'paragraph',
      textBefore: '##',
      insertedText: ' '
    })).toEqual({ level: 2, removePrefix: 2, insertedText: '' })
    expect(resolveMarkdownHeadingShortcut({
      nodeType: 'paragraph',
      textBefore: '##',
      insertedText: '标题'
    })).toBeNull()

    expect(resolveWritingCommandMenuPosition({
      anchor: { top: 700, right: 140, bottom: 724, left: 120 },
      viewportWidth: 1440,
      viewportHeight: 800,
      menuWidth: 300,
      menuHeight: 180
    })).toMatchObject({ top: 512, left: 120, width: 300, maxHeight: 180, placement: 'above' })
    expect(resolveWritingCommandMenuPosition({
      anchor: { top: 700, right: 140, bottom: 724, left: 120 },
      viewportWidth: 1440,
      viewportHeight: 800,
      menuWidth: 300,
      menuHeight: 180,
      scale: 0.85
    })).toMatchObject({ top: 634, left: 141, width: 300, maxHeight: 180, placement: 'above' })
    expect(resolveWritingCommandMenuPosition({
      anchor: { top: 100, right: 950, bottom: 120, left: 930 },
      viewportWidth: 1000,
      viewportHeight: 800,
      menuWidth: 300,
      menuHeight: 180,
      collisionWidth: 606,
      collisionHeight: 180,
      collisionOffsetLeft: -306
    })).toMatchObject({ top: 128, left: 688, width: 300, maxHeight: 180, placement: 'below' })
    expect(resolveWritingCommandMenuPosition({
      anchor: { top: 730, right: 800, bottom: 750, left: 780 },
      viewportWidth: 400,
      viewportHeight: 300,
      viewportOffsetLeft: 600,
      viewportOffsetTop: 500,
      menuWidth: 200,
      menuHeight: 120
    })).toMatchObject({ top: 602, left: 780, width: 200, maxHeight: 120, placement: 'above' })

    const initialNotebookDocument = createWritingDocument('第一章正文。')
    const nextNotebookDocument = createWritingDocument('第二章正文。')
    const notebookPublicationOrder = []
    const notebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: {
        document: initialNotebookDocument,
        'onUpdate:document': (document) => notebookPublicationOrder.push(['document', document]),
        onSelectionChange: (selection) => notebookPublicationOrder.push(['selection', selection]),
        onInput: (input) => notebookPublicationOrder.push(['input', input])
      }
    })
    await vi.waitFor(() => {
      expect(notebook.emitted('selection-change')?.at(-1)?.[0]).toMatchObject({
        currentNodeText: '第一章正文。',
        documentRevision: initialNotebookDocument.revision
      })
    })
    expect(notebook.emitted('update:document')).toBeUndefined()
    await notebook.setProps({ document: nextNotebookDocument })
    await flushPromises()
    expect(notebook.emitted('selection-change')?.at(-1)?.[0]).toMatchObject({
      currentNodeText: '第二章正文。',
      documentRevision: nextNotebookDocument.revision
    })
    expect(notebook.emitted('update:document')).toBeUndefined()
    expect(notebook.vm.getCommandAvailability()).toMatchObject({
      undo: false,
      redo: false,
      cut: false,
      copy: false,
      selectAll: true
    })
    await notebook.setProps({
      inlineSuggestionVisible: true,
      inlineSuggestion: '门后传来一声轻响。'
    })
    await flushPromises()
    const ghost = notebook.find('.writing-inline-suggestion')
    expect(ghost.exists()).toBe(true)
    ghost.element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: false,
      cancelable: true,
      button: 2
    }))
    expect(notebook.emitted('accept-inline-suggestion')).toBeUndefined()
    ghost.element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: false,
      cancelable: true,
      button: 0
    }))
    expect(notebook.emitted('accept-inline-suggestion')?.at(-1)?.[0]).toBe('all')
    const altGraphEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ']',
      code: 'BracketRight',
      altKey: true,
      ctrlKey: true
    })
    notebook.find('.ProseMirror').element.dispatchEvent(altGraphEvent)
    expect(altGraphEvent.defaultPrevented).toBe(false)
    expect(notebook.emitted('cycle-inline-suggestion')).toBeUndefined()
    const altGraphSlashEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '/',
      code: 'Slash',
      altKey: true,
      ctrlKey: true
    })
    notebook.find('.ProseMirror').element.dispatchEvent(altGraphSlashEvent)
    expect(altGraphSlashEvent.defaultPrevented).toBe(false)
    expect(notebook.emitted('command-menu-change')).toBeUndefined()
    await notebook.setProps({ inlineSuggestionVisible: false, inlineSuggestion: '' })
    notebook.vm.editor.commands.setTextSelection(2)
    await flushPromises()
    notebookPublicationOrder.length = 0
    notebook.vm.editor.view.dispatch(notebook.vm.editor.state.tr.insertText('新'))
    await flushPromises()
    expect(notebookPublicationOrder.map(([kind]) => kind).slice(0, 3)).toEqual([
      'document',
      'selection',
      'input'
    ])
    const editedNotebookDocument = notebookPublicationOrder.find(([kind]) => kind === 'document')?.[1]
    const editedNotebookSelection = notebookPublicationOrder.find(([kind]) => kind === 'selection')?.[1]
    const editedNotebookUnit = editedNotebookDocument.content[0]
    const editedNotebookNode = editedNotebookUnit.content[0]
    expect(editedNotebookSelection).toMatchObject({
      currentNodeText: getWritingDocumentMarkdown(editedNotebookDocument).trimEnd(),
      documentRevision: editedNotebookDocument.revision,
      unitId: editedNotebookUnit.attrs.unitId,
      unitRevision: editedNotebookUnit.attrs.unitRevision,
      nodeId: editedNotebookNode.attrs.nodeId,
      nodeRevision: editedNotebookNode.attrs.nodeRevision
    })
    notebookPublicationOrder.length = 0
    expect(notebook.vm.insertPlainText('“')).toBe(true)
    await flushPromises()
    expect(notebookPublicationOrder.findLast(([kind]) => kind === 'input')?.[1]?.inputType).toBe('input')
    notebookPublicationOrder.length = 0
    expect(notebook.vm.insertPlainText('联想', { origin: 'writing-agent' })).toBe(true)
    await flushPromises()
    expect(notebookPublicationOrder.findLast(([kind]) => kind === 'input')?.[1]?.inputType).toBe('writing-agent')
    expect(notebook.vm.getCommandAvailability().undo).toBe(true)
    notebookPublicationOrder.length = 0
    expect(notebook.vm.undo()).toBe(true)
    await flushPromises()
    expect(notebookPublicationOrder.findLast(([kind]) => kind === 'input')?.[1]?.inputType).toBe('historyUndo')
    expect(notebook.vm.getCommandAvailability().redo).toBe(true)
    notebookPublicationOrder.length = 0
    expect(notebook.vm.redo()).toBe(true)
    await flushPromises()
    expect(notebookPublicationOrder.findLast(([kind]) => kind === 'input')?.[1]?.inputType).toBe('historyRedo')
    await notebook.setProps({ atomicUndoAvailable: true })
    await notebook.find('.ProseMirror').trigger('keydown', { key: 'z', ctrlKey: true })
    expect(notebook.emitted('history-command')?.at(-1)?.[0]).toBe('undo')
    expect(typeof notebook.vm.closeCommandMenu).toBe('function')
    await notebook.find('.ProseMirror').trigger('compositionstart')
    notebook.unmount()
    expect(notebook.emitted('composition-change')?.at(-1)).toEqual([
      false,
      { reason: 'editor-unmount' }
    ])

    const multilineSource = createWritingDocument('开头。')
    const multilineNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: multilineSource }
    })
    await flushPromises()
    // jsdom 没有完整的 Range geometry；这里只为设定插入位置，不测试
    // 浏览器滚动。关闭 focus 的异步 scrollIntoView，避免卸载后迟到测量。
    multilineNotebook.vm.editor.commands.focus('end', { scrollIntoView: false })
    expect(multilineNotebook.vm.insertPlainText('第一行\n第二行\n第三行', { origin: 'writing-agent' })).toBe(true)
    await flushPromises()
    const multilineJson = multilineNotebook.vm.editor.getJSON()
    expect(multilineJson.content).toHaveLength(1)
    expect(multilineJson.content[0].content.map((node) => (
      node.content?.map((item) => item.text || '').join('') || ''
    ))).toEqual([
      '开头。第一行',
      '第二行',
      '第三行'
    ])
    const multilineDocument = editorContentToWritingDocument(multilineJson, multilineSource)
    const multilineMarkdown = getWritingDocumentMarkdown(multilineDocument)
    const multilineReloaded = createWritingDocument(multilineMarkdown)
    expect(multilineReloaded.content.map((unit) => (
      unit.content.map((node) => ({ type: node.type, text: node.content?.map((item) => item.text || '').join('') || '' }))
    ))).toEqual(multilineDocument.content.map((unit) => (
      unit.content.map((node) => ({ type: node.type, text: node.content?.map((item) => item.text || '').join('') || '' }))
    )))
    const initialUnitId = multilineNotebook.vm.editor.getJSON().content[0].attrs.unitId
    const beforeInvalidBatch = multilineNotebook.vm.editor.getJSON()
    expect(multilineNotebook.vm.insertWritingUnitBatch({
      units: [
        { draftUnitId: 'draft-valid', text: '先通过的单元。' },
        { draftUnitId: 'draft-invalid', text: '' }
      ],
      originRefs: [{ type: 'authoring-turn', requestId: 'request-invalid-batch', sourceRevision: 1 }],
      sceneId: 'scene-invalid',
      beatFingerprint: 'beat-invalid',
      afterUnitId: initialUnitId
    })).toMatchObject({ ok: false, reason: 'invalid-turn' })
    expect(multilineNotebook.vm.editor.getJSON()).toEqual(beforeInvalidBatch)
    const batch = multilineNotebook.vm.insertWritingUnitBatch({
      units: [
        { draftUnitId: 'draft-a', text: '第一拍。' },
        { draftUnitId: 'draft-b', text: '第二拍。' }
      ],
      originRefs: [{ type: 'authoring-turn', requestId: 'request-batch', sourceRevision: 1 }],
      sceneId: 'scene-beat-1',
      beatFingerprint: 'beat-1',
      afterUnitId: initialUnitId
    })
    expect(batch).toMatchObject({ ok: true, unitIds: [expect.any(String), expect.any(String)] })
    expect(new Set(batch.unitIds).size).toBe(2)
    expect(multilineNotebook.vm.editor.getJSON().content.slice(-2).map((unit) => unit.attrs.sceneId))
      .toEqual(['scene-beat-1', 'scene-beat-1'])
    expect(multilineNotebook.vm.undo()).toBe(true)
    expect(multilineNotebook.vm.editor.getJSON().content).toHaveLength(1)
    expect(multilineNotebook.vm.redo()).toBe(true)
    expect(multilineNotebook.vm.editor.getJSON().content).toHaveLength(3)
    multilineNotebook.unmount()

    const replacementSource = createWritingDocument('第一单元一。\n\n第一单元二。\n\n第一单元三。\n\n第二单元。')
    const replacementNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: replacementSource }
    })
    await flushPromises()
    replacementNotebook.vm.editor.commands.selectAll()
    expect(replacementNotebook.vm.getCommandAvailability()).toMatchObject({
      cut: false,
      copy: true,
      paste: true,
      deleteSelection: true
    })
    const beforeMissingPayloadPaste = replacementNotebook.vm.editor.state.doc.textContent
    const missingPayloadPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(missingPayloadPaste, 'clipboardData', {
      value: { getData: () => '', types: ['Files'] }
    })
    replacementNotebook.find('.ProseMirror').element.dispatchEvent(missingPayloadPaste)
    expect(missingPayloadPaste.defaultPrevented).toBe(false)
    expect(replacementNotebook.vm.editor.state.doc.textContent).toBe(beforeMissingPayloadPaste)

    const replacementEventsBefore = replacementNotebook.emitted('unit-transition')?.length || 0
    const textPayloadPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(textPayloadPaste, 'clipboardData', {
      value: { getData: (type) => type === 'text/plain' ? '替换甲。\n替换乙。' : '', types: ['text/plain'] }
    })
    replacementNotebook.find('.ProseMirror').element.dispatchEvent(textPayloadPaste)
    await flushPromises()
    expect(textPayloadPaste.defaultPrevented).toBe(true)
    expect(replacementNotebook.vm.editor.state.doc.textContent).toBe('替换甲。替换乙。')
    const replaceTransition = replacementNotebook.emitted('unit-transition')?.at(replacementEventsBefore)?.[0]
    expect(replaceTransition).toMatchObject({ type: 'replace-all' })
    const structuralDocumentEvent = replacementNotebook.emitted('update:document')?.at(-1)
    expect(structuralDocumentEvent?.[1]).toBe(replaceTransition)
    expect(replacementNotebook.vm.undo()).toBe(true)
    expect(replacementNotebook.vm.editor.state.doc.textContent).toBe(beforeMissingPayloadPaste)
    replacementNotebook.unmount()

    const compositionNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: createWritingDocument('不得被候选过程清掉。') }
    })
    await flushPromises()
    compositionNotebook.vm.editor.commands.selectAll()
    const compositionSurface = compositionNotebook.find('.ProseMirror').element
    compositionSurface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    expect(compositionNotebook.vm.editor.state.doc.textContent).toBe('不得被候选过程清掉。')
    compositionSurface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '最终合成。' }))
    await vi.waitFor(() => {
      expect(compositionNotebook.vm.editor.state.doc.textContent).toBe('最终合成。')
    })
    expect(compositionNotebook.emitted('unit-transition')?.at(-1)?.[0]).toMatchObject({ type: 'replace-all' })
    expect(compositionNotebook.vm.undo()).toBe(true)
    expect(compositionNotebook.vm.editor.state.doc.textContent).toBe('不得被候选过程清掉。')
    compositionNotebook.unmount()

    const staleCompositionNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: createWritingDocument('旧正文。') }
    })
    await flushPromises()
    staleCompositionNotebook.vm.editor.commands.selectAll()
    const staleCompositionSurface = staleCompositionNotebook.find('.ProseMirror').element
    staleCompositionSurface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    staleCompositionSurface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '迟到候选。' }))
    await staleCompositionNotebook.setProps({ document: createWritingDocument('刚恢复的正文。') })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(staleCompositionNotebook.vm.editor.state.doc.textContent).toBe('刚恢复的正文。')
    expect(staleCompositionNotebook.emitted('composition-change')?.at(-1)).toEqual([
      false,
      { reason: 'external-document' }
    ])
    staleCompositionNotebook.unmount()

    const rewriteSource = createWritingDocument('改写前。')
    const rewriteNodeId = rewriteSource.content[0].content[0].attrs.nodeId
    const rewriteNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: rewriteSource }
    })
    await flushPromises()
    expect(rewriteNotebook.vm.replaceNodeText(rewriteNodeId, 'AI 改写。', { origin: 'writing-agent' })).toBe(true)
    expect(rewriteNotebook.vm.insertPlainText('用户续写。')).toBe(true)
    expect(rewriteNotebook.vm.undo()).toBe(true)
    expect(rewriteNotebook.vm.editor.state.doc.textContent).toBe('AI 改写。')
    expect(rewriteNotebook.vm.undo()).toBe(true)
    expect(rewriteNotebook.vm.editor.state.doc.textContent).toBe('改写前。')
    rewriteNotebook.unmount()

    const quoteSource = createWritingDocument('> 甲。\n> 乙。\n')
    const quoteNodeId = quoteSource.content[0].content[0].attrs.nodeId
    const quoteNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: quoteSource }
    })
    await flushPromises()
    expect(quoteNotebook.vm.selectText('乙。', 0, quoteNodeId)).toBe(true)
    await flushPromises()
    expect(quoteNotebook.emitted('selection-change')?.at(-1)?.[0]).toMatchObject({
      nodeId: quoteNodeId,
      currentNodeText: '甲。\n乙。',
      selectionLocalStart: 3,
      selectionLocalEnd: 5
    })
    expect(quoteNotebook.vm.getCommandAvailability()).toMatchObject({ cut: false, copy: true })
    expect(quoteNotebook.vm.replaceNodeText(quoteNodeId, '新甲。\n新乙。', { origin: 'writing-agent' })).toBe(true)
    await flushPromises()
    const quoteDocument = quoteNotebook.emitted('update:document')?.at(-1)?.[0]
    expect(getWritingDocumentMarkdown(quoteDocument)).toBe('> 新甲。\n> 新乙。\n')
    expect(quoteNotebook.vm.undo()).toBe(true)
    expect(getWritingDocumentMarkdown(quoteNotebook.emitted('update:document')?.at(-1)?.[0])).toBe('> 甲。\n> 乙。\n')
    expect(quoteNotebook.vm.replaceNodeText(quoteNodeId, '段一。\n\n段二。', { origin: 'writing-agent' })).toBe(true)
    await flushPromises()
    const paragraphQuoteDocument = quoteNotebook.emitted('update:document')?.at(-1)?.[0]
    expect(writingDocumentToEditorContent(paragraphQuoteDocument)[0].content[0].content).toHaveLength(2)
    expect(getWritingDocumentMarkdown(paragraphQuoteDocument)).toBe('> 段一。\n> \n> 段二。\n')
    expect(quoteNotebook.vm.selectText('段一。\n\n段二。', 0, quoteNodeId)).toBe(true)
    await flushPromises()
    expect(quoteNotebook.emitted('selection-change')?.at(-1)?.[0]).toMatchObject({
      text: '段一。\n\n段二。',
      selectionLocalStart: 0,
      selectionLocalEnd: 8
    })
    quoteNotebook.unmount()

    const identitySource = createWritingDocument('节点身份不能丢。')
    const identityNodeId = identitySource.content[0].content[0].attrs.nodeId
    const identityNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: identitySource }
    })
    await flushPromises()
    identityNotebook.vm.editor.commands.focus('end', { scrollIntoView: false })
    const selectionBeforeKeyboardMenu = {
      from: identityNotebook.vm.editor.state.selection.from,
      to: identityNotebook.vm.editor.state.selection.to
    }
    const keyboardContextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 0,
      clientY: 0
    })
    identityNotebook.find('.ProseMirror').element.dispatchEvent(keyboardContextEvent)
    expect(identityNotebook.vm.editor.state.selection.from).toBe(selectionBeforeKeyboardMenu.from)
    expect(identityNotebook.vm.editor.state.selection.to).toBe(selectionBeforeKeyboardMenu.to)
    expect(identityNotebook.emitted('context-menu')?.at(-1)?.[1]).toMatchObject({ keyboardTriggered: true })

    await identityNotebook.find('.ProseMirror').trigger('keydown', { key: '/', ctrlKey: true })
    await nextTick()
    const commandMenuText = document.body.querySelector('.writing-command-menu')?.textContent || ''
    expect(commandMenuText).toContain('审查本章')
    expect(commandMenuText).not.toContain('插入结构')
    identityNotebook.vm.closeCommandMenu()

    expect(identityNotebook.vm.selectText('身份', 0, identityNodeId)).toBe(true)
    expect(identityNotebook.vm.getCommandAvailability()).toMatchObject({ cut: true, copy: true })
    expect(identityNotebook.vm.insertDivider()).toBe(true)
    const identityJson = identityNotebook.vm.editor.getJSON()
    expect(identityJson.content[0].content[0]).toMatchObject({
      type: 'paragraph',
      attrs: { nodeId: identityNodeId }
    })
    expect(identityJson.content[0].content[0].content.map((node) => node.text).join('')).toBe('节点身份不能丢。')
    expect(identityJson.content[0].content[1].type).toBe('horizontalRule')
    let dividerPosition = null
    identityNotebook.vm.editor.state.doc.descendants((node, pos) => {
      if (dividerPosition == null && node.type.name === 'horizontalRule') dividerPosition = pos
    })
    identityNotebook.vm.editor.commands.setNodeSelection(dividerPosition)
    expect(identityNotebook.vm.getCommandAvailability()).toMatchObject({
      cut: false,
      copy: false,
      paste: false,
      deleteSelection: true
    })
    expect(identityNotebook.vm.undo()).toBe(true)
    expect(identityNotebook.vm.editor.getJSON().content[0].content).toHaveLength(1)
    identityNotebook.unmount()

    const boundaryAvailabilitySource = createWritingDocument('左一。\n\n左二。\n\n左三。\n\n右一。')
    const boundaryAvailabilityNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: boundaryAvailabilitySource }
    })
    await flushPromises()
    const firstBoundaryNode = boundaryAvailabilitySource.content[0].content[0]
    const lastBoundaryNode = boundaryAvailabilitySource.content.at(-1).content.at(-1)
    expect(boundaryAvailabilityNotebook.vm.selectNodeRange(
      firstBoundaryNode.attrs.nodeId,
      0,
      lastBoundaryNode.attrs.nodeId,
      lastBoundaryNode.content.map((node) => node.text || '').join('').length
    )).toBe(true)
    expect(boundaryAvailabilityNotebook.vm.getCommandAvailability()).toMatchObject({
      cut: false,
      copy: true,
      paste: false,
      deleteSelection: false
    })
    boundaryAvailabilityNotebook.unmount()

    const splitQuoteSource = createWritingDocument('> 甲。\n>\n> 乙。\n')
    const splitQuoteEditor = makeUnitEditor(splitQuoteSource)
    let firstQuoteParagraphPos = null
    let secondQuoteParagraphPos = null
    let quoteParagraphIndex = 0
    splitQuoteEditor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return true
      if (quoteParagraphIndex === 0) firstQuoteParagraphPos = pos
      if (quoteParagraphIndex === 1) secondQuoteParagraphPos = pos
      quoteParagraphIndex += 1
      return true
    })
    let quoteSplitTransition = null
    splitQuoteEditor.on('transaction', ({ transaction }) => {
      quoteSplitTransition = transaction.getMeta('writingUnitTransition') || quoteSplitTransition
    })
    splitQuoteEditor.commands.setTextSelection(secondQuoteParagraphPos + 1)
    expect(splitQuoteEditor.commands.splitWritingUnit()).toBe(true)
    const splitQuoteJson = splitQuoteEditor.getJSON()
    expect(splitQuoteJson.content).toHaveLength(2)
    expect(splitQuoteJson.content[0].content[0].content[0].content.map((node) => node.text)).toEqual(['甲。'])
    expect(splitQuoteJson.content[1].content[0].content[0].content.map((node) => node.text)).toEqual(['乙。'])
    expect(quoteSplitTransition.splitNode.offset).toBe(4)
    expect(splitQuoteEditor.state.selection.$from.node(1).attrs.unitId).toBe(splitQuoteJson.content[1].attrs.unitId)
    splitQuoteEditor.destroy()

    const endOfFirstQuoteEditor = makeUnitEditor(splitQuoteSource)
    let endOfFirstTransition = null
    endOfFirstQuoteEditor.on('transaction', ({ transaction }) => {
      endOfFirstTransition = transaction.getMeta('writingUnitTransition') || endOfFirstTransition
    })
    endOfFirstQuoteEditor.commands.setTextSelection(firstQuoteParagraphPos + 1 + '甲。'.length)
    expect(endOfFirstQuoteEditor.commands.splitWritingUnit()).toBe(true)
    expect(endOfFirstTransition.splitNode.offset).toBe(4)
    expect(endOfFirstQuoteEditor.getJSON().content).toHaveLength(2)
    endOfFirstQuoteEditor.destroy()

    for (const literalTrigger of [' ', '/']) {
      const commandNotebook = mount(WritingNotebookEditor, {
        attachTo: document.body,
        props: { document: createWritingDocument('') }
      })
      await flushPromises()
      const view = commandNotebook.vm.editor.view
      const dispatchBeforeInput = () => {
        const event = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: literalTrigger
        })
        return Boolean(view.someProp('handleDOMEvents', (handlers) => handlers.beforeinput?.(view, event)))
      }
      expect(dispatchBeforeInput()).toBe(true)
      expect(commandNotebook.emitted('command-menu-change')?.at(-1)?.[0]).toBe(true)
      expect(dispatchBeforeInput()).toBe(false)
      expect(commandNotebook.emitted('command-menu-change')?.at(-1)?.[0]).toBe(false)
      view.dispatch(view.state.tr.insertText(literalTrigger))
      expect(view.state.doc.textContent).toBe(literalTrigger)
      expect(commandNotebook.emitted('command-menu-change')?.filter(([open]) => open === true)).toHaveLength(1)
      commandNotebook.unmount()
    }

    const shortcutNotebook = mount(WritingNotebookEditor, {
      attachTo: document.body,
      props: { document: createWritingDocument('') }
    })
    await flushPromises()
    const shortcutSurface = shortcutNotebook.find('.ProseMirror').element
    shortcutSurface.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '/',
      code: 'Slash',
      ctrlKey: true
    }))
    const repeatedShortcut = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '/',
      code: 'Slash',
      ctrlKey: true,
      repeat: true
    })
    shortcutSurface.dispatchEvent(repeatedShortcut)
    expect(repeatedShortcut.defaultPrevented).toBe(true)
    expect(shortcutNotebook.emitted('command-menu-change')?.filter(([open]) => open === true)).toHaveLength(1)
    expect(shortcutNotebook.emitted('command-menu-change')?.filter(([open]) => open === false) || []).toHaveLength(0)
    shortcutNotebook.vm.closeCommandMenu()
    await shortcutNotebook.setProps({ blockComposerOpen: true, interactionOwner: 'block-composer' })
    shortcutNotebook.vm.editor.commands.insertContent('　 ')
    shortcutSurface.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '/' }))
    expect(shortcutNotebook.emitted('command-menu-change')?.at(-1)?.[0]).toBe(true)
    expect(shortcutNotebook.vm.editor.state.doc.textContent).toBe('　 ')
    shortcutNotebook.vm.closeCommandMenu()
    await shortcutNotebook.setProps({ interactionOwner: 'modal' })
    shortcutSurface.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '/' }))
    expect(shortcutNotebook.emitted('command-menu-change')?.at(-1)?.[0]).toBe(false)
    shortcutNotebook.unmount()

    // 文档作用域必须通过 Vue key 重建整个 ProseMirror 实例。仅 setContent
    // 会把旧 history 映射到新 doc，随后 undo 可把上一章写进当前章。
    const scopedKey = ref('book-1:chapter:a')
    const scopedDocument = ref(createWritingDocument('甲章正文。'))
    const scopedEditor = ref(null)
    const ScopedNotebookHost = defineComponent({
      setup() {
        return () => h(WritingNotebookEditor, {
          key: scopedKey.value,
          ref: scopedEditor,
          document: scopedDocument.value
        })
      }
    })
    const scopedHost = mount(ScopedNotebookHost, { attachTo: document.body })
    await flushPromises()
    expect(scopedEditor.value.insertPlainText('旧章修改')).toBe(true)
    const previousEditor = scopedEditor.value
    scopedDocument.value = createWritingDocument('乙章正文。')
    scopedKey.value = 'book-1:chapter:b'
    await nextTick()
    await flushPromises()
    expect(scopedEditor.value).not.toBe(previousEditor)
    expect(scopedHost.find('.ProseMirror').text()).toContain('乙章正文。')
    expect(scopedEditor.value.undo()).toBe(false)
    expect(scopedHost.find('.ProseMirror').text()).not.toContain('甲章正文。')
    scopedHost.unmount()

    const unchangedRewriteTarget = {
      chapterId: 'chapter-1',
      documentRevision: 4,
      unitId: 'unit-1',
      unitRevision: 2,
      nodeId: 'node-1',
      nodeRevision: 2,
      baseText: '仍是同一段正文'
    }
    expect(getWritingCandidateStaleReason(unchangedRewriteTarget, {
      chapterId: 'chapter-1',
      documentRevision: 5,
      nodes: [{ unitId: 'unit-1', unitRevision: 2, nodeId: 'node-1', nodeRevision: 2, text: '仍是同一段正文' }]
    })).toBe('')
    expect(getWritingCandidateStaleReason(unchangedRewriteTarget, {
      chapterId: 'chapter-1',
      documentRevision: 5,
      nodes: [{ unitId: 'unit-1', unitRevision: 3, nodeId: 'node-1', nodeRevision: 2, text: '仍是同一段正文' }]
    })).toBe('unit-revision-changed')
    const candidateRequest = createWritingCandidateRequest({
      target: { kind: 'block', unitId: 'unit-1', unitRevision: 2, nodeId: 'node-1', nodeRevision: 2, text: '整段正文' },
      documentRevision: 5,
      chapterId: 'chapter-1',
      question: '改写上一段'
    })
    expect(candidateRequest.target.kind).toBe('paragraph')
    expect(JSON.stringify(candidateRequest)).not.toMatch(/blockId|blockRevision/)
    const inlineAgentInput = buildWritingAgentInput({
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterTitle: '第一章',
      content: '整段正文',
      documentRevision: 5,
      nodeTarget: { unitId: 'unit-1', unitRevision: 2, nodeId: 'node-1', nodeRevision: 3, start: 0, end: 4 }
    }, 4)
    expect(JSON.stringify(inlineAgentInput.envelope)).toContain('当前单元：unit-1（revision 2）')
    expect(JSON.stringify(inlineAgentInput.envelope)).toContain('当前节点：node-1（revision 3）')
    expect(JSON.stringify(inlineAgentInput)).not.toMatch(/blockId|blockRevision/)
    const normalizedCandidate = normalizeWritingCandidateResponse({
      candidates: [{ nodeId: 'node-1', replacement: '改写正文' }]
    }, candidateRequest)[0]
    expect(normalizedCandidate).toMatchObject({ nodeId: 'node-1', nodeRevision: 2 })
    expect(normalizedCandidate).not.toHaveProperty('blockId')
    expect(normalizedCandidate).not.toHaveProperty('blockRevision')
    const reviewFinding = normalizeWritingReviewFindings([{
      kind: '衔接',
      body: '前后动作缺少因果连接。',
      start: { nodeId: 'node-1', offset: 0 },
      end: { nodeId: 'node-1', offset: 2 },
      exact: '整段'
    }], {
      blocks: [{ unitId: 'unit-1', unitRevision: 2, nodeId: 'node-1', nodeRevision: 2, text: '整段正文' }]
    })[0]
    expect(reviewFinding).toMatchObject({
      start: { unitId: 'unit-1', nodeId: 'node-1', nodeRevision: 2 },
      end: { unitId: 'unit-1', nodeId: 'node-1', nodeRevision: 2 },
      nodeIds: ['node-1']
    })
    expect(JSON.stringify(reviewFinding)).not.toMatch(/blockId|blockRevision/)
    expect(createWritingCandidateRequest({
      target: { kind: 'multi-selection', text: '跨段选区', blocks: [] },
      documentRevision: 5,
      chapterId: 'chapter-1',
      question: '改写选区'
    }).target.kind).toBe('selection')

    const annotationDocument = createWritingDocument('甲。\n\n唯一锚点。')
    const annotationNode = annotationDocument.content[0].content[1]
    const annotation = createWritingAnnotation({
      chapterId: 'chapter-1',
      target: {
        unitId: annotationDocument.content[0].attrs.unitId,
        unitRevision: annotationDocument.content[0].attrs.unitRevision,
        nodeId: annotationNode.attrs.nodeId,
        nodeRevision: annotationNode.attrs.nodeRevision,
        start: 0,
        end: 5
      },
      selector: createWritingSelector({ text: '唯一锚点', start: 0, end: 4, fullText: '唯一锚点。' }),
      body: '检查这里'
    })
    expect(annotation).not.toHaveProperty('blockId')
    expect(annotation).not.toHaveProperty('blockRevision')
    const qualityReport = buildWritingQualityReport({
      document: annotationDocument,
      annotations: [{ ...annotation, kind: 'review-finding', severity: 'high', status: 'open' }]
    })
    expect(qualityReport.issues.some((issue) => issue.kind === 'empty-chapter')).toBe(false)
    const qualityFinding = qualityReport.issues.find((issue) => issue.kind === 'open-review-finding')
    expect(qualityFinding).toMatchObject({ nodeId: annotationNode.attrs.nodeId })
    expect(qualityFinding).not.toHaveProperty('blockId')
    const splitDocument = {
      ...annotationDocument,
      content: [
        { ...annotationDocument.content[0], content: [annotationDocument.content[0].content[0]] },
        { ...annotationDocument.content[0], attrs: { ...annotationDocument.content[0].attrs, unitId: 'unit-right' }, content: [annotationNode] }
      ]
    }
    const afterSplit = reconcileWritingAnnotations([{
      ...annotation,
      schemaVersion: 2,
      blockId: annotationNode.attrs.nodeId,
      blockRevision: annotationNode.attrs.nodeRevision,
      target: undefined
    }], splitDocument, 'chapter-1', annotationDocument, {
      type: 'split',
      keptUnitId: annotationDocument.content[0].attrs.unitId,
      createdUnitId: 'unit-right',
      nodeUnitMap: { [annotationNode.attrs.nodeId]: 'unit-right' }
    })[0]
    expect(afterSplit).toMatchObject({ status: 'open', target: { unitId: 'unit-right', nodeId: annotationNode.attrs.nodeId } })
    expect(afterSplit).not.toHaveProperty('blockId')
    expect(afterSplit).not.toHaveProperty('blockRevision')
    expect(resolveWritingAnnotation(afterSplit, splitDocument)).toMatchObject({ target: { nodeId: annotationNode.attrs.nodeId } })

    const replacedAnnotationDocument = createWritingDocument('另一处也写着唯一锚点。')
    replacedAnnotationDocument.content[0].attrs.unitId = annotationDocument.content[0].attrs.unitId
    const afterReplaceAll = reconcileWritingAnnotations(
      [annotation],
      replacedAnnotationDocument,
      'chapter-1',
      annotationDocument,
      {
        type: 'replace-all',
        keptUnitId: annotationDocument.content[0].attrs.unitId,
        affectedUnitIds: [annotationDocument.content[0].attrs.unitId],
        nodeUnitMap: {
          [replacedAnnotationDocument.content[0].content[0].attrs.nodeId]: annotationDocument.content[0].attrs.unitId
        }
      }
    )[0]
    expect(afterReplaceAll).toMatchObject({ status: 'orphaned', resolution: 'unit-content-replaced' })

    const rangedSelector = createWritingSelector({
      text: '唯一锚点',
      start: 0,
      end: 4,
      fullText: '唯一锚点。'
    })
    const rangedAnnotation = createWritingAnnotation({
      chapterId: 'chapter-1',
      target: {
        unitId: annotationDocument.content[0].attrs.unitId,
        nodeId: annotationNode.attrs.nodeId,
        start: 0,
        end: 4
      },
      selector: rangedSelector,
      range: {
        start: { unitId: annotationDocument.content[0].attrs.unitId, nodeId: annotationNode.attrs.nodeId, offset: 0 },
        end: { unitId: annotationDocument.content[0].attrs.unitId, nodeId: annotationNode.attrs.nodeId, offset: 4 },
        nodeIds: [annotationNode.attrs.nodeId],
        unitIds: [annotationDocument.content[0].attrs.unitId],
        exact: '唯一锚点',
        startSelector: rangedSelector,
        endSelector: rangedSelector
      },
      body: '范围必须同步'
    })
    const shiftedRangeDocument = structuredClone(annotationDocument)
    shiftedRangeDocument.content[0].attrs.unitRevision += 1
    shiftedRangeDocument.content[0].content[1].attrs.nodeRevision += 1
    shiftedRangeDocument.content[0].content[1].content = [{ type: 'text', text: '前插唯一锚点。' }]
    const shiftedRangeAnnotation = reconcileWritingAnnotations(
      [rangedAnnotation],
      shiftedRangeDocument,
      'chapter-1',
      annotationDocument
    )[0]
    expect(shiftedRangeAnnotation).toMatchObject({
      status: 'open',
      target: { nodeId: annotationNode.attrs.nodeId, start: 2, end: 6 },
      range: {
        start: { nodeId: annotationNode.attrs.nodeId, offset: 2 },
        end: { nodeId: annotationNode.attrs.nodeId, offset: 6 },
        exact: '唯一锚点'
      }
    })

    const splitSource = createWritingDocument('左左右右')
    const splitSourceUnit = splitSource.content[0]
    const splitSourceNode = splitSourceUnit.content[0]
    const splitRightNode = {
      ...structuredClone(splitSourceNode),
      attrs: { ...splitSourceNode.attrs, nodeId: 'node-split-right' },
      content: [{ type: 'text', text: '右右' }]
    }
    const splitByOffsetDocument = {
      ...splitSource,
      content: [
        {
          ...splitSourceUnit,
          content: [{ ...structuredClone(splitSourceNode), content: [{ type: 'text', text: '左左' }] }]
        },
        {
          ...splitSourceUnit,
          attrs: { ...splitSourceUnit.attrs, unitId: 'unit-split-right' },
          content: [splitRightNode]
        }
      ]
    }
    const makeSplitAnnotation = (id, start, end) => {
      const exact = '左左右右'.slice(start, end)
      const selector = createWritingSelector({
        text: exact,
        start,
        end,
        fullText: '左左右右'
      })
      return {
        ...createWritingAnnotation({
        chapterId: 'chapter-1',
        target: {
          unitId: splitSourceUnit.attrs.unitId,
          nodeId: splitSourceNode.attrs.nodeId,
          start,
          end
        },
        selector,
        range: {
          start: { unitId: splitSourceUnit.attrs.unitId, nodeId: splitSourceNode.attrs.nodeId, offset: start },
          end: { unitId: splitSourceUnit.attrs.unitId, nodeId: splitSourceNode.attrs.nodeId, offset: end },
          nodeIds: [splitSourceNode.attrs.nodeId],
          unitIds: [splitSourceUnit.attrs.unitId],
          exact,
          startSelector: selector,
          endSelector: selector
        },
        body: id
      }),
        id
      }
    }
    const splitAnnotations = reconcileWritingAnnotations([
      makeSplitAnnotation('split-left', 0, 2),
      makeSplitAnnotation('split-right', 2, 4),
      makeSplitAnnotation('split-crossing', 1, 3)
    ], splitByOffsetDocument, 'chapter-1', splitSource, {
      type: 'split',
      keptUnitId: splitSourceUnit.attrs.unitId,
      createdUnitId: 'unit-split-right',
      nodeUnitMap: {
        [splitSourceNode.attrs.nodeId]: splitSourceUnit.attrs.unitId,
        'node-split-right': 'unit-split-right'
      },
      splitNode: {
        oldNodeId: splitSourceNode.attrs.nodeId,
        newNodeId: 'node-split-right',
        offset: 2
      }
    })
    expect(splitAnnotations.find((item) => item.id === 'split-left')).toMatchObject({
      status: 'open',
      target: { unitId: splitSourceUnit.attrs.unitId, nodeId: splitSourceNode.attrs.nodeId, start: 0, end: 2 },
      range: {
        start: { nodeId: splitSourceNode.attrs.nodeId, offset: 0 },
        end: { nodeId: splitSourceNode.attrs.nodeId, offset: 2 }
      }
    })
    expect(splitAnnotations.find((item) => item.id === 'split-right')).toMatchObject({
      status: 'open',
      target: { unitId: 'unit-split-right', nodeId: 'node-split-right', start: 0, end: 2 },
      range: {
        start: { nodeId: 'node-split-right', offset: 0 },
        end: { nodeId: 'node-split-right', offset: 2 }
      }
    })
    expect(splitAnnotations.find((item) => item.id === 'split-crossing')).toMatchObject({
      status: 'orphaned', resolution: 'split-boundary'
    })

    const crossRangeSource = createWritingDocument('甲乙丙丁\n\n末段')
    const crossRangeUnit = crossRangeSource.content[0]
    const crossRangeStartNode = crossRangeUnit.content[0]
    const crossRangeEndNode = crossRangeUnit.content[1]
    const crossStartSelector = createWritingSelector({ text: '乙丙丁', start: 1, end: 4, fullText: '甲乙丙丁' })
    const crossEndSelector = createWritingSelector({ text: '末段', start: 0, end: 2, fullText: '末段' })
    const crossRangeAnnotation = createWritingAnnotation({
      chapterId: 'chapter-1',
      target: {
        unitId: crossRangeUnit.attrs.unitId,
        nodeId: crossRangeStartNode.attrs.nodeId,
        start: 1,
        end: 4
      },
      selector: crossStartSelector,
      range: {
        start: { unitId: crossRangeUnit.attrs.unitId, nodeId: crossRangeStartNode.attrs.nodeId, offset: 1 },
        end: { unitId: crossRangeUnit.attrs.unitId, nodeId: crossRangeEndNode.attrs.nodeId, offset: 2 },
        nodeIds: [crossRangeStartNode.attrs.nodeId, crossRangeEndNode.attrs.nodeId],
        unitIds: [crossRangeUnit.attrs.unitId],
        exact: '乙丙丁\n末段',
        startSelector: crossStartSelector,
        endSelector: crossEndSelector
      },
      body: '跨节点拆分后仍应稳定'
    })
    const crossRangeRightNode = {
      ...structuredClone(crossRangeStartNode),
      attrs: { ...crossRangeStartNode.attrs, nodeId: 'node-cross-range-right' },
      content: [{ type: 'text', text: '丙丁' }]
    }
    const crossRangeSplitDocument = {
      ...crossRangeSource,
      content: [
        {
          ...crossRangeUnit,
          content: [{ ...structuredClone(crossRangeStartNode), content: [{ type: 'text', text: '甲乙' }] }]
        },
        {
          ...crossRangeUnit,
          attrs: { ...crossRangeUnit.attrs, unitId: 'unit-cross-range-right' },
          content: [crossRangeRightNode, crossRangeEndNode]
        }
      ]
    }
    const transitionedCrossRange = reconcileWritingAnnotations(
      [crossRangeAnnotation],
      crossRangeSplitDocument,
      'chapter-1',
      crossRangeSource,
      {
        type: 'split',
        keptUnitId: crossRangeUnit.attrs.unitId,
        createdUnitId: 'unit-cross-range-right',
        nodeUnitMap: {
          [crossRangeStartNode.attrs.nodeId]: crossRangeUnit.attrs.unitId,
          'node-cross-range-right': 'unit-cross-range-right',
          [crossRangeEndNode.attrs.nodeId]: 'unit-cross-range-right'
        },
        splitNode: {
          oldNodeId: crossRangeStartNode.attrs.nodeId,
          newNodeId: 'node-cross-range-right',
          offset: 2
        }
      }
    )[0]
    expect(transitionedCrossRange).toMatchObject({
      status: 'open',
      range: {
        startSelector: { exact: '乙' },
        endSelector: { exact: '末段' },
        nodeIds: [crossRangeStartNode.attrs.nodeId, 'node-cross-range-right', crossRangeEndNode.attrs.nodeId]
      }
    })
    expect(reconcileWritingAnnotations(
      [transitionedCrossRange],
      crossRangeSplitDocument,
      'chapter-1',
      crossRangeSplitDocument
    )[0]).toMatchObject({ status: 'open', resolution: 'range-quote' })

    const historyBefore = createWritingDocument('甲。\n\n乙。')
    const historyAfter = structuredClone(historyBefore)
    historyAfter.revision += 1
    historyAfter.content[0].attrs.unitRevision += 1
    historyAfter.content[0].content[1].attrs.nodeRevision += 1
    historyAfter.content[0].content[1].content = [{ type: 'text', text: '乙，改。' }]
    const historyEntries = buildWritingBlockHistoryEntries({
      chapterId: 'chapter-1',
      previousDocument: historyBefore,
      nextDocument: historyAfter
    })
    expect(historyEntries).toHaveLength(1)
    expect(historyEntries[0]).toMatchObject({
      schemaVersion: 2,
      unitId: historyBefore.content[0].attrs.unitId,
      nodeId: historyBefore.content[0].content[1].attrs.nodeId
    })
    expect(normalizeWritingBlockHistoryEntry({
      schemaVersion: 1,
      id: 'legacy-history',
      chapterId: 'chapter-1',
      blockId: 'legacy-node',
      blockKind: 'prose',
      fromBlockRevision: 3,
      toBlockRevision: 4,
      previousText: '旧文',
      currentText: '新文',
      createdAt: '2026-08-17T00:00:00.000Z'
    })).toMatchObject({
      schemaVersion: 2,
      unitId: null,
      nodeId: 'legacy-node',
      fromNodeRevision: 3,
      toNodeRevision: 4
    })
    const snapshot = createWritingSnapshot({
      chapterId: 'chapter-1',
      document: historyAfter,
      markdown: getWritingDocumentMarkdown(historyAfter)
    })
    expect(normalizeStoredWritingSnapshot(snapshot)?.editorDocument).toEqual(historyAfter)
    expect(normalizeStoredWritingSnapshot({
      ...snapshot,
      editorDocument: v2,
      documentRevision: v2.revision
    })?.editorDocument).toMatchObject({ schemaVersion: 3, revision: v2.revision })

    const formattingSource = createWritingDocument('甲。')
    const formattingEditor = writingDocumentToEditorContent(formattingSource)
    const markedEditor = structuredClone(formattingEditor)
    markedEditor[0].content[0].content[0].marks = [{ type: 'bold' }]
    const markedDocument = editorContentToWritingDocument(markedEditor, formattingSource)
    expect(markedDocument.content[0].content[0].attrs).toMatchObject({ nodeRevision: 1, rawMarkdown: null })
    expect(getWritingDocumentMarkdown(markedDocument)).toContain('**甲。**')

    const quotedEditor = structuredClone(formattingEditor)
    quotedEditor[0].content[0].type = 'blockquote'
    quotedEditor[0].content[0].attrs.nodeKind = 'quote'
    quotedEditor[0].content[0].content = [{ type: 'paragraph', content: [{ type: 'text', text: '甲。' }] }]
    const quotedDocument = editorContentToWritingDocument(quotedEditor, formattingSource)
    expect(quotedDocument.content[0].content[0].attrs).toMatchObject({ nodeRevision: 1, rawMarkdown: null })
    expect(getWritingDocumentMarkdown(quotedDocument)).toContain('> 甲。')

    const headingSource = createWritingDocument('# 第一幕')
    const headingEditor = writingDocumentToEditorContent(headingSource)
    headingEditor[0].content[0].attrs.level = 2
    const relevelledDocument = editorContentToWritingDocument(headingEditor, headingSource)
    expect(relevelledDocument.content[0].content[0].attrs).toMatchObject({ nodeRevision: 1, rawMarkdown: null, level: 2 })
    expect(getWritingDocumentMarkdown(relevelledDocument)).toContain('## 第一幕')
    localStorage.removeItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS)
    expect(saveWritingSnapshot(snapshot).ok).toBe(true)
    const recoveryDraft = createWritingSnapshot({
      id: 'recovery-chapter-1',
      chapterId: 'chapter-1',
      label: '未保存草稿',
      reason: 'crash-recovery',
      document: historyAfter,
      markdown: getWritingDocumentMarkdown(historyAfter)
    })
    expect(saveWritingRecoveryDraft(recoveryDraft).ok).toBe(true)
    expect(listWritingSnapshots('chapter-1').map((item) => item.id)).toEqual([snapshot.id])
    expect(listWritingRecoveryDrafts('chapter-1').map((item) => item.id)).toEqual(['recovery-chapter-1'])
    expect(historyEntries).toHaveLength(1)
    for (let index = 0; index < 5; index += 1) {
      const old = createWritingSnapshot({ id: `cleanup-${index}`, chapterId: 'cleanup-chapter', label: '旧自动版本', reason: 'word-milestone', document: historyAfter, markdown: getWritingDocumentMarkdown(historyAfter), milestone: { intervalWords: 100, fromWordCount: 0, toWordCount: 100, crossedBoundaries: [100] } })
      old.createdAt = new Date(Date.now() - (40 + index) * 86400000).toISOString()
      expect(saveWritingSnapshot(old).ok).toBe(true)
    }
    const cleanup = previewWritingSnapshotCleanup()
    expect(cleanup.map(row => row.id)).toEqual(['cleanup-3', 'cleanup-4'])
    const beforeCleanup = localStorage.getItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    expect(cleanWritingSnapshotPreview([{ ...cleanup[0], label: 'stale' }]).reason).toBe('cleanup-preview-stale')
    expect(localStorage.getItem(STORAGE_KEYS.WRITING_SNAPSHOTS)).toBe(beforeCleanup)
    const deniedCleanupWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    expect(cleanWritingSnapshotPreview(cleanup).ok).toBe(false)
    deniedCleanupWrite.mockRestore()
    expect(localStorage.getItem(STORAGE_KEYS.WRITING_SNAPSHOTS)).toBe(beforeCleanup)
    expect(cleanWritingSnapshotPreview(cleanup)).toMatchObject({ ok: true, removed: 2 })
    expect(listWritingSnapshots('cleanup-chapter')).toHaveLength(3)
    expect(listWritingSnapshots('chapter-1').map(row => row.id)).toEqual([snapshot.id])
    expect(listWritingRecoveryDrafts('chapter-1').map(row => row.id)).toEqual(['recovery-chapter-1'])
    localStorage.removeItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS)

    // F2-6 校对：合法中文嵌套引号和段首全角缩进不能被本地扫描误修；
    // 相邻窗口的重叠节点只能产生一个稳定 finding，批量采用保持单事务且
    // 在范围相交或来源 revision 变化时 fail closed。
    const reviewDocument = createWritingDocument([
      '　　“她说：‘回来。’”',
      '这里这里。。',
      '第三段正常。',
      '第四段正常。'
    ].join('\n\n'))
    const reviewSession = createAuthoringReviewSession({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'review-chapter',
      chapterId: 'review-chapter',
      documentRevision: reviewDocument.revision,
      document: reviewDocument,
      maxNodesPerWindow: 2,
      windowOverlap: 1
    })
    expect(reviewSession).toBeTruthy()
    expect(reviewSession.windows).toHaveLength(3)
    expect(reviewSession.windows[1].blocks[0].nodeId)
      .toBe(reviewSession.windows[0].blocks.at(-1).nodeId)
    expect(inspectChineseQuoteNesting('“她说：‘回来。’”')).toEqual({ valid: true, reason: '' })
    expect(inspectChineseQuoteNesting('“她说：“回来。””')).toMatchObject({
      valid: false,
      reason: 'noncanonical-opening-quote'
    })
    expect(validateWritingReviewReplacement({
      nodeText: '　　“她说：‘回来。’”',
      startOffset: 0,
      endOffset: 2,
      exact: '　　',
      replacement: ''
    })).toMatchObject({ valid: false, reason: 'first-line-indent-changed' })
    const localReviewFindings = collectLocalAuthoringProofingFindings(reviewSession)
    const protectedQuoteNodeId = reviewSession.windows[0].blocks[0].nodeId
    expect(localReviewFindings.some((finding) => finding.target.nodeId === protectedQuoteNodeId)).toBe(false)
    expect(localReviewFindings.map((finding) => finding.issueType)).toEqual(
      expect.arrayContaining(['punctuation', 'repetition'])
    )

    const worldbookReviewDocument = createWritingDocument('艾德加沿着雨街走向钟楼。')
    const worldbookReviewSession = createAuthoringReviewSession({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'worldbook-review-chapter',
      chapterId: 'worldbook-review-chapter',
      documentRevision: worldbookReviewDocument.revision,
      document: worldbookReviewDocument,
      sceneProjection: {
        projectionFingerprint: 'scene-review-1',
        presentCharacters: [{ id: 'scene-forced', name: '场内角色' }]
      },
      worldbookEntries: [
        {
          id: 'matched-edgar',
          name: '艾德加',
          keys: ['艾德加'],
          content: '艾德加是旧港档案员。'
        },
        {
          id: 'scene-forced',
          name: '场内角色',
          keys: ['正文没有这个触发词'],
          content: '此人已经精确进入当前场。',
          revision: 3
        },
        {
          id: 'unrelated-lore',
          name: '无关沙海',
          keys: ['沙海'],
          content: '远方沙海与当前正文无关。'
        },
        {
          id: 'disabled-edgar',
          name: '停用艾德加',
          keys: ['艾德加'],
          content: '停用条目不得进入校对证据。',
          enabled: false
        }
      ]
    })
    const selectedReviewWorldbookRefs = worldbookReviewSession.evidence
      .filter((entry) => entry.kind === 'worldbook')
      .map((entry) => entry.sourceRef)
    expect(selectedReviewWorldbookRefs).toHaveLength(2)
    expect(selectedReviewWorldbookRefs).toEqual(expect.arrayContaining([
      'worldbook-entry:matched-edgar',
      'worldbook-entry:scene-forced'
    ]))
    expect(selectedReviewWorldbookRefs).not.toEqual(expect.arrayContaining([
      'worldbook-entry:unrelated-lore',
      'worldbook-entry:disabled-edgar'
    ]))
    const changedUndeclaredWorldbookEntry = {
      id: 'matched-edgar',
      name: '艾德加',
      keys: ['艾德加'],
      content: '艾德加的档案内容已经变化。'
    }
    expect(worldbookReviewSession.sourceRevisions['worldbook-entry:matched-edgar']).toMatch(/^authoring-review-worldbook-/)
    expect(assessAuthoringReviewFreshness(worldbookReviewSession, {
      positionIndex: worldbookReviewSession.positionIndex,
      sourceRevisions: {
        ...worldbookReviewSession.sourceRevisions,
        'worldbook-entry:matched-edgar': getAuthoringReviewWorldbookRevision(changedUndeclaredWorldbookEntry)
      }
    })).toMatchObject({
      fresh: false,
      stale: true,
      reason: 'source-revision-changed:worldbook-entry:matched-edgar'
    })

    const scopedReviewDocument = createWritingDocument([
      '第一段提到港区通行令。',
      '第二段记录守门人的动作。',
      '第三段转向雨中的长街。',
      '目标场里的人物停在钟楼下。',
      '第五段继续追踪脚印。',
      '第六段收起旧地图。',
      '尾声回到无人码头。'
    ].join('\n\n'))
    const scopedReviewUnitId = scopedReviewDocument.content[1].attrs.unitId
    const scopedReviewSession = createAuthoringReviewSession({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'scoped-review-chapter',
      chapterId: 'scoped-review-chapter',
      documentRevision: scopedReviewDocument.revision,
      document: scopedReviewDocument,
      unitId: scopedReviewUnitId,
      maxNodesPerWindow: 1,
      windowOverlap: 0,
      sceneProjection: {
        projectionFingerprint: 'scene-scoped-r1',
        presentCharacters: [{ id: 'scene-scoped-character', name: '场内角色' }]
      },
      worldbookEntries: [{
        id: 'scene-scoped-character',
        name: '场内角色',
        keys: ['正文未出现的场景专属触发词'],
        content: '场内角色只约束当前目标写作单元。'
      }, {
        id: 'matched-permit',
        name: '港区通行令',
        keys: ['通行令'],
        content: '港区通行令是全章可核对的相关设定。'
      }]
    })
    const scopedReviewBatches = scopedReviewSession.windows.map((window) => (
      createAuthoringReviewBatchContext(scopedReviewSession, window.id)
    ))
    const selectionNode = scopedReviewDocument.content[0].content[0]
    const selectionText = selectionNode.content?.map((item) => item.text || '').join('') || ''
    const selectionStart = selectionText.indexOf('港区')
    const exactSelectionSession = createAuthoringReviewSession({
      projectId: 'review-book', documentRole: 'manuscript', documentId: 'scoped-review-chapter', chapterId: 'scoped-review-chapter',
      documentRevision: scopedReviewDocument.revision, document: scopedReviewDocument,
      scopeNodeIds: [selectionNode.attrs.nodeId], scopeRanges: [{ nodeId: selectionNode.attrs.nodeId, startOffset: selectionStart, endOffset: selectionStart + 5 }]
    })
    const exactBatch = createAuthoringReviewBatchContext(exactSelectionSession, exactSelectionSession.windows[0].id)
    expect(exactBatch.reviewBlocks[0]).toMatchObject({ text: '港区通行令', reviewStartOffset: selectionStart })
    const exactMerged = mergeAuthoringReviewFindings(exactSelectionSession, [{ windowId: exactSelectionSession.windows[0].id, findings: [{
      kind: 'proofing', issueType: 'grammar', reason: '选区内意见', start: { nodeId: selectionNode.attrs.nodeId, offset: 0 }, end: { nodeId: selectionNode.attrs.nodeId, offset: 2 }, exact: '港区'
    }] }])
    expect(exactMerged.findings.find((finding) => finding.reason === '选区内意见')?.target).toMatchObject({ startOffset: selectionStart, endOffset: selectionStart + 2, exact: '港区' })
    const dualReviewSource = { documentId: 'scoped-review-chapter', documentRole: 'manuscript', documentRevision: scopedReviewDocument.revision, document: scopedReviewDocument }
    const dualRewriteTarget = buildAuthoringReviewRewriteTarget(dualReviewSource, exactMerged.findings.find((finding) => finding.reason === '选区内意见'))
    expect(dualRewriteTarget).toMatchObject({ pane: 'dual', kind: 'selection', text: '港区', startOffset: selectionStart, endOffset: selectionStart + 2 })
    expect(compareAuthoringReviewRewriteTarget(dualReviewSource, dualRewriteTarget)).toMatchObject({ text: '港区', documentRevision: scopedReviewDocument.revision })
    saveAuthoringReviewRun({ id: 'review-resume-fixture', status: 'running', projectId: 'review-book', pane: 'main', documentRole: 'manuscript', documentId: 'scoped-review-chapter', documentRevision: 'r1', goal: '检查选区', skillId: 'motivation-causality', scope: 'selection', scopeRanges: [{ nodeId: selectionNode.attrs.nodeId, startOffset: selectionStart, endOffset: selectionStart + 5 }], batches: [{ windowId: 'window-1', findings: [] }], totalBatches: 2 })
    expect(loadAuthoringReviewRun({ projectId: 'review-book', pane: 'main', documentRole: 'manuscript', documentId: 'scoped-review-chapter' })).toMatchObject({ status: 'interrupted', goal: '检查选区', totalBatches: 2 })
    removeAuthoringReviewRun('review-resume-fixture')
    expect(loadAuthoringReviewRun({ projectId: 'review-book', pane: 'main', documentRole: 'manuscript', documentId: 'scoped-review-chapter' })).toBeNull()
    expect(scopedReviewBatches.some((batch) => (
      !batch.reviewBlocks.some((block) => block.unitId === scopedReviewUnitId)
    ))).toBe(true)
    for (const batch of scopedReviewBatches) {
      const containsTargetUnit = batch.reviewBlocks.some((block) => block.unitId === scopedReviewUnitId)
      const evidenceRefs = batch.evidence.map((entry) => entry.sourceRef)
      expect(evidenceRefs).toContain('worldbook-entry:matched-permit')
      if (containsTargetUnit) {
        expect(evidenceRefs).toEqual(expect.arrayContaining([
          `scene-projection:scoped-review-chapter:${scopedReviewUnitId}`,
          'worldbook-entry:scene-scoped-character'
        ]))
      } else {
        expect(evidenceRefs).not.toContain(`scene-projection:scoped-review-chapter:${scopedReviewUnitId}`)
        expect(evidenceRefs).not.toContain('worldbook-entry:scene-scoped-character')
      }
      expect(batch.allowedEvidenceRefs).toEqual(expect.arrayContaining([
        ...batch.reviewBlocks.flatMap((block) => block.sourceRefs),
        ...evidenceRefs
      ]))
    }

    const cappedWorldbookReviewSession = createAuthoringReviewSession({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'capped-worldbook-review-chapter',
      chapterId: 'capped-worldbook-review-chapter',
      documentRevision: worldbookReviewDocument.revision,
      document: worldbookReviewDocument,
      worldbookEntries: Array.from({ length: 25 }, (_, index) => ({
        id: `constant-review-${String(index + 1).padStart(2, '0')}`,
        name: `常驻校对条目 ${String(index + 1).padStart(2, '0')}`,
        content: '常'.repeat(700),
        injection: { mode: 'constant' }
      }))
    })
    const cappedReviewWorldbookEvidence = cappedWorldbookReviewSession.evidence
      .filter((entry) => entry.kind === 'worldbook')
    expect(cappedReviewWorldbookEvidence).toHaveLength(18)
    expect(cappedReviewWorldbookEvidence.reduce((total, entry) => total + entry.text.length, 0)).toBe(12000)
    expect(cappedReviewWorldbookEvidence.every((entry) => entry.text.length <= 1200)).toBe(true)
    expect(cappedReviewWorldbookEvidence.some((entry) => entry.text.length < 700)).toBe(true)

    const overlapBlock = reviewSession.windows[0].blocks.at(-1)
    const repeatedWindowFinding = {
      issueType: 'typo',
      reason: '重叠窗口只保留一次',
      target: {
        nodeId: overlapBlock.nodeId,
        startOffset: 0,
        endOffset: 2,
        exact: overlapBlock.text.slice(0, 2)
      },
      replacement: '此处'
    }
    const mergedWindowReview = mergeAuthoringReviewFindings(reviewSession, [
      { windowId: reviewSession.windows[0].id, findings: [repeatedWindowFinding] },
      { windowId: reviewSession.windows[1].id, findings: [repeatedWindowFinding] }
    ])
    expect(mergedWindowReview.findings.filter((finding) => finding.reason === '重叠窗口只保留一次'))
      .toHaveLength(1)

    const transactionDocument = createWritingDocument('第一段正常。\n\n错字甲和错字乙。\n\n第三段正常。')
    let transactionSession = createAuthoringReviewSession({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'transaction-chapter',
      chapterId: 'transaction-chapter',
      documentRevision: transactionDocument.revision,
      document: transactionDocument,
      maxNodesPerWindow: 3,
      windowOverlap: 1
    })
    const transactionWindow = transactionSession.windows[0]
    const transactionBlock = transactionWindow.blocks[1]
    const consistencyTarget = {
      nodeId: transactionBlock.nodeId,
      startOffset: 0,
      endOffset: 3,
      exact: '错字甲'
    }
    const consistencyNormalizationOptions = {
      blocks: transactionWindow.blocks,
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'transaction-chapter',
      chapterId: 'transaction-chapter',
      documentRevision: transactionDocument.revision,
      allowedEvidenceRefs: [
        ...transactionBlock.sourceRefs,
        'worldbook-entry:canonical-name',
        'scene-projection:transaction-chapter:current'
      ]
    }
    for (const issueType of ['naming', 'time', 'number', 'scene-conflict']) {
      expect(normalizeWritingReviewFindings([{
        issueType,
        reason: `${issueType} 需要外部事实证据`,
        target: consistencyTarget,
        evidenceRefs: []
      }], consistencyNormalizationOptions), issueType).toEqual([])
    }
    expect(normalizeWritingReviewFindings([{
      issueType: 'naming',
      reason: '目标自身引用不能证明称谓冲突',
      target: consistencyTarget,
      evidenceRefs: transactionBlock.sourceRefs
    }], consistencyNormalizationOptions)).toEqual([])
    expect(normalizeWritingReviewFindings([{
      issueType: 'time',
      reason: '未授权事实引用必须先被过滤',
      target: consistencyTarget,
      evidenceRefs: ['worldbook-entry:not-authorized']
    }], consistencyNormalizationOptions)).toEqual([])
    expect(normalizeWritingReviewFindings([{
      issueType: 'naming',
      reason: '世界书可以证明称谓冲突',
      target: consistencyTarget,
      evidenceRefs: [...transactionBlock.sourceRefs, 'worldbook-entry:canonical-name']
    }], consistencyNormalizationOptions)).toMatchObject([{
      kind: 'consistency',
      issueType: 'naming',
      evidenceRefs: expect.arrayContaining(['worldbook-entry:canonical-name'])
    }])
    expect(normalizeWritingReviewFindings([{
      issueType: 'scene-conflict',
      reason: '当前场投影可以证明现场冲突',
      target: consistencyTarget,
      evidenceRefs: ['scene-projection:transaction-chapter:current']
    }], consistencyNormalizationOptions)).toMatchObject([{
      kind: 'consistency',
      issueType: 'scene-conflict',
      evidenceRefs: ['scene-projection:transaction-chapter:current']
    }])
    expect(normalizeWritingReviewFindings([{
      issueType: 'typo',
      reason: '纯校对问题不依赖外部事实',
      target: consistencyTarget,
      evidenceRefs: []
    }], consistencyNormalizationOptions)).toMatchObject([{
      kind: 'proofing',
      issueType: 'typo',
      evidenceRefs: []
    }])
    transactionSession = mergeAuthoringReviewFindings(transactionSession, [{
      windowId: transactionWindow.id,
      findings: [
        {
          issueType: 'typo',
          reason: '第一处错字',
          target: { nodeId: transactionBlock.nodeId, startOffset: 0, endOffset: 3, exact: '错字甲' },
          replacement: '正甲'
        },
        {
          issueType: 'grammar',
          reason: '相交范围',
          target: { nodeId: transactionBlock.nodeId, startOffset: 2, endOffset: 5, exact: '甲和错' },
          replacement: '甲并正'
        },
        {
          issueType: 'typo',
          reason: '第二处错字',
          target: { nodeId: transactionBlock.nodeId, startOffset: 4, endOffset: 7, exact: '错字乙' },
          replacement: '正字乙'
        }
      ]
    }])
    const reviewFindingId = (reason) => transactionSession.findings.find((finding) => finding.reason === reason)?.id
    const liveReviewSource = (document) => ({
      projectId: 'review-book',
      documentRole: 'manuscript',
      documentId: 'transaction-chapter',
      chapterId: 'transaction-chapter',
      documentRevision: document.revision,
      document
    })
    const reviewTransaction = prepareAuthoringReviewTransaction(transactionSession, [
      reviewFindingId('第一处错字'),
      reviewFindingId('第二处错字')
    ], liveReviewSource(transactionDocument))
    expect(reviewTransaction).toMatchObject({
      ok: true,
      patches: [{ replacement: '正甲' }, { replacement: '正字乙' }],
      receipt: {
        type: 'authoring-review-transaction',
        findingIds: [reviewFindingId('第一处错字'), reviewFindingId('第二处错字')]
      }
    })
    expect(prepareAuthoringReviewTransaction(transactionSession, [
      reviewFindingId('第一处错字'),
      reviewFindingId('相交范围')
    ], liveReviewSource(transactionDocument))).toMatchObject({
      ok: false,
      reason: 'finding-ranges-overlap'
    })
    const firstReviewTransaction = prepareAuthoringReviewTransaction(transactionSession, [
      reviewFindingId('第一处错字')
    ], liveReviewSource(transactionDocument))
    const firstReviewApplied = applyWritingDocumentTextPatches(
      transactionDocument,
      firstReviewTransaction.patches,
      { now: '2026-09-02T09:00:00.000Z' }
    )
    expect(firstReviewApplied.ok).toBe(true)
    const rebasedReviewSession = rebaseAuthoringReviewSessionAfterTransaction(
      markAuthoringReviewFindingsApplied(transactionSession, firstReviewTransaction.receipt.findingIds),
      firstReviewTransaction,
      liveReviewSource(firstReviewApplied.document)
    )
    expect(rebasedReviewSession).toMatchObject({ status: 'ready' })
    expect(rebasedReviewSession.findings.find((finding) => finding.reason === '第一处错字')).toMatchObject({ status: 'applied' })
    expect(rebasedReviewSession.findings.find((finding) => finding.reason === '相交范围')).toMatchObject({ status: 'stale' })
    expect(rebasedReviewSession.findings.find((finding) => finding.reason === '第二处错字')).toMatchObject({
      status: 'open',
      target: { startOffset: 3, endOffset: 6, exact: '错字乙' }
    })
    expect(prepareAuthoringReviewTransaction(rebasedReviewSession, [
      reviewFindingId('第二处错字')
    ], liveReviewSource(firstReviewApplied.document))).toMatchObject({ ok: true })
    const staleReviewDocument = structuredClone(transactionDocument)
    staleReviewDocument.revision += 1
    expect(prepareAuthoringReviewTransaction(transactionSession, [
      reviewFindingId('第一处错字')
    ], liveReviewSource(staleReviewDocument))).toMatchObject({
      ok: false,
      reason: 'session-stale'
    })

    // F2-6 统一搜索：四个作者可见范围共用稳定 locator；只有正文允许
    // 替换，全书替换先冻结完整影响计划，再以纯函数一次生成整本 nextBook。
    const searchChapterOneDocument = createWritingDocument('旧名守在门口。')
    const searchChapterTwoDocument = createWritingDocument('旧名走过长街。\n\n钟声后旧名回头。')
    const searchBook = {
      id: 'search-book',
      name: '搜索验收书',
      worldbookId: 'search-worldbook',
      chapters: [
        {
          id: 'search-chapter-1',
          title: '第一章',
          content: getWritingDocumentMarkdown(searchChapterOneDocument),
          contentFormat: 'md',
          editorDocument: searchChapterOneDocument
        },
        {
          id: 'search-chapter-2',
          title: '第二章',
          content: getWritingDocumentMarkdown(searchChapterTwoDocument),
          contentFormat: 'md',
          editorDocument: searchChapterTwoDocument
        }
      ]
    }
    const searchExplorations = [{
      id: 'search-idea-1',
      projectId: 'search-book',
      title: '构思索引',
      content: '构思词藏在纸边。',
      editorDocument: createWritingDocument('构思词藏在纸边。')
    }]
    const searchWorldbook = {
      id: 'search-worldbook',
      entries: [{ id: 'search-entry-1', name: '旧港', type: 'location', content: '世界词藏在灯塔背面。' }]
    }
    const searchIndex = buildAuthoringProjectSearchIndex({
      projectId: 'search-book',
      book: searchBook,
      explorations: searchExplorations,
      worldbook: searchWorldbook
    })
    expect(searchIndex).toMatchObject({ ok: true, projectId: 'search-book' })
    const currentChapterSearch = searchAuthoringPositionIndex(searchIndex, {
      query: '旧名',
      scope: 'current-chapter',
      currentChapterId: 'search-chapter-1'
    })
    const manuscriptSearch = searchAuthoringPositionIndex(searchIndex, {
      query: '旧名',
      scope: 'manuscript'
    })
    const explorationSearch = searchAuthoringPositionIndex(searchIndex, {
      query: '构思词',
      scope: 'exploration'
    })
    const worldbookSearch = searchAuthoringPositionIndex(searchIndex, {
      query: '世界词',
      scope: 'worldbook'
    })
    expect(currentChapterSearch).toMatchObject({ ok: true, total: 1, truncated: false })
    expect(manuscriptSearch).toMatchObject({ ok: true, total: 3, truncated: false })
    expect(explorationSearch).toMatchObject({ ok: true, total: 1, truncated: false })
    expect(worldbookSearch).toMatchObject({ ok: true, total: 1, truncated: false })
    expect(manuscriptSearch.findings.every((finding) => (
      finding.target.unitId && finding.target.nodeId && finding.target.sourceRevision
    ))).toBe(true)
    expect(explorationSearch.findings.every((finding) => finding.target.sourceKind === 'exploration')).toBe(true)
    expect(worldbookSearch.findings.every((finding) => finding.target.sourceKind === 'worldbook-entry')).toBe(true)
    expect(reconcileAuthoringSearchFinding(searchIndex, manuscriptSearch.findings[0]))
      .toMatchObject({ fresh: true, reason: 'fresh' })
    expect(createAuthoringReplacePlan({
      index: searchIndex,
      query: '构思词',
      replacement: '新构思',
      scope: 'exploration'
    })).toMatchObject({ ok: false, reason: 'replace-scope-read-only' })
    expect(createAuthoringReplacePlan({
      index: searchIndex,
      query: '旧名',
      replacement: '新名',
      scope: 'manuscript',
      findings: manuscriptSearch.findings,
      expectedTotal: manuscriptSearch.total - 1
    })).toMatchObject({ ok: false, reason: 'replace-preview-incomplete' })

    const replacePlanResult = createAuthoringReplacePlan({
      index: searchIndex,
      query: '旧名',
      replacement: '新名',
      scope: 'manuscript',
      findings: manuscriptSearch.findings,
      expectedTotal: manuscriptSearch.total
    })
    expect(replacePlanResult).toMatchObject({
      ok: true,
      plan: { chapterCount: 2, matchCount: 3, query: '旧名', replacement: '新名' }
    })
    const unchangedSearchBook = structuredClone(searchBook)
    const appliedSearchReplace = applyAuthoringReplacePlan({
      book: searchBook,
      index: searchIndex,
      plan: replacePlanResult.plan,
      now: '2026-09-02T08:00:00.000Z'
    })
    expect(appliedSearchReplace).toMatchObject({
      ok: true,
      receipt: { chapterCount: 2, matchCount: 3 }
    })
    expect(searchBook).toEqual(unchangedSearchBook)
    expect(appliedSearchReplace.nextBook.chapters.map((chapter) => chapter.content.join?.('') || chapter.content))
      .toEqual([expect.stringContaining('新名'), expect.stringContaining('新名')])
    expect(appliedSearchReplace.nextBook.chapters.some((chapter) => chapter.content.includes('旧名'))).toBe(false)

    const changedSearchBook = structuredClone(searchBook)
    changedSearchBook.chapters[0].editorDocument.content[0].content[0].content[0].text = '别名守在门口。'
    const changedSearchIndex = buildAuthoringProjectSearchIndex({
      projectId: 'search-book',
      book: changedSearchBook,
      explorations: searchExplorations,
      worldbook: searchWorldbook
    })
    expect(reconcileAuthoringSearchFinding(changedSearchIndex, manuscriptSearch.findings[0]))
      .toMatchObject({ fresh: false, reason: 'source-revision-changed' })
    const staleReplaceBook = structuredClone(searchBook)
    staleReplaceBook.chapters[1].editorDocument.revision += 1
    const staleReplaceBookBefore = structuredClone(staleReplaceBook)
    expect(applyAuthoringReplacePlan({
      book: staleReplaceBook,
      index: searchIndex,
      plan: replacePlanResult.plan,
      now: '2026-09-02T08:01:00.000Z'
    })).toMatchObject({ ok: false, reason: 'replace-plan-stale' })
    expect(staleReplaceBook).toEqual(staleReplaceBookBefore)

    // F2-6 自动历史：只有成功持久化且 revision/字数真正跨区间才写一份；
    // 同一计划、回删和同 revision 不重复，介入前保护版本仍复用同一快照库。
    localStorage.removeItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEYS.WRITING_HISTORY_PREFERENCES)
    expect(normalizeWritingHistoryPreferences({ enabled: false, intervalWords: 1000 })).toEqual({
      schemaVersion: 1,
      enabled: false,
      intervalWords: 1000
    })
    const milestoneBeforeDocument = createWritingDocument('甲'.repeat(499))
    const milestoneAfterDocument = createWritingDocument('甲'.repeat(1001))
    milestoneAfterDocument.revision = milestoneBeforeDocument.revision + 1
    const milestonePlan = planWritingMilestoneSnapshot({
      persisted: true,
      chapterId: 'milestone-chapter',
      chapterTitle: '里程碑章',
      previousDocument: milestoneBeforeDocument,
      previousMarkdown: getWritingDocumentMarkdown(milestoneBeforeDocument),
      persistedDocument: milestoneAfterDocument,
      persistedMarkdown: getWritingDocumentMarkdown(milestoneAfterDocument),
      preferences: { enabled: true, intervalWords: 500 },
      snapshots: [],
      createdAt: '2026-09-02T09:00:00.000Z'
    })
    expect(milestonePlan).toMatchObject({
      shouldRecord: true,
      reason: 'word-milestone',
      crossedBoundaries: [500, 1000]
    })
    expect(recordWritingMilestoneSnapshot(milestonePlan)).toMatchObject({ ok: true, recorded: true })
    expect(recordWritingMilestoneSnapshot(milestonePlan)).toMatchObject({
      ok: true,
      recorded: false,
      reason: 'persisted-revision-already-snapshotted'
    })
    expect(listWritingSnapshots('milestone-chapter')).toHaveLength(1)
    expect(listWritingSnapshots('milestone-chapter')[0]).toMatchObject({
      reason: 'word-milestone',
      milestone: { crossedBoundaries: [500, 1000], coveredBoundaries: [500, 1000] }
    })
    expect(planWritingMilestoneSnapshot({
      persisted: false,
      chapterId: 'milestone-chapter',
      previousDocument: milestoneBeforeDocument,
      persistedDocument: milestoneAfterDocument,
      preferences: { enabled: true, intervalWords: 500 }
    })).toMatchObject({ shouldRecord: false, reason: 'not-persisted' })
    expect(planWritingMilestoneSnapshot({
      persisted: true,
      chapterId: 'milestone-chapter',
      previousDocument: milestoneAfterDocument,
      previousMarkdown: getWritingDocumentMarkdown(milestoneAfterDocument),
      persistedDocument: milestoneAfterDocument,
      persistedMarkdown: getWritingDocumentMarkdown(milestoneAfterDocument),
      preferences: { enabled: true, intervalWords: 500 }
    })).toMatchObject({ shouldRecord: false, reason: 'revision-not-advanced' })
    const milestoneReducedDocument = createWritingDocument('甲'.repeat(400))
    milestoneReducedDocument.revision = milestoneAfterDocument.revision + 1
    expect(planWritingMilestoneSnapshot({
      persisted: true,
      chapterId: 'milestone-chapter',
      previousDocument: milestoneAfterDocument,
      previousMarkdown: getWritingDocumentMarkdown(milestoneAfterDocument),
      persistedDocument: milestoneReducedDocument,
      persistedMarkdown: getWritingDocumentMarkdown(milestoneReducedDocument),
      preferences: { enabled: true, intervalWords: 500 }
    })).toMatchObject({ shouldRecord: false, reason: 'word-count-decreased' })
    const protectionSnapshotInput = {
      chapterId: 'milestone-chapter',
      chapterTitle: '里程碑章',
      reason: 'before-adoption',
      document: milestoneAfterDocument,
      markdown: getWritingDocumentMarkdown(milestoneAfterDocument),
      operation: 'ghost-adoption',
      transactionId: 'adoption-transaction-1',
      createdAt: '2026-09-02T09:01:00.000Z'
    }
    expect(recordWritingProtectionSnapshot(protectionSnapshotInput)).toMatchObject({ ok: true, recorded: true })
    expect(recordWritingProtectionSnapshot(protectionSnapshotInput)).toMatchObject({
      ok: true,
      recorded: false,
      reason: 'protection-already-recorded'
    })
    expect(recordWritingProtectionSnapshot({
      ...protectionSnapshotInput,
      reason: 'before-restore',
      operation: 'history-restore',
      transactionId: 'restore-transaction-1',
      createdAt: '2026-09-02T09:02:00.000Z'
    })).toMatchObject({ ok: true, recorded: true })
    expect(listWritingSnapshots('milestone-chapter').map((item) => item.reason))
      .toEqual(expect.arrayContaining(['word-milestone', 'before-adoption', 'before-restore']))
    localStorage.removeItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEYS.WRITING_HISTORY_PREFERENCES)

    const importInput = {
      books: [{ id: 'book-1', name: '长篇', chapters: [{ id: 'chapter-1', title: '第一章', content: '旧文。', contentFormat: 'md' }] }],
      bookId: 'book-1',
      chapterId: 'chapter-1',
      sessionId: 'session-1',
      branchId: 'main',
      worldbookId: 'world-1',
      activeTurnIds: new Set(['turn-1']),
      turn: { id: 'turn-1', status: 'committed', branchId: 'main', assistantMessageIds: ['m1'] },
      messages: [{ id: 'm1', role: 'assistant', branchId: 'main', content: ':::narration\n风穿过门缝。\n\n她抬起头。' }]
    }
    expect(getExperienceTurnImportEligibility(importInput)).toBeNull()
    expect(getExperienceTurnImportEligibility({
      ...importInput,
      turn: { ...importInput.turn, assistantMessageIds: ['m1', 'm2'] },
      messages: [...importInput.messages, { id: 'm2', role: 'assistant', content: '另一条回复。' }]
    })).toBe('ineligible-turn')
    expect(getExperienceTurnImportEligibility({
      ...importInput,
      message: importInput.messages[0],
      turn: { ...importInput.turn, assistantMessageIds: ['m1', 'm2'] }
    })).toBe('ineligible-turn')
    const importedTurn = appendExperienceTurnToChapter(importInput)
    expect(importedTurn.ok).toBe(true)
    const importedUnit = importedTurn.books[0].chapters[0].editorDocument.content.at(-1)
    expect(importedUnit).toMatchObject({ type: 'writingUnit', attrs: { kind: 'passage' } })
    expect(importedUnit.content).toHaveLength(2)
    expect(importedUnit.attrs.originRefs[0]).toEqual({
      type: 'experience-turn',
      sessionId: 'session-1',
      branchId: 'main',
      turnId: 'turn-1',
      messageId: 'm1',
      worldbookId: 'world-1',
      sourceRevision: 1
    })
    expect(appendExperienceTurnToChapter({ ...importInput, books: importedTurn.books }).reason).toBe('already-imported')
    const invalidV3Books = [{
      id: 'book-1',
      name: '长篇',
      chapters: [{
        id: 'chapter-1',
        content: '不得覆盖的旧文。',
        contentFormat: 'md',
        editorDocument: { schemaVersion: 3, revision: 9, content: [] }
      }]
    }]
    const invalidV3Import = appendExperienceTurnToChapter({ ...importInput, books: invalidV3Books })
    expect(invalidV3Import).toMatchObject({ ok: false, reason: 'invalid-document', books: invalidV3Books })
    expect(invalidV3Import.books[0].chapters[0].content).toBe('不得覆盖的旧文。')
    const v2Import = appendExperienceTurnToChapter({
      ...importInput,
      books: [{ id: 'book-1', chapters: [{ id: 'chapter-1', content: '旧文。', editorDocument: v2 }] }]
    })
    expect(v2Import.ok).toBe(true)
    expect(v2Import.books[0].chapters[0].editorDocument.schemaVersion).toBe(3)
    expect(appendExperienceTurnToChapter({
      ...importInput,
      books: importedTurn.books,
      branchId: 'branch-2',
      activeTurnIds: new Set(['turn-2']),
      turn: { id: 'turn-2', status: 'committed', branchId: 'branch-2', assistantMessageIds: ['m2'] },
      messages: [{ id: 'm2', role: 'assistant', branchId: 'branch-2', content: '她转身离开。' }]
    }).books[0].chapters[0].editorDocument.content).toHaveLength(importedTurn.books[0].chapters[0].editorDocument.content.length + 1)
    ;['user', 'pending', 'failed', 'superseded'].forEach((state) => {
      const message = { ...importInput.messages[0], ...(state === 'user' ? { role: 'user' } : {}), ...(state === 'superseded' ? { superseded: true } : {}) }
      const turn = { ...importInput.turn, ...(['pending', 'failed'].includes(state) ? { status: state } : {}) }
      expect(getExperienceTurnImportEligibility({ turn, message, activeTurnIds: importInput.activeTurnIds })).toBe('ineligible-turn')
    })
    const prompt = buildSystemPrompt('narrator', { style: 'webnovel' })
    expect(prompt).toContain('网文风')

    const rendered = renderRPText('他说：“那是‘归航信号’。”')
    expect(rendered).toContain('<span class="rp-dialogue">“')
    expect(rendered).toContain('”</span>')
    expect(rendered).toContain('rp-dialogue-quote-soft')
    expect(renderRPText('她只说：‘走。’')).toContain('<span class="rp-dialogue">‘走。’</span>')
    expect(renderRPText('『别回头。』')).toContain('<span class="rp-dialogue">『别回头。』</span>')
    const constraints = buildNarrativeConstraints({ currentPeriod: '清晨', currentScene: '酒馆' })
    expect(constraints).toContain('清晨')
    expect(constraints).toContain('硬性约束')
    const messages = buildPromptSequence({
      templateKey: 'narrator',
      worldBookEntries: [{ name: '测试', type: 'character', content: '测试内容' }]
    })
    expect(messages.length).toBeGreaterThan(0)

    const paneSwitch = mount(WorkspacePaneSwitch, {
      props: {
        modelValue: 'content',
        label: '素材工作区',
        items: [
          { value: 'index', label: '索引' },
          { value: 'content', label: '内容' },
          { value: 'tools', label: '工具' }
        ]
      }
    })
    const activePane = paneSwitch.get('[aria-checked="true"]')
    await activePane.trigger('keydown', { key: 'ArrowRight' })
    expect(paneSwitch.emitted('update:modelValue')?.at(-1)).toEqual(['tools'])
    expect(paneSwitch.attributes('role')).toBe('radiogroup')

    const contour = mount(ContourField, { props: { density: 'relation', entry: 'left' } })
    expect(contour.classes()).toContain('contour-field--relation')
    expect(contour.classes()).toContain('contour-field--left')
    expect(contour.attributes('aria-hidden')).toBe('true')

    const icon = mount(WorkbenchIcon, { props: { name: 'archive', size: 18 } })
    expect(icon.find('svg').attributes('width')).toBe('18')

    const turn = mount(NarrativeTurn, {
      props: {
        message: { role: 'user', content: '检查航道。' },
        index: 0,
        blocks: [{ id: 'b1', kind: 'narration', text: '检查航道。' }],
        renderContent: (block) => block.text
      }
    })
    expect(turn.get('details.prose__actions').attributes('open')).toBeUndefined()
    expect(turn.findAll('.prose__action')).toHaveLength(3)

    const generationCalls = []
    const structuredFallback = await runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: '生成 JSON' }],
      generationOptions: { response_format: { type: 'json_object' }, timeout_ms: 90000 },
      attempts: [
        { name: 'structured' },
        { name: 'prompt-json', generationOptions: { response_format: null } }
      ],
      sendChatImpl: async (...args) => {
        generationCalls.push(args)
        if (args[4]?.response_format) throw new Error('response_format unsupported')
        return { content: '{"entries":[{"name":"港口"}]}' }
      },
      parseContent: JSON.parse,
      isValidParsed: (parsed) => Array.isArray(parsed?.entries) && parsed.entries.length > 0
    })
    expect(structuredFallback.success).toBe(true)
    expect(structuredFallback.attemptIndex).toBe(1)
    expect(generationCalls[0][4].response_format).toEqual({ type: 'json_object' })
    expect(generationCalls[0][4].timeout_ms).toBe(90000)
    expect(generationCalls[1][4]).not.toHaveProperty('response_format')
    expect(generationCalls[1][4].timeout_ms).toBe(90000)
  })
})

describe('Narrative presentation contract', () => {
  it("parses markers into clean text and falls back without losing legacy content（合并4例）", async () => {
{
const structured = parseNarrativePresentation([
      ':::narration',
      '雨水沿着舷窗滑落。',
      ':::dialogue|陆晨曦',
      '“信号还在吗？”',
      ':::action|陆晨曦',
      '她调高了增益。'
    ].join('\n'), { messageId: 'message-1' })

    expect(structured.source).toBe('model-structured')
    expect(structured.content).toBe('雨水沿着舷窗滑落。\n\n“信号还在吗？”\n\n她调高了增益。')
    expect(structured.blocks.map((block) => `${block.kind}:${block.speaker || ''}`)).toEqual([
      'narration:', 'dialogue:陆晨曦', 'action:陆晨曦'
    ])
    expect(structured.content).not.toContain(':::')

    const pairedFences = parseNarrativePresentation([
      ':::narration',
      '雨水沿着舷窗滑落。',
      ':::',
      ':::dialogue|陆晨曦',
      '“信号还在吗？”',
      ':::'
    ].join('\n'), { messageId: 'paired-fences' })
    expect(pairedFences.blocks.map((block) => block.text)).toEqual([
      '雨水沿着舷窗滑落。', '“信号还在吗？”'
    ])
    expect(pairedFences.content).not.toContain(':::')

    // P4：同一 marker 块按空行拆分自然段；明确段落边界不被短块合并。
    const multiParagraph = parseNarrativePresentation(':::narration\n段一。继续一段。\n\n段二。\n\n段三。', {
      messageId: 'multi-para'
    })
    expect(multiParagraph.blocks.map((block) => block.text)).toEqual([
      '段一。继续一段。', '段二。', '段三。'
    ])

    // P6：模型把 marker 写进行中（`。」 :::narration 柳洵`）时按行内 marker 切块，
    // marker 不泄漏进正文，同一行可连续出现多个 marker；相邻短叙述合并。
    const inlineMarkers = parseNarrativePresentation(
      '猎户二人站起身。 :::narration 柳洵眉心微动。 :::dialogue|阿贵 「哎，柳公子——」 :::narration 阿贵没再开口。',
      { messageId: 'inline-markers' }
    )
    expect(inlineMarkers.blocks.map((block) => `${block.kind}:${block.speaker || ''}`)).toEqual([
      'narration:', 'dialogue:阿贵', 'narration:'
    ])
    expect(inlineMarkers.blocks.map((block) => block.text)).toEqual([
      '猎户二人站起身。柳洵眉心微动。', '“哎，柳公子——”', '阿贵没再开口。'
    ])
    expect(inlineMarkers.content).not.toContain(':::')

    // 阅读密度：无换行的三句及以上叙述按 1-2 句、约 60-120 字分组，
    // 时间/地点转换处优先断开；引号内叹号问号不拆。
    const squeezed = parseNarrativePresentation(
      ':::narration\n柳洵眉心微动。 他扫了一眼西面的山口，暮色里只看得见一条灰白的山脊线。 三日，够拖成要命的痨病。',
      { messageId: 'squeezed' }
    )
    expect(squeezed.blocks.map((block) => block.text)).toEqual([
      '柳洵眉心微动。他扫了一眼西面的山口，暮色里只看得见一条灰白的山脊线。',
      '三日，够拖成要命的痨病。'
    ])
    const paragraphWall = parseNarrativePresentation(
      ':::narration\n风把窗纸吹得一鼓一瘪，桌上的灯焰跟着摇晃，墙上两个人的影子被拉得很长。沈砚没有立刻回答，只把那封沾了雨水的信推到桌子中央，指尖仍压在落款上。门外传来急促的脚步声，又在台阶前突然停住，仿佛来人正在犹豫是否应该敲门。林岫抬眼看向他，直到此刻才意识到，信上的名字正是三年前已经死去的那个人。',
      { messageId: 'paragraph-wall' }
    )
    expect(paragraphWall.blocks.map((block) => block.text)).toEqual([
      '风把窗纸吹得一鼓一瘪，桌上的灯焰跟着摇晃，墙上两个人的影子被拉得很长。沈砚没有立刻回答，只把那封沾了雨水的信推到桌子中央，指尖仍压在落款上。',
      '门外传来急促的脚步声，又在台阶前突然停住，仿佛来人正在犹豫是否应该敲门。林岫抬眼看向他，直到此刻才意识到，信上的名字正是三年前已经死去的那个人。'
    ])
    const longAction = parseNarrativePresentation(
      ':::action|沈砚\n他把信纸折回原样。指腹在封蜡上停了一瞬。门外的人终于敲响第一下。沈砚抬眼示意林岫不要出声。',
      { messageId: 'long-action' }
    )
    expect(longAction.blocks.map((block) => `${block.kind}:${block.speaker}:${block.text}`)).toEqual([
      'action:沈砚:他把信纸折回原样。指腹在封蜡上停了一瞬。',
      'action:沈砚:门外的人终于敲响第一下。沈砚抬眼示意林岫不要出声。'
    ])
    const longThought = parseNarrativePresentation(
      ':::thought|林岫\n他不该知道这个名字。可落款上的笔迹不会骗人。三年前的葬礼是她亲眼看着办完的。除非当时棺材里根本没有人。',
      { messageId: 'long-thought' }
    )
    expect(longThought.blocks.map((block) => `${block.kind}:${block.speaker}:${block.text}`)).toEqual([
      'thought:林岫:他不该知道这个名字。可落款上的笔迹不会骗人。',
      'thought:林岫:三年前的葬礼是她亲眼看着办完的。除非当时棺材里根本没有人。'
    ])
    const longBlock = parseNarrativePresentation(
      ':::narration\n他沿着堤岸走了半里，风把斗笠吹得歪向一边。 河水在暮色里泛着碎光。 他停下来，把灯笼往水里照了照。 次日清晨，他在渡口等到了那条船。 船夫递过一张纸条。 纸上只有两个字：西边。',
      { messageId: 'long-block' }
    )
    expect(longBlock.blocks.map((block) => block.text)).toEqual([
      '他沿着堤岸走了半里，风把斗笠吹得歪向一边。河水在暮色里泛着碎光。',
      '他停下来，把灯笼往水里照了照。',
      '次日清晨，他在渡口等到了那条船。船夫递过一张纸条。',
      '纸上只有两个字：西边。'
    ])
    // 引号内的叹号/问号不拆 —— 对白完整性受保护
    const dialogueProtected = parseNarrativePresentation(':::narration\n他厉声喝道：「站住！别动！」', {
      messageId: 'dialogue-protected'
    })
    expect(dialogueProtected.blocks).toHaveLength(1)
    expect(dialogueProtected.blocks[0].text).toBe('他厉声喝道：「站住！别动！」')

    // Fix：模型模仿控制消息输出【正文】等小节标题 —— parser 清理，不进正文。
    const bracketHeader = parseNarrativePresentation(':::narration\n【正文】\n猎户二人站起身。\n【旁白】', {
      messageId: 'bracket-header'
    })
    expect(bracketHeader.blocks.map((block) => block.text)).toEqual(['猎户二人站起身。'])

    // Fix：单换行也是段落边界 —— 模型用单换行分段时不再塌成一大块。
    const singleNewline = parseNarrativePresentation(
      ':::narration\n柳洵眉心微动，认出左边那人。\n他往西面山口扫了一眼，暮色里只看得见一条灰白的山脊线，风声从山口灌进来。\n次日清晨，他在渡口等到了那条船。',
      { messageId: 'single-newline' }
    )
    expect(singleNewline.blocks.map((block) => block.text)).toEqual([
      '柳洵眉心微动，认出左边那人。',
      '他往西面山口扫了一眼，暮色里只看得见一条灰白的山脊线，风声从山口灌进来。',
      '次日清晨，他在渡口等到了那条船。'
    ])

    const preamble = parseNarrativePresentation('模型说明\n:::dialogue|陆晨曦\n“继续。”', {
      messageId: 'preamble'
    })
    expect(preamble.content).toContain('模型说明')
    expect(preamble.content).toContain('“继续。”')

    const provisional = parseNarrativePresentation(':::dialog', {
      messageId: 'streaming',
      complete: false
    })
    expect(provisional.status).toBe('provisional')
    expect(provisional.content).toBe('')

    const legacy = parseNarrativePresentation([
      '*她抬头。*',
      '',
      '陆晨曦：“继续。”',
      '陆晨曦说：“保持航向。”',
      '“信号在移动。”陆晨曦说道。',
      '“别走。”',
      '她走到舷窗前，低声说：“小行星带里有灯。”'
    ].join('\n'), { messageId: 'legacy' })
    expect(legacy.source).toBe('parser')
    expect(legacy.content).toContain('“别走。”')
    expect(legacy.blocks.map((block) => `${block.kind}:${block.speaker || ''}`)).toEqual([
      'action:',
      'dialogue:陆晨曦',
      'dialogue:陆晨曦',
      'dialogue:陆晨曦',
      'dialogue:',
      'narration:'
    ])
    expect(legacy.blocks.slice(1, 4).every((block) => block.speakerSource === 'text')).toBe(true)

    const legacyHeader = parseNarrativePresentation('【正文】\n“继续前进。”', { messageId: 'legacy-header' })
    expect(legacyHeader.content).toBe('“继续前进。”')

    const legacyLong = parseNarrativePresentation(
      '第一句先落在门口。第二句说明他看见了什么。第三句让他做出动作。第四句带来一个后果。第五句留下新的问题。',
      { messageId: 'legacy-long' }
    )
    expect(legacyLong.blocks.map((block) => block.text)).toEqual([
      '第一句先落在门口。第二句说明他看见了什么。',
      '第三句让他做出动作。第四句带来一个后果。',
      '第五句留下新的问题。'
    ])

    const messageFallback = parseNarrativePresentation('“继续。”', {
      messageId: 'fallback-speaker',
      fallbackSpeaker: '褚岩'
    })
    expect(messageFallback.blocks[0]).toMatchObject({ speaker: '褚岩', speakerSource: 'message' })
    const tolerantMarkers = parseMarkedBlocks('```text\r\n :::dialogue|甲\r\n未闭合\r\n:::unknown\r\n文本\r\n```', 'bad')
    expect(tolerantMarkers.content).toBe('未闭合\n\n文本')
    expect(tolerantMarkers.content).not.toContain(':::unknown')

    // P4：可信说话者注册表 —— verified 显示 label + 稳定 id；未知名称 → 未署名对白。
    const registry = buildSpeakerRegistry({
      player: { name: '林墨' },
      cast: [{ speakerId: 'char:c-1', name: '陆晨曦' }],
      encountered: [{ id: 'e-1', name: '褚岩' }],
      worldbookCharacters: [{ id: 'w-1', name: '掌柜' }]
    })
    expect(registry.some((entry) => entry.speakerId === 'player')).toBe(true)
    expect(registry.some((entry) => entry.speakerId === 'char:c-1')).toBe(true)
    expect(registry.some((entry) => entry.speakerId === 'char:e-1')).toBe(true)
    expect(registry.some((entry) => entry.speakerId === 'char:w-1')).toBe(true)

    const trusted = parseNarrativePresentation(':::dialogue|陆晨曦\n“信号还在吗？”\n:::dialogue|掌柜\n“客官要点什么？”\n:::dialogue|林墨\n“我先看看。”\n:::dialogue|不存在的人\n“喂？”', {
      messageId: 'registry',
      speakerRegistry: registry
    })
    const trustMap = Object.fromEntries(trusted.blocks.map((block) => [block.speaker || block.speakerRaw, block.speakerTrust]))
    expect(trustMap['陆晨曦']).toBe('verified')
    expect(trusted.blocks[0].speakerId).toBe('char:c-1')
    expect(trustMap['掌柜']).toBe('verified')
    expect(trustMap['林墨']).toBe('verified')
    expect(trustMap['不存在的人']).toBe('unresolved')
    expect(trusted.blocks[3].speaker).toBeUndefined()
    expect(trusted.blocks[3].speakerId).toBeUndefined()
    expect(trusted.blocks[3].speakerRaw).toBe('不存在的人')
    expect(resolveSpeakerName(registry, '陆晨曦').verified).toBe(true)
    expect(resolveSpeakerName(registry, '路人甲').verified).toBe(false)

    // message-fallback（消息 name 级）在未命中注册表时仍显示 label（无伪造 speakerId 也不丢）
    const registryFallback = parseNarrativePresentation('“继续。”', {
      messageId: 'registry-fallback',
      fallbackSpeaker: '值班员',
      speakerRegistry: registry
    })
    expect(registryFallback.blocks[0]).toMatchObject({
      speaker: '值班员', speakerSource: 'message', speakerTrust: 'message-fallback'
    })
    expect(registryFallback.blocks[0].speakerId).toMatch(/^spk_/)

    // 未提供注册表时保持旧行为（兼容 ensureNarrativeMessage 重解析路径）
    const noRegistry = parseNarrativePresentation(':::dialogue|路人甲\n“喂？”', { messageId: 'no-registry' })
    expect(noRegistry.blocks[0].speakerId).toMatch(/^spk_/)

    // P3：老对话泄漏修复 —— ensureNarrativeMessage 检测到 block.text 残留 marker 即重解析，
    // 不依赖版本号（避免把新消息的 verified speaker 打回名字 hash）。
    const leaked = ensureNarrativeMessage({
      id: 'leak-msg',
      role: 'assistant',
      content: ':::narration\n雨水沿着舷窗滑落。\n:::dialogue|陆晨曦\n“信号还在吗？”',
      presentation: {
        version: 3,
        source: 'model-structured',
        blocks: [
          { id: 'b1', kind: 'narration', text: ':::narration\n雨水沿着舷窗滑落。' },
          { id: 'b2', kind: 'dialogue', speaker: '陆晨曦', speakerId: 'spk_x', text: ':::dialogue|陆晨曦\n“信号还在吗？”' }
        ]
      }
    })
    expect(leaked.presentation.blocks.map((block) => block.text).join('\n')).not.toContain(':::')
    expect(leaked.presentation.blocks[0].text).toBe('雨水沿着舷窗滑落。')
    // 无泄漏的新消息不被重解析（版本 5 且 block.text 干净）
    const clean = ensureNarrativeMessage({
      id: 'clean-msg',
      role: 'assistant',
      content: '雨水沿着舷窗滑落。',
      presentation: {
        version: 5,
        source: 'model-structured',
        blocks: [{ id: 'c1', kind: 'narration', text: '雨水沿着舷窗滑落。' }]
      }
    })
    expect(clean.presentation.blocks[0].text).toBe('雨水沿着舷窗滑落。')

    const denseExistingText = '风把窗纸吹得一鼓一瘪，墙上的影子被拉得很长。沈砚把沾雨的信推到桌子中央。门外的脚步声在台阶前突然停住。林岫这才认出那个三年前已经死去的名字。'
    const denseExisting = ensureNarrativeMessage({
      id: 'dense-existing',
      role: 'assistant',
      content: `:::narration\n${denseExistingText}`,
      presentation: {
        version: NARRATIVE_PRESENTATION_VERSION,
        blocks: [{ id: 'dense-1', kind: 'narration', text: denseExistingText }]
      }
    })
    expect(denseExisting.presentation.blocks.map((block) => block.text)).toEqual([
      '风把窗纸吹得一鼓一瘪，墙上的影子被拉得很长。沈砚把沾雨的信推到桌子中央。',
      '门外的脚步声在台阶前突然停住。林岫这才认出那个三年前已经死去的名字。'
    ])

    const oldPresentation = ensureNarrativeMessage({
      id: 'old-presentation',
      role: 'assistant',
      content: ':::narration\n第一段。\n第二段。',
      presentation: {
        version: 4,
        source: 'model-structured',
        blocks: [{ id: 'old-1', kind: 'narration', text: '第一段。第二段。' }]
      }
    })
    expect(oldPresentation.presentation.version).toBe(5)
    expect(oldPresentation.presentation.blocks.map((block) => block.text)).toEqual(['第一段。', '第二段。'])

    // P6：场景未切换也刷新 thread（滚动合并）—— 保留地点/时间/目标，刷新滚动字段。
    const firstThread = buildNarrativeSceneThread({
      previous: null,
      runtimeState: {
        worldMapState: { placeId: 'dock' },
        writingTime: { eraName: 'x' },
        goals: [{ title: '找到铜扣', status: 'active' }]
      },
      messages: []
    })
    expect(firstThread.id).toMatch(/^scene_dock/)
    expect(firstThread.currentObjective).toBe('找到铜扣')
    const rollingMessages = [{
      role: 'assistant',
      presentation: { blocks: [{ kind: 'dialogue', text: '“铜扣在哪？”' }] }
    }]
    const mergedThread = buildNarrativeSceneThread({
      previous: firstThread,
      runtimeState: {
        worldMapState: { placeId: 'dock' },
        writingTime: { eraName: 'x' },
        goals: [{ title: '找到铜扣', status: 'active' }]
      },
      messages: rollingMessages
    })
    expect(mergedThread.id).toBe(firstThread.id)
    expect(mergedThread.currentObjective).toBe(firstThread.currentObjective)
    expect(mergedThread.activeQuestion).toContain('铜扣在哪')
    expect(mergedThread.updatedAt).toBeGreaterThanOrEqual(firstThread.updatedAt)
    // 场景切换 → 新线程
    const movedThread = buildNarrativeSceneThread({
      previous: firstThread,
      runtimeState: {
        worldMapState: { placeId: 'tavern' },
        writingTime: { eraName: 'x' }
      },
      messages: rollingMessages
    })
    expect(movedThread.id).not.toBe(firstThread.id)
    expect(movedThread.id).toMatch(/^scene_tavern/)

    // P3：主要参与者切换 → 新线程（最近角色与线程 cast 无交集）
    const castThread = buildNarrativeSceneThread({
      previous: null,
      runtimeState: {
        worldMapState: { placeId: 'dock' },
        writingTime: { eraName: 'x' },
        encounteredCharacters: [{ id: 'c1', name: '阿贵' }, { id: 'c2', name: '老周' }]
      },
      messages: []
    })
    expect(castThread.cast.map((member) => member.name)).toEqual(['阿贵', '老周'])
    const switchedCastThread = buildNarrativeSceneThread({
      previous: castThread,
      runtimeState: {
        worldMapState: { placeId: 'dock' },
        writingTime: { eraName: 'x' },
        encounteredCharacters: [{ id: 'c3', name: '屠夫' }, { id: 'c4', name: '马贩' }]
      },
      messages: rollingMessages
    })
    // 参与者完全更换 → 线程重建（cast 刷新为新角色，而非滚动复用旧 cast）
    expect(switchedCastThread.cast.map((member) => member.name)).toEqual(['屠夫', '马贩'])
    expect(switchedCastThread.revision).not.toBe(castThread.revision)
}
{
const normalized = parseNarrativePresentation(':::dialogue|林岫\n「都有。」', {
      messageId: 'dialogue-normalization-contract'
    })
    expect(normalized.blocks.map((block) => block.text)).toEqual(['“都有。”'])
    const nested = parseNarrativePresentation(':::dialogue|林岫\n「他说：『都有。』」', {
      messageId: 'nested-dialogue-normalization-contract'
    })
    expect(nested.blocks.map((block) => block.text)).toEqual(['“他说：‘都有。’”'])

    const longDialogue = parseNarrativePresentation(
      ':::dialogue|林岫\n「都有。第一封是三年前寄出的。第二封没有落款。第三封上的墨迹还没有干。」',
      { messageId: 'dialogue-density-contract' }
    )
    expect(longDialogue.blocks.map((block) => `${block.speaker}:${block.text}`)).toEqual([
      '林岫:“都有。第一封是三年前寄出的。”',
      '林岫:“第二封没有落款。第三封上的墨迹还没有干。”'
    ])
}
{
const text = '风从门缝里钻进来，吹得灯焰不断偏向墙角，沈砚按住桌上的信纸，没有回答林岫的问题，只抬眼听着台阶外越来越近的脚步，门环轻轻撞上木板，屋里所有人的呼吸都停了一瞬，窗外的雨点越来越密，檐下积水一线线落下来，守在后门的人悄悄换了位置，长廊尽头又亮起一盏灯，映出墙边一道陌生的影子，谁也没有先开口，仿佛只要继续沉默，那封信就不会变成已经发生的事实'
    const parsed = parseNarrativePresentation(`:::narration\n${text}`, {
      messageId: 'comma-density-contract'
    })
    expect(parsed.blocks.length).toBeGreaterThan(1)
    expect(parsed.blocks.map((block) => block.text).join('')).toBe(text)
}
{
const refreshed = ensureNarrativeMessage({
      id: 'quote-refresh-contract',
      role: 'assistant',
      content: ':::dialogue|林岫\n「都有。」',
      presentation: {
        version: NARRATIVE_PRESENTATION_VERSION,
        blocks: [{ id: 'quote-refresh-1', kind: 'dialogue', speaker: '林岫', text: '「都有。」' }]
      }
    })
    expect(refreshed.presentation.blocks.map((block) => block.text)).toEqual(['“都有。”'])
}
})

  it('keeps stable ids and one prompt format contract', () => {
    expect(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
      .toBe(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
    expect(buildNarrativeFormatInstructions()).toContain(':::dialogue|角色名')
    // P3：五条行文契约收敛 + 自然段空行要求
    const voiceContract = buildNarrativeVoiceContract()
    expect(voiceContract).toContain('先回应玩家输入，再推进一个已有因果')
    expect(voiceContract).toContain('不用列举数项后再用破折号短句揭晓')
    expect(voiceContract).toContain('一个结论只表达一次')
    expect(voiceContract).toContain('神秘信息必须来自')
    expect(voiceContract).toContain('关系不要写成标签或心理说明')
    const relationshipNote = buildNarrativeTurnNote({
      blocks: [{
        kind: 'continuity',
        content: {
          causality: {
            relationships: [
              { subjectId: 'character-daughter', objectId: 'character-mother', kind: 'guardian', status: 'confirmed' },
              { subjectId: 'character-a', objectId: 'character-b', kind: 'rival', status: 'confirmed' },
              { subjectId: 'character-c', objectId: 'character-d', kind: 'debtor', status: 'confirmed' },
              { subjectId: 'character-e', objectId: 'character-f', kind: 'ally', status: 'confirmed' }
            ]
          }
        }
      }]
    }, { intent: 'respond' })
    expect(relationshipNote).toContain('本场有效关系（只作行为依据，不照抄标签）')
    expect(relationshipNote).toContain('character-daughter → character-mother（guardian）')
    expect(relationshipNote).not.toContain('character-e → character-f')
    expect(buildNarrativeTurnNote({
      blocks: [{ kind: 'continuity', content: { causality: { relationships: [] } } }]
    }, { intent: 'respond' })).not.toContain('本场有效关系')
    expect(buildNarrativeFormatInstructions()).toContain('自然段之间用换行分隔')
    expect(buildNarrativeFormatInstructions()).toContain('一个自然段 1-2 个句子')
    expect(buildNarrativeFormatInstructions()).toContain('台词统一使用中文双引号“”')
    expect(buildNarrativeFormatInstructions()).not.toContain('「」或“”')
    expect(buildNarrativeFormatInstructions()).toContain('不要输出"【正文】"')
  })
})

describe('Director Types', () => {
  it('provides shot types and infers them from emotion', () => {
    const types = getShotTypes()
    expect(types.length).toBe(5)
    expect(inferShotTypeFromEmotion('fear')).toBe('extreme_close_up')
  })
})

describe('Media services', () => {
  it('shares provider config and keeps generated binary data outside localStorage', async () => {
    // 2C2G 服务器负载高时该长流程单测可能超过默认 5s 超时, 放宽到 30s。
    localStorage.removeItem(STORAGE_KEYS.IMAGE_MODEL_CONFIGS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.COMIC_PAGES)
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { images: ['data:image/png;base64,abc'] } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => ''
      })
    const config = {
      type: 'http',
      baseUrl: 'https://images.example/generate/',
      apiKey: 'secret',
      requestTemplate: '{"prompt":"{{prompt}}","negative":"{{negative_prompt}}","width":{{width}},"height":{{height}},"reference":"{{reference_image}}","references":{{reference_images_json}},"strength":{{reference_strength}}}',
      responsePath: 'result.images.0'
    }

    const generationController = new AbortController()
    const image = await generateImage(config, {
      prompt: '雨夜 "街角"',
      negativePrompt: '模糊',
      width: 1280,
      height: 720,
      count: 1,
      referenceImages: [{ id: 'ref-1', data: 'data:image/png;base64,YWJj' }],
      referenceStrength: 0.7,
      signal: generationController.signal,
      fetchImpl
    })
    const request = fetchImpl.mock.calls[0]
    const body = JSON.parse(request[1].body)

    expect(request[0]).toBe('https://images.example/generate')
    expect(request[1].signal).toBe(generationController.signal)
    expect(request[1].headers.Authorization).toBe('Bearer secret')
    expect(body).toEqual({
      prompt: '雨夜 "街角"',
      negative: '模糊',
      width: 1280,
      height: 720,
      reference: 'data:image/png;base64,YWJj',
      references: ['data:image/png;base64,YWJj'],
      strength: 0.7
    })
    expect(image).toBe('data:image/png;base64,abc')
    saveImageGenerationRun({ runId: 'image-run-fixture', jobId: 'job-fixture', scopeKey: 'scope-fixture', status: 'running', itemCount: 2, items: [{ id: 'one', state: 'saved', mediaAssetId: 'asset-one' }, { id: 'two', state: 'generating' }] })
    expect(loadImageGenerationRun('scope-fixture')).toMatchObject({ status: 'interrupted', itemCount: 2, items: [{ state: 'saved', mediaAssetId: 'asset-one' }, { state: 'generating' }] })
    removeImageGenerationRun('image-run-fixture')
    expect(loadImageGenerationRun('scope-fixture')).toBeNull()
    const noImplicitUpgrade = vi.fn()
    await expect(generateImage({ type: 'openai_dalle', defaultModel: 'dall-e-3' }, {
      referenceImages: [{ data: 'data:image/png;base64,YWJj' }], fetchImpl: noImplicitUpgrade
    })).rejects.toThrow('参考')
    expect(noImplicitUpgrade).not.toHaveBeenCalled()
    expect(getImageProviderCapabilities({ type: 'http', requestTemplate: '{{reference_image}}' }).maxReferenceImages).toBe(1)
    await expect(generateImage({ ...config, requestTemplate: '{"image":"{{reference_image}}"}' }, {
      referenceImages: [{ data: 'data:image/png;base64,YWJj' }, { data: 'data:image/png;base64,YWJk' }], fetchImpl: noImplicitUpgrade
    })).rejects.toThrow()
    expect(noImplicitUpgrade).not.toHaveBeenCalled()
    for (const model of ['gpt-image-1', 'gpt-image-1.5']) {
      const editFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ b64_json: 'YWJj' }] }) })
      await generateImage({ type: 'openai_dalle', defaultModel: model, baseUrl: 'https://images.example/v1/images/generations', apiKey: 'fixture-only' }, {
        prompt: '码头', referenceImages: [{ data: 'data:image/png;base64,YWJj' }], fetchImpl: editFetch
      })
      expect(editFetch.mock.calls[0][0]).toBe('https://images.example/v1/images/edits')
      expect(editFetch.mock.calls[0][1].body.get('model')).toBe(model)
      expect(editFetch.mock.calls[0][1].body.getAll('image[]')).toHaveLength(1)
    }
    const { buildImageDescriptionMessages, draftImageDescription } = await import('../services/media/imageDescriptionService.js')
    expect(buildImageDescriptionMessages('场景'.repeat(4000))[1].content).toHaveLength(6000)
    expect(buildImageDescriptionMessages('码头')[0].content).toContain('不新增人物外貌')
    await expect(draftImageDescription({ sourceText: '码头', settings: {} })).rejects.toThrow('配置文本模型')

    const alreadyCancelled = new AbortController()
    const cancelledFetch = vi.fn()
    alreadyCancelled.abort()
    await expect(generateImage(config, {
      prompt: '不会发出的请求',
      signal: alreadyCancelled.signal,
      fetchImpl: cancelledFetch
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelledFetch).not.toHaveBeenCalled()

    const lateController = new AbortController()
    let resolveLatePayload
    const lateFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise((resolve) => { resolveLatePayload = resolve })
    })
    const lateGeneration = generateImage(config, {
      prompt: '取消后的迟到结果',
      signal: lateController.signal,
      fetchImpl: lateFetch
    })
    await vi.waitFor(() => expect(resolveLatePayload).toBeTypeOf('function'))
    lateController.abort()
    resolveLatePayload({ result: { images: ['data:image/png;base64,bGF0ZQ=='] } })
    await expect(lateGeneration).rejects.toMatchObject({ name: 'AbortError' })

    const connection = await testImageProviderConnection(config, { fetchImpl })
    expect(connection).toMatchObject({ ok: true, reachable: true, authenticated: true, status: 200 })

    const sdFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,ZGVyaXZlZA=='] })
    })
    await generateImage({ type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' }, {
      prompt: '保持人物外观',
      referenceImages: [{ id: 'ref-1', data: 'data:image/png;base64,YWJj' }],
      referenceStrength: 0.7,
      fetchImpl: sdFetch
    })
    const sdBody = JSON.parse(sdFetch.mock.calls[0][1].body)
    expect(sdFetch.mock.calls[0][0]).toBe('http://127.0.0.1:7860/sdapi/v1/img2img')
    expect(sdBody).toMatchObject({ init_images: ['data:image/png;base64,YWJj'], denoising_strength: 0.3 })
    const sdInpaintFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,aW5wYWludA=='] })
    })
    await generateImage({ type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' }, {
      prompt: '只修正手部',
      referenceImages: [{ id: 'source', data: 'data:image/png;base64,YWJj' }],
      maskImage: 'data:image/png;base64,bWFzaw==',
      fetchImpl: sdInpaintFetch
    })
    expect(JSON.parse(sdInpaintFetch.mock.calls[0][1].body)).toMatchObject({
      init_images: ['data:image/png;base64,YWJj'],
      mask: 'data:image/png;base64,bWFzaw==',
      inpaint_full_res: true
    })
    expect(getImageProviderCapabilities({ type: 'minimax_image' })).toMatchObject({
      textToImage: true,
      imageToImage: false,
      inpaint: false
    })
    expect(getImageProviderCapabilities({ type: 'sd_webui' })).toMatchObject({
      imageToImage: true,
      inpaint: true,
      controlImages: false
    })
    expect(getImageProviderCapabilities({
      type: 'http',
      requestTemplate: '{"reference":"{{reference_image}}","mask":"{{mask_image}}","controls":{{control_images_json}}}'
    })).toMatchObject({
      imageToImage: true,
      inpaint: true,
      controlImages: true
    })
    await expect(generateImage({ type: 'minimax_image' }, {
      prompt: '局部修订',
      referenceImages: [{ id: 'source', data: 'data:image/png;base64,YWJj' }],
      maskImage: 'data:image/png;base64,bWFzaw==',
      fetchImpl: vi.fn()
    })).rejects.toThrow('不支持带原图的局部遮罩修订')

    expect(IMAGE_MODEL_TYPES).toContainEqual({ value: 'minimax_image', label: 'MiniMax Image' })
    expect(createImageModelConfigDraft('minimax_image')).toMatchObject({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com',
      defaultModel: 'image-01'
    })
    const minimaxFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { image_base64: ['bWluaW1heA=='] },
          base_resp: { status_code: 0, status_msg: 'success' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ object: 'list', data: [{ id: 'MiniMax-M2.7' }] })
      })
    const minimaxImage = await generateImage({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com/',
      apiKey: 'minimax-secret',
      defaultModel: 'image-01'
    }, {
      prompt: '蓝色空间号穿过小行星带',
      negativePrompt: '文字，水印',
      width: 1280,
      height: 720,
      fetchImpl: minimaxFetch
    })
    const minimaxRequest = minimaxFetch.mock.calls[0]
    expect(minimaxRequest[0]).toBe('https://api.minimaxi.com/v1/image_generation')
    expect(minimaxRequest[1].headers.Authorization).toBe('Bearer minimax-secret')
    expect(JSON.parse(minimaxRequest[1].body)).toEqual(expect.objectContaining({
      model: 'image-01',
      prompt: '蓝色空间号穿过小行星带\n避免出现：文字，水印',
      aspect_ratio: '16:9',
      response_format: 'base64',
      n: 1,
      prompt_optimizer: false,
      aigc_watermark: false
    }))
    expect(minimaxImage).toBe('data:image/jpeg;base64,bWluaW1heA==')
    expect(await testImageProviderConnection({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com',
      apiKey: 'minimax-secret'
    }, { fetchImpl: minimaxFetch })).toMatchObject({ ok: true, authenticated: true })
    expect(minimaxFetch.mock.calls[1][0]).toBe('https://api.minimaxi.com/v1/models')
    await expect(generateImage({
      type: 'minimax_image',
      apiKey: 'minimax-secret',
      defaultModel: 'image-01'
    }, {
      prompt: '触发业务错误',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ base_resp: { status_code: 1008, status_msg: 'invalid params' } })
      })
    })).rejects.toThrow('MiniMax Image 1008')

    const savedConfig = saveImageProviderConfig({ ...config, name: '统一图像服务' })
    saveImageProviderConfig({ ...savedConfig, name: '统一图像服务 v2', baseUrl: 'https://images.example/v2/' })
    expect(listImageProviderConfigs().filter((c) => !c.builtin)).toEqual([
      expect.objectContaining({ id: savedConfig.id, name: '统一图像服务 v2', baseUrl: 'https://images.example/v2' })
    ])

    const blobs = new Map()
    const binaryStore = {
      put: async (id, blob) => blobs.set(id, blob),
      get: async (id) => blobs.get(id) || null,
      delete: async (id) => blobs.delete(id)
    }
    const cancelledArchiveKey = 'integration-cancelled-image-library'
    const archiveController = new AbortController()
    const ignoringAbortBinaryStore = {
      put: async (id, blob) => {
        blobs.set(id, blob)
        archiveController.abort()
      },
      get: binaryStore.get,
      delete: binaryStore.delete
    }
    await expect(addGeneratedImageToLibrary(cancelledArchiveKey, {
      id: 'cancelled-image',
      prompt: '取消后不能归档',
      data: 'data:image/png;base64,Y2FuY2VsbGVk'
    }, {
      projectId: 'book-1',
      purpose: 'illustration',
      binaryStore: ignoringAbortBinaryStore,
      signal: archiveController.signal
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(JSON.parse(localStorage.getItem(cancelledArchiveKey) || '[]')).toEqual([])
    expect(listMediaAssets({ projectId: 'book-1' })).toEqual([])
    expect(blobs.size).toBe(0)

    const media = await saveMediaAsset({
      id: 'media-1',
      projectId: 'book-1',
      kind: 'image',
      purpose: 'illustration',
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }],
      provider: savedConfig.type,
      model: savedConfig.defaultModel,
      promptSnapshot: '雨夜街角',
      width: 1280,
      height: 720
    }, {
      binary: 'data:image/png;base64,YWJj',
      binaryStore
    })
    const storedMetadata = localStorage.getItem(STORAGE_KEYS.MEDIA_ASSETS)
    const resolved = await getMediaAsset(media.id, { binaryStore })

    expect(storedMetadata).toContain('idb://pinax-media/assets/media-1')
    expect(storedMetadata).not.toContain('YWJj')
    expect(listMediaAssets({ projectId: 'book-1' })).toHaveLength(1)
    expect(await resolved.blob.text()).toBe('abc')

    const authoringLibraryKey = 'integration-authoring-image-library'
    localStorage.removeItem(authoringLibraryKey)
    const generatedAuthoringImage = await addGeneratedImageToLibrary(authoringLibraryKey, {
      id: 'authoring-image-1',
      prompt: '艾德加站在雨夜街口',
      providerPrompt: '艾德加站在雨夜街口\n人物：艾德加（黑色长外套）',
      promptSupplement: '人物：艾德加（黑色长外套）',
      mode: 'illustration',
      modelType: 'http',
      modelId: 'image-model-1',
      generationJobId: 'image-job-1',
      generationSessionId: 'visual-session-1',
      contextFingerprint: 'visual-fingerprint-1',
      contextKey: 'chapter-1:unit-2',
      generationContext: {
        sessionId: 'visual-session-1',
        authoringVisualBrief: { kind: 'authoring-visual-brief', prompt: '艾德加站在雨夜街口' }
      },
      authoringVisualBrief: { kind: 'authoring-visual-brief', prompt: '艾德加站在雨夜街口' },
      sourceRevisions: { 'chapter:chapter-1': 'revision-7' },
      data: 'data:image/png;base64,YXV0aG9yaW5n'
    }, {
      projectId: 'book-1',
      purpose: 'illustration',
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1', version: 'revision-7' }],
      binaryStore
    })
    const hydratedAuthoringImages = await loadGeneratedImageLibrary(authoringLibraryKey, {
      projectId: 'book-1',
      purpose: 'illustration',
      binaryStore
    })
    expect(generatedAuthoringImage).toMatchObject({
      generationJobId: 'image-job-1',
      generationSessionId: 'visual-session-1',
      contextFingerprint: 'visual-fingerprint-1',
      sourceRevisions: { 'chapter:chapter-1': 'revision-7' },
      generationContext: {
        authoringVisualBrief: { kind: 'authoring-visual-brief' }
      }
    })
    expect(hydratedAuthoringImages[0]).toMatchObject({
      providerPrompt: '艾德加站在雨夜街口\n人物：艾德加（黑色长外套）',
      promptSupplement: '人物：艾德加（黑色长外套）',
      mode: 'illustration',
      authoringVisualBrief: { kind: 'authoring-visual-brief' },
      generationSessionId: 'visual-session-1',
      contextFingerprint: 'visual-fingerprint-1',
      sourceRevisions: { 'chapter:chapter-1': 'revision-7' }
    })
    expect(localStorage.getItem(authoringLibraryKey)).not.toContain('YXV0aG9yaW5n')
    let releaseLibraryRead
    const delayedBinaryStore = {
      ...binaryStore,
      get: (id) => new Promise((resolve) => {
        releaseLibraryRead = () => resolve(blobs.get(id) || null)
      })
    }
    const delayedLibraryLoad = loadGeneratedImageLibrary(authoringLibraryKey, {
      projectId: 'book-1',
      purpose: 'illustration',
      binaryStore: delayedBinaryStore
    })
    await vi.waitFor(() => expect(releaseLibraryRead).toBeTypeOf('function'))
    let concurrentArchiveSettled = false
    const concurrentArchive = addGeneratedImageToLibrary(authoringLibraryKey, {
      id: 'authoring-image-during-load',
      prompt: '加载期间生成的新图',
      data: 'data:image/png;base64,bmV3LWltYWdl'
    }, {
      projectId: 'book-1',
      purpose: 'illustration',
      binaryStore
    }).finally(() => { concurrentArchiveSettled = true })
    await Promise.resolve()
    expect(concurrentArchiveSettled).toBe(false)
    releaseLibraryRead()
    await delayedLibraryLoad
    const concurrentlyArchivedImage = await concurrentArchive
    expect(JSON.parse(localStorage.getItem(authoringLibraryKey))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'authoring-image-1' }),
      expect.objectContaining({ id: 'authoring-image-during-load' })
    ]))
    await Promise.all([
      deleteMediaAsset(concurrentlyArchivedImage.mediaAssetId, { binaryStore }),
      deleteMediaAsset(generatedAuthoringImage.mediaAssetId, { binaryStore })
    ])
    const mediaIdsAfterConcurrentDelete = listMediaAssets({ projectId: 'book-1' }).map((entry) => entry.id)
    expect(mediaIdsAfterConcurrentDelete).not.toContain(concurrentlyArchivedImage.mediaAssetId)
    expect(mediaIdsAfterConcurrentDelete).not.toContain(generatedAuthoringImage.mediaAssetId)

    const legacyAuthoringLibraryKey = 'integration-legacy-authoring-image-library'
    localStorage.setItem(legacyAuthoringLibraryKey, JSON.stringify([{
      id: 'legacy-authoring-image',
      prompt: '旧版画师结果',
      data: 'data:image/png;base64,bGVnYWN5',
      generationParams: {
        generationContext: { sessionId: 'legacy-session' },
        authoringVisualBrief: { kind: 'authoring-visual-brief', fingerprint: 'legacy-fingerprint' },
        sessionId: 'legacy-session',
        fingerprint: 'legacy-fingerprint',
        sourceRevisions: { 'chapter:chapter-1': 'revision-3' }
      }
    }]))
    const migratedLegacyAuthoringImages = await loadGeneratedImageLibrary(legacyAuthoringLibraryKey, {
      projectId: 'book-1',
      purpose: 'illustration',
      binaryStore
    })
    expect(migratedLegacyAuthoringImages[0]).toMatchObject({
      generationContext: { sessionId: 'legacy-session' },
      authoringVisualBrief: { kind: 'authoring-visual-brief', fingerprint: 'legacy-fingerprint' },
      generationSessionId: 'legacy-session',
      contextFingerprint: 'legacy-fingerprint',
      sourceRevisions: { 'chapter:chapter-1': 'revision-3' }
    })
    await deleteMediaAsset(migratedLegacyAuthoringImages[0].mediaAssetId, { binaryStore })

    const workbenchLibraryKey = 'integration-image-workbench'
    localStorage.setItem(workbenchLibraryKey, JSON.stringify([{
      id: 'legacy-workbench-image',
      prompt: '保留中的画面描述',
      generationContext: { sessionId: 'workbench-session' },
      data: 'data:image/png;base64,YWJj',
      createdAt: new Date(0).toISOString()
    }]))
    const workbench = mount(ImageGenerationWorkbench, {
      props: {
        storageKey: workbenchLibraryKey,
        layout: 'split',
        mobilePane: 'results',
        initialPrompt: '作者可见的画面描述',
        promptSupplement: '人物：艾德加（黑色长外套）',
        contextKey: 'workbench-context',
        generationContext: {
          sessionId: 'workbench-session',
          fingerprint: 'workbench-fingerprint',
          sourceRevisions: { 'chapter:chapter-1': 'revision-7' },
          authoringVisualBrief: { kind: 'authoring-visual-brief', fingerprint: 'workbench-fingerprint' }
        },
        sourceRefs: [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1', version: 'revision-7' }],
        allowInsertImageToEditor: true,
        actionGuard: () => ({ insertDisabled: true, insertReason: '来源已更新，不能插入' })
      },
      slots: { brief: () => h('p', { class: 'integration-brief' }, '冻结来源摘要') }
    })
    await flushPromises()
    expect(workbench.classes()).toContain('media-generation-inline--split')
    expect(workbench.attributes('data-mobile-pane')).toBe('results')
    expect(workbench.get('.image-gen-prompt-input').element.value).toBe('作者可见的画面描述')
    expect(workbench.get('.integration-brief').text()).toBe('冻结来源摘要')
    expect(workbench.get('.image-gen-thumb').element.tagName).toBe('BUTTON')
    expect(workbench.get('.image-preview-action-btn').attributes('disabled')).toBeDefined()
    expect(workbench.get('.image-gen-action-reason').text()).toContain('来源已更新')
    const materialButton = workbench.findAll('.image-preview-action-btn').at(-1)
    await materialButton.trigger('click')
    expect(workbench.emitted('save-to-material')?.[0]?.[0]).toMatchObject({
      id: 'legacy-workbench-image',
      generationContext: { sessionId: 'workbench-session' }
    })
    expect(workbench.find('.image-gen-current-preview').exists()).toBe(true)

    const originalFetch = globalThis.fetch
    let resolveLateWorkbenchFetch
    const lateWorkbenchFetch = vi.fn((_url, init) => new Promise((resolve) => {
      resolveLateWorkbenchFetch = () => resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, image: 'data:image/png;base64,bGF0ZS13b3JrYmVuY2g=' })
      })
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }))
    globalThis.fetch = lateWorkbenchFetch
    await workbench.get('.image-gen-generate-btn').trigger('click')
    await vi.waitFor(() => expect(workbench.emitted('generation-start')).toHaveLength(1))
    const frozenWorkbenchJob = workbench.emitted('generation-start')[0][0].job
    expect(frozenWorkbenchJob).toMatchObject({
      sessionId: 'workbench-session',
      contextKey: 'workbench-context',
      prompt: '作者可见的画面描述',
      promptSupplement: '人物：艾德加（黑色长外套）',
      providerPrompt: '作者可见的画面描述\n人物：艾德加（黑色长外套）',
      count: 1,
      sourceRevisions: { 'chapter:chapter-1': 'revision-7' }
    })
    expect(Object.isFrozen(frozenWorkbenchJob)).toBe(true)
    expect(JSON.parse(lateWorkbenchFetch.mock.calls[0][1].body).prompt).toBe(frozenWorkbenchJob.providerPrompt)
    await workbench.setProps({
      contextKey: 'workbench-context-next',
      initialPrompt: '新落笔处的画面描述'
    })
    expect(workbench.get('.image-gen-prompt-input').element.value).toBe('作者可见的画面描述')
    await workbench.get('.image-gen-cancel-btn').trigger('click')
    expect(workbench.get('.image-gen-prompt-input').element.value).toBe('新落笔处的画面描述')
    expect(workbench.emitted('generation-cancel')).toHaveLength(1)
    expect(lateWorkbenchFetch.mock.calls[0][1].signal.aborted).toBe(true)
    resolveLateWorkbenchFetch()
    await vi.waitFor(() => expect(workbench.get('.image-gen-status').text()).toContain('保留 0 张'))
    expect(workbench.emitted('generation-complete')).toBeUndefined()
    expect(localStorage.getItem(STORAGE_KEYS.MEDIA_ASSETS)).not.toContain(frozenWorkbenchJob.jobId)
    // A late failure must not roll back an earlier successful image; retry only
    // the missing image with the original frozen parameters.
    const mediaModule = await import('../services/media/mediaAssetStore')
    const beforeWorkbenchAssetIds = new Set(listMediaAssets().map((asset) => asset.id))
    const realAddGenerated = mediaModule.addGeneratedImageToLibrary
    const addSpy = vi.spyOn(mediaModule, 'addGeneratedImageToLibrary').mockImplementation((key, entry, options) => realAddGenerated(key, entry, { ...options, binaryStore }))
    const partialFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, image: 'data:image/png;base64,cGFydGlhbC1vbmU=' }) })
      .mockRejectedValueOnce(new Error('第二张失败'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, image: 'data:image/png;base64,cGFydGlhbC10d28=' }) })
    globalThis.fetch = partialFetch
    await workbench.findAll('.image-gen-parameter-grid select')[1].setValue('2')
    await workbench.get('.image-gen-generate-btn').trigger('click')
    await vi.waitFor(() => expect(workbench.get('.image-gen-status').text()).toContain('第二张失败'))
    expect(workbench.get('.image-gen-status').text()).toContain('保留 1 张')
    const retained = workbench.findAll('.image-gen-thumb').length
    const retryButton = workbench.findAll('button').find((button) => button.text().includes('继续未完成图片'))
    expect(retryButton).toBeTruthy()
    await retryButton.trigger('click')
    await vi.waitFor(() => expect(workbench.emitted('generation-complete')).toHaveLength(1))
    expect(partialFetch).toHaveBeenCalledTimes(3)
    expect(workbench.findAll('.image-gen-thumb')).toHaveLength(retained + 1)
    addSpy.mockRejectedValueOnce(new Error('存储已满'))
    await workbench.findAll('.image-gen-parameter-grid select')[1].setValue('1')
    await workbench.get('.image-gen-generate-btn').trigger('click')
    await vi.waitFor(() => expect(workbench.find('.image-gen-unsaved').exists()).toBe(true))
    const providerCallsBeforeSaveRetry = partialFetch.mock.calls.length
    expect(workbench.get('.image-gen-unsaved').text()).toContain('关闭或刷新会丢失')
    await workbench.get('.image-gen-unsaved button').trigger('click')
    await vi.waitFor(() => expect(workbench.find('.image-gen-unsaved').exists()).toBe(false))
    expect(partialFetch).toHaveBeenCalledTimes(providerCallsBeforeSaveRetry)
    addSpy.mockRestore()
    for (const asset of listMediaAssets()) {
      if (!beforeWorkbenchAssetIds.has(asset.id)) await deleteMediaAsset(asset.id, { binaryStore })
    }
    globalThis.fetch = originalFetch
    workbench.unmount()

    const parsedScript = parseComicScript(`\`\`\`json
      {"title":"雨夜来客","layout":"strip-4","pagePurpose":"旅人带来危险的秘密","pageTurnHook":"密信上的印记指向掌柜","continuityNotes":["雨势持续"],"visualBibleRefs":[{"kind":"location","refId":"tavern-1","note":"木质酒馆"}],"panels":[
        {"visual":"雨中的街角远景","dialogue":[],"caption":"夜深"},
        {"visual":"旅人推开酒馆木门","dialogue":[{"speaker":"旅人","text":"还有房间吗？"}]},
        {"visual":"掌柜抬头审视旅人","dialogue":[],"caption":""},
        {"visual":"桌下露出沾泥的密信","dialogue":[],"caption":"无人察觉"}
      ]}
    \`\`\``)
    expect(parsedScript.panels).toHaveLength(4)
    expect(buildComicScriptMessages({ sourceText: '雨夜旅人进入酒馆', panelCount: 4 })[1].content)
      .toContain('4 格')

    const comicPage = createComicPage({
      ...parsedScript,
      projectId: 'book-1',
      sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-1', projectId: 'book-1' }]
    })
    expect(comicPage).toMatchObject({
      schemaVersion: 5,
      colorMode: 'color',
      canvas: { width: 1200, height: 1600 },
      visualBible: { lineStyle: '', palette: [] },
      pagePurpose: '旅人带来危险的秘密',
      pageTurnHook: '密信上的印记指向掌柜',
      continuityNotes: ['雨势持续'],
      visualBibleRefs: [{ kind: 'location', refId: 'tavern-1', note: '木质酒馆', revision: 1 }]
    })
    expect(comicPage.panels[0]).toMatchObject({
      frame: { kind: 'rect' },
      direction: { shotSize: null, cameraAngle: null, perspective: null },
      production: { rough: { status: 'empty' }, render: { status: 'empty' } }
    })
    expect(createComicPage({
      ...comicPage,
      id: 'legacy-lettering-style',
      panels: [{
        ...comicPage.panels[0],
        letteringObjects: [{ id: 'legacy-lettering', type: 'speech', text: '旧对白', style: null }]
      }]
    }).panels[0].letteringObjects[0].style).toEqual({
      fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'center', textDirection: 'horizontal', rotation: 0
    })
    saveComicPage(comicPage)
    const withTake = addComicPanelTake(comicPage.id, comicPage.panels[0].id, media.id, { select: true })
    expect(withTake.panels[0].selectedTakeId).toBe(media.id)
    const directed = updateComicPanel(comicPage.id, comicPage.panels[0].id, {
      direction: { shotSize: 'close', cameraAngle: 'low', perspective: 'one-point', focalPoint: { x: 0.32, y: 0.68 }, zoom: 1.4 }
    })
    expect(directed.panels[0]).toMatchObject({
      direction: { revision: 2, shotSize: 'close', cameraAngle: 'low', focalPoint: { x: 0.32, y: 0.68 }, zoom: 1.4 },
      production: { render: { status: 'stale', staleReason: '分镜构图已更新' } }
    })
    expect(createComicPage({ ...comicPage, panels: [{ ...comicPage.panels[0], direction: { zoom: 0.65 } }] }).panels[0].direction.zoom).toBe(0.65)
    const staged = updateComicPanelStage(comicPage.id, comicPage.panels[0].id, 'rough', {
      artifactIds: ['rough-1'],
      selectedArtifactId: 'rough-1',
      status: 'approved'
    })
    expect(staged.panels[0].production.rough).toMatchObject({ status: 'approved', artifactIds: ['rough-1'] })
    const productionPage = saveComicPage(createComicPage({
      id: 'production-page',
      projectId: 'book-1',
      styleBible: '低饱和电影光，角色服装保持一致',
      visualBible: {
        revision: 3,
        palette: ['#28384d', '#d6c6a0'],
        lineStyle: '人物实线，背景减弱',
        renderingNotes: '冷色环境，暖色焦点，效果不得遮挡面部'
      },
      panels: [
        { id: 'production-a', order: 1, visual: '旅人推门进入酒馆' },
        { id: 'production-b', order: 2, visual: '掌柜从柜台后抬头' }
      ]
    }))
    const roughRevision = getComicStageInputRevision(productionPage, productionPage.panels[0], 'rough')
    const withRoughArtifact = addComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      {
        id: 'media-rough-a',
        inputRevision: roughRevision,
        origin: 'uploaded',
        createdAt: 10
      }
    )
    expect(withRoughArtifact.panels[0].production.rough).toMatchObject({
      status: 'review',
      selectedArtifactId: 'media-rough-a',
      inputRevision: roughRevision,
      artifactLineage: [expect.objectContaining({
        id: 'media-rough-a',
        origin: 'uploaded',
        inputRevision: roughRevision
      })]
    })
    const approvedRough = approveComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      { expectedInputRevision: roughRevision, now: 20 }
    )
    expect(approvedRough.panels[0].production.rough).toMatchObject({
      status: 'approved',
      approvedAt: 20
    })
    const generatedRough = await runComicStageGeneration({
      page: approvedRough,
      panel: approvedRough.panels[1],
      stage: 'rough',
      config: {
        id: 'http-stage',
        name: '阶段测试',
        type: 'http',
        baseUrl: 'https://images.example/stage',
        responsePath: 'image'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ image: 'data:image/png;base64,cm91Z2g=' })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRoughRevision = getComicStageInputRevision(
      generatedRough,
      generatedRough.panels[1],
      'rough'
    )
    const approvedGeneratedRough = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'rough',
      { expectedInputRevision: generatedRoughRevision, now: 30 }
    )
    const generatedLine = await runComicStageGeneration({
      page: approvedGeneratedRough,
      panel: approvedGeneratedRough.panels[1],
      stage: 'line',
      config: {
        id: 'sd-stage',
        name: '线稿测试',
        type: 'sd_webui',
        baseUrl: 'http://127.0.0.1:7860'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,bGluZQ=='] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRoughId = approvedGeneratedRough.panels[1].production.rough.selectedArtifactId
    const generatedLineId = generatedLine.panels[1].production.line.selectedArtifactId
    expect(generatedLine.panels[1].production.line).toMatchObject({
      status: 'review',
      artifactLineage: [expect.objectContaining({
        id: generatedLineId,
        parentAssetId: generatedRoughId,
        origin: 'generated'
      })]
    })
    expect(listMediaAssets({}).find((asset) => asset.id === generatedLineId)?.parentAssetId)
      .toBe(generatedRoughId)
    const approvedGeneratedLine = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'line',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedLine,
          generatedLine.panels[1],
          'line'
        ),
        now: 40
      }
    )
    const flatsFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,ZmxhdHM='] })
    })
    const generatedFlats = await runComicStageGeneration({
      page: approvedGeneratedLine,
      panel: approvedGeneratedLine.panels[1],
      stage: 'flats',
      config: {
        id: 'sd-stage',
        name: '后期测试',
        type: 'sd_webui',
        baseUrl: 'http://127.0.0.1:7860'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: flatsFetch,
      mediaOptions: { binaryStore }
    })
    const generatedFlatsId = generatedFlats.panels[1].production.flats.selectedArtifactId
    expect(generatedFlats.panels[1].production.flats.artifactLineage[0]).toMatchObject({
      id: generatedFlatsId,
      parentAssetId: generatedLineId
    })
    const flatsPrompt = JSON.parse(flatsFetch.mock.calls[0][1].body).prompt
    expect(flatsPrompt).toContain('只铺设干净的固有色分区')
    expect(flatsPrompt).toContain('限定色板：#28384d、#d6c6a0')
    expect(flatsPrompt).toContain('冷色环境，暖色焦点')
    const approvedFlats = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'flats',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedFlats,
          generatedFlats.panels[1],
          'flats'
        ),
        now: 50
      }
    )
    const generatedRender = await runComicStageGeneration({
      page: approvedFlats,
      panel: approvedFlats.panels[1],
      stage: 'render',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,cmVuZGVy'] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRenderId = generatedRender.panels[1].production.render.selectedArtifactId
    expect(generatedRender.panels[1].production.render.artifactLineage[0].parentAssetId)
      .toBe(generatedFlatsId)
    const approvedRender = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'render',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedRender,
          generatedRender.panels[1],
          'render'
        ),
        now: 60
      }
    )
    const generatedEffects = await runComicStageGeneration({
      page: approvedRender,
      panel: approvedRender.panels[1],
      stage: 'effects',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,ZWZmZWN0cw=='] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedEffectsId = generatedEffects.panels[1].production.effects.selectedArtifactId
    expect(generatedEffects.panels[1].production.effects.artifactLineage[0].parentAssetId)
      .toBe(generatedRenderId)
    expect(getComicProductionRoute(generatedEffects)).toEqual(['rough', 'line', 'flats', 'render', 'effects'])
    expect(buildComicStagePrompt({
      page: generatedEffects,
      stage: 'tones',
      basePrompt: '雨夜酒馆'
    })).toContain('保持纯黑白输出')

    const monochromePage = saveComicPage(createComicPage({
      id: 'production-monochrome',
      projectId: 'book-1',
      colorMode: 'monochrome',
      visualBible: {
        lineStyle: '硬朗轮廓与大块黑面',
        renderingNotes: '人物使用 20% 网点，背景使用 40% 网点'
      },
      panels: [{ id: 'mono-a', order: 1, visual: '旅人站在逆光门口' }]
    }))
    await saveMediaAsset({
      id: 'media-mono-line',
      projectId: 'book-1',
      kind: 'image',
      purpose: 'comic-panel',
      provider: 'manual',
      promptSnapshot: '人工线稿'
    }, {
      binary: 'data:image/png;base64,bW9uby1saW5l',
      binaryStore
    })
    const monoLineRevision = getComicStageInputRevision(
      monochromePage,
      monochromePage.panels[0],
      'line'
    )
    addComicPanelStageArtifact(monochromePage.id, 'mono-a', 'line', {
      id: 'media-mono-line',
      inputRevision: monoLineRevision,
      origin: 'uploaded',
      createdAt: 70
    })
    const approvedMonoLine = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'line',
      { expectedInputRevision: monoLineRevision, now: 80 }
    )
    const uploadedTones = await archiveUploadedComicStage({
      page: approvedMonoLine,
      panel: approvedMonoLine.panels[0],
      stage: 'tones',
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      data: 'data:image/png;base64,dG9uZXM=',
      mediaOptions: { binaryStore }
    })
    const uploadedTonesId = uploadedTones.page.panels[0].production.tones.selectedArtifactId
    expect(uploadedTones.page.panels[0].production.tones.artifactLineage[0]).toMatchObject({
      id: uploadedTonesId,
      parentAssetId: 'media-mono-line',
      origin: 'uploaded'
    })
    const approvedTones = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'tones',
      {
        expectedInputRevision: getComicStageInputRevision(
          uploadedTones.page,
          uploadedTones.page.panels[0],
          'tones'
        ),
        now: 90
      }
    )
    expect(getComicProductionRoute(approvedTones)).toEqual(['rough', 'line', 'tones', 'effects'])
    expect(getComicStageGate({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'effects',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: true, upstream: { stage: 'tones', artifactId: uploadedTonesId } })
    expect(getComicStageGate({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'render',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: false, reason: '黑白项目不使用彩色制作阶段' })
    const monoEffects = await runComicStageGeneration({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'effects',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,bW9uby1lZmZlY3Rz'] })
      }),
      mediaOptions: { binaryStore }
    })
    const monoEffectsId = monoEffects.panels[0].production.effects.selectedArtifactId
    const approvedMonoEffects = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'effects',
      {
        expectedInputRevision: getComicStageInputRevision(
          monoEffects,
          monoEffects.panels[0],
          'effects'
        ),
        now: 100
      }
    )
    const replacedMonoLine = addComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'line',
      {
        id: 'media-mono-line-v2',
        inputRevision: getComicStageInputRevision(
          approvedMonoEffects,
          approvedMonoEffects.panels[0],
          'line'
        ),
        origin: 'uploaded',
        createdAt: 110
      }
    )
    expect(replacedMonoLine.panels[0].production.tones.status).toBe('stale')
    expect(replacedMonoLine.panels[0].production.effects.status).toBe('stale')
    const switchedToColor = updateComicPageColorMode(monochromePage.id, 'color')
    expect(switchedToColor.colorMode).toBe('color')
    expect(switchedToColor.visualBibleStatus).toBe('draft')
    expect(switchedToColor.panels[0].production.tones.status).toBe('stale')
    await expect(runComicStageGeneration({
      page: generatedLine,
      panel: generatedLine.panels[0],
      stage: 'line',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn(),
      mediaOptions: { binaryStore }
    })).rejects.toThrow('上游阶段产物不可用')
    const afterIsolatedFailure = listComicPages({}).find((page) => page.id === productionPage.id)
    expect(afterIsolatedFailure.panels[0].production.line.status).toBe('failed')
    expect(afterIsolatedFailure.panels[1].production.line.selectedArtifactId).toBe(generatedLineId)
    expect(getComicStageGate({
      page: approvedRough,
      panel: approvedRough.panels[0],
      stage: 'line',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: true, upstream: { artifactId: 'media-rough-a' } })
    expect(getComicStageGate({
      page: approvedRough,
      panel: approvedRough.panels[0],
      stage: 'line',
      config: { type: 'minimax_image' }
    })).toMatchObject({ allowed: false, reason: '当前模型不支持保持上游构图继续生成' })
    expect(getComicBatchEligiblePanels(approvedRough, 'line', { type: 'sd_webui' })
      .map((panel) => panel.id)).toEqual(['production-a'])
    const changedProduction = updateComicPanel(productionPage.id, 'production-a', {
      visual: '旅人推门后回头看向雨幕'
    })
    const reselectedOldRough = selectComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      'media-rough-a'
    )
    expect(reselectedOldRough.panels[0].production.rough.status).toBe('review')
    expect(() => approveComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      {
        expectedInputRevision: getComicStageInputRevision(
          changedProduction,
          changedProduction.panels[0],
          'rough'
        )
      }
    )).toThrow('候选基于旧版分镜或上游')
    const productionWorkbench = mount(ComicStageWorkbench, {
      props: {
        page: approvedRough,
        panel: approvedRough.panels[1],
        modelConfig: { id: 'sd', type: 'sd_webui' },
        storageKey: 'comic-production-test',
        projectId: 'book-1'
      }
    })
    expect(productionWorkbench.findAll('.comic-stage-workbench__tabs button')).toHaveLength(5)
    expect(productionWorkbench.findAll('.comic-stage-workbench__capabilities .supported')).toHaveLength(3)
    await flushPromises()
    expect(productionWorkbench.text()).toContain('尚无阶段产物')
    productionWorkbench.unmount()
    const monochromeWorkbench = mount(ComicStageWorkbench, {
      props: {
        page: approvedTones,
        panel: approvedTones.panels[0],
        modelConfig: { id: 'sd-mono', type: 'sd_webui' },
        storageKey: 'comic-production-test',
        projectId: 'book-1'
      }
    })
    const monochromeStages = monochromeWorkbench
      .findAll('.comic-stage-workbench__tabs button strong')
      .map((item) => item.text())
    expect(monochromeStages).toEqual(['草稿', '线稿', '黑块/网点', '效果'])
    expect(monochromeWorkbench.text()).toContain('人物使用 20% 网点')
    monochromeWorkbench.unmount()
    const withBible = updateComicVisualBible(comicPage.id, {
      lineStyle: '细线与大块黑面',
      palette: ['#28384d', '#d6c6a0']
    })
    expect(withBible.visualBible).toMatchObject({ revision: 2, lineStyle: '细线与大块黑面' })
    expect(listComicPages({ sourceRef: { refType: 'narrative-asset', refId: 'asset-1' } })[0])
      .toMatchObject({ id: comicPage.id, layout: 'strip-4', status: 'draft' })
    expect(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES)).not.toContain('data:image')
    const manifest = buildComicPageManifest(withTake, { now: 1 })
    expect(manifest).toMatchObject({
      format: 'pinax-comic-page',
      version: 5,
      manifestVersion: 2,
      page: { id: comicPage.id, panels: expect.arrayContaining([expect.objectContaining({ selectedTakeId: media.id })]) }
    })
    expect(JSON.stringify(manifest)).not.toContain('data:image')
    expect(estimateLineCount('风从门缝里吹进来', 120, 22)).toBeGreaterThan(1)
    const letteringReport = analyzeComicLettering(createComicPage({
      ...comicPage,
      id: 'lettering-audit',
      panels: [{
        ...comicPage.panels[0],
        letteringObjects: [{
          id: 'overflowing',
          type: 'speech',
          text: '这是一段明显超过文字框容纳范围的对白，用于检验出版质检是否会阻止溢出内容。',
          box: [0.02, 0.02, 0.12, 0.08],
          style: { fontSize: 22 }
        }]
      }]
    }))
    expect(letteringReport.blocking.some((issue) => issue.id.startsWith('overflow:'))).toBe(true)
    expect(letteringReport.warnings.some((issue) => issue.id.startsWith('tail:'))).toBe(true)
    expect(buildComicPublicationReport(createComicPage({ ...comicPage, id: 'missing-final' })).blocking)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('image:') })]))
    expect(createComicPage({ ...comicPage, id: 'feature-layout', layout: 'feature-4' }).layout).toBe('feature-4')
    const featureRects = getComicPanelRects('feature-6', 1200, 1600, 6)
    expect(featureRects).toHaveLength(6)
    expect(featureRects[0].width).toBeGreaterThan(featureRects[1].width)
    expect(featureRects[5].y).toBeGreaterThan(featureRects[3].y)
    const featurePage = createComicPage({
      ...comicPage,
      id: 'feature-page-geometry',
      layout: 'feature-4',
      panels: comicPage.panels.map((panel) => ({
        ...panel,
        frame: getDefaultComicPanelFrame('feature-4', panel.order, comicPage.panels.length)
      }))
    })
    expect(getComicPanelImageSize(featurePage, 2)).toEqual({ width: 720, height: 1280 })
    expect(getDefaultComicPanelFrame('feature-6', 6, 6).points[0].y).toBeGreaterThan(0.7)
    const fivePanelRects = getComicPanelRects('free', 1200, 1600, 5)
    expect(fivePanelRects).toHaveLength(5)
    expect(fivePanelRects[4].y + fivePanelRects[4].height).toBeLessThanOrEqual(1600)

    const compositionPage = saveComicPage(createComicPage({
      id: 'composition-page',
      projectId: 'book-1',
      layout: 'free',
      panels: [
        { id: 'composition-a', order: 1, visual: '建立镜头', frame: getDefaultComicPanelFrame('strip-4', 1, 4) },
        { id: 'composition-b', order: 2, visual: '人物进门', frame: getDefaultComicPanelFrame('strip-4', 2, 4) },
        { id: 'composition-c', order: 3, visual: '掌柜抬头', frame: getDefaultComicPanelFrame('strip-4', 3, 4) },
        { id: 'composition-d', order: 4, visual: '密信露出', frame: getDefaultComicPanelFrame('strip-4', 4, 4) }
      ]
    }))
    updateComicPanelStage(compositionPage.id, 'composition-a', 'rough', {
      artifactIds: ['rough-a'],
      selectedArtifactId: 'rough-a',
      status: 'approved'
    })
    updateComicPanelStage(compositionPage.id, 'composition-b', 'rough', {
      artifactIds: ['rough-b'],
      selectedArtifactId: 'rough-b',
      status: 'approved'
    })
    const approvedComposition = listComicPages().find((page) => page.id === compositionPage.id)
    const secondFrameBefore = JSON.stringify(approvedComposition.panels[1].frame)
    const splitComposition = splitComicPanel(approvedComposition, 'composition-a', 'vertical')
    expect(splitComposition.panels).toHaveLength(5)
    expect(getComicFrameBounds(splitComposition.panels[0].frame).width)
      .toBeLessThan(getComicFrameBounds(approvedComposition.panels[0].frame).width)
    expect(JSON.stringify(splitComposition.panels[2].frame)).toBe(secondFrameBefore)
    const persistedComposition = updateComicPageComposition(compositionPage.id, splitComposition)
    expect(persistedComposition.layout).toBe('free')
    expect(persistedComposition.panels[0].production.rough.status).toBe('stale')
    expect(persistedComposition.panels[2].production.rough.status).toBe('approved')
    const splitPanelId = persistedComposition.panels[1].id
    const splitPanelFrame = JSON.stringify(persistedComposition.panels[1].frame)
    const reorderedComposition = reorderComicPanel(persistedComposition, splitPanelId, 1)
    expect(JSON.stringify(reorderedComposition.panels.find((panel) => panel.id === splitPanelId).frame))
      .toBe(splitPanelFrame)
    const mergedComposition = mergeComicPanelWithNext(reorderedComposition, splitPanelId)
    expect(mergedComposition.panels).toHaveLength(4)
    const resizedFrame = resizeComicPanelFrame(mergedComposition.panels[0].frame, 'e', { x: 0.04, y: 0 })
    expect(getComicFrameBounds(resizedFrame).width)
      .toBeGreaterThan(getComicFrameBounds(mergedComposition.panels[0].frame).width)
    let controlledComposition = addComicDirectionControl(mergedComposition, mergedComposition.panels[0].id, 'blocking')
    controlledComposition = addComicDirectionControl(controlledComposition, controlledComposition.panels[0].id, 'motion')
    controlledComposition = addComicDirectionControl(controlledComposition, controlledComposition.panels[0].id, 'balloon')
    controlledComposition = updateComicPanelDirection(controlledComposition, controlledComposition.panels[0].id, {
      focalPoint: { x: 0, y: 1 },
      horizonY: 0.25
    })
    const normalizedControls = createComicPage(controlledComposition).panels[0].direction
    expect(normalizedControls.blocking[0]).toMatchObject({ label: '人物 1', box: [0.32, 0.2, 0.36, 0.66] })
    expect(normalizedControls.motionVectors[0]).toMatchObject({ from: [0.22, 0.7], to: [0.76, 0.34] })
    expect(normalizedControls.balloonSafeZones[0]).toMatchObject({ box: [0.52, 0.08, 0.4, 0.2] })
    expect(normalizedControls.focalPoint).toEqual({ x: 0, y: 1 })
    expect(normalizedControls.horizonY).toBe(0.25)
    const ungutteredRect = getComicPanelRect(controlledComposition, controlledComposition.panels[0].order)
    const gutteredComposition = setComicPanelGutter(controlledComposition, controlledComposition.panels[0].id, 0.04)
    const gutteredRect = getComicPanelRect(gutteredComposition, gutteredComposition.panels[0].order)
    expect(gutteredRect.width).toBeLessThan(ungutteredRect.width)
    expect(gutteredRect.x).toBeGreaterThan(ungutteredRect.x)
    const webtoonComposition = setComicCompositionFormat(controlledComposition, 'webtoon')
    expect(webtoonComposition.canvas.height).toBeGreaterThan(webtoonComposition.canvas.width * 2)
    expect(getComicPanelRect(webtoonComposition, webtoonComposition.panels[0].order).width).toBeGreaterThan(0)

    const compositionCanvas = mount(ComicCompositionCanvas, {
      props: {
        page: createComicPage(controlledComposition),
        activePanelId: controlledComposition.panels[0].id
      }
    })
    expect(compositionCanvas.findAll('.comic-composition__frame-handle')).toHaveLength(8)
    expect(compositionCanvas.findAll('.comic-composition__modes button')).toHaveLength(6)
    await compositionCanvas.findAll('.comic-composition__modes button')[1].trigger('click')
    await compositionCanvas.get('.comic-composition__add').trigger('click')
    expect(compositionCanvas.emitted('update-page')).toBeTruthy()
    await compositionCanvas.findAll('.comic-composition__modes button')[3].trigger('click')
    expect(compositionCanvas.get('.comic-composition__focus').attributes('aria-label')).toBe('拖动视觉焦点')
    expect(compositionCanvas.get('.comic-composition__horizon').attributes('aria-label')).toBe('拖动地平线')
    compositionCanvas.unmount()

    const referenceCatalog = buildComicReferenceCatalog({
      worldbook: {
        id: 'book-1',
        entries: [
          { id: 'char-traveler', type: 'character', name: '旅人', content: '黑发，灰色斗篷，左手戴旧戒指。' },
          { id: 'prop-letter', type: 'item', name: '密信', content: '沾泥的蓝蜡封口信。' }
        ],
        geoHistory: {
          placeRefs: [{ placeId: 'place:tavern', name: '木质酒馆', semanticType: 'building' }],
          nodes: []
        }
      },
      assets: [{
        id: 'asset-style',
        projectId: 'book-1',
        title: '雨夜线稿参考',
        content: '细线、大块黑面、冷蓝雨幕。',
        kind: 'reference-image',
        sourceRefs: [],
        image: { mediaAssetId: 'media-style' }
      }]
    })
    expect(referenceCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'character',
        sourceRef: expect.objectContaining({ refType: 'worldbook-entry', refId: 'char-traveler' })
      }),
      expect.objectContaining({
        kind: 'location',
        sourceRef: expect.objectContaining({ refType: 'map-site', refId: 'place:tavern' })
      }),
      expect.objectContaining({
        kind: 'style',
        assetIds: ['media-style']
      })
    ]))
    expect(buildComicAdaptationMessages({
      sources: [{ title: '雨夜来客', content: '旅人进入酒馆并发现密信。' }],
      referenceCatalog
    })[0].content).toContain('每页按叙事需要使用 1-8 格')

    const characterReferenceId = referenceCatalog.find((item) => item.kind === 'character').id
    const locationReferenceId = referenceCatalog.find((item) => item.kind === 'location').id
    const adaptationCandidates = parseComicAdaptationCandidates(JSON.stringify({
      candidates: [
        {
          id: 'slow-burn',
          title: '悬念缓燃',
          rationale: '先建立空间，再把密信作为页尾揭示。',
          format: 'page-ltr',
          colorMode: 'monochrome',
          pages: [
            {
              title: '雨幕',
              narrativeBeat: '建立旅人与酒馆的距离',
              pageTurnHook: '门缝出现掌柜的眼睛',
              continuityNotes: ['雨势持续'],
              panels: [
                { visual: '雨夜街角远景', beat: { action: '旅人走近酒馆' } },
                { visual: '湿透的靴子踏过门槛', beat: { action: '推门' } },
                { visual: '掌柜隔着灯影抬眼', beat: { reveal: '掌柜早有戒备' } }
              ]
            },
            {
              title: '密信',
              narrativeBeat: '把视线引到柜台下',
              pageTurnHook: '蓝蜡印记露出一角',
              panels: [
                { visual: '旅人与掌柜隔桌对峙' },
                { visual: '桌下露出沾泥密信' }
              ]
            }
          ],
          visualBible: {
            referenceIds: [characterReferenceId, locationReferenceId],
            invariants: [
              { referenceId: characterReferenceId, notes: ['灰色斗篷', '左手旧戒指'], locked: true },
              { referenceId: locationReferenceId, notes: ['柜台位于入口右侧'], locked: true }
            ],
            palette: ['冷蓝', '灯火灰白'],
            lineStyle: '细线与大块黑面',
            renderingNotes: '雨幕使用疏密网点'
          }
        },
        {
          id: 'fast-cut',
          title: '快速切入',
          rationale: '以密信开场，再回补旅人进入酒馆。',
          format: 'page-ltr',
          colorMode: 'color',
          pages: [
            {
              title: '蓝蜡',
              narrativeBeat: '先给出谜面',
              pageTurnHook: '旅人的手按住信封',
              panels: Array.from({ length: 5 }, (_, index) => ({
                visual: `密信细节镜头 ${index + 1}`,
                beat: { action: '逐步揭示印记' }
              }))
            },
            {
              title: '来客',
              narrativeBeat: '回到旅人进门',
              pageTurnHook: '掌柜认出戒指',
              panels: [{ visual: '旅人推门进入酒馆' }]
            }
          ],
          visualBible: {
            referenceIds: [characterReferenceId],
            invariants: [{ referenceId: characterReferenceId, notes: ['灰色斗篷'], locked: true }],
            palette: ['冷蓝', '暖黄'],
            lineStyle: '清晰轮廓',
            renderingNotes: '低饱和电影光'
          }
        }
      ]
    }))
    expect(adaptationCandidates).toHaveLength(2)
    expect(adaptationCandidates[0].pages.map((page) => page.panels.length)).toEqual([3, 2])
    expect(adaptationCandidates[1].pages[0].panels).toHaveLength(5)

    const sequencePages = buildComicPagesFromAdaptation({
      candidate: adaptationCandidates[0],
      sources: [{ id: 'asset-1', projectId: 'book-1', content: '雨夜旅人进入酒馆' }],
      referenceCatalog,
      projectId: 'book-1',
      sequenceId: 'sequence-rain'
    })
    expect(sequencePages).toHaveLength(2)
    expect(sequencePages[0]).toMatchObject({
      sequenceId: 'sequence-rain',
      pageNumber: 1,
      adaptationCandidateId: 'slow-burn',
      visualBibleStatus: 'draft',
      panels: [{ order: 1 }, { order: 2 }, { order: 3 }]
    })
    expect(sequencePages[0].visualBible.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'character',
        locked: true,
        sourceRef: expect.objectContaining({ refId: 'char-traveler' }),
        invariantNotes: ['灰色斗篷', '左手旧戒指']
      })
    ]))
    saveComicPages(sequencePages)
    expect(listComicSequencePages('sequence-rain').map((page) => page.pageNumber)).toEqual([1, 2])
    expect(canBatchGenerateComicPage(listComicSequencePages('sequence-rain')[0])).toBe(false)
    const confirmedSequence = confirmComicSequenceVisualBible('sequence-rain')
    expect(confirmedSequence.every((page) => page.visualBibleStatus === 'confirmed')).toBe(true)
    expect(canBatchGenerateComicPage(confirmedSequence[0])).toBe(true)

    const sourceDrawer = mount(MaterialSourceDrawer, {
      props: {
        assets: [
          { id: 'asset-a', title: '雨夜来客', kind: 'event', status: 'accepted' },
          { id: 'asset-b', title: '旧港地形', kind: 'worldbook-draft', status: 'accepted' }
        ],
        selectedIds: ['asset-a', 'asset-b'],
        multi: true
      }
    })
    expect(sourceDrawer.findAll('.index-card.is-selected')).toHaveLength(2)
    expect(sourceDrawer.get('.index-card').attributes('aria-label')).toContain('切换改编素材')
    sourceDrawer.unmount()

    const adaptationPlanner = mount(ComicAdaptationPlanner, {
      props: {
        sources: [{ id: 'asset-a', title: '雨夜来客' }],
        candidates: adaptationCandidates,
        selectedCandidateId: adaptationCandidates[0].id,
        plan: adaptationCandidates[0],
        referenceCatalog
      }
    })
    expect(adaptationPlanner.findAll('[role="tab"]')).toHaveLength(2)
    expect(adaptationPlanner.findAll('.comic-planner__page-flow > li')).toHaveLength(2)
    expect(adaptationPlanner.findAll('.comic-planner__panel-beats')).toHaveLength(2)
    expect(adaptationPlanner.text()).toContain('视觉圣经')
    await adaptationPlanner.findAll('.comic-planner__icon')[0].trigger('click')
    expect(adaptationPlanner.emitted('update-plan')).toBeTruthy()
    await adaptationPlanner.get('.comic-planner__footer .comic-planner__primary').trigger('click')
    expect(adaptationPlanner.emitted('apply')).toHaveLength(1)
    adaptationPlanner.unmount()

    const persistedPlanner = mount(ComicAdaptationPlanner, {
      props: {
        sources: [],
        candidates: [],
        plan: {
          ...adaptationCandidates[0],
          visualBible: {
            ...adaptationCandidates[0].visualBible,
            references: adaptationCandidates[0].visualBible.references
          }
        },
        referenceCatalog,
        persisted: true,
        bibleConfirmed: false
      }
    })
    await persistedPlanner.get('.comic-planner__header .comic-planner__primary').trigger('click')
    expect(persistedPlanner.emitted('confirm-bible')).toHaveLength(1)
    persistedPlanner.unmount()

    const coverTransform = getComicImageStyle(
      featurePage,
      { ...featurePage.panels[0], direction: { zoom: 1, focalPoint: { x: 0.5, y: 0.5 } } },
      { width: 1200, height: 675 }
    ).transform
    const revealTransform = getComicImageStyle(
      featurePage,
      { ...featurePage.panels[0], direction: { zoom: 0.5, focalPoint: { x: 0.5, y: 0.5 } } },
      { width: 1200, height: 675 }
    ).transform
    expect(Number(coverTransform.match(/scale\(([^)]+)/)?.[1])).toBeGreaterThan(1)
    expect(Number(revealTransform.match(/scale\(([^)]+)/)?.[1])).toBeLessThan(1)

    const imageRequest = buildComicPanelImageRequest({
      page: comicPage,
      panel: { ...comicPage.panels[1], visual: '旅人推开酒馆木门，雨水从斗篷滴落' },
      previousPanel: { ...comicPage.panels[0], visual: '雨中的街角远景，酒馆门口亮着暖灯' },
      sourceTitle: '雨夜来客',
      sourceText: '雨夜，旅人进入酒馆。他问：“还有房间吗？”掌柜注意到他袖口的泥。',
      providerType: 'minimax_image',
      previousImageData: 'data:image/png;base64,YWJj',
      targetAspect: '3:4'
    })
    expect(imageRequest.prompt).toContain('单幅')
    expect(imageRequest.prompt).toContain('雨夜来客')
    expect(imageRequest.prompt).toContain('连续性优先')
    expect(imageRequest.prompt).toContain('上一镜锚点')
    expect(imageRequest.prompt).toContain('目标画幅：3:4')
    expect(imageRequest.prompt).not.toContain('还有房间吗')
    expect(imageRequest.prompt).not.toContain('拼贴')
    expect(imageRequest.prompt).not.toContain('气泡')
    expect(imageRequest.prompt.toLowerCase()).not.toContain('comic panel')
    expect(imageRequest.negativePrompt).toBe('')
    expect(imageRequest.referenceImages).toEqual([])
    expect(`${imageRequest.prompt}\n${imageRequest.negativePrompt}`.length).toBeLessThanOrEqual(1480)
    const referencedImageRequest = buildComicPanelImageRequest({
      page: comicPage,
      panel: comicPage.panels[1],
      previousPanel: comicPage.panels[0],
      providerType: 'sd_webui',
      previousImageData: 'data:image/png;base64,YWJj'
    })
    expect(referencedImageRequest.negativePrompt).toContain('拼贴')
    expect(referencedImageRequest.referenceImages).toHaveLength(1)
    const compositionImageRequest = buildComicPanelImageRequest({
      page: controlledComposition,
      panel: createComicPage(controlledComposition).panels[0],
      sourceTitle: '雨夜来客',
      sourceText: '旅人进入酒馆'
    })
    expect(compositionImageRequest.prompt).toContain('人物调度')
    expect(compositionImageRequest.prompt).toContain('运动动线')
    expect(compositionImageRequest.prompt).toContain('视觉焦点在左侧下方')
    expect(compositionImageRequest.prompt).toContain('地平线约在画面高度 25%')
    expect(compositionImageRequest.prompt).toContain('后期文字留白')
    expect(compositionImageRequest.prompt).toContain('不要绘制文字或气泡')

    const comicEditor = mount(ComicPageEditor, {
      props: {
        sourceText: '雨夜旅人进入酒馆',
        sourceTitle: '雨夜来客',
        projectId: 'book-1',
        sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-1', projectId: 'book-1' }],
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await flushPromises()
    expect(comicEditor.text()).toContain('分格导航')
    expect(comicEditor.text()).not.toContain('视觉连续性')
    const placeScriptButton = comicEditor.findAll('button').find((button) => button.text() === '排入画面')
    expect(placeScriptButton).toBeTruthy()
    await placeScriptButton.trigger('click')
    expect(comicEditor.findAll('.comic-lettering-overlay')).toHaveLength(1)
    expect(comicEditor.find('.comic-lettering-overlay').text()).toBe('夜深')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES))[0].panels[0].letteringObjects)
      .toEqual([expect.objectContaining({
        type: 'caption',
        text: '夜深',
        style: { fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'left', textDirection: 'horizontal', rotation: 0 }
      })])
    await comicEditor.get('select[aria-label="字体"]').setValue('rounded')
    await comicEditor.get('input[aria-label="字号"]').setValue(37)
    await comicEditor.get('select[aria-label="字重"]').setValue('800')
    await comicEditor.get('select[aria-label="文字对齐"]').setValue('right')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES))[0].panels[0].letteringObjects[0].style)
      .toEqual({ fontFamily: 'rounded', fontSize: 37, fontWeight: 800, textAlign: 'right', textDirection: 'horizontal', rotation: 0 })
    expect(comicEditor.findAll('.comic-lettering-overlay__handle')).toHaveLength(8)
    await comicEditor.get('.comic-editor__workspace-tabs button:first-child').trigger('click')
    expect(comicEditor.text()).toContain('视觉连续性')
    expect(comicEditor.text()).toContain('页级节拍与连续性')
    expect(comicEditor.find('.comic-editor__planning-overview').exists()).toBe(true)
    comicEditor.unmount()

    const editablePreview = mount(ComicPagePreview, {
      props: {
        page: createComicPage({
          ...comicPage,
          id: 'editable-preview',
          panels: [{
            ...comicPage.panels[0],
        letteringObjects: [{
          id: 'preview-lettering',
          type: 'speech',
          text: '可以直接调整',
          box: [0.5, 0.08, 0.42, 0.18],
          tailTarget: { x: 0.72, y: 0.5 }
            }]
          }]
        }),
        editableLettering: true
      }
    })
    const previewPanel = editablePreview.get('.comic-page-preview__panel')
    previewPanel.element.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 300, width: 400, height: 300
    })
    const previewLettering = editablePreview.get('.comic-page-preview__lettering')
    expect(previewLettering.element.tagName).toBe('BUTTON')
    expect(editablePreview.findAll('.comic-page-preview__lettering-handle')).toHaveLength(8)
    expect(editablePreview.find('.comic-page-preview__lettering-tail')).toBeTruthy()
    const dispatchPointer = (type, clientX, clientY) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
      Object.defineProperty(event, 'pointerId', { value: 4 })
      previewLettering.element.dispatchEvent(event)
    }
    dispatchPointer('pointerdown', 250, 50)
    dispatchPointer('pointermove', 210, 80)
    dispatchPointer('pointerup', 210, 80)
    await flushPromises()
    expect(editablePreview.emitted('update-lettering-box')?.[0]?.[0]).toMatchObject({
      panelId: comicPage.panels[0].id,
      objectId: 'preview-lettering',
      box: [0.4, 0.18, 0.42, 0.18]
    })
    editablePreview.unmount()

    updateComicPanel(comicPage.id, comicPage.panels[0].id, { visual: '' })
    const standaloneEditor = mount(ComicPageEditor, {
      props: {
        pageId: comicPage.id,
        standalone: true,
        sourceCandidates: [{
          id: 'asset-panel-2',
          projectId: 'book-1',
          title: '柜台下的密信',
          content: '掌柜弯腰时，桌下露出一封沾泥的密信。旅人立刻按住斗篷。',
          kind: 'event'
        }],
        projectId: 'book-1',
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await flushPromises()
    const panelSourceSelect = standaloneEditor.get('.comic-panel__source-select select')
    await panelSourceSelect.setValue('asset-panel-2')
    const reboundPage = listComicPages({ projectId: 'book-1' }).find((page) => page.id === comicPage.id)
    expect(reboundPage.panels[0].continuityRefs).toEqual([
      expect.objectContaining({ refType: 'narrative-asset', refId: 'asset-panel-2' })
    ])
    expect(reboundPage.sourceRefs).toEqual([
      expect.objectContaining({ refType: 'narrative-asset', refId: 'asset-panel-2' })
    ])
    expect(reboundPage.panels[0].visual).toBe('')
    standaloneEditor.unmount()

    const blankEditor = mount(ComicPageEditor, {
      props: {
        sourceText: '另一个场景',
        sourceTitle: '六格空白页',
        projectId: 'book-1',
        sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-blank', projectId: 'book-1' }],
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await blankEditor.get('.comic-editor__draft-choice--count button:last-child').trigger('click')
    await blankEditor.get('.comic-editor__draft-actions button:last-child').trigger('click')
    expect(blankEditor.text()).toContain('0/6')
    expect(blankEditor.findAll('.comic-page-preview__panel')).toHaveLength(6)
    blankEditor.unmount()

    localStorage.setItem('legacy_image_library', JSON.stringify([{
      id: 'legacy-1',
      prompt: '旧图片',
      modelName: '旧模型',
      modelType: 'http',
      data: 'data:image/png;base64,YWJj'
    }]))
    const migrated = await loadGeneratedImageLibrary('legacy_image_library', { binaryStore })
    expect(migrated[0]).toMatchObject({ id: 'legacy-1', data: 'data:image/png;base64,YWJj' })
    expect(localStorage.getItem('legacy_image_library')).not.toContain('YWJj')

    await deleteMediaAsset(media.id, { binaryStore })
    await deleteMediaAsset(migrated[0].mediaAssetId, { binaryStore })

    localStorage.setItem(STORAGE_KEYS.PROSE_CARDS_V1, JSON.stringify([{
      id: 'card-1',
      content: '雨夜街角',
      attachedImages: [{
        id: 'canvas-image-1',
        prompt: '雨夜街角',
        data: 'data:image/png;base64,YWJj'
      }]
    }]))
    const migratedCards = await migrateCanvasAttachedImages({ binaryStore })
    const canvasImage = migratedCards[0].attachedImages[0]
    expect(canvasImage.mediaAssetId).toBeTruthy()
    expect(canvasImage.data).toContain('data:image/png')
    expect(localStorage.getItem(STORAGE_KEYS.PROSE_CARDS_V1)).not.toContain('YWJj')
    expect(JSON.stringify(serializeCanvasCards(migratedCards))).not.toContain('YWJj')
    expect(listMediaAssets({ sourceRef: { refType: 'canvas-card', refId: 'card-1' } })).toHaveLength(1)
    const canvasStorageData = new Map([['prose_edges_v1', JSON.stringify([{ id: 'old-edge' }])]])
    let canvasWriteCount = 0
    const failingCanvasStorage = {
      getItem: (key) => canvasStorageData.get(key) ?? null,
      setItem: (key, value) => {
        canvasWriteCount += 1
        if (canvasWriteCount === 3) throw new Error('quota')
        canvasStorageData.set(key, value)
      },
      removeItem: (key) => canvasStorageData.delete(key)
    }
    const canvasSave = saveProseCanvasWorkspace({
      cards: [{ id: 'new-card' }],
      edges: [{ id: 'new-edge' }]
    }, { storage: failingCanvasStorage })
    expect(canvasSave).toMatchObject({ ok: false, reason: 'storage-write-failed', rollbackOk: true })
    expect(JSON.parse(canvasStorageData.get('prose_edges_v1'))).toEqual([{ id: 'old-edge' }])
    expect(canvasStorageData.has(STORAGE_KEYS.PROSE_CARDS_V1)).toBe(false)
    await deleteMediaAsset(canvasImage.mediaAssetId, { binaryStore })
    await deleteMediaAsset(generatedRoughId, { binaryStore })
    await deleteMediaAsset(generatedLineId, { binaryStore })
    await deleteMediaAsset(generatedFlatsId, { binaryStore })
    await deleteMediaAsset(generatedRenderId, { binaryStore })
    await deleteMediaAsset(generatedEffectsId, { binaryStore })
    await deleteMediaAsset('media-mono-line', { binaryStore })
    await deleteMediaAsset(uploadedTonesId, { binaryStore })
    await deleteMediaAsset(monoEffectsId, { binaryStore })

    expect(listMediaAssets()).toHaveLength(0)
    expect(blobs.has(media.id)).toBe(false)
    expect(deleteImageProviderConfig(savedConfig.id).filter((c) => !c.builtin)).toEqual([])
  }, 30000)
})

describe('ShotExporter', () => {
  it("extracts shots from relation canvas tree nodes（合并4例）", async () => {
{
const nodes = [
      {
        id: '1',
        text: '夜色',
        emotion: 'calm',
        extraFields: {
          shotType: 'wide',
          cameraMovement: 'pan',
          duration: 4
        },
        parentId: null
      },
      {
        id: '2',
        text: '路灯',
        examples: ['光线落在街角'],
        parentId: '1'
      }
    ]
    const shots = extractShotsFromRelationCanvas({
      nodes,
      edges: [{ sourceId: '1', targetId: '2', type: 'JUMP_CUT' }]
    })

    expect(shots.length).toBe(2)
    expect(shots[0].content).toBe('夜色')
    expect(shots[0].tone).toBe('淡蓝冷色调')
    expect(shots[1].dialogue).toBe('光线落在街角')
    expect(shots[1].transition).toBe('cut')
}
{
const md = toMarkdown([{ sequence: 1, content: '测试', shotType: 'wide', camera: 'fixed', duration: 3 }])
    expect(md).toContain('分镜脚本')
}
{
const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          content: '街灯亮起',
          emotion: 'calm',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5,
            dialogue: '今晚很安静',
            soundEffects: '雨声'
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          duration: 5,
          relationType: 'continuation',
          relationLabel: '前后镜',
          imageReferences: [{
            id: 'img-1',
            assetId: 'asset-img-1',
            source: 'asset',
            title: '街灯参考',
            width: 1024,
            height: 768
          }]
        }
      ]
    })

    const csv = toPremiereCSV(shots)
    const md = toMarkdown(shots)
    const jianying = toJianyingDraft(shots)
    const fcpxml = toFCPXML(shots)

    expect(shots[0].sound).toBe('雨声')
    expect(shots[0].assetId).toBe('asset-1')
    expect(shots[0].relationLabel).toBe('前后镜')
    expect(shots[0].imageReferences[0]).toMatchObject({ id: 'img-1', assetId: 'asset-img-1', source: 'asset' })
    expect(csv).toContain('序号,素材ID,关系,景别,运镜,时长(秒),画面描述,台词,音效,参考图')
    expect(csv).toContain('街灯亮起')
    expect(csv).toContain('雨声')
    expect(csv).toContain('街灯参考@asset 1024x768')
    expect(md).toContain('| 素材 | asset-1 |')
    expect(md).toContain('| 承接 | 前后镜 |')
    expect(md).toContain('| 参考图 | 街灯参考@asset 1024x768 |')
    expect(jianying.tracks.videoTracks[0].clips[0]).toMatchObject({
      assetId: 'asset-1',
      relation: { type: 'continuation', label: '前后镜' }
    })
    expect(jianying.tracks.videoTracks[0].clips[0].referenceImages[0].assetId).toBe('asset-img-1')
    expect(fcpxml).toContain('<asset_id>asset-1</asset_id>')
    expect(fcpxml).toContain('<relation_label>前后镜</relation_label>')
}
{
const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          assetId: 'asset-1',
          content: '街灯亮起',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          relationType: 'continuation',
          relationLabel: '前后镜'
        }
      ]
    })

    const pkg = buildEditingPackage(shots, {
      topic: '雨夜街道',
      storyboardDocumentId: 'doc-1',
      storyboardVersionId: 'ver-1',
      exportedAt: '2026-05-28T00:00:00.000Z'
    })

    expect(pkg.schemaVersion).toBe(2)
    expect(pkg.manifest).toMatchObject({
      packageType: 'storyboard-editing-package',
      topic: '雨夜街道',
      shotCount: 1,
      durationSeconds: 5
    })
    expect(pkg.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'storyboard.md',
      'premiere.csv',
      'jianying-draft.json',
      'timeline.fcpxml',
      'metadata.json'
    ])
    expect(pkg.formats.markdown).toContain('雨夜街道')
    expect(pkg.formats.premiereCsv).toContain('asset-1')
    expect(pkg.formats.metadata.storyboardVersionId).toBe('ver-1')
    expect(JSON.parse(pkg.files.find((file) => file.path === 'metadata.json').content).shots[0].relationLabel).toBe('前后镜')

    const zip = buildEditingPackageZip(pkg)
    const zipText = new TextDecoder().decode(zip)
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(zipText).toContain('manifest.json')
    expect(zipText).toContain('storyboard.md')
    expect(zipText).toContain('timeline.fcpxml')
    expect(zipText).toContain('metadata.json')
}
})

  it('extracts shots from narrative assets and chapter outline blocks', () => {
    const assetShots = extractShotsFromNarrativeAssets({
      sourceLabel: '体验会话',
      assets: [
        {
          id: 'asset-1',
          kind: 'event',
          title: '雾港冲突',
          content: '主角在雾港发现旧案线索。'
        },
        {
          id: 'asset-2',
          kind: 'character-fact',
          title: '林舟的顾虑',
          content: '林舟不信任守卫。'
        }
      ]
    })

    const chapterShots = extractShotsFromChapter({
      chapterTitle: '第一章',
      outlineItems: [
        {
          id: 'outline-1',
          assetKind: 'draft-prose',
          title: '开场',
          content: '夜色压下来，街灯一盏盏亮起。'
        }
      ]
    })

    expect(assetShots).toHaveLength(2)
    expect(assetShots[0].notes).toContain('体验会话')
    expect(assetShots[0].shotType).toBe('wide')
    expect(chapterShots).toHaveLength(1)
    expect(chapterShots[0].notes).toContain('第一章')
    expect(chapterShots[0].content).toBe('开场')
  })
})

describe('Settings agent dispatcher integration', () => {
  it('routes canonical settings tasks through the shared engine and returns review drafts', async () => {
    const { createSettingsPageDispatcher } = await import('../services/agents/settings/settingsTaskDispatcher')
    const { createSettingsGenerationWorkflow } = await import('../services/agents/settings/settingsGenerationWorkflow')
    const dispatcher = createSettingsPageDispatcher({
      adapters: {
        settingsGeneration: createSettingsGenerationWorkflow({
          generateField: vi.fn(async () => ({ ok: true, content: '港城终年潮湿' })),
          generateSection: vi.fn(async () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
          })
        })
      }
    })
    const result = await dispatcher.dispatch('settings.field.complete', {
      project: { id: 'wb-1', revision: 'wb-r2' },
      target: { type: 'setting-field', id: 'world.geography', revision: 'r3' },
      intent: { sectionKey: 'world', fieldKey: 'geography' }
    }, { signal: null })
    expect(result.status).toBe('completed')
    expect(result.actions[0]).toMatchObject({ type: 'setting-draft', baseRevision: 'r3' })
    expect(result.actions[0].payload.ok).toBe(true)

    const abortedController = new AbortController()
    abortedController.abort()
    const aborted = await dispatcher.dispatch('settings.section.complete', {
      project: { id: 'wb-1', revision: 'wb-r2' },
      target: { type: 'setting-section', id: 'world', revision: 'r3' },
      intent: {}
    }, { signal: abortedController.signal })
    expect(aborted.status).toBe('failed')
    expect(aborted.error.code).toBe('AGENT_TASK_UNKNOWN'.replace('TASK_UNKNOWN', 'ABORTED'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 世界书地点地图合同（MapDocument v2）— 自 mapModelV2.test.js 并入（P1.5 Task 0，
// 偿还测试文件预算；用例数不减，后续地图合同用例也追加在此宿主）。
// ─────────────────────────────────────────────────────────────────────────────
/**
 * MapDocument v2 / MapBinding v2 / placeIdentity / mapMigration 合同测试。
 * P0 冻结合同的行为基线；含两本书/两世界书身份隔离用例（计划 §9.2）。
 */



import { generateMap } from '../services/world-map/engine/index.ts'
import {
  MAP_FIXTURES,
  TWO_BOOK_IDENTITY_FIXTURE,
  LEGACY_MAP_CONFIG_JSON_SAMPLE,
} from '../services/world-map/testing/fixtures.ts'
import {
  validateMapDocumentV2,
  emptyFeatureCollections,
} from '../services/world-map/model/mapDocumentV2.ts'
import { COLLECTION_BY_FEATURE_TYPE } from '../services/world-map/model/mapFeature.ts'
import {
  formatLegacyPlaceId,
  parseLegacyPlaceId,
  samePlaceIdentity,
  identitySurvivesRemap,
} from '../services/world-map/model/placeIdentity.ts'
import {
  parseLegacyMapConfig,
  projectLegacyToMapDocumentV2,
} from '../services/world-map/model/mapMigration.ts'
import { computeConfigHash, assertUniqueFeatureIds } from '../services/world-map/generators/generatorContract.ts'
import { mapWorkspaceTabKey, mockOpenMapIntentDispatcher } from '../services/world-map/integration/mapWorkspaceIntent.ts'

function projectFixture(fixtureId) {
  const data = generateMap({ ...MAP_FIXTURES[fixtureId].config })
  return projectLegacyToMapDocumentV2(data, {
    mapAssetId: `test-${fixtureId}`,
    projectId: 'project-1',
    worldbookId: 'wb-1',
    revision: 1,
    generatorVersion: 'test',
    legacyMarkers: [
      { id: 'mk-1', name: '青岚城', x: 100, y: 100, type: 'capital', importance: 1, worldbookId: 'wb-1' },
    ],
    legacyMapId: 'map-old-1',
  })
}

describe('MapDocumentV2 schema', () => {
  it('校验 legacy 投影、集合归属、唯一 id 与有限坐标', () => {
    const { document } = projectFixture('archipelago')
    const result = validateMapDocumentV2(document)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    const featureCount = Object.values(document.featureCollections).reduce((s, l) => s + l.length, 0)
    expect(featureCount).toBeLessThan(document.baseAsset.width * document.baseAsset.height)
    expect(featureCount).toBeGreaterThan(0)
    // 计划 §3.1：land 集合是聚合陆块，不逐 cell 复制。
    expect(document.featureCollections.land.length).toBeLessThanOrEqual(document.featureCollections.settlements.length + 50)
    // 拒绝重复 feature id 与放错集合的 feature。
    const doc = {
      schemaVersion: 2,
      mapAssetId: 'm', projectId: 'p', worldbookId: 'w', revision: 1, seed: 's',
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      coordinateSystem: { kind: 'fictional-plane', yAxis: 'down', units: 'px' },
      generator: { id: 'pinax-legacy', version: '1', configHash: 'h' },
      baseAsset: { width: 10, height: 10 },
      featureCollections: {
        ...emptyFeatureCollections(),
        land: [
          { mapObjectId: 'dup', geometry: { type: 'point', coordinates: [1, 1] }, properties: { featureId: 'dup', featureType: 'landmass', mapRevision: 1, displayPriority: 1 } },
        ],
        rivers: [
          // 同 id 跨集合重复
          { mapObjectId: 'dup', geometry: { type: 'point', coordinates: [2, 2] }, properties: { featureId: 'dup', featureType: 'river', mapRevision: 1, displayPriority: 1 } },
          // river 放进了 rivers（合法），下面放一个非法归属：landmass 放进 rivers
          { mapObjectId: 'wrong', geometry: { type: 'point', coordinates: [3, 3] }, properties: { featureId: 'wrong', featureType: 'landmass', mapRevision: 1, displayPriority: 1 } },
        ],
      },
      aliases: [], style: { styleId: 'atlas-clean' }, createdAt: 0, updatedAt: 0,
    }
    const invalidResult = validateMapDocumentV2(doc)
    expect(invalidResult.ok).toBe(false)
    expect(invalidResult.duplicateFeatureIds).toContain('dup')
    expect(invalidResult.errors.some((e) => e.message.includes("belongs in 'land'"))).toBe(true)
    // 拒绝非有限坐标与错误 schemaVersion。
    const base = {
      schemaVersion: 2,
      mapAssetId: 'm', projectId: 'p', worldbookId: 'w', revision: 1, seed: 's',
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      coordinateSystem: { kind: 'fictional-plane', yAxis: 'down', units: 'px' },
      generator: { id: 'pinax-legacy', version: '1', configHash: 'h' },
      baseAsset: { width: 10, height: 10 },
      featureCollections: emptyFeatureCollections(),
      aliases: [], style: { styleId: 'atlas-clean' }, createdAt: 0, updatedAt: 0,
    }
    expect(validateMapDocumentV2({ ...base, schemaVersion: 1 }).ok).toBe(false)
    const badCoord = {
      ...base,
      featureCollections: {
        ...emptyFeatureCollections(),
        settlements: [{ mapObjectId: 's1', geometry: { type: 'point', coordinates: [NaN, 1] }, properties: { featureId: 's1', featureType: 'settlement', mapRevision: 1, displayPriority: 1 } }],
      },
    }
    expect(validateMapDocumentV2(badCoord).ok).toBe(false)
    // featureType 与集合的固定归属
    expect(COLLECTION_BY_FEATURE_TYPE['narrative-place']).toBe('narrativePlaces')
  })
})

describe('placeIdentity 三层身份', () => {
  it('兼容 legacy placeId，并保持稳定叙事身份与版本化空间投影分离', () => {
    const id = formatLegacyPlaceId('wb-alpha', 'map-old-1', 'mk-1')
    expect(id).toBe('place:wb-alpha:map-old-1:mk-1')
    expect(parseLegacyPlaceId(id)).toEqual({ worldbookId: 'wb-alpha', mapId: 'map-old-1', siteId: 'mk-1' })
    expect(parseLegacyPlaceId('not-a-place-id')).toBeNull()
    expect(parseLegacyPlaceId('place:wb::site')).toBeNull()
    // 身份比较不含地图版本；remap 允许换 mapObjectId 但不许换 mapAssetId。
    const a = { worldbookId: 'wb-1', worldbookEntryId: 'e1' }
    expect(samePlaceIdentity(a, { worldbookId: 'wb-1', worldbookEntryId: 'e1' })).toBe(true)
    expect(samePlaceIdentity(a, { worldbookId: 'wb-2', worldbookEntryId: 'e1' })).toBe(false)
    const before = { identity: a, object: { mapAssetId: 'm1', mapRevision: 3, mapObjectId: 'settlement:5' } }
    // 合法 remap：同 asset，换 revision + 换 mapObjectId
    expect(identitySurvivesRemap(before, { mapAssetId: 'm1', mapRevision: 4, mapObjectId: 'settlement:9' })).toBe(true)
    // 非法：换了 mapAssetId（等于换了一张地图）
    expect(identitySurvivesRemap(before, { mapAssetId: 'm2', mapRevision: 4, mapObjectId: 'settlement:9' })).toBe(false)
    // 非法：revision 没变（不是 remap）
    expect(identitySurvivesRemap(before, { mapAssetId: 'm1', mapRevision: 3, mapObjectId: 'settlement:9' })).toBe(false)
  })
})

describe('legacy mapConfigJSON 迁移', () => {
  it('解析各代配置并投影 legacy alias 与 narrative-place candidate', () => {
    const parsed = parseLegacyMapConfig(LEGACY_MAP_CONFIG_JSON_SAMPLE)
    expect(parsed.issues).toEqual([])
    expect(parsed.recipe).toEqual(expect.objectContaining({ seed: 'legacy-seed-777' }))
    expect(parsed.legacyMarkers).toHaveLength(2)
    expect(parsed.legacyMarkers[0]).toMatchObject({ worldbookEntryId: 'ent-a1', bindingStatus: 'confirmed' })
    expect(parsed.activeLegacyRevisionId).toBe('rev-1')
    // 空/非法/最老格式都有可解释 issues，不静默丢失。
    expect(parseLegacyMapConfig(null).issues).toHaveLength(1)
    const broken = parseLegacyMapConfig('{not json')
    expect(broken.recipe).toBeNull()
    expect(broken.issues[0]).toContain('not valid JSON')
    const oldest = parseLegacyMapConfig('{"seed":"x","pointCount":5000}')
    expect(oldest.recipe).toEqual({ seed: 'x', pointCount: 5000 })
    expect(oldest.legacyMarkers).toEqual([])
    expect(oldest.issues[0]).toContain('pre-bucket')
    // 投影建立 legacy placeId alias 与 narrative-place candidate。
    const legacy = parseLegacyMapConfig(LEGACY_MAP_CONFIG_JSON_SAMPLE)
    const data = generateMap({ ...MAP_FIXTURES.archipelago.config })
    const { document, aliases } = projectLegacyToMapDocumentV2(data, {
      mapAssetId: 'map-asset-alpha',
      projectId: 'book-alpha',
      worldbookId: 'wb-alpha',
      revision: 7,
      generatorVersion: 'legacy-round2',
      legacyMapId: 'map-old-1',
      legacyMarkers: legacy.legacyMarkers,
    })
    // confirmed marker → narrative-place feature
    expect(document.featureCollections.narrativePlaces).toHaveLength(2)
    const qinglan = document.featureCollections.narrativePlaces.find((f) => f.properties.label === '青岚城')
    expect(qinglan.properties.bindingStatus).toBe('confirmed')
    // userAdded 无 worldbook → unbound
    const ferry = document.featureCollections.narrativePlaces.find((f) => f.properties.label === '沉沙渡')
    expect(ferry.properties.bindingStatus).toBe('unbound')
    // legacy placeId alias 只对有 worldbookId 的 marker 生成
    expect(aliases.some((a) => a.legacyKey === 'place:wb-alpha:map-old-1:mk-1' && a.kind === 'legacy-place-id')).toBe(true)
    expect(aliases.every((a) => a.legacyKey !== 'place:wb-alpha:map-old-1:mk-2')).toBe(true)
  })
})

describe('两本书 / 两个世界书身份隔离', () => {
  it('保持 tab、地点身份与 mock intent 在书间隔离且零写入', async () => {
    const { bookA, bookB, mapAssetA, mapAssetB } = TWO_BOOK_IDENTITY_FIXTURE
    expect(mapWorkspaceTabKey(bookA.bookId)).toBe('project:book-alpha:map')
    expect(mapWorkspaceTabKey(bookB.bookId)).not.toBe(mapWorkspaceTabKey(bookA.bookId))
    const idA = { worldbookId: bookA.worldbookId, worldbookEntryId: bookA.entries[0] }
    const idB = { worldbookId: bookB.worldbookId, worldbookEntryId: bookB.entries[0] }
    expect(samePlaceIdentity(idA, idB)).toBe(false)
    // 同名 entry id 在不同世界书下不是同一地点
    expect(samePlaceIdentity(idA, { worldbookId: bookB.worldbookId, worldbookEntryId: bookA.entries[0] })).toBe(false)
    expect(mapAssetA).not.toBe(mapAssetB)
    // mock intent 消费方不写任何真源。
    const result = await mockOpenMapIntentDispatcher({
      projectId: 'book-alpha',
      bookId: 'book-alpha',
      worldbookId: 'wb-alpha',
      worldbookEntryId: 'ent-a1',
      mode: 'place',
      returnTo: { chapterId: 'ch-1', writingUnitId: 'unit-1', documentRevision: 3 },
    })
    expect(result.kind).toBe('cancelled')
    expect(result.wroteNothing).toBe(true)
    expect(result.bindingReceipt).toBeUndefined()
  })
})

describe('generatorContract', () => {
  it('生成稳定 configHash，并在输出前拒绝重复 id', () => {
    expect(computeConfigHash({ a: 1, b: 2 })).toBe(computeConfigHash({ b: 2, a: 1 }))
    expect(computeConfigHash({ a: 1 })).not.toBe(computeConfigHash({ a: 2 }))
    // 生成器输出重复 id 立即抛错（输出前门禁）。
    const f = { mapObjectId: 'x', geometry: { type: 'point', coordinates: [0, 0] }, properties: { featureId: 'x', featureType: 'river', mapRevision: 1, displayPriority: 1 } }
    expect(() => assertUniqueFeatureIds([f])).not.toThrow()
    expect(() => assertUniqueFeatureIds([f, { ...f }])).toThrow(/duplicate mapObjectId/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// P1.5 Task B：地点语义合同 kind/scope/parentFeatureId（测试先行）
// ─────────────────────────────────────────────────────────────────────────────

describe('P1.5 地点语义合同：kind / scope / parentFeatureId', () => {

  function semDoc(features) {
    return {
      schemaVersion: 2,
      mapAssetId: 'm', projectId: 'p', worldbookId: 'w', revision: 1, seed: 's',
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      coordinateSystem: { kind: 'fictional-plane', yAxis: 'down', units: 'px' },
      generator: { id: 'pinax-legacy', version: '1', configHash: 'h' },
      baseAsset: { width: 100, height: 100 },
      featureCollections: {
        land: [], water: [], regions: [], rivers: [], routes: [], settlements: [], narrativePlaces: [],
        ...features,
      },
      aliases: [], style: { styleId: 'atlas-clean' }, createdAt: 0, updatedAt: 0,
    }
  }
  const point = (id, extra = {}) => ({
    mapObjectId: id,
    geometry: { type: 'point', coordinates: [10, 10] },
    properties: { featureId: id, featureType: 'settlement', mapRevision: 1, displayPriority: 1, ...extra },
  })

  it('校验 kind/scope 的合法与非法枚举', () => {
    const doc = semDoc({ settlements: [point('s1', { kind: 'capital', scope: 'region' })] })
    expect(validateV2(doc).ok).toBe(true)
    // 非法 kind / scope 被拒绝。
    const bad = semDoc({ settlements: [point('s1', { kind: 'megacity', scope: 'region' })] })
    expect(validateV2(bad).ok).toBe(false)
    const badScope = semDoc({ settlements: [point('s1', { kind: 'city', scope: 'galaxy' })] })
    expect(validateV2(badScope).ok).toBe(false)
  })

  it('校验父子层级、环、保守语义派生与迁移投影', () => {
    const doc = semDoc({
      settlements: [
        point('s1', { kind: 'village', scope: 'local', parentFeatureId: 'r1' }),
        point('r1', { kind: 'city', scope: 'region' }),
      ],
    })
    expect(validateV2(doc).ok).toBe(true)
    const missing = semDoc({ settlements: [point('s1', { parentFeatureId: 'ghost' })] })
    expect(validateV2(missing).ok).toBe(false)
    const selfRef = semDoc({ settlements: [point('s1', { parentFeatureId: 's1' })] })
    expect(validateV2(selfRef).ok).toBe(false)
    // 父子 scope 违反粗细顺序（子比父更粗）被拒绝且拒绝环。
    // scope 粗细顺序 world > region > local > site；子 scope 必须不粗于父
    const inverted = semDoc({
      settlements: [
        point('s1', { kind: 'village', scope: 'world', parentFeatureId: 'r1' }),
        point('r1', { kind: 'city', scope: 'region' }),
      ],
    })
    expect(validateV2(inverted).ok).toBe(false)
    const cycle = semDoc({
      settlements: [
        point('a', { scope: 'local', parentFeatureId: 'b' }),
        point('b', { scope: 'local', parentFeatureId: 'a' }),
      ],
    })
    expect(validateV2(cycle).ok).toBe(false)
    // legacy 保守派生：capital/port/人口证据决定 kind 与 scope。
    const capital = deriveSettlementSemantics({ capital: true, port: false, population: 9000 }, [{ population: 9000 }, { population: 100 }, { population: 50 }])
    expect(capital).toEqual({ kind: 'capital', scope: 'region' })
    const city = deriveSettlementSemantics({ capital: false, port: false, population: 8000 }, [{ population: 9000 }, { population: 100 }, { population: 50 }])
    expect(city).toEqual({ kind: 'city', scope: 'region' })
    const portTown = deriveSettlementSemantics({ capital: false, port: true, population: 90 }, [{ population: 9000 }, { population: 100 }, { population: 50 }])
    expect(portTown).toEqual({ kind: 'town', scope: 'local' })
    const village = deriveSettlementSemantics({ capital: false, port: false, population: 60 }, [{ population: 9000 }, { population: 100 }, { population: 50 }])
    expect(village).toEqual({ kind: 'village', scope: 'local' })
    // 迁移投影写入派生语义且 capital 优先于人口规则。
    const project = projectSem
    const generateMap = generateMapSem
    const MAP_FIXTURES = MAP_FIXTURES_SEM
    const data = generateMap({ ...MAP_FIXTURES.archipelago.config })
    const { document } = project(data, {
      mapAssetId: 'sem', projectId: 'p', worldbookId: 'w', revision: 1,
      generatorVersion: 'test', legacyMarkers: [],
    })
    const settlements = document.featureCollections.settlements
    expect(settlements.length).toBeGreaterThan(0)
    for (const f of settlements) {
      expect(['capital', 'city', 'town', 'village']).toContain(f.properties.kind)
      expect(['region', 'local']).toContain(f.properties.scope)
    }
    // 有 capital 的地图必须至少派生出一个 capital
    expect(settlements.some((f) => f.properties.kind === 'capital')).toBe(true)
    // 校验器接受派生结果
    expect(validateV2(document).ok).toBe(true)
  })
})

import { validateMapDocumentV2 as validateV2 } from '../services/world-map/model/mapDocumentV2.ts'
import { deriveSettlementSemantics, projectLegacyToMapDocumentV2 as projectSem } from '../services/world-map/model/mapMigration.ts'
import { generateMap as generateMapSem } from '../services/world-map/engine/index.ts'
import { MAP_FIXTURES as MAP_FIXTURES_SEM } from '../services/world-map/testing/fixtures.ts'

// ─────────────────────────────────────────────────────────────────────────────
// P1.5 Task C：author-semantic fixture 结构合同
// ─────────────────────────────────────────────────────────────────────────────

describe('P1.5 author-semantic fixture', () => {
  const {
    AUTHOR_SEMANTIC_FIXTURE,
    validateAuthorSemanticFixture,
  } = require_ts_fixture()

  function require_ts_fixture() {
    return {
      AUTHOR_SEMANTIC_FIXTURE: authorSemanticFixtureRef.AUTHOR_SEMANTIC_FIXTURE,
      validateAuthorSemanticFixture: authorSemanticFixtureRef.validateAuthorSemanticFixture,
    }
  }

  it('固定 fixture 合法、数量受控并覆盖同名/冲突/上下文配额', () => {
    const result = validateAuthorSemanticFixture()
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    // 数量符合计划：国家 2-4、首都/主城 3-6、聚落 20-40、世界书地点 12-24。
    const doc = AUTHOR_SEMANTIC_FIXTURE.document
    expect(doc.featureCollections.regions.length).toBeGreaterThanOrEqual(2)
    expect(doc.featureCollections.regions.length).toBeLessThanOrEqual(4)
    const all = [
      ...doc.featureCollections.settlements,
      ...doc.featureCollections.narrativePlaces,
    ]
    const capitals = all.filter((f) => f.properties.kind === 'capital')
    const cities = all.filter((f) => f.properties.kind === 'city')
    expect(capitals.length + cities.length).toBeGreaterThanOrEqual(3)
    expect(capitals.length + cities.length).toBeLessThanOrEqual(6)
    expect(doc.featureCollections.settlements.length).toBeGreaterThanOrEqual(20)
    expect(doc.featureCollections.settlements.length).toBeLessThanOrEqual(40)
    expect(AUTHOR_SEMANTIC_FIXTURE.worldbookPlaces.length).toBeGreaterThanOrEqual(12)
    expect(AUTHOR_SEMANTIC_FIXTURE.worldbookPlaces.length).toBeLessThanOrEqual(24)
    // 覆盖同名、未落图、冲突、stale 与上下文配额。
    const fx = AUTHOR_SEMANTIC_FIXTURE
    const names = fx.document.featureCollections.narrativePlaces.map((f) => f.properties.label)
    expect(names.filter((n) => n === '听雨轩').length).toBe(2) // 同名
    expect(fx.worldbookPlaces.filter((p) => p.status === 'unplaced').length).toBe(2)
    expect(fx.worldbookPlaces.filter((p) => p.status === 'conflict').length).toBe(1)
    expect(fx.worldbookPlaces.filter((p) => p.status === 'stale').length).toBe(1)
    const reasons = fx.contextSignals.map((s) => s.reason)
    expect(reasons.filter((r) => r === 'current-scene').length).toBe(1)
    expect(reasons.filter((r) => r === 'current-unit').length).toBeGreaterThanOrEqual(2)
    expect(reasons.filter((r) => r === 'chapter-reference').length).toBeGreaterThanOrEqual(4)
    expect(reasons.filter((r) => r === 'chapter-reference').length).toBeLessThanOrEqual(8)
    // 未落图地点不产生空间 feature
    for (const p of fx.worldbookPlaces.filter((p) => p.status === 'unplaced')) {
      expect(p.mapObjectId).toBeUndefined()
    }
  })
})

import * as authorSemanticFixtureRef from '../services/world-map/testing/fixtures.ts'
