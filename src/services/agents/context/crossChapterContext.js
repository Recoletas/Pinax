// 文本工作台 v3 Phase 8：跨章候选发现。
// 只读取章节事实索引、continuity 与必要尾段；不把旧章全文送入候选或 prompt。

import { buildManuscriptPositionIndex, resolveTemporalRelation } from '../../writing/manuscriptPositionIndex.js'
import { fingerprintOutline } from '../../writing/projectOutlineRepository.js'
import { contextRevisionToken, worldbookEntryRevision } from './writingContextReaders.js'

function text(value) { return String(value ?? '').trim() }

function documentText(chapter) {
  if (text(chapter?.content)) return text(chapter.content)
  const nodeText = (node) => {
    if (!node || typeof node !== 'object') return ''
    return String(node.text ?? '') + (Array.isArray(node.content) ? node.content.map(nodeText).join('') : '')
  }
  return (chapter?.editorDocument?.content || []).map(nodeText).filter(Boolean).join('\n')
}

function chapterRevision(chapter) {
  const revision = chapter?.editorDocument?.revision ?? chapter?.revision
  if (revision != null && revision !== '') return `chapter-r${revision}`
  // 旧章节可能没有显式 revision。用正文投影生成稳定修订，避免候选被 Compiler
  // 当成“无版本来源”丢弃，也保证正文变化后挂起请求会 stale。
  const source = documentText(chapter)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `chapter-content-${(hash >>> 0).toString(36)}`
}

function continuityOf(chapter) {
  return chapter?.continuityProjection || chapter?.chapterContinuity || null
}

function factsOf(chapter, projection) {
  return projection?.facts || chapter?.factIndex?.facts || chapter?.writingFactIndex?.facts || []
}

function factLines(facts) {
  return facts.slice(0, 12).map((fact) => `${fact.claimKey}：${fact.value}`)
}

function reverseOutlineDistance(nodes, edges, targetChapterId) {
  const targetIds = new Set(nodes.filter((node) => (node.chapterRefs || []).includes(targetChapterId)).map((node) => node.id))
  const distances = new Map()
  let frontier = [...targetIds]
  let distance = 0
  while (frontier.length && distance < 8) {
    const next = []
    distance += 1
    for (const targetId of frontier) {
      for (const edge of edges) {
        if (!['causes', 'foreshadows'].includes(edge.kind) || edge.toNodeId !== targetId) continue
        if (!distances.has(edge.fromNodeId)) {
          distances.set(edge.fromNodeId, { distance, kind: edge.kind })
          next.push(edge.fromNodeId)
        }
      }
    }
    frontier = next
  }
  return distances
}

export function discoverCrossChapterContext({ book = null, targetChapterId = '', outlineNodes = [], outlineEdges = [] } = {}) {
  const projectId = text(book?.id)
  const targetId = text(targetChapterId)
  const index = buildManuscriptPositionIndex(book)
  const chapters = Array.isArray(book?.chapters) ? book.chapters : []
  const targetOrder = index.entries.find((entry) => entry.chapterId === targetId)?.order
  const causalNodes = reverseOutlineDistance(outlineNodes, outlineEdges, targetId)
  const causalChapters = new Map()
  for (const node of outlineNodes) {
    const causal = causalNodes.get(node.id)
    if (!causal) continue
    for (const chapterId of node.chapterRefs || []) {
      const prior = causalChapters.get(chapterId)
      if (!prior || causal.distance < prior.distance) causalChapters.set(chapterId, causal)
    }
  }

  const candidates = []
  const discovered = []
  for (const chapter of chapters) {
    const chapterId = text(chapter?.id)
    if (!chapterId || chapterId === targetId) continue
    const temporalRelation = resolveTemporalRelation(index, targetId, chapterId)
    const revision = chapterRevision(chapter)
    const projection = continuityOf(chapter)
    const summary = text(projection?.summary?.text || projection?.summary || chapter?.summary)
    const indexedFacts = factsOf(chapter, projection)
    const facts = factLines(indexedFacts)
    // future 只发现已有索引/摘要，不读取正文；钉选后仍以 intended reference 进入。
    const tail = temporalRelation === 'after-target' ? '' : documentText(chapter).slice(-600)
    const order = index.entries.find((entry) => entry.chapterId === chapterId)?.order
    const isPrevious = Number.isInteger(targetOrder) && order === targetOrder - 1
    const causal = causalChapters.get(chapterId)
    const hooks = indexedFacts.filter((fact) => ['intent', 'constraint'].includes(fact.status) || ['secret', 'mechanism'].includes(fact.facet))
    const reason = causal
      ? `${causal.kind === 'foreshadows' ? '待兑现伏笔' : '因果前驱'}（${causal.distance} 跳）`
      : hooks.length ? '待兑现事实或伏笔'
        : isPrevious ? '前章尾段与连续性' : '旧章连续性摘要'
    const representations = {
      ...(facts.length || summary ? { full: [...facts, summary].filter(Boolean).join('\n') } : {}),
      ...(tail ? { excerpt: tail } : {}),
      ...(summary ? { summary } : {})
    }
    discovered.push({ chapterId, temporalRelation, revision, hasFacts: facts.length > 0, hasSummary: Boolean(summary), hasExcerpt: Boolean(tail), reason })
    if (!Object.keys(representations).length) continue
    candidates.push({
      id: `chapter-context:${chapterId}`,
      kind: 'chapter-continuity',
      projectId,
      documentId: chapterId,
      sourceAuthority: 'canonical-manuscript',
      narrativeStatus: 'fact',
      temporalRelation,
      scope: 'chapter',
      position: { chapterId, chapterOrder: order },
      reason,
      sourceRefs: [`chapter:${chapterId}`, ...indexedFacts.flatMap((fact) => fact.evidenceRefs || []).slice(0, 20)],
      revision,
      representations,
      estimatedChars: Math.min(600, (representations.full || representations.excerpt || representations.summary || '').length),
      attentionPriority: causal ? 95 - causal.distance : hooks.length ? 86 : isPrevious ? 78 : 35,
      dependencyRevisions: {
        [`chapter:${chapterId}`]: revision,
        'chapter-order': index.chapterOrderRevision,
        ...(projection?.revision ? { [`continuity:${chapterId}`]: projection.revision } : {})
      }
    })
  }
  return { candidates, report: { discovered, chapterOrderRevision: index.chapterOrderRevision } }
}

export function collectWritingContextDependencyRevisions({ book = null, document = null, sceneProjection = null, outlineNodes = [], outlineEdges = [], worldbook = null, explorationDocuments = [], referenceAssets = [] } = {}) {
  const index = buildManuscriptPositionIndex(book)
  const revisions = { 'chapter-order': index.chapterOrderRevision }
  for (const chapter of book?.chapters || []) {
    const revision = chapterRevision(chapter)
    if (revision) revisions[`chapter:${chapter.id}`] = revision
    const projection = continuityOf(chapter)
    if (projection?.revision) revisions[`continuity:${chapter.id}`] = String(projection.revision)
  }
  for (const unit of document?.content || []) {
    if (unit?.attrs?.unitId) revisions[`unit:${document?.chapterId || ''}:${unit.attrs.unitId}`] = `unit-r${Number(unit.attrs.unitRevision || 0)}`
  }
  if (sceneProjection?.projectionFingerprint) {
    revisions['scene-projection'] = String(sceneProjection.projectionFingerprint)
  }
  revisions.outline = fingerprintOutline(outlineNodes, outlineEdges)
  for (const node of outlineNodes) revisions[`outline-node:${node.id}`] = `node-r${Number(node.revision || 0)}`
  for (const doc of explorationDocuments) revisions[`exploration:${doc.id}`] = `doc-r${Number(doc.revision || 0)}`
  for (const entry of worldbook?.entries || []) {
    revisions[`worldbook-entry:${entry.id}`] = worldbookEntryRevision(entry)
  }
  for (const asset of referenceAssets || []) {
    if (!asset?.id) continue
    revisions[`narrative-asset:${asset.id}`] = contextRevisionToken('asset', asset.updatedAt || asset.revision)
  }
  return revisions
}
