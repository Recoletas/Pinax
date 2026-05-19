import express from 'express'
import { memoryService } from '../services/memoryService.js'

const router = express.Router()

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return null
  return {
    id: card.id || '',
    content: String(card.content || '').trim(),
    emotion: String(card.emotion || '').trim()
  }
}

function buildPreferenceMemory(action, card) {
  const content = card?.content || ''
  const emotion = card?.emotion || '未知'

  if (action === 'adopt_card') {
    return `用户采纳了卡片，情绪标签为「${emotion}」。卡片内容：${content}`
  }

  if (action === 'emotion_changed') {
    return `用户调整了卡片情绪，新的情绪标签为「${emotion}」。卡片内容：${content}`
  }

  return `用户执行了偏好相关动作「${action}」。情绪标签：${emotion}。卡片内容：${content}`
}

router.post('/record', async (req, res) => {
  const { userId, action, card } = req.body || {}

  if (!userId || !action || !card) {
    return res.status(400).json({
      error: 'userId, action and card are required'
    })
  }

  const apiKey = process.env.MEM0_API_KEY
  const host = process.env.MEM0_HOST || ''

  const normalizedCard = normalizeCard(card)
  if (!normalizedCard || !normalizedCard.content) {
    return res.status(400).json({ error: 'card.content is required' })
  }

  const memoryText = buildPreferenceMemory(action, normalizedCard)

  const result = await memoryService.add({
    apiKey,
    host,
    userId,
    text: memoryText,
    metadata: {
      source: 'preferences_record',
      action,
      cardId: normalizedCard.id,
      emotion: normalizedCard.emotion
    }
  })

  return res.json({
    success: true,
    recorded: Boolean(result)
  })
})

export default router
