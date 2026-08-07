/**
 * 核心服务集成测试（精简版）
 */

import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MaterialSourceDrawer from '../components/materials/MaterialSourceDrawer.vue'
import ComicAdaptationPlanner from '../components/media/ComicAdaptationPlanner.vue'
import ComicCompositionCanvas from '../components/media/ComicCompositionCanvas.vue'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
import ComicStageWorkbench from '../components/media/ComicStageWorkbench.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import ContourField from '../components/workbench/ContourField.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import NarrativeTurn from '../components/experience/NarrativeTurn.vue'
import {
  buildSystemPrompt,
  buildPromptSequence,
  buildNarrativeConstraints
} from '../services/promptBuilder'
import { getShotTypes, inferShotTypeFromEmotion } from '../types/director'
import {
  buildEditingPackage,
  buildEditingPackageZip,
  extractShotsFromChapter,
  extractShotsFromNarrativeAssets,
  extractShotsFromRelationCanvas,
  extractShotsFromProseEssay,
  toFCPXML,
  toJianyingDraft,
  toMarkdown,
  toPremiereCSV
} from '../services/shotExporter'
import {
  createImageModelConfigDraft,
  generateImage,
  getImageProviderCapabilities,
  IMAGE_MODEL_TYPES,
  testImageProviderConnection
} from '../services/media/imageProviderService'
import {
  deleteImageProviderConfig,
  listImageProviderConfigs,
  saveImageProviderConfig
} from '../services/media/imageProviderConfigStore'
import {
  deleteMediaAsset,
  getMediaAsset,
  loadGeneratedImageLibrary,
  listMediaAssets,
  saveMediaAsset
} from '../services/media/mediaAssetStore'
import {
  migrateCanvasAttachedImages,
  serializeCanvasCards
} from '../services/media/canvasImageAssetBridge'
import {
  addComicPanelTake,
  addComicPanelStageArtifact,
  approveComicPanelStageArtifact,
  buildComicPageManifest,
  canBatchGenerateComicPage,
  confirmComicSequenceVisualBible,
  createComicPage,
  listComicSequencePages,
  listComicPages,
  saveComicPage,
  saveComicPages,
  selectComicPanelStageArtifact,
  updateComicPageColorMode,
  updateComicPageComposition,
  updateComicPanel,
  updateComicPanelStage,
  updateComicVisualBible
} from '../services/media/comicPageStore'
import {
  buildComicAdaptationMessages,
  buildComicPagesFromAdaptation,
  buildComicReferenceCatalog,
  parseComicAdaptationCandidates
} from '../services/media/comicAdaptationService'
import {
  addComicDirectionControl,
  getComicFrameBounds,
  mergeComicPanelWithNext,
  reorderComicPanel,
  resizeComicPanelFrame,
  setComicCompositionFormat,
  setComicPanelGutter,
  splitComicPanel,
  updateComicPanelDirection
} from '../services/media/comicCompositionService'
import {
  archiveUploadedComicStage,
  buildComicStagePrompt,
  getComicBatchEligiblePanels,
  getComicProductionRoute,
  getComicStageGate,
  getComicStageInputRevision,
  runComicStageGeneration
} from '../services/media/comicProductionService'
import {
  getComicImageStyle,
  getComicPanelRect,
  getComicPanelImageSize,
  getComicPanelRects,
  getDefaultComicPanelFrame
} from '../services/media/comicLayout'
import {
  buildComicScriptMessages,
  parseComicScript
} from '../services/media/comicScriptService'
import { buildComicPanelImageRequest } from '../services/media/comicImagePrompt'
import { analyzeComicLettering, buildComicPublicationReport, estimateLineCount } from '../services/media/comicLetteringService'
import { renderRPText } from '../services/rpTextRenderer'
import { runGenerationRetryPlan } from '../services/generationRetry'
import {
  buildNarrativeFormatInstructions,
  createNarrativeMessageId,
  parseNarrativePresentation,
  parseMarkedBlocks
} from '../services/narrativePresentation'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('PromptBuilder', () => {
  it('builds system prompt, preserves dialogue punctuation, and keeps pane keyboard navigation accessible', async () => {
    const prompt = buildSystemPrompt('narrator', { style: 'webnovel' })
    expect(prompt).toContain('网文风')

    const rendered = renderRPText('他说：“那是‘归航信号’。”')
    expect(rendered).toContain('<span class="rp-dialogue">“')
    expect(rendered).toContain('”</span>')
    expect(rendered).toContain('rp-dialogue-quote-soft')
    expect(renderRPText('她只说：‘走。’')).toContain('<span class="rp-dialogue">‘走。’</span>')
    expect(renderRPText('『别回头。』')).toContain('<span class="rp-dialogue">『别回头。』</span>')
    const constraints = buildNarrativeConstraints({ currentPeriod: '清晨', currentScene: '酒馆' })
    expect(constraints).toContain('清晨')
    expect(constraints).toContain('硬性约束')
    const messages = buildPromptSequence({
      templateKey: 'narrator',
      worldBookEntries: [{ name: '测试', type: 'character', content: '测试内容' }]
    })
    expect(messages.length).toBeGreaterThan(0)

    const paneSwitch = mount(WorkspacePaneSwitch, {
      props: {
        modelValue: 'content',
        label: '素材工作区',
        items: [
          { value: 'index', label: '索引' },
          { value: 'content', label: '内容' },
          { value: 'tools', label: '工具' }
        ]
      }
    })
    const activePane = paneSwitch.get('[aria-checked="true"]')
    await activePane.trigger('keydown', { key: 'ArrowRight' })
    expect(paneSwitch.emitted('update:modelValue')?.at(-1)).toEqual(['tools'])
    expect(paneSwitch.attributes('role')).toBe('radiogroup')

    const contour = mount(ContourField, { props: { density: 'relation', entry: 'left' } })
    expect(contour.classes()).toContain('contour-field--relation')
    expect(contour.classes()).toContain('contour-field--left')
    expect(contour.attributes('aria-hidden')).toBe('true')

    const icon = mount(WorkbenchIcon, { props: { name: 'archive', size: 18 } })
    expect(icon.find('svg').attributes('width')).toBe('18')

    const turn = mount(NarrativeTurn, {
      props: {
        message: { role: 'user', content: '检查航道。' },
        index: 0,
        blocks: [{ id: 'b1', kind: 'narration', text: '检查航道。' }],
        renderContent: (block) => block.text
      }
    })
    expect(turn.get('details.prose__actions').attributes('open')).toBeUndefined()
    expect(turn.findAll('.prose__action')).toHaveLength(3)

    const generationCalls = []
    const structuredFallback = await runGenerationRetryPlan({
      baseMessages: [{ role: 'user', content: '生成 JSON' }],
      generationOptions: { response_format: { type: 'json_object' }, timeout_ms: 90000 },
      attempts: [
        { name: 'structured' },
        { name: 'prompt-json', generationOptions: { response_format: null } }
      ],
      sendChatImpl: async (...args) => {
        generationCalls.push(args)
        if (args[4]?.response_format) throw new Error('response_format unsupported')
        return { content: '{"entries":[{"name":"港口"}]}' }
      },
      parseContent: JSON.parse,
      isValidParsed: (parsed) => Array.isArray(parsed?.entries) && parsed.entries.length > 0
    })
    expect(structuredFallback.success).toBe(true)
    expect(structuredFallback.attemptIndex).toBe(1)
    expect(generationCalls[0][4].response_format).toEqual({ type: 'json_object' })
    expect(generationCalls[0][4].timeout_ms).toBe(90000)
    expect(generationCalls[1][4]).not.toHaveProperty('response_format')
    expect(generationCalls[1][4].timeout_ms).toBe(90000)
  })
})

describe('Narrative presentation contract', () => {
  it('parses markers into clean text and falls back without losing legacy content', () => {
    const structured = parseNarrativePresentation([
      ':::narration',
      '雨水沿着舷窗滑落。',
      ':::dialogue|陆晨曦',
      '“信号还在吗？”',
      ':::action|陆晨曦',
      '她调高了增益。'
    ].join('\n'), { messageId: 'message-1' })

    expect(structured.source).toBe('model-structured')
    expect(structured.content).toBe('雨水沿着舷窗滑落。\n\n“信号还在吗？”\n\n她调高了增益。')
    expect(structured.blocks.map((block) => `${block.kind}:${block.speaker || ''}`)).toEqual([
      'narration:', 'dialogue:陆晨曦', 'action:陆晨曦'
    ])
    expect(structured.content).not.toContain(':::')

    const preamble = parseNarrativePresentation('模型说明\n:::dialogue|陆晨曦\n“继续。”', {
      messageId: 'preamble'
    })
    expect(preamble.content).toContain('模型说明')
    expect(preamble.content).toContain('“继续。”')

    const provisional = parseNarrativePresentation(':::dialog', {
      messageId: 'streaming',
      complete: false
    })
    expect(provisional.status).toBe('provisional')
    expect(provisional.content).toBe('')

    const legacy = parseNarrativePresentation([
      '*她抬头。*',
      '',
      '陆晨曦：“继续。”',
      '陆晨曦说：“保持航向。”',
      '“信号在移动。”陆晨曦说道。',
      '“别走。”',
      '她走到舷窗前，低声说：“小行星带里有灯。”'
    ].join('\n'), { messageId: 'legacy' })
    expect(legacy.source).toBe('parser')
    expect(legacy.content).toContain('“别走。”')
    expect(legacy.blocks.map((block) => `${block.kind}:${block.speaker || ''}`)).toEqual([
      'action:',
      'dialogue:陆晨曦',
      'dialogue:陆晨曦',
      'dialogue:陆晨曦',
      'dialogue:',
      'narration:'
    ])
    expect(legacy.blocks.slice(1, 4).every((block) => block.speakerSource === 'text')).toBe(true)

    const messageFallback = parseNarrativePresentation('“继续。”', {
      messageId: 'fallback-speaker',
      fallbackSpeaker: '褚岩'
    })
    expect(messageFallback.blocks[0]).toMatchObject({ speaker: '褚岩', speakerSource: 'message' })
    const tolerantMarkers = parseMarkedBlocks('```text\r\n :::dialogue|甲\r\n未闭合\r\n:::unknown\r\n文本\r\n```', 'bad')
    expect(tolerantMarkers.content).toBe('未闭合\n\n文本')
    expect(tolerantMarkers.content).not.toContain(':::unknown')
  })

  it('keeps stable ids and one prompt format contract', () => {
    expect(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
      .toBe(createNarrativeMessageId({ role: 'assistant', content: '同一段' }, 0))
    expect(buildNarrativeFormatInstructions()).toContain(':::dialogue|角色名')
  })
})

describe('Director Types', () => {
  it('provides shot types and infers them from emotion', () => {
    const types = getShotTypes()
    expect(types.length).toBe(5)
    expect(inferShotTypeFromEmotion('fear')).toBe('extreme_close_up')
  })
})

describe('Media services', () => {
  it('shares provider config and keeps generated binary data outside localStorage', async () => {
    localStorage.removeItem(STORAGE_KEYS.IMAGE_MODEL_CONFIGS)
    localStorage.removeItem(STORAGE_KEYS.MEDIA_ASSETS)
    localStorage.removeItem(STORAGE_KEYS.COMIC_PAGES)
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { images: ['data:image/png;base64,abc'] } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => ''
      })
    const config = {
      type: 'http',
      baseUrl: 'https://images.example/generate/',
      apiKey: 'secret',
      requestTemplate: '{"prompt":"{{prompt}}","negative":"{{negative_prompt}}","width":{{width}},"height":{{height}},"reference":"{{reference_image}}","references":{{reference_images_json}},"strength":{{reference_strength}}}',
      responsePath: 'result.images.0'
    }

    const image = await generateImage(config, {
      prompt: '雨夜 "街角"',
      negativePrompt: '模糊',
      width: 1280,
      height: 720,
      count: 1,
      referenceImages: [{ id: 'ref-1', data: 'data:image/png;base64,YWJj' }],
      referenceStrength: 0.7,
      fetchImpl
    })
    const request = fetchImpl.mock.calls[0]
    const body = JSON.parse(request[1].body)

    expect(request[0]).toBe('https://images.example/generate')
    expect(request[1].headers.Authorization).toBe('Bearer secret')
    expect(body).toEqual({
      prompt: '雨夜 "街角"',
      negative: '模糊',
      width: 1280,
      height: 720,
      reference: 'data:image/png;base64,YWJj',
      references: ['data:image/png;base64,YWJj'],
      strength: 0.7
    })
    expect(image).toBe('data:image/png;base64,abc')

    const connection = await testImageProviderConnection(config, { fetchImpl })
    expect(connection).toMatchObject({ ok: true, reachable: true, authenticated: true, status: 200 })

    const sdFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,ZGVyaXZlZA=='] })
    })
    await generateImage({ type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' }, {
      prompt: '保持人物外观',
      referenceImages: [{ id: 'ref-1', data: 'data:image/png;base64,YWJj' }],
      referenceStrength: 0.7,
      fetchImpl: sdFetch
    })
    const sdBody = JSON.parse(sdFetch.mock.calls[0][1].body)
    expect(sdFetch.mock.calls[0][0]).toBe('http://127.0.0.1:7860/sdapi/v1/img2img')
    expect(sdBody).toMatchObject({ init_images: ['data:image/png;base64,YWJj'], denoising_strength: 0.3 })
    const sdInpaintFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,aW5wYWludA=='] })
    })
    await generateImage({ type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' }, {
      prompt: '只修正手部',
      referenceImages: [{ id: 'source', data: 'data:image/png;base64,YWJj' }],
      maskImage: 'data:image/png;base64,bWFzaw==',
      fetchImpl: sdInpaintFetch
    })
    expect(JSON.parse(sdInpaintFetch.mock.calls[0][1].body)).toMatchObject({
      init_images: ['data:image/png;base64,YWJj'],
      mask: 'data:image/png;base64,bWFzaw==',
      inpaint_full_res: true
    })
    expect(getImageProviderCapabilities({ type: 'minimax_image' })).toMatchObject({
      textToImage: true,
      imageToImage: false,
      inpaint: false
    })
    expect(getImageProviderCapabilities({ type: 'sd_webui' })).toMatchObject({
      imageToImage: true,
      inpaint: true,
      controlImages: false
    })
    expect(getImageProviderCapabilities({
      type: 'http',
      requestTemplate: '{"reference":"{{reference_image}}","mask":"{{mask_image}}","controls":{{control_images_json}}}'
    })).toMatchObject({
      imageToImage: true,
      inpaint: true,
      controlImages: true
    })
    await expect(generateImage({ type: 'minimax_image' }, {
      prompt: '局部修订',
      referenceImages: [{ id: 'source', data: 'data:image/png;base64,YWJj' }],
      maskImage: 'data:image/png;base64,bWFzaw==',
      fetchImpl: vi.fn()
    })).rejects.toThrow('不支持带原图的局部遮罩修订')

    expect(IMAGE_MODEL_TYPES).toContainEqual({ value: 'minimax_image', label: 'MiniMax Image' })
    expect(createImageModelConfigDraft('minimax_image')).toMatchObject({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com',
      defaultModel: 'image-01'
    })
    const minimaxFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { image_base64: ['bWluaW1heA=='] },
          base_resp: { status_code: 0, status_msg: 'success' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ object: 'list', data: [{ id: 'MiniMax-M2.7' }] })
      })
    const minimaxImage = await generateImage({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com/',
      apiKey: 'minimax-secret',
      defaultModel: 'image-01'
    }, {
      prompt: '蓝色空间号穿过小行星带',
      negativePrompt: '文字，水印',
      width: 1280,
      height: 720,
      fetchImpl: minimaxFetch
    })
    const minimaxRequest = minimaxFetch.mock.calls[0]
    expect(minimaxRequest[0]).toBe('https://api.minimaxi.com/v1/image_generation')
    expect(minimaxRequest[1].headers.Authorization).toBe('Bearer minimax-secret')
    expect(JSON.parse(minimaxRequest[1].body)).toEqual(expect.objectContaining({
      model: 'image-01',
      prompt: '蓝色空间号穿过小行星带\n避免出现：文字，水印',
      aspect_ratio: '16:9',
      response_format: 'base64',
      n: 1,
      prompt_optimizer: false,
      aigc_watermark: false
    }))
    expect(minimaxImage).toBe('data:image/jpeg;base64,bWluaW1heA==')
    expect(await testImageProviderConnection({
      type: 'minimax_image',
      baseUrl: 'https://api.minimaxi.com',
      apiKey: 'minimax-secret'
    }, { fetchImpl: minimaxFetch })).toMatchObject({ ok: true, authenticated: true })
    expect(minimaxFetch.mock.calls[1][0]).toBe('https://api.minimaxi.com/v1/models')
    await expect(generateImage({
      type: 'minimax_image',
      apiKey: 'minimax-secret',
      defaultModel: 'image-01'
    }, {
      prompt: '触发业务错误',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ base_resp: { status_code: 1008, status_msg: 'invalid params' } })
      })
    })).rejects.toThrow('MiniMax Image 1008')

    const savedConfig = saveImageProviderConfig({ ...config, name: '统一图像服务' })
    saveImageProviderConfig({ ...savedConfig, name: '统一图像服务 v2', baseUrl: 'https://images.example/v2/' })
    expect(listImageProviderConfigs()).toEqual([
      expect.objectContaining({ id: savedConfig.id, name: '统一图像服务 v2', baseUrl: 'https://images.example/v2' })
    ])

    const blobs = new Map()
    const binaryStore = {
      put: async (id, blob) => blobs.set(id, blob),
      get: async (id) => blobs.get(id) || null,
      delete: async (id) => blobs.delete(id)
    }
    const media = await saveMediaAsset({
      id: 'media-1',
      projectId: 'book-1',
      kind: 'image',
      purpose: 'illustration',
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }],
      provider: savedConfig.type,
      model: savedConfig.defaultModel,
      promptSnapshot: '雨夜街角',
      width: 1280,
      height: 720
    }, {
      binary: 'data:image/png;base64,YWJj',
      binaryStore
    })
    const storedMetadata = localStorage.getItem(STORAGE_KEYS.MEDIA_ASSETS)
    const resolved = await getMediaAsset(media.id, { binaryStore })

    expect(storedMetadata).toContain('idb://pinax-media/assets/media-1')
    expect(storedMetadata).not.toContain('YWJj')
    expect(listMediaAssets({ projectId: 'book-1' })).toHaveLength(1)
    expect(await resolved.blob.text()).toBe('abc')

    const parsedScript = parseComicScript(`\`\`\`json
      {"title":"雨夜来客","layout":"strip-4","pagePurpose":"旅人带来危险的秘密","pageTurnHook":"密信上的印记指向掌柜","continuityNotes":["雨势持续"],"visualBibleRefs":[{"kind":"location","refId":"tavern-1","note":"木质酒馆"}],"panels":[
        {"visual":"雨中的街角远景","dialogue":[],"caption":"夜深"},
        {"visual":"旅人推开酒馆木门","dialogue":[{"speaker":"旅人","text":"还有房间吗？"}]},
        {"visual":"掌柜抬头审视旅人","dialogue":[],"caption":""},
        {"visual":"桌下露出沾泥的密信","dialogue":[],"caption":"无人察觉"}
      ]}
    \`\`\``)
    expect(parsedScript.panels).toHaveLength(4)
    expect(buildComicScriptMessages({ sourceText: '雨夜旅人进入酒馆', panelCount: 4 })[1].content)
      .toContain('4 格')

    const comicPage = createComicPage({
      ...parsedScript,
      projectId: 'book-1',
      sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-1', projectId: 'book-1' }]
    })
    expect(comicPage).toMatchObject({
      schemaVersion: 5,
      colorMode: 'color',
      canvas: { width: 1200, height: 1600 },
      visualBible: { lineStyle: '', palette: [] },
      pagePurpose: '旅人带来危险的秘密',
      pageTurnHook: '密信上的印记指向掌柜',
      continuityNotes: ['雨势持续'],
      visualBibleRefs: [{ kind: 'location', refId: 'tavern-1', note: '木质酒馆', revision: 1 }]
    })
    expect(comicPage.panels[0]).toMatchObject({
      frame: { kind: 'rect' },
      direction: { shotSize: null, cameraAngle: null, perspective: null },
      production: { rough: { status: 'empty' }, render: { status: 'empty' } }
    })
    expect(createComicPage({
      ...comicPage,
      id: 'legacy-lettering-style',
      panels: [{
        ...comicPage.panels[0],
        letteringObjects: [{ id: 'legacy-lettering', type: 'speech', text: '旧对白', style: null }]
      }]
    }).panels[0].letteringObjects[0].style).toEqual({
      fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'center', textDirection: 'horizontal', rotation: 0
    })
    saveComicPage(comicPage)
    const withTake = addComicPanelTake(comicPage.id, comicPage.panels[0].id, media.id, { select: true })
    expect(withTake.panels[0].selectedTakeId).toBe(media.id)
    const directed = updateComicPanel(comicPage.id, comicPage.panels[0].id, {
      direction: { shotSize: 'close', cameraAngle: 'low', perspective: 'one-point', focalPoint: { x: 0.32, y: 0.68 }, zoom: 1.4 }
    })
    expect(directed.panels[0]).toMatchObject({
      direction: { revision: 2, shotSize: 'close', cameraAngle: 'low', focalPoint: { x: 0.32, y: 0.68 }, zoom: 1.4 },
      production: { render: { status: 'stale', staleReason: '分镜构图已更新' } }
    })
    expect(createComicPage({ ...comicPage, panels: [{ ...comicPage.panels[0], direction: { zoom: 0.65 } }] }).panels[0].direction.zoom).toBe(0.65)
    const staged = updateComicPanelStage(comicPage.id, comicPage.panels[0].id, 'rough', {
      artifactIds: ['rough-1'],
      selectedArtifactId: 'rough-1',
      status: 'approved'
    })
    expect(staged.panels[0].production.rough).toMatchObject({ status: 'approved', artifactIds: ['rough-1'] })
    const productionPage = saveComicPage(createComicPage({
      id: 'production-page',
      projectId: 'book-1',
      styleBible: '低饱和电影光，角色服装保持一致',
      visualBible: {
        revision: 3,
        palette: ['#28384d', '#d6c6a0'],
        lineStyle: '人物实线，背景减弱',
        renderingNotes: '冷色环境，暖色焦点，效果不得遮挡面部'
      },
      panels: [
        { id: 'production-a', order: 1, visual: '旅人推门进入酒馆' },
        { id: 'production-b', order: 2, visual: '掌柜从柜台后抬头' }
      ]
    }))
    const roughRevision = getComicStageInputRevision(productionPage, productionPage.panels[0], 'rough')
    const withRoughArtifact = addComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      {
        id: 'media-rough-a',
        inputRevision: roughRevision,
        origin: 'uploaded',
        createdAt: 10
      }
    )
    expect(withRoughArtifact.panels[0].production.rough).toMatchObject({
      status: 'review',
      selectedArtifactId: 'media-rough-a',
      inputRevision: roughRevision,
      artifactLineage: [expect.objectContaining({
        id: 'media-rough-a',
        origin: 'uploaded',
        inputRevision: roughRevision
      })]
    })
    const approvedRough = approveComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      { expectedInputRevision: roughRevision, now: 20 }
    )
    expect(approvedRough.panels[0].production.rough).toMatchObject({
      status: 'approved',
      approvedAt: 20
    })
    const generatedRough = await runComicStageGeneration({
      page: approvedRough,
      panel: approvedRough.panels[1],
      stage: 'rough',
      config: {
        id: 'http-stage',
        name: '阶段测试',
        type: 'http',
        baseUrl: 'https://images.example/stage',
        responsePath: 'image'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ image: 'data:image/png;base64,cm91Z2g=' })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRoughRevision = getComicStageInputRevision(
      generatedRough,
      generatedRough.panels[1],
      'rough'
    )
    const approvedGeneratedRough = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'rough',
      { expectedInputRevision: generatedRoughRevision, now: 30 }
    )
    const generatedLine = await runComicStageGeneration({
      page: approvedGeneratedRough,
      panel: approvedGeneratedRough.panels[1],
      stage: 'line',
      config: {
        id: 'sd-stage',
        name: '线稿测试',
        type: 'sd_webui',
        baseUrl: 'http://127.0.0.1:7860'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,bGluZQ=='] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRoughId = approvedGeneratedRough.panels[1].production.rough.selectedArtifactId
    const generatedLineId = generatedLine.panels[1].production.line.selectedArtifactId
    expect(generatedLine.panels[1].production.line).toMatchObject({
      status: 'review',
      artifactLineage: [expect.objectContaining({
        id: generatedLineId,
        parentAssetId: generatedRoughId,
        origin: 'generated'
      })]
    })
    expect(listMediaAssets({}).find((asset) => asset.id === generatedLineId)?.parentAssetId)
      .toBe(generatedRoughId)
    const approvedGeneratedLine = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'line',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedLine,
          generatedLine.panels[1],
          'line'
        ),
        now: 40
      }
    )
    const flatsFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ['data:image/png;base64,ZmxhdHM='] })
    })
    const generatedFlats = await runComicStageGeneration({
      page: approvedGeneratedLine,
      panel: approvedGeneratedLine.panels[1],
      stage: 'flats',
      config: {
        id: 'sd-stage',
        name: '后期测试',
        type: 'sd_webui',
        baseUrl: 'http://127.0.0.1:7860'
      },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: flatsFetch,
      mediaOptions: { binaryStore }
    })
    const generatedFlatsId = generatedFlats.panels[1].production.flats.selectedArtifactId
    expect(generatedFlats.panels[1].production.flats.artifactLineage[0]).toMatchObject({
      id: generatedFlatsId,
      parentAssetId: generatedLineId
    })
    const flatsPrompt = JSON.parse(flatsFetch.mock.calls[0][1].body).prompt
    expect(flatsPrompt).toContain('只铺设干净的固有色分区')
    expect(flatsPrompt).toContain('限定色板：#28384d、#d6c6a0')
    expect(flatsPrompt).toContain('冷色环境，暖色焦点')
    const approvedFlats = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'flats',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedFlats,
          generatedFlats.panels[1],
          'flats'
        ),
        now: 50
      }
    )
    const generatedRender = await runComicStageGeneration({
      page: approvedFlats,
      panel: approvedFlats.panels[1],
      stage: 'render',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,cmVuZGVy'] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedRenderId = generatedRender.panels[1].production.render.selectedArtifactId
    expect(generatedRender.panels[1].production.render.artifactLineage[0].parentAssetId)
      .toBe(generatedFlatsId)
    const approvedRender = approveComicPanelStageArtifact(
      productionPage.id,
      'production-b',
      'render',
      {
        expectedInputRevision: getComicStageInputRevision(
          generatedRender,
          generatedRender.panels[1],
          'render'
        ),
        now: 60
      }
    )
    const generatedEffects = await runComicStageGeneration({
      page: approvedRender,
      panel: approvedRender.panels[1],
      stage: 'effects',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,ZWZmZWN0cw=='] })
      }),
      mediaOptions: { binaryStore }
    })
    const generatedEffectsId = generatedEffects.panels[1].production.effects.selectedArtifactId
    expect(generatedEffects.panels[1].production.effects.artifactLineage[0].parentAssetId)
      .toBe(generatedRenderId)
    expect(getComicProductionRoute(generatedEffects)).toEqual(['rough', 'line', 'flats', 'render', 'effects'])
    expect(buildComicStagePrompt({
      page: generatedEffects,
      stage: 'tones',
      basePrompt: '雨夜酒馆'
    })).toContain('保持纯黑白输出')

    const monochromePage = saveComicPage(createComicPage({
      id: 'production-monochrome',
      projectId: 'book-1',
      colorMode: 'monochrome',
      visualBible: {
        lineStyle: '硬朗轮廓与大块黑面',
        renderingNotes: '人物使用 20% 网点，背景使用 40% 网点'
      },
      panels: [{ id: 'mono-a', order: 1, visual: '旅人站在逆光门口' }]
    }))
    await saveMediaAsset({
      id: 'media-mono-line',
      projectId: 'book-1',
      kind: 'image',
      purpose: 'comic-panel',
      provider: 'manual',
      promptSnapshot: '人工线稿'
    }, {
      binary: 'data:image/png;base64,bW9uby1saW5l',
      binaryStore
    })
    const monoLineRevision = getComicStageInputRevision(
      monochromePage,
      monochromePage.panels[0],
      'line'
    )
    addComicPanelStageArtifact(monochromePage.id, 'mono-a', 'line', {
      id: 'media-mono-line',
      inputRevision: monoLineRevision,
      origin: 'uploaded',
      createdAt: 70
    })
    const approvedMonoLine = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'line',
      { expectedInputRevision: monoLineRevision, now: 80 }
    )
    const uploadedTones = await archiveUploadedComicStage({
      page: approvedMonoLine,
      panel: approvedMonoLine.panels[0],
      stage: 'tones',
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      data: 'data:image/png;base64,dG9uZXM=',
      mediaOptions: { binaryStore }
    })
    const uploadedTonesId = uploadedTones.page.panels[0].production.tones.selectedArtifactId
    expect(uploadedTones.page.panels[0].production.tones.artifactLineage[0]).toMatchObject({
      id: uploadedTonesId,
      parentAssetId: 'media-mono-line',
      origin: 'uploaded'
    })
    const approvedTones = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'tones',
      {
        expectedInputRevision: getComicStageInputRevision(
          uploadedTones.page,
          uploadedTones.page.panels[0],
          'tones'
        ),
        now: 90
      }
    )
    expect(getComicProductionRoute(approvedTones)).toEqual(['rough', 'line', 'tones', 'effects'])
    expect(getComicStageGate({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'effects',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: true, upstream: { stage: 'tones', artifactId: uploadedTonesId } })
    expect(getComicStageGate({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'render',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: false, reason: '黑白项目不使用彩色制作阶段' })
    const monoEffects = await runComicStageGeneration({
      page: approvedTones,
      panel: approvedTones.panels[0],
      stage: 'effects',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ images: ['data:image/png;base64,bW9uby1lZmZlY3Rz'] })
      }),
      mediaOptions: { binaryStore }
    })
    const monoEffectsId = monoEffects.panels[0].production.effects.selectedArtifactId
    const approvedMonoEffects = approveComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'effects',
      {
        expectedInputRevision: getComicStageInputRevision(
          monoEffects,
          monoEffects.panels[0],
          'effects'
        ),
        now: 100
      }
    )
    const replacedMonoLine = addComicPanelStageArtifact(
      monochromePage.id,
      'mono-a',
      'line',
      {
        id: 'media-mono-line-v2',
        inputRevision: getComicStageInputRevision(
          approvedMonoEffects,
          approvedMonoEffects.panels[0],
          'line'
        ),
        origin: 'uploaded',
        createdAt: 110
      }
    )
    expect(replacedMonoLine.panels[0].production.tones.status).toBe('stale')
    expect(replacedMonoLine.panels[0].production.effects.status).toBe('stale')
    const switchedToColor = updateComicPageColorMode(monochromePage.id, 'color')
    expect(switchedToColor.colorMode).toBe('color')
    expect(switchedToColor.visualBibleStatus).toBe('draft')
    expect(switchedToColor.panels[0].production.tones.status).toBe('stale')
    await expect(runComicStageGeneration({
      page: generatedLine,
      panel: generatedLine.panels[0],
      stage: 'line',
      config: { type: 'sd_webui', baseUrl: 'http://127.0.0.1:7860' },
      storageKey: 'comic-stage-library',
      projectId: 'book-1',
      fetchImpl: vi.fn(),
      mediaOptions: { binaryStore }
    })).rejects.toThrow('上游阶段产物不可用')
    const afterIsolatedFailure = listComicPages({}).find((page) => page.id === productionPage.id)
    expect(afterIsolatedFailure.panels[0].production.line.status).toBe('failed')
    expect(afterIsolatedFailure.panels[1].production.line.selectedArtifactId).toBe(generatedLineId)
    expect(getComicStageGate({
      page: approvedRough,
      panel: approvedRough.panels[0],
      stage: 'line',
      config: { type: 'sd_webui' }
    })).toMatchObject({ allowed: true, upstream: { artifactId: 'media-rough-a' } })
    expect(getComicStageGate({
      page: approvedRough,
      panel: approvedRough.panels[0],
      stage: 'line',
      config: { type: 'minimax_image' }
    })).toMatchObject({ allowed: false, reason: '当前模型不支持保持上游构图继续生成' })
    expect(getComicBatchEligiblePanels(approvedRough, 'line', { type: 'sd_webui' })
      .map((panel) => panel.id)).toEqual(['production-a'])
    const changedProduction = updateComicPanel(productionPage.id, 'production-a', {
      visual: '旅人推门后回头看向雨幕'
    })
    const reselectedOldRough = selectComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      'media-rough-a'
    )
    expect(reselectedOldRough.panels[0].production.rough.status).toBe('review')
    expect(() => approveComicPanelStageArtifact(
      productionPage.id,
      'production-a',
      'rough',
      {
        expectedInputRevision: getComicStageInputRevision(
          changedProduction,
          changedProduction.panels[0],
          'rough'
        )
      }
    )).toThrow('候选基于旧版分镜或上游')
    const productionWorkbench = mount(ComicStageWorkbench, {
      props: {
        page: approvedRough,
        panel: approvedRough.panels[1],
        modelConfig: { id: 'sd', type: 'sd_webui' },
        storageKey: 'comic-production-test',
        projectId: 'book-1'
      }
    })
    expect(productionWorkbench.findAll('.comic-stage-workbench__tabs button')).toHaveLength(5)
    expect(productionWorkbench.findAll('.comic-stage-workbench__capabilities .supported')).toHaveLength(3)
    await flushPromises()
    expect(productionWorkbench.text()).toContain('尚无阶段产物')
    productionWorkbench.unmount()
    const monochromeWorkbench = mount(ComicStageWorkbench, {
      props: {
        page: approvedTones,
        panel: approvedTones.panels[0],
        modelConfig: { id: 'sd-mono', type: 'sd_webui' },
        storageKey: 'comic-production-test',
        projectId: 'book-1'
      }
    })
    const monochromeStages = monochromeWorkbench
      .findAll('.comic-stage-workbench__tabs button strong')
      .map((item) => item.text())
    expect(monochromeStages).toEqual(['草稿', '线稿', '黑块/网点', '效果'])
    expect(monochromeWorkbench.text()).toContain('人物使用 20% 网点')
    monochromeWorkbench.unmount()
    const withBible = updateComicVisualBible(comicPage.id, {
      lineStyle: '细线与大块黑面',
      palette: ['#28384d', '#d6c6a0']
    })
    expect(withBible.visualBible).toMatchObject({ revision: 2, lineStyle: '细线与大块黑面' })
    expect(listComicPages({ sourceRef: { refType: 'narrative-asset', refId: 'asset-1' } })[0])
      .toMatchObject({ id: comicPage.id, layout: 'strip-4', status: 'draft' })
    expect(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES)).not.toContain('data:image')
    const manifest = buildComicPageManifest(withTake, { now: 1 })
    expect(manifest).toMatchObject({
      format: 'pinax-comic-page',
      version: 5,
      manifestVersion: 2,
      page: { id: comicPage.id, panels: expect.arrayContaining([expect.objectContaining({ selectedTakeId: media.id })]) }
    })
    expect(JSON.stringify(manifest)).not.toContain('data:image')
    expect(estimateLineCount('风从门缝里吹进来', 120, 22)).toBeGreaterThan(1)
    const letteringReport = analyzeComicLettering(createComicPage({
      ...comicPage,
      id: 'lettering-audit',
      panels: [{
        ...comicPage.panels[0],
        letteringObjects: [{
          id: 'overflowing',
          type: 'speech',
          text: '这是一段明显超过文字框容纳范围的对白，用于检验出版质检是否会阻止溢出内容。',
          box: [0.02, 0.02, 0.12, 0.08],
          style: { fontSize: 22 }
        }]
      }]
    }))
    expect(letteringReport.blocking.some((issue) => issue.id.startsWith('overflow:'))).toBe(true)
    expect(letteringReport.warnings.some((issue) => issue.id.startsWith('tail:'))).toBe(true)
    expect(buildComicPublicationReport(createComicPage({ ...comicPage, id: 'missing-final' })).blocking)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('image:') })]))
    expect(createComicPage({ ...comicPage, id: 'feature-layout', layout: 'feature-4' }).layout).toBe('feature-4')
    const featureRects = getComicPanelRects('feature-6', 1200, 1600, 6)
    expect(featureRects).toHaveLength(6)
    expect(featureRects[0].width).toBeGreaterThan(featureRects[1].width)
    expect(featureRects[5].y).toBeGreaterThan(featureRects[3].y)
    const featurePage = createComicPage({
      ...comicPage,
      id: 'feature-page-geometry',
      layout: 'feature-4',
      panels: comicPage.panels.map((panel) => ({
        ...panel,
        frame: getDefaultComicPanelFrame('feature-4', panel.order, comicPage.panels.length)
      }))
    })
    expect(getComicPanelImageSize(featurePage, 2)).toEqual({ width: 720, height: 1280 })
    expect(getDefaultComicPanelFrame('feature-6', 6, 6).points[0].y).toBeGreaterThan(0.7)
    const fivePanelRects = getComicPanelRects('free', 1200, 1600, 5)
    expect(fivePanelRects).toHaveLength(5)
    expect(fivePanelRects[4].y + fivePanelRects[4].height).toBeLessThanOrEqual(1600)

    const compositionPage = saveComicPage(createComicPage({
      id: 'composition-page',
      projectId: 'book-1',
      layout: 'free',
      panels: [
        { id: 'composition-a', order: 1, visual: '建立镜头', frame: getDefaultComicPanelFrame('strip-4', 1, 4) },
        { id: 'composition-b', order: 2, visual: '人物进门', frame: getDefaultComicPanelFrame('strip-4', 2, 4) },
        { id: 'composition-c', order: 3, visual: '掌柜抬头', frame: getDefaultComicPanelFrame('strip-4', 3, 4) },
        { id: 'composition-d', order: 4, visual: '密信露出', frame: getDefaultComicPanelFrame('strip-4', 4, 4) }
      ]
    }))
    updateComicPanelStage(compositionPage.id, 'composition-a', 'rough', {
      artifactIds: ['rough-a'],
      selectedArtifactId: 'rough-a',
      status: 'approved'
    })
    updateComicPanelStage(compositionPage.id, 'composition-b', 'rough', {
      artifactIds: ['rough-b'],
      selectedArtifactId: 'rough-b',
      status: 'approved'
    })
    const approvedComposition = listComicPages().find((page) => page.id === compositionPage.id)
    const secondFrameBefore = JSON.stringify(approvedComposition.panels[1].frame)
    const splitComposition = splitComicPanel(approvedComposition, 'composition-a', 'vertical')
    expect(splitComposition.panels).toHaveLength(5)
    expect(getComicFrameBounds(splitComposition.panels[0].frame).width)
      .toBeLessThan(getComicFrameBounds(approvedComposition.panels[0].frame).width)
    expect(JSON.stringify(splitComposition.panels[2].frame)).toBe(secondFrameBefore)
    const persistedComposition = updateComicPageComposition(compositionPage.id, splitComposition)
    expect(persistedComposition.layout).toBe('free')
    expect(persistedComposition.panels[0].production.rough.status).toBe('stale')
    expect(persistedComposition.panels[2].production.rough.status).toBe('approved')
    const splitPanelId = persistedComposition.panels[1].id
    const splitPanelFrame = JSON.stringify(persistedComposition.panels[1].frame)
    const reorderedComposition = reorderComicPanel(persistedComposition, splitPanelId, 1)
    expect(JSON.stringify(reorderedComposition.panels.find((panel) => panel.id === splitPanelId).frame))
      .toBe(splitPanelFrame)
    const mergedComposition = mergeComicPanelWithNext(reorderedComposition, splitPanelId)
    expect(mergedComposition.panels).toHaveLength(4)
    const resizedFrame = resizeComicPanelFrame(mergedComposition.panels[0].frame, 'e', { x: 0.04, y: 0 })
    expect(getComicFrameBounds(resizedFrame).width)
      .toBeGreaterThan(getComicFrameBounds(mergedComposition.panels[0].frame).width)
    let controlledComposition = addComicDirectionControl(mergedComposition, mergedComposition.panels[0].id, 'blocking')
    controlledComposition = addComicDirectionControl(controlledComposition, controlledComposition.panels[0].id, 'motion')
    controlledComposition = addComicDirectionControl(controlledComposition, controlledComposition.panels[0].id, 'balloon')
    controlledComposition = updateComicPanelDirection(controlledComposition, controlledComposition.panels[0].id, {
      focalPoint: { x: 0, y: 1 },
      horizonY: 0.25
    })
    const normalizedControls = createComicPage(controlledComposition).panels[0].direction
    expect(normalizedControls.blocking[0]).toMatchObject({ label: '人物 1', box: [0.32, 0.2, 0.36, 0.66] })
    expect(normalizedControls.motionVectors[0]).toMatchObject({ from: [0.22, 0.7], to: [0.76, 0.34] })
    expect(normalizedControls.balloonSafeZones[0]).toMatchObject({ box: [0.52, 0.08, 0.4, 0.2] })
    expect(normalizedControls.focalPoint).toEqual({ x: 0, y: 1 })
    expect(normalizedControls.horizonY).toBe(0.25)
    const ungutteredRect = getComicPanelRect(controlledComposition, controlledComposition.panels[0].order)
    const gutteredComposition = setComicPanelGutter(controlledComposition, controlledComposition.panels[0].id, 0.04)
    const gutteredRect = getComicPanelRect(gutteredComposition, gutteredComposition.panels[0].order)
    expect(gutteredRect.width).toBeLessThan(ungutteredRect.width)
    expect(gutteredRect.x).toBeGreaterThan(ungutteredRect.x)
    const webtoonComposition = setComicCompositionFormat(controlledComposition, 'webtoon')
    expect(webtoonComposition.canvas.height).toBeGreaterThan(webtoonComposition.canvas.width * 2)
    expect(getComicPanelRect(webtoonComposition, webtoonComposition.panels[0].order).width).toBeGreaterThan(0)

    const compositionCanvas = mount(ComicCompositionCanvas, {
      props: {
        page: createComicPage(controlledComposition),
        activePanelId: controlledComposition.panels[0].id
      }
    })
    expect(compositionCanvas.findAll('.comic-composition__frame-handle')).toHaveLength(8)
    expect(compositionCanvas.findAll('.comic-composition__modes button')).toHaveLength(6)
    await compositionCanvas.findAll('.comic-composition__modes button')[1].trigger('click')
    await compositionCanvas.get('.comic-composition__add').trigger('click')
    expect(compositionCanvas.emitted('update-page')).toBeTruthy()
    await compositionCanvas.findAll('.comic-composition__modes button')[3].trigger('click')
    expect(compositionCanvas.get('.comic-composition__focus').attributes('aria-label')).toBe('拖动视觉焦点')
    expect(compositionCanvas.get('.comic-composition__horizon').attributes('aria-label')).toBe('拖动地平线')
    compositionCanvas.unmount()

    const referenceCatalog = buildComicReferenceCatalog({
      worldbook: {
        id: 'book-1',
        entries: [
          { id: 'char-traveler', type: 'character', name: '旅人', content: '黑发，灰色斗篷，左手戴旧戒指。' },
          { id: 'prop-letter', type: 'item', name: '密信', content: '沾泥的蓝蜡封口信。' }
        ],
        geoHistory: {
          placeRefs: [{ placeId: 'place:tavern', name: '木质酒馆', semanticType: 'building' }],
          nodes: []
        }
      },
      assets: [{
        id: 'asset-style',
        projectId: 'book-1',
        title: '雨夜线稿参考',
        content: '细线、大块黑面、冷蓝雨幕。',
        kind: 'reference-image',
        sourceRefs: [],
        image: { mediaAssetId: 'media-style' }
      }]
    })
    expect(referenceCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'character',
        sourceRef: expect.objectContaining({ refType: 'worldbook-entry', refId: 'char-traveler' })
      }),
      expect.objectContaining({
        kind: 'location',
        sourceRef: expect.objectContaining({ refType: 'map-site', refId: 'place:tavern' })
      }),
      expect.objectContaining({
        kind: 'style',
        assetIds: ['media-style']
      })
    ]))
    expect(buildComicAdaptationMessages({
      sources: [{ title: '雨夜来客', content: '旅人进入酒馆并发现密信。' }],
      referenceCatalog
    })[0].content).toContain('每页按叙事需要使用 1-8 格')

    const characterReferenceId = referenceCatalog.find((item) => item.kind === 'character').id
    const locationReferenceId = referenceCatalog.find((item) => item.kind === 'location').id
    const adaptationCandidates = parseComicAdaptationCandidates(JSON.stringify({
      candidates: [
        {
          id: 'slow-burn',
          title: '悬念缓燃',
          rationale: '先建立空间，再把密信作为页尾揭示。',
          format: 'page-ltr',
          colorMode: 'monochrome',
          pages: [
            {
              title: '雨幕',
              narrativeBeat: '建立旅人与酒馆的距离',
              pageTurnHook: '门缝出现掌柜的眼睛',
              continuityNotes: ['雨势持续'],
              panels: [
                { visual: '雨夜街角远景', beat: { action: '旅人走近酒馆' } },
                { visual: '湿透的靴子踏过门槛', beat: { action: '推门' } },
                { visual: '掌柜隔着灯影抬眼', beat: { reveal: '掌柜早有戒备' } }
              ]
            },
            {
              title: '密信',
              narrativeBeat: '把视线引到柜台下',
              pageTurnHook: '蓝蜡印记露出一角',
              panels: [
                { visual: '旅人与掌柜隔桌对峙' },
                { visual: '桌下露出沾泥密信' }
              ]
            }
          ],
          visualBible: {
            referenceIds: [characterReferenceId, locationReferenceId],
            invariants: [
              { referenceId: characterReferenceId, notes: ['灰色斗篷', '左手旧戒指'], locked: true },
              { referenceId: locationReferenceId, notes: ['柜台位于入口右侧'], locked: true }
            ],
            palette: ['冷蓝', '灯火灰白'],
            lineStyle: '细线与大块黑面',
            renderingNotes: '雨幕使用疏密网点'
          }
        },
        {
          id: 'fast-cut',
          title: '快速切入',
          rationale: '以密信开场，再回补旅人进入酒馆。',
          format: 'page-ltr',
          colorMode: 'color',
          pages: [
            {
              title: '蓝蜡',
              narrativeBeat: '先给出谜面',
              pageTurnHook: '旅人的手按住信封',
              panels: Array.from({ length: 5 }, (_, index) => ({
                visual: `密信细节镜头 ${index + 1}`,
                beat: { action: '逐步揭示印记' }
              }))
            },
            {
              title: '来客',
              narrativeBeat: '回到旅人进门',
              pageTurnHook: '掌柜认出戒指',
              panels: [{ visual: '旅人推门进入酒馆' }]
            }
          ],
          visualBible: {
            referenceIds: [characterReferenceId],
            invariants: [{ referenceId: characterReferenceId, notes: ['灰色斗篷'], locked: true }],
            palette: ['冷蓝', '暖黄'],
            lineStyle: '清晰轮廓',
            renderingNotes: '低饱和电影光'
          }
        }
      ]
    }))
    expect(adaptationCandidates).toHaveLength(2)
    expect(adaptationCandidates[0].pages.map((page) => page.panels.length)).toEqual([3, 2])
    expect(adaptationCandidates[1].pages[0].panels).toHaveLength(5)

    const sequencePages = buildComicPagesFromAdaptation({
      candidate: adaptationCandidates[0],
      sources: [{ id: 'asset-1', projectId: 'book-1', content: '雨夜旅人进入酒馆' }],
      referenceCatalog,
      projectId: 'book-1',
      sequenceId: 'sequence-rain'
    })
    expect(sequencePages).toHaveLength(2)
    expect(sequencePages[0]).toMatchObject({
      sequenceId: 'sequence-rain',
      pageNumber: 1,
      adaptationCandidateId: 'slow-burn',
      visualBibleStatus: 'draft',
      panels: [{ order: 1 }, { order: 2 }, { order: 3 }]
    })
    expect(sequencePages[0].visualBible.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'character',
        locked: true,
        sourceRef: expect.objectContaining({ refId: 'char-traveler' }),
        invariantNotes: ['灰色斗篷', '左手旧戒指']
      })
    ]))
    saveComicPages(sequencePages)
    expect(listComicSequencePages('sequence-rain').map((page) => page.pageNumber)).toEqual([1, 2])
    expect(canBatchGenerateComicPage(listComicSequencePages('sequence-rain')[0])).toBe(false)
    const confirmedSequence = confirmComicSequenceVisualBible('sequence-rain')
    expect(confirmedSequence.every((page) => page.visualBibleStatus === 'confirmed')).toBe(true)
    expect(canBatchGenerateComicPage(confirmedSequence[0])).toBe(true)

    const sourceDrawer = mount(MaterialSourceDrawer, {
      props: {
        assets: [
          { id: 'asset-a', title: '雨夜来客', kind: 'event', status: 'accepted' },
          { id: 'asset-b', title: '旧港地形', kind: 'worldbook-draft', status: 'accepted' }
        ],
        selectedIds: ['asset-a', 'asset-b'],
        multi: true
      }
    })
    expect(sourceDrawer.findAll('.index-card.is-selected')).toHaveLength(2)
    expect(sourceDrawer.get('.index-card').attributes('aria-label')).toContain('切换改编素材')
    sourceDrawer.unmount()

    const adaptationPlanner = mount(ComicAdaptationPlanner, {
      props: {
        sources: [{ id: 'asset-a', title: '雨夜来客' }],
        candidates: adaptationCandidates,
        selectedCandidateId: adaptationCandidates[0].id,
        plan: adaptationCandidates[0],
        referenceCatalog
      }
    })
    expect(adaptationPlanner.findAll('[role="tab"]')).toHaveLength(2)
    expect(adaptationPlanner.findAll('.comic-planner__page-flow > li')).toHaveLength(2)
    expect(adaptationPlanner.findAll('.comic-planner__panel-beats')).toHaveLength(2)
    expect(adaptationPlanner.text()).toContain('视觉圣经')
    await adaptationPlanner.findAll('.comic-planner__icon')[0].trigger('click')
    expect(adaptationPlanner.emitted('update-plan')).toBeTruthy()
    await adaptationPlanner.get('.comic-planner__footer .comic-planner__primary').trigger('click')
    expect(adaptationPlanner.emitted('apply')).toHaveLength(1)
    adaptationPlanner.unmount()

    const persistedPlanner = mount(ComicAdaptationPlanner, {
      props: {
        sources: [],
        candidates: [],
        plan: {
          ...adaptationCandidates[0],
          visualBible: {
            ...adaptationCandidates[0].visualBible,
            references: adaptationCandidates[0].visualBible.references
          }
        },
        referenceCatalog,
        persisted: true,
        bibleConfirmed: false
      }
    })
    await persistedPlanner.get('.comic-planner__header .comic-planner__primary').trigger('click')
    expect(persistedPlanner.emitted('confirm-bible')).toHaveLength(1)
    persistedPlanner.unmount()

    const coverTransform = getComicImageStyle(
      featurePage,
      { ...featurePage.panels[0], direction: { zoom: 1, focalPoint: { x: 0.5, y: 0.5 } } },
      { width: 1200, height: 675 }
    ).transform
    const revealTransform = getComicImageStyle(
      featurePage,
      { ...featurePage.panels[0], direction: { zoom: 0.5, focalPoint: { x: 0.5, y: 0.5 } } },
      { width: 1200, height: 675 }
    ).transform
    expect(Number(coverTransform.match(/scale\(([^)]+)/)?.[1])).toBeGreaterThan(1)
    expect(Number(revealTransform.match(/scale\(([^)]+)/)?.[1])).toBeLessThan(1)

    const imageRequest = buildComicPanelImageRequest({
      page: comicPage,
      panel: { ...comicPage.panels[1], visual: '旅人推开酒馆木门，雨水从斗篷滴落' },
      previousPanel: { ...comicPage.panels[0], visual: '雨中的街角远景，酒馆门口亮着暖灯' },
      sourceTitle: '雨夜来客',
      sourceText: '雨夜，旅人进入酒馆。他问：“还有房间吗？”掌柜注意到他袖口的泥。',
      providerType: 'minimax_image',
      previousImageData: 'data:image/png;base64,YWJj',
      targetAspect: '3:4'
    })
    expect(imageRequest.prompt).toContain('单幅')
    expect(imageRequest.prompt).toContain('雨夜来客')
    expect(imageRequest.prompt).toContain('连续性优先')
    expect(imageRequest.prompt).toContain('上一镜锚点')
    expect(imageRequest.prompt).toContain('目标画幅：3:4')
    expect(imageRequest.prompt).not.toContain('还有房间吗')
    expect(imageRequest.prompt).not.toContain('拼贴')
    expect(imageRequest.prompt).not.toContain('气泡')
    expect(imageRequest.prompt.toLowerCase()).not.toContain('comic panel')
    expect(imageRequest.negativePrompt).toBe('')
    expect(imageRequest.referenceImages).toEqual([])
    expect(`${imageRequest.prompt}\n${imageRequest.negativePrompt}`.length).toBeLessThanOrEqual(1480)
    const referencedImageRequest = buildComicPanelImageRequest({
      page: comicPage,
      panel: comicPage.panels[1],
      previousPanel: comicPage.panels[0],
      providerType: 'sd_webui',
      previousImageData: 'data:image/png;base64,YWJj'
    })
    expect(referencedImageRequest.negativePrompt).toContain('拼贴')
    expect(referencedImageRequest.referenceImages).toHaveLength(1)
    const compositionImageRequest = buildComicPanelImageRequest({
      page: controlledComposition,
      panel: createComicPage(controlledComposition).panels[0],
      sourceTitle: '雨夜来客',
      sourceText: '旅人进入酒馆'
    })
    expect(compositionImageRequest.prompt).toContain('人物调度')
    expect(compositionImageRequest.prompt).toContain('运动动线')
    expect(compositionImageRequest.prompt).toContain('视觉焦点在左侧下方')
    expect(compositionImageRequest.prompt).toContain('地平线约在画面高度 25%')
    expect(compositionImageRequest.prompt).toContain('后期文字留白')
    expect(compositionImageRequest.prompt).toContain('不要绘制文字或气泡')

    const comicEditor = mount(ComicPageEditor, {
      props: {
        sourceText: '雨夜旅人进入酒馆',
        sourceTitle: '雨夜来客',
        projectId: 'book-1',
        sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-1', projectId: 'book-1' }],
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await flushPromises()
    expect(comicEditor.text()).toContain('分格导航')
    expect(comicEditor.text()).not.toContain('视觉连续性')
    const placeScriptButton = comicEditor.findAll('button').find((button) => button.text() === '排入画面')
    expect(placeScriptButton).toBeTruthy()
    await placeScriptButton.trigger('click')
    expect(comicEditor.findAll('.comic-lettering-overlay')).toHaveLength(1)
    expect(comicEditor.find('.comic-lettering-overlay').text()).toBe('夜深')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES))[0].panels[0].letteringObjects)
      .toEqual([expect.objectContaining({
        type: 'caption',
        text: '夜深',
        style: { fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'left', textDirection: 'horizontal', rotation: 0 }
      })])
    await comicEditor.get('select[aria-label="字体"]').setValue('rounded')
    await comicEditor.get('input[aria-label="字号"]').setValue(37)
    await comicEditor.get('select[aria-label="字重"]').setValue('800')
    await comicEditor.get('select[aria-label="文字对齐"]').setValue('right')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES))[0].panels[0].letteringObjects[0].style)
      .toEqual({ fontFamily: 'rounded', fontSize: 37, fontWeight: 800, textAlign: 'right', textDirection: 'horizontal', rotation: 0 })
    expect(comicEditor.findAll('.comic-lettering-overlay__handle')).toHaveLength(8)
    await comicEditor.get('.comic-editor__workspace-tabs button:first-child').trigger('click')
    expect(comicEditor.text()).toContain('视觉连续性')
    expect(comicEditor.text()).toContain('页级节拍与连续性')
    expect(comicEditor.find('.comic-editor__planning-overview').exists()).toBe(true)
    comicEditor.unmount()

    const editablePreview = mount(ComicPagePreview, {
      props: {
        page: createComicPage({
          ...comicPage,
          id: 'editable-preview',
          panels: [{
            ...comicPage.panels[0],
        letteringObjects: [{
          id: 'preview-lettering',
          type: 'speech',
          text: '可以直接调整',
          box: [0.5, 0.08, 0.42, 0.18],
          tailTarget: { x: 0.72, y: 0.5 }
            }]
          }]
        }),
        editableLettering: true
      }
    })
    const previewPanel = editablePreview.get('.comic-page-preview__panel')
    previewPanel.element.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 300, width: 400, height: 300
    })
    const previewLettering = editablePreview.get('.comic-page-preview__lettering')
    expect(previewLettering.element.tagName).toBe('BUTTON')
    expect(editablePreview.findAll('.comic-page-preview__lettering-handle')).toHaveLength(8)
    expect(editablePreview.find('.comic-page-preview__lettering-tail')).toBeTruthy()
    const dispatchPointer = (type, clientX, clientY) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
      Object.defineProperty(event, 'pointerId', { value: 4 })
      previewLettering.element.dispatchEvent(event)
    }
    dispatchPointer('pointerdown', 250, 50)
    dispatchPointer('pointermove', 210, 80)
    dispatchPointer('pointerup', 210, 80)
    await flushPromises()
    expect(editablePreview.emitted('update-lettering-box')?.[0]?.[0]).toMatchObject({
      panelId: comicPage.panels[0].id,
      objectId: 'preview-lettering',
      box: [0.4, 0.18, 0.42, 0.18]
    })
    editablePreview.unmount()

    updateComicPanel(comicPage.id, comicPage.panels[0].id, { visual: '' })
    const standaloneEditor = mount(ComicPageEditor, {
      props: {
        pageId: comicPage.id,
        standalone: true,
        sourceCandidates: [{
          id: 'asset-panel-2',
          projectId: 'book-1',
          title: '柜台下的密信',
          content: '掌柜弯腰时，桌下露出一封沾泥的密信。旅人立刻按住斗篷。',
          kind: 'event'
        }],
        projectId: 'book-1',
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await flushPromises()
    const panelSourceSelect = standaloneEditor.get('.comic-panel__source-select select')
    await panelSourceSelect.setValue('asset-panel-2')
    const reboundPage = listComicPages({ projectId: 'book-1' }).find((page) => page.id === comicPage.id)
    expect(reboundPage.panels[0].continuityRefs).toEqual([
      expect.objectContaining({ refType: 'narrative-asset', refId: 'asset-panel-2' })
    ])
    expect(reboundPage.sourceRefs).toEqual([
      expect.objectContaining({ refType: 'narrative-asset', refId: 'asset-panel-2' })
    ])
    expect(reboundPage.panels[0].visual).toBe('')
    standaloneEditor.unmount()

    const blankEditor = mount(ComicPageEditor, {
      props: {
        sourceText: '另一个场景',
        sourceTitle: '六格空白页',
        projectId: 'book-1',
        sourceRefs: [{ refType: 'narrative-asset', refId: 'asset-blank', projectId: 'book-1' }],
        storageKey: 'comic-editor-test',
        compact: true
      }
    })
    await blankEditor.get('.comic-editor__draft-choice--count button:last-child').trigger('click')
    await blankEditor.get('.comic-editor__draft-actions button:last-child').trigger('click')
    expect(blankEditor.text()).toContain('0/6')
    expect(blankEditor.findAll('.comic-page-preview__panel')).toHaveLength(6)
    blankEditor.unmount()

    localStorage.setItem('legacy_image_library', JSON.stringify([{
      id: 'legacy-1',
      prompt: '旧图片',
      modelName: '旧模型',
      modelType: 'http',
      data: 'data:image/png;base64,YWJj'
    }]))
    const migrated = await loadGeneratedImageLibrary('legacy_image_library', { binaryStore })
    expect(migrated[0]).toMatchObject({ id: 'legacy-1', data: 'data:image/png;base64,YWJj' })
    expect(localStorage.getItem('legacy_image_library')).not.toContain('YWJj')

    await deleteMediaAsset(media.id, { binaryStore })
    await deleteMediaAsset(migrated[0].mediaAssetId, { binaryStore })

    localStorage.setItem(STORAGE_KEYS.PROSE_CARDS_V1, JSON.stringify([{
      id: 'card-1',
      content: '雨夜街角',
      attachedImages: [{
        id: 'canvas-image-1',
        prompt: '雨夜街角',
        data: 'data:image/png;base64,YWJj'
      }]
    }]))
    const migratedCards = await migrateCanvasAttachedImages({ binaryStore })
    const canvasImage = migratedCards[0].attachedImages[0]
    expect(canvasImage.mediaAssetId).toBeTruthy()
    expect(canvasImage.data).toContain('data:image/png')
    expect(localStorage.getItem(STORAGE_KEYS.PROSE_CARDS_V1)).not.toContain('YWJj')
    expect(JSON.stringify(serializeCanvasCards(migratedCards))).not.toContain('YWJj')
    expect(listMediaAssets({ sourceRef: { refType: 'canvas-card', refId: 'card-1' } })).toHaveLength(1)
    await deleteMediaAsset(canvasImage.mediaAssetId, { binaryStore })
    await deleteMediaAsset(generatedRoughId, { binaryStore })
    await deleteMediaAsset(generatedLineId, { binaryStore })
    await deleteMediaAsset(generatedFlatsId, { binaryStore })
    await deleteMediaAsset(generatedRenderId, { binaryStore })
    await deleteMediaAsset(generatedEffectsId, { binaryStore })
    await deleteMediaAsset('media-mono-line', { binaryStore })
    await deleteMediaAsset(uploadedTonesId, { binaryStore })
    await deleteMediaAsset(monoEffectsId, { binaryStore })

    expect(listMediaAssets()).toHaveLength(0)
    expect(blobs.has(media.id)).toBe(false)
    expect(deleteImageProviderConfig(savedConfig.id)).toEqual([])
  })
})

describe('ShotExporter', () => {
  it('extracts shots from relation canvas tree nodes', () => {
    const nodes = [
      {
        id: '1',
        text: '夜色',
        emotion: 'calm',
        extraFields: {
          shotType: 'wide',
          cameraMovement: 'pan',
          duration: 4
        },
        parentId: null
      },
      {
        id: '2',
        text: '路灯',
        examples: ['光线落在街角'],
        parentId: '1'
      }
    ]
    const shots = extractShotsFromRelationCanvas({
      nodes,
      edges: [{ sourceId: '1', targetId: '2', type: 'JUMP_CUT' }]
    })

    expect(shots.length).toBe(2)
    expect(shots[0].content).toBe('夜色')
    expect(shots[0].tone).toBe('淡蓝冷色调')
    expect(shots[1].dialogue).toBe('光线落在街角')
    expect(shots[1].transition).toBe('cut')
  })

  it('exports to markdown', () => {
    const md = toMarkdown([{ sequence: 1, content: '测试', shotType: 'wide', camera: 'fixed', duration: 3 }])
    expect(md).toContain('分镜脚本')
  })

  it('maps prose essay director fields into shared shots and premiere csv', () => {
    const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          content: '街灯亮起',
          emotion: 'calm',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5,
            dialogue: '今晚很安静',
            soundEffects: '雨声'
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          duration: 5,
          relationType: 'continuation',
          relationLabel: '前后镜',
          imageReferences: [{
            id: 'img-1',
            assetId: 'asset-img-1',
            source: 'asset',
            title: '街灯参考',
            width: 1024,
            height: 768
          }]
        }
      ]
    })

    const csv = toPremiereCSV(shots)
    const md = toMarkdown(shots)
    const jianying = toJianyingDraft(shots)
    const fcpxml = toFCPXML(shots)

    expect(shots[0].sound).toBe('雨声')
    expect(shots[0].assetId).toBe('asset-1')
    expect(shots[0].relationLabel).toBe('前后镜')
    expect(shots[0].imageReferences[0]).toMatchObject({ id: 'img-1', assetId: 'asset-img-1', source: 'asset' })
    expect(csv).toContain('序号,素材ID,关系,景别,运镜,时长(秒),画面描述,台词,音效,参考图')
    expect(csv).toContain('街灯亮起')
    expect(csv).toContain('雨声')
    expect(csv).toContain('街灯参考@asset 1024x768')
    expect(md).toContain('| 素材 | asset-1 |')
    expect(md).toContain('| 承接 | 前后镜 |')
    expect(md).toContain('| 参考图 | 街灯参考@asset 1024x768 |')
    expect(jianying.tracks.videoTracks[0].clips[0]).toMatchObject({
      assetId: 'asset-1',
      relation: { type: 'continuation', label: '前后镜' }
    })
    expect(jianying.tracks.videoTracks[0].clips[0].referenceImages[0].assetId).toBe('asset-img-1')
    expect(fcpxml).toContain('<asset_id>asset-1</asset_id>')
    expect(fcpxml).toContain('<relation_label>前后镜</relation_label>')
  })

  it('builds a stable editing package manifest and file list', () => {
    const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          assetId: 'asset-1',
          content: '街灯亮起',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          relationType: 'continuation',
          relationLabel: '前后镜'
        }
      ]
    })

    const pkg = buildEditingPackage(shots, {
      topic: '雨夜街道',
      storyboardDocumentId: 'doc-1',
      storyboardVersionId: 'ver-1',
      exportedAt: '2026-05-28T00:00:00.000Z'
    })

    expect(pkg.schemaVersion).toBe(2)
    expect(pkg.manifest).toMatchObject({
      packageType: 'storyboard-editing-package',
      topic: '雨夜街道',
      shotCount: 1,
      durationSeconds: 5
    })
    expect(pkg.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'storyboard.md',
      'premiere.csv',
      'jianying-draft.json',
      'timeline.fcpxml',
      'metadata.json'
    ])
    expect(pkg.formats.markdown).toContain('雨夜街道')
    expect(pkg.formats.premiereCsv).toContain('asset-1')
    expect(pkg.formats.metadata.storyboardVersionId).toBe('ver-1')
    expect(JSON.parse(pkg.files.find((file) => file.path === 'metadata.json').content).shots[0].relationLabel).toBe('前后镜')

    const zip = buildEditingPackageZip(pkg)
    const zipText = new TextDecoder().decode(zip)
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(zipText).toContain('manifest.json')
    expect(zipText).toContain('storyboard.md')
    expect(zipText).toContain('timeline.fcpxml')
    expect(zipText).toContain('metadata.json')
  })

  it('extracts shots from narrative assets and chapter outline blocks', () => {
    const assetShots = extractShotsFromNarrativeAssets({
      sourceLabel: '体验会话',
      assets: [
        {
          id: 'asset-1',
          kind: 'event',
          title: '雾港冲突',
          content: '主角在雾港发现旧案线索。'
        },
        {
          id: 'asset-2',
          kind: 'character-fact',
          title: '林舟的顾虑',
          content: '林舟不信任守卫。'
        }
      ]
    })

    const chapterShots = extractShotsFromChapter({
      chapterTitle: '第一章',
      outlineItems: [
        {
          id: 'outline-1',
          assetKind: 'draft-prose',
          title: '开场',
          content: '夜色压下来，街灯一盏盏亮起。'
        }
      ]
    })

    expect(assetShots).toHaveLength(2)
    expect(assetShots[0].notes).toContain('体验会话')
    expect(assetShots[0].shotType).toBe('wide')
    expect(chapterShots).toHaveLength(1)
    expect(chapterShots[0].notes).toContain('第一章')
    expect(chapterShots[0].content).toBe('开场')
  })
})
