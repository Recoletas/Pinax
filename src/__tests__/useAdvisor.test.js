import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requestAdvisorTask: vi.fn()
}))

vi.mock('../services/advisorTaskService', () => ({
  requestAdvisorTask: mocks.requestAdvisorTask
}))

import { requestAdvisorTask } from '../services/advisorTaskService'
import { useAdvisor } from '../composables/useAdvisor'

const requestAdvisorTaskMock = vi.mocked(requestAdvisorTask)

describe('useAdvisor', () => {
  beforeEach(() => {
    requestAdvisorTaskMock.mockReset()
  })

  it('routes every request through the unified advisor service', async () => {
    requestAdvisorTaskMock.mockResolvedValue({
      taskType: 'advisor.fix.selection',
      advice: '统一建议',
      result: {
        task: 'advisor.fix.selection',
        mode: 'replace',
        summary: '统一建议'
      }
    })

    const advisor = useAdvisor()

    await advisor.askAdvisor({
      label: '修正选中内容',
      question: '怎么改',
      scope: 'selection',
      target: { kind: 'selection', text: '原文' }
    }, async () => ({ chapterId: 'c-1' }))

    expect(requestAdvisorTaskMock).toHaveBeenCalledWith({
      context: { chapterId: 'c-1' },
      question: '怎么改',
      scope: 'selection',
      taskType: '',
      target: { kind: 'selection', text: '原文' },
      options: {}
    })
    expect(advisor.advisorMessages.value).toEqual([
      { role: 'user', content: '修正选中内容' },
      { role: 'advisor', content: '统一建议' }
    ])
    expect(advisor.advisorResults.value).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        status: 'pending',
        task: 'advisor.fix.selection',
        mode: 'replace',
        summary: '统一建议'
      })
    ])
    expect(advisor.advisorLoading.value).toBe(false)
    expect(advisor.advisorOpen.value).toBe(false)
    expect(advisor.backend).toBeUndefined()
  })
})
