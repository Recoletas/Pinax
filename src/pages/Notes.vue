<template>
  <div class="writing-page" @click="onGlobalClick">
    <FolioSurface as="header" variant="chrome" :decorated="false" class="writing-page__hero">
      <div class="manuscript-top material-top">
        <div class="manuscript-top__left">
          <button class="manuscript-top__back" @click="goBack" title="返回" aria-label="返回">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
          <div class="manuscript-top__book">
            <span class="manuscript-top__no">素材</span>
            <span class="material-top__count">{{ chapters.length }} 卷 · {{ groupedChapters.length }} 类</span>
          </div>
          <span v-if="selectedAssetSummary" class="manuscript-top__chapter">
            {{ selectedAssetSummary }}
          </span>
          <span v-else-if="checkedAssetIds.length" class="manuscript-top__chapter">
            已选 {{ checkedAssetIds.length }} 项
          </span>
        </div>

        <div class="manuscript-top__right">
          <span class="manuscript-top__chip">{{ statusText }}<template v-if="saveStatus !== 'saving'"> · {{ wordCount.toLocaleString() }} 字</template></span>
          <button class="manuscript-top__tab" type="button" @click.stop="goToAdventure" title="回到冒险">
            冒险
          </button>
          <button class="manuscript-top__tab" type="button" @click.stop="goToWriting" title="返回写作">
            写作
          </button>
          <button class="manuscript-top__tab" type="button" @click="createNewNote" title="新建素材">
            新素材
          </button>
          <!-- 全局锁定主题2亮色：亮/暗切换隐藏（用户要求） -->
          <button v-if="false" class="manuscript-top__mode" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换亮色' : '切换暗色'">
              <svg v-if="isDark" width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
              </svg>
              <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
              </svg>
          </button>
        </div>
      </div>
    </FolioSurface>

    <WorkspacePaneSwitch
      v-model="mobilePane"
      :items="materialMobilePanes"
      label="素材工作区"
      :breakpoint="1100"
    />

    <div class="content-area notes-content-area" :data-mobile-pane="mobilePane">
      <!-- K3 (2026-06-27): notes-content-area 升为 3 列 grid —
           drawer 260px / reading-deck 1fr / 副阅读台 340px.
           副阅读台承担了原 archive-pin 浮卡的位置 + 角色 (列而非角落小标),
           老的 archive-pin 浮卡被新列吞并 (类名沿用以满足既有 UI-N2 契约). -->
      <!-- 左：档案抽屉 (Archive Drawer) -->
      <aside class="material-drawer workspace-sidebar">
        <!-- 7 类抽屉盒 -->
        <div class="drawer-units">
          <section v-for="(group, idx) in groupedChapters" :key="group.kind" class="drawer-unit" :class="{ 'is-collapsed': isAssetKindCollapsed(group.kind) }">
            <button class="drawer-handle workspace-nav-item" type="button" @click="toggleAssetKindGroup(group.kind)" :aria-expanded="!isAssetKindCollapsed(group.kind)">
              <span class="drawer-handle__spine" :style="{ background: group.color }" aria-hidden="true"></span>
              <span class="drawer-handle__roman">{{ groupIndexLabel(idx) }}</span>
              <span class="drawer-handle__title workspace-nav-label">{{ group.label }}</span>
              <span class="drawer-handle__count">{{ group.items.length }}</span>
              <span class="drawer-handle__chevron" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                  <path v-if="isAssetKindCollapsed(group.kind)" d="M3 1.5L6 4.5L3 7.5"/>
                  <path v-else d="M1.5 3L4.5 6L7.5 3"/>
                </svg>
              </span>
            </button>
            <div v-show="!isAssetKindCollapsed(group.kind)" class="drawer-body">
              <!--
                R2-D.2: replace outer <button class="index-card workspace-nav-item"> with a div
                to remove the nested-button Vite warning. Inner <input>
                (checkbox) + <button class="index-card__delete"> stay
                independently focusable. The card-level click keeps the
                same selectChapter semantics via @click + keyboard
                handlers (Enter / Space).
              -->
              <div
                v-for="(note, i) in group.items"
                :key="note.id"
                class="index-card"
                :class="{
                  'is-selected': selectedChapterId === note.id,
                  'is-checked': checkedAssetIds.includes(note.id)
                }"
                :style="{
                  '--card-tilt': ((idx + i) % 3 === 0 ? -1.2 : (idx + i) % 3 === 1 ? 0.65 : -0.35) + 'deg',
                  '--card-shift': ((idx + i) % 2 === 0 ? 0 : 2) + 'px'
                }"
                role="button"
                tabindex="0"
                :aria-label="`素材：${note.title || '无标题素材'}（点击选择）`"
                :aria-selected="selectedChapterId === note.id"
                @click="selectChapter(note.id)"
                @keydown.enter.prevent="selectChapter(note.id)"
                @keydown.space.prevent="selectChapter(note.id)"
              >
                <input
                  class="index-card__check"
                  type="checkbox"
                  :checked="checkedAssetIds.includes(note.id)"
                  :aria-label="`选择 ${note.title || '无标题素材'}`"
                  @click.stop
                  @change="toggleCheckedAsset(note.id)"
                />
                <div class="index-card__body">
                  <span class="index-card__title workspace-nav-label">{{ note.title || '无标题素材' }}</span>
                  <span class="index-card__meta workspace-nav-meta">{{ getAssetStatusLabel(note.status) }}</span>
                </div>
                <span v-if="isAssetOnCanvas(note.id)" class="index-card__canvas-mark" title="已入画布">✓</span>
                <button class="index-card__delete" @click.stop="deleteChapter(note.id)" title="删除素材">×</button>
              </div>
            </div>
          </section>
          <div v-if="groupedChapters.length === 0" class="drawer-empty">
            <span class="drawer-empty__text">抽屉全空 · 等待卷宗</span>
          </div>
        </div>

        <!-- 票根（batch 态） -->
        <Transition name="modal-fade">
          <div v-if="checkedAssetIds.length > 0" class="material-selection-stamp">
            <div class="material-selection-stamp__rail">
              <span class="material-selection-stamp-tick" aria-hidden="true"></span>
              <span class="material-selection-stamp-text">已选 {{ checkedAssetIds.length }} 项 · 批量</span>
              <span class="material-selection-stamp-tick" aria-hidden="true"></span>
            </div>
            <div class="selection-actions" role="group" aria-label="批量处理勾选素材">
              <button class="selection-action-btn material-action-btn primary" type="button" :disabled="checkedAssetIds.length === 0" @click="sendCheckedAssetsToCanvas">送入画布</button>
              <button v-if="checkedAssetIds.length > 1" class="selection-action-btn material-action-btn" type="button" @click="mergeCheckedAssets">合并</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('accepted')">采纳</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('archived')">归档</button>
              <button class="selection-action-btn material-action-btn danger" type="button" @click="deleteCheckedAssets">删除</button>
            </div>
          </div>
        </Transition>
        <p v-if="canvasTransferFeedback" class="canvas-transfer-feedback" role="status" aria-live="polite">
          {{ canvasTransferFeedback }}
        </p>
      </aside>

      <!-- 中：阅读台 (Reading Deck) -->
      <FolioSurface variant="paper" decorated>
        <NotesEditorWorkspace :controller="notesEditorWorkspace" />
      </FolioSurface>

      <!-- 右：副阅读台 (K3 2026-06-27, 替代原 archive-pin 浮卡).
           archive-pin 类名保留以满足 UI-N2 既有契约; 实际语义升级为
           3rd-column 副阅读台 (notes-sidekick), 展示 2-4 张素材摘要.
           旧"一次只看一个"被吸收: 选中态展示同类相关 (排除 active),
           非选中态展示 4 张近期, 都可点击切换. 不实现真实拖拽 (如
           N6/N9/N10 multi-canvas 那样), 只做视觉/交互骨架 -->
      <aside class="archive-pin notes-sidekick" aria-label="副阅读台">
        <span class="archive-pin__nail" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" fill="currentColor"/>
            <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.4" opacity="0.55"/>
          </svg>
        </span>
        <header class="notes-sidekick__header">
          <span class="notes-sidekick__title">副阅读台</span>
          <span class="notes-sidekick__count">
            {{ sidekickWorkspace === 'illustration'
              ? '插画生成'
              : `${sidekickItems.length} 张 · 可点击` }}
          </span>
        </header>
        <nav class="notes-sidekick__modes" aria-label="副工作台模式">
          <button type="button" :class="{ active: sidekickWorkspace === 'materials' }" @click="setSidekickWorkspace('materials')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M3 2.5h10v4H3zM3 9.5h10v4H3z"/>
            </svg>
            相关素材
          </button>
          <button type="button" :class="{ active: sidekickWorkspace === 'illustration' }" @click="setSidekickWorkspace('illustration')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1"/>
              <circle cx="6" cy="6" r="1.2"/>
              <path d="M3.5 12l3.2-3 2.1 1.8 1.7-1.6 2 2"/>
            </svg>
            插画生成
          </button>
          <button type="button" @click="goToComics">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
            </svg>
            漫画制作
          </button>
        </nav>
        <template v-if="sidekickWorkspace === 'materials'">
        <div class="notes-sidekick__list" :role="sidekickItems.length ? 'list' : null" :aria-label="sidekickItems.length ? '相关素材列表' : null">
          <button
            v-for="asset in sidekickItems"
            :key="asset.id"
            type="button"
            class="sidekick-slip"
            :class="{ 'is-active': selectedChapterId === asset.id }"
            :aria-label="`打开 ${asset.title || '无标题素材'}`"
            :aria-current="selectedChapterId === asset.id ? 'true' : 'false'"
            @click="selectChapter(asset.id)"
            role="listitem"
          >
            <span class="sidekick-slip__tab" :style="{ background: getAssetKindColor(asset.kind) }" aria-hidden="true"></span>
            <div class="sidekick-slip__line-1">
              <span class="sidekick-slip__kind">
                {{ getAssetKindLabel(asset.kind) }}
                <span v-if="asset.sidekickReason === 'same-source'" class="sidekick-slip__reason">同来源</span>
              </span>
              <span class="sidekick-slip__status-dot" :style="{ background: getStatusColor(asset.status) }" aria-hidden="true"></span>
            </div>
            <span class="sidekick-slip__title">{{ asset.title || '无标题素材' }}</span>
            <span class="sidekick-slip__preview">{{ (asset.preview || asset.content || '').slice(0, 96) }}<template v-if="(asset.preview || asset.content || '').length > 96">…</template></span>
            <div class="sidekick-slip__line-2">
              <span class="sidekick-slip__status">{{ getAssetStatusLabel(asset.status) }}</span>
              <span class="sidekick-slip__stat">{{ (asset.content || '').length }} 字</span>
            </div>
          </button>
          <div v-if="sidekickItems.length === 0" class="notes-sidekick__empty" role="status">
            暂无同来源素材
          </div>
        </div>
        </template>
        <ImageGenerationWorkbench
          v-else
          class="notes-sidekick__illustration"
          :showHeader="false"
          :storageKey="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
          :selectedText="selectedAsset?.content || currentChapterTitle"
          :sourceTitle="selectedAsset?.title || currentChapterTitle"
          :projectId="selectedAsset?.projectId || null"
          :sourceRefs="selectedAsset ? [{ refType: 'narrative-asset', refId: selectedAsset.id, projectId: selectedAsset.projectId ?? null, excerpt: selectedAsset.content }] : []"
          :referenceCandidates="imageReferenceCandidates"
          :modes="['reference', 'illustration']"
          defaultMode="illustration"
          mediaPurpose="storyboard-reference"
          selectedPromptLabel="当前素材"
          :allowInsertImageToEditor="true"
          @image-preview="showMainVisualPreview"
          @insert-image="insertImageMarkdown"
          @save-to-material="saveGeneratedImageAsset"
          @configs-updated="loadSidekickImageModels"
        />
      </aside>
    </div>

    <!-- 新建素材弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showNewNoteModal" class="modal-overlay" @click.self="showNewNoteModal = false">
        <Transition name="modal-scale" appear>
          <FolioSurface variant="paper" decorated as="div">
          <div class="modal">
            <div class="modal-header">
              <h3>新建素材</h3>
              <button class="modal-close" @click="showNewNoteModal = false">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="input-label">素材标题</label>
              <input
                v-model="newNoteTitle"
                type="text"
                class="input"
                placeholder="输入素材标题"
                ref="newNoteInput"
              />
            </div>
            <div class="modal-footer">
              <button class="btn" @click="showNewNoteModal = false">取消</button>
              <button class="btn-primary" @click="confirmCreateNote" :disabled="!newNoteTitle.trim()">创建</button>
            </div>
          </div>
          </FolioSurface>
        </Transition>
      </div>
    </Transition>

    <GmPersonaLauncher
      kicker="素材顾问"
      title="先收一条线索，再决定导向哪里"
      body="我先看当前素材、状态和画布去向，再帮你判断该采纳、导画布还是继续扩。"
      avatarLabel="材"
      caption="素材顾问"
      captionHint="素材入口"
      :pendingCount="pendingReminderVisible ? pendingReviewCount : 0"
      @open="openAdvisor"
    />

    <AdvisorPanel
      :isOpen="advisorOpen"
      :messages="advisorMessages"
      :results="advisorResults"
      :loading="advisorLoading"
      :quickQuestions="materialAdvisorActions"
      :notice="consistencyNotice"
      :emptyText="'创作顾问可帮你梳理灵感、组织素材，发现素材间的关联与创作方向。'"
      @close="closeAdvisor"
      @ask="handleAskAdvisor"
      @apply-result="applyMaterialAdvisorResult"
      @undo-result="undoMaterialAdvisorResult"
      @dismiss-result="dismissResult($event.id)"
    />

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { sanitizeHtml } from '../utils/sanitize'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useAdvisor } from '../composables/useAdvisor'
import { useCanvasBoard } from '../composables/useCanvasBoard'
import {
  useNotesAssetCatalog,
  useNotesAssetEditor,
  useNotesIllustrationWorkspace,
  useNotesMaterialAdvisor
} from '../composables/useNotesWorkspaceOwners.js'
import {
  AdvisorPanel,
  FolioSurface,
  GmPersonaLauncher,
  ImageGenerationWorkbench,
  NotesEditorWorkspace,
  WorkspacePaneSwitch
} from '../components/notes/notesPageComponents.js'
import { STORAGE_KEYS, getItem } from '../composables/useStorage'
import { useTipState } from '../composables/useTipState'
import { useGameStore } from '../stores/gameStore'
import { htmlToMarkdown, markdownImageDescriptors, markdownToHtml } from '../services/notes/assetMarkdown'
import {
  computeIllustrationFigureView
} from '../services/notes/illustrationPresentation'
import {
  buildNarrativeAssetContentHash,
  DEFAULT_IMAGE_PRESENTATION,
  getAssetKindLabel,
  normalizeImagePresentation,
  updateNarrativeAssetDurable
} from '../services/media/narrativeAssets'
import { createExplorationDocument } from '../services/writing/authoringDocumentRepository.js'
import { findAssetsByContentRefs } from '../services/media/narrativeAssetRetrieval'
import {
  addNarrativeImageAsset,
  getMediaImagePresentation,
  migrateNarrativeImageAssets,
  updateMediaImagePresentation,
  updateNarrativeImagePresentation
} from '../services/media/narrativeImageAssetBridge'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const router = useRouter()
const tip = useTipState()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const {
  advisorOpen,
  advisorMessages,
  advisorResults,
  advisorLoading,
  pendingReviewCount,
  pendingReminderVisible,
  consistencyNotice,
  askAdvisor,
  dismissResult,
  updateAdvisorResultStatus,
  openAdvisor,
  closeAdvisor
} = useAdvisor()
const gameStore = useGameStore()

const showNewNoteModal = ref(false)
const newNoteTitle = ref('')
const newNoteInput = ref(null)
const editorRef = ref(null)
const previewRef = ref(null)
const sidekickWorkspace = ref('materials')
const mobilePane = ref('content')
const materialMobilePanes = [
  { value: 'index', label: '索引' },
  { value: 'content', label: '内容' },
  { value: 'tools', label: '工具' }
]
const illustrationPreview = ref(null)
const sidekickImageModelConfigs = ref([])
const sidekickImageModelId = ref('')

// UI-N10: Multi-card canvas — 取消 N6 的 MAX_PINNED_SLIPS=3 硬限,
// 改为 Infinity (实际 9999), 默认所有素材 visible on canvas.
// 借鉴 Lusion project-list "分层舞台/强空间占位" 思路:
// 1) 主卡 active-card 居中大卡 (1fr 60%)
// 2) slip 区 2-4 张相关素材围绕
// 3) 画布结构始终填满 (空状态 7 类占位 + cross prompt)
// 4) 不再需要 user 点"钉入"按钮 — 选素材就自动入画布
// 保留 N6/N9 拖拽 + z-index + 持久化 (pinnedSlipPositions / NOTES_PINNED_SLIPS_KEY),
// 不破坏 useCanvasBoard composable 签名.
const MAX_PINNED_SLIPS = 9999 // was 3; N10 removes hard cap
const pinnedSlipIds = ref([])
const explicitPinnedSlipIds = ref([])
const pinnedSlipPositions = reactive({})
const boardRef = ref(null)
const NOTES_PINNED_SLIPS_KEY = 'pinax_notes_pinned_slips_v1'

// 钉住素材的资产 (pinned = 用户主动钉, 跟 selectedChapterId 解耦)
// UI-N10: 默认所有素材 visible on canvas — 当 pinnedSlipIds 为空时
// 把 chapters 全部视为 on-canvas (避免大空白).
const pinnedSlipAssets = computed(() => {
  // 空 pinned 列表 → 用 chapters 全部当作默认 on-canvas
  const sourceIds = pinnedSlipIds.value.length > 0
    ? pinnedSlipIds.value
    : chapters.value.map((a) => a.id)
  return sourceIds
    .map((id) => chapters.value.find((a) => a.id === id))
    .filter(Boolean)
})

// UI-N10: slipItemsOnCanvas = 在画布上 + 不为主卡 (selectedChapterId)
// 用于 slip-stack v-for 和 cross-prompt "还有 N 张" 计数
const slipItemsOnCanvas = computed(() => {
  return pinnedSlipAssets.value.filter((a) => a.id !== selectedChapterId.value)
})

const SIDEKICK_MAX_ITEMS = 4
const exactRelatedAssets = computed(() => {
  const selected = chapters.value.find((asset) => asset.id === selectedChapterId.value)
  if (!selected) return []
  const result = findAssetsByContentRefs(selected.sourceRefs, {
    projectId: selected.projectId,
    assets: chapters.value
  })
  return result.exactMatches
    .map((item) => item.asset)
    .filter((asset) => asset.id !== selected.id)
})
const explicitPinnedSlipAssets = computed(() => explicitPinnedSlipIds.value
  .map((id) => chapters.value.find((asset) => asset.id === id))
  .filter((asset) => asset && asset.id !== selectedChapterId.value))
const sidekickItems = computed(() => {
  const items = []
  const seen = new Set()
  for (const asset of explicitPinnedSlipAssets.value) {
    if (seen.has(asset.id)) continue
    seen.add(asset.id)
    items.push({ ...asset, sidekickReason: 'pinned' })
  }
  for (const asset of exactRelatedAssets.value) {
    if (seen.has(asset.id)) continue
    seen.add(asset.id)
    items.push({ ...asset, sidekickReason: 'same-source' })
  }
  return items.slice(0, SIDEKICK_MAX_ITEMS)
})

// useCanvasBoard 提供 6 个 drag/drop handler + layoutItems + styleFor
// items 走 computed, positions 走 reactive (持久化到 localStorage)
// UI-N9: 新增 bringToFront + focusedZId, 点击/拖拽时把 slip 浮到最上层
const {
  onBoardDragOver,
  onBoardDrop
} = useCanvasBoard({
  boardRef,
  items: pinnedSlipAssets,
  positions: pinnedSlipPositions
})

const imageLayoutOptions = [
  { value: 'inline-center', label: '嵌入文字' },
  { value: 'square-left', label: '四周型 · 左侧' },
  { value: 'square-right', label: '四周型 · 右侧' },
  { value: 'tight-left', label: '紧密型 · 左侧' },
  { value: 'tight-right', label: '紧密型 · 右侧' },
  { value: 'top-bottom-center', label: '上下型' },
  { value: 'behind-center', label: '衬于文字下方' },
  { value: 'front-center', label: '浮于文字上方' }
]
const editorFont = ref("'Microsoft YaHei', sans-serif")
const editorFontSize = ref('16px')
const editorBold = ref(false)
const editorItalic = ref(false)
const editorUnderline = ref(false)
const isGeneratingProfessionalInfo = ref(false)

// ---- C1/C2/C3 owner 接线：目录与批量（catalog）、编辑与保存（editor） ----
// editor 只通过窄接口依赖 catalog 的选中态；extractEditorMarkdown/flushVisualPresentation
// 是页面插画域的两个接缝（C7 将随图片呈现一并归位）。
const editorApi = useNotesAssetEditor({
  getSelectedAsset: () => catalogApi.selectedAsset.value,
  getSelectedChapterId: () => catalogApi.selectedChapterId.value,
  extractEditorMarkdown,
  flushVisualPresentation,
  editorRef,
  renderWysiwyg: renderCurrentEditor,
  renderPreview: renderPreviewSurface
})
const catalogApi = useNotesAssetCatalog({
  editor: editorApi,
  onAssetDeselected: resetIllustrationSelection,
  onSelectionChanged: () => { mobilePane.value = 'content' },
  navigate: (location) => router.push(location),
  colorForKind: getAssetKindColor
})
const {
  assetKindOrder,
  chapters,
  selectedChapterId,
  selectedAsset,
  checkedAssetIds,
  collapsedAssetKinds,
  groupedChapters,
  currentAssetIndex,
  canGoPrev,
  canGoNext,
  canvasTransferFeedback,
  mediaGenerationProjectId,
  mediaGenerationSourceRefs,
  refreshCatalog,
  replaceEditorFromPersisted,
  selectChapter,
  goPrevAsset,
  goNextAsset,
  toggleCheckedAsset,
  createAsset,
  setSelectedAssetKind,
  setCheckedAssetsState,
  mergeCheckedAssets,
  deleteChapter,
  deleteCheckedAssets,
  isAssetOnCanvas,
  openSelectedAssetInCanvas,
  sendCheckedAssetsToCanvas,
  generateAndImportToCanvas
} = catalogApi
const {
  currentChapterTitle,
  editorMode,
  markdownContent,
  renderedMarkdownSource,
  renderedMarkdownContent,
  saveStatus,
  statusText,
  previewHtml,
  onContentChange,
  onTitleChange,
  switchEditorMode: switchEditorModeInternal,
  syncMarkdownToEditor,
  getEditorPlainText: getEditorText,
  createMarkdownMediaReference
} = editorApi

const {
  imageContextMenu,
  illustrationSelected,
  selectedIllustrationTarget,
  startIllustrationDrag,
  moveIllustrationDrag,
  finishIllustrationDrag,
  cancelIllustrationDrag,
  selectIllustrationFromEvent,
  showEditorContextMenu,
  chooseImageLayout,
  resetSelection: resetIllustrationInteraction
} = useNotesIllustrationWorkspace({
  editorRef,
  activateFigure: activateIllustrationFigure,
  presentationForTarget,
  applyPresentation: applyImagePresentation,
  textOffsetFromPoint: getTextOffsetFromPoint,
  currentCaretOffset: getCurrentEditorCaretOffset
})

// C6：素材顾问结果采用/撤销 owner（第二条异步来源身份链）
const {
  materialAdvisorActions,
  handleAskAdvisor,
  applyMaterialAdvisorResult,
  undoMaterialAdvisorResult
} = useNotesMaterialAdvisor({
  catalog: catalogApi,
  editor: editorApi,
  advisor: { updateAdvisorResultStatus, askAdvisor }
})

onMounted(() => {
  const initialWorkspace = String(route.query.workspace || 'materials')
  setSidekickWorkspace(initialWorkspace)
  mobilePane.value = initialWorkspace === 'illustration' ? 'tools' : 'content'
  loadSidekickImageModels()
  loadNotesPinnedSlipsPref()
  // C-R2：首次初始化允许显式重装编辑器；迁移晚到只刷新目录/图片投影，不再重装
  refreshCatalog()
  {
    const preferredAssetId = String(route.query.assetId || '')
    const initialAssetId = preferredAssetId && chapters.value.some((asset) => asset.id === preferredAssetId)
      ? preferredAssetId
      : chapters.value[0]?.id || null
    replaceEditorFromPersisted(initialAssetId)
  }
  void migrateNarrativeImageAssets().then(() => {
    refreshCatalog()
  })
  // K3c (2026-06-27): 初始 auto-grow (replaceEditorFromPersisted 触发 selectChapter 同路径,
  // 这里是 belt-and-suspenders)
  nextTick(() => autoResizeTextarea())

  // Phase C6: 首次进入素材库, 若画布空, 弹 "素材入画布" tip
  try {
    const cards = getItem(STORAGE_KEYS.PROSE_CARDS_V1)
    const hasCanvas = Array.isArray(cards) && cards.length > 0
    if (!hasCanvas && !tip.isSeen('materials-to-canvas')) {
      setTimeout(() => {
        tip.showTip({
          id: 'materials-to-canvas',
          title: '素材入画布',
          body: '右上角 "导当前到画布" 可导入选中素材; 勾选多项后用 "送入画布" 批量入画布。',
          cta: {
            label: '去看画布',
            action: () => router.push('/prose-essay')
          },
          variant: 'info',
          autoHide: false,
          category: 'nav'
        })
      }, 800)
    }
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
})

function loadSidekickImageModels(configs = null) {
  const next = Array.isArray(configs) ? configs : listImageProviderConfigs()
  sidekickImageModelConfigs.value = next
  if (!next.some((config) => config.id === sidekickImageModelId.value)) {
    sidekickImageModelId.value = next[0]?.id || ''
  }
}

function setSidekickWorkspace(workspace) {
  const allowedWorkspaces = ['materials', 'illustration']
  sidekickWorkspace.value = allowedWorkspaces.includes(workspace) ? workspace : 'materials'
  if (sidekickWorkspace.value !== 'materials') loadSidekickImageModels()
  mobilePane.value = 'tools'
}

function goToComics() {
  router.push({
    name: 'comics',
    query: selectedChapterId.value ? { assetId: selectedChapterId.value } : {}
  })
}

const mainVisualPreview = computed(() => {
  const generated = illustrationPreview.value
  if (generated?.sourceAssetId === selectedChapterId.value && generated.entry?.data) {
    const entry = generated.entry
    return {
      data: entry.data,
      alt: entry.prompt || selectedAsset.value?.title || '插画',
      label: entry.mediaPurpose === 'storyboard-reference' ? '参考图草稿' : '插画草稿',
      size: entry.width && entry.height ? `${entry.width}×${entry.height}` : '生成图片',
      presentation: normalizeImagePresentation(entry.presentation)
    }
  }

  const image = selectedAsset.value?.image
  if (!image?.data) return null
  return {
    data: image.data,
    alt: selectedAsset.value?.title || '素材图片',
    label: image.purpose === 'comic-panel'
      ? '漫画格'
      : image.purpose === 'illustration'
        ? '插画'
        : '参考图',
    size: image.width && image.height ? `${image.width}×${image.height}` : '素材图片',
    presentation: normalizeImagePresentation(image.presentation)
  }
})
const activeIllustrationPresentation = computed(() => {
  const target = selectedIllustrationTarget.value
  if (target?.source === 'embedded' && target.key) {
    return normalizeImagePresentation(selectedAsset.value?.embeddedImagePresentations?.[target.key])
  }
  return mainVisualPreview.value?.presentation || DEFAULT_IMAGE_PRESENTATION
})
const imageLayoutValue = computed(() => {
  const presentation = activeIllustrationPresentation.value
  return `${presentation.wrap}-${presentation.align}`
})
watch([
  () => selectedChapterId.value,
  () => mainVisualPreview.value?.data || '',
  () => sidekickWorkspace.value
], () => {
  nextTick(() => {
    if (editorMode.value === 'wysiwyg') renderCurrentEditor()
    if (editorMode.value === 'preview') renderPreviewSurface()
  })
})
// C11 + UI-N10：目录变化后先恢复“默认全部上画布”（仅 prefs 为空时），再裁剪已消失 id
watch(chapters, () => {
  if (pinnedSlipIds.value.length === 0 && chapters.value.length > 0) {
    pinnedSlipIds.value = chapters.value.map((asset) => asset.id)
  }
  nextTick(prunePinnedSlipReferences)
})

const imageReferenceCandidates = computed(() => chapters.value
  .filter((asset) => asset.image?.data)
  .map((asset) => ({
    id: `asset_${asset.id}`,
    mediaAssetId: asset.image.mediaAssetId || '',
    title: asset.title || '素材参考图',
    data: asset.image.data,
    mediaPurpose: asset.image.purpose || 'storyboard-reference'
  })))

function showMainVisualPreview(entry) {
  if (!entry?.data || !selectedChapterId.value) return
  const storedPresentation = getMediaImagePresentation(entry.mediaAssetId)
  illustrationPreview.value = {
    sourceAssetId: selectedChapterId.value,
    entry: {
      ...entry,
      presentation: storedPresentation || normalizeImagePresentation(entry.presentation)
    }
  }
  nextTick(refreshIllustrationSurfaces)
}


function illustrationTargetFromFigure(figure) {
  if (!figure) return null
  return {
    source: figure.dataset.imageSource === 'embedded' ? 'embedded' : 'primary',
    key: figure.dataset.imageKey || ''
  }
}

function activateIllustrationFigure(figure, root = editorRef.value) {
  const target = illustrationTargetFromFigure(figure)
  if (target?.source !== 'embedded' || !target.key || !selectedAsset.value) return target
  const stored = selectedAsset.value.embeddedImagePresentations?.[target.key]
  if (!stored) {
    setCurrentImagePresentation(normalizeImagePresentation({
      ...DEFAULT_IMAGE_PRESENTATION,
      anchorOffset: getFigureTextOffset(root, figure)
    }), target)
  }
  return target
}

function presentationForTarget(target = selectedIllustrationTarget.value) {
  if (target?.source === 'embedded' && target.key) {
    return normalizeImagePresentation(selectedAsset.value?.embeddedImagePresentations?.[target.key])
  }
  return mainVisualPreview.value?.presentation || null
}

function setCurrentImagePresentation(presentation, illustrationTarget) {
  if (illustrationTarget?.source === 'embedded' && illustrationTarget.key) {
    const asset = selectedAsset.value
    if (!asset) return null
    asset.embeddedImagePresentations = {
      ...(asset.embeddedImagePresentations || {}),
      [illustrationTarget.key]: presentation
    }
    return { type: 'embedded', id: asset.id, key: illustrationTarget.key }
  }
  const generated = illustrationPreview.value
  if (generated?.sourceAssetId === selectedChapterId.value && generated.entry?.data) {
    illustrationPreview.value = {
      ...generated,
      entry: { ...generated.entry, presentation }
    }
    return { type: 'media', id: generated.entry.mediaAssetId || '' }
  }
  const asset = selectedAsset.value
  if (!asset?.image) return null
  asset.image = { ...asset.image, presentation }
  return { type: 'narrative', id: asset.id }
}

function persistCurrentImagePresentation(target, presentation) {
  if (!target?.id) return
  if (target.type === 'media') updateMediaImagePresentation(target.id, presentation)
  if (target.type === 'narrative') updateNarrativeImagePresentation(target.id, presentation)
  if (target.type === 'embedded') {
    updateNarrativeAssetDurable(target.id, {
      embeddedImagePresentations: selectedAsset.value?.embeddedImagePresentations || {}
    })
  }
}

function applyImagePresentation(patch = {}, persist = true, refresh = true, illustrationTarget = selectedIllustrationTarget.value) {
  const currentPresentation = presentationForTarget(illustrationTarget)
  if (!currentPresentation) return
  const presentation = normalizeImagePresentation({
    ...currentPresentation,
    ...patch
  })
  const target = setCurrentImagePresentation(presentation, illustrationTarget)
  if (persist) persistCurrentImagePresentation(target, presentation)
  if (refresh) nextTick(refreshIllustrationSurfaces)
}


const charCount = computed(() => getEditorText().length)

const wordCount = computed(() => {
  const text = getEditorText().trim()
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
})

const selectedAssetSummary = computed(() => {
  if (!selectedAsset.value) return ''
  const title = String(selectedAsset.value.title || '无标题素材').trim()
  return `${getAssetKindLabel(selectedAsset.value.kind)} · ${title}`
})

const hasChapterSource = computed(() => {
  const src = selectedAsset.value?.source
  return Boolean(src && src.type === 'chapter' && src.chapterId)
})

const sourceRangeLabel = computed(() => {
  const src = selectedAsset.value?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return ''
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && Number.isFinite(length) && length > 0) {
    return `${offset}-${offset + length}`
  }
  if (Number.isFinite(offset) && offset >= 0) {
    return `${offset}+`
  }
  return String(src.chapterId)
})

function goToAdventure() {
  const hasSession = gameStore.currentSessionId
    && gameStore.sessions.some(s => s.id === gameStore.currentSessionId)
  if (hasSession) {
    router.push({ name: 'experience' })
  } else {
    router.push({ name: 'opening' })
  }
}

function goBack() {
  if (!catalogApi.saveOrBlock('返回首页')) return
  router.push('/')
}

function goToWriting() {
  if (!catalogApi.saveOrBlock('返回写作')) return
  router.push({ name: 'writing' })
}

function goToAssetSource() {
  const asset = selectedAsset.value
  const src = asset?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return
  if (!catalogApi.saveOrBlock('前往正文来源')) return
  const query = {
    chapterId: src.chapterId,
    sourceAssetId: asset.id
  }
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && offset >= 0) query.selectorOffset = offset
  if (Number.isFinite(length) && length > 0) query.selectorLength = length
  router.push({ name: 'writing', query })
}

function insertAssetBackToSource() {
  const asset = selectedAsset.value
  const src = asset?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return
  if (!catalogApi.saveOrBlock('回填正文来源')) return
  const query = {
    chapterId: src.chapterId,
    insertAssetId: asset.id
  }
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && offset >= 0) query.selectorOffset = offset
  if (Number.isFinite(length) && length > 0) query.selectorLength = length
  router.push({
    name: 'writing',
    query
  })
}

function createNewNote() {
  showNewNoteModal.value = true
  newNoteTitle.value = ''
  nextTick(() => newNoteInput.value?.focus())
}

function confirmCreateNote() {
  if (!newNoteTitle.value.trim()) return

  // Phase 11：有明确项目上下文的纯文字试写归 Authoring exploration 所有；
  // 素材页继续保留图片、音频、文件及已有 narrative asset 的整理能力。
  const bookId = String(route.query.bookId || '').trim()
  if (bookId) {
    const created = createExplorationDocument(bookId, {
      title: newNoteTitle.value.trim(),
      content: newNoteTitle.value.trim(),
      sourceRefs: ['materials:text-capture']
    })
    if (created.ok) {
      showNewNoteModal.value = false
      router.push({ name: 'authoring', query: { bookId, explorationId: created.document.id, wt3: '1' } })
      return
    }
  }

  const created = createAsset({
    title: newNoteTitle.value.trim(),
    content: newNoteTitle.value.trim(),
    kind: 'inspiration',
    status: 'inbox',
    source: {
      type: 'manual'
    }
  })
  if (!created.ok) {
    canvasTransferFeedback.value = '新建素材未保存（存储写入失败）'
    showNewNoteModal.value = false
    return
  }

  refreshCatalog()
  selectChapter(created.asset.id)
  showNewNoteModal.value = false
}

function getAssetStatusLabel(status) {
  switch (status) {
    case 'accepted':
      return '已采纳'
    case 'archived':
      return '归档'
    case 'rejected':
      return '拒绝'
    default:
      return '待处理'
  }
}

function isAssetKindCollapsed(kind) {
  return Boolean(collapsedAssetKinds.value[kind])
}

function toggleAssetKindGroup(kind) {
  collapsedAssetKinds.value = {
    ...collapsedAssetKinds.value,
    [kind]: !collapsedAssetKinds.value[kind]
  }
}

const GROUP_INDEX_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function groupIndexLabel(idx) {
  return GROUP_INDEX_ROMAN[idx] || String(idx + 1).padStart(2, '0')
}

// UI-N6: Pinned slip methods
// UI-N10: 状态色 (Lusion data-color-bg 三件套的简化版 — 用 archive token)
function getStatusColor(status) {
  switch (status) {
    case 'accepted':
      return 'var(--archive-olive)'
    case 'archived':
      return 'var(--archive-ink-soft)'
    case 'rejected':
      return 'var(--archive-rose)'
    case 'inbox':
    default:
      return 'var(--archive-gold)'
  }
}


// C11：素材目录变化后裁剪钉住引用——已删除/已归档的 id 不再长期留在 localStorage 偏好里
function prunePinnedSlipReferences() {
  const valid = new Set(chapters.value.map((asset) => asset.id))
  const nextIds = pinnedSlipIds.value.filter((id) => valid.has(id))
  const nextExplicit = explicitPinnedSlipIds.value.filter((id) => valid.has(id))
  const stalePositionIds = Object.keys(pinnedSlipPositions).filter((id) => !valid.has(id))
  for (const id of stalePositionIds) delete pinnedSlipPositions[id]
  if (nextIds.length === pinnedSlipIds.value.length
    && nextExplicit.length === explicitPinnedSlipIds.value.length
    && stalePositionIds.length === 0) return
  pinnedSlipIds.value = nextIds
  explicitPinnedSlipIds.value = nextExplicit
  saveNotesPinnedSlipsPref()
}

function loadNotesPinnedSlipsPref() {
  try {
    const raw = localStorage.getItem(NOTES_PINNED_SLIPS_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data?.ids)) {
      pinnedSlipIds.value = data.ids
        .filter((id) => typeof id === 'string')
        .slice(0, MAX_PINNED_SLIPS)
      explicitPinnedSlipIds.value = [...pinnedSlipIds.value]
    }
    if (data?.positions && typeof data.positions === 'object') {
      for (const [id, pos] of Object.entries(data.positions)) {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          pinnedSlipPositions[id] = { x: pos.x, y: pos.y }
        }
      }
    }
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
}

function saveNotesPinnedSlipsPref() {
  try {
    explicitPinnedSlipIds.value = [...pinnedSlipIds.value]
    localStorage.setItem(
      NOTES_PINNED_SLIPS_KEY,
      JSON.stringify({
        ids: pinnedSlipIds.value,
        positions: { ...pinnedSlipPositions }
      })
    )
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
}

function importCurrentToCanvas() {
  openSelectedAssetInCanvas()
}

function getAssetKindColor(kind) {
  switch (kind) {
    case 'draft-prose':
      return '#5b8def'
    case 'event':
      return '#ef5350'
    case 'character-fact':
      return '#f59e0b'
    case 'worldbook-draft':
      return '#66bb6a'
    case 'inspiration':
      return '#ab47bc'
    case 'storyboard-seed':
      return '#26c6da'
    case 'reference-image':
      return '#ff7043'
    default:
      return '#7c92ff'
  }
}

async function saveGeneratedImageAsset(imgEntry) {
  if (!imgEntry?.data) return
  const previewEntry = illustrationPreview.value?.entry
  const presentation = previewEntry && (
    previewEntry.mediaAssetId === imgEntry.mediaAssetId || previewEntry.id === imgEntry.id
  )
    ? previewEntry.presentation
    : imgEntry.presentation
  const currentAssetId = selectedChapterId.value
  const asset = await addNarrativeImageAsset({
    title: (imgEntry.prompt || '素材参考图').slice(0, 24),
    content: imgEntry.prompt || '素材参考图',
    kind: 'reference-image',
    status: 'accepted',
    projectId: mediaGenerationProjectId.value,
    sourceRefs: [...mediaGenerationSourceRefs.value, ...(imgEntry.sourceRefs || [])],
    source: {
      type: 'note-image',
      id: imgEntry.id
    },
    image: {
      id: imgEntry.id,
      mediaAssetId: imgEntry.mediaAssetId,
      storageRef: imgEntry.storageRef,
      purpose: imgEntry.mediaPurpose || 'illustration',
      prompt: imgEntry.prompt,
      data: imgEntry.data,
      negativePrompt: imgEntry.negativePrompt,
      modelName: imgEntry.modelName,
      modelId: imgEntry.modelId,
      modelType: imgEntry.modelType,
      width: imgEntry.width,
      height: imgEntry.height,
      presentation: normalizeImagePresentation(presentation)
    }
  })
  refreshCatalog()
  if (imgEntry.mode === 'comic' && currentAssetId) {
    // 保留当前编辑对象，只刷新目录
  } else {
    selectChapter(asset.id)
  }
}

function insertImageMarkdown(imgEntry) {
  if (!imgEntry?.data && !imgEntry?.mediaAssetId) return
  const alt = String(imgEntry.prompt || selectedAsset.value?.title || '图片').trim() || '图片'
  const reference = imgEntry.mediaAssetId
    ? createMarkdownMediaReference(alt, imgEntry.mediaAssetId)
    : `![${alt}](${imgEntry.data})`
  const imageMarkdown = `\n\n${reference}\n`
  const editor = editorRef.value
  if (editor && typeof editor.selectionStart === 'number' && typeof editor.selectionEnd === 'number') {
    const start = editor.selectionStart
    const end = editor.selectionEnd
    markdownContent.value = `${markdownContent.value.slice(0, start)}${imageMarkdown}${markdownContent.value.slice(end)}`
    nextTick(() => {
      const pos = start + imageMarkdown.length
      editor.focus()
      editor.setSelectionRange(pos, pos)
    })
  } else {
    markdownContent.value = `${markdownContent.value}${imageMarkdown}`
  }
  syncMarkdownToEditor()
  onContentChange()
}

function onRichEditorInput() {
  onContentChange()
  if (mainVisualPreview.value && !editorRef.value?.querySelector('[data-narrative-illustration]')) {
    nextTick(refreshIllustrationSurfaces)
  }
}

function onMarkdownInput() {
  syncMarkdownToEditor()
  onContentChange()
}

function autoResizeTextarea() {
  const ta = editorRef.value
  if (!ta || ta.tagName !== 'TEXTAREA') return
  // 跳过 native field-sizing: content 支持的浏览器 (CSS 已接管)
  const cs = window.getComputedStyle(ta)
  if (cs.fieldSizing === 'content') return
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
}

function onRichEditorKeydown(event) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  document.execCommand('insertText', false, '\t')
}

function onTextAreaKeydown(e) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    markdownContent.value = markdownContent.value.slice(0, start) + '\t' + markdownContent.value.slice(end)
    nextTick(() => {
      ta.setSelectionRange(start + 1, start + 1)
    })
    syncMarkdownToEditor()
    onContentChange()
  }
}

function switchEditorMode(mode) {
  switchEditorModeInternal(mode)
}

// ---- 页面插画域接缝（editor/catalog 通过窄接口回调到这里） ----

// WYSIWYG DOM → 净 markdown（剥离主图/还原内嵌图，保持插画锚点同步）
function extractEditorMarkdown() {
  const anchorOffset = getIllustrationAnchorOffset(editorRef.value)
  if (anchorOffset !== null && mainVisualPreview.value) {
    applyImagePresentation({ anchorOffset }, false, false, { source: 'primary', key: '' })
  }
  const cleanHtml = getEditorHtmlWithoutIllustration(editorRef.value)
  return htmlToMarkdown(cleanHtml)
}

// 保存时把当前插画版式落盘（生成图→媒体仓储；素材图→叙事图片；投影同步）
function flushVisualPresentation(chapter) {
  const presentation = mainVisualPreview.value?.presentation
  const generated = illustrationPreview.value
  if (presentation && generated?.sourceAssetId === chapter.id && generated.entry?.mediaAssetId) {
    updateMediaImagePresentation(generated.entry.mediaAssetId, presentation)
  } else if (presentation && chapter.image) {
    chapter.image = { ...chapter.image, presentation }
    updateNarrativeImagePresentation(chapter.id, presentation)
  }
}

// 切换/清空选择时清理插画选择态（catalog 的 onAssetDeselected 接缝）
function resetIllustrationSelection() {
  resetIllustrationInteraction()
}

function renderCurrentEditor() {
  if (editorMode.value !== 'wysiwyg' || !editorRef.value) return
  const renderSource = renderedMarkdownSource.value === markdownContent.value
    ? renderedMarkdownContent.value
    : markdownContent.value
  editorRef.value.innerHTML = markdownToHtml(renderSource)
  injectIllustrationIntoSurface(editorRef.value, true)
}

function renderPreviewSurface() {
  if (!previewRef.value) return
  previewRef.value.innerHTML = previewHtml.value || ''
  injectIllustrationIntoSurface(previewRef.value, false)
}

function getEditorHtmlWithoutIllustration(root) {
  const clone = root.cloneNode(true)
  clone.querySelectorAll('[data-narrative-illustration]').forEach((element) => {
    if (element.dataset.imageSource !== 'embedded') {
      element.remove()
      return
    }
    const image = element.querySelector('img')
    if (!image) {
      element.remove()
      return
    }
    const markdownSrc = image.dataset.markdownSrc
    if (markdownSrc) image.setAttribute('src', markdownSrc)
    image.removeAttribute('data-markdown-src')
    element.replaceWith(image)
  })
  return sanitizeHtml(clone.innerHTML)
}

function refreshIllustrationSurfaces() {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    injectIllustrationIntoSurface(editorRef.value, true)
  }
  if (editorMode.value === 'preview' && previewRef.value) {
    injectIllustrationIntoSurface(previewRef.value, false)
  }
}

function injectIllustrationIntoSurface(root, interactive) {
  root.querySelectorAll('[data-image-source="primary"]').forEach((element) => element.remove())
  restoreEmbeddedIllustrations(root)
  enhanceEmbeddedIllustrations(root, interactive)

  const visual = mainVisualPreview.value
  if (!visual?.data) return

  const presentation = visual.presentation
  const image = document.createElement('img')
  image.src = visual.data
  image.alt = visual.alt
  const figure = createIllustrationFigure({
    image,
    presentation,
    interactive,
    source: 'primary',
    label: visual.label
  })
  insertIllustrationAtTextOffset(root, figure, presentation.anchorOffset, presentation.wrap)
}

function restoreEmbeddedIllustrations(root) {
  root.querySelectorAll('[data-image-source="embedded"]').forEach((figure) => {
    const image = figure.querySelector('img')
    if (!image) {
      figure.remove()
      return
    }
    figure.replaceWith(image)
  })
}

function enhanceEmbeddedIllustrations(root, interactive) {
  const descriptors = markdownImageDescriptors(markdownContent.value)
  const images = [...root.querySelectorAll('img')]
    .filter((image) => !image.closest('[data-narrative-illustration]'))
  images.forEach((image, index) => {
    const existingKey = image.dataset.imageKey || ''
    const descriptor = descriptors.find((item) => item.key === existingKey)
      || descriptors[index]
      || fallbackImageDescriptor(image, index)
    const storedPresentation = selectedAsset.value?.embeddedImagePresentations?.[descriptor.key]
    const presentation = normalizeImagePresentation(storedPresentation)
    image.dataset.markdownSrc = descriptor.href
    image.dataset.imageKey = descriptor.key
    image.draggable = false
    const figure = createIllustrationFigure({
      image,
      presentation,
      interactive,
      source: 'embedded',
      key: descriptor.key,
      label: descriptor.alt || image.alt || '正文图片'
    })
    image.replaceWith(figure)
    figure.insertBefore(image, figure.firstChild)
    if (storedPresentation) {
      insertIllustrationAtTextOffset(root, figure, presentation.anchorOffset, presentation.wrap)
    }
  })
}

function createIllustrationFigure({ image, presentation, interactive, source, key = '', label }) {
  const selectedTarget = selectedIllustrationTarget.value
  const isSelected = illustrationSelected.value
    && selectedTarget?.source === source
    && (source !== 'embedded' || selectedTarget.key === key)
  // C7：类名/aria/样式为纯视图模型（services/notes/illustrationPresentation），页面只做 DOM 构建
  const view = computeIllustrationFigureView({ presentation, interactive, selected: isSelected, label, src: image.src })

  const figure = document.createElement(view.tagName)
  figure.dataset.narrativeIllustration = 'true'
  figure.dataset.imageSource = source
  if (key) figure.dataset.imageKey = key
  figure.contentEditable = 'false'
  figure.className = view.className
  figure.setAttribute('aria-label', view.ariaLabel)
  if (interactive) figure.title = '拖动图片移动，拖动右下角缩放，右键设置文字环绕'
  for (const [prop, value] of Object.entries(view.style)) {
    if (prop === 'width' || prop === 'left' || prop === 'top') figure.style[prop] = value
    else figure.style.setProperty(prop, value)
  }

  image.draggable = false
  if (source === 'primary') figure.appendChild(image)
  if (interactive) {
    const resizeHandle = document.createElement('span')
    resizeHandle.dataset.illustrationResize = 'true'
    resizeHandle.className = 'illustration-resize-handle'
    resizeHandle.setAttribute('aria-hidden', 'true')
    figure.appendChild(resizeHandle)
  }
  return figure
}

function fallbackImageDescriptor(image, index) {
  const href = image.getAttribute('src') || ''
  return {
    key: `src:${buildNarrativeAssetContentHash(href)}:${index}`,
    href,
    alt: image.alt || ''
  }
}

function insertIllustrationAtTextOffset(root, figure, requestedOffset, wrap) {
  if (['behind', 'front'].includes(wrap)) {
    root.prepend(figure)
    return
  }

  const anchor = findTextAnchor(root, requestedOffset)
  if (!anchor?.node) {
    root.appendChild(figure)
    return
  }
  if (wrap === 'inline') {
    const tail = anchor.node.splitText(anchor.offset)
    tail.parentNode.insertBefore(figure, tail)
    return
  }

  let block = anchor.node.parentNode
  while (block.parentNode && block.parentNode !== root) block = block.parentNode
  root.insertBefore(figure, block)
}

function findTextAnchor(root, requestedOffset) {
  const targetOffset = Math.max(0, Number(requestedOffset) || 0)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  let consumed = 0
  let lastNode = null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('[data-narrative-illustration]')) continue
    lastNode = node
    const length = node.textContent.length
    if (consumed + length >= targetOffset) {
      return { node, offset: Math.max(0, targetOffset - consumed) }
    }
    consumed += length
  }
  return lastNode ? { node: lastNode, offset: lastNode.textContent.length } : null
}

function getIllustrationAnchorOffset(root) {
  const figure = root.querySelector('[data-image-source="primary"]')
  if (!figure || ['behind', 'front'].includes(mainVisualPreview.value?.presentation.wrap)) return null
  return getFigureTextOffset(root, figure)
}

function getFigureTextOffset(root, figure) {
  if (!root || !figure) return 0
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEndBefore(figure)
    return range.toString().length
  } catch {
    return 0
  }
}

function getCurrentEditorCaretOffset() {
  const root = editorRef.value
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  if (!root || !selection?.rangeCount) return null
  const activeRange = selection.getRangeAt(0)
  if (!root.contains(activeRange.startContainer)) return null
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(activeRange.startContainer, activeRange.startOffset)
    return range.toString().length
  } catch {
    return null
  }
}

function getTextOffsetFromPoint(root, clientX, clientY, fallbackOffset = 0) {
  let node = null
  let offset = 0
  const caretPosition = document.caretPositionFromPoint?.(clientX, clientY)
  if (caretPosition) {
    node = caretPosition.offsetNode
    offset = caretPosition.offset
  } else {
    const caretRange = document.caretRangeFromPoint?.(clientX, clientY)
    if (caretRange) {
      node = caretRange.startContainer
      offset = caretRange.startOffset
    }
  }
  if (!node || !root.contains(node)) return fallbackOffset
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return fallbackOffset
  }
}

const notesEditorWorkspace = {
  selectedChapterId,
  assetKindOrder,
  getAssetKindColor,
  groupIndexLabel,
  getAssetKindLabel,
  createNewNote,
  boardRef,
  onBoardDragOver,
  onBoardDrop,
  slipItemsOnCanvas,
  currentAssetIndex,
  chapters,
  sidekickItems,
  checkedAssetIds,
  currentChapterTitle,
  onTitleChange,
  wordCount,
  charCount,
  hasChapterSource,
  selectedAsset,
  goToAssetSource,
  sourceRangeLabel,
  setSelectedAssetKind,
  importCurrentToCanvas,
  isAssetOnCanvas,
  isGeneratingProfessionalInfo,
  generateAndImportToCanvas,
  insertAssetBackToSource,
  editorMode,
  switchEditorMode,
  editorRef,
  editorFont,
  editorFontSize,
  editorBold,
  editorItalic,
  editorUnderline,
  onRichEditorInput,
  onRichEditorKeydown,
  startIllustrationDrag,
  moveIllustrationDrag,
  finishIllustrationDrag,
  cancelIllustrationDrag,
  selectIllustrationFromEvent,
  showEditorContextMenu,
  markdownContent,
  onMarkdownInput,
  onTextAreaKeydown,
  previewRef,
  canGoPrev,
  goPrevAsset,
  canGoNext,
  goNextAsset,
  imageContextMenu,
  imageLayoutOptions,
  imageLayoutValue,
  chooseImageLayout
}

// 点击其他区域关闭右键菜单
function onGlobalClick() {
  resetIllustrationInteraction()
}

</script>

<style scoped src="./Notes.scoped.css"></style>
