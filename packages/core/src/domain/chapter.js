function text(value) {
  return String(value ?? '').trim()
}

export function chapterRevision(chapter) {
  const direct = Number(chapter?.revision)
  if (Number.isSafeInteger(direct) && direct >= 0) return direct
  const document = Number(chapter?.editorDocument?.revision)
  return Number.isSafeInteger(document) && document >= 0 ? document : 0
}

/**
 * 章节的 Core 规范形状。旧数据里的未知字段原样保留（宿主可能仍在用），
 * 但 Core 只承诺 id/title/content/revision/editorDocument 这几个字段的语义。
 */
export function normalizeChapterRecord(raw, { bookId = '' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  const normalized = {
    ...raw,
    id,
    // 空标题是旧版合法状态；显示用“未命名章节”由 Host 决定，Core 不写死文案。
    title: text(raw.title),
    content: typeof raw.content === 'string' ? raw.content : '',
    revision: chapterRevision(raw),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
  }
  if (bookId) normalized.bookId = text(bookId)
  if (raw.editorDocument && typeof raw.editorDocument === 'object' && !Array.isArray(raw.editorDocument)) {
    normalized.editorDocument = raw.editorDocument
  } else {
    delete normalized.editorDocument
  }
  return normalized
}

export function createChapterRecord({ id, title, content = '', editorDocument = null, now = new Date().toISOString(), extra = {} } = {}) {
  const normalizedId = text(id)
  if (!normalizedId) return null
  const record = {
    ...extra,
    id: normalizedId,
    title: text(title),
    content: typeof content === 'string' ? content : '',
    revision: 1,
    createdAt: now,
    updatedAt: now
  }
  if (editorDocument && typeof editorDocument === 'object' && !Array.isArray(editorDocument)) {
    record.editorDocument = editorDocument
  }
  return record
}

export function chapterSummary(chapter) {
  return {
    id: chapter.id,
    title: chapter.title,
    revision: chapterRevision(chapter),
    updatedAt: chapter.updatedAt ?? null
  }
}
