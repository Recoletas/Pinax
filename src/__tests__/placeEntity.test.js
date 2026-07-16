import { describe, expect, it } from 'vitest'
import {
  buildPlaceEntityIndex,
  buildPlaceRuntimePatch,
  resolvePlaceEntity
} from '../services/worldHistory/placeEntity'

function worldbook() {
  return {
    id: 'wb-place',
    entries: [
      { id: 'entry-port', name: '雾港设定', type: 'location', content: '港口设定' },
      { id: 'entry-tax', name: '税权之争', type: 'event', content: '税权事件' }
    ],
    geoHistory: {
      mapId: 'map-1',
      placeRefs: [{
        placeId: 'place:wb-place:map-1:tradeHub:1',
        worldbookId: 'wb-place',
        mapId: 'map-1',
        siteId: 'tradeHub:1',
        name: '雾港',
        semanticType: 'tradeHub',
        cellIds: [12],
        markerIds: ['burg:1']
      }],
      nodes: [
        {
          id: 'history-port-1',
          title: '港口立约',
          summary: '雾港在旧约下获得通行权。',
          placeRef: { placeId: 'place:wb-place:map-1:tradeHub:1', name: '雾港' },
          entryIds: ['entry-port'],
          mapBinding: { country: '北境', city: '雾港', scene: '外港', siteId: 'tradeHub:1' }
        },
        {
          id: 'history-port-2',
          title: '税权争执',
          summary: '行会与守望者在雾港争执税权。',
          placeRef: { placeId: 'place:wb-place:map-1:tradeHub:1' },
          entryIds: ['entry-tax'],
          mapBinding: { country: '北境', city: '雾港', scene: '税关', siteId: 'tradeHub:1' }
        }
      ]
    }
  }
}

describe('worldHistory/placeEntity', () => {
  it('aggregates refs, map metadata, history nodes, and worldbook entries by placeId', () => {
    const index = buildPlaceEntityIndex(worldbook())
    const entity = resolvePlaceEntity(index, 'place:wb-place:map-1:tradeHub:1')

    expect(index.entities).toHaveLength(1)
    expect(entity).toMatchObject({
      placeId: 'place:wb-place:map-1:tradeHub:1',
      name: '雾港',
      semanticType: 'tradeHub',
      historyNodeIds: ['history-port-1', 'history-port-2'],
      entryIds: ['entry-port', 'entry-tax']
    })
    expect(entity.ref.cellIds).toEqual([12])
    expect(entity.entries.map((entry) => entry.id)).toEqual(['entry-port', 'entry-tax'])
  })

  it('resolves by place ref or human label and produces a runtime location patch', () => {
    const index = buildPlaceEntityIndex(worldbook())
    const byRef = resolvePlaceEntity(index, { placeId: 'place:wb-place:map-1:tradeHub:1' })
    const byName = resolvePlaceEntity(index, '雾港')

    expect(byRef.placeId).toBe(byName.placeId)
    expect(buildPlaceRuntimePatch(byRef)).toEqual({
      placeId: 'place:wb-place:map-1:tradeHub:1',
      currentCountry: '北境',
      currentCity: '雾港',
      currentScene: '税关'
    })
  })

  it('ignores malformed entities and returns null for unknown places', () => {
    const index = buildPlaceEntityIndex({
      id: 'wb-empty',
      geoHistory: { placeRefs: [null, { name: '没有 id' }], nodes: ['bad'] }
    })

    expect(index.entities).toEqual([])
    expect(resolvePlaceEntity(index, 'place:missing')).toBeNull()
    expect(buildPlaceRuntimePatch(null)).toBeNull()
  })
})
