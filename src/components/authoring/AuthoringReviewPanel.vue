<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="authoring-review-panel">
      <section
        v-if="open"
        ref="panelRef"
        class="authoring-review-panel"
        :class="{ 'is-embedded': embedded }"
        role="dialog"
        aria-modal="false"
        aria-labelledby="authoring-review-title"
        data-test="authoring-review-panel"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <header class="authoring-review-panel__head">
          <div>
            <span>{{ tr('当前文稿') }}</span>
            <h2 id="authoring-review-title">{{ embedded ? tr('审稿') : tr('校对') }}</h2>
            <p>{{ documentTitle || tr('未命名文稿') }}</p>
          </div>
          <button ref="closeRef" type="button" :aria-label="tr(&quot;关闭校对&quot;)" :title="tr(&quot;关闭校对&quot;)" @click="emit('close')">×</button>
        </header>

        <slot name="controls" />
        <div class="authoring-review-panel__toolbar">
          <button v-if="busy" class="is-primary" type="button" @click="emit('cancel')">{{ tr('停止') }}</button>
          <button v-else class="is-primary" type="button" @click="emit('scan')">{{ embedded ? tr('开始审稿') : findings.length ? tr('重新校对') : tr('开始校对') }}</button>
          <button v-if="retryAvailable && !busy" type="button" @click="emit('retry')">{{ tr('继续未完成批次') }}</button>
          <span v-if="busy">{{ tr('正在检查 {completed}/{total}', { completed: progress.completed, total: progress.total }) }}</span>
          <span v-else-if="findings.length">{{ tr('{openCount} 条待处理', { openCount: openCount }) }}</span>
          <button v-if="undoAvailable" class="is-quiet" type="button" @click="emit('undo')">{{ tr('撤销采用') }}</button>
        </div>

        <p v-if="error" class="authoring-review-panel__notice is-error" role="alert">{{ error }}</p>
        <p v-else-if="status" class="authoring-review-panel__notice" role="status">{{ status }}</p>

        <AuthoringExceptionReview
          v-if="attentionItems.length"
          class="authoring-review-panel__attention"
          :exceptions="attentionItems"
          :open="open"
          @resolve="(id, action) => emit('resolve-attention', id, action)"
        />

        <div v-if="findings.length" class="authoring-review-panel__results" :aria-label="tr(&quot;校对结果&quot;)">
          <article
            v-for="finding in findings"
            :key="finding.id"
            class="authoring-review-finding"
            :class="[`is-${finding.status || 'open'}`, { 'is-selected': selectedIds.has(finding.id) }]"
            :data-finding-id="finding.id"
          >
            <header>
              <label v-if="canApply(finding)" :title="finding.status === 'open' ? tr('加入批量采用') : tr('这条建议已不可采用')">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(finding.id)"
                  :disabled="finding.status !== 'open'"
                  @change="toggleFinding(finding.id)"
                >
                <span>{{ tr(issueLabel(finding.issueType || finding.kind)) }}</span>
              </label>
              <strong v-else>{{ tr(issueLabel(finding.issueType || finding.kind)) }}</strong>
              <small>{{ tr(statusLabel(finding.status)) }}</small>
            </header>
            <button class="authoring-review-finding__excerpt" type="button" @click="emit('jump', finding)">
              <span :lang="contentLanguage === 'mixed' ? undefined : contentLanguage || undefined">{{ finding.target?.exact || finding.exact || tr('原文位置') }}</span>
              <small>{{ finding.positionLabel || tr('跳到原文') }}</small>
            </button>
            <p :lang="explanationLanguage || undefined">{{ finding.reason || finding.body }}</p>
            <div v-if="finding.replacement" class="authoring-review-finding__replacement">
              <span>{{ tr('建议') }}</span>
              <p :lang="contentLanguage === 'mixed' ? undefined : contentLanguage || undefined">{{ finding.replacement }}</p>
            </div>
            <footer>
              <button type="button" @click="emit('jump', finding)">{{ tr('跳到') }}</button>
              <button v-if="embedded && finding.status === 'open'" type="button" :disabled="busy" @click="emit('rewrite', finding)">{{ tr('按此意见改写') }}</button>
              <button
                v-if="finding.replacement"
                type="button"
                :disabled="finding.status !== 'open'"
                @click="emit('apply', finding)"
              >{{ tr('采用') }}</button>
              <button
                type="button"
                :disabled="finding.status !== 'open'"
                @click="emit('ignore', finding)"
              >{{ tr('忽略') }}</button>
            </footer>
          </article>
        </div>

        <div v-else-if="!busy" class="authoring-review-panel__empty">
          <strong>{{ tr('检查正文，不替你改稿') }}</strong>
          <p>{{ tr('校对只生成可定位的建议。只有你点“采用”后，正文才会发生变化。') }}</p>
        </div>

        <footer v-if="selectableCount" class="authoring-review-panel__batch">
          <span>{{ tr('已选 {size} / {selectableCount}', { size: selectedIds.size, selectableCount: selectableCount }) }}</span>
          <button type="button" :disabled="!selectedIds.size" @click="applySelected">{{ tr('采用所选') }}</button>
        </footer>
        <slot name="rewrite" />
      </section>
    </Transition>
  </Teleport>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, nextTick, ref, watch } from 'vue'
import AuthoringExceptionReview from './AuthoringExceptionReview.vue'

const props = defineProps({
  open: Boolean,
  embedded: Boolean,
  retryAvailable: Boolean,
  documentTitle: { type: String, default: '' },
  findings: { type: Array, default: () => [] },
  explanationLanguage: { type: String, default: '' },
  contentLanguage: { type: String, default: '' },
  busy: Boolean,
  progress: { type: Object, default: () => ({ completed: 0, total: 0 }) },
  error: { type: String, default: '' },
  status: { type: String, default: '' },
  attentionItems: { type: Array, default: () => [] },
  undoAvailable: Boolean
})

const emit = defineEmits(['close', 'scan', 'retry', 'cancel', 'jump', 'rewrite', 'apply', 'ignore', 'apply-selected', 'undo', 'resolve-attention'])
const panelRef = ref(null)
const closeRef = ref(null)
const selectedIds = ref(new Set())

const openCount = computed(() => props.findings.filter((finding) => (finding.status || 'open') === 'open').length)
const selectableCount = computed(() => props.findings.filter(canApply).length)

function canApply(finding) {
  return Boolean(finding?.replacement && (finding.status || 'open') === 'open')
}

function toggleFinding(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function applySelected() {
  if (!selectedIds.value.size) return
  emit('apply-selected', [...selectedIds.value])
}

function issueLabel(value) {
  return ({
    typo: '错别字', punctuation: '标点', quote: '引号', repetition: '重复', grammar: '语句',
    naming: '称谓', time: '时间', number: '数值', 'scene-conflict': '现场',
    '角色连续性': '角色连续性', '设定冲突': '设定冲突', POV: '视角', '衔接': '衔接', '节奏': '节奏', '语言': '语言'
  })[value] || '校对'
}

function statusLabel(value) {
  return ({ open: '待处理', ignored: '已忽略', applied: '已采用', modified: '已修改，待复核', stale: '正文已变化', detached: '位置已失效' })[value || 'open'] || '待处理'
}

watch(() => props.findings, (findings) => {
  const available = new Set((findings || []).filter(canApply).map((finding) => finding.id))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => available.has(id)))
}, { deep: true })

watch(() => props.open, (open) => {
  if (!open) return
  nextTick(() => closeRef.value?.focus({ preventScroll: true }))
})
</script>

<style scoped>
.authoring-review-panel.is-embedded { position: relative; inset: auto; width: 100%; height: 100%; flex: 1; border: 0; box-shadow: none; z-index: auto; }
.authoring-review-panel.is-embedded .authoring-review-panel__toolbar { flex-wrap: wrap; }
.authoring-review-panel { position: fixed; z-index: var(--z-popover, 400); inset-block: 54px 18px; inset-inline-end: 58px; display: flex; width: min(430px, calc(100vw - 76px)); min-height: 0; flex-direction: column; overflow: hidden; border: 1px solid var(--border-subtle); background: var(--surface-workbench-raised, var(--surface-primary)); color: var(--text-primary); box-shadow: 0 18px 46px color-mix(in srgb, #000 17%, transparent); }
.authoring-review-panel__head { display: flex; min-height: 70px; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 14px 10px 18px; border-bottom: 1px solid var(--border-subtle); }
.authoring-review-panel__head>div { display: grid; min-width: 0; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; column-gap: 8px; }
.authoring-review-panel__head span { color: var(--text-secondary); font-size: 11px; grid-column: 1/-1; }
.authoring-review-panel__head h2 { margin: 0; font: 600 18px/1.3 var(--font-sans, sans-serif); }
.authoring-review-panel__head p { overflow: hidden; margin: 0; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-review-panel__head>button { width: 34px; height: 34px; border: 0; background: transparent; color: var(--text-secondary); font-size: 23px; cursor: pointer; }
.authoring-review-panel__toolbar { display: flex; min-height: 44px; flex: 0 0 auto; align-items: center; gap: 8px; padding: 6px 14px 6px 18px; border-bottom: 1px solid var(--border-subtle); }
.authoring-review-panel__toolbar span { margin-inline-end: auto; color: var(--text-secondary); font-size: 12px; }
.authoring-review-panel button { font: inherit; }
.authoring-review-panel__toolbar button, .authoring-review-panel__batch button, .authoring-review-finding footer button { min-height: 30px; padding: 0 10px; border: 1px solid var(--border-subtle); border-radius: 3px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-review-panel__toolbar button:hover:not(:disabled), .authoring-review-panel__batch button:hover:not(:disabled), .authoring-review-finding footer button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent-primary) 48%, var(--border-subtle)); color: var(--text-primary); }
.authoring-review-panel__toolbar .is-primary, .authoring-review-panel__batch button { border-color: var(--accent-primary); color: var(--accent-primary); }
.authoring-review-panel__toolbar .is-quiet { margin-inline-start: auto; border-color: transparent; }
.authoring-review-panel__notice { margin: 0; padding: 8px 18px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.authoring-review-panel__notice.is-error { color: var(--signal-danger, #a04b3c); }
.authoring-review-panel__attention { flex: 0 0 auto; max-height: min(38dvh, 320px); margin: 0; padding-inline: 18px; overflow: auto; border-top: 0; }
.authoring-review-panel__results { min-height: 0; flex: 1 1 auto; overflow: auto; }
.authoring-review-finding { padding: 13px 18px 12px; border-bottom: 1px solid var(--border-subtle); }
.authoring-review-finding.is-ignored, .authoring-review-finding.is-applied { opacity: .62; }
.authoring-review-finding.is-stale, .authoring-review-finding.is-detached { border-inline-start: 3px solid var(--signal-warning, #aa7d2f); }
.authoring-review-finding>header { display: flex; align-items: center; gap: 8px; }
.authoring-review-finding>header label { display: inline-flex; align-items: center; gap: 6px; color: var(--text-primary); font-size: 12px; font-weight: 600; }
.authoring-review-finding>header strong { font-size: 12px; }
.authoring-review-finding>header small { margin-inline-start: auto; color: var(--text-secondary); font-size: 10px; }
.authoring-review-finding__excerpt { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: 10px; margin: 9px 0 0; padding: 7px 0; overflow: hidden; border: 0; background: transparent; color: var(--text-primary); text-align: start; cursor: pointer; }
.authoring-review-finding__excerpt span { overflow: hidden; font-family: var(--font-serif, serif); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-review-finding__excerpt small { flex: 0 0 auto; color: var(--text-secondary); font-size: 10px; }
.authoring-review-finding>p, .authoring-review-finding__replacement p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.65; }
.authoring-review-finding__replacement { display: grid; grid-template-columns: 34px minmax(0, 1fr); margin-top: 7px; padding-top: 7px; border-top: 1px dashed color-mix(in srgb, var(--border-subtle) 75%, transparent); }
.authoring-review-finding__replacement>span { color: var(--accent-primary); font-size: 10px; line-height: 1.9; }
.authoring-review-finding__replacement p { margin: 0; color: var(--text-primary); }
.authoring-review-finding footer { display: flex; justify-content: flex-end; gap: 5px; margin-top: 9px; }
.authoring-review-finding footer button { min-height: 28px; border-color: transparent; }
.authoring-review-finding footer button:nth-child(2) { border-color: color-mix(in srgb, var(--accent-primary) 50%, var(--border-subtle)); color: var(--accent-primary); }
.authoring-review-panel__empty { display: grid; min-height: 220px; place-content: center; padding: 28px; text-align: center; }
.authoring-review-panel__empty strong { font-size: 15px; }
.authoring-review-panel__empty p { max-width: 260px; margin: 8px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.authoring-review-panel__batch { display: flex; min-height: 48px; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 7px 14px 7px 18px; border-top: 1px solid var(--border-subtle); background: var(--surface-workbench-raised, var(--surface-primary)); }
.authoring-review-panel__batch span { color: var(--text-secondary); font-size: 11px; }
.authoring-review-panel button:focus-visible, .authoring-review-panel input:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent-primary) 72%, transparent); outline-offset: 2px; }
.authoring-review-panel button:disabled { opacity: .38; cursor: default; }
.authoring-review-panel-enter-active, .authoring-review-panel-leave-active { transition: opacity .16s ease, transform .16s ease; }
.authoring-review-panel-enter-from, .authoring-review-panel-leave-to { opacity: 0; transform: translateX(10px); }
@media (prefers-reduced-motion: reduce) { .authoring-review-panel-enter-active, .authoring-review-panel-leave-active { transition: none; } }
@media (max-width: 720px) {
  .authoring-review-panel { inset: 0; width: 100vw; max-width: none; border: 0; box-shadow: none; }
  .authoring-review-panel__head { min-height: 58px; padding-top: max(8px, env(safe-area-inset-top)); }
  .authoring-review-panel__batch { padding-bottom: max(7px, env(safe-area-inset-bottom)); }
}
</style>
