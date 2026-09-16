import { computed } from 'vue'
import {
  addNarrativeAssetDurable,
  deleteNarrativeAssetDurable,
  listNarrativeAssets,
  updateNarrativeAssetDurable
} from '../services/media/narrativeAssets'
import {
  buildMaterialsAgentContext,
  createContentRevision
} from '../services/agents/creativeGraphAgentContext'
import { prepareMaterialAgentTransaction } from '../services/agents/creativeGraphAgentActions'

/**
 * C6 · 素材顾问结果的采用/撤销 owner（第二条异步来源身份链）。
 *
 * 两条链的来源身份合同（迁移自页面，行为不变，守卫显式化）：
 *
 * 1. text-patch（精简单素材）
 *    ask 时先保存当前素材并冻结 baseText + revision；apply 时以「目标素材当前内容」
 *    复核 baseText——目标若是正在编辑的素材，读编辑真源 markdownContent，否则读已存内容。
 *    不一致 → stale，绝不覆盖。写回走 updateNarrativeAsset（唯一正式写入边界），
 *    receipt 记 before/after；undo 前再核对 receipt.after 是否仍等于当前内容。
 *
 * 2. material-* 域动作（分类/拆分/关联，可多素材、可新建）
 *    apply 前用 createContentRevision 复核整个选择集 revision；事务由
 *    prepareMaterialAgentTransaction 预检，执行失败按 before 快照回滚并删除新建；
 *    receipt 记 before/after/created 三段快照；undo 校验三段均未被再次编辑。
 *
 * 取消语义：任何一次 apply/undo 只操作自己 result/receipt 捕获的素材 id 集合，
 * 不触碰 selectedChapter 之外的当前编辑状态。
 *
 * 注入：catalog（useNotesAssetCatalog 实例）、editor（useNotesAssetEditor 实例）、
 * advisor（{ updateAdvisorResultStatus, askAdvisor }，来自页面 useAdvisor）。
 */
export function useNotesMaterialAdvisor({ catalog, editor, advisor }) {
  function materialState(asset) {
    if (!asset) return null
    return {
      id: asset.id,
      title: asset.title,
      content: asset.content,
      kind: asset.kind,
      status: asset.status,
      projectId: asset.projectId ?? null,
      source: asset.source || null,
      sourceRefs: Array.isArray(asset.sourceRefs) ? asset.sourceRefs : []
    }
  }

  function materialStatesEqual(left, right) {
    return JSON.stringify(materialState(left)) === JSON.stringify(materialState(right))
  }

  const materialAdvisorSelection = computed(() => {
    const checked = new Set(catalog.checkedAssetIds.value)
    const selected = catalog.chapters.value
      .filter((asset) => checked.has(asset.id))
      .map((asset) => asset.id === catalog.selectedAsset.value?.id
        ? {
            ...asset,
            title: editor.currentChapterTitle.value,
            content: editor.markdownContent.value
          }
        : asset)
    if (selected.length) return selected
    if (!catalog.selectedAsset.value) return []
    return [{
      ...catalog.selectedAsset.value,
      title: editor.currentChapterTitle.value,
      content: editor.markdownContent.value
    }]
  })

  const materialAdvisorActions = computed(() => [
    {
      label: '精简当前素材',
      question: '精简当前素材，保留可复用事实、人物动机和关键细节。',
      scope: 'materials',
      taskType: 'materials.refine',
      disabled: !catalog.selectedAsset.value
    },
    {
      label: '分类建议',
      question: '判断所选素材最合适的分类，并说明理由。',
      scope: 'materials',
      taskType: 'materials.classify',
      disabled: materialAdvisorSelection.value.length === 0
    },
    {
      label: '拆分建议',
      question: '判断当前素材是否需要拆分，并给出清晰的拆分边界。',
      scope: 'materials',
      taskType: 'materials.split',
      disabled: !catalog.selectedAsset.value
    },
    {
      label: '关联发现',
      question: '分析所选素材之间有依据的关系。',
      scope: 'materials',
      taskType: 'materials.relate',
      disabled: materialAdvisorSelection.value.length < 2
    }
  ])

  async function handleAskAdvisor(input) {
    const action = typeof input === 'string'
      ? { label: input, question: input, scope: 'materials', taskType: 'materials.classify' }
      : input
    if (!action || action.disabled) return
    // P0：保存失败时不发起顾问请求——ask 冻结的 baseText 必须是已持久化内容
    if (!catalog.saveOrBlock('顾问请求')) return
    const selection = materialAdvisorSelection.value
    const primary = action.taskType === 'materials.refine' || action.taskType === 'materials.split'
      ? selection.find((asset) => asset.id === catalog.selectedAsset.value?.id) || catalog.selectedAsset.value
      : null
    const built = buildMaterialsAgentContext({
      selectedAsset: primary,
      selectedAssets: primary ? [primary] : selection
    })
    if (!built.assets.length) return

    const target = primary
      ? {
          kind: 'asset',
          id: primary.id,
          text: String(primary.content || ''),
          range: { start: 0, end: String(primary.content || '').length },
          revision: createContentRevision(primary.content || '')
        }
      : {
          kind: 'asset-selection',
          id: built.assets.map((asset) => asset.id).join(','),
          text: JSON.stringify(built.assets),
          revision: built.revision
        }

    await advisor.askAdvisor({ ...action, scope: 'materials', target, mode: 'notes' }, () => built.context)
  }

  function applyMaterialAdvisorResult(result) {
    const action = result?.actions?.find((item) => item?.type === 'text-patch')
    const materialActions = (result?.actions || []).filter((item) => String(item?.type || '').startsWith('material-'))
    if (materialActions.length) {
      applyMaterialDomainResult(result, materialActions)
      return
    }
    const assetId = result?.target?.id
    const asset = catalog.chapters.value.find((item) => item.id === assetId)
    if (!action || !asset) {
      advisor.updateAdvisorResultStatus(result?.id, 'failed', '目标素材不存在或结果不可应用')
      return
    }

    // 目标是正在编辑的素材时，当前内容以编辑真源为准（含未保存输入）
    const currentContent = asset.id === catalog.selectedAsset.value?.id
      ? String(editor.markdownContent.value || '')
      : String(asset.content || '')
    if (currentContent !== String(action.baseText || '')) {
      advisor.updateAdvisorResultStatus(result.id, 'stale', '素材内容已变化，请重新生成')
      return
    }

    const nextContent = String(action.content || '')
    const applied = updateNarrativeAssetDurable(assetId, { content: nextContent })
    if (!applied.ok) {
      // 持久化失败：不标 applied、不写 receipt、不刷新编辑器伪装成功
      advisor.updateAdvisorResultStatus(result.id, 'failed', `采用未持久化（${applied.reason === 'storage-write-failed' ? '存储写入失败' : applied.reason}）`)
      return
    }
    result.applyReceipt = {
      type: 'material-refine',
      assetId,
      before: currentContent,
      after: nextContent
    }
    advisor.updateAdvisorResultStatus(result.id, 'applied')
    catalog.refreshCatalog()
    if (assetId === catalog.selectedChapterId.value) {
      // 结果修改了当前素材：显式装载已采用结果（作者点击“采用”即明确要求）
      catalog.replaceEditorFromPersisted(assetId)
    }
  }

  function undoMaterialAdvisorResult(result) {
    const receipt = result?.applyReceipt
    if (receipt?.type === 'material-agent-transaction') {
      undoMaterialDomainResult(result, receipt)
      return
    }
    if (!receipt || receipt.type !== 'material-refine') return
    const asset = catalog.chapters.value.find((item) => item.id === receipt.assetId)
    const currentContent = asset?.id === catalog.selectedAsset.value?.id
      ? String(editor.markdownContent.value || '')
      : String(asset?.content || '')
    if (!asset || currentContent !== receipt.after) {
      result.statusDetail = '素材内容已再次变化，无法自动撤销'
      return
    }

    const undone = updateNarrativeAssetDurable(receipt.assetId, { content: receipt.before })
    if (!undone.ok) {
      result.statusDetail = `撤销未持久化（${undone.reason === 'storage-write-failed' ? '存储写入失败' : undone.reason}），可重试`
      return
    }
    result.applyReceipt = null
    advisor.updateAdvisorResultStatus(result.id, 'completed')
    catalog.refreshCatalog()
    if (receipt.assetId === catalog.selectedChapterId.value) {
      catalog.replaceEditorFromPersisted(receipt.assetId)
    }
  }

  // C-R2：修订复核纳入编辑真源——当前选中素材用编辑器内容（含未落盘草稿）参与 revision，
  // 否则“结果生成后、采用前”的新输入不会被 stale 拦截。
  function currentMaterialTargetRevision(target) {
    const allAssets = listNarrativeAssets({ status: null })
    const selectedId = catalog.selectedAsset.value?.id
    const overlayDraft = (asset) => (
      asset && asset.id === selectedId
        ? { ...asset, title: editor.currentChapterTitle.value, content: String(editor.markdownContent.value || '') }
        : asset
    )
    if (target?.kind === 'asset') {
      const asset = allAssets.find((item) => item.id === target.id)
      return createContentRevision(overlayDraft(asset)?.content || '')
    }
    const ids = String(target?.id || '').split(',').filter(Boolean)
    const byId = new Map(allAssets.map((asset) => [asset.id, asset]))
    const selected = ids.map((id) => byId.get(id)).filter(Boolean).map(overlayDraft)
    return buildMaterialsAgentContext({ selectedAssets: selected }).revision
  }

  function restoreMaterialSnapshots(snapshots) {
    for (const snapshot of snapshots || []) {
      const restored = updateNarrativeAssetDurable(snapshot.id, {
        title: snapshot.title,
        content: snapshot.content,
        kind: snapshot.kind,
        status: snapshot.status,
        projectId: snapshot.projectId,
        source: snapshot.source,
        sourceRefs: snapshot.sourceRefs
      })
      if (!restored.ok) return { ok: false }
    }
    return { ok: true }
  }

  function applyMaterialDomainResult(result, actions) {
    if (currentMaterialTargetRevision(result?.target) !== result?.target?.revision) {
      advisor.updateAdvisorResultStatus(result?.id, 'stale', '素材选择或内容已变化，请重新生成')
      return
    }

    const allAssets = listNarrativeAssets({ status: null })
    const allById = new Map(allAssets.map((asset) => [asset.id, asset]))
    const allowedIds = result.target?.kind === 'asset'
      ? [result.target.id]
      : String(result.target?.id || '').split(',').filter(Boolean)
    const allowedAssets = allowedIds.map((id) => allById.get(id)).filter(Boolean)
    const transaction = prepareMaterialAgentTransaction(actions, allowedAssets, { resultId: result.id })
    if (!transaction.ok) {
      advisor.updateAdvisorResultStatus(result.id, 'failed', `无法应用素材动作：${transaction.reason}`)
      return
    }

    const created = []
    try {
      for (const operation of transaction.operations) {
        if (operation.type === 'update') {
          const applied = updateNarrativeAssetDurable(operation.assetId, operation.patch)
          if (!applied.ok) {
            throw new Error(applied.reason === 'storage-write-failed' ? '存储写入失败' : `素材不存在：${operation.assetId}`)
          }
        } else if (operation.type === 'create') {
          const added = addNarrativeAssetDurable(operation.asset)
          if (!added.ok) {
            throw new Error(added.reason === 'storage-write-failed' ? '存储写入失败' : '新建素材失败')
          }
          created.push(added.asset)
        }
      }
    } catch (error) {
      const rollbackErrors = []
      created.forEach((asset) => {
        const removed = deleteNarrativeAssetDurable(asset.id)
        if (!removed.ok) rollbackErrors.push(asset.id)
      })
      const restored = restoreMaterialSnapshots(transaction.receipt.before)
      const detail = error.message || '素材事务执行失败'
      const suffix = (rollbackErrors.length > 0 || !restored.ok) ? '；且回滚未完整持久化，请检查存储' : '；已回滚'
      advisor.updateAdvisorResultStatus(result.id, 'failed', `${detail}${suffix}`)
      return
    }

    const afterAssets = listNarrativeAssets({ status: null })
    const touchedIds = new Set(transaction.receipt.before.map((asset) => asset.id))
    result.applyReceipt = {
      ...transaction.receipt,
      after: afterAssets.filter((asset) => touchedIds.has(asset.id)).map(materialState),
      created: created.map(materialState)
    }
    advisor.updateAdvisorResultStatus(result.id, 'applied')
    catalog.clearCheckedAssets()
    catalog.refreshCatalog()
    // 只在结果确实修改当前素材时显式装载已采用结果；修改其他素材只刷新目录
    if (touchedIds.has(catalog.selectedChapterId.value)) {
      catalog.replaceEditorFromPersisted(catalog.selectedChapterId.value)
    }
  }

  function undoMaterialDomainResult(result, receipt) {
    const current = listNarrativeAssets({ status: null })
    const currentById = new Map(current.map((asset) => [asset.id, asset]))
    const touchedUnchanged = (receipt.after || []).every((snapshot) =>
      materialStatesEqual(currentById.get(snapshot.id), snapshot)
    )
    const createdUnchanged = (receipt.created || []).every((snapshot) =>
      materialStatesEqual(currentById.get(snapshot.id), snapshot)
    )
    if (!touchedUnchanged || !createdUnchanged) {
      result.statusDetail = '相关素材已再次变化，无法自动撤销'
      return
    }

    const undoErrors = []
    for (const snapshot of receipt.created || []) {
      const removed = deleteNarrativeAssetDurable(snapshot.id)
      if (!removed.ok) undoErrors.push(snapshot.id)
    }
    const restored = restoreMaterialSnapshots(receipt.before)
    if (undoErrors.length > 0 || !restored.ok) {
      // 撤销未持久化：保留 receipt 以便重试，不改状态为 completed
      result.statusDetail = '撤销未完整持久化（存储写入失败），可重试'
      return
    }
    result.applyReceipt = null
    advisor.updateAdvisorResultStatus(result.id, 'completed')
    catalog.refreshCatalog()
    const affectedCurrent = (receipt.created || []).some((snapshot) => snapshot.id === catalog.selectedChapterId.value)
      || (receipt.before || []).some((snapshot) => snapshot.id === catalog.selectedChapterId.value)
    if (affectedCurrent) {
      catalog.replaceEditorFromPersisted(catalog.selectedChapterId.value)
    }
  }

  return {
    materialAdvisorSelection,
    materialAdvisorActions,
    handleAskAdvisor,
    applyMaterialAdvisorResult,
    undoMaterialAdvisorResult
  }
}
