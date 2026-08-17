<template>
  <section class="preset-grid" aria-label="更多世界">
    <header class="preset-grid__heading">
      <div>
        <small>WORLD PRESETS</small>
        <strong>从预设开始</strong>
      </div>
      <span>{{ capped.length }} 个世界</span>
    </header>
    <div class="preset-grid__items">
      <button
        v-for="preset in capped"
        :key="preset.id"
        type="button"
        class="preset-card"
        data-test="preset-card"
        @click="$emit('select', preset)"
      >
        <WorkbenchIcon name="book" :size="15" />
        <span class="preset-card__name">{{ preset.name }}</span>
        <span class="preset-card__genre">{{ preset.genreLabel }}</span>
        <span class="preset-card__entries">{{ entryCount(preset) }} 条目</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

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
  min-height: 74px;
  padding: 12px 14px;
  background: transparent;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 16%, var(--border));
  border-radius: 0;
  color: var(--text-primary);
  clip-path: none;
}

.theme-legacy .preset-card:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 58%, var(--border));
  background: color-mix(in srgb, var(--archive-olive) 6%, transparent);
  box-shadow: none;
  transform: none;
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

/* W5b UX sweep: collapse to a single column on phone portrait so the
   clip-path torn-corner reads correctly and the preset name does not
   wrap awkwardly under a 2x2 cramped layout. */
@media (max-width: 480px) {
  .preset-grid {
    grid-template-columns: 1fr;
  }
}

.preset-grid__heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  grid-column: 1 / -1;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 16%, var(--border));
}

.preset-grid__heading > div {
  display: grid;
  gap: 4px;
}

.preset-grid__heading small {
  color: var(--archive-ink-soft);
  font: 600 8px/1 var(--font-mono);
  letter-spacing: .16em;
}

.preset-grid__heading strong {
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
}

.preset-grid__heading > span {
  color: var(--archive-ink-soft);
  font-size: 11px;
}

.preset-grid__items {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.theme-legacy .preset-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.theme-legacy .preset-card {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  gap: 5px 9px;
  min-height: 82px;
  padding: 15px 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 13%, transparent);
  border-top: 2px solid var(--preset-accent, var(--archive-gold));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
}

.theme-legacy .preset-card:nth-child(3n + 1) { --preset-accent: var(--archive-gold); }
.theme-legacy .preset-card:nth-child(3n + 2) { --preset-accent: color-mix(in srgb, var(--archive-rose) 72%, var(--archive-gold)); }
.theme-legacy .preset-card:nth-child(3n) { --preset-accent: color-mix(in srgb, var(--accent-teal) 62%, var(--archive-gold)); }

.theme-legacy .preset-card:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 28%, var(--border));
  background: var(--archive-paper-soft);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--archive-ink) 7%, transparent);
  transform: translateY(-1px);
}

.theme-legacy .preset-card > svg {
  grid-row: 1 / 3;
  margin-top: 1px;
  color: var(--preset-accent);
}

.theme-legacy .preset-card__name {
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1.25;
}

.theme-legacy .preset-card__genre {
  color: var(--archive-ink-soft);
}

.theme-legacy .preset-card__entries {
  grid-column: 3;
  grid-row: 1 / 3;
  align-self: center;
  color: var(--archive-ink-soft);
}

@media (max-width: 900px) {
  .preset-grid__items {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .preset-grid__items {
    grid-template-columns: 1fr;
  }
}
</style>
