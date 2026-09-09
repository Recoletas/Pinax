import assert from 'node:assert/strict'
import { createUnifiedObjectAdapter } from '../../src/services/project/unifiedObjects/adapter.js'
const { adapter } = createUnifiedObjectAdapter({ readers: {
  getChapter: async () => ({ revision: 'r2', content: 'chapter' }),
  getExploration: async () => ({ revision: 'r2', content: 'exploration' }),
  getWorldbookEntry: async () => ({ revision: 'r2', content: 'entry' })
} })
for (const type of ['chapter', 'exploration', 'worldbook-entry']) {
  const input = { projectId: 'p', nativeId: 'n', containerId: 'w' }
  assert.equal((await adapter.resolve(type, input)).ok, true)
  assert.equal((await adapter.resolve(type, { ...input, mode: 'pinned' })).reason, 'pinned-revision-required')
  assert.equal((await adapter.resolve(type, { ...input, mode: 'pinned', revision: 'r1' })).reason, 'pinned-revision-unavailable')
  assert.equal((await adapter.resolve(type, { ...input, mode: 'pinned', revision: 'r2' })).object.revision, 'r2')
}
console.log('Pinned regression: 12/12 assertions across all three owners OK')
