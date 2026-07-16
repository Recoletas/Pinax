import { Router } from 'express'
import { getRoomBySlug, createRoom, listRooms } from '../realtime/RoomRegistry.js'

const router = Router()

router.get('/api/rooms/:roomSlug', (req, res) => {
  const room = getRoomBySlug(req.params.roomSlug)
  if (!room) return res.status(404).json({ error: 'ERR_ROOM_NOT_FOUND', message: '房间不存在' })
  return res.json(room.toPublicSummary())
})

router.post('/api/rooms', (req, res) => {
  const { slug, hostNickname } = req.body || {}
  if (!slug || !hostNickname) {
    return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: '缺少 roomSlug 或 nickname' })
  }
  const existing = getRoomBySlug(slug)
  if (existing) return res.status(409).json({ error: 'ERR_ROOM_EXISTS', message: '该 slug 已被占用' })
  const room = createRoom({ slug, hostNickname })
  return res.status(201).json(room.toPublicSummary())
})

router.get('/api/rooms', (_req, res) => {
  return res.json(listRooms())
})

export default router
