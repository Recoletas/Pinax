// 文本工作台 v3 Phase 12：selection-aware 中文引号输入合同。

export function buildChineseQuoteInsertion({ data = '', selectedText = '', previousText = '', nextText = '', from = 0, composing = false, inputType = '' } = {}) {
  if (composing || inputType === 'insertCompositionText') return null
  const selected = String(selectedText || '')
  const start = Number.isFinite(Number(from)) ? Number(from) : 0
  if ((data === '"' || data === '”') && !selected && String(nextText || '').startsWith('”')) {
    return Object.freeze({ text: '', caret: start + 1 })
  }
  if (data === '“' && !selected && String(previousText || '').endsWith('“')) {
    return Object.freeze({ text: '', caret: start })
  }
  if (selected.startsWith('“') && selected.endsWith('”')) {
    return Object.freeze({ text: selected, caret: start + selected.length })
  }
  if (data !== '"' && data !== '“') return null
  return Object.freeze({
    text: `“${selected}”`,
    caret: selected ? start + selected.length + 2 : start + 1
  })
}
