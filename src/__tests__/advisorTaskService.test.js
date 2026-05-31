import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn()
}))

vi.mock('../services/api', () => ({
  default: {
    post: mocks.apiPost
  }
}))

import { requestAdvisorAdvice, requestAdvisorTask } from '../services/advisorTaskService'

describe('advisorTaskService', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
  })

  it('posts structured tasks to the unified advisor route', async () => {
    mocks.apiPost.mockResolvedValue({
      data: {
        taskType: 'advisor.fix.selection',
        advice: '建议内容',
        result: {
          task: 'advisor.fix.selection',
          mode: 'replace',
          summary: '建议内容'
        }
      }
    })

    const result = await requestAdvisorTask({
      context: { chapterTitle: '第一章' },
      question: '怎么改',
      scope: 'selection',
      target: {
        kind: 'selection',
        text: '原文'
      }
    })

    expect(result).toMatchObject({
      taskType: 'advisor.fix.selection',
      advice: '建议内容',
      result: {
        task: 'advisor.fix.selection',
        mode: 'replace'
      }
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('/advisor/task', {
      context: { chapterTitle: '第一章' },
      question: '怎么改',
      taskType: 'advisor.fix.selection',
      target: {
        kind: 'selection',
        text: '原文'
      },
      options: {}
    })
  })

  it('keeps advice requests compatible by returning plain advice', async () => {
    mocks.apiPost.mockResolvedValue({
      data: { advice: '普通建议' }
    })

    const result = await requestAdvisorAdvice({
      context: { chapterTitle: '第一章' },
      question: '怎么改'
    })

    expect(result).toBe('普通建议')
  })

  it('normalizes gateway errors', async () => {
    mocks.apiPost.mockRejectedValue({
      response: {
        data: {
          error: 'Gateway unavailable'
        }
      }
    })

    await expect(requestAdvisorAdvice({
      context: { chapterTitle: '第一章' },
      question: '怎么改'
    })).rejects.toThrow('Gateway unavailable')
  })
})
