import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, sendChat, buildContextMessage } from '../services/api'

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
    playerCharacter: {
      name: 'User', // 默认名，用户可以改
      avatar: ''    // 玩家头像
    },
    
    // AI 扮演的角色
    aiCharacter: {
      name: 'Assistant', // 默认名，导入后会变
      avatar: ''
    }
  }),

  actions: {
     async sendAction(text) {
      if (!text.trim()) return

      this.messages.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
      })
      this.chatHistory.push({ role: 'user', content: text })

      if (this.useAI) {
        await this.generateAIResponse()
      } else {
        this.isLoading = true
        try {
          const response = await apiSendAction(this.gameId, text)
          this.updateState(response)
          if (response.events) {
            for (const event of response.events) {
              if (event.type !== 'system' && event.type !== 'time_advance') {
                this.messages.push({
                  role: 'assistant',
                  content: event.description,
                  timestamp: Date.now()
                })
              }
            }
          }
          if (response.timeAdvanced) {
            this.messages.push({
              role: 'system',
              content: `时间已推进：${response.timeDescription}`,
              timestamp: Date.now()
            })
          }
        } catch (e) {
          this.lastError = e.message
          this.messages.push({ role: 'system', content: `错误：${e.message}`, timestamp: Date.now() })
        } finally {
          this.isLoading = false
        }
      }
    },

    // --- 修改：更新消息后同步记忆 ---
    updateMessage(index, newContent) {
      if (this.messages[index]) {
        this.messages[index].content = newContent;
        this.rebuildChatHistory(); // 同步 AI 记忆
      }
    },

    // --- 修改：删除消息后同步记忆 ---
    deleteMessage(index) {
      if (this.messages[index]) {
        this.messages.splice(index, 1);
        this.rebuildChatHistory(); // 同步 AI 记忆
      }
    },

    // --- 新增：核心“执行”功能 ---
    // 点击某条消息的“执行”按钮时调用
    async regenerateFrom(index) {
      // 1. 截断消息列表，只保留到当前点击的这一条
      this.messages = this.messages.slice(0, index + 1);
      
      // 2. 重新构建 AI 记忆
      this.rebuildChatHistory();

      // 3. 如果开启了 AI，立即触发重新生成
      if (this.useAI) {
        await this.generateAIResponse();
      }
    },

    // --- 新增：辅助方法，确保界面和 AI 记忆完全一致 ---
    rebuildChatHistory() {
      // 保持最开始的系统提示词（如果有的话）
      const systemPrompt = this.chatHistory[0] || {
        role: 'system',
        content: '你是一个文字冒险游戏的叙述者，请用生动的语言描述场景并与玩家互动。'
      };

      // 将当前的 messages 转换为 chatHistory
      const history = this.messages
        .filter(m => m.type === 'user' || m.type === 'narrator')
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      this.chatHistory = [systemPrompt, ...history];
    },

    // --- 新增：提取出来的 AI 生成逻辑 ---
    async generateAIResponse() {
      this.isLoading = true;
      try {
        this.loadApiSettings();

        // 注入写作上下文
        const contextMsg = buildContextMessage()
        console.log('Context message:', contextMsg)
        const messagesToSend = contextMsg
          ? [contextMsg, ...this.chatHistory]
          : this.chatHistory
        console.log('Messages to send:', messagesToSend)

        const response = await sendChat(messagesToSend, null, this.worldId, this.apiSettings);
        console.log('AI response:', response)

        // 添加 AI 回复
        this.messages.push({
          role: 'assistant',
          name: this.aiCharacter.name,
          content: response.content,
          reasoning_content: response.reasoning_content || null,
          timestamp: Date.now()
        })

        this.chatHistory.push({ role: 'assistant', content: response.content });
      } catch (e) {
        console.error('AI Error:', e)
        this.lastError = e.message;
        this.messages.push({ role: 'system', content: `AI 错误：${e.message}`, timestamp: Date.now() });
      } finally {
        this.isLoading = false;
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

    updateState(response) {
      // ... 保持不变 ...
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
      if (this.useAI) {
        this.loadApiSettings()
      }
    },

    loadApiSettings() {
      const saved = localStorage.getItem('apiSettings')
      if (saved) {
        this.apiSettings = { ...this.apiSettings, ...JSON.parse(saved) }
      }
    }
  }
})