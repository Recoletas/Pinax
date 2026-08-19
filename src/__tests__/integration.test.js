/**
 * 核心服务集成测试（精简版）
 */

import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { UniqueID } from '@tiptap/extension-unique-id'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicAdaptationPlanner from '../components/media/ComicAdaptationPlanner.vue'
import ComicCompositionCanvas from '../components/media/ComicCompositionCanvas.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
import ComicStageWorkbench from '../components/media/ComicStageWorkbench.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import ContourField from '../components/workbench/ContourField.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import NarrativeTurn from '../components/experience/NarrativeTurn.vue'
import {
  buildSystemPrompt,
  buildPromptSequence,
  buildNarrativeConstraints
} from '../services/promptBuilder'
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
} from '../services/shotExporter'
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
import { buildNarrativeVoiceContract } from '../services/agents/narrativeVoicePolicy'
import {
  resolveWritingCommandMenuPosition
} from '../services/writing/liveMarkdownPreview.js'
import {
  editorContentToWritingDocument,
  createWritingDocument,
  getWritingNodeLocation,
  getWritingDocumentMarkdown,
  getWritingMarkdownPosition,
  migrateWritingDocumentToV3,
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
  saveWritingSnapshot
} from '../services/writing/writingSnapshots.js'
import {
  listWritingRecoveryDrafts,
  saveWritingRecoveryDraft
} from '../services/writing/writingRecovery.js'
import { normalizeWritingReviewFindings } from '../../shared/writingReviewContract.js'
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
    expect(mergeEditor.commands.mergeWritingUnit('previous')).toBe(true)
    expect(mergeEditor.getJSON().content).toHaveLength(1)
    expect(mergeEditor.getJSON().content[0].attrs.unitId).toBe(leftUnitId)
    expect(unitTransition).toMatchObject({ type: 'merge', keptUnitId: leftUnitId, removedUnitId: rightUnitId })
    expect(mergeEditor.commands.undo()).toBe(true)
    expect(mergeEditor.getJSON().content).toHaveLength(2)
    mergeEditor.commands.setTextSelection(mergeEditor.state.doc.child(0).nodeSize + 2)
    expect(mergeEditor.commands.moveWritingUnit('up')).toBe(true)
    mergeEditor.getJSON().content.forEach((unit) => {
      unit.content.forEach((node) => {
        expect(unitTransition.nodeUnitMap[node.attrs.nodeId]).toBe(unit.attrs.unitId)
      })
    })
    expect(mergeEditor.commands.undo()).toBe(true)
    mergeEditor.destroy()

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
    const makeSplitAnnotation = (id, start, end) => ({
      ...createWritingAnnotation({
        chapterId: 'chapter-1',
        target: {
          unitId: splitSourceUnit.attrs.unitId,
          nodeId: splitSourceNode.attrs.nodeId,
          start,
          end
        },
        selector: createWritingSelector({
          text: '左左右右'.slice(start, end),
          start,
          end,
          fullText: '左左右右'
        }),
        body: id
      }),
      id
    })
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
      target: { unitId: splitSourceUnit.attrs.unitId, nodeId: splitSourceNode.attrs.nodeId, start: 0, end: 2 }
    })
    expect(splitAnnotations.find((item) => item.id === 'split-right')).toMatchObject({
      status: 'open',
      target: { unitId: 'unit-split-right', nodeId: 'node-split-right', start: 0, end: 2 }
    })
    expect(splitAnnotations.find((item) => item.id === 'split-crossing')).toMatchObject({
      status: 'orphaned', resolution: 'split-boundary'
    })

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
    localStorage.removeItem(STORAGE_KEYS.WRITING_SNAPSHOTS)
    localStorage.removeItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS)

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
  it('parses markers into clean text and falls back without losing legacy content', () => {
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
  })

  it('normalizes complete dialogue wrappers and splits a long monologue without losing its speaker', () => {
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
  })

  it('splits an overlong comma-only narration without changing its text', () => {
    const text = '风从门缝里钻进来，吹得灯焰不断偏向墙角，沈砚按住桌上的信纸，没有回答林岫的问题，只抬眼听着台阶外越来越近的脚步，门环轻轻撞上木板，屋里所有人的呼吸都停了一瞬，窗外的雨点越来越密，檐下积水一线线落下来，守在后门的人悄悄换了位置，长廊尽头又亮起一盏灯，映出墙边一道陌生的影子，谁也没有先开口，仿佛只要继续沉默，那封信就不会变成已经发生的事实'
    const parsed = parseNarrativePresentation(`:::narration\n${text}`, {
      messageId: 'comma-density-contract'
    })
    expect(parsed.blocks.length).toBeGreaterThan(1)
    expect(parsed.blocks.map((block) => block.text).join('')).toBe(text)
  })

  it('selectively refreshes a current presentation that still uses corner dialogue quotes', () => {
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
  })

  it('keeps stable ids and one prompt format contract', () => {
    expect(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
      .toBe(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
    expect(buildNarrativeFormatInstructions()).toContain(':::dialogue|角色名')
    // P3：五条行文契约收敛 + 自然段空行要求
    expect(buildNarrativeVoiceContract()).toContain('先回应玩家输入，再推进一个已有因果')
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

    const image = await generateImage(config, {
      prompt: '雨夜 "街角"',
      negativePrompt: '模糊',
      width: 1280,
      height: 720,
      count: 1,
      referenceImages: [{ id: 'ref-1', data: 'data:image/png;base64,YWJj' }],
      referenceStrength: 0.7,
      fetchImpl
    })
    const request = fetchImpl.mock.calls[0]
    const body = JSON.parse(request[1].body)

    expect(request[0]).toBe('https://images.example/generate')
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
  it('extracts shots from relation canvas tree nodes', () => {
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
  })

  it('exports to markdown', () => {
    const md = toMarkdown([{ sequence: 1, content: '测试', shotType: 'wide', camera: 'fixed', duration: 3 }])
    expect(md).toContain('分镜脚本')
  })

  it('maps prose essay director fields into shared shots and premiere csv', () => {
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
  })

  it('builds a stable editing package manifest and file list', () => {
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
