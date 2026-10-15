<script setup>
import { computed } from 'vue'
import { MessageSquare } from 'lucide-vue-next'

const props = defineProps({
  caption: { type: String, default: '顾问' },
  launcherTitle: { type: String, default: '' },
  pendingCount: { type: Number, default: 0 }
})
const emit = defineEmits(['open'])
const label = computed(() => props.launcherTitle || props.caption)
</script>

<template>
  <div class="gm-persona-dock" @click.stop>
    <button
      class="gm-persona-launcher"
      data-transient-trigger="advisor-review"
      type="button"
      :title="label"
      :aria-label="label"
      aria-haspopup="dialog"
      @click="emit('open')"
    >
      <MessageSquare :size="18" :stroke-width="1.65" aria-hidden="true" />
      <span>{{ caption }}</span>
      <span v-if="pendingCount > 0" class="gm-persona-pending" role="status">
        {{ pendingCount > 9 ? '9+' : pendingCount }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.gm-persona-dock {
  position: fixed;
  right: 18px;
  bottom: 20px;
  z-index: var(--z-floating-action, 260);
}
.gm-persona-launcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-workbench-raised);
  color: var(--text-secondary);
  box-shadow: var(--shadow-floating);
  font: 500 14px/1.4 var(--font-sans);
  cursor: pointer;
}
.gm-persona-launcher:hover {
  background: var(--nav-hover);
  color: var(--text-primary);
}
.gm-persona-launcher:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.gm-persona-pending {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}
@media (max-width: 720px), (pointer: coarse) {
  .gm-persona-dock { right: 12px; bottom: 12px; }
  .gm-persona-launcher { min-height: 44px; }
}
</style>
