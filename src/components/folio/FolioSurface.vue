<template>
  <component :is="as" class="folio-surface is-folio" :class="[variantClass, decorated ? 'folio-surface--decorated' : 'folio-surface--plain']">
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  as: {
    type: String,
    default: 'section'
  },
  variant: {
    type: String,
    default: 'paper'
  },
  decorated: {
    type: Boolean,
    default: true
  }
})

const variantClass = computed(() => `folio-surface--${props.variant}`)
</script>

<style scoped>
.folio-surface {
  position: relative;
  overflow: hidden;
  color: var(--archive-ink);
}

.folio-surface--decorated::before,
.folio-surface--decorated::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.folio-surface--decorated::before {
  inset: 0;
  background:
    linear-gradient(118deg, transparent 0 60%, color-mix(in srgb, var(--archive-olive) 8%, transparent) 60.2% 66%, transparent 66.2%),
    repeating-linear-gradient(
      90deg,
      transparent 0 84px,
      color-mix(in srgb, var(--hairline-soft) 55%, transparent) 84px 85px
    );
  opacity: 0.64;
}

.folio-surface--decorated::after {
  inset: 12px;
  border: 1px solid var(--hairline-soft);
  clip-path: polygon(0 18px, 22px 0, calc(100% - 34px) 0, 100% 32px, 100% 100%, 0 100%);
}

.folio-surface--paper {
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 14%, transparent), transparent 98px),
    linear-gradient(160deg, color-mix(in srgb, var(--archive-paper-soft) 98%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 95%, var(--archive-paper-strong)) 58%, color-mix(in srgb, var(--archive-paper-strong) 90%, var(--bg-tertiary)) 100%);
}

.folio-surface--chrome {
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 10%, transparent), transparent 82px),
    linear-gradient(160deg, color-mix(in srgb, var(--archive-paper-soft) 92%, var(--bg-secondary)) 0%, color-mix(in srgb, var(--archive-paper) 80%, var(--surface-panel)) 100%);
}

.folio-surface--dark {
  color: color-mix(in srgb, var(--archive-paper-soft) 94%, #fff);
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 6%, transparent), transparent 80px),
    linear-gradient(180deg, color-mix(in srgb, var(--archive-olive-strong) 94%, #101612), color-mix(in srgb, var(--archive-photo) 94%, #142623));
}
</style>
