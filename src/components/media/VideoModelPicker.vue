<script setup>
import { computed, reactive, ref, watch } from 'vue'
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
  if (!canSaveConfig.value) return
  const saved = saveVideoProviderConfig(editingConfig.value)
  refreshConfigs()
  emit('update:modelValue', saved.id)
  closeConfig()
}

async function testConnection() {
  if (editingIsMinimax.value && !editingConfig.value?.apiKey.trim()) {
    connectionState.kind = 'error'
    connectionState.message = '请先填写 API Key。'
    return
  }
  connectionState.testing = true
  connectionState.kind = 'idle'
  connectionState.message = ''
  try {
    const result = await videoJobService.testProvider(
      editingConfig.value.providerId,
      toVideoProviderConfig(editingConfig.value)
    )
    connectionState.kind = result?.ok ? 'success' : 'error'
    connectionState.message = result?.ok
      ? `连接成功${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
      : (result?.message || '渠道不可用')
  } catch (error) {
    connectionState.kind = 'error'
    connectionState.message = error?.message || '连接测试失败'
  } finally {
    connectionState.testing = false
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
  const configs = deleteVideoProviderConfig(id)
  localConfigs.value = configs
  emit('configs-updated', configs)
  if (props.modelValue === id) emit('update:modelValue', configs[0]?.id || '')
  closeConfig()
}

function closeConfig() {
  showConfig.value = false
  editingConfig.value = null
  resetConnectionState()
}

function resetConnectionState() {
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
              role="button"
              tabindex="0"
              @click="selectConfig(config)"
              @keydown.enter.prevent="selectConfig(config)"
              @keydown.space.prevent="selectConfig(config)"
            >
              <i aria-hidden="true"></i>
              <span>
                <strong>{{ config.name }}<em v-if="config.builtin" class="video-model-badge">内置</em></strong>
                <small>{{ providerLabel(config.providerId) }} · {{ config.model }}</small>
                <small v-if="config.serverKey" class="video-model-server-note">已由服务器配置</small>
              </span>
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
              <strong>已由服务器配置，无需填写</strong>
              <p>使用内置 MiniMax 时，请求由服务器携带密钥转发；若服务器尚未配置
                <code>MINIMAX_API_KEY</code>，生成时会有明确报错。</p>
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
              <button type="button" class="is-primary" :disabled="!canSaveConfig" @click="saveConfig">保存</button>
            </template>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.video-model-picker { width: 100%; }
.video-model-picker__trigger { width: 100%; min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px; border: 1px dashed color-mix(in srgb, var(--archive-gold) 62%, var(--border)); border-radius: 4px; background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent); color: var(--archive-ink, var(--text-primary)); cursor: pointer; text-align: left; }
.video-model-picker__trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.video-model-picker__trigger > span:first-child { display: grid; gap: 2px; min-width: 0; }
.video-model-picker__trigger small { color: var(--archive-ink-soft, var(--text-muted)); font-size: 10px; }
.video-model-picker__trigger strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.video-model-overlay { position: fixed; inset: 0; z-index: var(--z-modal-backdrop, 800); display: grid; place-items: center; padding: 20px; background: rgb(12 16 24 / 0.58); backdrop-filter: blur(4px); }
.video-model-dialog { width: min(460px, 100%); max-height: min(720px, calc(100vh - 40px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid color-mix(in srgb, var(--archive-gold) 52%, var(--border)); border-radius: 6px; background: var(--archive-paper-soft, var(--bg-secondary)); color: var(--archive-ink, var(--text-primary)); box-shadow: 0 24px 64px rgb(0 0 0 / 0.28); }
.video-model-dialog--config { width: min(560px, 100%); }
.video-model-dialog header, .video-model-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 46%, transparent); }
.video-model-dialog header > div { display: grid; gap: 3px; }
.video-model-dialog header strong { font-size: 14px; }
.video-model-dialog header small { color: var(--text-muted); font-size: 11px; }
.video-model-dialog footer { justify-content: flex-end; flex-wrap: wrap; border-top: 1px solid var(--border); border-bottom: 0; }
.video-model-dialog button { min-height: 30px; padding: 5px 10px; border: 1px dashed color-mix(in srgb, var(--archive-gold) 58%, var(--border)); border-radius: 4px; background: var(--archive-paper-soft, var(--bg-primary)); color: var(--archive-ink, var(--text-primary)); cursor: pointer; }
.video-model-dialog button:disabled { opacity: 0.5; cursor: not-allowed; }
.video-model-picker__trigger:focus-visible, .video-model-dialog button:focus-visible, .video-model-option:focus-visible, .video-model-form input:focus-visible, .video-model-form select:focus-visible, .video-model-form textarea:focus-visible { outline: 2px solid color-mix(in srgb, var(--archive-olive, var(--accent)) 66%, transparent); outline-offset: 2px; }
.video-model-dialog button.is-icon { width: 28px; height: 28px; min-height: 0; padding: 0; border: 0; background: transparent; font-size: 18px; }
.video-model-dialog button.is-primary { border-style: solid; border-color: var(--archive-olive, var(--accent)); background: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-olive-strong)); color: var(--archive-paper-soft, var(--accent-text)); }
.video-model-dialog button.is-danger { margin-right: auto; border-color: color-mix(in srgb, var(--danger) 48%, var(--border)); color: var(--danger); }
.video-model-list { overflow-y: auto; padding: 8px; }
.video-model-option { display: grid; grid-template-columns: 10px minmax(0, 1fr) 30px; align-items: center; gap: 10px; min-height: 54px; padding: 7px 6px; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 36%, transparent); cursor: pointer; }
.video-model-option:hover { background: color-mix(in srgb, var(--archive-olive) 6%, transparent); }
.video-model-option i { width: 7px; height: 7px; border: 1px solid var(--text-muted); border-radius: 50%; }
.video-model-option.active i { border-color: var(--archive-olive, var(--accent)); background: var(--archive-olive, var(--accent)); }
.video-model-option > span { display: grid; gap: 3px; min-width: 0; }
.video-model-option strong, .video-model-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.video-model-option strong { font-size: 12px; }
.video-model-option strong em { display: none; }
.video-model-option small { color: var(--text-muted); font-size: 10px; }
.video-model-badge { display: inline-block; margin-left: 6px; padding: 0 5px; border: 1px solid color-mix(in srgb, var(--archive-gold) 55%, var(--border)); border-radius: 3px; color: var(--archive-gold, var(--accent)); font-size: 9px; font-style: normal; vertical-align: 1px; }
.video-model-server-note { color: var(--archive-gold, var(--accent)); }
.video-model-empty { margin: 0; padding: 32px 16px; color: var(--text-muted); text-align: center; font-size: 12px; }
.video-model-form { display: grid; gap: 11px; overflow-y: auto; padding: 14px 16px; }
.video-model-form > label { display: grid; gap: 5px; }
.video-model-form label > span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; }
.video-model-form input, .video-model-form select, .video-model-form textarea { width: 100%; box-sizing: border-box; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--archive-gold) 54%, var(--border)); border-radius: 4px; background: var(--archive-paper-soft, var(--bg-primary)); color: var(--archive-ink, var(--text-primary)); font: inherit; font-size: 12px; }
.video-model-form textarea { resize: vertical; }
.video-model-form--readonly { gap: 0; }
.video-model-static-row { display: grid; gap: 4px; padding: 7px 0; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 30%, transparent); }
.video-model-static-row span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; }
.video-model-static-row strong { font-size: 12px; font-weight: 600; word-break: break-all; }
.video-model-server-key { display: grid; gap: 5px; margin-top: 11px; padding: 10px 12px; border: 1px dashed color-mix(in srgb, var(--archive-gold) 50%, var(--border)); border-radius: 4px; background: color-mix(in srgb, var(--archive-paper-soft) 96%, transparent); }
.video-model-server-key span { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; }
.video-model-server-key strong { font-size: 12px; color: var(--archive-olive, var(--accent)); }
.video-model-server-key p { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.55; }
.video-model-server-key code { padding: 0 4px; border-radius: 3px; background: color-mix(in srgb, var(--bg-tertiary) 80%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.video-model-checks { display: flex; flex-wrap: wrap; gap: 10px 16px; }
.video-model-checks label { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 11px; }
.video-model-checks input { width: auto; margin: 0; accent-color: var(--accent); }
.video-model-message { margin: 0; font-size: 11px; line-height: 1.5; }
.video-model-message.is-success { color: var(--success, #34805a); }
.video-model-message.is-error { color: var(--danger); }
</style>
