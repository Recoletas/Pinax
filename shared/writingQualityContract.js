export const WRITING_QUALITY_SCHEMA_VERSION = 1

const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 })
const ISSUE_KINDS = Object.freeze({
  empty: 'empty-chapter',
  orphan: 'orphan-annotation',
  review: 'open-review-finding',
  recovery: 'recovery-draft',
  unsaved: 'unsaved-changes',
  longBlock: 'long-block',
  duplicate: 'duplicate-block',
  noScene: 'missing-scene-heading'
})

function text(value) {
  return value == null ? '' : String(value)
}

function blockText(node) {
  return (node?.content || []).map((item) => text(item?.text)).join('').trim()
}

function normalizeForComparison(value) {
  return text(value)
    .replace(/[\s，。！？；：、“”‘’「」『』（）()《》〈〉,.!?;:'"-]/gu, '')
    .toLowerCase()
}

function issue({
  id,
  kind,
  severity,
  title,
  detail,
  unitId = '',
  unitRevision = 0,
  nodeId = '',
  nodeRevision = 0,
  annotationId = '',
  blocking = false
}) {
  return {
    id: text(id).trim() || `${kind}-${nodeId || annotationId || 'chapter'}`,
    kind,
    severity,
    title,
    detail,
    unitId: text(unitId).trim() || null,
    unitRevision: Number(unitRevision) || 0,
    nodeId: text(nodeId).trim() || null,
    nodeRevision: Number(nodeRevision) || 0,
    annotationId: text(annotationId).trim() || null,
    blocking: Boolean(blocking)
  }
}

export function buildWritingQualityReport({
  document = null,
  annotations = [],
  recoveryDraft = null,
  saveStatus = 'saved',
  snapshots = [],
  blockHistory = [],
  maxIssues = 24
} = {}) {
  const topLevelNodes = Array.isArray(document?.content) ? document.content : []
  const blocks = topLevelNodes.flatMap((topLevelNode, unitIndex) => {
    const unit = topLevelNode?.type === 'writingUnit' ? topLevelNode : null
    const nodes = unit ? unit.content || [] : [topLevelNode]
    return nodes.map((node, nodeIndex) => ({
      index: `${unitIndex}:${nodeIndex}`,
      unitId: text(unit?.attrs?.unitId),
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      nodeId: text(node?.attrs?.nodeId || node?.attrs?.blockId || `node-${unitIndex + 1}-${nodeIndex + 1}`),
      nodeRevision: Number(node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? 0),
      kind: text(node?.attrs?.kind || 'prose'),
      text: blockText(node)
    }))
  })
  const proseBlocks = blocks.filter((block) => block.kind !== 'divider' && block.text)
  const issues = []

  if (!proseBlocks.length) {
    issues.push(issue({
      id: ISSUE_KINDS.empty,
      kind: ISSUE_KINDS.empty,
      severity: 'high',
      title: '章节没有可发布正文',
      detail: '先补充正文或场景标题，再进行发布检查。',
      blocking: true
    }))
  }

  const orphanAnnotations = annotations.filter((annotation) => annotation?.status === 'orphaned')
  orphanAnnotations.forEach((annotation) => {
    issues.push(issue({
      id: `${ISSUE_KINDS.orphan}:${annotation.id}`,
      kind: ISSUE_KINDS.orphan,
      severity: 'high',
      title: '批注失去定位',
      detail: text(annotation.body).slice(0, 180) || '这条批注无法回到正文位置。',
      annotationId: annotation.id,
      unitId: annotation.target?.unitId || annotation.range?.start?.unitId,
      unitRevision: annotation.target?.unitRevision ?? annotation.range?.start?.unitRevision,
      nodeId: annotation.target?.nodeId || annotation.range?.start?.nodeId || annotation.nodeId || annotation.blockId,
      nodeRevision: annotation.target?.nodeRevision ?? annotation.range?.start?.nodeRevision ?? annotation.nodeRevision ?? annotation.blockRevision,
      blocking: true
    }))
  })

  annotations
    .filter((annotation) => (
      annotation?.kind === 'review-finding' && annotation.status === 'open'
    ))
    .forEach((annotation) => {
      const high = annotation.severity === 'high'
      issues.push(issue({
        id: `${ISSUE_KINDS.review}:${annotation.id}`,
        kind: ISSUE_KINDS.review,
        severity: high ? 'high' : 'medium',
        title: high ? '高优先级审查问题未处理' : '审查问题未处理',
        detail: text(annotation.body).slice(0, 180) || '这条审查发现仍处于待处理状态。',
        annotationId: annotation.id,
        unitId: annotation.target?.unitId || annotation.range?.start?.unitId,
        unitRevision: annotation.target?.unitRevision ?? annotation.range?.start?.unitRevision,
        nodeId: annotation.target?.nodeId || annotation.range?.start?.nodeId || annotation.nodeId || annotation.blockId,
        nodeRevision: annotation.target?.nodeRevision ?? annotation.range?.start?.nodeRevision ?? annotation.nodeRevision ?? annotation.blockRevision,
        blocking: high
      }))
    })

  if (recoveryDraft) {
    issues.push(issue({
      id: ISSUE_KINDS.recovery,
      kind: ISSUE_KINDS.recovery,
      severity: 'high',
      title: '存在未保存恢复草稿',
      detail: '当前章节有尚未写入正文存储的恢复副本，先恢复或丢弃后再发布。',
      blocking: true
    }))
  }

  if (saveStatus === 'unsaved' || saveStatus === 'saving') {
    issues.push(issue({
      id: ISSUE_KINDS.unsaved,
      kind: ISSUE_KINDS.unsaved,
      severity: 'high',
      title: saveStatus === 'saving' ? '正文正在保存' : '正文尚未保存',
      detail: '等待保存完成，避免发布内容落后于当前编辑面。',
      blocking: true
    }))
  }

  proseBlocks.forEach((block) => {
    if (block.text.length <= 1600) return
    issues.push(issue({
      id: `${ISSUE_KINDS.longBlock}:${block.nodeId}`,
      kind: ISSUE_KINDS.longBlock,
      severity: 'medium',
      title: '单个正文片段过长',
      detail: `当前片段约 ${block.text.length.toLocaleString()} 字，建议拆成更易审阅的段落。`,
      unitId: block.unitId,
      unitRevision: block.unitRevision,
      nodeId: block.nodeId,
      nodeRevision: block.nodeRevision
    }))
  })

  for (let index = 1; index < proseBlocks.length; index += 1) {
    const previous = proseBlocks[index - 1]
    const current = proseBlocks[index]
    const previousKey = normalizeForComparison(previous.text)
    const currentKey = normalizeForComparison(current.text)
    if (previousKey.length < 24 || previousKey !== currentKey) continue
    issues.push(issue({
      id: `${ISSUE_KINDS.duplicate}:${current.nodeId}`,
      kind: ISSUE_KINDS.duplicate,
      severity: 'medium',
      title: '相邻正文片段高度重复',
      detail: '相邻片段清洗后的正文相同，建议确认是否为重复粘贴或有意复述。',
      unitId: current.unitId,
      unitRevision: current.unitRevision,
      nodeId: current.nodeId,
      nodeRevision: current.nodeRevision
    }))
  }

  if (proseBlocks.length >= 3 && !blocks.some((block) => block.kind === 'scene-heading')) {
    issues.push(issue({
      id: ISSUE_KINDS.noScene,
      kind: ISSUE_KINDS.noScene,
      severity: 'low',
      title: '章节没有场景边界',
      detail: '当前章节仍可发布，但后续定位、审稿和分镜拆分会更困难。'
    }))
  }

  const severityRank = (item) => SEVERITY_ORDER[item.severity] ?? 9
  const orderedIssues = issues
    .sort((left, right) => severityRank(left) - severityRank(right))
    .slice(0, Math.max(1, Number(maxIssues) || 24))
  const blockingCount = issues.filter((item) => item.blocking).length
  const warningCount = issues.filter((item) => item.severity === 'medium').length
  const infoCount = issues.filter((item) => item.severity === 'low').length

  return {
    schemaVersion: WRITING_QUALITY_SCHEMA_VERSION,
    status: blockingCount ? 'blocked' : warningCount ? 'attention' : 'ready',
    issues: orderedIssues,
    summary: {
      total: issues.length,
      blockers: blockingCount,
      warnings: warningCount,
      info: infoCount,
      openAnnotations: annotations.filter((annotation) => annotation?.status === 'open').length,
      orphanAnnotations: orphanAnnotations.length,
      snapshots: Array.isArray(snapshots) ? snapshots.length : 0,
      blockHistory: Array.isArray(blockHistory) ? blockHistory.length : 0,
      hasRecoveryDraft: Boolean(recoveryDraft)
    }
  }
}

export const WRITING_QUALITY_ISSUE_KINDS = ISSUE_KINDS
