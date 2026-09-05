import { describe, expect, it } from 'vitest'
import {
  normalizeBookWorldbookBinding,
  resolveBookWorldbookStatus,
  previewWorldbookRebind
} from '../services/agents/authoring/authoringProjectWorldbook.js'

// worldbook scene closure Task 2：每本书显式绑定一个世界书。
// 绑定是书的数据，不是全局 active 状态的隐式回退。

describe('authoring project worldbook binding', () => {
  it("normalizes the binding id to a trimmed string（合并4例）", async () => {
{
expect(normalizeBookWorldbookBinding({ worldbookId: 42 })).toBe('42')
    expect(normalizeBookWorldbookBinding({ worldbookId: ' wb-1 ' })).toBe('wb-1')
    expect(normalizeBookWorldbookBinding({})).toBe('')
    expect(normalizeBookWorldbookBinding(null)).toBe('')
}
{
expect(resolveBookWorldbookStatus({ book: {}, worldbooks: [] }))
      .toMatchObject({ status: 'unbound', worldbookId: '', worldbook: null })
    expect(resolveBookWorldbookStatus({
      book: { worldbookId: 'wb-missing' }, worldbooks: []
    })).toMatchObject({ status: 'missing', worldbookId: 'wb-missing', worldbook: null })
    expect(resolveBookWorldbookStatus({
      book: { worldbookId: 'wb-1' },
      worldbooks: [{ id: 'wb-1', name: '海港世界' }, { id: 'wb-2', name: '另一世界' }]
    })).toMatchObject({ status: 'bound', worldbookId: 'wb-1', worldbook: { id: 'wb-1' } })
}
{
expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: 'wb-old' }] }] },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
    // 同一绑定：无需确认。
    expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: 'wb-old' }] }] },
      nextWorldbookId: 'wb-old'
    })).toMatchObject({ affectedAnchorCount: 0, requiresConfirmation: false })
    // 未锚定到旧世界书的章节不受影响。
    expect(previewWorldbookRebind({
      book: { worldbookId: 'wb-old', chapters: [{ sceneAnchors: [{ worldbookId: '' }, {}] }] },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 0, requiresConfirmation: false })
}
{
// 计划定义：非空 worldbookId ≠ 目标 ID 即受影响（含指向其他世界书的锚点）；
    // 空/缺失 worldbookId 的锚点不受影响；畸形章节安全跳过。
    expect(previewWorldbookRebind({
      book: {
        worldbookId: 'wb-old',
        chapters: [
          null,
          { sceneAnchors: [{ worldbookId: 'wb-other' }, { unitId: 'u1' }] },
          { sceneAnchors: 'not-an-array' }
        ]
      },
      nextWorldbookId: 'wb-new'
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
    // 解绑（目标为空）会让所有已绑定世界书的锚点失效。
    expect(previewWorldbookRebind({
      book: {
        worldbookId: 'wb-old',
        chapters: [{ sceneAnchors: [{ worldbookId: 'wb-other' }, { unitId: 'u1' }] }]
      },
      nextWorldbookId: ''
    })).toMatchObject({ affectedAnchorCount: 1, requiresConfirmation: true })
}
})
})

// —— 复验修复 2：绑定同步的时序安全（行为测试，非源码 pin）——
import { createBoundWorldbookSync, buildChapterBoundaryPayload } from '../services/agents/authoring/authoringProjectWorldbook.js'
import { vi } from 'vitest'

describe('createBoundWorldbookSync timing safety', () => {
  function makeSync() {
    return createBoundWorldbookSync({
      loadWorldbookForProject: vi.fn(async (id) => ({ id, name: `wb-${id}` }))
    })
  }

  it("clears the previous binding synchronously when a new book activates（合并4例）", async () => {
{
const sync = makeSync()
    await sync.sync({ id: 'book-1', worldbookId: 'wb-old' }, 'book-1')
    expect(sync.boundWorldbook.value?.id).toBe('wb-old')

    // 激活新书：在加载 promise resolve 之前，旧绑定必须已经不可见。
    const pending = sync.sync({ id: 'book-2', worldbookId: 'wb-new' }, 'book-2')
    expect(sync.boundWorldbook.value).toBe(null)
    expect(sync.ready()).toBe(false)
    await pending
    expect(sync.boundWorldbook.value?.id).toBe('wb-new')
    expect(sync.ready()).toBe(true)
}
{
let releaseFirst
    const slow = createBoundWorldbookSync({
      loadWorldbookForProject: vi.fn((id) => id === 'wb-slow'
        ? new Promise((resolve) => { releaseFirst = resolve })
        : Promise.resolve({ id, name: id }))
    })
    const first = slow.sync({ id: 'book-1', worldbookId: 'wb-slow' }, 'book-1')
    // 用户切到另一本书；慢返回随后才完成。
    const second = slow.sync({ id: 'book-2', worldbookId: 'wb-fast' }, 'book-2')
    releaseFirst({ id: 'wb-slow' })
    await first
    await second
    // 迟到的旧书世界书不得覆盖新书绑定。
    expect(slow.boundWorldbook.value?.id).toBe('wb-fast')
}
{
const sync = makeSync()
    await sync.sync({ id: 'book-1', worldbookId: 'wb-a' }, 'book-1')
    const result = await sync.sync({ id: 'book-2' }, 'book-2')
    expect(result).toBe(null)
    expect(sync.boundWorldbook.value).toBe(null)
    expect(sync.ready()).toBe(true)
}
{
// 换书边界：memoryProjectId 必须是旧项目 ID，即使调用时新 ID 已知。
    const payload = buildChapterBoundaryPayload({
      previousChapterId: 'ch-old',
      previousProjectId: 'book-old',
      text: '旧章正文',
      revision: 'rev-9'
    })
    expect(payload).toMatchObject({
      scopeKey: 'chapter:ch-old',
      memoryProjectId: 'book-old',
      revision: 'rev-9'
    })
    expect(payload.sourceRefs).toEqual(['chapter:ch-old'])
    // 无出向章节（首本书）不产生 boundary。
    expect(buildChapterBoundaryPayload({ previousChapterId: '', previousProjectId: 'book-x' })).toBe(null)
}
})
})
