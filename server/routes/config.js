import express from 'express'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

router.get('/worlds', (req, res) => {
  const worldsPath = join(__dirname, '../data/worlds')

  if (!existsSync(worldsPath)) {
    return res.json({ worlds: [] })
  }

  const dirs = readdirSync(worldsPath).filter(d => {
    return existsSync(join(worldsPath, d, 'world.json'))
  })

  const worlds = dirs.map(dir => {
    try {
      const worldData = JSON.parse(
        readFileSync(join(worldsPath, dir, 'world.json'), 'utf-8')
      )
      return {
        id: dir,
        name: worldData.config?.name || dir,
        description: worldData.config?.description || '',
        tags: worldData.config?.tags || [],
        preview: worldData.config?.preview || ''
      }
    } catch (e) {
      return null
    }
  }).filter(Boolean)

  res.json({ worlds })
})

router.get('/worlds/:worldId', (req, res) => {
  const { worldId } = req.params
  const worldPath = join(__dirname, '../data/worlds', worldId, 'world.json')

  if (!existsSync(worldPath)) {
    return res.status(404).json({ error: 'World not found' })
  }

  try {
    const worldData = JSON.parse(readFileSync(worldPath, 'utf-8'))
    res.json(worldData)
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse world data' })
  }
})

export default router