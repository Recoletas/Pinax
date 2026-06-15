<template>
  <div class="game-page">
    <div class="game-layout">
      <div class="game-main-shell" v-if="!showSessionPicker">
        <div class="game-main">
          <GamePanel @show-inline-detail="handleInlineDetail" />
          <InputArea @send="handleSend" />
        </div>
      </div>
      <aside v-if="!showSessionPicker" class="sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-head">
          <div class="sidebar-head-copy">
            <span>情报</span>
            <strong>{{ hasSelectedWorldbook ? playableWorldTitle : '未选择世界' }}</strong>
          </div>
          <button class="sidebar-toggle" type="button" @click="sidebarCollapsed = !sidebarCollapsed">
            {{ sidebarCollapsed ? '展开' : '收起' }}
          </button>
        </div>
        <template v-if="!sidebarCollapsed">
          <div class="sidebar-section">
            <StatusBar />
          </div>
          <div class="sidebar-section">
            <GeographyPanel />
          </div>
          <div class="sidebar-section">
            <QuestLog />
          </div>
        </template>
      </aside>
      <SessionPicker
        v-else
        @select="handleSessionSelect"
        @create="handleSessionCreate"
        @delete="handleSessionDelete"
      />
    </div>

    <aside v-if="showExperienceWorkChrome" class="quick-notes-rail" aria-label="快捷入口">
      <button class="quick-notes-btn" type="button" @click.stop="toggleQuickNoteWorkspace" title="打开速记">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 18.5l2.9-.7 8.1-8.1-2.2-2.2-8.1 8.1-.7 2.9z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13.2 8.8l2.2 2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </aside>

    <Transition name="modal-fade">
      <div v-if="quickNoteOpen" class="quick-note-workspace-overlay" @click.self="quickNoteOpen = false">
        <Transition name="modal-scale" appear>
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
                  <button class="quick-note-panel-btn primary" type="button" @click="saveQuickNoteAsAsset">保存素材</button>
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
        </Transition>
      </div>
    </Transition>

    <Character v-if="showCharacter" @close="showCharacter = false" />

    <!-- 机制面板 -->
    <MechanismPanel
      :visible="showMechanismPanel"
      :mechanismType="gameStore.activeMechanism"
      :context="gameStore.mechanismContext"
      :playerCharacter="gameStore.playerCharacter"
      :recentMessages="mechanismRecentMessages"
      :worldId="gameStore.worldId"
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

    <Transition name="mechanism-notice-fade">
      <button
        v-if="pendingMechanismNotice"
        class="mechanism-notice"
        type="button"
        @click="openMechanismFromNotice"
      >
        <span class="mechanism-notice-icon">⚡</span>
        <span class="mechanism-notice-copy">
          <strong>{{ pendingMechanismNotice.title }}</strong>
          <span>{{ pendingMechanismNotice.preview }}</span>
        </span>
        <span class="mechanism-notice-action">点击查看</span>
      </button>
    </Transition>

    <GmPersonaLauncher
      v-if="showExperienceWorkChrome"
      kicker="在场 GM"
      title="从这里继续推进"
      body="我先看当前世界、开场现场和最近对话，再给你一个更紧的推进切口。"
      caption="虚构集"
      captionHint="继续冒险"
      @open="openAdvisorFromAction"
    />

    <!-- 内联事件详情弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="inlineDetail" class="inline-detail-overlay" @click.self="closeInlineDetail">
          <Transition name="modal-scale" appear>
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
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <div v-if="showExperienceWorkChrome" class="game-image-gen-rail">
      <ImageGenRail
        storage-key="game_image_library_v1"
        side="right"
        :vertical-offset="62"
        :horizontal-offset="12"
        :mobile-bottom-offset="82"
        drawer-title="体验生图"
        selected-prompt-label="当前输入"
        :selected-text="gameStore.inputText || ''"
      />

      <AdvisorPanel
        :isOpen="advisorOpen"
        :messages="advisorMessages"
        :loading="advisorLoading"
        :quickQuestions="[
          { label: '分析当前节奏', question: '分析当前冒险的叙事节奏，指出快慢和转折点。', scope: 'chapter', taskType: 'advisor.review.chapter' },
          { label: '人物塑造建议', question: '分析当前出场人物的行为逻辑和性格表现，给出深化建议。', scope: 'chapter', taskType: 'advisor.review.chapter' },
          { label: '剧情发展方向', question: '基于当前剧情状态，给出1-2个合理的后续发展方向。', scope: 'thread', taskType: 'advisor.close.thread' },
          { label: '续写灵感', question: '给出一句轻量续写建议，保持当前叙事语气。', scope: 'continue', taskType: 'advisor.continue.light' }
        ]"
        :emptyText="'创作顾问可帮你分析当前冒险状态，提供叙事建议和剧情方向指引。'"
        @close="closeAdvisor"
        @ask="handleAskAdvisor"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import ImageGenRail from '../components/ImageGenRail.vue'
import GmPersonaLauncher from '../components/gm-persona/GmPersonaLauncher.vue'
import { useAdvisor } from '../composables/useAdvisor'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import GamePanel from '../components/GamePanel.vue'
import InputArea from '../components/InputArea.vue'
import StatusBar from '../components/StatusBar.vue'
import QuestLog from '../components/QuestLog.vue'
import GeographyPanel from '../components/geography/GeographyPanel.vue'
import Character from '../components/Character.vue'
import MechanismPanel from '../components/MechanismPanel.vue'
import MilestoneModal from '../components/MilestoneModal.vue'
import SessionPicker from '../components/SessionPicker.vue'
import { getTextItem, removeItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { ASSET_KINDS, addNarrativeAsset, getAssetKindLabel } from '../services/narrativeAssets'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { clearPlayableWorldEntryIntent } from '../services/playableWorldEntry'

const gameStore = useGameStore()
const worldStore = useWorldStore()
const router = useRouter()
const { advisorOpen, advisorMessages, advisorLoading, askAdvisor, openAdvisor: openAdvisorPanel, closeAdvisor } = useAdvisor()

const selectedWorldbookId = ref('')
const activeWorldbook = computed(() => worldStore.activeWorldbook || null)
const hasSelectedWorldbook = computed(() => Boolean(selectedWorldbookId.value && activeWorldbook.value))
const playableWorldTitle = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.name || '未命名世界'
})
const showExperienceWorkChrome = computed(() => hasUserActionMessages.value)
const hasUserActionMessages = computed(() => {
  return (gameStore.messages || []).some((message) => (message.role || message.type) === 'user')
})
const sidebarCollapsed = ref(false)
const showSessionPicker = ref(false)

onMounted(async () => {
  window.addEventListener('story-mechanism-ready', handleMechanismReady)

  await worldStore.loadWorldbooksIndex()
  gameStore.loadSessions()

  const activeSession = gameStore.sessions.find((session) => session.id === gameStore.currentSessionId) || null
  const latestStoredSession = !activeSession && Array.isArray(gameStore.sessions) && gameStore.sessions.length
    ? [...gameStore.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    : null
  let loadedExistingSession = false

  if (activeSession) {
    gameStore.loadSession(activeSession.id)
    selectedWorldbookId.value = activeSession.worldbookId || activeSession.worldId || ''
    if (selectedWorldbookId.value) {
      await worldStore.setActiveWorldbook(selectedWorldbookId.value)
    }
    loadedExistingSession = true
  } else if (latestStoredSession) {
    gameStore.loadSession(latestStoredSession.id)
    selectedWorldbookId.value = latestStoredSession.worldbookId || latestStoredSession.worldId || ''
    if (selectedWorldbookId.value) {
      await worldStore.setActiveWorldbook(selectedWorldbookId.value)
    }
    showSessionPicker.value = false
    loadedExistingSession = true
  } else {
    gameStore.resetRuntimeState()
    if (worldStore.worldbooksIndex.length) {
      const defaultWorldbook = await worldStore.ensureActiveWorldbook()
      selectedWorldbookId.value = defaultWorldbook?.id || worldStore.activeWorldbookId || ''
    } else {
      selectedWorldbookId.value = worldStore.activeWorldbookId || ''
    }
    showSessionPicker.value = false
  }

  if (loadedExistingSession && (!gameStore.isPlaying || !Array.isArray(gameStore.messages) || gameStore.messages.length === 0)) {
    await gameStore.initGame()
  }

  if (typeof gameStore.loadDialogueCharacters === 'function') {
    gameStore.loadDialogueCharacters()
  }
})

onUnmounted(() => {
  window.removeEventListener('story-mechanism-ready', handleMechanismReady)
  clearMechanismNotice()
})

watch(() => worldStore.activeWorldbookId, (nextId) => {
  const normalized = nextId || ''
  if (selectedWorldbookId.value !== normalized) {
    selectedWorldbookId.value = normalized
  }
})

function openWorldbookQuickImport() {
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

async function handleAskAdvisor(input) {
  const action = typeof input === 'string'
    ? { label: input, question: input, scope: 'chapter', taskType: 'advisor.review.chapter' }
    : input
  await askAdvisor({ ...action, mode: 'novel' }, collectGameContext)
}

function openAdvisorFromAction() {
  quickNoteOpen.value = false
  quickNoteImportOpen.value = false
  gameStore.setQuickNoteImportMode(false)
  openAdvisorPanel()
}

const showCharacter = ref(false)
const pendingMechanismNotice = ref(null)
let mechanismNoticeTimer = null

// 机制面板与里程碑事件
const showMechanismPanel = computed(() => !!gameStore.activeMechanism)
const showMilestoneModal = computed(() => !!gameStore.milestoneEvent)
const mechanismRecentMessages = computed(() => gameStore.messages.slice(-6))

const mechanismNoticeLabels = {
  combat: '战斗触发',
  trade: '交易触发',
  quest: '任务触发',
  dialogue: '对话触发'
}

function buildMechanismNotice(detail = {}) {
  const type = String(detail.type || '').trim()
  const previewSource = String(detail.preview || detail.dialogue || detail.context || detail.match || '').replace(/\s+/g, ' ').trim()
  const speaker = String(detail.speaker || detail.name || '').trim()
  const title = `${mechanismNoticeLabels[type] || '机制触发'}${speaker ? ` · ${speaker}` : ''}`

  return {
    ...detail,
    title,
    preview: previewSource ? previewSource.slice(0, 90) : '有新的叙事触发，点击查看'
  }
}

function clearMechanismNotice() {
  if (mechanismNoticeTimer) {
    clearTimeout(mechanismNoticeTimer)
    mechanismNoticeTimer = null
  }
  pendingMechanismNotice.value = null
}

function scheduleMechanismNoticeHide() {
  if (mechanismNoticeTimer) clearTimeout(mechanismNoticeTimer)
  mechanismNoticeTimer = setTimeout(() => {
    pendingMechanismNotice.value = null
    mechanismNoticeTimer = null
  }, 10000)
}

function handleMechanismReady(event) {
  const detail = event?.detail || null
  if (!detail?.type) return
  pendingMechanismNotice.value = buildMechanismNotice(detail)
  scheduleMechanismNoticeHide()
}

function handleMechanismClose() {
  gameStore.deactivateMechanism()
}

function openMechanismFromNotice() {
  if (!pendingMechanismNotice.value) return
  gameStore.activateMechanism(pendingMechanismNotice.value.type, pendingMechanismNotice.value)
  clearMechanismNotice()
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
    openWorldbookQuickImport()
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

const shouldLockPageScroll = computed(() => {
  return quickNoteOpen.value || advisorOpen.value || Boolean(inlineDetail.value)
})

useBodyScrollLock(shouldLockPageScroll)

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

async function handleSend(text, options = {}) {
  clearPlayableWorldEntryIntent()
  await gameStore.sendAction(text, options)
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

function toggleQuickNoteWorkspace() {
  const nextOpen = !quickNoteOpen.value
  if (nextOpen && advisorOpen.value) {
    closeAdvisor()
  }
  quickNoteOpen.value = nextOpen
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

watch(advisorOpen, (open) => {
  if (!open) return
  quickNoteOpen.value = false
  quickNoteImportOpen.value = false
  gameStore.setQuickNoteImportMode(false)
})

function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

</script>

<style scoped>
.game-page {
  position: relative;
  height: var(--app-viewport-height, 100vh);
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--accent-rose) 18%, transparent), transparent 24%),
    radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--accent-amber) 18%, transparent), transparent 22%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary)), color-mix(in srgb, var(--bg-primary) 98%, #050506 2%));
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}

.game-page::before,
.game-page::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.game-page::before {
  background:
    linear-gradient(124deg, transparent 0 54%, color-mix(in srgb, var(--accent) 8%, transparent) 54.4% 60%, transparent 60.4%),
    linear-gradient(146deg, transparent 0 78%, color-mix(in srgb, var(--accent-rose) 10%, transparent) 78.2% 84%, transparent 84.2%);
  opacity: 0.8;
}

.game-page::after {
  background:
    repeating-linear-gradient(
      90deg,
      transparent 0 78px,
      color-mix(in srgb, var(--border) 6%, transparent) 78px 79px
    ),
    linear-gradient(180deg, color-mix(in srgb, #000 10%, transparent), transparent 16%, transparent 84%, color-mix(in srgb, #000 18%, transparent));
  opacity: 0.48;
}

.game-layout {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  gap: 14px;
  padding: 14px 16px 16px;
  max-width: 1420px;
  margin: 0 auto;
  width: 100%;
  overflow: hidden;
}

.game-main-shell {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 18px 20px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  clip-path: polygon(0 18px, 24px 0, calc(100% - 44px) 0, 100% 42px, 100% 100%, 0 100%);
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--surface-panel) 96%, #040405 4%) 0%, color-mix(in srgb, var(--surface-raised) 88%, #000 12%) 100%);
  box-shadow: var(--shadow-floating);
  overflow: hidden;
}

.game-main-shell::before {
  content: '';
  position: absolute;
  inset: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 14%, transparent);
  clip-path: polygon(0 12px, 16px 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
  pointer-events: none;
}

.sidebar {
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 40px;
  overflow: visible;
}

.sidebar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  clip-path: polygon(0 14px, 18px 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%);
  background:
    linear-gradient(142deg, color-mix(in srgb, var(--surface-panel) 94%, #060607 6%), color-mix(in srgb, var(--surface-raised) 90%, transparent));
  box-shadow: var(--shadow-floating);
}

.sidebar-head-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.sidebar-head-copy span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sidebar-head-copy strong {
  font-size: 18px;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--text-primary);
}

.sidebar-toggle {
  width: 30px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  clip-path: polygon(0 8px, 10px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 10px) 100%, 0 100%);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  align-self: flex-end;
  transition: border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.sidebar-toggle:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  transform: translateY(-1px);
}

.sidebar-section {
  background: color-mix(in srgb, var(--surface-panel) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  clip-path: polygon(0 14px, 18px 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
  padding: 14px;
  box-shadow: var(--shadow-floating);
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

/* Pass 3: warm-gold multiply overlay — uses its own DOM element to avoid cascade collision with kao blade ::after above */

.quick-notes-rail {
  position: fixed;
  right: 12px;
  top: calc(var(--app-viewport-half-height, 50vh) - 62px);
  z-index: var(--z-floating-dock, 240);
  transform: translateX(34px) translateY(-50%);
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
  transform: translateX(0) translateY(-50%);
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

.mechanism-notice {
  position: fixed;
  left: 50%;
  bottom: calc(92px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: var(--z-mechanism-notice);
  width: min(560px, calc(100vw - 32px));
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 96%, #ffffff 4%);
  color: var(--text-primary);
  box-shadow: 0 12px 28px color-mix(in srgb, #000 18%, transparent);
  cursor: pointer;
  text-align: left;
}

.mechanism-notice:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  box-shadow: 0 16px 34px color-mix(in srgb, #000 22%, transparent);
}

.mechanism-notice-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-tertiary));
  color: var(--accent);
  font-size: 14px;
}

.mechanism-notice-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.mechanism-notice-copy strong {
  font-size: 13px;
  line-height: 1.3;
}

.mechanism-notice-copy span {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.mechanism-notice-action {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 12px;
  color: var(--accent);
  white-space: nowrap;
}

.mechanism-notice-fade-enter-active,
.mechanism-notice-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.mechanism-notice-fade-enter-from,
.mechanism-notice-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (max-width: 980px) {
  .game-layout {
    width: min(100%, calc(100% - 28px));
  }

  .game-layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    top: auto;
    max-height: none;
  }

  .game-main-shell,
  .sidebar {
    padding: 12px;
  }

  .quick-notes-rail {
    top: auto;
    right: 12px;
    bottom: calc(150px + env(safe-area-inset-bottom, 0px));
    transform: none;
    transition: none;
    flex-direction: column-reverse;
    align-items: flex-end;
  }

  .quick-notes-rail:hover,
  .quick-notes-rail:focus-within {
    transform: none;
  }

  .quick-notes-btn {
    width: 46px;
    height: 46px;
    border-radius: 999px;
  }

  .mechanism-notice {
    bottom: calc(86px + env(safe-area-inset-bottom, 0px));
    width: min(100vw - 20px, 100%);
  }

  .quick-note-workspace-overlay {
    padding: 10px;
  }

  .quick-note-workspace {
    width: min(100vw - 20px, 100%);
    height: calc(var(--app-viewport-height, 100vh) - 20px);
    padding: 14px;
  }

  .quick-note-workspace-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .game-layout {
    width: min(100%, calc(100% - 20px));
    margin-top: 14px;
  }

  .sidebar-head-copy strong {
    font-size: 20px;
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
  color: var(--accent-text);
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

/* Phase 1C archive-folio overrides */
.game-page {
  background:
    radial-gradient(circle at 14% 8%, color-mix(in srgb, var(--archive-gold) 18%, transparent), transparent 24%),
    radial-gradient(circle at 84% 12%, color-mix(in srgb, var(--archive-olive) 10%, transparent), transparent 18%),
    linear-gradient(146deg,
      color-mix(in srgb, var(--archive-paper-soft) 96%, var(--bg-secondary)) 0 66%,
      color-mix(in srgb, var(--archive-paper) 94%, var(--bg-primary)) 66% 100%);
  color: var(--archive-ink);
}

.game-page::before {
  background:
    linear-gradient(118deg, transparent 0 58%, color-mix(in srgb, var(--archive-gold) 8%, transparent) 58.2% 63%, transparent 63.2%),
    linear-gradient(144deg, transparent 0 82%, color-mix(in srgb, var(--archive-olive) 10%, transparent) 82.2% 86%, transparent 86.2%);
  opacity: 0.86;
}

.game-page::after {
  background:
    repeating-linear-gradient(
      90deg,
      transparent 0 88px,
      color-mix(in srgb, var(--border) 7%, transparent) 88px 89px
    ),
    linear-gradient(180deg, color-mix(in srgb, #fff 12%, transparent), transparent 14%, transparent 86%, color-mix(in srgb, #000 10%, transparent));
  opacity: 0.42;
}

.action-btn {
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, var(--border));
  border-radius: 0;
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 48%, calc(100% - 10px) 100%, 0 100%, 8px 48%);
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, var(--surface-raised));
  color: var(--archive-ink-soft);
  box-shadow: 0 10px 18px color-mix(in srgb, #000 8%, transparent);
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.action-btn:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 36%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised));
  color: var(--archive-ink);
}

.action-btn:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--archive-olive) 42%, var(--border));
}

.action-btn.primary {
  border-color: color-mix(in srgb, var(--archive-gold) 58%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 88%, #fff5db) 0 68%, color-mix(in srgb, var(--archive-gold) 92%, #ae7f2d) 68% 100%);
  color: var(--archive-ink);
}

.action-btn.primary:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 68%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 84%, #fff8e4) 0 66%, color-mix(in srgb, var(--archive-gold-soft) 96%, #bb8e36) 66% 100%);
  color: var(--archive-ink);
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.game-layout {
  width: min(1440px, calc(100% - 40px));
  gap: 18px;
  padding: 18px 0 22px;
}

.game-main-shell {
  padding: 18px 18px 20px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 14%, var(--border));
  clip-path: polygon(0 20px, 24px 0, calc(100% - 36px) 0, 100% 36px, 100% 100%, 0 100%);
  border-radius: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 94%, var(--bg-primary)) 100%);
  box-shadow:
    0 26px 40px color-mix(in srgb, #000 12%, transparent),
    14px 14px 0 color-mix(in srgb, var(--archive-olive-strong) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 26%, transparent);
}

.game-main-shell::before {
  inset: 12px;
  border-color: color-mix(in srgb, var(--archive-gold) 10%, transparent);
  clip-path: polygon(0 14px, 18px 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
  border-radius: 0;
}

.sidebar {
  width: 264px;
  padding: 18px 18px 20px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--archive-paper) 8%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-olive-strong) 94%, #0f201d), color-mix(in srgb, var(--archive-photo) 94%, #17302c));
  box-shadow:
    0 24px 34px color-mix(in srgb, #000 16%, transparent),
    14px 14px 0 color-mix(in srgb, #000 10%, transparent);
}

.sidebar-head {
  padding: 0 0 14px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-paper) 10%, transparent);
  clip-path: none;
  background: transparent;
  box-shadow: none;
}

.sidebar-head-copy span {
  color: color-mix(in srgb, var(--archive-gold-soft) 84%, var(--archive-paper));
}

.sidebar-head-copy strong {
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
}

.sidebar-toggle {
  border-color: color-mix(in srgb, var(--archive-paper) 16%, transparent);
  background: color-mix(in srgb, #fff 6%, transparent);
  color: color-mix(in srgb, var(--archive-paper-soft) 88%, #fff);
}

.sidebar-toggle:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 36%, transparent);
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  background: color-mix(in srgb, var(--archive-gold) 10%, transparent);
}

.sidebar-section {
  padding: 14px 0 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--archive-paper) 10%, transparent);
  clip-path: none;
  background: transparent;
  box-shadow: none;
}

.quick-notes-btn {
  border-color: color-mix(in srgb, var(--archive-gold) 28%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  color: var(--archive-ink);
}

.quick-notes-btn:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 34%, var(--border));
  color: var(--archive-olive-strong);
}

@media (max-width: 980px) {
  .game-layout {
    width: min(100%, calc(100% - 28px));
  }

  .sidebar {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .game-layout {
    width: min(100%, calc(100% - 20px));
  }
}

@media (max-width: 760px) {
  .action-btn {
    height: 28px;
    padding: 0 10px;
    font-size: 11px;
  }
}

/* Experience redo: folio spread, fewer frames */

.game-layout {
  width: min(1440px, calc(100% - 40px));
  gap: 18px;
  padding: 18px 0 22px;
}

.game-main-shell {
  padding: 18px 18px 20px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 14%, var(--border));
  clip-path: polygon(0 18px, 22px 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%);
  border-radius: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 94%, var(--bg-primary)) 100%);
  box-shadow:
    0 24px 36px color-mix(in srgb, #000 12%, transparent),
    14px 14px 0 color-mix(in srgb, var(--archive-olive-strong) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 26%, transparent);
}

.game-main-shell::before {
  inset: 12px;
  border-color: color-mix(in srgb, var(--archive-gold) 10%, transparent);
  clip-path: polygon(0 12px, 16px 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%);
  border-radius: 0;
}

.sidebar {
  width: 252px;
  padding: 18px 16px 18px;
  border: none;
  border-radius: 0;
  clip-path: polygon(0 16px, 18px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 18px) 100%, 0 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 6%, transparent), transparent 16%),
    linear-gradient(180deg, color-mix(in srgb, var(--archive-olive-strong) 95%, #0f201d), color-mix(in srgb, var(--archive-photo) 94%, #17302c));
  box-shadow:
    0 24px 34px color-mix(in srgb, #000 16%, transparent),
    12px 12px 0 color-mix(in srgb, #000 10%, transparent);
}

.sidebar-head {
  padding: 0 0 12px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-paper) 10%, transparent);
  clip-path: none;
  background: transparent;
  box-shadow: none;
}

.sidebar-head-copy span {
  color: color-mix(in srgb, var(--archive-gold-soft) 84%, var(--archive-paper));
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.sidebar-head-copy strong {
  max-width: none;
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 18px;
  line-height: 1.1;
}

.sidebar-toggle {
  border-color: color-mix(in srgb, var(--archive-paper) 16%, transparent);
  background: color-mix(in srgb, #fff 6%, transparent);
  color: color-mix(in srgb, var(--archive-paper-soft) 88%, #fff);
}

.sidebar-toggle:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 36%, transparent);
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  background: color-mix(in srgb, var(--archive-gold) 10%, transparent);
}

.sidebar-section {
  padding: 14px 0 0;
  border: none;
  border-top: 1px solid color-mix(in srgb, var(--archive-paper) 10%, transparent);
  clip-path: none;
  background: transparent;
  box-shadow: none;
}

.quick-notes-btn {
  border-color: color-mix(in srgb, var(--archive-gold) 28%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  color: var(--archive-ink);
}

.quick-notes-btn:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 34%, var(--border));
  color: var(--archive-olive-strong);
}

@media (max-width: 980px) {

  .mechanism-notice,
  .quick-notes-rail,
  .game-image-gen-rail {
    bottom: calc(150px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
