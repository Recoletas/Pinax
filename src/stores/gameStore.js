import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, sendChat } from '../services/api'

export const useGameStore = defineStore('game', {
  state: () => ({
    gameId: null,
    worldId: null,
    isPlaying: false,
    messages: [],
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
    chatHistory: [],
    useAI: false,
    apiSettings: {
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
      model: ''
    }
  }),

  actions: {
    loadApiSettings() {
      const saved = localStorage.getItem('apiSettings')
      if (saved) {
        this.apiSettings = JSON.parse(saved)
      }
    },

    async initGame() {
      this.isPlaying = true
      this.messages = [{
        type: 'system',
        content: '游戏开始！你醒来发现自己身处陌生的地方...'
      }]
      this.chatHistory = [{
        role: 'system',
        content: '你是一个文字冒险游戏的玩家。'
      }]
    },

    async startGame(worldId) {
      this.isLoading = true
      try {
        const response = await apiSendAction(null, worldId, true)
        this.gameId = response.gameId
        this.worldId = worldId
        this.isPlaying = true
        this.messages = [{
          type: 'system',
          content: `欢迎来到${response.world?.config?.name || '这个世界'}！游戏开始。`
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

      this.messages.push({
        type: 'user',
        content: text
      })

      this.chatHistory.push({
        role: 'user',
        content: text
      })

      this.isLoading = true
      try {
        if (this.useAI) {
          // Load API settings from localStorage before sending
          this.loadApiSettings()

          const response = await sendChat(
            this.chatHistory,
            null,
            this.worldId,
            this.apiSettings
          )
          const aiContent = response.content

          this.messages.push({
            type: 'narrator',
            content: aiContent
          })

          this.chatHistory.push({
            role: 'assistant',
            content: aiContent
          })
        } else {
          const response = await apiSendAction(this.gameId, text)
          this.updateState(response)

          if (response.events) {
            for (const event of response.events) {
              if (event.type !== 'system' && event.type !== 'time_advance') {
                this.messages.push({
                  type: 'narrator',
                  category: event.category,
                  content: event.description,
                  choices: event.choices
                })
              }
            }
          }

          if (response.timeAdvanced) {
            this.messages.push({
              type: 'system',
              content: `时间已推进：${response.timeDescription}`
            })
          }
        }
      } catch (e) {
        this.lastError = e.message
        this.messages.push({
          type: 'system',
          content: `发生错误：${e.message}`
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