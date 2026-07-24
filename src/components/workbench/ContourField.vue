<script setup>
defineProps({
  density: {
    type: String,
    default: 'narrative',
    validator: (value) => ['narrative', 'geographic', 'relation'].includes(value)
  },
  entry: {
    type: String,
    default: 'right',
    validator: (value) => ['left', 'right', 'top', 'bottom'].includes(value)
  },
  masked: { type: Boolean, default: true }
})
</script>

<template>
  <div
    class="contour-field"
    :class="[`contour-field--${density}`, `contour-field--${entry}`, { 'is-masked': masked }]"
    aria-hidden="true"
  >
    <span class="contour-field__line contour-field__line--a"></span>
    <span class="contour-field__line contour-field__line--b"></span>
    <span class="contour-field__line contour-field__line--c"></span>
  </div>
</template>

<style scoped>
.contour-field {
  position: absolute;
  inset: 0;
  z-index: var(--z-stage-decor);
  overflow: hidden;
  pointer-events: none;
  opacity: var(--contour-opacity, 0.46);
}

:global(html.theme-kao .contour-field) {
  display: none;
}

.contour-field.is-masked {
  mask-image: linear-gradient(90deg, transparent 4%, #000 34%, #000 88%, transparent);
}

.contour-field--left { transform: scaleX(-1); }
.contour-field--top { transform: rotate(-90deg) scale(1.2); }
.contour-field--bottom { transform: rotate(90deg) scale(1.2); }

.contour-field__line {
  position: absolute;
  right: -14%;
  top: 12%;
  width: 66%;
  aspect-ratio: 1.9;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 14%, transparent);
  border-radius: 49% 58% 45% 62%;
  transform: rotate(-8deg);
}

.contour-field__line--b {
  right: -8%;
  top: 21%;
  width: 58%;
  transform: rotate(7deg);
}

.contour-field__line--c {
  right: -18%;
  top: 36%;
  width: 74%;
  transform: rotate(-3deg);
}

.contour-field--geographic { --contour-opacity: 0.62; }
.contour-field--geographic .contour-field__line { border-width: 1.5px; }
.contour-field--relation { --contour-opacity: 0.34; }
.contour-field--relation .contour-field__line { border-style: dashed; }

@media (prefers-reduced-motion: no-preference) {
  .contour-field__line {
    animation: contour-drift var(--motion-contour) ease-in-out infinite alternate;
  }
  .contour-field__line--b { animation-delay: -3s; }
  .contour-field__line--c { animation-delay: -6s; }
}

@keyframes contour-drift {
  to { translate: -12px 5px; }
}
</style>
