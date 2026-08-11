import { execFile } from 'node:child_process'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve, basename, dirname } from 'node:path'
import process from 'node:process'
import { normalizeNarrativeProductionRun, summarizeNarrativeProductionMetrics } from '../src/services/agents/narrativeProductionMetrics.js'

const execFileAsync = promisify(execFile)
const REQUIRED_CHANNELS = Object.freeze([
  { id: 'openai-chat', label: 'OpenAI Chat', files: ['openai-chat.json', 'openai.json'] },
  { id: 'openai-responses', label: 'OpenAI Responses', files: ['openai-responses.json'] },
  { id: 'anthropic-messages', label: 'Anthropic Messages', files: ['anthropic.json', 'anthropic-messages.json'] },
  { id: 'minimax-anthropic', label: 'MiniMax Anthropic-compatible', files: ['minimax.json', 'minimax-anthropic.json'] }
])

function usage() {
  return [
    'Usage: npm run smoke:narrative-matrix -- [options]',
    '',
    'Options:',
    '  --config-dir <dir>  Directory containing provider JSON configs',
    '  --base-url <url>    Running Pinax frontend (default http://127.0.0.1:5173)',
    '  --count <n>         Rounds per configured channel (default 60)',
    '  --output <dir>      Matrix artifact directory (default /tmp/pinax-narrative-matrix)',
    '  --allow-incomplete  Exit 0 while channels or review gates are incomplete',
    '  --dry-run           Show required channels without starting browsers',
    '  --help              Show this message'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    configDir: '',
    baseUrl: process.env.PINAX_BASE_URL || 'http://127.0.0.1:5173',
    count: 60,
    output: '/tmp/pinax-narrative-matrix',
    allowIncomplete: false,
    dryRun: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--allow-incomplete') options.allowIncomplete = true
    else if (token === '--dry-run') options.dryRun = true
    else if (['--config-dir', '--base-url', '--count', '--output'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
      const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      options[key] = value
      index += 1
    } else throw new Error(`Unknown argument: ${token}`)
  }
  options.baseUrl = String(options.baseUrl).replace(/\/+$/, '')
  options.count = Math.max(1, Math.min(120, Number(options.count) || 60))
  options.output = resolve(String(options.output))
  options.configDir = options.configDir ? resolve(String(options.configDir)) : ''
  return options
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveConfigs(configDir) {
  if (!configDir || !(await fileExists(configDir))) return new Map()
  const names = new Set(await readdir(configDir))
  const resolved = new Map()
  for (const channel of REQUIRED_CHANNELS) {
    const file = channel.files.find((name) => names.has(name))
    if (file) resolved.set(channel.id, resolve(configDir, file))
  }
  return resolved
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function summarizeGate(metrics, expectedRounds) {
  const events = (Array.isArray(metrics?.events) ? metrics.events : [])
    .map(normalizeNarrativeProductionRun)
  const summary = summarizeNarrativeProductionMetrics(events)
  const configuredSample = expectedRounds >= 60 && events.length >= expectedRounds
  const protocolSuccess = events.filter((event) => event.protocolOk === true).length
    / Math.max(1, events.filter((event) => typeof event.protocolOk === 'boolean').length)
  return {
    summary,
    sample: events.length,
    protocolSuccess: Number(protocolSuccess.toFixed(4)),
    reviewPending: summary.sample.qualityLabeled < events.length,
    releaseReady: summary.releaseReady && configuredSample && summary.sample.qualityLabeled >= events.length
  }
}

async function runChannel(channel, configPath, options, outputDir) {
  const channelDir = resolve(outputDir, channel.id)
  await mkdir(channelDir, { recursive: true })
  const args = [
    'scripts/narrative-production-smoke.mjs',
    '--config', configPath,
    '--base-url', options.baseUrl,
    '--count', String(options.count),
    '--output', channelDir
  ]
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: resolve(dirname(new URL(import.meta.url).pathname), '..'),
      maxBuffer: 8 * 1024 * 1024,
      env: process.env
    })
    const run = JSON.parse(result.stdout.trim())
    const metricsPath = resolve(run.outputDir, 'metrics.json')
    const metrics = await readJson(metricsPath)
    return {
      id: channel.id,
      label: channel.label,
      status: 'executed',
      configFile: basename(configPath),
      outputDir: run.outputDir,
      gate: summarizeGate(metrics, options.count)
    }
  } catch (error) {
    return {
      id: channel.id,
      label: channel.label,
      status: 'error',
      configFile: basename(configPath),
      error: String(error?.stderr || error?.message || 'provider smoke failed').slice(0, 300)
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return process.stdout.write(`${usage()}\n`)
  const configs = await resolveConfigs(options.configDir)
  if (options.dryRun) {
    return process.stdout.write(`${JSON.stringify({
      dryRun: true,
      roundsPerChannel: options.count,
      requiredChannels: REQUIRED_CHANNELS.map((channel) => ({
        id: channel.id,
        label: channel.label,
        configured: configs.has(channel.id)
      }))
    }, null, 2)}\n`)
  }
  const outputDir = resolve(options.output, new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(outputDir, { recursive: true })
  const channels = []
  for (const channel of REQUIRED_CHANNELS) {
    const configPath = configs.get(channel.id)
    channels.push(configPath
      ? await runChannel(channel, configPath, options, outputDir)
      : { id: channel.id, label: channel.label, status: 'not-configured' })
  }
  const releaseReady = channels.length === REQUIRED_CHANNELS.length
    && channels.every((channel) => channel.status === 'executed' && channel.gate?.releaseReady)
  const report = {
    schemaVersion: 1,
    protocol: 'agent-sse-v1',
    generatedAt: new Date().toISOString(),
    roundsPerChannel: options.count,
    channels,
    releaseReady,
    reviewRequired: channels.some((channel) => channel.gate?.reviewPending),
    outputDir
  }
  await writeFile(resolve(outputDir, 'matrix.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!releaseReady && !options.allowIncomplete) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`Narrative provider matrix failed: ${error.message}\n`)
  process.exitCode = 1
})
