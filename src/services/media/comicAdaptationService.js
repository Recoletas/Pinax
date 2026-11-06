import { getResolvedApiSettings } from '../api'
import { mergeSourceRefs, normalizeSourceRefs } from './narrativeAssets'
import { buildPlaceEntityIndex } from '../worldHistory/placeEntity'
import { runGenerationStreamTask } from '../generationService'
import { createComicPage, listComicPages, normalizeComicPanelDirection, saveComicPageDraft } from './comicPageStore'
import { createComicAdaptationService } from '@pinax/core/media/comicAdaptationService'

const module = createComicAdaptationService({ getResolvedApiSettings, mergeSourceRefs, normalizeSourceRefs, buildPlaceEntityIndex, runGenerationStreamTask, createComicPage, listComicPages, normalizeComicPanelDirection, saveComicPageDraft })
export const { buildComicReferenceCatalog, buildComicAdaptationMessages, parseComicAdaptationCandidates, generateComicAdaptationCandidates, buildComicPagesFromAdaptation, validateComicAdaptationPlan, saveComicAdaptationPage } = module
export default module.defaultApi
