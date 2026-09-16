import { nextTick } from 'vue'
import { normalizeAuthoringFailure } from '../services/agents/authoring/authoringExecutionResult.js'
import { validateWritingGhostCandidate } from '../services/agents/authoring/writingGhostCandidate.js'
import { prepareWritingAdoptionDeltas } from '../services/agents/authoring/writingAdoptionTransaction.js'
import { collectAuthoringSceneRunIntentEffects } from '../services/agents/authoring/authoringSceneRunIntents.js'
import { createAdoptionImpactProjection } from '../services/agents/authoring/authoringAdoptionImpactProjection.js'

function fail(composer, details) {
  composer.failure = normalizeAuthoringFailure(details)
  return false
}

export function useAuthoringGhostAdoptionWorkflow(host) {
  async function perform() {
    const preview = host.preview.value
    if (!preview) return false
    if (host.rehearsalDraftSource.value?.candidateId === preview.candidateId
      && !host.rehearsalDraftSourceIsCurrent(host.rehearsalDraftSource.value)) {
      return fail(host.composer, {
        phase: 'stale', code: 'AUTHORING_REHEARSAL_SOURCE_STALE',
        message: '这份试稿对应的走法已经变化，请回到推演重新生成', retryable: false
      })
    }

    let adoption = host.pendingAdoption.value
    const adoptedText = adoption?.adoptedText || String(host.draftText.value || '').trim()
    if (!adoptedText) {
      return fail(host.composer, {
        phase: 'adoption', code: 'AUTHORING_DRAFT_EMPTY',
        message: '推演草稿为空，请保留正文后再采用', retryable: true
      })
    }

    if (!adoption) {
      const candidate = preview.candidate
      if (!['narrative', 'rewrite'].includes(candidate?.mode) || candidate.id !== preview.candidateId) {
        host.composer.staleResult = { text: adoptedText, target: candidate?.target || null, reason: 'candidate-replaced' }
        return false
      }
      const liveDependencyRevisions = candidate.runSession
        ? await host.collectLiveDependencies(candidate.runSession)
        : host.buildLiveDependencyRevisions()
      const validation = validateWritingGhostCandidate(candidate, {
        target: host.currentGhostTarget({
          unitId: preview.afterUnitId,
          nodeId: preview.afterNodeId,
          unitRevision: preview.expectedUnitRevision,
          nodeRevision: preview.expectedNodeRevision
        }),
        liveDependencyRevisions
      })
      if (!validation.ok) {
        host.composer.staleResult = { text: adoptedText, target: candidate.target, reason: validation.reason }
        return false
      }

      host.cancelPendingSaves()
      if (candidate.target.role !== 'exploration') {
        if (!host.persistProtectionBase()) {
          return fail(host.composer, {
            phase: 'adoption', code: 'AUTHORING_PROTECTION_PERSIST_FAILED',
            message: '无法保存采纳前版本，本次正文没有写入', retryable: true
          })
        }
        const protection = host.recordProtection({
          reason: 'before-adoption', operation: preview.operation, transactionId: candidate.id
        })
        if (!protection.ok) {
          return fail(host.composer, {
            phase: 'adoption', code: 'AUTHORING_PROTECTION_SNAPSHOT_FAILED',
            message: '采纳前版本保存失败，本次正文没有写入', retryable: true
          })
        }
        host.refreshSnapshots()
      }

      const beforeBodyRevision = host.currentBodyRevision()
      const beatDraft = preview.operation === 'rewrite-unit' ? null : host.readSceneBeatDraft()
      const proposedUnits = beatDraft?.units?.length
        ? beatDraft.units.map((unit) => ({ draftUnitId: unit.id, text: unit.text }))
        : [{ draftUnitId: preview.candidateId, text: adoptedText }]
      if (proposedUnits.some((unit) => !String(unit.text || '').trim())) {
        return fail(host.composer, {
          phase: 'adoption', code: 'AUTHORING_DRAFT_UNIT_EMPTY',
          message: '分段草稿中有空单元，请调整边界后再采用', retryable: true
        })
      }

      const editorResult = host.applyToEditor({ preview, candidate, adoptedText, beatDraft, proposedUnits })
      if (!editorResult?.ok) {
        return fail(host.composer, {
          reason: editorResult?.reason || 'editor-write', message: editorResult?.message || '生成失败'
        })
      }
      const draftChanged = adoptedText !== String(host.originalText.value || '').trim()
      const adoptionCandidate = candidate.target.role === 'exploration' || draftChanged || preview.operation === 'rewrite-unit'
        ? { ...candidate, sceneDelta: null, outlineDelta: null }
        : candidate
      const sceneIntentEffects = candidate.target.role === 'exploration' || preview.operation === 'rewrite-unit'
        ? collectAuthoringSceneRunIntentEffects([])
        : collectAuthoringSceneRunIntentEffects(candidate.runSession, {
            receipts: [preview.contextReceipt, ...candidate.contextCallReceipts].filter(Boolean)
          })
      const project = host.readProjectState()
      const deltas = prepareWritingAdoptionDeltas({
        candidate: adoptionCandidate,
        insertedUnitId: editorResult.unitId,
        insertedUnitIds: editorResult.unitIds || [editorResult.unitId],
        worldbookId: project.worldbookId,
        sceneAnchors: project.sceneAnchors,
        outlineNodes: project.outlineNodes,
        outlineEdges: project.outlineEdges,
        commitPlannedEntrances: false,
        sceneIntentEffects
      })
      if (!deltas.ok) {
        host.rollbackEditorWrite()
        return fail(host.composer, {
          phase: 'adoption', code: 'AUTHORING_DELTA_INVALID',
          message: '现场或大纲变更已失效，请重新生成', retryable: true
        })
      }

      host.invalidatePreviousReceipts()
      host.applyProjectDeltas(deltas)
      adoption = Object.freeze({
        candidateId: candidate.id,
        insertedUnitId: editorResult.unitId,
        insertedUnitIds: Object.freeze(editorResult.unitIds || [editorResult.unitId]),
        editorResult: Object.freeze({
          unitId: editorResult.unitId,
          unitIds: Object.freeze(editorResult.unitIds || [editorResult.unitId]),
          focus: editorResult.focus || null
        }),
        sceneBeatDraft: beatDraft || null,
        operation: preview.operation,
        observationSourceRef: `ghost-adoption:${candidate.id}`,
        beforeUnitSnapshot: editorResult.beforeUnit || null,
        afterUnitSnapshot: preview.operation === 'rewrite-unit' ? host.readInsertedUnit(editorResult.unitId) : null,
        receipt: deltas.receipt,
        documentRole: candidate.target.role,
        adoptedText,
        sourceRefs: Object.freeze([...new Set([
          ...host.composerSourceRefs.value,
          ...sceneIntentEffects.sourceRefs,
          `ghost-adoption:${candidate.id}`,
          ...(editorResult.unitIds || [editorResult.unitId]).map((unitId) => `unit:${unitId}`)
        ])]),
        beforeDocumentRevision: candidate.target.documentRevision,
        afterDocumentRevision: host.currentDocumentRevision(),
        beforeBodyRevision,
        afterBodyRevision: host.currentBodyRevision(),
        semanticDeltasDropped: draftChanged && Boolean(candidate.sceneDelta || candidate.outlineDelta)
      })
      host.pendingAdoption.value = adoption
      host.cancelContentSave()
    }

    const exploration = adoption.documentRole === 'exploration'
    if (!host.persistAdoption(exploration)) {
      return fail(host.composer, {
        phase: 'persist', code: 'AUTHORING_PERSIST_FAILED',
        message: 'Ghost 事务已保留；重试只会再次保存，不会重新生成或重复插入', retryable: true
      })
    }
    if (!exploration) {
      try {
        await host.observeAdoption(adoption)
      } catch {
        host.reportObserverFailure()
      }
    }

    const shouldFenceRewrite = adoption.operation === 'rewrite-unit'
    const otherIfBranch = host.consumeCharacterIfBranch()
    host.captureRehearsalAdoption?.({
      adoption,
      committedReceipt,
      draftSource: host.rehearsalDraftSource.value
    })
    host.clearAdoptedDraft()
    const committedReceipt = Object.freeze({
      ...adoption.receipt,
      adoptedText: adoption.adoptedText,
      sourceRefs: adoption.sourceRefs,
      operation: adoption.operation,
      observationSourceRef: adoption.observationSourceRef,
      beforeUnitSnapshot: adoption.beforeUnitSnapshot,
      afterUnitSnapshot: adoption.afterUnitSnapshot,
      beforeDocumentRevision: adoption.beforeDocumentRevision,
      afterDocumentRevision: adoption.afterDocumentRevision,
      beforeBodyRevision: adoption.beforeBodyRevision,
      afterBodyRevision: adoption.afterBodyRevision
    })
    host.commitUndoReceipt(committedReceipt)
    if (shouldFenceRewrite) {
      await nextTick()
      host.fenceEditorHistory()
      await nextTick()
    }
    host.finishComposer()
    host.showImpact(
      createAdoptionImpactProjection({ editorResult: adoption.editorResult, receipt: committedReceipt }),
      adoption.editorResult?.focus || { unitId: adoption.insertedUnitIds?.at(-1) || adoption.insertedUnitId }
    )
    host.notifySuccess({ adoption, exploration })
    if (otherIfBranch) nextTick(() => host.restoreOtherIfBranch(otherIfBranch))
    return true
  }

  return { perform }
}
