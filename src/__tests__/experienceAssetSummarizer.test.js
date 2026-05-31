import { describe, expect, it } from 'vitest'
import {
  buildExperienceAssetSummaryMessages,
  parseExperienceAssetSummary
} from '@/services/experienceAssetSummarizer'

describe('experienceAssetSummarizer', () => {
  it('builds summary messages from recent experience messages', () => {
    const messages = buildExperienceAssetSummaryMessages({
      worldName: '雾港',
      sessionTitle: '第一夜',
      messages: [
        { role: 'user', content: '我推开门。' },
        { role: 'assistant', content: '门后传来潮湿的风。' }
      ]
    })

    expect(messages).toHaveLength(2)
    expect(messages[0].content).toContain('只输出 JSON')
    expect(messages[1].content).toContain('世界书：雾港')
    expect(messages[1].content).toContain('assistant: 门后传来潮湿的风。')
  })

  it('parses and normalizes asset summary JSON', () => {
    const assets = parseExperienceAssetSummary(`\`\`\`json
{
  "assets": [
    { "kind": "event", "title": "推门", "content": "主角推开门，发现门后有潮湿的风。" },
    { "kind": "bad-kind", "title": "灵感", "content": "门后也许藏着旧港口。" },
    { "kind": "worldbook-draft", "title": "雾港", "content": "名称：雾港\\n关键词：雾港\\n类型：地点\\n内容：雾港常年潮湿。" }
  ]
}
\`\`\``)

    expect(assets).toEqual([
      { kind: 'event', title: '推门', content: '主角推开门，发现门后有潮湿的风。' },
      { kind: 'inspiration', title: '灵感', content: '门后也许藏着旧港口。' },
      { kind: 'worldbook-draft', title: '雾港', content: '名称：雾港\n关键词：雾港\n类型：地点\n内容：雾港常年潮湿。' }
    ])
  })

  it('returns empty assets for invalid or empty output', () => {
    expect(parseExperienceAssetSummary('')).toEqual([])
    expect(parseExperienceAssetSummary('没有可整理内容')).toEqual([])
  })
})
