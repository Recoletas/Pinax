import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../../utils/sanitize'
import { buildNarrativeAssetContentHash } from '../media/narrativeAssets'

/**
 * Notes 素材正文的纯格式转换（C2 抽取，无 Vue/DOM 依赖，可单测）。
 * marked 的 gfm/breaks 选项是模块级全局设置——此前在页面每次 setup 时重复设置，
 * 现集中在此，选项不变。
 */
marked.setOptions({
  gfm: true,
  breaks: true
})

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

export function markdownToHtml(md) {
  if (!md) return ''
  return sanitizeHtml(marked.parse(md))
}

export function htmlToMarkdown(html) {
  if (!html) return ''
  return turndownService.turndown(html).replace(/\n{3,}/g, '\n\n')
}

export function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text)
}

export function markdownToPlainText(md) {
  if (!md) return ''
  if (typeof document === 'undefined') return md
  const div = document.createElement('div')
  div.innerHTML = markdownToHtml(md)
  return div.innerText || ''
}

/**
 * 解析 markdown 中的图片描述符（稳定 key：媒体引用用 media:id，数据 URL 用内容哈希；
 * 同一引用多次出现追加出现序号）。嵌套遍历 marked token。
 */
export function markdownImageDescriptors(markdown) {
  const descriptors = []
  const occurrences = new Map()
  const visit = (tokens = []) => {
    tokens.forEach((token) => {
      if (token?.type === 'image') {
        const href = String(token.href || '')
        const mediaId = href.match(/^pinax-media:\/\/([a-zA-Z0-9_-]+)/)?.[1]
        const baseKey = mediaId
          ? `media:${mediaId}`
          : `src:${buildNarrativeAssetContentHash(href)}`
        const occurrence = occurrences.get(baseKey) || 0
        occurrences.set(baseKey, occurrence + 1)
        descriptors.push({
          key: occurrence === 0 ? baseKey : `${baseKey}:${occurrence}`,
          href,
          alt: String(token.text || '')
        })
      }
      if (Array.isArray(token?.tokens)) visit(token.tokens)
      if (Array.isArray(token?.items)) token.items.forEach((item) => visit(item.tokens || []))
    })
  }
  try {
    visit(marked.lexer(String(markdown || '')))
  } catch {
    return []
  }
  return descriptors
}
