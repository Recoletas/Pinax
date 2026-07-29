const REFUSAL_PATTERNS = Object.freeze([
  /(?:未提供|没有提供|缺少|未收到).{0,16}(?:当前)?(?:选区|段落|原文|文本|内容)/u,
  /(?:请|需要|麻烦).{0,20}(?:提供|粘贴|输入|补充).{0,20}(?:选区|段落|原文|文本|内容)/u,
  /无法.{0,12}(?:进行|完成).{0,12}(?:修正|改写|扩写|压缩|衔接|续写)/u
])

export function validateWritingReplacement(value) {
  const text = String(value || '').trim()
  if (!text) return { valid: false, reason: 'empty-replacement' }
  if (REFUSAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return { valid: false, reason: 'model-refused-context' }
  }
  return { valid: true, text }
}
