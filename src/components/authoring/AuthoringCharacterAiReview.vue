<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { createSettingsPageDispatcher } from '../../services/agents/settings/settingsTaskDispatcher'
import { createSettingsGenerationWorkflow } from '../../services/agents/settings/settingsGenerationWorkflow'
import { createSettingGenerationServices } from '../../services/worldbook/settingFieldGeneration'

const props = defineProps({
  worldbook: { type: Object, required: true },
  entry: { type: Object, required: true },
  profile: { type: Object, required: true },
  open: Boolean
})
const emit = defineEmits(['update:open', 'apply'])

const dispatcher = createSettingsPageDispatcher({
  adapters: { settingsGeneration: createSettingsGenerationWorkflow(createSettingGenerationServices()) }
})
const brief = ref('')
const busy = ref(false)
const error = ref('')
const candidate = reactive({ background: '', personality: '', appearance: '', other: '' })
const sourceRevision = ref('')
const sourceEntryRevision = ref('')
let controller = null

const hasCandidate = computed(() => Object.values(candidate).some((value) => String(value || '').trim()))
const stale = computed(() => hasCandidate.value && (
  String(props.worldbook?.updatedAt || props.worldbook?.revision || '') !== sourceRevision.value
  || String(props.entry?.metadata?.updatedAt || props.entry?.updatedAt || '') !== sourceEntryRevision.value
))

function resetCandidate() {
  Object.assign(candidate, { background: '', personality: '', appearance: '', other: '' })
  sourceRevision.value = ''
  sourceEntryRevision.value = ''
  error.value = ''
}

async function generate() {
  if (busy.value) return
  controller?.abort()
  controller = new AbortController()
  busy.value = true
  resetCandidate()
  const revision = String(props.worldbook?.updatedAt || props.worldbook?.revision || '')
  try {
    const result = await dispatcher.dispatch('settings.character.complete', {
      project: { id: props.worldbook.id, revision },
      target: { type: 'worldbook-character', id: props.entry.id, revision },
      intent: {
        worldbook: props.worldbook,
        entry: props.entry,
        profile: props.profile,
        userBrief: brief.value
      }
    }, { signal: controller.signal })
    const payload = result?.actions?.[0]?.payload
    if (result?.status !== 'completed' || !payload?.ok) {
      error.value = payload?.reason || result?.error?.message || '角色资料补全失败。'
      return
    }
    Object.assign(candidate, payload.profile)
    sourceRevision.value = payload.sourceRevision
    sourceEntryRevision.value = payload.sourceEntryRevision
  } catch (reason) {
    if (reason?.name !== 'AbortError') error.value = reason?.message || '角色资料补全失败。'
  } finally {
    busy.value = false
    controller = null
  }
}

function apply() {
  if (!hasCandidate.value || stale.value) return
  emit('apply', { ...candidate })
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
  <section v-if="open" class="character-ai-review" aria-label="AI 补全角色资料">
    <header><strong>AI 补全</strong><button type="button" aria-label="关闭 AI 补全" @click="close">×</button></header>
    <textarea v-if="!hasCandidate" v-model="brief" rows="2" placeholder="补充要求（可选）" :disabled="busy"></textarea>
    <template v-else>
      <label v-for="field in [['background', '背景'], ['personality', '性格'], ['appearance', '外貌'], ['other', '其他']]" :key="field[0]">
        <span>{{ field[1] }}</span><textarea v-model="candidate[field[0]]" rows="2"></textarea>
      </label>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="stale" role="status">人物资料已变化，请重新生成。</p>
    <footer>
      <button v-if="hasCandidate" type="button" @click="resetCandidate">放弃</button>
      <button type="button" class="primary" :disabled="busy || stale" @click="hasCandidate ? apply() : generate()">{{ busy ? '补全中…' : hasCandidate ? '采用' : '生成候选' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.character-ai-review{position:absolute;z-index:4;inset:102px 12px auto;display:grid;max-height:calc(100% - 114px);gap:10px;overflow:auto;padding:13px;border:1px solid var(--border-subtle);background:var(--surface-workbench-raised);box-shadow:0 10px 28px color-mix(in srgb,var(--text-primary) 14%,transparent)}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:10px}header strong{font-size:13px}button{border:0;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}.primary{min-height:34px;padding:0 14px;background:var(--accent-primary,var(--accent,#1677ff));color:#fff}.primary:disabled{opacity:.5;cursor:not-allowed}
label{display:grid;gap:4px}label span{color:var(--text-secondary);font-size:11px}textarea{box-sizing:border-box;width:100%;resize:none;border:0;border-bottom:1px solid var(--border-subtle);outline:0;background:transparent;color:var(--text-primary);font:12px/1.65 var(--font-body)}textarea:focus{border-bottom-color:var(--accent-primary)}p{margin:0;color:var(--danger,#b42318);font-size:11px}footer{justify-content:flex-end}
@media(pointer:coarse){button{min-width:44px;min-height:44px}}
</style>
