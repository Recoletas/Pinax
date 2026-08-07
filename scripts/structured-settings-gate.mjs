import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { runStructuredGeneration } from '../server/services/structuredGenerationRunner.js'
import { resolveStructuredProtocol } from '../server/services/providers/structuredOutputAdapter.js'

const FIELD_RUNS = 10
const SECTION_RUNS = 5
const WORLD_FIELDS = ['origin', 'powerSystem', 'geography', 'history', 'factions', 'rules']

function usage() {
  return [
    'Usage: npm run smoke:structured-settings -- [options]',
    '',
    'Options:',
    '  --config <file>       Provider JSON; repeat for multiple channels',
    '  --field-runs <n>      Single-field rounds, 1-20 (default 10)',
    '  --section-runs <n>    Full-section rounds, 1-10 (default 5)',
    '  --timeout <ms>        Per request timeout (default 45000)',
    '  --output <file>       Redacted JSON report (default /tmp/pinax-structured-settings-gate/report.json)',
    '  --allow-incomplete    Exit 0 when a real gate is incomplete',
    '  --dry-run             Run deterministic fixtures for three protocols without network access',
    '  --help                Show this message',
    '',
    'Provider JSON accepts {"provider": "...", "baseUrl": "...", "apiKey": "...", "model": "...", "format": "..."}',
    'or {"providers": [{...}, {...}]}.'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    configs: [],
    fieldRuns: FIELD_RUNS,
    sectionRuns: SECTION_RUNS,
    timeout: 45000,
    output: '/tmp/pinax-structured-settings-gate/report.json',
    allowIncomplete: false,
    dryRun: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--dry-run') options.dryRun = true
    else if (token === '--allow-incomplete') options.allowIncomplete = true
    else if (['--config', '--field-runs', '--section-runs', '--timeout', '--output'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
      if (token === '--config') options.configs.push(value)
      else if (token === '--field-runs') options.fieldRuns = value
      else if (token === '--section-runs') options.sectionRuns = value
      else if (token === '--timeout') options.timeout = value
      else options.output = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }
  options.fieldRuns = Math.max(1, Math.min(20, Number(options.fieldRuns) || FIELD_RUNS))
  options.sectionRuns = Math.max(1, Math.min(10, Number(options.sectionRuns) || SECTION_RUNS))
  options.timeout = Math.max(5000, Math.min(120000, Number(options.timeout) || 45000))
  options.output = resolve(String(options.output))
  return options
}

function providerFromConfig(value) {
  const config = value?.provider && typeof value.provider === 'object' ? value.provider : value
  for (const key of ['provider', 'baseUrl', 'apiKey', 'model']) {
    if (!String(config?.[key] || '').trim()) throw new Error(`Provider config is missing ${key}`)
  }
  return {
    id: String(config.provider).trim(),
    baseUrl: String(config.baseUrl).trim(),
    apiKey: String(config.apiKey).trim(),
    model: String(config.model).trim(),
    format: String(config.format || '').trim()
  }
}

async function readConfigs(paths) {
  const providers = []
  for (const path of paths) {
    let parsed
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      throw new Error(`Cannot read provider config ${path}: ${error.message}`)
    }
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.providers)
        ? parsed.providers
        : [parsed?.provider && typeof parsed.provider === 'object' ? parsed.provider : parsed]
    providers.push(...entries.map(providerFromConfig))
  }
  return providers
}

function dryRunProviders() {
  return [
    { id: 'minimax', baseUrl: 'https://dry-run.example/anthropic', apiKey: 'dry-run-key', model: 'MiniMax-M3', format: 'anthropic' },
    { id: 'openai-compatible', baseUrl: 'https://dry-run.example/v1', apiKey: 'dry-run-key', model: 'structured-test', format: 'openai' },
    { id: 'anthropic-compatible', baseUrl: 'https://dry-run.example/v1', apiKey: 'dry-run-key', model: 'structured-test', format: 'anthropic' }
  ]
}

function fieldKeysFromBody(body) {
  const schema = body?.response_format?.json_schema?.schema
    || body?.text?.format?.schema
    || body?.output_config?.format?.schema
    || body?.tools?.[0]?.function?.parameters
    || body?.tools?.[0]?.parameters
    || body?.tools?.[0]?.input_schema
  return Object.keys(schema?.properties || {}).filter(Boolean)
}

function payloadFor(body) {
  const keys = fieldKeysFromBody(body)
  const safeKeys = keys.length ? keys : ['origin']
  return {
    drafts: Object.fromEntries(safeKeys.map((key) => [key, `Gate fixture: ${key} 已返回可审阅设定。`]))
  }
}

function dryRunResponse(protocol, body) {
  const payload = payloadFor(body)
  if (body?.tools && body?.tool_choice) {
    if (protocol === 'anthropic') {
      return {
        content: [{ type: 'tool_use', id: 'gate-call', name: 'submit_setting_draft', input: payload }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 30, output_tokens: 20 }
      }
    }
    if (protocol === 'openai-responses') {
      return {
        output: [{ type: 'function_call', name: 'submit_setting_draft', arguments: JSON.stringify(payload) }],
        status: 'completed',
        usage: { input_tokens: 30, output_tokens: 20 }
      }
    }
    return {
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ id: 'gate-call', function: { name: 'submit_setting_draft', arguments: JSON.stringify(payload) } }] }
      }],
      usage: { prompt_tokens: 30, completion_tokens: 20 }
    }
  }
  if (protocol === 'anthropic') {
    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 20 }
    }
  }
  if (protocol === 'openai-responses') {
    return { output_text: JSON.stringify(payload), status: 'completed', usage: { input_tokens: 30, output_tokens: 20 } }
  }
  return {
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 30, completion_tokens: 20 }
  }
}

function createDryRunFetch(provider) {
  const protocol = resolveStructuredProtocol(provider)
  return async (url, options) => ({
    ok: true,
    status: 200,
    json: async () => dryRunResponse(protocol, JSON.parse(options.body))
  })
}

function buildRequest(provider, kind, index) {
  const field = kind === 'field' ? ['origin'] : WORLD_FIELDS
  return {
    schemaVersion: 1,
    schemaId: kind === 'field' ? 'setting-field.v1' : 'setting-section.v1',
    requestId: `structured_gate_${kind}_${index}_${Date.now().toString(36)}`,
    provider,
    target: {
      worldbookId: 'gate-fixture-worldbook',
      worldbookRevision: 'gate-fixture-revision',
      sectionKey: 'world',
      fieldKeys: field
    },
    context: {
      globalConstraints: 'Gate fixture：世界由潮汐塑造，航路依赖旧灯塔。',
      confirmedSettings: 'Gate fixture：旧灯塔停摆后，港城改用人工巡灯。',
      currentValues: '',
      relatedEntries: '',
      sourceExcerpts: '',
      userBrief: '只返回可直接审阅的具体设定，不输出解释或思考。'
    },
    options: { maxTokens: kind === 'field' ? 240 : 900, temperature: 0.1, timeoutMs: 45000 }
  }
}

function percentile(values, ratio) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

function summarizeRuns(runs) {
  const successful = runs.filter((run) => run.ok)
  const firstRound = successful.filter((run) => run.attemptCount === 1)
  const modes = Object.fromEntries([...new Set(runs.map((run) => run.mode).filter(Boolean))].map((mode) => [
    mode,
    runs.filter((run) => run.mode === mode).length
  ]))
  const errors = Object.fromEntries([...new Set(runs.map((run) => run.code).filter(Boolean))].map((code) => [
    code,
    runs.filter((run) => run.code === code).length
  ]))
  const calls = runs.map((run) => run.attemptCount).filter(Number.isFinite)
  const firstRoundRate = runs.length ? Number((firstRound.length / runs.length).toFixed(3)) : 0
  const pass = successful.length === runs.length
    && Math.max(0, ...calls) <= 2
    && firstRoundRate >= (Object.keys(modes).length === 1 && modes['json-object'] ? 0.9 : 0.95)
  return {
    requested: runs.length,
    successful: successful.length,
    firstRoundSuccessful: firstRound.length,
    firstRoundRate,
    maxAttempts: calls.length ? Math.max(...calls) : 0,
    averageAttempts: calls.length ? Number((calls.reduce((sum, value) => sum + value, 0) / calls.length).toFixed(2)) : 0,
    latencyMs: {
      p50: percentile(runs.map((run) => run.latencyMs).filter(Number.isFinite), 0.5),
      p95: percentile(runs.map((run) => run.latencyMs).filter(Number.isFinite), 0.95)
    },
    modes,
    errors,
    pass
  }
}

async function runOne(provider, kind, index, options) {
  const startedAt = Date.now()
  try {
    const result = await runStructuredGeneration(buildRequest(provider, kind, index), {
      fetchImpl: options.dryRun ? createDryRunFetch(provider) : undefined,
      timeoutMs: options.timeout
    })
    return {
      ok: true,
      mode: result.mode,
      protocol: result.meta?.protocol || resolveStructuredProtocol(provider),
      attemptCount: Number(result.meta?.attemptCount || 1),
      latencyMs: Date.now() - startedAt,
      inputTokens: Number(result.meta?.inputTokens || 0),
      outputTokens: Number(result.meta?.outputTokens || 0),
      cachedInputTokens: Number(result.meta?.cachedInputTokens || 0)
    }
  } catch (error) {
    return {
      ok: false,
      mode: '',
      protocol: resolveStructuredProtocol(provider),
      attemptCount: 1,
      latencyMs: Date.now() - startedAt,
      code: String(error?.code || 'STRUCTURED_GATE_FAILED'),
      retryable: Boolean(error?.retryable)
    }
  }
}

async function runProvider(provider, options) {
  const fieldRuns = []
  const sectionRuns = []
  for (let index = 0; index < options.fieldRuns; index += 1) {
    fieldRuns.push(await runOne(provider, 'field', index, options))
  }
  for (let index = 0; index < options.sectionRuns; index += 1) {
    sectionRuns.push(await runOne(provider, 'section', index, options))
  }
  const field = summarizeRuns(fieldRuns)
  const section = summarizeRuns(sectionRuns)
  return {
    provider: provider.id,
    model: provider.model,
    protocol: resolveStructuredProtocol(provider),
    field,
    section,
    releaseReady: field.pass && section.pass,
    privacy: {
      apiKeyIncluded: false,
      promptsIncluded: false,
      draftsIncluded: false,
      reportContainsOnlyAggregates: true
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  const providers = options.dryRun
    ? dryRunProviders()
    : await readConfigs(options.configs)
  if (!providers.length) throw new Error('--config is required unless --dry-run is used')

  const reports = []
  for (const provider of providers) reports.push(await runProvider(provider, options))
  const fixtureReady = reports.every((report) => report.releaseReady)
  const output = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    sample: { fieldRuns: options.fieldRuns, sectionRuns: options.sectionRuns },
    providers: reports,
    fixtureReady: options.dryRun ? fixtureReady : undefined,
    releaseReady: !options.dryRun && reports.length >= 3 && fixtureReady
  }
  await mkdir(resolve(options.output, '..'), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ ...output, output: options.output }, null, 2)}\n`)
  if (!output.releaseReady && !options.allowIncomplete && !options.dryRun) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`structured-settings-gate: ${error.message}\n`)
  process.exitCode = 1
})
