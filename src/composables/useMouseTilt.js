import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// 5C v3.9b — Arknights reactive art: 3D perspective mouse tilt.
// Returns tiltX / tiltY refs (degrees, in the requested ranges) and
// listens on `target.value` (a template ref) for mousemove. The
// existing v3.8 parallax already writes --parallax-x / --parallax-y
// in the range -1..1; we derive the tilt from those CSS vars
// (multiplied by the max degrees) so the tilt composes with the
// existing 2D parallax transform without doubling the listeners.
//
// Default ranges per the Arknights research (docs/plan/pinax-arknights-
// reactive-ui.md §3): yaw ±3°, pitch ±2°. P5R's Confidant uses ±5° but
// Arknights is deliberately more restrained — "tactical/operations, not
// cute mascot."
//
// All tilt output is zeroed under prefers-reduced-motion: reduce so the
// art stays static for users who opt out.
export function useMouseTilt(target, { maxYaw = 3, maxPitch = 2 } = {}) {
  const parallaxX = ref(0)
  const parallaxY = ref(0)
  let motionMediaQuery = null
  let reduceMotion = false

  // tiltX / tiltY are already in degrees (CSS-friendly). ±maxYaw / ±maxPitch.
  const tiltX = computed(() => parallaxX.value * maxYaw)
  const tiltY = computed(() => parallaxY.value * -maxPitch)

  function onMove(event) {
    if (reduceMotion) return
    const el = target.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    parallaxX.value = Math.max(-1, Math.min(1, (event.clientX - cx) / (rect.width / 2)))
    parallaxY.value = Math.max(-1, Math.min(1, (event.clientY - cy) / (rect.height / 2)))
  }

  function onLeave() {
    parallaxX.value = 0
    parallaxY.value = 0
  }

  function handleMotionChange(event) {
    reduceMotion = event.matches
    if (reduceMotion) onLeave()
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      reduceMotion = motionMediaQuery.matches
      if (motionMediaQuery.addEventListener) {
        motionMediaQuery.addEventListener('change', handleMotionChange)
      }
    }
    const el = target.value
    if (!el) return
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
  })

  onBeforeUnmount(() => {
    if (motionMediaQuery && motionMediaQuery.removeEventListener) {
      motionMediaQuery.removeEventListener('change', handleMotionChange)
    }
    const el = target.value
    if (!el) return
    el.removeEventListener('mousemove', onMove)
    el.removeEventListener('mouseleave', onLeave)
  })

  return { tiltX, tiltY, parallaxX, parallaxY }
}
