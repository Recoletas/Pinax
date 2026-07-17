import { describe, expect, it } from 'vitest'
import {
  getTask,
  getTasksBySurface,
  validateTaskType,
  isLegacyAlias,
  LEGACY_ALIASES
} from '../services/agents/agentTaskRegistry'
import {
  buildContextEnvelope,
  addBlock,
  clipContextEnvelope,
  toPromptText,
  BLOCK_KINDS
} from '../services/agents/agentContextEnvelope'
import {
  createPendingResult,
  markCompleted,
  markStale,
  markApplied,
  markFailed,
  markDismissed,
  canApply,
  canDismiss,
  isActive,
  RESULT_STATUSES
} from '../services/agents/agentResultLifecycle'
import {
  adaptLegacyResultToAgentResult,
  adaptAgentResultToLegacy
} from '../services/agents/legacyAdapter'

describe('agentContracts', function () {
  it('covers task registry, context budget, result lifecycle, and legacy compatibility', function () {
    expect(getTask('worldbook.import.structure').surfaces).toContain('worldbook')

    for (var i = 0; i < Object.keys(LEGACY_ALIASES).length; i++) {
      var legacy = Object.keys(LEGACY_ALIASES)[i]
      var canonical = LEGACY_ALIASES[legacy]
      expect(getTask(legacy).id).toBe(canonical)
      expect(isLegacyAlias(legacy)).toBe(true)
    }

    expect(validateTaskType('advisor.fix.paragraph')).toEqual({
      valid: true,
      canonical: 'writing.fix.paragraph'
    })
    expect(validateTaskType('unknown.task')).toEqual({
      valid: false,
      reason: 'unknown-task-type'
    })

    expect(getTasksBySurface('experience').length).toBe(3)
    expect(getTasksBySurface('writing').length).toBeGreaterThanOrEqual(7)
    var envelope = buildContextEnvelope({ surface: 'writing', budget: { maxChars: 70 } })

    var env = addBlock(envelope, BLOCK_KINDS.SYSTEM, 'RULES: 保持语气。', { priority: 1000 })
    env = addBlock(env, BLOCK_KINDS.SELECTION, 'SEL: 她站在灰墙前。', { priority: 800, sourceRefs: ['ch1'] })
    env = addBlock(env, BLOCK_KINDS.HISTORY, 'HIST: ' + 'A'.repeat(60), { priority: 150 })
    env = addBlock(env, BLOCK_KINDS.REFERENCES, 'REFS: 索德码头。', { priority: 350, sourceRefs: ['e1'] })
    env = addBlock(env, BLOCK_KINDS.MEMORY, 'MEM: ' + 'B'.repeat(40), { priority: 400, sourceRefs: ['m1'] })

    var clipped = clipContextEnvelope(env)
    var kinds = clipped.blocks.map(function (b) { return b.kind })

    expect(kinds).toContain('system')
    expect(kinds).toContain('selection')
    expect(clipped.budget.usedChars).toBeLessThanOrEqual(70)
    expect(clipped.dropReport).not.toBeNull()
    expect(clipped.dropReport.dropped.length).toBeGreaterThanOrEqual(1)

    var droppedKinds = clipped.dropReport.dropped.map(function (d) { return d.kind })
    expect(droppedKinds).toContain('history')

    var text = toPromptText(clipped)
    expect(text).toContain('RULES')
    expect(text).toContain('SEL')
    var pending = createPendingResult('writing.fix.selection', { baseRevision: 'rev-1' })
    expect(pending.status).toBe(RESULT_STATUSES.PENDING)
    expect(isActive(pending)).toBe(true)

    var completed = markCompleted(pending, {
      summary: '建议修改语气',
      suggestions: [{ type: 'text-patch', label: 'a', content: 'b' }],
      actions: [{ type: 'text-patch', content: '她停下脚步。', range: { start: 0, end: 5 } }]
    })
    expect(canApply(completed, 'rev-1')).toBe(true)

    var stale = markStale(completed, 'base-text-changed', 'rev-2')
    expect(stale.status).toBe(RESULT_STATUSES.STALE)
    expect(canApply(stale, 'rev-2')).toBe(false)

    var applied = markApplied(completed)
    expect(canApply(applied, 'rev-1')).toBe(false)

    var failed = markFailed(completed, { code: 'AGENT_ERROR', message: 'boom' })
    expect(failed.status).toBe(RESULT_STATUSES.FAILED)
    expect(canApply(failed, 'rev-1')).toBe(false)
    expect(canDismiss(failed)).toBe(true)

    var dismissed = markDismissed(completed)
    expect(dismissed.status).toBe(RESULT_STATUSES.DISMISSED)
    expect(canApply(dismissed, 'rev-1')).toBe(false)
    expect(canDismiss(dismissed)).toBe(false)
    expect(canDismiss(applied)).toBe(false)
    expect(canDismiss(pending)).toBe(true)

    var legacyResult = {
      task: 'advisor.fix.selection',
      mode: 'replace',
      summary: '建议修改语气',
      replacement: '她停下脚步。',
      targetRange: { start: 0, end: 5 },
      issues: [{ type: 'review', severity: 'medium', message: '语气太冷' }],
      action: ['修改语气更柔和']
    }

    var agentResult = adaptLegacyResultToAgentResult(legacyResult, 'writing.fix.selection')
    expect(agentResult.status).toBe(RESULT_STATUSES.COMPLETED)
    var replacementAction = agentResult.actions.find(function (a) { return a.content === '她停下脚步。' })
    expect(replacementAction.range).toEqual({ start: 0, end: 5 })

    var legacyOutput = adaptAgentResultToLegacy(agentResult)
    expect(legacyOutput.result.replacement).toBe('她停下脚步。')
    expect(legacyOutput.result.mode).toBe('replace')
  })
})
