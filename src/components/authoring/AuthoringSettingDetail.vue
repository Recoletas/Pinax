<script setup>
defineProps({ item: { type: Object, default: null }, showBack: Boolean, showDual: Boolean, selectedText: { type: String, default: '' } })
defineEmits(['back', 'annotate', 'open-full', 'open-dual', 'locate'])
const typeLabels = { character: '人物', location: '地点', rule: '规则', style: '文风', forbidden: '禁则', general: '通用', lore: '背景' }
</script>

<template>
  <article v-if="item" class="authoring-setting-detail">
    <header class="authoring-setting-detail__head">
      <button v-if="showBack" type="button" class="authoring-setting-detail__back" aria-label="返回设定索引" @click="$emit('back')">←</button>
      <div class="authoring-setting-detail__identity">
        <span>{{ typeLabels[item.type] || item.type }}</span>
        <h3>{{ item.name || '未命名设定' }}</h3>
      </div>
      <div class="authoring-setting-detail__head-actions">
        <button v-if="showDual" type="button" class="authoring-setting-detail__open" @click="$emit('open-dual', item.entry)">双栏打开</button>
        <button type="button" class="authoring-setting-detail__open" @click="$emit('open-full', item.entry)">完整设定</button>
      </div>
    </header>

    <section class="authoring-setting-detail__content">
      <p>{{ item.content || '暂无设定正文。' }}</p>
    </section>

    <section v-if="item.currentUse" class="authoring-setting-detail__section authoring-setting-detail__current">
      <header><h4>当前用法</h4><span>{{ item.currentUse.positionLabel }}</span></header>
      <button type="button" @click="$emit('locate', item.currentUse)">
        <span>{{ item.currentUse.excerpt }}</span><small>回到正文 ↗</small>
      </button>
    </section>
    <section v-else-if="item.reasons?.length" class="authoring-setting-detail__section authoring-setting-detail__basis">
      <h4>写作时别忘记</h4>
      <p>{{ item.reasons.join(' · ') }}</p>
    </section>

    <section v-if="item.occurrenceCount" class="authoring-setting-detail__section authoring-setting-detail__trail">
      <header><h4>本章引用轨迹</h4><span>{{ item.occurrenceCount }} 处</span></header>
      <button v-for="(occurrence, index) in item.occurrences" :key="`${occurrence.nodeId}:${occurrence.start}`" type="button" @click="$emit('locate', occurrence)">
        <small>{{ occurrence.positionLabel || index + 1 }}</small><span>{{ occurrence.excerpt }}</span><b>↗</b>
      </button>
      <p v-if="item.occurrenceCount > item.occurrences.length">另有 {{ item.occurrenceCount - item.occurrences.length }} 处，可在完整设定中查看。</p>
    </section>

    <details v-if="item.entry?.keys?.length || item.entry?.relations" class="authoring-setting-detail__meta">
      <summary>关键词与关系</summary>
      <div v-if="item.entry?.keys?.length"><span>触发词</span><p>{{ item.entry.keys.join('、') }}</p></div>
      <div v-if="item.entry?.keysSecondary?.length"><span>辅助词</span><p>{{ item.entry.keysSecondary.join('、') }}</p></div>
    </details>

    <footer class="authoring-setting-detail__actions">
      <button type="button" :disabled="!selectedText.trim()" @click="$emit('annotate', item.entry)">{{ selectedText.trim() ? '将选区关联到此设定' : '选择正文后可建立关联' }}</button>
    </footer>
  </article>
  <div v-else class="authoring-setting-detail authoring-setting-detail--empty">
    <strong>从左侧选择一条设定</strong><p>这里会显示设定正文、当前用法和本章引用轨迹。</p>
  </div>
</template>
