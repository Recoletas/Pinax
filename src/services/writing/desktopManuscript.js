import { getChapterMarkdown } from './writingDocumentSchema.js'

export function desktopManuscript(input) {
  const bridge = globalThis.pinaxDesktop?.project
  if (!bridge?.manuscript) return null
  const result = bridge.manuscript(input)
  if (!result?.ok) throw Object.assign(new Error(result?.error?.message || '无法访问本地章节文件'), { code: result?.error?.code })
  return result.value
}

export function manuscriptText(chapter) {
  return getChapterMarkdown(chapter).replace(/\r\n?/g, '\n')
}
