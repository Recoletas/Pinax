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
                <path d="M5 4h11l3 3v13H5V4z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 4v6h8V4" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 16h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="importQuickNote" title="导入" aria-label="导入">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8.5 10.5L12 14l3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 17h14v3H5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToNotes" title="去笔记" aria-label="去笔记">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 5h12v14H6V5z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToWriting" title="去小说" aria-label="去小说">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h7a3 3 0 013 3v9H7a3 3 0 00-3 3V6z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M20 6h-7a3 3 0 00-3 3v9h7a3 3 0 013 3V6z" stroke="currentColor" stroke-width="1.8"/>
              </svg>
            </button>
          </div>
        </div>
        <div v-if="quickNoteStatus" class="quick-note-tip">{{ quickNoteStatus }}</div>
      </div>
      <button class="quick-notes-btn" type="button" @click.stop="quickNoteOpen = !quickNoteOpen" title="打开速记">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 20l4.2-.9L19.3 8a1.8 1.8 0 000-2.6l-.7-.7a1.8 1.8 0 00-2.6 0L4.9 15.8 4 20z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </aside>

    <Character v-if="showCharacter" @close="showCharacter = false" />
    <Settings v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
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

const router = useRouter()
const gameStore = useGameStore()
const { isDark, toggleTheme } = useTheme()
const showCharacter = ref(false)
const showSettings = ref(false)
const QUICK_NOTE_DRAFT_KEY = 'quick_note_draft'
const QUICK_NOTE_STORE_KEY = 'writing_notes'
const quickNoteOpen = ref(false)
const quickNoteDraft = ref(loadQuickNoteDraft())
const quickNoteStatus = ref('')
const quickNoteInputRef = ref(null)

function goBack() {
  router.push('/fit')
}

function handleSend(text) {
  gameStore.sendAction(text)
}

function loadQuickNoteDraft() {
  try {
    return localStorage.getItem(QUICK_NOTE_DRAFT_KEY) || ''
  } catch {
    return ''
  }
}

function persistQuickNoteDraft() {
  try {
    localStorage.setItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
  } catch {
    // ignore localStorage failures
  }
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

async function importQuickNote() {
  if (!navigator?.clipboard?.readText) {
    quickNoteStatus.value = '当前环境不支持导入'
    return
  }
  try {
    const text = (await navigator.clipboard.readText()).trimEnd()
    if (!text) {
      quickNoteStatus.value = '剪贴板没有可导入内容'
      return
    }
    quickNoteDraft.value = quickNoteDraft.value ? `${quickNoteDraft.value}\n${text}` : text
    persistQuickNoteDraft()
    quickNoteStatus.value = '已导入剪贴板'
    nextTick(() => resizeQuickNoteInput())
  } catch {
    quickNoteStatus.value = '导入失败，请检查剪贴板权限'
  }
}

function clearQuickNoteDraft() {
  quickNoteDraft.value = ''
  try {
    localStorage.removeItem(QUICK_NOTE_DRAFT_KEY)
  } catch {
    // ignore localStorage failures
  }
  nextTick(() => resizeQuickNoteInput())
}

watch(quickNoteOpen, (open) => {
  if (!open) return
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
  try {
    notes = JSON.parse(localStorage.getItem(QUICK_NOTE_STORE_KEY) || '[]')
    if (!Array.isArray(notes)) notes = []
  } catch {
    notes = []
  }

  notes.unshift({
    id: Date.now().toString(),
    title: buildQuickNoteTitle(content),
    content,
    contentFormat: 'md',
    wordCount: quickNoteWordCount(content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  localStorage.setItem(QUICK_NOTE_STORE_KEY, JSON.stringify(notes))
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
  position: fixed;
  right: 0;
  top: 50%;
  transform: translate(34px, -50%);
  z-index: 80;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
}

.quick-notes-rail:hover,
.quick-notes-rail:focus-within {
  transform: translate(0, -50%);
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
