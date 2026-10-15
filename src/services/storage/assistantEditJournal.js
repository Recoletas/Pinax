import { getItem, setItem, removeItem } from '../../composables/useStorage.js'

const JOURNAL = 'pinax_assistant_edit_journal'
function restore(journal) {
  for (const item of journal.writes) {
    if (JSON.stringify(getItem(item.key, null)) === JSON.stringify(item.before ?? null)) continue
    if (item.before === undefined || item.before === null) removeItem(item.key)
    else if (!setItem(item.key, item.before)) throw new Error('修改恢复失败，请导出备份后重试。')
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
  const journal = { id, committed: false, writes: writes.map(item => ({ ...item, before: getItem(item.key, null) })) }
  if (!setItem(JOURNAL, journal)) throw new Error('修改恢复记录无法保存，尚未写入。')
  try {
    for (const item of writes) if (!setItem(item.key, item.after)) throw new Error('作品保存失败，修改建议已保留。')
    if (!setItem(JOURNAL, { ...journal, committed: true })) throw new Error('修改回执保存失败。')
    removeItem(JOURNAL)
  } catch (error) {
    restore(journal); removeItem(JOURNAL); throw error
  }
}
