<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()
let injectedPreload = null

// legacy is the un-styled baseline — main.css provides the base tokens,
// and there's no archive-folio chrome or LXGW @font-face for that
// variant, so no CSS chunk needs to load. kao IS statically imported
// from main.js (see Fixup 1), but we still record it here so the
// dynamic syncAssets() contract is symmetric across both branches.
const VARIANT_CSS = {
  kao: () => import('../../styles/themes/kao.css'),
  legacy: null,
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
  // Only await a CSS chunk if the variant has one. legacy is null
  // (un-styled baseline); kao is statically preloaded by main.js but the
  // dynamic import here is still a no-op if Vite has already injected it.
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
