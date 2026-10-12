import { assertAssistantPermission, normalizeAssistantPermission } from '../../../../shared/assistantPermission.js'
import { requestAssistantPolicy } from './assistantPolicyClient.js'
import { withAssistantEditLock } from '../../storage/assistantEditLock.js'
import { persistAssistantEdits } from '../../storage/assistantEditJournal.js'
import { getItem, STORAGE_KEYS } from '../../../composables/useStorage.js'
import { readWorldbookSnapshot } from '../../../stores/worldStore.js'
import { buildAssistantWorkspaceItems } from './assistantWorkspaceContext.js'
import { createStoryAgentEngine } from './agentEngine.js'
import { getChapterMarkdown } from '../../writing/writingDocumentSchema.js'

export function createAuthoringStoryAgent({ projectId, getBook, getChapter, getWorldbook, getLiveText, getLiveDocument, getSelection, getNotes, getOutline, persistCurrent, readBooks, saveBooks, publishBooks, protectCurrent, protectChanges, observeAdoption, publishWorldbook, publishRepository } = {}) {
  let bridge
  let currentPermission = null
  let permissionEpoch = 0
  const loadBridge = async () => {
    if (!bridge) {
      const { createPiNarrativeAgentBridge } = await import('./piNarrativeAgentBridge.js')
      bridge = createPiNarrativeAgentBridge()
    }
    return bridge
  }
  const lazyBridge = Object.fromEntries(['run', 'resume', 'cancel', 'healthz', 'tasks'].map(name => [name, async (...args) => (await loadBridge())[name](...args)]))
  const context = (bookId) => {
    const book = getBook?.()
    if (String(book?.id || '') !== String(bookId || '')) throw new Error('作品已切换，请重新发送。')
    const chapter = getChapter?.()
    const linked = getWorldbook?.()
    const world = book.worldbookId && String(linked?.id || '') === String(book.worldbookId) ? linked : null
    const item = (entry, type) => ({ id: String(entry.id), title: entry.title || entry.name || '未命名', type, text: String(entry.text || entry.content || ''), summary: String(entry.content || entry.summary || entry.text || ''), aliases: Array.isArray(entry.keys) ? entry.keys : [], sourceRefs: [`${type}:${entry.id}`] })
    const manuscriptItems = [...(book.chapters || [])].sort((a, b) => Number(String(b.id) === String(chapter?.id)) - Number(String(a.id) === String(chapter?.id))).map(entry => item({ ...entry, text: String(entry.id) === String(chapter?.id) ? getLiveText?.() : getChapterMarkdown(entry) }, 'chapter'))
    const books = (readBooks?.() || []).filter(item => item?.id)
    const workspaceBooks = [book, ...books.filter(item => String(item.id) !== String(book.id))]
    return {
      manuscriptText: String(getLiveText?.() || ''),
      workspaceProjects: workspaceBooks.map(item => ({ id: String(item.id), title: item.title || '未命名作品' })),
      workspaceItems: buildAssistantWorkspaceItems(workspaceBooks, book.id, getChapterMarkdown, item => item.worldbookId ? readWorldbookSnapshot(item.worldbookId) : null),
      currentChapterId: String(chapter?.id || ''), selection: getSelection?.() || null,
      editBaseline: JSON.parse(JSON.stringify({ book: { ...book, chapters: (book.chapters || []).map(entry => String(entry.id) === String(chapter?.id) ? { ...entry, content: getLiveText?.() || '', editorDocument: getLiveDocument?.() || null } : entry) }, worldbook: world })),
      bookTitle: book.title || '', chapterTitle: chapter?.title || '', manuscriptTail: String(getLiveText?.() || '').slice(-2400),
      chapterEntries: manuscriptItems,
      manuscriptItems,
      worldEntries: (world?.entries || []).map(entry => item(entry, 'worldbook')),
      sourceEntries: (world?.sourceDocuments || []).map(entry => item({ ...entry, content: entry.content || entry.contentPreview || '', title: entry.title || entry.sourceLabel }, 'source')),
      notesItems: (getNotes?.() || []).map(entry => item(entry, 'notes')),
      outlineItems: (getOutline?.() || []).map(entry => item({ ...entry, text: entry.intent || entry.summary || entry.description || entry.title }, 'outline'))
    }
  }
  const engine = createStoryAgentEngine({ bridge: lazyBridge, projectId, resolveContext: context, formatInstructions: '讨论与检索正常回答。用户要求写作、改写、增补人物设定或大纲时，查清目标后调用 submit_edit_proposals 提交修改，最终回答简述修改与依据。禁止把操作说明当正文；修改需作者确认。' })
  return Object.freeze({
    ...engine,
    async authorize(permission, sessionId, prepared, signal) {
      const epoch = ++permissionEpoch
      await loadBridge()
      if (epoch !== permissionEpoch) throw new Error('助手权限已更新。')
      const destination = this.destination()
      if (destination.bookId !== prepared.bookId) throw new Error('作品已切换，授权未建立。')
      const input = normalizeAssistantPermission(permission, { ...destination, chapterId: prepared.currentChapterId || destination.chapterId, sessionId })
      const policy = await requestAssistantPolicy('', { ...input, chapterId: prepared.currentChapterId || destination.chapterId }, { signal })
      if (epoch !== permissionEpoch) throw new Error('助手权限已更新。')
      if (destination.bookId !== this.destination().bookId) throw new Error('作品已切换，授权未建立。')
      currentPermission = policy
      prepared.permission = policy
      prepared.kernel.serialization.blocks.push({ kind: 'assistant-policy', title: '权限引用', text: JSON.stringify(policy) })
      return policy
    },
    revokePermission() {
      permissionEpoch++
      const previous = currentPermission; currentPermission = null
      if (previous) void requestAssistantPolicy('revoke', previous).catch(() => {})
    },
    canUndoProposal(proposal) {
      const last = [...(proposal?.receipt?.changes || [])].reverse().find(change => change.kind === 'chapter' && change.targetId === String(getChapter?.()?.id) && change.field === 'content')
      return Boolean(last && String(getLiveText?.() || '') === last.applied)
    },
    destination: () => ({ bookId: String(getBook?.()?.id || ''), chapterId: String(getChapter?.()?.id || '') }),
    async enrichPrepared(prepared, { text, signal }) {
      const documents = prepared.editBaseline?.worldbook?.sourceDocuments || []
      if (!documents.some(document => document.chunkIds?.length)) return prepared
      const { retrieveAssistantSourceChunks } = await import('./assistantSourceRetrieval.js')
      const sources = await retrieveAssistantSourceChunks(documents, text, { signal })
      prepared.index.byDomain.world = [...prepared.index.byDomain.world.filter(item => item.type !== 'source').slice(0, 96), ...sources]
      return prepared
    },
    async prepareProposal(input, prepared, runId) {
      const { prepareAssistantProposal } = await import('./assistantEditTransaction.js')
      if (!prepared.editBaseline) throw new Error('本轮缺少编辑基线。')
      assertAssistantPermission(prepared.permission, input.changes, prepared.bookId)
      return { ...prepareAssistantProposal(input, { ...prepared.editBaseline, runId }), permission: prepared.permission }
    },
    applyProposal(proposal, options = {}) { return withAssistantEditLock(() => this.commitProposal(proposal, options)) },
    async commitProposal(proposal, { undo = false, discard = false, changeIds = null } = {}) {
      const { applyAssistantProposal, selectAssistantProposalChanges } = await import('./assistantEditTransaction.js')
      const savedReceipt = getItem(`assistant_edit_receipt:${proposal.id}`, null)
      if (savedReceipt && JSON.stringify(savedReceipt.changes) !== JSON.stringify(proposal.changes)) return { ok: false, error: '这组修改已在其他窗口处理，请刷新后继续。' }
      if (discard) {
        const result = applyAssistantProposal(proposal, { book: getBook(), worldbook: getWorldbook(), discard: true, changeIds })
        const next = { ...proposal, changes: result.proposalChanges, status: result.status }
        persistAssistantEdits([{ key: `assistant_edit_receipt:${proposal.id}`, after: next }], proposal.id)
        Object.assign(proposal, next)
        return { ok: true, status: next.status }
      }
      const persisted = (getItem(STORAGE_KEYS.WRITING_BOOKS, []) || []).find(item => String(item.id) === proposal.bookId)
      if (persisted && JSON.stringify(persisted.chapters) !== JSON.stringify(getBook()?.chapters)) return { ok: false, error: '正文已在其他窗口修改，请刷新后继续。' }
      if (!persistCurrent?.()) return { ok: false, error: '当前编辑尚未保存，请先处理正文草稿。' }
      const book = getBook?.()
      if (String(book?.id) !== proposal.bookId) return { ok: false, error: '作品已切换，请返回原作品。' }
      if ((!undo && !['pending', 'partial'].includes(proposal.status)) || (undo && !proposal.receipt?.changes?.length)) return { ok: false, error: '建议状态已变化。' }
      if (!undo && !discard) {
        if (!currentPermission || currentPermission.sessionId !== proposal.permission?.sessionId) return { ok: false, error: '请在原会话重新授权后采用修改。' }
        const policy = await requestAssistantPolicy('check', currentPermission)
        if (String(getBook?.()?.id) !== proposal.bookId || currentPermission?.revision !== policy.revision) return { ok: false, error: '授权或作品已变化，修改未应用。' }
        const selected = selectAssistantProposalChanges(proposal, changeIds)
        assertAssistantPermission(policy, selected, proposal.bookId)
      }
      // Re-read after the policy request; author edits may have occurred while awaiting it.
      if (!persistCurrent?.()) return { ok: false, error: '当前稿件尚未保存。' }
      const result = applyAssistantProposal(proposal, { book: getBook(), worldbook: getWorldbook(), undo, discard, changeIds })
      const nextBooks = (getItem(STORAGE_KEYS.WRITING_BOOKS, null) || readBooks()).map(item => String(item.id) === proposal.bookId ? result.book : item)
      const usesWorldbook = (undo ? proposal.receipt.changes : result.changes).some(change => change.kind === 'worldbook')
      const receipt = { proposalId: proposal.id, changes: undo ? [] : [...(proposal.receipt?.changes || []), ...result.changes], createdWorldbook: result.createdWorldbook || proposal.receipt?.createdWorldbook, worldbookId: result.book.worldbookId, adoptedAt: Date.now() }
      const nextProposal = { ...proposal, changes: result.proposalChanges, status: result.status, receipt }
      const writes = [{ key: STORAGE_KEYS.WRITING_BOOKS, after: nextBooks }]
      if (usesWorldbook) {
        const id = result.worldbook?.id || proposal.receipt?.worldbookId || proposal.worldbookId
        writes.push({ key: `worldbook_${id}`, after: result.worldbook })
        const index = (getItem('worldbooks_index', []) || []).filter(item => String(item.id) !== String(id))
        if (result.worldbook) index.push({ id, name: result.worldbook.name, entryCount: result.worldbook.entries.length, updatedAt: result.worldbook.updatedAt })
        writes.push({ key: 'worldbooks_index', after: index })
      }
      writes.push({ key: `assistant_edit_receipt:${proposal.id}`, after: nextProposal })
      if (!undo && protectChanges?.(result.protectionSnapshots, proposal.id) === false) return { ok: false, error: '修改前的版本未能保存，建议已保留。' }
      persistAssistantEdits(writes, proposal.id)
      Object.assign(proposal, nextProposal)
      publishRepository?.(nextBooks)
      publishBooks(nextBooks, this.destination().chapterId || result.changes.find(change => change.kind === 'chapter' && change.created)?.targetId || '')
      if (usesWorldbook) publishWorldbook?.(result.worldbook)
      return { ok: true, receipt, status: proposal.status }
    },
    async adopt(message) {
      const destination = this.destination()
      if (message?.projectId !== destination.bookId || message?.chapterId !== destination.chapterId || !destination.chapterId) return { ok: false, error: '请回到生成时的章节后采纳。' }
      if (message.status !== 'completed' || !message.text?.trim()) return { ok: false, error: '只有完整完成的回答可以采纳。' }
      if (!persistCurrent?.()) return { ok: false, error: '当前文稿未能保存，尚未采纳。' }
      const { adoptStoryAgentTextToChapter } = await import('./adoptToChapter.js')
      // Import may yield; recheck scope before reading or writing manuscript state.
      const now = this.destination()
      if (now.bookId !== destination.bookId || now.chapterId !== destination.chapterId) return { ok: false, error: '章节已切换，尚未采纳。' }
      if (!persistCurrent?.()) return { ok: false, error: '当前文稿未能保存，尚未采纳。' }
      const protection = protectCurrent?.(message.id)
      if (protection?.ok === false) return { ok: false, error: '采纳前的版本未能保存，尚未采纳。' }
      const result = adoptStoryAgentTextToChapter({ books: readBooks(), ...destination, text: message.text, sourceId: message.id })
      if (!result.ok) return { ...result, error: result.reason === 'already-imported' ? '这段文字已采纳。' : '当前章节无法接收这段文字。' }
      const receipt = saveBooks(result.books)
      if (!receipt?.ok) return { ok: false, error: '文稿保存失败，尚未采纳；回答仍在对话中。' }
      publishBooks(result.books, destination.chapterId)
      let warning = ''
      if (observeAdoption) {
        try { await observeAdoption({ text: message.text, unitId: result.unitId, bookId: destination.bookId, chapterId: destination.chapterId }) }
        catch { warning = '正文已保存，现场状态将在稍后刷新。' }
      }
      return { ok: true, unitId: result.unitId, ...(warning ? { warning } : {}) }
    }
  })
}
