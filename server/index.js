import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import gameRouter from './routes/game.js'
import eventsRouter from './routes/events.js'
import configRouter from './routes/config.js'
import chatRouter from './routes/chat.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/game', gameRouter)
app.use('/api/events', eventsRouter)
app.use('/api/config', configRouter)
app.use('/api/chat', chatRouter)

app.use(express.static(join(__dirname, '../public')))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})