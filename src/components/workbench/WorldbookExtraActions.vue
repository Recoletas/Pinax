<template>
  <footer class="quick-extra">
    <div class="quick-extra__heading">
      <span>建立与整理</span>
      <small>WORLD TOOLS</small>
    </div>
    <div class="quick-extra__row">
      <button
        type="button"
        class="extra-btn is-primary"
        data-test="extra-btn-structured"
        @click="$emit('structured')"
      >
        <WorkbenchIcon name="network" :size="15" />
        <span>编辑结构化设定</span>
        <WorkbenchIcon class="extra-btn__arrow" name="arrow-right" :size="13" />
      </button>
      <button
        type="button"
        class="extra-btn"
        data-test="extra-btn-import"
        @click="$emit('import')"
      >
        <WorkbenchIcon name="download" :size="15" />
        <span>导入小说 / JSON</span>
        <WorkbenchIcon class="extra-btn__arrow" name="arrow-right" :size="13" />
      </button>
      <button
        type="button"
        class="extra-btn"
        data-test="extra-btn-ai"
        @click="$emit('ai')"
      >
        <WorkbenchIcon name="sparkles" :size="15" />
        <span>AI 建立基调</span>
        <WorkbenchIcon class="extra-btn__arrow" name="arrow-right" :size="13" />
      </button>
    </div>
  </footer>
</template>

<script setup>
import WorkbenchIcon from './WorkbenchIcon.vue'

defineEmits(['structured', 'import', 'ai'])
</script>

<style scoped>
.quick-extra {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.quick-extra__divider {
  margin: 0;
  border: none;
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 22%, var(--border));
}

.quick-extra__row {
  display: flex;
  gap: 12px;
  padding: 4px 0;
}

.extra-btn {
  flex: 1 1 0;
  min-width: 0;
  height: 36px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.extra-btn:hover {
  border-color: var(--archive-olive);
  color: var(--archive-olive-strong);
  background: color-mix(in srgb, var(--archive-paper) 60%, transparent);
}

.theme-legacy .extra-btn {
  background: var(--bg-secondary);
  border-color: var(--border);
  color: var(--text-primary);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  border-radius: 4px;
}

.theme-legacy .extra-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-light, transparent) 20%, transparent);
}

.theme-legacy .extra-btn.is-primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-secondary));
  color: var(--text-primary);
  font-weight: 650;
}

.theme-legacy .quick-extra__divider {
  border-top-color: var(--border);
}

@media (max-width: 760px) {
  .extra-btn {
    flex: 1 1 100%;
  }
}

.quick-extra__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 16%, var(--border));
  color: var(--archive-ink);
  font-size: 12px;
  font-weight: 700;
}

.quick-extra__heading small {
  color: var(--archive-ink-soft);
  font: 600 8px/1 var(--font-mono);
  letter-spacing: .14em;
}

.theme-legacy .quick-extra {
  gap: 0;
  margin: 0;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 14%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
}

.theme-legacy .quick-extra__row {
  display: grid;
  gap: 0;
  padding: 4px 0 0;
}

.theme-legacy .extra-btn {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 42px;
  padding: 0 4px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 13%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  text-align: left;
}

.theme-legacy .extra-btn.is-primary {
  border-color: color-mix(in srgb, var(--archive-olive) 18%, var(--border));
  background: transparent;
  color: var(--archive-ink);
}

.theme-legacy .extra-btn:hover {
  padding-left: 8px;
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  color: var(--accent);
}

.extra-btn__arrow {
  justify-self: end;
  opacity: .55;
}
</style>
