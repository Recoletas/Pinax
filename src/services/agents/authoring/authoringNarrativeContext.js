import {
  createWritingDocument,
  getNodePlainText,
  getWritingDocumentNodes,
  validateWritingDocument
} from '../../writing/writingDocumentSchema.js'
import { resolveNarrativeSceneSummary } from '../narrativeSceneSummary.js'

export const AUTHORING_NARRATIVE_CONTEXT_LIMITS = Object.freeze({
  compressAfterChars: 6000,
  keepRecentMessages: 4,
  maxMessageChars: 1600
})

function clip(value, limit) {
  const text = String(value || '').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

function splitLongText(value, limit) {
  const text = String(value || '').trim()
  if (!text) return []
  if (text.length <= limit) return [text]
  const parts = []
  for (let start = 0; start < text.length; start += limit) {
    parts.push(text.slice(start, start + limit))
  }
  return parts
}

function documentMessages(document, markdown) {
  const source = validateWritingDocument(document).valid
    ? document
    : createWritingDocument(markdown)
  return getWritingDocumentNodes(source).flatMap(({ node, unit, nodeIndex }) => (
    splitLongText(getNodePlainText(node), AUTHORING_NARRATIVE_CONTEXT_LIMITS.maxMessageChars)
      .map((content, segmentIndex) => ({
        id: [unit?.attrs?.unitId || 'unit', node?.attrs?.nodeId || nodeIndex, segmentIndex].join(':'),
        role: 'assistant',
        content: clip(content, AUTHORING_NARRATIVE_CONTEXT_LIMITS.maxMessageChars)
      }))
  )).filter((message) => message.content)
}

export function buildAuthoringNarrativeContext({
  document = null,
  markdown = '',
  projectId = '',
  chapterId = '',
  revision = '',
  previousSummary = null
} = {}) {
  const allMessages = documentMessages(document, markdown)
  const totalChars = allMessages.reduce((sum, message) => sum + message.content.length, 0)
  const shouldCompress = totalChars > AUTHORING_NARRATIVE_CONTEXT_LIMITS.compressAfterChars
    && allMessages.length > AUTHORING_NARRATIVE_CONTEXT_LIMITS.keepRecentMessages

  if (!shouldCompress) {
    return {
      compressed: false,
      reused: false,
      revision: String(revision || ''),
      messages: allMessages,
      sceneSummary: null,
      totalChars
    }
  }

  const resolved = resolveNarrativeSceneSummary({
    messages: allMessages,
    previousSummary,
    projectId,
    sessionId: chapterId,
    keepRecentMessages: AUTHORING_NARRATIVE_CONTEXT_LIMITS.keepRecentMessages
  })
  return {
    compressed: Boolean(resolved.summary),
    reused: Boolean(resolved.reused),
    revision: String(revision || ''),
    messages: allMessages.slice(-AUTHORING_NARRATIVE_CONTEXT_LIMITS.keepRecentMessages),
    sceneSummary: resolved.summary,
    totalChars
  }
}
