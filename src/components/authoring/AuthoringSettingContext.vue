<script setup>
defineProps({ context: { type: Object, required: true }, selectedId: { type: String, default: '' } })
defineEmits(['select', 'browse'])
</script>

<template>
  <section class="authoring-setting-context" aria-label="当前落笔处相关设定">
    <header class="authoring-setting-context__lead">
      <div><strong>当前落笔处</strong><span>读取当前段光标之前与前 3 个文本块</span></div>
      <button type="button" @click="$emit('browse')">浏览目录</button>
    </header>
    <template v-if="context.groups.length">
      <section v-for="group in context.groups" :key="group.key" class="authoring-setting-group">
        <header><span>{{ group.label }}</span><small>{{ group.items.length }}</small></header>
        <button v-for="item in group.items" :key="item.id" type="button" class="authoring-setting-row" :class="{ active: selectedId === item.id }" @click="$emit('select', item.id)">
          <span class="authoring-setting-row__signal" aria-hidden="true"></span>
          <span class="authoring-setting-row__body">
            <strong>{{ item.name }}</strong>
            <small>{{ ({ character: '人物', location: '地点', rule: '规则', style: '文风', forbidden: '禁则', general: '通用', lore: '背景' })[item.type] || item.type }} · {{ item.reasons.join(' · ') }}</small>
            <span>{{ item.currentUse?.excerpt || item.content || '暂无正文' }}</span>
          </span>
          <span class="authoring-setting-row__arrow" aria-hidden="true">›</span>
        </button>
      </section>
    </template>
    <div v-else class="authoring-setting-empty">
      <strong>这里还没有命中的设定</strong>
      <p>在正文中移动光标，或从目录中主动查找。</p>
      <button type="button" @click="$emit('browse')">打开设定目录</button>
    </div>
  </section>
</template>
