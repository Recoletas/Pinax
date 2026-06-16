import { describe, expect, it } from 'vitest'
import {
  buildAdventureProseMessages,
  formatAdventureStoryboardSeedContent,
  parseAdventureProseDraft,
  parseAdventureStoryboardDraft
} from '../services/generationAdventureTriggers'

describe('generationAdventureTriggers', () => {
  it('parses prose drafts by stripping fences and markdown headings', () => {
    const content = [
      '```markdown',
      '# chapter-1',
      '钟楼上的风灌进来，阿离把证据按进衣襟，没有立刻回答林舟。',
      '她知道天亮前的沉默也是筹码，于是把自己的呼吸压得更稳。',
      '```'
    ].join('\n')

    const parsed = parseAdventureProseDraft(content)

    expect(parsed).toContain('钟楼上的风灌进来')
    expect(parsed).not.toContain('```')
    expect(parsed).not.toContain('# chapter-1')
  })

  it('builds prose trigger messages without duplicating the current plot summary in prior summaries', () => {
    const messages = buildAdventureProseMessages({
      worldbook: { id: 'wb_alpha', name: 'Alpha', entries: [] },
      runtimeState: {
        plotJournal: [
          { id: 'journal_0', chapterId: 'chapter-0', summary: '前文里阿离已经怀疑钟楼失火另有内情。' },
          { id: 'journal_1', chapterId: 'chapter-1', summary: '当前这段总结不应再出现在前文摘要里。' }
        ]
      },
      plotEntry: {
        id: 'journal_1',
        chapterId: 'chapter-1',
        summary: '当前这段总结不应再出现在前文摘要里。'
      }
    })

    const userMessage = messages[messages.length - 1].content

    expect(userMessage).toContain('本段冒险总结：当前这段总结不应再出现在前文摘要里。')
    expect(userMessage).toContain('前文摘要：')
    expect(userMessage).toContain('前文里阿离已经怀疑钟楼失火另有内情。')
    expect(userMessage).not.toContain('1. 当前这段总结不应再出现在前文摘要里。')
  })

  it('parses storyboard drafts into validated normalized shots and formats seed content', () => {
    const parsed = parseAdventureStoryboardDraft(JSON.stringify({
      shots: [
        {
          sequence: 1,
          sourceText: '钟楼破窗在夜里大开',
          shotType: 'wide',
          camera: 'fixed',
          duration: 4,
          visual: '冷风掠过碎玻璃',
          transition: 'cut'
        },
        {
          sequence: 2,
          sourceText: '阿离把证据压进衣襟',
          shotType: 'medium',
          camera: 'push',
          duration: 3,
          dialogue: '先别急着开价。',
          transition: 'cut'
        },
        {
          sequence: 3,
          sourceText: '林舟迟疑着没有逼近',
          shotType: 'close_up',
          camera: 'follow',
          duration: 3,
          sound: '钟楼木梁轻响',
          transition: 'fade'
        }
      ]
    }))

    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({
      shotType: 'wide',
      cameraMovement: 'fixed',
      transition: 'cut'
    })
    expect(parsed[1].camera).toBe('push')

    const seedContent = formatAdventureStoryboardSeedContent({
      title: 'chapter-1 分镜草稿',
      summary: '阿离在钟楼顶层暂时扣住证据。',
      shots: parsed
    })

    expect(seedContent).toContain('chapter-1 分镜草稿')
    expect(seedContent).toContain('摘要：阿离在钟楼顶层暂时扣住证据。')
    expect(seedContent).toContain('[全景 / 固定] 钟楼破窗在夜里大开')
    expect(seedContent).toContain('对白：先别急着开价。')
  })
})
