<template>
  <!-- 场景冒险面板（CX14–CX18）：可游玩记录的一部分，不是常驻大卡片。
       进行中显示当前场景/出口/可用线索行动；未开始给一个开始入口。 -->
  <div v-if="visible" class="rp-scenario" data-testid="rp-scenario-panel" aria-label="场景冒险">
    <template v-if="view">
      <div class="rp-scenario__head">
        <span class="rp-scenario__title">{{ view.currentScene?.title || scenarioTitle }}</span>
        <span class="rp-scenario__status" :data-status="view.status">{{
          view.status === 'active' ? '进行中' : view.status === 'paused' ? '已暂停' : '已结局'
        }}</span>
        <span v-if="view.endingId" class="rp-scenario__ending" data-testid="rp-scenario-ending">{{ endingLabel }}</span>
        <!-- CX37：存档级标注——当前角色与最近动作，恢复存档一眼可辨 -->
        <span v-if="actorCard" class="rp-scenario__who">{{ actorCard.name }}</span>
        <span v-if="lastActionText" class="rp-scenario__last">{{ lastActionText }}</span>
      </div>
      <p v-if="view.currentScene" class="rp-scenario__desc">{{ view.currentScene.description }}</p>
      <div v-if="view.status === 'active'" class="rp-scenario__exits" role="group" aria-label="可去地点">
        <button
          v-for="exit in view.currentScene?.exits || []"
          :key="exit.toSceneId"
          class="control-quiet rp-scenario__exit"
          type="button"
          @click="move(exit.toSceneId)"
        >{{ exit.label }}</button>
      </div>
      <div v-if="view.availableSceneClueActions.length" class="rp-scenario__clues" role="group" aria-label="可检查线索">
        <div v-for="action in view.availableSceneClueActions" :key="action.clueId" class="rp-scenario__clue">
          <span class="rp-scenario__clue-action">{{ action.actionText }}</span>
          <button class="control-quiet rp-scenario__clue-btn" type="button" @click="prepareCheck(action)">检查（2d6）</button>
        </div>
      </div>
      <!-- 线索检定确认（V09：确认前取消零骰点） -->
      <div v-if="pendingClue" class="rp-scenario__confirm" role="group" aria-label="确认线索检定">
        <span>{{ pendingClue.actionText }} · 属性 {{ attributeLabel(pendingClue.attribute) }} · 修正 {{ pendingClue.modifier > 0 ? '+' + pendingClue.modifier : pendingClue.modifier }}</span>
        <span class="rp-scenario__confirm-rule">{{ ruleText }}</span>
        <button class="control-primary rp-scenario__confirm-btn" type="button" :disabled="busy" @click="confirmCheck">{{ busy ? '结算中…' : '确认检定' }}</button>
        <button class="control-quiet rp-scenario__confirm-cancel" type="button" :disabled="busy" @click="pendingClue = null">取消</button>
        <p v-if="errorText" class="rp-scenario__error" role="alert">{{ errorText }}</p>
      </div>
      <details v-if="view.discoveredClues.length" class="rp-scenario__discovered">
        <summary>已确认线索（{{ view.discoveredClues.length }}）</summary>
        <ul>
          <li v-for="clue in view.discoveredClues" :key="clue.id">{{ clue.name }}：{{ clue.summary }}</li>
        </ul>
      </details>
      <p v-if="view.recentEvents.length" class="rp-scenario__events">{{ view.recentEvents.map((event) => event.text).join('；') }}</p>
      <!-- CX19–CX24：资源行（确定性账本的只读投影）与消耗品使用 -->
      <div v-if="resources" class="rp-scenario__resources" data-testid="rp-resources" role="group" aria-label="资源">
        <span
          v-for="(entry, key) in resources.values"
          :key="key"
          class="rp-scenario__resource"
          data-testid="rp-resource-value"
        >{{ entry.label }} {{ entry.value }}/{{ entry.max }}</span>
        <button
          v-for="(item, itemId) in resources.items"
          :key="itemId"
          v-show="item.count > 0"
          class="control-quiet rp-scenario__item"
          type="button"
          @click="useItem(itemId)"
        >{{ item.label }}×{{ item.count }}（使用）</button>
      </div>
      <!-- CX31–CX34：单一 AI 同伴（可停用；提案只建议，采纳需玩家点击） -->
      <!-- CX19：角色卡（稳定 actorRef；override 来源可区分） -->
      <div v-if="actorCard" class="rp-scenario__actor" data-testid="rp-actor-card" role="group" aria-label="角色卡">
        <span class="rp-scenario__actor-name">{{ actorCard.name }}</span>
        <div v-for="attribute in actorCard.attributes" :key="attribute.key" class="rp-scenario__actor-attr">
          <span>{{ attribute.label }}</span>
          <span class="rp-scenario__actor-stepper">
            <button class="control-quiet" type="button" :aria-label="'降低' + attribute.label + '修正'" @click="adjustOverride(attribute.key, -1)">−</button>
            <strong :data-source="attribute.source">{{ attribute.modifier > 0 ? '+' + attribute.modifier : attribute.modifier }}</strong>
            <button class="control-quiet" type="button" :aria-label="'提高' + attribute.label + '修正'" @click="adjustOverride(attribute.key, 1)">＋</button>
          </span>
        </div>
      </div>
      <div v-if="view.status === 'active'" class="rp-scenario__companion" data-testid="rp-companion">
        <button
          class="control-quiet rp-scenario__companion-toggle"
          type="button"
          :aria-pressed="companionEnabled.toString()"
          @click="toggleCompanion"
        >{{ companionEnabled ? '旅伴：开' : '旅伴：关' }}</button>
        <template v-if="companionEnabled">
          <span v-if="proposal" class="rp-scenario__companion-say">{{ proposal.label }}</span>
          <template v-if="proposal">
            <button class="control-quiet rp-scenario__companion-adopt" type="button" @click="adoptProposal">采纳</button>
            <button class="control-quiet rp-scenario__companion-dismiss" type="button" @click="dismissProposal">忽略</button>
          </template>
          <span v-else class="rp-scenario__companion-say">由你决定。</span>
        </template>
      </div>
      <!-- CX38 分支预览：其他分支的待回应检定可见（切换分支即恢复该分支视角） -->
      <p v-if="otherBranchPendingCount > 0" class="rp-scenario__events" data-testid="rp-other-branch-pending">
        其他分支还有 {{ otherBranchPendingCount }} 条待回应的检定（切换分支可见）
      </p>
      <div class="rp-scenario__actions">
        <button
          v-if="view.status === 'active' && hostPlan && hostPlan.status !== 'ended' && hostPlan.stepsUsed < hostPlan.maxSteps && hostPlan.status !== 'paused'"
          class="control-quiet"
          type="button"
          data-testid="rp-host-advance"
          :disabled="hostBusy"
          @click="advanceHost"
        >推进一拍（{{ hostPlan.stepsUsed }}/{{ hostPlan.maxSteps }}）</button>
        <!-- R10：有界主持一场（KP 循环，预算≤3 拍；真人优先/暂停/结局立即停） -->
        <button
          v-if="view.status === 'active' && (!hostPlan || (hostPlan.status !== 'paused' && hostPlan.status !== 'ended' && hostPlan.stepsUsed < hostPlan.maxSteps))"
          class="control-primary"
          type="button"
          data-testid="rp-kp-run"
          :disabled="hostBusy || kpBusy"
          @click="runKpBatch"
        >{{ kpBusy ? '主持中…' : '主持一场（≤3 拍）' }}</button>
        <span v-if="kpStatusText" class="rp-scenario__kp-status" data-testid="rp-kp-status" role="status">{{ kpStatusText }}</span>
        <button
          v-if="view.status === 'active' && hostPlan && hostPlan.status === 'paused'"
          class="control-quiet"
          type="button"
          data-testid="rp-kp-resume"
          @click="resumeHost"
        >主持继续</button>
        <button
          v-if="view.status === 'active' && (!hostPlan || hostPlan.status !== 'paused')"
          class="control-quiet"
          type="button"
          data-testid="rp-kp-pause"
          @click="pauseHost"
        >主持暂停</button>
        <button
          v-if="hostPlan && hostPlan.stepsUsed >= hostPlan.maxSteps && view.status === 'active'"
          class="control-quiet"
          type="button"
          data-testid="rp-kp-new-batch"
          @click="newHostBatch"
        >新一批主持</button>
        <span v-if="hostPlan && hostPlan.stepsUsed >= hostPlan.maxSteps" class="rp-scenario__host-done">本批主持预算已用完</span>
        <button v-if="view.status === 'active'" class="control-quiet" type="button" @click="pause">暂停</button>
        <button v-if="view.status === 'paused'" class="control-primary" type="button" @click="resume">继续冒险</button>
        <button class="control-quiet" type="button" @click="exportRecord('public')">导出记录（公开）</button>
        <button class="control-quiet" type="button" @click="exportRecord('author')">导出记录（作者）</button>
        <button class="control-quiet" type="button" @click="abandon">放弃本场</button>
        <p v-if="kpErrorText" class="rp-scenario__error" role="alert" data-testid="rp-kp-error">{{ kpErrorText }}</p>
      </div>
    </template>
    <template v-else>
      <div class="rp-scenario__head">
        <span class="rp-scenario__title">选择开场场景</span>
      </div>
      <div class="rp-scenario__actions">
        <button
          v-for="item in scenarioCatalog"
          :key="item.key"
          class="control-quiet rp-scenario__start"
          type="button"
          :data-testid="'rp-scenario-start-' + item.key"
          @click="start(item)"
        >{{ item.title }}</button>
      </div>
      <p v-if="errorText" class="rp-scenario__error" role="alert">{{ errorText }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import lampkeeperFixture from '../../../services/experience/roleplay/fixtures/lampkeeper-scenario.json'
import nightMarketFixture from '../../../services/experience/roleplay/fixtures/night-market-scenario.json'
import inkTombFixture from '../../../services/experience/roleplay/fixtures/ink-tomb-scenario.json'
import { describeRuleText, attributeLabel } from '../../../services/experience/roleplay/roleplayRules.js'
import {
  abandonRoleplayScenario,
  adoptRoleplayCompanionProposal,
  advanceRoleplayHostStep,
  confirmRoleplayClueCheck,
  exportRoleplayAdventure,
  getRoleplayActorCard,
  getRoleplayCompanionProposal,
  getRoleplayResourceView,
  getRoleplayScenarioView,
  moveRoleplayScene,
  pauseRoleplayHost,
  pauseRoleplayScenario,
  resetRoleplayHostBudget,
  resumeRoleplayHost,
  resumeRoleplayScenario,
  setRoleplayActorOverride,
  setRoleplayCompanionEnabled,
  startRoleplayScenario,
  useRoleplayItem
} from '../../../services/experience/roleplay/roleplayWorkflow.js'
import { runRoleplayKpCycle } from '../../../services/experience/roleplay/roleplayKpCoordinator.js'

// CX37 战役目录（本夜范围）：原创场景夹具清单；运行实例仍逐场冻结。
const scenarioCatalog = [
  { key: lampkeeperFixture.scenario.scenarioId, title: lampkeeperFixture.scenario.title, scenario: lampkeeperFixture.scenario },
  { key: nightMarketFixture.scenario.scenarioId, title: nightMarketFixture.scenario.title, scenario: nightMarketFixture.scenario },
  { key: inkTombFixture.scenario.scenarioId, title: inkTombFixture.scenario.title, scenario: inkTombFixture.scenario }
]

const gameStore = useGameStore()
const pendingClue = ref(null)
const busy = ref(false)
const errorText = ref('')

const state = computed(() => gameStore.roleplaySession)
const run = computed(() => state.value?.scenarioRun || null)
const scenario = computed(() => state.value?.scenario || null)
const fixtureTitle = '雾塔来客 / 夜市断签 / 墨冢'
const scenarioTitle = computed(() => scenario.value?.title || fixtureTitle)

// 未开始且模式为 rules（或未选择）时显示开始入口；自由叙事且无运行实例时不打扰。
const visible = computed(() => {
  if (run.value) return true
  return state.value?.mode !== 'free'
})

const view = computed(() => getRoleplayScenarioView(gameStore))
const resources = computed(() => (state.value?.mode === 'rules' ? getRoleplayResourceView(gameStore) : null))
const hostPlan = computed(() => state.value?.hostPlan || null)
const hostBusy = computed(() => gameStore.isLoading)
const actorCard = computed(() => (state.value?.mode === 'rules' ? getRoleplayActorCard(gameStore) : null))
// CX38：其他分支待回应计数（回退/切换影响的可见性）。
const otherBranchPendingCount = computed(() => {
  if (state.value?.mode !== 'rules' || !state.value?.pendingByBranch) return 0
  const active = gameStore.activeBranchId || 'main'
  return Object.keys(state.value.pendingByBranch || {}).filter((branchId) => branchId !== active).length
})

function adjustOverride(attributeKey, delta) {
  errorText.value = ''
  const current = actorCard.value?.attributes.find((item) => item.key === attributeKey)?.modifier || 0
  try {
    setRoleplayActorOverride(gameStore, { attribute: attributeKey, modifier: current + delta })
  } catch (error) {
    errorText.value = String(error?.message || '调整失败')
  }
}
const companionEnabled = computed(() => state.value?.companion?.enabled === true)
const dismissedClueIds = ref([])

// 每轮至多一个提案：确定性生成 + 玩家忽略的排除集。
const proposal = computed(() => {
  const base = getRoleplayCompanionProposal(gameStore)
  if (!base) return null
  if (base.kind === 'check' && dismissedClueIds.value.includes(base.clueId)) return null
  if (base.kind === 'move' && dismissedClueIds.value.includes(`move:${base.toSceneId}`)) return null
  return base
})

function toggleCompanion() {
  errorText.value = ''
  setRoleplayCompanionEnabled(gameStore, { enabled: !companionEnabled.value })
}

function dismissProposal() {
  const current = proposal.value
  if (!current) return
  dismissedClueIds.value = [...dismissedClueIds.value, current.kind === 'move' ? `move:${current.toSceneId}` : current.clueId]
}

function adoptProposal() {
  errorText.value = ''
  const current = proposal.value
  if (!current) return
  try {
    const result = adoptRoleplayCompanionProposal(gameStore, { proposal: current })
    if (result.ok && result.requiresConfirm) {
      const action = view.value?.availableSceneClueActions?.find((item) => item.clueId === result.clueId)
      if (action) pendingClue.value = action
    }
    dismissedClueIds.value = []
  } catch (error) {
    errorText.value = String(error?.message || '采纳失败')
  }
}

async function advanceHost() {
  errorText.value = ''
  try {
    await advanceRoleplayHostStep(gameStore)
  } catch (error) {
    errorText.value = String(error?.message || '推进失败')
  }
}

// ── R10：有界主持一场（KP 循环）——统一状态、暂停/继续、失败恢复入口 ──
const kpBusy = ref(false)
const kpStatusText = ref('')
const kpErrorText = ref('')

const KP_STATUS_TEXT = {
  'human-turn': '一拍完成：该你行动了',
  'human-response': '有待回应的检定：请先重试或放弃',
  'confirmation': '同伴提案待你采纳',
  'paused': '主持已暂停',
  'ended': '本场已结局',
  'setup-required': '先选择开场场景',
  'budget-limit': '本批预算用完：可开始新一批',
  'busy': '上一拍还在生成',
  'error': '主持停止：可查看检定条恢复'
}

async function runKpBatch() {
  if (kpBusy.value) return
  kpErrorText.value = ''
  kpStatusText.value = ''
  kpBusy.value = true
  try {
    const result = await runRoleplayKpCycle(gameStore, { maxAiActions: 3 })
    kpStatusText.value = KP_STATUS_TEXT[result.status] || result.status
    if (result.status === 'error') {
      kpErrorText.value = `主持停止（${result.errorCode || 'KP_ERROR'}）${result.diagnostics ? `：${result.diagnostics}` : ''}；骰点与已提交内容不受影响`
    }
    if (result.status === 'confirmation' && result.proposal) {
      // 提案进入既有采纳面板（ CX34：采纳=玩家显式点击）。
      dismissedClueIds.value = []
    }
  } catch (error) {
    kpErrorText.value = String(error?.message || '主持失败')
  } finally {
    kpBusy.value = false
  }
}

function pauseHost() {
  kpErrorText.value = ''
  pauseRoleplayHost(gameStore)
  kpStatusText.value = KP_STATUS_TEXT.paused
}

function resumeHost() {
  kpErrorText.value = ''
  resumeRoleplayHost(gameStore)
  kpStatusText.value = ''
}

function newHostBatch() {
  kpErrorText.value = ''
  try {
    resetRoleplayHostBudget(gameStore, { maxSteps: 3 })
    kpStatusText.value = ''
  } catch (error) {
    kpErrorText.value = String(error?.message || '无法开始新一批')
  }
}

function exportRecord(mode) {
  errorText.value = ''
  try {
    const record = exportRoleplayAdventure(gameStore, { mode })
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `adventure-${record.scenario.id}-${mode}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    errorText.value = String(error?.message || '导出失败')
  }
}

function useItem(itemId) {
  errorText.value = ''
  const result = useRoleplayItem(gameStore, { itemId })
  if (!result.ok) errorText.value = result.reason === 'ROLEPLAY_ITEM_NONE' ? '该物品已用完' : '无法使用该物品'
}

const endingLabel = computed(() => {
  const ending = (scenario.value?.endings || []).find((item) => item.id === run.value?.endingId)
  return ending?.label || run.value?.endingId || ''
})

// CX37：最近动作（场景事件优先，其次当前分支待回应行动的文本）。
const lastActionText = computed(() => {
  const events = state.value?.scenarioRun?.publicEvents || []
  const last = events.at(-1)
  if (last) return `最近：${last.text}`
  const pending = state.value?.pendingByBranch?.[gameStore.activeBranchId || 'main']
  return pending ? `最近：${pending.rawInput}` : ''
})

const ruleText = computed(() => describeRuleText({ modifier: pendingClue.value?.modifier || 0 }))

async function start(item) {
  errorText.value = ''
  try {
    startRoleplayScenario(gameStore, { scenario: item.scenario })
  } catch (error) {
    errorText.value = String(error?.message || '开始失败')
  }
}

function move(toSceneId) {
  errorText.value = ''
  try {
    moveRoleplayScene(gameStore, { toSceneId })
  } catch (error) {
    errorText.value = String(error?.message || '移动失败')
  }
}

function prepareCheck(action) {
  errorText.value = ''
  pendingClue.value = action
}

async function confirmCheck() {
  if (busy.value || !pendingClue.value) return
  busy.value = true
  errorText.value = ''
  try {
    await confirmRoleplayClueCheck(gameStore, { clueId: pendingClue.value.clueId })
    pendingClue.value = null
  } catch (error) {
    errorText.value = String(error?.message || '检定失败')
  } finally {
    busy.value = false
  }
}

function pause() {
  pauseRoleplayScenario(gameStore)
}
function resume() {
  resumeRoleplayScenario(gameStore)
}
function abandon() {
  abandonRoleplayScenario(gameStore)
}
</script>

<style scoped>
.rp-scenario {
  padding: 10px 14px;
  margin-bottom: 8px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 35%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  font-size: 13px;
  color: var(--archive-ink);
  display: grid;
  gap: 8px;
}

.rp-scenario__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.rp-scenario__title {
  font-weight: 650;
}

.rp-scenario__status {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 25%, transparent);
}

.rp-scenario__status[data-status='ended'] {
  border-color: color-mix(in srgb, var(--archive-gold) 60%, transparent);
}

.rp-scenario__ending {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 75%, transparent);
}

.rp-scenario__who,
.rp-scenario__last {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 68%, transparent);
}

.rp-scenario__desc {
  margin: 0;
  color: color-mix(in srgb, var(--archive-ink) 80%, transparent);
}

.rp-scenario__exits,
.rp-scenario__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.rp-scenario__clues {
  display: grid;
  gap: 6px;
}

.rp-scenario__clue {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.rp-scenario__confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 40%, transparent);
  border-radius: 4px;
}

.rp-scenario__confirm-rule {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 65%, transparent);
}

.rp-scenario__error {
  margin: 0;
  flex-basis: 100%;
  color: var(--control-danger, var(--danger, #a33c2e));
}

.rp-scenario__kp-status {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 68%, transparent);
}

.rp-scenario__discovered {
  font-size: 12px;
}

.rp-scenario__discovered ul {
  margin: 4px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
}

.rp-scenario__resources {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
}

.rp-scenario__actor {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 12px;
}

.rp-scenario__actor-name {
  font-weight: 650;
}

.rp-scenario__actor-attr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rp-scenario__actor-stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.rp-scenario__actor-stepper strong[data-source='actor'] {
  color: color-mix(in srgb, var(--archive-gold) 80%, var(--archive-ink));
}

.rp-scenario__companion {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 75%, transparent);
}

.rp-scenario__events {
  margin: 0;
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
}
</style>
