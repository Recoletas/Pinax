import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GamePanel from '../components/GamePanel.vue'
import { useGameStore } from '../stores/gameStore'

describe('GamePanel mechanism triggers', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('reopens the mechanism panel when a rendered trigger is clicked', async () => {
    const gameStore = useGameStore()
    const mechanismTrigger = {
      type: 'dialogue',
      match: '“所有人立刻撤离。”',
      dialogue: '所有人立刻撤离。',
      speaker: '林霁舰长'
    }
    gameStore.messages = [
      {
        role: 'assistant',
        content: '林霁舰长沉声说：“所有人立刻撤离。”',
        timestamp: 1,
        mechanismTrigger
      }
    ]

    const wrapper = mount(GamePanel)
    await nextTick()

    const trigger = wrapper.find('.mechanism-trigger')
    expect(trigger.exists()).toBe(true)

    await trigger.trigger('click')

    expect(gameStore.activeMechanism).toBe('dialogue')
    expect(gameStore.mechanismContext).toEqual(mechanismTrigger)
    expect(wrapper.emitted('show-inline-detail')).toBeUndefined()

    wrapper.unmount()
  })
})
