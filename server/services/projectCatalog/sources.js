import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseWorldbookEntryFile } from '../../../shared/worldbookFileContract.js'
import { normalizeOutlineNode, normalizeOutlineEdge } from '@pinax/core'

export const catalogError = (code, message, details) => Object.assign(new Error(message), { code, details })
export const digest = value => createHash('sha256').update(value).digest('hex')
const directories = ['正文', '世界书', '大纲', '构思', '资料', '约束', '规则', '文风']
const maxFileBytes = 16 * 1024 * 1024
const maxTotalBytes = 64 * 1024 * 1024
const worldbookAuxiliary = new Set(['世界书/纪律.md', '世界书/伏笔/台账.md', '世界书/底牌/暗线底牌.md', '世界书/编年/章账.md'])

export function fingerprint(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
}

// lstat every ancestor as well as the leaf: a directory symlink must never
// silently expand the source set or redirect SQLite/WAL writes outside .pinax.
export function safePath(root, relative, { missing = false } = {}) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..' || !part)) {
    throw catalogError('CATALOG_PATH', '目录路径必须是项目内的相对路径', { relative })
  }
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    let stat
    try { stat = fs.lstatSync(current) } catch (error) {
      if (missing && error.code === 'ENOENT') return path.join(root, relative)
      throw error
    }
    if (stat.isSymbolicLink()) throw catalogError('CATALOG_SYMLINK', '派生目录拒绝符号链接', { relative })
  }
  return current
}

export function scanSources(root) {
  const files = []
  let bytes = 0
  function walk(relative, depth) {
    if (depth > 12) throw catalogError('CATALOG_LIMIT', '目录深度超过 12 层')
    let stat
    try { stat = fs.lstatSync(path.join(root, relative), { bigint: true }) } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink()) throw catalogError('CATALOG_SYMLINK', '索引来源包含符号链接', { relative })
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(path.join(root, relative)).sort()) walk(`${relative}/${name}`, depth + 1)
      return
    }
    if (!stat.isFile() || !/\.(md|txt)$/i.test(relative) && relative !== '大纲/outline.json' && !/^资料\/归档\/[^/]+\.json$/.test(relative)) return
    bytes += Number(stat.size)
    if (stat.size > BigInt(maxFileBytes) || bytes > maxTotalBytes || files.length >= 2000) {
      throw catalogError('CATALOG_LIMIT', '超过目录容量（单文件 16MB / 总计 64MB / 2000 文件）')
    }
    files.push({ relative, fingerprint: fingerprint(stat), byteLength: Number(stat.size) })
  }
  for (const directory of directories) walk(directory, 0)
  return files
}

export function readSource(root, file) {
  const target = safePath(root, file.relative)
  const handle = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    if (fingerprint(fs.fstatSync(handle, { bigint: true })) !== file.fingerprint) throw catalogError('CATALOG_SOURCE_CHANGED', '文件读取前已变化，请重试', { path: file.relative })
    const bytes = fs.readFileSync(handle)
    if (fingerprint(fs.fstatSync(handle, { bigint: true })) !== file.fingerprint || fingerprint(fs.lstatSync(target, { bigint: true })) !== file.fingerprint) {
      throw catalogError('CATALOG_SOURCE_CHANGED', '文件读取期间发生变化，请重试', { path: file.relative })
    }
    return { text: bytes.toString('utf8'), hash: digest(bytes) }
  } finally { fs.closeSync(handle) }
}

function titleOf(relative) {
  return path.posix.basename(relative).replace(/\.(md|txt)$/i, '').replace(/^\d+-/, '')
}
function record(kind, id, title, content, data = {}) {
  if (typeof id !== 'string' || !id.trim()) throw catalogError('CATALOG_RECORD_INVALID', '索引条目缺少 id', { kind })
  const tags = [...(Array.isArray(data.tags) ? data.tags : []), ...(Array.isArray(data.keys) ? data.keys : [])].map(String).join(' ')
  return { kind, id, title: String(title || ''), content: String(content || ''), tags, data: { ...data, id } }
}

export function parseSource(relative, text) {
  const content = text.replace(/\r\n/g, '\n')
  const title = titleOf(relative)
  // File-backed plain text has a path identity. Never invent the browser book's
  // chapter/note IDs or equate an exploration document to a global NoteStore note.
  if (relative.startsWith('正文/')) return { items: [record('chapter', relative, title, content, { title, content, contentFormat: 'md' })], warnings: [] }
  if (relative.startsWith('世界书/')) {
    if (worldbookAuxiliary.has(relative) || /^(?:README|00-索引|00-知识图谱)\.md$/i.test(path.posix.basename(relative))) {
      return { items: [record('document', relative, title, content)], warnings: [] }
    }
    const parsed = parseWorldbookEntryFile(content)
    if (!parsed.ok) return { items: [record('document', relative, title, content)], warnings: [{ path: relative, code: parsed.error.code, message: '未作为世界书条目收录；仍可全文检索' }] }
    const entry = parsed.entry
    return { items: [record('worldbook-entry', entry.id, entry.name, entry.content, entry)], warnings: [] }
  }
  if (relative === '大纲/outline.json') {
    const outline = JSON.parse(content)
    if (!Array.isArray(outline.nodes) || !Array.isArray(outline.edges)) throw catalogError('CATALOG_OUTLINE_INVALID', 'outline.json 必须有 nodes/edges 数组')
    const items = outline.nodes.map(raw => {
      const node = normalizeOutlineNode(raw)
      if (!node) throw catalogError('CATALOG_OUTLINE_INVALID', '大纲节点缺少 id')
      return record('outline-node', node.id, node.title, node.intent || raw.summary || raw.description || '', node)
    })
    const edges = outline.edges.map((raw, index) => {
      // Old exports have no edge id; the projection uses a deterministic local
      // identifier without altering the author's outline.json.
      const edge = normalizeOutlineEdge({ ...raw, id: raw.id || `file-edge:${index}`, fromNodeId: raw.fromNodeId ?? raw.from ?? raw.source, toNodeId: raw.toNodeId ?? raw.to ?? raw.target })
      if (!edge) throw catalogError('CATALOG_OUTLINE_INVALID', '大纲边端点缺失或自环', { index })
      return edge
    })
    return { items: [...items, ...edges.map(edge => record('outline-edge', edge.id, edge.label || edge.kind, '', edge))], edges, warnings: [] }
  }
  if (/^资料\/归档\/[^/]+\.json$/.test(relative)) {
    const archive = JSON.parse(content)
    if (!archive.docId || !Array.isArray(archive.chunks)) throw catalogError('CATALOG_ARCHIVE_INVALID', '资料归档缺少 docId/chunks', { path: relative })
    return { items: [record('source-document', String(archive.docId), archive.meta?.title || title, archive.chunks.map(chunk => String(chunk.text ?? chunk.content ?? '')).join('\n\n'), { ...archive.meta, docId: archive.docId })], warnings: [] }
  }
  const kind = relative.startsWith('构思/') ? 'exploration' : /^(约束|规则|文风)\//.test(relative) ? 'rule' : relative.startsWith('资料/') ? 'material-file' : 'document'
  return { items: [record(kind, relative, title, content, { title, content })], warnings: [] }
}
