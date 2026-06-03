import express from 'express'
import { getAdvice } from '../services/openclawService.js'

const router = express.Router()

router.post('/proactive-check', async (req, res) => {
  const { text, worldBookEntries = [], characters = [] } = req.body || {}

  if (typeof text !== 'string' || !text.trim()) {
    return res.json({ alerts: [] })
  }

  const context = {
    text: text.trim(),
    worldBookEntries,
    characters
  }

  const question = [
    '请对当前写作内容做风险体检。',
    '仅返回 JSON：{"alerts":[{"type":"string","level":"critical|warning|info","title":"string","description":"string","suggestion":"string"}]}',
    '不要输出代码块，不要输出额外解释。'
  ].join('\n')

  try {
    const advice = await getAdvice(context, question, {
      taskType: 'advisor.review.chapter',
      options: { source: 'proactive-check' },
      mode: 'json'
    })

    let payload = null
    try {
      payload = JSON.parse(String(advice || '').trim())
    } catch {
      payload = null
    }

    const alerts = Array.isArray(payload?.alerts)
      ? payload.alerts.filter((item) => item && typeof item === 'object')
      : []

    return res.json({ alerts })
  } catch (error) {
    console.warn('[OpenClaw] proactive-check failed:', error?.message || error)
    return res.json({ alerts: [] })
  }
})

export default router
