import { marked } from 'marked'
import { parseNarrativePresentation } from '../narrativePresentation.js'

export const WRITING_DOCUMENT_SCHEMA_VERSION = 3
export const WRITING_UNIT_KINDS = new Set(['passage', 'scene', 'note', 'source'])

const BLOCK_TYPES = new Set(['prose', 'scene-heading', 'divider', 'quote', 'author-note', 'source-reference'])
const LITERAL_INLINE_MARKDOWN_PATTERN = /(\*\*|__)[^\n]+?\1|(^|[^*])\*[^*\n]+?\*(?!\*)|(^|[^_])_[^_\n]+?_(?!_)|~~[^\n]+?~~|`[^`\n]+?`|\[[^\]\n]+\]\([^\s)]+\)/

function hashText(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function createUnitId(seed) {
  return seed
    ? `unit-${hashText(String(seed))}`
    : `unit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createNodeId(seed = '') {
  return seed
    ? `node-${hashText(String(seed))}`
    : `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeWritingOriginRefs(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).filter((ref) => {
    if (!ref || ref.type !== 'experience-turn') return false
    const fingerprint = [
      ref.type,
      ref.sessionId,
      ref.branchId,
      ref.turnId,
      ref.messageId,
      Number(ref.sourceRevision || 1)
    ].join('\u0000')
    if (!ref.sessionId || !ref.turnId || !ref.messageId || seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  }).map((ref) => ({
    type: 'experience-turn',
    sessionId: String(ref.sessionId),
    branchId: String(ref.branchId || 'main'),
    turnId: String(ref.turnId),
    messageId: String(ref.messageId),
    worldbookId: String(ref.worldbookId || ''),
    sourceRevision: Math.max(1, Number(ref.sourceRevision || 1))
  }))
}

function inlineText(tokens = []) {
  return tokens.map((token) => {
    if (token.type === 'text' || token.type === 'escape' || token.type === 'codespan') {
      return token.text || token.raw || ''
    }
    if (token.type === 'strong' || token.type === 'em' || token.type === 'del' || token.type === 'link') {
      return inlineText(token.tokens || []) || token.text || ''
    }
    if (token.type === 'br') return '\n'
    return token.text || token.raw || ''
  }).join('')
}

function tokenPlainText(token) {
  if (token.type === 'heading' || token.type === 'paragraph' || token.type === 'blockquote') {
    return inlineText(token.tokens || marked.Lexer.lexInline(token.text || ''))
  }
  if (token.type === 'code') return token.text || ''
  if (token.type === 'list') return (token.items || []).map((item) => item.text || item.raw || '').join('\n')
  return token.text || token.raw || ''
}

function inlineContent(token) {
  const tokens = token.tokens || marked.Lexer.lexInline(token.text || '')
  const content = tokens.map((item) => {
    const text = inlineText([item])
    if (!text) return null
    if (item.type === 'strong') return { type: 'text', marks: [{ type: 'bold' }], text }
    if (item.type === 'em') return { type: 'text', marks: [{ type: 'italic' }], text }
    if (item.type === 'del') return { type: 'text', marks: [{ type: 'strike' }], text }
    if (item.type === 'codespan') return { type: 'text', marks: [{ type: 'code' }], text }
    if (item.type === 'link') return { type: 'text', marks: [{ type: 'link', attrs: { href: item.href } }], text }
    return { type: 'text', text }
  }).filter(Boolean)
  return content.length ? content : [{ type: 'text', text: tokenPlainText(token) }]
}

function classifyToken(token) {
  if (token.type === 'heading') return 'scene-heading'
  if (token.type === 'hr') return 'divider'
  if (token.type === 'blockquote') {
    const text = tokenPlainText(token).trim()
    if (/^(作者注|author note|author's note)\s*[:：]/i.test(text)) return 'author-note'
    if (/^(来源|source)\s*[:：]/i.test(text)) return 'source-reference'
    return 'quote'
  }
  return 'prose'
}

function blockNode(token, index, leadingMarkdown) {
  const kind = classifyToken(token)
  const rawMarkdown = token.raw || ''
  const text = tokenPlainText(token)
  const attrs = {
    nodeId: createNodeId(`${index + 1}\u0000${rawMarkdown}`),
    nodeRevision: 0,
    kind,
    rawMarkdown,
    leadingMarkdown,
    originalText: text
  }

  if (kind === 'divider') return { type: 'divider', attrs }

  const type = kind === 'scene-heading'
    ? 'sceneHeading'
    : kind === 'quote'
      ? 'quote'
    : kind === 'author-note'
      ? 'authorNote'
      : kind === 'source-reference'
        ? 'sourceReference'
        : 'paragraph'

  return {
    type,
    attrs: {
      ...attrs,
      ...(token.depth ? { level: token.depth } : {})
    },
    content: inlineContent(token)
  }
}

function unitKindForNode(node) {
  if (node?.attrs?.kind === 'scene-heading') return 'scene'
  if (node?.attrs?.kind === 'author-note') return 'note'
  if (node?.attrs?.kind === 'source-reference') return 'source'
  return 'passage'
}

function groupNodesIntoUnits(nodes, { migration = false } = {}) {
  const units = []
  let pending = []
  const flush = () => {
    if (!pending.length) return
    const first = pending[0]
    units.push({
      type: 'writingUnit',
      attrs: {
        unitId: createUnitId(first.attrs?.nodeId || JSON.stringify(first)),
        unitRevision: Math.max(0, ...pending.map((node) => Number(node.attrs?.nodeRevision || 0))),
        kind: unitKindForNode(first),
        sceneId: null,
        originRefs: []
      },
      content: pending
    })
    pending = []
  }

  nodes.forEach((node) => {
    const kind = node?.attrs?.kind
    const startsUnit = kind === 'scene-heading' || kind === 'divider' || kind === 'author-note' || kind === 'source-reference'
    if (startsUnit) flush()
    pending.push(node)
    // A divider is its own boundary unit; author/source notes are standalone
    // units. The migration path keeps the historical scene heading together
    // with its following prose.
    if (kind === 'divider' || kind === 'author-note' || kind === 'source-reference') flush()
  })
  flush()

  if (!units.length) {
    const emptyNode = {
      type: 'paragraph',
      attrs: {
        nodeId: createNodeId(),
        nodeRevision: 0,
        kind: 'prose',
        rawMarkdown: '',
        leadingMarkdown: '',
        originalText: ''
      },
      content: []
    }
    units.push({
      type: 'writingUnit',
      attrs: { unitId: createUnitId(), unitRevision: 0, kind: 'passage', sceneId: null, originRefs: [] },
      content: [emptyNode]
    })
  }

  if (migration) {
    units.forEach((unit, index) => {
      const firstId = unit.content[0]?.attrs?.nodeId || index + 1
      unit.attrs.unitId = `unit-v2-${firstId}`
    })
  }
  return units
}

function renderInline(content = []) {
  return content.map((node) => {
    const text = node.text || ''
    const marks = node.marks || []
    return marks.reduce((result, mark) => {
      if (mark.type === 'bold') return `**${result}**`
      if (mark.type === 'italic') return `*${result}*`
      if (mark.type === 'strike') return `~~${result}~~`
      if (mark.type === 'code') return `\`${result}\``
      if (mark.type === 'link') return `[${result}](${mark.attrs?.href || ''})`
      return result
    }, text)
  }).join('')
}

function renderNode(node) {
  const attrs = node.attrs || {}
  if (node.type === 'divider') return '---\n'
  const text = renderInline(node.content)
  if (node.type === 'sceneHeading') return `${'#'.repeat(Math.max(1, attrs.level || 1))} ${text}\n`
  if (node.type === 'quote') return `> ${text}\n`
  if (node.type === 'authorNote') return `> 作者注：${text}\n`
  if (node.type === 'sourceReference') return `> 来源：${text}\n`
  return `${text}\n`
}

function isUntouched(node) {
  if (node?.type === 'divider') return node?.attrs?.rawMarkdown != null
  return Boolean(node?.attrs?.rawMarkdown != null && node?.attrs?.originalText === getNodeText(node))
}

function getNodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (node?.content || []).map(getNodeText).join('')
}

export function createWritingDocument(markdown = '') {
  const input = String(markdown ?? '')
  const presentation = parseNarrativePresentation(input, {
    complete: true,
    fallbackSpeaker: ''
  })
  // Narrative markers are a transport protocol for the experience page, not
  // writing content. Keep the editor's source as ordinary Markdown so the
  // live surface never exposes `:::...` control lines.
  const source = presentation.hasMarkers ? presentation.content : input
  const tokens = marked.lexer(source)
  const nodes = []
  let leadingMarkdown = ''
  let blockIndex = 0

  for (const token of tokens) {
    if (token.type === 'space') {
      leadingMarkdown += token.raw || ''
      continue
    }
    if (token.type === 'list') {
      const raw = token.raw || ''
      nodes.push(blockNode({ ...token, type: 'paragraph', text: tokenPlainText(token), tokens: marked.Lexer.lexInline(tokenPlainText(token)) }, blockIndex, leadingMarkdown))
      nodes[nodes.length - 1].attrs.rawMarkdown = raw
      nodes[nodes.length - 1].attrs.originalText = tokenPlainText(token)
      leadingMarkdown = ''
      blockIndex += 1
      continue
    }
    if (!['heading', 'paragraph', 'blockquote', 'hr', 'code'].includes(token.type)) {
      leadingMarkdown += token.raw || ''
      continue
    }
    nodes.push(blockNode(token, blockIndex, leadingMarkdown))
    leadingMarkdown = ''
    blockIndex += 1
  }

  return {
    schemaVersion: WRITING_DOCUMENT_SCHEMA_VERSION,
    revision: 0,
    content: groupNodesIntoUnits(nodes),
    meta: {
      sourceHash: hashText(source),
      trailingMarkdown: leadingMarkdown,
      importedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  }
}

export function getNodePlainText(node) {
  return getNodeText(node)
}

export function getWritingDocumentPlainText(document) {
  return (document?.content || []).flatMap((unit) => unit?.content || []).map(getNodeText).join('\n')
}

export function getWritingDocumentNodes(document) {
  return (document?.content || []).flatMap((unit) => (
    (unit?.content || []).map((node, nodeIndex) => ({
      unit,
      node,
      unitIndex: document.content.indexOf(unit),
      nodeIndex
    }))
  ))
}

function toV3Node(node, index) {
  const sourceAttrs = node?.attrs || {}
  const { blockId: _blockId, revision: _revision, ...attrs } = sourceAttrs
  return {
    ...node,
    attrs: {
      ...attrs,
      nodeId: sourceAttrs.nodeId || sourceAttrs.blockId || `node-v2-${index + 1}-${hashText(JSON.stringify(node))}`,
      nodeRevision: Number(sourceAttrs.nodeRevision ?? sourceAttrs.revision ?? 0),
      kind: sourceAttrs.kind || 'prose'
    }
  }
}

export function migrateWritingDocumentToV3(document, fallbackMarkdown = '') {
  if (document?.schemaVersion === 3 && validateWritingDocument(document).valid) return document
  if (document?.schemaVersion !== 2 || !Array.isArray(document?.content)) {
    return createWritingDocument(fallbackMarkdown)
  }
  return {
    ...document,
    schemaVersion: 3,
    content: groupNodesIntoUnits(document.content.map(toV3Node), { migration: true }),
    meta: { ...(document.meta || {}), migratedFrom: 2 }
  }
}

export function getWritingNodeLocation(document, nodeId) {
  for (let unitIndex = 0; unitIndex < (document?.content || []).length; unitIndex += 1) {
    const unit = document.content[unitIndex]
    const nodeIndex = (unit?.content || []).findIndex((node) => node?.attrs?.nodeId === nodeId)
    if (nodeIndex >= 0) {
      return {
        unitId: unit.attrs.unitId,
        nodeId,
        unitIndex,
        nodeIndex,
        unit,
        node: unit.content[nodeIndex]
      }
    }
  }
  return null
}

/**
 * Return the validated structured document stored on a chapter.
 *
 * The chapter still carries `content` for compatibility with older pages and
 * backups, but consumers must not guess whether `editorDocument` is usable.
 * Keeping this gate in the schema service makes the projection boundary
 * explicit and prevents malformed sidecars from hiding the legacy source.
 */
export function getChapterDocument(chapter) {
  const candidate = chapter?.editorDocument
  if (candidate?.schemaVersion === 2) {
    const migrated = migrateWritingDocumentToV3(candidate, chapter?.content || '')
    return validateWritingDocument(migrated).valid ? migrated : null
  }
  return validateWritingDocument(candidate).valid ? candidate : null
}

/**
 * Read a chapter through its canonical editor document when available.
 * Falls back to the legacy Markdown projection for pre-Notebook chapters.
 */
export function getChapterMarkdown(chapter) {
  const document = getChapterDocument(chapter)
  return document ? getWritingDocumentMarkdown(document) : String(chapter?.content ?? '')
}

/**
 * Read plain chapter text without exposing the storage format to consumers.
 */
export function getChapterPlainText(chapter) {
  const document = getChapterDocument(chapter)
  if (document) return getWritingDocumentPlainText(document)
  return getWritingDocumentPlainText(createWritingDocument(String(chapter?.content ?? '')))
}

export function getWritingDocumentMarkdown(document) {
  return getWritingDocumentNodes(document).map(({ node }) => {
    const attrs = node.attrs || {}
    if (isUntouched(node)) return `${attrs.leadingMarkdown || ''}${attrs.rawMarkdown || ''}`
    return `${attrs.leadingMarkdown || ''}${renderNode(node)}`
  }).join('') + (document?.meta?.trailingMarkdown || '')
}

/**
 * Resolve a Markdown cursor offset to the stable editor node that owns it.
 *
 * The textarea and legacy advisor still speak in absolute Markdown offsets;
 * this adapter lets them carry the structured node identity alongside that
 * legacy range until the Notebook editor becomes the default surface.
 */
export function getWritingBlockAtPosition(document, position = 0) {
  const nodes = getWritingDocumentNodes(document)
  if (!nodes.length) return null

  const cursor = Math.max(0, Number.isFinite(Number(position)) ? Number(position) : 0)
  let offset = 0
  let last = null

  for (const { unit, node } of nodes) {
    const attrs = node?.attrs || {}
    const leadingMarkdown = String(attrs.leadingMarkdown || '')
    const bodyMarkdown = isUntouched(node) ? String(attrs.rawMarkdown || '') : renderNode(node)
    const start = offset + leadingMarkdown.length
    const end = start + bodyMarkdown.length
    const candidate = {
      unitId: unit?.attrs?.unitId || null,
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      nodeId: attrs.nodeId || attrs.blockId || null,
      nodeRevision: Number(attrs.nodeRevision ?? attrs.revision ?? 0),
      kind: attrs.kind || 'prose',
      start,
      end,
      text: getNodeText(node)
    }
    last = candidate
    if (cursor >= start && cursor <= end) return candidate
    offset = end
  }

  return last
}

function inlineMarkdownCursorOffset(content = [], localOffset = 0) {
  let remaining = Math.max(0, Number(localOffset) || 0)
  let renderedOffset = 0
  for (const node of content) {
    const text = getNodeText(node)
    const rendered = renderInline([node])
    if (remaining >= text.length) {
      renderedOffset += rendered.length
      remaining -= text.length
      continue
    }
    const openingLength = (node.marks || []).reduce((length, mark) => {
      if (mark.type === 'bold' || mark.type === 'strike') return length + 2
      if (mark.type === 'italic' || mark.type === 'code' || mark.type === 'link') return length + 1
      return length
    }, 0)
    return renderedOffset + openingLength + remaining
  }
  return renderedOffset
}

function writingNodeMarkdownPrefix(node) {
  if (node?.type === 'sceneHeading') return `${'#'.repeat(Math.max(1, node.attrs?.level || 1))} `
  if (node?.type === 'quote') return '> '
  if (node?.type === 'authorNote') return '> 作者注：'
  if (node?.type === 'sourceReference') return '> 来源：'
  return ''
}

export function getWritingMarkdownPosition(document, nodeId, localOffset = 0) {
  const nodes = getWritingDocumentNodes(document)
  let offset = 0
  for (const { node } of nodes) {
    const attrs = node?.attrs || {}
    const leadingMarkdown = String(attrs.leadingMarkdown || '')
    const bodyMarkdown = isUntouched(node) ? String(attrs.rawMarkdown || '') : renderNode(node)
    const bodyStart = offset + leadingMarkdown.length
    if ((attrs.nodeId || attrs.blockId) === nodeId) {
      const textLength = getNodeText(node).length
      const safeLocalOffset = Math.max(0, Math.min(textLength, Number(localOffset) || 0))
      return bodyStart
        + writingNodeMarkdownPrefix(node).length
        + inlineMarkdownCursorOffset(node.content || [], safeLocalOffset)
    }
    offset = bodyStart + bodyMarkdown.length
  }
  return null
}

function editorNodeTypeForWritingNode(node) {
  if (node?.type === 'sceneHeading') return 'heading'
  if (node?.type === 'divider') return 'horizontalRule'
  if (node?.type === 'quote' || node?.type === 'authorNote' || node?.type === 'sourceReference') return 'blockquote'
  return 'paragraph'
}

function writingKindForEditorNode(node) {
  if (node?.type === 'heading') return 'scene-heading'
  if (node?.type === 'horizontalRule') return 'divider'
  if (node?.type === 'blockquote') {
    const blockKind = node?.attrs?.blockKind || node?.attrs?.nodeKind
    if (blockKind === 'source-reference') return 'source-reference'
    if (blockKind === 'author-note') return 'author-note'
    return 'quote'
  }
  return 'prose'
}

function recoverLiteralInlineMarkdown(node) {
  const content = Array.isArray(node?.content) ? node.content : []
  if (node?.attrs?.rawMarkdown != null || !content.length) return content
  if (content.some((item) => item?.type !== 'text' || item?.marks?.length)) return content
  const text = content.map((item) => item.text || '').join('')
  if (!LITERAL_INLINE_MARKDOWN_PATTERN.test(text)) return content
  return inlineContent({ text, tokens: marked.Lexer.lexInline(text) })
}

function editorInlineContent(node) {
  const content = Array.isArray(node?.content) ? node.content : []
  if (node?.type !== 'blockquote') return content
  const flattened = []
  content.forEach((child, index) => {
    if (index > 0) flattened.push({ type: 'text', text: '\n' })
    flattened.push(...(child?.content || []))
  })
  return flattened
}

export function writingDocumentToEditorContent(document) {
  return (document?.content || []).map((unit) => ({
    type: 'writingUnit',
    attrs: {
      unitId: unit.attrs?.unitId || null,
      unitRevision: Number(unit.attrs?.unitRevision || 0),
      unitKind: unit.attrs?.kind || 'passage',
      sceneId: unit.attrs?.sceneId || null,
      originRefs: normalizeWritingOriginRefs(unit.attrs?.originRefs)
    },
    content: (unit.content || []).map((node) => {
      const inline = recoverLiteralInlineMarkdown(node)
      const editorNode = {
        type: editorNodeTypeForWritingNode(node),
        attrs: {
          nodeId: node.attrs?.nodeId || node.attrs?.blockId || null,
          nodeRevision: Number(node.attrs?.nodeRevision ?? node.attrs?.revision ?? 0),
          nodeKind: node.attrs?.kind || 'prose',
          rawMarkdown: node.attrs?.rawMarkdown ?? null,
          leadingMarkdown: node.attrs?.leadingMarkdown || '',
          originalText: node.attrs?.originalText ?? null
        }
      }
      if (node.type === 'sceneHeading') editorNode.attrs.level = Number(node.attrs?.level || 1)
      if (node.type === 'blockquote' || node.type === 'quote' || node.type === 'authorNote' || node.type === 'sourceReference') {
        editorNode.attrs.blockKind = node.attrs?.kind || 'quote'
      }
      if (node.type !== 'divider') {
        editorNode.content = editorNode.type === 'blockquote'
          ? [{ type: 'paragraph', content: inline }]
          : inline
      }
      return editorNode
    })
  }))
}

export function editorContentToWritingDocument(content, previousDocument = null) {
  const editorUnits = (content?.content || content || []).some((node) => node?.type === 'writingUnit')
    ? (content?.content || content || [])
    : [{
        type: 'writingUnit',
        attrs: { unitId: 'unit-editor-default', unitRevision: 0, unitKind: 'passage', originRefs: [] },
        content: content?.content || content || []
      }]
  const previousUnits = previousDocument?.content || []
  const previousUnitById = new Map(previousUnits.map((unit) => [unit.attrs?.unitId, unit]))

  const nodes = editorUnits.map((editorUnit, unitIndex) => {
    const unitId = editorUnit.attrs?.unitId || `unit-editor-${unitIndex + 1}`
    const previousUnit = previousUnitById.get(unitId)
    const previousNodes = previousUnit?.content || []
    const previousById = new Map(previousNodes.map((node) => [node.attrs?.nodeId, node]))
    const unitNodes = (editorUnit.content || []).map((node, nodeIndex) => {
      const nodeId = node.attrs?.nodeId || node.attrs?.blockId || `node-editor-${unitIndex + 1}-${nodeIndex + 1}`
      const kind = writingKindForEditorNode(node)
      const inline = editorInlineContent(node)
      const text = inline.map(getNodeText).join('')
      const previous = previousById.get(nodeId)
      const previousRevision = Number(previous?.attrs?.nodeRevision ?? previous?.attrs?.revision ?? 0)
      const writingType = node.type === 'heading'
        ? 'sceneHeading'
        : node.type === 'horizontalRule'
          ? 'divider'
          : node.type === 'blockquote'
            ? kind === 'source-reference'
              ? 'sourceReference'
              : kind === 'author-note'
                ? 'authorNote'
                : 'quote'
            : 'paragraph'
      const unchanged = previous
        ? previous.type === writingType
          && previous.attrs?.kind === kind
          && JSON.stringify(previous.content || []) === JSON.stringify(inline)
          && (writingType !== 'sceneHeading' || Number(previous.attrs?.level || 1) === Number(node.attrs?.level || 1))
        : false
      const nodeRevision = unchanged
        ? previousRevision
        : Math.max(Number(node.attrs?.nodeRevision || 0), previous ? previousRevision + 1 : 0)
      const attrs = {
        nodeId,
        nodeRevision,
        kind,
        rawMarkdown: unchanged ? previous.attrs?.rawMarkdown ?? null : null,
        leadingMarkdown: previous?.attrs?.leadingMarkdown || (unitIndex > 0 || nodeIndex > 0 ? '\n' : ''),
        originalText: unchanged ? previous.attrs?.originalText ?? text : null
      }
      if (node.type === 'heading') attrs.level = Number(node.attrs?.level || 1)
      return {
        type: writingType,
        attrs,
        ...(node.type === 'horizontalRule' ? {} : { content: inline })
      }
    })
    const nextUnit = {
      type: 'writingUnit',
      attrs: {
        unitId,
        unitRevision: Number(editorUnit.attrs?.unitRevision || previousUnit?.attrs?.unitRevision || 0),
        kind: editorUnit.attrs?.unitKind || editorUnit.attrs?.kind || previousUnit?.attrs?.kind || unitKindForNode(unitNodes[0]),
        sceneId: editorUnit.attrs?.sceneId || previousUnit?.attrs?.sceneId || null,
        originRefs: normalizeWritingOriginRefs(editorUnit.attrs?.originRefs || previousUnit?.attrs?.originRefs)
      },
      content: unitNodes
    }
    if (previousUnit) {
      const unchanged = comparableUnit(previousUnit) === comparableUnit(nextUnit)
      nextUnit.attrs.unitRevision = unchanged
        ? Number(previousUnit.attrs?.unitRevision || 0)
        : Number(previousUnit.attrs?.unitRevision || 0) + 1
    }
    return nextUnit
  })
  return {
    schemaVersion: WRITING_DOCUMENT_SCHEMA_VERSION,
    revision: Number(previousDocument?.revision || 0) + 1,
    content: nodes,
    meta: {
      ...(previousDocument?.meta || {}),
      sourceHash: previousDocument?.meta?.sourceHash || null,
      trailingMarkdown: previousDocument?.meta?.trailingMarkdown || ''
    },
    updatedAt: new Date().toISOString()
  }
}

function comparableUnit(unit) {
  return JSON.stringify({
    kind: unit?.attrs?.kind || 'passage',
    sceneId: unit?.attrs?.sceneId || null,
    originRefs: normalizeWritingOriginRefs(unit?.attrs?.originRefs),
    content: (unit?.content || []).map((node) => ({
      type: node.type,
      attrs: Object.fromEntries(Object.entries(node.attrs || {}).filter(([key]) => !['nodeRevision', 'revision'].includes(key))),
      content: node.content || []
    }))
  })
}

function blockMatchKey(node) {
  const attrs = node?.attrs || {}
  return `${attrs.kind || 'prose'}\u0000${attrs.rawMarkdown || getNodeText(node)}`
}

/**
 * Reconcile a Markdown projection back into an existing document.
 *
 * This compatibility path is used while the legacy textarea is still
 * available. Matching exact blocks first and then same-position blocks keeps
 * IDs stable for ordinary edits, while additions/deletions remain explicit
 * new blocks instead of silently reassigning every following block.
 */
export function mergeWritingDocumentFromMarkdown(markdown = '', previousDocument = null) {
  const nextDocument = createWritingDocument(markdown)
  const previousNodes = getWritingDocumentNodes(previousDocument)
  const nextNodes = getWritingDocumentNodes(nextDocument)
  const unused = new Set(previousNodes.map((_, index) => index))
  const matches = new Map()
  const exactBuckets = new Map()

  previousNodes.forEach(({ node }, index) => {
    const key = blockMatchKey(node)
    if (!exactBuckets.has(key)) exactBuckets.set(key, [])
    exactBuckets.get(key).push(index)
  })

  nextNodes.forEach(({ node }, nextIndex) => {
    const bucket = exactBuckets.get(blockMatchKey(node)) || []
    const match = bucket.find((index) => unused.has(index))
    if (match == null) return
    matches.set(nextIndex, match)
    unused.delete(match)
  })

  nextNodes.forEach(({ node }, nextIndex) => {
    if (matches.has(nextIndex)) return
    const previous = previousNodes[nextIndex]?.node
    if (!previous || !unused.has(nextIndex)) return
    if ((previous.attrs?.kind || 'prose') !== (node.attrs?.kind || 'prose')) return
    matches.set(nextIndex, nextIndex)
    unused.delete(nextIndex)
  })

  const mergedNodes = nextNodes.map(({ node }, nextIndex) => {
    const previousIndex = matches.get(nextIndex)
    if (previousIndex == null) return node

    const previous = previousNodes[previousIndex].node
    const unchanged = blockMatchKey(previous) === blockMatchKey(node)
    return {
      ...node,
      attrs: {
        ...node.attrs,
        nodeId: previous.attrs?.nodeId || previous.attrs?.blockId || node.attrs?.nodeId,
        nodeRevision: unchanged
          ? Number(previous.attrs?.nodeRevision ?? previous.attrs?.revision ?? 0)
          : Number(previous.attrs?.nodeRevision ?? previous.attrs?.revision ?? 0) + 1,
        rawMarkdown: unchanged ? previous.attrs?.rawMarkdown || null : null,
        originalText: unchanged ? previous.attrs?.originalText ?? getNodeText(node) : null
      }
    }
  })

  let flatIndex = 0
  const content = nextDocument.content.map((unit) => {
    const unitNodes = unit.content.map(() => mergedNodes[flatIndex++])
    const previousUnit = unitNodes
      .map((node) => getWritingNodeLocation(previousDocument, node.attrs?.nodeId))
      .find(Boolean)?.unit
    const nextUnit = {
      ...unit,
      attrs: {
        ...unit.attrs,
        unitId: previousUnit?.attrs?.unitId || unit.attrs.unitId,
        unitRevision: previousUnit
          ? Number(previousUnit.attrs?.unitRevision || 0) + (comparableUnit(previousUnit) === comparableUnit({ ...unit, content: unitNodes }) ? 0 : 1)
          : unit.attrs.unitRevision,
        originRefs: normalizeWritingOriginRefs(previousUnit?.attrs?.originRefs || unit.attrs.originRefs)
      },
      content: unitNodes
    }
    return nextUnit
  })

  return {
    ...nextDocument,
    revision: Number(previousDocument?.revision || 0) + 1,
    content,
    meta: {
      ...(nextDocument.meta || {}),
      importedFrom: 'writing-page-compatibility-projection'
    }
  }
}

export function validateWritingDocument(document) {
  const errors = []
  if (!document || document.schemaVersion !== WRITING_DOCUMENT_SCHEMA_VERSION) errors.push('schemaVersion')
  if (!Array.isArray(document?.content)) errors.push('content')
  if (Array.isArray(document?.content) && document.content.length === 0) errors.push('documentContent')
  const unitIds = new Set()
  const nodeIds = new Set()
  for (const unit of document?.content || []) {
    const unitId = unit?.attrs?.unitId
    const unitKind = unit?.attrs?.kind
    if (!unitId || unitIds.has(unitId)) errors.push(`unitId:${unitId || 'missing'}`)
    unitIds.add(unitId)
    if (!WRITING_UNIT_KINDS.has(unitKind)) errors.push(`unitKind:${unitKind || 'missing'}`)
    if (!Number.isInteger(unit?.attrs?.unitRevision) || unit.attrs.unitRevision < 0) errors.push(`unitRevision:${unitId || 'missing'}`)
    if (!Array.isArray(unit?.content) || unit.content.length === 0) errors.push(`unitContent:${unitId || 'missing'}`)
    for (const node of unit?.content || []) {
      const kind = node?.attrs?.kind
      const nodeId = node?.attrs?.nodeId
      if (!BLOCK_TYPES.has(kind)) errors.push(`kind:${kind || 'missing'}`)
      if (!nodeId || nodeIds.has(nodeId)) errors.push(`nodeId:${nodeId || 'missing'}`)
      nodeIds.add(nodeId)
      if (!Number.isInteger(node?.attrs?.nodeRevision) || node.attrs.nodeRevision < 0) errors.push(`nodeRevision:${nodeId || 'missing'}`)
      if (kind !== 'divider' && !Array.isArray(node.content)) errors.push(`content:${nodeId || 'missing'}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function markWritingNodeChanged(node, content) {
  return {
    ...node,
    attrs: {
      ...(node.attrs || {}),
      nodeRevision: Number(node.attrs?.nodeRevision ?? node.attrs?.revision ?? 0) + 1,
      rawMarkdown: null,
      leadingMarkdown: node.attrs?.leadingMarkdown || '',
      originalText: null
    },
    content
  }
}

export const __private__ = { hashText, classifyToken, renderNode, renderInline }
