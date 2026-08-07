export const IMAGE_MODEL_TYPES = [
  { value: 'minimax_image', label: 'MiniMax Image' },
  { value: 'openai_dalle', label: 'OpenAI Images' },
  { value: 'stability', label: 'Stability AI' },
  { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'http', label: '通用 HTTP' }
]

const IMAGE_MODEL_DEFAULTS = Object.freeze({
  minimax_image: {
    baseUrl: 'https://api.minimaxi.com',
    defaultModel: 'image-01'
  },
  openai_dalle: { baseUrl: '', defaultModel: 'gpt-image-1' },
  stability: { baseUrl: '', defaultModel: 'stable-diffusion-xl-1024-v1-0' },
  sd_webui: { baseUrl: 'http://127.0.0.1:7860', defaultModel: '' },
  comfyui: { baseUrl: 'http://127.0.0.1:8188', defaultModel: '' },
  http: { baseUrl: '', defaultModel: '' }
})

const DEFAULT_IMAGE_OPTIONS = {
  prompt: '',
  negativePrompt: '',
  width: 1024,
  height: 1024,
  count: 1,
  referenceImages: [],
  controlImages: [],
  maskImage: '',
  referenceStrength: 0.65,
  pollIntervalMs: 1000,
  maxPollAttempts: 60
}

export function getImageProviderCapabilities(config = {}) {
  const type = String(config.type || '')
  const template = String(config.requestTemplate || '')
  const hasTemplateToken = (token) => template.includes(`{{${token}}}`)
  if (type === 'http') {
    const imageToImage = hasTemplateToken('reference_image') || hasTemplateToken('reference_images_json')
    return {
      textToImage: true,
      imageToImage,
      inpaint: imageToImage && hasTemplateToken('mask_image'),
      identityReference: imageToImage,
      controlImages: hasTemplateToken('control_images_json')
    }
  }
  return {
    minimax_image: {
      textToImage: true,
      imageToImage: false,
      inpaint: false,
      identityReference: false,
      controlImages: false
    },
    openai_dalle: {
      textToImage: true,
      imageToImage: true,
      inpaint: true,
      identityReference: true,
      controlImages: false
    },
    stability: {
      textToImage: true,
      imageToImage: true,
      inpaint: false,
      identityReference: true,
      controlImages: false
    },
    sd_webui: {
      textToImage: true,
      imageToImage: true,
      inpaint: true,
      identityReference: true,
      controlImages: false
    },
    comfyui: {
      textToImage: true,
      imageToImage: false,
      inpaint: false,
      identityReference: false,
      controlImages: false
    }
  }[type] || {
    textToImage: false,
    imageToImage: false,
    inpaint: false,
    identityReference: false,
    controlImages: false
  }
}

export function createImageModelConfigDraft(type = 'sd_webui') {
  const normalizedType = IMAGE_MODEL_DEFAULTS[type] ? type : 'sd_webui'
  const defaults = IMAGE_MODEL_DEFAULTS[normalizedType]
  return {
    id: '',
    name: '',
    type: normalizedType,
    baseUrl: defaults.baseUrl,
    apiKey: '',
    defaultModel: defaults.defaultModel,
    responsePath: '',
    requestTemplate: ''
  }
}

export async function testImageProviderConnection(config = {}, options = {}) {
  const fetchImpl = getFetch(options.fetchImpl)
  const startedAt = Date.now()

  try {
    const request = buildConnectionRequest(config)
    const response = await fetchImpl(request.url, request.init)
    const authenticated = response.status !== 401 && response.status !== 403
    let error = ''

    if (!response.ok) {
      error = await readResponseError(response)
    }

    return {
      ok: response.ok,
      reachable: true,
      authenticated,
      status: response.status,
      statusText: response.statusText || '',
      latencyMs: Date.now() - startedAt,
      error
    }
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      status: 0,
      statusText: '',
      latencyMs: Date.now() - startedAt,
      error: error?.message || '连接失败'
    }
  }
}

export async function generateImage(config = {}, input = {}) {
  const options = normalizeImageOptions(input)
  const fetchImpl = getFetch(input.fetchImpl)
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const capabilities = getImageProviderCapabilities(config)
  if (options.maskImage && (!capabilities.inpaint || !options.referenceImages.length)) {
    throw new Error('当前图片模型不支持带原图的局部遮罩修订')
  }
  if (options.controlImages.length && !capabilities.controlImages) {
    throw new Error('当前图片模型不支持独立 pose/edge/depth 控制图')
  }

  switch (config.type) {
    case 'sd_webui':
      return generateWithSdWebui(config, options, fetchImpl, baseUrl)
    case 'openai_dalle':
      return generateWithOpenAI(config, options, fetchImpl)
    case 'stability':
      return generateWithStability(config, options, fetchImpl)
    case 'comfyui':
      return generateWithComfyUi(config, options, fetchImpl, baseUrl)
    case 'minimax_image':
      return generateWithMinimax(config, options, fetchImpl, baseUrl)
    case 'http':
      return generateWithGenericHttp(config, options, fetchImpl, baseUrl)
    default:
      throw new Error(`不支持的生图模型类型: ${config.type || 'unknown'}`)
  }
}

function buildConnectionRequest(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const headers = buildHeaders(config)

  if (config.type === 'http') {
    return {
      url: requireBaseUrl(baseUrl),
      init: {
        method: 'POST',
        headers,
        body: renderRequestTemplate(config.requestTemplate, {
          ...DEFAULT_IMAGE_OPTIONS,
          prompt: 'test'
        })
      }
    }
  }

  const urls = {
    minimax_image: `${buildMinimaxRoot(baseUrl)}/v1/models`,
    sd_webui: `${requireBaseUrl(baseUrl)}/sdapi/v1/progress`,
    comfyui: `${requireBaseUrl(baseUrl)}/api/system_stats`,
    openai_dalle: 'https://api.openai.com/v1/models',
    stability: 'https://api.stability.ai/v1/account'
  }
  const url = urls[config.type]
  if (!url) throw new Error(`不支持的生图模型类型: ${config.type || 'unknown'}`)

  return {
    url,
    init: {
      method: 'GET',
      headers: Object.keys(headers).length > 1 || config.apiKey ? headers : undefined
    }
  }
}

async function generateWithMinimax(config, options, fetchImpl, baseUrl) {
  if (options.referenceImages.length) {
    throw new Error('MiniMax 人物参考图需要公网图片 URL，当前本地参考图不能直接提交')
  }
  const model = String(config.defaultModel || 'image-01').trim()
  if (!['image-01', 'image-01-live'].includes(model)) {
    throw new Error(`MiniMax 图片模型无效: ${model}`)
  }
  const prompt = [options.prompt, options.negativePrompt ? `避免出现：${options.negativePrompt}` : '']
    .filter(Boolean)
    .join('\n')
  if (!prompt) throw new Error('MiniMax 图片提示词不能为空')
  if (prompt.length > 1500) throw new Error('MiniMax 图片提示词不能超过 1500 字符')

  // 内置 MiniMax: key 由服务器持有, 经 /api/media/images 代理注入, 浏览器不接触真实 key
  if (config.builtin === true || config.serverKey === true) {
    return generateWithMinimaxViaServer(config, options, fetchImpl, { model, prompt })
  }

  const response = await fetchImpl(`${buildMinimaxRoot(baseUrl)}/v1/image_generation`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      model,
      prompt,
      aspect_ratio: normalizeMinimaxAspectRatio(options.width, options.height, model),
      response_format: 'base64',
      n: 1,
      prompt_optimizer: false,
      aigc_watermark: false
    })
  })
  const payload = await readJsonResponse(response, 'MiniMax Image')
  const providerCode = Number(payload?.base_resp?.status_code ?? 0)
  if (providerCode !== 0) {
    throw new Error(`MiniMax Image ${providerCode}: ${payload?.base_resp?.status_msg || '生成失败'}`)
  }
  const base64 = payload?.data?.image_base64?.[0]
  if (typeof base64 === 'string' && base64.trim()) return `data:image/jpeg;base64,${base64}`
  return resolveImageCandidate(payload?.data?.image_urls?.[0], fetchImpl)
}

/**
 * 内置 MiniMax: 图片生成经服务器 /api/media/images 代理。
 * 浏览器提交哨兵/空 key + 生成参数, 服务器注入 MINIMAX_API_KEY 后转发 MiniMax。
 */
async function generateWithMinimaxViaServer(config, options, fetchImpl, { model, prompt }) {
  const response = await fetchImpl('/api/media/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      aspectRatio: normalizeMinimaxAspectRatio(options.width, options.height, model),
      providerConfig: { apiKey: config.apiKey, baseUrl: config.baseUrl }
    })
  })
  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message || `MiniMax Image error: ${response.status || 'unknown'}`)
  }
  return resolveImageCandidate(payload.image, fetchImpl)
}

async function generateWithSdWebui(config, options, fetchImpl, baseUrl) {
  const hasReferences = options.referenceImages.length > 0 || Boolean(options.maskImage)
  const response = await fetchImpl(`${requireBaseUrl(baseUrl)}/sdapi/v1/${hasReferences ? 'img2img' : 'txt2img'}`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      prompt: options.prompt,
      negative_prompt: options.negativePrompt,
      steps: 20,
      width: options.width,
      height: options.height,
      ...(hasReferences ? {
        init_images: options.referenceImages.map((reference) => reference.data),
        denoising_strength: Number((1 - options.referenceStrength).toFixed(2)),
        ...(options.maskImage ? {
          mask: options.maskImage,
          inpainting_fill: 1,
          inpaint_full_res: true,
          mask_blur: 4
        } : {})
      } : {})
    })
  })
  const payload = await readJsonResponse(response, 'SD WebUI')
  return resolveImageCandidate(payload.images?.[0], fetchImpl)
}

async function generateWithOpenAI(config, options, fetchImpl) {
  const hasReferences = options.referenceImages.length > 0
  const request = hasReferences
    ? buildOpenAIEditRequest(config, options)
    : {
        url: 'https://api.openai.com/v1/images/generations',
        init: {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.defaultModel || 'dall-e-3',
            prompt: options.prompt,
            n: 1,
            size: normalizeOpenAIImageSize(options.width, options.height)
          })
        }
      }
  const response = await fetchImpl(request.url, request.init)
  const payload = await readJsonResponse(response, 'DALL-E')
  return resolveImageCandidate(payload.data?.[0]?.b64_json || payload.data?.[0]?.url, fetchImpl)
}

async function generateWithStability(config, options, fetchImpl) {
  const engine = config.defaultModel || 'stable-diffusion-xl-1024-v1-0'
  const hasReferences = options.referenceImages.length > 0
  const form = hasReferences ? new FormData() : null
  if (form) {
    form.append('init_image', dataUrlToBlob(options.referenceImages[0].data), 'reference.png')
    form.append('init_image_mode', 'IMAGE_STRENGTH')
    form.append('image_strength', String(options.referenceStrength))
    form.append('text_prompts[0][text]', options.prompt)
    form.append('text_prompts[0][weight]', '1')
    if (options.negativePrompt) {
      form.append('text_prompts[1][text]', options.negativePrompt)
      form.append('text_prompts[1][weight]', '-1')
    }
  }
  const response = await fetchImpl(`https://api.stability.ai/v1/generation/${engine}/${hasReferences ? 'image-to-image' : 'text-to-image'}`, {
    method: 'POST',
    headers: hasReferences ? { ...buildAuthHeaders(config), Accept: 'application/json' } : buildHeaders(config),
    body: form || JSON.stringify({
      text_prompts: [
        { text: options.prompt, weight: 1 },
        ...(options.negativePrompt ? [{ text: options.negativePrompt, weight: -1 }] : [])
      ],
      height: options.height,
      width: options.width
    })
  })
  const payload = await readJsonResponse(response, 'Stability')
  return resolveImageCandidate(payload.artifacts?.[0]?.base64, fetchImpl)
}

async function generateWithComfyUi(config, options, fetchImpl, baseUrl) {
  if (options.referenceImages.length > 0) {
    throw new Error('当前 ComfyUI adapter 需要自定义工作流才能使用参考图，请改用通用 HTTP 模板或 SD WebUI')
  }
  const url = requireBaseUrl(baseUrl)
  const response = await fetchImpl(`${url}/prompt`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ prompt: options.prompt })
  })
  const payload = await readJsonResponse(response, 'ComfyUI')
  const promptId = payload.prompt_id
  if (!promptId) throw new Error('ComfyUI 未返回任务 ID')

  const wait = typeof options.wait === 'function' ? options.wait : defaultWait
  for (let attempt = 0; attempt < options.maxPollAttempts; attempt += 1) {
    await wait(options.pollIntervalMs)
    const historyResponse = await fetchImpl(`${url}/history/${promptId}`)
    if (!historyResponse.ok) continue
    const history = await historyResponse.json()
    const outputs = history[promptId]?.outputs || {}

    for (const node of Object.values(outputs)) {
      const image = node?.images?.[0]
      if (!image?.filename) continue
      const params = new URLSearchParams({ filename: image.filename })
      if (image.subfolder) params.set('subfolder', image.subfolder)
      if (image.type) params.set('type', image.type)
      const imageResponse = await fetchImpl(`${url}/view?${params}`)
      if (imageResponse.ok) return blobToDataUrl(await imageResponse.blob())
    }
  }

  throw new Error('ComfyUI timeout')
}

async function generateWithGenericHttp(config, options, fetchImpl, baseUrl) {
  const response = await fetchImpl(requireBaseUrl(baseUrl), {
    method: 'POST',
    headers: buildHeaders(config),
    body: renderRequestTemplate(config.requestTemplate, options)
  })
  const payload = await readJsonResponse(response, 'HTTP')
  const candidate = readPath(payload, config.responsePath) || findCommonImageCandidate(payload)
  return resolveImageCandidate(candidate, fetchImpl)
}

function normalizeImageOptions(input) {
  return {
    ...DEFAULT_IMAGE_OPTIONS,
    ...input,
    prompt: String(input.prompt || '').trim(),
    negativePrompt: String(input.negativePrompt || ''),
    width: normalizePositiveNumber(input.width, DEFAULT_IMAGE_OPTIONS.width),
    height: normalizePositiveNumber(input.height, DEFAULT_IMAGE_OPTIONS.height),
    count: normalizePositiveNumber(input.count, DEFAULT_IMAGE_OPTIONS.count),
    referenceImages: normalizeReferenceImages(input.referenceImages),
    controlImages: normalizeControlImages(input.controlImages),
    maskImage: normalizeImageData(input.maskImage),
    referenceStrength: clampNumber(input.referenceStrength, 0.2, 0.9, DEFAULT_IMAGE_OPTIONS.referenceStrength),
    pollIntervalMs: normalizePositiveNumber(input.pollIntervalMs, DEFAULT_IMAGE_OPTIONS.pollIntervalMs),
    maxPollAttempts: normalizePositiveNumber(input.maxPollAttempts, DEFAULT_IMAGE_OPTIONS.maxPollAttempts)
  }
}

function renderRequestTemplate(template, options) {
  const source = String(template || '{"prompt":"{{prompt}}"}')
  const values = {
    prompt: escapeJsonString(options.prompt),
    negative_prompt: escapeJsonString(options.negativePrompt),
    width: String(options.width),
    height: String(options.height),
    n: String(options.count),
    aspect_ratio: `${options.width}:${options.height}`,
    reference_image: escapeJsonString(options.referenceImages[0]?.data || ''),
    reference_images_json: JSON.stringify(options.referenceImages.map((reference) => reference.data)),
    control_images_json: JSON.stringify(options.controlImages.map((control) => ({
      role: control.role,
      image: control.data,
      weight: control.weight
    }))),
    mask_image: escapeJsonString(options.maskImage),
    reference_strength: String(options.referenceStrength)
  }

  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
    source
  )
}

function findCommonImageCandidate(payload) {
  return payload?.data?.image_urls?.[0]
    || payload?.data?.image_base64?.[0]
    || payload?.data?.image_base64
    || payload?.image_base64
    || payload?.images?.[0]
    || (typeof payload?.images === 'string' ? payload.images : '')
    || payload?.data?.[0]?.b64_json
    || payload?.data?.[0]?.url
    || payload?.artifacts?.[0]?.base64
    || payload?.data?.b64_image
    || payload?.b64_image
    || ''
}

async function resolveImageCandidate(candidate, fetchImpl) {
  const value = Array.isArray(candidate) ? candidate[0] : candidate
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('未能从响应中提取图片，请检查响应字段映射或模型返回格式')
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetchImpl(value)
    if (!response.ok) throw new Error(`下载图片失败: ${response.status}`)
    return blobToDataUrl(await response.blob())
  }
  if (value.startsWith('data:image/')) return value
  return `data:image/png;base64,${value}`
}

function buildHeaders(config) {
  return { 'Content-Type': 'application/json', ...buildAuthHeaders(config) }
}

function buildAuthHeaders(config) {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
}

async function readJsonResponse(response, providerLabel) {
  if (!response.ok) {
    const details = await readResponseError(response)
    throw new Error(`${providerLabel} error: ${response.status}${details ? ` ${details}` : ''}`)
  }
  return response.json()
}

async function readResponseError(response) {
  try {
    return String(await response.text()).slice(0, 500)
  } catch {
    return response.statusText || ''
  }
}

function readPath(payload, path) {
  const keys = String(path || '').split('.').filter(Boolean)
  if (!keys.length) return null
  return keys.reduce((value, key) => value?.[key], payload)
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function buildMinimaxRoot(value) {
  const baseUrl = normalizeBaseUrl(value || IMAGE_MODEL_DEFAULTS.minimax_image.baseUrl)
  if (baseUrl.endsWith('/v1/image_generation')) return baseUrl.slice(0, -'/v1/image_generation'.length)
  if (baseUrl.endsWith('/v1')) return baseUrl.slice(0, -3)
  return baseUrl
}

function normalizeMinimaxAspectRatio(width, height, model) {
  const ratio = Number(width) / Number(height)
  const candidates = [
    ['1:1', 1], ['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2],
    ['2:3', 2 / 3], ['3:4', 3 / 4], ['9:16', 9 / 16]
  ]
  if (model === 'image-01') candidates.push(['21:9', 21 / 9])
  return candidates.reduce((best, item) => (
    Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best
  ))[0]
}

function requireBaseUrl(value) {
  if (!value) throw new Error('请先填写 API 地址')
  return value
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function normalizeReferenceImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter((reference) => typeof reference?.data === 'string' && reference.data.startsWith('data:image/'))
    .slice(0, 3)
    .map((reference) => ({
      id: String(reference.id || ''),
      data: reference.data,
      title: String(reference.title || '')
    }))
}

function normalizeControlImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter((control) => typeof control?.data === 'string' && control.data.startsWith('data:image/'))
    .slice(0, 4)
    .map((control) => ({
      id: String(control.id || ''),
      role: ['pose', 'edge', 'depth'].includes(control.role) ? control.role : 'edge',
      data: control.data,
      weight: clampNumber(control.weight, 0.1, 1, 1)
    }))
}

function normalizeImageData(value) {
  const data = String(value || '')
  return data.startsWith('data:image/') ? data : ''
}

function buildOpenAIEditRequest(config, options) {
  const form = new FormData()
  const configuredModel = String(config.defaultModel || '')
  const editModel = configuredModel.startsWith('gpt-image-') ? configuredModel : 'gpt-image-1'
  form.append('model', editModel)
  form.append('prompt', options.prompt)
  form.append('n', '1')
  form.append('size', normalizeOpenAIImageSize(options.width, options.height))
  form.append('input_fidelity', options.referenceStrength >= 0.65 ? 'high' : 'low')
  options.referenceImages.forEach((reference, index) => {
    form.append('image[]', dataUrlToBlob(reference.data), `reference-${index + 1}.png`)
  })
  if (options.maskImage) form.append('mask', dataUrlToBlob(options.maskImage), 'mask.png')
  return {
    url: 'https://api.openai.com/v1/images/edits',
    init: { method: 'POST', headers: buildAuthHeaders(config), body: form }
  }
}

function normalizeOpenAIImageSize(width, height) {
  if (width > height) return '1536x1024'
  if (height > width) return '1024x1536'
  return '1024x1024'
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match) throw new Error('参考图格式无效')
  const mimeType = match[1] || 'image/png'
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function escapeJsonString(value) {
  return JSON.stringify(String(value ?? '')).slice(1, -1)
}

function getFetch(fetchImpl) {
  const resolved = fetchImpl || globalThis.fetch
  if (typeof resolved !== 'function') throw new Error('当前环境不支持网络请求')
  return resolved
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
