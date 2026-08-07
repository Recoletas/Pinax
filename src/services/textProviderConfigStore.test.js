import { describe, it, expect } from 'vitest'
import {
  BUILTIN_TEXT_CONFIG_ID,
  createBuiltinMinimaxConfig,
  createTextProviderConfigDraft,
  listTextProviderConfigs,
  saveTextProviderConfig,
  deleteTextProviderConfig,
  getSelectedTextProviderConfigId,
  saveSelectedTextProviderConfigId,
  resolveSelectedTextProviderConfig,
  toResolvedTextApiSettings,
  migrateLegacyApiSettings
} from './textProviderConfigStore'
import { MINIMAX_SERVER_KEY_SENTINEL } from '../../shared/textModelKeys'

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
}

const BUILTIN = createBuiltinMinimaxConfig()

describe('textProviderConfigStore', () => {
  it('list 恒以内置 MiniMax 开头, 空用户配置时仅内置', () => {
    const storage = createMemoryStorage()
    const list = listTextProviderConfigs({ storage })
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(BUILTIN_TEXT_CONFIG_ID)
    expect(list[0]).toEqual(BUILTIN)
    expect(list[0].builtin).toBe(true)
    expect(list[0].serverKey).toBe(true)
  })

  it('内置配置永不落盘 (localStorage 无 text_model_configs)', () => {
    const storage = createMemoryStorage()
    listTextProviderConfigs({ storage })
    expect(storage.getItem('text_model_configs')).toBeNull()
  })

  it('内置配置不可编辑 / 不可删除', () => {
    const storage = createMemoryStorage()
    expect(() => saveTextProviderConfig({ ...BUILTIN }, { storage })).toThrow(/不可编辑/)
    expect(() => saveTextProviderConfig({ id: BUILTIN_TEXT_CONFIG_ID, name: 'x' }, { storage })).toThrow(/不可编辑/)
    expect(() => deleteTextProviderConfig(BUILTIN_TEXT_CONFIG_ID, { storage })).toThrow(/不可删除/)
  })

  it('保存 / 删除用户配置, 名称必填', () => {
    const storage = createMemoryStorage()
    const draft = createTextProviderConfigDraft('deepseek')
    const saved = saveTextProviderConfig({ ...draft, name: '我的 DeepSeek', apiKey: 'sk-a' }, { storage })
    expect(saved.id).toBeTruthy()
    expect(listTextProviderConfigs({ storage }).length).toBe(2)
    expect(() => saveTextProviderConfig({ ...draft, name: '' }, { storage })).toThrow(/名称不能为空/)
    deleteTextProviderConfig(saved.id, { storage })
    expect(listTextProviderConfigs({ storage }).length).toBe(1)
  })

  it('未选中时 resolve 回退内置', () => {
    const storage = createMemoryStorage()
    expect(resolveSelectedTextProviderConfig({ storage }).id).toBe(BUILTIN_TEXT_CONFIG_ID)
  })

  it('选中用户配置后 resolve 返回它; 选中失效回退内置', () => {
    const storage = createMemoryStorage()
    const saved = saveTextProviderConfig(
      { ...createTextProviderConfigDraft('openai'), name: '我的 OpenAI', apiKey: 'sk-b' },
      { storage }
    )
    saveSelectedTextProviderConfigId(saved.id, { storage })
    expect(resolveSelectedTextProviderConfig({ storage }).id).toBe(saved.id)
    saveSelectedTextProviderConfigId('ghost-id', { storage })
    expect(resolveSelectedTextProviderConfig({ storage }).id).toBe(BUILTIN_TEXT_CONFIG_ID)
  })

  it('toResolvedTextApiSettings: 内置 → apiKey 为哨兵 + serverKey', () => {
    const resolved = toResolvedTextApiSettings(BUILTIN)
    expect(resolved).toMatchObject({
      provider: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: MINIMAX_SERVER_KEY_SENTINEL,
      model: 'MiniMax-Text-01',
      builtin: true,
      serverKey: true
    })
  })

  it('toResolvedTextApiSettings: 用户配置 → 原样 key + serverKey=false', () => {
    const resolved = toResolvedTextApiSettings({
      ...createTextProviderConfigDraft('deepseek'),
      id: 'c1',
      name: 'x',
      apiKey: 'sk-real'
    })
    expect(resolved.apiKey).toBe('sk-real')
    expect(resolved.serverKey).toBe(false)
    expect(resolved.builtin).toBe(false)
  })

  it('迁移: 旧 deepseek + key → 生成可编辑「我的模型」并选中, 旧 key 删除', () => {
    const storage = createMemoryStorage({
      apiSettings: JSON.stringify({ provider: 'deepseek', apiKey: 'sk-old', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
    })
    const resolved = resolveSelectedTextProviderConfig({ storage })
    expect(resolved.id).toBe('migrated-user-config')
    expect(resolved.providerId).toBe('deepseek')
    expect(resolved.apiKey).toBe('sk-old')
    expect(storage.getItem('apiSettings')).toBeNull()
    expect(getSelectedTextProviderConfigId({ storage })).toBe('migrated-user-config')
  })

  it('迁移: 旧「MiniMax + 空 key」→ 直接用内置, 不留用户配置', () => {
    const storage = createMemoryStorage({
      apiSettings: JSON.stringify({ provider: 'MiniMax', apiKey: '', baseUrl: 'https://api.minimaxi.com/anthropic', model: '' })
    })
    const resolved = resolveSelectedTextProviderConfig({ storage })
    expect(resolved.id).toBe(BUILTIN_TEXT_CONFIG_ID)
    expect(listTextProviderConfigs({ storage }).length).toBe(1)
    expect(storage.getItem('apiSettings')).toBeNull()
  })

  it('迁移: 完全空配置 → 默认内置', () => {
    const storage = createMemoryStorage({
      apiSettings: JSON.stringify({ provider: 'openai', apiKey: '', baseUrl: '', model: '' })
    })
    expect(resolveSelectedTextProviderConfig({ storage }).id).toBe(BUILTIN_TEXT_CONFIG_ID)
  })

  it('迁移: 已有用户配置时跳过迁移 (幂等)', () => {
    const storage = createMemoryStorage()
    const saved = saveTextProviderConfig(
      { ...createTextProviderConfigDraft('openai'), name: '已有配置', apiKey: 'sk-b' },
      { storage }
    )
    saveSelectedTextProviderConfigId(saved.id, { storage })
    // 之后再出现旧 key (例如旧版写入残留) → 迁移应跳过
    storage.setItem(
      'apiSettings',
      JSON.stringify({ provider: 'deepseek', apiKey: 'sk-old', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
    )
    const resolved = resolveSelectedTextProviderConfig({ storage })
    expect(resolved.name).toBe('已有配置')
    expect(resolved.apiKey).toBe('sk-b')
    // 旧 key 保留但被忽略 (列表非空时迁移不运行)
    expect(storage.getItem('apiSettings')).not.toBeNull()
  })
})
