<template>
  <!-- 起团模式条：一条低调的行内设置，不是向导、不是弹窗。
       mode=null（旧会话/未选择）时提示选择；已决定时收为一条状态（可调整目标）。 -->
  <div class="rp-mode-bar" role="group" aria-label="跑团模式">
    <template v-if="decided">
      <span class="rp-mode-bar__chip" :data-mode="state.mode">
        {{ state.mode === 'rules' ? '轻规则 2d6' : '自由叙事' }}
      </span>
      <span v-if="state.goal" class="rp-mode-bar__goal" :title="state.goal">本场目标：{{ state.goal }}</span>
      <button class="control-quiet rp-mode-bar__adjust" type="button" @click="editing = true">调整</button>
    </template>
    <template v-else>
      <span class="rp-mode-bar__label">本场玩法</span>
      <button
        class="control-quiet rp-mode-bar__choice"
        type="button"
        @click="choose('free')"
      >自由叙事<span class="rp-mode-bar__hint">不投骰，直接继续故事</span></button>
      <button
        class="control-quiet rp-mode-bar__choice"
        type="button"
        @click="choose('rules')"
      >轻规则 2d6<span class="rp-mode-bar__hint">行动可确认检定，规则裁定成败</span></button>
    </template>

    <div v-if="editing" class="rp-mode-bar__editor">
      <label class="rp-mode-bar__field">
        <span>本场目标（可选）</span>
        <input
          v-model="draftGoal"
          type="text"
          maxlength="200"
          placeholder="例如：查明灯塔看守失踪的真相"
          @keydown.enter.prevent="saveEditing"
          @keydown.escape.prevent="closeEditing"
        />
      </label>
      <button class="control-primary rp-mode-bar__save" type="button" @click="saveEditing">保存</button>
      <button class="control-quiet rp-mode-bar__cancel" type="button" @click="closeEditing">取消</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import { setRoleplaySessionSetup } from '../../../services/experience/roleplay/roleplayWorkflow.js'

const gameStore = useGameStore()
const editing = ref(false)
const draftGoal = ref('')

const state = computed(() => gameStore.roleplaySession || {})
const decided = computed(() => state.value.mode === 'free' || state.value.mode === 'rules')

function choose(mode) {
  setRoleplaySessionSetup(gameStore, { mode, goal: state.value.goal || '', actorRef: state.value.actorRef || null })
}

function saveEditing() {
  setRoleplaySessionSetup(gameStore, {
    mode: state.value.mode || 'free',
    goal: draftGoal.value,
    actorRef: state.value.actorRef || null
  })
  editing.value = false
}

function closeEditing() {
  editing.value = false
}
</script>

<style scoped>
.rp-mode-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 14px;
  margin: 0 0 8px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
  font-size: 13px;
  color: var(--archive-ink);
}

.rp-mode-bar__chip {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 45%, transparent);
  color: var(--archive-ink);
  font-size: 12px;
  font-weight: 600;
}

.rp-mode-bar__chip[data-mode='rules'] {
  border-color: color-mix(in srgb, var(--archive-gold) 55%, transparent);
}

.rp-mode-bar__goal {
  max-width: 46ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
}

.rp-mode-bar__label {
  font-weight: 600;
}

.rp-mode-bar__choice {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.rp-mode-bar__hint {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 62%, transparent);
}

.rp-mode-bar__editor {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.rp-mode-bar__field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.rp-mode-bar__field span {
  white-space: nowrap;
  font-size: 12px;
}

.rp-mode-bar__field input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 30%, transparent);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 4px 2px;
}

.rp-mode-bar__field input:focus {
  outline: none;
  border-bottom-color: var(--archive-olive);
}

@media (max-width: 720px) {
  .rp-mode-bar {
    padding: 8px 10px;
  }
  .rp-mode-bar__goal {
    max-width: 100%;
  }
}
</style>
