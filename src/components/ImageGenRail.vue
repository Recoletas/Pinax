<template>
  <aside :class="['image-gen-rail', `image-gen-rail--${side}`]" :style="railStyle" aria-label="生图功能">
    <div class="image-gen-drawer" v-if="imageDrawerOpen" @click.stop>
      <div class="image-gen-header">
        <span class="image-gen-title">{{ drawerTitle }}</span>
        <button class="image-gen-config-btn" type="button" @click="openImageConfig" title="模型配置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
        </button>
      </div>

      <div class="image-gen-prompt-row">
        <textarea
          v-model="imagePrompt"
          class="image-gen-prompt-input"
          placeholder="描述你想生成的图片..."
          rows="3"
        ></textarea>
      </div>

      <div class="image-gen-prompt-row" v-if="selectedTextText">
        <button class="image-gen-use-card-btn" type="button" @click="useSelectedTextAsPrompt">
          {{ importButtonLabel }}
        </button>
      </div>

      <div class="image-gen-section">
        <label class="image-gen-label">模型</label>
        <select v-model="imageSelectedModel" class="image-gen-select">
          <option value="">选择模型...</option>
          <option v-for="cfg in modelConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
        </select>
      </div>

      <div class="image-gen-section">
        <label class="image-gen-label">尺寸</label>
        <div class="image-gen-sizes">
          <button
            v-for="preset in sizePresets"
            :key="preset.label"
            class="image-gen-size-btn"
            :class="{ active: imageWidth === preset.width && imageHeight === preset.height }"
            type="button"
            @click="imageWidth = preset.width; imageHeight = preset.height"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="image-gen-section">
        <label class="image-gen-label">数量</label>
        <div class="image-gen-count-row">
          <button
            v-for="n in [1, 2, 3, 4]"
            :key="n"
            class="image-gen-count-btn"
            :class="{ active: imageCount === n }"
            type="button"
            @click="imageCount = n"
          >{{ n }}</button>
        </div>
      </div>

      <div class="image-gen-section">
        <label class="image-gen-label">负面提示词（可选）</label>
        <textarea
          v-model="imageNegativePrompt"
          class="image-gen-prompt-input small"
          placeholder="不想出现的内容..."
          rows="2"
        ></textarea>
      </div>

      <div class="image-gen-actions">
        <button
          class="image-gen-generate-btn"
          type="button"
          @click="generateImages"
          :disabled="imageGenerating || !imagePrompt.trim() || !imageSelectedModel"
        >
          <span v-if="imageGenerating" class="spin-icon">⟳</span>
          <span v-else>生成</span>
        </button>
      </div>

      <div v-if="imageLibrary.length > 0" class="image-gen-results">
        <div class="image-gen-results-title">历史记录</div>
        <div class="image-gen-grid">
          <div
            v-for="(img, idx) in imageLibrary"
            :key="img.id"
            class="image-gen-thumb"
            @click="imagePreviewIndex = idx"
          >
            <img :src="img.data" alt="generated" />
          </div>
        </div>
      </div>
    </div>

    <button class="image-gen-btn" type="button" @click.stop="imageDrawerOpen = !imageDrawerOpen" title="生图">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    </button>

    <div v-if="imagePreviewIndex >= 0" class="image-preview-overlay" @click="imagePreviewIndex = -1">
      <div class="image-preview-modal" @click.stop>
        <div class="image-preview-header">
          <span>图片预览</span>
          <button class="image-preview-close" @click="imagePreviewIndex = -1">×</button>
        </div>
        <div class="image-preview-body">
          <img :src="imageLibrary[imagePreviewIndex]?.data" alt="preview" />
        </div>
        <div class="image-preview-actions">
          <button class="image-preview-action-btn" @click="copyImagePrompt(imageLibrary[imagePreviewIndex])">复制提示词</button>
          <button class="image-preview-action-btn" @click="saveToMaterialLib(imageLibrary[imagePreviewIndex])">保存</button>
        </div>
      </div>
    </div>

    <div v-if="showImageConfigDialog && editingModelConfig" class="dialog-overlay" @click="showImageConfigDialog = false">
      <div class="dialog image-config-dialog" @click.stop>
        <div class="dialog-header">
          {{ editingModelConfig.id ? '编辑模型' : '添加模型' }}
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>名称</label>
            <input v-model="editingModelConfig.name" class="input" placeholder="例如：我的SD" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="editingModelConfig.type" class="input">
              <option v-for="t in modelTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="editingModelConfig.baseUrl" class="input" placeholder="http://127.0.0.1:7860" />
          </div>
          <div class="form-group">
            <label>API Key（可选）</label>
            <input v-model="editingModelConfig.apiKey" class="input" type="password" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>默认模型 ID</label>
            <input v-model="editingModelConfig.defaultModel" class="input" placeholder="stable-diffusion-xl-base-1.0" />
          </div>
          <div class="form-group">
            <label>响应字段路径（可选）</label>
            <input v-model="editingModelConfig.responsePath" class="input" placeholder="data.image_base64.0" />
          </div>
          <div v-if="editingModelConfig.type === 'http'" class="form-group">
            <label>请求体模板（JSON）</label>
            <textarea v-model="editingModelConfig.requestTemplate" class="input" rows="3" placeholder='{"prompt": "{{prompt}}"}'></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn" type="button" @click="testModelConnection">测试连通性</button>
          <button class="btn" type="button" @click="showImageConfigDialog = false">取消</button>
          <button class="btn-primary" type="button" @click="saveModelConfig">保存</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({
  storageKey: {
    type: String,
    required: true
  },
  selectedText: {
    type: String,
    default: ''
  },
  selectedPromptLabel: {
    type: String,
    default: '当前选中'
  },
  drawerTitle: {
    type: String,
    default: '生图'
  },
  side: {
    type: String,
    default: 'right'
  },
  verticalOffset: {
    type: Number,
    default: 0
  },
  horizontalOffset: {
    type: Number,
    default: 0
  }
})

const sharedModelKey = 'image_model_configs'
const imageDrawerOpen = ref(false)
const imagePrompt = ref('')
const imageNegativePrompt = ref('')
const imageSelectedModel = ref('')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageCount = ref(1)
const imageGenerating = ref(false)
const imageLibrary = ref([])
const imagePreviewIndex = ref(-1)
const showImageConfigDialog = ref(false)
const editingModelConfig = ref(null)
const modelConfigs = ref([])

const sizePresets = [
  { label: '1:1 方图', width: 1024, height: 1024 },
  { label: '16:9 宽图', width: 1280, height: 720 },
  { label: '9:16 竖图', width: 720, height: 1280 },
  { label: '4:3 横图', width: 1024, height: 768 },
  { label: '3:4 竖图', width: 768, height: 1024 }
]

const modelTypes = [
  { value: 'openai_dalle', label: 'OpenAI DALL-E' },
  { value: 'stability', label: 'Stability AI' },
  { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'http', label: '通用 HTTP' }
]

const selectedTextText = computed(() => String(props.selectedText || '').trim())
const importButtonLabel = computed(() => `导入${props.selectedPromptLabel || '当前选中'}`)
const railStyle = computed(() => {
  const side = props.side === 'left' ? 'left' : 'right'
  const offset = props.horizontalOffset > 0 ? `${props.horizontalOffset}px` : '0px'
  return {
    [side]: offset,
    '--rail-shift-y': `${props.verticalOffset}px`,
    '--rail-right-offset': props.side === 'right' ? offset : undefined,
    '--rail-left-offset': props.side === 'left' ? offset : undefined
  }
})

onMounted(() => {
  loadModelConfigs()
  loadImageLibrary()
})

watch(imageLibrary, () => saveImageLibrary(), { deep: true })

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

function loadModelConfigs() {
  const configs = readJson(sharedModelKey, [])
  modelConfigs.value = Array.isArray(configs) ? configs : []
  if (modelConfigs.value.length && !imageSelectedModel.value) {
    imageSelectedModel.value = modelConfigs.value[0].id
  }
}

function loadImageLibrary() {
  const library = readJson(props.storageKey, [])
  imageLibrary.value = Array.isArray(library) ? library : []
}

function saveImageLibrary() {
  writeJson(props.storageKey, imageLibrary.value.slice(0, 20))
}

function openImageConfig() {
  editingModelConfig.value = {
    id: '',
    name: '',
    type: 'sd_webui',
    baseUrl: 'http://127.0.0.1:7860',
    apiKey: '',
    defaultModel: '',
    responsePath: '',
    requestTemplate: ''
  }
  showImageConfigDialog.value = true
}

function saveModelConfig() {
  if (!editingModelConfig.value?.name) return
  const cfg = { ...editingModelConfig.value }
  if (!cfg.id) {
    cfg.id = `model_${Date.now()}`
    modelConfigs.value.push(cfg)
  } else {
    const idx = modelConfigs.value.findIndex((item) => item.id === cfg.id)
    if (idx >= 0) modelConfigs.value[idx] = cfg
  }
  writeJson(sharedModelKey, modelConfigs.value)
  showImageConfigDialog.value = false
  if (!imageSelectedModel.value) {
    imageSelectedModel.value = cfg.id
  }
}

function testModelConnection() {
  if (!editingModelConfig.value?.baseUrl) {
    alert('请先填写 API 地址')
    return
  }
  void testModelConnectionAsync()
}

async function testModelConnectionAsync() {
  try {
    const baseUrl = editingModelConfig.value.baseUrl.replace(/\/$/, '')
    const type = editingModelConfig.value.type

    if (type === 'http') {
      const headers = { 'Content-Type': 'application/json' }
      if (editingModelConfig.value.apiKey) {
        headers.Authorization = `Bearer ${editingModelConfig.value.apiKey}`
      }
      let body = editingModelConfig.value.requestTemplate || '{"prompt":"test"}'
      body = body.replace(/\{\{prompt\}\}/g, 'test').replace(/\{\{negative_prompt\}\}/g, '')

      const resp = await fetch(baseUrl, { method: 'POST', headers, body })
      alert(resp.ok ? '连接成功！' : `连接失败: ${resp.status} ${await resp.text().catch(() => '')}`)
      return
    }

    let testUrl = baseUrl
    if (type === 'sd_webui') testUrl = `${baseUrl}/sdapi/v1/progress`
    else if (type === 'comfyui') testUrl = `${baseUrl}/api/system_stats`
    else if (type === 'openai_dalle') testUrl = 'https://api.openai.com/v1/models'
    else if (type === 'stability') testUrl = 'https://api.stability.ai/v1/account'

    const opts = { method: 'GET' }
    if (editingModelConfig.value.apiKey && (type === 'openai_dalle' || type === 'stability')) {
      opts.headers = { Authorization: `Bearer ${editingModelConfig.value.apiKey}` }
    }
    const resp = await fetch(testUrl, opts)
    alert(resp.ok ? '连接成功！' : `连接失败: ${resp.status} ${resp.statusText}`)
  } catch (error) {
    alert('连接失败: ' + error.message)
  }
}

function useSelectedTextAsPrompt() {
  if (!selectedTextText.value) return
  imagePrompt.value = selectedTextText.value
}

async function generateImages() {
  if (!imagePrompt.value.trim()) {
    alert('请输入提示词')
    return
  }
  if (!imageSelectedModel.value) {
    alert('请先选择或添加模型')
    return
  }

  const cfg = modelConfigs.value.find((item) => item.id === imageSelectedModel.value)
  if (!cfg) {
    alert('未找到选中的模型配置')
    return
  }

  console.log('[ImageGen] 开始生成', {
    prompt: imagePrompt.value,
    negativePrompt: imageNegativePrompt.value,
    model: cfg.name,
    baseUrl: cfg.baseUrl,
    type: cfg.type
  })

  imageGenerating.value = true
  try {
    const results = []
    for (let i = 0; i < imageCount.value; i += 1) {
      results.push(await callImageAPI(cfg, imagePrompt.value, imageNegativePrompt.value))
    }

    for (const data of results) {
      imageLibrary.value.unshift({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: imagePrompt.value,
        negativePrompt: imageNegativePrompt.value,
        modelName: cfg.name,
        modelType: cfg.type,
        width: imageWidth.value,
        height: imageHeight.value,
        data,
        createdAt: new Date().toISOString()
      })
    }
    saveImageLibrary()
  } catch (error) {
    alert('生成失败: ' + error.message)
  } finally {
    imageGenerating.value = false
  }
}

async function callImageAPI(cfg, prompt, negativePrompt) {
  const baseUrl = (cfg.baseUrl || '').replace(/\/$/, '')

  switch (cfg.type) {
    case 'sd_webui': {
      const resp = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          steps: 20,
          width: imageWidth.value,
          height: imageHeight.value
        })
      })
      if (!resp.ok) throw new Error(`SD WebUI error: ${resp.status}`)
      const json = await resp.json()
      if (json.images?.[0]) return 'data:image/png;base64,' + json.images[0]
      throw new Error('No image in response')
    }
    case 'openai_dalle': {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.defaultModel || 'dall-e-3',
          prompt,
          n: 1,
          size: `${imageWidth.value}x${imageHeight.value}`
        })
      })
      if (!resp.ok) throw new Error(`DALL-E error: ${resp.status}`)
      const json = await resp.json()
      if (json.data?.[0]?.url) {
        return await urlToDataUrl(json.data[0].url)
      }
      throw new Error('No image in response')
    }
    case 'stability': {
      const resp = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }, ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : [])],
          height: imageHeight.value,
          width: imageWidth.value
        })
      })
      if (!resp.ok) throw new Error(`Stability error: ${resp.status}`)
      const json = await resp.json()
      if (json.artifacts?.[0]?.base64) return 'data:image/png;base64,' + json.artifacts[0].base64
      throw new Error('No image in response')
    }
    case 'comfyui': {
      const resp = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      if (!resp.ok) throw new Error(`ComfyUI error: ${resp.status}`)
      const json = await resp.json()
      const promptId = json.prompt_id
      for (let i = 0; i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const histResp = await fetch(`${baseUrl}/history/${promptId}`)
        if (!histResp.ok) continue
        const hist = await histResp.json()
        if (hist[promptId]?.outputs) {
          for (const nodeId of Object.keys(hist[promptId].outputs)) {
            const node = hist[promptId].outputs[nodeId]
            if (node.images?.[0]) {
              const img = node.images[0]
              const imgResp = await fetch(`${baseUrl}/view?filename=${img.filename}`)
              if (imgResp.ok) {
                return await blobToDataUrl(await imgResp.blob())
              }
            }
          }
        }
      }
      throw new Error('ComfyUI timeout')
    }
    case 'http': {
      let body = cfg.requestTemplate || '{"prompt":"{{prompt}}"}'
      body = body
        .replace(/\{\{prompt\}\}/g, prompt.replace(/"/g, '\\"'))
        .replace(/\{\{negative_prompt\}\}/g, (negativePrompt || '').replace(/"/g, '\\"'))
        .replace(/\{\{width\}\}/g, imageWidth.value)
        .replace(/\{\{height\}\}/g, imageHeight.value)
        .replace(/\{\{n\}\}/g, imageCount.value)
        .replace(/\{\{aspect_ratio\}\}/g, `${imageWidth.value}:${imageHeight.value}`)

      body = body.replace(/"response_format"\s*:\s*"url"/, '"response_format":"base64"')
      if (!body.includes('"response_format"')) {
        body = body.replace(/\}$/, ',"response_format":"base64"}')
      }

      console.log('[ImageGen] 发送请求体:', body)

      const headers = { 'Content-Type': 'application/json' }
      if (cfg.apiKey) {
        headers.Authorization = `Bearer ${cfg.apiKey}`
      }

      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status}: ${errText}`)
      }

      const json = await resp.json()
      console.log('[ImageGen] API 响应原始数据:', JSON.stringify(json).substring(0, 500))
      let imageData = null

      if (cfg.responsePath) {
        try {
          const keys = cfg.responsePath.split('.')
          let value = json
          for (const key of keys) value = value?.[key]
          imageData = value
        } catch {
          imageData = null
        }
      }

      if (!imageData) {
        if (json.data?.image_urls?.[0]) {
          imageData = await urlToDataUrl(json.data.image_urls[0])
        } else if (json.data?.image_base64?.[0]) {
          imageData = 'data:image/png;base64,' + json.data.image_base64[0]
        } else if (typeof json.data?.image_base64 === 'string') {
          imageData = 'data:image/png;base64,' + json.data.image_base64
        } else if (typeof json.image_base64 === 'string') {
          imageData = 'data:image/png;base64,' + json.image_base64
        } else if (json.images?.[0]) {
          imageData = 'data:image/png;base64,' + json.images[0]
        } else if (typeof json.images === 'string') {
          imageData = 'data:image/png;base64,' + json.images
        } else if (json.data?.[0]?.b64_json) {
          imageData = 'data:image/png;base64,' + json.data[0].b64_json
        } else if (json.data?.[0]?.url) {
          imageData = await urlToDataUrl(json.data[0].url)
        } else if (json.artifacts?.[0]?.base64) {
          imageData = 'data:image/png;base64,' + json.artifacts[0].base64
        } else if (json.data?.b64_image) {
          imageData = 'data:image/png;base64,' + json.data.b64_image
        } else if (json.data?.image_base64) {
          imageData = 'data:image/png;base64,' + json.data.image_base64
        } else if (json.b64_image) {
          imageData = 'data:image/png;base64,' + json.b64_image
        }
      }

      if (imageData) {
        if (typeof imageData === 'string' && imageData.startsWith('http')) {
          imageData = await urlToDataUrl(imageData)
        }
        return imageData
      }

      throw new Error('未能从响应中提取图片，请检查响应字段映射或模型返回格式')
    }
    default:
      throw new Error('Unknown model type')
  }
}

function copyImagePrompt(imgEntry) {
  if (!imgEntry?.prompt) return
  navigator.clipboard.writeText(imgEntry.prompt)
}

function saveToMaterialLib() {
  imagePreviewIndex.value = -1
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function urlToDataUrl(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`下载图片失败: ${resp.status}`)
  return blobToDataUrl(await resp.blob())
}
</script>

<style scoped>
.image-gen-rail {
  position: fixed;
  top: 50%;
  transform: translateY(calc(-50% + var(--rail-shift-y, 0px)));
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 200;
  transition: transform 0.2s ease;
}

.image-gen-rail--right {
  flex-direction: row-reverse;
}

.image-gen-rail--left {
  flex-direction: row;
}

.image-gen-rail--right {
  right: var(--rail-right-offset, 0px);
  transform: translateX(48px) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail--left {
  left: var(--rail-left-offset, 0px);
  transform: translateX(-48px) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail:hover,
.image-gen-rail:focus-within {
  transform: translateX(0) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-rail:has(.image-gen-drawer) {
  transform: translateX(0) translateY(calc(-50% + var(--rail-shift-y, 0px)));
}

.image-gen-btn {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 18%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.image-gen-rail--left .image-gen-btn {
  border-radius: 0 12px 12px 0;
}

.image-gen-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-drawer {
  width: 320px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 8%, transparent);
}

.image-gen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.image-gen-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-gen-config-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.image-gen-config-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.image-gen-prompt-row {
  margin-bottom: 8px;
}

.image-gen-prompt-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
}

.image-gen-prompt-input:focus {
  outline: none;
  border-color: var(--accent);
}

.image-gen-prompt-input.small {
  min-height: 56px;
}

.image-gen-use-card-btn {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}

.image-gen-use-card-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-section {
  margin-bottom: 8px;
}

.image-gen-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.image-gen-select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
  font-size: 12px;
}

.image-gen-sizes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.image-gen-size-btn,
.image-gen-count-btn {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  cursor: pointer;
}

.image-gen-size-btn.active,
.image-gen-count-btn.active,
.image-gen-size-btn:hover,
.image-gen-count-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-count-row {
  display: flex;
  gap: 6px;
}

.image-gen-actions {
  margin-top: 10px;
}

.image-gen-generate-btn {
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 9px 12px;
  background: var(--accent);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.image-gen-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-gen-results {
  margin-top: 12px;
}

.image-gen-results-title {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.image-gen-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-gen-thumb {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-primary);
}

.image-gen-thumb img {
  width: 100%;
  height: 92px;
  object-fit: cover;
  display: block;
}

.image-preview-overlay,
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.image-preview-modal,
.dialog {
  background: var(--bg-secondary);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-header,
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-preview-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-close:hover {
  background: var(--bg-hover);
}

.image-preview-body {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.image-preview-body img {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
}

.image-preview-actions,
.dialog-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.image-preview-action-btn,
.btn,
.btn-primary {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-preview-action-btn:hover,
.btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.btn-primary:hover {
  filter: brightness(1.03);
}

.dialog-body {
  padding: 16px;
  display: grid;
  gap: 10px;
}

.form-group {
  display: grid;
  gap: 6px;
}

.form-group label,
.input {
  font-size: 12px;
}

.input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
}

.image-config-dialog {
  width: 420px;
}

@media (max-width: 900px) {
  .image-gen-rail {
    top: auto;
    bottom: 20px;
    transform: none;
  }

  .image-gen-drawer {
    width: min(320px, calc(100vw - 72px));
  }
}
</style>