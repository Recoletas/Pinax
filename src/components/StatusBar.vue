<template>
  <div class="status-bar">
    <div class="status-header">
      <span class="status-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 7a2 2 0 100-4 2 2 0 000 4zM3 13c0-2 1.5-3 4-3s4 1 4 3H3z"/>
        </svg>
      </span>
      <span>角色</span>
    </div>

    <div class="character-profile" @click="showDetail = true">
      <div class="avatar-wrapper">
        <img v-if="playerAvatar" :src="playerAvatar" class="avatar" />
        <div v-else class="avatar placeholder">
          {{ (playerName || '你')[0] }}
        </div>
      </div>
      <div class="profile-info">
        <div class="character-name">{{ playerName || '未命名' }}</div>
        <div class="character-mood">
          <span class="mood-indicator" :style="{ background: moodGradient }"></span>
          <span class="mood-text">{{ currentMoodLabel }}</span>
        </div>
      </div>
      <svg class="expand-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
        <path d="M3 4.5L6 7.5L9 4.5" stroke-width="1.5"/>
      </svg>
    </div>

    <div class="traits-section">
      <div class="section-label">性格标签</div>
      <div class="trait-tags">
        <span v-for="trait in characterTraits" :key="trait" class="trait-tag">{{ trait }}</span>
        <span v-if="!characterTraits.length" class="no-trait">暂无性格标签</span>
      </div>
    </div>

    <div class="mood-section">
      <div class="section-label">当前心境</div>
      <div class="mood-bar-wrapper">
        <div class="mood-bar">
          <div class="mood-fill" :style="{ width: moodPercent + '%', background: moodGradient }"></div>
        </div>
        <div class="mood-labels">
          <span>低落</span>
          <span>平静</span>
          <span>昂扬</span>
        </div>
      </div>
    </div>

    <div class="quick-stats">
      <div class="stat-item">
        <span class="stat-label">年龄</span>
        <span class="stat-value">{{ playerAge }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">性别</span>
        <span class="stat-value">{{ playerGender }}</span>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="detail-overlay" @click.self="closeModal">
      <div class="detail-modal">
        <div class="modal-header">
          <span>角色详情</span>
          <button class="close-btn" @click="closeModal">×</button>
        </div>

        <div class="modal-tabs">
          <button :class="['tab', { active: activeTab === 'info' }]" @click="activeTab = 'info'">信息</button>
          <button :class="['tab', { active: activeTab === 'import' }]" @click="activeTab = 'import'">导入</button>
        </div>

        <div class="modal-body">
          <!-- 信息标签页 -->
          <div v-if="activeTab === 'info'" class="tab-content">
            <div class="detail-section">
              <div class="detail-avatar-wrapper">
                <img v-if="playerAvatar" :src="playerAvatar" class="detail-avatar" />
                <div v-else class="detail-avatar placeholder">
                  {{ (playerName || '你')[0] }}
                </div>
              </div>
              <div class="name-edit-wrapper">
                <input
                  v-model="editingName"
                  type="text"
                  class="name-input"
                  placeholder="角色名称"
                />
              </div>
            </div>

            <div class="detail-section">
              <h3>基础信息</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">性别</span>
                  <input v-model="editingGender" type="text" class="info-input" placeholder="-" />
                </div>
                <div class="info-item">
                  <span class="info-label">年龄</span>
                  <input v-model="editingAge" type="text" class="info-input" placeholder="-" />
                </div>
              </div>
            </div>

            <div class="detail-section">
              <h3>性格特征</h3>
              <div class="traits-editor">
                <input
                  v-model="newTrait"
                  type="text"
                  class="trait-input"
                  placeholder="添加性格标签，按回车确认"
                  @keyup.enter="addTrait"
                />
                <div class="traits-list">
                  <span v-for="(trait, index) in characterTraits" :key="trait" class="trait-tag editable">
                    {{ trait }}
                    <button class="trait-remove" @click="removeTrait(index)">×</button>
                  </span>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <h3>当前心境</h3>
              <div class="mood-selector">
                <button
                  v-for="m in moodOptions"
                  :key="m.value"
                  :class="['mood-option', { active: currentMoodValue === m.value }]"
                  @click="setMood(m.value)"
                >
                  <span class="mood-dot" :style="{ background: m.color }"></span>
                  <span class="mood-label">{{ m.label }}</span>
                </button>
              </div>
              <div class="mood-slider-wrapper">
                <span class="slider-label">情绪强度</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  v-model="moodIntensity"
                  class="mood-slider"
                  :style="{ '--thumb-color': moodGradient }"
                />
                <span class="slider-value">{{ moodIntensity }}%</span>
              </div>
            </div>

            <div class="detail-section">
              <h3>角色设定</h3>
              <textarea
                v-model="characterDescription"
                class="description-textarea"
                placeholder="描述角色的外貌、性格、背景故事..."
              ></textarea>
            </div>

            <div class="detail-section">
              <h3>当前目标</h3>
              <textarea
                v-model="characterGoal"
                class="description-textarea short"
                placeholder="角色当前的目标或追求..."
              ></textarea>
            </div>
          </div>

          <!-- 导入标签页 -->
          <div v-if="activeTab === 'import'" class="tab-content">
            <div class="import-section">
              <p class="import-tip">从 JSON 格式的角色卡数据导入角色信息</p>
              <textarea
                v-model="importText"
                class="import-textarea"
                placeholder='{"name": "角色名", "gender": "男", "age": "25岁", "personality": ["勇敢", "善良"], "description": "角色描述...", "avatar": "头像URL"}'
              ></textarea>
              <div class="import-actions">
                <button class="btn" @click="importFromJSON" :disabled="!importText.trim()">导入角色卡</button>
              </div>
              <div v-if="importError" class="import-error">{{ importError }}</div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="closeModal">取消</button>
          <button class="btn primary" @click="saveCharacter">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const showDetail = ref(false)
const activeTab = ref('info')
const newTrait = ref('')
const moodIntensity = ref(50)
const characterDescription = ref('')
const characterGoal = ref('')
const editingName = ref('')
const editingGender = ref('')
const editingAge = ref('')
const importText = ref('')
const importError = ref('')

const moodOptions = [
  { value: 15, color: '#6b7280', label: '悲伤' },
  { value: 30, color: '#9ca3af', label: '低落' },
  { value: 50, color: '#60a5fa', label: '平静' },
  { value: 70, color: '#34d399', label: '愉悦' },
  { value: 85, color: '#fbbf24', label: '亢奋' },
  { value: 95, color: '#f97316', label: '激动' }
]

const characterTraits = ref([])

const currentMoodValue = computed(() => {
  return moodIntensity.value
})

const currentMoodLabel = computed(() => {
  const m = moodOptions.reduce((prev, curr) => {
    return Math.abs(curr.value - moodIntensity.value) < Math.abs(prev.value - moodIntensity.value) ? curr : prev
  })
  return m.label
})

const moodColor = computed(() => {
  const m = moodOptions.reduce((prev, curr) => {
    return Math.abs(curr.value - moodIntensity.value) < Math.abs(prev.value - moodIntensity.value) ? curr : prev
  })
  return m.color
})

// 平滑渐变颜色
const moodGradient = computed(() => {
  const value = moodIntensity.value

  // 找到value前后两个锚点
  let prev = moodOptions[0]
  let next = moodOptions[moodOptions.length - 1]

  for (let i = 0; i < moodOptions.length - 1; i++) {
    if (value >= moodOptions[i].value && value <= moodOptions[i + 1].value) {
      prev = moodOptions[i]
      next = moodOptions[i + 1]
      break
    }
  }

  // 计算插值比例
  const range = next.value - prev.value
  const ratio = range === 0 ? 0 : (value - prev.value) / range

  // 插值计算颜色
  const color = interpolateColor(prev.color, next.color, ratio)
  return color
})

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

function interpolateColor(color1, color2, ratio) {
  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)

  const r = Math.round(c1.r + (c2.r - c1.r) * ratio)
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio)
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio)

  return `rgb(${r}, ${g}, ${b})`
}

const moodPercent = computed(() => moodIntensity.value)

const playerName = computed(() => {
  return editingName.value || gameStore.playerCharacter?.name || '未命名'
})

const playerAvatar = computed(() => {
  return gameStore.playerCharacter?.avatar || ''
})

const playerAge = computed(() => {
  return editingAge.value || gameStore.playerCharacter?.age || '-'
})

const playerGender = computed(() => {
  return editingGender.value || gameStore.playerCharacter?.gender || '-'
})

onMounted(() => {
  loadCharacterData()
})

function loadCharacterData() {
  const saved = localStorage.getItem('writing_character')
  if (saved) {
    const data = JSON.parse(saved)
    characterTraits.value = data.traits || []
    moodIntensity.value = data.mood ?? 50
    characterDescription.value = data.description || ''
    characterGoal.value = data.goal || ''
    editingName.value = data.name || ''
    editingGender.value = data.gender || ''
    editingAge.value = data.age || ''
  }
}

function closeModal() {
  showDetail.value = false
  importText.value = ''
  importError.value = ''
  activeTab.value = 'info'
}

function addTrait() {
  const trait = newTrait.value.trim()
  if (trait && !characterTraits.value.includes(trait)) {
    characterTraits.value.push(trait)
    newTrait.value = ''
  }
}

function removeTrait(index) {
  characterTraits.value.splice(index, 1)
}

function setMood(value) {
  moodIntensity.value = value
}

function importFromJSON() {
  importError.value = ''
  try {
    const data = JSON.parse(importText.value)
    if (data.name) editingName.value = data.name
    if (data.gender) editingGender.value = data.gender
    if (data.age) editingAge.value = data.age
    if (data.avatar && gameStore.playerCharacter) {
      gameStore.playerCharacter.avatar = data.avatar
    }
    if (data.personality && Array.isArray(data.personality)) {
      characterTraits.value = [...data.personality]
    }
    if (data.description) characterDescription.value = data.description
    if (data.persona || data.personality_text) {
      characterDescription.value = data.persona || data.personality_text
    }
    importText.value = ''
    activeTab.value = 'info'
  } catch (e) {
    importError.value = 'JSON 格式错误，请检查输入'
  }
}

function saveCharacter() {
  const data = {
    name: editingName.value,
    gender: editingGender.value,
    age: editingAge.value,
    traits: characterTraits.value,
    mood: moodIntensity.value,
    description: characterDescription.value,
    goal: characterGoal.value
  }
  localStorage.setItem('writing_character', JSON.stringify(data))

  if (gameStore.playerCharacter) {
    gameStore.playerCharacter.name = editingName.value
    gameStore.playerCharacter.gender = editingGender.value
    gameStore.playerCharacter.age = editingAge.value
  }

  showDetail.value = false
}
</script>

<style scoped>
.status-bar {
  color: var(--text-primary);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

/* 角色卡片 */
.character-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 12px;
}

.character-profile:hover {
  background: var(--bg-hover);
}

.avatar-wrapper {
  flex-shrink: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border);
}

.avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 18px;
  font-weight: 600;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.character-mood {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.mood-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mood-text {
  color: var(--text-secondary);
}

.expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 性格标签 */
.traits-section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.trait-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.trait-tag {
  padding: 3px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.no-trait {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* 心境 */
.mood-section {
  margin-bottom: 12px;
}

.mood-bar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mood-bar {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.mood-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.mood-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-muted);
}

/* 快速统计 */
.quick-stats {
  display: flex;
  gap: 8px;
}

.stat-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 11px;
  color: var(--text-primary);
  margin-left: auto;
}

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
  width: 480px;
  max-width: 95%;
  max-height: 85vh;
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
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
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

.close-btn:hover {
  background: var(--bg-hover);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
}

.tab-content {
  padding: 20px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.detail-avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.detail-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--accent);
}

.detail-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 32px;
  font-weight: 600;
}

.name-edit-wrapper {
  display: flex;
  justify-content: center;
}

.name-input {
  text-align: center;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  outline: none;
  max-width: 200px;
}

.name-input:focus {
  border-bottom-color: var(--accent);
}

/* 信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.info-label {
  font-size: 11px;
  color: var(--text-muted);
}

.info-input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  padding: 0;
  outline: none;
}

/* 性格标签编辑 */
.traits-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trait-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.trait-input:focus {
  outline: none;
  border-color: var(--accent);
}

.traits-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trait-tag.editable {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 4px;
  font-size: 12px;
}

.trait-remove {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  border-radius: 50%;
}

.trait-remove:hover {
  background: rgba(0,0,0,0.1);
}

/* 心境选择器 */
.mood-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.mood-option {
  flex: 1;
  min-width: 55px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.mood-option:hover {
  border-color: var(--accent);
}

.mood-option.active {
  background: var(--accent-light);
  border-color: var(--accent);
}

.mood-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.mood-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.mood-option.active .mood-label {
  color: var(--accent);
  font-weight: 500;
}

.mood-slider-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.mood-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bg-tertiary);
  border-radius: 3px;
  outline: none;
}

.mood-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--thumb-color, var(--accent));
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 35px;
  text-align: right;
}

/* 描述文本框 */
.description-textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.description-textarea.short {
  min-height: 60px;
}

.description-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.description-textarea::placeholder {
  color: var(--text-muted);
}

.status-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.status-input:focus {
  outline: none;
  border-color: var(--accent);
}

.status-input::placeholder {
  color: var(--text-muted);
}

/* 导入部分 */
.import-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-tip {
  font-size: 13px;
  color: var(--text-secondary);
}

.import-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: monospace;
  line-height: 1.5;
  resize: vertical;
}

.import-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.import-textarea::placeholder {
  color: var(--text-muted);
}

.import-actions {
  display: flex;
  gap: 8px;
}

.import-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  border-radius: 6px;
  font-size: 12px;
}

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:hover {
  background: var(--bg-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}
</style>
