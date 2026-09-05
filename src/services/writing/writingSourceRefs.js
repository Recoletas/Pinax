// 统一 typed sourceRef（文本工作台 v3 Phase 1）：
// 写作链内所有"世界书条目"引用使用唯一形态 `worldbook-entry:<entryId>`；
// 整本世界书级引用使用 `worldbook:<worldbookId>`。禁止条目级再写 `worldbook:<entryId>`。
// 解析与构造只经这里，避免双命名漂移。

export const WORLDBOOK_ENTRY_REF_PREFIX = 'worldbook-entry:'
export const WORLDBOOK_REF_PREFIX = 'worldbook:'

export function worldbookEntryRef(entryId) {
  const id = String(entryId ?? '').trim()
  return id ? `${WORLDBOOK_ENTRY_REF_PREFIX}${id}` : ''
}

export function isWorldbookEntryRef(ref) {
  return String(ref ?? '').startsWith(WORLDBOOK_ENTRY_REF_PREFIX)
}

// 兼容解析：历史数据里存在 `worldbook:<entryId>` 的条目级误用；
// 整本级引用（worldbook:<worldbookId>）不属于条目，返回 null 由调用方 fail-closed。
export function parseWorldbookEntryRef(ref) {
  const raw = String(ref ?? '').trim()
  if (raw.startsWith(WORLDBOOK_ENTRY_REF_PREFIX)) {
    const id = raw.slice(WORLDBOOK_ENTRY_REF_PREFIX.length).trim()
    return id ? { kind: 'worldbook-entry', entryId: id } : null
  }
  return null
}

// 迁移助手：把旧条目级 `worldbook:<entryId>` 归一为新形态；
// 无法判定是否条目级时保守原样返回（整本级引用不动）。
export function normalizeLegacyEntryRef(ref, knownEntryIds = null) {
  const raw = String(ref ?? '').trim()
  if (isWorldbookEntryRef(raw)) return raw
  if (raw.startsWith(WORLDBOOK_REF_PREFIX) && !raw.startsWith(WORLDBOOK_ENTRY_REF_PREFIX)) {
    // 无已知条目清单时无法区分条目级/整本级：保守原样返回（fail-closed）。
    if (!Array.isArray(knownEntryIds)) return raw
    const id = raw.slice(WORLDBOOK_REF_PREFIX.length).split(':')[0].trim()
    if (id && knownEntryIds.map(String).includes(id)) {
      return worldbookEntryRef(id)
    }
  }
  return raw
}
