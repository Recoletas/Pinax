import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getResolvedApiSettings: vi.fn()
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn()
}))

import { getResolvedApiSettings } from '../services/api'
import { runGenerationTask } from '../services/generationService'
import { expandText } from '../services/textExpander'
import { rewriteText } from '../services/textRewriter'

const getResolvedApiSettingsMock = vi.mocked(getResolvedApiSettings)
const runGenerationTaskMock = vi.mocked(runGenerationTask)

describe('text generation services', () => {
  beforeEach(() => {
    getResolvedApiSettingsMock.mockReset()
    runGenerationTaskMock.mockReset()
  })

  it('routes text expansion through generationService', async () => {
    getResolvedApiSettingsMock.mockResolvedValue({ baseUrl: 'x', apiKey: 'y' })
    runGenerationTaskMock.mockResolvedValue({
      success: true,
      content: 'expanded text'
    })

    const result = await expandText('原文', { targetLength: 2 })

    expect(result.success).toBe(true)
    expect(runGenerationTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'writing.expand',
      baseMessages: expect.any(Array)
    }))
  })

  it('routes text rewrite through generationService', async () => {
    getResolvedApiSettingsMock.mockResolvedValue({ baseUrl: 'x', apiKey: 'y' })
    runGenerationTaskMock.mockResolvedValue({
      success: true,
      content: 'rewritten text'
    })

    const result = await rewriteText('原文', { mode: 'style' })

    expect(result.success).toBe(true)
    expect(runGenerationTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'writing.rewrite',
      baseMessages: expect.any(Array)
    }))
  })
})
