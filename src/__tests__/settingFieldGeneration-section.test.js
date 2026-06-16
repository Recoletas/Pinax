import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSettingSectionDraft } from '../services/settingFieldGeneration'
import * as genSvc from '../services/generationService'
import * as apiMod from '../services/api'

// mock api → 返回合法 settings（让 generateSettingFieldDraft 进入 runGenerationTask）
vi.spyOn(apiMod, 'getResolvedApiSettings').mockResolvedValue({
  baseUrl: 'http://x',
  apiKey: 'k',
  model: 'm'
})

function makeWorldbook() {
  return {
    id: 'wb-1',
    name: 'Test WB',
    structuredSettings: {
      world: { origin: 'a', powerSystem: 'b', geography: '', history: '', factions: '', rules: '' }
    }
  }
}

describe('generateSettingSectionDraft — 串行 + cooperative abort', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // 重新 mock 基础 api（restoreAllMocks 会清掉）
    vi.spyOn(apiMod, 'getResolvedApiSettings').mockResolvedValue({
      baseUrl: 'http://x',
      apiKey: 'k',
      model: 'm'
    })
  })

  it('顺序产出 3 字段结果', async () => {
    const callOrder = []
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async ({ baseMessages }) => {
      // 从 prompt 中提取 fieldKey
      const match = baseMessages[1].content.match(/目标字段：(.+)/)
      const label = match ? match[1] : '?'
      callOrder.push(label)
      return { success: true, content: `content-${label}`, parsed: `content-${label}` }
    })

    const results = await generateSettingSectionDraft({
      sectionKey: 'world',
      worldbook: makeWorldbook(),
      userBrief: 'short tone'
    })

    expect(callOrder).toEqual(['世界起源', '力量体系', '地理环境', '历史线', '势力分布', '世界规则'])
    expect(results.size).toBe(6)
    expect(results.get('origin').ok).toBe(true)
    expect(results.get('origin').content).toBe('content-世界起源')
    expect(results.get('rules').index).toBe(5)
  })

  it('userBrief 透传到每字段的 baseMessages', async () => {
    const calls = []
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async ({ baseMessages }) => {
      const last = baseMessages[1].content
      calls.push(last.includes('用户补充要求：gothic style'))
      return { success: true, content: 'x', parsed: 'x' }
    })

    await generateSettingSectionDraft({
      sectionKey: 'world',
      worldbook: makeWorldbook(),
      userBrief: 'gothic style'
    })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(Boolean)).toBe(true)
  })

  it('单字段失败 → 后续字段继续，结果中带 reason', async () => {
    let i = 0
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async () => {
      i++
      if (i === 2) return { success: false, error: 'rate limit' }
      return { success: true, content: `c-${i}`, parsed: `c-${i}` }
    })

    const results = await generateSettingSectionDraft({
      sectionKey: 'world',
      worldbook: makeWorldbook()
    })

    expect(results.get('origin').ok).toBe(true)
    expect(results.get('powerSystem').ok).toBe(false)
    expect(results.get('powerSystem').reason).toBeTruthy()
    expect(results.get('geography').ok).toBe(true)
  })

  it('cooperative abort — 在 await 之后检查 signal，停止后续字段', async () => {
    const callOrder = []
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async () => {
      callOrder.push(callOrder.length + 1)
      // 模拟网络延迟
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { success: true, content: 'x', parsed: 'x' }
    })

    const ac = new AbortController()
    // 在第 2 字段完成时 abort（第 3 字段开始前）
    setTimeout(() => ac.abort(), 25)

    const results = await generateSettingSectionDraft({
      sectionKey: 'world',
      worldbook: makeWorldbook(),
      signal: ac.signal
    })

    // 已完成的字段保留为 ok=true；后续未开始的字段不应在 results 中
    expect(callOrder.length).toBeGreaterThanOrEqual(1)
    expect(callOrder.length).toBeLessThan(6)
    // 至少有一个字段是 aborted（in-flight 完成后被丢弃）
    const aborted = [...results.values()].find((r) => r.reason === 'aborted')
    expect(aborted).toBeDefined()
  })

  it('in-flight 任务不被 signal 强制取消 — 完成后结果被丢弃', async () => {
    let resolveInFlight
    const inFlight = new Promise((resolve) => { resolveInFlight = resolve })

    let callIdx = 0
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async () => {
      callIdx++
      if (callIdx === 1) {
        // 第 1 字段 in-flight 时 abort 已触发，但 runGenerationTask 不会感知
        await inFlight
        return { success: true, content: 'late content', parsed: 'late content' }
      }
      return { success: true, content: `c-${callIdx}`, parsed: `c-${callIdx}` }
    })

    const ac = new AbortController()
    ac.abort()  // 调用前就 abort

    const promise = generateSettingSectionDraft({
      sectionKey: 'world',
      worldbook: makeWorldbook(),
      signal: ac.signal
    })

    // 让 microtask 跑：第一个字段 await 之前检查 signal → 应直接 break
    await new Promise((r) => setTimeout(r, 10))

    // 现在 resolve in-flight 任务（已经在第 1 字段 await 中）
    resolveInFlight()

    const results = await promise
    // 第 1 字段应被标记为 aborted（break 之前已经 set entry）
    expect(results.get('origin').reason).toBe('aborted')
    // 后续字段不应在 results 中
    expect(results.has('powerSystem')).toBe(false)
  })

  it('sectionKey 不存在 → 空 Map', async () => {
    const results = await generateSettingSectionDraft({
      sectionKey: 'nonexistent',
      worldbook: makeWorldbook()
    })
    expect(results.size).toBe(0)
  })
})
