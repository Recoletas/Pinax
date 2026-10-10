import { validateWritingLanguagePolicy } from '../../shared/writingLanguage.js'
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
import { buildOpenClawUserMessage } from '../services/openclawService.js'
import { capabilityPlaneAvailable, runCapabilityTaskAgent } from '../services/capabilityTaskRunner.js'
import { getCapabilityToolSpec } from '../../shared/capabilityToolContracts.js'
import { createModelRoundGuard } from '../../shared/modelLoopGuard.js'
import { validateWritingSkillInvocation } from '../../shared/writingSkillMethodContract.js'
import { applyWritingSkillEnforcement } from '../services/writingSkillEnforcement.js'

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
  // 写作 Skills 冻结输入（shared/writingSkillMethodContract.js）：只在请求
  // 携带 options.writingSkill 时启用。未知 skillId/skillVersion/字段/只读
  // 能力一律 typed 拒绝；旧请求不含该字段，行为完全不变。
  const languageValidation = options?.languagePolicy === undefined ? null : validateWritingLanguagePolicy(options.languagePolicy)
  if (languageValidation && !languageValidation.valid) return res.status(400).json({ code: 'WRITING_LANGUAGE_REJECTED', error: 'Invalid writing language policy', retryable: false })
  let skillInvocation = null
  if (options?.writingSkill !== undefined) {
    const skillValidation = validateWritingSkillInvocation(options.writingSkill)
    if (!skillValidation.valid) {
      return res.status(400).json({
        code: 'WRITING_SKILL_REJECTED',
        reason: skillValidation.reason,
        failures: skillValidation.failures || [skillValidation.reason],
        error: '写作技能请求被拒绝：未知的技能版本、字段或能力。',
        taskType: normalizedTaskType,
        retryable: false
      })
    }
    skillInvocation = skillValidation.invocation
  }
  // 逐请求取样温度只在漏斗直连生效（2026-10-10 实测：kit 能力任务面 /v1/pinax/tasks
  // 没有逐请求采样概念——runner 用内核全局 cfg 造模型，请求体只能覆盖 budget）。
  // 因此声明温度即锁定直连链，见下方 useCapability 门控。
  // 越界值（如 5）也在此拒绝：否则请求会因"声明了温度"锁定直连链，却在下游
  // 归一化时被静默丢弃，作者看到一个生效不了的旋钮。
  const declaredTemperature = Number(options?.temperatureOverride)
  const hasTemperatureOverride = options?.temperatureOverride !== undefined
    && options?.temperatureOverride !== null
    && Number.isFinite(declaredTemperature)
    && declaredTemperature >= 0
    && declaredTemperature <= 2
  if (options?.temperatureOverride != null && !hasTemperatureOverride) {
    return res.status(400).json({
      code: 'AGENT_TEMPERATURE_INVALID',
      error: 'temperatureOverride 必须是 0-2 之间的数值。',
      taskType: normalizedTaskType,
      retryable: false
    })
  }
  // 阻断 1 返工：模型链与结果归一化只接触逐字段归一化后的冻结输入，
  // 原始 options 里的任何未校验内容都不再透传；方法组合器与检查器在
  // 能真实执行的任务上就地执行，回执如实标注 enforcement。
  const sanitizedOptions = {
    ...options,
    ...(skillInvocation ? { writingSkill: skillInvocation } : {}),
    ...(languageValidation ? { languagePolicy: languageValidation.policy } : {}),
    ...(hasTemperatureOverride ? { temperatureOverride: declaredTemperature } : {})
  }
  const skillEnforcement = applyWritingSkillEnforcement({
    taskType: normalizedTaskType,
    question,
    invocation: skillInvocation,
    reviewBlocks: Array.isArray(options?.reviewBlocks) ? options.reviewBlocks : null
  })
  const enforcedQuestion = skillEnforcement.question || question
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
  // 2026-10-09 预算完全废弃：本请求内所有模型调用（含语义修复重跑与回落）共用一个轮数闸。
  const roundGuard = createModelRoundGuard()
  const ledger = createAgentContextLedger(clippedEnvelope)

  try {
    // 统一调度门控：凡有 submit 契约的 taskType，在能力任务面健康时走 agent 循环（submit 回执序列化为 advice，
    // 既有解析/模板/语义修复原样工作）；无契约或任务面不可达 → 回落漏斗直连（双层 fail-open）。
    // 声明了逐请求温度的请求例外：任务面不认温度，一律走漏斗直连。
    const useCapability = !hasTemperatureOverride && Boolean(getCapabilityToolSpec(normalizedTaskType)) && await capabilityPlaneAvailable()
    const runFunnelAgent = (activeQuestion) => runAdvisorAgent({
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
        options: sanitizedOptions,
        mode,
        roundGuard
      }
    })
    const runOnce = async (activeQuestion) => {
      if (!useCapability) return runFunnelAgent(activeQuestion)
      try {
        return await runCapabilityTaskAgent({
          taskType: normalizedTaskType,
          envelope: clippedEnvelope,
          question: activeQuestion,
          taskMeta: {
            taskType: normalizedTaskType,
            target: clippedEnvelope.target,
            options: sanitizedOptions,
            mode,
            roundGuard,
            prompt: buildOpenClawUserMessage(clippedEnvelope, activeQuestion, {
              taskType: normalizedTaskType,
              target: clippedEnvelope.target,
              options: sanitizedOptions,
              mode
            })
          }
        })
      } catch (error) {
        // 双层 fail-open 的第二层：任务面可达但任务本身失败（网关拒绝/空补全等）时，
        // 降级走漏斗直连而不是把硬 500 抛给作者；响应 meta.provider 会留痕实际链路。
        if (error.code === 'AGENT_REQUEST_ABORTED' || error.name === 'AbortError') throw error
        if (error.code === 'MODEL_ROUND_LIMIT_EXCEEDED') throw error
        console.warn(`[Advisor] capability agent failed (${error.code || error.message}); falling back to funnel`)
        return runFunnelAgent(activeQuestion)
      }
    }
    let run = await runOnce(enforcedQuestion)
    let semanticRepairCount = 0
    const buildResponse = () => createAdvisorTaskResponse({
      taskType: normalizedTaskType,
      advice: run.advice,
      target: clippedEnvelope.target,
      options: sanitizedOptions,
      meta: {
        requestId,
        ...(hasTemperatureOverride ? { temperature: declaredTemperature, routed: 'funnel' } : {}),
        ...(languageValidation ? { languagePolicy: languageValidation.policy } : {}),
        provider: run.provider,
        targetRevision: clippedEnvelope.target.revision,
        sourceRefs: collectAgentEnvelopeSourceRefs(clippedEnvelope),
        budget: clippedEnvelope.budget,
        ledger,
        semanticRepairCount,
        ...(skillEnforcement.ack ? { writingSkill: skillEnforcement.ack } : {})
      }
    })
    let response
    try {
      response = buildResponse()
    } catch (error) {
      if (error.code !== 'AGENT_CANDIDATES_UNCHANGED') throw error
      semanticRepairCount = 1
      run = await runOnce(`${enforcedQuestion}\n\n上一次候选与目标原文相同。请严格按批注要求产生实际文字改动，且候选之间不得重复。`)
      response = buildResponse()
    }
    if (skillEnforcement.writingSkillChecks) {
      response.result = { ...response.result, writingSkillChecks: skillEnforcement.writingSkillChecks }
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
