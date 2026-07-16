import { Router } from 'express'
import { getRoomBySlug, createRoom, listRooms } from '../realtime/RoomRegistry.js'
import { validateNickname } from '../realtime/validators.js'

const router = Router()

router.get('/api/rooms/:roomSlug', (req, res) => {
  const room = getRoomBySlug(req.params.roomSlug)
  if (!room) return res.status(404).json({ error: 'ERR_ROOM_NOT_FOUND', message: '房间不存在' })
  return res.json(room.toPublicSummary())
})

router.post('/api/rooms', (req, res) => {
  const { slug, hostNickname } = req.body || {}
  if (!slug || typeof slug !== 'string' || slug.trim().length < 1) {
    return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: '缺少房间标识' })
  }
  const nickValid = validateNickname(hostNickname)
  if (!nickValid.ok) {
    return res.status(400).json({ error: nickValid.error, message: nickValid.message })
  }
  const existing = getRoomBySlug(slug)
  if (existing) return res.status(409).json({ error: 'ERR_ROOM_EXISTS', message: '该 slug 已被占用' })
  const room = createRoom({ slug, hostNickname: nickValid.value })
  return res.status(201).json(room.toPublicSummary())
})

router.get('/api/rooms', (_req, res) => {
  return res.json(listRooms())
})

export default router
