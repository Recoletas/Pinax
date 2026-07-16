import { describe, expect, it } from 'vitest'
import {
  PLAYER_HISTORY_LIMITS,
  appendPlayerHistoryNode,
  buildPlayerHistoryContext,
  buildPlayerHistoryNodeFromPlotJournal
} from '../services/playerHistory'

describe('playerHistory', () => {
  it('returns null when plotJournal is empty or unusable', () => {
    expect(buildPlayerHistoryNodeFromPlotJournal([], { id: 'hn_1' })).toBeNull()
    expect(buildPlayerHistoryNodeFromPlotJournal(null, null)).toBeNull()
    expect(buildPlayerHistoryNodeFromPlotJournal(undefined, null)).toBeNull()
  })

  it('aggregates a window of plotJournal entries into a single playerHistoryNode', () => {
    const plotJournal = [
      {
        summary: '林舟在码头核对夜账。',
        participants: ['林舟', '潮盐行会'],
        locations: ['灯痕码头'],
        keyChoices: ['先核夜账'],
        unresolvedHooks: ['雾税账册'],
        createdAt: 1000
      },
      {
        summary: '潮盐行会拒绝交账。',
        participants: ['潮盐行会'],
        locations: ['灯痕码头'],
        keyChoices: ['公开账本'],
        unresolvedHooks: ['证人代价'],
        createdAt: 1500
      },
      {
        summary: '苔娜从灰墙传来证词。',
        participants: ['苔娜'],
        locations: ['灰墙难民营'],
        keyChoices: ['继续追证词'],
        unresolvedHooks: ['灰墙真相分岔'],
        createdAt: 2000
      }
    ]
    const node = buildPlayerHistoryNodeFromPlotJournal(plotJournal, { id: 'hn_archive_42' }, { now: 2500 })

    expect(node).not.toBeNull()
    expect(node.v).toBe(PLAYER_HISTORY_LIMITS.PLAYER_HISTORY_SCHEMA_VERSION)
    expect(node.kind).toBe('player-history-v1')
    expect(node.sourceNodeId).toBe('hn_archive_42')
    expect(node.entryCount).toBe(3)
    expect(node.windowStart).toBe(1000)
    expect(node.windowEnd).toBe(2000)
    expect(node.capturedAt).toBe(2500)
    expect(node.id.startsWith('phn_')).toBe(true)
    expect(node.summary).toContain('林舟在码头核对夜账')
    expect(node.summary).toContain('苔娜从灰墙传来证词')
    expect(node.participants).toEqual(['林舟', '潮盐行会', '苔娜'])
    expect(node.locations).toEqual(['灯痕码头', '灰墙难民营'])
    expect(node.keyChoices).toEqual(['先核夜账', '公开账本', '继续追证词'])
    expect(node.unresolvedHooks).toEqual(['雾税账册', '证人代价', '灰墙真相分岔'])
  })

  it('respects the lookback window and clamps arrays to declared limits', () => {
    const plotJournal = Array.from({ length: 10 }, (_, index) => ({
      summary: `第 ${index + 1} 段剧情。`,
      participants: Array.from({ length: 10 }, (_, p) => `角色${p}-${index}`),
      locations: Array.from({ length: 8 }, (_, l) => `地点${l}-${index}`),
      keyChoices: Array.from({ length: 8 }, (_, c) => `选项${c}-${index}`),
      unresolvedHooks: Array.from({ length: 10 }, (_, h) => `钩子${h}-${index}`),
      createdAt: 1000 + index
    }))
    const node = buildPlayerHistoryNodeFromPlotJournal(plotJournal, null, { lookback: 4 })

    expect(node.entryCount).toBe(4)
    expect(node.participants).toHaveLength(PLAYER_HISTORY_LIMITS.MAX_PARTICIPANTS)
    expect(node.locations).toHaveLength(PLAYER_HISTORY_LIMITS.MAX_LOCATIONS)
    expect(node.keyChoices).toHaveLength(PLAYER_HISTORY_LIMITS.MAX_KEY_CHOICES)
    expect(node.unresolvedHooks).toHaveLength(PLAYER_HISTORY_LIMITS.MAX_UNRESOLVED_HOOKS)
  })

  it('de-duplicates participants / locations / hooks case-insensitively', () => {
    const plotJournal = [
      {
        summary: '同一证人重复出现。',
        participants: ['苔娜', '  苔娜  ', 'TANA'],
        locations: ['灰墙难民营', '灰墙难民营'],
        unresolvedHooks: ['证人代价', '证人代价']
      }
    ]
    const node = buildPlayerHistoryNodeFromPlotJournal(plotJournal, { id: 'hn_dedupe' })

    // Whitespace-only dupes collapse; cross-script labels are kept as-is.
    expect(node.participants).toEqual(['苔娜', 'TANA'])
    expect(node.locations).toEqual(['灰墙难民营'])
    expect(node.unresolvedHooks).toEqual(['证人代价'])
  })

  it('dedupes ASCII labels case-insensitively (e.g. english factions)', () => {
    const plotJournal = [
      {
        summary: 'Salt Guild 出现多次。',
        participants: ['Salt Guild', 'salt guild', 'SALT GUILD'],
        unresolvedHooks: ['Tax Ledger', 'tax ledger']
      }
    ]
    const node = buildPlayerHistoryNodeFromPlotJournal(plotJournal, null)

    expect(node.participants).toEqual(['Salt Guild'])
    expect(node.unresolvedHooks).toEqual(['Tax Ledger'])
  })

  it('clamps overly long summaries with an ellipsis', () => {
    const longSummary = '剧情'.repeat(PLAYER_HISTORY_LIMITS.MAX_SUMMARY_CHARS)
    const node = buildPlayerHistoryNodeFromPlotJournal(
      [{ summary: longSummary, createdAt: 1 }],
      { id: 'hn_long' }
    )

    expect(node.summary.length).toBe(PLAYER_HISTORY_LIMITS.MAX_SUMMARY_CHARS)
    expect(node.summary.endsWith('…')).toBe(true)
  })

  it('anchors sourceNodeId to the current history node when one is supplied', () => {
    const node = buildPlayerHistoryNodeFromPlotJournal(
      [{ summary: '一句话。', createdAt: 5 }],
      { id: 'hn_thread' }
    )
    expect(node.sourceNodeId).toBe('hn_thread')

    const orphan = buildPlayerHistoryNodeFromPlotJournal(
      [{ summary: '一句话。', createdAt: 5 }],
      null
    )
    expect(orphan.sourceNodeId).toBe('')
  })

  it('uses a stable identity and carries the active place reference', () => {
    const journal = [{ id: 'journal-7', summary: '在灰墙确认旧税册。', createdAt: 7000 }]
    const historyNode = {
      id: 'hn_gray-wall',
      placeRef: {
        placeId: 'place:wb-1:map-1:site-gray-wall',
        worldbookId: 'wb-1',
        mapId: 'map-1',
        siteId: 'site-gray-wall'
      }
    }

    const first = buildPlayerHistoryNodeFromPlotJournal(journal, historyNode, {
      now: 8000,
      placeId: 'place:wb-1:map-1:site-gray-wall'
    })
    const second = buildPlayerHistoryNodeFromPlotJournal(journal, historyNode, {
      now: 9000,
      placeId: 'place:wb-1:map-1:site-gray-wall'
    })

    expect(first.id).toBe(second.id)
    expect(first.placeId).toBe('place:wb-1:map-1:site-gray-wall')
    expect(first.placeRef).toMatchObject({
      worldbookId: 'wb-1',
      mapId: 'map-1',
      siteId: 'site-gray-wall'
    })
    expect(first.sourceEntryIds).toEqual(['journal-7'])
    expect(first.worldStateSnapshot).toBeUndefined()

    const withSnapshot = buildPlayerHistoryNodeFromPlotJournal(journal, historyNode, {
      worldStateSnapshot: {
        turn: 12,
        worldMapState: {
          placeId: 'place:wb-1:map-1:site-gray-wall',
          currentCountry: '东境',
          currentCity: '灰墙',
          currentScene: '旧税所'
        },
        writingTime: { eraId: 'mist', eraName: '雾历', year: '12', month: '3', day: '8' },
        factionRelations: { '潮盐行会': -8 },
        goals: [{ title: '追查税册' }],
        encounteredCharacters: [{ name: '林舟' }]
      }
    })
    expect(withSnapshot.worldStateSnapshot).toMatchObject({
      turn: 12,
      place: { placeId: 'place:wb-1:map-1:site-gray-wall', city: '灰墙' },
      factions: { '潮盐行会': -8 },
      activeThreads: ['追查税册'],
      characters: ['林舟']
    })
  })

  it('appends player history without duplicating the same source window', () => {
    const node = buildPlayerHistoryNodeFromPlotJournal(
      [{ id: 'journal-1', summary: '在渡口找到线索。', createdAt: 1000 }],
      { id: 'hn-dock' },
      { now: 2000 }
    )

    const first = appendPlayerHistoryNode({ version: 1, nodes: [] }, node)
    const second = appendPlayerHistoryNode(first, { ...node, capturedAt: 3000 })

    expect(first.playerNodes).toHaveLength(1)
    expect(second.playerNodes).toHaveLength(1)
    expect(second.playerNodes[0].capturedAt).toBe(3000)
    expect(second.playerNodes[0].sourceNodeId).toBe('hn-dock')
  })

  it('builds a bounded context slice from recent player history', () => {
    const context = buildPlayerHistoryContext({
      playerNodes: [
        {
          summary: '林舟在灰墙留下税册线索。',
          participants: ['林舟'],
          locations: ['灰墙'],
          keyChoices: ['先查税册'],
          unresolvedHooks: ['税册去向'],
          placeId: 'place:gray-wall'
        }
      ]
    })

    expect(context).toEqual({
      summaries: ['林舟在灰墙留下税册线索。'],
      participants: ['林舟'],
      locations: ['灰墙'],
      keyChoices: ['先查税册'],
      unresolvedHooks: ['税册去向'],
      placeIds: ['place:gray-wall'],
      entryIds: []
    })
  })
})
