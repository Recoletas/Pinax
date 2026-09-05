export const AUTHORING_VISUAL_BRIEF_SCHEMA_VERSION = 1

const SOURCE_ROLES = new Set(['manuscript', 'exploration'])
const PANE_KINDS = new Set(['main', 'dual'])
const SCENE_SOURCE_KINDS = new Set(['character', 'location', 'time'])

function text(value, limit = Infinity) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized
}

function promptText(value, limit = 6000) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit)
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function revision(value) {
  return value === 0 || value === '0' ? '0' : text(value, 240)
}

function unique(values = []) {
  return [...new Set(list(values).map((value) => text(value, 240)).filter(Boolean))]
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function stableHash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

// Keep the same serializable worldbook-entry revision shape used by the
// Authoring context readers without importing their retrieval/runtime graph.
function worldbookEntryRevision(entry = {}) {
  const rawText = (value) => String(value ?? '').trim()
  if (!rawText(entry.id)) return ''
  return `entry-${stableHash({
    id: rawText(entry.id),
    name: rawText(entry.name),
    type: rawText(entry.type),
    content: String(entry.content ?? entry.text ?? ''),
    keys: list(entry.keys).map(rawText),
    keysSecondary: list(entry.keysSecondary).map(rawText),
    enabled: entry.enabled,
    constant: entry.constant,
    selective: entry.selective,
    caseSensitive: entry.caseSensitive,
    wholeWord: entry.wholeWord,
    insertionOrder: entry.insertionOrder,
    priority: entry.priority,
    position: entry.position,
    depth: entry.depth,
    probability: entry.probability,
    mode: entry.mode,
    strategy: entry.strategy,
    relations: entry.relations,
    voiceRules: entry.voiceRules,
    mapBinding: entry.mapBinding,
    metadata: entry.metadata
  })}`
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function nodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return list(node?.content).map(nodeText).join('')
}

function unitText(unit) {
  const direct = typeof unit?.text === 'string'
    ? unit.text
    : (typeof unit?.markdown === 'string' ? unit.markdown : '')
  if (direct) return promptText(direct)
  return promptText(list(unit?.content).map(nodeText).filter(Boolean).join('\n\n'))
}

function sourceRoot(input = {}) {
  if (input?.liveSource && typeof input.liveSource === 'object') return input.liveSource
  if (input?.source && typeof input.source === 'object') return input.source
  return input && typeof input === 'object' ? input : {}
}

function normalizeSourceIdentity(input = {}, { strict = true } = {}) {
  const root = sourceRoot(input)
  const target = input?.target && typeof input.target === 'object' ? input.target : {}
  const selection = input?.selection && typeof input.selection === 'object'
    ? input.selection
    : (input?.selectionSnapshot && typeof input.selectionSnapshot === 'object'
        ? input.selectionSnapshot
        : (root?.selection && typeof root.selection === 'object'
            ? root.selection
            : (root?.selectionSnapshot && typeof root.selectionSnapshot === 'object' ? root.selectionSnapshot : {})))
  const role = text(root.role || root.documentRole || input.role || input.documentRole)
  const projectId = text(root.projectId || target.projectId || input.projectId)
  const documentId = text(root.documentId || target.documentId || input.documentId)
  const chapterId = role === 'manuscript'
    ? text(root.chapterId || target.chapterId || input.chapterId || documentId)
    : ''
  const unitId = text(
    selection.unitId
      || target.unitId
      || selection.endUnitId
      || root.unitId
      || input.unitId
  )
  const nodeId = text(
    selection.nodeId
      || target.nodeId
      || selection.endNodeId
      || root.nodeId
      || input.nodeId
  )
  const document = root.document || input.document || null
  const unit = input.writingUnit
    || root.writingUnit
    || list(document?.content).find((item) => text(item?.attrs?.unitId || item?.unitId) === unitId)
    || ((input.unitText || root.unitText) ? { text: input.unitText || root.unitText } : null)
    || null
  const node = list(unit?.content).find((item) => text(item?.attrs?.nodeId || item?.nodeId) === nodeId) || null
  const identity = {
    role,
    projectId,
    projectRevision: revision(root.projectRevision ?? input.projectRevision),
    documentId,
    chapterId,
    title: text(root.title || input.title, 160),
    documentRevision: revision(
      root.documentRevision
        ?? input.documentRevision
        ?? selection.documentRevision
    ),
    documentSchemaRevision: revision(
      root.documentSchemaRevision
        ?? input.documentSchemaRevision
        ?? document?.revision
    ),
    unitId,
    unitRevision: revision(
      target.unitRevision
        ?? selection.unitRevision
        ?? root.unitRevision
        ?? input.unitRevision
        ?? unit?.attrs?.unitRevision
        ?? unit?.unitRevision
    ),
    nodeId,
    nodeRevision: revision(
      target.nodeRevision
        ?? selection.nodeRevision
        ?? root.nodeRevision
        ?? input.nodeRevision
        ?? node?.attrs?.nodeRevision
        ?? node?.nodeRevision
    )
  }
  const endUnitId = text(selection.endUnitId)
  const endNodeId = text(selection.endNodeId)
  if ((endUnitId && endUnitId !== unitId) || (endNodeId && endNodeId !== nodeId)) {
    const endUnitRevision = revision(selection.endUnitRevision)
    const endNodeRevision = revision(selection.endNodeRevision)
    if (endUnitId && endNodeId && endUnitRevision && endNodeRevision) {
      identity.selectionEnd = { unitId: endUnitId, unitRevision: endUnitRevision, nodeId: endNodeId, nodeRevision: endNodeRevision }
    } else if (strict) return null
  }
  if (strict && (!SOURCE_ROLES.has(identity.role)
    || !identity.projectId
    || !identity.documentId
    || (identity.role === 'manuscript' && !identity.chapterId)
    || !identity.documentRevision
    || !identity.documentSchemaRevision
    || !identity.unitId
    || !identity.unitRevision
    || !identity.nodeId
    || !identity.nodeRevision)) return null
  return { identity, selection, unit, document }
}

function normalizePromptSource({ selection, unit }) {
  const selected = promptText(selection?.text || selection?.selectedText)
  if (selected && selection?.empty !== true) {
    const from = Number(selection.markdownFrom)
    const to = Number(selection.markdownTo)
    const range = Number.isInteger(from) && from >= 0 && Number.isInteger(to) && to >= from
      ? { from, to }
      : null
    return {
      kind: 'selection',
      label: '选中文字',
      text: selected,
      ...(range ? { range } : {})
    }
  }
  const fallback = unitText(unit)
  if (!fallback) return null
  return { kind: 'writing-unit', label: '当前写作单元', text: fallback }
}

function worldbookEntries(input = {}) {
  const root = sourceRoot(input)
  return list(
    input.worldbookEntries
      || input.worldbook?.entries
      || input.boundWorldbook?.entries
      || input.sceneContext?.worldbookEntries
      || root.worldbookEntries
      || root.worldbook?.entries
      || root.boundWorldbook?.entries
  )
}

function worldbookEntryFor(id, kind, entries, projectId) {
  return entries.find((item) => (
    text(item?.id) === id
    && text(item?.type) === kind
    && (!text(item?.projectId || item?.bookId) || text(item?.projectId || item?.bookId) === projectId)
  )) || null
}

function worldbookRevisionFor(id, kind, source, entries, projectId) {
  const entry = worldbookEntryFor(id, kind, entries, projectId)
  if (entry) return worldbookEntryRevision(entry)
  return revision(source?.entryRevision ?? source?.sourceRevision ?? source?.revision)
}

function worldbookSourceRef(id, kind, source, entries, projectId) {
  const exact = unique(source?.sourceRefs).find((ref) => ref === `worldbook-entry:${id}`)
  return exact || (worldbookEntryFor(id, kind, entries, projectId) ? `worldbook-entry:${id}` : '')
}

function sceneSourceSummary(kind, source) {
  if (kind === 'character') {
    return text([
      source?.goal && `目标：${text(source.goal, 120)}`,
      source?.mood && `状态：${text(source.mood, 80)}`,
      source?.voiceBasis && `气质：${text(source.voiceBasis, 120)}`,
      source?.lastAction && `动作：${text(source.lastAction, 120)}`
    ].filter(Boolean).join('；'), 420)
  }
  if (kind === 'location') return text(source?.summary || source?.region || source?.description, 420)
  const label = text(source?.label, 160)
  const period = text(source?.period, 160)
  return period && period !== label ? period : ''
}

function normalizeScene(input = {}, identity) {
  const projection = input.sceneProjection || sourceRoot(input).sceneProjection || input.scene || null
  if (!projection || typeof projection !== 'object') {
    return { projectionFingerprint: '', sourceRefs: [], sources: [] }
  }
  const projectionFingerprint = revision(projection.projectionFingerprint || projection.fingerprint)
  const declaredProjectId = text(projection.projectId)
  const declaredChapterId = text(projection.chapterId)
  const declaredUnitId = text(projection.activeUnitId)
  if (!projectionFingerprint
    || (declaredProjectId && declaredProjectId !== identity.projectId)
    || (declaredChapterId && declaredChapterId !== identity.chapterId)
    || (declaredUnitId && declaredUnitId !== identity.unitId)) return null

  const entries = worldbookEntries(input)
  const sources = []
  const seen = new Set()
  const append = (kind, source) => {
    if (!SCENE_SOURCE_KINDS.has(kind) || !source) return
    const entityId = text(source.id || source.entityId)
      || (kind === 'time' ? stableHash({ label: source.label, period: source.period }) : '')
    const label = text(source.name || source.label || source.period, 160)
    if (!entityId || !label) return
    const id = `${kind}:${entityId}`
    if (seen.has(id)) return
    seen.add(id)
    const sourceRef = kind === 'time'
      ? `scene-projection:${identity.chapterId || identity.documentId}:${identity.unitId}`
      : worldbookSourceRef(entityId, kind, source, entries, identity.projectId)
    const sourceRevision = kind === 'time'
      ? projectionFingerprint
      : worldbookRevisionFor(entityId, kind, source, entries, identity.projectId)
    sources.push({
      id,
      kind,
      entityId,
      label,
      summary: sceneSourceSummary(kind, source),
      sourceRef,
      revision: sourceRevision,
      available: Boolean(sourceRef && sourceRevision),
      selected: false
    })
  }
  list(projection.presentCharacters).forEach((source) => append('character', source))
  append('location', projection.location)
  append('time', projection.time)
  sources.sort((left, right) => left.id.localeCompare(right.id))
  return {
    projectionFingerprint,
    sourceRefs: unique(projection.sourceRefs),
    sources
  }
}

function primarySourceRef(source) {
  return source.role === 'manuscript'
    ? `chapter:${source.chapterId}`
    : `exploration:${source.documentId}`
}

function baseFingerprintInput(value) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    status: value.status,
    sessionId: value.sessionId,
    projectId: value.projectId,
    pane: value.pane,
    source: value.source,
    promptSource: value.promptSource,
    scene: value.scene
  }
}

function finalFingerprintInput(value) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    status: value.status,
    sessionId: value.sessionId,
    projectId: value.projectId,
    pane: value.pane,
    source: value.source,
    promptSource: value.promptSource,
    scene: value.scene,
    baseFingerprint: value.baseFingerprint,
    prompt: value.prompt,
    generationPrompt: value.generationPrompt,
    selectedSceneSourceIds: value.selectedSceneSourceIds,
    selectedSceneSources: value.selectedSceneSources,
    sourceRefs: value.sourceRefs,
    sourceRevisions: value.sourceRevisions
  }
}

function validBriefFingerprint(brief) {
  if (!brief
    || brief.schemaVersion !== AUTHORING_VISUAL_BRIEF_SCHEMA_VERSION
    || brief.kind !== 'authoring-visual-brief'
    || !['prepared', 'finalized'].includes(brief.status)
    || !brief.fingerprint
    || text(brief.projectId) !== text(brief.source?.projectId)) return false
  const input = brief.status === 'finalized'
    ? finalFingerprintInput(brief)
    : baseFingerprintInput(brief)
  return brief.fingerprint === `visual-brief-${stableHash(input)}`
}

export function createAuthoringVisualBrief(input = {}) {
  const pane = text(input.pane || sourceRoot(input).pane)
  if (!PANE_KINDS.has(pane)) return null
  const normalizedSource = normalizeSourceIdentity(input)
  if (!normalizedSource) return null
  const promptSource = normalizePromptSource(normalizedSource)
  if (!promptSource) return null
  const scene = normalizeScene(input, normalizedSource.identity)
  if (!scene) return null
  const source = normalizedSource.identity
  const sessionId = text(input.sessionId || input.runId)
    || `visual-session-${stableHash({ pane, source, promptSource, scene })}`
  const core = {
    schemaVersion: AUTHORING_VISUAL_BRIEF_SCHEMA_VERSION,
    kind: 'authoring-visual-brief',
    status: 'prepared',
    sessionId,
    projectId: source.projectId,
    pane,
    source,
    promptSource,
    scene
  }
  return deepFreeze({
    ...core,
    fingerprint: `visual-brief-${stableHash(baseFingerprintInput(core))}`
  })
}

function normalizeFinalizeArguments(briefOrInput, options) {
  if (briefOrInput?.brief || briefOrInput?.baseBrief) {
    return {
      brief: briefOrInput.brief || briefOrInput.baseBrief,
      options: briefOrInput
    }
  }
  return { brief: briefOrInput, options: options || {} }
}

function renderGenerationPrompt(prompt, sources) {
  const sceneLines = sources.map((source) => {
    const prefix = source.kind === 'character' ? '人物' : (source.kind === 'location' ? '地点' : '时间')
    return `${prefix}：${source.label}${source.summary ? `（${source.summary}）` : ''}`
  })
  return promptText([prompt, ...sceneLines].filter(Boolean).join('\n'))
}

export function finalizeAuthoringVisualBrief(briefOrInput = {}, options = {}) {
  const normalized = normalizeFinalizeArguments(briefOrInput, options)
  const brief = normalized.brief
  const settings = normalized.options
  if (!brief || brief.status !== 'prepared' || !validBriefFingerprint(brief)) return null
  const prompt = promptText(settings.prompt ?? settings.promptText ?? brief.promptSource?.text)
  if (!prompt) return null
  const requestedSceneSourceIds = unique(settings.selectedSceneSourceIds)
  const sceneById = new Map(list(brief.scene?.sources).map((source) => [source.id, source]))
  if (requestedSceneSourceIds.some((id) => !sceneById.has(id))) return null
  const selectedSet = new Set(requestedSceneSourceIds)
  const selectedSceneSourceIds = list(brief.scene?.sources)
    .filter((source) => selectedSet.has(source.id))
    .map((source) => source.id)
  const selectedSceneSources = selectedSceneSourceIds.map((id) => sceneById.get(id))
  if (selectedSceneSources.some((source) => !source.available || !source.sourceRef || !source.revision)) return null
  const scene = {
    ...brief.scene,
    sources: list(brief.scene?.sources).map((source) => ({ ...source, selected: selectedSet.has(source.id) }))
  }
  const primaryRef = primarySourceRef(brief.source)
  const sourceRefs = unique([
    primaryRef,
    ...selectedSceneSources.map((source) => source.sourceRef)
  ]).sort((left, right) => left.localeCompare(right))
  const sourceRevisions = Object.fromEntries([
    [primaryRef, brief.source.documentRevision],
    ...selectedSceneSources.map((source) => [source.sourceRef, source.revision])
  ].sort(([left], [right]) => left.localeCompare(right)))
  const core = {
    schemaVersion: AUTHORING_VISUAL_BRIEF_SCHEMA_VERSION,
    kind: 'authoring-visual-brief',
    status: 'finalized',
    sessionId: brief.sessionId,
    projectId: brief.projectId,
    pane: brief.pane,
    source: brief.source,
    promptSource: brief.promptSource,
    scene,
    baseFingerprint: brief.fingerprint,
    prompt,
    generationPrompt: renderGenerationPrompt(prompt, selectedSceneSources),
    selectedSceneSourceIds,
    selectedSceneSources,
    sourceRefs,
    sourceRevisions
  }
  return deepFreeze({
    ...core,
    fingerprint: `visual-brief-${stableHash(finalFingerprintInput(core))}`
  })
}

function staleIssue(field, expected, actual, reason = 'revision-changed', extra = {}) {
  return {
    field,
    reason: actual
      ? reason
      : (reason.endsWith('-missing') ? reason : `${reason.replace(/-changed$/u, '')}-missing`),
    expected: text(expected, 240),
    actual: text(actual, 240),
    ...extra
  }
}

function compareIdentity(issues, expected, actual, field, reason) {
  const expectedValue = revision(expected[field])
  const actualValue = revision(actual?.[field])
  if (expectedValue !== actualValue) issues.push(staleIssue(field, expectedValue, actualValue, reason))
}

export function assessAuthoringVisualBriefFreshness(brief, liveInput = {}) {
  if (!validBriefFingerprint(brief)) {
    return deepFreeze({
      fresh: false,
      stale: true,
      detached: true,
      staleSources: [{ field: 'brief', reason: 'brief-invalid', expected: '', actual: '' }]
    })
  }
  const live = normalizeSourceIdentity(liveInput, { strict: false })
  if (!live || (!live.identity.projectId && !live.identity.documentId && !live.identity.unitId && !live.identity.nodeId)) {
    return deepFreeze({
      fresh: false,
      stale: true,
      detached: true,
      staleSources: [{ field: 'source', reason: 'source-missing', expected: primarySourceRef(brief.source), actual: '' }]
    })
  }
  const issues = []
  const expected = brief.source
  const actual = live.identity
  const livePane = text(liveInput.pane || sourceRoot(liveInput).pane)
  if (livePane !== brief.pane) {
    issues.push(staleIssue('pane', brief.pane, livePane, 'pane-changed'))
  }
  compareIdentity(issues, expected, actual, 'projectId', 'project-changed')
  if (expected.projectRevision) compareIdentity(issues, expected, actual, 'projectRevision', 'project-revision-changed')
  compareIdentity(issues, expected, actual, 'role', 'source-role-changed')
  compareIdentity(issues, expected, actual, 'documentId', 'document-changed')
  compareIdentity(issues, expected, actual, 'chapterId', 'chapter-changed')
  compareIdentity(issues, expected, actual, 'documentRevision', 'document-revision-changed')
  compareIdentity(issues, expected, actual, 'documentSchemaRevision', 'document-schema-revision-changed')
  compareIdentity(issues, expected, actual, 'unitId', 'unit-changed')
  compareIdentity(issues, expected, actual, 'unitRevision', 'unit-revision-changed')
  compareIdentity(issues, expected, actual, 'nodeId', 'node-changed')
  compareIdentity(issues, expected, actual, 'nodeRevision', 'node-revision-changed')
  if (expected.selectionEnd) {
    for (const field of ['unitId', 'unitRevision', 'nodeId', 'nodeRevision']) {
      const expectedValue = revision(expected.selectionEnd[field])
      const actualValue = revision(actual.selectionEnd?.[field])
      if (expectedValue !== actualValue) {
        issues.push(staleIssue(`selectionEnd.${field}`, expectedValue, actualValue, `${field.replace('Id', '').replace('Revision', '-revision')}-changed`))
      }
    }
  }
  const liveScene = normalizeScene(liveInput, actual)
  const dependsOnScene = brief.status !== 'finalized' || list(brief.selectedSceneSources).length > 0
  if (dependsOnScene && brief.scene?.projectionFingerprint) {
    const liveFingerprint = revision(liveScene?.projectionFingerprint)
    if (brief.scene.projectionFingerprint !== liveFingerprint) {
      issues.push(staleIssue(
        'sceneRevision',
        brief.scene.projectionFingerprint,
        liveFingerprint,
        'scene-revision-changed'
      ))
    }
  }
  if (brief.status === 'finalized') {
    const liveSceneById = new Map(list(liveScene?.sources).map((source) => [source.id, source]))
    for (const source of list(brief.selectedSceneSources)) {
      const current = liveSceneById.get(source.id)
      if (!current) {
        issues.push(staleIssue('sourceRevision', source.revision, '', 'source-missing', {
          sourceId: source.id,
          sourceRef: source.sourceRef
        }))
        continue
      }
      if (source.sourceRef !== current.sourceRef) {
        issues.push(staleIssue('sourceRef', source.sourceRef, current.sourceRef, 'source-ref-changed', {
          sourceId: source.id,
          sourceRef: source.sourceRef
        }))
      }
      if (source.revision !== current.revision) {
        issues.push(staleIssue('sourceRevision', source.revision, current.revision, 'source-revision-changed', {
          sourceId: source.id,
          sourceRef: source.sourceRef
        }))
      }
    }
  }
  const stale = issues.length > 0
  const detachedFields = new Set(['pane', 'projectId', 'role', 'documentId', 'chapterId', 'unitId', 'nodeId'])
  const detached = issues.some((issue) => (
    detachedFields.has(issue.field)
    || issue.reason === 'source-missing'
  ))
  return deepFreeze({ fresh: !stale, stale, detached, staleSources: issues })
}

export function reconcileAuthoringVisualBrief(brief, liveInput = {}) {
  const assessment = assessAuthoringVisualBriefFreshness(brief, liveInput)
  if (!brief || typeof brief !== 'object') return assessment
  return deepFreeze({
    ...brief,
    fresh: assessment.fresh,
    stale: assessment.stale,
    detached: assessment.detached,
    staleSources: assessment.staleSources
  })
}

export const assessAuthoringVisualBrief = assessAuthoringVisualBriefFreshness

export default createAuthoringVisualBrief
