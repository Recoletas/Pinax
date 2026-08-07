<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { useViewportHeight } from './composables/useViewportHeight'
import MemoryIndicator from './components/MemoryIndicator.vue'
import ThemeAssets from './components/theme/ThemeAssets.vue'
import TipBanner from './components/tip/TipBanner.vue'
import { useGameStore } from './stores/gameStore'
import { useThemeStore } from './stores/themeStore.js'
import { useTipState } from './composables/useTipState'
import { ensureDefaultImageConfig } from './services/media/imageProviderConfigStore'

const { initTheme } = useTheme()
const themeStore = useThemeStore()
themeStore.initTheme()
const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()
const tip = useTipState()
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
  document.title = title ? `${title} - Pinax` : ''
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

// 任意代码 (含 useApiSettings 等非 Vue 模块) 都可以通过
// window.dispatchEvent(new CustomEvent('pinax:show-tip', { detail: {...} })) 触发 tip。
function handleShowTipEvent(event) {
  const detail = event?.detail
  if (!detail || !detail.id) return
  // 自动注入 router, 让 cta.action 可以直接跳转
  const cta = detail.cta ? {
    label: detail.cta.label,
    action: () => {
      if (typeof detail.cta.action === 'function') {
        detail.cta.action({ router })
      } else if (detail.cta.to) {
        router.push(detail.cta.to)
      }
    }
  } : null
  tip.showTip({
    id: detail.id,
    title: detail.title || '',
    body: detail.body || '',
    cta,
    variant: detail.variant || 'info',
    autoHide: detail.autoHide !== false,
    category: detail.category || 'info'
  })
}

// Phase C5: memory-candidate-created 翻译为 tip
// scope 不是 'session' (即 global-author / worldbook 等可复用素材) 时触发
function handleMemoryCandidateCreated(event) {
  const detail = event?.detail
  if (!detail || !detail.id) return
  if (detail.scope === 'session') return
  const tipId = `asset-auto-detected-${detail.id}`
  if (tip.isSeen(tipId)) return
  const text = String(detail.text || '').slice(0, 28)
  tip.showTip({
    id: tipId,
    title: '已自动识别到素材',
    body: `「${text}…」已加入候选。点左下角 记忆 按钮确认。`,
    variant: 'success',
    autoHide: true
  })
}

onMounted(() => {
  window.addEventListener('ai-generation-meta', handleGenerationMeta)
  window.addEventListener('pinax:show-tip', handleShowTipEvent)
  window.addEventListener('memory-candidate-created', handleMemoryCandidateCreated)
  syncDocumentTitle()
  // Tip 系统绑定 router (category=nav 的 tip 在路由切换时自动 dismiss)
  tip.bindRouter(router)
  // Phase D: 首次启动时幂等插入 MiniMax 默认图片配置
  try {
    ensureDefaultImageConfig()
  } catch (e) {
    console.warn('[App] ensureDefaultImageConfig failed:', e)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('ai-generation-meta', handleGenerationMeta)
  window.removeEventListener('pinax:show-tip', handleShowTipEvent)
  window.removeEventListener('memory-candidate-created', handleMemoryCandidateCreated)
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
    <ThemeAssets />
    <router-view />
    <transition name="meta-toast-fade">
      <div
        v-if="generationMetaNotice"
        class="generation-meta-toast"
        role="status"
        aria-live="polite"
      >
        {{ generationMetaNotice }}
      </div>
    </transition>
    <MemoryIndicator v-if="showGlobalMemoryIndicator" />
    <TipBanner />
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
  z-index: var(--z-toast, 900);
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