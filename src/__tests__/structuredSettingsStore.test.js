import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldStore } from '../stores/worldStore'

describe('structured settings in worldStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('creates a worldbook with normalized structured settings', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    expect(worldbook.structuredSettings.world.origin).toBe('')
    expect(worldbook.structuredSettings.story.logline).toBe('')
  })

  it('updates one structured setting field without replacing other fields', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    await store.updateStructuredSetting(worldbook.id, 'world', 'origin', '世界来自一场失败的封神。')
    await store.updateStructuredSetting(worldbook.id, 'story', 'theme', '自由与代价')

    expect(store.activeWorldbook.structuredSettings.world.origin).toBe('世界来自一场失败的封神。')
    expect(store.activeWorldbook.structuredSettings.story.theme).toBe('自由与代价')
    expect(store.activeWorldbook.structuredSettings.world.powerSystem).toBe('')
  })

  it('converts a structured field into a confirmed worldbook entry', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    await store.updateStructuredSetting(worldbook.id, 'creativeRules', 'taboos', '不要出现现代网络流行语。')
    const entry = await store.convertStructuredSettingToEntry(worldbook.id, 'creativeRules', 'taboos')

    expect(entry.name).toBe('禁忌')
    expect(entry.type).toBe('forbidden')
    expect(entry.content).toBe('不要出现现代网络流行语。')
    expect(entry.injection.mode).toBe('constant')
    expect(entry.injection.group).toBe('禁写边界')
  })
})
