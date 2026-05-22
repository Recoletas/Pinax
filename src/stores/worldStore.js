import { defineStore } from 'pinia'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

const WORLDBOOKS_INDEX_KEY = 'worldbooks_index'
const WORLDBOOK_KEY_PREFIX = 'worldbook_'

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
        const raw = getItem(WORLDBOOKS_INDEX_KEY)
        this.worldbooksIndex = raw ? JSON.parse(raw) : []
      } catch (e) {
        this.lastError = e.message
        this.worldbooksIndex = []
      }
    },

    async saveWorldbooksIndex() {
      setItem(WORLDBOOKS_INDEX_KEY, JSON.stringify(this.worldbooksIndex))
    },

    async loadWorldbook(worldbookId) {
      this.isLoading = true
      try {
        const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
        if (!raw) throw new Error('世界书不存在')
        this.activeWorldbook = JSON.parse(raw)
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, JSON.stringify(worldbook))

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

      return worldbook
    },

    async updateWorldbook(worldbookId, updates) {
      const idx = this.worldbooksIndex.findIndex(w => w.id === worldbookId)
      if (idx < 0) throw new Error('世界书不存在')

      const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
      if (!raw) throw new Error('世界书数据不存在')

      const worldbook = JSON.parse(raw)
      const updated = {
        ...worldbook,
        ...updates,
        updatedAt: Date.now()
      }

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, JSON.stringify(updated))

      // 更新索引
      const indexEntry = this.worldbooksIndex[idx]
      if (updates.name) indexEntry.name = updates.name
      if (updates.description) indexEntry.description = updates.description
      if (updates.author) indexEntry.author = updates.author
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

      // 从localStorage删除
      const keysToRemove = [WORLDBOOK_KEY_PREFIX + worldbookId]
      // 注意：这里需要用Storage的removeItem，但当前只导入了getItem/setItem
      // 暂时通过设置空值来"删除"
      localStorage.removeItem(WORLDBOOK_KEY_PREFIX + worldbookId)

      // 从索引删除
      this.worldbooksIndex.splice(idx, 1)
      await this.saveWorldbooksIndex()

      if (this.activeWorldbook?.id === worldbookId) {
        this.activeWorldbook = null
      }
    },

    async setActiveWorldbook(worldbookId) {
      if (this.activeWorldbook?.id === worldbookId) return
      await this.loadWorldbook(worldbookId)
    },

    // ---------- 条目 CRUD ----------

    async addEntry(worldbookId, entryData) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
        if (!raw) throw new Error('世界书不存在')
        worldbook = JSON.parse(raw)
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, JSON.stringify(worldbook))
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
        const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
        if (!raw) throw new Error('世界书不存在')
        worldbook = JSON.parse(raw)
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, JSON.stringify(worldbook))
      this.activeWorldbook = worldbook

      return updated
    },

    async deleteEntry(worldbookId, entryId) {
      let worldbook = this.activeWorldbook
      if (worldbook?.id !== worldbookId) {
        const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
        if (!raw) throw new Error('世界书不存在')
        worldbook = JSON.parse(raw)
      }

      const entryIdx = worldbook.entries.findIndex(e => e.id === entryId)
      if (entryIdx < 0) return

      worldbook.entries.splice(entryIdx, 1)
      delete worldbook.entriesMap[entryId]
      worldbook.updatedAt = Date.now()

      setItem(WORLDBOOK_KEY_PREFIX + worldbookId, JSON.stringify(worldbook))
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
        const raw = getItem(STORAGE_KEYS.CHARACTERS || 'characters')
        this.characters = raw ? JSON.parse(raw) : []
      } catch (e) {
        this.characters = []
      }
    },

    saveCharacters() {
      setItem(STORAGE_KEYS.CHARACTERS || 'characters', JSON.stringify(this.characters))
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
        const raw = getItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities')
        this.activities = raw ? JSON.parse(raw) : []
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
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', JSON.stringify(this.activities))
      return activity
    },

    clearActivities() {
      this.activities = []
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES || 'writing_activities', JSON.stringify(this.activities))
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

      setItem(WORLDBOOK_KEY_PREFIX + worldbook.id, JSON.stringify(worldbook))

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

      return worldbook
    },

    // ---------- SillyTavern 导出 ----------

    async exportToSillyTavern(worldbookId) {
      const worldbook = this.activeWorldbook
      if (!worldbook || worldbook.id !== worldbookId) {
        const raw = getItem(WORLDBOOK_KEY_PREFIX + worldbookId)
        if (!raw) throw new Error('世界书不存在')
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