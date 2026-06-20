import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import QuestLog from '../components/QuestLog.vue'
import { useGameStore } from '../stores/gameStore'

function seedLatestPlotEntry(gameStore) {
  gameStore.plotJournal = [{
    id: 'journal_1',
    chapterId: 'chapter-1',
    summary: '阿离在钟楼顶层与林舟对质后，决定先藏起证据，等待黎明前再交易。',
    participants: ['阿离', '林舟'],
    locations: ['东境', '青石城', '钟楼'],
    keyChoices: ['先藏起证据'],
    unresolvedHooks: ['黎明前是否交给潮盐行会'],
    sourceMessageIds: ['chat-1', 'chat-2']
  }]
}

describe('QuestLog adventure summary', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders lightweight adventure summary and Stage 4 trigger entry from runtime state', () => {
    const gameStore = useGameStore()
    gameStore.activities = [{ id: 'act_1', title: '抵达钟楼', type: 'event', date: '2026-06-09', time: '2026-06-09 20:00' }]
    gameStore.goals = [{ id: 'goal_1', title: '拿到钟楼证据', status: 'active' }]
    gameStore.keyChoices = [{ id: 'choice_1', label: '答应先查钟楼' }]
    gameStore.encounteredCharacters = [{ id: 'char_1', name: '林舟' }, { id: 'char_2', name: '苔娜' }]
    seedLatestPlotEntry(gameStore)

    const wrapper = mount(QuestLog)

    const summary = wrapper.find('.adventure-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('当前目标')
    expect(summary.text()).toContain('拿到钟楼证据')
    expect(summary.text()).toContain('最近选择')
    expect(summary.text()).toContain('答应先查钟楼')
    expect(summary.text()).toContain('已遇角色')
    expect(summary.text()).toContain('林舟、苔娜')

    const triggerPanel = wrapper.get('[data-test="adventure-trigger-panel"]')
    expect(triggerPanel.text()).toContain('本段事件总结')
    expect(triggerPanel.text()).toContain('阿离在钟楼顶层与林舟对质后')
    expect(triggerPanel.text()).toContain('地点')
    expect(triggerPanel.text()).toContain('东境 / 青石城')
    expect(wrapper.get('[data-test="trigger-prose-generate"]').text()).toContain('整理成我的版本')
    expect(wrapper.get('[data-test="trigger-storyboard-generate"]').text()).toContain('整理成事件分镜')

    wrapper.unmount()
  })

  it('renders accepted and failed trigger draft states only for the latest plot entry', () => {
    const gameStore = useGameStore()
    seedLatestPlotEntry(gameStore)
    gameStore.adventureTriggers = {
      prose: {
        type: 'prose',
        title: 'chapter-1 章节草稿',
        chapterId: 'chapter-1',
        sourcePlotId: 'journal_1',
        content: '钟楼上的风带着盐味，阿离把证据塞进衣襟，决定把黎明前的筹码握在自己手里。',
        status: 'accepted',
        assetId: 'asset_1'
      },
      storyboard: {
        type: 'storyboard',
        title: 'chapter-1 分镜草稿',
        chapterId: 'chapter-1',
        sourcePlotId: 'journal_1',
        status: 'error',
        error: '整理分镜失败，请稍后重试',
        shots: []
      }
    }

    const wrapper = mount(QuestLog)

    expect(wrapper.get('[data-test="trigger-prose-generate"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="trigger-prose-generate"]').text()).toContain('正文已保存')
    expect(wrapper.get('[data-test="trigger-prose-draft"]').text()).toContain('已保存到素材库')
    expect(wrapper.get('[data-test="trigger-storyboard-draft"]').text()).toContain('整理分镜失败，请稍后重试')
    expect(wrapper.get('[data-test="trigger-storyboard-dismiss"]').text()).toContain('清除错误')

    wrapper.unmount()
  })

  it('wires trigger generate, accept, and dismiss actions to the store', async () => {
    const gameStore = useGameStore()
    seedLatestPlotEntry(gameStore)
    gameStore.adventureTriggers = {
      prose: {
        type: 'prose',
        title: 'chapter-1 章节草稿',
        chapterId: 'chapter-1',
        sourcePlotId: 'journal_1',
        content: '钟楼上的风带着盐味，阿离把证据塞进衣襟，决定把黎明前的筹码握在自己手里。',
        status: 'ready'
      },
      storyboard: null
    }

    const generateSpy = vi.spyOn(gameStore, 'generateAdventureTriggerDraft').mockResolvedValue({})
    const acceptSpy = vi.spyOn(gameStore, 'acceptAdventureTriggerDraft').mockResolvedValue({})
    const dismissSpy = vi.spyOn(gameStore, 'dismissAdventureTriggerDraft').mockImplementation(() => {})

    const wrapper = mount(QuestLog)

    await wrapper.get('[data-test="trigger-prose-generate"]').trigger('click')
    await wrapper.get('[data-test="trigger-storyboard-generate"]').trigger('click')
    await wrapper.get('[data-test="trigger-prose-accept"]').trigger('click')
    await wrapper.get('[data-test="trigger-prose-dismiss"]').trigger('click')

    expect(generateSpy).toHaveBeenCalledWith('prose')
    expect(generateSpy).toHaveBeenCalledWith('storyboard')
    expect(acceptSpy).toHaveBeenCalledWith('prose')
    expect(dismissSpy).toHaveBeenCalledWith('prose')

    wrapper.unmount()
  })
})
