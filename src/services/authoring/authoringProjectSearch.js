import {
  createWritingDocument,
  getChapterDocument,
  getNodePlainText,
  getWritingDocumentMarkdown,
  getWritingDocumentPlainText,
  markWritingNodeChanged,
  validateWritingDocument
} from '../writing/writingDocumentSchema.js'
import { reconcileWritingAnnotations } from '../writing/writingAnnotations.js'
import { buildManuscriptPositionIndex } from '../writing/manuscriptPositionIndex.js'

export const AUTHORING_SEARCH_INDEX_SCHEMA_VERSION = 1
export const AUTHORING_SEARCH_SCOPES = Object.freeze([
  'current-chapter',
  'manuscript',
  'exploration',
  'worldbook'
])

const SEARCHABLE_DOCUMENT_NODE_KINDS = new Set([
  'prose',
  'scene-heading',
  'quote',
  'author-note',
  'source-reference'
])
const MANUSCRIPT_SCOPES = new Set(['current-chapter', 'manuscript'])
const MAX_QUERY_CHARS = 240
const MAX_SEARCH_RESULTS = 100000

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function clone(value) {
  if (value == null) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((item) => deepFreeze(item, seen))
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function stableHash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function resultError(reason, details = {}) {
  return deepFreeze({ ok: false, reason, ...details })
}

function belongsToProject(value, projectId) {
  const declared = [value?.projectId, value?.bookId]
    .map((item) => text(item))
    .filter(Boolean)
  return declared.length === 0 || declared.every((id) => id === projectId)
}

function normalizeScope(value) {
  const scope = text(value)
  return AUTHORING_SEARCH_SCOPES.includes(scope) ? scope : ''
}

function normalizeQuery(value) {
  return String(value ?? '').trim().slice(0, MAX_QUERY_CHARS)
}

function canonicalDocument(value, fallback = '') {
  const document = clone(value)
  if (validateWritingDocument(document).valid) return document
  return createWritingDocument(String(fallback || ''))
}

function documentIdentity(document) {
  return {
    schemaVersion: Number(document?.schemaVersion || 0),
    revision: Number(document?.revision || 0),
    markdown: getWritingDocumentMarkdown(document),
    units: list(document?.content).map((unit) => ({
      unitId: text(unit?.attrs?.unitId),
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      kind: text(unit?.attrs?.kind),
      nodes: list(unit?.content).map((node) => ({
        nodeId: text(node?.attrs?.nodeId),
        nodeRevision: Number(node?.attrs?.nodeRevision || 0),
        kind: text(node?.attrs?.kind),
        body: String(getNodePlainText(node) || '')
      }))
    }))
  }
}

function documentSourceRevision({ sourceKind, sourceId, title, document, declaredRevision = '' }) {
  return `${sourceKind}-${stableHash({
    sourceId,
    title,
    declaredRevision: String(declaredRevision ?? ''),
    document: documentIdentity(document)
  })}`
}

function documentNodeEntries(document) {
  return list(document?.content).flatMap((unit, unitIndex) => {
    const unitId = text(unit?.attrs?.unitId)
    const unitRevision = Number(unit?.attrs?.unitRevision || 0)
    return list(unit?.content).flatMap((node, nodeIndex) => {
      const nodeId = text(node?.attrs?.nodeId)
      const nodeRevision = Number(node?.attrs?.nodeRevision || 0)
      const kind = text(node?.attrs?.kind)
      const body = String(getNodePlainText(node) || '')
      if (!unitId || !nodeId || !body || !SEARCHABLE_DOCUMENT_NODE_KINDS.has(kind)) return []
      return [{ unitId, unitRevision, unitIndex, nodeId, nodeRevision, nodeIndex, kind, text: body }]
    })
  })
}

function manuscriptSource(chapter, chapterOrder) {
  const chapterId = text(chapter?.id)
  if (!chapterId) return null
  const document = canonicalDocument(getChapterDocument(chapter), chapter?.content || '')
  const title = text(chapter?.title) || `第 ${chapterOrder + 1} 章`
  const sourceRevision = documentSourceRevision({
    sourceKind: 'manuscript',
    sourceId: chapterId,
    title,
    document,
    declaredRevision: document.revision
  })
  return {
    sourceKind: 'manuscript',
    sourceId: chapterId,
    documentId: chapterId,
    chapterId,
    chapterOrder,
    title,
    document,
    documentRevision: Number(document.revision || 0),
    sourceRevision,
    nodes: documentNodeEntries(document)
  }
}

function explorationSource(documentRecord, order) {
  const documentId = text(documentRecord?.id)
  if (!documentId) return null
  const document = canonicalDocument(documentRecord?.editorDocument, documentRecord?.content || '')
  const title = text(documentRecord?.title) || '未命名速记'
  const declaredRevision = documentRecord?.revision ?? document.revision
  return {
    sourceKind: 'exploration',
    sourceId: documentId,
    documentId,
    chapterId: '',
    chapterOrder: -1,
    order,
    title,
    titleText: title,
    document,
    documentRevision: Number(document.revision || 0),
    sourceRevision: documentSourceRevision({
      sourceKind: 'exploration',
      sourceId: documentId,
      title,
      document,
      declaredRevision
    }),
    nodes: documentNodeEntries(document)
  }
}

function normalizeLiveSource(raw, projectId, documentSources) {
  if (!raw || typeof raw !== 'object') return resultError('invalid-live-source')
  const declaredProjectId = text(raw.projectId || raw.bookId)
  if (!declaredProjectId || declaredProjectId !== projectId) return resultError('live-source-project-mismatch')
  const sourceKind = raw.role === 'exploration' || raw.documentRole === 'exploration'
    ? 'exploration'
    : raw.role === 'manuscript' || raw.documentRole === 'manuscript'
      ? 'manuscript'
      : ''
  if (!sourceKind) return resultError('live-source-role-invalid')
  const sourceId = text(raw.documentId || (sourceKind === 'manuscript' ? raw.chapterId : ''))
  const chapterId = text(raw.chapterId)
  if (!sourceId || (sourceKind === 'manuscript' && chapterId !== sourceId)) {
    return resultError('live-source-document-mismatch')
  }
  const key = `${sourceKind}:${sourceId}`
  const stored = documentSources.get(key)
  if (!stored) return resultError('live-source-missing')
  const document = clone(raw.document)
  if (!validateWritingDocument(document).valid) return resultError('live-source-document-invalid')
  const declaredSchemaRevision = raw.documentSchemaRevision
  if (declaredSchemaRevision !== undefined
    && declaredSchemaRevision !== null
    && String(declaredSchemaRevision) !== String(document.revision)) {
    return resultError('live-source-schema-revision-mismatch')
  }
  const title = text(raw.title) || stored.title
  const declaredRevision = String(raw.documentRevision ?? document.revision)
  return {
    ok: true,
    key,
    source: {
      ...stored,
      title,
      ...(sourceKind === 'exploration' ? { titleText: title } : {}),
      document,
      documentRevision: Number(document.revision || 0),
      sourceRevision: documentSourceRevision({
        sourceKind,
        sourceId,
        title,
        document,
        declaredRevision
      }),
      nodes: documentNodeEntries(document),
      live: true
    }
  }
}

function worldbookEntryRevision(entry) {
  return `worldbook-entry-${stableHash({
    id: text(entry?.id),
    name: String(entry?.name || ''),
    type: String(entry?.type || ''),
    content: String(entry?.content || entry?.description || ''),
    keys: list(entry?.keys).map(String),
    keysSecondary: list(entry?.keysSecondary).map(String),
    updatedAt: entry?.updatedAt || entry?.revision || ''
  })}`
}

function worldbookEntrySources({ projectId, book, worldbook }) {
  const boundWorldbookId = text(book?.worldbookId)
  if (!boundWorldbookId || !worldbook || text(worldbook?.id) !== boundWorldbookId) return []
  return list(worldbook?.entries).flatMap((entry, order) => {
    const entryId = text(entry?.id)
    if (!entryId || !belongsToProject(entry, projectId)) return []
    const title = text(entry?.name || list(entry?.keys)[0]) || '未命名设定'
    const fields = [
      { field: 'name', fieldIndex: 0, label: '名称', text: String(entry?.name || '') },
      ...list(entry?.keys).map((value, fieldIndex) => ({ field: 'key', fieldIndex, label: '关键词', text: String(value || '') })),
      ...list(entry?.keysSecondary).map((value, fieldIndex) => ({ field: 'secondary-key', fieldIndex, label: '别名', text: String(value || '') })),
      { field: 'content', fieldIndex: 0, label: '正文', text: String(entry?.content || entry?.description || '') }
    ].filter((field) => field.text)
    return [{
      sourceKind: 'worldbook-entry',
      sourceId: entryId,
      entryId,
      worldbookId: boundWorldbookId,
      title,
      type: text(entry?.type),
      order,
      sourceRevision: worldbookEntryRevision(entry),
      fields
    }]
  })
}

function projectExplorations(book, explorations, projectId) {
  const source = list(explorations).length ? explorations : book?.explorationDocuments
  return list(source).filter((item) => text(item?.id) && belongsToProject(item, projectId))
}

function duplicateSourceId(sources) {
  const seen = new Set()
  for (const source of sources) {
    const key = `${source.sourceKind}:${source.sourceId}`
    if (seen.has(key)) return key
    seen.add(key)
  }
  return ''
}

/**
 * Build a frozen, read-only index from an explicit project snapshot.
 * The service never reads a store. Unsaved editor state may be supplied through
 * liveSources, but two divergent live owners for one document fail closed.
 */
export function buildAuthoringPositionIndex({
  projectId,
  book,
  explorations = [],
  worldbook = null,
  liveSources = []
} = {}) {
  const normalizedProjectId = text(projectId || book?.id)
  if (!normalizedProjectId || !book || text(book?.id) !== normalizedProjectId) {
    return resultError('project-mismatch')
  }

  const manuscripts = list(book?.chapters)
    .map(manuscriptSource)
    .filter(Boolean)
  const ideas = projectExplorations(book, explorations, normalizedProjectId)
    .map(explorationSource)
    .filter(Boolean)
  const duplicateDocumentKey = duplicateSourceId([...manuscripts, ...ideas])
  if (duplicateDocumentKey) return resultError('ambiguous-stored-source', { sourceKey: duplicateDocumentKey })
  const documentSources = new Map(
    [...manuscripts, ...ideas].map((source) => [`${source.sourceKind}:${source.sourceId}`, source])
  )
  const normalizedLiveSources = new Map()
  for (const raw of list(liveSources)) {
    const normalized = normalizeLiveSource(raw, normalizedProjectId, documentSources)
    if (!normalized.ok) return normalized
    const previous = normalizedLiveSources.get(normalized.key)
    if (previous && previous.sourceRevision !== normalized.source.sourceRevision) {
      return resultError('ambiguous-live-source', { sourceKey: normalized.key })
    }
    normalizedLiveSources.set(normalized.key, normalized.source)
  }
  normalizedLiveSources.forEach((source, key) => documentSources.set(key, source))

  const indexedManuscripts = manuscripts.map((source) => documentSources.get(`manuscript:${source.sourceId}`))
  const indexedExplorations = ideas.map((source) => documentSources.get(`exploration:${source.sourceId}`))
  const worldbookEntries = worldbookEntrySources({ projectId: normalizedProjectId, book, worldbook })
  const duplicateWorldbookKey = duplicateSourceId(worldbookEntries)
  if (duplicateWorldbookKey) return resultError('ambiguous-stored-source', { sourceKey: duplicateWorldbookKey })
  const manuscriptPosition = buildManuscriptPositionIndex({
    ...book,
    chapters: indexedManuscripts.map((source) => ({ id: source.chapterId, editorDocument: source.document }))
  })
  const manuscriptRevision = `manuscript-${stableHash({
    chapterOrderRevision: manuscriptPosition.chapterOrderRevision,
    sources: indexedManuscripts.map((source) => [source.sourceId, source.sourceRevision])
  })}`
  const indexRevision = `authoring-search-${stableHash({
    manuscriptRevision,
    explorations: indexedExplorations.map((source) => [source.sourceId, source.sourceRevision]),
    worldbook: worldbookEntries.map((source) => [source.sourceId, source.sourceRevision])
  })}`

  return deepFreeze({
    ok: true,
    schemaVersion: AUTHORING_SEARCH_INDEX_SCHEMA_VERSION,
    projectId: normalizedProjectId,
    bookId: normalizedProjectId,
    chapterOrderRevision: manuscriptPosition.chapterOrderRevision,
    manuscriptRevision,
    indexRevision,
    documents: [...indexedManuscripts, ...indexedExplorations],
    manuscripts: indexedManuscripts,
    explorations: indexedExplorations,
    worldbookEntries
  })
}

function escapedLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function literalMatches(source, query) {
  if (!source || !query) return []
  const expression = new RegExp(escapedLiteral(query), 'giu')
  return [...String(source).matchAll(expression)].map((match) => ({
    start: Number(match.index),
    end: Number(match.index) + String(match[0]).length,
    text: String(match[0])
  }))
}

function excerptFor(source, start, end) {
  const from = Math.max(0, start - 46)
  const to = Math.min(source.length, end + 72)
  return {
    excerpt: `${from > 0 ? '…' : ''}${source.slice(from, to)}${to < source.length ? '…' : ''}`,
    excerptMatchStart: start - from + (from > 0 ? 1 : 0),
    excerptMatchEnd: end - from + (from > 0 ? 1 : 0)
  }
}

function findingId(target, query, matchedText) {
  return `authoring-search-${stableHash({ target, query, matchedText })}`
}

function documentFinding(source, node, match, query) {
  const target = {
    projectId: source.projectId,
    sourceKind: source.sourceKind,
    sourceId: source.sourceId,
    documentId: source.documentId,
    documentRole: source.sourceKind,
    ...(source.chapterId ? { chapterId: source.chapterId } : {}),
    unitId: node.unitId,
    nodeId: node.nodeId,
    start: match.start,
    end: match.end,
    startOffset: match.start,
    endOffset: match.end,
    exact: match.text,
    sourceRevision: source.sourceRevision,
    documentRevision: source.documentRevision,
    unitRevision: node.unitRevision,
    nodeRevision: node.nodeRevision
  }
  const excerpt = excerptFor(node.text, match.start, match.end)
  return {
    id: findingId(target, query, match.text),
    kind: 'search',
    target,
    reason: `匹配“${query}”`,
    evidenceRefs: source.sourceKind === 'manuscript'
      ? [`chapter:${source.chapterId}`, `unit:${source.chapterId}:${node.unitId}`, `node:${source.chapterId}:${node.nodeId}`]
      : [`exploration:${source.documentId}`, `unit:${source.documentId}:${node.unitId}`, `node:${source.documentId}:${node.nodeId}`],
    confidence: 1,
    status: 'open',
    display: {
      title: source.title,
      sourceLabel: source.sourceKind === 'manuscript' ? '正文' : '构思',
      position: source.sourceKind === 'manuscript'
        ? `第 ${node.unitIndex + 1} 个写作单元 · 第 ${node.nodeIndex + 1} 段`
        : `第 ${node.nodeIndex + 1} 段`,
      matchedText: match.text,
      ...excerpt
    }
  }
}

function explorationTitleFindings(source, query) {
  return literalMatches(source.titleText, query).map((match) => {
    const target = {
      projectId: source.projectId,
      sourceKind: 'exploration',
      sourceId: source.sourceId,
      documentId: source.documentId,
      documentRole: 'exploration',
      field: 'title',
      start: match.start,
      end: match.end,
      startOffset: match.start,
      endOffset: match.end,
      exact: match.text,
      sourceRevision: source.sourceRevision,
      documentRevision: source.documentRevision
    }
    return {
      id: findingId(target, query, match.text),
      kind: 'search',
      target,
      reason: `匹配“${query}”`,
      evidenceRefs: [`exploration:${source.documentId}`],
      confidence: 1,
      status: 'open',
      display: {
        title: source.title,
        sourceLabel: '构思',
        position: '标题',
        matchedText: match.text,
        ...excerptFor(source.titleText, match.start, match.end)
      }
    }
  })
}

function worldbookFindings(source, query) {
  return source.fields.flatMap((field) => literalMatches(field.text, query).map((match) => {
    const target = {
      projectId: source.projectId,
      sourceKind: 'worldbook-entry',
      sourceId: source.sourceId,
      worldbookId: source.worldbookId,
      entryId: source.entryId,
      field: field.field,
      fieldIndex: field.fieldIndex,
      start: match.start,
      end: match.end,
      startOffset: match.start,
      endOffset: match.end,
      exact: match.text,
      sourceRevision: source.sourceRevision
    }
    return {
      id: findingId(target, query, match.text),
      kind: 'search',
      target,
      reason: `匹配“${query}”`,
      evidenceRefs: [`worldbook-entry:${source.entryId}`],
      confidence: 1,
      status: 'open',
      display: {
        title: source.title,
        sourceLabel: '设定',
        position: field.label,
        matchedText: match.text,
        ...excerptFor(field.text, match.start, match.end)
      }
    }
  }))
}

function withProject(source, projectId) {
  return source.projectId === projectId ? source : { ...source, projectId }
}

export function searchAuthoringPositionIndex(index, {
  query,
  scope = 'current-chapter',
  currentChapterId = '',
  limit = 500
} = {}) {
  if (!index?.ok || index.schemaVersion !== AUTHORING_SEARCH_INDEX_SCHEMA_VERSION) {
    return resultError('index-invalid')
  }
  const normalizedQuery = normalizeQuery(query)
  const normalizedScope = normalizeScope(scope)
  if (!normalizedScope) return resultError('scope-invalid')
  if (!normalizedQuery) {
    return deepFreeze({
      ok: true,
      query: '',
      scope: normalizedScope,
      indexRevision: index.indexRevision,
      findings: [],
      total: 0,
      truncated: false
    })
  }

  let sources = []
  if (normalizedScope === 'current-chapter') {
    const chapterId = text(currentChapterId)
    const source = index.manuscripts.find((item) => item.chapterId === chapterId)
    if (!source) return resultError('current-chapter-missing')
    sources = [source]
  } else if (normalizedScope === 'manuscript') sources = index.manuscripts
  else if (normalizedScope === 'exploration') sources = index.explorations

  let findings
  if (normalizedScope === 'worldbook') {
    findings = index.worldbookEntries.flatMap((source) => worldbookFindings(withProject(source, index.projectId), normalizedQuery))
  } else {
    findings = sources.flatMap((rawSource) => {
      const source = withProject(rawSource, index.projectId)
      const body = source.nodes.flatMap((node) => literalMatches(node.text, normalizedQuery)
        .map((match) => documentFinding(source, node, match, normalizedQuery)))
      return source.sourceKind === 'exploration'
        ? [...explorationTitleFindings(source, normalizedQuery), ...body]
        : body
    })
  }

  const safeLimit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(limit) || 500))
  return deepFreeze({
    ok: true,
    query: normalizedQuery,
    scope: normalizedScope,
    indexRevision: index.indexRevision,
    findings: findings.slice(0, safeLimit),
    total: findings.length,
    truncated: findings.length > safeLimit
  })
}

function findDocumentSource(index, target) {
  return index.documents.find((source) => (
    source.sourceKind === target.sourceKind && source.sourceId === target.sourceId
  )) || null
}

function worldbookFieldText(source, target) {
  return source?.fields.find((field) => (
    field.field === target.field && Number(field.fieldIndex || 0) === Number(target.fieldIndex || 0)
  ))?.text ?? null
}

export function reconcileAuthoringSearchFinding(index, finding) {
  const target = finding?.target
  if (!index?.ok || !target || finding?.kind !== 'search') return { fresh: false, reason: 'finding-invalid' }
  if (text(target.projectId) !== index.projectId) return { fresh: false, reason: 'project-mismatch' }
  const expectedText = typeof target.exact === 'string'
    ? target.exact
    : String(finding.display?.matchedText || '')
  if (!expectedText) return { fresh: false, reason: 'finding-invalid' }

  if (target.sourceKind === 'worldbook-entry') {
    const source = index.worldbookEntries.find((item) => (
      item.entryId === text(target.entryId) && item.worldbookId === text(target.worldbookId)
    ))
    if (!source) return { fresh: false, reason: 'source-missing' }
    if (source.sourceRevision !== target.sourceRevision) return { fresh: false, reason: 'source-revision-changed' }
    const value = worldbookFieldText(source, target)
    if (value == null) return { fresh: false, reason: 'field-missing' }
    if (value.slice(Number(target.startOffset ?? target.start), Number(target.endOffset ?? target.end)) !== expectedText) {
      return { fresh: false, reason: 'matched-text-changed' }
    }
    return { fresh: true, reason: 'fresh', target }
  }

  const source = findDocumentSource(index, target)
  if (!source) return { fresh: false, reason: 'source-missing' }
  if (source.sourceRevision !== target.sourceRevision
    || Number(source.documentRevision) !== Number(target.documentRevision)) {
    return { fresh: false, reason: 'source-revision-changed' }
  }
  if (target.field === 'title') {
    if (source.titleText.slice(Number(target.startOffset ?? target.start), Number(target.endOffset ?? target.end)) !== expectedText) {
      return { fresh: false, reason: 'matched-text-changed' }
    }
    return { fresh: true, reason: 'fresh', target }
  }
  const node = source.nodes.find((item) => item.unitId === target.unitId && item.nodeId === target.nodeId)
  if (!node) return { fresh: false, reason: 'target-missing' }
  if (Number(node.unitRevision) !== Number(target.unitRevision)
    || Number(node.nodeRevision) !== Number(target.nodeRevision)) {
    return { fresh: false, reason: 'target-revision-changed' }
  }
  const start = Number(target.startOffset ?? target.start)
  const end = Number(target.endOffset ?? target.end)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return { fresh: false, reason: 'range-invalid' }
  }
  if (node.text.slice(start, end) !== expectedText) {
    return { fresh: false, reason: 'matched-text-changed' }
  }
  return { fresh: true, reason: 'fresh', target }
}

function marksKey(value) {
  return JSON.stringify(list(value))
}

function mergeInlineContent(content) {
  const merged = []
  for (const item of content) {
    if (!item || item.type !== 'text' || typeof item.text !== 'string' || !item.text) continue
    const previous = merged.at(-1)
    if (previous && marksKey(previous.marks) === marksKey(item.marks)) previous.text += item.text
    else merged.push(clone(item))
  }
  return merged
}

function splitInlineContent(content, offset) {
  const before = []
  const after = []
  let cursor = 0
  for (const item of list(content)) {
    if (item?.type !== 'text' || typeof item.text !== 'string') return null
    const end = cursor + item.text.length
    if (offset <= cursor) after.push(clone(item))
    else if (offset >= end) before.push(clone(item))
    else {
      const local = offset - cursor
      if (local > 0) before.push({ ...clone(item), text: item.text.slice(0, local) })
      if (local < item.text.length) after.push({ ...clone(item), text: item.text.slice(local) })
    }
    cursor = end
  }
  if (offset < 0 || offset > cursor) return null
  return [before, after]
}

function sharedMarks(content) {
  const textItems = list(content).filter((item) => item?.type === 'text' && item.text)
  if (!textItems.length) return []
  const first = list(textItems[0].marks)
  return first.filter((mark) => textItems.every((item) => (
    list(item.marks).some((candidate) => JSON.stringify(candidate) === JSON.stringify(mark))
  )))
}

function applyInlinePatches(content, patches) {
  let next = mergeInlineContent(content)
  const ordered = [...patches].sort((left, right) => right.start - left.start)
  for (const patch of ordered) {
    const first = splitInlineContent(next, patch.start)
    if (!first) return null
    const second = splitInlineContent(first[1], patch.end - patch.start)
    if (!second) return null
    const insertion = patch.replacement
      ? [{ type: 'text', text: patch.replacement, ...(sharedMarks(second[0]).length ? { marks: sharedMarks(second[0]) } : {}) }]
      : []
    next = mergeInlineContent([...first[0], ...insertion, ...second[1]])
  }
  return next
}

function validatePatchGroups(document, patches) {
  const nodeLocations = new Map()
  list(document?.content).forEach((unit, unitIndex) => {
    list(unit?.content).forEach((node, nodeIndex) => {
      nodeLocations.set(text(node?.attrs?.nodeId), { unit, unitIndex, node, nodeIndex })
    })
  })
  const grouped = new Map()
  for (const patch of patches) {
    const nodeId = text(patch?.nodeId)
    const location = nodeLocations.get(nodeId)
    if (!nodeId || !location || text(location.unit?.attrs?.unitId) !== text(patch?.unitId)) {
      return resultError('replace-target-missing')
    }
    if (!SEARCHABLE_DOCUMENT_NODE_KINDS.has(text(location.node?.attrs?.kind))) {
      return resultError('replace-target-not-text')
    }
    if (Number(location.unit?.attrs?.unitRevision || 0) !== Number(patch?.unitRevision)
      || Number(location.node?.attrs?.nodeRevision || 0) !== Number(patch?.nodeRevision)) {
      return resultError('replace-target-stale')
    }
    const sourceText = String(getNodePlainText(location.node) || '')
    const start = Number(patch?.start)
    const end = Number(patch?.end)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceText.length) {
      return resultError('replace-range-invalid')
    }
    if (sourceText.slice(start, end) !== String(patch?.expectedText || '')) {
      return resultError('replace-text-stale')
    }
    const entry = { ...patch, start, end, replacement: String(patch?.replacement ?? ''), location }
    const values = grouped.get(nodeId) || []
    values.push(entry)
    grouped.set(nodeId, values)
  }
  for (const values of grouped.values()) {
    const ordered = [...values].sort((left, right) => left.start - right.start)
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].start < ordered[index - 1].end) return resultError('replace-ranges-overlap')
    }
  }
  return { ok: true, grouped }
}

/** Apply validated node-local patches to one canonical document without a UI editor. */
export function applyWritingDocumentTextPatches(document, patches, { now = new Date().toISOString() } = {}) {
  if (!validateWritingDocument(document).valid || !list(patches).length) return resultError('replace-document-invalid')
  if (patches.some((patch) => /[\r\n]/.test(String(patch?.replacement ?? '')))) {
    return resultError('replace-multiline-unsupported')
  }
  const validation = validatePatchGroups(document, patches)
  if (!validation.ok) return validation
  const nextDocument = clone(document)
  const changedUnits = new Set()
  const changedNodes = []
  for (const [nodeId, values] of validation.grouped) {
    const unit = list(nextDocument.content).find((item) => text(item?.attrs?.unitId) === text(values[0].unitId))
    const nodeIndex = list(unit?.content).findIndex((item) => text(item?.attrs?.nodeId) === nodeId)
    if (!unit || nodeIndex < 0) return resultError('replace-target-missing')
    const node = unit.content[nodeIndex]
    const beforeText = String(getNodePlainText(node) || '')
    const nextContent = applyInlinePatches(node.content, values)
    if (!nextContent) return resultError('replace-inline-content-invalid')
    const changed = markWritingNodeChanged(node, nextContent)
    unit.content[nodeIndex] = changed
    changedUnits.add(text(unit.attrs?.unitId))
    changedNodes.push({
      unitId: text(unit.attrs?.unitId),
      nodeId,
      beforeText,
      afterText: String(getNodePlainText(changed) || ''),
      beforeRevision: Number(node.attrs?.nodeRevision || 0),
      afterRevision: Number(changed.attrs?.nodeRevision || 0)
    })
  }
  list(nextDocument.content).forEach((unit) => {
    if (!changedUnits.has(text(unit?.attrs?.unitId))) return
    unit.attrs = { ...unit.attrs, unitRevision: Number(unit.attrs?.unitRevision || 0) + 1 }
  })
  nextDocument.revision = Number(document.revision || 0) + 1
  nextDocument.updatedAt = String(now)
  const finalValidation = validateWritingDocument(nextDocument)
  if (!finalValidation.valid) return resultError('replace-document-invalid', { errors: finalValidation.errors })
  return {
    ok: true,
    document: nextDocument,
    changedUnitIds: [...changedUnits],
    changedNodes
  }
}

export function createAuthoringReplacePlan({
  index,
  query,
  replacement = '',
  scope = 'current-chapter',
  currentChapterId = '',
  findings = null,
  expectedTotal = null
} = {}) {
  if (!index?.ok) return resultError('index-invalid')
  const normalizedScope = normalizeScope(scope)
  if (!normalizedScope) return resultError('scope-invalid')
  if (!MANUSCRIPT_SCOPES.has(normalizedScope)) return resultError('replace-scope-read-only')
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return resultError('replace-query-empty')
  const replacementText = String(replacement ?? '')
  if (/[\r\n]/.test(replacementText)) return resultError('replace-multiline-unsupported')

  const search = searchAuthoringPositionIndex(index, {
    query: normalizedQuery,
    scope: normalizedScope,
    currentChapterId,
    limit: MAX_SEARCH_RESULTS
  })
  if (!search.ok) return search
  const selected = Array.isArray(findings) ? findings : search.findings
  if (expectedTotal != null && Number(expectedTotal) !== selected.length) return resultError('replace-preview-incomplete')
  if (!selected.length) return resultError('replace-no-matches')
  if (!Array.isArray(findings) && search.truncated) return resultError('replace-preview-incomplete')

  const seen = new Set()
  const patches = []
  for (const finding of selected) {
    if (finding?.target?.sourceKind !== 'manuscript') return resultError('replace-target-read-only')
    const freshness = reconcileAuthoringSearchFinding(index, finding)
    if (!freshness.fresh) return resultError('replace-finding-stale', { findingId: finding?.id, staleReason: freshness.reason })
    const start = Number(finding.target.startOffset ?? finding.target.start)
    const end = Number(finding.target.endOffset ?? finding.target.end)
    const expectedText = finding.target.exact ?? finding.display?.matchedText ?? ''
    if (String(expectedText) === replacementText) continue
    const fingerprint = [finding.target.chapterId, finding.target.nodeId, start, end].join(':')
    if (seen.has(fingerprint)) return resultError('replace-target-duplicate')
    seen.add(fingerprint)
    patches.push({
      findingId: finding.id,
      chapterId: finding.target.chapterId,
      documentId: finding.target.documentId,
      unitId: finding.target.unitId,
      nodeId: finding.target.nodeId,
      start,
      end,
      expectedText: String(expectedText),
      replacement: replacementText,
      sourceRevision: finding.target.sourceRevision,
      documentRevision: Number(finding.target.documentRevision),
      unitRevision: Number(finding.target.unitRevision),
      nodeRevision: Number(finding.target.nodeRevision)
    })
  }
  if (!patches.length) return resultError('replace-no-change')

  const chapterMap = new Map()
  patches.forEach((patch) => {
    const values = chapterMap.get(patch.chapterId) || []
    values.push(patch)
    chapterMap.set(patch.chapterId, values)
  })
  const chapters = [...chapterMap.entries()]
    .map(([chapterId, chapterPatches]) => {
      const source = index.manuscripts.find((item) => item.chapterId === chapterId)
      return {
        chapterId,
        sourceRevision: source?.sourceRevision || '',
        documentRevision: Number(source?.documentRevision || 0),
        patches: chapterPatches.sort((left, right) => (
          left.nodeId === right.nodeId ? right.start - left.start : left.nodeId.localeCompare(right.nodeId)
        ))
      }
    })
    .sort((left, right) => {
      const leftOrder = index.manuscripts.find((item) => item.chapterId === left.chapterId)?.chapterOrder ?? 0
      const rightOrder = index.manuscripts.find((item) => item.chapterId === right.chapterId)?.chapterOrder ?? 0
      return leftOrder - rightOrder
    })

  const body = {
    schemaVersion: 1,
    projectId: index.projectId,
    scope: normalizedScope,
    query: normalizedQuery,
    replacement: replacementText,
    indexRevision: index.indexRevision,
    manuscriptRevision: index.manuscriptRevision,
    chapterOrderRevision: index.chapterOrderRevision,
    chapterCount: chapters.length,
    matchCount: patches.length,
    chapters
  }
  return deepFreeze({ ok: true, plan: { ...body, id: `authoring-replace-${stableHash(body)}` } })
}

function countManuscriptWords(document) {
  const body = getWritingDocumentPlainText(document)
  return (body.match(/[一-龥]/g) || []).length + (body.match(/[a-zA-Z]+/g) || []).length
}

function validateReplacePlan(plan) {
  if (!plan || Number(plan.schemaVersion) !== 1 || !MANUSCRIPT_SCOPES.has(plan.scope)) {
    return resultError('replace-plan-invalid')
  }
  const chapters = list(plan.chapters)
  if (!text(plan.projectId) || !text(plan.query) || !chapters.length
    || Number(plan.chapterCount) !== chapters.length) {
    return resultError('replace-plan-invalid')
  }
  const chapterIds = new Set()
  const patchIds = new Set()
  let patchCount = 0
  for (const chapter of chapters) {
    const chapterId = text(chapter?.chapterId)
    if (!chapterId || chapterIds.has(chapterId) || !list(chapter?.patches).length) {
      return resultError('replace-plan-invalid')
    }
    chapterIds.add(chapterId)
    for (const patch of chapter.patches) {
      const patchId = text(patch?.findingId)
      if (!patchId || patchIds.has(patchId) || text(patch?.chapterId) !== chapterId
        || String(patch?.replacement ?? '') !== String(plan.replacement ?? '')) {
        return resultError('replace-plan-invalid')
      }
      patchIds.add(patchId)
      patchCount += 1
    }
  }
  if (patchCount !== Number(plan.matchCount) || (plan.scope === 'current-chapter' && chapters.length !== 1)) {
    return resultError('replace-plan-invalid')
  }
  return { ok: true }
}

/**
 * Apply a complete replace plan to a cloned book. The caller owns persistence;
 * no localStorage or page state is touched here.
 */
export function applyAuthoringReplacePlan({
  book,
  index,
  plan,
  now = new Date().toISOString()
} = {}) {
  const planValidation = validateReplacePlan(plan)
  if (!planValidation.ok) return planValidation
  if (!plan || !book || text(book?.id) !== text(plan?.projectId)) return resultError('replace-project-mismatch')
  if (!index?.ok || index.projectId !== text(plan.projectId)) return resultError('index-invalid')
  if (index.manuscriptRevision !== plan.manuscriptRevision
    || index.chapterOrderRevision !== plan.chapterOrderRevision) {
    return resultError('replace-plan-stale')
  }
  const liveIndex = buildAuthoringPositionIndex({ projectId: plan.projectId, book })
  if (!liveIndex.ok
    || liveIndex.manuscriptRevision !== plan.manuscriptRevision
    || liveIndex.chapterOrderRevision !== plan.chapterOrderRevision) {
    return resultError('replace-plan-stale')
  }

  // Validate every chapter and every range before cloning/mutating any chapter.
  for (const chapterPlan of list(plan.chapters)) {
    const source = liveIndex.manuscripts.find((item) => item.chapterId === text(chapterPlan?.chapterId))
    if (!source
      || source.sourceRevision !== chapterPlan.sourceRevision
      || Number(source.documentRevision) !== Number(chapterPlan.documentRevision)) {
      return resultError('replace-plan-stale', { chapterId: chapterPlan?.chapterId })
    }
    const validation = validatePatchGroups(source.document, chapterPlan.patches)
    if (!validation.ok) return validation
  }

  const nextBook = clone(book)
  if (!nextBook) return resultError('replace-book-clone-failed')
  const receiptChapters = []
  const affectedUnitRefs = new Set()
  for (const chapterPlan of list(plan.chapters)) {
    const chapter = list(nextBook.chapters).find((item) => text(item?.id) === text(chapterPlan.chapterId))
    const source = liveIndex.manuscripts.find((item) => item.chapterId === text(chapterPlan.chapterId))
    if (!chapter || !source) return resultError('replace-target-missing')
    const applied = applyWritingDocumentTextPatches(source.document, chapterPlan.patches, { now })
    if (!applied.ok) return applied
    const previousDocument = source.document
    const nextDocument = applied.document
    const markdown = getWritingDocumentMarkdown(nextDocument)
    chapter.editorDocument = nextDocument
    chapter.editorDocumentSchemaVersion = Number(nextDocument.schemaVersion || 3)
    chapter.content = markdown
    chapter.contentFormat = 'md'
    chapter.wordCount = countManuscriptWords(nextDocument)
    chapter.annotations = reconcileWritingAnnotations(
      chapter.annotations,
      nextDocument,
      chapter.id,
      previousDocument
    )
    chapter.updatedAt = String(now)
    applied.changedUnitIds.forEach((unitId) => affectedUnitRefs.add(`unit:${chapter.id}:${unitId}`))
    receiptChapters.push({
      chapterId: text(chapter.id),
      beforeDocumentRevision: Number(previousDocument.revision || 0),
      afterDocumentRevision: Number(nextDocument.revision || 0),
      changedUnitIds: applied.changedUnitIds,
      changedNodes: applied.changedNodes
    })
  }
  nextBook.updatedAt = String(now)
  const receipt = deepFreeze({
    id: `authoring-replace-receipt-${stableHash({ planId: plan.id, now, chapters: receiptChapters })}`,
    planId: plan.id,
    projectId: plan.projectId,
    chapterCount: receiptChapters.length,
    matchCount: Number(plan.matchCount || 0),
    affectedUnitRefs: [...affectedUnitRefs],
    chapters: receiptChapters,
    committedAt: String(now)
  })
  return { ok: true, nextBook, receipt }
}
