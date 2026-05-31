import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  sendChat: vi.fn()
}))

import { sendChat } from '../services/api'
import { runGenerationRetryPlan } from '../services/generationRetry'

const sendChatMock = vi.mocked(sendChat)

describe('runGenerationRetryPlan', () => {
  beforeEach(() => {
    sendChatMock.mockReset()
  })

  it('throws when baseMessages is empty', async () => {
    await expect(runGenerationRetryPlan({ baseMessages: [] }))
      .rejects
      .toThrow('runGenerationRetryPlan requires non-empty baseMessages')
  })

  it('succeeds on first attempt and passes retry metadata', async () => {
    const baseMessages = [{ role: 'user', content: 'hello' }]
    const settings = { model: 'demo-model' }

    sendChatMock.mockResolvedValueOnce({ content: '{"ok":true}' })

    const result = await runGenerationRetryPlan({
      baseMessages,
      settings,
      generationOptions: { request_id: 'req_abc' },
      parseContent: (content) => JSON.parse(content),
      isValidParsed: (parsed) => parsed?.ok === true
    })

    expect(result.success).toBe(true)
    expect(result.attemptIndex).toBe(0)
    expect(result.parsed).toEqual({ ok: true })
    expect(sendChatMock).toHaveBeenCalledTimes(1)
    expect(sendChatMock).toHaveBeenCalledWith(
      baseMessages,
      null,
      null,
      settings,
      expect.objectContaining({
        retryCount: 0,
        request_id: 'req_abc_a0',
        attemptName: 'retry-plan'
      })
    )
  })

  it('succeeds on second attempt with appendMessages', async () => {
    const baseMessages = [{ role: 'user', content: 'topic' }]
    const appendMessage = { role: 'user', content: '请严格输出 JSON' }

    sendChatMock
      .mockResolvedValueOnce({ content: 'not-json' })
      .mockResolvedValueOnce({ content: '{"cards":[1,2]}' })

    const result = await runGenerationRetryPlan({
      baseMessages,
      settings: { model: 'x' },
      generationOptions: { request_id: 'req_retry' },
      parseContent: (content) => JSON.parse(content),
      isValidParsed: (parsed) => Array.isArray(parsed?.cards) && parsed.cards.length > 0,
      attempts: [
        { name: 'first' },
        { name: 'retry', appendMessages: [appendMessage] }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.attemptIndex).toBe(1)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0].parseError).toBeTruthy()
    expect(sendChatMock).toHaveBeenCalledTimes(2)

    expect(sendChatMock.mock.calls[1][0]).toEqual([...baseMessages, appendMessage])
    expect(sendChatMock.mock.calls[1][4]).toEqual(
      expect.objectContaining({
        retryCount: 1,
        request_id: 'req_retry_a1',
        attemptName: 'retry'
      })
    )
  })

  it('returns failure payload when all attempts fail', async () => {
    sendChatMock
      .mockResolvedValueOnce({ content: 'A' })
      .mockResolvedValueOnce({ content: 'B' })

    const result = await runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: 'x' }],
      settings: { model: 'x' },
      generationOptions: { request_id: 'req_fail' },
      parseContent: () => null,
      isValidParsed: () => false,
      attempts: [{ name: 'one' }, { name: 'two' }]
    })

    expect(result.success).toBe(false)
    expect(result.attemptIndex).toBe(1)
    expect(result.attempts).toHaveLength(2)
    expect(result.content).toBe('B')
    expect(sendChatMock).toHaveBeenCalledTimes(2)
  })

  it('supports buildMessages based on history', async () => {
    sendChatMock
      .mockResolvedValueOnce({ content: '{"count":1}' })
      .mockResolvedValueOnce({ content: '{"count":2}' })

    const result = await runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: 'root' }],
      settings: { model: 'x' },
      parseContent: (content) => JSON.parse(content),
      isValidParsed: (parsed) => parsed?.count === 2,
      attempts: [
        { name: 'first' },
        {
          name: 'second',
          buildMessages: ({ baseMessages, history }) => [
            ...baseMessages,
            { role: 'user', content: `history=${history.length}` }
          ]
        }
      ]
    })

    expect(result.success).toBe(true)
    expect(result.attemptIndex).toBe(1)
    expect(sendChatMock.mock.calls[1][0]).toEqual([
      { role: 'user', content: 'root' },
      { role: 'user', content: 'history=1' }
    ])
  })

  it('continues to next attempt when request fails', async () => {
    sendChatMock
      .mockRejectedValueOnce(new Error('network-down'))
      .mockResolvedValueOnce({ content: '{"ok":true}' })

    const result = await runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: 'x' }],
      settings: { model: 'x' },
      parseContent: (content) => JSON.parse(content),
      isValidParsed: (parsed) => parsed?.ok === true,
      attempts: [{ name: 'first' }, { name: 'second' }]
    })

    expect(result.success).toBe(true)
    expect(result.attemptIndex).toBe(1)
    expect(result.attempts[0].requestError).toBeTruthy()
    expect(sendChatMock).toHaveBeenCalledTimes(2)
  })

  it('throws when all attempts fail by request errors', async () => {
    sendChatMock
      .mockRejectedValueOnce(new Error('first-down'))
      .mockRejectedValueOnce(new Error('second-down'))

    await expect(runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: 'x' }],
      settings: { model: 'x' },
      attempts: [{ name: 'first' }, { name: 'second' }]
    })).rejects.toThrow('second-down')

    expect(sendChatMock).toHaveBeenCalledTimes(2)
  })
})
