import { computed, ref } from 'vue'
import {
  addNarrativeAssetDurable,
  deleteNarrativeAssetDurable,
  deleteNarrativeAssetsDurable,
  getAssetKindLabel,
  listActiveNarrativeAssets,
  listNarrativeAssets,
  mergeNarrativeAssetsDurable,
  setNarrativeAssetsStatusDurable,
  updateNarrativeAssetDurable
} from '../services/narrativeAssets'
import { hydrateNarrativeImageAssets } from '../services/media/narrativeImageAssetBridge'
import {
  deleteAssetCanvasReferences,
  ensureAssetCanvasCard,
  ensureAssetCanvasCards,
  ensureAssetCanvasCardWithExtra,
  findAssetCanvasCard
} from '../services/relationCanvas'
import { generateProfessionalInfoForAsset } from '../services/professionalInfoGenerator'

/**
 * C1+C-R1 · Notes 素材目录 owner。
 *
 * 三个语义不得混用（O 二次验收 C-R1）：
 * - refreshCatalog()            只从持久层刷新列表/排序/图片投影；绝不触碰编辑器内容。
 * - selectChapter(id)           真正更换编辑对象：存在当前素材时先过保存门禁；失败返回
 *                               { ok:false } 且不改变选择/编辑内容/路由。同 id 普通
 *                               激活是保留草稿的 no-op，不重装编辑器。
 * - replaceEditorFromPersisted(id)  仅限首次初始化或作者明确要求装载结果（合并结果、
 *                               采用顾问结果、新建后打开）时显式重装编辑器。
 *
 * 正式写入一律走 narrativeAssets 的 Durable 结果型 API；持久化失败不产生
 * 假成功、不清理画布引用、不写 receipt。
 *
 * 注入：editor（useNotesAssetEditor 实例）、onAssetDeselected/onSelectionChanged、
 * navigate(location)、colorForKind(kind)。
 */

const ASSET_KIND_ORDER = [
  'storyboard-seed',
  'reference-image',
  'draft-prose',
  'event',
  'character-fact',
  'worldbook-draft',
  'inspiration'
]

function sortNoteAssets(assets) {
  return [...assets].sort((a, b) => {
    const rank = { accepted: 0, inbox: 1 }
    const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (diff !== 0) return diff
    return Number(b.createdAt || 0) - Number(a.createdAt || 0)
  })
}

export function useNotesAssetCatalog({
  editor,
  onAssetDeselected = () => {},
  onSelectionChanged = () => {},
  navigate = () => {},
  colorForKind = () => ''
} = {}) {
  const chapters = ref([])
  const selectedChapterId = ref(null)
  const checkedAssetIds = ref([])
  const collapsedAssetKinds = ref({})
  const canvasImportRevision = ref(0)
  const canvasTransferFeedback = ref('')

  let notesMediaLoadRevision = 0

  const selectedAsset = computed(() => chapters.value.find((asset) => asset.id === selectedChapterId.value) || null)

  const groupedChapters = computed(() => ASSET_KIND_ORDER
    .map((kind) => ({
      kind,
      label: getAssetKindLabel(kind),
      color: colorForKind(kind),
      items: chapters.value.filter((asset) => asset.kind === kind)
    }))
    .filter((group) => group.items.length > 0))

  const currentAssetIndex = computed(() => {
    if (!selectedChapterId.value) return -1
    return chapters.value.findIndex((asset) => asset.id === selectedChapterId.value)
  })
  const canGoPrev = computed(() => currentAssetIndex.value > 0)
  const canGoNext = computed(() => {
    const index = currentAssetIndex.value
    return index >= 0 && index < chapters.value.length - 1
  })

  const mediaGenerationSourceAssets = computed(() => {
    if (checkedAssetIds.value.length > 0) {
      const checked = new Set(checkedAssetIds.value)
      return chapters.value.filter((asset) => checked.has(asset.id))
    }
    return selectedAsset.value ? [selectedAsset.value] : []
  })
  const mediaGenerationProjectId = computed(() => {
    const projectIds = [...new Set(mediaGenerationSourceAssets.value.map((asset) => asset.projectId ?? null))]
    return projectIds.length === 1 ? projectIds[0] : null
  })
  const mediaGenerationSourceRefs = computed(() => mediaGenerationSourceAssets.value.map((asset) => ({
    refType: 'narrative-asset',
    refId: asset.id,
    projectId: asset.projectId ?? null,
    excerpt: asset.content
  })))

  function saveOrBlock(actionLabel) {
    const result = editor.saveCurrentChapter()
    if (result.ok) return true
    canvasTransferFeedback.value = `保存失败，已取消${actionLabel}：正文仍保留在编辑器，可重试保存或复制正文`
    return false
  }

  /** C-R1：只刷新目录投影（列表/排序/图片 hydrate）；编辑器内容保持不动。 */
  function refreshCatalog() {
    const revision = ++notesMediaLoadRevision
    chapters.value = sortNoteAssets(listActiveNarrativeAssets())
    void hydrateNarrativeImageAssets(chapters.value).then((hydrated) => {
      if (revision !== notesMediaLoadRevision) return
      const hydratedImages = new Map(hydrated.map((asset) => [asset.id, asset.image]))
      chapters.value = sortNoteAssets(chapters.value.map((asset) => (
        hydratedImages.get(asset.id)
          ? { ...asset, image: hydratedImages.get(asset.id) }
          : asset
      )))
    })
  }

  /** C-R1：显式重装编辑器（首次初始化/作者明确要求装载结果）。不允许当普通刷新用。 */
  function replaceEditorFromPersisted(chapterId) {
    onAssetDeselected()
    selectedChapterId.value = chapterId
    onSelectionChanged(chapterId)
    const chapter = chapterId ? chapters.value.find((asset) => asset.id === chapterId) : null
    if (chapter) {
      editor.loadAsset(chapter)
    } else {
      selectedChapterId.value = null
      editor.clearAsset()
    }
  }

  /** C-R1：更换编辑对象；同 id 是保留草稿的 no-op，跨 id 先过保存门禁。 */
  function selectChapter(chapterId) {
    if (selectedChapterId.value === chapterId) return { ok: true, noop: true }
    if (selectedChapterId.value && !saveOrBlock('切换素材')) return { ok: false }
    onAssetDeselected()
    selectedChapterId.value = chapterId
    onSelectionChanged(chapterId)
    const chapter = chapterId ? chapters.value.find((asset) => asset.id === chapterId) : null
    if (chapter) {
      editor.loadAsset(chapter)
    } else {
      editor.clearAsset()
    }
    return { ok: true }
  }

  function goPrevAsset() {
    const index = currentAssetIndex.value
    if (index > 0) selectChapter(chapters.value[index - 1].id)
  }
  function goNextAsset() {
    const index = currentAssetIndex.value
    if (index >= 0 && index < chapters.value.length - 1) selectChapter(chapters.value[index + 1].id)
  }

  // ---- 勾选集合 ----

  function toggleCheckedAsset(assetId) {
    checkedAssetIds.value = checkedAssetIds.value.includes(assetId)
      ? checkedAssetIds.value.filter((id) => id !== assetId)
      : [...checkedAssetIds.value, assetId]
  }

  function getCheckedAssets() {
    const checked = new Set(checkedAssetIds.value)
    return chapters.value.filter((asset) => checked.has(asset.id))
  }

  function clearCheckedAssets() {
    checkedAssetIds.value = []
  }

  // ---- 动作（全部走 Durable API；失败不产生副作用） ----

  function createAsset(input) {
    return addNarrativeAssetDurable(input)
  }

  function setSelectedAssetKind(kind) {
    if (!selectedAsset.value) return { ok: false, reason: 'no-selection' }
    if (!saveOrBlock('分类调整')) return { ok: false, reason: 'save-blocked' }
    const result = updateNarrativeAssetDurable(selectedAsset.value.id, { kind })
    if (!result.ok) {
      canvasTransferFeedback.value = `分类调整未保存（${result.reason === 'storage-write-failed' ? '存储写入失败' : result.reason}）`
      return result
    }
    refreshCatalog()
    return result
  }

  function setCheckedAssetsState(status) {
    const targets = getCheckedAssets()
    if (targets.length === 0) return { ok: true, changed: [] }
    if (!saveOrBlock('批量状态变更')) return { ok: false, reason: 'save-blocked' }
    const targetIds = targets.map((asset) => asset.id)
    const result = setNarrativeAssetsStatusDurable(targetIds, status)
    if (!result.ok) {
      canvasTransferFeedback.value = '批量状态未保存（存储写入失败），素材保持原状态'
      return result
    }
    clearCheckedAssets()

    const targetSet = new Set(targetIds)
    const selectedId = selectedChapterId.value
    const hidesFromActiveList = status === 'archived' || status === 'rejected'
    if (hidesFromActiveList && targetSet.has(selectedId)) {
      const nextId = chapters.value.find((asset) => !targetSet.has(asset.id))?.id || null
      refreshCatalog()
      selectChapter(nextId)
    } else {
      refreshCatalog()
    }
    return result
  }

  function isAssetOnCanvas(assetId) {
    canvasImportRevision.value
    return Boolean(findAssetCanvasCard(assetId))
  }

  function mergeCheckedAssets() {
    const targets = getCheckedAssets()
    if (targets.length < 2) return { ok: false, reason: 'not-enough' }

    if (!saveOrBlock('合并')) return { ok: false, reason: 'save-blocked' }
    const selectedId = selectedChapterId.value
    const targetId = targets.some((asset) => asset.id === selectedId) ? selectedId : targets[0].id
    const removableIds = targets.map((asset) => asset.id).filter((id) => id !== targetId)
    const canvasAttached = removableIds.filter((id) => isAssetOnCanvas(id))
    if (canvasAttached.length > 0) {
      const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
        ? false
        : window.confirm(`有 ${canvasAttached.length} 项素材已在画布中。继续合并会移除这些旧画布节点，是否继续？`)
      if (!confirmed) return { ok: false, reason: 'cancelled' }
    }

    const result = mergeNarrativeAssetsDurable(targets.map((asset) => asset.id), { targetId })
    if (!result.ok) {
      canvasTransferFeedback.value = `合并未保存（${result.reason === 'storage-write-failed' ? '存储写入失败' : result.reason}），素材保持原状`
      return result
    }

    canvasAttached.forEach((assetId) => deleteAssetCanvasReferences(assetId))
    clearCheckedAssets()
    canvasImportRevision.value += 1
    // 作者明确执行合并：装载合并结果（显式语义，非普通刷新）
    replaceEditorFromPersisted(result.asset.id)
    return result
  }

  function deleteChapter(chapterId) {
    const deletingCurrent = selectedChapterId.value === chapterId
    // 删除当前素材前必须保住草稿；删除其他素材时保护当前草稿后只刷目录，不重装编辑器
    if (!saveOrBlock(deletingCurrent ? '删除' : '删除其他素材')) return { ok: false, reason: 'save-blocked' }

    const asset = chapters.value.find((item) => item.id === chapterId)
    const ok = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm(`删除素材「${asset?.title || '无标题素材'}」？如果它已导入画布，对应节点、连线和时间轴引用也会移除。`)
    if (!ok) return { ok: false, reason: 'cancelled' }

    const result = deleteNarrativeAssetDurable(chapterId)
    if (!result.ok) {
      canvasTransferFeedback.value = `删除未执行（${result.reason === 'storage-write-failed' ? '存储写入失败' : result.reason}），画布引用保持不变`
      return result
    }
    deleteAssetCanvasReferences(chapterId)
    checkedAssetIds.value = checkedAssetIds.value.filter((id) => id !== chapterId)
    canvasImportRevision.value += 1
    refreshCatalog()
    if (deletingCurrent) {
      const nextId = chapters.value.find((item) => item.id !== chapterId)?.id || null
      selectChapter(nextId)
    }
    return result
  }

  function deleteCheckedAssets() {
    const targets = getCheckedAssets()
    if (targets.length === 0) return { ok: true, deletedIds: [] }

    if (!saveOrBlock('批量删除')) return { ok: false, reason: 'save-blocked' }
    const titles = targets
      .slice(0, 3)
      .map((asset) => `「${asset.title || '无标题素材'}」`)
      .join('、')
    const preview = titles ? `（${titles}${targets.length > 3 ? ' 等' : ''}）` : ''
    const ok = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm(`删除选中的 ${targets.length} 个素材${preview}？如果它们已导入画布，对应节点、连线和时间轴引用也会移除。`)
    if (!ok) return { ok: false, reason: 'cancelled' }

    const result = deleteNarrativeAssetsDurable(targets.map((asset) => asset.id))
    if (!result.ok) {
      canvasTransferFeedback.value = '批量删除未执行（存储写入失败），素材和画布引用保持不变'
      return result
    }
    const deletedIds = result.deletedIds

    const deletedSet = new Set(deletedIds)
    const nextId = deletedSet.has(selectedChapterId.value)
      ? chapters.value.find((asset) => !deletedSet.has(asset.id))?.id || null
      : selectedChapterId.value

    if (deletedIds.length > 0) {
      deletedIds.forEach((assetId) => deleteAssetCanvasReferences(assetId))
      canvasImportRevision.value += 1
    }
    clearCheckedAssets()
    refreshCatalog()
    selectChapter(nextId)

    return result
  }

  // ---- 画布交接 ----

  function openSelectedAssetInCanvas() {
    if (!selectedAsset.value) return { ok: false, reason: 'no-selection' }
    if (!saveOrBlock('导入画布')) return { ok: false, reason: 'save-blocked' }
    ensureAssetCanvasCard(selectedAsset.value)
    canvasImportRevision.value += 1
    navigate({ name: 'prose-essay', query: { assetId: selectedAsset.value.id } })
    return { ok: true }
  }

  function sendCheckedAssetsToCanvas() {
    const selected = getCheckedAssets()
    if (!selected.length) return { ok: false, reason: 'empty' }
    if (!saveOrBlock('批量导入画布')) return { ok: false, reason: 'save-blocked' }
    const result = ensureAssetCanvasCards(selected)
    canvasImportRevision.value += 1
    canvasTransferFeedback.value = `已送入画布 ${result.cards.length} 项，其中 ${result.existingAssetIds.length} 项已存在`
    const primary = selected.find((asset) => asset.id === selectedAsset.value?.id) || selected[0]
    clearCheckedAssets()
    navigate({ name: 'prose-essay', query: { assetId: primary.id } })
    return { ok: true }
  }

  /**
   * C3 · 专业信息生成 → 画布卡的完整来源身份链。
   * 结果始终归属发起素材；素材被删除则丢弃并提示；仅作者停留原素材时才导航。
   */
  async function generateAndImportToCanvas() {
    const asset = selectedAsset.value
    if (!asset) return { ok: false, reason: 'no-selection' }
    const sourceAssetId = asset.id
    if (!saveOrBlock('生成专业信息')) return { ok: false, reason: 'save-blocked' }

    canvasTransferFeedback.value = ''
    try {
      const result = await generateProfessionalInfoForAsset({
        asset,
        settings: null,
        assetKind: asset.kind
      })
      const extraFields = result.success ? result.extraFields : null
      if (!listNarrativeAssets({ status: null }).some((item) => item.id === sourceAssetId)) {
        canvasTransferFeedback.value = `「${asset.title || '无标题素材'}」已在生成期间删除，未送入画布`
        return { ok: false, reason: 'asset-deleted' }
      }
      ensureAssetCanvasCardWithExtra(asset, extraFields)
      if (selectedChapterId.value === sourceAssetId) {
        navigate({ name: 'prose-essay', query: { assetId: sourceAssetId } })
      } else {
        canvasTransferFeedback.value = `「${asset.title || '无标题素材'}」已生成并送入画布`
      }
    } catch (err) {
      console.error('生成专业信息失败:', err)
      if (listNarrativeAssets({ status: null }).some((item) => item.id === sourceAssetId)) {
        ensureAssetCanvasCardWithExtra(asset, null)
        if (selectedChapterId.value === sourceAssetId) {
          navigate({ name: 'prose-essay', query: { assetId: sourceAssetId } })
        } else {
          canvasTransferFeedback.value = `「${asset.title || '无标题素材'}」已送入画布（专业信息生成失败）`
        }
      }
    } finally {
      canvasImportRevision.value += 1
    }
    return { ok: true }
  }

  return {
    assetKindOrder: ASSET_KIND_ORDER,
    chapters,
    selectedChapterId,
    selectedAsset,
    checkedAssetIds,
    collapsedAssetKinds,
    groupedChapters,
    currentAssetIndex,
    canGoPrev,
    canGoNext,
    canvasImportRevision,
    canvasTransferFeedback,
    mediaGenerationSourceAssets,
    mediaGenerationProjectId,
    mediaGenerationSourceRefs,
    refreshCatalog,
    replaceEditorFromPersisted,
    selectChapter,
    saveOrBlock,
    goPrevAsset,
    goNextAsset,
    toggleCheckedAsset,
    getCheckedAssets,
    clearCheckedAssets,
    createAsset,
    setSelectedAssetKind,
    setCheckedAssetsState,
    mergeCheckedAssets,
    deleteChapter,
    deleteCheckedAssets,
    isAssetOnCanvas,
    openSelectedAssetInCanvas,
    sendCheckedAssetsToCanvas,
    generateAndImportToCanvas
  }
}
