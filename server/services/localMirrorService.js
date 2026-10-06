// 本地文件镜像（P1→项目文件体系 @2）：把项目的正文/大纲/世界书/构思/资料/日志/媒体清单
// 单向落盘到本机文档目录，供 agent 与用户直接读取。
// 镜像是单向输出：托管子目录每次同步整体重建，本地手改会被覆盖——读拷贝语义。
// 位置解析：PINAX_MIRROR_ROOT env > <homedir>/Documents/Pinax。前端不传路径（防路径注入），服务端唯一决定权。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MIRROR_SCHEMA = 'pinax-project-fs@2'
export const PROJECT_SPEC = 'pinax-project@1'
/** 项目文件夹范式（Obsidian/VS Code 模式）：任意位置自包含文件夹，.pinax/project.json 为标记。 */
const KIND_TEMPLATES = {
  novel: ['正文', '大纲', '世界书', '构思', '资料', '日志'],
  screenplay: ['剧本', '人物', '场景', '大纲', '世界书', '资料', '日志'],
  generic: ['文档', '资料', '日志']
}
const MANAGED_SUBDIRS = ['正文', '大纲', '世界书', '构思', '资料', '日志']
const LIMITS = {
  maxChapters: 500,
  maxEntries: 2000,
  maxExplorations: 300,
  maxArtifacts: 50,
  maxArtifactChars: 50_000,
  maxSessions: 20,
  maxSessionChars: 200_000,
  maxRevisionsPerChapter: 10,
  maxRevisionChars: 20_000,
  maxBlockHistoryPerChapter: 20,
  maxConversationMessages: 60,
  maxTotalChars: 8_000_000
}

export function resolveMirrorRoot(env = process.env) {
  return env.PINAX_MIRROR_ROOT || path.join(os.homedir(), 'Documents', 'Pinax')
}

/** 应用侧数据（注册表/索引）："代码安装位置附近"——PINAX_APP_DATA > <server>/.pinax-app/（桌面阶段换 Electron userData）。 */
export function resolveAppData(env = process.env, serverDir = path.resolve(import.meta.dirname, '..')) {
  return env.PINAX_APP_DATA || path.join(serverDir, '.pinax-app')
}

function readRegistry(appData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(appData, 'projects.registry.json'), 'utf-8'))
    return Array.isArray(parsed.projects) ? parsed.projects : []
  } catch { return [] }
}

function writeRegistry(appData, projects) {
  fs.mkdirSync(appData, { recursive: true })
  writeFileAtomic(path.join(appData, 'projects.registry.json'), JSON.stringify({ schema: PROJECT_SPEC, projects }, null, 2) + '\n')
}

function validateProjectPathInput(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) return '路径必须是绝对路径'
  if (rootPath.includes('..')) return '路径不允许包含 ..'
  return null
}

/** Windows/通用文件名消毒：去控制符与非法字符，截断，空则回落占位。 */
export function sanitizeFilename(input, fallback = '未命名') {
  const cleaned = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  return cleaned || fallback
}

function totalPayloadChars(payload) {
  return JSON.stringify(payload ?? {}).length
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是对象'
  const book = payload.book
  if (!book || typeof book !== 'object') return '缺少 book 对象'
  if (typeof book.id !== 'string' || !book.id.trim() || book.id.length > 120) return 'book.id 非法'
  if (typeof book.title !== 'string' || !book.title.trim()) return 'book.title 非法'
  if (!Array.isArray(book.chapters) || book.chapters.length > LIMITS.maxChapters) return `chapters 必须是数组且 ≤ ${LIMITS.maxChapters}`
  for (const chapter of book.chapters) {
    if (!chapter || typeof chapter.title !== 'string' || typeof chapter.content !== 'string') return 'chapter 需要 title/content 字符串'
  }
  const explorations = Array.isArray(book.explorations) ? book.explorations : []
  if (explorations.length > LIMITS.maxExplorations) return `explorations ≤ ${LIMITS.maxExplorations}`
  const wb = payload.worldbook
  if (wb !== null && wb !== undefined) {
    if (typeof wb !== 'object' || !Array.isArray(wb.entries) || wb.entries.length > LIMITS.maxEntries) return `worldbook.entries 必须是数组且 ≤ ${LIMITS.maxEntries}`
    for (const entry of wb.entries) {
      if (!entry || typeof entry.content !== 'string' || typeof entry.name !== 'string') return 'entry 需要 name/content 字符串'
    }
  }
  const logs = payload.logs
  if (logs !== undefined && logs !== null && typeof logs !== 'object') return 'logs 非法'
  if (logs) {
    if (!Array.isArray(logs.sessions) || logs.sessions.length > LIMITS.maxSessions) return `logs.sessions ≤ ${LIMITS.maxSessions}`
    for (const session of logs.sessions) {
      if (!session || typeof session !== 'object') return 'session 项非法'
    }
    if (!Array.isArray(logs.revisions) || logs.revisions.length > LIMITS.maxChapters) return 'logs.revisions 非法'
    if (!Array.isArray(logs.memory)) return 'logs.memory 必须是数组'
  }
  const materials = payload.materials
  if (materials !== undefined && materials !== null) {
    if (typeof materials !== 'object' || !Array.isArray(materials.artifacts) || materials.artifacts.length > LIMITS.maxArtifacts) return `materials.artifacts ≤ ${LIMITS.maxArtifacts}`
    for (const artifact of materials.artifacts) {
      if (!artifact || typeof artifact.content !== 'string' || typeof artifact.title !== 'string') return 'artifact 需要 title/content 字符串'
    }
  }
  if (payload.media !== undefined && !Array.isArray(payload.media)) return 'media 必须是数组'
  if (totalPayloadChars(payload) > LIMITS.maxTotalChars) return `payload 超过 ${LIMITS.maxTotalChars} 字符`
  return null
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, filePath)
}

function outlineMarkdown(book) {
  const nodes = Array.isArray(book.outline?.nodes) ? book.outline.nodes : []
  const edges = Array.isArray(book.outline?.edges) ? book.outline.edges : []
  const lines = [`# 《${book.title}》大纲`, '']
  for (const node of nodes) {
    const status = node.status ? `（${node.status}）` : ''
    lines.push(`- ${node.title || node.id}${status}${node.intent ? `：${node.intent}` : ''}`)
  }
  if (edges.length) {
    lines.push('', '## 关系', '')
    const kindLabel = { causes: '导致', foreshadows: '伏笔', alternative: '备选', parallel: '并行' }
    for (const edge of edges) {
      const from = nodes.find((n) => n.id === edge.fromNodeId)?.title || edge.fromNodeId
      const to = nodes.find((n) => n.id === edge.toNodeId)?.title || edge.toNodeId
      lines.push(`- ${from} —${kindLabel[edge.kind] || edge.kind}→ ${to}`)
    }
  }
  return lines.join('\n') + '\n'
}

function entryMarkdown(entry, worldbookName) {
  const keys = Array.isArray(entry.keys) && entry.keys.length ? entry.keys.join('、') : ''
  const front = [
    '---',
    `name: ${entry.name || ''}`,
    `type: ${entry.type || 'general'}`,
    `group: ${entry.group || ''}`,
    keys ? `keys: ${keys}` : null,
    `worldbook: ${worldbookName || ''}`,
    '---',
    ''
  ].filter((line) => line !== null)
  return front.join('\n') + String(entry.content ?? '')
}

function writeDeduped(dir, base, content, usedNames, ext = '.md') {
  let name = `${base}${ext}`
  for (let n = 2; usedNames.has(name); n += 1) name = `${base}-${n}${ext}`
  usedNames.add(name)
  writeFileAtomic(path.join(dir, name), content)
  return name
}

function conversationMarkdown(projectId, conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages.slice(-LIMITS.maxConversationMessages) : []
  const lines = [`# 助手对话 ${projectId}`, '']
  for (const message of messages) {
    const who = message.role === 'user' ? '作者' : message.role === 'assistant' ? '助手' : (message.role || '系统')
    lines.push(`## ${who}${message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString('zh-CN')}` : ''}`, '', String(message.content ?? '').slice(0, 8000), '')
  }
  return lines.join('\n')
}

/**
 * 把一个项目的文件体系写入 root 下。返回 { dir, counts }。
 * 托管子目录整体重建（先删后写），meta.json 最后写——它是「本次同步完整」的标记。
 */
export function createLocalMirrorService({ rootPath, appDataPath, now = () => new Date().toISOString() } = {}) {
  function resolveRoot() {
    const root = rootPath || resolveMirrorRoot()
    fs.mkdirSync(root, { recursive: true })
    return root
  }

  function resolveAppDataDir() {
    const appData = appDataPath || resolveAppData()
    fs.mkdirSync(appData, { recursive: true })
    return appData
  }

  const registryKeyOf = (rootPath) => path.resolve(rootPath).toLowerCase()

  function upsertRegistry(entry) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData).filter((item) => registryKeyOf(item.rootPath) !== registryKeyOf(entry.rootPath))
    projects.push(entry)
    writeRegistry(appData, projects)
    return entry
  }

  /** 在任意位置创建项目文件夹（Obsidian 建库）：空目录 + marker + kind 模板目录，并登记注册表。 */
  function createProjectAt({ rootPath, path: pathInput, name, kind = 'novel', bookId = null }) {
    const target = rootPath || pathInput
    const invalid = validateProjectPathInput(target)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    if (!KIND_TEMPLATES[kind]) throw Object.assign(new Error(`未知项目类型 ${kind}（可用：${Object.keys(KIND_TEMPLATES).join('/')}）`), { code: 'ERR_INVALID_INPUT' })
    if (typeof name !== 'string' || !name.trim()) throw Object.assign(new Error('name 必填'), { code: 'ERR_INVALID_INPUT' })
    const root = path.resolve(target)
    const exists = fs.existsSync(root)
    if (exists && fs.readdirSync(root).length > 0) throw Object.assign(new Error('目标目录非空——创建项目需要空目录（打开已有项目用 /projects/open）'), { code: 'ERR_DIR_NOT_EMPTY' })
    fs.mkdirSync(root, { recursive: true })
    const projectId = `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const manifest = { schemaVersion: 1, spec: PROJECT_SPEC, projectId, name: sanitizeFilename(name), kind, createdAt: now(), updatedAt: now() }
    writeFileAtomic(path.join(root, '.pinax', 'project.json'), JSON.stringify(manifest, null, 2) + '\n')
    for (const dir of KIND_TEMPLATES[kind]) fs.mkdirSync(path.join(root, dir), { recursive: true })
    return { manifest, entry: upsertRegistry({ projectId, bookId, name: manifest.name, kind, rootPath: root, lastOpenedAt: now(), lastSyncAt: null }) }
  }

  /** 打开已有项目文件夹：校验 marker 并登记/刷新注册表。 */
  function openProjectAt({ rootPath, path: pathInput, bookId = null }) {
    const target = rootPath || pathInput
    const invalid = validateProjectPathInput(target)
    if (invalid) throw Object.assign(new Error(invalid), { code: 'ERR_INVALID_INPUT' })
    const root = path.resolve(target)
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(root, '.pinax', 'project.json'), 'utf-8'))
    } catch {
      throw Object.assign(new Error('目标目录不是 pinax 项目（缺少 .pinax/project.json）——可改用 /projects/create 创建'), { code: 'ERR_NOT_A_PROJECT' })
    }
    if (manifest.spec !== PROJECT_SPEC) throw Object.assign(new Error(`项目范式 ${manifest.spec} 与当前支持 ${PROJECT_SPEC} 不匹配`), { code: 'ERR_SPEC_MISMATCH' })
    const existing = readRegistry(resolveAppDataDir()).find((item) => registryKeyOf(item.rootPath) === registryKeyOf(root))
    const entry = upsertRegistry({
      projectId: manifest.projectId, bookId: bookId ?? existing?.bookId ?? null,
      name: manifest.name, kind: manifest.kind || 'generic', rootPath: root, lastOpenedAt: now(),
      lastSyncAt: existing?.lastSyncAt ?? null
    })
    return { manifest, entry }
  }

  function listProjects() {
    return readRegistry(resolveAppDataDir())
  }

  /** 改注册表绑定（bookId=null 解绑）；不动磁盘。 */
  function setProjectBinding({ projectId, rootPath, bookId }) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData)
    const target = projects.find((item) => (projectId ? item.projectId === projectId : registryKeyOf(item.rootPath) === registryKeyOf(String(rootPath || ''))))
    if (!target) throw Object.assign(new Error('注册表中没有这个项目'), { code: 'ERR_PROJECT_NOT_FOUND' })
    target.bookId = bookId ?? null
    writeRegistry(appData, projects)
    return target
  }

  /** 从注册表移除条目（磁盘项目文件夹不动）。 */
  function removeProjectEntry({ projectId, rootPath }) {
    const appData = resolveAppDataDir()
    const projects = readRegistry(appData)
    const next = projects.filter((item) => !(projectId ? item.projectId === projectId : registryKeyOf(item.rootPath) === registryKeyOf(String(rootPath || ''))))
    if (next.length === projects.length) throw Object.assign(new Error('注册表中没有这个项目'), { code: 'ERR_PROJECT_NOT_FOUND' })
    writeRegistry(appData, next)
  }

  /** 同步落点：bookId 在注册表绑定过的项目根优先，否则回落文档根（旧行为兼容）。 */
  function resolveBookDir(book) {
    const entry = readRegistry(resolveAppDataDir()).find((item) => item.bookId === book.id && fs.existsSync(item.rootPath))
    if (entry) return { dir: entry.rootPath, projectRoot: entry.rootPath, kind: KIND_TEMPLATES[entry.kind] ? entry.kind : 'novel' }
    return {
      dir: path.join(resolveRoot(), `${sanitizeFilename(book.title)}-${String(book.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(-8)}`),
      projectRoot: null,
      kind: 'novel'
    }
  }

  function mirrorBook(payload) {
    const error = validatePayload(payload)
    if (error) throw Object.assign(new Error(error), { code: 'ERR_INVALID_INPUT' })
    const root = resolveRoot()
    const book = payload.book
    const located = resolveBookDir(book)
    const dir = located.dir
    for (const sub of MANAGED_SUBDIRS) fs.rmSync(path.join(dir, sub), { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    // 范式目录保留：同步只重写内容，kind 模板目录（可能为空）必须存在
    for (const templateDir of KIND_TEMPLATES[located.kind] ?? []) fs.mkdirSync(path.join(dir, templateDir), { recursive: true })

    const usedChapterNames = new Set()
    book.chapters.forEach((chapter, index) => {
      const base = `${String(index + 1).padStart(3, '0')}-${sanitizeFilename(chapter.title)}`
      writeDeduped(path.join(dir, '正文'), base, `${chapter.content}\n`, usedChapterNames)
    })

    writeFileAtomic(path.join(dir, '大纲', '大纲.md'), outlineMarkdown(book))
    writeFileAtomic(path.join(dir, '大纲', 'outline.json'), JSON.stringify({ nodes: book.outline?.nodes ?? [], edges: book.outline?.edges ?? [] }, null, 2) + '\n')

    const wb = payload.worldbook
    let entryCount = 0
    if (wb) {
      const usedEntryFiles = new Map()
      for (const entry of wb.entries) {
        const group = sanitizeFilename(entry.group || '未分组', '未分组')
        const used = usedEntryFiles.get(group) ?? new Set()
        usedEntryFiles.set(group, used)
        writeDeduped(path.join(dir, '世界书', group), sanitizeFilename(entry.name), entryMarkdown(entry, wb.name), used)
        entryCount += 1
      }
      writeFileAtomic(path.join(dir, '世界书', 'manifest.json'), JSON.stringify({
        worldbookId: wb.id || null,
        name: wb.name || '',
        worldDescription: wb.worldDescription || '',
        writingStyle: wb.writingStyle || '',
        forbidden: wb.forbidden || '',
        groups: wb.groups ?? [],
        entryCount,
        entries: wb.entries.map((entry) => ({ name: entry.name, type: entry.type || 'general', group: entry.group || '', keys: entry.keys ?? [] }))
      }, null, 2) + '\n')
    }

    for (const doc of Array.isArray(book.explorations) ? book.explorations : []) {
      writeDeduped(path.join(dir, '构思'), sanitizeFilename(doc.title), `${doc.content}\n`, new Set())
    }

    const logs = payload.logs ?? {}
    const usedSessionNames = new Set()
    let sessionCount = 0
    for (const session of Array.isArray(logs.sessions) ? logs.sessions : []) {
      writeDeduped(path.join(dir, '日志', '体验会话'), sanitizeFilename(session.title || session.id || '会话'), `${JSON.stringify(session, null, 2)}\n`, usedSessionNames, '.json')
      sessionCount += 1
    }
    const usedRevisionNames = new Set()
    let revisionCount = 0
    for (const revision of Array.isArray(logs.revisions) ? logs.revisions : []) {
      writeDeduped(path.join(dir, '日志', '修订史'), sanitizeFilename(revision.chapterTitle || revision.chapterId || '章节'), `${JSON.stringify({
        chapterId: revision.chapterId,
        chapterTitle: revision.chapterTitle || '',
        snapshots: (revision.snapshots ?? []).map((snapshot) => ({ ...snapshot, markdown: String(snapshot.markdown ?? '').slice(0, LIMITS.maxRevisionChars) })),
        blockHistory: (revision.blockHistory ?? []).slice(0, LIMITS.maxBlockHistoryPerChapter)
      }, null, 2)}\n`, usedRevisionNames, '.json')
      revisionCount += 1
    }
    const usedConversationNames = new Set()
    let conversationCount = 0
    for (const conversation of Array.isArray(logs.conversations) ? logs.conversations : []) {
      writeDeduped(path.join(dir, '日志', '助手对话'), sanitizeFilename(conversation.projectId || '项目'), conversationMarkdown(conversation.projectId, conversation), usedConversationNames)
      conversationCount += 1
    }
    if (Array.isArray(logs.memory)) {
      writeFileAtomic(path.join(dir, '日志', '记忆台账.json'), JSON.stringify({
        count: logs.memory.length,
        byStatus: logs.memory.reduce((acc, candidate) => ({ ...acc, [candidate.status || 'unknown']: (acc[candidate.status || 'unknown'] || 0) + 1 }), {}),
        candidates: logs.memory
      }, null, 2) + '\n')
    }

    const materials = payload.materials
    let artifactCount = 0
    if (materials && Array.isArray(materials.artifacts) && materials.artifacts.length) {
      const usedArtifactNames = new Set()
      const index = []
      for (const artifact of materials.artifacts) {
        const base = `${artifact.ref || artifact.id || 'S'}-${sanitizeFilename(artifact.title)}`
        const name = writeDeduped(path.join(dir, '资料'), base, `${artifact.content}\n`, usedArtifactNames)
        index.push({ ref: artifact.ref || artifact.id || '', title: artifact.title, kind: artifact.kind || 'reference-text', file: name, chars: artifact.content.length })
        artifactCount += 1
      }
      writeFileAtomic(path.join(dir, '资料', 'sources.json'), JSON.stringify({ count: artifactCount, artifacts: index }, null, 2) + '\n')
    }

    if (Array.isArray(payload.media) && payload.media.length) {
      writeFileAtomic(path.join(dir, '媒体清单.json'), JSON.stringify({ count: payload.media.length, assets: payload.media }, null, 2) + '\n')
    }

    const counts = {
      chapters: book.chapters.length,
      entries: entryCount,
      explorations: Array.isArray(book.explorations) ? book.explorations.length : 0,
      sessions: sessionCount,
      revisions: revisionCount,
      conversations: conversationCount,
      artifacts: artifactCount,
      media: Array.isArray(payload.media) ? payload.media.length : 0
    }
    if (located.projectRoot) {
      const appData = resolveAppDataDir()
      const projects = readRegistry(appData).map((item) => (registryKeyOf(item.rootPath) === registryKeyOf(located.projectRoot) ? { ...item, lastSyncAt: now() } : item))
      writeRegistry(appData, projects)
    }
    writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify({ schema: MIRROR_SCHEMA, bookId: book.id, title: book.title, mirroredAt: now(), ...counts }, null, 2) + '\n')
    return { dir, counts, projectRoot: located.projectRoot }
  }

  /** 应用侧项目索引：<appData>/index.json（注册表旁，不在项目文件夹内）。 */
  function writeProjectIndex(books) {
    const appData = resolveAppDataDir()
    const entries = (Array.isArray(books) ? books : []).map((book) => ({
      id: book.id,
      title: book.title,
      chapters: book.chapters ?? 0,
      words: book.words ?? 0,
      entries: book.entries ?? 0,
      updatedAt: book.updatedAt ?? null,
      mirroredAt: book.mirroredAt ?? null,
      dir: book.dir ?? null
    }))
    const file = path.join(appData, 'index.json')
    writeFileAtomic(file, JSON.stringify({ schema: MIRROR_SCHEMA, generatedAt: now(), projects: entries }, null, 2) + '\n')
    return file
  }

  return { resolveRoot, mirrorBook, writeProjectIndex, createProjectAt, openProjectAt, listProjects, setProjectBinding, removeProjectEntry, resolveAppDataDir }
}
