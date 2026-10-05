<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { videoJobService } from '../../services/media/videoJobService'
import {
  BUILTIN_VIDEO_CONFIG_ID,
  createVideoProviderConfigDraft,
  deleteVideoProviderConfig,
  listVideoProviderConfigs,
  MINIMAX_VIDEO_MODELS,
  saveVideoProviderConfig,
  toVideoProviderConfig,
  VIDEO_PROVIDER_TYPES
} from '../../services/media/videoProviderConfigStore'
import { useTransientLayer } from '../../composables/useTransientLayer'

const props = defineProps({
  modelValue: { type: String, default: '' },
  configs: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'configs-updated'])

const showPicker = ref(false)
const showConfig = ref(false)
const triggerRef = ref(null)
const editingConfig = ref(null)
const localConfigs = ref([])
const connectionState = reactive({ testing: false, kind: 'idle', message: '' })
let connectionController = null
let connectionRevision = 0
onBeforeUnmount(() => resetConnectionState())
const selectedConfig = computed(() => localConfigs.value.find((item) => item.id === props.modelValue) || null)
const layerOpen = computed(() => showPicker.value || showConfig.value)
const editingIsBuiltin = computed(() => editingConfig.value?.builtin === true || editingConfig.value?.id === BUILTIN_VIDEO_CONFIG_ID)
const editingIsMinimax = computed(() => editingConfig.value?.providerId === 'minimax-video')
const editingIsHailuo = computed(() => ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'].includes(editingConfig.value?.model))
const editingResolutions = computed(() => editingIsHailuo.value ? ['768P', '1080P'] : ['720P', '1080P'])
const canSaveConfig = computed(() => Boolean(
  editingConfig.value?.name.trim()
  && (!editingIsMinimax.value || editingConfig.value?.apiKey.trim())
  && (editingIsMinimax.value || (editingConfig.value?.submitUrl.trim() && editingConfig.value?.statusUrl.trim()))
))

watch(() => props.configs, (configs) => {
  localConfigs.value = Array.isArray(configs) && configs.length
    ? configs.map((config) => ({ ...config }))
    : listVideoProviderConfigs()
}, { immediate: true, deep: true })

function openPicker() {
  if (props.disabled) return
  refreshConfigs()
  showPicker.value = true
}

function refreshConfigs() {
  localConfigs.value = listVideoProviderConfigs()
  emit('configs-updated', localConfigs.value)
}

function selectConfig(config) {
  emit('update:modelValue', config.id)
  showPicker.value = false
}

function useBuiltin() {
  emit('update:modelValue', BUILTIN_VIDEO_CONFIG_ID)
  closeConfig()
}

function addConfig() {
  editingConfig.value = createVideoProviderConfigDraft()
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

function changeProvider(event) {
  const providerId = String(event.target?.value || '')
  const id = editingConfig.value?.id || ''
  const name = editingConfig.value?.name || ''
  editingConfig.value = { ...createVideoProviderConfigDraft(providerId), id, name }
  resetConnectionState()
}

function saveConfig() {
  if (!canSaveConfig.value || connectionState.testing) return
  try {
    const saved = saveVideoProviderConfig(editingConfig.value)
    refreshConfigs()
    emit('update:modelValue', saved.id)
    closeConfig()
  } catch (error) {
    connectionState.kind = 'error'
    connectionState.message = error?.message || '配置未能保存，请检查浏览器存储后重试。'
  }
}

async function testConnection() {
  if (connectionState.testing || !editingConfig.value) return
  if (editingIsMinimax.value && !editingConfig.value?.apiKey.trim()) {
    connectionState.kind = 'error'
    connectionState.message = '请先填写 API Key。'
    return
  }
  const revision = ++connectionRevision
  connectionController = new AbortController()
  connectionState.testing = true
  connectionState.kind = 'idle'
  connectionState.message = ''
  try {
    const result = await videoJobService.testProvider(
      editingConfig.value.providerId,
      toVideoProviderConfig(editingConfig.value),
      { signal: connectionController.signal }
    )
    if (revision !== connectionRevision) return
    connectionState.kind = result?.ok ? 'success' : 'error'
    connectionState.message = result?.ok
      ? `连接成功${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
      : (result?.message || '渠道不可用')
  } catch (error) {
    if (revision !== connectionRevision) return
    connectionState.kind = 'error'
    connectionState.message = error?.message || '连接测试失败'
  } finally {
    if (revision === connectionRevision) connectionState.testing = false
  }
}

function normalizeEditingResolution() {
  if (!editingConfig.value || !editingIsMinimax.value) return
  if (!editingResolutions.value.includes(editingConfig.value.resolution)) {
    editingConfig.value.resolution = editingResolutions.value[0]
  }
  if (!editingIsHailuo.value) editingConfig.value.fastPretreatment = false
}

function removeConfig() {
  const id = editingConfig.value?.id
  if (!id) return
  const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm('确定删除这个视频模型配置？')
    : false
  if (!confirmed) return
  try {
    const configs = deleteVideoProviderConfig(id)
    localConfigs.value = configs
    emit('configs-updated', configs)
    if (props.modelValue === id) emit('update:modelValue', configs[0]?.id || '')
    closeConfig()
  } catch (error) {
    connectionState.kind = 'error'
    connectionState.message = error?.message || '配置未能删除，请重试。'
  }
}

function closeConfig() {
  showConfig.value = false
  editingConfig.value = null
  resetConnectionState()
}

function resetConnectionState() {
  connectionRevision += 1
  connectionController?.abort()
  connectionController = null
  connectionState.testing = false
  connectionState.kind = 'idle'
  connectionState.message = ''
}

function providerLabel(providerId) {
  return VIDEO_PROVIDER_TYPES.find((item) => item.value === providerId)?.label || providerId
}

function closeLayer() {
  if (showConfig.value) {
    closeConfig()
    return
  }
  showPicker.value = false
}

useTransientLayer({
  id: 'video-model-picker',
  isOpen: layerOpen,
  onClose: closeLayer,
  initialFocus: () => document.querySelector('.video-model-overlay .is-icon'),
  exclusive: false,
  returnFocus: () => triggerRef.value
})
</script>

<template>
  <div class="video-model-picker">
    <button
      ref="triggerRef"
      type="button"
      class="video-model-picker__trigger"
      data-testid="video-model-config-trigger"
      :disabled="disabled"
      aria-haspopup="dialog"
      :aria-expanded="layerOpen"
      @click="openPicker"
    >
      <span>
        <small>视频模型</small>
        <strong>{{ selectedConfig?.name || '选择或配置模型' }}</strong>
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>

    <Teleport to="body">
      <div v-if="showPicker" class="video-model-overlay" @click.self="showPicker = false">
        <section class="video-model-dialog" role="dialog" aria-modal="true" aria-label="选择视频模型">
          <header>
            <div><strong>选择视频模型</strong><small>{{ localConfigs.length }} 个配置</small></div>
            <button type="button" class="is-icon" title="关闭" aria-label="关闭" @click="showPicker = false">×</button>
          </header>
          <div v-if="localConfigs.length" class="video-model-list">
            <div
              v-for="config in localConfigs"
              :key="config.id"
              class="video-model-option"
              :class="{ active: config.id === modelValue }"
            >
              <button type="button" class="video-model-option__choose" :aria-pressed="config.id === modelValue" @click="selectConfig(config)">
                <i aria-hidden="true"></i>
                <span>
                  <strong>{{ config.name }}</strong>
                  <small>{{ config.model }}</small>
                  <small v-if="config.serverKey" class="video-model-server-note">使用站点提供的渠道</small>
                </span>
              </button>
              <button v-if="!config.builtin" type="button" class="is-icon" title="编辑模型配置" aria-label="编辑模型配置" @click.stop="editConfig(config)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
              </button>
              <button v-else type="button" class="is-icon" title="查看内置 MiniMax" aria-label="查看内置 MiniMax" @click.stop="editConfig(config)">…</button>
            </div>
          </div>
          <p v-else class="video-model-empty">还没有视频模型配置。</p>
          <footer><button type="button" class="is-primary" @click="addConfig">添加模型配置</button></footer>
        </section>
      </div>

      <div v-if="showConfig && editingConfig" class="video-model-overlay" @click.self="closeConfig">
        <section class="video-model-dialog video-model-dialog--config" role="dialog" aria-modal="true" aria-label="视频模型配置">
          <header>
            <div><strong>{{ editingIsBuiltin ? '内置 MiniMax' : (editingConfig.id ? '编辑视频配置' : '添加视频配置') }}</strong><small>{{ providerLabel(editingConfig.providerId) }}</small></div>
            <button type="button" class="is-icon" title="关闭" aria-label="关闭" @click="closeConfig">×</button>
          </header>
          <!-- 内置: 只读详情 -->
          <div v-if="editingIsBuiltin" class="video-model-form video-model-form--readonly">
            <div class="video-model-static-row"><span>名称</span><strong>{{ editingConfig.name }}</strong></div>
            <div class="video-model-static-row"><span>渠道</span><strong>{{ providerLabel(editingConfig.providerId) }}</strong></div>
            <div class="video-model-static-row"><span>API 地址</span><strong>{{ editingConfig.baseUrl }}</strong></div>
            <div class="video-model-static-row"><span>模型</span><strong>{{ editingConfig.model }}</strong></div>
            <div class="video-model-static-row"><span>默认分辨率</span><strong>{{ editingConfig.resolution }}</strong></div>
            <div class="video-model-server-key">
              <span>API Key</span>
              <strong>使用站点提供的渠道</strong>
              <p>由站点提供视频渠道，无需填写个人密钥。可在生成面板检查是否可用。</p>
            </div>
          </div>
          <!-- 用户配置 / 新增: 可编辑表单 -->
          <div v-else class="video-model-form">
            <label><span>名称</span><input v-model="editingConfig.name" placeholder="例如：我的海螺视频" /></label>
            <label>
              <span>渠道</span>
              <select :value="editingConfig.providerId" @change="changeProvider">
                <option v-for="item in VIDEO_PROVIDER_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label v-if="editingConfig.providerId === 'minimax-video'">
              <span>模型</span>
              <select v-model="editingConfig.model" @change="normalizeEditingResolution">
                <option v-for="item in MINIMAX_VIDEO_MODELS" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label v-else><span>模型</span><input v-model="editingConfig.model" placeholder="视频模型名称" /></label>
            <label><span>API 地址</span><input v-model="editingConfig.baseUrl" placeholder="渠道默认地址或自定义地址" /></label>
            <label><span>API Key</span><input v-model="editingConfig.apiKey" type="password" autocomplete="off" /></label>
            <template v-if="editingConfig.providerId === 'minimax-video'">
              <label>
                <span>默认分辨率</span>
                <select v-model="editingConfig.resolution"><option v-for="item in editingResolutions" :key="item" :value="item">{{ item }}</option></select>
              </label>
              <div class="video-model-checks">
                <label><input v-model="editingConfig.promptOptimizer" type="checkbox" />提示词优化</label>
                <label v-if="editingIsHailuo"><input v-model="editingConfig.fastPretreatment" type="checkbox" />快速预处理</label>
                <label><input v-model="editingConfig.aigcWatermark" type="checkbox" />AIGC 水印</label>
              </div>
            </template>
            <template v-else>
              <label><span>提交地址</span><input v-model="editingConfig.submitUrl" /></label>
              <label><span>查询地址</span><input v-model="editingConfig.statusUrl" /></label>
              <label><span>提交模板</span><textarea v-model="editingConfig.submitBodyTemplate" rows="4"></textarea></label>
              <label><span>任务 ID 路径</span><input v-model="editingConfig.statusPath" /></label>
              <label><span>结果 URL 路径</span><input v-model="editingConfig.outputUrlPath" /></label>
            </template>
            <p v-if="connectionState.message" class="video-model-message" :class="`is-${connectionState.kind}`" role="status">{{ connectionState.message }}</p>
          </div>
          <footer>
            <template v-if="editingIsBuiltin">
              <button type="button" class="is-primary" @click="useBuiltin">使用此模型</button>
              <button type="button" @click="closeConfig">关闭</button>
            </template>
            <template v-else>
              <button v-if="editingConfig.id" type="button" class="is-danger" @click="removeConfig">删除</button>
              <button type="button" :disabled="connectionState.testing" @click="testConnection">{{ connectionState.testing ? '测试中...' : '测试连通性' }}</button>
              <button type="button" class="is-primary" :disabled="!canSaveConfig || connectionState.testing" @click="saveConfig">保存</button>
            </template>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.video-model-picker { width: 100%; }
.video-model-picker__trigger { width: 100%; min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-control, 10px); background: var(--surface-workbench-input, var(--bg-primary)); color: var(--text-primary); cursor: pointer; text-align: left; font-family: var(--font-interface, var(--font-sans)); }
.video-model-picker__trigger:hover { border-color: var(--border-strong); }
.video-model-picker__trigger:disabled { opacity: .5; cursor: not-allowed; }
.video-model-picker__trigger > span:first-child { display: grid; gap: 3px; min-width: 0; }
.video-model-picker__trigger small { color: var(--text-muted); font-size: 11px; }
.video-model-picker__trigger strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
.video-model-overlay { position: fixed; inset: 0; z-index: var(--z-modal-backdrop, 800); display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--text-primary) 28%, transparent); backdrop-filter: blur(6px); }
.video-model-dialog { width: min(460px, 100%); max-height: min(760px, calc(100dvh - 40px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-surface, 24px); background: var(--surface-workbench-overlay, var(--bg-secondary)); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); font: 13px/1.6 var(--font-interface, var(--font-sans)); }
.video-model-dialog--config { width: min(520px, 100%); }
.video-model-dialog header, .video-model-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--hairline-soft); }
.video-model-dialog header > div { display: grid; gap: 3px; min-width: 0; }
.video-model-dialog header strong { font-size: 16px; font-weight: 600; }
.video-model-dialog header small { color: var(--text-muted); font-size: 12px; }
.video-model-dialog footer { justify-content: flex-end; flex-wrap: wrap; border-top: 1px solid var(--hairline-soft); border-bottom: 0; }
.video-model-dialog button { min-height: 36px; padding: 8px 12px; border: 0; border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); cursor: pointer; font: inherit; }
.video-model-dialog button:disabled { opacity: .5; cursor: not-allowed; }
.video-model-picker__trigger:focus-visible, .video-model-dialog :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.video-model-dialog button.is-icon { width: 36px; height: 36px; flex-shrink: 0; padding: 0; background: transparent; font-size: 22px; }
.video-model-dialog button.is-icon:hover { background: var(--surface-workbench-input); }
.video-model-dialog button.is-primary { background: var(--accent); color: var(--accent-text); }
.video-model-dialog button.is-danger { margin-right: auto; color: var(--danger); background: transparent; }
.video-model-list { overflow-y: auto; padding: 8px; }
.video-model-option { display: flex; align-items: center; gap: 4px; min-height: 64px; padding: 4px 8px; border-radius: var(--radius-control); }
.video-model-option:hover, .video-model-option.active { background: var(--surface-workbench-input); }
.video-model-dialog .video-model-option__choose { display: flex; align-items: center; flex: 1; min-width: 0; gap: 12px; padding: 10px 6px; background: transparent; text-align: left; }
.video-model-option i { flex-shrink: 0; width: 9px; height: 9px; border: 1px solid var(--text-muted); border-radius: 50%; }
.video-model-option.active i { border-color: var(--accent); background: var(--accent); }
.video-model-option__choose > span { display: grid; gap: 3px; min-width: 0; }
.video-model-option strong, .video-model-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.video-model-option strong { font-size: 13px; font-weight: 500; }
.video-model-option small { color: var(--text-muted); font-size: 11px; }
.video-model-empty { margin: 0; padding: 32px 20px; color: var(--text-muted); text-align: center; }
.video-model-form { display: grid; gap: 16px; overflow-y: auto; overscroll-behavior: contain; padding: 20px; }
.video-model-form > label { display: grid; gap: 6px; }
.video-model-form label > span { color: var(--text-secondary); font-size: 12px; }
.video-model-form :is(input, select, textarea) { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
.video-model-form textarea { resize: vertical; min-height: 110px; }
.video-model-checks { display: flex; flex-wrap: wrap; gap: 12px; }
.video-model-checks label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.video-model-checks input { width: auto; accent-color: var(--accent); }
.video-model-static-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.video-model-static-row span, .video-model-server-key > span { color: var(--text-muted); font-size: 12px; }
.video-model-static-row strong { font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.video-model-server-key { display: grid; gap: 8px; padding-top: 16px; border-top: 1px solid var(--hairline-soft); }
.video-model-server-key strong { font-size: 13px; font-weight: 500; }
.video-model-server-key p { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.7; }
.video-model-message { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
.video-model-message.is-error { color: var(--danger); }
.video-model-message.is-success { color: var(--accent); }
@media (max-width: 640px) {
  .video-model-overlay { padding: 8px; align-items: end; }
  .video-model-dialog { max-height: calc(100dvh - 24px); }
  .video-model-dialog header, .video-model-dialog footer, .video-model-form { padding: 16px; }
  .video-model-dialog footer { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .video-model-dialog button { min-height: 44px; }
}
</style>
