<template>
  <nav class="my-worldbooks" aria-label="我的世界书">
    <span class="my-worldbooks__label">我的世界书</span>
    <select
      class="my-worldbooks__select"
      :value="selectedId"
      data-test="my-worldbooks-select"
      @change="onSelect"
    >
      <option v-if="!worldbooksIndex.length" value="" disabled>暂无世界书</option>
      <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
        {{ wb.name }} ({{ wb.entryCount || 0 }} 条目)
      </option>
    </select>
    <button type="button" class="my-worldbooks__btn" data-test="btn-focus" @click="focusSelect">切换</button>
    <button type="button" class="my-worldbooks__btn" data-test="btn-new" @click="$emit('advanced', 'new')">新建 +</button>
    <button type="button" class="my-worldbooks__btn" data-test="btn-manage" @click="$emit('advanced', 'manage')">管理 →</button>
  </nav>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  worldbooksIndex: { type: Array, required: true },
  activeWorldbook: { type: Object, default: null }
})

const emit = defineEmits(['change', 'advanced'])

const selectedId = ref(props.activeWorldbook?.id || '')

watch(() => props.activeWorldbook?.id, (next) => {
  selectedId.value = next || ''
})

function onSelect(event) {
  const next = event.target.value
  selectedId.value = next
  emit('change', next)
}

function focusSelect() {
  const root = document.querySelector('.my-worldbooks__select')
  if (root) root.focus()
}
</script>

<style scoped>
.my-worldbooks {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 0;
}

.my-worldbooks__label {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--archive-ink-soft);
  font-weight: 600;
}

.my-worldbooks__select {
  flex: 1 1 240px;
  min-width: 200px;
  max-width: 360px;
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 0;
  background: var(--archive-paper);
  color: var(--archive-ink);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  font-size: 13px;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--archive-ink) 64%, transparent) 50%),
    linear-gradient(135deg, color-mix(in srgb, var(--archive-ink) 64%, transparent) 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 8px) 50%;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  cursor: pointer;
}

.my-worldbooks__select:focus {
  outline: none;
  border-color: var(--archive-olive);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--archive-olive) 22%, transparent);
}

.my-worldbooks__btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.my-worldbooks__btn:hover {
  border-color: var(--archive-olive);
  color: var(--archive-olive-strong);
  background: color-mix(in srgb, var(--archive-paper) 60%, transparent);
}

/* Legacy 主题: 用 Material 蓝白 chip */
.theme-legacy .my-worldbooks__label {
  color: var(--text-muted);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  letter-spacing: 0.02em;
  text-transform: none;
}

.theme-legacy .my-worldbooks__select,
.theme-legacy .my-worldbooks__btn {
  background: var(--bg-secondary);
  border-color: var(--border);
  color: var(--text-primary);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  background-image: linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%),
    linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 8px) 50%;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
}

.theme-legacy .my-worldbooks__btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-light, transparent) 24%, transparent);
}

@media (max-width: 760px) {
  .my-worldbooks__select {
    flex: 1 1 100%;
    max-width: none;
  }
}
</style>