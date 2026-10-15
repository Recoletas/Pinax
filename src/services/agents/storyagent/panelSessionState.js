import { reactive } from 'vue'
import { randomUUID } from '../../../../shared/randomId.js'

// The beta panel keeps one view state and one execution slot per real book.
// Executions retain their original state/turn references when the visible book
// changes; no callback locates a turn through the current array or its index.
export function createStoryAgentPanelSessions() {
  const entries = new Map()
  let disposed = false

  function get(bookId) {
    const id = String(bookId || '').trim()
    if (!entries.has(id)) entries.set(id, {
      bookId: id,
      owner: null,
      listSequence: 0,
      state: reactive({
        turns: [], draft: '', pinnedRefs: [], sessions: [], activeTaskId: '',
        running: false, statusLine: '待命', contractStats: { total: 0, ok: 0 }
      })
    })
    return entries.get(id)
  }

  function append(entry, role, text) {
    const turn = reactive({ id: randomUUID(), role, text, status: '', meta: null, tools: [] })
    entry.state.turns.push(turn)
    return turn
  }

  function owns(owner) {
    return !disposed && owner.entry.owner === owner
  }

  function begin(entry, { taskId, text, resumed = false }) {
    if (disposed || !entry.bookId || entry.owner || entry.state.running) return null
    append(entry, 'user', text)
    const answer = append(entry, 'assistant', '')
    answer.status = '生成中…'
    let resolveRegistration
    const registration = new Promise(resolve => { resolveRegistration = resolve })
    const owner = Object.freeze({
      entry, bookId: entry.bookId, taskId, answer,
      controller: new AbortController(),
      runtime: {
        started: false, streamFinished: false, terminalStatus: '', cancelRequested: false, cancelPending: false,
        registration, resolveRegistration
      }
    })
    entry.owner = owner
    entry.state.activeTaskId = taskId
    entry.state.running = true
    entry.state.statusLine = resumed ? '追问续跑…' : '启动任务…'
    entry.state.contractStats.total = 0
    entry.state.contractStats.ok = 0
    return owner
  }

  function started(owner) {
    if (!owns(owner)) return
    owner.runtime.started = true
    owner.runtime.resolveRegistration(true)
  }

  function finish(owner) {
    owner.runtime.resolveRegistration(false)
    if (!owns(owner)) return
    owner.entry.state.running = false
    owner.entry.owner = null
  }

  function clear(entry) {
    if (entry.owner || entry.state.running) return false
    entry.state.turns = []
    entry.state.pinnedRefs = []
    entry.state.draft = ''
    entry.state.activeTaskId = ''
    entry.state.statusLine = '待命'
    return true
  }

  function dispose() {
    disposed = true
    for (const entry of entries.values()) {
      entry.listSequence += 1
      const owner = entry.owner
      if (!owner) continue
      owner.runtime.resolveRegistration(false)
      // Detaching a browser stream is not cancellation of the server task.
      owner.controller.abort()
      entry.state.running = false
      entry.state.statusLine = '连接已断开，后端任务状态尚未确认'
      entry.owner = null
    }
  }

  return Object.freeze({ get, append, begin, owns, started, finish, clear, dispose })
}
