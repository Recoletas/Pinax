import express from 'express'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

router.get('/categories', (req, res) => {
  const eventsPath = join(__dirname, '../data/events')
  if (!existsSync(eventsPath)) {
    return res.json({ categories: [] })
  }

  const files = readdirSync(eventsPath).filter(f => f.endsWith('.json'))
  const categories = files.map(f => ({
    id: f.replace('.json', ''),
    name: f.replace('.json', '').replace(/([A-Z])/g, ' $1').trim()
  }))

  res.json({ categories })
})

router.get('/:category', (req, res) => {
  const { category } = req.params
  const eventPath = join(__dirname, '../data/events', `${category}.json`)

  if (!existsSync(eventPath)) {
    return res.status(404).json({ error: 'Category not found' })
  }

  try {
    const events = JSON.parse(readFileSync(eventPath, 'utf-8'))
    res.json(events)
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse events' })
  }
})

export default router