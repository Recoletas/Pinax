import { describe, expect, it } from 'vitest'
import {
  buildGeoHistoryDraft,
  collectWorldbookPlaceNames,
  selectSemanticSitesForReview
} from '../services/worldHistory/geoHistoryPipeline'

const worldbook = {
  id: 'wb-pipeline',
  name: '河口边境',
  entries: [
    { id: 'org-1', name: '潮汐行会', type: 'organization', keys: ['行会'], content: '控制河口贸易。' },
    { id: 'org-2', name: '北境守望', type: 'organization', keys: ['守望'], content: '守卫边境。' },
    { id: 'loc-1', name: '雾港', type: 'location', keys: ['雾港'], content: '河海交汇处的港口。' },
    { id: 'evt-1', name: '旧约失效', type: 'event', keys: ['旧约'], content: '旧约在港口失效。' }
  ]
}

function makeMap() {
  return {
    seed: 'pipeline-seed',
    name: '河口边境地图',
    cells: {
      length: 1,
      c: [[]],
      h: Uint8Array.of(80),
      t: Int8Array.of(20),
      f: Uint16Array.of(1),
      temp: Int8Array.of(20),
      prec: Uint8Array.of(60),
      biome: Uint8Array.of(7),
      r: Uint16Array.of(0),
      fl: Float32Array.of(0),
      s: Float32Array.of(80),
      pop: Float32Array.of(100),
      state: Uint16Array.of(1),
      burg: Uint16Array.of(1),
      portQuality: Uint8Array.of(90)
    },
    burgs: [
      { i: 0, name: '', cell: 0, state: 0, capital: false, port: false, population: 0 },
      { i: 1, name: '雾港', cell: 0, state: 1, capital: true, port: true, population: 800 }
    ],
    states: [
      { i: 0, name: '' },
      { i: 1, name: '北境' }
    ],
    roads: [],
    rivers: [],
    features: []
  }
}

describe('worldHistory/geoHistoryPipeline', () => {
  it('把地图语义和世界书条目组合成可审阅的 geoHistory 草案', () => {
    const result = buildGeoHistoryDraft({ worldbook, mapData: makeMap() })

    expect(result.ok).toBe(true)
    expect(result.mapSemantics.tradeHubs.length).toBeGreaterThan(0)
    expect(result.geoHistory).toMatchObject({
      version: 1,
      mapId: 'map-pipeline-seed',
      seed: 'pipeline-seed'
    })
    expect(result.geoHistory.nodes.length).toBeGreaterThanOrEqual(8)
    expect(result.geoHistory.nodes.some((node) => node.playable)).toBe(true)
    expect(result.geoHistory.nodes[0].mapBinding.siteId).toContain('tradeHub:')
    expect(result.geoHistory.nodes[0].placeRef.placeId).toContain('place:wb-pipeline:map-pipeline-seed:')
    expect(result.geoHistory.placeRefs).toHaveLength(1)
  })

  it('同一张地图和世界书重复整理时保持稳定', () => {
    const input = { worldbook, mapData: makeMap() }
    const first = buildGeoHistoryDraft(input)
    const second = buildGeoHistoryDraft(input)

    expect(JSON.stringify(first.geoHistory)).toBe(JSON.stringify(second.geoHistory))
  })

  it('地图缺失或没有语义站点时不生成空历史，也不允许写入', () => {
    expect(buildGeoHistoryDraft({ worldbook }).code).toBe('INVALID_MAP')

    const noSites = buildGeoHistoryDraft({
      worldbook,
      mapData: {
        seed: 'empty',
        cells: { length: 0 },
        burgs: [],
        states: [],
        roads: [],
        rivers: [],
        features: []
      }
    })
    expect(noSites).toMatchObject({ ok: false, code: 'NO_SEMANTIC_SITES', geoHistory: null })
  })

  it('为审阅提供稳定且有类别覆盖的语义候选，不把全部地图噪声带入历史', () => {
    const semantics = {
      tradeHubs: [
        { id: 'hub-1', type: 'tradeHub', title: '港一', score: 90 },
        { id: 'hub-2', type: 'tradeHub', title: '港二', score: 80 },
        { id: 'hub-3', type: 'tradeHub', title: '港三', score: 70 }
      ],
      frontierZones: [
        { id: 'frontier-1', type: 'frontierZone', title: '边境一', score: 88 }
      ],
      hostileRegions: [
        { id: 'hostile-1', type: 'hostileRegion', title: '凶土一', score: 86 }
      ],
      fertileRegions: [
        { id: 'fertile-1', type: 'fertileRegion', title: '沃土一', score: 84 }
      ]
    }

    const sites = selectSemanticSitesForReview(semantics, { maxSites: 4 })

    expect(sites.map((site) => site.id)).toEqual([
      'hub-1',
      'frontier-1',
      'fertile-1',
      'hostile-1'
    ])

    const noisySites = selectSemanticSitesForReview({
      tradeHubs: [{ id: 'hub-real', type: 'tradeHub', title: '白港（首都）', score: 100, markerIds: ['burg:1'] }],
      frontierZones: [{ id: 'frontier-noise', type: 'frontierZone', title: '边境荒域 1', score: 99 }],
      fertileRegions: [{ id: 'fertile-noise', type: 'fertileRegion', title: '沃土 11', score: 99 }],
      hostileRegions: [{ id: 'hostile-noise', type: 'hostileRegion', title: '凶土 1', score: 99 }],
      strategicRoutes: [{ id: 'route-real', type: 'strategicRoute', title: '白港—北境商道', score: 90, markerIds: ['road:1'] }]
    }, { maxSites: 12 })

    expect(noisySites.map((site) => site.id)).toEqual(['hub-real', 'route-real'])

    const unnamedTerrain = selectSemanticSitesForReview({
      fertileRegions: [{ id: 'fertile-plain', type: 'fertileRegion', title: '沃土', score: 100, cellIds: [4] }],
      hostileRegions: [{ id: 'hostile-plain', type: 'hostileRegion', title: '凶土（高原）', score: 99, cellIds: [5] }],
      mountainPasses: [{ id: 'pass-plain', type: 'mountainPass', title: '山口 2', score: 98, cellIds: [6] }]
    }, { maxSites: 12 })
    expect(unnamedTerrain).toEqual([])

    const worldbookOnly = selectSemanticSitesForReview({
      tradeHubs: [
        { id: 'generated-capital', type: 'tradeHub', title: 'Silverkeep（首都）', score: 100, markerIds: ['burg:1'] },
        { id: 'authored-port', type: 'tradeHub', title: '雾港（港）', score: 90, markerIds: ['burg:2'] },
      ],
      strategicRoutes: [{ id: 'generated-route', type: 'strategicRoute', title: 'Silverkeep—Ironforge（major）', score: 85, markerIds: ['road:1'] }],
    }, { maxSites: 12, allowedNames: collectWorldbookPlaceNames(worldbook) })
    expect(worldbookOnly.map((site) => site.id)).toEqual(['authored-port'])

    expect(selectSemanticSitesForReview({
      tradeHubs: [{ id: 'generated-only', type: 'tradeHub', title: 'Silverkeep（首都）', score: 100, markerIds: ['burg:3'] }],
    }, { maxSites: 12, requireAllowedNames: true })).toEqual([])
  })

  it('只用明确选中的语义点生成历史草案', () => {
    const result = buildGeoHistoryDraft({
      worldbook,
      mapData: makeMap(),
      selectedSiteIds: ['tradeHub:1']
    })

    expect(result.ok).toBe(true)
    expect(result.selectedSiteCount).toBe(1)
    expect(result.geoHistory.nodes.every((node) => node.mapBinding.siteId === 'tradeHub:1')).toBe(true)
  })

  it('显式清空选择时拒绝生成，避免误把空审阅当成全选', () => {
    const result = buildGeoHistoryDraft({
      worldbook,
      mapData: makeMap(),
      selectedSiteIds: []
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'NO_SELECTED_SITES',
      geoHistory: null,
      selectedSiteCount: 0
    })
  })
})
