<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import autosize from 'autosize'
import { ArrowUpRight, Plus, RotateCcw, Save, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  page: { type: Object, required: true },
  pageIndex: { type: Number, required: true },
  persisted: { type: Boolean, default: false },
  active: { type: Boolean, default: true }
})
const emit = defineEmits(['update-page', 'save-page', 'open-page'])
const root = ref(null)
function resizeFields() { nextTick(() => { const fields = root.value?.querySelectorAll('textarea'); if (fields) { autosize(fields); autosize.update(fields) } }) }
let widthObserver
let lastWidth = 0
onMounted(() => {
  resizeFields()
  if (typeof ResizeObserver !== 'function') return
  widthObserver = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width
    if (width > 0 && width !== lastWidth) { lastWidth = width; resizeFields() }
  })
  if (root.value) widthObserver.observe(root.value)
})
watch(() => props.page, resizeFields, { deep: true })
watch(() => props.active, active => { if (active) resizeFields() })
onBeforeUnmount(() => { widthObserver?.disconnect(); const fields = root.value?.querySelectorAll('textarea'); if (fields) autosize.destroy(fields) })
const draft = ref(clone(props.page))
const dirty = ref(false)
const saving = ref(false)
const notice = ref('')
const failed = ref(false)
const baselineRevision = ref(props.page.revision)
const hasConflict = computed(() => dirty.value && baselineRevision.value !== props.page.revision)

watch(() => props.page, (page) => {
  if (!dirty.value) {
    draft.value = clone(page)
    baselineRevision.value = page.revision
  }
}, { deep: true })

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function changed() {
  resizeFields()
  notice.value = ''
  failed.value = false
  if (props.persisted) dirty.value = true
  else emit('update-page', clone(draft.value))
}
function addDialogue(panel) {
  if (!Array.isArray(panel.dialogue)) panel.dialogue = []
  if (panel.dialogue.length >= 6) return
  panel.dialogue.push({ speaker: '', text: '' })
  changed()
}
function removeDialogue(panel, index) { panel.dialogue.splice(index, 1); changed() }
function reloadSaved() {
  draft.value = clone(props.page)
  baselineRevision.value = props.page.revision
  dirty.value = false
  failed.value = false
  notice.value = '已载入保存的内容。'
}
function save() {
  if (saving.value || !dirty.value) return
  saving.value = true
  emit('save-page', { pageId: props.page.id, expectedRevision: baselineRevision.value, draft: clone(draft.value) }, (result) => {
    saving.value = false
    if (result?.ok) {
      dirty.value = false
      failed.value = false
      if (result.page) {
        draft.value = clone(result.page)
        baselineRevision.value = result.page.revision
      }
      notice.value = '本页修改已保存。'
    } else {
      failed.value = true
      notice.value = result?.error || '保存失败，修改仍留在这里。'
    }
  })
}
function flushPendingEdits() {
  if (!props.persisted || !dirty.value) return true
  failed.value = true
  notice.value = '本页有未保存修改，请先保存，或载入已保存内容。'
  return false
}
defineExpose({ flushPendingEdits, hasUnsavedChanges: () => dirty.value })
</script>

<template>
  <section ref="root" class="comic-plan-page" :aria-label="`第 ${pageIndex + 1} 页分镜脚本`">
    <header class="comic-plan-page__header">
      <input v-model="draft.title" class="comic-plan-page__title" :aria-label="`第 ${pageIndex + 1} 页标题`" placeholder="页面标题" maxlength="100" @input="changed" />
      <button v-if="persisted" type="button" :disabled="dirty || saving" @click="$emit('open-page', page.id)">
        制作这一页 <ArrowUpRight :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="comic-plan-page__fields">
      <label><span class="visually-hidden">这一页发生什么</span><textarea v-model="draft.narrativeBeat" :aria-label="`第 ${pageIndex + 1} 页剧情任务`" rows="1" placeholder="这一页发生什么" maxlength="320" @input="changed"></textarea></label>
      <details class="comic-plan-page__hook" @toggle="resizeFields"><summary>翻页衔接</summary><input v-model="draft.pageTurnHook" :aria-label="`第 ${pageIndex + 1} 页翻页衔接`" placeholder="留给下一页的动作、问题或悬念" maxlength="240" @input="changed" /></details>
    </div>
    <div class="comic-plan-page__panels">
      <section v-for="(panel, panelIndex) in draft.panels" :key="panel.id || panelIndex" class="comic-plan-page__panel">
        <div class="comic-plan-page__panel-number">{{ String(panelIndex + 1).padStart(2, '0') }}</div>
        <div class="comic-plan-page__panel-body">
          <label><span class="visually-hidden">画面</span><textarea v-model="panel.visual" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格画面`" placeholder="主体、动作、环境与构图" rows="1" maxlength="520" @input="changed"></textarea></label>
          <div v-for="(line, lineIndex) in panel.dialogue" :key="lineIndex" class="comic-plan-page__dialogue">
            <input v-model="line.speaker" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格说话人 ${lineIndex + 1}`" placeholder="角色" maxlength="80" @input="changed" />
            <textarea v-model="line.text" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格对白 ${lineIndex + 1}`" placeholder="对白内容" rows="1" maxlength="240" @input="changed"></textarea>
            <button type="button" :aria-label="`移除对白 ${lineIndex + 1}`" @click="removeDialogue(panel, lineIndex)"><Trash2 :size="14" aria-hidden="true" /></button>
          </div>
          <details class="comic-plan-page__extras" :open="Boolean(panel.caption)" @toggle="resizeFields">
            <summary>动作与旁白</summary>
            <label v-if="panel.beat"><span>动作</span><input v-model="panel.beat.action" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格动作`" placeholder="这一格推进的动作" maxlength="160" @input="changed" /></label>
            <label><span>旁白</span><textarea v-model="panel.caption" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格旁白`" placeholder="添加旁白" rows="1" maxlength="240" @input="changed"></textarea></label>
          </details>
          <button class="comic-plan-page__add-dialogue" type="button" :disabled="panel.dialogue?.length >= 6" @click="addDialogue(panel)"><Plus :size="14" aria-hidden="true" /> 对白</button>
        </div>
      </section>
    </div>
    <footer v-if="persisted && (dirty || notice)" class="comic-plan-page__save">
      <p v-if="hasConflict" class="is-error" role="alert">这页已有较新的保存版本。当前修改仍保留，请先核对。</p>
      <p v-else-if="notice" :class="{ 'is-error': failed }" :role="failed ? 'alert' : 'status'">{{ notice }}</p>
      <p v-else>有未保存修改</p>
      <div><button v-if="dirty" type="button" :disabled="saving" @click="reloadSaved"><RotateCcw :size="14" aria-hidden="true" /> 载入已保存内容</button><button class="comic-plan-page__save-primary" type="button" :disabled="!dirty || saving || hasConflict" @click="save"><Save :size="14" aria-hidden="true" />{{ saving ? '正在保存…' : '保存本页修改' }}</button></div>
    </footer>
  </section>
</template>

<style scoped>
.comic-plan-page { min-width: 0; display: grid; gap: 14px; color: var(--text-primary); font: 14px/1.7 var(--font-sans); }
.comic-plan-page * { box-sizing: border-box; }
.comic-plan-page__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.comic-plan-page button { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px; border: 0; border-radius: var(--radius-control); color: var(--text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.comic-plan-page button:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.comic-plan-page button:disabled { opacity: .45; cursor: not-allowed; }
.comic-plan-page label { display: grid; min-width: 0; gap: 4px; }
.comic-plan-page label > span { font-size: 12px; color: var(--text-secondary); }
.comic-plan-page input, .comic-plan-page textarea { min-width: 0; width: 100%; min-height: 32px; padding: 4px 0; border: 0; border-radius: 0; background: transparent; color: var(--text-primary); font: inherit; line-height: 1.8; }
.comic-plan-page textarea { field-sizing: content; resize: vertical; }
.comic-plan-page input::placeholder, .comic-plan-page textarea::placeholder { color: var(--text-muted); }
.comic-plan-page input.comic-plan-page__title { font-size: 20px; font-weight: 600; }
.comic-plan-page__header > button { flex-shrink: 0; }
.comic-plan-page__fields { display: grid; gap: 8px; color: var(--text-secondary); }
.comic-plan-page__fields textarea { color: var(--text-secondary); }
.comic-plan-page summary { min-height: 32px; color: var(--text-secondary); cursor: pointer; font-size: 12px; }
.comic-plan-page__panels { border-top: 1px solid var(--hairline-soft); }
.comic-plan-page__panel { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 14px; padding: 22px 0; border-bottom: 1px solid var(--hairline-soft); }
.comic-plan-page__panel-number { padding-top: 6px; font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.comic-plan-page__panel-body { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.comic-plan-page__panel-body > label, .comic-plan-page__dialogue { grid-column: 1 / -1; }
.comic-plan-page__extras { min-width: 0; }
.comic-plan-page__extras label { margin-top: 8px; }
.comic-plan-page__add-dialogue { align-self: start; }
.comic-plan-page__dialogue { display: grid; grid-template-columns: 76px minmax(0, 1fr) 32px; align-items: start; gap: 12px; }
.comic-plan-page__dialogue input { color: var(--text-secondary); font-size: 13px; }
.comic-plan-page__dialogue button { opacity: 0; }
.comic-plan-page__dialogue:hover button, .comic-plan-page__dialogue:focus-within button { opacity: 1; }
.comic-plan-page__save { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; background: var(--surface-workbench); border-top: 1px solid var(--hairline-soft); }
.comic-plan-page__save p { margin: 0; color: var(--text-secondary); font-size: 12px; }
.comic-plan-page__save > div { display: flex; flex-wrap: wrap; margin-left: auto; gap: 8px; }
.comic-plan-page__save .comic-plan-page__save-primary { background: var(--text-primary); color: var(--surface-workbench); padding-inline: 14px; }
.comic-plan-page .is-error { color: var(--danger); }
.comic-plan-page :is(button, input, textarea, summary):focus-visible { outline: 2px solid var(--workbench-focus, var(--accent)); outline-offset: 3px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) { .comic-plan-page__panel { gap: 8px; grid-template-columns: 22px minmax(0, 1fr); } .comic-plan-page__dialogue { grid-template-columns: 58px minmax(0, 1fr) 32px; gap: 6px; } }
@media (max-width: 640px), (pointer: coarse) { .comic-plan-page :is(button, input, summary) { min-height: 44px; } .comic-plan-page__dialogue { grid-template-columns: 58px minmax(0, 1fr) 44px; } .comic-plan-page__dialogue button { opacity: 1; } }
</style>
