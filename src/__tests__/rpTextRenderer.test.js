import { describe, expect, it } from 'vitest'
import { renderRPText, tokenizeRPText } from '@/services/rpTextRenderer'

describe('rpTextRenderer', () => {
  it('marks triggered dialogue fragments', () => {
    const html = renderRPText('林霁舰长沉声说：“所有人立刻撤离。”', {
      mechanismTrigger: {
        type: 'dialogue',
        match: '“所有人立刻撤离。”',
        dialogue: '所有人立刻撤离。'
      }
    })

    expect(html).toContain('rp-dialogue')
    expect(html).toContain('mechanism-trigger')
    expect(html).toContain('触发')
  })

  it('keeps ordinary dialogue non-clickable', () => {
    const html = renderRPText('他低声说：“别出声。”')

    expect(html).toContain('rp-dialogue')
    expect(html).not.toContain('data-inline-type="dialogue"')
    expect(html).not.toContain('clickable')
  })

  it('renders nested single quotes inside dialogue', () => {
    const html = renderRPText('他低声说：“别提‘那件事’。”')

    expect(html).toContain('rp-dialogue')
    expect(html).toContain('rp-dialogue-quote')
    expect(html).toContain('rp-dialogue-quote-soft')
    expect(html).toContain('‘那件事’')
  })

  it('uses distinct colors for different nested quote styles', () => {
    const html = renderRPText('他说：“‘外层’、『书名』和\'数字\'都要区分。”')

    expect(html).toContain('rp-dialogue-quote-soft')
    expect(html).toContain('rp-dialogue-quote-warm')
    expect(html).toContain('rp-dialogue-quote-neutral')
  })

  it('keeps item display and click payload separate', () => {
    const html = renderRPText('他获得了铜钥匙，随后继续前进。')

    expect(html).toContain('data-inline-type="item"')
    expect(html).toContain('data-inline-content="铜钥匙"')
    expect(html).toContain('获得了铜钥匙')
  })

  it('tokenizes narrative fragments without overlap', () => {
    const tokens = tokenizeRPText('*黎明降临*\n他进入旧书店，低声说：“别出声。”')

    expect(tokens.map((token) => token.type)).toEqual([
      'worldIntro',
      'text',
      'location',
      'text',
      'dialogue'
    ])
  })

  it('renders broader semantic fragments', () => {
    const html = renderRPText('【旧书店夜谈】清晨，他心想：今天得快些。他拿到铜钥匙。')

    expect(html).toContain('rp-world-intro')
    expect(html).toContain('rp-thought')
    expect(html).toContain('rp-time')
    expect(html).toContain('rp-item')
  })
})
