import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  sendChat: vi.fn(),
  sendChatStream: vi.fn()
}))

import { sendChat, sendChatStream } from '../services/api'
import { runGenerationStreamTask, runGenerationTask } from '../services/generationService'

const sendChatMock = vi.mocked(sendChat)
const sendChatStreamMock = vi.mocked(sendChatStream)

describe('runGenerationTask', () => {
  beforeEach(() => {
    sendChatMock.mockReset()
    sendChatStreamMock.mockReset()
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
        promptVersion: expect.any(String),
        taskType: 'worldbook.extract'
      })
    )
  })

  it('passes task metadata through stream tasks', async () => {
    sendChatStreamMock.mockResolvedValueOnce({ content: 'streamed' })
    const callbacks = { onChunk: vi.fn() }

    const result = await runGenerationStreamTask({
      taskType: 'advisor.review',
      baseMessages: [{ role: 'user', content: 'review' }],
      settings: { model: 'demo' },
      generationOptions: { request_id: 'stream_task_req' },
      callbacks
    })

    expect(result.content).toBe('streamed')
    expect(sendChatStreamMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'review' }],
      null,
      null,
      { model: 'demo' },
      expect.objectContaining({
        request_id: 'stream_task_req',
        promptVersion: expect.any(String),
        attemptName: 'advisor.review.stream',
        taskType: 'advisor.review'
      }),
      callbacks
    )
  })
})
