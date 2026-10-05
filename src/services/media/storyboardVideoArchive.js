import { getMediaAsset, saveMediaAsset } from './mediaAssetStore.js'
import { videoJobService } from './videoJobService.js'

export async function saveStoryboardVideoOriginal(asset, options = {}) {
  if (!asset?.id || !asset.generationJobId || asset.kind !== 'video') throw new Error('视频记录缺少原件来源')
  options.signal?.throwIfAborted()
  const existing = await getMediaAsset(asset.id, options)
  options.signal?.throwIfAborted()
  if (existing && (existing.asset.projectId || null) !== (asset.projectId || null)) throw new Error('视频归属已改变，请重新打开当前镜头')
  if (existing?.blob?.size) return { asset: existing.asset, reused: true }
  const binary = await (options.videoJobService || videoJobService).downloadJobOutput(asset.generationJobId, { signal: options.signal })
  options.signal?.throwIfAborted()
  const latest = await getMediaAsset(asset.id, options)
  options.signal?.throwIfAborted()
  if (!latest || (latest.asset.projectId || null) !== (asset.projectId || null) || latest.asset.generationJobId !== asset.generationJobId) throw new Error('视频记录已改变，请重新打开当前镜头')
  // Clear an old external: ref explicitly so the normal binary-store ref is
  // recorded. Keep the remote link only as provenance/fallback.
  const saved = await saveMediaAsset({ ...latest.asset, storageRef: '', mimeType: binary.type }, { ...options, binary })
  return { asset: saved, reused: false }
}
