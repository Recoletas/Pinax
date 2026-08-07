<template>
  <Transition name="narrative-status">
    <div
      v-if="view.visible"
      class="narrative-agent-status"
      :class="{ 'is-error': view.isError }"
      :data-phase="view.phase"
      :role="view.isError ? 'alert' : 'status'"
      :aria-live="view.isError ? 'assertive' : 'polite'"
    >
      <span class="narrative-agent-status__signal" aria-hidden="true"></span>
      <span class="narrative-agent-status__label">{{ view.label }}</span>
      <span v-if="view.meta" class="narrative-agent-status__meta">{{ view.meta }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: Object, default: null }
})

const PHASE_LABELS = {
  deciding: '核对当前场景',
  'executing-tools': '查阅相关资料',
  'tools-complete': '资料已就绪',
  ready: '准备续写',
  streaming: '续写现场',
  complete: '正文已生成'
}

const view = computed(() => {
  const status = props.status && typeof props.status === 'object' ? props.status : null
  const phase = String(status?.phase || '').trim()
  if (!status || !phase) {
    return { visible: false, phase: '', label: '', meta: '', isError: false }
  }

  const isError = phase === 'error'
  const rounds = Math.max(0, Number(status.toolRounds) || 0)
  const calls = Math.max(0, Number(status.totalCalls ?? status.callCount) || 0)
  let meta = ''
  if (!isError && rounds > 0) {
    meta = calls > 0 ? `${rounds} 轮 · ${calls} 项` : `${rounds} 轮`
  }

  return {
    visible: true,
    phase,
    label: isError
      ? String(status.message || '生成失败，请稍后重试').trim()
      : (PHASE_LABELS[phase] || '整理当前现场'),
    meta,
    isError
  }
})
</script>

<style scoped>
.narrative-agent-status {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  margin: 0 clamp(28px, 6vw, 72px);
  padding: 5px 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink-soft) 14%, transparent);
  color: color-mix(in srgb, var(--archive-ink-soft) 86%, transparent);
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 1.45;
}

.narrative-agent-status__signal {
  width: 5px;
  height: 5px;
  flex: 0 0 5px;
  background: color-mix(in srgb, var(--experience-signal-cool, var(--archive-olive)) 72%, var(--archive-olive));
  transform: rotate(45deg);
  animation: narrative-agent-pulse 1.4s ease-in-out infinite;
}

.narrative-agent-status__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 620;
}

.narrative-agent-status__meta {
  flex: 0 0 auto;
  margin-left: auto;
  color: color-mix(in srgb, var(--archive-ink-soft) 64%, transparent);
  font-variant-numeric: tabular-nums;
}

.narrative-agent-status.is-error {
  color: color-mix(in srgb, var(--accent-rose) 72%, var(--archive-ink));
}

.narrative-agent-status.is-error .narrative-agent-status__signal {
  background: color-mix(in srgb, var(--accent-rose) 74%, var(--archive-ink));
  animation: none;
}

.narrative-status-enter-active,
.narrative-status-leave-active {
  transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease;
}

.narrative-status-enter-from,
.narrative-status-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

@keyframes narrative-agent-pulse {
  0%,
  100% { opacity: 0.42; }
  50% { opacity: 1; }
}

@media (max-width: 640px) {
  .narrative-agent-status {
    margin: 0 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .narrative-agent-status__signal {
    animation: none;
  }

  .narrative-status-enter-active,
  .narrative-status-leave-active {
    transition: none;
  }
}
</style>
