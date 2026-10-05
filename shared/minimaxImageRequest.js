// MiniMax image-01: https://platform.minimax.cn/docs/api-reference/image-generation-i2i
export const MINIMAX_REFERENCE_LIMIT = 1
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024
const ASPECT_RATIOS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9']

export function normalizeMiniMaxSubjectReferences(input = []) {
  if (!Array.isArray(input) || input.length > MINIMAX_REFERENCE_LIMIT) {
    throw invalidInput('当前 MiniMax 适配器最多提交一张人物参考图')
  }
  return input.map((reference) => {
    if (!reference || reference.type !== 'character') throw invalidInput('MiniMax 仅支持人物参考图')
    const value = String(reference.image_file || '').trim()
    if (/^https?:\/\//i.test(value)) {
      let url
      try { url = new URL(value) } catch { throw invalidInput('人物参考图 URL 无效') }
      if (url.username || url.password) throw invalidInput('人物参考图 URL 不应包含账号密码')
      return { type: 'character', image_file: value }
    }
    const match = value.match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/]+={0,2})$/i)
    if (!match || match[1].length % 4 !== 0) throw invalidInput('人物参考图需要 JPG 或 PNG 图片')
    const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0
    const bytes = match[1].length * 3 / 4 - padding
    if (bytes <= 0 || bytes >= MAX_REFERENCE_BYTES) throw invalidInput('人物参考图需小于 10 MB')
    return { type: 'character', image_file: value }
  })
}

export function buildMiniMaxImageSize({ width, height, aspectRatio, model = 'image-01' } = {}) {
  if (width != null || height != null) {
    const w = Number(width), h = Number(height)
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 512 || h < 512 || w > 2048 || h > 2048 || w % 8 || h % 8) {
      throw invalidInput('MiniMax 图片尺寸需为 512–2048 且为 8 的倍数')
    }
    if (model === 'image-01') return { width: w, height: h }
    return { aspect_ratio: getMiniMaxAspectRatio(w, h, model) }
  }
  const ratio = String(aspectRatio || '1:1')
  if (!ASPECT_RATIOS.includes(ratio) || (model === 'image-01-live' && ratio === '21:9')) {
    throw invalidInput('MiniMax 图片比例无效')
  }
  return { aspect_ratio: ratio }
}

export function getMiniMaxAspectRatio(width, height, model = 'image-01') {
  const target = Number(width) / Number(height)
  if (!Number.isFinite(target) || target <= 0) throw invalidInput('MiniMax 图片尺寸无效')
  const candidates = ASPECT_RATIOS.filter((ratio) => model !== 'image-01-live' || ratio !== '21:9')
  return candidates.reduce((best, ratio) => (
    Math.abs(ratioValue(ratio) - target) < Math.abs(ratioValue(best) - target) ? ratio : best
  ))
}

function ratioValue(value) {
  const [width, height] = value.split(':').map(Number)
  return width / height
}

function invalidInput(message) {
  return Object.assign(new Error(message), { code: 'ERR_INVALID_INPUT', status: 400 })
}
