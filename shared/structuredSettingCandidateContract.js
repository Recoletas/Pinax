/**
 * 来源事实候选的本地归一与同名审阅合同。
 *
 * 候选之间可能是重复、补充或冲突事实。这里仅按类型、名称和别名分组，
 * 不合并正文，避免在用户确认前丢掉来源差异。
 */

const MAX_CANDIDATES = 24
const MAX_ALIASES = 8

function text(value) {
  return String(value ?? '').trim()
}

function uniqueStrings(values, limit = Infinity) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter(Boolean))]
    .slice(0, limit)
}

function normalizeName(value) {
  return text(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\u3000·•・,，、。.!！?？:：;；'"“”‘’（）()【】[\]{}<>《》]/g, '')
}

function candidateNames(candidate) {
  return uniqueStrings([candidate?.name, ...(candidate?.aliases || [])])
    .map(normalizeName)
    .filter(Boolean)
}

export function normalizeSettingCandidate(candidate, { validSourceIds = null } = {}) {
  if (!candidate || typeof candidate !== 'object') return null
  const type = text(candidate.type)
  const name = text(candidate.name).slice(0, 120)
  const content = text(candidate.content).slice(0, 900)
  const evidence = text(candidate.evidence).slice(0, 600)
  const sourceIds = uniqueStrings(candidate.sourceIds, 8)
  const aliases = uniqueStrings(candidate.aliases, MAX_ALIASES)
    .filter((alias) => normalizeName(alias) !== normalizeName(name))
  if (!type || !name || !content || !evidence || !sourceIds.length) return null

  const allowed = validSourceIds instanceof Set
    ? sourceIds.filter((sourceId) => validSourceIds.has(sourceId))
    : sourceIds
  if (!allowed.length) return null

  return { type, name, aliases, content, evidence, sourceIds: allowed }
}

export function normalizeSettingCandidates(candidates = [], options = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => normalizeSettingCandidate(candidate, options))
    .filter(Boolean)
}

export function groupSettingCandidates(candidates = []) {
  const normalized = normalizeSettingCandidates(candidates)
  const groups = []

  for (const candidate of normalized) {
    const names = new Set(candidateNames(candidate))
    const matching = groups.filter((group) => (
      group.type === candidate.type
      && [...group.names].some((name) => names.has(name))
    ))
    if (!matching.length) {
      groups.push({
        id: `${candidate.type}:${normalizeName(candidate.name)}`,
        type: candidate.type,
        displayName: candidate.name,
        names,
        variants: [candidate],
        sourceIds: [...candidate.sourceIds],
        conflict: false
      })
      continue
    }

    const primary = matching[0]
    primary.variants.push(candidate)
    primary.names = new Set([...primary.names, ...names])
    primary.sourceIds = [...new Set([...primary.sourceIds, ...candidate.sourceIds])]
    primary.conflict = primary.conflict || matching.some((group) => group.variants.some((item) => (
      item.type !== candidate.type || item.content !== candidate.content
    )))

    // An alias can bridge two groups. Join only review metadata; keep every
    // original variant intact so the user can compare and decide.
    for (const secondary of matching.slice(1)) {
      primary.variants.push(...secondary.variants)
      primary.names = new Set([...primary.names, ...secondary.names])
      primary.sourceIds = [...new Set([...primary.sourceIds, ...secondary.sourceIds])]
      primary.conflict = true
      const index = groups.indexOf(secondary)
      if (index >= 0) groups.splice(index, 1)
    }
  }

  return groups.map((group) => ({
    id: group.id,
    type: group.type,
    displayName: group.displayName,
    variants: group.variants,
    sourceIds: group.sourceIds,
    possibleDuplicate: group.variants.length > 1,
    conflict: group.conflict || group.variants.length > 1
  }))
}

export const STRUCTURED_SETTING_CANDIDATE_LIMITS = Object.freeze({
  maxCandidates: MAX_CANDIDATES,
  maxAliases: MAX_ALIASES
})
