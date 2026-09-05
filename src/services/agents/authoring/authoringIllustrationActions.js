import { listNarrativeAssets, normalizeSourceRefs } from '../../narrativeAssets.js'
import { addNarrativeImageAsset } from '../../media/narrativeImageAssetBridge.js'
import { listMediaAssets } from '../../media/mediaAssetStore.js'

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function visualBriefFromImage(image = {}, fallback = null) {
  return image?.generationContext?.authoringVisualBrief
    || image?.authoringVisualBrief
    || image?.generationParams?.authoringVisualBrief
    || fallback
    || null
}

function authoringContentRef(value, { projectId, revisions = {}, excerpt = '' } = {}) {
  if (value && typeof value === 'object') {
    const refType = normalizedText(value.refType || value.type)
    const refId = normalizedText(value.refId || value.id)
    if (!refType || !refId) return null
    const key = `${refType}:${refId}`
    return {
      ...value,
      refType,
      refId,
      projectId: normalizedText(value.projectId || projectId),
      version: normalizedText(value.version || revisions[key]),
      excerpt: normalizedText(value.excerpt || excerpt)
    }
  }
  const raw = normalizedText(value)
  const separator = raw.indexOf(':')
  if (separator <= 0 || separator >= raw.length - 1) return null
  return {
    refType: raw.slice(0, separator),
    refId: raw.slice(separator + 1),
    projectId,
    version: normalizedText(revisions[raw]),
    excerpt: normalizedText(excerpt)
  }
}

export function getAuthoringIllustrationSourceRefs(brief = {}, image = {}) {
  const projectId = normalizedText(brief?.projectId || brief?.source?.projectId || image?.projectId)
  const excerpt = normalizedText(image.prompt || brief?.prompt || brief?.promptSource?.text || '正文插画')
  const revisions = brief?.sourceRevisions && typeof brief.sourceRevisions === 'object'
    ? brief.sourceRevisions
    : {}
  return normalizeSourceRefs([
    ...(Array.isArray(image?.sourceRefs) ? image.sourceRefs : []),
    ...(Array.isArray(brief?.sourceRefs) ? brief.sourceRefs : []),
    ...(image?.mediaAssetId ? [{
      refType: 'image',
      refId: String(image.mediaAssetId),
      projectId,
      excerpt
    }] : [])
  ].map((ref) => authoringContentRef(ref, { projectId, revisions, excerpt })).filter(Boolean), { projectId })
    .filter((ref) => !projectId || !ref.projectId || ref.projectId === projectId)
}

export function validateAuthoringIllustrationInsert({
  image,
  brief,
  freshness,
  projectId,
  documentId,
  storage
} = {}) {
  const resolvedBrief = visualBriefFromImage(image, brief)
  const mediaAssetId = normalizedText(image?.mediaAssetId)
  if (!mediaAssetId) return { ok: false, reason: 'media-asset-missing' }
  if (!resolvedBrief) return { ok: false, reason: 'visual-brief-missing' }
  if (freshness?.fresh !== true || freshness?.stale === true) {
    return { ok: false, reason: freshness?.detached ? 'source-detached' : 'source-stale' }
  }
  if (normalizedText(resolvedBrief.projectId || resolvedBrief?.source?.projectId) !== normalizedText(projectId)) {
    return { ok: false, reason: 'project-mismatch' }
  }
  const targetDocumentId = normalizedText(
    resolvedBrief?.source?.documentId
      || resolvedBrief?.target?.documentId
      || resolvedBrief?.documentId
  )
  if (!targetDocumentId || targetDocumentId !== normalizedText(documentId)) {
    return { ok: false, reason: 'document-mismatch' }
  }
  const media = listMediaAssets({ projectId: normalizedText(projectId), kind: 'image' }, { storage })
    .find((item) => String(item?.id || '') === mediaAssetId)
  if (!media) return { ok: false, reason: 'media-asset-missing' }
  return {
    ok: true,
    mediaAssetId,
    brief: resolvedBrief,
    sourceRefs: getAuthoringIllustrationSourceRefs(resolvedBrief, image)
  }
}

export async function saveAuthoringIllustrationAsMaterial({
  image,
  brief,
  projectId,
  storage,
  indexedDBImpl,
  binaryStore
} = {}) {
  const resolvedBrief = visualBriefFromImage(image, brief)
  const mediaAssetId = normalizedText(image?.mediaAssetId)
  const normalizedProjectId = normalizedText(projectId || resolvedBrief?.projectId || resolvedBrief?.source?.projectId)
  if (!mediaAssetId || !normalizedProjectId) return { ok: false, reason: 'source-missing' }

  const media = listMediaAssets({ projectId: normalizedProjectId, kind: 'image' }, { storage })
    .find((item) => String(item?.id || '') === mediaAssetId)
  if (!media) return { ok: false, reason: 'media-asset-missing' }

  const existing = listNarrativeAssets({ status: null, projectId: normalizedProjectId, kind: 'reference-image' })
    .find((asset) => String(asset?.image?.mediaAssetId || '') === mediaAssetId)
  if (existing) return { ok: true, reused: true, asset: existing }

  const prompt = normalizedText(image?.prompt || resolvedBrief?.prompt || resolvedBrief?.proseExcerpt)
  const sourceLabel = normalizedText(
    resolvedBrief?.source?.title
      || resolvedBrief?.target?.title
      || image?.sourceTitle
      || '当前正文'
  )
  try {
    const asset = await addNarrativeImageAsset({
      projectId: normalizedProjectId,
      kind: 'reference-image',
      status: 'accepted',
      title: sourceLabel ? `${sourceLabel} · 插画` : '正文插画',
      content: prompt || '正文画师生成的插画候选',
      source: {
        type: 'image',
        id: mediaAssetId,
        label: '正文画师'
      },
      sourceRefs: getAuthoringIllustrationSourceRefs(resolvedBrief || {}, image),
      image: {
        mediaAssetId,
        alt: prompt || sourceLabel || '正文插画',
        presentation: image?.presentation
      }
    }, { storage, indexedDBImpl, binaryStore })
    return { ok: true, reused: false, asset }
  } catch (error) {
    return { ok: false, reason: 'material-save-failed', error }
  }
}
