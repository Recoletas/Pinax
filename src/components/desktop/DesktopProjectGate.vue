<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { useDesktopProject } from '../../composables/useDesktopProject'

const primaryAction = ref(null)
const migrationAction = ref(null)
const migrationConfirmAction = ref(null)
const project = useDesktopProject(window)

async function focusPrimaryAction() {
  await nextTick()
  primaryAction.value?.focus({ preventScroll: true })
}

watch(
  () => [project.isDesktop, project.initializing.value, project.hasActiveProject.value],
  ([isDesktop, initializing, active]) => {
    if (isDesktop && !initializing && !active) void focusPrimaryAction()
  }
)

onMounted(async () => {
  await project.initialize()
  if (!project.hasActiveProject.value) await focusPrimaryAction()
})

async function cancelMigration() {
  if (!await project.cancelMigration()) return
  if (project.migrationReport.value) return
  await nextTick()
  migrationAction.value?.focus({ preventScroll: true })
}

async function previewMigration() {
  const preview = await project.chooseAndPreviewMigration()
  if (!preview) return
  await nextTick()
  migrationConfirmAction.value?.focus({ preventScroll: true })
}

function migrationIssues(report) {
  return (report?.records || []).filter(record => ['detached', 'orphaned', 'rejected'].includes(record.status))
}
</script>

<template>
  <slot v-if="!project.isDesktop || project.hasActiveProject.value" />
  <main
    v-else
    class="desktop-project-gate"
    data-test="desktop-project-gate"
    aria-labelledby="desktop-project-title"
  >
    <section class="desktop-project-gate__content" :aria-busy="project.busy.value || project.initializing.value">
      <p class="desktop-project-gate__eyebrow">Pinax · 本地写作空间</p>
      <h1 id="desktop-project-title">打开一部作品，继续写作</h1>
      <p class="desktop-project-gate__summary">正文与资料保存在你选择的项目文件夹中。</p>

      <div class="desktop-project-gate__actions">
        <button
          ref="primaryAction"
          type="button"
          class="desktop-project-gate__primary"
          data-test="desktop-project-create"
          :disabled="project.busy.value || project.initializing.value"
          @click="project.chooseAndCreate"
        >新建项目</button>
        <button
          type="button"
          class="desktop-project-gate__secondary"
          data-test="desktop-project-open"
          :disabled="project.busy.value || project.initializing.value"
          @click="project.chooseAndOpen"
        >打开项目</button>
      </div>

      <button
        v-if="project.canMigrate && !project.migrationReport.value"
        ref="migrationAction"
        type="button"
        class="desktop-project-gate__migrate"
        data-test="desktop-project-migrate"
        :disabled="project.busy.value || project.initializing.value"
        @click="previewMigration"
      >迁移浏览器旧项目</button>

      <section
        v-if="project.migrationReport.value"
        class="desktop-project-gate__migration"
        data-test="desktop-migration-report"
        aria-labelledby="desktop-migration-title"
        aria-live="polite"
      >
        <h2 id="desktop-migration-title">迁移检查完成</h2>
        <p class="desktop-project-gate__migration-summary">
          共 {{ project.migrationReport.value.total }} 项 ·
          可转换 {{ project.migrationReport.value.counts.converted }} ·
          可保留 {{ project.migrationReport.value.counts.supported }} ·
          脱离来源 {{ project.migrationReport.value.counts.detached }} ·
          孤立 {{ project.migrationReport.value.counts.orphaned }} ·
          拒绝 {{ project.migrationReport.value.counts.rejected }}
        </p>
        <ul
          v-if="migrationIssues(project.migrationReport.value).length"
          class="desktop-project-gate__migration-issues"
          data-test="desktop-migration-issues"
        >
          <li v-for="record in migrationIssues(project.migrationReport.value)" :key="record.sourceRecordId">
            <code>{{ record.sourceRecordId }}</code>
            <span>{{ record.reason || record.status }}</span>
          </li>
        </ul>
        <div class="desktop-project-gate__migration-actions">
          <button
            ref="migrationConfirmAction"
            type="button"
            class="desktop-project-gate__primary"
            data-test="desktop-migration-confirm"
            :disabled="project.busy.value"
            @click="project.confirmMigration"
          >选择父目录并迁移</button>
          <button
            type="button"
            class="desktop-project-gate__secondary"
            data-test="desktop-migration-cancel"
            :disabled="project.busy.value && !project.migrationImporting.value"
            @click="cancelMigration"
          >{{ project.migrationImporting.value ? '停止迁移' : '取消' }}</button>
        </div>
      </section>

      <p v-if="project.initializing.value" class="desktop-project-gate__status" role="status">正在检查本地项目…</p>
      <div v-else-if="project.error.value" class="desktop-project-gate__repair" role="alert">
        <p>{{ project.error.value.message }}</p>
        <p class="desktop-project-gate__path" v-if="project.lockedDirectory.value">{{ project.lockedDirectory.value }}</p>
        <button
          v-if="project.lockedDirectory.value"
          type="button"
          class="desktop-project-gate__readonly"
          data-test="desktop-project-readonly"
          :disabled="project.busy.value"
          @click="project.openReadOnly"
        >以只读方式打开</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.desktop-project-gate {
  min-height: var(--app-viewport-height, 100vh);
  display: grid;
  place-items: center;
  padding: clamp(24px, 6vw, 72px);
  overflow-x: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

.desktop-project-gate__content {
  width: min(100%, 620px);
  padding: clamp(28px, 5vw, 56px) 0;
  border-block: 1px solid var(--border);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 100vmax var(--bg-secondary);
  clip-path: inset(0 -100vmax);
}

.desktop-project-gate__eyebrow {
  margin: 0 0 14px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.desktop-project-gate h1 {
  max-width: 12ch;
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(34px, 6vw, 58px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.02em;
}

.desktop-project-gate__summary {
  max-width: 42ch;
  margin: 20px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.desktop-project-gate__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 34px;
}

.desktop-project-gate button {
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  font: 600 13px/1 var(--font-sans);
  cursor: pointer;
  transition: color var(--motion-fast) ease, background var(--motion-fast) ease, opacity var(--motion-fast) ease;
}

.desktop-project-gate button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.desktop-project-gate button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.desktop-project-gate__primary {
  border-color: var(--accent) !important;
  background: var(--accent);
  color: var(--accent-text);
}

.desktop-project-gate__secondary,
.desktop-project-gate__readonly,
.desktop-project-gate__migrate {
  background: transparent;
  color: var(--text-primary);
}

.desktop-project-gate__secondary:hover,
.desktop-project-gate__readonly:hover,
.desktop-project-gate__migrate:hover {
  background: var(--bg-hover);
}

.desktop-project-gate__status,
.desktop-project-gate__repair {
  margin: 20px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.desktop-project-gate__repair p {
  margin: 0;
}

.desktop-project-gate__path {
  margin-top: 6px !important;
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.desktop-project-gate__readonly {
  margin-top: 12px;
}

.desktop-project-gate__migrate {
  min-height: 32px !important;
  margin-top: 14px;
  padding-inline: 0 !important;
  border-color: transparent !important;
  color: var(--text-secondary);
  font-weight: 500 !important;
}

.desktop-project-gate__migration {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.desktop-project-gate__migration h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
}

.desktop-project-gate__migration-summary {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.desktop-project-gate__migration-issues {
  max-height: 124px;
  margin: 12px 0 0;
  padding: 0;
  overflow: auto;
  color: var(--text-secondary);
  font-size: 12px;
  list-style: none;
}

.desktop-project-gate__migration-issues li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-block: 5px;
  border-bottom: 1px solid var(--border-subtle, var(--border));
}

.desktop-project-gate__migration-issues code {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.desktop-project-gate__migration-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 768px) {
  .desktop-project-gate {
    place-items: start stretch;
    padding: 18vh 20px 32px;
  }

  .desktop-project-gate__content {
    padding-block: 28px;
  }

  .desktop-project-gate h1 {
    font-size: clamp(34px, 11vw, 46px);
  }

  .desktop-project-gate__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .desktop-project-gate__migration-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .desktop-project-gate__migration-issues li {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .desktop-project-gate button {
    width: 100%;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-project-gate button {
    transition: none;
  }
}
</style>
