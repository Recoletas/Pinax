import { getItem, setItem, removeItem } from '../../composables/useStorage.js'
const key = (worldbookId, entryId, panel) => `worldbook_entry_pending:${JSON.stringify([worldbookId, entryId, panel])}`
export const readEntryPanelDraft = (worldbookId, entryId, panel) => getItem(key(worldbookId, entryId, panel), null)
export const saveEntryPanelDraft = (worldbookId, entryId, panel, value) => setItem(key(worldbookId, entryId, panel), value)
export const clearEntryPanelDraft = (worldbookId, entryId, panel) => removeItem(key(worldbookId, entryId, panel))
