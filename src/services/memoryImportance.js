const BASE = Object.freeze({
  constraint: 0.90,
  'plot-event': 0.78,
  'character-state': 0.72,
  'project-fact': 0.68,
  'author-preference': 0.62,
  'style-sample': 0.45
})

const clamp = (value) => Math.max(0, Math.min(1, Math.round(value * 100) / 100))

export function deriveMemoryImportance({ kind, signals = {}, override = null } = {}) {
  if (override !== null && override !== undefined && Number.isFinite(Number(override))) {
    return clamp(Number(override))
  }
  let score = BASE[kind] ?? 0.5
  if (signals.explicitCommitment || signals.irreversibleChange) score += 0.10
  if (Number(signals.independentSourceCount) >= 2) score += 0.08
  if (signals.inferenceOnly) score -= 0.12
  return clamp(score)
}
