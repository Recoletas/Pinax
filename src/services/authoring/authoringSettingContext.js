const CONSTRAINT_TYPES = new Set(['rule', 'style', 'forbidden'])
const MAX_VISIBLE_OCCURRENCES = 3

function text(value) { return String(value || '').trim() }
function list(value) { return Array.isArray(value) ? value : [] }
function nodeText(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node.text === 'string') return node.text
  return list(node.content).map(nodeText).join('')
}
function flattenDocument(document) {
  const blocks = []
  for (const unit of list(document?.content)) for (const node of list(unit?.content)) {
    const content = nodeText(node)
    const nodeId = text(node?.attrs?.nodeId || node?.attrs?.blockId)
    if (nodeId && content) blocks.push({ nodeId, unitId: text(unit?.attrs?.unitId), text: content, index: blocks.length })
  }
  return blocks
}
function entryTerms(entry) {
  return [...new Set([entry?.name, ...list(entry?.keys), ...list(entry?.keysSecondary)]
    .map(text).filter((term) => term.length >= 2))].sort((left, right) => right.length - left.length)
}
function excerpt(source, start, end, radius = 24) {
  const from = Math.max(0, start - radius)
  const to = Math.min(source.length, end + radius)
  return `${from ? '…' : ''}${source.slice(from, to)}${to < source.length ? '…' : ''}`
}
function occurrencesInBlock(entry, block, { limitEnd = block.text.length, distance = 0, label = '' } = {}) {
  const source = block.text.slice(0, Math.max(0, limitEnd))
  const found = []
  for (const term of entryTerms(entry)) {
    let cursor = 0
    while (cursor < source.length) {
      const start = source.indexOf(term, cursor)
      if (start < 0) break
      const end = start + term.length
      cursor = end
      if (found.some((item) => start < item.end && end > item.start)) continue
      found.push({ nodeId: block.nodeId, unitId: block.unitId, start, end, text: term,
        excerpt: excerpt(block.text, start, end), distance, positionLabel: label })
    }
  }
  return found.sort((left, right) => right.start - left.start)
}

export function buildAuthoringCaretContext(document, selection, { previousBlocks = 3 } = {}) {
  const selectedText = text(selection?.text)
  if (selectedText) return { selectedText, blocks: [], selection: {
    nodeId: text(selection?.nodeId), unitId: text(selection?.unitId), start: Number(selection?.selectionLocalStart) || 0,
    end: (Number(selection?.selectionLocalStart) || 0) + selectedText.length,
    text: selectedText, excerpt: selectedText, distance: -1, positionLabel: '当前选区', selected: true
  } }
  const blocks = flattenDocument(document)
  const currentIndex = blocks.findIndex((block) => block.nodeId === text(selection?.nodeId))
  if (currentIndex < 0) return { selectedText: '', blocks: [], selection: null }
  const current = blocks[currentIndex]
  const cursor = Math.max(0, Math.min(current.text.length, Number(selection?.cursorLocalOffset) || 0))
  const scoped = [{ ...current, sourceText: current.text, limitEnd: cursor, distance: 0, positionLabel: '当前段' }]
  for (let step = 1; step <= previousBlocks && currentIndex - step >= 0; step += 1) {
    scoped.push({ ...blocks[currentIndex - step], sourceText: blocks[currentIndex - step].text,
      distance: step, positionLabel: step === 1 ? '上一文本块' : `前 ${step} 个文本块` })
  }
  return { selectedText: '', blocks: scoped, selection: null }
}

// 兼容旧调用；语义收紧为只读取当前段光标之前。
export function extractAuthoringCaretWindow(selection, { before = 240 } = {}) {
  const node = text(selection?.currentNodeText)
  const offset = Math.max(0, Math.min(node.length, Number(selection?.cursorLocalOffset) || 0))
  return node ? node.slice(Math.max(0, offset - before), offset) : text(selection?.beforeText).slice(-before)
}

function entryRefs(value) {
  const refs = []
  const visit = (item) => {
    if (!item) return
    if (Array.isArray(item)) return item.forEach(visit)
    if (typeof item === 'string') {
      const match = item.match(/worldbook-entry:([^\s]+)/)
      if (match) refs.push(match[1])
      return
    }
    if (typeof item === 'object') {
      if (item.entryId) refs.push(String(item.entryId))
      Object.values(item).forEach(visit)
    }
  }
  visit(value)
  return refs
}
function sceneEntryIds(projection) {
  return new Set([projection?.viewpointCharacter?.id, projection?.activeActor?.id, projection?.dialogueTarget?.id,
    projection?.location?.id, ...list(projection?.presentCharacters).map((item) => item?.id),
    ...list(projection?.unresolvedEvents).map((item) => item?.id)].filter(Boolean).map(String))
}
function sceneNames(projection) {
  return [projection?.viewpointCharacter?.name, projection?.activeActor?.name, projection?.dialogueTarget?.name,
    projection?.location?.name, ...list(projection?.presentCharacters).map((item) => item?.name),
    ...list(projection?.unresolvedEvents).map((item) => item?.label)].map(text).filter(Boolean)
}
function chapterOccurrences(entry, document) {
  return flattenDocument(document).flatMap((block) => occurrencesInBlock(entry, block, { label: `文本块 ${block.index + 1}` }))
}
function contextualOccurrences(entry, caretContext) {
  if (caretContext?.selection) {
    const selected = caretContext.selection
    const match = entryTerms(entry).find((term) => selected.text.includes(term))
    if (!match) return []
    const relativeStart = selected.text.indexOf(match)
    return [{ ...selected, text: match, start: selected.start + relativeStart, end: selected.start + relativeStart + match.length }]
  }
  return list(caretContext?.blocks).flatMap((block) => occurrencesInBlock(entry,
    { ...block, text: block.sourceText || block.text },
    { limitEnd: block.limitEnd ?? block.text.length, distance: block.distance, label: block.positionLabel }))
    .sort((left, right) => left.distance - right.distance || right.start - left.start)
}
function itemFor(entry, reasons, currentOccurrences, document) {
  const allOccurrences = chapterOccurrences(entry, document)
  return { id: String(entry.id), name: text(entry.name) || '未命名设定', type: text(entry.type) || 'general',
    content: text(entry.content), entry, reasons, currentUse: currentOccurrences[0] || null,
    occurrences: allOccurrences.slice(0, MAX_VISIBLE_OCCURRENCES), occurrenceCount: allOccurrences.length }
}

export function buildAuthoringSettingContext({ worldbook, document = null, caretContext = null,
  sceneProjection = null, contextLedger = null, annotations = [], recentRefs = [], limit = 10 } = {}) {
  const writing = []
  const reminders = []
  const sceneIds = sceneEntryIds(sceneProjection)
  const names = sceneNames(sceneProjection)
  const actualRefs = new Set([...entryRefs(contextLedger), ...entryRefs(annotations), ...entryRefs(recentRefs)])
  for (const entry of list(worldbook?.entries)) {
    if (!entry?.id) continue
    const current = contextualOccurrences(entry, caretContext)
    if (current.length) {
      writing.push(itemFor(entry, [current[0].positionLabel || '当前选区'], current, document))
      continue
    }
    const id = String(entry.id)
    const corpus = entryTerms(entry)
    const inScene = sceneIds.has(id) || names.some((name) => corpus.includes(name))
    const constraint = CONSTRAINT_TYPES.has(entry.type)
    if (inScene || constraint || actualRefs.has(id)) {
      const reasons = [inScene ? '当前场' : '', constraint ? '写作约束' : '', actualRefs.has(id) ? '本章实际引用' : ''].filter(Boolean)
      reminders.push(itemFor(entry, reasons, [], document))
    }
  }
  writing.sort((left, right) => (left.currentUse?.distance ?? 99) - (right.currentUse?.distance ?? 99)
    || (right.currentUse?.start ?? 0) - (left.currentUse?.start ?? 0))
  const groups = []
  let remaining = Math.max(1, Number(limit) || 10)
  if (writing.length) {
    const items = writing.slice(0, Math.min(6, remaining)); remaining -= items.length
    groups.push({ key: 'writing', label: '正在写这里', items })
  }
  if (reminders.length && remaining > 0) groups.push({ key: 'reminders', label: '写作时别忘记', items: reminders.slice(0, remaining) })
  return { groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) }
}

export function buildAuthoringSettingDetail(entry, document, caretContext) {
  if (!entry?.id) return null
  const current = contextualOccurrences(entry, caretContext)
  return itemFor(entry, current.length ? [current[0].positionLabel] : ['从设定目录打开'], current, document)
}
