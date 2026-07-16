import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import gameRouter from './routes/game.js'
import eventsRouter from './routes/events.js'
import configRouter from './routes/config.js'
import chatRouter from './routes/chat.js'
import generateRouter from './routes/generate.js'
import preferencesRouter from './routes/preferences.js'
import advisorRouter from './routes/advisor.js'
import openclawRouter from './routes/openclaw.js'
import roomsRouter from './routes/rooms.js'
import { setupWebSocket } from './realtime/wsHandler.js'
import { startCleanupInterval, stopCleanupInterval } from './realtime/RoomRegistry.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

process.on('uncaughtException', (error) => {
  console.error('[Server] uncaughtException:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Server] unhandledRejection:', reason)
})

process.on('SIGTERM', () => {
  console.warn('[Server] received SIGTERM, shutting down')
  stopCleanupInterval()
})

process.on('SIGINT', () => {
  console.warn('[Server] received SIGINT, shutting down')
  stopCleanupInterval()
})

app.use(cors())
app.use(express.json())

app.use(roomsRouter)
app.use('/api/game', gameRouter)
app.use('/api/events', eventsRouter)
app.use('/api/config', configRouter)
app.use('/api/chat', chatRouter)
app.use('/api/generate', generateRouter)
app.use('/api/preferences', preferencesRouter)
app.use('/api/advisor', advisorRouter)
app.use('/api/openclaw', openclawRouter)

app.use(express.static(join(__dirname, '../dist')))

// SPA fallback for Vue Router history mode — must come after /api routes
app.use(/^\/(?!api\/|ws\/).*/, (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'))
})

const server = createServer(app)

const wss = new WebSocketServer({ noServer: true })
setupWebSocket(wss)

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname.startsWith('/ws/rooms')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

startCleanupInterval()

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

export { app, server, wss }
