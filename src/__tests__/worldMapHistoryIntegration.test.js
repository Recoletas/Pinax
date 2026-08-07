import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMapNativePlaceInventory, buildWorldbookLocationMarkers, buildWorldbookPlaceInventory, collectWorldbookLocationEntries, compileWorldbookMapConstraints, extractMapSeedsFromWorldbook } from '../services/ai/worldbookMapBridge'
import { buildWorldbookSemanticSites } from '../services/worldHistory/geoHistoryPipeline'
import { extractProvisionalPlaceCandidates } from '../services/settingPlaceGeneration'
import { applyLocationConstraints, evaluateLocationTopologyConstraints } from '../services/world-map/engine/location-constraints'
import { generateMap } from '../services/world-map/engine'
import { applyMapReplacementChoices, buildMapReplacementReview, createMapRevision } from '../services/world-map/mapVersioning'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('GEO-HISTORY: map generation feeds a reviewed history draft', () => {
  it('WorldMapPanel keeps map output, builds a draft, and persists only after explicit confirmation', () => {
    const panel = readProjectFile('src/components/geography/WorldMapPanel.vue')

    expect(panel).toContain("buildGeoHistoryDraft")
    expect(panel).toMatch(/latestMapData\.value\s*=\s*payload\?\.data/)
    expect(panel).toContain('historyDraft.value = result.geoHistory')
    expect(panel).toContain('worldStore.updateWorldbook')
    expect(panel).toContain('geoHistory: historyDraft.value')
    expect(panel).toContain('检查地理语义')
    expect(panel).toContain('整理历史草案')
    expect(panel).toContain('写入世界历史')
    expect(panel).toContain('await worldStore.loadWorldbooksIndex()')
    expect(panel).toContain('await worldStore.ensureActiveWorldbook()')
    expect(panel).toContain('data-test="worldbook-source-select"')
    expect(panel).toContain('worldStore.setActiveWorldbook(targetId)')
    expect(panel).toContain('geoStore.replaceMarkers(manualMarkers)')
    expect(panel).toContain('immediate: true')
    expect(panel).toContain('stripAuthoredPlaceNamesFromConfig(config, worldbookBridge)')
    expect(panel).toContain('config.constraints = mergeMapConstraints(compiledWorldbook.constraints)')
    expect(panel).not.toContain('compiledWorldbook.constraints,\n      config.constraints')
    expect(panel).toContain('buildMapNativePlaceInventory')
    expect(panel).toContain('纳入世界书')

    const placeCatalog = readProjectFile('src/components/worldbook/PlaceCatalog.vue')
    expect(placeCatalog).toContain('data-test="place-catalog"')
    expect(placeCatalog).toContain('worldStore.createPlace')
    expect(placeCatalog).toContain('worldStore.updatePlace')
    expect(placeCatalog).toContain('worldStore.deletePlace')
    expect(placeCatalog).toContain('generatePlacesFromOverview')
    expect(placeCatalog).toContain('adoptPlaceDraft')
    const settingsPanel = readProjectFile('src/components/worldbook/StructuredSettingsPanel.vue')
    expect(settingsPanel).toContain('<PlaceCatalog')
    expect(settingsPanel).toContain("activeSectionKey === 'world'")

    const mapCanvas = readProjectFile('src/components/geography/WorldMapVoronoi.vue')
    expect(mapCanvas).toContain('projectAuthoredBurgNames')
    expect(mapCanvas).toContain('getStyleConfig(renderStylePreset.value)')

    const mapAdapter = readProjectFile('src/services/ai/voronoiMapAdapter.js')
    expect(mapAdapter).toContain('禁止为它们猜测坐标')
    expect(mapAdapter).not.toContain('世界书地点名候选')

    const markers = buildWorldbookLocationMarkers(
      {
        id: 'wb-1',
        entries: [{ id: 'loc-white-harbor', name: '白港', type: 'location', content: '沿海港口城市' }],
      },
      {
        width: 1200,
        height: 800,
        seed: 'map-seed',
        burgs: [{ i: 1, name: '白港', x: 320, y: 240 }],
      },
      [{ id: 'manual-1', name: '手动标记', x: 100, y: 100, type: 'custom', importance: 2 }],
    )

    expect(markers).toHaveLength(2)
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'worldbook-location:loc-white-harbor',
        worldbookEntryId: 'loc-white-harbor',
        worldbookId: 'wb-1',
        source: 'worldbook',
        type: 'port',
        x: 320,
        y: 240,
      }),
      expect.objectContaining({ id: 'manual-1', name: '手动标记' }),
    ]))

    const switchedMarkers = buildWorldbookLocationMarkers(
      {
        id: 'wb-2',
        entries: [{ id: 'loc-white-harbor', name: '新世界的白港', type: 'location', content: '内陆城市' }],
      },
      { width: 1200, height: 800, seed: 'map-seed', burgs: [] },
      markers,
    )
    expect(switchedMarkers).toEqual([
      expect.objectContaining({ id: 'manual-1', name: '手动标记' }),
    ])
    expect(switchedMarkers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '白港' }),
    ]))

    const fallbackMarkers = buildWorldbookLocationMarkers(
      {
        entries: [
          { id: 'loc-north-city', name: '北境城', type: 'location', content: '北方内陆城' },
          { id: 'loc-south-city', name: '南境城', type: 'location', content: '南方内陆城' },
        ],
      },
      {
        width: 1200,
        height: 800,
        seed: 'fallback-seed',
        burgs: [],
        cells: {
          length: 2,
          p: new Float64Array([200, 200, 800, 600]),
          h: new Uint8Array([40, 45]),
        },
      },
    )
    expect(fallbackMarkers).toEqual([])

    const geographyMatchedMarkers = buildWorldbookLocationMarkers(
      {
        id: 'wb-geography-match',
        entries: [
          { id: 'loc-village', name: '青禾村', type: 'location', content: '内陆低地的小村落，村外有一条灌溉河' },
          { id: 'loc-port', name: '白帆港', type: 'location', content: '沿海港口城市' },
        ],
      },
      {
        width: 1200,
        height: 800,
        seed: 'geography-match',
        burgs: [
          { i: 0, name: '', cell: 0, x: 0, y: 0, state: 0, capital: false, port: false, population: 0 },
          { i: 1, name: '原野村', cell: 0, x: 200, y: 220, state: 1, capital: false, port: false, population: 4 },
          { i: 2, name: '海湾城', cell: 1, x: 850, y: 560, state: 1, capital: false, port: true, population: 90 },
        ],
        cells: {
          length: 2,
          p: new Float64Array([200, 220, 850, 560]),
          h: new Uint8Array([28, 24]),
          t: new Int8Array([5, 1]),
          s: new Float32Array([55, 80]),
          r: new Uint16Array([0, 1]),
          harbor: new Uint8Array([0, 2]),
          biome: new Uint8Array([4, 4]),
          state: new Uint16Array([1, 1]),
          burg: new Uint16Array([1, 2]),
        },
      },
    )
    expect(geographyMatchedMarkers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '青禾村', type: 'village', mapObjectId: 'burg:1', bindingStatus: 'auto-matched' }),
      expect.objectContaining({ name: '白帆港', mapObjectId: 'burg:2', bindingStatus: 'auto-matched' }),
    ]))
    expect(buildWorldbookPlaceInventory({
      id: 'wb-geography-match',
      entries: [
        { id: 'loc-village', name: '青禾村', type: 'location', content: '内陆低地的小村落，村外有一条灌溉河' },
        { id: 'loc-port', name: '白帆港', type: 'location', content: '沿海港口城市' },
      ],
    }, {
      mapData: {
        burgs: [
          { i: 0, name: '' },
          { i: 1, name: '原野村', cell: 0, x: 200, y: 220 },
          { i: 2, name: '海湾城', cell: 1, x: 850, y: 560 },
        ],
      },
      markers: geographyMatchedMarkers,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '青禾村', status: 'auto-matched', canConfirm: true }),
      expect.objectContaining({ name: '白帆港', status: 'auto-matched', canConfirm: true }),
    ]))

    const extractedMapSeeds = extractMapSeedsFromWorldbook({
      entries: [
        { id: 'loc-white-harbor', name: '白港', type: 'location', content: '沿海港口城市' },
        { id: 'loc-north-city', name: '北境城', type: 'location', content: '北方内陆城' },
      ]
    })
    expect(extractedMapSeeds.burgNames).toEqual([])
    expect(extractedMapSeeds.locations).toEqual([
      expect.objectContaining({ id: 'loc-white-harbor', name: '白港' }),
      expect.objectContaining({ id: 'loc-north-city', name: '北境城' }),
    ])

    expect(buildWorldbookSemanticSites({
      entries: [{ id: 'loc-north-city', name: '北境城', type: 'location', content: '北方内陆城' }],
    })).toEqual([
      expect.objectContaining({
        id: 'worldbook-place:loc-north-city',
        title: '北境城',
        source: 'worldbook',
      }),
    ])

    const referencedMarkers = buildWorldbookLocationMarkers(
      {
        entries: [{
          id: 'entry-traveler',
          name: '旅人档案',
          type: 'character',
          content: '曾在暮色港停留。',
          relations: { locations: ['暮色港'] },
        }],
      },
      { width: 1200, height: 800, seed: 'map-seed', burgs: [] },
    )
    expect(referencedMarkers).toEqual([])

    const overviewMarkers = buildWorldbookLocationMarkers(
      {
        entries: [{
          id: 'entry-geography-overview',
          name: '地理环境',
          type: 'location',
          content: '高汤盆地位于北方，东侧有霜落城，南方连接白石港。',
        }],
      },
      { width: 1200, height: 800, seed: 'map-seed', burgs: [] },
    )
    expect(overviewMarkers).toEqual([])

    const extractedOverviewPlaces = collectWorldbookLocationEntries({
      entries: [{
        id: 'entry-geography-overview',
        name: '地理环境',
        type: 'location',
        content: '高汤盆地位于北方，东侧有霜落城，南方连接白石港。旅人在某个小村发现一处通往地下城的入口。青禾村位于高汤盆地，并与白石港由旧商道相连。',
      }],
    })
    expect(extractedOverviewPlaces).toEqual([])
    const provisionalOverviewPlaces = extractProvisionalPlaceCandidates('高汤盆地位于北方，东侧有霜落城，南方连接白石港。旅人在某个小村发现一处通往地下城的入口。青禾村位于高汤盆地，并与白石港由旧商道相连。')
    expect(provisionalOverviewPlaces.map((entry) => entry.name)).toEqual(['高汤盆地', '霜落城', '白石港', '青禾村'])
    expect(provisionalOverviewPlaces.find((entry) => entry.name === '青禾村')).toEqual(expect.objectContaining({
      evidence: expect.stringContaining('青禾村位于高汤盆地'),
      relations: expect.arrayContaining([
        expect.objectContaining({ targetName: '高汤盆地', type: 'parent' }),
        expect.objectContaining({ targetName: '白石港', type: 'route' }),
      ]),
    }))
    expect(provisionalOverviewPlaces.some((entry) => /某个小村|地下城/.test(entry.name))).toBe(false)
    expect(collectWorldbookLocationEntries({
      entries: [{
        id: 'geo-prose-only',
        name: '地理环境',
        type: 'location',
        content: '总而言之，这片大地的每一寸都浸透着魔力与机油的气味。',
      }],
    })).toEqual([])

    const quotedGeographyPlaces = collectWorldbookLocationEntries({
      entries: [{
        id: 'geo-quoted-places',
        name: '地理环境',
        type: 'location',
        content: '来自世界书「地理环境」：这个世界最著名的地标是环抱中央平原的‘穹脊山脉’，山脉合围出一片辽阔的‘中央盆地’，盆地中央是‘虹镜湖’，传说湖底沉淀着远古时代的精华，至今仍泛着虹彩，湖中‘浮沫水母’的触须能感知魔力波动，常被学院学生捉来当免费探测器。',
      }],
    })
    expect(quotedGeographyPlaces).toEqual([])
    expect(extractProvisionalPlaceCandidates('这个世界最著名的地标是环抱中央平原的‘穹脊山脉’，山脉合围出一片辽阔的‘中央盆地’，盆地中央是‘虹镜湖’，传说湖底沉淀着远古时代的精华，至今仍泛着虹彩，湖中‘浮沫水母’的触须能感知魔力波动，常被学院学生捉来当免费探测器。').map((entry) => entry.name))
      .toEqual(['穹脊山脉', '中央盆地', '虹镜湖'])

    const settlementListPlaces = collectWorldbookLocationEntries({
      entries: [{
        id: 'geo-settlement-list',
        name: '地理环境',
        type: 'location',
        content: '来自世界书：这片大陆上除了教廷城、学城这样的大都会，还有许多大小城镇依附着各自的传统与蒸汽新生机，散落在四域之中。北境·灰锤堡：矮人矿工与地精商贩混杂的矿镇，因家家户户的烟囱都冒黑烟而得名“灰锤”。镇中央立着一台退役的蒸汽挖掘机，孩子们把它当滑梯。这里的领主兼任矿主，每天下午三点在钟楼上敲一壶开水作为“矿工茶歇”信号。',
      }],
    })
    expect(settlementListPlaces).toEqual([])
    expect(extractProvisionalPlaceCandidates('这片大陆上除了教廷城、学城这样的大都会，还有许多大小城镇依附着各自的传统与蒸汽新生机，散落在四域之中。北境·灰锤堡：矮人矿工与地精商贩混杂的矿镇。').map((entry) => entry.name))
      .toEqual(['教廷城', '学城', '灰锤堡'])

    const sourceNoteMarkers = buildWorldbookLocationMarkers({
      entries: [{
        id: 'source-note',
        name: '白石港',
        type: 'location',
        content: '来自世界书「地理环境」：白石港位于南部海岸。',
      }],
    }, {
      burgs: [{ i: 0, name: '' }, { i: 1, name: '白石港', x: 10, y: 20, cell: 1 }],
    })
    expect(sourceNoteMarkers[0].note).toBe('来自世界书「地理环境」：白石港位于南部海岸。')
    expect(sourceNoteMarkers[0].note).not.toContain('来自世界书：来自世界书')
    const explicitBeforeProse = collectWorldbookLocationEntries({
      entries: [
        { id: 'geo-first', name: '地理环境', type: 'location', content: '青禾村位于高汤盆地。' },
        { id: 'village-maintained', name: '青禾村', type: 'location', content: '作者维护的正式村落条目。' },
      ],
    }).find((entry) => entry.name === '青禾村')
    expect(explicitBeforeProse).toEqual(expect.objectContaining({
      id: 'village-maintained',
      __worldbookEntryId: 'village-maintained',
      __placeSource: 'explicit',
      content: '作者维护的正式村落条目。',
    }))

    expect(buildMapNativePlaceInventory({
      burgs: [
        { i: 0, name: '' },
        { i: 1, name: '原野村', cell: 2, x: 10, y: 20, state: 1, population: 4, capital: false, port: false },
        { i: 2, name: '海湾城', cell: 3, x: 30, y: 40, state: 1, population: 80, capital: false, port: true },
        { i: 3, name: '旧桥镇', cell: 4, x: 50, y: 60, state: 1, population: 18, capital: false, port: false },
      ],
      states: [{ i: 0, name: '' }, { i: 1, name: '北境' }],
    }, {
      entries: [{ id: 'existing', name: '原野村', type: 'location', content: '既有地点' }],
    }, [{ id: 'preview', name: '白石港', mapObjectId: 'burg:3', source: 'worldbook', bindingStatus: 'auto-matched' }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '原野村', kind: 'village', status: 'linked', canPromote: false }),
      expect.objectContaining({ name: '海湾城', kind: 'port', status: 'map-only', canPromote: true, stateName: '北境' }),
      expect.objectContaining({ name: '旧桥镇', kind: 'town', status: 'previewed', canPromote: false }),
    ]))

    const inventory = buildWorldbookPlaceInventory({
      id: 'wb-1',
      updatedAt: 10,
      entries: [
        { id: 'loc-white-harbor', name: '白港', type: 'location', keys: ['白港', '白港湾'], content: '沿海港口城市' },
        { id: 'geo-overview', name: '地理环境', type: 'location', content: '高汤盆地位于北方。' },
      ],
    }, {
      mapData: {
        width: 1200,
        height: 800,
        seed: 'map-seed',
        burgs: [{ i: 1, name: '白港', x: 320, y: 240 }],
      },
      markers: buildWorldbookLocationMarkers(
        {
          id: 'wb-1',
          updatedAt: 10,
          entries: [
            { id: 'loc-white-harbor', name: '白港', type: 'location', keys: ['白港', '白港湾'], content: '沿海港口城市' },
            { id: 'geo-overview', name: '地理环境', type: 'location', content: '高汤盆地位于北方。' },
          ],
        },
        {
          width: 1200,
          height: 800,
          seed: 'map-seed',
          burgs: [{ i: 1, name: '白港', x: 320, y: 240 }],
        },
      ),
    })
    expect(inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryId: 'loc-white-harbor',
        kind: 'burg',
        status: 'auto-matched',
        matchMethod: 'exact',
        canConfirm: true,
      }),
    ]))

    const compiled = compileWorldbookMapConstraints({
      id: 'wb-1',
      entries: [
        {
          id: 'loc-white-harbor',
          name: '白港',
          type: 'location',
          content: '沿海港口城市',
          mapBinding: { status: 'confirmed', x: 2, y: 2 },
        },
        {
          id: 'geo-overview',
          name: '地理环境',
          type: 'location',
          content: '高汤盆地位于北方。',
        },
      ],
    })
    expect(compiled.constraints.locations).toEqual([
      expect.objectContaining({ id: 'loc-white-harbor', name: '白港', hard: ['land', 'coast'] }),
    ])
    expect(compiled.report.compiled).toEqual([
      expect.objectContaining({ id: 'loc-white-harbor', target: 'location' }),
    ])

    const waterCells = {
      length: 1,
      p: new Float64Array([1, 1]),
      h: new Uint8Array([10]),
      harbor: new Uint8Array([0]),
      r: new Uint16Array([0]),
      s: new Float32Array([0]),
      burg: new Uint16Array([0]),
    }
    const waterBurgs = [{ i: 0, name: '', cell: 0, x: 1, y: 1, state: 0, capital: false, port: false, population: 0 }]
    const waterReport = { satisfied: [], relaxed: [], impossible: [] }
    applyLocationConstraints(waterCells, waterBurgs, {
      locations: [{ id: 'loc-deep-lake', name: '深湖', kind: 'site', x: 1, y: 1, hard: ['water'] }],
    }, waterReport)
    expect(waterBurgs).toHaveLength(1)
    expect(waterReport.impossible).toEqual([
      expect.objectContaining({ name: '深湖' }),
    ])

    const cells = {
      length: 3,
      p: new Float64Array([0, 0, 1, 1, 2, 2]),
      h: new Uint8Array([30, 10, 40]),
      harbor: new Uint8Array([0, 0, 1]),
      r: new Uint16Array([0, 0, 0]),
      s: new Float32Array([20, 0, 30]),
      burg: new Uint16Array([1, 0, 0]),
    }
    const burgs = [{ i: 0, name: '', cell: 0, x: 0, y: 0, state: 0, capital: false, port: false, population: 0 }, {
      i: 1, name: '白港', cell: 0, x: 0, y: 0, state: 0, capital: false, port: false, population: 1,
    }]
    const constraintReport = { satisfied: [], relaxed: [], impossible: [] }
    applyLocationConstraints(cells, burgs, compiled.constraints, constraintReport)
    expect(burgs[1]).toEqual(expect.objectContaining({ cell: 2, x: 2, y: 2, port: true }))
    expect(constraintReport.satisfied).toEqual([
      expect.objectContaining({ id: 'loc-white-harbor', cellId: 2 }),
    ])

    const topologyCompiled = compileWorldbookMapConstraints({
      id: 'wb-topology',
      entries: [
        {
          id: 'loc-white-harbor', name: '白港', type: 'location', content: '沿海港口城市',
          mapBinding: { status: 'confirmed', x: 2, y: 2 },
          parentRef: { targetId: 'region-north', targetName: '北境', status: 'resolved' },
          factionRef: { targetId: 'region-north', targetName: '北境', status: 'resolved' },
          relations: { locations: [
            { targetId: 'loc-frost-gate', targetName: '霜门', type: 'same-state' },
            { name: '北境', relationType: 'country' },
            { name: '银溪', relationType: 'on_river' },
          ] },
        },
        {
          id: 'loc-frost-gate', name: '霜门', type: 'location', content: '北境内陆城',
          mapBinding: { status: 'confirmed', x: 3, y: 3 },
        },
        {
          id: 'region-north', name: '北境', type: 'location', content: '北境区域',
          mapBinding: { status: 'confirmed', x: 2, y: 2 },
        },
      ],
    })
    expect(topologyCompiled.constraints.locations[0].relationRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '霜门', relation: 'same-state' }),
      expect.objectContaining({ name: '北境', relation: 'state' }),
      expect.objectContaining({ name: '银溪', relation: 'river' }),
    ]))
    expect(topologyCompiled.constraints.anchors).toEqual([
      expect.objectContaining({ id: 'region-north', name: '北境', kind: 'region' }),
    ])

    const topologyCells = {
      ...cells,
      state: new Uint16Array([1, 0, 1]),
      r: new Uint16Array([0, 0, 1]),
    }
    const topologyBurgs = [
      burgs[0],
      { ...burgs[1], name: '白港', state: 1, cell: 2, x: 2, y: 2 },
      { i: 2, name: '霜门', state: 1, cell: 0, x: 0, y: 0, capital: false, port: false, population: 1 },
    ]
    const topologyReport = { satisfied: [], relaxed: [], impossible: [] }
    evaluateLocationTopologyConstraints(
      topologyCells,
      topologyBurgs,
      [{ i: 0, name: '', color: '', capital: 0 }, { i: 1, name: '北境', color: '', capital: 1 }],
      [{ i: 1, name: '银溪', cells: [2], widths: [1], mouth: 2, source: 2 }],
      topologyCompiled.constraints,
      topologyReport,
    )
    expect(topologyReport.satisfied).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'same-state' }),
      expect.objectContaining({ kind: 'state' }),
      expect.objectContaining({ kind: 'river' }),
    ]))

    const generatedWithRelations = generateMap({
      seed: 'worldbook-relation-smoke',
      pointCount: 500,
      stateCount: 3,
      burgNames: ['白港', '灯城', '河门', '霜门', '北堡', '南港'],
      stateNames: ['北境', '南境', '河国'],
      constraints: {
        locations: [
          {
            id: 'white', name: '白港', kind: 'burg', x: 300, y: 250, hard: ['land'],
            relationRefs: [
              { name: '霜门', relation: 'same-state' },
              { name: '北境', relation: 'state' },
              { name: '银溪', relation: 'river' },
            ],
          },
          { id: 'frost', name: '霜门', kind: 'burg', x: 350, y: 280, hard: ['land'] },
        ],
        rivers: [{ name: '银溪', sourceCell: -1, sourceX: 300, sourceY: 250 }],
        routes: [{ name: '白港—霜门', from: '白港', to: '霜门' }],
      },
    })
    expect(generatedWithRelations.burgs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '白港' }),
      expect.objectContaining({ name: '霜门' }),
    ]))
    expect(generatedWithRelations.constraintReport.satisfied).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'same-state' }),
      expect.objectContaining({ kind: 'state' }),
      expect.objectContaining({ kind: 'river' }),
      expect.objectContaining({ kind: 'route' }),
    ]))

    const versionedWorldbook = {
      id: 'wb-versioned',
      updatedAt: 101,
      entries: [
        {
          id: 'white', name: '白港', type: 'location', keys: ['白港湾'], content: '沿海港口',
          mapBinding: { status: 'confirmed', mapId: 'map-old', mapRevision: 'rev-old', x: 100, y: 100 },
        },
        {
          id: 'lost', name: '失落塔', type: 'location', content: '旧塔',
          mapBinding: { status: 'confirmed', mapId: 'map-old', mapRevision: 'rev-old', x: 700, y: 500 },
        },
      ],
    }
    const replacementReview = buildMapReplacementReview({
      worldbook: versionedWorldbook,
      previousMap: { width: 1200, height: 800, seed: 'old' },
      nextMap: {
        width: 1200,
        height: 800,
        seed: 'new',
        burgs: [{ i: 0, name: '' }, { i: 1, name: '白港湾', x: 360, y: 240 }],
        constraintReport: {
          satisfied: [],
          relaxed: [{ id: 'white', name: '白港 → 北境', kind: 'state', reason: '生成国界与世界书不一致' }],
          impossible: [],
        },
      },
      markers: [{ id: 'manual', name: '手工点', x: 600, y: 400, userAdded: true }],
      sourceMapRevision: 'rev-old',
    })
    expect(replacementReview.summary).toEqual(expect.objectContaining({ conflict: 1, unmatched: 1 }))
    expect(replacementReview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryId: 'white', status: 'conflict', suggested: expect.objectContaining({ x: 360, y: 240 }), defaultChoice: 'remap' }),
      expect.objectContaining({ entryId: 'lost', status: 'unmatched', suggested: null, defaultChoice: 'keep' }),
    ]))

    const appliedReplacement = applyMapReplacementChoices(versionedWorldbook, replacementReview, {
      white: 'remap',
      lost: 'unbound',
    }, { mapId: 'map-new', mapRevision: 'rev-new' })
    expect(appliedReplacement.ok).toBe(true)
    expect(appliedReplacement.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'white', mapBinding: expect.objectContaining({ status: 'confirmed', x: 360, y: 240, mapRevision: 'rev-new' }) }),
      expect.objectContaining({ id: 'lost', mapBinding: expect.objectContaining({ status: 'unbound', mapRevision: 'rev-new' }) }),
    ]))
    expect(appliedReplacement.markers).toEqual([
      expect.objectContaining({ id: 'manual', x: 600, y: 400 }),
    ])

    const staleReplacement = applyMapReplacementChoices({
      ...versionedWorldbook,
      entries: versionedWorldbook.entries.map((entry) => entry.id === 'white' ? { ...entry, content: '已被用户修改' } : entry),
    }, replacementReview, { white: 'remap', lost: 'keep' }, { mapId: 'map-new', mapRevision: 'rev-new' })
    expect(staleReplacement).toEqual(expect.objectContaining({ ok: false, staleEntryIds: ['white'] }))

    const revision = createMapRevision({
      worldId: 'world-1',
      config: { seed: 'new', pointCount: 500 },
      mapData: { seed: 'new', cells: { length: 500 } },
      markers: appliedReplacement.markers,
      worldbook: { ...versionedWorldbook, entries: appliedReplacement.entries },
      review: replacementReview,
      now: 1000,
    })
    expect(revision).toEqual(expect.objectContaining({ id: 'maprev_world-1_new_1000', seed: 'new' }))
    expect(revision).not.toHaveProperty('mapData')
    expect(JSON.stringify(revision)).not.toContain('cells')
  })

  it('the map page keeps the worldbook/history integration visible in the main workspace', () => {
    const page = readProjectFile('src/pages/WorldMapPage.vue')
    const panel = readProjectFile('src/components/geography/WorldMapPanel.vue')

    expect(page).toContain(':focus-place-id="focusPlaceId"')
    expect(page).toContain(':focus-history-node-id="focusHistoryNodeId"')
    expect(page).toContain(':focus-entry-id="focusEntryId"')
    expect(page).toContain('@open-settings="openFocusedPlaceSettings"')
    expect(page).toContain('@open-worldbook="openWorldbookImport"')
    expect(panel).toContain('class="history-draft-panel"')
    expect(panel).toContain('historyDraftNodes')
    expect(panel).toContain('historyDraftSites')
    expect(panel).toContain('historyDraftPlaces')
    expect(panel).toContain('buildPlaceEntityIndex')
    expect(panel).toContain('buildPlaceRuntimePatch')
    expect(panel).toContain('data-test="place-entity-panel"')
    expect(panel).toContain('data-test="place-binding-panel"')
    expect(panel).toContain('id="atlas-tools-panel"')
    expect(panel).toContain("emit('open-worldbook')")
    expect(panel).toContain(':config="displayedVoronoiConfig"')
    expect(panel).toContain('pendingVoronoiConfig.value = config')
    expect(panel).toContain('buildWorldbookPlaceInventory')
    expect(panel).toContain('compileWorldbookMapConstraints')
    expect(panel).toContain("config.stylePreset = voronoiConfig.value?.stylePreset || 'topographic'")
    expect(panel).toContain('constraint-report')
    expect(panel).toContain('confirmPlaceBinding')
    expect(panel).toContain(':focus-marker-id="focusMarkerId"')
    expect(panel).toContain("marker?.bindingStatus !== 'confirmed'")
    expect(panel).toContain('gameStore.saveWorldMapState')
    expect(panel).toContain('gameStore.setHistoryNode')
    expect(panel).toContain('focusedPlaceEntity')
    expect(panel).toContain('focusedHistoryNode')
    expect(panel).toContain('focusedEntry')
    expect(panel).toContain("class=\"{ 'is-focused': entity.placeId === focusPlaceId }")

    const voronoi = readProjectFile('src/components/geography/WorldMapVoronoi.vue')
    expect(voronoi).toContain('commitOnSuccess: Boolean(options.commitOnSuccess)')
    expect(voronoi).toContain("emit('config-change', candidate.config)")
    expect(voronoi).toContain('新地图生成失败，当前地图未被替换')
    expect(voronoi).toContain("emit('map-replacement-ready'")
    expect(voronoi).toContain('acceptReplacement')
    expect(voronoi).toContain("requested === 'dark' && themeStore.colorScheme === 'light' ? 'topographic' : requested")
    expect(panel).toContain('data-test="map-replacement-review"')
    expect(panel).toContain('commitMapVersion')
    const geographyStore = readProjectFile('src/stores/geographyStore.js')
    expect(geographyStore).toContain('mapVersions = [next, ...this.mapVersions')
    expect(geographyStore).toContain('.slice(0, 5)')
    expect(geographyStore).toContain('restoreMapVersion(revisionId)')
  })

  it('keeps the same place context when crossing from the map to structured settings', () => {
    const page = readProjectFile('src/pages/StructuredSettings.vue')
    const workspace = readProjectFile('src/components/worldbook/StructuredSettingsWorkspace.vue')
    const review = readProjectFile('src/components/worldbook/RuntimeConflictReview.vue')

    expect(page).toContain('route.query.placeId')
    expect(page).toContain('data-test="settings-place-context"')
    expect(page).toContain('openFocusedPlaceMap')
    expect(page).toContain("name: 'settings-world-map'")
    expect(review).toContain('data-test="runtime-conflict-review"')
    expect(review).toContain('gameStore.resolveRuntimeConflict')
    expect(review).toContain('来源事件')
    expect(review).toContain('采用所选分支')
  })

  it('exposes per-history-node and per-entry map entrances from the focused place context', () => {
    const page = readProjectFile('src/pages/StructuredSettings.vue')

    expect(page).toContain('focusedPlace.historyNodes')
    expect(page).toContain('focusedPlace.entries')
    expect(page).toContain('query.historyNodeId = itemId')
    expect(page).toContain('query.entryId = itemId')
    expect(page).toContain('data-test="place-history-map-link"')
    expect(page).toContain('data-test="place-entry-map-link"')
  })

  it('OpeningPage applies the canonical history node before starting the adventure', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('gameStore.setHistoryNode(patches.historyNode)')
    expect(openingPage).toContain('gameStore.saveWorldMapState')
    expect(openingPage).toContain('gameStore.appendPlotJournal')
  })
})
