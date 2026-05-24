<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="visible && mechanismType" class="mechanism-overlay" @click.self="$emit('close')">
        <div class="mechanism-panel" :class="mechanismType">
          <header class="mechanism-header">
            <div class="header-left">
              <span class="mechanism-icon">{{ mechanismIcon }}</span>
              <h3>{{ mechanismTitle }}</h3>
            </div>
            <button class="close-btn" @click="$emit('close')">×</button>
          </header>

          <div class="mechanism-body">
            <!-- 战斗面板 -->
            <template v-if="mechanismType === 'combat'">
              <div class="combat-info">
                <div class="combatant player">
                  <span class="name">{{ playerCharacter?.name || '玩家' }}</span>
                  <div class="hp-bar">
                    <div class="hp-fill" :style="{ width: '80%' }"></div>
                  </div>
                </div>
                <span class="vs">VS</span>
                <div class="combatant enemy">
                  <span class="name">敌人</span>
                  <div class="hp-bar">
                    <div class="hp-fill enemy" :style="{ width: '100%' }"></div>
                  </div>
                </div>
              </div>
              <div class="combat-actions">
                <button class="action-btn attack" @click="handleCombatAction('attack')">攻击</button>
                <button class="action-btn defend" @click="handleCombatAction('defend')">防御</button>
                <button class="action-btn skill" @click="handleCombatAction('skill')">技能</button>
                <button class="action-btn flee" @click="handleCombatAction('flee')">逃跑</button>
              </div>
              <p class="context-hint" v-if="context">触发词：{{ context }}</p>
            </template>

            <!-- 交易面板 -->
            <template v-else-if="mechanismType === 'trade'">
              <div class="trade-info">
                <div class="gold-display">
                  <span class="gold-icon">💰</span>
                  <span class="gold-amount">{{ gold }} 金币</span>
                </div>
              </div>
              <div class="trade-items">
                <div class="trade-item" v-for="(item, idx) in tradeItems" :key="idx">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-price">{{ item.price }} 金币</span>
                  <button class="buy-btn" @click="handleBuy(item)">购买</button>
                </div>
              </div>
              <p class="context-hint" v-if="context">触发词：{{ context }}</p>
            </template>

            <!-- 任务面板 -->
            <template v-else-if="mechanismType === 'quest'">
              <div class="quest-info">
                <h4 class="quest-title">{{ questData?.title || '新任务' }}</h4>
                <p class="quest-desc">{{ questData?.description || context || '完成指定目标获得奖励' }}</p>
                <div class="quest-rewards" v-if="questData?.rewards">
                  <span>奖励：</span>
                  <span class="reward" v-for="(r, idx) in questData.rewards" :key="idx">{{ r }}</span>
                </div>
              </div>
              <div class="quest-actions">
                <button class="action-btn accept" @click="handleQuestAction('accept')">接受任务</button>
                <button class="action-btn decline" @click="handleQuestAction('decline')">暂时忽略</button>
              </div>
            </template>

            <!-- 对话面板 -->
            <template v-else-if="mechanismType === 'dialogue'">
              <div class="dialogue-info">
                <div class="npc-avatar">
                  <span>{{ dialogueData?.name?.[0] || 'N' }}</span>
                </div>
                <div class="dialogue-content">
                  <span class="npc-name">{{ dialogueData?.name || 'NPC' }}</span>
                  <p class="dialogue-text">{{ dialogueData?.dialogue || context || '...' }}</p>
                </div>
              </div>
              <div class="dialogue-options">
                <button
                  class="dialogue-option"
                  v-for="(opt, idx) in dialogueOptions"
                  :key="idx"
                  @click="handleDialogueOption(opt)"
                >
                  {{ opt }}
                </button>
              </div>
            </template>
          </div>

          <footer class="mechanism-footer">
            <span class="hint">此面板由叙事触发，操作后自动关闭</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mechanismType: { type: String, default: null },
  context: { type: String, default: null },
  playerCharacter: { type: Object, default: null },
  gold: { type: Number, default: 100 }
})

const emit = defineEmits(['close', 'action'])

const mechanismIcon = computed(() => {
  const icons = {
    combat: '⚔️',
    trade: '💰',
    quest: '📜',
    dialogue: '💬'
  }
  return icons[props.mechanismType] || '📋'
})

const mechanismTitle = computed(() => {
  const titles = {
    combat: '战斗',
    trade: '交易',
    quest: '任务',
    dialogue: '对话'
  }
  return titles[props.mechanismType] || '机制'
})

const tradeItems = computed(() => [
  { name: '治疗药水', price: 50 },
  { name: '铁剑', price: 120 },
  { name: '皮革护甲', price: 80 }
])

const questData = computed(() => ({
  title: '探索任务',
  description: props.context || '完成指定目标获得奖励',
  rewards: ['100 经验', '50 金币']
}))

const dialogueData = computed(() => ({
  name: '神秘旅者',
  dialogue: props.context || '你好，旅行者...'
}))

const dialogueOptions = computed(() => [
  '询问附近的情况',
  '交易物品',
  '告别离开'
])

function handleCombatAction(action) {
  emit('action', { type: 'combat', action })
  emit('close')
}

function handleBuy(item) {
  emit('action', { type: 'trade', action: 'buy', item })
}

function handleQuestAction(action) {
  emit('action', { type: 'quest', action })
  emit('close')
}

function handleDialogueOption(option) {
  emit('action', { type: 'dialogue', action: 'respond', option })
  emit('close')
}
</script>

<style scoped>
.mechanism-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(4px);
}

.mechanism-panel {
  width: min(480px, 90vw);
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.mechanism-panel.combat {
  border-color: #ef4444;
}

.mechanism-panel.trade {
  border-color: #f59e0b;
}

.mechanism-panel.quest {
  border-color: #10b981;
}

.mechanism-panel.dialogue {
  border-color: #0ea5e9;
}

.mechanism-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mechanism-icon {
  font-size: 20px;
}

.mechanism-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.mechanism-body {
  padding: 16px;
}

/* Combat styles */
.combat-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.combatant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.combatant .name {
  font-size: 13px;
  font-weight: 500;
}

.hp-bar {
  width: 100px;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.hp-fill {
  height: 100%;
  background: #10b981;
  border-radius: 4px;
  transition: width 0.3s;
}

.hp-fill.enemy {
  background: #ef4444;
}

.vs {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
}

.combat-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.action-btn {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-hover);
}

.action-btn.attack:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.action-btn.defend:hover {
  border-color: #0ea5e9;
  color: #0ea5e9;
}

.action-btn.skill:hover {
  border-color: #a855f7;
  color: #a855f7;
}

.action-btn.flee:hover {
  border-color: var(--text-muted);
}

/* Trade styles */
.trade-info {
  margin-bottom: 16px;
}

.gold-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: color-mix(in srgb, #f59e0b 15%, var(--bg-primary));
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #f59e0b 30%, var(--border));
}

.gold-icon {
  font-size: 16px;
}

.gold-amount {
  font-size: 14px;
  font-weight: 600;
  color: #b45309;
}

.trade-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trade-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.item-name {
  flex: 1;
  font-size: 13px;
}

.item-price {
  font-size: 12px;
  color: var(--text-muted);
}

.buy-btn {
  padding: 4px 10px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
}

.buy-btn:hover {
  background: var(--accent);
  color: #fff;
}

/* Quest styles */
.quest-info {
  margin-bottom: 16px;
}

.quest-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.quest-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.quest-rewards {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.reward {
  padding: 2px 8px;
  background: color-mix(in srgb, #10b981 15%, transparent);
  border-radius: 4px;
  color: #047857;
}

.quest-actions {
  display: flex;
  gap: 8px;
}

.action-btn.accept:hover {
  border-color: #10b981;
  color: #10b981;
}

.action-btn.decline:hover {
  border-color: var(--text-muted);
}

/* Dialogue styles */
.dialogue-info {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.npc-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: color-mix(in srgb, #0ea5e9 20%, var(--bg-tertiary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: #0284c7;
  flex-shrink: 0;
}

.dialogue-content {
  flex: 1;
}

.npc-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.dialogue-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.dialogue-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialogue-option {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.dialogue-option:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.context-hint {
  margin-top: 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.mechanism-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-tertiary);
}

.hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
