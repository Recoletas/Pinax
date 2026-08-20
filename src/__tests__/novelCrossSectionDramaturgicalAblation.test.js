import { describe, it, expect } from 'vitest'
import { CROSS_SECTION_FIXTURES } from '../../scripts/fixtures/novel-cross-section-fixtures.mjs'
import {
  CROSS_SECTION_DRAMATURGICAL_FIXTURES,
  DRAMATURGICAL_FIELD_LIMITS,
  validateDramaturgicalFixtures
} from '../../scripts/fixtures/novel-cross-section-dramaturgical-fixtures.mjs'

const clone = value => JSON.parse(JSON.stringify(value))

describe('novel cross-section dramaturgical ablation (tasks 1-8)', () => {
  it('locks four enriched fixtures whose base contract is reused, not copied (Task 1)', () => {
    expect(CROSS_SECTION_DRAMATURGICAL_FIXTURES.map(({ id }) => id)).toEqual([
      'canal-ledger',
      'birthday-recorder',
      'orbital-airlock-key',
      'temple-debt-token'
    ])
    expect(validateDramaturgicalFixtures(CROSS_SECTION_DRAMATURGICAL_FIXTURES))
      .toEqual({ valid: true })

    const baseById = new Map(CROSS_SECTION_FIXTURES.map(fixture => [fixture.id, fixture]))
    for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
      const base = baseById.get(fixture.id)
      // 基础契约来自 canonical fixture（同引用等价），不是抄写
      expect(fixture.characters).toEqual(base.characters)
      expect(fixture.facts).toEqual(base.facts)
      expect(fixture.focusProp).toBe(base.focusProp)
      expect(fixture.exitCue).toEqual(base.exitCue)
      expect(fixture.internalBeatRange).toEqual(base.internalBeatRange)
      expect(fixture.expectedOutcome).toBe(base.expectedOutcome)
      expect(fixture.antiOutcome).toBe(base.antiOutcome)

      // S1：pressure / stateChange 为必填 section 字符串
      expect([...fixture.minimalEngine.pressure].length).toBeGreaterThan(0)
      expect([...fixture.minimalEngine.stateChange].length).toBeGreaterThan(0)
      // sceneObjectives / withheldTruths：每个角色恰一条
      expect(Object.keys(fixture.minimalEngine.sceneObjectives).sort())
        .toEqual(base.characters.map(({ id }) => id).sort())
      expect(Object.keys(fixture.minimalEngine.withheldTruths).sort())
        .toEqual(base.characters.map(({ id }) => id).sort())
      // 长度上限
      expect([...fixture.minimalEngine.pressure].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.pressure)
      expect([...fixture.minimalEngine.stateChange].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.stateChange)
      for (const value of Object.values(fixture.minimalEngine.sceneObjectives)) {
        expect([...value].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.sceneObjective)
      }
      for (const value of Object.values(fixture.minimalEngine.withheldTruths)) {
        expect([...value].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.withheldTruth)
      }
      // withheldTruth 不得指向该角色的 forbidden facts（知道但不能直说 ≠ 禁止知道）
      for (const [characterId, truth] of Object.entries(fixture.minimalEngine.withheldTruths)) {
        const character = base.characters.find(({ id }) => id === characterId)
        for (const forbiddenId of character.forbiddenFactIds) {
          const forbidden = base.facts.find(fact => fact.id === forbiddenId)
          expect(truth).not.toContain((forbidden?.leakMarkers || [])[0] || forbidden?.text || '')
        }
      }

      // S2：六字段齐备，且不含 beat 数 / reversal / recognition 覆盖
      for (const field of ['premise', 'dramaticQuestion', 'dramaticGuts', 'mainConsciousness', 'spine', 'conflictType']) {
        expect([...fixture.fullVocabulary[field]].length).toBeGreaterThan(0)
        expect([...fixture.fullVocabulary[field]].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.theoryField)
      }
      const s2Joined = Object.values(fixture.fullVocabulary).join('')
      expect(s2Joined).not.toMatch(/四拍|固定四|必须反转|reversal|recognition/i)

      // 评审 ground truth：可观察结果，不复述条件字段措辞
      const truth = JSON.stringify(fixture.dramaturgicalGroundTruth)
      expect(truth).not.toMatch(/minimal-engine|full-vocabulary|baseline|condition/i)
      expect(fixture.dramaturgicalGroundTruth.observableMotivations.length).toBeGreaterThan(0)
      expect(fixture.dramaturgicalGroundTruth.acceptableStateChanges.length).toBeGreaterThan(0)
      expect(fixture.dramaturgicalGroundTruth.prohibitedShortcuts.length).toBeGreaterThan(0)
    }
  })

  it('rejects typed dramaturgical fixture violations (Task 1)', () => {
    const base = () => clone(CROSS_SECTION_DRAMATURGICAL_FIXTURES)
    const first = fixtures => fixtures[0]
    const expectCode = (fixtures, code) => {
      const result = validateDramaturgicalFixtures(fixtures)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(code)
    }

    // 未知角色 id（sceneObjectives 出现幽灵角色）
    let mutated = base()
    first(mutated).minimalEngine.sceneObjectives.ghost = '拿到粮册'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_CHARACTER_UNKNOWN')
    // 缺角色条目（withheldTruths 少一人）
    mutated = base()
    const birthday = mutated.find(({ id }) => id === 'birthday-recorder')
    delete birthday.minimalEngine.withheldTruths.mother
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_CHARACTER_MISSING')
    // 重复条目（同角色两份 sceneObjective —— 以对象形态无法重复，改测 withheldTruths 指向 forbidden）
    mutated = base()
    const canalTruth = first(mutated).minimalEngine.withheldTruths
    const inspector = first(mutated).characters.find(({ id }) => id === 'inspector')
    const forbiddenFact = first(mutated).facts.find(fact => fact.id === inspector.forbiddenFactIds[0])
    canalTruth.inspector = `他知道${forbiddenFact.leakMarkers[0]}，但无法直说`
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_WITHHELD_FORBIDDEN')
    // 未经知情角色持有的 withheldTruth：在本 fixture 家族里，任何他人私知同时都在
    // 该角色 forbidden 列表（非知即禁），因此该分支防御性保留；用"知道别人的私知"
    // 走到的必然是 WITHHELD_FORBIDDEN（上一用例已覆盖）。这里断言 canonical 全集上
    // 不存在可构造 FACT_UNKNOWN 的窗口，防止未来 fixture 改动悄悄打开它。
    for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
      for (const character of fixture.characters) {
        const privateIds = fixture.facts.filter(f => f.visibility === 'private').map(f => f.id)
        for (const factId of privateIds) {
          if (character.knownFactIds.includes(factId)) continue
          expect(character.forbiddenFactIds).toContain(factId)
        }
      }
    }
    // 缺 stateChange
    mutated = base()
    first(mutated).minimalEngine.stateChange = ''
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED')
    // S2 字段泄漏进 S1（sceneObjective 含理论词表标记）
    mutated = base()
    first(mutated).minimalEngine.sceneObjectives.inspector = '完成戏剧性问题：谁的命令压过谁'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED')
    // 超长（pressure > 80 码点）
    mutated = base()
    first(mutated).minimalEngine.pressure = '压'.repeat(81)
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_TOO_LONG')
    // S2 beat 覆盖（fullVocabulary 里夹带固定四拍）
    mutated = base()
    first(mutated).fullVocabulary.spine = '固定四拍推进，第一拍建置'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_BEAT_OVERRIDE')
    // S2 字段缺失
    mutated = base()
    delete first(mutated).fullVocabulary.conflictType
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED')
    // base fixture id 不匹配
    mutated = base()
    mutated[0].id = 'not-a-fixture'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH')
    // ground truth 缺失
    mutated = base()
    delete first(mutated).dramaturgicalGroundTruth
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_GROUND_TRUTH_INVALID')
    // 条件输入包含实验标签
    mutated = base()
    first(mutated).minimalEngine.stateChange = 'minimal-engine 条件下的变化'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED')
  })
})
