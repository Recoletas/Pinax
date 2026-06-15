<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  kicker: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  }
})

const slots = useSlots()

const hasBack = computed(() => Boolean(slots.back))
const hasInline = computed(() => Boolean(slots.inline))
const hasMeta = computed(() => Boolean(slots.meta))
const hasActions = computed(() => Boolean(slots.actions))
</script>

<template>
  <section
    class="workbench-page-hero"
    :class="{
      'has-back': hasBack,
      'has-inline': hasInline,
      'has-meta': hasMeta,
      'has-actions': hasActions
    }"
  >
    <div class="workbench-page-hero__main">
      <div class="workbench-page-hero__headline">
        <div v-if="hasBack" class="workbench-page-hero__back">
          <slot name="back" />
        </div>
        <div class="workbench-page-hero__copy">
          <span v-if="kicker" class="workbench-page-hero__kicker">{{ kicker }}</span>
          <h1 class="workbench-page-hero__title">{{ title }}</h1>
          <p v-if="description" class="workbench-page-hero__description">{{ description }}</p>
        </div>
      </div>

      <div v-if="hasInline" class="workbench-page-hero__inline">
        <slot name="inline" />
      </div>

      <div v-if="hasMeta" class="workbench-page-hero__meta">
        <slot name="meta" />
      </div>
    </div>

    <div v-if="hasActions" class="workbench-page-hero__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.workbench-page-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  padding: 22px 24px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface-panel) 94%, var(--bg-secondary)) 0%,
      color-mix(in srgb, var(--surface-soft) 88%, var(--bg-primary)) 100%
    );
  overflow: hidden;
  isolation: isolate;
}

.workbench-page-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-light) 14%, transparent), transparent 28%),
    repeating-linear-gradient(
      90deg,
      transparent 0 40px,
      color-mix(in srgb, var(--border) 8%, transparent) 40px 41px
    );
  opacity: 0.7;
  z-index: -1;
}

.workbench-page-hero__main {
  min-width: 0;
}

.workbench-page-hero__headline {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.workbench-page-hero__back {
  padding-top: 2px;
  flex-shrink: 0;
}

.workbench-page-hero__copy {
  min-width: 0;
}

.workbench-page-hero__kicker {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workbench-page-hero__title {
  margin-top: 6px;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.08;
  color: var(--text-primary);
}

.workbench-page-hero__description {
  margin-top: 10px;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.workbench-page-hero__inline,
.workbench-page-hero__meta {
  margin-top: 14px;
}

.workbench-page-hero__actions {
  min-width: min(320px, 100%);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.workbench-page-hero :deep(.workbench-hero-inline-group),
.workbench-page-hero :deep(.workbench-hero-meta-list),
.workbench-page-hero :deep(.workbench-hero-actions-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workbench-page-hero :deep(.workbench-hero-inline-group) {
  align-items: center;
}

.workbench-page-hero :deep(.workbench-hero-meta-list) {
  align-items: center;
}

.workbench-page-hero :deep(.workbench-hero-actions-row) {
  justify-content: flex-end;
  max-width: 320px;
}

.workbench-page-hero :deep(.workbench-hero-chip) {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.workbench-page-hero :deep(.workbench-hero-chip.accent) {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent-light) 22%, transparent);
  color: var(--accent);
}

.workbench-page-hero :deep(.workbench-hero-input-group) {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 640px);
}

.workbench-page-hero :deep(.workbench-hero-input-group > *) {
  min-width: 0;
}

.workbench-page-hero :deep(.workbench-hero-inline-select),
.workbench-page-hero :deep(.workbench-hero-inline-input) {
  width: 100%;
  height: 38px !important;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  color: var(--text-primary);
  font-size: 13px;
}

.workbench-page-hero :deep(.workbench-hero-inline-input) {
  line-height: 38px;
}

.workbench-page-hero :deep(.workbench-hero-inline-select:focus),
.workbench-page-hero :deep(.workbench-hero-inline-input:focus) {
  outline: none;
  border-color: var(--accent);
}

.workbench-page-hero :deep(.workbench-hero-button) {
  height: 36px !important;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
}

.workbench-page-hero :deep(.workbench-hero-button.icon-only) {
  width: 36px;
  padding: 0;
}

@media (max-width: 980px) {
  .workbench-page-hero {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 18px 18px 16px;
  }

  .workbench-page-hero__actions {
    min-width: 0;
    justify-content: flex-start;
  }

  .workbench-page-hero :deep(.workbench-hero-actions-row) {
    justify-content: flex-start;
    max-width: none;
  }
}

@media (max-width: 720px) {
  .workbench-page-hero__headline {
    gap: 10px;
  }

  .workbench-page-hero__title {
    font-size: 22px;
  }

  .workbench-page-hero__description {
    font-size: 13px;
  }

  .workbench-page-hero :deep(.workbench-hero-input-group) {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
