/**
 * P1.5 Task D：地点显隐纯函数策略。
 *
 * 输入 MapDocument v2 + MapContextSignal + 模式 + 视口状态，
 * 输出"哪些 feature 可见、为什么可见"。不碰 OL 对象、不做样式，便于合同测试。
 *
 * 模式（计划 §P1.5）：
 * - writing（默认）：当前场 + 当前单元 + 章节锚点（≤8）+ 地理基准；
 *   candidate/stale/conflict 常驻为 0；
 * - explore：按类别主动开启全部作者地点（dense 层在这里才出现）；
 * - review：仅 stale/conflict/candidate 审阅队列。
 */

export const MAP_MODES = ['writing', 'explore', 'review']

// 缩放档位双阈值（hysteresis）：进入易、退出难，避免连续缩放标签整屏闪现。
// 默认值按 1600 宽地图全幅 fit≈1.2 标定；实际使用应传入 fit 分辨率标定的阈值。
export const TIER_THRESHOLDS = {
  region: { enter: 2.0, exit: 2.6 },
  local: { enter: 0.6, exit: 0.9 },
}

/** 按全幅 fit 分辨率标定档位阈值：fit=世界档，fit/2=区域档，fit/5=地方档。 */
export function thresholdsForFit(fitResolution) {
  return {
    region: { enter: fitResolution / 1.8, exit: fitResolution / 1.35 },
    local: { enter: fitResolution / 5, exit: fitResolution / 3.2 },
  }
}

/**
 * 纯函数档位机：给定上一档位与当前分辨率，返回当前档位。
 * @param {'world'|'region'|'local'} previousTier
 * @param {number} resolution
 * @param {{region:{enter,exit},local:{enter,exit}}} [thresholds]
 */
export function resolveTier(previousTier, resolution, thresholds = TIER_THRESHOLDS) {
  if (previousTier === 'world') {
    if (resolution <= thresholds.region.enter) {
      return resolution <= thresholds.local.enter ? 'local' : 'region'
    }
    return 'world'
  }
  if (previousTier === 'region') {
    if (resolution <= thresholds.local.enter) return 'local'
    if (resolution > thresholds.region.exit) return 'world'
    return 'region'
  }
  // local
  if (resolution > thresholds.local.exit) {
    return resolution > thresholds.region.exit ? 'world' : 'region'
  }
  return 'local'
}

const KIND_RANK = { capital: 50, city: 40, town: 30, village: 10, landmark: 35, site: 25, interior: 20 }
const CONTEXT_RANK = {
  selected: 100,
  'current-scene': 90,
  'current-unit': 70,
  'search-result': 80,
  'chapter-reference': 40,
}
const REVIEW_STATUSES = new Set(['candidate', 'stale', 'conflict'])

/** 每个可见 feature 的来源与渲染分数。 */
export function rankFeature(feature, contextSignal, mode) {
  const p = feature.properties
  let rank = KIND_RANK[p.kind] ?? 5
  if (p.bindingStatus === 'confirmed') rank += 10
  if (contextSignal) rank += CONTEXT_RANK[contextSignal.reason] ?? 0
  return rank
}

/**
 * 主入口：选出当前模式/档位下应显示的 feature 集合。
 * @returns {{
 *   tier: 'world'|'region'|'local',
 *   visible: Array<{ feature: object, source: 'geo'|'context'|'explore'|'review', rank: number, contextReason?: string }>,
 *   hiddenCounts: { reviewQueue: number }
 * }}
 */
export function selectVisibleMapFeatures({
  document,
  contextSignals = [],
  mode = 'writing',
  resolution,
  previousTier = 'world',
  exploreCategories = null,
  searchFeatureId = null,
  thresholds,
}) {
  const tier = resolveTier(previousTier, resolution, thresholds)
  const signalByFeature = new Map(contextSignals.map((s) => [s.featureId, s]))
  const visible = []
  const hiddenCounts = { reviewQueue: 0 }

  const allFeatures = [
    ...document.featureCollections.regions,
    ...document.featureCollections.rivers,
    ...document.featureCollections.routes,
    ...document.featureCollections.settlements,
    ...document.featureCollections.narrativePlaces,
  ]

  for (const feature of allFeatures) {
    const p = feature.properties
    const signal = signalByFeature.get(feature.mapObjectId) ?? null
    const isReviewItem = REVIEW_STATUSES.has(p.bindingStatus ?? '')

    // 审阅模式：只看审阅队列
    if (mode === 'review') {
      if (isReviewItem || p.featureType === 'region') {
        visible.push({ feature, source: 'review', rank: rankFeature(feature, signal, mode), contextReason: signal?.reason })
      } else if (p.featureType === 'river' || p.featureType === 'route') {
        visible.push({ feature, source: 'geo', rank: rankFeature(feature, null, mode) })
      }
      continue
    }

    // 探索模式：地理底 + 用户开启的类别全量
    if (mode === 'explore') {
      const categoryOn = !exploreCategories || exploreCategories.has(p.featureType)
      const authorOn = p.featureType === 'narrative-place' && categoryOn
      const settlementOn = p.featureType === 'settlement' && categoryOn
      if (p.featureType === 'region' || p.featureType === 'river' || p.featureType === 'route') {
        visible.push({ feature, source: 'geo', rank: rankFeature(feature, null, mode) })
      } else if (authorOn || settlementOn || signal) {
        visible.push({ feature, source: signal ? 'context' : 'explore', rank: rankFeature(feature, signal, mode), contextReason: signal?.reason })
      } else {
        if (isReviewItem) hiddenCounts.reviewQueue++
      }
      continue
    }

    // 写作模式（默认）
    // 1) 地理基准层：区域、河流、道路常驻（标签由 label plan 预算）
    if (p.featureType === 'region' || p.featureType === 'river' || p.featureType === 'route') {
      visible.push({ feature, source: 'geo', rank: rankFeature(feature, null, mode) })
      continue
    }
    // 2) candidate/stale/conflict 常驻为 0（硬门槛）；搜索可临时提升
    if (isReviewItem) {
      if (searchFeatureId === feature.mapObjectId) {
        visible.push({ feature, source: 'explore', rank: rankFeature(feature, { featureId: feature.mapObjectId, reason: 'search-result' }, mode), contextReason: 'search-result' })
      } else {
        hiddenCounts.reviewQueue++
      }
      continue
    }
    // 3) 上下文层：当前场/当前单元/章节锚点（外部已保证 ≤8）
    if (signal) {
      visible.push({ feature, source: 'context', rank: rankFeature(feature, signal, mode), contextReason: signal.reason })
      continue
    }
    // 4) 地理聚落：world 档只有 capital/city；region 档加 town；local 档全部 icon 化后仍可见
    if (p.featureType === 'settlement') {
      const kind = p.kind ?? 'village'
      if (tier === 'world' && (kind === 'capital' || kind === 'city')) {
        visible.push({ feature, source: 'geo', rank: rankFeature(feature, null, mode) })
      } else if (tier !== 'world') {
        visible.push({ feature, source: 'geo', rank: rankFeature(feature, null, mode) })
      } else {
        hiddenCounts.reviewQueue++
      }
      continue
    }
    // 5) 未中选的普通作者地点：写作模式不常驻（探索模式才全量）
    hiddenCounts.reviewQueue++
  }

  return { tier, visible, hiddenCounts }
}
