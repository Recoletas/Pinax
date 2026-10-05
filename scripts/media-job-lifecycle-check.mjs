import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
// Deterministic video lifecycle smoke: injected transports only, no real keys or services.
// Run with: node scripts/media-job-lifecycle-check.mjs
const load = (path) => import(new URL('../' + path, import.meta.url))
const { createJobRunner } = await load('server/media/jobRunner.js')
const { createJobStore } = await load('server/media/GenerationJobStore.js')
const { createProviderRegistry } = await load(
  'server/media/providerRegistry.js'
)
const { normalizeAdapterError } = await load(
  'server/media/errorNormalization.js'
)
const { createGenericAsyncHttpAdapter } = await load(
  'server/media/adapters/genericAsyncHttp.js'
)
const { createMinimaxVideoAdapter } = await load(
  'server/media/adapters/minimaxVideo.js'
)
const { createMediaRouter } = await load('server/routes/media.js')
const { downloadVideoOutput, resolveVideoDownloadTarget, MAX_VIDEO_DOWNLOAD_BYTES } = await load('server/media/videoOutputDownload.js')
const silent = { info() {}, error() {} }
const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const done = {
  status: 'succeeded',
  outputs: [{ url: 'https://example.test/video.mp4', kind: 'video' }]
}
const input = {
  prompt: 'A quiet street.',
  durationSeconds: 6,
  aspectRatio: '16:9'
}
const setups = []
async function until(fn) {
  for (let i = 0; i < 300; i++) {
    if (fn()) return
    await sleep(2)
  }
  throw new Error('condition timed out')
}
function setup(overrides = {}, options = {}) {
  const store = createJobStore()
  const registry = createProviderRegistry({ logger: silent })
  const adapter = {
    id: 'test',
    testConnection: async () => ({}),
    submit: async () => ({ providerJobId: 'upstream-1' }),
    poll: async () => done,
    cancel: async () => ({}),
    normalizeError: normalizeAdapterError,
    getCapabilities: () => ({}),
    ...overrides
  }
  registry.register({ id: adapter.id, adapter, publicConfigKeys: [] })
  const runner = createJobRunner({
    store,
    registry,
    logger: silent,
    options: {
      maxConcurrency: 1,
      initialPollMs: 1,
      maxPollMs: 3,
      jitterMs: 0,
      timeoutMs: 200,
      maxAttempts: 3,
      ...options
    }
  })
  const job = () =>
    store.createJob({ projectId: 'book-A', providerId: 'test', input })
  const x = { store, registry, runner, job }
  setups.push(x)
  return x
}
let count = 0
async function check(name, fn) {
  try {
    await fn()
    count++
    process.stdout.write(`PASS ${name}\n`)
  } finally {
    for (const x of setups.splice(0)) x.runner.shutdown()
    await sleep()
  }
}
try {
  await check('first query success follows valid state machine', async () => {
    const x = setup()
    const j = x.job()
    x.runner.submit(j, {})
    await until(() => j.status === 'succeeded')
    assert.equal(j.attempts, 1)
    assert.equal(x.runner.getActiveCount(), 0)
  })
  await check(
    'query retry keeps upstream task and one submission',
    async () => {
      let submits = 0,
        polls = 0
      const x = setup({
        submit: async () => {
          submits++
          return { providerJobId: 'same' }
        },
        poll: async (j) => {
          assert.equal(j.providerJobId, 'same')
          polls++
          if (polls < 3)
            throw Object.assign(new Error('temporary'), { status: 502 })
          return done
        }
      })
      const j = x.job()
      x.runner.submit(j, {})
      await until(() => j.status === 'succeeded')
      assert.equal(submits, 1)
      assert.equal(polls, 3)
    }
  )
  await check('query retry budget terminates', async () => {
    let polls = 0
    const x = setup({
      poll: async () => {
        polls++
        throw Object.assign(new Error('temporary'), { status: 502 })
      }
    })
    const j = x.job()
    x.runner.submit(j, {})
    await until(() => j.status === 'failed')
    assert.equal(polls, 3)
    assert.equal(j.attempts, 1)
  })
  await check(
    'submission failure never automatically duplicates generation',
    async () => {
      let submits = 0
      const x = setup({
        submit: async () => {
          submits++
          throw Object.assign(new Error('connection lost'), { status: 502 })
        }
      })
      const j = x.job()
      x.runner.submit(j, {})
      await until(() => j.status === 'failed')
      await sleep(20)
      assert.equal(submits, 1)
      assert.equal(j.attempts, 1)
    }
  )
  await check('cancel sleeping query frees slot for queued job', async () => {
    let firstPolls = 0
    const x = setup(
      {
        poll: async (j) => {
          if (j.input.prompt === 'first') {
            firstPolls++
            return { status: 'running' }
          }
          return done
        }
      },
      { initialPollMs: 10000, maxPollMs: 10000 }
    )
    const a = x.job(),
      b = x.job()
    a.input.prompt = 'first'
    x.runner.submit(a, {})
    x.runner.submit(b, {})
    await until(() => firstPolls === 1)
    x.runner.cancel(a.id)
    await until(() => b.status === 'succeeded')
    assert.equal(a.status, 'cancelled')
    assert.equal(firstPolls, 1)
    assert.equal(x.runner.getActiveCount(), 0)
  })
  await check(
    'cancel in-flight submission settles locally and rejects late success',
    async () => {
      const late = deferred()
      let requested = false
      const x = setup({
        submit: async (j, c, { signal }) => {
          requested = true
          assert(signal)
          return late.promise
        }
      })
      const j = x.job()
      x.runner.submit(j, {})
      await until(() => requested)
      x.runner.cancel(j.id)
      await until(() => x.runner.getActiveCount() === 0)
      late.resolve({ providerJobId: 'too-late' })
      await sleep()
      assert.equal(j.status, 'cancelled')
      assert.equal(j.providerJobId, null)
    }
  )
  await check('cancel in-flight poll drops late output', async () => {
    const late = deferred()
    let requested = false
    const x = setup({
      poll: async () => {
        requested = true
        return late.promise
      }
    })
    const j = x.job()
    x.runner.submit(j, {})
    await until(() => requested)
    x.runner.cancel(j.id)
    await until(() => x.runner.getActiveCount() === 0)
    late.resolve(done)
    await sleep()
    assert.equal(j.status, 'cancelled')
    assert.deepEqual(j.outputs, [])
  })
  await check(
    'queued cancellation never submits and duplicate submit is coalesced',
    async () => {
      let calls = 0
      const late = deferred()
      const x = setup({
        submit: async () => {
          calls++
          return late.promise
        }
      })
      const a = x.job(),
        b = x.job()
      x.runner.submit(a, {})
      x.runner.submit(a, {})
      x.runner.submit(b, {})
      await until(() => calls === 1)
      x.runner.cancel(b.id)
      x.runner.cancel(a.id)
      await until(() => x.runner.getActiveCount() === 0)
      assert.equal(calls, 1)
      assert.equal(b.status, 'cancelled')
    }
  )
  await check(
    'shutdown cancels queued and active jobs and releases listeners',
    async () => {
      const initial = process.listenerCount('SIGINT')
      const x = setup({ submit: () => new Promise(() => {}) })
      const a = x.job(),
        b = x.job()
      x.runner.submit(a, {})
      x.runner.submit(b, {})
      await until(() => x.runner.getActiveCount() === 1)
      x.runner.shutdown()
      await until(() => x.runner.getActiveCount() === 0)
      assert.equal(a.status, 'cancelled')
      assert.equal(b.status, 'cancelled')
      assert.equal(process.listenerCount('SIGINT'), initial)
    }
  )
  await check(
    'existing provider id resumes querying without submit',
    async () => {
      let submits = 0
      const x = setup({
        submit: async () => {
          submits++
          return {}
        }
      })
      const j = x.job()
      x.store.transition(j.id, 'submitted', { providerJobId: 'existing' })
      x.runner.submit(j, {})
      await until(() => j.status === 'succeeded')
      assert.equal(submits, 0)
    }
  )
  await check(
    'submission timeout ignores late response without resubmit',
    async () => {
      const late = deferred()
      let calls = 0
      const x = setup(
        {
          submit: () => {
            calls++
            return late.promise
          }
        },
        { timeoutMs: 5 }
      )
      const j = x.job()
      x.runner.submit(j, {})
      await until(() => j.status === 'failed')
      late.resolve({ providerJobId: 'late' })
      await sleep()
      assert.equal(j.status, 'failed')
      assert.equal(calls, 1)
      assert.equal(j.providerJobId, null)
    }
  )
  await check(
    'unknown and invalid output responses cannot produce success',
    async () => {
      for (const result of [
        { status: 'done' },
        { status: 'succeeded', outputs: [{ url: 'javascript:alert(1)' }] },
        { status: 'succeeded', outputs: [] }
      ]) {
        const x = setup({ poll: async () => result })
        const j = x.job()
        x.runner.submit(j, {})
        await until(() => j.status === 'failed')
      }
    }
  )
  await check(
    'store snapshots inputs and refuses terminal mutation',
    async () => {
      const x = setup()
      const j = x.job()
      j.input.prompt = 'different'
      assert.equal(input.prompt, 'A quiet street.')
      x.store.cancel(j.id)
      assert.throws(() => x.store.patchJob(j.id, { outputs: done.outputs }))
      assert.notEqual(j.id, x.job().id)
    }
  )
  await check('bounded concurrency and stop queue drain hold', async () => {
    let active = 0,
      max = 0
    const x = setup(
      {
        submit: async (j) => {
          active++
          max = Math.max(max, active)
          await sleep(3)
          active--
          return { providerJobId: j.id }
        }
      },
      { maxConcurrency: 2 }
    )
    const jobs = Array.from({ length: 8 }, x.job)
    for (const j of jobs) x.runner.submit(j, {})
    await until(() => jobs.every((j) => j.status === 'succeeded'))
    assert.equal(max, 2)
  })
  const genericConfig = {
    submitUrl: 'https://example.test/create',
    statusUrl: 'https://example.test/state',
    statusPath: 'data.id',
    submitBodyTemplate:
      '{"prompt":"{{prompt}}","duration":{{duration}},"model":"{{model}}"}'
  }
  await check(
    'generic template keeps dollar signs and embedded placeholder text literal',
    async () => {
      let body
      const adapter = createGenericAsyncHttpAdapter({
        fetchImpl: async (u, init) => {
          body = JSON.parse(init.body)
          return Response.json({ data: { id: '1' } })
        }
      })
      const prompt = '$& $$ $` $\' "quoted"\n{{duration}}'
      await adapter.submit(
        { input: { ...input, prompt }, model: 'custom' },
        genericConfig
      )
      assert.equal(body.prompt, prompt)
      assert.equal(body.duration, 6)
    }
  )
  await check(
    'generic case-normalized statuses and id query are honored',
    async () => {
      let url
      const adapter = createGenericAsyncHttpAdapter({
        fetchImpl: async (u) => {
          url = new URL(u)
          return Response.json({
            status: ' SUCCESS ',
            output_url: 'https://example.test/out.mp4'
          })
        }
      })
      const result = await adapter.poll(
        { providerJobId: 'data' },
        { ...genericConfig, successStatuses: ['Success'] }
      )
      assert.equal(url.searchParams.get('id'), 'data')
      assert.equal(result.status, 'succeeded')
    }
  )
  await check(
    'generic rejects unknown states and malformed config before call',
    async () => {
      let calls = 0
      const adapter = createGenericAsyncHttpAdapter({
        fetchImpl: async () => {
          calls++
          return Response.json({ status: 'nonsense' })
        }
      })
      await assert.rejects(
        adapter.poll({ providerJobId: '1' }, genericConfig),
        /unrecognized/
      )
      assert(
        adapter.validate({ ...genericConfig, submitUrl: 'file:///secret' })
      )
      assert(
        adapter.validate({ ...genericConfig, submitBodyTemplate: 'not json' })
      )
      assert.equal(calls, 1)
    }
  )
  await check(
    'MiniMax submit/query/retrieve honors transport signal and long signed URL',
    async () => {
      const calls = []
      const longUrl = 'https://example.test/video?signature=' + 'a'.repeat(5000)
      const adapter = createMinimaxVideoAdapter({
        fetchImpl: async (url, init) => {
          calls.push({ url, init })
          if (url.includes('/query/'))
            return Response.json({
              status: 'Success',
              file_id: 'file-1',
              base_resp: { status_code: 0 }
            })
          if (url.includes('/files/'))
            return Response.json({
              file: { download_url: longUrl },
              base_resp: { status_code: 0 }
            })
          return Response.json({
            task_id: 'task-1',
            base_resp: { status_code: 0 }
          })
        }
      })
      const signal = new AbortController().signal
      const config = { apiKey: 'fake-test-key' }
      const j = { input, model: 'MiniMax-Hailuo-2.3' }
      const submitted = await adapter.submit(j, config, { signal })
      const result = await adapter.poll({ ...j, ...submitted }, config, {
        signal
      })
      assert.equal(calls.length, 3)
      assert(
        calls.every(
          (x) => x.init.signal === signal && x.init.redirect === 'error'
        )
      )
      assert.equal(result.outputs[0].url, longUrl)
      assert.equal(result.outputs[0].expiresInSeconds, 3600)
    }
  )
  await check(
    'MiniMax connection requires provider evidence, not arbitrary HTTP 200',
    async () => {
      let payload = 'html'
      const adapter = createMinimaxVideoAdapter({
        fetchImpl: async () =>
          typeof payload === 'string'
            ? new Response(payload)
            : Response.json(payload)
      })
      assert.equal(
        (await adapter.testConnection({ apiKey: 'fake' })).authenticated,
        false
      )
      payload = {
        base_resp: { status_code: 2013, status_msg: 'invalid task_id' }
      }
      assert.equal(
        (await adapter.testConnection({ apiKey: 'fake' })).authenticated,
        true
      )
      payload = { base_resp: { status_code: 1004 } }
      assert.equal(
        (await adapter.testConnection({ apiKey: 'fake' })).authenticated,
        false
      )
    }
  )
  await check(
    'MiniMax rejects unsupported generation fields before network',
    async () => {
      let calls = 0
      const adapter = createMinimaxVideoAdapter({
        fetchImpl: async () => {
          calls++
          return Response.json({})
        }
      })
      for (const wrong of [
        { aspectRatio: '9:16' },
        { referenceImages: [{ data: 'data:image/png;base64,AA==' }] },
        { durationSeconds: 8 }
      ])
        await assert.rejects(
          adapter.submit({ input: { ...input, ...wrong } }, { apiKey: 'fake' })
        )
      assert.equal(calls, 0)
    }
  )
  await check(
    'normalized error message and nested headers are redacted',
    async () => {
      const error = normalizeAdapterError({
        code: 'ERR_PROVIDER_UPSTREAM',
        message: 'Authorization: Bearer demo_value secret="demo_value"',
        details: 'apiKey=demo_value'
      })
      assert(!JSON.stringify(error).includes('demo_value'))
      const reg = createProviderRegistry({ logger: silent })
      const value = reg.redactConfig({
        submitHeaders: { 'X-Auth': 'demo_value' },
        API_KEY: 'demo_value',
        nested: { Authorization: 'demo_value' }
      })
      assert(!JSON.stringify(value).includes('demo_value'))
    }
  )
  await check(
    'route upfront provider/config/input validation creates no invalid jobs',
    async () => {
      let submits = 0
      const router = createMediaRouter({
        logger: silent,
        runner: {
          submit() {
            submits++
          },
          shutdown() {}
        }
      })
      const handler = router.stack.find(
        (layer) => layer.route?.path === '/api/media/jobs'
      ).route.stack[0].handle
      function call(body) {
        const r = {
          statusCode: 200,
          status(n) {
            this.statusCode = n
            return this
          },
          json(data) {
            this.data = data
            return this
          }
        }
        handler({ body }, r)
        return r
      }
      for (const body of [
        { providerId: 'bad', input },
        { providerId: 'generic-async-http', input },
        {
          providerId: 'minimax-video',
          input: { ...input, durationSeconds: 10 },
          providerConfig: { resolution: '1080P' }
        }
      ])
        assert.equal(call(body).statusCode, 400)
      assert.equal(router.mediaRuntime.store.size(), 0)
      assert.equal(submits, 0)
      const good = call({
        providerId: 'minimax-video',
        input,
        providerConfig: { apiKey: 'fake-key', arbitrary: 'not-stored' },
        projectId: 'book-A'
      })
      assert.equal(good.statusCode, 201)
      assert.equal(good.data.projectId, 'book-A')
      assert(!JSON.stringify(good.data).includes('fake-key'))
      assert.equal(submits, 1)
    }
  )
  await check(
    'MiniMax rejects task and file results from another identity',
    async () => {
      for (const mismatch of ['task', 'file']) {
        const adapter = createMinimaxVideoAdapter({
          fetchImpl: async (url) =>
            Response.json(
              url.includes('/query/')
                ? {
                    task_id: mismatch === 'task' ? 'other-task' : 'task-1',
                    status: 'Success',
                    file_id: 'file-1',
                    base_resp: { status_code: 0 }
                  }
                : {
                    file: {
                      file_id: 'other-file',
                      download_url: 'https://example.test/out.mp4'
                    },
                    base_resp: { status_code: 0 }
                  }
            )
        })
        await assert.rejects(
          adapter.poll({ providerJobId: 'task-1' }, { apiKey: 'fake' }),
          /different/
        )
      }
    }
  )
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]
  const mp4 = Buffer.from('000000186674797069736F6D00000200', 'hex')
  const transport = (responses, capture = () => {}) => (url, config, callback) => {
    capture(url, config)
    const request = new EventEmitter()
    const item = responses.shift()
    const stream = Readable.from(item.chunks || [mp4])
    stream.statusCode = item.status || 200
    stream.headers = item.headers || {}
    queueMicrotask(() => callback(stream))
    return request
  }
  await check('video original blocks private DNS, literal IPs and URL credentials', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', '2002:7f00:1::']) {
      await assert.rejects(resolveVideoDownloadTarget('https://media.example/video', { lookupImpl: async () => [{ address, family: address.includes(':') ? 6 : 4 }] }), { code: 'ERR_VIDEO_URL_BLOCKED' })
    }
    for (const url of ['http://media.example/video', 'https://127.0.0.1/video', 'https://user:secret@media.example/video', 'https://media.example:8443/video']) {
      await assert.rejects(resolveVideoDownloadTarget(url, { lookupImpl: publicDns }), { code: 'ERR_VIDEO_URL_BLOCKED' })
    }
  })
  await check('video original pins DNS and forwards no credentials', async () => {
    const result = await downloadVideoOutput('https://media.example/video', { lookupImpl: publicDns, requestImpl: transport([{}], (_url, config) => {
      assert.deepEqual(Object.keys(config.headers), ['Accept'])
      config.lookup('media.example', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4) })
    }) })
    assert.equal(result.mimeType, 'video/mp4'); assert.deepEqual(result.binary, mp4)
  })
  await check('video redirect validates destination before another connection', async () => {
    let connections = 0
    await assert.rejects(downloadVideoOutput('https://media.example/video', { lookupImpl: publicDns, requestImpl: transport([{ status: 302, headers: { location: 'https://127.0.0.1/private' } }], () => connections++) }), { code: 'ERR_VIDEO_URL_BLOCKED' })
    assert.equal(connections, 1)
    await assert.rejects(downloadVideoOutput('https://media.example/video', { lookupImpl: publicDns, requestImpl: transport(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/again' } }))) }), { code: 'ERR_VIDEO_REDIRECT' })
  })
  await check('video original rejects HTML, oversized headers and oversized streams', async () => {
    for (const [item, code] of [[{ chunks: [Buffer.from('<html>login</html>')] }, 'ERR_VIDEO_INVALID_BINARY'], [{ headers: { 'content-length': MAX_VIDEO_DOWNLOAD_BYTES + 1 } }, 'ERR_VIDEO_TOO_LARGE'], [{ chunks: [Buffer.alloc(MAX_VIDEO_DOWNLOAD_BYTES + 1)] }, 'ERR_VIDEO_TOO_LARGE']]) {
      await assert.rejects(downloadVideoOutput('https://media.example/video', { lookupImpl: publicDns, requestImpl: transport([item]) }), { code })
    }
  })
  await check('video original cancellation ends even a stalled DNS lookup', async () => {
    const controller = new AbortController()
    let connections = 0
    const pending = downloadVideoOutput('https://media.example/video', { signal: controller.signal, lookupImpl: () => new Promise(() => {}), requestImpl: () => { connections++ } })
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' }); assert.equal(connections, 0)
  })
  process.stdout.write(`${count}/${count} backend scenarios passed\n`)
} catch (error) {
  process.stderr.write(String(error?.stack || error) + '\n')
  process.exitCode = 1
}
