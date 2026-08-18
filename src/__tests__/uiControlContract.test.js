import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { trapFocusWithin } from '../composables/useTransientLayer'

// U1：控件契约 —— workbench-controls.css 静态检查。
// 断言核心 class、:focus-visible、coarse pointer 命中区，并防止 transition: all 回潮。
const css = readFileSync(resolve(__dirname, '../../src/styles/workbench-controls.css'), 'utf8')
const themeAssets = readFileSync(resolve(__dirname, '../components/theme/ThemeAssets.vue'), 'utf8')
const experience = readFileSync(resolve(__dirname, '../pages/Experience.vue'), 'utf8')
const appShell = readFileSync(resolve(__dirname, '../layouts/AppShell.vue'), 'utf8')
const inputArea = readFileSync(resolve(__dirname, '../components/InputArea.vue'), 'utf8')
const uiAudit = readFileSync(resolve(__dirname, '../../scripts/ui-audit.mjs'), 'utf8')
const proseEssay = readFileSync(resolve(__dirname, '../pages/ProseEssay.vue'), 'utf8')
const notes = readFileSync(resolve(__dirname, '../pages/Notes.vue'), 'utf8')
const writing = readFileSync(resolve(__dirname, '../pages/Writing.vue'), 'utf8')
const legacyExperience = readFileSync(resolve(__dirname, '../pages/legacy/Experience.vue'), 'utf8')
const notebookEditor = readFileSync(resolve(__dirname, '../components/writing/WritingNotebookEditor.vue'), 'utf8')
const gamePanel = readFileSync(resolve(__dirname, '../components/GamePanel.vue'), 'utf8')
const narrativeTurn = readFileSync(resolve(__dirname, '../components/experience/NarrativeTurn.vue'), 'utf8')
const imageWorkbench = readFileSync(resolve(__dirname, '../components/media/ImageGenerationWorkbench.vue'), 'utf8')

describe('workbench control contract (U1)', () => {
  it('defines the six control semantics with shared focus, hit areas, and no transition:all', () => {
    for (const cls of ['control-primary', 'control-secondary', 'control-quiet', 'control-icon', 'control-toggle', 'control-danger', 'control-group']) {
      expect(css).toContain(`.${cls}`)
    }
    // 共享基座：disabled / focus-visible / coarse pointer 命中区
    expect(css).toContain("[class*='control-']:focus-visible")
    expect(css).toContain("[class*='control-']:disabled")
    expect(css).toMatch(/@media \(pointer: coarse\)/)
    expect(css.match(/min-height: 44px/g)?.length).toBeGreaterThanOrEqual(1)
    // 禁止 transition: all（只允许 color/background/opacity/transform）
    expect(css).not.toMatch(/transition:\s*all/)
    for (const transition of css.match(/transition:[^;]+;/g) || []) {
      expect(transition).toMatch(/color|background|opacity|transform|none/)
    }
    // toggle 激活态走 aria-pressed，不用框
    expect(css).toContain(".control-toggle[aria-pressed='true']")
    // 输入安全 token
    expect(css).toContain('--control-focus')
    expect(css).toContain('--control-danger')
    // ThemeAssets 只在主题2（legacy）加载控件层
    expect(themeAssets).toContain('workbench-controls.css')
  })

  it('closes the topmost experience overlay with Escape before the rail', () => {
    expect(experience).toContain('if (writingCollectOpen.value) {')
    expect(experience).toContain("id: 'experience-writing-collect'")
    expect(experience).toContain('initialFocus: () => writingCollectCloseRef.value')
    expect(experience).toContain('@keydown="trapWritingCollectFocus"')
    expect(experience).toContain('writingCollectOpen.value || quickNoteOpen.value')
    expect(experience).toContain("if (inlineDetail.value) {")
    expect(experience).toContain("if (codexDetailSection.value) {")
    expect(experience).toContain("if (quickNoteOpen.value) {")
    expect(experience).toContain('closeCodexSheet()')

    const dialog = document.createElement('div')
    dialog.innerHTML = '<button type="button">first</button><button type="button">last</button>'
    document.body.appendChild(dialog)
    const [first, last] = dialog.querySelectorAll('button')
    first.focus()
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    expect(trapFocusWithin(backwards, dialog)).toBe(true)
    expect(document.activeElement).toBe(last)
    dialog.remove()
  })

  it('keeps shell navigation and experience context single-owned', () => {
    const shellTemplate = appShell.split('<style scoped>')[0]
    const experienceTemplate = experience.split('<script setup>')[0]

    expect(shellTemplate).not.toContain('shell-tabbar')
    expect(shellTemplate).not.toContain('shell-subnav')
    expect(shellTemplate).toContain('shell-drawer__utility')
    expect(shellTemplate).toContain(':active-panel="activePanel"')
    expect(shellTemplate).toContain('data-test="shell-storage-status"')

    expect(experienceTemplate).not.toContain('ws-topstrip__settings-link')
    expect(experienceTemplate).not.toContain('ws-topstrip__session-chip')
    expect(experienceTemplate).toContain('ws-session-trigger')
    expect(experienceTemplate).toContain('ws-more-menu')
    expect(experienceTemplate).toContain('ws-topstrip__codex-toggle')
  })

  it('keeps the composer focused on one input and one primary action slot', () => {
    expect(inputArea).toContain('<textarea')
    expect(inputArea).toContain('placeholder="写下行动或续写方向"')
    expect(inputArea).toContain('aria-label="发送"')
    expect(inputArea).toContain('aria-label="停止生成"')
    expect(inputArea).toContain('composer-menu')
    expect(inputArea).toContain('dialogue-panel" role="dialog"')
    expect(inputArea).toContain('<span class="quick-btn__label">对话</span>')
    expect(inputArea).not.toContain('<span class="quick-btn__label">对话模式</span>')
    expect(inputArea).not.toContain('placeholder="输入你的行动... (Cmd+Enter 发送 · Esc 清空)"')
  })

  it('does not count hidden drawers or normal document scrolling as clipped UI', () => {
    expect(uiAudit).toContain("element.closest('[aria-hidden=\"true\"], [inert]')")
    expect(uiAudit).toContain("const fixedVerticalOverflow = ['fixed', 'sticky'].includes(style.position)")
  })

  it('keeps image generation in materials and removes the retired canvas drawer', () => {
    const proseTemplate = proseEssay.split('<script setup>')[0]
    expect(proseEssay).toContain('buildDirectorSourceRefs()')
    expect(proseTemplate).not.toContain('image-gen-rail')
    expect(proseTemplate).not.toContain('aria-label="生图功能"')
    expect(imageWorkbench).not.toContain('image-gen-rail')
    expect(imageWorkbench).not.toContain('imageDrawerOpen')
    expect(imageWorkbench).not.toContain("presentation !== 'inline'")
    expect(notes).toContain('<ImageGenerationWorkbench')
    expect(writing).not.toContain('MediaGenerationDrawer')
    expect(legacyExperience).not.toContain('MediaGenerationDrawer')
    expect(existsSync(resolve(__dirname, '../components/media/MediaGenerationDrawer.vue'))).toBe(false)
    expect(imageWorkbench).toContain('ref="referenceInput"')
    expect(imageWorkbench).toContain('isSupportedLocalImage')
    expect(imageWorkbench).toContain('referenceUploadMessage')
  })

  it('passes the current notebook document to AI commands and uses viewport coordinates', () => {
    expect(notebookEditor).toContain('markdown: getWritingDocumentMarkdown(currentDocument.value)')
    expect(notebookEditor).toContain('markdownFrom')
    expect(notebookEditor).toContain('resolveWritingCommandMenuPosition')
    expect(notebookEditor).toContain('const scale = getBodyUiScale()')
    expect(notebookEditor).toContain('measuredHeight / scale')
    expect(notebookEditor).not.toContain('commandMenu.value.top = Math.round(visualTop / scale)')
    expect(writing).toContain('command.cursorMarkdownOffset != null')
    expect(writing).toContain('command.cursorMarkdownOffset')
    expect(writing).toContain('if (command.markdown != null)')
    expect(writing).toContain('const target = getNodeRewriteTarget(previousNodeId)')
    expect(writing).toContain('getRewriteTargetFromAnnotation(annotation)')
    expect(writing).toContain('target.startOffset')
    expect(writing).toContain('return !getWritingCandidateStaleReason(candidate, current)')
    expect(writing).not.toContain("quickNoteStatus.value = '上一段定位已经变化，请重新打开命令。'")
    expect(narrativeTurn).toContain('canCollectWriting')
    expect(narrativeTurn).toContain('收进稿件')
    expect(gamePanel).toContain("emit('collect-writing', { message, turn })")
    expect(experience).toContain('aria-labelledby="writing-collect-title"')
    expect(experience).toContain('aria-label="目标作品"')
    expect(experience).toContain('aria-label="目标章节"')
    expect(notebookEditor).toContain('data-writing-unit')
    expect(notebookEditor).toContain('splitWritingUnit')
    expect(notebookEditor).toContain('mergeWritingUnit')
    expect(notebookEditor).not.toMatch(/运行单元|执行序号|输出区|command mode/i)
    expect(writing).toMatch(/从此处分开|与上一单元合并|来自体验/)
    expect(writing).toContain('class="writing-block-history"')
    expect(writing).toContain('v-for="entry in recentWritingBlockHistory"')
    expect(writing).toContain('@click="restoreWritingBlockHistory(entry)"')
    const writingAgentContext = writing.slice(
      writing.indexOf('function getWritingAgentPageContext()'),
      writing.indexOf('function clearCopilotReference', writing.indexOf('function getWritingAgentPageContext()'))
    )
    expect(writingAgentContext).toContain('nodeTarget')
    expect(writingAgentContext).not.toContain('blockTarget')
    const selectionPayload = notebookEditor.slice(
      notebookEditor.indexOf("emit('selection-change'"),
      notebookEditor.indexOf('updateCurrentLineOverlay()', notebookEditor.indexOf("emit('selection-change'"))
    )
    expect(selectionPayload).not.toMatch(/blockId:|blockRevision:|startBlockId:|endBlockId:/)
    const exposedEditorApi = notebookEditor.slice(notebookEditor.indexOf('defineExpose({'), notebookEditor.indexOf('</script>'))
    expect(exposedEditorApi).not.toMatch(/findBlockRange|focusBlock|replaceBlockText|replaceBlockRanges/)
  })

  it('restores the writing viewport after creating an annotation', () => {
    expect(writing).toContain('const scrollState = captureWritingScrollState()')
    expect(writing).toContain('restoreWritingScrollState(scrollState)')
    expect(writing).toContain("focus({ preventScroll: true })")
  })
})
