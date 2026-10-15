<script setup>
import { tr } from '../../i18n/index.js'
import { computed } from 'vue'

const props = defineProps({
  stage: { type: Number, default: 1 }
})

const emit = defineEmits(['advance', 'dismiss'])

const steps = Object.freeze([
  {
    title: '先写下眼前发生的一件事',
    description: '写一段人物的行动或眼前的场景。',
    action: '开始落笔'
  },
  {
    title: '记住一个关键人物',
    description: '先记录姓名和背景，之后再补性格与外貌。',
    action: '打开角色'
  },
  {
    title: '告诉 Pinax 谁在当前场',
    description: '把刚建的人物加入现场，推演才知道谁可以回应。',
    action: '安排当前场'
  },
  {
    title: '试走一个人物行动',
    description: '先看回应和另一种走法，满意后再把试稿带回正文。',
    action: '打开推演'
  }
])

const safeStage = computed(() => Math.min(steps.length, Math.max(1, Number(props.stage) || 1)))
const current = computed(() => steps[safeStage.value - 1])
</script>

<template>
  <section class="first-run-path" :aria-label="tr('首次创作指引')" data-test="authoring-first-run-path">
    <span class="first-run-path__index" aria-hidden="true">{{ String(safeStage).padStart(2, '0') }} / 04</span>
    <span class="first-run-path__copy">
      <strong>{{ tr(current.title) }}</strong>
      <small>{{ tr(current.description) }}</small>
    </span>
    <button class="first-run-path__advance" type="button" @click="emit('advance', safeStage)">{{ tr(current.action) }} →</button>
    <button class="first-run-path__dismiss" type="button" :aria-label="tr('关闭首次创作指引')" :title="tr('关闭指引')" @click="emit('dismiss')">×</button>
  </section>
</template>

<style scoped>
.first-run-path {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  margin: 2px 0 4px;
  padding: 13px 0;
  border-block: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border-subtle));
  color: var(--text-primary);
}

.first-run-path__index {
  color: var(--archive-olive);
  font: 650 10px/1 var(--font-sans, sans-serif);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}

.first-run-path__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.first-run-path__copy strong {
  font-size: 13px;
  font-weight: 650;
}

.first-run-path__copy small {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.first-run-path button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.first-run-path__advance {
  min-height: 36px;
  padding: 0 2px;
  color: var(--archive-olive) !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  white-space: nowrap;
}

.first-run-path__dismiss {
  width: 36px;
  min-height: 36px;
  color: var(--text-secondary) !important;
  font-size: 18px !important;
}

.first-run-path button:hover,
.first-run-path button:focus-visible {
  color: var(--text-primary) !important;
}

.first-run-path button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .first-run-path {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 9px 11px;
    padding: 12px 0 14px;
  }

  .first-run-path__copy small {
    white-space: normal;
  }

  .first-run-path__advance {
    grid-column: 2;
    justify-self: start;
    min-height: 44px;
  }

  .first-run-path__dismiss {
    grid-column: 3;
    grid-row: 1 / span 2;
    min-width: 44px;
    min-height: 44px;
  }
}
</style>

<style scoped>
.first-run-path { padding: 16px 18px; margin-block: 12px 24px; border: 1px solid var(--hairline-soft); border-radius: 10px; background: var(--surface-workbench-muted); gap: 16px; font-family: var(--font-sans); }
.first-run-path__index { color: var(--text-muted); font-size: 12px; font-weight: 500; letter-spacing: 0; }
.first-run-path__copy strong { font-size: 14px; font-weight: 500; line-height: 1.5; }
.first-run-path__copy small { font-size: 13px; line-height: 1.6; white-space: normal; }
.first-run-path__advance { color: var(--accent) !important; font-size: 13px !important; font-weight: 500 !important; padding-inline: 12px; }
.first-run-path__dismiss { font-size: 22px !important; }
@media (max-width: 720px) { .first-run-path { padding: 14px; gap: 8px 12px; } }
</style>
