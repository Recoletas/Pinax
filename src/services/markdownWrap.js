/**
 * Markdown selection wrapping — pure functions.
 *
 * Replaces contenteditable-only `document.execCommand('bold'/'italic'/...)`
 * with a markdown-string transform that Writing.vue's textarea can apply
 * directly to `markdownContent` (no DOM dependency).
 *
 * Every function is pure: no DOM, no localStorage, no global state.
 */

const WRAP_COMMANDS = {
  bold: { prefix: '**', suffix: '**', placeholder: '加粗文本' },
  italic: { prefix: '*', suffix: '*', placeholder: '斜体文本' },
  underline: { prefix: '<u>', suffix: '</u>', placeholder: '下划线文本' },
  'inline-code': { prefix: '`', suffix: '`', placeholder: '代码' }
}

const HEADING_COMMANDS = { h1: 1, h2: 2, h3: 3 }

const HEADING_PREFIX_REGEX = /^#{1,6}\s/
const ORDERED_LIST_REGEX = /^\d+\.\s/

function isBoldWrapped(text, start, end) {
  if (start < 2 || end + 2 > text.length) return false
  return text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**'
}

function isItalicWrapped(text, start, end) {
  if (start < 1 || end + 1 > text.length) return false
  if (text[start - 1] !== '*' || text[end] !== '*') return false
  // Must not be bold (`**` immediately before/after)
  if (start >= 2 && text[start - 2] === '*') return false
  if (end + 1 < text.length && text[end + 1] === '*') return false
  return true
}

function isGenericWrapped(text, start, end, prefix, suffix) {
  if (start < prefix.length || end + suffix.length > text.length) return false
  return (
    text.slice(start - prefix.length, start) === prefix &&
    text.slice(end, end + suffix.length) === suffix
  )
}

function unwrapInline(text, start, end, prefix, suffix) {
  const before = text.slice(0, start - prefix.length)
  const middle = text.slice(start, end)
  const after = text.slice(end + suffix.length)
  return {
    text: before + middle + after,
    selection: { start: start - prefix.length, end: end - prefix.length },
    changed: true
  }
}

function wrapInline(text, start, end, prefix, suffix, placeholder) {
  if (start === end) {
    const insertion = prefix + placeholder + suffix
    const newText = text.slice(0, start) + insertion + text.slice(end)
    return {
      text: newText,
      selection: {
        start: start + prefix.length,
        end: start + prefix.length + placeholder.length
      },
      changed: true
    }
  }
  const newText =
    text.slice(0, start) + prefix + text.slice(start, end) + suffix + text.slice(end)
  return {
    text: newText,
    selection: { start: start + prefix.length, end: end + prefix.length },
    changed: true
  }
}

function getLineRange(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  let lineEnd = text.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = text.length
  return { lineStart, lineEnd }
}

function findLineIndex(offsetInBlock, lines) {
  let acc = 0
  for (let i = 0; i < lines.length; i++) {
    if (offsetInBlock <= acc + lines[i].length) return i
    acc += lines[i].length + 1
  }
  return lines.length - 1
}

function buildLineMaps(lineStart, lines, oldPrefixLens, newPrefixLens) {
  const oldLineStarts = []
  const oldLineEnds = []
  let acc = lineStart
  for (let i = 0; i < lines.length; i++) {
    oldLineStarts.push(acc)
    oldLineEnds.push(acc + lines[i].length)
    acc += lines[i].length + 1
  }

  const newLineStarts = []
  const newLineEnds = []
  acc = lineStart
  for (let i = 0; i < lines.length; i++) {
    const newLen = newPrefixLens[i] + (lines[i].length - oldPrefixLens[i])
    newLineStarts.push(acc)
    newLineEnds.push(acc + newLen)
    acc += newLen + 1
  }

  return { oldLineStarts, newLineStarts, oldLineEnds, newLineEnds }
}

function mapPosition(lineStart, lines, oldLineStarts, newLineStarts, oldPrefixLens, newPrefixLens, p) {
  const offsetInBlock = p - lineStart
  const k = findLineIndex(offsetInBlock, lines)
  const offsetInLine = offsetInBlock - (oldLineStarts[k] - lineStart)
  if (offsetInLine < oldPrefixLens[k]) {
    // In old prefix part: map to new prefix (clamped if shorter)
    return newLineStarts[k] + Math.min(offsetInLine, newPrefixLens[k])
  }
  // In old content (or at content boundary when oldPrefixLen is 0): shift by prefix delta
  return newLineStarts[k] + newPrefixLens[k] + (offsetInLine - oldPrefixLens[k])
}

function applyLineCommand(text, start, end, prefix) {
  const { lineStart, lineEnd } = getLineRange(text, start, end)
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')

  const allPrefixed = lines.every((l) => l.startsWith(prefix))
  const oldPrefixLens = lines.map(() => (allPrefixed ? prefix.length : 0))
  const newPrefixLens = lines.map(() => (allPrefixed ? 0 : prefix.length))

  const newLines = allPrefixed
    ? lines.map((l) => l.slice(prefix.length))
    : lines.map((l) => prefix + l)

  const newBlock = newLines.join('\n')
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd)

  const { oldLineStarts, newLineStarts } = buildLineMaps(
    lineStart,
    lines,
    oldPrefixLens,
    newPrefixLens
  )
  const newStart = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    start
  )
  const newEnd = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    end
  )

  return {
    text: newText,
    selection: { start: newStart, end: newEnd },
    changed: true
  }
}

function applyOrderedList(text, start, end) {
  const { lineStart, lineEnd } = getLineRange(text, start, end)
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')

  const allOrdered = lines.every((l) => ORDERED_LIST_REGEX.test(l))
  const oldPrefixLens = lines.map((l) => {
    if (!allOrdered) return 0
    const m = l.match(ORDERED_LIST_REGEX)
    return m ? m[0].length : 0
  })
  const newPrefixLens = allOrdered
    ? lines.map(() => 0)
    : lines.map((_, i) => `${i + 1}. `.length)

  const newLines = allOrdered
    ? lines.map((l) => l.replace(ORDERED_LIST_REGEX, ''))
    : lines.map((l, i) => `${i + 1}. ${l}`)

  const newBlock = newLines.join('\n')
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd)

  const { oldLineStarts, newLineStarts } = buildLineMaps(
    lineStart,
    lines,
    oldPrefixLens,
    newPrefixLens
  )
  const newStart = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    start
  )
  const newEnd = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    end
  )

  return {
    text: newText,
    selection: { start: newStart, end: newEnd },
    changed: true
  }
}

function applyHeading(text, start, end, level) {
  const newPrefix = '#'.repeat(level) + ' '
  const { lineStart, lineEnd } = getLineRange(text, start, end)
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')

  const oldPrefixLens = lines.map((l) => {
    const m = l.match(HEADING_PREFIX_REGEX)
    return m ? m[0].length : 0
  })
  const newPrefixLens = lines.map(() => newPrefix.length)

  const newLines = lines.map(
    (l) => newPrefix + l.replace(HEADING_PREFIX_REGEX, '')
  )

  const noChange = newLines.every((nl, i) => nl === lines[i])

  const newBlock = newLines.join('\n')
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd)

  if (noChange) {
    return { text: newText, selection: { start, end }, changed: false }
  }

  const { oldLineStarts, newLineStarts } = buildLineMaps(
    lineStart,
    lines,
    oldPrefixLens,
    newPrefixLens
  )
  const newStart = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    start
  )
  const newEnd = mapPosition(
    lineStart,
    lines,
    oldLineStarts,
    newLineStarts,
    oldPrefixLens,
    newPrefixLens,
    end
  )

  return {
    text: newText,
    selection: { start: newStart, end: newEnd },
    changed: true
  }
}

export function wrapMarkdownSelection(text, selection, command) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string')
  }
  if (
    !selection ||
    typeof selection.start !== 'number' ||
    typeof selection.end !== 'number'
  ) {
    throw new TypeError('selection must be { start: number, end: number }')
  }

  const max = text.length
  const lo = Math.max(0, Math.min(selection.start, max))
  const hi = Math.max(0, Math.min(selection.end, max))
  const start = Math.min(lo, hi)
  const end = Math.max(lo, hi)

  if (command in WRAP_COMMANDS) {
    const { prefix, suffix, placeholder } = WRAP_COMMANDS[command]
    if (command === 'bold' && isBoldWrapped(text, start, end)) {
      return unwrapInline(text, start, end, prefix, suffix)
    }
    if (command === 'italic' && isItalicWrapped(text, start, end)) {
      return unwrapInline(text, start, end, prefix, suffix)
    }
    if (
      command !== 'bold' &&
      command !== 'italic' &&
      isGenericWrapped(text, start, end, prefix, suffix)
    ) {
      return unwrapInline(text, start, end, prefix, suffix)
    }
    return wrapInline(text, start, end, prefix, suffix, placeholder)
  }

  if (command in HEADING_COMMANDS) {
    return applyHeading(text, start, end, HEADING_COMMANDS[command])
  }

  if (command === 'quote') {
    return applyLineCommand(text, start, end, '> ')
  }

  if (command === 'bullet-list') {
    return applyLineCommand(text, start, end, '- ')
  }

  if (command === 'ordered-list') {
    return applyOrderedList(text, start, end)
  }

  return { text, selection: { start, end }, changed: false }
}

export const __testing = {
  WRAP_COMMANDS,
  HEADING_COMMANDS,
  isBoldWrapped,
  isItalicWrapped,
  isGenericWrapped,
  getLineRange,
  findLineIndex,
  buildLineMaps,
  mapPosition
}
