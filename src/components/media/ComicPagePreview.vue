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
        <span>{{ panel.visual || '等待画面' }}</span>
      </span>

      <span v-if="panel.caption" class="comic-page-preview__caption">{{ panel.caption }}</span>
      <span v-if="panel.dialogue?.length" class="comic-page-preview__dialogue">
        <span v-for="(line, index) in panel.dialogue" :key="`${panel.id}-${index}`">
          <strong v-if="line.speaker">{{ line.speaker }}</strong>{{ line.text }}
        </span>
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
.comic-page-preview__caption, .comic-page-preview__dialogue { position: absolute; z-index: 2; max-width: calc(100% - 16px); background: rgb(255 255 255 / 0.9); color: #242424; box-shadow: 0 1px 5px rgb(0 0 0 / 0.16); }
.comic-page-preview__caption { top: 7px; left: 7px; padding: 4px 6px; font-size: 10px; line-height: 1.35; }
.comic-page-preview__dialogue { right: 7px; bottom: 7px; display: grid; gap: 3px; padding: 6px 8px; border-radius: 12px 12px 3px 12px; font-size: 10px; line-height: 1.35; }
.comic-page-preview__dialogue strong { margin-right: 3px; color: #4d5f7d; }
.comic-page-preview__index { position: absolute; left: 5px; bottom: 4px; z-index: 3; color: rgb(255 255 255 / 0.88); font-size: 9px; text-shadow: 0 1px 3px rgb(0 0 0 / 0.9); }

.comic-page-preview.is-compact { width: 100%; aspect-ratio: 4 / 5; gap: 4px; padding: 5px; box-shadow: none; }
.comic-page-preview.is-single { grid-template-columns: 1fr; grid-template-rows: 1fr; aspect-ratio: 4 / 5; }
.comic-page-preview.is-compact .comic-page-preview__placeholder { padding: 5px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder strong { font-size: 16px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder span, .comic-page-preview.is-compact .comic-page-preview__caption, .comic-page-preview.is-compact .comic-page-preview__dialogue { display: none; }
</style>
