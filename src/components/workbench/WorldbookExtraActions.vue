<template>
  <footer class="quick-extra">
    <hr class="quick-extra__divider" aria-hidden="true" />
    <div class="quick-extra__row">
      <button
        type="button"
        class="extra-btn"
        data-test="extra-btn-import"
        @click="$emit('import')"
      >导入小说 / JSON</button>
      <button
        type="button"
        class="extra-btn"
        data-test="extra-btn-ai"
        @click="$emit('ai')"
      >AI 生成</button>
    </div>
  </footer>
</template>

<script setup>
defineEmits(['import', 'ai'])
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

.theme-legacy .quick-extra__divider {
  border-top-color: var(--border);
}

@media (max-width: 760px) {
  .extra-btn {
    flex: 1 1 100%;
  }
}
</style>