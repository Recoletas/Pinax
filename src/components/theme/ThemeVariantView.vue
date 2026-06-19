<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const props = defineProps({
  view: { type: String, required: true }, // 'welcome' | 'opening' | 'experience'
})

const RESOLVERS = {
  welcome: {
    kao: () => import('../../views/WelcomeView.vue'),
    legacy: () => import('../../views/legacy/WelcomeView.vue'),
  },
  opening: {
    kao: () => import('../../pages/OpeningPage.vue'),
    // pre-kao had no standalone /opening route — opening UI lived in /experience.
    // Legacy variant thus aliases to the legacy Experience view so users who
    // pick "经典 · 暗色" and land on /opening see the pre-kao behavior,
    // not the kao OpeningPage by mistake.
    legacy: () => import('../../pages/legacy/Experience.vue'),
  },
  experience: {
    kao: () => import('../../pages/Experience.vue'),
    legacy: () => import('../../pages/legacy/Experience.vue'),
  },
}

const themeStore = useThemeStore()
const Resolved = computed(() => {
  const bucket = RESOLVERS[props.view]
  if (!bucket) return null
  const loader = bucket[themeStore.variant]
  if (!loader) return null
  return defineAsyncComponent(loader)
})
</script>

<template>
  <component :is="Resolved" :key="`${view}-${themeStore.variant}`" v-if="Resolved" />
  <div v-else class="theme-variant-view-fallback" data-test="theme-variant-fallback">
    Unknown theme variant view: {{ view }}
  </div>
</template>
