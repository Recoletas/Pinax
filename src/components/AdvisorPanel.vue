<template>
  <Teleport to="body">
    <div v-if="isOpen" class="advisor-overlay" @click.self="$emit('close')">
      <div class="advisor-panel">
        <!-- Header -->
        <div class="advisor-header">
          <div class="advisor-title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="5"></circle>
              <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
            </svg>
            <span>创作顾问</span>
          </div>
          <div class="advisor-actions">
            <button
              class="backend-btn"
              :class="{ active: backend === 'openai' }"
              @click="backend = 'openai'"
              title="使用 AI API"
            >
              AI
            </button>
            <button
              class="backend-btn"
              :class="{ active: backend === 'openclaw' }"
              @click="backend = 'openclaw'"
              title="使用 OpenClaw Gateway"
            >
              OpenClaw
            </button>
            <button class="close-btn" @click="$emit('close')" title="关闭">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="advisor-messages" ref="messagesRef">
          <div v-if="messages.length === 0" class="advisor-empty">
            <p>创作顾问可帮助你分析当前创作状态，提供建议和灵感。</p>
          </div>
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="message"
            :class="msg.role"
          >
            <div class="message-label">{{ msg.role === 'user' ? '你' : '顾问' }}</div>
            <div class="message-bubble">{{ msg.content }}</div>
          </div>
          <div v-if="loading" class="message advisor">
            <div class="message-label">顾问</div>
            <div class="message-bubble loading">
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
            </div>
          </div>
        </div>

        <!-- Quick questions -->
        <div class="advisor-quick" v-if="messages.length === 0">
          <button
            v-for="q in quickQuestions"
            :key="q"
            class="quick-btn"
            @click="askQuestion(q)"
          >
            {{ q }}
          </button>
        </div>

        <!-- Input -->
        <div class="advisor-input-row">
          <textarea
            v-model="inputText"
            class="advisor-input"
            placeholder="输入你的问题... (Ctrl+Enter 发送)"
            rows="1"
            @keydown="handleInputKeydown"
            ref="inputRef"
          ></textarea>
          <button
            class="send-btn"
            :disabled="!inputText.trim() || loading"
            @click="sendInput"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2L7 9M14 2L9 14L7 9M14 2L2 7L7 9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  onGetAdvice: Function,       // AI mode: use sendChat
  contextProvider: Function    // OpenClaw mode: provide context
})

const emit = defineEmits(['close'])

const backend = ref('openai')
const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const messagesRef = ref(null)
const inputRef = ref(null)

const quickQuestions = [
  '分析当前节奏',
  '情绪分布如何',
  '结构建议',
  '续写灵感'
]

watch(() => props.isOpen, (open) => {
  if (open) {
    nextTick(() => inputRef.value?.focus())
  }
})

watch(messages, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}, { deep: true })

function handleInputKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendInput()
  }
}

async function sendInput() {
  const text = inputText.value.trim()
  if (!text || loading.value) return
  askQuestion(text)
}

async function askQuestion(question) {
  if (loading.value) return
  loading.value = true
  inputText.value = ''

  messages.value.push({ role: 'user', content: question })

  try {
    let advice = ''
    if (backend.value === 'openai') {
      if (!props.onGetAdvice) {
        advice = 'AI 模式未配置 onGetAdvice 函数'
      } else {
        advice = await props.onGetAdvice(question)
      }
    } else {
      if (!props.contextProvider) {
        advice = 'OpenClaw 模式未配置 contextProvider 函数'
      } else {
        const context = await props.contextProvider()
        advice = await props.openclawAdvice(question, context)
      }
    }
    messages.value.push({ role: 'advisor', content: advice })
  } catch (e) {
    messages.value.push({ role: 'advisor', content: `获取建议失败：${e.message || e}` })
  } finally {
    loading.value = false
  }
}

async function openclawAdvice(question, context) {
  const response = await fetch('/api/openclaw/advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, question })
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  return data.advice || '未获取到有效建议'
}

defineExpose({ askQuestion })
</script>

<style scoped>
.advisor-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 0 20px 20px;
}

.advisor-panel {
  position: relative;
  z-index: 901;
  width: 380px;
  max-height: 560px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.advisor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-secondary));
  flex-shrink: 0;
}

.advisor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}

.advisor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.backend-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.backend-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.backend-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.close-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.advisor-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advisor-empty {
  text-align: center;
  padding: 20px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.advisor-empty p {
  margin: 0;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message.user {
  align-items: flex-end;
}

.message.advisor {
  align-items: flex-start;
}

.message-label {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 0 4px;
}

.message-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.advisor .message-bubble {
  background: var(--bg-tertiary, #2a2a2a);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.message-bubble.loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
  animation: bounce 1.2s infinite;
}

.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.advisor-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.quick-btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.advisor-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.advisor-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  resize: none;
  min-height: 36px;
  max-height: 80px;
  font-family: inherit;
  line-height: 1.4;
}

.advisor-input:focus {
  outline: none;
  border-color: var(--accent);
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  filter: brightness(1.1);
}
</style>