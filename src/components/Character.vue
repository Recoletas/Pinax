<template>
  <div class="character-overlay" @click.self="$emit('close')">
    <div class="character-panel">
      <div class="panel-header">
        <span>角色</span>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="character-tabs">
        <button
          :class="['tab', { active: activeTab === 'list' }]"
          @click="activeTab = 'list'"
        >角色列表</button>
        <button
          :class="['tab', { active: activeTab === 'import' }]"
          @click="activeTab = 'import'"
        >导入角色</button>
      </div>

      <div v-if="activeTab === 'list'" class="tab-content">
        <div v-if="characters.length === 0" class="empty-state">
          暂无角色，导入一个开始吧
        </div>
        <div v-else class="character-list">
          <div
            v-for="char in characters"
            :key="char.id"
            :class="['character-item', { selected: selectedChar?.id === char.id }]"
            @click="selectCharacter(char)"
          >
            <img
              v-if="char.avatar"
              :src="char.avatar"
              class="char-avatar"
              alt=""
            />
            <div v-else class="char-avatar placeholder">无头像</div>
            <div class="char-info">
              <span class="char-name">{{ char.name }}</span>
              <span class="char-desc">{{ char.description?.slice(0, 30) || '无描述' }}...</span>
            </div>
          </div>
        </div>

        <div v-if="selectedChar" class="character-detail">
          <div class="detail-header">
            <img
              v-if="selectedChar.avatar"
              :src="selectedChar.avatar"
              class="detail-avatar"
              alt=""
            />
            <div v-else class="detail-avatar placeholder">无头像</div>
            <div class="detail-info">
              <h3>{{ selectedChar.name }}</h3>
              <p v-if="selectedChar.personality" class="personality">{{ selectedChar.personality }}</p>
            </div>
          </div>

          <div v-if="selectedChar.description" class="detail-section">
            <h4>描述</h4>
            <p>{{ selectedChar.description }}</p>
          </div>

          <div v-if="selectedChar.greeting" class="detail-section">
            <h4>招呼语</h4>
            <p class="greeting">{{ selectedChar.greeting }}</p>
          </div>

          <div class="detail-actions">
            <button class="btn" @click="editCharacter">编辑</button>
            <button class="btn btn-danger" @click="deleteCharacter">删除</button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'import'" class="tab-content">
        <div class="import-area">
          <textarea
            v-model="importText"
            class="import-input"
            placeholder="粘贴角色卡 JSON 数据..."
          ></textarea>
          <button class="btn btn-primary" @click="handleImport" :disabled="!importText.trim()">
            导入
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineEmits(['close'])

const activeTab = ref('list')
const importText = ref('')
const characters = ref([])
const selectedChar = ref(null)

function selectCharacter(char) {
  selectedChar.value = char
}

function handleImport() {
  try {
    const data = JSON.parse(importText.value)
    const newChar = {
      id: Date.now().toString(),
      name: data.name || '未命名',
      description: data.description || '',
      personality: data.personality || '',
      greeting: data.greeting || '',
      avatar: data.avatar || ''
    }
    characters.value.push(newChar)
    importText.value = ''
    activeTab.value = 'list'
  } catch (e) {
    alert('JSON 格式错误')
  }
}

function editCharacter() {
  // TODO: open edit modal
}

function deleteCharacter() {
  if (selectedChar.value) {
    characters.value = characters.value.filter(c => c.id !== selectedChar.value.id)
    selectedChar.value = null
  }
}
</script>

<style scoped>
.character-overlay {
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

.character-panel {
  width: 600px;
  max-width: 90%;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.character-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.character-item:hover {
  border-color: var(--text-muted);
}

.character-item.selected {
  border-color: var(--accent);
}

.char-avatar {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
}

.char-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.7rem;
}

.char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.char-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.char-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-detail {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.detail-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.detail-avatar {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  object-fit: cover;
}

.detail-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.8rem;
}

.detail-info h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.detail-info .personality {
  font-size: 0.8rem;
  color: var(--accent);
}

.detail-section {
  margin-bottom: 1rem;
}

.detail-section h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.detail-section p {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.greeting {
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
  font-style: italic;
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: var(--text-muted);
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger {
  color: var(--danger);
}

.btn-danger:hover {
  border-color: var(--danger);
}

.import-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.import-input {
  width: 100%;
  height: 200px;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: monospace;
  resize: none;
}

.import-input:focus {
  outline: none;
  border-color: var(--accent);
}

.import-input::placeholder {
  color: var(--text-muted);
}
</style>