import { chromium } from 'playwright'

export const FATAL_LEVELS = new Set([
  'FAIL',
  'HARNESS-ERROR',
  'HARNESS-TIMEOUT',
  'TIMEOUT',
  'PAGEERROR',
  'CONSOLE-ERROR',
  'HTTP-ERROR',
])

const CONSOLE_ERROR_ALLOWLIST = [
  {
    id: 'browser-resource-http-status',
    pattern: /Failed to load resource: the server responded with a status of (?:4\d\d|5\d\d)/i,
    reason: 'HTTP status is classified separately so passive non-critical requests do not fail a local journey.',
  },
  {
    id: 'browser-resource-network-failure',
    pattern: /Failed to load resource: net::ERR_[A-Z_]+/i,
    reason: 'Network failures are classified from requestfailed events so passive requests remain non-fatal.',
  },
]

const MAX_DIAGNOSTIC_EVENTS = 500
const EXPECTED_ABORT_ERROR = /(?:ERR_ABORTED|ABORT_ERR|\babort(?:ed)?\b|\bcancel(?:led|ed)\b)/i

function sanitizeText(value, maxLength = 600) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, maxLength)
}

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value))
    return `${url.origin}${url.pathname}`.slice(0, 300)
  } catch {
    return sanitizeText(value, 300).replace(/[?#].*$/, '')
  }
}

export function isFatalEntry(entry) {
  return FATAL_LEVELS.has(entry?.level)
}

export function createJourneyRunner({ report, artifactRun, viewport = { width: 1440, height: 900 }, timeoutMs = 240_000 }) {
  const activeBrowsers = new Set()
  let stopRequested = false
  let signalRecorded = false

  function attachCapture(page, bucket, journey, criticalRequestPatterns, expectedAbortPatterns) {
    let droppedEvents = 0
    const record = (event) => {
      if (bucket.length >= MAX_DIAGNOSTIC_EVENTS) {
        droppedEvents += 1
        return
      }
      bucket.push({ at: new Date().toISOString(), journey, ...event })
    }
    const matchesRequestPattern = (patterns, url, status = null, response = null) => patterns.some((pattern) => {
      if (pattern instanceof RegExp) {
        pattern.lastIndex = 0
        return pattern.test(url)
      }
      if (typeof pattern === 'function') return Boolean(pattern({ url, status, response }))
      return url.includes(String(pattern))
    })
    const requestIsCritical = (url, status = null, response = null) => (
      matchesRequestPattern(criticalRequestPatterns, url, status, response)
    )
    page.on('pageerror', (error) => record({ kind: 'pageerror', message: sanitizeText(error.message, 300) }))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = sanitizeText(message.text(), 300)
      const allowed = CONSOLE_ERROR_ALLOWLIST.find((rule) => rule.pattern.test(text))
      record({
        kind: 'console.error',
        message: text,
        allowed: Boolean(allowed),
        allowlistRule: allowed?.id || null,
        allowlistReason: allowed?.reason || null,
      })
    })
    page.on('response', (response) => {
      if (response.status() < 400) return
      const url = sanitizeUrl(response.url())
      const critical = requestIsCritical(url, response.status(), response)
      record({ kind: 'http', status: response.status(), url, critical })
    })
    page.on('requestfailed', (request) => {
      const url = sanitizeUrl(request.url())
      const errorText = sanitizeText(request.failure()?.errorText || 'request failed', 200)
      const expectedAbort = EXPECTED_ABORT_ERROR.test(errorText)
        && matchesRequestPattern(expectedAbortPatterns, url, null, request)
      record({
        kind: 'requestfailed',
        url,
        method: request.method(),
        errorText,
        critical: requestIsCritical(url),
        expectedAbort,
        allowlistReason: expectedAbort ? 'journey-explicit-expected-abort' : null,
      })
    })
    return {
      finalize() {
        if (!droppedEvents) return
        bucket.push({
          at: new Date().toISOString(),
          journey,
          kind: 'diagnostics.truncated',
          kept: MAX_DIAGNOSTIC_EVENTS,
          dropped: droppedEvents,
        })
      },
    }
  }

  async function run(journey, action, {
    disableAgent = false,
    acceptDialogs = false,
    journeyTimeoutMs = timeoutMs,
    criticalRequestPatterns = [],
    expectedAbortPatterns = [],
  } = {}) {
    if (stopRequested) return
    const startIndex = report.length
    const diagnostics = []
    let browser = null
    let context = null
    let page = null
    let timeoutId = null
    let timedOut = false
    let captureSession = null
    try {
      browser = await chromium.launch()
      activeBrowsers.add(browser)
      context = await browser.newContext({ viewport })
      if (disableAgent) {
        await context.addInitScript(() => {
          localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: false }))
        })
      }
      page = await context.newPage()
      if (acceptDialogs) page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
      captureSession = attachCapture(
        page,
        diagnostics,
        journey,
        criticalRequestPatterns,
        expectedAbortPatterns,
      )

      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true
          reject(new Error(`journey exceeded ${journeyTimeoutMs}ms`))
        }, journeyTimeoutMs)
      })
      await Promise.race([action(page), timeout])
    } catch (error) {
      if (timedOut) {
        report.push({ journey, level: 'HARNESS-TIMEOUT', what: `旅程 ${journeyTimeoutMs / 1000}s 未结束，关闭本进程拥有的浏览器` })
      } else if (!stopRequested) {
        report.push({ journey, level: 'HARNESS-ERROR', what: sanitizeText(error?.message || error, 240) })
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      captureSession?.finalize()
      if (diagnostics.length) report.push({ journey, level: 'DIAGNOSTICS', items: diagnostics })
      const pageErrors = diagnostics.filter((entry) => entry.kind === 'pageerror')
      if (pageErrors.length) report.push({ journey, level: 'PAGEERROR', items: pageErrors })
      const unexpectedConsoleErrors = diagnostics.filter((entry) => entry.kind === 'console.error' && !entry.allowed)
      if (unexpectedConsoleErrors.length) report.push({ journey, level: 'CONSOLE-ERROR', items: unexpectedConsoleErrors })
      const criticalHttpErrors = diagnostics.filter((entry) => (
        ['http', 'requestfailed'].includes(entry.kind)
        && entry.critical
        && !entry.expectedAbort
      ))
      if (criticalHttpErrors.length) report.push({ journey, level: 'HTTP-ERROR', items: criticalHttpErrors })
      const fatalEntries = report.slice(startIndex).filter(isFatalEntry)
      if (fatalEntries.length) {
        try {
          const artifact = await artifactRun.captureFailure({ page, journey, failures: fatalEntries, events: diagnostics })
          fatalEntries.forEach((entry) => { entry.artifact = artifact.directory })
        } catch (error) {
          report.push({ journey, level: 'HARNESS-ERROR', what: `失败证据写入失败: ${sanitizeText(error?.message || error, 180)}` })
        }
      }
      if (browser) {
        activeBrowsers.delete(browser)
        await browser.close().catch(() => {})
      }
    }
  }

  function requestStop(signal = 'SIGINT') {
    stopRequested = true
    if (!signalRecorded) {
      signalRecorded = true
      report.push({ journey: 'HARNESS', level: 'HARNESS-ERROR', what: `收到 ${signal}，仅关闭本进程拥有的浏览器` })
    }
    for (const browser of activeBrowsers) browser.close().catch(() => {})
  }

  async function closeOwnedBrowsers() {
    await Promise.allSettled([...activeBrowsers].map((browser) => browser.close()))
    activeBrowsers.clear()
  }

  return {
    run,
    requestStop,
    closeOwnedBrowsers,
    get stopRequested() { return stopRequested },
  }
}
