<template>
  <!--
    CharacterBackdrop — full-bleed character art background.

    CSS contract for consumers (do not rename without updating the test suite
    in src/__tests__/panelSlots.test.js, faceRotation.test.js, and
    usePoseSlots.js):
      --character-backdrop-image     url() or 'none'
      --character-backdrop-position  'center' / 'top' / 'right' / ...
      --character-backdrop-fit       'cover' / 'contain' (default: 'contain' since 5C v3.8 — no cover cropping)
      --character-backdrop-tint      var(--archive-*)  (any palette token)
      --character-backdrop-tint-strength  percent (0-100)
      --character-backdrop-blur      px
      --character-backdrop-face-rotation  deg (head-turn proxy rotation)
      --figure-bbox-top    percent of the backdrop height  (default 8)
      --figure-bbox-right  percent of the backdrop width   (default 36)
      --figure-bbox-bottom percent of the backdrop height  (default 96)
      --figure-bbox-left   percent of the backdrop width   (default 64)
    The four --figure-bbox-* vars are read from usePoseSlots() and updated
    reactively when the scene changes. v0: all poses share the default bbox.
    v1: per-pose bboxes ship when the per-character art regen lands.

    5C v3 P1.B — head-turn proxy:
      The .character-backdrop__face-region overlays a clipped copy of the art
      (top 30% only) and applies transform: rotate(var(--character-backdrop-face-rotation))
      on top of the body layer. Effect: subtle head-tilt reaction to scene
      events (choice made, interaction, decision) without layered art files.

    5C v3 P1.C — micro-lean hover:
      The .character-backdrop root has pointer-events: auto so its :hover
      fires when the cursor is over the art. The art layer is split into
      an outer .character-backdrop__art (transform: scale(1.06) base,
      always on) and an inner .character-backdrop__art-bg (the actual
      background image + filter). On :hover the outer's transform becomes
      perspective(800px) rotateY(2deg) scale(1.04) — a 3D lean toward the
      camera. Transition is 320ms with a soft cubic-bezier(0.22, 1, 0.36, 1)
      easing, guarded by @media (prefers-reduced-motion: no-preference).

    5C v3.9b — Arknights reactive art (3 patterns):
      1. Status text overlays. New `kicker` (10px caps mono, top-left) and
         `statusLine` (12px italic serif, bottom-left) props render as
         text-shadow haloed text on the backdrop. OpeningPage wires them
         to the active scene pose so the art "talks" via scene copy.
      2. 3D perspective mouse tilt. The inner .character-backdrop__art-bg
         now applies perspective(800px) rotateY(±3°) rotateX(±2°), driven
         by --parallax-x/y (the same vars the v3.8 2D parallax writes).
         Effect: the art pivots in real 3D on mouse, not just 2D.
      3. Dynamic-wallpaper idle motion. The base art stays fixed; only
         localized mist/light/noise overlays animate, plus the kicker
         underline pulse. This avoids whole-image drift while keeping
         the page alive.
  -->
  <div
    class="character-backdrop"
    ref="rootEl"
    :class="{ 'character-backdrop--has-image': !!src }"
    :data-pose="resolvedPoseId"
    :data-react="resolvedReact"
    :style="cssVars"
    :aria-hidden="ariaHidden ? 'true' : undefined"
  >
    <span class="character-backdrop__art">
      <!-- 5C v3.8: drop the v3.7 2-layer parallax. Single art-bg layer
           translates on mouse-move (8px follow, 600ms smooth) for a
           minimal 3D feel — no fg/bg opposite drift, no multi-layer
           compose. v3.6 micro-lean hover stays on the outer. v3.9b adds
           3D perspective tilt + breathing on the inner. -->
      <span class="character-backdrop__art-bg"></span>
    </span>
    <span v-if="resolvedReact !== 'none'" class="character-backdrop__face-region"></span>
    <span class="character-backdrop__vignette"></span>
    <span class="character-backdrop__color-wash"></span>
    <!-- 5C v3.9b: status text overlays (kicker top-left, statusLine
         bottom-left). Read by screen readers via aria-label; visually
         they sit on the art with text-shadow halos for legibility. -->
    <span v-if="kicker" class="character-backdrop__kicker" :aria-label="kicker">{{ kicker }}</span>
    <span v-if="statusLine" class="character-backdrop__status" :aria-label="statusLine">{{ statusLine }}</span>
    <!-- 5C v3 P1.A: panel-slot region = the inverse of the figure bbox.
         Children of this region inherit slot context (positioning via
         --figure-bbox-* CSS vars). -->
    <div class="character-backdrop__panel-region">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSceneBackground } from '@/composables/useSceneBackground'
import { usePoseSlots } from '@/composables/usePoseSlots'
import { useMouseTilt } from '@/composables/useMouseTilt'

const props = defineProps({
  src: { type: String, default: '' },
  position: { type: String, default: 'center' },
  fit: { type: String, default: 'contain' },
  tint: { type: String, default: 'archive-olive-strong' },
  tintStrength: { type: Number, default: 38 },
  blur: { type: Number, default: 0 },
  ariaHidden: { type: Boolean, default: true },
  // 5C v3 P1.A: optional explicit poseId. When omitted, reads from
  // useSceneBackground() (module-level ref shared with the scene switcher).
  poseId: { type: String, default: '' },
  // 5C v3 P1.B: head-turn proxy driver. Maps to a rotation angle on the
  // .character-backdrop__face-region overlay (top 30% of art, clipped).
  react: {
    type: String,
    default: 'none',
    validator: (v) => ['none', 'choice-a', 'choice-b', 'interact', 'decision'].includes(v),
  },
  // 5C v3.9b: status text overlays (Arknights pattern 1). Renders as
  // text-shadow haloed text on the art. OpeningPage derives both from
  // the active scene pose so the art "talks" via scene copy.
  kicker: { type: String, default: '' },
  statusLine: { type: String, default: '' },
})

const { currentScenePoseId } = useSceneBackground()
const { bbox } = usePoseSlots()

const resolvedPoseId = computed(() => props.poseId || currentScenePoseId.value || 'default')
const resolvedReact = computed(() => props.react || 'none')

// 5C v3 P1.B: enum → rotation angle. Unknown values gracefully fall back to
// 0deg (the lookup misses and the computed yields 0).
const REACT_TO_ANGLE = {
  none: 0,
  'choice-a': -4,
  'choice-b': 2,
  interact: -7,
  decision: 5,
}
const faceRotationDeg = computed(() => REACT_TO_ANGLE[resolvedReact.value] ?? 0)

// 5C v3.7 + v3.9b: parallax + 3D tilt. The same cursor position drives
// both effects:
//   - the v3.8 2D translate on .character-backdrop__art-bg
//     (writes --parallax-x / --parallax-y CSS vars)
//   - the v3.9b 3D perspective rotateY/rotateX on the same layer
//     (re-reads the same --parallax-x / --parallax-y vars)
const rootEl = ref(null)
const parallaxX = ref(0)
const parallaxY = ref(0)
let reduceMotion = false

// 5C v3.9b: useMouseTilt composable (Arknights pattern 2). Owns its own
// parallax refs + tilt computed. We read its tiltX/tiltY into CSS vars
// so the CSS can compose the perspective tilt on top of the v3.8 2D
// translate without duplicating the listener.
const { tiltX, tiltY, parallaxX: tiltParallaxX, parallaxY: tiltParallaxY } = useMouseTilt(rootEl)

function onParallaxMove(event) {
  if (reduceMotion) return
  const root = rootEl.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  // Range roughly -1..1, clamped softly.
  const nx = Math.max(-1, Math.min(1, (event.clientX - cx) / (rect.width / 2)))
  const ny = Math.max(-1, Math.min(1, (event.clientY - cy) / (rect.height / 2)))
  parallaxX.value = nx
  parallaxY.value = ny
  // Mirror into the tilt composable's refs so the 3D layer stays in sync.
  tiltParallaxX.value = nx
  tiltParallaxY.value = ny
}

function resetParallax() {
  parallaxX.value = 0
  parallaxY.value = 0
  tiltParallaxX.value = 0
  tiltParallaxY.value = 0
}

let motionMediaQuery = null
function handleMotionChange(event) {
  reduceMotion = event.matches
  if (reduceMotion) resetParallax()
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduceMotion = motionMediaQuery.matches
    if (motionMediaQuery.addEventListener) {
      motionMediaQuery.addEventListener('change', handleMotionChange)
    }
  }
  if (rootEl.value) {
    rootEl.value.addEventListener('mousemove', onParallaxMove)
    rootEl.value.addEventListener('mouseleave', resetParallax)
  }
})

onBeforeUnmount(() => {
  if (motionMediaQuery && motionMediaQuery.removeEventListener) {
    motionMediaQuery.removeEventListener('change', handleMotionChange)
  }
  if (rootEl.value) {
    rootEl.value.removeEventListener('mousemove', onParallaxMove)
    rootEl.value.removeEventListener('mouseleave', resetParallax)
  }
})

// TODO(5C v1): per-pose bboxes ship when the per-character art regen lands.
// For v0 every poseId maps to the same default bbox (figure upper-right).
const cssVars = computed(() => ({
  '--character-backdrop-image': props.src ? `url(${props.src})` : 'none',
  '--character-backdrop-position': props.position,
  '--character-backdrop-fit': props.fit,
  '--character-backdrop-tint': `var(--${props.tint})`,
  '--character-backdrop-tint-strength': `${props.tintStrength}%`,
  '--character-backdrop-blur': `${props.blur}px`,
  '--character-backdrop-face-rotation': `${faceRotationDeg.value}deg`,
  '--figure-bbox-top': `${bbox.value.top}%`,
  '--figure-bbox-right': `${bbox.value.right}%`,
  '--figure-bbox-bottom': `${bbox.value.bottom}%`,
  '--figure-bbox-left': `${bbox.value.left}%`,
  '--parallax-x': String(parallaxX.value),
  '--parallax-y': String(parallaxY.value),
  // 5C v3.9b: 3D tilt degrees, consumed by .character-backdrop__art-bg
  // for the perspective rotateY/rotateX.
  '--tilt-x': `${tiltX.value}deg`,
  '--tilt-y': `${tiltY.value}deg`,
}))
</script>

<style scoped>
.character-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 5C v3 P1.C: pointer-events: auto so :hover fires when the cursor is
     over the art. Slot clicks remain intact because the panel-region
     layer (z-index: 1, pointer-events: auto) is a separate child. */
  pointer-events: auto;
  isolation: isolate;
  z-index: 0;
}
.character-backdrop::before,
.character-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.character-backdrop::before {
  background:
    radial-gradient(ellipse at 18% 26%, color-mix(in srgb, var(--archive-paper) 16%, transparent) 0 9%, transparent 28%),
    radial-gradient(ellipse at 72% 34%, color-mix(in srgb, var(--archive-gold) 12%, transparent) 0 7%, transparent 26%),
    linear-gradient(102deg, transparent 0 42%, color-mix(in srgb, var(--archive-paper) 9%, transparent) 50%, transparent 62% 100%);
  mix-blend-mode: screen;
  opacity: 0.48;
  transform: translate3d(-2%, 0, 0);
}
.character-backdrop::after {
  background-image:
    radial-gradient(circle at 20% 24%, color-mix(in srgb, var(--archive-paper) 62%, transparent) 0 1px, transparent 2px),
    radial-gradient(circle at 68% 42%, color-mix(in srgb, var(--archive-gold) 46%, transparent) 0 1px, transparent 2px),
    linear-gradient(180deg, transparent 0 16%, color-mix(in srgb, var(--archive-paper) 7%, transparent) 34%, transparent 52% 100%);
  background-size: 190px 160px, 230px 210px, 100% 220%;
  opacity: 0.28;
  mix-blend-mode: screen;
}
.character-backdrop__art,
.character-backdrop__vignette,
.character-backdrop__color-wash {
  position: absolute;
  inset: 0;
}
/* 5C v3 P1.A: panel-slot layer. In v0 (one default bbox) this fills the
   backdrop; consumers can read the --figure-bbox-* CSS vars to position
   sub-panels inside the negative space. In v1 the region itself can
   shrink to the inverse of the bbox. */
.character-backdrop__panel-region {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: auto;
}
/* 5C v3 P1.C + v3.7: split the art layer into an outer (transform host) +
   two inner layers (sharp foreground + blurred/scaled background). The
   outer's scale(1.06) base prevents edge gaps under overflow: hidden; the
   inner fg carries the sharp art with no filter chain, the inner bg
   carries a blurred/saturated copy. v3.7 translates the two layers
   opposite each other on mousemove for a depth cue without panels. */
.character-backdrop__art {
  overflow: hidden;
  transform: scale(1.06);
  transform-origin: 50% 60%;
  will-change: transform;
}
.character-backdrop__art-bg {
  position: absolute;
  inset: 0;
  background-image: var(--character-backdrop-image);
  background-position: var(--character-backdrop-position);
  background-size: var(--character-backdrop-fit);
  background-repeat: no-repeat;
  /* 5C v3.8 + v3.9b: parallax translate (8px follow) composes with the
     v3.9b 3D perspective tilt. Order matters: perspective goes first,
     then the 2D translate, then the scale(1.12) baseline. */
  transform: perspective(800px) rotateY(calc(var(--parallax-x, 0) * 3deg)) rotateX(calc(var(--parallax-y, 0) * -2deg)) translate(calc(var(--parallax-x, 0) * 8px), calc(var(--parallax-y, 0) * 8px)) scale(1.12);
  transform-origin: 50% 30%;
  pointer-events: none;
  will-change: transform;
}
/* 5C v3 P1.B: head-turn proxy overlay.
   Clips the bottom 70% of the art, leaving only the top 30% visible (the
   "head" strip). Rotates that strip around its center. The body layer
   underneath is untouched, so the effect reads as a head tilt. */
.character-backdrop__face-region {
  position: absolute;
  inset: 0;
  background-image: var(--character-backdrop-image);
  background-position: var(--character-backdrop-position);
  background-size: var(--character-backdrop-fit);
  background-repeat: no-repeat;
  clip-path: inset(0 0 70% 0);
  transform: rotate(var(--character-backdrop-face-rotation, 0deg));
  transform-origin: 50% 50%;
  pointer-events: none;
}
.character-backdrop__vignette {
  background:
    radial-gradient(ellipse at center, transparent 38%, color-mix(in srgb, #000 36%, transparent) 100%),
    linear-gradient(180deg, color-mix(in srgb, #000 18%, transparent) 0%, transparent 22%, transparent 72%, color-mix(in srgb, #000 28%, transparent) 100%);
  pointer-events: none;
}
.character-backdrop__color-wash {
  background: color-mix(in srgb, var(--character-backdrop-tint) var(--character-backdrop-tint-strength), transparent);
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 0;
}
/* 5C v3.9b: micro-lean hover — 3D perspective + lean toward camera +
   slight scale. Replaces the v3.6 flat hover transform.
   The 3D lean (rotateY 2deg) reads as "the figure noticed you" without
   the flat "image grew" feel. */
.character-backdrop:hover .character-backdrop__art {
  transform: perspective(800px) rotateY(2deg) scale(1.04);
}
/* 5C v3.9b: status text overlays (Arknights pattern 1). The kicker is
   top-left, the statusLine bottom-left. Both use text-shadow halos for
   legibility on any art variant. No panel — just text on the image. */
.character-backdrop__kicker {
  position: absolute;
  top: 18px;
  left: 22px;
  z-index: 3;
  pointer-events: none;
  color: var(--archive-paper);
  font-family: var(--font-mono, ui-monospace, "SFMono-Regular", Menlo, monospace);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8), 0 0 18px rgba(0, 0, 0, 0.6);
  /* 5C v3.12: status underline pulse. 1.5s ease-in-out, opacity 60→100.
     The kicker "breathes" attention. v3.12 sped the period from 2.4s
     → 1.5s so the pulse reads as "alive" rather than "slow". */
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  animation: kickerPulse 1.5s ease-in-out infinite alternate;
}
.character-backdrop__status {
  position: absolute;
  bottom: 22px;
  left: 22px;
  z-index: 3;
  pointer-events: none;
  max-width: 36ch;
  color: var(--archive-paper);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 12px;
  font-style: italic;
  line-height: 1.45;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8), 0 0 18px rgba(0, 0, 0, 0.6);
}
@media (prefers-reduced-motion: no-preference) {
  .character-backdrop--has-image .character-backdrop__art-bg {
    transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .character-backdrop--has-image .character-backdrop__face-region {
    transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .character-backdrop__art {
    transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .character-backdrop--has-image::before {
    animation: wallpaperMist 14s ease-in-out infinite alternate;
  }
  .character-backdrop--has-image::after {
    animation: wallpaperGrain 18s steps(9, end) infinite,
               wallpaperLight 9s ease-in-out infinite alternate;
  }
}

/* 5C v3.8: parallax must be off when the user opts out of motion.
   The mousemove driver also no-ops in this branch (via the JS
   matchMedia check), so --parallax-x/y stay at 0 — we just kill the
   600ms follow transition so any stale var can't animate the layer.
   v3.9b: also kill the 3D tilt + kicker pulse
   for users who opt out of motion.
   v3.13: also kill dynamic-wallpaper overlay motion. */
@media (prefers-reduced-motion: reduce) {
  .character-backdrop::before,
  .character-backdrop::after {
    animation: none !important;
  }
  .character-backdrop__art-bg {
    transition: none !important;
    transform: none !important;
    animation: none !important;
  }
  .character-backdrop__kicker {
    animation: none !important;
  }
}

/* 5C v3.13: dynamic-wallpaper motion. The image itself stays fixed;
   local mist, light and grain layers move independently. */
@keyframes wallpaperMist {
  from { transform: translate3d(-2%, -1%, 0); opacity: 0.36; }
  to   { transform: translate3d(2%, 1%, 0); opacity: 0.55; }
}
@keyframes wallpaperGrain {
  from { background-position: 0 0, 0 0, 0 0; }
  to   { background-position: 34px 18px, -28px 22px, 0 60%; }
}
@keyframes wallpaperLight {
  from { opacity: 0.2; }
  to   { opacity: 0.36; }
}

/* 5C v3.9b: kicker underline pulse. 2.4s ease-in-out alternate, opacity
   60% → 100% via text-decoration-color alpha. */
@keyframes kickerPulse {
  from { text-decoration-color: color-mix(in srgb, var(--accent-rose) 60%, transparent); }
  to   { text-decoration-color: color-mix(in srgb, var(--accent-rose) 100%, transparent); }
}
</style>
