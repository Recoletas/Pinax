<script setup>
import { tr } from '../../i18n/index.js'
import { computed, reactive, ref, watch } from 'vue'
import {
  createImageModelConfigDraft,
  IMAGE_MODEL_TYPES,
  testImageProviderConnection
} from '../../services/media/imageProviderService'
import {
  BUILTIN_IMAGE_CONFIG_ID,
  deleteImageProviderConfig,
  listImageProviderConfigs,
  saveImageProviderConfig
} from '../../services/media/imageProviderConfigStore'
import { useTransientLayer } from '../../composables/useTransientLayer'

const props = defineProps({
  modelValue: { type: String, default: '' },
  configs: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'configs-updated'])
const showPicker = ref(false)
const showConfig = ref(false)
const triggerRef = ref(null)
const editingConfig = ref(null)
const localConfigs = ref([])
const modelTypes = IMAGE_MODEL_TYPES
const templateHelpText = computed(() => tr('支持以下模板变量：') + ' {{prompt}}, {{negative_prompt}}, {{width}}, {{height}}, {{reference_image}}, {{reference_images_json}}, {{mask_image}}, {{control_images_json}}')
const comfyTemplateHelpText = computed(() => tr('从 ComfyUI 导出 API 格式工作流，用以下变量替换节点输入：') + ' {{prompt}}, {{negative_prompt}}, {{width}}, {{height}}, {{seed}}')
const connectionState = reactive({ testing: false, kind: 'idle', message: '' })
const selectedConfig = computed(() => localConfigs.value.find((item) => item.id === props.modelValue) || null)
const layerOpen = computed(() => showPicker.value || showConfig.value)
const editingIsBuiltin = computed(() => editingConfig.value?.builtin === true || editingConfig.value?.id === BUILTIN_IMAGE_CONFIG_ID)

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

function useBuiltin() {
  emit('update:modelValue', BUILTIN_IMAGE_CONFIG_ID)
  closeConfig()
}

function addConfig() {
  editingConfig.value = createImageModelConfigDraft()
  resetConnectionState()
  showPicker.value = false
  showConfig.value = true
}

function changeModelType(event) {
  const nextType = String(event.target?.value || '')
  const current = editingConfig.value
  if (!current || current.type === nextType) return
  const previousDefaults = createImageModelConfigDraft(current.type)
  const nextDefaults = createImageModelConfigDraft(nextType)
  editingConfig.value = {
    ...current,
    type: nextType,
    baseUrl: !current.baseUrl || current.baseUrl === previousDefaults.baseUrl
      ? nextDefaults.baseUrl
      : current.baseUrl,
    defaultModel: !current.defaultModel || current.defaultModel === previousDefaults.defaultModel
      ? nextDefaults.defaultModel
      : current.defaultModel
  }
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
    connectionState.message = `${tr('连接成功')}${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
    return
  }
  connectionState.kind = 'error'
  connectionState.message = `${tr('连接失败')}${result.status ? ` · ${result.status}` : ''} · ${result.error || result.statusText || tr('请检查配置')}`
}

function removeConfig() {
  const id = editingConfig.value?.id
  if (!id) return
  const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm(tr('确定删除这个图片模型配置？'))
    : false
  if (!confirmed) return
  const configs = deleteImageProviderConfig(id)
  localConfigs.value = configs
  emit('configs-updated', configs)
  if (props.modelValue === id) emit('update:modelValue', configs[0]?.id || '')
  closeConfig()
}

function typeLabel(type) {
  return tr(modelTypes.find((item) => item.value === type)?.label || type)
}

function resetConnectionState() {
  connectionState.testing = false
  connectionState.kind = 'idle'
  connectionState.message = ''
}

function closeLayer() {
  if (showConfig.value) {
    closeConfig()
    return
  }
  showPicker.value = false
}

useTransientLayer({
  id: 'image-model-picker',
  isOpen: layerOpen,
  onClose: closeLayer,
  initialFocus: () => document.querySelector('.image-model-overlay .image-model-icon-btn'),
  returnFocus: () => triggerRef.value
})
</script>

<template>
  <div class="image-model-picker">
    <button ref="triggerRef" class="image-model-picker__trigger" type="button" @click="openPicker">
      <span class="image-model-picker__trigger-copy">
        <span class="image-model-picker__eyebrow">{{ tr("图片模型") }}</span>
        <strong>{{ selectedConfig?.builtin ? tr(selectedConfig.name) : (selectedConfig?.name || tr("选择或配置模型")) }}</strong>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="showPicker" class="image-model-overlay" @click.self="showPicker = false">
        <section class="image-model-dialog" role="dialog" aria-modal="true" :aria-label="tr('选择图片模型')">
          <header class="image-model-dialog__header">
            <div>
              <strong>{{ tr("选择图片模型") }}</strong>
              <span>{{ tr('模型配置：{count}', { count: localConfigs.length }) }}</span>
            </div>
            <button type="button" class="image-model-icon-btn" :title="tr('关闭')" :aria-label="tr('关闭')" @click="showPicker = false">×</button>
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
                <strong>{{ config.builtin ? tr(config.name) : config.name }}<em v-if="config.builtin" class="image-model-badge">{{ tr("内置") }}</em></strong>
                <span>{{ typeLabel(config.type) }}<template v-if="config.defaultModel"> · {{ config.defaultModel }}</template></span>
                <small v-if="config.serverKey" class="image-model-server-note">{{ tr("已由服务器配置") }}</small>
              </span>
              <button v-if="!config.builtin" type="button" class="image-model-option__edit" :title="tr('编辑模型配置')" :aria-label="tr('编辑模型配置')" @click.stop="editConfig(config)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
                </svg>
              </button>
              <button v-else type="button" class="image-model-option__edit" :title="tr('查看内置 MiniMax')" :aria-label="tr('查看内置 MiniMax')" @click.stop="editConfig(config)">…</button>
            </div>
          </div>
          <p v-else class="image-model-empty">{{ tr("还没有图片模型配置。") }}</p>

          <footer class="image-model-dialog__footer">
            <button type="button" class="image-model-add" @click="addConfig">{{ tr("添加模型配置") }}</button>
          </footer>
        </section>
      </div>

      <div v-if="showConfig && editingConfig" class="image-model-overlay" @click.self="closeConfig">
        <section class="image-model-dialog image-model-dialog--config" role="dialog" aria-modal="true" :aria-label="tr('图片模型配置')">
          <header class="image-model-dialog__header">
            <div>
              <strong>{{ editingIsBuiltin ? tr("内置 MiniMax") : (editingConfig.id ? tr("编辑模型配置") : tr("添加模型配置")) }}</strong>
              <span>{{ tr("配置会供插画与漫画共用") }}</span>
            </div>
            <button type="button" class="image-model-icon-btn" :title="tr('关闭')" :aria-label="tr('关闭')" @click="closeConfig">×</button>
          </header>

          <!-- 内置: 只读详情 -->
          <div v-if="editingIsBuiltin" class="image-model-form image-model-form--readonly">
            <div class="image-model-static-row"><span>{{ tr("名称") }}</span><strong>{{ tr(editingConfig.name) }}</strong></div>
            <div class="image-model-static-row"><span>{{ tr("类型") }}</span><strong>{{ typeLabel(editingConfig.type) }}</strong></div>
            <div class="image-model-static-row"><span>{{ tr("API 地址") }}</span><strong>{{ editingConfig.baseUrl }}</strong></div>
            <div class="image-model-static-row"><span>{{ tr("模型 ID") }}</span><strong>{{ editingConfig.defaultModel }}</strong></div>
            <div class="image-model-server-key">
              <span>API Key</span>
              <strong>{{ tr("已由服务器配置，无需填写") }}</strong>
            </div>
          </div>

          <!-- 用户配置 / 新增: 可编辑表单 -->
          <div v-else class="image-model-form">
            <label><span>{{ tr("名称") }}</span><input v-model="editingConfig.name" :placeholder="tr('例如：本地 SDXL')" /></label>
            <label>
              <span>{{ tr("类型") }}</span>
              <select :value="editingConfig.type" @change="changeModelType">
                <option v-for="item in modelTypes" :key="item.value" :value="item.value">{{ tr(item.label) }}</option>
              </select>
            </label>
            <label><span>{{ tr("API 地址") }}</span><input v-model="editingConfig.baseUrl" placeholder="http://127.0.0.1:7860" /></label>
            <label><span>API Key</span><input v-model="editingConfig.apiKey" type="password" :placeholder="tr('可选')" /></label>
            <label v-if="editingConfig.type === 'minimax_image'">
              <span>{{ tr("模型 ID") }}</span>
              <select v-model="editingConfig.defaultModel">
                <option value="image-01">image-01</option>
                <option value="image-01-live">image-01-live</option>
              </select>
            </label>
            <label v-else-if="editingConfig.type !== 'comfyui'"><span>{{ tr("模型 ID") }}</span><input v-model="editingConfig.defaultModel" :placeholder="tr('例如：gpt-image-1 或 SDXL checkpoint')" /></label>
            <label v-if="editingConfig.type === 'http'"><span>{{ tr("响应字段路径") }}</span><input v-model="editingConfig.responsePath" :placeholder="tr('通用 HTTP 可选，例如 data.0.url')" /></label>
            <label v-if="editingConfig.type === 'http'">
              <span>{{ tr("请求体模板") }}</span>
              <textarea v-model="editingConfig.requestTemplate" rows="5" placeholder='{"prompt":"{{prompt}}","reference":"{{reference_image}}"}'></textarea>
              <small v-text="templateHelpText"></small>
            </label>
            <label v-else-if="editingConfig.type === 'comfyui'">
              <span>{{ tr('API 工作流模板') }}</span>
              <textarea v-model="editingConfig.requestTemplate" rows="7" :placeholder="tr('粘贴 ComfyUI 导出的 API 格式 JSON')"></textarea>
              <small v-text="comfyTemplateHelpText"></small>
              <small>{{ tr('支持标准文本编码、正向采样和 SaveImage / PreviewImage 输出；自定义节点需另行适配。') }}</small>
            </label>
            <p v-if="connectionState.message" class="image-model-connection" :class="`is-${connectionState.kind}`" role="status">
              {{ tr(connectionState.message) }}
              <span v-if="connectionState.kind === 'success'">{{ tr('连通性检查不代表图片生成已验证。') }}</span>
            </p>
          </div>

          <footer class="image-model-dialog__footer image-model-dialog__footer--config">
            <template v-if="editingIsBuiltin">
              <button type="button" class="image-model-add" @click="useBuiltin">{{ tr("使用此模型") }}</button>
              <button type="button" @click="closeConfig">{{ tr("关闭") }}</button>
            </template>
            <template v-else>
              <button v-if="editingConfig.id" type="button" class="image-model-delete" @click="removeConfig">{{ tr("删除") }}</button>
              <button type="button" :disabled="connectionState.testing" @click="testConnection">
                {{ connectionState.testing ? tr("测试中...") : tr("测试连通性") }}
              </button>
              <button type="button" class="image-model-add" :disabled="!editingConfig.name.trim()" @click="saveConfig">{{ tr("保存") }}</button>
            </template>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.image-model-picker { width: 100%; min-width: 0; font: 14px/1.5 var(--font-sans); }
.image-model-picker__trigger { width: 100%; min-width: 0; min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 12px; background: var(--surface-workbench-raised); color: var(--text-primary); cursor: pointer; text-align: start; }
.image-model-picker__trigger:hover { border-color: var(--border); }
.image-model-picker__trigger > svg { flex: none; color: var(--text-muted); }
.image-model-picker__trigger-copy { display: grid; gap: 3px; min-width: 0; }
.image-model-picker__trigger-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 14px/1.4 var(--font-sans); }
.image-model-picker__eyebrow { color: var(--text-secondary); font: 12px/1.4 var(--font-sans); }
.image-model-overlay { position: fixed; inset: 0; z-index: calc(var(--z-modal, 300) + 10); display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / .5); }
.image-model-dialog { width: min(460px, 100%); max-height: min(760px, calc(100dvh - 40px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-subtle, var(--border)); border-radius: 12px; background: var(--surface-workbench); color: var(--text-primary); font: 14px/1.5 var(--font-sans); box-shadow: var(--shadow-workbench); }
.image-model-dialog--config { width: min(560px, 100%); }
.image-model-dialog__header, .image-model-dialog__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
.image-model-dialog__header > div { display: grid; gap: 3px; min-width: 0; }
.image-model-dialog__header strong { font-size: 15px; font-weight: 550; }
.image-model-dialog__header span { color: var(--text-secondary); font-size: 13px; }
.image-model-dialog__footer { justify-content: flex-end; flex-wrap: wrap; border-top: 1px solid var(--border-subtle, var(--border)); border-bottom: 0; }
.image-model-icon-btn { flex: none; width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font: 24px/1 var(--font-sans); cursor: pointer; }
.image-model-icon-btn:hover, .image-model-option__edit:hover { background: var(--surface-hover); }
.image-model-list { overflow-y: auto; padding: 8px; }
.image-model-option { display: grid; grid-template-columns: 10px minmax(0, 1fr) 36px; align-items: center; gap: 12px; min-height: 70px; padding: 10px 12px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; text-align: start; }
.image-model-option:hover { background: var(--surface-hover); }
.image-model-option.active { background: var(--surface-workbench-muted); }
.image-model-option__mark { width: 7px; height: 7px; border: 1px solid var(--text-muted); border-radius: 50%; }
.image-model-option.active .image-model-option__mark { border-color: var(--accent); background: var(--accent); }
.image-model-option__copy { display: grid; gap: 3px; min-width: 0; }
.image-model-option__copy strong { font-size: 14px; font-weight: 500; }
.image-model-option__copy strong, .image-model-option__copy span, .image-model-option__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-model-option__copy span, .image-model-option__copy small { color: var(--text-secondary); font-size: 12px; }
.image-model-badge { display: none; }
.image-model-option__edit { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.image-model-empty { margin: 0; padding: 32px 18px; color: var(--text-muted); text-align: center; }
.image-model-form { display: grid; gap: 15px; overflow-y: auto; padding: 18px; }
.image-model-form--readonly { gap: 0; }
.image-model-static-row { display: grid; gap: 5px; padding: 12px 0; border-bottom: 1px solid var(--border-subtle, var(--border)); }
.image-model-static-row span { color: var(--text-secondary); font-size: 13px; }
.image-model-static-row strong { font-size: 14px; font-weight: 450; overflow-wrap: anywhere; }
.image-model-server-key { display: grid; gap: 6px; margin-top: 16px; padding: 14px; border-radius: 12px; background: var(--surface-workbench-muted); }
.image-model-server-key span { color: var(--text-secondary); font-size: 13px; }
.image-model-server-key strong { font-size: 14px; font-weight: 450; }
.image-model-form label { display: grid; gap: 7px; min-width: 0; }
.image-model-form label > span { color: var(--text-secondary); font-size: 13px; }
.image-model-form input, .image-model-form select, .image-model-form textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 40px; padding: 10px 12px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-primary); font: 14px/1.5 var(--font-sans); }
.image-model-form textarea { resize: vertical; font: 13px/1.6 var(--font-mono, monospace); }
.image-model-form small { color: var(--text-muted); font-size: 12px; overflow-wrap: anywhere; }
.image-model-dialog__footer > button { min-height: 40px; padding: 9px 14px; border: 1px solid var(--border-subtle, var(--border)); border-radius: 10px; background: var(--surface-workbench-raised); color: var(--text-primary); font: 14px/1.4 var(--font-sans); cursor: pointer; }
.image-model-dialog__footer > .image-model-add { border-color: transparent; background: var(--accent); color: var(--accent-text); }
.image-model-dialog__footer > .image-model-delete { color: var(--danger); }
.image-model-dialog button:disabled { opacity: .5; cursor: not-allowed; }
.image-model-connection { display: grid; gap: 6px; margin: 0; color: var(--text-secondary); font-size: 13px; overflow-wrap: anywhere; }
.image-model-connection.is-error { color: var(--danger); }
.image-model-connection span { color: var(--text-muted); font-size: 12px; }
.image-model-picker__trigger:focus-visible, .image-model-dialog :is(button, [role="button"], input, select, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px), (pointer: coarse) {
  .image-model-icon-btn, .image-model-option__edit { width: 44px; height: 44px; }
  .image-model-option { grid-template-columns: 8px minmax(0, 1fr) 44px; gap: 10px; padding: 10px; }
  .image-model-dialog__footer > button, .image-model-form input, .image-model-form select { min-height: 44px; }
}
@media (max-width: 520px) {
  .image-model-overlay { padding: 12px; }
  .image-model-dialog { max-height: calc(100dvh - 24px); }
  .image-model-dialog__header, .image-model-dialog__footer { padding: 12px 14px; gap: 8px; }
  .image-model-form { padding: 14px; }
}
</style>
