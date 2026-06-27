import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorldbookPresetGrid from '@/components/workbench/WorldbookPresetGrid.vue'

const presets = [
  { id: '1', name: '边境小镇', genreLabel: '奇幻冒险', entries: [{}, {}, {}] },
  { id: '2', name: '废墟灯塔', genreLabel: '末日生存', entries: [{}, {}] },
  { id: '3', name: '暮湾', genreLabel: '蒸汽朋克', entries: [{}] }
]

describe('WorldbookPresetGrid', () => {
  it('renders up to 5 cards', () => {
    const wrapper = mount(WorldbookPresetGrid, { props: { presets } })
    expect(wrapper.findAll('.preset-card')).toHaveLength(3)
  })

  it('caps at 5 cards even if 7 provided', () => {
    const seven = [...Array(7)].map((_, i) => ({ id: String(i), name: `W${i}`, genreLabel: 'X', entries: [] }))
    const wrapper = mount(WorldbookPresetGrid, { props: { presets: seven } })
    expect(wrapper.findAll('.preset-card')).toHaveLength(5)
  })

  it('emits select with preset when card clicked', async () => {
    const wrapper = mount(WorldbookPresetGrid, { props: { presets } })
    await wrapper.findAll('.preset-card')[0].trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0]).toEqual(presets[0])
  })
})