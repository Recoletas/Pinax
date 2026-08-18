import { parseSourceFiles } from './worldbookSourceAdapters'

let requestSequence = 0

function parseWorkerError(error) {
  const next = new Error(error?.message || '文件解析失败。')
  next.code = error?.code || 'parse-failed'
  return next
}

function createAbortError() {
  const error = new Error('文件读取已停止。')
  error.name = 'AbortError'
  error.code = 'cancelled'
  return error
}

/**
 * 文件解析的页面边界。浏览器支持 Worker 时，PDF/DOCX 不占用页面主线程；
 * 测试环境或不支持 Worker 的旧 WebView 使用同一 adapter 的同步降级路径。
 */
export async function parseSourceFilesWithWorker(files = [], options = {}) {
  if (options.signal?.aborted) throw createAbortError()
  if (typeof Worker === 'undefined') return parseSourceFiles(files, options)

  const requestId = `source-parse-${++requestSequence}`
  let worker
  try {
    worker = new Worker(new URL('./worldbookSourceParser.worker.js', import.meta.url), { type: 'module' })
  } catch {
    return parseSourceFiles(files, options)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener?.('abort', onAbort)
      worker?.terminate()
    }
    const onAbort = () => {
      finish()
      reject(createAbortError())
    }
    if (options.signal) {
      if (options.signal.aborted) return onAbort()
      options.signal.addEventListener('abort', onAbort, { once: true })
    }
    worker.onmessage = (event) => {
      if (event.data?.requestId !== requestId) return
      if (event.data.progress) {
        options.onProgress?.(event.data.progress)
        return
      }
      finish()
      if (event.data.error) reject(parseWorkerError(event.data.error))
      else {
        options.onMetrics?.(event.data.metrics || null)
        resolve(Array.isArray(event.data.results) ? event.data.results : [])
      }
    }
    worker.onerror = (event) => {
      finish()
      reject(parseWorkerError({ message: event?.message || '文件解析 Worker 失败。' }))
    }
    const workerOptions = { ...options }
    delete workerOptions.signal
    delete workerOptions.onProgress
    delete workerOptions.onMetrics
    worker.postMessage({ requestId, files: Array.from(files || []), options: workerOptions })
  })
}
