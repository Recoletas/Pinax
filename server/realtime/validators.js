const MAX_NICKNAME = 30
const MAX_MESSAGE = 2000
const MAX_ACTION_TEXT = 500
const MAX_MEMBERS = 20
const RATE_LIMIT_MS = 100 // 10 commands/sec per connection

const rateBuckets = new Map()

export function validateNickname (nickname) {
  if (!nickname || typeof nickname !== 'string') return { ok: false, error: 'ERR_INVALID_NICKNAME', message: '昵称不能为空' }
  const trimmed = nickname.trim()
  if (trimmed.length < 1) return { ok: false, error: 'ERR_INVALID_NICKNAME', message: '昵称不能为空' }
  if (trimmed.length > MAX_NICKNAME) return { ok: false, error: 'ERR_NICKNAME_TOO_LONG', message: '昵称最多30个字符' }
  return { ok: true, value: trimmed }
}

export function validateMessage (text) {
  if (!text || typeof text !== 'string') return { ok: false, error: 'ERR_INVALID_MESSAGE', message: '消息不能为空' }
  const trimmed = text.trim()
  if (trimmed.length < 1) return { ok: false, error: 'ERR_INVALID_MESSAGE', message: '消息不能为空' }
  if (trimmed.length > MAX_MESSAGE) return { ok: false, error: 'ERR_MESSAGE_TOO_LONG', message: '消息最多2000个字符' }
  return { ok: true, value: trimmed }
}

export function validateActionText (text) {
  if (!text || typeof text !== 'string') return { ok: false, error: 'ERR_INVALID_ACTION', message: '动作提案不能为空' }
  const trimmed = text.trim()
  if (trimmed.length < 1) return { ok: false, error: 'ERR_INVALID_ACTION', message: '动作提案不能为空' }
  if (trimmed.length > MAX_ACTION_TEXT) return { ok: false, error: 'ERR_ACTION_TOO_LONG', message: '动作提案最多500个字符' }
  return { ok: true, value: trimmed }
}

export function checkMemberLimit (room) {
  return room.members.size < MAX_MEMBERS
}

export function checkRateLimit (socketId) {
  const now = Date.now()
  const bucket = rateBuckets.get(socketId)
  if (!bucket) {
    rateBuckets.set(socketId, { count: 1, start: now })
    return true
  }
  const elapsed = now - bucket.start
  if (elapsed >= RATE_LIMIT_MS) {
    bucket.count = 1
    bucket.start = now
    return true
  }
  bucket.count += 1
  if (bucket.count > 10) return false
  return true
}

export function clearRateBucket (socketId) {
  rateBuckets.delete(socketId)
}

export const ERROR_CODES = {
  ERR_INVALID_NICKNAME: 4000,
  ERR_NICKNAME_TOO_LONG: 4001,
  ERR_INVALID_MESSAGE: 4002,
  ERR_MESSAGE_TOO_LONG: 4003,
  ERR_INVALID_ACTION: 4004,
  ERR_ACTION_TOO_LONG: 4005,
  ERR_ROOM_NOT_FOUND: 4040,
  ERR_ROOM_FULL: 4290,
  ERR_NOT_HOST: 4030,
  ERR_RATE_LIMITED: 4291,
  ERR_UNKNOWN_COMMAND: 4006,
  ERR_PARSE_ERROR: 4007,
  ERR_COMMAND_DUPLICATE: 4090
}
