<template>
  <section class="preset-grid" aria-label="更多世界">
    <button
      v-for="(preset, idx) in capped"
      :key="preset.id"
      type="button"
      class="preset-card"
      data-test="preset-card"
      @click="$emit('select', preset)"
    >
      <span class="preset-card__roman" aria-hidden="true">{{ ROMAN[idx] || '·' }}</span>
      <span class="preset-card__name">{{ preset.name }}</span>
      <span class="preset-card__genre">{{ preset.genreLabel }}</span>
      <span class="preset-card__entries">{{ entryCount(preset) }} 条目</span>
    </button>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ']

const props = defineProps({
  presets: { type: Array, required: true }
})

const emit = defineEmits(['select'])

const capped = computed(() => (Array.isArray(props.presets) ? props.presets.slice(0, 5) : []))

function entryCount(preset) {
  return Array.isArray(preset?.entries) ? preset.entries.length : 0
}
</script>

<style scoped>
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.preset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 18px 16px 14px 22px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
  color: var(--archive-ink);
  border-radius: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  clip-path: polygon(0 12px, 12px 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%);
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.preset-card:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 48%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 100%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.preset-card__roman {
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 14px;
  font-style: italic;
  color: color-mix(in srgb, var(--archive-rose) 64%, transparent);
  font-weight: 500;
}

.preset-card__name {
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--archive-ink);
  text-wrap: balance;
}

.preset-card__genre {
  font-size: 11px;
  color: var(--archive-ink-soft);
  letter-spacing: 0.04em;
}

.preset-card__entries {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 11px;
  color: color-mix(in srgb, var(--archive-ink-soft) 80%, transparent);
}

/* Legacy 主题: 1px hairline 矩形 */
.theme-legacy .preset-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  clip-path: none;
}

.theme-legacy .preset-card:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-light, transparent) 18%, transparent);
  box-shadow: none;
}

.theme-legacy .preset-card__roman {
  display: none;
}

.theme-legacy .preset-card__name,
.theme-legacy .preset-card__genre,
.theme-legacy .preset-card__entries {
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  color: var(--text-primary);
}

@media (max-width: 760px) {
  .preset-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}
</style>