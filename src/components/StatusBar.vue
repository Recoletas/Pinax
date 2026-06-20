<template>
  <div class="status-bar">
    <div class="status-header">
      <span class="status-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 7a2 2 0 100-4 2 2 0 000 4zM3 13c0-2 1.5-3 4-3s4 1 4 3H3z"/>
        </svg>
      </span>
      <span>在场人物</span>
    </div>

    <!-- 当前时间显示 -->
    <div class="current-time" @click="showTimeDetail = true">
      <div class="time-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1a6 6 0 100 12A6 6 0 007 1zm0 1a5 5 0 110 10A5 5 0 017 2z"/>
          <path d="M7 4v3l2 2"/>
        </svg>
      </div>
      <div class="time-info">
        <span class="time-era">{{ currentEraName || '公元' }}</span>
        <span class="time-value">{{ currentTimeDisplay }}</span>
      </div>
      <svg class="expand-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M2 3.5L5 6.5L8 3.5" stroke-width="1.5"/>
      </svg>
    </div>

    <!-- 角色概览 - 点击打开详情 -->
    <div class="compact-profile" @click="showDetail = true">
      <div class="avatar-mini">
        <img v-if="playerAvatar" :src="playerAvatar" class="avatar" />
        <div v-else class="avatar-placeholder">{{ playerName[0] }}</div>
      </div>
      <div class="profile-info">
        <div class="character-name">{{ playerName }}</div>
        <div class="mood-compact">
          <div class="mood-bar">
            <div class="mood-fill" :style="{ width: moodPercent + '%', background: moodGradient }"></div>
          </div>
          <span class="mood-label">{{ currentMoodLabel }}</span>
        </div>
      </div>
      <svg class="expand-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M2 3.5L5 6.5L8 3.5" stroke-width="1.5"/>
      </svg>
    </div>

    <!-- 时间设置弹窗 -->
    <div v-if="showTimeDetail" class="detail-overlay" @click.self="showTimeDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <span>时间设定</span>
          <button class="close-btn" @click="showTimeDetail = false">×</button>
        </div>

        <div class="modal-body">
          <div class="detail-section">
            <div class="section-title">历法体系</div>
            <div class="era-presets">
              <button
                v-for="p in presetEras"
                :key="p.id"
                :class="['era-preset-btn', { active: currentEraId === p.id }]"
                @click="selectEra(p)"
              >
                {{ p.name }}
              </button>
            </div>
          </div>

          <div class="detail-section" v-if="currentEraId !== 'gregorian'">
            <div class="section-title">当前纪年</div>
            <div class="era-display">
              <input
                v-model="editEraName"
                type="text"
                class="era-input"
                placeholder="输入年号，如：康熙、令和、大正..."
              />
            </div>
          </div>

          <div class="detail-section">
            <div class="section-title">当前时间</div>
            <div class="time-inputs">
              <div class="time-input-group">
                <label>年</label>
                <input v-model="editYear" :type="currentEraId === 'gregorian' ? 'number' : 'text'" class="year-input" placeholder="年份" />
              </div>
              <div class="time-input-group">
                <label>月</label>
                <input v-model="editMonth" :type="currentEraId === 'gregorian' ? 'number' : 'text'" class="month-input" placeholder="月份" />
              </div>
              <div class="time-input-group">
                <label>日</label>
                <input v-model="editDay" :type="currentEraId === 'gregorian' ? 'number' : 'text'" class="day-input" placeholder="日期" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="showTimeDetail = false">关闭</button>
          <button class="btn primary" @click="saveTime">保存</button>
        </div>
      </div>
    </div>

    <!-- 角色详情弹窗 -->
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
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const showDetail = ref(false)
const showTimeDetail = ref(false)
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

// Time settings
const currentEraId = ref('custom')
const currentEraName = ref('')
const currentYear = ref(2024)
const currentMonth = ref(1)
const currentDay = ref(1)

// Edit fields
const editEraName = ref('')
const editYear = ref(2024)
const editMonth = ref(1)
const editDay = ref(1)

const presetEras = [
  { id: 'custom', name: '自定义' },
  { id: 'chinese', name: '年号' },
  { id: 'gregorian', name: '公元' }
]

const moodOptions = [
  { value: 15, color: '#6b7280', label: '悲伤' },
  { value: 30, color: '#9ca3af', label: '低落' },
  { value: 50, color: '#60a5fa', label: '平静' },
  { value: 70, color: '#34d399', label: '愉悦' },
  { value: 85, color: '#fbbf24', label: '亢奋' },
  { value: 95, color: '#f97316', label: '激动' }
]

const characterTraits = ref([])

const currentMoodValue = computed(() => moodIntensity.value)

const currentMood = computed(() => {
  return moodOptions.reduce((prev, curr) => {
    return Math.abs(curr.value - moodIntensity.value) < Math.abs(prev.value - moodIntensity.value) ? curr : prev
  })
})

const currentMoodLabel = computed(() => currentMood.value.label)

const moodGradient = computed(() => {
  const value = moodIntensity.value
  let prev = moodOptions[0]
  let next = moodOptions[moodOptions.length - 1]

  for (let i = 0; i < moodOptions.length - 1; i++) {
    if (value >= moodOptions[i].value && value <= moodOptions[i + 1].value) {
      prev = moodOptions[i]
      next = moodOptions[i + 1]
      break
    }
  }

  const range = next.value - prev.value
  const ratio = range === 0 ? 0 : (value - prev.value) / range
  const color = interpolateColor(prev.color, next.color, ratio)
  return color
})

const currentTimeDisplay = computed(() => {
  // 如果没有时间信息，显示占位符
  if (!currentYear.value && !currentMonth.value && !currentDay.value) {
    return '点击设置时间'
  }
  const eraStr = currentEraName.value ? `${currentEraName.value} ` : ''
  const year = currentYear.value || '?'
  const month = currentMonth.value || '?'
  const day = currentDay.value || '?'
  return `${eraStr}${year}年${month}月${day}日`
})

function interpolateColor(color1, color2, ratio) {
  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)
  const r = Math.round(c1.r + (c2.r - c1.r) * ratio)
  const g = Math.round(c1.g + (c2.g - c1.g) * ratio)
  const b = Math.round(c1.b + (c2.b - c1.b) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

const moodPercent = computed(() => moodIntensity.value)

const playerName = computed(() => {
  // Pure display: if the user hasn't picked a custom name (still the
  // "User" default from gameStore.init), surface 主角 instead so the
  // record book doesn't read as a SaaS "User" placeholder.
  const raw = editingName.value || gameStore.playerCharacter?.name || ''
  if (!raw || raw === 'User') return '主角'
  return raw
})
const playerAvatar = computed(() => gameStore.playerCharacter?.avatar || '')
const playerAge = computed(() => editingAge.value || gameStore.playerCharacter?.age || '-')
const playerGender = computed(() => editingGender.value || gameStore.playerCharacter?.gender || '-')

onMounted(() => {
  syncCharacterData()
  syncTimeData()
})

function loadCharacterData() {
  if (typeof gameStore.loadWritingCharacter === 'function') {
    gameStore.loadWritingCharacter()
  }
  syncCharacterData()
}

function syncCharacterData() {
  const data = gameStore.writingCharacter || {}
  characterTraits.value = Array.isArray(data.traits) ? data.traits : []
  moodIntensity.value = data.mood ?? 50
  characterDescription.value = data.description || ''
  characterGoal.value = data.goal || ''
  editingName.value = data.name || ''
  editingGender.value = data.gender || ''
  editingAge.value = data.age || ''
}

function loadTimeData() {
  if (typeof gameStore.loadWritingTime === 'function') {
    gameStore.loadWritingTime()
  }
  syncTimeData()
}

function syncTimeData() {
  const data = gameStore.writingTime || {}
  currentEraId.value = data.eraId || 'custom'
  currentEraName.value = data.eraName || ''
  currentYear.value = data.year || ''
  currentMonth.value = data.month || ''
  currentDay.value = data.day || ''
  editEraName.value = currentEraName.value
  editYear.value = currentYear.value
  editMonth.value = currentMonth.value
  editDay.value = currentDay.value
}

// Watch for store changes to update UI reactively
watch(() => gameStore.writingCharacter, syncCharacterData, { deep: true })
watch(() => gameStore.writingTime, syncTimeData, { deep: true })

function saveTime() {
  currentEraName.value = editEraName.value
  currentYear.value = editYear.value || '1'
  currentMonth.value = editMonth.value || '1'
  currentDay.value = editDay.value || '1'

  const nextTime = {
    eraId: currentEraId.value,
    eraName: currentEraName.value,
    year: currentYear.value,
    month: currentMonth.value,
    day: currentDay.value
  }
  if (typeof gameStore.saveWritingTime === 'function') {
    gameStore.saveWritingTime(nextTime)
  } else {
    gameStore.writingTime = nextTime
  }
  showTimeDetail.value = false
}

function selectEra(era) {
  currentEraId.value = era.id
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
  const nextCharacter = {
    name: editingName.value,
    gender: editingGender.value,
    age: editingAge.value,
    traits: characterTraits.value,
    mood: moodIntensity.value,
    description: characterDescription.value,
    goal: characterGoal.value
  }
  if (typeof gameStore.saveWritingCharacter === 'function') {
    gameStore.saveWritingCharacter(nextCharacter)
  } else {
    gameStore.writingCharacter = nextCharacter
    if (gameStore.playerCharacter) {
      gameStore.playerCharacter.name = editingName.value
      gameStore.playerCharacter.gender = editingGender.value
      gameStore.playerCharacter.age = editingAge.value
    }
  }

  showDetail.value = false
}
</script>

<style scoped>
.status-bar { color: var(--text-primary); }

.status-header {
  display: flex; align-items: center; gap: 0.375rem;
  font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
  margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
}

.status-icon { display: flex; align-items: center; color: var(--accent); }

/* 当前时间 */
.current-time {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: var(--bg-tertiary);
  border-radius: 6px; cursor: pointer; transition: all 0.15s;
  margin-bottom: 10px;
}
.current-time:hover { background: var(--bg-hover); }

.time-icon { color: var(--text-muted); display: flex; align-items: center; }

.time-info { flex: 1; min-width: 0; }

.time-era {
  font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 1px;
}

.time-value {
  font-size: 12px; color: var(--text-primary); display: block;
}

/* 角色卡片 */
.compact-profile {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; background: var(--bg-tertiary); border-radius: 8px;
  cursor: pointer; transition: all 0.15s;
}
.compact-profile:hover { background: var(--bg-hover); }

.avatar-mini { flex-shrink: 0; }

.avatar-mini .avatar,
.avatar-mini .avatar-placeholder {
  width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
  border: 1px solid var(--border);
}

.avatar-placeholder {
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-light); color: var(--accent);
  font-size: 14px; font-weight: 600;
}

.profile-info { flex: 1; min-width: 0; }

.character-name { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }

.mood-compact { display: flex; align-items: center; gap: 8px; }

.mood-bar {
  flex: 1; height: 4px; background: var(--bg-primary); border-radius: 2px; overflow: hidden;
}

.mood-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }

.mood-label { font-size: 10px; color: var(--text-muted); white-space: nowrap; }

.expand-icon { color: var(--text-muted); flex-shrink: 0; }

/* 弹窗 */
.detail-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
  justify-content: center; z-index: 1000;
}

.detail-modal {
  width: 420px; max-width: 95%; max-height: 85vh;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 12px; display: flex; flex-direction: column; overflow: hidden;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  font-size: 14px; font-weight: 600;
}

.close-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--text-muted); font-size: 18px;
  cursor: pointer; border-radius: 4px;
}
.close-btn:hover { background: var(--bg-hover); }

.modal-tabs { display: flex; border-bottom: 1px solid var(--border); }

.tab {
  flex: 1; padding: 12px; background: none; border: none;
  color: var(--text-muted); font-size: 13px; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.tab:hover { color: var(--text-secondary); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.modal-body { flex: 1; overflow-y: auto; }

.tab-content { padding: 20px; }

.detail-section { margin-bottom: 20px; }
.detail-section:last-child { margin-bottom: 0; }

.detail-section h3 {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

.section-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

/* 时间设置 */
.time-presets { margin-bottom: 16px; }

.preset-label { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }

.era-presets { display: inline-flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); justify-content: center; }

.era-preset-btn {
  padding: 10px 20px; background: var(--bg-tertiary);
  border: none; border-right: 1px solid var(--border); color: var(--text-secondary);
  font-size: 13px; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.era-preset-btn:last-child { border-right: none; }
.era-preset-btn:hover { background: var(--bg-hover); }
.era-preset-btn.active { background: var(--accent); color: #fff; }

.era-display { margin-bottom: 12px; }

.era-input {
  width: 100%; padding: 10px 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: 6px;
  color: var(--text-primary); font-size: 14px;
}
.era-input:focus { outline: none; border-color: var(--accent); }

.time-inputs { display: inline-flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); justify-content: center; }

.time-input-group { display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); }
.time-input-group:last-child { border-right: none; }
.time-input-group label { font-size: 10px; color: var(--text-muted); padding: 8px 12px 0; white-space: nowrap; }

.year-input, .month-input, .day-input {
  padding: 10px 12px; background: var(--bg-primary); border: none;
  color: var(--text-primary); font-size: 14px; text-align: center;
  width: 80px;
}
.year-input:focus, .month-input:focus, .day-input:focus { outline: none; background: var(--bg-hover); }

.time-input-group:has(input:focus) { background: var(--bg-tertiary); }

/* 角色详情 */
.detail-avatar-wrapper { display: flex; justify-content: center; margin-bottom: 12px; }

.detail-avatar {
  width: 80px; height: 80px; border-radius: 50%; object-fit: cover;
  border: 3px solid var(--accent);
}
.detail-avatar.placeholder {
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-light); color: var(--accent);
  font-size: 32px; font-weight: 600;
}

.name-edit-wrapper { display: flex; justify-content: center; }

.name-input {
  text-align: center; padding: 6px 12px; background: transparent;
  border: none; border-bottom: 1px solid var(--border);
  color: var(--text-primary); font-size: 16px; font-weight: 600; outline: none; max-width: 200px;
}
.name-input:focus { border-bottom-color: var(--accent); }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.info-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;
}

.info-label { font-size: 11px; color: var(--text-muted); }
.info-input { background: transparent; border: none; color: var(--text-primary); font-size: 13px; padding: 0; outline: none; }

.traits-editor { display: flex; flex-direction: column; gap: 8px; }

.trait-input {
  width: 100%; padding: 8px 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: 6px;
  color: var(--text-primary); font-size: 13px;
}
.trait-input:focus { outline: none; border-color: var(--accent); }

.traits-list { display: flex; flex-wrap: wrap; gap: 6px; }

.trait-tag.editable {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  background: var(--accent-light); color: var(--accent); border-radius: 4px; font-size: 12px;
}

.trait-remove {
  width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--accent); cursor: pointer;
  font-size: 12px; border-radius: 50%;
}
.trait-remove:hover { background: rgba(0,0,0,0.1); }

.mood-selector { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }

.mood-option {
  flex: 1; min-width: 55px; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 10px 4px; background: var(--bg-tertiary);
  border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.15s;
}
.mood-option:hover { border-color: var(--accent); }
.mood-option.active { background: var(--accent-light); border-color: var(--accent); }

.mood-dot { width: 12px; height: 12px; border-radius: 50%; }
.mood-label { font-size: 10px; color: var(--text-secondary); }
.mood-option.active .mood-label { color: var(--accent); font-weight: 500; }

.mood-slider-wrapper { display: flex; align-items: center; gap: 12px; }
.slider-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

.mood-slider {
  flex: 1; height: 6px; -webkit-appearance: none; appearance: none;
  background: var(--bg-tertiary); border-radius: 3px; outline: none;
}
.mood-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; background: var(--thumb-color, var(--accent)); border-radius: 50%; cursor: pointer;
}

.slider-value { font-size: 12px; color: var(--text-secondary); min-width: 35px; text-align: right; }

.description-textarea {
  width: 100%; min-height: 80px; padding: 10px 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);
  font-size: 13px; line-height: 1.5; resize: vertical; font-family: inherit;
}
.description-textarea.short { min-height: 60px; }
.description-textarea:focus { outline: none; border-color: var(--accent); }
.description-textarea::placeholder { color: var(--text-muted); }

/* 导入 */
.import-section { display: flex; flex-direction: column; gap: 12px; }
.import-tip { font-size: 13px; color: var(--text-secondary); }

.import-textarea {
  width: 100%; min-height: 200px; padding: 12px; background: var(--bg-primary);
  border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);
  font-size: 12px; font-family: monospace; line-height: 1.5; resize: vertical;
}
.import-textarea:focus { outline: none; border-color: var(--accent); }
.import-textarea::placeholder { color: var(--text-muted); }

.import-error { padding: 8px 12px; background: rgba(239, 68, 68, 0.15); color: var(--danger); border-radius: 6px; font-size: 12px; }

.modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 16px 20px; border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 16px; background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-primary); font-size: 13px; cursor: pointer; transition: all 0.15s;
}
.btn:hover { background: var(--bg-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-hover); }

/* Kao record-book overrides — internal modals (时间设置 / 角色详情)
   become "翻开的案卷第 N 页" (a dossier drawer page), not SaaS settings
   dialog. 0 圆角 + 1px gold hairline + paper-soft + dossier 卷宗 stamp
   in the header. Scoped CSS specificity 0,2,1 beats tool-feel 0,1,1. */
.theme-kao .detail-modal {
  background: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  border-radius: 0;
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--archive-ink) 14%, transparent);
  font-family: var(--font-display);
  color: var(--archive-ink);
}

.theme-kao .modal-header {
  background: var(--archive-paper-soft);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  color: var(--archive-ink);
  padding: 12px 18px 10px;
  position: relative;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}

.theme-kao .modal-header::before {
  content: "卷宗 · 在场人物";
  position: absolute;
  top: -8px;
  left: 16px;
  font-size: 9px;
  letter-spacing: 0.22em;
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  background: var(--archive-paper);
  padding: 0 6px;
  z-index: 1;
}

.theme-kao .modal-body {
  background: var(--archive-paper);
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.6;
}

.theme-kao .detail-section {
  background: transparent;
  border: none;
}

.theme-kao .detail-section label,
.theme-kao .detail-section span {
  color: color-mix(in srgb, var(--archive-ink) 80%, transparent);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.theme-kao .detail-section input,
.theme-kao .detail-section select,
.theme-kao .detail-section textarea {
  background: var(--archive-paper-soft);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 0;
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: 13px;
}

.theme-kao .modal-footer {
  background: var(--archive-paper-soft);
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
}

.theme-kao .modal-footer .btn,
.theme-kao .modal-footer .btn.primary {
  background: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  color: var(--archive-ink);
  border-radius: 0;
  font-family: var(--font-display);
  letter-spacing: 0.08em;
}

.theme-kao .modal-footer .btn.primary {
  background: var(--archive-olive);
  border-color: var(--archive-olive-strong);
  color: var(--archive-paper-soft);
}

.theme-kao .modal-footer .btn.primary:hover {
  background: var(--archive-olive-strong);
  border-color: var(--archive-olive-strong);
}

.theme-kao .modal-footer .btn:hover {
  background: color-mix(in srgb, var(--archive-paper-strong) 40%, var(--archive-paper));
  color: var(--archive-olive-strong);
}

.theme-kao .close-btn {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  border-radius: 0;
}

.theme-kao .close-btn:hover {
  color: var(--archive-gold);
  border-color: var(--archive-gold);
}
</style>
