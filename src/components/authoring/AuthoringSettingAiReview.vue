<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { createSettingsPageDispatcher } from '../../services/agents/settings/settingsTaskDispatcher'
import { createSettingsMaintenanceWorkflow } from '../../services/agents/settings/settingsMaintenanceWorkflow'
import { createWorldbookMaintenanceServices } from '../../services/worldbook/worldbookMaintenance'

const props = defineProps({
  worldbook: { type: Object, required: true },
  entry: { type: Object, required: true },
  open: Boolean
})
const emit = defineEmits(['update:open', 'apply'])

const dispatcher = createSettingsPageDispatcher({
  adapters: { settingsMaintenance: createSettingsMaintenanceWorkflow(createWorldbookMaintenanceServices()) }
})
const brief = ref('')
const busy = ref(false)
const error = ref('')
const sourceRevision = ref('')
const candidate = reactive({ name: '', type: 'general', keysText: '', content: '', group: '', mode: 'selective' })
let controller = null

const hasCandidate = computed(() => Boolean(candidate.name.trim() && candidate.content.trim()))
const stale = computed(() => hasCandidate.value
  && String(props.worldbook?.updatedAt || '') !== sourceRevision.value)

function resetCandidate() {
  Object.assign(candidate, { name: '', type: 'general', keysText: '', content: '', group: '', mode: 'selective' })
  sourceRevision.value = ''
  error.value = ''
}

async function generate() {
  if (busy.value || !brief.value.trim()) return
  controller?.abort()
  controller = new AbortController()
  busy.value = true
  resetCandidate()
  try {
    const revision = String(props.worldbook?.updatedAt || '')
    const result = await dispatcher.dispatch('settings.maintenance.audit', {
      project: { id: props.worldbook.id, revision },
      target: { type: 'worldbook-entry', id: props.entry.id, revision },
      intent: {
        worldbook: props.worldbook,
        mode: 'refine',
        brief: brief.value,
        selectedEntryIds: [props.entry.id]
      }
    }, { signal: controller.signal })
    const audit = result?.suggestions?.[0]
    const proposal = (audit?.candidates || []).find((item) => item?.proposedEntry)?.proposedEntry
    if (result?.status !== 'completed' || !proposal) {
      error.value = result?.error?.message || 'AI 没有返回可用的设定候选。'
      return
    }
    Object.assign(candidate, {
      name: proposal.name || props.entry.name || '',
      type: proposal.type || props.entry.type || 'general',
      keysText: (proposal.keys || []).join('、'),
      content: proposal.content || '',
      group: proposal.group || props.entry.injection?.group || '',
      mode: proposal.mode || props.entry.injection?.mode || 'selective'
    })
    sourceRevision.value = String(audit.sourceRevision || revision)
  } catch (reason) {
    if (reason?.name !== 'AbortError') error.value = reason?.message || '设定补全失败。'
  } finally {
    busy.value = false
    controller = null
  }
}

function apply() {
  if (!hasCandidate.value || stale.value) return
  emit('apply', {
    name: candidate.name.trim(),
    type: candidate.type,
    keys: candidate.keysText.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean),
    content: candidate.content.trim(),
    injection: { mode: candidate.mode, group: candidate.group.trim() || null }
  })
  emit('update:open', false)
  resetCandidate()
}

function close() {
  controller?.abort()
  emit('update:open', false)
}

watch(() => props.entry?.id, () => {
  controller?.abort()
  brief.value = ''
  resetCandidate()
  emit('update:open', false)
})
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section v-if="open" class="setting-ai-review" aria-label="AI 补全设定">
    <header><strong>AI 补全</strong><button type="button" aria-label="关闭 AI 补全" @click="close">×</button></header>
    <textarea v-if="!hasCandidate" v-model="brief" rows="3" placeholder="说明要补充或调整什么" :disabled="busy"></textarea>
    <template v-else>
      <input v-model="candidate.name" aria-label="候选名称" />
      <textarea v-model="candidate.content" rows="8" aria-label="候选正文"></textarea>
      <input v-model="candidate.keysText" aria-label="候选触发词" placeholder="触发词，用顿号分隔" />
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="stale" role="status">设定已变化，请重新生成。</p>
    <footer>
      <button v-if="hasCandidate" type="button" @click="resetCandidate">放弃</button>
      <button type="button" class="primary" :disabled="busy || stale || (!hasCandidate && !brief.trim())" @click="hasCandidate ? apply() : generate()">{{ busy ? '补全中…' : hasCandidate ? '采用' : '生成候选' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.setting-ai-review{position:absolute;z-index:5;inset:62px 12px auto;display:grid;max-height:calc(100% - 74px);gap:10px;overflow:auto;padding:13px;border:1px solid var(--border-subtle);background:var(--surface-workbench-raised);box-shadow:0 10px 28px color-mix(in srgb,var(--text-primary) 14%,transparent)}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:10px}header strong{font-size:13px}button{border:0;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}.primary{min-height:34px;padding:0 14px;background:var(--accent-primary,var(--accent,#1677ff));color:#fff}.primary:disabled{opacity:.5;cursor:not-allowed}
input,textarea{box-sizing:border-box;width:100%;padding:7px 0;resize:none;border:0;border-bottom:1px solid var(--border-subtle);outline:0;background:transparent;color:var(--text-primary);font:12px/1.65 var(--font-body)}input:focus,textarea:focus{border-bottom-color:var(--accent-primary)}p{margin:0;color:var(--danger,#b42318);font-size:11px}footer{justify-content:flex-end}
@media(pointer:coarse){button{min-width:44px;min-height:44px}}
</style>
