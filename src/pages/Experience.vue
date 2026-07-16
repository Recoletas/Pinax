<template>
  <div class="game-page">
    <!-- K3 (2026-06-27): drop the 3-region workstation grid. It
         crammed 260px + 1fr + 300px into one row and forced every
         element to fight for width. Replace with a 2-region layout:
         a slim topstrip (not sticky, not 80px) + a single working
         column (dialogue + input) + a right dossier column. The
         narrator hero portrait moves into the dossier header so the
         left rail is gone entirely; the working column breathes. -->
    <div class="ws-layout">
      <section v-if="!showSessionPicker" class="ws-topstrip" aria-label="案卷进度条">
<!-- E16: 2-segment topstrip. Left = page title only (no chip
                with 卷 / 任务 / 第 N 共 M — was redundant decoration
                pulling eye from the dialogue). Right = session chip
                + settings link. The session chip carries the
                identifying info, the title is the page landmark. -->
          <div class="ws-topstrip__main">
            <span class="ws-topstrip__title">体验</span>
          </div>
          <div class="ws-topstrip__actions">
            <button
              class="ws-topstrip__settings-link"
              type="button"
              :disabled="!hasSelectedWorldbook"
              :title="hasSelectedWorldbook ? '修改当前世界设定' : '先选择世界'"
              :aria-disabled="(!hasSelectedWorldbook).toString()"
              aria-label="打开结构化设定"
              @click="router.push({ name: 'settings-structured' })"
            >设定</button>
            <div class="ws-topstrip__session-chip" :title="sessionTitleTooltip">
              <span class="ws-topstrip__session-chip-label">{{ currentSessionLabel }}</span>
              <button
                class="ws-topstrip__session-chip-btn"
                type="button"
                aria-label="切换会话"
                @click="showSessionPicker = true"
              >切换</button>
            </div>
          </div>
        </section>
      <main v-if="!showSessionPicker" class="ws-center-stage" aria-label="记录流">
        <!-- UI-E13-BIG1: local demo banner — shown when isDemoMode
             (no real messages yet). Replaces the previous "AI 配置
             不完整" empty error with a usable local state: 3-scene
             script + 继续 / 切场景 buttons that don't depend on AI.
             When the user clicks 继续, useLocalDemo.applyLocalAction
             returns a synthetic event payload; Experience.vue calls
             handleLocalDemoEvent to push it into gameStore.messages
             so GamePanel re-renders the same chat surface. -->
        <section
          v-if="meta.isDemoMode"
          class="ws-demo-banner"
          aria-label="本地演示场景"
        >
          <div class="ws-demo-banner__head">
            <span class="ws-demo-banner__kicker">本地演示</span>
            <span class="ws-demo-banner__scene">{{ demoSceneTitle }}</span>
            <span class="ws-demo-banner__step">{{ demoStepLabel }}</span>
          </div>
          <p class="ws-demo-banner__hint">未配置 AI, 切到本地手动推进。下方按钮不依赖网络, 仅改写 localStorage 与当前会话。</p>
          <div class="ws-demo-banner__actions">
            <button class="action-btn primary" type="button" @click="handleLocalDemoEvent('continue')">继续</button>
            <button class="action-btn" type="button" @click="handleLocalDemoEvent('scene')">切场景</button>
          </div>
        </section>
        <!-- UI-E10-CLEAN: .scene-stage__indicator sticky indicator deleted
             2026-06-22 — was v-if gated on sceneIndicatorVisible (total > 0),
             so the orientation the user needed in 0-message empty state
             was missing. UI-E11 (workstation) replaces with an always-on
             topstrip. -->
        <GamePanel
          @show-inline-detail="handleInlineDetail"
          @quick-action="handleQuickAction"
        />
        <InputArea @send="handleSend" />
      </main>
      <aside v-if="!showSessionPicker" class="ws-right-rail" aria-label="右栏档案">
        <!-- E17: right rail is now a live codex index. It does not
             mount three always-open tool panels. 人物/地点/事件 stay
             collapsed by default, show count/latest/+N, and reveal
             compact details only after a deliberate click. -->
        <header class="ws-dossier-bar">
          <span class="ws-dossier-bar__label">现场索引</span>
          <button
            class="ws-dossier-bar__quick-cta"
            type="button"
            :disabled="meta.isDemoMode"
            :title="meta.isDemoMode ? '本地演示中，无需记录' : '快速记一段速记'"
            :aria-disabled="meta.isDemoMode.toString()"
            aria-label="打开速记面板"
            @click="quickNoteOpen = true"
          >速记</button>
        </header>
        <section class="ws-live-codex" aria-label="现场索引">
          <article
            v-for="section in codexSections"
            :key="section.key"
            class="ws-codex-section"
            :class="{
              'ws-codex-section--open': activeCodexSection === section.key,
              'ws-codex-section--has-update': section.update > 0
            }"
          >
            <div
              class="ws-codex-section__trigger"
              role="button"
              tabindex="0"
              :aria-expanded="(activeCodexSection === section.key).toString()"
              @click="toggleCodexSection(section.key)"
              @keydown.enter.prevent="toggleCodexSection(section.key)"
              @keydown.space.prevent="toggleCodexSection(section.key)"
            >
              <span class="ws-codex-section__label">{{ section.label }}</span>
              <span class="ws-codex-section__count">{{ section.count }}</span>
              <span v-if="section.update > 0" class="ws-codex-section__new">+{{ section.update }}</span>
              <span class="ws-codex-section__latest">{{ section.latest }}</span>
              <button
                type="button"
                class="ws-codex-section__quick-detail"
                :aria-label="`查看${section.label}详情`"
                @click.stop="openCodexDetail(section.key)"
                @keydown.enter.stop="openCodexDetail(section.key)"
                @keydown.space.stop="openCodexDetail(section.key)"
              >查看</button>
            </div>

            <div v-if="activeCodexSection === section.key" class="ws-codex-section__body">
              <TimeQuickRail
                v-if="section.key === 'time'"
                class="ws-codex-time-rail"
              />
              <StatusBar
                v-else-if="section.key === 'characters'"
                rail-mode="codex"
                @open-detail="openCodexDetail"
              />
              <GeographyPanel
                v-else-if="section.key === 'locations'"
                rail-mode="codex"
                @open-detail="openCodexDetail"
                @add-location="handleRailAddLocation"
              />
              <QuestLog
                v-else
                rail-mode="codex"
                @open-detail="openCodexDetail"
                @open-place="openPlaceContext"
              />
            </div>
          </article>
        </section>
      </aside>
      <SessionPicker
        v-if="showSessionPicker"
        :busy="isStarting"
        @select="handleSessionSelect"
        @create="handleSessionCreate"
        @delete="handleSessionDelete"
      />
    </div>

    <!-- K3: floating quick-notes-rail removed — the dossier hero 速记
         CTA in the right rail now owns this action, so the fixed
         floating button (which fought with the topstrip + the dossier
         hero) is gone. toggleQuickNoteWorkspace just sets
         quickNoteOpen=true, same effect. -->

    <Transition name="modal-fade">
      <div v-if="quickNoteOpen" class="quick-note-workspace-overlay" @click.self="quickNoteOpen = false">
        <Transition name="modal-scale" appear>
          <section class="quick-note-workspace">
            <FolioSurface as="div" variant="paper" :decorated="false" class="quick-note-workspace-header-wrap">
              <header class="quick-note-workspace-header">
                <div>
                  <div class="quick-note-workspace-kicker">体验素材</div>
                  <h3 class="quick-note-workspace-title">速记与对话导入</h3>
                </div>
                <button class="quick-note-close" type="button" @click="quickNoteOpen = false" aria-label="关闭速记面板">×</button>
              </header>
            </FolioSurface>

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
                  <button class="action-btn primary" type="button" @click="saveQuickNoteAsAsset">保存素材</button>
                  <button class="action-btn" type="button" @click="clearQuickNoteDraft">清空</button>
                </div>
              </section>

              <aside class="quick-note-dialogue-panel">
                <div class="quick-note-panel-head">
                  <span>对话段</span>
                  <button class="action-btn" type="button" @click="toggleQuickNoteImport">
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
                  <button
                    class="action-btn primary"
                    type="button"
                    :disabled="dialogueImportStats.selectedCount === 0"
                    @click="importSelectedDialogueSegments"
                  >导入速记</button>
                  <button
                    class="action-btn"
                    type="button"
                    :disabled="dialogueImportStats.selectedCount === 0"
                    @click="saveSelectedDialogueSegmentsAsAsset"
                  >存为素材</button>
                  <button
                    class="action-btn"
                    type="button"
                    :disabled="dialogueImportStats.selectedCount === 0"
                    @click="gameStore.clearQuickNoteMessageSelection"
                  >清空选择</button>
                </div>
                <div v-if="quickNoteStatus" class="quick-note-workspace-tip">{{ quickNoteStatus }}</div>
              </aside>
            </div>
          </section>
        </Transition>
      </div>
    </Transition>

    <Character v-if="showCharacter" @close="showCharacter = false" />

    <!-- UI-E18: codex detail drawer — central detail surface for the
         3 right-rail sections (人物 / 地点 / 事件). Each codex rail
         summary emits `open-detail` with its section key; Experience
         renders the FULL component (no rail-mode) inside this drawer
         so all original fields stay editable. Detail lives behind a
         deliberate open — the right rail never auto-expands into a
         full editor. -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="codexDetailSection"
          class="ws-codex-detail-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="codexDetailLabel"
          @click.self="closeCodexDetail"
        >
          <Transition name="modal-scale" appear>
            <section class="ws-codex-detail-panel" :data-section="codexDetailSection">
              <header class="ws-codex-detail-header">
                <span class="ws-codex-detail-kicker">现场索引 · 详情</span>
                <h2 class="ws-codex-detail-title">{{ codexDetailLabel }}</h2>
                <button
                  type="button"
                  class="ws-codex-detail-close"
                  aria-label="关闭详情"
                  @click="closeCodexDetail"
                >×</button>
              </header>
              <div class="ws-codex-detail-body">
                <TimeSettings
                  v-if="codexDetailSection === 'time'"
                  inline
                  hide-close
                  @close="closeCodexDetail"
                />
                <StatusBar
                  v-else-if="codexDetailSection === 'characters'"
                />
                <GeographyPanel
                  v-else-if="codexDetailSection === 'locations'"
                  :auto-expand-id="lastAddedLocationId"
                />
                <QuestLog
                  v-else-if="codexDetailSection === 'events'"
                  @open-place="openPlaceContext"
                />
              </div>
            </section>
          </Transition>
        </div>
      </Transition>
    </Teleport>

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
      kicker="当场顾问"
      title="从这里继续推进"
      body="我先看当前世界、开场现场和最近对话，再给你一个更紧的推进切口。"
      avatarLabel="场"
      caption="当场顾问"
      captionHint="继续冒险"
      @open="openAdvisorFromAction"
    />

    <!-- 内联事件详情弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="inlineDetail" class="inline-detail-overlay" @click.self="closeInlineDetail">
          <Transition name="modal-scale" appear>
            <FolioSurface as="div" variant="chrome" :decorated="false">
              <div class="inline-detail-card">
                <header class="inline-detail-header">
                  <CharacterPortrait
                    pose-id="speaker-thumb"
                    size="thumb"
                    :caption="inlineDetail?.speaker || '对话人'"
                  />
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
            </FolioSurface>
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
import { computed, onMounted, onUnmounted, proxyRefs, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { useGeographyStore } from '../stores/geographyStore'
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
import TimeSettings from '../components/TimeSettings.vue'
import TimeQuickRail from '../components/TimeQuickRail.vue'
import FolioSurface from '@/components/folio/FolioSurface.vue'
import CharacterPortrait from '@/components/folio/CharacterPortrait.vue'
import MechanismPanel from '../components/MechanismPanel.vue'
import MilestoneModal from '../components/MilestoneModal.vue'
import SessionPicker from '../components/SessionPicker.vue'
import { getTextItem, removeItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { ASSET_KINDS, addNarrativeAsset, getAssetKindLabel } from '../services/narrativeAssets'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { clearPlayableWorldEntryIntent } from '../services/playableWorldEntry'
import { useWorkstationMeta } from '@/composables/useWorkstationMeta'
import {
  applyOnlineNarrativeCompletion,
  applyOnlineRuntimePatch,
  buildOnlineRuntimePatch
} from '../services/onlineExperienceBridge'

const props = defineProps({
  onlineSession: { type: Object, default: null }
})

const gameStore = useGameStore()
const worldStore = useWorldStore()
const geographyStore = useGeographyStore()
const router = useRouter()
// UI-E11-A: workstation topstrip / left rail / right rail all read from
// this single source of truth. Replaces the 6 record-folio computeds
// (recordCaseNo / recordVolume / recordTime / recordCharacters /
// recordLocation / recordObjective) that previously drove the deleted
// 6-cell record-folio band.
const meta = proxyRefs(useWorkstationMeta())
const { advisorOpen, advisorMessages, advisorLoading, askAdvisor, openAdvisor: openAdvisorPanel, closeAdvisor } = useAdvisor()
const onlineRequestIds = new Set()
let onlineUnsubscribers = []

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

// UI-E10: sticky scene-stage indicator data — counts messages and derives
// UI-E10-CLEAN: sceneStageIndicator + sceneIndicatorVisible computeds deleted
// 2026-06-22 — sticky indicator above the ledger is gone (template + CSS);
// UI-E11 (workstation) replaces with an always-on topstrip section anchor.
const sidebarCollapsed = ref(false)
const showSessionPicker = ref(false)
const isStarting = ref(false)
const activeCodexSection = ref('events')
const codexUpdates = ref({
  time: 0,
  characters: 0,
  locations: 0,
  events: 0
})
const codexDetailSection = ref(null)
const lastAddedLocationId = ref('')
const codexDetailLabels = {
  time: '时间设定',
  characters: '在场人物',
  locations: '地点卷',
  events: '事件卷'
}
const codexDetailLabel = computed(() => codexDetailLabels[codexDetailSection.value] || '详情')

function openCodexDetail(sectionKey) {
  if (!sectionKey) return
  codexDetailSection.value = sectionKey
  if (typeof gameStore.setQuickNoteImportMode === 'function') {
    gameStore.setQuickNoteImportMode(false)
  }
  quickNoteImportOpen.value = false
  closeAdvisor()
}

function openPlaceContext({ placeId, target } = {}) {
  if (!placeId) return
  const routeName = target === 'settings' ? 'settings-structured' : 'settings-world-map'
  router.push({ name: routeName, query: { placeId } })
}

function closeCodexDetail() {
  codexDetailSection.value = null
  lastAddedLocationId.value = ''
}

function handleRailAddLocation(newId) {
  // UI-E18-B round 3: codex rail 添加 button emitted a fresh location id.
  // Stash it + open the locations detail drawer so the new card auto-expands
  // and the description textarea is immediately editable.
  lastAddedLocationId.value = newId
  openCodexDetail('locations')
}
const currentSessionLabel = computed(() => {
  const sid = gameStore.currentSessionId
  if (!sid) return '无会话'
  const s = gameStore.sessions.find(s => s.id === sid)
  return s?.title || '未命名会话'
})
const sessionTitleTooltip = computed(() => {
  const s = gameStore.sessions.find(s => s.id === gameStore.currentSessionId)
  if (!s) return '切换或新建会话'
  const count = gameStore.sessions.length
  return `${s.title || '未命名会话'} · 共 ${count} 个会话`
})
const recordProgressLabel = computed(() => {
  if (meta.isEmpty) return '暂无记录'
  return `第 ${meta.currentSection} / 共 ${meta.totalCount} 条`
})
const demoSceneTitle = computed(() => {
  return meta.demoScene?.title || meta.demoScene?.location || '本地演示'
})
const demoStepLabel = computed(() => {
  const total = Number(meta.demoEventsCount || 0)
  if (!total) return '0 / 0'
  return `${Number(meta.demoEventIndex || 0) + 1} / ${total}`
})

const codexCharacterCount = computed(() => (gameStore.encounteredCharacters || []).length)
const codexLocationCount = computed(() => (geographyStore.locations || []).length)
const codexEventCount = computed(() => {
  return (gameStore.activities || []).length + (gameStore.plotJournal || []).length
})

const latestCharacterLabel = computed(() => {
  const list = gameStore.encounteredCharacters || []
  const latest = list[list.length - 1]
  return latest?.name || latest?.displayName || gameStore.playerName || '未登记角色'
})

const latestLocationLabel = computed(() => {
  const locations = geographyStore.locations || []
  const latest = locations[locations.length - 1]
  return latest?.name || gameStore.worldMapState?.currentScene || meta.demoScene?.title || '暂无地点'
})

const latestEventLabel = computed(() => {
  const latestActivity = (gameStore.activities || [])[0]
  const latestPlot = (gameStore.plotJournal || [])[0]
  return latestActivity?.title || latestPlot?.title || latestPlot?.summary || '暂无事件'
})

const codexTimeCount = computed(() => {
  const t = gameStore.writingTime || {}
  return (t.eraName || t.year || t.month || t.day) ? 1 : 0
})

const codexTimeLatest = computed(() => {
  const t = gameStore.writingTime || {}
  const era = t.eraName || t.eraId || ''
  if (!t.year && !t.month && !t.day) return '未登记'
  const eraStr = era ? `${era} ` : ''
  return `${eraStr}${t.year || '?'}年${t.month || '?'}月${t.day || '?'}日`
})

const codexSections = computed(() => [
  {
    key: 'time',
    label: '时间',
    count: codexTimeCount.value,
    latest: codexTimeLatest.value,
    update: codexUpdates.value.time
  },
  {
    key: 'characters',
    label: '人物',
    count: codexCharacterCount.value,
    latest: latestCharacterLabel.value,
    update: codexUpdates.value.characters
  },
  {
    key: 'locations',
    label: '地点',
    count: codexLocationCount.value,
    latest: latestLocationLabel.value,
    update: codexUpdates.value.locations
  },
  {
    key: 'events',
    label: '事件',
    count: codexEventCount.value,
    latest: latestEventLabel.value,
    update: codexUpdates.value.events
  }
])

function toggleCodexSection(section) {
  activeCodexSection.value = activeCodexSection.value === section ? '' : section
  if (section && codexUpdates.value[section]) {
    codexUpdates.value = { ...codexUpdates.value, [section]: 0 }
  }
}

function trackCodexCount(key, count) {
  watch(
    () => count.value,
    (next, previous) => {
      if (typeof previous !== 'number') return
      if (next > previous && activeCodexSection.value !== key) {
        codexUpdates.value = {
          ...codexUpdates.value,
          [key]: codexUpdates.value[key] + (next - previous)
        }
      }
    }
  )
}

trackCodexCount('time', codexTimeCount)
trackCodexCount('characters', codexCharacterCount)
trackCodexCount('locations', codexLocationCount)
trackCodexCount('events', codexEventCount)

// Record-folio 6-field header REMOVED 2026-06-23 (UI-E11-A):
//   recordCaseNo / recordVolume / recordTime / recordCharacters /
//   recordLocation / recordObjective computeds were the empty-state
//   surface for the deleted 6-cell record-folio band. The 5 derived
//   values they exposed are now provided by useWorkstationMeta
//   (currentVolume / caseNo / currentTask / currentSection / totalCount).
//   No store mutation — useWorkstationMeta reads gameStore fields only.

// UI-E11-A + UI-E12-W1: handle quick-action CTA emits from GamePanel
// 0-state hero (续写 / 速记 / 切场景). v0 wired only 'note' to the
// existing quickNoteOpen flow (per E11-A PLAN-QA Fix #2). UI-E12-W1
// wires 'continue' (focus the workstation input) and 'scene' (scroll
// chat to top so the user can review earlier scene context).
// UI-E13-BIG1: when isDemoMode, 'continue' / 'scene' now drive
// useLocalDemo.applyLocalAction (local progression, no AI needed);
// when real messages exist, fall back to the input-focus / scroll
// behavior. This is the per-brief "≥1 button has real local
// behavior" — both 继续 and 切场景 are real local.
function handleQuickAction(action) {
  if (action === 'note') {
    quickNoteOpen.value = true
    return
  }
  if (action === 'continue' || action === 'scene') {
    if (meta.isDemoMode) {
      handleLocalDemoEvent(action)
      return
    }
    if (action === 'continue') {
      const input = document.querySelector('.ws-center-stage .input')
      if (input && typeof input.focus === 'function') {
        input.focus()
      }
      return
    }
    if (action === 'scene') {
      const chat = document.querySelector('.ws-center-stage .chat-container')
      if (chat && typeof chat.scrollTo === 'function') {
        chat.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }
  }
}

// UI-E13-BIG1: local demo event handler. Bridges useLocalDemo (which
// doesn't know about gameStore) and gameStore.messages (which GamePanel
// reads). The flow:
//   1. user clicks 继续 / 切场景 in the demo banner
//   2. applyLocalAction mutates useLocalDemo's sceneIndex / eventIndex
//      (persisted to localStorage)
//   3. buildEventMessage returns a synthetic event payload compatible
//      with the chat surface (role + content + timestamp)
//   4. gameStore.messages.push pushes it into the chat so GamePanel
//      re-renders. This is a pure-append push, no store schema
//      change (per E10 hard rules).
function handleLocalDemoEvent(action) {
  const event = meta.applyLocalAction(action)
  if (!event) return
  const msg = meta.buildEventMessage(event)
  if (!msg) return
  // gameStore doesn't have an explicit "append one message" method
  // that doesn't trigger an AI request, so we do it through the
  // existing save-current-session flow that handleSend uses. Read
  // the in-memory array, push, and persist.
  if (Array.isArray(gameStore.messages)) {
    gameStore.messages.push(msg)
    // Persist via the existing saveCurrentSession if it exists,
    // otherwise rely on the next user action to trigger a save.
    if (typeof gameStore.saveCurrentSession === 'function') {
      try { gameStore.saveCurrentSession() } catch (e) { /* ignore */ }
    }
  }
}

onMounted(async () => {
  window.addEventListener('story-mechanism-ready', handleMechanismReady)

  await worldStore.loadWorldbooksIndex()
  gameStore.loadSessions()

  const activeSession = gameStore.sessions.find((session) => session.id === gameStore.currentSessionId) || null
  const targetWorldbookId = worldStore.activeWorldbookId || ''
  const allLatestSession = !activeSession && Array.isArray(gameStore.sessions) && gameStore.sessions.length
    ? [...gameStore.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    : null
  const worldbookLatestSession = !activeSession && targetWorldbookId
    ? gameStore.getLatestSessionForWorldbook(targetWorldbookId)
    : null
  const latestStoredSession = worldbookLatestSession || allLatestSession
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

  bindOnlineSession()
})

onUnmounted(() => {
  window.removeEventListener('story-mechanism-ready', handleMechanismReady)
  clearMechanismNotice()
  onlineUnsubscribers.forEach((unsubscribe) => unsubscribe?.())
  onlineUnsubscribers = []
})

watch(() => worldStore.activeWorldbookId, (nextId) => {
  const normalized = nextId || ''
  if (selectedWorldbookId.value !== normalized) {
    selectedWorldbookId.value = normalized
  }
})

function openWorldbookQuickImport() {
  router.push({ name: 'settings-worldbook' })
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
  if (isStarting.value) return
  try {
    isStarting.value = true
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
  } finally {
    isStarting.value = false
  }
}

async function handleSessionCreate() {
  if (isStarting.value) return
  try {
    isStarting.value = true
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
  } finally {
    isStarting.value = false
  }
}

async function handleSessionDelete(session) {
  if (isStarting.value) return
  try {
    isStarting.value = true
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
  } finally {
    isStarting.value = false
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
  return quickNoteOpen.value || advisorOpen.value || Boolean(inlineDetail.value) || Boolean(codexDetailSection.value)
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
  if (props.onlineSession) {
    if (!props.onlineSession.isConnected?.value) return
    props.onlineSession.proposeAction?.(text)
    return
  }
  await gameStore.sendAction(text, options)
}

function bindOnlineSession() {
  const adapter = props.onlineSession?.adapter
  if (!adapter) return
  onlineUnsubscribers.forEach((unsubscribe) => unsubscribe?.())
  onlineUnsubscribers = [
    adapter.onNarrativeRequested(handleOnlineNarrativeRequested),
    adapter.onNarrativeCompleted((payload) => {
      applyOnlineNarrativeCompletion(gameStore, payload)
    }),
    adapter.onRuntimePatchAccepted((payload) => {
      applyOnlineRuntimePatch(gameStore, payload)
    })
  ]
}

async function handleOnlineNarrativeRequested(payload = {}, event = {}) {
  if (!props.onlineSession?.isHost?.value) return
  const requestEventId = String(event.id || payload.requestEventId || '').trim()
  const actionText = String(payload.text || '').trim()
  if (!requestEventId || !actionText || onlineRequestIds.has(requestEventId)) return
  if (gameStore.messages.some((message) => message?.onlineRequestEventId === requestEventId)) return
  onlineRequestIds.add(requestEventId)

  try {
    const messageStart = gameStore.messages.length
    await gameStore.sendAction(actionText)
    const generated = gameStore.messages
      .slice(messageStart)
      .findLast((message) => message?.role === 'assistant' && String(message?.content || '').trim())
    if (!generated) {
      onlineRequestIds.delete(requestEventId)
      return
    }

    for (const message of gameStore.messages.slice(messageStart)) {
      message.onlineRequestEventId = requestEventId
    }
    gameStore.saveCurrentSession?.()
    const runtimePatch = buildOnlineRuntimePatch(gameStore.getRuntimeSnapshot?.() || {})
    props.onlineSession.adapter.submitHostCompletion({
      requestEventId,
      actionText,
      assistantMessage: {
        role: 'assistant',
        name: generated.name || '',
        content: generated.content,
        timestamp: generated.timestamp || Date.now()
      },
      createdAt: Date.now()
    })
    props.onlineSession.adapter.submitAcceptedRuntimePatch(runtimePatch)
  } catch {
    onlineRequestIds.delete(requestEventId)
  }
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
  isolation: isolate;
  /* UI-E18-FIX2: was `height: 100vh; min-height: 100vh;` which forced
     game-page to start at top-of-app-shell AND extend 100vh, so when
     AppShell's shell-mast (~67px desktop / ~149px mobile) sits above
     game-page, the bottom of game-page extends below the viewport and
     InputArea gets clipped by `overflow: hidden`. Now: `flex: 1 1
     auto; min-height: 0` lets game-page fill shell-content exactly
     (AppShell is now a bounded flex column with height: 100vh; overflow:
     hidden). `min-height: 0` is critical — without it, flex children
     refuse to shrink below their content's intrinsic height, which
     re-introduces overflow. */
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* K6 (2026-06-27): 默认主题去掉 accent-rose / accent-amber 暖色
     角部叠加 (这是 kao 主题1 的 SaaS 配色痕迹, 跟蓝白档案册
     不搭). 改用 --archive-olive / --archive-gold 派生 (冷色 dossier
     调). 跟 .ws-topstrip / .ws-right-rail 的 --archive-paper-soft
     底色一致. */
  background:
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--archive-olive) 14%, transparent), transparent 24%),
    radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--archive-gold) 12%, transparent), transparent 22%),
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, var(--archive-paper)), color-mix(in srgb, var(--archive-paper) 92%, var(--archive-paper-strong)));
  color: var(--archive-ink);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif);
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

/* UI-E12-F: quick-note input bumped 13 → 14px / 1.65 → 1.7 for
   readable product feel. Scoped CSS is the source of truth for
   the quick-note workspace (separate from workstation center
   stage); kept out of kao.css because the workspace is a modal,
   not a page column. */
.quick-note-workspace-input {
  flex: 1;
  min-height: 240px;
  resize: none;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
  color: var(--text-primary);
  padding: 12px;
  font-size: 14px;
  line-height: 1.7;
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
  /* UI-E12-F: bumped 12 → 13px / 1.45 → 1.55 so the dialogue
     preview row in the quick-note workspace reads as a usable
     product preview, not as a faint label. */
  font-size: 13px;
  line-height: 1.55;
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

/* Phase 1C archive-folio overrides
   5C v3.5: drop the page-level gradient + ::before / ::after pseudo
   overlays. <CharacterBackdrop> is now the page background; the
   folio chrome frame is gone (translucent panel reads through the
   art). */
.game-page {
  color: var(--archive-ink);
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
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 88%, var(--archive-paper)) 0 68%, color-mix(in srgb, var(--archive-gold) 92%, var(--archive-olive)) 68% 100%);
  color: var(--archive-ink);
}

.action-btn.primary:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 68%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 84%, var(--archive-paper)) 0 66%, color-mix(in srgb, var(--archive-gold-soft) 96%, var(--archive-olive)) 66% 100%);
  color: var(--archive-ink);
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sidebar-head-copy span {
  color: color-mix(in srgb, var(--archive-gold-soft) 84%, var(--archive-paper));
}

.sidebar-head-copy strong {
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
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

@media (max-width: 760px) {
  .action-btn {
    height: 28px;
    padding: 0 10px;
    font-size: 11px;
  }
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

<style>

.theme-kao .game-page .sidebar-head-copy span {
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  letter-spacing: 0.18em;
}

.theme-kao .game-page .sidebar-head-copy strong {
  color: var(--archive-ink);
}

/* UI-K4 (2026-06-27): default (blue-white dossier) theme rules for
   the workstation classes that K2 added in kao.css under `.theme-kao`.
   Under default, those classes would render unstyled (no grid, no
   border, no padding) — exactly the "旧工具页" regression the user
   reported. These rules mirror the kao.css layout / token recipe
   (same colors via the --archive-* tokens, same `·` separator stamp
   language, same grid proportions) but are gated by :not(.theme-kao)
   so they only apply in default mode. When .theme-kao is on the root,
   :not(.theme-kao) is false for every element (root is always an
   ancestor), so kao.css takes over and these rules are inert.

   Specificity: .not(.theme-kao).X is (0,2,0), equal to .theme-kao.X.
   Cascade order: kao.css is imported in main.js (loaded before any
   component <style>), so the unscoped :not(.theme-kao) block here
   only matches in default mode and is structurally inert in kao. */
</style>

<style>
/* Workstation layout — default (blue-white dossier) variant.
   K2 / K3 added the template skeleton (ws-layout + ws-topstrip +
   ws-center-stage + ws-right-rail + ws-dossier-hero + ws-section);
   the K2 visual rules live in kao.css under .theme-kao. These
   :not(.theme-kao) rules reproduce the same token recipe in default
   mode so the page reads as a steel-blue dossier, not an unstyled
   HTML page. */

:not(.theme-kao) .ws-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  grid-template-rows: auto 1fr;
  /* UI-E18-FIX2: was `min-height: 100vh` which forced ws-layout to
     be at least viewport-tall, ignoring game-page's flex layout.
     Now: flex:1 fills game-page's flex column space; min-height:0
     allows shrinking below content so the grid 1fr row distributes
     correctly between topstrip + center. Center always ends at
     game-page bottom = viewport bottom (with the AppShell change). */
  flex: 1 1 auto;
  min-height: 0;
  align-items: stretch;
  padding: 14px 16px 16px 64px;
  gap: 12px;
}

:not(.theme-kao) .ws-topstrip {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 16px;
  background: var(--archive-paper-soft);
  border: 1px solid var(--hairline-soft);
  border-bottom: 1px solid var(--hairline-soft);
  color: var(--archive-ink);
  font-family: var(--font-sans, "Segoe UI Variable", "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif);
  border-radius: 4px;
}

:not(.theme-kao) .ws-topstrip__main {
  display: inline-flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
  flex: 1 1 auto;
}

:not(.theme-kao) .ws-topstrip__title {
  font-family: var(--font-display, "ZCOOL XiaoWei", "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--archive-ink);
  white-space: nowrap;
}

:not(.theme-kao) .ws-topstrip__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-body, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 13px;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:not(.theme-kao) .ws-topstrip__chip-kicker {
  color: var(--archive-olive);
  font-weight: 600;
}

:not(.theme-kao) .ws-topstrip__chip-value {
  color: var(--archive-ink);
  font-weight: 500;
}

:not(.theme-kao) .ws-topstrip__chip-tail {
  color: color-mix(in srgb, var(--archive-ink-soft) 88%, transparent);
  font-size: 12px;
}

:not(.theme-kao) .ws-topstrip__chip-sep {
  color: color-mix(in srgb, var(--archive-gold) 50%, transparent);
  font-weight: 400;
}

:not(.theme-kao) .ws-topstrip__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

:not(.theme-kao) .ws-topstrip__settings-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 2px 12px 2px 18px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink) 82%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}

:not(.theme-kao) .ws-topstrip__settings-link::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: color-mix(in srgb, var(--archive-rose) 70%, transparent);
  font-weight: 900;
}

:not(.theme-kao) .ws-topstrip__settings-link:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--archive-rose) 44%, var(--border));
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-paper-soft) 70%, transparent);
}

:not(.theme-kao) .ws-topstrip__settings-link:hover:not(:disabled)::before {
  color: var(--archive-rose);
}

:not(.theme-kao) .ws-topstrip__settings-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:not(.theme-kao) .ws-topstrip__session-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 2px 4px 2px 12px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink);
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
}

:not(.theme-kao) .ws-topstrip__session-chip-label {
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:not(.theme-kao) .ws-topstrip__session-chip-btn {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink) 82%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

:not(.theme-kao) .ws-topstrip__session-chip-btn:hover {
  border-color: var(--archive-rose);
  color: var(--archive-ink);
}

:not(.theme-kao) .ws-center-stage {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--archive-paper-soft);
  border: 1px solid var(--hairline-soft);
  border-radius: 4px;
  overflow: hidden;
}

/* UI-E18-FIX: E18 made prose / rp-* / scene-break visible, but the
   workstation center stage still uses GamePanel.vue's `.chat-container {
   height: 100% }` (E10-era). In a flex column, `height: 100%` resolves
   to 100% of parent, pushing InputArea below the visible viewport.
   The page-level `bottomAnchor.scrollIntoView()` then scrolls the
   document, not the chat region, so the input is never naturally
   pinned to the bottom. Kao theme already has this exact fix at
   kao.css L2432 + L2694 (`.theme-kao .ws-center-stage > .chat-container
   { flex:1 1 auto; min-height:0; height:auto; overflow-y:auto }` +
   `.theme-kao .ws-center-stage > .input-area { flex-shrink:0 }`).
   This rule mirrors those two in default mode so the input always
   stays visible at the bottom of the center stage, and the chat
   region becomes the internal scroll surface. */
:not(.theme-kao) .ws-center-stage > .chat-container {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  overflow-y: auto;
}

:not(.theme-kao) .ws-center-stage > .input-area {
  flex-shrink: 0;
  align-self: stretch;
}

:not(.theme-kao) .ws-right-rail {
  grid-row: 2;
  grid-column: 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0;
  background: var(--archive-paper-soft);
  border: 1px solid var(--hairline-soft);
  border-radius: 4px;
  overflow: hidden;
  color: var(--archive-ink);
}

:not(.theme-kao) .ws-dossier-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--hairline-soft);
  background: color-mix(in srgb, var(--archive-paper) 80%, transparent);
}

:not(.theme-kao) .ws-dossier-bar__label {
  font-family: var(--font-sans, sans-serif);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
}

:not(.theme-kao) .ws-dossier-bar__quick-cta {
  min-height: 22px;
  padding: 1px 9px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink) 82%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 11px;
  cursor: pointer;
}

:not(.theme-kao) .ws-dossier-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--archive-paper);
  border-bottom: 1px solid var(--hairline-soft);
}

:not(.theme-kao) .ws-dossier-hero > .character-portrait {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

:not(.theme-kao) .ws-dossier-hero__quick-cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 12px 4px 18px;
  /* K6 (2026-06-27): 默认主题 border 改 archive-olive (冷色 dossier 调,
     不再用 archive-rose 暖色, archive-rose 留给 kao 主题 印章色
     + 跟 K0 audit §3.4 "印章必须有温度" 一致). */
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink) 82%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

:not(.theme-kao) .ws-dossier-hero__quick-cta::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: color-mix(in srgb, var(--archive-olive) 70%, transparent);
  font-weight: 900;
}

:not(.theme-kao) .ws-dossier-hero__quick-cta:hover:not(:disabled) {
  border-color: var(--archive-olive);
  color: var(--archive-ink);
}

:not(.theme-kao) .ws-dossier-hero__quick-cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:not(.theme-kao) .ws-section {
  position: relative;
  display: block;
  padding: 12px 14px;
  background: var(--archive-paper-soft);
  border: 0;
  border-top: 1px solid var(--hairline-soft);
}

:not(.theme-kao) .ws-section:first-of-type {
  border-top: 0;
}

:not(.theme-kao) .ws-live-codex {
  display: grid;
  gap: 6px;
  padding: 8px;
  overflow: auto;
}

:not(.theme-kao) .ws-codex-section {
  border: 1px solid color-mix(in srgb, var(--archive-olive) 14%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 56%, transparent);
}

:not(.theme-kao) .ws-codex-section--open {
  background: color-mix(in srgb, var(--archive-paper-soft) 88%, transparent);
  border-color: color-mix(in srgb, var(--archive-olive) 30%, var(--border));
}

:not(.theme-kao) .ws-codex-section__trigger {
  width: 100%;
  min-height: 48px;
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  padding: 7px 9px;
  border: 0;
  background: transparent;
  color: var(--archive-ink);
  text-align: left;
  cursor: pointer;
}

:not(.theme-kao) .ws-codex-section__label {
  font-size: 12px;
  font-weight: 700;
}

:not(.theme-kao) .ws-codex-section__count,
:not(.theme-kao) .ws-codex-section__new {
  min-width: 20px;
  justify-self: start;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  padding: 1px 5px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

:not(.theme-kao) .ws-codex-section__new {
  border-color: color-mix(in srgb, var(--archive-rose) 32%, var(--border));
  color: var(--archive-rose);
}

:not(.theme-kao) .ws-codex-section__latest {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--archive-ink-soft) 90%, transparent);
  font-size: 12px;
}

:not(.theme-kao) .ws-codex-section__body {
  padding: 0 8px 8px;
}

:not(.theme-kao) .ws-demo-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  /* K6 (2026-06-27): 默认主题去掉 archive-amber 暖色 (kao 主题1
     痕迹), 改 archive-olive / archive-gold 冷色. */
  background: color-mix(in srgb, var(--archive-olive) 6%, var(--archive-paper-soft));
  border: 1px dashed color-mix(in srgb, var(--archive-olive) 36%, var(--border));
  border-radius: 4px;
  margin: 12px;
  color: var(--archive-ink);
}

:not(.theme-kao) .ws-demo-banner__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

:not(.theme-kao) .ws-demo-banner__kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  /* K6 (2026-06-27): 默认主题去掉 archive-amber 暖色, 改 olive 冷色 */
  color: var(--archive-olive);
}

:not(.theme-kao) .ws-demo-banner__scene {
  font-family: var(--font-display, serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--archive-ink);
}

:not(.theme-kao) .ws-demo-banner__step {
  margin-left: auto;
  font-size: 11px;
  color: var(--archive-ink-soft);
  font-variant-numeric: tabular-nums;
}

:not(.theme-kao) .ws-demo-banner__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
}

:not(.theme-kao) .ws-demo-banner__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 980px) {
  :not(.theme-kao) .ws-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
    padding: 12px 12px 16px 56px;
  }

  :not(.theme-kao) .ws-topstrip {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  :not(.theme-kao) .ws-topstrip__actions {
    justify-content: flex-end;
  }

  :not(.theme-kao) .ws-right-rail {
    grid-row: 3;
    grid-column: 1;
  }
}

@media (max-width: 640px) {
  :not(.theme-kao) .ws-layout {
    padding: 10px 10px 14px 52px;
  }

  :not(.theme-kao) .ws-topstrip__session-chip-label {
    max-width: 100px;
  }
}

/* UI-E4A: dedupe right-rail section labels.
   The dossier-stamp kicker above is the canonical first-read title
   ("卷宗一 · 在场人物" etc.). The internal sub-panel header text
   in StatusBar (.status-header text), GeographyPanel (.panel-kicker +
   .panel-heading), and QuestLog (.panel-header > span text) duplicates
   the same field name and competes for visual weight. In kao mode we
   hide the redundant text and let the dossier-stamp own the title.
   Functional sub-elements (avatars, time row, count badge, expand
   icons) all stay visible — only the decorative title text is removed.
   The .game-page scope keeps this from leaking to ProseEssay /
   Settings / Character which also use .panel-header but are not
   mounted under .game-page. Same pattern as the dossier-stamp rule
   above: no scoped global, no broad deep selector, no layer-override
   keyword. */
.theme-kao .game-page .status-header > span:last-child {
  display: none;
}
.theme-kao .game-page .geo-title-block {
  display: none;
}
.theme-kao .game-page .panel-header > span:not(.count-badge) {
  display: none;
}

/* UI-E18: codex detail drawer — central detail surface for the 3
   codex rail sections. Lives in Experience.vue (page-owned) so the
   3 child components keep their existing modal anchors and own
   data mutations. Scoped CSS keeps .ws-codex-detail-* class names
   from leaking to other pages. */
.ws-codex-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--archive-ink) 38%, transparent);
  backdrop-filter: blur(2px);
}

.ws-codex-detail-panel {
  width: min(620px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 26%, var(--border));
  border-radius: 6px;
  background: var(--archive-paper-soft);
  box-shadow: 0 24px 56px color-mix(in srgb, var(--archive-ink) 28%, transparent);
  color: var(--archive-ink);
  overflow: hidden;
}

.ws-codex-detail-header {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 12px 18px 11px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 78%, transparent);
}

.ws-codex-detail-kicker {
  font-family: var(--font-sans, sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--archive-olive);
}

.ws-codex-detail-title {
  margin: 0;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 18px;
  font-weight: 600;
  color: var(--archive-ink);
  flex: 1;
  min-width: 0;
}

.ws-codex-detail-close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border));
  border-radius: 4px;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink) 70%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 18px;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

.ws-codex-detail-close:hover {
  border-color: var(--archive-olive);
  color: var(--archive-olive-strong);
}

.ws-codex-detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
}

/* UI-E18-B (round 2): trigger 行 内置 "查看" 微按钮 — 不需要先展开
   才能看到入口. 整行仍是 toggle 按钮 (grid-row trigger), 微按钮用
   nested <button> + @click.stop 抢 click, 不触发 expand. */
.ws-codex-section__quick-detail {
  justify-self: end;
  min-width: 38px;
  min-height: 22px;
  padding: 1px 9px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 28%, var(--border));
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: var(--archive-olive-strong);
  font-family: var(--font-sans, sans-serif);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.ws-codex-section__quick-detail:hover {
  border-color: var(--archive-olive);
  background: color-mix(in srgb, var(--archive-olive) 9%, var(--archive-paper-soft));
  color: var(--archive-olive-strong);
}

.ws-codex-time-rail {
  display: grid;
  gap: 6px;
}

@media (max-width: 640px) {
  .ws-codex-detail-overlay {
    padding: 10px;
  }

  .ws-codex-detail-panel {
    width: 100%;
    max-height: calc(var(--app-viewport-height, 100vh) - 20px);
  }

  .ws-codex-detail-title {
    font-size: 16px;
  }
}
</style>
