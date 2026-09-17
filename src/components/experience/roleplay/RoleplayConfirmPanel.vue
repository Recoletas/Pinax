<template>
  <!-- 检定确认切片：玩家显式要求检定时展开，展示属性/修正与三档后果。
       确认前取消 → 零骰点、零模型。 -->
  <div v-if="open" class="rp-confirm" role="group" aria-label="确认检定">
    <div class="rp-confirm__row">
      <label class="rp-confirm__field">
        <span>检定属性</span>
        <select v-model="attribute" :disabled="busy">
          <option v-for="item in attributes" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </label>
      <label class="rp-confirm__field rp-confirm__field--modifier">
        <span>修正</span>
        <span class="rp-confirm__stepper">
          <button class="control-quiet rp-confirm__step" type="button" :disabled="busy || modifier <= minModifier" :aria-label="'降低修正，当前 ' + modifier" @click="modifier -= 1">−</button>
          <strong data-testid="rp-modifier-value">{{ modifier > 0 ? `+${modifier}` : modifier }}</strong>
          <button class="control-quiet rp-confirm__step" type="button" :disabled="busy || modifier >= maxModifier" :aria-label="'提高修正，当前 ' + modifier" @click="modifier += 1">＋</button>
        </span>
      </label>
    </div>
    <p class="rp-confirm__rule" data-testid="rp-rule-text">{{ ruleText }}</p>
    <p v-if="errorText" class="rp-confirm__error" role="alert">{{ errorText }}</p>
    <div class="rp-confirm__actions">
      <button class="control-primary rp-confirm__confirm" type="button" :disabled="busy" @click="confirm">
        {{ busy ? '结算中…' : '确认检定' }}
      </button>
      <button class="control-quiet rp-confirm__cancel" type="button" :disabled="busy" @click="cancel">取消</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../../../stores/gameStore'
import { ROLEPLAY_ATTRIBUTES, ROLEPLAY_RULE_2D6, describeRuleText } from '../../../services/experience/roleplay/roleplayRules.js'
import { confirmRoleplayAction } from '../../../services/experience/roleplay/roleplayWorkflow.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  draftText: { type: String, default: '' }
})
const emit = defineEmits(['confirmed', 'dismiss', 'focus-input'])

const gameStore = useGameStore()
const attributes = ROLEPLAY_ATTRIBUTES
const attribute = ref('wits')
const modifier = ref(0)
const modifierSource = ref('manual-adjust')
const modifierTouched = ref(false)
const errorText = ref('')
const busy = ref(false)
const minModifier = ROLEPLAY_RULE_2D6.modifierRange.min
const maxModifier = ROLEPLAY_RULE_2D6.modifierRange.max

const ruleText = computed(() => describeRuleText({ modifier: modifier.value }))

watch(() => props.open, (open) => {
  if (open) {
    errorText.value = ''
    // CX19：actor 卡 override 作为默认修正（来源 'actor'）；玩家再调即变手动。
    const card = gameStore.roleplaySession?.actor
    if (card && Number.isSafeInteger(Number(card.attributeOverrides?.[attribute.value]))) {
      modifier.value = Number(card.attributeOverrides[attribute.value])
      modifierTouched.value = false
    }
    emit('focus-input')
  }
})

watch([attribute, modifier], () => {
  const card = gameStore.roleplaySession?.actor
  const override = Number(card?.attributeOverrides?.[attribute.value])
  modifierSource.value = Number.isSafeInteger(override) && modifier.value === override ? 'actor' : 'manual-adjust'
})

function cancel() {
  // 未确认不投骰：直接收起，零副作用（V09）。
  errorText.value = ''
  emit('dismiss')
}

async function confirm() {
  if (busy.value) return
  errorText.value = ''
  busy.value = true
  try {
    await confirmRoleplayAction(gameStore, {
      rawInput: props.draftText,
      attribute: attribute.value,
      modifier: modifier.value,
      modifierSource: modifierSource.value
    })
    emit('confirmed')
  } catch (error) {
    errorText.value = String(error?.message || '检定失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.rp-confirm {
  padding: 10px 14px;
  margin-bottom: 8px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 40%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  font-size: 13px;
  color: var(--archive-ink);
}

.rp-confirm__row {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: center;
}

.rp-confirm__field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rp-confirm__field > span:first-child {
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 70%, transparent);
}

.rp-confirm__field select {
  border: 1px solid color-mix(in srgb, var(--archive-ink) 24%, transparent);
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 4px 8px;
}

.rp-confirm__stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rp-confirm__step {
  min-width: 30px;
  min-height: 30px;
  padding: 0;
  text-align: center;
  font-size: 15px;
  line-height: 1;
}

.rp-confirm__rule {
  margin: 8px 0 0;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
}

.rp-confirm__error {
  margin: 8px 0 0;
  color: var(--control-danger, var(--danger, #a33c2e));
}

.rp-confirm__actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

@media (max-width: 720px) {
  .rp-confirm {
    padding: 8px 10px;
  }
}
</style>
