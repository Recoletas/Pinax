<template>
  <!-- C 线跑团工作条：归档状态 + 已检定待回应 + 场景冒险 + 起团模式的单挂载点。
       状态真源在 gameStore.roleplaySession；本组件只做只读呈现与动作转发。 -->
  <p v-if="archiveVisible" class="rp-workspace-bar__archive" role="status">{{ archiveText }}</p>
  <RoleplayPendingBar />
  <RoleplayScenarioPanel v-if="scenarioActive" />
  <details class="rp-workspace-options">
    <summary><span>{{ scenarioActive ? '本场玩法' : '开场与玩法' }}</span><small>{{ gameStore.roleplaySession?.mode === 'rules' ? '轻规则 2d6' : gameStore.roleplaySession?.mode === 'free' ? '自由叙事' : '未选择玩法' }}</small><span aria-hidden="true">⌄</span></summary>
    <RoleplayScenarioPanel v-if="!scenarioActive" />
    <RoleplayModeBar />
  </details>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import { getRoleplayScenarioView } from '../../../services/experience/roleplay/roleplayWorkflow.js'
import RoleplayPendingBar from './RoleplayPendingBar.vue'
import RoleplayModeBar from './RoleplayModeBar.vue'
import RoleplayScenarioPanel from './RoleplayScenarioPanel.vue'

const gameStore = useGameStore()
const scenarioActive = computed(() => Boolean(getRoleplayScenarioView(gameStore)?.scenarioId))

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

<style scoped>
.rp-workspace-options { border-top: 1px solid var(--hairline-soft); font-family: var(--font-sans); }
.rp-workspace-options > summary { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px 24px; color: var(--text-secondary); cursor: pointer; list-style: none; font-size: 13px; }
.rp-workspace-options > summary::-webkit-details-marker { display: none; }
.rp-workspace-options > summary small { margin-left: auto; font-size: 12px; color: var(--text-muted); }
.rp-workspace-options > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.rp-workspace-options[open] > summary { color: var(--text-primary); }
@media (max-width: 720px) { .rp-workspace-options > summary { padding-inline: 16px; } }
</style>
