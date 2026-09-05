export function createBrowserStorageRepository(storage = globalThis.localStorage) {
  return Object.freeze({
    kind: 'browser-compatibility',
    getText: (key) => storage.getItem(key),
    setText: (key, value) => storage.setItem(key, String(value)),
    getJson(key, fallback = null) {
      const raw = storage.getItem(key)
      if (raw === null) return fallback
      try { return JSON.parse(raw) } catch { return fallback }
    },
    setJson: (key, value) => storage.setItem(key, JSON.stringify(value)),
    remove: (key) => storage.removeItem(key)
  })
}
