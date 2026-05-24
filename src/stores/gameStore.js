import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, buildContextMessage, sendChatStream, recordMemory } from '../services/api'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { useWorldStore } from './worldStore'

const DEFAULT_WORLD_MAP_STATE = {
  map: { countries: [] },
  currentCountry: '',
  currentCity: '',
  currentScene: ''
}

const DEFAULT_WRITING_CHARACTER = {
  name: 'User',
  gender: '',
  age: '',
  traits: [],
  mood: 50,
  description: '',
  goal: ''
}

const DEFAULT_WRITING_TIME = {
  eraId: 'custom',
  eraName: '',
  year: '',
  month: '',
  day: ''
}

function normalizeWorldMapState(raw = {}) {
  const map = raw && typeof raw.map === 'object' ? raw.map : { countries: [] }
  return {
    map: {
      ...map,
      countries: Array.isArray(map.countries) ? map.countries : []
    },
    currentCountry: raw?.currentCountry || '',
    currentCity: raw?.currentCity || '',
    currentScene: raw?.currentScene || ''
  }
}

function normalizeWritingCharacter(raw = {}) {
  return {
    ...DEFAULT_WRITING_CHARACTER,
    ...(raw && typeof raw === 'object' ? raw : {}),
    traits: Array.isArray(raw?.traits) ? raw.traits : []
  }
}

function normalizeWritingTime(raw = {}) {
  return {
    ...DEFAULT_WRITING_TIME,
    ...(raw && typeof raw === 'object' ? raw : {})
  }
}

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
    worldMapState: normalizeWorldMapState(DEFAULT_WORLD_MAP_STATE),
    writingCharacter: normalizeWritingCharacter(DEFAULT_WRITING_CHARACTER),
    writingTime: normalizeWritingTime(DEFAULT_WRITING_TIME),
    activities: [],
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
    dialogueCharacters: [],    // 已保存的角色列表
    quickNoteImportMode: false,
    quickNoteSelectedMessageIndexes: [],

    // 机制触发状态
    activeMechanism: null,     // 当前激活的机制面板: 'combat' | 'trade' | 'quest' | 'dialogue' | null
    mechanismContext: null,    // 机制面板的上下文数据
    milestoneEvent: null,      // 里程碑事件：{ type: 'location-unlock' | 'time-skip' | 'character-appearance', data: {...} }

    // 内联标记事件（不自动弹窗，点击查看）
    inlineEvents: []           // [{ type, text, data, messageId }]
  }),

  actions: {
    loadWorldMapState() {
      const raw = getItem(STORAGE_KEYS.WRITING_WORLDMAP)
      this.worldMapState = normalizeWorldMapState(raw || {})
    },

    saveWorldMapState(nextState) {
      const normalized = normalizeWorldMapState(nextState || this.worldMapState)
      this.worldMapState = normalized
      setItem(STORAGE_KEYS.WRITING_WORLDMAP, normalized)
    },

    loadWritingCharacter() {
      const raw = getItem(STORAGE_KEYS.WRITING_CHARACTER)
      const normalized = normalizeWritingCharacter(raw || {})
      this.writingCharacter = normalized
      this.playerCharacter = {
        ...this.playerCharacter,
        name: normalized.name || this.playerCharacter.name,
        gender: normalized.gender || this.playerCharacter.gender,
        age: normalized.age || this.playerCharacter.age
      }
    },

    saveWritingCharacter(nextCharacter) {
      const normalized = normalizeWritingCharacter(nextCharacter || this.writingCharacter)
      this.writingCharacter = normalized
      this.playerCharacter = {
        ...this.playerCharacter,
        name: normalized.name || this.playerCharacter.name,
        gender: normalized.gender || this.playerCharacter.gender,
        age: normalized.age || this.playerCharacter.age
      }
      setItem(STORAGE_KEYS.WRITING_CHARACTER, normalized)
    },

    loadWritingTime() {
      const raw = getItem(STORAGE_KEYS.WRITING_TIME)
      this.writingTime = normalizeWritingTime(raw || {})
    },

    saveWritingTime(nextTime) {
      const normalized = normalizeWritingTime(nextTime || this.writingTime)
      this.writingTime = normalized
      setItem(STORAGE_KEYS.WRITING_TIME, normalized)
    },

    loadWritingActivities() {
      const raw = getItem(STORAGE_KEYS.WRITING_ACTIVITIES)
      this.activities = Array.isArray(raw) ? raw : []
    },

    saveWritingActivities(nextActivities) {
      const normalized = Array.isArray(nextActivities) ? nextActivities : this.activities
      this.activities = normalized
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES, normalized)
    },

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

    // --- 机制触发系统 ---
    detectMechanismTriggers(content) {
      if (!content || typeof content !== 'string') return null

      // 更严格的触发条件：需要明确的场景描述
      const triggers = {
        combat: {
          patterns: [
            /战斗[开始爆发即将]/,
            /拔[出剑].*迎战/,
            /敌人.*攻击/,
            /挥剑.*冲向/,
            /陷入.*苦战/
          ],
          excludePatterns: [
            /想起.*战斗/,
            /回忆.*战斗/,
            /听说.*战斗/,
            /关于.*战斗/
          ]
        },
        trade: {
          patterns: [
            /商店.*老板/,
            /摊位.*摆满/,
            /商人.*问道/,
            /购买.*商品/,
            /交易.*完成/
          ],
          excludePatterns: [
            /听说.*交易/,
            /回忆.*交易/
          ]
        },
        quest: {
          patterns: [
            /任务目标[是为]/,
            /委托[你你去]/,
            /悬赏.*公告/,
            /接受.*任务/
          ],
          excludePatterns: []
        },
        dialogue: {
          patterns: [
            /"[^"]{5,}"/,  // 引号内至少5个字
            /「[^」]{5,}」/
          ],
          excludePatterns: []
        }
      }

      for (const [type, config] of Object.entries(triggers)) {
        const { patterns, excludePatterns } = config

        // 先检查排除模式
        for (const exclude of excludePatterns) {
          if (exclude.test(content)) {
            continue
          }
        }

        // 再检查触发模式
        for (const pattern of patterns) {
          const match = content.match(pattern)
          if (match) {
            // 额外检查：确保不是叙述性提及
            const beforeText = content.slice(0, match.index)
            const afterText = content.slice(match.index + match[0].length)

            // 如果前后有"回忆"、"想起"等词，跳过
            if (/(回忆|想起|听说|关于|曾经)/.test(beforeText.slice(-20))) {
              continue
            }

            return { type, match: match[0], context: match[1] || match[0] }
          }
        }
      }

      return null
    },

    activateMechanism(type, context = null) {
      const validTypes = ['combat', 'trade', 'quest', 'dialogue']
      if (!validTypes.includes(type)) return

      this.activeMechanism = type
      this.mechanismContext = context
    },

    deactivateMechanism() {
      this.activeMechanism = null
      this.mechanismContext = null
    },

    // --- 里程碑事件系统 ---
    detectMilestoneEvent(content, previousLocation = null) {
      if (!content || typeof content !== 'string') return null

      // 更严格的场景切换检测：需要明确的探索/发现意味
      const locationPatterns = [
        /首次进入(.+?)[，。！？]/,
        /发现[了](.+?)[，。！？]/,
        /踏入[从未到过]?[的]?(.+?)[，。！？]/,
        /抵达[了]([一这那][^，。！？]{2,10})[，。！？]/
      ]

      for (const pattern of locationPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const newLocation = match[1].trim()
          if (newLocation.length >= 2 && newLocation.length <= 20) {
            return {
              type: 'location-unlock',
              data: {
                location: newLocation,
                previousLocation,
                description: content.slice(0, 200)
              }
            }
          }
        }
      }

      // 不再自动检测角色登场 - 太容易误触发
      return null
    },

    // 内联事件检测（用于标记，不弹窗）
    detectInlineEvents(content, messageId) {
      if (!content || typeof content !== 'string') return []

      const events = []

      // 检测对话引号
      const dialogueMatches = content.matchAll(/"([^"]{3,})"|「([^」]{3,})」/g)
      for (const match of dialogueMatches) {
        const dialogueText = match[1] || match[2]
        if (dialogueText && dialogueText.length >= 3) {
          events.push({
            type: 'dialogue',
            text: match[0],
            data: { dialogue: dialogueText },
            messageId
          })
        }
      }

      // 检测重要物品
      const itemPatterns = [
        /获得[了]?(.+?道具|.+?武器|.+?装备|.+?物品)/,
        /发现[了]?(.+?道具|.+?武器|.+?装备|.+?物品)/
      ]
      for (const pattern of itemPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          events.push({
            type: 'item',
            text: match[0],
            data: { item: match[1].trim() },
            messageId
          })
          break
        }
      }

      return events
    },

    addInlineEvents(events) {
      if (!Array.isArray(events) || events.length === 0) return
      // 只保留最近消息的内联事件
      this.inlineEvents = events
    },

    clearInlineEvents() {
      this.inlineEvents = []
    },

    triggerMilestoneEvent(event) {
      if (!event || !event.type) return
      this.milestoneEvent = event
    },

    clearMilestoneEvent() {
      this.milestoneEvent = null
    },

    // --- 世界书注入系统 ---
    matchWorldBookEntries(recentMessages, scanDepth = 3) {
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook
      if (!worldbook || !worldbook.entries || worldbook.entries.length === 0) {
        return []
      }

      // 合并最近的消息作为扫描文本
      const messagesToScan = recentMessages.slice(-scanDepth)
      const scanText = messagesToScan.map(m => m.content || '').join('\n').toLowerCase()

      const matchedEntries = []

      for (const entry of worldbook.entries) {
        if (!entry || !entry.keys || entry.keys.length === 0) continue

        // 检查注入模式
        const mode = entry.injection?.mode || 'selective'
        if (mode === 'constant') {
          // 常驻条目始终注入
          matchedEntries.push(entry)
          continue
        }

        // 检查触发概率
        const probability = entry.injection?.probability ?? 100
        if (probability < 100 && Math.random() * 100 > probability) {
          continue
        }

        // 关键词匹配
        const keys = Array.isArray(entry.keys) ? entry.keys : [entry.keys]
        for (const key of keys) {
          const normalizedKey = String(key || '').toLowerCase().trim()
          if (normalizedKey && scanText.includes(normalizedKey)) {
            matchedEntries.push(entry)
            break
          }
        }

        // 检查次要关键词
        const secondaryKeys = entry.keysSecondary || []
        for (const key of secondaryKeys) {
          const normalizedKey = String(key || '').toLowerCase().trim()
          if (normalizedKey && scanText.includes(normalizedKey)) {
            if (!matchedEntries.includes(entry)) {
              matchedEntries.push(entry)
            }
            break
          }
        }
      }

      return matchedEntries
    },

    buildWorldBookContextMessage(entries, tokenBudget = 2000) {
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook

      if (!worldbook) return null
      if (!entries || entries.length === 0) return null

      const parts = []
      let currentLength = 0
      const maxChars = tokenBudget * 2

      // 添加世界书整体描述
      parts.push(`【世界书：${worldbook.name || '未命名世界书'}】`)

      // 世界设定描述（必须字段）
      const worldDesc = worldbook.worldDescription || worldbook.description || ''
      if (worldDesc.trim()) {
        const descText = `\n\n【世界设定】\n${worldDesc.trim()}`
        parts.push(descText)
        currentLength += descText.length
      }

      // 写作风格
      if (worldbook.writingStyle && worldbook.writingStyle.trim()) {
        const styleText = `\n\n【写作风格】\n${worldbook.writingStyle.trim()}`
        parts.push(styleText)
        currentLength += styleText.length
      }

      // 禁止内容
      if (worldbook.forbidden && worldbook.forbidden.trim()) {
        const forbiddenText = `\n\n【禁止内容】\n${worldbook.forbidden.trim()}`
        parts.push(forbiddenText)
        currentLength += forbiddenText.length
      }

      // 示例
      if (worldbook.examples && worldbook.examples.trim()) {
        const examplesText = `\n\n【示例文本】\n${worldbook.examples.trim()}`
        parts.push(examplesText)
        currentLength += examplesText.length
      }

      parts.push('\n\n--- 以下是世界书中的关键设定条目，必须在叙事中严格遵循 ---')

      for (const entry of entries) {
        const name = entry.name || '未命名条目'
        const content = entry.content || ''
        const type = entry.type || 'general'
        const entryText = `\n\n◆ 【${name}】(${type})\n${content}`

        if (currentLength + entryText.length > maxChars) {
          break
        }

        parts.push(entryText)
        currentLength += entryText.length
      }

      parts.push('\n\n⚠️ 重要约束：')
      parts.push('1. 上述设定中的名称、特征、关系必须保持一致，不得擅自更改')
      parts.push('2. 不得创造与设定矛盾的情节或角色')
      parts.push('3. 如果用户行为影响设定中的状态，合理反映变化')
      parts.push('4. 对话中涉及设定内容时，确保符合设定描述')
      if (worldbook.forbidden && worldbook.forbidden.trim()) {
        parts.push('5. 严格遵守禁止内容限制，不得出现相关内容')
      }

      return {
        role: 'system',
        content: parts.join('')
      }
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

    // --- 新增：核心”执行”功能 ---
    // 点击某条消息的”执行”按钮时调用
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

    // --- 新增：提取出来的 AI 生成逻辑（流式输出）---
    async generateAIResponse() {
      this.isLoading = true;
      try {
        this.loadApiSettings();

        // 匹配世界书条目
        const matchedEntries = this.matchWorldBookEntries(this.chatHistory, 3)
        const worldBookMsg = this.buildWorldBookContextMessage(matchedEntries, 2000)
        console.log('Matched world book entries:', matchedEntries.length, worldBookMsg?.content?.slice(0, 100))

        // 注入写作上下文（对话模式时传入对话角色）
        // 小说体验模式下排除时间信息，避免 AI 每次都强调时间
        const contextMsg = buildContextMessage(this.dialogueCharacter, { excludeTime: true })

        // 构建消息序列：世界书 + 写作上下文 + 聊天历史
        let messagesToSend = [...this.chatHistory]
        if (worldBookMsg) {
          messagesToSend = [worldBookMsg, ...messagesToSend]
        }
        if (contextMsg) {
          messagesToSend = [contextMsg, ...messagesToSend]
        }

        console.log('Messages to send:', messagesToSend.length, 'entries')

        // 先添加一个空的 AI 消息占位符
        const messageIndex = this.messages.length
        this.messages.push({
          role: 'assistant',
          name: this.dialogueCharacter?.name || this.aiCharacter.name,
          content: '',
          timestamp: Date.now(),
          dialogueMode: !!this.dialogueCharacter,
          isStreaming: true
        })

        // 使用流式 API
        let fullContent = ''

        await sendChatStream(
          messagesToSend,
          null,
          this.worldId,
          this.apiSettings,
          { max_tokens: 500 },
          {
            onChunk: (chunk) => {
              if (chunk.content) {
                fullContent += chunk.content
                // 实时更新消息内容
                if (this.messages[messageIndex]) {
                  this.messages[messageIndex].content = fullContent
                }
              }
            },
            onComplete: (result) => {
              // 标记流式结束
              if (this.messages[messageIndex]) {
                this.messages[messageIndex].isStreaming = false
              }
            },
            onError: (error) => {
              console.error('Stream error:', error)
              if (this.messages[messageIndex]) {
                this.messages[messageIndex].isStreaming = false
                this.messages[messageIndex].content = `生成出错：${error.message}`
              }
            }
          }
        )

        // 更新 chatHistory
        this.chatHistory.push({ role: 'assistant', content: fullContent });

        // 记录重要的叙事事件到记忆系统
        if (fullContent && fullContent.length > 20) {
          // 检测是否有重要事件（对话、物品获得、地点发现等）
          const hasDialogue = /"[^"]{5,}"|「[^」]{5,}」/.test(fullContent)
          const hasItem = /获得|发现.*物品|得到/.test(fullContent)
          const hasLocation = /首次进入|发现.*地方|抵达|踏入/.test(fullContent)

          if (hasDialogue || hasItem || hasLocation) {
            const eventType = hasLocation ? 'location_discovery' : hasItem ? 'item_acquisition' : 'dialogue'
            recordMemory(
              `小说体验事件：${fullContent.slice(0, 150)}...`,
              eventType,
              { character: this.playerCharacter?.name || '主角' }
            ).catch(() => {}) // 静默失败
          }
        }

        // 内联事件标记保留（对话、物品等可点击查看）
        const inlineEvents = this.detectInlineEvents(fullContent, messageIndex)
        if (inlineEvents.length > 0) {
          this.addInlineEvents(inlineEvents)
        }
      } catch (e) {
        console.error('AI Error:', e)
        this.lastError = e.message;
        this.messages.push({ role: 'system', content: `AI 错误：${e.message}`, timestamp: Date.now() });
      } finally {
        this.isLoading = false;
      }
    },

    async initGame() {
      this.loadWritingCharacter()
      this.loadWritingTime()
      this.loadWorldMapState()
      this.loadWritingActivities()
      this.isPlaying = true

      // 获取世界书结构化设定
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook

      // 构建系统提示词
      const systemParts = ['你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。']

      // 世界设定描述
      const worldDesc = worldbook?.worldDescription || worldbook?.description || ''
      if (worldDesc.trim()) {
        systemParts.push(`\n\n【世界设定】\n${worldDesc.trim()}`)
      }

      // 写作风格
      if (worldbook?.writingStyle?.trim()) {
        systemParts.push(`\n\n【写作风格】\n${worldbook.writingStyle.trim()}`)
      }

      // 禁止内容
      if (worldbook?.forbidden?.trim()) {
        systemParts.push(`\n\n【禁止内容】\n${worldbook.forbidden.trim()}`)
      }

      // 示例
      if (worldbook?.examples?.trim()) {
        systemParts.push(`\n\n【示例】\n${worldbook.examples.trim()}`)
      }

      // 添加约束
      systemParts.push('\n\n请在叙事中严格遵循上述设定。')

      const systemContent = systemParts.join('')

      this.messages = [{
        type: 'system',
        content: '游戏开始！你醒来发现自己身处陌生的地方...',
        timestamp: Date.now()
      }]
      this.chatHistory = [{
        role: 'system',
        content: systemContent
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