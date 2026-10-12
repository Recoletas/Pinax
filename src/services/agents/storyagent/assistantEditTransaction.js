import { parseCharacterEntryProfile } from '../../characterCard.js'
import { mergeWritingDocumentFromMarkdown, getChapterMarkdown, getWritingBlockAtPosition, getWritingDocumentNodes, createWritingDocument } from '../../writing/writingDocumentSchema.js'
import { validateAssistantChanges } from '../../../../shared/assistantEditProposal.js'

const clone = value => JSON.parse(JSON.stringify(value))
const valueOf = (target, change) => change.kind === 'chapter' && change.field === 'content' ? getChapterMarkdown(target) : String(target?.[change.field] || '')
function listOf(book, worldbook, kind) { return kind === 'chapter' ? book.chapters : kind === 'outline' ? (book.outlineNodes ||= []) : worldbook?.entries || [] }
export function prepareAssistantProposal(input, { book, worldbook, runId }) {
  const changes = validateAssistantChanges(input)
  const ranges = new Map()
  const prepared = changes.map((change, index) => {
    const key = `${change.kind}:${change.targetId}:${change.field}`
    if (change.kind === 'worldbook' && !worldbook && book.worldbookId) throw new Error('绑定的资料库尚未读取。')
    const list = listOf(book, worldbook, change.kind)
    if (!Array.isArray(list)) throw new Error('目标资料库尚未关联。')
    const target = list.find(item => String(item.id) === change.targetId)
    const identity = { changeId: `change-${index + 1}`, status: 'pending', groupId: change.groupId || `change-${index + 1}` }
    if (change.operation === 'create') {
      if (target || preparedTargetExists(changes, change, index)) throw new Error('新建条目 ID 已存在或重复。')
      return { ...change, ...identity, label: change.title, baseline: null }
    }
    if (!target) throw new Error('修改目标已不存在。')
    const baseline = valueOf(target, change)
    const sourceStart = baseline.indexOf(change.before)
    const from = change.operation === 'append' ? baseline.length : change.operation === 'insert' ? sourceStart + change.before.length : sourceStart
    if (change.operation !== 'append' && (sourceStart < 0 || sourceStart !== baseline.lastIndexOf(change.before))) throw new Error('修改原文不存在或有多处相同文字，请重新定位。')
    const to = ['append', 'insert'].includes(change.operation) ? from : from + change.before.length
    const previous = ranges.get(key) || []
    if (previous.some(range => from < range.to && to > range.from || from === range.from)) throw new Error('同一字段的修改重叠，请合并后提交。')
    previous.push({ from, to }); ranges.set(key, previous)
    // Surrounding text protects location while permitting unrelated edits elsewhere.
    const sourceNode = change.kind === 'chapter' && target.editorDocument ? getWritingBlockAtPosition(target.editorDocument, from) : null
    const anchor = { from, to, nodeId: sourceNode?.nodeId || '', unitId: sourceNode?.unitId || '', prefix: baseline.slice(Math.max(0, from - 48), from), suffix: baseline.slice(to, to + 48) }
    return { ...change, ...identity, label: target.name || target.title || change.targetId, baseline, anchor }
  })
  for (const change of prepared) if ((change.dependsOn || []).some(id => !prepared.some(item => item.changeId === id) || id === change.changeId)) throw new Error('修改依赖不存在。')
  return { schemaVersion: 2, id: `${runId}:edit`, runId, bookId: String(book.id), worldbookId: String(book.worldbookId || ''), status: 'pending', changes: prepared }
}
function preparedTargetExists(changes, change, index) { return changes.slice(0, index).some(item => item.kind === change.kind && item.targetId === change.targetId && item.operation === 'create') }
export function selectAssistantProposalChanges(proposal, changeIds, discard = false) {
  const pending = proposal.changes.filter(change => !change.status || change.status === 'pending')
  const selected = changeIds ? pending.filter(change => changeIds.includes(change.changeId)) : pending
  if (!selected.length) throw new Error('修改已处理或不存在。')
  const groups = new Set(selected.map(change => change.groupId))
  const expanded = pending.filter(change => groups.has(change.groupId))
  for (const change of expanded) if (!discard && ((change.dependsOn || []).some(id => !expanded.some(item => item.changeId === id) && !proposal.changes.some(item => item.changeId === id && item.status === 'adopted')))) throw new Error('请先采用关联修改，或一起采用。')
  return expanded
}
function applyTextChange(before, change) {
  if (!change.anchor) {
    if (before !== change.baseline) throw new Error('目标内容已修改，建议已保留，请重新定位。')
    return change.operation === 'append' ? `${before}${before ? '\n\n' : ''}${change.after}` : before.replace(change.before, () => change.after)
  }
  if (change.operation === 'append') {
    const tail = change.anchor.prefix
    if (before !== change.baseline && (!tail || !before.endsWith(tail))) throw new Error('原落笔位置已变化，请重新定位。')
    return `${before}${before ? '\n\n' : ''}${change.after}`
  }
  const needle = change.anchor.prefix + (change.operation === 'insert' ? '' : change.before) + change.anchor.suffix
  const index = before.indexOf(needle)
  if (index < 0 || index !== before.lastIndexOf(needle)) throw new Error('修改段落已变化或无法唯一定位，建议已保留。')
  const start = index + change.anchor.prefix.length
  return before.slice(0, start) + change.after + before.slice(start + (change.operation === 'insert' ? 0 : change.before.length))
}

export function applyAssistantProposal(proposal, { book, worldbook, undo = false, discard = false, changeIds = null }) {
  if (String(book?.id) !== proposal.bookId || String(book?.worldbookId || '') !== (proposal.receipt?.worldbookId ?? proposal.worldbookId)) throw new Error('作品或关联资料库已变化。')
  const nextBook = clone(book); let nextWorldbook = worldbook ? clone(worldbook) : null
  const selected = undo ? [] : selectAssistantProposalChanges(proposal, changeIds, discard)
  const createdWorldbook = !undo && !discard && !nextWorldbook && !book.worldbookId && selected.some(change => change.kind === 'worldbook' && change.operation === 'create')
  if (createdWorldbook) {
    nextWorldbook = { id: `assistant-world-${book.id}`, name: book.title || '作品资料库', entries: [], sourceDocuments: [], groups: [], createdAt: Date.now(), updatedAt: Date.now() }
    nextBook.worldbookId = nextWorldbook.id
  }
  const receipts = []
  const changes = undo ? [...proposal.receipt.changes].reverse() : discard ? [] : selected
  const placements = new Map()
  if (!undo && !discard) for (const change of changes.filter(item => item.operation !== 'create')) {
    const target = listOf(book, worldbook, change.kind)?.find(item => String(item.id) === change.targetId)
    const original = valueOf(target, change)
    if (change.anchor?.nodeId && target?.editorDocument && !getWritingDocumentNodes(target.editorDocument).some(item => item.node.attrs.nodeId === change.anchor.nodeId)) throw new Error('原段落已删除，请重新定位。')
    applyTextChange(original, change) // Validate every anchor against the same original field before changing it.
    const needle = change.anchor ? change.anchor.prefix + (change.operation === 'insert' ? '' : change.before) + change.anchor.suffix : change.before
    placements.set(change.changeId, change.operation === 'append' ? original.length : original.indexOf(needle) + (change.anchor?.prefix?.length || 0))
  }
  for (const change of changes) {
    const list = listOf(nextBook, nextWorldbook, change.kind)
    if (!Array.isArray(list)) throw new Error('目标资料库尚未关联。')
    const target = list.find(item => String(item.id) === change.targetId)
    if (undo && change.created) {
      if (!target || JSON.stringify(target) !== change.afterEntity) throw new Error('新建内容已被修改，无法直接撤销。')
      list.splice(list.indexOf(target), 1); continue
    }
    if (!undo && change.operation === 'create') {
      if (target) throw new Error('新建条目已存在。')
      const created = { id: change.targetId, ...(change.kind === 'worldbook' ? { type: change.entryType, name: change.title, content: '' } : { title: change.title, content: '' }) }
      assign(created, change, change.after)
      list.push(created); receipts.push({ ...change, created: true, afterEntity: JSON.stringify(created) }); continue
    }
    if (!target) throw new Error('修改目标已不存在。')
    const before = valueOf(target, change)
    const beforeEditorDocument = change.kind === 'chapter' && change.field === 'content' ? clone(target.editorDocument || null) : undefined
    if (undo && before !== change.applied) throw new Error('目标内容已修改，无法直接撤销，请手动调整。')
    let after = change.baseline
    if (!undo) {
      let position = placements.get(change.changeId)
      for (const applied of receipts.filter(item => item.kind === change.kind && item.targetId === change.targetId && item.field === change.field && placements.get(item.changeId) < position)) {
        position += applied.after.length - (applied.operation === 'insert' ? 0 : applied.before.length)
      }
      after = change.operation === 'append' ? `${before}${before ? '\n\n' : ''}${change.after}` : before.slice(0, position) + change.after + before.slice(position + (change.operation === 'insert' ? 0 : change.before.length))
    }
    const characterContent = change.kind === 'worldbook' && target.type === 'character' && change.field === 'content'
    const hadCharacterProfile = Object.hasOwn(target.metadata || {}, 'characterProfile')
    const beforeCharacterProfile = hadCharacterProfile ? clone(target.metadata.characterProfile) : null
    if (undo && characterContent && change.appliedCharacterProfile && JSON.stringify(target.metadata?.characterProfile) !== change.appliedCharacterProfile) throw new Error('人物资料已被修改，无法直接撤销。')
    assign(target, change, after)
    if (undo && Object.hasOwn(change, 'beforeEditorDocument')) {
      if (change.beforeEditorDocument) target.editorDocument = { ...clone(change.beforeEditorDocument), revision: Number(target.editorDocument?.revision || 0) + 1 }
      else delete target.editorDocument
    }
    if (characterContent) {
      target.metadata ||= {}
      const input = { ...target, metadata: { ...target.metadata } }; delete input.metadata.characterProfile
      const parsed = parseCharacterEntryProfile(input)
      const labels = { background: '背景', personality: '性格', appearance: '外貌', identity: '身份', gender: '性别', age: '年龄', goal: '目标', relation: '关系', openingState: '开场状态', other: '其他' }
      target.metadata.characterProfile = { ...(target.metadata.characterProfile || {}), ...Object.fromEntries(Object.entries(parsed).filter(([key, value]) => value || (labels[key] && target.content.includes(`${labels[key]}：`)))) }
      if (undo) {
        if (change.hadCharacterProfile) target.metadata.characterProfile = clone(change.beforeCharacterProfile)
        else delete target.metadata.characterProfile
      }
    }
    receipts.push({ ...change, ...(beforeEditorDocument !== undefined ? { beforeEditorDocument } : {}), baseline: before, applied: valueOf(target, change), ...(characterContent ? { hadCharacterProfile, beforeCharacterProfile, appliedCharacterProfile: JSON.stringify(target.metadata.characterProfile) } : {}) })
  }
  if (undo && proposal.receipt.createdWorldbook && !nextWorldbook.entries.length && !(nextWorldbook.sourceDocuments || []).length) { nextBook.worldbookId = ''; nextWorldbook = null }
  if (nextWorldbook) nextWorldbook.entriesMap = Object.fromEntries(nextWorldbook.entries.map(entry => [entry.id, entry]))
  nextBook.updatedAt = new Date().toISOString()
  if (nextWorldbook && changes.some(change => change.kind === 'worldbook')) nextWorldbook.updatedAt = Date.now()
  const handled = new Set((undo ? proposal.receipt.changes : selected).map(change => change.changeId))
  const proposalChanges = proposal.changes.map(change => handled.has(change.changeId) ? { ...change, status: undo ? 'undone' : discard ? 'discarded' : 'adopted' } : { ...change })
  // Partial adoption advances anchors using the recorded positions, never by guessing a repeated fragment.
  if (!undo && !discard) for (const remaining of proposalChanges.filter(change => change.status === 'pending' && change.anchor)) {
    const originalTarget = listOf(book, worldbook, remaining.kind)?.find(item => String(item.id) === remaining.targetId)
    const originalText = valueOf(originalTarget, remaining)
    const originalNeedle = remaining.anchor.prefix + (remaining.operation === 'insert' ? '' : remaining.before) + remaining.anchor.suffix
    const originalIndex = originalText.indexOf(originalNeedle)
    if (remaining.operation !== 'append' && (originalIndex < 0 || originalIndex !== originalText.lastIndexOf(originalNeedle))) continue
    let position = remaining.operation === 'append' ? originalText.length : originalIndex + remaining.anchor.prefix.length
    for (const applied of selected.filter(change => change.kind === remaining.kind && change.targetId === remaining.targetId && change.field === remaining.field && placements.get(change.changeId) + (change.operation === 'insert' ? 0 : change.before.length) <= (remaining.operation === 'append' ? originalText.length : originalIndex + remaining.anchor.prefix.length))) {
      position += applied.operation === 'append' ? applied.after.length + 2 : applied.after.length - (applied.operation === 'insert' ? 0 : applied.before.length)
    }
    const target = listOf(nextBook, nextWorldbook, remaining.kind)?.find(item => String(item.id) === remaining.targetId)
    const baseline = valueOf(target, remaining)
    if (remaining.operation === 'append') position = baseline.length
    if (!['append', 'insert'].includes(remaining.operation) && baseline.slice(position, position + remaining.before.length) !== remaining.before) continue
    remaining.baseline = baseline
    const to = position + (remaining.operation === 'insert' ? 0 : remaining.before.length)
    remaining.anchor = { ...remaining.anchor, from: position, to, prefix: baseline.slice(Math.max(0, position - 48), position), suffix: baseline.slice(to, to + 48) }
  }
  const status = proposalChanges.some(change => change.status === 'pending') ? (undo ? 'pending' : 'partial') : undo ? 'undone' : proposalChanges.some(change => change.status === 'adopted') ? 'adopted' : 'discarded'
  const protectionSnapshots = undo || discard ? [] : [...new Set(selected.filter(change => change.kind === 'chapter' && change.operation !== 'create').map(change => change.targetId))].map(id => { const chapter = book.chapters.find(item => String(item.id) === id); return { chapterId: id, chapterTitle: chapter.title || '', document: clone(chapter.editorDocument || createWritingDocument(getChapterMarkdown(chapter))), markdown: getChapterMarkdown(chapter), annotations: clone(chapter.annotations || []) } })
  return { book: nextBook, worldbook: nextWorldbook, changes: receipts, createdWorldbook, proposalChanges, status, protectionSnapshots }
}
function assign(target, change, value) {
  target[change.field] = value
  if (change.kind === 'chapter' && change.field === 'content') {
    const previous = target.editorDocument
    target.editorDocument = mergeWritingDocumentFromMarkdown(value, previous)
    target.editorDocument.revision = Number(previous?.revision || 0) + 1
    target.wordCount = value.length
  }
}
