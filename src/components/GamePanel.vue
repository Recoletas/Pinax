<template>
  <div class="chat-container prose-reading-plane" ref="scrollContainer">
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
      <div class="chat-container__hero-prompt">
        <p class="chat-container__hero-kicker">现场记录入口</p>
        <p class="chat-container__hero-greeting">从第一步行动开始</p>
        <p class="chat-container__hero-hint">输入你的下一步，或先用本地演示推进一条记录。右侧索引会提示新线索。</p>
        <div class="chat-container__hero-actions" aria-label="记录起步操作">
          <button class="chat-container__hero-slip is-primary" type="button" @click="$emit('quick-action', 'continue')">
            <span>行动</span>
            <strong>续写第一步</strong>
            <small>把当前意图写入记录流</small>
          </button>
          <button class="chat-container__hero-slip is-secondary" type="button" @click="$emit('quick-action', 'note')">
            <span>速记</span>
            <strong>摘一条线索</strong>
            <small>把对话片段转为素材</small>
          </button>
          <button class="chat-container__hero-slip is-secondary" type="button" @click="$emit('quick-action', 'scene')">
            <span>场景</span>
            <strong>切到下一处</strong>
            <small>用本地演示检查流转</small>
          </button>
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
      <!-- E16-NOVEL: scene-prompt is now a centered ornamental break
           (◇ + caption), not a horizontal divider with a chip.
           Matches 微信阅读 / 古龙 online chapter break convention. -->
      <div
        v-if="msg.type === 'scene'"
        class="scene-break"
        :data-section-no="index + 1"
        :aria-label="`场景 · ${msg.content}`"
      >
        <span class="scene-break__mark" aria-hidden="true">◇</span>
        <span class="scene-break__text">{{ msg.content }}</span>
      </div>
      <!-- E16-NOVEL: each msg is one prose paragraph in the reading
           column. No avatar, no msg-actions, no msg-time visible.
           Speaker differentiation is via:
             (a) an inline small-caps speaker label (Disco Elysium
                 "skill voice" pattern) for the first turn of a run,
             (b) 段首缩进 2em on every paragraph (canonical CJK),
             (c) per-role color tint on the speaker label only.
           The text is the UI; everything else is chrome. -->
      <NarrativeTurn
        :message="msg"
        :index="index"
        :blocks="messageBlocks(msg)"
        :editing="editingIndex === index"
        :opening="isOpeningTurn(index)"
        :show-turn-speaker="showSpeakerLabel(msg, index)"
        :turn-speaker="displayName(msg)"
        :compression-complete="isCompressionCompleteMessage(msg)"
        :can-edit="(msg.role || msg.type) !== 'system'"
        :render-content="(block) => renderBlockContent(msg, block, index)"
        @body-click="onTextWrapperClick(index, msg, $event)"
        @editor-keydown="onEditorKeydown"
        @save-edit="saveEdit(index)"
        @cancel-edit="cancelEdit"
        @edit="startEdit(index, msg.content)"
        @delete="gameStore.deleteMessage(index)"
        @regenerate="gameStore.regenerateFrom(index)"
      />
    </template>
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { renderRPText } from '../services/rpTextRenderer'
import NarrativeTurn from './experience/NarrativeTurn.vue'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
// UI-E19: edit state is just an index. The actual editor element is a
// contenteditable span inside .prose, addressed by data-global-index.
// We seed its textContent in nextTick after editingIndex flips; v-html
// is intentionally NOT bound to the editor (Vue would re-render and
// clobber what the user is typing).
const editingIndex = ref(-1)

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

// E16-NOVEL: speaker label + drop-cap helpers. The speaker label
// appears inline at the start of a run (Disco Elysium "skill voice"
// pattern) so the user can scan who said what without an avatar.
// The opening turn of a role run gets a drop cap (Kentucky Route Zero
// / Pentiment), so the first line of each "speaker turn" has the
// gravity of a novel chapter opening.
const isOpeningTurn = (index) => {
  if (index === 0) return true
  const prev = displayMessages.value[index - 1]
  const curr = displayMessages.value[index]
  if (!prev || !curr) return true
  if (prev.type === 'scene') return true
  return (prev.role || prev.type) !== (curr.role || curr.type)
}
const showSpeakerLabel = (msg, index) => {
  if (!msg || msg.type === 'scene') return false
  const blocks = messageBlocks(msg)
  const hasBlockSpeaker = blocks.some((block) => Boolean(block?.speaker))

  // 纯叙述不伪造“旁白”署名。玩家只在新的玩家回合组首留一次身份，
  // 明确角色由 block speaker 负责；来源不明的对白保持无署名而非猜测角色。
  if (msg.role === 'user') return isOpeningTurn(index)
  if (hasBlockSpeaker) return false
  return false
}

const startEdit = (index, text) => {
  editingIndex.value = index
  nextTick(() => {
    const editor = document.querySelector(
      `.prose[data-global-index="${index}"] .prose__editor`
    )
    if (!editor) return
    editor.textContent = text || ''
    editor.focus()
    // Place cursor at end so the user can immediately type to extend,
    // or use shift+arrow / Ctrl+A to select. No select-all by default —
    // a small typo fix shouldn't blow away the whole message.
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
  })
}

const cancelEdit = () => {
  editingIndex.value = -1
}

const saveEdit = (index) => {
  const editor = document.querySelector(
    `.prose[data-global-index="${index}"] .prose__editor`
  )
  const text = (editor?.innerText ?? '').replace(/\u00a0/g, ' ').trimEnd()
  if (text.trim()) {
    gameStore.updateMessage(index, text)
  }
  editingIndex.value = -1
}

const onEditorKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    saveEdit(editingIndex.value)
  }
  // Plain Enter is left to the browser's default (newline / <br>).
}

const isCompressionCompleteMessage = (msg) => {
  return (msg?.role || msg?.type) === 'system'
    && String(msg?.content || '').trim() === '【压缩完成】上下文已压缩完成'
}

const displayName = (msg) => {
  if (isCompressionCompleteMessage(msg)) return '系统'
  const explicitName = String(msg.name || '').trim()
  if (explicitName && !['assistant', 'user', 'system'].includes(explicitName.toLowerCase())) {
    return explicitName
  }
  if (msg.role === 'user') return gameStore.playerCharacter?.name || '主角'
  if (msg.role === 'system' || msg.type === 'system') return '系统'
  const aiName = String(gameStore.aiCharacter?.name || '').trim()
  return aiName && !['assistant', 'ai'].includes(aiName.toLowerCase()) ? aiName : '旁白'
}

const messageBlocks = (msg) => {
  if (msg?.presentation?.blocks?.length) return msg.presentation.blocks
  return [{
    id: `${msg?.id || 'message'}-fallback`,
    kind: msg?.role === 'system' ? 'system' : 'narration',
    text: String(msg?.content || '')
  }]
}

const renderBlockContent = (msg, block) => {
  return renderRPText(block?.text || '', {
    mechanismTrigger: msg?.mechanismTrigger || null,
    inlineEvents: gameStore.inlineEvents.filter((event) => event.messageId === displayMessages.value.indexOf(msg))
  })
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
  if (displayMessages.value.length > 0) scroll()
})

watch(() => gameStore.messages.length, (length, previousLength) => {
  if (length > previousLength) scroll()
})
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

.chat-container {
  background: transparent;
  padding: 18px 22px 24px;
  gap: 18px;
}

.chat-container__hero {
  position: relative;
  display: block;
  padding: 30px 34px 34px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper-soft) 90%, transparent),
      color-mix(in srgb, var(--archive-paper) 96%, transparent));
  border: 1px solid var(--hairline-soft);
  border-radius: 4px;
}

.chat-container__hero-prompt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}

.chat-container__hero-kicker {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--archive-olive);
}

.chat-container__hero-greeting {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--archive-ink);
}

.chat-container__hero-hint {
  margin: 0;
  max-width: 620px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.7;
  color: color-mix(in srgb, var(--archive-ink) 76%, transparent);
}

.chat-container__hero-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}

.chat-container__hero-slip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 92px;
  padding: 12px 14px;
  border: 1px solid var(--hairline-soft);
  border-radius: 4px;
  background: var(--archive-paper);
  color: var(--archive-ink);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 74%, transparent),
    0 8px 18px color-mix(in srgb, var(--archive-ink) 8%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.chat-container__hero-slip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--archive-olive) 36%, var(--border));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 82%, transparent),
    0 10px 22px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.chat-container__hero-slip span {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--archive-olive);
}

.chat-container__hero-slip strong {
  font-size: 15px;
  line-height: 1.3;
}

.chat-container__hero-slip small {
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
  font-size: 12px;
  line-height: 1.45;
}

.chat-container__hero-slip.is-primary {
  border-color: color-mix(in srgb, var(--archive-olive) 42%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 78%, var(--archive-paper));
}

.chat-container__hero-folio {
  position: absolute;
  top: 12px;
  right: 16px;
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--archive-ink) 48%, transparent);
  pointer-events: none;
}

.text-main {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.72;
  letter-spacing: 0;
}

@media (max-width: 760px) {
  .chat-container {
    padding: 12px 12px 18px;
  }

  .chat-container__hero {
    padding: 26px 20px 24px;
  }

  .chat-container__hero-actions {
    grid-template-columns: 1fr;
  }
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

/* UI-E10: chapter-rule deleted. UI-E15 also removes the later per-entry
   marginalia header; role identity now lives in the message speaker badge.
   The E9 ribbon-between-spreads divider is gone.
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
     - left speaker badge — keeps user / narrator identity visible without
       the noisy date / 第 N 条 / 续页 / 页 N metadata stack
     - body = .msg-item + .text-wrapper (E6A preserved)
     - role-color 3px left bar comes from .msg-item role classes
       (preserved below)
   The .theme-kao .game-page::before shared vertical axis was deleted
   in UI-E10-CLEAN 2026-06-22 (was masked behind record-folio / sidebar
   borders). UI-E11 will replace with a sticky topstrip, not a hidden
   1px line. This entry-level margin just adds breathing room around
   the msg-item card. */
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

/* E16-NOVEL: the kao theme owns the prose column. Per
   微信阅读 / 古龙 online: Songti 17px / 1.75 / 段首缩进 2em.
   No inter-paragraph margin (indent is the only separator).
   The drop cap uses --font-display (LXGW WenKai) gold-to-rose
   gradient — same calligraphy we ship on 5C / Writing W3. */
.theme-kao .prose {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.75;
  color: var(--archive-ink);
  text-indent: 0;
}
.theme-kao .prose--opening {
  text-indent: 0;
}
.theme-kao .prose--opening .prose__body {
  text-indent: 0;
}
.theme-kao .prose--opening .prose__body::first-letter {
  float: left;
  font-family: var(--font-display);
  font-size: 3em;
  line-height: 0.95;
  margin: 0.06em 0.12em 0 0;
  font-weight: 700;
  background: linear-gradient(180deg,
    var(--archive-olive-strong) 0%,
    var(--archive-gold) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-indent: 0;
}
.theme-kao .prose__speaker {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--archive-olive-strong) 88%, var(--archive-ink));
  text-transform: uppercase;
  text-indent: 0;
}
.theme-kao .prose__speaker--user {
  color: color-mix(in srgb, var(--archive-olive-strong) 92%, var(--archive-ink));
}
.theme-kao .prose__speaker--assistant {
  color: color-mix(in srgb, var(--archive-olive) 88%, var(--archive-gold));
}
.theme-kao .prose__speaker--system {
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  font-style: italic;
}

.theme-kao .prose__body {
  display: block;
  text-indent: 0;
}

.theme-kao .narrative-block {
  margin: 0;
  text-indent: 0;
}

.theme-kao :deep(.narrative-block) {
  margin: 0;
  text-indent: 0;
}

.theme-kao :deep(.narrative-block + .narrative-block) {
  margin-top: 0.72em;
}

.theme-kao :deep(.narrative-block--narration) {
  text-indent: 2em;
}

.theme-kao :deep(.narrative-block--action),
.theme-kao :deep(.narrative-block--thought) {
  color: color-mix(in srgb, var(--archive-ink) 82%, var(--archive-olive));
  font-style: italic;
  text-indent: 1em;
}

.theme-kao :deep(.narrative-block--dialogue) {
  color: color-mix(in srgb, var(--archive-ink) 94%, var(--archive-olive-strong));
  font-weight: 520;
}

.theme-kao :deep(.narrative-block--system) {
  margin: 1em 0;
  padding: 0.55em 0.8em;
  border-left: 2px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 42%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 68%, transparent);
  font-size: 0.9em;
  text-indent: 0;
}

.theme-kao :deep(.narrative-block__speaker) {
  display: block;
  margin-bottom: 0.28em;
  color: color-mix(in srgb, var(--archive-olive-strong) 88%, var(--archive-ink));
  font-family: var(--font-sans);
  font-size: 0.72em;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-indent: 0;
}

.theme-kao :deep(.narrative-block__text) {
  display: inline;
}

.theme-kao .narrative-block + .narrative-block {
  margin-top: 0.72em;
}

.theme-kao .narrative-block--narration {
  text-indent: 2em;
}

.theme-kao .narrative-block--action,
.theme-kao .narrative-block--thought {
  color: color-mix(in srgb, var(--archive-ink) 82%, var(--archive-olive));
  font-style: italic;
  text-indent: 1em;
}

.theme-kao .narrative-block--dialogue {
  color: color-mix(in srgb, var(--archive-ink) 94%, var(--archive-olive-strong));
  font-weight: 520;
}

.theme-kao .narrative-block--system {
  margin: 1em 0;
  padding: 0.55em 0.8em;
  border-left: 2px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 42%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 68%, transparent);
  font-size: 0.9em;
  text-indent: 0;
}

.theme-kao .narrative-block__speaker {
  display: block;
  margin-bottom: 0.28em;
  color: color-mix(in srgb, var(--archive-olive-strong) 88%, var(--archive-ink));
  font-family: var(--font-sans);
  font-size: 0.72em;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-indent: 0;
}

.theme-kao .narrative-block__text {
  display: inline;
}
.theme-kao .prose.compression-complete {
  font-style: italic;
  color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
  font-size: 15px;
}
.theme-kao .scene-break {
  text-align: center;
  margin: 1.6em 0;
  color: color-mix(in srgb, var(--archive-ink) 56%, transparent);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.theme-kao .scene-break__mark {
  display: block;
  font-size: 18px;
  margin-bottom: 4px;
  color: color-mix(in srgb, var(--archive-gold) 70%, var(--archive-ink));
}
.theme-kao .scene-break__text {
  font-family: var(--font-body);
  font-size: 13px;
  color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
  font-style: italic;
}
.theme-kao .tavern-textarea {
  width: 100%;
  min-height: 80px;
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.75;
  background: color-mix(in srgb, var(--archive-paper-soft) 80%, transparent);
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 0;
  padding: 8px 10px;
  color: var(--archive-ink);
  resize: vertical;
}

/* Mobile — single column, no padding change needed (text is
   already 17px / 1.75). Just compact chat-container padding. */
@media (max-width: 760px) {
  .theme-kao .chat-container {
    padding: 20px 20px 32px;
  }
  .theme-kao .prose {
    font-size: 16px;
    line-height: 1.8;
  }

  .theme-kao :deep(.narrative-block--narration) {
    text-indent: 1.5em;
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
  display: block;
  padding: 30px 34px 34px;
  background: color-mix(in srgb, var(--archive-paper-strong) 6%, transparent);
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 24%, transparent);
}
.theme-kao .chat-container__hero-prompt {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
}
.theme-kao .chat-container__hero-kicker {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--archive-olive-strong);
}
/* UI-E12-W1: hero greeting bumped 18 → 22px so the empty-state first
   read hits harder. DISPLAY LXGW still reserved for kicker positions;
   22px is the largest text on the page so it can carry the brush face
   without losing readability. Letter-spacing 0.04 → 0.06em lets the
   brush strokes breathe at the larger size. No LXGW in body (text-main
   stays 17px Songti per E12-F contract #2). */
.theme-kao .chat-container__hero-greeting {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0;
  color: var(--archive-ink);
}
/* UI-E12-W1: hero hint 14 → 15px / 1.65 → 1.7 so the secondary copy
   reads alongside the 22px greeting without feeling like a footnote.
   Still BODY Songti (not DISPLAY) per font-layer contract. */
.theme-kao .chat-container__hero-hint {
  margin: 0;
  max-width: 620px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.7;
  color: color-mix(in srgb, var(--archive-ink) 84%, transparent);
}
.theme-kao .chat-container__hero-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.theme-kao .chat-container__hero-slip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 92px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--archive-paper) 70%, transparent);
  color: var(--archive-ink);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 70%, transparent),
    0 8px 18px color-mix(in srgb, var(--archive-ink) 10%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.theme-kao .chat-container__hero-slip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--archive-olive) 44%, var(--border));
}
.theme-kao .chat-container__hero-slip span {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--archive-olive-strong);
}
.theme-kao .chat-container__hero-slip strong {
  font-size: 15px;
  line-height: 1.3;
}
.theme-kao .chat-container__hero-slip small {
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
  font-size: 12px;
  line-height: 1.45;
}
.theme-kao .chat-container__hero-slip.is-primary {
  border-color: color-mix(in srgb, var(--archive-olive) 42%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 74%, transparent);
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
    padding: 26px 20px 24px;
  }
  .theme-kao .chat-container__hero-greeting {
    font-size: 22px;
  }
  .theme-kao .chat-container__hero-actions {
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

/* UI-E19: in-place editor chrome. The .prose itself gets a subtle
   background lift + soft inset frame when .prose--editing is on, and
   the inner .prose__editor takes over the body content. Per-theme
   color choices come from kao.css / legacy.css (steel-blue dossier
   for legacy, warm archive-folio for kao) — scoped CSS only owns
   layout (display, min-height, padding, white-space, transition
   timing). No out-in / unmount-remount: the .prose stays mounted, only
   its child swaps from .prose__body to .prose__editor via v-if/v-else. */
.prose {
  transition: background-color 160ms ease, box-shadow 160ms ease,
              min-height 160ms ease;
}

.prose__editor {
  display: block;
  width: 100%;
  min-height: 1.6em;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  text-indent: 0;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
  background: transparent;
  border: 1px solid transparent;
  padding: 6px 10px;
  border-radius: 0;
  /* Subtle chrome transition only — background / border / box-shadow.
     160ms sits in the 120-180ms range; min-height also transitions so
     the column doesn't snap when toggling edit. */
  transition: background-color 160ms ease, border-color 160ms ease,
              box-shadow 160ms ease, min-height 160ms ease;
}

.prose__editor:focus {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .prose,
  .prose__editor {
    transition: none;
  }
}
</style>
