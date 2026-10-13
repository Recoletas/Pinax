import fs from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { createKnowledgeProjectIndexer, collectKnowledgeSources } from './knowledgeProjectIndex.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
export function createKnowledgeRuntime({ runtimeRoot = process.env.PINAX_KNOWLEDGE_RUNTIME || path.join(root, '.runtime/knowledge'), cacheRoot = path.join(root, '.runtime/data/knowledge') } = {}) {
  runtimeRoot = path.resolve(runtimeRoot)
  const indexer = createKnowledgeProjectIndexer({ runtimeRoot, cacheRoot })
  const queues = new Map()
  async function execute(verb, args, entry, signal) {
    try { await fs.access(path.join(runtimeRoot, 'core/dist/verbs.js')) } catch {
      throw Object.assign(new Error('本机知识内核尚未安装，请运行 npm run build:knowledge-runtime。'), { code: 'KNOWLEDGE_RUNTIME_MISSING', status: 503 })
    }
    const prepared = entry ? await indexer.prepare(entry, signal) : null
    signal.throwIfAborted()
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./knowledgeKernelWorker.js', import.meta.url), { execArgv: [], workerData: { runtimeRoot, projectDirectory: prepared?.directory, verb, args } })
      const abort = () => { void worker.terminate(); reject(signal.reason) }
      signal.addEventListener('abort', abort, { once: true })
      worker.once('exit', () => signal.removeEventListener('abort', abort))
      const timer = setTimeout(() => { void worker.terminate(); reject(Object.assign(new Error('知识检索超时，请缩小范围后重试。'), { code: 'KNOWLEDGE_TIMEOUT', status: 504 })) }, 15000)
      worker.once('message', value => { clearTimeout(timer); void worker.terminate(); value.error ? reject(Object.assign(new Error(value.error.message), value.error)) : resolve(value.result) })
      worker.once('error', error => { clearTimeout(timer); reject(error) })
      worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(Object.assign(new Error('知识内核执行中断。'), { code: 'KNOWLEDGE_WORKER_EXIT', status: 503 })) })
    })
    if (entry && (await collectKnowledgeSources(entry.rootPath, signal)).revision !== prepared.coverage.indexRevision) throw Object.assign(new Error('资料在检索期间更新，请重新检索。'), { code: 'KNOWLEDGE_CHANGED', status: 409 })
    return { ...result, coverage: { ...(prepared?.coverage || { projectCards: 0 }), engine: 'storyflow', globalSources: 'installed-cards-or-published-metadata' } }
  }
  let pending = 0
  return { run(verb, args, entry, { signal = AbortSignal.timeout(60000) } = {}) {
    if (pending >= 8) return Promise.reject(Object.assign(new Error('知识检索正在处理其他请求，请稍后重试。'), { code: 'KNOWLEDGE_BUSY', status: 429 }))
    pending++
    const key = entry?.projectId || 'global'
    const task = (queues.get(key) || Promise.resolve()).catch(() => {}).then(() => { signal.throwIfAborted(); return execute(verb, args, entry, signal) })
    queues.set(key, task)
    return task.finally(() => { pending--; if (queues.get(key) === task) queues.delete(key) })
  } }
}
