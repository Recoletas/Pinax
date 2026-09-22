<template>
  <div class="settings-overlay" @click.self="close">
    <div ref="modalRef" class="settings-modal" role="dialog" aria-modal="true" :aria-label="tr(&quot;设置&quot;)" @keydown="onModalKeydown">
      <header class="settings-modal__head">
        <h2>{{ tr('设置') }}</h2>
        <button
          ref="closeBtnRef"
          class="settings-modal__close"
          type="button"
          :aria-label="tr(&quot;关闭&quot;)"
          @click="close"
        >×</button>
      </header>

      <nav class="settings-tabs settings-navigation" role="tablist" :aria-label="tr(&quot;设置分区&quot;)" @keydown="onTablistKeydown">
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
        >{{ tr(tab.label) }}</button>
      </nav>

      <div class="settings-modal__body">
        <section v-if="activeSection === 'writing'" id="settings-panel-writing" class="settings-section" role="tabpanel" :aria-label="tr(&quot;写作偏好&quot;)"><WritingPreferences /></section>
        <section v-if="activeSection === 'appearance'" id="settings-panel-appearance" class="settings-section appearance-preferences" role="tabpanel" :aria-label="tr(&quot;外观&quot;)">
          <h2>{{ tr('外观') }}</h2>
          <label>{{ tr('界面语言') }}<select :aria-label="tr('界面语言')" data-test="ui-language" :value="uiLocale" @change="changeLanguage($event.target.value)"><option value="zh-CN">{{ tr('简体中文') }}</option><option value="en">English</option></select></label>
          <label>{{ tr('助手解释语言') }}<select :aria-label="tr('助手解释语言')" data-test="assistant-language" :value="assistantLanguage" @change="changeLanguage(uiLocale, $event.target.value)"><option value="">{{ tr('跟随界面') }}</option><option value="zh-CN">{{ tr('简体中文') }}</option><option value="en">English</option></select></label>
          <p class="settings-field-hint">{{ tr('语言偏好仅保存在此设备，不随书稿备份恢复；切换界面不会翻译正文。') }}</p>
          <p v-if="languageSaveError" role="alert">{{ tr('语言偏好保存失败，请重试。') }}</p>
          <label>{{ tr('配色') }}<select :aria-label="tr('配色')" :value="theme.colorScheme" @change="theme.setColorScheme($event.target.value)"><option value="light">{{ tr('日间') }}</option><option value="dark">{{ tr('夜间') }}</option></select></label>
          <label>{{ tr('界面缩放') }}<select :aria-label="tr('界面缩放')" :value="theme.uiZoom" @change="theme.setUiZoom($event.target.value)"><option v-for="zoom in VALID_UI_ZOOMS" :key="zoom" :value="zoom">{{ Math.round(zoom * 100) }}%</option></select></label>
          <p class="settings-field-hint">{{ tr('只改变显示，不修改正文。夜间模式也可在右上角直接切换。') }}</p>
        </section>
        <section v-if="activeSection === 'memory'" id="settings-panel-memory" class="settings-section" role="tabpanel" :aria-label="tr(&quot;记忆与历史&quot;)">
          <MemoryHistoryWorkspace />
        </section>
        <section
          v-show="activeSection === 'ai'"
          id="settings-panel-ai"
          class="settings-section"
          role="tabpanel"
          :aria-label="tr(&quot;AI 配置&quot;)"
        >
          <ApiSettingsPanel />
        </section>

        <section
          v-show="activeSection === 'experience'"
          id="settings-panel-experience"
          class="settings-section"
          role="tabpanel"
          :aria-label="tr(&quot;体验&quot;)"
        >
          <label class="settings-field-label" id="narrative-expansion-label">{{ tr('单次续写篇幅') }}</label>
          <p class="settings-field-hint">{{ tr('仅影响之后的 AI 生成长度，不会改写已显示的正文。') }}</p>
          <nav class="settings-tabs" role="group" aria-labelledby="narrative-expansion-label">
            <button
              v-for="level in expansion.levels"
              :key="level.key"
              class="settings-tab"
              :class="{ active: expansion.levelName === level.key }"
              :aria-pressed="(expansion.levelName === level.key).toString()"
              type="button"
              @click="expansion.setLevel(level.key)"
            >{{ tr(level.label) }}</button>
          </nav>

          <div class="settings-field-divider"></div>

          <label class="settings-field-label" id="reading-density-label">{{ tr('阅读密度') }}</label>
          <p class="settings-field-hint">{{ tr('立即改变当前页面的字号、行高和段落间距。') }}</p>
          <nav class="settings-tabs" role="group" aria-labelledby="reading-density-label">
            <button
              v-for="profile in readingProfileOptions"
              :key="profile.key"
              class="settings-tab"
              :class="{ active: readingProfile === profile.key }"
              :aria-pressed="(readingProfile === profile.key).toString()"
              type="button"
              @click="setReadingProfile(profile.key)"
            >{{ tr(profile.label) }}</button>
          </nav>
        </section>

        <section
          v-show="activeSection === 'storage'"
          id="settings-panel-storage"
          class="settings-section"
          role="tabpanel"
          :aria-label="tr(&quot;备份与恢复&quot;)"
        >
          <h2>{{ tr('备份与恢复') }}</h2>
          <p class="storage-lead">{{ tr('备份用于保留副本或迁移设备，导出本身不会释放空间。') }}</p>
          <div class="storage-actions storage-actions--lead">
            <button
              class="settings-btn settings-btn--primary"
              type="button"
              data-test="backup-export-workspace-button"
              :disabled="workspaceBusy"
              @click="handleExportWorkspaceBackup"
            >
              {{ workspaceBusy ? tr('正在导出完整工作区...') : tr('导出完整工作区（ZIP）') }}
            </button>
            <button class="settings-btn" type="button" data-test="backup-export-button" @click="handleExportBackup">{{ tr('导出轻量备份（JSON）') }}</button>
            <button class="settings-btn" type="button" data-test="backup-import-button" @click="pickBackupFile">{{ tr('恢复备份') }}</button>
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
            <strong>{{ tr('备份已读取，确认后才会写入') }}</strong>
            <span v-if="backupExportedAt">{{ tr('备份生成于 {backupExportedAt}', { backupExportedAt: backupExportedAt }) }}</span>
            <span v-if="backupWorksLine">{{ backupWorksLine }}</span>
            <span>{{ tr('恢复将：新增 {length} 项 · 覆盖 {length1} 项 · 内容相同跳过 {length2} 项', { length: backupPlan.add.length, length1: backupPlan.overwrite.length, length2: backupPlan.skip.length }) }}</span>
            <span v-if="backupPlan.incompatible.length" class="backup-review__error">{{ backupPlan.incompatible.map(backupMessage).join('; ') }}</span>
            <div v-if="backupPlan.restoreWarnings?.length" class="backup-review__warnings" role="alert">
              <span v-for="warning in backupPlan.restoreWarnings" :key="warning">{{ backupMessage(warning) }}</span>
              <label class="backup-review__consent">
                <input v-model="backupRiskAccepted" type="checkbox">
                <span>{{ tr('我了解恢复会替换这些较新的数据') }}</span>
              </label>
            </div>
            <div class="backup-review__actions">
              <button class="settings-btn settings-btn--primary" type="button" data-test="backup-restore-confirm" :disabled="backupBusy || !backupPlan.valid || (backupPlan.requiresRiskConfirmation && !backupRiskAccepted)" @click="confirmBackupRestore">
                {{ backupBusy ? tr('写入中...') : tr('确认导入') }}
              </button>
              <button class="settings-btn" type="button" @click="cancelBackupRestore">{{ tr('取消') }}</button>
            </div>
          </div>
          <div v-if="workspaceBundle" class="backup-review" data-test="workspace-backup-review" role="status">
            <strong>{{ tr('完整工作区备份已读取，确认后才会写入') }}</strong>
            <span v-if="workspaceBundle.inspection.createdAt">{{ tr('备份生成于 {createdAt}', { createdAt: workspaceBundle.inspection.createdAt }) }}</span>
            <span>{{ tr('恢复将：新增 {add} 项 · 覆盖 {overwrite} 项 · 内容相同跳过 {skip} 项', { add: workspaceBundle.inspection.counts.add, overwrite: workspaceBundle.inspection.counts.overwrite, skip: workspaceBundle.inspection.counts.skip }) }}</span>
            <span v-if="workspaceBundle.inspection.memoryHistoryCount">{{ tr('记忆历史 {memoryHistoryCount} 条；同版本不重复导入，冲突版本拒绝覆盖', { memoryHistoryCount: workspaceBundle.inspection.memoryHistoryCount }) }}</span>
            <span v-if="workspaceBundle.inspection.factLedgerCount">{{ tr('事实账本 {factLedgerCount} 条；包含证据、决定与跑团回执', { factLedgerCount: workspaceBundle.inspection.factLedgerCount }) }}</span>
            <span v-if="workspaceBundle.inspection.missingDomains?.includes('factLedger')">{{ tr('旧备份不含事实账本，现有账本不会被清空') }}</span>
            <span v-if="workspaceBundle.inspection.counts.missingBinary" class="backup-review__error">{{ tr('缺少媒体原件 {missingBinary} 项（仅恢复元数据）', { missingBinary: workspaceBundle.inspection.counts.missingBinary }) }}</span>
            <span v-if="workspaceBundle.inspection.counts.unrestoreable" class="backup-review__error">{{ tr('无法恢复 {unrestoreable} 项（schema 版本不符）', { unrestoreable: workspaceBundle.inspection.counts.unrestoreable }) }}</span>
            <span v-if="workspaceBundle.inspection.rejectedSecretKeys.length">{{ tr('已排除 {length} 个模型配置密钥键', { length: workspaceBundle.inspection.rejectedSecretKeys.length }) }}</span>
            <span v-for="warning in workspaceBundle.inspection.warnings" :key="warning">{{ backupMessage(warning) }}</span>
            <span>{{ tr('恢复会覆盖来源归档、媒体与本地数据中与备份不同的内容') }}</span>
            <div v-if="workspaceBundle.inspection.requiresRiskConfirmation" class="backup-review__warnings" role="alert">
              <span v-for="warning in workspaceBundle.inspection.localStoragePlan?.restoreWarnings || []" :key="warning">{{ backupMessage(warning) }}</span>
              <label class="backup-review__consent">
                <input v-model="backupRiskAccepted" type="checkbox">
                <span>{{ tr('我了解恢复会替换这些较新的数据') }}</span>
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
                {{ workspaceBusy ? tr('写入中...') : tr('确认导入完整工作区') }}
              </button>
              <button class="settings-btn" type="button" @click="cancelBackupRestore">{{ tr('取消') }}</button>
            </div>
          </div>
          <p class="storage-boundary-note">{{ tr('完整工作区（ZIP）包含书稿、设定、来源归档、已落盘媒体与记忆历史；轻量备份（JSON）不含已归档的记忆历史。 模型密钥始终不进入任何备份；外部链接引用、尚未落盘的媒体与浏览器缓存不保证包含。 恢复会覆盖所选备份中的对应数据，确认前会先显示预览。备份文件请妥善保存。') }}</p>
          <p v-if="backupFeedback" class="backup-feedback" role="status" data-test="backup-feedback">
            {{ backupFeedback }}
            <router-link v-if="restoredTarget" :to="{ name: 'authoring', query: { bookId: restoredTarget.bookId } }">{{ tr('继续《{bookTitle}》', { bookTitle: restoredTarget.bookTitle }) }}</router-link>
            <router-link v-else-if="restoreSucceeded" to="/">{{ tr('打开作品列表') }}</router-link>
          </p>

          <div class="beta-support">
            <div>
              <strong>{{ tr('使用中遇到问题？') }}</strong>
              <span>{{ tr('诊断文件只含浏览器环境、存储用量和书稿数量，不含正文、标题、ID、模型密钥或生成内容。') }}</span>
            </div>
            <div class="beta-support__actions">
              <button class="settings-btn" type="button" @click="openBetaGuide">{{ tr('查看快速开始') }}</button>
              <button class="settings-btn" type="button" data-test="beta-diagnostic-export" @click="handleExportDiagnostic">{{ tr('导出诊断信息') }}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { backupMessage } from '../../i18n/backupMessages.js'
import { uiLocale, assistantLanguage, setLanguagePreferences } from '../../i18n/index.js'
const languageSaveError = ref(false)
function changeLanguage(locale, assistant = assistantLanguage.value) { languageSaveError.value = !setLanguagePreferences(locale, assistant) }
import { computed, ref, nextTick, defineAsyncComponent } from 'vue'
const MemoryHistoryWorkspace = defineAsyncComponent(() => import('../authoring/MemoryHistoryWorkspace.vue'))
import ApiSettingsPanel from '../worldbook/ApiSettingsPanel.vue'
import WritingPreferences from './WritingPreferences.vue'
import { useThemeStore, VALID_UI_ZOOMS } from '../../stores/themeStore'
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
const theme = useThemeStore()
const expansion = useExperienceNarrativeExpansion()
const { profileName: readingProfile, setProfile: setReadingProfile, profiles: readingProfileObjects } = useExperienceReadingPreferences()
const readingProfileOptions = Object.values(readingProfileObjects)

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
  if (list.length === 1) return tr('包含书稿：{title}', { title: String(list[0]?.title || tr('未命名书稿')) })
  if (list.length > 1) return tr('包含 {count} 本书稿', { count: list.length })
  return tr('这份备份里没有书稿数据')
})

function readBackupBooksSafe() {
  try { return readBackupBooks() } catch { return null }
}

const tabs = [
  { key: 'writing', label: '写作' },
  { key: 'appearance', label: '外观' },
  { key: 'ai', label: 'AI 配置' },
  { key: 'experience', label: '体验' },
  { key: 'memory', label: '记忆与历史' },
  { key: 'storage', label: '备份与恢复' }
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
    const missingLine = missing > 0 ? tr('；{value0} 个媒体缺少本地原件未包含', { value0: missing }) : ''
    backupFeedback.value = tr('完整工作区已导出（{value0}）：书稿 {value1} 项 · 来源 {value2} 条 · 媒体 {value3} 份 · 记忆修订 {value4} 条{value5}。模型密钥未包含。', { value0: sizeLine, value1: domains.localStorage.keyCount, value2: domains.sourceArchive.artifactCount + domains.sourceArchive.chunkCount, value3: domains.media.binaryCount, value4: domains.memoryHistory.revisionCount, value5: missingLine })
    restoreSucceeded.value = false
    restoredTarget.value = null
  } catch (error) {
    backupFeedback.value = error?.name === 'WorkspaceBackupCancelled'
      ? tr('完整工作区导出已取消，原有数据未变。')
      : tr('完整工作区导出失败，原有数据未变；可改用“导出轻量备份（JSON）”。')
  } finally {
    workspaceBusy.value = false
  }
}

function handleExportBackup() {
  try {
    const result = exportAllBackup()
    backupFeedback.value = tr('备份文件已生成：包含 {value0} 项本地作品数据，模型密钥未包含。请妥善保存。', { value0: result.keyCount })
    restoreSucceeded.value = false
    restoredTarget.value = null
  } catch {

    backupFeedback.value = tr('备份导出失败，请稍后重试；如持续失败，请用“导出诊断信息”反馈。')
  }
}

async function handleExportDiagnostic() {
  try {
    await exportBetaDiagnosticReport()
    backupFeedback.value = tr('诊断信息已导出；发送前仍可用文本编辑器打开检查。')
  } catch {

    backupFeedback.value = tr('诊断信息导出失败，请直接描述你看到的问题。')
  }
}

function openBetaGuide() {
  close()
  void router.push('/docs/01-quickstart')
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
      backupFeedback.value = tr('{value0}。请确认这是本应用“导出轻量备份（JSON）”生成的文件，或使用完整工作区 ZIP 恢复，再重新选择。', { value0: backupPlan.value.incompatible.map(backupMessage).join('; ') || '备份不可导入' })
      backupPlan.value = null
    }
  } catch (error) {
    backupPlan.value = null
    backupFeedback.value = tr('{value0}。请重新选择备份文件；文件应是 .json 或 .zip 格式。', { value0: error?.message || '备份读取失败' })
  }
}

// 完整工作区（ZIP）：先完整校验并生成预览，确认后才写入
async function handleWorkspaceBackupFile(file) {
  workspaceBusy.value = true
  try {
    const inspection = await inspectWorkspaceBackup(file, { storage: localStorage })
    if (!inspection.valid) {
      workspaceBundle.value = null
      backupFeedback.value = tr('这份完整工作区备份无法使用：{value0}', { value0: inspection.errors.map(backupMessage).join('; ') })
      return
    }
    workspaceBundle.value = { file, inspection }
    backupRiskAccepted.value = false
    backupFeedback.value = tr('完整工作区备份已读取。确认后才会写入。')
  } catch (error) {
    workspaceBundle.value = null
    backupFeedback.value = tr('{value0}。请重新选择备份文件。', { value0: error?.message || '完整工作区备份读取失败' })
  } finally {
    workspaceBusy.value = false
  }
}

async function confirmWorkspaceRestore() {
  const bundle = workspaceBundle.value
  if (!bundle || workspaceBusy.value) return
  workspaceBusy.value = true
  backupFeedback.value = tr('正在恢复完整工作区...')
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
      backupFeedback.value = tr('完整工作区已恢复：来源 {value0} 条 · 媒体 {value1} 份 · 本地数据 {value2} 项。刷新后完全生效。', { value0: domains.sourceArchive.written, value1: domains.media.written, value2: domains.localStorage.written })
      cancelBackupRestore()
      // 只在持久化全部确认后刷新应用
      setTimeout(() => window.location.reload(), 1200)
    } else if (result.reason === 'restore-risk-not-accepted') {
      backupFeedback.value = tr('这份备份会替换较新的数据，需要先勾选确认后才能导入。')
    } else {
      const domainLines = result.domains
        ? Object.entries(result.domains)
          .filter(([, d]) => !d.ok)
          .map(([name, d]) => `${name}：${d.reason}${d.rollbackFailed ? tr('（回滚也失败，请勿关闭页面）') : d.rolledBack ? tr('（已回滚）') : ''}`)
          .join('；')
        : result.reason
      backupFeedback.value = tr('完整工作区恢复未完成：{value0}。原有数据已尽量保留，请勿关闭页面，可先“导出轻量备份（JSON）”留底后重试。', { value0: domainLines })
    }
  } catch (error) {
    backupFeedback.value = tr('{value0}。原有数据已尽量保留。', { value0: error?.message || '完整工作区恢复失败' })
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
      backupFeedback.value = tr('备份已恢复，数据已写回当前浏览器。')
      cancelBackupRestore()
    } else if (result.reason === 'quota') {
      backupFeedback.value = tr('浏览器拒绝写入，已撤销本次导入。请保留备份文件，可在另一浏览器或设备中尝试恢复；请勿清除当前网站数据。')
    } else if (result.reason === 'restore-risk-not-accepted') {
      backupFeedback.value = tr('这份备份会替换较新的数据，需要先勾选确认后才能导入。')
    } else {
      backupFeedback.value = tr('{value0}。原有数据未变，可重新选择备份文件再试。', { value0: result.error || '备份写入失败，未完成导入' })
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
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  const index = tabs.findIndex((tab) => tab.key === activeSection.value)
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
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
  z-index: var(--z-modal);
  background: rgb(0 0 0 / 24%);
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
/* Preference categories are a stable left index, independent of inner option groups. */
.settings-modal { width: min(960px, 94vw); height: min(720px, 88vh); max-height: 88vh; display: grid; grid-template-columns: 168px minmax(0, 1fr); grid-template-rows: 56px minmax(0, 1fr); }
.settings-modal__head { grid-column: 1 / -1; padding: 12px 20px; }
.settings-navigation { flex-direction: column; grid-column: 1; gap: 4px; padding: 16px 10px; border: 0; border-right: 1px solid var(--border); background: var(--archive-paper); overflow-y: auto; }
.settings-navigation .settings-tab { min-height: 36px; text-align: left; font: 500 14px/1.4 var(--font-sans); letter-spacing: normal; border: 0; padding: 8px 12px; }
.settings-navigation .settings-tab.active { background: var(--bg-hover); color: var(--text-primary); }
.settings-modal__body { min-width: 0; min-height: 0; padding: 24px 28px; font-size: 14px; }
.appearance-preferences { display: grid; gap: 22px; align-content: start; }
.appearance-preferences h2 { margin: 0; font-size: 22px; }
.appearance-preferences label { display: flex; gap: 20px; align-items: center; justify-content: space-between; }
.appearance-preferences select { min-width: 140px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 5px; font: inherit; background: var(--bg-primary); color: var(--text-primary); }
.settings-tab:focus-visible, .appearance-preferences select:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 640px) { .settings-modal { grid-template-columns: minmax(0, 1fr); grid-template-rows: 50px auto minmax(0, 1fr); height: 92vh; max-height: 92vh; } .settings-navigation { flex-direction: row; flex-wrap: wrap; padding: 8px; border-right: 0; border-bottom: 1px solid var(--border); } .settings-navigation .settings-tab { min-height: 40px; } .settings-modal__body { padding: 18px 16px; } }
</style>
