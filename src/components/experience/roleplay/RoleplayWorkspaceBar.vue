<template>
  <!-- C 线跑团工作条：归档状态 + 已检定待回应 + 场景冒险 + 起团模式的单挂载点。
       状态真源在 gameStore.roleplaySession；本组件只做只读呈现与动作转发。 -->
  <p v-if="archiveVisible" class="rp-workspace-bar__archive" role="status">{{ archiveText }}</p>
  <RoleplayPendingBar />
  <RoleplayScenarioPanel />
  <RoleplayModeBar />
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import RoleplayPendingBar from './RoleplayPendingBar.vue'
import RoleplayModeBar from './RoleplayModeBar.vue'
import RoleplayScenarioPanel from './RoleplayScenarioPanel.vue'

const gameStore = useGameStore()

// 归档 outbox 如实显示"历史归档待重试"，不冒称已入账本。
const archiveVisible = computed(() => (gameStore.roleplaySession?.archiveOutbox || []).length > 0)
const archiveText = computed(() => `历史归档待重试（${gameStore.roleplaySession.archiveOutbox.length} 条），本地回合不受影响`)
</script>

<style scoped>
.rp-workspace-bar__archive {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary, color-mix(in srgb, var(--archive-ink) 62%, transparent));
}
</style>
