import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldStore } from '@/stores/worldStore'
import { STORAGE_KEYS } from '@/composables/useStorage'

// A1 回归测试：syncStructuredEntries 不得静默覆盖用户编辑。
// 见 docs/agent-runs/audit-pass2-plan.md Phase A1。
//
// 通过 store 的公开 API（createWorldbook / updateEntry / loadWorldbook）验证，
// 不直接调内部 syncStructuredEntries，以避免测试耦合实现细节。

// ---- 极简 localStorage mock（worldStore 直接用 getItem/setItem 读写）----
function makeStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _raw: store
  }
}

function setupActiveWorldbookWithStructuredEntry(store) {
  // 建一本空世界书，然后写一条 structured 设定内容，触发 sync 生成默认 entry。
  return store.createWorldbook({ name: 'A1 测试世界书' }).then((wb) => {
    return store.updateWorldbook(wb.id, {
      // structuredSettings 形如 { [sectionKey]: { [fieldKey]: '内容' } }
      // 取一个真实存在的 section/field：先探测 SETTING_SECTIONS 的第一项。
      structuredSettings: buildMinimalStructuredSettings()
    }).then(() => wb.id)
  })
}

import { SETTING_SECTIONS } from '@/services/settingPanelSchema'

function buildMinimalStructuredSettings() {
  // 选第一个 section 的第一个 field，填入确定内容。
  const section = SETTING_SECTIONS[0]
  const field = section.fields[0]
  return { [section.key]: { [field.key]: '默认填充内容' } }
}

function findStructuredEntry(worldbook) {
  return worldbook.entries.find(
    (e) => e.metadata?.importSource === 'structured-setting'
  )
}

function firstField() {
  const section = SETTING_SECTIONS[0]
  return { section, field: section.fields[0] }
}

describe('A1 — syncStructuredEntries 不覆盖用户编辑', () => {
  let pinia
  let storage

  beforeEach(() => {
    storage = makeStorage()
    globalThis.localStorage = storage
    globalThis.sessionStorage = makeStorage()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('case 1: 用户编辑过 entry.name 后 reload → name 保留、keys 仍更新', async () => {
    const store = useWorldStore()
    const wbId = await setupActiveWorldbookWithStructuredEntry(store)

    // 用户把 name 改成自定义值
    const entry = findStructuredEntry(store.activeWorldbook)
    expect(entry).toBeTruthy()
    await store.updateEntry(wbId, entry.id, { name: '我的自定义名称' })

    // reload：重新从 storage 读 → 走 normalizeWorldbook → syncStructuredEntries
    store.activeWorldbook = null
    const reloaded = await store.loadWorldbook(wbId)
    const reloadedEntry = findStructuredEntry(reloaded)

    expect(reloadedEntry.name).toBe('我的自定义名称') // 用户编辑保留
    expect(reloadedEntry.metadata.userTouched).toBe(true)
  })

  it('case 2: 用户编辑过 entry.injection 后 reload → injection 保留', async () => {
    const store = useWorldStore()
    const wbId = await setupActiveWorldbookWithStructuredEntry(store)

    const entry = findStructuredEntry(store.activeWorldbook)
    // 用户改 injection 的一个字段（默认是 selective / probability 100）
    await store.updateEntry(wbId, entry.id, {
      injection: { ...entry.injection, probability: 50, mode: 'selective' }
    })

    store.activeWorldbook = null
    const reloaded = await store.loadWorldbook(wbId)
    const reloadedEntry = findStructuredEntry(reloaded)

    expect(reloadedEntry.injection.probability).toBe(50) // 用户编辑保留
    expect(reloadedEntry.metadata.userTouched).toBe(true)
  })

  it('case 3: 用户没编辑过的 entry reload → name/type/injection 按现行行为填充（不变）', async () => {
    const store = useWorldStore()
    const wbId = await setupActiveWorldbookWithStructuredEntry(store)
    const { field } = firstField()

    const before = findStructuredEntry(store.activeWorldbook)
    // 不做任何 updateEntry，直接 reload
    store.activeWorldbook = null
    const reloaded = await store.loadWorldbook(wbId)
    const after = findStructuredEntry(reloaded)

    // 仍为默认填充形态：name = field.label
    expect(after.name).toBe(field.label)
    expect(after.metadata.userTouched).toBe(false)
    // injection 仍是默认值（probability 100）
    expect(after.injection.probability).toBe(100)
    // 内容仍是 structuredSettings 里的值
    expect(after.content).toBe(before.content)
  })

  it('case 4: updateEntry 修改 entry 后 userTouched 字段被置 true', async () => {
    const store = useWorldStore()
    const wbId = await setupActiveWorldbookWithStructuredEntry(store)

    const entry = findStructuredEntry(store.activeWorldbook)
    expect(entry.metadata.userTouched).toBeFalsy() // 初始为默认形态

    // 模拟用户在 PlaceCatalog 改 name
    await store.updateEntry(wbId, entry.id, { name: '编辑后的名称' })

    const updated = store.activeWorldbook.entries.find((e) => e.id === entry.id)
    expect(updated.metadata.userTouched).toBe(true)
    expect(updated.name).toBe('编辑后的名称')
  })
})
