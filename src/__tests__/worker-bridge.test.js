import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let remoteApi = {
  generateMap: vi.fn(),
}

vi.mock('comlink', () => ({
  wrap: vi.fn(() => remoteApi),
}))

import {
  generateMapInWorker,
  serializeConfigForWorker,
  terminateWorker,
} from '../services/world-map/engine/worker-bridge'

/**
 * 防御 structuredClone 错误
 *
 * 历史：postMessage 走 structuredClone；Vue 响应式 proxy（嵌套数组等）
 * 不能被 structuredClone 克隆。`WorldMapVoronoi.vue` 之前自己用
 * `JSON.parse(JSON.stringify(cfg))` 兜底，但容易遗漏。
 *
 * 现在 worker-bridge 边界处强制序列化一次，无论调用方是否记得兜底，
 * 都不会让 proxy 漏到 postMessage。
 */

function reactive(target) {
  return new Proxy(target, {
    get(t, p) {
      const v = t[p]
      if (v && typeof v === 'object') return reactive(v)
      return v
    },
    set(t, p, v) { t[p] = v; return true },
  })
}

class FakeWorker {
  constructor() {
    this.terminate = vi.fn()
  }
}

beforeAll(() => {
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  terminateWorker()
  remoteApi = {
    generateMap: vi.fn(),
  }
  vi.useRealTimers()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('serializeConfigForWorker', () => {
  it('嵌套 reactive proxy → 纯对象（新 realism 形态）', () => {
    const proxy = reactive({
      width: 1200,
      height: 800,
      seed: 'test',
      plateCount: 6,
      realism: { rivers: { style: 'meandering' } },
    })
    const plain = serializeConfigForWorker(proxy)
    expect(plain).toEqual({
      width: 1200,
      height: 800,
      seed: 'test',
      plateCount: 6,
      realism: { rivers: { style: 'meandering' } },
    })
    expect(() => structuredClone(plain)).not.toThrow()
  })

  it('纯对象 → 原样输出', () => {
    const cfg = { width: 1200, seed: 'a' }
    expect(serializeConfigForWorker(cfg)).toEqual(cfg)
  })

  it('空对象 → 正常', () => {
    expect(serializeConfigForWorker({})).toEqual({})
  })

  it('数组里的 proxy 也能剥掉', () => {
    const proxy = reactive({
      stateNames: reactive(['阿尔卡迪亚', '碧波王国']),
    })
    const plain = serializeConfigForWorker(proxy)
    expect(plain.stateNames).toEqual(['阿尔卡迪亚', '碧波王国'])
    expect(Array.isArray(plain.stateNames)).toBe(true)
  })

  it('结果可被 structuredClone 克隆（防御 sanity check）', () => {
    const proxy = reactive({ realism: { rivers: { style: 'meandering' } } })
    const plain = serializeConfigForWorker(proxy)
    expect(() => structuredClone(plain)).not.toThrow()
  })
})

describe('generateMapInWorker', () => {
  it('成功时保持原有返回结构', async () => {
    const result = {
      data: { name: 'test-world' },
      meta: { totalMs: 12, timings: [], seed: 'seed-1' },
    }
    remoteApi.generateMap.mockResolvedValue(result)

    await expect(generateMapInWorker({ seed: 'seed-1' })).resolves.toEqual(result)
    expect(remoteApi.generateMap).toHaveBeenCalledWith({ seed: 'seed-1' }, {})
  })

  it('worker / engine 抛错时包装为 ENGINE typed error', async () => {
    remoteApi.generateMap.mockRejectedValue(new Error('boom'))

    await expect(generateMapInWorker({ seed: 'seed-2' })).rejects.toMatchObject({
      name: 'WorkerBridgeError',
      code: 'ENGINE',
      message: '地图生成失败：boom',
    })
  })

  it('超时时返回 TIMEOUT typed error', async () => {
    vi.useFakeTimers()
    remoteApi.generateMap.mockImplementation(() => new Promise(() => {}))

    const pending = generateMapInWorker({ seed: 'seed-3' })
    const captured = pending.catch(error => error)
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(captured).resolves.toMatchObject({
      name: 'WorkerBridgeError',
      code: 'TIMEOUT',
      message: '地图生成超时（60s）',
    })
  })
})
