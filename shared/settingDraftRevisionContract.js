import {
  STRUCTURED_GENERATION_ERROR_CODES,
  STRUCTURED_SETTING_LIMITS,
  getStructuredSettingField
} from './structuredSettingContract.js'

export const SETTING_DRAFT_REVISION_SCHEMA_VERSION = 1

function text(value, maxChars = Infinity) {
  return String(value ?? '').trim().slice(0, maxChars)
}

function invalid(code, message) {
  return { valid: false, error: { code, message } }
}

function normalizePreviousVersions(value) {
  if (!Array.isArray(value)) return text(value, STRUCTURED_SETTING_LIMITS.maxRevisionHistoryChars)
  const entries = value
    .filter((entry) => entry && typeof entry === 'object' && String(entry.content || '').trim())
    .slice(-4)
  const lines = []
  for (const [index, entry] of entries.entries()) {
    const content = String(entry.content || '').trim().slice(0, 1800)
    lines.push(`版本 ${index + 1}（历史参考）\n${content}`)
  }
  return text(lines.join('\n\n'), STRUCTURED_SETTING_LIMITS.maxRevisionHistoryChars)
}

export function hashSettingDraftContent(value) {
  let hash = 2166136261
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function validateSettingDraftRevisionInput(input = {}) {
  const sectionKey = text(input.sectionKey, 80)
  const fieldKey = text(input.fieldKey, 80)
  if (!getStructuredSettingField(sectionKey, fieldKey)) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '修订目标设定项不存在')
  }

  const draftContent = text(input.draftContent, STRUCTURED_SETTING_LIMITS.maxRevisionFactsChars)
  if (!draftContent) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '修订必须绑定当前草稿')
  }

  const revisionInstruction = text(input.revisionInstruction, STRUCTURED_SETTING_LIMITS.maxRevisionInstructionChars)
  if (!revisionInstruction) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '请先填写修改意见')
  }

  return {
    valid: true,
    input: {
      sectionKey,
      fieldKey,
      authoritativeContent: text(input.authoritativeContent, STRUCTURED_SETTING_LIMITS.maxRevisionFactsChars),
      draftContent,
      revisionInstruction,
      keepFacts: text(input.keepFacts, STRUCTURED_SETTING_LIMITS.maxRevisionFactsChars),
      rejectFacts: text(input.rejectFacts, STRUCTURED_SETTING_LIMITS.maxRevisionFactsChars),
      previousVersions: normalizePreviousVersions(input.previousVersions),
      sourceDraftHash: text(input.sourceDraftHash, 32) || hashSettingDraftContent(draftContent),
      worldbookRevision: text(input.worldbookRevision, 160)
    }
  }
}

export function buildSettingRevisionContext(input = {}) {
  const validation = validateSettingDraftRevisionInput(input)
  if (!validation.valid) return validation
  const value = validation.input
  return {
    valid: true,
    context: {
      authoritativeContent: value.authoritativeContent,
      draftContent: value.draftContent,
      revisionInstruction: value.revisionInstruction,
      keepFacts: value.keepFacts,
      rejectFacts: value.rejectFacts,
      previousVersions: value.previousVersions
    },
    sourceDraftHash: value.sourceDraftHash,
    worldbookRevision: value.worldbookRevision
  }
}
