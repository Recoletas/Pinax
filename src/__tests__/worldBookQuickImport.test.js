import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import WorldBookQuickImport from '@/pages/WorldBookQuickImport.vue'
import StructuredSettingsPanel from '@/components/worldbook/StructuredSettingsPanel.vue'
import { useWorldStore } from '@/stores/worldStore'
import {
  buildFoundationPayloadFromAiResult,
  buildPendingPayload,
  createSourceDocument,
  createWorldbookFromPayload,
  normalizeGeneratedEntry
} from '@/services/worldbookQuickImportHelpers'
import {
  buildWorldbookImportPreview,
  normalizeWorldbookAiResult,
  parseJsonFromAiContent
} from '@/services/worldbookImportGeneration'
import {
  buildFallbackResearchQueries,
  buildIncrementalResearchQuery,
  mergeResearchSources,
  normalizeWorldbookResearchSettings,
  researchWorldbookGap
} from '@/services/worldbookResearch'
import { selectSourceChunks } from '@/services/worldbookSourceSelection'
import {
  normalizeResearchFetchRequest,
  normalizeResearchRequest,
  runWebResearch,
  buildEvidenceBlocks
} from '../../server/services/webResearchService'
import {
  excludeResearchSource,
  normalizeResearchClaims,
  normalizeResearchConflicts,
  refreshResearchReview
} from '@/services/worldbookResearchClaims'
import { createResearchRevision } from '@/services/worldbookResearchRevision'
import {
  buildSettingGenerationMessages,
  extractSettingContent,
  generateSettingDraftRevision,
  generateSettingCandidates,
  generateSettingSectionDraftBatch,
  generateSettingSectionDraft,
  getMeaningfulWorldDescription,
  getStructuredGenerationTimeout,
  hasSettingGenerationBasis,
  isSettingDraftValid,
  isStructuredSettingRevisionCurrent
} from '@/services/settingFieldGeneration'
import { parseCharacterCards } from '@/services/characterCard'
import {
  buildWorldbookMaintenanceMessages,
  chunkWorldbookAuditTargets,
  findWorldbookAuditCandidates,
  findWorldbookAuditTargets,
  normalizeWorldbookMaintenanceResult
} from '@/services/worldbookMaintenance'
import {
  archiveSourceDocuments,
  buildSourceArchiveBundle,
  createCreationWorkspace,
  dedupeSourceChunks,
  deleteSourceArchiveArtifacts,
  estimateSourceArchiveUsage,
  loadSourceArtifacts,
  loadSourceChunks,
  saveCreationWorkspace,
  saveSourceArchiveBundle,
  SOURCE_ARCHIVE_CAPACITY_BYTES
} from '@/services/worldbookSourceArchive'
import {
  getCreationGenerationFailure,
  getCreationGenerationLabel,
  getCreationSourceResultState
} from '@/services/worldbookCreationState'
import { groupSettingCandidates } from '../../shared/structuredSettingCandidateContract.js'
import {
  detectSourceKind,
  parseSourceFile,
  parseSourceFiles
} from '@/services/worldbookSourceAdapters'
import { parseSourceFilesWithWorker } from '@/services/worldbookSourceParser'

function createFixturePdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets[index + 1] = output.length
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(output).buffer
}
import {
  getPlacePayloadFromEntry,
  normalizePlacePayload,
  validatePlacePayload
} from '../../shared/placeEntryContract.js'
import {
  buildSettingPlacesRequest,
  classifyPlaceDrafts,
  generatePlacesFromOverview
} from '@/services/settingPlaceGeneration'
import { extractTextContent } from '../../server/routes/chat'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRoute: () => ({ name: 'settings-worldbook', query: {} }),
    useRouter: () => ({ push: routerPush }),
    RouterLink: { template: '<a><slot /></a>' }
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'welcome', component: { template: '<div />' } },
    { path: '/opening', name: 'opening', component: { template: '<div />' } },
    { path: '/settings/worldbook', name: 'settings-worldbook', component: WorldBookQuickImport },
    { path: '/settings/worldbook/advanced', name: 'settings-worldbook-advanced', component: { template: '<div />' } },
    { path: '/settings/structured', name: 'settings-structured', component: { template: '<div />' } },
    { path: '/settings/world-map', name: 'settings-world-map', component: { template: '<div />' } }
  ]
})

function mockWorldStoreLifecycle() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorldStore()
  // Stub mount lifecycle so localStorage / auto-create don't pollute state.
  store.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
  store.ensureActiveWorldbook = vi.fn().mockResolvedValue(undefined)
  return store
}

describe('WorldBookQuickImport 主页 (S17 简化)', () => {
  beforeEach(() => {
    localStorage.clear()
    routerPush.mockClear()
  })

  it('S17-1: 渲染 1 屏 4 段 (SettingsSectionNav + Hero + MyWorldbooks + Preset + Extra)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.settings-section-nav').exists()).toBe(true)
    expect(wrapper.find('.worldbook-hero').exists()).toBe(true)
    expect(wrapper.find('.my-worldbooks').exists()).toBe(true)
    expect(wrapper.find('.preset-grid').exists()).toBe(true)
    expect(wrapper.find('.quick-extra').exists()).toBe(true)
    expect(wrapper.findAll('.settings-section-tab')).toHaveLength(3)
    expect(wrapper.find('[data-test="settings-section-tab-worldbook"]').exists()).toBe(false)
    wrapper.unmount()

    const pinia = createPinia()
    setActivePinia(pinia)
    localStorage.setItem('worldbook:setting-drafts:wb-review-queue', JSON.stringify({
      version: 1,
      activeSectionKey: 'world',
      focused: { sectionKey: 'world', fieldKey: 'origin' },
      drafts: {
        world: {
          origin: { fieldKey: 'origin', fieldLabel: '世界起源', content: '潮汐从无光之地升起。' },
          geography: { fieldKey: 'geography', fieldLabel: '地理', content: '旧港沿着退潮后的盐脊展开。' }
        }
      }
    }))

    const panelWrapper = mount(StructuredSettingsPanel, {
      props: {
        worldbook: {
          id: 'wb-review-queue',
          name: '审阅队列测试',
          updatedAt: 1,
          structuredSettings: { world: { origin: '', geography: '' } },
          entries: []
        }
      },
      global: {
        plugins: [pinia],
        stubs: {
          SettingFieldCard: { template: '<div />' },
          SettingDraftReview: {
            props: ['draft'],
            template: '<button data-test="active-draft" type="button" @click="$emit(\'close\')">{{ draft.fieldKey }}</button>'
          },
          GenerationBriefBar: { template: '<div />' },
          GenerationStatus: { template: '<div />' },
          PlaceCatalog: { template: '<div />' },
          WorkbenchIcon: { template: '<span />' }
        }
      }
    })
    await nextTick()

    const queue = panelWrapper.find('[aria-label="待审 AI 草稿"]')
    expect(queue.exists()).toBe(true)
    expect(queue.findAll('button')).toHaveLength(2)
    expect(panelWrapper.find('[data-test="active-draft"]').text()).toBe('origin')

    await queue.findAll('button')[1].trigger('click')
    await nextTick()
    expect(panelWrapper.find('[data-test="active-draft"]').text()).toBe('geography')
    await panelWrapper.find('[data-test="active-draft"]').trigger('click')
    await nextTick()
    expect(panelWrapper.find('[data-test="active-draft"]').exists()).toBe(false)
    const persistedReview = JSON.parse(localStorage.getItem('worldbook:setting-drafts:wb-review-queue'))
    expect(persistedReview.focused).toBeNull()
    expect(persistedReview.drafts.world.geography.content).toContain('旧港')
    panelWrapper.unmount()
  })

  it('S17-2: Hero card 显示默认 preset 的 name + hook + briefing 3 chip', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const hero = wrapper.find('.worldbook-hero')
    expect(hero.text()).toContain('边境王国')
    expect(hero.findAll('.worldbook-hero__briefing li')).toHaveLength(3)
  })

  it('S17-3b: hero 显示当前世界书时，「开始冒险」不再重复生成新世界书', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [{ id: 'wb-active', name: '我的世界', entryCount: 0 }]
    worldStore.activeWorldbook = { id: 'wb-active', name: '我的世界', entries: [] }
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const hero = wrapper.find('.worldbook-hero')
    expect(hero.text()).toContain('我的世界')
    await wrapper.find('[data-test="hero-cta"]').trigger('click')
    await flushPromises()
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-3c: 同 preset 第二次点击直接复用既有副本，不新建第二份', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [
      { id: 'wb-existing', name: '边境王国副本', entryCount: 39, sourcePresetId: 'preset-border' }
    ]
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new', name: '新的' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    worldStore.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
    const preset = { id: 'preset-border', name: '边境王国', entries: [], groups: [] }
    const { enterPresetWorld } = await import('@/services/worldbookQuickImportHelpers')
    const created = await enterPresetWorld(worldStore, { push: vi.fn() }, preset)
    expect(created?.id).toBe('wb-existing')
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-3d: 旧版本副本没有 sourcePresetId，但内容签名一致时也能复用', async () => {
    const worldStore = mockWorldStoreLifecycle()
    const preset = {
      id: 'preset-border',
      name: '边境王国',
      description: 'desc',
      entries: [{ name: 'c2' }, { name: 'c1' }],
      groups: []
    }
    const { presetSignature, enterPresetWorld } = await import('@/services/worldbookQuickImportHelpers')
    const sig = presetSignature(preset)
    // 旧版本产生的副本：没有 sourcePresetId，只有 presetSignature
    worldStore.worldbooksIndex = [
      { id: 'wb-legacy', name: '边境王国副本', entryCount: 39, presetSignature: sig }
    ]
    worldStore.createWorldbook = vi.fn().mockResolvedValue({ id: 'wb-new' })
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    worldStore.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
    worldStore.addEntry = vi.fn().mockResolvedValue(undefined)
    worldStore.updateWorldbook = vi.fn().mockResolvedValue(undefined)
    const created = await enterPresetWorld(worldStore, { push: vi.fn() }, preset)
    expect(created?.id).toBe('wb-legacy')
    expect(worldStore.createWorldbook).not.toHaveBeenCalled()
  })

  it('S17-4: MyWorldbooks select 切换 → 调 worldStore.setActiveWorldbook', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [
      { id: 'wb-1', name: '边境小镇', entryCount: 12 },
      { id: 'wb-2', name: '灯塔档案', entryCount: 8 }
    ]
    worldStore.activeWorldbook = worldStore.worldbooksIndex[0]
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.exists()).toBe(true)
    await select.setValue('wb-2')
    expect(worldStore.setActiveWorldbook).toHaveBeenCalledWith('wb-2')

    worldStore.activeWorldbook = worldStore.worldbooksIndex[1]
    await nextTick()
    await wrapper.find('[data-test="hero-cta"]').trigger('click')
    expect(routerPush).toHaveBeenLastCalledWith({
      name: 'experience',
      query: { worldbookId: 'wb-2' }
    })
  })

  it('S17-5: 辅助入口突出结构化设定，保留导入与基调初始化', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const importBtn = wrapper.find('[data-test="extra-btn-import"]')
    const aiBtn = wrapper.find('[data-test="extra-btn-ai"]')
    const structuredBtn = wrapper.find('[data-test="extra-btn-structured"]')
    expect(structuredBtn.text()).toBe('编辑结构化设定')
    expect(importBtn.text()).toBe('导入小说 / JSON')
    expect(aiBtn.text()).toBe('AI 建立基调')
    await structuredBtn.trigger('click')
    await importBtn.trigger('click')
    await aiBtn.trigger('click')
    expect(importBtn.exists()).toBe(true)
    expect(aiBtn.exists()).toBe(true)
  })

  it('S17-6: 空状态 (worldbooksIndex 为空) → select 灰显 "暂无世界书"', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.text()).toContain('暂无世界书')
  })

  it('S17-7: Preset 网格显示前 5 个 preset (cap 5)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.preset-card')
    expect(cards.length).toBeLessThanOrEqual(5)
    expect(cards.length).toBeGreaterThan(0)
  })
})

describe('世界书创建工作区来源与 adapter 合同 (U1/U2)', () => {
  it('规范化、去重、归档并隔离多文件解析结果', async () => {
    const bundle = buildSourceArchiveBundle({
      id: 'source-ledger',
      title: '税册',
      kind: 'text-file',
      sourceLabel: '本地资料',
      content: '第一段\r\n\r\n第二段',
      chunkSize: 200
    })

    expect(bundle.artifact).toMatchObject({
      id: 'source-ledger',
      title: '税册',
      kind: 'text-file',
      originalLength: 10,
      normalizedLength: 8
    })
    expect(bundle.artifact).not.toHaveProperty('content')
    expect(bundle.artifact.chunkIds).toEqual(bundle.chunks.map((chunk) => chunk.id))
    expect(bundle.chunks).toHaveLength(1)
    expect(bundle.chunks[0]).toMatchObject({
      sourceId: 'source-ledger',
      text: '第一段\n\n第二段',
      locator: { type: 'offset', start: 0, end: 8 }
    })
    const first = buildSourceArchiveBundle({ id: 's1', title: '甲', content: '同一段资料' })
    const second = buildSourceArchiveBundle({ id: 's2', title: '乙', content: '同一段资料' })
    const similar = buildSourceArchiveBundle({ id: 's3', title: '丙', content: '同一段资料。' })

    const result = dedupeSourceChunks([
      ...first.chunks,
      ...second.chunks,
      ...similar.chunks
    ])

    expect(result.chunks).toHaveLength(2)
    expect(result.duplicateCount).toBe(1)
    expect(result.chunks.find((chunk) => chunk.text === '同一段资料').sourceRefs)
      .toEqual([{ sourceId: 's1', locator: { type: 'offset', start: 0, end: 5 } }, { sourceId: 's2', locator: { type: 'offset', start: 0, end: 5 } }])
    const workspace = createCreationWorkspace({
      id: 'creation-1',
      mode: 'sources',
      name: '潮汐港',
      sourceIds: ['s1'],
      selectedSourceIds: ['s1'],
      brief: '潮汐会改写港城记忆。',
      foundationDraft: { worldDescription: '一座受潮汐支配的港城。' }
    })

    expect(workspace).toMatchObject({
      schemaVersion: 1,
      id: 'creation-1',
      mode: 'sources',
      sourceIds: ['s1'],
      selectedSourceIds: ['s1'],
      brief: '潮汐会改写港城记忆。',
      status: 'draft',
      generationState: 'idle',
      generationAction: '',
      generationErrorCode: ''
    })
    expect(workspace.foundationDraft).toEqual({ worldDescription: '一座受潮汐支配的港城。' })
    await expect(saveCreationWorkspace(createCreationWorkspace({
      id: 'creation-over-capacity',
      brief: 'x'.repeat(SOURCE_ARCHIVE_CAPACITY_BYTES + 1)
    }))).rejects.toMatchObject({ code: 'quota-exceeded' })
    expect(getCreationGenerationLabel('partial')).toBe('部分完成')
    expect(getCreationSourceResultState({ readyCount: 2, failedCount: 1 })).toBe('partial')
    expect(getCreationGenerationFailure({ code: 'ECONNABORTED', message: '请求超时' })).toMatchObject({
      code: 'timeout'
    })
    expect(createCreationWorkspace({
      sourceFailures: [{ title: '扫描件.pdf', status: 'needs-ocr', error: { code: 'needs-ocr', message: '需要 OCR' } }]
    }).sourceFailures).toEqual([{
      id: 'failed-source-1',
      title: '扫描件.pdf',
      kind: 'text-file',
      status: 'needs-ocr',
      error: { code: 'needs-ocr', message: '需要 OCR' }
    }])
    const savedBundle = await saveSourceArchiveBundle(first)
    expect(await loadSourceArtifacts([savedBundle.artifact.id])).toMatchObject([
      { id: 's1', title: '甲', normalizedLength: 5 }
    ])
    expect(await loadSourceChunks(savedBundle.artifact.chunkIds)).toMatchObject([
      { sourceId: 's1', text: '同一段资料' }
    ])
    const reusedBundle = await saveSourceArchiveBundle(second)
    expect(reusedBundle.reused).toBe(true)
    expect(reusedBundle.artifact.id).toBe('s1')
    expect((await estimateSourceArchiveUsage()).artifactCount).toBeGreaterThanOrEqual(1)
    const batchArchived = await archiveSourceDocuments([
      { id: 'batch-a', title: '批次甲', content: '跨工作区批量复用的同一份资料。' },
      { id: 'batch-b', title: '批次乙', content: '跨工作区批量复用的同一份资料。' }
    ])
    expect(batchArchived.map((source) => source.id)).toEqual(['batch-a', 'batch-b'])
    expect(batchArchived[0].archiveRef).toBe(batchArchived[1].archiveRef)
    expect((await loadSourceChunks(batchArchived[0].chunkIds))[0].sourceRefs.map((ref) => ref.sourceId))
      .toEqual(expect.arrayContaining(['batch-a', 'batch-b']))
    expect((await estimateSourceArchiveUsage()).artifactCount).toBeGreaterThanOrEqual(2)
    setActivePinia(createPinia())
    const store = useWorldStore()
    const longText = `${'港口登记簿记录潮汐税制与船期变化。'.repeat(5000)}\n末页`
    const created = await createWorldbookFromPayload(store, buildPendingPayload({
      name: '来源归档测试',
      sourceDocuments: [createSourceDocument(longText, {
        id: 'legacy-source',
        title: '旧来源'
      })],
      entries: [{ name: '港口税制', type: 'lore', content: '按登记簿整理。' }]
    }))

    const source = created.sourceDocuments[0]
    expect(source).toMatchObject({
      id: 'legacy-source',
      archiveRef: 'legacy-source',
      contentPreview: expect.any(String),
      originalLength: longText.length
    })
    expect(source.content.length).toBeLessThan(longText.length)
    expect(source.chunkIds.length).toBeGreaterThan(1)
    store.activeWorldbook = null
    const rehydrated = await store.loadWorldbook(created.id)
    expect(rehydrated.sourceDocuments[0]).toMatchObject({
      archiveRef: 'legacy-source',
      contentHash: source.contentHash,
      chunkIds: source.chunkIds
    })
    const hydratedSourceRequests = []
    await generateSettingCandidates({
      sectionKey: 'world',
      fieldKeys: ['history'],
      userBrief: '请查找末页记录',
      worldbook: rehydrated,
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        hydratedSourceRequests.push(request)
        return { drafts: { candidates: [] } }
      }
    })
    expect(hydratedSourceRequests[0].context.sourceExcerpts).toContain('末页')

    const legacyWorldbookId = 'wb-legacy-source-migration'
    localStorage.setItem(`worldbook_${legacyWorldbookId}`, JSON.stringify({
      id: legacyWorldbookId,
      name: '旧资料迁移',
      entries: [],
      sourceDocuments: [{
        id: 'old-only-source',
        title: '旧版长资料',
        kind: 'text-file',
        content: '旧版本资料应自动注册到 source archive。'
      }]
    }))
    const migrated = await store.loadWorldbook(legacyWorldbookId)
    expect(migrated.sourceDocuments[0]).toMatchObject({
      archiveRef: 'old-only-source',
      chunkIds: expect.any(Array)
    })
    expect(JSON.parse(localStorage.getItem(`worldbook_${legacyWorldbookId}`)).sourceDocuments[0].archiveRef)
      .toBe('old-only-source')
    const importedFromPinax = await store.importFromSillyTavern({
      name: 'Pinax JSON 归档',
      entries: {
        voice_character: {
          key: ['陆沉'],
          comment: '陆沉',
          content: '巡夜人，习惯先核对事实。',
          extensions: {
            pinax_voice: {
              speechStyle: '短句，先复述事实再判断',
              samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
            }
          }
        }
      },
      extensions: {
        pinax_source_documents: [{
          id: 'pinax-json-source',
          title: 'JSON 来源',
          kind: 'text-file',
          content: '从 Pinax JSON 导入的资料也必须进入 source archive。'
        }]
      }
    })
    expect(importedFromPinax.sourceDocuments[0]).toMatchObject({
      archiveRef: 'pinax-json-source',
      chunkIds: expect.any(Array)
    })
    expect(importedFromPinax.entries[0]).toMatchObject({
      type: 'character',
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })
    const exportedWithVoice = await store.exportToSillyTavern(importedFromPinax.id)
    expect(exportedWithVoice.entries.voice_character.extensions.pinax_voice).toEqual({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })

    const ownerCreateCalls = []
    const ownerEntryCalls = []
    const owner = {
      createWorldbook: vi.fn().mockImplementation(async (input) => {
        ownerCreateCalls.push(input)
        return { id: 'wb-archived-source' }
      }),
      addEntry: vi.fn().mockImplementation(async (_id, input) => {
        ownerEntryCalls.push(input)
      }),
      updateWorldbook: vi.fn().mockResolvedValue(undefined)
    }
    const formalSource = {
      id: 's1',
      title: '甲',
      kind: 'text-file',
      content: '预览内容',
      sourceLabel: '本地资料',
      archiveRef: 's1',
      chunkIds: first.artifact.chunkIds,
      contentHash: first.artifact.contentHash,
      originalLength: first.artifact.originalLength,
      normalizedLength: first.artifact.normalizedLength,
      createdAt: first.artifact.createdAt,
      warnings: []
    }
    await createWorldbookFromPayload(owner, {
      name: '引用测试',
      entries: [{ name: '港口', type: 'location', content: '港口位于潮汐河口。' }]
    }, {
      sourceDocuments: [formalSource],
      archivedSourceDocuments: [formalSource]
    })
    expect(ownerCreateCalls[0].sourceDocuments).toEqual([formalSource])
    expect(ownerEntryCalls[0].metadata.sourceDocumentIds).toContain('s1')
    const rollbackOwner = {
      createWorldbook: vi.fn().mockResolvedValue({ id: 'wb-partial-import' }),
      addEntry: vi.fn().mockRejectedValue(Object.assign(new Error('storage quota'), {
        name: 'QuotaExceededError',
        code: 'quota-exceeded'
      })),
      deleteWorldbook: vi.fn().mockResolvedValue(undefined)
    }
    await expect(createWorldbookFromPayload(rollbackOwner, {
      name: '应回滚的导入',
      entries: [{ name: '条目', type: 'lore', content: '正文' }]
    }, {
      sourceDocuments: [],
      archivedSourceDocuments: []
    })).rejects.toMatchObject({ code: 'quota-exceeded' })
    expect(rollbackOwner.deleteWorldbook).toHaveBeenCalledWith('wb-partial-import')
    const quotaPinia = createPinia()
    setActivePinia(quotaPinia)
    const quotaStore = useWorldStore()
    await quotaStore.loadWorldbooksIndex()
    const nativeSetItem = Storage.prototype.setItem
    const quotaStorage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (String(key).startsWith('worldbook_')) {
        throw Object.assign(new Error('storage quota'), { name: 'QuotaExceededError' })
      }
      return nativeSetItem.call(this, key, value)
    })
    await expect(quotaStore.createWorldbook({ name: '不应写入的世界书' })).rejects.toMatchObject({
      name: 'QuotaExceededError',
      code: 'quota-exceeded'
    })
    expect(quotaStore.worldbooksIndex.some((item) => item.name === '不应写入的世界书')).toBe(false)
    quotaStorage.mockRestore()
    const selectedMaterial = selectSourceChunks({
      sourceDocuments: [
        { id: 'a', title: '港口账册', content: '普通税务记录。\n\n灯塔停摆当夜，港城失去航标。' },
        { id: 'b', title: '人物手记', content: '陆沉在雨夜收起手记。' }
      ],
      sectionLabel: '世界观',
      fieldLabel: '历史',
      userBrief: '灯塔停摆',
      maxChunks: 1
    })
    expect(selectedMaterial.context).toContain('灯塔停摆当夜')
    expect(selectedMaterial.coverage).toMatchObject({ sources: 1, availableSources: 2 })
    const repeatedMaterial = selectSourceChunks({
      sourceDocuments: [
        { id: 'same-a', title: '甲册', content: '同一条可验证的港口记录。' },
        { id: 'same-b', title: '乙册', content: '同一条可验证的港口记录。' }
      ],
      sectionLabel: '历史',
      fieldLabel: '港口记录',
      maxChunks: 4
    })
    expect(repeatedMaterial.chunks).toHaveLength(1)
    expect(repeatedMaterial.chunks[0].sourceRefs).toHaveLength(2)
    expect(repeatedMaterial.coverage.sources).toBe(2)
    expect(repeatedMaterial.context).toContain('same-a')
    expect(repeatedMaterial.context).toContain('same-b')
    const file = {
      name: '港口.md',
      type: '',
      size: 14,
      lastModified: 1,
      text: vi.fn().mockResolvedValue('# 港口\n\n潮汐税制')
    }

    expect(detectSourceKind(file)).toBe('markdown')
    const parseResult = await parseSourceFile(file)
    expect(parseResult).toMatchObject({ artifact: { kind: 'markdown', title: '港口.md' } })
    expect(parseResult.chunks[0].locator.type).toBe('offset')
    expect(parseResult.artifact.chunkIds).toEqual(parseResult.chunks.map((chunk) => chunk.id))
    const pdfBuffer = createFixturePdf('Pinax PDF fixture')
    const pdfResult = await parseSourceFile({
      name: 'fixture.pdf',
      type: 'application/pdf',
      size: pdfBuffer.byteLength,
      lastModified: 1,
      arrayBuffer: vi.fn().mockResolvedValue(pdfBuffer)
    })
    expect(pdfResult).toMatchObject({ artifact: { kind: 'pdf', title: 'fixture.pdf' } })
    expect(pdfResult.chunks.map((chunk) => chunk.text).join('\n')).toContain('Pinax PDF fixture')
    await expect(parseSourceFile({
      name: 'broken.pdf',
      type: 'application/pdf',
      size: 4,
      lastModified: 1,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer)
    })).rejects.toMatchObject({ code: 'pdf-parse-failed' })
    const docx = new JSZip()
    docx.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    docx.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    docx.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Pinax DOCX fixture</w:t></w:r></w:p></w:body></w:document>')
    const docxBuffer = await docx.generateAsync({ type: 'arraybuffer', compression: 'STORE' })
    const docxResult = await parseSourceFile({
      name: 'fixture.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: docxBuffer.byteLength,
      lastModified: 1,
      arrayBuffer: vi.fn().mockResolvedValue(docxBuffer)
    })
    expect(docxResult).toMatchObject({ artifact: { kind: 'docx', title: 'fixture.docx' } })
    expect(docxResult.chunks.map((chunk) => chunk.text).join('\n')).toContain('Pinax DOCX fixture')
    await expect(parseSourceFile({
      name: 'broken.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2,
      lastModified: 1,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer)
    })).rejects.toMatchObject({ code: 'docx-parse-failed' })
    const progress = []
    let parseMetrics = null
    const results = await parseSourceFiles([
      {
        name: 'ok.txt', type: 'text/plain', size: 4, lastModified: 1,
        text: vi.fn().mockResolvedValue('有效资料')
      },
      {
        name: 'bad.exe', type: 'application/octet-stream', size: 4, lastModified: 1,
        text: vi.fn()
      }
    ], {
      onProgress: (entry) => progress.push(entry),
      onMetrics: (metrics) => { parseMetrics = metrics }
    })

    expect(results.map((item) => item.status)).toEqual(['ready', 'error'])
    expect(progress.map((item) => item.index).sort((a, b) => a - b)).toEqual([0, 1])
    expect(progress.map((item) => item.status).sort()).toEqual(['error', 'ready'])
    expect(results[0].artifact.title).toBe('ok.txt')
    expect(results[1].error).toMatchObject({ code: 'unsupported-type' })
    expect(results[0].parseMetrics).toEqual(expect.objectContaining({
      durationMs: expect.any(Number),
      slow: expect.any(Boolean)
    }))
    expect(parseMetrics).toEqual(expect.objectContaining({
      fileCount: 2,
      slowFileCount: 0,
      durationMs: expect.any(Number)
    }))

    const workerResults = await parseSourceFilesWithWorker([{
      name: 'worker.txt', type: 'text/plain', size: 4, lastModified: 1,
      text: vi.fn().mockResolvedValue('Worker 资料')
    }])
    expect(workerResults).toMatchObject([{ status: 'ready', artifact: { title: 'worker.txt' } }])
    expect(workerResults[0].parseMetrics.durationMs).toEqual(expect.any(Number))
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(parseSourceFilesWithWorker([], { signal: cancelled.signal })).rejects.toMatchObject({
      name: 'AbortError',
      code: 'cancelled'
    })
    const slowCancel = new AbortController()
    const slowParsing = parseSourceFiles([{
      name: 'slow.txt', type: 'text/plain', size: 4, lastModified: 1,
      text: () => new Promise((resolve) => setTimeout(() => resolve('慢速资料'), 20))
    }], { signal: slowCancel.signal })
    setTimeout(() => slowCancel.abort(), 1)
    await expect(slowParsing).rejects.toMatchObject({ name: 'AbortError', code: 'cancelled' })
    let timeoutSignal
    const timedOut = await parseSourceFiles([{
      name: 'timeout.txt', type: 'text/plain', size: 4, lastModified: 1,
      text: (signal) => {
        timeoutSignal = signal
        return new Promise((resolve) => setTimeout(() => resolve('超时资料'), 20))
      }
    }], { parseTimeoutMs: 1 })
    expect(timedOut[0].error).toMatchObject({ code: 'parse-timeout' })
    expect(timeoutSignal?.aborted).toBe(true)
    const removed = await deleteSourceArchiveArtifacts(['s1'])
    expect(removed.deletedArtifactIds).toEqual(['s1'])
    expect(await loadSourceArtifacts(['s1'])).toEqual([])
  })
})

describe('GEO-HISTORY: worldStore normalizeWorldbook preserves geoHistory', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('createWorldbook keeps geoHistory and loadWorldbook re-normalizes to { nodes }', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({
      name: '有地图的世界',
      geoHistory: { version: 1, nodes: [{ id: 'n1', title: '建城', playable: true }] }
    })
    expect(wb.geoHistory).toEqual({ version: 1, nodes: [{ id: 'n1', title: '建城', playable: true }] })

    // re-hydrate from storage (exercises normalizeWorldbook on the raw record)
    const reloaded = await store.loadWorldbook(wb.id)
    expect(reloaded.geoHistory.nodes).toHaveLength(1)
    expect(reloaded.geoHistory.nodes[0].id).toBe('n1')

    const second = await store.createWorldbook({ name: '第二本世界书' })
    await store.setActiveWorldbook(second.id)
    setActivePinia(createPinia())
    const rehydratedStore = useWorldStore()
    await rehydratedStore.loadWorldbooksIndex()
    await rehydratedStore.ensureActiveWorldbook()
    expect(rehydratedStore.activeWorldbook?.id).toBe(second.id)
  })

  it('worldbook without map data imports with null geoHistory (does not block import)', async () => {
    const store = useWorldStore()
    const research = {
      provider: 'brave',
      queries: ['宋代港口 城市制度'],
      sources: [{ id: 'S1', title: '港口资料', url: 'https://example.com/port', snippet: '港口制度摘要' }]
    }
    const wb = await store.createWorldbook({ name: '无地图世界', research })
    expect(wb.geoHistory).toBeNull()
    expect(wb.research.sources[0].id).toBe('S1')

    const reloaded = await store.loadWorldbook(wb.id)
    expect(reloaded.geoHistory).toBeNull()
    expect(reloaded.research.queries).toEqual(['宋代港口 城市制度'])

    const place = normalizePlacePayload({
      name: '白石港',
      aliases: ['南港'],
      kind: 'port',
      scale: 'local',
      parentRef: { targetName: '南部海湾' },
      factionRef: { targetName: '潮汐议会' },
      terrainHints: ['coast'],
      relations: [{ type: 'route', targetName: '旧灯塔' }],
      description: '一座依靠旧灯塔维持航路的港城。',
      sourceEvidence: [{ excerpt: '白石港位于南部海岸。', source: '地理环境' }],
      reviewState: 'accepted',
      mapBinding: { status: 'confirmed', x: 10, y: 20 }
    })
    expect(place).toMatchObject({ name: '白石港', kind: 'port', aliases: ['南港'] })
    expect(validatePlacePayload(place, { entries: [] })).toMatchObject({ valid: true })
    expect(getPlacePayloadFromEntry({
      id: 'loc-white-harbor',
      type: 'location',
      name: '白石港',
      content: '一座依靠旧灯塔维持航路的港城。',
      metadata: { place: { kind: 'port', aliases: ['南港'], mapBinding: { status: 'confirmed', x: 10, y: 20 } } }
    })).toMatchObject({ name: '白石港', kind: 'port', aliases: ['南港'] })

    const storedPlace = await store.createPlace(wb.id, place)
    const editedPlace = await store.updatePlace(wb.id, storedPlace.id, {
      name: '白石港',
      aliases: ['南港'],
      kind: 'port',
      scale: 'local',
      terrainHints: ['coast'],
      description: '修订后的港城描述。',
      relations: []
    })
    expect(getPlacePayloadFromEntry(editedPlace)).toMatchObject({
      description: '修订后的港城描述。',
      mapBinding: { status: 'confirmed', x: 10, y: 20 },
      sourceEvidence: [expect.objectContaining({ excerpt: '白石港位于南部海岸。' })]
    })

    const overview = '高汤盆地北侧有白石港，旧商道连接白石港与灰锤堡。'
    expect(buildSettingPlacesRequest({
      worldbook: {
        id: 'wb-places',
        updatedAt: 7,
        structuredSettings: { world: { geography: overview } },
        entries: []
      }
    })).toMatchObject({ schemaId: 'setting-places.v1', target: { fieldKeys: ['geography'] } })
    const generated = await generatePlacesFromOverview({
      worldbook: {
        id: 'wb-places',
        updatedAt: 7,
        structuredSettings: { world: { geography: overview } },
        entries: []
      },
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async () => ({
        drafts: {
          places: [{
            name: '白石港', kind: 'port', scale: 'local', aliases: [],
            parentRef: '', factionRef: '', terrainHints: ['coast'],
            description: '一座港城。', evidence: '高汤盆地北侧有白石港',
            relations: [{ type: 'route', targetName: '灰锤堡' }]
          }]
        },
        fieldErrors: {}
      })
    })
    expect(generated).toMatchObject({ ok: true, drafts: [expect.objectContaining({ name: '白石港', classification: 'relation-pending', baseClassification: 'new' })] })
    expect(generated.drafts[0].defaultSelected).toBe(true)
    expect(classifyPlaceDrafts({
      worldbook: { entries: [{ id: 'old-port', type: 'location', name: '白石港', aliases: ['南港'], content: '旧港城。' }] },
      overview,
      places: [{ name: '白石港', kind: 'port', description: '港城。', evidence: '高汤盆地北侧有白石港', relations: [] }]
    })[0]).toMatchObject({ classification: 'update', targetEntryId: 'old-port' })

    const request = normalizeResearchRequest({
      provider: 'brave',
      queries: ['  港口制度  ', '', '港口制度', '城市地理'],
      maxResults: 99
    })
    expect(request.queries).toEqual(['港口制度', '城市地理'])
    expect(request.maxResults).toBe(6)
    expect(parseJsonFromAiContent('结果如下：\n```json\n{"entries":[{"name":"港口"}],"note":"brace } in text"}\n```\n')).toMatchObject({
      entries: [{ name: '港口' }]
    })
    const auditEntries = [
      { id: 'entry-a', name: '霜港商会', type: 'organization', keys: ['霜港', '商会'], content: '控制北境盐路，与地方议会共享航运利益。' },
      { id: 'entry-b', name: '北境盐路商会', type: 'organization', keys: ['盐路', '霜港'], content: '控制北境盐路，与地方议会共享航运利益。' },
      { id: 'entry-c', name: '旧灯塔', type: 'location', keys: ['灯塔'], content: '位于海湾南侧。' }
    ]
    expect(findWorldbookAuditCandidates(auditEntries)).toEqual([
      expect.objectContaining({ entryIds: ['entry-a', 'entry-b'] })
    ])
    expect(findWorldbookAuditCandidates([
      { id: 'weak-a', name: '叙事基调', type: 'style', keys: ['基调'], content: '保持克制、清晰的叙事语气。' },
      { id: 'weak-b', name: '基调', type: 'style', keys: ['写作风格'], content: '保持自然、稳定的叙述节奏。' }
    ])).toEqual([])
    expect(findWorldbookAuditTargets(auditEntries, { brief: '世界起源、高汤盆地' })).toEqual([])
    const auditTargets = findWorldbookAuditTargets([
      ...auditEntries,
      { id: 'entry-d', name: '新条目', type: 'lore', keys: [], content: '需要后续补充的世界设定。' },
      { id: 'entry-e', name: '未命名条目', type: 'lore', keys: [], content: '长'.repeat(1901) }
    ])
    expect(auditTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'missing-trigger',
        issues: expect.arrayContaining(['missing-trigger', 'placeholder-name']),
        entryIds: ['entry-d']
      }),
      expect.objectContaining({
        kind: 'missing-trigger',
        issues: expect.arrayContaining(['missing-trigger', 'oversized-content', 'placeholder-name']),
        entryIds: ['entry-e']
      })
    ]))
    const auditBatches = chunkWorldbookAuditTargets(auditTargets, 2)
    expect(auditBatches.map((batch) => batch.length)).toEqual([2, 1])
    const batchPrompt = buildWorldbookMaintenanceMessages({
      worldbook: { id: 'world-1', name: '测试世界', entries: [...auditEntries, { id: 'entry-d', name: '新条目', type: 'lore', keys: [], content: '需要后续补充的世界设定。' }, { id: 'entry-e', name: '未命名条目', type: 'lore', keys: [], content: '长'.repeat(1901) }] },
      mode: 'audit',
      auditTargetSubset: auditBatches[0]
    })
    expect(batchPrompt[1].content).toContain('entry-a')
    expect(batchPrompt[1].content).not.toContain('entry-e')
    expect(normalizeWorldbookMaintenanceResult({
      summary: '发现重复组织',
      candidates: [{
        action: 'merge',
        entryIds: ['entry-a', 'entry-b', 'unknown'],
        confidence: 'high',
        reason: '两条内容重复',
        proposedEntry: {
          name: '霜港商会', type: 'organization', keys: ['霜港', '盐路'],
          content: '控制北境盐路。', group: '组织', mode: 'selective'
        }
      }]
    }, { entries: auditEntries })).toMatchObject({
      candidates: [{ action: 'merge', entryIds: ['entry-a', 'entry-b'], proposedEntry: { name: '霜港商会' } }]
    })
    expect(normalizeWorldbookAiResult({ items: [{ name: '城门' }] })).toMatchObject({
      entries: [{ name: '城门' }]
    })
    expect(normalizeWorldbookAiResult({ worldBook: { locations: [{ name: '港口' }], characters: [{ name: '船长' }] } }).entries)
      .toEqual(expect.arrayContaining([{ name: '港口' }, { name: '船长' }]))
    expect(normalizeWorldbookAiResult([{ name: '直接条目' }])).toMatchObject({
      entries: [{ name: '直接条目' }]
    })
    expect(buildWorldbookImportPreview({
      name: '雾港档案',
      groups: ['历史'],
      entries: [{ name: '旧灯塔', type: 'location', group: '地理', keys: ['灯塔'], content: '港口北侧的旧灯塔。', injection: { mode: 'selective' } }]
    })).toMatchObject({
      name: '雾港档案', entryCount: 1, groupCount: 2, keyedEntryCount: 1, configuredEntryCount: 1,
      previewEntries: [{ name: '旧灯塔', typeLabel: '地点', keys: ['灯塔'] }]
    })
    expect(buildWorldbookImportPreview({}).entryCount).toBe(0)
    const foundation = buildFoundationPayloadFromAiResult({
      parsed: {
        name: '雾港',
        worldDescription: '一座被周期性雾潮包围的港城，城市秩序依靠旧灯塔维持，所有后续设定都必须服从这一核心前提。',
        tone: '冷静、潮湿、带有缓慢累积的不安',
        writingStyle: '短句与精确感官细节交替，避免解释性总结',
        perspective: '第三人称有限视角',
        forbidden: '避免突然出现无铺垫的救世主与万能技术',
        consistency: '雾潮不能无代价消失'
      },
      brief: '雾港故事',
      genreLabel: '都市异闻'
    })
    expect(foundation.entries.map((entry) => entry.type)).toEqual(['rule', 'style', 'forbidden'])
    expect(foundation.structuredSettings.creativeRules).toMatchObject({
      tone: '冷静、潮湿、带有缓慢累积的不安',
      perspective: '第三人称有限视角'
    })
    expect(foundation.structuredSettings.characters.protagonists).toBe('')
    const settingPrompt = buildSettingGenerationMessages({
      worldbook: {
        name: '雾港',
        worldDescription: foundation.worldDescription,
        writingStyle: foundation.writingStyle,
        forbidden: foundation.forbidden,
        structuredSettings: {
          ...foundation.structuredSettings,
          world: {
            ...foundation.structuredSettings.world,
            history: '港城建立于旧灯塔点亮后的第三年。'
          }
        },
        sourceDocuments: [{
          id: 'source-novel',
          title: '雾港原始片段',
          content: '巡灯人的旧簿明确记载：灯塔停摆当夜，雾潮第一次带走了全城关于北码头的共同记忆。'
        }],
        entries: [
          {
            id: 'constant-rule',
            name: '雾潮代价',
            type: 'rule',
            content: '雾潮每次退去都会永久带走一段公共记忆，任何组织都无法免除这项代价。',
            keys: ['雾潮'],
            injection: { mode: 'constant', probability: 100 }
          },
          {
            id: 'history-event',
            name: '旧灯塔停摆',
            type: 'event',
            content: '旧灯塔在十七年前停摆，此后港城改用人工巡灯制度维持航道。',
            keys: ['历史线', '灯塔'],
            metadata: { sourceDocumentIds: ['source-novel'] },
            injection: { mode: 'selective', probability: 20 }
          },
          {
            id: 'unrelated-item',
            name: '银餐叉',
            type: 'item',
            content: '一把普通餐具，与港城历史无关。',
            keys: ['餐具'],
            injection: { mode: 'selective', probability: 100 }
          }
        ]
      },
      sectionKey: 'world',
      fieldKey: 'history',
      userBrief: '补全港城历史线'
    }).map((message) => message.content).join('\n')
    expect(settingPrompt).toContain('雾潮代价')
    expect(settingPrompt).toContain('旧灯塔停摆')
    expect(settingPrompt).toContain('禁止内容')
    expect(settingPrompt).toContain('约束优先级')
    expect(settingPrompt).toContain('当前设定项已有内容')
    expect(settingPrompt).toContain('港城建立于旧灯塔点亮后的第三年')
    expect(settingPrompt).toContain('世界书原始资料摘录')
    expect(settingPrompt).toContain('灯塔停摆当夜，雾潮第一次带走了全城')
    expect(settingPrompt).toContain('setting-field.v1')
    expect(settingPrompt).not.toContain('<setting-content>')
    expect(settingPrompt).not.toContain('银餐叉')
    const emptyDefaultWorldbook = {
      name: '默认世界书',
      worldDescription: '自动创建的默认世界书',
      structuredSettings: foundation.structuredSettings,
      entries: []
    }
    const blankDefaultWorldbook = {
      ...emptyDefaultWorldbook,
      structuredSettings: undefined
    }
    expect(getMeaningfulWorldDescription(emptyDefaultWorldbook)).toBe('')
    expect(hasSettingGenerationBasis({ worldbook: blankDefaultWorldbook })).toBe(false)
    expect(hasSettingGenerationBasis({ worldbook: emptyDefaultWorldbook, userBrief: '雾港城邦' })).toBe(true)
    const emptyDefaultPrompt = buildSettingGenerationMessages({
      worldbook: blankDefaultWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin'
    }).map((message) => message.content).join('\n')
    expect(emptyDefaultPrompt).not.toContain('自动创建的默认世界书')
    expect(emptyDefaultPrompt).not.toContain('当前世界书：默认世界书')
    expect(emptyDefaultPrompt).toContain('首条设定模式')
    expect(emptyDefaultPrompt).toContain('第一条正式设定')
    const leakedReasoning = 'The user is asking me to generate content. Key constraints: output only the field. Let me think about a generic world origin.'
    expect(isSettingDraftValid(leakedReasoning, { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('我需要先考虑世界起源应该包含哪些部分，然后再给出合适内容。', { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('我们需要先分析已有约束，再组织世界起源的正文。', { controlType: 'textarea', maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('以下是目标设定项的最终内容：世界由潮汐塑成。', { maxLength: 2000 })).toBe(false)
    expect(isSettingDraftValid('与', { controlType: 'textarea', maxLength: 2000 })).toBe(false)
    expect(extractSettingContent(leakedReasoning)).toBeNull()
    expect(extractSettingContent(`${leakedReasoning}\n<setting-content>最初的海潮从无光之地升起。</setting-content>\nLet me verify it.`))
      .toBe('最初的海潮从无光之地升起。')
    expect(extractSettingContent('<setting-content><think>先分析约束，再组织答案。</think>最初的海潮从无光之地升起。</setting-content>'))
      .toBe('最初的海潮从无光之地升起。')
    expect(isSettingDraftValid('最初的海潮从无光之地升起，陆地随潮汐缓慢成形。', { maxLength: 2000 })).toBe(true)
    expect(extractTextContent([
      { type: 'reasoning', text: leakedReasoning },
      { type: 'text', text: '最初的海潮从无光之地升起。' }
    ])).toBe('最初的海潮从无光之地升起。')
    expect(extractTextContent({
      type: 'tool_use',
      input: { summary: '返回候选', candidates: [] }
    })).toBe('{"summary":"返回候选","candidates":[]}')
    const editorSource = readFileSync(resolve(process.cwd(), 'src/pages/WorldBookEditor.vue'), 'utf8')
    expect(editorSource).toContain('maintenanceTouchedEntryIds')
    expect(editorSource).toContain('maintenanceRevision.value = String(activeWorldbook.value?.updatedAt || maintenanceRevision.value)')
    expect(editorSource).toContain('SettingsContextBar')
    expect(editorSource).not.toContain('worldbook-pane')
    expect(editorSource).not.toContain('editor-context')
    expect(editorSource).not.toContain('StructuredSettingsWorkspace')
    expect(editorSource).not.toContain("key: 'structured'")
    const sectionCalls = []
    const sectionWorldbook = {
      name: '雾港',
      structuredSettings: foundation.structuredSettings,
      entries: []
    }
    await generateSettingSectionDraft({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      generateField: async (options) => {
        sectionCalls.push(structuredClone(options.worldbook.structuredSettings))
        return { ok: true, content: `本轮生成-${options.fieldKey}` }
      }
    })
    expect(sectionCalls[1].world.origin).toBe('本轮生成-origin')
    expect(sectionWorldbook.structuredSettings.world.origin).toBe('')
    const batchCalls = []
    const candidateCalls = []
    const candidateResult = await generateSettingCandidates({
      sectionKey: 'world',
      fieldKeys: ['history'],
      worldbook: {
        id: 'wb-candidates',
        sourceDocuments: [{ id: 'source-history', title: '旧档案', content: '十七年前旧灯塔停摆，港城改用人工巡灯。' }]
      },
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        candidateCalls.push(request)
        return {
          drafts: {
            candidates: [{
              type: 'event',
              name: '旧灯塔停摆',
              aliases: ['旧灯塔', '旧灯塔停摆'],
              content: '旧灯塔停摆后，港城改用人工巡灯。',
              evidence: '十七年前旧灯塔停摆，港城改用人工巡灯。',
              sourceIds: ['source-history']
            }, {
              type: 'event',
              name: '模型臆造事件',
              content: '这条事实没有对应的本地来源。',
              evidence: '不存在于当前资料的证据。',
              sourceIds: ['source-not-found']
            }]
          }
        }
      }
    })
    expect(candidateResult).toMatchObject({ ok: true, candidates: [{ name: '旧灯塔停摆', sourceIds: ['source-history'] }] })
    expect(candidateResult.candidates[0].aliases).toEqual(['旧灯塔'])
    expect(groupSettingCandidates([
      ...candidateResult.candidates,
      {
        type: 'event',
        name: '旧灯塔',
        content: '旧灯塔停摆后由人工巡灯。',
        evidence: '旧灯塔停摆，改用人工巡灯。',
        sourceIds: ['source-history']
      }
    ])).toMatchObject([{ possibleDuplicate: true, variants: [{ name: '旧灯塔停摆' }, { name: '旧灯塔' }] }])
    expect(candidateCalls[0].schemaId).toBe('setting-candidates.v1')
    expect(isSettingDraftValid('陆沉与沈砚互为旧识。', { controlType: 'textarea', maxLength: 2000 })).toBe(true)
    expect(getStructuredGenerationTimeout([{ entryType: 'character' }])).toBe(90000)
    expect(isStructuredSettingRevisionCurrent('rev-1', 'rev-1')).toBe(true)
    expect(isStructuredSettingRevisionCurrent('rev-1', 'rev-2')).toBe(false)
    const batchedResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'characters',
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async ({ target }) => {
        batchCalls.push(target.fieldKeys)
        return batchCalls.length === 1
          ? {
              drafts: {
                protagonists: '姓名：陆沉\n身份：巡夜人\n性格：克制、敏锐\n目标：查明旧案',
                majorSupporting: '姓名：沈砚\n身份：档案员\n性格：谨慎\n目标：保护证据'
              },
              fieldErrors: { npcs: '缺少可用内容', relationshipSummary: '缺少可用内容' }
            }
          : {
              drafts: {
                npcs: '姓名：港口守卫\n身份：值守者\n性格：警觉\n目标：维持秩序',
                relationshipSummary: '陆沉与沈砚互为旧识。'
              },
              fieldErrors: {}
            }
      }
    })
    expect(batchCalls).toEqual([
      ['protagonists', 'majorSupporting', 'npcs', 'relationshipSummary'],
      ['npcs', 'relationshipSummary']
    ])
    expect([...batchedResults.values()].every((result) => result.ok), JSON.stringify([...batchedResults.entries()])).toBe(true)
    expect(parseCharacterCards(JSON.stringify({
      name: '陆沉',
      identity: '巡夜人',
      personality: '克制、敏锐',
      goal: '查明旧案',
      speechStyle: '短句，先复述事实再下判断',
      mes_example: '<START>\nUser: 你相信谁？\n陆沉: 我只相信能复核的记录。\n<START>\nUser: 现在怎么办？\n陆沉: 先关门，再谈下一步。'
    }))).toMatchObject([{
      name: '陆沉',
      traits: ['克制', '敏锐'],
      goal: '查明旧案',
      speechStyle: '短句，先复述事实再下判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    }])
    expect(editorSource).toContain('entryForm.speechStyle')
    expect(editorSource).toContain('entryForm.samples')
    expect(editorSource).toContain('addVoiceSample')
    expect(editorSource).toContain('removeVoiceSample')
    expect(editorSource).toContain('生成时最多使用前 3 条')
    const retryCalls = []
    const retryResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'characters',
      fieldKeys: ['relationshipSummary'],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async ({ target }) => {
        retryCalls.push(target.fieldKeys)
        return { drafts: { relationshipSummary: '陆沉与沈砚互为旧识。' }, fieldErrors: {} }
      }
    })
    expect(retryCalls).toEqual([['relationshipSummary']])
    expect(retryResults.get('relationshipSummary')).toMatchObject({ ok: true })
    const rulesResults = await generateSettingSectionDraftBatch({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKeys: ['rules'],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async () => ({
        drafts: {
          rules: [
            '潮汐每七日改变一次航道，任何地图都必须注明绘制日期。',
            '未经见证者确认的誓言不能成为正式法律，只能作为私人承诺。',
            '跨越旧灯塔照出的雾区必须留下返回标记，否则视为失踪。',
            '任何力量的使用都要付出可追溯的代价，不能凭空消耗或恢复。',
            '历史记录发生冲突时，优先保留有地点、时间和见证者的版本。'
          ].join('\n')
        },
        fieldErrors: {}
      })
    })
    expect(rulesResults.get('rules')).toMatchObject({ ok: true })
    const revisionCalls = []
    const revisionResult = await generateSettingDraftRevision({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin',
      draftContent: '雾港建立在潮汐反复改道的海湾边。',
      revisionInstruction: '保留潮汐改道，补充旧灯塔与三次迁港，不要加入神明。',
      previousVersions: [
        { content: '第一版设定记录了潮汐、旧灯塔和三次迁港。', kind: 'generated' }
      ],
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        revisionCalls.push(request)
        return { drafts: { origin: '雾港建立在潮汐反复改道的海湾边，旧灯塔记录着三次迁港。' }, meta: {} }
      }
    })
    expect(revisionResult).toMatchObject({ ok: true })
    expect(revisionCalls[0]).toMatchObject({
      schemaId: 'setting-revision.v1',
      target: { sectionKey: 'world', fieldKeys: ['origin'] },
      context: {
        draftContent: '雾港建立在潮汐反复改道的海湾边。',
        revisionInstruction: '保留潮汐改道，补充旧灯塔与三次迁港，不要加入神明。',
        previousVersions: '版本 1（历史参考）\n第一版设定记录了潮汐、旧灯塔和三次迁港。'
      }
    })
    const compatibilityCalls = []
    const compatibilityResult = await generateSettingDraftRevision({
      worldbook: sectionWorldbook,
      sectionKey: 'world',
      fieldKey: 'origin',
      draftContent: '旧版草稿保留潮汐。',
      revisionInstruction: '补充旧灯塔，删除神明。',
      settings: { baseUrl: 'https://example.test', apiKey: 'test', model: 'test' },
      sendStructuredGenerationImpl: async (request) => {
        compatibilityCalls.push(request)
        if (request.schemaId === 'setting-revision.v1') {
          const error = new Error('结构化生成 schema 不受支持')
          error.code = 'STRUCTURED_GENERATION_SCHEMA_UNSUPPORTED'
          throw error
        }
        return { drafts: { origin: '旧版草稿保留潮汐和旧灯塔。' }, meta: {} }
      }
    })
    expect(compatibilityResult).toMatchObject({ ok: true, meta: { compatibilityFallback: true } })
    expect(compatibilityCalls.map((request) => request.schemaId)).toEqual(['setting-revision.v1', 'setting-field.v1'])
    expect(compatibilityCalls[1].context.currentValues.origin).toBe('旧版草稿保留潮汐。')
    expect(compatibilityCalls[1].context.userBrief).toContain('补充旧灯塔，删除神明。')
    expect(() => normalizeResearchRequest({ provider: 'custom', queries: ['x'] })).toThrow('仅支持')
    expect(normalizeResearchFetchRequest({
      sources: [{ id: 's1', title: '公开资料', url: 'https://example.com/a?utm_source=x' }]
    }).sources[0]).toMatchObject({ id: 'S1', url: 'https://example.com/a' })
    expect(() => normalizeResearchFetchRequest({
      sources: [{ id: 'S1', url: 'http://localhost:3001/private' }]
    })).toThrow('可抓取')
    const searchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        web: {
          results: [
            { title: '港口制度', url: 'https://example.com/port?utm_source=test', description: '制度摘要' },
            { title: '重复结果', url: 'https://example.com/port', description: '重复摘要' }
          ]
        }
      }))
    })
    vi.stubGlobal('fetch', searchFetch)
    try {
      const searched = await runWebResearch({
        provider: 'brave',
        apiKey: 'search-test-key',
        queries: ['港口制度'],
        maxResults: 5
      })
      expect(searched.results).toHaveLength(1)
      expect(searched.results[0]).toMatchObject({ id: 'S1', provider: 'brave', snippet: '制度摘要' })
      expect(searched.results[0].url).toBe('https://example.com/port')
      expect(searchFetch.mock.calls[0][0].hostname).toBe('api.search.brave.com')
      expect(searchFetch.mock.calls[0][1].headers['X-Subscription-Token']).toBe('search-test-key')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(normalizeWorldbookResearchSettings({ provider: 'bad', maxQueries: 99 })).toMatchObject({
      provider: 'brave',
      maxQueries: 4
    })
    expect(buildFallbackResearchQueries({ brief: '宋代港口城邦', genreLabel: '历史奇幻', maxQueries: 3 })).toHaveLength(3)
    expect(buildIncrementalResearchQuery({
      brief: '潮汐港口的税制',
      genreLabel: '历史奇幻',
      claims: [{ text: '港口税制由商会和官署共同管理' }]
    })).toContain('港口税制由商会和官署共同管理')
    expect(mergeResearchSources(
      [{ id: 'S1', title: '已有', url: 'https://example.com/old' }],
      [
        { id: 'S1', title: '重复', url: 'https://example.com/old/' },
        { id: 'S1', title: '新增', url: 'https://example.com/new' }
      ]
    )).toMatchObject([
      { id: 'S1', title: '已有' },
      { id: 'S2', title: '新增' }
    ])
    const gapFetch = vi.fn().mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.endsWith('/search')
        ? {
          provider: 'brave',
          results: [{ id: 'S1', title: '补充资料', url: 'https://example.com/gap', snippet: '补充摘要' }],
          warnings: []
        }
        : {
          sources: [{
            id: 'S1',
            title: '补充资料',
            url: 'https://example.com/gap',
            evidenceLevel: 'page',
            evidenceBlocks: [{ id: 'P1', locator: '正文段落 1', text: '补充正文证据' }]
          }],
          warnings: []
        }
    }))
    const gap = await researchWorldbookGap({
      research: { sources: [{ id: 'S1', title: '已有', url: 'https://example.com/old' }], queries: ['旧查询'] },
      brief: '潮汐港口的税制',
      genreLabel: '历史奇幻',
      claims: [{ text: '港口税制由商会和官署共同管理' }],
      settings: { provider: 'brave', apiKey: 'test-key', maxResults: 4 },
      fetchImpl: gapFetch
    })
    expect(gap).toMatchObject({ incremental: { budget: 'single-query', addedSourceCount: 1 } })
    expect(gap.sources[1]).toMatchObject({ id: 'S2', evidenceBlocks: [{ id: 'P1' }] })
    expect(buildEvidenceBlocks('第一段正文足够长，可以作为第一个可定位的正文证据块。\n第二段正文也足够长，可以作为第二个可定位的正文证据块。'))
      .toMatchObject([{ id: 'P1', locator: '正文段落 1' }, { id: 'P2', locator: '正文段落 2' }])

    const normalizedEntry = normalizeGeneratedEntry({
      name: '码头税制',
      content: '以现实港口制度为依据建立的税制与货物登记规则，影响商会和地方官署之间的权力分配。',
      sourceRefs: ['s1', 'S999'],
      basis: 'research'
    })
    const normalizedVoiceEntry = normalizeGeneratedEntry({
      name: '陆沉',
      type: 'character',
      content: '巡夜人，习惯先核对事实。',
      speechStyle: '  短句，先复述事实再判断  ',
      samples: ['我只相信能复核的记录。', '我只相信能复核的记录。', '', '先关门，再谈下一步。']
    })
    expect(normalizedVoiceEntry).toMatchObject({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })
    expect(normalizeGeneratedEntry({
      name: '港口制度',
      type: 'lore',
      content: '港口制度。',
      speechStyle: '不应保留',
      samples: ['不应保留']
    })).not.toHaveProperty('speechStyle')
    const pending = buildPendingPayload({
      name: '港城',
      entries: [normalizedEntry],
      sourceDocuments: [createSourceDocument('码头税册记录了商会与官署共同征税的完整过程。', {
        id: 'source-tax',
        title: '税册原文',
        createdAt: 1
      })],
      research
    })
    expect(pending.entries[0].metadata).toMatchObject({ basis: 'research', sourceRefs: ['S1'] })
    expect(pending.sourceDocuments[0]).toMatchObject({ id: 'source-tax', title: '税册原文' })
    expect(pending.entries[0].metadata.sourceDocumentIds).toEqual(['source-tax'])

    const claims = normalizeResearchClaims([
      {
        id: 'C1',
        type: 'geography',
        text: '港口位于潮汐河口',
        basis: 'research',
        sourceRefs: ['S1'],
        evidenceRefs: [{ sourceId: 'S1', locator: 'P2', quote: '潮汐河口' }]
      },
      { id: 'C2', type: 'history', text: '港口由商会控制', basis: 'research', sourceRefs: ['S1'] }
    ], new Set(['S1']), new Set())
    const conflicts = normalizeResearchConflicts([
      { id: 'X1', claimIds: ['C1', 'C2'], reason: '两条声明对港口权属的解释不同', severity: 'high' }
    ], new Set(['C1', 'C2']))
    const reviewed = refreshResearchReview({ claims, conflicts, excludedSourceIds: [] }, [
      { name: '港口制度', metadata: { claimIds: ['C1'] } }
    ])
    expect(reviewed).toMatchObject({ needsReview: true, conflictCount: 1, affectedEntries: ['港口制度'] })
    expect(claims[0].evidenceRefs).toEqual([{ sourceId: 'S1', locator: 'P2', quote: '潮汐河口' }])
    const excluded = excludeResearchSource({
      sources: [{ id: 'S1' }], claims, conflicts, excludedSourceIds: []
    }, 'S1')
    expect(excluded.claims[0]).toMatchObject({ status: 'stale', excludedRefs: ['S1'] })

    const pendingWithReview = buildPendingPayload({
      name: '待审港城',
      entries: [{
        name: '港口制度',
        type: 'lore',
        content: '港口制度与权属关系需要根据来源进行核对，不能直接合并矛盾事实。',
        claimIds: ['C1'],
        sourceRefs: ['S1']
      }, normalizedVoiceEntry],
      research: { ...research, claims, conflicts }
    })
    expect(pendingWithReview.research.review.needsReview).toBe(true)
    expect(pendingWithReview.entries[0].metadata.claimIds).toEqual(['C1'])
    expect(pendingWithReview.entries.find((entry) => entry.name === '陆沉')).toMatchObject({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })

    const payloadWithVoice = buildPendingPayload({
      name: '可追溯港城',
      entries: [{
        name: '港口制度',
        type: 'lore',
        content: '港口制度与权属关系需要根据来源进行核对，不能直接合并矛盾事实。',
        claimIds: ['C1'],
        sourceRefs: ['S1']
      }, normalizedVoiceEntry],
      sourceDocuments: [createSourceDocument('港口原始登记簿保留了税制与权属变更的逐年记录。', {
        id: 'source-ledger',
        title: '港口登记簿',
        createdAt: 2
      })],
      research: { ...research, claims, conflicts: [] }
    })
    expect(payloadWithVoice.entries.find((entry) => entry.name === '陆沉')).toMatchObject({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })
    const stored = await createWorldbookFromPayload(store, payloadWithVoice)
    expect(stored.entries[0].metadata).toMatchObject({ claimIds: ['C1'], reviewState: 'ready' })
    expect(stored.sourceDocuments[0]).toMatchObject({ id: 'source-ledger', title: '港口登记簿' })
    expect(stored.entries[0].metadata.sourceDocumentIds).toEqual(['source-ledger'])
    expect(stored.entries.find((entry) => entry.name === '陆沉')).toMatchObject({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })
    expect(store.activeWorldbook.entries.find((entry) => entry.name === '陆沉')).toMatchObject({
      speechStyle: '短句，先复述事实再判断',
      samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
    })

    const revision = createResearchRevision({ sources: research.sources })
    const stalePreview = buildPendingPayload({
      name: '变更后的港城',
      entries: [{ name: '来源变更', type: 'lore', content: '来源内容变化后，旧预览不应继续导入。' }],
      research: {
        ...research,
        revision,
        sources: [{ ...research.sources[0], title: '已变化的港口资料' }]
      }
    })
    expect(stalePreview.research.review).toMatchObject({ needsReview: true, revisionStale: true })
  })

  it('updateWorldbook can attach geoHistory to an already-imported world', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({ name: '后挂历史' })
    expect(wb.geoHistory).toBeNull()

    const updated = await store.updateWorldbook(wb.id, {
      geoHistory: { nodes: [{ id: 'n2', yearLabel: '第 3 纪元', playable: true }] }
    })
    expect(updated.geoHistory.nodes[0].id).toBe('n2')
    expect(updated.geoHistory.nodes[0].yearLabel).toBe('第 3 纪元')

    await store.updateStructuredSetting(wb.id, 'world', 'history', '旧港在第七码头陷落后进入雾潮纪元。')
    let active = store.activeWorldbook
    let historyEntries = active.entries.filter((entry) => entry.metadata?.structuredSettingRef === 'world.history')
    expect(historyEntries).toHaveLength(1)
    expect(historyEntries[0]).toMatchObject({
      name: '历史线',
      type: 'event',
      content: '旧港在第七码头陷落后进入雾潮纪元。',
      injection: { mode: 'selective' }
    })

    await store.updateStructuredSetting(wb.id, 'world', 'history', '旧港陷落后，巡灯制度取代了城邦议会。')
    active = store.activeWorldbook
    historyEntries = active.entries.filter((entry) => entry.metadata?.structuredSettingRef === 'world.history')
    expect(historyEntries).toHaveLength(1)
    expect(historyEntries[0].content).toContain('巡灯制度')

    await store.updateStructuredSetting(wb.id, 'creativeRules', 'taboos', '禁止无代价复活。')
    expect(store.activeWorldbook.entries.find((entry) => entry.metadata?.structuredSettingRef === 'creativeRules.taboos'))
      .toMatchObject({ type: 'forbidden', injection: { mode: 'constant' } })

    await store.updateStructuredSetting(wb.id, 'world', 'history', '')
    expect(store.activeWorldbook.entries.some((entry) => entry.metadata?.structuredSettingRef === 'world.history')).toBe(false)
  })

  it('resolves a canonical place entity from the active worldbook', async () => {
    const worldStore = useWorldStore()
    const worldbook = await worldStore.createWorldbook({
      name: '地点索引测试',
      geoHistory: {
        mapId: 'map-1',
        placeRefs: [{ placeId: 'place:wb-place:map-1:site-1', name: '灰墙' }],
        nodes: [{
          id: 'history-1',
          placeRef: { placeId: 'place:wb-place:map-1:site-1' },
          mapBinding: { city: '灰墙', scene: '旧税所' },
          entryIds: []
        }]
      }
    })

    const entity = worldStore.getPlaceEntity('place:wb-place:map-1:site-1')
    expect(worldbook.id).toBeTruthy()
    expect(entity).toMatchObject({
      placeId: 'place:wb-place:map-1:site-1',
      name: '灰墙',
      historyNodeIds: ['history-1']
    })
  })

  it('normalizeWorldbook coerces an array-form geoHistory into { nodes } and drops non-objects', async () => {
    const store = useWorldStore()
    const wb = await store.createWorldbook({
      name: '数组历史',
      geoHistory: [{ id: 'n3', playable: true }, null, 'junk']
    })
    expect(wb.geoHistory).toEqual({ nodes: [{ id: 'n3', playable: true }] })
  })
})
