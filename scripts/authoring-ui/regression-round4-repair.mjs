// Exercises the actual page functions with provider/repository boundaries stubbed.
// This is not a browser journey or a real-model quality evaluation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const source = fs.readFileSync(new URL('../../src/pages/Authoring.vue', import.meta.url), 'utf8')
function fn(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
}
const confirmSource = fn('async function confirmSceneLaboratoryDirection()', '\nfunction openSceneLaboratoryEvidence')
for (const succeeds of [false, true]) {
  let request
  const context = vm.createContext({
    sceneLaboratory: { selectedDirectionId: 'd1', run: {}, target: {}, open: true },
    authoringTaskBusy: { value: false }, sceneLaboratoryRequestVersion: 1,
    validateAuthoringSceneLaboratoryRun: async () => ({ ok: true, selection: { evidenceRefs: [] }, runSession: {} }),
    sceneLaboratoryAppendRequirement: { value: '不要立即原谅' },
    blockComposerVersion: 1, blockComposer: {}, composerSourceRefs: { value: [] },
    closeSceneLaboratory() {}, nextTick: async () => {},
    runAuthoringTurn: async r => { request = r; return { ok: succeeds, preview: succeeds } }
  })
  await vm.runInContext(confirmSource + '\nconfirmSceneLaboratoryDirection()', context)
  assert.equal(request.instruction, '不要立即原谅')
  assert.equal(context.sceneLaboratoryAppendRequirement.value, succeeds ? '' : '不要立即原谅')
}
const saveSource = fn('async function saveBlockDraftAsExploration()', '\nfunction dismissBlockPreview')
  .replace("await import('../services/writing/authoringDocumentRepository.js')", 'await loadRepository()')
let calls = 0
let resolveSave
const context = vm.createContext({
  saveAsExplorationInProgress: false, blockDraftText: { value: '稿件' },
  characterIfExperiment: { active: { value: null } }, blockPreview: { value: null },
  selectedBookId: { value: 'p1' }, selectedChapterId: { value: 'c1' }, blockComposerVersion: 1,
  authoringTask: { notify() {} }, dismissBlockPreview() { throw Error('Must not dismiss on failure or stale result') },
  loadRepository: async () => ({ createExplorationDocument: async (project, data) => {
    calls++
    assert.equal(project, 'p1')
    assert.equal(data.sourceRefs[0], 'chapter:c1')
    if (calls === 1) throw Error('storage unavailable')
    return await new Promise(resolve => { resolveSave = resolve })
  } })
})
vm.runInContext(saveSource, context)
await vm.runInContext('saveBlockDraftAsExploration()', context)
assert.equal(context.saveAsExplorationInProgress, false)
assert.equal(context.blockDraftText.value, '稿件')
const pending = vm.runInContext('saveBlockDraftAsExploration()', context)
await new Promise(resolve => setTimeout(resolve, 0))
await vm.runInContext('saveBlockDraftAsExploration()', context)
assert.equal(calls, 2)
context.selectedBookId.value = 'p2'
context.blockDraftText.value = '新会话稿件'
resolveSave({ ok: true })
await pending
assert.equal(context.blockDraftText.value, '新会话稿件')
assert.equal(context.saveAsExplorationInProgress, false)
console.log('Page regression: append retry/success, save exception/retry, double click and cross-project late result OK')

const ifSource = fn('async function writeIfBranchDraft(branchId)', '\nasync function startCharacterIfExperiment')
for (const valid of [true, false]) {
  let request
  let stale = false
  const experiment = { projectId: 'p1' }
  const session = { sessionId: 'frozen-session' }
  const scope = vm.createContext({
    characterIfExperiment: {
      isActive: { value: true }, active: { value: experiment }, stale() { stale = true }
    },
    characterIfBranches: { value: { A: { belief: '守诺', lifecycle: 'editing' } } },
    ifPlans: { A: { run: { selectedDirectionId: 'd1' } } },
    ifBusy: { value: false }, authoringTaskBusy: { value: false },
    switchIfDraft() {}, retainIfDraft() {},
    blockPreview: { value: null }, pendingWritingGhost: { value: null },
    normalizeAuthoringFailure: value => value,
    selectedBookId: { value: 'p1' },
    sceneLaboratory: { run: {}, target: {}, open: true },
    sceneLaboratoryRequestVersion: 1, blockComposerVersion: 1, blockComposer: {},
    composerSourceRefs: { value: [] },
    validateAuthoringSceneLaboratoryRun: async () => ({
      ok: valid, selection: { evidenceRefs: ['worldbook-entry:a'] }, runSession: session
    }),
    runAuthoringTurn: async r => { request = r; return { ok: false, reason: 'provider-failed' } }
  })
  assert.equal(await vm.runInContext(ifSource + "\nwriteIfBranchDraft('A')", scope), false)
  assert.equal(scope.ifBusy.value, false)
  if (valid) {
    assert.equal(request.authoringRunSession, session)
    assert.equal(request.sourceRefs[0], 'worldbook-entry:a')
    assert.equal(scope.sceneLaboratory.phase, 'direction-selected')
  } else {
    assert.equal(request, undefined)
    assert.equal(stale, true)
  }
}
console.log('IF entry regression: frozen session forwarding, stale no-call and failure recovery OK')

const activeBranch = { value: 'A' }
const drafts = vm.createContext({
  sceneLaboratory: { target: { chapterId: 'c1' } },
  characterIfActive: { value: true }, characterIfActiveBranch: activeBranch,
  characterIfExperiment: { switchBranch(id) { activeBranch.value = id } },
  ifBranchDrafts: { value: { A: null, B: null } },
  blockPreview: { value: { candidateId: 'a' } }, pendingWritingGhost: { value: { id: 'a' } },
  blockDraftText: { value: 'A 手改稿' }, blockDraftOriginalText: { value: 'A 原稿' },
  previousBlockDraftText: { value: '' }, blockComposer: {},
  ifBusy: { value: false }, authoringTaskBusy: { value: false },
  pendingGhostAdoption: { value: null }, blockAdoptionBusy: { value: false }
})
vm.runInContext(fn('function retainIfDraft()', '\nfunction retryIfDraft'), drafts)
vm.runInContext("switchIfDraft('B')", drafts)
assert.equal(drafts.blockPreview.value, null)
drafts.blockPreview.value = { candidateId: 'b' }
drafts.pendingWritingGhost.value = { id: 'b' }
drafts.blockDraftText.value = 'B 手改稿'
vm.runInContext("switchIfDraft('A')", drafts)
assert.equal(drafts.blockDraftText.value, 'A 手改稿')
assert.equal(drafts.pendingWritingGhost.value.id, 'a')
vm.runInContext("switchIfDraft('B')", drafts)
assert.equal(drafts.blockDraftText.value, 'B 手改稿')
assert.equal(drafts.pendingWritingGhost.value.id, 'b')
drafts.pendingGhostAdoption.value = {}
vm.runInContext("switchIfDraft('A')", drafts)
assert.equal(activeBranch.value, 'B')
console.log('IF draft regression: independent edits/candidates survive A/B switches; adoption locks switching OK')
