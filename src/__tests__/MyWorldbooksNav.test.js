import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MyWorldbooksNav from '@/components/workbench/MyWorldbooksNav.vue'

const worldbooksIndex = [
  { id: 'wb-1', name: '边境小镇', entryCount: 12 },
  { id: 'wb-2', name: '灯塔档案', entryCount: 8 }
]
const activeWorldbook = { id: 'wb-1', name: '边境小镇' }

describe('MyWorldbooksNav', () => {
  it('renders label + select + 3 buttons', () => {
    const wrapper = mount(MyWorldbooksNav, { props: { worldbooksIndex, activeWorldbook } })
    expect(wrapper.text()).toContain('我的世界书')
    expect(wrapper.find('select').exists()).toBe(true)
    expect(wrapper.findAll('button')).toHaveLength(3)
  })

  it('emits change when select changes', async () => {
    const wrapper = mount(MyWorldbooksNav, { props: { worldbooksIndex, activeWorldbook } })
    await wrapper.find('select').setValue('wb-2')
    expect(wrapper.emitted('change')).toBeTruthy()
    expect(wrapper.emitted('change')[0][0]).toBe('wb-2')
  })

  it('emits advanced "new" when 新建 + button clicked', async () => {
    const wrapper = mount(MyWorldbooksNav, { props: { worldbooksIndex, activeWorldbook } })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('advanced')).toBeTruthy()
    expect(wrapper.emitted('advanced')[0][0]).toBe('new')
  })

  it('emits advanced "manage" when 管理 → button clicked', async () => {
    const wrapper = mount(MyWorldbooksNav, { props: { worldbooksIndex, activeWorldbook } })
    await wrapper.findAll('button')[2].trigger('click')
    expect(wrapper.emitted('advanced')).toBeTruthy()
    expect(wrapper.emitted('advanced')[0][0]).toBe('manage')
  })
})