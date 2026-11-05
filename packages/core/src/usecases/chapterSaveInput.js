import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'

/**
 * 章节保存输入的共享校验。异步 Service（移动/文件）与同步 Service（Web 本地）
 * 必须使用这同一份规则，避免两端对空标题、content 类型或 revision 的判断分叉。
 */
export function validateChapterSaveInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '保存输入必须是对象')
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, 'expectedRevision 必须是 ≥0 的整数', { expectedRevision: input.expectedRevision })
  }
  const patch = {}
  if (input.title !== undefined) {
    // 空标题是旧版合法状态，显示文案归 Host；这里只做字符串归一。
    patch.title = String(input.title ?? '').trim()
  }
  if (input.content !== undefined) {
    if (typeof input.content !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'content 必须是字符串')
    patch.content = input.content
  }
  if (input.editorDocument !== undefined) {
    if (input.editorDocument !== null && (typeof input.editorDocument !== 'object' || Array.isArray(input.editorDocument))) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'editorDocument 必须是对象或 null')
    }
    patch.editorDocument = input.editorDocument
  }
  if (!Object.keys(patch).length) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '保存至少要带 title、content 或 editorDocument')
  }
  return ok({ patch, expectedRevision: input.expectedRevision })
}
