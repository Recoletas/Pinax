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
import { buildWorldbookLocationMarkers, buildMapNativePlaceInventory, buildWorldbookPlaceInventory } from '../services/ai/worldbookMapBridge.js'
import { createSettingsMaintenanceWorkflow } from '../services/agents/settings/settingsMaintenanceWorkflow.js'
import { buildWorldbookMapBasis, constrainMapConfigToWorldbook } from '../services/ai/worldbookMapGeneration.js'
import { parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter.js'

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
    const map = {
      width: 600, height: 400, seed: 'authored-place-audit',
      cells: { length: 2, p: [100, 100, 400, 250], h: [30, 32], s: [10, 70], state: [1, 1] },
      burgs: [{ i: 0 }, { i: 1, name: 'Crownhaven', x: 100, y: 100, cell: 0, population: 80, capital: true, state: 1 }],
      states: [{ i: 0 }, { i: 1, name: 'Aethoria' }]
    }
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const panel = readFileSync(resolve(__dirname, '../components/worldbook/StructuredSettingsPanel.vue'), 'utf8')
    const card = readFileSync(resolve(__dirname, '../components/worldbook/SettingFieldCard.vue'), 'utf8')
    expect(panel).toContain('if (!(await flushAll())) return false')
    expect(panel).toContain('onBeforeRouteLeave(flushAll)')
    expect(panel).toContain('onBeforeRouteUpdate(flushAll)')
    expect(panel).toContain('if (!(await selectSection(item.section.key))) return')
    expect(card).toContain("if (dirty.state.value === 'error') dirty.markDirty(props.modelValue, lastCommitted.value)")
    const generic = { id: 'places', entries: [{ id: 'town', type: 'location', name: '新城', content: '一处待定位的小城。' }] }
    const oldCandidate = { id: 'old', worldbookId: 'places', worldbookEntryId: 'town', source: 'worldbook', sourceEntryId: 'worldbook:town', name: '新城', x: 100, y: 100, mapObjectId: 'burg:1', bindingStatus: 'auto-matched', bindingMethod: 'relation' }
    expect(buildWorldbookLocationMarkers(generic, map)).toEqual([])
    expect(buildWorldbookLocationMarkers(generic, map, [oldCandidate])).toEqual([])
    expect(buildMapNativePlaceInventory(map, generic, [oldCandidate])[0].status).toBe('previewed')
    const confirmed = { ...oldCandidate, bindingStatus: 'confirmed' }
    expect(buildWorldbookLocationMarkers(generic, map, [confirmed])[0].bindingStatus).toBe('confirmed')
    expect(buildMapNativePlaceInventory(map, generic, [confirmed])[0].status).toBe('linked')
    const lighthouse = { id: 'places', entries: [{ id: 'light', type: 'location', name: '北岬灯塔', content: '雾港以北两公里的建筑物，并非城市。' }] }
    expect(buildWorldbookPlaceInventory(lighthouse, { mapData: map })[0].kind).toBe('site')
    expect(buildWorldbookLocationMarkers(lighthouse, map)).toEqual([])
    const exact = { id: 'places', entries: [{ id: 'same', type: 'location', name: 'Crownhaven', content: '已命名聚落。' }] }
    expect(buildWorldbookLocationMarkers(exact, map)[0].bindingMethod).toBe('exact')
    const manual = { ...oldCandidate, bindingMethod: 'manual-pending', bindingMapSeed: map.seed, x: 180, y: 140 }
    expect(buildWorldbookLocationMarkers(generic, map, [manual])[0])
      .toMatchObject({ x: 180, y: 140, bindingStatus: 'auto-matched', bindingMethod: 'manual-pending' })
    expect(buildWorldbookLocationMarkers(generic, { ...map, seed: 'next-map' }, [manual])).toEqual([])
    const localBasis = buildWorldbookMapBasis({ id: 'local', structuredSettings: { world: { geography: '雾港是一座小港，只画港口与北侧两公里海岸；北岬灯塔位于岩岬。' } }, entries: [] })
    expect(localBasis).toMatchObject({ ok: true, scope: 'local', namingStyle: 'chinese', coastal: true })
    expect(localBasis.overview).toContain('北岬灯塔')
    const localConfig = constrainMapConfigToWorldbook({ stateCount: 8, burgDensity: 1, namingStyle: 'european', burgNames: ['Crownhaven'] }, localBasis)
    expect(localConfig).toMatchObject({ geographicScope: 'local', authoredPlacesOnly: true, width: 1200, height: 800, pointCount: 12000, stateCount: 0, burgDensity: 0, namingStyle: 'chinese', heightmapTemplate: 'peninsula', burgNames: [], kmPerPixel: 0.005 })
    const worldBasis = buildWorldbookMapBasis({ worldDescription: '整张世界地图由三个大陆和八个国家构成，其中有海岸小镇。' })
    expect(worldBasis.scope).toBe('world')
    for (const kind of ['port', 'town', 'village', 'site']) {
      const book = { entries: [{ id: kind, type: 'location', name: 'Northcape', kind, scale: 'unknown', content: '作者确认的地点。' }] }
      const basis = buildWorldbookMapBasis(book)
      expect(basis.scope, kind).toBe('local')
      expect(basis.locations[0].name).toBe('Northcape')
      expect(buildWorldbookMapBasis(book, { scope: 'world' }).scope).toBe('world')
    }
    for (const overview of ['故事在白沙渔村。', '故事发生在一个港湾内。', 'The story takes place in a village.']) {
      expect(buildWorldbookMapBasis({ structuredSettings: { world: { geography: overview } } }).scope).toBe('local')
    }
    expect(buildWorldbookMapBasis({ entries: [{ id: 'region', type: 'location', name: '白沙地区', kind: 'region', content: '范围包括沿海渔村与内陆高原。' }] }).scope).toBe('world')
    expect(constrainMapConfigToWorldbook({ stateCount: 8, burgDensity: 1 }, worldBasis)).toMatchObject({ stateCount: 8, burgDensity: 1 })
    expect(buildWorldbookMapBasis({ description: '自动创建的默认世界书' }).ok).toBe(false)
    expect(() => constrainMapConfigToWorldbook({}, { ok: false, reason: '缺少地理来源' })).toThrow('缺少地理来源')
    expect(parseVoronoiMapConfig({ stateCount: 0, burgDensity: 0 }).config).toMatchObject({ stateCount: 0, burgDensity: 0 })
    const { generateMap, generateMapAsync } = await import('../services/world-map/engine/generate.ts')
    const smallMapConfig = { ...localConfig, width: 400, height: 300, pointCount: 500, seed: 'authored-local-regression' }
    for (const terrain of [generateMap(smallMapConfig), await generateMapAsync(smallMapConfig)]) {
      expect(Array.from(terrain.cells.h).filter(height => height >= 20).length).toBeGreaterThan(50)
      expect(terrain.states.filter(state => state.i > 0)).toHaveLength(0)
      expect(terrain.burgs.filter(burg => burg.i > 0)).toHaveLength(0)
      expect(terrain.rivers.filter(river => river.name)).toHaveLength(0)
    }
    const fullWorld = generateMap({ width: 400, height: 300, pointCount: 500, seed: 'world-scope-regression', stateCount: 3, burgDensity: 0.7, namingStyle: 'chinese' })
    expect(fullWorld.states.filter(state => state.i > 0).length).toBeGreaterThan(0)
    expect(fullWorld.burgs.filter(burg => burg.i > 0).length).toBeGreaterThan(0)
    const { renderScaleBarLayer } = await import('../services/world-map/engine/renderer.ts')
    const scaleContext = Object.fromEntries(['clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'save', 'restore'].map(name => [name, vi.fn()]))
    const scaleCanvas = { getContext: () => scaleContext }
    renderScaleBarLayer(scaleCanvas, { width: 1200, height: 800 }, { kmPerPixel: 0.005, stylePreset: 'topographic' })
    expect(scaleContext.fillText).toHaveBeenCalledWith('1公里', expect.any(Number), expect.any(Number))
    expect(scaleContext.fillRect.mock.calls[0][2]).toBeLessThan(250)
    scaleContext.fillText.mockClear()
    renderScaleBarLayer(scaleCanvas, { width: 1200, height: 800 }, { kmPerPixel: 0.001, stylePreset: 'topographic' })
    expect(scaleContext.fillText).toHaveBeenCalledWith('200米', expect.any(Number), expect.any(Number))
    const { runStructuredGeneration } = await import('../../server/services/structuredGenerationRunner.js')
    const placeDraft = { name: '北岬灯塔', kind: 'site', scale: 'local', description: '雾港以北的海岸灯塔。', evidence: '北岬灯塔位于雾港以北。', aliases: [], parentRef: '', factionRef: '', terrainHints: ['coast'], relations: [] }
    const toolResponse = { ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_setting_draft', input: { places: [placeDraft] } }] }) }
    const providerFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{"places":\n```' }] }) })
      .mockResolvedValue(toolResponse)
    const extractionRequest = {
      schemaVersion: 1, schemaId: 'setting-places.v1', requestId: 'place-protocol-fallback',
      provider: { id: 'anthropic', format: 'anthropic', baseUrl: 'https://example.test/anthropic', apiKey: 'test-key', model: 'test-model' },
      target: { worldbookId: 'places', worldbookRevision: 'r1', sectionKey: 'world', fieldKeys: ['geography'] },
      context: { sourceExcerpts: placeDraft.evidence }, options: { maxTokens: 3000 }
    }
    const protocolCache = new Map()
    const extractedResult = await runStructuredGeneration(extractionRequest, { fetchImpl: providerFetch, cache: protocolCache })
    expect(extractedResult).toMatchObject({ mode: 'forced-tool', drafts: { places: [expect.objectContaining({ name: '北岬灯塔' })] } })
    expect(providerFetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(providerFetch.mock.calls[0][1].body)
    const secondBody = JSON.parse(providerFetch.mock.calls[1][1].body)
    expect(firstBody.output_config).toBeTruthy()
    expect(secondBody.tool_choice).toEqual({ type: 'tool', name: 'submit_setting_draft' })
    expect(secondBody.max_tokens).toBe(firstBody.max_tokens)
    await runStructuredGeneration({ ...extractionRequest, requestId: 'place-cached-protocol' }, { fetchImpl: providerFetch, cache: protocolCache })
    expect(JSON.parse(providerFetch.mock.calls[2][1].body).tool_choice).toBeTruthy()
    const fullDocument = JSON.stringify({ places: [placeDraft] })
    const textReply = (value, stop_reason = 'end_turn') => ({ ok: true, status: 200, json: async () => ({ stop_reason, content: [{ type: 'text', text: value }] }) })
    const textCache = new Map()
    const textFetch = vi.fn().mockResolvedValue(textReply(`\x60\x60\x60json\n${fullDocument}\n\x60\x60\x60`))
    const textResult = await runStructuredGeneration(extractionRequest, { fetchImpl: textFetch, cache: textCache })
    expect(textResult).toMatchObject({ mode: 'text-json', drafts: { places: [expect.objectContaining({ name: '北岬灯塔' })] } })
    expect([...textCache.values()][0]).toMatchObject({ textJson: true, nativeJsonSchema: false, toolCalls: null })
    await runStructuredGeneration(extractionRequest, { fetchImpl: textFetch, cache: textCache })
    const textBody = JSON.parse(textFetch.mock.calls[1][1].body)
    expect(textBody.output_config).toBeUndefined()
    expect(textBody.tools).toBeUndefined()
    expect(textBody.messages[0].content).toContain('JSON Schema')
    const forcedTextCache = new Map(protocolCache)
    const forcedTextResult = await runStructuredGeneration(extractionRequest, { fetchImpl: textFetch, cache: forcedTextCache })
    expect(forcedTextResult.mode).toBe('text-json')
    expect([...forcedTextCache.values()][0]).toMatchObject({ toolCalls: false, specificToolChoice: false, strictToolSchema: false, textJson: true })
    for (const invalid of [`说明\n${fullDocument}`, `${fullDocument}\n${fullDocument}`, `\x60\x60\x60json\n${fullDocument}`, `\x60\x60\x60json\n${JSON.stringify({ places: [{ ...placeDraft, kind: 'imaginary' }] })}\n\x60\x60\x60`]) {
      await expect(runStructuredGeneration(extractionRequest, { fetchImpl: vi.fn().mockResolvedValue(textReply(invalid)), cache: new Map() })).rejects.toBeTruthy()
    }
}

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
    const importWorkspace = await readSource('src/pages/WorldbookCreationWorkspace.vue')
    expect(importWorkspace).toMatch(/onMounted\(async \(\) => \{[\s\S]*?await worldStore\.loadWorldbooksIndex\(\)/)
    expect(importWorkspace).toMatch(/const jsonImportMode = ref\(''\)/)
    expect(importWorkspace).toContain(':disabled="busy || !jsonConflictResolved"')
    expect(importWorkspace).toMatch(/async function confirmJsonImport\(\) \{[\s\S]*?!jsonConflictResolved\.value[\s\S]*?return/)
    expect(importWorkspace).toContain('jsonNameConflict.entryCount')
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
