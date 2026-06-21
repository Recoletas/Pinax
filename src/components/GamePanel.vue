<template>
  <div class="chat-container" ref="scrollContainer">
    <template v-for="(spread, sIdx) in messageSpreads" :key="`spread-${sIdx}`">
      <div
        v-if="sIdx > 0"
        class="chapter-rule"
        :data-chapter-label="`卷 ${recordVolume} · 第 ${sIdx + 1} 页`"
        aria-hidden="true"
      >
        <span class="chapter-rule__label">卷 {{ recordVolume }} · 第 {{ sIdx + 1 }} 页</span>
      </div>

      <!-- Book spread — 对开页。每一个 user→assistant 对话回合是一张对开页:
           左页 = user 行为 / 提问 / 决策 (短),右页 = 旁白叙事 (长);
           中间有 1px 装订 spine 分隔;顶部 page header (日期/卷次/角色印章),
           底部 ink stamp footer;长旁白超过阈值自动续到下页 (data-continued="1" 上加 续 字样)。
           连续 user-user / assistant-assistant / system-compression / 空对话
           退化为 single-page spread (左页有内容, 右页空 = "另一半留给下一步落笔")。
           这是 UI-E9 的核心结构性改动:把 ledger 从单列 chat 流改成真正翻开的对开本。 -->
      <article
        class="ledger-spread"
        :class="[
          { 'ledger-spread--single': spread.left && !spread.right },
          { 'ledger-spread--empty': !spread.left && !spread.right }
        ]"
        :aria-label="`对开页 ${sIdx + 1}`"
      >
        <!-- 红色稿纸红线 — 左侧 page 28px 处 (像 wall__dossier 的 margin rule).
             视觉上让左页"像写在稿纸上",而不是裸卡片。 -->
        <div class="ledger-spread__red-rule" aria-hidden="true"></div>

        <!-- 顶部 page header — 三段式: 日期 / 卷次 / 角色印章 -->
        <header class="ledger-spread__page-header">
          <span class="ledger-spread__page-date">{{ spreadHeaderDate(spread) }}</span>
          <span class="ledger-spread__page-volume">第 {{ sIdx + 1 }} 页 · 卷 {{ recordVolume }}</span>
          <span class="ledger-spread__page-stamp">{{ spreadHeaderStamp(spread) }}</span>
        </header>

        <div class="ledger-spread__sheets">
          <!-- 左页 — 短行为 / 决策 -->
          <section
            v-if="spread.left"
            class="ledger-spread__left-page"
            :class="`ledger-spread__page--${spread.left.role}`"
          >
            <div
              class="msg-item"
              :class="[
                spread.left.role,
                {
                  'import-picked': gameStore.quickNoteImportMode && gameStore.quickNoteSelectedMessageIndexes.includes(spread.leftIndex),
                  'compression-complete': isCompressionCompleteMessage(spread.left)
                }
              ]"
              :data-global-index="spread.leftIndex"
            >
              <template v-if="isCompressionCompleteMessage(spread.left)">
                <div class="msg-column">
                  <div class="msg-header">
                    <span class="display-name">档案员</span>
                    <span class="msg-time">{{ formatTime(spread.left.timestamp) }}</span>
                  </div>
                  <div class="text-wrapper">
                    <div class="context-compression-complete">
                      <span class="context-compression-pulse"></span>
                      <span class="context-compression-text">{{ spread.left.content }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="msg-column">
                  <span
                    v-if="!isCompressionCompleteMessage(spread.left)"
                    class="msg-item__folio"
                    :data-folio-page="spread.leftIndex + 1"
                    aria-hidden="true"
                  >页 {{ spread.leftIndex + 1 }}</span>
                  <div class="msg-header">
                    <span class="display-name">{{ displayName(spread.left) }}</span>
                    <span class="msg-time">{{ formatTime(spread.left.timestamp) }}</span>
                  </div>
                  <div
                    class="text-wrapper"
                    @click="onTextWrapperClick(spread.leftIndex, spread.left, $event)"
                  >
                    <div
                      v-if="editingIndex === spread.leftIndex"
                      class="edit-area"
                    >
                      <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
                      <div class="edit-footer">
                        <button class="tavern-btn primary" @click="saveEdit(spread.leftIndex)">保存修改</button>
                        <button class="tavern-btn" @click="editingIndex = -1">取消</button>
                      </div>
                    </div>
                    <div
                      v-else
                      class="text-main"
                      v-html="renderMessageContent(spread.left, spread.leftIndex)"
                    ></div>
                  </div>
                </div>
              </template>
            </div>
          </section>
          <section v-else class="ledger-spread__left-page ledger-spread__page--blank" aria-hidden="true">
            <div class="ledger-spread__blank-note">· 另起一页 ·</div>
          </section>

          <!-- 中间 spine — 1px 装订线 (继承 chat-container::before 的 spine stitch 风格,
               但这里只画 1px solid 让 spread 内部有"翻页中缝"的视觉)。
               不是把整个容器再画一遍,只是 spread 内部分页。 -->
          <div class="ledger-spread__spine" aria-hidden="true"></div>

          <!-- 右页 — 长旁白叙事. 长内容自动续页. -->
          <section
            v-if="spread.right"
            class="ledger-spread__right-page"
            :class="`ledger-spread__page--${spread.right.role}`"
          >
            <div
              v-if="spread.continued"
              class="ledger-spread__continued-mark"
              aria-hidden="true"
            >续 · 接上页</div>
            <div
              class="msg-item"
              :class="[
                spread.right.role,
                {
                  'import-picked': gameStore.quickNoteImportMode && gameStore.quickNoteSelectedMessageIndexes.includes(spread.rightIndex),
                  'compression-complete': isCompressionCompleteMessage(spread.right)
                }
              ]"
              :data-global-index="spread.rightIndex"
            >
              <template v-if="isCompressionCompleteMessage(spread.right)">
                <div class="msg-column">
                  <div class="msg-header">
                    <span class="display-name">档案员</span>
                    <span class="msg-time">{{ formatTime(spread.right.timestamp) }}</span>
                  </div>
                  <div class="text-wrapper">
                    <div class="context-compression-complete">
                      <span class="context-compression-pulse"></span>
                      <span class="context-compression-text">{{ spread.right.content }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="msg-column">
                  <span
                    v-if="!isCompressionCompleteMessage(spread.right)"
                    class="msg-item__folio"
                    :data-folio-page="spread.rightIndex + 1"
                    aria-hidden="true"
                  >页 {{ spread.rightIndex + 1 }}</span>
                  <div class="msg-header">
                    <span class="display-name">{{ displayName(spread.right) }}</span>
                    <span class="msg-time">{{ formatTime(spread.right.timestamp) }}</span>
                  </div>
                  <div
                    class="text-wrapper"
                    @click="onTextWrapperClick(spread.rightIndex, spread.right, $event)"
                  >
                    <div
                      v-if="editingIndex === spread.rightIndex"
                      class="edit-area"
                    >
                      <textarea v-model="editText" class="tavern-textarea" ref="editTextarea"></textarea>
                      <div class="edit-footer">
                        <button class="tavern-btn primary" @click="saveEdit(spread.rightIndex)">保存修改</button>
                        <button class="tavern-btn" @click="editingIndex = -1">取消</button>
                      </div>
                    </div>
                    <div
                      v-else
                      class="text-main"
                      v-html="renderMessageContent(spread.right, spread.rightIndex)"
                    ></div>
                  </div>
                </div>
              </template>
            </div>
          </section>
          <section v-else class="ledger-spread__right-page ledger-spread__page--blank" aria-hidden="true">
            <div class="ledger-spread__blank-note">· 留白待续 ·</div>
          </section>
        </div>

        <!-- 底部 ink stamp — 圆形压印, 像 wall__stamp 风格. 每 spread 一个,
             强化"档案员手盖的章"的语义, 而不只是卡片 footer. -->
        <footer class="ledger-spread__ink-stamp" aria-hidden="true">
          <span class="ledger-spread__ink-stamp-text">录</span>
        </footer>
      </article>
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

// === UI-E9 book spread structure ======================================
// Pair adjacent user + assistant messages into a "spread" — an opened
// book page with a left sheet (the player's move / decision, usually
// short) and a right sheet (the narrator's reply, usually long). The
// pair rule:
//   - walk messages left to right; user→assistant pairs into one spread
//     where user is left sheet and assistant is right sheet
//   - when two adjacent messages share the same role (user→user or
//     assistant→assistant) or one of them is a system / compression
//     divider, fall back to a single-page spread (left sheet only)
//   - when a spread's right assistant content exceeds the
//     LONG_ASSISTANT_CHARS threshold, mark it as "continued" and the
//     template renders the 续 · 接上页 mark on the right sheet
//   - recordVolume derives from the spread count instead of message
//     count, so the chapter-rule ribbon above each spread re-climbs
//     naturally
// gameStore.messages stays the single source of truth — messageSpreads
// is a pure derived layout, no store mutation.
// =======================================================================
const LONG_ASSISTANT_CHARS = 280

const isStandaloneMessage = (msg) => {
  if (!msg) return true
  if (isCompressionCompleteMessage(msg)) return true
  return false
}

const messageSpreads = computed(() => {
  const msgs = gameStore.messages || []
  const spreads = []
  let i = 0
  while (i < msgs.length) {
    const cur = msgs[i]
    const nxt = msgs[i + 1]
    if (cur && nxt
        && cur.role === 'user'
        && nxt.role === 'assistant'
        && !isStandaloneMessage(cur)
        && !isStandaloneMessage(nxt)) {
      // Pair: user (left) + assistant (right). If assistant content is
      // long, mark spread as continued so the template renders the 续
      // mark above the right sheet.
      const assistantChars = String(nxt.content || '').length
      spreads.push({
        left: cur,
        right: nxt,
        leftIndex: i,
        rightIndex: i + 1,
        continued: assistantChars > LONG_ASSISTANT_CHARS
      })
      i += 2
    } else {
      // Single-page spread: this message occupies the left sheet,
      // right sheet shows the "留白待续" note. Compression-complete
      // messages and lone user / assistant entries fall through here.
      spreads.push({
        left: cur,
        right: null,
        leftIndex: i,
        rightIndex: -1,
        continued: false
      })
      i += 1
    }
  }
  return spreads
})

const recordVolume = computed(() => {
  // Climb the volume number with spread count, not raw message count,
  // so a long conversation visibly climbs the 卷 number printed in
  // the chapter-rule ribbon. Cap at 99 for safety.
  const total = messageSpreads.value.length
  if (total <= 1) return 1
  return Math.min(99, total)
})

const spreadHeaderDate = (spread) => {
  // The date comes from whichever side has a timestamp; prefer right
  // (assistant reply time) so the header reads as "when this page was
  // written".
  const ts = (spread.right && spread.right.timestamp)
    || (spread.left && spread.left.timestamp)
    || Date.now()
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const spreadHeaderStamp = (spread) => {
  if (!spread.left && !spread.right) return '空白'
  if (spread.left && spread.right) return '对录 · 双页'
  if (spread.left && isCompressionCompleteMessage(spread.left)) return '档案员 · 备忘'
  if (spread.left && spread.left.role === 'user') return '我 · 落笔'
  if (spread.left && spread.left.role === 'assistant') return '旁白 · 续页'
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

/* UI-E9 BOOK SPREAD — 对开页主容器
   ============================================================================
   The ledger now reads as a stack of opened book pages, not a chat feed.
   Each <article.ledger-spread> is one open spread:
     - 2-column grid (left sheet / spine / right sheet) so the player's
       decision and the narrator's reply sit on opposing pages, the way
       a paper record-book does when you flip it open
     - a vertical red margin rule at 28px (like wall__dossier 稿纸红线)
       reinforces the "writing on lined paper" feel
     - a 3-segment page header (date / volume / role stamp) at the top
     - a round ink-stamp footer (像 wall__stamp) so each spread ends with
       a "档案员 hand-pressed 录 seal" instead of just being a card
     - single-page mode (left only / right shows "留白待续") when a
       conversation entry has no pair
   Reuses the existing E6A folio / kicker / msg-item inside each sheet.
   No new tokens, no new global theme selector, no important flag. */
.theme-kao .ledger-spread {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 8px;
  padding: 22px 18px 28px 38px;
  margin-bottom: 18px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper) 92%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper-soft) 86%, transparent) 100%);
  border: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 60%, transparent),
    0 1px 0 color-mix(in srgb, var(--archive-ink) 10%, transparent);
}

.theme-kao .ledger-spread--single {
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper-soft) 92%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper) 86%, transparent) 100%);
}

/* Red 稿纸 margin rule — sits inside the spread at 28px from the left
   edge, runs the height of the sheets row, in the same rose color as
   wall__dossier::before. Pure visual marker, not a hit target. */
.theme-kao .ledger-spread__red-rule {
  position: absolute;
  top: 64px;
  bottom: 56px;
  left: 28px;
  width: 1px;
  background: color-mix(in srgb, var(--archive-rose) 52%, transparent);
  pointer-events: none;
  z-index: 1;
}

/* Page header — 3-segment strip across the top of the spread.
   Sans 11px / 12px / 10px, gold-soft ink, paper-soft backing. */
.theme-kao .ledger-spread__page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 8px;
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 32%, transparent);
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
}

.theme-kao .ledger-spread__page-volume {
  flex: 1 1 auto;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: color-mix(in srgb, var(--archive-gold) 78%, transparent);
}

.theme-kao .ledger-spread__page-stamp {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 10px;
  color: color-mix(in srgb, var(--archive-rose) 78%, transparent);
}

/* Sheets — 2-column grid with a 1px spine in the middle. The spine is
   a thin 1px gold-soft column instead of repeating-linear-gradient so
   it reads as "page gutter" not "threaded binding". */
.theme-kao .ledger-spread__sheets {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: 80px;
}

.theme-kao .ledger-spread__spine {
  background: color-mix(in srgb, var(--archive-ink) 28%, transparent);
  pointer-events: none;
}

/* Each sheet is a section that hosts one msg-item (or a blank note).
   The existing E6A .msg-item styling still applies inside. */
.theme-kao .ledger-spread__left-page,
.theme-kao .ledger-spread__right-page {
  display: block;
  padding: 12px 14px 16px;
  position: relative;
  min-height: 64px;
}

.theme-kao .ledger-spread__left-page {
  border-right: none;
  padding-left: 4px;
}

.theme-kao .ledger-spread__right-page {
  padding-left: 18px;
}

/* Blank — "留白待续" / "另起一页" notes when one side has no content. */
.theme-kao .ledger-spread__page--blank {
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-kao .ledger-spread__blank-note {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: color-mix(in srgb, var(--archive-ink-soft) 52%, transparent);
  writing-mode: horizontal-tb;
  user-select: none;
  pointer-events: none;
}

/* Continued mark — sits above the right sheet when the assistant
   reply is longer than the long-content threshold (UI-E9: 280 chars).
   Reads as "续 · 接上页", italic LXGW, small rose-soft ink. */
.theme-kao .ledger-spread__continued-mark {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: color-mix(in srgb, var(--archive-rose) 72%, transparent);
  padding: 0 0 6px 4px;
  border-bottom: 1px dotted color-mix(in srgb, var(--archive-rose) 28%, transparent);
  margin-bottom: 8px;
}

/* Ink-stamp footer — circular 录 seal pressed on the bottom-right of
   the spread, like wall__stamp. Rotated -8deg for a hand-stamped feel.
   Reinforces the "档案员 sealed this page" semantic. */
.theme-kao .ledger-spread__ink-stamp {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 4px;
  pointer-events: none;
}

.theme-kao .ledger-spread__ink-stamp-text {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid color-mix(in srgb, var(--archive-rose) 84%, transparent);
  color: color-mix(in srgb, var(--archive-rose) 90%, transparent);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.04em;
  background:
    radial-gradient(circle at 30% 30%, transparent 0 4px,
      color-mix(in srgb, var(--archive-rose) 14%, transparent) 6px 100%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--archive-rose) 28%, transparent),
    0 1px 2px color-mix(in srgb, var(--archive-ink) 24%, transparent);
  transform: rotate(-8deg);
  user-select: none;
}

/* Inside each sheet, the existing .msg-item needs to drop its old
   border-left (3px role bar) because the sheet's own red rule + spine
   already separate roles visually. Keep the role-color hint on the
   message header / kicker instead so the role still reads. */
.theme-kao .ledger-spread .msg-item {
  background: transparent;
  border-left: none;
  padding: 0;
  margin-bottom: 0;
  box-shadow: none;
}

.theme-kao .ledger-spread .msg-item__folio {
  position: static;
  display: inline-block;
  margin-bottom: 4px;
}

.theme-kao .ledger-spread .msg-header {
  position: static;
  margin-bottom: 6px;
  padding-bottom: 0;
}

/* === UI-E6A record-book ledger overrides — preserved below ===
   The book-spread (UI-E9) layer above sits on top of these. */
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

/* Reduced-motion a11y — book spread inherits the same disable pattern
   as existing E6A animations (no transitions on spread surfaces). */
@media (prefers-reduced-motion: reduce) {
  .theme-kao .ledger-spread,
  .theme-kao .ledger-spread__ink-stamp-text {
    transition: none;
    transform: none;
    animation: none;
  }
}

/* Mobile — collapse spread to single column (left sheet stacks above
   right sheet, spine becomes horizontal divider). Reading stays
   natural on a phone where the spread metaphor would otherwise
   squeeze both sheets to unreadable widths. */
@media (max-width: 720px) {
  .theme-kao .ledger-spread__sheets {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .theme-kao .ledger-spread__spine {
    width: auto;
    height: 1px;
  }
  .theme-kao .ledger-spread__left-page {
    padding-left: 14px;
  }
  .theme-kao .ledger-spread__right-page {
    padding-left: 14px;
  }
  .theme-kao .ledger-spread__red-rule {
    left: 14px;
  }
}
</style>