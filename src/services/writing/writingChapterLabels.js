// Display only: never writes chapter titles.
export function chapterTitleOrdinal(title) {
  const match = String(title || '').match(/^第\s*([零〇一二三四五六七八九十百千万两\d]+)\s*[章节回]/u)
  if (!match) return null
  if (/^\d+$/.test(match[1])) return Number(match[1])
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0, section = 0, digit = 0
  for (const char of match[1]) {
    if (char in digits) digit = digits[char]
    else if (char === '万') { total += (section + digit) * units[char]; section = 0; digit = 0 }
    else { section += (digit || 1) * units[char]; digit = 0 }
  }
  return total + section + digit
}

export function chineseChapterNumber(value) {
  const number = Math.max(1, Number(value) || 1)
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (number < 10) return digits[number]
  if (number === 10) return '十'
  if (number < 20) return `十${digits[number % 10]}`
  if (number < 100) return `${digits[Math.floor(number / 10)]}十${digits[number % 10]}`
  return String(number)
}

// 作者写入的章号属于标题，不按目录位置替换，也不剥掉标题前缀。
export function writingChapterRowLabel(index, title, locale = 'zh-CN') {
  const { ordinal, name } = writingChapterRowParts(index, title, locale)
  return [ordinal, name].filter(Boolean).join(' ')
}
export function writingChapterRowParts(index, title, locale = 'zh-CN') {
  const name = String(title || '').trim()
  if (/^(?:第\s*[零〇一二三四五六七八九十百千万两0-9０-９]+\s*章|chapter\s+(?:\d+|[ivxlcdm]+)\b|prologue$|epilogue$)/iu.test(name)) return { ordinal: '', name }
  const ordinal = locale === 'en' ? `Chapter ${index + 1}` : `第${chineseChapterNumber(index + 1)}章`
  return { ordinal, name }
}
