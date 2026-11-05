/* eslint-disable no-console -- 消费冒烟脚本需要把安装/断言结果写到 stdout */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Core 包消费冒烟：证明 @pinax/core 能通过 npm pack/tarball 被另一个项目安装，
 * 而不是靠源码复制。Pinix / Next 后续应按同一方式依赖这个包。
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const work = await mkdtemp(join(tmpdir(), 'pinax-core-smoke-'))
const consumerDir = join(work, 'consumer')

try {
  await mkdir(consumerDir, { recursive: true })
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const dependency = manifest.dependencies['@pinax/core']
  if (!dependency?.startsWith('file:vendor/core/') || !dependency.endsWith('.tgz')) throw new Error('请更新消费冒烟以匹配当前 Core 分发形式')
  const tarball = join(root, dependency.slice(5))

  await writeFile(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'pinax-core-consumer-smoke',
    private: true,
    type: 'module',
    dependencies: { '@pinax/core': `file:${tarball}` }
  }, null, 2), 'utf8')
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: consumerDir,
    stdio: 'pipe'
  })

  await writeFile(join(consumerDir, 'smoke.mjs'), `
import assert from 'node:assert/strict'
import { createChapterService, createMemoryChapterStore } from '@pinax/core'

const store = createMemoryChapterStore({ books: new Map([['book-1', []]]) })
const service = createChapterService({ store, idFactory: () => 'chapter-smoke' })
const created = await service.create('book-1', { title: '第一章', content: '雨夜。' })
assert.equal(created.ok, true)
assert.equal(created.value.revision, 1)
const saved = await service.save('book-1', 'chapter-smoke', {
  content: '雨夜，旧钟楼。',
  expectedRevision: 1
})
assert.equal(saved.ok, true)
assert.equal(saved.value.revision, 2)
const stale = await service.save('book-1', 'chapter-smoke', { content: '不该落盘', expectedRevision: 1 })
assert.equal(stale.ok, false)
assert.equal(stale.error.code, 'STALE_REVISION')
const read = await service.read('book-1', 'chapter-smoke')
assert.equal(read.ok, true)
assert.equal(read.value.content, '雨夜，旧钟楼。')
const removed = await service.remove('book-1', 'chapter-smoke', { expectedRevision: 2 })
assert.equal(removed.ok, true)
console.log('core package smoke: create/save/stale/read/remove ok')
`, 'utf8')
  const output = execFileSync('node', ['smoke.mjs'], { cwd: consumerDir, encoding: 'utf8' })
  process.stdout.write(output)
  console.log(`core package smoke ok: ${tarball}`)
} finally {
  if (process.env.KEEP_CORE_PACKAGE === '1') {
    console.log(`kept core smoke workspace: ${work}`)
  } else {
    await rm(work, { recursive: true, force: true })
  }
}
