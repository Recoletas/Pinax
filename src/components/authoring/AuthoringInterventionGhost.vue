<template>
  <section class="authoring-intervention-ghost" data-test="intervention-ghost" aria-label="条件排演草稿">
    <header>
      <div>
        <strong>排演草稿</strong>
        <span>{{ currentGhost?.status === 'stale' ? '依据已变化，仅供查看' : '独立编辑，不会写入正文' }}</span>
      </div>
      <button type="button" aria-label="关闭排演草稿" @click="emit('close')">关闭</button>
    </header>

    <nav aria-label="切换修改位置">
      <button
        v-for="(ghost, index) in ghosts"
        :key="ghost.id"
        type="button"
        :aria-current="ghost.id === activeGhostId ? 'true' : undefined"
        @click="emit('select', ghost.id)"
      >
        <span>{{ index + 1 }}</span>
        <strong>{{ ghost.role === 'intervention' ? '原条件' : ghost.title }}</strong>
        <em>{{ ghost.status === 'stale' ? '已过期' : '草稿' }}</em>
      </button>
    </nav>

    <div v-if="currentGhost" class="authoring-intervention-ghost__editor">
      <p>{{ currentGhost.title }}</p>
      <textarea
        :value="currentGhost.text"
        :readonly="currentGhost.status === 'stale'"
        aria-label="编辑当前排演草稿"
        @input="emit('update', { ghostId: currentGhost.id, text: $event.target.value })"
        @keydown="handleKeydown"
      ></textarea>
      <footer>
        <span>{{ footerMessage }}</span>
        <div>
          <button v-if="persistPendingGhostId === currentGhost.id" type="button" :disabled="adoptingGhostId === currentGhost.id" data-test="intervention-retry-persist" @click="emit('retry-persist', currentGhost.id)">{{ adoptingGhostId === currentGhost.id ? '正在保存' : '重试保存' }}</button>
          <template v-else>
            <button type="button" :disabled="retryingGhostId === currentGhost.id || adoptingGhostId === currentGhost.id" @click="emit('retry', currentGhost.id)">{{ retryingGhostId === currentGhost.id ? '正在重试' : '重新生成此处' }}</button>
            <button type="button" :disabled="adoptingGhostId === currentGhost.id" @click="emit('discard', currentGhost.id)">放弃此处</button>
            <button v-if="batchCount > 1" type="button" :disabled="Boolean(adoptingGhostId)" data-test="intervention-adopt-all" @click="emit('adopt-all')">{{ batchBusy ? '正在采用' : `采用全部 ${batchCount} 处` }}</button>
            <button type="button" class="is-primary" :disabled="currentGhost.status !== 'fresh' || Boolean(adoptingGhostId)" data-test="intervention-adopt" @click="emit('adopt', currentGhost.id)">{{ adoptingGhostId === currentGhost.id ? '正在保存' : '采用此处' }}</button>
          </template>
        </div>
      </footer>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ghosts: { type: Array, default: () => [] },
  activeGhostId: { type: String, default: '' },
  retryingGhostId: { type: String, default: '' },
  adoptingGhostId: { type: String, default: '' },
  batchCount: { type: Number, default: 0 },
  batchBusy: Boolean,
  persistPendingGhostId: { type: String, default: '' },
  persistError: { type: String, default: '' }
})
const emit = defineEmits(['select', 'update', 'retry', 'discard', 'adopt', 'adopt-all', 'retry-persist', 'close'])
const currentGhost = computed(() => props.ghosts.find((ghost) => ghost.id === props.activeGhostId) || props.ghosts[0] || null)
const footerMessage = computed(() => {
  if (props.persistPendingGhostId === currentGhost.value?.id) return props.persistError || '正文修改已保留，只需重试保存。'
  if (props.persistError) return props.persistError
  if (currentGhost.value?.status === 'stale') return '重新核对后才能生成新草稿'
  return '只采用这一处；其他排演草稿不受影响'
})

function handleKeydown(event) {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}
</script>

<style scoped>
.authoring-intervention-ghost {
  width: 100%;
  max-width: 100%;
  padding: 13px 12px 11px 36px;
  border-block: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);
  background: color-mix(in srgb, var(--surface-workbench-raised) 42%, transparent);
  color: var(--text-primary);
  font-family: var(--font-sans, sans-serif);
}
.authoring-intervention-ghost > header,
.authoring-intervention-ghost footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.authoring-intervention-ghost > header > div { display: flex; min-width: 0; align-items: baseline; gap: 9px; }
.authoring-intervention-ghost > header strong { font-size: 12px; font-weight: 650; }
.authoring-intervention-ghost > header span,
.authoring-intervention-ghost footer span { color: var(--text-secondary); font-size: 10px; }
.authoring-intervention-ghost button { min-height: 32px; padding: 0; border: 0; border-bottom: 1px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; }
.authoring-intervention-ghost > nav { display: flex; gap: 14px; margin-top: 8px; overflow-x: auto; border-bottom: 1px solid var(--border-subtle); }
.authoring-intervention-ghost > nav button { display: flex; flex: 0 0 auto; align-items: center; gap: 5px; margin-bottom: -1px; font-size: 10px; }
.authoring-intervention-ghost > nav button > span { color: var(--text-tertiary, var(--text-secondary)); }
.authoring-intervention-ghost > nav button > strong { max-width: 18ch; overflow: hidden; color: inherit; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.authoring-intervention-ghost > nav button > em { color: var(--text-tertiary, var(--text-secondary)); font-style: normal; }
.authoring-intervention-ghost > nav button[aria-current="true"] { border-bottom-color: var(--accent-primary); color: var(--text-primary); }
.authoring-intervention-ghost__editor > p { margin: 9px 0 3px; color: var(--text-secondary); font-size: 10px; }
.authoring-intervention-ghost textarea {
  display: block;
  width: 100%;
  min-height: 112px;
  padding: 7px 0;
  resize: vertical;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--notebook-font-family, var(--font-serif, serif));
  font-size: 15px;
  line-height: var(--notebook-line-height, 1.9);
  outline: none;
}
.authoring-intervention-ghost textarea[readonly] { color: var(--text-secondary); }
.authoring-intervention-ghost footer { border-top: 1px solid var(--border-subtle); }
.authoring-intervention-ghost footer button { color: var(--text-primary); }
.authoring-intervention-ghost footer button.is-primary { border-bottom-color: var(--accent-primary); color: var(--accent-primary); font-weight: 650; }
.authoring-intervention-ghost footer > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px 14px; }
.authoring-intervention-ghost footer button:disabled { opacity: .46; cursor: default; }
@media (max-width: 720px) {
  .authoring-intervention-ghost {
    position: fixed;
    z-index: var(--z-workbench-sheet);
    inset-inline: 0;
    inset-block-end: 44px;
    max-height: min(62vh, 480px);
    padding: 14px 16px 12px;
    overflow-y: auto;
    border-block-end: 0;
    background: var(--surface-workbench-raised);
    box-shadow: 0 -12px 32px color-mix(in srgb, #000 16%, transparent);
  }
  .authoring-intervention-ghost button { min-height: 44px; }
  .authoring-intervention-ghost > nav { gap: 18px; }
  .authoring-intervention-ghost textarea { min-height: 96px; }
  .authoring-intervention-ghost footer { align-items: flex-end; }
  .authoring-intervention-ghost footer span { max-width: 24ch; line-height: 1.5; }
}
</style>
