/**
 * 叙事生成意图契约（experience-narrative-continuity-plan C1）。
 *
 * 统一 4 种 intent，替代含混的 init/continue/auto-advance 字符串：
 *   open     新会话开场
 *   respond  玩家提交可见行动
 *   extend   继续上一回复（不新增 user turn）
 *   advance  半自动推进（无新玩家行动）
 */

export const NARRATIVE_INTENTS = Object.freeze(['open', 'respond', 'extend', 'advance'])

const LEGACY_MODE_MAP = {
  init: 'open',
  'auto-advance': 'advance',
  continue: 'respond',
  '': 'respond',
}

/**
 * 把旧 narrativeMode 字符串归一化为 intent。
 */
export function normalizeNarrativeIntent(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (NARRATIVE_INTENTS.includes(raw)) return raw
  return LEGACY_MODE_MAP[raw] || 'respond'
}

/**
 * intent → orchestrator mode（保持向下兼容）。
 */
export function intentToOrchestratorMode(intent) {
  const i = normalizeNarrativeIntent(intent)
  if (i === 'open') return 'init'
  if (i === 'advance') return 'auto'
  return 'continue'
}

/**
 * intent → 建议输出长度区间（中文字符）。
 * 基础区间为"标准"展开度，可按叙事展开度（compact/standard/expanded）缩放。
 */
const INTENT_BASE_RANGES = Object.freeze({
  open: { min: 1200, max: 1800 },
  respond: { min: 900, max: 1500 },
  advance: { min: 800, max: 1400 },
  extend: { min: 500, max: 900 }
})

const EXPANSION_FACTORS = Object.freeze({
  compact: 0.65,
  standard: 1,
  expanded: 1.35
})

export function narrativeExpansionFactor(expansion) {
  const key = String(expansion || '').toLowerCase()
  return EXPANSION_FACTORS[key] ?? 1
}

export function intentCharRange(intent, { expansion = 'standard' } = {}) {
  const i = normalizeNarrativeIntent(intent)
  const base = INTENT_BASE_RANGES[i] || INTENT_BASE_RANGES.respond
  const factor = narrativeExpansionFactor(expansion)
  return { min: Math.round(base.min * factor), max: Math.round(base.max * factor) }
}
