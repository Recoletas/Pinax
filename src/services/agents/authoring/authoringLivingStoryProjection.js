import { resolveActiveSceneAnchor } from './authoringSceneAnchors.js'
import { buildUnitSemanticProjection } from './unitSemanticProjection.js'
import { buildWritingWorldbookMentions } from '../../writing/writingWorldbookMentions.js'
import { getNodePlainText } from '../../writing/writingDocumentSchema.js'

export const AUTHORING_LIVING_STORY_PROJECTION_VERSION = 1

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(list(values).map(text).filter(Boolean))]
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let result = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function unitText(unit) {
  return list(unit?.content).map(getNodePlainText).map(text).filter(Boolean).join('\n\n')
}

function sourceRefForNode(chapterId, nodeId) {
  return chapterId && nodeId ? `node:${chapterId}:${nodeId}` : ''
}

function sourceRefForUnit(chapterId, unitId) {
  return chapterId && unitId ? `unit:${chapterId}:${unitId}` : ''
}

function worldbookEntryMap(worldbook) {
  return new Map(list(worldbook?.entries).map((entry) => [text(entry?.id), entry]).filter(([id]) => id))
}

function entity(entry, role, source = 'scene') {
  const id = text(entry?.id)
  if (!id) return null
  return {
    id,
    label: text(entry?.name) || '已删除设定',
    kind: text(entry?.type) || 'general',
    role,
    source,
    sourceRef: `worldbook-entry:${id}`
  }
}

function outlineTargetRef(node, positions) {
  const direct = list(node?.sourceRefs).map(text).find((ref) => positions.has(ref))
  if (direct) return direct
  for (const ref of list(node?.unitRefs)) {
    const unitId = text(ref?.unitId)
    const chapterId = text(ref?.chapterId)
    const match = [...positions.values()].find((entry) => (
      entry.unitId === unitId && (!chapterId || entry.chapterId === chapterId)
    ))
    if (match) return sourceRefForNode(match.chapterId, match.nodeId)
  }
  return ''
}

function sceneTitle({ heading, location, time, index }) {
  if (heading) return heading
  const context = [location?.label, time].filter(Boolean).join(' · ')
  return context || `场景 ${index + 1}`
}

function primaryFunction(axes) {
  return ['transition', 'action', 'dialogue', 'reflection', 'exposition']
    .find((item) => axes?.functions?.includes(item)) || 'exposition'
}

function effectKinds(axes) {
  return ['reveals', 'changes'].filter((item) => axes?.effects?.includes(item))
}

// F3-5 is a read-only projection. It derives every locator and relation from
// the live writing document, scene anchors and project outline, and returns no
// mutation API or persistence payload.
export function buildAuthoringLivingStoryProjection({
  projectId = '',
  chapterId = '',
  document = null,
  positionIndex = null,
  sceneAnchors = [],
  worldbook = null,
  outlineNodes = [],
  outlineEdges = []
} = {}) {
  const resolvedProjectId = text(projectId)
  const resolvedChapterId = text(chapterId)
  if (!resolvedProjectId || !resolvedChapterId || !document
    || text(positionIndex?.projectId) !== resolvedProjectId) return null

  const documentPositions = list(positionIndex.entries)
    .filter((entry) => entry.documentRole === 'manuscript' && text(entry.chapterId) === resolvedChapterId)
  const positionByRef = new Map(documentPositions.map((entry) => (
    [sourceRefForNode(resolvedChapterId, entry.nodeId), entry]
  )))
  const units = list(document.content)
  const unitOrder = units.map((unit) => text(unit?.attrs?.unitId)).filter(Boolean)
  const entries = worldbookEntryMap(worldbook)
  const mentions = buildWritingWorldbookMentions(document, worldbook)
  const mentionsByNode = new Map()
  for (const mention of mentions) {
    if (!mention.entryId || mention.ambiguous) continue
    const current = mentionsByNode.get(text(mention.nodeId)) || []
    current.push(mention)
    mentionsByNode.set(text(mention.nodeId), current)
  }

  const beats = []
  const scenes = []
  let currentScene = null
  for (const unit of units) {
    const unitId = text(unit?.attrs?.unitId)
    const prose = unitText(unit)
    if (!unitId || !prose) continue
    const nodes = list(unit.content)
    const firstNode = nodes.find((node) => text(getNodePlainText(node))) || nodes[0]
    const nodeId = text(firstNode?.attrs?.nodeId || firstNode?.attrs?.blockId)
    const headingNode = nodes.find((node) => node?.attrs?.kind === 'scene-heading')
    const heading = text(getNodePlainText(headingNode))
    const anchorResolution = resolveActiveSceneAnchor({
      anchors: sceneAnchors,
      unitOrder,
      activeUnitId: unitId,
      worldbookId: text(worldbook?.id)
    })
    const anchor = anchorResolution.anchor
    const explicitAnchor = anchorResolution.status === 'explicit'
    const sceneIdentity = text(unit?.attrs?.sceneId)
      || (heading ? `heading:${text(headingNode?.attrs?.nodeId)}` : '')
      || (explicitAnchor ? `anchor:${anchor.id}` : '')
      || currentScene?.identity
      || `chapter:${resolvedChapterId}:opening`
    const location = anchor?.locationId ? entity(entries.get(text(anchor.locationId)), 'location') : null
    if (!currentScene || currentScene.identity !== sceneIdentity) {
      currentScene = {
        id: `living-scene:${resolvedChapterId}:${hash(sceneIdentity)}`,
        identity: sceneIdentity,
        index: scenes.length,
        title: sceneTitle({ heading, location, time: text(anchor?.time?.label || anchor?.time?.period), index: scenes.length }),
        sourceRefs: unique([
          headingNode ? sourceRefForNode(resolvedChapterId, text(headingNode?.attrs?.nodeId)) : '',
          anchor?.id ? `scene-anchor:${anchor.id}` : ''
        ]),
        beatIds: [],
        characterIds: [],
        locationIds: [],
        threadIds: []
      }
      scenes.push(currentScene)
    }

    const axes = buildUnitSemanticProjection({
      text: prose,
      revision: `${document.revision ?? ''}:${unit?.attrs?.unitRevision ?? ''}`
    }).paragraphs.reduce((acc, paragraph) => ({
      functions: unique([...acc.functions, ...list(paragraph.axes?.functions)]),
      effects: unique([...acc.effects, ...list(paragraph.axes?.effects)])
    }), { functions: [], effects: [] })
    const anchoredCharacters = list(anchor?.presentCharacterIds)
      .map((id) => entity(entries.get(text(id)), 'present'))
      .filter(Boolean)
    const mentioned = unique(nodes.flatMap((node) => (
      list(mentionsByNode.get(text(node?.attrs?.nodeId))).map((mention) => mention.entryId)
    ))).map((id) => entity(entries.get(id), 'mentioned', 'exact-mention')).filter(Boolean)
    const characters = [...anchoredCharacters]
    for (const item of mentioned.filter((candidate) => candidate.kind === 'character')) {
      if (!characters.some((candidate) => candidate.id === item.id)) characters.push(item)
    }
    const mentionedLocations = mentioned.filter((candidate) => candidate.kind === 'location')
    const locations = [location, ...mentionedLocations].filter(Boolean)
      .filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index)
    const beat = {
      id: `living-beat:${resolvedChapterId}:${unitId}`,
      sceneId: currentScene.id,
      order: beats.length,
      unitId,
      nodeId,
      title: prose.length > 54 ? `${prose.slice(0, 54)}…` : prose,
      function: primaryFunction(axes),
      effects: effectKinds(axes),
      characters,
      locations,
      threads: [],
      target: {
        projectId: resolvedProjectId,
        documentRole: 'manuscript',
        documentId: resolvedChapterId,
        chapterId: resolvedChapterId,
        documentRevision: text(positionByRef.get(sourceRefForNode(resolvedChapterId, nodeId))?.documentRevision),
        unitId,
        unitRevision: text(unit?.attrs?.unitRevision),
        nodeId,
        nodeRevision: text(firstNode?.attrs?.nodeRevision ?? firstNode?.attrs?.revision)
      },
      sourceRefs: unique([
        sourceRefForUnit(resolvedChapterId, unitId),
        sourceRefForNode(resolvedChapterId, nodeId),
        ...characters.map((item) => item.sourceRef),
        ...locations.map((item) => item.sourceRef)
      ])
    }
    beats.push(beat)
    currentScene.beatIds.push(beat.id)
    currentScene.characterIds.push(...characters.map((item) => item.id))
    currentScene.locationIds.push(...locations.map((item) => item.id))
  }

  const beatByNodeRef = new Map(beats.map((beat) => [sourceRefForNode(resolvedChapterId, beat.nodeId), beat]))
  const beatByUnitId = new Map(beats.map((beat) => [beat.unitId, beat]))
  const mappedOutlineNodes = new Map()
  for (const node of list(outlineNodes)) {
    const targetRef = outlineTargetRef(node, positionByRef)
    const position = positionByRef.get(targetRef)
    const beat = position ? (beatByNodeRef.get(targetRef) || beatByUnitId.get(position.unitId)) : null
    if (!beat) continue
    mappedOutlineNodes.set(text(node.id), { node, beat, targetRef })
    if (node.status !== 'fulfilled') {
      const thread = {
        id: text(node.id),
        label: text(node.title) || '未命名线索',
        status: text(node.status) || 'planned',
        sourceRef: `outline-node:${text(node.id)}`
      }
      beat.threads.push(thread)
      scenes.find((scene) => scene.id === beat.sceneId)?.threadIds.push(thread.id)
      beat.sourceRefs.push(thread.sourceRef)
    }
  }

  const relations = []
  for (const edge of list(outlineEdges)) {
    const from = mappedOutlineNodes.get(text(edge?.fromNodeId))
    const to = mappedOutlineNodes.get(text(edge?.toNodeId))
    const kind = edge?.kind === 'causes' ? 'causes' : (edge?.kind === 'foreshadows' ? 'payoff' : '')
    if (!from || !to || !kind || from.beat.id === to.beat.id) continue
    relations.push({
      id: `living-relation:${text(edge.id) || hash([edge.kind, from.targetRef, to.targetRef])}`,
      kind,
      fromBeatId: from.beat.id,
      toBeatId: to.beat.id,
      label: kind === 'causes' ? '导致' : '伏笔兑现',
      sourceRef: `outline-edge:${text(edge.id)}`
    })
  }

  const allCharacters = new Map()
  const allLocations = new Map()
  const allThreads = new Map()
  for (const beat of beats) {
    beat.characters.forEach((item) => allCharacters.set(item.id, item))
    beat.locations.forEach((item) => allLocations.set(item.id, item))
    beat.threads.forEach((item) => allThreads.set(item.id, item))
    beat.sourceRefs = unique(beat.sourceRefs)
  }
  for (const scene of scenes) {
    scene.characterIds = unique(scene.characterIds)
    scene.locationIds = unique(scene.locationIds)
    scene.threadIds = unique(scene.threadIds)
    delete scene.identity
  }
  const value = {
    schemaVersion: AUTHORING_LIVING_STORY_PROJECTION_VERSION,
    kind: 'authoring-living-story-projection',
    projectId: resolvedProjectId,
    chapterId: resolvedChapterId,
    documentRevision: text(document.revision),
    positionFingerprint: text(positionIndex.fingerprint),
    scenes,
    beats,
    relations,
    lanes: {
      characters: [...allCharacters.values()],
      locations: [...allLocations.values()],
      threads: [...allThreads.values()]
    }
  }
  value.fingerprint = `living-story-${hash(value)}`
  return deepFreeze(value)
}

export default buildAuthoringLivingStoryProjection
