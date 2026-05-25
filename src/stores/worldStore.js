import { defineStore } from 'pinia'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../composables/useStorage'

const WORLDBOOKS_INDEX_KEY = 'worldbooks_index'
const WORLDBOOK_KEY_PREFIX = 'worldbook_'
const ACTIVE_WORLDBOOK_ID_KEY = 'active_worldbook_id'

function decodeStored(raw, fallback) {
  if (raw == null) return fallback
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }
  return raw
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeWorldbook(raw = {}) {
  const source = decodeStored(raw, {})
  const entries = ensureArray(decodeStored(source.entries, []))
  const entriesMapRaw = decodeStored(source.entriesMap, null)
  const entriesMap = (entriesMapRaw && typeof entriesMapRaw === 'object' && !Array.isArray(entriesMapRaw))
    ? { ...entriesMapRaw }
    : {}

  for (const entry of entries) {
    if (entry?.id) entriesMap[entry.id] = entry
  }

  return {
    ...source,
    // 结构化基础设定
    worldDescription: String(source.worldDescription || source.description || ''),
    writingStyle: String(source.writingStyle || ''),
    examples: String(source.examples || ''),
    forbidden: String(source.forbidden || ''),
    // 兼容旧版 description 字段
    description: String(source.description || ''),
    settings: {
      scanDepth: 2,
      tokenBudget: 4096,
      recursiveScanning: true,
      ...(source.settings && typeof source.settings === 'object' ? source.settings : {})
    },
    entries,
    entriesMap,
    groups: ensureArray(decodeStored(source.groups, []))
  }
}

function createWorldBookId() {
  return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createEntryId() {
  return `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useWorldStore = defineStore('world', {
  state: () => ({
    // 世界书列表索引（轻量）
    worldbooksIndex: [],

    // 当前活跃世界书完整数据（按需加载）
    activeWorldbook: null,

    // 角色卡列表
    characters: [],

    // 活动记录（时间线）
    activities: [],

    // 加载状态
    isLoading: false,
    lastError: null
  }),

  getters: {
    activeWorldbookId: (state) => state.activeWorldbook?.id || null,
    activeWorldbookName: (state) => state.activeWorldbook?.name || '未选择世界书',

    activeEntryCount: (state) => state.activeWorldbook?.entries?.length || 0,

    charactersByWorldbook: (state) => (worldbookId) => {
      if (!worldbookId) return state.characters.filter(c => !c.worldEntryId)
      return state.characters.filter(c => c.worldEntryId?.startsWith(worldbookId))
    }
  },

  actions: {
    // ---------- 世界书 CRUD ----------

    async loadWorldbooksIndex() {
      try {
        const raw = decodeStored(getItem(WORLDBOOKS_INDEX_KEY), [])
        this.worldbooksIndex = ensureArray(raw)
      } catch (e) {
        this.lastError = e.message
        this.worldbooksIndex = []
      }
    },

    async saveWorldbooksIndex() {
      setItem(WORLDBOOKS_INDEX_KEY, this.worldbooksIndex)
    },

    async loadWorldbook(worldbookId) {
      this.isLoading = true
      try {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        this.activeWorldbook = normalizeWorldbook(raw)
        return this.activeWorldbook
      } catch (e) {
        this.lastError = e.message
        return null
      } finally {
        this.isLoading = false
      }
    },

    async createWorldbook(data = {}) {
      const now = Date.now()
      const worldbook = {
        id: createWorldBookId(),
        name: data.name || '新世界书',
        // 结构化基础设定
        worldDescription: data.worldDescription || data.description || '',
        writingStyle: data.writingStyle || '',
        examples: data.examples || '',
        forbidden: data.forbidden || '',
        // 兼容旧字段
        description: data.description || '',
        author: data.author || '',
        version: '1.0',
        createdAt: now,
        updatedAt: now,
        settings: {
          scanDepth: 2,
          tokenBudget: 4096,
          recursiveScanning: true,
          ...data.settings
        },
        entries: [],
        entriesMap: {}, // id -> entry 便于快速查找
        groups: []
      }

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, worldbook)

      this.worldbooksIndex.push({
        id: worldbook.id,
        name: worldbook.name,
        description: worldbook.description,
        author: worldbook.author,
        entryCount: 0,
        createdAt: worldbook.createdAt,
        updatedAt: worldbook.updatedAt
      })
      await this.saveWorldbooksIndex()
      this.activeWorldbook = worldbook
      setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id)

      return worldbook
    },

    async updateWorldbook(worldbookId, updates) {
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx < 0) throw new Error('世界书不存在')

      const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
      if (!raw) throw new Error('世界书数据不存在')

      const worldbook = normalizeWorldbook(raw)
      const updated = normalizeWorldbook({
        ...worldbook,
        ...updates,
        updatedAt: Date.now()
      })

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, updated)

      // 更新索引
      const indexEntry = this.worldbooksIndex[idx]
      if (Object.prototype.hasOwnProperty.call(updates, 'name')) indexEntry.name = updates.name
      if (Object.prototype.hasOwnProperty.call(updates, 'description')) indexEntry.description = updates.description
      if (Object.prototype.hasOwnProperty.call(updates, 'author')) indexEntry.author = updates.author
      indexEntry.updatedAt = updated.updatedAt
      await this.saveWorldbooksIndex()

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = updated
      }

      return updated
    },

    async deleteWorldbook(worldbookId) {
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx < 0) return

      removeItem(WORLDBOOK_KEY_PREFIX + worldbookId)

      // 从索引删除
      this.worldbooksIndex.splice(idx, 1)
      await this.saveWorldbooksIndex()

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = null
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
      }

      const persistedActiveId = decodeStored(getItem(ACTIVE_WORLDBOOK_ID_KEY), null)
      if (persistedActiveId === worldbookId) {
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
      }
    },

    async setActiveWorldbook(worldbookId) {
      if (!worldbookId) {
        this.activeWorldbook = null
        removeItem(ACTIVE_WORLDBOOK_ID_KEY)
        return null
      }
      if (this.activeWorldbook?.id === worldbookId) return this.activeWorldbook

      const loaded = await this.loadWorldbook(worldbookId)
      if (loaded) setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbookId)
      return loaded
    },

    async ensureActiveWorldbook() {
      if (!this.worldbooksIndex.length) {
        return this.createWorldbook({
          name: '默认世界书',
          description: '自动创建的默认世界书'
        })
      }

      const persistedActiveId = decodeStored(getItem(ACTIVE_WORLDBOOK_ID_KEY), null)
      const targetId = (typeof persistedActiveId === 'string' && this.worldbooksIndex.some(w => w.id === persistedActiveId))
        ? persistedActiveId
        : this.worldbooksIndex[0].id

      return this.setActiveWorldbook(targetId)
    },

    // ---------- 条目 CRUD ----------

    async addEntry(worldbookId, entryData) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entry = {
        id: createEntryId(),
        keys: entryData.keys || [],
        keysSecondary: entryData.keysSecondary || [],
        content: entryData.content || '',
        type: entryData.type || 'general',
        name: entryData.name || entryData.keys?.[0] || '未命名条目',
        injection: {
          mode: entryData.injection?.mode || 'selective',
          probability: entryData.injection?.probability ?? 100,
          cooldown: entryData.injection?.cooldown ?? 0,
          depth: entryData.injection?.depth ?? 1,
          excludeRecursion: entryData.injection?.excludeRecursion ?? false,
          group: entryData.injection?.group || null
        },
        relations: {
          tags: entryData.relations?.tags || [],
          locations: entryData.relations?.locations || [],
          characters: entryData.relations?.characters || [],
          events: entryData.relations?.events || []
        },
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          importSource: entryData.metadata?.importSource || 'manual'
        }
      }

      worldbook.entries.push(entry)
      worldbook.entriesMap[entry.id] = entry
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        await this.saveWorldbooksIndex()
      }

      return entry
    },

    async updateEntry(worldbookId, entryId, updates) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) throw new Error('条目不存在')

      const entry = worldbook.entries[entryIdx]
      const updated = {
        ...entry,
        ...updates,
        id: entryId, // 不可更改
        metadata: {
          ...entry.metadata,
          updatedAt: Date.now()
        }
      }

      worldbook.entries[entryIdx] = updated
      worldbook.entriesMap[entryId] = updated
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      return updated
    },

    async deleteEntry(worldbookId, entryId) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) return

      worldbook.entries.splice(entryIdx, 1)
      delete worldbook.entriesMap[entryId]
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, worldbook)
      this.activeWorldbook = worldbook

      // 更新索引计数
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx >= 0) {
        this.worldbooksIndex[idx].entryCount = worldbook.entries.length
        this.worldbooksIndex[idx].updatedAt = worldbook.updatedAt
        await this.saveWorldbooksIndex()
      }
    },

    // 根据关键词匹配条目
    matchEntries(text) {
      if (!this.activeWorldbook || !text) return []
      const lowerText = text.toLowerCase()
      const results = []

      for (const entry of this.activeWorldbook.entries) {
        // 检查keys
        const keysMatch = entry.keys.some(k => lowerText.includes(k.toLowerCase()))
        const keysSecondaryMatch = entry.keysSecondary.some(k => lowerText.includes(k.toLowerCase()))

        if (keysMatch || keysSecondaryMatch) {
          results.push({
            ...entry,
            matchType: keysMatch ? 'primary' : 'secondary'
          })
        }
      }

      return results
    },

    // ---------- 角色卡管理 ----------

    loadCharacters() {
      try {
        const raw = decodeStored(getItem(STORAGE_KEYS.CHARACTERS || 'characters'), [])
        this.characters = ensureArray(raw)
      } catch (e) {
        this.characters = []
      }
    },

    saveCharacters() {
      setItem(STORAGE_KEYS.CHARACTERS || 'characters', this.characters)
    },

    addCharacter(character) {
      if (!character.id) {
        character.id = `char_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      }
      this.characters.push(character)
      this.saveCharacters()
      return character
    },

    updateCharacter(characterId, updates) {
      const idx = this.characters.findIndex(c => c.id === characterId)
      if (idx < 0) return null
      this.characters[idx] = { ...this.characters[idx], ...updates }
      this.saveCharacters()
      return this.characters[idx]
    },

    deleteCharacter(characterId) {
      this.characters = this.characters.filter(c => c.id !== characterId)
      this.saveCharacters()
    },

    // ---------- 活动记录 ----------

    loadActivities() {
      try {
        const raw = decodeStored(getItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities'), [])
        this.activities = ensureArray(raw)
      } catch (e) {
        this.activities = []
      }
    },

    addActivity(activity) {
      if (!activity.id) {
        activity.id = `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      }
      activity.createdAt = Date.now()
      this.activities.push(activity)
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', this.activities)
      return activity
    },

    clearActivities() {
      this.activities = []
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', this.activities)
    },

    // ---------- SillyTavern 导入 ----------

    async importFromSillyTavern(worldbookData) {
      const now = Date.now()
      const worldbook = {
        id: createWorldBookId(),
        name: worldbookData.name || worldbookData.world_name || '导入的世界书',
        description: worldbookData.description || worldbookData.world_description || '',
        author: worldbookData.creator || worldbookData.author || '',
        version: worldbookData.version || '1.0',
        createdAt: now,
        updatedAt: now,
        settings: {
          scanDepth: worldbookData.scan_depth || 2,
          tokenBudget: worldbookData.token_budget || 4096,
          recursiveScanning: worldbookData.recursive_scanning ?? true
        },
        entries: [],
        entriesMap: {},
        groups: []
      }

      // 解析entries
      const rawEntries = worldbookData.entries || worldbookData.entry || {}
      for (const [uid, entry] of Object.entries(rawEntries)) {
        const keys = Array.isArray(entry.key) ? entry.key : entry.key ? [entry.key] : []
        const keysSecondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : entry.keysecondary ? [entry.keysecondary] : []

        const mapped = {
          id: `entry_${Date.now().toString(36)}_${uid.slice(0, 8)}`,
          keys,
          keysSecondary,
          content: entry.content || '',
          type: this.guessEntryType(keys, entry.content),
          name: entry.comment || keys[0] || uid,
          injection: {
            mode: entry.selective ? 'selective' : entry.constant ? 'constant' : 'selective',
            probability: entry.probability ?? 100,
            cooldown: entry.cooldown ?? 0,
            depth: entry.depth ?? 1,
            excludeRecursion: entry.excludeRecursion ?? false,
            group: entry.group || null
          },
          relations: {
            tags: entry.tags || [],
            locations: [],
            characters: [],
            events: []
          },
          metadata: {
            createdAt: now,
            updatedAt: now,
            importSource: 'sillytavern',
            originalUid: uid
          }
        }

        worldbook.entries.push(mapped)
        worldbook.entriesMap[mapped.id] = mapped
      }

      // 解析分组
      if (worldbookData.groups) {
        worldbook.groups = worldbookData.groups
      }

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, worldbook)

      this.worldbooksIndex.push({
        id: worldbook.id,
        name: worldbook.name,
        description: worldbook.description,
        author: worldbook.author,
        entryCount: worldbook.entries.length,
        createdAt: worldbook.createdAt,
        updatedAt: worldbook.updatedAt
      })
      await this.saveWorldbooksIndex()
      this.activeWorldbook = worldbook
      setItem(ACTIVE_WORLDBOOK_ID_KEY, worldbook.id)

      return worldbook
    },

    // ---------- SillyTavern 导出 ----------

    async exportToSillyTavern(worldbookId) {
      let worldbook = this.activeWorldbook
      if (!worldbook || worldbook.id !== worldbookId) {
        const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
        if (!raw) throw new Error('世界书不存在')
        worldbook = normalizeWorldbook(raw)
      }

      const entries = {}
      for (const entry of worldbook.entries) {
        const uid = entry.metadata?.originalUid || entry.id.replace('entry_', '')
        entries[uid] = {
          key: entry.keys,
          keysecondary: entry.keysSecondary,
          content: entry.content,
          comment: entry.name,
          selective: entry.injection.mode === 'selective',
          constant: entry.injection.mode === 'constant',
          group: entry.injection.group,
          depth: entry.injection.depth,
          probability: entry.injection.probability,
          cooldown: entry.injection.cooldown,
          excludeRecursion: entry.injection.excludeRecursion
        }
      }

      return {
        name: worldbook.name,
        world_name: worldbook.name,
        description: worldbook.description,
        world_description: worldbook.description,
        creator: worldbook.author,
        version: worldbook.version,
        scan_depth: worldbook.settings.scanDepth,
        token_budget: worldbook.settings.tokenBudget,
        recursive_scanning: worldbook.settings.recursiveScanning,
        groups: worldbook.groups,
        entries
      }
    },

    // ---------- 辅助方法 ----------

    guessEntryType(keys, content) {
      if (!keys || keys.length === 0) return 'general'
      const keyLower = keys.map(k => k.toLowerCase())

      // 地点关键词
      const locationKws = ['城市', '城镇', '村庄', '山', '森林', '河流', '海洋', '宫殿', '房屋', '房间', '地点', '位置', 'city', 'town', 'village', 'mountain', 'forest', 'river']
      if (keyLower.some(k => locationKws.some(lk => k.includes(lk)))) return 'location'

      // 角色关键词
      const characterKws = ['人物', '角色', 'npc', '主角', '配角', '人名', 'character']
      if (keyLower.some(k => characterKws.some(ck => k.includes(ck)))) return 'character'

      // 规则 / 禁忌 / 风格
      const ruleKws = ['规则', '约束', '必须', '原则', 'rule']
      if (keyLower.some(k => ruleKws.some(rk => k.includes(rk)))) return 'rule'

      const forbiddenKws = ['禁忌', '禁止', '不得', '不能', 'forbidden']
      if (keyLower.some(k => forbiddenKws.some(fk => k.includes(fk)))) return 'forbidden'

      const styleKws = ['风格', '文风', '语气', '叙事', 'style']
      if (keyLower.some(k => styleKws.some(sk => k.includes(sk)))) return 'style'

      // 组织关键词
      const organizationKws = ['组织', '门派', '势力', '公司', '协会', '家族', 'organization', 'faction']
      if (keyLower.some(k => organizationKws.some(ok => k.includes(ok)))) return 'organization'

      // 物品关键词
      const itemKws = ['物品', '道具', '武器', '装备', 'item', 'weapon', 'armor']
      if (keyLower.some(k => itemKws.some(ik => k.includes(ik)))) return 'item'

      // 事件关键词
      const eventKws = ['事件', '发生', '活动', '发生了', 'event']
      if (keyLower.some(k => eventKws.some(ek => k.includes(ek)))) return 'event'

      // 任务关键词
      const questKws = ['任务', '委托', 'quest']
      if (keyLower.some(k => questKws.some(qk => k.includes(qk)))) return 'quest'

      return 'general'
    }
  }
})
