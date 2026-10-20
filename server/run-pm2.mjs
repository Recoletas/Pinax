// Wrapper launcher for pm2.
// server/index.js's auto-start branch (isDirectRun) doesn't fire its listen()
// callback under pm2 on this host, and its no-host listen() binds IPv6-only
// which breaks nginx → 127.0.0.1. This wrapper imports the module and calls
// server.listen(port, '0.0.0.0', cb) explicitly to side-step both issues.
import('./index.js').then((m) => {
  const port = Number(process.env.PORT) || 3001
  if (m.server.listening) return
  m.server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`)
  })
  const shutdown = async (signal) => {
    console.warn(`[Server] received ${signal}, shutting down`)
    await m.stopServer()
    process.exit(0)
  }
  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  process.once('SIGINT', () => { void shutdown('SIGINT') })
}).catch((err) => {
  console.error('[pm2-launcher] failed to start Pinax server:', err)
  process.exit(1)
})