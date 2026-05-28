import { defineStore } from 'pinia'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { buildContextMessage } from '../services/api'
import { runGenerationTask } from '../services/generationService'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'

export const useExperienceStore = defineStore('experience', {
  state: () => ({
    // 当前世界书ID
    worldbookId: null,

    // 当前角色ID
    characterId: null,

    // 当前位置ID
    locationId: null,

    // 当前场景ID
    sceneId: null,

    // 叙事模式: 'novel' | 'poetry'
    genre: 'novel',

    // 是否在播放状态
    isPlaying: false,

    // 消息列表（UI显示用）
    messages: [],

    // 时间进度
    time: { day: 1, period: '早晨' },

    // 角色状态
    player: {
      vitality: 100,
      maxVitality: 100,
      mood: 80,
      maxMood: 100,
      money: 100,
      level: 1,
      exp: 0
    },

    // AI记忆（与messages保持同步）
    chatHistory: [],

    // 是否启用AI
    useAI: false,

    // API设置
    apiSettings: {
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
      model: ''
    },

    // 当前扮演角色（用于侧边栏显示）
    playerCharacter: {
      name: '主角',
      avatar: ''
    },

    // AI扮演的角色
    aiCharacter: {
      name: '助手',
      avatar: ''
    },

    // 对话模式
    dialogueMode: false,
    dialogueCharacter: null,
    dialogueCharacters: [],

    // 事件驱动机制状态
    activeMechanism: null, // 'combat' | 'trade' | 'quest' | 'dialogue' | null
    mechanismState: null,

    // 活动记录
    activities: [],

    // 标记
    flags: {},

    // 加载状态
    isLoading: false,
    lastError: null,

    // 导入模式
    quickNoteImportMode: false,
    quickNoteSelectedMessageIndexes: []
  }),

  getters: {
    currentMood: (state) => state.player?.mood ?? 80,

    recentActivities: (state) => (count = 5) => {
      return (state.activities || []).slice(-count).reverse()
    },

    hasActiveMechanism: (state) => state.activeMechanism !== null
  },

  actions: {
    // ---------- 初始化 ----------

    async initExperience() {
      this.isPlaying = true
      this.messages = [{
        role: 'system',
        content: '欢迎来到这个世界！',
        timestamp: Date.now()
      }]
      this.chatHistory = [{
        role: 'system',
        content: '你是一个文字冒险游戏的叙述者，请用生动的语言描述场景并与玩家互动。'
      }]
      this.loadActivities()
    },

    // ---------- 消息操作 ----------

    pushMessage(message) {
      this.messages.push({
        role: message.role || 'assistant',
        content: message.content,
        name: message.name,
        timestamp: Date.now(),
        dialogueMode: message.dialogueMode
      })

      if (message.role === 'user') {
        this.chatHistory.push({ role: 'user', content: message.content })
      } else if (message.role === 'assistant') {
        this.chatHistory.push({ role: 'assistant', content: message.content })
      }
    },

    updateMessage(index, newContent) {
      if (this.messages[index]) {
        this.messages[index].content = newContent
        this.rebuildChatHistory()
      }
    },

    deleteMessage(index) {
      if (this.messages[index]) {
        this.messages.splice(index, 1)
        this.rebuildChatHistory()
      }
    },

    rebuildChatHistory() {
      const systemPrompt = this.chatHistory[0] || {
        role: 'system',
        content: '你是一个文字冒险游戏的叙述者，请用生动的语言描述场景并与玩家互动。'
      }

      const history = this.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }))

      this.chatHistory = [systemPrompt, ...history]
    },

    // ---------- AI 生成 ----------

    async generateAIResponse() {
      this.isLoading = true
      try {
        this.loadApiSettings()

        const contextMsg = buildContextMessage(this.dialogueCharacter, {
          contextDetail: {
            character: this.writingCharacter,
            time: this.writingTime,
            location: this.worldMapState,
            scene: null,
            activities: this.activities
          }
        })
        const messagesToSend = contextMsg
          ? [contextMsg, ...this.chatHistory]
          : this.chatHistory

        const generationResult = await runGenerationTask({
          taskType: 'experience.response',
          baseMessages: messagesToSend,
          settings: this.apiSettings,
          worldId: this.worldbookId,
          attempts: [
            { name: 'game-first' },
            { name: 'game-retry' }
          ]
        })

        if (!generationResult.success) {
          throw new Error('AI 返回空内容，请稍后重试')
        }

        const response = generationResult.response || { content: generationResult.content }

        this.pushMessage({
          role: 'assistant',
          name: this.dialogueCharacter?.name || this.aiCharacter.name,
          content: response.content,
          reasoning_content: response.reasoning_content || null,
          dialogueMode: !!this.dialogueCharacter
        })

        return response
      } catch (e) {
        console.error('AI Error:', e)
        this.lastError = e.message
        this.pushMessage({
          role: 'system',
          content: `AI 错误：${e.message}`,
          timestamp: Date.now()
        })
        throw e
      } finally {
        this.isLoading = false
      }
    },

    // ---------- 发送动作 ----------

    async sendAction(text) {
      if (!text.trim()) return

      this.pushMessage({
        role: 'user',
        content: text
      })

      if (this.useAI) {
        await this.generateAIResponse()
      }
      // 非AI模式暂时保持与gameStore兼容
    },

    // ---------- 上下文压缩 ----------

    async compressContext() {
      const result = await compressChatHistory(this.chatHistory, {
        settings: this.apiSettings,
        worldId: this.worldbookId,
        keepRecentCount: 6,
        maxSummaryChars: 1400
      })

      if (!result.compressed) return result

      this.chatHistory = result.newHistory
      return result
    },

    summarizeMessages(messages) {
      return buildHeuristicContextSummary(messages, { maxSummaryChars: 1400 })
    },

    // ---------- 对话模式 ----------

    toggleDialogueMode() {
      this.dialogueMode = !this.dialogueMode
      if (!this.dialogueMode) {
        this.dialogueCharacter = null
      }
    },

    selectDialogueCharacter(character) {
      this.dialogueCharacter = character
      this.dialogueMode = false
    },

    loadDialogueCharacters() {
      const saved = localStorage.getItem('dialogue_characters')
      if (saved) {
        this.dialogueCharacters = JSON.parse(saved)
      }
    },

    saveDialogueCharacter(character) {
      const exists = this.dialogueCharacters.find(c => c.id === character.id)
      if (!exists) {
        this.dialogueCharacters.push(character)
        localStorage.setItem('dialogue_characters', JSON.stringify(this.dialogueCharacters))
      }
    },

    deleteDialogueCharacter(id) {
      this.dialogueCharacters = this.dialogueCharacters.filter(c => c.id !== id)
      if (this.dialogueCharacter?.id === id) {
        this.dialogueCharacter = null
      }
      localStorage.setItem('dialogue_characters', JSON.stringify(this.dialogueCharacters))
    },

    // ---------- 快速素材导入模式 ----------

    setQuickNoteImportMode(enabled) {
      this.quickNoteImportMode = !!enabled
      if (!enabled) this.quickNoteSelectedMessageIndexes = []
    },

    toggleQuickNoteMessageSelection(index) {
      const idx = Number(index)
      if (!Number.isInteger(idx) || idx < 0) return
      const next = [...this.quickNoteSelectedMessageIndexes]
      const found = next.indexOf(idx)
      if (found >= 0) next.splice(found, 1)
      else next.push(idx)
      this.quickNoteSelectedMessageIndexes = next.sort((a, b) => a - b)
    },

    clearQuickNoteMessageSelection() {
      this.quickNoteSelectedMessageIndexes = []
    },

    selectedQuickNoteMessages() {
      const picked = new Set(this.quickNoteSelectedMessageIndexes)
      return this.messages
        .map((message, index) => ({ message, index }))
        .filter(({ message, index }) => {
          const role = message.role || message.type || 'assistant'
          return picked.has(index) && role !== 'system' && String(message.content || '').trim()
        })
        .map(({ message }) => String(message.content || '').trim())
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

    // ---------- 机制触发 ----------

    triggerMechanism(type, state) {
      this.activeMechanism = type
      this.mechanismState = state
    },

    dismissMechanism() {
      this.activeMechanism = null
      this.mechanismState = null
    },

    // ---------- 状态更新 ----------

    updatePlayerState(updates) {
      if (updates.time) this.time = updates.time
      if (updates.player) {
        this.player = { ...this.player, ...updates.player }
      }
    },

    setWorldbookId(id) {
      this.worldbookId = id
    },

    setCharacterId(id) {
      this.characterId = id
    },

    setLocationId(id) {
      this.locationId = id
    },

    setSceneId(id) {
      this.sceneId = id
    },

    // ---------- 角色信息同步 ----------

    loadPlayerCharacter() {
      try {
        const raw = getItem(STORAGE_KEYS.WRITING_CHARACTER)
        if (raw && raw.name) {
          this.playerCharacter = {
            name: raw.name || '主角',
            gender: raw.gender || '',
            age: raw.age || '',
            traits: raw.traits || [],
            description: raw.description || '',
            goal: raw.goal || '',
            mood: raw.mood ?? 80
          }
        }
      } catch (e) {
        // ignore
      }
    },

    savePlayerCharacter(character) {
      setItem(STORAGE_KEYS.WRITING_CHARACTER, JSON.stringify(character))
      this.playerCharacter = { ...this.playerCharacter, ...character }
    },

    updateMood(mood) {
      this.playerCharacter.mood = mood
      this.savePlayerCharacter(this.playerCharacter)
    },

    // ---------- AI 设置 ----------

    toggleAI() {
      this.useAI = !this.useAI
      if (this.useAI) {
        this.loadApiSettings()
      }
    },

    loadApiSettings() {
      try {
        const saved = localStorage.getItem('apiSettings')
        if (saved) {
          this.apiSettings = { ...this.apiSettings, ...JSON.parse(saved) }
        }
      } catch (e) {
        // ignore
      }
    },

    saveApiSettings(settings) {
      this.apiSettings = { ...this.apiSettings, ...settings }
      localStorage.setItem('apiSettings', JSON.stringify(this.apiSettings))
    },

    // ---------- 标记 ----------

    setFlag(key, value) {
      this.flags[key] = value
    },

    getFlag(key) {
      return this.flags[key]
    },

    clearFlag(key) {
      delete this.flags[key]
    }
  }
})
