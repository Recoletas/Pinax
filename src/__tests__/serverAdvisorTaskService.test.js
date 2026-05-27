import { describe, expect, it } from 'vitest'
import {
  createAdvisorTaskResponse,
  normalizeAdvisorTaskType,
  parseAdvisorJson
} from '../../server/services/advisorTaskService.js'

describe('server advisorTaskService', () => {
  it('parses fenced advisor JSON', () => {
    const parsed = parseAdvisorJson('```json\n{"summary":"改好了","replacement":"新文本"}\n```')

    expect(parsed).toEqual({
      summary: '改好了',
      replacement: '新文本'
    })
  })

  it('normalizes blank task types to chapter review', () => {
    expect(normalizeAdvisorTaskType('')).toBe('advisor.review.chapter')
    expect(normalizeAdvisorTaskType('advisor.fix.selection')).toBe('advisor.fix.selection')
  })

  it('builds replace responses with target metadata', () => {
    const response = createAdvisorTaskResponse({
      taskType: 'advisor.fix.selection',
      advice: JSON.stringify({
        mode: 'replace',
        summary: '修正重复表达',
        replacement: '她推开门，走进雨里。'
      }),
      target: {
        range: { start: 4, end: 12 },
        text: '她推开门门，走进雨里。'
      }
    })

    expect(response).toMatchObject({
      taskType: 'advisor.fix.selection',
      advice: '修正重复表达',
      result: {
        task: 'advisor.fix.selection',
        mode: 'replace',
        summary: '修正重复表达',
        replacement: '她推开门，走进雨里。',
        targetRange: { start: 4, end: 12 },
        baseText: '她推开门门，走进雨里。'
      }
    })
  })

  it('keeps non-json advice as review summary', () => {
    const response = createAdvisorTaskResponse({
      taskType: 'advisor.review.chapter',
      advice: '节奏偏快，可以先补一个动作停顿。'
    })

    expect(response).toMatchObject({
      advice: '节奏偏快，可以先补一个动作停顿。',
      result: {
        task: 'advisor.review.chapter',
        mode: 'review',
        summary: '节奏偏快，可以先补一个动作停顿。',
        replacement: ''
      }
    })
  })
})
