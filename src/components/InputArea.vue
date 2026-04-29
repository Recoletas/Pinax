<template>
  <div class="input-area">
    <div class="quick-actions">
      <button
        v-for="action in quickActions"
        :key="action.text"
        class="quick-btn"
        @click="handleQuickAction(action.text)"
        :disabled="gameStore.isLoading"
      >
        {{ action.icon }} {{ action.label }}
      </button>
    </div>
    <div class="input-row">
      <input
        v-model="inputText"
        type="text"
        class="input"
        placeholder="输入你的行动..."
        @keyup.enter="handleSend"
        :disabled="gameStore.isLoading"
      />
      <button
        class="send-btn"
        @click="handleSend"
        :disabled="gameStore.isLoading || !inputText.trim()"
      >
        <span v-if="!gameStore.isLoading">发送</span>
        <span v-else class="loading-spinner"></span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['send'])
const gameStore = useGameStore()
const inputText = ref('')

const quickActions = [
  { label: '时间流转', icon: '⏰', text: '时间流转' },
  { label: '探索', icon: '🔍', text: '探索' },
  { label: '状态', icon: '📊', text: '状态' },
  { label: '背包', icon: '🎒', text: '背包' }
]

function handleSend() {
  if (inputText.value.trim()) {
    emit('send', inputText.value.trim())
    inputText.value = ''
  }
}

function handleQuickAction(text) {
  emit('send', text)
}
</script>

<style scoped>
.input-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.quick-btn {
  padding: 0.3rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s ease;
}

.quick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.quick-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-row {
  display: flex;
  gap: 0.5rem;
}

.input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: border-color 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.input::placeholder {
  color: var(--text-muted);
}

.input:disabled {
  opacity: 0.5;
}

.send-btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>