import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import WorldBookQuickImport from '../pages/WorldBookQuickImport.vue'
import { tryAiExtractWorldbookJson } from '../services/worldbookImportGeneration'
import { useWorldStore } from '../stores/worldStore'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('../services/worldbookImportGeneration', () => ({
  tryAiExtractWorldbookJson: vi.fn(),
  tryAiGenerateWorldbookJsonFromBrief: vi.fn()
}))

const tryAiExtractWorldbookJsonMock = vi.mocked(tryAiExtractWorldbookJson)

function multiChapterText() {
  return [
    '第一章 雾港',
    '雾港常年被潮湿海雾包围，旧灯塔记录着外海来客的名字。守夜人必须在钟声响起前确认每一艘船的旗帜。',
    '',
    '第二章 灯塔',
    '灯塔下层封存着潮汐议会的旧规约，任何人不得在红雾之夜点燃第三盏灯。'
  ].join('\n')
}

describe('WorldBookQuickImport novel import', () => {
  beforeEach(() => {
    localStorage.clear()
    tryAiExtractWorldbookJsonMock.mockReset()
  })

  it('tries AI extraction before chapter segmentation', async () => {
    tryAiExtractWorldbookJsonMock.mockResolvedValue({
      ok: true,
      parsed: {
        name: '雾港世界书',
        description: '由 AI 提炼的雾港世界书。',
        worldDescription: '雾港被海雾与旧灯塔制度塑造，守夜人与潮汐议会共同维持秩序。',
        writingStyle: '克制、悬疑、潮湿的港口氛围。',
        forbidden: '不得破坏红雾之夜的禁令。',
        groups: ['地理', '规则'],
        entries: [
          {
            name: '雾港',
            type: 'location',
            keys: ['雾港'],
            content: '雾港常年被海雾包围，旧灯塔与外海船只记录构成城市秩序。',
            group: '地理',
            mode: 'selective'
          },
          {
            name: '红雾禁令',
            type: 'rule',
            keys: ['红雾', '第三盏灯'],
            content: '红雾之夜不得点燃第三盏灯，这是潮汐议会留下的硬性规约。',
            group: '规则',
            mode: 'constant'
          }
        ]
      }
    })

    const wrapper = mount(WorldBookQuickImport)
    await flushPromises()

    await wrapper.find('textarea').setValue(multiChapterText())
    const generateButton = wrapper.findAll('button.primary-btn')
      .find((button) => button.text().includes('生成导入预览'))
    expect(generateButton).toBeTruthy()
    await generateButton.trigger('click')
    await flushPromises()
    await nextTick()

    expect(tryAiExtractWorldbookJsonMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceText: multiChapterText(),
      targetCount: 10,
      nameHint: ''
    }))
    expect(wrapper.find('.preview-card').exists()).toBe(true)
    expect(wrapper.find('.preview-card').text()).toContain('小说段落 AI 提炼')
    expect(wrapper.find('.segment-preview-card').exists()).toBe(false)

    wrapper.unmount()
  })

  it('imports presets with modern constraint entries', async () => {
    const wrapper = mount(WorldBookQuickImport)
    const worldStore = useWorldStore()
    await flushPromises()

    expect(wrapper.text()).toContain('边境王国 · 雾潮暮湾')
    expect(wrapper.text()).toContain('都市异闻 · 北岸旧档')
    expect(wrapper.text()).toContain('近未来殖民地 · 赫利俄斯')
    expect(wrapper.text()).toContain('开场困境')
    expect(wrapper.text()).toContain('事件')
    expect(wrapper.text()).toContain('势力')
    expect(wrapper.text()).toContain('地点')

    const presetButton = wrapper.findAll('button')
      .find((button) => button.text().includes('一键导入'))
    expect(presetButton).toBeTruthy()
    await presetButton.trigger('click')
    await flushPromises()
    await nextTick()

    const entries = worldStore.activeWorldbook?.entries || []
    const constraintEntries = entries.filter((entry) => ['rule', 'style', 'forbidden'].includes(entry.type))

    expect(constraintEntries.map((entry) => entry.type).sort()).toEqual(['forbidden', 'rule', 'style'])
    expect(constraintEntries.every((entry) => entry.injection.mode === 'constant')).toBe(true)
    expect(entries.some((entry) => entry.type === 'organization')).toBe(true)
    expect(entries.some((entry) => entry.type === 'quest')).toBe(true)
    expect(entries.filter((entry) => entry.type === 'event').length).toBeGreaterThanOrEqual(6)
    expect(entries.filter((entry) => entry.type === 'organization').length).toBeGreaterThanOrEqual(3)
    expect(entries.filter((entry) => entry.type === 'location').length).toBeGreaterThanOrEqual(5)
    expect(worldStore.activeWorldbook?.groups).toContain('组织')
    expect(worldStore.activeWorldbook?.groups).toContain('任务')
    expect(worldStore.activeWorldbook?.worldDescription).toContain('雾潮')
    expect(worldStore.activeWorldbook?.worldDescription).toContain('开场困境')
    expect(worldStore.activeWorldbook?.worldDescription).toContain('暮湾钟楼')
    expect(worldStore.activeWorldbook?.writingStyle).toContain('边境')
    expect(worldStore.activeWorldbook?.forbidden).toContain('不得')

    wrapper.unmount()
  })

  it('shows and imports adapted RPG world.json presets', async () => {
    const wrapper = mount(WorldBookQuickImport)
    const worldStore = useWorldStore()
    await flushPromises()

    expect(wrapper.text()).toContain('RPG 预设适配')
    expect(wrapper.text()).toContain('仙侠世界')
    expect(wrapper.text()).toContain('奇幻大陆')
    expect(wrapper.text()).toContain('末日生存')
    expect(wrapper.text()).toContain('科幻星际')
    expect(wrapper.text()).toContain('都市生活')

    const rpgPreset = wrapper.findAll('.preset-item')
      .find((item) => item.text().includes('科幻星际') && item.text().includes('RPG 预设适配'))
    expect(rpgPreset).toBeTruthy()

    const importButton = rpgPreset.find('button')
    await importButton.trigger('click')
    await flushPromises()
    await nextTick()

    const active = worldStore.activeWorldbook
    const entries = active?.entries || []

    expect(active?.name).toContain('科幻星际')
    expect(active?.worldDescription).toContain('新希望号空间站')
    expect(active?.writingStyle).toContain('科幻')
    expect(entries.some((entry) => entry.type === 'location' && entry.name.includes('空间站'))).toBe(true)
    expect(entries.some((entry) => entry.type === 'character' && entry.name.includes('接线员'))).toBe(true)
    expect(entries.some((entry) => entry.type === 'event' && entry.name.includes('太空救援'))).toBe(true)
    expect(entries.some((entry) => entry.type === 'quest' && entry.name.includes('星际漂流'))).toBe(true)
    expect(active?.groups).toContain('地理')
    expect(active?.groups).toContain('任务')

    wrapper.unmount()
  })
})
