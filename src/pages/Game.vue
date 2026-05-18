<template>
  <div class="game-page">
    <!-- 标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">体验</span>
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
        <button class="action-btn" @click="showCharacter = true">角色</button>
        <button class="action-btn" @click="showSettings = true">设置</button>
      </div>
    </header>

    <div class="game-layout">
      <aside class="sidebar">
        <div class="sidebar-section">
          <ContextSelector />
        </div>
        <div class="sidebar-section">
          <StatusBar />
        </div>
        <div class="sidebar-section">
          <WorldMap />
        </div>
        <div class="sidebar-section">
          <Inventory />
        </div>
        <div class="sidebar-section">
          <QuestLog />
        </div>
      </aside>

      <div class="game-main">
        <GamePanel />
        <InputArea @send="handleSend" />
      </div>
    </div>

    <aside class="quick-notes-rail" aria-label="快捷入口">
      <div class="quick-notes-drawer" v-if="quickNoteOpen" @click.stop>
        <div class="quick-note-row">
          <textarea
            ref="quickNoteInputRef"
            v-model="quickNoteDraft"
            class="quick-note-input"
            placeholder="随手记一段..."
            @input="handleQuickNoteInput"
          ></textarea>
          <div class="quick-note-actions">
            <button class="quick-note-icon-btn quick-note-save" type="button" @click="saveQuickNote" title="保存到笔记" aria-label="保存到笔记">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7.5 12.2l2.5 2.5 6-6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="toggleQuickNoteImport" title="导入" aria-label="导入">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 6.5v7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                <path d="M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToNotes" title="去笔记" aria-label="去笔记">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 5.5h8a1 1 0 011 1v11a1 1 0 01-1 1H8a1 1 0 01-1-1v-11a1 1 0 011-1z" stroke="currentColor" stroke-width="1.25"/>
                <path d="M10 9.5h4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToWriting" title="去小说" aria-label="去小说">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6.5 7h4.8c1.2 0 2.2.9 2.2 2v8H9c-1 0-1.9.4-2.5 1V7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                <path d="M17.5 7h-4.8c-1.2 0-2.2.9-2.2 2v8H15c1 0 1.9.4 2.5 1V7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div v-if="quickNoteImportOpen" class="quick-note-import-panel">
          <div class="quick-note-import-toolbar">
            <span class="quick-note-import-title">导入对话段</span>
            <button class="quick-note-mini-btn primary" type="button" @click="importSelectedDialogueSegments">导入</button>
            <button class="quick-note-mini-btn" type="button" @click="gameStore.clearQuickNoteMessageSelection">清空</button>
          </div>
          <div class="quick-note-import-body">
            <div class="quick-note-import-left">
              <div class="quick-note-import-empty">请直接在左侧对话区域勾选要导入的段落。</div>
            </div>
            <aside class="quick-note-import-side">
              <div class="quick-note-stat"><span>总段数</span><strong>{{ dialogueImportStats.totalCount }}</strong></div>
              <div class="quick-note-stat"><span>已选</span><strong>{{ dialogueImportStats.selectedCount }}</strong></div>
              <div class="quick-note-stat"><span>总字数</span><strong>{{ dialogueImportStats.totalWords }}</strong></div>
              <div class="quick-note-stat"><span>已选字</span><strong>{{ dialogueImportStats.selectedWords }}</strong></div>
            </aside>
          </div>
        </div>
        <div v-if="quickNoteStatus" class="quick-note-tip">{{ quickNoteStatus }}</div>
      </div>
      <button class="quick-notes-btn" type="button" @click.stop="quickNoteOpen = !quickNoteOpen" title="打开速记">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 18.5l2.9-.7 8.1-8.1-2.2-2.2-8.1 8.1-.7 2.9z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13.2 8.8l2.2 2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </aside>

    <Character v-if="showCharacter" @close="showCharacter = false" />
    <Settings v-if="showSettings" @close="showSettings = false" />

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
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import ImageGenRail from '../components/ImageGenRail.vue'
import { useTheme } from '../composables/useTheme'
import GamePanel from '../components/GamePanel.vue'
import InputArea from '../components/InputArea.vue'
import StatusBar from '../components/StatusBar.vue'
import ContextSelector from '../components/ContextSelector.vue'
import Inventory from '../components/Inventory.vue'
import QuestLog from '../components/QuestLog.vue'
import WorldMap from '../components/WorldMap.vue'
import Settings from '../components/Settings.vue'
import Character from '../components/Character.vue'
import { getItem, getTextItem, removeItem, setItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'

const router = useRouter()
const gameStore = useGameStore()
const { isDark, toggleTheme } = useTheme()
const showCharacter = ref(false)
const showSettings = ref(false)
const QUICK_NOTE_DRAFT_KEY = STORAGE_KEYS.QUICK_NOTE_DRAFT
const QUICK_NOTE_STORE_KEY = STORAGE_KEYS.WRITING_NOTES
const quickNoteOpen = ref(false)
const quickNoteDraft = ref(loadQuickNoteDraft())
const quickNoteStatus = ref('')
const quickNoteInputRef = ref(null)
const quickNoteImportOpen = ref(false)

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

function goBack() {
  router.push('/fit')
}

function handleSend(text) {
  gameStore.sendAction(text)
}

function loadQuickNoteDraft() {
  return getTextItem(QUICK_NOTE_DRAFT_KEY)
}

function persistQuickNoteDraft() {
  setTextItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
}

function resizeQuickNoteInput(el = quickNoteInputRef.value) {
  if (!el) return
  const minHeight = 30
  const maxHeight = 104
  el.style.height = `${minHeight}px`
  const nextHeight = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${Math.max(minHeight, nextHeight)}px`
  el.style.borderRadius = nextHeight > 44 ? '12px' : '999px'
}

function handleQuickNoteInput(event) {
  persistQuickNoteDraft()
  resizeQuickNoteInput(event?.target)
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
  nextTick(() => resizeQuickNoteInput())
}

function clearQuickNoteDraft() {
  quickNoteDraft.value = ''
  removeItem(QUICK_NOTE_DRAFT_KEY)
  nextTick(() => resizeQuickNoteInput())
}

watch(quickNoteOpen, (open) => {
  if (!open) {
    quickNoteImportOpen.value = false
    gameStore.setQuickNoteImportMode(false)
    return
  }
  nextTick(() => resizeQuickNoteInput())
})

function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

function buildQuickNoteTitle(text) {
  const firstLine = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (firstLine) return firstLine.slice(0, 18)

  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `速记 ${mm}-${dd} ${hh}:${mi}`
}

function saveQuickNote() {
  const content = quickNoteDraft.value.trim()
  if (!content) {
    quickNoteStatus.value = '先写点内容再保存'
    return false
  }

  let notes = []
  notes = getItem(QUICK_NOTE_STORE_KEY) || []
  if (!Array.isArray(notes)) notes = []

  notes.unshift({
    id: Date.now().toString(),
    title: buildQuickNoteTitle(content),
    content,
    contentFormat: 'md',
    wordCount: quickNoteWordCount(content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  setItem(QUICK_NOTE_STORE_KEY, notes)
  clearQuickNoteDraft()
  quickNoteStatus.value = '已保存到笔记'
  return true
}

function jumpToNotes() {
  if (quickNoteDraft.value.trim()) saveQuickNote()
  router.push('/notes')
}

function jumpToWriting() {
  if (quickNoteDraft.value.trim()) saveQuickNote()
  router.push('/writing')
}
</script>

<style scoped>
.game-page {
  height: 100vh;
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

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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

.quick-notes-drawer {
  width: 262px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 94%, #ffffff 6%);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 8%, transparent);
}

.quick-note-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.quick-note-input {
  flex: 1;
  width: auto;
  min-height: 30px;
  height: 30px;
  max-height: 104px;
  resize: none;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 5px 11px;
  font-size: 11px;
  line-height: 1.45;
  outline: none;
}

.quick-note-input:focus {
  border-color: var(--accent);
}

.quick-note-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.quick-note-icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  padding: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-note-icon-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.quick-note-import-panel {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.quick-note-import-body {
  display: grid;
  grid-template-columns: 1fr 96px;
  gap: 8px;
}

.quick-note-import-left {
  min-width: 0;
}

.quick-note-import-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.quick-note-import-title {
  flex: 1;
  font-size: 10px;
  color: var(--text-secondary);
}

.quick-note-mini-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
}

.quick-note-mini-btn:hover,
.quick-note-mini-btn.primary {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.quick-note-import-side {
  border-left: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  padding-left: 8px;
  display: grid;
  align-content: start;
  gap: 6px;
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

.quick-note-import-empty {
  color: var(--text-secondary);
  line-height: 1.4;
}

.quick-note-tip {
  margin-top: 4px;
  font-size: 9px;
  color: var(--text-secondary);
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

  .quick-notes-drawer {
    width: min(280px, calc(100vw - 24px));
  }
}
</style>
