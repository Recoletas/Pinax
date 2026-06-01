<template>
  <div v-if="collapsed" class="sidebar-collapsed">
    <button class="icon-btn-xs" @click="collapsed = false" title="展开世界树">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
    </button>
    <div class="divider"></div>
    <button
      v-for="node in tree"
      :key="node.id"
      class="icon-node"
      :class="{ active: activeWorldId === node.id }"
      @click="setActiveWorld(node.id)"
      :title="node.name"
    ><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1a6 6 0 100 12A6 6 0 007 1zm0 1.2c.5 0 1.2.8 1.5 2.3H5.5c.3-1.5 1-2.3 1.5-2.3zM5.5 5.5h3c.1.5.1 1.1.1 1.7H5.4c0-.6 0-1.2.1-1.7zm-.1 2.8h3.2c0 .6-.1 1.1-.2 1.6-.3 1.3-.9 2-1.4 2-1.7 0-2.6-2.3-2.7-3.6h1.1zM3.5 4.3c-.3.6-.5 1.4-.5 2.2 0 .3 0 .6.1.9h1.2c-.1-.5-.1-1.1-.1-1.7.1-.5.2-.9.4-1.4H3.5zm0 4.2c.3.7.7 1.3 1.2 1.7-.1-.2-.2-.5-.2-.9 0-.4 0-.8.1-1.2H3.5c0 .2 0 .3-.1.4h.1zm4.9-2.5c0 .6 0 1.2-.1 1.7h1.2c.1-.3.1-.6.1-.9 0-.8-.2-1.6-.5-2.2-.2.5-.4.9-.5 1.4h-.2z"/></svg></button>
    <button class="icon-btn-xs accent" @click="addChild(null)" title="新建世界">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  </div>

  <div v-else class="sidebar-expanded">
    <div class="sidebar-header">
      <span class="sidebar-title">世界树</span>
      <div class="header-actions">
        <button class="icon-btn-xs" @click="addChild(null)" title="新建根世界">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="icon-btn-xs" @click="collapsed = true" title="折叠">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        </button>
      </div>
    </div>

    <div class="sidebar-tree">
      <div v-if="tree.length === 0" class="empty-hint">暂无世界</div>
      <TreeItem
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :depth="0"
        :active-id="activeWorldId"
        @select="setActiveWorld"
        @add-child="addChild"
        @delete="handleDelete"
        @rename="handleRename"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import TreeItem from './WorldTreeItem.vue'

const geoStore = useGeographyStore()
const { worldTree: tree, activeWorldId } = storeToRefs(geoStore)

const collapsed = ref(false)

function setActiveWorld(id) {
  geoStore.setActiveWorld(id)
}

function addChild(parentId) {
  const siblingCount = geoStore.worldNodes.filter(n => n.parentId === parentId).length
  geoStore.createNode({
    parentId,
    name: parentId ? '子位面' : '新世界',
    description: '',
    sortOrder: siblingCount,
    icon: 'world',
  })
}

function handleDelete(id) {
  const node = geoStore.worldNodes.find(n => n.id === id)
  if (node && confirm(`确定删除「${node.name}」及其所有子世界吗？`)) {
    geoStore.deleteNode(id)
  }
}

function handleRename(id, name) {
  geoStore.updateNode(id, { name })
}
</script>

<style scoped>
.sidebar-collapsed {
  width: 40px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.sidebar-expanded {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sidebar-tree {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
}

.empty-hint {
  padding: 16px 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 10px;
}

.divider {
  width: 20px;
  border-top: 1px solid var(--border);
  margin: 4px 0;
}

.icon-node {
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.icon-node:hover {
  background: var(--bg-hover);
}

.icon-node.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.icon-btn-xs {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-btn-xs:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn-xs.accent:hover {
  color: var(--accent);
}
</style>
