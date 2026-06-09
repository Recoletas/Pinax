import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildPlayableWorldActionHooks,
  clearPlayableWorldEntryIntent,
  extractPlayableOpeningHook,
  getPlayableWorldEntryIntent,
  savePlayableWorldEntryIntent
} from '../services/playableWorldEntry'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'

describe('playableWorldEntry', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('builds three differentiated opening actions from the flagship world', () => {
    const actions = buildPlayableWorldActionHooks(seedWorldbookPresets[0])

    expect(actions).toHaveLength(3)
    expect(actions.map((action) => action.id)).toEqual([
      'trace-first-evidence',
      'pressure-faction',
      'follow-dangerous-lead'
    ])
    expect(actions[0].command).toContain('暮湾主城')
    expect(actions[0].label).toBe('先去钟楼查痕迹')
    expect(actions[1].label).toBe('夜访码头核夜账')
    expect(actions[1].command).toContain('灯痕码头')
    expect(actions[1].command).toContain('潮盐行会')
    expect(actions[2].label).toBe('找证人问雾军')
    expect(actions[2].command).toContain('北境灰墙')
    expect(actions[2].command).toContain('苔娜难民领队')
    expect(actions.every((action) => action.command.length > 20)).toBe(true)
  })

  it('extracts opening hooks from direct fields or imported world descriptions', () => {
    expect(extractPlayableOpeningHook({ openingHook: '直接开场' })).toBe('直接开场')
    expect(extractPlayableOpeningHook({
      worldDescription: '世界说明\n\n开场困境：钟楼停摆，难民入城'
    })).toBe('钟楼停摆，难民入城')
  })

  it('stores and clears a selected opening intent', () => {
    const action = buildPlayableWorldActionHooks(seedWorldbookPresets[0])[0]

    expect(savePlayableWorldEntryIntent({
      worldbookId: 'wb_1',
      worldbookName: '边境王国',
      presetId: seedWorldbookPresets[0].id,
      presetName: seedWorldbookPresets[0].name,
      action
    })).toBe(true)

    expect(getPlayableWorldEntryIntent()).toEqual(expect.objectContaining({
      worldbookId: 'wb_1',
      presetId: seedWorldbookPresets[0].id,
      action: expect.objectContaining({
        id: action.id,
        command: action.command
      })
    }))

    clearPlayableWorldEntryIntent()
    expect(getPlayableWorldEntryIntent()).toBeNull()
  })
})
