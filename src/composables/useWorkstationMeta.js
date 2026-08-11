import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { resolveSelectedTextProviderConfig } from '@/services/textProviderConfigStore'
import { useLocalDemo } from './useLocalDemo'

// UI-E11-A: single source of truth for the workstation topstrip / left
// rail / right rail section anchor. Replaces Experience.vue's 6
// record-folio computeds (recordCaseNo / recordVolume / recordTime /
// recordCharacters / recordLocation / recordObjective).
//
// All values are derived from gameStore — 0 store mutation, 0 service
// change, 0 router change (per E10 hard rules). Components that read
// these computeds reactively update when gameStore state changes.
//
// Functional continuity, not decorative line:
//   - topstrip reads currentSection + totalCount for progress bar
//   - left rail hero block reads currentTask for kicker text
//   - right rail dossier sections read currentSection for active role
//     highlight (user / narrator / archive-keeper)
//
// UI-E13-BIG1: extended with demoState so the right rail + topstrip
// can show real local-demo scene (location / characters / events)
// while the current conversation is empty. useLocalDemo is a sibling composable
// (no store mutation); we just expose its current scene as a
// computed here so right rail components don't have to call 2
// composables.
export function useWorkstationMeta() {
  const gameStore = useGameStore()
  const demo = useLocalDemo()

  const totalCount = computed(() => {
    const msgs = gameStore.messages || []
    return msgs.filter((m) => m && (m.role || m.type) !== 'system').length
  })

  const currentVolume = computed(() => {
    const sessions = gameStore.sessions || []
    return Math.max(1, sessions.length || 1)
  })

  const caseNo = computed(() => {
    const id = gameStore.currentSessionId || gameStore.worldId || 'pending-record'
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i)
      hash |= 0
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8)
    return hex.toUpperCase()
  })

  // UI-E13-BIG1: currentTask now prefers the demo scene's title
  // when the workstation is in demo mode. When the user has a real
  // active goal (gameStore.goals), that wins. When neither, fall
  // back to "暂无任务" (K2 2026-06-27: replaced the abstract
  // "未登记" with a plain-fact statement — no more archived-fiction
  // vocabulary in the workstation chrome).
  const currentTask = computed(() => {
    const demoMode = totalCount.value === 0
    if (demoMode) {
      const scene = demo.currentScene.value
      if (scene && scene.title) return scene.title
    }
    const goals = gameStore.goals || []
    const active = goals.find((g) => g && g.status === 'active' && (g.title || g.label))
    if (active) return String(active.title || active.label)
    return '暂无任务'
  })

  // UI-E12-FIX1: currentSection is the index of the latest message
  // (= totalCount in this append-only chat, since there's no
  // "scrolling back to old messages" — the chat always shows the
  // newest entry). FIX1 reverted the previous W1 Math.max(1, …)
  // padding (which made 0-state show a misleading "第 1 条" with no
  // actual message at index 1) back to bare `return totalCount`,
  // so the composable exposes the real count (0 when empty). The
  // Experience.vue topstrip template now uses `meta.isEmpty` to
  // gate the value display, showing honest "—" placeholders when
  // isEmpty instead of fake "1/1" counts. The comment matches the
  // code (was previously inconsistent: comment said "= totalCount"
  // but code did `Math.max(1, totalCount)`).
  const currentSection = computed(() => {
    return totalCount.value
  })

  const isEmpty = computed(() => totalCount.value === 0)

  // The local demo is an empty-state presentation, not an AI-configuration
  // probe. Built-in MiniMax is valid even though its real key is resolved on
  // the server and is therefore not stored in localStorage.
  const hasConfiguredAi = computed(() => {
    try {
      const config = resolveSelectedTextProviderConfig()
      if (config?.builtin) return true
      return Boolean(config?.baseUrl && config?.apiKey && config?.model)
    } catch {
      return false
    }
  })

  // UI-E13-BIG1: true when no real messages yet. Keep this independent from
  // AI availability so the offline sample controls remain usable alongside a
  // configured provider.
  const isDemoMode = computed(() => totalCount.value === 0)

  // UI-E13-BIG1: demo scene reference. Exposed so right rail can
  // read characters / location / time / weather without re-calling
  // useLocalDemo.
  const demoScene = computed(() => demo.currentScene.value)
  const demoEventsCount = computed(() => {
    const scene = demo.currentScene.value
    return scene && scene.events ? scene.events.length : 0
  })
  const demoEventIndex = demo.eventIndex
  const demoSceneIndex = demo.sceneIndex
  const demoCurrentEvent = computed(() => demo.currentEvent.value)

  const topstripAnchor = computed(() => {
    if (isEmpty.value) {
      // UI-E13-BIG1: anchor reflects demo scene location in demo mode
      const scene = demo.currentScene.value
      if (scene) return `${scene.location} · 本地演示 ${demoEventIndex.value + 1}/${demoEventsCount.value}`
      // K2 (2026-06-27): "档案空白 · 卷 N · 等候第 1 条" replaced
      // with a plain-fact "暂无记录" — drop the archived-fiction
      // "等候 / 空白" tone that read as a placeholder skit, not
      // a product message.
      return `暂无记录`
    }
    return `卷 ${currentVolume.value} · 第 ${currentSection.value} 条 / 共 ${totalCount.value} 条`
  })

  return {
    currentVolume,
    caseNo,
    currentTask,
    currentSection,
    totalCount,
    isEmpty,
    hasConfiguredAi,
    isDemoMode,
    demoScene,
    demoEventsCount,
    demoEventIndex,
    demoSceneIndex,
    demoCurrentEvent,
    topstripAnchor,
    // Re-export applyLocalAction + buildEventMessage + reset for
    // convenience so Experience.vue can call them via the meta
    // composable.
    applyLocalAction: demo.applyLocalAction,
    buildEventMessage: demo.buildEventMessage,
    resetDemo: demo.reset
  }
}
