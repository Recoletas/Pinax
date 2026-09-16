<template>
  <section
    ref="notebookRoot"
    class="writing-notebook-editor"
    :class="{ 'is-focus-paragraph': focusParagraph, 'is-composing': interactionComposing || compositionSettling }"
    aria-label="实时 Markdown 写作编辑器"
    @compositionstart.capture="handleCompositionStart"
    @compositionend.capture="handleCompositionEnd"
    @paste.capture="handlePaste"
    @beforeinput.capture="handleDestructiveBeforeInput"
    @keydown.capture="handleNotebookHistoryKeydown"
  >
    <EditorContent
      v-if="editor"
      ref="notebookSurface"
      :editor="editor"
      class="writing-notebook-editor__surface"
      @contextmenu="handleContextMenu"
    />

    <div
      v-if="currentLineOverlay.visible"
      class="writing-current-line"
      :style="{
        top: `${currentLineOverlay.top}px`,
        left: `${currentLineOverlay.left}px`,
        width: `${currentLineOverlay.width}px`,
        height: `${currentLineOverlay.height}px`
      }"
      aria-hidden="true"
    ></div>

    <Teleport to="body">
      <div
        v-if="commandMenu.open"
        class="writing-command-menu-shell"
        :class="{
          'is-submenu-left': commandMenu.submenuPlacement === 'left',
          'is-stacked': commandMenu.submenuPlacement === 'below',
          'is-sublevel': Boolean(activeWritingSection)
        }"
        :style="{
          top: `${commandMenu.top}px`,
          left: `${commandMenu.left}px`,
          width: `${commandMenu.width}px`
        }"
        @mousedown.prevent
      >
        <div
          ref="commandMenuRef"
          class="writing-command-menu"
          role="menu"
          aria-label="插入写作内容"
          :aria-activedescendant="activeWritingSection ? undefined : `writing-command-${commandMenu.activeIndex}`"
          :style="{ maxHeight: `${commandMenu.maxHeight}px` }"
        >
          <button
            v-for="(command, index) in availableWritingMenuItems"
            :id="`writing-command-${index}`"
            :key="command.id"
            type="button"
            role="menuitem"
            tabindex="-1"
            class="writing-command-menu__item"
            :class="{ 'is-active': isRootWritingCommandActive(command, index) }"
            @mouseenter="activateRootWritingCommand(index)"
            @click="runRootWritingCommand(index)"
          >
            <component :is="command.icon" :size="16" :stroke-width="1.7" aria-hidden="true" />
            <span class="writing-command-menu__copy">
              <strong>{{ command.label }}</strong>
              <small>{{ command.description }}</small>
            </span>
            <ChevronRight
              v-if="command.children?.length"
              :size="15"
              :stroke-width="1.8"
              class="writing-command-menu__expand"
              aria-hidden="true"
            />
          </button>
        </div>

        <div
          v-if="activeWritingSection"
          ref="commandSubmenuRef"
          class="writing-command-menu writing-command-submenu"
          role="menu"
          :aria-label="activeWritingSection.label"
          :aria-activedescendant="`writing-subcommand-${commandMenu.activeIndex}`"
          :style="{ maxHeight: `${commandMenu.maxHeight}px` }"
        >
          <div class="writing-command-submenu__title">
            <!-- W2：子菜单标题可点击返回一级（移动端二级视图的返回入口） -->
            <button
              type="button"
              class="writing-command-submenu__back"
              :aria-label="`返回 ${activeWritingSection.label} 上一级`"
              @click="leaveWritingCommandSection()"
            >← <span>{{ activeWritingSection.label }}</span></button>
          </div>
          <button
            v-for="(command, index) in activeWritingCommands"
            :id="`writing-subcommand-${index}`"
            :key="command.id"
            type="button"
            role="menuitem"
            tabindex="-1"
            class="writing-command-menu__item"
            :class="{ 'is-active': index === commandMenu.activeIndex }"
            @mouseenter="commandMenu.activeIndex = index"
            @click="runWritingCommand(index)"
          >
            <component :is="command.icon" :size="16" :stroke-width="1.7" aria-hidden="true" />
            <span class="writing-command-menu__copy">
              <strong>{{ command.label }}</strong>
              <small>{{ command.description }}</small>
            </span>
          </button>
        </div>
      </div>
    </Teleport>

    <div v-if="!editor" class="writing-notebook-editor__loading">正在建立写作面……</div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { UniqueID } from '@tiptap/extension-unique-id'
import { Extension, getMarkRange } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { AllSelection, NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory, isHistoryTransaction, redoNoScroll, undoNoScroll } from '@tiptap/pm/history'
import {
  Heading2,
  ChevronRight,
  Expand,
  Minus,
  Quote,
  ScanSearch,
  Shrink,
  Sparkles,
  WandSparkles
} from 'lucide-vue-next'
import {
  createWritingDocument,
  editorContentToWritingDocument,
  getWritingMarkdownPosition,
  getWritingDocumentMarkdown,
  writingDocumentToEditorContent
} from '../../services/writing/writingDocumentSchema.js'
import {
  createWritingUnitFromAuthoringTurn
} from '../../services/writing/writingAuthoringTurnImport.js'
import {
  MediaReferenceNode,
  WritingDocumentNode,
  WritingNodeAttributes,
  WritingUnitNode
} from '../../services/writing/writingUnitExtension.js'
import {
  canOpenWritingCommandMenu,
  getLiveMarkdownPrefix,
  getLiveMarkdownMarkSpec,
  resolveCurrentLineOverlayGeometry,
  resolveWritingCommandMenuPosition,
  resolveWritingCommandMenuKey,
  resolveMarkdownHeadingShortcut
} from '../../services/writing/liveMarkdownPreview.js'
import {
  WRITING_INTERACTION_OWNER,
  blocksPassiveInlineSuggestion
} from '../../services/writing/writingInteractionPolicy.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  document: { type: Object, default: null },
  editable: { type: Boolean, default: true },
  annotations: { type: Array, default: () => [] },
  worldbookMentions: { type: Array, default: () => [] },
  activeAnnotationId: { type: String, default: null },
  inlineSuggestion: { type: String, default: '' },
  inlineSuggestionVisible: Boolean,
  inlineSuggestionGenerating: Boolean,
  inlineSuggestionRequesting: Boolean,
  inlineSuggestionError: { type: String, default: '' },
  typewriter: Boolean,
  focusParagraph: Boolean,
  blockComposerOpen: Boolean,
  blockComposerTarget: { type: Object, default: null },
  blockPreview: { type: Object, default: null },
  blockComposerEnabled: { type: Boolean, default: true },
  interventionEnabled: { type: Boolean, default: false },
  atomicUndoAvailable: Boolean,
  atomicRedoAvailable: Boolean,
  historyLocked: Boolean,
  interactionOwner: { type: String, default: WRITING_INTERACTION_OWNER.EDITOR },
  beforeDestructiveEdit: { type: Function, default: null },
  blockGapId: { type: String, default: 'authoring-block-gap' }
})

const emit = defineEmits(['update:modelValue', 'update:document', 'selection-change', 'unit-transition', 'input', 'context-menu', 'annotation-click', 'worldbook-mention-click', 'writing-command', 'open-block-composer', 'open-intervention', 'accept-block-preview', 'dismiss-block-preview', 'accept-inline-suggestion', 'dismiss-inline-suggestion', 'cycle-inline-suggestion', 'retry-inline-suggestion', 'history-command', 'command-menu-change', 'composition-change', 'writing-paste', 'blocked-structure-edit', 'editor-focus', 'editor-blur', 'scroll-owner', 'ready'])

const initialDocument = props.document || createWritingDocument(props.modelValue)
const notebookRoot = ref(null)
const notebookSurface = ref(null)
const commandMenuRef = ref(null)
const commandSubmenuRef = ref(null)
const commandMenu = ref({ open: false, activeIndex: 0, rootIndex: 0, sectionId: null, anchorFrom: null, anchorTo: null, top: 0, left: 0, width: 300, maxHeight: 320, submenuPlacement: 'right', structureAllowed: true })
const currentLineOverlay = ref({ visible: false, top: 0, left: 0, width: 0, height: 0 })
const interactionComposing = ref(false)
const compositionSettling = ref(false)
let programmaticScrollUntil = 0
let userScrollIntentUntil = 0
let applyingExternalDocument = false
let lastCommandMenuGeometry = null
let compositionRefreshTimer = null
let componentUnmounting = false
let allSelectionCompositionActive = false
// U42：selectAll() 命令的作者意图标记。PM 在 writingUnit 包裹的文档中
// 可能将全选映射为 TextSelection 而非 AllSelection（DOM 选区不含结构边界），
// 导致 handleCompositionStart 的 instanceof 检查失败。此标记在 selectAll()
// 和实际 compositionstart 之间持续生效，不依赖 PM 选区类型。
let selectAllIntentActive = false
let compositionSessionToken = 0
let editorDocumentGeneration = 0

const COMMAND_MENU_WIDTH = 300
const COMMAND_MENU_FALLBACK_HEIGHT = 216
const COMMAND_MENU_MAX_HEIGHT = 320
const COMMAND_SUBMENU_GAP = 6
const blockGapDomId = computed(() => String(props.blockGapId || 'authoring-block-gap').replace(/[^a-zA-Z0-9_-]/g, '') || 'authoring-block-gap')
const blockGapSelector = computed(() => `#${blockGapDomId.value}`)

const writingMenuItems = [
  { id: 'ai-continue', label: '推演下一段', description: '生成可编辑草稿，确认后成为正文单元', icon: Sparkles, agent: true },
  {
    id: 'revise-previous',
    label: '修改上一段',
    description: '改写、扩写或精简',
    icon: WandSparkles,
    children: [
      { id: 'ai-rewrite-previous', label: '改写', description: '保留原意，改善语气与节奏', icon: WandSparkles, agent: true },
      { id: 'ai-expand-previous', label: '扩写', description: '补足动作、感官与必要细节', icon: Expand, agent: true },
      { id: 'ai-shorten-previous', label: '精简', description: '删除重复解释和弱信息', icon: Shrink, agent: true }
    ]
  },
  { id: 'ai-review-chapter', label: '审查本章', description: '检查衔接、重复与连续性', icon: ScanSearch, agent: true },
  {
    id: 'insert-structure',
    label: '插入结构',
    description: '标题、题记或场景分隔',
    icon: Heading2,
    children: [
      { id: 'heading-2', label: '小节标题', description: '建立场景内层次', icon: Heading2 },
      { id: 'blockquote', label: '引用或题记', description: '插入独立引用段', icon: Quote },
      { id: 'divider', label: '场景分隔', description: '插入分隔线', icon: Minus }
    ]
  }
]
const writingCommands = writingMenuItems.flatMap((item) => item.children || [item])
const availableWritingMenuItems = computed(() => commandMenu.value.structureAllowed
  ? writingMenuItems
  : writingMenuItems.filter((item) => item.id !== 'insert-structure'))
const activeWritingSection = computed(() => (
  availableWritingMenuItems.value.find((item) => item.id === commandMenu.value.sectionId && item.children?.length) || null
))
const activeWritingCommands = computed(() => activeWritingSection.value?.children || availableWritingMenuItems.value)

const annotationPluginKey = new PluginKey('writingAnnotationDecorations')
const worldbookMentionPluginKey = new PluginKey('writingWorldbookMentionDecorations')
const liveMarkdownPluginKey = new PluginKey('writingLiveMarkdownDecorations')
const chinesePunctuationPluginKey = new PluginKey('writingChinesePunctuationDecorations')
const inlineSuggestionPluginKey = new PluginKey('writingInlineSuggestion')
const blockGapPluginKey = new PluginKey('writingBlockGap')
const focusParagraphPluginKey = new PluginKey('writingFocusParagraphDecorations')
const writingUnitIntegrityPluginKey = new PluginKey('writingUnitIntegrity')
const inlineSuggestionAnchor = ref(null)
let commandMenuLiteralBypass = ''
let lastTopologyWarningAt = 0

function isInlineSuggestionLayerBlocked() {
  return interactionComposing.value
    || compositionSettling.value
    || commandMenu.value.open
    || props.blockComposerOpen
    || Boolean(props.blockPreview?.text)
    || blocksPassiveInlineSuggestion(props.interactionOwner)
}

function stopHandledKey(event) {
  event.preventDefault()
  event.stopPropagation()
}

function protectDestructiveSelection(operation = 'delete-selection') {
  const currentEditor = editor.value
  if (!currentEditor || currentEditor.state.selection.empty || typeof props.beforeDestructiveEdit !== 'function') return true
  const document = currentDocument.value
  return props.beforeDestructiveEdit({
    operation,
    document: document ? JSON.parse(JSON.stringify(document)) : null,
    markdown: getWritingDocumentMarkdown(document),
    selectionText: String(getSelection()?.text || '')
  }) !== false
}

function handleDestructiveBeforeInput(event) {
  if (event?.defaultPrevented || event?.isComposing || interactionComposing.value || compositionSettling.value) return
  if (!['deleteByCut', 'deleteByDrag', 'deleteContentBackward', 'deleteContentForward'].includes(String(event?.inputType || ''))) return
  if (protectDestructiveSelection(event.inputType)) return
  stopHandledKey(event)
}

function isDirectWritingUnitParagraph($position) {
  return Boolean(
    $position?.depth === 2
    && $position.parent?.type?.name === 'paragraph'
    && $position.node(1)?.type?.name === 'writingUnit'
  )
}

function handleNotebookHistoryKeydown(event) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || interactionComposing.value || compositionSettling.value) return
  if (event.target?.closest?.(blockGapSelector.value)) return
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier || event.altKey) return
  const key = String(event.key || '').toLowerCase()
  const undoRequested = key === 'z' && !event.shiftKey
  const redoRequested = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)
  if ((undoRequested || redoRequested) && props.historyLocked) {
    stopHandledKey(event)
    emit('history-command', redoRequested ? 'redo' : 'undo')
  } else if (undoRequested && props.atomicUndoAvailable) {
    stopHandledKey(event)
    emit('history-command', 'undo')
  } else if (redoRequested && props.atomicRedoAvailable) {
    stopHandledKey(event)
    emit('history-command', 'redo')
  }
}

function writingInputType(transaction) {
  const explicit = transaction.getMeta('writingInputOrigin')
  if (explicit) return explicit
  if (transaction.getMeta('writingAgentInsert')) return 'writing-agent'
  if (isHistoryTransaction(transaction)) {
    const historyMeta = Object.values(transaction.meta || {})
      .find((value) => value && typeof value === 'object' && 'redo' in value && 'historyState' in value)
    return historyMeta?.redo ? 'historyRedo' : 'historyUndo'
  }
  return transaction.getMeta('uiEvent') || 'input'
}

function createChinesePunctuationDecorations(doc) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(/[“”‘’]/g)) {
      const start = pos + Number(match.index || 0)
      decorations.push(Decoration.inline(start, start + 1, { class: 'writing-cjk-quote' }))
    }
  })
  return DecorationSet.create(doc, decorations)
}

const ChinesePunctuationDecorations = Extension.create({
  name: 'writingChinesePunctuationDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: chinesePunctuationPluginKey,
      state: {
        init: (_, state) => createChinesePunctuationDecorations(state.doc),
        apply: (transaction, previous) => transaction.docChanged
          ? createChinesePunctuationDecorations(transaction.doc)
          : previous
      },
      props: { decorations: (state) => chinesePunctuationPluginKey.getState(state) }
    })]
  }
})

function createBlockGapDecorations(state) {
  if (!props.blockComposerEnabled) return DecorationSet.empty
  if (!state.selection.empty && !props.blockPreview?.text && !props.blockComposerOpen) return DecorationSet.empty
  const { $from } = state.selection
  let unit = null
  let anchorNodeId = props.blockPreview?.afterNodeId || props.blockComposerTarget?.nodeId || null
  let position = state.doc.content.size
  const fixedUnitId = props.blockPreview?.afterUnitId || props.blockComposerTarget?.unitId || ''
  if (fixedUnitId) {
    state.doc.forEach((candidate, offset) => {
      if (unit || candidate.type.name !== 'writingUnit' || candidate.attrs?.unitId !== fixedUnitId) return
      unit = candidate
      position = offset + candidate.nodeSize
      candidate.descendants((node) => {
        if (!props.blockPreview?.afterNodeId && !props.blockComposerTarget?.nodeId && node.isTextblock) {
          anchorNodeId = node.attrs?.nodeId || anchorNodeId
        }
      })
    })
  }
  for (let depth = $from.depth; !unit && depth > 0; depth -= 1) {
    const candidate = $from.node(depth)
    if (!anchorNodeId && candidate.isTextblock) anchorNodeId = candidate.attrs?.nodeId || null
    if (candidate.type.name !== 'writingUnit') continue
    unit = candidate
    position = $from.after(depth)
    break
  }
  if (!unit && !fixedUnitId) {
    state.doc.forEach((candidate, offset) => {
      if (unit || candidate.type.name !== 'writingUnit') return
      if (state.selection.from >= offset && state.selection.from <= offset + candidate.nodeSize) {
        unit = candidate
        position = offset + candidate.nodeSize
      }
    })
  }
  if (fixedUnitId && !unit) return DecorationSet.empty
  return DecorationSet.create(state.doc, [Decoration.widget(position, () => {
    const gap = document.createElement('div')
    gap.id = blockGapDomId.value
    gap.className = 'writing-unit-gap'
    gap.contentEditable = 'false'
    // 54px 的 gap 块会盖住空章节的首行：容器必须放行指针事件，
    // 否则点击落不到 ProseMirror 上，caret 进不去、打字失效。
    gap.style.pointerEvents = 'none'
    if (props.blockPreview?.text) {
      gap.classList.add('has-preview')
    } else if (props.blockComposerOpen) {
      // The mounted child can be the normal composer or another block-owned
      // authoring surface. Reserve real document flow for either one; relying
      // on :has(.authoring-block-composer) leaves later surfaces at height 0.
      gap.classList.add('has-composer')
    } else if (!props.blockComposerOpen) {
      const actions = document.createElement('div')
      actions.className = 'writing-unit-gap__actions'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'writing-unit-gap__action is-primary'
      const buttonLabel = document.createElement('span')
      buttonLabel.textContent = unit?.textContent.trim() ? '推演下一段' : '推演本章开场'
      const buttonHint = document.createElement('small')
      buttonHint.textContent = unit?.textContent.trim() ? '看看接下来可能发生什么' : '从当前设定找到开场方向'
      button.append(buttonLabel, buttonHint)
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => emit('open-block-composer', {
          unitId: unit?.attrs.unitId || null,
          unitRevision: Number(unit?.attrs.unitRevision || 0),
          nodeId: anchorNodeId
      }))
      actions.append(button)
      if (props.interventionEnabled && unit?.textContent.trim()) {
        const intervention = document.createElement('button')
        intervention.type = 'button'
        intervention.className = 'writing-unit-gap__action is-secondary'
        const interventionLabel = document.createElement('span')
        interventionLabel.textContent = '改变条件'
        const interventionHint = document.createElement('small')
        interventionHint.textContent = '先看这项变化会影响哪里'
        intervention.append(interventionLabel, interventionHint)
        intervention.addEventListener('mousedown', (event) => event.preventDefault())
        intervention.addEventListener('click', () => emit('open-intervention', {
          unitId: unit?.attrs.unitId || null,
          unitRevision: Number(unit?.attrs.unitRevision || 0),
          nodeId: anchorNodeId
        }))
        actions.append(intervention)
      }
      gap.append(actions)
    }
    return gap
  }, {
    side: -1,
    // key 必须包含“锚定单元是否有正文”：ProseMirror 对同 key widget 复用旧
    // DOM、不重跑工厂，标签（推演本章开场/下一段）会停留在首次创建的状态。
    key: `writing-gap-${unit?.attrs.unitId || 'empty'}-${unit?.textContent.trim() ? 'text' : 'empty'}-${props.blockPreview?.text ? `preview:${props.blockPreview.candidateId || 'pending'}` : props.blockComposerOpen ? 'open' : 'closed'}`,
    // Composer / editable draft are real form controls mounted inside a ProseMirror
    // widget. Their keyboard, paste, input and selection events belong to the form,
    // never to the canonical document view.
    stopEvent: (event) => Boolean(event.target?.closest?.(blockGapSelector.value)),
    ignoreSelection: true
  })])
}

const BlockGapDecorations = Extension.create({
  name: 'writingBlockGap',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: blockGapPluginKey,
      state: {
        init: (_, state) => createBlockGapDecorations(state),
        apply: (transaction, previous, _oldState, newState) => (
          transaction.docChanged || transaction.selectionSet || transaction.getMeta(blockGapPluginKey)
            ? createBlockGapDecorations(newState)
            : previous
        )
      },
      props: {
        decorations: (state) => blockGapPluginKey.getState(state),
        handleKeyDown: (view, event) => {
          if (!props.blockPreview?.text) return false
          if (event.target?.closest?.(blockGapSelector.value)) return false
          if (event.isComposing || view.composing || interactionComposing.value || commandMenu.value.open) return false
          if (event.key === 'Escape') {
            stopHandledKey(event)
            emit('dismiss-block-preview')
            return true
          }
          return false
        }
      }
    })]
  }
})

function createInlineSuggestionDecorations(state) {
  const suggestion = String(props.inlineSuggestion || '')
  const visible = props.inlineSuggestionVisible && suggestion
  const generating = Boolean(props.inlineSuggestionGenerating)
  const error = String(props.inlineSuggestionError || '')
  if (isInlineSuggestionLayerBlocked() || (!visible && !generating && !error) || !state.selection.empty) {
    return DecorationSet.empty
  }
  if (inlineSuggestionAnchor.value == null) inlineSuggestionAnchor.value = state.selection.from
  if (state.selection.from !== inlineSuggestionAnchor.value) return DecorationSet.empty

  return DecorationSet.create(state.doc, [Decoration.widget(inlineSuggestionAnchor.value, () => {
    const widget = document.createElement('span')
    widget.className = `writing-inline-suggestion${generating ? ' is-generating' : error ? ' is-error' : ''}`
    widget.setAttribute('aria-label', generating ? 'AI 正在联想' : error ? `AI 联想失败：${error}` : `AI 续写建议：${suggestion}`)
    widget.title = generating ? '正在联想' : error ? '点击重试；Esc 忽略' : '点击采纳；Tab 全部采纳；Ctrl/Command + 右方向键采纳一句；Esc 忽略'

    const content = document.createElement('span')
    content.className = 'writing-inline-suggestion__content'
    content.textContent = generating ? '正在联想…' : error ? error : suggestion
    widget.append(content)

    const hint = document.createElement('span')
    hint.className = 'writing-inline-suggestion__hint'
    hint.textContent = generating ? '' : error ? '点击重试 · Esc 忽略' : 'Tab 采用 · ⌥[ / ⌥] 换方向 · Esc 忽略'
    if (hint.textContent) widget.append(hint)
    widget.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      if (error) emit('retry-inline-suggestion')
      else if (visible) emit('accept-inline-suggestion', 'all')
    })
    return widget
  }, {
    side: 1,
    key: `writing-inline-${inlineSuggestionAnchor.value}-${generating ? 'generating' : error ? `error:${error}` : `suggestion:${suggestion}`}`
  })])
}

const InlineSuggestionDecorations = Extension.create({
  name: 'writingInlineSuggestion',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: inlineSuggestionPluginKey,
      state: {
        init: (_, state) => createInlineSuggestionDecorations(state),
        apply: (transaction, previous, _oldState, newState) => (
          transaction.selectionSet || transaction.docChanged || transaction.getMeta(inlineSuggestionPluginKey)
            ? createInlineSuggestionDecorations(newState)
            : previous
        )
      },
      props: {
        decorations: (state) => inlineSuggestionPluginKey.getState(state),
        handleKeyDown: (view, event) => {
          const active = Boolean((props.inlineSuggestionVisible && props.inlineSuggestion)
            || props.inlineSuggestionRequesting || props.inlineSuggestionError)
          if (!active || event.isComposing || view.composing || isInlineSuggestionLayerBlocked()) return false
          if (event.key === 'Escape') {
            stopHandledKey(event)
            emit('dismiss-inline-suggestion')
            return true
          }
          if (props.inlineSuggestionError && event.key === 'Enter') {
            stopHandledKey(event)
            emit('retry-inline-suggestion')
            return true
          }
          if (!props.inlineSuggestionVisible || !props.inlineSuggestion) return false
          if (event.key === 'Tab') {
            stopHandledKey(event)
            emit('accept-inline-suggestion', 'all')
            return true
          }
          if (event.key === 'ArrowRight' && (event.ctrlKey || event.metaKey)) {
            stopHandledKey(event)
            emit('accept-inline-suggestion', 'unit')
            return true
          }
          const pureAlt = event.altKey
            && !event.ctrlKey
            && !event.metaKey
            && !event.getModifierState?.('AltGraph')
          if (pureAlt && (event.code === 'BracketRight' || event.key === ']')) {
            stopHandledKey(event)
            emit('cycle-inline-suggestion', 1)
            return true
          }
          if (pureAlt && (event.code === 'BracketLeft' || event.key === '[')) {
            stopHandledKey(event)
            emit('cycle-inline-suggestion', -1)
            return true
          }
          return false
        }
      }
    })]
  }
})

function createLiveMarkdownDecorations(state) {
  const { $from } = state.selection
  const decorations = []
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'writingUnit') continue
    const from = $from.before(depth)
    decorations.push(Decoration.node(from, from + node.nodeSize, {
      class: 'is-current-writing-unit'
    }))
    break
  }
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!node.isTextblock) continue
    const from = $from.before(depth)
    const classes = ['is-current-writing-line']
    const attrs = { class: classes.join(' ') }
    if (isDirectWritingUnitParagraph($from) && canOpenWritingCommandMenu({
      selectionEmpty: state.selection.empty,
      nodeType: node.type.name,
      parentOffset: $from.parentOffset,
      contentSize: node.content.size
    })) {
      classes.push('is-empty-command-line')
      attrs.class = classes.join(' ')
      attrs['data-empty-hint'] = '按空格或 / 调出工具'
    }
    decorations.push(Decoration.node(from, from + node.nodeSize, attrs))
    break
  }
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    const prefix = getLiveMarkdownPrefix({ type: node.type.name, attrs: node.attrs })
    if (!prefix) continue
    const from = $from.before(depth)
    decorations.push(Decoration.node(from, from + node.nodeSize, {
      class: 'is-live-markdown-active',
      'data-markdown-prefix': prefix
    }))
    break
  }

  const markSpec = getLiveMarkdownMarkSpec($from.marks().map((mark) => mark.type.name))
  const markType = markSpec ? state.schema.marks[markSpec.type] : null
  const markRange = markType ? getMarkRange($from, markType) : null
  if (markSpec && markRange && markRange.from < markRange.to) {
    decorations.push(Decoration.inline(markRange.from, markRange.to, {
      class: 'is-live-markdown-mark',
      'data-markdown-open': markSpec.open,
      'data-markdown-close': markSpec.close
    }))
  }

  return decorations.length
    ? DecorationSet.create(state.doc, decorations)
    : DecorationSet.empty
}

const LiveMarkdownDecorations = Extension.create({
  name: 'writingLiveMarkdownDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: liveMarkdownPluginKey,
      state: {
        init: (_, state) => createLiveMarkdownDecorations(state),
        apply: (transaction, previous, _oldState, newState) => (
          transaction.docChanged || transaction.selectionSet || transaction.getMeta(liveMarkdownPluginKey)
            ? createLiveMarkdownDecorations(newState)
            : previous
        )
      },
      props: {
        decorations: (state) => liveMarkdownPluginKey.getState(state),
        handleDOMEvents: {
          focus: (view) => {
            view.dispatch(view.state.tr.setMeta(liveMarkdownPluginKey, 'focus'))
            return false
          },
          blur: () => {
            closeCommandMenu()
            return false
          }
        }
      }
    })]
  }
})

const LiveMarkdownInput = Extension.create({
  name: 'writingLiveMarkdownInput',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (from !== to) return false
          if (view.composing || interactionComposing.value || compositionSettling.value) return false
          const { state } = view
          const $from = state.doc.resolve(from)
          const node = $from.parent
          if (!isDirectWritingUnitParagraph($from)) return false
          const shortcut = resolveMarkdownHeadingShortcut({
            nodeType: node.type.name,
            currentLevel: node.attrs.level,
            textBefore: node.textBetween(0, $from.parentOffset, undefined, '\ufffc'),
            insertedText: text
          })
          const heading = state.schema.nodes.heading
          if (!shortcut || !heading || $from.depth < 1) return false

          const blockFrom = $from.before()
          const blockTo = $from.after()
          const contentFrom = $from.start()
          const transaction = state.tr.setBlockType(blockFrom, blockTo, heading, {
            ...node.attrs,
            level: shortcut.level
          })
          if (shortcut.removePrefix) {
            transaction.delete(contentFrom, contentFrom + shortcut.removePrefix)
          }
          if (shortcut.insertedText) {
            transaction.insertText(shortcut.insertedText, contentFrom)
          }
          view.dispatch(transaction.scrollIntoView())
          return true
        }
      }
    })]
  }
})

function closeCommandMenu() {
  if (!commandMenu.value.open) return false
  commandMenu.value.open = false
  commandMenu.value.submenuPlacement = 'right'
  lastCommandMenuGeometry = null
  emit('command-menu-change', false)
  return true
}

function getWritingCommandContext(view) {
  const currentBlock = resolveEditorBlockSelection({ state: view.state }, view.state.selection.from)
  const currentNodeId = currentBlock?.node?.attrs?.nodeId || null
  const currentBlockPos = currentBlock?.pos ?? view.state.selection.from

  let previousNode = null
  view.state.doc.forEach((unit, unitPos) => {
    unit.forEach((node, blockOffset) => {
      const pos = unitPos + 1 + blockOffset
      if (pos >= currentBlockPos || !node.attrs?.nodeId) return
      previousNode = {
        nodeId: node.attrs.nodeId,
        text: editorBlockPlainText(node),
        nodeRevision: Number(node.attrs?.nodeRevision || 0)
      }
    })
  })
  return {
    currentNodeId,
    previousNode,
    cursorMarkdownOffset: getWritingMarkdownPosition(
      currentDocument.value,
      currentNodeId,
      currentBlock?.localOffset || 0
    ),
    markdown: getWritingDocumentMarkdown(currentDocument.value)
  }
}

function getBodyUiScale() {
  const body = document.body
  const bodyZoom = Number.parseFloat(window.getComputedStyle(body).zoom) || 1
  if (bodyZoom !== 1) return Math.max(0.1, bodyZoom)
  const transformedScale = body?.offsetWidth > 0
    ? body.getBoundingClientRect().width / body.offsetWidth
    : 1
  return Math.max(0.1, transformedScale || 1)
}

function getCommandMenuViewport() {
  const visualViewport = window.visualViewport
  return {
    width: Number(visualViewport?.width) || window.innerWidth,
    height: Number(visualViewport?.height) || window.innerHeight,
    offsetLeft: Number(visualViewport?.offsetLeft) || 0,
    offsetTop: Number(visualViewport?.offsetTop) || 0
  }
}

function isCommandMenuStacked() {
  const viewport = getCommandMenuViewport()
  return viewport.width <= 760 || viewport.height <= 520
}

function measureCommandMenuElement(element, scale, heightLimit = COMMAND_MENU_MAX_HEIGHT) {
  if (!element) return null
  const box = element.getBoundingClientRect?.()
  const borderHeight = Math.max(0, Number(element.offsetHeight || 0) - Number(element.clientHeight || 0))
  const naturalHeight = Math.max(
    Number(box?.height || 0) / scale,
    Number(element.scrollHeight || 0) + borderHeight
  )
  return {
    // shell 曾在窄 visual viewport 被压缩时，DOM rect 只反映压缩后的宽度；
    // 保留 300px 的自然宽度，视口恢复后才能重新展开，最终裁切仍交给 resolver。
    width: Math.max(COMMAND_MENU_WIDTH, Number(box?.width || 0) / scale),
    height: Math.max(1, Math.min(COMMAND_MENU_MAX_HEIGHT, heightLimit, naturalHeight))
  }
}

function resolveCommandSubmenuPlacement({ anchor, viewport, mainWidth, submenuWidth, scale }) {
  if (isCommandMenuStacked()) return 'below'
  const minimumLeft = viewport.offsetLeft + 12
  const maximumRight = viewport.offsetLeft + viewport.width - 12
  const mainVisualWidth = mainWidth * scale
  const submenuVisualWidth = submenuWidth * scale
  const gap = COMMAND_SUBMENU_GAP * scale
  const anchoredLeft = Math.max(
    minimumLeft,
    Math.min(Number(anchor.left || 0), maximumRight - mainVisualWidth)
  )
  const overflowRight = Math.max(0, anchoredLeft + mainVisualWidth + gap + submenuVisualWidth - maximumRight)
  const overflowLeft = Math.max(0, minimumLeft - (anchoredLeft - gap - submenuVisualWidth))
  return overflowRight <= overflowLeft ? 'right' : 'left'
}

function measureCommandMenuGeometry({ anchor, viewport, scale, heightLimit = COMMAND_MENU_MAX_HEIGHT }) {
  const main = measureCommandMenuElement(commandMenuRef.value, scale, heightLimit)
  if (!main) return null
  const submenu = measureCommandMenuElement(commandSubmenuRef.value, scale, heightLimit)
  if (!submenu) {
    commandMenu.value.submenuPlacement = 'right'
    return {
      menuWidth: main.width,
      menuHeight: main.height,
      collisionWidth: main.width,
      collisionHeight: main.height,
      collisionOffsetLeft: 0,
      collisionOffsetTop: 0
    }
  }

  const placement = resolveCommandSubmenuPlacement({
    anchor,
    viewport,
    mainWidth: main.width,
    submenuWidth: submenu.width,
    scale
  })
  commandMenu.value.submenuPlacement = placement
  if (placement === 'below') {
    return {
      // 短/窄 visual viewport 采用二级替换一级，碰撞盒只计算当前层。
      menuWidth: submenu.width,
      menuHeight: submenu.height,
      collisionWidth: submenu.width,
      collisionHeight: submenu.height,
      collisionOffsetLeft: 0,
      collisionOffsetTop: 0
    }
  }
  return {
    menuWidth: main.width,
    menuHeight: main.height,
    collisionWidth: main.width + COMMAND_SUBMENU_GAP + submenu.width,
    collisionHeight: Math.max(main.height, submenu.height),
    collisionOffsetLeft: placement === 'left' ? -(COMMAND_SUBMENU_GAP + submenu.width) : 0,
    collisionOffsetTop: 0
  }
}

function resolveCommandMenuGeometry(view, geometry) {
  if (!notebookRoot.value || !geometry) return null
  let anchor = null
  try {
    anchor = view.coordsAtPos(view.state.selection.from, 1)
  } catch {
    return null
  }
  const scale = getBodyUiScale()
  const viewport = getCommandMenuViewport()
  return resolveWritingCommandMenuPosition({
    anchor,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    viewportOffsetLeft: viewport.offsetLeft,
    viewportOffsetTop: viewport.offsetTop,
    ...geometry,
    scale
  })
}

function positionCommandMenu(view, geometry = lastCommandMenuGeometry) {
  const fallbackGeometry = {
    menuWidth: COMMAND_MENU_WIDTH,
    menuHeight: COMMAND_MENU_FALLBACK_HEIGHT,
    collisionWidth: COMMAND_MENU_WIDTH,
    collisionHeight: COMMAND_MENU_FALLBACK_HEIGHT,
    collisionOffsetLeft: 0,
    collisionOffsetTop: 0
  }
  const position = resolveCommandMenuGeometry(view, geometry || fallbackGeometry)
  if (!position) return
  Object.assign(commandMenu.value, position)
}

function measureAndPositionCommandMenu(view) {
  nextTick(() => {
    if (!commandMenu.value.open || editor.value?.view !== view) return
    const scale = getBodyUiScale()
    const viewport = getCommandMenuViewport()
    let anchor = null
    try {
      anchor = view.coordsAtPos(view.state.selection.from, 1)
    } catch {
      return
    }
    let geometry = measureCommandMenuGeometry({ anchor, viewport, scale })
    if (!geometry) return
    const initialPosition = resolveCommandMenuGeometry(view, geometry)
    if (!initialPosition) return
    geometry = measureCommandMenuGeometry({
      anchor,
      viewport,
      scale,
      heightLimit: initialPosition.maxHeight
    }) || geometry
    lastCommandMenuGeometry = geometry
    positionCommandMenu(view, geometry)
  })
}

function openCommandMenu(view) {
  if (
    interactionComposing.value
    || compositionSettling.value
    || props.blockComposerOpen
    || props.blockPreview?.text
    || blocksPassiveInlineSuggestion(props.interactionOwner)
  ) return false
  const { from, to } = view.state.selection
  const directParagraph = view.state.selection.$from
  const structureAllowed = isDirectWritingUnitParagraph(directParagraph)
    && directParagraph.parent.content.size === 0
  // 空行命令菜单取得键盘所有权时，必须同步撤掉 pending/requesting/Ghost，
  // 否则同一枚 Tab 会在菜单关闭后继续落到行内补全插件。
  emit('dismiss-inline-suggestion')
  commandMenuLiteralBypass = ''
  lastCommandMenuGeometry = null
  commandMenu.value = {
    ...commandMenu.value,
    open: true,
    activeIndex: 0,
    rootIndex: 0,
    sectionId: null,
    anchorFrom: from,
    anchorTo: to,
    width: COMMAND_MENU_WIDTH,
    maxHeight: COMMAND_MENU_MAX_HEIGHT,
    submenuPlacement: 'right',
    structureAllowed
  }
  emit('command-menu-change', true)
  positionCommandMenu(view)
  measureAndPositionCommandMenu(view)
  return true
}

function handleWritingCommandBeforeInput(view, event) {
  if (
    event.inputType !== 'insertText'
    || ![' ', '/'].includes(String(event.data || ''))
    || event.isComposing
    || view.composing
    || interactionComposing.value
    || compositionSettling.value
  ) return false
  const text = String(event.data || '')
  if (commandMenuLiteralBypass === text) {
    commandMenuLiteralBypass = ''
    return false
  }
  // 软键盘没有可靠 keydown。菜单已打开时再次输入同一字符表示用户要
  // 字面 Space/“/”：关闭菜单并让浏览器继续这一次 beforeinput。
  if (commandMenu.value.open) {
    closeCommandMenu()
    return false
  }
  const { $from } = view.state.selection
  if (!isDirectWritingUnitParagraph($from) || !canOpenWritingCommandMenu({
    selectionEmpty: view.state.selection.empty,
    nodeType: $from.parent.type.name,
    parentOffset: $from.parentOffset,
    contentSize: $from.parent.content.size
  })) return false
  if (!openCommandMenu(view)) return false
  event.preventDefault()
  return true
}

function revealActiveWritingCommand() {
  nextTick(() => {
    const submenuOpen = Boolean(commandMenu.value.sectionId)
    const menu = submenuOpen ? commandSubmenuRef.value : commandMenuRef.value
    const itemId = submenuOpen
      ? `#writing-subcommand-${commandMenu.value.activeIndex}`
      : `#writing-command-${commandMenu.value.activeIndex}`
    const item = menu?.querySelector(itemId)
    if (!menu || !item) return
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight
    }
  })
}

function executeWritingCommand(commandId) {
  const command = writingCommands.find((item) => item.id === commandId)
  if (command?.agent) {
    const view = editor.value?.view
    if (!view) return false
    closeCommandMenu()
    emit('writing-command', { id: commandId, ...getWritingCommandContext(view) })
    return true
  }
  const chain = editor.value?.chain().focus(undefined, { scrollIntoView: false })
  if (!chain) return false
  const actions = {
    'heading-2': () => chain.toggleHeading({ level: 2 }).run(),
    blockquote: () => chain.toggleBlockquote().run(),
    divider: () => insertDivider()
  }
  const executed = Boolean(actions[commandId]?.())
  closeCommandMenu()
  return executed
}

function enterWritingCommandSection(sectionId, rootIndex = commandMenu.value.rootIndex) {
  const section = availableWritingMenuItems.value.find((item) => item.id === sectionId && item.children?.length)
  if (!section) return false
  commandMenu.value.sectionId = section.id
  commandMenu.value.rootIndex = rootIndex
  commandMenu.value.activeIndex = 0
  lastCommandMenuGeometry = null
  revealActiveWritingCommand()
  if (editor.value?.view) measureAndPositionCommandMenu(editor.value.view)
  return true
}

function leaveWritingCommandSection() {
  if (!commandMenu.value.sectionId) return false
  commandMenu.value.sectionId = null
  commandMenu.value.activeIndex = Math.max(0, commandMenu.value.rootIndex)
  lastCommandMenuGeometry = null
  revealActiveWritingCommand()
  if (editor.value?.view) measureAndPositionCommandMenu(editor.value.view)
  return true
}

function runWritingCommand(index) {
  const command = activeWritingCommands.value[index]
  if (!editor.value || !command) return false
  if (command.children?.length) return enterWritingCommandSection(command.id)
  return executeWritingCommand(command.id)
}

function isRootWritingCommandActive(command, index) {
  return activeWritingSection.value
    ? command.id === activeWritingSection.value.id
    : index === commandMenu.value.activeIndex
}

function activateRootWritingCommand(index) {
  if (!activeWritingSection.value) commandMenu.value.activeIndex = index
}

function runRootWritingCommand(index) {
  const command = availableWritingMenuItems.value[index]
  if (!editor.value || !command) return false
  if (command.children?.length) return enterWritingCommandSection(command.id, index)
  commandMenu.value.activeIndex = index
  return executeWritingCommand(command.id)
}

const WritingCommandMenu = Extension.create({
  name: 'writingCommandMenu',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.isComposing || view.composing) return false
          const commandShortcut = (event.metaKey || event.ctrlKey)
            && !event.altKey
            && !event.getModifierState?.('AltGraph')
            && event.key === '/'
          // 系统键盘重复事件属于第一次快捷键的同一意图；菜单已经打开后
          // 必须继续消费，不能把长按 Ctrl/Cmd+/ 解释成“关闭、再打开”。
          if (event.repeat && commandShortcut) {
            stopHandledKey(event)
            return true
          }
          if (commandMenu.value.open) {
            if (event.key === 'Tab') {
              stopHandledKey(event)
              closeCommandMenu()
              return true
            }
            const commands = activeWritingCommands.value
            const activeCommand = commands[commandMenu.value.activeIndex]
            const result = resolveWritingCommandMenuKey({
              key: event.key,
              activeIndex: commandMenu.value.activeIndex,
              itemCount: commands.length,
              hasChildren: Boolean(activeCommand?.children?.length),
              hasParent: Boolean(commandMenu.value.sectionId)
            })
            if (result?.action === 'move') {
              stopHandledKey(event)
              commandMenu.value.activeIndex = result.index
              revealActiveWritingCommand()
              return true
            }
            if (result?.action === 'select') {
              stopHandledKey(event)
              return runWritingCommand(result.index)
            }
            if (result?.action === 'expand') {
              stopHandledKey(event)
              return enterWritingCommandSection(commands[result.index]?.id)
            }
            if (result?.action === 'back') {
              stopHandledKey(event)
              return leaveWritingCommandSection()
            }
            if (result?.action === 'close') {
              stopHandledKey(event)
              closeCommandMenu()
              return true
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              stopHandledKey(event)
              return true
            }
            if (event.key === ' ' || event.key === '/') commandMenuLiteralBypass = event.key
            closeCommandMenu()
            return false
          }

          const { $from } = view.state.selection
          if (commandShortcut && isDirectWritingUnitParagraph($from) && canOpenWritingCommandMenu({
            selectionEmpty: view.state.selection.empty,
            nodeType: $from.parent.type.name,
            parentOffset: $from.parentOffset,
            contentSize: $from.parent.content.size,
            trigger: 'shortcut'
          })) {
            if (!openCommandMenu(view)) return false
            stopHandledKey(event)
            return true
          }
          const canOpen = isDirectWritingUnitParagraph($from) && canOpenWritingCommandMenu({
            selectionEmpty: view.state.selection.empty,
            nodeType: $from.parent.type.name,
            parentOffset: $from.parentOffset,
            contentSize: $from.parent.content.size
          })
          if (canOpen && (event.key === ' ' || event.key === '/')) {
            if (!openCommandMenu(view)) return false
            stopHandledKey(event)
            return true
          }
          return false
        },
        handleDOMEvents: {
          beforeinput: handleWritingCommandBeforeInput
        }
      }
    })]
  }
})

function annotationText(annotation) {
  return String(
    annotation?.range?.startSelector?.exact
      || annotation?.selector?.exact
      || (annotation?.range?.start?.nodeId === annotation?.range?.end?.nodeId ? annotation?.range?.exact : '')
      || ''
  )
}

function annotationStart(annotation) {
  return Number(
    annotation?.range?.start?.offset
      ?? annotation?.selector?.start
      ?? 0
  )
}

function createAnnotationDecorations(doc) {
  const decorations = []
  const annotations = Array.isArray(props.annotations) ? props.annotations : []
  const annotationIds = new Set(annotations.map((annotation) => annotation?.id).filter(Boolean))
  const visible = annotations.filter((annotation) => (
    annotation?.status !== 'orphaned'
      && (!annotation?.parentId || !annotationIds.has(annotation.parentId))
      && (annotation?.status !== 'resolved' || annotation.id === props.activeAnnotationId)
      && annotationText(annotation)
  ))
  const blockPositions = new Map()
  collectDirectWritingBlocks(doc).forEach(({ node, pos }) => {
    if (node.attrs?.nodeId) blockPositions.set(node.attrs.nodeId, { node, pos })
  })

  visible.forEach((annotation) => {
    const range = resolveAnnotationDocumentRange(annotation, blockPositions)
    if (!range) return
    const { from, to } = range
    if (to <= from) return
    const state = annotation.status === 'resolved' ? 'resolved' : 'open'
    const active = annotation.id === props.activeAnnotationId
    decorations.push(Decoration.inline(from, to, {
      class: `writing-annotation-anchor is-${state}${active ? ' is-active' : ''}`,
      'data-annotation-id': annotation.id,
      title: annotation.body || '打开批注'
    }, { annotationId: annotation.id }))
  })
  return DecorationSet.create(doc, decorations)
}

function resolveAnnotationDocumentRange(annotation, nodePositions) {
  const startNodeId = annotation?.range?.start?.nodeId || annotation?.target?.nodeId
  const endNodeId = annotation?.range?.end?.nodeId || startNodeId
  const startNode = nodePositions.get(startNodeId)
  const endNode = nodePositions.get(endNodeId)
  if (!startNode || !endNode) return null

  const startText = editorBlockPlainText(startNode.node)
  const endText = editorBlockPlainText(endNode.node)
  const startOffset = Math.max(0, Math.min(startText.length, annotationStart(annotation)))
  const fallbackLength = annotationText(annotation).length
  const endOffset = annotation?.range?.end?.offset ?? (startOffset + fallbackLength)
  const safeEndOffset = Math.max(0, Math.min(endText.length, Number(endOffset) || 0))
  const from = editorDocumentPositionAtBlockOffset(startNode, startOffset)
  const to = editorDocumentPositionAtBlockOffset(endNode, safeEndOffset)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return to >= from ? { from, to } : null
}

const AnnotationDecorations = Extension.create({
  name: 'writingAnnotationDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: annotationPluginKey,
      state: {
        init: (_, state) => createAnnotationDecorations(state.doc),
        apply: (transaction, oldDecorations, _oldState, newState) => (
          transaction.docChanged || transaction.getMeta(annotationPluginKey)
            ? createAnnotationDecorations(newState.doc)
            : oldDecorations
        )
      },
      props: {
        decorations: (state) => annotationPluginKey.getState(state),
        handleClick: (_view, _pos, event) => {
          const marker = event.target?.closest?.('[data-annotation-id]')
          if (!marker) return false
          emit('annotation-click', marker.dataset.annotationId)
          return true
        }
      }
    })]
  }
})

function createWorldbookMentionDecorations(doc) {
  const nodePositions = new Map()
  collectDirectWritingBlocks(doc).forEach(({ node, pos }) => {
    if (node.attrs?.nodeId) nodePositions.set(node.attrs.nodeId, { node, pos })
  })
  const decorations = []
  for (const mention of props.worldbookMentions || []) {
    const location = nodePositions.get(mention?.nodeId)
    if (!location) continue
    const textLength = editorBlockPlainText(location.node).length
    const start = Math.max(0, Math.min(textLength, Number(mention.start) || 0))
    const end = Math.max(start, Math.min(textLength, Number(mention.end) || start))
    if (end <= start) continue
    const from = editorDocumentPositionAtBlockOffset(location, start)
    const to = editorDocumentPositionAtBlockOffset(location, end)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue
    decorations.push(Decoration.inline(from, to, {
      class: `writing-worldbook-mention is-${mention.entryType || 'general'}`,
      'data-worldbook-entry-id': mention.entryId,
      'data-worldbook-entry-ids': (mention.entryIds || [mention.entryId]).filter(Boolean).join(','),
      'data-worldbook-node-id': mention.nodeId,
      'data-worldbook-start': String(start),
      'data-worldbook-end': String(end),
      title: mention.ambiguous ? `${mention.label || mention.text} · 选择来源` : `${mention.label || mention.text} · 打开设定`
    }, { worldbookEntryId: mention.entryId }))
  }
  return DecorationSet.create(doc, decorations)
}

const WorldbookMentionDecorations = Extension.create({
  name: 'writingWorldbookMentionDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: worldbookMentionPluginKey,
      state: {
        init: (_, state) => createWorldbookMentionDecorations(state.doc),
        apply: (transaction, oldDecorations, _oldState, newState) => (
          transaction.docChanged || transaction.getMeta(worldbookMentionPluginKey)
            ? createWorldbookMentionDecorations(newState.doc)
            : oldDecorations
        )
      },
      props: {
        decorations: (state) => worldbookMentionPluginKey.getState(state),
        handleClick: (_view, _pos, event) => {
          const marker = event.target?.closest?.('[data-worldbook-entry-id]')
          if (!marker) return false
          emit('worldbook-mention-click', {
            entryId: marker.dataset.worldbookEntryId,
            entryIds: String(marker.dataset.worldbookEntryIds || '').split(',').filter(Boolean),
            nodeId: marker.dataset.worldbookNodeId,
            start: Number(marker.dataset.worldbookStart) || 0,
            end: Number(marker.dataset.worldbookEnd) || 0
          })
          return true
        }
      }
    })]
  }
})

// 段落聚焦装饰（P0c）：光标所在段落打 is-focus-current-block 标记，
// 其余段落由 CSS 淡化到 35%。用 PM 原生 decoration 而非命令式 class——
// 命令式标记会被 ProseMirror 的 DOM 重渲染抹掉。
const FocusParagraphDecorations = Extension.create({
  name: 'writingFocusParagraphDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: focusParagraphPluginKey,
      props: {
        decorations(state) {
          if (!props.focusParagraph || !state.selection.empty) return DecorationSet.empty
          const { from } = state.selection
          let target = null
          state.doc.forEach((unit, unitOffset) => {
            if (target) return
            if (from < unitOffset || from > unitOffset + unit.nodeSize) return
            unit.forEach((block, blockOffset) => {
              const start = unitOffset + 1 + blockOffset
              const end = start + block.nodeSize
              if (!target && from >= start && from <= end) {
                target = Decoration.node(start, end, { class: 'is-focus-current-block' })
              }
            })
          })
          return target ? DecorationSet.create(state.doc, [target]) : DecorationSet.empty
        }
      }
    })]
  }
})

function writingUnitIds(doc) {
  const ids = []
  doc.forEach((node) => {
    if (node.type.name === 'writingUnit') ids.push(String(node.attrs?.unitId || ''))
  })
  return ids
}

function selectedWritingUnitIds(state) {
  if (state.selection instanceof AllSelection) return writingUnitIds(state.doc)
  const ids = []
  const { from, to, empty } = state.selection
  state.doc.forEach((node, pos) => {
    if (node.type.name !== 'writingUnit') return
    const end = pos + node.nodeSize
    const intersects = empty
      ? from >= pos && from <= end
      : from < end && to > pos
    if (intersects) ids.push(String(node.attrs?.unitId || ''))
  })
  return ids
}

function hasSameWritingUnitTopology(before, after) {
  const beforeIds = writingUnitIds(before)
  const afterIds = writingUnitIds(after)
  return beforeIds.length === afterIds.length
    && beforeIds.every((id, index) => id && id === afterIds[index])
}

function warnBlockedStructureEdit(reason = 'implicit-topology-change') {
  const now = Date.now()
  if (now - lastTopologyWarningAt < 250) return
  lastTopologyWarningAt = now
  emit('blocked-structure-edit', { reason })
}

// 点击稿件面空白区域（段落下方/行尾之外的留白）：把 caret 放到离点击
// 最近的文本块末尾，而不是让 DOM 选区落在根容器上与 PM state 脱节。
// 右键菜单书签、后续输入都依赖两者一致。
function placeCaretFromClick(view) {
  try {
    // 点空白 = 想在正文末尾继续写：caret 落到最后一个文本块的末尾。
    // posAtCoords 在留白处的返回值不可靠，不采用。
    const applyAtEnd = () => {
      if (view.isDestroyed) return
      const docSize = view.state.doc.content.size
      const $end = view.state.doc.resolve(Math.max(1, docSize - 1))
      view.dispatch(view.state.tr.setSelection(TextSelection.near($end, -1)))
      view.focus()
    }
    applyAtEnd()
    // mousedown 被接管后浏览器不再放 caret，PM 的 selection 同步与
    // mouseup/click 的默认链会把选区拉回文首——等事件循环走完再钉一次。
    setTimeout(applyAtEnd, 0)
    return true
  } catch {
    return false
  }
}

// 空白点击捕获：坐标处没有可放置 caret 的文本（点在稿面留白上）时，PM
// 默认行为会让 DOM selection 与 state.selection 脱节。这里显式接管。
const BlankAreaClickSync = Extension.create({
  name: 'writingBlankAreaClickSync',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleDOMEvents: {
          mousedown: (view, event) => {
            if (event.button !== 0) return false
            // 只接管直接点在 PM 根元素上的点击（正文留白）；块内点击与
            // gap/composer 等浮层控件交回默认处理。
            if (event.target !== view.dom) return false
            const handled = placeCaretFromClick(view, event)
            if (handled) event.preventDefault()
            return handled
          }
        }
      }
    })]
  }
})

// U31：浏览器原生 Ctrl+A 在 writingUnit 包裹的文档中不产生 PM AllSelection
// （DOM 选区只覆盖文本内容，不含结构边界）。但 handleCompositionStart 依赖
// AllSelection 判定是否在 compositionend 后做 replace-all。这里显式拦截
// Ctrl/Cmd+A 并创建 AllSelection，使全选+IME 的原子替换行为与用户意图一致。
const SelectAllHandler = Extension.create({
  name: 'writingSelectAllHandler',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false
          if (event.key !== 'a' && event.key !== 'A') return false
          view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
          event.preventDefault()
          return true
        }
      }
    })]
  }
})

// writingUnit 是正文、当前场、批注和来源共同使用的稳定边界。任何没有
// typed transition 的 transaction 都不得增删/重排这些顶层节点；这样即使
// 浏览器或 StarterKit 新增了键盘路径，也不会静默吞掉 unitId/originRefs。
const WritingUnitIntegrity = Extension.create({
  name: 'writingUnitIntegrity',
  priority: 1100,
  addProseMirrorPlugins() {
    return [new Plugin({
      key: writingUnitIntegrityPluginKey,
      filterTransaction(transaction, state) {
        if (
          allSelectionCompositionActive
          && transaction.docChanged
          && !transaction.getMeta('writingUnitTransition')
          && !isHistoryTransaction(transaction)
        ) return false
        if (!transaction.docChanged || hasSameWritingUnitTopology(state.doc, transaction.doc)) return true
        if (
          applyingExternalDocument
          || transaction.getMeta('writingUnitTransition')
          || transaction.getMeta('writingAgentInsert')
          || isHistoryTransaction(transaction)
        ) return writingUnitIds(transaction.doc).every(Boolean)
        warnBlockedStructureEdit()
        return false
      },
      props: {
        handleKeyDown(view, event) {
          if (
            event.isComposing
            || event.keyCode === 229
            || view.composing
            || interactionComposing.value
            || compositionSettling.value
          ) return false
          if (!(view.state.selection instanceof AllSelection)) return false
          if (!['Backspace', 'Delete'].includes(event.key)) return false
          stopHandledKey(event)
          return replaceWholeWritingDocument('', { origin: 'structure' })
        },
        handleTextInput(view, _from, _to, text) {
          if (view.composing || interactionComposing.value || compositionSettling.value) return false
          if (!(view.state.selection instanceof AllSelection)) return false
          return replaceWholeWritingDocument(text, { origin: 'structure' })
        },
        handleDOMEvents: {
          beforeinput(view, event) {
            if (
              event.isComposing
              || view.composing
              || interactionComposing.value
              || compositionSettling.value
            ) return false
            const inputType = String(event.inputType || '')
            if (!inputType.startsWith('insert') && !inputType.startsWith('delete')) return false
            if (view.state.selection instanceof AllSelection) {
              if (inputType.startsWith('insert')) {
                const transferredText = event.dataTransfer?.getData?.('text/plain')
                const replacement = typeof event.data === 'string'
                  ? event.data
                  : (typeof transferredText === 'string' ? transferredText : '')
                // paste/drop/yank 等 beforeinput 往往只有 inputType、没有 payload。
                // 缺失文本不是“用户输入了空串”，更不能被解释为清空整章；
                // paste 的明确纯文本由 capture handler 原子接管，其余交回原生链路。
                if (!replacement && !['insertParagraph', 'insertLineBreak'].includes(inputType)) return false
                event.preventDefault()
                return replaceWholeWritingDocument(replacement, { origin: 'structure' })
              }
              event.preventDefault()
              return replaceWholeWritingDocument('', { origin: 'structure' })
            }
            const unitIds = selectedWritingUnitIds(view.state)
            if (unitIds.length <= 1) return false
            event.preventDefault()
            warnBlockedStructureEdit('cross-unit-selection')
            return true
          }
        }
      }
    })]
  }
})

const currentDocument = ref(initialDocument)

function resolveEditorBlockSelection(currentEditor, probePosition, cursorPosition = probePosition) {
  const resolved = currentEditor.state.doc.resolve(
    Math.max(0, Math.min(currentEditor.state.doc.content.size, probePosition))
  )
  let unitDepth = -1
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === 'writingUnit') {
      unitDepth = depth
      break
    }
  }
  const blockDepth = unitDepth + 1
  if (unitDepth > 0 && blockDepth <= resolved.depth) {
    const unit = resolved.node(unitDepth)
    const node = resolved.node(blockDepth)
    const pos = resolved.before(blockDepth)
    return {
      node,
      unit,
      unitPos: resolved.before(unitDepth),
      pos,
      localOffset: editorBlockTextOffsetAtPosition(node, pos, cursorPosition)
    }
  }
  return null
}

function editorBlockPlainText(node) {
  if (node?.type?.name === 'blockquote') {
    const parts = []
    node.forEach((child) => parts.push(child.textContent || ''))
    return parts.join('\n\n')
  }
  return String(node?.textContent || '')
}

function collectDirectWritingBlocks(doc) {
  const blocks = []
  doc?.forEach?.((unit, unitPos) => {
    if (unit.type.name !== 'writingUnit') return
    unit.forEach((node, blockOffset) => {
      blocks.push({
        node,
        pos: unitPos + 1 + blockOffset,
        text: editorBlockPlainText(node)
      })
    })
  })
  return blocks
}

function buildEditorPlainTextSnapshot(currentEditor, startBlockSelection, endBlockSelection) {
  const { from, to } = currentEditor.state.selection
  const blocks = collectDirectWritingBlocks(currentEditor.state.doc)
  const fullText = blocks.map((block) => block.text).join('\n')
  if (currentEditor.state.selection instanceof AllSelection) {
    return { text: fullText, beforeText: '', afterText: '' }
  }
  const findBlockIndex = (selection) => blocks.findIndex((block) => (
    block.pos === selection?.pos
    || (
      selection?.node?.attrs?.nodeId
      && block.node.attrs?.nodeId === selection.node.attrs.nodeId
    )
  ))
  const startIndex = findBlockIndex(startBlockSelection)
  const endIndex = findBlockIndex(endBlockSelection)
  if (startIndex < 0 || endIndex < startIndex) {
    return {
      text: currentEditor.state.doc.textBetween(from, to, '\n'),
      beforeText: currentEditor.state.doc.textBetween(0, from, '\n'),
      afterText: currentEditor.state.doc.textBetween(to, currentEditor.state.doc.content.size, '\n')
    }
  }
  const absoluteOffset = (index, localOffset) => {
    const prefix = blocks.slice(0, index).reduce((length, block) => length + block.text.length + 1, 0)
    return prefix + Math.max(0, Math.min(blocks[index].text.length, Number(localOffset) || 0))
  }
  const start = absoluteOffset(startIndex, startBlockSelection?.localOffset)
  const end = absoluteOffset(endIndex, endBlockSelection?.localOffset)
  return {
    text: fullText.slice(start, Math.max(start, end)),
    beforeText: fullText.slice(0, start),
    afterText: fullText.slice(Math.max(start, end))
  }
}

function editorBlockTextOffsetAtPosition(node, nodePos, documentPos) {
  const text = editorBlockPlainText(node)
  if (!node || node.type.name !== 'blockquote') {
    return Math.max(0, Math.min(text.length, documentPos - nodePos - 1))
  }
  let plainOffset = 0
  let childPos = nodePos + 1
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    const childTextLength = child.textContent.length
    const childTextStart = childPos + 1
    const childTextEnd = childTextStart + child.content.size
    if (documentPos <= childTextEnd) {
      return Math.max(0, Math.min(text.length, plainOffset + documentPos - childTextStart))
    }
    plainOffset += childTextLength
    childPos += child.nodeSize
    if (index < node.childCount - 1) plainOffset += 2
  }
  return text.length
}

function editorDocumentPositionAtBlockOffset(location, requestedOffset = 0) {
  const node = location?.node
  const nodePos = Number(location?.pos)
  if (!node || !Number.isFinite(nodePos)) return null
  const text = editorBlockPlainText(node)
  let remaining = Math.max(0, Math.min(text.length, Number(requestedOffset) || 0))
  if (node.type.name !== 'blockquote') return nodePos + 1 + remaining
  let childPos = nodePos + 1
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    const childTextLength = child.textContent.length
    if (remaining <= childTextLength) return childPos + 1 + remaining
    remaining -= childTextLength
    childPos += child.nodeSize
    if (index < node.childCount - 1) remaining = Math.max(0, remaining - 2)
  }
  return Math.max(nodePos + 1, nodePos + node.nodeSize - 1)
}

function buildSelectionSnapshot(currentEditor) {
  const { from, to } = currentEditor.state.selection
  const startBlockSelection = resolveEditorBlockSelection(currentEditor, from)
  const endBlockSelection = from === to
    ? startBlockSelection
    : resolveEditorBlockSelection(currentEditor, Math.max(from, to - 1), to) || startBlockSelection
  const startBlock = startBlockSelection?.node
  const plainTextSnapshot = buildEditorPlainTextSnapshot(
    currentEditor,
    startBlockSelection,
    endBlockSelection
  )
  const resolveCanonicalTarget = (blockSelection) => {
    const unitId = String(blockSelection?.unit?.attrs?.unitId || '')
    const nodeId = String(blockSelection?.node?.attrs?.nodeId || '')
    const unit = (currentDocument.value?.content || []).find((candidate) => (
      String(candidate?.attrs?.unitId || '') === unitId
    ))
    const node = (unit?.content || []).find((candidate) => (
      String(candidate?.attrs?.nodeId || '') === nodeId
    ))
    return {
      unitId: unitId || null,
      unitRevision: Number(unit?.attrs?.unitRevision ?? blockSelection?.unit?.attrs?.unitRevision ?? 0),
      nodeId: nodeId || null,
      nodeRevision: Number(node?.attrs?.nodeRevision ?? blockSelection?.node?.attrs?.nodeRevision ?? 0)
    }
  }
  // editorContentToWritingDocument 会推进 canonical revision，但不会为了版本号
  // 再向 ProseMirror 回写一轮事务。选区身份因此必须按稳定 ID 回查当前文档，
  // 不能继续读取 editor node 上的旧 revision。
  const startTarget = resolveCanonicalTarget(startBlockSelection)
  const endTarget = resolveCanonicalTarget(endBlockSelection)
  const markdownFrom = getWritingMarkdownPosition(
    currentDocument.value,
    startTarget.nodeId,
    startBlockSelection?.localOffset
  )
  const markdownTo = getWritingMarkdownPosition(
    currentDocument.value,
    endTarget.nodeId,
    endBlockSelection?.localOffset
  )
  let cursorRect = null
  if (from !== to) {
    try {
      const head = currentEditor.state.selection.head
      const domPosition = currentEditor.view.domAtPos(head, head === from ? -1 : 1)
      const caretRange = document.createRange()
      caretRange.setStart(domPosition.node, domPosition.offset)
      caretRange.collapse(true)
      const caretBox = caretRange.getBoundingClientRect()
      const coordinates = caretBox.height > 0
        ? caretBox
        : currentEditor.view.coordsAtPos(head, -1)
      cursorRect = {
        top: coordinates.top,
        right: coordinates.right,
        bottom: coordinates.bottom,
        left: coordinates.left
      }
    } catch {
      cursorRect = null
    }
  }
  return {
    from,
    to,
    empty: from === to,
    text: plainTextSnapshot.text,
    beforeText: plainTextSnapshot.beforeText,
    afterText: plainTextSnapshot.afterText,
    currentNodeText: editorBlockPlainText(startBlock),
    cursorLocalOffset: Number(startBlockSelection?.localOffset || 0),
    selectionLocalStart: Number(startBlockSelection?.localOffset || 0),
    selectionLocalEnd: Number(endBlockSelection?.localOffset || 0),
    nodeId: startTarget.nodeId,
    unitId: startTarget.unitId,
    unitRevision: startTarget.unitRevision,
    selectionBookmark: currentEditor.state.selection.getBookmark(),
    documentRevision: Number(currentDocument.value?.revision || 0),
    nodeRevision: startTarget.nodeRevision,
    startNodeId: startTarget.nodeId,
    startNodeRevision: startTarget.nodeRevision,
    endUnitId: endTarget.unitId,
    endUnitRevision: endTarget.unitRevision,
    endNodeId: endTarget.nodeId,
    endNodeRevision: endTarget.nodeRevision,
    markdownFrom,
    markdownTo,
    activeMarks: {
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      strike: currentEditor.isActive('strike'),
      code: currentEditor.isActive('code')
    },
    cursorRect
  }
}

function emitCurrentSelectionSnapshot(currentEditor) {
  emit('selection-change', buildSelectionSnapshot(currentEditor))
}

function publishCurrentSelectionState(currentEditor) {
  const { from, to } = currentEditor.state.selection
  if (
    commandMenu.value.open
    && (from !== commandMenu.value.anchorFrom || to !== commandMenu.value.anchorTo)
  ) closeCommandMenu()
  emitCurrentSelectionSnapshot(currentEditor)
  updateCurrentLineOverlay()
  scrollTypewriterIntoView()
}

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      document: false,
      heading: { levels: [1, 2, 3] },
      // canonical writingDocument 只建模 prose/heading/divider/quote；关闭
      // 无法无损往返的节点，避免列表/代码块/硬换行在保存时被吞稿。
      bulletList: false,
      orderedList: false,
      listItem: false,
      codeBlock: false,
      hardBreak: false,
      history: true
    }),
    WritingDocumentNode,
    WritingUnitNode,
    MediaReferenceNode,
    WritingNodeAttributes,
    WritingUnitIntegrity,
    BlankAreaClickSync,
    SelectAllHandler,
    AnnotationDecorations,
    WorldbookMentionDecorations,
    ChinesePunctuationDecorations,
    BlockGapDecorations,
    FocusParagraphDecorations,
    LiveMarkdownInput,
    LiveMarkdownDecorations,
    WritingCommandMenu,
    InlineSuggestionDecorations,
    UniqueID.configure({
      types: ['paragraph', 'heading', 'horizontalRule', 'blockquote', 'mediaReference'],
      attributeName: 'nodeId',
      generateID: ({ node, pos }) => `node-editor-${node.type.name}-${pos}-${Date.now().toString(36)}`
    })
  ],
  content: {
    type: 'doc',
    content: writingDocumentToEditorContent(currentDocument.value)
  },
  editable: props.editable,
  onCreate({ editor: currentEditor }) {
    emit('ready', currentEditor)
    // 初始 document 已由父页完成 hydrate。这里不能伪装成一次用户编辑，
    // 否则刚打开章节就会进入未保存 → 自动保存，并触发观察器与“已保存”闪现。
    emitCurrentSelectionSnapshot(currentEditor)
    updateCurrentLineOverlay()
  },
  onUpdate({ editor: currentEditor, transaction }) {
    if (!transaction.docChanged) return
    // U33：键盘 undo/redo 的事务副作用可能使 PM view 丢失焦点（DOM 重渲染
    // 替换含 caret 的节点），导致后续 redo/继续编辑的键盘事件无法到达编辑器。
    // historyUndo/historyRedo 后显式恢复焦点。
    if (writingInputType(transaction) === 'historyUndo' || writingInputType(transaction) === 'historyRedo') {
      if (!currentEditor.view.dom.contains(document.activeElement)) {
        // setTimeout 而非 nextTick：PM 事务的 DOM 渲染在 microtask 之后，
        // nextTick 的 focus 会被后续渲染覆盖。
        setTimeout(() => {
          if (componentUnmounting || !currentEditor.view || currentEditor.isDestroyed) return
          currentEditor.commands.focus(undefined, { scrollIntoView: false })
        }, 0)
      }
    }
    const transition = transaction.getMeta('writingUnitTransition') || null
    emitDocument(currentEditor, transition)
    // Tiptap 会先发 selectionUpdate、再发 update。文本事务若在前一个事件里
    // 发布选区，markdown 偏移仍会按旧 document 计算。文档真源更新后在这里
    // 统一发布一次；父页随后处理 input 时拿到的也是同一 revision 的选区。
    publishCurrentSelectionState(currentEditor)
    if (transition) emit('unit-transition', transition)
    emit('input', {
      inputType: writingInputType(transaction),
      composing: Boolean(transaction.getMeta('composition'))
    })
  },
  onSelectionUpdate({ editor: currentEditor, transaction }) {
    if (applyingExternalDocument) return
    // docChanged 事务由紧随其后的 onUpdate 在 currentDocument 更新后发布，
    // 防止同一次输入出现一份旧 markdown 坐标和一份新坐标。
    if (transaction?.docChanged) return
    publishCurrentSelectionState(currentEditor)
  },
  onTransaction({ editor: currentEditor, transaction }) {
    // 光标处 Ctrl/Cmd+B/I 只改变 stored marks，不一定触发 selectionUpdate
    // 或 docChanged；仍需把真实 Tiptap mark 状态同步给外层工具栏。
    if (transaction.storedMarksSet && !transaction.docChanged && !transaction.selectionSet) {
      emitCurrentSelectionSnapshot(currentEditor)
    }
  },
  onFocus() {
    emit('editor-focus')
    updateCurrentLineOverlay()
    scrollTypewriterIntoView()
  },
  onBlur() {
    closeCommandMenu()
    currentLineOverlay.value.visible = false
    emit('editor-blur')
  }
})

// 打字机滚动（P0c）：光标行保持视口垂直居中。直接 scrollTop 赋值，
// 不用 smooth——逐字平滑滚动会晕。
function scrollTypewriterIntoView() {
  if (!props.typewriter) return
  const currentEditor = editor.value
  const scrollElement = getScrollElement()
  if (!currentEditor || !scrollElement || !currentEditor.view.hasFocus()) return
  if (!currentEditor.state.selection.empty) return
  try {
    const coordinates = currentEditor.view.coordsAtPos(currentEditor.state.selection.head, 1)
    const box = scrollElement.getBoundingClientRect()
    const delta = (coordinates.top + coordinates.bottom) / 2 - (box.top + box.height / 2)
    if (Math.abs(delta) > 1) {
      programmaticScrollUntil = Date.now() + 120
      // coordsAtPos/DOMRect 是视觉像素，scrollTop 是布局像素。应用级 zoom
      // 下不换算会每次只追赶一部分距离，连续输入时产生反复抖动。
      scrollElement.scrollTop += delta / getBodyUiScale()
    }
  } catch {
    // best-effort typewriter scrolling
  }
}

function updateCurrentLineOverlay() {
  const currentEditor = editor.value
  const root = notebookRoot.value
  if (!props.typewriter || !currentEditor || !root || !currentEditor.view.hasFocus() || !currentEditor.state.selection.empty) {
    currentLineOverlay.value.visible = false
    return
  }
  try {
    const coordinates = currentEditor.view.coordsAtPos(currentEditor.state.selection.head, 1)
    const rootBox = root.getBoundingClientRect()
    const editorBox = currentEditor.view.dom.getBoundingClientRect()
    const bodyZoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1
    const measuredScale = root.offsetWidth > 0 ? rootBox.width / root.offsetWidth : 1
    const scale = bodyZoom !== 1 ? bodyZoom : measuredScale
    const lineHeight = Number.parseFloat(getComputedStyle(currentEditor.view.dom).lineHeight)
    const geometry = resolveCurrentLineOverlayGeometry({
      coordinates,
      rootBox,
      editorBox,
      lineHeight,
      scale
    })
    currentLineOverlay.value = geometry ? {
      visible: true,
      ...geometry
    } : { visible: false, top: 0, left: 0, width: 0, height: 0 }
  } catch {
    currentLineOverlay.value.visible = false
  }
}

function emitDocument(currentEditor, transition = null) {
  const nextDocument = editorContentToWritingDocument(currentEditor.getJSON(), currentDocument.value)
  currentDocument.value = nextDocument
  if (currentEditor.storage) currentEditor.storage.writingDocument = nextDocument
  // 结构 transaction 的新文档与 transition 必须同拍交给父层。若父层先按
  // 普通文本变更重定位批注、随后才收到 split/merge，重复词会被第一次
  // 模糊匹配永久改错 offset，第二次 typed reconcile 已无法恢复。
  emit('update:document', nextDocument, transition)
  emit('update:modelValue', getWritingDocumentMarkdown(nextDocument))
}

function handleContextMenu(event) {
  const target = event?.target instanceof Element ? event.target : null
  // block composer / editable draft 是嵌在 EditorContent 内的独立表单所有者。
  // 它们必须保留系统右键菜单，绝不能把 cut/delete/paste 转发到旧的 PM 选区。
  if (
    !target?.closest?.('.ProseMirror')
    || target.closest(blockGapSelector.value)
    || target.closest('textarea, input, select, [contenteditable="true"]:not(.ProseMirror)')
  ) return
  event.preventDefault()
  // 鼠标右键的 button=2；Shift+F10/Menu 键及触屏长按通常为 0。后两者
  // 应保留浏览器已建立的 caret/selection，而不是拿合成坐标再命中别处。
  const keyboardTriggered = Number(event?.button || 0) !== 2
  // 右键点在现有选区外时，让“拆分/合并/粘贴”等命令明确作用于点击处；
  // 点在已有选区内则保留整段选区，供复制、剪切和删除使用。
  const currentEditor = editor.value
  const hit = keyboardTriggered
    ? null
    : currentEditor?.view?.posAtCoords?.({ left: event.clientX, top: event.clientY })
  if (!keyboardTriggered && currentEditor && Number.isFinite(hit?.pos)) {
    const { from, to, empty } = currentEditor.state.selection
    if (empty || hit.pos < from || hit.pos > to) {
      const safePos = Math.max(0, Math.min(currentEditor.state.doc.content.size, hit.pos))
      const selection = TextSelection.near(currentEditor.state.doc.resolve(safePos))
      currentEditor.view.dispatch(currentEditor.state.tr.setSelection(selection))
    }
  }
  let anchorRect = null
  if (keyboardTriggered && currentEditor) {
    try {
      anchorRect = currentEditor.view.coordsAtPos(currentEditor.state.selection.head, 1)
    } catch {
      anchorRect = null
    }
  }
  emit('context-menu', event, { keyboardTriggered, anchorRect })
}

function refreshInlineSuggestionLayer() {
  if (!editor.value) return
  editor.value.view.dispatch(editor.value.state.tr.setMeta(inlineSuggestionPluginKey, true))
}

function eventBelongsToCanonicalEditor(event) {
  const target = event?.target instanceof Element ? event.target : null
  return Boolean(target?.closest?.('.ProseMirror') && !target.closest(blockGapSelector.value))
}

function cancelPendingComposition(reason = 'cancelled') {
  const owned = interactionComposing.value
    || compositionSettling.value
    || allSelectionCompositionActive
    || Boolean(compositionRefreshTimer)
  compositionSessionToken += 1
  if (compositionRefreshTimer) clearTimeout(compositionRefreshTimer)
  compositionRefreshTimer = null
  allSelectionCompositionActive = false
  selectAllIntentActive = false
  interactionComposing.value = false
  compositionSettling.value = false
  if (owned) emit('composition-change', false, { reason })
}

function handleCompositionStart(event) {
  if (!eventBelongsToCanonicalEditor(event)) return
  if (compositionRefreshTimer) {
    clearTimeout(compositionRefreshTimer)
    compositionRefreshTimer = null
  }
  compositionSessionToken += 1
  compositionSettling.value = false
  // 全选后的 provisional IME DOM 不得提前清空正文。compositionend 有最终
  // 文本时再提交一次 typed replace-all；取消候选（空 data）保持原稿不变。
  // U42：不依赖 instanceof AllSelection——PM 在 writingUnit 包裹的文档中
  // 可能把全选映射为跨全文档的 TextSelection 而非 AllSelection。
  // 改为检查选区是否覆盖整个文档内容。
  // U42：优先检查 selectAll 意图标记（不依赖 PM 选区类型——writingUnit
  // 结构下 PM 可能将全选同步为 TextSelection）。标记在 compositionend 后清除。
  const compSel = editor.value?.state.selection
  const compDocSize = editor.value.state.doc.content.size
  const coversWholeDoc = compSel && (
    compSel instanceof AllSelection
    || (compSel instanceof TextSelection && compSel.from <= 1 && compSel.to >= compDocSize - 1)
  )
  allSelectionCompositionActive = selectAllIntentActive || coversWholeDoc
  selectAllIntentActive = false
  interactionComposing.value = true
  closeCommandMenu()
  emit('composition-change', true)
}

function handleCompositionEnd(event) {
  if (!eventBelongsToCanonicalEditor(event)) return
  interactionComposing.value = false
  compositionSettling.value = true
  const replaceAllAfterComposition = allSelectionCompositionActive
  const committedCompositionText = replaceAllAfterComposition ? String(event?.data || '') : ''
  const settledSessionToken = compositionSessionToken
  const settledDocumentGeneration = editorDocumentGeneration
  // capture 回调先于 ProseMirror 的 compositionend 处理。等当前事件与 Vue
  // prop flush 都结束，再显式 flush DOMObserver 并重绘装饰，避免打断候选串
  // 或丢掉最后一个合成字符。
  queueMicrotask(() => {
    if (
      componentUnmounting
      || compositionSessionToken !== settledSessionToken
      || editorDocumentGeneration !== settledDocumentGeneration
    ) return
    compositionRefreshTimer = setTimeout(() => {
      compositionRefreshTimer = null
      if (
        componentUnmounting
        || compositionSessionToken !== settledSessionToken
        || editorDocumentGeneration !== settledDocumentGeneration
      ) return
      editor.value?.view?.domObserver?.flush?.()
      if (replaceAllAfterComposition && committedCompositionText) {
        replaceWholeWritingDocument(committedCompositionText, { origin: 'structure' })
      }
      allSelectionCompositionActive = false
      compositionSettling.value = false
      refreshInlineSuggestionLayer()
      // 直到 DOMObserver/final transaction 已完成才交还交互 owner。父层会在
      // 此事件后冻结联想 fingerprint；提前发会把合成前快照排进定时器，最终
      // 因 fingerprint 不一致静默丢掉整次中文输入后的联想。
      emit('composition-change', false)
    }, 0)
  })
}

function handlePaste(event) {
  // Composer / editable draft physically live inside the PM widget, but paste
  // belongs to their textarea. Never inspect or mutate the frozen PM selection.
  if (!eventBelongsToCanonicalEditor(event)) return
  closeCommandMenu()
  emit('writing-paste', event)
  const currentEditor = editor.value
  if (!currentEditor) return
  if (currentEditor.state.selection instanceof AllSelection) {
    const text = event.clipboardData?.getData?.('text/plain')
    // 文件剪贴板、无 text/plain 或读取失败都保持原稿；只有拿到明确的
    // 非空纯文本时才把“全选 + 粘贴”解释为 typed replace-all。
    if (typeof text !== 'string' || !text) return
    event.preventDefault()
    replaceWholeWritingDocument(text, { origin: 'structure' })
    return
  }
  const unitIds = selectedWritingUnitIds(currentEditor.state)
  if (unitIds.length <= 1) return
  event.preventDefault()
  warnBlockedStructureEdit('cross-unit-paste')
}

function handleScrollOwnerScroll() {
  updateCurrentLineOverlay()
  const now = Date.now()
  const userOwned = now <= userScrollIntentUntil
  if (commandMenu.value.open && userOwned) {
    // 命令锚点属于原空行；用户主动浏览后不能把菜单钉在视口边缘、继续
    // 对离屏旧位置执行操作。
    closeCommandMenu()
  } else if (commandMenu.value.open && editor.value?.view) {
    if (lastCommandMenuGeometry) positionCommandMenu(editor.value.view, lastCommandMenuGeometry)
    else measureAndPositionCommandMenu(editor.value.view)
  }
  // wheel/touch/滚动条意图优先于刚发生的打字机自动居中窗口；否则用户
  // 紧接着主动浏览时，滚动事件会被误吞，迟到 Ghost 仍会弹出。
  if (now <= userScrollIntentUntil) emit('scroll-owner', { source: 'user' })
  else if (now > programmaticScrollUntil) emit('scroll-owner', { source: 'selection-follow' })
}

function markUserScrollIntent(event) {
  if (event.type === 'pointerdown' && event.target !== boundScrollOwner) return
  userScrollIntentUntil = Date.now() + 500
}

function handleViewportChange() {
  bindScrollOwner()
  updateCurrentLineOverlay()
  if (commandMenu.value.open && editor.value?.view) measureAndPositionCommandMenu(editor.value.view)
}

// Authoring 的章节标题和正文属于同一张稿纸，因此由外层
// .wall__dossier-scroll 唯一持有滚动；独立挂载时再回退到编辑器 surface。
// 所有依赖视口的浮层和打字机滚动都必须使用同一个 owner，不能各滚各的。
let boundScrollOwner = null

function getScrollElement() {
  const root = notebookRoot.value
  return root?.closest?.('.wall__dossier-scroll')
    || notebookSurface.value?.$el
    || notebookSurface.value
    || null
}

function bindScrollOwner() {
  const nextOwner = getScrollElement()
  if (nextOwner === boundScrollOwner) return
  boundScrollOwner?.removeEventListener?.('scroll', handleScrollOwnerScroll)
  boundScrollOwner?.removeEventListener?.('wheel', markUserScrollIntent)
  boundScrollOwner?.removeEventListener?.('touchmove', markUserScrollIntent)
  boundScrollOwner?.removeEventListener?.('pointerdown', markUserScrollIntent)
  boundScrollOwner = nextOwner
  boundScrollOwner?.addEventListener?.('scroll', handleScrollOwnerScroll, { passive: true })
  boundScrollOwner?.addEventListener?.('wheel', markUserScrollIntent, { passive: true })
  boundScrollOwner?.addEventListener?.('touchmove', markUserScrollIntent, { passive: true })
  boundScrollOwner?.addEventListener?.('pointerdown', markUserScrollIntent, { passive: true })
}

watch(() => props.editable, (editable) => {
  editor.value?.setEditable(editable)
})

function applyExternalWritingDocument(nextDocument) {
  const currentEditor = editor.value
  if (!currentEditor) return
  // compositionend 的最终提交在下一轮 task 执行。同 key 恢复快照/切换同一
  // 文档版本时必须先作废旧会话，否则迟到的全选 IME 文本会覆盖新文档。
  editorDocumentGeneration += 1
  cancelPendingComposition('external-document')
  closeCommandMenu()
  currentDocument.value = nextDocument
  applyingExternalDocument = true
  try {
    currentEditor.chain()
      .setMeta('addToHistory', false)
      .setContent({
        type: 'doc',
        content: writingDocumentToEditorContent(nextDocument)
      }, { emitUpdate: false })
      .run()
  } finally {
    applyingExternalDocument = false
  }
  if (currentEditor.storage) currentEditor.storage.writingDocument = nextDocument
  // setContent 可能保留相同的 ProseMirror selection，因而不会触发
  // selectionUpdate；切章完成后仍须主动公布新文档下的真 selection。
  emitCurrentSelectionSnapshot(currentEditor)
  updateCurrentLineOverlay()
  scrollTypewriterIntoView()
}

watch(() => props.document, (nextDocument) => {
  if (!nextDocument || !editor.value) return
  // revision 只在单文档内单调；切章时两个不同文档完全可能同为 revision 0。
  // 仅凭 revision 跳过会留下上一章的 ProseMirror doc 与稳定节点 ID。
  if (nextDocument === currentDocument.value) return
  // 编辑器自己发出的事务会经页面回写再回来（保存边界、批注 reconcile 会
  // 产生同 revision 的克隆对象）。内容一致时 setContent 重放会打断撤销栈
  // 并把光标摔到文末；只有 markdown 投影真正不同才是外部文档切换。
  // 同内容克隆（保存边界/批注 reconcile 产生的引用替换）：直接跳过。
  // setContent 重放会打断撤销栈（V1 修复的 P0）；克隆与编辑器自身的文档
  // 内容完全一致，编辑器持有的 currentDocument 就是内容真源，任何书账
  // 替换都会让采用事务的候选校验拿到另一份引用而误判 stale。
  if (getWritingDocumentMarkdown(nextDocument) === getWritingDocumentMarkdown(currentDocument.value)) return
  applyExternalWritingDocument(nextDocument)
})

watch(() => props.modelValue, (nextMarkdown) => {
  if (!editor.value) return
  const nextDocument = createWritingDocument(nextMarkdown)
  if (getWritingDocumentMarkdown(currentDocument.value) === nextMarkdown) return
  applyExternalWritingDocument(nextDocument)
})

watch(() => [props.annotations, props.activeAnnotationId], () => {
  if (!editor.value) return
  editor.value.view.dispatch(editor.value.state.tr.setMeta(annotationPluginKey, true))
}, { deep: true })

watch(() => props.worldbookMentions, () => {
  if (!editor.value) return
  editor.value.view.dispatch(editor.value.state.tr.setMeta(worldbookMentionPluginKey, true))
}, { deep: true })

watch(() => props.focusParagraph, () => {
  if (!editor.value) return
  editor.value.view.dispatch(editor.value.state.tr.setMeta(focusParagraphPluginKey, true))
})

watch(() => props.typewriter, () => nextTick(updateCurrentLineOverlay))

watch(() => [props.blockComposerOpen, props.blockComposerTarget, props.blockPreview], () => {
  if (!editor.value) return
  if (props.blockComposerOpen || props.blockPreview?.text) closeCommandMenu()
  editor.value.view.dispatch(editor.value.state.tr.setMeta(blockGapPluginKey, true))
  refreshInlineSuggestionLayer()
})

watch(
  () => [props.inlineSuggestionVisible, props.inlineSuggestion, props.inlineSuggestionGenerating, props.inlineSuggestionError, props.interactionOwner],
  ([visible, suggestion, generating, error], [wasVisible, wasSuggestion, wasGenerating, wasError]) => {
    const active = Boolean((visible && suggestion) || generating || error)
    const wasActive = Boolean(wasVisible || wasGenerating || wasError)
    if (!active) inlineSuggestionAnchor.value = null
    // 部分采纳会同步推进 selection，随后把 props.suggestion 替换为余文。
    // owner 仍是 inline-review，但锚点必须跟到新光标；否则余文装饰消失，
    // 键盘处理器却仍会吞 Tab/Ctrl+→，形成“隐藏采纳”。
    else if (!wasActive || suggestion !== wasSuggestion) {
      inlineSuggestionAnchor.value = editor.value?.state.selection.from ?? null
    }
    if (editor.value) editor.value.view.dispatch(editor.value.state.tr.setMeta(inlineSuggestionPluginKey, true))
  }
)

onMounted(() => {
  nextTick(bindScrollOwner)
  window.addEventListener('resize', handleViewportChange, { passive: true })
  window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true })
  window.visualViewport?.addEventListener('scroll', handleViewportChange, { passive: true })
})

onBeforeUnmount(() => {
  componentUnmounting = true
  if (commandMenu.value.open) closeCommandMenu()
  cancelPendingComposition('editor-unmount')
  boundScrollOwner?.removeEventListener?.('scroll', handleScrollOwnerScroll)
  boundScrollOwner?.removeEventListener?.('wheel', markUserScrollIntent)
  boundScrollOwner?.removeEventListener?.('touchmove', markUserScrollIntent)
  boundScrollOwner?.removeEventListener?.('pointerdown', markUserScrollIntent)
  boundScrollOwner = null
  window.removeEventListener('resize', handleViewportChange)
  window.visualViewport?.removeEventListener('resize', handleViewportChange)
  window.visualViewport?.removeEventListener('scroll', handleViewportChange)
  editor.value?.destroy()
})

function focus(options = {}) {
  const view = editor.value?.view
  if (!view) return
  // tiptap commands.focus() 走异步 focus 管理：右键菜单等浮层刚卸载、焦点
  // 还在浮层控件上时，PM 的 view.focus() 只做 dom.focus() 不主动回写 DOM
  // 选区——外部拿到的仍是“无选区”。这里显式把内部 state 选区写到 DOM。
  view.focus()
  try {
    const selection = view.state.selection
    const domSel = window.getSelection()
    if (!domSel) return
    const anchor = view.domAtPos(selection.anchor)
    const head = view.domAtPos(selection.head)
    // 保留反向选区；Range.setEnd 在 end < start 时会折叠选区。
    domSel.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
  } catch { /* 空文档等场景忽略 */ }
  if (options?.scrollIntoView !== false) {
    try { view.dispatch(view.state.tr.scrollIntoView()) } catch { /* ignore */ }
  }
}

function blur() {
  return Boolean(editor.value?.commands.blur?.())
}

function hasEditorFocus() {
  return Boolean(editor.value?.view?.hasFocus?.())
}

function insertText(text) {
  if (!editor.value || text == null) return false
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).insertContent(String(text)).run()
}

function sealEditorHistoryGroup(currentEditor = editor.value) {
  if (!currentEditor) return
  currentEditor.view.dispatch(
    closeHistory(currentEditor.state.tr).setMeta('addToHistory', false)
  )
}

function createPlainTextParagraphs(state, value, options = {}) {
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return []
  const marks = Object.prototype.hasOwnProperty.call(options, 'marks')
    ? options.marks
    : (state.storedMarks || state.selection.$from.marks())
  const normalized = String(value).replace(/\r\n?/g, '\n')
  const lines = options.blankLineParagraphs ? normalized.split(/\n{2,}/) : normalized.split('\n')
  return lines.map((line) => paragraphType.create(
    {
      nodeId: `node-editor-paste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      nodeRevision: 0,
      nodeKind: 'prose',
      rawMarkdown: null,
      leadingMarkdown: '',
      originalText: null
    },
    line ? state.schema.text(line, marks) : null
  ))
}

function replaceWholeWritingDocument(text = '', options = {}) {
  const currentEditor = editor.value
  if (!currentEditor) return false
  const { state } = currentEditor
  const unitType = state.schema.nodes.writingUnit
  const firstUnit = state.doc.firstChild
  if (!unitType || !firstUnit) return false
  const previousUnitIds = writingUnitIds(state.doc)
  const unitId = String(firstUnit.attrs?.unitId || `unit-editor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`)
  const paragraphs = createPlainTextParagraphs(state, text)
  if (!paragraphs.length) return false
  const replacementUnit = unitType.create({
    ...firstUnit.attrs,
    unitId,
    unitRevision: Number(firstUnit.attrs?.unitRevision || 0) + 1,
    unitKind: 'passage',
    sceneId: null,
    originRefs: []
  }, paragraphs)
  const transaction = state.tr
    .replaceWith(0, state.doc.content.size, replacementUnit)
    .setMeta('writingInputOrigin', options.origin === 'writing-agent' ? 'writing-agent' : 'structure')
    .setMeta('writingUnitTransition', {
      transitionId: `transition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      type: String(text) ? 'replace-all' : 'clear',
      keptUnitId: unitId,
      removedUnitId: null,
      removedUnitIds: previousUnitIds.filter((id) => id !== unitId),
      affectedUnitIds: previousUnitIds,
      nodeUnitMap: Object.fromEntries(paragraphs.map((node) => [node.attrs.nodeId, unitId]))
    })
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.max(1, transaction.doc.content.size - 1)), -1))
  currentEditor.view.dispatch(closeHistory(transaction))
  sealEditorHistoryGroup(currentEditor)
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function insertPlainText(text, options = {}) {
  const currentEditor = editor.value
  const value = String(text ?? '')
  if (!currentEditor || !value) return false
  const origin = options.origin === 'writing-agent' ? 'writing-agent' : 'input'
  const normalized = value.replace(/\r\n?/g, '\n')
  const { state } = currentEditor
  const selectedUnitIds = selectedWritingUnitIds(state)
  if (state.selection instanceof AllSelection) {
    return replaceWholeWritingDocument(normalized, { origin })
  }
  if (selectedUnitIds.length > 1) {
    warnBlockedStructureEdit('cross-unit-insert')
    return false
  }
  const transaction = state.tr.setMeta('writingInputOrigin', origin)
  if (normalized.includes('\n')) {
    const paragraphs = createPlainTextParagraphs(state, normalized)
    if (!paragraphs.length) return false
    transaction.replaceSelection(Slice.maxOpen(Fragment.fromArray(paragraphs)))
  } else {
    transaction.insertText(normalized, state.selection.from, state.selection.to)
  }
  currentEditor.view.dispatch(origin === 'writing-agent' ? closeHistory(transaction) : transaction)
  if (origin === 'writing-agent') sealEditorHistoryGroup(currentEditor)
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function insertDivider() {
  const currentEditor = editor.value
  if (!currentEditor) return false
  const { state } = currentEditor
  const probe = state.selection.empty ? state.selection.from : Math.max(state.selection.from, state.selection.to - 1)
  const target = resolveEditorBlockSelection(currentEditor, probe, state.selection.to)
  const dividerType = state.schema.nodes.horizontalRule
  const paragraphType = state.schema.nodes.paragraph
  if (!target || !dividerType || !paragraphType) return false

  const freshNodeAttrs = (kind) => ({
    nodeId: `node-editor-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    nodeRevision: 0,
    nodeKind: kind === 'divider' ? 'divider' : 'prose',
    rawMarkdown: null,
    leadingMarkdown: '',
    originalText: null
  })
  const divider = dividerType.create(freshNodeAttrs('divider'))
  const blockEnd = target.pos + target.node.nodeSize
  const unitContentEnd = target.unitPos + 1 + target.unit.content.size
  const needsTrailingParagraph = blockEnd >= unitContentEnd
  const trailingParagraph = needsTrailingParagraph
    ? paragraphType.create(freshNodeAttrs('paragraph'))
    : null
  const replacement = trailingParagraph ? [divider, trailingParagraph] : [divider]
  const replaceEmptyBlock = state.selection.empty
    && target.node.type.name === 'paragraph'
    && !target.node.textContent
  const transaction = (replaceEmptyBlock
    ? state.tr.replaceWith(target.pos, blockEnd, replacement)
    : state.tr.insert(blockEnd, replacement))
    .setMeta('writingInputOrigin', 'structure')
  const selectionAnchor = replaceEmptyBlock ? target.pos + divider.nodeSize : blockEnd + divider.nodeSize
  transaction.setSelection(TextSelection.near(
    transaction.doc.resolve(Math.min(transaction.doc.content.size, selectionAnchor)),
    1
  ))
  currentEditor.view.dispatch(closeHistory(transaction).scrollIntoView())
  sealEditorHistoryGroup(currentEditor)
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return true
}

// 一次 AI 正文 = 一个新 writingUnit（plan Task 2.3 / worldbook scene closure Task 3）：
// 原子插入 schema-v3 单元（稳定 unitId/nodeId + originRefs）。
// 目标感知：afterUnitId 指定插入位置（目标单元之后）；目标缺失/revision 过期时
// 返回 typed 失败，绝不静默回退到文档末尾。
function insertAsNewWritingUnit({ text, originRefs, afterUnitId, expectedUnitRevision } = {}) {
  const currentEditor = editor.value
  const value = String(text ?? '')
  if (!currentEditor || !value) return { ok: false, reason: 'no-editor' }
  const originRef = Array.isArray(originRefs) ? originRefs[0] : null
  const created = createWritingUnitFromAuthoringTurn({ text: value, originRef })
  if (!created.ok) return { ok: false, reason: 'invalid-turn' }
  const schema = currentEditor.state.schema
  const unitType = schema.nodes.writingUnit
  if (!unitType) return { ok: false, reason: 'no-unit-type' }
  // 定位目标单元（顶层 writingUnit）。
  let target = null
  if (afterUnitId) {
    currentEditor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'writingUnit' && node.attrs.unitId === afterUnitId) {
        target = { node, pos: offset }
      }
    })
    if (!target) return { ok: false, reason: 'target-unit-missing' }
    // 修订比较必须读 canonical 文档（currentDocument）：PM 节点的
    // unitRevision attrs 只在节点创建时写入，页面侧 revision 演进从不回写
    // PM attrs——旧 setContent 风暴掩盖了这一点，同内容守卫后暴露。
    const canonicalUnit = (currentDocument.value?.content || []).find(
      (unit) => unit?.attrs?.unitId === afterUnitId
    )
    const currentRevision = Number(
      (canonicalUnit || target.node).attrs?.unitRevision || 0
    )
    if (
      expectedUnitRevision !== null && expectedUnitRevision !== undefined
      && currentRevision !== Number(expectedUnitRevision || 0)
    ) {
      return { ok: false, reason: 'target-unit-stale' }
    }
  }
  const paragraphType = schema.nodes.paragraph
  const children = created.unit.content.map((node) => {
    const paragraph = paragraphType.create(
      { ...node.attrs, nodeKind: node.attrs.kind },
      node.content.map((inline) => schema.text(inline.text || ''))
    )
    return paragraph
  })
  const unitNode = unitType.create({
    unitId: created.unit.attrs.unitId,
    unitRevision: 0,
    unitKind: 'passage',
    sceneId: null,
    originRefs: [created.originRef]
  }, children)
  const replacedPlaceholder = Boolean(target
    && currentEditor.state.doc.childCount === 1
    && !target.node.textContent.trim())
  const insertPosition = target ? target.pos + target.node.nodeSize : Math.max(1, currentEditor.state.doc.content.size)
  const insertedStart = replacedPlaceholder ? target.pos : insertPosition
  const transaction = (replacedPlaceholder
    ? currentEditor.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, unitNode)
    : currentEditor.state.tr.insert(insertPosition, unitNode))
    .setMeta('writingAgentInsert', true)
    .setMeta('writingInputOrigin', 'writing-agent')
    .setMeta('writingUnitTransition', {
      type: 'insert',
      keptUnitId: created.unit.attrs.unitId,
      createdUnitId: created.unit.attrs.unitId,
      removedUnitId: null,
      nodeUnitMap: Object.fromEntries(children.map((child) => [child.attrs.nodeId, created.unit.attrs.unitId]))
    })
  const insertedEnd = Math.min(transaction.doc.content.size, insertedStart + unitNode.nodeSize - 1)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertedEnd), -1)).scrollIntoView()
  // AI 单元及其前后用户输入必须是三个独立 history events；否则 500ms
  // grouping 窗口内的一次 Undo 可能同时删掉用户上一笔或下一笔正文。
  currentEditor.view.dispatch(closeHistory(transaction))
  currentEditor.view.dispatch(closeHistory(currentEditor.state.tr).setMeta('addToHistory', false))
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return { ok: true, unitId: created.unit.attrs.unitId, replacedPlaceholder, focus: { unitId: created.unit.attrs.unitId, edge: 'end' } }
}

// 画师结果只以稳定 MediaAsset 引用进入正文。该命令在一次 ProseMirror
// transaction 中插入独立 writingUnit；目标或 document revision 变化时
// fail closed，调用方不能退回当前光标或文末。
function insertMediaReference({
  mediaAssetId,
  alt = '正文插画',
  sourceRefs = [],
  afterUnitId,
  expectedUnitRevision,
  expectedDocumentRevision
} = {}) {
  const currentEditor = editor.value
  const assetId = String(mediaAssetId || '').trim()
  const targetUnitId = String(afterUnitId || '').trim()
  if (!currentEditor || !assetId || !targetUnitId) return { ok: false, reason: 'invalid-media-reference' }
  if (expectedDocumentRevision !== undefined && expectedDocumentRevision !== null
    && String(currentDocument.value?.revision ?? '') !== String(expectedDocumentRevision)) {
    return { ok: false, reason: 'target-document-stale' }
  }

  let target = null
  currentEditor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'writingUnit' && String(node.attrs?.unitId || '') === targetUnitId) {
      target = { node, pos: offset }
    }
  })
  if (!target) return { ok: false, reason: 'target-unit-missing' }
  const canonicalUnit = (currentDocument.value?.content || []).find((unit) => (
    String(unit?.attrs?.unitId || '') === targetUnitId
  ))
  if (!canonicalUnit) return { ok: false, reason: 'target-unit-missing' }
  if (expectedUnitRevision !== undefined && expectedUnitRevision !== null
    && Number(canonicalUnit.attrs?.unitRevision || 0) !== Number(expectedUnitRevision || 0)) {
    return { ok: false, reason: 'target-unit-stale' }
  }

  const schema = currentEditor.state.schema
  const unitType = schema.nodes.writingUnit
  const mediaType = schema.nodes.mediaReference
  if (!unitType || !mediaType) return { ok: false, reason: 'media-node-unavailable' }
  const createdAt = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  const nodeId = `node-editor-media-${createdAt}`
  const unitId = `unit-editor-media-${createdAt}`
  const mediaNode = mediaType.create({
    nodeId,
    nodeRevision: 0,
    nodeKind: 'media-reference',
    rawMarkdown: null,
    leadingMarkdown: '\n',
    originalText: null,
    mediaAssetId: assetId,
    alt: String(alt || '正文插画').replace(/[\r\n]+/g, ' ').trim() || '正文插画',
    sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : []
  })
  const unitNode = unitType.create({
    unitId,
    unitRevision: 0,
    unitKind: 'source',
    sceneId: null,
    originRefs: []
  }, [mediaNode])
  const insertPosition = target.pos + target.node.nodeSize
  const transaction = currentEditor.state.tr
    .insert(insertPosition, unitNode)
    .setMeta('authoringMediaInsert', {
      mediaAssetId: assetId,
      unitId,
      nodeId,
      afterUnitId: targetUnitId
    })
    .setMeta('writingInputOrigin', 'media-insert')
    .setMeta('writingUnitTransition', {
      type: 'insert-media',
      keptUnitId: unitId,
      createdUnitId: unitId,
      removedUnitId: null,
      nodeUnitMap: { [nodeId]: unitId }
    })
  transaction.setSelection(NodeSelection.create(transaction.doc, insertPosition + 1)).scrollIntoView()
  currentEditor.view.dispatch(closeHistory(transaction))
  currentEditor.view.dispatch(closeHistory(currentEditor.state.tr).setMeta('addToHistory', false))
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return { ok: true, unitId, nodeId, mediaAssetId: assetId, afterUnitId: targetUnitId }
}

function stableBatchId(seed = '') {
  let hash = 2166136261
  const value = String(seed || '')
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// 一个 SceneBeatDraft = 一个编辑器 history event。全部 proposed units 在 dispatch
// 前完成目标、revision、origin、节点与 ID 校验；中途任何失败都保持正文零写入。
function insertWritingUnitBatch({ units = [], originRefs, sceneId = null, beatFingerprint = '', afterUnitId, expectedUnitRevision } = {}) {
  const currentEditor = editor.value
  const proposals = Array.isArray(units) ? units : []
  if (!currentEditor || !proposals.length) return { ok: false, reason: 'no-editor' }
  const originRef = Array.isArray(originRefs) ? originRefs[0] : null
  const schema = currentEditor.state.schema
  const unitType = schema.nodes.writingUnit
  const paragraphType = schema.nodes.paragraph
  if (!unitType || !paragraphType) return { ok: false, reason: 'no-unit-type' }

  let target = null
  if (afterUnitId) {
    currentEditor.state.doc.forEach((node, offset) => {
      if (node.type.name === 'writingUnit' && node.attrs.unitId === afterUnitId) target = { node, pos: offset }
    })
    if (!target) return { ok: false, reason: 'target-unit-missing' }
    const canonicalUnit = (currentDocument.value?.content || []).find(
      (unit) => unit?.attrs?.unitId === afterUnitId
    )
    const currentRevision = Number((canonicalUnit || target.node).attrs?.unitRevision || 0)
    if (expectedUnitRevision !== null && expectedUnitRevision !== undefined
      && currentRevision !== Number(expectedUnitRevision || 0)) {
      return { ok: false, reason: 'target-unit-stale' }
    }
  }

  const usedUnitIds = new Set()
  const usedNodeIds = new Set()
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === 'writingUnit' && node.attrs?.unitId) usedUnitIds.add(node.attrs.unitId)
    if (node.attrs?.nodeId) usedNodeIds.add(node.attrs.nodeId)
  })
  const createdUnits = []
  const unitNodes = []
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index] || {}
    const value = String(proposal.text ?? '').trim()
    const created = createWritingUnitFromAuthoringTurn({ text: value, originRef })
    if (!created.ok) return { ok: false, reason: 'invalid-turn' }
    const stableSeed = `${beatFingerprint || originRef?.requestId || 'beat'}\u0000${proposal.draftUnitId || index}`
    const unitId = `unit-${stableBatchId(stableSeed)}`
    if (usedUnitIds.has(unitId)) return { ok: false, reason: 'duplicate-unit-id' }
    usedUnitIds.add(unitId)
    const children = created.unit.content.map((node, nodeIndex) => {
      const nodeId = `node-${stableBatchId(`${stableSeed}\u0000${nodeIndex}\u0000${node.content?.[0]?.text || ''}`)}`
      if (usedNodeIds.has(nodeId)) return null
      usedNodeIds.add(nodeId)
      return paragraphType.create(
        { ...node.attrs, nodeId, nodeKind: node.attrs.kind },
        node.content.map((inline) => schema.text(inline.text || ''))
      )
    })
    if (children.some((child) => !child)) return { ok: false, reason: 'duplicate-node-id' }
    const unitNode = unitType.create({
      unitId,
      unitRevision: 0,
      unitKind: 'passage',
      sceneId: sceneId || null,
      originRefs: [created.originRef]
    }, children)
    createdUnits.push({ unitId, draftUnitId: proposal.draftUnitId || '', text: value })
    unitNodes.push(unitNode)
  }

  const replacedPlaceholder = Boolean(target
    && currentEditor.state.doc.childCount === 1
    && !target.node.textContent.trim())
  const insertPosition = target ? target.pos + target.node.nodeSize : Math.max(1, currentEditor.state.doc.content.size)
  const insertedStart = replacedPlaceholder ? target.pos : insertPosition
  const fragment = Fragment.fromArray(unitNodes)
  const transaction = (replacedPlaceholder
    ? currentEditor.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, fragment)
    : currentEditor.state.tr.insert(insertPosition, fragment))
    .setMeta('writingAgentInsert', true)
    .setMeta('writingInputOrigin', 'writing-agent')
    .setMeta('writingUnitTransition', {
      type: 'insert-batch',
      keptUnitId: createdUnits[0].unitId,
      createdUnitId: createdUnits[0].unitId,
      createdUnitIds: createdUnits.map((unit) => unit.unitId),
      removedUnitId: replacedPlaceholder ? afterUnitId : null,
      nodeUnitMap: Object.fromEntries(unitNodes.flatMap((unitNode, unitIndex) => (
        unitNode.content.content.map((child) => [child.attrs.nodeId, createdUnits[unitIndex].unitId])
      )))
    })
  const insertedSize = unitNodes.reduce((sum, node) => sum + node.nodeSize, 0)
  const insertedEnd = Math.min(transaction.doc.content.size, insertedStart + insertedSize - 1)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertedEnd), -1)).scrollIntoView()
  currentEditor.view.dispatch(closeHistory(transaction))
  currentEditor.view.dispatch(closeHistory(currentEditor.state.tr).setMeta('addToHistory', false))
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return {
    ok: true,
    unitId: createdUnits[0].unitId,
    unitIds: createdUnits.map((unit) => unit.unitId),
    units: createdUnits,
    replacedPlaceholder,
    focus: { unitId: createdUnits.at(-1).unitId, edge: 'end' }
  }
}

// “重写当前块”保留稳定 unitId，并把整次替换压成一个 history event。
// revision 守卫读取 canonical document；失败绝不回退为插入。
function replaceWritingUnit({ text, originRefs, unitId, expectedUnitRevision } = {}) {
  const currentEditor = editor.value
  const value = String(text ?? '')
  if (!currentEditor || !value || !unitId) return { ok: false, reason: 'no-editor' }
  let target = null
  currentEditor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'writingUnit' && node.attrs.unitId === unitId) target = { node, pos: offset }
  })
  if (!target) return { ok: false, reason: 'target-unit-missing' }
  const canonicalUnit = (currentDocument.value?.content || []).find(
    (unit) => unit?.attrs?.unitId === unitId
  )
  if (!canonicalUnit) return { ok: false, reason: 'target-unit-missing' }
  const currentRevision = Number((canonicalUnit || target.node).attrs?.unitRevision || 0)
  if (expectedUnitRevision !== null && expectedUnitRevision !== undefined
    && currentRevision !== Number(expectedUnitRevision || 0)) {
    return { ok: false, reason: 'target-unit-stale' }
  }
  const originRef = Array.isArray(originRefs) ? originRefs[0] : null
  const created = createWritingUnitFromAuthoringTurn({ text: value, originRef })
  if (!created.ok) return { ok: false, reason: 'invalid-turn' }
  const schema = currentEditor.state.schema
  const paragraphType = schema.nodes.paragraph
  const unitType = schema.nodes.writingUnit
  if (!paragraphType || !unitType) return { ok: false, reason: 'no-unit-type' }
  const children = created.unit.content.map((node) => paragraphType.create(
    { ...node.attrs, nodeKind: node.attrs.kind },
    node.content.map((inline) => schema.text(inline.text || ''))
  ))
  const replacement = unitType.create({
    unitId,
    unitRevision: currentRevision + 1,
    unitKind: target.node.attrs.unitKind || 'passage',
    sceneId: target.node.attrs.sceneId || null,
    originRefs: [...new Set([
      ...(Array.isArray(target.node.attrs.originRefs) ? target.node.attrs.originRefs : []),
      created.originRef
    ].filter(Boolean))]
  }, children)
  const transaction = currentEditor.state.tr
    .replaceWith(target.pos, target.pos + target.node.nodeSize, replacement)
    .setMeta('writingAgentReplace', true)
    .setMeta('writingInputOrigin', 'writing-agent')
  const replacementEnd = Math.min(transaction.doc.content.size, target.pos + replacement.nodeSize - 1)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(replacementEnd), -1)).scrollIntoView()
  currentEditor.view.dispatch(closeHistory(transaction))
  currentEditor.view.dispatch(closeHistory(currentEditor.state.tr).setMeta('addToHistory', false))
  currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return {
    ok: true,
    unitId,
    replacedUnit: true,
    beforeUnit: JSON.parse(JSON.stringify(canonicalUnit)),
    focus: { unitId, edge: 'end' }
  }
}

// 重写撤销/重做使用确切 schema-v3 单元快照，避免把目标 unitId 当成一次
// “插入/删除”历史。事务不进入 PM history；页面 sidecar receipt 负责方向与持久化。
function restoreWritingUnitSnapshot({ unitId, snapshot } = {}) {
  const currentEditor = editor.value
  if (!currentEditor || !unitId || !snapshot) return { ok: false, reason: 'snapshot-missing' }
  let target = null
  currentEditor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'writingUnit' && node.attrs.unitId === unitId) target = { node, pos: offset }
  })
  if (!target) return { ok: false, reason: 'target-unit-missing' }
  const content = writingDocumentToEditorContent({ schemaVersion: 3, revision: 0, content: [snapshot], meta: {} })
  const json = content?.[0]
  if (!json) return { ok: false, reason: 'snapshot-invalid' }
  let replacement
  try {
    replacement = currentEditor.state.schema.nodeFromJSON(json)
  } catch {
    return { ok: false, reason: 'snapshot-invalid' }
  }
  const transaction = currentEditor.state.tr
    .replaceWith(target.pos, target.pos + target.node.nodeSize, replacement)
    .setMeta('addToHistory', false)
    .setMeta('writingInputOrigin', 'historyRestore')
  currentEditor.view.dispatch(transaction)
  return { ok: true, unitId }
}

function runHistoryWithoutScroll(command) {
  const currentEditor = editor.value
  if (!currentEditor) return false
  const changed = command(currentEditor.state, currentEditor.view.dispatch)
  if (changed) currentEditor.commands.focus(undefined, { scrollIntoView: false })
  return Boolean(changed)
}

function undo() {
  return runHistoryWithoutScroll(undoNoScroll)
}

function redo() {
  return runHistoryWithoutScroll(redoNoScroll)
}

function toggleMark(mark) {
  if (!editor.value || !['bold', 'italic', 'strike', 'code'].includes(mark)) return false
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).toggleMark(mark).run()
}

function getSelection() {
  if (!editor.value) return null
  const { from, to } = editor.value.state.selection
  const startBlockSelection = resolveEditorBlockSelection(editor.value, from)
  const endBlockSelection = from === to
    ? startBlockSelection
    : resolveEditorBlockSelection(editor.value, Math.max(from, to - 1), to) || startBlockSelection
  const plainTextSnapshot = buildEditorPlainTextSnapshot(editor.value, startBlockSelection, endBlockSelection)
  let cursorRect = null
  if (from !== to) {
    try {
      const head = editor.value.state.selection.head
      const coordinates = editor.value.view.coordsAtPos(head, head === from ? -1 : 1)
      cursorRect = {
        top: coordinates.top,
        right: coordinates.right,
        bottom: coordinates.bottom,
        left: coordinates.left
      }
    } catch {
      cursorRect = null
    }
  }
  return {
    from,
    to,
    empty: from === to,
    text: plainTextSnapshot.text,
    previousText: plainTextSnapshot.beforeText.slice(-1),
    nextText: plainTextSnapshot.afterText.slice(0, 1),
    cursorRect
  }
}

function getRootElement() {
  return editor.value?.view?.dom || null
}

function getAnnotationAnchorMetrics(annotation) {
  if (!editor.value || !annotation) return null
  const blockPositions = new Map()
  collectDirectWritingBlocks(editor.value.state.doc).forEach(({ node, pos }) => {
    if (node.attrs?.nodeId) blockPositions.set(node.attrs.nodeId, { node, pos })
  })
  const range = resolveAnnotationDocumentRange(annotation, blockPositions)
  if (!range) return null
  try {
    const startDom = editor.value.view.domAtPos(range.from, 1)
    const endDom = editor.value.view.domAtPos(range.to, -1)
    const domRange = document.createRange()
    domRange.setStart(startDom.node, startDom.offset)
    domRange.setEnd(endDom.node, endDom.offset)
    const box = domRange.getBoundingClientRect()
    if (box.height > 0) {
      return {
        from: range.from,
        to: range.to,
        viewportY: (box.top + box.bottom) / 2
      }
    }
    const start = editor.value.view.coordsAtPos(range.from, 1)
    const end = editor.value.view.coordsAtPos(range.to, -1)
    return {
      from: range.from,
      to: range.to,
      viewportY: (start.top + end.bottom) / 2
    }
  } catch {
    return null
  }
}

function setSelection(from, to = from) {
  if (!editor.value) return false
  const max = editor.value.state.doc.content.size
  const safeFrom = Math.max(1, Math.min(max, Number(from) || 1))
  const safeTo = Math.max(safeFrom, Math.min(max, Number(to) || safeFrom))
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: safeFrom, to: safeTo }).run()
}

function findTextRange(query, occurrence = 0, nodeId = null) {
  if (!editor.value || !String(query || '')) return null
  const queryText = String(query)
  const needle = queryText.toLocaleLowerCase()
  const requestedOccurrence = Number.isFinite(Number(occurrence)) ? Math.max(0, Number(occurrence)) : 0
  let seen = 0
  let result = null

  // 只遍历 writingUnit 的直接块：blockquote 内部 paragraph 是编辑器实现，
  // canonical ID/偏移属于外层 quote，不能把内部节点当成另一个正文块。
  editor.value.state.doc.forEach((unit, unitPos) => {
    unit.forEach((node, blockOffset) => {
      if (result || (nodeId && node.attrs?.nodeId !== nodeId)) return
      const location = { node, pos: unitPos + 1 + blockOffset }
      const haystack = editorBlockPlainText(node).toLocaleLowerCase()
      let index = haystack.indexOf(needle)
      while (index >= 0) {
        if (seen === requestedOccurrence) {
          result = {
            from: editorDocumentPositionAtBlockOffset(location, index),
            to: editorDocumentPositionAtBlockOffset(location, index + queryText.length)
          }
          return
        }
        seen += 1
        index = haystack.indexOf(needle, index + needle.length)
      }
    })
  })
  return result
}

function selectText(query, occurrence = 0, nodeId = null) {
  const range = findTextRange(query, occurrence, nodeId)
  return range ? setSelection(range.from, range.to) : false
}

function selectNodeRange(startNodeId, startOffset, endNodeId, endOffset) {
  const startNode = findNodeRange(startNodeId)
  const endNode = findNodeRange(endNodeId || startNodeId)
  if (!editor.value || !startNode || !endNode) return false
  if (endNode.from < startNode.from) return false
  const from = editorDocumentPositionAtBlockOffset(startNode, startOffset)
  const to = editorDocumentPositionAtBlockOffset(endNode, endOffset)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false
  if (to < from) return false
  return setSelection(from, to)
}

function findNodeRange(nodeId) {
  if (!editor.value || !nodeId) return null
  const location = collectDirectWritingBlocks(editor.value.state.doc)
    .find(({ node }) => node.attrs?.nodeId === nodeId)
  if (!location) return null
  const { node, pos } = location
  return {
      nodeId,
      pos,
      from: editorDocumentPositionAtBlockOffset({ node, pos }, 0),
      to: editorDocumentPositionAtBlockOffset({ node, pos }, editorBlockPlainText(node).length),
      textLength: editorBlockPlainText(node).length,
      node
  }
}

function replaceTextRange(from, to, text, options = {}) {
  if (!editor.value) return false
  const start = Number(from)
  const end = Number(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return false
  const origin = options.origin === 'writing-agent' ? 'writing-agent' : 'input'
  const transaction = editor.value.state.tr
    .insertText(String(text ?? ''), start, end)
    .setMeta('writingInputOrigin', origin)
  editor.value.view.dispatch(origin === 'writing-agent' ? closeHistory(transaction) : transaction)
  if (origin === 'writing-agent') sealEditorHistoryGroup(editor.value)
  editor.value.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function replaceNodeText(nodeId, text, options = {}) {
  const range = findNodeRange(nodeId)
  if (!range || !editor.value) return false
  if (range.node.type.name !== 'blockquote') return replaceTextRange(range.from, range.to, text, options)
  const origin = options.origin === 'writing-agent' ? 'writing-agent' : 'input'
  const paragraphs = createPlainTextParagraphs(editor.value.state, String(text ?? ''), {
    marks: null,
    blankLineParagraphs: true
  })
  if (!paragraphs.length) return false
  const replacement = range.node.type.create(range.node.attrs, paragraphs, range.node.marks)
  const transaction = editor.value.state.tr
    .replaceWith(range.pos, range.pos + range.node.nodeSize, replacement)
    .setMeta('writingInputOrigin', origin)
  editor.value.view.dispatch(origin === 'writing-agent' ? closeHistory(transaction) : transaction)
  if (origin === 'writing-agent') sealEditorHistoryGroup(editor.value)
  editor.value.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function replaceNodeRanges(patches, options = {}) {
  if (!editor.value || !Array.isArray(patches) || !patches.length) return false
  const origin = options.origin === 'writing-agent' ? 'writing-agent' : 'input'
  const ranges = patches.map((patch) => {
    const node = findNodeRange(patch?.nodeId)
    if (!node) return null
    const editorRange = patch?.editorRange
    const from = Number.isFinite(Number(editorRange?.from))
      ? Number(editorRange.from)
      : editorDocumentPositionAtBlockOffset(node, patch?.range?.startOffset || 0)
    const to = Number.isFinite(Number(editorRange?.to))
      ? Number(editorRange.to)
      : editorDocumentPositionAtBlockOffset(node, patch?.range?.endOffset ?? node.textLength)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < node.from || to < from || to > node.to) return null
    return { from, to, text: String(patch?.replacement ?? patch?.text ?? '') }
  })
  if (ranges.some((range) => !range)) return false
  const ordered = [...ranges].sort((left, right) => right.from - left.from)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].from < ordered[index].to) return false
  }
  const transaction = editor.value.state.tr.setMeta('writingInputOrigin', origin)
  ordered.forEach((range) => transaction.insertText(range.text, range.from, range.to))
  editor.value.view.dispatch(origin === 'writing-agent' ? closeHistory(transaction) : transaction)
  if (origin === 'writing-agent') sealEditorHistoryGroup(editor.value)
  editor.value.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function focusNode(nodeId) {
  const range = findNodeRange(nodeId)
  if (!editor.value || !range) return false
  const position = Math.max(1, Number(range.from) || 1)
  const focused = editor.value.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: position, to: position }).run()
  editor.value.commands.scrollIntoView?.()
  return Boolean(focused)
}

function focusWritingUnit(unitId) {
  const currentEditor = editor.value
  if (!currentEditor || !unitId) return false
  let position = null
  currentEditor.state.doc.forEach((unit, unitPos) => {
    if (position != null || String(unit?.attrs?.unitId || '') !== String(unitId)) return
    let firstTextblockOffset = null
    unit.forEach((node, offset) => {
      if (firstTextblockOffset == null && node.isTextblock) firstTextblockOffset = offset
    })
    position = unitPos + 1 + Number(firstTextblockOffset || 0) + 1
  })
  if (position == null) return false
  const focused = currentEditor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(position).scrollIntoView().run()
  return Boolean(focused)
}

function splitWritingUnit() {
  const changed = Boolean(editor.value?.chain().focus(undefined, { scrollIntoView: false }).splitWritingUnit().run())
  if (changed) sealEditorHistoryGroup()
  return changed
}

function mergeWritingUnit(direction = 'previous') {
  const changed = Boolean(editor.value?.chain().focus(undefined, { scrollIntoView: false }).mergeWritingUnit(direction).run())
  if (changed) sealEditorHistoryGroup()
  return changed
}

function moveWritingUnit(direction) {
  const changed = Boolean(editor.value?.chain().focus(undefined, { scrollIntoView: false }).moveWritingUnit(direction).run())
  if (changed) sealEditorHistoryGroup()
  return changed
}

function replaceText(query, replacement, occurrence = 0) {
  const range = findTextRange(query, occurrence)
  if (!range) return false
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).insertContentAt(range, String(replacement ?? '')).run()
}

function replaceAll(query, replacement) {
  if (!editor.value || !String(query || '')) return false
  const ranges = []
  for (let occurrence = 0; ; occurrence += 1) {
    const range = findTextRange(query, occurrence)
    if (!range) break
    ranges.push(range)
  }
  if (!ranges.length) return false
  const transaction = editor.value.state.tr
  ranges.reverse().forEach((range) => {
    transaction.insertText(String(replacement ?? ''), range.from, range.to)
  })
  editor.value.view.dispatch(transaction)
  editor.value.commands.focus(undefined, { scrollIntoView: false })
  return true
}

function clearMarks() {
  if (!editor.value) return false
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).unsetAllMarks().run()
}

function deleteSelection() {
  if (!editor.value) return false
  if (!protectDestructiveSelection('delete-selection')) return false
  if (editor.value.state.selection instanceof AllSelection) return replaceWholeWritingDocument('', { origin: 'structure' })
  if (selectedWritingUnitIds(editor.value.state).length > 1) {
    warnBlockedStructureEdit('cross-unit-delete')
    return false
  }
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run()
}

function selectAll() {
  if (!editor.value) return false
  selectAllIntentActive = true
  return editor.value.chain().focus(undefined, { scrollIntoView: false }).selectAll().run()
}

function captureSelectionBookmark() {
  return editor.value?.state.selection.getBookmark() || null
}

// 双栏等外部运行 owner 需要在提交瞬间读取与 selection-change 完全相同的
// 稳定 node/unit + markdown 光标快照。只暴露只读快照，不暴露 ProseMirror
// state，避免调用方各自重新推导一套位置语义。
function getSelectionSnapshot() {
  return editor.value ? buildSelectionSnapshot(editor.value) : null
}

function getCommandAvailability() {
  const currentEditor = editor.value
  if (!currentEditor) {
    return {
      undo: false,
      redo: false,
      cut: false,
      copy: false,
      deleteSelection: false,
      selectAll: false,
      splitUnit: false,
      mergePreviousUnit: false,
      moveUnitUp: false,
      moveUnitDown: false,
      bold: false,
      italic: false
    }
  }
  const commands = currentEditor.can()
  const selection = currentEditor.state.selection
  const hasSelection = !selection.empty
  const allSelection = selection instanceof AllSelection
  const textSelection = selection instanceof TextSelection
  const nodeSelection = selection instanceof NodeSelection
  const selectedUnits = selectedWritingUnitIds(currentEditor.state)
  const crossesProtectedUnitBoundary = !allSelection && selectedUnits.length > 1
  const selectedPlainText = hasSelection ? String(getSelection()?.text || '') : ''
  const hasSerializableText = Boolean(selectedPlainText) && (textSelection || allSelection) && !nodeSelection
  const canDeleteSelection = hasSelection && !crossesProtectedUnitBoundary
  const startBlock = textSelection
    ? resolveEditorBlockSelection(currentEditor, selection.from)
    : null
  const endBlock = textSelection
    ? resolveEditorBlockSelection(currentEditor, Math.max(selection.from, selection.to - 1), selection.to)
    : null
  let selectedTextHasMarks = false
  if (textSelection && hasSelection) {
    currentEditor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.isText && node.marks?.length) selectedTextHasMarks = true
    })
  }
  // 自定义剪贴板目前只序列化纯文本；只有单一、无 marks 的 prose 段落
  // 能做到 Cut→Paste 无损。标题、引用、全章/unit 编排仍可 Copy 为纯文本，
  // 但不提供会永久降级结构的 Cut。
  const canLosslesslyCut = hasSerializableText
    && canDeleteSelection
    && !allSelection
    && startBlock?.pos === endBlock?.pos
    && startBlock?.node?.type?.name === 'paragraph'
    && !selectedTextHasMarks
  return {
    undo: Boolean(commands.undo?.()),
    redo: Boolean(commands.redo?.()),
    cut: canLosslesslyCut,
    copy: hasSerializableText,
    paste: !crossesProtectedUnitBoundary && !nodeSelection,
    deleteSelection: canDeleteSelection,
    selectAll: currentEditor.state.doc.content.size > 0,
    splitUnit: Boolean(commands.splitWritingUnit?.()),
    mergePreviousUnit: Boolean(commands.mergeWritingUnit?.('previous')),
    moveUnitUp: Boolean(commands.moveWritingUnit?.('up')),
    moveUnitDown: Boolean(commands.moveWritingUnit?.('down')),
    bold: currentEditor.isActive('bold'),
    italic: currentEditor.isActive('italic')
  }
}

function restoreSelectionBookmark(bookmark, options = {}) {
  if (!editor.value || !bookmark?.resolve) return false
  try {
    const view = editor.value.view
    const selection = bookmark.resolve(editor.value.state.doc)
    view.dispatch(editor.value.state.tr.setSelection(selection))
    // tiptap commands.focus() 走异步 focus 管理：右键菜单刚卸载、焦点还在
    // 菜单按钮上时，DOM 选区可能滞留不画——journey/用户看到的仍是“无选区”。
    // view.focus() 同步聚焦并从内部 state 回写 DOM selection。
    view.focus()
    if (options.scrollIntoView === false) {
      const dom = view.domAtPos(editor.value.state.selection.from)
      const targetNode = dom.node instanceof Element ? dom.node : dom.node.parentElement
      targetNode?.scrollIntoView?.({ block: 'nearest' })
    }
    return true
  } catch {
    return false
  }
}

defineExpose({
  editor,
  focus,
  blur,
  insertText,
  insertPlainText,
  insertAsNewWritingUnit,
  insertMediaReference,
  insertWritingUnitBatch,
  replaceWritingUnit,
  restoreWritingUnitSnapshot,
  insertDivider,
  undo,
  redo,
  toggleMark,
  getSelection,
  getRootElement,
  getScrollElement,
  hasEditorFocus,
  closeCommandMenu,
  getAnnotationAnchorMetrics,
  setSelection,
  selectText,
  selectNodeRange,
  findNodeRange,
  focusNode,
  focusWritingUnit,
  replaceNodeText,
  replaceNodeRanges,
  splitWritingUnit,
  mergeWritingUnit,
  moveWritingUnit,
  replaceTextRange,
  replaceText,
  replaceAll,
  clearMarks,
  deleteSelection,
  selectAll,
  getSelectionSnapshot,
  captureSelectionBookmark,
  restoreSelectionBookmark,
  getCommandAvailability
})
</script>

<style>
.writing-notebook-editor {
  --notebook-paper: var(--surface-workbench-raised, var(--archive-paper-soft, #fbfdfe));
  --notebook-ink: var(--archive-ink, var(--text-primary, #1a1a1a));
  --notebook-muted: var(--archive-ink-soft, var(--text-secondary, #4a637d));
  --notebook-rule: var(--hairline-soft, rgba(74, 99, 125, 0.18));
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--notebook-paper);
  color: var(--notebook-ink);
  position: relative;
}

.writing-notebook-editor__surface {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 44px clamp(24px, 7vw, 108px) 160px;
}

.writing-notebook-editor__surface .ProseMirror {
  width: min(100%, 62em);
  min-height: 100%;
  margin: 0 auto;
  outline: none;
  font-family: var(--notebook-font-family, var(--font-writing));
  font-size: var(--notebook-font-size, 17.5px);
  font-weight: var(--notebook-font-weight, 400);
  font-style: var(--notebook-font-style, normal);
  line-height: var(--notebook-line-height, 1.92);
  text-decoration: var(--notebook-text-decoration, none);
  letter-spacing: 0;
  white-space: pre-wrap;
  line-break: strict;
  word-break: normal;
  overflow-wrap: break-word;
  font-kerning: normal;
}

.writing-notebook-editor__surface .writing-cjk-quote {
  font-family: "LXGW WenKai", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-variant-east-asian: proportional-width;
}

.writing-notebook-editor__surface .ProseMirror::selection,
.writing-notebook-editor__surface .ProseMirror *::selection {
  background: color-mix(in srgb, var(--archive-olive, #426f9c) 26%, var(--archive-paper-soft, #f4f8fc));
  color: var(--archive-ink, #17283a);
}

.writing-notebook-editor__surface .ProseMirror > section[data-writing-unit] {
  position: relative;
  margin: 0;
  padding: 0;
}

.writing-notebook-editor__surface .ProseMirror > section[data-writing-unit]:not(:first-child) {
  margin-top: 0.62em;
}

.writing-notebook-editor__surface .ProseMirror > section[data-writing-unit]:not(:first-child)::after {
  position: absolute;
  inset-inline-start: -14px;
  top: -0.36em;
  width: 8px;
  content: '';
  border-top: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 24%, transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.writing-notebook-editor__surface .ProseMirror > section[data-writing-unit]:not(:first-child):hover::after,
.writing-notebook-editor__surface .ProseMirror > section[data-writing-unit].is-current-writing-unit:not(:first-child)::after {
  opacity: 0.7;
}

.writing-unit-gap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 54px;
  margin: 2px 0 6px;
  z-index: 4;
}

.writing-unit-gap::before,
.writing-unit-gap::after {
  display: none;
}

/* Empty gap space must pass clicks through to prose; mounted controls must
   not inherit that rule or the editor underneath steals every click. */
.writing-unit-gap > *,
.writing-unit-gap__action {
  pointer-events: auto;
}

.writing-unit-gap__actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  width: min(100%, 500px);
}

.writing-unit-gap__actions::before {
  height: 1px;
  flex: 1 1 48px;
  min-width: 28px;
  content: '';
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--notebook-muted) 20%, transparent));
}

.writing-unit-gap__action {
  display: grid;
  gap: 1px;
  min-height: 42px;
  padding: 5px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: color-mix(in srgb, var(--notebook-muted) 76%, transparent);
  font: 500 12px/1.2 var(--font-sans, sans-serif);
  letter-spacing: 0.02em;
  text-align: left;
  opacity: 0.82;
  cursor: pointer;
  transition: color 120ms ease, opacity 120ms ease;
}

.writing-unit-gap__action.is-secondary {
  color: color-mix(in srgb, var(--notebook-muted) 62%, transparent);
}
.writing-unit-gap__action.is-primary {
  color: color-mix(in srgb, var(--accent-primary) 86%, var(--text-primary));
  border-bottom-color: color-mix(in srgb, var(--accent-primary) 54%, transparent);
}
.writing-unit-gap__action span { font-size: 12px; font-weight: 650; }
.writing-unit-gap__action small { color: var(--notebook-muted); font-size: 10px; font-weight: 400; }

.writing-unit-gap.has-preview {
  height: auto;
  margin: 10px 0 18px;
}

.writing-unit-gap.has-composer,
.writing-unit-gap:has(.authoring-block-composer) {
  justify-content: stretch;
  height: auto;
  margin: 10px 0 18px;
}

.writing-unit-gap__action:hover,
.writing-unit-gap__action:focus-visible {
  background: color-mix(in srgb, var(--accent-primary) 5%, transparent);
  color: var(--accent-primary);
  opacity: 1;
  outline: none;
}

.writing-unit-gap__action:focus-visible {
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 640px) {
  .writing-unit-gap { height: 62px; }
  .writing-unit-gap__action {
    min-height: 48px;
    padding-inline: 8px;
  }

  .writing-unit-gap__actions { gap: 0; }
  .writing-unit-gap__actions::before { min-width: 12px; }
  .writing-unit-gap__action small { display: none; }
}

.writing-notebook-editor__surface section[data-writing-unit] > * {
  position: relative;
  margin: 0 0 var(--notebook-paragraph-gap, 1.05em);
  padding-inline-start: 12px;
}

.writing-notebook-editor__surface .ProseMirror-focused .is-current-writing-line {
  background: transparent;
}

.writing-current-line {
  position: absolute;
  z-index: 3;
  border-top: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 16%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 12%, transparent);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 8%, transparent);
  pointer-events: none;
}

/* 段落聚焦（P0c）：块级淡化——光标所在段落保持全亮，其余段落 35%。
   单元内 Enter 不拆分写作单元，因此按段落块而非单元维度标记；
   仅在编辑器持焦时生效，失焦恢复全亮避免干扰批注/预览。 */
.writing-notebook-editor.is-focus-paragraph section[data-writing-unit] > * {
  transition: opacity 0.18s ease;
}

.writing-notebook-editor.is-focus-paragraph .ProseMirror-focused section[data-writing-unit] > *:not(.is-focus-current-block) {
  opacity: 0.35;
}

.writing-notebook-editor__surface .ProseMirror-focused .is-empty-command-line::after {
  content: attr(data-empty-hint);
  position: absolute;
  inset-inline-start: 12px;
  top: 0;
  color: color-mix(in srgb, var(--notebook-muted) 62%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 0.76em;
  font-style: normal;
  font-weight: 400;
  pointer-events: none;
}

.writing-notebook-editor__surface .ProseMirror-focused section[data-writing-unit].is-current-writing-unit::before {
  position: absolute;
  inset-inline-start: -14px;
  top: 0.42em;
  bottom: auto;
  width: 1px;
  height: 1em;
  content: '';
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 34%, transparent);
}

.writing-notebook-editor__surface .ProseMirror-focused .is-live-markdown-active::before {
  left: -2.35em;
  top: 0;
  width: 2em;
  height: auto;
  content: attr(data-markdown-prefix);
  background: transparent;
  color: color-mix(in srgb, var(--archive-olive, #1f4d7a) 74%, var(--notebook-muted));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.72em;
  font-weight: 650;
  line-height: 1.8;
  text-align: right;
  white-space: nowrap;
  opacity: 0.82;
}

@media (max-width: 520px) {
  .writing-notebook-editor__surface .ProseMirror-focused section[data-writing-unit].is-current-writing-unit::before {
    inset-inline-start: 2px;
  }
}

.writing-notebook-editor__surface .ProseMirror-focused .is-live-markdown-mark::before,
.writing-notebook-editor__surface .ProseMirror-focused .is-live-markdown-mark::after {
  color: color-mix(in srgb, var(--archive-olive, #1f4d7a) 72%, var(--notebook-muted));
  font-family: inherit;
  font-size: 0.84em;
  font-style: normal;
  font-weight: 550;
  letter-spacing: 0;
  opacity: 0.78;
  white-space: nowrap;
}

.writing-notebook-editor__surface .ProseMirror-focused .is-live-markdown-mark::before {
  content: attr(data-markdown-open);
}

.writing-notebook-editor__surface .ProseMirror-focused .is-live-markdown-mark::after {
  content: attr(data-markdown-close);
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-anchor {
  background: color-mix(in srgb, var(--archive-gold, #7d97b0) 9%, transparent);
  text-decoration-line: underline;
  text-decoration-color: color-mix(in srgb, var(--archive-gold, #7d97b0) 72%, transparent);
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  cursor: pointer;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion {
  color: color-mix(in srgb, var(--archive-olive, #1f4d7a) 58%, var(--notebook-muted));
  cursor: pointer;
  opacity: 0.72;
  white-space: pre-wrap;
}

.writing-notebook-editor.is-composing .writing-inline-suggestion {
  display: none;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion__content {
  font: inherit;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion__hint {
  margin-inline-start: 0.65em;
  color: color-mix(in srgb, var(--notebook-muted) 70%, transparent);
  font: 10px/1 var(--font-sans, sans-serif);
  white-space: nowrap;
  vertical-align: 0.08em;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion:hover {
  opacity: 0.92;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion.is-generating,
.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion.is-error {
  font-family: var(--font-sans, sans-serif);
  font-size: 0.72em;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion.is-generating {
  cursor: progress;
}

.writing-notebook-editor__surface .ProseMirror .writing-inline-suggestion.is-error {
  color: var(--notebook-muted);
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-anchor.is-active {
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 12%, transparent);
  text-decoration-color: var(--archive-olive-strong, #1f4d7a);
}

.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention {
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 42%, transparent);
  background: linear-gradient(to top, color-mix(in srgb, var(--archive-olive, #1f4d7a) 7%, transparent) 34%, transparent 34%);
  cursor: pointer;
}

.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention.is-character {
  border-bottom-color: color-mix(in srgb, var(--accent, #1677ff) 52%, transparent);
}

.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention.is-rule,
.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention.is-forbidden {
  border-bottom-style: dashed;
}

.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention.is-ambiguous {
  border-bottom-style: dotted;
  border-bottom-color: color-mix(in srgb, var(--text-secondary) 58%, transparent);
}

.writing-notebook-editor__surface .ProseMirror .writing-worldbook-mention:hover {
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 11%, transparent);
}

.writing-notebook-editor__surface .ProseMirror h1,
.writing-notebook-editor__surface .ProseMirror h2,
.writing-notebook-editor__surface .ProseMirror h3 {
  margin-top: 1.8em;
  color: var(--archive-olive-strong, var(--notebook-ink));
  font-family: inherit;
  letter-spacing: 0;
  font-weight: 650;
  line-height: 1.3;
}

.writing-notebook-editor__surface .ProseMirror h1 { font-size: 1.45em; }
.writing-notebook-editor__surface .ProseMirror h2 { font-size: 1.25em; }
.writing-notebook-editor__surface .ProseMirror h3 { font-size: 1.1em; }

.writing-notebook-editor__surface .ProseMirror blockquote {
  padding-left: 1.1em;
  border-left: 2px solid var(--archive-gold, #7d97b0);
  color: var(--notebook-muted);
}

.writing-notebook-editor__surface .ProseMirror blockquote > p {
  margin: 0;
}

.writing-notebook-editor__surface .ProseMirror blockquote > p + p {
  margin-top: 0.72em;
}

.writing-notebook-editor__surface .ProseMirror hr {
  width: 38%;
  margin: 2.25em auto;
  border: 0;
  border-top: 1px solid var(--notebook-rule);
}

.writing-notebook-editor__surface .ProseMirror figure[data-media-reference] {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  margin: 1.4em 0;
  padding: 10px 12px;
  border-top: 1px solid color-mix(in srgb, var(--notebook-rule) 86%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--notebook-rule) 86%, transparent);
  background: color-mix(in srgb, var(--notebook-paper) 92%, var(--accent-primary) 8%);
  color: var(--notebook-muted);
  font: 500 12px/1.5 var(--font-sans, sans-serif);
  white-space: normal;
}

.writing-notebook-editor__surface .ProseMirror figure[data-media-reference].ProseMirror-selectednode {
  border-color: color-mix(in srgb, var(--accent-primary) 54%, var(--notebook-rule));
  background: color-mix(in srgb, var(--notebook-paper) 86%, var(--accent-primary) 14%);
  outline: 2px solid color-mix(in srgb, var(--accent-primary) 16%, transparent);
}

.writing-media-reference__mark {
  flex: none;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--notebook-rule) 86%, transparent);
  border-radius: 999px;
  color: var(--accent-primary);
  font-size: 10px;
}

.writing-media-reference__caption {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writing-notebook-editor__loading {
  padding: 36px;
  color: var(--notebook-muted);
  font: 13px/1.6 var(--font-sans, sans-serif);
}

.writing-command-menu-shell {
  --notebook-paper: var(--surface-workbench-raised, var(--archive-paper-soft, #fbfdfe));
  --notebook-ink: var(--archive-ink, var(--text-primary, #1a1a1a));
  --notebook-muted: var(--archive-ink-soft, var(--text-secondary, #4a637d));
  position: fixed;
  z-index: var(--z-popover, 100);
}

.writing-command-menu {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  width: 100%;
  padding: 5px;
  border: 1px solid var(--hairline-strong, rgba(50, 80, 108, 0.22));
  border-radius: 6px;
  background: color-mix(in srgb, var(--notebook-paper) 96%, var(--archive-olive, #1f4d7a));
  box-shadow: 0 12px 30px rgba(26, 51, 75, 0.16);
}

.writing-command-menu__item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--notebook-ink);
  text-align: left;
  cursor: pointer;
}

.writing-command-submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 6px);
}

.writing-command-menu-shell.is-submenu-left .writing-command-submenu {
  right: calc(100% + 6px);
  left: auto;
}

/* visualViewport 变窄或变矮时，二级菜单替换一级而不是上下叠两块；
   这同时覆盖移动端软键盘抬起后的短视口。 */
.writing-command-menu-shell.is-stacked.is-sublevel > .writing-command-menu:not(.writing-command-submenu) {
  visibility: hidden;
  position: absolute;
  pointer-events: none;
}

.writing-command-menu-shell.is-stacked .writing-command-submenu,
.writing-command-menu-shell.is-stacked.is-submenu-left .writing-command-submenu {
  top: 0;
  right: auto;
  left: 0;
}

.writing-command-submenu__title {
  min-height: 27px;
  margin: 0 4px 3px;
  padding: 6px 6px 5px;
  border-bottom: 1px solid var(--hairline, rgba(50, 80, 108, 0.13));
  color: var(--notebook-muted);
  font: 600 11px/1.2 var(--font-sans, sans-serif);
}

/* W2：子菜单返回按钮（≥44px 触控目标） */
.writing-command-submenu__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  width: 100%;
  padding: 6px 2px;
  border: 0;
  background: transparent;
  color: var(--notebook-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.writing-command-menu__item.is-active {
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 9%, transparent);
  color: var(--archive-olive-strong, #1f4d7a);
}

.writing-command-menu__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.writing-command-menu__copy strong {
  font: 600 13px/1.25 var(--font-sans, sans-serif);
}

.writing-command-menu__copy small {
  overflow: hidden;
  color: var(--notebook-muted);
  font: 11px/1.25 var(--font-sans, sans-serif);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writing-command-menu__expand {
  color: var(--notebook-muted);
}

.writing-command-menu__item.is-active .writing-command-menu__expand {
  color: var(--archive-olive-strong, #1f4d7a);
}

@media (max-width: 760px) {
  .writing-command-submenu,
  .writing-command-menu-shell.is-submenu-left .writing-command-submenu {
    top: calc(100% + 6px);
    right: auto;
    left: 0;
  }

  .writing-notebook-editor__surface {
    padding: 28px 20px 120px;
  }

  .writing-notebook-editor__surface .ProseMirror {
    font-size: 17px;
  }

  .writing-notebook-editor__surface .ProseMirror > * {
    padding-inline-start: 9px;
  }

  .writing-notebook-editor__surface .ProseMirror-focused .is-empty-command-line::after {
    inset-inline-start: 9px;
  }

  .writing-notebook-editor__surface .ProseMirror > *::before {
    left: 0;
    width: 2px;
  }

  .writing-notebook-editor__surface .ProseMirror-focused > .is-live-markdown-active {
    padding-inline-start: 2.7em;
  }

  .writing-notebook-editor__surface .ProseMirror-focused > .is-live-markdown-active::before {
    left: 0;
    width: 2.25em;
    text-align: left;
  }

}
</style>
