import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  listNarrativeAssets,
  updateNarrativeAsset,
  updateNarrativeAssetDurable
} from '../services/narrativeAssets'
import {
  createMarkdownMediaReference,
  hydrateMarkdownMediaContent,
  migrateMarkdownMediaContent
} from '../services/media/markdownMediaBridge'
import {
  htmlToMarkdown,
  markdownToHtml,
  markdownToPlainText
} from '../services/notes/assetMarkdown'
import { remapEmbeddedImagePresentations } from '../services/notes/illustrationPresentation'

/**
 * C2 · Notes 素材编辑与保存生命周期 owner。
 *
 * 唯一可变编辑真源是 `markdownContent`；`editorContent`（WYSIWYG HTML）与
 * `renderedMarkdownContent`（媒体 hydrate 后的渲染源）都是它的派生。
 * 保存、切换、模式同步、卸载冲刷都只经过这里。
 *
 * 注入的窄接口（不传整页状态）：
 * - getSelectedAsset()      当前素材投影（来自 useNotesAssetCatalog）
 * - getSelectedChapterId()  当前素材 id
 * - extractEditorMarkdown() 页面从 WYSIWYG DOM 提取净正文（插画感知，页面/C7 边界）
 * - flushVisualPresentation(chapter) 保存时把插画版式落盘（页面插画域的单一接缝）
 * - editorRef  模板 ref（仅用于活动元素判断）
 * - renderWysiwyg() / renderPreview() 页面 DOM 渲染器
 */
export function useNotesAssetEditor({
  getSelectedAsset,
  getSelectedChapterId,
  extractEditorMarkdown,
  flushVisualPresentation,
  editorRef,
  renderWysiwyg,
  renderPreview
}) {
  const currentChapterTitle = ref('')
  const editorMode = ref('wysiwyg')
  const markdownContent = ref('')
  const editorContent = ref('')
  const renderedMarkdownSource = ref('')
  const renderedMarkdownContent = ref('')
  const saveStatus = ref('saved')

  let saveTimeout = null
  let titleTimeout = null

  const statusText = computed(() => {
    switch (saveStatus.value) {
      case 'saved': return '已保存'
      case 'saving': return '保存中...'
      case 'unsaved': return '未保存'
      case 'failed': return '保存失败，输入已保留'
      default: return ''
    }
  })

  // 正文渲染源：媒体 hydrate 异步完成后仅在同世代写回（沿用原 revision 守卫）
  let markdownMediaRenderRevision = 0
  watch(markdownContent, (content) => {
    const revision = ++markdownMediaRenderRevision
    renderedMarkdownSource.value = content
    renderedMarkdownContent.value = content
    void hydrateMarkdownMediaContent(content).then((hydrated) => {
      if (revision !== markdownMediaRenderRevision) return
      renderedMarkdownContent.value = hydrated
      if (editorMode.value === 'wysiwyg' && document.activeElement !== editorRef.value) {
        nextTick(renderWysiwyg)
      }
    })
  }, { immediate: true })

  const previewHtml = computed(() => markdownToHtml(renderedMarkdownContent.value))
  watch(previewHtml, () => {
    if (editorMode.value === 'preview') nextTick(renderPreview)
  })

  function syncMarkdownToEditor() {
    editorContent.value = markdownToHtml(markdownContent.value || '')
    if (editorMode.value === 'wysiwyg') renderWysiwyg()
  }

  function syncFromCurrentEditor() {
    if (editorMode.value === 'wysiwyg' && editorRef.value) {
      const cleanMarkdown = extractEditorMarkdown()
      markdownContent.value = cleanMarkdown
      editorContent.value = markdownToHtml(markdownContent.value)
      return
    }
    if (editorMode.value === 'markdown') {
      editorContent.value = markdownToHtml(markdownContent.value || '')
    }
  }

  function setEditorPlainText(text) {
    markdownContent.value = text
    editorContent.value = markdownToHtml(text)
    renderWysiwyg()
  }

  function switchEditorMode(mode) {
    if (editorMode.value === mode) return
    syncFromCurrentEditor()
    editorMode.value = mode
    if (mode !== 'wysiwyg') {
      // 选择样式状态属于页面（hasSelection），由页面 watch editorMode 处理
    }
    if (mode === 'wysiwyg') {
      nextTick(renderWysiwyg)
    }
    if (mode === 'preview') {
      nextTick(renderPreview)
    }
  }

  /**
   * 把素材内容装载进编辑器（selectChapter 专用）。
   * 迁移媒体引用为异步，带 asset id + 内容双身份核对，晚到结果不写错素材。
   */
  function loadAsset(asset) {
    currentChapterTitle.value = asset.title || ''
    const raw = asset.content || ''
    const format = asset.contentFormat || (/<\/?[a-z][\s\S]*>/i.test(raw) ? 'html' : 'md')
    const nextMarkdown = format === 'md' ? raw : htmlToMarkdown(raw)
    markdownContent.value = nextMarkdown
    editorContent.value = markdownToHtml(nextMarkdown)
    void migrateAssetMarkdownMedia(asset, nextMarkdown)
    nextTick(() => {
      renderWysiwyg()
      renderPreview()
    })
  }

  function clearAsset() {
    currentChapterTitle.value = ''
    markdownContent.value = ''
    editorContent.value = ''
  }

  async function migrateAssetMarkdownMedia(asset, sourceMarkdown) {
    const result = await migrateMarkdownMediaContent(sourceMarkdown, {
      projectId: asset.projectId ?? null,
      purpose: 'illustration',
      sourceRefs: [{
        refType: 'narrative-asset',
        refId: asset.id,
        projectId: asset.projectId ?? null,
        excerpt: asset.content
      }]
    })
    if (!result.changed) return
    // 来源身份核对：素材已切换或正文已再编辑时，旧迁移结果不得写回
    if (getSelectedChapterId() !== asset.id || markdownContent.value !== sourceMarkdown) return

    const embeddedImagePresentations = remapEmbeddedImagePresentations(
      asset.embeddedImagePresentations,
      sourceMarkdown,
      result.content
    )
    const persisted = updateNarrativeAssetDurable(asset.id, {
      content: result.content,
      contentFormat: 'md',
      embeddedImagePresentations
    })
    if (!persisted.ok) return

    markdownContent.value = result.content
    editorContent.value = markdownToHtml(result.content)
    asset.content = result.content
    asset.contentFormat = 'md'
    asset.embeddedImagePresentations = embeddedImagePresentations
    nextTick(() => {
      renderWysiwyg()
      renderPreview()
    })
  }

  function markSavedFlash() {
    setTimeout(() => {
      if (saveStatus.value === 'saving') saveStatus.value = 'saved'
    }, 300)
  }

  /**
   * 保存当前素材：内容/标题写入 narrativeAssets（唯一正式写入边界）。
   * 返回 { ok, assetId, reason? }；持久化失败时 ok=false，调用方（catalog/页面）
   * 必须阻止切换与破坏性动作——未保存输入保留在编辑器真源 markdownContent。
   *
   * 顺序（O 验收 P0 修正）：先构造 patch 并持久化，成功后才推进 catalog 投影与插画版式；
   * 投影不再是“写成功前的已保存真源”。useStorage.setItem 会吞掉配额异常只返回 false，
   * 且 updateNarrativeAsset 不检查该返回值，因此以“写后读回”作为持久化判据
   * （narrativeAssets.normalizeText 为 trim-only 且文件冻结，这里本地复刻比较基准）。
   */
  function saveCurrentChapter() {
    const chapter = getSelectedAsset()
    if (!chapter) return { ok: true, assetId: null, skipped: true }

    syncFromCurrentEditor()
    const patch = { title: currentChapterTitle.value, content: markdownContent.value }
    try {
      updateNarrativeAsset(chapter.id, patch)
    } catch (error) {
      console.warn('[Notes] 保存失败（输入保留在编辑器）:', error)
      saveStatus.value = 'failed'
      return { ok: false, reason: 'storage-write-failed', assetId: chapter.id }
    }

    const persisted = listNarrativeAssets({ status: null }).find((asset) => asset.id === chapter.id)
    const persistedOk = Boolean(persisted)
      && persisted.title === String(patch.title ?? '').trim()
      && persisted.content === String(patch.content ?? '').trim()
    if (!persistedOk) {
      saveStatus.value = 'failed'
      return { ok: false, reason: 'storage-write-failed', assetId: chapter.id }
    }

    chapter.title = patch.title
    chapter.content = patch.content
    try {
      flushVisualPresentation(chapter)
    } catch (error) {
      // 正文已持久化；版式落盘失败只降级提示，不回滚、不判失败
      console.warn('[Notes] 插画版式落盘失败（正文已保存）:', error)
    }
    saveStatus.value = 'saved'
    return { ok: true, assetId: chapter.id }
  }

  function onContentChange() {
    syncFromCurrentEditor()
    saveStatus.value = 'unsaved'
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      saveTimeout = null
      saveStatus.value = 'saving'
      saveCurrentChapter()
      markSavedFlash()
    }, 1000)
  }

  function onTitleChange() {
    saveStatus.value = 'unsaved'
    if (titleTimeout) clearTimeout(titleTimeout)
    titleTimeout = setTimeout(() => {
      titleTimeout = null
      saveCurrentChapter()
    }, 500)
  }

  /** 卸载/离页冲刷：去抖中的标题与正文立即落盘，避免关页签丢输入。 */
  function flushPendingSave() {
    if (titleTimeout) {
      clearTimeout(titleTimeout)
      titleTimeout = null
    }
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    saveCurrentChapter()
  }

  const flushOnLeaveEvent = () => flushPendingSave()
  const flushOnHidden = () => {
    if (document.visibilityState === 'hidden') flushPendingSave()
  }

  onMounted(() => {
    window.addEventListener('beforeunload', flushOnLeaveEvent)
    window.addEventListener('pagehide', flushOnLeaveEvent)
    document.addEventListener('visibilitychange', flushOnHidden)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', flushOnLeaveEvent)
    window.removeEventListener('pagehide', flushOnLeaveEvent)
    document.removeEventListener('visibilitychange', flushOnHidden)
    flushPendingSave()
  })

  function getEditorPlainText() {
    return markdownToPlainText(markdownContent.value || '')
  }

  return {
    // 状态
    currentChapterTitle,
    editorMode,
    markdownContent,
    editorContent,
    renderedMarkdownSource,
    renderedMarkdownContent,
    saveStatus,
    statusText,
    previewHtml,
    // 生命周期动作
    loadAsset,
    clearAsset,
    saveCurrentChapter,
    flushPendingSave,
    onContentChange,
    onTitleChange,
    switchEditorMode,
    syncMarkdownToEditor,
    syncFromCurrentEditor,
    setEditorPlainText,
    getEditorPlainText,
    // 供页面插入图片引用使用（保持 markdown 引用合同）
    createMarkdownMediaReference,
    remapEmbeddedImagePresentations
  }
}
