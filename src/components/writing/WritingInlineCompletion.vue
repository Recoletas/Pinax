<template>
  <div
    v-if="generating || visible || canUndo || error"
    class="writing-inline-agent"
    :style="style"
    role="status"
    aria-live="polite"
  >
    <span v-if="generating" class="writing-inline-agent__status">
      <span class="writing-inline-agent__spinner" aria-hidden="true"></span>
      正在补全
    </span>
    <span v-else-if="visible" class="writing-inline-agent__status">
      <strong>内联建议</strong>
      <span v-if="matchedCount">命中 {{ matchedCount }} 条设定</span>
      <kbd>Tab</kbd>
    </span>
    <span v-else-if="canUndo" class="writing-inline-agent__status">已写入正文</span>
    <span v-else class="writing-inline-agent__status is-error">
      {{ coolingDown ? '补全已暂停，稍后再试' : error }}
    </span>

    <div class="writing-inline-agent__actions">
      <button v-if="visible" type="button" @mousedown.prevent @click="$emit('accept-unit')">采纳一句</button>
      <button v-if="visible" type="button" @mousedown.prevent @click="$emit('accept-all')">全部采纳</button>
      <button v-if="visible" type="button" @mousedown.prevent @click="$emit('retry')">重试</button>
      <button v-if="canUndo && !visible && !generating" type="button" @mousedown.prevent @click="$emit('undo')">撤销本次</button>
      <button v-if="error && !generating" type="button" @mousedown.prevent @click="$emit('retry')">重试</button>
      <button v-if="generating || visible" type="button" class="is-quiet" @mousedown.prevent @click="$emit('dismiss')">
        {{ generating ? '停止' : '忽略' }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  generating: Boolean,
  visible: Boolean,
  canUndo: Boolean,
  error: { type: String, default: '' },
  coolingDown: Boolean,
  matchedCount: { type: Number, default: 0 },
  style: { type: Object, default: () => ({}) }
})

defineEmits(['accept-unit', 'accept-all', 'retry', 'undo', 'dismiss'])
</script>

<style scoped>
.writing-inline-agent {
  position: fixed;
  z-index: var(--z-popover, 100);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 7px 8px 7px 12px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft) 28%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 96%, transparent);
  box-shadow: 0 5px 18px color-mix(in srgb, #000 9%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
}

.writing-inline-agent__status,
.writing-inline-agent__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.writing-inline-agent__status strong {
  color: var(--text-primary);
  font-weight: 650;
}

.writing-inline-agent__status.is-error {
  color: var(--text-muted);
}

.writing-inline-agent__status kbd {
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font: inherit;
}

.writing-inline-agent__spinner {
  width: 11px;
  height: 11px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: writing-agent-spin 0.8s linear infinite;
}

.writing-inline-agent button {
  border: 0;
  background: transparent;
  color: var(--accent);
  padding: 3px 5px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.writing-inline-agent button:hover,
.writing-inline-agent button:focus-visible {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  outline: none;
}

.writing-inline-agent button.is-quiet {
  color: var(--text-muted);
}

@keyframes writing-agent-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .writing-inline-agent {
    left: 12px !important;
    right: 12px !important;
    bottom: 12px !important;
    flex-wrap: wrap;
  }

}

@media (prefers-reduced-motion: reduce) {
  .writing-inline-agent__spinner {
    animation: none;
  }
}
</style>
