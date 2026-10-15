<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { tr } from '../../i18n/index.js'
import { worldbookEntryEditFingerprint } from '../../stores/worldStore.js'
import { SETTING_TYPES, settingAliases } from '../../services/worldbook/settingWorkspaceModel.js'
const props = defineProps({ entry: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['change', 'save', 'copy', 'delete'])
const fields = reactive({ type: '', aliases: '', mode: 'selective' })
const aliasesInput = ref(null)
function resizeAliases() {
  const node = aliasesInput.value
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${Math.max(32, node.scrollHeight, fields.aliases.split('\n').length * 24)}px`
}
const baseline = ref('')
const initial = ref('')
const dirty = computed(() => JSON.stringify(fields) !== initial.value)
const knownType = computed(() => SETTING_TYPES.some(item => item.value === fields.type))
function reset(entry = props.entry) {
  fields.type = entry.kind || entry.type || 'general'
  fields.aliases = (entry.keys || []).filter(key => key !== entry.name).join('\n')
  fields.mode = entry.injection?.mode || 'selective'
  baseline.value = worldbookEntryEditFingerprint(entry)
  initial.value = JSON.stringify(fields)
  emit('change', null)
  nextTick(resizeAliases)
}
function changed() {
  emit('change', dirty.value ? { entryId: props.entry.id, baseline: baseline.value, updates: {
    type: fields.type, ...(props.entry.kind ? { kind: fields.type } : {}),
    keys: [...new Set([props.entry.name, ...settingAliases(fields.aliases)].filter(Boolean))],
    injection: { ...props.entry.injection, mode: fields.mode }
  } } : null)
}
watch(() => props.entry, (entry, previous) => { if (entry.id !== previous?.id || !dirty.value) reset(entry) }, { immediate: true })
defineExpose({ reset, hasPending: () => dirty.value })
</script>
<template>
  <form class="setting-management" data-test="setting-management" @submit.prevent="emit('save')">
    <h3>{{ entry.name }}</h3>
    <label>{{ tr('类型') }}<select :aria-label="tr('类型')" v-model="fields.type" :disabled="busy" @change="changed"><option v-if="!knownType" :value="fields.type">{{ fields.type }}</option><option v-for="item in SETTING_TYPES" :key="item.value" :value="item.value">{{ tr(item.label) }}</option></select></label>
    <label>{{ tr('别名') }}<textarea ref="aliasesInput" v-model="fields.aliases" :disabled="busy" rows="1" :placeholder="tr('每行一个，也可用逗号分隔')" @input="changed(); resizeAliases()" @focus="resizeAliases"></textarea></label>
    <label>{{ tr('AI 参考方式') }}<select :aria-label="tr('AI 参考方式')" v-model="fields.mode" :disabled="busy" @change="changed"><option value="selective">{{ tr('匹配相关内容时参考') }}</option><option value="constant">{{ tr('每次都参考') }}</option><option v-if="!['selective', 'constant'].includes(fields.mode)" :value="fields.mode">{{ fields.mode }}</option></select></label>
    <div v-if="dirty" class="setting-management-actions"><button type="button" class="control-secondary" :disabled="busy" @click="reset()">{{ tr('取消修改') }}</button><button type="submit" class="control-primary" :disabled="busy">{{ tr('保存') }}</button></div>
    <div class="setting-management-operations"><button type="button" :disabled="busy || dirty" @click="emit('copy')"><WorkbenchIcon name="copy" :size="15" />{{ tr('复制设定') }}</button><button type="button" class="setting-management-delete" :disabled="busy || dirty" @click="emit('delete')"><WorkbenchIcon name="trash" :size="15" />{{ tr('删除设定…') }}</button></div>
  </form>
</template>
<style scoped>
.setting-management { padding: 20px; font: 13px/1.5 var(--font-sans); }
h3 { margin: 0 0 20px; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
label { display: grid; gap: 8px; margin: 0 0 20px; color: var(--text-secondary); }
select, textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
textarea { resize: vertical; }
.setting-management-actions { display: flex; justify-content: flex-end; gap: 8px; }
.setting-management-actions button { padding: 7px 12px; }
.setting-management-operations { display: grid; gap: 4px; margin-top: 24px; border-top: 1px solid var(--hairline-soft); padding-top: 16px; }
.setting-management-operations button { min-height: 38px; padding: 8px 0; border: 0; background: transparent; color: var(--text-secondary); font: inherit; text-align: start; cursor: pointer; }
.setting-management-operations button:hover { color: var(--accent); }
.setting-management-operations .setting-management-delete { color: var(--text-danger, var(--text-secondary)); }
:where(button, select, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
@media (pointer: coarse) { button, select { min-height: 44px; } }

.setting-management label { gap: 6px; margin-bottom: 24px; font-size: 12px; }
.setting-management :is(select,textarea) { border-color: transparent; border-radius: 8px; font-size: 14px; line-height: 1.7; }
.setting-management :is(select,textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.setting-management .setting-management-operations button { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-control); }
.setting-management .setting-management-operations button:hover { background: var(--nav-hover); color: var(--text-primary); }
.setting-management-actions button { border: 0; border-radius: var(--radius-control); min-height: 34px; font: inherit; cursor: pointer; }
.setting-management-actions .control-secondary { background: var(--surface-workbench-input); color: var(--text-secondary); }
.setting-management-actions .control-primary { background: var(--control-accent-bg); color: var(--control-accent-text); }

.setting-management { font-family: var(--font-interface); }
.setting-management label { grid-template-columns: 72px minmax(0, 1fr); align-items: start; gap: 12px; min-height: 40px; font-size: 13px; line-height: 2.4; }
.setting-management :is(select,textarea), .setting-management :is(select,textarea):is(:hover,:focus,:focus-visible) { border: 0 !important; border-bottom: 1px solid transparent !important; border-radius: 0 !important; padding: 5px 0; background: transparent !important; box-shadow: none !important; outline: none !important; font: 14px/1.75 var(--font-interface); }
.setting-management :is(select,textarea):hover { border-bottom-color: var(--hairline-soft) !important; }
.setting-management :is(select,textarea):focus-visible { border-bottom-color: var(--accent) !important; }
.setting-management textarea { min-height: 32px; resize: none; overflow: hidden; }
</style>
