<template>
  <div class="settings-overlay" @click.self="close">
    <div ref="modalRef" class="settings-modal" role="dialog" aria-modal="true" aria-label="设置" @keydown="onModalKeydown">
      <header class="settings-modal__head">
        <h2>设置</h2>
        <button
          ref="closeBtnRef"
          class="settings-modal__close"
          type="button"
          aria-label="关闭"
          @click="close"
        >×</button>
      </header>

      <nav class="settings-tabs" role="tablist" aria-label="设置分区" @keydown="onTablistKeydown">
        <button
          v-for="tab in tabs"
          :id="`settings-tab-${tab.key}`"
          :key="tab.key"
          class="settings-tab"
          :class="{ active: activeSection === tab.key }"
          :data-test="`settings-tab-${tab.key}`"
          role="tab"
          :aria-selected="(activeSection === tab.key).toString()"
          :aria-controls="`settings-panel-${tab.key}`"
          :tabindex="activeSection === tab.key ? 0 : -1"
          type="button"
          @click="activeSection = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <div class="settings-modal__body">
        <!-- 全局锁定主题2亮色：外观（主题/明暗/缩放）配置区已移除（用户要求） -->
        <section
          v-show="activeSection === 'ai'"
          id="settings-panel-ai"
          class="settings-section"
          role="tabpanel"
          aria-label="AI 配置"
        >
          <ApiSettingsPanel />
        </section>

        <section
          v-show="activeSection === 'experience'"
          id="settings-panel-experience"
          class="settings-section"
          role="tabpanel"
          aria-label="体验"
        >
          <label class="settings-field-label" id="narrative-expansion-label">单次续写篇幅</label>
          <p class="settings-field-hint">仅影响之后的 AI 生成长度，不会改写已显示的正文。</p>
          <nav class="settings-tabs" role="group" aria-labelledby="narrative-expansion-label">
            <button
              v-for="level in expansion.levels"
              :key="level.key"
              class="settings-tab"
              :class="{ active: expansion.levelName === level.key }"
              :aria-pressed="(expansion.levelName === level.key).toString()"
              type="button"
              @click="expansion.setLevel(level.key)"
            >{{ level.label }}</button>
          </nav>

          <div class="settings-field-divider"></div>

          <label class="settings-field-label" id="reading-density-label">阅读密度</label>
          <p class="settings-field-hint">立即改变当前页面的字号、行高和段落间距。</p>
          <nav class="settings-tabs" role="group" aria-labelledby="reading-density-label">
            <button
              v-for="profile in readingProfileOptions"
              :key="profile.key"
              class="settings-tab"
              :class="{ active: readingProfile === profile.key }"
              :aria-pressed="(readingProfile === profile.key).toString()"
              type="button"
              @click="setReadingProfile(profile.key)"
            >{{ profile.label }}</button>
          </nav>
        </section>

        <section
          v-show="activeSection === 'storage'"
          id="settings-panel-storage"
          class="settings-section"
          role="tabpanel"
          aria-label="存储"
        >
          <div class="storage-summary" :class="storageHealth.level.value">
            <span class="storage-summary__pct">{{ storageHealth.percent.value }}%</span>
            <span class="storage-summary__bar">
              <span class="storage-summary__fill" :style="{ width: `${Math.min(storageHealth.percent.value, 100)}%` }"></span>
            </span>
            <span class="storage-summary__hint">
              {{ storageHealth.isCritical.value ? '请立即导出备份并清理' : storageHealth.isWarning.value ? '建议导出备份' : '存储充足' }}
            </span>
          </div>
          <p class="storage-lead">作品和创作记录保存在当前浏览器。换设备或清理浏览器之前，先导出一份备份。</p>
          <div class="storage-actions storage-actions--lead">
            <button
              class="settings-btn settings-btn--primary"
              type="button"
              data-test="backup-export-workspace-button"
              :disabled="workspaceBusy"
              @click="handleExportWorkspaceBackup"
            >
              {{ workspaceBusy ? '正在导出完整工作区...' : '导出完整工作区（ZIP）' }}
            </button>
            <button class="settings-btn" type="button" data-test="backup-export-button" @click="handleExportBackup">导出轻量备份（JSON）</button>
            <button class="settings-btn" type="button" data-test="backup-import-button" @click="pickBackupFile">恢复备份</button>
            <input
              ref="backupInputRef"
              class="backup-import-input"
              data-test="backup-import-input"
              type="file"
              accept="application/zip,.zip,application/json,.json"
              @change="handleBackupFile"
            >
          </div>
          <div v-if="backupPlan" class="backup-review" data-test="backup-review" role="status">
            <strong>备份已读取，确认后才会写入</strong>
            <span v-if="backupExportedAt">备份生成于 {{ backupExportedAt }}</span>
            <span v-if="backupWorksLine">{{ backupWorksLine }}</span>
            <span>恢复将：新增 {{ backupPlan.add.length }} 项 · 覆盖 {{ backupPlan.overwrite.length }} 项 · 内容相同跳过 {{ backupPlan.skip.length }} 项</span>
            <span v-if="backupPlan.incompatible.length" class="backup-review__error">{{ backupPlan.incompatible.join('；') }}</span>
            <div v-if="backupPlan.restoreWarnings?.length" class="backup-review__warnings" role="alert">
              <span v-for="warning in backupPlan.restoreWarnings" :key="warning">{{ warning }}</span>
              <label class="backup-review__consent">
                <input v-model="backupRiskAccepted" type="checkbox">
                <span>我了解恢复会替换这些较新的数据</span>
              </label>
            </div>
            <div class="backup-review__actions">
              <button class="settings-btn settings-btn--primary" type="button" data-test="backup-restore-confirm" :disabled="backupBusy || !backupPlan.valid || (backupPlan.requiresRiskConfirmation && !backupRiskAccepted)" @click="confirmBackupRestore">
                {{ backupBusy ? '写入中...' : '确认导入' }}
              </button>
              <button class="settings-btn" type="button" @click="cancelBackupRestore">取消</button>
            </div>
          </div>
          <div v-if="workspaceBundle" class="backup-review" data-test="workspace-backup-review" role="status">
            <strong>完整工作区备份已读取，确认后才会写入</strong>
            <span v-if="workspaceBundle.inspection.createdAt">备份生成于 {{ workspaceBundle.inspection.createdAt }}</span>
            <span>恢复将：新增 {{ workspaceBundle.inspection.counts.add }} 项 · 覆盖 {{ workspaceBundle.inspection.counts.overwrite }} 项 · 内容相同跳过 {{ workspaceBundle.inspection.counts.skip }} 项</span>
            <span v-if="workspaceBundle.inspection.counts.missingBinary" class="backup-review__error">缺少媒体原件 {{ workspaceBundle.inspection.counts.missingBinary }} 项（仅恢复元数据）</span>
            <span v-if="workspaceBundle.inspection.counts.unrestoreable" class="backup-review__error">无法恢复 {{ workspaceBundle.inspection.counts.unrestoreable }} 项（schema 版本不符）</span>
            <span v-if="workspaceBundle.inspection.rejectedSecretKeys.length">已排除 {{ workspaceBundle.inspection.rejectedSecretKeys.length }} 个模型配置密钥键</span>
            <span v-for="warning in workspaceBundle.inspection.warnings" :key="warning">{{ warning }}</span>
            <span>恢复会覆盖来源归档、媒体与本地数据中与备份不同的内容</span>
            <div v-if="workspaceBundle.inspection.requiresRiskConfirmation" class="backup-review__warnings" role="alert">
              <label class="backup-review__consent">
                <input v-model="backupRiskAccepted" type="checkbox">
                <span>我了解恢复会替换这些较新的数据</span>
              </label>
            </div>
            <div class="backup-review__actions">
              <button
                class="settings-btn settings-btn--primary"
                type="button"
                data-test="workspace-backup-restore-confirm"
                :disabled="workspaceBusy || (workspaceBundle.inspection.requiresRiskConfirmation && !backupRiskAccepted)"
                @click="confirmWorkspaceRestore"
              >
                {{ workspaceBusy ? '写入中...' : '确认导入完整工作区' }}
              </button>
              <button class="settings-btn" type="button" @click="cancelBackupRestore">取消</button>
            </div>
          </div>
          <p class="storage-boundary-note">
            完整工作区（ZIP）包含书稿、设定、来源归档与已落盘媒体；轻量备份（JSON）只含本地创作记录。
            模型密钥始终不进入任何备份；外部链接引用、尚未落盘的媒体与浏览器缓存不保证包含。
            恢复会覆盖所选备份中的对应数据，确认前会先显示预览。备份文件请妥善保存。
          </p>
          <p v-if="backupFeedback" class="backup-feedback" role="status" data-test="backup-feedback">
            {{ backupFeedback }}
            <router-link v-if="restoredTarget" :to="{ name: 'authoring', query: { bookId: restoredTarget.bookId } }">继续《{{ restoredTarget.bookTitle }}》</router-link>
            <router-link v-else-if="restoreSucceeded" to="/">打开作品列表</router-link>
          </p>

          <details class="storage-technical">
            <summary>技术详情：各部分占用</summary>
            <table class="storage-table">
              <thead>
                <tr><th scope="col">存储项</th><th scope="col">大小</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in storageTopKeys" :key="row.key">
                  <td><code>{{ row.key }}</code></td>
                  <td>{{ formatBytes(row.bytes) }}</td>
                </tr>
              </tbody>
            </table>
          </details>

          <div class="beta-support">
            <div>
              <strong>内测遇到问题？</strong>
              <span>诊断文件只含浏览器环境、存储用量和书稿数量，不含正文、标题、ID、模型密钥或生成内容。</span>
            </div>
            <div class="beta-support__actions">
              <button class="settings-btn" type="button" @click="openBetaGuide">查看内测说明</button>
              <button class="settings-btn" type="button" data-test="beta-diagnostic-export" @click="handleExportDiagnostic">导出诊断信息</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import ApiSettingsPanel from '../worldbook/ApiSettingsPanel.vue'
import { useStorageHealth } from '../../composables/useStorageHealth'
import { createRestorePlan, exportAllBackup, restoreBackup } from '../../utils/backupExport'
import {
  exportWorkspaceBackupBundle,
  inspectWorkspaceBackup,
  restoreWorkspaceBackupBundle
} from '../../services/storage/workspaceBackupBundle.js'
import { useSettingsPopup } from '../../composables/useSettingsPopup'
import { useTransientLayer, trapFocusWithin } from '../../composables/useTransientLayer'
import { useExperienceNarrativeExpansion } from '../../composables/useExperienceNarrativeExpansion'
import { useExperienceReadingPreferences } from '../../composables/useExperienceReadingPreferences'
import { exportBetaDiagnosticReport } from '../../utils/betaDiagnosticExport.js'
import { useRouter } from 'vue-router'

const { close, activeSection, isOpen } = useSettingsPopup()
const router = useRouter()
const expansion = useExperienceNarrativeExpansion()
const { profileName: readingProfile, setProfile: setReadingProfile, profiles: readingProfileObjects } = useExperienceReadingPreferences()
const readingProfileOptions = Object.values(readingProfileObjects)

const storageHealth = useStorageHealth()
const storageTopKeys = computed(() => storageHealth.getTopKeys(10))

const closeBtnRef = ref(null)
const backupInputRef = ref(null)
const backupText = ref('')
const backupPlan = ref(null)
const backupFeedback = ref('')
const backupBusy = ref(false)
const backupRiskAccepted = ref(false)
const restoredTarget = ref(null)
const restoreSucceeded = ref(false)
const workspaceBusy = ref(false)
const workspaceBundle = ref(null)   // 待确认恢复的完整工作区预览 { file, inspection }

// 备份里的书数只在能真实解析时展示;解析不了就说"本地创作数据",不把键数换名成书数。
const backupExportedAt = computed(() => {
  try {
    const parsed = JSON.parse(backupText.value || '{}')
    return typeof parsed?.exportedAt === 'string' ? parsed.exportedAt.slice(0, 19).replace('T', ' ') : ''
  } catch { return '' }
})

function readBackupBooks() {
  const parsed = JSON.parse(backupText.value || '{}')
  const raw = parsed?.keys?.writing_books
  if (typeof raw !== 'string') return null
  const books = JSON.parse(raw)
  const list = Array.isArray(books) ? books : (books && Array.isArray(books.books) ? books.books : null)
  return Array.isArray(list) ? list : null
}

const backupWorksLine = computed(() => {
  const list = readBackupBooksSafe()
  if (!list) return ''
  if (list.length === 1) return `包含 1 本书稿：《${String(list[0]?.title || '未命名书稿')}》`
  if (list.length > 1) return `包含 ${list.length} 本书稿`
  return '这份备份里没有书稿数据'
})

function readBackupBooksSafe() {
  try { return readBackupBooks() } catch { return null }
}

// 全局锁定主题2亮色：外观 tab（主题/明暗/缩放）已移除（用户要求）
const tabs = [
  { key: 'ai', label: 'AI 配置' },
  { key: 'experience', label: '体验' },
  { key: 'storage', label: '存储' }
]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function handleExportWorkspaceBackup() {
  if (workspaceBusy.value) return
  workspaceBusy.value = true
  backupFeedback.value = ''
  try {
    const result = await exportWorkspaceBackupBundle({ storage: localStorage })
    const missing = result.manifest.domains.media.missingBinaryIds.length
    const domains = result.manifest.domains
    const sizeLine = formatBytes(result.stats.zipBytes)
    const missingLine = missing > 0 ? `；${missing} 个媒体缺少本地原件未包含` : ''
    backupFeedback.value = `完整工作区已导出（${sizeLine}）：书稿 ${domains.localStorage.keyCount} 项 · 来源 ${domains.sourceArchive.artifactCount + domains.sourceArchive.chunkCount} 条 · 媒体 ${domains.media.binaryCount} 份${missingLine}。模型密钥未包含。`
    restoreSucceeded.value = false
    restoredTarget.value = null
  } catch (error) {
    backupFeedback.value = error?.name === 'WorkspaceBackupCancelled'
      ? '完整工作区导出已取消，原有数据未变。'
      : '完整工作区导出失败，原有数据未变；可改用“导出轻量备份（JSON）”。'
  } finally {
    workspaceBusy.value = false
  }
}

function handleExportBackup() {
  try {
    const result = exportAllBackup()
    backupFeedback.value = `备份文件已生成：包含 ${result.keyCount} 项本地作品数据，模型密钥未包含。请妥善保存。`
    restoreSucceeded.value = false
    restoredTarget.value = null
  } catch {

    backupFeedback.value = '备份导出失败，请稍后重试；如持续失败，请用“导出诊断信息”反馈。'
  }
}

async function handleExportDiagnostic() {
  try {
    await exportBetaDiagnosticReport()
    backupFeedback.value = '诊断信息已导出；发送前仍可用文本编辑器打开检查。'
  } catch {

    backupFeedback.value = '诊断信息导出失败，请直接描述你看到的问题。'
  }
}

function openBetaGuide() {
  close()
  void router.push('/docs/10-beta-guide')
}

function pickBackupFile() {
  backupInputRef.value?.click()
}

async function handleBackupFile(event) {
  const file = event.target?.files?.[0]
  event.target.value = ''
  if (!file) return

  backupFeedback.value = ''
  restoredTarget.value = null
  restoreSucceeded.value = false
  const looksLikeZip = /\.zip$/i.test(file.name || '') || file.type === 'application/zip'
  if (looksLikeZip) {
    void handleWorkspaceBackupFile(file)
    return
  }
  try {
    backupText.value = await file.text()
    backupPlan.value = createRestorePlan(backupText.value)
    backupRiskAccepted.value = false
    if (!backupPlan.value.valid) {
      backupFeedback.value = `${backupPlan.value.incompatible.join('；') || '备份不可导入'}。请确认这是本应用“导出轻量备份（JSON）”生成的文件，或使用完整工作区 ZIP 恢复，再重新选择。`
      backupPlan.value = null
    }
  } catch (error) {
    backupPlan.value = null
    backupFeedback.value = `${error?.message || '备份读取失败'}。请重新选择备份文件；文件应是 .json 或 .zip 格式。`
  }
}

// 完整工作区（ZIP）：先完整校验并生成预览，确认后才写入
async function handleWorkspaceBackupFile(file) {
  workspaceBusy.value = true
  try {
    const inspection = await inspectWorkspaceBackup(file, { storage: localStorage })
    if (!inspection.valid) {
      workspaceBundle.value = null
      backupFeedback.value = `这份完整工作区备份无法使用：${inspection.errors.join('；')}`
      return
    }
    workspaceBundle.value = { file, inspection }
    backupRiskAccepted.value = false
    const counts = inspection.counts
    backupFeedback.value = `完整工作区备份已读取（${formatBytes(file.size)}）：新增 ${counts.add} 项 · 覆盖 ${counts.overwrite} 项 · 相同跳过 ${counts.skip} 项` +
      (counts.missingBinary ? ` · 缺少媒体原件 ${counts.missingBinary} 项` : '') +
      (counts.unrestoreable ? ` · 无法恢复 ${counts.unrestoreable} 项` : '') +
      '。确认后才会写入。'
  } catch (error) {
    workspaceBundle.value = null
    backupFeedback.value = `${error?.message || '完整工作区备份读取失败'}。请重新选择备份文件。`
  } finally {
    workspaceBusy.value = false
  }
}

async function confirmWorkspaceRestore() {
  const bundle = workspaceBundle.value
  if (!bundle || workspaceBusy.value) return
  workspaceBusy.value = true
  backupFeedback.value = '正在恢复完整工作区...'
  try {
    const result = await restoreWorkspaceBackupBundle(bundle.file, {
      storage: localStorage,
      acceptRestoreRisk: backupRiskAccepted.value
    })
    if (result.success) {
      workspaceBundle.value = null
      restoredTarget.value = resolveRestoredTarget()
      restoreSucceeded.value = true
      const domains = result.domains
      backupFeedback.value = `完整工作区已恢复：来源 ${domains.sourceArchive.written} 条 · 媒体 ${domains.media.written} 份 · 本地数据 ${domains.localStorage.written} 项。刷新后完全生效。`
      cancelBackupRestore()
      storageHealth.refresh()
      // 只在持久化全部确认后刷新应用
      setTimeout(() => window.location.reload(), 1200)
    } else if (result.reason === 'restore-risk-not-accepted') {
      backupFeedback.value = '这份备份会替换较新的数据，需要先勾选确认后才能导入。'
    } else {
      const domainLines = result.domains
        ? Object.entries(result.domains)
          .filter(([, d]) => !d.ok)
          .map(([name, d]) => `${name}：${d.reason}${d.rollbackFailed ? '（回滚也失败，请勿关闭页面）' : d.rolledBack ? '（已回滚）' : ''}`)
          .join('；')
        : result.reason
      backupFeedback.value = `完整工作区恢复未完成：${domainLines}。原有数据已尽量保留，请勿关闭页面，可先“导出轻量备份（JSON）”留底后重试。`
    }
  } catch (error) {
    backupFeedback.value = `${error?.message || '完整工作区恢复失败'}。原有数据已尽量保留。`
  } finally {
    workspaceBusy.value = false
  }
}

function cancelBackupRestore() {
  backupPlan.value = null
  workspaceBundle.value = null
  backupText.value = ''
  backupRiskAccepted.value = false
}

// 恢复成功后的回程:备份里恰好一本书才直达该书,否则回作品列表,不猜测。
function resolveRestoredTarget() {
  const list = readBackupBooksSafe()
  if (list?.length === 1 && list[0]?.id) {
    return { bookId: String(list[0].id), bookTitle: String(list[0]?.title || '未命名书稿') }
  }
  return null
}

function confirmBackupRestore() {
  if (!backupPlan.value || backupBusy.value) return
  if (backupPlan.value.requiresRiskConfirmation && !backupRiskAccepted.value) return
  backupBusy.value = true
  try {
    const result = restoreBackup(backupText.value, {
      acceptRestoreRisk: backupRiskAccepted.value,
    })
    if (result.success) {
      restoredTarget.value = resolveRestoredTarget()
      restoreSucceeded.value = true
      backupFeedback.value = '备份已恢复，数据已写回当前浏览器。'
      cancelBackupRestore()
      storageHealth.refresh()
    } else if (result.reason === 'quota') {
      backupFeedback.value = '存储空间不足，已撤销本次导入，原有数据未变。可先“导出本地作品备份”留底，再清理浏览器存储后重试。'
    } else if (result.reason === 'restore-risk-not-accepted') {
      backupFeedback.value = '这份备份会替换较新的数据，需要先勾选确认后才能导入。'
    } else {
      backupFeedback.value = `${result.error || '备份写入失败，未完成导入'}。原有数据未变，可重新选择备份文件再试。`
    }
  } finally {
    backupBusy.value = false
  }
}

// 键盘与焦点契约(C07):打开聚焦关闭钮,Tab 圈在弹窗内,Esc 只关最上层,
// 关闭后焦点回到确切触发器(所有入口统一,由 useTransientLayer 记录)。
const modalRef = ref(null)
useTransientLayer({
  id: 'settings-popup',
  isOpen,
  onClose: () => close(),
  initialFocus: () => closeBtnRef.value,
  exclusive: false
})

function onModalKeydown(event) {
  if (event.key !== 'Tab') return
  trapFocusWithin(event, modalRef.value)
}

function onTablistKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const index = tabs.findIndex((tab) => tab.key === activeSection.value)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = tabs.length - 1
  if (next === index) return
  event.preventDefault()
  activeSection.value = tabs[next].key
  nextTick(() => document.getElementById(`settings-tab-${tabs[next].key}`)?.focus())
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 96;
  background: color-mix(in srgb, var(--ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  width: min(720px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  background: var(--surface-panel, var(--surface-raised));
  color: var(--text-primary);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 24px 60px color-mix(in srgb, #000 28%, transparent);
}

.settings-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.settings-modal__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.settings-modal__close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  border-radius: 4px;
}

.settings-modal__close:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: var(--surface-soft, transparent);
}

.settings-tab {
  padding: 6px 14px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.settings-tab:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.settings-tab.active {
  background: var(--accent-light, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--accent);
}

.settings-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: grid;
  gap: 16px;
  align-content: start;
}

.settings-section__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-field-label {
  display: block;
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.settings-field-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-field-divider {
  height: 1px;
  margin: 20px 0;
  background: color-mix(in srgb, var(--border) 50%, transparent);
}

.storage-summary {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.storage-summary__pct {
  font-size: 18px;
  font-weight: 700;
}

.storage-summary__bar {
  height: 8px;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 4px;
  overflow: hidden;
}

.storage-summary__fill {
  display: block;
  height: 100%;
  background: var(--accent);
}

.storage-summary.warning .storage-summary__fill,
.storage-summary.critical .storage-summary__fill {
  background: var(--danger);
}

.storage-summary__hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.storage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.storage-table th,
.storage-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.storage-table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.storage-table code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  word-break: break-all;
}

.storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}

.storage-lead {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.storage-actions--lead { justify-content: flex-start; padding-top: 0; }

.storage-technical {
  border-block: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
}

.storage-technical summary {
  min-height: 40px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.storage-technical summary:hover { color: var(--text-primary); }

.storage-technical .storage-table { margin-top: 4px; }

.backup-feedback { display: grid; gap: 4px; justify-items: start; }
.backup-feedback a { color: var(--accent); font-weight: 650; }

.storage-boundary-note {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.beta-support {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.beta-support > div:first-child {
  display: grid;
  gap: 5px;
  max-width: 420px;
}

.beta-support strong { font-size: 13px; }
.beta-support span { color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
.beta-support__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

.backup-import-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.backup-review {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  font-size: 12px;
}

.backup-review > span {
  color: var(--text-secondary);
}

.backup-review__error {
  color: var(--danger);
}

.backup-review__warnings {
  display: grid;
  gap: 5px;
  color: var(--text-secondary);
}

.backup-review__warnings > span {
  padding-left: 9px;
  border-left: 2px solid color-mix(in srgb, var(--warning, var(--accent)) 62%, var(--border));
}

.backup-review__consent {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 3px;
  color: var(--text-primary);
  cursor: pointer;
}

.backup-review__consent input {
  accent-color: var(--accent);
}

.backup-review__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.backup-feedback {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

@media (max-width: 720px) {
  /* 小屏存在全局视觉缩放,52px 才能保证物理触控区 ≥44px。 */
  .settings-modal__close { width: 52px; height: 52px; }
  .settings-tab,
  .storage-actions .settings-btn { min-height: 52px; }
  .beta-support { align-items: stretch; flex-direction: column; }
  .beta-support__actions { justify-content: stretch; }
  .beta-support__actions .settings-btn { min-height: 44px; flex: 1; }
}

.settings-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface-raised);
}

.settings-btn--primary:hover {
  filter: brightness(1.08);
}
</style>
