import { runGenerationTask } from './generationService'
import { PROFESSIONAL_INFO_PROMPT } from './promptRegistry'

const VALID_SHOT_TYPES = [
  'extreme_wide', 'wide', 'full', 'medium_wide', 'medium',
  'medium_close', 'close_up', 'extreme_close_up', 'two_shot',
  'over_shoulder', 'pov', 'aerial'
]

const VALID_CAMERA_MOVEMENTS = [
  'static', 'pan', 'tilt', 'dolly', 'track', 'crane', 'zoom', 'handheld'
]

function extractProfessionalBlock(text) {
  const raw = String(text || '')
  const beginIndex = raw.indexOf('BEGIN_INFO')
  if (beginIndex >= 0) {
    const afterBegin = raw.slice(beginIndex + 'BEGIN_INFO'.length)
    const endIndex = afterBegin.indexOf('END_INFO')
    return (endIndex >= 0 ? afterBegin.slice(0, endIndex) : afterBegin).trim()
  }
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  return jsonMatch ? jsonMatch[0].trim() : null
}

function parseProfessionalBlock(text) {
  const block = extractProfessionalBlock(text)
  if (!block) return null
  try {
    const parsed = JSON.parse(block)
    return {
      shotType: validateShotType(parsed.shotType),
      cameraMovement: validateCameraMovement(parsed.cameraMovement),
      duration: validateDuration(parsed.duration),
      dialogue: String(parsed.dialogue || '').trim(),
      soundEffects: String(parsed.soundEffects || '').trim()
    }
  } catch {
    return null
  }
}

function validateShotType(value) {
  return VALID_SHOT_TYPES.includes(value) ? value : 'medium'
}

function validateCameraMovement(value) {
  return VALID_CAMERA_MOVEMENTS.includes(value) ? value : 'static'
}

function validateDuration(value) {
  const num = Number(value)
  return isNaN(num) ? 3 : Math.max(1, Math.min(30, Math.round(num)))
}

function isValidProfessionalParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  if (!parsed.shotType || !parsed.cameraMovement) return false
  if (typeof parsed.duration !== 'number') return false
  return true
}

/**
 * 从素材内容生成专业编导信息
 * @param {object} params
 * @param {object} params.asset - 素材对象（需有 content 属性）
 * @param {object} params.settings - API 设置（可传 null 使用默认）
 * @param {string} params.assetKind - 素材类型
 * @returns {Promise<{
 *   success: boolean,
 *   extraFields: { shotType: string, cameraMovement: string, duration: number, dialogue: string, soundEffects: string } | null,
 *   attempts: array
 * }>}
 */
export async function generateProfessionalInfoForAsset({ asset, settings, assetKind }) {
  const content = asset?.content || asset?.title || ''
  if (!content.trim()) {
    return { success: false, extraFields: null, attempts: [] }
  }

  const systemPrompt = PROFESSIONAL_INFO_PROMPT.system
  const userMessage = `请为以下素材生成专业编导信息：\n\n${content}`

  const baseMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]

  try {
    const result = await runGenerationTask({
      baseMessages,
      settings: settings || null,
      parseContent: parseProfessionalBlock,
      isValidParsed: isValidProfessionalParsed,
      attempts: [
        { name: 'generate' },
        {
          name: 'retry_format',
          appendMessages: [
            { role: 'user', content: '上一条输出格式不合规。请严格用 BEGIN_INFO 和 END_INFO 包裹 JSON 输出。' }
          ]
        }
      ]
    })

    if (result?.parsed && isValidProfessionalParsed(result.parsed)) {
      return {
        success: true,
        extraFields: result.parsed,
        attempts: result.attempts || []
      }
    }

    return { success: false, extraFields: null, attempts: result?.attempts || [] }
  } catch (err) {
    console.error('generateProfessionalInfoForAsset error:', err)
    return { success: false, extraFields: null, attempts: [] }
  }
}