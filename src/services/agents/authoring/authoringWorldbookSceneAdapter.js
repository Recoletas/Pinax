// 绑定世界书 → 有界现场摘要（worldbook scene closure Task 5）。
// 纯函数：从一本显式绑定的世界书构建角色/地点/关系索引；
// 投影只取有界的摘要与来源，不把整本世界书内容塞进上下文。

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildWorldbookSceneIndex(worldbook) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  return {
    charactersById: new Map(entries.filter((e) => e?.type === 'character').map((e) => [String(e.id), e])),
    locationsById: new Map(entries.filter((e) => e?.type === 'location').map((e) => [String(e.id), e])),
    entries
  }
}

// 角色摘要：name + 有界 goal/mood/voice 基础 + 来源；绝不带完整条目正文。
export function resolveSceneCharacter(index, id) {
  const entryId = String(id ?? '').trim()
  if (!entryId || !index) return null
  const entry = index.charactersById.get(entryId)
  if (!entry) return null
  return {
    id: entryId,
    name: String(entry.name || entry.keys?.[0] || ''),
    goal: String(entry.goal || '').slice(0, 120),
    mood: String(entry.mood || '').slice(0, 80),
    voiceBasis: String(entry.voice || entry.speechStyle || '').slice(0, 120),
    sourceRefs: [`worldbook-entry:${entryId}`]
  }
}

export function resolveSceneLocation(index, id) {
  const entryId = String(id ?? '').trim()
  if (!entryId || !index) return null
  const entry = index.locationsById.get(entryId)
  if (!entry) return null
  return {
    id: entryId,
    name: String(entry.name || entry.keys?.[0] || ''),
    sourceRefs: [`worldbook-entry:${entryId}`]
  }
}

// 关系选择：只保留至少一端在场的边，返回稳定的 subject/object ID。
// 正式候选来源：
// - relation/relationship 条目（relations.characters 携带两个 ID）；
// - 已采纳的项目关系观察（稳定端点 ID）。
// 角色条目里单纯罗列另一角色只构成“有关联”，不发明情感标签。
export function selectActiveRelations({ index, presentCharacterIds, acceptedRelations, limit = 6 }) {
  const present = new Set(asArray(presentCharacterIds).map((id) => String(id)))
  const results = []

  for (const relation of asArray(acceptedRelations)) {
    if (results.length >= limit) break
    const subjectId = String(relation?.subjectId || '').trim()
    const objectId = String(relation?.objectId || '').trim()
    if (!subjectId || !objectId) continue
    if (!present.has(subjectId) && !present.has(objectId)) continue
    results.push({
      id: String(relation.id || `${subjectId}-${relation.relation || 'related'}-${objectId}`),
      subjectId,
      objectId,
      label: String(relation.label || relation.relation || '有关联'),
      sourceRefs: asArray(relation.sourceRefs).map(String).filter(Boolean)
    })
  }

  for (const entry of asArray(index?.entries)) {
    if (results.length >= limit) break
    const type = String(entry?.type || '')
    if (type !== 'relation' && type !== 'relationship') continue
    const endpointIds = asArray(entry?.relations?.characters).map((id) => String(id))
    if (endpointIds.length < 2) continue
    const [subjectId, objectId] = endpointIds
    if (!present.has(subjectId) && !present.has(objectId)) continue
    if (results.some((existing) => existing.subjectId === subjectId && existing.objectId === objectId)) continue
    results.push({
      id: String(entry.id),
      subjectId,
      objectId,
      label: String(entry.name || entry.content || '').replace(/\s+/g, ' ').slice(0, 80) || '有关联',
      sourceRefs: [`worldbook-entry:${String(entry.id)}`]
    })
  }

  // 角色条目互相罗列 → “有关联”关联边（无情感标签）。
  for (const entry of asArray(index?.entries)) {
    if (results.length >= limit) break
    if (entry?.type !== 'character') continue
    const subjectId = String(entry.id)
    for (const otherId of asArray(entry?.relations?.characters)) {
      if (results.length >= limit) break
      const objectId = String(otherId)
      if (objectId === subjectId) continue
      if (!present.has(subjectId) && !present.has(objectId)) continue
      if (results.some((existing) => (
        (existing.subjectId === subjectId && existing.objectId === objectId)
        || (existing.subjectId === objectId && existing.objectId === subjectId)
      ))) continue
      if (!index.charactersById.has(objectId)) continue
      results.push({
        id: `${subjectId}-associated-${objectId}`,
        subjectId,
        objectId,
        label: '有关联',
        sourceRefs: [`worldbook-entry:${subjectId}`]
      })
    }
  }

  return results
}

// 现场调整候选（Task 10）：默认推荐有界；查询搜索完整绑定世界书目录；
// 空结果由调用方呈现“打开世界书 / 关联世界书”，绝不伪造实体。
export function buildSceneCurationCandidates({ axis, worldbook, query = '', selectedIds = [], limit = 8 } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase()
  const expectedType = axis === 'character' ? 'character' : 'location'
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id)))
  return (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .filter((entry) => entry?.type === expectedType)
    .filter((entry) => !normalizedQuery || [entry.name, ...(Array.isArray(entry.keys) ? entry.keys : [])]
      .join(' ').toLocaleLowerCase().includes(normalizedQuery))
    .map((entry) => ({
      id: String(entry.id),
      name: String(entry.name || (Array.isArray(entry.keys) ? entry.keys[0] : '') || ''),
      selected: selected.has(String(entry.id)),
      summary: String(entry.content || '').replace(/\s+/g, ' ').slice(0, 120)
    }))
    .sort((left, right) => Number(right.selected) - Number(left.selected))
    .slice(0, normalizedQuery ? 24 : limit)
}
