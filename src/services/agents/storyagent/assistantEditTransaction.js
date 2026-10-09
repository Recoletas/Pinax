import { parseCharacterEntryProfile } from '../../characterCard.js'
import { mergeWritingDocumentFromMarkdown, getChapterMarkdown } from '../../writing/writingDocumentSchema.js'
import { validateAssistantChanges } from '../../../../shared/assistantEditProposal.js'

const clone = value => JSON.parse(JSON.stringify(value))
const valueOf = (target, change) => change.kind === 'chapter' && change.field === 'content' ? getChapterMarkdown(target) : String(target?.[change.field] || '')
function listOf(book, worldbook, kind) { return kind === 'chapter' ? book.chapters : kind === 'outline' ? (book.outlineNodes ||= []) : worldbook?.entries || [] }
export function prepareAssistantProposal(input, { book, worldbook, runId }) {
  const changes = validateAssistantChanges(input)
  const seen = new Set()
  return { id: `${runId}:edit`, bookId: String(book.id), worldbookId: String(book.worldbookId || ''), status: 'pending', changes: changes.map(change => {
    const key = `${change.kind}:${change.targetId}:${change.field}`
    if (seen.has(key)) throw new Error('同一字段的修改需要合并后再提交。')
    seen.add(key)
    if (change.kind === 'worldbook' && !worldbook && book.worldbookId) throw new Error('绑定的资料库尚未读取。')
    const list = listOf(book, worldbook, change.kind)
    if (!Array.isArray(list)) throw new Error('目标资料库尚未关联。')
    const target = list.find(item => String(item.id) === change.targetId)
    if (change.operation === 'create') {
      if (target) throw new Error('新建条目 ID 已存在。')
      return { ...change, label: change.title, baseline: null }
    }
    if (!target) throw new Error('修改目标已不存在。')
    const baseline = valueOf(target, change)
    if (change.operation === 'replace' && (baseline.indexOf(change.before) < 0 || baseline.indexOf(change.before) !== baseline.lastIndexOf(change.before))) throw new Error('修改原文不存在或有多处相同文字，请重新定位。')
    return { ...change, label: target.name || target.title || change.targetId, baseline }
  }) }
}

export function applyAssistantProposal(proposal, { book, worldbook, undo = false }) {
  if (String(book?.id) !== proposal.bookId || String(book?.worldbookId || '') !== (undo ? proposal.receipt.worldbookId ?? proposal.worldbookId : proposal.worldbookId)) throw new Error('作品或关联资料库已变化。')
  const nextBook = clone(book); let nextWorldbook = worldbook ? clone(worldbook) : null
  const createdWorldbook = !undo && !nextWorldbook && !book.worldbookId && proposal.changes.some(change => change.kind === 'worldbook' && change.operation === 'create')
  if (createdWorldbook) {
    nextWorldbook = { id: `assistant-world-${book.id}`, name: book.title || '作品资料库', entries: [], sourceDocuments: [], groups: [], createdAt: Date.now(), updatedAt: Date.now() }
    nextBook.worldbookId = nextWorldbook.id
  }
  const receipts = []
  const changes = undo ? [...proposal.receipt.changes].reverse() : proposal.changes
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
    if (before !== (undo ? change.applied : change.baseline)) throw new Error('目标内容已修改，建议已保留，请重新生成或手动调整。')
    const after = undo ? change.baseline : change.operation === 'append' ? `${before}${before ? '\n\n' : ''}${change.after}` : before.replace(change.before, () => change.after)
    const characterContent = change.kind === 'worldbook' && target.type === 'character' && change.field === 'content'
    const hadCharacterProfile = Object.hasOwn(target.metadata || {}, 'characterProfile')
    const beforeCharacterProfile = hadCharacterProfile ? clone(target.metadata.characterProfile) : null
    if (undo && characterContent && change.appliedCharacterProfile && JSON.stringify(target.metadata?.characterProfile) !== change.appliedCharacterProfile) throw new Error('人物资料已被修改，无法直接撤销。')
    assign(target, change, after)
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
    receipts.push({ ...change, applied: valueOf(target, change), ...(characterContent ? { hadCharacterProfile, beforeCharacterProfile, appliedCharacterProfile: JSON.stringify(target.metadata.characterProfile) } : {}) })
  }
  if (undo && proposal.receipt.createdWorldbook && !nextWorldbook.entries.length && !(nextWorldbook.sourceDocuments || []).length) { nextBook.worldbookId = ''; nextWorldbook = null }
  if (nextWorldbook) nextWorldbook.entriesMap = Object.fromEntries(nextWorldbook.entries.map(entry => [entry.id, entry]))
  nextBook.updatedAt = new Date().toISOString()
  if (nextWorldbook && changes.some(change => change.kind === 'worldbook')) nextWorldbook.updatedAt = Date.now()
  return { book: nextBook, worldbook: nextWorldbook, changes: receipts, createdWorldbook }
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
