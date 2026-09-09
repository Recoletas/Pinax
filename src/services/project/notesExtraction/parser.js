/**
 * notes-extraction/parser.js — 速记多对象提炼候选 parser (round-4 K47).
 * Parses a model output JSON into structured extraction candidates.
 * The model returns candidate name/type/excerpt locator/suggested existing ref.
 * The parser validates each candidate: non-empty name, type in allowlist,
 * excerpt is a substring of the source text, suggested ref format valid.
 * It does NOT create worldStore entries or make authorization decisions.
 */

const CANDIDATE_TYPES = Object.freeze(['character', 'location', 'item'])
const REF_PREFIXES = Object.freeze(['worldbook-entry:', 'exploration:'])

export function parseExtractionCandidates(rawOutput, { sourceText, sourceHash, sourceRevision, requestId } = {}) {
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    return { ok: false, candidates: [], errors: [{ code: 'empty-output' }] }
  }
  let parsed
  try {
    parsed = JSON.parse(rawOutput.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim())
  } catch {
    return { ok: false, candidates: [], errors: [{ code: 'json-parse-failed' }] }
  }
  const rawList = Array.isArray(parsed?.candidates) ? parsed.candidates : []
  if (rawList.length === 0) {
    return { ok: false, candidates: [], errors: [{ code: 'no-candidates' }] }
  }
  if (typeof sourceText !== 'string' || !sourceText) {
    return { ok: false, candidates: [], errors: [{ code: 'source-text-required' }] }
  }
  const candidates = []
  const errors = []
  const seenNames = new Set()
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') { errors.push({ code: 'invalid-item' }); continue }
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const type = typeof raw.type === 'string' ? raw.type.trim() : ''
    const excerpt = typeof raw.excerpt === 'string' ? raw.excerpt.trim() : ''
    const suggestedRef = typeof raw.suggestedRef === 'string' ? raw.suggestedRef.trim() : ''

    if (!name) { errors.push({ code: 'name-empty' }); continue }
    if (name.length >= sourceText.length) { errors.push({ code: 'name-is-full-text' }); continue }
    if (!CANDIDATE_TYPES.includes(type)) { errors.push({ code: 'type-unsupported', type }); continue }
    if (!excerpt || !sourceText.includes(excerpt)) { errors.push({ code: 'excerpt-not-in-source' }); continue }
    if (suggestedRef && !REF_PREFIXES.some((prefix) => suggestedRef.startsWith(prefix))) {
      errors.push({ code: 'ref-format-invalid', ref: suggestedRef }); continue
    }
    if (seenNames.has(name)) { errors.push({ code: 'duplicate-name', name }); continue }
    seenNames.add(name)

    candidates.push({
      name, type,
      excerpt,
      excerptStart: sourceText.indexOf(excerpt),
      suggestedRef: suggestedRef || null,
      sourceHash: sourceHash ?? null,
      sourceRevision: sourceRevision ?? null,
      requestId: requestId ?? null
    })
  }
  return { ok: candidates.length > 0, candidates, errors }
}
