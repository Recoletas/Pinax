<template>
  <div class="chat-container" ref="scrollContainer">
    <!-- UI-E11-B: 0-state hero block. v-if gated on displayMessages.length === 0
         so once the first message lands, the hero disappears and the
         conversation takes the full column. CharacterPortrait narrator
         (5B v0.1 ship 立绘, kaov-archive-narrator.webp 144KB) shows in
         240px left column; greeting + 3 quick action CTA (续写 / 速记 /
         切场景) right column. Each CTA emits('quick-action', id) — parent
         Experience.vue handles the action (per E11-PLAN-QA Fix #2). -->
    <section
      v-if="displayMessages.length === 0"
      class="chat-container__hero"
      aria-label="档案空白引导"
    >
      <!-- UI-E12-FIX2: folio corner simplified to case ID only.
           QA2 flagged the previous "1 / 1" hardcoded page index as
           misleading in 0-state (no real message at page 1). The page
           index was never wired to currentSection / totalCount, so the
           template showed a literal that didn't match the comment.
           The cleanest fix is to drop the page part entirely and keep
           only the case ID stamp (the visually informative part).
           The case ID is derived from session / world ID, not from the
           message count, so it's always honest. -->
      <span class="chat-container__hero-folio" aria-hidden="true">
        <span class="chat-container__hero-folio-case">{{ caseNoShort }}</span>
      </span>
      <div class="chat-container__hero-portrait">
        <CharacterPortrait pose-id="narrator" size="hero" caption="在场档案员" />
      </div>
      <div class="chat-container__hero-prompt">
        <p class="chat-container__hero-greeting">档案空白 · 等候第 1 条落笔</p>
        <p class="chat-container__hero-hint">在下方的输入区记录你的第 1 步行动, 或从以下开始:</p>
        <div class="chat-container__hero-actions">
          <button class="action-btn primary" type="button" @click="$emit('quick-action', 'continue')">续写</button>
          <button class="action-btn" type="button" @click="$emit('quick-action', 'note')">速记</button>
          <button class="action-btn" type="button" @click="$emit('quick-action', 'scene')">切场景</button>
        </div>
      </div>
    </section>

    <!-- UI-E10: scene-entry single-column record stream.
         Each message becomes one <article class="scene-entry"> with:
           - top marginalia (date / section no / role stamp) — gives a
             numbered axis running through the ledger so the user always
             knows which 条 / page they're on (replaces E9 ledger-spread
             chapter-rule + page-header pattern, which lived inside
             double-page spreads that fragmented reading flow)
           - body = .msg-item + .text-wrapper (E6A preserved), with the
             @click="onTextWrapperClick(index, msg, $event)" binding
             preserved verbatim from E9-FIX so the mechanism-trigger
             click still works (gamePanelMechanism.test.js)
         No spine, no sheets, no ink-stamp, no continued-mark: the
         E9 double-page architecture is removed; the conversation reads
         as one continuous scene-record, with section numbering doing
         the navigation work that the spread-pair visual once did.
         UI-E13-BIG1: scene-prompt messages (msg.type === 'scene')
         render as a horizontal divider above the next scene-entry so
         the scene boundary reads as a chapter break, not a content
         entry. Same data path (gameStore.messages), different visual. -->
    <template v-for="(msg, index) in displayMessages" :key="`scene-${index}`">
      <div
        v-if="msg.type === 'scene'"
        class="scene-prompt"
        :data-section-no="index + 1"
        :aria-label="`场景提示 · ${msg.content}`"
      >
        <span class="scene-prompt__kicker">场景提示</span>
        <span>{{ msg.content }}</span>
      </div>
      <article
        class="scene-entry"
        :class="msg.role"
        :aria-label="`第 ${index + 1} 条 · ${displayName(msg)}`"
        :data-section-no="index + 1"
        :data-global-index="index"
      >
        <header class="scene-entry__marginalia" aria-hidden="true">
          <span class="scene-entry__date">{{ formatDate(msg.timestamp) }}</span>
          <span class="scene-entry__no">第 {{ index + 1 }} 条</span>
          <span class="scene-entry__stamp">{{ roleStamp(msg) }}</span>
        </header>
        <div class="scene-entry__body">
          <div
            class="msg-item"
            :class="[
              msg.role,
              {
                'import-picked': gameStore.quickNoteImportMode && gameStore.quickNoteSelectedMessageIndexes.includes(index),
                'compression-complete': isCompressionCompleteMessage(msg)
              }
            ]"
            :data-global-index="index"
          >
            <template v-if="isCompressionCompleteMessage(msg)">
              <div class="msg-column">
                <div class="msg-header">
                  <span class="display-name">档案员</span>
                  <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div class="text-wrapper">
                  <div class="context-compression-complete">
                    <span class="context-compression-pulse"></span>
                    <span class="context-compression-text">{{ msg.content }}</span>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="msg-column">
                <span
                  class="msg-item__folio"
                  :data-folio-page="index + 1"
                  aria-hidden="true"
                >页 {{ index + 1 }}</span>
                <div class="msg-header">
                  <span class="display-name">{{ displayName(msg) }}</span>
                  <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div
                  class="text-wrapper"
                  @click="onTextWrapperClick(index, msg, $event)"
                >
                  <div
                    v-if="editingIndex === index"
                    class="edit-area"
                  >
                    <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
                    <div class="edit-footer">
                      <button class="tavern-btn primary" @click="saveEdit(index)">保存修改</button>
                      <button class="tavern-btn" @click="editingIndex = -1">取消</button>
                    </div>
                  </div>
                  <div
                    v-else
                    class="text-main"
                    v-html="renderMessageContent(msg, index)"
                  ></div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </article>
    </template>
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { renderRPText } from '../services/rpTextRenderer'
import CharacterPortrait from './folio/CharacterPortrait.vue'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
const editingIndex = ref(-1)
const editText = ref('')
const editTextarea = ref(null)

// UI-E11-B: emit('quick-action') added so Experience.vue (parent
// workstation composition) can listen for 续写 / 速记 / 切场景 CTA.
// Per E11-PLAN-QA Fix #2: action='note' opens quick-note workspace;
// 'continue' / 'scene' are v0 stubs (no-op) that the parent can later
// wire to gameStore action in a follow-up slice without re-editing
// GamePanel.vue. UI-E12-W1 wires continue + scene in Experience.vue.
const emit = defineEmits(['show-inline-detail', 'quick-action'])

// UI-E12-W1: hero folio corner — short case ID (first 6 chars of
// gameStore.worldId / currentSessionId, fallback to "pending-record")
// shown in the top-right stamp of the 0-state hero block. Pure
// computed, no store mutation.
const caseNoShort = computed(() => {
  const id = gameStore.currentSessionId || gameStore.worldId || 'pending-record'
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'PENDNG'
})

// === UI-E10 scene-entry structure =====================================
// Replaces UI-E9 book spread: each message becomes one <article
// class="scene-entry"> in a single continuous column. The per-entry
// marginalia (date / 第 N 条 / role stamp) gives a numbered axis that
// runs top-to-bottom through the ledger, so the user always knows
// "which 条 am I on" without needing double-page pairing or a
// chapter-rule ribbon. conversationSpreads (UI-E9) is gone; the
// message stream reads as one scene record.
// gameStore.messages stays the single source of truth — displayMessages
// is a pure derived view, no store mutation.
// ======================================================================
const displayMessages = computed(() => {
  return (gameStore.messages || [])
    .filter((msg) => msg && (msg.role || msg.type) !== undefined)
})

const formatDate = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const roleStamp = (msg) => {
  if (!msg) return '录'
  if (isCompressionCompleteMessage(msg)) return '档案员 · 备忘'
  if (msg.role === 'user') return '我 · 落笔'
  if (msg.role === 'assistant') return '旁白 · 续页'
  if (msg.role === 'system' || msg.type === 'system') return '系统 · 备注'
  return '录'
}

const startEdit = (index, text) => {
  editingIndex.value = index
  editText.value = text
  nextTick(() => {
    editTextarea.value?.focus()
  })
}

const saveEdit = (index) => {
  if (editText.value.trim()) {
    gameStore.updateMessage(index, editText.value)
  }
  editingIndex.value = -1
}

const isCompressionCompleteMessage = (msg) => {
  return (msg?.role || msg?.type) === 'system'
    && String(msg?.content || '').trim() === '【压缩完成】上下文已压缩完成'
}

const displayName = (msg) => {
  if (isCompressionCompleteMessage(msg)) return '系统'
  if (msg.name) return msg.name
  if (msg.role === 'user') return gameStore.playerCharacter?.name || 'User'
  if (msg.role === 'system' || msg.type === 'system') return '系统'
  return gameStore.aiCharacter?.name || 'Assistant'
}

const renderMessageContent = (msg, index) => {
  return renderRPText(msg.content, {
    mechanismTrigger: msg.mechanismTrigger || null,
    inlineEvents: gameStore.inlineEvents.filter((event) => event.messageId === index)
  })
}

const formatTime = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const scroll = () => {
  nextTick(() => {
    if (bottomAnchor.value) {
      bottomAnchor.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  })
}

const onTextWrapperClick = (index, msg, event) => {
  const mechanismTarget = event?.target?.closest?.('.mechanism-trigger')
  if (mechanismTarget && msg?.mechanismTrigger?.type) {
    gameStore.activateMechanism(msg.mechanismTrigger.type, msg.mechanismTrigger)
    return
  }

  const inlineTarget = event?.target?.closest?.('[data-inline-type]')
  if (inlineTarget) {
    const type = inlineTarget.dataset.inlineType || ''
    const content = inlineTarget.dataset.inlineContent || inlineTarget.textContent || ''
    emit('show-inline-detail', { type, content })
    return
  }

  if (!gameStore.quickNoteImportMode) return
  const role = msg.role || msg.type
  if (role === 'system') return
  if (event?.target?.closest('textarea,button,input,.icon-btn,.edit-area,.clickable')) return
  gameStore.toggleQuickNoteMessageSelection(index)
}

onMounted(() => {
  scroll()
})

watch(() => gameStore.messages.length, scroll)
</script>

<style scoped>
.chat-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.msg-item {
  display: flex;
  gap: 14px;
  width: 100%;
}

.msg-item.import-picked .text-wrapper {
  outline: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 8px;
}

.avatar-column {
  flex-shrink: 0;
}

.tavern-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-icon {
  background: var(--accent-light);
  color: var(--accent);
}

.user-icon {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.system-icon {
  background: color-mix(in srgb, var(--accent-emerald) 14%, var(--bg-secondary));
  color: var(--accent-emerald);
  border-color: color-mix(in srgb, var(--accent-emerald) 28%, var(--border));
}

.msg-column {
  flex: 1;
  min-width: 0;
}

.msg-item.compression-complete {
  align-items: center;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.display-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.msg-time {
  font-size: 11px;
  color: var(--text-muted);
}

.msg-actions {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  opacity: 0;
  transition: 0.2s;
}

.msg-item:hover .msg-actions {
  opacity: 1;
}

.msg-actions.import-mode {
  opacity: 1;
}

.msg-actions-row {
  display: flex;
  gap: 8px;
}

.import-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.import-picker input {
  width: 13px;
  height: 13px;
  accent-color: var(--accent);
  cursor: pointer;
}

.icon-btn {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.icon-btn.execute:hover {
  color: var(--success);
}

.icon-btn.delete:hover {
  color: var(--danger);
}

.thought-wrapper {
  margin-bottom: 10px;
  max-width: 90%;
}

details {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

summary {
  padding: 8px 12px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  list-style: none;
  outline: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

summary .arrow {
  font-size: 10px;
}

.thought-body {
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  border-top: 1px solid var(--border);
  font-style: italic;
  line-height: 1.6;
}

.text-main {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  /* UI-E10: body text uses system serif fallback for readability.
     LXGW WenKai (--font-display) is reserved for display positions
     only (chapter title, kicker signature, marginalia). */
  font-family: var(--font-body);
}

.context-compression-complete {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  padding: 7px 11px;
  border: 1px solid color-mix(in srgb, var(--accent-emerald) 28%, var(--border));
  border-radius: 999px;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--accent-emerald) 12%, var(--bg-secondary)),
      color-mix(in srgb, var(--accent-teal) 8%, var(--bg-secondary)));
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent-emerald) 10%, transparent);
  color: color-mix(in srgb, var(--text-primary) 86%, var(--accent-emerald));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  white-space: normal;
}

.context-compression-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-emerald);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-emerald) 14%, transparent);
  flex-shrink: 0;
}

.context-compression-text {
  min-width: 0;
}

.edit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tavern-textarea {
  width: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.tavern-textarea:focus {
  border-color: var(--accent);
}

.edit-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.tavern-btn {
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.15s;
}

.tavern-btn:hover {
  background: var(--bg-hover);
}

.tavern-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tavern-btn.primary:hover {
  background: var(--accent-hover);
}

/* UI-E6A record-book ledger overrides — kept verbatim from the previous
   round so the typography / spine / folio / chapter-rule layer is still
   the foundation. The new UI-E9 book spread sits on top of this. */
.theme-kao .chat-container {
  position: relative;
  background: transparent;
  padding: 18px 0 24px 24px;
  gap: 0;
}

.theme-kao .chat-container::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 12px;
  bottom: 12px;
  width: 4px;
  background: repeating-linear-gradient(
    180deg,
    color-mix(in srgb, var(--archive-gold) 24%, transparent) 0 3px,
    transparent 3px 7px
  );
  pointer-events: none;
}

/* UI-E10: chapter-rule deleted. The numbered section axis is now carried
   by .scene-entry__no (per-entry marginalia); the E9 ribbon-between-spreads
   divider is gone.
   UI-E10-CLEAN 2026-06-22: .scene-stage__indicator reference removed
   (indicator was deleted from Experience.vue + kao.css; section anchor
   is now per-entry marginalia only). */

/* UI-E10 SCENE-ENTRY — 单列可读场景记录流
   ============================================================================
   Replaces UI-E9 book-spread (ledger-spread + __sheets + __spine +
   page-header / page-stamp + ink-stamp + continued-mark + chapter-rule).
   The double-page pair structure fragmented conversation reading; users
   had to mentally jump between left sheet and right sheet within one
   logical turn, and the long-assistant 续 mark pulled focus to layout
   instead of content. E10 collapses each message into one <article
   class="scene-entry"> with:
     - top marginalia (date / 第 N 条 / role stamp) — gives a numbered
       axis running top-to-bottom through the ledger
     - body = .msg-item + .text-wrapper (E6A preserved)
     - role-color 3px left bar comes from .msg-item role classes
       (preserved below)
   The .theme-kao .game-page::before shared vertical axis was deleted
   in UI-E10-CLEAN 2026-06-22 (was masked behind record-folio / sidebar
   borders). UI-E11 will replace with a sticky topstrip, not a hidden
   1px line. This entry-level margin just adds breathing room around
   the msg-item card. */
.theme-kao .scene-entry {
  position: relative;
  padding: 14px 18px 12px 38px;
  margin-bottom: 6px;
  background: transparent;
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 22%, transparent);
}

.theme-kao .scene-entry:last-child {
  border-bottom: none;
}

/* Top marginalia — date (left) / 第 N 条 (center) / role stamp (right).
   Sans 11px per UI-DETAIL1 §S-3 meta rule; gold-soft for the section
   number so it reads as the page's "axis coordinate"; rose for the role
   stamp echoing the page-level vertical axis. */
.theme-kao .scene-entry__marginalia {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 8px;
  margin-bottom: 6px;
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 26%, transparent);
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
}

.theme-kao .scene-entry__date {
  flex: 0 0 auto;
}

.theme-kao .scene-entry__no {
  flex: 1 1 auto;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--archive-gold) 84%, transparent);
  font-variant-numeric: tabular-nums;
}

/* UI-E12-F: scene-entry__stamp switched from --font-display (LXGW
   brush) to --font-sans. The brush face is too dense to read at
   10px; sans keeps the role stamp legible while the italic + rose
   color still mark it as a kicker. Bumped 10 → 11px for product-
   feel readability at 1280 and 640. */
.theme-kao .scene-entry__stamp {
  flex: 0 0 auto;
  font-family: var(--font-sans);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-rose) 80%, transparent);
}

.theme-kao .scene-entry__body {
  display: block;
  padding: 0;
}

/* === UI-E6A record-book ledger overrides — preserved below ===
   The scene-entry (UI-E10) layer above sits on top of these. */
.theme-kao .msg-item {
  display: block;
  padding: 14px 36px 14px 24px;
  position: relative;
  background: color-mix(in srgb, var(--archive-paper-strong) 18%, transparent);
  border-left: 3px solid var(--archive-gold);
  border-radius: 0;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--archive-ink) 12%, transparent);
  margin-bottom: 4px;
}

.theme-kao .msg-item.user {
  border-left-color: var(--archive-olive-strong);
}

.theme-kao .msg-item.assistant {
  border-left-color: var(--archive-gold);
}

.theme-kao .msg-item.compression-complete {
  border-left-color: var(--archive-rose);
  background: color-mix(in srgb, var(--archive-paper-strong) 24%, transparent);
}

/* Sparse dividers — preserved from E6A: dotted gold hairline appears between
   adjacent msg-items whose roles change, suppressed when roles repeat. In the
   E9 spread layout msg-items live in separate sheet sections so this selector
   rarely matches, but the rule stays for the contract + any future non-spread
   path (e.g. inline inline-list rendering). */
.theme-kao .msg-item + .msg-item.user,
.theme-kao .msg-item + .msg-item.assistant {
  border-top: 1px dotted color-mix(in srgb, var(--archive-gold) 24%, transparent);
  margin-top: 14px;
  padding-top: 18px;
}

.theme-kao .msg-item.user + .msg-item.user,
.theme-kao .msg-item.assistant + .msg-item.assistant {
  border-top: none;
  margin-top: 2px;
  padding-top: 6px;
}

.theme-kao .avatar-column {
  display: none;
}

.theme-kao .tavern-avatar {
  display: none;
}

.theme-kao .msg-column {
  display: block;
}

.theme-kao .msg-item__folio {
  position: absolute;
  top: 8px;
  left: 24px;
  font-family: var(--font-sans);
  font-size: 11px;
  font-style: italic;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-ink-soft) 60%, transparent);
  pointer-events: none;
}

.theme-kao .msg-header {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.theme-kao .display-name {
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: 11px;
  font-style: italic;
  letter-spacing: 0.02em;
  text-transform: none;
  color: color-mix(in srgb, var(--archive-ink-soft) 60%, transparent);
}

.theme-kao .msg-time {
  font-family: var(--font-sans);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--archive-ink-soft) 60%, transparent);
}

.theme-kao .msg-item.user .text-main::before {
  content: "我 · ";
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-display);
  font-size: 14px;
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-olive-strong) 80%, transparent);
}

.theme-kao .msg-item.assistant .text-main::before {
  content: "旁白 · ";
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-display);
  font-size: 14px;
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-rose) 84%, transparent);
}

.theme-kao .msg-item.compression-complete .text-main::before {
  content: "档案员 · ";
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-display);
  font-size: 14px;
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-gold) 88%, transparent);
}

.theme-kao .text-main {
  /* UI-E10: body text reads in system serif (Songti / Source Han Serif /
     Noto Serif CJK / STSong / Georgia), NOT LXGW. LXGW is reserved for
     display positions only (chapter title, kicker signature, marginalia
     stamps). UI-E12-F: bumped 16 → 17px so the central record surface
     reads as a product body (not as faded decoration); contract #2
     pins font-family var(--font-body) + font-size ≥16 + line-height
     ≥1.7. Letter-spacing 0.02em preserves CJK rhythm. */
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.78;
  color: var(--archive-ink);
  letter-spacing: 0.02em;
}

.theme-kao .thought-wrapper {
  max-width: 100%;
  margin: 6px 0 8px;
}

.theme-kao details {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  border-radius: 0;
}

.theme-kao summary {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--archive-ink-soft) 64%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 50%, transparent);
}

.theme-kao .thought-body {
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.65;
  border-top: 1px dotted color-mix(in srgb, var(--archive-gold) 22%, transparent);
  color: color-mix(in srgb, var(--archive-ink-soft) 78%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 40%, transparent);
}

.theme-kao .icon-btn {
  color: color-mix(in srgb, var(--archive-ink) 50%, transparent);
  border-radius: 0;
}

.theme-kao .icon-btn:hover {
  background: color-mix(in srgb, var(--archive-gold) 12%, transparent);
  color: var(--archive-olive-strong);
}

/* Reduced-motion a11y — scene-entry inherits the same disable pattern
   as E6A animations (no transitions on entry surfaces). */
@media (prefers-reduced-motion: reduce) {
  .theme-kao .scene-entry,
  .theme-kao .scene-entry__marginalia,
  .theme-kao .msg-item {
    transition: none;
    transform: none;
    animation: none;
  }
}

/* Mobile — tighten padding for narrow screens. E10's single-column
   layout doesn't need the E9 spread-to-column fallback (already a
   single column). Just compact padding + smaller font. */
@media (max-width: 760px) {
  .theme-kao .scene-entry {
    padding: 10px 14px 10px 22px;
  }
  .theme-kao .scene-entry__marginalia {
    font-size: 10px;
    gap: 8px;
  }
  .theme-kao .scene-entry__no {
    font-size: 11px;
  }
}

/* UI-E11-B + UI-E12-W1: 0-state hero block — narrator portrait + greeting
   + 3 quick action CTA. Shows only when displayMessages.length === 0
   (v-if above). Layout: 2-column grid 240px portrait + 1fr prompt block.
   Mobile collapses to 1 column via the 760px media query below. All
   colors via var(--archive-*) tokens, no raw hex. Border-bottom dotted
   archive-gold acts as a section divider without being a hard horizontal
   rule. UI-E12-W1: padding bumped 22/18/28 → 32/24/36 + paper-strong
   6% wash + position:relative so the empty state reads as a workbench
   card with a page corner, not as a flat fill-in form. */
.theme-kao .chat-container__hero {
  position: relative;
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 22px;
  padding: 32px 24px 36px;
  background: color-mix(in srgb, var(--archive-paper-strong) 6%, transparent);
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 24%, transparent);
}
.theme-kao .chat-container__hero-portrait {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.theme-kao .chat-container__hero-prompt {
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
}
/* UI-E12-W1: hero greeting bumped 18 → 22px so the empty-state first
   read hits harder. DISPLAY LXGW still reserved for kicker positions;
   22px is the largest text on the page so it can carry the brush face
   without losing readability. Letter-spacing 0.04 → 0.06em lets the
   brush strokes breathe at the larger size. No LXGW in body (text-main
   stays 17px Songti per E12-F contract #2). */
.theme-kao .chat-container__hero-greeting {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.06em;
  color: var(--archive-ink);
}
/* UI-E12-W1: hero hint 14 → 15px / 1.65 → 1.7 so the secondary copy
   reads alongside the 22px greeting without feeling like a footnote.
   Still BODY Songti (not DISPLAY) per font-layer contract. */
.theme-kao .chat-container__hero-hint {
  margin: 0;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.7;
  color: color-mix(in srgb, var(--archive-ink) 84%, transparent);
}
.theme-kao .chat-container__hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* UI-E12-W1: hero folio corner — top-right stamp showing the
   short case ID only (no page index, see UI-E12-FIX2). Positioned
   absolutely on the hero block (which has position: relative).
   Sans 9px so it reads as a small ledger mark, not a heading.
   archive-ink 50% so it doesn't compete with the 22px greeting. */
.theme-kao .chat-container__hero-folio {
  position: absolute;
  top: 8px;
  right: 12px;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-sans);
  font-size: 9px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--archive-ink) 50%, transparent);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .theme-kao .chat-container__hero {
    grid-template-columns: 1fr;
  }
}

/* UI-E12-W1: dark-mode hero wash override. The default hero wash is
   paper-strong 6% on light mode, which gives the empty state a
   "raised card" feel against the page background. In dark mode
   paper-strong resolves to a warmer cream that competes with the
   page's archive-paper-deep bg — the wash disappears. Switch to
   paper-soft 8% (cooler, slightly bluer) so the wash contrast inverts
   correctly and the hero still reads as a raised card. */
.theme-kao.theme-dark .chat-container__hero {
  background: color-mix(in srgb, var(--archive-paper-soft) 8%, transparent);
}
</style>