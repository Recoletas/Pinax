import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function unitPositionAt(source, index) {
  const doc = source?.doc || source
  let found = null
  doc?.forEach?.((node, pos, childIndex) => {
    if (childIndex === index) found = { node, pos }
  })
  return found
}

function currentUnit(state) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'writingUnit') continue
    const unitPos = $from.before(depth)
    let unitIndex = -1
    state.doc.forEach((child, pos, index) => {
      if (pos === unitPos) unitIndex = index
    })
    return { node, unitPos, unitIndex, depth, resolved: $from }
  }
  return null
}

function unitFrom(unit, attrs, content) {
  return unit.type.create(attrs, content, unit.marks)
}

function nodeWithId(node, nodeId) {
  return node.type.create({ ...node.attrs, nodeId, nodeRevision: Number(node.attrs?.nodeRevision || 0) }, node.content, node.marks)
}

function splitBlockquoteAtSelection(node, resolved, quoteDepth, idFactory) {
  if (resolved.depth <= quoteDepth || resolved.node(quoteDepth) !== node) return null
  const paragraphIndex = resolved.index(quoteDepth)
  const paragraph = resolved.node(quoteDepth + 1)
  if (!paragraph?.isTextblock) return null
  const paragraphOffset = Math.max(0, Math.min(paragraph.content.size, resolved.parentOffset))
  const leftChildren = node.content.content.slice(0, paragraphIndex)
  const rightChildren = node.content.content.slice(paragraphIndex + 1)

  if (paragraphOffset > 0) {
    leftChildren.push(paragraph.type.create(
      paragraph.attrs,
      paragraph.content.cut(0, paragraphOffset),
      paragraph.marks
    ))
  }
  if (paragraphOffset < paragraph.content.size) {
    const rightParagraph = paragraph.type.create(
      paragraph.attrs,
      paragraph.content.cut(paragraphOffset),
      paragraph.marks
    )
    rightChildren.unshift(paragraphOffset > 0
      ? nodeWithId(rightParagraph, idFactory('node'))
      : rightParagraph)
  }
  if (!leftChildren.length || !rightChildren.length) return null

  const previousTextLength = node.content.content
    .slice(0, paragraphIndex)
    .reduce((length, child) => length + child.textContent.length, 0)
  const separatorLength = paragraphIndex * 2
  // 在上一段末尾拆分，与在下一段开头拆分应落到同一个 canonical
  // 边界。blockquote 的直接段落之间以两个换行保存，因此当右侧直接
  // 从下一段开始时，还要跨过这段分隔符；否则批注会被迁到右块内偏后
  // 两个字符的位置。
  const trailingParagraphSeparator = paragraphOffset === paragraph.content.size && rightChildren.length
    ? 2
    : 0
  return {
    left: node.type.create(node.attrs, leftChildren, node.marks),
    right: nodeWithId(node.type.create(node.attrs, rightChildren, node.marks), idFactory('node')),
    offset: previousTextLength + separatorLength + paragraphOffset + trailingParagraphSeparator
  }
}

function createTransition(type, keptUnitId, createdUnitId = null, removedUnitId = null, units = []) {
  const nodeUnitMap = {}
  units.forEach((unit) => {
    unit.forEach((node) => {
      if (node.attrs?.nodeId) nodeUnitMap[node.attrs.nodeId] = unit.attrs?.unitId || keptUnitId
    })
  })
  return { transitionId: makeId('transition'), type, keptUnitId, createdUnitId, removedUnitId, nodeUnitMap }
}

function documentUnitPosition(doc, unitId) {
  let found = null
  doc.forEach((node, pos) => {
    if (found == null && String(node.attrs?.unitId || '') === String(unitId || '')) found = pos
  })
  return found
}

function dispatchStructuralTransaction(dispatch, transaction, selectionPosition = null, bias = 1) {
  transaction.setMeta('writingInputOrigin', 'structure')
  if (Number.isFinite(selectionPosition)) {
    const safePosition = Math.max(0, Math.min(transaction.doc.content.size, selectionPosition))
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(safePosition), bias))
  }
  dispatch(closeHistory(transaction).scrollIntoView())
}

function splitUnitTransaction(state, dispatch, idFactory = makeId) {
  if (!state.selection.empty) return false
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  const { node: unit, unitPos } = current
  const contentStart = unitPos + 1
  const cursor = state.selection.from
  let splitIndex = -1
  let splitNode = null
  let childOffset = 0
  let splitChildren = null
  unit.content.forEach((child, _offset, index) => {
    const childStart = contentStart + childOffset
    const childEnd = childStart + child.nodeSize
    if (splitIndex >= 0) {
      childOffset += child.nodeSize
      return
    }
    if (cursor === childEnd) {
      splitIndex = index + 1
      childOffset += child.nodeSize
      return
    }
    if (cursor >= childStart && cursor <= childEnd) {
      const innerOffset = Math.max(0, Math.min(child.content.size, cursor - childStart - 1))
      if (innerOffset > 0 && innerOffset < child.content.size && child.isTextblock) {
        const left = child.type.create(child.attrs, child.content.cut(0, innerOffset), child.marks)
        const right = nodeWithId(
          child.type.create(child.attrs, child.content.cut(innerOffset), child.marks),
          idFactory('node')
        )
        splitIndex = index
        splitNode = { oldNodeId: child.attrs?.nodeId || null, newNodeId: right.attrs?.nodeId || null, offset: innerOffset }
        splitChildren = {
          left: unit.content.content.slice(0, index).concat(left),
          right: [right].concat(unit.content.content.slice(index + 1))
        }
        return
      }
      if (innerOffset > 0 && innerOffset < child.content.size && child.type.name === 'blockquote') {
        const quoteSplit = splitBlockquoteAtSelection(child, current.resolved, current.depth + 1, idFactory)
        if (quoteSplit) {
          const { left, right } = quoteSplit
          splitIndex = index
          splitNode = {
            oldNodeId: child.attrs?.nodeId || null,
            newNodeId: right.attrs?.nodeId || null,
            offset: quoteSplit.offset
          }
          splitChildren = {
            left: unit.content.content.slice(0, index).concat(left),
            right: [right].concat(unit.content.content.slice(index + 1))
          }
          return
        }
        const quoteDepth = current.depth + 1
        const atQuoteStart = current.resolved.node(quoteDepth) === child
          && current.resolved.index(quoteDepth) === 0
          && current.resolved.parentOffset === 0
        splitIndex = atQuoteStart ? index : index + 1
        return
      }
      splitIndex = innerOffset === 0 ? index : index + 1
    }
    childOffset += child.nodeSize
  })

  if (!splitChildren && (splitIndex <= 0 || splitIndex >= unit.childCount)) return false
  const children = unit.content.content
  const leftChildren = splitChildren?.left || children.slice(0, splitIndex)
  const rightChildren = splitChildren?.right || children.slice(splitIndex)
  const leftUnit = unitFrom(unit, {
    ...unit.attrs,
    unitRevision: Number(unit.attrs?.unitRevision || 0) + 1
  }, leftChildren)
  const rightUnit = unitFrom(unit, {
    ...unit.attrs,
    unitId: idFactory('unit'),
    unitRevision: Number(unit.attrs?.unitRevision || 0) + 1
  }, rightChildren)
  if (dispatch) {
    const transaction = state.tr.replaceWith(unitPos, unitPos + unit.nodeSize, [leftUnit, rightUnit])
    transaction.setMeta('writingUnitTransition', {
      ...createTransition('split', leftUnit.attrs.unitId, rightUnit.attrs.unitId, null, [leftUnit, rightUnit]),
      ...(splitNode ? { splitNode } : {})
    })
    const rightUnitPos = documentUnitPosition(transaction.doc, rightUnit.attrs.unitId)
    dispatchStructuralTransaction(dispatch, transaction, rightUnitPos == null ? null : rightUnitPos + 1, 1)
  }
  return true
}

function mergeUnitTransaction(state, dispatch, direction = 'previous') {
  if (!state.selection.empty) return false
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  const neighborIndex = direction === 'next' ? current.unitIndex + 1 : current.unitIndex - 1
  const neighbor = unitPositionAt(state, neighborIndex)
  if (!neighbor) return false
  const left = direction === 'next' ? current.node : neighbor.node
  const right = direction === 'next' ? neighbor.node : current.node
  const merged = unitFrom(left, {
    ...left.attrs,
    unitRevision: Math.max(Number(left.attrs?.unitRevision || 0), Number(right.attrs?.unitRevision || 0)) + 1,
    originRefs: [...(left.attrs?.originRefs || []), ...(right.attrs?.originRefs || [])]
      .filter((ref, index, refs) => refs.findIndex((item) => JSON.stringify(item) === JSON.stringify(ref)) === index)
  }, left.content.content.concat(right.content.content))
  const from = Math.min(current.unitPos, neighbor.pos)
  const to = Math.max(current.unitPos + current.node.nodeSize, neighbor.pos + neighbor.node.nodeSize)
  if (dispatch) {
    const transaction = state.tr.replaceWith(from, to, merged)
    transaction.setMeta('writingUnitTransition', createTransition(
      'merge', merged.attrs.unitId, null,
      right.attrs.unitId,
      [merged]
    ))
    const cursorInCurrentUnit = state.selection.from - current.unitPos
    const selectionPosition = direction === 'next'
      ? from + cursorInCurrentUnit
      : from + 1 + left.content.size + Math.max(0, cursorInCurrentUnit - 1)
    dispatchStructuralTransaction(dispatch, transaction, selectionPosition, -1)
  }
  return true
}

function moveUnitTransaction(state, dispatch, direction) {
  if (!state.selection.empty) return false
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  const targetIndex = direction === 'up' ? current.unitIndex - 1 : current.unitIndex + 1
  if (targetIndex < 0 || targetIndex >= state.doc.childCount) return false
  const units = state.doc.content.content.slice()
  const [moving] = units.splice(current.unitIndex, 1)
  units.splice(targetIndex, 0, moving)
  if (dispatch) {
    const transaction = state.tr.replaceWith(0, state.doc.content.size, units)
    transaction.setMeta('writingUnitTransition', createTransition(
      'move', moving.attrs.unitId, null, null, units
    ))
    const movedPos = documentUnitPosition(transaction.doc, moving.attrs.unitId)
    const unitRelativeCursor = state.selection.from - current.unitPos
    dispatchStructuralTransaction(
      dispatch,
      transaction,
      movedPos == null ? null : movedPos + Math.max(1, Math.min(moving.nodeSize - 1, unitRelativeCursor)),
      1
    )
  }
  return true
}

// 删除整个单元（worldbook scene closure Task 4）：发出 typed delete transition，
// 场景锚点据此把该单元的锚点标记为 stale（保留可诊断，不静默丢弃）。
// 文档至少要剩一个单元（doc 内容模型是 writingUnit+），最后一个单元不可删。
function deleteUnitTransaction(state, dispatch) {
  if (!state.selection.empty) return false
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  if (state.doc.childCount <= 1) return false
  const removed = current.node
  const from = current.unitPos
  const to = from + removed.nodeSize
  if (dispatch) {
    const transaction = state.tr.delete(from, to)
    transaction.setMeta('writingUnitTransition', {
      ...createTransition('delete', null, null, removed.attrs?.unitId || null, []),
      keptUnitId: null,
      createdUnitId: null,
      removedUnitId: removed.attrs?.unitId || null
    })
    const focusIndex = Math.min(current.unitIndex, transaction.doc.childCount - 1)
    const focusUnit = unitPositionAt(transaction.doc, focusIndex)
    dispatchStructuralTransaction(dispatch, transaction, focusUnit ? focusUnit.pos + 1 : null, 1)
  }
  return true
}

export const WritingDocumentNode = Node.create({
  name: 'doc',
  topNode: true,
  content: 'writingUnit+'
})

export const WritingUnitNode = Node.create({
  name: 'writingUnit',
  group: 'writingUnit',
  content: 'block+',
  defining: true,
  // 顶层写作单元是跨系统身份边界；StarterKit 的 joinBackward/
  // joinForward 不能绕过 typed merge transaction 静默吞掉 unit attrs。
  isolating: true,
  addAttributes() {
    return {
      unitId: { default: null, parseHTML: (element) => element.dataset.unitId, renderHTML: (attrs) => ({ 'data-unit-id': attrs.unitId }) },
      unitRevision: { default: 0, parseHTML: (element) => Number(element.dataset.unitRevision || 0), renderHTML: (attrs) => ({ 'data-unit-revision': attrs.unitRevision }) },
      unitKind: { default: 'passage', parseHTML: (element) => element.dataset.unitKind || 'passage', renderHTML: (attrs) => ({ 'data-unit-kind': attrs.unitKind }) },
      sceneId: { default: null, parseHTML: (element) => element.dataset.sceneId || null, renderHTML: (attrs) => attrs.sceneId ? { 'data-scene-id': attrs.sceneId } : {} },
      originRefs: { default: [], rendered: false }
    }
  },
  parseHTML: () => [{ tag: 'section[data-writing-unit]' }],
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-writing-unit': '' }), 0]
  },
  addCommands() {
    return {
      splitWritingUnit: () => ({ state, dispatch }) => splitUnitTransaction(state, dispatch, makeId),
      mergeWritingUnit: (direction = 'previous') => ({ state, dispatch }) => mergeUnitTransaction(state, dispatch, direction),
      moveWritingUnit: (direction) => ({ state, dispatch }) => moveUnitTransaction(state, dispatch, direction),
      deleteWritingUnit: () => ({ state, dispatch }) => deleteUnitTransaction(state, dispatch)
    }
  }
})

export const MediaReferenceNode = Node.create({
  name: 'mediaReference',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,
  addAttributes() {
    return {
      nodeId: { default: null },
      nodeRevision: { default: 0 },
      nodeKind: { default: 'media-reference' },
      rawMarkdown: { default: null },
      leadingMarkdown: { default: '' },
      originalText: { default: null },
      mediaAssetId: { default: '' },
      alt: { default: '正文插画' },
      sourceRefs: { default: [], rendered: false }
    }
  },
  parseHTML: () => [{ tag: 'figure[data-media-reference]' }],
  renderHTML({ HTMLAttributes }) {
    const alt = String(HTMLAttributes.alt || '正文插画')
    return ['figure', mergeAttributes(HTMLAttributes, {
      'data-media-reference': '',
      'data-media-asset-id': HTMLAttributes.mediaAssetId || '',
      contenteditable: 'false'
    }),
    ['span', { class: 'writing-media-reference__mark', 'aria-hidden': 'true' }, '插图'],
    ['figcaption', { class: 'writing-media-reference__caption' }, alt]]
  }
})

export const WritingNodeAttributes = Extension.create({
  name: 'writingNodeAttributes',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading', 'horizontalRule', 'blockquote'],
    attributes: {
      nodeId: { default: null },
      nodeRevision: { default: 0 },
      nodeKind: { default: 'prose' },
      rawMarkdown: { default: null },
      leadingMarkdown: { default: '' },
      originalText: { default: null }
    }
  }]
})

export { splitUnitTransaction, mergeUnitTransaction, moveUnitTransaction, deleteUnitTransaction }
