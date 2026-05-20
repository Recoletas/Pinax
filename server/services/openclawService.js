import axios from 'axios'

const BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'

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
 * @param {string} context - JSON string of the current creative context
 * @param {string} question - User's question
 * @returns {Promise<string>} advice text
 */
export async function getAdvice(context, question) {
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
        content: `当前创作上下文：\n${context}\n\n用户的问题：${question}`
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