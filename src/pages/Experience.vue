<template>
  <div class="game-page">
    <!-- 标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <span class="app-title">小说体验</span>
        <select class="worldbook-select" v-model="selectedWorldbookId" @change="onWorldbookChange">
          <option value="">选择世界书...</option>
          <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
            {{ wb.name }}
          </option>
        </select>
      </div>
      <div class="title-right">
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <span class="theme-icon">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
            </svg>
          </span>
          <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
        </button>
        <button class="action-btn" :class="{ active: gameStore.useAI }" @click="gameStore.toggleAI">
          AI {{ gameStore.useAI ? 'ON' : 'OFF' }}
        </button>
        <button class="action-btn" :disabled="assetSummaryLoading" @click="organizeExperienceAssets">
          {{ assetSummaryLoading ? '整理中' : '整理体验' }}
        </button>
        <button class="action-btn" @click="openWorldbookEditor">世界书导入</button>
        <button class="action-btn" @click="showSessionPicker = true">会话</button>
        <button class="action-btn" @click="showSettings = true">设置</button>
      </div>
    </header>

    <div class="game-layout">
      <aside v-if="!showSessionPicker" class="sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
          <span>{{ sidebarCollapsed ? '»' : '«' }}</span>
        </div>
        <template v-if="!sidebarCollapsed">
          <div class="sidebar-section">
            <StatusBar />
          </div>
          <div class="sidebar-section">
            <WorldMap />
          </div>
          <div class="sidebar-section">
            <QuestLog />
          </div>
        </template>
      </aside>

      <div class="game-main" v-if="!showSessionPicker">
        <GamePanel @show-inline-detail="handleInlineDetail" />
        <InputArea @send="handleSend" />
      </div>
      <SessionPicker
        v-else
        @select="handleSessionSelect"
        @create="handleSessionCreate"
        @delete="handleSessionDelete"
      />
    </div>

    <aside class="quick-notes-rail" aria-label="快捷入口">
      <button class="quick-notes-btn" type="button" @click.stop="quickNoteOpen = !quickNoteOpen" title="打开速记">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 18.5l2.9-.7 8.1-8.1-2.2-2.2-8.1 8.1-.7 2.9z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13.2 8.8l2.2 2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </aside>

    <div v-if="quickNoteOpen" class="quick-note-workspace-overlay" @click.self="quickNoteOpen = false">
      <section class="quick-note-workspace">
        <header class="quick-note-workspace-header">
          <div>
            <div class="quick-note-workspace-kicker">体验素材</div>
            <h3 class="quick-note-workspace-title">速记与对话导入</h3>
          </div>
          <button class="quick-note-close" type="button" @click="quickNoteOpen = false" aria-label="关闭速记面板">×</button>
        </header>

        <div class="quick-note-workspace-body">
          <section class="quick-note-editor-panel">
            <div class="quick-note-panel-head">
              <span>速记</span>
              <select v-model="narrativeAssetKind" class="quick-note-kind-select">
                <option v-for="kind in narrativeAssetKinds" :key="kind.value" :value="kind.value">
                  {{ kind.label }}
                </option>
              </select>
            </div>
            <textarea
              v-model="quickNoteDraft"
              class="quick-note-workspace-input"
              placeholder="随手记一段体验片段、设定、人物变化或正文候选..."
              @input="handleQuickNoteInput"
            ></textarea>
            <div class="quick-note-workspace-actions">
              <button class="quick-note-panel-btn primary" type="button" @click="saveQuickNote">保存到笔记</button>
              <button class="quick-note-panel-btn" type="button" @click="saveQuickNoteAsAsset">存为素材</button>
              <button class="quick-note-panel-btn" type="button" @click="clearQuickNoteDraft">清空</button>
            </div>
          </section>

          <aside class="quick-note-dialogue-panel">
            <div class="quick-note-panel-head">
              <span>对话段</span>
              <button class="quick-note-panel-btn compact" type="button" @click="toggleQuickNoteImport">
                {{ quickNoteImportOpen ? '关闭选择' : '选择模式' }}
              </button>
            </div>
            <div v-if="dialoguePanelMessages.length" class="quick-note-message-list">
              <label
                v-for="item in dialoguePanelMessages"
                :key="item.index"
                class="quick-note-message-item"
                :class="{ active: gameStore.quickNoteSelectedMessageIndexes.includes(item.index) }"
              >
                <input
                  type="checkbox"
                  :checked="gameStore.quickNoteSelectedMessageIndexes.includes(item.index)"
                  @change="gameStore.toggleQuickNoteMessageSelection(item.index)"
                />
                <span class="quick-note-message-copy">
                  <span class="quick-note-message-meta">{{ item.label }}</span>
                  <span class="quick-note-message-preview">{{ item.preview }}</span>
                </span>
              </label>
            </div>
            <div v-else class="quick-note-import-empty">当前还没有可导入的对话段。</div>
            <div class="quick-note-stat-grid">
              <div class="quick-note-stat"><span>总段数</span><strong>{{ dialogueImportStats.totalCount }}</strong></div>
              <div class="quick-note-stat"><span>已选</span><strong>{{ dialogueImportStats.selectedCount }}</strong></div>
              <div class="quick-note-stat"><span>总字数</span><strong>{{ dialogueImportStats.totalWords }}</strong></div>
              <div class="quick-note-stat"><span>已选字</span><strong>{{ dialogueImportStats.selectedWords }}</strong></div>
            </div>
            <div class="quick-note-workspace-actions">
              <button class="quick-note-panel-btn primary" type="button" @click="importSelectedDialogueSegments">导入速记</button>
              <button class="quick-note-panel-btn" type="button" @click="saveSelectedDialogueSegmentsAsAsset">存为素材</button>
              <button class="quick-note-panel-btn" type="button" @click="gameStore.clearQuickNoteMessageSelection">清空选择</button>
            </div>
            <div v-if="quickNoteStatus" class="quick-note-workspace-tip">{{ quickNoteStatus }}</div>
          </aside>
        </div>
      </section>
    </div>

    <Character v-if="showCharacter" @close="showCharacter = false" />
    <Settings v-if="showSettings" @close="showSettings = false" />

    <!-- 机制面板 -->
    <MechanismPanel
      :visible="showMechanismPanel"
      :mechanismType="gameStore.activeMechanism"
      :context="gameStore.mechanismContext"
      :playerCharacter="gameStore.playerCharacter"
      :gold="gameStore.player?.money || 100"
      @close="handleMechanismClose"
      @action="handleMechanismAction"
    />

    <!-- 里程碑事件弹窗 -->
    <MilestoneModal
      :visible="showMilestoneModal"
      :event="gameStore.milestoneEvent"
      @close="handleMilestoneClose"
    />

    <!-- 内联事件详情弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="inlineDetail" class="inline-detail-overlay" @click.self="closeInlineDetail">
          <div class="inline-detail-card">
            <header class="inline-detail-header">
              <span class="inline-detail-icon">{{ inlineDetail.type === 'dialogue' ? '💬' : '📦' }}</span>
              <span class="inline-detail-title">{{ inlineDetail.type === 'dialogue' ? '对话详情' : '物品信息' }}</span>
              <button class="inline-detail-close" @click="closeInlineDetail">×</button>
            </header>
            <div class="inline-detail-body">
              <template v-if="inlineDetail.type === 'dialogue'">
                <p class="inline-detail-content">"{{ inlineDetail.content }}"</p>
                <div class="inline-detail-hint">点击其他区域关闭</div>
              </template>
              <template v-else-if="inlineDetail.type === 'item'">
                <p class="inline-detail-content">{{ inlineDetail.content }}</p>
                <div class="inline-detail-actions">
                  <button class="action-btn" @click="collectItem(inlineDetail.content)">收入背包</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="game-image-gen-rail">
      <ImageGenRail
        storage-key="game_image_library_v1"
        side="right"
        :vertical-offset="0"
        :horizontal-offset="0"
        drawer-title="体验生图"
        selected-prompt-label="当前输入"
        :selected-text="gameStore.inputText || ''"
      />

      <!-- 创作顾问悬浮按钮 -->
      <button class="advisor-fab" @click="openAdvisor" title="打开创作顾问">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5"></circle>
          <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
        </svg>
      </button>

      <AdvisorPanel
        :isOpen="advisorOpen"
        :messages="advisorMessages"
        :loading="advisorLoading"
        :backend="backend"
        :quickQuestions="['分析当前节奏', '人物塑造建议', '剧情发展方向', '续写灵感']"
        :emptyText="'创作顾问可帮你分析当前冒险状态，提供叙事建议和剧情方向指引。'"
        @close="closeAdvisor"
        @ask="handleAskAdvisor"
        @update:backend="(v) => backend = v"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import ImageGenRail from '../components/ImageGenRail.vue'
import { useTheme } from '../composables/useTheme'
import { useAdvisor } from '../composables/useAdvisor'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import GamePanel from '../components/GamePanel.vue'
import InputArea from '../components/InputArea.vue'
import StatusBar from '../components/StatusBar.vue'
import QuestLog from '../components/QuestLog.vue'
import WorldMap from '../components/WorldMap.vue'
import Settings from '../components/Settings.vue'
import Character from '../components/Character.vue'
import MechanismPanel from '../components/MechanismPanel.vue'
import MilestoneModal from '../components/MilestoneModal.vue'
import SessionPicker from '../components/SessionPicker.vue'
import { getTextItem, removeItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { ASSET_KINDS, addNarrativeAsset, getAssetKindLabel } from '../services/narrativeAssets'
import { summarizeExperienceAssets } from '../services/experienceAssetSummarizer'
import { buildWritingNoteTitle, prependWritingNote } from '../services/writingNotes'

const router = useRouter()
const gameStore = useGameStore()
const worldStore = useWorldStore()
const { isDark, toggleTheme } = useTheme()
const { advisorOpen, advisorMessages, advisorLoading, backend, askAdvisor, openAdvisor, closeAdvisor } = useAdvisor('novel')

const selectedWorldbookId = ref('')
const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const sidebarCollapsed = ref(false)
const showSessionPicker = ref(false)

onMounted(async () => {
  await worldStore.loadWorldbooksIndex()
  gameStore.loadSessions()

  const currentSession = gameStore.sessions.find((session) => session.id === gameStore.currentSessionId) || null
  if (currentSession) {
    gameStore.loadSession(currentSession.id)
    selectedWorldbookId.value = currentSession.worldbookId || currentSession.worldId || ''
    if (selectedWorldbookId.value) {
      await worldStore.setActiveWorldbook(selectedWorldbookId.value)
    }
  } else {
    selectedWorldbookId.value = ''
    await worldStore.setActiveWorldbook(null)
    gameStore.resetRuntimeState()
    showSessionPicker.value = true
  }

  if (currentSession && (!gameStore.isPlaying || !Array.isArray(gameStore.messages) || gameStore.messages.length === 0)) {
    await gameStore.initGame()
  }

  if (typeof gameStore.loadDialogueCharacters === 'function') {
    gameStore.loadDialogueCharacters()
  }
})

watch(() => worldStore.activeWorldbookId, (nextId) => {
  const normalized = nextId || ''
  if (selectedWorldbookId.value !== normalized) {
    selectedWorldbookId.value = normalized
  }
})

async function onWorldbookChange() {
  const worldbookId = selectedWorldbookId.value
  if (!worldbookId) return

  await worldStore.setActiveWorldbook(worldbookId)
}

function openWorldbookEditor() {
  router.push({ name: 'experience-worldbook' })
}

function collectGameContext() {
  const msgs = gameStore.messages || []
  return {
    isPlaying: gameStore.isPlaying,
    worldName: gameStore.worldName || '',
    playerName: gameStore.playerName || '',
    characterName: gameStore.characterName || '',
    messages: msgs.slice(-20).map(m => ({ role: m.role, content: m.content })),
    storyProgress: gameStore.storyProgress || 0,
    inventoryCount: (gameStore.inventory || []).length,
    questCount: (gameStore.quests || []).length
  }
}

async function handleAskAdvisor(question) {
  await askAdvisor(question, collectGameContext)
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

const showCharacter = ref(false)
const showSettings = ref(false)

// 机制面板与里程碑事件
const showMechanismPanel = computed(() => !!gameStore.activeMechanism)
const showMilestoneModal = computed(() => !!gameStore.milestoneEvent)

function handleMechanismClose() {
  gameStore.deactivateMechanism()
}

async function handleMechanismAction(action) {
  console.log('Mechanism action:', action)

  const actionDescriptions = {
    combat: {
      attack: '发起攻击',
      defend: '进行防御',
      skill: '释放技能',
      flee: '选择撤退'
    },
    trade: {
      buy: `购买了物品`
    },
    quest: {
      accept: '接受了任务',
      decline: '暂时忽略了任务'
    },
    dialogue: {
      respond: '做出了回应'
    }
  }

  const actionType = action.type
  const actionName = action.action
  const description = actionDescriptions[actionType]?.[actionName] || actionName

  // 构建行动描述
  let actionText = ''
  if (actionType === 'combat') {
    actionText = `【战斗行动】我选择${description}。`
  } else if (actionType === 'trade' && action.item) {
    actionText = `【交易】我决定购买${action.item.name}。`
  } else if (actionType === 'quest') {
    actionText = `【任务】我${description}。`
  } else if (actionType === 'dialogue') {
    actionText = `【对话】我选择："${action.option}"`
  }

  gameStore.deactivateMechanism()

  // 将行动注入回叙事
  if (actionText && gameStore.useAI) {
    // 添加用户行动消息
    gameStore.messages.push({
      role: 'user',
      content: actionText,
      timestamp: Date.now()
    })
    gameStore.chatHistory.push({ role: 'user', content: actionText })
    gameStore.saveCurrentSession()

    // 触发 AI 生成结果
    await gameStore.generateAIResponse()
  }
}

function handleMilestoneClose() {
  gameStore.clearMilestoneEvent()
}

// 会话选择处理
async function handleSessionSelect(session) {
  gameStore.loadSession(session.id)
  // 设置世界书选择
  selectedWorldbookId.value = session.worldbookId || session.worldId || ''
  if (selectedWorldbookId.value) {
    await worldStore.setActiveWorldbook(selectedWorldbookId.value)
  }
  showSessionPicker.value = false
  if (!gameStore.messages || gameStore.messages.length === 0) {
    await gameStore.initGame()
  }
}

async function handleSessionCreate() {
  const worldbookId = selectedWorldbookId.value || ''
  if (!worldbookId) {
    window.alert('请先选择世界书')
    return
  }
  gameStore.createSession({
    worldbookId,
    inheritRuntimeState: false
  })
  if (worldbookId) {
    await worldStore.setActiveWorldbook(worldbookId)
  }
  selectedWorldbookId.value = worldbookId
  showSessionPicker.value = false
  await gameStore.initGame()
}

async function handleSessionDelete(session) {
  gameStore.deleteSession(session.id)
  // 如果删除后没有会话了，自动创建一个新会话
  if (gameStore.sessions.length === 0) {
    const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
    gameStore.createSession({
      worldbookId,
      inheritRuntimeState: false
    })
    if (worldbookId) {
      await worldStore.setActiveWorldbook(worldbookId)
    }
    selectedWorldbookId.value = worldbookId
    showSessionPicker.value = false
    await gameStore.initGame()
    return
  }
  if (gameStore.currentSessionId === null) {
    showSessionPicker.value = true
  }
}

// 内联事件详情
const inlineDetail = ref(null)

function handleInlineDetail(event) {
  inlineDetail.value = event
}

function closeInlineDetail() {
  inlineDetail.value = null
}

function collectItem(itemName) {
  // 简单记录到活动日志
  const activity = {
    id: Date.now().toString(),
    title: `获得物品：${itemName}`,
    type: 'item',
    timestamp: new Date().toISOString()
  }
  gameStore.saveWritingActivities([activity, ...(gameStore.activities || [])])
  closeInlineDetail()
}

const QUICK_NOTE_DRAFT_KEY = STORAGE_KEYS.QUICK_NOTE_DRAFT
const quickNoteOpen = ref(false)
const quickNoteDraft = ref(loadQuickNoteDraft())
const quickNoteStatus = ref('')
const quickNoteImportOpen = ref(false)
const narrativeAssetKind = ref('draft-prose')
const narrativeAssetKinds = ASSET_KINDS
const assetSummaryLoading = ref(false)

const dialogueImportStats = computed(() => {
  const list = (gameStore.messages || []).filter((message) => {
    const role = message.role || message.type || 'assistant'
    return role !== 'system' && String(message.content || '').trim()
  })
  const selected = gameStore.selectedQuickNoteMessages()
  const totalCount = list.length
  const selectedCount = selected.length
  const totalWords = list.reduce((sum, item) => sum + quickNoteWordCount(item.content), 0)
  const selectedWords = selected.reduce((sum, item) => sum + quickNoteWordCount(item), 0)
  return { totalCount, selectedCount, totalWords, selectedWords }
})

const dialoguePanelMessages = computed(() => {
  return (gameStore.messages || [])
    .map((message, index) => {
      const role = message.role || message.type || 'assistant'
      const content = String(message.content || '').trim()
      return {
        index,
        role,
        content,
        label: role === 'user' ? '玩家' : '叙事',
        preview: content.replace(/\s+/g, ' ').slice(0, 90)
      }
    })
    .filter((item) => item.role !== 'system' && item.content)
})

function handleSend(text, options = {}) {
  gameStore.sendAction(text, options)
}

function loadQuickNoteDraft() {
  return getTextItem(QUICK_NOTE_DRAFT_KEY)
}

function persistQuickNoteDraft() {
  setTextItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
}

function handleQuickNoteInput() {
  persistQuickNoteDraft()
}

function toggleQuickNoteImport() {
  if (!dialogueImportStats.value.totalCount) {
    quickNoteStatus.value = '当前没有可导入的对话段'
    return
  }
  quickNoteImportOpen.value = !quickNoteImportOpen.value
  gameStore.setQuickNoteImportMode(quickNoteImportOpen.value)
}

function importSelectedDialogueSegments() {
  const picked = gameStore.selectedQuickNoteMessages()
  if (!picked.length) {
    quickNoteStatus.value = '先选对话段再导入'
    return
  }
  const text = picked.join('\n\n')
  quickNoteDraft.value = quickNoteDraft.value ? `${quickNoteDraft.value}\n\n${text}` : text
  persistQuickNoteDraft()
  quickNoteImportOpen.value = false
  gameStore.setQuickNoteImportMode(false)
  quickNoteStatus.value = `已导入 ${picked.length} 段对话`
}

function getSelectedDialogueMessageRefs() {
  const pickedIndexes = new Set(gameStore.quickNoteSelectedMessageIndexes || [])
  return (gameStore.messages || [])
    .map((message, index) => ({ message, index }))
    .filter(({ message, index }) => {
      const role = message.role || message.type || 'assistant'
      return pickedIndexes.has(index) && role !== 'system' && String(message.content || '').trim()
    })
}

function saveQuickNoteAsAsset() {
  const content = quickNoteDraft.value.trim()
  if (!content) {
    quickNoteStatus.value = '先写点内容再存素材'
    return false
  }

  const asset = addNarrativeAsset({
    content,
    kind: narrativeAssetKind.value,
    projectId: gameStore.worldId || null,
    source: {
      type: 'experience-session',
      id: gameStore.currentSessionId || '',
      messageIds: []
    }
  })

  clearQuickNoteDraft()
  quickNoteStatus.value = `已存入素材：${getAssetKindLabel(asset.kind)}`
  return true
}

function saveSelectedDialogueSegmentsAsAsset() {
  const refs = getSelectedDialogueMessageRefs()
  if (!refs.length) {
    quickNoteStatus.value = '先选对话段再存素材'
    return false
  }

  const content = refs.map(({ message }) => String(message.content || '').trim()).join('\n\n')
  const asset = addNarrativeAsset({
    content,
    kind: narrativeAssetKind.value,
    projectId: gameStore.worldId || null,
    source: {
      type: 'experience-session',
      id: gameStore.currentSessionId || '',
      messageIds: refs.map(({ message, index }) => message.id || `message_${index}`)
    }
  })

  quickNoteImportOpen.value = false
  gameStore.setQuickNoteImportMode(false)
  quickNoteStatus.value = `已存入素材：${getAssetKindLabel(asset.kind)}`
  return true
}

async function organizeExperienceAssets() {
  const messages = (gameStore.messages || []).filter((message) => {
    const role = message.role || message.type || 'assistant'
    return role !== 'system' && String(message.content || '').trim()
  })

  if (messages.length < 2) {
    quickNoteStatus.value = '当前体验内容太少，先推进几轮剧情'
    quickNoteOpen.value = true
    return
  }

  assetSummaryLoading.value = true
  quickNoteOpen.value = true
  quickNoteStatus.value = '正在整理体验素材...'

  const currentSession = gameStore.sessions.find((session) => session.id === gameStore.currentSessionId) || null
  const result = await summarizeExperienceAssets({
    messages,
    worldName: worldStore.activeWorldbookName || gameStore.worldName || '',
    sessionTitle: currentSession?.title || ''
  })

  assetSummaryLoading.value = false

  if (!result.success) {
    quickNoteStatus.value = result.error || '整理体验失败'
    return
  }

  if (!result.assets.length) {
    quickNoteStatus.value = '没有整理出可用素材'
    return
  }

  for (const asset of result.assets) {
    addNarrativeAsset({
      ...asset,
      projectId: gameStore.worldId || null,
      source: {
        type: 'experience-session',
        id: gameStore.currentSessionId || '',
        messageIds: messages.map((message, index) => message.id || `message_${index}`).slice(-24)
      }
    })
  }

  quickNoteStatus.value = `已整理 ${result.assets.length} 条素材`
}

function clearQuickNoteDraft() {
  quickNoteDraft.value = ''
  removeItem(QUICK_NOTE_DRAFT_KEY)
}

watch(quickNoteOpen, (open) => {
  if (!open) {
    quickNoteImportOpen.value = false
    gameStore.setQuickNoteImportMode(false)
  }
})

function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

function saveQuickNote() {
  const content = quickNoteDraft.value.trim()
  if (!content) {
    quickNoteStatus.value = '先写点内容再保存'
    return false
  }

  prependWritingNote({
    title: buildWritingNoteTitle(content, '速记'),
    content,
    contentFormat: 'md',
    wordCount: quickNoteWordCount(content)
  })
  clearQuickNoteDraft()
  quickNoteStatus.value = '已保存到笔记'
  return true
}

</script>

<style scoped>
.game-page {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-left .app-title {
  font-size: 14px;
  font-weight: 600;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn {
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.worldbook-select {
  height: 32px;
  padding: 0 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  min-width: 160px;
}

.worldbook-select:focus {
  outline: none;
  border-color: var(--accent);
}

.game-layout {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 32px;
  overflow: visible;
}

.sidebar-toggle {
  width: 24px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  align-self: flex-end;
}

.sidebar-toggle:hover {
  color: var(--accent);
}

.sidebar-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.quick-notes-rail {
  position: fixed !important;
  right: 0 !important;
  top: calc(50% - 60px) !important; /* 向上移动 60px */
  z-index: 2000 !important; /* 确保层级足够高 */
  transform: translate(34px, -50%);
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
}

.quick-notes-rail > *,
.game-image-gen-rail > * {
  pointer-events: auto;
}


.quick-notes-rail:hover,
.quick-notes-rail:focus-within {
  transform: translate(0, -50%);
}

.game-image-gen-rail :deep(.image-gen-rail) {
  position: fixed !important;
  right: 0 !important;
  top: calc(50% + 60px) !important; /* 向下移动 60px，彻底避开笔记 */
  z-index: 2001 !important; /* 比笔记更高，防止遮挡 */
  transform: translate(34px, -50%) !important;
  display: flex !important;
  visibility: visible !important;
}

.game-image-gen-rail :deep(.image-gen-rail:hover),
.game-image-gen-rail :deep(.image-gen-rail:has(.image-gen-drawer)) {
  transform: translate(0, -50%) !important;
}

/* 4. 辅助：修正按钮样式，确保它在 wrapper 中可见 */
.game-image-gen-rail :deep(.image-gen-btn) {
  display: flex !important;
  opacity: 1 !important;
}

.quick-notes-btn {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 18%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.quick-note-kind-select {
  width: 112px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 10px;
  padding: 3px 6px;
  outline: none;
}

.quick-note-kind-select:focus {
  border-color: var(--accent);
}

.quick-note-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--text-secondary);
}

.quick-note-stat strong {
  color: var(--text-primary);
  font-weight: 600;
}

.advisor-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 40%, transparent);
  z-index: 200;
  transition: transform 0.2s, box-shadow 0.2s;
}

.advisor-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 50%, transparent);
}

.quick-note-workspace-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: color-mix(in srgb, #000 22%, transparent);
  backdrop-filter: blur(8px);
}

.quick-note-workspace {
  width: min(980px, calc(100vw - 36px));
  height: min(76vh, 680px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-primary) 90%, var(--bg-secondary));
  box-shadow: 0 22px 54px color-mix(in srgb, #000 26%, transparent);
}

.quick-note-workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.quick-note-workspace-kicker {
  font-size: 11px;
  color: var(--text-muted);
}

.quick-note-workspace-title {
  margin: 4px 0 0;
  font-size: 18px;
  line-height: 1.2;
  color: var(--text-primary);
}

.quick-note-close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
}

.quick-note-workspace-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
  gap: 14px;
}

.quick-note-editor-panel,
.quick-note-dialogue-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, var(--bg-primary));
}

.quick-note-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.quick-note-workspace-input {
  flex: 1;
  min-height: 240px;
  resize: none;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
  color: var(--text-primary);
  padding: 12px;
  font-size: 13px;
  line-height: 1.65;
  outline: none;
}

.quick-note-workspace-input:focus {
  border-color: var(--accent);
}

.quick-note-workspace-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-note-message-list {
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 8px;
  overflow: auto;
  padding-right: 2px;
}

.quick-note-message-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.quick-note-message-item:hover {
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-primary));
}

.quick-note-message-item.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
}

.quick-note-message-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.quick-note-message-meta {
  font-size: 10px;
  color: var(--text-muted);
}

.quick-note-message-preview {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.quick-note-import-empty {
  color: var(--text-secondary);
  line-height: 1.4;
}

.quick-note-panel-btn {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.quick-note-panel-btn:hover,
.quick-note-panel-btn.primary {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-tertiary));
}

.quick-note-panel-btn.compact {
  min-height: 26px;
  font-size: 11px;
}

.quick-note-stat-grid {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
}

.quick-note-workspace-tip {
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
}

.quick-notes-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 980px) {
  .quick-notes-rail {
    top: auto;
    right: 12px;
    bottom: 14px;
    transform: none;
    transition: none;
    flex-direction: column-reverse;
    align-items: flex-end;
  }

  .quick-notes-btn {
    width: 46px;
    height: 46px;
    border-radius: 999px;
  }

  .quick-note-workspace-overlay {
    padding: 10px;
  }

  .quick-note-workspace {
    width: min(100vw - 20px, 100%);
    height: calc(100vh - 20px);
    padding: 14px;
  }

  .quick-note-workspace-body {
    grid-template-columns: 1fr;
  }
}

/* 内联详情弹窗 */
.inline-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3500;
  backdrop-filter: blur(2px);
}

.inline-detail-card {
  width: min(320px, 90vw);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.inline-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
}

.inline-detail-icon {
  font-size: 18px;
}

.inline-detail-title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.inline-detail-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inline-detail-close:hover {
  background: var(--bg-hover);
}

.inline-detail-body {
  padding: 16px;
}

.inline-detail-content {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

.inline-detail-hint {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.inline-detail-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.inline-detail-actions .action-btn {
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
}

.inline-detail-actions .action-btn:hover {
  background: var(--accent);
  color: #fff;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
