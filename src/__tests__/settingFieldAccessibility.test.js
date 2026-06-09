import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import { nextTick } from 'vue'
import FieldTextarea from '../components/worldbook/fields/FieldTextarea.vue'
import FieldCharacterChips from '../components/worldbook/fields/FieldCharacterChips.vue'
import FieldRuleList from '../components/worldbook/fields/FieldRuleList.vue'
import FieldStyleTags from '../components/worldbook/fields/FieldStyleTags.vue'
import FieldForbiddenList from '../components/worldbook/fields/FieldForbiddenList.vue'
import SettingFieldCard from '../components/worldbook/SettingFieldCard.vue'

const SECTION = { key: 'characters', label: '角色设定' }

const FIELDS = [
  { key: 'protagonists', label: '主角', entryType: 'character', defaultGroup: '角色' },
  { key: 'writingStyle', label: '写作风格', entryType: 'style', defaultGroup: '文风约束' },
  { key: 'rules', label: '世界规则', entryType: 'rule', defaultGroup: '硬约束' },
  { key: 'taboos', label: '禁忌', entryType: 'forbidden', defaultGroup: '禁写边界' },
  { key: 'origin', label: '世界起源', entryType: 'lore', defaultGroup: '世界观' }
]

describe('Setting Field a11y', () => {
  it('FieldTextarea — axe 零 violation', async () => {
    const wrapper = mount(FieldTextarea, {
      props: { modelValue: 'hello', inputId: 'ta-ax', ariaLabel: '世界起源' },
      attachTo: document.body
    })
    await nextTick()
    const results = await axe(wrapper.element)
    expect(results).toHaveNoViolations()
    wrapper.unmount()
  })

  it('FieldCharacterChips — axe 零 violation', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: { modelValue: '林昭\n雾岛', inputId: 'c-ax', ariaLabel: '主角' },
      attachTo: document.body
    })
    await nextTick()
    const results = await axe(wrapper.element)
    expect(results).toHaveNoViolations()
    wrapper.unmount()
  })

  it('FieldStyleTags — axe 零 violation', async () => {
    const wrapper = mount(FieldStyleTags, {
      props: { modelValue: '硬朗，克制', inputId: 't-ax', ariaLabel: '写作风格' },
      attachTo: document.body
    })
    await nextTick()
    const results = await axe(wrapper.element)
    expect(results).toHaveNoViolations()
    wrapper.unmount()
  })

  it('FieldRuleList — axe 零 violation', async () => {
    const wrapper = mount(FieldRuleList, {
      props: { modelValue: 'rule1\nrule2', inputId: 'r-ax', ariaLabel: '世界规则' },
      attachTo: document.body
    })
    await nextTick()
    const results = await axe(wrapper.element)
    expect(results).toHaveNoViolations()
    wrapper.unmount()
  })

  it('FieldForbiddenList — axe 零 violation', async () => {
    const wrapper = mount(FieldForbiddenList, {
      props: { modelValue: '不写血腥', inputId: 'f-ax', ariaLabel: '禁忌' },
      attachTo: document.body
    })
    await nextTick()
    const results = await axe(wrapper.element)
    expect(results).toHaveNoViolations()
    wrapper.unmount()
  })

  it('SettingFieldCard (dispatcher) — 4 controlType axe 零 violation', async () => {
    for (const field of FIELDS) {
      const wrapper = mount(SettingFieldCard, {
        props: {
          worldbookId: 'wb-ax',
          section: SECTION,
          field,
          modelValue: 'sample content'
        },
        attachTo: document.body
      })
      await nextTick()
      const results = await axe(wrapper.element)
      expect(results).toHaveNoViolations()
      wrapper.unmount()
    }
  })

  it('label :for 关联 inputId — tab 顺序正确', () => {
    const wrapper = mount(SettingFieldCard, {
      props: {
        worldbookId: 'wb-ax',
        section: { key: 'world', label: '世界观' },
        field: { key: 'origin', label: '世界起源', entryType: 'lore', defaultGroup: '世界观' },
        modelValue: 'hello'
      }
    })
    const label = wrapper.find('label.field-label')
    const inputId = label.attributes('for')
    expect(inputId).toBeTruthy()
    const input = wrapper.find(`#${inputId}`)
    expect(input.exists()).toBe(true)
  })
})
