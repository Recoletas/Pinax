import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import StructuredSettingsPanel from '../components/worldbook/StructuredSettingsPanel.vue'
import { useWorldStore } from '../stores/worldStore'

function makeWorldbook(overrides = {}) {
  return {
    id: 'wb-1',
    name: 'Test WB',
    structuredSettings: {
      world: { origin: 'initial origin', powerSystem: '' },
      story: { logline: '', concept: '' },
      characters: { protagonists: '', majorSupporting: '', npcs: '', relationshipSummary: '' },
      creativeRules: { writingStyle: '', perspective: '', tone: '', taboos: '', consistency: '', references: '' }
    },
    ...overrides
  }
}

function stubWorldStore() {
  const worldStore = useWorldStore()
  // mock store action 以避免访问 localStorage / 抛错
  vi.spyOn(worldStore, 'updateStructuredSetting').mockImplementation(async (id, sec, fk, val) => {
    return undefined
  })
  return worldStore
}

describe('StructuredSettingsPanel — 同步时机', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('dirty 期间，外部 store 变化不覆盖 form 输入', async () => {
    stubWorldStore()
    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, {
      props: { worldbook }
    })
    await nextTick()

    // 模拟用户输入：走 Card v-model 链路（textarea.setValue → onUserInput → markDirty）
    const originField = wrapper.find('textarea#setting-field-world-origin')
    expect(originField.exists()).toBe(true)
    await originField.setValue('user typing...')
    await nextTick()

    // 模拟外部 store 同步（其他来源写入 worldbook.structuredSettings.origin）
    worldbook.structuredSettings.world.origin = 'external write'
    await nextTick()
    await flushPromises()

    // dirty 状态：用户的输入应保留
    expect(wrapper.vm.form.world.origin).toBe('user typing...')

    wrapper.unmount()
  })

  it('worldbook.id 切换时，form 整体重读（无视 dirty）', async () => {
    const wb1 = reactive(makeWorldbook({ id: 'wb-1' }))
    const wb2 = reactive(makeWorldbook({ id: 'wb-2', structuredSettings: { ...wb1.structuredSettings, world: { origin: 'wb2 origin', powerSystem: '' }, story: { logline: '', concept: '' }, characters: { protagonists: '', majorSupporting: '', npcs: '', relationshipSummary: '' }, creativeRules: { writingStyle: '', perspective: '', tone: '', taboos: '', consistency: '', references: '' } } }))
    const wrapper = mount(StructuredSettingsPanel, {
      props: { worldbook: wb1 }
    })
    await nextTick()

    // 用户在 wb1 中输入
    wrapper.vm.form.world.origin = 'wb1 user input'
    await nextTick()

    // 切换到 wb2
    await wrapper.setProps({ worldbook: wb2 })
    await nextTick()

    // form 应被 wb2 的初始值覆盖
    expect(wrapper.vm.form.world.origin).toBe('wb2 origin')

    wrapper.unmount()
  })

  it('commit 成功后，外部 store sync 可正常覆盖 form（已 pristine）', async () => {
    stubWorldStore()
    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, {
      props: { worldbook }
    })
    await nextTick()

    // 模拟用户通过 Field 触发 input（v-model 链路）
    const originField = wrapper.find('textarea#setting-field-world-origin')
    expect(originField.exists()).toBe(true)
    await originField.setValue('user edit')
    await nextTick()

    // 直接给 store / worldbook 写值（模拟 debounce 后的 commit + 外部来源）
    // 真实路径：debounce 触发 → store.updateStructuredSetting → worldbook.structuredSettings 变
    // 这里直接模拟"store 已写入"的状态
    worldbook.structuredSettings.world.origin = 'user edit'

    // 等待 debounce + microtask
    await vi.dynamicImportSettled()
    await flushPromises()
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()

    // commit 成功后 2s 回 pristine
    await new Promise(r => setTimeout(r, 2100))
    await flushPromises()

    // 现在模拟外部 sync（activeWorldbook 在别处被修改）
    worldbook.structuredSettings.world.origin = 'external write after commit'
    await nextTick()
    await flushPromises()

    // form 应被 sync 覆盖
    expect(wrapper.vm.form.world.origin).toBe('external write after commit')

    wrapper.unmount()
  })

  it('字段级 undo / redo 会真实回写 form 并重新保存', async () => {
    vi.useFakeTimers()
    const worldStore = stubWorldStore()
    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, {
      props: { worldbook },
      attachTo: document.body
    })
    await nextTick()

    const originField = wrapper.find('textarea#setting-field-world-origin')
    expect(originField.exists()).toBe(true)
    await originField.setValue('first edit')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(wrapper.vm.form.world.origin).toBe('first edit')
    expect(worldStore.updateStructuredSetting).toHaveBeenLastCalledWith('wb-1', 'world', 'origin', 'first edit')

    originField.element.focus()
    wrapper.vm.undoCurrentField()
    await nextTick()
    expect(wrapper.vm.form.world.origin).toBe('initial origin')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(worldStore.updateStructuredSetting).toHaveBeenLastCalledWith('wb-1', 'world', 'origin', 'initial origin')

    wrapper.vm.redoCurrentField()
    await nextTick()
    expect(wrapper.vm.form.world.origin).toBe('first edit')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(worldStore.updateStructuredSetting).toHaveBeenLastCalledWith('wb-1', 'world', 'origin', 'first edit')

    wrapper.unmount()
    vi.useRealTimers()
  })
})
