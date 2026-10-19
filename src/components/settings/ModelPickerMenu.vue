<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { useSettingsPopup } from '../../composables/useSettingsPopup.js'
import { useTransientLayer } from '../../composables/useTransientLayer.js'
import { clampWorkspaceMenuPosition, workspacePopupViewport } from '../../services/workspace/workspacePopupPosition.js'
import { tr } from '../../i18n/index.js'
const props = defineProps({ kind: { type: String, default: 'text' }, modelValue: { type: String, default: '' }, configs: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue', 'refresh'])
const trigger = ref(null), menu = ref(null), open = ref(false), position = ref({ left: '0px', top: '0px' })
const settings = useSettingsPopup()
const menuId = `model-menu-${useId()}`
const selected = computed(() => props.configs.find(item => item.id === props.modelValue) || props.configs[0])
const name = computed(() => selected.value?.model || selected.value?.defaultModel || selected.value?.name || tr('选择模型'))
const label = computed(() => tr({ text: '选择文本模型', image: '选择图片模型', video: '选择视频模型' }[props.kind]))
async function place() {
  await nextTick()
  if (!open.value || !trigger.value || !menu.value) return
  const rect = trigger.value.getBoundingClientRect(), { scale } = workspacePopupViewport()
  const result = clampWorkspaceMenuPosition(menu.value, { show: true, anchorX: rect.left, anchorY: rect.top - menu.value.offsetHeight * scale - 6 })
  if (result) position.value = { left: `${result.x}px`, top: `${result.y}px`, maxHeight: `${result.maxHeight}px` }
}
function toggle() { if (props.disabled) return; emit('refresh'); open.value = !open.value; if (open.value) void place() }
function choose(config) { emit('update:modelValue', config.id); open.value = false }
function manage() { open.value = false; settings.open('models', props.kind) }
function outside(event) { if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) open.value = false }
useTransientLayer({ id: menuId, isOpen: open, onClose: () => { open.value = false }, initialFocus: () => menu.value?.querySelector('[aria-selected=true]') || menu.value?.querySelector('button'), returnFocus: () => trigger.value })
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', place) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place) })
</script>
<template>
  <button ref="trigger" type="button" class="model-picker-trigger" :data-testid="`${kind}-model-config-trigger`" :disabled="disabled" :aria-label="label" :aria-expanded="open" :title="selected?.name" @click="toggle"><span>{{ name }}</span><WorkbenchIcon name="chevron-down" :size="12" /></button>
  <Teleport to="body"><div v-if="open" ref="menu" class="model-picker-menu" :style="position" :aria-label="label">
    <div role="listbox" :aria-label="label"><button v-for="config in configs" :key="config.id" type="button" role="option" :aria-selected="modelValue === config.id" @click="choose(config)"><span><strong>{{ config.name }}</strong><small>{{ config.model || config.defaultModel || tr('服务器默认') }}</small></span><WorkbenchIcon v-if="modelValue === config.id" name="check" :size="15" /></button></div>
    <button type="button" class="model-picker-manage" @click="manage"><WorkbenchIcon name="settings" :size="15" />{{ tr('管理模型') }}</button>
  </div></Teleport>
</template>
<style scoped>
.model-picker-trigger { display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:200px;padding:6px 8px;border:0;border-radius:var(--radius-control);background:transparent;color:var(--text-secondary);font:12px/1.5 var(--font-sans);cursor:pointer; }
.model-picker-trigger span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.model-picker-trigger:hover,.model-picker-trigger[aria-expanded=true] { background:var(--nav-hover);color:var(--text-primary); }
.model-picker-menu { position:fixed;z-index:var(--z-modal,810);box-sizing:border-box;width:280px;max-width:calc(100vw - 16px);padding:5px;overflow:auto;border:1px solid var(--hairline-soft);border-radius:var(--radius-control);background:var(--surface-workbench-overlay,var(--surface-workbench));box-shadow:var(--shadow-workbench-float);font:13px/1.5 var(--font-sans);color:var(--text-primary); }
.model-picker-menu button { display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;text-align:start;border:0;border-radius:var(--radius-control);background:transparent;color:inherit;font:inherit;cursor:pointer; }
.model-picker-menu button:hover,.model-picker-menu button:focus-visible { background:var(--nav-hover); }
.model-picker-menu button[aria-selected=true] { background:var(--nav-primary-selected); }
.model-picker-menu strong { display:block;font-weight:500; }
.model-picker-menu small { display:block;color:var(--text-secondary);font-size:11px;overflow-wrap:anywhere; }
.model-picker-menu .model-picker-manage { justify-content:flex-start;margin-top:4px;border-top:1px solid var(--hairline-soft);border-radius:0; }
.model-picker-trigger:focus-visible,.model-picker-menu button:focus-visible { outline:2px solid var(--accent);outline-offset:-2px; }
@media(pointer:coarse) { .model-picker-trigger,.model-picker-menu button { min-height:44px; } }
</style>
