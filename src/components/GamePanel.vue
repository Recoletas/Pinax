<template>
  <div class="chat-container" ref="scrollContainer">
    <template v-for="(group, gIdx) in messageGroups" :key="`g-${gIdx}`">
      <div
        v-if="gIdx > 0"
        class="chapter-rule"
        :data-chapter-label="`卷 ${recordVolume} · 第 ${gIdx + 1} 页`"
        aria-hidden="true"
      >
        <span class="chapter-rule__label">卷 {{ recordVolume }} · 第 {{ gIdx + 1 }} 页</span>
      </div>
      <div
        v-for="(msg, mIdx) in group"
        :key="`${gIdx}-${mIdx}`"
        :class="[
          'msg-item',
          msg.role,
          {
            'import-picked': gameStore.quickNoteImportMode && gameStore.quickNoteSelectedMessageIndexes.includes(globalIndex(group, mIdx)),
            'compression-complete': isCompressionCompleteMessage(msg)
          }
        ]"
      >

        <!-- 头像列 -->
        <div class="avatar-column">
          <template v-if="isCompressionCompleteMessage(msg)">
            <div class="tavern-avatar system-icon">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13 4.5L6.2 11.3 3 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </template>

          <template v-else-if="msg.role === 'assistant'">
            <img v-if="gameStore.aiCharacter?.avatar" :src="gameStore.aiCharacter.avatar" class="tavern-avatar" />
            <div v-else class="tavern-avatar ai-icon">
              {{ (msg.name || 'A')[0] }}
            </div>
          </template>

          <template v-else>
            <img v-if="gameStore.playerCharacter?.avatar" :src="gameStore.playerCharacter.avatar" class="tavern-avatar" />
            <div v-else class="tavern-avatar user-icon">
              {{ (msg.name || 'U')[0] }}
            </div>
          </template>
        </div>

        <!-- 内容列 -->
        <div class="msg-column">
          <!-- Folio 页码 marginalia (record-book mechanism, not row number) -->
          <span
            v-if="!isCompressionCompleteMessage(msg)"
            class="msg-item__folio"
            :data-folio-page="globalIndex(group, mIdx) + 1"
            aria-hidden="true"
          >页 {{ globalIndex(group, mIdx) + 1 }}</span>

          <div class="msg-header">
            <span class="display-name">
              {{ displayName(msg) }}
            </span>
            <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
            <div
              class="msg-actions"
              :class="{ 'import-mode': gameStore.quickNoteImportMode && (msg.role || msg.type) !== 'system' }"
            >
              <span
                v-if="gameStore.quickNoteImportMode && (msg.role || msg.type) !== 'system'"
                class="import-picker"
                @click="gameStore.toggleQuickNoteMessageSelection(globalIndex(group, mIdx))"
                :title="gameStore.quickNoteSelectedMessageIndexes.includes(globalIndex(group, mIdx)) ? '取消导入' : '加入导入'"
              >
                <input
                  type="checkbox"
                  :checked="gameStore.quickNoteSelectedMessageIndexes.includes(globalIndex(group, mIdx))"
                  @click.stop
                  @change="gameStore.toggleQuickNoteMessageSelection(globalIndex(group, mIdx))"
                />
              </span>
              <div class="msg-actions-row">
                <span v-if="msg.role === 'user'" class="icon-btn execute" @click="gameStore.regenerateFrom(globalIndex(group, mIdx))" title="重写后续">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 1l9 5-9 5V1z"/>
                  </svg>
                </span>
                <span class="icon-btn" @click="startEdit(globalIndex(group, mIdx), msg.content)" title="编辑内容">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M8.5 1.5l2 2-7 7-2.5.5.5-2.5 7-7z"/>
                  </svg>
                </span>
                <span class="icon-btn delete" @click="gameStore.deleteMessage(globalIndex(group, mIdx))" title="删除">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 2h8v8H2V2zM4 0h4v2H4V0z"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          <!-- 思考框 -->
          <div v-if="msg.reasoning_content" class="thought-wrapper">
            <details :open="globalIndex(group, mIdx) === gameStore.messages.length - 1">
              <summary>思考过程 <span class="arrow">▾</span></summary>
              <div class="thought-body">{{ msg.reasoning_content }}</div>
            </details>
          </div>

          <!-- 正文区域 -->
          <div
            class="text-wrapper"
            @click="onTextWrapperClick(globalIndex(group, mIdx), msg, $event)"
          >
            <div v-if="editingIndex === globalIndex(group, mIdx)" class="edit-area">
              <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
              <div class="edit-footer">
                <button class="tavern-btn primary" @click="saveEdit(globalIndex(group, mIdx))">保存修改</button>
                <button class="tavern-btn" @click="editingIndex = -1">取消</button>
              </div>
            </div>
            <div v-else-if="isCompressionCompleteMessage(msg)" class="context-compression-complete">
              <span class="context-compression-pulse"></span>
              <span class="context-compression-text">{{ msg.content }}</span>
            </div>
            <div v-else class="text-main" v-html="renderMessageContent(msg, globalIndex(group, mIdx))"></div>
          </div>
        </div>
      </div>
    </template>
    <div ref="bottomAnchor" style="height: 1px; width: 100%"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { renderRPText } from '../services/rpTextRenderer'

const gameStore = useGameStore()
const scrollContainer = ref(null)
const bottomAnchor = ref(null)
const editingIndex = ref(-1)
const editText = ref('')
const editTextarea = ref(null)

const emit = defineEmits(['show-inline-detail'])

// Record-book: chunk messages into groups of 8 so the ledger shows a
// chapter-rule ribbon between every 8 entries. Pure local computed —
// gameStore.messages is read-only here, the chunking is for layout
// only, no store mutation.
const CHAPTER_SIZE = 8
const messageGroups = computed(() => {
  const msgs = gameStore.messages || []
  const groups = []
  for (let i = 0; i < msgs.length; i += CHAPTER_SIZE) {
    groups.push(msgs.slice(i, i + CHAPTER_SIZE))
  }
  return groups
})

const globalIndex = (group, mIdx) => {
  // Convert (groupIndex implied by position of `group` in messageGroups,
  // mIdx within group) back to the original index in gameStore.messages.
  // The caller passes the group array; we find its offset.
  const all = messageGroups.value
  for (let g = 0; g < all.length; g += 1) {
    if (all[g] === group) return g * CHAPTER_SIZE + mIdx
  }
  return mIdx
}

const recordVolume = computed(() => {
  // Volume label: derived from session sequence. Use messages length
  // ceiling so a long ledger climbs the volume number — small visual
  // signal that the record has grown.
  const total = (gameStore.messages || []).length
  if (total <= CHAPTER_SIZE) return 1
  return Math.ceil(total / CHAPTER_SIZE)
})

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

/* Kao record-book page — UI-E6A. The ledger now reads as a paper page,
   not a chat stream:
     - body 14px → 16px / line-height 1.65 → 1.75 for clearer reading
     - meta (display-name / msg-time / folio page no.) → sans, 11px, ink 48%
     - role kicker (我 · / 旁白 · / 档案员 ·) becomes a 14px display block
       signature above the body instead of inline italic at body start
     - chat-container left spine stitch (gold 24% repeating-linear-gradient)
     - folio page number on each msg (页 N, top-left marginalia)
     - chapter rule ribbon every 8 messages (卷 X · 第 Y 页)
     - message entry has a 3px left bar (role color), a half-transparent
       paper-strong backdrop, hard cut corners, and a 1px ink hairline
   No new scoped global theme selector, no important flag, no random hex, no new
   tokens. Scoped CSS specificity 0,2,1 beats the tool-feel rules above. */
.theme-kao .chat-container {
  position: relative;
  background: transparent;
  padding: 18px 0 24px 24px;
  gap: 0;
}

/* Spine stitch — vertical 4px wide gold thread down the ledger's left
   edge, mimicking the bound spine of a record book. Repeating-linear-
   gradient makes the visible "thread segments" with paper showing
   between them. */
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

.theme-kao .chapter-rule {
  position: relative;
  display: block;
  margin: 18px 12px 14px 4px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0,
    color-mix(in srgb, var(--archive-gold) 32%, transparent) 14%,
    color-mix(in srgb, var(--archive-gold) 32%, transparent) 86%,
    transparent 100%
  );
}

.theme-kao .chapter-rule__label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: var(--archive-paper);
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--archive-gold) 76%, transparent);
  white-space: nowrap;
}

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

/* Folio page number — top-left marginalia. Not a row number: this is a
   book page label, in sans, smaller than kicker, near-invisible ink.
   Sans per the "no LXGW for ≤ 12px metadata" rule (UI-DETAIL1 S-3). */
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

/* Meta (display-name + msg-time) — sans, 11px, ink 48%. UI-DETAIL1 §S-3
   says LXGW must not be used for ≤ 13px counters / metadata. */
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

/* Role kicker — 14px LXGW italic weight 500, displayed as block above
   the body (not inline), with role-specific ink. The signature now reads
   like a record-book author line, not a faded pre-body fragment. */
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
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1.75;
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
</style>
