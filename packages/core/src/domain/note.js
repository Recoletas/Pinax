function text(value) {
  return String(value ?? '').trim()
}

// 字数口径：CJK 单字 + 英文单词。三端共用同一计数，不再各写一份。
export function countNoteWords(input) {
  const value = text(input)
  if (!value) return 0
  const chinese = (value.match(/[一-龥]/g) || []).length
  const english = (value.match(/[a-zA-Z]+/g) || []).length
  return chinese + english
}

// 标题回退：取正文首个非空行的前 18 字；无正文则空（显示占位归 Host）。
export function deriveNoteTitle(content) {
  const firstLine = text(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return firstLine ? firstLine.slice(0, 18) : ''
}

function normalizeNoteSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  return {
    type: text(source.type) || 'manual',
    assetId: text(source.assetId),
    assetKind: text(source.assetKind),
    projectId: source.projectId ?? null,
    sourceType: text(source.sourceType),
    sourceId: text(source.sourceId),
    messageIds: Array.isArray(source.messageIds) ? source.messageIds : []
  }
}

function effectiveWordCount(raw, content) {
  const numeric = Number(raw.wordCount)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : countNoteWords(content)
}

/** 笔记的 Core 规范形状：id 必存在；title/content 去空白；缺 wordCount 时按正文重算；source 归一。 */
export function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  const content = typeof raw.content === 'string' ? raw.content : ''
  const note = {
    ...raw,
    id,
    title: text(raw.title),
    content,
    contentFormat: text(raw.contentFormat) || 'md',
    wordCount: effectiveWordCount(raw, content),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
  }
  const source = normalizeNoteSource(raw.source)
  if (source) note.source = source
  else delete note.source
  return note
}

export function createNote(input = {}, { now = new Date().toISOString() } = {}) {
  const id = text(input.id)
  if (!id) return null
  const content = text(input.content)
  const note = {
    ...input.extra && typeof input.extra === 'object' ? input.extra : {},
    id,
    title: text(input.title) || deriveNoteTitle(content),
    content,
    contentFormat: text(input.contentFormat) || 'md',
    wordCount: effectiveWordCount(input, content),
    createdAt: text(input.createdAt) || now,
    updatedAt: text(input.updatedAt) || now
  }
  const source = normalizeNoteSource(input.source)
  if (source) note.source = source
  return note
}

/** 更新规则：改正文则重算字数（除非显式给 wordCount）；可改标题；刷新 updatedAt。富字段保留。 */
export function updateNote(current, patch = {}, { now } = {}) {
  const next = { ...current }
  if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
    next.content = typeof patch.content === 'string' ? patch.content : ''
    next.wordCount = Number.isFinite(Number(patch.wordCount)) && Number(patch.wordCount) >= 0
      ? Math.floor(Number(patch.wordCount))
      : countNoteWords(next.content)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    next.title = text(patch.title)
  }
  next.updatedAt = typeof now === 'string' && now ? now : new Date().toISOString()
  return next
}
