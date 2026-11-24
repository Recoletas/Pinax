import { readStoredText, writeStoredText } from './writingStorageCodec.js'
import { removeStoredValue } from './writingChapterStorage.js'
export function createBrowserStorageRepository(storage = globalThis.localStorage) {
  return Object.freeze({
    kind: 'browser-compatibility',
    getText: (key) => readStoredText(storage, key),
    setText: (key, value) => writeStoredText(storage, key, String(value)),
    getJson(key, fallback = null) {
      const raw = readStoredText(storage, key)
      if (raw === null) return fallback
      try { return JSON.parse(raw) } catch { return fallback }
    },
    setJson: (key, value) => writeStoredText(storage, key, JSON.stringify(value)),
    remove: (key) => removeStoredValue(storage, key)
  })
}
