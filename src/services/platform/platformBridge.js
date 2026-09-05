const browserBridge = Object.freeze({ platform: 'browser' })

export function resolvePlatformBridge(scope = globalThis) {
  const desktop = scope?.pinaxDesktop
  return desktop?.platform === 'desktop' && desktop?.project ? desktop : browserBridge
}
