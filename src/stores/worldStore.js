import { defineStore } from 'pinia'
import { createWorldbookStateModule } from '@pinax/core/worldbook/worldbookState'
import { recoverAssistantEdits } from '../services/storage/assistantEditJournal.js'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../composables/useStorage'
import { resolvePlaceEntity } from '../services/worldHistory/placeEntity'
import {
  getPlaceDeleteImpact as getCatalogPlaceDeleteImpact,
  getPlaceSourceRevision,
  listPlaceEntries,
  preparePlaceForWrite
} from '../services/worldbook/worldbookPlaceCatalog'
import { archiveSourceDocuments } from '../services/worldbook/worldbookSourceArchive'
import {
  isFileSourceAvailable,
  resolveWorldbookLoadSource,
  resolveWorldbookProjectRoot,
  saveWorldbookToFiles
} from '../services/worldbook/worldbookFileRepository'

const binding = createWorldbookStateModule({ recoverAssistantEdits, getItem, setItem, removeItem, STORAGE_KEYS, resolvePlaceEntity, getCatalogPlaceDeleteImpact, getPlaceSourceRevision, listPlaceEntries, preparePlaceForWrite, archiveSourceDocuments, isFileSourceAvailable, resolveWorldbookLoadSource, resolveWorldbookProjectRoot, saveWorldbookToFiles, getStore: () => useWorldStore(), WORLDBOOKS_INDEX_KEY: 'worldbooks_index', WORLDBOOK_KEY_PREFIX: 'worldbook_', ACTIVE_WORLDBOOK_ID_KEY: 'active_worldbook_id' })

export const useWorldStore = defineStore('world', binding.options)
export const { readWorldbookSnapshot, worldbookEntryEditFingerprint } = binding
