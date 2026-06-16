<template>
  <div
    v-if="state !== 'idle'"
    class="generation-status"
    :class="`is-${state}`"
    role="status"
    aria-live="polite"
  >
    <span class="status-dot" aria-hidden="true"></span>
    <span class="status-text">{{ message }}</span>
    <button
      v-if="canRetry"
      type="button"
      class="status-retry"
      @click="$emit('retry')"
    >重试</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  state: { type: String, default: 'idle' }, // idle | pending | success | error | aborted
  progress: { type: String, default: '' },  // e.g. "3/6"
  error: { type: String, default: '' }
})

defineEmits(['retry'])

const canRetry = computed(() => props.state === 'error')

const message = computed(() => {
  switch (props.state) {
    case 'pending': return `生成中…${props.progress ? ` ${props.progress}` : ''}`
    case 'success': return '已生成'
    case 'error': return `生成失败${props.error ? `：${props.error}` : ''}`
    case 'aborted': return '已中止'
    default: return ''
  }
})
</script>

<style scoped>
.generation-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.35;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.generation-status.is-pending .status-dot {
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}

.generation-status.is-success {
  border-color: color-mix(in srgb, var(--success) 34%, var(--border));
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.generation-status.is-success .status-dot {
  background: var(--success);
}

.generation-status.is-error {
  border-color: color-mix(in srgb, var(--danger) 38%, var(--border));
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
}

.generation-status.is-error .status-dot {
  background: var(--danger);
}

.generation-status.is-aborted {
  background: color-mix(in srgb, var(--surface-raised) 90%, transparent);
  color: var(--text-muted);
}

.status-retry {
  margin-left: auto;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 7px;
  cursor: pointer;
}

.status-retry:hover {
  background: currentColor;
  color: var(--bg-primary);
}

.status-retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
