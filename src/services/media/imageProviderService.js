import { buildMiniMaxImageSize, getMiniMaxAspectRatio, normalizeMiniMaxSubjectReferences, MINIMAX_REFERENCE_LIMIT } from '../../../shared/minimaxImageRequest.js'

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
  // This adapter's multipart contract is verified for these models only.
  // A configured legacy/unknown model must never be silently replaced.
  const openAIReference = ['gpt-image-1', 'gpt-image-1.5'].includes(String(config.defaultModel || 'gpt-image-1'))
  const template = String(config.requestTemplate || '')
  const hasTemplateToken = (token) => template.includes(`{{${token}}}`)
  const comfyBinding = type === 'comfyui' ? inspectComfyPromptBinding(template) : null
  if (type === 'http') {
    const imageToImage = hasTemplateToken('reference_image') || hasTemplateToken('reference_images_json')
    return {
      textToImage: true,
      imageToImage,
      inpaint: imageToImage && hasTemplateToken('mask_image'),
      identityReference: imageToImage,
      maxReferenceImages: hasTemplateToken('reference_images_json') ? 3 : imageToImage ? 1 : 0,
      controlImages: hasTemplateToken('control_images_json')
    }
  }
  const capabilities = {
    minimax_image: {
      textToImage: true,
      imageToImage: false,
      inpaint: false,
      identityReference: true,
      referenceKind: 'character',
      maxReferenceImages: MINIMAX_REFERENCE_LIMIT,
      controlImages: false
    },
    openai_dalle: {
      textToImage: true,
      imageToImage: openAIReference,
      inpaint: openAIReference,
      identityReference: openAIReference,
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
      textToImage: comfyBinding?.ok === true,
      configurationError: comfyBinding?.error || '',
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
  return { ...capabilities, maxReferenceImages: capabilities.maxReferenceImages ?? (capabilities.imageToImage ? (type === 'stability' ? 1 : 3) : 0) }
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
  throwIfAborted(options.signal)
  const fetchImpl = getFetch(input.fetchImpl)
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const capabilities = getImageProviderCapabilities(config)
  if (options.maskImage && (!capabilities.inpaint || !options.referenceImages.length)) {
    throw invalidImageInput('当前图片模型不支持带原图的局部遮罩修订')
  }
  if (options.controlImages.length && !capabilities.controlImages) {
    throw invalidImageInput('当前图片模型不支持独立 pose/edge/depth 控制图')
  }
  if (options.referenceImages.length && !capabilities.imageToImage && !capabilities.identityReference) {
    throw invalidImageInput('当前适配器未验证此模型的参考图输入，请更换模型或仅用文字生成')
  }
  if (options.referenceImages.length > capabilities.maxReferenceImages) throw invalidImageInput(`当前适配器最多提交 ${capabilities.maxReferenceImages} 张参考图`)

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
    comfyui: `${requireBaseUrl(baseUrl)}/system_stats`,
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
  const subjectReferences = normalizeMiniMaxSubjectReferences(options.referenceImages.map((reference) => ({
    type: 'character', image_file: reference.data
  })))
  const model = String(config.defaultModel || 'image-01').trim()
  if (!['image-01', 'image-01-live'].includes(model)) {
    throw invalidImageInput(`MiniMax 图片模型无效: ${model}`)
  }
  const prompt = [options.prompt, options.negativePrompt ? `避免出现：${options.negativePrompt}` : '']
    .filter(Boolean)
    .join('\n')
  if (!prompt) throw invalidImageInput('MiniMax 图片提示词不能为空')
  if (prompt.length > 1500) throw invalidImageInput('MiniMax 图片提示词不能超过 1500 字符')
  const imageSize = buildMiniMaxImageSize({ width: options.width, height: options.height, model })

  // 内置 MiniMax: key 由服务器持有, 经 /api/media/images 代理注入, 浏览器不接触真实 key
  if (config.builtin === true || config.serverKey === true) {
    return generateWithMinimaxViaServer(config, options, fetchImpl, { model, prompt, subjectReferences })
  }

  const response = await fetchWithSignal(fetchImpl, `${buildMinimaxRoot(baseUrl)}/v1/image_generation`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      model,
      prompt,
      ...imageSize,
      ...(subjectReferences.length ? { subject_reference: subjectReferences } : {}),
      response_format: 'base64',
      n: 1,
      prompt_optimizer: false,
      aigc_watermark: false
    })
  }, options.signal)
  const payload = await readJsonResponse(response, 'MiniMax Image', options.signal)
  const providerCode = Number(payload?.base_resp?.status_code ?? 0)
  if (providerCode !== 0) {
    throw new Error(`MiniMax Image ${providerCode}: ${payload?.base_resp?.status_msg || '生成失败'}`)
  }
  const base64 = payload?.data?.image_base64?.[0]
  if (typeof base64 === 'string' && base64.trim()) return `data:image/jpeg;base64,${base64}`
  return resolveImageCandidate(payload?.data?.image_urls?.[0], fetchImpl, options.signal)
}

/**
 * 内置 MiniMax: 图片生成经服务器 /api/media/images 代理。
 * 浏览器提交哨兵/空 key + 生成参数, 服务器注入 MINIMAX_API_KEY 后转发 MiniMax。
 */
async function generateWithMinimaxViaServer(config, options, fetchImpl, { model, prompt, subjectReferences }) {
  if (subjectReferences.length) {
    let capabilities
    try {
      const capabilityResponse = await fetchWithSignal(fetchImpl, '/api/media/images/capabilities', { cache: 'no-store' }, options.signal)
      if (capabilityResponse.ok) capabilities = await capabilityResponse.json()
    } catch {
      throwIfAborted(options.signal)
      throw invalidImageInput('暂时无法确认人物参考功能，请稍后重试')
    }
    throwIfAborted(options.signal)
    if (capabilities?.ok !== true || capabilities?.characterReference !== true
      || !(Number(capabilities.maxReferenceImages) >= subjectReferences.length)) {
      throw invalidImageInput('当前内置图片服务不支持人物参考，请移除参考图或切换到已配置的图片模型')
    }
  }
  const response = await fetchWithSignal(fetchImpl, '/api/media/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      width: options.width,
      height: options.height,
      aspectRatio: getMiniMaxAspectRatio(options.width, options.height, model),
      subjectReferences,
      providerConfig: { apiKey: config.apiKey, baseUrl: config.baseUrl }
    })
  }, options.signal)
  let payload = {}
  try {
    payload = await response.json()
    throwIfAborted(options.signal)
  } catch {
    throwIfAborted(options.signal)
    payload = {}
  }
  if (!response.ok || payload?.ok !== true) {
    throw Object.assign(new Error(payload?.message || `MiniMax Image error: ${response.status || 'unknown'}`), { status: response.status })
  }
  return resolveImageCandidate(payload.image, fetchImpl, options.signal)
}

async function generateWithSdWebui(config, options, fetchImpl, baseUrl) {
  const hasReferences = options.referenceImages.length > 0 || Boolean(options.maskImage)
  const response = await fetchWithSignal(fetchImpl, `${requireBaseUrl(baseUrl)}/sdapi/v1/${hasReferences ? 'img2img' : 'txt2img'}`, {
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
  }, options.signal)
  const payload = await readJsonResponse(response, 'SD WebUI', options.signal)
  return resolveImageCandidate(payload.images?.[0], fetchImpl, options.signal)
}

async function generateWithOpenAI(config, options, fetchImpl) {
  const hasReferences = options.referenceImages.length > 0
  const request = hasReferences
    ? buildOpenAIEditRequest(config, options)
    : {
        url: resolveOpenAIImageEndpoint(config, 'generations'),
        init: {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.defaultModel || 'gpt-image-1',
            prompt: options.prompt,
            n: 1,
            size: normalizeOpenAIImageSize(options.width, options.height)
          })
        }
      }
  const response = await fetchWithSignal(fetchImpl, request.url, request.init, options.signal)
  const payload = await readJsonResponse(response, 'DALL-E', options.signal)
  return resolveImageCandidate(payload.data?.[0]?.b64_json || payload.data?.[0]?.url, fetchImpl, options.signal)
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
  const response = await fetchWithSignal(fetchImpl, `https://api.stability.ai/v1/generation/${engine}/${hasReferences ? 'image-to-image' : 'text-to-image'}`, {
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
  }, options.signal)
  const payload = await readJsonResponse(response, 'Stability', options.signal)
  return resolveImageCandidate(payload.artifacts?.[0]?.base64, fetchImpl, options.signal)
}

async function generateWithComfyUi(config, options, fetchImpl, baseUrl) {
  if (options.referenceImages.length > 0) {
    throw new Error('当前 ComfyUI adapter 需要自定义工作流才能使用参考图，请改用通用 HTTP 模板或 SD WebUI')
  }
  const url = requireBaseUrl(baseUrl)
  const workflow = parseComfyWorkflow(config.requestTemplate, options)
  const response = await fetchWithSignal(fetchImpl, `${url}/prompt`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ prompt: workflow })
  }, options.signal)
  const payload = await readJsonResponse(response, 'ComfyUI', options.signal)
  const promptId = payload.prompt_id
  if (!promptId) throw new Error('ComfyUI 未返回任务 ID')

  const wait = typeof options.wait === 'function' ? options.wait : defaultWait
  for (let attempt = 0; attempt < options.maxPollAttempts; attempt += 1) {
    await waitWithSignal(wait, options.pollIntervalMs, options.signal)
    const historyResponse = await fetchWithSignal(fetchImpl, `${url}/history/${promptId}`, {}, options.signal)
    if (!historyResponse.ok) continue
    const history = await historyResponse.json()
    throwIfAborted(options.signal)
    if (history[promptId]?.status?.status_str === 'error') throw new Error('ComfyUI 工作流执行失败，请检查节点与模型配置')
    const outputs = history[promptId]?.outputs || {}

    for (const [nodeId, node] of Object.entries(outputs)) {
      if (!['SaveImage', 'PreviewImage'].includes(workflow[nodeId]?.class_type)) continue
      const image = node?.images?.[0]
      if (!image?.filename) continue
      const params = new URLSearchParams({ filename: image.filename })
      if (image.subfolder) params.set('subfolder', image.subfolder)
      if (image.type) params.set('type', image.type)
      const imageResponse = await fetchWithSignal(fetchImpl, `${url}/view?${params}`, {}, options.signal)
      if (imageResponse.ok) {
        const blob = await imageResponse.blob()
        throwIfAborted(options.signal)
        return blobToDataUrl(blob, options.signal)
      }
    }
  }

  throw new Error('ComfyUI timeout')
}

function parseComfyWorkflow(template, options) {
  const binding = inspectComfyPromptBinding(template)
  if (!binding.ok) throw invalidImageInput(binding.error)
  return readComfyWorkflow(template, options)
}

function readComfyWorkflow(template, options) {
  let workflow
  try { workflow = JSON.parse(renderRequestTemplate(template, options)) } catch {
    throw invalidImageInput('ComfyUI API 工作流 JSON 无效')
  }
  if (workflow?.prompt && typeof workflow.prompt === 'object') workflow = workflow.prompt
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) || !Object.keys(workflow).length
    || Object.values(workflow).some((node) => !node || typeof node.class_type !== 'string'
      || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs))) {
    throw invalidImageInput('请使用 ComfyUI 的 API 格式工作流，不是编辑器布局 JSON')
  }
  return workflow
}

// Follow known port contracts only. A token in a disconnected/negative node is
// not an author prompt binding, and custom nodes cannot be inferred safely.
function inspectComfyPromptBinding(template) {
  const failure = (error) => ({ ok: false, error })
  if (!String(template || '').trim()) return failure('请先配置 ComfyUI 导出的 API 工作流 JSON')
  let workflow
  try {
    // Preserve the text token while replacing numeric template variables with
    // valid numbers, including unquoted {{width}} / {{height}} / {{seed}}.
    workflow = readComfyWorkflow(template, { ...DEFAULT_IMAGE_OPTIONS, prompt: '{{prompt}}', seed: 0 })
  } catch (error) { return failure(error.message) }
  const outputs = Object.values(workflow).filter((node) => ['SaveImage', 'PreviewImage'].includes(node.class_type))
  if (!outputs.length) return failure('当前 ComfyUI 适配器仅支持连接到 SaveImage 或 PreviewImage 的工作流')
  const unsupported = new Set()
  const routes = {
    image: {
      VAEDecode: { samples: 'samples' },
      VAEDecodeTiled: { samples: 'samples' },
      ImageScale: { image: 'image' },
      ImageScaleBy: { image: 'image' }
    },
    samples: {
      KSampler: { positive: 'conditioning' },
      KSamplerAdvanced: { positive: 'conditioning' },
      SamplerCustom: { positive: 'conditioning' },
      SamplerCustomAdvanced: { guider: 'guider' }
    },
    guider: {
      BasicGuider: { conditioning: 'conditioning' },
      CFGGuider: { positive: 'conditioning' }
    },
    conditioning: {
      FluxGuidance: { conditioning: 'conditioning' },
      ConditioningSetArea: { conditioning: 'conditioning' },
      ConditioningSetAreaPercentage: { conditioning: 'conditioning' },
      ConditioningSetMask: { conditioning: 'conditioning' },
      ConditioningSetTimestepRange: { conditioning: 'conditioning' },
      ConditioningCombine: { conditioning_1: 'conditioning', conditioning_2: 'conditioning' },
      ConditioningConcat: { conditioning_to: 'conditioning', conditioning_from: 'conditioning' },
      ConditioningAverage: { conditioning_to: 'conditioning', conditioning_from: 'conditioning' },
      ControlNetApply: { conditioning: 'conditioning' },
      ControlNetApplyAdvanced: { positive: 'conditioning' }
    }
  }
  const textInputs = {
    CLIPTextEncode: ['text'],
    CLIPTextEncodeSDXL: ['text_g', 'text_l'],
    CLIPTextEncodeSDXLRefiner: ['text'],
    CLIPTextEncodeFlux: ['clip_l', 't5xxl']
  }
  function reachesPrompt(link, kind, visited = new Set()) {
    if (!Array.isArray(link) || link.length !== 2 || !Number.isInteger(link[1]) || link[1] < 0) return false
    const id = String(link[0]), slot = link[1], node = workflow[id]
    const key = `${id}:${slot}:${kind}`
    if (!node || visited.has(key)) return false
    const nextVisited = new Set(visited).add(key)
    // SamplerCustom nodes expose both the sampled and denoised latent result.
    if (slot !== 0 && !(kind === 'samples' && slot === 1 && ['SamplerCustom', 'SamplerCustomAdvanced'].includes(node.class_type))) return false
    const fields = kind === 'conditioning' ? textInputs[node.class_type] : null
    if (fields) return fields.some((field) => typeof node.inputs[field] === 'string' && node.inputs[field].includes('{{prompt}}'))
    const route = routes[kind]?.[node.class_type]
    if (!route) { unsupported.add(node.class_type); return false }
    return Object.entries(route).some(([field, nextKind]) => reachesPrompt(node.inputs[field], nextKind, nextVisited))
  }
  if (outputs.every((node) => reachesPrompt(node.inputs.images, 'image'))) return { ok: true, error: '' }
  if (unsupported.size) return failure(`ComfyUI 正向图片链含未支持节点：${[...unsupported].join('、')}；请使用标准文本编码、采样与图片输出节点`)
  return failure('请将含 {{prompt}} 的文本编码节点连接到图片输出的正向 conditioning；负向或未连接文本不会用于生成')
}

async function generateWithGenericHttp(config, options, fetchImpl, baseUrl) {
  const response = await fetchWithSignal(fetchImpl, requireBaseUrl(baseUrl), {
    method: 'POST',
    headers: buildHeaders(config),
    body: renderRequestTemplate(config.requestTemplate, options)
  }, options.signal)
  const payload = await readJsonResponse(response, 'HTTP', options.signal)
  const candidate = readPath(payload, config.responsePath) || findCommonImageCandidate(payload)
  return resolveImageCandidate(candidate, fetchImpl, options.signal)
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
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : Math.floor(Math.random() * 2147483647),
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
    seed: String(options.seed ?? 0),
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

  return source.replace(/\{\{([a-z_]+)\}\}/g, (token, key) => values[key] ?? token)
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

async function resolveImageCandidate(candidate, fetchImpl, signal) {
  throwIfAborted(signal)
  const value = Array.isArray(candidate) ? candidate[0] : candidate
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('未能从响应中提取图片，请检查响应字段映射或模型返回格式')
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetchWithSignal(fetchImpl, value, {}, signal)
    if (!response.ok) throw new Error(`下载图片失败: ${response.status}`)
    const blob = await response.blob()
    throwIfAborted(signal)
    return blobToDataUrl(blob, signal)
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

async function readJsonResponse(response, providerLabel, signal) {
  throwIfAborted(signal)
  if (!response.ok) {
    const details = await readResponseError(response)
    throwIfAborted(signal)
    throw Object.assign(new Error(`${providerLabel} error: ${response.status}${details ? ` ${details}` : ''}`), { status: response.status })
  }
  const payload = await response.json()
  throwIfAborted(signal)
  return payload
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

function requireBaseUrl(value) {
  if (!value) throw invalidImageInput('请先填写 API 地址')
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
  if (images.some((reference) => typeof reference?.data !== 'string' || !reference.data.startsWith('data:image/'))) {
    throw invalidImageInput('参考图未载入或格式无效，请重新选择')
  }
  return images
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

function invalidImageInput(message) {
  return Object.assign(new Error(message), { code: 'ERR_INVALID_INPUT', status: 400 })
}

function normalizeImageData(value) {
  const data = String(value || '')
  return data.startsWith('data:image/') ? data : ''
}

function resolveOpenAIImageEndpoint(config, action) {
  const base = normalizeBaseUrl(config.baseUrl || 'https://api.openai.com/v1')
  return /\/images\/(?:edits|generations)$/.test(base) ? base.replace(/(?:edits|generations)$/, action) : `${base}/images/${action}`
}

function buildOpenAIEditRequest(config, options) {
  const form = new FormData()
  const editModel = String(config.defaultModel || 'gpt-image-1')
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
    url: resolveOpenAIImageEndpoint(config, 'edits'),
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

async function fetchWithSignal(fetchImpl, url, init = {}, signal) {
  throwIfAborted(signal)
  const response = await fetchImpl(url, signal ? { ...init, signal } : init)
  throwIfAborted(signal)
  return response
}

function waitWithSignal(wait, ms, signal) {
  throwIfAborted(signal)
  if (!signal) return Promise.resolve().then(() => wait(ms))
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortReason(signal))
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve()
      .then(() => wait(ms))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  }).then((value) => {
    throwIfAborted(signal)
    return value
  })
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  throw abortReason(signal)
}

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason
  if (typeof DOMException === 'function') return new DOMException('操作已取消', 'AbortError')
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  return error
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function blobToDataUrl(blob, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => {
      try { reader.abort() } catch { /* reader may already be complete */ }
      reject(abortReason(signal))
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    reader.onloadend = () => {
      signal?.removeEventListener('abort', abort)
      try {
        throwIfAborted(signal)
        resolve(reader.result)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => {
      signal?.removeEventListener('abort', abort)
      reject(reader.error || new Error('无法读取图片内容'))
    }
    reader.readAsDataURL(blob)
  })
}
