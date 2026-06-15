<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { useViewportHeight } from './composables/useViewportHeight'
import MemoryIndicator from './components/MemoryIndicator.vue'
import { useGameStore } from './stores/gameStore'

const { initTheme } = useTheme()
const route = useRoute()
const gameStore = useGameStore()
const generationMetaNotice = ref('')
const hasUserActionMessages = computed(() => {
  return (gameStore.messages || []).some((message) => (message.role || message.type) === 'user')
})
const isExperienceEntryTransition = computed(() => route.name === 'experience' && !hasUserActionMessages.value)
const showGlobalMemoryIndicator = computed(() => !route.meta?.hideGlobalMemory && !isExperienceEntryTransition.value)
let noticeTimer = null

useViewportHeight()

function syncDocumentTitle() {
  const fallbackTitle = route.name === 'welcome' ? '工作台' : String(route.name || 'Pinax')
  const title = String(route.meta?.title || fallbackTitle || 'Pinax').trim()
  document.title = title ? `${title} - Pinax` : 'Pinax'
}

function hideNotice() {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  generationMetaNotice.value = ''
}

function handleGenerationMeta(event) {
  const meta = event?.detail || {}
  const pieces = []

  if (meta.truncatedInput) {
    pieces.push('输入过长，已自动压缩上下文')
  }

  if (Number(meta.retryCount) > 0) {
    pieces.push(`检测到重试流程：${Number(meta.retryCount)} 次`)
  }

  if (Array.isArray(meta.warnings) && meta.warnings.length > 0) {
    pieces.push(String(meta.warnings[0]))
  }

  if (!pieces.length) return

  generationMetaNotice.value = pieces.join('；')
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    generationMetaNotice.value = ''
    noticeTimer = null
  }, 5000)
}

onMounted(() => {
  initTheme()
  window.addEventListener('ai-generation-meta', handleGenerationMeta)
  syncDocumentTitle()
})

onBeforeUnmount(() => {
  window.removeEventListener('ai-generation-meta', handleGenerationMeta)
  hideNotice()
})

watch(
  () => [route.name, route.meta?.title],
  () => {
    syncDocumentTitle()
  }
)
</script>

<template>
  <div class="app-root">
    <router-view />
    <transition name="meta-toast-fade">
      <div v-if="generationMetaNotice" class="generation-meta-toast">
        {{ generationMetaNotice }}
      </div>
    </transition>
    <MemoryIndicator v-if="showGlobalMemoryIndicator" />
  </div>
</template>

<style>
/* Global app styles are in main.css */

.app-root {
  min-height: var(--app-viewport-height, 100vh);
}

.generation-meta-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  max-width: min(560px, calc(100vw - 32px));
  background: rgba(16, 18, 24, 0.92);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(4px);
}

.meta-toast-fade-enter-active,
.meta-toast-fade-leave-active {
  transition: opacity 0.2s ease;
}

.meta-toast-fade-enter-from,
.meta-toast-fade-leave-to {
  opacity: 0;
}
</style>
