import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { buildNarrativeGateStorage } from './lib/narrative-gate-fixture.mjs'

const METRICS_KEY = 'pinax_narrative_production_metrics_v1'

function usage() {
  return [
    'Usage: npm run smoke:online-narrative -- --config <provider.json> [options]',
    '',
    'Options:',
    '  --base-url <url>  Running Pinax frontend/backend (default http://127.0.0.1:5173)',
    '  --output <dir>    Artifact directory (default /tmp/pinax-online-narrative)',
    '  --timeout <ms>    Completion timeout (default 120000)',
    '  --dry-run         Validate the two-browser gate definition without network access',
    '  --help            Show this message'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.PINAX_BASE_URL || 'http://127.0.0.1:5173',
    config: '',
    output: '/tmp/pinax-online-narrative',
    timeout: 120000,
    dryRun: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--dry-run') options.dryRun = true
    else if (['--base-url', '--config', '--output', '--timeout'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
      options[token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
      index += 1
    } else throw new Error(`Unknown argument: ${token}`)
  }
  options.baseUrl = String(options.baseUrl).replace(/\/+$/, '')
  options.output = resolve(String(options.output))
  options.timeout = Math.max(5000, Number(options.timeout) || 120000)
  return options
}

async function readProviderConfig(path) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read provider config: ${error.message}`)
  }
  const config = parsed?.provider || parsed
  for (const key of ['provider', 'baseUrl', 'apiKey', 'model']) {
    if (!String(config?.[key] || '').trim()) throw new Error(`Provider config is missing ${key}`)
  }
  return {
    provider: String(config.provider).trim(),
    baseUrl: String(config.baseUrl).trim(),
    apiKey: String(config.apiKey).trim(),
    model: String(config.model).trim(),
    format: String(config.format || '').trim()
  }
}

async function installStorage(context, fixture) {
  await context.addInitScript((payload) => {
    localStorage.clear()
    sessionStorage.clear()
    for (const [key, value] of Object.entries(payload.storage)) {
      localStorage.setItem(key, JSON.stringify(value))
    }
    for (const [key, value] of Object.entries(payload.sessionStorage)) {
      sessionStorage.setItem(key, String(value))
    }
  }, fixture)
}

function watchTraffic(page, label) {
  const requests = []
  const events = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/generate/agent-turn' || path === '/api/chat') {
      requests.push({ label, path, method: request.method() })
    }
  })
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      try {
        const message = JSON.parse(String(frame.payload || ''))
        const event = message?.payload || message?.event
        if (message?.type === 'event.append' && event?.type?.startsWith('narrative.')) {
          events.push(event)
        }
      } catch {
        // Ignore heartbeat and malformed diagnostic frames.
      }
    })
  })
  return { requests, events }
}

async function readMetrics(page) {
  return page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || { events: [] }
    } catch {
      return { events: [] }
    }
  }, METRICS_KEY)
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      dryRun: true,
      browsers: 2,
      assertions: [
        'both contexts join one URL room',
        'member submits proposal and host selects it',
        'member makes zero model requests',
        'host records one narrative production run',
        'one requestId has one requested event and one completed event'
      ]
    }, null, 2)}\n`)
    return
  }
  if (!options.config) throw new Error('--config is required unless --dry-run is used')

  const providerConfig = await readProviderConfig(options.config)
  const slug = `gate-${Date.now().toString(36)}`
  const outputDir = resolve(options.output, slug)
  await mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await installStorage(hostContext, buildNarrativeGateStorage(providerConfig, { nickname: 'GateHost' }))
  await installStorage(memberContext, buildNarrativeGateStorage(null, { nickname: 'GateMember' }))
  const hostPage = await hostContext.newPage()
  const memberPage = await memberContext.newPage()
  const hostTraffic = watchTraffic(hostPage, 'host')
  const memberTraffic = watchTraffic(memberPage, 'member')
  const roomUrl = `${options.baseUrl}/experience/online/${slug}`

  try {
    await hostPage.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await hostPage.locator('.online-room__state[data-state="connected"]').waitFor({ timeout: 15000 })
    await hostPage.locator('.online-room__member-badge').waitFor({ timeout: 15000 })

    await memberPage.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await memberPage.locator('.online-room__state[data-state="connected"]').waitFor({ timeout: 15000 })
    await hostPage.locator('.online-room__member').nth(1).waitFor({ timeout: 15000 })
    await memberPage.locator('.online-room__member').nth(1).waitFor({ timeout: 15000 })

    await memberPage.locator('.input-area .input').fill('我建议先核对三天前的异常信号记录。')
    await memberPage.locator('.input-area .send-btn').click()
    const proposal = hostPage.locator('.online-room__proposal', {
      hasText: '我建议先核对三天前的异常信号记录。'
    })
    await proposal.waitFor({ timeout: 15000 })
    await proposal.getByRole('button', { name: '选择此动作为当前执行项' }).click()

    await hostPage.waitForFunction(
      (key) => {
        try {
          const metrics = JSON.parse(localStorage.getItem(key) || 'null')
          return Array.isArray(metrics?.events) && metrics.events.length === 1
        } catch {
          return false
        }
      },
      METRICS_KEY,
      { timeout: options.timeout }
    )
    await memberPage.waitForFunction(
      () => document.querySelectorAll('.prose[data-role="assistant"]').length >= 2,
      null,
      { timeout: 15000 }
    )

    const uniqueEvents = new Map()
    for (const event of [...hostTraffic.events, ...memberTraffic.events]) {
      if (event?.id) uniqueEvents.set(event.id, event)
    }
    const requested = [...uniqueEvents.values()].filter((event) => event.type === 'narrative.requested')
    const completed = [...uniqueEvents.values()].filter((event) => event.type === 'narrative.completed')
    const requestId = String(requested[0]?.payload?.requestId || '')
    const hostMetrics = await readMetrics(hostPage)
    const memberMetrics = await readMetrics(memberPage)
    const checks = {
      twoMembers: await hostPage.locator('.online-room__member').count() === 2,
      oneRequested: requested.length === 1,
      oneCompleted: completed.length === 1,
      requestIdMatches: Boolean(requestId)
        && completed[0]?.payload?.requestId === requestId,
      hostOwnsGeneration: hostTraffic.requests.length >= 2
        && hostMetrics.events?.length === 1,
      memberMakesNoModelRequest: memberTraffic.requests.length === 0
        && (memberMetrics.events?.length || 0) === 0
    }
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      roomSlug: slug,
      requestId,
      hostRequests: hostTraffic.requests,
      memberRequests: memberTraffic.requests,
      eventCounts: {
        requested: requested.length,
        status: [...uniqueEvents.values()].filter((event) => event.type === 'narrative.status').length,
        completed: completed.length
      },
      checks,
      passed: Object.values(checks).every(Boolean)
    }
    await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    process.stdout.write(`${JSON.stringify({ outputDir, ...report }, null, 2)}\n`)
    if (!report.passed) process.exitCode = 2
  } finally {
    await Promise.all([hostContext.close(), memberContext.close()])
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`Online narrative smoke failed: ${error.message}\n`)
  process.exitCode = 1
})
