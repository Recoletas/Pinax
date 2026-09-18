<template>
  <header class="settings-context-bar" data-test="settings-context-bar" :data-worldbook-id="selectedId" :data-worldbook-name="activeWorldbook?.name || ''" :data-project-locked="projectLocked">
    <div class="context-main">
      <span class="context-kicker">{{ projectLocked ? (projectIdentity ? '当前作品' : '关联资料') : '世界书' }}</span>
      <strong v-if="projectLocked && projectIdentity" class="context-project-name" :title="projectLabel">{{ projectLabel || '当前作品' }}</strong>
      <select
        v-else-if="worldbooksIndex.length"
        class="context-worldbook-select"
        :value="selectedId"
        :disabled="disabled || projectLocked"
        :aria-label="projectLocked ? '当前书稿关联的世界书（回工作台更换关联）' : '选择当前世界书'"
        :title="projectLocked ? '世界书由《' + projectLabel + '》的关联决定；回工作台可更换关联' : ''"
        @change="onChange"
      >
        <option v-for="worldbook in worldbooksIndex" :key="worldbook.id" :value="worldbook.id">
          {{ worldbook.name }}
        </option>
      </select>
      <strong v-else class="context-worldbook-empty">{{ activeWorldbook?.name || emptyLabel }}</strong>
      <span v-if="routeMismatchNotice" class="context-mismatch" role="status">{{ routeMismatchNotice }}</span>
    </div>

    <div v-if="showMeta" class="context-meta" aria-label="设定页信息">
      <span class="context-meta-item"><i aria-hidden="true"></i>{{ metaLabel }}</span>
      <span class="context-meta-divider" aria-hidden="true"></span>
      <span class="context-meta-item">{{ saveLabel }}</span>
    </div>

    <slot name="actions" />
  </header>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  worldbooksIndex: { type: Array, default: () => [] },
  activeWorldbook: { type: Object, default: null },
  modelValue: { type: [String, Number], default: '' },
  metaLabel: { type: String, default: '' },
  saveLabel: { type: String, default: '自动保存' },
  emptyLabel: { type: String, default: '尚未选择世界书' },
  showMeta: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // 项目模式：世界书由书稿关联决定，选择器只读；显示所属书稿名。
  projectLabel: { type: String, default: '' },
  projectLocked: { type: Boolean, default: false },
  projectIdentity: { type: Boolean, default: true },
  routeMismatchNotice: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const selectedId = computed(() => String(props.modelValue || props.activeWorldbook?.id || ''))
const metaLabel = computed(() => props.metaLabel || `${props.worldbooksIndex.length} 本世界书`)

function onChange(event) {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.settings-context-bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px clamp(16px, 3vw, 42px);
  border-right: 1px solid color-mix(in srgb, var(--archive-olive) 15%, transparent);
  background: transparent;
  flex-shrink: 0;
}

.context-main,
.context-meta {
  display: flex;
  align-items: center;
  min-width: 0;
}

.context-main {
  gap: 10px;
}

.context-meta {
  gap: 10px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.context-meta-divider {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 60%, var(--border));
}

.context-meta-item i {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 10%, transparent);
}

.context-kicker {
  color: var(--text-secondary);
  font-size: 9px;
  letter-spacing: 0.1em;
  line-height: 1;
}

.context-mismatch {
  max-width: 40vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 11px;
}

.context-worldbook-select,
.context-worldbook-empty {
  max-width: min(30vw, 260px);
  min-width: 120px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
}

.context-worldbook-select {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 44%, var(--border));
  border-radius: 0;
  background: transparent;
  padding: 6px 22px 6px 2px;
  cursor: pointer;
}

.context-worldbook-select:disabled {
  cursor: default;
  opacity: 0.7;
}

.context-worldbook-empty {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .settings-context-bar {
    min-height: 46px;
    gap: 10px;
    padding-block: 6px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 13%, transparent);
  }

  .context-main {
    width: 100%;
  }

  .context-meta-divider,
  .context-meta-item:last-child {
    display: none;
  }

  .context-worldbook-select,
  .context-worldbook-empty {
    max-width: 48vw;
    min-width: 104px;
    font-size: 14px;
  }
}
.settings-context-bar { min-height: var(--workspace-toolbar-height, 46px); gap: 16px; padding: 4px 20px; border-right: 0; }
.context-main { flex: 1; gap: 14px; }
.context-project-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 550; color: var(--text-primary); max-width: min(45vw, 420px); }
.context-kicker { white-space: nowrap; font: inherit; font-size: 13px; letter-spacing: 0; }
.context-worldbook-select { min-width: 0; max-width: min(42vw, 360px); padding: 6px 24px 6px 8px; font-family: inherit; font-size: 13px; font-weight: 500; border: 1px solid var(--archive-paper-strong); border-radius: 5px; background: var(--archive-paper); }
.context-worldbook-select:disabled { opacity: 1; border-color: transparent; background: transparent; }
.context-mismatch { font-size: 13px; }
@media (max-width: 760px) { .settings-context-bar { padding: 10px 16px; flex-wrap: wrap; gap: 8px; } .context-main { flex: 1; width: auto; } .context-kicker { display: none; } .context-worldbook-select { max-width: 56vw; font-size: 14px; } }
</style>
