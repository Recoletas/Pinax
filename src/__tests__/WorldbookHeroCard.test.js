import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorldbookHeroCard from '@/components/workbench/WorldbookHeroCard.vue'

const testPreset = {
  id: 'border-kingdom',
  name: '边境小镇',
  genreLabel: '奇幻冒险',
  openingHook: '雾潮将至，王室与行会争夺港口账簿，临时调查者必须在黎明前给出答案。',
  entries: [
    { type: 'location', name: '暮湾钟楼' },
    { type: 'organization', name: '王室' },
    { type: 'organization', name: '行会' }
  ]
}

describe('WorldbookHeroCard', () => {
  it('renders preset name, genre, hook, briefing 3 chips', () => {
    const wrapper = mount(WorldbookHeroCard, { props: { preset: testPreset } })
    expect(wrapper.text()).toContain('边境小镇')
    expect(wrapper.text()).toContain('奇幻冒险')
    expect(wrapper.text()).toContain('雾潮将至')
    // briefing derived from preset entries (organization faction names)
    expect(wrapper.text()).toContain('黎明前')
    expect(wrapper.text()).toContain('王室')
    expect(wrapper.text()).toContain('行会')
  })

  it('emits enter when main CTA clicked', async () => {
    const wrapper = mount(WorldbookHeroCard, { props: { preset: testPreset } })
    await wrapper.find('[data-test="hero-cta"]').trigger('click')
    expect(wrapper.emitted('enter')).toBeTruthy()
    expect(wrapper.emitted('enter')[0][0]).toEqual(testPreset)
  })

  it('renders 罗马 I decoration', () => {
    const wrapper = mount(WorldbookHeroCard, { props: { preset: testPreset } })
    const roman = wrapper.find('.worldbook-hero__roman')
    expect(roman.exists()).toBe(true)
  })

  it('renders C·01 stamp decoration', () => {
    const wrapper = mount(WorldbookHeroCard, { props: { preset: testPreset } })
    const stamp = wrapper.find('.worldbook-hero__stamp')
    expect(stamp.exists()).toBe(true)
  })
})