import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import express from 'express'
import { createStoryAgentRouter } from '../server/routes/storyagent.js'
import { createStoryAgentEngine } from '../src/services/agents/storyagent/agentEngine.js'
import { createAuthoringStoryAgent } from '../src/services/agents/storyagent/authoringIntegration.js'
import { createAuthoringAssistantConversationStore } from '../src/services/agents/authoring/authoringAssistantConversationStore.js'
import { createBrowserStorageRepository } from '../src/services/storage/browserStorageRepository.js'
import { runExperienceAgentGeneration } from '../src/services/agents/storyagent/experienceAgentRoute.js'
import { KIT_TASK_PLANE_ENDPOINT } from '../shared/kitTaskPlane.js'

let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log(`✓ ${message}`) }
const project = { __v_isRef: true, value: 'book-a' }
let sent
const engine = createStoryAgentEngine({ projectId: project, resolveContext: bookId => ({ bookTitle: bookId, worldEntries: [], chapterEntries: [] }), bridge: { run: async input => { sent = input; return { ok: true } } } })
const frozen = engine.prepare({ text: '原始请求' })
project.value = 'book-b'
await engine.run({ prepared: frozen, text: '原始请求' })
check(sent.bookId === 'book-a' && !sent.bookId.includes('Object'), 'Vue ref 归属被正确展开，冻结后切书不改变请求')

const fakeMap = new Map()
const repo = createBrowserStorageRepository({ getItem: key => fakeMap.get(key) ?? null, setItem: (key, value) => fakeMap.set(key, value) })
const store = createAuthoringAssistantConversationStore({ storage: repo })
const message = { id: 'a1', role: 'assistant', kind: 'agent', projectId: 'book-a', text: '完整结果', status: 'completed', taskId: 'task-a', thinking: '思'.repeat(6000), tools: [] }
check(store.saveConversation('book-a', { messages: [message], activeSessionId: 's1', agentTaskId: 'task-a', agentSessions: [{ sessionId: 's1', projectId: 'book-a', messages: [message] }] }).ok, 'Agent 对话使用既有存储真源')
const loaded = store.load('book-a').conversation
check(loaded.messages[0].text === '完整结果' && loaded.agentTaskId === 'task-a' && loaded.messages[0].thinking.length === 4000, '刷新保留输出与任务 ID，思考过程有界')
check(store.load('book-b').conversation === null, '另一作品看不到当前作品的输出')
check([...fakeMap.keys()].every(key => key.startsWith('authoring_assistant_conversation:')), '没有第二套 Agent 会话存储键')

let books = [{ id: 'book-a', chapters: [{ id: 'chapter-a', content: '', editorDocument: null }] }]
let saves = 0
let published = false
let allowSave = false
const adopter = createAuthoringStoryAgent({ projectId: 'book-a', getBook: () => books[0], getChapter: () => books[0].chapters[0], persistCurrent: () => true,
  readBooks: () => books, saveBooks: () => { saves++; return { ok: allowSave } }, publishBooks: next => { books = next; published = true } })
const candidate = { ...message, chapterId: 'chapter-a' }
check(!(await adopter.adopt({ ...candidate, status: 'failed' })).ok && saves === 0, '失败输出不能进入正文')
check(!(await adopter.adopt({ ...candidate, projectId: 'book-b' })).ok && saves === 0, '另一作品的候选不能采纳')
check(!(await adopter.adopt(candidate)).ok && !published && books[0].chapters[0].content === '', '持久化失败不发布新正文')
allowSave = true
check((await adopter.adopt(candidate)).ok && published && books[0].chapters[0].content.includes('完整结果'), '保存成功后才发布采纳正文')
check(!(await adopter.adopt(candidate)).ok, '同一候选不能重复追加')

let native = 0
let adapter = 0
const nativeRun = async () => { native++; return { ok: true, finalText: '验收后的正文' } }
const route = { run: async () => { adapter++; return { ok: true, finalText: '候选正文' } } }
await runExperienceAgentGeneration({ taskContract: { kind: 'roleplay' } }, nativeRun, { enabled: true, route })
check(native === 1 && adapter === 0, '严格任务不会绕过原生发布前验收')
const visible = []
await runExperienceAgentGeneration({ callbacks: { onChunk: chunk => visible.push(chunk.content) } }, nativeRun, { enabled: true, route })
check(adapter === 1 && visible.join('') === '候选正文', '普通体验回合完成后发布 Adapter 正文')
await assert.rejects(runExperienceAgentGeneration({}, nativeRun, { enabled: true, route: { run: async () => ({ ok: false }) } }))
check(native === 1, '已经失败的 Adapter 任务不会自动重跑另一套引擎')

const upstreamCalls = []
const app = express()
app.use(express.json())
app.use('/api/storyagent', createStoryAgentRouter({ fetchImpl: async (url, options) => {
  upstreamCalls.push({ url: String(url), options })
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
} }))
const server = createServer(app)
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/api/storyagent`
try {
  const token = 'a'.repeat(64)
  const prefix = `pa_${createHash('sha256').update(token).digest('hex').slice(0, 24)}_`
  const owned = `${prefix}task`
  const headers = { 'x-pinax-agent-session': token, 'content-type': 'application/json' }
  check((await fetch(`${base}/v1/pinax/tasks/list`, { headers })).status === 404, '公网入口不提供全站任务列表')
  check((await fetch(`${base}/v1/pinax/tasks/not-owned`, { headers })).status === 404, '公网入口拒绝读取他人任务')
  check((await fetch(`${base}/v1/pinax/tasks/${owned}`, { headers })).ok, '当前浏览器可以读取自己的任务')
  check((await fetch(`${base}/v1/pinax/tasks/${owned}/cancel`, { method: 'POST', headers })).ok, '当前浏览器可以停止自己的任务')
  check((await fetch(`${base}/v1/pinax/tasks`, { method: 'POST', headers, body: JSON.stringify({ taskId: 'foreign' }) })).status === 403, '不能指定他人的任务 ID 创建任务')
  check(upstreamCalls.length === 2 && upstreamCalls.every(call => call.url.startsWith(`${KIT_TASK_PLANE_ENDPOINT}/`)), '被拒绝的请求不转发，运行地址只由服务器决定')
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
console.log(`storyagent-integration-smoke: ${checks}/${checks} passed`)
