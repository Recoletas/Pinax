import express from 'express'
import { getAdvice } from '../services/openclawService.js'

const router = express.Router()

router.post('/advice', async (req, res) => {
  const { context, question } = req.body

  if (!context || !question) {
    return res.status(400).json({ error: '缺少 context 或 question 参数' })
  }

  if (typeof context !== 'string' || typeof question !== 'string') {
    return res.status(400).json({ error: 'context 和 question 必须是字符串' })
  }

  try {
    const advice = await getAdvice(context, question)
    res.json({ advice })
  } catch (error) {
    console.error('[OpenClaw] advice error:', error.message)
    res.status(500).json({ error: error.message || '获取建议失败' })
  }
})

export default router