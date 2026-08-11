import { describe, expect, it } from 'vitest'
import { parseEmergenceEventDraft } from '@/services/generationEmergence'

// A2 回归测试：sourceRefs 上限须与 emergenceScheduler.MAX_SOURCE_REFS (=8) 对齐，
// 否则 scheduler 输出 8 条 → 经 parseEmergenceEventDraft round-trip 后被截到 6 条。
// 见 docs/agent-runs/audit-pass2-plan.md Phase A2。

function buildValidDraft(overrides = {}) {
  return JSON.stringify({
    placeId: 'place_test',
    title: '一场边境冲突',
    summary: '两队人马在边境相遇，气氛紧张，随时可能擦枪走火。',
    participants: ['甲', '乙'],
    factions: ['势力A'],
    choices: [
      { id: 'c1', label: '正面交锋', intent: '战斗', risk: '高' },
      { id: 'c2', label: '撤退', intent: '回避', risk: '低' }
    ],
    changes: [{ op: 'merge', path: 'flags', value: { eventTriggered: true } }],
    ...overrides
  })
}

describe('A2 — sourceRefs 上限对齐 scheduler (8 条)', () => {
  it('8 条 sourceRefs round-trip 后仍为 8 条（不被截到 6）', () => {
    const eightRefs = Array.from({ length: 8 }, (_, i) => ({
      type: 'candidate',
      id: `S${i + 1}`
    }))
    const draft = buildValidDraft({ sourceRefs: eightRefs })

    const parsed = parseEmergenceEventDraft(draft, {
      candidateId: 'cand_1',
      sourceRefs: eightRefs
    })

    expect(parsed).not.toBeNull()
    expect(parsed.sourceRefs).toHaveLength(8)
    // 确认全部保留，无截断
    expect(parsed.sourceRefs.map((r) => r.id)).toEqual(
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
    )
  })

  it('超过 8 条的 sourceRefs 被截到 8（上限仍生效）', () => {
    const tenRefs = Array.from({ length: 10 }, (_, i) => ({
      type: 'candidate',
      id: `S${i + 1}`
    }))
    const draft = buildValidDraft({ sourceRefs: tenRefs })

    const parsed = parseEmergenceEventDraft(draft, {
      candidateId: 'cand_1',
      sourceRefs: tenRefs
    })

    expect(parsed).not.toBeNull()
    expect(parsed.sourceRefs).toHaveLength(8)
  })

  it('participants 仍受 MAX_ARRAY_ITEMS=6 约束（不受 sourceRefs 放宽影响）', () => {
    const eightParticipants = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛']
    const draft = buildValidDraft({ participants: eightParticipants })

    const parsed = parseEmergenceEventDraft(draft, {
      candidateId: 'cand_1',
      allowedParticipants: eightParticipants
    })

    expect(parsed).not.toBeNull()
    expect(parsed.participants).toHaveLength(6) // 仍是 6，不被 sourceRefs 的 8 带宽
  })
})
