<template>
  <nav class="my-worldbooks" aria-label="我的世界书">
    <div class="my-worldbooks__heading">
      <WorkbenchIcon name="book" :size="16" />
      <span class="my-worldbooks__label">我的世界书</span>
      <span class="my-worldbooks__count">{{ worldbooksIndex.length }}</span>
    </div>
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
    <div class="my-worldbooks__actions">
      <button type="button" class="my-worldbooks__btn" data-test="btn-new" @click="$emit('advanced', 'new')">
        <WorkbenchIcon name="bookmark-plus" :size="14" />
        <span>新建</span>
      </button>
      <button type="button" class="my-worldbooks__btn" data-test="btn-manage" @click="$emit('advanced', 'manage')">
        <WorkbenchIcon name="settings" :size="14" />
        <span>管理</span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

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

</script>

<style scoped>
.my-worldbooks {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 0;
  /* Pin the 选世界书 picker to the top of its scroll container
     (.quick-page__body has overflow: auto) so the 切换 / 新建 / 管理
     controls stay reachable while the user browses the preset grid
     below. Opaque background prevents the scrolling content from
     bleeding through under the picker. */
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--archive-paper);
  /* W5 UX sweep: 1px dashed 撕边 + 浅阴影 give the picker a visible
     separation from the preset-grid cards scrolling underneath. Without
     this, content slides under the opaque background and the bottom
     edge of the picker visually merges with the next card row. */
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-olive) 22%, transparent);
  box-shadow: 0 4px 8px color-mix(in srgb, var(--archive-ink) 6%, transparent);
}

/* Legacy 主题 (.theme-legacy) 同样需要 opaque 背景, 否则 Material 蓝白
   主题下 preset grid 滚动时会从 picker 后面露出来. */
.theme-legacy .my-worldbooks {
  background: var(--bg-secondary);
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

/* Theme 2 sidebar selector: one picker, two quiet commands. */
.theme-legacy .my-worldbooks {
  position: static;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 14%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-strong) 28%, var(--archive-paper-soft));
  box-shadow: none;
}

.my-worldbooks__heading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--archive-ink);
}

.theme-legacy .my-worldbooks__label {
  color: var(--archive-ink);
  font-size: 12px;
  font-weight: 700;
}

.my-worldbooks__count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--archive-gold) 16%, transparent);
  color: var(--archive-ink-soft);
  font: 600 10px/1 var(--font-mono);
}

.theme-legacy .my-worldbooks__select {
  min-width: 0;
  max-width: none;
  height: 36px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 30%, var(--border));
  background-color: transparent;
  font-size: 13px;
}

.my-worldbooks__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.theme-legacy .my-worldbooks__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
  padding: 0 7px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
}

.theme-legacy .my-worldbooks__btn:hover {
  border-bottom-color: var(--accent);
  background: transparent;
  color: var(--accent);
}

@media (max-width: 480px) {
  .theme-legacy .my-worldbooks {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .my-worldbooks__heading,
  .my-worldbooks__actions { grid-column: 1; }
}
</style>
