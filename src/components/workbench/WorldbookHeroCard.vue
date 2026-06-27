<template>
  <section class="worldbook-hero" data-test="worldbook-hero">
    <span class="worldbook-hero__roman" aria-hidden="true">I</span>
    <span class="worldbook-hero__stamp" aria-hidden="true">C·01</span>

    <div class="worldbook-hero__body">
      <div class="worldbook-hero__kicker">
        <span class="worldbook-hero__volume">WORLD BOOK · 卷·壹</span>
      </div>

      <h2 class="worldbook-hero__name">{{ preset?.name }}</h2>

      <div class="worldbook-hero__meta">
        <span class="worldbook-hero__genre">{{ preset?.genreLabel }}</span>
        <span class="worldbook-hero__dot" aria-hidden="true">·</span>
        <span class="worldbook-hero__entries">{{ entryCount }} 条目</span>
      </div>

      <p v-if="hookExcerpt" class="worldbook-hero__hook">{{ hookExcerpt }}</p>

      <ul v-if="briefing.length" class="worldbook-hero__briefing" aria-label="开场简报">
        <li v-for="chip in briefing" :key="chip.key">
          <strong>{{ chip.label }}</strong>
          <span>{{ chip.value }}</span>
        </li>
      </ul>

      <button
        type="button"
        class="worldbook-hero__cta"
        data-test="hero-cta"
        @click="onEnter"
      >
        <span class="worldbook-hero__cta-index" aria-hidden="true">01</span>
        <span class="worldbook-hero__cta-label">开始冒险</span>
        <span class="worldbook-hero__cta-arrow" aria-hidden="true">▶</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { getFeaturedPressureRow, getHookExcerpt } from '../../services/worldbookQuickImportHelpers'

const props = defineProps({
  preset: { type: Object, required: true }
})

const emit = defineEmits(['enter'])

const entryCount = computed(() => Array.isArray(props.preset?.entries) ? props.preset.entries.length : 0)

const hookExcerpt = computed(() => getHookExcerpt(props.preset, 80))

const briefing = computed(() => getFeaturedPressureRow(props.preset))

function onEnter() {
  emit('enter', props.preset)
}
</script>

<style scoped>
.worldbook-hero {
  position: relative;
  padding: 56px 28px 28px;
  background: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-olive) 18%, transparent);
  clip-path: polygon(0 24px, 26px 0, calc(100% - 44px) 0, 100% 44px, 100% 100%, 0 100%);
  box-shadow:
    0 28px 60px color-mix(in srgb, var(--archive-ink) 20%, transparent),
    22px 22px 0 color-mix(in srgb, var(--archive-olive) 14%, transparent);
}

/* 装订条: 顶部 8px 高 gold/olive/rose 三段渐变 + 撕角 */
.worldbook-hero::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 8px;
  background: linear-gradient(
    90deg,
    var(--archive-gold) 0%,
    var(--archive-olive) 50%,
    var(--archive-rose) 100%
  );
  clip-path: polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%);
  pointer-events: none;
}

/* 罗马 I 装饰: 左上, 88px italic, archive-rose 28% transparent, vertical-rl */
.worldbook-hero__roman {
  position: absolute;
  top: 24px; left: 28px;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 88px;
  font-style: italic;
  font-weight: 400;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 28%, transparent);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  pointer-events: none;
  user-select: none;
}

/* C·01 rose 章: 右上角 64px 圆形, -9deg rotate, opacity 0.82 */
.worldbook-hero__stamp {
  position: absolute;
  top: 32px; right: 36px;
  width: 64px; height: 64px;
  display: grid; place-content: center;
  border: 1.5px solid color-mix(in srgb, var(--archive-rose) 58%, transparent);
  border-radius: 50%;
  color: color-mix(in srgb, var(--archive-rose) 84%, var(--archive-ink));
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transform: rotate(-9deg);
  opacity: 0.82;
  background: transparent;
  box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--archive-paper) 76%, transparent);
  pointer-events: none;
  user-select: none;
}

.worldbook-hero__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}

.worldbook-hero__kicker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.worldbook-hero__volume {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--archive-ink-soft) 80%, transparent);
}

.worldbook-hero__name {
  margin: 0;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: clamp(28px, 4vw, 48px);
  line-height: 1.05;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--archive-ink);
  text-wrap: balance;
}

.worldbook-hero__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--archive-ink-soft);
}

.worldbook-hero__genre {
  font-weight: 500;
}

.worldbook-hero__dot {
  color: color-mix(in srgb, var(--archive-ink-soft) 50%, transparent);
}

.worldbook-hero__entries {
  font-weight: 500;
}

.worldbook-hero__hook {
  margin: 0;
  font-family: var(--font-serif, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 15px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--archive-ink) 86%, transparent);
  max-width: 64ch;
}

.worldbook-hero__briefing {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--archive-ink-soft);
}

.worldbook-hero__briefing li {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.worldbook-hero__briefing strong {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--archive-ink-soft) 80%, transparent);
  font-weight: 600;
}

.worldbook-hero__briefing span {
  font-size: 13px;
  color: var(--archive-ink);
  font-weight: 500;
}

/* 主 CTA: 撕角楔形 (clip-path polygon 14px 尖角) + -3deg skewX + 4px offset shadow */
.worldbook-hero__cta {
  align-self: flex-start;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 28px 12px 22px;
  border: 1px solid var(--archive-olive);
  background: var(--archive-olive);
  color: var(--archive-paper);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 9px 50%);
  transform: perspective(1200px) skewX(-3deg);
  box-shadow:
    4px 4px 0 color-mix(in srgb, var(--archive-olive-strong) 88%, transparent),
    0 12px 24px color-mix(in srgb, var(--archive-ink) 18%, transparent);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.worldbook-hero__cta:hover {
  transform: perspective(1200px) skewX(-3deg) translateY(-1px);
  box-shadow:
    4px 4px 0 color-mix(in srgb, var(--archive-olive-strong) 88%, transparent),
    0 16px 32px color-mix(in srgb, var(--archive-ink) 24%, transparent);
}

.worldbook-hero__cta > * {
  transform: skewX(3deg);
}

.worldbook-hero__cta-index {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.72;
}

.worldbook-hero__cta-label {
  font-size: 14px;
  font-weight: 600;
}

.worldbook-hero__cta-arrow {
  font-size: 10px;
  opacity: 0.8;
}

/* Legacy 主题覆写: 简化版白底, 不带撕角/罗马/印章 */
.theme-legacy .worldbook-hero {
  background: var(--bg-primary);
  border-color: var(--border);
  clip-path: none;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 10%, transparent);
}

.theme-legacy .worldbook-hero::before {
  display: none;
}

.theme-legacy .worldbook-hero__roman,
.theme-legacy .worldbook-hero__stamp {
  display: none;
}

.theme-legacy .worldbook-hero__name {
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", sans-serif);
  color: var(--text-primary);
}

.theme-legacy .worldbook-hero__cta {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-secondary);
  clip-path: none;
  transform: none;
  box-shadow: 0 2px 4px color-mix(in srgb, var(--ink) 14%, transparent);
}

.theme-legacy .worldbook-hero__cta > * {
  transform: none;
}

@media (max-width: 760px) {
  .worldbook-hero {
    padding: 40px 18px 20px;
    clip-path: polygon(0 16px, 16px 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
  }

  .worldbook-hero__roman {
    font-size: 56px;
    top: 14px;
    left: 18px;
  }

  .worldbook-hero__stamp {
    width: 48px; height: 48px;
    font-size: 10px;
    top: 18px; right: 18px;
  }
}
</style>