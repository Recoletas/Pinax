import express from 'express'
import { getAdvice } from '../services/openclawService.js'

const router = express.Router()

router.post('/advice', async (req, res) => {
  const { context, question } = req.body || {}

  if (context == null || question == null) {
    return res.status(400).json({ error: '缺少 context 或 question 参数' })
  }

  try {
    const advice = await getAdvice(context, question)
    res.json({ advice })
  } catch (error) {
    const message = error.message || '获取建议失败'
    if (message.includes('缺少 context 或 question 参数')) {
      return res.status(400).json({ error: message })
    }

    console.error('[OpenClaw] advice error:', message)
    res.status(500).json({ error: message })
  }
})

export default router
