<template>
  <Teleport to="body">
    <Transition name="memory-fade">
      <div v-if="showIndicator" class="memory-indicator">
        <div class="memory-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 2v12M2 8h12"/>
            <circle cx="8" cy="8" r="6" stroke-dasharray="4 2"/>
          </svg>
        </div>
        <span class="memory-text">{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const showIndicator = ref(false)
const message = ref('')
let hideTimer = null

function handleMemoryRecorded(event) {
  const { text, type } = event.detail || {}

  const typeLabels = {
    'location_discovery': '发现新地点',
    'item_acquisition': '获得物品',
    'dialogue': '记录对话',
    'decision': '记录决策',
    'general': '记录记忆'
  }

  message.value = `${typeLabels[type] || '记录记忆'}：${text || ''}`
  showIndicator.value = true

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    showIndicator.value = false
  }, 2500)
}

onMounted(() => {
  window.addEventListener('memory-recorded', handleMemoryRecorded)
})

onUnmounted(() => {
  window.removeEventListener('memory-recorded', handleMemoryRecorded)
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<style scoped>
.memory-indicator {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--accent) 90%, #000);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  pointer-events: none;
}

.memory-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.memory-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-fade-enter-active,
.memory-fade-leave-active {
  transition: all 0.3s ease;
}

.memory-fade-enter-from,
.memory-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
