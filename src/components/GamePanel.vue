<template>
  <!-- 确保容器有高度且可滚动 -->
  <div class="chat-container" ref="scrollContainer">
    <div v-for="(msg, index) in gameStore.messages" :key="index" :class="['msg-item', msg.role]">
      
      <!-- 头像列 -->
      <div class="avatar-column">
        <template v-if="msg.role === 'assistant'">
          <!-- 这里的 ?. 是为了防止 aiCharacter 为空时报错 -->
          <img v-if="gameStore.aiCharacter?.avatar" :src="gameStore.aiCharacter.avatar" class="tavern-avatar" />
          <div v-else class="tavern-avatar ai-icon">
            {{ (msg.name || 'A')[0] }}
          </div>
        </template>
        
        <template v-else>
          <img v-if="gameStore.playerCharacter?.avatar" :src="gameStore.playerCharacter.avatar" class="tavern-avatar" />
          <div v-else class="tavern-avatar user-icon">
            {{ (msg.name || 'U')[0] }}
          </div>
        </template>
      </div>

      <!-- 内容列 -->
      <div class="msg-column">
        <div class="msg-header">
          <!-- 名字优先级：消息记录的名字 > Store当前角色名 > 默认占位符 -->
          <span class="display-name">
            {{ msg.name || (msg.role === 'user' ? (gameStore.playerCharacter?.name || 'User') : (gameStore.aiCharacter?.name || 'Assistant')) }}
          </span>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          
          <div class="msg-actions">
            <!-- 只有用户消息可以触发“重新执行” -->
            <span v-if="msg.role === 'user'" class="icon-btn execute" @click="gameStore.regenerateFrom(index)" title="重写后续">▶</span>
            <span class="icon-btn" @click="startEdit(index, msg.content)" title="编辑内容">✎</span>
            <!-- 建议增加删除，方便调试 -->
            <span class="icon-btn delete" @click="gameStore.deleteMessage(index)" title="删除">🗑</span>
          </div>
        </div>

        <!-- 思考框 (DeepSeek 专用) -->
        <div v-if="msg.reasoning_content" class="thought-wrapper">
          <details :open="index === gameStore.messages.length - 1">
            <summary>思考过程 <span class="arrow">▾</span></summary>
            <div class="thought-body">{{ msg.reasoning_content }}</div>
          </details>
        </div>

        <!-- 正文区域 -->
        <div class="text-wrapper">
          <div v-if="editingIndex === index" class="edit-area">
            <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
            <div class="edit-footer">
              <button class="tavern-btn primary" @click="saveEdit(index)">保存修改</button>
              <button class="tavern-btn" @click="editingIndex = -1">取消</button>
            </div>
          </div>
          <!-- 渲染 Markdown/引号/星号 -->
          <div v-else class="text-main" v-html="formatRPText(msg.content)"></div>
        </div>
      </div>
    </div>
    <!-- 自动滚动锚点 -->
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
const editingIndex = ref(-1)
const editText = ref('')
const editTextarea = ref(null)

const startEdit = (index, text) => {
  editingIndex.value = index
  editText.value = text
  nextTick(() => {
    editTextarea.value?.focus()
  })
}

const saveEdit = (index) => {
  if (editText.value.trim()) {
    gameStore.updateMessage(index, editText.value)
  }
  editingIndex.value = -1
}

const formatRPText = (text) => {
  if (!text) return ''
  // 基础转义
  const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return safeText
    // *星号动作* -> 斜体
    .replace(/\*([^*]+)\*/g, '<em class="rp-action">*$1*</em>')
    // "双引号对话" -> 橙色高亮
    .replace(/"([^"]+)"/g, '<span class="rp-dialogue">"$1"</span>')
    // 换行符 -> <br>
    .replace(/\n/g, '<br>')
}

const formatTime = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 自动滚动逻辑
const scroll = () => {
  nextTick(() => {
    if (bottomAnchor.value) {
      bottomAnchor.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  })
}

watch(() => gameStore.messages.length, scroll)
onMounted(scroll)
</script>

<style scoped>
.chat-container {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: #111; /* 背景色必须有 */
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.msg-item { display: flex; gap: 16px; width: 100%; }

/* 头像列 */
.avatar-column { flex-shrink: 0; }
.tavern-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #333;
  font-size: 20px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* AI 默认头像颜色 */
.ai-icon { background: #2c3e50; color: #3498db; }
/* 用户默认头像颜色 */
.user-icon { background: #222; color: #666; }

.msg-column { flex: 1; min-width: 0; }

.msg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.display-name { font-weight: bold; color: #fff; font-size: 15px; }
.msg-time { font-size: 11px; color: #444; }

/* 操作按钮 */
.msg-actions { margin-left: auto; display: flex; gap: 12px; opacity: 0; transition: 0.2s; }
.msg-item:hover .msg-actions { opacity: 1; }
.icon-btn { cursor: pointer; color: #444; font-size: 14px; }
.icon-btn:hover { color: #888; }
.icon-btn.execute:hover { color: #52c41a; }
.icon-btn.delete:hover { color: #ff4d4f; }

/* 思考过程 */
.thought-wrapper { margin-bottom: 12px; max-width: 90%; }
details { background: #1a1a1a; border-radius: 8px; border: 1px solid #252525; }
summary { padding: 8px 12px; color: #666; font-size: 12px; cursor: pointer; list-style: none; outline: none; }
summary .arrow { margin-left: 5px; }
.thought-body { padding: 12px; color: #555; font-size: 13px; border-top: 1px solid #222; font-style: italic; line-height: 1.5; }

/* 文本正文 */
.text-main {
  font-size: 16px;
  line-height: 1.7;
  color: #a0a0a0; /* 叙述文字调浅一点的灰色 */
  white-space: pre-wrap;
  word-break: break-word;
}

/* 引号高亮：橙黄色 */
:deep(.rp-dialogue) {
  color: #e58e35;
}

/* 星号动作：斜体 */
:deep(.rp-action) {
  font-style: italic;
  opacity: 0.8;
}

/* 编辑器 */
.tavern-textarea {
  width: 100%; background: #080808; color: #ccc; border: 1px solid #333;
  padding: 12px; border-radius: 4px; font-family: inherit; line-height: 1.6;
  resize: vertical; outline: none;
}
.tavern-textarea:focus { border-color: #e58e35; }
.edit-footer { margin-top: 10px; display: flex; gap: 10px; justify-content: flex-end; }
.tavern-btn { padding: 5px 15px; border-radius: 4px; cursor: pointer; border: 1px solid #333; background: #222; color: #999; }
.tavern-btn.primary { background: #e58e35; color: #fff; border: none; }
</style>