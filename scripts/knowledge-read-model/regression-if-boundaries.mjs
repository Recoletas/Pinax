import assert from 'node:assert/strict'
import { createIfExperiment, freezeIfExperiment, validateIfSemanticIdentity, staleIfExperiment, recordIfProposals, advanceIfBranchGeneration } from '../../src/services/project/characterIf/contract.js'

const input = {
  experimentId: 'regression', projectId: 'book', targetRef: { chapterId: 'c' },
  baselineFacts: [{ ref: 'f', text: '门已关闭', metadata: { confirmed: true } }],
  sourceRevisions: { f: 'r1' }, actorRef: 'character:a',
  beliefA: '守诺', beliefB: '协商', modelConfig: { model: 'offline' }
}
const { experiment } = createIfExperiment(input)
assert.equal(freezeIfExperiment(experiment)?.lifecycle, 'frozen')
input.baselineFacts[0].metadata.confirmed = false
assert.equal(experiment.baselineFacts[0].metadata.confirmed, true)
for (const patch of [
  { baselineFacts: [{ ref: 'f', text: '门已打开' }] },
  { targetRef: { chapterId: 'other' } }, { actorRef: 'character:other' },
  { projectId: 'other' }, { sourceRevisions: { f: 'r2' } },
  { modelConfig: { model: 'other' } }, { branches: {} }
]) assert.equal(validateIfSemanticIdentity({ ...experiment, ...patch }).ok, false)
for (const terminal of [
  staleIfExperiment(experiment), { ...experiment, lifecycle: 'cancelled' },
  { ...experiment, branches: { ...experiment.branches, A: { ...experiment.branches.A, lifecycle: 'failed' } } }
]) {
  assert.equal(recordIfProposals(terminal, 'A', { proposals: [] }, 1).ok, false)
  assert.equal(advanceIfBranchGeneration(terminal, 'A', '新条件').ok, false)
  assert.equal(freezeIfExperiment(terminal), null)
}
assert.equal(advanceIfBranchGeneration(experiment, 'A', ' ').ok, false)
const next = advanceIfBranchGeneration(experiment, 'A', '新条件').experiment
assert.equal(next.beliefA, '新条件')
assert.equal(next.branches.B, experiment.branches.B)
assert.equal(recordIfProposals(next, 'A', { proposals: [] }, 1).ok, false)
console.log('IF regression: freeze, snapshot isolation, baseline integrity, terminal and generation guards OK')
