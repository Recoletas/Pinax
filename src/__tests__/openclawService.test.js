import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    post: mocks.post
  }
}))

import { getAdvice } from '../../server/services/openclawService.js'

describe('openclawService', () => {
  beforeEach(() => {
    mocks.post.mockReset()
  })

  it('serializes object context before sending to the gateway', async () => {
    mocks.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: '建议文本'
            }
          }
        ]
      }
    })

    const result = await getAdvice(
      { chapter: '第一章', note: '线索' },
      '怎么改',
      {
        taskType: 'advisor.fix.selection',
        target: {
          kind: 'selection',
          text: '原文'
        }
      }
    )

    expect(result).toBe('建议文本')
    expect(mocks.post).toHaveBeenCalledTimes(1)

    const [url, payload, options] = mocks.post.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:18789/v1/chat/completions')
    expect(payload.model).toBe('openclaw/main')
    expect(payload.messages[1].content).toContain('任务类型：advisor.fix.selection')
    expect(payload.messages[1].content).toContain('目标文本/范围')
    expect(payload.messages[1].content).toContain('"chapter": "第一章"')
    expect(options.headers).toEqual({
      'Content-Type': 'application/json'
    })
  })

  it('rejects blank questions', async () => {
    await expect(getAdvice({ chapter: '第一章' }, '   ')).rejects.toThrow('缺少 context 或 question 参数')
  })
})
