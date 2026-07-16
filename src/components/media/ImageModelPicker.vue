<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  createImageModelConfigDraft,
  IMAGE_MODEL_TYPES,
  testImageProviderConnection
} from '../../services/media/imageProviderService'
import {
  deleteImageProviderConfig,
  listImageProviderConfigs,
  saveImageProviderConfig
} from '../../services/media/imageProviderConfigStore'

const props = defineProps({
  modelValue: { type: String, default: '' },
  configs: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'configs-updated'])
const showPicker = ref(false)
const showConfig = ref(false)
const editingConfig = ref(null)
const localConfigs = ref([])
const modelTypes = IMAGE_MODEL_TYPES
const templateHelpText = '支持 {{prompt}}、{{negative_prompt}}、{{width}}、{{height}}、{{reference_image}}、{{reference_images_json}}。'
const connectionState = reactive({ testing: false, kind: 'idle', message: '' })
const selectedConfig = computed(() => localConfigs.value.find((item) => item.id === props.modelValue) || null)

watch(() => props.configs, (configs) => {
  localConfigs.value = Array.isArray(configs) && configs.length
    ? configs.map((config) => ({ ...config }))
    : listImageProviderConfigs()
}, { immediate: true, deep: true })

function openPicker() {
  refreshConfigs()
  showPicker.value = true
}

function refreshConfigs() {
  localConfigs.value = listImageProviderConfigs()
  emit('configs-updated', localConfigs.value)
}

function selectConfig(config) {
  emit('update:modelValue', config.id)
  showPicker.value = false
}

function addConfig() {
  editingConfig.value = createImageModelConfigDraft()
  resetConnectionState()
  showPicker.value = false
  showConfig.value = true
}

function editConfig(config) {
  editingConfig.value = { ...config }
  resetConnectionState()
  showPicker.value = false
  showConfig.value = true
}

function closeConfig() {
  showConfig.value = false
  editingConfig.value = null
  resetConnectionState()
}

function saveConfig() {
  if (!editingConfig.value?.name.trim()) return
  const saved = saveImageProviderConfig(editingConfig.value)
  refreshConfigs()
  emit('update:modelValue', saved.id)
  closeConfig()
}

async function testConnection() {
  if (!editingConfig.value?.baseUrl && !['openai_dalle', 'stability'].includes(editingConfig.value?.type)) {
    connectionState.kind = 'error'
    connectionState.message = '请先填写 API 地址。'
    return
  }
  connectionState.testing = true
  connectionState.kind = 'idle'
  connectionState.message = ''
  const result = await testImageProviderConnection(editingConfig.value)
  connectionState.testing = false
  if (result.ok) {
    connectionState.kind = 'success'
    connectionState.message = `连接成功${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
    return
  }
  connectionState.kind = 'error'
  connectionState.message = `连接失败${result.status ? ` · ${result.status}` : ''} · ${result.error || result.statusText || '请检查配置'}`
}

function removeConfig() {
  const id = editingConfig.value?.id
  if (!id) return
  const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm('确定删除这个图片模型配置？')
    : false
  if (!confirmed) return
  const configs = deleteImageProviderConfig(id)
  localConfigs.value = configs
  emit('configs-updated', configs)
  if (props.modelValue === id) emit('update:modelValue', configs[0]?.id || '')
  closeConfig()
}

function typeLabel(type) {
  return modelTypes.find((item) => item.value === type)?.label || type
}

function resetConnectionState() {
  connectionState.testing = false
  connectionState.kind = 'idle'
  connectionState.message = ''
}
</script>

<template>
  <div class="image-model-picker">
    <button class="image-model-picker__trigger" type="button" @click="openPicker">
      <span class="image-model-picker__trigger-copy">
        <span class="image-model-picker__eyebrow">图片模型</span>
        <strong>{{ selectedConfig?.name || '选择或配置模型' }}</strong>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="showPicker" class="image-model-overlay" @click.self="showPicker = false">
        <section class="image-model-dialog" role="dialog" aria-modal="true" aria-label="选择图片模型">
          <header class="image-model-dialog__header">
            <div>
              <strong>选择图片模型</strong>
              <span>{{ localConfigs.length }} 个配置</span>
            </div>
            <button type="button" class="image-model-icon-btn" title="关闭" aria-label="关闭" @click="showPicker = false">×</button>
          </header>

          <div v-if="localConfigs.length" class="image-model-list">
            <div
              v-for="config in localConfigs"
              :key="config.id"
              class="image-model-option"
              :class="{ active: config.id === modelValue }"
              role="button"
              tabindex="0"
              @click="selectConfig(config)"
              @keydown.enter.prevent="selectConfig(config)"
              @keydown.space.prevent="selectConfig(config)"
            >
              <span class="image-model-option__mark" aria-hidden="true"></span>
              <span class="image-model-option__copy">
                <strong>{{ config.name }}</strong>
                <span>{{ typeLabel(config.type) }}<template v-if="config.defaultModel"> · {{ config.defaultModel }}</template></span>
              </span>
              <button type="button" class="image-model-option__edit" title="编辑模型配置" aria-label="编辑模型配置" @click.stop="editConfig(config)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
                </svg>
              </button>
            </div>
          </div>
          <p v-else class="image-model-empty">还没有图片模型配置。</p>

          <footer class="image-model-dialog__footer">
            <button type="button" class="image-model-add" @click="addConfig">添加模型配置</button>
          </footer>
        </section>
      </div>

      <div v-if="showConfig && editingConfig" class="image-model-overlay" @click.self="closeConfig">
        <section class="image-model-dialog image-model-dialog--config" role="dialog" aria-modal="true" aria-label="图片模型配置">
          <header class="image-model-dialog__header">
            <div>
              <strong>{{ editingConfig.id ? '编辑模型配置' : '添加模型配置' }}</strong>
              <span>配置会供插画与漫画共用</span>
            </div>
            <button type="button" class="image-model-icon-btn" title="关闭" aria-label="关闭" @click="closeConfig">×</button>
          </header>

          <div class="image-model-form">
            <label><span>名称</span><input v-model="editingConfig.name" placeholder="例如：本地 SDXL" /></label>
            <label>
              <span>类型</span>
              <select v-model="editingConfig.type">
                <option v-for="item in modelTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label><span>API 地址</span><input v-model="editingConfig.baseUrl" placeholder="http://127.0.0.1:7860" /></label>
            <label><span>API Key</span><input v-model="editingConfig.apiKey" type="password" placeholder="可选" /></label>
            <label><span>模型 ID</span><input v-model="editingConfig.defaultModel" placeholder="例如：gpt-image-1 或 SDXL checkpoint" /></label>
            <label><span>响应字段路径</span><input v-model="editingConfig.responsePath" placeholder="通用 HTTP 可选，例如 data.0.url" /></label>
            <label v-if="editingConfig.type === 'http'">
              <span>请求体模板</span>
              <textarea v-model="editingConfig.requestTemplate" rows="5" placeholder='{"prompt":"{{prompt}}","reference":"{{reference_image}}"}'></textarea>
              <small v-text="templateHelpText"></small>
            </label>
            <p v-if="connectionState.message" class="image-model-connection" :class="`is-${connectionState.kind}`" role="status">
              {{ connectionState.message }}
            </p>
          </div>

          <footer class="image-model-dialog__footer image-model-dialog__footer--config">
            <button v-if="editingConfig.id" type="button" class="image-model-delete" @click="removeConfig">删除</button>
            <button type="button" :disabled="connectionState.testing" @click="testConnection">
              {{ connectionState.testing ? '测试中...' : '测试连通性' }}
            </button>
            <button type="button" class="image-model-add" :disabled="!editingConfig.name.trim()" @click="saveConfig">保存</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.image-model-picker { width: 100%; }

.image-model-picker__trigger {
  width: 100%;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 62%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
  color: var(--archive-ink, var(--text-primary));
  cursor: pointer;
  text-align: left;
}

.image-model-picker__trigger:hover { border-color: var(--archive-olive, var(--accent)); }
.image-model-picker__trigger-copy { display: grid; gap: 2px; min-width: 0; }
.image-model-picker__trigger-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.image-model-picker__eyebrow { color: var(--archive-ink-soft, var(--text-muted)); font-size: 10px; }

.image-model-overlay {
  position: fixed;
  inset: 0;
  z-index: 420;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(12 16 24 / 0.58);
  backdrop-filter: blur(4px);
}

.image-model-dialog {
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 52%, var(--border));
  border-radius: 6px;
  background: var(--archive-paper-soft, var(--bg-secondary));
  color: var(--archive-ink, var(--text-primary));
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.28);
}

.image-model-dialog--config { width: min(560px, 100%); }
.image-model-dialog__header, .image-model-dialog__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent); }
.image-model-dialog__header > div { display: grid; gap: 3px; }
.image-model-dialog__header strong { font-size: 14px; }
.image-model-dialog__header span { color: var(--archive-ink-soft, var(--text-muted)); font-size: 11px; }
.image-model-dialog__footer { justify-content: flex-end; border-top: 1px solid var(--border); border-bottom: 0; }
.image-model-dialog__footer--config { flex-wrap: wrap; }
.image-model-icon-btn { width: 28px; height: 28px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 20px; }

.image-model-list { overflow-y: auto; padding: 8px; }
.image-model-option { width: 100%; display: grid; grid-template-columns: 10px minmax(0, 1fr) 30px; align-items: center; gap: 10px; min-height: 54px; padding: 7px 6px; border: 0; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 36%, transparent); background: transparent; color: var(--archive-ink, var(--text-primary)); cursor: pointer; text-align: left; }
.image-model-option:hover { background: color-mix(in srgb, var(--archive-olive) 6%, transparent); }
.image-model-option__mark { width: 7px; height: 7px; border: 1px solid var(--text-muted); border-radius: 50%; }
.image-model-option.active .image-model-option__mark { border-color: var(--archive-olive, var(--accent)); background: var(--archive-olive, var(--accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--archive-olive) 14%, transparent); }
.image-model-option__copy { display: grid; gap: 3px; min-width: 0; }
.image-model-option__copy strong, .image-model-option__copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-model-option__copy strong { font-size: 12px; }
.image-model-option__copy span { color: var(--text-muted); font-size: 10px; }
.image-model-option__edit { width: 28px; height: 28px; display: grid; place-items: center; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.image-model-empty { margin: 0; padding: 32px 16px; color: var(--text-muted); text-align: center; font-size: 12px; }

.image-model-form { display: grid; gap: 11px; overflow-y: auto; padding: 14px 16px; }
.image-model-form label { display: grid; gap: 5px; }
.image-model-form label > span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; }
.image-model-form input, .image-model-form select, .image-model-form textarea { width: 100%; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--archive-gold) 54%, var(--border)); border-radius: 4px; background: var(--archive-paper-soft, var(--bg-primary)); color: var(--archive-ink, var(--text-primary)); font: inherit; font-size: 12px; }
.image-model-form textarea { resize: vertical; }
.image-model-form small { color: var(--text-muted); font-size: 10px; line-height: 1.5; }
.image-model-dialog__footer button { min-height: 30px; padding: 5px 10px; border: 1px dashed color-mix(in srgb, var(--archive-gold) 58%, var(--border)); border-radius: 4px; background: var(--archive-paper-soft, var(--bg-primary)); color: var(--archive-ink, var(--text-primary)); cursor: pointer; }
.image-model-dialog__footer button:disabled { opacity: 0.5; cursor: not-allowed; }
.image-model-dialog__footer .image-model-add { border-style: solid; border-color: var(--archive-olive, var(--accent)); background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong)); color: var(--archive-paper-soft, var(--accent-text)); }
.image-model-dialog__footer .image-model-delete { margin-right: auto; border-color: color-mix(in srgb, var(--danger) 48%, var(--border)); color: var(--danger); }
.image-model-connection { margin: 0; font-size: 11px; line-height: 1.5; }
.image-model-connection.is-success { color: var(--success, #34805a); }
.image-model-connection.is-error { color: var(--danger); }
</style>
