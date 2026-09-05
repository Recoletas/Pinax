import { normalizeWritingWorldbookReferences } from './writingWorldbookReferences.js'

export const ANNOTATION_SCHEMA_VERSION = 3
const MAX_CONTEXT_CHARS = 48
const SEVERITIES = new Set(['low', 'medium', 'high'])

function now() {
  return new Date().toISOString()
}

function makeId(prefix = 'annotation') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function stableLegacyAnnotationId(annotation, chapterId, target, body) {
  const source = JSON.stringify({ chapterId: annotation?.chapterId || chapterId || '', target, body, createdAt: annotation?.createdAt || '' })
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `annotation-legacy-${(hash >>> 0).toString(36)}`
}

function asText(value) {
  return String(value == null ? '' : value)
}

function getNodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (node?.content || []).map(getNodeText).join('')
}

function documentNodes(document) {
  return (document?.content || []).flatMap((unit, unitIndex) => (
    (unit?.content || []).map((node, nodeIndex) => ({
      unit,
      node,
      unitIndex,
      nodeIndex,
      unitId: unit?.attrs?.unitId || null,
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      nodeId: node?.attrs?.nodeId || node?.attrs?.blockId || null,
      nodeRevision: Number(node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? 0),
      text: getNodeText(node)
    }))
  ))
}

function findNode(document, nodeId) {
  return documentNodes(document).find((item) => item.nodeId === nodeId) || null
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
  scale = 1,
  containerLeft = 0,
  containerRight = viewportWidth,
  containerTop = 0,
  containerBottom = viewportHeight
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
  const minLeft = Math.max(safeMargin, Number(containerLeft) || 0)
  const maxRight = Math.min(viewportWidth - safeMargin, Number(containerRight) || viewportWidth)
  const minTop = Math.max(safeMargin, Number(containerTop) || 0)
  const maxBottom = Math.min(viewportHeight - safeMargin, Number(containerBottom) || viewportHeight)
  // 选区工具优先悬在收束行上方，避免遮住下一行/下一段正文。
  let left = anchorRight - visualWidth / 2
  let top = anchorTop - visualHeight - safeGap

  if (top < minTop) top = anchorBottom + safeGap

  return {
    left: Math.round(Math.max(minLeft, Math.min(left, maxRight - visualWidth)) / safeScale),
    top: Math.round(Math.max(minTop, Math.min(top, maxBottom - visualHeight)) / safeScale)
  }
}

function normalizeTarget(target, document = null) {
  if (!target || typeof target !== 'object') return null
  const nodeId = asText(target.nodeId || target.blockId).trim()
  if (!nodeId) return null
  const location = document ? findNode(document, nodeId) : null
  return {
    unitId: asText(target.unitId || location?.unitId).trim() || null,
    unitRevision: Number.isFinite(Number(target.unitRevision))
      ? Number(target.unitRevision)
      : Number(location?.unitRevision || 0),
    nodeId,
    nodeRevision: Number.isFinite(Number(target.nodeRevision ?? target.blockRevision))
      ? Number(target.nodeRevision ?? target.blockRevision)
      : Number(location?.nodeRevision || 0),
    start: Math.max(0, Number(target.start ?? target.offset ?? 0) || 0),
    end: Math.max(
      Math.max(0, Number(target.start ?? target.offset ?? 0) || 0),
      Number(target.end ?? target.offset ?? 0) || 0
    )
  }
}

function normalizeWritingRange(range, document = null) {
  if (!range || typeof range !== 'object') return null
  const start = normalizeTarget(range.start, document)
  const end = normalizeTarget(range.end || range.start, document)
  if (!start || !end) return null
  return {
    start: { ...start, offset: Math.max(0, Number(range.start?.offset ?? start.start) || 0) },
    end: { ...end, offset: Math.max(0, Number(range.end?.offset ?? end.end) || 0) },
    nodeIds: Array.from(new Set((Array.isArray(range.nodeIds) ? range.nodeIds : [start.nodeId, end.nodeId])
      .map((id) => asText(id).trim())
      .filter(Boolean))),
    unitIds: Array.from(new Set((Array.isArray(range.unitIds) ? range.unitIds : [start.unitId, end.unitId])
      .map((id) => asText(id).trim())
      .filter(Boolean))),
    exact: asText(range.exact),
    startSelector: range.startSelector?.exact && typeof range.startSelector === 'object' ? { ...range.startSelector } : undefined,
    endSelector: range.endSelector?.exact && typeof range.endSelector === 'object' ? { ...range.endSelector } : undefined
  }
}

export function createWritingAnnotation({
  chapterId,
  target = null,
  unitId = null,
  unitRevision = 0,
  nodeId = null,
  nodeRevision = 0,
  blockId = null,
  blockRevision = 0,
  selector,
  range = null,
  kind = 'comment',
  body = '',
  createdBy = 'user',
  parentId = null,
  reviewType = null,
  severity = null,
  reviewBatchId = null,
  references = []
} = {}) {
  const timestamp = now()
  const normalizedTarget = normalizeTarget(target || {
    unitId,
    unitRevision,
    nodeId: nodeId || blockId,
    nodeRevision: nodeRevision || blockRevision,
    start: selector?.start || range?.start?.offset || 0,
    end: selector?.end || range?.end?.offset || 0
  })
  if (!normalizedTarget) return null
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    id: makeId(),
    chapterId: chapterId || null,
    target: normalizedTarget,
    selector: selector ? { ...selector } : undefined,
    ...(range ? { range: normalizeWritingRange(range) } : {}),
    kind,
    ...(reviewType ? { reviewType: asText(reviewType) } : {}),
    ...(severity ? { severity: asText(severity) } : {}),
    ...(reviewBatchId ? { reviewBatchId: asText(reviewBatchId) } : {}),
    ...(normalizeWritingWorldbookReferences(references).length
      ? { references: normalizeWritingWorldbookReferences(references) }
      : {}),
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
  if (!nextBody || !annotationId) return normalizeWritingAnnotations(annotations)
  const timestamp = now()
  return normalizeWritingAnnotations(annotations).map((annotation) => (
    annotation?.id === annotationId ? { ...annotation, body: nextBody, updatedAt: timestamp } : annotation
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

export function normalizeWritingAnnotation(annotation, chapterId = null, document = null) {
  if (!annotation || typeof annotation !== 'object') return null
  const body = asText(annotation.body).trim()
  if (!body) return null
  const target = normalizeTarget(annotation.target || {
    unitId: annotation.unitId,
    unitRevision: annotation.unitRevision,
    nodeId: annotation.nodeId || annotation.blockId,
    nodeRevision: annotation.nodeRevision ?? annotation.blockRevision,
    start: annotation.selector?.start || annotation.range?.start?.offset || 0,
    end: annotation.selector?.end || annotation.range?.end?.offset || 0
  }, document)
  if (!target) return null
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
    id: asText(annotation.id).trim() || stableLegacyAnnotationId(annotation, chapterId, target, body),
    chapterId: annotation.chapterId || chapterId || null,
    target,
    ...(selector ? { selector } : {}),
    ...(annotation.range ? { range: normalizeWritingRange(annotation.range, document) } : {}),
    kind: ['comment', 'rewrite-request', 'review-finding', 'locked-span'].includes(annotation.kind) ? annotation.kind : 'comment',
    ...(annotation.reviewType ? { reviewType: asText(annotation.reviewType) } : {}),
    ...(SEVERITIES.has(annotation.severity) ? { severity: annotation.severity } : {}),
    ...(annotation.reviewBatchId ? { reviewBatchId: asText(annotation.reviewBatchId) } : {}),
    ...(normalizeWritingWorldbookReferences(annotation.references).length
      ? { references: normalizeWritingWorldbookReferences(annotation.references) }
      : {}),
    body,
    status: ['open', 'resolved', 'orphaned'].includes(annotation.status) ? annotation.status : 'open',
    ...(annotation.parentId ? { parentId: annotation.parentId } : {}),
    createdBy: annotation.createdBy === 'agent' ? 'agent' : 'user',
    createdAt: annotation.createdAt || now(),
    updatedAt: annotation.updatedAt || annotation.createdAt || now()
  }
}

export function normalizeWritingAnnotations(annotations, chapterId = null, document = null) {
  const seen = new Set()
  return (Array.isArray(annotations) ? annotations : [])
    .map((annotation) => normalizeWritingAnnotation(annotation, chapterId, document))
    .filter((annotation) => {
      if (!annotation || seen.has(annotation.id)) return false
      seen.add(annotation.id)
      return true
    })
}

function resolveSelector(location, selector) {
  if (!location || !selector?.exact) return -1
  const positions = findAll(location.text, selector.exact)
  const contextual = positions.filter((index) => matchesContext(location.text, index, selector))
  const candidates = contextual.length ? contextual : positions
  return candidates.length === 1
    ? candidates[0]
    : positions.includes(Number(selector.start)) && matchesContext(location.text, Number(selector.start), selector)
      ? Number(selector.start)
      : -1
}

function pointFromLocation(location, offset) {
  const safeOffset = Math.max(0, Math.min(location.text.length, Number(offset) || 0))
  return {
    unitId: location.unitId,
    unitRevision: location.unitRevision,
    nodeId: location.nodeId,
    nodeRevision: location.nodeRevision,
    start: safeOffset,
    end: safeOffset,
    offset: safeOffset
  }
}

function rangeSlice(document, startLocation, endLocation, startOffset, endOffset) {
  const nodes = documentNodes(document)
  const startIndex = nodes.findIndex((item) => item.nodeId === startLocation.nodeId)
  const endIndex = nodes.findIndex((item) => item.nodeId === endLocation.nodeId)
  if (startIndex < 0 || endIndex < startIndex) return null
  const selectedNodes = nodes.slice(startIndex, endIndex + 1)
  const exact = selectedNodes.map((item, index) => {
    if (selectedNodes.length === 1) return item.text.slice(startOffset, endOffset)
    if (index === 0) return item.text.slice(startOffset)
    if (index === selectedNodes.length - 1) return item.text.slice(0, endOffset)
    return item.text
  }).join('\n')
  return {
    exact,
    nodeIds: selectedNodes.map((item) => item.nodeId).filter(Boolean),
    unitIds: Array.from(new Set(selectedNodes.map((item) => item.unitId).filter(Boolean)))
  }
}

function endpointSelector(location, selector, offset, edge) {
  const exact = asText(selector?.exact)
  if (!exact) return undefined
  const start = edge === 'end'
    ? Math.max(0, Number(offset) - exact.length)
    : Math.max(0, Number(offset) || 0)
  return createWritingSelector({
    text: exact,
    start,
    end: start + exact.length,
    fullText: location.text
  })
}

function freshRangeEndpointSelector(location, startOffset, endOffset, edge, sameNode) {
  const safeStart = Math.max(0, Math.min(location.text.length, Number(startOffset) || 0))
  const safeEnd = Math.max(safeStart, Math.min(location.text.length, Number(endOffset) || 0))
  const from = edge === 'end'
    ? Math.max(sameNode ? safeStart : 0, safeEnd - MAX_CONTEXT_CHARS)
    : safeStart
  const to = edge === 'end'
    ? safeEnd
    : Math.min(location.text.length, sameNode ? safeEnd : safeStart + MAX_CONTEXT_CHARS, safeStart + MAX_CONTEXT_CHARS)
  const exact = location.text.slice(from, to)
  return exact
    ? createWritingSelector({ text: exact, start: from, end: to, fullText: location.text })
    : undefined
}

function resolveRangeEndpoint(location, point, selector, edge) {
  if (!location || !point) return -1
  if (selector?.exact) {
    const start = resolveSelector(location, selector)
    return start < 0 ? -1 : edge === 'end' ? start + selector.exact.length : start
  }
  // 没有 quote selector 时，只能在节点本身未变化时沿用 offset；正文已经
  // 改写却继续猜位置，比显式 orphan 更危险。
  if (Number(point.nodeRevision || 0) !== Number(location.nodeRevision || 0)) return -1
  return Math.max(0, Math.min(location.text.length, Number(point.offset) || 0))
}

function resolveAnnotationRangeOnDocument(annotation, document) {
  const range = annotation.range
  const startLocation = findNode(document, range?.start?.nodeId)
  const endLocation = findNode(document, range?.end?.nodeId)
  if (!startLocation || !endLocation) {
    return { ...annotation, status: 'orphaned', resolution: 'range-missing-node' }
  }
  if (
    (range.start?.unitId && range.start.unitId !== startLocation.unitId)
    || (range.end?.unitId && range.end.unitId !== endLocation.unitId)
  ) {
    return { ...annotation, status: 'orphaned', resolution: 'range-unit-mismatch' }
  }

  const sameNode = startLocation.nodeId === endLocation.nodeId
  let startOffset = -1
  let endOffset = -1
  if (sameNode && range.exact) {
    const wholeRangeSelector = {
      exact: range.exact,
      start: Number(range.start?.offset) || 0,
      prefix: asText(range.startSelector?.prefix),
      suffix: asText(range.endSelector?.suffix)
    }
    startOffset = resolveSelector(startLocation, wholeRangeSelector)
    endOffset = startOffset < 0 ? -1 : startOffset + range.exact.length
  } else {
    startOffset = resolveRangeEndpoint(
      startLocation,
      range.start,
      range.startSelector || annotation.selector,
      'start'
    )
    endOffset = resolveRangeEndpoint(
      endLocation,
      range.end,
      range.endSelector || (sameNode ? annotation.selector : null),
      'end'
    )
  }
  if (startOffset < 0 || endOffset < 0 || (sameNode && endOffset < startOffset)) {
    return { ...annotation, status: 'orphaned', resolution: 'range-quote-not-found' }
  }

  const slice = rangeSlice(document, startLocation, endLocation, startOffset, endOffset)
  if (!slice) return { ...annotation, status: 'orphaned', resolution: 'range-order-invalid' }
  const startSelector = endpointSelector(
    startLocation,
    range.startSelector || annotation.selector,
    startOffset,
    'start'
  )
  const endSelector = endpointSelector(
    endLocation,
    range.endSelector || (sameNode ? annotation.selector : null),
    endOffset,
    'end'
  )
  const primarySelector = startSelector || annotation.selector
  const targetEnd = sameNode
    ? endOffset
    : Math.min(startLocation.text.length, startOffset + asText(primarySelector?.exact).length)
  return {
    ...annotation,
    target: {
      ...pointFromLocation(startLocation, startOffset),
      start: startOffset,
      end: targetEnd
    },
    ...(primarySelector ? { selector: primarySelector } : {}),
    range: {
      ...range,
      start: pointFromLocation(startLocation, startOffset),
      end: pointFromLocation(endLocation, endOffset),
      nodeIds: slice.nodeIds,
      unitIds: slice.unitIds,
      exact: slice.exact,
      ...(startSelector ? { startSelector } : {}),
      ...(endSelector ? { endSelector } : {})
    },
    status: annotation.status === 'resolved' ? 'resolved' : 'open',
    resolution: 'range-quote',
    updatedAt: now()
  }
}

function resolveAnnotationOnDocument(annotation, document) {
  if (annotation.range) return resolveAnnotationRangeOnDocument(annotation, document)
  const location = findNode(document, annotation.target.nodeId)
  if (!location) return { ...annotation, status: 'orphaned', resolution: 'missing-node' }
  if (annotation.target.unitId && annotation.target.unitId !== location.unitId) {
    return { ...annotation, status: 'orphaned', resolution: 'unit-mismatch' }
  }
  if (!annotation.selector?.exact) {
    return {
      ...annotation,
      target: { ...annotation.target, unitId: location.unitId, unitRevision: location.unitRevision, nodeRevision: location.nodeRevision },
      status: annotation.status === 'resolved' ? 'resolved' : 'open'
    }
  }
  const start = resolveSelector(location, annotation.selector)
  if (start < 0) return { ...annotation, status: 'orphaned', resolution: 'quote-not-found' }
  const selector = createWritingSelector({ text: annotation.selector.exact, start, end: start + annotation.selector.exact.length, fullText: location.text })
  return {
    ...annotation,
    target: {
      ...annotation.target,
      unitId: location.unitId,
      unitRevision: location.unitRevision,
      nodeRevision: location.nodeRevision,
      start,
      end: start + annotation.selector.exact.length
    },
    selector,
    status: annotation.status === 'resolved' ? 'resolved' : 'open',
    resolution: 'node-quote'
  }
}

export function resolveWritingAnnotation(annotation, document) {
  const normalized = normalizeWritingAnnotation(annotation, annotation?.chapterId, document)
  return normalized ? resolveAnnotationOnDocument(normalized, document) : null
}

function getUniqueQuoteMatches(exact, document, unitId = null) {
  return documentNodes(document)
    .filter((item) => !unitId || item.unitId === unitId)
    .flatMap((location) => findAll(location.text, exact).map((start) => ({ location, start })))
}

function applySplitTransitionToRange(annotation, document, splitNode) {
  const range = annotation.range
  const oldNodeId = splitNode?.oldNodeId
  const newNodeId = splitNode?.newNodeId
  const splitOffset = Math.max(0, Number(splitNode?.offset) || 0)
  const startTouches = range?.start?.nodeId === oldNodeId
  const endTouches = range?.end?.nodeId === oldNodeId
  if (!startTouches && !endTouches) return null

  const originalStart = Math.max(0, Number(range.start?.offset) || 0)
  const originalEnd = Math.max(0, Number(range.end?.offset) || 0)
  if (
    startTouches
    && endTouches
    && originalStart < splitOffset
    && originalEnd > splitOffset
  ) {
    return { ...annotation, status: 'orphaned', resolution: 'split-boundary', updatedAt: now() }
  }

  const mapPoint = (point, edge) => {
    if (point?.nodeId !== oldNodeId) {
      const location = findNode(document, point?.nodeId)
      return location ? { location, offset: Math.max(0, Number(point?.offset) || 0) } : null
    }
    const offset = Math.max(0, Number(point.offset) || 0)
    // 结束点恰在 split 边界仍属于左侧；开始点恰在边界属于右侧。
    const movesRight = edge === 'start' ? offset >= splitOffset : offset > splitOffset
    const location = findNode(document, movesRight ? newNodeId : oldNodeId)
    if (!location) return null
    return { location, offset: movesRight ? offset - splitOffset : offset }
  }
  const mappedStart = mapPoint(range.start, 'start')
  const mappedEnd = mapPoint(range.end, 'end')
  if (!mappedStart || !mappedEnd) {
    return { ...annotation, status: 'orphaned', resolution: 'range-missing-node', updatedAt: now() }
  }
  const slice = rangeSlice(
    document,
    mappedStart.location,
    mappedEnd.location,
    mappedStart.offset,
    mappedEnd.offset
  )
  if (!slice) return { ...annotation, status: 'orphaned', resolution: 'range-order-invalid', updatedAt: now() }
  const sameNode = mappedStart.location.nodeId === mappedEnd.location.nodeId
  // split 可能把旧 endpoint selector 的 exact 一刀切在两块之间；沿用它会
  // 让本次 transition 看似成功、下一次普通输入却突然 orphan。按新范围
  // 两端重新截取最多 48 字，保证 selector 完全落在各自的新节点里。
  const startSelector = freshRangeEndpointSelector(
    mappedStart.location,
    mappedStart.offset,
    sameNode ? mappedEnd.offset : mappedStart.location.text.length,
    'start',
    sameNode
  )
  const endSelector = freshRangeEndpointSelector(
    mappedEnd.location,
    sameNode ? mappedStart.offset : 0,
    mappedEnd.offset,
    'end',
    sameNode
  )
  const primarySelector = startSelector || annotation.selector
  return {
    ...annotation,
    target: {
      ...pointFromLocation(mappedStart.location, mappedStart.offset),
      start: mappedStart.offset,
      end: sameNode
        ? mappedEnd.offset
        : Math.min(mappedStart.location.text.length, mappedStart.offset + asText(primarySelector?.exact).length)
    },
    ...(primarySelector ? { selector: primarySelector } : {}),
    range: {
      ...range,
      start: pointFromLocation(mappedStart.location, mappedStart.offset),
      end: pointFromLocation(mappedEnd.location, mappedEnd.offset),
      nodeIds: slice.nodeIds,
      unitIds: slice.unitIds,
      exact: slice.exact,
      ...(startSelector ? { startSelector } : {}),
      ...(endSelector ? { endSelector } : {})
    },
    status: annotation.status === 'resolved' ? 'resolved' : 'open',
    resolution: 'split-offset',
    updatedAt: now()
  }
}

function applyTransition(annotation, document, transition) {
  const nodeId = annotation.target.nodeId
  if (['clear', 'replace-all'].includes(String(transition?.type || ''))) {
    const affectedUnitIds = new Set([
      ...(Array.isArray(transition?.affectedUnitIds) ? transition.affectedUnitIds : []),
      ...(Array.isArray(transition?.removedUnitIds) ? transition.removedUnitIds : [])
    ].map(String))
    if (affectedUnitIds.has(String(annotation.target?.unitId || ''))) {
      // 全章替换不是一次可重定位的局部编辑。即使新稿里碰巧再次出现相同
      // 短语，也不能把旧批注静默绑到完全不同的语境。
      return {
        ...annotation,
        status: 'orphaned',
        resolution: transition.type === 'clear' ? 'unit-content-cleared' : 'unit-content-replaced',
        updatedAt: now()
      }
    }
  }
  if (transition?.type === 'split' && annotation.range) {
    const transitionedRange = applySplitTransitionToRange(
      annotation,
      document,
      transition.splitNode
    )
    if (transitionedRange) return transitionedRange
  }
  if (transition?.type === 'split' && transition.splitNode?.oldNodeId === nodeId) {
    const splitOffset = Math.max(0, Number(transition.splitNode.offset) || 0)
    const start = Math.max(0, Number(annotation.target.start) || 0)
    const end = Math.max(start, Number(annotation.target.end) || 0)
    const fullyLeft = end <= splitOffset
    const fullyRight = start >= splitOffset
    if (!fullyLeft && !fullyRight) {
      return { ...annotation, status: 'orphaned', resolution: 'split-boundary', updatedAt: now() }
    }

    const targetNodeId = fullyRight ? transition.splitNode.newNodeId : nodeId
    const location = findNode(document, targetNodeId)
    if (!location) return { ...annotation, status: 'orphaned', resolution: 'missing-node', updatedAt: now() }
    const nextStart = fullyRight ? start - splitOffset : start
    const nextEnd = fullyRight ? end - splitOffset : end
    return {
      ...annotation,
      target: {
        ...annotation.target,
        unitId: location.unitId,
        unitRevision: location.unitRevision,
        nodeId: targetNodeId,
        nodeRevision: location.nodeRevision,
        start: nextStart,
        end: nextEnd
      },
      ...(annotation.selector?.exact
        ? { selector: createWritingSelector({ text: annotation.selector.exact, start: nextStart, end: nextEnd, fullText: location.text }) }
        : {}),
      status: annotation.status === 'resolved' ? 'resolved' : 'open',
      resolution: 'split-offset',
      updatedAt: now()
    }
  }
  const mapped = transition?.nodeUnitMap?.[nodeId]
  let next = mapped && annotation.target.unitId !== mapped
    ? { ...annotation, target: { ...annotation.target, unitId: mapped } }
    : annotation
  if (next.range && transition?.nodeUnitMap) {
    const mapPointUnit = (point) => {
      const unitId = transition.nodeUnitMap?.[point?.nodeId]
      return unitId && point?.unitId !== unitId ? { ...point, unitId } : point
    }
    const start = mapPointUnit(next.range.start)
    const end = mapPointUnit(next.range.end)
    if (start !== next.range.start || end !== next.range.end) {
      next = {
        ...next,
        range: {
          ...next.range,
          start,
          end,
          unitIds: Array.from(new Set([start?.unitId, end?.unitId].filter(Boolean)))
        }
      }
    }
  }
  return next
}

export function reconcileWritingAnnotations(annotations, document, chapterId = null, previousDocument = null, transition = null) {
  return normalizeWritingAnnotations(annotations, chapterId, previousDocument).map((annotation) => {
    const transitioned = applyTransition(annotation, document, transition)
    if ([
      'split-offset',
      'split-boundary',
      'unit-content-cleared',
      'unit-content-replaced'
    ].includes(transitioned.resolution)) return transitioned
    const resolved = resolveAnnotationOnDocument(transitioned, document)
    if (resolved.status !== 'orphaned') return resolved
    // range 有独立的双端点 selector；其中任一端无法唯一解析时不能再退化
    // 成 target 的单节点模糊匹配，否则会把跨段批注缩到一个碰巧同词的点。
    if (transitioned.range) return resolved
    const exact = annotation.selector?.exact
    if (!exact) return resolved
    const matches = getUniqueQuoteMatches(exact, document, transitioned.target.unitId)
    if (matches.length !== 1) return { ...resolved, status: 'orphaned', resolution: matches.length ? 'ambiguous-quote' : 'quote-not-found' }
    const { location, start } = matches[0]
    return {
      ...transitioned,
      target: {
        ...transitioned.target,
        unitId: location.unitId,
        unitRevision: location.unitRevision,
        nodeId: location.nodeId,
        nodeRevision: location.nodeRevision,
        start,
        end: start + exact.length
      },
      selector: createWritingSelector({ text: exact, start, end: start + exact.length, fullText: location.text }),
      status: transitioned.status === 'resolved' ? 'resolved' : 'open',
      resolution: previousDocument ? 'migrated-quote' : 'relocated-quote',
      updatedAt: now()
    }
  })
}

export function updateWritingAnnotationStatus(annotations, annotationId, status) {
  if (!['open', 'resolved', 'orphaned'].includes(status)) return normalizeWritingAnnotations(annotations)
  return normalizeWritingAnnotations(annotations).map((annotation) => (
    annotation.id === annotationId ? { ...annotation, status, updatedAt: now() } : annotation
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
  return findNode(document, annotation?.target?.nodeId || annotation?.nodeId || annotation?.blockId)?.node || null
}
