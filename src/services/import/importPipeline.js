// 全局导入管线：文件夹选择 → 递归走查 → 一书+资料分类 → 解析/归档。
// 「一书+资料」语义：根目录的 .txt/.md/.markdown 合并为一本书（文件名=章节名，按序拼接）；
// 子目录所有文件与根目录的 .pdf/.docx/.epub 归为资料（走世界书源档案解析/归档）。
// 纯函数（walk/classify）不碰 DOM，可在 node smoke 中以合成 entries 测试。
import { parseManuscriptText, createImportedWritingBook, decodeManuscriptBytes, MANUSCRIPT_IMPORT_LIMITS } from '../writing/writingManuscriptImport.js'

export const IMPORT_PIPELINE_LIMITS = Object.freeze({
  maxFiles: 200,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxDepth: 8
})

const SKIP_DIR_NAMES = new Set(['.pinax', 'node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'])
const BOOK_EXTENSIONS = /\.(?:txt|md|markdown)$/iu
const MATERIAL_EXTENSIONS = /\.(?:pdf|docx|epub)$/iu

export function isBookFile(name, depth = 0) {
  return depth === 0 && BOOK_EXTENSIONS.test(String(name || ''))
}

export function isMaterialFile(name, depth = 0) {
  if (depth > 0) return /\.(?:txt|md|markdown|pdf|docx|epub)$/iu.test(String(name || ''))
  return MATERIAL_EXTENSIONS.test(String(name || ''))
}

/** FS Access 目录句柄递归走查 → 统一 entry { path, name, size, file: async () => File }。 */
export async function walkDirectoryHandle(handle, { prefix = '', depth = 0, limits = IMPORT_PIPELINE_LIMITS, out = { entries: [], skipped: [] } } = {}) {
  if (depth > limits.maxDepth) {
    out.skipped.push({ path: prefix || handle.name, reason: 'depth-exceeded' })
    return out
  }
  for await (const entry of handle.values()) {
    if (out.entries.length >= limits.maxFiles) {
      out.skipped.push({ path: `${prefix}${entry.name}`, reason: 'file-limit' })
      continue
    }
    if (entry.kind === 'directory') {
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue
      await walkDirectoryHandle(entry, { prefix: `${prefix}${entry.name}/`, depth: depth + 1, limits, out })
      continue
    }
    const file = await entry.getFile()
    if (file.size > limits.maxFileBytes) {
      out.skipped.push({ path: `${prefix}${entry.name}`, reason: 'file-too-large' })
      continue
    }
    out.entries.push({ path: `${prefix}${entry.name}`, name: entry.name, size: file.size, depth, file: () => file })
  }
  return out
}

/** webkitdirectory <input> 的 FileList 走查：File.webkitRelativePath 自带「文件夹/相对路径」。 */
export function walkDirectoryFiles(fileList, { limits = IMPORT_PIPELINE_LIMITS } = {}) {
  const out = { entries: [], skipped: [] }
  for (const file of Array.from(fileList || [])) {
    if (out.entries.length >= limits.maxFiles) {
      out.skipped.push({ path: file.name, reason: 'file-limit' })
      continue
    }
    if (file.size > limits.maxFileBytes) {
      out.skipped.push({ path: file.name, reason: 'file-too-large' })
      continue
    }
    const relative = String(file.webkitRelativePath || file.name)
    const segments = relative.split('/')
    const depth = Math.max(0, segments.length - 2)
    if (segments.slice(0, -1).some((segment) => SKIP_DIR_NAMES.has(segment) || segment.startsWith('.'))) continue
    out.entries.push({ path: relative, name: file.name, size: file.size, depth, file: () => file })
  }
  return out
}

/** 一书+资料分类：根目录书稿（txt/md/markdown，按路径排序）与资料（子目录全部 + 根目录 pdf/docx/epub）。 */
export function classifyImportEntries(entries) {
  const list = Array.isArray(entries) ? entries : []
  const bookEntries = list
    .filter((entry) => entry.depth === 0 && BOOK_EXTENSIONS.test(entry.name))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const materialEntries = list.filter((entry) => !bookEntries.includes(entry) && (entry.depth > 0 || MATERIAL_EXTENSIONS.test(entry.name)))
  return { bookEntries, materialEntries }
}

/**
 * 文件夹 → 一本书 + 资料归档。
 * bookEntries 根目录 txt/md 合并（文件名=章节名，内容再按章节标题切分）；
 * materialEntries 走世界书源档案解析（txt/md/pdf/docx/epub，IndexedDB 归档）。
 */
export async function importFolderAsBook({ folderName = '', entries, manuscriptLanguage = '', sourceParse = null } = {}) {
  const { bookEntries, materialEntries } = classifyImportEntries(entries)
  if (!bookEntries.length) {
    return { ok: false, reason: 'no-book-files', message: '文件夹根目录没有可作书稿的 .txt/.md 文件。' }
  }

  const chapters = []
  let totalChars = 0
  const warnings = []
  for (const entry of bookEntries) {
    const bytes = new Uint8Array(await entry.file().arrayBuffer())
    const decoded = decodeManuscriptBytes(bytes)
    if (!decoded.ok) {
      warnings.push(`${entry.path}：${decoded.message}`)
      continue
    }
    const chapterTitle = entry.name.replace(/\.[^.]+$/u, '').trim() || `章节 ${chapters.length + 1}`
    const parsed = parseManuscriptText({ text: decoded.text, filename: entry.name, manuscriptLanguage })
    const parsedChapters = parsed?.ok && Array.isArray(parsed.chapters) && parsed.chapters.length ? parsed.chapters : [{ title: chapterTitle, content: decoded.text }]
    if (parsedChapters.length > 1) {
      // 单文件多章：保留文件名作卷前缀，避免跨文件章节名冲突
      for (const chapter of parsedChapters) {
        chapters.push({ title: `${chapterTitle} · ${chapter.title}`.slice(0, 120), content: chapter.content })
      }
    } else {
      chapters.push({ title: chapterTitle, content: parsedChapters[0].content })
    }
    totalChars += decoded.text.length
    if (totalChars > MANUSCRIPT_IMPORT_LIMITS.maxChars) {
      return { ok: false, reason: 'too-large', message: `书稿总量超过 ${MANUSCRIPT_IMPORT_LIMITS.maxChars} 字符上限。` }
    }
  }
  if (!chapters.length) {
    return { ok: false, reason: 'chapters-required', message: '书稿文件都未能解析出正文。' }
  }
  const created = createImportedWritingBook({ title: String(folderName || '导入书稿').replace(/\.[^.]+$/u, ''), chapters, manuscriptLanguage })
  if (!created.ok) return created

  let archivedSources = []
  const materialFiles = materialEntries.map((entry) => entry.file())
  if (materialFiles.length) {
    try {
      const tools = await loadMaterialTools()
      const parse = sourceParse || tools.parseSourceFilesWithWorker
      const parsedMaterials = await parse(materialFiles, {})
      if (Array.isArray(parsedMaterials?.results) && parsedMaterials.results.length) {
        archivedSources = await tools.archiveSourceDocuments(parsedMaterials.results.map((result) => ({
          title: result.title || result.filename || '导入资料',
          kind: result.kind || 'reference-text',
          content: result.content || result.text || '',
          sourceLabel: '文件夹导入'
        })))
      }
    } catch (error) {
      warnings.push(`资料归档失败（不影响书稿）：${error?.message || error}`)
    }
  }

  return { ok: true, book: created.book, archivedSources, warnings, stats: { bookFiles: bookEntries.length, materialFiles: materialEntries.length, chapters: chapters.length } }
}

/** 确认导入后再归档资料（UI 流：选择时只分类，确认才写 IndexedDB）。 */
export async function archiveMaterialEntries(materialEntries) {
  const files = (Array.isArray(materialEntries) ? materialEntries : []).map((entry) => entry.file())
  if (!files.length) return []
  const { parseSourceFilesWithWorker, archiveSourceDocuments } = await loadMaterialTools()
  const parsedMaterials = await parseSourceFilesWithWorker(files, {})
  if (!Array.isArray(parsedMaterials?.results) || !parsedMaterials.results.length) return []
  return archiveSourceDocuments(parsedMaterials.results.map((result) => ({
    title: result.title || result.filename || '导入资料',
    kind: result.kind || 'reference-text',
    content: result.content || result.text || '',
    sourceLabel: '文件夹导入'
  })))
}

// 世界书源档案链（Vite 相对导入无扩展名）在调用期才加载——保持本模块纯函数面可在 node smoke 中独立运行
async function loadMaterialTools() {
  const [{ parseSourceFilesWithWorker }, { archiveSourceDocuments }] = await Promise.all([
    import('../worldbook/worldbookSourceParser.js'),
    import('../worldbook/worldbookSourceArchive.js')
  ])
  return { parseSourceFilesWithWorker, archiveSourceDocuments }
}
