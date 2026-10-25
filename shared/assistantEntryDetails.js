export const entryDetailsSchema = {
  type: 'object', additionalProperties: false, properties: {
    aliases: { type: 'array', items: { type: 'string' } },
    attributes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] } },
    relations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { to: { type: 'string' }, type: { type: 'string' }, stance: { type: 'string' }, covert: { type: 'boolean' }, weight: { type: 'number' }, src: { type: 'string' } }, required: ['to', 'type'] } },
    sourceRefs: { type: 'array', items: { type: 'string' } }
  }
}

export function normalizeEntryDetails(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !Object.hasOwn(entryDetailsSchema.properties, key))) throw new Error('设定属性格式无效。')
  const result = JSON.parse(JSON.stringify(input))
  for (const key of ['aliases', 'sourceRefs']) if (key in result && (!Array.isArray(result[key]) || result[key].some(value => typeof value !== 'string' || !value.trim()))) throw new Error('别名和来源应为文本列表。')
  if ('attributes' in result && (!Array.isArray(result.attributes) || result.attributes.some(pair => !pair || typeof pair.key !== 'string' || !pair.key.trim() || ['__proto__', 'constructor', 'prototype'].includes(pair.key) || typeof pair.value !== 'string') || new Set(result.attributes.map(pair => pair.key)).size !== result.attributes.length)) throw new Error('属性需要不重复的名称与文本值。')
  if ('relations' in result && (!Array.isArray(result.relations) || result.relations.some(row => !row || Object.keys(row).some(key => !['to', 'type', 'stance', 'covert', 'weight', 'src'].includes(key)) || typeof row.to !== 'string' || !row.to || typeof row.type !== 'string' || !row.type || ('covert' in row && typeof row.covert !== 'boolean') || ('weight' in row && !Number.isFinite(row.weight)) || ['stance', 'src'].some(key => key in row && typeof row[key] !== 'string')))) throw new Error('关系需要目标 ID、关系类型及有效属性。')
  return result
}

export function entryDetailsSnapshot(entry) {
  return JSON.stringify(Object.fromEntries(['aliases', 'profile', 'relations', 'links', 'sourceRefs'].filter(key => Object.hasOwn(entry || {}, key)).map(key => [key, entry[key]])))
}

export function applyEntryDetails(entry, details) {
  if (!details) return
  const patch = normalizeEntryDetails(details)
  for (const key of ['aliases', 'sourceRefs']) if (key in patch) entry[key] = [...new Set([...(entry[key] || []), ...patch[key]])]
  if (patch.attributes) entry.profile = { ...(entry.profile || {}), template: entry.profile?.template || 'free', values: { ...(entry.profile?.values || {}), ...Object.fromEntries(patch.attributes.map(pair => [pair.key, pair.value])) } }
  if (patch.relations) {
    // Rich legacy relations cannot safely be collapsed into new lightweight edges.
    if (entry.relations && !Array.isArray(entry.relations)) throw new Error('请先在设定页整理旧格式关系，再修改关系。')
    const rows = (entry.relations || []).map(row => ({ ...row }))
    for (const row of patch.relations) {
      const existing = rows.find(item => item.to === row.to && item.type === row.type)
      if (existing) Object.assign(existing, row); else rows.push({ ...row })
    }
    entry.relations = rows
    entry.links = [...new Set([...(entry.links || []), ...rows.map(row => row.to)])]
  }
}

export function entryDetailsText(entry) {
  if (!entry) return ''
  return [entry.aliases?.length ? `别名：${entry.aliases.join('、')}` : '',
    ...Object.entries(entry.profile?.values || {}).map(([key, value]) => `${key}：${value}`),
    ...(Array.isArray(entry.relations) ? entry.relations : []).map(row => `关系：${row.to} · ${row.type}${row.stance ? ` · ${row.stance}` : ''}${row.covert ? ' · 隐秘' : ''}${row.src ? `（${row.src}）` : ''}`),
    entry.sourceRefs?.length ? `来源：${entry.sourceRefs.join('、')}` : ''].filter(Boolean).join('\n')
}
