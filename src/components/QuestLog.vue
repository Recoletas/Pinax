<template>
  <div class="quest-log">
    <div class="panel-header">
      <span>重要活动</span>
    </div>

    <!-- 时间线视图 -->
    <div class="timeline-view" v-if="activities.length > 0">
      <div class="timeline-group" v-for="(group, dateKey) in groupedActivities" :key="dateKey">
        <div class="timeline-date">{{ formatDateKey(dateKey) }}</div>
        <div class="timeline-items">
          <div
            v-for="activity in group"
            :key="activity.id"
            class="timeline-item"
            @click="editActivity(activity)"
          >
            <div class="item-time">{{ formatTime(activity.time) }}</div>
            <div class="item-marker">
              <div class="marker-dot" :style="{ background: getActivityColor(activity.type) }"></div>
              <div class="marker-line"></div>
            </div>
            <div class="item-content">
              <div class="item-title">{{ activity.title }}</div>
              <div class="item-type" :style="{ color: getActivityColor(activity.type) }">
                {{ getActivityLabel(activity.type) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      暂无重要活动记录
    </div>

    <button class="add-btn" @click="openAddModal()">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1v10M1 6h10"/>
      </svg>
      记录活动
    </button>

    <!-- 添加/编辑弹窗 -->
    <div v-if="showAddModal" class="detail-overlay" @click.self="closeModal">
      <div class="detail-modal">
        <div class="modal-header">
          <span>{{ editingActivity ? '编辑活动' : '记录活动' }}</span>
          <button class="close-btn" @click="closeModal">×</button>
        </div>

        <div class="modal-body">
          <div class="input-group">
            <label>活动标题</label>
            <input
              v-model="editTitle"
              type="text"
              class="name-input"
              placeholder="描述这个重要活动..."
            />
          </div>

          <div class="input-row">
            <div class="input-group half">
              <label>日期</label>
              <input
                v-model="editDate"
                type="date"
                class="date-input"
              />
            </div>
            <div class="input-group half">
              <label>时间</label>
              <input
                v-model="editTime"
                type="time"
                class="time-input"
              />
            </div>
          </div>

          <div class="input-group">
            <label>活动类型</label>
            <div class="type-selector">
              <button
                v-for="t in activityTypes"
                :key="t.value"
                :class="['type-btn', { active: editType === t.value }]"
                @click="editType = t.value"
              >
                <span class="type-dot" :style="{ background: t.color }"></span>
                {{ t.label }}
              </button>
            </div>
          </div>

          <div class="input-group">
            <label>关联活动（可选）</label>
            <div class="relation-list">
              <button
                v-for="a in availableRelations"
                :key="a.id"
                :class="['relation-btn', { active: editRelations.includes(a.id) }]"
                @click="toggleRelation(a.id)"
              >
                {{ a.title.slice(0, 10) }}
              </button>
            </div>
          </div>

          <div class="input-group" v-if="editingActivity">
            <button class="btn danger" @click="deleteActivity">删除此活动</button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="closeModal">取消</button>
          <button class="btn primary" @click="saveActivity" :disabled="!editTitle.trim()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const showAddModal = ref(false)
const editingActivity = ref(null)
const editTitle = ref('')
const editType = ref('event')
const editDate = ref('')
const editTime = ref('')
const editRelations = ref([])

const activities = ref([])

const activityTypes = [
  { value: 'event', label: '事件', color: '#60a5fa' },
  { value: 'milestone', label: '里程碑', color: '#34d399' },
  { value: 'decision', label: '决定', color: '#fbbf24' },
  { value: 'encounter', label: '遭遇', color: '#f97316' }
]

const getActivityColor = (type) => {
  const t = activityTypes.find(t => t.value === type)
  return t?.color || '#60a5fa'
}

const getActivityLabel = (type) => {
  const t = activityTypes.find(t => t.value === type)
  return t?.label || type
}

const groupedActivities = computed(() => {
  const groups = {}
  activities.value.forEach(activity => {
    const dateKey = activity.date || activity.time?.split('T')[0] || 'unknown'
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(activity)
  })

  // Sort each group by time
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => {
      const timeA = a.time || '00:00'
      const timeB = b.time || '00:00'
      return timeA.localeCompare(timeB)
    })
  })

  // Sort groups by date descending (newest first)
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  const result = {}
  sortedKeys.forEach(key => {
    result[key] = groups[key]
  })

  return result
})

const availableRelations = computed(() => {
  return activities.value.filter(a => a.id !== editingActivity.value?.id)
})

const formatDateKey = (dateKey) => {
  if (!dateKey || dateKey === 'unknown') return '未分类'
  const d = new Date(dateKey)
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0]

  if (dateKey === today) return '今天'
  if (dateKey === yesterday) return '昨天'

  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  if (timeStr.includes('T')) {
    const d = new Date(timeStr)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  return timeStr.slice(0, 5)
}

onMounted(() => {
  loadActivities()
})

function loadActivities() {
  const saved = localStorage.getItem('writing_activities')
  if (saved) {
    activities.value = JSON.parse(saved)
  }
}

function saveActivities() {
  localStorage.setItem('writing_activities', JSON.stringify(activities.value))
}

function openAddModal() {
  editingActivity.value = null
  editTitle.value = ''
  editType.value = 'event'
  const now = new Date()
  editDate.value = now.toISOString().split('T')[0]
  editTime.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  editRelations.value = []
  showAddModal.value = true
}

function editActivity(activity) {
  editingActivity.value = activity
  editTitle.value = activity.title
  editType.value = activity.type || 'event'
  editRelations.value = activity.relations || []

  if (activity.date) {
    editDate.value = activity.date
  } else if (activity.time?.includes('T')) {
    editDate.value = activity.time.split('T')[0]
  } else {
    editDate.value = new Date().toISOString().split('T')[0]
  }

  if (activity.time?.includes('T')) {
    const d = new Date(activity.time)
    editTime.value = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } else if (activity.time) {
    editTime.value = activity.time.slice(0, 5)
  } else {
    editTime.value = '00:00'
  }

  showAddModal.value = true
}

function closeModal() {
  showAddModal.value = false
  editingActivity.value = null
  editRelations.value = []
}

function toggleRelation(id) {
  const idx = editRelations.value.indexOf(id)
  if (idx === -1) {
    editRelations.value.push(id)
  } else {
    editRelations.value.splice(idx, 1)
  }
}

function saveActivity() {
  if (!editTitle.value.trim()) return

  const timeValue = `${editDate.value} ${editTime.value}`

  if (editingActivity.value) {
    editingActivity.value.title = editTitle.value
    editingActivity.value.type = editType.value
    editingActivity.value.date = editDate.value
    editingActivity.value.time = timeValue
    editingActivity.value.relations = [...editRelations.value]
  } else {
    activities.value.push({
      id: 'a_' + Date.now(),
      title: editTitle.value,
      type: editType.value,
      date: editDate.value,
      time: timeValue,
      relations: [...editRelations.value]
    })
  }

  saveActivities()
  closeModal()
}

function deleteActivity() {
  if (!editingActivity.value) return
  activities.value = activities.value.filter(a => a.id !== editingActivity.value.id)
  saveActivities()
  closeModal()
}
</script>

<style scoped>
.quest-log {
  color: var(--text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.timeline-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 10px;
  max-height: 220px;
  overflow-y: auto;
}

.timeline-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding-left: 4px;
}

.timeline-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.timeline-item:hover {
  background: var(--bg-hover);
}

.item-time {
  font-size: 10px;
  color: var(--text-muted);
  width: 36px;
  flex-shrink: 0;
  padding-top: 2px;
}

.item-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 10px;
  flex-shrink: 0;
}

.marker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
}

.item-type {
  font-size: 10px;
  font-weight: 500;
  margin-top: 2px;
}

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 1rem;
  font-size: 0.8rem;
  margin-bottom: 10px;
}

.add-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 弹窗 */
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
  width: 400px;
  max-width: 95%;
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

.close-btn:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group:last-child {
  margin-bottom: 0;
}

.input-row {
  display: flex;
  gap: 12px;
}

.input-group.half {
  flex: 1;
}

.input-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.name-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.name-input:focus {
  outline: none;
  border-color: var(--accent);
}

.date-input,
.time-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.date-input:focus,
.time-input:focus {
  outline: none;
  border-color: var(--accent);
}

.type-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.type-btn:hover {
  border-color: var(--accent);
}

.type-btn.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
}

.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.relation-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.relation-btn {
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.relation-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.relation-btn.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
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

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.danger {
  color: var(--danger);
  background: transparent;
  border-color: var(--danger);
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
