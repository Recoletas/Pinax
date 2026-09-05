// 文本工作台 v3 Phase 10：Ghost 采纳的可逆 delta 事务。
// 正文插入由编辑器负责；本模块只准备 scene/outline 的同批内存变更与撤销回执，
// 页面随后通过一次书级持久化提交全部状态。

import {
  fingerprintSceneAnchors,
  MAX_AUTHORING_PRESENT_CHARACTERS,
  normalizeSceneAnchors,
  normalizeSceneAnchor
} from './authoringSceneAnchors.js'
import { fingerprintOutline, normalizeOutlineNodes } from '../../writing/projectOutlineRepository.js'

function text(value) { return String(value ?? '').trim() }

function list(value) { return Array.isArray(value) ? value : [] }

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))]
}

function normalizeSceneIntentEffects(effects = {}) {
  const source = effects && typeof effects === 'object' ? effects : {}
  return Object.freeze({
    characterIds: Object.freeze(unique(source.characterIds)),
    locationId: text(source.locationId),
    intentIds: Object.freeze(unique(source.intentIds)),
    sourceRefs: Object.freeze(unique(source.sourceRefs))
  })
}

function adoptionSceneDelta(candidate, effects) {
  const generated = candidate?.sceneDelta && typeof candidate.sceneDelta === 'object'
    ? candidate.sceneDelta
    : null
  if (!effects.characterIds.length && !effects.locationId) return generated
  const projection = candidate?.runSession?.sceneProjection || {}
  const basePresentIds = Array.isArray(generated?.presentCharacterIds)
    ? generated.presentCharacterIds
    : list(projection.presentCharacters).map((person) => person?.id)
  return {
    ...generated,
    presentCharacterIds: unique([...basePresentIds, ...effects.characterIds]),
    locationId: effects.locationId || text(generated?.locationId) || text(projection.location?.id),
    viewpointCharacterId: text(generated?.viewpointCharacterId) || text(projection.viewpointCharacter?.id),
    time: generated?.time || (projection.time
      ? { label: text(projection.time.label), period: text(projection.time.period) }
      : undefined),
    source: text(generated?.source) || 'authoring-run-scene-intent'
  }
}

export function prepareWritingAdoptionDeltas({
  candidate, insertedUnitId, insertedUnitIds = [], worldbookId, sceneAnchors = [], outlineNodes = [], outlineEdges = [],
  commitPlannedEntrances = false, sceneIntentEffects = null
} = {}) {
  const unitIds = unique(insertedUnitIds.length ? insertedUnitIds : [insertedUnitId])
  if (!candidate || !unitIds.length) return { ok: false, reason: 'inserted-unit-missing' }
  const previousAnchors = normalizeSceneAnchors(sceneAnchors)
  const previousNodes = normalizeOutlineNodes(outlineNodes)
  // “安排下一段入场”与正文/scene/outline 必须属于同一批内存 delta。
  // 这里只准备数据，不持久化；页面完成全部校验后统一保存一次。
  let nextAnchors = commitPlannedEntrances
    ? normalizeSceneAnchors(previousAnchors.map((anchor) => {
        const planned = Array.isArray(anchor.plannedCharacterIds) ? anchor.plannedCharacterIds : []
        return planned.length
          ? {
              ...anchor,
              presentCharacterIds: [...(anchor.presentCharacterIds || []), ...planned],
              plannedCharacterIds: []
            }
          : anchor
      }))
    : previousAnchors
  let nextNodes = previousNodes
  const intentEffects = normalizeSceneIntentEffects(sceneIntentEffects)
  const sceneDelta = adoptionSceneDelta(candidate, intentEffects)
  if (sceneDelta && unique(sceneDelta.presentCharacterIds).length > MAX_AUTHORING_PRESENT_CHARACTERS) {
    return { ok: false, reason: 'scene-character-limit-exceeded' }
  }

  if (sceneDelta) {
    const anchor = normalizeSceneAnchor({
      ...sceneDelta,
      unitId: unitIds[0],
      worldbookId: text(worldbookId),
      source: text(sceneDelta.source) || 'ghost-adoption'
    })
    if (anchor.status === 'invalid') return { ok: false, reason: 'invalid-scene-delta' }
    nextAnchors = normalizeSceneAnchors([...nextAnchors, anchor])
  }

  if (candidate?.outlineDelta) {
    const nodeId = text(candidate.outlineDelta.nodeId)
    const index = previousNodes.findIndex((node) => node.id === nodeId)
    if (index < 0) return { ok: false, reason: 'outline-node-missing' }
    nextNodes = previousNodes.map((node, nodeIndex) => nodeIndex === index
      ? {
          ...node,
          status: candidate.outlineDelta.status === 'fulfilled' ? 'fulfilled' : node.status,
          unitRefs: [
            ...node.unitRefs.filter((ref) => !unitIds.includes(ref.unitId)),
            ...unitIds.map((unitId) => ({ chapterId: text(candidate.target?.chapterId), unitId }))
          ],
          revision: Number(node.revision || 0) + 1
        }
      : node)
  }

  return {
    ok: true,
    sceneAnchors: nextAnchors,
    outlineNodes: nextNodes,
    receipt: Object.freeze({
      candidateId: text(candidate?.id),
      projectId: text(candidate?.target?.projectId),
      documentId: text(candidate?.target?.documentId),
      documentRole: candidate?.target?.role === 'exploration' ? 'exploration' : 'manuscript',
      insertedUnitId: unitIds[0],
      insertedUnitIds: Object.freeze(unitIds),
      insertedUnitCount: unitIds.length,
      beforeSceneFingerprint: fingerprintSceneAnchors(previousAnchors),
      afterSceneFingerprint: fingerprintSceneAnchors(nextAnchors),
      beforeOutlineFingerprint: fingerprintOutline(previousNodes, outlineEdges),
      afterOutlineFingerprint: fingerprintOutline(nextNodes, outlineEdges),
      previousAnchors,
      previousOutlineNodes: previousNodes,
      appliedAnchors: nextAnchors,
      appliedOutlineNodes: nextNodes,
      sceneIntentEffects: intentEffects,
      sceneChanged: fingerprintSceneAnchors(previousAnchors) !== fingerprintSceneAnchors(nextAnchors),
      outlineChanged: fingerprintOutline(previousNodes, outlineEdges) !== fingerprintOutline(nextNodes, outlineEdges)
    })
  }
}

export function canUndoWritingAdoptionDeltas(receipt, { sceneAnchors = [], outlineNodes = [], outlineEdges = [] } = {}) {
  if (!receipt) return false
  return fingerprintSceneAnchors(sceneAnchors) === receipt.afterSceneFingerprint
    && fingerprintOutline(outlineNodes, outlineEdges) === receipt.afterOutlineFingerprint
}

export function canRedoWritingAdoptionDeltas(receipt, { sceneAnchors = [], outlineNodes = [], outlineEdges = [] } = {}) {
  if (!receipt) return false
  return fingerprintSceneAnchors(sceneAnchors) === receipt.beforeSceneFingerprint
    && fingerprintOutline(outlineNodes, outlineEdges) === receipt.beforeOutlineFingerprint
}
