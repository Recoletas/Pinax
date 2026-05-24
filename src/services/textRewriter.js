/**
 * textRewriter - 文本改写服务
 *
 * 职责：
 * - 按指定风格改写文本
 * - 保持原有核心意思不变
 * - 长度相近
 * - 支持多种改写模式
 */

import { runGenerationRetryPlan } from './generationRetry'
import { getResolvedApiSettings } from './api'

// 改写模式预设
const REWRITE_MODES = {
  style: {
    name: '风格转换',
    description: '改变文本的叙事风格',
    instruction: '将文本改写为指定的叙事风格。'
  },
  tone: {
    name: '语气调整',
    description: '改变文本的语气和情感色彩',
    instruction: '调整文本的语气，使其符合指定的情感色彩。'
  },
  perspective: {
    name: '视角转换',
    description: '改变叙事视角（第一/第三人称等）',
    instruction: '转换文本的叙事视角，保持内容不变。'
  },
  simplify: {
    name: '简化精炼',
    description: '精简文字，去除冗余',
    instruction: '简化文本，去除冗余表达，保留核心内容。'
  },
  elaborate: {
    name: '润色提升',
    description: '提升文字品质和文学性',
    instruction: '润色文本，提升文字的品质感和文学性。'
  }
}

// 语气预设
const TONE_PRESETS = {
  formal: {
    name: '正式',
    instruction: '使用正式、庄重的语言风格。'
  },
  casual: {
    name: '轻松',
    instruction: '使用轻松、口语化的语言风格。'
  },
  poetic: {
    name: '诗意',
    instruction: '使用优美、富有诗意的语言风格。'
  },
  dramatic: {
    name: '戏剧',
    instruction: '使用富有戏剧张力和情绪感染力的语言风格。'
  },
  neutral: {
    name: '中性',
    instruction: '使用客观、中性的语言风格。'
  }
}

// 叙事风格预设
const NARRATIVE_STYLES = {
  literary: {
    name: '文学性',
    instruction: '注重文字美感，描写细腻，意象丰富，节奏舒缓。'
  },
  webnovel: {
    name: '网文风',
    instruction: '节奏明快，语言简洁，多用对话推进情节，悬念感强。'
  },
  concise: {
    name: '简洁白描',
    instruction: '文字简练，点到为止，避免过多修饰，留白多。'
  },
  dramatic: {
    name: '戏剧性',
    instruction: '冲突强烈，情绪张力大，转折多，悬念感足。'
  }
}

// 视角预设
const PERSPECTIVE_PRESETS = {
  first: {
    name: '第一人称',
    instruction: '使用"我"作为叙事视角，增强代入感。'
  },
  third: {
    name: '第三人称',
    instruction: '使用"他/她"作为叙事视角，保持客观距离。'
  },
  thirdLimited: {
    name: '第三人称限制',
    instruction: '使用第三人称，但仅展现单一人物的视角和认知。'
  },
  omniscient: {
    name: '全知视角',
    instruction: '使用全知全能的叙事视角，可以展现所有人物的想法和事件。'
  }
}

/**
 * 构建改写提示词
 * @param {string} text - 原始文本
 * @param {object} options - 选项
 * @returns {Array} 消息序列
 */
function buildRewritePrompt(text, options = {}) {
  const {
    mode = 'style',
    style = 'literary',
    tone = 'neutral',
    perspective = '',
    customInstruction = ''
  } = options

  const modeConfig = REWRITE_MODES[mode] || REWRITE_MODES.style
  const styleConfig = NARRATIVE_STYLES[style] || NARRATIVE_STYLES.literary
  const toneConfig = TONE_PRESETS[tone] || TONE_PRESETS.neutral

  let specificInstruction = ''

  // 根据模式添加具体指令
  switch (mode) {
    case 'style':
      specificInstruction = `【目标风格】${styleConfig.name}\n${styleConfig.instruction}`
      break
    case 'tone':
      specificInstruction = `【目标语气】${toneConfig.name}\n${toneConfig.instruction}`
      break
    case 'perspective':
      const perspectiveConfig = PERSPECTIVE_PRESETS[perspective] || PERSPECTIVE_PRESETS.third
      specificInstruction = `【目标视角】${perspectiveConfig.name}\n${perspectiveConfig.instruction}`
      break
    case 'simplify':
      specificInstruction = `【简化要求】\n去除冗余表达，保留核心内容，使文字更加精炼有力。`
      break
    case 'elaborate':
      specificInstruction = `【润色要求】\n提升文字品质，优化表达方式，增强文学性和可读性。`
      break
  }

  const systemPrompt = `你是一位专业的文学编辑，擅长改写和优化文本。

【任务】
请根据要求改写用户提供的文本，保持原有核心意思不变。

【改写模式】${modeConfig.name}
${modeConfig.description}

${specificInstruction}

【改写要求】
1. 保持原文的核心意思和主要情节完全不变
2. 保持原文长度相近（变化不超过 20%）
3. 新的表达需与改写目标协调一致
4. 保持叙事流畅，过渡自然
5. 输出改写后的完整文本，不要添加任何解释或标记
${customInstruction ? `\n【额外要求】\n${customInstruction}` : ''}`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请改写以下文本：\n\n${text}` }
  ]
}

/**
 * 改写文本
 * @param {string} text - 原始文本
 * @param {object} options - 选项
 * @returns {Promise<object>} 改写结果
 */
export async function rewriteText(text, options = {}) {
  if (!text || !text.trim()) {
    return { success: false, error: '文本不能为空', content: '' }
  }

  const settings = await getResolvedApiSettings()
  if (!settings?.baseUrl || !settings?.apiKey) {
    return { success: false, error: '请先配置 AI 设置', content: '' }
  }

  const {
    maxTokens = 1000,
    temperature = 0.7
  } = options

  // 估算输出 token：原文长度 * 1.2（允许 20% 变化）* 2（中文约 2 字/token）
  const estimatedTokens = Math.min(
    Math.ceil(text.length * 1.2 * 2),
    maxTokens
  )

  const messages = buildRewritePrompt(text, options)

  try {
    const result = await runGenerationRetryPlan({
      baseMessages: messages,
      settings,
      generationOptions: {
        max_tokens: estimatedTokens,
        temperature,
        stream: false
      },
      attempts: [{ name: 'text-rewrite' }]
    })

    if (result?.success && result.content) {
      return {
        success: true,
        content: result.content.trim(),
        originalLength: text.length,
        rewrittenLength: result.content.trim().length
      }
    }

    return { success: false, error: '生成失败', content: '' }
  } catch (error) {
    console.error('Text rewrite error:', error)
    return {
      success: false,
      error: error.message || '改写过程中发生错误',
      content: ''
    }
  }
}

/**
 * 快速风格改写
 * @param {string} text - 原始文本
 * @param {string} style - 目标风格
 * @returns {Promise<object>} 改写结果
 */
export async function rewriteStyle(text, style = 'literary') {
  return rewriteText(text, { mode: 'style', style })
}

/**
 * 快速语气改写
 * @param {string} text - 原始文本
 * @param {string} tone - 目标语气
 * @returns {Promise<object>} 改写结果
 */
export async function rewriteTone(text, tone = 'neutral') {
  return rewriteText(text, { mode: 'tone', tone })
}

/**
 * 快速视角转换
 * @param {string} text - 原始文本
 * @param {string} perspective - 目标视角
 * @returns {Promise<object>} 改写结果
 */
export async function rewritePerspective(text, perspective = 'third') {
  return rewriteText(text, { mode: 'perspective', perspective })
}

/**
 * 简化文本
 * @param {string} text - 原始文本
 * @returns {Promise<object>} 改写结果
 */
export async function simplifyText(text) {
  return rewriteText(text, { mode: 'simplify' })
}

/**
 * 润色文本
 * @param {string} text - 原始文本
 * @returns {Promise<object>} 改写结果
 */
export async function elaborateText(text) {
  return rewriteText(text, { mode: 'elaborate' })
}

/**
 * 获取可用改写模式
 * @returns {Array} 模式列表
 */
export function getRewriteModes() {
  return Object.entries(REWRITE_MODES).map(([key, config]) => ({
    value: key,
    label: config.name,
    description: config.description
  }))
}

/**
 * 获取可用语气预设
 * @returns {Array} 语气列表
 */
export function getTonePresets() {
  return Object.entries(TONE_PRESETS).map(([key, config]) => ({
    value: key,
    label: config.name,
    instruction: config.instruction
  }))
}

/**
 * 获取可用视角预设
 * @returns {Array} 视角列表
 */
export function getPerspectivePresets() {
  return Object.entries(PERSPECTIVE_PRESETS).map(([key, config]) => ({
    value: key,
    label: config.name,
    instruction: config.instruction
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

export default {
  rewriteText,
  rewriteStyle,
  rewriteTone,
  rewritePerspective,
  simplifyText,
  elaborateText,
  getRewriteModes,
  getTonePresets,
  getPerspectivePresets,
  getNarrativeStyles,
  REWRITE_MODES,
  TONE_PRESETS,
  PERSPECTIVE_PRESETS,
  NARRATIVE_STYLES
}
