import { listMemoryCandidates } from '../../memory/memoryCandidates.js'
import { createProjectMemoryReader } from '../../project/projectMemoryReader.js'
import { createProjectKnowledgeFacade } from '../../project/projectKnowledgeFacade.js'

export function createAuthoringKnowledgeReaderHost(host) {
  let cache = null

  function snapshot(request = {}) {
    const target = request?.intent?.invocationTarget || null
    const live = host.readLiveDocument()
    const projectId = String(target?.projectId || live.projectId || '')
    const chapterId = String(target?.chapterId || live.chapterId || '')
    const chapter = host.findChapter(projectId, chapterId)
    const text = typeof target?.documentText === 'string' ? target.documentText : String(live.text || '')
    const documentRole = String(target?.documentRole || live.documentRole || 'manuscript')
    const documentId = String(target?.documentId || live.documentId || chapterId)
    return {
      target,
      projectId,
      chapterId,
      chapter,
      text,
      documentRole,
      documentId,
      revision: String(target?.documentRevision || live.revision || ''),
      sourceRef: documentRole === 'exploration' ? `exploration:${documentId}` : `chapter:${chapterId}`
    }
  }

  function selection(request = {}, current = snapshot(request)) {
    const target = current.target
    if (!target) return host.readSelection()
    const rawStart = target.markdownFrom ?? target.caret
    const rawEnd = target.markdownTo ?? rawStart
    const start = Math.max(0, Math.min(current.text.length, Number(rawStart) || 0))
    const end = Math.max(start, Math.min(current.text.length, Number(rawEnd) || start))
    return { start, end, text: current.text.slice(start, end), hasSelection: end > start }
  }

  function readers() {
    return {
      rules: () => [{ text: '保持既有叙事声音与节奏；不引入未确认设定；不输出解释性元话语。', sourceRefs: ['rules:authoring'] }],
      style: (request) => {
        const current = snapshot(request)
        return current.chapter?.styleNote ? [{ text: String(current.chapter.styleNote), sourceRefs: [current.sourceRef] }] : []
      },
      selection: (request) => {
        const current = snapshot(request)
        if (!current.text) return []
        const selected = selection(request, current)
        return [{
          text: current.text.slice(Math.max(0, (selected.start ?? current.text.length) - 520), Math.min(current.text.length, (selected.end ?? current.text.length) + 240)),
          sourceRefs: [current.sourceRef]
        }]
      },
      scene: (request) => {
        const current = snapshot(request)
        if (!current.text) return []
        const caret = selection(request, current).end ?? current.text.length
        return [{ text: current.text.slice(Math.max(0, caret - 1200), Math.min(current.text.length, caret + 240)), sourceRefs: [current.sourceRef] }]
      },
      outline: () => host.outline().slice(0, 8).map((item) => ({ text: String(item.preview || item.title || ''), sourceRefs: [`asset:${item.assetId || item.id}`] })),
      worldbook: () => {
        const book = host.worldbook()
        return book ? [{ text: String(book.name || ''), sourceRefs: [`worldbook:${book.id || ''}`] }] : []
      },
      character: () => host.characters().slice(0, 6).map((char) => ({ text: `${char.name || ''}${char.role ? `·${char.role}` : ''}`, sourceRefs: [`character:${char.id || char.name || ''}`] })),
      location: () => host.location() ? [{ text: String(host.location()), sourceRefs: ['map:current-scene'] }] : [],
      history: () => host.history().slice(-4).map((activity) => ({ text: String(activity.title || ''), sourceRefs: [`activity:${activity.id || ''}`] })),
      memory: createProjectMemoryReader({
        list: ({ status } = {}) => listMemoryCandidates({ status }),
        ledgerFacts: async (request) => {
          const { readProductionLedgerFacts } = await import('../../memory/ledger/ledgerProductionAdapter.js')
          return readProductionLedgerFacts(request)
        },
        context: (request) => {
          const current = snapshot(request)
          return { projectId: current.projectId, sessionId: host.sessionId(), currentRevisions: { [current.sourceRef]: current.revision } }
        }
      }),
      references: () => {
        const reference = host.reference()
        return reference ? [{ text: String(reference.content || '').slice(0, 1200), sourceRefs: [`asset:${reference.id}`] }] : []
      }
    }
  }

  function getFacade() {
    const live = host.readLiveDocument()
    const projectId = String(live.projectId || '')
    if (!projectId || !live.chapterId) return null
    if (!cache || cache.projectId !== projectId) {
      cache = { projectId, facade: createProjectKnowledgeFacade({ projectId, projectRevision: `project:${projectId}`, readers: readers() }) }
    }
    return cache.facade
  }

  function reset() { cache = null }
  return { getFacade, snapshot, reset, dispose: reset }
}
