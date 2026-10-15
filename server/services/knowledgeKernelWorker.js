import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'

const { runtimeRoot, projectDirectory, verb, args } = workerData
try {
  const { NodeFsAdapter } = await import(pathToFileURL(path.join(runtimeRoot, 'adapters/dist/node.js')).href)
  const { Kernel } = await import(pathToFileURL(path.join(runtimeRoot, 'core/dist/kernel.js')).href)
  const { VERB_BY_NAME } = await import(pathToFileURL(path.join(runtimeRoot, 'core/dist/verbs.js')).href)
  if (!['kb_search', 'kb_read', 'worldbook_search'].includes(verb)) throw new Error('只允许知识读取操作。')
  const roots = ['knowledge', 'kit', 'assertion-presets'].map(name => path.join(runtimeRoot, name))
  if (projectDirectory) roots.push(projectDirectory)
  const permitted = file => {
    const resolved = path.resolve(file)
    if (!roots.some(root => resolved === root || resolved.startsWith(root + path.sep))) return false
    try {
      const actual = fs.realpathSync(resolved)
      return roots.some(root => actual === root || actual.startsWith(root + path.sep))
    } catch { return false }
  }
  const disk = new NodeFsAdapter()
  const readOnlyFs = new Proxy(disk, { get(target, name) {
    if (!['exists', 'stat', 'readText', 'readBuffer', 'readDir', 'readDirEntries'].includes(name)) return () => { throw new Error('知识内核不可写文件。') }
    return file => {
      if (!permitted(file)) {
        if (name === 'exists') return false
        if (name === 'stat') return undefined
        throw new Error('知识引用超出资料目录或已失效。')
      }
      return target[name](file)
    }
  } })
  const kernel = new Kernel({ root: runtimeRoot, repoRoot: runtimeRoot, fs: readOnlyFs })
  if (projectDirectory) kernel.projectDir = () => projectDirectory
  if (verb === 'kb_read') {
    const graph = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'kit/hypergraph.rag.json'), 'utf8'))
    args.ref = String(args.ref).replace(/^knowledge\//, '')
    const item = graph.entries?.find(item => item.id === args.ref)
    if (item && permitted(path.join(runtimeRoot, String(item.path)))) args.ref = String(item.path).replace(/^knowledge\//, '')
  }
  const result = await VERB_BY_NAME[verb].run(kernel, args)
  const globalRoot = path.join(runtimeRoot, 'knowledge')
  const safeFile = (base, relative) => {
    const resolved = path.resolve(base, String(relative).replace(/^knowledge\//, ''))
    return resolved.startsWith(base + path.sep) && permitted(resolved) && fs.statSync(resolved).isFile()
  }
  let provenance = {}
  if (projectDirectory) provenance = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'provenance.json'), 'utf8'))
  if (Array.isArray(result.hits) && verb === 'kb_search') result.hits = result.hits.map(hit => ({ ...hit, readRef: hit.file, contentAvailable: safeFile(hit.source === 'project' ? projectDirectory : globalRoot, hit.file), ...(provenance[hit.file] ? { provenance: provenance[hit.file] } : {}) }))
  if (verb === 'kb_read' && provenance[result.file]) result.provenance = provenance[result.file]
  parentPort.postMessage({ result })
} catch (error) { parentPort.postMessage({ error: { code: error.code || 'KNOWLEDGE_READ_FAILED', message: String(error.message || error), status: error.status || 422 } }) }
