// A selected stage image stays a stage artifact. Displaying it never creates a
// direct-image take or changes its production lineage.
export function normalizeComicDisplaySelection(input) {
  if (!input?.assetId) return null
  const assetId = String(input.assetId).trim()
  if (!assetId) return null
  if (input.type === 'take') return { type: 'take', assetId }
  if (input.type === 'stage' && ['rough', 'line', 'flats', 'tones', 'render', 'effects'].includes(input.stage)) {
    return { type: 'stage', stage: input.stage, assetId }
  }
  return null
}

export function resolveComicPanelDisplay(panel = {}, page = {}) {
  const explicit = normalizeComicDisplaySelection(panel.displaySelection)
  if (explicit?.type === 'take' && panel.selectedTakeId === explicit.assetId && panel.imageTakeIds?.includes(explicit.assetId)) {
    return { ...explicit, id: explicit.assetId }
  }
  if (explicit?.type === 'stage' && panel.production?.[explicit.stage]?.selectedArtifactId === explicit.assetId && panel.production[explicit.stage].artifactIds?.includes(explicit.assetId)) {
    return { ...explicit, id: explicit.assetId, status: panel.production[explicit.stage].status }
  }
  const stages = page.colorMode === 'monochrome'
    ? ['effects', 'tones', 'line', 'rough']
    : ['effects', 'render', 'flats', 'line', 'rough']
  const final = panel.production?.effects
  if (final?.status === 'approved' && final.selectedArtifactId && final.artifactIds?.includes(final.selectedArtifactId)) {
    return { type: 'stage', stage: 'effects', assetId: final.selectedArtifactId, id: final.selectedArtifactId, status: final.status }
  }
  if (panel.selectedTakeId && panel.imageTakeIds?.includes(panel.selectedTakeId)) {
    return { type: 'take', assetId: panel.selectedTakeId, id: panel.selectedTakeId }
  }
  for (const stage of stages) {
    const state = panel.production?.[stage]
    const assetId = state?.selectedArtifactId
    if (assetId && state.artifactIds?.includes(assetId)) {
      return { type: 'stage', stage, assetId, id: assetId, status: state.status }
    }
  }
  return null
}

export function getComicPanelDisplayExportBlock(panel = {}, page = {}) {
  const selection = resolveComicPanelDisplay(panel, page)
  if (!selection) return '尚未选用画面'
  if (selection.type === 'take') return ''
  if (selection.status === 'stale') return '画面依赖已变化，请重新审阅制作阶段'
  if (selection.stage !== 'effects') return '当前显示的是中间阶段，请完成最终阶段或导出分镜草稿'
  if (selection.status !== 'approved' || panel.production?.effects?.pendingRequest) return '当前最终画面尚未确认'
  return ''
}

export function getComicPanelDisplayImage(panel = {}, page = {}) {
  const selection = resolveComicPanelDisplay(panel, page)
  if (!selection) return null
  const image = panel.displayImage?.id === selection.id
    ? panel.displayImage
    : panel.imageTakes?.find((take) => take.id === selection.id)
  return image?.data ? { ...image, ...selection } : null
}
