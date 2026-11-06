import { findWritingBook, loadWritingBooks } from '../writing/writingBooksRepository'
import {
  addComicPanelStageArtifact,
  addComicPanelTake,
  clearComicPanelPendingGeneration,
  clearComicStagePendingRequest,
  listComicPages,
  updateComicPanel,
  updateComicPanelStage
} from './comicPageStore'
import {
  generateImage,
  getImageProviderCapabilities
} from './imageProviderService'
import {
  addGeneratedImageToLibrary,
  getMediaAssetDataUrl,
  listMediaAssets
} from './mediaAssetStore'
import { createComicProductionService } from '@pinax/core/media/comicProductionService'

const module = createComicProductionService({ findWritingBook, loadWritingBooks, addComicPanelStageArtifact, addComicPanelTake, clearComicPanelPendingGeneration, clearComicStagePendingRequest, listComicPages, updateComicPanel, updateComicPanelStage, generateImage, getImageProviderCapabilities, addGeneratedImageToLibrary, getMediaAssetDataUrl, listMediaAssets, fetchDefault: (...args) => globalThis.fetch(...args) })
export const { COMIC_STAGE_LABELS, COMIC_PRODUCTION_ROUTES, getComicProductionRoute, getComicStageInputArtifact, getComicStageInputRevision, getComicStageGate, getComicBatchEligiblePanels, getComicReferenceCapabilityWarnings, resolveComicPanelGenerationReferences, getComicPanelInputRevision, runComicStageGeneration, getComicPersistRetry, listComicPersistRetries, retryComicStagePersist, archiveComicPanelTakeWithRecovery, archiveUploadedComicPanel, recoverArchivedComicRequest, archiveUploadedComicStage, buildComicStagePrompt } = module
export default module.defaultApi
