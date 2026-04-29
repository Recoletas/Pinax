import { timeSystem, PERIODS } from './timeSystem.js'

export class EventEngine {
  constructor() {
    this.eventCategories = {
      time: { weight: 1.0, file: '时间类.json' },
      exploration: { weight: 1.0, file: '探索类.json' },
      combat: { weight: 1.0, file: '战斗类.json' },
      social: { weight: 0.9, file: '社交类.json' },
      survival: { weight: 0.9, file: '生存类.json' },
      skill: { weight: 0.8, file: '技能类.json' },
      random: { weight: 0.5, file: '随机类.json' },
      story: { weight: 1.0, file: '剧情类.json' }
    }
  }

  async triggerEvent(state, input, worldData) {
    const input_lower = input.toLowerCase()
    const results = []

    results.push(...this.checkTimeKeywords(state, input_lower, worldData))
    results.push(...this.checkExplorationKeywords(state, input_lower, worldData))
    results.push(...this.checkCombatKeywords(state, input_lower, worldData))
    results.push(...this.checkSocialKeywords(state, input_lower, worldData))
    results.push(...this.checkSystemKeywords(input_lower, worldData))
    results.push(...this.checkRandomEncounters(state, worldData))

    if (results.length === 0) {
      results.push({
        type: 'narration',
        category: 'free_action',
        description: this.generateFreeActionNarrative(input, state, worldData)
      })
    }

    return results
  }

  checkTimeKeywords(state, input, worldData) {
    const timeKeywords = ['时间流转', '时间快进', '等待', '休息', '睡一晚', '睡一觉', '跳过时间']
    const results = []

    for (const keyword of timeKeywords) {
      if (input.includes(keyword)) {
        const events = timeSystem.advance(state, keyword.includes('睡') ? 4 : 1)

        if (keyword.includes('睡')) {
          state.player.vitality = state.player.maxVitality
          results.push({
            type: 'time_advance',
            category: 'time',
            keyword,
            description: '你找了个地方休息，夜幕过去，黎明到来。你的精力完全恢复了。',
            timeAdvance: true
          })
        } else {
          results.push({
            type: 'time_advance',
            category: 'time',
            keyword,
            description: `时间流逝... ${timeSystem.getTimeDescription(state)}`,
            timeAdvance: true
          })
        }
        break
      }
    }

    return results
  }

  checkExplorationKeywords(state, input, worldData) {
    const explorationKeywords = ['探索', '调查', '搜索', '仔细看看', '查看', '检查', '寻找']
    const results = []

    for (const keyword of explorationKeywords) {
      if (input.includes(keyword)) {
        const location = this.getCurrentLocation(state, worldData)
        const explorationEvents = location?.events?.filter(e => e.category === 'exploration') || []
        const randomEvent = explorationEvents.length > 0
          ? explorationEvents[Math.floor(Math.random() * explorationEvents.length)]
          : this.generateExplorationResult(state, location, worldData)

        results.push({
          type: 'exploration',
          category: 'exploration',
          keyword,
          description: randomEvent.description || `你在${location?.name || '当前位置'}探索，发现了一些有趣的东西...`,
          findings: randomEvent.findings || []
        })
        break
      }
    }

    return results
  }

  checkCombatKeywords(state, input, worldData) {
    const combatKeywords = ['战斗', '攻击', '打架', '开战', '打怪', '杀怪']
    const results = []

    for (const keyword of combatKeywords) {
      if (input.includes(keyword)) {
        const enemies = worldData.enemies || []
        const enemy = enemies[Math.floor(Math.random() * enemies.length)] || {
          name: '野狼',
          description: '一只凶猛的野狼出现在你面前！'
        }

        results.push({
          type: 'combat_start',
          category: 'combat',
          keyword,
          enemy,
          description: enemy.description,
          choices: [
            { text: '正面战斗', action: 'combat_attack' },
            { text: '尝试逃跑', action: 'combat_flee' },
            { text: '使用道具', action: 'combat_item' }
          ]
        })
        break
      }
    }

    return results
  }

  checkSocialKeywords(state, input, worldData) {
    const socialKeywords = ['交谈', '对话', '聊聊', '打听', '交易', '买卖', '购买', '出售']
    const results = []

    for (const keyword of socialKeywords) {
      if (input.includes(keyword)) {
        const npcs = worldData.npcs || []
        const nearbyNPC = npcs.find(npc => this.isNPCNearby(state, npc))

        if (nearbyNPC) {
          results.push({
            type: 'social',
            category: 'social',
            keyword,
            npc: nearbyNPC,
            description: nearbyNPC.dialogue?.default || `${nearbyNPC.name}看向你，似乎有话要说。`,
            choices: this.buildNPCChoices(nearbyNPC, keyword)
          })
        } else {
          results.push({
            type: 'social',
            category: 'social',
            keyword,
            description: '附近没有可以交谈的人。'
          })
        }
        break
      }
    }

    return results
  }

  checkSystemKeywords(input, worldData) {
    const systemKeywords = {
      '状态': () => ({ type: 'system', category: 'status', description: 'status_display' }),
      '背包': () => ({ type: 'system', category: 'inventory', description: 'inventory_display' }),
      '帮助': () => ({ type: 'system', category: 'help', description: this.getHelpText() }),
      '历史': () => ({ type: 'system', category: 'history', description: 'history_display' }),
      '地图': () => ({ type: 'system', category: 'map', description: 'map_display' }),
      '回忆': () => ({ type: 'system', category: 'recall', description: 'recall_display' })
    }

    for (const [keyword, handler] of Object.entries(systemKeywords)) {
      if (input.includes(keyword)) {
        return [handler()]
      }
    }

    return []
  }

  checkRandomEncounters(state, worldData) {
    const encounters = worldData.randomEncounters || []
    const results = []

    for (const encounter of encounters) {
      if (this.shouldTriggerEncounter(state, encounter)) {
        results.push({
          type: 'random_encounter',
          category: 'random',
          encounter,
          description: encounter.description,
          choices: encounter.choices || []
        })
        break
      }
    }

    return results
  }

  shouldTriggerEncounter(state, encounter) {
    if (!encounter.conditions) return Math.random() < (encounter.chance || 0.1)

    const { timePeriod, location, minDay } = encounter.conditions

    if (timePeriod && !timePeriod.includes(state.time.period)) return false
    if (location && state.worldState.currentLocation !== location) return false
    if (minDay && state.time.day < minDay) return false

    return Math.random() < (encounter.chance || 0.1)
  }

  generateFreeActionNarrative(input, state, worldData) {
    const narratives = [
      `你尝试${input}，但似乎没有什么特别的事情发生。`,
      `你朝着${input}的方向走去，周围的环境在慢慢变化。`,
      `你专注于${input}，周围的声音渐渐远去...`,
      `你的行动引起了一些变化，世界在悄然响应...`
    ]
    return narratives[Math.floor(Math.random() * narratives.length)]
  }

  generateExplorationResult(state, location, worldData) {
    const findings = [
      { type: 'item', name: '碎银', description: '地上散落着一些银两' },
      { type: 'item', name: '草药', description: '一株有用的草药' },
      { type: 'nothing', description: '经过仔细搜索，没有发现特别的东西' },
      { type: 'clue', description: '地上有一些奇怪的痕迹，似乎有人来过这里' }
    ]
    const finding = findings[Math.floor(Math.random() * findings.length)]
    return finding
  }

  getCurrentLocation(state, worldData) {
    const currentLoc = state.worldState.currentLocation || '新手村'
    const locations = worldData.locations || {}
    return locations[currentLoc]
  }

  isNPCNearby(state, npc) {
    const currentLoc = state.worldState.currentLocation || '新手村'
    return npc.location?.includes(currentLoc) || npc.location === currentLoc
  }

  buildNPCChoices(npc, keyword) {
    const choices = [{ text: '询问近况', action: 'npc_talk' }]

    if (keyword === '交易' || keyword === '买卖' || keyword === '购买') {
      if (npc.shop) {
        choices.push({ text: '查看商品', action: 'npc_shop' })
      }
    }

    choices.push({ text: '打听消息', action: 'npc_gossip' })
    choices.push({ text: '礼貌告辞', action: 'npc_leave' })

    return choices
  }

  getHelpText() {
    return `【可用指令】

【时间类】
- 时间流转/等待：推进游戏时间
- 休息/睡一晚：恢复精力并推进到第二天

【行动类】
- 探索/调查(地点)：搜索当前区域
- 战斗/攻击：进入战斗
- 交易/买卖：与商人交易

【系统类】
- 状态：查看角色状态
- 背包：查看物品栏
- 地图：查看世界地图
- 帮助：显示此信息`
  }
}

export const eventEngine = new EventEngine()