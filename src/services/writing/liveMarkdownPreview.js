export function getLiveMarkdownPrefix(node = {}) {
  const type = typeof node.type === 'string'
    ? node.type
    : String(node.type?.name || '')
  if (type === 'heading') {
    const level = Math.max(1, Math.min(6, Math.floor(Number(node.level ?? node.attrs?.level) || 1)))
    return `${'#'.repeat(level)} `
  }
  if (type === 'blockquote') return '> '
  return ''
}

export function resolveMarkdownHeadingShortcut({
  nodeType = 'paragraph',
  currentLevel = 0,
  textBefore = '',
  insertedText = ''
} = {}) {
  const type = String(nodeType || '')
  const before = String(textBefore || '')
  const inserted = String(insertedText || '')

  if (type === 'heading' && Number(currentLevel) === 2 && !before && inserted === '#') {
    return { level: 3, removePrefix: 0, insertedText: '' }
  }
  if (type !== 'paragraph') return null
  if (before === '#' && inserted === '#') {
    return { level: 2, removePrefix: 1, insertedText: '' }
  }

  const prefix = before.match(/^(#{1,3})$/)?.[1] || ''
  if (!prefix || !inserted || inserted.startsWith('#') || /^\s/u.test(inserted)) return null
  return { level: prefix.length, removePrefix: prefix.length, insertedText: inserted }
}

const LIVE_MARKDOWN_MARKS = [
  { type: 'code', open: '`', close: '`' },
  { type: 'bold', open: '**', close: '**' },
  { type: 'strike', open: '~~', close: '~~' },
  { type: 'italic', open: '*', close: '*' }
]

export function getLiveMarkdownMarkSpec(markNames = []) {
  const names = new Set((Array.isArray(markNames) ? markNames : []).map((name) => String(name || '')))
  return LIVE_MARKDOWN_MARKS.find((mark) => names.has(mark.type)) || null
}

export function canOpenWritingCommandMenu({
  selectionEmpty = false,
  nodeType = '',
  parentOffset = -1,
  contentSize = -1
} = {}) {
  return Boolean(selectionEmpty)
    && String(nodeType) === 'paragraph'
    && Number(parentOffset) === 0
    && Number(contentSize) === 0
}

export function resolveCurrentLineOverlayGeometry({
  coordinates,
  rootBox,
  editorBox,
  lineHeight,
  scale = 1
} = {}) {
  if (!coordinates || !rootBox || !editorBox) return null
  const safeScale = Math.max(0.1, Number(scale) || 1)
  const caretHeight = Math.max(1, Number(coordinates.bottom) - Number(coordinates.top)) / safeScale
  const safeLineHeight = Math.max(caretHeight, Number(lineHeight) || caretHeight)
  return {
    top: (Number(coordinates.top) - Number(rootBox.top)) / safeScale - (safeLineHeight - caretHeight) / 2,
    left: (Number(editorBox.left) - Number(rootBox.left)) / safeScale,
    width: Number(editorBox.width) / safeScale,
    height: safeLineHeight
  }
}

export function resolveWritingCommandMenuKey({
  key = '',
  activeIndex = 0,
  itemCount = 0,
  hasChildren = false,
  hasParent = false
} = {}) {
  const count = Math.max(0, Math.floor(Number(itemCount) || 0))
  const current = Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(Number(activeIndex) || 0)))
  if (!count) return null
  if (key === 'ArrowDown') return { action: 'move', index: (current + 1) % count }
  if (key === 'ArrowUp') return { action: 'move', index: (current - 1 + count) % count }
  if (key === 'ArrowRight' && hasChildren) return { action: 'expand', index: current }
  if (key === 'ArrowLeft' && hasParent) return { action: 'back', index: current }
  if (key === 'Enter') return { action: 'select', index: current }
  if (key === 'Escape') return { action: 'close', index: current }
  return null
}
