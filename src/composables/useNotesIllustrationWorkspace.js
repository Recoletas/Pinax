import { useNotesIllustrationInteraction } from './useNotesIllustrationInteraction.js'
import { normalizeSourceRefs } from '../services/media/narrativeAssets.js'
import { listMediaAssets, markMediaAssetAccepted } from '../services/media/mediaAssetStore.js'

// Composition boundary for Notes illustration interactions and adoption.
// Generated pixels stay with the workbench; saving/inserting uses the image's
// persisted owner alongside pointer, presentation and teardown contracts.
export function useNotesIllustrationWorkspace(options) {
  const interaction = useNotesIllustrationInteraction(options)
  function reset() {
    interaction.cancelIllustrationDrag()
    interaction.resetSelection()
  }
  function resolveGeneratedImageOwner(image = {}) {
    const media = image.mediaAssetId ? listMediaAssets({}).find((asset) => asset.id === image.mediaAssetId) : null
    if (image.mediaAssetId && !media) throw new Error('图片资产已缺失，请重新选择图片。')
    const projectId = nullableProjectId(media ? media.projectId : image.projectId)
    return {
      projectId,
      mediaAssetId: media?.id || '',
      sourceRefs: normalizeSourceRefs([
        ...(image.sourceRefs || []), ...(media?.sourceRefs || [])
      ], { projectId })
    }
  }
  function acceptGeneratedImageForProject(image, projectId) {
    const owner = resolveGeneratedImageOwner(image)
    const targetProjectId = nullableProjectId(projectId)
    if (owner.projectId !== targetProjectId) throw new Error('图片属于另一作品，不能插入当前素材。')
    if (owner.mediaAssetId && !markMediaAssetAccepted(owner.mediaAssetId, { projectId: targetProjectId })) {
      throw new Error('图片资产已缺失，请重新选择图片。')
    }
    return owner
  }
  return { ...interaction, reset, resolveGeneratedImageOwner, acceptGeneratedImageForProject }
}

function nullableProjectId(value) {
  return value == null ? null : String(value).trim() || null
}
