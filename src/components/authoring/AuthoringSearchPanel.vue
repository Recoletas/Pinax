<template>
  <Teleport to="body">
    <Transition name="authoring-search-panel">
      <section
        v-if="open"
        class="authoring-search-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="authoring-search-title"
        data-test="authoring-search-panel"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <header class="authoring-search-panel__head">
          <div class="authoring-search-panel__identity">
            <h2 id="authoring-search-title">查找</h2>
            <p>{{ scope === 'current-chapter' ? (currentChapterLabel || '当前章') : scopeLabel }}</p>
          </div>
          <div class="authoring-search-panel__head-actions">
            <button
              v-if="canReturn"
              class="authoring-search-panel__return"
              type="button"
              @click="emit('return-origin')"
            >返回原处</button>
            <button type="button" aria-label="关闭查找" title="关闭查找" @click="emit('close')">
              <WorkbenchIcon name="close" :size="18" />
            </button>
          </div>
        </header>

        <form class="authoring-search-panel__query" role="search" @submit.prevent="submitSearch">
          <label>
            <WorkbenchIcon name="search" :size="16" />
            <input
              ref="queryInputRef"
              :value="query"
              type="search"
              maxlength="240"
              enterkeyhint="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="查找文字"
              aria-label="查找文字"
              @input="emit('update:query', $event.target.value)"
              @compositionstart="composing = true"
              @compositionend="composing = false"
            >
          </label>
          <button type="submit" :disabled="busy || !normalizedQuery">{{ busy ? '查找中' : '查找' }}</button>
        </form>

        <nav class="authoring-search-panel__scopes" aria-label="查找范围">
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            type="button"
            :aria-pressed="scope === option.value"
            :class="{ 'is-active': scope === option.value }"
            @click="chooseScope(option.value)"
          >{{ option.label }}</button>
        </nav>

        <div class="authoring-search-panel__status" role="status" aria-live="polite">
          <span v-if="busy">正在查找…</span>
          <span v-else-if="normalizedQuery">{{ total }} 处</span>
          <span v-else>输入文字后查找</span>
          <small v-if="truncated">只显示前 {{ findings.length }} 处，请缩小关键词</small>
        </div>

        <p v-if="error" class="authoring-search-panel__notice is-error" role="alert">{{ error }}</p>
        <p v-else-if="notice" class="authoring-search-panel__notice" role="status">{{ notice }}</p>

        <div
          v-if="findings.length"
          class="authoring-search-panel__results"
          role="list"
          aria-label="查找结果"
        >
          <div
            v-for="finding in findings"
            :key="finding.id"
            class="authoring-search-result"
            :class="{
              'is-active': activeFindingId === finding.id,
              'is-stale': ['stale', 'detached'].includes(finding.status)
            }"
            role="listitem"
          >
            <button
              class="authoring-search-result__open"
              type="button"
              @click="emit('open-result', finding)"
            >
              <span class="authoring-search-result__meta">
                <strong>{{ finding.display?.title || '未命名来源' }}</strong>
                <small>{{ resultLocation(finding) }}</small>
              </span>
              <span class="authoring-search-result__excerpt">
                <template v-for="part in excerptParts(finding)" :key="part.key">
                  <mark v-if="part.match">{{ part.text }}</mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </span>
            </button>
            <button
              v-if="replaceAllowed && finding.target?.sourceKind === 'manuscript'"
              class="authoring-search-result__replace"
              type="button"
              :disabled="replaceBusy || ['stale', 'detached'].includes(finding.status)"
              @click="emit('replace-one', { finding, replacement })"
            >{{ replacement ? '替换此处' : '删除此处' }}</button>
          </div>
        </div>

        <div v-else-if="!busy" class="authoring-search-panel__empty">
          <template v-if="normalizedQuery">
            <strong>没有找到“{{ normalizedQuery }}”</strong>
            <p>可以换个词，或切换查找范围。</p>
          </template>
          <template v-else>
            <strong>从当前章开始查找</strong>
            <p>需要时再切换到全书、构思或设定。</p>
          </template>
        </div>

        <footer v-if="replaceAllowed" class="authoring-search-panel__replace-box">
          <label>
            <span>替换为</span>
            <input
              :value="replacement"
              type="text"
              autocomplete="off"
              placeholder="留空则删除命中文字"
              @input="emit('update:replacement', $event.target.value)"
            >
          </label>

          <div v-if="validReplacePreview" class="authoring-search-panel__preview" role="status">
            <p>将替换 {{ validReplacePreview.chapterCount }} 章 {{ validReplacePreview.matchCount }} 处</p>
            <div>
              <button type="button" :disabled="replaceBusy" @click="emit('cancel-replace-preview')">取消</button>
              <button
                class="is-primary"
                type="button"
                :disabled="replaceBusy"
                @click="emit('confirm-replace', validReplacePreview)"
              >{{ replaceBusy ? '替换中' : '确认替换' }}</button>
            </div>
          </div>
          <div v-else class="authoring-search-panel__replace-actions">
            <small v-if="scope === 'manuscript'">全书替换会先预览影响范围</small>
            <span v-else />
            <button
              type="button"
              :disabled="replaceBusy || busy || !normalizedQuery || total < 1"
              @click="requestReplaceAll"
            >{{ replaceAllLabel }}</button>
          </div>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  open: Boolean,
  query: { type: String, default: '' },
  scope: { type: String, default: 'current-chapter' },
  findings: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  truncated: Boolean,
  busy: Boolean,
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
  currentChapterLabel: { type: String, default: '' },
  activeFindingId: { type: String, default: '' },
  replacement: { type: String, default: '' },
  replacePreview: { type: Object, default: null },
  replaceBusy: Boolean,
  canReturn: Boolean
})

const emit = defineEmits([
  'close',
  'update:query',
  'update:scope',
  'update:replacement',
  'search',
  'open-result',
  'return-origin',
  'replace-one',
  'replace-all',
  'preview-replace',
  'confirm-replace',
  'cancel-replace-preview'
])

const queryInputRef = ref(null)
const composing = ref(false)
const scopeOptions = Object.freeze([
  { value: 'current-chapter', label: '当前章' },
  { value: 'manuscript', label: '全书' },
  { value: 'exploration', label: '构思' },
  { value: 'worldbook', label: '设定' }
])

const normalizedQuery = computed(() => props.query.trim())
const scopeLabel = computed(() => scopeOptions.find((option) => option.value === props.scope)?.label || '当前章')
const replaceAllowed = computed(() => ['current-chapter', 'manuscript'].includes(props.scope) && Boolean(normalizedQuery.value))
const validReplacePreview = computed(() => {
  const preview = props.replacePreview?.plan || props.replacePreview
  if (!preview || props.scope !== 'manuscript') return null
  if (preview.scope !== 'manuscript'
    || String(preview.query || '') !== normalizedQuery.value
    || String(preview.replacement ?? '') !== props.replacement
    || Number(preview.chapterCount) < 1
    || Number(preview.matchCount) < 1) return null
  return preview
})
const replaceAllLabel = computed(() => {
  if (props.replaceBusy) return '处理中'
  if (props.scope === 'manuscript') return '预览全书替换'
  return `${props.replacement ? '替换' : '删除'}本章 ${Math.max(0, props.total)} 处`
})

function submitSearch() {
  if (composing.value || props.busy || !normalizedQuery.value) return
  emit('search', { query: normalizedQuery.value, scope: props.scope })
}

function chooseScope(nextScope) {
  if (nextScope === props.scope) return
  emit('update:scope', nextScope)
  if (normalizedQuery.value) emit('search', { query: normalizedQuery.value, scope: nextScope })
}

function resultLocation(finding) {
  return [finding?.display?.sourceLabel, finding?.display?.position].filter(Boolean).join(' · ') || '打开来源'
}

function excerptParts(finding) {
  const excerpt = String(finding?.display?.excerpt || finding?.display?.matchedText || '')
  const start = Number(finding?.display?.excerptMatchStart)
  const end = Number(finding?.display?.excerptMatchEnd)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > excerpt.length) {
    return [{ key: 'text', text: excerpt, match: false }]
  }
  return [
    { key: 'before', text: excerpt.slice(0, start), match: false },
    { key: 'match', text: excerpt.slice(start, end), match: true },
    { key: 'after', text: excerpt.slice(end), match: false }
  ].filter((part) => part.text)
}

function requestReplaceAll() {
  const payload = {
    query: normalizedQuery.value,
    replacement: props.replacement,
    scope: props.scope,
    expectedTotal: props.total
  }
  if (props.scope === 'manuscript') emit('preview-replace', payload)
  else emit('replace-all', payload)
}

watch(() => props.open, (open) => {
  if (!open) return
  nextTick(() => {
    queryInputRef.value?.focus({ preventScroll: true })
    queryInputRef.value?.select()
  })
})
</script>

<style scoped>
.authoring-search-panel {
  position: fixed;
  z-index: var(--z-popover);
  inset-block-start: 70px;
  inset-inline-start: 50%;
  display: flex;
  width: min(620px, calc(100vw - 40px));
  max-height: min(680px, calc(100dvh - 96px));
  min-height: min(320px, calc(100dvh - 96px));
  transform: translateX(-50%);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--surface-workbench-raised, var(--surface-primary));
  box-shadow: var(--shadow-workbench-float);
  color: var(--text-primary);
  font-family: var(--font-sans, sans-serif);
}

.authoring-search-panel button,
.authoring-search-panel input { font: inherit; }

.authoring-search-panel__head {
  display: flex;
  min-height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px 9px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.authoring-search-panel__identity { display: flex; min-width: 0; align-items: baseline; gap: 9px; }
.authoring-search-panel__identity h2 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.3; }
.authoring-search-panel__identity p { overflow: hidden; margin: 0; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-search-panel__head-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 4px; }
.authoring-search-panel__head-actions button { min-width: 36px; min-height: 36px; padding: 0 8px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-search-panel__head-actions button:hover { background: var(--surface-workbench-muted); color: var(--text-primary); }
.authoring-search-panel__head-actions .authoring-search-panel__return { font-size: 12px; }

.authoring-search-panel__query { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 12px 18px 10px; }
.authoring-search-panel__query label { display: flex; min-width: 0; min-height: 40px; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid var(--border-subtle); background: var(--surface-primary); color: var(--text-tertiary, var(--text-secondary)); }
.authoring-search-panel__query label:focus-within { border-color: var(--accent-primary); color: var(--text-secondary); }
.authoring-search-panel__query input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); }
.authoring-search-panel__query > button,
.authoring-search-panel__replace-actions button,
.authoring-search-panel__preview button { min-height: 40px; padding: 0 14px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-primary); cursor: pointer; }
.authoring-search-panel__query > button { border-color: var(--accent-primary); color: var(--accent-primary); }

.authoring-search-panel__scopes { display: flex; flex: 0 0 auto; gap: 2px; padding: 0 18px; border-bottom: 1px solid var(--border-subtle); }
.authoring-search-panel__scopes button { position: relative; min-height: 38px; padding: 0 13px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-search-panel__scopes button::after { position: absolute; inset-inline: 10px; inset-block-end: -1px; height: 2px; background: transparent; content: ''; }
.authoring-search-panel__scopes button.is-active { color: var(--text-primary); font-weight: 600; }
.authoring-search-panel__scopes button.is-active::after { background: var(--accent-primary); }

.authoring-search-panel__status { display: flex; min-height: 34px; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; padding: 0 18px; color: var(--text-secondary); font-size: 11px; }
.authoring-search-panel__status small { color: var(--text-tertiary, var(--text-secondary)); }
.authoring-search-panel__notice { margin: 0; padding: 8px 18px; border-block: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.authoring-search-panel__notice.is-error { color: var(--signal-danger); }

.authoring-search-panel__results { min-height: 0; flex: 1 1 auto; overflow: auto; border-top: 1px solid var(--border-subtle); }
.authoring-search-result { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; border-bottom: 1px solid var(--border-subtle); }
.authoring-search-result::before { position: absolute; inset-block: 0; inset-inline-start: 0; width: 2px; background: transparent; content: ''; }
.authoring-search-result.is-active::before { background: var(--accent-primary); }
.authoring-search-result.is-stale { opacity: .58; }
.authoring-search-result__open { display: grid; min-width: 0; gap: 6px; padding: 11px 10px 12px 18px; border: 0; background: transparent; color: var(--text-primary); text-align: start; cursor: pointer; }
.authoring-search-result__open:hover { background: var(--surface-workbench-muted); }
.authoring-search-result__meta { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 12px; }
.authoring-search-result__meta strong { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.authoring-search-result__meta small { flex: 0 0 auto; color: var(--text-tertiary, var(--text-secondary)); font-size: 10px; }
.authoring-search-result__excerpt { overflow: hidden; color: var(--text-secondary); font-family: var(--font-serif, serif); font-size: 13px; line-height: 1.65; text-overflow: ellipsis; white-space: nowrap; }
.authoring-search-result__excerpt mark { padding: 0 1px; background: color-mix(in srgb, var(--accent-primary) 16%, transparent); color: var(--text-primary); }
.authoring-search-result__replace { align-self: center; min-height: 32px; margin-inline-end: 12px; padding: 0 8px; border: 0; background: transparent; color: var(--accent-primary); font-size: 11px; cursor: pointer; }

.authoring-search-panel__empty { display: grid; min-height: 170px; flex: 1 1 auto; place-content: center; padding: 28px; text-align: center; }
.authoring-search-panel__empty strong { font-size: 14px; font-weight: 600; }
.authoring-search-panel__empty p { margin: 7px 0 0; color: var(--text-secondary); font-size: 12px; }

.authoring-search-panel__replace-box { flex: 0 0 auto; padding: 10px 18px 12px; border-top: 1px solid var(--border-subtle); background: var(--surface-workbench-raised, var(--surface-primary)); }
.authoring-search-panel__replace-box > label { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; }
.authoring-search-panel__replace-box > label span { color: var(--text-secondary); font-size: 12px; }
.authoring-search-panel__replace-box > label input { min-width: 0; min-height: 38px; padding: 0 10px; border: 1px solid var(--border-subtle); outline: 0; background: var(--surface-primary); color: var(--text-primary); }
.authoring-search-panel__replace-box > label input:focus { border-color: var(--accent-primary); }
.authoring-search-panel__replace-actions,
.authoring-search-panel__preview { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 9px; }
.authoring-search-panel__replace-actions small,
.authoring-search-panel__preview p { margin: 0; color: var(--text-secondary); font-size: 11px; }
.authoring-search-panel__preview > div { display: flex; gap: 6px; }
.authoring-search-panel__preview button.is-primary { border-color: var(--accent-primary); color: var(--accent-primary); }

.authoring-search-panel button:focus-visible,
.authoring-search-panel input:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent-primary) 72%, transparent); outline-offset: 2px; }
.authoring-search-panel button:disabled { opacity: .4; cursor: default; }
.authoring-search-panel-enter-active,
.authoring-search-panel-leave-active { transition: opacity .14s ease, transform .14s ease; }
.authoring-search-panel-enter-from,
.authoring-search-panel-leave-to { opacity: 0; transform: translate(-50%, -6px); }

@media (prefers-reduced-motion: reduce) {
  .authoring-search-panel-enter-active,
  .authoring-search-panel-leave-active { transition: none; }
}

@media (max-width: 720px) {
  .authoring-search-panel { inset: 0; width: auto; max-width: none; max-height: none; min-height: 0; transform: none; border: 0; box-shadow: none; }
  .authoring-search-panel__head { min-height: 58px; padding-block-start: max(9px, env(safe-area-inset-top)); }
  .authoring-search-panel__head-actions button,
  .authoring-search-panel__query > button,
  .authoring-search-panel__scopes button,
  .authoring-search-result__replace,
  .authoring-search-panel__replace-actions button,
  .authoring-search-panel__preview button { min-height: 44px; }
  .authoring-search-panel__query { padding-inline: 12px; }
  .authoring-search-panel__query label { min-height: 44px; }
  .authoring-search-panel__scopes { padding-inline: 8px; }
  .authoring-search-panel__scopes button { flex: 1 1 25%; padding-inline: 4px; }
  .authoring-search-result { grid-template-columns: minmax(0, 1fr); }
  .authoring-search-result__open { padding-inline: 14px; }
  .authoring-search-result__replace { justify-self: end; margin: -4px 10px 5px 0; }
  .authoring-search-panel__replace-box { padding-inline: 12px; padding-block-end: max(12px, env(safe-area-inset-bottom)); }
  .authoring-search-panel-enter-from,
  .authoring-search-panel-leave-to { transform: translateY(8px); }
}
</style>
