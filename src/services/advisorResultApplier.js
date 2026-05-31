function normalizeRange(range) {
  if (!range || typeof range !== 'object') return null
  const start = Number(range.start)
  const end = Number(range.end)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }

  return {
    start: Math.max(0, Math.floor(Math.min(start, end))),
    end: Math.max(0, Math.floor(Math.max(start, end)))
  }
}

export function applyAdvisorReplacement(content, result) {
  const text = String(content || '')
  const replacement = String(result?.replacement || '')
  const range = normalizeRange(result?.targetRange)

  if (!result || result.mode !== 'replace') {
    return {
      ok: false,
      reason: 'not-replace',
      message: '该建议不是替换类型。'
    }
  }

  if (!range || range.end > text.length) {
    return {
      ok: false,
      reason: 'invalid-range',
      message: '目标范围已不可用，无法应用。'
    }
  }

  if (!replacement) {
    return {
      ok: false,
      reason: 'empty-replacement',
      message: '替换文本为空，无法应用。'
    }
  }

  const currentTargetText = text.slice(range.start, range.end)
  if (typeof result.baseText === 'string' && result.baseText && currentTargetText !== result.baseText) {
    return {
      ok: false,
      reason: 'stale-base-text',
      message: '原文已变化，请重新生成建议。'
    }
  }

  const nextContent = text.slice(0, range.start) + replacement + text.slice(range.end)

  return {
    ok: true,
    content: nextContent,
    cursorPos: range.start + replacement.length,
    range,
    replacement
  }
}
