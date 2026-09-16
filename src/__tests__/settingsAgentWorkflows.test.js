import { describe, expect, it, vi } from 'vitest'
import { createSettingsTaskDispatcher } from '../services/agents/settings/settingsTaskDispatcher.js'
import {
  createSettingsEngineWorkflows,
  resolveSettingsWorkflowTask
} from '../services/agents/settings/settingsWorkflowRegistry.js'
import { createSettingsImportWorkflow } from '../services/agents/settings/settingsImportWorkflow.js'
import { createSettingsGenerationWorkflow } from '../services/agents/settings/settingsGenerationWorkflow.js'
import { createSettingsPlaceWorkflow } from '../services/agents/settings/settingsPlaceWorkflow.js'
import { createSettingsResearchWorkflow } from '../services/agents/settings/settingsResearchWorkflow.js'
import { createSettingsMaintenanceWorkflow } from '../services/agents/settings/settingsMaintenanceWorkflow.js'

describe('settings agent task dispatcher', () => {
  it("builds one canonical request and returns a review draft（合并4例）", async () => {
{
const engine = { run: vi.fn(async () => ({ status: 'completed', actions: [{ type: 'setting-draft', payload: { content: '港城终年潮湿' } }] })) }
    const dispatcher = createSettingsTaskDispatcher({ engine, resolveContext: vi.fn(async () => ({ envelope: {}, ledger: {} })) })
    const result = await dispatcher.dispatch('settings.field.complete', {
      project: { id: 'wb-1', revision: 'wb-r2' },
      target: { type: 'setting-field', id: 'geography.climate', revision: 'field-r4' },
      intent: { sectionKey: 'geography', fieldKey: 'climate' }
    })
    expect(engine.run).toHaveBeenCalledOnce()
    const [request, context] = engine.run.mock.calls[0]
    expect(request.surface).toBe('settings')
    expect(request.taskId).toBe('settings.field.complete')
    expect(request.target.revision).toBe('field-r4')
    expect(context.envelope).toEqual({})
    expect(result.actions[0].type).toBe('setting-draft')
}
{
const engine = { run: vi.fn() }
    const resolveContext = vi.fn()
    const dispatcher = createSettingsTaskDispatcher({ engine, resolveContext })
    const result = await dispatcher.dispatch('settings.not.in.catalog', {
      project: { id: 'wb-1', revision: 'r1' },
      target: { type: 'setting-field', revision: 'r1' },
      intent: {}
    })
    expect(result.status).toBe('failed')
    expect(result.error.code).toBe('AGENT_TASK_UNKNOWN')
    expect(engine.run).not.toHaveBeenCalled()
    expect(resolveContext).not.toHaveBeenCalled()
}
{
const settingsIds = [
      'source.parse',
      'settings.import.extract',
      'settings.foundation.generate',
      'settings.candidates.extract',
      'settings.field.complete',
      'settings.character.complete',
      'settings.section.complete',
      'settings.draft.revise',
      'settings.places.extract',
      'settings.place.fleshout',
      'settings.research.plan',
      'settings.research.claims',
      'settings.maintenance.audit'
    ]
    for (const taskId of settingsIds) {
      const resolved = resolveSettingsWorkflowTask(taskId)
      expect(resolved.ok, taskId).toBe(true)
      expect(typeof resolved.adapter).toBe('string')
    }
    const unknown = ['authoring.continue', 'observer.quality.inspect', 'settings.made.up']
    for (const taskId of unknown) {
      expect(resolveSettingsWorkflowTask(taskId).code).toBe('AGENT_TASK_UNKNOWN')
    }
}
{
const adapters = { settingsGeneration: vi.fn(async () => ({ status: 'completed', actions: [] })) }
    const workflows = createSettingsEngineWorkflows(adapters)
    for (const kind of ['local', 'structured-one-shot', 'validated-chain']) {
      expect(typeof workflows[kind]).toBe('function')
    }
    const result = await workflows['structured-one-shot']({
      task: { id: 'settings.field.complete', owner: 'settings', workflowKind: 'structured-one-shot' },
      request: { options: {} },
      context: {}
    })
    expect(result.status).toBe('completed')
    expect(adapters.settingsGeneration).toHaveBeenCalledOnce()

    const missing = createSettingsEngineWorkflows({})
    const unavailable = await missing.local({
      task: { id: 'source.parse', owner: 'settings', workflowKind: 'local' },
      request: {},
      context: {}
    })
    expect(unavailable.error.code).toBe('AGENT_WORKFLOW_UNAVAILABLE')

    const foreign = createSettingsEngineWorkflows(adapters)
    const rejected = await foreign.local({
      task: { id: 'authoring.continue', owner: 'authoring', workflowKind: 'agent-loop' },
      request: {},
      context: {}
    })
    expect(rejected.error.code).toBe('AGENT_TASK_UNKNOWN')
}
})
})

describe('settings import workflow', () => {
  it("parses local sources without provider execution and submits extraction as a review draft（合并3例）", async () => {
{
const parseLocal = vi.fn(async () => ({ status: 'ready', chunks: [{ id: 'c1', text: '港口资料' }] }))
    const extract = vi.fn(async () => ({ entries: [{ name: '潮汐港', content: '港城' }] }))
    const workflow = createSettingsImportWorkflow({ parseLocal, extract })

    const parsed = await workflow.run({ task: { id: 'source.parse' }, request: { intent: { files: ['fixture'] } } })
    expect(parsed.status).toBe('completed')
    expect(parsed.actions[0].type).toBe('cache-write')
    expect(parsed.actions[0].payload.chunks).toHaveLength(1)
    expect(extract).not.toHaveBeenCalled()

    const draft = await workflow.run({
      task: { id: 'settings.import.extract' },
      request: { intent: { sourceChunkIds: ['c1'], targetCount: 8 } },
      context: { envelope: { blocks: [{ kind: 'references', content: '港口资料' }] } }
    })
    expect(draft.actions[0].type).toBe('setting-draft')
    expect(extract).toHaveBeenCalledOnce()
    expect(extract.mock.calls[0][0].sourceText).toContain('港口资料')
    expect(extract.mock.calls[0][0].targetCount).toBe(8)
}
{
const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const workflow = createSettingsImportWorkflow({
      parseLocal: vi.fn(),
      extract: vi.fn(async () => { throw abortError })
    })
    const result = await workflow.run({
      task: { id: 'settings.import.extract' },
      request: { intent: {} },
      context: { envelope: { blocks: [] } }
    })
    expect(result.status).toBe('failed')
    expect(result.error.code).toBe('AGENT_ABORTED')
    expect(result.actions ?? []).toEqual([])
}
{
const workflow = createSettingsImportWorkflow({ parseLocal: vi.fn(), extract: vi.fn() })
    const result = await workflow.run({ task: { id: 'settings.field.complete' }, request: {}, context: {} })
    expect(result.error.code).toBe('AGENT_TASK_UNKNOWN')
}
})
})

describe('settings generation workflow', () => {
  const SERVICE_NAMES = ['generateFoundation', 'generateCandidates', 'generateField', 'generateCharacter', 'generateSection', 'reviseDraft']

  {
const casesK7 = [
    ['settings.foundation.generate', 'generateFoundation'],
    ['settings.candidates.extract', 'generateCandidates'],
    ['settings.field.complete', 'generateField'],
    ['settings.character.complete', 'generateCharacter'],
    ['settings.section.complete', 'generateSection'],
    ['settings.draft.revise', 'reviseDraft']
  ]
it('maps %s to %s and preserves base revision' + '（参数组合并）', async () => {
  const failuresK7 = []
  for (const [caseIndexK7, caseValueK7] of casesK7.entries()) {
    const rowK7 = Array.isArray(caseValueK7) ? caseValueK7 : [caseValueK7]
    try { await (async (taskId, method) => {
    const services = Object.fromEntries(SERVICE_NAMES.map((name) => [name, vi.fn()]))
    services[method].mockResolvedValue({ content: '候选正文', baseRevision: 'r3' })
    const workflow = createSettingsGenerationWorkflow(services)
    const result = await workflow.run({ task: { id: taskId }, request: { target: { revision: 'r3' }, intent: {} }, context: { envelope: {} } })
    expect(services[method]).toHaveBeenCalledOnce()
    expect(result.status).toBe('completed')
    expect(result.actions[0]).toMatchObject({ type: 'setting-draft', baseRevision: 'r3' })
  })(...rowK7) } catch (errorK7) { failuresK7.push('#' + caseIndexK7 + ': ' + (errorK7 && errorK7.message)) }
  }
  if (failuresK7.length) throw new Error(failuresK7.join('\n'))
})
}

  it("keeps batch section results addressable per field for partial recovery（合并3例）", async () => {
{
const batch = new Map([['climate', { ok: false, reason: '校验失败' }]])
    const workflow = createSettingsGenerationWorkflow({ generateSection: vi.fn(async () => batch) })
    const result = await workflow.run({
      task: { id: 'settings.section.complete' },
      request: { target: { revision: 'r7' }, intent: {} },
      context: {}
    })
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].payload.get('climate').ok).toBe(false)
}
{
const workflow = createSettingsGenerationWorkflow({})
    const result = await workflow.run({ task: { id: 'settings.field.complete' }, request: { target: { revision: 'r1' }, intent: {} }, context: {} })
    expect(result.status).toBe('failed')
    expect(result.error.code).toBe('AGENT_WORKFLOW_UNAVAILABLE')
}
{
const workflow = createSettingsGenerationWorkflow({ generateField: vi.fn() })
    const result = await workflow.run({ task: { id: 'source.parse' }, request: {}, context: {} })
    expect(result.error.code).toBe('AGENT_TASK_UNKNOWN')
}
})
})

describe('settings place workflow', () => {
  it("keeps extracted and fleshed-out places as review drafts（合并3例）", async () => {
{
const workflow = createSettingsPlaceWorkflow({
      extractPlaces: vi.fn(async () => [{ name: '旧码头', evidence: ['source:c1'] }]),
      fleshOutPlace: vi.fn(async () => ({ name: '旧码头', climate: '潮湿' }))
    })
    const extracted = await workflow.run({ task: { id: 'settings.places.extract' }, request: { target: { revision: 'r1' }, intent: {} }, context: { envelope: { blocks: [] } } })
    const fleshed = await workflow.run({ task: { id: 'settings.place.fleshout' }, request: { target: { revision: 'r1' }, intent: { placeId: 'p1' } }, context: { envelope: { blocks: [] } } })
    expect(extracted.actions[0].type).toBe('setting-draft')
    expect(fleshed.actions[0].type).toBe('setting-draft')
    expect(extracted.actions[0].baseRevision).toBe('r1')
}
{
const workflow = createSettingsPlaceWorkflow({
      extractPlaces: vi.fn(async () => [
        { name: '旧码头', sourceRefs: ['source:c1'] },
        { name: '灯塔', evidence: ['source:c2'] }
      ]),
      fleshOutPlace: vi.fn()
    })
    const result = await workflow.run({
      task: { id: 'settings.places.extract' },
      request: { target: { revision: 'r1' }, intent: {} },
      context: { envelope: { blocks: [{ kind: 'references', content: 'x', sourceRefs: ['source:c1'] }] } }
    })
    expect(result.actions[0].sourceRefs).toEqual(['source:c1'])
    expect(result.actions[1].sourceRefs).toEqual([])
}
{
const workflow = createSettingsPlaceWorkflow({ extractPlaces: vi.fn(), fleshOutPlace: vi.fn() })
    const result = await workflow.run({ task: { id: 'settings.field.complete' }, request: {}, context: {} })
    expect(result.error.code).toBe('AGENT_TASK_UNKNOWN')
}
})
})

describe('settings research and maintenance workflows', () => {
  it("keeps research claims sourced and maintenance audit read-only（合并4例）", async () => {
{
const research = createSettingsResearchWorkflow({
      planQueries: vi.fn(async () => ['潮汐港 城市史']),
      collectClaims: vi.fn(async () => [{ text: '港口建于旧历三年', sourceRefs: ['url:1'] }])
    })
    const maintenance = createSettingsMaintenanceWorkflow({ audit: vi.fn(async () => [{ issue: '年代冲突' }]) })
    const claims = await research.run({ task: { id: 'settings.research.claims' }, request: { target: { revision: 'r2' }, intent: {} }, context: { envelope: {} } })
    const audit = await maintenance.run({ task: { id: 'settings.maintenance.audit' }, request: { target: { revision: 'r2' }, intent: {} }, context: { envelope: {} } })
    expect(claims.actions[0].type).toBe('setting-draft')
    expect(claims.actions[0].sourceRefs).toEqual(['url:1'])
    expect(audit.actions).toEqual([])
    expect(audit.status).toBe('completed')
    expect(audit.suggestions).toHaveLength(1)
}
{
const research = createSettingsResearchWorkflow({
      planQueries: vi.fn(async () => ['港城 历史', '潮汐 航路']),
      collectClaims: vi.fn()
    })
    const planned = await research.run({ task: { id: 'settings.research.plan' }, request: { target: { revision: 'r2' }, intent: {} }, context: { envelope: {} } })
    expect(planned.status).toBe('completed')
    expect(planned.actions).toEqual([])
    expect(planned.suggestions).toEqual(['港城 历史', '潮汐 航路'])
    expect(research.run({ task: { id: 'settings.research.plan' }, request: { target: { revision: 'r2' }, intent: {} }, context: {} })).resolves.toBeTruthy()
}
{
const timeoutError = new Error('timed out')
    timeoutError.code = 'SEARCH_TIMEOUT'
    const abortedError = new Error('stopped')
    abortedError.name = 'AbortError'
    const research = createSettingsResearchWorkflow({
      planQueries: vi.fn(async () => { throw timeoutError }),
      collectClaims: vi.fn(async () => { throw abortedError })
    })
    const timedOut = await research.run({ task: { id: 'settings.research.plan' }, request: { target: { revision: 'r1' }, intent: {}, options: {} }, context: {} })
    expect(timedOut.status).toBe('failed')
    expect(timedOut.error.code).toBe('AGENT_TIMEOUT')
    expect(timedOut.actions).toEqual([])
    const aborted = await research.run({ task: { id: 'settings.research.claims' }, request: { target: { revision: 'r1' }, intent: {}, options: {} }, context: {} })
    expect(aborted.error.code).toBe('AGENT_ABORTED')
    expect(aborted.actions ?? []).toEqual([])
    const invalid = await research.run({ task: { id: 'settings.research.nope' }, request: { target: { revision: 'r1' }, intent: {}, options: {} }, context: {} })
    expect(invalid.error.code).toBe('AGENT_TASK_UNKNOWN')

    const staleError = new Error('worldbook moved on')
    staleError.code = 'WORLDBOOK_REVISION_STALE'
    const maintenance = createSettingsMaintenanceWorkflow({ audit: vi.fn(async () => { throw staleError }) })
    const stale = await maintenance.run({ task: { id: 'settings.maintenance.audit' }, request: { target: { revision: 'r1' }, intent: {}, options: {} }, context: {} })
    expect(stale.error.code).toBe('AGENT_TARGET_STALE')
}
{
const maintenance = createSettingsMaintenanceWorkflow({ audit: vi.fn() })
    const result = await maintenance.run({ task: { id: 'source.parse' }, request: {}, context: {} })
    expect(result.error.code).toBe('AGENT_TASK_UNKNOWN')
}
})
})

describe('settings dispatcher ownership contract', () => {
  const LEGACY_PROVIDER_CALLS = /\b(generateSettingFieldDraft|generateSettingSectionDraft|tryAiExtractWorldbookJson|runWorldbookMaintenance)\s*\(/

  async function readSource(file) {
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    return readFile(resolve(__dirname, '../..', file), 'utf8')
  }

  it("keeps provider-capable settings calls behind the dispatcher（合并3例）", async () => {
{
const files = [
      'src/pages/WorldbookCreationWorkspace.vue',
      'src/components/worldbook/StructuredSettingsPanel.vue',
      'src/components/worldbook/PlaceCatalog.vue',
      'src/pages/WorldBookEditor.vue',
      'src/services/worldbook/worldbookQuickImportHelpers.js'
    ]
    for (const file of files) {
      const source = await readSource(file)
      expect(source, file).not.toMatch(LEGACY_PROVIDER_CALLS)
      expect(source, file).toMatch(/dispatchSettingsTask|settingsDispatcher/)
    }
}
{
const source = await readSource('src/pages/WorldBookEditor.vue')
    expect(source).toMatch(/'settings\.maintenance\.audit'/)
    expect(source).toMatch(/createSettingsMaintenanceWorkflow/)
}
{
const source = await readSource('src/services/worldbook/worldbookQuickImportHelpers.js')
    expect(source).toMatch(/'settings\.import\.extract'/)
    expect(source).toMatch(/createSettingsImportWorkflow/)
}
})
})
