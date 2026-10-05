<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowUpRight, Plus, RotateCcw, Save, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  page: { type: Object, required: true },
  pageIndex: { type: Number, required: true },
  persisted: { type: Boolean, default: false }
})
const emit = defineEmits(['update-page', 'save-page', 'open-page'])
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
  <section class="comic-plan-page" :aria-label="`第 ${pageIndex + 1} 页分镜脚本`">
    <header class="comic-plan-page__header">
      <div><span>第 {{ pageIndex + 1 }} 页 · {{ draft.panels.length }} 格</span><strong>{{ persisted ? '编辑分镜脚本' : '调整这一页' }}</strong></div>
      <button v-if="persisted" type="button" :disabled="dirty || saving" @click="$emit('open-page', page.id)">
        制作这一页 <ArrowUpRight :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="comic-plan-page__fields">
      <label><span>页面标题</span><input v-model="draft.title" :aria-label="`第 ${pageIndex + 1} 页标题`" maxlength="100" @input="changed" /></label>
      <label><span>这一页发生什么</span><textarea v-model="draft.narrativeBeat" :aria-label="`第 ${pageIndex + 1} 页剧情任务`" rows="2" maxlength="320" @input="changed"></textarea></label>
      <details class="comic-plan-page__hook"><summary>翻页衔接</summary><input v-model="draft.pageTurnHook" :aria-label="`第 ${pageIndex + 1} 页翻页衔接`" placeholder="留给下一页的动作、问题或悬念" maxlength="240" @input="changed" /></details>
    </div>
    <div class="comic-plan-page__panels">
      <details v-for="(panel, panelIndex) in draft.panels" :key="panel.id || panelIndex" class="comic-plan-page__panel" :open="panelIndex === 0">
        <summary><span>{{ panelIndex + 1 }}</span><strong>{{ panel.beat?.action || panel.visual || '填写画面' }}</strong><small>{{ panel.dialogue?.filter(line => line.text).length || 0 }} 句对白</small></summary>
        <div class="comic-plan-page__panel-body">
          <label><span>画面</span><textarea v-model="panel.visual" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格画面`" placeholder="主体、动作、环境与构图" rows="3" maxlength="520" @input="changed"></textarea></label>
          <label v-if="panel.beat"><span>剧情动作</span><input v-model="panel.beat.action" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格动作`" maxlength="160" @input="changed" /></label>
          <div class="comic-plan-page__dialogue-heading"><span>对白</span><button type="button" :disabled="panel.dialogue?.length >= 6" @click="addDialogue(panel)"><Plus :size="14" aria-hidden="true" /> 添加对白</button></div>
          <div v-for="(line, lineIndex) in panel.dialogue" :key="lineIndex" class="comic-plan-page__dialogue">
            <input v-model="line.speaker" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格说话人 ${lineIndex + 1}`" placeholder="角色" maxlength="80" @input="changed" />
            <textarea v-model="line.text" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格对白 ${lineIndex + 1}`" placeholder="对白内容" rows="1" maxlength="240" @input="changed"></textarea>
            <button type="button" :aria-label="`移除对白 ${lineIndex + 1}`" @click="removeDialogue(panel, lineIndex)"><Trash2 :size="14" aria-hidden="true" /></button>
          </div>
          <label><span>旁白 <small>可选</small></span><textarea v-model="panel.caption" :aria-label="`第 ${pageIndex + 1} 页第 ${panelIndex + 1} 格旁白`" rows="1" maxlength="240" @input="changed"></textarea></label>
        </div>
      </details>
    </div>
    <footer v-if="persisted" class="comic-plan-page__save">
      <p v-if="hasConflict" class="is-error" role="alert">这页已有较新的保存版本。当前修改仍保留，请先核对。</p>
      <p v-else-if="notice" :class="{ 'is-error': failed }" :role="failed ? 'alert' : 'status'">{{ notice }}</p>
      <p v-else>{{ dirty ? '修改仅在此页，保存后用于制作。' : '画面内容改变后，相关制作阶段需要重新审阅。' }}</p>
      <div><button v-if="dirty" type="button" :disabled="saving" @click="reloadSaved"><RotateCcw :size="14" aria-hidden="true" /> 载入已保存内容</button><button class="comic-plan-page__save-primary" type="button" :disabled="!dirty || saving || hasConflict" @click="save"><Save :size="14" aria-hidden="true" />{{ saving ? '正在保存…' : '保存本页修改' }}</button></div>
    </footer>
  </section>
</template>

<style scoped>
.comic-plan-page { min-width: 0; display: grid; gap: 22px; color: var(--text-primary); font: 14px/1.6 var(--font-sans); }
.comic-plan-page * { box-sizing: border-box; }
.comic-plan-page__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.comic-plan-page__header > div { min-width: 0; display: grid; gap: 4px; }
.comic-plan-page__header span { font-size: 12px; color: var(--text-secondary); }
.comic-plan-page__header strong { font-size: 18px; font-weight: 500; }
.comic-plan-page button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border: 0; border-radius: var(--radius-control); color: var(--accent); background: transparent; font: inherit; cursor: pointer; }
.comic-plan-page button:hover:not(:disabled) { background: var(--bg-hover); }
.comic-plan-page button:disabled { opacity: .45; cursor: not-allowed; }
.comic-plan-page label { display: grid; min-width: 0; gap: 7px; }
.comic-plan-page label > span, .comic-plan-page__dialogue-heading { font-size: 13px; color: var(--text-secondary); }
.comic-plan-page label small { margin-left: 5px; font-size: 12px; }
.comic-plan-page input, .comic-plan-page textarea { min-width: 0; width: 100%; min-height: 40px; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; line-height: 1.6; }
.comic-plan-page textarea { field-sizing: content; resize: vertical; }
.comic-plan-page__fields { display: grid; gap: 16px; }
.comic-plan-page__hook summary { min-height: 36px; color: var(--text-secondary); cursor: pointer; font-size: 13px; }
.comic-plan-page__panels { border-top: 1px solid var(--hairline-soft); }
.comic-plan-page__panel { border-bottom: 1px solid var(--hairline-soft); }
.comic-plan-page__panel > summary { min-height: 60px; display: flex; align-items: center; gap: 12px; padding-block: 12px; list-style: none; cursor: pointer; }
.comic-plan-page__panel > summary::-webkit-details-marker { display: none; }
.comic-plan-page__panel > summary > span { flex: 0 0 28px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--surface-workbench-input); font-size: 12px; }
.comic-plan-page__panel summary strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
.comic-plan-page__panel summary small { flex: 0 0 auto; margin-left: auto; color: var(--text-secondary); font-size: 12px; }
.comic-plan-page__panel-body { display: grid; gap: 14px; padding: 2px 0 24px 40px; }
.comic-plan-page__dialogue-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.comic-plan-page__dialogue { display: grid; grid-template-columns: 90px minmax(0, 1fr) 36px; align-items: start; gap: 8px; }
.comic-plan-page__save { display: grid; gap: 12px; padding-top: 8px; }
.comic-plan-page__save p { margin: 0; color: var(--text-secondary); font-size: 13px; }
.comic-plan-page__save > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.comic-plan-page__save .comic-plan-page__save-primary { background: var(--accent); color: var(--accent-text); padding-inline: 16px; }
.comic-plan-page__save .comic-plan-page__save-primary:hover:not(:disabled) { background: var(--accent-hover); }
.comic-plan-page .is-error { color: var(--danger); }
.comic-plan-page :is(button, input, textarea, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 760px) { .comic-plan-page__panel-body { padding-left: 0; } .comic-plan-page__header { align-items: flex-start; } .comic-plan-page__header > button { max-width: 130px; } .comic-plan-page__dialogue { grid-template-columns: 70px minmax(0, 1fr) 36px; } }
@media (max-width: 640px), (pointer: coarse) { .comic-plan-page :is(button, input, textarea) { min-height: 44px; } .comic-plan-page__dialogue { grid-template-columns: 70px minmax(0, 1fr) 44px; } }
</style>
