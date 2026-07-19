<script setup>
defineProps({
  page: { type: Object, default: null },
  activePanelId: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

defineEmits(['select-panel'])

function selectedTake(panel) {
  return panel.imageTakes?.find((take) => take.id === panel.selectedTakeId) || null
}

function letteringStyle(object) {
  const [x, y, width, height] = normalizeBox(object?.box)
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${width * 100}%`,
    minHeight: `${height * 100}%`,
    zIndex: 10 + (Number(object?.zIndex) || 0)
  }
}

function normalizeBox(box) {
  const values = Array.isArray(box) ? box.map(Number) : []
  const width = clamp(values[2], 0.18, 0.8, 0.38)
  const height = clamp(values[3], 0.1, 0.6, 0.2)
  return [
    clamp(values[0], 0, 1 - width, 0.56),
    clamp(values[1], 0, 1 - height, 0.08),
    width,
    height
  ]
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
</script>

<template>
  <section
    class="comic-page-preview"
    :class="[
      `comic-page-preview--${page?.layout || 'strip-4'}`,
      { 'is-compact': compact, 'is-interactive': interactive, 'is-single': page?.panels?.length === 1 }
    ]"
    :aria-label="page?.title || '漫画页预览'"
  >
    <button
      v-for="panel in page?.panels || []"
      :key="panel.id"
      type="button"
      class="comic-page-preview__panel"
      :class="{ active: activePanelId === panel.id }"
      :aria-disabled="interactive ? 'false' : 'true'"
      :tabindex="interactive ? 0 : -1"
      @click="interactive && $emit('select-panel', panel.id)"
    >
      <img v-if="selectedTake(panel)" :src="selectedTake(panel).data" :alt="`第 ${panel.order} 格`" />
      <span v-else class="comic-page-preview__placeholder">
        <strong>{{ panel.order }}</strong>
        <span>等待画面</span>
      </span>

      <span
        v-for="object in panel.letteringObjects || []"
        :key="object.id"
        class="comic-page-preview__lettering"
        :class="`is-${object.type}`"
        :style="letteringStyle(object)"
      >
        {{ object.text }}
      </span>
      <span class="comic-page-preview__index" aria-hidden="true">{{ panel.order }}</span>
    </button>
  </section>
</template>

<style scoped>
.comic-page-preview {
  width: min(100%, 760px);
  aspect-ratio: 4 / 5;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink, var(--text-primary)) 28%, var(--border));
  background: color-mix(in srgb, var(--archive-paper, var(--bg-secondary)) 92%, white 8%);
  box-shadow: 0 14px 32px rgb(20 24 32 / 0.12);
}

.comic-page-preview--page-6 { aspect-ratio: 3 / 4; grid-template-rows: repeat(3, minmax(0, 1fr)); }
.comic-page-preview--strip-4 { grid-template-rows: repeat(2, minmax(0, 1fr)); }
.comic-page-preview--feature-4 {
  aspect-ratio: 3 / 4;
  grid-template-rows: 1.12fr repeat(2, minmax(0, 1fr));
}
.comic-page-preview--feature-4 .comic-page-preview__panel:first-child { grid-column: 1 / -1; }
.comic-page-preview--feature-4 .comic-page-preview__panel:nth-child(2) { grid-row: 2 / 4; }
.comic-page-preview--feature-6 {
  aspect-ratio: 3 / 4;
  grid-template-rows: 1.12fr repeat(2, minmax(0, 1fr)) 0.72fr;
}
.comic-page-preview--feature-6 .comic-page-preview__panel:first-child,
.comic-page-preview--feature-6 .comic-page-preview__panel:last-child { grid-column: 1 / -1; }

.comic-page-preview__panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink, var(--text-primary)) 72%, transparent);
  border-radius: 2px;
  background: var(--bg-primary);
  color: var(--text-primary);
  text-align: left;
}

.comic-page-preview.is-interactive .comic-page-preview__panel { cursor: pointer; }
.comic-page-preview__panel.active { outline: 3px solid color-mix(in srgb, var(--accent) 74%, transparent); outline-offset: -3px; }
.comic-page-preview__panel img { width: 100%; height: 100%; display: block; object-fit: cover; }
.comic-page-preview__placeholder { width: 100%; height: 100%; display: grid; align-content: center; justify-items: center; gap: 8px; padding: 12px; background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-secondary)) 82%, transparent); color: var(--text-muted); text-align: center; }
.comic-page-preview__placeholder strong { font-family: var(--font-display); font-size: 24px; }
.comic-page-preview__placeholder span { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; font-size: 11px; line-height: 1.5; }
.comic-page-preview__lettering { position: absolute; display: grid; place-items: center; padding: 3px 5px; overflow: hidden; border: 1px solid rgb(32 36 42 / 0.82); border-radius: 50%; background: rgb(255 255 255 / 0.94); color: #20242a; box-shadow: 0 1px 5px rgb(0 0 0 / 0.16); font-family: var(--font-display); font-size: 10px; font-weight: 600; line-height: 1.3; text-align: center; }
.comic-page-preview__lettering.is-thought { border-style: dashed; border-radius: 46%; }
.comic-page-preview__lettering.is-caption { place-items: start; border-radius: 2px; text-align: left; }
.comic-page-preview__lettering.is-sfx { border: 0; background: transparent; box-shadow: none; color: #fff; font-size: 14px; font-weight: 800; text-shadow: -1px -1px 0 #20242a, 1px -1px 0 #20242a, -1px 1px 0 #20242a, 1px 1px 0 #20242a; transform: rotate(-7deg); }
.comic-page-preview__index { position: absolute; left: 5px; bottom: 4px; z-index: 3; color: rgb(255 255 255 / 0.88); font-size: 9px; text-shadow: 0 1px 3px rgb(0 0 0 / 0.9); }

.comic-page-preview.is-compact { width: 100%; aspect-ratio: 4 / 5; gap: 4px; padding: 5px; box-shadow: none; }
.comic-page-preview.is-single { grid-template-columns: 1fr; grid-template-rows: 1fr; aspect-ratio: 4 / 5; }
.comic-page-preview.is-compact .comic-page-preview__placeholder { padding: 5px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder strong { font-size: 16px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder span { display: none; }
.comic-page-preview.is-compact .comic-page-preview__lettering { padding: 2px 3px; font-size: 7px; }
.comic-page-preview.is-compact .comic-page-preview__lettering.is-sfx { font-size: 10px; }
</style>
