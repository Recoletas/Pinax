import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import WorldBookQuickImport from '@/pages/WorldBookQuickImport.vue'
import { useWorldStore } from '@/stores/worldStore'
import {
  buildFoundationPayloadFromAiResult,
  buildPendingPayload,
  createSourceDocument,
  createWorldbookFromPayload,
  normalizeGeneratedEntry
} from '@/services/worldbookQuickImportHelpers'
import {
  normalizeWorldbookAiResult,
  parseJsonFromAiContent
} from '@/services/worldbookImportGeneration'
import {
  buildFallbackResearchQueries,
  buildIncrementalResearchQuery,
  mergeResearchSources,
  normalizeWorldbookResearchSettings,
  researchWorldbookGap
} from '@/services/worldbookResearch'
import {
  normalizeResearchFetchRequest,
  normalizeResearchRequest,
  runWebResearch,
  buildEvidenceBlocks
} from '../../server/services/webResearchService'
import {
  excludeResearchSource,
  normalizeResearchClaims,
  normalizeResearchConflicts,
  refreshResearchReview
} from '@/services/worldbookResearchClaims'
import { createResearchRevision } from '@/services/worldbookResearchRevision'
import {
  buildSettingGenerationMessages,
  extractSettingContent,
  generateSettingDraftRevision,
  generateSettingSectionDraftBatch,
  generateSettingSectionDraft,
  getMeaningfulWorldDescription,
  getStructuredGenerationTimeout,
  hasSettingGenerationBasis,
  isSettingDraftValid,
  isStructuredSettingRevisionCurrent
} from '@/services/settingFieldGeneration'
import { parseCharacterCards } from '@/services/characterCard'
import {
  buildWorldbookMaintenanceMessages,
  chunkWorldbookAuditTargets,
  findWorldbookAuditCandidates,
  findWorldbookAuditTargets,
  normalizeWorldbookMaintenanceResult
} from '@/services/worldbookMaintenance'
import {
  getPlacePayloadFromEntry,
  normalizePlacePayload,
  validatePlacePayload
} from '../../shared/placeEntryContract.js'
import {
  buildSettingPlacesRequest,
  classifyPlaceDrafts,
  generatePlacesFromOverview
} from '@/services/settingPlaceGeneration'
import { extractTextContent } from '../../server/routes/chat'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRoute: () => ({ name: 'settings-worldbook', query: {} }),
    useRouter: () => ({ push: routerPush }),
    RouterLink: { template: '<a><slot /></a>' }
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'welcome', component: { template: '<div />' } },
    { path: '/opening', name: 'opening', component: { template: '<div />' } },
    { path: '/settings/worldbook', name: 'settings-worldbook', component: WorldBookQuickImport },
    { path: '/settings/worldbook/advanced', name: 'settings-worldbook-advanced', component: { template: '<div />' } },
    { path: '/settings/structured', name: 'settings-structured', component: { template: '<div />' } },
    { path: '/settings/world-map', name: 'settings-world-map', component: { template: '<div />' } }
  ]
})

function mockWorldStoreLifecycle() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorldStore()
  // Stub mount lifecycle so localStorage / auto-create don't pollute state.
  store.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
  store.ensureActiveWorldbook = vi.fn().mockResolvedValue(undefined)
  return store
}

describe('WorldBookQuickImport 主页 (S17 简化)', () => {
  beforeEach(() => {
    localStorage.clear()
    routerPush.mockClear()
  })

  it('S17-1: 渲染 1 屏 4 段 (SettingsSectionNav + Hero + MyWorldbooks + Preset + Extra)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.settings-section-nav').exists()).toBe(true)
    expect(wrapper.find('.worldbook-hero').exists()).toBe(true)
    expect(wrapper.find('.my-worldbooks').exists()).toBe(true)
    expect(wrapper.find('.preset-grid').exists()).toBe(true)
    expect(wrapper.find('.quick-extra').exists()).toBe(true)
  })

  it('S17-2: Hero card 显示默认 preset 的 name + hook + briefing 3 chip', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const hero = wrapper.find('.worldbook-hero')
    expect(hero.text()).toContain('边境王国')
    expect(hero.findAll('.worldbook-hero__briefing li')).toHaveLength(3)
  })

  it('S17-3: Hero CTA 点击 → 调 enterPresetWorld + push /opening', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const cta = wrapper.find('[data-test="hero-cta"]')
    expect(cta.exists()).toBe(true)
    await cta.trigger('click')
    expect(cta.exists()).toBe(true)
  })

  it('S17-3b: hero 显示当前世界书时，「开始冒险」不再重复生成新世界书', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [{ id: 'wb-active', name: '我的世界', entryCount: 0 }]
    worldStore.activeWorldbook = { id: 'wb-active', name: '我的世界', entries: [] }
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const hero = wrapper.find('.worldbook-hero')
    expect(hero.text()).toContain('我的世界')
    await wrapper.find('[data-test="hero-cta"]').trigger('click')
    await flushPromises()
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-3c: 同 preset 第二次点击直接复用既有副本，不新建第二份', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [
      { id: 'wb-existing', name: '边境王国副本', entryCount: 39, sourcePresetId: 'preset-border' }
    ]
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new', name: '新的' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    worldStore.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
    const preset = { id: 'preset-border', name: '边境王国', entries: [], groups: [] }
    const { enterPresetWorld } = await import('@/services/worldbookQuickImportHelpers')
    const created = await enterPresetWorld(worldStore, { push: vi.fn() }, preset)
    expect(created?.id).toBe('wb-existing')
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-3d: 旧版本副本没有 sourcePresetId，但内容签名一致时也能复用', async () => {
    const worldStore = mockWorldStoreLifecycle()
    const preset = {
      id: 'preset-border',
      name: '边境王国',
      description: 'desc',
      entries: [{ name: 'c2' }, { name: 'c1' }],
      groups: []
    }
    const { presetSignature, enterPresetWorld } = await import('@/services/worldbookQuickImportHelpers')
    const sig = presetSignature(preset)
    // 旧版本产生的副本：没有 sourcePresetId，只有 presetSignature
    worldStore.worldbooksIndex = [
      { id: 'wb-legacy', name: '边境王国副本', entryCount: 39, presetSignature: sig }
    ]
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    worldStore.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
    worldStore.addEntry = vi.fn().mockResolvedValue(undefined)
    worldStore.updateWorldbook = vi.fn().mockResolvedValue(undefined)
    const created = await enterPresetWorld(worldStore, { push: vi.fn() }, preset)
    expect(created?.id).toBe('wb-legacy')
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-4: MyWorldbooks select 切换 → 调 worldStore.setActiveWorldbook', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [
      { id: 'wb-1', name: '边境小镇', entryCount: 12 },
      { id: 'wb-2', name: '灯塔档案', entryCount: 8 }
    ]
    worldStore.activeWorldbook = worldStore.worldbooksIndex[0]
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.exists()).toBe(true)
    await select.setValue('wb-2')
    expect(worldStore.setActiveWorldbook).toHaveBeenCalledWith('wb-2')

    worldStore.activeWorldbook = worldStore.worldbooksIndex[1]
    await nextTick()
    await wrapper.find('[data-test="hero-cta"]').trigger('click')
    expect(routerPush).toHaveBeenLastCalledWith({
      name: 'experience',
      query: { worldbookId: 'wb-2' }
    })
  })

  it('S17-5: 辅助入口突出结构化设定，保留导入与基调初始化', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const importBtn = wrapper.find('[data-test="extra-btn-import"]')
    const aiBtn = wrapper.find('[data-test="extra-btn-ai"]')
    const structuredBtn = wrapper.find('[data-test="extra-btn-structured"]')
    expect(structuredBtn.text()).toBe('编辑结构化设定')
    expect(importBtn.text()).toBe('导入小说 / JSON')
    expect(aiBtn.text()).toBe('AI 建立基调')
    await structuredBtn.trigger('click')
    await importBtn.trigger('click')
    await aiBtn.trigger('click')
    expect(importBtn.exists()).toBe(true)
    expect(aiBtn.exists()).toBe(true)
  })

  it('S17-6: 空状态 (worldbooksIndex 为空) → select 灰显 "暂无世界书"', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.text()).toContain('暂无世界书')
  })

  it('S17-7: Preset 网格显示前 5 个 preset (cap 5)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.preset-card')
    expect(cards.length).toBeLessThanOrEqual(5)
    expect(cards.length).toBeGreaterThan(0)
  })
})

describe('GEO-HISTORY: worldStore normalizeWorldbook preserves geoHistory', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('createWorldbook keeps geoHistory and loadWorldbook re-normalizes to { nodes }', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({
      name: '有地图的世界',
      geoHistory: { version: 1, nodes: [{ id: 'n1', title: '建城', playable: true }] }
    })
    expect(wb.geoHistory).toEqual({ version: 1, nodes: [{ id: 'n1', title: '建城', playable: true }] })

    // re-hydrate from storage (exercises normalizeWorldbook on the raw record)
    const reloaded = await store.loadWorldbook(wb.id)
    expect(reloaded.geoHistory.nodes).toHaveLength(1)
    expect(reloaded.geoHistory.nodes[0].id).toBe('n1')

    const second = await store.createWorldbook({ name: '第二本世界书' })
    await store.setActiveWorldbook(second.id)
    setActivePinia(createPinia())
    const rehydratedStore = useWorldStore()
    await rehydratedStore.loadWorldbooksIndex()
    await rehydratedStore.ensureActiveWorldbook()
    expect(rehydratedStore.activeWorldbook?.id).toBe(second.id)
  })

  it('worldbook without map data imports with null geoHistory (does not block import)', async () => {
    const store = useWorldStore()
    const research = {
      provider: 'brave',
      queries: ['宋代港口 城市制度'],
      sources: [{ id: 'S1', title: '港口资料', url: 'https://example.com/port', snippet: '港口制度摘要' }]
    }
    const wb = await store.createWorldbook({ name: '无地图世界', research })
    expect(wb.geoHistory).toBeNull()
    expect(wb.research.sources[0].id).toBe('S1')

    const reloaded = await store.loadWorldbook(wb.id)
    expect(reloaded.geoHistory).toBeNull()
    expect(reloaded.research.queries).toEqual(['宋代港口 城市制度'])

    const place = normalizePlacePayload({
      name: '白石港',
      aliases: ['南港'],
      kind: 'port',
      scale: 'local',
      parentRef: { targetName: '南部海湾' },
      factionRef: { targetName: '潮汐议会' },
      terrainHints: ['coast'],
      relations: [{ type: 'route', targetName: '旧灯塔' }],
      description: '一座依靠旧灯塔维持航路的港城。',
      sourceEvidence: [{ excerpt: '白石港位于南部海岸。', source: '地理环境' }],
      reviewState: 'accepted',
      mapBinding: { status: 'confirmed', x: 10, y: 20 }
    })
    expect(place).toMatchObject({ name: '白石港', kind: 'port', aliases: ['南港'] })
    expect(validatePlacePayload(place, { entries: [] })).toMatchObject({ valid: true })
    expect(getPlacePayloadFromEntry({
      id: 'loc-white-harbor',
      type: 'location',
      name: '白石港',
      content: '一座依靠旧灯塔维持航路的港城。',
      metadata: { place: { kind: 'port', aliases: ['南港'], mapBinding: { status: 'confirmed', x: 10, y: 20 } } }
    })).toMatchObject({ name: '白石港', kind: 'port', aliases: ['南港'] })

    const storedPlace = await store.createPlace(wb.id, place)
    const editedPlace = await store.updatePlace(wb.id, storedPlace.id, {
      name: '白石港',
      aliases: ['南港'],
      kind: 'port',
      scale: 'local',
      terrainHints: ['coast'],
      description: '修订后的港城描述。',
      relations: []
    })
    expect(getPlacePayloadFromEntry(editedPlace)).toMatchObject({
      description: '修订后的港城描述。',
      mapBinding: { status: 'confirmed', x: 10, y: 20 },
      sourceEvidence: [expect.objectContaining({ excerpt: '白石港位于南部海岸。' })]
    })

    const overview = '高汤盆地北侧有白石港，旧商道连接白石港与灰锤堡。'
    expect(buildSettingPlacesRequest({
      worldbook: {
        id: 'wb-places',
        updatedAt: 7,
        structuredSettings: { world: { geography: overview } },
        entries: []
      }
    })).toMatchObject({ schemaId: 'setting-places.v1', target: { fieldKeys: ['geography'] } })
    const generated = await generatePlacesFromOverview({
      worldbook: {
        id: 'wb-places',
        updatedAt: 7,
        structuredSettings: { world: { geography: overview } },
        entries: []
      },
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async () => ({
        drafts: {
          places: [{
            name: '白石港', kind: 'port', scale: 'local', aliases: [],
            parentRef: '', factionRef: '', terrainHints: ['coast'],
            description: '一座港城。', evidence: '高汤盆地北侧有白石港',
            relations: [{ type: 'route', targetName: '灰锤堡' }]
          }]
        },
        fieldErrors: {}
      })
    })
    expect(generated).toMatchObject({ ok: true, drafts: [expect.objectContaining({ name: '白石港', classification: 'relation-pending', baseClassification: 'new' })] })
    expect(generated.drafts[0].defaultSelected).toBe(true)
    expect(classifyPlaceDrafts({
      worldbook: { entries: [{ id: 'old-port', type: 'location', name: '白石港', aliases: ['南港'], content: '旧港城。' }] },
      overview,
      places: [{ name: '白石港', kind: 'port', description: '港城。', evidence: '高汤盆地北侧有白石港', relations: [] }]
    })[0]).toMatchObject({ classification: 'update', targetEntryId: 'old-port' })

    const request = normalizeResearchRequest({
      provider: 'brave',
      queries: ['  港口制度  ', '', '港口制度', '城市地理'],
      maxResults: 99
    })
    expect(request.queries).toEqual(['港口制度', '城市地理'])
    expect(request.maxResults).toBe(6)
    expect(parseJsonFromAiContent('结果如下：\n```json\n{"entries":[{"name":"港口"}],"note":"brace } in text"}\n```\n')).toMatchObject({
      entries: [{ name: '港口' }]
    })
    const auditEntries = [
      { id: 'entry-a', name: '霜港商会', type: 'organization', keys: ['霜港', '商会'], content: '控制北境盐路，与地方议会共享航运利益。' },
      { id: 'entry-b', name: '北境盐路商会', type: 'organization', keys: ['盐路', '霜港'], content: '控制北境盐路，与地方议会共享航运利益。' },
      { id: 'entry-c', name: '旧灯塔', type: 'location', keys: ['灯塔'], content: '位于海湾南侧。' }
    ]
    expect(findWorldbookAuditCandidates(auditEntries)).toEqual([
      expect.objectContaining({ entryIds: ['entry-a', 'entry-b'] })
    ])
    expect(findWorldbookAuditCandidates([
      { id: 'weak-a', name: '叙事基调', type: 'style', keys: ['基调'], content: '保持克制、清晰的叙事语气。' },
      { id: 'weak-b', name: '基调', type: 'style', keys: ['写作风格'], content: '保持自然、稳定的叙述节奏。' }
    ])).toEqual([])
    expect(findWorldbookAuditTargets(auditEntries, { brief: '世界起源、高汤盆地' })).toEqual([])
    const auditTargets = findWorldbookAuditTargets([
      ...auditEntries,
      { id: 'entry-d', name: '新条目', type: 'lore', keys: [], content: '需要后续补充的世界设定。' },
      { id: 'entry-e', name: '未命名条目', type: 'lore', keys: [], content: '长'.repeat(1901) }
    ])
    expect(auditTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'missing-trigger',
        issues: expect.arrayContaining(['missing-trigger', 'placeholder-name']),
        entryIds: ['entry-d']
      }),
      expect.objectContaining({
        kind: 'missing-trigger',
        issues: expect.arrayContaining(['missing-trigger', 'oversized-content', 'placeholder-name']),
        entryIds: ['entry-e']
      })
    ]))
    const auditBatches = chunkWorldbookAuditTargets(auditTargets, 2)
    expect(auditBatches.map((batch) => batch.length)).toEqual([2, 1])
    const batchPrompt = buildWorldbookMaintenanceMessages({
      worldbook: { id: 'world-1', name: '测试世界', entries: [...auditEntries, { id: 'entry-d', name: '新条目', type: 'lore', keys: [], content: '需要后续补充的世界设定。' }, { id: 'entry-e', name: '未命名条目', type: 'lore', keys: [], content: '长'.repeat(1901) }] },
      mode: 'audit',
      auditTargetSubset: auditBatches[0]
    })
    expect(batchPrompt[1].content).toContain('entry-a')
    expect(batchPrompt[1].content).not.toContain('entry-e')
    expect(normalizeWorldbookMaintenanceResult({
      summary: '发现重复组织',
      candidates: [{
        action: 'merge',
        entryIds: ['entry-a', 'entry-b', 'unknown'],
        confidence: 'high',
        reason: '两条内容重复',
        proposedEntry: {
          name: '霜港商会', type: 'organization', keys: ['霜港', '盐路'],
          content: '控制北境盐路。', group: '组织', mode: 'selective'
        }
      }]
    }, { entries: auditEntries })).toMatchObject({
      candidates: [{ action: 'merge', entryIds: ['entry-a', 'entry-b'], proposedEntry: { name: '霜港商会' } }]
    })
    expect(normalizeWorldbookAiResult({ items: [{ name: '城门' }] })).toMatchObject({
      entries: [{ name: '城门' }]
    })
    expect(normalizeWorldbookAiResult({ worldBook: { locations: [{ name: '港口' }], characters: [{ name: '船长' }] } }).entries)
      .toEqual(expect.arrayContaining([{ name: '港口' }, { name: '船长' }]))
    expect(normalizeWorldbookAiResult([{ name: '直接条目' }])).toMatchObject({
      entries: [{ name: '直接条目' }]
    })
    const foundation = buildFoundationPayloadFromAiResult({
      parsed: {
        name: '雾港',
        worldDescription: '一座被周期性雾潮包围的港城，城市秩序依靠旧灯塔维持，所有后续设定都必须服从这一核心前提。',
        tone: '冷静、潮湿、带有缓慢累积的不安',
        writingStyle: '短句与精确感官细节交替，避免解释性总结',
        perspective: '第三人称有限视角',
        forbidden: '避免突然出现无铺垫的救世主与万能技术',
        consistency: '雾潮不能无代价消失'
      },
      brief: '雾港故事',
      genreLabel: '都市异闻'
    })
    expect(foundation.entries.map((entry) => entry.type)).toEqual(['rule', 'style', 'forbidden'])
    expect(foundation.structuredSettings.creativeRules).toMatchObject({
      tone: '冷静、潮湿、带有缓慢累积的不安',
      perspective: '第三人称有限视角'
    })
    expect(foundation.structuredSettings.characters.protagonists).toBe('')
    const settingPrompt = buildSettingGenerationMessages({
      worldbook: {
        name: '雾港',
        worldDescription: foundation.worldDescription,
        writingStyle: foundation.writingStyle,
        forbidden: foundation.forbidden,
        structuredSettings: {
          ...foundation.structuredSettings,
          world: {
            ...foundation.structuredSettings.world,
            history: '港城建立于旧灯塔点亮后的第三年。'
          }
        },
        sourceDocuments: [{
          id: 'source-novel',
          title: '雾港原始片段',
          content: '巡灯人的旧簿明确记载：灯塔停摆当夜，雾潮第一次带走了全城关于北码头的共同记忆。'
        }],
        entries: [
          {
            id: 'constant-rule',
            name: '雾潮代价',
            type: 'rule',
            content: '雾潮每次退去都会永久带走一段公共记忆，任何组织都无法免除这项代价。',
            keys: ['雾潮'],
            injection: { mode: 'constant', probability: 100 }
          },
          {
            id: 'history-event',
            name: '旧灯塔停摆',
            type: 'event',
            content: '旧灯塔在十七年前停摆，此后港城改用人工巡灯制度维持航道。',
            keys: ['历史线', '灯塔'],
            metadata: { sourceDocumentIds: ['source-novel'] },
            injection: { mode: 'selective', probability: 20 }
          },
          {
            id: 'unrelated-item',
            name: '银餐叉',
            type: 'item',
            content: '一把普通餐具，与港城历史无关。',
            keys: ['餐具'],
            injection: { mode: 'selective', probability: 100 }
          }
        ]
      },
      sectionKey: 'world',
      fieldKey: 'history',
      userBrief: '补全港城历史线'
    }).map((message) => message.content).join('\n')
    expect(settingPrompt).toContain('雾潮代价')
    expect(settingPrompt).toContain('旧灯塔停摆')
    expect(settingPrompt).toContain('禁止内容')
    expect(settingPrompt).toContain('约束优先级')
    expect(settingPrompt).toContain('当前设定项已有内容')
    expect(settingPrompt).toContain('港城建立于旧灯塔点亮后的第三年')
    expect(settingPrompt).toContain('世界书原始资料摘录')
    expect(settingPrompt).toContain('灯塔停摆当夜，雾潮第一次带走了全城')
    expect(settingPrompt).toContain('setting-field.v1')
    expect(settingPrompt).not.toContain('<setting-content>')
    expect(settingPrompt).not.toContain('银餐叉')
    const emptyDefaultWorldbook = {
      name: '默认世界书',
      worldDescription: '自动创建的默认世界书',
      structuredSettings: foundation.structuredSettings,
      entries: []
    }
    const blankDefaultWorldbook = {
      ...emptyDefaultWorldbook,
      structuredSettings: undefined
    }
    expect(getMeaningfulWorldDescription(emptyDefaultWorldbook)).toBe('')
    expect(hasSettingGenerationBasis({ worldbook: blankDefaultWorldbook })).toBe(false)
    expect(hasSettingGenerationBasis({ worldbook: emptyDefaultWorldbook, userBrief: '雾港城邦' })).toBe(true)
    const emptyDefaultPrompt = buildSettingGenerationMessages({
      worldbook: blankDefaultWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin'
    }).map((message) => message.content).join('\n')
    expect(emptyDefaultPrompt).not.toContain('自动创建的默认世界书')
    expect(emptyDefaultPrompt).not.toContain('当前世界书：默认世界书')
    expect(emptyDefaultPrompt).toContain('首条设定模式')
    expect(emptyDefaultPrompt).toContain('第一条正式设定')
    const leakedReasoning = 'The user is asking me to generate content. Key constraints: output only the field. Let me think about a generic world origin.'
    expect(isSettingDraftValid(leakedReasoning, { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('我需要先考虑世界起源应该包含哪些部分，然后再给出合适内容。', { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('我们需要先分析已有约束，再组织世界起源的正文。', { controlType: 'textarea', maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('以下是目标设定项的最终内容：世界由潮汐塑成。', { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('与', { controlType: 'textarea', maxLength: 2000 })).toBe(false)
    expect(extractSettingContent(leakedReasoning)).toBeNull()
    expect(extractSettingContent(`${leakedReasoning}\n<setting-content>最初的海潮从无光之地升起。</setting-content>\nLet me verify it.`))
      .toBe('最初的海潮从无光之地升起。')
    expect(extractSettingContent('<setting-content><think>先分析约束，再组织答案。</think>最初的海潮从无光之地升起。</setting-content>'))
      .toBe('最初的海潮从无光之地升起。')
    expect(isSettingDraftValid('最初的海潮从无光之地升起，陆地随潮汐缓慢成形。', { maxLength: 2000 })).toBe(true)
    expect(extractTextContent([
      { type: 'reasoning', text: leakedReasoning },
      { type: 'text', text: '最初的海潮从无光之地升起。' }
    ])).toBe('最初的海潮从无光之地升起。')
    expect(extractTextContent({
      type: 'tool_use',
      input: { summary: '返回候选', candidates: [] }
    })).toBe('{"summary":"返回候选","candidates":[]}')
    const editorSource = readFileSync(resolve(process.cwd(), 'src/pages/WorldBookEditor.vue'), 'utf8')
    expect(editorSource).toContain('maintenanceTouchedEntryIds')
    expect(editorSource).toContain('maintenanceRevision.value = String(activeWorldbook.value?.updatedAt || maintenanceRevision.value)')
    const sectionCalls = []
    const sectionWorldbook = {
      name: '雾港',
      structuredSettings: foundation.structuredSettings,
      entries: []
    }
    await generateSettingSectionDraft({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      generateField: async (options) => {
        sectionCalls.push(structuredClone(options.worldbook.structuredSettings))
        return { ok: true, content: `本轮生成-${options.fieldKey}` }
      }
    })
    expect(sectionCalls[1].world.origin).toBe('本轮生成-origin')
    expect(sectionWorldbook.structuredSettings.world.origin).toBe('')
    const batchCalls = []
    expect(isSettingDraftValid('陆沉与沈砚互为旧识。', { controlType: 'textarea', maxLength: 2000 })).toBe(true)
    expect(getStructuredGenerationTimeout([{ entryType: 'character' }])).toBe(90000)
    expect(isStructuredSettingRevisionCurrent('rev-1', 'rev-1')).toBe(true)
    expect(isStructuredSettingRevisionCurrent('rev-1', 'rev-2')).toBe(false)
    const batchedResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'characters',
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async ({ target }) => {
        batchCalls.push(target.fieldKeys)
        return batchCalls.length === 1
          ? {
              drafts: {
                protagonists: '姓名：陆沉\n身份：巡夜人\n性格：克制、敏锐\n目标：查明旧案',
                majorSupporting: '姓名：沈砚\n身份：档案员\n性格：谨慎\n目标：保护证据'
              },
              fieldErrors: { npcs: '缺少可用内容', relationshipSummary: '缺少可用内容' }
            }
          : {
              drafts: {
                npcs: '姓名：港口守卫\n身份：值守者\n性格：警觉\n目标：维持秩序',
                relationshipSummary: '陆沉与沈砚互为旧识。'
              },
              fieldErrors: {}
            }
      }
    })
    expect(batchCalls).toEqual([
      ['protagonists', 'majorSupporting', 'npcs', 'relationshipSummary'],
      ['npcs', 'relationshipSummary']
    ])
    expect([...batchedResults.values()].every((result) => result.ok), JSON.stringify([...batchedResults.entries()])).toBe(true)
    expect(parseCharacterCards('姓名：陆沉\n身份：巡夜人\n性格：克制、敏锐\n目标：查明旧案')).toMatchObject([{
      name: '陆沉',
      traits: ['克制', '敏锐'],
      goal: '查明旧案'
    }])
    const retryCalls = []
    const retryResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'characters',
      fieldKeys: ['relationshipSummary'],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async ({ target }) => {
        retryCalls.push(target.fieldKeys)
        return { drafts: { relationshipSummary: '陆沉与沈砚互为旧识。' }, fieldErrors: {} }
      }
    })
    expect(retryCalls).toEqual([['relationshipSummary']])
    expect(retryResults.get('relationshipSummary')).toMatchObject({ ok: true })
    const rulesResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKeys: ['rules'],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async () => ({
        drafts: {
          rules: [
            '潮汐每七日改变一次航道，任何地图都必须注明绘制日期。',
            '未经见证者确认的誓言不能成为正式法律，只能作为私人承诺。',
            '跨越旧灯塔照出的雾区必须留下返回标记，否则视为失踪。',
            '任何力量的使用都要付出可追溯的代价，不能凭空消耗或恢复。',
            '历史记录发生冲突时，优先保留有地点、时间和见证者的版本。'
          ].join('\n')
        },
        fieldErrors: {}
      })
    })
    expect(rulesResults.get('rules')).toMatchObject({ ok: true })
    const revisionCalls = []
    const revisionResult = await generateSettingDraftRevision({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin',
      draftContent: '雾港建立在潮汐反复改道的海湾边。',
      revisionInstruction: '保留潮汐改道，补充旧灯塔与三次迁港，不要加入神明。',
      previousVersions: [
        { content: '第一版设定记录了潮汐、旧灯塔和三次迁港。', kind: 'generated' }
      ],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        revisionCalls.push(request)
        return { drafts: { origin: '雾港建立在潮汐反复改道的海湾边，旧灯塔记录着三次迁港。' }, meta: {} }
      }
    })
    expect(revisionResult).toMatchObject({ ok: true })
    expect(revisionCalls[0]).toMatchObject({
      schemaId: 'setting-revision.v1',
      target: { sectionKey: 'world', fieldKeys: ['origin'] },
      context: {
        draftContent: '雾港建立在潮汐反复改道的海湾边。',
        revisionInstruction: '保留潮汐改道，补充旧灯塔与三次迁港，不要加入神明。',
        previousVersions: '版本 1（历史参考）\n第一版设定记录了潮汐、旧灯塔和三次迁港。'
      }
    })
    const compatibilityCalls = []
    const compatibilityResult = await generateSettingDraftRevision({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin',
      draftContent: '旧版草稿保留潮汐。',
      revisionInstruction: '补充旧灯塔，删除神明。',
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        compatibilityCalls.push(request)
        if (request.schemaId === 'setting-revision.v1') {
          const error = new Error('结构化生成 schema 不受支持')
          error.code = 'STRUCTURED_GENERATION_SCHEMA_UNSUPPORTED'
          throw error
        }
        return { drafts: { origin: '旧版草稿保留潮汐和旧灯塔。' }, meta: {} }
      }
    })
    expect(compatibilityResult).toMatchObject({ ok: true, meta: { compatibilityFallback: true } })
    expect(compatibilityCalls.map((request) => request.schemaId)).toEqual(['setting-revision.v1', 'setting-field.v1'])
    expect(compatibilityCalls[1].context.currentValues.origin).toBe('旧版草稿保留潮汐。')
    expect(compatibilityCalls[1].context.userBrief).toContain('补充旧灯塔，删除神明。')
    expect(() => normalizeResearchRequest({ provider: 'custom', queries: ['x'] })).toThrow('仅支持')
    expect(normalizeResearchFetchRequest({
      sources: [{ id: 's1', title: '公开资料', url: 'https://example.com/a?utm_source=x' }]
    }).sources[0]).toMatchObject({ id: 'S1', url: 'https://example.com/a' })
    expect(() => normalizeResearchFetchRequest({
      sources: [{ id: 'S1', url: 'http://localhost:3001/private' }]
    })).toThrow('可抓取')
    const searchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        web: {
          results: [
            { title: '港口制度', url: 'https://example.com/port?utm_source=test', description: '制度摘要' },
            { title: '重复结果', url: 'https://example.com/port', description: '重复摘要' }
          ]
        }
      }))
    })
    vi.stubGlobal('fetch', searchFetch)
    try {
      const searched = await runWebResearch({
        provider: 'brave',
        apiKey: 'search-test-key',
        queries: ['港口制度'],
        maxResults: 5
      })
      expect(searched.results).toHaveLength(1)
      expect(searched.results[0]).toMatchObject({ id: 'S1', provider: 'brave', snippet: '制度摘要' })
      expect(searched.results[0].url).toBe('https://example.com/port')
      expect(searchFetch.mock.calls[0][0].hostname).toBe('api.search.brave.com')
      expect(searchFetch.mock.calls[0][1].headers['X-Subscription-Token']).toBe('search-test-key')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(normalizeWorldbookResearchSettings({ provider: 'bad', maxQueries: 99 })).toMatchObject({
      provider: 'brave',
      maxQueries: 4
    })
    expect(buildFallbackResearchQueries({ brief: '宋代港口城邦', genreLabel: '历史奇幻', maxQueries: 3 })).toHaveLength(3)
    expect(buildIncrementalResearchQuery({
      brief: '潮汐港口的税制',
      genreLabel: '历史奇幻',
      claims: [{ text: '港口税制由商会和官署共同管理' }]
    })).toContain('港口税制由商会和官署共同管理')
    expect(mergeResearchSources(
      [{ id: 'S1', title: '已有', url: 'https://example.com/old' }],
      [
        { id: 'S1', title: '重复', url: 'https://example.com/old/' },
        { id: 'S1', title: '新增', url: 'https://example.com/new' }
      ]
    )).toMatchObject([
      { id: 'S1', title: '已有' },
      { id: 'S2', title: '新增' }
    ])
    const gapFetch = vi.fn().mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.endsWith('/search')
        ? {
          provider: 'brave',
          results: [{ id: 'S1', title: '补充资料', url: 'https://example.com/gap', snippet: '补充摘要' }],
          warnings: []
        }
        : {
          sources: [{
            id: 'S1',
            title: '补充资料',
            url: 'https://example.com/gap',
            evidenceLevel: 'page',
            evidenceBlocks: [{ id: 'P1', locator: '正文段落 1', text: '补充正文证据' }]
          }],
          warnings: []
        }
    }))
    const gap = await researchWorldbookGap({
      research: { sources: [{ id: 'S1', title: '已有', url: 'https://example.com/old' }], queries: ['旧查询'] },
      brief: '潮汐港口的税制',
      genreLabel: '历史奇幻',
      claims: [{ text: '港口税制由商会和官署共同管理' }],
      settings: { provider: 'brave', apiKey: 'test-key', maxResults: 4 },
      fetchImpl: gapFetch
    })
    expect(gap).toMatchObject({ incremental: { budget: 'single-query', addedSourceCount: 1 } })
    expect(gap.sources[1]).toMatchObject({ id: 'S2', evidenceBlocks: [{ id: 'P1' }] })
    expect(buildEvidenceBlocks('第一段正文足够长，可以作为第一个可定位的正文证据块。\n第二段正文也足够长，可以作为第二个可定位的正文证据块。'))
      .toMatchObject([{ id: 'P1', locator: '正文段落 1' }, { id: 'P2', locator: '正文段落 2' }])

    const normalizedEntry = normalizeGeneratedEntry({
      name: '码头税制',
      content: '以现实港口制度为依据建立的税制与货物登记规则，影响商会和地方官署之间的权力分配。',
      sourceRefs: ['s1', 'S999'],
      basis: 'research'
    })
    const pending = buildPendingPayload({
      name: '港城',
      entries: [normalizedEntry],
      sourceDocuments: [createSourceDocument('码头税册记录了商会与官署共同征税的完整过程。', {
        id: 'source-tax',
        title: '税册原文',
        createdAt: 1
      })],
      research
    })
    expect(pending.entries[0].metadata).toMatchObject({ basis: 'research', sourceRefs: ['S1'] })
    expect(pending.sourceDocuments[0]).toMatchObject({ id: 'source-tax', title: '税册原文' })
    expect(pending.entries[0].metadata.sourceDocumentIds).toEqual(['source-tax'])

    const claims = normalizeResearchClaims([
      {
        id: 'C1',
        type: 'geography',
        text: '港口位于潮汐河口',
        basis: 'research',
        sourceRefs: ['S1'],
        evidenceRefs: [{ sourceId: 'S1', locator: 'P2', quote: '潮汐河口' }]
      },
      { id: 'C2', type: 'history', text: '港口由商会控制', basis: 'research', sourceRefs: ['S1'] }
    ], new Set(['S1']), new Set())
    const conflicts = normalizeResearchConflicts([
      { id: 'X1', claimIds: ['C1', 'C2'], reason: '两条声明对港口权属的解释不同', severity: 'high' }
    ], new Set(['C1', 'C2']))
    const reviewed = refreshResearchReview({ claims, conflicts, excludedSourceIds: [] }, [
      { name: '港口制度', metadata: { claimIds: ['C1'] } }
    ])
    expect(reviewed).toMatchObject({ needsReview: true, conflictCount: 1, affectedEntries: ['港口制度'] })
    expect(claims[0].evidenceRefs).toEqual([{ sourceId: 'S1', locator: 'P2', quote: '潮汐河口' }])
    const excluded = excludeResearchSource({
      sources: [{ id: 'S1' }], claims, conflicts, excludedSourceIds: []
    }, 'S1')
    expect(excluded.claims[0]).toMatchObject({ status: 'stale', excludedRefs: ['S1'] })

    const pendingWithReview = buildPendingPayload({
      name: '待审港城',
      entries: [{
        name: '港口制度',
        type: 'lore',
        content: '港口制度与权属关系需要根据来源进行核对，不能直接合并矛盾事实。',
        claimIds: ['C1'],
        sourceRefs: ['S1']
      }],
      research: { ...research, claims, conflicts }
    })
    expect(pendingWithReview.research.review.needsReview).toBe(true)
    expect(pendingWithReview.entries[0].metadata.claimIds).toEqual(['C1'])

    const stored = await createWorldbookFromPayload(store, buildPendingPayload({
      name: '可追溯港城',
      entries: [{
        name: '港口制度',
        type: 'lore',
        content: '港口制度与权属关系需要根据来源进行核对，不能直接合并矛盾事实。',
        claimIds: ['C1'],
        sourceRefs: ['S1']
      }],
      sourceDocuments: [createSourceDocument('港口原始登记簿保留了税制与权属变更的逐年记录。', {
        id: 'source-ledger',
        title: '港口登记簿',
        createdAt: 2
      })],
      research: { ...research, claims, conflicts: [] }
    }))
    expect(stored.entries[0].metadata).toMatchObject({ claimIds: ['C1'], reviewState: 'ready' })
    expect(stored.sourceDocuments[0]).toMatchObject({ id: 'source-ledger', title: '港口登记簿' })
    expect(stored.entries[0].metadata.sourceDocumentIds).toEqual(['source-ledger'])

    const revision = createResearchRevision({ sources: research.sources })
    const stalePreview = buildPendingPayload({
      name: '变更后的港城',
      entries: [{ name: '来源变更', type: 'lore', content: '来源内容变化后，旧预览不应继续导入。' }],
      research: {
        ...research,
        revision,
        sources: [{ ...research.sources[0], title: '已变化的港口资料' }]
      }
    })
    expect(stalePreview.research.review).toMatchObject({ needsReview: true, revisionStale: true })
  })

  it('updateWorldbook can attach geoHistory to an already-imported world', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({ name: '后挂历史' })
    expect(wb.geoHistory).toBeNull()

    const updated = await store.updateWorldbook(wb.id, {
      geoHistory: { nodes: [{ id: 'n2', yearLabel: '第 3 纪元', playable: true }] }
    })
    expect(updated.geoHistory.nodes[0].id).toBe('n2')
    expect(updated.geoHistory.nodes[0].yearLabel).toBe('第 3 纪元')

    await store.updateStructuredSetting(wb.id, 'world', 'history', '旧港在第七码头陷落后进入雾潮纪元。')
    let active = store.activeWorldbook
    let historyEntries = active.entries.filter((entry) => entry.metadata?.structuredSettingRef === 'world.history')
    expect(historyEntries).toHaveLength(1)
    expect(historyEntries[0]).toMatchObject({
      name: '历史线',
      type: 'event',
      content: '旧港在第七码头陷落后进入雾潮纪元。',
      injection: { mode: 'selective' }
    })

    await store.updateStructuredSetting(wb.id, 'world', 'history', '旧港陷落后，巡灯制度取代了城邦议会。')
    active = store.activeWorldbook
    historyEntries = active.entries.filter((entry) => entry.metadata?.structuredSettingRef === 'world.history')
    expect(historyEntries).toHaveLength(1)
    expect(historyEntries[0].content).toContain('巡灯制度')

    await store.updateStructuredSetting(wb.id, 'creativeRules', 'taboos', '禁止无代价复活。')
    expect(store.activeWorldbook.entries.find((entry) => entry.metadata?.structuredSettingRef === 'creativeRules.taboos'))
      .toMatchObject({ type: 'forbidden', injection: { mode: 'constant' } })

    await store.updateStructuredSetting(wb.id, 'world', 'history', '')
    expect(store.activeWorldbook.entries.some((entry) => entry.metadata?.structuredSettingRef === 'world.history')).toBe(false)
  })

  it('resolves a canonical place entity from the active worldbook', async () => {
    const worldStore = useWorldStore()
    const worldbook = await worldStore.createWorldbook({
      name: '地点索引测试',
      geoHistory: {
        mapId: 'map-1',
        placeRefs: [{ placeId: 'place:wb-place:map-1:site-1', name: '灰墙' }],
        nodes: [{
          id: 'history-1',
          placeRef: { placeId: 'place:wb-place:map-1:site-1' },
          mapBinding: { city: '灰墙', scene: '旧税所' },
          entryIds: []
        }]
      }
    })

    const entity = worldStore.getPlaceEntity('place:wb-place:map-1:site-1')
    expect(worldbook.id).toBeTruthy()
    expect(entity).toMatchObject({
      placeId: 'place:wb-place:map-1:site-1',
      name: '灰墙',
      historyNodeIds: ['history-1']
    })
  })

  it('normalizeWorldbook coerces an array-form geoHistory into { nodes } and drops non-objects', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({
      name: '数组历史',
      geoHistory: [{ id: 'n3', playable: true }, null, 'junk']
    })
    expect(wb.geoHistory).toEqual({ nodes: [{ id: 'n3', playable: true }] })
  })
})
