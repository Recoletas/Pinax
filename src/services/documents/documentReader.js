// 文档阅读器数据面（W1-B，只读零写入）：
// 两条只读数据轨——
// A. 本地文件夹（主轨）：File System Access API `showDirectoryPicker({mode:'read'})`
//    递归走查项目根的 .md/.json（不锁目录名，天然兼容 kit 编号目录 01-选题/02-编剧/…
//    与 Pinax 模板目录 大纲/剧本/ 并存）；浏览器不支持时回落 <input webkitdirectory>。
//    模式先例：src/components/authoring/AuthoringManuscriptImport.vue + importPipeline.js。
// B. 服务器注册项目（辅轨）：既有只读端点 GET /api/localmirror/projects → /book → /rules
//    （/browse 实测只列目录不列文件，见 server/services/localMirrorService.js:738-766，
//    故文件列举由 A 轨承担；/book 提供 outline.json 结构 + 正文/构思文本，/rules 提供约束）。
// 本模块绝不发 POST/PUT/DELETE——阅读面零写入。
// 仅浏览器使用（依赖 fetch / DOM API），node 冒烟不 import 本文件。

const WALK_LIMITS = Object.freeze({
  maxDepth: 8,
  maxFiles: 500,
  maxFileBytes: 2 * 1024 * 1024
})

const DOC_FILE_RE = /\.(?:md|markdown|json)$/iu

export function isFileSystemAccessAvailable() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** 拉起系统目录选择器（read 模式，不产生任何写权限）；用户取消返回 null。 */
export async function pickProjectDirectory() {
  if (!isFileSystemAccessAvailable()) return null
  try {
    return await window.showDirectoryPicker({ mode: 'read' })
  } catch (error) {
    if (error?.name === 'AbortError') return null
    throw error
  }
}

/**
 * 递归走查目录句柄 → [{ path, name, ext }]（只保留 .md/.markdown/.json，
 * 跳过点目录与常见依赖目录；超限截断并在 result.truncated 记账）。
 */
export async function walkDocumentFiles(handle, options = {}) {
  const limits = { ...WALK_LIMITS, ...options }
  const out = { entries: [], truncated: false }
  async function walk(current, prefix, depth) {
    if (out.truncated) return
    if (depth > limits.maxDepth) {
      out.truncated = true
      return
    }
    for await (const entry of current.values()) {
      if (out.truncated) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      if (entry.kind === 'directory') {
        await walk(entry, `${prefix}${entry.name}/`, depth + 1)
        continue
      }
      if (!DOC_FILE_RE.test(entry.name)) continue
      if (out.entries.length >= limits.maxFiles) {
        out.truncated = true
        return
      }
      let size = 0
      try {
        const file = await entry.getFile()
        size = file.size
        if (size > limits.maxFileBytes) continue
      } catch {
        continue
      }
      out.entries.push({
        path: `${prefix}${entry.name}`,
        name: entry.name,
        ext: entry.name.toLowerCase().endsWith('.json') ? 'json' : 'md',
        size,
        read: async () => {
          const file = await entry.getFile()
          return file.text()
        }
      })
    }
  }
  await walk(handle, '', 0)
  out.entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return out
}

/** webkitdirectory 回落：FileList → 与 walkDocumentFiles 同形状的条目（无 read 句柄，读在 file 上）。 */
export function entriesFromFileList(fileList, options = {}) {
  const limits = { ...WALK_LIMITS, ...options }
  const out = { entries: [], truncated: false }
  for (const file of Array.from(fileList || [])) {
    if (out.entries.length >= limits.maxFiles) {
      out.truncated = true
      break
    }
    const relative = String(file.webkitRelativePath || file.name)
    const segments = relative.split('/')
    if (segments.slice(0, -1).some((segment) => segment.startsWith('.') || segment === 'node_modules')) continue
    if (!DOC_FILE_RE.test(file.name)) continue
    if (file.size > limits.maxFileBytes) continue
    const name = segments[segments.length - 1]
    out.entries.push({
      path: segments.slice(1).join('/') || name,
      name,
      ext: name.toLowerCase().endsWith('.json') ? 'json' : 'md',
      size: file.size,
      read: async () => file.text()
    })
  }
  out.entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return out
}

async function readJson(response) {
  const body = await response.json().catch(() => null)
  return response.ok && body ? body : null
}

/** 注册表（GET /api/localmirror/projects）→ [{projectId,name,kind,rootPath,bookId,...}]。 */
export async function fetchLocalProjects() {
  try {
    const body = await readJson(await fetch('/api/localmirror/projects', { method: 'GET' }))
    return Array.isArray(body?.projects) ? body.projects : []
  } catch {
    return []
  }
}

/**
 * 书读回（GET /api/localmirror/book?path=项目根）→ { ok, book, warnings }：
 * book.outline{nodes,edges} / book.chapters / book.explorations / book.projectRoot。
 * 失败（含公网 403）返回 null，由调用方给降级提示。
 */
export async function fetchProjectBook(rootPath) {
  if (!rootPath) return null
  try {
    const body = await readJson(await fetch(`/api/localmirror/book?path=${encodeURIComponent(rootPath)}`, { method: 'GET' }))
    return body?.ok ? body : null
  } catch {
    return null
  }
}

/** 约束读回（GET /api/localmirror/rules?path=项目根）→ { ok, files, warnings }；失败返回 null。 */
export async function fetchProjectRules(rootPath) {
  if (!rootPath) return null
  try {
    const body = await readJson(await fetch(`/api/localmirror/rules?path=${encodeURIComponent(rootPath)}`, { method: 'GET' }))
    return body?.ok ? body : null
  } catch {
    return null
  }
}
