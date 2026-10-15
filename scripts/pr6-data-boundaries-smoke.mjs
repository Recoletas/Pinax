import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { createLocalMirrorService } from '../server/services/localMirrorService.js'
import { recoverMirrorTransaction } from '../server/services/localMirrorTransaction.js'
import { createLocalMirrorRouter } from '../server/routes/localMirror.js'
let checks = 0
const check = (value, description) => { assert.ok(value, description); checks++; console.log(`✓ ${description}`) }
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-pr6-boundaries-'))
let server
const originalPublic = process.env.PINAX_PUBLIC_ORIGINS
try {
  const service = createLocalMirrorService({ rootPath: path.join(temporary, 'books'), appDataPath: path.join(temporary, 'app') })
  const book = { id: 'book-a', title: '合成作品', chapters: [{ id: 'chapter-a', title: '第一章', content: '甲推开了门。' }] }
  const entry = { id: 'person-stable', name: '同名人物', content: '在码头工作。', type: 'character', keys: ['甲'], metadata: { review: 'confirmed' }, injection: { constant: true, group: 'core' }, relations: { locations: ['place-stable'], organizations: ['org-stable'] }, extension: { future: true } }
  const payload = { book, worldbook: { id: 'world-a', name: '合成世界书', entries: [entry, { ...entry, id: 'person-other' }] }, logs: { sessions: [], revisions: [], memory: [], conversations: [{ id: 'chat-a', content: '记录' }] }, sourceArchive: { doc: { meta: { id: 'doc' }, chunks: [{ text: '原始资料' }] } } }
  const first = service.mirrorBook(payload)
  const roundtrip = service.readWorldbookFolder(first.dir).worldbook.entries
  check(new Set(roundtrip.map(item => item.id)).size === 2, '同名人物稳定身份不碰撞')
  const restored = roundtrip.find(item => item.id === entry.id)
  check(restored.metadata.review === 'confirmed' && restored.injection.constant && restored.relations.locations.includes('place-stable') && restored.relations.organizations.includes('org-stable'), '元数据、注入及扩展关系完整往返')
  const archive = path.join(first.dir, '资料', '归档', 'doc.json')
  const beforeArchive = fs.readFileSync(archive, 'utf8')
  service.mirrorBook({ book, worldbook: { ...payload.worldbook, entries: [entry] }, baseRevision: first.revision, requestId: 'partial-1' })
  check(fs.readFileSync(archive, 'utf8') === beforeArchive, '世界书部分保存不清空资料归档')
  check(fs.readdirSync(path.join(first.dir, '日志', '助手对话')).length > 0, '部分保存保留助手历史')
  const duplicate = service.mirrorBook({ book, worldbook: { ...payload.worldbook, entries: [entry] }, baseRevision: first.revision, requestId: 'partial-1' })
  check(duplicate.revision === 2, '重复请求幂等且不受旧基准误拒收')
  assert.throws(() => service.mirrorBook({ book, baseRevision: 1 }), /项目文件已更新/); checks++
  const manuscript = path.join(first.dir, '正文', '001-第一章.md')
  fs.writeFileSync(manuscript, '作者外部修改。')
  assert.throws(() => service.mirrorBook({ book }), /项目文件已被修改/); checks++
  check(fs.readFileSync(manuscript, 'utf8') === '作者外部修改。', '拒绝覆盖手动编辑，保留原文件')
  // Simulate termination after the old tree moved but before durable commit.
  const backup = `${first.dir}.pinax-before-sync`
  fs.renameSync(first.dir, backup); fs.mkdirSync(first.dir); fs.writeFileSync(path.join(first.dir, 'broken'), '中断的新树')
  fs.writeFileSync(`${first.dir}.pinax-sync.json`, JSON.stringify({ hadOriginal: true, committed: false }))
  recoverMirrorTransaction(first.dir)
  check(fs.existsSync(archive) && !fs.existsSync(path.join(first.dir, 'broken')), '中断事务恢复旧树，资料完整')
  process.env.PINAX_PUBLIC_ORIGINS = 'https://example.invalid'
  const app = express(); app.use(express.json()); app.use('/api/localmirror', createLocalMirrorRouter({ service }))
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/localmirror`
  for (const [route, method] of [['location', 'GET'], ['appdata', 'GET'], ['projects', 'GET'], ['browse', 'GET'], ['sync-state', 'GET'], ['sync', 'POST'], ['index', 'POST'], ['worldbook', 'GET']]) {
    const response = await fetch(`${base}/${route}`, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {}) })
    check(response.status === 403, `公网 ${method} ${route} 拒绝本机文件能力`)
  }
  const capabilities = await (await fetch(`${base}/capabilities`)).json()
  check(capabilities.localFiles === false, '公网能力响应明确关闭文件入口')
  console.log(`pr6-data-boundaries: ${checks} checks passed`)
} finally {
  if (originalPublic === undefined) delete process.env.PINAX_PUBLIC_ORIGINS; else process.env.PINAX_PUBLIC_ORIGINS = originalPublic
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  fs.rmSync(temporary, { recursive: true, force: true })
}
