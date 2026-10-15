<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dismissWorkbenchTooltip, tooltipState } from './workbenchTooltip.js'
const popup = ref(null)
const style = ref({})
watch(() => [tooltipState.anchor, tooltipState.text], async () => {
  const anchor = tooltipState.anchor
  if (!anchor) return
  style.value = { visibility: 'hidden', zoom: 1 / (Number(getComputedStyle(document.body).zoom) || 1) }
  await nextTick()
  if (tooltipState.anchor !== anchor || !popup.value || !anchor.isConnected) return
  const rect = anchor.getBoundingClientRect(), size = popup.value.getBoundingClientRect()
  let left = tooltipState.side === 'right' ? rect.right + 8 : rect.left - size.width - 8
  if (left < 8) left = rect.right + 8
  style.value = { zoom: style.value.zoom, left: `${Math.max(8, Math.min(left, innerWidth - size.width - 8))}px`, top: `${Math.max(8, Math.min(rect.top + (rect.height - size.height) / 2, innerHeight - size.height - 8))}px` }
})
onMounted(() => { window.addEventListener('resize', dismissWorkbenchTooltip); window.addEventListener('scroll', dismissWorkbenchTooltip, true) })
onBeforeUnmount(() => { dismissWorkbenchTooltip(); window.removeEventListener('resize', dismissWorkbenchTooltip); window.removeEventListener('scroll', dismissWorkbenchTooltip, true) })
</script>
<template><Teleport to="body"><div v-if="tooltipState.anchor" id="pinax-tool-tooltip" ref="popup" role="tooltip" class="workbench-tooltip" :style="style">{{ tooltipState.text }}</div></Teleport></template>
<style scoped>
.workbench-tooltip { position: fixed; z-index: 2100; box-sizing: border-box; max-width: min(260px, calc(100vw - 16px)); padding: 7px 10px; border: 1px solid var(--hairline-soft); border-radius: 6px; background: var(--surface-workbench-raised); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); font: 12px/1.5 var(--font-interface); pointer-events: none; overflow-wrap: anywhere; }
</style>
