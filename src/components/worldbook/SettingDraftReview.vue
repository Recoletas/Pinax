<template>
  <section
    v-if="draft"
    class="setting-draft-review"
    role="region"
    :aria-label="`AI 草稿：${draft.fieldLabel}`"
    tabindex="-1"
    @keydown.esc.stop="$emit('close')"
  >
    <div class="draft-head">
      <div>
        <p class="draft-kicker">AI 草稿</p>
        <h3>{{ draft.fieldLabel }}</h3>
      </div>
      <div class="draft-head-actions">
        <button
          type="button"
          class="review-close-btn"
          aria-label="关闭草稿审阅"
          title="关闭草稿审阅"
          @click="$emit('close')"
        >
          <WorkbenchIcon name="close" :size="15" />
        </button>
        <button type="button" class="ghost-btn small" @click="$emit('discard')">丢弃</button>
      </div>
    </div>

    <GenerationStatus
      v-if="status"
      :state="status.state"
      :progress="status.progress"
      :error="status.error"
      @retry="$emit('retry')"
    />

    <textarea
      class="text-area"
      rows="8"
      :value="draft.content"
      @input="$emit('update:content', $event.target.value)"
    ></textarea>

    <details v-if="sourceCandidateGroups.length || sourceCandidateError" class="source-candidate-review">
      <summary>
        <span>来源候选<span v-if="draft.sourceCandidates?.length"> · {{ draft.sourceCandidates.length }} 条</span></span>
        <span v-if="sourceCandidateError" class="candidate-summary-mark is-error">提取未完成</span>
        <span v-else-if="sourceCandidateGroups.some((group) => group.possibleDuplicate)" class="candidate-summary-mark">
          有同名提示
        </span>
      </summary>
      <p v-if="sourceCandidateError" class="source-candidate-error">{{ sourceCandidateError }}</p>
      <p class="source-candidate-note">仅按名称与别名提示可能重复，未自动合并；每条事实仍保留自己的证据和来源。</p>
      <div class="source-candidate-list">
        <div v-for="group in sourceCandidateGroups" :key="group.id" class="source-candidate-group">
          <div class="source-candidate-group__head">
            <span class="candidate-type">{{ entryTypeLabel(group.type) }}</span>
            <strong>{{ group.displayName }}</strong>
            <span v-if="group.possibleDuplicate" class="candidate-duplicate">{{ group.variants.length }} 条待核对</span>
          </div>
          <div v-for="(variant, index) in group.variants" :key="`${group.id}-${index}`" class="source-candidate-variant">
            <p>{{ variant.content }}</p>
            <small>证据：{{ variant.evidence }}</small>
            <small>来源：{{ variant.sourceIds.join('、') }}</small>
          </div>
        </div>
      </div>
    </details>

    <div class="revision-editor">
      <div class="revision-editor__head">
        <div>
          <strong>修改意见</strong>
          <span>保留、删除或补充的内容都写在这里</span>
        </div>
        <span v-if="revisionHistory.length > 1" class="revision-index">
          {{ revisionIndex + 1 }} / {{ revisionHistory.length }}
        </span>
      </div>
      <textarea
        class="revision-input"
        rows="3"
        :value="revisionInstruction"
        placeholder="例如：保留潮汐和旧灯塔，删除神明部分，补充三个关键历史阶段。"
        :disabled="revisionWorking"
        @input="$emit('update:revision-instruction', $event.target.value)"
      ></textarea>
      <div v-if="revisionError" class="revision-error" role="status">{{ revisionError }}</div>
      <div class="revision-actions">
        <button
          type="button"
          class="ghost-btn small"
          :disabled="revisionWorking || revisionIndex <= 0"
          @click="$emit('previous-revision')"
        >上一版</button>
        <button
          type="button"
          class="ghost-btn small"
          :disabled="revisionWorking || revisionIndex >= revisionHistory.length - 1"
          @click="$emit('next-revision')"
        >下一版</button>
        <button
          type="button"
          class="revision-submit primary-btn"
          :disabled="revisionWorking || !revisionInstruction.trim()"
          @click="$emit('revise')"
        >{{ revisionWorking ? '修订中…' : '按意见修订' }}</button>
      </div>
    </div>

    <details v-if="hasDiff" class="diff-preview">
      <summary>查看差异（行级）</summary>
      <ul class="diff-list">
        <li
          v-for="(op, idx) in diffLines"
          :key="idx"
          :class="`diff-${op.type}`"
        >
          <span class="diff-marker" aria-hidden="true">{{ marker(op.type) }}</span>
          <span class="diff-text">{{ op.text }}</span>
        </li>
      </ul>
    </details>

    <details class="prompt-preview">
      <summary>查看本次提示词</summary>
      <pre>{{ draft.promptPreview }}</pre>
    </details>

    <div class="card-actions">
      <button class="primary-btn" @click="onAdopt">采纳到世界书</button>
      <button
        v-if="canImportToExperience"
        type="button"
        class="ghost-btn"
        @click="$emit('import-to-experience')"
      >导入体验</button>
      <button class="ghost-btn" @click="$emit('copy')">复制</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import GenerationStatus from './GenerationStatus.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { groupSettingCandidates } from '../../../shared/structuredSettingCandidateContract'

const props = defineProps({
  draft: { type: Object, default: null },
  currentFieldValue: { type: String, default: '' },
  status: { type: Object, default: null }, // { state, progress, error }
  revisionInstruction: { type: String, default: '' },
  revisionWorking: { type: Boolean, default: false },
  revisionError: { type: String, default: '' },
  revisionHistory: { type: Array, default: () => [] },
  revisionIndex: { type: Number, default: 0 },
  sourceCandidateError: { type: String, default: '' },
  canImportToExperience: { type: Boolean, default: false }
})

const sourceCandidateGroups = computed(() => groupSettingCandidates(props.draft?.sourceCandidates || []))

const entryTypeLabels = Object.freeze({
  lore: '设定',
  character: '角色',
  location: '地点',
  organization: '势力',
  event: '事件',
  item: '物件',
  rule: '规则',
  quest: '任务'
})

function entryTypeLabel(type) {
  return entryTypeLabels[type] || type || '候选'
}

const emit = defineEmits([
  'close',
  'discard',
  'update:content',
  'save-field',
  'copy',
  'import-to-experience',
  'retry',
  'update:revision-instruction',
  'revise',
  'previous-revision',
  'next-revision'
])

// 行级 LCS diff（O(m*n)，短文本足够）
function diffLinesImpl(before, after) {
  const a = String(before || '').split('\n')
  const b = String(after || '').split('\n')
  const m = a.length, n = b.length
  if (m === 0 && n === 0) return []
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'same', text: a[i - 1] })
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ type: 'del', text: a[i - 1] })
      i--
    } else {
      ops.unshift({ type: 'add', text: b[j - 1] })
      j--
    }
  }
  while (i > 0) { ops.unshift({ type: 'del', text: a[i - 1] }); i-- }
  while (j > 0) { ops.unshift({ type: 'add', text: b[j - 1] }); j-- }
  return ops
}

const diffLines = computed(() => {
  if (!props.draft) return []
  return diffLinesImpl(props.currentFieldValue, props.draft.content)
})

const hasDiff = computed(() => diffLines.value.some((op) => op.type !== 'same'))

function marker(type) {
  if (type === 'add') return '+'
  if (type === 'del') return '-'
  return ' '
}

function onAdopt() {
  if (!props.draft) return
  const current = String(props.currentFieldValue || '').trim()
  const incoming = String(props.draft.content || '').trim()
  if (current && current !== incoming) {
    const confirmed = window.confirm('当前设定项已有内容，采纳将更新对应世界书条目。继续？')
    if (!confirmed) return
  }
  emit('save-field')
}
</script>

<style scoped>
.setting-draft-review {
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 38%),
    color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary));
  box-shadow: 0 12px 28px color-mix(in srgb, #000 7%, transparent);
}

.draft-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.draft-head-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
}

.review-close-btn {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.review-close-btn:hover,
.review-close-btn:focus-visible {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}

.review-close-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.draft-kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-muted) 82%, var(--accent));
}

.draft-head h3 {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-primary);
}

.text-area {
  width: 100%;
  min-height: 180px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-primary);
  padding: 11px;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.text-area:focus {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

.source-candidate-review {
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  padding-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.source-candidate-review summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  color: var(--text-primary);
  font-weight: 650;
}

.candidate-summary-mark,
.candidate-duplicate {
  color: color-mix(in srgb, var(--accent) 78%, var(--text-secondary));
  font-size: 11px;
  font-weight: 600;
}

.candidate-summary-mark.is-error,
.source-candidate-error {
  color: var(--danger);
}

.source-candidate-note {
  margin: 8px 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.source-candidate-error {
  margin: 8px 0 0;
  line-height: 1.45;
}

.source-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 250px;
  overflow: auto;
}

.source-candidate-group {
  padding-left: 9px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 38%, var(--border));
}

.source-candidate-group__head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-wrap: wrap;
}

.source-candidate-group__head strong {
  color: var(--text-primary);
  font-size: 12px;
}

.candidate-type {
  color: var(--accent);
  font-size: 10px;
  letter-spacing: .04em;
}

.source-candidate-variant {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
}

.source-candidate-variant p {
  margin: 0 0 3px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.source-candidate-variant small {
  display: block;
  color: var(--text-muted);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.revision-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.revision-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.revision-editor__head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.revision-editor__head strong {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.3;
}

.revision-editor__head span:not(.revision-index) {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.revision-index {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  padding-top: 1px;
}

.revision-input {
  width: 100%;
  min-height: 76px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
  color: var(--text-primary);
  padding: 9px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
}

.revision-input::placeholder {
  color: var(--text-muted);
  opacity: 0.8;
}

.revision-input:focus {
  border-color: color-mix(in srgb, var(--accent) 64%, var(--border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

.revision-input:disabled {
  cursor: wait;
  opacity: 0.68;
}

.revision-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.revision-error {
  color: var(--danger);
  font-size: 12px;
  line-height: 1.45;
}

.revision-submit {
  min-height: 32px;
}

.prompt-preview,
.diff-preview {
  font-size: 12px;
  color: var(--text-secondary);
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 64%, transparent);
  overflow: hidden;
}

.prompt-preview summary,
.diff-preview summary {
  cursor: pointer;
  user-select: none;
  padding: 9px 11px;
  font-weight: 650;
}

.prompt-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  max-height: 200px;
  overflow: auto;
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  padding: 10px;
  border-radius: 0;
}

.diff-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 0;
  overflow: hidden;
  max-height: 200px;
  overflow-y: auto;
}

.diff-list li {
  display: flex;
  gap: 6px;
  padding: 3px 9px;
  line-height: 1.4;
}

.diff-marker {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  font-weight: 700;
}

.diff-add {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}

.diff-add .diff-marker {
  color: var(--success);
}

.diff-del {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.diff-del .diff-marker {
  color: var(--danger);
}

.diff-same {
  color: var(--text-muted);
}

.diff-same .diff-marker {
  color: var(--text-muted);
  opacity: 0.5;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}
</style>
