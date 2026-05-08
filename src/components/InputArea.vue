<template>
  <div class="input-area">
    <div class="prompt-info" v-if="showPromptInfo">
      <div class="prompt-bar">
        <div class="prompt-segment context" :style="{ width: contextPercent + '%' }"></div>
        <div class="prompt-segment history" :style="{ width: historyPercent + '%' }"></div>
        <div class="prompt-segment input" :style="{ width: inputPercent + '%' }"></div>
      </div>

      <div class="prompt-stats">
        <span class="stat">
          <span class="stat-label">上下文</span>
          <span class="stat-value">{{ contextTokens }}</span>
        </span>
        <span class="stat">
          <span class="stat-label">历史</span>
          <span class="stat-value">{{ historyTokens }}</span>
        </span>
        <span class="stat">
          <span class="stat-label">输入</span>
          <span class="stat-value">{{ inputTokens }}</span>
        </span>
        <span class="stat total">
          <span class="stat-label">合计</span>
          <span class="stat-value">{{ totalTokens }}</span>
        </span>
      </div>

      <button class="detail-btn" @click="showDetail = true">
        查看详情
      </button>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <span>提示词详情</span>
          <button class="close-btn" @click="showDetail = false">×</button>
        </div>
        <div class="modal-tabs">
          <button :class="['tab', { active: detailTab === 'context' }]" @click="detailTab = 'context'">上下文</button>
          <button :class="['tab', { active: detailTab === 'history' }]" @click="detailTab = 'history'">历史</button>
          <button :class="['tab', { active: detailTab === 'system' }]" @click="detailTab = 'system'">系统</button>
        </div>
        <div class="modal-body">
          <div v-if="detailTab === 'context'" class="content-preview">
            <div class="text-content">{{ contextMsg ? contextMsg.content : '无上下文' }}</div>
          </div>
          <div v-if="detailTab === 'history'" class="content-preview">
            <div v-if="gameStore.chatHistory.length === 0" class="empty">无历史记录</div>
            <div v-else>
              <div v-for="(msg, i) in gameStore.chatHistory" :key="i" class="history-item">
                <span class="role">{{ msg.role }}</span>
                <div class="text-content">{{ msg.content }}</div>
              </div>
            </div>
          </div>
          <div v-if="detailTab === 'system'" class="content-preview">
            <div class="text-content">{{ systemPromptContent }}</div>
          </div>
        </div>
      </div>
    </div>

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
        @input="updatePromptInfo"
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
      <button class="info-btn" @click="showPromptInfo = !showPromptInfo" title="提示词信息">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 0h1v9h-1V0zm0 10h1v4h-1v-4zM4 4h1v6H4V4zm6 2h1v4h-1V6z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { buildContextMessage } from '../services/api'

const emit = defineEmits(['send'])
const gameStore = useGameStore()
const inputText = ref('')
const showPromptInfo = ref(false)
const showDetail = ref(false)
const detailTab = ref('context')

const systemPromptContent = `【身份】你是一位资深的文学创作助手，专注于为作者提供叙事支持和灵感启发。

【核心能力】
- 用生动的语言描绘场景氛围、环境细节、人物动作与心理活动
- 根据既有设定自然地推进叙事脉络
- 与创作者互动，响应其创作意图并提供灵感

【回复格式要求】
- 使用 *动作* 格式描述角色动作
- 使用 "对话" 格式描述对话
- 段落分明，场景转换时使用空行
- 长度适中，一般 50-200 字`

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

function estimateTokens(text) {
  if (!text) return 0
  const chinese = (text.match(/[一-龥]/g) || []).length
  const english = (text.match(/[a-zA-Z]/g) || []).length
  return Math.ceil(chinese * 1.5 + english / 1.3)
}

const contextMsg = computed(() => buildContextMessage())
const contextTokens = computed(() => contextMsg.value ? estimateTokens(contextMsg.value.content) : 0)
const historyTokens = computed(() => {
  let tokens = 0
  gameStore.chatHistory.forEach(m => {
    tokens += estimateTokens(m.content)
  })
  return tokens
})
const inputTokens = computed(() => estimateTokens(inputText.value))

const totalTokens = computed(() => contextTokens.value + historyTokens.value + inputTokens.value)

const contextPercent = computed(() => {
  const total = totalTokens.value || 1
  return (contextTokens.value / total * 100).toFixed(1)
})
const historyPercent = computed(() => {
  const total = totalTokens.value || 1
  return (historyTokens.value / total * 100).toFixed(1)
})
const inputPercent = computed(() => {
  const total = totalTokens.value || 1
  return (inputTokens.value / total * 100).toFixed(1)
})

function updatePromptInfo() {
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
  gap: 0;
}

.quick-btn {
  padding: 6px 14px;
  background: var(--bg-tertiary);
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  white-space: nowrap;
}
.quick-btn:first-child { border-radius: 6px 0 0 6px; }
.quick-btn:last-child { border-right: none; border-radius: 0 6px 6px 0; }
.quick-btn:only-child { border-radius: 6px; border-right: none; }
.quick-btn:hover { background: var(--bg-hover); }
.quick-btn:active { background: var(--accent-light); }

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

.prompt-info {
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 8px 12px;
}

.prompt-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-primary);
  margin-bottom: 8px;
}

.prompt-segment {
  height: 100%;
  transition: width 0.3s;
}

.prompt-segment.context { background: var(--accent); }
.prompt-segment.history { background: #34d399; }
.prompt-segment.input { background: #fbbf24; }

.prompt-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prompt-stats .stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.prompt-stats .stat-label {
  color: var(--text-muted);
}

.prompt-stats .stat-value {
  color: var(--text-primary);
  font-weight: 500;
}

.prompt-stats .stat.total .stat-value {
  color: var(--accent);
}

.detail-btn {
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.detail-btn:hover { border-color: var(--accent); color: var(--accent); }

/* 详情弹窗 */
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.detail-modal {
  width: 600px;
  max-width: 95%;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}
.close-btn:hover { background: var(--bg-hover); }

.modal-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.modal-tabs .tab {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.modal-tabs .tab:hover { color: var(--text-secondary); }
.modal-tabs .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.content-preview {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.text-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.history-item {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.history-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

.history-item .role {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.empty {
  color: var(--text-muted);
  text-align: center;
  padding: 20px;
  font-size: 13px;
}

.info-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.info-btn:hover { border-color: var(--accent); color: var(--accent); }
</style>