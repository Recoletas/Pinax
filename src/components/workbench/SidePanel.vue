<script setup>
defineProps({
  title: {
    type: String,
    default: ''
  },
  items: {
    type: Array,
    default: () => []
  },
  activeRouteName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select'])

function handleSelect(routeName) {
  emit('select', routeName)
}
</script>

<template>
  <div class="side-panel">
    <div class="panel-header">
      <h3 class="panel-title">{{ title }}</h3>
    </div>
    <div class="panel-items">
      <button
        v-for="item in items"
        :key="item.routeName"
        class="panel-item"
        :class="{ active: activeRouteName === item.routeName }"
        @click="handleSelect(item.routeName)"
      >
        <span class="item-label">{{ item.label }}</span>
        <span class="item-description">{{ item.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.side-panel {
  width: 176px;
  height: 100%;
  background: var(--bg-secondary, #16162a);
  border-right: 1px solid var(--border-color, #2d2d44);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px 12px 12px;
  border-bottom: 1px solid var(--border-color, #2d2d44);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #fff);
  margin: 0;
}

.panel-items {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.panel-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #bbb);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.panel-item:hover {
  background: var(--bg-hover, #2d2d44);
  color: var(--text-primary, #fff);
}

.panel-item.active {
  background: var(--accent-color, #6366f1);
  color: #fff;
}

.item-label {
  font-size: 13px;
  font-weight: 500;
}

.item-description {
  font-size: 11px;
  opacity: 0.7;
}
</style>