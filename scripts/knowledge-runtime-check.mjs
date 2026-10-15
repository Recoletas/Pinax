// Real pinned kit + compiler, isolated synthetic projects; no mocked search engine or model calls.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import express from 'express'
import { createLocalMirrorService } from '../server/services/localMirrorService.js'
import { createKnowledgeRouter } from '../server/routes/knowledge.js'
import { createKnowledgeRuntime } from '../server/services/knowledgeRuntime.js'
import { createAssistantKnowledgeTool } from '../runtime-extensions/assistantKnowledgeTool.js'

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinax-knowledge-check-'))
let server
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
try {
  const service = createLocalMirrorService({ appDataPath: path.join(temp, 'registry'), rootPath: path.join(temp, 'books') })
  const projectRoot = path.join(temp, 'book')
  const { entry } = service.createProjectAt({ rootPath: projectRoot, name: '索引验证作品', bookId: 'knowledge-check-book' })
  const book = { id: 'knowledge-check-book', title: '索引验证作品', chapters: [{ id: 'c1', title: '第一章', content: '主角走进港口。' }] }
  const worldbook = { id: 'knowledge-check-world', updatedAt: 123, name: '设定', entries: [
    { id: 'person-1', name: '林遥', type: 'character', content: '林遥是修理钟表的学徒。', links: ['place-1'], keys: ['林遥'] },
    { id: 'place-1', name: '白石港', type: 'location', content: '白石港在北岸。', keys: ['白石港'] }
  ] }
  service.mirrorBook({ book, worldbook, sourceArchive: { 'source-current': { meta: { title: '潮汐记录', contentHash: 'source-v1' }, chunks: [{ id: 'shared-chunk', sourceId: 'source-other', text: '赤潮只在月圆夜出现。', locator: { start: 1, end: 5 }, sourceRefs: [{ sourceId: 'source-current', locator: { start: 100, end: 112 } }] }] } } })
  await fs.writeFile(path.join(projectRoot, '资料/same.txt'), '# 文本资料\n铜钥匙藏在桥下。')
  await fs.writeFile(path.join(projectRoot, '资料/same.md'), '# 标记资料\n银钥匙藏在屋顶。')
  const runtime = createKnowledgeRuntime({ cacheRoot: path.join(temp, 'cache') })
  const app = express(); app.use(express.json()); app.use('/api/knowledge', createKnowledgeRouter({ service, runtime }))
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const port = server.address().port
  const post = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/knowledge/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookId: book.id, ...body }) })
    return { status: response.status, body: await response.json() }
  }
  const found = await post('worldbook-search', { q: '林遥', k: 1, worldbookId: worldbook.id, worldbookRevision: '123' })
  check(found.status === 200, JSON.stringify(found))
  check(found.body.hits[0].id === 'person-1', 'real kit worldbook match')
  check(found.body.expansion.some(item => item.id === 'place-1'), 'real kit one-hop expansion')
  const kb = await post('kb-search', { q: '赤潮', k: 5 })
  check(kb.status === 200, JSON.stringify(kb))
  const hit = kb.body.hits.find(item => item.source === 'project' && item.provenance?.docId === 'source-current')
  check(hit?.contentAvailable, 'project archive included by actual compiler')
  check(hit.provenance.locator.start === 100, 'locator belongs to current source')
  check(hit.provenance.revision === 'source-v1', 'source revision')
  const read = await post('kb-read', { ref: hit.readRef, indexRevision: kb.body.coverage.indexRevision })
  check(read.body.content?.includes('赤潮只在月圆夜出现'), 'project original text readable')
  const twins = await post('kb-search', { q: '钥匙', k: 30 })
  check(twins.body.hits.some(item => item.provenance?.path === '资料/same.md') && twins.body.hits.some(item => item.provenance?.path === '资料/same.txt'), 'md/txt preserve distinct sources')
  const global = await post('kb-search', { q: 'AI 味', k: 3 })
  check(global.body.hits.some(item => item.source === 'global' && item.contentAvailable === false), 'published metadata clearly labeled')
  const metadata = global.body.hits.find(item => item.source === 'global')
  check((await post('kb-read', { ref: metadata.readRef })).status !== 200, 'missing private source never fabricated')
  check((await post('kb-read', { ref: '../../package.json' })).status === 400, 'traversal denied')
  check((await post('kb-search', { q: '林遥', bookId: 'another-book', projectId: entry.projectId })).status === 400, 'cross-book binding denied')
  await fs.writeFile(path.join(projectRoot, '资料/same.md'), '# 标记资料\n银钥匙已经被取走。')
  check((await post('kb-read', { ref: hit.readRef, indexRevision: kb.body.coverage.indexRevision })).status === 409, 'old search rejects changed index')
  const personPath = path.join(projectRoot, '世界书/人物/林遥.md')
  await fs.writeFile(personPath, (await fs.readFile(personPath, 'utf8')).replace('修理钟表', '修理望远镜'))
  const changed = await post('worldbook-search', { q: '望远镜', k: 1 })
  check(changed.body.hits[0]?.summary.includes('望远镜'), 'worldbook graph rebuilt from edited files')
  check((await post('worldbook-search', { q: '林遥', worldbookRevision: '123' })).status === 409, 'browser stale worldbook rejected')
  const tool = createAssistantKnowledgeTool({ bookId: book.id }, { env: { PINAX_KNOWLEDGE_PROXY_PORT: port } })
  const toolResult = JSON.parse((await tool.execute('knowledge-check', { action: 'kb_search', q: '赤潮' })).content[0].text)
  check(toolResult.ok && toolResult.result.hits.some(item => item.provenance?.docId === 'source-current'), 'actual assistant tool → Express → real kit → indexed source')
  const controller = new AbortController(); controller.abort()
  await assert.rejects(runtime.run('kb_search', { q: '林遥', project: entry.projectId }, entry, { signal: controller.signal }))
  checks++
  await fs.symlink(path.join(temp, 'registry'), path.join(projectRoot, '资料/escape'))
  check((await post('kb-search', { q: '林遥' })).status === 409, 'source symlink rejected')
  console.log(`knowledge-runtime-check: ${checks} checks passed; real kit/compiler/tool bridge; isolated synthetic content`)
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  await fs.rm(temp, { recursive: true, force: true })
}
