import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeSourceRefs } from './narrativeAssets'
import { createStoryboardRepository } from '@pinax/core/media/storyboardStore'

export const { STORYBOARD_SCHEMA_VERSION, normalizeStoryboardShot, normalizeStoryboardShots, validateStoryboardShots, createStoryboardValidationResult, createStoryboardSourceRef, createStoryboardVersion, createStoryboardDocument, saveStoryboardDocument, saveStoryboardVersion, saveValidatedStoryboardVersion, listStoryboardDocuments, getStoryboardDocument, getCurrentStoryboardVersion, listStoryboardVersions, getStoryboardVersion, restoreStoryboardVersion, createStoryboardSnapshot, saveStoryboardSnapshot, listStoryboardSnapshots, getLatestStoryboardSnapshot, restoreStoryboardSnapshot } = createStoryboardRepository({ getItem, setItem, storageKeys: STORAGE_KEYS, normalizeSourceRefs })
