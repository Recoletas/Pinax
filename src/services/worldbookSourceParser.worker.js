import { parseSourceFiles } from './worldbookSourceAdapters'

self.addEventListener('message', async (event) => {
  const requestId = event.data?.requestId
  try {
    const results = await parseSourceFiles(event.data?.files || [], event.data?.options || {})
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
