import { marked } from 'marked'
import { parseNarrativePresentation } from '../narrativePresentation.js'

export const WRITING_DOCUMENT_SCHEMA_VERSION = 2

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

function createBlockId(index, raw) {
  return `block-${index + 1}-${hashText(raw).slice(0, 8)}`
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
    blockId: createBlockId(index, rawMarkdown),
    revision: 0,
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
  const content = []
  let leadingMarkdown = ''
  let blockIndex = 0

  for (const token of tokens) {
    if (token.type === 'space') {
      leadingMarkdown += token.raw || ''
      continue
    }
    if (token.type === 'list') {
      const raw = token.raw || ''
      content.push(blockNode({ ...token, type: 'paragraph', text: tokenPlainText(token), tokens: marked.Lexer.lexInline(tokenPlainText(token)) }, blockIndex, leadingMarkdown))
      content[content.length - 1].attrs.rawMarkdown = raw
      content[content.length - 1].attrs.originalText = tokenPlainText(token)
      leadingMarkdown = ''
      blockIndex += 1
      continue
    }
    if (!['heading', 'paragraph', 'blockquote', 'hr', 'code'].includes(token.type)) {
      leadingMarkdown += token.raw || ''
      continue
    }
    content.push(blockNode(token, blockIndex, leadingMarkdown))
    leadingMarkdown = ''
    blockIndex += 1
  }

  return {
    schemaVersion: WRITING_DOCUMENT_SCHEMA_VERSION,
    revision: 0,
    content,
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
  return (document?.content || []).map(getNodeText).join('\n')
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
  const nodes = document?.content || []
  return nodes.map((node) => {
    const attrs = node.attrs || {}
    if (isUntouched(node)) return `${attrs.leadingMarkdown || ''}${attrs.rawMarkdown || ''}`
    return `${attrs.leadingMarkdown || ''}${renderNode(node)}`
  }).join('') + (document?.meta?.trailingMarkdown || '')
}

/**
 * Resolve a Markdown cursor offset to the stable block that owns it.
 *
 * The textarea and legacy advisor still speak in absolute Markdown offsets;
 * this adapter lets them carry the structured block identity alongside that
 * legacy range until the Notebook editor becomes the default surface.
 */
export function getWritingBlockAtPosition(document, position = 0) {
  const nodes = Array.isArray(document?.content) ? document.content : []
  if (!nodes.length) return null

  const cursor = Math.max(0, Number.isFinite(Number(position)) ? Number(position) : 0)
  let offset = 0
  let last = null

  for (const node of nodes) {
    const attrs = node?.attrs || {}
    const leadingMarkdown = String(attrs.leadingMarkdown || '')
    const bodyMarkdown = isUntouched(node) ? String(attrs.rawMarkdown || '') : renderNode(node)
    const start = offset + leadingMarkdown.length
    const end = start + bodyMarkdown.length
    const candidate = {
      blockId: attrs.blockId || null,
      blockRevision: Number(attrs.revision || 0),
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
    if (node?.attrs?.blockKind === 'source-reference') return 'source-reference'
    if (node?.attrs?.blockKind === 'author-note') return 'author-note'
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
  return (document?.content || []).map((node) => {
    const inline = recoverLiteralInlineMarkdown(node)
    const editorNode = {
      type: editorNodeTypeForWritingNode(node),
      attrs: {
        blockId: node.attrs?.blockId || null,
        blockRevision: Number(node.attrs?.revision || 0),
        blockKind: node.attrs?.kind || 'prose'
      }
    }
    if (node.type === 'sceneHeading') editorNode.attrs.level = Number(node.attrs?.level || 1)
    if (node.type !== 'divider') {
      editorNode.content = editorNode.type === 'blockquote'
        ? [{ type: 'paragraph', content: inline }]
        : inline
    }
    return editorNode
  })
}

export function editorContentToWritingDocument(content, previousDocument = null) {
  const previousById = new Map((previousDocument?.content || []).map((node) => [node.attrs?.blockId, node]))
  const nodes = (content?.content || content || []).map((node, index) => {
    const blockId = node.attrs?.blockId || `block-editor-${index + 1}`
    const kind = writingKindForEditorNode(node)
    const inline = editorInlineContent(node)
    const text = inline.map(getNodeText).join('')
    const previous = previousById.get(blockId)
    const previousRevision = Number(previous?.attrs?.revision || 0)
    const unchanged = previous?.attrs?.originalText === text
    const revision = unchanged
      ? Number(node.attrs?.blockRevision ?? previousRevision)
      : Math.max(Number(node.attrs?.blockRevision || 0), previousRevision + (previous ? 1 : 0))
    const attrs = {
      blockId,
      revision,
      kind,
      rawMarkdown: unchanged ? previous.attrs.rawMarkdown : null,
      leadingMarkdown: previous
        ? previous.attrs.leadingMarkdown || (index > 0 ? '\n' : '')
        : index > 0 ? '\n' : '',
      originalText: unchanged ? previous.attrs.originalText : null
    }
    if (node.type === 'heading') attrs.level = Number(node.attrs?.level || 1)
    return {
      type: node.type === 'heading'
        ? 'sceneHeading'
        : node.type === 'horizontalRule'
          ? 'divider'
          : node.type === 'blockquote'
            ? kind === 'source-reference'
              ? 'sourceReference'
              : kind === 'author-note'
                ? 'authorNote'
                : 'quote'
            : 'paragraph',
      attrs,
      ...(node.type === 'horizontalRule' ? {} : { content: inline })
    }
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
  const previousNodes = Array.isArray(previousDocument?.content) ? previousDocument.content : []
  const unused = new Set(previousNodes.map((_, index) => index))
  const matches = new Map()
  const exactBuckets = new Map()

  previousNodes.forEach((node, index) => {
    const key = blockMatchKey(node)
    if (!exactBuckets.has(key)) exactBuckets.set(key, [])
    exactBuckets.get(key).push(index)
  })

  nextDocument.content.forEach((node, nextIndex) => {
    const bucket = exactBuckets.get(blockMatchKey(node)) || []
    const match = bucket.find((index) => unused.has(index))
    if (match == null) return
    matches.set(nextIndex, match)
    unused.delete(match)
  })

  nextDocument.content.forEach((node, nextIndex) => {
    if (matches.has(nextIndex)) return
    const previous = previousNodes[nextIndex]
    if (!previous || !unused.has(nextIndex)) return
    if ((previous.attrs?.kind || 'prose') !== (node.attrs?.kind || 'prose')) return
    matches.set(nextIndex, nextIndex)
    unused.delete(nextIndex)
  })

  const content = nextDocument.content.map((node, nextIndex) => {
    const previousIndex = matches.get(nextIndex)
    if (previousIndex == null) return node

    const previous = previousNodes[previousIndex]
    const unchanged = blockMatchKey(previous) === blockMatchKey(node)
    return {
      ...node,
      attrs: {
        ...node.attrs,
        blockId: previous.attrs?.blockId || node.attrs?.blockId,
        revision: unchanged
          ? Number(previous.attrs?.revision || 0)
          : Number(previous.attrs?.revision || 0) + 1,
        rawMarkdown: unchanged ? previous.attrs?.rawMarkdown || null : null,
        originalText: unchanged ? previous.attrs?.originalText ?? getNodeText(node) : null
      }
    }
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
  const ids = new Set()
  for (const node of document?.content || []) {
    const kind = node?.attrs?.kind
    const blockId = node?.attrs?.blockId
    if (!BLOCK_TYPES.has(kind)) errors.push(`kind:${kind || 'missing'}`)
    if (!blockId || ids.has(blockId)) errors.push(`blockId:${blockId || 'missing'}`)
    ids.add(blockId)
    if (!Number.isInteger(node?.attrs?.revision) || node.attrs.revision < 0) errors.push(`revision:${blockId || 'missing'}`)
    if (kind !== 'divider' && !Array.isArray(node.content)) errors.push(`content:${blockId || 'missing'}`)
  }
  return { valid: errors.length === 0, errors }
}

export function markWritingNodeChanged(node, content) {
  return {
    ...node,
    attrs: {
      ...(node.attrs || {}),
      revision: Number(node.attrs?.revision || 0) + 1,
      rawMarkdown: null,
      leadingMarkdown: node.attrs?.leadingMarkdown || '',
      originalText: null
    },
    content
  }
}

export const __private__ = { hashText, classifyToken, renderNode, renderInline }
