// C1 Authoring run 的生产读取适配器。
// 所有入口按稳定项目/来源 ID 重读当前 repository；找不到、跨项目或 scope
// 不一致一律返回 null/空列表，不回退页面当前对象，也不使用 frozen session 值。

import { readWorldbookSnapshot } from '../../../stores/worldStore.js'
import { getExplorationDocument } from '../../writing/authoringDocumentRepository.js'
import { findWritingBook, loadWritingBooks } from '../../writing/writingBooksRepository.js'
import { listNarrativeAssets } from '../../narrativeAssets.js'
import { listMemoryCandidates } from '../../memoryCandidates.js'
import { buildDocumentRevision } from './authoringTextTransaction.js'
import {
  getChapterDocument,
  getWritingDocumentMarkdown
} from '../../writing/writingDocumentSchema.js'

function text(value) {
  return String(value ?? '').trim()
}

function normalizeTargetScope(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const role = source.role === 'exploration' || source.documentRole === 'exploration'
    ? 'exploration'
    : source.role === 'manuscript' || source.documentRole === 'manuscript'
      ? 'manuscript'
      : ''
  return {
    projectId: text(source.projectId || source.bookId),
    role,
    documentId: text(source.documentId || (role === 'manuscript' ? source.chapterId : '')),
    chapterId: text(source.chapterId),
    unitId: text(source.unitId || source.targetUnitId),
    nodeId: text(source.nodeId || source.targetNodeId)
  }
}

function validExpectedScope(scope) {
  if (!scope.projectId || !scope.role || !scope.documentId) return false
  return scope.role !== 'manuscript' || Boolean(scope.chapterId)
}

function targetScopeMatches(expected, actual) {
  for (const key of ['projectId', 'role', 'documentId', 'chapterId', 'unitId', 'nodeId']) {
    if (actual[key] !== expected[key]) return false
  }
  return true
}

export function readBoundAuthoringWorldbook(projectId, worldbookId) {
  const normalizedProjectId = text(projectId)
  const normalizedWorldbookId = text(worldbookId)
  if (!normalizedProjectId || !normalizedWorldbookId) return null

  const book = findWritingBook(loadWritingBooks(), normalizedProjectId)
  if (!book || text(book.worldbookId) !== normalizedWorldbookId) return null
  const worldbook = readWorldbookSnapshot(normalizedWorldbookId)
  if (!worldbook || text(worldbook.id) !== normalizedWorldbookId) return null
  return Object.freeze({
    projectId: normalizedProjectId,
    worldbookId: normalizedWorldbookId,
    worldbook
  })
}

export function readAuthoringExplorationDocument(projectId, documentId) {
  const normalizedProjectId = text(projectId)
  const normalizedDocumentId = text(documentId)
  if (!normalizedProjectId || !normalizedDocumentId) return null
  const document = getExplorationDocument(normalizedProjectId, normalizedDocumentId)
  return document && text(document.id) === normalizedDocumentId ? document : null
}

export function readAuthoringNarrativeAsset(projectId, assetId) {
  const normalizedProjectId = text(projectId)
  const normalizedAssetId = text(assetId)
  if (!normalizedProjectId || !normalizedAssetId) return null
  return listNarrativeAssets({ status: null, projectId: normalizedProjectId }).find((asset) => (
    text(asset?.id) === normalizedAssetId
    && text(asset?.projectId) === normalizedProjectId
  )) || null
}

export function readAuthoringMemories(projectId, { status = null } = {}) {
  const normalizedProjectId = text(projectId)
  if (!normalizedProjectId) return []
  return listMemoryCandidates({ status }).filter((memory) => (
    memory?.scope !== 'project' || text(memory.scopeId) === normalizedProjectId
  ))
}

function manuscriptDocumentRevision(chapter) {
  const document = getChapterDocument(chapter)
  if (!chapter || !document) return ''
  const body = JSON.stringify({
    markdown: getWritingDocumentMarkdown(document),
    units: (document.content || []).map((unit) => ({
      id: text(unit?.attrs?.unitId),
      kind: text(unit?.attrs?.kind),
      sceneId: text(unit?.attrs?.sceneId),
      nodes: (unit?.content || []).map((node) => ({
        id: text(node?.attrs?.nodeId),
        type: text(node?.type),
        kind: text(node?.attrs?.kind)
      }))
    }))
  })
  return buildDocumentRevision(`chapter:${text(chapter.id)}`, JSON.stringify({
    title: text(chapter.title),
    body
  }))
}

// 记忆来源可能指向本次未打开的章节/单元。只返回其持久化正文 revision，
// 不把正文内容交给 run session；找不到稳定结构文档时 fail-closed 为空。
export function readAuthoringManuscriptSourceRevision(projectId, sourceRef) {
  const normalizedProjectId = text(projectId)
  const ref = text(sourceRef)
  if (!normalizedProjectId || !['chapter:', 'unit:', 'node:'].some((prefix) => ref.startsWith(prefix))) return ''
  const book = findWritingBook(loadWritingBooks(), normalizedProjectId)
  if (!book) return ''
  const chapters = Array.isArray(book.chapters) ? book.chapters : []
  if (ref.startsWith('chapter:')) {
    const chapter = chapters.find((item) => text(item?.id) === ref.slice('chapter:'.length))
    return manuscriptDocumentRevision(chapter)
  }
  const kind = ref.startsWith('node:') ? 'node' : 'unit'
  const payload = ref.slice(`${kind}:`.length)
  const separator = payload.indexOf(':')
  const documentId = separator >= 0 ? payload.slice(0, separator) : ''
  const itemId = separator >= 0 ? payload.slice(separator + 1) : payload
  const chapter = documentId
    ? chapters.find((item) => text(item?.id) === documentId)
    : chapters.find((item) => {
        const document = getChapterDocument(item)
        if (kind === 'unit') return (document?.content || []).some((unit) => text(unit?.attrs?.unitId) === itemId)
        return (document?.content || []).some((unit) => (
          (unit?.content || []).some((node) => text(node?.attrs?.nodeId) === itemId)
        ))
      })
  if (chapter && documentId) {
    const document = getChapterDocument(chapter)
    const contains = kind === 'unit'
      ? (document?.content || []).some((unit) => text(unit?.attrs?.unitId) === itemId)
      : (document?.content || []).some((unit) => (
          (unit?.content || []).some((node) => text(node?.attrs?.nodeId) === itemId)
        ))
    if (!contains) return ''
  }
  return manuscriptDocumentRevision(chapter)
}

export function createAuthoringWorldbookRepository() {
  return Object.freeze({ getBoundWorldbook: readBoundAuthoringWorldbook })
}

export function createAuthoringReferenceRepositories() {
  return Object.freeze({
    getExplorationDocument: readAuthoringExplorationDocument,
    // C1 reader 的既有签名为 (sourceId, projectId)。
    getNarrativeAsset(sourceId, projectId) {
      return readAuthoringNarrativeAsset(projectId, sourceId)
    },
    getManuscriptSourceRevision: readAuthoringManuscriptSourceRevision
  })
}

export function createAuthoringMemoryRepository({ projectId } = {}) {
  const normalizedProjectId = text(projectId)
  return Object.freeze({
    list(options = {}) {
      return readAuthoringMemories(normalizedProjectId, options)
    }
  })
}

// 页面只注入一个“按传入 scope 读取当前 live target”的 callback。
// adapter 会再次核对 callback 返回的全部稳定 ID；任何不一致、缺 revision、
// 缺 document 或读取异常都 fail-closed，不尝试读取页面当前的新作用域。
export function createAuthoringLiveTargetAdapter({ readLiveTarget } = {}) {
  if (typeof readLiveTarget !== 'function') {
    throw new TypeError('createAuthoringLiveTargetAdapter requires readLiveTarget')
  }

  async function readTarget(expectedTarget = {}) {
    const expected = normalizeTargetScope(expectedTarget)
    if (!validExpectedScope(expected)) return null

    let live
    try {
      live = await readLiveTarget(Object.freeze({ ...expected }))
    } catch {
      return null
    }
    if (!live || typeof live !== 'object' || !live.document || typeof live.document !== 'object') return null

    const actualSource = live.target && typeof live.target === 'object'
      ? live.target
      : live
    const actual = normalizeTargetScope(actualSource)
    if (!validExpectedScope(actual) || !targetScopeMatches(expected, actual)) return null

    const documentRevision = text(live.documentRevision || actualSource.documentRevision)
    const documentSchemaRevision = text(
      live.documentSchemaRevision
      ?? actualSource.documentSchemaRevision
      ?? live.document.revision
    )
    if (!documentRevision || !documentSchemaRevision) return null

    return Object.freeze({
      ...live,
      projectId: actual.projectId,
      role: actual.role,
      documentRole: actual.role,
      documentId: actual.documentId,
      chapterId: actual.chapterId,
      unitId: actual.unitId,
      nodeId: actual.nodeId,
      documentRevision,
      documentSchemaRevision
    })
  }

  return Object.freeze({ readTarget })
}

// 页面/运行层通常只需要一个 reader 函数；保留上面的对象 adapter 供需要
// 显式 repository 形态的调用者使用。两者共用同一套严格 scope 校验。
export function createScopedAuthoringLiveTargetReader(options = {}) {
  const normalizedOptions = typeof options === 'function'
    ? { readLiveTarget: options }
    : options
  return createAuthoringLiveTargetAdapter(normalizedOptions).readTarget
}

// 与 createAuthoringRunSession 入参同名的最小 repository bundle。
// liveTargetReader 只在页面显式注入 live callback 时存在，避免制造一个会
// 回退 frozen session 或当前页面目标的假读取器。
export function createAuthoringRunRepositoryAdapters({
  projectId = '',
  readLiveTarget = null
} = {}) {
  const adapters = {
    worldbookRepository: createAuthoringWorldbookRepository(),
    referenceRepositories: createAuthoringReferenceRepositories(),
    memoryRepository: createAuthoringMemoryRepository({ projectId })
  }
  if (typeof readLiveTarget === 'function') {
    adapters.liveTargetReader = createScopedAuthoringLiveTargetReader({ readLiveTarget })
  }
  return Object.freeze(adapters)
}
