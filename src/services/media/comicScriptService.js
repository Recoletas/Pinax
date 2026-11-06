import { getResolvedApiSettings } from '../api'
import { runGenerationTask } from '../generationService'
import { createComicPage, normalizeComicPanelDirection } from './comicPageStore'
import { createComicScriptService } from '@pinax/core/media/comicScriptService'

export const { buildComicScriptMessages, parseComicScript, generateComicPageScript } = createComicScriptService({ getResolvedApiSettings, runGenerationTask, createComicPage, normalizeComicPanelDirection })
