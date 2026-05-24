/**
 * textExpander - 文本扩展服务
 *
 * 职责：
 * - 将选中的文本扩展 2-3 倍
 * - 保持原有核心意思不变
 * - 增加环境描写、动作描写、心理描写
 * - 支持多种叙事风格
 */

import { runGenerationRetryPlan } from './generationRetry'
import { getResolvedApiSettings } from './api'

// 扩展模式预设
const EXPANSION_MODES = {
  descriptive: {
    name: '描写丰富',
    instruction: '增加环境描写和感官细节，让场景更加生动立体。',
    focus: '环境描写、感官细节'
  },
  psychological: {
    name: '心理深化',
    instruction: '深入挖掘人物内心活动，展现情感变化和心理层次。',
    focus: '心理描写、情感层次'
  },
  action: {
    name: '动作细化',
    instruction: '细化动作过程，增加动作描写和动态感。',
    focus: '动作描写、动态细节'
  },
  dialogue: {
    name: '对话丰富',
    instruction: '扩展对话内容，增加对话细节和言语间的互动。',
    focus: '对话描写、言语互动'
  },
  balanced: {
    name: '综合扩展',
    instruction: '平衡增加环境、动作、心理描写，使文本更加丰满。',
    focus: '综合描写'
  }
}

// 叙事风格预设（复用 promptBuilder 中的定义）
const NARRATIVE_STYLES = {
  literary: {
    name: '文学性',
    instruction: '注重文字美感，描写细腻，意象丰富。'
  },
  webnovel: {
    name: '网文风',
    instruction: '节奏明快，语言简洁，悬念感强。'
  },
  concise: {
    name: '简洁白描',
    instruction: '文字简练，点到为止，留白多。'
  },
  dramatic: {
    name: '戏剧性',
    instruction: '冲突强烈，情绪张力大，转折多。'
  }
}

/**
 * 构建扩展提示词
 * @param {string} text - 原始文本
 * @param {object} options - 选项
 * @returns {Array} 消息序列
 */
function buildExpansionPrompt(text, options = {}) {
  const {
    mode = 'balanced',
    style = 'literary',
    targetLength = 3,
    customInstruction = ''
  } = options

  const modeConfig = EXPANSION_MODES[mode] || EXPANSION_MODES.balanced
  const styleConfig = NARRATIVE_STYLES[style] || NARRATIVE_STYLES.literary

  const systemPrompt = `你是一位专业的文学写作助手，擅长扩展和丰富文本内容。

【任务】
请将用户提供的文本扩展约 ${targetLength} 倍长度，保持原有核心意思不变，同时增加更多细节描写。

【扩展模式】${modeConfig.name}
${modeConfig.instruction}
重点：${modeConfig.focus}

【叙事风格】${styleConfig.name}
${styleConfig.instruction}

【扩展要求】
1. 保持原文的核心意思和主要情节不变
2. 自然地增加细节描写，不生硬堆砌
3. 新增内容需与原文风格协调一致
4. 保持叙事流畅，过渡自然
5. 输出扩展后的完整文本，不要添加任何解释或标记
${customInstruction ? `\n【额外要求】\n${customInstruction}` : ''}`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请扩展以下文本：\n\n${text}` }
  ]
}

/**
 * 扩展文本
 * @param {string} text - 原始文本
 * @param {object} options - 选项
 * @returns {Promise<object>} 扩展结果
 */
export async function expandText(text, options = {}) {
  if (!text || !text.trim()) {
    return { success: false, error: '文本不能为空', content: '' }
  }

  const settings = await getResolvedApiSettings()
  if (!settings?.baseUrl || !settings?.apiKey) {
    return { success: false, error: '请先配置 AI 设置', content: '' }
  }

  const {
    targetLength = 3,
    maxTokens = 1500,
    temperature = 0.7
  } = options

  // 估算输出 token：原文字数 * 目标倍数 * 2（中文约 2 字/token）
  const estimatedTokens = Math.min(
    Math.ceil(text.length * targetLength * 2),
    maxTokens
  )

  const messages = buildExpansionPrompt(text, options)

  try {
    const result = await runGenerationRetryPlan({
      baseMessages: messages,
      settings,
      generationOptions: {
        max_tokens: estimatedTokens,
        temperature,
        stream: false
      },
      attempts: [{ name: 'text-expansion' }]
    })

    if (result?.success && result.content) {
      return {
        success: true,
        content: result.content.trim(),
        originalLength: text.length,
        expandedLength: result.content.trim().length,
        ratio: (result.content.trim().length / text.length).toFixed(2)
      }
    }

    return { success: false, error: '生成失败', content: '' }
  } catch (error) {
    console.error('Text expansion error:', error)
    return {
      success: false,
      error: error.message || '扩展过程中发生错误',
      content: ''
    }
  }
}

/**
 * 获取可用扩展模式
 * @returns {Array} 模式列表
 */
export function getExpansionModes() {
  return Object.entries(EXPANSION_MODES).map(([key, config]) => ({
    value: key,
    label: config.name,
    description: config.instruction,
    focus: config.focus
  }))
}

/**
 * 获取可用叙事风格
 * @returns {Array} 风格列表
 */
export function getNarrativeStyles() {
  return Object.entries(NARRATIVE_STYLES).map(([key, config]) => ({
    value: key,
    label: config.name,
    instruction: config.instruction
  }))
}

/**
 * 快速扩展（使用默认配置）
 * @param {string} text - 原始文本
 * @returns {Promise<object>} 扩展结果
 */
export async function quickExpand(text) {
  return expandText(text, { mode: 'balanced', style: 'literary' })
}

export default {
  expandText,
  quickExpand,
  getExpansionModes,
  getNarrativeStyles,
  EXPANSION_MODES,
  NARRATIVE_STYLES
}
