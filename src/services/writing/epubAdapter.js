import { createEpubReader } from '@pinax/core/worldbook/epubReader'
export const { normalizeSourceTextFromHtml, extractEpub } = createEpubReader({ loadJsZip: async () => { const module = await import('jszip'); return module.default || module } })
