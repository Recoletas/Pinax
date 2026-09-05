/**
 * P0 基线测量：固定 fixtures 的生成耗时、内存与输出规模。
 * 运行：node_modules/.bin/vite-node scripts/map-p0-baseline.mjs
 * 输出：/tmp/map-p0-baseline.json + stdout 摘要（结论抄录进
 * docs/engineering/map-p0-baseline.md 后删除 /tmp 产物，计划 §9.6）。
 */

import { writeFileSync } from 'node:fs'
import { generateMap } from '../src/services/world-map/engine/index.ts'
import { MAP_FIXTURES } from '../src/services/world-map/testing/fixtures.ts'
import { projectLegacyToMapDocumentV2 } from '../src/services/world-map/model/mapMigration.ts'
import { validateMapDocumentV2 } from '../src/services/world-map/model/mapDocumentV2.ts'

function heapUsedMB() {
  return Math.round((process.memoryUsage().heapUsed / 1048576) * 10) / 10
}

const results = []
for (const fixture of Object.values(MAP_FIXTURES)) {
  const before = heapUsedMB()
  const t0 = performance.now()
  const data = generateMap({ ...fixture.config })
  const genMs = Math.round(performance.now() - t0)
  const peakNote = heapUsedMB()
  // 同 seed 二次生成：验证确定性（同序生成输出一致）。
  const t1 = performance.now()
  const data2 = generateMap({ ...fixture.config })
  const gen2Ms = Math.round(performance.now() - t1)
  const deterministic = data.seed === data2.seed
    && data.cells.length === data2.cells.length
    && data.burgs.length === data2.burgs.length
    && data.rivers.length === data2.rivers.length
    && data.coastlines.length === data2.coastlines.length

  // 投影为 v2，统计 feature 规模并验证合同。
  const projected = projectLegacyToMapDocumentV2(data, {
    mapAssetId: `baseline-${fixture.id}`,
    projectId: 'baseline-project',
    worldbookId: 'baseline-worldbook',
    revision: 1,
    generatorVersion: 'p0-baseline',
    legacyMarkers: [],
  })
  const featureCount = Object.values(projected.document.featureCollections)
    .reduce((sum, list) => sum + list.length, 0)

  results.push({
    fixture: fixture.id,
    cells: data.cells.length,
    burgs: data.burgs.length,
    rivers: data.rivers.length,
    roads: data.roads.length,
    coastlines: data.coastlines.length,
    states: data.states.length,
    generationMs: genMs,
    regenerationMs: gen2Ms,
    deterministic,
    heapBeforeMB: before,
    heapAfterMB: peakNote,
    v2FeatureCount: featureCount,
    v2ValidationOk: validateMapDocumentV2(projected.document).ok,
  })
}

console.table(results.map(({ v2ValidationOk, ...rest }) => ({ ...rest, v2ValidationOk })))
writeFileSync('/tmp/map-p0-baseline.json', JSON.stringify(results, null, 2))
console.log('written: /tmp/map-p0-baseline.json')
