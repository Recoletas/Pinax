import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { outlineNodeRevision } from './outlineNode.js'

function text(value) {
  return String(value ?? '').trim()
}

// 本切片可写字段;换父级(重排树结构,需环检测)与边图不在这里,故 parentId 不在列。
export const OUTLINE_NODE_MUTABLE_FIELDS = Object.freeze(['title', 'intent', 'status', 'order'])

/**
 * 大纲节点补丁规则:乐观并发 + 白名单字段 + revision 递增 + 更新时间。纯函数,不碰存储。
 * 返回新对象;需要保持引用恒等的 Host 自行就地写回原节点。
 */
export function applyOutlineNodePatch(current, patch, { expectedRevision, now } = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '节点补丁必须是对象')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'parentId')) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '换父级不在本切片(需环检测),请走重排用例')
  }
  const actual = outlineNodeRevision(current)
  if (actual !== expectedRevision) {
    return fail(CORE_ERROR_CODES.STALE_REVISION, '节点修订号已变化', { expected: expectedRevision, actual })
  }

  const next = { ...current }
  let changed = false
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    if (typeof patch.title !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'title 必须是字符串')
    next.title = text(patch.title); changed = true
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'intent')) {
    if (typeof patch.intent !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'intent 必须是字符串')
    next.intent = text(patch.intent); changed = true
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    if (typeof patch.status !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'status 必须是字符串')
    next.status = text(patch.status); changed = true
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'order')) {
    const order = Number(patch.order)
    if (!Number.isFinite(order)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'order 必须是有限数字')
    next.order = order; changed = true
  }
  if (!changed) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '至少要修改一个可写字段', { allowed: [...OUTLINE_NODE_MUTABLE_FIELDS] })
  }

  next.revision = actual + 1
  next.updatedAt = typeof now === 'string' && now ? now : new Date().toISOString()
  return ok(next)
}
