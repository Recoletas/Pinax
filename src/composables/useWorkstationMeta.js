import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

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
export function useWorkstationMeta() {
  const gameStore = useGameStore()

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

  const currentTask = computed(() => {
    const goals = gameStore.goals || []
    const active = goals.find((g) => g && g.status === 'active' && (g.title || g.label))
    if (active) return String(active.title || active.label)
    return '未登记'
  })

  const currentSection = computed(() => {
    return totalCount.value
  })

  const isEmpty = computed(() => totalCount.value === 0)

  const topstripAnchor = computed(() => {
    if (isEmpty.value) return `档案空白 · 卷 ${currentVolume.value} · 等候第 1 条`
    return `卷 ${currentVolume.value} · 第 ${currentSection.value} 条 / 共 ${totalCount.value} 条`
  })

  return {
    currentVolume,
    caseNo,
    currentTask,
    currentSection,
    totalCount,
    isEmpty,
    topstripAnchor,
  }
}
