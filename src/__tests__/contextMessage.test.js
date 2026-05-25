import { beforeEach, describe, expect, it } from 'vitest'
import { buildContextMessage } from '../services/api'
import { STORAGE_KEYS, setItem } from '../composables/useStorage'

describe('buildContextMessage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('prefers the provided session context over stale stored writing data', () => {
    setItem(STORAGE_KEYS.WRITING_CHARACTER, {
      name: '旧角色',
      gender: '男',
      age: '32岁',
      traits: ['沉稳']
    })

    const message = buildContextMessage(null, {
      contextDetail: {
        character: {
          name: '新会话角色',
          gender: '女',
          age: '21岁',
          traits: ['冷静'],
          description: '当前会话角色',
          goal: '开启新故事'
        },
        time: {
          eraId: 'gregorian',
          eraName: '',
          year: '2026',
          month: '5',
          day: '25'
        },
        location: {
          currentCountry: '东境',
          currentCity: '青石城',
          currentScene: '城门'
        },
        activities: []
      }
    })

    expect(message?.content || '').toContain('姓名：新会话角色')
    expect(message?.content || '').toContain('性别：女')
    expect(message?.content || '').not.toContain('旧角色')
  })
})
