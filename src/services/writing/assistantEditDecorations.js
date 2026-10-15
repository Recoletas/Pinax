import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { editorContentToWritingDocument, getWritingDocumentMarkdown, getWritingMarkdownPosition } from './writingDocumentSchema.js'
import { tr } from '../../i18n/index.js'
export const assistantEditDecorationKey = new PluginKey('assistantEditReview')
export function createAssistantEditDecorations({ getReview, getDocument, act }) {
  function render(state) {
    const { proposal, chapterId, busy } = getReview() || {}
    if (!proposal || !['pending', 'partial'].includes(proposal.status)) return DecorationSet.empty
    const canonical = editorContentToWritingDocument(state.doc.toJSON(), getDocument())
    const markdown = getWritingDocumentMarkdown(canonical)
    const decorations = []
    for (const change of proposal.changes.filter(item => item.kind === 'chapter' && item.field === 'content' && item.targetId === chapterId && (!item.status || item.status === 'pending'))) {
      let from
      if (change.operation === 'append') {
        if (markdown !== change.baseline && (!change.anchor?.prefix || !markdown.endsWith(change.anchor.prefix))) continue
        from = markdown.length
      } else {
        const needle = change.anchor ? change.anchor.prefix + (change.operation === 'insert' ? '' : change.before) + change.anchor.suffix : change.before
        const index = markdown.indexOf(needle)
        if (index < 0 || index !== markdown.lastIndexOf(needle)) continue
        from = index + (change.anchor?.prefix?.length || 0)
      }
      let start = null; let end = null; let blockEnd = state.doc.content.size
      state.doc.descendants((node, position) => {
        if (!node.isTextblock || !node.attrs.nodeId) return
        const offset = getWritingMarkdownPosition(canonical, node.attrs.nodeId, 0)
        const tail = getWritingMarkdownPosition(canonical, node.attrs.nodeId, node.textContent.length)
        if (offset == null || tail == null) return
        if (from >= offset && from <= tail) {
          // Map Markdown marks to the exact plain-text cursor rather than assuming equal offsets.
          for (let local = 0; local <= node.textContent.length; local++) {
            const mapped = getWritingMarkdownPosition(canonical, node.attrs.nodeId, local)
            if (start == null && mapped >= from) start = position + 1 + local
            if (mapped <= from + change.before.length) end = position + 1 + local
          }
          blockEnd = position + node.nodeSize
        }
      })
      if (change.operation !== 'append' && start == null) continue
      if (change.operation !== 'insert' && start != null && end > start) decorations.push(Decoration.inline(start, end, { class: 'assistant-edit-original-range' }))
      decorations.push(Decoration.widget(blockEnd, () => {
        const widget = document.createElement('section')
        widget.className = 'assistant-inline-edit'; widget.contentEditable = 'false'; widget.dataset.changeId = change.changeId || ''
        widget.dataset.label = tr(change.operation === 'append' || change.operation === 'insert' ? '新增内容' : change.operation === 'delete' ? '删除内容' : '替换内容')
        const content = document.createElement('div'); content.className = 'assistant-inline-edit__content'
        for (const text of String(change.after || tr('删除这段文字')).split(/\n\s*\n/)) {
          const paragraph = document.createElement('p'); paragraph.textContent = text; content.append(paragraph)
        }
        widget.append(content)
        const actions = document.createElement('div'); actions.className = 'assistant-inline-edit__actions'
        for (const [label, action] of [['接受', 'adopt'], ['拒绝', 'discard']]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = tr(label); button.disabled = Boolean(busy)
          button.addEventListener('pointerdown', event => event.preventDefault())
          button.addEventListener('click', event => { event.stopPropagation(); act(action, change.changeId) })
          actions.append(button)
        }
        const reason = document.createElement('span'); reason.textContent = change.reason; actions.append(reason); widget.append(actions)
        return widget
      }, { key: `${proposal.id}:${change.changeId}:${change.after}:${busy}`, side: 1, stopEvent: () => true, ignoreSelection: true }))
    }
    return DecorationSet.create(state.doc, decorations)
  }
  return Extension.create({ name: 'assistantEditReview', addProseMirrorPlugins() { return [new Plugin({ key: assistantEditDecorationKey, state: { init: (_, state) => render(state), apply: (transaction, previous, _old, state) => transaction.docChanged || transaction.getMeta(assistantEditDecorationKey) ? render(state) : previous }, props: { decorations: state => assistantEditDecorationKey.getState(state) } })] } })
}
