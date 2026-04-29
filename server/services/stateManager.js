class StateManager {
  constructor() {
    this.games = new Map()
  }

  createGame(worldId, worldData) {
    const gameId = Date.now().toString(36)
    const state = {
      id: gameId,
      worldId,
      time: { day: 1, period: '早晨', periodIndex: 2 },
      player: {
        vitality: 100,
        maxVitality: 100,
        mood: 80,
        maxMood: 100,
        money: worldData.config?.starterMoney || 100,
        level: 1,
        exp: 0
      },
      inventory: [],
      quests: [],
      flags: {},
      worldState: {},
      npcRelations: {},
      discoveredPlaces: [],
      completedQuests: [],
      actionCount: 0,
      chatHistory: [],
      activeEvents: []
    }
    this.games.set(gameId, state)
    return state
  }

  getGame(gameId) {
    return this.games.get(gameId)
  }

  updateGame(gameId, updater) {
    const game = this.games.get(gameId)
    if (!game) return null
    const updated = updater(game)
    this.games.set(gameId, updated)
    return updated
  }

  deleteGame(gameId) {
    this.games.delete(gameId)
  }
}

export const stateManager = new StateManager()