import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertInsideProject, readChapter, resolveProject } from './localProjects.js'

// 批次 4：审阅档写回。只新增 <项目>/.pinax/proposals/*.json，绝不改 正文/ 原稿，
// 也不改 .pinax/project.json。提案是纯文件产物，等作者看过再自己决定是否落稿。
export const PROPOSAL_SCHEMA = 'pinax-proposal@1'
export const PROPOSAL_DIR = path.join('.pinax', 'proposals')
const MAX_CONTENT_CHARS = 200000

function failure(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra })
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim()
}

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function proposalFile(dir, chapterIndex, hash8) {
  if (!fs.existsSync(dir)) return null
  const suffix = `-ch${chapterIndex}-${hash8}.json`
  const hit = fs.readdirSync(dir).find((name) => name.endsWith(suffix))
  return hit ? path.join(dir, hit) : null
}

/** 生成审阅提案：不改原稿；同章节同内容的提案已存在时直接复用，不重复落盘。 */
export function writeChapterProposal({
  projectPath,
  projectId,
  chapterIndex,
  chapterTitle,
  content,
  note,
  expert,
  requestId
} = {}) {
  const resolved = resolveProject({ projectPath, projectId })
  const text = normalizeText(content)
  if (!text) throw failure('ERR_CONTENT_REQUIRED', '请提供要写入提案的正文 content。')
  if (text.length > MAX_CONTENT_CHARS) {
    throw failure('ERR_CONTENT_TOO_LARGE', `提案正文超过 ${MAX_CONTENT_CHARS} 字上限。`)
  }
  const hasChapterRef = (chapterIndex !== undefined && chapterIndex !== null)
    || (typeof chapterTitle === 'string' && chapterTitle.trim())
  if (!hasChapterRef) {
    throw failure('ERR_CHAPTER_REQUIRED', '写提案必须指定 chapterIndex 或 chapterTitle，不做整书覆盖。')
  }

  const chapter = readChapter(resolved.root, {
    index: chapterIndex,
    title: chapterTitle,
    maxChars: MAX_CONTENT_CHARS
  })
  if (normalizeText(chapter.content) === text) {
    throw failure('ERR_PROPOSAL_UNCHANGED', `提案内容与「${chapter.title}」原文相同，未写入。`)
  }

  const hash8 = createHash('sha256').update(text).digest('hex').slice(0, 8)
  const dir = path.join(resolved.root, PROPOSAL_DIR)
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
    throw failure('ERR_PROPOSAL_DIR_INVALID', `.pinax/proposals 已存在但不是目录，无法写入提案。`)
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (error) {
    throw failure('ERR_PROPOSAL_WRITE_FAILED', `提案目录创建失败：${error.message}`)
  }

  const reused = proposalFile(dir, chapter.index, hash8)
  if (reused) {
    return {
      reused: true,
      manuscriptUntouched: true,
      proposal: {
        id: path.basename(reused, '.json'),
        path: reused,
        relativePath: path.relative(resolved.root, reused).split(path.sep).join('/'),
        contentChars: text.length
      },
      target: { index: chapter.index, title: chapter.title, file: chapter.file },
      warnings: ['同章节同内容的提案已存在，直接复用未重复写入。']
    }
  }

  const createdAt = new Date().toISOString()
  const base = `${stamp()}-ch${chapter.index}-${hash8}`
  const payload = {
    schema: PROPOSAL_SCHEMA,
    id: base,
    origin: 'mcp',
    mode: 'review',
    status: 'proposed',
    project: {
      projectId: resolved.manifest?.projectId || null,
      name: resolved.manifest?.name || path.basename(resolved.root)
    },
    target: {
      index: chapter.index,
      title: chapter.title,
      file: chapter.file,
      chars: chapter.chars,
      revision: `local-chapter:${chapter.index}:${fileMtimeMs(resolved.root, chapter.file)}`
    },
    content: text,
    contentChars: text.length,
    note: String(note || '').trim().slice(0, 500) || null,
    expert: expert && expert.id ? { id: String(expert.id), name: String(expert.name || '') } : null,
    requestId: String(requestId || '').trim().slice(0, 120) || null,
    createdAt
  }

  let file = path.join(dir, `${base}.json`)
  if (fs.existsSync(file)) file = path.join(dir, `${base}-${Math.random().toString(36).slice(2, 6)}.json`)
  assertInsideProject(resolved, file)
  try {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' })
  } catch (error) {
    throw failure('ERR_PROPOSAL_WRITE_FAILED', `提案写入失败：${error.message}`, { cause: error.code || null })
  }

  return {
    reused: false,
    manuscriptUntouched: true,
    proposal: {
      id: payload.id,
      path: file,
      relativePath: path.relative(resolved.root, file).split(path.sep).join('/'),
      contentChars: text.length,
      createdAt
    },
    target: { index: chapter.index, title: chapter.title, file: chapter.file },
    warnings: []
  }
}

/** 提案目录路径（只读展示用，不创建）。 */
export function proposalDirOf(root) {
  return path.join(root, PROPOSAL_DIR)
}

function fileMtimeMs(root, relative) {
  try {
    return Math.round(fs.statSync(path.join(root, relative)).mtimeMs)
  } catch {
    return 0
  }
}
