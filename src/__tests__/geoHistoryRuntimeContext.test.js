import { describe, expect, it } from 'vitest'
import { buildGeoHistoryRuntimeContext } from '../services/worldHistory/runtimeContext'

describe('worldHistory/runtimeContext', () => {
  it('selects historical nodes bound to the current place and merges recent player history', () => {
    const context = buildGeoHistoryRuntimeContext({
      geoHistory: {
        nodes: [
          {
            id: 'history-gray-wall-1',
            placeRef: { placeId: 'place:gray-wall' },
            title: '税册封存',
            summary: '灰墙旧税所封存第一批雾历账册。',
            participants: ['潮盐行会'],
            unresolvedHooks: ['税册去向'],
            entryIds: ['entry-tax-ledger']
          },
          {
            id: 'history-other-place',
            placeRef: { placeId: 'place:other' },
            summary: '远方的战争与当前地点无关。',
            participants: ['远方军团']
          }
        ],
        playerNodes: [
          {
            id: 'player-gray-wall-1',
            summary: '林舟在灰墙留下新的税册线索。',
            participants: ['林舟'],
            locations: ['灰墙'],
            unresolvedHooks: ['证人代价'],
            placeId: 'place:gray-wall'
          }
        ]
      },
      worldbook: {
        id: 'wb-runtime',
        entries: [{ id: 'entry-tax-ledger', name: '税册', type: 'event', content: '税册' }]
      },
      worldMapState: { placeId: 'place:gray-wall' }
    })

    expect(context).toMatchObject({
      summaries: [
        '灰墙旧税所封存第一批雾历账册。',
        '林舟在灰墙留下新的税册线索。'
      ],
      participants: ['潮盐行会', '林舟'],
      locations: ['灰墙'],
      unresolvedHooks: ['税册去向', '证人代价'],
      placeIds: ['place:gray-wall'],
      entryIds: ['entry-tax-ledger'],
      historyNodeIds: ['history-gray-wall-1']
    })
    expect(context.summaries).not.toContain('远方的战争与当前地点无关。')
    expect(context.participants).not.toContain('远方军团')
  })

  it('falls back to player history when no place-bound historical node exists', () => {
    const context = buildGeoHistoryRuntimeContext({
      geoHistory: {
        nodes: [],
        playerNodes: [{ id: 'player-1', summary: '玩家在边境留下未决线索。', locations: ['边境'] }]
      },
      worldMapState: { placeId: 'place:frontier' }
    })

    expect(context).toMatchObject({ summaries: ['玩家在边境留下未决线索。'], locations: ['边境'] })
    expect(context.historyNodeIds).toEqual([])
  })

  it('returns null when neither map history nor player history has signals', () => {
    expect(buildGeoHistoryRuntimeContext({ geoHistory: { nodes: [] } })).toBeNull()
  })
})
