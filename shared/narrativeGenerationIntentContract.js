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
 */
export function intentCharRange(intent) {
  const i = normalizeNarrativeIntent(intent)
  if (i === 'respond') return { min: 450, max: 1000 }
  if (i === 'extend') return { min: 250, max: 700 }
  if (i === 'advance') return { min: 350, max: 800 }
  return { min: 600, max: 1200 } // open
}
