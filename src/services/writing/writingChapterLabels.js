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
