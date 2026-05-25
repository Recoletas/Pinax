import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  sendChat: vi.fn()
}))

import { sendChat } from '../services/api'
import { runGenerationTask } from '../services/generationService'

const sendChatMock = vi.mocked(sendChat)

describe('runGenerationTask', () => {
  beforeEach(() => {
    sendChatMock.mockReset()
  })

  it('passes task metadata and resolves successful attempts', async () => {
    sendChatMock.mockResolvedValueOnce({ content: '{"ok":true}' })

    const result = await runGenerationTask({
      taskType: 'worldbook.extract',
      baseMessages: [{ role: 'user', content: 'text' }],
      settings: { model: 'demo' },
      generationOptions: { request_id: 'task_req' },
      parseContent: (content) => JSON.parse(content),
      isValidParsed: (parsed) => parsed?.ok === true
    })

    expect(result.success).toBe(true)
    expect(result.taskType).toBe('worldbook.extract')
    expect(sendChatMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'text' }],
      null,
      null,
      { model: 'demo' },
      expect.objectContaining({
        retryCount: 0,
        request_id: 'task_req_a0',
        taskType: 'worldbook.extract'
      })
    )
  })
})
