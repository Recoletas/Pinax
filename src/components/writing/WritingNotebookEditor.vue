<template>
  <section ref="notebookRoot" class="writing-notebook-editor" aria-label="实时 Markdown 写作编辑器">
    <EditorContent
      v-if="editor"
      :editor="editor"
      class="writing-notebook-editor__surface"
      @contextmenu.prevent="handleContextMenu"
      @scroll.passive="updateCurrentLineOverlay"
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
            v-for="(command, index) in writingMenuItems"
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { UniqueID } from '@tiptap/extension-unique-id'
import { Extension, getMarkRange } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
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

const props = defineProps({
  modelValue: { type: String, default: '' },
  document: { type: Object, default: null },
  editable: { type: Boolean, default: true },
  annotations: { type: Array, default: () => [] },
  activeAnnotationId: { type: String, default: null },
  inlineSuggestion: { type: String, default: '' },
  inlineSuggestionVisible: Boolean,
  inlineSuggestionGenerating: Boolean,
  inlineSuggestionError: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'update:document', 'selection-change', 'unit-transition', 'input', 'context-menu', 'annotation-click', 'writing-command', 'accept-inline-suggestion', 'dismiss-inline-suggestion', 'retry-inline-suggestion', 'ready'])

const initialDocument = props.document || createWritingDocument(props.modelValue)
const notebookRoot = ref(null)
const commandMenuRef = ref(null)
const commandSubmenuRef = ref(null)
const commandMenu = ref({ open: false, activeIndex: 0, rootIndex: 0, sectionId: null, anchorFrom: null, anchorTo: null, top: 0, left: 0, width: 300, maxHeight: 320 })
const currentLineOverlay = ref({ visible: false, top: 0, left: 0, width: 0, height: 0 })

const writingMenuItems = [
  { id: 'ai-continue', label: 'AI 续写', description: '从光标处续写下一句', icon: Sparkles, agent: true },
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
const activeWritingSection = computed(() => (
  writingMenuItems.find((item) => item.id === commandMenu.value.sectionId && item.children?.length) || null
))
const activeWritingCommands = computed(() => activeWritingSection.value?.children || writingMenuItems)

const annotationPluginKey = new PluginKey('writingAnnotationDecorations')
const liveMarkdownPluginKey = new PluginKey('writingLiveMarkdownDecorations')
const inlineSuggestionPluginKey = new PluginKey('writingInlineSuggestion')
const inlineSuggestionAnchor = ref(null)

function createInlineSuggestionDecorations(state) {
  const suggestion = String(props.inlineSuggestion || '')
  const visible = props.inlineSuggestionVisible && suggestion
  const generating = props.inlineSuggestionGenerating
  const failed = !generating && !visible && String(props.inlineSuggestionError || '')
  if ((!visible && !generating && !failed) || !state.selection.empty) {
    return DecorationSet.empty
  }
  if (inlineSuggestionAnchor.value == null) inlineSuggestionAnchor.value = state.selection.from
  if (state.selection.from !== inlineSuggestionAnchor.value) return DecorationSet.empty

  return DecorationSet.create(state.doc, [Decoration.widget(inlineSuggestionAnchor.value, () => {
    const widget = document.createElement('span')
    widget.className = 'writing-inline-suggestion'
    if (generating) widget.classList.add('is-generating')
    if (failed) widget.classList.add('is-error')
    widget.setAttribute('aria-label', visible ? `AI 续写建议：${suggestion}` : generating ? 'AI 正在续写' : 'AI 续写失败')
    widget.title = visible
      ? '点击采纳；Tab 全部采纳；Ctrl/Command + 右方向键采纳一句；Esc 忽略'
      : failed ? '点击重试' : ''

    const content = document.createElement('span')
    content.className = 'writing-inline-suggestion__content'
    content.textContent = visible ? suggestion : generating ? '正在续写…' : '续写失败'
    widget.append(content)

    const hint = document.createElement('span')
    hint.className = 'writing-inline-suggestion__hint'
    hint.textContent = visible ? 'Tab 采纳' : failed ? '点击重试' : ''
    if (hint.textContent) widget.append(hint)
    widget.addEventListener('mousedown', (event) => {
      event.preventDefault()
      if (visible) emit('accept-inline-suggestion', 'all')
      else if (failed) emit('retry-inline-suggestion')
    })
    return widget
  }, {
    side: 1,
    key: `writing-inline-${inlineSuggestionAnchor.value}-${visible ? suggestion : generating ? 'generating' : `error:${props.inlineSuggestionError}`}`
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
        handleKeyDown: (_view, event) => {
          if (!props.inlineSuggestionVisible || !props.inlineSuggestion) return false
          if (event.key === 'Tab') {
            event.preventDefault()
            emit('accept-inline-suggestion', 'all')
            return true
          }
          if (event.key === 'ArrowRight' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            emit('accept-inline-suggestion', 'unit')
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            emit('dismiss-inline-suggestion')
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
    if (!node.isTextblock) continue
    const from = $from.before(depth)
    const classes = ['is-current-writing-line']
    const attrs = { class: classes.join(' ') }
    if (canOpenWritingCommandMenu({
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
          const { state } = view
          const $from = state.doc.resolve(from)
          const node = $from.parent
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
  commandMenu.value.open = false
}

function getWritingCommandContext(view) {
  const { $from } = view.state.selection
  let currentBlockId = null
  let currentBlockPos = $from.pos
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!node.isTextblock) continue
    currentBlockId = node.attrs?.blockId || null
    currentBlockPos = $from.before(depth)
    break
  }

  let previousBlock = null
  view.state.doc.descendants((node, pos) => {
    if (pos >= currentBlockPos) return false
    if (node.isTextblock && node.attrs?.blockId) {
      previousBlock = {
        blockId: node.attrs.blockId,
        text: node.textContent,
        blockRevision: Number(node.attrs?.blockRevision || 0)
      }
    }
    return true
  })
  return {
    currentBlockId,
    previousBlock,
    cursorMarkdownOffset: getWritingMarkdownPosition(
      currentDocument.value,
      currentBlockId,
      $from.parentOffset
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

function positionCommandMenu(view, menuHeight = 216) {
  if (!notebookRoot.value) return
  const coordinates = view.coordsAtPos(view.state.selection.from, 1)
  const scale = getBodyUiScale()
  const position = resolveWritingCommandMenuPosition({
    anchor: coordinates,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    menuWidth: 300,
    menuHeight,
    scale
  })
  if (!position) return
  Object.assign(commandMenu.value, position)
}

function measureAndPositionCommandMenu(view) {
  nextTick(() => {
    if (!commandMenu.value.open || editor.value?.view !== view) return
    const measuredHeight = commandMenuRef.value?.getBoundingClientRect?.().height
    const scale = getBodyUiScale()
    positionCommandMenu(view, measuredHeight > 0 ? measuredHeight / scale : 216)
  })
}

function openCommandMenu(view) {
  const { from, to } = view.state.selection
  commandMenu.value = { ...commandMenu.value, open: true, activeIndex: 0, rootIndex: 0, sectionId: null, anchorFrom: from, anchorTo: to }
  positionCommandMenu(view)
  measureAndPositionCommandMenu(view)
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
  const chain = editor.value?.chain().focus()
  if (!chain) return false
  const actions = {
    'heading-2': () => chain.toggleHeading({ level: 2 }).run(),
    blockquote: () => chain.toggleBlockquote().run(),
    divider: () => chain.setHorizontalRule().run()
  }
  const executed = Boolean(actions[commandId]?.())
  closeCommandMenu()
  return executed
}

function enterWritingCommandSection(sectionId, rootIndex = commandMenu.value.rootIndex) {
  const section = writingMenuItems.find((item) => item.id === sectionId && item.children?.length)
  if (!section) return false
  commandMenu.value.sectionId = section.id
  commandMenu.value.rootIndex = rootIndex
  commandMenu.value.activeIndex = 0
  revealActiveWritingCommand()
  if (editor.value?.view) measureAndPositionCommandMenu(editor.value.view)
  return true
}

function leaveWritingCommandSection() {
  if (!commandMenu.value.sectionId) return false
  commandMenu.value.sectionId = null
  commandMenu.value.activeIndex = Math.max(0, commandMenu.value.rootIndex)
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
  const command = writingMenuItems[index]
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
          if (commandMenu.value.open) {
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
              event.preventDefault()
              commandMenu.value.activeIndex = result.index
              revealActiveWritingCommand()
              return true
            }
            if (result?.action === 'select') {
              event.preventDefault()
              return runWritingCommand(result.index)
            }
            if (result?.action === 'expand') {
              event.preventDefault()
              return enterWritingCommandSection(commands[result.index]?.id)
            }
            if (result?.action === 'back') {
              event.preventDefault()
              return leaveWritingCommandSection()
            }
            if (result?.action === 'close') {
              event.preventDefault()
              closeCommandMenu()
              return true
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              return true
            }
            closeCommandMenu()
            return false
          }

          const { $from } = view.state.selection
          const canOpen = canOpenWritingCommandMenu({
            selectionEmpty: view.state.selection.empty,
            nodeType: $from.parent.type.name,
            parentOffset: $from.parentOffset,
            contentSize: $from.parent.content.size
          })
          if (canOpen && (event.key === ' ' || event.key === '/')) {
            event.preventDefault()
            openCommandMenu(view)
            return true
          }
          return false
        }
      }
    })]
  }
})

function annotationText(annotation) {
  return String(
    annotation?.range?.startSelector?.exact
      || annotation?.selector?.exact
      || (annotation?.range?.start?.blockId === annotation?.range?.end?.blockId ? annotation?.range?.exact : '')
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
  doc.descendants((node, pos) => {
    if (node.attrs?.blockId) blockPositions.set(node.attrs.blockId, { node, pos })
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

function resolveAnnotationDocumentRange(annotation, blockPositions) {
  const startBlockId = annotation?.range?.start?.blockId || annotation?.blockId
  const endBlockId = annotation?.range?.end?.blockId || startBlockId
  const startBlock = blockPositions.get(startBlockId)
  const endBlock = blockPositions.get(endBlockId)
  if (!startBlock || !endBlock) return null

  const startOffset = Math.max(0, Math.min(startBlock.node.content.size, annotationStart(annotation)))
  const fallbackLength = annotationText(annotation).length
  const endOffset = annotation?.range?.end?.offset ?? (startOffset + fallbackLength)
  const safeEndOffset = Math.max(0, Math.min(endBlock.node.content.size, Number(endOffset) || 0))
  const from = startBlock.pos + 1 + startOffset
  const to = endBlock.pos + 1 + safeEndOffset
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

const currentDocument = ref(initialDocument)

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      document: false,
      heading: { levels: [1, 2, 3] },
      history: true
    }),
    WritingDocumentNode,
    WritingUnitNode,
    WritingNodeAttributes,
    AnnotationDecorations,
    LiveMarkdownInput,
    LiveMarkdownDecorations,
    WritingCommandMenu,
    InlineSuggestionDecorations,
    UniqueID.configure({
      types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
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
    emitDocument(currentEditor)
    updateCurrentLineOverlay()
  },
  onUpdate({ editor: currentEditor, transaction }) {
    if (!transaction.docChanged) return
    emitDocument(currentEditor)
    const transition = transaction.getMeta('writingUnitTransition')
    if (transition) emit('unit-transition', transition)
    emit('input', {
      inputType: transaction.getMeta('writingAgentInsert') ? 'writing-agent' : (transaction.getMeta('uiEvent') || 'input'),
      composing: Boolean(transaction.getMeta('composition'))
    })
  },
  onSelectionUpdate({ editor: currentEditor }) {
    const { from, to } = currentEditor.state.selection
    if (
      commandMenu.value.open
      && (from !== commandMenu.value.anchorFrom || to !== commandMenu.value.anchorTo)
    ) closeCommandMenu()
    const getBlockSelection = (probePosition, cursorPosition = probePosition) => {
      const resolved = currentEditor.state.doc.resolve(Math.max(0, Math.min(currentEditor.state.doc.content.size, probePosition)))
      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        const node = resolved.node(depth)
        if (node?.attrs?.blockId) {
          return {
            node,
            localOffset: Math.max(0, Math.min(node.content.size, cursorPosition - resolved.start(depth)))
          }
        }
      }
      return null
    }
    const startBlockSelection = getBlockSelection(from)
    const endBlockSelection = from === to
      ? startBlockSelection
      : getBlockSelection(Math.max(from, to - 1), to) || startBlockSelection
    const startBlock = startBlockSelection?.node
    const endBlock = endBlockSelection?.node
    const markdownFrom = getWritingMarkdownPosition(
      currentDocument.value,
      startBlock?.attrs?.blockId,
      startBlockSelection?.localOffset
    )
    const markdownTo = getWritingMarkdownPosition(
      currentDocument.value,
      endBlock?.attrs?.blockId,
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
    emit('selection-change', {
      from,
      to,
      empty: from === to,
      text: currentEditor.state.doc.textBetween(from, to, '\n'),
      beforeText: currentEditor.state.doc.textBetween(0, from, '\n'),
      blockId: startBlock?.attrs?.blockId || null,
      blockRevision: Number(startBlock?.attrs?.blockRevision || 0),
      startBlockId: startBlock?.attrs?.blockId || null,
      startBlockRevision: Number(startBlock?.attrs?.blockRevision || 0),
      endBlockId: endBlock?.attrs?.blockId || null,
      endBlockRevision: Number(endBlock?.attrs?.blockRevision || 0),
      markdownFrom,
      markdownTo,
      cursorRect
    })
    updateCurrentLineOverlay()
  },
  onFocus() {
    updateCurrentLineOverlay()
  },
  onBlur() {
    currentLineOverlay.value.visible = false
  }
})

function updateCurrentLineOverlay() {
  const currentEditor = editor.value
  const root = notebookRoot.value
  if (!currentEditor || !root || !currentEditor.view.hasFocus() || !currentEditor.state.selection.empty) {
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

function emitDocument(currentEditor) {
  const nextDocument = editorContentToWritingDocument(currentEditor.getJSON(), currentDocument.value)
  currentDocument.value = nextDocument
  if (currentEditor.storage) currentEditor.storage.writingDocument = nextDocument
  emit('update:document', nextDocument)
  emit('update:modelValue', getWritingDocumentMarkdown(nextDocument))
}

function handleContextMenu(event) {
  emit('context-menu', event)
}

watch(() => props.editable, (editable) => {
  editor.value?.setEditable(editable)
})

watch(() => props.document, (nextDocument) => {
  if (!nextDocument || !editor.value) return
  if (nextDocument.revision === currentDocument.value.revision) return
  currentDocument.value = nextDocument
  editor.value.commands.setContent({
    type: 'doc',
    content: writingDocumentToEditorContent(nextDocument)
  }, false)
})

watch(() => props.modelValue, (nextMarkdown) => {
  if (!editor.value) return
  const nextDocument = createWritingDocument(nextMarkdown)
  if (getWritingDocumentMarkdown(currentDocument.value) === nextMarkdown) return
  currentDocument.value = nextDocument
  editor.value.commands.setContent({
    type: 'doc',
    content: writingDocumentToEditorContent(nextDocument)
  }, false)
})

watch(() => [props.annotations, props.activeAnnotationId], () => {
  if (!editor.value) return
  editor.value.view.dispatch(editor.value.state.tr.setMeta(annotationPluginKey, true))
}, { deep: true })

watch(
  () => [props.inlineSuggestionVisible, props.inlineSuggestion, props.inlineSuggestionGenerating, props.inlineSuggestionError],
  ([visible, suggestion, generating, error], [wasVisible, , wasGenerating, wasError]) => {
    const active = Boolean((visible && suggestion) || generating || error)
    const wasActive = Boolean(wasVisible || wasGenerating || wasError)
    if (!active) inlineSuggestionAnchor.value = null
    else if (!wasActive) inlineSuggestionAnchor.value = editor.value?.state.selection.from ?? null
    if (editor.value) editor.value.view.dispatch(editor.value.state.tr.setMeta(inlineSuggestionPluginKey, true))
  }
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function focus() {
  editor.value?.commands.focus()
}

function insertText(text) {
  if (!editor.value || text == null) return false
  return editor.value.chain().focus().insertContent(String(text)).run()
}

function insertPlainText(text) {
  const currentEditor = editor.value
  const value = String(text ?? '')
  if (!currentEditor || !value) return false
  const { from, to } = currentEditor.state.selection
  const textNode = currentEditor.state.schema.text(value)
  const transaction = currentEditor.state.tr
    .replaceRangeWith(from, to, textNode)
    .setMeta('writingAgentInsert', true)
    .scrollIntoView()
  currentEditor.view.dispatch(transaction)
  currentEditor.commands.focus(from + value.length)
  return true
}

function insertDivider() {
  if (!editor.value) return false
  return editor.value.chain().focus().setHorizontalRule().run()
}

function undo() {
  return Boolean(editor.value?.chain().focus().undo().run())
}

function redo() {
  return Boolean(editor.value?.chain().focus().redo().run())
}

function toggleMark(mark) {
  if (!editor.value || !['bold', 'italic', 'strike', 'code'].includes(mark)) return false
  return editor.value.chain().focus().toggleMark(mark).run()
}

function getSelection() {
  if (!editor.value) return null
  const { from, to } = editor.value.state.selection
  return {
    from,
    to,
    empty: from === to,
    text: editor.value.state.doc.textBetween(from, to, '\n')
  }
}

function getRootElement() {
  return editor.value?.view?.dom || null
}

function getAnnotationAnchorMetrics(annotation) {
  if (!editor.value || !annotation) return null
  const blockPositions = new Map()
  editor.value.state.doc.descendants((node, pos) => {
    if (node.attrs?.blockId) blockPositions.set(node.attrs.blockId, { node, pos })
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
  return editor.value.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).run()
}

function findTextRange(query, occurrence = 0, blockId = null) {
  if (!editor.value || !String(query || '')) return null
  const needle = String(query).toLocaleLowerCase()
  let seen = 0
  let result = null

  editor.value.state.doc.nodesBetween(0, editor.value.state.doc.content.size, (node, pos, parent) => {
    if (result || !node.isText) return
    if (blockId && parent?.attrs?.blockId !== blockId) return
    const text = String(node.text || '')
    const index = text.toLocaleLowerCase().indexOf(needle)
    if (index < 0) return
    if (seen === Number(occurrence) || !Number.isFinite(Number(occurrence))) {
      result = { from: pos + index, to: pos + index + String(query).length }
      return
    }
    seen += 1
  })
  return result
}

function selectText(query, occurrence = 0, blockId = null) {
  const range = findTextRange(query, occurrence, blockId)
  return range ? setSelection(range.from, range.to) : false
}

function selectBlockRange(startBlockId, startOffset, endBlockId, endOffset) {
  const startBlock = findBlockRange(startBlockId)
  const endBlock = findBlockRange(endBlockId || startBlockId)
  if (!editor.value || !startBlock || !endBlock) return false
  const from = Math.max(startBlock.from, startBlock.from + Math.max(0, Number(startOffset) || 0))
  const to = Math.max(from, endBlock.from + Math.max(0, Number(endOffset) || 0))
  return setSelection(from, to)
}

function findBlockRange(blockId) {
  if (!editor.value || !blockId) return null
  let result = null
  editor.value.state.doc.descendants((node, pos) => {
    if (result || node.attrs?.blockId !== blockId) return !result
    result = {
      blockId,
      from: pos + 1,
      to: pos + node.nodeSize - 1,
      node
    }
    return false
  })
  return result
}

function replaceTextRange(from, to, text) {
  if (!editor.value) return false
  const start = Number(from)
  const end = Number(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return false
  const transaction = editor.value.state.tr.insertText(String(text ?? ''), start, end)
  editor.value.view.dispatch(transaction)
  editor.value.commands.focus()
  return true
}

function replaceBlockText(blockId, text) {
  const range = findBlockRange(blockId)
  return range ? replaceTextRange(range.from, range.to, text) : false
}

function replaceBlockRanges(patches) {
  if (!editor.value || !Array.isArray(patches) || !patches.length) return false
  const ranges = patches.map((patch) => {
    const block = findBlockRange(patch?.blockId)
    if (!block) return null
    const editorRange = patch?.editorRange
    const from = Number.isFinite(Number(editorRange?.from))
      ? Number(editorRange.from)
      : block.from + Math.max(0, Number(patch?.range?.startOffset || 0))
    const to = Number.isFinite(Number(editorRange?.to))
      ? Number(editorRange.to)
      : block.from + Math.max(0, Number(patch?.range?.endOffset ?? (block.to - block.from)))
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < block.from || to < from || to > block.to) return null
    return { from, to, text: String(patch?.replacement ?? patch?.text ?? '') }
  })
  if (ranges.some((range) => !range)) return false
  const ordered = [...ranges].sort((left, right) => right.from - left.from)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].from < ordered[index].to) return false
  }
  const transaction = editor.value.state.tr
  ordered.forEach((range) => transaction.insertText(range.text, range.from, range.to))
  editor.value.view.dispatch(transaction)
  editor.value.commands.focus()
  return true
}

function focusBlock(blockId) {
  const range = findBlockRange(blockId)
  if (!editor.value || !range) return false
  const position = Math.max(1, Number(range.from) || 1)
  const focused = editor.value.chain().focus().setTextSelection({ from: position, to: position }).run()
  editor.value.commands.scrollIntoView?.()
  return Boolean(focused)
}

function replaceText(query, replacement, occurrence = 0) {
  const range = findTextRange(query, occurrence)
  if (!range) return false
  return editor.value.chain().focus().insertContentAt(range, String(replacement ?? '')).run()
}

function replaceAll(query, replacement) {
  if (!editor.value || !String(query || '')) return false
  const needle = String(query).toLocaleLowerCase()
  const ranges = []
  editor.value.state.doc.nodesBetween(0, editor.value.state.doc.content.size, (node, pos) => {
    if (!node.isText) return
    const text = String(node.text || '')
    let index = text.toLocaleLowerCase().indexOf(needle)
    while (index >= 0) {
      ranges.push({ from: pos + index, to: pos + index + String(query).length })
      index = text.toLocaleLowerCase().indexOf(needle, index + String(query).length)
    }
  })
  if (!ranges.length) return false
  const transaction = editor.value.state.tr
  ranges.reverse().forEach((range) => {
    transaction.insertText(String(replacement ?? ''), range.from, range.to)
  })
  editor.value.view.dispatch(transaction)
  editor.value.commands.focus()
  return true
}

function clearMarks() {
  if (!editor.value) return false
  return editor.value.chain().focus().unsetAllMarks().run()
}

function deleteSelection() {
  if (!editor.value) return false
  return editor.value.chain().focus().deleteSelection().run()
}

function selectAll() {
  if (!editor.value) return false
  return editor.value.chain().focus().selectAll().run()
}

defineExpose({
  editor,
  focus,
  insertText,
  insertPlainText,
  insertDivider,
  undo,
  redo,
  toggleMark,
  getSelection,
  getRootElement,
  getAnnotationAnchorMetrics,
  setSelection,
  selectText,
  selectBlockRange,
  findBlockRange,
  focusBlock,
  replaceTextRange,
  replaceBlockText,
  replaceBlockRanges,
  replaceText,
  replaceAll,
  clearMarks,
  deleteSelection,
  selectAll
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
  font-family: var(--notebook-font-family, Menlo, "Ubuntu Mono", Consolas, "Courier New", "Microsoft Yahei", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif);
  font-size: var(--notebook-font-size, 17.5px);
  font-weight: var(--notebook-font-weight, 400);
  font-style: var(--notebook-font-style, normal);
  line-height: 1.92;
  text-decoration: var(--notebook-text-decoration, none);
  letter-spacing: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.writing-notebook-editor__surface .ProseMirror::selection,
.writing-notebook-editor__surface .ProseMirror *::selection {
  background: color-mix(in srgb, var(--archive-olive, #426f9c) 26%, var(--archive-paper-soft, #f4f8fc));
  color: var(--archive-ink, #17283a);
}

.writing-notebook-editor__surface .ProseMirror > * {
  position: relative;
  margin: 0 0 1.05em;
  padding-inline-start: 12px;
}

.writing-notebook-editor__surface .ProseMirror-focused .is-current-writing-line {
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 2.5%, transparent);
}

.writing-current-line {
  position: absolute;
  z-index: 3;
  border-top: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 6%, transparent);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 3.5%, transparent);
  pointer-events: none;
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

.writing-notebook-editor__surface .ProseMirror > *::before {
  position: absolute;
  left: 0;
  top: 0.18em;
  width: 2px;
  height: calc(100% - 0.36em);
  content: '';
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 18%, transparent);
  opacity: 0.7;
  transition: background-color 140ms ease, opacity 140ms ease, width 140ms ease;
}

.writing-notebook-editor__surface .ProseMirror > *:hover::before,
.writing-notebook-editor__surface .ProseMirror > *:focus-within::before {
  width: 3px;
  background: var(--archive-olive, #1f4d7a);
  opacity: 0.9;
}

.writing-notebook-editor__surface .ProseMirror-focused > .is-live-markdown-active::before {
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

.writing-notebook-editor__surface .ProseMirror hr {
  width: 38%;
  margin: 2.25em auto;
  border: 0;
  border-top: 1px solid var(--notebook-rule);
}

.writing-notebook-editor__loading {
  padding: 36px;
  color: var(--notebook-muted);
  font: 13px/1.6 var(--font-sans, sans-serif);
}

.writing-command-menu-shell {
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
  .writing-command-submenu {
    top: calc(100% + 6px);
    left: 0;
  }

  .writing-notebook-editor__surface {
    padding: 28px 20px 120px;
  }

  .writing-notebook-editor__surface .ProseMirror {
    font-size: 17px;
    line-height: 1.82;
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
