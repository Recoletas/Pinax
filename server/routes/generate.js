import express from 'express'
import { handleGenerateRequest } from './chat.js'
import { handleGenerationAgentStepStream } from './generationAgent.js'
import { handleStructuredGeneration } from '../services/structuredGenerationRunner.js'

const router = express.Router()

router.post('/agent-step/stream', handleGenerationAgentStepStream)
router.post('/structured', handleStructuredGeneration)
router.post('/', handleGenerateRequest)

export default router
