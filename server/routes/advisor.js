import express from 'express'
import { getAdvice } from '../services/openclawService.js'
import {
  createAdvisorTaskResponse,
  normalizeAdvisorTaskType
} from '../services/advisorTaskService.js'

const router = express.Router()

async function handleAdvisorTask(req, res, defaults = {}) {
  const {
    context,
    question,
    taskType = defaults.taskType,
    target = null,
    options = {},
    mode = defaults.mode
  } = req.body || {}

  if (context == null || question == null) {
    return res.status(400).json({ error: '缺少 context 或 question 参数' })
  }

  const normalizedTaskType = normalizeAdvisorTaskType(taskType)

  try {
    const advice = await getAdvice(context, question, {
      taskType: normalizedTaskType,
      target,
      options,
      mode
    })
    res.json(createAdvisorTaskResponse({
      taskType: normalizedTaskType,
      advice,
      target
    }))
  } catch (error) {
    const message = error.message || '获取建议失败'
    if (message.includes('缺少 context 或 question 参数')) {
      return res.status(400).json({ error: message })
    }

    console.error('[Advisor] advice error:', message)
    res.status(500).json({ error: message })
  }
}

router.post('/task', async (req, res) => {
  await handleAdvisorTask(req, res)
})

router.post('/advice', async (req, res) => {
  await handleAdvisorTask(req, res, { taskType: 'advisor.review.chapter' })
})

export default router
