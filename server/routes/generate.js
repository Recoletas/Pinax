import express from 'express'
import { handleGenerateRequest } from './chat.js'

const router = express.Router()

router.post('/', handleGenerateRequest)

export default router
