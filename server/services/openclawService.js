import axios from 'axios'

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

  if (!contextText || !questionText) {
    throw new Error('缺少 context 或 question 参数')
  }

  const systemPrompt = `你是一位资深的文学创作顾问，擅长为作者提供精准、实用的叙事建议。

【核心原则】
1. 简洁直接：每个建议聚焦一点，优先针对用户当前困境，不冗言铺陈
2. 专业精准：运用叙事学专业术语（节奏、视角、张力、弧光等），分析到位不模糊
3. 可操作：建议须具体可执行，避免空泛的"要加油"类表达
4. 克制废话：不多次重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌开场

【回复规范】
- 优先分析当前创作状态的核心问题，再给出具体建议
- 如涉及情绪、节奏、结构等维度，需指出具体位置或问题所在
- 用 *动作* 格式描述角色动作，用"对话"格式描述对话，段落分明
- 单次建议不超过 150 字，除非用户明确要求展开
- 不重复上下文已提供的信息

【用户问题类型】
- 分析节奏/情绪分布：直接指出当前节奏或情绪的问题，给出调整方向
- 结构建议：指出当前结构的核心问题，给出优化路径
- 续写灵感：给出 1-2 个具体推进方向，避免发散过多
- 自定义问题：针对问题直接作答，不答非所问`

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
