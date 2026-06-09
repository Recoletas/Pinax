<template>
  <section
    v-if="draft"
    class="setting-draft-review"
    role="region"
    :aria-label="`AI 草稿：${draft.fieldLabel}`"
  >
    <div class="draft-head">
      <div>
        <p class="draft-kicker">AI 草稿</p>
        <h3>{{ draft.fieldLabel }}</h3>
      </div>
      <button class="ghost-btn small" @click="$emit('discard')">丢弃</button>
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
      <button class="primary-btn" @click="onAdopt">采纳到字段</button>
      <button class="ghost-btn" @click="$emit('convert-entry')">转为世界书条目</button>
      <button class="ghost-btn" @click="$emit('copy')">复制</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import GenerationStatus from './GenerationStatus.vue'

const props = defineProps({
  draft: { type: Object, default: null },
  currentFieldValue: { type: String, default: '' },
  status: { type: Object, default: null } // { state, progress, error }
})

const emit = defineEmits(['discard', 'update:content', 'save-field', 'convert-entry', 'copy', 'retry'])

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
    const confirmed = window.confirm('当前字段已有内容，采纳将覆盖。继续？')
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
