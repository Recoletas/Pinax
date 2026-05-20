<template>
  <aside class="side-panel" aria-label="二级导航">
    <header class="side-panel-head">
      <h2 class="side-panel-title">{{ title }}</h2>
    </header>

    <div class="side-panel-list">
      <button
        v-for="item in items"
        :key="item.routeName"
        class="side-link"
        :class="{ active: item.routeName === activeRouteName }"
        type="button"
        @click="$emit('select', item.routeName)"
      >
        <span class="side-link-label">{{ item.label }}</span>
        <span class="side-link-desc">{{ item.description }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '模块'
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

defineEmits(['select'])
</script>

<style scoped>
.side-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
}

.side-panel-head {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
}

.side-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.side-panel-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-link {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 8px 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.side-link:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.side-link.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
}

.side-link-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.side-link-desc {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.8;
  margin-top: 2px;
}
</style>
