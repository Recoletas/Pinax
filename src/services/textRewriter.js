/**
 * textRewriter - 文本改写服务
 *
 * 职责：
 * - 按指定风格改写文本
 * - 保持原有核心意思不变
 * - 长度相近
 * - 支持多种改写模式
 */

import { runGenerationTask } from './generationService'
import { getResolvedApiSettings } from './api'
import {
  NARRATIVE_STYLES,
  REWRITE_MODES,
  TONE_PRESETS,
  PERSPECTIVE_PRESETS,
  getNarrativeStyle
} from './promptRegistry'

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
  const styleConfig = getNarrativeStyle(style)
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
    const result = await runGenerationTask({
      taskType: 'writing.rewrite',
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
