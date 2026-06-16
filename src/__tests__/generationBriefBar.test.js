import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GenerationBriefBar from '../components/worldbook/GenerationBriefBar.vue'

describe('GenerationBriefBar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('渲染 textarea + label', () => {
    const wrapper = mount(GenerationBriefBar, {
      props: { modelValue: '', sectionKey: 'world' }
    })
    const ta = wrapper.find('textarea.brief-input')
    expect(ta.exists()).toBe(true)
    const label = wrapper.find('label.brief-label')
    expect(label.exists()).toBe(true)
    wrapper.unmount()
  })

  it('v-model — 输入触发 update:modelValue', async () => {
    const wrapper = mount(GenerationBriefBar, {
      props: { modelValue: '', sectionKey: 'world' }
    })
    const ta = wrapper.find('textarea.brief-input')
    await ta.setValue('短句，气氛冷硬')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['短句，气氛冷硬'])
    wrapper.unmount()
  })

  it('aria-label 反映 fieldKey 存在与否', () => {
    const w1 = mount(GenerationBriefBar, {
      props: { modelValue: '', sectionKey: 'world' }
    })
    expect(w1.find('textarea').attributes('aria-label')).toContain('分区「world」')

    const w2 = mount(GenerationBriefBar, {
      props: { modelValue: '', sectionKey: 'world', fieldKey: 'origin' }
    })
    expect(w2.find('textarea').attributes('aria-label')).toContain('字段「origin」')

    w1.unmount()
    w2.unmount()
  })

  it('label :for 关联 inputId（id 一致）', () => {
    const wrapper = mount(GenerationBriefBar, {
      props: { modelValue: '', sectionKey: 'world', fieldKey: 'origin' }
    })
    const label = wrapper.find('label.brief-label')
    const forId = label.attributes('for')
    const ta = wrapper.find('textarea.brief-input')
    expect(ta.attributes('id')).toBe(forId)
    wrapper.unmount()
  })
})
