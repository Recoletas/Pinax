<template>
  <div v-if="open" class="kbd-hints-backdrop" @click.self="close">
    <div class="kbd-hints" role="dialog" aria-modal="true" aria-label="结构化设定快捷键">
      <div class="kbd-hints-head">
        <h2>快捷键</h2>
        <button class="icon-btn" aria-label="关闭" @click="close">×</button>
      </div>
      <ul class="kbd-hints-list">
        <li><kbd>?</kbd> 显示 / 隐藏本面板</li>
        <li><kbd>Esc</kbd> 关闭</li>
        <li><kbd>Ctrl/⌘</kbd> + <kbd>S</kbd> 立即保存（flush 全部待保存字段）</li>
        <li><kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> 字段内撤销（在字段内时）</li>
        <li><kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> 字段内重做（在字段内时）</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])
function close() { emit('close') }
</script>

<style scoped>
.kbd-hints-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, #000 26%, transparent);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 1000;
}

.kbd-hints {
  width: min(460px, 100%);
  background:
    radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%),
    color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 24px 58px color-mix(in srgb, #000 28%, transparent);
}

.kbd-hints-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.kbd-hints-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--text-primary);
}

.icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
  line-height: 1;
}

.icon-btn:hover {
  background: var(--surface-raised);
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  color: var(--text-primary);
}

.icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.kbd-hints-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 13px;
  color: var(--text-secondary);
}

.kbd-hints-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 62%, transparent);
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 2px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: color-mix(in srgb, var(--surface-raised) 90%, var(--bg-primary));
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 6px;
  color: var(--text-primary);
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 14%, transparent) inset;
}
</style>
