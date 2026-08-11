<template>
  <section class="writing-notebook-editor" aria-label="实时 Markdown 写作编辑器">
    <div class="writing-notebook-editor__status" aria-live="polite">
      <span class="writing-notebook-editor__mode">实时 Markdown</span>
      <span class="writing-notebook-editor__status-separator">·</span>
      <span>{{ blockCount }} 个块</span>
      <span class="writing-notebook-editor__status-separator">·</span>
      <span>{{ documentRevision ? `修订 ${documentRevision}` : '未修改' }}</span>
    </div>

    <EditorContent
      v-if="editor"
      :editor="editor"
      class="writing-notebook-editor__surface"
      @contextmenu.prevent="handleContextMenu"
    />

    <div v-else class="writing-notebook-editor__loading">正在建立写作面……</div>
  </section>
</template>

<script setup>
import { computed, defineExpose, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { UniqueID } from '@tiptap/extension-unique-id'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  createWritingDocument,
  editorContentToWritingDocument,
  getWritingDocumentMarkdown,
  writingDocumentToEditorContent
} from '../../services/writing/writingDocumentSchema.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  document: { type: Object, default: null },
  editable: { type: Boolean, default: true },
  annotations: { type: Array, default: () => [] },
  activeAnnotationId: { type: String, default: null }
})

const emit = defineEmits(['update:modelValue', 'update:document', 'selection-change', 'input', 'context-menu', 'annotation-click', 'ready'])

const initialDocument = props.document || createWritingDocument(props.modelValue)

const BlockAttributes = Extension.create({
  name: 'writingBlockAttributes',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
      attributes: {
        blockRevision: { default: 0 },
        blockKind: { default: 'prose' }
      }
    }]
  }
})

const annotationPluginKey = new PluginKey('writingAnnotationDecorations')

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
  const visible = annotations.filter((annotation) => (
    annotation?.status !== 'orphaned'
      && (annotation?.status !== 'resolved' || annotation.id === props.activeAnnotationId)
      && annotationText(annotation)
  ))
  const blockPositions = new Map()
  doc.descendants((node, pos) => {
    if (node.attrs?.blockId) blockPositions.set(node.attrs.blockId, { node, pos })
  })

  visible.forEach((annotation, index) => {
    const blockId = annotation?.range?.start?.blockId || annotation?.blockId
    const block = blockPositions.get(blockId)
    if (!block) return
    const exact = annotationText(annotation)
    const start = Math.max(0, Math.min(block.node.content.size, annotationStart(annotation)))
    const from = block.pos + 1 + start
    const to = Math.min(block.pos + block.node.nodeSize - 1, from + exact.length)
    if (to <= from) return
    const state = annotation.status === 'resolved' ? 'resolved' : 'open'
    const active = annotation.id === props.activeAnnotationId
    decorations.push(Decoration.inline(from, to, {
      class: `writing-annotation-anchor is-${state}${active ? ' is-active' : ''}`,
      'data-annotation-id': annotation.id,
      title: annotation.body || '打开批注'
    }, { annotationId: annotation.id }))
    decorations.push(Decoration.widget(to, () => {
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = `writing-annotation-pin is-${state}${active ? ' is-active' : ''}`
      marker.dataset.annotationId = annotation.id
      marker.setAttribute('aria-label', `打开批注 ${index + 1}`)
      marker.title = annotation.body || '打开批注'
      marker.innerHTML = '<span aria-hidden="true"></span>'
      return marker
    }, { side: 1, key: `annotation-pin-${annotation.id}` }))
  })
  return DecorationSet.create(doc, decorations)
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
      heading: { levels: [1, 2, 3] },
      history: true
    }),
    BlockAttributes,
    AnnotationDecorations,
    UniqueID.configure({
      types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
      attributeName: 'blockId',
      generateID: ({ node, pos }) => `block-editor-${node.type.name}-${pos}-${Date.now().toString(36)}`
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
  },
  onUpdate({ editor: currentEditor, transaction }) {
    if (!transaction.docChanged) return
    emitDocument(currentEditor)
    emit('input', {
      inputType: transaction.getMeta('uiEvent') || 'input',
      composing: Boolean(transaction.getMeta('composition'))
    })
  },
  onSelectionUpdate({ editor: currentEditor }) {
    const { from, to } = currentEditor.state.selection
    const getBlockNode = (position) => {
      const resolved = currentEditor.state.doc.resolve(Math.max(0, Math.min(currentEditor.state.doc.content.size, position)))
      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        const node = resolved.node(depth)
        if (node?.attrs?.blockId) return node
      }
      return null
    }
    const startBlock = getBlockNode(from)
    const endBlock = getBlockNode(Math.max(from, to - 1)) || startBlock
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
      endBlockRevision: Number(endBlock?.attrs?.blockRevision || 0)
    })
  }
})

const blockCount = computed(() => editor.value?.state.doc.childCount || 0)
const documentRevision = computed(() => currentDocument.value?.revision || 0)

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
  insertDivider,
  undo,
  redo,
  toggleMark,
  getSelection,
  getRootElement,
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
}

.writing-notebook-editor__status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 6px 18px;
  border-bottom: 1px solid var(--notebook-rule);
  color: var(--notebook-muted);
  font: 11px/1.2 var(--font-sans, sans-serif);
}

.writing-notebook-editor__status-separator {
  opacity: 0.5;
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
  font-family: var(--notebook-font-family, var(--font-serif, Georgia, serif));
  font-size: var(--notebook-font-size, 17.5px);
  font-weight: var(--notebook-font-weight, 400);
  font-style: var(--notebook-font-style, normal);
  line-height: 1.92;
  text-decoration: var(--notebook-text-decoration, none);
  letter-spacing: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.writing-notebook-editor__surface .ProseMirror > * {
  position: relative;
  margin: 0 0 1.05em;
  padding-inline-start: 12px;
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

.writing-notebook-editor__surface .ProseMirror .writing-annotation-anchor {
  background: color-mix(in srgb, var(--archive-gold, #7d97b0) 9%, transparent);
  text-decoration-line: underline;
  text-decoration-color: color-mix(in srgb, var(--archive-gold, #7d97b0) 72%, transparent);
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  cursor: pointer;
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-anchor.is-active {
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 12%, transparent);
  text-decoration-color: var(--archive-olive-strong, #1f4d7a);
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 18px;
  margin: 0 2px;
  padding: 0;
  border: 0;
  background: transparent;
  vertical-align: text-bottom;
  cursor: pointer;
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-pin span {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--archive-gold, #7d97b0);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--archive-gold, #7d97b0) 12%, transparent);
}

.writing-notebook-editor__surface .ProseMirror .writing-annotation-pin.is-active span {
  width: 6px;
  height: 6px;
  background: var(--archive-olive-strong, #1f4d7a);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--archive-olive, #1f4d7a) 15%, transparent);
}

.writing-notebook-editor__surface .ProseMirror h1,
.writing-notebook-editor__surface .ProseMirror h2,
.writing-notebook-editor__surface .ProseMirror h3 {
  margin-top: 1.8em;
  color: var(--archive-olive-strong, var(--notebook-ink));
  font-family: var(--font-serif, Georgia, serif);
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

@media (max-width: 760px) {
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

  .writing-notebook-editor__surface .ProseMirror > *::before {
    left: 0;
    width: 2px;
  }
}
</style>
