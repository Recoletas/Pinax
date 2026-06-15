<template>
  <component
    :is="componentType"
    class="bookmark-button is-bookmark"
    :class="[
      `bookmark-button--${variant}`,
      compact ? 'bookmark-button--compact' : '',
      size !== 'default' ? `bookmark-button--size-${size}` : '',
      disabled ? 'bookmark-button--disabled' : ''
    ]"
    v-bind="componentAttrs"
  >
    <span class="bookmark-button__index" :class="indexClass">{{ index }}</span>
    <span class="bookmark-button__label" :class="labelClass">{{ label }}</span>
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  to: {
    type: [String, Object],
    default: null
  },
  href: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'button'
  },
  index: {
    type: String,
    default: '01'
  },
  label: {
    type: String,
    required: true
  },
  variant: {
    type: String,
    default: 'primary'
  },
  compact: {
    type: Boolean,
    default: false
  },
  // TODO(2.0): deprecate compact in favor of size
  size: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'compact', 'micro'].includes(v)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  ariaLabel: {
    type: String,
    default: ''
  },
  indexClass: {
    type: [String, Array, Object],
    default: ''
  },
  labelClass: {
    type: [String, Array, Object],
    default: ''
  }
})

const componentType = computed(() => {
  if (props.to) return RouterLink
  if (props.href) return 'a'
  return 'button'
})

const componentAttrs = computed(() => {
  const attrs = {
    'aria-label': props.ariaLabel || props.label
  }
  if (props.to) attrs.to = props.to
  if (props.href) attrs.href = props.href
  if (!props.to && !props.href) {
    attrs.type = props.type
    attrs.disabled = props.disabled
  }
  return attrs
})
</script>

<style scoped>
.bookmark-button {
  width: 100%;
  min-height: 82px;
  padding: 0 20px 0 0;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: stretch;
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
  text-decoration: none;
  cursor: pointer;
  transform-origin: left center;
  transition: transform 0.18s ease, filter 0.18s ease, border-color 0.18s ease;
}

.bookmark-button::before,
.bookmark-button::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.bookmark-button::before {
  inset: 0;
  background:
    linear-gradient(90deg, color-mix(in srgb, #fff 12%, transparent), transparent 18%),
    linear-gradient(118deg, transparent 0 72%, color-mix(in srgb, var(--archive-gold) 10%, transparent) 72.2% 78%, transparent 78.2%);
}

.bookmark-button::after {
  inset: 10px -18px 10px auto;
  width: 22px;
  background: linear-gradient(180deg, color-mix(in srgb, #000 10%, transparent), color-mix(in srgb, #000 22%, transparent));
  transform: skewX(34deg);
  opacity: 0.58;
}

.bookmark-button--primary {
  background:
    linear-gradient(122deg, color-mix(in srgb, var(--archive-olive-strong) 92%, #09090a) 0%, color-mix(in srgb, var(--archive-olive) 88%, #123530) 68%, color-mix(in srgb, var(--archive-gold) 96%, #b88a33) 68% 100%);
  color: color-mix(in srgb, #fff8ef 96%, transparent);
}

.bookmark-button--secondary {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 98%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 92%, transparent) 68%, color-mix(in srgb, var(--archive-olive) 72%, var(--archive-olive-strong)) 68% 100%);
  color: var(--archive-ink);
}

.bookmark-button--tertiary {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 98%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 92%, transparent) 70%, color-mix(in srgb, var(--archive-rose) 66%, var(--archive-gold)) 70% 100%);
  color: var(--archive-ink);
}

.bookmark-button:hover:not(.bookmark-button--disabled) {
  filter: brightness(1.04);
  transform: translate3d(6px, -4px, 0) perspective(1200px) skewX(-8deg);
}

.bookmark-button__index,
.bookmark-button__label {
  position: relative;
  z-index: 1;
}

.bookmark-button__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  background: color-mix(in srgb, #000 18%, transparent);
}

.bookmark-button--secondary .bookmark-button__index,
.bookmark-button--tertiary .bookmark-button__index {
  color: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  background: color-mix(in srgb, var(--archive-olive-strong) 82%, transparent);
}

.bookmark-button__label {
  min-width: 0;
  padding: 0 10px 0 18px;
  display: inline-flex;
  align-items: center;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: 0.02em;
}

.bookmark-button--compact {
  min-height: 72px;
  grid-template-columns: 60px minmax(0, 1fr);
}

.bookmark-button--compact .bookmark-button__index {
  font-size: 24px;
}

.bookmark-button--compact .bookmark-button__label {
  font-size: 18px;
}

.bookmark-button--size-micro {
  min-height: 40px;
  grid-template-columns: 44px minmax(0, 1fr);
}

.bookmark-button--size-micro .bookmark-button__index {
  font-size: 16px;
}

.bookmark-button--size-micro .bookmark-button__label {
  font-size: 13px;
  padding: 0 8px 0 14px;
}

.bookmark-button--disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

@media (max-width: 760px) {
  .bookmark-button {
    min-height: 72px;
    grid-template-columns: 58px minmax(0, 1fr);
    padding-right: 18px;
    transform: none;
  }

  .bookmark-button:hover:not(.bookmark-button--disabled) {
    transform: translateY(-2px);
  }

  .bookmark-button__index {
    font-size: 22px;
  }

  .bookmark-button__label {
    font-size: 20px;
  }

  .bookmark-button--size-micro {
    min-height: 36px;
    grid-template-columns: 40px minmax(0, 1fr);
  }
}
</style>
