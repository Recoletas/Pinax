import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export async function getWorlds() {
  const response = await api.get('/config/worlds')
  return response.data.worlds || []
}

export async function getWorld(worldId) {
  const response = await api.get(`/config/worlds/${worldId}`)
  return response.data
}

export async function startGame(worldId) {
  const response = await api.post('/game/start', { worldId })
  return response.data
}

export async function sendAction(gameId, action, isStart = false) {
  if (isStart) {
    const response = await api.post('/game/start', { worldId: action })
    return response.data
  }
  const response = await api.post('/game/action', { gameId, action })
  return response.data
}

export async function getState(gameId) {
  const response = await api.get(`/game/state/${gameId}`)
  return response.data
}

export async function sendChat(messages, character = null, worldId = null, apiSettings = null) {
  const response = await api.post('/chat/chat', { messages, character, worldId, ...apiSettings })
  return response.data
}

export async function getApiSettings() {
  const response = await api.post('/chat/secrets/read')
  return response.data
}

export async function saveApiSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    await api.post('/chat/secrets/write', { key, value })
  }
}

export async function getEventCategories() {
  const response = await api.get('/events/categories')
  return response.data.categories || []
}

export async function getEvents(category) {
  const response = await api.get(`/events/${category}`)
  return response.data
}