<template>
  <div class="input-area">
    <div
      v-if="!hasApiKey"
      class="api-key-hint"
      role="alert"
      aria-label="未配置 API Key"
    >
      <span class="api-key-hint__text">未配置 API Key · AI 生成不可用</span>
      <button type="button" class="api-key-hint__link" @click="openApiSettings">点此配置</button>
    </div>
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

      <!-- P1-5：本回合回执摘要（低敏：命中条目数 / 工具数 / 导演注摘要） -->
      <div v-if="gameStore.lastTurnReceipt" class="receipt-summary">
        <span class="receipt-item">命中世界书 {{ gameStore.lastTurnReceipt.worldbookEntryCount || 0 }} 条</span>
        <span class="receipt-item">工具 {{ gameStore.lastTurnReceipt.toolResults?.total || 0 }} 次</span>
        <span v-if="gameStore.lastTurnReceipt.directorNote" class="receipt-item">导演注 {{ gameStore.lastTurnReceipt.directorNote.chars }} 字</span>
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
          <button :class="['tab', { active: detailTab === 'worldbook' }]" @click="detailTab = 'worldbook'">世界书</button>
          <button :class="['tab', { active: detailTab === 'history' }]" @click="detailTab = 'history'">历史</button>
          <button :class="['tab', { active: detailTab === 'system' }]" @click="detailTab = 'system'">系统</button>
        </div>
        <div class="modal-body">
          <div v-if="detailTab === 'context'" class="content-preview">
            <div class="text-content">{{ contextMsg ? contextMsg.content : '无上下文' }}</div>
          </div>
          <div v-if="detailTab === 'worldbook'" class="content-preview">
            <div v-if="worldbookContext" class="worldbook-preview">
              <div class="worldbook-summary">
                <div class="worldbook-line"><span>世界书</span><strong>{{ worldbookContextName }}</strong></div>
                <div class="worldbook-line"><span>命中条目</span><strong>{{ worldbookContext.matchedEntries.length }}</strong></div>
                <div class="worldbook-line"><span>预算</span><strong>{{ worldbookContext.budgetReport.usedChars }} / {{ worldbookContext.budgetReport.maxChars }}</strong></div>
                <div class="worldbook-line"><span>截断</span><strong>{{ worldbookContext.budgetReport.truncatedEntries }}</strong></div>
              </div>
              <div v-if="worldbookContext.matchedEntries.length > 0" class="worldbook-entry-list">
                <div v-for="entry in worldbookContext.matchedEntries" :key="entry.id" class="worldbook-entry">
                  <div class="worldbook-entry-head">
                    <span class="entry-name">{{ entry.name }}</span>
                    <span class="entry-type">{{ entry.type }} · {{ entry.matchReason === 'constant' ? '常驻' : '命中' }}</span>
                  </div>
                  <div v-if="entry.matchedKeysLabel" class="entry-hits">
                    <span class="entry-hits-label">命中依据</span>
                    <span class="entry-hits-value">{{ entry.matchedKeysLabel }}</span>
                  </div>
                  <div class="entry-content">{{ entry.content }}</div>
                </div>
              </div>
              <div v-else class="empty">当前没有命中的世界书条目</div>
              <div v-if="worldbookContext.warnings.length > 0" class="worldbook-warnings">
                <div v-for="warning in worldbookWarnings" :key="warning.code" class="warning-item">
                  <span class="warning-label">{{ warning.label }}</span>
                </div>
              </div>
            </div>
            <div v-else class="empty">当前没有可预览的世界书注入结果</div>
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
        :key="action.command"
        class="quick-btn"
        @click="handleQuickAction(action.command)"
        :disabled="gameStore.isLoading"
        :title="action.title || ''"
      >
        <!-- UI-E18-FIX3: emoji icon was rendered inline next to the
             label. In theme-legacy (steel-blue dossier, COMPETITION
             DEFAULT), the colorful emoji (▶ 🌿 💬 💭) clashed with the
             archive-folio aesthetic. Kao theme keeps the emoji but
             mutes them via .theme-kao .quick-btn rules. Default mode
             hides the icon span entirely and renders the bare label —
             the action still reads, the row reads as a tight tool
             strip instead of a chat sticker bar. -->
        <span class="quick-btn__icon" aria-hidden="true">{{ action.icon }}</span>
        <span class="quick-btn__label">{{ action.label }}</span>
      </button>
      <button
        :class="['quick-btn', 'dialogue-btn', { active: gameStore.dialogueMode || gameStore.dialogueCharacter }]"
        @click="handleDialogueToggle"
      >
        <span class="quick-btn__icon" aria-hidden="true">💬</span>
        <span class="quick-btn__label">对话模式</span>
      </button>
      <button
        v-if="autoAdvanceAvailable"
        type="button"
        :class="['quick-btn', 'auto-advance-btn', { active: autoAdvance }]"
        :aria-pressed="autoAdvance"
        :title="autoAdvance ? '正在半自动推进；再次点击停止' : '立即开始半自动推进，可随时停止'"
        @click="emit('toggle-auto-advance')"
      >
        <Pause v-if="autoAdvance" :size="13" stroke-width="1.8" aria-hidden="true" />
        <Play v-else :size="13" stroke-width="1.8" aria-hidden="true" />
        <span class="quick-btn__label">{{ autoAdvance ? '停止自动' : '半自动' }}</span>
        <span v-if="autoAdvancePending" class="sr-only">将在本段完成后继续推进</span>
      </button>
    </div>

    <!-- 角色选择面板 -->
    <div v-if="showDialoguePanel" class="dialogue-panel">
      <div class="dialogue-header">
        <span>选择对话角色</span>
        <button class="close-btn" @click="showDialoguePanel = false">×</button>
      </div>

      <!-- 当前选中 -->
      <div v-if="gameStore.dialogueCharacter" class="selected-char">
        <div class="char-avatar">
          {{ gameStore.dialogueCharacter.name?.[0] || '?' }}
        </div>
        <div class="char-info">
          <div class="char-name">{{ gameStore.dialogueCharacter.name }}</div>
          <div class="char-desc">{{ gameStore.dialogueCharacter.description || '暂无描述' }}</div>
        </div>
        <button class="clear-btn" @click="clearDialogueCharacter(); showDialoguePanel = false">清除</button>
      </div>

      <!-- 已保存角色列表 -->
      <div class="char-list" v-if="gameStore.dialogueCharacters.length > 0">
        <div
          v-for="char in gameStore.dialogueCharacters"
          :key="char.id"
          :class="['char-item', { active: gameStore.dialogueCharacter?.id === char.id }]"
          @click="selectDialogueCharacter(char)"
        >
          <div class="char-avatar small">{{ char.name?.[0] || '?' }}</div>
          <div class="char-info">
            <div class="char-name">{{ char.name }}</div>
            <div class="char-desc">{{ char.description?.slice(0, 20) || '暂无描述' }}</div>
          </div>
          <button class="delete-btn" @click.stop="deleteDialogueCharacter(char.id)">×</button>
        </div>
      </div>
      <div v-else class="empty-char">暂无已保存的角色</div>

      <!-- 新建角色 -->
      <div class="add-char-section">
        <div class="section-label">新建角色</div>
        <div class="char-form">
          <input v-model="newCharName" class="char-input" placeholder="角色名称" />
          <input v-model="newCharDesc" class="char-input" placeholder="角色描述（简短）" />
          <button class="add-char-btn" @click="addNewDialogueCharacter" :disabled="!newCharName.trim()">添加</button>
        </div>
      </div>
    </div>
    <!-- R2：本轮导演注（仅下一轮生效，注入 kernel，不进聊天列表） -->
    <div v-if="showDirectorNote" class="director-note-row">
      <input
        v-model="directorNote"
        type="text"
        class="input director-note-input"
        placeholder="本轮导演注：仅本次回复生效（如「让气氛更紧张」）"
        @keyup.enter="handleSend"
        @keydown.meta.enter.prevent="handleSend"
        @keydown.ctrl.enter.prevent="handleSend"
        @keydown.escape="directorNote = ''"
      />
    </div>
    <!-- P1-5：/ 命令建议菜单 -->
    <div v-if="showCommandMenu" class="command-menu">
      <button
        v-for="cmd in commandSuggestions"
        :key="cmd.command"
        type="button"
        class="command-menu-item"
        @click="runCommand(cmd)"
      >
        <code>/{{ cmd.command }}</code>
        <span>{{ cmd.label }}</span>
      </button>
    </div>
    <div v-if="commandError" class="command-error">{{ commandError }}</div>
    <div class="input-row">
      <input
        v-model="inputText"
        type="text"
        class="input"
        placeholder="输入你的行动... (Cmd+Enter 发送 · Esc 清空)"
        @keyup.enter="handleSend"
        @keydown.meta.enter.prevent="handleSend"
        @keydown.ctrl.enter.prevent="handleSend"
        @keydown.escape="inputText = ''"
        @input="handleInput"
        :disabled="gameStore.isLoading"
      />
      <button
        v-if="gameStore.isLoading"
        class="send-btn stop-btn"
        type="button"
        title="停止生成"
        @click="gameStore.executeExperienceAction({ type: 'stop', source: 'stop-btn' })"
      >
        <span>停止</span>
      </button>
      <button
        v-else
        class="send-btn"
        @click="handleSend"
        :disabled="!inputText.trim()"
      >
        <span>发送</span>
      </button>

      <button class="info-btn" @click="showPromptInfo = !showPromptInfo" title="提示词详情">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 0h1v9h-1V0zm0 10h1v4h-1v-4zM4 4h1v6H4V4zm6 2h1v4h-1V6z"/>
        </svg>
      </button>
      <button class="info-btn" :class="{ 'info-btn--active': showDirectorNote }" @click="showDirectorNote = !showDirectorNote" title="本轮导演注">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3l9 5-9 5-9-5 9-5zm0 8.5L19 12v5l-7 4-7-4v-5l7 .5z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Pause, Play } from 'lucide-vue-next'
import { useGameStore } from '../stores/gameStore'
import { useSettingsPopup } from '../composables/useSettingsPopup'
import { buildContextMessage } from '../services/api'
import { describeWorldbookWarning } from '../services/worldbookContextBuilder'
import { estimateTokens } from '../composables/useTokenEstimate'
import { buildNarrativeFormatInstructions } from '../services/narrativePresentation'

const emit = defineEmits(['send', 'manual-input', 'toggle-auto-advance'])
const props = defineProps({
  autoAdvance: { type: Boolean, default: false },
  autoAdvanceAvailable: { type: Boolean, default: false },
  autoAdvancePending: { type: Boolean, default: false }
})
const gameStore = useGameStore()
const settingsPopup = useSettingsPopup()
const hasApiKey = computed(() => Boolean(String(gameStore.apiSettings?.apiKey || '').trim()))
function openApiSettings() {
  settingsPopup.open('ai')
}
function refreshApiSettings() {
  gameStore.loadApiSettings()
}
function handleApiSettingsUpdated() {
  refreshApiSettings()
}
function handleStorageUpdated(event) {
  if (event.key === 'apiSettings') refreshApiSettings()
}
const inputText = ref('')
const showPromptInfo = ref(false)
// R2：本轮导演注（仅下一轮生效）
const directorNote = ref('')
const showDirectorNote = ref(false)
// P1-2：/ 命令执行错误提示
const commandError = ref('')
const showDetail = ref(false)
const detailTab = ref('context')
const showDialoguePanel = ref(false)
const newCharName = ref('')
const newCharDesc = ref('')
// P1-5：/ 命令建议菜单（映射到 executeExperienceAction）
const commandSuggestions = computed(() => {
  const text = inputText.value.trim()
  if (!text.startsWith('/')) return []
  const query = text.slice(1).toLowerCase()
  const commands = [
    { command: 'stop', label: '停止生成', action: { type: 'stop' } },
    { command: 'continue', label: '继续上一回复', action: { type: 'continue' } },
    { command: 'advance', label: '推进一拍', action: { type: 'advance' } },
    { command: 'compress', label: '压缩上下文', action: { type: 'compress' } },
    { command: 'export', label: '导出会话', action: { type: 'export' } },
    { command: 'branch', label: '从此处建立分支', action: { type: 'branch', payload: {} } }
  ]
  return commands.filter((cmd) => cmd.command.includes(query) || cmd.label.includes(query))
})
const showCommandMenu = computed(() => commandSuggestions.value.length > 0 && inputText.value.trim().startsWith('/'))

const systemPromptContent = `【身份】你是 Pinax 的中文小说叙述者，负责承接创作者的输入，写出下一段正在发生的正文。

【行文原则】
- 从上一句造成的动作、声音、位置变化或直接回应继续，不复述输入
- 一个回合包含承接→反应→发展→自然落点，按语义组织段落
- 用停顿、措辞、动作和身体反应呈现情绪，不替读者总结
- 台词回应眼前的人和事，不借角色之口朗读设定

【回复格式要求】
- 段落按自然节奏组织，不要求等长
- 只输出正文和叙事 marker，不输出分析或创作说明

${buildNarrativeFormatInstructions()}`

const quickActions = [
  { label: '继续', icon: '▶', command: 'continue', title: '继续上一段正文（延长上一条回复，不新增回合）' },
  { label: '场景', icon: '🌿', command: 'scene' },
  { label: '对话', icon: '💬', command: 'dialogue' },
  { label: '心理', icon: '💭', command: 'inner' }
]

const quickActionPrompts = {
  continue: '沿着上一段最后一个动作或台词继续，推进一个完整的场景拍，不复述上一段。',
  scene: '停留在当前地点，选取一个会影响人物行动的环境细节展开，不罗列景物。',
  dialogue: '让当前在场角色回应上一句或眼前动作；台词服务于各自目的，不用台词讲解设定。',
  inner: '从一个身体反应或犹豫切入，写当前人物能意识到的念头，不总结情绪。'
}

onMounted(() => {
  refreshApiSettings()
  window.addEventListener('pinax:api-settings-updated', handleApiSettingsUpdated)
  window.addEventListener('storage', handleStorageUpdated)
  // P1-4：失败保留的导演注恢复显示（重试后可见）
  if (gameStore.pendingDirectorNote) {
    directorNote.value = gameStore.pendingDirectorNote
    showDirectorNote.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('pinax:api-settings-updated', handleApiSettingsUpdated)
  window.removeEventListener('storage', handleStorageUpdated)
})

function handleSend() {
  const trimmed = inputText.value.trim()
  // P1-5：/ 命令 —— 精确匹配命令菜单项时走 dispatcher，不发送普通文本
  if (trimmed.startsWith('/')) {
    const match = commandSuggestions.value.find((cmd) => `/${cmd.command}` === trimmed)
    if (match) {
      runCommand(match)
      return
    }
  }
  const note = directorNote.value.trim()
  if (trimmed) {
    // P1-4：导演注同步写入 store.pendingDirectorNote —— 失败时保留供重试恢复
    if (note) gameStore.pendingDirectorNote = note
    emit('send', trimmed, { source: 'manual-input', directorNote: note || undefined })
    inputText.value = ''
    // R2：导演注仅下一轮生效，提交后清空 UI（失败时 store.pendingDirectorNote 保留）
    directorNote.value = ''
    showDirectorNote.value = false
  }
}

// P1-5：执行 / 命令 —— 走统一 dispatcher，返回 action receipt
async function runCommand(match) {
  const result = await gameStore.executeExperienceAction(match.action)
  if (result?.ok) {
    inputText.value = ''
    commandError.value = ''
    if (match.action.type === 'export' && result.result) {
      // 导出结果在 console 可查看（最小实现，不新增下载 UI）
      console.info('[export-session]', JSON.stringify(result.result, null, 2))
    }
  } else {
    // 命令失败保留输入，显示错误原因
    commandError.value = `/${match.command} 执行失败：${result?.error || '未知错误'}`
    inputText.value = `/${match.command}`
  }
}

function handleQuickAction(command) {
  // C1.4：'continue' 走 dispatcher（extend intent，不新增 user turn）；
  // 其余快捷（scene/dialogue/inner）保持隐藏 sendAction，但标记 advance（半自动推进）。
  if (command === 'continue') {
    gameStore.executeExperienceAction({ type: 'continue', source: 'quick-action' })
    return
  }
  const prompt = quickActionPrompts[command] || command
  emit('send', prompt, { hidden: true, source: 'quick-action', intent: 'advance' })
}

function handleInput() {
  updatePromptInfo()
  if (inputText.value.trim()) emit('manual-input')
}

async function handleCompress() {
  // P1-5：压缩走统一 dispatcher
  const actionResult = await gameStore.executeExperienceAction({ type: 'compress', source: 'compress-btn' })
  const result = actionResult.ok ? { compressed: true } : { compressed: false }
  if (result.compressed) {
    gameStore.messages.push({
      role: 'system',
      content: '【压缩完成】上下文已压缩完成',
      timestamp: Date.now()
    })
  } else {
    gameStore.messages.push({
      role: 'system',
      content: `【压缩失败】${result.reason}`,
      timestamp: Date.now()
    })
  }
}

function toggleDialoguePanel() {
  showDialoguePanel.value = !showDialoguePanel.value
  if (showDialoguePanel.value) {
    gameStore.loadDialogueCharacters()
  }
}

function handleDialogueToggle() {
  // 已有角色：直接退出对话模式
  if (gameStore.dialogueCharacter) {
    gameStore.dialogueCharacter = null
    showDialoguePanel.value = false
    return
  }
  // 无角色：打开选择面板
  showDialoguePanel.value = true
  gameStore.loadDialogueCharacters()
}

function selectDialogueCharacter(char) {
  gameStore.selectDialogueCharacter(char)
  showDialoguePanel.value = false
}

function clearDialogueCharacter() {
  gameStore.clearDialogueCharacter()
}

function addNewDialogueCharacter() {
  if (!newCharName.value.trim()) return
  const char = {
    id: 'char_' + Date.now(),
    name: newCharName.value.trim(),
    description: newCharDesc.value.trim(),
    gender: '',
    age: '',
    traits: []
  }
  gameStore.saveDialogueCharacter(char)
  newCharName.value = ''
  newCharDesc.value = ''
}

function deleteDialogueCharacter(id) {
  gameStore.deleteDialogueCharacter(id)
}

const contextMsg = computed(() => buildContextMessage(gameStore.dialogueCharacter, {
  contextDetail: {
    character: gameStore.writingCharacter,
    time: gameStore.writingTime,
    location: gameStore.worldMapState,
    scene: null,
    activities: gameStore.activities
  }
}))
const worldbookContext = computed(() => gameStore.lastWorldbookContext)
const worldbookContextName = computed(() => {
  return worldbookContext.value?.messages?.[0]?.content?.match(/【世界书：([^】]+)】/)?.[1]
    || '未命名世界书'
})
const worldbookWarnings = computed(() => {
  return (worldbookContext.value?.warnings || []).map((code) => ({
    code,
    label: describeWorldbookWarning(code)
  }))
})
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

// 上下文用量圆弧
const contextArc = computed(() => {
  const percent = Math.min((totalTokens.value / 8000) * 100, 100) // 假设上限 8000 tokens
  const angle = (percent / 100) * 360
  const rad = (angle - 90) * (Math.PI / 180)
  const x = 7 + 5 * Math.cos(rad)
  const y = 7 + 5 * Math.sin(rad)
  const large = angle > 180 ? 1 : 0
  if (percent === 0) return 'M7 2 A5 5 0 0 1 7 12'
  if (percent >= 100) return 'M7 2 A5 5 0 1 1 7 12 A5 5 0 1 1 7 2'
  return `M7 2 A5 5 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`
})

const contextColor = computed(() => {
  const percent = (totalTokens.value / 8000) * 100
  if (percent < 50) return 'var(--success, #34d399)'
  if (percent < 80) return 'var(--warning, #fbbf24)'
  return 'var(--danger, #f87171)'
})

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
.api-key-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
  border-radius: 4px;
}

.api-key-hint__link {
  color: var(--accent);
  text-decoration: none;
  font-style: normal;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}

.api-key-hint__link:hover {
  text-decoration: underline;
}

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
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.quick-btn:first-child { border-radius: 6px 0 0 6px; }
.quick-btn:last-child { border-right: none; border-radius: 0 6px 6px 0; }
.quick-btn:only-child { border-radius: 6px; border-right: none; }
.quick-btn:hover { background: var(--bg-hover); }
.quick-btn:active { background: var(--accent-light); }

.auto-advance-btn {
  margin-left: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.auto-advance-btn.active {
  border-color: color-mix(in srgb, var(--accent) 56%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-tertiary));
  color: var(--text-primary);
}

/* UI-E18-FIX3: hide emoji icon in default (steel-blue dossier) theme
   — the colorful emoji (▶ 🌿 💬 💭) read as chat-sticker decoration,
   not as tool-strip glyphs, and clash with the archive-folio palette.
   Kao theme keeps the emoji (already muted via .theme-kao .quick-btn
   rules below — opacity 0.6 + hover reveal). The split between
   quick-btn__icon (visual) and quick-btn__label (semantic) keeps the
   text accessible to assistive tech even when the icon is hidden. */
.theme-legacy .quick-btn__icon {
  display: none;
}

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

.worldbook-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.worldbook-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.worldbook-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}

.worldbook-line span {
  color: var(--text-muted);
}

.worldbook-line strong {
  color: var(--text-primary);
  font-weight: 600;
}

.worldbook-entry-list,
.worldbook-warnings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.worldbook-entry,
.warning-item {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.worldbook-entry-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.entry-name {
  color: var(--text-primary);
  font-weight: 600;
}

.entry-type {
  color: var(--accent);
}

.entry-hits {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1.5;
}

.entry-hits-label {
  color: var(--text-muted);
  white-space: nowrap;
}

.entry-hits-value {
  color: var(--accent);
  word-break: break-word;
}

.entry-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.warning-item {
  color: var(--warning, #fbbf24);
  background: color-mix(in srgb, var(--warning, #fbbf24) 10%, var(--bg-secondary));
}

.warning-label {
  color: inherit;
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

/* 对话模式按钮 */
.quick-btn.dialogue-btn {
  border-right: 1px solid var(--border);
}
.quick-btn.dialogue-btn:last-child { border-right: none; border-radius: 0 6px 6px 0; }
.quick-btn.dialogue-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* 角色选择面板 */
.dialogue-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-top: 0;
}

.dialogue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.dialogue-header .close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.dialogue-header .close-btn:hover { color: var(--text-primary); }

.selected-char {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--accent-light);
  border-radius: 8px;
  margin-bottom: 12px;
}

.selected-char .char-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.selected-char .char-info { flex: 1; min-width: 0; }

.selected-char .char-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.selected-char .char-desc {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clear-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.clear-btn:hover { border-color: var(--danger); color: var(--danger); }

.char-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.char-item:hover { background: var(--bg-hover); }
.char-item.active { background: var(--accent-light); border: 1px solid var(--accent); }

.char-item .char-avatar.small {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.char-item.active .char-avatar.small { background: var(--accent); color: #fff; border-color: var(--accent); }

.char-item .char-info { flex: 1; min-width: 0; }
.char-item .char-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.char-item .char-desc { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.char-item .delete-btn {
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.char-item:hover .delete-btn { opacity: 1; }
.char-item .delete-btn:hover { background: rgba(239,68,68,0.15); color: var(--danger); }

.empty-char {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 16px;
}

.add-char-section {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.char-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  transition: border-color 0.15s;
}
.char-input:focus { outline: none; border-color: var(--accent); }
.char-input::placeholder { color: var(--text-muted); }

.add-char-btn {
  width: 100%;
  padding: 8px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.add-char-btn:hover:not(:disabled) { background: var(--accent-hover); }
.add-char-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* E16-NOVEL: kao input area as a footnote, not a chat row.
   Per 微信阅读 / 古龙 online: the player input is a margin
   annotation, not a message. Width matches the prose column
   (720px), centered. No visible send button chrome — just a
   thin dotted baseline + subtle "记" suffix that types when
   the input has text. The moment input looks like a chat
   input, the prose column above stops feeling like a chapter. */
.theme-kao .input-area {
  background: transparent;
  border: none;
  border-top: 1px dotted color-mix(in srgb, var(--archive-gold) 18%, transparent);
  border-radius: 0;
  padding: 14px 36px 18px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.theme-kao .input-row {
  gap: 0;
  align-items: baseline;
}

.theme-kao .input {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--archive-ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.75;
  padding: 4px 0;
  text-indent: 0;
}

.theme-kao .input:focus {
  outline: none;
}

.theme-kao .input::placeholder {
  color: color-mix(in srgb, var(--archive-ink) 44%, transparent);
  font-style: italic;
}

/* Send button — minimal text suffix, not a button. Disabled state
   hides it so the prose footnote rhythm stays quiet. */
.theme-kao .send-btn {
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--archive-olive-strong) 72%, transparent);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.16em;
  padding: 4px 8px;
  margin-left: 6px;
  white-space: nowrap;
  cursor: pointer;
}

.theme-kao .send-btn:hover:not(:disabled) {
  color: var(--archive-olive-strong);
}

.theme-kao .send-btn:disabled {
  opacity: 0;
  pointer-events: none;
}

.theme-kao .quick-actions {
  gap: 0;
  margin-bottom: 4px;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.theme-kao .quick-actions:hover {
  opacity: 1;
}

.theme-kao .quick-btn {
  background: transparent;
  border: none;
  border-right: 1px dotted color-mix(in srgb, var(--archive-ink) 24%, transparent);
  border-radius: 0;
  color: color-mix(in srgb, var(--archive-ink) 56%, transparent);
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 4px 10px;
}

.theme-kao .quick-btn:first-child { border-radius: 0; }
.theme-kao .quick-btn:last-child { border-radius: 0; }
.theme-kao .quick-btn:only-child { border-radius: 0; }
.theme-kao .quick-btn:hover {
  background: color-mix(in srgb, var(--archive-paper-strong) 50%, var(--archive-paper));
  color: var(--archive-olive-strong);
  border-color: var(--archive-gold);
}
.theme-kao .quick-btn:active {
  background: color-mix(in srgb, var(--archive-gold) 12%, var(--archive-paper));
}

.theme-kao .info-btn {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 24%, transparent);
  border-radius: 0;
  color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
  width: 28px;
  height: 28px;
  margin-left: 8px;
}

.theme-kao .info-btn:hover {
  color: var(--archive-gold);
  border-color: var(--archive-gold);
}

@media (max-width: 640px) {
  .theme-kao .input-area {
    padding: 8px 10px 10px;
  }
  .theme-kao .send-btn {
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>
