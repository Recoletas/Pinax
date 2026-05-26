import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiGet: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mocks.apiPost,
      get: mocks.apiGet
    }))
  }
}))

import { sendChat, sendChatStream } from '@/services/api'

const settings = {
  provider: 'openai',
  baseUrl: 'https://api.example/v1',
  apiKey: 'sk-test',
  model: 'demo-model'
}

describe('api generation metadata', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.apiPost.mockReset()
    mocks.apiGet.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends task metadata through normal chat requests', async () => {
    mocks.apiPost.mockResolvedValue({
      data: { content: 'ok' }
    })

    await sendChat(
      [{ role: 'user', content: '改写这一句。' }],
      null,
      'world-1',
      settings,
      {
        request_id: 'req_task',
        taskType: 'writing.rewrite',
        promptVersion: '1.0.0',
        attemptName: 'rewrite-pass'
      }
    )

    expect(mocks.apiPost).toHaveBeenCalledWith('/generate', expect.objectContaining({
      request_id: 'req_task',
      taskType: 'writing.rewrite',
      promptVersion: '1.0.0',
      attemptName: 'rewrite-pass'
    }))
  })

  it('sends task metadata through stream chat requests', async () => {
    const read = vi.fn().mockResolvedValueOnce({ done: true })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({ read })
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendChatStream(
      [{ role: 'user', content: '继续。' }],
      null,
      'world-1',
      settings,
      {
        request_id: 'stream_req',
        taskType: 'narrative.continue',
        promptVersion: '1.0.0',
        attemptName: 'stream-pass'
      }
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      request_id: 'stream_req',
      taskType: 'narrative.continue',
      promptVersion: '1.0.0',
      attemptName: 'stream-pass'
    })
  })
})
