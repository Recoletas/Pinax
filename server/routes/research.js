import express from 'express'
import { fetchWebResearchSources, runWebResearch } from '../services/webResearchService.js'

const router = express.Router()

router.post('/search', async (req, res) => {
  try {
    const result = await runWebResearch(req.body || {})
    res.json(result)
  } catch (error) {
    const status = Number(error?.status) || 500
    res.status(status).json({
      code: error?.code || 'SEARCH_FAILED',
      error: error?.message || '联网检索失败'
    })
  }
})

router.post('/fetch', async (req, res) => {
  try {
    const result = await fetchWebResearchSources(req.body || {})
    res.json(result)
  } catch (error) {
    const status = Number(error?.status) || 500
    res.status(status).json({
      code: error?.code || 'RESEARCH_FETCH_FAILED',
      error: error?.message || '来源正文抓取失败'
    })
  }
})

export default router
