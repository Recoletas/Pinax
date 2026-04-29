<template>
  <div class="game-panel">
    <div class="chat-output" ref="chatOutput">
      <div
        v-for="(msg, index) in gameStore.messages"
        :key="index"
        class="message"
        :class="[`message-${msg.type}`, msg.category ? `category-${msg.category}` : '']"
      >
        <div class="message-bubble">
          <div class="message-content">{{ msg.content }}</div>
          <div v-if="msg.choices && msg.choices.length" class="choices">
            <button
              v-for="choice in msg.choices"
              :key="choice.text"
              class="choice-btn"
              @click="handleChoice(choice)"
            >
              {{ choice.text }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="gameStore.isLoading" class="loading-indicator">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const chatOutput = ref(null)

watch(() => gameStore.messages.length, () => {
  nextTick(() => {
    if (chatOutput.value) {
      chatOutput.value.scrollTop = chatOutput.value.scrollHeight
    }
  })
})

function handleChoice(choice) {
  gameStore.sendAction(choice.text)
}
</script>

<style scoped>
.game-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 400px;
}

.chat-output {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message {
  display: flex;
  animation: fadeIn 0.2s ease;
}

.message-user {
  justify-content: flex-end;
}

.message-narrator {
  justify-content: flex-start;
}

.message-system {
  justify-content: center;
}

.message-bubble {
  max-width: 75%;
  padding: 0.625rem 0.875rem;
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.6;
}

.message-system .message-bubble {
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
}

.message-narrator .message-bubble {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-bottom-left-radius: 2px;
}

.message-user .message-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 2px;
}

.message-content {
  line-height: 1.6;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.625rem;
}

.choice-btn {
  padding: 0.35rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.choice-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.loading-indicator {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.75rem;
}

.loading-dot {
  width: 6px;
  height: 6px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dot:nth-child(1) { animation-delay: -0.32s; }
.loading-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>