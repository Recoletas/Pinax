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
    description: '不用先补齐设定，从人物此刻看见或做出的事落笔。',
    action: '开始落笔'
  },
  {
    title: '记住一个关键人物',
    description: '姓名和一句背景就够，之后可以在写作中慢慢补。',
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
