// 手稿时间位置索引（文本工作台 v3 Phase 3）：
// chapterOrderRevision 是章节 id+顺序的确定性指纹——重排/增删章即失效，
// 挂起的跨章上下文请求据此 stale。unit order index 支撑 unit 级 before/after。

function fnv1a(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

// book: { id, chapters: [{ id, editorDocument? }] }
export function buildManuscriptPositionIndex(book) {
  const chapters = Array.isArray(book?.chapters) ? book.chapters : []
  const entries = chapters.map((chapter, order) => ({
    chapterId: String(chapter?.id || ''),
    order,
    unitIds: Array.isArray(chapter?.editorDocument?.content)
      ? chapter.editorDocument.content.map((unit) => String(unit?.attrs?.unitId || '')).filter(Boolean)
    : []
  }))
  // 单元数量相同的 reorder 仍会改变时序语义；指纹必须包含完整有序 unitIds，
  // 不能只记录 length，否则问全书证据与后续因果定位会静默沿用旧顺序。
  const orderRevision = fnv1a(entries.map((entry) => (
    `${entry.chapterId}@${entry.order}:${entry.unitIds.join(',')}`
  )).join('|'))
  return {
    bookId: String(book?.id || ''),
    chapterOrderRevision: `order-${orderRevision}`,
    entries
  }
}

// temporalRelation：before-target / at-target / after-target / unknown。
// 任一端不在索引内（含索引过期未重建）→ unknown，调用方 fail-closed。
export function resolveTemporalRelation(index, targetChapterId, sourceChapterId) {
  const target = String(targetChapterId || '')
  const source = String(sourceChapterId || '')
  if (!index || !Array.isArray(index.entries)) return 'unknown'
  const targetEntry = index.entries.find((entry) => entry.chapterId === target)
  const sourceEntry = index.entries.find((entry) => entry.chapterId === source)
  if (!targetEntry || !sourceEntry) return 'unknown'
  if (sourceEntry.order < targetEntry.order) return 'before-target'
  if (sourceEntry.order > targetEntry.order) return 'after-target'
  return 'at-target'
}

// unit 级位置：同章内 source unit 是否在 target unit 之前。
export function resolveUnitRelation(index, chapterId, targetUnitId, sourceUnitId) {
  const entry = (index?.entries || []).find((item) => item.chapterId === String(chapterId || ''))
  if (!entry) return 'unknown'
  const targetAt = entry.unitIds.indexOf(String(targetUnitId || ''))
  const sourceAt = entry.unitIds.indexOf(String(sourceUnitId || ''))
  if (targetAt < 0 || sourceAt < 0) return 'unknown'
  if (sourceAt < targetAt) return 'before-target'
  if (sourceAt > targetAt) return 'after-target'
  return 'at-target'
}
