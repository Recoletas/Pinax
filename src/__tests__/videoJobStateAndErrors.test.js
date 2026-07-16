import { describe, expect, it } from 'vitest'

import {
  createJobStore,
  JOB_STATUS,
  IllegalTransitionError,
  JobNotFoundError,
  isTerminalStatus,
  getAllowedTransitions
} from '../../server/media/GenerationJobStore.js'

describe('videoJobStore state machine', () => {
  it('runs the full state machine: queued→submitted→running→succeeded with illegal-transition rejection and cancel idempotency', () => {
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
  })
})