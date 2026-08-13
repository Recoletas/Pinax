import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  buildNarrativeGateScenarioMatrix,
  buildNarrativeGateStorage,
  buildNarrativeContinuityMatrix,
  summarizeScenarioMatrix
} from './lib/narrative-gate-fixture.mjs'
import {
  createNarrativeAgentStreamEvent,
  serializeNarrativeAgentSseEvent
} from '../shared/narrativeAgentStreamContract.js'

const METRICS_KEY = 'pinax_narrative_production_metrics_v1'

function usage() {
  return [
    'Usage: npm run smoke:narrative-production -- --config <provider.json> [options]',
    '',
    'Options:',
    '  --base-url <url>   Running Pinax frontend (default http://127.0.0.1:5173)',
    '  --count <n>        Number of rounds, 1-120 (default 60)',
    '  --output <dir>     Artifact directory (default /tmp/pinax-narrative-production)',
    '  --timeout <ms>     Per-round timeout (default 120000)',
    '  --no-faults        Do not replace the final two rounds with controlled failures',
    '  --continuity       Drive the 6 multi-turn continuity groups (respond->extend->advance)',
    '  --dry-run          Validate and print the scenario matrix without network access',
    '  --help             Show this message'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.PINAX_BASE_URL || 'http://127.0.0.1:5173',
    config: '',
    count: 60,
    output: '/tmp/pinax-narrative-production',
    timeout: 120000,
    includeFaults: true,
    continuity: false,
    dryRun: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--dry-run') options.dryRun = true
    else if (token === '--no-faults') options.includeFaults = false
    else if (token === '--continuity') options.continuity = true
    else if (['--base-url', '--config', '--count', '--output', '--timeout'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
      options[token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
      index += 1
    } else throw new Error(`Unknown argument: ${token}`)
  }
  options.count = Math.max(1, Math.min(120, Number(options.count) || 60))
  options.timeout = Math.max(5000, Number(options.timeout) || 120000)
  options.baseUrl = String(options.baseUrl).replace(/\/+$/, '')
  options.output = resolve(String(options.output))
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

async function metrics(page) {
  return page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || { schemaVersion: 1, events: [] }
    } catch {
      return { schemaVersion: 1, events: [] }
    }
  }, METRICS_KEY)
}

function controlledError(fault) {
  if (fault === 'rate-limit') {
    return {
      status: 429,
      body: {
        code: 'NARRATIVE_PROVIDER_RATE_LIMITED',
        error: '受控评测：供应商限流',
        retryable: true
      }
    }
  }
  return {
    status: 504,
    body: {
      code: 'NARRATIVE_AGENT_DECISION_TIMEOUT',
      error: '受控评测：叙事资料决策超时',
      retryable: true
    }
  }
}

function controlledStreamError(fault, requestId = 'controlled-r7') {
  const response = controlledError(fault)
  return serializeNarrativeAgentSseEvent(createNarrativeAgentStreamEvent('error', {
    ...response.body,
    message: response.body.error
  }, {
    requestId,
    seq: 1
  }))
}

function redactDiagnostic(value, secrets = []) {
  let output = String(value || '')
  for (const secret of secrets) {
    const normalized = String(secret || '').trim()
    if (normalized) output = output.split(normalized).join('[redacted]')
  }
  return output.slice(0, 300)
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  // C0/P0-1：--continuity 走 6 组多轮连续矩阵（respond→extend→advance），否则用旧的单轮矩阵。
  let driveItems
  let matrix
  if (options.continuity) {
    const groups = buildNarrativeContinuityMatrix(6)
    driveItems = groups.flatMap((group) => group.turns.map((turn) => ({
      id: `${group.id}-t${turn.turnIndex}`,
      group: group.id,
      category: group.category,
      intent: turn.intent,
      input: turn.intent === 'respond' ? turn.action
        : turn.intent === 'extend' ? '/continue'
        : '/advance',
      canonicalFacts: [],
      forbiddenFacts: [],
      controlledFault: ''
    })))
    matrix = { mode: 'continuity', groups: groups.length, turns: driveItems.length }
  } else {
    const scenarios = buildNarrativeGateScenarioMatrix(options.count, {
      includeControlledFailures: options.includeFaults
    })
    driveItems = scenarios.map((scenario) => ({
      id: scenario.runId || scenario.id,
      group: '',
      category: scenario.category,
      intent: 'respond',
      input: scenario.action,
      canonicalFacts: scenario.canonicalFacts,
      forbiddenFacts: scenario.forbiddenFacts,
      controlledFault: scenario.controlledFault
    }))
    matrix = summarizeScenarioMatrix(scenarios)
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      dryRun: true,
      continuity: options.continuity,
      matrix,
      driveItems: driveItems.map((item) => ({ id: item.id, intent: item.intent, group: item.group }))
    }, null, 2)}\n`)
    return
  }
  if (!options.config) throw new Error('--config is required unless --dry-run is used')

  const providerConfig = await readProviderConfig(options.config)
  const outputDir = resolve(options.output, new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await installStorage(context, buildNarrativeGateStorage(providerConfig))
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(redactDiagnostic(message.text(), [
        providerConfig.apiKey,
        providerConfig.baseUrl
      ]))
    }
  })

  let activeFault = ''
  await page.route('**/api/generate/agent-step/stream', async (route) => {
    if (!activeFault) return route.continue()
    const fault = activeFault
    activeFault = ''
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      },
      body: controlledStreamError(fault, `controlled-${Date.now().toString(36)}`)
    })
  })

  try {
    const response = await page.goto(`${options.baseUrl}/experience`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    if (!response?.ok()) throw new Error(`Frontend preflight returned HTTP ${response?.status() || 0}`)
    await page.locator('.input-area .input').waitFor({ state: 'visible', timeout: 30000 })

    const reviewCases = []
    for (let index = 0; index < driveItems.length; index += 1) {
      const item = driveItems[index]
      const before = await metrics(page)
      activeFault = item.controlledFault
      await page.locator('.input-area .input').fill(item.input)
      await page.locator('.input-area .send-btn').click()
      await page.waitForFunction(
        ({ key, count }) => {
          try {
            const current = JSON.parse(localStorage.getItem(key) || 'null')
            return Array.isArray(current?.events) && current.events.length > count
          } catch {
            return false
          }
        },
        { key: METRICS_KEY, count: before.events?.length || 0 },
        { timeout: options.timeout }
      )
      await page.waitForFunction(() => {
        const input = document.querySelector('.input-area .input')
        return input && !input.disabled
      }, null, { timeout: 10000 })

      const current = await metrics(page)
      const event = current.events.at(-1)
      let responseText = ''
      if (event?.outcome === 'success') {
        // respond/advance 是新消息；extend 续接到同一条 —— 统一读最后一条 assistant 正文。
        await page.waitForFunction(() => {
          const messages = document.querySelectorAll('.prose[data-role="assistant"]')
          const body = messages[messages.length - 1]?.querySelector('.prose__body')
          return Boolean(body?.textContent?.trim())
        }, null, { timeout: 10000 })
        responseText = await page.locator('.prose[data-role="assistant"] .prose__body').last().innerText()
      }
      reviewCases.push({
        runId: event?.runId || '',
        scenarioId: item.id,
        group: item.group,
        intent: item.intent,
        category: item.category,
        action: item.input,
        canonicalFacts: item.canonicalFacts,
        forbiddenFacts: item.forbiddenFacts,
        controlledFault: item.controlledFault,
        outcome: event?.outcome || 'missing',
        response: responseText
      })
      process.stderr.write(
        `[narrative-smoke] ${index + 1}/${driveItems.length} ${item.id} ${item.intent} ${event?.outcome || 'missing'}\n`
      )
    }

    const finalMetrics = await metrics(page)
    const annotations = Object.fromEntries(reviewCases.map((item) => [
      item.runId,
      {
        scenarioId: item.scenarioId,
        quality: {
          evidenceUsed: null,
          unsupportedFacts: null,
          baselineUnsupportedFacts: null,
          retried: null
        }
      }
    ]).filter(([runId]) => runId))
    const runSummary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baseUrl: options.baseUrl,
      matrix,
      completed: reviewCases.length,
      outcomes: reviewCases.reduce((totals, item) => {
        totals[item.outcome] = (totals[item.outcome] || 0) + 1
        return totals
      }, {}),
      protocol: 'agent-sse-v1',
      consoleErrors: [...new Set(consoleErrors)]
    }
    await Promise.all([
      writeFile(resolve(outputDir, 'metrics.json'), JSON.stringify(finalMetrics, null, 2)),
      writeFile(resolve(outputDir, 'review-cases.json'), JSON.stringify(reviewCases, null, 2)),
      writeFile(resolve(outputDir, 'annotations.json'), JSON.stringify(annotations, null, 2)),
      writeFile(resolve(outputDir, 'run.json'), JSON.stringify(runSummary, null, 2))
    ])
    process.stdout.write(`${JSON.stringify({ outputDir, ...runSummary }, null, 2)}\n`)
  } finally {
    await context.close()
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`Narrative production smoke failed: ${error.message}\n`)
  process.exitCode = 1
})
