import { Extension, Node, mergeAttributes } from '@tiptap/core'

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function unitPositionAt(state, index) {
  let found = null
  state.doc.forEach((node, pos, childIndex) => {
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

function createTransition(type, keptUnitId, createdUnitId = null, removedUnitId = null, units = []) {
  const nodeUnitMap = {}
  units.forEach((unit) => {
    unit.forEach((node) => {
      if (node.attrs?.nodeId) nodeUnitMap[node.attrs.nodeId] = unit.attrs?.unitId || keptUnitId
    })
  })
  return { type, keptUnitId, createdUnitId, removedUnitId, nodeUnitMap }
}

function splitUnitTransaction(state, dispatch, idFactory = makeId) {
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  const { node: unit, unitPos } = current
  const contentStart = unitPos + 1
  const cursor = state.selection.from
  let splitIndex = -1
  let splitNode = null
  let splitOffset = null
  let childOffset = 0
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
        const leftChildren = unit.content.content.slice(0, index).concat(left)
        const rightChildren = [right].concat(unit.content.content.slice(index + 1))
        const rightUnit = unitFrom(unit, {
          ...unit.attrs,
          unitId: idFactory('unit'),
          unitRevision: Number(unit.attrs?.unitRevision || 0) + 1
        }, rightChildren)
        const leftUnit = unitFrom(unit, {
          ...unit.attrs,
          unitRevision: Number(unit.attrs?.unitRevision || 0) + 1
        }, leftChildren)
        if (!leftChildren.length || !rightChildren.length) return false
        if (dispatch) {
          const transaction = state.tr.replaceWith(unitPos, unitPos + unit.nodeSize, [leftUnit, rightUnit])
          transaction.setMeta('writingUnitTransition', {
            ...createTransition('split', leftUnit.attrs.unitId, rightUnit.attrs.unitId, null, [leftUnit, rightUnit]),
            splitNode
          })
          dispatch(transaction.scrollIntoView())
        }
        return true
      }
      splitIndex = innerOffset === 0 ? index : index + 1
    }
    childOffset += child.nodeSize
  })

  if (splitIndex <= 0 || splitIndex >= unit.childCount) return false
  const children = unit.content.content
  const leftChildren = children.slice(0, splitIndex)
  const rightChildren = children.slice(splitIndex)
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
    transaction.setMeta('writingUnitTransition', createTransition(
      'split', leftUnit.attrs.unitId, rightUnit.attrs.unitId, null, [leftUnit, rightUnit]
    ))
    dispatch(transaction.scrollIntoView())
  }
  return true
}

function mergeUnitTransaction(state, dispatch, direction = 'previous') {
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
    dispatch(transaction.scrollIntoView())
  }
  return true
}

function moveUnitTransaction(state, dispatch, direction) {
  const current = currentUnit(state)
  if (!current || current.unitIndex < 0) return false
  const targetIndex = direction === 'up' ? current.unitIndex - 1 : current.unitIndex + 1
  if (targetIndex < 0 || targetIndex >= state.doc.childCount) return false
  const units = state.doc.children.slice()
  const [moving] = units.splice(current.unitIndex, 1)
  units.splice(targetIndex, 0, moving)
  if (dispatch) {
    const transaction = state.tr.replaceWith(0, state.doc.content.size, units)
    transaction.setMeta('writingUnitTransition', createTransition(
      'move', moving.attrs.unitId, null, null, units
    ))
    dispatch(transaction.scrollIntoView())
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
      moveWritingUnit: (direction) => ({ state, dispatch }) => moveUnitTransaction(state, dispatch, direction)
    }
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

export { splitUnitTransaction, mergeUnitTransaction, moveUnitTransaction }
