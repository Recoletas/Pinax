<template>
  <!-- 回合内检定行：动作、规则、骰点、修正、结果一行呈现；
       计算明细与随机性来源折叠，不常驻满屏 JSON。 -->
  <div v-if="check" class="rp-check-row" :data-outcome="check.outcome" data-testid="rp-check-row">
    <span class="rp-check-row__dice" aria-hidden="true">⚂</span>
    <span class="rp-check-row__summary">
      检定 {{ check.attributeLabel || '属性' }} {{ signedModifier }} ·
      <strong>{{ check.dice.join(' + ') }}{{ signedModifier ? ` ${signedModifier}` : '' }} = {{ check.total }}</strong> →
      <em class="rp-check-row__outcome">{{ outcomeLabel }}</em>
    </span>
    <details class="rp-check-row__detail">
      <summary>明细</summary>
      <dl>
        <div><dt>规则</dt><dd>{{ check.ruleText }}</dd></div>
        <div><dt>规则版本</dt><dd>{{ check.ruleId }}@v{{ check.rulesVersion }}</dd></div>
        <div><dt>判定</dt><dd>≥{{ check.detail?.thresholds?.success }} 成功 · {{ check.detail?.thresholds?.partialSuccess }}–{{ check.detail?.thresholds?.success - 1 }} 部分成功 · ≤{{ check.detail?.thresholds?.partialSuccess - 1 }} 失败前进</dd></div>
        <div v-if="check.detail?.rngTrace"><dt>采样</dt><dd>{{ check.detail.rngTrace.algorithm }} · 消耗 {{ check.detail.rngTrace.consumedSamples }} / 拒绝 {{ check.detail.rngTrace.rejectedSamples }}</dd></div>
      </dl>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ROLEPLAY_OUTCOMES } from '../../../services/experience/roleplay/roleplayRules.js'

const props = defineProps({
  check: { type: Object, default: null }
})

const signedModifier = computed(() => {
  const value = Number(props.check?.modifier) || 0
  return value > 0 ? `+${value}` : value < 0 ? String(value) : ''
})
const outcomeLabel = computed(() => ROLEPLAY_OUTCOMES[props.check?.outcome]?.label || props.check?.outcome || '')
</script>

<style scoped>
.rp-check-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 6px;
  padding: 6px 12px;
  border-left: 3px solid color-mix(in srgb, var(--archive-olive) 60%, transparent);
  background: color-mix(in srgb, var(--archive-olive) 7%, transparent);
  border-radius: 0 4px 4px 0;
  font-size: 13px;
  color: var(--archive-ink);
}

.rp-check-row[data-outcome='failure'] {
  border-left-color: color-mix(in srgb, var(--archive-rose, #a33c2e) 65%, transparent);
  background: color-mix(in srgb, var(--archive-rose, #a33c2e) 7%, transparent);
}

.rp-check-row[data-outcome='partial'] {
  border-left-color: color-mix(in srgb, var(--archive-gold) 70%, transparent);
  background: color-mix(in srgb, var(--archive-gold) 9%, transparent);
}

.rp-check-row__dice {
  font-size: 14px;
}

.rp-check-row__summary {
  min-width: 0;
}

.rp-check-row__outcome {
  font-style: normal;
  font-weight: 700;
}

.rp-check-row__detail {
  flex-basis: 100%;
  font-size: 12px;
  color: color-mix(in srgb, var(--archive-ink) 72%, transparent);
}

.rp-check-row__detail summary {
  cursor: pointer;
  display: inline-block;
  padding: 2px 0;
}

.rp-check-row__detail dl {
  margin: 6px 0 0;
  display: grid;
  gap: 4px;
}

.rp-check-row__detail dl > div {
  display: flex;
  gap: 8px;
}

.rp-check-row__detail dt {
  flex: none;
  width: 4.5em;
  color: color-mix(in srgb, var(--archive-ink) 55%, transparent);
}

.rp-check-row__detail dd {
  margin: 0;
  min-width: 0;
}
</style>
