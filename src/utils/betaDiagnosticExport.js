import { STORAGE_KEYS } from '../composables/useStorage.js'
import { downloadJsonFile, timestampForFilename } from './download.js'
import packageInfo from '../../package.json'

const DIAGNOSTIC_VERSION = 1
const APP_VERSION = packageInfo.version

function parseArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function localStorageBytes(storage) {
  if (!storage) return 0
  let bytes = 0
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) || ''
    const value = storage.getItem(key) || ''
    bytes += (key.length + value.length) * 2
  }
  return bytes
}

function finiteOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function buildBetaDiagnosticReport({
  storage = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  windowRef = globalThis.window,
  now = () => new Date()
} = {}) {
  const books = parseArray(storage?.getItem?.(STORAGE_KEYS.WRITING_BOOKS))
  const chapterCount = books.reduce((total, book) => total + (Array.isArray(book?.chapters) ? book.chapters.length : 0), 0)
  let estimate = null
  let persisted = null

  try {
    estimate = await navigatorRef?.storage?.estimate?.()
  } catch {
    estimate = null
  }
  try {
    persisted = await navigatorRef?.storage?.persisted?.()
  } catch {
    persisted = null
  }

  return {
    schemaVersion: DIAGNOSTIC_VERSION,
    generatedAt: now().toISOString(),
    app: { name: 'Pinax', version: APP_VERSION },
    environment: {
      path: String(locationRef?.pathname || '/'),
      language: String(navigatorRef?.language || ''),
      online: typeof navigatorRef?.onLine === 'boolean' ? navigatorRef.onLine : null,
      userAgent: String(navigatorRef?.userAgent || ''),
      viewport: {
        width: finiteOrNull(windowRef?.innerWidth),
        height: finiteOrNull(windowRef?.innerHeight),
        devicePixelRatio: finiteOrNull(windowRef?.devicePixelRatio)
      }
    },
    storage: {
      localStorageEntryCount: finiteOrNull(storage?.length) ?? 0,
      localStorageBytes: localStorageBytes(storage),
      estimatedOriginUsageBytes: finiteOrNull(estimate?.usage),
      estimatedOriginQuotaBytes: finiteOrNull(estimate?.quota),
      persistentStorage: typeof persisted === 'boolean' ? persisted : null
    },
    writing: {
      bookCount: books.length,
      chapterCount
    },
    privacy: {
      includesManuscriptText: false,
      includesTitlesOrIds: false,
      includesApiKeys: false,
      includesPromptsOrModelResponses: false
    }
  }
}

export async function exportBetaDiagnosticReport(options = {}) {
  const report = await buildBetaDiagnosticReport(options)
  const filename = `pinax-beta-diagnostic-${timestampForFilename()}.json`
  downloadJsonFile(report, filename)
  return { filename, report }
}

export const BETA_DIAGNOSTIC_VERSION = DIAGNOSTIC_VERSION
