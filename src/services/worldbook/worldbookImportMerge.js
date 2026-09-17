// NA07：同名世界书条目级合并。复用既有 SillyTavern 导入归一（voice/place/type
// 猜测全部一致），把导入产物按"名称+类型"身份并入目标库：
//   - 目标没有同身份条目 → 新增（保留导入生成的 entry id）
//   - 同身份且内容一致 → 跳过
//   - 同身份但内容/触发词不同 → 更新目标条目的内容字段，保留目标 id、
//     创建时间与结构化引用（mapBinding/structuredSettingRef 不被导入覆盖）
// 合并经一次 durable updateWorldbook 落盘；导入用的临时世界书随后删除，
// active 指针恢复到目标库。

function entryIdentity(entry) {
  const name = String(entry?.name || '').trim().toLowerCase()
  const type = String(entry?.type || 'general')
  return `${name}|${type}`
}

function contentSignature(entry) {
  return JSON.stringify([
    String(entry?.content || ''),
    (entry?.keys || []).map(key => String(key).toLowerCase()),
    (entry?.keysSecondary || []).map(key => String(key).toLowerCase())
  ])
}

export async function mergeWorldbookJsonImport({ worldStore, targetId, rawData } = {}) {
  const target = String(targetId || '').trim()
  if (!target) return { ok: false, reason: 'target-worldbook-id-required' }
  const existingTarget = await worldStore.loadWorldbookForProject(target)
  if (!existingTarget) return { ok: false, reason: 'target-worldbook-missing' }

  // 通过既有导入链获得完全一致的条目归一结果（临时世界书）。
  const temp = await worldStore.importFromSillyTavern(rawData)
  if (!temp?.id) return { ok: false, reason: 'import-parse-failed' }
  try {
    const incoming = Array.isArray(temp.entries) ? temp.entries : []
    const targetEntries = Array.isArray(existingTarget.entries) ? existingTarget.entries : []
    const byIdentity = new Map()
    for (const entry of targetEntries) {
      const identity = entryIdentity(entry)
      if (!byIdentity.has(identity)) byIdentity.set(identity, entry)
    }
    let added = 0
    let updated = 0
    let skipped = 0
    const merged = targetEntries.map(entry => ({ ...entry }))
    const mergedById = new Map(merged.map(entry => [String(entry.id), entry]))
    const addedEntries = []
    for (const candidate of incoming) {
      const identity = entryIdentity(candidate)
      const targetEntry = byIdentity.get(identity)
      if (!targetEntry) {
        addedEntries.push(candidate)
        added += 1
        continue
      }
      if (contentSignature(targetEntry) === contentSignature(candidate)) {
        skipped += 1
        continue
      }
      const live = mergedById.get(String(targetEntry.id))
      if (live) {
        live.content = candidate.content
        live.keys = candidate.keys
        live.keysSecondary = candidate.keysSecondary
        live.injection = candidate.injection
        live.metadata = { ...(live.metadata || {}), updatedAt: Date.now(), importMergedFrom: temp.id }
        updated += 1
      }
    }
    const nextEntries = [...merged, ...addedEntries]
    const groups = Array.isArray(existingTarget.groups) ? existingTarget.groups.slice() : []
    for (const group of Array.isArray(temp.groups) ? temp.groups : []) {
      if (!groups.some(existing => String(existing?.id || existing?.name || '') === String(group?.id || group?.name || ''))) {
        groups.push(group)
      }
    }
    // 导入条目自带的来源文档引用并入目标库（合同字段按 AC-SOURCE-v1 对齐）。
    const targetSources = Array.isArray(existingTarget.sourceDocuments) ? existingTarget.sourceDocuments.slice() : []
    const seenSourceIds = new Set(targetSources.map(source => String(source.id)))
    for (const source of Array.isArray(temp.sourceDocuments) ? temp.sourceDocuments : []) {
      const reference = { ...source, sourceId: source.sourceId || source.id }
      if (!reference.id || seenSourceIds.has(reference.id)) continue
      reference.scope = { kind: 'worldbook', bookId: null, worldbookId: target }
      targetSources.push(reference)
      seenSourceIds.add(reference.id)
    }

    const updatedTarget = await worldStore.updateWorldbook(target, {
      entries: nextEntries,
      groups,
      sourceDocuments: targetSources
    })
    if (!updatedTarget?.id) return { ok: false, reason: 'merge-persist-failed' }
    return { ok: true, targetId: target, added, updated, skipped, total: incoming.length }
  } finally {
    // 临时世界书无论合并成败都清理，active 恢复到目标库。
    try { await worldStore.deleteWorldbook(temp.id) } catch { /* 清理尽力而为 */ }
    try { await worldStore.setActiveWorldbook(target) } catch { /* 恢复尽力而为 */ }
  }
}
