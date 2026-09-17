<template>
  <div>
    <div
      class="tree-row workspace-nav-item workspace-nav-item--tree"
      :class="{ active: activeId === node.id }"
      :style="{ paddingLeft: (depth * 12 + 4) + 'px' }"
      @click="$emit('select', node.id)"
    >
      <button
        v-if="hasChildren"
        class="expand-btn"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? '折叠' : '展开'} ${node.name}`"
        @click.stop="expanded = !expanded"
      >
        <svg v-if="expanded" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <span v-else class="expand-spacer"></span>

      <svg class="node-icon" width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="7" cy="7" rx="2.5" ry="5.5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="1.5" y1="5" x2="12.5" y2="5" stroke="currentColor" stroke-width="1"/><line x1="1.5" y1="9" x2="12.5" y2="9" stroke="currentColor" stroke-width="1"/></svg>

      <input
        v-if="editing"
        ref="editInput"
        class="edit-input"
        v-model="editName"
        @blur="commitRename"
        @keydown.enter.prevent="commitRename(); restoreSelectionFocus()"
        @keydown.escape.stop.prevent="cancelRename"
        @click.stop
      />
      <button v-else class="node-name workspace-nav-label" ref="nodeButton" type="button" :aria-pressed="activeId === node.id" :title="node.name" @click.stop="$emit('select', node.id)">{{ node.name }}</button>

      <div class="row-actions">
        <button class="icon-btn-xxs" @click.stop="startEdit" title="重命名">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn-xxs" @click.stop="$emit('add-child', node.id)" title="新建子世界">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="icon-btn-xxs danger" @click.stop="$emit('delete', node.id)" title="删除">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    </div>

    <div v-if="hasChildren && expanded">
      <WorldTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :active-id="activeId"
        @select="$emit('select', $event)"
        @add-child="$emit('add-child', $event)"
        @delete="$emit('delete', $event)"
        @rename="(id, name) => $emit('rename', id, name)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  activeId: { type: String, default: null }
})

const emit = defineEmits(['select', 'add-child', 'delete', 'rename'])

const expanded = ref(true)
const editing = ref(false)
const editName = ref('')
const editInput = ref(null)
const nodeButton = ref(null)

const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

function startEdit() {
  editName.value = props.node.name
  editing.value = true
  nextTick(() => editInput.value?.focus())
}

function commitRename() {
  if (!editing.value) return
  editing.value = false
  if (editName.value.trim() && editName.value !== props.node.name) {
    emit('rename', props.node.id, editName.value.trim())
  }
}

function restoreSelectionFocus() {
  nextTick(() => nodeButton.value?.focus())
}

function cancelRename() {
  editing.value = false
  editName.value = props.node.name
  restoreSelectionFocus()
}
</script>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 4px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--text-secondary);
}

.tree-row:hover {
  background: var(--bg-hover);
}

.tree-row.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.expand-btn {
  width: 24px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 2px;
  flex-shrink: 0;
}

.expand-btn:hover {
  background: var(--bg-primary);
}

.expand-spacer {
  width: 24px;
  flex-shrink: 0;
}

.node-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.node-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  padding: 2px 4px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 3px;
  outline: none;
}

.row-actions {
  display: flex;
  opacity: 0;
  pointer-events: none;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.tree-row:hover .row-actions,
.tree-row:focus-within .row-actions {
  opacity: 1;
  pointer-events: auto;
}

.icon-btn-xxs {
  width: 24px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
  transition: color 120ms, background-color 120ms;
}

.icon-btn-xxs:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.icon-btn-xxs.danger:hover {
  color: var(--danger);
}

.tree-row button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tree-row button:active { background: var(--nav-focused); }
.node-icon { width: 16px; height: 16px; }
@media (pointer: coarse) {
  .row-actions { opacity: 1; pointer-events: auto; }
  .tree-row button { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .tree-row, .icon-btn-xxs { transition: none; }
}
</style>
