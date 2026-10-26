import fs from 'node:fs'
import path from 'node:path'
import {
  KIND_TEMPLATES,
  PROJECT_SPEC,
  createLocalMirrorService,
  parseWorldbookEntryFile,
  sanitizeFilename,
  serializeWorldbookEntryFile
} from '../services/localMirrorService.js'
import { assertLocalRoute, resolveProject } from './localProjects.js'

// MCP 填充工具（作者给定的既有文本导入，不生成内容）：
// 只允许本地项目文件夹，只写 正文/ 约束/ 世界书/ 与 .pinax/project.json，
// 默认不覆盖已有文件；覆盖必须显式 overwrite:true，且永远不碰源目录。
const service = createLocalMirrorService()

const MAX_RULE_FILES = 8
const MAX_RULE_CHARS = 50000
const MAX_CHAPTER_CHARS = 500000
const MAX_WORLDBOOK_CHARS = 200000
const WORLD_BOOK_DIRS = Object.freeze({
  character: '人物',
  location: '地理',
  organization: '势力',
  event: '编年',
  source: '资料'
})
const DEFAULT_WORLDBOOK_DIR = '设定'

function failure(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim()
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function ensureDir(dir, code) {
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) throw failure(code, `路径已存在但不是目录：${dir}`)
    return
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (error) {
    throw failure(code, `目录创建失败：${error.message}`)
  }
}

function readIfFile(file) {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null
    return fs.readFileSync(file, 'utf-8').replace(/\r\n?/g, '\n').trim()
  } catch {
    return null
  }
}

function writeText(file, text, { overwrite = false } = {}) {
  try {
    fs.writeFileSync(file, text, { encoding: 'utf-8', flag: overwrite ? 'w' : 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') throw failure('ERR_FILE_EXISTS', `文件已存在：${file}`)
    throw failure('ERR_WRITE_FAILED', `写入失败：${error.message}`, { cause: error.code || null })
  }
}

function ruleKindOfName(name) {
  if (/禁用|禁词|黑名单|避雷/u.test(name)) return 'forbidden'
  if (/文风|文笔|风格|语气/u.test(name)) return 'style'
  if (/备注|说明|提示/u.test(name)) return 'note'
  return 'rule'
}

function projectSummary(resolved) {
  const { root, manifest, entry } = resolved
  return {
    projectId: manifest?.projectId || entry?.projectId || null,
    name: manifest?.name || entry?.name || path.basename(root),
    kind: manifest?.kind || entry?.kind || 'generic',
    rootPath: root,
    registered: Boolean(entry)
  }
}

/** 初始化本地项目：空目录写 manifest + 骨架目录并登记注册表；已有项目原样返回不改动。 */
export function initProject({ projectPath, name, kind = 'novel', projectId } = {}) {
  assertLocalRoute()
  const requested = typeof projectPath === 'string' ? projectPath.trim() : ''
  if (!requested) throw failure('ERR_PROJECT_REQUIRED', '请提供 projectPath（项目文件夹绝对路径）。')
  if (!path.isAbsolute(requested)) throw failure('ERR_PATH_NOT_ABSOLUTE', 'projectPath 必须是绝对路径。')
  if (requested.includes('..')) throw failure('ERR_PATH_INVALID', 'projectPath 不允许包含 ..。')
  const root = path.resolve(requested)
  if (fs.existsSync(root) && !fs.statSync(root).isDirectory()) {
    throw failure('ERR_DIR_INVALID', `目标路径不是目录：${root}`)
  }
  const marker = path.join(root, '.pinax', 'project.json')
  if (fs.existsSync(marker)) {
    const resolved = resolveProject({ projectPath: root })
    return {
      created: false,
      project: projectSummary(resolved),
      dirs: [],
      warnings: ['项目已存在 .pinax/project.json，未改动任何文件。']
    }
  }
  if (!KIND_TEMPLATES[kind]) {
    throw failure('ERR_KIND_INVALID', `未知项目类型 ${kind}（可用：${Object.keys(KIND_TEMPLATES).join('/')}）。`)
  }
  const cleanName = sanitizeFilename(name, '')
  if (!cleanName) throw failure('ERR_NAME_REQUIRED', '新建项目必须提供 name。')
  const id = String(projectId || '').trim() || `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  ensureDir(root, 'ERR_DIR_WRITE_FAILED')
  ensureDir(path.join(root, '.pinax'), 'ERR_DIR_WRITE_FAILED')
  const stamp = new Date().toISOString()
  const manifest = {
    schemaVersion: 1,
    spec: PROJECT_SPEC,
    projectId: id,
    name: cleanName,
    kind,
    createdAt: stamp,
    updatedAt: stamp
  }
  writeText(marker, JSON.stringify(manifest, null, 2) + '\n')
  const dirs = KIND_TEMPLATES[kind].slice()
  for (const dir of dirs) ensureDir(path.join(root, dir), 'ERR_DIR_WRITE_FAILED')

  const warnings = []
  let entry = null
  try {
    entry = service.openProjectAt({ rootPath: root }).entry
  } catch (error) {
    warnings.push(`项目已创建，但登记注册表失败（${error.message}），可用 projectPath 继续访问。`)
  }
  return {
    created: true,
    project: {
      projectId: manifest.projectId,
      name: manifest.name,
      kind: manifest.kind,
      rootPath: root,
      registered: Boolean(entry)
    },
    dirs,
    warnings
  }
}

/** 写约束文件（约束/ 上限 8 个）；同名同内容复用，内容不同默认拒绝。 */
export function writeRule({ projectPath, projectId, name, content, overwrite = false } = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const cleanName = sanitizeFilename(name, '')
  if (!cleanName) throw failure('ERR_NAME_REQUIRED', '请提供约束文件名 name。')
  const text = normalizeText(content)
  if (!text) throw failure('ERR_CONTENT_REQUIRED', '请提供约束正文 content。')
  if (text.length > MAX_RULE_CHARS) {
    throw failure('ERR_CONTENT_TOO_LARGE', `约束正文超过 ${MAX_RULE_CHARS} 字上限。`)
  }

  const dir = path.join(resolved.root, '约束')
  ensureDir(dir, 'ERR_RULE_DIR_FAILED')
  const files = fs.readdirSync(dir)
    .filter((file) => /\.(?:md|txt)$/iu.test(file))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
  const target = path.join(dir, `${cleanName}.md`)
  const existing = readIfFile(target)
  const payload = `${text}\n`

  if (existing !== null) {
    if (existing === text) {
      return {
        created: false,
        reused: true,
        file: relative(resolved.root, target),
        kind: ruleKindOfName(cleanName),
        chars: text.length,
        ruleCount: files.length,
        warnings: ['同名同内容约束已存在，未重复写入。']
      }
    }
    if (!overwrite) {
      throw failure('ERR_RULE_EXISTS', `约束 ${cleanName} 已存在且内容不同；确认覆盖请传 overwrite:true。`)
    }
    writeText(target, payload, { overwrite: true })
    return {
      created: false,
      updated: true,
      file: relative(resolved.root, target),
      kind: ruleKindOfName(cleanName),
      chars: text.length,
      ruleCount: files.length,
      warnings: ['已覆盖同名约束文件。']
    }
  }

  if (files.length >= MAX_RULE_FILES) {
    throw failure('ERR_RULE_LIMIT', `约束文件已达 ${MAX_RULE_FILES} 个上限，未写入「${cleanName}」。`)
  }
  writeText(target, payload)
  return {
    created: true,
    file: relative(resolved.root, target),
    kind: ruleKindOfName(cleanName),
    chars: text.length,
    ruleCount: files.length + 1,
    warnings: []
  }
}

function scanWorldbook(root) {
  const dir = path.join(root, '世界书')
  const out = []
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out
  const walk = (current) => {
    for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, dirent.name)
      if (dirent.isDirectory()) {
        if (dirent.name !== '.kb') walk(full)
        continue
      }
      if (!/\.md$/iu.test(dirent.name)) continue
      let text = ''
      try { text = fs.readFileSync(full, 'utf-8') } catch { continue }
      const parsed = parseWorldbookEntryFile(text)
      if (parsed.ok) out.push({ file: full, relPath: relative(root, full), entry: parsed.entry, text })
    }
  }
  walk(dir)
  return out
}

/** 写世界书条目：按契约 v2 序列化到 世界书/<分类>/<名称>.md；默认不覆盖。 */
export function writeWorldbookEntry({
  projectPath,
  projectId,
  name,
  content,
  type = 'general',
  id,
  keys = [],
  tags = [],
  summary,
  overwrite = false
} = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const cleanName = String(name || '').trim()
  if (!cleanName) throw failure('ERR_NAME_REQUIRED', '请提供世界书条目 name。')
  const text = normalizeText(content)
  if (!text) throw failure('ERR_CONTENT_REQUIRED', '请提供世界书条目正文 content。')
  if (text.length > MAX_WORLDBOOK_CHARS) {
    throw failure('ERR_CONTENT_TOO_LARGE', `世界书条目超过 ${MAX_WORLDBOOK_CHARS} 字上限。`)
  }
  const wantedType = String(type || 'general').trim() || 'general'
  if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(wantedType)) {
    throw failure('ERR_TYPE_INVALID', `type 必须是小写字母开头的短标识（实际：${wantedType}）。`)
  }
  const entryId = String(id || '').trim() || `mcp/${resolved.manifest?.projectId || 'project'}/${cleanName}`
  const catDir = WORLD_BOOK_DIRS[wantedType] || DEFAULT_WORLDBOOK_DIR
  const entry = {
    id: entryId,
    name: cleanName,
    type: wantedType,
    kind: wantedType,
    status: 'active',
    tags: Array.isArray(tags) ? tags.map(String) : [],
    keys: Array.isArray(keys) ? keys.map(String) : [],
    cat: [catDir],
    summary: String(summary || '').trim(),
    content: text,
    updatedAt: today()
  }
  const payload = serializeWorldbookEntryFile(entry)

  const existing = scanWorldbook(resolved.root)
  const hit = existing.find((item) => item.entry.name === cleanName || item.entry.id === entryId) || null
  if (hit) {
    if (normalizeText(hit.entry.content) === text) {
      return {
        created: false,
        reused: true,
        entry: { id: hit.entry.id, name: hit.entry.name, type: hit.entry.type },
        file: hit.relPath,
        chars: text.length,
        warnings: ['同名同内容世界书条目已存在，未重复写入。']
      }
    }
    if (!overwrite) {
      throw failure('ERR_ENTRY_EXISTS', `世界书已有「${cleanName}」（${hit.relPath}）且内容不同；确认覆盖请传 overwrite:true。`)
    }
    writeText(hit.file, payload, { overwrite: true })
    return {
      created: false,
      updated: true,
      entry: { id: entryId, name: cleanName, type: wantedType },
      file: hit.relPath,
      chars: text.length,
      warnings: ['已覆盖同名世界书条目（保留原落位文件）。']
    }
  }

  const dir = path.join(resolved.root, '世界书', catDir)
  ensureDir(dir, 'ERR_WORLDBOOK_DIR_FAILED')
  const target = path.join(dir, `${sanitizeFilename(cleanName)}.md`)
  if (readIfFile(target) !== null) {
    if (!overwrite) {
      throw failure('ERR_ENTRY_EXISTS', `目标文件已存在：${relative(resolved.root, target)}；确认覆盖请传 overwrite:true。`)
    }
    writeText(target, payload, { overwrite: true })
  } else {
    writeText(target, payload)
  }
  return {
    created: true,
    entry: { id: entryId, name: cleanName, type: wantedType },
    file: relative(resolved.root, target),
    chars: text.length,
    warnings: []
  }
}

function chapterFiles(root) {
  const dir = path.join(root, '正文')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => /\.(?:md|txt)$/iu.test(name))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
}

/** 导入一章既有正文（不生成内容）：写 正文/NNN-标题.md；默认不覆盖。 */
export function importChapter({
  projectPath,
  projectId,
  title,
  content,
  chapterNumber,
  overwrite = false
} = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const text = normalizeText(content)
  if (!text) throw failure('ERR_CONTENT_REQUIRED', '请提供章节正文 content。')
  if (text.length > MAX_CHAPTER_CHARS) {
    throw failure('ERR_CONTENT_TOO_LARGE', `章节正文超过 ${MAX_CHAPTER_CHARS} 字上限。`)
  }
  const files = chapterFiles(resolved.root)
  if (files.length >= 500) throw failure('ERR_CHAPTER_LIMIT', '章节数已达 500 上限。')

  let number = chapterNumber === undefined || chapterNumber === null ? null : Number(chapterNumber)
  if (number !== null && (!Number.isInteger(number) || number < 1 || number > 500)) {
    throw failure('ERR_CHAPTER_NUMBER_INVALID', 'chapterNumber 必须是 1–500 的整数。')
  }
  if (number === null) {
    const used = files.map((file) => Number(/^(\d+)-/.exec(file)?.[1] || 0))
    number = Math.max(0, ...used) + 1
  }
  const cleanTitle = sanitizeFilename(title, `章节${number}`)
  const fileName = `${String(number).padStart(3, '0')}-${cleanTitle}.md`
  const target = path.join(resolved.root, '正文', fileName)
  ensureDir(path.join(resolved.root, '正文'), 'ERR_CHAPTER_DIR_FAILED')
  const existingFile = chapterFiles(resolved.root).find((name) => name.startsWith(`${String(number).padStart(3, '0')}-`))
  const existing = existingFile ? readIfFile(path.join(resolved.root, '正文', existingFile)) : null

  if (existingFile) {
    if (existing === text) {
      return {
        created: false,
        reused: true,
        chapter: { number, title: cleanTitle, file: `正文/${existingFile}`, chars: text.length },
        warnings: ['同序号同内容章节已存在，未重复写入。']
      }
    }
    if (!overwrite) {
      throw failure('ERR_CHAPTER_EXISTS', `正文/${existingFile} 已存在且内容不同；确认覆盖请传 overwrite:true。`)
    }
    writeText(path.join(resolved.root, '正文', existingFile), `${text}\n`, { overwrite: true })
    return {
      created: false,
      updated: true,
      chapter: { number, title: cleanTitle, file: `正文/${existingFile}`, chars: text.length },
      warnings: ['已覆盖同序号章节文件。']
    }
  }

  writeText(target, `${text}\n`)
  return {
    created: true,
    chapter: { number, title: cleanTitle, file: `正文/${fileName}`, chars: text.length },
    warnings: []
  }
}
