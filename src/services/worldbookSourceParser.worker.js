import { parseSourceFiles } from './worldbookSourceAdapters'

self.addEventListener('message', async (event) => {
  const requestId = event.data?.requestId
  try {
    const files = Array.from(event.data?.files || [])
    const options = event.data?.options || {}
    const results = []
    const batchStartedAt = Date.now()
    for (let index = 0; index < files.length; index += 1) {
      const [result] = await parseSourceFiles([files[index]], options)
      results.push(result)
      self.postMessage({
        requestId,
        progress: {
          index,
          total: files.length,
          fileName: result.fileName,
          status: result.status,
          error: result.error || null,
          durationMs: result.parseMetrics?.durationMs || 0,
          slow: Boolean(result.parseMetrics?.slow)
        }
      })
    }
    const slowFileIndexes = results
      .map((result, index) => result.parseMetrics?.slow ? index : -1)
      .filter((index) => index >= 0)
    self.postMessage({
      requestId,
      results,
      metrics: {
        durationMs: Math.max(0, Date.now() - batchStartedAt),
        fileCount: results.length,
        maxFileDurationMs: Math.max(0, ...results.map((result) => Number(result.parseMetrics?.durationMs) || 0)),
        slowFileCount: slowFileIndexes.length,
        slowFileIndexes
      }
    })
  } catch (error) {
    self.postMessage({
      requestId,
      error: {
        code: String(error?.code || 'parse-failed'),
        message: String(error?.message || '文件解析失败。')
      }
    })
  }
})
