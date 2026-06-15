<template>
  <div
    class="poster-stage is-archive-paper"
    :class="[variantClass, decorated ? 'poster-stage--decorated' : 'poster-stage--plain']"
    :style="stageStyle"
    :aria-hidden="ariaHidden ? 'true' : undefined"
  >
    <!-- Global SVG <defs> for the torn-edge displacement filter.
         Mounted once in the DOM and referenceable from any element via
         `filter: url(#pinax-paper-tear)`. -->
    <svg
      class="pinax-svg-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter
          id="pinax-paper-tear"
          x="-2%"
          y="-2%"
          width="104%"
          height="104%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.022"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
            result="displaced"
          />
        </filter>
      </defs>
    </svg>
    <slot>
      <span class="poster-stage__art"></span>
      <span class="poster-stage__glow"></span>
      <span class="poster-stage__rim"></span>
      <span class="poster-stage__reflection"></span>
      <span class="poster-stage__haze"></span>
    </slot>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  image: {
    type: String,
    default: ''
  },
  variant: {
    type: String,
    default: 'photo'
  },
  decorated: {
    type: Boolean,
    default: true
  },
  ariaHidden: {
    type: Boolean,
    default: false
  }
})

const variantClass = computed(() => `poster-stage--${props.variant}`)
const stageStyle = computed(() => {
  const style = { '--poster-stage-torn-mask': tornPaperMaskUrl }
  if (props.image) {
    style['--poster-stage-image'] = `url(${props.image})`
  }
  return style
})

// Inline SVG used as an alpha mask for the torn paper edge.
// Coordinates: 4 edges, each with ~10 jitter points; viewBox is 100x100.
const tornPaperMaskUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
  `<path d="M0,3 L4,1 L9,4 L17,2 L24,5 L33,1 L42,4 L51,2 L60,5 L69,1 L78,4 L87,2 L96,5 L100,3 ` +
  `L100,7 L98,12 L99,18 L97,25 L100,33 L98,40 L100,48 L97,55 L100,63 L98,70 L100,78 L97,85 L100,93 L99,97 ` +
  `L96,100 L89,98 L82,100 L74,97 L66,100 L58,98 L50,100 L42,97 L34,100 L26,98 L18,100 L10,97 L4,100 L0,97 ` +
  `L1,92 L3,86 L1,80 L4,74 L1,68 L3,62 L1,56 L4,50 L1,44 L3,38 L1,32 L4,26 L1,20 L3,14 L1,8 Z" fill="white"/>` +
  `</svg>`
)}")`
</script>

<style scoped>
.poster-stage {
  position: relative;
  overflow: hidden;
}

.poster-stage--decorated {
  border: 1px solid var(--hairline-accent);
  border-radius: 0;
  clip-path: polygon(0 16px, 20px 0, calc(100% - 38px) 0, 100% 34px, 100% 100%, 0 100%);
  background: color-mix(in srgb, var(--archive-photo) 94%, var(--archive-olive-strong));
}

.poster-stage--plain {
  overflow: visible;
}

.poster-stage__art,
.poster-stage__glow,
.poster-stage__rim,
.poster-stage__reflection,
.poster-stage__haze {
  position: absolute;
  display: block;
}

.poster-stage__art {
  inset: 0;
  background-image: var(--poster-stage-image);
  background-position: 60% center;
  background-size: cover;
  filter: saturate(0.95) contrast(0.96) brightness(0.96) url(#pinax-paper-tear);
  transform: scale(1.04);
  -webkit-mask-image: var(--poster-stage-torn-mask);
  mask-image: var(--poster-stage-torn-mask);
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.poster-stage__glow {
  inset: 0;
  background:
    radial-gradient(circle at 62% 40%, color-mix(in srgb, var(--archive-gold-soft) 20%, transparent), transparent 18%),
    radial-gradient(circle at 48% 18%, color-mix(in srgb, var(--archive-paper-soft) 24%, transparent), transparent 24%);
  filter: blur(14px);
  opacity: 0.88;
}

.poster-stage__rim {
  inset: 0;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  clip-path: inherit;
}

.poster-stage__reflection {
  left: -12%;
  right: 38%;
  top: -2%;
  height: 28%;
  background: linear-gradient(180deg, color-mix(in srgb, #fff 26%, transparent), transparent 58%);
  transform: rotate(-16deg);
  opacity: 0.64;
  filter: blur(8px);
}

.poster-stage__haze {
  inset: 0;
  background:
    linear-gradient(180deg, transparent 0 52%, color-mix(in srgb, var(--archive-olive-strong) 18%, transparent) 78%, color-mix(in srgb, var(--archive-olive-strong) 40%, transparent) 100%),
    linear-gradient(108deg, transparent 0 68%, color-mix(in srgb, var(--archive-gold) 12%, transparent) 68.2% 74%, transparent 74.2%);
}
</style>
