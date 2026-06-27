import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorldbookExtraActions from '@/components/workbench/WorldbookExtraActions.vue'

describe('WorldbookExtraActions', () => {
  it('renders 2 buttons with exact labels', () => {
    const wrapper = mount(WorldbookExtraActions)
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('导入小说 / JSON')
    expect(buttons[1].text()).toBe('AI 生成')
  })

  it('emits import on first button', async () => {
    const wrapper = mount(WorldbookExtraActions)
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('import')).toBeTruthy()
  })

  it('emits ai on second button', async () => {
    const wrapper = mount(WorldbookExtraActions)
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('ai')).toBeTruthy()
  })

  it('renders hairline divider', () => {
    const wrapper = mount(WorldbookExtraActions)
    expect(wrapper.find('hr').exists()).toBe(true)
  })
})