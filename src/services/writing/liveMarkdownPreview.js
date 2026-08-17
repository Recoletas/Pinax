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

export function resolveWritingCommandMenuPosition({
  anchor,
  viewportWidth = 0,
  viewportHeight = 0,
  menuWidth = 300,
  menuHeight = 216,
  margin = 12,
  gap = 8,
  scale = 1
} = {}) {
  if (!anchor) return null
  const safeScale = Math.max(0.1, Number(scale) || 1)
  const safeViewportWidth = Math.max(margin * 2, Number(viewportWidth) || 0)
  const safeViewportHeight = Math.max(margin * 2, Number(viewportHeight) || 0)
  const visualWidth = Math.max(0, Math.min((Number(menuWidth) || 300) * safeScale, safeViewportWidth - margin * 2))
  const requestedHeight = Math.max(96 * safeScale, (Number(menuHeight) || 216) * safeScale)
  const belowSpace = Math.max(0, safeViewportHeight - margin - Number(anchor.bottom || 0) - gap)
  const aboveSpace = Math.max(0, Number(anchor.top || 0) - margin - gap)
  const placement = requestedHeight <= belowSpace || belowSpace >= aboveSpace ? 'below' : 'above'
  const availableHeight = placement === 'below' ? belowSpace : aboveSpace
  const maxHeight = Math.max(96 * safeScale, Math.min(requestedHeight, availableHeight || requestedHeight))
  const top = placement === 'below'
    ? Math.max(margin, Number(anchor.bottom || 0) + gap)
    : Math.max(margin, Number(anchor.top || 0) - gap - maxHeight)
  const left = Math.max(
    margin,
    Math.min(Number(anchor.left || 0), safeViewportWidth - visualWidth - margin)
  )
  return {
    top: Math.round(top / safeScale),
    left: Math.round(left / safeScale),
    width: Math.round(visualWidth / safeScale),
    maxHeight: Math.round(maxHeight / safeScale),
    placement
  }
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
