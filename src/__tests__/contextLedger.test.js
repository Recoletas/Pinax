import { describe, expect, it } from 'vitest'
import {
  CONTEXT_LEDGER_PART_LIMIT,
  CONTEXT_PREVIEW_LIMIT,
  appendContextLedgerPart,
  createContextLedger,
  createContextLedgerPart,
  mergeContextLedgers,
  summarizePromptMessage,
  truncateContextPreview
} from '../services/contextLedger'

describe('contextLedger', () => {
  it('caps previews and does not retain raw content on parts', () => {
    const secret = `SECRET-${'x'.repeat(CONTEXT_PREVIEW_LIMIT + 80)}`
    const preview = truncateContextPreview(secret)
    const part = createContextLedgerPart({
      source: 'worldbook',
      title: 'Secret',
      purpose: 'privacy-test',
      content: secret
    })

    expect(preview.length).toBeLessThanOrEqual(CONTEXT_PREVIEW_LIMIT)
    expect(preview).not.toBe(secret)
    expect(part.preview).toBe(preview)
    expect(part).not.toHaveProperty('content')
  })

  it('normalizes metadata for included and skipped parts', () => {
    const included = createContextLedgerPart({
      source: 'worldbook',
      title: '常驻规则',
      purpose: 'worldbook-entry',
      content: '必须遵守世界书设定。',
      entryId: 'entry-1',
      included: true,
      limit: 2000
    })
    const skipped = createContextLedgerPart({
      source: 'unknown',
      title: '跳过条目',
      purpose: 'worldbook-entry-truncated',
      content: '预算不足。',
      included: false,
      truncated: true,
      warning: 'truncated:跳过条目'
    })

    expect(included).toMatchObject({
      source: 'worldbook',
      title: '常驻规则',
      purpose: 'worldbook-entry',
      included: true,
      truncated: false,
      entryId: 'entry-1',
      limit: 2000
    })
    expect(skipped.source).toBe('generation')
    expect(skipped.included).toBe(false)
    expect(skipped.truncated).toBe(true)
  })

  it('caps parts and appends a skipped overflow summary', () => {
    let ledger = createContextLedger({ runId: 'run-1', sessionId: 'sess-1', worldbookId: 'wb-1', createdAt: 100 })
    for (let index = 0; index < CONTEXT_LEDGER_PART_LIMIT + 3; index += 1) {
      ledger = appendContextLedgerPart(ledger, {
        source: 'chat',
        title: `part-${index}`,
        purpose: 'recent-chat',
        content: `content-${index}`
      })
    }

    expect(ledger.parts).toHaveLength(CONTEXT_LEDGER_PART_LIMIT)
    expect(ledger.parts.at(-1)).toMatchObject({
      included: false,
      truncated: true,
      purpose: 'ledger-overflow',
      warning: 'ledger-overflow'
    })
  })

  it('merges ledgers and summarizes prompt messages', () => {
    const first = appendContextLedgerPart(createContextLedger({ runId: 'run-1' }), {
      source: 'runtime',
      title: 'Runtime',
      purpose: 'runtime-context',
      content: '角色在钟楼。'
    })
    const second = createContextLedger()
    const memoryPart = summarizePromptMessage({
      message: { role: 'system', content: '【已确认记忆】玩家持有铜钥匙。' },
      source: 'memory',
      title: 'Memory',
      purpose: 'memory-context'
    })
    second.parts = [memoryPart]

    const merged = mergeContextLedgers(first, second)

    expect(merged.runId).toBe('run-1')
    expect(merged.parts.map((part) => part.source)).toEqual(['runtime', 'memory'])
    expect(merged.parts[1].preview).toContain('铜钥匙')
  })
})
