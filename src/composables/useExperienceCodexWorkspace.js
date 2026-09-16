// Experience 现场索引（Codex）工作区（R-X1）：sheet 打开/关闭、详情抽屉、
// 地点跳转、分区状态、更新角标与焦点恢复的唯一 owner。
// 依赖由页面注入：不 import 页面；Escape 链中排在前面的其他覆盖层
// （收集团/内联详情/速记）通过注入回调参与优先级判定。
import { computed, nextTick, ref, watch } from 'vue'

const CODEX_DETAIL_LABELS = {
  time: '时间设定',
  characters: '在场人物',
  locations: '地点卷',
  events: '事件卷'
}

export function useExperienceCodexWorkspace({
  gameStore,
  geographyStore,
  meta,
  router,
  // Escape 优先级链：其他覆盖层打开时优先关闭并返回 true
  overlayEscape = () => false,
  // 打开详情抽屉时需要收起的姐妹覆盖层
  closeQuickNoteImport = () => {},
  closeAdvisor = () => {},
  isQuickNoteOpen = () => false,
  closeQuickNote = () => {}
}) {
  const codexSheetOpen = ref(false)
  const codexTriggerRef = ref(null)
  const codexSheetRef = ref(null)
  const activeCodexSection = ref('events')
  const codexDetailSection = ref(null)
  const lastAddedLocationId = ref('')
  const codexUpdates = ref({
    time: 0,
    characters: 0,
    locations: 0,
    events: 0
  })

  const codexDetailLabel = computed(() => CODEX_DETAIL_LABELS[codexDetailSection.value] || '详情')

  function openCodexSheet() {
    codexSheetOpen.value = true
    nextTick(() => codexSheetRef.value?.focus())
  }

  function closeCodexSheet({ restoreFocus = true } = {}) {
    codexSheetOpen.value = false
    if (restoreFocus) nextTick(() => codexTriggerRef.value?.focus())
  }

  // Escape 优先级链（原页面 handleCodexKeydown 整体迁入）：
  // 收集团 → 内联详情 → codex 详情 → 速记 → codex sheet。
  function handleCodexKeydown(event) {
    if (event.key !== 'Escape') return
    if (overlayEscape()) return
    if (codexDetailSection.value) {
      closeCodexDetail()
      return
    }
    if (isQuickNoteOpen()) {
      closeQuickNote()
      return
    }
    if (codexSheetOpen.value) closeCodexSheet()
  }

  function openCodexDetail(sectionKey) {
    if (!sectionKey) return
    codexDetailSection.value = sectionKey
    if (typeof gameStore.setQuickNoteImportMode === 'function') {
      gameStore.setQuickNoteImportMode(false)
    }
    closeQuickNoteImport()
    closeAdvisor()
  }

  function openPlaceContext({ placeId, target } = {}) {
    if (!placeId) return
    const routeName = target === 'settings' ? 'settings-structured' : 'settings-world-map'
    router.push({ name: routeName, query: { placeId } })
  }

  function closeCodexDetail() {
    codexDetailSection.value = null
    lastAddedLocationId.value = ''
  }

  function handleRailAddLocation(newId) {
    // UI-E18-B round 3: codex rail 添加 button emitted a fresh location id.
    // Stash it + open the locations detail drawer so the new card auto-expands
    // and the description textarea is immediately editable.
    lastAddedLocationId.value = newId
    openCodexDetail('locations')
  }

  const codexCharacterCount = computed(() => (gameStore.encounteredCharacters || []).length)
  const codexLocationCount = computed(() => (geographyStore.locations || []).length)
  const codexEventCount = computed(() => {
    return (gameStore.activities || []).length + (gameStore.plotJournal || []).length
  })

  const latestCharacterLabel = computed(() => {
    const list = gameStore.encounteredCharacters || []
    const latest = list[list.length - 1]
    return latest?.name || latest?.displayName || gameStore.playerName || '未登记角色'
  })

  const latestLocationLabel = computed(() => {
    const locations = geographyStore.locations || []
    const latest = locations[locations.length - 1]
    return latest?.name || gameStore.worldMapState?.currentScene || meta.demoScene?.title || '暂无地点'
  })

  const latestEventLabel = computed(() => {
    const latestActivity = (gameStore.activities || [])[0]
    const latestPlot = (gameStore.plotJournal || [])[0]
    return latestActivity?.title || latestPlot?.title || latestPlot?.summary || '暂无事件'
  })

  const codexTimeCount = computed(() => {
    const t = gameStore.writingTime || {}
    return (t.eraName || t.year || t.month || t.day) ? 1 : 0
  })

  const codexTimeLatest = computed(() => {
    const t = gameStore.writingTime || {}
    const era = t.eraName || t.eraId || ''
    if (!t.year && !t.month && !t.day) return '未登记'
    const eraStr = era ? `${era} ` : ''
    return `${eraStr}${t.year || '?'}年${t.month || '?'}月${t.day || '?'}日`
  })

  const codexSections = computed(() => [
    {
      key: 'time',
      label: '时间',
      count: codexTimeCount.value,
      latest: codexTimeLatest.value,
      update: codexUpdates.value.time
    },
    {
      key: 'characters',
      label: '人物',
      count: codexCharacterCount.value,
      latest: latestCharacterLabel.value,
      update: codexUpdates.value.characters
    },
    {
      key: 'locations',
      label: '地点',
      count: codexLocationCount.value,
      latest: latestLocationLabel.value,
      update: codexUpdates.value.locations
    },
    {
      key: 'events',
      label: '事件',
      count: codexEventCount.value,
      latest: latestEventLabel.value,
      update: codexUpdates.value.events
    }
  ])

  function toggleCodexSection(section) {
    activeCodexSection.value = activeCodexSection.value === section ? '' : section
    if (section && codexUpdates.value[section]) {
      codexUpdates.value = { ...codexUpdates.value, [section]: 0 }
    }
  }

  function trackCodexCount(key, count) {
    watch(
      () => count.value,
      (next, previous) => {
        if (typeof previous !== 'number') return
        if (next > previous && activeCodexSection.value !== key) {
          codexUpdates.value = {
            ...codexUpdates.value,
            [key]: codexUpdates.value[key] + (next - previous)
          }
        }
      }
    )
  }

  trackCodexCount('time', codexTimeCount)
  trackCodexCount('characters', codexCharacterCount)
  trackCodexCount('locations', codexLocationCount)
  trackCodexCount('events', codexEventCount)

  return {
    codexSheetOpen,
    codexTriggerRef,
    codexSheetRef,
    activeCodexSection,
    codexDetailSection,
    codexDetailLabel,
    codexUpdates,
    lastAddedLocationId,
    codexSections,
    openCodexSheet,
    closeCodexSheet,
    handleCodexKeydown,
    openCodexDetail,
    openPlaceContext,
    closeCodexDetail,
    handleRailAddLocation,
    toggleCodexSection
  }
}
