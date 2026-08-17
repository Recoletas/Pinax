<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()
let injectedPreload = null

// legacy carries the blue-white toolbox/archive variant. It does not
// preload LXGW, but it may own small .theme-legacy-gated chrome rules
// for migrated workbench surfaces as theme 2 becomes product-ready.
const VARIANT_CSS = {
  kao: () => import('../../styles/themes/kao.css'),
  // G1.4.10 R1: experience-reading.css is the single visual owner for theme 2
  // Experience page typography. Loaded together with legacy.css so the legacy
  // variant gets both the toolbox chrome and the reading-plane geometry in
  // one dynamic chunk.
  legacy: () => Promise.all([
    import('../../styles/themes/legacy.css'),
    import('../../styles/experience-reading.css'),
    // U1：主题2工作区控件层级（按钮/命令组语义），独立于 legacy.css 避免继续膨胀
    import('../../styles/workbench-controls.css'),
  ]),
}

const FONT_HREF = '/src/assets/fonts/LXGWWenKai-Regular.woff2' // Vite resolves at build

function injectFontPreload() {
  if (document.querySelector('link[data-theme-font="LXGW"]')) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'font'
  link.type = 'font/woff2'
  link.href = FONT_HREF
  link.crossOrigin = 'anonymous'
  link.dataset.themeFont = 'LXGW'
  document.head.appendChild(link)
  injectedPreload = link
}

function removeFontPreload() {
  if (injectedPreload && injectedPreload.parentNode) {
    injectedPreload.parentNode.removeChild(injectedPreload)
  }
  injectedPreload = null
}

async function syncAssets(variant) {
  // Font preload is variant-gated and applied synchronously so observers
  // see the <link> as soon as the variant changes.
  if (variant === 'kao') injectFontPreload()
  else removeFontPreload()
  // Load the variant CSS chunk. Selectors are gated by .theme-kao or
  // .theme-legacy because Vite-injected CSS remains after switching.
  const loader = VARIANT_CSS[variant]
  if (loader) await loader()
}

onMounted(() => syncAssets(themeStore.variant))
watch(() => themeStore.variant, (v) => syncAssets(v))
onBeforeUnmount(() => removeFontPreload())
</script>

<template>
  <span data-theme-assets :data-variant="themeStore.variant" style="display:none" aria-hidden="true" />
</template>
