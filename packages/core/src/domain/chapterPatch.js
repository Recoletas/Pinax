import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { chapterRevision } from './chapter.js'

// 结构化侧车字段：正文读取会优先用 editorDocument，只写正文时必须一并清掉，
// 否则旧侧车会盖住新正文。放这里，三端不再各自维护一份“哪些字段算侧车”。
export const CHAPTER_SIDECAR_KEYS = ['editorDocument', 'editorDocumentSchemaVersion']

/**
 * 章节补丁的应用规则：修订号乐观并发、content-only 保存清侧车、revision 递增、更新时间。
 * 纯函数，不碰存储——Host 负责定位章节与落盘，语义只在这一处。返回的 next 是新对象；
 * 需要保持引用恒等的 Host（页面里的当前章对象）应自行把 next 就地写回原对象。
 */
export function applyChapterPatch(current, patch, { expectedRevision, now } = {}) {
  const actual = chapterRevision(current)
  if (actual !== expectedRevision) {
    return fail(CORE_ERROR_CODES.STALE_REVISION, '章节修订号已变化', { expected: expectedRevision, actual })
  }

  const next = { ...current, ...patch }
  if (patch?.editorDocument === null) delete next.editorDocument
  // 只写正文不保留旧 editorDocument；显式带 editorDocument 时以提交为准。
  if (patch?.content !== undefined && patch?.editorDocument === undefined) {
    for (const key of CHAPTER_SIDECAR_KEYS) delete next[key]
  }
  next.revision = actual + 1
  next.updatedAt = typeof now === 'string' && now ? now : new Date().toISOString()
  return ok(next)
}
