import express from 'express'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { stateManager } from '../services/stateManager.js'
import { eventEngine } from '../services/eventEngine.js'
import { timeSystem } from '../services/timeSystem.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

function loadWorldData(worldId) {
  const worldPath = join(__dirname, '../data/worlds', worldId, 'world.json')
  if (!existsSync(worldPath)) return null

  try {
    return JSON.parse(readFileSync(worldPath, 'utf-8'))
  } catch (e) {
    console.error('Error loading world:', e)
    return null
  }
}

router.post('/start', (req, res) => {
  const { worldId } = req.body

  if (!worldId) {
    return res.status(400).json({ error: 'worldId is required' })
  }

  const worldData = loadWorldData(worldId)
  if (!worldData) {
    return res.status(404).json({ error: 'World not found' })
  }

  const state = stateManager.createGame(worldId, worldData)
  state.worldState.currentLocation = worldData.config?.defaultLocation || '新手村'

  res.json({
    success: true,
    gameId: state.id,
    world: worldData,
    state: summarizeState(state)
  })
})

router.get('/state/:gameId', (req, res) => {
  const { gameId } = req.params
  const state = stateManager.getGame(gameId)

  if (!state) {
    return res.status(404).json({ error: 'Game not found' })
  }

  res.json(summarizeState(state))
})

router.post('/action', async (req, res) => {
  const { gameId, action } = req.body

  if (!gameId || !action) {
    return res.status(400).json({ error: 'gameId and action are required' })
  }

  const state = stateManager.getGame(gameId)
  if (!state) {
    return res.status(404).json({ error: 'Game not found' })
  }

  const worldData = loadWorldData(state.worldId)
  if (!worldData) {
    return res.status(404).json({ error: 'World data not found' })
  }

  state.actionCount++

  state.chatHistory.push({
    role: 'user',
    content: action
  })

  const events = await eventEngine.triggerEvent(state, action, worldData)

  for (const event of events) {
    if (event.type === 'time_advance' && event.timeAdvance) {
      continue
    }
  }

  const response = {
    events,
    state: summarizeState(state),
    timeDescription: timeSystem.getTimeDescription(state)
  }

  if (timeSystem.shouldAutoAdvance(state)) {
    timeSystem.advance(state, 1)
    response.timeAdvanced = true
    response.timeDescription = timeSystem.getTimeDescription(state)
  }

  state.chatHistory.push({
    role: 'assistant',
    content: events.map(e => e.description).join('\n')
  })

  res.json(response)
})

function summarizeState(state) {
  return {
    time: state.time,
    player: state.player,
    inventory: state.inventory,
    quests: state.quests,
    flags: state.flags,
    worldState: state.worldState,
    npcRelations: state.npcRelations,
    discoveredPlaces: state.discoveredPlaces,
    completedQuests: state.completedQuests,
    actionCount: state.actionCount
  }
}

export default router