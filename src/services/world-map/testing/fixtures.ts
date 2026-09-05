/**
 * 固定 seed fixtures（计划 §9.2）——所有 Gate 共用同一批输入。
 *
 * - 全部显式 seed，禁止 Math.random()；
 * - 同一 fixture 在任何机器上按同序生成必须输出一致（P7 退出条件复用）；
 * - fixture 只描述 MapGenConfig，不预生成大对象，避免测试预算膨胀。
 */

import type { MapGenConfig } from '../engine/types'

export interface MapFixture {
  id: string
  label: string
  /** 验证目的（计划 §9.2 表）。 */
  purpose: string
  config: MapGenConfig
  /** 期望的 vector feature 数量级（P1 用 500/2,000/10,000 分档）。 */
  expectedFeatureScale: 'small' | 'medium' | 'large'
  /** 高密度地点 fixture 注入的作者地点数。 */
  injectedPlaces?: number
}

export const MAP_FIXTURES: Record<string, MapFixture> = {
  archipelago: {
    id: 'archipelago',
    label: '群岛 + 长海岸',
    purpose: '海岸细化、河口、标签和水体命中',
    config: {
      seed: 'pinax-fixture-archipelago-001',
      width: 1200,
      height: 800,
      pointCount: 8000,
      heightmapTemplate: 'archipelago',
      landRatio: 0.28,
      plateCount: 5,
      stateCount: 6,
      burgDensity: 0.5,
    },
    expectedFeatureScale: 'medium',
  },
  multiContinent: {
    id: 'multi-continent',
    label: '多大陆 + 多国家',
    purpose: '国家边界、state labels、世界 LOD',
    config: {
      seed: 'pinax-fixture-continents-001',
      width: 1600,
      height: 1000,
      pointCount: 10000,
      heightmapTemplate: 'continents',
      landRatio: 0.42,
      plateCount: 6,
      stateCount: 12,
      burgDensity: 0.6,
    },
    expectedFeatureScale: 'medium',
  },
  elongated: {
    id: 'elongated',
    label: '狭长大陆 + 长河',
    purpose: 'line labels、路线、视口 fit',
    config: {
      seed: 'pinax-fixture-isthmus-001',
      width: 1800,
      height: 700,
      pointCount: 9000,
      heightmapTemplate: 'isthmus',
      landRatio: 0.38,
      plateCount: 4,
      stateCount: 5,
      burgDensity: 0.45,
    },
    expectedFeatureScale: 'medium',
  },
  dense12k: {
    id: 'dense-12k',
    label: '12,000 cells + 2,000 地点',
    purpose: '性能、聚类、作者地点优先级',
    config: {
      seed: 'pinax-fixture-dense-12000-001',
      width: 1600,
      height: 1000,
      pointCount: 12000,
      heightmapTemplate: 'continents',
      landRatio: 0.4,
      plateCount: 7,
      stateCount: 10,
      burgDensity: 1.0,
    },
    expectedFeatureScale: 'large',
    injectedPlaces: 2000,
  },
} as const

/** 12,000-cell 主性能 fixture。 */
export const PRIMARY_PERF_FIXTURE = MAP_FIXTURES.dense12k

/** 两本书/两个世界书身份 fixture（计划 §9.2 最后一行；用于身份隔离测试）。 */
export interface TwoBookIdentityFixture {
  bookA: { bookId: string; worldbookId: string; entries: string[] }
  bookB: { bookId: string; worldbookId: string; entries: string[] }
  mapAssetA: string
  mapAssetB: string
}

export const TWO_BOOK_IDENTITY_FIXTURE: TwoBookIdentityFixture = {
  bookA: { bookId: 'book-alpha', worldbookId: 'wb-alpha', entries: ['ent-a1', 'ent-a2'] },
  bookB: { bookId: 'book-beta', worldbookId: 'wb-beta', entries: ['ent-b1', 'ent-b2'] },
  mapAssetA: 'map-asset-alpha',
  mapAssetB: 'map-asset-beta',
}

/** 旧存档 + stale binding fixture 的 mapConfigJSON 样例（迁移测试用）。 */
export const LEGACY_MAP_CONFIG_JSON_SAMPLE = JSON.stringify({
  voronoiConfig: {
    seed: 'legacy-seed-777',
    pointCount: 6000,
    heightmapTemplate: 'highIsland',
    stylePreset: 'topographic',
  },
  markers: [
    {
      id: 'mk-1',
      name: '青岚城',
      x: 640,
      y: 380,
      type: 'capital',
      importance: 0.9,
      source: 'worldbook',
      worldbookEntryId: 'ent-a1',
      worldbookId: 'wb-alpha',
      bindingStatus: 'confirmed',
    },
    {
      id: 'mk-2',
      name: '沉沙渡',
      x: 820,
      y: 460,
      type: 'port',
      importance: 0.4,
      userAdded: true,
    },
  ],
  lastGenerationMeta: { generatorVersion: 'legacy-round2' },
  mapVersions: [{ id: 'rev-1' }],
  activeMapRevision: 'rev-1',
})

// ─────────────────────────────────────────────────────────────────────────────
// P1.5 Task C：author-semantic fixture
// ⚠️ 2026-08-29 复审降级：其手写视觉几何（REGION_RINGS/河流/道路）被判定为
// "不能当作真实大陆"，已从视觉路径废弃（p15-light-world-1440.png 为失败证据）。
// 本 fixture 现在只允许用于纯函数、合同与策略测试；视觉默认走真实生成 fixture
// （semantic-projection.js 绑定真实 feature）。
// ─────────────────────────────────────────────────────────────────────────────

import type { MapDocumentV2 } from '../model/mapDocumentV2'
import type { MapContextSignal, MapFeatureKind, MapFeatureScope } from '../model/mapFeature'
import { validateMapDocumentV2 } from '../model/mapDocumentV2'

export interface AuthorSemanticWorldbookPlace {
  worldbookEntryId: string
  name: string
  status: 'confirmed' | 'candidate' | 'conflict' | 'stale' | 'unplaced'
  /** 已落图地点对应的空间对象；unplaced 时缺省。 */
  mapObjectId?: string
  parentFeatureId?: string
  kind?: MapFeatureKind
  scope?: MapFeatureScope
}

export interface AuthorSemanticFixture {
  document: MapDocumentV2
  worldbookPlaces: AuthorSemanticWorldbookPlace[]
  /** 当前写作上下文：当前场 1、当前单元 2-4、章节引用 4-8。 */
  contextSignals: MapContextSignal[]
}

function pt(id: string, x: number, y: number, props: Record<string, unknown>) {
  return {
    mapObjectId: id,
    geometry: { type: 'point', coordinates: [x, y] } as const,
    properties: { featureId: id, mapRevision: 1, ...props } as never,
  }
}

const REGION_RINGS: Record<string, Array<[number, number]>> = {
  'region:cangwu': [[[80, 120], [520, 90], [600, 300], [560, 640], [460, 880], [140, 860], [70, 500]]],
  'region:yunmeng': [[[600, 400], [1060, 440], [1120, 700], [1020, 960], [620, 950], [540, 700]]],
  'region:beiyuan': [[[760, 70], [1480, 90], [1540, 320], [1440, 540], [1100, 560], [860, 470], [740, 260]]],
}

function buildAuthorSemanticDocument(): MapDocumentV2 {
  const settlements: unknown[] = []
  const addSettlement = (
    id: string, name: string, x: number, y: number,
    kind: MapFeatureKind, scope: MapFeatureScope, extra: Record<string, unknown> = {},
  ) => {
    settlements.push(pt(id, x, y, {
      featureType: 'settlement', label: name, kind, scope,
      displayPriority: kind === 'capital' ? 40 : kind === 'city' ? 30 : kind === 'town' ? 20 : 15,
      icon: kind === 'capital' ? 'capital' : kind === 'city' ? 'city' : kind === 'town' ? 'town' : 'village',
      ...extra,
    }))
  }

  // 苍梧国（西）
  addSettlement('settlement:cangwu-capital', '苍梧城', 300, 420, 'capital', 'region')
  addSettlement('settlement:linyuan', '临渊城', 180, 600, 'city', 'region')
  addSettlement('settlement:baize', '白泽镇', 430, 250, 'town', 'local')
  addSettlement('settlement:guixu', '归墟港', 520, 700, 'town', 'local', { icon: 'port' })
  addSettlement('settlement:qinggang', '青岗村', 220, 300, 'village', 'local', { parentFeatureId: 'settlement:baize' })
  addSettlement('settlement:luoyan-cangwu', '落雁村', 380, 520, 'village', 'local', { parentFeatureId: 'settlement:linyuan' })
  addSettlement('settlement:xijian', '洗剑村', 150, 760, 'village', 'local', { parentFeatureId: 'settlement:linyuan' })
  addSettlement('settlement:zheliu', '折柳村', 480, 600, 'village', 'local', { parentFeatureId: 'settlement:guixu' })
  addSettlement('settlement:zhenliu', '枕流村', 300, 800, 'village', 'local', { parentFeatureId: 'settlement:guixu' })
  addSettlement('settlement:qixia', '栖霞村', 560, 300, 'village', 'local', { parentFeatureId: 'settlement:baize' })

  // 云梦国（中南）
  addSettlement('settlement:yunmeng-capital', '云梦城', 740, 790, 'capital', 'region')
  addSettlement('settlement:guanlan', '观澜城', 950, 850, 'city', 'region')
  addSettlement('settlement:tingyu-zhen', '听雨镇', 700, 880, 'town', 'local')
  addSettlement('settlement:hengqu', '横渠镇', 1000, 600, 'town', 'local')
  addSettlement('settlement:luoyan-yunmeng', '落雁村', 860, 560, 'village', 'local', { parentFeatureId: 'settlement:guanlan' })
  addSettlement('settlement:huiyan', '回雁村', 760, 900, 'village', 'local', { parentFeatureId: 'settlement:tingyu-zhen' })
  addSettlement('settlement:zhaoye', '照夜村', 1050, 760, 'village', 'local', { parentFeatureId: 'settlement:guanlan' })
  addSettlement('settlement:guitang', '归塘村', 640, 760, 'village', 'local', { parentFeatureId: 'settlement:tingyu-zhen' })
  addSettlement('settlement:chenxing', '沉星村', 720, 620, 'village', 'local', { parentFeatureId: 'settlement:hengqu' })

  // 北原国（东北）
  addSettlement('settlement:beiyuan-capital', '白狼城', 1150, 200, 'capital', 'region')
  addSettlement('settlement:tianjing', '天京城', 1350, 320, 'city', 'region')
  addSettlement('settlement:hanya', '寒鸦镇', 1250, 120, 'town', 'local')
  addSettlement('settlement:muyun', '牧云镇', 980, 300, 'town', 'local')
  addSettlement('settlement:gushan', '孤山村', 1080, 420, 'village', 'local', { parentFeatureId: 'settlement:muyun' })
  addSettlement('settlement:shushi', '漱石村', 1420, 220, 'village', 'local', { parentFeatureId: 'settlement:hanya' })
  addSettlement('settlement:wangyue', '望月村', 900, 150, 'village', 'local', { parentFeatureId: 'settlement:muyun' })
  addSettlement('settlement:yinma', '饮马村', 1300, 450, 'village', 'local', { parentFeatureId: 'settlement:tianjing' })

  const regions = Object.entries(REGION_RINGS).map(([id, rings]) => ({
    mapObjectId: id,
    geometry: { type: 'polygon', coordinates: rings },
    properties: {
      featureId: id,
      featureType: 'region',
      mapRevision: 1,
      displayPriority: 35,
      scope: 'world' as MapFeatureScope,
      label: { 'region:cangwu': '苍梧', 'region:yunmeng': '云梦', 'region:beiyuan': '北原' }[id],
    } as never,
  }))

  const rivers = [
    { id: 'river:canglan', name: '沧澜江', pts: [[200, 120], [350, 400], [500, 650], [700, 820], [950, 900]] },
    { id: 'river:hanjiang', name: '寒江', pts: [[900, 80], [1100, 250], [1350, 300], [1500, 380]] },
  ].map((r) => ({
    mapObjectId: r.id,
    geometry: { type: 'line', coordinates: r.pts as Array<[number, number]> },
    properties: { featureId: r.id, featureType: 'river', mapRevision: 1, displayPriority: 10, label: r.name },
  }))

  const routes = [
    { id: 'route:cangwu-yunmeng', name: '苍云古道', pts: [[300, 420], [520, 560], [690, 700], [740, 790]] },
    { id: 'route:yunmeng-beiyuan', name: '云北商路', pts: [[740, 790], [930, 520], [1050, 360], [1150, 200]] },
  ].map((r) => ({
    mapObjectId: r.id,
    geometry: { type: 'line', coordinates: r.pts as Array<[number, number]> },
    properties: { featureId: r.id, featureType: 'route', mapRevision: 1, displayPriority: 10 },
  }))

  // 作者地点（世界书投影）：层级、同名、冲突、stale；名称带语义，不用序号。
  const narrativePlaces = [
    pt('place:qinglan', 320, 440, {
      featureType: 'narrative-place', label: '青岚城', kind: 'landmark', scope: 'region',
      displayPriority: 60, bindingStatus: 'confirmed', parentFeatureId: 'settlement:cangwu-capital',
    }),
    pt('place:chensha', 530, 690, {
      featureType: 'narrative-place', label: '沉沙渡', kind: 'site', scope: 'site',
      displayPriority: 55, bindingStatus: 'confirmed', parentFeatureId: 'settlement:guixu',
    }),
    pt('place:zangjianlu', 330, 460, {
      featureType: 'narrative-place', label: '藏剑庐', kind: 'interior', scope: 'site',
      displayPriority: 55, bindingStatus: 'confirmed', parentFeatureId: 'place:qinglan',
    }),
    pt('place:tingyu-yunmeng', 705, 870, {
      featureType: 'narrative-place', label: '听雨轩', kind: 'landmark', scope: 'site',
      displayPriority: 50, bindingStatus: 'confirmed', parentFeatureId: 'settlement:tingyu-zhen',
    }),
    pt('place:tingyu-beiyuan', 1245, 135, {
      featureType: 'narrative-place', label: '听雨轩', kind: 'landmark', scope: 'site',
      displayPriority: 45, bindingStatus: 'confirmed', parentFeatureId: 'settlement:hanya',
    }),
    pt('place:guanxing', 1345, 310, {
      featureType: 'narrative-place', label: '观星台', kind: 'landmark', scope: 'site',
      displayPriority: 45, bindingStatus: 'confirmed', parentFeatureId: 'settlement:tianjing',
    }),
    pt('place:guixu-haishi', 560, 760, {
      featureType: 'narrative-place', label: '归墟海市', kind: 'landmark', scope: 'local',
      displayPriority: 30, bindingStatus: 'candidate',
    }),
    pt('place:longgu', 1180, 520, {
      featureType: 'narrative-place', label: '龙骨荒原', kind: 'landmark', scope: 'region',
      displayPriority: 30, bindingStatus: 'candidate',
    }),
    pt('place:qianfo', 990, 330, {
      featureType: 'narrative-place', label: '千佛窟', kind: 'site', scope: 'site',
      displayPriority: 30, bindingStatus: 'candidate',
    }),
    pt('place:tiebei', 1440, 480, {
      featureType: 'narrative-place', label: '铁背龙巢', kind: 'site', scope: 'local',
      displayPriority: 30, bindingStatus: 'candidate',
    }),
    pt('place:yaowang', 240, 180, {
      featureType: 'narrative-place', label: '药王谷', kind: 'landmark', scope: 'local',
      displayPriority: 30, bindingStatus: 'candidate',
    }),
    pt('place:chensha-guchang', 505, 660, {
      featureType: 'narrative-place', label: '沉沙古战场', kind: 'site', scope: 'site',
      displayPriority: 25, bindingStatus: 'conflict',
    }),
    pt('place:jiu-wangcheng', 295, 415, {
      featureType: 'narrative-place', label: '旧苍梧王城', kind: 'site', scope: 'site',
      displayPriority: 25, bindingStatus: 'stale', parentFeatureId: 'settlement:cangwu-capital',
    }),
  ]

  return {
    schemaVersion: 2,
    mapAssetId: 'map-author-semantic',
    projectId: 'book-alpha',
    worldbookId: 'wb-alpha',
    revision: 1,
    seed: 'author-semantic-handcrafted',
    bounds: { minX: 0, minY: 0, maxX: 1600, maxY: 1000 },
    coordinateSystem: { kind: 'fictional-plane', yAxis: 'down', units: 'author-units' },
    generator: { id: 'pinax-legacy', version: 'author-semantic', configHash: 'handcrafted' },
    baseAsset: { width: 1600, height: 1000 },
    featureCollections: {
      land: [],
      water: [],
      regions: regions as never,
      rivers: rivers as never,
      routes: routes as never,
      settlements: settlements as never,
      narrativePlaces: narrativePlaces as never,
    },
    aliases: [],
    style: { styleId: 'atlas-clean' },
    createdAt: 0,
    updatedAt: 0,
  }
}

const AUTHOR_DOCUMENT = buildAuthorSemanticDocument()

export const AUTHOR_SEMANTIC_FIXTURE: AuthorSemanticFixture = {
  document: AUTHOR_DOCUMENT,
  worldbookPlaces: [
    { worldbookEntryId: 'ent-qinglan', name: '青岚城', status: 'confirmed', mapObjectId: 'place:qinglan', parentFeatureId: 'settlement:cangwu-capital', kind: 'landmark', scope: 'region' },
    { worldbookEntryId: 'ent-chensha', name: '沉沙渡', status: 'confirmed', mapObjectId: 'place:chensha', parentFeatureId: 'settlement:guixu', kind: 'site', scope: 'site' },
    { worldbookEntryId: 'ent-zangjianlu', name: '藏剑庐', status: 'confirmed', mapObjectId: 'place:zangjianlu', parentFeatureId: 'place:qinglan', kind: 'interior', scope: 'site' },
    { worldbookEntryId: 'ent-tingyu-yunmeng', name: '听雨轩（云梦）', status: 'confirmed', mapObjectId: 'place:tingyu-yunmeng', parentFeatureId: 'settlement:tingyu-zhen', kind: 'landmark', scope: 'site' },
    { worldbookEntryId: 'ent-tingyu-beiyuan', name: '听雨轩（北原）', status: 'confirmed', mapObjectId: 'place:tingyu-beiyuan', parentFeatureId: 'settlement:hanya', kind: 'landmark', scope: 'site' },
    { worldbookEntryId: 'ent-guanxing', name: '观星台', status: 'confirmed', mapObjectId: 'place:guanxing', parentFeatureId: 'settlement:tianjing', kind: 'landmark', scope: 'site' },
    { worldbookEntryId: 'ent-guixu-haishi', name: '归墟海市', status: 'candidate', mapObjectId: 'place:guixu-haishi', kind: 'landmark', scope: 'local' },
    { worldbookEntryId: 'ent-longgu', name: '龙骨荒原', status: 'candidate', mapObjectId: 'place:longgu', kind: 'landmark', scope: 'region' },
    { worldbookEntryId: 'ent-qianfo', name: '千佛窟', status: 'candidate', mapObjectId: 'place:qianfo', kind: 'site', scope: 'site' },
    { worldbookEntryId: 'ent-tiebei', name: '铁背龙巢', status: 'candidate', mapObjectId: 'place:tiebei', kind: 'site', scope: 'local' },
    { worldbookEntryId: 'ent-yaowang', name: '药王谷', status: 'candidate', mapObjectId: 'place:yaowang', kind: 'landmark', scope: 'local' },
    { worldbookEntryId: 'ent-chensha-guchang', name: '沉沙古战场', status: 'conflict', mapObjectId: 'place:chensha-guchang', kind: 'site', scope: 'site' },
    { worldbookEntryId: 'ent-jiu-wangcheng', name: '旧苍梧王城', status: 'stale', mapObjectId: 'place:jiu-wangcheng', parentFeatureId: 'settlement:cangwu-capital', kind: 'site', scope: 'site' },
    { worldbookEntryId: 'ent-yunmeng-zexin', name: '云梦泽心', status: 'unplaced', kind: 'landmark', scope: 'region' },
    { worldbookEntryId: 'ent-beiyuan-wangting', name: '北原王庭', status: 'unplaced', kind: 'landmark', scope: 'region' },
  ],
  contextSignals: [
    { featureId: 'place:qinglan', reason: 'current-scene', sourceRef: 'unit:ch1-u3' },
    { featureId: 'place:zangjianlu', reason: 'current-unit', sourceRef: 'unit:ch1-u3' },
    { featureId: 'place:tingyu-yunmeng', reason: 'current-unit', sourceRef: 'unit:ch1-u5' },
    { featureId: 'place:chensha', reason: 'chapter-reference', sourceRef: 'chapter:ch1' },
    { featureId: 'place:tingyu-beiyuan', reason: 'chapter-reference', sourceRef: 'chapter:ch1' },
    { featureId: 'place:guanxing', reason: 'chapter-reference', sourceRef: 'chapter:ch2' },
    { featureId: 'place:jiu-wangcheng', reason: 'chapter-reference', sourceRef: 'chapter:ch1' },
    { featureId: 'place:chensha-guchang', reason: 'chapter-reference', sourceRef: 'chapter:ch1' },
  ],
}

/** 结构自检：语义 fixture 必须是合法 MapDocument v2（宿主测试也覆盖）。 */
export function validateAuthorSemanticFixture() {
  return validateMapDocumentV2(AUTHOR_SEMANTIC_FIXTURE.document)
}
