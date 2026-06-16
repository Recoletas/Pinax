import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GmPersonaLauncher from '../components/gm-persona/GmPersonaLauncher.vue'

describe('GmPersonaLauncher', () => {
  it('reveals the persona bubble on first click and emits open from the bubble action', async () => {
    const wrapper = mount(GmPersonaLauncher, {
      props: {
        kicker: '在场 GM',
        title: '从这里继续推进',
        body: '先看现场，再给你一个更紧的切口。'
      }
    })

    expect(wrapper.text()).not.toContain('从这里继续推进')

    await wrapper.find('.gm-persona-launcher').trigger('click')
    expect(wrapper.text()).toContain('从这里继续推进')
    expect(wrapper.attributes('aria-expanded')).toBeUndefined()

    await wrapper.find('.gm-persona-primary').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('从这里继续推进')
  })

  it('opens directly on second launcher click once expanded', async () => {
    const wrapper = mount(GmPersonaLauncher)

    await wrapper.find('.gm-persona-launcher').trigger('click')
    await wrapper.find('.gm-persona-launcher').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })
})
