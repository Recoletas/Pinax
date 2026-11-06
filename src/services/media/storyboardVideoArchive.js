import { getMediaAsset, saveMediaAsset } from './mediaAssetStore.js'
import { videoJobService } from './videoJobService.js'
import { createStoryboardVideoArchive } from '@pinax/core/media/storyboardVideoArchive'

export const { saveStoryboardVideoOriginal } = createStoryboardVideoArchive({ getMediaAsset, saveMediaAsset, videoJobService })
