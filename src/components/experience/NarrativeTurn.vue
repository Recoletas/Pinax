<script setup>
import NarrativeBlock from './NarrativeBlock.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  message: { type: Object, required: true },
  index: { type: Number, required: true },
  blocks: { type: Array, default: () => [] },
  editing: { type: Boolean, default: false },
  opening: { type: Boolean, default: false },
  showTurnSpeaker: { type: Boolean, default: false },
  turnSpeaker: { type: String, default: '' },
  compressionComplete: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: true },
  renderContent: { type: Function, required: true },
  // R1b：该 user 消息之后是否有其它分支的 assistant 回复（显示"切换回复版本"按钮）
  hasCandidates: { type: Boolean, default: false },
  // C4：该 assistant 消息是否有多段续接（显示"撤销本次续接"按钮）
  canUndoExtension: { type: Boolean, default: false }
})

defineEmits(['body-click', 'editor-keydown', 'save-edit', 'cancel-edit', 'edit', 'delete', 'regenerate', 'switch-candidate', 'undo-extension'])

function shouldShowBlockSpeaker(block, index) {
  if (!block?.speaker) return false
  if (index === 0) return true
  const previous = props.blocks[index - 1]
  if (!previous?.speaker) return true
  return previous.speaker !== block.speaker
}
</script>

<template>
  <div class="prose" :class="[`prose--${message.role || 'assistant'}`, `prose--${message.role || 'assistant'}-role`, { 'compression-complete': compressionComplete, 'prose--opening': opening, 'prose--editing': editing }]" :data-global-index="index" :data-role="message.role">
    <span v-if="showTurnSpeaker" class="prose__speaker" :class="`prose__speaker--${message.role || 'assistant'}`">{{ turnSpeaker }}</span><span v-if="showTurnSpeaker" class="prose__sep" aria-hidden="true">&emsp;</span>
    <span v-if="editing" class="prose__editor" contenteditable="true" spellcheck="false" :data-editing-index="index" @keydown="$emit('editor-keydown', $event)" @click.stop></span>
    <div v-else class="prose__body" @click="$emit('body-click', $event)">
      <NarrativeBlock v-for="(block, blockIndex) in blocks" :key="block.id || `${index}-${blockIndex}`" :block="block" :show-speaker="shouldShowBlockSpeaker(block, blockIndex)" :render-content="renderContent" />
    </div>
    <span v-if="editing" class="prose__edit-actions">
      <button type="button" class="tavern-btn primary" @click="$emit('save-edit')">保存修改</button>
      <button type="button" class="tavern-btn" @click="$emit('cancel-edit')">取消</button>
    </span>
    <details v-if="!editing && canEdit" class="prose__actions" @click.stop>
      <summary class="prose__actions-trigger" aria-label="消息操作" title="消息操作">
        <WorkbenchIcon name="more" :size="15" />
      </summary>
      <span class="prose__actions-menu">
        <button type="button" class="prose__action" title="编辑内容" aria-label="编辑内容" @click="$emit('edit')"><WorkbenchIcon name="pencil" :size="13" /></button>
        <button v-if="canUndoExtension" type="button" class="prose__action prose__action--undo" title="撤销本次续接" aria-label="撤销本次续接" @click="$emit('undo-extension')"><WorkbenchIcon name="undo-extension" :size="13" /></button>
        <button type="button" class="prose__action prose__action--delete" title="删除" aria-label="删除消息" @click="$emit('delete')"><WorkbenchIcon name="trash" :size="13" /></button>
        <button v-if="message.role === 'user'" type="button" class="prose__action prose__action--regen" title="重写后续" aria-label="重写后续" @click="$emit('regenerate')"><WorkbenchIcon name="refresh" :size="13" /></button>
        <button v-if="message.role === 'user' && hasCandidates" type="button" class="prose__action prose__action--branch" title="切换回复版本" aria-label="切换回复版本" @click="$emit('switch-candidate')"><WorkbenchIcon name="network" :size="13" /></button>
      </span>
    </details>
  </div>
</template>

<style>
.prose {
  position: relative;
}

.prose--editing {
  padding: 10px 12px 12px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink-soft) 16%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink-soft) 16%, transparent);
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--archive-olive) 5%, var(--archive-paper-soft)),
    color-mix(in srgb, var(--archive-paper-soft) 52%, transparent) 76%,
    transparent
  );
}

.prose--editing::before {
  content: "";
  position: absolute;
  top: -1px;
  left: 12px;
  width: 36px;
  height: 2px;
  background: color-mix(in srgb, var(--archive-rose) 64%, var(--archive-gold-soft));
}

.prose__editor {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 3.2em;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft) 20%, transparent);
  border-radius: 2px;
  outline: none;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: var(--archive-ink);
  caret-color: var(--archive-olive-strong);
  font: inherit;
  line-height: inherit;
  text-indent: 0;
  white-space: pre-wrap;
  word-break: break-word;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.prose__editor:focus {
  border-color: color-mix(in srgb, var(--archive-olive) 56%, var(--archive-ink-soft));
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  box-shadow: 3px 0 0 color-mix(in srgb, var(--archive-rose) 34%, transparent) inset;
}

.prose__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 8px;
}

.prose__edit-actions .tavern-btn {
  min-height: 30px;
  padding: 3px 13px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft) 24%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 84%, var(--archive-ink-soft));
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
}

.prose__edit-actions .tavern-btn.primary {
  border-color: var(--archive-olive-strong);
  background: var(--archive-olive-strong);
  color: var(--archive-paper-soft);
}

.prose__edit-actions .tavern-btn:hover,
.prose__edit-actions .tavern-btn:focus-visible {
  border-color: var(--archive-olive);
  outline: none;
}

.prose__edit-actions .tavern-btn.primary:hover,
.prose__edit-actions .tavern-btn.primary:focus-visible {
  background: color-mix(in srgb, var(--archive-olive-strong) 86%, var(--archive-ink));
}

.prose__actions {
  position: absolute;
  top: -2px;
  right: -28px;
  z-index: var(--z-stage-cta);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.prose:hover .prose__actions,
.prose__actions:focus-within,
.prose__actions[open] {
  opacity: 1;
  pointer-events: auto;
}

.prose__actions-trigger {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink-soft) 64%, transparent);
  list-style: none;
  cursor: pointer;
}

.prose__actions-trigger::-webkit-details-marker {
  display: none;
}

.prose__actions-menu {
  position: absolute;
  top: 26px;
  right: 0;
  display: inline-flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft) 18%, transparent);
  background: var(--surface-workbench-raised, var(--archive-paper-soft));
  box-shadow: var(--shadow-workbench, 0 8px 20px var(--shadow));
}

.prose__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--archive-paper-soft) 92%, transparent);
  color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.prose__action:hover,
.prose__action:focus-visible {
  color: var(--archive-olive-strong);
  border-color: var(--archive-gold);
  background: var(--archive-paper);
  outline: none;
}

.prose__action--delete:hover,
.prose__action--delete:focus-visible {
  color: color-mix(in srgb, var(--archive-rose) 80%, var(--archive-ink));
  border-color: color-mix(in srgb, var(--archive-rose) 50%, transparent);
}

.prose__action--regen {
  color: color-mix(in srgb, var(--archive-olive) 80%, var(--archive-ink));
}

@media (max-width: 1100px) {
  .prose__actions {
    right: 0;
  }
}

@media (hover: none), (pointer: coarse) {
  .prose__actions {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prose__editor,
  .prose__actions,
  .prose__action {
    transition: none;
  }
}
</style>
