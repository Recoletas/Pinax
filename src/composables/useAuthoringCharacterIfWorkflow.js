import { computed, reactive, ref, shallowRef } from 'vue'
import { useCharacterIfExperiment } from './useCharacterIfExperiment.js'
import {
  createAuthoringSceneLaboratoryRun,
  selectAuthoringSceneLaboratoryDirection,
  validateAuthoringSceneLaboratoryRun
} from '../services/agents/authoring/authoringSceneLaboratoryRun.js'
import { planAuthoringSceneDirections } from '../services/agents/authoring/authoringSceneDirectionPlanner.js'
import { normalizeAuthoringFailure } from '../services/agents/authoring/authoringExecutionResult.js'

// Owns the complete session-only Character IF workflow. The page supplies the
// manuscript Ghost surface, but does not coordinate branch identity, planning,
// cancellation, validation, or per-branch draft retention.
export function useAuthoringCharacterIfWorkflow({
  projectId,
  sceneLaboratory,
  draft,
  isAuthoringTaskBusy,
  isAdoptionBusy,
  getSettings,
  collectLiveDependencies,
  getComposerSourceRefs,
  generateDraft,
  closeOverlay
}) {
  const experiment = useCharacterIfExperiment({ projectId })
  const active = computed(() => experiment.isActive.value)
  const branches = computed(() => experiment.branches.value)
  const activeBranch = computed(() => experiment.activeBranch.value)
  const branchDrafts = shallowRef({ A: null, B: null })
  const busy = ref(false)
  const baselineRun = shallowRef(null)
  const settings = shallowRef(null)
  const plans = reactive({ A: null, B: null })
  let planningController = null
  let requestVersion = 0

  function invalidateRequests() {
    requestVersion += 1
    planningController?.abort()
    planningController = null
  }

  function reset() {
    invalidateRequests()
    experiment.stop()
    baselineRun.value = null
    settings.value = null
    plans.A = null
    plans.B = null
    branchDrafts.value = { A: null, B: null }
    busy.value = false
  }

  async function planBranch(branchId) {
    const owner = experiment.active.value
    if (!owner || !['A', 'B'].includes(branchId) || plans[branchId]?.status === 'planning') return false
    const branch = owner.branches[branchId]
    const baseline = baselineRun.value
    if (!baseline || branch.lifecycle === 'stale') return false
    plans[branchId] = { status: 'planning', run: null }
    const runner = createAuthoringSceneLaboratoryRun({
      planDirections: (request, options) => planAuthoringSceneDirections(request, {
        ...options,
        settingsSnapshot: settings.value
      })
    })
    const result = await runner.retryDirections({
      session: baseline.runSession,
      pressureProjection: baseline.pressureProjection,
      instruction: `作者假设（不是正式设定）：${owner.actorRef.slice('character:'.length)}的信念是“${branch.belief}”。其他事实保持不变。请给出行动、原文依据、眼前所得与预测代价。无需刻意制造冲突。`,
      signal: planningController?.signal
    })
    if (experiment.active.value !== owner || planningController?.signal.aborted) return false
    plans[branchId] = result.ok
      ? { status: 'ready', run: result.run }
      : { status: 'failed', run: null, message: '本支没有获得有效行动或依据，可重试；另一支不受影响。' }
    return result.ok
  }

  function selectDirection({ branchId, directionId }) {
    const plan = plans[branchId]
    if (!plan?.run || busy.value) return false
    const selected = selectAuthoringSceneLaboratoryDirection(plan.run, directionId)
    if (!selected.ok) return false
    plans[branchId] = { status: 'ready', run: selected.run }
    return true
  }

  function retainDraft() {
    if (!active.value || !draft.preview.value) return false
    branchDrafts.value = {
      ...branchDrafts.value,
      [activeBranch.value]: {
        preview: draft.preview.value,
        ghost: draft.pendingGhost.value,
        text: draft.text.value,
        original: draft.originalText.value,
        previous: draft.previousText.value
      }
    }
    return true
  }

  function switchDraft(branchId) {
    if (!['A', 'B'].includes(branchId) || !active.value || busy.value
      || isAuthoringTaskBusy() || isAdoptionBusy()) return false
    retainDraft()
    experiment.switchBranch(branchId)
    const saved = branchDrafts.value[branchId]
    draft.preview.value = saved?.preview || null
    draft.pendingGhost.value = saved?.ghost || null
    draft.text.value = saved?.text || ''
    draft.originalText.value = saved?.original || ''
    draft.previousText.value = saved?.previous || ''
    if (saved) {
      draft.composer.open = true
      draft.composer.target = sceneLaboratory.target
      closeOverlay()
    } else {
      draft.openEntry()
    }
    draft.composer.failure = null
    draft.composer.staleResult = null
    return true
  }

  async function writeBranchDraft(branchId) {
    if (!active.value || busy.value || isAuthoringTaskBusy()) return false
    const owner = experiment.active.value
    const branch = branches.value[branchId]
    const selectedRun = plans[branchId]?.run
    if (!selectedRun?.selectedDirectionId) {
      sceneLaboratory.notice = '先选定这一支的行动，再确认写成正文。'
      return false
    }
    if (!branch?.belief || !sceneLaboratory.target || !sceneLaboratory.run
      || ['stale', 'failed', 'cancelled'].includes(branch.lifecycle)) return false
    switchDraft(branchId)
    retainDraft()
    draft.preview.value = null
    draft.pendingGhost.value = null
    busy.value = true
    const version = ++requestVersion
    let validation
    try {
      validation = await validateAuthoringSceneLaboratoryRun(selectedRun, collectLiveDependencies)
    } catch {
      validation = { ok: false }
    }
    if (version !== requestVersion || !sceneLaboratory.open
      || experiment.active.value !== owner || projectId.value !== owner.projectId) {
      busy.value = false
      return false
    }
    if (!validation.ok) {
      busy.value = false
      experiment.stale('baseline-changed')
      sceneLaboratory.notice = '本次依据已变化，请重新核对后开启 IF 对照。'
      return false
    }
    sceneLaboratory.phase = 'generating-prose'
    draft.composer.open = true
    draft.composer.target = sceneLaboratory.target
    draft.composer.failure = null
    let outcome
    try {
      outcome = await generateDraft({
        operation: 'next-passage',
        kind: 'action',
        instruction: branch.belief,
        sourceRefs: [...new Set([...getComposerSourceRefs(), ...validation.selection.evidenceRefs])],
        invocationTarget: sceneLaboratory.target,
        selectedDirection: validation.selection,
        authoringRunSession: validation.runSession
      })
    } catch (error) {
      outcome = { ok: false, reason: error?.code || 'provider-failed' }
    }
    busy.value = false
    if (version !== requestVersion || !sceneLaboratory.open) return false
    if (outcome?.preview) {
      sceneLaboratory.phase = 'direction-selected'
      retainDraft()
      closeOverlay()
      return true
    }
    draft.composer.open = false
    draft.composer.target = null
    sceneLaboratory.phase = 'direction-selected'
    sceneLaboratory.notice = outcome?.code === 'NARRATIVE_GROUNDING_REQUIRED'
      ? '模型未提供这项行动所需的资料证据，未生成可采纳稿。请重试或选择另一行动。'
      : '本次没有生成可用正文，已保留 IF 条件，可重试。'
    switchDraft(branchId)
    draft.composer.failure = normalizeAuthoringFailure({
      phase: 'generation',
      message: '这次重试未成功，上一份草稿仍为你保留。',
      retryable: true
    })
    return false
  }

  function retryDraft() {
    if (busy.value || isAuthoringTaskBusy() || isAdoptionBusy()) return false
    if (experiment.phase.value === 'stale') {
      draft.composer.failure = { message: '依据已变化，旧稿可留作构思；请重新开始对照。' }
      return false
    }
    retainDraft()
    draft.preview.value = null
    draft.pendingGhost.value = null
    return writeBranchDraft(activeBranch.value)
  }

  async function start({ actor, beliefA, beliefB }) {
    if (!sceneLaboratory.run || !projectId.value || busy.value || isAuthoringTaskBusy()) return false
    if (draft.preview.value && !active.value) {
      sceneLaboratory.notice = '请先处理正文里已有的试稿，再开始人物对照。'
      return false
    }
    const baseline = sceneLaboratory.run
    const version = ++requestVersion
    busy.value = true
    let resolvedSettings
    try {
      resolvedSettings = Object.freeze({ ...await getSettings() })
    } catch {
      sceneLaboratory.notice = '无法读取模型配置，请检查设置后重试。'
      return false
    } finally {
      busy.value = false
    }
    if (version !== requestVersion || !sceneLaboratory.open || sceneLaboratory.run !== baseline) return false
    const started = experiment.start({
      targetRef: baseline.runSession.target,
      baselineFacts: baseline.runSession.manifest.blocks.map(block => ({
        ref: block.id || block.sourceRefs?.[0] || block.kind,
        text: block.text
      })),
      sourceRevisions: baseline.runSession.manifest.dependencies,
      actorRef: `character:${actor}`,
      beliefA,
      beliefB,
      modelConfig: {
        provider: resolvedSettings.provider || '',
        model: resolvedSettings.model || '',
        baseUrl: resolvedSettings.baseUrl || ''
      }
    })
    if (!started) {
      sceneLaboratory.notice = 'IF 对照启动失败'
      return false
    }
    planningController?.abort()
    planningController = new AbortController()
    baselineRun.value = baseline
    settings.value = resolvedSettings
    plans.A = null
    plans.B = null
    branchDrafts.value = { A: null, B: null }
    sceneLaboratory.notice = `IF 对照已启动：A「${beliefA}」 vs B「${beliefB}」`
    await Promise.all([planBranch('A'), planBranch('B')])
    return true
  }

  function stale(reason) {
    return experiment.stale(reason)
  }

  return {
    experiment,
    active,
    branches,
    activeBranch,
    branchDrafts,
    busy,
    baselineRun,
    settings,
    plans,
    reset,
    planBranch,
    selectDirection,
    retainDraft,
    switchDraft,
    retryDraft,
    writeBranchDraft,
    start,
    stale
  }
}
