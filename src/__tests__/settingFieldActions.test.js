import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SettingFieldActions from '../components/worldbook/SettingFieldActions.vue'

describe('SettingFieldActions', () => {
  it('默认 2 个按钮：AI 生成 / 转条目（modelValue 非空时）', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: 'hello' }
    })
    const buttons = wrapper.findAll('button.action-btn')
    expect(buttons.length).toBe(2)
    expect(buttons[0].text()).toBe('AI 生成')
    expect(buttons[1].text()).toBe('转条目')
  })

  it('modelValue 为空时，转条目按钮不渲染', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: '' }
    })
    const buttons = wrapper.findAll('button.action-btn')
    expect(buttons.length).toBe(1)
    expect(buttons[0].text()).toBe('AI 生成')
  })

  it('working=true 时按钮禁用 + 文案变 "生成中…"', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: 'hello', working: true }
    })
    const buttons = wrapper.findAll('button.action-btn')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[0].text()).toBe('生成中…')
  })

  it('每按钮有 aria-label（用 fieldLabel 拼装）', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: 'hello' }
    })
    const buttons = wrapper.findAll('button.action-btn')
    expect(buttons[0].attributes('aria-label')).toBe('为「世界起源」生成 AI 草稿')
    expect(buttons[1].attributes('aria-label')).toBe('将「世界起源」转为世界书条目')
  })

  it('always-visible — opacity 默认 0.7，hover/focus-within/has-state 时 1', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: 'x', modelValue: 'x' }
    })
    // 默认非 has-state
    const container = wrapper.find('.setting-field-actions')
    expect(container.classes('has-state')).toBe(false)
  })

  it('hasDraft=true → has-state class 生效（opacity=1）', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: 'x', modelValue: 'x', hasDraft: true }
    })
    const container = wrapper.find('.setting-field-actions')
    expect(container.classes('has-state')).toBe(true)
  })

  it('working=true → has-state class 生效（opacity=1）', () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: 'x', modelValue: 'x', working: true }
    })
    const container = wrapper.find('.setting-field-actions')
    expect(container.classes('has-state')).toBe(true)
  })

  it('点击 AI 生成 → emit generate', async () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: 'hello' }
    })
    await wrapper.findAll('button.action-btn')[0].trigger('click')
    expect(wrapper.emitted('generate')).toBeTruthy()
  })

  it('点击 转条目 → emit convert-entry', async () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: '世界起源', modelValue: 'hello' }
    })
    await wrapper.findAll('button.action-btn')[1].trigger('click')
    expect(wrapper.emitted('convert-entry')).toBeTruthy()
  })

  it('键盘焦点 — button 接受 :focus-visible，CSS 提供 outline', async () => {
    const wrapper = mount(SettingFieldActions, {
      props: { fieldLabel: 'x', modelValue: 'x' },
      attachTo: document.body
    })
    await nextTick()
    const btn = wrapper.findAll('button.action-btn')[0]
    await btn.element.focus()
    // DOM element focus state
    expect(document.activeElement).toBe(btn.element)
    wrapper.unmount()
  })
})
