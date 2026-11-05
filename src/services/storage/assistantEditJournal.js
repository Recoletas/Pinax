import { getItem, setItem, removeItem } from '../../composables/useStorage.js'
import { sha256HexOfText } from './backupHash.js'

const JOURNAL = 'pinax_assistant_edit_journal'
const encode = value => JSON.stringify(value)
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const hash = value => sha256HexOfText(encode(canonical(value)))
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const object = value => value !== null && typeof value === 'object'

// Store only the inverse patch, never whole before+after copies of every book.
// Hash both states so crash recovery cannot overwrite a third party's edit.
function inverse(before, after, path = [], patches = []) {
  if (encode(before) === encode(after)) return patches
  if (!object(before) || !object(after) || Array.isArray(before) !== Array.isArray(after)) {
    patches.push({ path, value: before }); return patches
  }
  if (Array.isArray(before)) {
    for (let i = 0; i < Math.min(before.length, after.length); i++) inverse(before[i], after[i], [...path, i], patches)
    if (before.length !== after.length) patches.push({ path, length: before.length, tail: before.slice(after.length) })
    return patches
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!own(before, key)) patches.push({ path: [...path, key], remove: true })
    else if (!own(after, key)) patches.push({ path: [...path, key], value: before[key] })
    else inverse(before[key], after[key], [...path, key], patches)
  }
  return patches
}
function undo(value, patches) {
  let result = value
  for (const patch of patches) {
    if (!patch.path.length && !own(patch, 'length')) { result = patch.value; continue }
    let parent = result
    for (const key of patch.path.slice(0, -1)) {
      if (!object(parent) || !own(parent, key)) throw new Error('恢复路径已变化，未覆盖当前数据。')
      parent = parent[key]
    }
    const key = patch.path.at(-1)
    if (own(patch, 'length')) {
      const array = patch.path.length ? parent[key] : result
      if (!Array.isArray(array)) throw new Error('恢复记录无效，未覆盖当前数据。')
      if (array.length < patch.length) array.push(...patch.tail)
      array.length = patch.length
    } else if (patch.remove) delete parent[key]
    else Object.defineProperty(parent, key, { value: patch.value, enumerable: true, writable: true, configurable: true })
  }
  return result
}
function restore(journal) {
  // Preflight every key before touching any: a conflict must retain the journal.
  const rollback = journal.writes.map(item => {
    const current = getItem(item.key, null)
    if (journal.version !== 2) return { key: item.key, value: item.before ?? null }
    const currentHash = hash(current)
    if (currentHash === item.beforeHash) return null
    if (currentHash !== item.afterHash) throw new Error('数据已被其他窗口修改，恢复记录已保留，请先导出备份。')
    const value = undo(current, item.patches)
    if (hash(value) !== item.beforeHash) throw new Error('修改恢复记录校验失败，未覆盖当前数据。')
    return { key: item.key, value }
  }).filter(Boolean)
  for (const item of rollback) {
    if (item.value === null) removeItem(item.key)
    else if (!setItem(item.key, item.value)) throw new Error('修改恢复失败，请导出备份后重试。')
  }
}
export function recoverAssistantEdits() {
  const journal = getItem(JOURNAL, null)
  if (!journal) return
  if (!journal.committed) restore(journal)
  removeItem(JOURNAL)
}
export function persistAssistantEdits(writes, id) {
  recoverAssistantEdits()
  if (new Set(writes.map(item => item.key)).size !== writes.length) throw new Error('修改事务包含重复目标。')
  const changed = writes.filter(item => encode(getItem(item.key, null)) !== encode(item.after))
  if (!changed.length) return
  const journal = { version: 2, id, committed: false, writes: changed.map(item => {
    const before = getItem(item.key, null)
    return { key: item.key, beforeHash: hash(before), afterHash: hash(item.after), patches: inverse(before, item.after) }
  }) }
  if (!setItem(JOURNAL, journal)) throw new Error('本地存储空间不足，修改恢复记录无法保存；建议仍保留，请先导出备份并释放空间后重试。')
  try {
    for (const item of changed) if (!setItem(item.key, item.after)) throw new Error('本地存储空间不足，作品保存失败，修改建议已保留。')
    for (const item of changed) {
      if (encode(getItem(item.key, null)) !== encode(item.after)) throw new Error('保存结果未能确认，修改建议仍保留。')
    }
    if (!setItem(JOURNAL, { ...journal, committed: true })) throw new Error('修改回执保存失败。')
    removeItem(JOURNAL)
  } catch (error) {
    restore(journal); removeItem(JOURNAL); throw error
  }
}
