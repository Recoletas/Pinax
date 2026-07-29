export function buildWritingProfessionalActions({ hasSelection = false, hasParagraph = false } = {}) {
  return [
    action('改写选区', '请修正我选中的内容，尽量保持原意和人物语气，不要扩写太多。', 'selection', 'writing.fix.selection', !hasSelection),
    action('扩写选区', '请扩写我选中的内容，补足动作、感官或必要细节，保持人物语气与前后文一致，完整返回替换文本。', 'selection', 'writing.fix.selection', !hasSelection),
    action('压缩选区', '请压缩我选中的内容，删除重复解释和弱信息，保留关键动作、事实与人物语气，完整返回替换文本。', 'selection', 'writing.fix.selection', !hasSelection),
    action('修正当前段落', '请修正当前段落，重点处理语病、重复、节奏和衔接。', 'paragraph', 'writing.fix.paragraph', !hasParagraph),
    action('补强段落衔接', '请重写当前段落，使它与前后文的动作、视角和时间推进自然衔接，完整返回替换段落。', 'paragraph', 'writing.fix.paragraph', !hasParagraph),
    action('自动收线', '请帮我收束当前线索，给出更自然的收线建议，优先考虑当前段落和上下文。', 'thread', 'writing.close.thread'),
    action('章节体检', '请对当前章节做一次简洁体检，指出节奏、人物和结构的主要问题。', 'chapter', 'writing.chapter.health'),
    action('轻续一句', '请给出一句轻量续写建议，保持当前语气，尽量可直接接在光标后。', 'continue', 'writing.continue.light')
  ]
}

export function normalizeWritingProfessionalAction(input) {
  if (typeof input === 'string') {
    return action(input, input, 'chapter', '')
  }
  if (!input || typeof input !== 'object') {
    return action('', '', 'chapter', '')
  }
  return action(
    input.label || input.question,
    input.question || input.label,
    input.scope || 'chapter',
    input.taskType,
    input.disabled
  )
}

export function buildWritingProfessionalTarget(actionInput, context = {}) {
  const scope = actionInput?.scope || 'chapter'
  if (scope === 'selection') {
    return {
      kind: 'selection',
      range: { start: context.selection?.start, end: context.selection?.end },
      text: context.selection?.text || ''
    }
  }
  if (scope === 'paragraph') {
    return {
      kind: 'paragraph',
      range: { start: context.paragraph?.start, end: context.paragraph?.end },
      text: context.paragraph?.text || ''
    }
  }
  if (scope === 'thread' || scope === 'continue') {
    const cursor = Number(context.selection?.start)
    return {
      kind: scope === 'thread' ? 'thread-window' : 'cursor-window',
      ...(scope === 'continue' && Number.isFinite(cursor)
        ? { range: { start: cursor, end: cursor }, text: '' }
        : {}),
      paragraph: context.paragraph?.text || '',
      before: context.contextWindow?.before || '',
      after: context.contextWindow?.after || ''
    }
  }
  return {
    kind: 'chapter',
    title: context.chapterTitle || '',
    wordCount: Number(context.wordCount) || 0,
    paragraph: context.paragraph?.text || '',
    selectedText: context.selection?.text || '',
    outline: context.chapterOutline || ''
  }
}

export function buildSuggestionDomainAction(type, suggestion, metadata = {}) {
  const content = String(
    typeof suggestion === 'string'
      ? suggestion
      : suggestion?.content || suggestion?.label || ''
  ).trim()
  if (!content) return null
  const sequence = Number(metadata.index) + 1
  const title = String(metadata.title || `顾问建议 ${Number.isFinite(sequence) ? sequence : ''}`).trim()
  if (type === 'outline-item') {
    return {
      type,
      item: {
        title,
        content,
        source: {
          type: 'agent-result',
          resultId: metadata.resultId || null,
          chapterId: metadata.chapterId || null
        }
      }
    }
  }
  if (type === 'create-asset') {
    return {
      type,
      asset: {
        kind: 'inspiration',
        title,
        content,
        status: 'inbox',
        projectId: metadata.projectId || null,
        source: {
          type: 'chapter',
          id: metadata.chapterId || null,
          chapterId: metadata.chapterId || null
        }
      }
    }
  }
  return null
}

function action(label, question, scope, taskType, disabled = false) {
  return {
    label: String(label || '').trim(),
    question: String(question || '').trim(),
    scope: String(scope || 'chapter').trim() || 'chapter',
    taskType: String(taskType || '').trim(),
    disabled: Boolean(disabled)
  }
}
