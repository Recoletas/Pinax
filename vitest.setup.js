import { uiLocale } from './src/i18n/index.js'
import { toHaveNoViolations } from 'vitest-axe/matchers'
import { expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

expect.extend({ toHaveNoViolations })

// jsdom does not implement Range layout. Supply geometry only in this
// non-visual test environment; real browser journeys still use native layout.
for (const method of ['getClientRects', 'getBoundingClientRect']) {
  if (!Range.prototype[method]) {
    Object.defineProperty(Range.prototype, method, {
      configurable: true,
      value: method === 'getClientRects'
        ? () => Object.assign([], { item: () => null })
        : () => new DOMRect(0, 0, 0, 0)
    })
  }
}

beforeEach(() => {
  uiLocale.value = 'zh-CN'
  setActivePinia(createPinia())
})
