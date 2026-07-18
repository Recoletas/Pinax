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

    const input = directorModule.buildStoryboardVideoJobInput({
      documentId: 'storyboard_doc_1',
      versionId: 'storyboard_version_2',
      versionFingerprint: 'fp_2',
      projectId: 'world_1',
      shots: [
        {
          sequence: 1,
          content: '雾中的钟楼亮起一盏灯。',
          duration: 4,
          imageReferences: [{ mediaAssetId: 'img_1', data: 'data:image/png;base64,AAAA' }]
        }
      ]
    })

    expect(input.projectId).toBe('world_1')
    expect(input.input.prompt).toContain('雾中的钟楼')
    expect(input.input.durationSeconds).toBe(4)
    expect(input.input.sourceRefs).toContainEqual(expect.objectContaining({
      refType: 'storyboard-shot',
      refId: 'storyboard_version_2',
      version: 'fp_2'
    }))
    expect(input.input.referenceImages).toHaveLength(1)

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

    // The channel picker owns the current official MiniMax model list. Stale
    // backend capabilities must not replace it with the retired model name.
    const { mount, flushPromises } = await import('@vue/test-utils')
    const { videoJobService } = await import('../services/media/videoJobService.js')
    const listProviders = vi.spyOn(videoJobService, 'listProviders').mockResolvedValue({
      providers: [{
        id: 'minimax-video',
        label: 'MiniMax Video',
        capabilities: { models: ['MiniMax-video-01'], aspectRatios: ['16:9'] }
      }]
    })
    const StoryboardVideoPanel = (await import('../components/media/StoryboardVideoPanel.vue')).default
    const wrapper = mount(StoryboardVideoPanel, { props: { context: { shots: [] } } })
    await flushPromises()
    const channelOptions = wrapper.find('select').findAll('option').map((option) => option.text())
    expect(channelOptions).toContain('MiniMax-Hailuo-2.3')
    expect(channelOptions).toContain('MiniMax-Hailuo-02')
    expect(channelOptions).toContain('T2V-01-Director')
    expect(channelOptions).toContain('T2V-01')
    expect(channelOptions).not.toContain('MiniMax-video-01')
    wrapper.unmount()
    listProviders.mockRestore()
  })
})
