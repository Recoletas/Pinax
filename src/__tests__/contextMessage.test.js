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
        activities: [],
        goals: [
          { title: '拿到钟楼证据', status: 'active' }
        ],
        encounteredCharacters: [
          { name: '林舟' }
        ],
        factionRelations: {
          潮盐行会: -18
        },
        keyChoices: [
          { label: '答应先查钟楼' }
        ],
        plotJournal: [
          { summary: '主角抵达城门，接下第一轮调查。' }
        ]
      }
    })

    expect(message?.content || '').toContain('姓名：新会话角色')
    expect(message?.content || '').toContain('性别：女')
    expect(message?.content || '').toContain('当前目标：开启新故事')
    expect(message?.content || '').toContain('拿到钟楼证据')
    expect(message?.content || '').toContain('林舟')
    expect(message?.content || '').toContain('潮盐行会')
    expect(message?.content || '').toContain('答应先查钟楼')
    expect(message?.content || '').toContain('最近剧情')
    expect(message?.content || '').not.toContain('旧角色')
  })

  it('builds a normal-mode context message from lightweight runtime state alone', () => {
    const message = buildContextMessage(null, {
      contextDetail: {
        activities: [],
        goals: [
          { title: '拿到钟楼证据', status: 'active' }
        ],
        encounteredCharacters: [
          { name: '林舟' }
        ],
        factionRelations: {
          潮盐行会: -18
        },
        keyChoices: [
          { label: '先去钟楼查痕迹' }
        ],
        plotJournal: [
          { summary: '主角决定先去钟楼，再追查雾税账册。' }
        ]
      }
    })

    expect(message).not.toBeNull()
    expect(message?.content || '').toContain('【当前目标】')
    expect(message?.content || '').toContain('拿到钟楼证据')
    expect(message?.content || '').toContain('【已遇角色】')
    expect(message?.content || '').toContain('林舟')
    expect(message?.content || '').toContain('【阵营关系】')
    expect(message?.content || '').toContain('潮盐行会')
    expect(message?.content || '').toContain('【关键选择】')
    expect(message?.content || '').toContain('先去钟楼查痕迹')
    expect(message?.content || '').toContain('【最近剧情摘要】')
  })
})
