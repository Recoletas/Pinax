import { shallowRef } from 'vue'
import {
  WRITING_DOCUMENT_SCHEMA_VERSION,
  createWritingDocument,
  getChapterDocument,
  getChapterMarkdown,
  getWritingBlockAtPosition,
  getWritingDocumentMarkdown,
  migrateWritingDocumentToV3,
  mergeWritingDocumentFromMarkdown,
  validateWritingDocument
} from '../services/writing/writingDocumentSchema.js'

function cloneDocument(document) {
  return document ? JSON.parse(JSON.stringify(document)) : null
}

function normalizeDocument(document, fallbackMarkdown = '') {
  const candidate = migrateWritingDocumentToV3(cloneDocument(document), fallbackMarkdown)
  const validation = validateWritingDocument(candidate)
  return validation.valid ? candidate : null
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''))
}

export function useWritingDocument() {
  const document = shallowRef(null)

  function clear() {
    document.value = null
  }

  function loadChapterDocument(chapter, fallbackMarkdown = '') {
    const stored = normalizeDocument(chapter?.editorDocument, chapter?.content || fallbackMarkdown)
    if (stored) {
      document.value = stored
      return getWritingDocumentMarkdown(stored)
    }

    const imported = createWritingDocument(fallbackMarkdown)
    document.value = imported
    return String(fallbackMarkdown || '')
  }

  function readChapterMarkdown(chapter) {
    return getChapterMarkdown(chapter)
  }

  function hasStructuredDocument(chapter) {
    return Boolean(getChapterDocument(chapter))
  }

  function readChapterSource(chapter) {
    const structured = hasStructuredDocument(chapter)
    const raw = readChapterMarkdown(chapter)
    return {
      raw,
      format: structured ? 'md' : chapter?.contentFormat || (looksLikeHtml(raw) ? 'html' : 'md'),
      structured
    }
  }

  function getBlockAtPosition(position, markdown = null) {
    if (markdown == null) return getWritingBlockAtPosition(document.value, position)

    const source = String(markdown ?? '')
    const storedSource = document.value ? getWritingDocumentMarkdown(document.value) : null
    const sourceDocument = storedSource === source
      ? document.value
      : createWritingDocument(source)
    return getWritingBlockAtPosition(sourceDocument, position)
  }

  function syncFromMarkdown(markdown = '') {
    const source = String(markdown ?? '')
    if (document.value && getWritingDocumentMarkdown(document.value) === source) return document.value

    const next = mergeWritingDocumentFromMarkdown(source, document.value)
    document.value = next
    return next
  }

  function persistChapterDocument(chapter, markdown = '') {
    if (!chapter) return null
    const next = syncFromMarkdown(markdown)
    chapter.editorDocument = cloneDocument(next)
    chapter.editorDocumentSchemaVersion = WRITING_DOCUMENT_SCHEMA_VERSION
    chapter.content = getWritingDocumentMarkdown(next)
    chapter.contentFormat = 'md'
    return next
  }

  return {
    document,
    clear,
    readChapterMarkdown,
    readChapterSource,
    hasStructuredDocument,
    loadChapterDocument,
    getBlockAtPosition,
    syncFromMarkdown,
    persistChapterDocument
  }
}
