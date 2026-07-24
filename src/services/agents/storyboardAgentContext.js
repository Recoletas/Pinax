import { buildContextEnvelope, clipContextEnvelope } from './agentContextEnvelope'
import { createContentRevision } from './creativeGraphAgentContext'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value, limit) {
  const normalized = text(value)
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
}

function normalizeShot(shot, index) {
  if (!shot) return null
  return {
    shotId: text(shot.shotId || shot.nodeId) || String(index + 1),
    sequence: Number(shot.sequence) || index + 1,
    sourceText: clip(shot.sourceText || shot.content, 1200),
    scene: clip(shot.scene, 240),
    visual: clip(shot.visual || shot.tone, 360),
    dialogue: clip(shot.dialogue, 240),
    sound: clip(shot.sound, 180),
    shotType: text(shot.shotType || shot.shotSize),
    cameraMovement: text(shot.cameraMovement || shot.camera),
    transition: text(shot.transition),
    duration: Number(shot.duration) || 0,
    relationType: text(shot.relationType),
    relationLabel: text(shot.relationLabel)
  }
}

export function buildStoryboardAgentContext({
  taskType = 'storyboard.review',
  shots = [],
  shotIndex = 0,
  documentId = '',
  versionId = '',
  projectId = ''
} = {}) {
  const index = Math.max(0, Math.min(shots.length - 1, Number(shotIndex) || 0))
  const selected = normalizeShot(shots[index], index)
  const previous = index > 0 ? normalizeShot(shots[index - 1], index - 1) : null
  const next = index < shots.length - 1 ? normalizeShot(shots[index + 1], index + 1) : null
  const revision = createContentRevision({ documentId, versionId, selected, previous, next })
  const targetType = taskType === 'storyboard.video.prompt'
    ? 'storyboard-shot-generation'
    : 'storyboard-shot'
  const sourceRefs = [
    versionId ? `storyboard-version:${versionId}` : '',
    selected?.shotId ? `storyboard-shot:${selected.shotId}` : '',
    previous?.shotId ? `storyboard-shot:${previous.shotId}` : '',
    next?.shotId ? `storyboard-shot:${next.shotId}` : ''
  ].filter(Boolean)
  const envelope = clipContextEnvelope(buildContextEnvelope({
    surface: 'storyboard',
    projectId,
    target: { type: targetType, id: selected?.shotId || null, revision },
    blocks: [
      {
        kind: 'rules',
        priority: 1000,
        content: {
          taskType,
          constraints: [
            '只能修改当前镜头，不能新增、删除或重排镜头',
            '连续性判断只使用当前镜头及相邻镜头',
            'generation request 只准备提示词，不提交媒体任务'
          ]
        },
        sourceRefs: [`task:${taskType}`]
      },
      {
        kind: 'selection',
        priority: 900,
        content: { selected },
        sourceRefs: selected?.shotId ? [`storyboard-shot:${selected.shotId}`] : []
      },
      {
        kind: 'scene',
        priority: 780,
        content: { previous, next },
        sourceRefs: sourceRefs.filter((ref) => ref.startsWith('storyboard-shot:'))
      },
      {
        kind: 'references',
        priority: 700,
        content: {
          continuity: {
            previousAnchor: previous?.visual || previous?.sourceText || '',
            currentAnchor: selected?.visual || selected?.sourceText || '',
            nextAnchor: next?.visual || next?.sourceText || ''
          },
          documentId: text(documentId),
          versionId: text(versionId)
        },
        sourceRefs
      }
    ],
    budget: { maxChars: 12000 }
  }))

  return {
    envelope,
    revision,
    target: {
      ...envelope.target,
      documentId: text(documentId),
      versionId: text(versionId),
      allowedShotId: selected?.shotId || '',
      allowedEvidenceRefs: [...new Set(envelope.blocks.flatMap((block) => block.sourceRefs || []))]
    }
  }
}

