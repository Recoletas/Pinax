import { describe, expect, it } from 'vitest'
import {
  generateGeoHistory,
  normalizeSemanticType,
  SEMANTIC_TYPES
} from '../services/worldHistory/historyGenerator'
import { buildPlayableHistoryActions } from '../services/worldHistory/playableHistoryEntry'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtureWorldbook = {
  id: 'wb-fixture',
  name: '边境王国 · 雾潮暮湾',
  entries: [
    { id: 'org-guild', name: '暮湾行会', type: 'organization', keys: ['行会'], content: '掌控港口贸易的商人行会。' },
    { id: 'org-rangers', name: '灰墙巡骑', type: 'faction', keys: ['巡骑'], content: '守卫边线的骑手。' },
    { id: 'loc-clocktower', name: '暮湾钟楼', type: 'location', keys: ['钟楼'], content: '港区最高处的钟楼。' },
    { id: 'loc-camp', name: '灰墙难民营', type: 'location', keys: ['难民营', '灰墙'], content: '边线外涌入的难民聚居地。' },
    { id: 'loc-ruin', name: '沉钟遗迹', type: 'location', keys: ['遗迹'], content: '被封存的古老遗迹。' },
    { id: 'char-sord', name: '索德', type: 'character', keys: ['索德'], content: '码头夜班头目。' },
    { id: 'char-taina', name: '苔娜', type: 'character', keys: ['苔娜'], content: '难民营里的证人。' },
    { id: 'evt-stall', name: '观测曲线停摆', type: 'event', keys: ['停摆'], content: '钟楼观测在某夜停摆。' },
    { id: 'evt-vanish', name: '灰墙巡骑失踪', type: 'event', keys: ['失踪'], content: '一队巡骑在边线消失。' },
    { id: 'quest-truth', name: '灰墙真相分岔', type: 'quest', keys: ['真相'], content: '三选一代价的调查任务。' },
    { id: 'item-ledger', name: '夜账账本', type: 'item', keys: ['账本'], content: '记录走私流水的账本。' },
    { id: 'lore-mist', name: '雾潮旧约', type: 'lore', keys: ['雾潮'], content: '关于雾潮的古老约定。' }
  ]
}

const fixtureMapSemantics = {
  mapId: 'map-border-kingdom',
  seed: 'border-kingdom-2026',
  sites: [
    {
      siteId: 'site-harbor',
      name: '暮湾港',
      semanticType: 'tradeHub',
      cellIds: [12, 13, 14],
      markerIds: ['mk-port'],
      routeIds: ['rt-coast']
    },
    {
      siteId: 'site-greywall',
      name: '灰墙边线',
      semanticType: 'frontierZone',
      cellIds: [40, 41],
      markerIds: ['mk-wall'],
      routeIds: []
    },
    {
      siteId: 'site-sunkenbell',
      name: '沉钟谷',
      semanticType: 'isolatedSite',
      cellIds: [88],
      markerIds: ['mk-ruin'],
      routeIds: []
    }
  ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('worldHistory/historyGenerator', () => {
  it('seed 决定输出且同 seed 稳定', () => {
    {
    const a = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    const b = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }

    {
    const a = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics, { seed: 'seed-a' })
    const b = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics, { seed: 'seed-b' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
    }
  })

  it('生成节点数量、可玩性和顶层结构完整', () => {
    {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    expect(geo.nodes.length).toBeGreaterThanOrEqual(8)
    expect(geo.nodes.length).toBeLessThanOrEqual(12)
    const playable = geo.nodes.filter((n) => n.playable)
    expect(playable.length).toBeGreaterThanOrEqual(3)
    }

    {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    expect(geo.mapId).toBe('map-border-kingdom')
    expect(geo.seed).toBe('border-kingdom-2026')
    expect(Array.isArray(geo.ages)).toBe(true)
    expect(geo.ages.length).toBeGreaterThan(0)
    expect(Array.isArray(geo.links)).toBe(true)
    expect(geo.entryBindings.length).toBe(geo.nodes.length)
    }
  })

  it('可玩节点字段完整且语义模板不会串味', () => {
    {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    const playable = geo.nodes.filter((n) => n.playable)
    expect(playable.length).toBeGreaterThanOrEqual(3)
    for (const node of playable) {
      expect(typeof node.openingHook).toBe('string')
      expect(node.openingHook.length).toBeGreaterThan(0)
      expect(Array.isArray(node.actionHooks)).toBe(true)
      expect(node.actionHooks.length).toBeGreaterThanOrEqual(1)
      for (const action of node.actionHooks) {
        expect(action.id).toBeTruthy()
        expect(action.label).toBeTruthy()
        expect(action.command).toBeTruthy()
      }
      expect(node.mapBinding).toBeTruthy()
      expect(node.mapBinding.siteId).toBeTruthy()
      expect(Array.isArray(node.entryIds)).toBe(true)
      expect(node.entryIds.length).toBeGreaterThanOrEqual(1)
      // 绑定的 entryIds 必须真的存在于世界书里。
      for (const id of node.entryIds) {
        expect(fixtureWorldbook.entries.some((e) => e.id === id)).toBe(true)
      }
    }
    }

    {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    const typesForSite = (siteId) =>
      new Set(geo.nodes.filter((n) => n.mapBinding.siteId === siteId).map((n) => n.type))

    const tradeTypes = typesForSite('site-harbor')
    const frontierTypes = typesForSite('site-greywall')
    const isolatedTypes = typesForSite('site-sunkenbell')

    expect(tradeTypes.size).toBeGreaterThan(0)
    expect(frontierTypes.size).toBeGreaterThan(0)
    expect(isolatedTypes.size).toBeGreaterThan(0)

    // 三个不同语义类型的站点，node type 集合两两不相交。
    const intersect = (a, b) => [...a].some((t) => b.has(t))
    expect(intersect(tradeTypes, frontierTypes)).toBe(false)
    expect(intersect(tradeTypes, isolatedTypes)).toBe(false)
    expect(intersect(frontierTypes, isolatedTypes)).toBe(false)

    // 具体锚点：trade hub 应出现税权类型，frontier 应出现巡骑失踪类型。
    expect(tradeTypes.has('tax-rights')).toBe(true)
    expect(frontierTypes.has('ranger-vanish')).toBe(true)
    expect(isolatedTypes.has('supply-cut')).toBe(true)
    expect(isolatedTypes.has('ruin-unsealed')).toBe(false)
    }
  })

  it('输出可无损序列化且语义别名规范化', () => {
    {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    expect(() => JSON.stringify(geo)).not.toThrow()
    const roundTrip = JSON.parse(JSON.stringify(geo))
    expect(roundTrip).toEqual(geo)
    // 不应残留内部记账字段。
    for (const node of geo.nodes) {
      expect(node).not.toHaveProperty('_templatePlayable')
      expect(node).not.toHaveProperty('_siteId')
      expect(node).not.toHaveProperty('_order')
    }
    }

    {
    expect(normalizeSemanticType('frontier')).toBe('frontierZone')
    expect(normalizeSemanticType('hostile')).toBe('hostileRegion')
    expect(normalizeSemanticType('isolated')).toBe('isolatedSite')
    expect(normalizeSemanticType('ruinSite')).toBe('ruinSite')
    expect(normalizeSemanticType('trade')).toBe('tradeHub')
    expect(normalizeSemanticType('road')).toBe('strategicRoute')
    expect(normalizeSemanticType('farmland')).toBe('fertileRegion')
    // 未知类型稳定回退到已知集合内。
    expect(SEMANTIC_TYPES).toContain(normalizeSemanticType('???'))
    }
  })

  it('别名站点生成对应模板且不足时补齐变体', () => {
    {
    const aliasSemantics = {
      mapId: 'map-alias',
      sites: [
        { siteId: 's1', name: '关隘', semanticType: 'pass', cellIds: [], markerIds: [], routeIds: ['r1'] },
        { siteId: 's2', name: '荒原', semanticType: 'wasteland', cellIds: [], markerIds: [], routeIds: [] }
      ]
    }
    const geo = generateGeoHistory(fixtureWorldbook, aliasSemantics, { seed: 'alias' })
    const routeNodes = geo.nodes.filter((n) => n.mapBinding.siteId === 's1')
    const hostileNodes = geo.nodes.filter((n) => n.mapBinding.siteId === 's2')
    expect(routeNodes.some((n) => n.type === 'ambush-set')).toBe(true)
    expect(hostileNodes.some((n) => n.type === 'great-disaster')).toBe(true)
    }

    {
    const oneSite = {
      mapId: 'map-single',
      sites: [
        { siteId: 'solo', name: '孤港', semanticType: 'tradeHub', cellIds: [1], markerIds: [], routeIds: [] }
      ]
    }
    const geo = generateGeoHistory(fixtureWorldbook, oneSite, { seed: 'solo' })
    expect(geo.nodes.length).toBeGreaterThanOrEqual(8)
    // 节点 id 全局唯一（变体不会撞 id）。
    const ids = geo.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('无条目时降级且直接消费 W1 上游对象', () => {
    {
    const geo = generateGeoHistory({ entries: [] }, fixtureMapSemantics)
    expect(geo.nodes.length).toBeGreaterThanOrEqual(8)
    for (const node of geo.nodes) {
      expect(node.entryIds).toEqual([])
      expect(node.playable).toBe(false)
      // 即便无条目，openingHook/actionHooks 结构仍在（可展示，只是不可玩）。
      expect(typeof node.openingHook).toBe('string')
      expect(node.actionHooks.length).toBeGreaterThanOrEqual(1)
    }
    expect(() => JSON.stringify(geo)).not.toThrow()
    }

    {
    // W1 (mapSemantics.js) 输出：9 类各一个数组 + meta；site = { id, type, title, score, cellIds, markerIds, keywords }。
    const w1Result = {
      tradeHubs: [
        { id: 'tradeHub:0', type: 'tradeHub', title: '天京城（首都）', score: 100, cellIds: [5, 6], markerIds: ['burg:5', 'road:2'], keywords: ['capital', 'port'], reasons: ['首都', '港口'] }
      ],
      borderCrossings: [
        { id: 'borderCrossing:0', type: 'borderCrossing', title: '龙都—天京城', score: 85, cellIds: [30], markerIds: ['road:2', 'state:1'], keywords: ['border'], reasons: ['跨越 3 国'] }
      ],
      frontierZones: [
        { id: 'frontierZone:0', type: 'frontierZone', title: '边境荒域 1', score: 50, cellIds: [40, 41], markerIds: ['state:2'], keywords: ['frontier'], reasons: ['邻接多州'] }
      ],
      isolatedSites: [],
      fertileRegions: [
        { id: 'fertileRegion:0', type: 'fertileRegion', title: '沃土 4', score: 85, cellIds: [70, 71, 72], markerIds: ['river:1'], keywords: ['fertile', 'riverine'], reasons: ['宜居度 101'] }
      ],
      hostileRegions: [
        { id: 'hostileRegion:0', type: 'hostileRegion', title: '凶土 1', score: 70, cellIds: [90], markerIds: [], keywords: ['hostile'], reasons: ['严寒'] }
      ],
      strategicRoutes: [
        { id: 'strategicRoute:0', type: 'strategicRoute', title: '凤鸣城—帝丘', score: 85, cellIds: [50, 51], markerIds: ['road:7'], keywords: ['route'], reasons: ['跨 3 国'] }
      ],
      riverMouths: [
        { id: 'riverMouth:0', type: 'riverMouth', title: '碧漪江 河口', score: 60, cellIds: [12], markerIds: ['river:3', 'burg:9'], keywords: ['riverine'], reasons: ['河长达标'] }
      ],
      mountainPasses: [
        { id: 'mountainPass:0', type: 'mountainPass', title: '山口 龙都—紫阳城', score: 60, cellIds: [65], markerIds: ['pass-cell:240', 'road:9'], keywords: ['pass'], reasons: ['主干道穿山'] }
      ],
      meta: { cells: 2000, burgs: 40, roads: 12, rivers: 8, states: 6 }
    }

    const geo = generateGeoHistory(fixtureWorldbook, w1Result, { seed: 'w1-seed', mapId: 'map-w1' })

    expect(geo.mapId).toBe('map-w1')
    expect(geo.nodes.length).toBeGreaterThanOrEqual(8)
    expect(geo.nodes.length).toBeLessThanOrEqual(12)
    expect(geo.nodes.filter((n) => n.playable).length).toBeGreaterThanOrEqual(3)

    // W1 的额外 3 类正确映射到 6 模板：borderCrossing→frontier / riverMouth→trade / mountainPass→route。
    const typeOfSite = (siteId) => new Set(geo.nodes.filter((n) => n.mapBinding.siteId === siteId).map((n) => n.type))
    expect([...typeOfSite('borderCrossing:0')].every((t) => ['refugee-tide', 'ranger-vanish', 'border-war', 'watchline-fall'].includes(t))).toBe(true)
    expect([...typeOfSite('riverMouth:0')].every((t) => ['tax-rights', 'port-closure', 'smuggling-ring', 'guild-schism'].includes(t))).toBe(true)
    expect([...typeOfSite('mountainPass:0')].every((t) => ['ambush-set', 'blockade', 'secret-order', 'escort-run'].includes(t))).toBe(true)

    // routeIds 从 `road:` 前缀的 markerIds 派生。
    const tradeNode = geo.nodes.find((n) => n.mapBinding.siteId === 'tradeHub:0')
    expect(tradeNode.mapBinding.routeIds).toContain('road:2')

    // 同 seed 稳定。
    const again = generateGeoHistory(fixtureWorldbook, w1Result, { seed: 'w1-seed', mapId: 'map-w1' })
    expect(JSON.stringify(geo)).toBe(JSON.stringify(again))
    }
  })

  it('W1 空结果（makeEmptyResult 形状）优雅降级为空 geoHistory', () => {
    const emptyW1 = {
      tradeHubs: [], borderCrossings: [], frontierZones: [], isolatedSites: [],
      fertileRegions: [], hostileRegions: [], strategicRoutes: [], riverMouths: [],
      mountainPasses: [], meta: { cells: 0, burgs: 0, roads: 0, rivers: 0, states: 0 }
    }
    const geo = generateGeoHistory(fixtureWorldbook, emptyW1)
    expect(geo.nodes).toEqual([])
    expect(geo.entryBindings).toEqual([])
  })

  it('高分站点优先：超过 12 个站点时低分站点被挤出', () => {
    // 造 15 个 tradeHub 站点，score 递减；模板在站点间轮转，12 节点上限下只有
    // 分数最高的 12 个站点各拿到一个 t0 节点，最低分的 3 个应被挤出。
    const many = {
      mapId: 'map-scored',
      tradeHubs: Array.from({ length: 15 }, (_, i) => ({
        id: `tradeHub:${i}`,
        type: 'tradeHub',
        title: `港 ${i}`,
        score: 100 - i * 5,
        cellIds: [i],
        markerIds: [],
        keywords: []
      }))
    }
    const geo = generateGeoHistory(fixtureWorldbook, many, { seed: 'scored' })
    expect(geo.nodes.length).toBe(12)
    const coveredSites = new Set(geo.nodes.map((n) => n.mapBinding.siteId))
    // 最高分站点必被覆盖，最低分站点必被挤出。
    expect(coveredSites.has('tradeHub:0')).toBe(true)
    expect(coveredSites.has('tradeHub:14')).toBe(false)
  })

  it('没有站点时优雅降级：返回结构完整但空的 geoHistory', () => {
    const geo = generateGeoHistory(fixtureWorldbook, { mapId: 'map-empty', sites: [] })
    expect(geo.nodes).toEqual([])
    expect(geo.links).toEqual([])
    expect(geo.ages).toEqual([])
    expect(geo.entryBindings).toEqual([])
    expect(geo.mapId).toBe('map-empty')
  })

  it('完全空输入也不抛错', () => {
    expect(() => generateGeoHistory(null, null)).not.toThrow()
    const geo = generateGeoHistory(undefined, undefined)
    expect(geo.nodes).toEqual([])
  })
})

describe('worldHistory/playableHistoryEntry', () => {
  it('buildPlayableHistoryActions 只返回可玩节点，且带展开好的动作', () => {
    const geo = generateGeoHistory(fixtureWorldbook, fixtureMapSemantics)
    const actions = buildPlayableHistoryActions(geo)
    const playableCount = geo.nodes.filter((n) => n.playable).length

    expect(actions.length).toBe(playableCount)
    expect(actions.length).toBeGreaterThanOrEqual(3)

    for (const entry of actions) {
      expect(entry.nodeId).toBeTruthy()
      expect(entry.openingHook).toBeTruthy()
      expect(entry.entryIds.length).toBeGreaterThanOrEqual(1)
      expect(entry.mapBinding.siteId).toBeTruthy()
      expect(entry.actions.length).toBeGreaterThanOrEqual(1)
      for (const action of entry.actions) {
        expect(action.id).toBeTruthy()
        expect(action.command).toBeTruthy()
      }
    }
  })

  it('geoHistory 为空/缺省时 buildPlayableHistoryActions 返回空数组', () => {
    expect(buildPlayableHistoryActions(null)).toEqual([])
    expect(buildPlayableHistoryActions({})).toEqual([])
    expect(buildPlayableHistoryActions({ nodes: [] })).toEqual([])
  })
})
