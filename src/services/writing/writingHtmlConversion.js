import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../../utils/sanitize.js'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  br: '  '
})
turndownService.addRule('underline', {
  filter: ['u'],
  replacement(content) {
    return `<u>${content}</u>`
  }
})
marked.setOptions({
  gfm: true,
  breaks: true
})
export function markdownToHtml(md) {
  if (!md) return ''
  return sanitizeHtml(marked.parse(md))
}
export function htmlToMarkdown(html) {
  if (!html) return ''
  return turndownService.turndown(html).replace(/\n{3,}/g, '\n\n')
}
export function markdownToPlainText(md) {
  if (!md) return ''
  if (typeof document === 'undefined') return md
  const div = document.createElement('div')
  div.innerHTML = markdownToHtml(md)
  return div.innerText || ''
}
