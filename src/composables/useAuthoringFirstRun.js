import { computed, ref } from 'vue'
import { getItem, setItem } from './useStorage'

// 首次创作指引的唯一状态 owner:只拥有"激活的书""关闭/完成偏好"与阶段投影,
// 不拥有正文、人物、试演状态;所有阶段都从调用方注入的真实产物推导。
const PREFERENCE_KEY = 'authoring_first_run_v1'
const MAX_TRACKED_BOOKS = 60

// 阶段语义(与总任务书 C01 一致):
// write/characters/scene/rehearse 显示在稿面条上;response 之后提示归右栏同一位置,
// 回应、可编辑试稿与"采纳由作者决定"合并为一条真话提示,不伪造完成勾选。
const PHASES = Object.freeze(['write', 'characters', 'scene', 'rehearse', 'response'])

function normalizeBookIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id).slice(-MAX_TRACKED_BOOKS) : []
}

function loadPreference() {
  const parsed = getItem(PREFERENCE_KEY)
  return {
    closedBookIds: normalizeBookIds(parsed?.closedBookIds),
    completedBookIds: normalizeBookIds(parsed?.completedBookIds)
  }
}

export function useAuthoringFirstRun({ bookId, artifacts }) {
  const preference = loadPreference()
  const closedBookIds = ref(preference.closedBookIds)
  const completedBookIds = ref(preference.completedBookIds)
  const activeBookId = ref('')

  const currentBookId = computed(() => String(bookId?.value ?? bookId?.() ?? '') || '')
  const currentArtifacts = computed(() => {
    const source = artifacts?.value ?? artifacts?.() ?? {}
    return {
      hasManuscript: Boolean(source.hasManuscript),
      hasCharacters: Boolean(source.hasCharacters),
      hasPresentCast: Boolean(source.hasPresentCast),
      rehearsalStarted: Boolean(source.rehearsalStarted),
      hasResponse: Boolean(source.hasResponse),
      hasDraft: Boolean(source.hasDraft)
    }
  })

  const phase = computed(() => {
    if (activeBookId.value !== currentBookId.value) return ''
    const a = currentArtifacts.value
    if (!a.hasManuscript) return 'write'
    if (!a.hasCharacters) return 'characters'
    if (!a.hasPresentCast) return 'scene'
    if (!a.rehearsalStarted) return 'rehearse'
    return 'response'
  })

  // 稿面条的阶段序号:1 写一场 / 2 放入人物 / 3 安排当前场 / 4 试一条岔路;
  // response 阶段条不再出现在稿面,由右栏提示接手。
  const stageIndex = computed(() => {
    const index = PHASES.indexOf(phase.value)
    return index >= 0 && index <= 3 ? index + 1 : 0
  })

  const stripVisible = computed(() => Boolean(phase.value) && phase.value !== 'response')

  const panelHint = computed(() => {
    if (phase.value !== 'response') return ''
    const a = currentArtifacts.value
    if (!a.hasResponse) return '试演已发起,回应会出现在这里;稿面可以继续写。'
    if (!a.hasDraft) return '收到回应了:可以写成试稿带回正文,直接继续写也完全可以。'
    return '试稿已放进正文,仍可修改;是否采用由你决定。'
  })

  function persist() {
    setItem(PREFERENCE_KEY, {
      closedBookIds: closedBookIds.value,
      completedBookIds: completedBookIds.value
    })
  }

  function markBook(list, bookIdValue) {
    const id = String(bookIdValue || '')
    if (!id || list.value.includes(id)) return
    list.value = [...list.value, id].slice(-MAX_TRACKED_BOOKS)
  }

  // 激活只来自显式入口(welcome 的 guide=first-run 或菜单重开)。
  // 已关闭/已完成的书不再因 query 残留、刷新或回退重新弹出。
  function activate(id = currentBookId.value) {
    const target = String(id || '')
    if (!target) return false
    if (closedBookIds.value.includes(target) || completedBookIds.value.includes(target)) return false
    activeBookId.value = target
    return true
  }

  // 关闭只对当前书生效;刷新后同一本书不再自动出现(激活本来就需要显式入口,
  // 这里额外挡住"带 guide 参数刷新/回退"的复现路径)。
  function dismiss() {
    const target = activeBookId.value || currentBookId.value
    if (!target) return
    markBook(closedBookIds, target)
    if (activeBookId.value === target) activeBookId.value = ''
    persist()
  }

  // 试稿被作者采纳:这条创作回路对本书完成,指引不再自动出现。
  function complete() {
    const target = activeBookId.value || currentBookId.value
    if (!target) return
    markBook(completedBookIds, target)
    if (activeBookId.value === target) activeBookId.value = ''
    persist()
  }

  // 更多/帮助里的"继续创作指引":按当前书真实状态重算阶段;
  // 之前关闭/完成过的书由作者显式重开。没有打开的书时返回 'need-book'。
  function reopen() {
    const target = currentBookId.value
    if (!target) return 'need-book'
    closedBookIds.value = closedBookIds.value.filter((id) => id !== target)
    completedBookIds.value = completedBookIds.value.filter((id) => id !== target)
    activeBookId.value = target
    persist()
    return 'active'
  }

  function isOpenForBook(id) {
    return activeBookId.value === String(id || '')
  }

  return {
    phase,
    stageIndex,
    stripVisible,
    panelHint,
    activeBookId,
    activate,
    dismiss,
    complete,
    reopen,
    isOpenForBook
  }
}
