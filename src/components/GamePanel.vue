<template>
  <div class="chat-container" ref="scrollContainer">
    <div v-for="(msg, index) in gameStore.messages" :key="index" :class="['message-item', msg.role]">
      
      <!-- 左侧头像 -->
      <div class="avatar-wrapper">
        <img v-if="msg.role === 'assistant'" :src="getCharacterAvatar()" class="avatar" />
        <div v-else class="avatar user-avatar">?</div>
      </div>

      <!-- 右侧内容 -->
      <div class="message-content">
        <div class="message-header">
          <span class="sender-name">{{ msg.role === 'assistant' ? getCharacterName() : 'User' }}</span>
          <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
          
          <div class="message-actions">
            <!-- 删除按钮 -->
            <span class="icon delete-icon" @click="deleteMsg(index)" title="删除">🗑</span>
            <!-- 编辑按钮 -->
            <span class="icon edit-icon" @click="startEdit(index, msg.content)" title="编辑">✎</span>
          </div>
        </div>

        <!-- 思考模块 -->
        <div v-if="msg.reasoning_content" class="reasoning-block">
          <details :open="index === gameStore.messages.length - 1">
            <summary>思考了一会</summary>
            <div class="reasoning-text">{{ msg.reasoning_content }}</div>
          </details>
        </div>

        <!-- 内容区域：根据是否在编辑状态切换显示 -->
        <div class="text-area-wrapper">
          <!-- 编辑模式 -->
          <div v-if="editingIndex === index" class="edit-mode">
            <textarea 
              v-model="editText" 
              class="edit-textarea" 
              ref="editInput"
              rows="3"
            ></textarea>
            <div class="edit-buttons">
              <button class="edit-btn save" @click="saveEdit(index)">保存</button>
              <button class="edit-btn cancel" @click="cancelEdit">取消</button>
            </div>
          </div>
          
          <!-- 阅读模式 -->
          <div 
            v-else 
            class="text-body" 
            v-html="formatRPText(msg.content)"
            @dblclick="startEdit(index, msg.content)" 
          ></div>
        </div>
      </div>
    </div>
    <div ref="bottomAnchor"></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)

// 编辑相关的响应式变量
const editingIndex = ref(-1)
const editText = ref('')
const editInput = ref(null)

// 开始编辑
function startEdit(index, content) {
  editingIndex.value = index
  editText.value = content
  // 自动聚焦 textarea
  nextTick(() => {
    const el = document.querySelector('.edit-textarea')
    if (el) el.focus()
  })
}

// 取消编辑
function cancelEdit() {
  editingIndex.value = -1
  editText.value = ''
}

// 保存编辑
function saveEdit(index) {
  if (editText.value.trim()) {
    // 调用 store 的更新方法
    gameStore.updateMessage(index, editText.value)
  }
  cancelEdit()
}

// 删除消息
function deleteMsg(index) {
  if (confirm('确定要删除这条消息吗？')) {
    gameStore.deleteMessage(index)
  }
}

// 基础辅助函数
function getCharacterName() { return gameStore.currentCharacter?.name || 'Seraphina' }
function getCharacterAvatar() { return gameStore.currentCharacter?.avatar || '' }

function formatRPText(text) {
  if (!text) return ''
  let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return safeText
    .replace(/\*([^*]+)\*/g, '<em class="action">*$1*</em>')
    .replace(/"([^"]+)"/g, '<span class="dialogue">"$1"</span>')
    .replace(/\n/g, '<br>')
}

function formatTime(ts) {
  const date = ts ? new Date(ts) : new Date()
  return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0')
}

// 自动滚动
watch(() => gameStore.messages, () => {
  nextTick(() => {
    if (bottomAnchor.value && editingIndex.value === -1) {
      bottomAnchor.value.scrollIntoView({ behavior: 'smooth' })
    }
  })
}, { deep: true })
</script>

<style scoped>
/* 继承之前的样式，增加编辑模式相关的样式 */
.chat-container {
  display: flex; flex-direction: column; gap: 24px; padding: 20px;
  background: #111111; height: 100%; overflow-y: auto;
}

.message-item { display: flex; gap: 16px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #222; border: 1px solid #333; }
.user-avatar { background: #252525; display: flex; align-items: center; justify-content: center; color: #555; }

.message-content { flex: 1; min-width: 0; }
.message-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.sender-name { font-weight: 600; color: #fff; font-size: 15px; }
.timestamp { font-size: 11px; color: #555; }

.message-actions { margin-left: auto; display: flex; gap: 12px; color: #222; }
.message-item:hover .message-actions { color: #555; }
.icon { cursor: pointer; font-size: 14px; }
.icon:hover { color: #aaa; }
.delete-icon:hover { color: #ff4d4f; }

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 5px;
}

.edit-textarea {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #ccc;
  padding: 10px;
  font-size: 15px;
  line-height: 1.6;
  outline: none;
  font-family: inherit;
}

.edit-textarea:focus {
  border-color: #e58e35;
}

.edit-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.edit-btn {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #444;
}

.edit-btn.save {
  background: #e58e35;
  color: white;
  border: none;
}

.edit-btn.cancel {
  background: #333;
  color: #ccc;
}

/* 文本正文 */
.text-body { line-height: 1.6; font-size: 15px; color: #b5b5b5; white-space: pre-wrap; cursor: text; }
:deep(.dialogue) { color: #e58e35; }
:deep(.action) { font-style: italic; opacity: 0.9; }

.reasoning-block { margin: 12px 0; max-width: 90%; }
details { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; }
summary { padding: 6px 12px; color: #777; font-size: 12px; cursor: pointer; }
.reasoning-text { padding: 10px 12px; color: #666; font-size: 13px; font-style: italic; border-top: 1px solid #252525; }
</style>