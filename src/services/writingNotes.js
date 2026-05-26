import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

function normalizeText(value) {
  return String(value || '').trim()
}

function countWritingWords(text) {
  const normalized = normalizeText(text)
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

function normalizeNoteSource(source = null) {
  if (!source || typeof source !== 'object') return null

  return {
    type: String(source.type || 'manual').trim() || 'manual',
    assetId: String(source.assetId || '').trim(),
    assetKind: String(source.assetKind || '').trim(),
    projectId: source.projectId ?? null,
    sourceType: String(source.sourceType || '').trim(),
    sourceId: String(source.sourceId || '').trim(),
    messageIds: Array.isArray(source.messageIds) ? source.messageIds : []
  }
}

export function listWritingNotes() {
  const stored = getItem(STORAGE_KEYS.WRITING_NOTES)
  return Array.isArray(stored) ? stored : []
}

export function buildWritingNoteTitle(content, fallbackLabel = '笔记') {
  const firstLine = normalizeText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (firstLine) {
    return firstLine.slice(0, 18)
  }

  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `${fallbackLabel} ${mm}-${dd} ${hh}:${mi}`
}

export function createWritingNote(input = {}) {
  const now = new Date().toISOString()
  const content = normalizeText(input.content)
  const title = normalizeText(input.title) || buildWritingNoteTitle(content, input.fallbackLabel || '笔记')
  const source = normalizeNoteSource(input.source)

  return {
    id: input.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    contentFormat: input.contentFormat || 'md',
    wordCount: Number.isFinite(Number(input.wordCount))
      ? Math.max(0, Math.floor(Number(input.wordCount)))
      : countWritingWords(content),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    ...(source ? { source } : {})
  }
}

export function createWritingNoteFromAsset(asset = {}, options = {}) {
  const content = normalizeText(asset.content)
  const title = normalizeText(asset.title) || buildWritingNoteTitle(content, options.fallbackLabel || '素材')

  return createWritingNote({
    title,
    content,
    contentFormat: options.contentFormat || 'md',
    wordCount: options.wordCount,
    source: {
      type: 'narrative-asset',
      assetId: String(asset.id || '').trim(),
      assetKind: String(asset.kind || '').trim(),
      projectId: asset.projectId ?? null,
      sourceType: String(asset.source?.type || '').trim(),
      sourceId: String(asset.source?.id || '').trim(),
      messageIds: Array.isArray(asset.source?.messageIds) ? asset.source.messageIds : []
    }
  })
}

export function prependWritingNote(input = {}) {
  const note = createWritingNote(input)
  if (!note.content) {
    throw new Error('笔记内容不能为空')
  }

  const current = listWritingNotes()
  setItem(STORAGE_KEYS.WRITING_NOTES, [note, ...current])
  return note
}

export function replaceWritingNotes(notes = []) {
  const next = Array.isArray(notes)
    ? notes.map((note) => createWritingNote(note))
    : []
  setItem(STORAGE_KEYS.WRITING_NOTES, next)
  return next
}
