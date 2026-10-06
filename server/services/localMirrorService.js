// 本地文件镜像（P1）：把作品正文/大纲/世界书/构思单向落盘到本机文档目录，供 agent 与用户直接读取。
// 镜像是单向输出：托管子目录（正文/大纲/世界书/构思）每次同步整体重建，本地手改会被覆盖——读拷贝语义。
// 位置解析：PINAX_MIRROR_ROOT env > <homedir>/Documents/Pinax。前端不传路径（防路径注入），服务端唯一决定权。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MANAGED_SUBDIRS = ['正文', '大纲', '世界书', '构思']
const LIMITS = {
  maxChapters: 500,
  maxEntries: 2000,
  maxExplorations: 300,
  maxTotalChars: 4_000_000
}

export function resolveMirrorRoot(env = process.env) {
  return env.PINAX_MIRROR_ROOT || path.join(os.homedir(), 'Documents', 'Pinax')
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

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是对象'
  const book = payload.book
  if (!book || typeof book !== 'object') return '缺少 book 对象'
  if (typeof book.id !== 'string' || !book.id.trim() || book.id.length > 120) return 'book.id 非法'
  if (typeof book.title !== 'string' || !book.title.trim()) return 'book.title 非法'
  if (!Array.isArray(book.chapters) || book.chapters.length > LIMITS.maxChapters) return `chapters 必须是数组且 ≤ ${LIMITS.maxChapters}`
  let total = 0
  for (const chapter of book.chapters) {
    if (!chapter || typeof chapter !== 'object') return 'chapter 项非法'
    if (typeof chapter.title !== 'string' || typeof chapter.content !== 'string') return 'chapter 需要 title/content 字符串'
    total += chapter.content.length
  }
  const explorations = Array.isArray(book.explorations) ? book.explorations : []
  if (explorations.length > LIMITS.maxExplorations) return `explorations ≤ ${LIMITS.maxExplorations}`
  for (const doc of explorations) {
    if (!doc || typeof doc.content !== 'string' || typeof doc.title !== 'string') return 'exploration 需要 title/content 字符串'
    total += doc.content.length
  }
  const wb = payload.worldbook
  if (wb !== null && wb !== undefined) {
    if (typeof wb !== 'object') return 'worldbook 非法'
    if (!Array.isArray(wb.entries) || wb.entries.length > LIMITS.maxEntries) return `worldbook.entries 必须是数组且 ≤ ${LIMITS.maxEntries}`
    for (const entry of wb.entries) {
      if (!entry || typeof entry.content !== 'string' || typeof entry.name !== 'string') return 'entry 需要 name/content 字符串'
      total += entry.content.length
    }
  }
  if (total > LIMITS.maxTotalChars) return `内容总量超过 ${LIMITS.maxTotalChars} 字符`
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

/**
 * 把一本书的镜像写入 root 下。返回 { dir, counts }。
 * 托管子目录整体重建（先删后写），meta.json 最后写——它是「本次同步完整」的标记。
 */
export function createLocalMirrorService({ rootPath, now = () => new Date().toISOString() } = {}) {
  function resolveRoot() {
    const root = rootPath || resolveMirrorRoot()
    fs.mkdirSync(root, { recursive: true })
    return root
  }

  function mirrorBook(payload) {
    const error = validatePayload(payload)
    if (error) throw Object.assign(new Error(error), { code: 'ERR_INVALID_INPUT' })
    const root = resolveRoot()
    const book = payload.book
    const dir = path.join(root, `${sanitizeFilename(book.title)}-${String(book.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(-8)}`)
    // 托管区清扫：镜像目录由本服务创建并独占管理
    for (const sub of MANAGED_SUBDIRS) fs.rmSync(path.join(dir, sub), { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })

    const usedNames = new Set()
    const chapterFiles = []
    book.chapters.forEach((chapter, index) => {
      const base = `${String(index + 1).padStart(3, '0')}-${sanitizeFilename(chapter.title)}`
      let name = `${base}.md`
      for (let n = 2; usedNames.has(name); n += 1) name = `${base}-${n}.md`
      usedNames.add(name)
      writeFileAtomic(path.join(dir, '正文', name), `${chapter.content}\n`)
      chapterFiles.push(name)
    })

    writeFileAtomic(path.join(dir, '大纲', '大纲.md'), outlineMarkdown(book))
    writeFileAtomic(path.join(dir, '大纲', 'outline.json'), JSON.stringify({ nodes: book.outline?.nodes ?? [], edges: book.outline?.edges ?? [] }, null, 2) + '\n')

    const wb = payload.worldbook
    let entryCount = 0
    if (wb) {
      const usedEntryFiles = new Set()
      for (const entry of wb.entries) {
        const group = sanitizeFilename(entry.group || '未分组', '未分组')
        const base = sanitizeFilename(entry.name)
        let name = `${base}.md`
        for (let n = 2; usedEntryFiles.has(`${group}/${name}`); n += 1) name = `${base}-${n}.md`
        usedEntryFiles.add(`${group}/${name}`)
        writeFileAtomic(path.join(dir, '世界书', group, name), entryMarkdown(entry, wb.name))
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

    const usedDocNames = new Set()
    const explorations = Array.isArray(book.explorations) ? book.explorations : []
    for (const doc of explorations) {
      const base = sanitizeFilename(doc.title)
      let name = `${base}.md`
      for (let n = 2; usedDocNames.has(name); n += 1) name = `${base}-${n}.md`
      usedDocNames.add(name)
      writeFileAtomic(path.join(dir, '构思', name), `${doc.content}\n`)
    }

    const counts = { chapters: chapterFiles.length, entries: entryCount, explorations: explorations.length }
    writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify({ schema: 'pinax-local-mirror@1', bookId: book.id, title: book.title, mirroredAt: now(), ...counts }, null, 2) + '\n')
    return { dir, counts }
  }

  return { resolveRoot, mirrorBook }
}
