<template>
  <header class="settings-context-bar" data-test="settings-context-bar">
    <div class="context-main">
      <span class="context-kicker">ACTIVE WORLD</span>
      <select
        v-if="worldbooksIndex.length"
        class="context-worldbook-select"
        :value="selectedId"
        :disabled="disabled"
        aria-label="选择当前世界书"
        @change="onChange"
      >
        <option v-for="worldbook in worldbooksIndex" :key="worldbook.id" :value="worldbook.id">
          {{ worldbook.name }}
        </option>
      </select>
      <strong v-else class="context-worldbook-empty">{{ activeWorldbook?.name || emptyLabel }}</strong>
    </div>

    <div v-if="showMeta" class="context-meta" aria-label="设定页信息">
      <span class="context-meta-item"><i aria-hidden="true"></i>{{ metaLabel }}</span>
      <span class="context-meta-divider" aria-hidden="true"></span>
      <span class="context-meta-item">{{ saveLabel }}</span>
    </div>

    <slot name="actions" />
  </header>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  worldbooksIndex: { type: Array, default: () => [] },
  activeWorldbook: { type: Object, default: null },
  modelValue: { type: [String, Number], default: '' },
  metaLabel: { type: String, default: '' },
  saveLabel: { type: String, default: '自动保存' },
  emptyLabel: { type: String, default: '尚未选择世界书' },
  showMeta: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'change'])

const selectedId = computed(() => String(props.modelValue || props.activeWorldbook?.id || ''))
const metaLabel = computed(() => props.metaLabel || `${props.worldbooksIndex.length} 本世界书`)

function onChange(event) {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.settings-context-bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px clamp(16px, 3vw, 42px);
  border-right: 1px solid color-mix(in srgb, var(--archive-olive) 15%, transparent);
  background: transparent;
  flex-shrink: 0;
}

.context-main,
.context-meta {
  display: flex;
  align-items: center;
  min-width: 0;
}

.context-main {
  gap: 10px;
}

.context-meta {
  gap: 10px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.context-meta-divider {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 60%, var(--border));
}

.context-meta-item i {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 10%, transparent);
}

.context-kicker {
  color: var(--text-muted);
  font-size: 9px;
  letter-spacing: 0.1em;
  line-height: 1;
}

.context-worldbook-select,
.context-worldbook-empty {
  max-width: min(30vw, 260px);
  min-width: 120px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
}

.context-worldbook-select {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 44%, var(--border));
  border-radius: 0;
  background: transparent;
  padding: 6px 22px 6px 2px;
  cursor: pointer;
}

.context-worldbook-select:disabled {
  cursor: default;
  opacity: 0.7;
}

.context-worldbook-empty {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .settings-context-bar {
    min-height: 46px;
    gap: 10px;
    padding-block: 6px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 13%, transparent);
  }

  .context-main {
    width: 100%;
  }

  .context-meta-divider,
  .context-meta-item:last-child {
    display: none;
  }

  .context-worldbook-select,
  .context-worldbook-empty {
    max-width: 48vw;
    min-width: 104px;
    font-size: 14px;
  }
}
</style>
