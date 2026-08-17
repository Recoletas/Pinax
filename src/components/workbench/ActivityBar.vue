<template>
  <nav class="activity-bar" aria-label="工作区导航">
    <div v-for="item in items" :key="item.key" class="activity-group">
      <button
        class="activity-btn"
        :class="{ active: item.key === activeKey }"
        type="button"
        :aria-current="item.key === activeKey ? 'page' : undefined"
        @click="$emit('select', item.key)"
      >
        <span class="activity-icon" aria-hidden="true">
          <WorkbenchIcon :name="item.icon" :size="17" />
        </span>
        <span class="activity-label">{{ item.label }}</span>
      </button>

      <div v-if="item.key === activeKey && activePanel.items?.length" class="activity-subnav" :aria-label="`${item.label}子导航`">
        <button
          v-for="child in activePanel.items"
          :key="child.routeName"
          class="activity-subnav__item"
          :class="{ active: child.routeName === activeRouteName }"
          type="button"
          :aria-current="child.routeName === activeRouteName ? 'page' : undefined"
          @click="$emit('select-route', child.routeName)"
        >
          <span class="activity-subnav__mark" aria-hidden="true"></span>
          <span>{{ child.label }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import WorkbenchIcon from './WorkbenchIcon.vue'

defineProps({
  items: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  activeRouteName: { type: String, default: '' },
  activePanel: { type: Object, default: () => ({ items: [] }) }
})

defineEmits(['select', 'select-route'])
</script>

<style scoped>
.activity-bar {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding: 10px 12px 18px;
}

.activity-group {
  min-width: 0;
}

.activity-btn,
.activity-subnav__item {
  width: 100%;
  display: flex;
  align-items: center;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font: inherit;
}

.activity-btn {
  min-height: 44px;
  gap: 11px;
  padding: 0 12px;
  border-left: 2px solid transparent;
  font-size: 14px;
  font-weight: 650;
}

.activity-btn:hover,
.activity-btn.active {
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-olive) 7%, transparent);
}

.activity-btn.active {
  border-left-color: color-mix(in srgb, var(--archive-rose) 76%, var(--archive-ink));
}

.activity-icon {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 22px;
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
}

.activity-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-subnav {
  display: grid;
  gap: 1px;
  margin: 0 0 5px 33px;
  padding: 2px 0 3px 12px;
  border-left: 1px solid color-mix(in srgb, var(--archive-olive) 20%, transparent);
}

.activity-subnav__item {
  min-height: 36px;
  gap: 9px;
  padding: 0 9px;
  color: color-mix(in srgb, var(--archive-ink-soft) 88%, transparent);
  font-size: 12px;
}

.activity-subnav__item:hover,
.activity-subnav__item.active {
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-olive) 6%, transparent);
}

.activity-subnav__item.active {
  font-weight: 650;
}

.activity-subnav__mark {
  width: 4px;
  height: 4px;
  flex: 0 0 4px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--archive-olive) 42%, transparent);
}

.activity-subnav__item.active .activity-subnav__mark {
  background: color-mix(in srgb, var(--archive-rose) 80%, var(--archive-ink));
}

.activity-btn:focus-visible,
.activity-subnav__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive) 70%, transparent);
  outline-offset: -2px;
}
</style>
