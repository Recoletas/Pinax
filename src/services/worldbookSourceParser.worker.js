import { parseSourceFiles } from './worldbookSourceAdapters'

self.addEventListener('message', async (event) => {
  const requestId = event.data?.requestId
  try {
    const files = Array.from(event.data?.files || [])
    const options = event.data?.options || {}
    const results = []
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
          error: result.error || null
        }
      })
    }
    self.postMessage({ requestId, results })
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
