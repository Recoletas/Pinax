import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, sendChat, buildContextMessage } from '../services/api'

export const useGameStore = defineStore('game', {
  state: () => ({
    gameId: null,
    worldId: null,
    genre: 'novel', // 'novel' | 'poetry'
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
    },

    // 对话模式
    dialogueMode: false,       // 是否开启对话模式
    dialogueCharacter: null,   // 当前对话角色
    dialogueCharacters: []     // 已保存的角色列表
  }),

  actions: {
    // --- 压缩上下文：精简聊天历史，减少 token 用量 ---
    async compressContext() {
      if (this.chatHistory.length <= 4) return { compressed: false, reason: '历史过短，无需压缩' }

      // 保留：系统提示 + 最近 4 条消息
      const systemPrompt = this.chatHistory[0]?.role === 'system' ? this.chatHistory[0] : null
      const recentMessages = this.chatHistory.slice(-4)
      const oldMessages = this.chatHistory.slice(systemPrompt ? 1 : 0, -4)

      if (oldMessages.length === 0) return { compressed: false, reason: '无可压缩的历史' }

      // 生成摘要
      const summary = this.summarizeMessages(oldMessages)

      // 构建精简后的历史
      const newHistory = systemPrompt
        ? [systemPrompt, { role: 'system', content: `【上下文摘要】${summary}` }, ...recentMessages]
        : [{ role: 'system', content: `【上下文摘要】${summary}` }, ...recentMessages]

      this.chatHistory = newHistory

      return {
        compressed: true,
        oldCount: oldMessages.length,
        newCount: newHistory.length,
        summary
      }
    },

    // 简单摘要：提取各角色的主要行动/对话
    summarizeMessages(messages) {
      const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content)
      const aiMsgs = messages.filter(m => m.role === 'assistant').map(m => m.content)

      const summarize = (msgs, maxLen = 60) => {
        if (msgs.length === 0) return '无'
        const combined = msgs.join('；').replace(/\n/g, ' ')
        return combined.length > maxLen ? combined.slice(0, maxLen) + '…' : combined
      }

      const userSummary = summarize(userMsgs)
      const aiSummary = summarize(aiMsgs)

      return `用户进行 ${userMsgs.length} 次行动，主要：${userSummary}；AI 描述了 ${aiMsgs.length} 次叙事，主要：${aiSummary}`
    },

    // --- 对话模式 ---
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

        // 注入写作上下文（对话模式时传入对话角色）
        const contextMsg = buildContextMessage(this.dialogueCharacter)
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
          name: this.dialogueCharacter?.name || this.aiCharacter.name,
          content: response.content,
          reasoning_content: response.reasoning_content || null,
          timestamp: Date.now(),
          dialogueMode: !!this.dialogueCharacter
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