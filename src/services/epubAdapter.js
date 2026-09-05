/**
 * EPUB 解析适配器：ZIP + container.xml → OPF manifest/spine → 按 spine 阅读顺序
 * 提取章节文本与元数据（不按文件名排序——CloudLiu1008 prepare_sources.py 的
 * extract_epub 正是按文件名排序，中文 EPUB 常因此打乱章节顺序）。
 *
 * 依赖 JSZip（mammoth 的既有依赖，动态加载避免主包体积变化）。
 */

function text(value) {
  return String(value ?? '').trim()
}

async function loadJsZip() {
  const module = await import('jszip')
  return module.default || module
}

function stripMarkup(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
}

export function normalizeSourceTextFromHtml(html) {
  return stripMarkup(html)
    .replace(/\r\n?/g, '\n')
    .split(String.fromCharCode(0)).join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function firstTagContent(xml, tagName) {
  const match = xml.match(new RegExp(`<(?:[a-z0-9]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tagName}>`, 'i'))
  return match ? text(match[1]) : ''
}

function parseXmlElements(xml, tagName) {
  const elements = []
  const pattern = new RegExp(`<(?:[a-z0-9]+:)?${tagName}((?:\\s[^<>]*?)?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[a-z0-9]+:)?${tagName}>)`, 'gi')
  let match = pattern.exec(xml)
  while (match) {
    elements.push({ attributes: match[1] || '', content: match[2] || '' })
    match = pattern.exec(xml)
  }
  return elements
}

function attributeValue(attributes, name) {
  const direct = attributes.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))
    || attributes.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'))
  return direct ? text(direct[1]) : ''
}

function resolveOpfPath(opfFilePath, href) {
  if (/^[a-z]+:/i.test(href)) return null // 绝对 URL / 外部协议
  // opfFilePath 是 OPF 的完整文件路径，弹出文件名后剩余部分是基准目录。
  const baseParts = String(opfFilePath || '').split('/').filter(Boolean)
  baseParts.pop()
  const hrefClean = href.split('#')[0]
  const segments = hrefClean.split('/').filter(Boolean)
  const stack = [...baseParts]
  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') stack.pop()
    else stack.push(segment)
  }
  return stack.join('/')
}

function extractFirstHeading(html) {
  const match = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
  if (!match) return ''
  return normalizeSourceTextFromHtml(match[1]).slice(0, 80)
}

/**
 * 解析 EPUB 字节流。
 *
 * 返回：
 * {
 *   parts: [{ text, locator: { type: 'epub-spine', index } }],
 *   spineTitles: string[],          // 与 parts 对齐的章节标题线索
 *   metadata: { title, author, language, identifier } | null,
 *   warnings: []
 * }
 *
 * OPF 缺失/损坏时退化为文件名排序并在 warnings 中明确说明。
 */
export async function extractEpub(data, signal) {
  const warnings = []
  const JSZip = await loadJsZip()
  const zip = await JSZip.loadAsync(data).catch((error) => {
    if (error?.name === 'AbortError') throw error
    throw new Error('EPUB 无法解析，文件可能已损坏。')
  })
  if (signal?.aborted) {
    const abortError = new Error('EPUB 读取已停止。')
    abortError.name = 'AbortError'
    throw abortError
  }

  const containerXml = await zip.file('META-INF/container.xml')?.async('string').catch(() => null)
  const opfPath = containerXml ? attributeValue(containerXml, 'full-path') : ''
  const opfXml = opfPath ? await zip.file(opfPath)?.async('string').catch(() => null) : null

  // OPF 缺失/损坏：退化为文件名排序（明确警告，不静默）。
  if (!opfXml) {
    warnings.push(opfPath ? `OPF 文件损坏或缺失（${opfPath}），已按文件名顺序退化解析。` : '缺少 META-INF/container.xml 或 OPF 指向，已按文件名顺序退化解析。')
    const names = Object.keys(zip.files)
      .filter((name) => /\.(xhtml|html|htm)$/i.test(name))
      .sort()
    const parts = []
    for (const [index, name] of names.entries()) {
      const html = await zip.file(name).async('string')
      const partText = normalizeSourceTextFromHtml(html)
      if (!partText) continue
      parts.push({ text: partText, locator: { type: 'epub-spine', index } })
    }
    return { parts, spineTitles: [], metadata: null, warnings }
  }

  const manifest = parseXmlElements(opfXml, 'item').map((element) => ({
    id: attributeValue(element.attributes, 'id'),
    href: attributeValue(element.attributes, 'href'),
    mediaType: attributeValue(element.attributes, 'media-type'),
    properties: attributeValue(element.attributes, 'properties')
  }))
  const itemsById = new Map(manifest.map((item) => [item.id, item]))
  const spineRefs = parseXmlElements(opfXml, 'itemref')
    .map((element) => attributeValue(element.attributes, 'idref'))
    .filter(Boolean)

  const opfBase = opfPath
  const documentPaths = []
  for (const idref of spineRefs) {
    const item = itemsById.get(idref)
    if (!item || !/x?html/i.test(item.mediaType)) continue
    const path = resolveOpfPath(opfBase, item.href)
    if (path && zip.file(path)) documentPaths.push(path)
  }

  const metadataRaw = opfXml.match(/<metadata[\s\S]*?<\/metadata>/i)?.[0] || ''
  const metadata = {
    title: firstTagContent(metadataRaw, 'title'),
    author: firstTagContent(metadataRaw, 'creator'),
    language: firstTagContent(metadataRaw, 'language'),
    identifier: firstTagContent(metadataRaw, 'identifier')
  }

  const parts = []
  const spineTitles = []
  for (const [index, path] of documentPaths.entries()) {
    const html = await zip.file(path).async('string')
    const heading = extractFirstHeading(html)
    const partText = normalizeSourceTextFromHtml(html)
    if (!partText) continue
    parts.push({ text: partText, locator: { type: 'epub-spine', index } })
    spineTitles.push(heading || path.split('/').pop().replace(/\.[^.]+$/, ''))
  }
  if (!parts.length) warnings.push('OPF spine 中没有可提取的 HTML 文档。')
  return { parts, spineTitles, metadata, warnings }
}
