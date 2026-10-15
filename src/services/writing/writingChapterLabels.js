// Display only: never writes chapter titles.
export function chineseChapterNumber(value) {
  const number = Math.max(1, Number(value) || 1)
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (number < 10) return digits[number]
  if (number === 10) return '十'
  if (number < 20) return `十${digits[number % 10]}`
  if (number < 100) return `${digits[Math.floor(number / 10)]}十${digits[number % 10]}`
  return String(number)
}

// 章行只拥有一个序号来源。作者若把“第一章”也写进标题，先去掉标题里的
// 序号再按目录位置呈现，避免“第一章 第一章 上元夜”；空标题就朴素显示“第一章”。
export function writingChapterRowLabel(index, title, locale = 'zh-CN') {
  const { ordinal, name } = writingChapterRowParts(index, title, locale)
  return name ? `${ordinal} ${name}` : ordinal
}
// 章行模板用分体式：序号与章名各占一个 span，间隔由排版控制，
// 不依赖半角空格（不同字重/字体下空格宽度不稳定）。
export function writingChapterRowParts(index, title, locale = 'zh-CN') {
  if (/^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b|prologue$|epilogue$)/i.test(String(title || '').trim())) return { ordinal: '', name: String(title).trim() }
  const ordinal = locale === 'en' ? `Chapter ${index + 1}` : `第${chineseChapterNumber(index + 1)}章`
  const name = String(title || '')
    .trim()
    .replace(/^第\s*(?:[零〇一二三四五六七八九十百千万两]+|\d+)\s*章(?:\s*[-—:：·、.]?\s*)?/u, '')
    .trim()
  return { ordinal, name }
}
