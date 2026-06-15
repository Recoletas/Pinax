<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()
let injectedPreload = null

const VARIANT_CSS = {
  kao: () => import('../../styles/themes/kao.css'),
  legacy: () => import('../../styles/themes/legacy.css'),
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
  await VARIANT_CSS[variant]() // Vite injects CSS chunk on first call
  if (variant === 'kao') injectFontPreload()
  else removeFontPreload()
}

onMounted(() => syncAssets(themeStore.variant))
watch(() => themeStore.variant, (v) => syncAssets(v))
onBeforeUnmount(() => removeFontPreload())
</script>

<template>
  <span data-theme-assets :data-variant="themeStore.variant" style="display:none" aria-hidden="true" />
</template>
