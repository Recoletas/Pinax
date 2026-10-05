// Optional local runtime. Adapter dependencies are installed in adapters/pinax-adapter.
// Public browsers reach it only through the guarded /api/storyagent proxy.
export async function startStoryAgentRuntime(env = process.env) {
  if (env.PINAX_STORYAGENT_ENABLED === '0') return null
  if (!env.MINIMAX_API_KEY && !env.MINIFLOW_AGENT_KEY && !env.ZAI_API_KEY && !env.PINAX_ADAPTER_CONFIG) return null
  try {
    const { startServer } = await import('../../adapters/pinax-adapter/src/server.ts')
    const server = startServer({ host: '127.0.0.1' })
    server.on('error', () => console.warn('[storyagent] Runtime unavailable; check loopback port and adapter installation.'))
    return server
  } catch {
    console.warn('[storyagent] Runtime not started; install adapter dependencies with Node 22 before enabling writing tools.')
    return null
  }
}
