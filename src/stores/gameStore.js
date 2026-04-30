import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, sendChat } from '../services/api'

export const useGameStore = defineStore('game', {
  state: () => ({
    gameId: null,
    worldId: null,
    isPlaying: false,
    messages: [], // UI 显示
    time: { day: 1, period: '早晨' },
    player: { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 },
    inventory: [],
    quests: [],
    flags: {},
    worldState: {},
    npcRelations: {},
    discoveredPlaces: [],
    completedQuests: [],
    isLoading: false,
    lastError: null,
    chatHistory: [], // AI 记忆
    useAI: false,
    apiSettings: {
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
      model: ''
    },
    currentCharacter: {
      name: 'Seraphina',
      avatar: 'https://img.moegirl.org.cn/common/thumb/b/b7/Seraphina_Portrait.png/250px-Seraphina_Portrait.png' // 示例头像
    }
  }),

  actions: {
    loadApiSettings() {
      const saved = localStorage.getItem('apiSettings')
      if (saved) {
        this.apiSettings = JSON.parse(saved)
      }
    },

    // --- 新增：更新消息 ---
    updateMessage(index, newContent) {
      const msg = this.messages[index]
      if (!msg) return

      const oldContent = msg.content
      // 1. 更新 UI 数组
      msg.content = newContent

      // 2. 同步更新 AI 上下文数组 (chatHistory)
      // 找到内容相同的项进行替换
      const historyItem = this.chatHistory.find(h => h.content === oldContent)
      if (historyItem) {
        historyItem.content = newContent
      }
    },

    // --- 新增：删除消息 ---
    deleteMessage(index) {
      const msg = this.messages[index]
      if (!msg) return

      const oldContent = msg.content
      // 1. 从 UI 数组删除
      this.messages.splice(index, 1)

      // 2. 从 AI 上下文数组删除
      const hIndex = this.chatHistory.findIndex(h => h.content === oldContent)
      if (hIndex !== -1) {
        this.chatHistory.splice(hIndex, 1)
      }
    },

    async initGame() {
      this.isPlaying = true
      this.messages = [{
        type: 'system',
        content: '游戏开始！你醒来发现自己身处陌生的地方...',
        timestamp: Date.now()
      }]
      this.chatHistory = [{
        role: 'system',
        content: '你是一个文字冒险游戏的叙述者，请用生动的语言描述场景并与玩家互动。'
      }]
    },

    async startGame(worldId) {
      this.isLoading = true
      try {
        const response = await apiSendAction(null, worldId, true)
        this.gameId = response.gameId
        this.worldId = worldId
        this.isPlaying = true
        
        const welcomeText = `欢迎来到${response.world?.config?.name || '这个世界'}！游戏开始。`
        
        this.messages = [{
          type: 'system',
          content: welcomeText,
          timestamp: Date.now()
        }]
        this.chatHistory = [{
          role: 'system',
          content: `欢迎来到${response.world?.config?.name || '这个世界'}！你是这个世界的冒险者。`
        }]
      } catch (e) {
        this.lastError = e.message
      } finally {
        this.isLoading = false
      }
    },

    async sendAction(text) {
      if (!text.trim()) return

      // 用户消息
      const userMsg = {
        type: 'user',
        content: text,
        timestamp: Date.now()
      }
      this.messages.push(userMsg)
      this.chatHistory.push({ role: 'user', content: text })

      this.isLoading = true
      try {
        if (this.useAI) {
          this.loadApiSettings()

          // 发送给 AI
          const response = await sendChat(
            this.chatHistory,
            null,
            this.worldId,
            this.apiSettings
          )
          
          // 提取内容和思考过程 (DeepSeek 支持)
          const aiContent = response.content
          const reasoning = response.reasoning_content || null

          // 添加到 UI
          this.messages.push({
            type: 'narrator',
            content: aiContent,
            reasoning_content: reasoning, // 存储思考过程
            timestamp: Date.now()
          })

          // 添加到 AI 记忆
          this.chatHistory.push({
            role: 'assistant',
            content: aiContent
          })
        } else {
          // 非 AI 模式逻辑
          const response = await apiSendAction(this.gameId, text)
          this.updateState(response)

          if (response.events) {
            for (const event of response.events) {
              if (event.type !== 'system' && event.type !== 'time_advance') {
                this.messages.push({
                  type: 'narrator',
                  category: event.category,
                  content: event.description,
                  choices: event.choices,
                  timestamp: Date.now()
                })
              }
            }
          }

          if (response.timeAdvanced) {
            this.messages.push({
              type: 'system',
              content: `时间已推进：${response.timeDescription}`,
              timestamp: Date.now()
            })
          }
        }
      } catch (e) {
        this.lastError = e.message
        this.messages.push({
          type: 'system',
          content: `发生错误：${e.message}`,
          timestamp: Date.now()
        })
      } finally {
        this.isLoading = false
      }
    },

    updateState(response) {
      if (response.state) {
        if (response.state.time) this.time = response.state.time
        if (response.state.player) this.player = response.state.player
        if (response.state.inventory) this.inventory = response.state.inventory
        if (response.state.quests) this.quests = response.state.quests
        if (response.state.flags) this.flags = response.state.flags
        if (response.state.worldState) this.worldState = response.state.worldState
        if (response.state.npcRelations) this.npcRelations = response.state.npcRelations
        if (response.state.discoveredPlaces) this.discoveredPlaces = response.state.discoveredPlaces
        if (response.state.completedQuests) this.completedQuests = response.state.completedQuests
      }
    },

    toggleAI() {
      this.useAI = !this.useAI
    }
  }
})