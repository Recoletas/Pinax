import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { parseWorldbookEntryFile, buildWorldbookGraphFile } from '../../shared/worldbookFileContract.js'
import { sourceChunkLocator } from '../../src/services/workspace/sourceChunkLocator.js'

const exec = promisify(execFile)
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message) => Object.assign(new Error(message), { code, status: 409 })
const INPUT_DIRS = ['世界书', '资料', '规则', '约束', '文风']

// This is a disposable projection. Nothing in the author's folder is rewritten.
export async function collectKnowledgeSources(rootPath, signal) {
  signal?.throwIfAborted()
  const root = await fs.realpath(rootPath)
  const files = []
  let bytes = 0
  async function walk(dir, depth = 0) {
    signal?.throwIfAborted()
    const actualDir = await fs.realpath(dir).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (actualDir && actualDir !== dir) throw fail('KNOWLEDGE_SYMLINK', '索引目录含符号链接，请使用项目内的普通资料文件。')
    if (depth > 12) throw fail('KNOWLEDGE_LIMIT', '资料目录层级超过索引上限。')
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      signal?.throwIfAborted()
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw fail('KNOWLEDGE_SYMLINK', '索引目录含符号链接，请使用项目内的普通资料文件。')
      if (entry.isDirectory()) { await walk(file, depth + 1); continue }
      const relative = path.relative(root, file).split(path.sep).join('/')
      if (!entry.isFile() || !/\.(md|txt)$/i.test(entry.name) && !/^世界书\/(graph|manifest)\.json$/.test(relative) && !/^资料\/归档\/[^/]+\.json$/.test(relative)) continue
      const stat = await fs.lstat(file)
      bytes += stat.size
      if (stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024 || bytes > 64 * 1024 * 1024 || files.length >= 2000) throw fail('KNOWLEDGE_LIMIT', '本书资料超过单次索引容量，请拆分较大的归档后重试。')
      const handle = await fs.open(file, 'r')
      try {
        const actual = await fs.realpath(file)
        if (!actual.startsWith(root + path.sep)) throw fail('KNOWLEDGE_PATH', '资料路径已变化，请重试。')
        const opened = await handle.stat()
        const current = await fs.stat(file)
        if (opened.dev !== current.dev || opened.ino !== current.ino || opened.size > 16 * 1024 * 1024) throw fail('KNOWLEDGE_PATH', '资料路径已变化，请重试。')
        files.push({ relative, text: await handle.readFile('utf8') })
      } finally { await handle.close() }
    }
  }
  for (const dir of INPUT_DIRS) await walk(path.join(root, dir))
  return { files, revision: hash(JSON.stringify(files)), root }
}

export function createKnowledgeProjectIndexer({ runtimeRoot, cacheRoot }) {
  const inflight = new Map()
  async function prepare(entry, signal) {
    const snapshot = await collectKnowledgeSources(entry.rootPath, signal)
    const runtimeSource = JSON.parse(await fs.readFile(path.join(runtimeRoot, 'runtime-source.json'), 'utf8'))
    const cacheKey = hash(JSON.stringify([3, runtimeSource.commit, runtimeSource.lockSha256, snapshot.root, entry.bookId, snapshot.revision]))
    const projectRoot = path.join(cacheRoot, entry.projectId)
    const destination = path.join(projectRoot, cacheKey)
    try {
      const coverage = JSON.parse(await fs.readFile(path.join(destination, 'coverage.json'), 'utf8'))
      return { directory: destination, coverage }
    } catch { /* first build */ }
    await fs.mkdir(projectRoot, { recursive: true })
    const stage = path.join(projectRoot, `.building-${randomUUID()}`)
    await fs.mkdir(path.join(stage, 'cards'), { recursive: true })
    const provenance = {}
    let cards = 0
    const worldEntries = []
    let originalGraph = null
    try {
      for (const file of snapshot.files) {
        signal?.throwIfAborted()
        if (file.relative === '世界书/graph.json') {
          originalGraph = JSON.parse(file.text)
          await fs.mkdir(path.join(stage, '世界书'), { recursive: true })
          await fs.writeFile(path.join(stage, file.relative), file.text)
        }
        if (/\.(md|txt)$/i.test(file.relative) && !/(^|\/)README\.md$/i.test(file.relative)) {
          const cardRef = `cards/${file.relative}.md`
          const target = path.join(stage, cardRef)
          if (file.relative.startsWith('世界书/') && !['世界书/纪律.md', '世界书/伏笔/台账.md', '世界书/底牌/暗线底牌.md', '世界书/编年/章账.md'].includes(file.relative)) {
            const parsed = parseWorldbookEntryFile(file.text)
            if (parsed.ok) worldEntries.push({ ...parsed.entry, _sourcePath: file.relative })
          }
          await fs.mkdir(path.dirname(target), { recursive: true })
          await fs.writeFile(target, file.text)
          provenance[cardRef] = { path: file.relative, revision: hash(file.text) }
          cards++
        } else if (/^资料\/归档\/.+\.json$/.test(file.relative)) {
          const archive = JSON.parse(file.text)
          if (!archive.docId || !Array.isArray(archive.chunks)) throw fail('KNOWLEDGE_ARCHIVE_INVALID', '资料归档格式不完整，未更新索引。')
          for (const [index, chunk] of archive.chunks.entries()) {
            signal?.throwIfAborted()
            if (cards >= 500) throw fail('KNOWLEDGE_LIMIT', '本书有超过 500 份知识片段，请缩小索引资料范围后重试。')
            const content = String(chunk.text ?? chunk.content ?? '')
            if (!content.trim()) continue
            const ref = `cards/归档/${hash(String(archive.docId)).slice(0, 24)}-${index}.md`
            const title = String(archive.meta?.title || archive.meta?.name || archive.docId)
            const header = { id: `source/${archive.docId}/${chunk.id || index}`, title, tags: ['资料原文'] }
            await fs.mkdir(path.dirname(path.join(stage, ref)), { recursive: true })
            await fs.writeFile(path.join(stage, ref), `---\n${JSON.stringify(header, null, 2)}\n---\n\n${content}`)
            provenance[ref] = { docId: archive.docId, chunkId: chunk.id || null, locator: sourceChunkLocator(chunk, archive.docId), revision: archive.meta?.contentHash || hash(content), chunkRevision: hash(content), path: file.relative }
            cards++
          }
        }
        if (cards > 500) throw fail('KNOWLEDGE_LIMIT', '本书有超过 500 份知识片段，请缩小索引资料范围后重试。')
      }
      await fs.mkdir(path.join(stage, 'kit'))
      if (cards) {
        await exec(process.env.PINAX_PYTHON || 'python3', [path.join(runtimeRoot, 'tools/kit-compile.py'), '--src', path.join(stage, 'cards'), '--out', path.join(stage, 'kit/hypergraph.rag.json')], { signal, timeout: 45000, maxBuffer: 1024 * 1024 })
      } else await fs.writeFile(path.join(stage, 'kit/hypergraph.rag.json'), JSON.stringify({ entries: [], relations: [] }))
      const compiled = JSON.parse(await fs.readFile(path.join(stage, 'kit/hypergraph.rag.json'), 'utf8'))
      const graph = buildWorldbookGraphFile({ entries: worldEntries })
      for (const item of graph.entries) item.path = worldEntries.find(entry => entry.id === item.id)?._sourcePath || item.path
      const comparable = graph => JSON.stringify((graph?.entries || []).map(({id, title, summary, tags, links, status}) => ({id, title, summary, tags, links, status})).sort((a,b) => a.id.localeCompare(b.id)))
      const diskEdited = comparable(graph) !== comparable(originalGraph)
      if (worldEntries.length || originalGraph) {
        await fs.mkdir(path.join(stage, '世界书'), { recursive: true })
        await fs.writeFile(path.join(stage, '世界书/graph.json'), JSON.stringify(graph))
      }
      let worldbook = {}
      const manifest = snapshot.files.find(file => file.relative === '世界书/manifest.json')
      if (manifest) worldbook = JSON.parse(manifest.text)
      const coverage = { projectId: entry.projectId, bookId: String(entry.bookId || ''), projectCards: compiled.entries.length, indexRevision: snapshot.revision, compilerCommit: runtimeSource.commit, worldbookId: String(worldbook.worldbookId || ''), worldbookRevision: diskEdited ? `file:${snapshot.revision}` : String(worldbook.updatedAt || ''), indexedAt: new Date().toISOString() }
      if ((await collectKnowledgeSources(entry.rootPath, signal)).revision !== snapshot.revision) throw fail('KNOWLEDGE_CHANGED', '资料在建立索引时发生变化，请重新检索。')
      await fs.writeFile(path.join(stage, 'coverage.json'), JSON.stringify(coverage))
      await fs.writeFile(path.join(stage, 'provenance.json'), JSON.stringify(provenance))
      await fs.rename(stage, destination)
      // Requests are serialized by project owner; old versions are only disposable indexes.
      for (const name of await fs.readdir(projectRoot)) if (/^[a-f0-9]{64}$/.test(name) && name !== cacheKey) await fs.rm(path.join(projectRoot, name), { recursive: true, force: true })
      return { directory: destination, coverage }
    } catch (error) {
      await fs.rm(stage, { recursive: true, force: true })
      if (signal?.aborted) throw signal.reason
      if (error.code && error.status) throw error
      throw fail('KNOWLEDGE_INDEX_FAILED', error.killed ? '资料索引耗时过长，请减少本书片段后重试。' : '资料索引建立失败，请检查资料文件和 Python 3 环境。')
    }
  }
  return { prepare(entry, signal) {
    const key = `${entry.projectId}:${entry.rootPath}`
    const task = (inflight.get(key) || Promise.resolve()).catch(() => {}).then(() => { signal?.throwIfAborted(); return prepare(entry, signal) })
    inflight.set(key, task)
    return task.finally(() => { if (inflight.get(key) === task) inflight.delete(key) })
  } }
}
