/**
 * 核心服务集成测试（精简版）
 */

import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ComicPageEditor from '../components/media/ComicPageEditor.vue'
import ComicPagePreview from '../components/media/ComicPagePreview.vue'
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
  buildComicPageManifest,
  createComicPage,
  listComicPages,
  saveComicPage,
  updateComicPanel,
  updateComicPanelStage,
  updateComicVisualBible
} from '../services/media/comicPageStore'
import {
  getComicImageStyle,
  getComicPanelImageSize,
  getComicPanelRects,
  getDefaultComicPanelFrame
} from '../services/media/comicLayout'
import {
  buildComicScriptMessages,
  parseComicScript
} from '../services/media/comicScriptService'
import { buildComicPanelImageRequest } from '../services/media/comicImagePrompt'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('PromptBuilder', () => {
  it('builds system prompt with style', () => {
    const prompt = buildSystemPrompt('narrator', { style: 'webnovel' })
    expect(prompt).toContain('网文风')
  })

  it('builds narrative constraints', () => {
    const prompt = buildNarrativeConstraints({ currentPeriod: '清晨', currentScene: '酒馆' })
    expect(prompt).toContain('清晨')
    expect(prompt).toContain('硬性约束')
  })

  it('builds complete prompt sequence', () => {
    const messages = buildPromptSequence({
      templateKey: 'narrator',
      worldBookEntries: [{ name: '测试', type: 'character', content: '测试内容' }]
    })
    expect(messages.length).toBeGreaterThan(0)
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
      schemaVersion: 3,
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
      fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'center'
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
      version: 3,
      page: { id: comicPage.id, panels: expect.arrayContaining([expect.objectContaining({ selectedTakeId: media.id })]) }
    })
    expect(JSON.stringify(manifest)).not.toContain('data:image')
    expect(createComicPage({ ...comicPage, id: 'feature-layout', layout: 'feature-4' }).layout).toBe('feature-4')
    const featureRects = getComicPanelRects('feature-6', 1200, 1600, 6)
    expect(featureRects).toHaveLength(6)
    expect(featureRects[0].width).toBeGreaterThan(featureRects[1].width)
    expect(featureRects[5].y).toBeGreaterThan(featureRects[3].y)
    expect(getComicPanelImageSize({ ...comicPage, layout: 'feature-4' }, 2)).toEqual({ width: 720, height: 1280 })
    expect(getDefaultComicPanelFrame('feature-6', 6, 6).points[0].y).toBeGreaterThan(0.7)
    const coverTransform = getComicImageStyle(
      { ...comicPage, layout: 'feature-4' },
      { ...comicPage.panels[0], direction: { zoom: 1, focalPoint: { x: 0.5, y: 0.5 } } },
      { width: 1200, height: 675 }
    ).transform
    const revealTransform = getComicImageStyle(
      { ...comicPage, layout: 'feature-4' },
      { ...comicPage.panels[0], direction: { zoom: 0.5, focalPoint: { x: 0.5, y: 0.5 } } },
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
        style: { fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'left' }
      })])
    await comicEditor.get('select[aria-label="字体"]').setValue('rounded')
    await comicEditor.get('input[aria-label="字号"]').setValue(37)
    await comicEditor.get('select[aria-label="字重"]').setValue('800')
    await comicEditor.get('select[aria-label="文字对齐"]').setValue('right')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.COMIC_PAGES))[0].panels[0].letteringObjects[0].style)
      .toEqual({ fontFamily: 'rounded', fontSize: 37, fontWeight: 800, textAlign: 'right' })
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
              box: [0.5, 0.08, 0.42, 0.18]
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
    await blankEditor.get('.comic-editor__draft-options select').setValue('6')
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
