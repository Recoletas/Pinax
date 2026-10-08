// Optional local runtime. Since the P2 unification (2026-10-06) the pi-agent task plane
// lives in storyflow-kit (storyharness/src/pinax, canonical). This helper probes the
// loopback plane and, when the kit repo is available locally, spawns it with the
// Pinax-side config. Public browsers reach it only through the guarded /api/storyagent proxy.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { KIT_TASK_PLANE_ENDPOINT } from '../../shared/kitTaskPlane.js'

const HEALTH_TIMEOUT_MS = 2000
const SPAWN_WAIT_MS = 20000

function probeHealthz(endpoint, timeoutMs = HEALTH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(new URL('/healthz', endpoint), { signal: controller.signal })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => clearTimeout(timer))
}

export async function startStoryAgentRuntime(env = process.env) {
  if (env.PINAX_STORYAGENT_ENABLED === '0') return null
  const endpoint = env.PINAX_ADAPTER_ENDPOINT || KIT_TASK_PLANE_ENDPOINT
  const configPath = env.PINAX_ADAPTER_CONFIG
    || path.resolve(process.cwd(), 'adapters', 'pinax-adapter', '.external', 'pinax-adapter.json')
  const serveTs = env.PINAX_KIT_SERVE_TS
    || path.resolve(process.cwd(), '..', 'storyflow-kit', 'storyharness', 'src', 'pinax', 'serve.ts')
  // 镜像 kit src/pinax/config.ts 的启动前提（2026-10-08 去内置档后）：
  // 有显式 env key（MINIFLOW_AGENT_KEY / ZAI_API_KEY）或配置文件即可；kit 侧新增 key 源时这里需同步。
  if (!env.MINIFLOW_AGENT_KEY && !env.ZAI_API_KEY && !existsSync(configPath)) return null

  if (await probeHealthz(endpoint)) return { spawned: null, close() {}, closeAllConnections() {} }

  if (!existsSync(serveTs)) {
    console.warn(`[storyagent] Kit task plane not running and serve entry not found (${serveTs}); agent route falls back to the native chain.`)
    return null
  }
  const tsxCli = path.join(path.dirname(serveTs), '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!existsSync(tsxCli)) {
    console.warn('[storyagent] kit/storyharness tsx not found; start `npm run serve:pinax` in storyflow-kit manually.')
    return null
  }
  const child = spawn(process.execPath, [tsxCli, serveTs], {
    cwd: path.dirname(serveTs),
    env: { ...env, PINAX_ADAPTER_CONFIG: configPath },
    stdio: 'ignore',
  })
  child.on('error', (error) => console.warn(`[storyagent] Kit task plane spawn failed: ${error.message}`))
  child.on('exit', (code) => console.warn(`[storyagent] Kit task plane exited (code=${code}).`))
  const up = await (async () => {
    for (let waited = 0; waited < SPAWN_WAIT_MS; waited += 500) {
      if (child.exitCode !== null) return false
      if (await probeHealthz(endpoint, 800)) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  })()
  if (!up) {
    console.warn('[storyagent] Kit task plane did not become healthy in time; agent route falls back to the native chain.')
    try { child.kill() } catch { /* already gone */ }
    return null
  }
  console.warn(`[storyagent] Kit task plane spawned at ${endpoint} (config: ${configPath}).`)
  return {
    spawned: child,
    close() { try { child.kill() } catch { /* already gone */ } },
    closeAllConnections() {},
  }
}
