import express from 'express'
import { randomUUID } from 'crypto'
import {
  createAdvisorTaskResponse,
  normalizeAdvisorTaskType
} from '../services/advisorTaskService.js'
import {
  AGENT_TASK_ERROR_CODES,
  validateServerTaskType
} from '../services/agentTaskAllowlist.js'
import {
  AGENT_CONTEXT_ERROR_CODES,
  agentEnvelopeToPromptText,
  clipAgentContextEnvelope,
  collectAgentEnvelopeSourceRefs,
  createAgentContextLedger,
  validateAgentContextEnvelope
} from '../../shared/agentContextContract.js'
import { runAdvisorAgent } from '../services/advisorAgentRunner.js'

const router = express.Router()

async function handleAdvisorTask(req, res, defaults = {}) {
  const {
    envelope,
    context,
    question,
    taskType = defaults.taskType,
    target = null,
    options = {},
    mode = defaults.mode,
    trace = {}
  } = req.body || {}

  if (
    !String(question || '').trim()
    || (!envelope && context == null)
    || (!envelope && !defaults.allowLegacy)
  ) {
    return res.status(400).json({
      code: AGENT_CONTEXT_ERROR_CODES.INVALID,
      error: '缺少 envelope 或 question 参数',
      retryable: false
    })
  }

  const taskValidation = validateServerTaskType(taskType)
  if (!taskValidation.valid) {
    const unavailable = taskValidation.code === AGENT_TASK_ERROR_CODES.UNAVAILABLE
    return res.status(unavailable ? 501 : 400).json({
      code: taskValidation.code,
      error: unavailable ? '该 Agent 任务尚未接入执行器' : '缺少有效的 Agent 任务类型',
      taskType: taskValidation.canonical || String(taskType || '').trim() || null,
      retryable: false
    })
  }
  const normalizedTaskType = normalizeAdvisorTaskType(taskValidation.taskType)
  const requestEnvelope = envelope || {
    version: 1,
    surface: 'writing',
    projectId: null,
    target: {
      type: target?.kind || 'chapter',
      id: target?.id || null,
      revision: target?.revision || target?.baseRevision || 'legacy-advice'
    },
    blocks: [{
      kind: 'legacy',
      priority: 500,
      content: context,
      sourceRefs: [],
      truncated: false,
      truncatedAt: null
    }],
    budget: { maxChars: taskValidation.definition.maxContextChars, usedChars: 0, truncated: false }
  }
  const incomingValidation = validateAgentContextEnvelope(requestEnvelope, taskValidation.definition)
  if (!incomingValidation.valid) {
    return res.status(400).json({
      code: incomingValidation.code,
      error: incomingValidation.reason,
      taskType: normalizedTaskType,
      retryable: false
    })
  }
  const clippedEnvelope = clipAgentContextEnvelope(
    requestEnvelope,
    Math.min(
      Number(requestEnvelope?.budget?.maxChars) || taskValidation.definition.maxContextChars,
      taskValidation.definition.maxContextChars
    )
  )
  const envelopeValidation = validateAgentContextEnvelope(clippedEnvelope, taskValidation.definition)
  if (!envelopeValidation.valid) {
    return res.status(400).json({
      code: envelopeValidation.code,
      error: envelopeValidation.reason,
      taskType: normalizedTaskType,
      retryable: false
    })
  }
  if (!agentEnvelopeToPromptText(clippedEnvelope).trim()) {
    return res.status(400).json({
      code: AGENT_CONTEXT_ERROR_CODES.INVALID,
      error: '上下文信封没有可用内容',
      taskType: normalizedTaskType,
      retryable: false
    })
  }
  const requestId = String(trace?.requestId || '').trim().slice(0, 120) || randomUUID()
  const ledger = createAgentContextLedger(clippedEnvelope)

  try {
    const runOnce = (activeQuestion) => runAdvisorAgent({
      providerId: String(options?.agentProvider || 'text-model'),
      fallbackProviderId: options?.fallbackProvider
        ? String(options.fallbackProvider)
        : null,
      capability: taskValidation.definition.capability,
      envelope: clippedEnvelope,
      question: activeQuestion,
      taskMeta: {
        taskType: normalizedTaskType,
        target: clippedEnvelope.target,
        options,
        mode
      }
    })
    let run = await runOnce(question)
    let semanticRepairCount = 0
    const buildResponse = () => createAdvisorTaskResponse({
      taskType: normalizedTaskType,
      advice: run.advice,
      target: clippedEnvelope.target,
      options,
      meta: {
        requestId,
        provider: run.provider,
        targetRevision: clippedEnvelope.target.revision,
        sourceRefs: collectAgentEnvelopeSourceRefs(clippedEnvelope),
        budget: clippedEnvelope.budget,
        ledger,
        semanticRepairCount
      }
    })
    let response
    try {
      response = buildResponse()
    } catch (error) {
      if (error.code !== 'AGENT_CANDIDATES_UNCHANGED') throw error
      semanticRepairCount = 1
      run = await runOnce(`${question}\n\n上一次候选与目标原文相同。请严格按批注要求产生实际文字改动，且候选之间不得重复。`)
      response = buildResponse()
    }
    res.json(response)
  } catch (error) {
    const message = error.message || '获取建议失败'
    if (message.includes('缺少 context 或 question 参数')) {
      return res.status(400).json({ error: message })
    }

    console.error('[Advisor] advice error:', message)
    res.status(500).json({
      code: error.code || 'AGENT_PROVIDER_FAILED',
      error: message,
      requestId,
      retryable: error.retryable !== false
    })
  }
}

router.post('/task', async (req, res) => {
  await handleAdvisorTask(req, res)
})

router.post('/advice', async (req, res) => {
  await handleAdvisorTask(req, res, {
    taskType: 'writing.chapter.health',
    allowLegacy: true
  })
})

export default router
