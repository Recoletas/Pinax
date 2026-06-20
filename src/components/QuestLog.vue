<template>
  <section class="quest-log">
    <header class="panel-header">
      <span>事件卷</span>
      <span v-if="activities.length > 0" class="count-badge">{{ activities.length }}</span>
    </header>

    <section v-if="summaryItems.length" class="adventure-summary" aria-label="冒险摘要">
      <article v-for="item in summaryItems" :key="item.label" class="summary-card">
        <div class="summary-label">{{ item.label }}</div>
        <p class="summary-value">{{ item.value }}</p>
      </article>
    </section>

    <section
      v-if="latestPlotEntry"
      class="trigger-panel"
      data-test="adventure-trigger-panel"
      aria-label="冒险写回出口"
    >
      <div class="trigger-header">
        <div>
          <div class="trigger-kicker">本卷推进出口</div>
          <h3 class="trigger-title">本段事件总结</h3>
        </div>
      </div>
      <p class="trigger-summary">{{ latestPlotEntry.summary }}</p>
      <dl class="trigger-meta" v-if="triggerMetaItems.length > 0">
        <div v-for="item in triggerMetaItems" :key="item.label" class="trigger-meta-item">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
      <div class="trigger-generate-row">
        <button
          type="button"
          class="mini-btn primary"
          data-test="trigger-prose-generate"
          :disabled="isGenerateDisabled('prose')"
          @click="handleGenerateTrigger('prose')"
        >
          {{ getGenerateLabel('prose') }}
        </button>
        <button
          type="button"
          class="mini-btn"
          data-test="trigger-storyboard-generate"
          :disabled="isGenerateDisabled('storyboard')"
          @click="handleGenerateTrigger('storyboard')"
        >
          {{ getGenerateLabel('storyboard') }}
        </button>
      </div>

      <article
        v-if="proseDraftCard"
        class="trigger-draft-card"
        data-test="trigger-prose-draft"
      >
        <div class="trigger-draft-head">
          <span>正文草稿</span>
          <span class="trigger-draft-status">{{ proseDraftCard.status }}</span>
        </div>
        <p class="trigger-draft-copy">{{ proseDraftCard.message }}</p>
        <div v-if="proseDraftCard.canAct" class="trigger-draft-actions">
          <button
            v-if="proseDraftCard.canAccept"
            type="button"
            class="btn primary"
            data-test="trigger-prose-accept"
            @click="handleAcceptTrigger('prose')"
          >
            采纳正文
          </button>
          <button
            v-if="proseDraftCard.canDismiss"
            type="button"
            class="btn"
            data-test="trigger-prose-dismiss"
            @click="handleDismissTrigger('prose')"
          >
            {{ proseDraftCard.dismissLabel }}
          </button>
        </div>
      </article>

      <article
        v-if="storyboardDraftCard"
        class="trigger-draft-card"
        data-test="trigger-storyboard-draft"
      >
        <div class="trigger-draft-head">
          <span>分镜草稿</span>
          <span class="trigger-draft-status">{{ storyboardDraftCard.status }}</span>
        </div>
        <p class="trigger-draft-copy">{{ storyboardDraftCard.message }}</p>
        <div v-if="storyboardDraftCard.canAct" class="trigger-draft-actions">
          <button
            v-if="storyboardDraftCard.canAccept"
            type="button"
            class="btn primary"
            data-test="trigger-storyboard-accept"
            @click="handleAcceptTrigger('storyboard')"
          >
            采纳分镜
          </button>
          <button
            v-if="storyboardDraftCard.canDismiss"
            type="button"
            class="btn"
            data-test="trigger-storyboard-dismiss"
            @click="handleDismissTrigger('storyboard')"
          >
            {{ storyboardDraftCard.dismissLabel }}
          </button>
        </div>
      </article>
    </section>

    <button
      v-if="latestActivity"
      type="button"
      class="recent-activity"
      @click="showDetail = true"
    >
      <div class="activity-preview">
        <div class="activity-dot" :style="{ background: getActivityColor(latestActivity.type) }"></div>
        <div class="activity-info">
          <div class="activity-title">{{ latestActivity.title }}</div>
          <div class="activity-meta">{{ formatDateKey(latestActivity.date) }} · {{ getActivityLabel(latestActivity.type) }}</div>
        </div>
      </div>
      <svg class="expand-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M2 3.5L5 6.5L8 3.5" stroke-width="1.5"/>
      </svg>
    </button>
    <button v-else type="button" class="empty-state" @click="openAddModal">
      点击记录第一个活动
    </button>

    <div class="inline-actions">
      <button type="button" class="mini-btn" @click="showDetail = true" :disabled="activities.length === 0">查看事件卷</button>
      <button type="button" class="mini-btn primary" @click="openAddModal">记入事件</button>
    </div>

    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <span>活动记录</span>
          <button type="button" class="close-btn" @click="showDetail = false" aria-label="关闭">×</button>
        </div>
        <div class="modal-body">
          <div v-if="activities.length > 0" class="timeline-view">
            <div v-for="(group, dateKey) in groupedActivities" :key="dateKey" class="timeline-group">
              <div class="timeline-date">{{ formatDateKey(dateKey) }}</div>
              <div class="timeline-items">
                <button
                  v-for="activity in group"
                  :key="activity.id"
                  type="button"
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
                </button>
              </div>
            </div>
          </div>
          <div v-else class="empty-panel">
            还没有活动记录。
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" @click="showDetail = false">关闭</button>
          <button type="button" class="btn primary" @click="openAddModal">添加活动</button>
        </div>
      </div>
    </div>

    <div v-if="showEditor" class="detail-overlay" @click.self="closeModal">
      <div class="detail-modal">
        <div class="modal-header">
          <span>{{ editingActivity ? '编辑事件' : '记入事件' }}</span>
          <button type="button" class="close-btn" @click="closeModal" aria-label="关闭">×</button>
        </div>

        <div class="modal-body">
          <div class="input-group">
            <label for="quest-log-title">活动标题</label>
            <input
              id="quest-log-title"
              v-model="editTitle"
              type="text"
              class="name-input"
              placeholder="描述这个事件..."
            />
          </div>

          <div class="input-row">
            <div class="input-group half">
              <label for="quest-log-date">日期</label>
              <input id="quest-log-date" v-model="editDate" type="date" class="date-input" />
            </div>
            <div class="input-group half">
              <label for="quest-log-time">时间</label>
              <input id="quest-log-time" v-model="editTime" type="time" class="time-input" />
            </div>
          </div>

          <div class="input-group">
            <label>活动类型</label>
            <div class="type-selector">
              <button
                v-for="type in activityTypes"
                :key="type.value"
                type="button"
                :class="['type-btn', { active: editType === type.value }]"
                @click="editType = type.value"
              >
                <span class="type-dot" :style="{ background: type.color }"></span>
                {{ type.label }}
              </button>
            </div>
          </div>

          <div v-if="availableRelations.length > 0" class="input-group">
            <label>关联活动（可选）</label>
            <div class="relation-list">
              <button
                v-for="activity in availableRelations"
                :key="activity.id"
                type="button"
                :class="['relation-btn', { active: editRelations.includes(activity.id) }]"
                @click="toggleRelation(activity.id)"
              >
                {{ activity.title.slice(0, 10) }}
              </button>
            </div>
          </div>

          <div v-if="editingActivity" class="input-group danger-row">
            <button type="button" class="btn danger" @click="deleteActivity">删除此活动</button>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" @click="closeModal">取消</button>
          <button type="button" class="btn primary" @click="saveActivity" :disabled="!editTitle.trim()">保存</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const showDetail = ref(false)
const showEditor = ref(false)
const editingActivity = ref(null)
const editTitle = ref('')
const editType = ref('event')
const editDate = ref('')
const editTime = ref('')
const editRelations = ref([])

const activities = computed(() => gameStore.activities || [])
const goals = computed(() => gameStore.goals || [])
const keyChoices = computed(() => gameStore.keyChoices || [])
const encounteredCharacters = computed(() => gameStore.encounteredCharacters || [])
const plotJournal = computed(() => gameStore.plotJournal || [])

const activityTypes = [
  { value: 'event', label: '事件', color: '#6aa7ff' },
  { value: 'milestone', label: '里程碑', color: '#4bc690' },
  { value: 'decision', label: '决定', color: '#f2b04f' },
  { value: 'encounter', label: '遭遇', color: '#f07a3d' }
]

const latestActivity = computed(() => {
  if (activities.value.length === 0) return null
  return [...activities.value].sort(compareActivities)[0] || null
})

const summaryItems = computed(() => {
  const activeGoal = goals.value.find((goal) => goal?.status === 'active') || goals.value[0]
  const latestChoice = keyChoices.value[keyChoices.value.length - 1]
  const characterNames = encounteredCharacters.value
    .map((character) => character?.name || character)
    .filter(Boolean)
    .slice(0, 4)

  return [
    activeGoal ? { label: '当前目标', value: activeGoal.title || activeGoal.label || String(activeGoal) } : null,
    latestChoice ? { label: '最近选择', value: latestChoice.label || latestChoice.title || String(latestChoice) } : null,
    characterNames.length > 0 ? { label: '已遇角色', value: characterNames.join('、') } : null
  ].filter(Boolean)
})

const groupedActivities = computed(() => {
  const groups = {}
  ;[...activities.value]
    .sort(compareActivities)
    .forEach((activity) => {
      const dateKey = activity.date || normalizeActivityDate(activity.time) || 'unknown'
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(activity)
    })
  return groups
})

const availableRelations = computed(() => activities.value.filter((activity) => activity.id !== editingActivity.value?.id))
const latestPlotEntry = computed(() => {
  if (typeof gameStore.latestPlotJournalEntry === 'function') {
    return gameStore.latestPlotJournalEntry()
  }
  return plotJournal.value[plotJournal.value.length - 1] || null
})
const proseTriggerState = computed(() => getTriggerState('prose'))
const storyboardTriggerState = computed(() => getTriggerState('storyboard'))
const triggerMetaItems = computed(() => {
  const entry = latestPlotEntry.value
  if (!entry) return []

  const locations = Array.isArray(entry.locations) ? entry.locations.filter(Boolean) : []
  const unresolvedHooks = Array.isArray(entry.unresolvedHooks) ? entry.unresolvedHooks.filter(Boolean) : []
  const participants = Array.isArray(entry.participants) ? entry.participants.filter(Boolean) : []

  return [
    locations.length > 0 ? { label: '地点', value: locations.join(' / ') } : null,
    participants.length > 0 ? { label: '角色', value: participants.join(' / ') } : null,
    unresolvedHooks.length > 0 ? { label: '未决钩子', value: unresolvedHooks.join('；') } : null
  ].filter(Boolean)
})
const proseDraftCard = computed(() => buildDraftCard(proseTriggerState.value, 'prose'))
const storyboardDraftCard = computed(() => buildDraftCard(storyboardTriggerState.value, 'storyboard'))

onMounted(() => {
  loadActivities()
})

function compareActivities(a, b) {
  const left = normalizeActivityTimestamp(b)
  const right = normalizeActivityTimestamp(a)
  return left.localeCompare(right)
}

function getTriggerState(type) {
  if (typeof gameStore.getAdventureTriggerState === 'function') {
    return gameStore.getAdventureTriggerState(type)
  }
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const draft = gameStore.adventureTriggers?.[triggerType] || null
  return {
    type: triggerType,
    latestEntry: latestPlotEntry.value,
    draft,
    isReady: Boolean(latestPlotEntry.value?.summary),
    isGenerating: false,
    isAccepted: draft?.status === 'accepted',
    canGenerate: Boolean(latestPlotEntry.value?.summary) && draft?.status !== 'accepted',
    hasDraftForLatestEntry: Boolean(draft && latestPlotEntry.value && draft.sourcePlotId === (latestPlotEntry.value.id || latestPlotEntry.value.chapterId))
  }
}

function getGenerateLabel(type) {
  const state = type === 'storyboard' ? storyboardTriggerState.value : proseTriggerState.value
  if (state?.isAccepted) {
    return type === 'storyboard' ? '分镜已保存' : '正文已保存'
  }
  if (state?.isGenerating) {
    return type === 'storyboard' ? '分镜整理中' : '正文生成中'
  }
  return type === 'storyboard' ? '整理成事件分镜' : '整理成我的版本'
}

function isGenerateDisabled(type) {
  const state = type === 'storyboard' ? storyboardTriggerState.value : proseTriggerState.value
  if (!state) return true
  return state.isAccepted || (!state.canGenerate && !state.isGenerating)
}

function buildDraftCard(state, type) {
  const draft = state?.draft
  if (!state?.hasDraftForLatestEntry || !draft) return null

  const triggerTypeLabel = type === 'storyboard' ? '分镜' : '正文'
  if (draft.status === 'accepted') {
    return {
      status: '已采纳',
      message: type === 'storyboard' ? '已保存到分镜文档与素材库。' : '已保存到素材库。',
      canAccept: false,
      canDismiss: false,
      canAct: false,
      dismissLabel: ''
    }
  }

  if (draft.status === 'error') {
    return {
      status: '失败',
      message: draft.error || `${triggerTypeLabel}生成失败，请稍后重试。`,
      canAccept: false,
      canDismiss: true,
      canAct: true,
      dismissLabel: '清除错误'
    }
  }

  if (draft.status === 'generating') {
    return {
      status: '生成中',
      message: type === 'storyboard' ? 'AI 正在整理这一段的分镜结构。' : 'AI 正在把这段冒险改写成正文。' ,
      canAccept: false,
      canDismiss: false,
      canAct: false,
      dismissLabel: ''
    }
  }

  if (draft.status === 'ready') {
    const message = type === 'storyboard'
      ? `${Array.isArray(draft.shots) ? draft.shots.length : 0} 个镜头已整理完，可直接采纳到分镜。`
      : String(draft.content || '').trim() || '正文草稿已生成，可直接采纳。'
    return {
      status: '待采纳',
      message,
      canAccept: true,
      canDismiss: true,
      canAct: true,
      dismissLabel: '清除草稿'
    }
  }

  return {
    status: '草稿',
    message: type === 'storyboard' ? '分镜草稿已生成。' : '正文草稿已生成。',
    canAccept: false,
    canDismiss: true,
    canAct: true,
    dismissLabel: '清除草稿'
  }
}

function normalizeActivityTimestamp(activity = {}) {
  return String(activity.time || activity.date || '')
}

function normalizeActivityDate(timeValue) {
  if (!timeValue) return ''
  if (timeValue.includes('T')) return timeValue.split('T')[0]
  if (timeValue.includes(' ')) return timeValue.split(' ')[0]
  return ''
}

function getActivityColor(type) {
  const item = activityTypes.find((entry) => entry.value === type)
  return item?.color || '#6aa7ff'
}

function getActivityLabel(type) {
  const item = activityTypes.find((entry) => entry.value === type)
  return item?.label || type
}

function formatDateKey(dateKey) {
  if (!dateKey || dateKey === 'unknown') return '未分类'
  const date = new Date(dateKey)
  if (Number.isNaN(date.getTime())) return dateKey

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]

  if (dateKey === today) return '今天'
  if (dateKey === yesterday) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  if (timeStr.includes('T')) {
    const date = new Date(timeStr)
    if (!Number.isNaN(date.getTime())) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
  }
  if (timeStr.includes(' ')) return timeStr.split(' ')[1]?.slice(0, 5) || ''
  return timeStr.slice(0, 5)
}

function loadActivities() {
  if (typeof gameStore.loadWritingActivities === 'function') {
    gameStore.loadWritingActivities()
    return
  }
  gameStore.activities = Array.isArray(gameStore.activities) ? gameStore.activities : []
}

function saveActivities(nextActivities = activities.value) {
  if (typeof gameStore.saveWritingActivities === 'function') {
    gameStore.saveWritingActivities(nextActivities)
    return
  }
  gameStore.activities = Array.isArray(nextActivities) ? nextActivities : []
}

function openAddModal() {
  editingActivity.value = null
  editTitle.value = ''
  editType.value = 'event'
  const now = new Date()
  editDate.value = now.toISOString().split('T')[0]
  editTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  editRelations.value = []
  showEditor.value = true
}

async function handleGenerateTrigger(type) {
  if (typeof gameStore.generateAdventureTriggerDraft !== 'function') return
  await gameStore.generateAdventureTriggerDraft(type)
}

async function handleAcceptTrigger(type) {
  if (typeof gameStore.acceptAdventureTriggerDraft !== 'function') return
  await gameStore.acceptAdventureTriggerDraft(type)
}

function handleDismissTrigger(type) {
  if (typeof gameStore.dismissAdventureTriggerDraft !== 'function') return
  gameStore.dismissAdventureTriggerDraft(type)
}

function editActivity(activity) {
  editingActivity.value = activity
  editTitle.value = activity.title || ''
  editType.value = activity.type || 'event'
  editRelations.value = Array.isArray(activity.relations) ? [...activity.relations] : []

  if (activity.date) {
    editDate.value = activity.date
  } else {
    editDate.value = normalizeActivityDate(activity.time) || new Date().toISOString().split('T')[0]
  }

  if (activity.time?.includes('T')) {
    const date = new Date(activity.time)
    editTime.value = !Number.isNaN(date.getTime())
      ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      : '00:00'
  } else if (activity.time?.includes(' ')) {
    editTime.value = activity.time.split(' ')[1]?.slice(0, 5) || '00:00'
  } else {
    editTime.value = activity.time?.slice(0, 5) || '00:00'
  }

  showDetail.value = false
  showEditor.value = true
}

function closeModal() {
  showEditor.value = false
  editingActivity.value = null
  editRelations.value = []
}

function toggleRelation(id) {
  const index = editRelations.value.indexOf(id)
  if (index === -1) {
    editRelations.value.push(id)
    return
  }
  editRelations.value.splice(index, 1)
}

function saveActivity() {
  if (!editTitle.value.trim()) return

  const payload = {
    title: editTitle.value.trim(),
    type: editType.value,
    date: editDate.value,
    time: editDate.value && editTime.value ? `${editDate.value} ${editTime.value}` : editTime.value,
    relations: [...editRelations.value]
  }

  if (editingActivity.value) {
    saveActivities(
      activities.value.map((activity) => (
        activity.id === editingActivity.value.id
          ? { ...activity, ...payload }
          : activity
      ))
    )
  } else {
    saveActivities([
      ...activities.value,
      {
        id: `a_${Date.now()}`,
        ...payload
      }
    ])
  }

  closeModal()
}

function deleteActivity() {
  if (!editingActivity.value) return
  saveActivities(activities.value.filter((activity) => activity.id !== editingActivity.value.id))
  closeModal()
}
</script>

<style scoped>
.quest-log {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.count-badge {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 82%, #fff 18%);
  color: var(--accent-text, #fff);
  font-size: 10px;
  text-align: center;
}

.adventure-summary {
  display: grid;
  gap: 8px;
}

.trigger-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 95%, transparent), color-mix(in srgb, var(--bg-tertiary) 92%, transparent));
}

.trigger-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.trigger-kicker {
  margin-bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.trigger-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.2;
}

.trigger-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-primary);
}

.trigger-meta {
  display: grid;
  gap: 8px;
  margin: 0;
}

.trigger-meta-item {
  display: grid;
  gap: 2px;
}

.trigger-meta-item dt {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.trigger-meta-item dd {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.trigger-generate-row,
.trigger-draft-actions {
  display: flex;
  gap: 8px;
}

.trigger-draft-card {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 42%, var(--bg-tertiary));
}

.trigger-draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
}

.trigger-draft-status {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.trigger-draft-copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.summary-card {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, transparent), color-mix(in srgb, var(--bg-tertiary) 94%, transparent));
}

.summary-label {
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.summary-value {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.recent-activity,
.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-tertiary);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.recent-activity:hover,
.empty-state:hover {
  background: var(--bg-hover);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  transform: translateY(-1px);
}

.empty-state {
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.activity-preview {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}

.activity-dot,
.marker-dot,
.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.activity-info,
.item-content {
  flex: 1;
  min-width: 0;
}

.activity-title,
.item-title {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-meta,
.item-time {
  font-size: 10px;
  color: var(--text-muted);
}

.expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.inline-actions,
.modal-footer {
  display: flex;
  gap: 8px;
}

.mini-btn,
.btn,
.type-btn,
.relation-btn,
.close-btn,
.timeline-item {
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: inherit;
}

.mini-btn,
.btn {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.mini-btn {
  flex: 1;
}

.mini-btn:hover,
.btn:hover,
.type-btn:hover,
.relation-btn:hover,
.timeline-item:hover,
.close-btn:hover {
  background: var(--bg-hover);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
}

.mini-btn.primary,
.btn.primary,
.type-btn.active,
.relation-btn.active {
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-tertiary));
  border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
}

.mini-btn.primary,
.btn.primary {
  color: var(--text-primary);
}

.mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(7, 10, 18, 0.56);
  z-index: 1000;
}

.detail-modal {
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-secondary);
  overflow: hidden;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
}

.modal-body {
  padding: 18px;
  overflow-y: auto;
}

.timeline-view,
.timeline-group {
  display: flex;
  flex-direction: column;
}

.timeline-view {
  gap: 16px;
}

.timeline-group {
  gap: 8px;
}

.timeline-date {
  padding-left: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.timeline-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item {
  display: grid;
  grid-template-columns: 42px 10px 1fr;
  gap: 8px;
  align-items: start;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}

.item-time {
  padding-top: 2px;
}

.item-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
}

.marker-line {
  width: 1px;
  min-height: 18px;
  background: color-mix(in srgb, var(--border) 88%, transparent);
}

.item-type {
  margin-top: 3px;
  font-size: 10px;
  font-weight: 600;
}

.empty-panel {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-align: center;
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

.half {
  flex: 1;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.name-input,
.date-input,
.time-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.name-input:focus,
.date-input:focus,
.time-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
}

.type-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.type-btn,
.relation-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.relation-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.danger-row {
  padding-top: 4px;
}

.btn.danger {
  color: #d95d71;
  border-color: color-mix(in srgb, #d95d71 45%, var(--border));
  background: color-mix(in srgb, #d95d71 10%, var(--bg-tertiary));
}

@media (max-width: 720px) {
  .detail-modal {
    max-height: calc(100vh - 20px);
  }

  .input-row,
  .inline-actions,
  .modal-footer,
  .trigger-generate-row,
  .trigger-draft-actions {
    flex-direction: column;
  }

  .type-selector {
    grid-template-columns: 1fr;
  }
}

/* Kao record-book overrides — internal modals (查看事件卷 / 记入事件)
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
  content: "卷宗 · 事件卷";
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

.theme-kao .modal-footer {
  background: var(--archive-paper-soft);
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
}

.theme-kao .modal-footer .btn,
.theme-kao .modal-footer .btn.primary,
.theme-kao .modal-footer .tavern-btn,
.theme-kao .modal-footer .tavern-btn.primary {
  background: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  color: var(--archive-ink);
  border-radius: 0;
  font-family: var(--font-display);
  letter-spacing: 0.08em;
}

.theme-kao .modal-footer .btn.primary,
.theme-kao .modal-footer .tavern-btn.primary {
  background: var(--archive-olive);
  border-color: var(--archive-olive-strong);
  color: var(--archive-paper-soft);
}

.theme-kao .modal-footer .btn.primary:hover,
.theme-kao .modal-footer .tavern-btn.primary:hover {
  background: var(--archive-olive-strong);
}

.theme-kao .modal-footer .btn:hover,
.theme-kao .modal-footer .tavern-btn:hover {
  background: color-mix(in srgb, var(--archive-paper-strong) 40%, var(--archive-paper));
  color: var(--archive-olive-strong);
}

.theme-kao .modal-body .btn,
.theme-kao .modal-body .tavern-btn {
  background: var(--archive-paper-soft);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  color: var(--archive-ink);
  border-radius: 0;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.theme-kao .modal-body .btn:hover,
.theme-kao .modal-body .tavern-btn:hover {
  background: color-mix(in srgb, var(--archive-paper-strong) 40%, var(--archive-paper));
  border-color: var(--archive-gold);
}

.theme-kao .modal-body input,
.theme-kao .modal-body select,
.theme-kao .modal-body textarea {
  background: var(--archive-paper-soft);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 0;
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: 13px;
}

.theme-kao .modal-body input::placeholder,
.theme-kao .modal-body textarea::placeholder {
  color: color-mix(in srgb, var(--archive-ink) 44%, transparent);
  font-style: italic;
}

.theme-kao .modal-body label {
  color: color-mix(in srgb, var(--archive-ink) 70%, transparent);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.04em;
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

.theme-kao .modal-overlay,
.theme-kao .detail-overlay {
  background: color-mix(in srgb, var(--archive-ink) 30%, transparent);
}
</style>
