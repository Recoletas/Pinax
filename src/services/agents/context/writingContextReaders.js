// 写作上下文 readers（文本工作台 v3 Phase 4）：
// 只产出候选（四轴 + 位置 + 表示），不拼 prompt、不裁剪、不排序。
// 时间位置判定使用 Phase 3 的 position index；无法判定 → unknown（fail-closed）。

import { resolveTemporalRelation, resolveUnitRelation } from '../../writing/manuscriptPositionIndex.js'

function text(value) {
  return String(value ?? '')
}

function nodeText(node) {
  if (!node || typeof node !== 'object') return ''
  return text(node.text) + (Array.isArray(node.content) ? node.content.map(nodeText).join('') : '')
}

function unitText(unit) {
  return (Array.isArray(unit?.content) ? unit.content : []).map(nodeText).join('')
}

export function contextRevisionToken(prefix, value) {
  const revision = text(value).trim() || '0'
  return `${prefix}-r${revision}`
}

export function worldbookEntryRevision(entry = {}) {
  const explicit = entry.updatedAt ?? entry.metadata?.updatedAt ?? entry.revision
  if (explicit != null && String(explicit).trim()) return contextRevisionToken('entry', explicit)
  const source = JSON.stringify({
    name: text(entry.name),
    type: text(entry.type),
    content: text(entry.content || entry.text),
    keys: Array.isArray(entry.keys) ? entry.keys.map(text) : []
  })
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `entry-content-${(hash >>> 0).toString(36)}`
}

// 主 reader：从当前书状态构建全部候选。
// input: { projectId, chapterId, targetUnitId, document, sceneProjection,
//          outlineNodes, explorationDocuments, matchedEntries }
export function buildWritingContextCandidates(input = {}) {
  const {
    projectId = '', chapterId = '', targetUnitId = '', document = null,
    sceneProjection = null, outlineNodes = [], explorationDocuments = [],
    matchedEntries = [], referenceAssets = [], authorOverrides = []
  } = input
  const candidates = []

  // —— manuscript-unit：光标所在 unit 之前 = before-target，之后 = after-target ——
  if (document && Array.isArray(document.content) && targetUnitId) {
    const targetIndex = document.content.findIndex((unit) => unit?.attrs?.unitId === String(targetUnitId))
    document.content.forEach((unit, unitIndex) => {
      const content = unitText(unit)
      if (!content.trim()) return
      const relative = targetIndex < 0
        ? 'unknown'
        : unitIndex < targetIndex ? 'before-target'
          : unitIndex > targetIndex ? 'after-target' : 'at-target'
      candidates.push({
        id: `unit:${chapterId}:${unit?.attrs?.unitId}`,
        kind: 'manuscript-unit',
        projectId,
        documentId: String(chapterId || ''),
        sourceAuthority: 'canonical-manuscript',
        narrativeStatus: 'fact',
        temporalRelation: relative,
        scope: 'writing-unit',
        position: { chapterId, unitId: unit?.attrs?.unitId, unitIndex },
        reason: relative === 'before-target' ? '目标前正文' : relative === 'at-target' ? '当前单元' : '目标后正文（默认排除）',
        sourceRefs: chapterId ? [`chapter:${chapterId}`] : [],
        revision: `unit-r${Number(unit?.attrs?.unitRevision || 0)}`,
        attentionPriority: relative === 'at-target' ? 100 : relative === 'before-target' ? 92 : 20,
        dependencyRevisions: { [`unit:${chapterId}:${unit?.attrs?.unitId}`]: `unit-r${Number(unit?.attrs?.unitRevision || 0)}` },
        representations: { full: content },
        estimatedChars: content.length
      })
    })
  }

  // —— scene-projection：当前场（accepted-derived，atemporal constraint）——
  if (sceneProjection) {
    const parts = []
    if (sceneProjection.location?.name) parts.push(`地点：${sceneProjection.location.name}`)
    if (sceneProjection.time?.label) parts.push(`时间：${sceneProjection.time.label}`)
    if (sceneProjection.viewpointCharacter?.name) parts.push(`视角：${sceneProjection.viewpointCharacter.name}`)
    for (const person of sceneProjection.presentCharacters || []) parts.push(`在场：${person.name}`)
    for (const event of sceneProjection.unresolvedEvents || []) parts.push(`未决：${event.label}`)
    const summary = parts.join('；')
    if (summary) {
      candidates.push({
        id: `scene:${sceneProjection.sceneId || chapterId || 'current'}`,
        kind: 'scene-projection',
        projectId,
        sourceAuthority: 'accepted-derived',
        narrativeStatus: 'constraint',
        temporalRelation: 'at-target',
        scope: 'scene',
        position: { chapterId },
        reason: '当前场约束',
        sourceRefs: ['scene-projection:current'],
        revision: String(sceneProjection.projectionFingerprint || 'scene-r0'),
        attentionPriority: 96,
        dependencyRevisions: { 'scene-projection': String(sceneProjection.projectionFingerprint || 'scene-r0') },
        representations: { full: summary },
        estimatedChars: summary.length
      })
    }
  }

  // —— outline-node：adopted intent = author-adopted；其余 hypothesis ——
  for (const node of Array.isArray(outlineNodes) ? outlineNodes : []) {
    const adopted = (node.explorationRefs || []).some((ref) => ref.state === 'adopted')
    candidates.push({
      id: `outline:${node.id}`,
      kind: 'outline-node',
      projectId,
      sourceAuthority: adopted ? 'author-adopted' : 'author-explicit',
      narrativeStatus: adopted ? 'intent' : 'hypothesis',
      temporalRelation: (node.chapterRefs || []).includes(String(chapterId || '')) ? 'at-target' : 'atemporal',
      scope: 'project',
      position: { chapterId: (node.chapterRefs || [])[0] || '' },
      reason: adopted ? '已采纳的大纲意图' : '大纲节点意图',
      sourceRefs: [`outline-node:${node.id}`],
      revision: `node-r${Number(node.revision || 0)}`,
      attentionPriority: adopted ? 90 : 45,
      dependencyRevisions: { [`outline-node:${node.id}`]: `node-r${Number(node.revision || 0)}` },
      representations: { summary: [node.title, node.intent].filter(Boolean).join('：') },
      estimatedChars: [node.title, node.intent].filter(Boolean).join('：').length,
      claimKey: node.intent ? `outline:${node.id}` : ''
    })
  }

  // —— exploration-doc：adopted = intent（可进正文）；proposed = alternative（仅探索任务）——
  for (const doc of Array.isArray(explorationDocuments) ? explorationDocuments : []) {
    const adoptedRef = (outlineNodes || []).some((node) => (
      (node.explorationRefs || []).some((ref) => ref.documentId === doc.id && ref.state === 'adopted')
    ))
    const content = text(doc.content || '').trim()
    if (!content) continue
    candidates.push({
      id: `exploration:${doc.id}`,
      kind: 'exploration-doc',
      projectId,
      documentId: doc.id,
      sourceAuthority: adoptedRef ? 'author-adopted' : 'author-explicit',
      narrativeStatus: adoptedRef ? 'intent' : 'alternative',
      temporalRelation: 'atemporal',
      scope: 'project',
      position: {},
      reason: adoptedRef ? '已采纳的探索稿' : '未采纳探索稿（仅探索任务可比较）',
      sourceRefs: [`exploration:${doc.id}`],
      revision: `doc-r${Number(doc.revision || 0)}`,
      attentionPriority: adoptedRef ? 88 : 35,
      dependencyRevisions: { [`exploration:${doc.id}`]: `doc-r${Number(doc.revision || 0)}` },
      representations: {
        full: content,
        summary: content.slice(0, 160)
      },
      estimatedChars: content.length
    })
  }

  // —— worldbook-entry：matcher 命中即候选（imported-reference，atemporal fact/constraint）——
  for (const entry of Array.isArray(matchedEntries) ? matchedEntries : []) {
    const entryContent = text(entry.content || entry.text || '').trim()
    if (!entryContent) continue
    const isCurrentSceneEntry = entry.matchReason === 'current-scene'
    candidates.push({
      id: `wb-entry:${entry.id}`,
      kind: 'worldbook-entry',
      projectId,
      sourceAuthority: 'imported-reference',
      narrativeStatus: ['rule', 'forbidden', 'style'].includes(entry.type) ? 'constraint' : 'fact',
      temporalRelation: 'atemporal',
      scope: 'project',
      position: {},
      reason: isCurrentSceneEntry ? '当前场精确引用' : `世界书命中（${entry.matchReason || 'keyword'}）`,
      sourceRefs: [`worldbook-entry:${entry.id}`],
      revision: worldbookEntryRevision(entry),
      attentionPriority: isCurrentSceneEntry ? 99 : 72,
      dependencyRevisions: { [`worldbook-entry:${entry.id}`]: worldbookEntryRevision(entry) },
      representations: { full: entryContent, excerpt: entryContent.slice(0, 200) },
      estimatedChars: entryContent.length,
      claimKey: entry.claimKey || ''
    })
  }

  // 素材只有在作者显式选择后才成为候选，最终仍由 compiler 统一裁剪。
  for (const asset of Array.isArray(referenceAssets) ? referenceAssets : []) {
    if (!asset?.id) continue
    const content = text(asset?.content || '').trim()
    if (!content) continue
    candidates.push({
      id: `asset:${asset.id}`,
      kind: 'narrative-asset',
      projectId,
      sourceAuthority: 'author-explicit',
      narrativeStatus: 'fact',
      temporalRelation: 'atemporal',
      scope: 'project',
      position: {},
      reason: '作者显式选中的参考素材',
      sourceRefs: [`narrative-asset:${asset.id}`],
      revision: contextRevisionToken('asset', asset.updatedAt || asset.revision),
      attentionPriority: 62,
      dependencyRevisions: { [`narrative-asset:${asset.id}`]: contextRevisionToken('asset', asset.updatedAt || asset.revision) },
      representations: { full: content, summary: content.slice(0, 200) },
      estimatedChars: content.length
    })
  }

  // —— author override：独立 run-only 候选；不修改被纠正的世界书/记忆来源。——
  for (const override of Array.isArray(authorOverrides) ? authorOverrides : []) {
    const content = text(override.content || '').trim()
    if (!content) continue
    candidates.push({
      id: `override:${override.id}`,
      kind: 'author-note',
      projectId,
      sourceAuthority: 'author-explicit',
      narrativeStatus: 'constraint',
      temporalRelation: override.temporalRelation || 'atemporal',
      scope: 'run-only',
      position: { chapterId },
      reason: '作者显式纠正',
      sourceRefs: [`author-override:${override.id}`],
      revision: String(override.revision || ''),
      representations: { full: content },
      estimatedChars: content.length,
      claimKey: override.claimKey || '',
      claimType: override.claimType || 'unknown',
      overrideOf: override.overrideOf || ''
    })
  }

  return candidates
}

// 章节级时间关系（跨章 continuity 用）：供 Phase 8 调用。
export function chapterTemporalCandidates(index, targetChapterId, continuitySummaries = []) {
  return (Array.isArray(continuitySummaries) ? continuitySummaries : []).map((item) => ({
    ...item,
    temporalRelation: resolveTemporalRelation(index, targetChapterId, item.chapterId)
  }))
}

export { resolveUnitRelation }
