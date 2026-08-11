function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function trustedItem(item) {
  return item?.eligibleEvidence === true
    || (item?.trust && item.trust !== 'draft' && item.conflictState === 'clean')
}

export function validateNarrativeEvidence({
  finalText = '',
  kernel = null,
  toolResults = []
} = {}) {
  const content = text(finalText)
  const kernelRefs = (kernel?.blocks || []).flatMap((block) => block?.sourceRefs || [])
  const allItems = (Array.isArray(toolResults) ? toolResults : [])
    .flatMap((result) => (Array.isArray(result?.items) ? result.items : []))
  const usableItems = allItems.filter(trustedItem)
  const conflictedMentions = allItems
    .filter((item) => !trustedItem(item) && [item?.title, ...(item?.aliases || [])].some((term) => {
      const normalized = text(term)
      return normalized.length >= 2 && content.includes(normalized)
    }))
    .map((item) => text(item.title || item.id))
  const referencedItems = usableItems
    .filter((item) => [item?.title, ...(item?.aliases || [])].some((term) => {
      const normalized = text(term)
      return normalized.length >= 2 && content.includes(normalized)
    }))
    .map((item) => ({
      id: text(item.id),
      title: text(item.title),
      sourceRefs: unique(item.sourceRefs || []),
      trust: text(item.trust),
      conflictState: text(item.conflictState) || 'clean'
    }))
  const sourceRefs = unique([
    ...kernelRefs,
    ...usableItems.flatMap((item) => item.sourceRefs || [])
  ])
  const warnings = []
  if (conflictedMentions.length > 0) {
    warnings.push({
      code: 'NARRATIVE_EVIDENCE_CONFLICT',
      message: `正文提及了冲突或过期资料：${unique(conflictedMentions).join('、')}`,
      items: unique(conflictedMentions)
    })
  }
  if (content && sourceRefs.length === 0) {
    warnings.push({
      code: 'NARRATIVE_EVIDENCE_UNSOURCED',
      message: '本轮正文没有可关联的 Kernel 或工具 sourceRef'
    })
  }
  return {
    status: warnings.some((warning) => warning.code === 'NARRATIVE_EVIDENCE_CONFLICT')
      ? 'review'
      : sourceRefs.length > 0 ? 'covered' : 'uncovered',
    sourceRefs,
    referencedItems,
    warnings,
    trustedItemCount: usableItems.length,
    totalItemCount: allItems.length
  }
}

export default { validateNarrativeEvidence }
