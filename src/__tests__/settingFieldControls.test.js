import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FieldTextarea from '../components/worldbook/fields/FieldTextarea.vue'
import FieldCharacterChips from '../components/worldbook/fields/FieldCharacterChips.vue'
import FieldRuleList from '../components/worldbook/fields/FieldRuleList.vue'
import FieldStyleTags from '../components/worldbook/fields/FieldStyleTags.vue'
import FieldForbiddenList from '../components/worldbook/fields/FieldForbiddenList.vue'

const CHIPS_DELIMS = ['\n', ',', '，', ';', '；', '、']
const TAGS_DELIMS = ['，', ',', '、', ' ', '\n']
const LIST_DELIMS = ['\n']

describe('FieldTextarea', () => {
  it('双向绑定 String（v-model round-trip）', async () => {
    const wrapper = mount(FieldTextarea, {
      props: { modelValue: 'hello', inputId: 'ta1', rows: 3 }
    })
    const ta = wrapper.find('textarea')
    expect(ta.element.value).toBe('hello')

    await ta.setValue('world')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['world'])
  })

  it('rows/placeholder/maxLength 透传', () => {
    const wrapper = mount(FieldTextarea, {
      props: {
        modelValue: '',
        inputId: 'ta2',
        rows: 8,
        placeholder: 'P',
        maxLength: 100
      }
    })
    const ta = wrapper.find('textarea')
    expect(ta.attributes('rows')).toBe('8')
    expect(ta.attributes('placeholder')).toBe('P')
    expect(ta.attributes('maxlength')).toBe('100')
  })

  it('a11y 属性（aria-required/aria-invalid）默认 false', () => {
    const wrapper = mount(FieldTextarea, {
      props: { modelValue: '', inputId: 'ta3' }
    })
    const ta = wrapper.find('textarea')
    expect(ta.attributes('aria-required')).toBe('false')
    expect(ta.attributes('aria-invalid')).toBe('false')
  })
})

describe('FieldCharacterChips (chips / firstSeen)', () => {
  it('初始 String → token Array，渲染 chip', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: {
        modelValue: '林昭\n雾岛真守',
        inputId: 'c1',
        delimiter: CHIPS_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const chips = wrapper.findAll('.chip')
    expect(chips.length).toBe(2)
    expect(chips[0].text()).toContain('林昭')
    expect(chips[1].text()).toContain('雾岛真守')
  })

  it('输入 + Enter 提交 token + emit 序列化 String', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: { modelValue: '', inputId: 'c2', delimiter: CHIPS_DELIMS, parseMode: 'firstSeen' }
    })
    const input = wrapper.find('input.chip-pending')
    await input.setValue('林昭')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['林昭'])
  })

  it('输入分隔符 "," 立即切分（firstSeen 模式）', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: { modelValue: '', inputId: 'c3', delimiter: CHIPS_DELIMS, parseMode: 'firstSeen' }
    })
    const input = wrapper.find('input.chip-pending')
    await input.setValue('林昭,雾岛')
    // 多个事件可能触发：分隔符触发 + setValue 后
    const emissions = wrapper.emitted('update:modelValue')
    expect(emissions).toBeTruthy()
    const last = emissions[emissions.length - 1][0]
    expect(last.split('\n')).toEqual(['林昭', '雾岛'])
  })

  it('Backspace 在空输入时移除最后一个 token', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: {
        modelValue: '林昭\n雾岛',
        inputId: 'c4',
        delimiter: CHIPS_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const input = wrapper.find('input.chip-pending')
    await input.trigger('keydown', { key: 'Backspace' })
    const emissions = wrapper.emitted('update:modelValue')
    expect(emissions).toBeTruthy()
    expect(emissions[emissions.length - 1][0]).toBe('林昭')
  })

  it('× 按钮移除 token', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: {
        modelValue: '林昭\n雾岛',
        inputId: 'c5',
        delimiter: CHIPS_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const removes = wrapper.findAll('.chip-remove')
    await removes[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['雾岛'])
  })

  it('firstSeen 保护中文标点 token — "a (主角)\nb, 勇敢的" → 3 个', async () => {
    const wrapper = mount(FieldCharacterChips, {
      props: {
        modelValue: 'a (主角)\nb, 勇敢的\nc——反派',
        inputId: 'c6',
        delimiter: CHIPS_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const chips = wrapper.findAll('.chip')
    expect(chips.length).toBe(3)
    expect(chips[0].text()).toContain('a (主角)')
    expect(chips[1].text()).toContain('b, 勇敢的')
    expect(chips[2].text()).toContain('c——反派')
  })
})

describe('FieldStyleTags (tags / multiDelimiter)', () => {
  it('multiDelimiter — "硬朗，克制，第三人称" → 3 token', async () => {
    const wrapper = mount(FieldStyleTags, {
      props: {
        modelValue: '硬朗，克制，第三人称',
        inputId: 't1',
        delimiter: TAGS_DELIMS,
        parseMode: 'multiDelimiter'
      }
    })
    await nextTick()
    const tags = wrapper.findAll('.tag')
    expect(tags.length).toBe(3)
    expect(tags[0].text()).toContain('硬朗')
    expect(tags[2].text()).toContain('第三人称')
  })

  it('multiDelimiter — 空格 / 逗号 / 顿号混合', async () => {
    const wrapper = mount(FieldStyleTags, {
      props: {
        modelValue: '硬朗,克制 第三人称',
        inputId: 't2',
        delimiter: TAGS_DELIMS,
        parseMode: 'multiDelimiter'
      }
    })
    await nextTick()
    const tags = wrapper.findAll('.tag')
    expect(tags.length).toBe(3)
  })
})

describe('FieldRuleList (list / firstSeen)', () => {
  it('list — "rule1\nrule2\nrule3" → 3 个有序项', async () => {
    const wrapper = mount(FieldRuleList, {
      props: {
        modelValue: 'rule1\nrule2\nrule3',
        inputId: 'r1',
        delimiter: LIST_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const items = wrapper.findAll('.rule-item')
    expect(items.length).toBe(3)
    expect(items[0].text()).toContain('1.')
    expect(items[2].text()).toContain('3.')
  })

  it('空输入 + Enter 提交新规则', async () => {
    const wrapper = mount(FieldRuleList, {
      props: { modelValue: '', inputId: 'r2', delimiter: LIST_DELIMS, parseMode: 'firstSeen' }
    })
    const input = wrapper.find('input.rule-pending')
    await input.setValue('no murder')
    await input.trigger('keydown', { key: 'Enter' })
    const emissions = wrapper.emitted('update:modelValue')
    expect(emissions[emissions.length - 1][0]).toBe('no murder')
  })
})

describe('FieldForbiddenList (list / firstSeen + red theme)', () => {
  it('list — 渲染 + × 按钮', async () => {
    const wrapper = mount(FieldForbiddenList, {
      props: {
        modelValue: '不写血腥\n不写政治',
        inputId: 'f1',
        delimiter: LIST_DELIMS,
        parseMode: 'firstSeen'
      }
    })
    await nextTick()
    const items = wrapper.findAll('.forbidden-item')
    expect(items.length).toBe(2)
    const removes = wrapper.findAll('.forbidden-remove')
    expect(removes.length).toBe(2)
  })

  it('root class 应用 forbidden 容器样式（红色边框）', () => {
    const wrapper = mount(FieldForbiddenList, {
      props: { modelValue: '', inputId: 'f2' }
    })
    const list = wrapper.find('.forbidden-list')
    expect(list.exists()).toBe(true)
  })
})
