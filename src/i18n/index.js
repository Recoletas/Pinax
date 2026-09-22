import { createI18n } from 'vue-i18n'
import { ref } from 'vue'
import coreTranslations from './en.json'
import toolTranslations from './tools.en.json'
import sidebarTranslations from './sidebar.en.json'
import memoryTranslations from './memory.en.json'
import memoryNoticeTranslations from './memory-notice.en.json'
import settingsShellTranslations from './settings-shell.en.json'
import settingInspectorTranslations from './setting-inspector.en.json'
import structuredTranslations from './structured.en.json'
import sourcesTranslations from './sources.en.json'
import entriesTranslations from './entries.en.json'

const translations = { ...memoryTranslations, ...memoryNoticeTranslations, ...sidebarTranslations, ...settingsShellTranslations, ...settingInspectorTranslations, ...structuredTranslations, ...sourcesTranslations, ...entriesTranslations, ...coreTranslations, ...toolTranslations }

// Device-only preferences intentionally excluded from workspace backups.
const PREFERENCE_KEY = 'pinax-device-language'
function readPreference() {
  try { return JSON.parse(localStorage.getItem(PREFERENCE_KEY) || 'null') } catch { return null }
}
function initialLocale() {
  const saved = readPreference()?.uiLocale
  if (['zh-CN', 'en'].includes(saved)) return saved
  try {
    // Persist the initial choice before other app preferences are created.
    const preferred = navigator.languages?.find(language => /^(en|zh)\b/i.test(language))
    const locale = localStorage.length ? 'zh-CN' : /^en\b/i.test(preferred || '') ? 'en' : 'zh-CN'
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ uiLocale: locale, assistantLanguage: '' }))
    return locale
  } catch { return 'zh-CN' }
}
const zh = Object.fromEntries(Object.keys(translations).map(key => [key, key]))
export const i18n = createI18n({
  legacy: false, locale: initialLocale(), fallbackLocale: 'zh-CN',
  messageResolver: (messages, key) => messages[key] ?? null,
  messages: { 'zh-CN': zh, en: translations },
  missingWarn: import.meta.env?.DEV, fallbackWarn: import.meta.env?.DEV
})
export const uiLocale = i18n.global.locale
export const assistantLanguage = ref(['zh-CN', 'en'].includes(readPreference()?.assistantLanguage) ? readPreference().assistantLanguage : '')
const reportedMissing = new Set()
export function tr(message, values) {
  // Only application-authored display messages enter here, never manuscript data.
  if (Object.hasOwn(translations, message)) return i18n.global.t(message, values || {})
  if (import.meta.env?.DEV && uiLocale.value === 'en' && /\p{Script=Han}/u.test(message) && !reportedMissing.has(message)) {
    reportedMissing.add(message)
    console.warn('[i18n] Missing English message:', message)
  }
  return message
}
export function formatUiNumber(value) { return Number(value || 0).toLocaleString(uiLocale.value) }
export function setLanguagePreferences(locale, assistant = assistantLanguage.value) {
  if (!['zh-CN', 'en'].includes(locale) || !['', 'zh-CN', 'en'].includes(assistant)) return false
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ uiLocale: locale, assistantLanguage: assistant })) } catch { return false }
  uiLocale.value = locale
  assistantLanguage.value = assistant
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  return true
}
export function getAssistantLanguage() { return assistantLanguage.value || uiLocale.value }
