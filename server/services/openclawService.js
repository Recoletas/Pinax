import axios from 'axios'
import { getAdvisorPrompt } from '../../src/services/promptRegistry.js'

const BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'

function serializeContext(context) {
  if (typeof context === 'string') {
    return context.trim()
  }

  if (context == null) {
    return ''
  }

  if (typeof context === 'object') {
    try {
      return JSON.stringify(context, null, 2)
    } catch {
      return String(context).trim()
    }
  }

  return String(context).trim()
}

const ADVISOR_TASK_INSTRUCTIONS = {
  'advisor.fix.selection': '任务：修正选区文字。请优先指出选区内的语病、重复、指代或语气问题，并给出可直接替换的改写建议。不要扩写剧情。',
  'advisor.fix.paragraph': '任务：修正当前段落。请聚焦段落内部节奏、衔接、重复和表达清晰度，给出可直接替换的段落版本。',
  'advisor.close.thread': '任务：自动收当前线索。请识别上下文里正在展开的线索，并给出 1-2 个自然收束方式，避免大幅展开新支线。',
  'advisor.review.chapter': '任务：章节体检。请简洁指出当前章节在节奏、人物动机、结构推进上的主要问题，并给出优先级最高的修改动作。',
  'advisor.continue.light': '任务：轻续一句。请只给出一条短续写方向或一句可接在光标后的正文建议，保持当前语气，不要长篇展开。'
}

function normalizeTaskType(taskType) {
  const value = String(taskType || '').trim()
  return value || 'advisor.review.chapter'
}

function getTaskInstruction(taskType) {
  return ADVISOR_TASK_INSTRUCTIONS[taskType] || ADVISOR_TASK_INSTRUCTIONS['advisor.review.chapter']
}

function getTaskOutputInstruction(taskType) {
  if (taskType === 'advisor.fix.selection' || taskType === 'advisor.fix.paragraph') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown、不要代码块、不要额外解释。格式：
{
  "task": "${taskType}",
  "mode": "replace",
  "summary": "一句话说明本次修改重点",
  "replacement": "完整替换文本",
  "issues": [
    { "type": "style", "severity": "medium", "message": "问题说明" }
  ]
}
replacement 必须是可直接替换目标文本的完整文本，不要省略号，不要只写建议。`
  }

  return '输出要求：直接给出简洁建议，不要输出无关解释；如能结构化，可包含 summary 和 issues。'
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  }
  if (GATEWAY_TOKEN) {
    headers['Authorization'] = `Bearer ${GATEWAY_TOKEN}`
  }
  return headers
}

/**
 * Get creative advice from OpenClaw Gateway
 * @param {object|string} context - Current creative context
 * @param {string} question - User's question
 * @param {object} taskMeta - Advisor task metadata
 * @returns {Promise<string>} advice text
 */
export async function getAdvice(context, question, taskMeta = {}) {
  const contextText = serializeContext(context)
  const questionText = String(question || '').trim()
  const taskType = normalizeTaskType(taskMeta.taskType)
  const targetText = serializeContext(taskMeta.target)
  const optionsText = serializeContext(taskMeta.options)
  const mode = taskMeta.mode || 'prose'

  if (!contextText || !questionText) {
    throw new Error('缺少 context 或 question 参数')
  }

  const domainPrompt = getAdvisorPrompt(mode)
  const systemPrompt = domainPrompt.system

  const payload = {
    model: `openclaw/${AGENT_ID}`,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `任务类型：${taskType}`,
          getTaskInstruction(taskType),
          getTaskOutputInstruction(taskType),
          targetText ? `目标文本/范围：\n${targetText}` : '',
          optionsText ? `任务选项：\n${optionsText}` : '',
          `当前创作上下文：\n${contextText}`,
          `用户的问题：${questionText}`
        ].filter(Boolean).join('\n\n')
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  }

  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, payload, {
      headers: getHeaders(),
      timeout: 30000
    })

    const choices = response.data?.choices
    if (!choices || choices.length === 0) {
      throw new Error('OpenClaw Gateway 返回了空响应')
    }

    return choices[0]?.message?.content || '未获取到有效建议'
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message || '未知错误'
    throw new Error(`OpenClaw Gateway 调用失败：${message}`)
  }
}
