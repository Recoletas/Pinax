// Shared creation/management vocabulary; identities and storage stay with worldStore.
export const SETTING_TYPES = Object.freeze([
  { value: 'character', label: '人物' }, { value: 'location', label: '地点' },
  { value: 'organization', label: '组织' }, { value: 'event', label: '事件' },
  { value: 'rule', label: '世界规则' }, { value: 'item', label: '物品' },
  { value: 'lore', label: '背景设定' }, { value: 'style', label: '文风' },
  { value: 'general', label: '其他设定' }
])
export const settingCategoryLabel = value => ({ 人物: '人物', 地理: '地点', 势力: '组织', 编年: '事件', 设定: '世界设定', 资料: '来源资料' })[value] || value || '全部设定'
export const settingTypeForCategory = value => ({ 人物: 'character', 地理: 'location', 势力: 'organization', 编年: 'event' })[value] || 'general'
export function settingAliases(value) {
  return [...new Set(String(value || '').split(/[\n,，、]/).map(item => item.trim()).filter(Boolean))]
}
export function settingDeletionImpact(entries, id) {
  return entries.filter(entry => entry.id !== id && (
    (entry.links || []).some(link => String(typeof link === 'string' ? link : link?.to || link?.target || link?.id) === String(id)) ||
    Object.values(entry.relations || {}).some(rows => Array.isArray(rows) && rows.some(row => String(typeof row === 'string' ? row : row?.to || row?.target || row?.id) === String(id)))
  ))
}
