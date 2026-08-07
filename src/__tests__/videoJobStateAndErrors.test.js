import { describe, expect, it, vi } from 'vitest'

import {
  createJobStore,
  JOB_STATUS,
  IllegalTransitionError,
  JobNotFoundError,
  isTerminalStatus,
  getAllowedTransitions
} from '../../server/media/GenerationJobStore.js'

describe('videoJobStore state machine', () => {
  it('covers the job state machine, storyboard input, and external result archive', async () => {
    const store = createJobStore()

    // 1. Happy path: queued → submitted → running → succeeded with terminal check.
    const job = store.createJob({
      providerId: 'minimax-video',
      model: 'demo',
      input: { prompt: 'hi', durationSeconds: 5, aspectRatio: '16:9', sourceRefs: [], referenceImages: [] }
    })
    expect(job.status).toBe(JOB_STATUS.QUEUED)
    expect(job.modality).toBe('video')
    expect(job.attempts).toBe(0)

    const submitted = store.transition(job.id, JOB_STATUS.SUBMITTED, { providerJobId: 'p_1', attempts: 1 })
    expect(submitted.status).toBe(JOB_STATUS.SUBMITTED)
    expect(submitted.providerJobId).toBe('p_1')

    const running = store.transition(job.id, JOB_STATUS.RUNNING, { progress: 40 })
    expect(running.status).toBe(JOB_STATUS.RUNNING)
    expect(running.progress).toBe(40)

    const succeeded = store.transition(job.id, JOB_STATUS.SUCCEEDED, {
      progress: 100,
      outputs: [{ url: 'https://example.com/out.mp4', kind: 'video' }]
    })
    expect(succeeded.status).toBe(JOB_STATUS.SUCCEEDED)
    expect(succeeded.outputs).toHaveLength(1)
    expect(isTerminalStatus(succeeded.status)).toBe(true)

    // 2. Illegal transitions: queued → succeeded / queued → running both reject.
    const j2 = store.createJob({
      providerId: 'minimax-video',
      model: 'demo',
      input: { prompt: 'hi', durationSeconds: 5, aspectRatio: '16:9', sourceRefs: [], referenceImages: [] }
    })
    expect(() => store.transition(j2.id, JOB_STATUS.SUCCEEDED)).toThrow(IllegalTransitionError)
    expect(() => store.transition(j2.id, JOB_STATUS.RUNNING)).toThrow(IllegalTransitionError)

    // 3. Illegal: running → submitted (only forward or terminal).
    store.transition(j2.id, JOB_STATUS.SUBMITTED)
    store.transition(j2.id, JOB_STATUS.RUNNING)
    expect(() => store.transition(j2.id, JOB_STATUS.SUBMITTED)).toThrow(IllegalTransitionError)

    // 4. Cancel idempotency: cancel on queued + cancel again = no throw, status stays cancelled.
    const j3 = store.createJob({
      providerId: 'minimax-video',
      model: 'demo',
      input: { prompt: 'hi', durationSeconds: 5, aspectRatio: '16:9', sourceRefs: [], referenceImages: [] }
    })
    const cancelled = store.cancel(j3.id)
    expect(cancelled.status).toBe(JOB_STATUS.CANCELLED)
    expect(cancelled.error?.code).toBe('ERR_PROVIDER_CANCELLED')
    const again = store.cancel(j3.id)
    expect(again.status).toBe(JOB_STATUS.CANCELLED)

    // 5. Cancel also works on running.
    const j4 = store.createJob({
      providerId: 'minimax-video',
      model: 'demo',
      input: { prompt: 'hi', durationSeconds: 5, aspectRatio: '16:9', sourceRefs: [], referenceImages: [] }
    })
    store.transition(j4.id, JOB_STATUS.SUBMITTED)
    store.transition(j4.id, JOB_STATUS.RUNNING)
    expect(store.cancel(j4.id).status).toBe(JOB_STATUS.CANCELLED)

    // 6. Allowed-transitions table matches the frozen contract.
    expect(getAllowedTransitions('queued').sort()).toEqual(['cancelled', 'failed', 'submitted'].sort())
    expect(getAllowedTransitions('submitted').sort()).toEqual(['cancelled', 'failed', 'running'].sort())
    expect(getAllowedTransitions('running').sort()).toEqual(['cancelled', 'failed', 'succeeded'].sort())
    expect(getAllowedTransitions('succeeded')).toEqual([])
    expect(getAllowedTransitions('failed')).toEqual([])
    expect(getAllowedTransitions('cancelled')).toEqual([])

    // 7. JobNotFoundError surfaces for unknown ids.
    expect(() => store.getJob('job_missing')).toThrow(JobNotFoundError)
    const directorModule = await import('../composables/useDirector.js')
    expect(typeof directorModule.buildStoryboardVideoJobInput).toBe('function')

    const storyboardShots = [
      {
        sequence: 1,
        content: '雾中的钟楼亮起一盏灯。',
        duration: 4,
        imageReferences: [{ mediaAssetId: 'img_1', data: 'data:image/png;base64,AAAA' }]
      },
      {
        shotId: 'shot_2',
        sequence: 2,
        content: '守夜人抬头看见钟摆逆向转动。',
        shotType: 'close_up',
        camera: 'push',
        duration: 6,
        transition: 'dissolve',
        relationType: 'elaboration',
        relationLabel: '因果',
        tone: '冷蓝低饱和',
        emotion: '警觉',
        dialogue: '钟声不对。',
        imageReferences: [{ mediaAssetId: 'img_2', data: 'data:image/png;base64,BBBB' }]
      }
    ]
    const input = directorModule.buildStoryboardVideoJobInput({
      documentId: 'storyboard_doc_1',
      versionId: 'storyboard_version_2',
      versionFingerprint: 'fp_2',
      projectId: 'world_1',
      sourceRefs: [
        { refType: 'history-node', refId: 'history-clocktower', projectId: 'world_1' },
        { refType: 'map-site', refId: 'place:clocktower', projectId: 'world_1' }
      ],
      shots: storyboardShots
    })

    expect(input.projectId).toBe('world_1')
    expect(input.input.prompt).toContain('雾中的钟楼')
    expect(input.input.durationSeconds).toBe(4)
    expect(input.input.sourceRefs).toContainEqual(expect.objectContaining({
      refType: 'storyboard-shot',
      refId: 'storyboard_version_2',
      version: 'fp_2'
    }))
    expect(input.input.sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ refType: 'history-node', refId: 'history-clocktower' }),
      expect.objectContaining({ refType: 'map-site', refId: 'place:clocktower' })
    ]))
    expect(input.input.referenceImages).toHaveLength(1)

    const secondShotInput = directorModule.buildStoryboardVideoJobInput({
      versionId: 'storyboard_version_2',
      projectId: 'world_1',
      shots: storyboardShots,
      shotIndex: 1
    })
    expect(secondShotInput.input.prompt).toContain('守夜人抬头')
    expect(secondShotInput.input.prompt).toContain('近景')
    expect(secondShotInput.input.prompt).toContain('[推进]')
    expect(secondShotInput.input.prompt).toContain('叠化')
    expect(secondShotInput.input.prompt).toContain('因果')
    expect(secondShotInput.input.prompt).toContain('冷蓝低饱和')
    expect(secondShotInput.input.prompt).toContain('钟声不对')
    expect(secondShotInput.input.durationSeconds).toBe(6)
    expect(secondShotInput.input.referenceImages).toEqual([
      expect.objectContaining({ mediaAssetId: 'img_2' })
    ])
    expect(secondShotInput.shot).toEqual(expect.objectContaining({
      shotId: 'shot_2',
      sequence: 2,
      relationLabel: '因果'
    }))

    const overriddenInput = directorModule.buildStoryboardVideoJobInput({
      shots: storyboardShots,
      shotIndex: 1,
      promptOverride: '自定义的最终视频提示词'
    })
    expect(overriddenInput.input.prompt).toBe('自定义的最终视频提示词')

    const mediaModule = await import('../services/media/mediaAssetStore.js')
    expect(typeof mediaModule.saveExternalMediaAsset).toBe('function')
    const memory = new Map()
    const storage = {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value)
    }
    const asset = mediaModule.saveExternalMediaAsset({
      projectId: 'world_1',
      kind: 'video',
      purpose: 'storyboard-take',
      generationJobId: 'job_1',
      externalUrl: 'https://cdn.example.com/take.mp4',
      sourceRefs: input.input.sourceRefs
    }, { storage })

    expect(asset.externalUrl).toBe('https://cdn.example.com/take.mp4')
    expect(mediaModule.listMediaAssets({ kind: 'video' }, { storage })).toHaveLength(1)

    const videoConfigModule = await import('../services/media/videoProviderConfigStore.js')
    const videoConfigMemory = new Map()
    const videoConfigStorage = {
      getItem: (key) => videoConfigMemory.get(key) || null,
      setItem: (key, value) => videoConfigMemory.set(key, value)
    }
    const savedVideoConfig = videoConfigModule.saveVideoProviderConfig({
      name: '我的海螺视频',
      providerId: 'minimax-video',
      model: 'MiniMax-Hailuo-2.3',
      baseUrl: 'https://api.minimaxi.com/',
      apiKey: 'saved-video-key',
      resolution: '768P',
      promptOptimizer: false
    }, { storage: videoConfigStorage })
    expect(videoConfigModule.listVideoProviderConfigs({ storage: videoConfigStorage }).filter((c) => !c.builtin)).toEqual([
      expect.objectContaining({
        id: savedVideoConfig.id,
        name: '我的海螺视频',
        baseUrl: 'https://api.minimaxi.com',
        apiKey: 'saved-video-key'
      })
    ])
    videoConfigModule.saveSelectedVideoProviderConfigId(savedVideoConfig.id, { storage: videoConfigStorage })
    expect(videoConfigModule.getSelectedVideoProviderConfigId({ storage: videoConfigStorage })).toBe(savedVideoConfig.id)

    // Saved video configurations feed the panel without exposing repeated
    // API key fields. Stale backend capabilities still block submission.
    const { mount, flushPromises } = await import('@vue/test-utils')
    const { videoJobService } = await import('../services/media/videoJobService.js')
    const testProvider = vi.spyOn(videoJobService, 'testProvider').mockResolvedValue({ ok: true, latencyMs: 1 })
    const listProviders = vi.spyOn(videoJobService, 'listProviders').mockResolvedValueOnce({
      providers: [{
        id: 'minimax-video',
        label: 'MiniMax Video',
        capabilities: { models: ['MiniMax-Hailuo-2.3'], aspectRatios: ['16:9'] }
      }]
    }).mockResolvedValueOnce({
      providers: [{
        id: 'minimax-video',
        label: 'MiniMax Video',
        capabilities: { models: ['MiniMax-video-01'], aspectRatios: ['16:9'] }
      }]
    })
    localStorage.setItem('video_model_configs', JSON.stringify([savedVideoConfig]))
    localStorage.setItem('video_model_selected', savedVideoConfig.id)
    const StoryboardVideoPanel = (await import('../components/media/StoryboardVideoPanel.vue')).default
    const wrapper = mount(StoryboardVideoPanel, { props: { context: { shots: storyboardShots } } })
    await flushPromises()
    expect(wrapper.text()).toContain('我的海螺视频')
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    const shotSelect = wrapper.find('[data-testid="video-shot-select"]')
    expect(shotSelect.findAll('option')).toHaveLength(2)
    await shotSelect.setValue('1')
    expect(wrapper.find('[data-testid="video-prompt-input"]').element.value).toContain('守夜人抬头')
    expect(wrapper.find('[data-testid="video-prompt-input"]').element.value).toContain('[推进]')
    expect(wrapper.text()).toContain('镜头 2 / 2')
    await wrapper.findAll('button').find((button) => button.text() === '测试连接').trigger('click')
    await flushPromises()
    expect(testProvider).toHaveBeenCalledWith('minimax-video', expect.objectContaining({
      apiKey: 'saved-video-key',
      model: 'MiniMax-Hailuo-2.3'
    }))
    wrapper.unmount()

    const staleWrapper = mount(StoryboardVideoPanel, { props: { context: { shots: storyboardShots } } })
    await flushPromises()
    await staleWrapper.findAll('button').find((button) => button.text() === '测试连接').trigger('click')
    await flushPromises()
    expect(staleWrapper.text()).toContain('后端仍在使用旧版 MiniMax 视频接口')
    expect(testProvider).toHaveBeenCalledTimes(1)
    staleWrapper.unmount()
    localStorage.removeItem('video_model_configs')
    localStorage.removeItem('video_model_selected')
    listProviders.mockRestore()
    testProvider.mockRestore()
  })
})
