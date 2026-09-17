<template>
  <!-- 已检定、等待回应：刷新/失败后的恢复入口。同分支 pending 才显示；
       重试复用原骰点（不重掷），放弃是显式取消。 -->
  <div v-if="pending" class="rp-pending" role="status" data-testid="rp-pending-bar">
    <span class="rp-pending__dot" aria-hidden="true"></span>
    <span class="rp-pending__text">
      <template v-if="pending.resolution">
        已检定、等待回应：{{ diceSummary }}（{{ outcomeLabel }}）
      </template>
      <template v-else>
        检定已确认，等待掷骰保存
      </template>
      <span v-if="pending.retryCount > 0" class="rp-pending__retry-note">
        已重试 {{ pending.retryCount }} 次{{ lastErrorText }}
      </span>
    </span>
    <span class="rp-pending__actions">
      <button v-if="pending.status === 'resolved'" class="control-primary rp-pending__retry" type="button" :disabled="busy" @click="retry">
        {{ busy ? '请求中…' : (pending.retryCount > 0 ? '再次请求回应' : '请求回应') }}
      </button>
      <button v-else class="control-primary rp-pending__retry" type="button" :disabled="busy" @click="resume">
        {{ busy ? '处理中…' : '继续掷骰' }}
      </button>
      <button class="control-quiet rp-pending__cancel" type="button" :disabled="busy" @click="cancel">放弃本次</button>
    </span>
    <p v-if="errorText" class="rp-pending__error" role="alert">{{ errorText }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import { ROLEPLAY_OUTCOMES } from '../../../services/experience/roleplay/roleplayRules.js'
import {
  cancelRoleplayPending,
  resolvePendingAction,
  retryRoleplayNarration
} from '../../../services/experience/roleplay/roleplayWorkflow.js'

const gameStore = useGameStore()
const busy = ref(false)
const errorText = ref('')

const pending = computed(() => {
  const state = gameStore.roleplaySession
  if (!state || state.mode !== 'rules') return null
  return state.pendingByBranch?.[gameStore.activeBranchId || 'main'] || null
})

const diceSummary = computed(() => {
  const resolution = pending.value?.resolution
  if (!resolution) return ''
  const modifier = resolution.modifier > 0 ? `+${resolution.modifier}` : resolution.modifier < 0 ? String(resolution.modifier) : ''
  return `${resolution.dice.join(' + ')}${modifier} = ${resolution.total}`
})

const outcomeLabel = computed(() => ROLEPLAY_OUTCOMES[pending.value?.resolution?.outcome]?.label || '')

const lastErrorText = computed(() => {
  const code = pending.value?.lastErrorCode
  if (!code) return ''
  if (code === 'NARRATIVE_AGENT_ABORTED') return '（上次已停止）'
  if (code === 'NARRATIVE_PROVIDER_RATE_LIMITED' || code === 'NARRATIVE_PROVIDER_TIMEOUT') return '（上次请求超时/限流，骰点未变）'
  return '（上次请求失败，骰点未变）'
})

async function retry() {
  if (busy.value) return
  errorText.value = ''
  busy.value = true
  try {
    await retryRoleplayNarration(gameStore)
  } catch (error) {
    errorText.value = String(error?.message || '请求失败')
  } finally {
    busy.value = false
  }
}

async function resume() {
  if (busy.value) return
  errorText.value = ''
  busy.value = true
  try {
    await resolvePendingAction(gameStore, { actionId: pending.value?.actionId })
  } catch (error) {
    errorText.value = String(error?.message || '恢复失败')
  } finally {
    busy.value = false
  }
}

async function cancel() {
  if (busy.value) return
  errorText.value = ''
  busy.value = true
  try {
    cancelRoleplayPending(gameStore)
  } catch (error) {
    errorText.value = String(error?.message || '放弃失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.rp-pending {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 14px;
  margin-bottom: 8px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 45%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-gold) 8%, transparent);
  font-size: 13px;
  color: var(--archive-ink);
}

.rp-pending__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--archive-gold);
  flex: none;
}

.rp-pending__text {
  min-width: 0;
}

.rp-pending__retry-note {
  display: inline-block;
  margin-left: 6px;
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
}

.rp-pending__actions {
  display: inline-flex;
  gap: 8px;
  margin-left: auto;
}

.rp-pending__error {
  flex-basis: 100%;
  margin: 0;
  color: var(--control-danger, var(--danger, #a33c2e));
}

@media (max-width: 720px) {
  .rp-pending {
    padding: 8px 10px;
  }
  .rp-pending__actions {
    margin-left: 0;
  }
}
</style>
