import { toHaveNoViolations } from 'vitest-axe/matchers'
import { expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

expect.extend({ toHaveNoViolations })

beforeEach(() => {
  setActivePinia(createPinia())
})
