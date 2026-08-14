const ANNOTATION_SCHEMA_VERSION = 2
const MAX_CONTEXT_CHARS = 48
const SEVERITIES = new Set(['low', 'medium', 'high'])

function now() {
  return new Date().toISOString()
}

function makeId(prefix = 'annotation') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function asText(value) {
  return String(value == null ? '' : value)
}

function getNodeText(node) {
  return (node?.content || []).map((item) => item?.text || '').join('')
}

function getBlock(document, blockId) {
  return (document?.content || []).find((node) => node?.attrs?.blockId === blockId) || null
}

function findAll(text, needle) {
  const result = []
  if (!needle) return result
  let cursor = 0
  while (cursor <= text.length) {
    const index = text.indexOf(needle, cursor)
    if (index < 0) break
    result.push(index)
    cursor = index + Math.max(1, needle.length)
  }
  return result
}

function matchesContext(text, index, selector) {
  const prefix = asText(selector?.prefix)
  const suffix = asText(selector?.suffix)
  const before = text.slice(Math.max(0, index - prefix.length), index)
  const after = text.slice(index + asText(selector?.exact).length, index + asText(selector?.exact).length + suffix.length)
  return (!prefix || before === prefix) && (!suffix || after === suffix)
}

export function createWritingSelector({ text, start = 0, end = start, fullText = '' }) {
  const source = asText(fullText)
  const exact = asText(text) || source.slice(start, end)
  const safeStart = Math.max(0, Number(start) || 0)
  const safeEnd = Math.max(safeStart, Number(end) || safeStart + exact.length)
  return {
    start: safeStart,
    end: safeEnd,
    exact,
    prefix: source.slice(Math.max(0, safeStart - MAX_CONTEXT_CHARS), safeStart),
    suffix: source.slice(safeEnd, safeEnd + MAX_CONTEXT_CHARS)
  }
}

export function resolveAnnotationLaneLayout(items, { gap = 12, minTop = 0 } = {}) {
  const positioned = (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: String(item?.id || ''),
      height: Math.max(1, Number(item?.height) || 1),
      desiredCenter: Number(item?.desiredCenter),
      anchored: Number.isFinite(Number(item?.desiredCenter)),
      index
    }))
    .filter((item) => item.id)
    .sort((left, right) => {
      if (left.anchored !== right.anchored) return left.anchored ? -1 : 1
      if (!left.anchored) return left.index - right.index
      return left.desiredCenter - right.desiredCenter || left.index - right.index
    })

  const layout = {}
  let cursor = Math.max(0, Number(minTop) || 0)
  for (const item of positioned) {
    const idealTop = item.anchored ? item.desiredCenter - item.height / 2 : cursor
    const top = Math.max(cursor, idealTop, Number(minTop) || 0)
    layout[item.id] = {
      top,
      height: item.height,
      anchored: item.anchored,
      anchorOffset: item.anchored ? item.desiredCenter - (top + item.height / 2) : 0
    }
    cursor = top + item.height + Math.max(0, Number(gap) || 0)
  }
  return layout
}

export function resolveSelectionActionPosition(anchor, {
  viewportWidth = 0,
  viewportHeight = 0,
  width = 132,
  height = 34,
  gap = 8,
  margin = 10,
  scale = 1
} = {}) {
  if (!anchor || !viewportWidth || !viewportHeight) return null
  const safeWidth = Math.max(1, Number(width) || 132)
  const safeHeight = Math.max(1, Number(height) || 34)
  const safeGap = Math.max(0, Number(gap) || 0)
  const safeMargin = Math.max(0, Number(margin) || 0)
  const safeScale = Math.max(0.1, Number(scale) || 1)
  const visualWidth = safeWidth * safeScale
  const visualHeight = safeHeight * safeScale
  const anchorLeft = Number(anchor.left) || 0
  const anchorRight = Number(anchor.right) || anchorLeft
  const anchorTop = Number(anchor.top) || 0
  const anchorBottom = Number(anchor.bottom) || anchorTop
  let left = anchorRight + safeGap
  let top = anchorBottom + safeGap

  if (left + visualWidth > viewportWidth - safeMargin) left = anchorLeft - visualWidth - safeGap
  if (top + visualHeight > viewportHeight - safeMargin) top = anchorTop - visualHeight - safeGap

  return {
    left: Math.round(Math.max(safeMargin, Math.min(left, viewportWidth - visualWidth - safeMargin)) / safeScale),
    top: Math.round(Math.max(safeMargin, Math.min(top, viewportHeight - visualHeight - safeMargin)) / safeScale)
  }
}

export function createWritingAnnotation({
  chapterId,
  blockId,
  blockRevision = 0,
  selector,
  range = null,
  kind = 'comment',
  body = '',
  createdBy = 'user',
  parentId = null,
  reviewType = null,
  severity = null,
  reviewBatchId = null
} = {}) {
  const timestamp = now()
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    id: makeId(),
    chapterId: chapterId || null,
    blockId: blockId || range?.start?.blockId || null,
    blockRevision: Number(blockRevision || range?.start?.blockRevision) || 0,
    selector: selector ? { ...selector } : undefined,
    ...(range ? { range: normalizeWritingRange(range) } : {}),
    kind,
    ...(reviewType ? { reviewType: asText(reviewType) } : {}),
    ...(severity ? { severity: asText(severity) } : {}),
    ...(reviewBatchId ? { reviewBatchId: asText(reviewBatchId) } : {}),
    body: asText(body).trim(),
    status: 'open',
    parentId: parentId || undefined,
    createdBy,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function updateWritingAnnotationBody(annotations, annotationId, body) {
  const nextBody = asText(body).trim()
  if (!nextBody || !annotationId) return Array.isArray(annotations) ? annotations : []
  const timestamp = now()
  return (Array.isArray(annotations) ? annotations : []).map((annotation) => (
    annotation?.id === annotationId
      ? { ...annotation, body: nextBody, updatedAt: timestamp }
      : annotation
  ))
}

export function deleteWritingAnnotation(annotations, annotationId) {
  if (!annotationId) return normalizeWritingAnnotations(annotations)
  const list = normalizeWritingAnnotations(annotations)
  const removedIds = new Set([annotationId])
  let changed = true

  while (changed) {
    changed = false
    list.forEach((annotation) => {
      if (annotation.parentId && removedIds.has(annotation.parentId) && !removedIds.has(annotation.id)) {
        removedIds.add(annotation.id)
        changed = true
      }
    })
  }

  return list.filter((annotation) => !removedIds.has(annotation.id))
}

function normalizeWritingRange(range) {
  if (!range || typeof range !== 'object') return null
  const start = range.start && typeof range.start === 'object' ? range.start : null
  const end = range.end && typeof range.end === 'object' ? range.end : null
  if (!start?.blockId || !end?.blockId) return null
  return {
    start: {
      blockId: asText(start.blockId),
      blockRevision: Number(start.blockRevision) || 0,
      offset: Math.max(0, Number(start.offset) || 0)
    },
    end: {
      blockId: asText(end.blockId),
      blockRevision: Number(end.blockRevision) || 0,
      offset: Math.max(0, Number(end.offset) || 0)
    },
    blockIds: Array.from(new Set((Array.isArray(range.blockIds) ? range.blockIds : [start.blockId, end.blockId])
      .map((id) => asText(id).trim())
      .filter(Boolean))),
    exact: asText(range.exact),
    startSelector: range.startSelector?.exact && typeof range.startSelector === 'object'
      ? { ...range.startSelector }
      : undefined,
    endSelector: range.endSelector?.exact && typeof range.endSelector === 'object'
      ? { ...range.endSelector }
      : undefined
  }
}

export function normalizeWritingAnnotation(annotation, chapterId = null) {
  if (!annotation || typeof annotation !== 'object') return null
  const body = asText(annotation.body).trim()
  const blockId = asText(annotation.blockId).trim()
  if (!body || !blockId) return null
  const status = ['open', 'resolved', 'orphaned'].includes(annotation.status)
    ? annotation.status
    : 'open'
  const selector = annotation.selector && typeof annotation.selector === 'object'
    ? {
        start: Math.max(0, Number(annotation.selector.start) || 0),
        end: Math.max(0, Number(annotation.selector.end) || 0),
        exact: asText(annotation.selector.exact),
        prefix: asText(annotation.selector.prefix),
        suffix: asText(annotation.selector.suffix)
      }
    : undefined
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    id: asText(annotation.id).trim() || makeId(),
    chapterId: annotation.chapterId || chapterId || null,
    blockId,
    blockRevision: Number(annotation.blockRevision) || 0,
    ...(selector ? { selector } : {}),
    ...(annotation.range ? { range: normalizeWritingRange(annotation.range) } : {}),
    kind: ['comment', 'rewrite-request', 'review-finding', 'locked-span'].includes(annotation.kind)
      ? annotation.kind
      : 'comment',
    ...(annotation.reviewType ? { reviewType: asText(annotation.reviewType) } : {}),
    ...(SEVERITIES.has(annotation.severity) ? { severity: annotation.severity } : {}),
    ...(annotation.reviewBatchId ? { reviewBatchId: asText(annotation.reviewBatchId) } : {}),
    body,
    status,
    ...(annotation.parentId ? { parentId: annotation.parentId } : {}),
    createdBy: annotation.createdBy === 'agent' ? 'agent' : 'user',
    createdAt: annotation.createdAt || now(),
    updatedAt: annotation.updatedAt || annotation.createdAt || now()
  }
}

function resolveSelectorInBlock(block, selector) {
  if (!block || !selector?.exact) return -1
  const blockText = getNodeText(block.node || block)
  const exact = selector.exact
  const exactPositions = findAll(blockText, exact)
  const contextual = exactPositions.filter((index) => matchesContext(blockText, index, selector))
  const candidates = contextual.length ? contextual : exactPositions
  return candidates.length === 1
    ? candidates[0]
    : exactPositions.includes(Number(selector.start)) && matchesContext(blockText, Number(selector.start), selector)
      ? Number(selector.start)
      : -1
}

function buildRangeExact(blocks, startIndex, endIndex, startOffset, endOffset) {
  if (startIndex === endIndex) {
    return blocks[startIndex].text.slice(startOffset, endOffset)
  }
  return [
    blocks[startIndex].text.slice(startOffset),
    ...blocks.slice(startIndex + 1, endIndex).map((block) => block.text),
    blocks[endIndex].text.slice(0, endOffset)
  ].join('\n')
}

function resolveRangeAnnotation(annotation, document) {
  const range = annotation.range
  const blocks = getDocumentBlocks(document)
  const startIndex = blocks.findIndex((block) => block.blockId === range.start.blockId)
  const endIndex = blocks.findIndex((block) => block.blockId === range.end.blockId)
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    return { ...annotation, status: 'orphaned', resolution: 'missing-range-block' }
  }

  const startBlock = blocks[startIndex]
  const endBlock = blocks[endIndex]
  const startOffset = range.startSelector?.exact
    ? resolveSelectorInBlock(startBlock, range.startSelector)
    : Number(range.start.offset)
  const endSelectorStart = range.endSelector?.exact
    ? resolveSelectorInBlock(endBlock, range.endSelector)
    : Math.max(0, Number(range.end.offset) - String(range.exact || '').length)
  const endOffset = range.endSelector?.exact
    ? endSelectorStart + range.endSelector.exact.length
    : Number(range.end.offset)

  if (startOffset < 0 || endOffset < 0 || startOffset > startBlock.text.length || endOffset > endBlock.text.length) {
    return { ...annotation, status: 'orphaned', resolution: 'range-quote-not-found' }
  }
  if (startIndex === endIndex && endOffset < startOffset) {
    return { ...annotation, status: 'orphaned', resolution: 'range-order-invalid' }
  }

  const currentBlockIds = blocks.slice(startIndex, endIndex + 1).map((block) => block.blockId)
  const exact = buildRangeExact(blocks, startIndex, endIndex, startOffset, endOffset)
  const startSelector = createWritingSelector({
    text: range.startSelector?.exact || startBlock.text.slice(startOffset, Math.min(startOffset + 48, startBlock.text.length)),
    start: startOffset,
    end: startOffset + (range.startSelector?.exact?.length || Math.min(48, startBlock.text.length - startOffset)),
    fullText: startBlock.text
  })
  const endSelector = createWritingSelector({
    text: range.endSelector?.exact || endBlock.text.slice(Math.max(0, endOffset - 48), endOffset),
    start: Math.max(0, endOffset - (range.endSelector?.exact?.length || Math.min(48, endOffset))),
    end: endOffset,
    fullText: endBlock.text
  })

  return {
    ...annotation,
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    blockId: startBlock.blockId,
    blockRevision: Number(startBlock.node?.attrs?.revision) || 0,
    selector: startSelector,
    range: {
      ...range,
      start: { ...range.start, offset: startOffset, blockRevision: Number(startBlock.node?.attrs?.revision) || 0 },
      end: { ...range.end, offset: endOffset, blockRevision: Number(endBlock.node?.attrs?.revision) || 0 },
      blockIds: currentBlockIds,
      exact,
      startSelector,
      endSelector
    },
    status: annotation.status === 'resolved' ? 'resolved' : 'open',
    resolution: startIndex === endIndex ? 'block-quote' : 'cross-block-range'
  }
}

export function normalizeWritingAnnotations(annotations, chapterId = null) {
  const seen = new Set()
  return (Array.isArray(annotations) ? annotations : [])
    .map((annotation) => normalizeWritingAnnotation(annotation, chapterId))
    .filter((annotation) => {
      if (!annotation || seen.has(annotation.id)) return false
      seen.add(annotation.id)
      return true
    })
}

export function resolveWritingAnnotation(annotation, document) {
  const normalized = normalizeWritingAnnotation(annotation, annotation?.chapterId)
  if (!normalized) return null
  if (normalized.range) return resolveRangeAnnotation(normalized, document)
  const block = getBlock(document, normalized.blockId)
  const blockText = getNodeText(block)
  const selector = normalized.selector
  if (!block || !selector?.exact) {
    return { ...normalized, status: 'orphaned', resolution: 'missing-block-or-selector' }
  }

  const exact = selector.exact
  const exactPositions = findAll(blockText, exact)
  const contextual = exactPositions.filter((index) => matchesContext(blockText, index, selector))
  const candidates = contextual.length ? contextual : exactPositions
  const start = candidates.length === 1
    ? candidates[0]
    : exactPositions.includes(selector.start) && matchesContext(blockText, selector.start, selector)
      ? selector.start
      : -1

  if (start < 0) {
    return { ...normalized, status: 'orphaned', resolution: candidates.length ? 'ambiguous-quote' : 'quote-not-found' }
  }

  return {
    ...normalized,
    status: normalized.status === 'resolved' ? 'resolved' : 'open',
    blockRevision: Number(block.attrs?.revision) || 0,
    selector: createWritingSelector({ text: exact, start, end: start + exact.length, fullText: blockText }),
    resolution: 'block-quote'
  }
}

function getDocumentBlocks(document) {
  return (document?.content || [])
    .map((node, index) => ({
      node,
      index,
      blockId: node?.attrs?.blockId || null,
      text: getNodeText(node)
    }))
    .filter((block) => block.blockId)
}

function buildResolvedAnnotation(annotation, block, exact, start, resolution = 'migrated-quote') {
  const status = annotation.status === 'resolved' ? 'resolved' : 'open'
  return {
    ...annotation,
    blockId: block.blockId,
    blockRevision: Number(block.node?.attrs?.revision) || 0,
    selector: createWritingSelector({
      text: exact,
      start,
      end: start + exact.length,
      fullText: block.text
    }),
    status,
    resolution,
    updatedAt: now()
  }
}

function findUniqueQuoteMatches(exact, document) {
  const matches = []
  for (const block of getDocumentBlocks(document)) {
    for (const start of findAll(block.text, exact)) {
      matches.push({ block, start })
    }
  }
  return matches
}

function findSplitQuoteMatches(exact, document) {
  if (!exact) return []
  const blocks = getDocumentBlocks(document)
  const matches = []

  for (let index = 0; index < blocks.length - 1; index += 1) {
    const first = blocks[index]
    const second = blocks[index + 1]
    for (const start of findAll(first.text, exact.slice(0, 1))) {
      const firstPart = first.text.slice(start)
      if (!firstPart || !exact.startsWith(firstPart)) continue
      const secondPart = exact.slice(firstPart.length)
      if (!secondPart || !second.text.startsWith(secondPart)) continue
      matches.push({
        first,
        second,
        firstStart: start,
        firstExact: firstPart,
        secondExact: secondPart
      })
    }
  }
  return matches
}

function migrateAnnotation(annotation, document, previousDocument) {
  const current = resolveWritingAnnotation(annotation, document)
  if (current?.status !== 'orphaned' || !previousDocument) return [current || annotation]

  const exact = annotation.selector?.exact || ''
  if (!exact) return [current]

  const previousBlock = getBlock(previousDocument, annotation.blockId)
  if (!previousBlock) return [current]

  const uniqueMatches = findUniqueQuoteMatches(exact, document)
  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0]
    return [buildResolvedAnnotation(annotation, match.block, exact, match.start)]
  }

  const splitMatches = findSplitQuoteMatches(exact, document)
  if (splitMatches.length !== 1) return [current]

  const match = splitMatches[0]
  const parentId = annotation.parentId || annotation.id
  return [
    buildResolvedAnnotation(
      { ...annotation, id: `${annotation.id}-split-1`, parentId },
      match.first,
      match.firstExact,
      match.firstStart,
      'split-migrated-quote'
    ),
    buildResolvedAnnotation(
      { ...annotation, id: `${annotation.id}-split-2`, parentId },
      match.second,
      match.secondExact,
      0,
      'split-migrated-quote'
    )
  ]
}

export function reconcileWritingAnnotations(annotations, document, chapterId = null, previousDocument = null) {
  return normalizeWritingAnnotations(annotations, chapterId)
    .flatMap((annotation) => migrateAnnotation(annotation, document, previousDocument))
}

export function updateWritingAnnotationStatus(annotations, annotationId, status) {
  if (!['open', 'resolved', 'orphaned'].includes(status)) return normalizeWritingAnnotations(annotations)
  return normalizeWritingAnnotations(annotations).map((annotation) => (
    annotation.id === annotationId
      ? { ...annotation, status, updatedAt: now() }
      : annotation
  ))
}

export function getWritingAnnotationLabel(annotation) {
  if (annotation?.status === 'resolved') return '已解决'
  if (annotation?.status === 'orphaned') return '原文已变化'
  if (annotation?.kind === 'rewrite-request') return '改写要求'
  if (annotation?.kind === 'review-finding') return '审阅发现'
  if (annotation?.kind === 'locked-span') return '锁定片段'
  return '批注'
}

export function getWritingAnnotationBlock(document, annotation) {
  return getBlock(document, annotation?.blockId)
}
