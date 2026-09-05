function text(value) { return String(value ?? '').trim() }

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

// F1-6：只解释已经发生的编辑器结果与正式 adoption receipt。正文中出现
// “离开、死亡、毁坏”等词不构成世界变化，绝不能从 prose 猜测反馈。
export function createAdoptionImpactProjection({ editorResult = null, receipt = null } = {}) {
  const editorUnitIds = unique(editorResult?.unitIds?.length
    ? editorResult.unitIds
    : [editorResult?.unitId])
  const receiptUnitIds = unique(receipt?.insertedUnitIds?.length
    ? receipt.insertedUnitIds
    : [receipt?.insertedUnitId])
  const unitIds = receiptUnitIds.length ? receiptUnitIds : editorUnitIds
  const rewrite = receipt?.operation === 'rewrite-unit'
  const insertedUnitCount = rewrite ? 0 : unitIds.length
  const effects = receipt?.sceneIntentEffects || {}
  const sceneChanges = []
  if (receipt?.sceneChanged) {
    const characterCount = unique(effects.characterIds).length
    if (characterCount) sceneChanges.push(`当前场加入 ${characterCount} 人`)
    if (text(effects.locationId)) sceneChanges.push('当前地点已更新')
    if (!sceneChanges.length) sceneChanges.push('当前场已更新')
  }
  const outlineChanges = receipt?.outlineChanged ? ['大纲已更新'] : []
  return freeze({
    kind: 'adoption-impact-projection',
    version: 1,
    unitIds,
    insertedUnitCount,
    affectedUnitCount: unitIds.length,
    sceneChanges,
    outlineChanges,
    worldChanges: [],
    headline: rewrite
      ? '已替换当前写作单元'
      : `${receipt?.documentRole === 'exploration' ? '已纳入探索稿' : '已纳入正文'} · 新增 ${unitIds.length} 个写作单元`,
    details: [...sceneChanges, ...outlineChanges]
  })
}
