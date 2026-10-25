import { entryDetailsText } from '../../../../shared/assistantEntryDetails.js'
import { worldbookFoundation } from '../../worldbook/worldbookFoundation.js'
import { matchWorldbookEntries } from '../../worldbook/worldbookContextBuilder.js'
import { assistantProjectState } from '../authoring/assistantSuggestions.js'
import { compileLexiconPrompt } from '../../../../shared/lexiconFileContract.js'
import { readLocalRuleFilesForBook, readLocalLexiconForBook } from '../../localMirrorSettings.js'
import { assertAssistantPermission, normalizeAssistantPermission } from '../../../../shared/assistantPermission.js'
import { requestAssistantPolicy } from './assistantPolicyClient.js'
import { withAssistantEditLock } from '../../storage/assistantEditLock.js'
import { persistAssistantEdits } from '../../storage/assistantEditJournal.js'
import { getItem, STORAGE_KEYS } from '../../../composables/useStorage.js'
import { buildAssistantWorkspaceItems } from './assistantWorkspaceContext.js'
import { createStoryAgentEngine } from './agentEngine.js'
import { getChapterMarkdown } from '../../writing/writingDocumentSchema.js'

export function createAuthoringStoryAgent({ projectId, getBook, getChapter, getWorldbook, readWorldbookSnapshot, getLiveText, getLiveDocument, getSelection, getNotes, getOutline, persistCurrent, readBooks, saveBooks, publishBooks, protectCurrent, protectChanges, observeAdoption, publishWorldbook, publishRepository, generateNarrative } = {}) {
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
  const lazyBridge = Object.fromEntries(['run', 'resume', 'cancel', 'compact', 'waitForTaskIdle', 'healthz', 'tasks'].map(name => [name, async (...args) => (await loadBridge())[name](...args)]))
  const context = (bookId, { text = '' } = {}) => {
    const book = getBook?.()
    if (String(book?.id || '') !== String(bookId || '')) throw new Error('作品已切换，请重新发送。')
    const chapter = getChapter?.()
    const linked = getWorldbook?.()
    const world = book.worldbookId && String(linked?.id || '') === String(book.worldbookId) ? linked : null
    const item = (entry, type) => ({ id: String(entry.id), title: entry.title || entry.name || '未命名', type, text: String(entry.text ?? entry.content ?? ''), summary: String(type === 'chapter' ? entry.text ?? entry.content ?? '' : entry.summary || entry.content || entry.text || ''), aliases: [...new Set([...(Array.isArray(entry.keys) ? entry.keys : []), ...(Array.isArray(entry.aliases) ? entry.aliases : [])])], sourceRefs: [`${type}:${entry.id}`] })
    const manuscriptItems = [...(book.chapters || [])].sort((a, b) => Number(String(b.id) === String(chapter?.id)) - Number(String(a.id) === String(chapter?.id))).map(entry => item({ ...entry, text: String(entry.id) === String(chapter?.id) ? getLiveText?.() : getChapterMarkdown(entry) }, 'chapter'))
    const books = (readBooks?.() || []).filter(item => item?.id)
    const workspaceBooks = [book, ...books.filter(item => String(item.id) !== String(book.id))]
    return {
      projectState: assistantProjectState({ book, worldbook: world, manuscriptText: getLiveText?.() }),
      worldFoundation: world ? worldbookFoundation(world).content : '',
      worldConstraints: matchWorldbookEntries({ worldbook: world, chatHistory: [{ role: 'user', content: `${getLiveText?.() || ''}\n${text}` }], includeStarterEntries: false })
        .filter(entry => ['rule', 'style', 'forbidden'].includes(String(entry.type || '').toLowerCase()))
        .map(entry => ({ id: entry.id, title: entry.name || entry.title, text: entry.content || '' })),
      manuscriptText: String(getLiveText?.() || ''),
      workspaceProjects: workspaceBooks.map(item => ({ id: String(item.id), title: item.title || '未命名作品' })),
      workspaceItems: buildAssistantWorkspaceItems(workspaceBooks, book.id, getChapterMarkdown, item => item.worldbookId ? (String(item.worldbookId) === String(world?.id) ? world : readWorldbookSnapshot?.(item.worldbookId)) : null),
      currentChapterId: String(chapter?.id || ''), selection: getSelection?.() || null,
      editBaseline: JSON.parse(JSON.stringify({ book: { ...book, chapters: (book.chapters || []).map(entry => String(entry.id) === String(chapter?.id) ? { ...entry, content: getLiveText?.() || '', editorDocument: getLiveDocument?.() || null } : entry) }, worldbook: world })),
      bookTitle: book.title || '', chapterTitle: chapter?.title || '', manuscriptTail: String(getLiveText?.() || '').slice(-2400),
      chapterEntries: manuscriptItems,
      manuscriptItems,
      worldEntries: (world?.entries || []).map(entry => ({ ...item({ ...entry, text: [entry.content, entryDetailsText(entry)].filter(Boolean).join('\n\n') }, 'worldbook'), entryType: String(entry.type || '') })),
      sourceEntries: (world?.sourceDocuments || []).map(entry => item({ ...entry, content: entry.content || entry.contentPreview || '', title: entry.title || entry.sourceLabel }, 'source')),
      notesItems: (getNotes?.() || []).map(entry => item(entry, 'notes')),
      outlineItems: (getOutline?.() || []).map(entry => item({ ...entry, text: entry.intent || entry.summary || entry.description || entry.title }, 'outline'))
    }
  }
  const engine = createStoryAgentEngine({ bridge: lazyBridge, projectId, resolveContext: context, formatInstructions: typeof generateNarrative === 'function' ? '讨论与检索正常回答。当前章节的正文续写、改写和增补必须调用 generate_narrative_draft，提供作者要求，由推演链生成；设定、大纲及标题修改调用 submit_edit_proposals。不要在聊天里自行撰写正文充当修改结果；修改按本轮审阅或自动修改权限交付。' : '讨论与检索正常回答。用户要求写作、改写、增补人物设定或大纲时，查清目标后调用 submit_edit_proposals 提交修改，最终回答简述修改与依据。禁止把操作说明当正文；修改按本轮审阅或自动修改权限交付。' })
  return Object.freeze({
    ...engine,
    projectState() { return assistantProjectState({ book: getBook?.(), worldbook: getWorldbook?.(), manuscriptText: getLiveText?.() }) },
    permissionContext() {
      const destination = this.destination()
      if (!destination.bookId) throw new Error('请先打开作品。')
      return { bookId: destination.bookId, currentChapterId: destination.chapterId, kernel: { serialization: { blocks: [] } } }
    },
    chapterOptions() {
      return (getBook?.()?.chapters || []).map(chapter => ({ id: String(chapter.id), title: chapter.title || '未命名章节' }))
    },
    prepare(input) {
      const prepared = engine.prepare(input)
      if (typeof generateNarrative === 'function' && prepared.currentChapterId) prepared.kernel.serialization.blocks.push({ kind: 'assistant-narrative', title: '推演写作能力', text: '正文续写、改写及增补使用 generate_narrative_draft；由当前作品的冻结上下文与正文执行链生成，按任务需要规划，不直接提交自行撰写的正文。' })
      return prepared
    },
    async prepareNarrativeProposal(request, prepared, runId, signal) {
      if (typeof generateNarrative !== 'function' || !prepared.editBaseline || request?.targetId !== prepared.currentChapterId) throw new Error('本轮没有可执行的推演写作目标。')
      const changes = [{ kind: 'chapter', targetId: request.targetId, operation: request.operation, field: 'content', before: request.before, after: '', reason: request.instruction }]
      assertAssistantPermission(prepared.permission, changes, prepared.bookId)
      const generated = await generateNarrative({ request, prepared, signal })
      if (signal?.aborted) throw signal.reason || new DOMException('请求已停止', 'AbortError')
      if (this.destination().bookId !== prepared.bookId || this.destination().chapterId !== prepared.currentChapterId || currentPermission?.policyId !== prepared.permission.policyId || currentPermission?.revision !== prepared.permission.revision) throw new Error('作品或权限已变化，生成结果不能采用。')
      assertAssistantPermission(currentPermission, changes, prepared.bookId)
      const text = String(generated?.text || '').trim()
      if (!text || generated.adoptable === false) throw Object.assign(new Error('推演未返回可采用的正文。'), { generatedText: text })
      changes[0].after = text
      const proposal = await this.prepareProposal({ changes }, prepared, runId)
      proposal.narrativeReceipt = { manifestFingerprint: generated.contextManifest?.fingerprint || '', receipt: generated.contextReceipt || null }
      return proposal
    },
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
      const [rules, lexicon] = await Promise.all([
        readLocalRuleFilesForBook(prepared.bookId), readLocalLexiconForBook(prepared.bookId)
      ])
      if (signal?.aborted) throw signal.reason || new Error('请求已取消')
      const ruleText = rules.files.map(item => `【${item.name}】\n${String(item.content || '')}`).join('\n\n')
      const lexiconText = compileLexiconPrompt(lexicon.lexicon)
      if (ruleText || lexiconText) prepared.kernel.serialization.blocks.push({ kind: 'local-rules', title: '作者词汇与本地约束', text: [ruleText, lexiconText].filter(Boolean).join('\n\n') })
      const documents = prepared.editBaseline?.worldbook?.sourceDocuments || []
      if (!documents.some(document => document.chunkIds?.length)) return prepared
      const { retrieveAssistantSourceChunks } = await import('./assistantSourceRetrieval.js')
      const pinnedDocumentIds = (prepared.pinnedRefs || []).filter(ref => ref.type === 'source').map(ref => String(ref.sourceDocumentId || ref.id))
      const sources = await retrieveAssistantSourceChunks(documents, [text, prepared.manuscriptTail].filter(Boolean).join('\n'), { signal, pinnedDocumentIds })
      // Retrieval already happened for the assistant catalogue. Reuse these
      // frozen excerpts for writing even when the model does not call lookup.
      prepared.writingReferences = sources.filter(source => source.pinned || source.score > 0)
      prepared.index.byDomain.world = [...prepared.index.byDomain.world.filter(item => item.type !== 'source').slice(0, 96), ...sources]
      return prepared
    },
    async prepareProposal(input, prepared, runId) {
      const { prepareAssistantProposal } = await import('./assistantEditTransaction.js')
      if (!prepared.editBaseline) throw new Error('本轮缺少编辑基线。')
      assertAssistantPermission(prepared.permission, input.changes, prepared.bookId)
      const proposal = prepareAssistantProposal(input, { ...prepared.editBaseline, runId })
      assertAssistantPermission(prepared.permission, proposal.changes, prepared.bookId)
      return { ...proposal, permission: prepared.permission }
    },
    applyProposal(proposal, options = {}) { return withAssistantEditLock(() => this.commitProposal(proposal, options)) },
    async commitProposal(proposal, { undo = false, discard = false, changeIds = null, acknowledge = null } = {}) {
      const { applyAssistantProposal, selectAssistantProposalChanges } = await import('./assistantEditTransaction.js')
      const savedReceipt = getItem(`assistant_edit_receipt:${proposal.id}`, null)
      if (savedReceipt && JSON.stringify(savedReceipt.changes) !== JSON.stringify(proposal.changes)) return { ok: false, error: '这组修改已在其他窗口处理，请刷新后继续。' }
      if (acknowledge) {
        if (String(getBook?.()?.id) !== proposal.bookId) return { ok: false, error: '作品已切换，请返回原作品。' }
        const { kind, targetId } = acknowledge
        const changes = proposal.changes.filter(change => change.kind === kind && change.targetId === targetId)
        if (!changes.some(change => change.status === 'adopted') || changes.some(change => !change.status || change.status === 'pending')) return { ok: false, error: '请先采用修改，再完成确认。' }
        const reviewedTargets = [...new Set([...(savedReceipt?.reviewedTargets || proposal.reviewedTargets || []), `${kind}:${targetId}`])]
        const next = { ...proposal, reviewedTargets }
        persistAssistantEdits([{ key: `assistant_edit_receipt:${proposal.id}`, after: next }], proposal.id)
        Object.assign(proposal, next)
        return { ok: true, status: next.status }
      }
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
      const reviewedTargets = (savedReceipt?.reviewedTargets || proposal.reviewedTargets || []).filter(key => !result.changes.some(change => key === `${change.kind}:${change.targetId}`))
      const nextProposal = { ...proposal, changes: result.proposalChanges, status: result.status, receipt, reviewedTargets }
      const writes = [{ key: STORAGE_KEYS.WRITING_BOOKS, after: nextBooks }]
      if (usesWorldbook) {
        if (result.worldbook) result.worldbook.pendingFileSync = true
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
