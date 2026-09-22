<template>
  <div class="writing-page wall wt3-prototype" :class="{ 'is-zen': writingTypography.zen }" @click="onGlobalClick">
    <!-- 专注全屏退出按钮：仅 Zen 态可见 -->
    <button
      v-if="writingTypography.zen"
      class="wall__zen-exit"
      type="button"
      :title="tr(&quot;退出专注全屏（Esc）&quot;)"
      @click="toggleWritingZen"
    >{{ tr('退出全屏') }}</button>
    <!-- 页面内只保留编辑工具、保存反馈与章节目录；作品切换由全局标签和首页负责。 -->
    <div class="wall__cork" :inert="illustratorBlocking ? '' : undefined">

      <div id="authoring-editor-toolbar-host" class="authoring-editor-toolbar-host"></div>

      <div v-if="saveFeedbackVisible" class="wall__save-chip" :class="`is-${saveStatus}`" :aria-label="tr('保存状态')">
        <span class="wall__save-chip-state">{{ tr(stampStateText) }}</span>
      </div>

      <button
        ref="chapterDrawerTriggerRef"
        class="wall__chapter-trigger"
        type="button"
        :aria-expanded="chapterDrawerOpen.toString()"
        aria-controls="writing-chapter-shelf"
        @click.stop="openChapterDrawer"
      >
        <WorkbenchIcon name="panel-left" :size="15" />
        <span>{{ tr('章节目录') }}</span>
      </button>

      <div class="wall__tabs">
        <button
          ref="moreToolsTriggerRef"
          class="wall__tab"
          type="button"
          :aria-expanded="moreMenuOpen.toString()"
          :aria-label="tr(&quot;更多写作操作&quot;)"
          :title="tr(&quot;更多写作操作&quot;)"
          @pointerdown="freezeMobileToolSource"
          @click.stop="toggleMoreMenu($event)"
        >
          <WorkbenchIcon name="more" :size="16" />
          <span>{{ chapterShelfSheetMode ? tr('工具') : tr('更多') }}</span>
        </button>
        <Teleport to="body">
          <!-- 工具条是 42px 单行 + overflow 裁切，absolute 菜单会被整体裁没（死按钮）；
               菜单固定定位到触发按钮下方，点击任意位置或 Esc 关闭。 -->
          <div v-if="moreMenuOpen" class="wall__more-menu is-fixed-menu" :style="moreMenuStyle" role="menu" :aria-label="tr(&quot;更多写作操作&quot;)" @click.stop>
            <div class="wall__more-tools" :aria-label="tr(&quot;写作工具&quot;)">
              <button type="button" role="menuitem" @pointerdown="freezeReviewSource" @click="moreAction(openReviewPanel)">{{ tr('校对') }}</button>
              <button type="button" role="menuitem" @pointerdown="freezeSearchSource" @click="moreAction(openSearchPanel)">{{ tr('查找') }}</button>
              <button type="button" role="menuitem" @click="moreAction(toggleQuickWords)">{{ tr('快捷词') }}</button>
              <button type="button" role="menuitem" @click="moreAction(openNameGenerator)">{{ tr('取名') }}</button>
              <button type="button" role="menuitem" @click="moreAction(() => selectInspectorTool('dual'))">{{ tr('双栏') }}</button>
              <button type="button" role="menuitem" data-test="mobile-illustrator-action" @click="openIllustratorFromMobileTools">{{ tr('生图') }}</button>
            </div>
            <button type="button" role="menuitem" data-test="more-reopen-first-run" @click="moreAction(reopenFirstRunGuidance)">{{ tr('继续创作指引') }}</button>
            <button type="button" role="menuitem" @click="moreAction(createNewBook)">{{ tr('新建书稿') }}</button>
            <button type="button" role="menuitem" data-test="more-backup-settings" @click="moreAction(openBackupSettings)">{{ tr('备份与恢复') }}</button>
            <button type="button" role="menuitem" @click="moreAction(exportCurrentChapterManuscript)" :disabled="!selectedChapterId">{{ tr('导出当前章节') }}</button>
            <button type="button" role="menuitem" @click="moreAction(exportCurrentBookManuscript)" :disabled="!selectedBookId">{{ tr('导出整本书') }}</button>
            <button type="button" role="menuitem" @click="moreAction(openManuscriptImport)">{{ tr('导入 TXT / Markdown') }}</button>
            <button type="button" role="menuitem" @click="moreAction(exportChapterStoryboardDraft)" :disabled="!selectedChapterId">{{ tr('导出章节分镜') }}</button>
            <button type="button" role="menuitem" @click="moreAction(openAssetInbox)">{{ tr('素材收件箱') }}</button>
            <button type="button" role="menuitem" @click="moreAction(openMaterialsPage)">{{ tr('素材库') }}</button>
            <button type="button" role="menuitem" :aria-pressed="inlineSuggestionEnabled.toString()" @click="moreAction(toggleInlineSuggestion)">{{ inlineSuggestionEnabled ? tr('自动联想：开') : tr('自动联想：关') }}</button>
            <button type="button" role="menuitem" @click="moreAction(goToAdventure)">{{ tr('回到冒险') }}</button>
            <button type="button" role="menuitem" @click="moreAction(goBack)">{{ tr('返回首页') }}</button>
          </div>
        </Teleport>
        <Teleport to="body">
          <!-- 左栏右键菜单：章节行 / 卷组 -->
          <div
            v-if="shelfContextMenu.show"
            class="shelf-context-menu"
            :style="{ position: 'fixed', top: `${shelfContextMenu.y}px`, left: `${shelfContextMenu.x}px` }"
            role="menu"
            :aria-label="shelfContextMenu.kind === 'chapter' ? tr('章节操作') : tr('卷操作')"
            @click.stop
            @contextmenu.prevent.stop
          >
            <template v-if="shelfContextMenu.kind === 'chapter'">
              <button type="button" role="menuitem" @click="shelfMenuAction((id) => selectChapter(id))">{{ tr('打开章节') }}</button>
              <button type="button" role="menuitem" @click="shelfMenuAction(openChapterInDual)">{{ tr('在双栏打开') }}</button>
              <button type="button" role="menuitem" @click="shelfMenuAction(renameChapterFromShelf)">{{ tr('重命名') }}</button>
              <button type="button" role="menuitem" @click="shelfMenuAction(() => exportCurrentChapterManuscript())">{{ tr('导出本章') }}</button>
              <button type="button" role="menuitem" @click="shelfMenuAction(() => selectInspectorTool('history'))">{{ tr('历史版本') }}</button>
              <div class="shelf-menu-divider"></div>
              <button type="button" role="menuitem" class="is-danger" @click="shelfMenuAction(deleteChapterFromShelf)">{{ tr('删除本章') }}</button>
            </template>
            <template v-else>
              <button type="button" role="menuitem" @click="shelfMenuAction(() => createNewChapter())">{{ tr('新建章节') }}</button>
              <button type="button" role="menuitem" @click="shelfMenuAction(() => exportCurrentBookManuscript())">{{ tr('导出整本书') }}</button>
            </template>
          </div>
        </Teleport>
        <!-- 全局锁定主题2亮色：亮/暗切换隐藏（用户要求） -->
        <button v-if="false" class="wall__tab wall__tab--mode" @click="toggleTheme" :title="isDark ? tr('切换亮色') : tr('切换暗色')" :aria-label="isDark ? tr('切换亮色') : tr('切换暗色')">
          <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 保存失败/检测到恢复副本时的自救条:唯一自救位置,成功或丢弃后即退场。
         不抢焦点、不弹窗;正文输入保持可继续。 -->
    <div
      v-if="saveRescueVisible"
      class="wall__save-rescue"
      :class="saveStatus === 'error' ? 'is-error' : 'is-recovery'"
      data-test="save-rescue"
      role="status"
    >
      <span class="wall__save-rescue__text">{{ tr(saveRescueText) }}</span>
      <div class="wall__save-rescue__actions">
        <button v-if="saveStatus === 'error'" type="button" data-test="save-rescue-retry" @click="retrySaveFromRescue">{{ tr('重试保存') }}</button>
        <button v-if="saveStatus === 'error'" type="button" data-test="save-rescue-export" @click="exportUnsavedManuscriptFromRescue">{{ tr('导出当前正文') }}</button>
        <button v-if="writingRecoveryDraft" type="button" data-test="save-rescue-recovery" @click="openRecoveryFromRescue">{{ tr('查看恢复稿') }}</button>
      </div>
    </div>

    <button
      v-if="chapterDrawerOpen"
      class="wall__chapter-overlay"
      type="button"
      :aria-label="tr(&quot;关闭章节列表&quot;)"
      @click="closeChapterDrawer"
    ></button>

    <!-- 墙主区 — 248px 书架 + 1fr 中央卷宗 -->
    <main ref="writingMainRef" class="wall__main" :inert="illustratorBlocking ? '' : undefined" :class="{ 'has-inspector': inspectorOpen, 'is-dual-inspector': inspectorOpen && inspectorDualColumn, 'has-sequential-inspector': inspectorOpen && activeInspectorTool === 'rehearsal' }">
      <!-- 左：5 层书架 + 章节档案夹 -->
      <aside
        id="writing-chapter-shelf"
        ref="chapterShelfRef"
        class="wall__shelf workspace-sidebar"
        :class="{ 'is-mobile-open': chapterDrawerOpen }"
        :tabindex="chapterDrawerOpen ? -1 : undefined"
        :inert="chapterShelfSheetMode && !chapterDrawerOpen ? '' : undefined"
        :aria-hidden="chapterShelfSheetMode && !chapterDrawerOpen ? 'true' : undefined"
        :aria-label="tr(&quot;章节书架&quot;)"
      >
        <div class="wall__shelf-manuscript">
          <div class="authoring-chapter-search">
            <WorkbenchIcon name="search" :size="14" />
            <input v-model="chapterShelfQuery" type="search" :placeholder="tr(&quot;搜索章节&quot;)" :aria-label="tr(&quot;搜索章节&quot;)" />
          </div>

          <div class="authoring-chapter-create">
            <button class="is-primary control-primary" type="button" @click="createNewChapter" :disabled="!selectedBookId">{{ tr('新建章') }}</button>
            <button class="control-secondary" type="button" @click="createNewBook">{{ tr('新建书') }}</button>
          </div>

          <ManuscriptLanguageSelect v-if="currentBook" :model-value="currentBook.manuscriptLanguage || ''" @update:model-value="setManuscriptLanguage" />
          <div v-if="selectedBookId" class="authoring-chapter-tree">
            <!-- 文本工作台 v3 正式文档树：构思/正文共用同一稿面。 -->
            <AuthoringIdeaShelf
              :docs="wt3IdeaShelfDocs"
              :catalog="authoringRunReferenceCatalog"
              :selected="reconciledAuthoringRunReferences"
              :active-doc-id="wt3ActiveDocId"
              :current-chapter-id="selectedChapterId || ''"
              :query="authoringRunReferenceQuery"
              :notice="authoringRunReferenceNotice"
              :legacy-note-count="wt3LegacyNoteCount"
              @create="wt3QuickCapture"
              @migrate="wt3MigrateLegacyNotes"
              @open="openExplorationDoc"
              @open-dual="openExplorationInDual"
              @extract-preview="openNotesExtraction"
              @add="addAuthoringRunReference"
              @remove="removeAuthoringRunReference"
              @refresh="refreshAuthoringRunReference"
              @link-current="wt3LinkDocToCurrentChapter"
              @park="wt3SetDocStatus($event, 'parked')"
              @restore="wt3SetDocStatus($event, 'active')"
              @delete="wt3DeleteDoc"
              @open-full="openMaterialsPage"
              @update:query="authoringRunReferenceQuery = $event"
            />
            <AuthoringNotesExtractionPreview v-if="notesExtractionSource"
              :key="notesExtractionSource.id + ':' + notesExtractionSource.revision"
              :book-id="selectedBookId" :source="notesExtractionSource"
              :existing-entries="boundWorldbook?.entries || []"
              @close="notesExtractionSource = null" @saved="wt3RefreshDocs()" />
            <div class="authoring-chapter-group is-current" @contextmenu.prevent="openShelfContextMenu($event, 'volume')">
              <WorkbenchIcon name="folder" :size="14" />
              <span>{{ tr('第一卷') }}</span>
              <small>{{ tr('{length} 章', { length: chapters.length }) }}</small>
            </div>
            <div
              v-for="entry in visibleChapterEntries"
              :key="entry.chapter.id"
              class="authoring-chapter-row workspace-nav-item workspace-nav-item--tree"
              :class="{
                'is-active': selectedChapterId === entry.chapter.id,
                'is-dragging': dragIndex === entry.index,
                'is-drop-target': dropTargetIndex === entry.index && dropTargetIndex !== dragIndex
              }"
              draggable="true"
              role="button"
              tabindex="0"
              :aria-pressed="selectedChapterId === entry.chapter.id"
              @keydown.enter.prevent="selectChapter(entry.chapter.id)"
              @keydown.space.prevent="selectChapter(entry.chapter.id)"
              :aria-label="tr('{value0} · 拖拽排序', { value0: chapterRowLabel(entry.index, entry.chapter.title) })"
              :aria-grabbed="dragIndex === entry.index ? 'true' : 'false'"
              :aria-dropeffect="dropTargetIndex === entry.index ? 'move' : 'none'"
              @click="selectChapter(entry.chapter.id)"
              @contextmenu.prevent="openShelfContextMenu($event, 'chapter', entry)"
              @dragstart="onChapterDragStart($event, entry.index, selectedBookId)"
              @dragover.prevent="onChapterDragOver($event, entry.index, selectedBookId)"
              @dragleave="onChapterDragLeave(entry.index)"
              @drop="onChapterDrop($event, entry.index, selectedBookId)"
              @dragend="onChapterDragEnd"
            >
              <span class="authoring-chapter-row__title workspace-nav-label">
                <span class="authoring-chapter-row__ordinal">{{ chapterRowParts(entry.index, entry.chapter.title).ordinal }}</span>
                <span class="authoring-chapter-row__name">{{ chapterRowParts(entry.index, entry.chapter.title).name }}</span>
              </span>
              <span class="authoring-chapter-row__count workspace-nav-meta">{{ countWritingText(getChapterMarkdown(entry.chapter), currentBook?.manuscriptLanguage).toLocaleString(uiLocale) }}</span>
            </div>
            <p v-if="!visibleChapterEntries.length" class="authoring-chapter-empty">{{ tr('没有匹配的章节') }}</p>
          </div>

          <!-- 书与世界书显式绑定（Task 2）：一行文字 + 文字动作，不加卡片/徽标。 -->
          <div v-if="selectedBookId" class="wall__binding-line" data-test="book-worldbook-binding">
            <template v-if="bindingSelectOpen">
              <select
                v-model="bindingDraftWorldbookId"
                class="wall__binding-select"
                :aria-label="tr(&quot;选择要绑定的世界书&quot;)"
              >
                <option value="">{{ tr('暂不绑定') }}</option>
                <option v-for="wb in worldStore.worldbooksIndex" :key="wb.id" :value="String(wb.id)">{{ wb.name || wb.id }}</option>
              </select>
              <button class="wall__shelf-pin-btn" type="button" data-test="confirm-binding" @click="confirmBindingSelect">{{ tr('确定') }}</button>
              <button class="wall__shelf-pin-btn" type="button" @click="bindingSelectOpen = false">{{ tr('取消') }}</button>
            </template>
            <template v-else>
              <button
                class="wall__binding-compact"
                type="button"
                data-test="bind-worldbook"
                :title="bookWorldbookStatus.status === 'bound' ? tr('当前世界书：{value0}，点击更换', { value0: boundWorldbook?.name || bookWorldbookStatus.worldbook?.name || bookWorldbookStatus.worldbookId }) : tr('关联世界书')"
                @click="openBindingSelect"
              >
                <WorkbenchIcon name="book" :size="13" />
                <span v-if="bookWorldbookStatus.status === 'bound'">{{ boundWorldbook?.name || bookWorldbookStatus.worldbook?.name || bookWorldbookStatus.worldbookId }}</span>
                <span v-else-if="bookWorldbookStatus.status === 'missing'" class="is-missing" data-test="worldbook-missing">{{ tr('世界书已缺失') }}</span>
                <span v-else>{{ tr('关联世界书') }}</span>
              </button>
            </template>
          </div>
        </div>

        <!-- 本章现场（Task 1.3 挂载现场条）；两行 grid 的 auto 行，不随稿件滚动。 -->
        <div class="wall__shelf-scene" :aria-label="tr(&quot;本章现场&quot;)">
          <AuthoringSceneRail
            :projection="sceneProjection"
            @open-detail="openSceneDetail"
            @advance-with="handleSceneAdvanceWith"
            @edit="handleSceneEditRequest"
            @bind-worldbook="openBindingSelect"
          />
        </div>

        <div class="wall__shelf-board" aria-hidden="true"></div>
      </aside>

      <!-- 中：卷宗稿纸（中央主线） -->
      <section class="wall__dossier" :data-active-pane="activeWritingPane === 'main' ? 'true' : 'false'" :aria-label="tr(&quot;章节正文卷宗&quot;)">
        <template v-if="!selectedBookId">
          <div class="wall__dossier-empty">
            <div class="wall__empty-copy">
              <span class="wall__empty-kicker">{{ tr('空白书稿') }}</span>
              <strong>{{ tr('尚未建立书稿') }}</strong>
            </div>
            <div class="wall__empty-actions">
              <button class="wall__pin-cta" type="button" @click="createNewBook">{{ tr('新建书稿') }}</button>
              <button class="wall__pin-link" type="button" data-test="empty-import-manuscript" @click="openManuscriptImport">{{ tr('导入 TXT / Markdown') }}</button>
            </div>
          </div>
        </template>

        <template v-else-if="!selectedChapterId">
          <div class="wall__dossier-empty">
            <div class="wall__empty-copy">
              <span class="wall__empty-kicker">{{ tr('空白章节') }}</span>
              <strong>{{ tr('尚未建立章节') }}</strong>
            </div>
            <div class="wall__empty-actions">
              <button class="wall__pin-cta" type="button" @click="createNewChapter">{{ tr('建立第一章') }}</button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="wall__dossier-body">
            <Teleport to="#authoring-editor-toolbar-host">
            <div class="editor-toolbar">
              <div class="toolbar-group">
                <button class="control-quiet tool-btn" type="button" :title="tr(&quot;撤销当前活动窗（Ctrl/Cmd+Z）&quot;)" :disabled="activeWritingMutationLocked || !activeNotebookCommandAvailability.undo" @click="undoNotebookEdit">{{ tr('撤销') }}</button>
                <button class="control-quiet tool-btn" type="button" :title="tr(&quot;重做当前活动窗（Ctrl/Cmd+Shift+Z）&quot;)" :disabled="activeWritingMutationLocked || !activeNotebookCommandAvailability.redo" @click="redoNotebookEdit">{{ tr('重做') }}</button>
              </div>
              <div class="toolbar-sep"></div>
              <div class="toolbar-group">
                <div class="toolbar-popover-anchor">
                <button class="control-quiet tool-btn" :class="{ active: showFontPanel }" type="button" :aria-expanded="showFontPanel.toString()" @click.stop="toggleFontPanel" :title="tr(&quot;正文排版设置&quot;)">{{ tr('排版') }}</button>
                <div class="font-panel" v-if="showFontPanel" :style="fontPanelStyle" @click.stop>
                  <div class="fp-row"><span class="fp-label">{{ tr('字体') }}</span>
                    <select class="fp-select" :value="writingTypography.fontKey" @change="writingTypography.setFontKey($event.target.value)">
                      <option v-for="option in writingFontOptions" :key="option.key" :value="option.key">{{ tr(option.label) }}</option>
                    </select>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('大小') }}</span>
                    <div class="fp-size-btns">
                      <button class="fp-btn" @click="adjustFontSize(-1)" :title="tr(&quot;缩小&quot;)" :disabled="writingTypography.fontSize <= MIN_FONT_SIZE">A-</button>
                      <span class="fp-size-val">{{ editorFontSize }}</span>
                      <button class="fp-btn" @click="adjustFontSize(1)" :title="tr(&quot;放大&quot;)" :disabled="writingTypography.fontSize >= MAX_FONT_SIZE">A+</button>
                    </div>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('行距') }}</span>
                    <select class="fp-select" :value="writingTypography.lineHeight" @change="writingTypography.setLineHeight($event.target.value)">
                      <option v-for="lh in [1.5, 1.7, 1.8, 1.9, 2.0, 2.2]" :key="lh" :value="lh">{{ lh }}</option>
                    </select>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('首行') }}</span>
                    <button class="fp-btn fp-btn--text" type="button" :aria-pressed="writingTypography.firstLineIndent.toString()" @click="writingTypography.toggleFirstLineIndent()">
                      {{ writingTypography.firstLineIndent ? tr('缩进两字') : tr('不缩进') }}
                    </button>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('段距') }}</span>
                    <select class="fp-select" :value="writingTypography.paragraphGap" @change="writingTypography.setParagraphGap($event.target.value)">
                      <option :value="0.65">{{ tr('紧凑') }}</option>
                      <option :value="1.05">{{ tr('标准') }}</option>
                      <option :value="1.45">{{ tr('宽松') }}</option>
                    </select>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('打字机') }}</span>
                    <button class="fp-btn fp-btn--text" type="button" :aria-pressed="writingTypography.typewriter.toString()" :title="tr(&quot;光标行保持屏幕中央（Ctrl/Cmd+Alt+T）&quot;)" @click="writingTypography.toggleTypewriter()">
                      {{ writingTypography.typewriter ? tr('开') : tr('关') }}
                    </button>
                  </div>
                  <div class="fp-row"><span class="fp-label">{{ tr('聚焦') }}</span>
                    <button class="fp-btn fp-btn--text" type="button" :aria-pressed="writingTypography.focusParagraph.toString()" :title="tr(&quot;淡化非当前段落（Ctrl/Cmd+Alt+F）&quot;)" @click="writingTypography.toggleFocusParagraph()">
                      {{ writingTypography.focusParagraph ? tr('开') : tr('关') }}
                    </button>
                  </div>
                </div>
                </div>
                <button class="control-quiet tool-btn" :class="{ active: showQuickWords }" type="button" :aria-expanded="showQuickWords.toString()" @click.stop="toggleQuickWords" :title="tr(&quot;管理写作快捷词&quot;)">{{ tr('快捷词') }}</button>
                <button class="control-quiet tool-btn" :class="{ active: showNameGen }" type="button" :aria-expanded="showNameGen.toString()" @click.stop="openNameGenerator" :title="tr(&quot;快速取名&quot;)">{{ tr('取名') }}</button>
                <button
                  ref="illustratorTriggerRef"
                  class="control-quiet tool-btn authoring-illustrator-trigger"
                  :class="{ active: illustratorOpen }"
                  type="button"
                  :aria-expanded="illustratorOpen.toString()"
                  :title="tr(&quot;根据当前选区或文本块生成插画&quot;)"
                  data-test="authoring-illustrator-trigger"
                  @pointerdown="freezeIllustratorSource"
                  @click.stop="openIllustrator"
                ><WorkbenchIcon name="image" :size="15" /><span>{{ tr('生图') }}</span></button>
              </div>
              <div class="toolbar-sep"></div>
              <div class="toolbar-group">
                <button
                  class="control-quiet tool-btn"
                  :class="{ active: writingTypography.zen }"
                  :aria-pressed="writingTypography.zen.toString()"
                  type="button"
                  :title="tr(&quot;专注全屏：隐藏周边界面，Esc 退出（Ctrl/Cmd+Alt+Z）&quot;)"
                  @click="toggleWritingZen"
                >{{ tr('专注') }}</button>
              </div>
              <div class="toolbar-sep"></div>
              <div v-if="editorMode === 'markdown'" class="toolbar-group">
                <button
                  class="control-quiet tool-btn capture-selection-btn"
                  type="button"
                  :disabled="!canCaptureSelection"
                  :title="tr(&quot;把选中的文字收为素材&quot;)"
                  data-test="capture-selection"
                  @click="captureSelectionAsAsset"
                >{{ tr('收为素材') }}</button>
                <button
                  class="control-quiet tool-btn annotation-toolbar-btn"
                  :class="{ active: inspectorOpen && inspectorTab === 'comments' }"
                  type="button"
                  :disabled="!selectedText"
                  :title="tr(&quot;为选中文字添加批注&quot;)"
                  @click="openAnnotationInspector"
                >{{ tr('批注') }}<span v-if="openAnnotationCount" class="annotation-toolbar-count">{{ openAnnotationCount }}</span>
                </button>
              </div>
              <div v-if="editorMode === 'markdown'" class="toolbar-sep"></div>
              <div class="toolbar-group">
                <button
                  class="control-quiet tool-btn"
                  :class="{ active: reviewPanelOpen }"
                  type="button"
                  :title="tr(&quot;校对当前文稿&quot;)"
                  @pointerdown="freezeReviewSource"
                  @click.stop="openReviewPanel"
                >{{ tr('校对') }}</button>
                <button
                  class="control-quiet tool-btn"
                  :class="{ active: searchPanelOpen }"
                  type="button"
                  :title="tr(&quot;查找当前章、全书、构思或设定&quot;)"
                  @pointerdown="freezeSearchSource"
                  @click.stop="openSearchPanel"
                >{{ tr('查找') }}</button>
              </div>
              <div class="toolbar-spacer"></div>
            </div>
            </Teleport>

            <div class="wall__dossier-scroll">
            <header class="wall__dossier-head wall__chapter-head">
              <template v-if="wt3ActiveDoc">
                <span class="wt3-badge">{{ tr('构思') }}</span>
                <strong class="wall__dossier-title wt3-doc-title">{{ wt3ActiveDoc.title }}</strong>
                <button type="button" class="control-quiet tool-btn sm wt3-back-btn" @click="closeExplorationDoc">{{ tr('返回正文') }}</button>
              </template>
              <template v-else>
                <span v-if="selectedChapterOrdinalLabel" class="wall__chapter-ordinal" aria-hidden="true">{{ selectedChapterOrdinalLabel }}</span>
                <input v-model="currentChapterTitle" type="text" class="wall__dossier-title"
                  :disabled="historyInteractionLocked" :aria-disabled="historyInteractionLocked.toString()"
                  :title="currentChapterTitle"
                  :placeholder="selectedChapterOrdinalLabel ? tr('章名') : tr('章节标题')" @input="onTitleChange" :aria-label="tr(&quot;章节标题&quot;)" />
              </template>
            </header>

            <AuthoringTransientNotice
              v-if="!inspectorOpen || activeInspectorTool !== 'dual'"
              :notice="authoringTaskNotice"
              @undo="undoAuthoringTask"
            />
            <AuthoringFirstRunPath
              v-if="firstRunGuideVisible"
              :stage="firstRunGuideStage"
              @advance="advanceFirstRunGuide"
              @dismiss="dismissFirstRunGuide"
            />
            <WritingNotebookEditor
              :key="notebookDocumentKey"
              ref="notebookEditorRef"
              :model-value="markdownContent"
              :document="writingDocument"
              :editable="!pendingGhostAdoption && !atomicHistoryBusy"
              :annotations="activeEditorAnnotations"
              :worldbook-mentions="writingWorldbookMentions"
              :active-annotation-id="activeAnnotationId"
              :inline-suggestion="copilotSuggestion"
              :inline-suggestion-visible="copilotVisible"
              :inline-suggestion-generating="copilotGenerating"
              :inline-suggestion-requesting="copilotRequesting"
              :inline-suggestion-error="copilotError"
              :typewriter="writingTypography.typewriter"
              :focus-paragraph="writingTypography.focusParagraph"
              :block-composer-open="blockComposer.open || sceneCurationPreviewOpen || (interventionComposer.open && !interventionGhostInDual) || Boolean(adoptionImpact)"
              :block-composer-target="adoptionImpact?.target || (sceneCurationPreviewOpen ? sceneCurationTarget : (interventionComposer.open ? interventionDisplayTarget : blockComposer.target))"
              :intervention-enabled="!wt3ActiveDoc"
              :block-preview="blockPreview"
              :atomic-undo-available="hasGhostAdoptionUndoBoundary || hasStructureUndoBoundary"
              :atomic-redo-available="hasGhostAdoptionRedoBoundary || hasStructureRedoBoundary"
              :history-locked="historyInteractionLocked"
              block-menu-enabled
              :task-unit-id="reviewPanelOpen && reviewWorkflow.invocation.value?.pane === 'main' ? reviewWorkflow.invocation.value.unitId || '' : ''"
              :before-destructive-edit="protectMainDestructiveEdit"
              :interaction-owner="writingInteractionOwner"
              :data-document-role="wt3ActiveDoc ? 'exploration' : 'manuscript'"
              :class="{ 'has-writing-ghost': copilotVisible || blockPreview }"
              :style="notebookEditorStyle"
              @update:modelValue="onNotebookMarkdown"
              @update:document="onNotebookDocumentUpdate"
              @selection-change="onNotebookSelectionChange"
              @unit-transition="onNotebookUnitTransition"
              @annotation-click="handleInlineAnnotationClick"
              @worldbook-mention-click="openWorldbookMentionDetail"
              @writing-command="handleNotebookWritingCommand"
              @command-menu-change="onNotebookCommandMenuChange"
              @composition-change="onNotebookCompositionChange"
              @writing-paste="onWritingPaste"
              @blocked-structure-edit="handleBlockedStructureEdit"
              @editor-focus="activateMainPane"
              @editor-blur="writingAgentHost.notifyBlur()"
              @scroll-owner="handleNotebookScrollOwner"
              @open-block-composer="openBlockComposer"
              @open-intervention="openInterventionComposer"
              @accept-block-preview="acceptBlockPreview"
              @dismiss-block-preview="dismissBlockPreview"
              @accept-inline-suggestion="acceptWritingSuggestion"
              @dismiss-inline-suggestion="writingAgentHost.notifyDismiss()"
              @cycle-inline-suggestion="cycleCopilotSuggestion"
              @retry-inline-suggestion="retryCopilotSuggestion"
              @history-command="handleNotebookHistoryCommand"
              @ready="onNotebookReady"
              @input="onNotebookInput"
              :lang="currentBook?.manuscriptLanguage === 'mixed' ? undefined : currentBook?.manuscriptLanguage || undefined"
              @beforeinput.capture="onWritingBeforeInput"
              @context-menu="showContextMenu"
            />
            <div
              v-if="activeWritingPane === 'main' && writingInteractionOwner === 'quick-word' && quickWordSuggestions.length"
              class="authoring-quick-word-strip"
              role="listbox"
              :aria-label="tr(&quot;快捷词建议&quot;)"
              @click.stop
            >
              <span>{{ quickWordPrefix }}</span>
              <button
                v-for="(item, index) in quickWordSuggestions"
                :key="item.id"
                type="button"
                role="option"
                :aria-keyshortcuts="String(index + 1)"
                @mousedown.prevent
                @click="completeQuickWord(item)"
              ><kbd>{{ index + 1 }}</kbd>{{ item.text }}</button>
            </div>
            <Teleport v-if="sceneCurationPreviewOpen" to="#authoring-block-gap">
              <AuthoringSceneCurationPreview
                :draft="sceneCurationDraft"
                :baseline="sceneCurationBaseline"
                :character-candidates="curationCharacterCandidates"
                :location-candidates="curationLocationCandidates"
                :busy="sceneCurationBusy"
                :error="sceneCurationError"
              />
            </Teleport>
            <Teleport v-else-if="interventionComposer.open && interventionComposer.phase !== 'ghosts'" :to="rehearsalComposerHostRef || '#authoring-block-gap'">
              <AuthoringInterventionComposer
                :target="interventionComposer.target"
                :original-text="interventionComposer.originalText"
                :phase="interventionComposer.phase"
                :notice="interventionComposer.notice"
                :evidence-count="interventionComposer.evidenceCount"
                :impact-groups="interventionImpactGroups"
                :candidate-groups="interventionCandidateGroups"
                :rehearsal-directions="interventionRehearsalDirections"
                :rehearsal-selection="interventionComposer.rehearsalSelection"
                :candidate-review-pending-count="interventionCandidateReviewPendingCount"
                :collaboration-enabled="authoringCollaborationEnabled"
                :collaboration-ready="interventionRehearsalScopeResult.ok"
                :collaboration-active="authoringRehearsalActive"
                :collaboration-state="authoringRehearsalState.connectionState"
                @submit="prepareAuthoringIntervention"
                @review-candidate="reviewInterventionCandidate"
                @select-rehearsal="selectInterventionRehearsal"
                @rehearse="runInterventionRehearsal"
                @collaborate="startAuthoringRehearsalRoom"
                @open-collaboration="openAuthoringRehearsalInspector"
                @cancel="closeInterventionComposer"
              />
            </Teleport>
            <Teleport v-else-if="interventionComposer.open && interventionComposer.phase === 'ghosts' && !interventionGhostInDual" to="#authoring-block-gap">
              <AuthoringInterventionGhost
                :ghosts="interventionGhosts"
                :active-ghost-id="interventionComposer.activeGhostId"
                :retrying-ghost-id="interventionComposer.retryingGhostId"
                :adopting-ghost-id="interventionComposer.adoptingGhostId"
                :batch-count="interventionBatchGhosts.length"
                :batch-busy="interventionComposer.adoptingGhostId === 'all'"
                :persist-pending-ghost-id="interventionComposer.pendingAdoption?.ghostId || ''"
                :persist-error="interventionComposer.persistError"
                @select="selectInterventionGhost"
                @update="updateInterventionGhost"
                @retry="retryInterventionGhost"
                @discard="discardInterventionGhost"
                @adopt="adoptInterventionGhost"
                @adopt-all="adoptAllInterventionGhosts"
                @retry-persist="persistPendingInterventionAdoption"
                @close="closeInterventionComposer"
              />
            </Teleport>
            <Teleport v-else-if="blockComposer.open && !blockPreview && !sceneLaboratory.open" :to="rehearsalComposerHostRef || '#authoring-block-gap'">
              <AuthoringBlockComposer ref="blockComposerRef" :target="blockComposer.target" :empty-chapter="isEmptyChapter"
                :projection="sceneProjection" :people="composerPeople" :generating="authoringTaskBusy"
                :failure="blockComposer.failure" :stale-result="blockComposer.staleResult"
                :context-loading="authoringContextPreflightLoading"
                :initial-instruction="blockComposer.initialInstruction"
                :initial-actor-id="sceneActiveActorId"
                :initial-target-id="sceneDialogueTargetId"
                @submit="submitBlockTurn" @cancel="closeBlockComposer" @stop="cancelAuthoringTask"
                @draft-change="scheduleAuthoringContextPreflight"
                @retry-persist="handleRetryAuthoringPersist">
              </AuthoringBlockComposer>
            </Teleport>
            <Teleport v-if="blockPreview" to="#authoring-block-gap">
              <AuthoringBlockDraft
                ref="blockDraftRef"
                v-model="blockDraftText"
                :original-text="blockDraftOriginalText"
                :operation="blockPreview.operation"
                :has-derived-effects="Boolean(blockPreview?.hasDerivedEffects)"
                :locked="Boolean(pendingGhostAdoption)"
                :busy="blockAdoptionBusy"
                :failure="blockComposer.failure"
                :stale-result="blockComposer.staleResult"
                :boundary-hints="blockPreview.boundaryHints"
                :selected-direction="blockPreview.selectedDirectionReceipt"
                :session-fingerprint="blockPreview.candidate?.runSession?.manifest?.fingerprint || ''"
                :previous-draft="previousBlockDraftText"
                :if-branch="characterIfActive ? characterIfActiveBranch : ''"
                @switch-if="switchIfDraft"
                @retry-if="retryIfDraft"
                @accept="acceptBlockPreview"
                @dismiss="dismissBlockPreview"
                @restore="restoreBlockDraft"
                @save-as-exploration="saveBlockDraftAsExploration"
              />
            </Teleport>
            <Teleport v-if="rehearsalComposerHostRef && ((blockComposer.open && !blockPreview && !sceneLaboratory.open) || (interventionComposer.open && interventionComposer.phase !== 'ghosts'))" to="#authoring-block-gap">
              <button type="button" class="authoring-rehearsal-anchor" @click="revealRehearsalComposer">
                <WorkbenchIcon name="network" :size="15" />
                <span>{{ tr('从这里推演') }}</span><span>{{ tr('继续推演 →') }}</span>
              </button>
            </Teleport>
            <Teleport v-if="!blockPreview && adoptionImpact" to="#authoring-block-gap">
              <AuthoringAdoptionImpact :impact="adoptionImpact.projection" />
            </Teleport>
            <Teleport to="body">
              <div
                v-if="selectionActionsVisible && !illustratorBlocking && !reviewPanelOpen && !searchPanelOpen"
                class="writing-selection-actions"
                :style="selectionToolbarStyle"
                role="toolbar"
                :aria-label="tr(&quot;选中文字操作&quot;)"
                @mousedown.prevent
                @click.stop
              >
                <button type="button" :title="tr(&quot;粗体（Ctrl/Cmd+B）&quot;)" :disabled="activeWritingMutationLocked || !activeNotebookCommandAvailability.editable" @click="toggleNotebookMark('bold')">
                  <strong>B</strong>
                </button>
                <button type="button" :title="tr(&quot;斜体（Ctrl/Cmd+I）&quot;)" :disabled="activeWritingMutationLocked || !activeNotebookCommandAvailability.editable" @click="toggleNotebookMark('italic')">
                  <em>I</em>
                </button>
                <button type="button" :title="tr(&quot;插入分隔线&quot;)" :disabled="historyInteractionLocked" @click="insertSeparator">
                  <WorkbenchIcon name="minus" :size="14" />
                </button>
                <span aria-hidden="true"></span>
                <button type="button" :title="tr(&quot;为选中文字添加批注&quot;)" @click="openAnnotationFromSelectionMenu">
                  <WorkbenchIcon name="message-square" :size="14" />
                  <span>{{ tr('批注') }}</span>
                </button>
                <span aria-hidden="true"></span>
                <button type="button" :title="tr(&quot;把选中文字收为素材&quot;)" @click="captureSelectionFromMenu">
                  <WorkbenchIcon name="bookmark-plus" :size="14" />
                  <span>{{ tr('素材') }}</span>
                </button>
                <span aria-hidden="true"></span>
                <button type="button" :title="tr(&quot;将选中文字提取为待确认的项目事实&quot;)" data-action="remember-selection" @click="rememberSelectionFromMenu">
                  <WorkbenchIcon name="sparkles" :size="14" />
                  <span>{{ tr('事实') }}</span>
                </button>
              </div>
            </Teleport>

            <Teleport to="body">
              <AuthoringQuickWords
                v-if="showQuickWords"
                :catalog="quickWordCatalog"
                :enabled-ids="quickWordEnabledIds"
                @close="showQuickWords = false"
                @toggle="toggleQuickWord"
                @insert="insertQuickWord"
                @click.stop
              />
            </Teleport>

            <Teleport to="body">
              <div v-if="showNameGen" class="quick-name-backdrop" @mousedown.self="closeNameGenerator">
                <section class="quick-name-workbench" :class="{ 'is-compact': nameCategory !== 'person' }" role="dialog" aria-modal="true" aria-labelledby="quick-name-title" @click.stop>
                  <header class="quick-name-head">
                    <div><h2 id="quick-name-title">{{ tr('快速取名') }}</h2><p>{{ tr('点名称只插入正文；建为条目需要单独确认。') }}</p></div>
                    <button type="button" class="quick-name-close" :aria-label="tr(&quot;关闭快速取名&quot;)" :disabled="nameEntityBusy" @click="closeNameGenerator">×</button>
                  </header>
                  <div class="quick-name-body">
                    <div class="quick-name-filters">
                      <div class="quick-name-filter quick-name-filter--category"><span>{{ tr('类型') }}</span><div role="group" :aria-label="tr(&quot;名称类型&quot;)"><button v-for="item in nameCategoryOptions" :key="item.value" type="button" :disabled="nameEntityBusy" :class="{ active: nameCategory === item.value }" @click="nameCategory = item.value; doGenerateName()">{{ tr(item.label) }}</button></div></div>
                      <template v-if="nameCategory === 'person'">
                        <div class="quick-name-filter"><span>{{ tr('语言') }}</span><div role="group" :aria-label="tr(&quot;名字语言&quot;)"><button v-for="item in nameLanguageOptions" :key="item.value" type="button" :disabled="nameEntityBusy" :class="{ active: nameStyle === item.value }" @click="nameStyle = item.value; doGenerateName()">{{ tr(item.label) }}</button></div></div>
                        <div class="quick-name-filter"><span>{{ tr('字数') }}</span><div role="group" :aria-label="tr(&quot;名字字数&quot;)"><button v-for="item in nameLengthOptions" :key="item.value" type="button" :disabled="nameEntityBusy" :class="{ active: nameLength === item.value }" @click="nameLength = item.value; doGenerateName()">{{ tr(item.label) }}</button></div></div>
                        <div class="quick-name-filter"><span>{{ tr('性别') }}</span><div role="group" :aria-label="tr(&quot;名字性别&quot;)"><button v-for="item in nameGenderOptions" :key="item.value" type="button" :disabled="nameEntityBusy" :class="{ active: nameGender === item.value }" @click="nameGender = item.value; doGenerateName()">{{ tr(item.label) }}</button></div></div>
                        <div v-if="nameStyle === 'chinese'" class="quick-name-filter quick-name-filter--surname"><label for="quick-name-surname">{{ tr('指定姓氏') }}</label><input id="quick-name-surname" v-model.trim="fixedSurname" maxlength="2" :placeholder="tr(&quot;可不填&quot;)" :disabled="nameEntityBusy" @input="doGenerateName" /></div>
                      </template>
                    </div>
                    <div class="quick-name-results" aria-live="polite">
                      <div v-for="item in generatedNames" :key="item.value" class="quick-name-result" :class="{ 'is-menu-open': activeNameEntityMenu === item.value }">
                        <button class="quick-name-result__insert" type="button" :aria-label="tr('插入{value0}', { value0: item.value })" @click="selectName(item)">
                          <strong>{{ item.value }}</strong><span>{{ item.note }}</span>
                        </button>
                        <button
                          class="quick-name-result__more"
                          type="button"
                          :aria-label="tr('{value0}更多操作', { value0: item.value })"
                          :aria-expanded="(activeNameEntityMenu === item.value).toString()"
                          @click.stop="toggleNameEntityMenu(item)"
                        >···</button>
                        <div v-if="activeNameEntityMenu === item.value" class="quick-name-result__menu" role="menu" @click.stop>
                          <button type="button" role="menuitem" data-test="create-name-entity" :aria-label="tr('建为{value0}条目', { value0: activeNameCategoryLabel })" @click="requestNameEntityCreation(item)"><span aria-hidden="true">＋</span>{{ tr('建为{activeNameCategoryLabel}条目', { activeNameCategoryLabel: activeNameCategoryLabel }) }}</button>
                        </div>
                      </div>
                    </div>
                    <section v-if="pendingNameEntityCommand && nameEntityConflicts.length" class="quick-name-conflict" :aria-label="tr(&quot;同名条目处理&quot;)">
                      <div><strong>{{ tr('“{text}”已有同名条目', { text: pendingNameEntityCommand.selection.text }) }}</strong><span>{{ tr('请选择查看已有，或明确仍然新建。') }}</span></div>
                      <div class="quick-name-conflict__matches">
                        <button v-for="conflict in nameEntityConflicts" :key="conflict.entryId" type="button" @click="reuseNameEntityConflict(conflict)">{{ tr('查看已有 · {name}', { name: conflict.name }) }}</button>
                      </div>
                      <div class="quick-name-conflict__actions"><button type="button" @click="cancelNameEntityConflict">{{ tr('取消') }}</button><button type="button" class="is-primary" :disabled="nameEntityBusy" @click="confirmDuplicateNameEntity">{{ tr('仍然新建') }}</button></div>
                    </section>
                    <div v-if="nameEntityNotice" class="quick-name-notice" :class="`is-${nameEntityNoticeKind}`" role="status">
                      <span>{{ nameEntityNotice }}</span>
                      <button v-if="nameEntityNoticeKind === 'needs-binding'" type="button" @click="openNameWorldbookBinding">{{ tr('去关联') }}</button>
                      <button v-else-if="lastNameEntityReceipt" type="button" @click="openCreatedNameEntityEntry">{{ tr('查看条目') }}</button>
                    </div>
                  </div>
                  <footer class="quick-name-foot"><span>{{ nameEntityBusy ? tr('正在创建条目…') : tr('{value0} · {value1} 个候选', { value0: activeNameCategoryLabel, value1: generatedNames.length }) }}</span><button type="button" :disabled="nameEntityBusy" @click="doGenerateName">{{ tr('换一批') }}</button></footer>
                </section>
              </div>
            </Teleport>

            </div>

            <div class="dossier-footer">
              <template v-if="saveFeedbackVisible">
                <span class="dossier-footer-stat dossier-footer-stat--save" :class="`is-${saveStatus}`">{{ tr(stampStateText) }}</span>
                <span class="dossier-footer-stat-divider">·</span>
              </template>
              <span class="dossier-footer-stat">{{ tr(writingTextMetrics(getEditorText(), currentBook?.manuscriptLanguage).unit === 'words' ? '词数：{count}' : '字/词：{count}', { count: wordCount.toLocaleString(uiLocale) }) }}</span>
              <span class="dossier-footer-stat-divider">·</span>
              <span class="dossier-footer-stat">{{ tr('{value} 字符', { value: charCount.toLocaleString() }) }}</span>
              <span class="dossier-footer-stat-divider">·</span>
              <span class="dossier-footer-stat">{{ tr('修订 {revisionLabel}', { revisionLabel: revisionLabel }) }}</span>
            </div>
          </div>

          <!-- 右键菜单 -->
          <div v-if="contextMenu.show" ref="contextMenuRef" class="context-menu" role="menu" :aria-label="tr(&quot;正文操作&quot;)" tabindex="-1" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px', maxHeight: contextMenu.maxHeight + 'px' }" @pointerdown.prevent @click.stop>
            <button class="ctx-item" role="menuitem" @click="ctxAction('undo')" :disabled="historyInteractionLocked || !contextMenu.availability.undo">{{ tr('撤销') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('redo')" :disabled="historyInteractionLocked || !contextMenu.availability.redo">{{ tr('重做') }}</button>
            <div class="ctx-divider"></div>
            <button class="ctx-item" role="menuitem" @click="ctxAction('cut')" :disabled="historyInteractionLocked || !contextMenu.availability.cut">{{ tr('剪切') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('copy')" :disabled="!contextMenu.availability.copy">{{ tr('复制') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('paste')" :disabled="historyInteractionLocked || !contextMenu.availability.paste" :title="contextMenu.availability.paste ? '' : tr('浏览器未授权读取剪贴板')">{{ tr('粘贴') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('delete')" :disabled="historyInteractionLocked || !contextMenu.availability.deleteSelection">{{ tr('删除') }}</button>
            <div class="ctx-divider"></div>
            <button class="ctx-item" role="menuitem" @click="ctxAction('selectAll')" :disabled="!contextMenu.availability.selectAll">{{ tr('全选') }}</button>
            <div class="ctx-divider"></div>
            <button class="ctx-item" role="menuitem" @click="ctxAction('splitUnit')" :disabled="historyInteractionLocked || !contextMenu.availability.splitUnit">{{ tr('从此处分开') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('mergePreviousUnit')" :disabled="historyInteractionLocked || !contextMenu.availability.mergePreviousUnit">{{ tr('与上一单元合并') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('mergeNextUnit')" :disabled="historyInteractionLocked || !contextMenu.availability.mergeNextUnit">{{ tr('与下一单元合并') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('reviewBlock')">{{ tr('审阅此块') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('imageBlock')">{{ tr('从此处生图') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('moveUnitUp')" :disabled="historyInteractionLocked || !contextMenu.availability.moveUnitUp">{{ tr('上移当前单元') }}</button>
            <button class="ctx-item" role="menuitem" @click="ctxAction('moveUnitDown')" :disabled="historyInteractionLocked || !contextMenu.availability.moveUnitDown">{{ tr('下移当前单元') }}</button>
          </div>
        </template>
      </section>

      <AuthoringDualPane
        v-if="inspectorOpen && (activeInspectorTool === 'dual' || (activeInspectorTool === 'ai' && knowledgeAssistantInvocation?.pane === 'dual'))"
        v-show="activeInspectorTool === 'dual'"
        ref="dualPaneRef"
        :book-id="selectedBookId"
        :chapters="chapters"
        :explorations="wt3IdeaShelfDocs"
        :outline-nodes="wt3OutlineNodes"
        :outline-edges="wt3OutlineEdges"
        :worldbook="boundWorldbook"
        :main-chapter-id="selectedChapterId || ''"
        :main-exploration-id="wt3ActiveDocId"
        :initial-chapter-id="dualTargetChapterId"
        :initial-exploration-id="dualTargetExplorationId"
        :initial-outline-node-id="dualTargetOutlineNodeId"
        :initial-worldbook-entry-id="dualTargetWorldbookEntryId"
        :main-document="writingDocument"
        :main-markdown="markdownContent"
        :active="activeWritingPane === 'dual'"
        :save-chapter="saveDualChapter"
        :save-exploration="saveDualExploration"
        :protect-destructive-edit="protectDualDestructiveEdit"
        :resolve-scene-projection="resolveDualSceneProjection"
        :editor-style="notebookEditorStyle"
        :quick-word-prefix="quickWordPrefix"
        :quick-word-suggestions="writingInteractionOwner === 'quick-word' ? quickWordSuggestions : []"
        :intervention-ghost-open="interventionGhostInDual"
        :intervention-ghost-target="interventionDisplayTarget"
        @close="closeWritingInspector"
        @activate="activateDualPane"
        @source-change="handleDualSourceChange"
        @document-change="dualQuickWordDocument = $event"
        @command-availability="handleDualCommandAvailability"
        @selection-change="dualNotebookSelection = $event"
        @composition-change="dualCompositionActive = $event"
        @quick-word-complete="completeQuickWord"
        @swap="swapDualChapter"
        @open-outline="openOutlineFromDual"
        @open-worldbook="openWorldbookFromDual"
      >
        <template v-if="authoringTaskNotice?.text" #notice>
          <AuthoringTransientNotice :notice="authoringTaskNotice" @undo="undoAuthoringTask" />
        </template>
      </AuthoringDualPane>
      <Teleport v-if="interventionComposer.open && interventionComposer.phase === 'ghosts' && interventionGhostInDual && interventionGhostTeleportReady" to="#authoring-dual-block-gap">
        <AuthoringInterventionGhost
          :ghosts="interventionGhosts"
          :active-ghost-id="interventionComposer.activeGhostId"
          :retrying-ghost-id="interventionComposer.retryingGhostId"
          :adopting-ghost-id="interventionComposer.adoptingGhostId"
          :batch-count="interventionBatchGhosts.length"
          :batch-busy="interventionComposer.adoptingGhostId === 'all'"
          :persist-pending-ghost-id="interventionComposer.pendingAdoption?.ghostId || ''"
          :persist-error="interventionComposer.persistError"
          @select="selectInterventionGhost"
          @update="updateInterventionGhost"
          @retry="retryInterventionGhost"
          @discard="discardInterventionGhost"
          @adopt="adoptInterventionGhost"
          @adopt-all="adoptAllInterventionGhosts"
          @retry-persist="persistPendingInterventionAdoption"
          @close="closeInterventionComposer"
        />
      </Teleport>

      <AuthoringWorkspaceToolRail
        :active-tool="activeInspectorTool"
        :dual="inspectorDualColumn"
        :collaboration-visible="authoringRehearsalActive"
        @before-select="beforeInspectorToolSelect"
        @select="tool => tool === 'history' ? appSettings.open('memory') : selectInspectorTool(tool)"
      />

      <aside
        v-if="activeInspectorTool !== 'dual'"
        class="writing-inspector"
        ref="writingInspectorRef"
        :class="{ 'is-open': inspectorOpen, 'is-pinned': inspectorPinned, 'is-dual': inspectorDualColumn, 'is-assistant': activeInspectorTool === 'ai', 'is-rehearsal': activeInspectorTool === 'rehearsal', 'is-catalog-workbench': ['outline', 'characters', 'worldbook'].includes(activeInspectorTool) }"
        :aria-label="tr(&quot;写作检查器&quot;)"
      >
        <header class="writing-inspector__head">
          <div>
            <strong>{{ tr(activeInspectorLabel) }}</strong>
            <small v-if="uiLocale === 'en' && ['worldbook', 'scene', 'collaboration'].includes(activeInspectorTool)" class="writing-inspector__locale-note" :title="tr('此工具部分界面目前仅中文')">{{ tr('部分翻译') }}</small>
            <span v-if="activeInspectorTool === 'annotations' && openAnnotationCount" class="writing-inspector__head-count">{{ tr('{openAnnotationCount} 条待处理', { openAnnotationCount: openAnnotationCount }) }}</span>
          </div>
          <div class="writing-inspector__head-actions">
            <button v-if="activeInspectorTool === 'ai'" type="button" class="writing-inspector__memory-link" @click="appSettings.open('memory')">{{ tr('记忆与历史') }}</button>
            <!-- 顺序展开（≤1180）时推演排在正文之后：回程入口必须常驻 sticky 标题栏，
                 不能放在会随内容滚走的出处行里。宽屏由 CSS 隐藏。 -->
            <button
              v-if="activeInspectorTool === 'rehearsal'"
              class="writing-inspector__manuscript-btn"
              type="button"
              :aria-label="tr(&quot;回到正文&quot;)"
              :title="tr(&quot;回到正文&quot;)"
              @click="scrollRehearsalBackToManuscript"
            >{{ tr('正文') }}</button>
            <button
              class="writing-inspector__icon-btn"
              type="button"
              :class="{ active: inspectorPinned }"
              :aria-pressed="inspectorPinned.toString()"
              :title="tr(&quot;固定检查器&quot;)"
              @click="inspectorPinned = !inspectorPinned"
            ><WorkbenchIcon name="pin" :size="15" /></button>
            <button class="writing-inspector__icon-btn" type="button" :title="tr(&quot;关闭检查器&quot;)" @click="closeActiveWritingInspector"><WorkbenchIcon name="close" :size="15" /></button>
          </div>
        </header>

        <div ref="rehearsalComposerHostRef" v-show="activeInspectorTool === 'rehearsal' && ((blockComposer.open && !blockPreview && !sceneLaboratory.open) || (interventionComposer.open && interventionComposer.phase !== 'ghosts'))" class="writing-inspector__compose-host" />
        <div v-if="activeInspectorTool === 'rehearsal' && !((blockComposer.open && !blockPreview && !sceneLaboratory.open) || (interventionComposer.open && interventionComposer.phase !== 'ghosts'))" class="writing-inspector__rehearsal">
          <AuthoringSceneLaboratory v-if="ifEntryOpen && sceneLaboratory.open"
                :entry-intent="activeSceneLaboratoryIntent"
                :pressure="sceneLaboratoryPressure"
                :directions="sceneLaboratoryDirections"
                :selected-direction-id="sceneLaboratory.selectedDirectionId"
                :phase="sceneLaboratory.phase"
                :notice="sceneLaboratory.notice"
                @select="selectSceneLaboratoryDirection"
                :append-requirement="sceneLaboratoryAppendRequirement"
                :if-branches="characterIfBranches"
                :if-active-branch="characterIfActiveBranch"
                :if-plans="ifPlans"
                :if-busy="ifBusy"
                :initial-if-open="ifEntryOpen"
                :initial-if-actor="characterIfExperiment.active.value?.actorRef?.slice('character:'.length) || ifEntryActor"
                :if-baseline="characterIfExperiment.active.value?.baselineFacts || []"
                @plan-if="planIfBranch"
                @select-if="selectIfDirection"
                @append-requirement="sceneLaboratoryAppendRequirement = $event"
                @confirm="confirmSceneLaboratoryDirection"
                @back="openSceneLaboratoryEvidence"
                @close="ifEntryOpen = false"
                @ordinary="openOrdinaryTurnFromSceneLaboratory"
                @supplement="supplementSceneFromSceneLaboratory"
                @retry="retrySceneLaboratoryDirections"
                @start-if="startCharacterIfExperiment"
                @switch-if-branch="switchIfDraft"
                @write-if-draft="writeIfBranchDraft"
              />
          <AuthoringRehearsalPanel v-else :rehearsal="rehearsal"
            :preparing="rehearsalPreparing || (sceneLaboratory.open && ['preparing-context', 'planning-directions'].includes(sceneLaboratory.phase))"
            :drafting="rehearsalDrafting" :draft-state="rehearsalDraftState" :notice="rehearsalNotice || (!rehearsal.run.value ? sceneLaboratory.notice : '')"
            :first-run-hint="firstRunPanelHint"
            :memory-workflow="rehearsalMemoryWorkflow"
            :title="rehearsalOriginTitle" @start="startRehearsal" @draft="writeRehearsalDraft"
            @locate="locateRehearsalOrigin" @view-draft="showRehearsalDraft" @if="openRehearsalIf"
            @check-connection="openRehearsalConnectionSettings" />
        </div>
        <nav v-if="activeInspectorTool === 'annotations' || activeInspectorTool === 'history'" class="writing-inspector__tabs" :aria-label="tr(&quot;检查器视图&quot;)">
          <button type="button" :class="{ active: inspectorTab === 'comments' }" @click="inspectorTab = 'comments'">{{ tr('批注') }}</button>
          <button type="button" :class="{ active: inspectorTab === 'version' }" @click="inspectorTab = 'version'">{{ tr('版本') }}</button>
        </nav>
        <nav v-else-if="activeInspectorTool === 'scene' && inspectorTab !== 'detail'" class="writing-inspector__tabs" :aria-label="tr(&quot;现场与因果视图&quot;)">
          <button type="button" :class="{ active: sceneInspectorMode === 'current' }" @click="sceneInspectorMode = 'current'">{{ tr('当前场') }}</button>
          <button type="button" :class="{ active: sceneInspectorMode === 'story' }" @click="sceneInspectorMode = 'story'">{{ tr('场景与因果') }}</button>
        </nav>

        <div v-if="activeInspectorTool === 'ai'" class="writing-inspector__body writing-inspector__body--assistant" data-authoring-inspector="ai">
          <AuthoringKnowledgeAssistant
            :review-workflow="reviewWorkflow"
            v-model:draft="knowledgeAssistant.draft.value"
            :project-title="currentBook?.title || ''"
            :messages="knowledgeAssistant.messages.value"
            :selected-intent="knowledgeAssistant.selectedIntent.value"
            :busy="knowledgeAssistant.busy.value"
            :error="knowledgeAssistant.error.value"
            :notice="authoringMemoryNotice"
            @select-intent="knowledgeAssistant.selectIntent"
            @ask="knowledgeAssistant.ask"
            @cancel="knowledgeAssistant.cancel"
            @retry="knowledgeAssistant.retry"
            @clear="knowledgeAssistant.clear"
            @open-evidence="openAuthoringKnowledgeEvidence"
            @review-notice="memoryReviewOpen = true"
            @open-illustrator="openIllustrator"
          />
          <AuthoringMemoryReview :open="memoryReviewOpen" :candidates="authoringMemoryCandidates" :can-jump-source="canJumpToMemorySource"
            @confirm="confirmAuthoringMemoryCandidate" @reject="rejectAuthoringMemoryCandidate" @pin="pinAuthoringMemoryCandidate"
            @demote="demoteAuthoringMemoryCandidate" @supersede="supersedeAuthoringMemoryCandidate" @merge="mergeAuthoringMemoryCandidate"
            @jump-source="jumpToMemorySource" @close="closeMemoryReview" />
        </div>
        <div v-else-if="activeInspectorTool === 'collaboration'" class="writing-inspector__body" data-authoring-inspector="collaboration">
          <RehearsalReviewSurface
            :mode="authoringRehearsalState.room?.hostId === authoringRehearsalState.selfMemberId ? 'host' : 'reviewer'"
            :connection-state="authoringRehearsalState.connectionState"
            :members="authoringRehearsalState.members"
            :artifacts="authoringRehearsalState.artifacts"
            :proposals="authoringRehearsalState.proposals"
            :votes="authoringRehearsalState.votes"
            :generation="authoringRehearsalState.generation"
            :invite-url="authoringRehearsalState.invite?.url || ''"
            :busy-action="authoringRehearsalBusy"
            :error="authoringRehearsalState.error || authoringRehearsalError"
            :stale="authoringRehearsalState.stale"
            @copy-invite="copyAuthoringRehearsalInvite"
            @propose="proposeAuthoringRehearsalDirection"
            @vote="voteAuthoringRehearsalProposal"
            @select-generate="generateAuthoringRehearsalProposal"
            @promote="promoteAuthoringRehearsalBranch"
            @leave="leaveAuthoringRehearsalRoom"
            @close="closeActiveWritingInspector"
          />
        </div>
        <div v-else-if="activeInspectorTool === 'outline'" class="writing-inspector__body writing-inspector__body--catalog" data-authoring-inspector="outline">
          <AuthoringOutlinePanel
            :items="chapterOutlineItems"
            :project-nodes="wt3OutlineNodes"
            :project-edges="wt3OutlineEdges"
            :project-conflicts="wt3OutlineConflicts"
            :project-filter="wt3OutlineFilter"
            :chapters="chapters"
            :explorations="wt3ExplorationDocs"
            :chapter-title="currentChapterTitle"
            :selected-text="selectedText"
            :focus-project-node-id="inspectorOutlineNodeId"
            @add="addManualChapterOutlineItem"
            @update="updateChapterOutlineItem"
            @remove="removeChapterOutlineItemFromChapter"
            @move="moveChapterOutlineItem"
            @insert="insertChapterOutlineItem"
            @filter="wt3OutlineFilter = $event"
            @open-project-chapter="selectChapter"
            @open-project-exploration="openExplorationDoc"
            @open-dual="openOutlineInDual"
            @history="selectInspectorTool('history')"
            @toggle-pin="inspectorPinned = !inspectorPinned"
            @close="closeActiveWritingInspector"
          />
        </div>
        <div v-else-if="activeInspectorTool === 'worldbook'" class="writing-inspector__body" data-authoring-inspector="worldbook">
          <AuthoringWorldbookPanel
            :worldbook="boundWorldbook"
            :book-id="selectedBookId"
            :selected-text="selectedText"
            :document="writingDocument"
            :caret-context="authoringSettingCaretContext"
            :focus-entry-id="inspectorWorldbookEntryId"
            :writing-unit="activeWritingUnit"
            :scene-projection="sceneProjection"
            :context-ledger="contextLedger"
            :annotations="chapterAnnotations"
            :candidate-entry-ids="inspectorWorldbookCandidateIds"
            @bind="openBindingSelect"
            @create="createAuthoringSetting"
            @update="updateAuthoringSetting"
            @remove="removeAuthoringSetting"
            @open-full="openWorldbookFromDual"
            @toggle-pin="inspectorPinned = !inspectorPinned"
            @close="closeActiveWritingInspector"
          />
        </div>
        <div v-else-if="activeInspectorTool === 'scene' && inspectorTab === 'detail'" class="writing-inspector__body" data-authoring-inspector="scene">
          <p v-if="sceneDetailNotice" class="writing-review-status" role="status">{{ sceneDetailNotice }}</p>
          <AuthoringInspectorDetail
            :detail="inspectorDetailState"
            :model="sceneDetailModel"
            :curation="sceneCurationDraft"
            :worldbook-status="bookWorldbookStatus.status"
            :character-candidates="curationCharacterCandidates"
            :location-candidates="curationLocationCandidates"
            :missing-character-ids="curationMissingCharacterIds"
            :missing-location-id="curationMissingLocationId"
            :busy="sceneCurationBusy"
            :error="sceneCurationError"
            :can-undo="sceneCurationCanUndo"
            :can-restore-inheritance="sceneCurationCanRestoreInheritance"
            @close="closeSceneDetail"
            @set-actor="handleDetailSetActor"
            @open-full="handleDetailOpenFull"
            @advance-with="handleDetailAdvanceWith"
            @add-to-outline="handleDetailAddToOutline"
            @confirm-emergence="handleDetailConfirmEmergence"
            @dismiss-emergence="handleDetailDismissEmergence"
            @open-source="handleDetailOpenEmergenceSource"
            @open-map="handleDetailOpenMap"
            @update-draft="handleCurationDraftUpdate"
            @save="handleCurationSave"
            @cancel="handleCurationCancel"
            @undo="handleCurationUndo"
            @restore-inheritance="handleCurationRestoreInheritance"
            @bind-worldbook="openBindingSelect"
            @open-worldbook="openProjectSettingsSurface('settings')"
            @search="handleCurationSearch"
            @run-intent="handleSceneRunIntent"
            @if-experiment="openIfEntry"
          />
        </div>

        <div v-else-if="activeInspectorTool === 'annotations' && inspectorTab === 'comments'" class="writing-inspector__body" data-authoring-inspector="annotations">
          <div class="writing-inspector__density">
            <button type="button" class="writing-review-trigger" :disabled="!selectedChapterId" @pointerdown="freezeReviewSource" @click="openReviewPanel">{{ tr('打开校对') }}</button>
          </div>

          <div
            ref="annotationLaneRef"
            class="writing-inspector__list"
            :style="annotationLaneStyle"
          >
            <article
              v-for="annotation in marginAnnotations"
              :key="annotation.id"
              class="writing-annotation"
              :class="[`is-${annotation.status}`, { 'is-active': activeAnnotationId === annotation.id }]"
              role="button"
              tabindex="0"
              :aria-label="`${getWritingAnnotationLabel(annotation)}：${annotation.body}`"
              :ref="(element) => setAnnotationNoteRef(element, annotation.id)"
              :style="getAnnotationNoteStyle(annotation)"
              @click="locateAnnotation(annotation)"
              @focus="activeAnnotationId = annotation.id"
              @keydown="handleAnnotationKeydown($event, annotation, marginAnnotations.indexOf(annotation))"
            >
              <header>
                <span>{{ annotation.reviewType ? `${annotation.reviewType} · ` : '' }}{{ getWritingAnnotationLabel(annotation) }}</span>
              </header>
              <template v-if="editingAnnotationId === annotation.id">
                <textarea
                  v-model="annotationEditDraft"
                  class="writing-annotation__edit"
                  rows="3"
                  :aria-label="tr(&quot;编辑批注&quot;)"
                  @click.stop
                  @keydown.meta.enter.prevent="saveAnnotationEdit(annotation)"
                  @keydown.ctrl.enter.prevent="saveAnnotationEdit(annotation)"
                  @keydown.esc.prevent="cancelAnnotationEdit"
                ></textarea>
                <div class="writing-annotation__edit-actions" @click.stop>
                  <button type="button" :disabled="!annotationEditDraft.trim()" @click="saveAnnotationEdit(annotation)">{{ tr('保存') }}</button>
                  <button type="button" @click="cancelAnnotationEdit">{{ tr('取消') }}</button>
                </div>
              </template>
              <p v-else>{{ annotation.body }}</p>
              <div v-if="getAnnotationSupplements(annotation).length" class="writing-annotation__supplements">
                <p v-for="item in getAnnotationSupplements(annotation)" :key="item.id"><span>{{ tr('补充') }}</span>{{ item.body }}</p>
              </div>
              <footer>
                <button type="button" @click.stop="startAnnotationEdit(annotation)">{{ tr('编辑') }}</button>
                <button v-if="annotation.status !== 'orphaned'" type="button" @click.stop="startRewriteFromAnnotation(annotation)">{{ tr('按批注改写') }}</button>
                <button type="button" class="is-danger" @click.stop="deleteAnnotation(annotation)">{{ tr('删除') }}</button>
              </footer>

              <section
                v-if="rewriteTarget?.annotationId === annotation.id"
                class="writing-annotation-rewrite"
                :aria-label="tr(&quot;按当前批注改写&quot;)"
                @click.stop
              >
                <textarea
                  v-model="rewriteInstruction"
                  class="writing-rewrite-panel__input"
                  rows="2"
                  :aria-label="tr(&quot;改写要求&quot;)"
                  @keydown.meta.enter.prevent="generateRewriteCandidates(rewriteTarget)"
                  @keydown.ctrl.enter.prevent="generateRewriteCandidates(rewriteTarget)"
                ></textarea>
                <div class="writing-rewrite-panel__actions">
                  <button type="button" :disabled="rewriteLoading || !rewriteTarget?.text" @click="generateRewriteCandidates(rewriteTarget)">
                    {{ rewriteLoading ? tr('生成中…') : rewriteCandidates.length ? tr('重新生成') : tr('生成改写') }}
                  </button>
                  <button v-if="rewriteLoading" type="button" class="is-quiet" @click="cancelRewriteGeneration">{{ tr('停止') }}</button>
                  <button v-if="rewriteError && !rewriteLoading" type="button" class="is-quiet" @click="retryRewriteCandidates">{{ tr('重试') }}</button>
                  <button type="button" class="is-quiet" @click="closeAnnotationRewrite">{{ tr('收起') }}</button>
                </div>
                <p v-if="rewriteError" class="writing-rewrite-panel__error" role="alert">{{ rewriteError }}</p>
                <div v-if="rewriteCandidates.length > 1" class="writing-annotation-rewrite__choices" :aria-label="tr(&quot;改写候选&quot;)">
                  <button
                    v-for="(candidate, candidateIndex) in rewriteCandidates"
                    :key="candidate.id"
                    type="button"
                    :class="{ active: selectedRewriteCandidateId === candidate.id }"
                    @click="selectedRewriteCandidateId = candidate.id"
                  >{{ candidateIndex + 1 }}</button>
                </div>
                <article v-if="selectedRewriteCandidate" class="writing-rewrite-candidate is-selected">
                  <p v-if="selectedRewriteCandidate.rationale">{{ selectedRewriteCandidate.rationale }}</p>
                  <div v-if="selectedRewriteCandidate.patches?.length" class="writing-rewrite-patches" :aria-label="tr(&quot;跨片段改写差异&quot;)">
                    <section v-for="(patch, patchIndex) in selectedRewriteCandidate.patches" :key="patch.nodeId" class="writing-rewrite-patch">
                      <small>{{ tr('片段 {value}', { value: patchIndex + 1 }) }}</small>
                      <div class="writing-rewrite-diff">
                        <div><small>{{ tr('原文') }}</small><span v-for="(part, index) in patch.diff?.before || []" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                        <div><small>{{ tr('候选') }}</small><span v-for="(part, index) in patch.diff?.after || []" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                      </div>
                    </section>
                  </div>
                  <div v-else class="writing-rewrite-diff" :aria-label="tr(&quot;改写差异&quot;)">
                    <div><small>{{ tr('原文') }}</small><span v-for="(part, index) in selectedRewriteCandidate.diff?.before || []" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                    <div><small>{{ tr('候选') }}</small><span v-for="(part, index) in selectedRewriteCandidate.diff?.after || []" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                  </div>
                  <footer>
                    <button type="button" :disabled="selectedRewriteCandidate.status !== 'ready'" @click="applyRewriteCandidate(selectedRewriteCandidate)">{{ selectedRewriteCandidate.patches?.length ? tr('整批采用') : tr('采用') }}</button>
                    <button type="button" class="is-quiet" @click="dismissRewriteCandidate(selectedRewriteCandidate)">{{ tr('忽略') }}</button>
                  </footer>
                </article>
              </section>
            </article>
            <form
              v-show="annotationComposerOpen"
              class="writing-annotation-composer"
              :ref="(element) => setAnnotationNoteRef(element, 'annotation-draft')"
              :style="annotationDraftAnchor ? getAnnotationNoteStyle(annotationDraftAnchor) : undefined"
              @submit.prevent="createAnnotationFromSelection"
            >
              <header>
                <span>{{ tr('新批注') }}</span>
                <button type="button" :title="tr(&quot;取消批注&quot;)" :aria-label="tr(&quot;取消批注&quot;)" @click="closeAnnotationComposer">×</button>
              </header>
              <p>“{{ selectedText.slice(0, 72) }}{{ selectedText.length > 72 ? '…' : '' }}”</p>
              <textarea
                v-model="annotationDraft"
                rows="3"
                :placeholder="tr(&quot;写下批注或修改要求&quot;)"
                :aria-label="tr(&quot;批注内容&quot;)"
                @keydown.meta.enter.prevent="createAnnotationFromSelection"
                @keydown.ctrl.enter.prevent="createAnnotationFromSelection"
                @keydown.esc.prevent="closeAnnotationComposer"
              ></textarea>
              <footer>
                <button type="submit" :disabled="!canCreateAnnotation">{{ tr('添加') }}</button>
                <button type="button" @click="closeAnnotationComposer">{{ tr('取消') }}</button>
              </footer>
            </form>
            <div v-if="!marginAnnotations.length && !annotationComposerOpen" class="writing-inspector__empty">{{ tr('选中正文后即可添加边注。') }}</div>
          </div>
        </div>

        <AuthoringHistoryPanel
          v-else-if="activeInspectorTool === 'history' || (activeInspectorTool === 'annotations' && inspectorTab === 'version')"
          class="writing-inspector__body"
          :history="authoringHistory"
          :chapter-title="currentChapterTitle"
          :document-revision="writingDocument?.revision || 0"
          :chapter-selected="Boolean(selectedChapterId)"
        />
        <div v-else-if="activeInspectorTool === 'scene' && sceneInspectorMode === 'story'" class="writing-inspector__body" data-authoring-inspector="living-story">
          <AuthoringLivingStoryProjection
            :projection="livingStoryProjection"
            :active-unit-id="activeWritingUnitId || ''"
            @locate="locateLivingStoryBeat"
            @open-source="openLivingStorySource"
            @intervene="interveneFromLivingStory"
          />
        </div>
        <div v-else-if="activeInspectorTool === 'scene'" class="writing-inspector__body writing-scene-overview" data-authoring-inspector="scene">
          <p v-if="sceneDetailNotice" class="writing-review-status" role="status">{{ sceneDetailNotice }}</p>
          <!-- UX-03：桌面由左栏索引负责定位；右侧只放紧凑概览与主动作。
               窄屏左栏收入抽屉，当前地点文字可直达详情，但不恢复整套交互索引。 -->
          <dl class="writing-scene-overview__summary">
            <div><dt>{{ tr('时间') }}</dt><dd>{{ sceneProjection.time?.label || tr('未设置') }}</dd></div>
            <div><dt>{{ tr('人物') }}</dt><dd>{{ sceneOverviewPresentNames || tr('未设置') }}</dd></div>
            <div>
              <dt>{{ tr('地点') }}</dt>
              <dd>
                <button
                  v-if="chapterShelfSheetMode && sceneProjection.location?.id"
                  class="writing-scene-overview__fact-link"
                  type="button"
                  :aria-label="tr(&quot;查看地点详情&quot;)"
                  @click="openSceneDetail({ kind: 'location', id: sceneProjection.location.id })"
                >{{ sceneProjection.location.name }}</button>
                <template v-else>{{ sceneProjection.location?.name || tr('未设置') }}</template>
              </dd>
            </div>
          </dl>
          <section v-if="sceneProjection.unresolvedEvents?.length" class="writing-scene-overview__events" :aria-label="tr(&quot;本场未决事件&quot;)">
            <strong>{{ tr('全部未决事件') }}</strong>
            <button
              v-for="event in sceneProjection.unresolvedEvents"
              :key="event.id"
              type="button"
              @click="openSceneDetail({ kind: 'event', id: event.id })"
            >{{ event.label }}</button>
          </section>
          <div class="writing-inspector__actions">
            <button type="button" data-test="scene-overview-edit" @click="handleSceneEditRequest">{{ tr('调整当前场') }}</button>
            <button type="button" data-test="scene-overview-if" @click="openIfEntry()">{{ tr('人物 IF 试验') }}</button>
            <button v-if="!activeWritingUnitId" type="button" @click="openBlockComposer()">{{ tr('推演本章开场') }}</button>
          </div>
        </div>
        <div v-else-if="activeInspectorTool === 'characters'" class="writing-inspector__body writing-inspector__body--catalog" data-authoring-inspector="characters">
          <AuthoringCharacterPanel :manuscript-language="currentBook?.manuscriptLanguage"
            :worldbook="boundWorldbook"
            :chapters="chapters"
            :current-chapter-id="selectedChapterId"
            :present-people="composerPeople"
            :selected-text="selectedText"
            :focus-entry-id="inspectorCharacterEntryId"
            @bind="openBindingSelect"
            @create="createAuthoringCharacter"
            @update="updateAuthoringCharacter"
            @remove="removeAuthoringCharacter"
            @generate="openIllustratorForCharacter"
            @open-chapter="selectChapter"
            @open-full="openWorldbookFromDual"
            @toggle-pin="inspectorPinned = !inspectorPinned"
            @close="closeActiveWritingInspector"
          />
        </div>
        <div v-else-if="activeInspectorTool === 'materials'" class="writing-inspector__body" data-authoring-inspector="materials">
          <p class="writing-inspector__context"><strong>{{ tr('写作素材') }}</strong><span>{{ tr('这里只显示可直接用于当前稿面的收件箱内容') }}</span></p>
          <div v-if="inboxAssets.length" class="writing-inspector-simple-list">
            <button
              v-for="asset in inboxAssets.slice(0, 12)"
              :key="asset.id"
              type="button"
              @click="openInboxAssetFromInspector(asset)"
            ><strong>{{ asset.title || tr('未命名素材') }}</strong><span>{{ getAssetKindLabel(asset.kind) }}</span></button>
          </div>
          <div v-else class="writing-inspector__actions">
            <span>{{ tr('当前收件箱没有素材。') }}</span>
            <button type="button" @click="openAssetInbox">{{ tr('打开收件箱') }}</button>
          </div>
          <div class="writing-inspector__actions">
            <button type="button" @click="openMaterialsPage">{{ tr('打开完整素材库') }}</button>
          </div>
        </div>
      </aside>

      <button v-if="!inspectorOpen" class="writing-inspector__reopen" type="button" :title="tr(&quot;打开检查器&quot;)" @click="inspectorOpen = true">{{ tr('批注') }}<span v-if="openAnnotationCount">{{ openAnnotationCount }}</span></button>
    </main>

    <AuthoringIllustratorDrawer
      :open="illustratorOpen"
      v-model:minimized="illustratorMinimized"
      :storage-key="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
      :brief="illustratorBrief"
      :generation-brief="illustratorGenerationBrief"
      :freshness="illustratorFreshness"
      v-model:selected-scene-source-ids="illustratorSceneSourceIds"
      :reference-candidates="illustratorReferenceCandidates"
      :notice="illustratorNotice"
      @close="closeIllustrator"
      @save-to-material="handleIllustratorSaveMaterial"
      @insert-image="handleIllustratorInsertImage"
      @generation-start="handleIllustratorGenerationStart"
      @generation-complete="handleIllustratorGenerationComplete"
      @generation-error="handleIllustratorGenerationError"
      @generation-cancel="handleIllustratorGenerationCancel"
    />

    <AuthoringReviewPanel :explanation-language="reviewWorkflow.languagePolicy.value?.assistantLanguage" :content-language="reviewWorkflow.languagePolicy.value?.outputLanguage"
      :open="reviewPanelOpen && !reviewWorkflow.goalMode.value"
      :document-title="reviewDocumentTitle"
      :findings="reviewFindings"
      :busy="reviewLoading"
      :progress="{ completed: reviewCompletedBatches, total: reviewTotalBatches }"
      :error="reviewError"
      :status="reviewStatus"
      :attention-items="authoringVisibleExceptions"
      :undo-available="reviewUndoAvailable"
      @close="closeReviewPanel"
      @scan="runChapterReview"
      @cancel="cancelChapterReview"
      @jump="jumpToReviewFinding"
      @apply="applyReviewFinding"
      @ignore="ignoreReviewFinding"
      @apply-selected="applySelectedReviewFindings"
      @undo="undoReviewApplication"
      @resolve-attention="resolveAuthoringException"
    />

    <AuthoringSearchPanel
      :open="searchPanelOpen"
      :query="searchQuery"
      :scope="searchScope"
      :findings="searchFindings"
      :total="searchTotal"
      :truncated="searchTruncated"
      :busy="searchBusy"
      :error="searchError"
      :notice="searchNotice"
      :current-chapter-label="searchCurrentChapterLabel"
      :active-finding-id="activeSearchFindingId"
      :replacement="searchReplacement"
      :replace-preview="searchReplacePreview"
      :replace-busy="searchReplaceBusy"
      :can-return="searchCanReturn"
      @close="closeSearchPanel"
      @update:query="updateSearchQuery"
      @update:scope="updateSearchScope"
      @update:replacement="updateSearchReplacement"
      @search="runProjectSearch"
      @open-result="openSearchFinding"
      @return-origin="returnFromSearch"
      @replace-one="replaceOneSearchFinding"
      @replace-all="replaceAllSearchFindings"
      @preview-replace="previewSearchReplaceAll"
      @confirm-replace="confirmSearchReplaceAll"
      @cancel-replace-preview="cancelSearchReplacePreview"
    />

    <Transition name="modal-fade">
      <div v-if="assetInboxOpen" class="asset-inbox-overlay" @click.self="closeAssetInbox">
        <Transition name="modal-scale" appear>
          <FolioSurface as="article" variant="paper" :decorated="true" class="asset-inbox-modal writing-asset-inbox">
            <header class="asset-inbox-modal-header">
              <div>
                <div class="asset-inbox-modal-kicker">{{ tr('写作素材') }}</div>
                <h3 class="asset-inbox-modal-title">{{ tr('素材收件箱') }}</h3>
              </div>
              <button class="modal-close asset-inbox-close" type="button" @click="closeAssetInbox" :aria-label="tr(&quot;关闭素材面板&quot;)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </header>

            <div class="asset-inbox-modal-toolbar">
              <div class="asset-inbox-toolbar-group">
                <span class="asset-inbox-modal-stat">{{ tr('{length} 条待处理', { length: inboxAssets.length }) }}</span>
                <span class="asset-inbox-modal-stat">{{ tr('已选 {length} 条', { length: selectedInboxAssetIds.length }) }}</span>
              </div>
              <div class="asset-inbox-toolbar-group">
                <select v-model="assetInboxScope" class="asset-inbox-filter" @change="refreshAssetInbox">
                  <option value="all">{{ tr('全部素材') }}</option>
                  <option value="current-book" :disabled="!selectedBookId">{{ tr('当前书') }}</option>
                  <option value="unbound">{{ tr('未绑定') }}</option>
                </select>
                <select v-model="assetInboxKind" class="asset-inbox-filter" @change="refreshAssetInbox">
                  <option value="">{{ tr('全部类型') }}</option>
                  <option v-for="kind in assetKindOptions" :key="kind.value" :value="kind.value">
                    {{ kind.label }} · {{ kind.explanation }}
                  </option>
                </select>
                <button class="quick-note-mini-btn" type="button" @click="refreshAssetInbox">{{ tr('刷新') }}</button>
              </div>
              <div class="asset-inbox-toolbar-group">
                <button class="quick-note-mini-btn" type="button" @click="selectAllInboxAssets">{{ tr('全选') }}</button>
                <button class="quick-note-mini-btn" type="button" @click="clearInboxAssetSelection">{{ tr('清空') }}</button>
                <button class="quick-note-mini-btn primary" type="button" :disabled="!selectedInboxAssetIds.length" @click="insertSelectedAssetsIntoChapter">{{ tr('插入正文') }}</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="addSelectedAssetsToChapterOutline">{{ tr('加入纲要') }}</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="acceptSelectedWorldbookDraftAssets">{{ tr('入世界书') }}</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="archiveSelectedAssets">{{ tr('归档') }}</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="rejectSelectedAssets">{{ tr('拒绝') }}</button>
              </div>
            </div>
            <div v-if="quickNoteStatus" class="asset-inbox-status">{{ quickNoteStatus }}</div>

            <div class="asset-inbox-modal-body">
              <div class="asset-inbox-list-panel">
                <button
                  v-for="asset in inboxAssets"
                  :key="asset.id"
                  type="button"
                  class="asset-inbox-row"
                  :class="{ active: assetInboxActiveId === asset.id }"
                  @click="focusInboxAsset(asset.id)"
                >
                  <input
                    class="quick-note-import-check"
                    type="checkbox"
                    :checked="selectedInboxAssetIds.includes(asset.id)"
                    @click.stop
                    @change="toggleInboxAssetSelection(asset.id)"
                  />
                  <div class="asset-inbox-row-copy">
                    <div class="asset-inbox-row-head">
                      <span class="asset-inbox-title">{{ asset.title || tr('未命名素材') }}</span>
                      <span class="asset-inbox-kind">{{ getAssetKindLabel(asset.kind) }}</span>
                    </div>
                    <div class="asset-inbox-source">{{ getAssetSourceDetail(asset.source) }}</div>
                    <div class="asset-inbox-kind-explanation">{{ getAssetKindExplanation(asset.kind) }}</div>
                    <p class="asset-inbox-preview">{{ asset.content }}</p>
                  </div>
                </button>
                <div v-if="!inboxAssets.length" class="asset-inbox-empty-state">{{ tr('当前没有待处理素材') }}</div>
              </div>

              <aside class="asset-inbox-detail-panel">
                <template v-if="activeInboxAsset">
                  <div class="asset-inbox-detail-kicker">{{ getAssetKindLabel(activeInboxAsset.kind) }}</div>
                  <div class="asset-inbox-detail-explanation">{{ getAssetKindExplanation(activeInboxAsset.kind) }}</div>
                  <h4 class="asset-inbox-detail-title">{{ activeInboxAsset.title || tr('未命名素材') }}</h4>
                  <div class="asset-inbox-detail-meta">{{ getAssetSourceDetail(activeInboxAsset.source) }}</div>
                  <div class="asset-inbox-detail-content">{{ activeInboxAsset.content }}</div>
                  <div class="asset-inbox-detail-actions">
                    <button class="quick-note-mini-btn primary" type="button" :title="assetActionHelpMap.insert" @click="insertAssetIntoChapter(activeInboxAsset)">{{ tr('插入正文') }}</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.reference" @click="useAssetAsCopilotContext(activeInboxAsset)">{{ tr('续写参考') }}</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.outline" @click="addAssetToChapterOutline(activeInboxAsset)">{{ tr('加入纲要') }}</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.material" @click="saveAssetAsMaterial(activeInboxAsset)">{{ tr('转成素材') }}</button>
                    <button
                      v-if="canConvertAssetToWorldbookEntry(activeInboxAsset)"
                      class="quick-note-mini-btn"
                      type="button"
                      :title="assetActionHelpMap.worldbook"
                      @click="acceptWorldbookDraftAsset(activeInboxAsset)"
                    >{{ tr('入世界书') }}</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.archive" @click="archiveAsset(activeInboxAsset)">{{ tr('归档') }}</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.reject" @click="rejectAsset(activeInboxAsset)">{{ tr('拒绝') }}</button>
                  </div>
                  <div class="asset-action-help-grid">
                    <div v-for="item in assetActionHelpEntries" :key="item.key" class="asset-action-help-item">
                      <strong>{{ tr(item.label) }}</strong>
                      <span>{{ item.description }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="asset-inbox-empty-state">{{ tr('选择一条素材查看详情') }}</div>
              </aside>
            </div>
          </FolioSurface>
        </Transition>
      </div>
    </Transition>

    <!-- 新建书籍弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showNewBookModal" class="modal-overlay" @click.self="showNewBookModal = false">
        <Transition name="modal-scale" appear>
          <form class="modal" role="dialog" aria-modal="true" aria-labelledby="new-book-title" @submit.prevent="confirmCreateBook">
            <div class="modal-header">
              <h3 id="new-book-title">{{ tr('新建书稿') }}</h3>
              <button class="modal-close" type="button" :aria-label="tr(&quot;关闭新建书稿&quot;)" @click="showNewBookModal = false">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="input-label">{{ tr('书名') }}</label>
              <input
                v-model="newBookTitle"
                type="text"
                class="input"
                :placeholder="tr(&quot;输入书籍名称&quot;)"
                ref="newBookInput"
              />
              <ManuscriptLanguageSelect v-model="newBookLanguage" /><p class="modal-hint">{{ tr('创建后会建立第一个章节，可以立即写正文。') }}</p>
              <details class="modal-options">
                <summary>{{ tr('可选：简介与世界书') }}</summary>
                <label class="input-label">{{ tr('简介') }}</label>
                <textarea
                  v-model="newBookDesc"
                  class="input textarea"
                  :placeholder="tr(&quot;一句话记下这本书想写什么&quot;)"
                ></textarea>
                <label class="input-label">{{ tr('世界书') }}</label>
                <select v-model="newBookWorldbookId" class="input" :aria-label="tr(&quot;新建书籍绑定世界书&quot;)">
                  <option value="">{{ tr('暂不绑定') }}</option>
                  <option v-for="wb in worldStore.worldbooksIndex" :key="wb.id" :value="String(wb.id)">{{ wb.name || wb.id }}</option>
                </select>
              </details>
            </div>
            <div class="modal-footer">
              <button class="btn" type="button" @click="showNewBookModal = false">{{ tr('取消') }}</button>
              <button class="btn-primary" type="submit" data-test="new-book-confirm" :disabled="!newBookTitle.trim()">{{ tr('创建并开始写') }}</button>
            </div>
          </form>
        </Transition>
      </div>
    </Transition>

    <AuthoringManuscriptImport
      v-if="showManuscriptImport"
      @close="closeManuscriptImport"
      @import="confirmManuscriptImport"
    />

  </div>
</template>

<script setup>
import { chineseChapterNumber } from '../services/writing/writingChapterLabels.js'
import { tr, uiLocale } from '../i18n/index.js'
import ManuscriptLanguageSelect from '../components/authoring/ManuscriptLanguageSelect.vue'
import { normalizeManuscriptLanguage, inferWritingLanguage } from '../../shared/writingLanguage.js'
import { getChapterMarkdown } from '../services/writing/writingDocumentSchema.js'
import { countWritingText, writingTextMetrics } from '../../shared/writingTextMetrics.js'
import { ref, reactive, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../utils/sanitize'
import { useRoute, useRouter } from 'vue-router'
import { extractWritingSuggestionWindow } from '../services/agents/authoring/writingSuggestion'
import { readWorldbookSnapshot, useWorldStore } from '../stores/worldStore'
import { useWorkspaceTabsStore } from '../stores/workspaceTabsStore'
import { useWritingTypographyStore, WRITING_FONT_OPTIONS, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../stores/writingTypographyStore'
import { useGameStore } from '../stores/gameStore'
import FolioSurface from '../components/folio/FolioSurface.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import WritingNotebookEditor from '../components/writing/WritingNotebookEditor.vue'
import { buildWritingSelectionRanges } from '../services/writing/writingSelectionRanges.js'
import AuthoringSceneRail from '../components/authoring/AuthoringSceneRail.vue'
const AuthoringLivingStoryProjection = defineAsyncComponent(() => import('../components/authoring/AuthoringLivingStoryProjection.vue'))
const AuthoringSceneLaboratory = defineAsyncComponent(() => import('../components/authoring/AuthoringSceneLaboratory.vue'))
const AuthoringRehearsalPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringRehearsalPanel.vue'))
import { reconcileManifestDependencies } from '../services/agents/context/contextManifestLifecycle.js'
const AuthoringSceneCurationPreview = defineAsyncComponent(() => import('../components/authoring/AuthoringSceneCurationPreview.vue'))
const AuthoringInterventionComposer = defineAsyncComponent(() => import('../components/authoring/AuthoringInterventionComposer.vue'))
const AuthoringInterventionGhost = defineAsyncComponent(() => import('../components/authoring/AuthoringInterventionGhost.vue'))
const AuthoringBlockComposer = defineAsyncComponent(() => import('../components/authoring/AuthoringBlockComposer.vue'))
const AuthoringBlockDraft = defineAsyncComponent(() => import('../components/authoring/AuthoringBlockDraft.vue'))
const AuthoringAdoptionImpact = defineAsyncComponent(() => import('../components/authoring/AuthoringAdoptionImpact.vue'))
import AuthoringWorkspaceToolRail from '../components/authoring/AuthoringWorkspaceToolRail.vue'
const AuthoringDualPane = defineAsyncComponent(() => import('../components/authoring/AuthoringDualPane.vue'))
const AuthoringQuickWords = defineAsyncComponent(() => import('../components/authoring/AuthoringQuickWords.vue'))
const AuthoringKnowledgeAssistant = defineAsyncComponent(() => import('../components/authoring/AuthoringKnowledgeAssistant.vue'))
const AuthoringIllustratorDrawer = defineAsyncComponent(() => import('../components/authoring/AuthoringIllustratorDrawer.vue'))
const AuthoringReviewPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringReviewPanel.vue'))
const AuthoringSearchPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringSearchPanel.vue'))
import AuthoringIdeaShelf from '../components/authoring/AuthoringIdeaShelf.vue'
const AuthoringNotesExtractionPreview = defineAsyncComponent(() => import('../components/authoring/AuthoringNotesExtractionPreview.vue'))
const AuthoringInspectorDetail = defineAsyncComponent(() => import('../components/authoring/AuthoringInspectorDetail.vue'))
const AuthoringOutlinePanel = defineAsyncComponent(() => import('../components/authoring/AuthoringOutlinePanel.vue'))
const AuthoringManuscriptImport = defineAsyncComponent(() => import('../components/authoring/AuthoringManuscriptImport.vue'))
const AuthoringFirstRunPath = defineAsyncComponent(() => import('../components/authoring/AuthoringFirstRunPath.vue'))
const AuthoringCharacterPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringCharacterPanel.vue'))
const AuthoringWorldbookPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringWorldbookPanel.vue'))
import { buildWritingContextCandidates } from '../services/agents/context/writingContextReaders.js'
import { collectWritingContextDependencyRevisions, discoverCrossChapterContext } from '../services/agents/context/crossChapterContext.js'
import { buildManuscriptPositionIndex } from '../services/writing/manuscriptPositionIndex.js'
import { buildAuthoringPositionIndex as buildWritingAuthoringPositionIndex } from '../services/writing/authoringPositionIndex.js'
import { createAuthoringKnowledgeQuerySession } from '../services/agents/authoring/authoringKnowledgeQuerySession.js'
import { createAuthoringKnowledgeReaderHost } from '../services/agents/authoring/authoringKnowledgeReaderHost.js'
import { buildAuthoringReviewRewriteTarget, compareAuthoringReviewRewriteTarget, compareWritingRewriteTarget } from '../services/agents/authoring/authoringReviewRewriteTarget.js'
import { sourceRefForAuthoringEvidenceLocator } from '../services/agents/authoring/authoringKnowledgeAnswerContract.js'
import { createAuthoringInterventionSession } from '../services/agents/authoring/authoringInterventionSession.js'
import { readAuthoringOutlineCausalLinks } from '../services/agents/authoring/authoringCausalLinkReader.js'
import {
  createAuthoringInterventionRehearsalRun,
  discardAuthoringInterventionGhost
} from '../services/agents/authoring/authoringInterventionRehearsalRun.js'
import { generateAuthoringInterventionRehearsalDrafts } from '../services/agents/authoring/authoringInterventionRehearsalProvider.js'
import {
  createAuthoringInterventionSingleReceipt,
  markAuthoringInterventionAdoptionPersisted,
  prepareAuthoringInterventionAdoption,
  prepareAuthoringInterventionUmbrella,
  prepareAuthoringInterventionUmbrellaUndo
} from '../services/agents/authoring/authoringInterventionAdoption.js'
import { claimWritingGhostCandidate, createWritingGhostCandidate } from '../services/agents/authoring/writingGhostCandidate.js'
import { canRedoWritingAdoptionDeltas, canUndoWritingAdoptionDeltas } from '../services/agents/authoring/writingAdoptionTransaction.js'
import {
  collectAuthoringSceneRunIntentEffects,
  createAuthoringSceneRunIntent,
  readAuthoringSceneRunIntentsForTarget
} from '../services/agents/authoring/authoringSceneRunIntents.js'
import { matchWorldbookEntries } from '../services/worldbook/worldbookContextBuilder.js'
import { buildAuthoringCaretContext } from '../services/authoring/authoringSettingContext.js'
import { buildWritingWorldbookMentions } from '../services/writing/writingWorldbookMentions.js'
import {
  buildAuthoringQuickWordCatalog,
  resolveAuthoringQuickWordPrefix,
  resolveAuthoringQuickWordSuggestions
} from '../services/authoring/authoringQuickWords.js'
import {
  buildAuthoringEntityEntry,
  createAuthoringEntityEntryCommand,
  createAuthoringEntitySelection,
  createAuthoringEntitySelectionReceipt,
  findAuthoringEntitySelectionConflicts
} from '../services/authoring/authoringEntitySelection.js'
import { buildAuthoringSceneProjection, resolveAuthoringEmergenceDetailModel } from '../services/agents/authoring/authoringSceneProjection.js'
import { buildAuthoringLivingStoryProjection } from '../services/agents/authoring/authoringLivingStoryProjection.js'
import { buildAuthoringSceneLocationProjection } from '../services/agents/authoring/authoringSceneLocationProjection.js'
import AuthoringTransientNotice from '../components/authoring/AuthoringTransientNotice.vue'
const AuthoringMemoryReview = defineAsyncComponent(() => import('../components/authoring/AuthoringMemoryReview.vue'))
const AuthoringHistoryPanel = defineAsyncComponent(() => import('../components/authoring/AuthoringHistoryPanel.vue'))
import { listMemoryCandidates, queueMemoryCandidate, updateMemoryCandidate, confirmMemoryCandidate, rejectMemoryCandidate, mergeMemoryCandidateConflicts, replaceMemoryCandidateConflicts } from '../services/memory/memoryCandidates'
import {
  loadWritingBooks,
  saveWritingBooksDurable,
  createWritingBookRecord
} from '../services/writing/writingBooksRepository'
import {
  ASSET_KINDS,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  createNarrativeAssetSourceRef,
  listNarrativeAssets,
  mergeSourceRefs,
  normalizeContentRef,
  sourceRefsToEvidenceRefs,
  setNarrativeAssetsStatusDurable
} from '../services/media/narrativeAssets'
import {
  buildWorldbookEntryFromAsset,
  canConvertAssetToWorldbookEntry
} from '../services/worldbook/worldbookDraftAssets'
import {
  createWritingNoteFromAsset,
  prependWritingNote
} from '../services/agents/authoring/writingNotes'
import {
  addAssetsToChapterOutline,
  buildChapterOutlineContext,
  createChapterOutlineItem,
  normalizeChapterOutlineItems,
  removeChapterOutlineItem
} from '../services/writing/chapterOutline'
import { requestAdvisorTask } from '../services/advisorTaskService'
import { getResolvedApiSettings } from '../services/api'
import { createAuthoringTextWorkflow } from '../services/agents/authoring/authoringTextWorkflow'
import { createNarrativeSceneWorkflow } from '../services/agents/authoring/narrativeSceneWorkflow'
import { createNarrativeKernelExecutor } from '../services/agents/authoring/narrativeKernelExecutor'
import { createAuthoringNarrativeRun } from '../services/agents/authoring/authoringNarrativeRun.js'
import { createAuthoringRunRepositoryAdapters } from '../services/agents/authoring/authoringRunRepositories.js'
import { createAuthoringRunSessionAdapter } from '../services/agents/authoring/authoringRunSessionAdapter.js'
import { createAuthoringSceneLaboratoryRun } from '../services/agents/authoring/authoringSceneLaboratoryRun.js'
import { planAuthoringSceneDirections } from '../services/agents/authoring/authoringSceneDirectionPlanner.js'
import {
  addAuthoringRunReferenceSelection,
  buildAuthoringRunReferenceCatalog,
  reconcileAuthoringRunReferenceSelections,
  refreshAuthoringRunReferenceSelection,
  removeAuthoringRunReferenceSelection,
  toAuthoringRunReferences
} from '../services/agents/authoring/authoringRunReferenceSelection.js'
import { attachDependencyIssuesToReceipt } from '../services/agents/context/contextReceipt.js'
import { createAuthoringAuxiliaryWorkflow } from '../services/agents/authoring/authoringAuxiliaryWorkflow'
import { createAuthoringCommandRuntime } from '../services/agents/authoring/authoringRuntime'
import { buildDocumentRevision } from '../services/agents/authoring/authoringTextTransaction'
import { buildAuthoringTurnOriginRef } from '../services/writing/writingAuthoringTurnImport'
import { applyWritingAgentTransaction } from '../services/agents/writingAgentTransaction'
import { saveValidatedStoryboardVersion } from '../services/media/storyboardStore'
import { extractShotsFromChapter, toMarkdown } from '../services/media/shotExporter'
import { formatWorldbookStatus } from '../services/worldbook/worldbookFeedback'
import {
  createAssetFromSelection,
  parseInsertBackQuery,
  parseSelectionBackJump,
  resolveInsertOffset,
  spliceTextAt
} from '../services/agents/authoring/writingSelectionCapture'
import { STORAGE_KEYS } from '../composables/useStorage'
import {
  deleteWritingAnnotation,
  getWritingAnnotationLabel,
  normalizeWritingAnnotations,
  reconcileWritingAnnotations,
  resolveSelectionActionPosition,
  resolveWritingAnnotation
} from '../services/writing/writingAnnotations.js'
import { getWritingDocumentMarkdown, getWritingMarkdownPosition } from '../services/writing/writingDocumentSchema.js'
import {
  buildBookManuscriptExport,
  buildChapterManuscriptExport
} from '../services/writing/writingManuscriptExport.js'
import { downloadTextFile } from '../utils/download.js'
import {
  buildWritingBlockHistoryEntries,
  getWritingBlockText
} from '../../shared/writingBlockHistoryContract.js'
import {
  listExplorationDocuments,
  getExplorationDocument,
  createExplorationDocument,
  saveExplorationDocument,
  deleteExplorationDocument,
  authoringDocumentKey,
  createDocumentHandle
} from '../services/writing/authoringDocumentRepository.js'
import {
  listOutlineNodes as listProjectOutlineNodes,
  listOutlineEdges as listProjectOutlineEdges,
  fingerprintOutline,
  normalizeOutlineNodes,
  upsertOutlineNode as upsertProjectOutlineNode
} from '../services/writing/projectOutlineRepository.js'
import { projectExperienceSession } from '../services/agents/authoring/authoringSessionProjection.js'
import { migrateWritingNotesToExplorations } from '../services/writing/authoringPeripheralBridge.js'
import { listWritingNotes } from '../services/agents/authoring/writingNotes.js'
import { buildChineseQuoteInsertion } from '../services/writing/writingChineseInput.js'
import {
  blocksPassiveInlineSuggestion
} from '../services/writing/writingInteractionPolicy.js'
import { explainWritingName, generateWritingNames } from '../services/writing/writingNameGenerator.js'
import {
  normalizeBookWorldbookBinding,
  resolveBookWorldbookStatus,
  previewWorldbookRebind,
  bindUnboundSceneAnchors,
  detachSceneAnchorsFromWorldbook,
  createBoundWorldbookSync,
  buildChapterBoundaryPayload
} from '../services/agents/authoring/authoringProjectWorldbook.js'
import {
  normalizeSceneAnchors,
  resolveActiveSceneAnchor,
  reconcileSceneAnchorsForUnitTransition,
  fingerprintSceneAnchors
} from '../services/agents/authoring/authoringSceneAnchors.js'
import { normalizeAuthoringFailure } from '../services/agents/authoring/authoringExecutionResult.js'
import {
  useTheme,
  useWritingAgent,
  useInlineWritingAgentHost,
  useAuthoringReferenceSource,
  useAuthoringWorkspaceNavigation,
  useAuthoringPersistence,
  useAuthoringInspectorState,
  useEditorHistory,
  useAuthoringRehearsal,
  useAuthoringRehearsalWorkflow,
  useAuthoringRehearsalMemoryWorkflow,
  useAuthoringHistoryWorkflow,
  useAuthoringCollaborationWorkflow,
  useAuthoringInterventionState,
  useAuthoringInterventionWorkflow,
  useAuthoringFirstRun,
  useSettingsPopup,
  useAuthoringCharacterIfWorkflow,
  useAuthoringSceneLaboratoryWorkflow,
  useAuthoringBlockWorkflow,
  useAuthoringGhostAdoptionWorkflow,
  useAuthoringReviewWorkflow,
  useAuthoringSearchWorkflow,
  useAuthoringRewriteWorkflow,
  useAuthoringAnnotationSession,
  useAuthoringAnnotationSelection,
  useAuthoringAnnotationLayout,
  useAuthoringBookActivation,
  useAuthoringKnowledgeAssistant,
  useAuthoringIllustrator,
  useBodyScrollLock,
  useWritingDocument,
  useAuthoringTask,
  useAuthoringObservers,
  useAuthoringSceneWorkflow
} from '../composables/useAuthoringWorkspaceOwners.js'
const router = useRouter()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const {
  clear: clearWritingDocument,
  document: writingDocument,
  getBlockAtPosition: getWritingBlockAtPosition,
  loadChapterDocument,
  readChapterSource,
  syncFromMarkdown,
  persistChapterDocument
} = useWritingDocument()
const worldStore = useWorldStore()
const gameStore = useGameStore()
// 工作台标签会话：页面只回报上下文（章、dirty、恢复锚点），不拥有标签状态。
const workspaceTabsStore = useWorkspaceTabsStore()
let workspaceNavigationController = null
function openProjectSettingsSurface(...args) {
  return workspaceNavigationController?.openProjectSettingsSurface(...args) || false
}
const copilotCursorPos = ref(0)
const books = ref([])
const selectedBookId = ref('')
const chapters = ref([])
const selectedChapterId = ref(null)
const currentChapterTitle = ref('')
// —— 书与世界书显式绑定（worldbook scene closure Task 2）——
// 绑定保存在 book.worldbookId；生成链只读 boundWorldbook，绝不回退到全局 active 世界书。
// 绑定世界书：时序安全同步（复验修复 2）——切书瞬间清空旧绑定，
// 加载窗口（syncing）内暂停下一拍提交，慢返回不覆盖更新的选择。
const {
  boundWorldbook,
  syncing: boundWorldbookSyncing,
  sync: syncBookWorldbook,
  ready: boundWorldbookSyncReady
} = createBoundWorldbookSync({
  loadWorldbookForProject: (id) => worldStore.loadWorldbookForProject(id)
})
const newBookWorldbookId = ref('')
// L5 跨页资料同步：同浏览器其他标签/设定页修改绑定世界书后，保守刷新。
// 只比较 revision，内容未变不动；变化时用当前 book.worldbookId 重新加载（自带令牌）。
async function refreshBoundWorldbookIfChanged({ notify = false } = {}) {
  const worldbookId = normalizeBookWorldbookBinding(currentBook.value)
  if (!worldbookId || boundWorldbookSyncing.value) return false
  const snapshot = readWorldbookSnapshot(worldbookId)
  if (!snapshot) return false
  const current = boundWorldbook.value
  if (current && String(current.id || '') === String(snapshot.id || '')
    && String(current.updatedAt || '') === String(snapshot.updatedAt || '')) return false
  const loaded = await syncBookWorldbook(currentBook.value, selectedBookId.value)
  if (loaded && notify) authoringTask.notify(tr('设定资料已更新：当前场与后续推演将使用新资料'))
  return Boolean(loaded)
}
function handleExternalWorldbookStorageChange(event) {
  const key = String(event?.key || '')
  if (key.startsWith('worldbook_') || key === 'writing_books') {
    refreshBoundWorldbookIfChanged({ notify: true })
  }
}
function handleAuthoringVisibilityRefresh() {
  if (document.visibilityState === 'visible') refreshBoundWorldbookIfChanged({ notify: true })
}
onMounted(() => {
  window.addEventListener('storage', handleExternalWorldbookStorageChange)
  document.addEventListener('visibilitychange', handleAuthoringVisibilityRefresh)
})
onBeforeUnmount(() => {
  window.removeEventListener('storage', handleExternalWorldbookStorageChange)
  document.removeEventListener('visibilitychange', handleAuthoringVisibilityRefresh)
})
// 项目级场景锚点（Task 4）：随章节数据持久化，绑定 unitId + 当前书的世界书。
const sceneAnchors = ref([])
// Declared before sceneProjection because that computed is watched during setup.
const authoringObservations = ref([])
// 最近一次锚点写入回执（撤销安全校验用）。
const lastSceneAnchorUndoReceipt = shallowRef(null)
const editorContent = ref('')
const showNewBookModal = ref(false)
const showManuscriptImport = ref(false)
const manuscriptImportReturnFocus = shallowRef(null)
const newBookTitle = ref('')
const newBookLanguage = ref('')
const newBookDesc = ref('')
const newBookInput = ref(null)
const editorRef = ref(null)
const notebookEditorRef = ref(null)
const blockComposerRef = ref(null)
const writingMainRef = ref(null)
const writingInspectorRef = ref(null)
const notebookSelection = ref(null)
let notebookSelectionScrollTop = 0
const inspectorWorldbookEntryId = ref('')
const inspectorWorldbookCandidateIds = ref([])
const authoringSettingCaretContext = computed(() => buildAuthoringCaretContext(writingDocument.value, notebookSelection.value))
const writingWorldbookMentions = computed(() => buildWritingWorldbookMentions(writingDocument.value, boundWorldbook.value))
const editorMode = ref('wysiwyg')
const markdownContent = ref('')
// —— 文本工作台 v3 正式文档树 ——
// Phase 0 的 URL 原型门控已退役；构思/速记必须在正常 /authoring 可见。
const wt3ExplorationDocs = ref([])
const wt3OutlineNodes = ref([])
const wt3LegacyNoteCount = computed(() => {
  const migrated = new Set(wt3ExplorationDocs.value.flatMap((doc) => doc.sourceRefs || []))
  return listWritingNotes().filter((note) => String(note?.content || '').trim() && !migrated.has(`writing-note:${note.id}`)).length
})
const wt3ActiveDocId = ref('')
const wt3PreviousChapterId = ref(null)
// 离开正文进入构思前的稿面滚动位置（返回正文时恢复，版心不跳）。
let wt3PreviousChapterScrollTop = 0
const wt3ActiveDoc = computed(() => wt3ExplorationDocs.value.find((doc) => doc.id === wt3ActiveDocId.value) || null)
const notebookHistoryEpoch = ref(0)
// ProseMirror history 必须以书 + 文档作用域为硬边界。切章或在正文/构思间切换时
// 重建 Notebook；否则旧章 undo step 会被映射到新文档并造成跨章串写。
const notebookDocumentKey = computed(() => `${selectedBookId.value || 'none'}:${wt3ActiveDocId.value ? `exploration:${wt3ActiveDocId.value}` : `chapter:${selectedChapterId.value || 'none'}`}:${notebookHistoryEpoch.value}`)
function fenceNotebookHistory() {
  notebookHistoryEpoch.value += 1
}
const wt3Handle = shallowRef(null)
const wt3OutlineEdges = ref([])
const wt3OutlineConflicts = ref([])
const wt3OutlineFilter = ref('all')
const wt3MigratedBookIds = new Set()
const wt3MigrationTasks = new Map()
const wt3OutlineConflictsByBook = new Map()
// Phase 3：每本书只迁移一次；动态 import 与仓库写入始终绑定捕获的 bookId。
// 切书期间完成的旧请求只更新对应书的缓存，不得把节点/冲突串到当前书。
async function wt3EnsureOutlineMigrated() {
  const bookId = String(selectedBookId.value || '')
  if (!bookId || wt3MigratedBookIds.has(bookId)) return true
  if (wt3MigrationTasks.has(bookId)) return wt3MigrationTasks.get(bookId)
  const task = (async () => {
    try {
      const migration = await import('../services/writing/projectOutlineMigration.js')
      const book = loadWritingBooks().find((item) => String(item.id) === bookId)
      if (!book) return false
      const plan = migration.planChapterOutlineMigration(book)
      let conflicts = plan.conflicts
      if (plan.create.length || plan.skipped.length) {
        const working = JSON.parse(JSON.stringify(book))
        const result = migration.applyChapterOutlineMigration(working, plan)
        conflicts = result.conflicts
        for (const node of result.created) {
          const persisted = upsertProjectOutlineNode(bookId, node)
          if (!persisted?.ok) throw new Error('outline-migration-persist-failed')
        }
      }
      wt3MigratedBookIds.add(bookId)
      wt3OutlineConflictsByBook.set(bookId, conflicts)
      wt3RefreshDocs(bookId)
      return true
    } catch {
      if (String(selectedBookId.value || '') === bookId) {
        authoringTask.notify(tr('旧章纲迁移失败，原章节内容仍保留，可稍后重试'))
      }
      return false
    } finally {
      wt3MigrationTasks.delete(bookId)
    }
  })()
  wt3MigrationTasks.set(bookId, task)
  return task
}
const wt3Annotations = ref([])
const activeEditorAnnotations = computed(() => (wt3ActiveDoc.value ? wt3Annotations.value : chapterAnnotations.value))
function activeAnnotationScopeKey() {
  const exploration = wt3ActiveDoc.value
  return exploration
    ? authoringDocumentKey({
        role: 'exploration',
        bookId: exploration.bookId || selectedBookId.value,
        documentId: exploration.id
      })
    : selectedChapterId.value
}
function reconcileActiveEditorAnnotations(document, previousDocument = null, transition = null) {
  const reconciled = reconcileWritingAnnotations(
    activeEditorAnnotations.value,
    document,
    activeAnnotationScopeKey(),
    previousDocument,
    transition
  )
  if (wt3ActiveDoc.value) wt3Annotations.value = reconciled
  else chapterAnnotations.value = reconciled
}
const wt3IdeaShelfDocs = computed(() => wt3ExplorationDocs.value.map((doc) => {
  const chapterIds = new Set()
  for (const node of wt3OutlineNodes.value) {
    if (!(node.explorationRefs || []).some((ref) => ref.documentId === doc.id)) continue
    for (const chapterId of node.chapterRefs || []) chapterIds.add(String(chapterId))
  }
  const associationLabels = [...chapterIds].map((chapterId) => {
    const index = chapters.value.findIndex((chapter) => String(chapter.id) === chapterId)
    if (index < 0) return ''
    return chapterRowLabel(index, chapters.value[index]?.title)
  }).filter(Boolean)
  return {
    ...doc,
    associatedChapterIds: [...chapterIds],
    associationLabel: associationLabels.length ? tr('关联 {value0}', { value0: associationLabels.join('、') }) : ''
  }
}))
// 章行只拥有一个序号来源。作者若把“第一章”也写进标题，先去掉标题里的
// 序号再按目录位置呈现，避免“第一章 第一章 上元夜”；空标题就朴素显示“第一章”。
function chapterRowLabel(index, title) {
  const { ordinal, name } = chapterRowParts(index, title)
  return name ? `${ordinal} ${name}` : ordinal
}
// 章行模板用分体式：序号与章名各占一个 span，间隔由排版控制，
// 不依赖半角空格（不同字重/字体下空格宽度不稳定）。
function chapterRowParts(index, title) {
  if (/^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b|prologue$|epilogue$)/i.test(String(title || '').trim())) return { ordinal: '', name: String(title).trim() }
  const ordinal = uiLocale.value === 'en' ? `Chapter ${index + 1}` : `第${chineseChapterNumber(index + 1)}章`
  const name = String(title || '')
    .trim()
    .replace(/^第\s*(?:[零〇一二三四五六七八九十百千万两]+|\d+)\s*章(?:\s*[-—:：·、.]?\s*)?/u, '')
    .trim()
  return { ordinal, name }
}
// 稿面标题与左导航共用同一序号来源：稿面只补“第X章”，章名仍由输入框承载。
// 作者标题已自带序号时不再重复显示（避免“第一章 第一章 上元夜”）。
const selectedChapterOrdinalLabel = computed(() => {
  const index = chapters.value.findIndex((chapter) => String(chapter.id) === String(selectedChapterId.value))
  if (index < 0) return ''
  if (/^(?:chapter\s+(?:\d+|[ivxlcdm]+)\b|prologue$|epilogue$)/i.test(String(currentChapterTitle.value || '').trim())) return ''
  if (/^第\s*[零〇一二三四五六七八九十百千万两0-9]+\s*章/u.test(String(currentChapterTitle.value || '').trim())) return ''
  return uiLocale.value === 'en' ? `Chapter ${index + 1}` : `第${chineseChapterNumber(index + 1)}章`
})
watch([selectedBookId, books], () => {
  const bookId = String(selectedBookId.value || '')
  wt3RefreshDocs(bookId)
  void wt3EnsureOutlineMigrated()
})
function wt3RefreshDocs(bookId = selectedBookId.value) {
  const normalizedBookId = String(bookId || '')
  if (!normalizedBookId) {
    wt3ExplorationDocs.value = []
    wt3OutlineNodes.value = []
    wt3OutlineEdges.value = []
    wt3OutlineConflicts.value = []
    return
  }
  const isActiveBook = String(selectedBookId.value || '') === normalizedBookId
  if (isActiveBook) {
    wt3ExplorationDocs.value = listExplorationDocuments(normalizedBookId)
    wt3OutlineNodes.value = listProjectOutlineNodes(normalizedBookId)
    wt3OutlineEdges.value = listProjectOutlineEdges(normalizedBookId)
    wt3OutlineConflicts.value = wt3OutlineConflictsByBook.get(normalizedBookId) || []
  }
  // 页面 saveChapters 以 books.value 为真源写回：仓库新建的探索文档必须
  // 同步进页面书数组，否则下一次章节保存会把探索文档冲掉。
  const fresh = loadWritingBooks()
  const current = books.value.find((item) => String(item.id) === normalizedBookId)
  if (current) {
    const updated = fresh.find((item) => String(item.id) === normalizedBookId)
    if (updated) {
      current.explorationDocuments = updated.explorationDocuments
      current.outlineNodes = updated.outlineNodes
      current.outlineEdges = updated.outlineEdges
    }
  }
}
// 离开探索文档前的持久化：内容 + 批注写回探索文档，清除恢复草稿与 dirty。
function wt3PersistActiveDoc() {
  clearPendingDocumentSaveTimers()
  const doc = wt3ActiveDoc.value
  if (!doc) return { ok: true }
  // 块级编辑器的真源是 writingDocument；markdown 投影可能滞后于 IME/命令路径。
  const content = writingDocument.value
    ? getWritingDocumentMarkdown(writingDocument.value)
    : markdownContent.value
  const result = saveExplorationDocument(doc.bookId || selectedBookId.value, doc.id, {
    content,
    annotations: wt3Annotations.value
  })
  if (result.ok) {
    cancelRecoveryDraftSchedule()
    authoringHistory.clearRecovery(authoringDocumentKey({ role: 'exploration', bookId: doc.bookId || selectedBookId.value, documentId: doc.id }))
    const key = `project:${selectedBookId.value}:authoring`
    workspaceTabsStore.updateContextByKey(key, { dirty: false })
    saveStatus.value = 'saved'
  } else {
    saveStatus.value = 'error'
  }
  return result
}
// 任何离开探索文档的路径（切章/切书/关闭）统一走这里；正文路径不受影响。
function wt3PersistBeforeLeaving() {
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前文档'))
    return { ok: false, reason: 'pending-adoption' }
  }
  if (!wt3ActiveDoc.value) return { ok: true }
  const result = wt3PersistActiveDoc()
  if (!result?.ok) {
    authoringTask.notify(tr('构思文档保存失败，已留在当前文档'))
    return result || { ok: false, reason: 'persist-failed' }
  }
  resetAnnotationWorkspaceScope()
  wt3ActiveDocId.value = ''
  // 关键：把稿面恢复为上一章已保存内容。随后的章节 boundary/保存以
  // markdownContent 为准，不恢复就会把探索文本写进正文（Gate 场景 2）。
  const prev = wt3PreviousChapterId.value
  const chapter = chapters.value.find((item) => item.id === prev)
  if (chapter) {
    const { raw, format } = readChapterSource(chapter)
    const fallbackMarkdown = format === 'md' ? raw : htmlToMarkdown(raw)
    markdownContent.value = loadChapterDocument(chapter, fallbackMarkdown)
    editorContent.value = markdownToHtml(markdownContent.value)
    syncMarkdownToEditor()
  }
  wt3PreviousChapterId.value = null
  return result
}
function openExplorationDoc(docId) {
  if (wt3ActiveDocId.value === docId) return
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前章节'))
    return false
  }
  if (blockPreview.value) {
    authoringTask.notify(tr('推演草稿尚未处理，请先采用或丢弃'))
    return false
  }
  writingAgentHost.cancelForScopeChange()
  if (blockComposer.open) closeBlockComposer()
  const bookId = selectedBookId.value
  const doc = getExplorationDocument(bookId, docId)
  if (!doc) return
  // 切换构思时只保存当前构思，不清除“返回正文”的章节锚点。
  const outgoingChapterBoundary = !wt3ActiveDoc.value
    ? buildCurrentChapterObserverBoundary()
    : null
  if (wt3ActiveDoc.value) {
    const result = wt3PersistActiveDoc()
    if (!result?.ok) {
      authoringTask.notify(tr('当前构思保存失败，未切换文档'))
      return false
    }
  } else if (selectedChapterId.value && !saveCurrentChapter()) {
    authoringTask.notify(tr('当前章节保存失败，未打开构思'))
    return false
  }
  resetAnnotationWorkspaceScope()
  if (outgoingChapterBoundary) dispatchChapterBoundary(outgoingChapterBoundary)
  const previousChapterId = wt3PreviousChapterId.value || selectedChapterId.value
  wt3ActiveDocId.value = docId
  wt3PreviousChapterId.value = previousChapterId
  // 构思文档是独立作用域：上一章/上一篇的候选不得进入新文档稿面。
  authoringTask.dismissAuxiliary()
  wt3Handle.value = createDocumentHandle({
    bookId, role: 'exploration', documentId: doc.id, title: doc.title, revision: doc.revision
  })
  // 恢复草稿比存储内容新时优先恢复未保存稿。
  const key = authoringDocumentKey({ role: 'exploration', bookId, documentId: doc.id })
  const draft = authoringHistory.readRecovery(key)
  markdownContent.value = draft?.markdown || String(doc.content || '')
  wt3Annotations.value = Array.isArray(doc.annotations) ? doc.annotations : []
  // 记住离开正文时的稿面滚动位置：返回正文后恢复，版心不跳（V2 Gate）。
  if (!wt3PreviousChapterScrollTop) {
    wt3PreviousChapterScrollTop = document.querySelector('.wall__dossier-scroll')?.scrollTop || 0
  }
  syncMarkdownToEditor()
  return true
}
function closeExplorationDoc() {
  if (blockPreview.value) {
    authoringTask.notify(tr('推演草稿尚未处理，请先采用或丢弃'))
    return false
  }
  writingAgentHost.cancelForScopeChange()
  if (blockComposer.open) abandonBlockComposer({ restoreSelection: false })
  // wt3PersistBeforeLeaving 会清空章节锚点，先取回用于滚动恢复判断
  const anchorChapterId = wt3PreviousChapterId.value
  const ok = wt3PersistBeforeLeaving()?.ok === true
  // 仅在回到同一章锚点时恢复离开前的稿面滚动；切章由章节自身锚点接管。
  if (ok && wt3PreviousChapterScrollTop && anchorChapterId === selectedChapterId.value) {
    const target = wt3PreviousChapterScrollTop
    wt3PreviousChapterScrollTop = 0
    nextTick(() => requestAnimationFrame(() => {
      const scroll = document.querySelector('.wall__dossier-scroll')
      if (scroll) scroll.scrollTop = target
    }))
  } else {
    wt3PreviousChapterScrollTop = 0
  }
  return ok
}
// 快速落笔：新建探索文档并直接进入编辑。
function wt3QuickCapture() {
  if (!selectedBookId.value) return
  const now = new Date()
  const stamp = `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const created = createExplorationDocument(selectedBookId.value, { title: `速记 ${stamp}`, content: '' })
  // eslint-disable-next-line no-console
  console.log('[wt3-capture]', JSON.stringify({ ok: created.ok, reason: created.reason || '', bookId: selectedBookId.value }))
  if (!created.ok) return
  wt3RefreshDocs()
  openExplorationDoc(created.document.id)
}
function wt3MigrateLegacyNotes() {
  const result = migrateWritingNotesToExplorations(selectedBookId.value, listWritingNotes())
  if (!result.ok) {
    authoringTask.notify(tr('旧速记迁移失败，请检查存储空间'))
    return false
  }
  wt3RefreshDocs()
  authoringTask.notify(result.created.length ? tr('已迁移 {value0} 条旧速记到构思', { value0: result.created.length }) : tr('旧速记均已迁移'))
}
// 删除探索文档：绝不触碰正文；正在编辑时先回到上一章。
function wt3DeleteDoc(docId) {
  if (wt3ActiveDocId.value === docId) {
    if (!wt3PersistBeforeLeaving()?.ok) return false
  }
  const result = deleteExplorationDocument(selectedBookId.value, docId)
  if (!result?.ok) {
    authoringTask.notify(tr('删除构思失败，请检查存储空间'))
    return false
  }
  const selectedReference = reconciledAuthoringRunReferences.value
    .find((item) => item.sourceKind === 'exploration-doc' && item.sourceId === docId)
  if (selectedReference) removeAuthoringRunReference(selectedReference.id)
  wt3RefreshDocs()
  return true
}
function wt3SetDocStatus(docId, status) {
  const doc = wt3ExplorationDocs.value.find((item) => item.id === docId)
  if (!doc || !['active', 'parked'].includes(status)) return false
  if (wt3ActiveDocId.value === docId && !wt3PersistBeforeLeaving()?.ok) {
    authoringTask.notify(tr('速记保存失败，未改变状态'))
    return false
  }
  const result = saveExplorationDocument(selectedBookId.value, docId, { status })
  if (!result?.ok) {
    authoringTask.notify(status === 'parked' ? tr('速记搁置失败') : tr('速记移回失败'))
    return false
  }
  if (status === 'parked') {
    const selectedReference = reconciledAuthoringRunReferences.value
      .find((item) => item.sourceKind === 'exploration-doc' && item.sourceId === docId)
    if (selectedReference) removeAuthoringRunReference(selectedReference.id)
  }
  wt3RefreshDocs()
  return true
}
function wt3LinkDocToCurrentChapter(docId) {
  const chapterId = String(selectedChapterId.value || '')
  const doc = wt3ExplorationDocs.value.find((item) => item.id === docId)
  if (!doc || !chapterId) return false
  const linkNodeId = `idea-link-${doc.id}`
  const existing = wt3OutlineNodes.value.find((node) => node.id === linkNodeId)
  const result = upsertProjectOutlineNode(selectedBookId.value, {
    ...(existing || {}),
    id: linkNodeId,
    title: doc.title,
    intent: existing?.intent || '章节速记',
    status: existing?.status || 'exploring',
    chapterRefs: [...new Set([...(existing?.chapterRefs || []), chapterId])],
    explorationRefs: [{ documentId: doc.id, role: 'alternative', state: 'proposed' }]
  })
  if (!result?.ok) {
    authoringTask.notify(tr('速记关联章节失败'))
    return false
  }
  wt3RefreshDocs()
  return true
}
const notebookEditorActive = computed(() => editorMode.value === 'wysiwyg')
// Scene projection is watched during setup, so this dependency must exist
// before the projection computed is declared below.
const activeWritingUnitId = computed(() => {
  const selection = readLiveWritingSelectionSnapshot()
  if (selection?.unitId) return selection.unitId
  const units = Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : []
  return units.at(-1)?.attrs?.unitId || null
})
const notebookEditorStyle = computed(() => ({
  '--notebook-font-family': editorFont.value,
  '--notebook-font-size': editorFontSize.value,
  '--notebook-line-height': String(writingTypography.lineHeight),
  '--notebook-font-weight': '400',
  '--notebook-font-style': 'normal',
  '--notebook-text-decoration': 'none',
  // Phase 2：小说标准排版变量（构思/正文共用，原型硬编码迁入变量 owner）。
  '--notebook-first-line-indent': writingTypography.firstLineIndent ? '2em' : '0',
  '--notebook-paragraph-gap': String(writingTypography.paragraphGap) + 'em'
}))
const selectedText = ref('')
const notebookCommandMenuOpen = ref(false)
const writingCompositionActive = ref(false)
const chapterAnnotations = ref([])
const authoringHistory = useAuthoringHistoryWorkflow({
  chapterId: () => selectedChapterId.value,
  chapterTitle: () => currentChapterTitle.value,
  document: () => writingDocument.value,
  markdown: () => markdownContent.value,
  annotations: () => chapterAnnotations.value,
  persistCurrent: () => saveCurrentChapter({ automaticHistory: false }),
  historyVisible: () => activeInspectorTool.value === 'history',
  rejectMutation: () => rejectLockedNotebookMutation(),
  dualSource: () => dualPaneRef.value?.getActiveSource?.(),
  prepareDualClose: () => dualPaneRef.value?.prepareClose?.(),
  confirmRestore: () => typeof window === 'undefined' || window.confirm(tr('当前章节在此快照之后已有修改。恢复会先保存一个“恢复前”检查点，继续吗？')),
  findChapter: (chapterId) => chapters.value.find((item) => item.id === chapterId),
  persistChapters: () => saveChapters(),
  selectChapter: (chapterId) => selectChapter(chapterId),
  reloadDual: (payload) => dualPaneRef.value?.reloadSearchSource?.(payload),
  markSaved: () => { saveStatus.value = 'saved' },
  unitByNode: (nodeId) => getWritingUnitByNodeId(nodeId),
  editorActive: () => notebookEditorActive.value,
  editor: () => notebookEditorRef.value,
  confirmDelete: (snapshot) => typeof window === 'undefined' || window.confirm(tr('删除「{value0}」？正文不会改变。', { value0: snapshot.label }))
})
const {
  snapshots: writingSnapshots,
  blockHistory: writingBlockHistory,
  recoveryDraft: writingRecoveryDraft,
  status: snapshotStatus,
  recordAutomatic: recordAutomaticHistoryAfterPersist,
  load: loadChapterSnapshots,
  formatTime: formatWritingSnapshotTime,
} = authoringHistory
let previousNotebookDocument = null
let previousNotebookAnnotations = null
const {
  getAnnotationSelectionContext,
  buildFullNodeAnnotationContext,
  getCurrentWritingNodeDescriptors
} = useAuthoringAnnotationSelection({
  hasDocument: () => Boolean(selectedChapterId.value),
  isNotebookActive: () => notebookEditorActive.value,
  getNotebookSelection: () => notebookSelection.value,
  getWritingNodeById: (nodeId) => getWritingNodeById(nodeId),
  getWritingUnitByNodeId: (nodeId) => getWritingUnitByNodeId(nodeId),
  findNotebookNodeRange: (nodeId) => notebookEditorRef.value?.findNodeRange?.(nodeId),
  getWritingDocument: () => writingDocument.value,
  getLiveSelection: () => readLiveWritingSelectionSnapshot(),
  getWritingBlockAtPosition: (position, markdown) => getWritingBlockAtPosition(position, markdown),
  getMarkdown: () => markdownContent.value
})
const {
  activeAnnotationId,
  editingAnnotationId,
  annotationEditDraft,
  annotationDraft,
  annotationComposerOpen,
  annotationComposerContext,
  marginAnnotations,
  openAnnotationCount,
  annotationDraftAnchor,
  canCreateAnnotation,
  getAnnotationSupplements,
  addAnnotation,
  closeAnnotationComposer,
  createAnnotationFromSelection,
  startAnnotationEdit,
  cancelAnnotationEdit,
  saveAnnotationEdit,
  deleteAnnotation,
  resetAnnotationSession
} = useAuthoringAnnotationSession({
  getAnnotations: () => activeEditorAnnotations.value,
  setAnnotations: (annotations) => {
    if (wt3ActiveDoc.value) wt3Annotations.value = annotations
    else chapterAnnotations.value = annotations
  },
  getSelectionContext: () => getAnnotationSelectionContext(),
  getScopeId: () => activeAnnotationScopeKey(),
  canCreateTarget: () => Boolean(
    selectedChapterId.value && selectedText.value.trim() && activeWritingBlock.value?.nodeId
  ),
  captureScroll: () => captureWritingScrollState(),
  restoreScroll: (snapshot) => restoreWritingScrollState(snapshot),
  openCommentsInspector: () => {
    openInspectorTool('annotations', { baseView: 'comments' })
  },
  setStatus: (message) => { quickNoteStatus.value = message },
  onChanged: () => onContentChange(),
  onBeforeDelete: (annotation) => {
    if (rewriteTarget.value?.annotationId === annotation.id) closeAnnotationRewrite()
  },
  clearDraftNoteRef: () => setAnnotationNoteRef(null, 'annotation-draft'),
  scheduleLayout: () => scheduleAnnotationLayout(),
  focusEditor: () => notebookEditorRef.value?.focus?.(),
  focusEditField: () => document.querySelector('.writing-annotation__edit')?.focus()
})
const {
  rewriteInstruction,
  rewriteTarget,
  rewriteCandidates,
  selectedRewriteCandidateId,
  rewriteLockedSegments,
  selectedRewriteCandidate,
  rewriteLoading,
  rewriteError,
  resetRewriteState,
  markRewriteCandidatesStale,
  generateRewriteCandidates,
  cancelRewriteGeneration,
  retryRewriteCandidates,
  applyRewriteCandidate,
  dismissRewriteCandidate
} = useAuthoringRewriteWorkflow({
  getManuscriptLanguage: () => currentBook.value?.manuscriptLanguage || '',
  getCurrentTarget: () => getCurrentRewriteTarget(),
  getCurrentComparison: (target) => target?.pane === 'dual' ? getDualRewriteComparison(target) : getCurrentRewriteComparison(target),
  getChapterId: (target) => target?.chapterId || target?.documentId || selectedChapterId.value,
  getEditorMode: () => editorMode.value,
  buildTaskContext: (options, target) => target?.pane === 'dual'
    ? { writingTask: { ...options }, selection: { text: target.text }, paragraph: { text: target.text }, contextWindow: target.text }
    : buildWritingTaskContext(options),
  commitCandidate: (candidate, target) => target?.pane === 'dual'
    ? commitDualRewriteCandidate(candidate, target)
    : commitRewriteCandidate(candidate, target),
  onCandidateApplied: ({ target }) => {
    if (!target?.annotationId) return
    if (wt3ActiveDoc.value) {
      wt3Annotations.value = deleteWritingAnnotation(wt3Annotations.value, target.annotationId)
    } else {
      chapterAnnotations.value = deleteWritingAnnotation(chapterAnnotations.value, target.annotationId)
    }
    activeAnnotationId.value = null
    onContentChange()
  },
  onAfterApplied: () => {
    scheduleAnnotationLayout()
    notebookEditorRef.value?.focus?.()
    syncCursorAndSelection()
  }
})
function resetAnnotationWorkspaceScope() {
  resetAnnotationSession()
  resetRewriteState()
  scheduleAnnotationLayout()
}
const sceneDetailNotice = ref('')
const reviewRewriteSavePending = ref(false)
const rehearsalComposerHostRef = ref(null)
const sceneInspectorMode = ref('current')
const dualPaneRef = ref(null)
const dualNotebookSelection = ref(null)
const dualCompositionActive = ref(false)
const dualTargetChapterId = ref('')
const dualTargetExplorationId = ref('')
const dualTargetOutlineNodeId = ref('')
const dualTargetWorldbookEntryId = ref('')
const dualActiveChapterId = ref('')
const inspectorOutlineNodeId = ref('')
const inspectorCharacterEntryId = ref('')
const knowledgeAssistantInvocation = shallowRef(null)
const {
  activeInspectorLabel,
  activeInspectorTool,
  activeWritingPane,
  clearInspectorReturnSurface,
  closeWritingInspector,
  freezeWritingSurfaceBeforeToolSelect,
  inspectorDetailState,
  inspectorDualColumn,
  inspectorOpen,
  inspectorPinned,
  inspectorReturnFocusRef,
  inspectorReturnSurface,
  inspectorTab,
  openInspectorTool,
  selectInspectorTool
} = useAuthoringInspectorState({
  selectedChapterId,
  chapters,
  dualPaneRef,
  dualTargetChapterId,
  dualTargetExplorationId,
  dualTargetOutlineNodeId,
  dualTargetWorldbookEntryId,
  clearDualQuickWordDocument: () => { dualQuickWordDocument.value = null },
  sceneDetailNotice,
  captureWritingSurface: captureCurrentWritingSurface,
  captureAssistantInvocation: captureKnowledgeAssistantInvocation,
  setAssistantInvocation: (invocation) => { knowledgeAssistantInvocation.value = invocation },
  discardSceneDraft: () => discardSceneCurationDraft(),
  restoreWritingSurface: restoreWritingSurfaceAfterInspector
})
const {
  annotationLaneRef,
  annotationLaneStyle,
  setAnnotationNoteRef,
  getAnnotationNoteStyle,
  refreshAnnotationLayout,
  scheduleAnnotationLayout,
  captureAnnotationLaneScroll,
  restoreAnnotationLaneScroll
} = useAuthoringAnnotationLayout({
  annotations: marginAnnotations,
  draftAnchor: annotationDraftAnchor,
  activeAnnotationId,
  inspectorOpen,
  inspectorTab,
  getDocumentRevision: () => writingDocument.value?.revision,
  getEditorRoot: () => notebookEditorRef.value?.getRootElement?.(),
  getWritingMain: () => writingMainRef.value,
  getAnchorMetrics: (annotation) => notebookEditorRef.value?.getAnnotationAnchorMetrics?.(annotation)
})
const illustratorTriggerRef = ref(null)
const illustratorController = useAuthoringIllustrator({
  isCompositionEvent: isWritingCompositionKey,
  compositionActive: () => writingCompositionActive.value || dualCompositionActive.value,
  draftBlocksOpen: () => blockComposer.open || blockPreview.value || pendingGhostAdoption.value,
  mobileToolsActive: () => chapterShelfSheetMode.value,
  notify: (message) => authoringTask.notify(message),
  captureSource: () => captureCurrentIllustratorSource(),
  captureLiveSource: () => captureLiveIllustratorSource(),
  captureSurface: () => captureCurrentWritingSurface(),
  prepareOpen: () => {
    showFontPanel.value = false
    showQuickWords.value = false
    showNameGen.value = false
    closeSearchPanel({ restore: false })
    closeReviewPanel({ restore: false })
    notebookCommandMenuOpen.value = false
    selectionActionsVisible.value = false
    contextMenu.value.show = false
  },
  closeMobileTools: () => { moreMenuOpen.value = false },
  projectId: () => selectedBookId.value,
  insertMediaReference: (payload, pane) => pane === 'dual'
    ? dualPaneRef.value?.insertMediaReference?.(payload)
    : notebookEditorRef.value?.insertMediaReference?.(payload),
  restoreSurface: async (surface) => {
    if (surface?.pane === 'dual' && dualSurfaceTargetMatches(surface)) {
      activeWritingPane.value = 'dual'
      if (await dualPaneRef.value?.restoreSurfaceState?.(surface)) return true
    }
    return surface?.pane === 'main' && restoreMainWritingSurface(surface)
  },
  focusFallback: () => (chapterShelfSheetMode.value ? moreToolsTriggerRef.value : illustratorTriggerRef.value)?.focus?.()
})
const {
  open: illustratorOpen,
  brief: illustratorBrief,
  selectedSceneSourceIds: illustratorSceneSourceIds,
  referenceCandidates: illustratorReferenceCandidates,
  notice: illustratorNotice,
  generationBrief: illustratorGenerationBrief,
  freshness: illustratorFreshness,
  minimized: illustratorMinimized,
  blocking: illustratorBlocking,
  freezeSource: freezeIllustratorSource,
  freezeMobileSource: freezeMobileToolSource,
  openIllustrator,
  openForCharacter: openIllustratorForCharacter,
  openFromMobileTools: openIllustratorFromMobileTools,
  releaseMobileSource: releaseIllustratorMobileSource,
  reconcileSource: reconcileIllustratorSource,
  closeAndRestore: closeIllustrator,
  saveMaterial: handleIllustratorSaveMaterial,
  insertImage: handleIllustratorInsertImage,
  generationStart: handleIllustratorGenerationStart,
  generationComplete: handleIllustratorGenerationComplete,
  generationError: handleIllustratorGenerationError,
  generationCancel: handleIllustratorGenerationCancel
} = illustratorController
function activeMainSurfaceIdentity() {
  const sourceKind = wt3ActiveDoc.value ? 'exploration' : 'chapter'
  const sourceId = String(wt3ActiveDoc.value?.id || selectedChapterId.value || '')
  return {
    pane: 'main',
    projectId: String(selectedBookId.value || ''),
    sourceKind,
    sourceId,
    scopeKey: `${selectedBookId.value || ''}|main|${sourceKind}|${sourceId}`,
    documentRevision: String(currentDocumentRevision()),
    documentSchemaRevision: String(writingDocument.value?.revision ?? '')
  }
}
function captureMainWritingSurface() {
  if (!notebookEditorRef.value || !selectedBookId.value) return null
  const identity = activeMainSurfaceIdentity()
  if (!identity.sourceId) return null
  return Object.freeze({
    ...identity,
    selectionBookmark: notebookEditorRef.value.captureSelectionBookmark?.() || null,
    scroll: captureWritingScrollState(),
    editorFocused: notebookEditorRef.value.hasEditorFocus?.() === true
  })
}
function captureCurrentWritingSurface() {
  if (activeWritingPane.value === 'dual') {
    const dualSurface = dualPaneRef.value?.captureSurfaceState?.()
    if (dualSurface) return dualSurface
  }
  return captureMainWritingSurface()
}
function captureMainDocumentSource() {
  if (!writingDocument.value || !selectedBookId.value) return null
  const exploration = wt3ActiveDoc.value
  const documentRole = exploration ? 'exploration' : 'manuscript'
  const documentId = String(exploration?.id || selectedChapterId.value || '')
  if (!documentId) return null
  const selection = notebookEditorRef.value?.getSelectionSnapshot?.() || notebookSelection.value
  return Object.freeze({
    pane: 'main',
    projectId: String(selectedBookId.value),
    sourceKind: exploration ? 'exploration' : 'chapter',
    role: documentRole,
    documentRole,
    documentId,
    chapterId: exploration ? '' : String(selectedChapterId.value || ''),
    unitId: String(notebookSelection.value?.unitId || activeWritingUnitId.value || ''),
    selectionRanges: buildWritingSelectionRanges(writingDocument.value, selection),
    title: String(exploration?.title || currentChapterTitle.value || ''),
    document: cloneAuthoringRunValue(writingDocument.value),
    markdown: String(markdownContent.value || ''),
    documentRevision: currentDocumentRevision(),
    documentSchemaRevision: String(writingDocument.value?.revision ?? ''),
    sceneProjection: cloneAuthoringRunValue(sceneProjection.value),
    worldbookEntries: cloneAuthoringRunValue(boundWorldbook.value?.entries || [])
  })
}
function captureActiveDocumentSource() {
  if (activeWritingPane.value === 'dual') {
    return dualPaneRef.value?.captureSearchSource?.() || null
  }
  return captureMainDocumentSource()
}
function captureActiveReviewSource() {
  if (activeWritingPane.value === 'dual') {
    return dualPaneRef.value?.captureReviewSource?.() || null
  }
  return captureMainDocumentSource()
}
function captureMainKnowledgeAssistantInvocation() {
  const projectId = String(selectedBookId.value || '')
  const role = wt3ActiveDoc.value ? 'exploration' : 'manuscript'
  const documentId = String(wt3ActiveDoc.value?.id || selectedChapterId.value || '')
  const chapterId = role === 'manuscript' ? String(selectedChapterId.value || '') : ''
  if (!projectId || !documentId || (role === 'manuscript' && !chapterId)) return null
  const selection = notebookSelection.value || {}
  const unitId = String(selection.unitId || activeWritingUnitId.value || '')
  const unit = (writingDocument.value?.content || []).find((item) => String(item?.attrs?.unitId || '') === unitId)
  const selectedNodeId = String(selection.nodeId || '')
  const node = (unit?.content || []).find((item) => String(item?.attrs?.nodeId || '') === selectedNodeId)
  const target = role === 'manuscript'
    ? Object.freeze({
        projectId,
        documentId,
        chapterId,
        ...(unit ? { unitId: String(unit.attrs.unitId) } : {}),
        ...(node ? { nodeId: String(node.attrs.nodeId) } : {})
      })
    : null
  return Object.freeze({
    pane: 'main',
    projectId,
    role,
    documentId,
    chapterId,
    target,
    sceneProjection: cloneAuthoringRunValue(sceneProjection.value),
    liveSource: Object.freeze({
      projectId,
      role,
      documentRole: role,
      documentId,
      chapterId,
      title: String(wt3ActiveDoc.value?.title || currentChapterTitle.value || ''),
      documentRevision: currentDocumentRevision(),
      documentSchemaRevision: String(writingDocument.value?.revision ?? ''),
      document: cloneAuthoringRunValue(writingDocument.value)
    })
  })
}
function captureKnowledgeAssistantInvocation() {
  if (activeWritingPane.value !== 'dual') return captureMainKnowledgeAssistantInvocation()
  const source = dualPaneRef.value?.getActiveSource?.() || null
  const liveSource = dualPaneRef.value?.captureKnowledgeSource?.() || null
  if (!liveSource) {
    // 大纲/设定等只读副窗没有落笔 target；助手按项目范围查询，绝不借用
    // 被遮在后面的主栏章节作为“当前写作位置”。
    return Object.freeze({
      pane: 'dual-reference',
      projectId: String(selectedBookId.value || ''),
      role: '',
      documentId: String(source?.id || ''),
      chapterId: '',
      target: null,
      sceneProjection: null,
      liveSource: null
    })
  }
  const role = liveSource.documentRole === 'exploration' ? 'exploration' : 'manuscript'
  const target = role === 'manuscript'
    ? Object.freeze({
        projectId: String(liveSource.projectId || ''),
        documentId: String(liveSource.documentId || ''),
        chapterId: String(liveSource.chapterId || ''),
        ...(liveSource.unitId ? { unitId: String(liveSource.unitId) } : {}),
        ...(liveSource.nodeId ? { nodeId: String(liveSource.nodeId) } : {})
      })
    : null
  return Object.freeze({
    pane: 'dual',
    projectId: String(liveSource.projectId || ''),
    role,
    documentId: String(liveSource.documentId || ''),
    chapterId: String(liveSource.chapterId || ''),
    target,
    sceneProjection: cloneAuthoringRunValue(liveSource.sceneProjection),
    liveSource
  })
}
function writingUnitVisualText(unit) {
  return (unit?.content || []).map((node) => {
    if (node?.type === 'mediaReference') return String(node?.attrs?.alt || '')
    const readNode = (value) => {
      if (typeof value?.text === 'string') return value.text
      return (value?.content || []).map(readNode).join('')
    }
    return readNode(node)
  }).filter(Boolean).join('\n\n').trim()
}
function captureMainIllustratorSource() {
  if (!notebookEditorRef.value || writingCompositionActive.value) return null
  const projectId = String(selectedBookId.value || '')
  const role = wt3ActiveDoc.value ? 'exploration' : 'manuscript'
  const documentId = String(wt3ActiveDoc.value?.id || selectedChapterId.value || '')
  const chapterId = role === 'manuscript' ? String(selectedChapterId.value || '') : ''
  const selection = notebookEditorRef.value.getSelectionSnapshot?.() || notebookSelection.value
  const unitId = String(selection?.unitId || activeWritingUnitId.value || '')
  const unit = (writingDocument.value?.content || []).find((item) => String(item?.attrs?.unitId || '') === unitId)
  const nodeId = String(selection?.nodeId || unit?.content?.[0]?.attrs?.nodeId || '')
  const node = (unit?.content || []).find((item) => String(item?.attrs?.nodeId || '') === nodeId)
  if (!projectId || !documentId || !unit || !node || !selection) return null
  return Object.freeze({
    pane: 'main',
    projectId,
    role,
    documentRole: role,
    documentId,
    chapterId,
    title: String(wt3ActiveDoc.value?.title || currentChapterTitle.value || ''),
    documentRevision: currentDocumentRevision(),
    documentSchemaRevision: String(writingDocument.value?.revision ?? ''),
    unitId,
    unitRevision: String(unit?.attrs?.unitRevision ?? ''),
    nodeId,
    nodeRevision: String(node?.attrs?.nodeRevision ?? ''),
    selection: cloneAuthoringRunValue(selection),
    writingUnit: cloneAuthoringRunValue(unit),
    writingUnitText: writingUnitVisualText(unit),
    document: cloneAuthoringRunValue(writingDocument.value),
    sceneProjection: role === 'manuscript' ? cloneAuthoringRunValue(sceneProjection.value) : null,
    worldbook: cloneAuthoringRunValue(boundWorldbook.value)
  })
}
function captureCurrentIllustratorSource() {
  if (activeWritingPane.value !== 'dual') return captureMainIllustratorSource()
  const source = dualPaneRef.value?.captureVisualSource?.()
  if (!source) return null
  return Object.freeze({
    ...source,
    pane: 'dual',
    worldbook: cloneAuthoringRunValue(boundWorldbook.value)
  })
}
function captureLiveIllustratorSource() {
  const expectedPane = illustratorBrief.value?.pane
  if (!expectedPane) return null
  if (String(activeWritingPane.value || '') !== String(expectedPane || '')) {
    return captureCurrentIllustratorSource()
  }
  return expectedPane === 'dual'
    ? (() => {
        const source = dualPaneRef.value?.captureVisualSource?.()
        return source ? { ...source, pane: 'dual', worldbook: cloneAuthoringRunValue(boundWorldbook.value) } : null
      })()
    : captureMainIllustratorSource()
}
async function refreshBoundWorldbookAfterCharacterChange() {
  if (!currentBook.value?.id) return null
  return syncBookWorldbook(currentBook.value, selectedBookId.value)
}
async function ensureBookWorldbookForAuthoring() {
  if (boundWorldbook.value?.id) return boundWorldbook.value
  const book = currentBook.value
  if (!book?.id) return null
  const created = await worldStore.createWorldbook({
    name: `${String(book.title || (book.manuscriptLanguage === 'en' ? 'Untitled manuscript' : '未命名书稿')).trim()} · ${book.manuscriptLanguage === 'en' ? 'Story Bible' : '资料库'}`,
    description: book.manuscriptLanguage === 'en' ? 'Characters and worldbuilding for this manuscript' : '随书稿建立的人物与设定资料库'
  })
  const binding = await bindSelectedBookWorldbook(created.id)
  if (!binding.ok) throw new Error(tr('资料库已建立，但未能关联到当前书稿'))
  return binding.worldbook || created
}
async function createAuthoringCharacter(payload) {
  try {
    const worldbook = await ensureBookWorldbookForAuthoring()
    if (!worldbook?.id) throw new Error(tr('请先打开一本书稿'))
    const entry = await worldStore.addEntry(worldbook.id, payload)
    await refreshBoundWorldbookAfterCharacterChange()
    inspectorCharacterEntryId.value = String(entry?.id || '')
    authoringTask.notify(tr('已新建角色「{value0}」', { value0: payload.name }))
  } catch (error) {
    authoringTask.notify(error?.message || tr('角色创建失败'))
  }
}
let authoringCharacterSaveQueue = Promise.resolve()
function entryRevisionOf(entry) {
  return String(entry?.metadata?.updatedAt ?? entry?.updatedAt ?? '')
}
function updateAuthoringCharacter(entryId, payload, options = {}) {
  if (!boundWorldbook.value?.id || !entryId) return false
  // L5 冲突防护：设定页改过同一条目时，本地旧快照不得覆盖新值。
  const persistedForConflict = readWorldbookSnapshot(boundWorldbook.value.id)
  const persistedEntry = (persistedForConflict?.entries || []).find((item) => String(item?.id || '') === String(entryId))
  const localEntry = (boundWorldbook.value.entries || []).find((item) => String(item?.id || '') === String(entryId))
  if (persistedEntry && localEntry
    && entryRevisionOf(persistedEntry) !== entryRevisionOf(localEntry)) {
    void refreshBoundWorldbookAfterCharacterChange()
    authoringTask.notify((options.label || '人物') + '在其他页面已被修改，已刷新为最新值；请基于新内容再编辑')
    return false
  }
  const worldbookId = boundWorldbook.value.id
  authoringCharacterSaveQueue = authoringCharacterSaveQueue.catch(() => false).then(async () => {
    try {
      const updated = await worldStore.updateEntry(worldbookId, entryId, payload)
      if (String(boundWorldbook.value?.id || '') === String(worldbookId)) {
        const entries = (boundWorldbook.value.entries || []).map((entry) => String(entry.id) === String(entryId) ? updated : entry)
        boundWorldbook.value = { ...boundWorldbook.value, entries, entriesMap: { ...(boundWorldbook.value.entriesMap || {}), [entryId]: updated }, updatedAt: Date.now() }
      }
      if (!options.silent) authoringTask.notify(tr('已保存{value0}「{value1}」', { value0: options.label || '角色', value1: payload.name }))
      return true
    } catch (error) {
      authoringTask.notify(error?.message || tr('{value0}保存失败', { value0: options.label || '角色' }))
      return false
    }
  })
  return authoringCharacterSaveQueue
}
async function removeAuthoringCharacter(entryId) {
  if (!boundWorldbook.value?.id || !entryId) return false
  try {
    await authoringCharacterSaveQueue.catch(() => false)
    await worldStore.deleteEntry(boundWorldbook.value.id, entryId)
    await refreshBoundWorldbookAfterCharacterChange()
    authoringTask.notify(tr('角色已删除'))
    return true
  } catch (error) {
    authoringTask.notify(error?.message || tr('角色删除失败'))
    return false
  }
}
async function createAuthoringSetting(payload) {
  try {
    const worldbook = await ensureBookWorldbookForAuthoring()
    if (!worldbook?.id) throw new Error(tr('请先打开一本书稿'))
    const entry = await worldStore.addEntry(worldbook.id, payload)
    await refreshBoundWorldbookAfterCharacterChange()
    inspectorWorldbookEntryId.value = String(entry?.id || '')
    authoringTask.notify(tr('已新建设定「{value0}」', { value0: payload.name }))
  } catch (error) {
    authoringTask.notify(error?.message || tr('设定创建失败'))
  }
}
function updateAuthoringSetting(entryId, payload, options = {}) {
  return updateAuthoringCharacter(entryId, payload, { ...options, label: '设定' })
}
async function removeAuthoringSetting(entryId) {
  if (!boundWorldbook.value?.id || !entryId) return false
  try {
    await authoringCharacterSaveQueue.catch(() => false)
    await worldStore.deleteEntry(boundWorldbook.value.id, entryId)
    await refreshBoundWorldbookAfterCharacterChange()
    authoringTask.notify(tr('设定已删除'))
    return true
  } catch (error) {
    authoringTask.notify(error?.message || tr('设定删除失败'))
    return false
  }
}
function mainWritingSurfaceMatches(snapshot = {}) {
  const live = activeMainSurfaceIdentity()
  return Boolean(
    snapshot?.pane === 'main'
    && snapshot.scopeKey === live.scopeKey
    && snapshot.projectId === live.projectId
    && snapshot.sourceKind === live.sourceKind
    && snapshot.sourceId === live.sourceId
    && snapshot.documentRevision === live.documentRevision
    && String(snapshot.documentSchemaRevision ?? '') === live.documentSchemaRevision
  )
}
function restoreMainWritingSurface(snapshot) {
  if (!snapshot || !mainWritingSurfaceMatches(snapshot) || !notebookEditorRef.value) return false
  const restored = snapshot.selectionBookmark
    ? notebookEditorRef.value.restoreSelectionBookmark?.(snapshot.selectionBookmark, { scrollIntoView: false }) === true
    : true
  if (!restored) return false
  restoreWritingScrollState(snapshot.scroll)
  if (!snapshot.selectionBookmark) notebookEditorRef.value.focus?.({ scrollIntoView: false })
  return true
}
function waitForWritingPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}
async function restoreMainWritingSurfaceWhenReady(snapshot, { attempts = 6, previousEditor = null } = {}) {
  const retryCount = Math.max(1, Number(attempts) || 1)
  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    await nextTick()
    if (previousEditor && notebookEditorRef.value === previousEditor) {
      await waitForWritingPaint()
      continue
    }
    const editorInstance = notebookEditorRef.value
    if (restoreMainWritingSurface(snapshot)) {
      // selectedChapterId 会先于 keyed Notebook remount 更新。至少跨两次 paint
      // 复验 ref 与焦点，避免把即将卸载的旧章实例误判为恢复成功。
      await waitForWritingPaint()
      await waitForWritingPaint()
      if (
        notebookEditorRef.value === editorInstance
        && mainWritingSurfaceMatches(snapshot)
        && notebookEditorRef.value?.hasEditorFocus?.() === true
      ) return true
    }
    await waitForWritingPaint()
  }
  return false
}
function dualSurfaceTargetMatches(snapshot = {}) {
  if (snapshot?.pane !== 'dual' || String(snapshot.projectId || '') !== String(selectedBookId.value || '')) return false
  const liveId = ({
    chapter: dualTargetChapterId.value,
    exploration: dualTargetExplorationId.value,
    outline: dualTargetOutlineNodeId.value,
    'worldbook-entry': dualTargetWorldbookEntryId.value
  })[snapshot.sourceKind]
  return String(snapshot.sourceId || '') === String(liveId || '')
}
function restoreWritingSurfaceAfterInspector(snapshot) {
  if (!snapshot) return false
  if (snapshot.pane === 'dual') {
    if (!dualSurfaceTargetMatches(snapshot)) {
      clearInspectorReturnSurface()
      return false
    }
    const previous = snapshot.previous || null
    activeInspectorTool.value = 'dual'
    inspectorOpen.value = true
    inspectorPinned.value = true
    activeWritingPane.value = 'dual'
    inspectorReturnSurface.value = previous
    nextTick(async () => {
      const restored = await dualPaneRef.value?.restoreSurfaceState?.(snapshot)
      if (restored) return
      // 来源或 revision 在工具打开期间变化：保持 fail-closed，不继续回退到
      // 更早的主窗 bookmark，也不留下一个看似恢复成功的空副窗。
      inspectorOpen.value = false
      activeWritingPane.value = 'main'
      dualQuickWordDocument.value = null
      clearInspectorReturnSurface()
    })
    return true
  }
  clearInspectorReturnSurface()
  nextTick(() => restoreMainWritingSurface(snapshot))
  return true
}
function activateMainPane() {
  activeWritingPane.value = 'main'
  nextTick(refreshNotebookCommandAvailability)
}
function activateDualPane(source = {}) {
  dualActiveChapterId.value = source?.kind === 'chapter' ? String(source.id || '') : ''
  activeWritingPane.value = 'dual'
}
function handleDualCommandAvailability(availability = {}) {
  dualNotebookCommandAvailability.value = {
    ...emptyNotebookCommandAvailability,
    ...availability
  }
}
function handleDualSourceChange(source = {}) {
  const nextId = String(source?.id || '')
  if (source?.kind === 'exploration') {
    dualTargetExplorationId.value = nextId
    dualTargetChapterId.value = ''
    dualTargetOutlineNodeId.value = ''
    dualTargetWorldbookEntryId.value = ''
    dualActiveChapterId.value = ''
  } else if (source?.kind === 'outline') {
    dualTargetOutlineNodeId.value = nextId
    dualTargetChapterId.value = ''
    dualTargetExplorationId.value = ''
    dualTargetWorldbookEntryId.value = ''
    dualActiveChapterId.value = ''
  } else if (source?.kind === 'worldbook-entry') {
    dualTargetWorldbookEntryId.value = nextId
    dualTargetChapterId.value = ''
    dualTargetExplorationId.value = ''
    dualTargetOutlineNodeId.value = ''
    dualActiveChapterId.value = ''
  } else {
    dualTargetChapterId.value = nextId
    dualTargetExplorationId.value = ''
    dualTargetOutlineNodeId.value = ''
    dualTargetWorldbookEntryId.value = ''
    dualActiveChapterId.value = nextId
  }
}
function swapDualChapter({ chapterId = '' } = {}) {
  const nextMainId = String(chapterId || '')
  const previousMainId = String(selectedChapterId.value || '')
  if (!nextMainId || !previousMainId || nextMainId === previousMainId) return false
  if (!selectChapter(nextMainId)) return false
  dualTargetChapterId.value = previousMainId
  dualTargetExplorationId.value = ''
  dualTargetOutlineNodeId.value = ''
  dualTargetWorldbookEntryId.value = ''
  dualActiveChapterId.value = previousMainId
  activeWritingPane.value = 'main'
  return true
}
watch(selectedBookId, (nextBookId, previousBookId) => {
  if (!previousBookId || String(nextBookId) === String(previousBookId)) return
  clearInspectorReturnSurface()
  if (activeInspectorTool.value === 'dual') inspectorOpen.value = false
  dualTargetChapterId.value = ''
  dualTargetExplorationId.value = ''
  dualTargetOutlineNodeId.value = ''
  dualTargetWorldbookEntryId.value = ''
  dualActiveChapterId.value = ''
})
const editorHistory = useEditorHistory()
const emptyNotebookCommandAvailability = Object.freeze({
  undo: false,
  redo: false,
  cut: false,
  copy: false,
  paste: false,
  deleteSelection: false,
  selectAll: false,
  splitUnit: false,
  mergePreviousUnit: false,
  moveUnitUp: false,
  moveUnitDown: false,
  bold: false,
  italic: false
})
const notebookCommandAvailability = ref({ ...emptyNotebookCommandAvailability })
const dualNotebookCommandAvailability = ref({ ...emptyNotebookCommandAvailability, editable: false })
const activeNotebookCommandAvailability = computed(() => (
  activeWritingPane.value === 'dual'
    ? dualNotebookCommandAvailability.value
    : { ...notebookCommandAvailability.value, editable: notebookEditorActive.value }
))
function dualSharesMainDocument() {
  const source = dualPaneRef.value?.getActiveSource?.()
  if (!source?.editable) return false
  if (source.kind === 'chapter') return String(source.id || '') === String(selectedChapterId.value || '') && !wt3ActiveDocId.value
  if (source.kind === 'exploration') return String(source.id || '') === String(wt3ActiveDocId.value || '')
  return false
}
const contextMenuRef = ref(null)
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  maxHeight: 480,
  selectionBookmark: null,
  selectedText: '',
  documentRevision: '',
  availability: { ...emptyNotebookCommandAvailability }
})
const dragIndex = ref(-1)
const dropTargetIndex = ref(-1)
const chapterShelfQuery = ref('')
const visibleChapterEntries = computed(() => {
  const query = chapterShelfQuery.value.trim().toLocaleLowerCase()
  return chapters.value
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter, index }) => !query || `${index + 1} ${chapter.title || ''}`.toLocaleLowerCase().includes(query))
})
function reorderChapter(fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= chapters.value.length || toIdx >= chapters.value.length) return
  const previous = chapters.value
  const list = [...previous]
  const [moved] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, moved)
  chapters.value = list
  if (!saveChapters()) {
    chapters.value = previous
    authoringTask.notify(tr('章节排序保存失败，已恢复原顺序'))
  }
}
function onChapterDragStart(e, idx, bookId = null) {
  // 只有当前书的章节参与拖拽排序；展开的其他书章节为静态列表。
  if (bookId && bookId !== selectedBookId.value) return
  dragIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}
function onChapterDragOver(e, idx, bookId = null) {
  if (bookId && bookId !== selectedBookId.value) return
  dropTargetIndex.value = idx
}
function onChapterDragLeave(_idx) {
  dropTargetIndex.value = -1
}
function onChapterDrop(e, idx, bookId = null) {
  dropTargetIndex.value = -1
  if (bookId && bookId !== selectedBookId.value) return
  if (dragIndex.value < 0 || dragIndex.value === idx) return
  reorderChapter(dragIndex.value, idx)
}
function onChapterDragEnd() {
  dragIndex.value = -1
  dropTargetIndex.value = -1
}
const writingTypography = useWritingTypographyStore()
writingTypography.init()
const editorFont = computed(() => writingTypography.fontFamily)
const editorFontSize = computed(() => `${writingTypography.fontSize}px`)
const writingFontOptions = WRITING_FONT_OPTIONS
const searchWorkflow = createAuthoringSearchWorkflow()
const {
  open: searchPanelOpen,
  query: searchQuery,
  scope: searchScope,
  findings: searchFindings,
  total: searchTotal,
  truncated: searchTruncated,
  busy: searchBusy,
  error: searchError,
  notice: searchNotice,
  replacement: searchReplacement,
  replacePreview: searchReplacePreview,
  replaceBusy: searchReplaceBusy,
  activeFindingId: activeSearchFindingId,
  currentChapterLabel: searchCurrentChapterLabel,
  canReturn: searchCanReturn,
  freezeSource: freezeSearchSource,
  buildIndex: buildCurrentAuthoringSearchIndex,
  show: openSearchPanel,
  close: closeSearchPanel,
  run: runProjectSearch,
  updateQuery: updateSearchQuery,
  updateScope: updateSearchScope,
  updateReplacement: updateSearchReplacement,
  openFinding: openSearchFinding,
  returnToOrigin: returnFromSearch,
  replaceOne: replaceOneSearchFinding,
  replaceAll: replaceAllSearchFindings,
  previewReplaceAll: previewSearchReplaceAll,
  confirmReplaceAll: confirmSearchReplaceAll,
  cancelReplacePreview: cancelSearchReplacePreview
} = searchWorkflow
const showNameGen = ref(false)
const showQuickWords = ref(false)
const quickWordEnabledIds = ref([])
const dualQuickWordDocument = shallowRef(null)
// 仅保存于当前页面会话；切回同一本书时保留最近顺序，不污染世界书或 localStorage。
const quickWordRecentIdsByBook = reactive(new Map())
const activeQuickWordSelection = computed(() => (
  activeWritingPane.value === 'dual' ? dualNotebookSelection.value : notebookSelection.value
))
const activeQuickWordDocument = computed(() => (
  activeWritingPane.value === 'dual' ? dualQuickWordDocument.value : writingDocument.value
))
const quickWordCatalog = computed(() => buildAuthoringQuickWordCatalog({
  worldbook: boundWorldbook.value,
  document: activeQuickWordDocument.value
}))
const activeQuickWordRecentIds = computed(() => (
  quickWordRecentIdsByBook.get(String(selectedBookId.value || '')) || []
))
const quickWordPrefix = computed(() => {
  if (writingCompositionActive.value || dualCompositionActive.value || !activeNotebookCommandAvailability.value.editable) return ''
  return resolveAuthoringQuickWordPrefix(activeQuickWordSelection.value, quickWordCatalog.value, quickWordEnabledIds.value)
})
const quickWordSuggestions = computed(() => resolveAuthoringQuickWordSuggestions({
  catalog: quickWordCatalog.value,
  enabledIds: quickWordEnabledIds.value,
  recentIds: activeQuickWordRecentIds.value,
  prefix: quickWordPrefix.value
}))
const nameStyle = ref('chinese')
const nameCategory = ref('person')
const nameLength = ref('three')
const nameGender = ref('neutral')
const fixedSurname = ref('')
const generatedNames = ref([])
const activeNameEntityMenu = ref('')
const pendingNameEntityCommand = shallowRef(null)
const nameEntityConflicts = ref([])
const nameEntityNotice = ref('')
const nameEntityNoticeKind = ref('')
const nameEntityBusy = ref(false)
const lastNameEntityReceipt = shallowRef(null)
const nameCategoryOptions = [{ value: 'person', label: '人物' }, { value: 'place', label: '地点' }, { value: 'organization', label: '组织' }, { value: 'ability', label: '功法/能力' }, { value: 'item', label: '道具' }]
const activeNameCategoryLabel = computed(() => nameCategoryOptions.find((item) => item.value === nameCategory.value)?.label || '人物')
const nameLanguageOptions = [{ value: 'chinese', label: '中文' }, { value: 'western', label: '西式' }, { value: 'japanese', label: '日式' }]
const nameLengthOptions = [{ value: 'two', label: '二字' }, { value: 'three', label: '三字' }, { value: 'multi', label: '多字' }]
const nameGenderOptions = [{ value: 'male', label: '男名' }, { value: 'female', label: '女名' }, { value: 'neutral', label: '中性' }]
const showFontPanel = ref(false)
// 应用级 zoom（设置页 UI 缩放）会让 CSS px ≠ 视觉 px：getBoundingClientRect
// 是视觉像素，而 fixed 定位的 top/left 按 zoom 后的 CSS 像素解析。
// 所有弹层定位统一先算视觉坐标、再除以缩放，否则会展开错位。
function writingUiScale() {
  const body = document.body
  const cssZoom = Number.parseFloat(window.getComputedStyle(body).zoom) || 1
  const transformedScale = body?.offsetWidth > 0
    ? body.getBoundingClientRect().width / body.offsetWidth
    : 1
  return Math.max(0.1, cssZoom !== 1 ? cssZoom : (transformedScale || 1))
}
const fontPanelStyle = ref({})
function toggleFontPanel(event) {
  showQuickWords.value = false
  showNameGen.value = false
  showFontPanel.value = !showFontPanel.value
  if (!showFontPanel.value) return
  const anchor = event?.currentTarget?.getBoundingClientRect?.()
  if (!anchor) return
  nextTick(() => {
    const scale = writingUiScale()
    const width = 330
    const leftVisual = Math.max(8, Math.min(anchor.left, window.innerWidth - width * scale - 8))
    fontPanelStyle.value = { position: 'fixed', top: `${Math.round((anchor.bottom + 4) / scale)}px`, left: `${Math.round(leftVisual / scale)}px`, width: `${width}px` }
  })
}
const moreMenuOpen = ref(false)
const moreMenuStyle = ref({})
function toggleMoreMenu(event) {
  moreMenuOpen.value = !moreMenuOpen.value
  if (!moreMenuOpen.value) return
  const anchor = event?.currentTarget?.getBoundingClientRect?.()
  if (!anchor) return
  const scale = writingUiScale()
  // 右缘对齐触发按钮；菜单宽度 164 CSS px。
  const rightVisual = Math.max(8, Math.min(window.innerWidth - anchor.right, window.innerWidth - 164 * scale - 8))
  moreMenuStyle.value = {
    position: 'fixed',
    top: `${Math.round((anchor.bottom + 6) / scale)}px`,
    right: `${Math.round(rightVisual / scale)}px`
  }
}
function closeMoreMenu({ restorePrepared = true } = {}) {
  const prepared = releaseIllustratorMobileSource()
  moreMenuOpen.value = false
  if (restorePrepared && prepared?.surface) {
    nextTick(async () => {
      if (prepared.surface.pane === 'dual' && dualSurfaceTargetMatches(prepared.surface)) {
        activeWritingPane.value = 'dual'
        if (await dualPaneRef.value?.restoreSurfaceState?.(prepared.surface)) return
      }
      if (prepared.surface.pane === 'main') restoreMainWritingSurface(prepared.surface)
    })
  }
}
function moreAction(action) {
  closeMoreMenu({ restorePrepared: false })
  action?.()
}
function toggleInlineSuggestion() {
  setWritingAgentEnabled(!inlineSuggestionEnabled.value)
}
// ── 左栏右键菜单：章节行 / 卷组。打包桌面端后没有浏览器原生右键，
// 一律 prevent 默认并使用自研菜单；动作只接真实存在的能力。──
const shelfContextMenu = ref({ show: false, x: 0, y: 0, kind: '', chapterId: '', index: -1, title: '' })
function openShelfContextMenu(event, kind, entry = null) {
  closeShelfContextMenu()
  shelfContextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    kind,
    chapterId: String(entry?.chapter?.id || ''),
    index: Number(entry?.index ?? -1),
    title: String(entry?.chapter?.title || '')
  }
  nextTick(clampShelfContextMenu)
}
function clampShelfContextMenu() {
  const el = document.querySelector('.shelf-context-menu')
  if (!el) return
  const scale = writingUiScale()
  const rect = el.getBoundingClientRect()
  const x = Math.max(8, Math.min(shelfContextMenu.value.x, window.innerWidth - rect.width / scale - 8))
  const y = Math.max(8, Math.min(shelfContextMenu.value.y, window.innerHeight - rect.height / scale - 8))
  shelfContextMenu.value.x = Math.round(x / scale)
  shelfContextMenu.value.y = Math.round(y / scale)
}
function closeShelfContextMenu() {
  shelfContextMenu.value.show = false
}
function shelfMenuAction(action) {
  const { chapterId } = shelfContextMenu.value
  closeShelfContextMenu()
  action(chapterId)
}
function openChapterInDual(chapterId) {
  const target = chapters.value.find((chapter) => String(chapter?.id) === String(chapterId || ''))
  if (!target) return false
  if (!openInspectorTool('dual', { pinned: true })) return false
  dualTargetChapterId.value = String(target.id)
  dualTargetExplorationId.value = ''
  dualTargetOutlineNodeId.value = ''
  dualTargetWorldbookEntryId.value = ''
  dualActiveChapterId.value = String(target.id)
  return true
}
function openExplorationInDual(documentId) {
  const target = wt3ExplorationDocs.value.find((doc) => String(doc?.id) === String(documentId || ''))
  if (!target) return false
  if (!openInspectorTool('dual', { pinned: true })) return false
  dualTargetExplorationId.value = String(target.id)
  dualTargetChapterId.value = ''
  dualTargetOutlineNodeId.value = ''
  dualTargetWorldbookEntryId.value = ''
  dualActiveChapterId.value = ''
  return true
}
function openOutlineInDual(nodeId) {
  const target = wt3OutlineNodes.value.find((node) => String(node?.id) === String(nodeId || ''))
  if (!target) return false
  if (!openInspectorTool('dual', { pinned: true })) return false
  dualTargetOutlineNodeId.value = String(target.id)
  dualTargetChapterId.value = ''
  dualTargetExplorationId.value = ''
  dualTargetWorldbookEntryId.value = ''
  dualActiveChapterId.value = ''
  return true
}
function openOutlineFromDual(nodeId) {
  inspectorOutlineNodeId.value = ''
  selectInspectorTool('outline')
  nextTick(() => { inspectorOutlineNodeId.value = String(nodeId || '') })
}
function openWorldbookFromDual(entryId) {
  // L4：项目上下文出程——同一书绑定的同一条目；无书时保留全局世界书访问。
  if (openProjectSettingsSurface('entries', { entryId: String(entryId || '') })) return
  router.push({ name: 'settings-worldbook-advanced', query: { entryId: String(entryId || '') } })
}
async function renameChapterFromShelf(chapterId) {
  if (selectedChapterId.value !== chapterId) selectChapter(chapterId)
  await nextTick()
  const input = document.querySelector('.wall__dossier-title')
  input?.focus()
  input?.select?.()
}
function deleteChapterFromShelf(chapterId) {
  const chapter = chapters.value.find((item) => String(item.id) === String(chapterId))
  const label = chapter?.title ? `「${chapter.title}」` : tr('这一章')
  if (typeof window !== 'undefined' && !window.confirm(tr('确定删除{value0}？其快照与历史会一并删除。', { value0: label }))) return
  deleteChapter(chapterId)
}
const hasSelection = ref(false)
const selectionToolbarStyle = ref({ top: '100px', left: '100px' })
const selectionActionsVisible = ref(false)
const pendingBackJump = ref(null)
const pendingInsertBack = ref(null)
const canCaptureSelection = computed(() => Boolean(
  selectedChapterId.value
  && selectedText.value
  && String(selectedText.value).trim()
))
const quickNoteStatus = ref('')
const assetInboxOpen = ref(false)
const assetInboxActiveId = ref('')
const inboxAssets = ref([])
const assetInboxScope = ref('all')
const assetInboxKind = ref('')
const selectedInboxAssetIds = ref([])
const assetKindOptions = ASSET_KINDS
const assetActionHelpEntries = [
  { key: 'insert', label: '插入正文', description: '把素材内容追加到当前章节末尾。' },
  { key: 'reference', label: '续写参考', description: '将素材设为续写上下文，辅助内联建议。' },
  { key: 'outline', label: '加入纲要', description: '把素材转为章节纲要条目，参与分镜和续写。' },
  { key: 'material', label: '转成素材', description: '把收件箱素材同步到素材库便于后续复用。' },
  { key: 'worldbook', label: '入世界书', description: '将世界书草稿写入当前世界书条目。' },
  { key: 'archive', label: '归档', description: '将素材移出收件箱并保留记录。' },
  { key: 'reject', label: '拒绝', description: '将素材标记为拒绝，不再参与当前流程。' }
]
const assetActionHelpMap = Object.fromEntries(assetActionHelpEntries.map((item) => [item.key, item.description]))
// 显式续写参考:身份冻结/作用域绑定/请求前可用性收口在 referenceSource(A6)。
const referenceSource = useAuthoringReferenceSource()
// 所有进入模型上下文(context/manifest/知识 references)的路径必须经此读取:
// 作用域不匹配即 fail-closed 返回 null。UI 展示可读 referenceSource.reference。
function readCurrentCopilotReference() {
  return referenceSource.readForScope(activeDocumentSaveScopeKey())
}
function writeCurrentWritingRecoveryDraft() {
  // Persistence owns the recovery timer/write path; history only reads and adopts it.
  if (wt3ActiveDoc.value) {
    if (!writingDocument.value) return null
    const key = authoringDocumentKey({ role: 'exploration', bookId: selectedBookId.value, documentId: wt3ActiveDoc.value.id })
    return authoringHistory.writeRecovery({
      chapterId: key, chapterTitle: wt3ActiveDoc.value.title, label: '未保存草稿', reason: 'crash-recovery',
      document: writingDocument.value, markdown: markdownContent.value, annotations: wt3Annotations.value
    })
  }
  if (!selectedChapterId.value || !writingDocument.value) return null
  return authoringHistory.writeRecovery({
    chapterId: selectedChapterId.value, chapterTitle: currentChapterTitle.value, label: '未保存草稿', reason: 'crash-recovery',
    document: writingDocument.value, markdown: markdownContent.value, annotations: chapterAnnotations.value
  })
}
// —— 书与世界书绑定（Task 2）——
// currentBook / selectedBookWorldbookId 必须先于 sceneProjection 声明：
// watch(sceneProjection) 在 setup 期间就会求值，晚声明会触发 TDZ ReferenceError。
const currentBook = computed(() => books.value.find((item) => item.id === selectedBookId.value) || null)
const selectedBookWorldbookId = computed(() => normalizeBookWorldbookBinding(currentBook.value))
const chapterOutlineItems = ref([])
// Plan Task 1.3：共享现场投影 —— 左栏现场条与右侧详情（Task 1.4）读取同一份只读投影。
// 只挑选必要字段，避免 getRuntimeSnapshot 的全量克隆进入每次重算。
const sceneActiveActorId = ref('')
const sceneDialogueTargetId = ref('')
function resolveScenePerson(id) {
  if (!id) return null
  const fromCast = (gameStore.sceneThread?.cast || []).find((member) => member?.characterId === id)
  if (fromCast) return { id, name: fromCast.name || '' }
  const fromEncountered = (gameStore.encounteredCharacters || []).find((item) => item?.id === id)
  if (fromEncountered) return { id, name: fromEncountered.name || '' }
  return { id, name: '' }
}
const sceneProjection = computed(() => buildAuthoringSceneProjection({
  chapter: selectedChapterId.value ? { id: selectedChapterId.value } : null,
  documentRevision: writingDocument.value?.revision ?? null,
  projectId: selectedBookId.value || null,
  runtimeState: {
    encounteredCharacters: gameStore.encounteredCharacters,
    plotJournal: gameStore.plotJournal,
    worldMapState: gameStore.worldMapState,
    writingTime: gameStore.writingTime,
    // 复验修复 2：正常投影不携带 Experience sceneThread（会话只参与显式导入）。
    worldMapStateNote: undefined,
    emergenceCandidates: gameStore.emergenceCandidates,
    dialogueMode: gameStore.dialogueMode,
    dialogueCharacter: gameStore.dialogueCharacter,
    activeActor: resolveScenePerson(sceneActiveActorId.value),
    dialogueTarget: resolveScenePerson(sceneDialogueTargetId.value)
  },
  // v2 输入（Task 5）：提供锚点数据时现场以锚点 + 绑定世界书 + 真实观察器为唯一依据。
  document: writingDocument.value,
  // 失焦/未落笔时 activeWritingUnitId 为空——当前场是章节事实，不能因为
  // 焦点离开正文就整体退化为待设置。回退到最新写作位置（文档末单元）。
  activeUnitId: activeWritingUnitId.value || documentUnitOrder().at(-1) || null,
  // 单元顺序是“沿用前文锚点”继承解析的输入；缺了它投影只能在当前单元
  // 找锚点，落笔处之后/之前的场景会整体退化为待设置。
  unitOrder: documentUnitOrder(),
  expectedWorldbookId: selectedBookWorldbookId.value,
  worldbook: boundWorldbook.value || null,
  sceneAnchors: sceneAnchors.value,
  acceptedObservations: authoringObservations.value,
  outlineItems: chapterOutlineItems.value
}))
// UX-03：检查器“现场”页的只读概览文案（左栏索引才是定位入口）。
const sceneOverviewPresentNames = computed(() => (
  (sceneProjection.value.presentCharacters || []).map((person) => person.name).filter(Boolean).join('、')
))
const livingStoryProjection = computed(() => buildAuthoringLivingStoryProjection({
  projectId: selectedBookId.value,
  chapterId: selectedChapterId.value,
  document: writingDocument.value,
  positionIndex: buildInterventionPositionIndex(),
  sceneAnchors: sceneAnchors.value,
  worldbook: boundWorldbook.value,
  outlineNodes: wt3OutlineNodes.value,
  outlineEdges: wt3OutlineEdges.value
}))
const knowledgeAssistantRevisionSignal = computed(() => [
  selectedBookId.value,
  selectedChapterId.value,
  wt3ActiveDocId.value,
  currentBook.value?.updatedAt || '',
  writingDocument.value?.revision ?? '',
  wt3ExplorationDocs.value.map((doc) => `${doc.id}:${doc.revision}:${doc.updatedAt || ''}`).join(','),
  boundWorldbook.value?.updatedAt || '',
  fingerprintOutline(wt3OutlineNodes.value, wt3OutlineEdges.value),
  sceneProjection.value?.projectionFingerprint || ''
].join('|'))
const knowledgeAssistantTarget = computed(() => {
  const projectId = String(selectedBookId.value || '')
  const invocation = knowledgeAssistantInvocation.value
  if (invocation && String(invocation.projectId || '') === projectId) return invocation.target || null
  if (wt3ActiveDoc.value) return null
  const chapterId = String(selectedChapterId.value || '')
  if (!projectId || !chapterId) return null
  const unitId = String(activeWritingUnitId.value || '')
  const selection = notebookSelection.value || {}
  const nodeId = unitId && String(selection.unitId || '') === unitId
    ? String(selection.nodeId || '')
    : ''
  return {
    projectId,
    documentId: chapterId,
    chapterId,
    ...(unitId ? { unitId } : {}),
    ...(nodeId ? { nodeId } : {})
  }
})
function resolveKnowledgeAssistantLiveSource({ phase = 'prepare' } = {}) {
  const invocation = knowledgeAssistantInvocation.value
  if (!invocation || String(invocation.projectId || '') !== String(selectedBookId.value || '')) return null
  // 主栏仍停留在同一来源时，prepare 和 stale 对账都读取此刻内存稿；作者
  // 可以把助手固定在右侧后继续落笔。副栏在切到助手时会卸载并经自身
  // persist 边界落盘，所以 prepare 使用冻结稿，后续对账只读 repository。
  if (invocation.pane === 'main') {
    const current = captureMainKnowledgeAssistantInvocation()
    if (current
      && current.role === invocation.role
      && current.documentId === invocation.documentId
      && current.chapterId === invocation.chapterId) return cloneAuthoringRunValue(current.liveSource)
  }
  return phase === 'prepare' ? cloneAuthoringRunValue(invocation.liveSource) : null
}
const knowledgeAssistantSceneProjection = computed(() => (
  knowledgeAssistantInvocation.value?.sceneProjection || sceneProjection.value
))
const knowledgeAssistant = useAuthoringKnowledgeAssistant({
  projectId: selectedBookId,
  target: knowledgeAssistantTarget,
  resolveLiveSource: resolveKnowledgeAssistantLiveSource,
  sceneProjection: knowledgeAssistantSceneProjection,
  revisionSignal: knowledgeAssistantRevisionSignal
})
function resolveDualSceneProjection({ kind = '', sourceId = '', document = null, activeUnitId = null, documentRevision = null } = {}) {
  if (!document || !Array.isArray(document.content)) return null
  const chapter = kind === 'chapter'
    ? chapters.value.find((item) => String(item?.id || '') === String(sourceId || '')) || null
    : null
  if (kind === 'chapter' && !chapter) return null
  if (kind !== 'chapter' && kind !== 'exploration') return null
  const chapterId = String(chapter?.id || '')
  const acceptedObservations = chapterId
    ? (gameStore.getAuthoringDerivedState?.() || [])
      .filter((observation) => (
        String(observation?.projectId || '') === String(selectedBookId.value || '')
        && String(observation?.chapterId || '') === chapterId
      ))
      .map((observation) => ({
        id: String(observation?.id || ''),
        kind: String(observation?.kind || ''),
        text: String(observation?.text || observation?.summary || ''),
        subjectId: String(observation?.subjectId || resolveObserverCharacterId(observation?.subject) || ''),
        objectId: String(observation?.objectId || resolveObserverCharacterId(observation?.object) || ''),
        relation: String(observation?.relation || ''),
        unitId: String(observation?.unitId || ''),
        unitRevision: Number(observation?.unitRevision || 0),
        documentRevision: String(observation?.documentRevision || ''),
        sourceRefs: Array.isArray(observation?.sourceRefs) ? observation.sourceRefs : [],
        status: String(observation?.status || 'applied')
      }))
    : []
  return buildAuthoringSceneProjection({
    chapter: chapter ? { id: chapterId } : null,
    documentRevision,
    projectId: selectedBookId.value || null,
    runtimeState: {
      encounteredCharacters: gameStore.encounteredCharacters,
      plotJournal: gameStore.plotJournal,
      worldMapState: gameStore.worldMapState,
      writingTime: gameStore.writingTime,
      worldMapStateNote: undefined,
      emergenceCandidates: gameStore.emergenceCandidates,
      dialogueMode: false,
      dialogueCharacter: null,
      activeActor: null,
      dialogueTarget: null
    },
    document,
    activeUnitId,
    expectedWorldbookId: selectedBookWorldbookId.value,
    worldbook: boundWorldbook.value || null,
    sceneAnchors: chapter ? normalizeSceneAnchors(chapter.sceneAnchors) : [],
    acceptedObservations,
    outlineItems: chapter ? normalizeChapterOutlineItems(chapter.outlineItems) : []
  })
}
watch([selectedChapterId, selectedBookId], () => {
  sceneActiveActorId.value = ''
  sceneDialogueTargetId.value = ''
})
// 选择对象失效时安静清空，不保留幽灵选择。
watch(sceneProjection, (projection) => {
  const knownIds = new Set([
    projection.viewpointCharacter?.id,
    projection.activeActor?.id,
    projection.dialogueTarget?.id,
    ...(projection.presentCharacters || []).map((person) => person.id),
    ...(gameStore.encounteredCharacters || []).map((item) => item?.id)
  ].filter(Boolean))
  if (sceneActiveActorId.value && !knownIds.has(sceneActiveActorId.value)) sceneActiveActorId.value = ''
  if (sceneDialogueTargetId.value && !knownIds.has(sceneDialogueTargetId.value)) sceneDialogueTargetId.value = ''
})
function handleSceneAdvanceWith(eventId) {
  // F1-3：左栏“推演本场”和未决事件推进都先进入同一个场景实验室。
  // 它只冻结上下文并规划方向；F1-4 前不会生成或写入正文。
  const event = (sceneProjection.value.unresolvedEvents || []).find((item) => item.id === eventId)
  if (authoringTaskBusy.value) return
  const instruction = event
    ? tr('以此事件推进：{value0}', { value0: event.label })
    : tr('结合当前场的人物、地点、时间与正文进度，推演本场自然发生的下一步。')
  void openSceneLaboratory({ target: notebookSelection.value, instruction })
}
// —— 右侧临时详情（Task 1.4）：数据从同一 projection + worldbook 运行时读取。 ——
const sceneDetailModel = computed(() => resolveSceneDetailModel(inspectorDetailState.value))
const reviewWorkflow = useAuthoringReviewWorkflow({
  rewrite: {
    candidates: rewriteCandidates, lockedSegments: rewriteLockedSegments, loading: rewriteLoading, error: rewriteError, cancel: cancelRewriteGeneration,
    apply: applyRewriteCandidate, savePending: reviewRewriteSavePending,
    retrySave: () => {
      const saved = dualPaneRef.value?.prepareClose?.() !== false
      if (saved) reviewRewriteSavePending.value = false
      return saved
    },
    begin: async (finding, options) => {
      resetRewriteState(); reviewRewriteSavePending.value = false
      if (!await jumpToReviewFinding(finding)) return false
      await nextTick(); rewriteInstruction.value = finding.reason || finding.body || ''
      const target = reviewWorkflow.invocation.value?.pane === 'dual'
        ? buildDualReviewRewriteTarget(reviewWorkflow.invocation.value, finding)
        : { ...getCurrentRewriteTarget(), pane: 'main' }
      return generateRewriteCandidates(target, options)
    }
  },
  currentTitle: () => currentChapterTitle.value || '',
  captureSource: () => captureActiveReviewSource(),
  captureLiveSource: (invocation) => invocation.pane === 'dual'
    ? dualPaneRef.value?.captureReviewSource?.()
    : captureMainDocumentSource(),
  sceneProjection: () => sceneProjection.value || null,
  worldbookEntries: () => boundWorldbook.value?.entries || [],
  historyLocked: () => historyInteractionLocked.value,
  captureSurface: () => captureCurrentWritingSurface(),
  closeOtherPanel: () => closeSearchPanel({ restore: false }),
  hideTransientTools: () => {
    showQuickWords.value = false
    showNameGen.value = false
  },
  notify: (message) => authoringTask.notify(message),
  restoreSurface: (surface) => {
    if (surface.pane === 'dual') dualPaneRef.value?.restoreSurfaceState?.(surface)
    else restoreMainWritingSurface(surface)
  },
  navigateToFinding: async (invocation, target) => {
    if (invocation.pane === 'dual') {
      return Boolean(await dualPaneRef.value?.navigateSearchLocator?.({
        ...target, sourceKind: invocation.sourceKind, sourceId: invocation.documentId
      }))
    }
    if (invocation.documentRole === 'manuscript' && String(selectedChapterId.value) !== String(invocation.documentId)) {
      if (!selectChapter(invocation.documentId)) return false
      await nextTick()
    } else if (invocation.documentRole === 'exploration' && String(wt3ActiveDoc.value?.id || '') !== String(invocation.documentId)) {
      if (!openExplorationDoc(invocation.documentId)) return false
      await nextTick()
    }
    const selected = notebookEditorRef.value?.selectNodeRange?.(
      target.nodeId, target.startOffset, target.endNodeId || target.nodeId, target.endOffset
    )
    if (selected) notebookEditorRef.value?.focus?.()
    return Boolean(selected)
  },
  protectBatch: (invocation, live, transaction) => {
    if (invocation.documentRole !== 'manuscript' || transaction.patches.length <= 1) return true
    const protection = authoringHistory.recordProtection({
      chapterId: invocation.chapterId,
      chapterTitle: invocation.title,
      reason: 'before-rewrite',
      document: live.document,
      markdown: live.markdown,
      annotations: invocation.pane === 'main' ? chapterAnnotations.value : [],
      operation: 'proofing-batch',
      transactionId: transaction.receipt.id
    })
    if (protection.ok && String(invocation.chapterId) === String(selectedChapterId.value)) {
      writingSnapshots.value = authoringHistory.refreshSnapshots(invocation.chapterId)
    }
    return protection.ok
  },
  applyPatches: (invocation, patches) => {
    const changed = invocation.pane === 'dual'
      ? dualPaneRef.value?.replaceReviewRanges?.(patches)
      : notebookEditorRef.value?.replaceNodeRanges?.(patches, { origin: 'writing-agent' })
    return Boolean(changed)
  },
  undoPatches: (receipt) => receipt.pane === 'dual'
    ? dualPaneRef.value?.runCommand?.('undo')
    : notebookEditorRef.value?.undo?.(),
  reconcileSources: [writingDocument, dualQuickWordDocument, selectedChapterId, wt3ActiveDocId, boundWorldbook, sceneProjection]
})
const {
  loading: reviewLoading,
  error: reviewError,
  status: reviewStatus,
  completedBatches: reviewCompletedBatches,
  totalBatches: reviewTotalBatches,
  panelOpen: reviewPanelOpen,
  documentTitle: reviewDocumentTitle,
  findings: reviewFindings,
  undoAvailable: reviewUndoAvailable,
  freeze: freezeReviewWorkflow,
  open: openReviewPanel,
  close: closeReviewPanel,
  run: runChapterReview,
  cancel: cancelChapterReview,
  jump: jumpToReviewFinding,
  applyOne: applyReviewFinding,
  applySelected: applySelectedReviewFindings,
  ignore: ignoreReviewFinding,
  undo: undoReviewApplication
} = reviewWorkflow
const sceneLocationBridge = computed(() => buildAuthoringSceneLocationProjection({
  projectId: selectedBookId.value,
  chapterId: selectedChapterId.value,
  writingUnitId: activeWritingUnitId.value,
  worldbook: boundWorldbook.value,
  location: sceneProjection.value?.location
}))
function scenePersonRoles(personId) {
  const projection = sceneProjection.value
  const roles = []
  if (!personId) return roles
  if (projection.viewpointCharacter?.id === personId) roles.push('视角')
  if (projection.activeActor?.id === personId) roles.push('行动者')
  if (projection.dialogueTarget?.id === personId) roles.push('对象')
  if ((projection.presentCharacters || []).some((item) => item.id === personId)) roles.push('在场')
  return roles
}
function resolveSceneDetailModel(detail) {
  if (!detail?.kind || !detail.id) return null
  const projection = sceneProjection.value
  if (detail.kind === 'character') {
    const person = [
      projection.viewpointCharacter,
      projection.activeActor,
      projection.dialogueTarget,
      ...(projection.presentCharacters || [])
    ].find((item) => item?.id === detail.id)
    if (!person) return null
    // 复验修复 3：v2 投影的人物摘要来自绑定世界书（goal/mood/voiceBasis），
    // 只有当投影没有世界书证据时才回退到旧 encountered 记录。
    const fromWorldbook = (person.sourceRefs || []).some((ref) => String(ref).startsWith('worldbook-entry:'))
    const profile = (gameStore.encounteredCharacters || []).find((item) => item?.id === detail.id)
    // 复验修复 3：v2 关系是 subjectId/objectId；v1 兼容对象保留姓名匹配。
    const relations = (projection.activeRelations || [])
      .filter((rel) => (
        rel.subjectId === detail.id || rel.objectId === detail.id
        || rel.subject === person.name || rel.object === person.name
      ))
      .slice(0, 3)
      .map((rel) => rel.label)
    return {
      kind: 'character',
      id: detail.id,
      name: person.name,
      sections: [
        { label: '当前目标', value: (fromWorldbook ? person.goal : '') || (profile?.goal ? String(profile.goal).slice(0, 120) : '') },
        { label: '当前心境', value: (fromWorldbook && person.mood) ? tr('心境 {value0}', { value0: person.mood }) : (profile?.mood != null ? tr('心境 {value0}', { value0: profile.mood }) : '') },
        { label: '本场身份', value: scenePersonRoles(detail.id).join(' · ') },
        { label: '本场关系', value: relations.join('；') },
        { label: '最近行动', value: person.lastAction || '' },
        { label: '口吻依据', value: (fromWorldbook ? person.voiceBasis : '') || (profile?.description ? String(profile.description).slice(0, 80) : '') }
      ]
    }
  }
  if (detail.kind === 'location') {
    if (!projection.location || projection.location.id !== detail.id) return null
    const bridge = sceneLocationBridge.value
    return {
      kind: 'location',
      id: detail.id,
      name: projection.location.name,
      sections: [
        { label: '当前地点', value: projection.location.name },
        { label: '上级区域', value: projection.location.region },
        { label: '世界书来源', value: bridge.availability === 'ready' ? `${bridge.worldbookName || tr('当前世界书')} · ${bridge.name}` : tr('设定已删除或解绑') },
        { label: '本场环境事实', value: '' },
        { label: '当前控制势力', value: '' }
      ],
      locationBridge: bridge
    }
  }
  if (detail.kind === 'time') {
    if (!projection.time || projection.time.id !== detail.id) return null
    return {
      kind: 'time',
      id: detail.id,
      name: projection.time.label,
      sections: [
        { label: '当前时间锚点', value: projection.time.label },
        { label: '与上一节拍的推进量', value: '' },
        { label: '时间来源', value: '写作时间设定' }
      ]
    }
  }
  if (detail.kind === 'event') {
    const event = (projection.unresolvedEvents || []).find((item) => item.id === detail.id)
    if (!event) return null
    const candidate = (projection.emergenceCandidates || []).find(
      (item) => item.summary === event.label || item.title === event.label
    )
    return {
      kind: 'event',
      id: detail.id,
      name: event.label,
      sections: [
        { label: '未决问题', value: event.label },
        { label: '已知起因与压力', value: candidate?.summary || candidate?.hook || '' },
        { label: '相关人物与地点', value: '' },
        { label: '最近兑现', value: '' }
      ]
    }
  }
  // spec §8.3：涌现候选审阅详情——内容/来源来自同一共享投影，动作由页面落点。
  if (detail.kind === 'emergence') {
    return resolveAuthoringEmergenceDetailModel(projection, detail.id)
  }
  return null
}
function livingStoryUsesSheet() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 720px)')?.matches)
}
function locateLivingStoryBeat(beat) {
  const target = beat?.target
  if (!target || String(target.projectId || '') !== String(selectedBookId.value || '')
    || String(target.chapterId || '') !== String(selectedChapterId.value || '')) return false
  const unit = (writingDocument.value?.content || []).find((item) => (
    String(item?.attrs?.unitId || '') === String(target.unitId || '')
  ))
  if (!unit || !(unit.content || []).some((node) => String(node?.attrs?.nodeId || '') === String(target.nodeId || ''))) {
    authoringTask.notify(tr('这个故事节点已不在当前正文中'))
    return false
  }
  clearInspectorReturnSurface()
  const focus = () => nextTick(() => {
    if (target.nodeId) notebookEditorRef.value?.focusNode?.(target.nodeId)
    else notebookEditorRef.value?.focusWritingUnit?.(target.unitId)
  })
  if (livingStoryUsesSheet()) {
    closeWritingInspector({ restoreSurface: false })
    nextTick(focus)
  } else focus()
  return true
}
function openLivingStorySource(source) {
  const sourceRef = String(source?.sourceRef || '')
  if (sourceRef.startsWith('worldbook-entry:')) {
    openWorldbookMentionDetail(sourceRef.slice('worldbook-entry:'.length))
    return true
  }
  if (sourceRef.startsWith('outline-node:')) {
    const nodeId = sourceRef.slice('outline-node:'.length)
    if (!wt3OutlineNodes.value.some((node) => String(node?.id || '') === nodeId)) {
      authoringTask.notify(tr('这条线索已从项目大纲移除'))
      return false
    }
    inspectorOutlineNodeId.value = ''
    selectInspectorTool('outline')
    nextTick(() => { inspectorOutlineNodeId.value = nodeId })
    return true
  }
  return false
}
function interveneFromLivingStory(beat) {
  if (!beat?.target) return false
  clearInspectorReturnSurface()
  if (livingStoryUsesSheet()) {
    closeWritingInspector({ restoreSurface: false })
    nextTick(() => openInterventionComposer(beat.target))
    return true
  }
  return openInterventionComposer(beat.target)
}
function openSceneDetail(payload) {
  if (!payload?.kind || !payload.id) return
  // 左栏是现场简报，人物/地点/事件点击后都先进入“现场”详情；
  // 完整人物档案或地点设定由详情页中的显式动作再跳转，避免把现场点击
  // 误路由成另一个工具的默认页。
  const enteringDetail = !inspectorDetailState.value
  if (!openInspectorTool('scene', { detailState: { kind: payload.kind, id: payload.id } })) return
  if (enteringDetail) {
    captureAnnotationLaneScroll()
  }
  sceneDetailNotice.value = ''
  inspectorReturnFocusRef.value = `${payload.kind}:${payload.id}`
}
async function closeSceneDetail() {
  const returnRef = inspectorReturnFocusRef.value
  const closingSceneEditor = inspectorDetailState.value?.kind === 'scene-edit'
  inspectorDetailState.value = null
  sceneDetailNotice.value = ''
  if (closingSceneEditor) {
    discardSceneCurationDraft()
  }
  await restoreAnnotationLaneScroll()
  // 恢复批注滚动位置，并把焦点还给左栏来源条目。
  if (returnRef && chapterShelfRef.value) {
    chapterShelfRef.value.querySelector(`[data-scene-rail-item="${CSS.escape(returnRef)}"]`)?.focus?.()
  }
}
// 详情对象失效（被删除/来源消失）时安全返回默认批注并提示一次。
watch([inspectorDetailState, sceneProjection], () => {
  if (!inspectorDetailState.value) return
  // 现场调整是受控草稿路由：失效由草稿 watch 负责，不在这里清。
  if (inspectorDetailState.value.kind === 'scene-edit') return
  if (resolveSceneDetailModel(inspectorDetailState.value)) return
  void closeSceneDetail().then(() => {
    sceneDetailNotice.value = tr('详情对象已失效，已返回当前场。')
  })
})
// —— 现场调整（worldbook scene closure Task 10）——
// 草稿只存在于内存；保存走 commitSceneAnchorDraft 的原子事务（revision 守卫 +
// 单次章节持久化）；取消零写入；撤销先做锚点指纹校验。
const {
  beginSceneCuration,
  curationCharacterCandidates,
  curationLocationCandidates,
  curationMissingCharacterIds,
  curationMissingLocationId,
  discardSceneCurationDraft,
  handleCurationCancel,
  handleCurationDraftUpdate,
  handleCurationRestoreInheritance,
  handleCurationSave,
  handleCurationSearch,
  handleCurationUndo,
  sceneCurationBaseline,
  sceneCurationBusy,
  sceneCurationCanRestoreInheritance,
  sceneCurationCanUndo,
  sceneCurationDraft,
  sceneCurationError,
  sceneCurationHasUnsavedChanges,
  sceneCurationPreviewOpen,
  sceneCurationTarget
} = useAuthoringSceneWorkflow({
  activeWritingUnitId,
  boundWorldbook,
  getBookWorldbookStatus: () => bookWorldbookStatus.value,
  inspectorDetailState,
  lastSceneAnchorUndoReceipt,
  sceneAnchors,
  selectedBookId,
  selectedBookWorldbookId,
  selectedChapterId,
  getDocumentRevision: () => currentDocumentRevision(),
  persistChapter: () => saveCurrentChapter(),
  closeSceneDetail: () => closeSceneDetail(),
  reopenSceneCuration: () => handleSceneEditRequest(),
  getSceneAnchorStatus: () => sceneProjection.value?.anchorStatus,
  setSceneDetailNotice: (message) => { sceneDetailNotice.value = message },
  notify: (message) => authoringTask.notify(message),
  onScopeInvalidated: () => authoringTask.notify(tr('当前场作用域已变化，请在新的落笔处重新打开'))
})
const authoringSceneRunIntents = shallowRef([])
const activeSceneLaboratoryIntent = computed(() => authoringSceneRunIntents.value[0] || null)
const rehearsal = useAuthoringRehearsal({
  getSettings: getResolvedApiSettings,
  validate: async (run) => {
    const live = await getAuthoringRunSessionAdapter().collectLiveDependencies(run.runSession)
    return reconcileManifestDependencies(run.runSession.manifest, live).length === 0
  }
})
const rehearsalMemoryWorkflow = useAuthoringRehearsalMemoryWorkflow({
  queue: queueMemoryCandidate,
  openReview: () => { memoryReviewOpen.value = true }
})
const sceneLaboratoryWorkflow = useAuthoringSceneLaboratoryWorkflow({
  boundWorldbook,
  rehearsal,
  notifyPendingDraft: () => { rehearsalNotice.value = tr('请先处理正文中已有的试稿，再开始新的试演。') },
  isBusy: () => Boolean(authoringTaskBusy.value || rehearsal.busy.value || ifBusy.value),
  hasPendingDrafts: () => Boolean(blockPreview.value || Object.values(ifBranchDrafts.value).some(Boolean)),
  resolveTarget: (target) => resolveBlockComposerTarget(target),
  getDefaultTarget: () => notebookSelection.value,
  isEmptyDocument: () => isEmptyChapter.value,
  prepareSurface: () => {
    if (characterIfActive.value) characterIfWorkflow.reset()
    ifEntryOpen.value = false
    if (!openInspectorTool('rehearsal')) return false
    if (interventionComposer.open) closeInterventionComposer({ restoreSelection: false })
    if (blockComposer.open) abandonBlockComposer({ restoreSelection: false })
    writingAgentHost.cancelForToolTakeover()
  },
  restoreScroll: (scrollTop) => nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    const dossier = document.querySelector('.wall__dossier-scroll')
    if (dossier && Number.isFinite(scrollTop)) dossier.scrollTop = scrollTop
  }))),
  getRunner: () => getAuthoringSceneLaboratoryRunner(),
  collectLiveDependencies: (session) => getAuthoringRunSessionAdapter().collectLiveDependencies(session),
  createDraft: ({ target, validation, instruction }) => {
    const submittedVersion = beginBlockRequest()
    blockComposer.open = true
    blockComposer.target = target
    blockComposer.failure = null
    blockComposer.staleResult = null
    return runAuthoringTurn({
      operation: 'next-passage',
      kind: 'action',
      instruction: instruction || '',
      sourceRefs: [...new Set([...composerSourceRefs.value, ...validation.selection.evidenceRefs])],
      invocationTarget: target,
      selectedDirection: validation.selection,
      authoringRunSession: validation.runSession
    }, submittedVersion).then((outcome) => {
      if (!outcome?.preview) {
        blockComposer.open = false
        blockComposer.target = null
      }
      return outcome
    }).catch((error) => ({ ok: false, reason: error?.code || 'provider-failed' }))
  },
  onRunReady: () => {
    rehearsalOriginTitle.value = chapters.value.find(chapter => chapter.id === selectedChapterId.value)?.title || '当前段落'
    openInspectorTool('rehearsal')
  },
  resetCharacterIf: () => {
    ifEntryOpen.value = false
    ifEntryActor.value = ''
    characterIfWorkflow.reset()
  },
  clearSceneIntents: () => clearAuthoringSceneRunIntents(),
  restoreSelection: (bookmark) => nextTick(() => restoreBlockSelection(bookmark))
})
const {
  laboratory: sceneLaboratory,
  appendRequirement: sceneLaboratoryAppendRequirement,
  directions: sceneLaboratoryDirections,
  pressure: sceneLaboratoryPressure,
  open: openSceneLaboratory,
  close: closeSceneLaboratory,
  selectDirection: selectSceneLaboratoryDirection,
  confirmDirection: confirmSceneLaboratoryDirection,
  retryDirections: retrySceneLaboratoryDirections
} = sceneLaboratoryWorkflow
function scrollRehearsalBackToManuscript() {
  const scroller = writingMainRef.value
  if (scroller?.scrollTo) scroller.scrollTo({ top: 0 })
  else if (scroller) scroller.scrollTop = 0
  const dossier = document.querySelector('.wall__dossier')
  if (dossier) dossier.scrollIntoView({ block: 'start' })
}
function locateRehearsalOrigin() {
  const target = rehearsal.run.value?.target
  if (target) restoreBlockSelection(target.selectionBookmark || target)
  closeRehearsalOverlay()
}
function openRehearsalIf() {
  if (!rehearsal.run.value) return
  sceneLaboratory.run = rehearsal.run.value; sceneLaboratory.target = rehearsal.run.value.target
  sceneLaboratory.open = true; sceneLaboratory.phase = 'ready'; ifEntryOpen.value = true
}
function revealRehearsalDraft() {
  closeRehearsalOverlay()
  const candidate = blockPreview.value
  nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (candidate && candidate === blockPreview.value) document.querySelector('[data-test="block-draft"]')?.scrollIntoView({ block: 'start' })
  })))
}
const {
  preparing: rehearsalPreparing,
  drafting: rehearsalDrafting,
  notice: rehearsalNotice,
  originTitle: rehearsalOriginTitle,
  draftSource: rehearsalDraftSource,
  draftState: rehearsalDraftState,
  reset: resetRehearsalWorkflow,
  start: startRehearsal,
  writeDraft: writeRehearsalDraft
} = useAuthoringRehearsalWorkflow({
  rehearsal,
  getDraftPreview: () => blockPreview.value,
  hasAlternativeDraft: () => Object.values(ifBranchDrafts.value).some(Boolean),
  isAuthoringTaskBusy: () => authoringTaskBusy.value,
  confirmRestart: () => window.confirm(tr('重新确定起点会清除本次试演。继续吗？')),
  prepareStart: () => openSceneLaboratory(),
  readStartFailure: () => sceneLaboratory.notice,
  closeComparison: () => {
    if (characterIfActive.value) closeSceneLaboratory({ restoreSelection: false, clearIntents: false })
  },
  closeComparisonEntry: () => { ifEntryOpen.value = false },
  getDocumentScopeKey: () => activeDocumentSaveScopeKey(),
  prepareDraftTarget: (target) => { blockComposer.open = true; blockComposer.target = target },
  generateDraft: ({ run, instruction }) => {
    const version = beginBlockRequest()
    return runAuthoringTurn({ operation: 'next-passage', kind: 'action', instruction,
      invocationTarget: run.target, authoringRunSession: run.runSession }, version)
  },
  readDraftFailure: () => blockComposer.failure?.message,
  dismissDraft: () => dismissBlockPreview(),
  revealDraft: () => revealRehearsalDraft()
})
watch([selectedBookId, selectedChapterId, wt3ActiveDocId], () => {
  resetRehearsalWorkflow()
  rehearsalMemoryWorkflow.reset()
})
onBeforeUnmount(() => rehearsal.clear())
const ifEntryOpen = ref(false)
const ifEntryActor = ref('')
async function openIfEntry(candidate = null) {
  const name = candidate?.name || sceneProjection.value.presentCharacters?.[0]?.name || ''
  await closeSceneDetail()
  await openSceneLaboratory()
  ifEntryOpen.value = true
  ifEntryActor.value = name
}
const notesExtractionSource = shallowRef(null)
function openNotesExtraction(doc) {
  const id = typeof doc === 'string' ? doc : doc?.id
  if (id === wt3ActiveDocId.value && !wt3PersistActiveDoc()?.ok) return
  notesExtractionSource.value = getExplorationDocument(selectedBookId.value, id)
}
watch(selectedBookId, () => { notesExtractionSource.value = null })
function closeRehearsalOverlay() {
  if (writingInspectorRef.value && getComputedStyle(writingInspectorRef.value).position === 'absolute') closeWritingInspector()
}
function openSceneLaboratoryEvidence(evidence = {}) {
  if (!['character', 'location'].includes(evidence.kind) || !evidence.entityId) return
  openSceneDetail({ kind: evidence.kind, id: evidence.entityId })
}
function openOrdinaryTurnFromSceneLaboratory() {
  const target = sceneLaboratory.target
  const preserveSceneIntents = authoringSceneRunIntents.value.length > 0
  closeSceneLaboratory({ restoreSelection: false, clearIntents: !preserveSceneIntents })
  blockComposer.initialInstruction = '结合当前场与正文进度，推演自然发生的下一步。'
  openBlockComposer(target, { preserveInstruction: true, preserveSceneIntents })
}
function supplementSceneFromSceneLaboratory() {
  closeSceneLaboratory({ restoreSelection: true })
  nextTick(() => handleSceneEditRequest())
}
function clearAuthoringSceneRunIntents() {
  authoringSceneRunIntents.value = []
}
function handleSceneEditRequest(options = {}) {
  const unitId = activeWritingUnitId.value
  if (!unitId) return
  if (!sceneLaboratory.open) {
    sceneLaboratory.returnScrollTop = notebookSelectionScrollTop
  }
  if (!openInspectorTool('scene')) return false
  const resolution = resolveActiveSceneAnchor({
    anchors: sceneAnchors.value,
    unitOrder: documentUnitOrder(),
    activeUnitId: unitId,
    worldbookId: selectedBookWorldbookId.value
  })
  const base = resolution.anchor || resolution.conflictingAnchor || {}
  const projection = sceneProjection.value || {}
  const projectedCharacterIds = [
    projection.viewpointCharacter?.id,
    projection.activeActor?.id,
    projection.dialogueTarget?.id,
    ...(projection.presentCharacters || []).map((person) => person?.id)
  ].filter((id, index, values) => id && values.indexOf(id) === index)
  // 有显式/继承锚点时保持锚点值；没有锚点时用当前可见投影预填。
  // 这里只建立可取消的本地草稿，用户点“保存现场”后才升级为手动锚点。
  const draft = {
    unitId,
    projectId: selectedBookId.value,
    chapterId: selectedChapterId.value,
    worldbookId: selectedBookWorldbookId.value,
    sourceWorldbookId: String(base.worldbookId || ''),
    originAxis: resolution.status,
    anchorFingerprint: fingerprintSceneAnchors(sceneAnchors.value),
    documentRevision: currentDocumentRevision(),
    presentCharacterIds: [...((resolution.anchor || resolution.conflictingAnchor) ? (base.presentCharacterIds || []) : projectedCharacterIds)],
    // 旧版持久化的 plannedCharacterIds 不再继续写回；C1-2 的安排只存在于
    // 当前 AuthoringRunSession，采纳 Ghost 后才产生新的现场锚点。
    plannedCharacterIds: [],
    locationId: (resolution.anchor || resolution.conflictingAnchor) ? (base.locationId || '') : (projection.location?.id || ''),
    viewpointCharacterId: (resolution.anchor || resolution.conflictingAnchor) ? (base.viewpointCharacterId || '') : (projection.viewpointCharacter?.id || ''),
    time: {
      label: (resolution.anchor || resolution.conflictingAnchor) ? (base.time?.label || '') : (projection.time?.label || ''),
      period: (resolution.anchor || resolution.conflictingAnchor) ? (base.time?.period || '') : (projection.time?.period || '')
    }
  }
  beginSceneCuration(draft)
  if (!inspectorDetailState.value) {
    captureAnnotationLaneScroll()
  }
  inspectorReturnFocusRef.value = 'scene-edit'
  inspectorTab.value = 'detail'
  inspectorDetailState.value = { kind: 'scene-edit', id: unitId }
  const focusSelector = {
    time: '[data-test="curation-time-label"]',
    location: '[data-test="curation-location-query"]',
    people: '[data-test="curation-people-query"]'
  }[options?.axis]
  if (focusSelector) nextTick(() => document.querySelector(focusSelector)?.focus())
}
// 临时意图跟随书 / 文档 / 世界书绑定，不跟随失焦时会回退到末单元的
// activeWritingUnitId。具体 writingUnit 的切换由 frozen composer target 处理。
watch([selectedBookId, selectedChapterId, wt3ActiveDocId, selectedBookWorldbookId], () => {
  if (authoringSceneRunIntents.value.length) clearAuthoringSceneRunIntents()
  if (sceneLaboratory.open) closeSceneLaboratory({ restoreSelection: false })
})
function handleDetailSetActor(id) {
  sceneActiveActorId.value = id
  sceneDialogueTargetId.value = ''
  closeSceneDetail().then(() => {
    blockComposer.initialInstruction = '从这个人物此刻的目标、感受与关系出发，推演下一段。'
    if (!openBlockComposer(notebookSelection.value, { preserveInstruction: true })) return
    nextTick(() => document.querySelector('[data-test="block-composer"] textarea')?.focus())
  })
}
// C1-2：下一段安排 / 带入本次都先冻结为 run-only scene intent。
// 这里不保存 scene anchor；下一段意图只有在 Ghost 采纳事务中才兑现。
async function handleSceneRunIntent(payload = {}) {
  const draft = sceneCurationDraft.value
  if (!draft) return false
  if (sceneCurationHasUnsavedChanges.value) {
    sceneCurationError.value = {
      phase: 'unsaved-current-scene',
      message: tr('当前场还有未保存的纠正；请先保存当前场或取消改动，再选择临时推演意图。')
    }
    return false
  }
  const entityKind = payload.entityKind === 'location' ? 'location' : 'character'
  const entityId = String(payload.entityId || '')
  const entry = (boundWorldbook.value?.entries || []).find((candidate) => (
    String(candidate?.id || '') === entityId && String(candidate?.type || '') === entityKind
  ))
  const target = resolveBlockComposerTarget({
    unitId: draft.unitId,
    selectionBookmark: notebookEditorRef.value?.captureSelectionBookmark?.() || null
  })
  const intent = createAuthoringSceneRunIntent({
    mode: payload.mode,
    entityKind,
    entry,
    target,
    worldbookId: selectedBookWorldbookId.value,
    presentCharacterIds: (sceneProjection.value.presentCharacters || []).map((character) => character.id)
  })
  if (!intent) {
    sceneCurationError.value = { phase: 'invalid-run-intent', message: tr('这条设定已变化，请重新选择。') }
    return false
  }
  authoringSceneRunIntents.value = [intent]
  sceneActiveActorId.value = ''
  sceneDialogueTargetId.value = ''
  blockComposer.initialInstruction = intent.content
  await closeSceneDetail()
  // The laboratory owns this central interaction. Keeping the inspector open
  // would shrink the dossier at desktop widths and cover it on compact screens.
  inspectorOpen.value = false
  sceneLaboratory.returnScrollTop = notebookSelectionScrollTop
  const opened = await openSceneLaboratory({ target, instruction: intent.content })
  if (!opened) {
    // A failed planner still owns the frozen intent and can retry in place.
    if (!sceneLaboratory.open) clearAuthoringSceneRunIntents()
    return false
  }
  return true
}
function handleDetailAdvanceWith(eventId) {
  handleSceneAdvanceWith(eventId)
}
function handleDetailAddToOutline(id) {
  // 详情动作按对象类型分派：涌现候选走候选纲要路径，未决事件走事件路径。
  if (inspectorDetailState.value?.kind === 'emergence') {
    handleDetailEmergenceOutline(id)
    return
  }
  const event = (sceneProjection.value.unresolvedEvents || []).find((item) => item.id === id)
  if (!event || !selectedChapterId.value) return
  chapterOutlineItems.value = [...chapterOutlineItems.value, createChapterOutlineItem({
    title: event.label.slice(0, 24),
    content: event.label,
    sourceRefs: event.sourceRefs,
    source: {
      type: 'unresolved-event',
      assetId: '',
      assetKind: '',
      projectId: selectedBookId.value || null,
      sourceType: 'scene-rail',
      sourceId: id,
      messageIds: []
    }
  })]
  syncChapterOutlineToCurrentChapter()
  sceneDetailNotice.value = tr('已加入章节纲要。')
}
// —— 涌现候选审阅闭环（plan Phase 3 任务 5 / spec §8.3）——
function currentEmergenceCandidate(id) {
  return (sceneProjection.value.emergenceCandidates || []).find((item) => item?.id === id) || null
}
// 确认：只走派生状态路径（runtime event + 移出待审），不自动成为 locked 事实。
function handleDetailConfirmEmergence(id) {
  const candidate = currentEmergenceCandidate(id)
  if (!candidate) return
  const result = gameStore.acknowledgeEmergenceCandidate(id)
  if (!result?.ok) return
  void closeSceneDetail().then(() => {
    sceneDetailNotice.value = tr('已确认候选，可在纲要与正文中显式使用。')
  })
}
// 忽略：走既有 dismissal 路径（dismissedIds 防止重复涌现）。
function handleDetailDismissEmergence(id) {
  if (!currentEmergenceCandidate(id)) return
  gameStore.dismissEmergenceCandidate(id)
  void closeSceneDetail().then(() => {
    sceneDetailNotice.value = tr('已忽略该候选。')
  })
}
// 加入纲要：复用章节纲要派生写入路径，不动正文。
function handleDetailEmergenceOutline(id) {
  const candidate = currentEmergenceCandidate(id)
  if (!candidate || !selectedChapterId.value) return
  chapterOutlineItems.value = [...chapterOutlineItems.value, createChapterOutlineItem({
    title: String(candidate.title || '').slice(0, 24),
    content: candidate.summary || candidate.title || '',
    sourceRefs: [`emergence:${candidate.id}`],
    source: {
      type: 'emergence-candidate',
      assetId: '',
      assetKind: '',
      projectId: selectedBookId.value || null,
      sourceType: 'emergence-review',
      sourceId: candidate.id,
      messageIds: []
    }
  })]
  syncChapterOutlineToCurrentChapter()
  sceneDetailNotice.value = tr('已加入章节纲要。')
}
// 打开来源：按 typed 来源映射到对应设置页；不修改任何状态。
function handleDetailOpenEmergenceSource(id) {
  const candidate = currentEmergenceCandidate(id)
  if (!candidate) return
  const firstRef = (Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [])[0]
  const refType = typeof firstRef === 'object' ? firstRef?.type : String(firstRef || '').split(':')[0]
  const refId = typeof firstRef === 'object' ? String(firstRef?.id || '') : String(firstRef || '').split(':')[1] || ''
  if (openProjectSettingsSurface(refType === 'place' ? 'map' : 'settings', refType === 'place' ? { placeId: refId } : {})) return
  if (refType === 'place') router.push({ name: 'settings-world-map' })
  else router.push({ name: 'settings-worldbook' })
}
function handleDetailOpenFull(detail) {
  if (detail.kind === 'time') {
    handleSceneEditRequest({ axis: 'time' })
    return
  }
  inspectorWorldbookEntryId.value = String(detail?.id || '')
  openInspectorTool('worldbook', { detailState: null })
}
async function handleDetailOpenMap(detail) {
  if (detail?.kind !== 'location') return false
  const bridge = sceneLocationBridge.value
  if (!bridge?.canOpenMap || !bridge.mapRoute) return false
  return workspaceNavigationController?.openWorkspaceRoute({
    surface: 'map',
    projectId: bridge.projectId,
    worldbookId: bridge.worldbookId,
    route: bridge.mapRoute,
    chapterId: bridge.chapterId,
    objectId: bridge.entryId
  })
}
const notebookCopilotCanUndo = ref(false)
const pendingWritingGhost = shallowRef(null)
const pendingGhostAdoption = shallowRef(null)
const blockDraftRef = ref(null)
const adoptionImpact = shallowRef(null)
let adoptionImpactTimer = null
function clearAdoptionImpact() {
  adoptionImpact.value = null
  if (adoptionImpactTimer) clearTimeout(adoptionImpactTimer)
  adoptionImpactTimer = null
}
function showAdoptionImpact(projection, target) {
  clearAdoptionImpact()
  if (!projection?.headline || !target?.unitId) return
  adoptionImpact.value = Object.freeze({ projection, target: Object.freeze({ ...target }) })
  adoptionImpactTimer = setTimeout(clearAdoptionImpact, 4200)
}
// ProseMirror 只保存正文 steps；Ghost 的现场/大纲 delta 与结构编辑的现场锚点
// 必须共用同一条按时间排序的 sidecar ledger，两个独立栈无法可靠判断谁才是
// 当前 history 顶层事务。
const notebookAtomicUndoReceipts = shallowRef([])
const notebookAtomicRedoReceipts = shallowRef([])
const lastNotebookAtomicUndoReceipt = computed(() => notebookAtomicUndoReceipts.value.at(-1) || null)
const lastNotebookAtomicRedoReceipt = computed(() => notebookAtomicRedoReceipts.value.at(-1) || null)
const lastGhostAdoptionReceipt = computed(() => lastNotebookAtomicUndoReceipt.value?.kind === 'ghost-adoption'
  ? lastNotebookAtomicUndoReceipt.value : null)
const lastGhostUndoReceipt = computed(() => lastNotebookAtomicRedoReceipt.value?.kind === 'ghost-adoption'
  ? lastNotebookAtomicRedoReceipt.value : null)
const lastStructureUndoReceipt = computed(() => lastNotebookAtomicUndoReceipt.value?.kind === 'unit-transition'
  ? lastNotebookAtomicUndoReceipt.value : null)
const lastStructureRedoReceipt = computed(() => lastNotebookAtomicRedoReceipt.value?.kind === 'unit-transition'
  ? lastNotebookAtomicRedoReceipt.value : null)
const atomicHistoryBusy = ref(false)
let applyingAtomicNotebookHistory = false
function currentGhostTarget(overrides = {}) {
  const exploration = wt3ActiveDoc.value
  const selection = notebookSelection.value || {}
  return {
    projectId: selectedBookId.value || '',
    documentId: exploration?.id || selectedChapterId.value || '',
    role: exploration ? 'exploration' : 'manuscript',
    chapterId: exploration ? '' : selectedChapterId.value || '',
    unitId: overrides.unitId || selection.unitId || '',
    unitRevision: overrides.unitRevision ?? selection.unitRevision ?? '',
    nodeId: overrides.nodeId || selection.nodeId || '',
    nodeRevision: overrides.nodeRevision ?? selection.nodeRevision ?? '',
    caret: overrides.caret ?? copilotCursorPos.value,
    documentRevision: String(overrides.documentRevision ?? currentDocumentRevision())
  }
}
function ghostReceiptMatchesCurrentScope(receipt) {
  const target = currentGhostTarget()
  return Boolean(receipt
    && receipt.projectId === target.projectId
    && receipt.documentId === target.documentId
    && receipt.documentRole === target.role)
}
function currentDocumentContainsGhostUnit(receipt) {
  const ids = receipt?.insertedUnitIds?.length ? receipt.insertedUnitIds : [receipt?.insertedUnitId]
  const currentIds = new Set((writingDocument.value?.content || []).map((unit) => unit?.attrs?.unitId))
  return Boolean(ids.length && ids.every((unitId) => unitId && currentIds.has(unitId)))
}
function currentDocumentContainsNoGhostUnits(receipt) {
  const ids = receipt?.insertedUnitIds?.length ? receipt.insertedUnitIds : [receipt?.insertedUnitId]
  const currentIds = new Set((writingDocument.value?.content || []).map((unit) => unit?.attrs?.unitId))
  return Boolean(ids.length && ids.every((unitId) => unitId && !currentIds.has(unitId)))
}
function currentDocumentMatchesGhostUnitSnapshot(receipt, direction) {
  const snapshot = direction === 'redo' ? receipt?.afterUnitSnapshot : receipt?.beforeUnitSnapshot
  const current = (writingDocument.value?.content || [])
    .find((unit) => unit?.attrs?.unitId === receipt?.insertedUnitId)
  if (!snapshot || !current) return false
  return getWritingDocumentMarkdown({ content: [current], meta: {} })
    === getWritingDocumentMarkdown({ content: [snapshot], meta: {} })
}
const hasGhostAdoptionUndoBoundary = computed(() => ghostReceiptMatchesCurrentScope(lastGhostAdoptionReceipt.value)
  && (lastGhostAdoptionReceipt.value.operation === 'rewrite-unit'
    ? currentDocumentMatchesGhostUnitSnapshot(lastGhostAdoptionReceipt.value, 'redo')
    : lastGhostAdoptionReceipt.value.afterBodyRevision === currentDocumentBodyRevision())
  && currentDocumentContainsGhostUnit(lastGhostAdoptionReceipt.value))
const hasGhostAdoptionRedoBoundary = computed(() => ghostReceiptMatchesCurrentScope(lastGhostUndoReceipt.value)
  && (lastGhostUndoReceipt.value.operation === 'rewrite-unit'
    ? currentDocumentMatchesGhostUnitSnapshot(lastGhostUndoReceipt.value, 'undo')
    : lastGhostUndoReceipt.value.beforeBodyRevision === currentDocumentBodyRevision())
  && (lastGhostUndoReceipt.value.operation === 'rewrite-unit'
    ? currentDocumentContainsGhostUnit(lastGhostUndoReceipt.value)
    : currentDocumentContainsNoGhostUnits(lastGhostUndoReceipt.value)))
const canUndoGhostAdoption = computed(() => !atomicHistoryBusy.value
  && hasGhostAdoptionUndoBoundary.value
  && canUndoWritingAdoptionDeltas(lastGhostAdoptionReceipt.value, {
    sceneAnchors: sceneAnchors.value,
    outlineNodes: wt3OutlineNodes.value,
    outlineEdges: wt3OutlineEdges.value
  }))
const canRedoGhostAdoption = computed(() => !atomicHistoryBusy.value
  && hasGhostAdoptionRedoBoundary.value
  && canRedoWritingAdoptionDeltas(lastGhostUndoReceipt.value, {
    sceneAnchors: sceneAnchors.value,
    outlineNodes: wt3OutlineNodes.value,
    outlineEdges: wt3OutlineEdges.value
  }))
function structureReceiptMatchesCurrentScope(receipt) {
  const target = currentGhostTarget()
  return Boolean(receipt
    && receipt.projectId === target.projectId
    && receipt.documentId === target.documentId
    && receipt.documentRole === target.role)
}
const hasStructureUndoBoundary = computed(() => structureReceiptMatchesCurrentScope(lastStructureUndoReceipt.value)
  && lastStructureUndoReceipt.value.afterBodyRevision === currentDocumentBodyRevision())
const hasStructureRedoBoundary = computed(() => structureReceiptMatchesCurrentScope(lastStructureRedoReceipt.value)
  && lastStructureRedoReceipt.value.beforeBodyRevision === currentDocumentBodyRevision())
const canUndoStructureTransition = computed(() => !atomicHistoryBusy.value
  && hasStructureUndoBoundary.value
  && fingerprintSceneAnchors(sceneAnchors.value) === lastStructureUndoReceipt.value.afterAnchorFingerprint
  && fingerprintWritingAnnotationState(activeEditorAnnotations.value) === lastStructureUndoReceipt.value.afterAnnotationFingerprint)
const canRedoStructureTransition = computed(() => !atomicHistoryBusy.value
  && hasStructureRedoBoundary.value
  && fingerprintSceneAnchors(sceneAnchors.value) === lastStructureRedoReceipt.value.beforeAnchorFingerprint
  && fingerprintWritingAnnotationState(activeEditorAnnotations.value) === lastStructureRedoReceipt.value.beforeAnnotationFingerprint)
function invalidateNotebookAtomicHistory() {
  notebookAtomicUndoReceipts.value = []
  notebookAtomicRedoReceipts.value = []
}
function clearNotebookAtomicRedoHistory() {
  if (notebookAtomicRedoReceipts.value.length) notebookAtomicRedoReceipts.value = []
}
function pushNotebookAtomicUndoReceipt(receipt) {
  notebookAtomicUndoReceipts.value = [
    ...notebookAtomicUndoReceipts.value.slice(-79),
    Object.freeze(receipt)
  ]
  notebookAtomicRedoReceipts.value = []
}
function canRunInlineWritingAgent() {
  return !pendingGhostAdoption.value
    && !blockPreview.value
    && !blockComposer.open
    && !blocksPassiveInlineSuggestion(writingInteractionOwner.value)
}
const {
  enabled: copilotEnabled,
  setEnabled: setWritingAgentEnabled,
  generating: copilotGenerating,
  requesting: copilotRequesting,
  suggestion: copilotSuggestion,
  cycleSuggestion: cycleCopilotSuggestion,
  visible: copilotVisible,
  error: copilotError,
  onInput: writingAgentOnInput,
  manualTrigger: copilotManualTrigger,
  accept: writingAgentAccept,
  peek: writingAgentPeek,
  consume: writingAgentConsume,
  cancel: copilotCancel,
  suppress: suppressWritingAgent,
  finishComposition: finishWritingAgentComposition
} = useWritingAgent({
  debounceMs: (inputType) => inputType === 'cursor' ? 4200 : 2800,
  getContext: getWritingAgentPageContext,
  canStartSuggestion: canRunInlineWritingAgent,
  canPresentSuggestion: canRunInlineWritingAgent,
  onContextManifest: (manifest) => { lastCompiledContextManifest.value = manifest },
  getLiveContextDependencies: buildLiveContextDependencyRevisions,
  onCandidateShown: (payload) => {
    // 请求完成与块推演打开可能同拍发生；块草稿一旦取得所有权，迟到的
    // inline 结果不得覆盖冻结的 narrative candidate。
    if (!canRunInlineWritingAgent()) return
    const next = createWritingGhostCandidate({
      kind: 'inline',
      text: payload.text,
      target: currentGhostTarget({
        ...(payload.nodeTarget || {}),
        caret: payload.cursorPos,
        documentRevision: payload.documentRevision ?? currentDocumentRevision()
      }),
      manifest: payload.manifest || lastCompiledContextManifest.value,
      runOutcome: payload.runOutcome
    })
    pendingWritingGhost.value = claimWritingGhostCandidate(pendingWritingGhost.value, next).pending
  },
  onCandidateDismissed: () => {
    if (pendingWritingGhost.value?.mode === 'inline') pendingWritingGhost.value = null
  },
  onCandidateAccepted: ({ remaining }) => {
    const current = pendingWritingGhost.value
    if (current?.mode !== 'inline') return
    if (!remaining) {
      pendingWritingGhost.value = null
      return
    }
    pendingWritingGhost.value = createWritingGhostCandidate({
      kind: 'inline',
      text: remaining,
      target: currentGhostTarget(),
      manifest: {
        fingerprint: current.manifestFingerprint,
        dependencies: current.dependencyRevisions
      },
      runOutcome: current.runOutcome,
      originRefs: current.originRefs
    })
  },
  getSnapshot: () => {
    const { cursorPos, target, book } = readWritingAgentSource()
    return {
      content: markdownContent.value,
      cursorPos,
      bookId: target.projectId,
      bookTitle: book?.title || '',
      chapterTitle: currentChapterTitle.value,
      documentRole: target.role,
      documentId: target.documentId,
      chapterId: target.chapterId,
      documentRevision: target.documentRevision,
      nodeTarget: getWritingBlockAtPosition(cursorPos, markdownContent.value),
      editorFocused: notebookEditorRef.value?.hasEditorFocus?.() !== false
    }
  }
})
const inlineSuggestionEnabled = copilotEnabled
// 创作命令运行时：一个意图 = 一次 AI 请求 + 一个可撤销的正文事务。
// 全部命令走统一链：canonical TaskRequest → resolveAgentContext（真实 facade + profile ledger）
// → dispatcher workflow（叙事经 NarrativeKernel 适配器；文本走写作工作流；辅助只出候选）
// → applyAgentResultTransaction（stale 门禁）→ 应用。
const AUTHORING_COMMAND_QUESTIONS = {
  'authoring.continue': '从当前光标位置自然续写一段正文，保持既有的叙事声音与节奏。',
  'authoring.advance': '把当前场景向前推进一步，给出事件或局势的下一步变化。',
  'authoring.simulate.character': '模拟当前视角人物的即时反应与内心活动。',
  'authoring.simulate.scene': '推演当前场景接下来可能发生的一段情节。',
  'authoring.insert': '围绕当前上下文生成一段可插入的正文。',
  'authoring.rewrite': '在保持原意的前提下改写选中的文字。',
  'authoring.next-actions': '基于当前正文给出 2-4 个可能的下一步行动方向。',
  'authoring.dialogue-options': '给出当前情境下人物可以说的几条对话选项。',
  'authoring.emergence': '从当前正文中提炼可能浮现的新设定、关系或伏笔。'
}
function currentChapterDocumentText() {
  return String(markdownContent.value || '')
}
function activeDocumentRevisionKey() {
  return wt3ActiveDoc.value
    ? `exploration:${selectedBookId.value}:${wt3ActiveDoc.value.id}`
    : `chapter:${selectedChapterId.value || 'none'}`
}
function activeDocumentSourceRef() {
  return wt3ActiveDoc.value
    ? `exploration:${wt3ActiveDoc.value.id}`
    : `chapter:${selectedChapterId.value || 'none'}`
}
// Markdown 相同不代表编辑器状态相同：split/merge/move 会改变 writingUnit
// 拓扑，却可能一个字都不改。body 签名保留 unit/node 身份，供 PM 原子历史
// 对齐；上下文 revision 再叠加标题，供 AI stale 检查。标题编辑不产生 PM step，
// 因而绝不能让它把 Ghost/结构 sidecar 从正文 history 顶层“隐身”。
function writingDocumentBodyStateSignature(document = writingDocument.value) {
  const source = document && typeof document === 'object' ? document : null
  return JSON.stringify({
    historyRestoreEpoch: String(source?.meta?.historyRestoreEpoch || ''),
    markdown: source ? getWritingDocumentMarkdown(source) : currentChapterDocumentText(),
    units: (source?.content || []).map((unit) => ({
      id: String(unit?.attrs?.unitId || ''),
      kind: String(unit?.attrs?.kind || ''),
      sceneId: String(unit?.attrs?.sceneId || ''),
      nodes: (unit?.content || []).map((node) => ({
        id: String(node?.attrs?.nodeId || ''),
        type: String(node?.type || ''),
        kind: String(node?.attrs?.kind || '')
      }))
    }))
  })
}
function writingDocumentStateSignature(document = writingDocument.value) {
  return JSON.stringify({
    title: wt3ActiveDoc.value?.title || currentChapterTitle.value || '',
    body: writingDocumentBodyStateSignature(document)
  })
}
function documentStateRevision(document = writingDocument.value) {
  return buildDocumentRevision(activeDocumentRevisionKey(), writingDocumentStateSignature(document))
}
function currentDocumentRevision() {
  return documentStateRevision(writingDocument.value)
}
function documentBodyStateRevision(document = writingDocument.value) {
  return buildDocumentRevision(activeDocumentRevisionKey(), writingDocumentBodyStateSignature(document))
}
function currentDocumentBodyRevision() {
  return documentBodyStateRevision(writingDocument.value)
}
const authoringKnowledgeReaderHost = createAuthoringKnowledgeReaderHost({
  readLiveDocument: () => ({
    projectId: selectedBookId.value || '',
    chapterId: selectedChapterId.value || '',
    documentRole: wt3ActiveDoc.value ? 'exploration' : 'manuscript',
    documentId: wt3ActiveDoc.value?.id || selectedChapterId.value || '',
    text: currentChapterDocumentText(),
    revision: currentDocumentRevision()
  }),
  readSelection: () => readLiveWritingSelectionSnapshot(),
  findChapter: (projectId, chapterId) => books.value
    .find((book) => String(book.id || '') === String(projectId || ''))
    ?.chapters?.find((chapter) => String(chapter.id || '') === String(chapterId || '')) || null,
  outline: () => chapterOutlineItems.value,
  worldbook: () => boundWorldbook.value,
  characters: () => gameStore.writingCharacters || [],
  location: () => gameStore.worldMapState?.currentScene || '',
  history: () => gameStore.activities || [],
  sessionId: () => gameStore.currentSessionId || '',
  reference: () => readCurrentCopilotReference()
})
const getAuthoringFacade = () => authoringKnowledgeReaderHost.getFacade()
// 模型步骤：文本/辅助任务经既有 advisor 端点作为 provider 传输层，
// 但命令链本身已全部走 dispatcher/workflow/事务。
async function runAuthoringModelStep({ taskId, envelope, question, signal }) {
  const result = await requestAdvisorTask({
    envelope,
    question,
    taskType: taskId,
    scope: 'writing',
    mode: 'direct',
    signal
  })
  const payload = result.result || {}
  const text = String(payload.replacement || payload.text || '').trim()
    || (payload.summary && payload.summary !== '未获取到有效建议' ? String(payload.summary).trim() : '')
    || String(result.advice || '').trim()
  return { text, payload, advice: String(result.advice || '') }
}
function parseOptionsFromAdvice(rawAdvice) {
  const raw = String(rawAdvice || '').trim()
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim())
    if (Array.isArray(parsed.options)) {
      return parsed.options
        .map((option) => String(typeof option === 'string' ? option : option?.label ?? option?.text ?? '').trim())
        .filter(Boolean)
    }
  } catch { /* 非 JSON 输出退回逐行解析 */ }
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s、)]+/, '').trim())
    .filter((line) => line.length >= 2)
    .slice(0, 4)
}
function questionFromIntent(request, fallbackKey) {
  return String(request?.intent?.instruction || '').trim() || AUTHORING_COMMAND_QUESTIONS[fallbackKey]
}
// 真实 NarrativeKernel 执行器（spec §9）：模块级能力，页面只注入运行时快照。
let narrativeKernelExecutor = null
function getNarrativeKernelExecutor() {
  if (!narrativeKernelExecutor) narrativeKernelExecutor = createNarrativeKernelExecutor()
  return narrativeKernelExecutor
}
let authoringRunSessionAdapter = null
let authoringRunSessionProjectId = ''
let authoringNarrativeRun = null
let authoringNarrativeRunProjectId = ''
let authoringSceneLaboratoryRunner = null
let authoringSceneLaboratoryProjectId = ''
function cloneAuthoringRunValue(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}
// 页面只实现“当前编辑器内存稿”的严格读取边界。adapter 会再次核对全部
// scope ID；不匹配时返回 null，绝不把切章后的新页面状态冒充旧目标。
function readLiveAuthoringRunTarget(expected = {}) {
  // 双栏是与主栏平级的可编辑落笔面。先让它按 expected scope 自证；不匹配
  // 才读取主栏，禁止副栏任务在切章后借到主栏当前文档。
  const dualTarget = dualPaneRef.value?.readLiveRunTarget?.(expected)
  if (dualTarget) return dualTarget
  const role = wt3ActiveDoc.value ? 'exploration' : 'manuscript'
  const projectId = String(selectedBookId.value || '')
  const documentId = String(wt3ActiveDoc.value?.id || selectedChapterId.value || '')
  const chapterId = role === 'manuscript' ? String(selectedChapterId.value || '') : ''
  if (String(expected.projectId || '') !== projectId
    || String(expected.role || expected.documentRole || '') !== role
    || String(expected.documentId || '') !== documentId
    || String(expected.chapterId || '') !== chapterId) return null
  const unit = (writingDocument.value?.content || []).find((item) => (
    String(item?.attrs?.unitId || '') === String(expected.unitId || '')
  ))
  const node = (unit?.content || []).find((item) => (
    String(item?.attrs?.nodeId || '') === String(expected.nodeId || '')
  ))
  if (!unit || !node) return null
  return {
    projectId,
    role,
    documentRole: role,
    documentId,
    chapterId,
    unitId: String(unit.attrs.unitId),
    nodeId: String(node.attrs.nodeId),
    document: cloneAuthoringRunValue(writingDocument.value),
    documentRevision: currentDocumentRevision(),
    documentSchemaRevision: String(writingDocument.value?.revision ?? ''),
    unitRevision: String(unit.attrs.unitRevision ?? ''),
    nodeRevision: String(node.attrs.nodeRevision ?? ''),
    sceneProjection: cloneAuthoringRunValue(sceneProjection.value)
  }
}
function selectedAuthoringRunReferences() {
  return toAuthoringRunReferences(authoringRunReferenceSelections.value)
}
function getAuthoringRunSessionAdapter() {
  const projectId = String(selectedBookId.value || '')
  if (!authoringRunSessionAdapter || authoringRunSessionProjectId !== projectId) {
    authoringRunSessionProjectId = projectId
    const repositoryAdapters = createAuthoringRunRepositoryAdapters({
      projectId,
      readLiveTarget: readLiveAuthoringRunTarget
    })
    authoringRunSessionAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readOutlineNodes: (target) => listProjectOutlineNodes(target.projectId),
      readSceneIntents: (target) => readAuthoringSceneRunIntentsForTarget(
        authoringSceneRunIntents.value,
        target
      ),
      readReferenceSelections: () => selectedAuthoringRunReferences(),
      readPinnedCandidateIds: () => contextRunPinnedIds.value,
      readExcludedCandidateIds: () => contextRunExcludedIds.value,
      sessionId: () => gameStore.currentSessionId || ''
    })
  }
  return authoringRunSessionAdapter
}
function getAuthoringNarrativeRun() {
  const projectId = String(selectedBookId.value || '')
  if (!authoringNarrativeRun || authoringNarrativeRunProjectId !== projectId) {
    authoringNarrativeRunProjectId = projectId
    authoringNarrativeRun = createAuthoringNarrativeRun({
      prepareSession: (input) => getAuthoringRunSessionAdapter().prepareSession(input),
      executeSession: async ({ session, ...execution }) => {
        const settings = session === ifBaselineRun.value?.runSession && ifSettings.value
          ? ifSettings.value : await getResolvedApiSettings()
        return getNarrativeKernelExecutor().executeTurn({
          ...execution,
          authoringRunSession: session,
          settings,
          resolveLiveContextDependencies: () => (
            getAuthoringRunSessionAdapter().collectLiveDependencies(session)
          )
        })
      }
    })
  }
  return authoringNarrativeRun
}
function getAuthoringSceneLaboratoryRunner() {
  const projectId = String(selectedBookId.value || '')
  if (!authoringSceneLaboratoryRunner || authoringSceneLaboratoryProjectId !== projectId) {
    authoringSceneLaboratoryProjectId = projectId
    authoringSceneLaboratoryRunner = createAuthoringSceneLaboratoryRun({
      prepareSession: (input) => getAuthoringRunSessionAdapter().prepareSession(input),
      planDirections: planAuthoringSceneDirections
    })
  }
  return authoringSceneLaboratoryRunner
}
const authoringWorkflows = {
  text: createAuthoringTextWorkflow({
    insert: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.insert', envelope, question: questionFromIntent(request, 'authoring.insert'), signal }),
    rewrite: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.rewrite', envelope, question: questionFromIntent(request, 'authoring.rewrite'), signal }),
    expand: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.expand', envelope, question: questionFromIntent(request, 'authoring.rewrite'), signal }),
    shorten: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.shorten', envelope, question: questionFromIntent(request, 'authoring.rewrite'), signal }),
    completeInline: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.complete.inline', envelope, question: questionFromIntent(request, 'authoring.continue'), signal }),
    reviewSelection: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.review.selection', envelope, question: questionFromIntent(request, 'authoring.emergence'), signal }),
    reviewChapter: ({ request, envelope, signal }) => runAuthoringModelStep({ taskId: 'authoring.review.chapter', envelope, question: questionFromIntent(request, 'authoring.advance'), signal })
  }),
  // 叙事意图（spec §9）：真实 NarrativeKernel 执行链——
  // buildNarrativeKernel（消费与左栏/composer 同一份共享现场投影）
  // → 资料索引 + 工具注册表 → orchestrator（BeatPlan 规划隔离、只读资料工具、正文 transcript）。
  // provider 缺失时优雅降级为 typed 错误。
  narrative: createNarrativeSceneWorkflow({
    runTurn: (input) => getAuthoringNarrativeRun().runTurn(input)
  }),
  auxiliary: createAuthoringAuxiliaryWorkflow({
    nextActions: async ({ request, envelope, signal }) => {
      const step = await runAuthoringModelStep({ taskId: 'authoring.next-actions', envelope, question: questionFromIntent(request, 'authoring.next-actions'), signal })
      return { options: parseOptionsFromAdvice(step.advice).map((label) => ({ label })) }
    },
    dialogueOptions: async ({ request, envelope, signal }) => {
      const step = await runAuthoringModelStep({ taskId: 'authoring.dialogue-options', envelope, question: questionFromIntent(request, 'authoring.dialogue-options'), signal })
      return { options: parseOptionsFromAdvice(step.advice).map((label) => ({ label })) }
    },
    emergence: async ({ request, envelope, signal }) => {
      const step = await runAuthoringModelStep({ taskId: 'authoring.emergence', envelope, question: questionFromIntent(request, 'authoring.emergence'), signal })
      let candidate = null
      try {
        candidate = JSON.parse(String(step.advice || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim())
      } catch { /* 降级为纯文本候选 */ }
      return {
        candidates: [candidate && typeof candidate === 'object'
          ? candidate
          : { title: String(step.advice || '').slice(0, 24), content: String(step.advice || '') }]
      }
    },
    compactContext: async ({ request: _request, envelope, signal }) => {
      const step = await runAuthoringModelStep({ taskId: 'authoring.context.compact', envelope, question: '压缩当前场景记忆为简短摘要。', signal })
      return { summary: step.text, newHistory: [] }
    },
    summarizeAsset: async ({ request: _request, envelope, signal }) => {
      const step = await runAuthoringModelStep({ taskId: 'authoring.asset.summarize', envelope, question: '总结选中素材。', signal })
      return { assets: [{ kind: 'inspiration', title: '素材摘要', content: step.text }] }
    }
  })
}
let authoringRuntime = null
let authoringRuntimeProjectId = ''
function getAuthoringRuntime() {
  const projectId = selectedBookId.value || ''
  if (!authoringRuntime || authoringRuntimeProjectId !== projectId) {
    authoringRuntimeProjectId = projectId
    authoringRuntime = createAuthoringCommandRuntime({
      projectId,
      projectRevision: `project:${projectId}`,
      facade: getAuthoringFacade(),
      workflows: authoringWorkflows,
      resolveContext: (input) => getAuthoringNarrativeRun().resolveContext(input),
      resolveTarget: () => ({
        type: wt3ActiveDoc.value ? 'exploration' : 'chapter',
        id: wt3ActiveDoc.value?.id || selectedChapterId.value || '',
        revision: currentDocumentRevision()
      }),
      liveRevision: () => currentDocumentRevision(),
      applyActions: async ({ actions }) => ({ applied: actions.length })
    })
  }
  return authoringRuntime
}
// 最近一次真实 resolveAgentContext ledger：AI 辅助只展示它，不用字数猜测拼装。
const lastExecutionLedger = shallowRef(null)
const lastCompiledContextManifest = shallowRef(null)
const lastContextReceipt = shallowRef(null)
const contextRunPinnedIds = ref([])
const contextRunExcludedIds = ref([])
const authoringRunReferenceSelections = ref([])
const authoringRunReferenceTargetKey = ref('')
const authoringRunReferenceQuery = ref('')
const authoringRunReferenceNotice = ref('')
const authoringRunReferenceCatalogEpoch = ref(0)
const authoringContextPreflightManifest = shallowRef(null)
const authoringContextPreflightLoading = ref(false)
const authoringContextPreflightError = ref('')
const authoringContextPreflightDraft = shallowRef(null)
let authoringContextPreflightVersion = 0
let authoringContextPreflightTimer = null
const authoringRunReferenceCatalog = computed(() => {
  // epoch 由素材写入/手动刷新推进；computed 仍以当前项目和探索文档为作用域。
  void authoringRunReferenceCatalogEpoch.value
  return buildAuthoringRunReferenceCatalog({
    projectId: selectedBookId.value,
    explorations: wt3ExplorationDocs.value,
    assets: listNarrativeAssets({ status: null, projectId: selectedBookId.value || '__no_current_book__' })
  })
})
const reconciledAuthoringRunReferences = computed(() => reconcileAuthoringRunReferenceSelections(
  authoringRunReferenceSelections.value,
  authoringRunReferenceCatalog.value,
  selectedBookId.value
))
function scheduleAuthoringContextPreflight(draft = authoringContextPreflightDraft.value) {
  if (draft) authoringContextPreflightDraft.value = draft
  if (authoringContextPreflightTimer) clearTimeout(authoringContextPreflightTimer)
  if (!blockComposer.open || !blockComposer.target) return
  const version = ++authoringContextPreflightVersion
  authoringContextPreflightLoading.value = true
  authoringContextPreflightError.value = ''
  authoringContextPreflightTimer = setTimeout(async () => {
    authoringContextPreflightTimer = null
    const currentDraft = authoringContextPreflightDraft.value || {}
    const instruction = [currentDraft.instruction, currentDraft.directorNote].filter(Boolean).join('\n')
    let prepared
    try {
      prepared = await getAuthoringRunSessionAdapter().prepareSession({
        taskId: 'authoring.advance',
        request: { intent: {
          instruction,
          operation: currentDraft.operation || 'next-passage',
          invocationTarget: blockComposer.target
        } }
      })
    } catch (error) {
      prepared = { ok: false, reason: String(error?.code || error?.message || 'preflight-failed') }
    }
    if (version !== authoringContextPreflightVersion || !blockComposer.open) return
    authoringContextPreflightLoading.value = false
    if (!prepared?.ok) {
      authoringContextPreflightManifest.value = null
      authoringContextPreflightError.value = prepared?.reason || 'preflight-failed'
      return
    }
    authoringContextPreflightManifest.value = prepared.session.manifest
  }, 180)
}
function addAuthoringRunReference(item) {
  const referenceTarget = blockComposer.target || resolveBlockComposerTarget(notebookSelection.value || {})
  const targetKey = authoringRunReferenceScopeKey(referenceTarget)
  if (authoringRunReferenceTargetKey.value && authoringRunReferenceTargetKey.value !== targetKey) {
    clearAuthoringRunReferences()
  }
  const result = addAuthoringRunReferenceSelection(authoringRunReferenceSelections.value, item)
  if (!result.ok) {
    authoringRunReferenceNotice.value = result.reason === 'limit'
      ? tr('本次最多选择三条参考')
      : result.reason === 'duplicate' ? tr('这条参考已经选过') : tr('这条参考当前不可用')
    return false
  }
  authoringRunReferenceSelections.value = result.selections
  authoringRunReferenceTargetKey.value = targetKey
  authoringRunReferenceNotice.value = ''
  scheduleAuthoringContextPreflight()
  return true
}
function removeAuthoringRunReference(id) {
  authoringRunReferenceSelections.value = removeAuthoringRunReferenceSelection(authoringRunReferenceSelections.value, id)
  authoringRunReferenceNotice.value = ''
  scheduleAuthoringContextPreflight()
}
function refreshAuthoringRunReference(id) {
  authoringRunReferenceCatalogEpoch.value += 1
  authoringRunReferenceSelections.value = refreshAuthoringRunReferenceSelection(
    authoringRunReferenceSelections.value,
    id,
    authoringRunReferenceCatalog.value
  )
  authoringRunReferenceNotice.value = tr('已确认使用来源的最新版本')
  scheduleAuthoringContextPreflight()
}
function clearAuthoringRunReferences() {
  authoringRunReferenceSelections.value = []
  authoringRunReferenceTargetKey.value = ''
  authoringRunReferenceQuery.value = ''
  authoringRunReferenceNotice.value = ''
  authoringContextPreflightVersion += 1
  if (authoringContextPreflightTimer) clearTimeout(authoringContextPreflightTimer)
  authoringContextPreflightTimer = null
  authoringContextPreflightManifest.value = null
  authoringContextPreflightLoading.value = false
  authoringContextPreflightError.value = ''
  authoringContextPreflightDraft.value = null
}
const blockWorkflow = useAuthoringBlockWorkflow({
  selectedBookId,
  selectedChapterId,
  sceneProjection,
  activeDocumentSourceRef: () => activeDocumentSourceRef(),
  isEmptyDocument: () => isEmptyChapter.value,
  getTargetContext: () => ({
    projectId: selectedBookId.value || '',
    documentId: wt3ActiveDoc.value?.id || selectedChapterId.value || '',
    documentRole: wt3ActiveDoc.value ? 'exploration' : 'manuscript',
    chapterId: wt3ActiveDoc.value ? '' : selectedChapterId.value || '',
    document: writingDocument.value,
    documentTextLength: currentChapterDocumentText().length,
    documentRevision: currentDocumentRevision(),
    selection: readLiveWritingSelectionSnapshot(),
    selectionBookmark: notebookEditorRef.value?.captureSelectionBookmark?.() || null
  }),
  defaultTarget: () => notebookSelection.value,
  targetScopeKey: (target) => authoringRunReferenceScopeKey(target),
  referenceTargetKey: () => authoringRunReferenceTargetKey.value,
  setReferenceTargetKey: (key) => { authoringRunReferenceTargetKey.value = key },
  scheduleContextPreflight: () => scheduleAuthoringContextPreflight(),
  preserveSceneIntents: (target) => {
    authoringSceneRunIntents.value = readAuthoringSceneRunIntentsForTarget(authoringSceneRunIntents.value, target)
  },
  clearRunReferences: () => clearAuthoringRunReferences(),
  clearSceneIntents: () => clearAuthoringSceneRunIntents(),
  clearPendingDraft: () => {
    pendingWritingGhost.value = null
    rehearsalDraftSource.value = null
  },
  cancelCopilot: () => writingAgentHost.cancelForToolTakeover(),
  closeIntervention: () => {
    if (interventionComposer.open) closeInterventionComposer({ restoreSelection: false })
  },
  closeCharacterIf: () => {
    if (characterIfActive.value) closeSceneLaboratory({ restoreSelection: false })
  },
  cancelTask: () => authoringTask.cancel(),
  getTurnContext: () => ({
    worldbookStatus: bookWorldbookStatus.value.status,
    worldbookReady: boundWorldbookSyncReady(),
    actorId: sceneActiveActorId.value,
    targetId: sceneDialogueTargetId.value,
    viewpointCharacterId: sceneProjection.value.viewpointCharacter?.id || '',
    sourceRefs: composerSourceRefs.value
  }),
  runTask: (taskId, request) => authoringTask.run(taskId, request),
  dispatchObservers: async ({ outcome, turn }) => {
    const observerTarget = currentAuthoringObserverTarget(outcome.insertedUnitId)
    const observerReceipt = await commitDirectAuthoringObservation({
      text: outcome.text,
      sourceRefs: [...new Set([
        ...turn.sourceRefs,
        ...(observerTarget.unitId ? [`unit:${observerTarget.unitId}`] : [])
      ])],
      ...observerTarget
    })
    if (!observerReceipt) throw new Error('observer-schedule-failed')
  },
  onObserverFailure: () => {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer',
      code: 'AUTHORING_OBSERVER_REFRESH_FAILED',
      message: tr('正文已保存，现场状态将在稍后刷新'),
      retryable: true
    })
    refreshAuthoringObserverState()
  },
  restoreSelection: (bookmark) => restoreBlockSelection(bookmark),
  blurEditor: () => notebookEditorRef.value?.blur?.(),
  focusInstruction: () => nextTick(() => blockComposerRef.value?.focusInstruction?.()),
  hasPendingAdoption: () => Boolean(pendingGhostAdoption.value),
  performAdoption: () => performBlockPreviewAdoption(),
  retryTaskPersist: () => authoringTask.retryPersist(),
  afterRetryPersist: async (outcome) => {
    if (outcome.text) {
      const observerTarget = currentAuthoringObserverTarget(outcome.insertedUnitId)
      const observerReceipt = await commitDirectAuthoringObservation({
        text: outcome.text,
        sourceRefs: [...new Set([
          activeDocumentSourceRef(),
          ...(observerTarget.unitId ? [`unit:${observerTarget.unitId}`] : [])
        ])],
        ...observerTarget
      })
      if (!observerReceipt) throw new Error('observer-schedule-failed')
    }
    refreshAuthoringObserverState()
  },
  shouldCompleteFirstRun: () => firstRunStripVisible.value || Boolean(firstRunPanelHint.value),
  completeFirstRun: () => completeFirstRun(),
  getExplorationContext: () => {
    const experiment = characterIfExperiment.active.value
    const manifest = blockPreview.value?.candidate?.runSession?.manifest
    return {
      ifExperiment: experiment,
      note: [
        experiment ? tr('人物 IF · {value0} 条件：{value1}（作者假设）', { value0: characterIfActiveBranch.value, value1: experiment.branches[characterIfActiveBranch.value].belief }) : '',
        manifest ? tr('来源版本：{value0}', { value0: JSON.stringify(manifest.dependencies || {}) }) : ''
      ].filter(Boolean).join('\n')
    }
  },
  refreshExplorations: (projectId) => wt3RefreshDocs(projectId),
  onIfExplorationSaved: (experiment) => {
    if (characterIfExperiment.active.value !== experiment) return
    ifBranchDrafts.value = { ...ifBranchDrafts.value, [characterIfActiveBranch.value]: null }
    pendingWritingGhost.value = null
    switchIfDraft(characterIfActiveBranch.value === 'A' ? 'B' : 'A')
  },
  notify: (message) => authoringTask.notify(message)
})
const {
  preview: blockPreview,
  draftText: blockDraftText,
  originalText: blockDraftOriginalText,
  previousText: previousBlockDraftText,
  composer: blockComposer,
  failure: composerFailure,
  adoptionBusy: blockAdoptionBusy,
  people: composerPeople,
  sourceRefs: composerSourceRefs,
  resolveTarget: resolveBlockComposerTarget,
  beginRequest: beginBlockRequest,
  invalidateRequest: invalidateBlockRequest,
  resetScope: resetBlockWorkflowScope,
  open: openBlockComposer,
  abandon: abandonBlockComposerWorkflow,
  close: closeBlockComposer,
  dismiss: dismissBlockPreview,
  restoreDraft: restoreBlockDraft,
  run: runAuthoringTurn,
  submit: submitBlockTurn,
  accept: acceptBlockPreview,
  retryPersist: handleRetryAuthoringPersist,
  saveAsExploration: saveBlockDraftAsExploration
} = blockWorkflow
watch([selectedBookId, selectedChapterId, wt3ActiveDocId], () => {
  clearAuthoringRunReferences()
  contextRunPinnedIds.value = []
  contextRunExcludedIds.value = []
  lastCompiledContextManifest.value = null
  lastContextReceipt.value = null
  // 上一次执行的 ledger 描述的是旧作用域的上下文账目，不清会让 AI 面板
  // 在新章节继续展示旧章的 sourceRefs/字数（右栏读错当前对象）。
  lastExecutionLedger.value = null
  // 世界书面板的高亮条目同样绑定旧作用域。
  inspectorWorldbookEntryId.value = ''
  pendingWritingGhost.value = null
  resetBlockWorkflowScope()
  characterIfWorkflow.reset()
  invalidateNotebookAtomicHistory()
  notebookCopilotCanUndo.value = false
})
const authoringTask = useAuthoringTask({
  replaceSelectionTaskIds: ['authoring.rewrite'],
  resolveTarget: (commandId, invocationTarget = null) => {
    if (!selectedBookId.value || (!selectedChapterId.value && !wt3ActiveDoc.value)) return null
    const selection = invocationTarget
      ? {
          start: Number(invocationTarget.markdownFrom ?? invocationTarget.caret ?? 0),
          end: Number(invocationTarget.markdownTo ?? invocationTarget.caret ?? 0),
          text: '',
          hasSelection: false,
          unitId: invocationTarget.unitId || null,
          unitRevision: Number(invocationTarget.unitRevision || 0),
          nodeId: invocationTarget.nodeId || null,
          nodeRevision: Number(invocationTarget.nodeRevision || 0)
        }
      : readLiveWritingSelectionSnapshot()
    const text = currentChapterDocumentText()
    // 冻结目标单元（worldbook scene closure Task 3）：请求发起时锁定插入位置。
    // 选区带有效单元 ID 时用之；否则显式回退文档最后一个单元（targetSource 记录来源）。
    const documentUnits = Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : []
    const tailUnit = documentUnits.at(-1)
    const targetUnitId = invocationTarget?.unitId || selection.unitId || tailUnit?.attrs?.unitId || null
    const targetUnitRevision = selection.unitId
      ? Number(selection.unitRevision || 0)
      : Number(tailUnit?.attrs?.unitRevision || 0)
    return {
      document: {
        text: invocationTarget?.documentText ?? text,
        revision: invocationTarget?.documentRevision || currentDocumentRevision()
      },
      caret: Number.isFinite(invocationTarget?.caret)
        ? Number(invocationTarget.caret)
        : Number.isFinite(selection.end) ? selection.end : text.length,
      selection,
      targetUnitId,
      targetUnitRevision,
      targetNodeId: selection.nodeId || null,
      targetNodeRevision: Number(selection.nodeRevision || 0),
      targetSource: selection.unitId ? 'selection' : (tailUnit ? 'document-tail-fallback' : 'empty-document'),
      request: {
        context: buildWritingTaskContext({}, selection),
        invocationTarget,
        documentRole: wt3ActiveDoc.value ? 'exploration' : 'manuscript',
        question: AUTHORING_COMMAND_QUESTIONS[commandId] || AUTHORING_COMMAND_QUESTIONS['authoring.insert'],
        hasSelection: selection.hasSelection,
        selectedText: selection.text || ''
      }
    }
  },
  execute: async ({ taskId, request, signal }) => {
    const runtime = getAuthoringRuntime()
    if (!getAuthoringFacade()) throw Object.assign(new Error(tr('请先选择章节')), { code: 'AGENT_NO_TARGET' })
    const intent = {
      instruction: request.question,
      hasSelection: Boolean(request.hasSelection),
      selectedText: String(request.selectedText || '').slice(0, 400),
      caret: request.caret ?? null,
      invocationTarget: request.invocationTarget || null
    }
    if (request.turn) {
      intent.turn = request.turn
    }
    if (request.authoringRunSession) {
      // F1-5 scene laboratory reuses the exact frozen C1 session that produced
      // the chosen direction; normal composer turns continue to prepare once.
      intent.authoringRunSession = request.authoringRunSession
    }
    const outcome = await runtime.execute({
      taskId,
      intent,
      signal
    })
    if (outcome.status === 'stale') {
      const generatedAction = (outcome.result?.actions || [])
        .find((action) => action?.type === 'text-insert' || action?.type === 'text-patch')
      const dependencyIssues = outcome.result?.dependencyIssues?.length
        ? outcome.result.dependencyIssues
        : [{
            dependency: `document:${String(outcome.request?.target?.id || 'current')}`,
            reason: outcome.staleReason || 'revision-changed',
            expected: String(outcome.request?.target?.revision || ''),
            actual: currentDocumentRevision()
          }]
      const contextReceipt = attachDependencyIssuesToReceipt(
        outcome.result?.contextReceipt || null,
        dependencyIssues
      )
      throw Object.assign(new Error(tr('文档已更新，本次结果未写入；可重新执行该命令')), {
        code: 'AGENT_RESULT_STALE',
        adoptable: false,
        generatedText: String(generatedAction?.content || ''),
        contextManifest: outcome.result?.contextManifest || null,
        contextReceipt,
        contextCallReceipts: Array.isArray(outcome.result?.contextCallReceipts)
          ? outcome.result.contextCallReceipts
          : [],
        contextOutcome: {
          ...(outcome.result?.contextOutcome || {}),
          status: 'stale',
          dependencyIssues
        },
        dependencyIssues
      })
    }
    const actions = outcome.result?.actions || []
    const textAction = actions.find((action) => action.type === 'text-insert' || action.type === 'text-patch')
    if (textAction) {
      const payload = { text: String(textAction.content || '') }
      if (request.turn) {
        // 回合结果带请求来源：一次生成 = 一个带完整来源的 writingUnit。
        payload.originRefs = [buildAuthoringTurnOriginRef({
          requestId: `turn:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
          turnKind: request.turn.kind,
          taskId,
          documentRevision: String(request.target?.revision || '')
        })]
      }
      payload.contextManifest = outcome.result?.contextManifest || null
      payload.contextOutcome = outcome.result?.contextOutcome || null
      payload.contextReceipt = outcome.result?.contextReceipt || null
      payload.contextCallReceipts = Array.isArray(outcome.result?.contextCallReceipts)
        ? outcome.result.contextCallReceipts
        : []
      payload.authoringRunSession = outcome.result?.authoringRunSession || null
      payload.executionLedger = outcome.ledger || null
      payload.sceneDelta = outcome.result?.sceneDelta || null
      payload.outlineDelta = outcome.result?.outlineDelta || null
      payload.boundaryHints = Array.isArray(outcome.result?.boundaryHints) ? outcome.result.boundaryHints : []
      payload.boundaryHintSource = outcome.result?.boundaryHintSource || ''
      payload.selectedDirectionReceipt = outcome.result?.selectedDirectionReceipt || null
      return payload
    }
    if (outcome.result?.suggestions?.length) return {
      suggestions: outcome.result.suggestions,
      executionLedger: outcome.ledger || null,
      contextReceipt: outcome.result?.contextReceipt || null
    }
    if (outcome.result?.candidates?.length) return {
      candidates: outcome.result.candidates,
      executionLedger: outcome.ledger || null,
      contextReceipt: outcome.result?.contextReceipt || null
    }
    return { text: '', executionLedger: outcome.ledger || null, contextReceipt: outcome.result?.contextReceipt || null }
  },
  applyWritingUnit: ({ text, originRefs, afterUnitId, afterNodeId, expectedUnitRevision }) => {
    const editor = notebookEditorRef.value
    if (!editor || !notebookEditorActive.value) return { ok: false, reason: 'editor-inactive' }
    if (typeof editor.insertAsNewWritingUnit !== 'function') return { ok: false, reason: 'editor-unsupported' }
    const outcome = editor.insertAsNewWritingUnit({ text, originRefs, afterUnitId, afterNodeId, expectedUnitRevision })
    if (outcome?.ok) clearNotebookAtomicRedoHistory()
    return outcome
  },
  stageWritingUnit: ({
    text,
    originRefs,
    afterUnitId,
    afterNodeId,
    expectedUnitRevision,
    expectedNodeRevision,
    contextManifest,
    contextOutcome,
    contextReceipt,
    contextCallReceipts,
    authoringRunSession,
    sceneDelta,
    outlineDelta,
    boundaryHints = [],
    boundaryHintSource = '',
    selectedDirectionReceipt = null,
    operation = 'next-passage'
  }) => {
    writingAgentHost.cancelForToolTakeover()
    const next = createWritingGhostCandidate({
      kind: operation === 'rewrite-unit' ? 'rewrite' : 'narrative',
      text,
      target: currentGhostTarget({
        unitId: afterUnitId,
        nodeId: afterNodeId,
        unitRevision: expectedUnitRevision,
        nodeRevision: expectedNodeRevision
      }),
      manifest: contextManifest || lastCompiledContextManifest.value,
      runOutcome: contextOutcome || { status: 'completed' },
      runSession: authoringRunSession,
      contextCallReceipts,
      originRefs,
      sceneDelta,
      outlineDelta
    })
    pendingWritingGhost.value = claimWritingGhostCandidate(pendingWritingGhost.value, next).pending
    if (!pendingWritingGhost.value) return false
    if (blockDraftText.value?.trim()) previousBlockDraftText.value = blockDraftText.value
    blockDraftOriginalText.value = String(text || '').trim()
    blockDraftText.value = blockDraftOriginalText.value
    blockComposer.failure = null
    blockComposer.staleResult = null
    blockPreview.value = Object.freeze({
      text, originRefs, afterUnitId, afterNodeId, expectedUnitRevision, expectedNodeRevision,
      operation: operation === 'rewrite-unit' ? 'rewrite-unit' : 'next-passage',
      candidateId: pendingWritingGhost.value.id,
      candidate: pendingWritingGhost.value,
      hasDerivedEffects: Boolean(
        pendingWritingGhost.value.sceneDelta
        || pendingWritingGhost.value.outlineDelta
        || collectAuthoringSceneRunIntentEffects(pendingWritingGhost.value.runSession, {
          receipts: [contextReceipt, ...pendingWritingGhost.value.contextCallReceipts].filter(Boolean)
        }).intentIds.length
      ),
      contextReceipt,
      contextCallReceipts: pendingWritingGhost.value.contextCallReceipts,
      boundaryHints: Object.freeze(boundaryHints.map((hint) => Object.freeze({ ...hint }))),
      boundaryHintSource,
      selectedDirectionReceipt
    })
    return true
  },
  applyPatchToEditor: (patch) => {
    const editor = notebookEditorRef.value
    if (!editor || !notebookEditorActive.value) return false
    clearNotebookAtomicRedoHistory()
    if (patch.from !== patch.to && typeof editor.replaceTextRange === 'function') {
      return Boolean(editor.replaceTextRange(patch.from, patch.to, patch.text, { origin: 'writing-agent' }))
    }
    if (typeof editor.insertPlainText === 'function') return Boolean(editor.insertPlainText(patch.text, { origin: 'writing-agent' }))
    return false
  },
  restoreFullText: (text) => {
    markdownContent.value = String(text ?? '')
    syncMarkdownToEditor()
  },
  persist: () => {
    return wt3ActiveDoc.value ? wt3PersistActiveDoc()?.ok === true : saveCurrentChapter()
  },
  getLiveRevision: () => currentDocumentRevision(),
  onResultAccepted: (result) => {
    lastExecutionLedger.value = result?.executionLedger || null
    lastCompiledContextManifest.value = result?.contextManifest || null
    lastContextReceipt.value = result?.contextReceipt || null
  },
  // 作用域真源：迟到结果与撤销回执只对发起时的书/章/构思文档有效。
  getScopeKey: () => `${selectedBookId.value}|${wt3ActiveDocId.value || ''}|${selectedChapterId.value || ''}`
})
const authoringTaskBusy = authoringTask.busy
const authoringTaskNotice = authoringTask.notice
onBeforeUnmount(() => {
  authoringTask.cancel()
  sceneLaboratoryWorkflow.cancelRequest()
})
// —— 块间输入区：composer 发标准 turn request，页面负责契约校验与执行链。 ——
const characterIfWorkflow = useAuthoringCharacterIfWorkflow({
  projectId: selectedBookId,
  sceneLaboratory,
  draft: {
    preview: blockPreview,
    pendingGhost: pendingWritingGhost,
    text: blockDraftText,
    originalText: blockDraftOriginalText,
    previousText: previousBlockDraftText,
    composer: blockComposer,
    openEntry: () => {
      ifEntryOpen.value = true
      openInspectorTool('rehearsal')
    }
  },
  isAuthoringTaskBusy: () => authoringTaskBusy.value,
  isAdoptionBusy: () => Boolean(pendingGhostAdoption.value || blockAdoptionBusy.value),
  getSettings: () => getResolvedApiSettings(),
  collectLiveDependencies: (session) => getAuthoringRunSessionAdapter().collectLiveDependencies(session),
  getComposerSourceRefs: () => composerSourceRefs.value,
  generateDraft: (payload) => runAuthoringTurn(payload, beginBlockRequest()),
  closeOverlay: () => closeRehearsalOverlay()
})
const {
  experiment: characterIfExperiment,
  active: characterIfActive,
  branches: characterIfBranches,
  activeBranch: characterIfActiveBranch,
  branchDrafts: ifBranchDrafts,
  busy: ifBusy,
  baselineRun: ifBaselineRun,
  settings: ifSettings,
  plans: ifPlans,
  planBranch: planIfBranch,
  selectDirection: selectIfDirection,
  switchDraft: switchIfDraft,
  retryDraft: retryIfDraft,
  writeBranchDraft: writeIfBranchDraft,
  start: startCharacterIfExperiment
} = characterIfWorkflow
const {
  composer: interventionComposer,
  ghostTeleportReady: interventionGhostTeleportReady,
  lastUmbrellaReceipt: lastInterventionUmbrellaReceipt,
  impactGroups: interventionImpactGroups,
  candidateGroups: interventionCandidateGroups,
  candidateReviewPendingCount: interventionCandidateReviewPendingCount,
  rehearsalScopeResult: interventionRehearsalScopeResult,
  rehearsalDirections: interventionRehearsalDirections,
  ghosts: interventionGhosts,
  batchGhosts: interventionBatchGhosts,
  ghostInDual: interventionGhostInDual,
  displayTarget: interventionDisplayTarget,
  clearRehearsalResult: clearInterventionRehearsalResult
} = useAuthoringInterventionState({ selectedChapterId })
// Keep the original composers and their drafts alive; only their display host
// moves. The manuscript keeps its anchor and the existing adoption owner.
async function revealRehearsalComposer() {
  openInspectorTool('rehearsal')
  await nextTick()
  if (window.matchMedia('(max-width: 1180px)').matches) writingInspectorRef.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
watch([() => blockComposer.open, () => interventionComposer.open], ([blockOpen, interventionOpen], previous = []) => {
  if ((blockOpen && !previous[0]) || (interventionOpen && !previous[1])) void revealRehearsalComposer()
})
let authoringInterventionRunner = null
let authoringInterventionRehearsalRunner = null
const historyInteractionLocked = computed(() => blockAdoptionBusy.value || Boolean(pendingGhostAdoption.value) || atomicHistoryBusy.value)
const activeWritingMutationLocked = computed(() => (
  historyInteractionLocked.value && (activeWritingPane.value === 'main' || dualSharesMainDocument())
))
const isEmptyChapter = computed(() => !String(markdownContent.value || '').trim())
const firstRunCharacterCount = computed(() => (
  (boundWorldbook.value?.entries || []).filter((entry) => entry?.type === 'character').length
))
// 首次指引的唯一状态 owner 在 useAuthoringFirstRun;这里只喂真实产物并承接导航意图。
// 创建 run 不再结束指引:发起试演后提示按真实回应/试稿状态继续,归右栏同一位置。
const {
  stageIndex: firstRunStageIndex,
  stripVisible: firstRunStripVisible,
  panelHint: firstRunPanelHint,
  activate: activateFirstRun,
  dismiss: dismissFirstRunForBook,
  complete: completeFirstRun,
  reopen: reopenFirstRun
} = useAuthoringFirstRun({
  bookId: selectedBookId,
  artifacts: computed(() => ({
    hasManuscript: !isEmptyChapter.value,
    hasCharacters: firstRunCharacterCount.value > 0,
    hasPresentCast: (sceneProjection.value.presentCharacters || []).length > 0,
    rehearsalStarted: Boolean(rehearsal.run.value),
    hasResponse: rehearsal.steps.value.length > 0,
    hasDraft: rehearsalDraftState.value === 'same-route'
  }))
})
const firstRunGuideStage = firstRunStageIndex
const firstRunGuideVisible = computed(() => Boolean(
  firstRunStripVisible.value
  && selectedBookId.value
  && selectedChapterId.value
  && !wt3ActiveDoc.value
))
function clearFirstRunGuideQuery() {
  if (String(route.query.guide || '') !== 'first-run') return
  const query = { ...route.query }
  delete query.guide
  void router.replace({ name: 'authoring', query })
}
function dismissFirstRunGuide() {
  dismissFirstRunForBook()
  clearFirstRunGuideQuery()
}
function reopenFirstRunGuidance() {
  if (reopenFirstRun() !== 'need-book') return
  void router.push('/')
}
// 更多/帮助里的“备份与恢复”:AppShell 已挂载全局设置,直达存储分区。
const appSettings = useSettingsPopup()
function openBackupSettings() {
  appSettings.open('storage')
}
// 推演失败就地回程:打开模型连接检查,关闭设置后焦点回到“检查模型连接”,
// 草拟行动保持不动,可继续重试。
function openRehearsalConnectionSettings() {
  appSettings.open('ai')
}
function advanceFirstRunGuide(stage) {
  if (stage === 1) {
    notebookEditorRef.value?.focus?.({ scrollIntoView: false })
    return
  }
  if (stage === 2) {
    selectInspectorTool('characters')
    return
  }
  if (stage === 3) {
    if (!activeWritingUnitId.value) notebookEditorRef.value?.focus?.({ scrollIntoView: false })
    nextTick(() => handleSceneEditRequest({ axis: 'people' }))
    return
  }
  selectInspectorTool('rehearsal')
}
// query 与当前书哪个先就绪都激活一次;已关闭/已完成的书由 composable 拒绝。
watch([selectedBookId, () => String(route.query.guide || '')], ([bookIdValue, guide]) => {
  if (bookIdValue && guide === 'first-run') activateFirstRun(bookIdValue)
}, { immediate: true })
watch(blockDraftText, () => {
  if (!blockPreview.value || pendingGhostAdoption.value) return
  blockComposer.failure = null
  blockComposer.staleResult = null
})
function authoringRunReferenceScopeKey(target = {}) {
  return [target.projectId, target.documentRole, target.documentId, target.unitId, target.nodeId]
    .map((value) => String(value || ''))
    .join(':')
}
function buildInterventionPositionIndex() {
  const index = buildCurrentAuthoringSearchIndex()
  if (!index?.ok) return null
  return buildWritingAuthoringPositionIndex({
    projectId: selectedBookId.value,
    chapterOrderRevision: index.chapterOrderRevision,
    documents: index.documents.map((source, order) => ({
      projectId: selectedBookId.value,
      documentId: source.documentId || source.sourceId,
      documentRole: source.sourceKind === 'exploration' ? 'exploration' : 'manuscript',
      chapterId: source.chapterId || '',
      title: source.title,
      order,
      documentRevision: source.sourceRevision,
      documentSchemaRevision: source.document?.revision,
      document: source.document
    }))
  })
}
function getAuthoringInterventionRunner() {
  if (authoringInterventionRunner) return authoringInterventionRunner
  const evidenceReader = createAuthoringKnowledgeQuerySession()
  authoringInterventionRunner = createAuthoringInterventionSession({
    prepareEvidence: (input) => evidenceReader.prepare({
      ...input,
      liveSource: captureMainDocumentSource(),
      sceneProjection: sceneProjection.value
    }),
    collectEvidenceRevisions: (session) => evidenceReader.collectCurrentRevisions(session, {
      liveSource: captureMainDocumentSource(),
      sceneProjection: sceneProjection.value
    }),
    readPositionIndex: () => buildInterventionPositionIndex(),
    readTypedLinks: ({ projectId, target, positionIndex }) => readAuthoringOutlineCausalLinks({
      projectId,
      target,
      positionIndex,
      outlineNodes: wt3OutlineNodes.value,
      outlineEdges: wt3OutlineEdges.value
    })
  })
  return authoringInterventionRunner
}
function getAuthoringInterventionRehearsalRunner() {
  if (authoringInterventionRehearsalRunner) return authoringInterventionRehearsalRunner
  authoringInterventionRehearsalRunner = createAuthoringInterventionRehearsalRun({
    reconcileSession: (session, options) => getAuthoringInterventionRunner().reconcile(session, options),
    generateDrafts: generateAuthoringInterventionRehearsalDrafts
  })
  return authoringInterventionRehearsalRunner
}
function readCurrentRehearsalTarget(locator = {}) {
  const position = buildInterventionPositionIndex()?.entries?.find((entry) => (
    String(entry.documentId || '') === String(locator.documentId || '')
    && String(entry.unitId || '') === String(locator.unitId || '')
    && String(entry.nodeId || '') === String(locator.nodeId || '')
  ))
  if (!position) return null
  return {
    ...locator,
    documentRevision: position.documentRevision,
    unitRevision: position.unitRevision,
    nodeRevision: position.nodeRevision
  }
}
const collaborationWorkflow = useAuthoringCollaborationWorkflow({
  enabled: import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true',
  canStart: () => interventionComposer.phase === 'ready' && Boolean(interventionComposer.session) && Boolean(interventionRehearsalScopeResult.value?.ok),
  session: () => interventionComposer.session,
  scope: () => interventionRehearsalScopeResult.value,
  runRehearsal: () => getAuthoringInterventionRehearsalRunner(),
  readTarget: readCurrentRehearsalTarget,
  sourceRef: sourceRefForAuthoringEvidenceLocator,
  reconcileEvidence: (session) => getAuthoringInterventionRunner().reconcile(session),
  openInspector: () => openInspectorTool('collaboration', { pinned: true }),
  isInspectorActive: () => activeInspectorTool.value === 'collaboration',
  closeInspector: () => closeWritingInspector(),
  leaveInspector: () => {
    closeWritingInspector({ restoreSurface: false })
    activeInspectorTool.value = 'annotations'
  },
  notify: (message) => authoringTask.notify(message),
  applyPromotion: async (prepared) => {
    interventionComposer.open = true
    interventionComposer.target = prepared.session.target
    interventionComposer.originalText = prepared.session.intervention?.before || ''
    interventionComposer.session = prepared.session
    interventionComposer.rehearsalSelection = prepared.selection
    interventionComposer.rehearsalResult = prepared.result
    interventionComposer.phase = 'ghosts'
    interventionComposer.activeGhostId = prepared.ghostIds?.[0] || ''
    if (interventionComposer.activeGhostId) await selectInterventionGhost(interventionComposer.activeGhostId)
  }
})
const {
  enabled: authoringCollaborationEnabled,
  ReviewSurface: RehearsalReviewSurface,
  state: authoringRehearsalState,
  busy: authoringRehearsalBusy,
  error: authoringRehearsalError,
  active: authoringRehearsalActive,
  open: openAuthoringRehearsalInspector,
  closeInspector: closeActiveWritingInspector,
  start: startAuthoringRehearsalRoom,
  propose: proposeAuthoringRehearsalDirection,
  vote: voteAuthoringRehearsalProposal,
  generate: generateAuthoringRehearsalProposal,
  promote: promoteAuthoringRehearsalBranch,
  queueAdoptionReceipt: queueAuthoringRehearsalAdoptionReceipt,
  copyInvite: copyAuthoringRehearsalInvite,
  leave: leaveAuthoringRehearsalRoom,
  dispose: disposeAuthoringRehearsalController
} = collaborationWorkflow
const interventionWorkflow = useAuthoringInterventionWorkflow({
  state: interventionComposer,
  scopeResult: interventionRehearsalScopeResult,
  ghosts: interventionGhosts,
  clearResult: clearInterventionRehearsalResult,
  isAuthoringTaskBusy: () => authoringTaskBusy.value,
  getSessionRunner: () => getAuthoringInterventionRunner(),
  getRehearsalRunner: () => getAuthoringInterventionRehearsalRunner(),
  selectGhost: (ghostId) => selectInterventionGhost(ghostId),
  close: (options) => closeInterventionComposer(options)
})
const {
  prepare: prepareAuthoringIntervention,
  reviewCandidate: reviewInterventionCandidate,
  selectDirection: selectInterventionRehearsal,
  rehearse: runInterventionRehearsal,
  updateGhost: updateInterventionGhost,
  retryGhost: retryInterventionGhost,
  discardGhost: discardInterventionGhost
} = interventionWorkflow
function openInterventionComposer(target = notebookSelection.value) {
  if (authoringTaskBusy.value || wt3ActiveDoc.value) return false
  const frozenTarget = resolveBlockComposerTarget(target || {})
  const node = getWritingNodeById(frozenTarget.nodeId)
  const originalText = getWritingNodeText(node).trim()
  if (!frozenTarget.unitId || !frozenTarget.nodeId || !originalText) return false
  if (sceneLaboratory.open) closeSceneLaboratory({ restoreSelection: false })
  if (blockComposer.open) abandonBlockComposer({ restoreSelection: false })
  writingAgentHost.cancelForToolTakeover()
  interventionWorkflow.cancel()
  interventionComposer.open = true
  interventionComposer.phase = 'draft'
  interventionComposer.target = frozenTarget
  interventionComposer.originalText = originalText
  interventionComposer.session = null
  interventionComposer.notice = ''
  interventionComposer.evidenceCount = 0
  interventionComposer.candidateReviews = {}
  interventionComposer.rehearsalSelection = null
  clearInterventionRehearsalResult()
  notebookEditorRef.value?.blur?.()
  return true
}
function closeInterventionComposer({ restoreSelection = true } = {}) {
  if (!interventionComposer.open) return false
  if (interventionComposer.pendingAdoption) {
    interventionComposer.persistError = interventionComposer.persistError || tr('正文修改尚未保存，请先重试保存。')
    return false
  }
  const bookmark = interventionComposer.target?.selectionBookmark
  interventionWorkflow.cancel()
  interventionComposer.open = false
  interventionComposer.phase = 'draft'
  interventionComposer.target = null
  interventionComposer.originalText = ''
  interventionComposer.session = null
  interventionComposer.notice = ''
  interventionComposer.evidenceCount = 0
  interventionComposer.candidateReviews = {}
  interventionComposer.rehearsalSelection = null
  clearInterventionRehearsalResult()
  if (restoreSelection) nextTick(() => restoreBlockSelection(bookmark))
  return true
}
async function selectInterventionGhost(ghostId = '') {
  if (interventionComposer.pendingAdoption && interventionComposer.pendingAdoption.ghostId !== ghostId) return false
  const ghost = interventionGhosts.value.find((item) => item.id === ghostId)
  if (!ghost) return false
  const documentId = String(ghost.target?.documentId || '')
  interventionGhostTeleportReady.value = false
  interventionComposer.activeGhostId = ghost.id
  if (documentId && documentId !== String(selectedChapterId.value || '')) {
    if (!openChapterInDual(documentId)) return false
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await nextTick()
      if (typeof document !== 'undefined' && document.getElementById('authoring-dual-block-gap')) break
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    interventionGhostTeleportReady.value = Boolean(
      typeof document !== 'undefined' && document.getElementById('authoring-dual-block-gap')
    )
    await nextTick()
    dualPaneRef.value?.focusWritingUnit?.(ghost.target?.unitId)
    document.getElementById('authoring-dual-block-gap')?.scrollIntoView?.({ block: 'center' })
  }
  await nextTick()
  if (!interventionGhostInDual.value) {
    notebookEditorRef.value?.focusWritingUnit?.(ghost.target?.unitId)
    document.getElementById('authoring-block-gap')?.scrollIntoView?.({ block: 'center' })
  }
  return true
}
function readMainInterventionTarget(expected = {}) {
  if (String(expected.documentId || '') !== String(selectedChapterId.value || '')) return null
  const unit = (writingDocument.value?.content || []).find((item) => (
    String(item?.attrs?.unitId || '') === String(expected.unitId || '')
  ))
  const node = (unit?.content || []).find((item) => (
    String(item?.attrs?.nodeId || '') === String(expected.nodeId || '')
  ))
  if (!unit || !node) return null
  return {
    projectId: String(selectedBookId.value || ''),
    documentId: String(selectedChapterId.value || ''),
    documentRole: 'manuscript',
    chapterId: String(selectedChapterId.value || ''),
    unitId: String(unit.attrs.unitId || ''),
    nodeId: String(node.attrs.nodeId || ''),
    documentRevision: currentDocumentRevision(),
    unitRevision: String(unit.attrs.unitRevision ?? ''),
    nodeRevision: String(node.attrs.nodeRevision ?? ''),
    nodeText: getWritingNodeText(node),
    document: cloneAuthoringRunValue(writingDocument.value),
    markdown: String(markdownContent.value || ''),
    title: String(currentChapterTitle.value || '')
  }
}
function readLiveInterventionAdoptionTarget(ghost) {
  const expected = ghost?.target || {}
  const surface = String(expected.documentId || '') === String(selectedChapterId.value || '')
    ? readMainInterventionTarget(expected)
    : dualPaneRef.value?.readLiveInterventionTarget?.(expected) || null
  if (!surface) return null
  // F3 session 的 documentRevision 来自全书 position index；主/副编辑器各自
  // 的 surface revision 只用于窗口恢复。采用核对必须回到同一 canonical 口径。
  const position = buildInterventionPositionIndex()?.entries?.find((entry) => (
    String(entry.documentId || '') === String(expected.documentId || '')
    && String(entry.unitId || '') === String(expected.unitId || '')
    && String(entry.nodeId || '') === String(expected.nodeId || '')
  ))
  if (!position) return null
  return {
    ...surface,
    documentRevision: position.documentRevision,
    unitRevision: position.unitRevision,
    nodeRevision: position.nodeRevision,
    nodeText: position.text
  }
}
async function persistPendingInterventionAdoption() {
  const pending = interventionComposer.pendingAdoption
  if (!pending || interventionComposer.adoptingGhostId) return false
  interventionComposer.adoptingGhostId = pending.ghostId
  interventionComposer.persistError = ''
  const inMain = String(pending.adoption.target.documentId) === String(selectedChapterId.value || '')
  let persisted = false
  try {
    persisted = inMain
      ? saveCurrentChapter({ automaticHistory: false })
      : dualPaneRef.value?.persistInterventionAdoption?.() === true
  } catch {
    persisted = false
  }
  if (!persisted) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('保存失败，草稿与正文修改仍保留；不会再次生成。')
    return false
  }
  await nextTick()
  const live = readLiveInterventionAdoptionTarget(pending.ghost)
  const finalized = markAuthoringInterventionAdoptionPersisted(pending.adoption, live)
  if (!finalized.ok) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('保存后无法核对目标修订，请保留当前页面并重试核对。')
    return false
  }
  lastInterventionUmbrellaReceipt.value = createAuthoringInterventionSingleReceipt(finalized.receipt)
  try {
    const observerReceipt = await commitDirectAuthoringObservation({
      text: pending.adoption.afterText,
      sourceRefs: pending.adoption.sourceRefs,
      memoryProjectId: selectedBookId.value,
      documentId: pending.adoption.target.documentId,
      chapterId: pending.adoption.target.chapterId,
      unitId: pending.adoption.target.unitId,
      unitRevision: Number(live?.unitRevision || 0),
      sourceDocumentRevision: live?.documentRevision || ''
    })
    if (!observerReceipt) throw new Error('observer-schedule-failed')
  } catch {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer',
      code: 'AUTHORING_INTERVENTION_OBSERVER_FAILED',
      message: tr('正文已保存，相关记忆将在稍后刷新'),
      retryable: true
    })
  }
  queueAuthoringRehearsalAdoptionReceipt(1)
  const discarded = discardAuthoringInterventionGhost(interventionComposer.rehearsalResult, pending.ghostId)
  interventionComposer.pendingAdoption = null
  interventionComposer.adoptingGhostId = ''
  interventionComposer.persistError = ''
  if (!discarded.ok || !discarded.result.drafts.length) {
    closeInterventionComposer({ restoreSelection: false })
  } else {
    interventionComposer.rehearsalResult = discarded.result
    await selectInterventionGhost(discarded.result.drafts[0].id)
  }
  authoringTask.notify(tr('这一处已采用并保存；其他排演草稿未改变'), { canUndo: true })
  return true
}
async function adoptInterventionGhost(ghostId = '') {
  if (interventionComposer.phase !== 'ghosts' || interventionComposer.pendingAdoption || interventionComposer.adoptingGhostId) return false
  const ghost = interventionGhosts.value.find((item) => item.id === ghostId)
  if (!ghost || ghost.status !== 'fresh') return false
  interventionComposer.adoptingGhostId = ghost.id
  interventionComposer.persistError = ''
  const reconciled = await getAuthoringInterventionRunner().reconcile(interventionComposer.session)
  if (!reconciled?.ok || reconciled.stale) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.notice = tr('原文或依据已经变化；已有草稿可查看，但不能采用。')
    interventionComposer.rehearsalResult = Object.freeze({
      ...interventionComposer.rehearsalResult,
      status: 'stale',
      adoptable: false,
      drafts: Object.freeze(interventionGhosts.value.map((draft) => Object.freeze({ ...draft, status: 'stale' })))
    })
    return false
  }
  const live = readLiveInterventionAdoptionTarget(ghost)
  const prepared = prepareAuthoringInterventionAdoption({
    session: interventionComposer.session,
    result: interventionComposer.rehearsalResult,
    ghost,
    liveTarget: live
  })
  if (!prepared.ok) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.notice = tr('目标正文已经变化，请重新核对后再排演。')
    interventionComposer.persistError = tr('目标正文已经变化，请重新核对后再排演。')
    return false
  }
  const protection = authoringHistory.recordProtection({
    chapterId: prepared.adoption.target.chapterId,
    chapterTitle: live.title,
    reason: 'before-adoption',
    document: live.document,
    markdown: live.markdown,
    annotations: prepared.adoption.target.documentId === String(selectedChapterId.value || '') ? chapterAnnotations.value : [],
    operation: 'intervention-single-group',
    transactionId: prepared.adoption.id
  })
  if (!protection.ok) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('无法保存采用前版本，正文没有变化。')
    return false
  }
  if (prepared.adoption.target.documentId === String(selectedChapterId.value || '')) {
    writingSnapshots.value = authoringHistory.refreshSnapshots(prepared.adoption.target.chapterId)
  }
  const changed = prepared.adoption.target.documentId === String(selectedChapterId.value || '')
    ? notebookEditorRef.value?.replaceNodeRanges?.([prepared.adoption.patch], { origin: 'writing-agent' }) === true
    : dualPaneRef.value?.applyInterventionAdoption?.(prepared.adoption.patch) === true
  if (!changed) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('编辑器没有接受这次修改，正文未变化。')
    return false
  }
  cancelContentSave()
  interventionComposer.pendingAdoption = Object.freeze({ ghostId: ghost.id, ghost, adoption: prepared.adoption })
  interventionComposer.adoptingGhostId = ''
  return persistPendingInterventionAdoption()
}
function protectInterventionUmbrella(receipt, book) {
  const chapterIds = [...new Set((receipt?.groups || []).map((group) => group.target?.chapterId).filter(Boolean))]
  for (const chapterId of chapterIds) {
    const chapter = (book?.chapters || []).find((item) => String(item?.id || '') === String(chapterId))
    if (!chapter?.editorDocument) return false
    const protection = authoringHistory.recordProtection({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      reason: 'before-adoption',
      document: chapter.editorDocument,
      markdown: chapter.content || getWritingDocumentMarkdown(chapter.editorDocument),
      annotations: chapter.annotations || [],
      operation: 'intervention-umbrella',
      transactionId: receipt.id
    })
    if (!protection.ok) return false
  }
  return true
}
function reloadInterventionBookSurfaces(nextBooks) {
  books.value = nextBooks
  const nextBook = books.value.find((book) => String(book.id) === String(selectedBookId.value))
  chapters.value = nextBook?.chapters || []
  if (!wt3ActiveDoc.value) {
    reloadMainChapterAfterSearchReplace(chapters.value.find((chapter) => (
      String(chapter.id) === String(selectedChapterId.value)
    )))
  }
  const dualSource = dualPaneRef.value?.getActiveSource?.()
  if (dualSource?.kind === 'chapter') {
    const dualChapter = chapters.value.find((chapter) => String(chapter.id) === String(dualSource.id))
    if (dualChapter?.editorDocument) {
      dualPaneRef.value?.reloadSearchSource?.({
        sourceKind: 'chapter',
        sourceId: dualChapter.id,
        title: dualChapter.title,
        document: dualChapter.editorDocument,
        markdown: dualChapter.content
      })
    }
  }
  writingBlockHistory.value = selectedChapterId.value ? authoringHistory.refreshBlockHistory(selectedChapterId.value) : []
  writingSnapshots.value = selectedChapterId.value ? authoringHistory.refreshSnapshots(selectedChapterId.value) : []
}
function recordInterventionBlockHistory(beforeBook, afterBook, receipt, source) {
  for (const chapterId of [...new Set((receipt?.groups || []).map((group) => group.target?.chapterId).filter(Boolean))]) {
    const before = (beforeBook?.chapters || []).find((chapter) => String(chapter.id) === String(chapterId))
    const after = (afterBook?.chapters || []).find((chapter) => String(chapter.id) === String(chapterId))
    if (!before?.editorDocument || !after?.editorDocument) continue
    const entries = buildWritingBlockHistoryEntries({
      chapterId,
      chapterTitle: after.title,
      previousDocument: before.editorDocument,
      nextDocument: after.editorDocument,
      source
    })
    if (entries.length) authoringHistory.appendBlockEntries(entries)
  }
}
async function adoptAllInterventionGhosts() {
  const ghosts = interventionBatchGhosts.value
  if (interventionComposer.phase !== 'ghosts' || ghosts.length < 2
    || interventionComposer.pendingAdoption || interventionComposer.adoptingGhostId) return false
  interventionComposer.adoptingGhostId = 'all'
  interventionComposer.persistError = ''
  if (!saveCurrentChapter({ automaticHistory: false }) || dualPaneRef.value?.prepareClose?.() === false) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('当前正文无法保存，批量采用尚未执行。')
    return false
  }
  const reconciled = await getAuthoringInterventionRunner().reconcile(interventionComposer.session)
  if (!reconciled?.ok || reconciled.stale) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.notice = tr('原文或依据已经变化；已有草稿可查看，但不能批量采用。')
    interventionComposer.rehearsalResult = Object.freeze({
      ...interventionComposer.rehearsalResult,
      status: 'stale',
      adoptable: false,
      drafts: Object.freeze(interventionGhosts.value.map((draft) => Object.freeze({ ...draft, status: 'stale' })))
    })
    return false
  }
  const latestBooks = loadWritingBooks()
  const latestBook = latestBooks.find((book) => String(book.id) === String(selectedBookId.value))
  const prepared = prepareAuthoringInterventionUmbrella({
    session: interventionComposer.session,
    result: interventionComposer.rehearsalResult,
    ghosts,
    positionIndex: buildInterventionPositionIndex(),
    book: latestBook
  })
  if (!prepared.ok) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = prepared.reason === 'intervention-umbrella-target-conflict'
      ? tr('多个草稿指向同一位置，请逐一选择后采用。')
      : tr('部分目标已经变化，批量采用没有写入正文。')
    return false
  }
  if (!protectInterventionUmbrella(prepared.receipt, latestBook)) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('无法保存采用前版本，批量采用没有写入正文。')
    return false
  }
  const nextBooks = latestBooks.map((book) => (
    String(book.id) === String(prepared.receipt.projectId) ? prepared.nextBook : book
  ))
  if (!saveWritingBooksDurable(nextBooks).ok) {
    interventionComposer.adoptingGhostId = ''
    interventionComposer.persistError = tr('保存失败，批量采用没有写入正文；草稿仍已保留。')
    return false
  }
  recordInterventionBlockHistory(latestBook, prepared.nextBook, prepared.receipt, 'intervention-umbrella')
  reloadInterventionBookSurfaces(nextBooks)
  invalidateNotebookAtomicHistory()
  authoringTask.invalidateReceipt()
  try {
    const first = prepared.receipt.groups[0]
    const observerReceipt = await commitDirectAuthoringObservation({
      text: prepared.receipt.groups.map((group) => group.afterText).join('\n\n'),
      sourceRefs: [...new Set(prepared.receipt.groups.flatMap((group) => group.sourceRefs || []))],
      memoryProjectId: selectedBookId.value,
      documentId: first.target.documentId,
      chapterId: first.target.chapterId,
      unitId: first.target.unitId,
      unitRevision: Number(first.afterUnitRevision || 0),
      sourceDocumentRevision: String(first.afterDocumentRevision || '')
    })
    if (!observerReceipt) throw new Error('observer-schedule-failed')
  } catch {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer', code: 'AUTHORING_INTERVENTION_OBSERVER_FAILED',
      message: tr('正文已保存，相关记忆将在稍后刷新'), retryable: true
    })
  }
  queueAuthoringRehearsalAdoptionReceipt(prepared.receipt.groupCount)
  lastInterventionUmbrellaReceipt.value = prepared.receipt
  const changedCount = prepared.receipt.groupCount
  const chapterCount = prepared.receipt.chapterCount
  closeInterventionComposer({ restoreSelection: false })
  authoringTask.notify(tr('已采用 {value0} 处 · {value1} 章；未修改现场、大纲或世界事实', { value0: changedCount, value1: chapterCount }), { canUndo: true })
  return true
}
async function undoInterventionUmbrella() {
  const receipt = lastInterventionUmbrellaReceipt.value
  if (!receipt || String(receipt.projectId) !== String(selectedBookId.value)) return false
  if (!saveCurrentChapter({ automaticHistory: false }) || dualPaneRef.value?.prepareClose?.() === false) {
    authoringTask.notify(tr('当前正文保存失败，尚未撤销这次介入'))
    return false
  }
  const latestBooks = loadWritingBooks()
  const latestBook = latestBooks.find((book) => String(book.id) === String(receipt.projectId))
  const undo = prepareAuthoringInterventionUmbrellaUndo({ receipt, book: latestBook })
  if (!undo.ok) {
    lastInterventionUmbrellaReceipt.value = null
    authoringTask.notify(tr('采用后的目标又被修改，不能越过新修改撤销'))
    return false
  }
  const nextBooks = latestBooks.map((book) => (
    String(book.id) === String(receipt.projectId) ? undo.nextBook : book
  ))
  if (!saveWritingBooksDurable(nextBooks).ok) {
    authoringTask.notify(tr('撤销保存失败，正文仍保持采用后的状态'))
    return false
  }
  const undoneReceipt = { ...receipt, groups: undo.undoneGroups }
  recordInterventionBlockHistory(latestBook, undo.nextBook, undoneReceipt, 'intervention-umbrella-undo')
  reloadInterventionBookSurfaces(nextBooks)
  lastInterventionUmbrellaReceipt.value = null
  try {
    await gameStore.handleAuthoringProseUndo({
      sourceRefs: [...new Set(undo.undoneGroups.flatMap((group) => group.sourceRefs || []))],
      revision: currentDocumentRevision(),
      reason: 'intervention-umbrella-undo'
    })
  } catch {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer', code: 'AUTHORING_INTERVENTION_UNDO_OBSERVER_FAILED',
      message: tr('正文已撤销，记忆状态将在稍后刷新'), retryable: true
    })
  }
  authoringTask.notify(undo.unsafeGroups.length
    ? tr('已撤销 {value0} 处；{value1} 处有后续修改，未覆盖', { value0: undo.undoneGroups.length, value1: undo.unsafeGroups.length })
    : tr('已撤销本次介入的 {value0} 处正文修改', { value0: undo.undoneGroups.length }))
  return true
}
watch(() => currentDocumentRevision(), (revision) => {
  if (!interventionComposer.open || !interventionComposer.session) return
  if (interventionComposer.pendingAdoption || interventionComposer.adoptingGhostId) return
  if (String(interventionComposer.target?.documentRevision || '') === String(revision || '')) return
  interventionWorkflow.markDocumentStale()
})
watch(knowledgeAssistantRevisionSignal, () => interventionWorkflow.reconcileKnowledgeChange())
onBeforeUnmount(() => {
  interventionWorkflow.cancel()
  disposeAuthoringRehearsalController()
})
function restoreBlockSelection(bookmark) {
  notebookEditorRef.value?.restoreSelectionBookmark?.(bookmark)
}
function abandonBlockComposer({ restoreSelection = false } = {}) {
  return abandonBlockComposerWorkflow({ shouldRestoreSelection: restoreSelection })
}
const { perform: performBlockPreviewAdoption } = useAuthoringGhostAdoptionWorkflow({
  preview: blockPreview,
  draftText: blockDraftText,
  originalText: blockDraftOriginalText,
  pendingAdoption: pendingGhostAdoption,
  composer: blockComposer,
  rehearsalDraftSource,
  composerSourceRefs,
  rehearsalDraftSourceIsCurrent: (source) => rehearsal.draftSourceIsCurrent(source),
  collectLiveDependencies: (session) => getAuthoringRunSessionAdapter().collectLiveDependencies(session),
  buildLiveDependencyRevisions: () => buildLiveContextDependencyRevisions(),
  currentGhostTarget: (target) => currentGhostTarget(target),
  cancelPendingSaves: () => {
    cancelContentSave()
    cancelTitleSave()
  },
  cancelContentSave: () => cancelContentSave(),
  persistProtectionBase: () => saveCurrentChapter({ automaticHistory: false }),
  recordProtection: ({ reason, operation, transactionId }) => authoringHistory.recordProtection({
    chapterId: selectedChapterId.value,
    chapterTitle: currentChapterTitle.value,
    reason,
    document: writingDocument.value,
    markdown: markdownContent.value,
    annotations: chapterAnnotations.value,
    operation,
    transactionId
  }),
  refreshSnapshots: () => {
    writingSnapshots.value = authoringHistory.refreshSnapshots(selectedChapterId.value)
  },
  currentBodyRevision: () => currentDocumentBodyRevision(),
  currentDocumentRevision: () => currentDocumentRevision(),
  readSceneBeatDraft: () => blockDraftRef.value?.getSceneBeatDraft?.(),
  applyToEditor: ({ preview, candidate, adoptedText, beatDraft, proposedUnits }) => {
    const sceneId = String(candidate.runSession?.sceneProjection?.sceneId
      || `scene-beat-${String(beatDraft?.fingerprint || candidate.id).slice(0, 24)}`)
    return preview.operation === 'rewrite-unit'
      ? notebookEditorRef.value?.replaceWritingUnit?.({
          text: adoptedText,
          originRefs: preview.originRefs,
          unitId: preview.afterUnitId,
          expectedUnitRevision: preview.expectedUnitRevision
        })
      : notebookEditorRef.value?.insertWritingUnitBatch?.({
          units: proposedUnits,
          originRefs: preview.originRefs,
          sceneId,
          beatFingerprint: beatDraft?.fingerprint || candidate.id,
          afterUnitId: preview.afterUnitId,
          expectedUnitRevision: preview.expectedUnitRevision
        })
  },
  readProjectState: () => ({
    worldbookId: selectedBookWorldbookId.value,
    sceneAnchors: sceneAnchors.value,
    outlineNodes: wt3OutlineNodes.value,
    outlineEdges: wt3OutlineEdges.value
  }),
  rollbackEditorWrite: () => {
    applyingAtomicNotebookHistory = true
    try {
      notebookEditorRef.value?.undo?.()
    } finally {
      applyingAtomicNotebookHistory = false
    }
    fenceNotebookHistory()
  },
  invalidatePreviousReceipts: () => {
    clearNotebookAtomicRedoHistory()
    authoringTask.invalidateReceipt()
  },
  applyProjectDeltas: (deltas) => {
    sceneAnchors.value = deltas.sceneAnchors
    wt3OutlineNodes.value = deltas.outlineNodes
    const book = books.value.find((item) => String(item.id) === String(selectedBookId.value))
    if (book) book.outlineNodes = deltas.outlineNodes
  },
  readInsertedUnit: (unitId) => cloneAuthoringRunValue(
    (writingDocument.value?.content || []).find((unit) => unit?.attrs?.unitId === unitId)
  ),
  persistAdoption: (exploration) => (
    exploration ? wt3PersistActiveDoc()?.ok === true : saveCurrentChapter({ preservePageOutline: true })
  ),
  observeAdoption: async (adoption) => {
    const unitId = adoption.insertedUnitIds?.at(-1) || adoption.insertedUnitId
    const unit = (writingDocument.value?.content || []).find((item) => item?.attrs?.unitId === unitId)
    const receipt = await commitDirectAuthoringObservation({
      text: adoption.adoptedText,
      sourceRefs: adoption.sourceRefs,
      memoryProjectId: selectedBookId.value,
      documentId: selectedChapterId.value,
      chapterId: selectedChapterId.value,
      unitId,
      unitRevision: Number(unit?.attrs?.unitRevision || 0),
      sourceDocumentRevision: currentDocumentRevision()
    })
    if (!receipt) throw new Error('observer-schedule-failed')
  },
  reportObserverFailure: () => {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer', code: 'AUTHORING_OBSERVER_REFRESH_FAILED',
      message: tr('正文已保存，现场状态将在稍后刷新'), retryable: true
    })
  },
  consumeCharacterIfBranch: () => {
    const otherBranch = characterIfActive.value ? (characterIfActiveBranch.value === 'A' ? 'B' : 'A') : null
    if (!otherBranch) return null
    ifBranchDrafts.value = { ...ifBranchDrafts.value, [characterIfActiveBranch.value]: null }
    characterIfExperiment.stale('adopted-other-branch')
    sceneLaboratory.notice = tr('正文已变化。另一支仅保留供阅读或留作构思，重新对照需重新核对现场。')
    return otherBranch
  },
  clearAdoptedDraft: () => {
    blockPreview.value = null
    rehearsalDraftSource.value = null
    blockDraftText.value = ''
    blockDraftOriginalText.value = ''
    pendingWritingGhost.value = null
    pendingGhostAdoption.value = null
    clearAuthoringSceneRunIntents()
  },
  captureRehearsalAdoption: ({ committedReceipt, draftSource }) => {
    rehearsalMemoryWorkflow.capture({
      adoptionReceipt: committedReceipt,
      draftSource,
      formalLocator: {
        bookId: selectedBookId.value,
        chapterId: selectedChapterId.value,
        writingUnitId: committedReceipt.insertedUnitIds?.at(-1) || committedReceipt.insertedUnitId,
        revision: committedReceipt.afterDocumentRevision,
        text: committedReceipt.adoptedText
      }
    })
  },
  commitUndoReceipt: (receipt) => pushNotebookAtomicUndoReceipt({ kind: 'ghost-adoption', ...receipt }),
  fenceEditorHistory: () => fenceNotebookHistory(),
  finishComposer: () => {
    blockComposer.open = false
    blockComposer.target = null
    blockComposer.failure = null
    blockComposer.staleResult = null
    blockComposer.initialInstruction = ''
    clearAuthoringRunReferences()
  },
  showImpact: (impact, focus) => showAdoptionImpact(impact, focus),
  notifySuccess: ({ adoption, exploration }) => {
    authoringTask.notify(exploration
      ? (adoption.operation === 'rewrite-unit' ? tr('当前探索文本块已替换') : tr('推演已纳入探索稿'))
      : (adoption.operation === 'rewrite-unit' ? tr('当前文本块已替换') : tr('推演已纳入正文')), { canUndo: true })
  },
  restoreOtherIfBranch: (branch) => {
    if (!blockAdoptionBusy.value && ifBranchDrafts.value[branch]) switchIfDraft(branch)
  }
})
// 复验修复 3：行动者/对象优先从共享投影解析（世界书角色的名字不依赖旧 encountered 列表）。
// Task 9：现场人物名单（投影在场 + 视角），供 Composer 行动者/对象选择。
// 本次 AI 参考：低敏感度 ledger，只描述采用/截断，不含任何原文。
const contextLedger = computed(() => {
  const ledger = lastExecutionLedger.value
  if (ledger?.parts?.length) return ledger
  const parts = []
  const chapter = books.value
    .find((item) => item.id === selectedBookId.value)
    ?.chapters?.find((item) => item.id === selectedChapterId.value)
  if (chapter) {
    parts.push({
      kind: 'prose',
      status: 'included',
      chars: Number(chapter.wordCount || 0),
      sourceRefs: [`chapter:${chapter.id}`]
    })
  }
  return { parts }
})
// 派生观察器 UI 状态：常规观察保持安静，只有 typed exception 需要用户裁决。
const authoringExceptions = ref([])
// 观察器刷新失败警告：出现在现场条/检查器状态里，绝不要求用户重新生成正文。
const authoringObserverWarning = shallowRef(null)
function refreshAuthoringObserverState() {
  const derived = gameStore.getAuthoringDerivedState?.() || []
  // 保留观察的正文摘要、来源与 revision 证据（Task 5 Step 5）：
  // 调度事件只是诊断账本；现场必须读取真正完成的 derived-state，并只收
  // 当前书/章。关系提取器产出姓名时，在绑定世界书中解析为稳定角色 ID。
  authoringObservations.value = derived
    .filter((observation) => (
      String(observation?.projectId || '') === selectedBookId.value
      && String(observation?.chapterId || '') === String(selectedChapterId.value || '')
    ))
    .map((observation) => ({
      id: String(observation.id || ''),
      kind: String(observation.kind || ''),
      text: String(observation.text || observation.summary || ''),
      subjectId: String(observation.subjectId || resolveObserverCharacterId(observation.subject) || ''),
      objectId: String(observation.objectId || resolveObserverCharacterId(observation.object) || ''),
      relation: String(observation.relation || ''),
      unitId: String(observation.unitId || ''),
      unitRevision: Number(observation.unitRevision || 0),
      documentRevision: String(observation.documentRevision || ''),
      sourceRefs: Array.isArray(observation.sourceRefs) ? observation.sourceRefs : [],
      status: String(observation.status || 'applied')
    }))
  // typed exception（locked-conflict / identity-ambiguity / destructive-retcon）进入审阅队列。
  const knownIds = new Set(authoringExceptions.value.map((item) => item.id))
  const pending = (gameStore.getAuthoringObserverExceptions?.() || [])
    .filter((exception) => !knownIds.has(exception.id))
    .map((exception) => ({
      id: exception.id,
      reason: exception.reason,
      summary: exception.summary || exception.text || ''
    }))
  if (pending.length) authoringExceptions.value.push(...pending)
}
function resolveObserverCharacterId(value) {
  const label = String(value || '').trim()
  if (!label) return ''
  const entry = (boundWorldbook.value?.entries || []).find((candidate) => (
    candidate?.type === 'character'
    && [candidate.name, ...(Array.isArray(candidate.keys) ? candidate.keys : [])]
      .some((name) => String(name || '').trim() === label)
  ))
  return String(entry?.id || '')
}
function currentAuthoringObserverTarget(unitId = activeWritingUnitId.value) {
  const unit = (writingDocument.value?.content || [])
    .find((candidate) => String(candidate?.attrs?.unitId || '') === String(unitId || ''))
  return {
    memoryProjectId: selectedBookId.value,
    documentId: wt3ActiveDoc.value?.id || selectedChapterId.value,
    chapterId: selectedChapterId.value,
    unitId: String(unit?.attrs?.unitId || unitId || ''),
    unitRevision: Number(unit?.attrs?.unitRevision || 0),
    sourceDocumentRevision: currentDocumentRevision()
  }
}
let stopAuthoringObserverResultSubscription = null
onMounted(() => {
  stopAuthoringObserverResultSubscription = gameStore.subscribeAuthoringObserverResults?.(() => {
    refreshAuthoringObserverState()
  }) || null
})
onBeforeUnmount(() => {
  stopAuthoringObserverResultSubscription?.()
  stopAuthoringObserverResultSubscription = null
})
const {
  visibleExceptions: authoringVisibleExceptions,
  resolveException: resolveAuthoringException
} = useAuthoringObservers({
  observations: authoringObservations,
  exceptions: authoringExceptions,
  onResolve: (exceptionId) => {
    authoringExceptions.value = authoringExceptions.value.filter((item) => item.id !== exceptionId)
  }
})
function cancelAuthoringTask() {
  invalidateBlockRequest()
  authoringTask.cancel()
}
// —— 受控记忆投影：普通候选静默提示，异常才进审阅面板 ——
const authoringMemoryNotice = ref(null)
const memoryReviewOpen = ref(false)
const authoringMemoryCandidates = ref([])
let memoryNoticeTimer = null
// 行内写作助手的页面编排 owner:光标/组合态/触发调度/互斥仲裁收口在
// host;agent(composable)只保留请求身份、timer 与候选内核。
const writingAgentHost = useInlineWritingAgentHost({
  cursorRef: copilotCursorPos,
  compositionRef: writingCompositionActive,
  agent: {
    cancel: copilotCancel,
    suppress: suppressWritingAgent,
    finishComposition: finishWritingAgentComposition,
    onInput: writingAgentOnInput,
    consume: writingAgentConsume,
    visible: copilotVisible,
    requesting: copilotRequesting,
    enabled: copilotEnabled
  },
  readCursorSnapshot: readLiveWritingCursorSnapshot,
  buildAgentInput: buildPassiveAgentInput,
  readInteractionSignals: () => ({
    dualComposing: dualCompositionActive.value,
    modalOpen: showNewBookModal.value
      || assetInboxOpen.value
      || illustratorOpen.value
      || reviewPanelOpen.value
      || searchPanelOpen.value
      || showQuickWords.value
      || showNameGen.value
      || memoryReviewOpen.value
      || annotationComposerOpen.value
      || contextMenu.value.show,
    commandMenuOpen: notebookCommandMenuOpen.value,
    inspectorEditing: inspectorOpen.value
      && activeInspectorTool.value === 'scene'
      && inspectorDetailState.value?.kind === 'scene-edit',
    blockPreviewOpen: Boolean(blockPreview.value),
    blockComposerOpen: blockComposer.open,
    quickWordActive: quickWordSuggestions.value.length > 0
  })
})
const writingInteractionOwner = writingAgentHost.interactionOwner
function showMemoryNotice(text, count = 0, reviewable = false) {
  authoringMemoryNotice.value = { text, count, reviewable }
  if (memoryNoticeTimer) clearTimeout(memoryNoticeTimer)
  memoryNoticeTimer = setTimeout(() => {
    authoringMemoryNotice.value = null
    memoryNoticeTimer = null
  }, 4000)
}
function refreshAuthoringMemoryCandidates() {
  const currentProjectId = String(selectedBookId.value || '')
  const belongsToCurrentProject = (item) => (
    item.scope === 'project' && String(item.scopeId || '') === currentProjectId
  )
  const pending = (listMemoryCandidates({ status: 'pending' }) || []).filter(belongsToCurrentProject)
  const staleSources = listMemoryCandidates({ status: 'stale' }).filter((item) => (
    belongsToCurrentProject(item)
    && (
      item.metadata?.staleReason === 'source-revision-changed'
      && !item.metadata?.supersededBy
    )
  ))
  const exceptions = [...pending, ...staleSources]
  // 默认只显示异常：冲突、来源失效、身份歧义。
  authoringMemoryCandidates.value = exceptions.filter((item) => (
    item.status === 'stale'
    || (Array.isArray(item.conflictsWith) && item.conflictsWith.length)
    || item.metadata?.staleReason
    || item.metadata?.migrationWarning === 'identity-ambiguity'
  ))
}
async function rememberSelectionFromMenu() {
  selectionActionsVisible.value = false
  const selectionText = window.getSelection?.()?.toString?.() || ''
  if (!selectionText.trim()) return
  try {
    const documentSourceRef = activeDocumentSourceRef()
    const unitSourceRef = notebookSelection.value?.unitId
      ? `unit:${notebookSelection.value.unitId}`
      : ''
    const result = await gameStore.rememberAuthoringSelection({
      content: selectionText,
      // 与召回同口径：显式记住挂在当前书，而不是 active worldbook。
      projectId: selectedBookId.value || '',
      sourceRefs: [documentSourceRef, unitSourceRef].filter(Boolean),
      sourceRevision: currentDocumentRevision()
    })
    showMemoryNotice(result?.candidate ? tr('已加入待确认事实') : tr('没有可提取的事实'), result?.candidate ? 0 : 0)
    refreshAuthoringMemoryCandidates()
  } catch {
    showMemoryNotice(tr('记忆保存失败，请重试'))
  }
}
async function confirmAuthoringMemoryCandidate(candidateId) {
  // 确认 = 显式升级为 accepted 权威；缺来源 revision 的 derived 记录会被拒绝。
  const confirmed = confirmMemoryCandidate(candidateId)
  if (!confirmed) {
    showMemoryNotice(tr('该候选缺少来源引用或来源版本，无法确认为记忆'))
  }
  refreshAuthoringMemoryCandidates()
  if (!authoringMemoryCandidates.value.length) memoryReviewOpen.value = false
}
async function rejectAuthoringMemoryCandidate(candidateId) {
  rejectMemoryCandidate(candidateId)
  refreshAuthoringMemoryCandidates()
  if (!authoringMemoryCandidates.value.length) memoryReviewOpen.value = false
}
function pinAuthoringMemoryCandidate(candidateId) {
  updateMemoryCandidate(candidateId, { importanceOverride: 1 })
}
function demoteAuthoringMemoryCandidate(candidateId) {
  updateMemoryCandidate(candidateId, { importanceOverride: 0.25 })
}
// append-only 替换：新 revision 带 supersedes[]，旧条目统一 stale。
function supersedeAuthoringMemoryCandidate(candidateId) {
  const result = replaceMemoryCandidateConflicts(candidateId)
  if (!result?.success) {
    showMemoryNotice(tr('没有可替换的冲突记忆'))
  }
  refreshAuthoringMemoryCandidates()
  if (!authoringMemoryCandidates.value.length) memoryReviewOpen.value = false
  return result
}
// append-only 合并：合并内容成为新 revision，旧条目统一 stale。
function mergeAuthoringMemoryCandidate(candidateId) {
  const result = mergeMemoryCandidateConflicts(candidateId)
  if (!result?.success) {
    showMemoryNotice(result?.reason === 'no-conflicts' ? tr('没有可合并的冲突记忆') : tr('合并失败'))
  }
  refreshAuthoringMemoryCandidates()
  if (!authoringMemoryCandidates.value.length) memoryReviewOpen.value = false
  return result
}
function parseMemorySourceRef(value) {
  if (typeof value !== 'string') return { type: '', id: '' }
  const separator = value.indexOf(':')
  return separator > 0
    ? { type: value.slice(0, separator), id: value.slice(separator + 1) }
    : { type: '', id: '' }
}
function canJumpToMemorySource(value) {
  return ['chapter', 'unit', 'exploration'].includes(parseMemorySourceRef(value).type)
}
function findMemoryUnitLocation(unitId) {
  const currentUnit = (writingDocument.value?.content || []).find((unit) => (
    String(unit?.attrs?.unitId || '') === String(unitId || '')
  ))
  if (currentUnit && selectedChapterId.value) {
    return { bookId: selectedBookId.value, chapterId: selectedChapterId.value, unitId }
  }
  for (const book of books.value) {
    for (const chapter of book.chapters || []) {
      if ((chapter.editorDocument?.content || []).some((unit) => (
        String(unit?.attrs?.unitId || '') === String(unitId || '')
      ))) return { bookId: book.id, chapterId: chapter.id, unitId }
    }
  }
  return null
}
function openMemoryChapterSource(chapterId) {
  const found = findChapterAcrossBooks(chapterId)
  if (!found) return false
  if (String(found.book.id) !== String(selectedBookId.value)) {
    return openBookAtChapter(found.book.id, chapterId)
  }
  if (String(selectedChapterId.value) !== String(chapterId)) return selectChapter(chapterId)
  nextTick(() => notebookEditorRef.value?.focus?.())
  return true
}
function jumpToMemorySource(item) {
  const refs = (item?.sourceRefs || []).map(parseMemorySourceRef)
  const source = ['unit', 'exploration', 'chapter']
    .map((type) => refs.find((ref) => ref.type === type && ref.id))
    .find(Boolean)
  if (!source) return false
  memoryReviewOpen.value = false
  if (source.type === 'chapter') return openMemoryChapterSource(source.id)
  if (source.type === 'exploration') {
    const owner = books.value.find((book) => listExplorationDocuments(book.id)
      .some((document) => String(document.id) === String(source.id)))
    if (!owner) return false
    if (String(owner.id) !== String(selectedBookId.value) && !openBook(owner.id)) return false
    return Boolean(openExplorationDoc(source.id))
  }
  const location = findMemoryUnitLocation(source.id)
  if (!location || !openMemoryChapterSource(location.chapterId)) return false
  nextTick(() => nextTick(() => notebookEditorRef.value?.focusWritingUnit?.(location.unitId)))
  return true
}
function openAuthoringKnowledgeEvidence(evidence) {
  const locator = evidence?.locator
  if (!locator || String(evidence?.projectId || '') !== String(selectedBookId.value || '')) {
    authoringTask.notify(tr('这条依据不属于当前作品，未打开'))
    return false
  }
  // 点击依据是作者主动改变阅读位置，不是临时 inspector 的焦点借用。
  // 一旦开始导航就作废旧返回点，避免随后关闭助手把作者拉回点击前选区。
  clearInspectorReturnSurface()
  void knowledgeAssistant.refreshStaleness()
  const closeNarrowAssistant = (
    (locator.kind === 'manuscript' || locator.kind === 'scene')
    && inspectorOpen.value
    && activeInspectorTool.value === 'ai'
    && typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 720px)')?.matches
  )
  if (closeNarrowAssistant) {
    closeWritingInspector({ restoreSurface: false })
    nextTick(() => navigateAuthoringKnowledgeEvidence(evidence))
    return true
  }
  return navigateAuthoringKnowledgeEvidence(evidence)
}
function navigateAuthoringKnowledgeEvidence(evidence) {
  const locator = evidence?.locator
  if (!locator) return false
  if (locator.kind === 'manuscript' || locator.kind === 'scene') {
    activeWritingPane.value = 'main'
    const chapterId = String(locator.chapterId || '')
    if (!chapterId || (chapterId !== String(selectedChapterId.value || '') && !selectChapter(chapterId))) {
      authoringTask.notify(tr('原文章节已删除或暂时无法打开'))
      return false
    }
    nextTick(() => nextTick(() => {
      if (locator.nodeId && Number.isFinite(Number(locator.start))) {
        notebookEditorRef.value?.selectNodeRange?.(
          locator.nodeId,
          Number(locator.start) || 0,
          locator.nodeId,
          Number(locator.end) || Number(locator.start) || 0
        )
      } else if (locator.nodeId) notebookEditorRef.value?.focusNode?.(locator.nodeId)
      else if (locator.unitId) notebookEditorRef.value?.focusWritingUnit?.(locator.unitId)
    }))
    return true
  }
  if (locator.kind === 'worldbook-entry') {
    if (String(locator.worldbookId || '') !== String(boundWorldbook.value?.id || '')) {
      authoringTask.notify(tr('设定已删除或与当前作品解绑'))
      return false
    }
    openWorldbookMentionDetail(locator.entryId)
    return true
  }
  if (locator.kind === 'outline-node') {
    const exists = wt3OutlineNodes.value.some((node) => String(node?.id || '') === String(locator.nodeId || ''))
    if (!exists) {
      authoringTask.notify(tr('大纲节点已删除'))
      return false
    }
    inspectorOutlineNodeId.value = ''
    selectInspectorTool('outline')
    nextTick(() => { inspectorOutlineNodeId.value = String(locator.nodeId) })
    return true
  }
  if (locator.kind === 'exploration') {
    if (!openExplorationDoc(locator.documentId)) {
      authoringTask.notify(tr('速记已删除或暂时无法打开'))
      return false
    }
    return true
  }
  if (locator.kind === 'memory-source') {
    const memory = listMemoryCandidates({ status: null }).find((item) => String(item?.id || '') === String(locator.memoryId || ''))
    if (!memory || !jumpToMemorySource(memory)) {
      authoringTask.notify(tr('记忆的原始来源已不可用'))
      return false
    }
    return true
  }
  if (locator.kind === 'history') {
    const historyNodeId = String(locator.historyNodeId || locator.historyId || '')
    if (openProjectSettingsSurface('map', { historyNodeId })) return true
    router.push({ name: 'settings-world-map', query: { historyNodeId } })
    return true
  }
  return false
}
function closeMemoryReview() {
  memoryReviewOpen.value = false
}
onMounted(() => {
  window.addEventListener('memory-candidate-created', handleMemoryCandidateCreated)
  refreshAuthoringMemoryCandidates()
})
onBeforeUnmount(() => {
  window.removeEventListener('memory-candidate-created', handleMemoryCandidateCreated)
  if (memoryNoticeTimer) clearTimeout(memoryNoticeTimer)
  clearAdoptionImpact()
})
function handleMemoryCandidateCreated(event) {
  const detail = event?.detail || {}
  if (detail.scope !== 'project' || String(detail.scopeId || '') !== String(selectedBookId.value || '')) return
  refreshAuthoringMemoryCandidates()
  // 常规自动派生只更新安静的全局记忆入口；只有真实冲突/来源异常
  // 才在当前书的 AI 检查器里给出一次可打开的聚合提示。
  if (!detail.attention || !authoringMemoryCandidates.value.length) return
  const count = authoringMemoryCandidates.value.length
  showMemoryNotice(tr('有 {count} 条记忆冲突待确认', { count }), count, true)
}
watch(selectedBookId, () => {
  lastInterventionUmbrellaReceipt.value = null
  refreshAuthoringMemoryCandidates()
  quickWordEnabledIds.value = []
  showQuickWords.value = false
  memoryReviewOpen.value = false
  authoringMemoryNotice.value = null
  if (memoryNoticeTimer) {
    clearTimeout(memoryNoticeTimer)
    memoryNoticeTimer = null
  }
})
function applyGhostAdoptionDeltaState(receipt, direction) {
  const redo = direction === 'redo'
  sceneAnchors.value = normalizeSceneAnchors(redo ? receipt.appliedAnchors : receipt.previousAnchors)
  wt3OutlineNodes.value = normalizeOutlineNodes(redo ? receipt.appliedOutlineNodes : receipt.previousOutlineNodes)
  const book = books.value.find((item) => String(item.id) === String(selectedBookId.value))
  if (book) book.outlineNodes = wt3OutlineNodes.value
}
function persistGhostAdoptionHistory(receipt) {
  return receipt.documentRole === 'exploration'
    ? wt3PersistActiveDoc()?.ok === true
    : saveCurrentChapter({ preservePageOutline: true })
}
function ghostDocumentMatchesReceipt(receipt, direction) {
  const redo = direction === 'redo'
  if (receipt.operation === 'rewrite-unit') {
    return currentDocumentContainsGhostUnit(receipt)
  }
  return currentDocumentBodyRevision() === (redo ? receipt.afterBodyRevision : receipt.beforeBodyRevision)
    && (redo ? currentDocumentContainsGhostUnit(receipt) : currentDocumentContainsNoGhostUnits(receipt))
}
async function undoGhostAdoption() {
  const receipt = lastGhostAdoptionReceipt.value
  if (!hasGhostAdoptionUndoBoundary.value) return false
  if (!canUndoGhostAdoption.value) {
    authoringTask.notify(tr('当前场或大纲已变化，无法只撤正文；请先处理这些变更'))
    return false
  }
  writingAgentHost.notifyHistory('historyUndo')
  atomicHistoryBusy.value = true
  applyingAtomicNotebookHistory = true
  try {
    const restored = receipt.operation === 'rewrite-unit'
      ? notebookEditorRef.value?.restoreWritingUnitSnapshot?.({
          unitId: receipt.insertedUnitId,
          snapshot: receipt.beforeUnitSnapshot
        })
      : notebookEditorRef.value?.undo?.()
    if (receipt.operation === 'rewrite-unit' ? !restored?.ok : !restored) {
      authoringTask.notify(receipt.operation === 'rewrite-unit'
        ? tr('无法恢复重写前文本块：{value0}', { value0: restored?.reason || 'editor-unavailable' })
        : tr('当前编辑历史不可用，未执行撤销'))
      return false
    }
    if (!ghostDocumentMatchesReceipt(receipt, 'undo')) {
      if (receipt.operation === 'rewrite-unit') {
        notebookEditorRef.value?.restoreWritingUnitSnapshot?.({ unitId: receipt.insertedUnitId, snapshot: receipt.afterUnitSnapshot })
      } else notebookEditorRef.value?.redo?.()
      fenceNotebookHistory()
      authoringTask.notify(tr('撤销历史与推演事务不一致，已恢复正文并隔离旧历史'))
      return false
    }
    applyGhostAdoptionDeltaState(receipt, 'undo')
    if (!persistGhostAdoptionHistory(receipt)) {
      if (receipt.operation === 'rewrite-unit') {
        notebookEditorRef.value?.restoreWritingUnitSnapshot?.({ unitId: receipt.insertedUnitId, snapshot: receipt.afterUnitSnapshot })
      } else notebookEditorRef.value?.redo?.()
      applyGhostAdoptionDeltaState(receipt, 'redo')
      authoringTask.notify(tr('撤销保存失败，正文与当前场已恢复到撤销前'))
      return false
    }
    if (receipt.documentRole !== 'exploration') {
      try {
        await gameStore.handleAuthoringProseUndo({
          sourceRefs: receipt.operation === 'rewrite-unit'
            ? [receipt.observationSourceRef]
            : (receipt.insertedUnitIds?.length ? receipt.insertedUnitIds : [receipt.insertedUnitId])
                .map((unitId) => `unit:${unitId}`),
          revision: currentDocumentRevision(),
          reason: 'ghost-adoption-undo'
        })
      } catch {
        authoringObserverWarning.value = normalizeAuthoringFailure({
          phase: 'observer', code: 'AUTHORING_OBSERVER_REFRESH_FAILED',
          message: tr('正文已撤销，记忆状态将在稍后刷新'), retryable: true
        })
      }
    }
    const historyReceipt = receipt.operation === 'rewrite-unit'
      ? Object.freeze({
          ...receipt,
          beforeUnitSnapshot: cloneAuthoringRunValue((writingDocument.value?.content || [])
            .find((unit) => unit?.attrs?.unitId === receipt.insertedUnitId))
        })
      : receipt
    notebookAtomicUndoReceipts.value = notebookAtomicUndoReceipts.value.slice(0, -1)
    notebookAtomicRedoReceipts.value = [...notebookAtomicRedoReceipts.value, historyReceipt]
    if (receipt.operation === 'rewrite-unit') fenceNotebookHistory()
    authoringTask.notify(receipt.operation === 'rewrite-unit'
      ? tr('已恢复重写前的文本块')
      : tr('已同时撤销推演正文、当前场与大纲变更'))
    return true
  } finally {
    applyingAtomicNotebookHistory = false
    atomicHistoryBusy.value = false
  }
}
async function redoGhostAdoption() {
  const receipt = lastGhostUndoReceipt.value
  if (!hasGhostAdoptionRedoBoundary.value) return false
  if (!canRedoGhostAdoption.value) {
    authoringTask.notify(tr('当前场或大纲已变化，无法安全重做这次推演'))
    return false
  }
  writingAgentHost.notifyHistory('historyRedo')
  atomicHistoryBusy.value = true
  applyingAtomicNotebookHistory = true
  try {
    const restored = receipt.operation === 'rewrite-unit'
      ? notebookEditorRef.value?.restoreWritingUnitSnapshot?.({
          unitId: receipt.insertedUnitId,
          snapshot: receipt.afterUnitSnapshot
        })
      : notebookEditorRef.value?.redo?.()
    if (receipt.operation === 'rewrite-unit' ? !restored?.ok : !restored) {
      authoringTask.notify(receipt.operation === 'rewrite-unit'
        ? tr('无法重新应用文本块重写：{value0}', { value0: restored?.reason || 'editor-unavailable' })
        : tr('当前编辑历史不可用，未执行重做'))
      return false
    }
    if (!ghostDocumentMatchesReceipt(receipt, 'redo')) {
      if (receipt.operation === 'rewrite-unit') {
        notebookEditorRef.value?.restoreWritingUnitSnapshot?.({ unitId: receipt.insertedUnitId, snapshot: receipt.beforeUnitSnapshot })
      } else notebookEditorRef.value?.undo?.()
      fenceNotebookHistory()
      authoringTask.notify(tr('重做历史与推演事务不一致，已保持撤销状态并隔离旧历史'))
      return false
    }
    applyGhostAdoptionDeltaState(receipt, 'redo')
    if (!persistGhostAdoptionHistory(receipt)) {
      if (receipt.operation === 'rewrite-unit') {
        notebookEditorRef.value?.restoreWritingUnitSnapshot?.({ unitId: receipt.insertedUnitId, snapshot: receipt.beforeUnitSnapshot })
      } else notebookEditorRef.value?.undo?.()
      applyGhostAdoptionDeltaState(receipt, 'undo')
      authoringTask.notify(tr('重做保存失败，正文与当前场仍保持撤销状态'))
      return false
    }
    if (receipt.documentRole !== 'exploration') {
      const observerUnitId = receipt.insertedUnitIds?.at(-1) || receipt.insertedUnitId
      const insertedUnit = (writingDocument.value?.content || [])
        .find((unit) => unit?.attrs?.unitId === observerUnitId)
      const observerReceipt = await commitDirectAuthoringObservation({
        text: receipt.adoptedText || '',
        sourceRefs: [...new Set([
          ...(receipt.sourceRefs || []),
          ...(receipt.insertedUnitIds?.length ? receipt.insertedUnitIds : [receipt.insertedUnitId])
            .map((unitId) => `unit:${unitId}`)
        ])],
        memoryProjectId: selectedBookId.value,
        documentId: selectedChapterId.value,
        chapterId: selectedChapterId.value,
        unitId: observerUnitId,
        unitRevision: Number(insertedUnit?.attrs?.unitRevision || 0),
        sourceDocumentRevision: currentDocumentRevision()
      })
      if (!observerReceipt) {
        authoringObserverWarning.value = normalizeAuthoringFailure({
          phase: 'observer',
          code: 'AUTHORING_OBSERVER_REFRESH_FAILED',
          message: tr('正文已重做，现场状态将在稍后刷新'),
          retryable: true
        })
      }
    }
    const historyReceipt = receipt.operation === 'rewrite-unit'
      ? Object.freeze({
          ...receipt,
          afterUnitSnapshot: cloneAuthoringRunValue((writingDocument.value?.content || [])
            .find((unit) => unit?.attrs?.unitId === receipt.insertedUnitId))
        })
      : receipt
    notebookAtomicRedoReceipts.value = notebookAtomicRedoReceipts.value.slice(0, -1)
    notebookAtomicUndoReceipts.value = [...notebookAtomicUndoReceipts.value, historyReceipt]
    if (receipt.operation === 'rewrite-unit') fenceNotebookHistory()
    authoringTask.notify(receipt.operation === 'rewrite-unit'
      ? tr('已重新应用文本块重写')
      : tr('已同时重做推演正文、当前场与大纲变更'), { canUndo: true })
    return true
  } finally {
    applyingAtomicNotebookHistory = false
    atomicHistoryBusy.value = false
  }
}
function snapshotWritingAnnotationState(annotations = activeEditorAnnotations.value) {
  return normalizeWritingAnnotations(annotations, activeAnnotationScopeKey()).map((annotation) => ({
    ...annotation,
    target: annotation.target ? { ...annotation.target } : null,
    selector: annotation.selector ? { ...annotation.selector } : null
  }))
}
function fingerprintWritingAnnotationState(annotations = activeEditorAnnotations.value) {
  const stable = snapshotWritingAnnotationState(annotations)
    .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')))
  return buildDocumentRevision('annotations', JSON.stringify(stable))
}
function applyStructureSideState(receipt, direction) {
  const redo = direction === 'redo'
  sceneAnchors.value = normalizeSceneAnchors(redo ? receipt.afterSceneAnchors : receipt.beforeSceneAnchors)
  const annotations = snapshotWritingAnnotationState(redo ? receipt.afterAnnotations : receipt.beforeAnnotations)
  if (receipt.documentRole === 'exploration') wt3Annotations.value = annotations
  else chapterAnnotations.value = annotations
  lastSceneAnchorUndoReceipt.value = null
  scheduleAnnotationLayout()
}
function structureDocumentMatchesReceipt(receipt, direction) {
  const redo = direction === 'redo'
  return currentDocumentBodyRevision() === (redo ? receipt.afterBodyRevision : receipt.beforeBodyRevision)
}
async function undoStructureTransition() {
  const receipt = lastStructureUndoReceipt.value
  if (!hasStructureUndoBoundary.value) return false
  if (!canUndoStructureTransition.value) {
    authoringTask.notify(tr('当前场或批注已变化，无法安全撤销这次文本块调整'))
    return false
  }
  writingAgentHost.notifyHistory('historyUndo')
  atomicHistoryBusy.value = true
  applyingAtomicNotebookHistory = true
  try {
    if (!notebookEditorRef.value?.undo?.()) return false
    if (!structureDocumentMatchesReceipt(receipt, 'undo')) {
      notebookEditorRef.value?.redo?.()
      invalidateNotebookAtomicHistory()
      fenceNotebookHistory()
      authoringTask.notify(tr('文本块历史与正文不一致，已恢复并隔离旧历史'))
      return false
    }
    applyStructureSideState(receipt, 'undo')
    if (!persistGhostAdoptionHistory(receipt)) {
      notebookEditorRef.value?.redo?.()
      applyStructureSideState(receipt, 'redo')
      authoringTask.notify(tr('文本块撤销保存失败，已恢复到撤销前'))
      return false
    }
    notebookAtomicUndoReceipts.value = notebookAtomicUndoReceipts.value.slice(0, -1)
    notebookAtomicRedoReceipts.value = [...notebookAtomicRedoReceipts.value, receipt]
    authoringTask.notify(tr('已撤销文本块调整及其当前场、批注迁移'))
    return true
  } finally {
    applyingAtomicNotebookHistory = false
    atomicHistoryBusy.value = false
  }
}
async function redoStructureTransition() {
  const receipt = lastStructureRedoReceipt.value
  if (!hasStructureRedoBoundary.value) return false
  if (!canRedoStructureTransition.value) {
    authoringTask.notify(tr('当前场或批注已变化，无法安全重做这次文本块调整'))
    return false
  }
  writingAgentHost.notifyHistory('historyRedo')
  atomicHistoryBusy.value = true
  applyingAtomicNotebookHistory = true
  try {
    if (!notebookEditorRef.value?.redo?.()) return false
    if (!structureDocumentMatchesReceipt(receipt, 'redo')) {
      notebookEditorRef.value?.undo?.()
      invalidateNotebookAtomicHistory()
      fenceNotebookHistory()
      authoringTask.notify(tr('文本块重做历史与正文不一致，已保持撤销状态'))
      return false
    }
    applyStructureSideState(receipt, 'redo')
    if (!persistGhostAdoptionHistory(receipt)) {
      notebookEditorRef.value?.undo?.()
      applyStructureSideState(receipt, 'undo')
      authoringTask.notify(tr('文本块重做保存失败，仍保持撤销状态'))
      return false
    }
    notebookAtomicRedoReceipts.value = notebookAtomicRedoReceipts.value.slice(0, -1)
    notebookAtomicUndoReceipts.value = [...notebookAtomicUndoReceipts.value, receipt]
    authoringTask.notify(tr('已重做文本块调整及其当前场、批注迁移'))
    return true
  } finally {
    applyingAtomicNotebookHistory = false
    atomicHistoryBusy.value = false
  }
}
function handleNotebookHistoryCommand(direction) {
  return direction === 'redo' ? redoNotebookEdit() : undoNotebookEdit()
}
function undoAuthoringTask() {
  if (lastInterventionUmbrellaReceipt.value) return undoInterventionUmbrella()
  if (hasStructureUndoBoundary.value) return undoStructureTransition()
  if (hasGhostAdoptionUndoBoundary.value) return undoGhostAdoption()
  const reverted = authoringTask.undoLastRequest()
  if (reverted) {
    // 撤销正文事务：使该事务来源派生的记忆 stale，不静默删除。
    gameStore.handleAuthoringProseUndo({
      sourceRefs: [activeDocumentSourceRef()],
      revision: currentDocumentRevision(),
      reason: 'prose-undo'
    })
  }
}
// 初始状态也要同步：页面加载时全局 Agent 已关闭的话，记忆派生同样默认关闭。
watch(copilotEnabled, (value) => {
  gameStore.setAuthoringMemoryAgentEnabled(Boolean(value))
}, { immediate: true })
const chapterDrawerOpen = ref(false)
const chapterShelfSheetMode = ref(false)
const chapterDrawerTriggerRef = ref(null)
const moreToolsTriggerRef = ref(null)
const chapterShelfRef = ref(null)
let chapterShelfViewportCleanup = null
const {
  activeDocumentSaveScopeKey,
  cancelContentSave,
  cancelRecoveryDraftSchedule,
  cancelTitleSave,
  clearPendingDocumentSaveTimers,
  exportUnsavedManuscriptFromRescue,
  onContentChange,
  onTitleChange,
  openRecoveryFromRescue,
  retrySaveFromRescue,
  saveFeedbackVisible,
  saveRescueText,
  saveRescueVisible,
  saveStatus,
  stampStateText
} = useAuthoringPersistence({
  selectedBookId,
  selectedChapterId,
  activeDocument: wt3ActiveDoc,
  writingRecoveryDraft,
  pendingGhostAdoption,
  blockPreview,
  blockComposer,
  currentChapterTitle,
  canEditTitle: () => !historyInteractionLocked.value,
  syncFromEditor: syncFromCurrentEditor,
  persistChapter: (options) => saveCurrentChapter(options),
  persistActiveDocument: () => wt3PersistActiveDoc(),
  writeRecoveryDraft: () => writeCurrentWritingRecoveryDraft(),
  clearRecoveryDraft: (key) => authoringHistory.clearRecovery(key),
  getActiveRecoveryKey: () => wt3ActiveDoc.value
    ? authoringDocumentKey({ role: 'exploration', bookId: selectedBookId.value, documentId: wt3ActiveDoc.value.id })
    : selectedChapterId.value,
  notify: (message) => authoringTask.notify(message),
  getEditorText,
  downloadText: downloadTextFile,
  formatRecoveryTime: formatWritingSnapshotTime,
  openHistory: () => selectInspectorTool('history'),
  buildOutgoingBoundary: buildCurrentChapterObserverBoundary,
  dispatchOutgoingBoundary: dispatchChapterBoundary,
  cancelCopilot: () => writingAgentHost.cancelForToolTakeover(),
  abandonBlockComposer,
  markExplorationDirty: () => {
    workspaceTabsStore.updateContextByKey(`project:${selectedBookId.value}:authoring`, { dirty: true })
  }
})
watch(() => activeDocumentSaveScopeKey(), (nextScope, previousScope) => {
  if (!previousScope || nextScope === previousScope) return
  referenceSource.clearIfScopeChanged(nextScope)
  writingAgentHost.cancelForScopeChange()
  contextMenu.value.show = false
  notebookSelection.value = null
  selectedText.value = ''
  hasSelection.value = false
  if (!pendingGhostAdoption.value && (blockComposer.open || blockPreview.value)) {
    abandonBlockComposer({ restoreSelection: false })
  }
})
watch([
  selectedBookId,
  selectedChapterId,
  wt3ActiveDocId,
  activeWritingPane,
  () => writingDocument.value?.revision,
  () => dualQuickWordDocument.value?.revision,
  () => sceneProjection.value?.projectionFingerprint,
  selectedBookWorldbookId,
  () => boundWorldbook.value?.updatedAt
], () => {
  if (illustratorBrief.value) reconcileIllustratorSource()
})
const shouldLockPageScroll = computed(() => {
  return assetInboxOpen.value || showNewBookModal.value || showManuscriptImport.value || illustratorBlocking.value
})
useBodyScrollLock(shouldLockPageScroll)
// U33：键盘 undo/redo 后 PM 事务副作用可能使编辑器丢失焦点（DOM 重渲染
// 替换含 caret 的节点），导致后续 redo 键盘事件落在 BODY 上。当选区仍在
// 编辑器内但焦点不在时，转发 undo/redo 到编辑器。
function handleEditorHistoryKeyForward(event) {
  if (!event.ctrlKey && !event.metaKey) return
  const key = String(event.key || '').toLowerCase()
  const isUndo = key === 'z' && !event.shiftKey
  const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)
  if (!isUndo && !isRedo) return
  const pm = document.querySelector('.writing-notebook-editor__surface .ProseMirror')
  if (!pm || pm.contains(document.activeElement)) return
  const sel = window.getSelection()
  if (!sel?.anchorNode || !pm.contains(sel.anchorNode)) return
  event.preventDefault()
  pm.focus()
  nextTick(() => {
    if (isRedo) redoNotebookEdit()
    else undoNotebookEdit()
  })
}
onMounted(() => {
  document.addEventListener('keydown', handleEditorHistoryKeyForward)
  const syncChapterShelfMode = () => {
    chapterShelfSheetMode.value = Boolean(window.matchMedia?.('(max-width: 720px)').matches)
  }
  syncChapterShelfMode()
  window.addEventListener('resize', syncChapterShelfMode)
  chapterShelfViewportCleanup = () => window.removeEventListener('resize', syncChapterShelfMode)
  pendingBackJump.value = parseSelectionBackJump(route.query)
  pendingInsertBack.value = parseInsertBackQuery(route.query)
  if (window.matchMedia?.('(max-width: 720px)').matches) {
    inspectorOpen.value = false
  }
  loadBooks()
  const startIntent = String(route.query.start || '')
  if (startIntent === 'import') openManuscriptImport({ clearRouteIntent: true })
  else if (startIntent === 'new') createNewBook({ clearRouteIntent: true })
  const requestedExplorationId = String(route.query.explorationId || '').trim()
  if (requestedExplorationId) {
    wt3RefreshDocs()
    if (wt3ExplorationDocs.value.some((doc) => doc.id === requestedExplorationId)) {
      openExplorationDoc(requestedExplorationId)
    }
  }
  void worldStore.loadWorldbooksIndex()
  refreshAssetInbox()
  projectLinkedLegacySession()
  refreshAuthoringObserverState()
  if (pendingBackJump.value) tryApplyPendingBackJump()
  if (pendingInsertBack.value) tryApplyPendingInsertBack()
  document.addEventListener('keydown', handleChapterDrawerKeydown)
  document.addEventListener('keydown', handleWritingInspectorKeydown)
  document.addEventListener('keydown', handleWritingFocusKeydown)
  document.addEventListener('keydown', handleContextMenuKeydown, true)
  document.addEventListener('pointerdown', dismissSelectionActions)
  window.addEventListener('resize', handleContextMenuViewportChange, { passive: true })
  window.addEventListener('scroll', handleWritingWorkspaceScroll, true)
  window.visualViewport?.addEventListener('resize', handleContextMenuViewportChange, { passive: true })
  window.visualViewport?.addEventListener('scroll', handleContextMenuViewportChange, { passive: true })
})
onBeforeUnmount(() => {
  if (authoringContextPreflightTimer) clearTimeout(authoringContextPreflightTimer)
  chapterShelfViewportCleanup?.()
  document.removeEventListener('keydown', handleChapterDrawerKeydown)
  document.removeEventListener('keydown', handleWritingInspectorKeydown)
  document.removeEventListener('keydown', handleWritingFocusKeydown)
  document.removeEventListener('keydown', handleContextMenuKeydown, true)
  document.removeEventListener('keydown', handleEditorHistoryKeyForward)
  document.body.classList.remove('is-writing-zen')
  document.removeEventListener('pointerdown', dismissSelectionActions)
  window.removeEventListener('resize', handleContextMenuViewportChange)
  window.removeEventListener('scroll', handleWritingWorkspaceScroll, true)
  window.visualViewport?.removeEventListener('resize', handleContextMenuViewportChange)
  window.visualViewport?.removeEventListener('scroll', handleContextMenuViewportChange)
})
function openChapterDrawer() {
  chapterDrawerOpen.value = true
  nextTick(() => chapterShelfRef.value?.focus())
}
function closeChapterDrawer({ restoreFocus = true } = {}) {
  const wasOpen = chapterDrawerOpen.value
  chapterDrawerOpen.value = false
  if (restoreFocus && wasOpen) nextTick(() => chapterDrawerTriggerRef.value?.focus())
}
function isWritingCompositionKey(event) {
  return Boolean(event?.isComposing || event?.keyCode === 229 || writingCompositionActive.value || dualCompositionActive.value)
}
function handleChapterDrawerKeydown(event) {
  if (event.defaultPrevented || isWritingCompositionKey(event)) return
  if (event.key !== 'Escape' || !chapterDrawerOpen.value) return
  event.preventDefault()
  closeChapterDrawer()
}
function handleWritingInspectorKeydown(event) {
  if (event.defaultPrevented || isWritingCompositionKey(event)) return
  if (event.key !== 'Escape' || !inspectorOpen.value) return
  if (!event.target?.closest?.('.writing-inspector')) return
  event.preventDefault()
  // Escape 先关闭当前详情（回到批注），再次 Escape 才收起检查器。
  if (inspectorDetailState.value) {
    closeSceneDetail()
    return
  }
  closeActiveWritingInspector()
}
const activeWritingBlock = computed(() => {
  const selection = notebookSelection.value
  if (notebookEditorActive.value && selection?.nodeId) {
    return getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
  }
  return getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
})
const activeWritingUnit = computed(() => {
  const unitId = notebookSelection.value?.unitId || activeWritingUnitId.value
  if (unitId) return (writingDocument.value?.content || []).find((unit) => unit?.attrs?.unitId === unitId) || null
  const nodeId = notebookSelection.value?.nodeId
  return nodeId ? getWritingUnitByNodeId(nodeId) : null
})
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  br: '  '
})
turndownService.addRule('underline', {
  filter: ['u'],
  replacement(content) {
    return `<u>${content}</u>`
  }
})
marked.setOptions({
  gfm: true,
  breaks: true
})
const charCount = computed(() => getEditorText().length)
const wordCount = computed(() => countWritingText(getEditorText(), currentBook.value?.manuscriptLanguage))

const revisionLabel = computed(() => {
  const chapter = chapters.value.find((item) => item.id === selectedChapterId.value)
  const stamp = Date.parse(chapter?.updatedAt || chapter?.createdAt || '')
  if (!Number.isFinite(stamp)) return '--:--'
  return new Date(stamp).toLocaleString(uiLocale.value, { hour: '2-digit', minute: '2-digit' })
})
function goToAdventure() {
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前章节'))
    return false
  }
  const outgoingChapterBoundary = !wt3ActiveDoc.value
    ? buildCurrentChapterObserverBoundary()
    : null
  const saved = wt3ActiveDoc.value
    ? wt3PersistBeforeLeaving()?.ok === true
    : (!selectedChapterId.value || saveCurrentChapter())
  if (!saved) {
    authoringTask.notify(tr('文档保存失败，已留在创作页'))
    return false
  }
  if (outgoingChapterBoundary) dispatchChapterBoundary(outgoingChapterBoundary)
  const hasSession = gameStore.currentSessionId
    && gameStore.sessions.some(s => s.id === gameStore.currentSessionId)
  if (hasSession) {
    router.push({ name: 'experience' })
  } else {
    router.push({ name: 'opening' })
  }
  return true
}
// 打开带 sessionId 的旧体验会话链接时，把已提交的助手回合幂等投影进当前章节。
// 每个页面实例只跑一次；重复导入由 writing-unit 指纹去重兜底。
const projectedSessionIds = new Set()
function projectLinkedLegacySession() {
  const sessionId = String(route.query.sessionId || '')
  if (!sessionId || projectedSessionIds.has(sessionId)) return
  const session = gameStore.sessions.find((item) => item?.id === sessionId)
  if (!session) return
  projectedSessionIds.add(sessionId)
  const bookId = String(route.query.bookId || selectedBookId.value || books.value[0]?.id || '')
  const book = books.value.find((item) => item.id === bookId)
  const chapterId = String(route.query.chapterId || selectedChapterId.value || book?.chapters?.[0]?.id || '')
  if (!book || !chapterId) return
  const result = projectExperienceSession({
    session,
    books: books.value,
    bookId,
    chapterId,
    worldbookId: session.worldbookId || session.worldId || ''
    // 不传 confirmWorldbookBinding：绑定必须显式确认，绝不隐式改书的世界书。
  })
  if (!result.importedCount) return
  // 绑定提案（Task 7）：目标书未绑定且会话带世界书时，给 typed 提示，
  // 由用户通过书架上的“关联世界书”动作显式确认。
  if (result.bindingProposal) {
    authoringTask.notify(tr('来源会话使用世界书 {value0}；如需绑定请用左侧“关联世界书”', { value0: result.bindingProposal.worldbookId }))
  }
  books.value = result.books
  saveBooks()
  if (selectedChapterId.value === chapterId) {
    selectChapter(chapterId)
  }
}
function goBack() {
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前章节'))
    return false
  }
  const outgoingChapterBoundary = !wt3ActiveDoc.value
    ? buildCurrentChapterObserverBoundary()
    : null
  const saved = wt3ActiveDoc.value
    ? wt3PersistBeforeLeaving()?.ok === true
    : (!selectedChapterId.value || saveCurrentChapter())
  if (!saved) {
    authoringTask.notify(tr('文档保存失败，已留在创作页'))
    return false
  }
  if (outgoingChapterBoundary) dispatchChapterBoundary(outgoingChapterBoundary)
  router.push('/')
  return true
}
function readLiveWritingSelectionSnapshot() {
  if (notebookEditorActive.value && notebookSelection.value) {
    const selection = notebookSelection.value
    const selected = String(selection.text || '')
    const hasDirectRange = selection.markdownFrom != null && selection.markdownTo != null
    const directStart = Number(selection.markdownFrom)
    const directEnd = Number(selection.markdownTo)
    if (hasDirectRange && Number.isFinite(directStart) && Number.isFinite(directEnd)) {
      const textLength = markdownContent.value.length
      const start = Math.max(0, Math.min(textLength, Math.min(directStart, directEnd)))
      const end = Math.max(start, Math.min(textLength, Math.max(directStart, directEnd)))
      return {
        start,
        end,
        text: selected || markdownContent.value.slice(start, end),
        hasSelection: end > start,
        unitId: selection.unitId || null,
        unitRevision: Number(selection.unitRevision || 0),
        nodeId: selection.nodeId || null,
        nodeRevision: Number(selection.nodeRevision || 0),
        cursorLocalOffset: Number(selection.cursorLocalOffset || 0),
        selectionLocalStart: Number(selection.selectionLocalStart ?? selection.cursorLocalOffset ?? 0),
        selectionLocalEnd: Number(selection.selectionLocalEnd ?? selection.cursorLocalOffset ?? 0),
        editorFrom: Number(selection.from || 1),
        editorTo: Number(selection.to || selection.from || 1)
      }
    }
    const beforeTail = String(selection.beforeText || '').slice(-160)
    const anchor = selected ? `${beforeTail}${selected}` : beforeTail
    const anchorIndex = anchor ? markdownContent.value.indexOf(anchor) : -1
    const start = selected && anchorIndex >= 0
      ? anchorIndex + beforeTail.length
      : selected ? markdownContent.value.indexOf(selected) : markdownContent.value.length
    const safeStart = start >= 0 ? start : markdownContent.value.length
    return {
      start: safeStart,
      end: selected ? safeStart + selected.length : safeStart,
      text: selected,
      hasSelection: Boolean(selected),
      editorFrom: Number(selection.from || 1),
      editorTo: Number(selection.to || selection.from || 1)
    }
  }
  const editor = notebookEditorActive.value
    ? notebookEditorRef.value?.getRootElement?.()
    : editorRef.value
  const text = markdownContent.value || ''
  const fallbackStart = Math.max(0, Math.min(text.length, copilotCursorPos.value || 0))
  const rawStart = editor?.selectionStart ?? fallbackStart
  const rawEnd = editor?.selectionEnd ?? rawStart
  const start = Math.max(0, Math.min(text.length, Math.min(rawStart, rawEnd)))
  const end = Math.max(0, Math.min(text.length, Math.max(rawStart, rawEnd)))
  const selectionText = text.slice(start, end)
  return {
    start,
    end,
    text: selectionText,
    hasSelection: end > start
  }
}
function getWritingSelectionSnapshot() {
  return readLiveWritingSelectionSnapshot()
}
function getWritingParagraphSnapshot(position = null) {
  const text = markdownContent.value || ''
  const fallbackPosition = Math.max(0, Math.min(text.length, copilotCursorPos.value || 0))
  const anchor = Number.isFinite(Number(position)) ? Number(position) : fallbackPosition
  const cursor = Math.max(0, Math.min(text.length, anchor))
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const startBoundary = before.lastIndexOf('\n\n')
  const start = startBoundary === -1 ? 0 : startBoundary + 2
  const endBoundary = after.indexOf('\n\n')
  const end = endBoundary === -1 ? text.length : cursor + endBoundary
  const rawText = text.slice(start, end)
  const paragraphText = rawText.trim()
  return {
    start,
    end,
    text: paragraphText,
    rawText,
    hasParagraph: Boolean(paragraphText)
  }
}
function collectWritingContext() {
  const selectedBook = books.value.find(b => b.id === selectedBookId.value)
  const currentChapter = selectedBook?.chapters?.find(c => c.id === selectedChapterId.value)
  const selection = getWritingSelectionSnapshot()
  const paragraph = getWritingParagraphSnapshot(selection.start)
  const contextWindow = extractWritingSuggestionWindow(markdownContent.value || '', selection.start, {
    upstream: 520,
    downstream: 240
  })
  return {
    bookId: selectedBookId.value,
    bookTitle: selectedBook?.title || '',
    chapterId: selectedChapterId.value,
    chapterTitle: currentChapterTitle.value || currentChapter?.title || '',
    wordCount: countWritingText(editorContent.value, currentBook.value?.manuscriptLanguage),
    selectedText: selection.text || selectedText.value || '',
    selectionStart: selection.start,
    selectionEnd: selection.end,
    selectionHasText: selection.hasSelection,
    paragraphRange: { start: paragraph.start, end: paragraph.end },
    paragraphText: paragraph.text,
    contextWindow,
    sourceRefs: sourceRefsToEvidenceRefs(currentChapter?.sourceRefs || []),
    editorMode: editorMode.value,
    totalBooks: books.value.length,
    totalChapters: selectedBook?.chapters?.length || 0
  }
}
function buildWritingTaskContext(task = {}, selectionOverride = null) {
  const selection = selectionOverride || getWritingSelectionSnapshot()
  const paragraph = getWritingParagraphSnapshot(selection.start)
  const contextWindow = extractWritingSuggestionWindow(markdownContent.value || '', selection.start, {
    upstream: 520,
    downstream: 240
  })
  return {
    ...collectWritingContext(),
    writingTask: {
      scope: task.scope || 'chapter',
      label: task.label || task.question || '',
      question: task.question || '',
      taskType: task.taskType || ''
    },
    selection,
    paragraph,
    contextWindow,
    chapterOutline: buildChapterOutlineContext(chapterOutlineItems.value),
    referenceAsset: buildCopilotAssetContext(readCurrentCopilotReference())
  }
}
function readCurrentEditorCursor(content) {
  if (notebookEditorActive.value && notebookSelection.value) {
    const snapshot = readLiveWritingSelectionSnapshot()
    return Number.isFinite(snapshot.end) ? snapshot.end : String(content || '').length
  }
  if (!editorRef.value) return String(content || '').length
  const start = Number(editorRef.value.selectionStart)
  if (!Number.isFinite(start)) return String(content || '').length
  return Math.max(0, Math.min(String(content || '').length, start))
}
function openAssetInbox() {
  assetInboxOpen.value = true
  refreshAssetInbox()
  nextTick(() => {
    if (!assetInboxActiveId.value && inboxAssets.value.length) {
      assetInboxActiveId.value = inboxAssets.value[0].id
    }
  })
}
function openInboxAssetFromInspector(asset) {
  assetInboxActiveId.value = String(asset?.id || '')
  openAssetInbox()
}
function openMaterialsPage() {
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前章节'))
    return false
  }
  const outgoingChapterBoundary = !wt3ActiveDoc.value
    ? buildCurrentChapterObserverBoundary()
    : null
  const saved = wt3ActiveDoc.value
    ? wt3PersistBeforeLeaving()?.ok === true
    : (!selectedChapterId.value || saveCurrentChapter())
  if (!saved) {
    authoringTask.notify(tr('文档保存失败，未打开素材页'))
    return false
  }
  if (outgoingChapterBoundary) dispatchChapterBoundary(outgoingChapterBoundary)
  router.push({ name: 'materials' })
  return true
}
function closeAssetInbox() {
  assetInboxOpen.value = false
}
function refreshAssetInbox() {
  const filters = { status: 'inbox' }
  if (assetInboxScope.value === 'current-book') {
    filters.projectId = selectedBookId.value || '__no_current_book__'
  } else if (assetInboxScope.value === 'unbound') {
    filters.projectId = null
  }
  if (assetInboxKind.value) {
    filters.kind = assetInboxKind.value
  }
  inboxAssets.value = listNarrativeAssets(filters)
  const visibleIds = new Set(inboxAssets.value.map((asset) => asset.id))
  selectedInboxAssetIds.value = selectedInboxAssetIds.value.filter((id) => visibleIds.has(id))
  if (!visibleIds.has(assetInboxActiveId.value)) {
    assetInboxActiveId.value = inboxAssets.value[0]?.id || ''
  }
}
function toggleInboxAssetSelection(assetId) {
  const nextIds = [...selectedInboxAssetIds.value]
  const idx = nextIds.indexOf(assetId)
  if (idx >= 0) nextIds.splice(idx, 1)
  else nextIds.push(assetId)
  selectedInboxAssetIds.value = nextIds
}
function selectAllInboxAssets() {
  selectedInboxAssetIds.value = inboxAssets.value.map((asset) => asset.id)
}
function clearInboxAssetSelection() {
  selectedInboxAssetIds.value = []
}
function focusInboxAsset(assetId) {
  assetInboxActiveId.value = assetId
}
function getSelectedInboxAssets() {
  const picked = new Set(selectedInboxAssetIds.value)
  return inboxAssets.value.filter((asset) => picked.has(asset.id))
}
// 素材状态是独立持久域：只有真正写盘后才刷新收件箱。
// 若正文/大纲/世界书事务已先完成，失败文案明示部分成功，不伪装原子跨域写入。
function persistInboxAssetStatus(assetIds, status, completedAction = '') {
  const result = setNarrativeAssetsStatusDurable(assetIds, status)
  if (result.ok) return true
  quickNoteStatus.value = completedAction
    ? tr('{value0}，但素材状态未保存，请重试', { value0: completedAction })
    : tr('素材状态未保存，请重试')
  return false
}
function getSelectedWorldbookDraftAssets() {
  return getSelectedInboxAssets().filter((asset) => canConvertAssetToWorldbookEntry(asset))
}
const activeInboxAsset = computed(() => {
  if (!inboxAssets.value.length) return null
  return inboxAssets.value.find((asset) => asset.id === assetInboxActiveId.value) || inboxAssets.value[0] || null
})
function buildCopilotAssetContext(asset) {
  const content = String(asset?.content || '').trim()
  if (!content) return ''
  const parts = [
    asset.title ? tr('标题：{value0}', { value0: asset.title }) : '',
    `类型：${getAssetKindLabel(asset.kind)}`,
    asset.source ? tr('来源：{value0}', { value0: getAssetSourceDetail(asset.source) }) : '',
    '',
    content
  ]
  return parts.filter((part) => part !== '').join('\n')
}
function getWritingAgentPageContext(invocationTarget = null) {
  const contextProjectId = String(invocationTarget?.projectId || selectedBookId.value || '')
  const contextChapterId = String(invocationTarget?.chapterId || selectedChapterId.value || '')
  const selectedBook = books.value.find((book) => String(book.id || '') === contextProjectId)
  const currentChapter = selectedBook?.chapters?.find((chapter) => String(chapter.id || '') === contextChapterId)
  const contextText = typeof invocationTarget?.documentText === 'string'
    ? invocationTarget.documentText
    : markdownContent.value
  const contextDocument = invocationTarget?.documentSnapshot || writingDocument.value
  const contextCursor = Math.max(0, Math.min(
    contextText.length,
    Number(invocationTarget?.caret ?? copilotCursorPos.value) || 0
  ))
  const liveNodeTarget = getWritingBlockAtPosition(contextCursor, contextText)
  const nodeTarget = invocationTarget
    ? {
        ...(liveNodeTarget || {}),
        unitId: invocationTarget.unitId || liveNodeTarget?.unitId || '',
        unitRevision: Number(invocationTarget.unitRevision ?? liveNodeTarget?.unitRevision ?? 0),
        nodeId: invocationTarget.nodeId || liveNodeTarget?.nodeId || '',
        nodeRevision: Number(invocationTarget.nodeRevision ?? liveNodeTarget?.nodeRevision ?? 0)
      }
    : liveNodeTarget
  const matchedWorldbookEntries = matchWorldbookEntries({
    worldbook: boundWorldbook.value,
    chatHistory: [{ role: 'user', content: contextText.slice(Math.max(0, contextCursor - 800), contextCursor) }],
    runtimeState: { currentScene: sceneProjection.value?.location?.name || '' },
    tokenBudget: 900,
    scanDepth: 1
  })?.matchedEntries || []
  const sceneEntryIds = new Set([
    sceneProjection.value?.location?.id,
    sceneProjection.value?.viewpointCharacter?.id,
    sceneProjection.value?.activeActor?.id,
    sceneProjection.value?.dialogueTarget?.id,
    sceneActiveActorId.value,
    sceneDialogueTargetId.value,
    ...(sceneProjection.value?.presentCharacters || []).map((person) => person?.id)
  ].map((id) => String(id || '')).filter(Boolean))
  const contextWorldbookEntries = new Map(matchedWorldbookEntries.map((entry) => [String(entry?.id || ''), entry]))
  for (const entry of boundWorldbook.value?.entries || []) {
    const entryId = String(entry?.id || '')
    if (!sceneEntryIds.has(entryId)) continue
    contextWorldbookEntries.set(entryId, {
      ...entry,
      ...(contextWorldbookEntries.get(entryId) || {}),
      matchReason: 'current-scene'
    })
  }
  // Phase 4：readers 产出候选（四轴+位置+表示），选择权归 WritingContextCompiler。
  const targetUnitId = nodeTarget?.unitId || notebookSelection.value?.unitId || ''
  const localContextCandidates = buildWritingContextCandidates({
    projectId: contextProjectId,
    chapterId: contextChapterId,
    targetUnitId,
    document: contextDocument,
    sceneProjection: sceneProjection.value,
    outlineNodes: wt3OutlineNodes.value,
    explorationDocuments: wt3ExplorationDocs.value,
    referenceAssets: selectedCopilotReferenceAssets(),
    matchedEntries: [...contextWorldbookEntries.values()]
  })
  const crossChapter = discoverCrossChapterContext({
    book: selectedBook,
    targetChapterId: contextChapterId,
    outlineNodes: wt3OutlineNodes.value,
    outlineEdges: wt3OutlineEdges.value
  })
  const positionIndex = buildManuscriptPositionIndex(selectedBook)
  const contextDependencyRevisions = {
    'chapter-order': positionIndex.chapterOrderRevision,
    outline: fingerprintOutline(wt3OutlineNodes.value, wt3OutlineEdges.value)
  }
  return {
    content: contextText,
    cursorPos: contextCursor,
    bookId: contextProjectId || null,
    bookTitle: invocationTarget?.bookTitle ?? selectedBook?.title ?? '',
    chapterId: contextChapterId || null,
    chapterTitle: invocationTarget?.chapterTitle ?? currentChapterTitle.value,
    documentRole: invocationTarget?.documentRole || (wt3ActiveDoc.value ? 'exploration' : 'manuscript'),
    documentId: invocationTarget?.documentId || wt3ActiveDoc.value?.id || contextChapterId || null,
    documentRevision: invocationTarget?.documentRevision || currentDocumentRevision(),
    editorFocused: notebookEditorRef.value?.hasEditorFocus?.() !== false,
    nodeTarget,
    sourceRefs: sourceRefsToEvidenceRefs(currentChapter?.sourceRefs || []),
    outlineItems: chapterOutlineItems.value,
    referenceAsset: readCurrentCopilotReference(),
    inboxAssets: inboxAssets.value,
    selectedInboxIds: selectedInboxAssetIds.value,
    worldbook: boundWorldbook.value || null,
    contextCandidates: [...localContextCandidates, ...crossChapter.candidates],
    contextCandidateReport: crossChapter.report,
    contextRunPinnedIds: contextRunPinnedIds.value,
    contextRunExcludedIds: contextRunExcludedIds.value,
    contextDependencyRevisions
  }
}
function buildLiveContextDependencyRevisions() {
  const selectedBook = books.value.find((book) => book.id === selectedBookId.value)
  return {
    ...collectWritingContextDependencyRevisions({
      book: selectedBook,
      document: { ...writingDocument.value, chapterId: selectedChapterId.value || '' },
      sceneProjection: sceneProjection.value,
      outlineNodes: wt3OutlineNodes.value,
      outlineEdges: wt3OutlineEdges.value,
      worldbook: boundWorldbook.value,
      explorationDocuments: wt3ExplorationDocs.value,
      referenceAssets: selectedCopilotReferenceAssets()
    }),
    outline: fingerprintOutline(wt3OutlineNodes.value, wt3OutlineEdges.value)
  }
}
function selectedCopilotReferenceAssets() {
  const byId = new Map()
  for (const asset of [
    readCurrentCopilotReference(),
    ...inboxAssets.value.filter((item) => selectedInboxAssetIds.value.includes(item.id))
  ]) {
    if (asset?.id) byId.set(String(asset.id), asset)
  }
  return [...byId.values()]
}
function clearCopilotReference(options = {}) {
  const { silent = false } = options
  if (!referenceSource.clear()) return
  writingAgentHost.cancelForToolTakeover()
  if (!silent) {
    quickNoteStatus.value = '已清除续写参考'
  }
}
function useAssetAsCopilotContext(asset) {
  // 收件箱弹层本身令 interaction owner 变为 modal;“续写参考”是作者从
  // 收件箱发起的显式意图,确认后弹层即关闭并交还所有权,不能被自己的
  // 弹层挡下。此处只检查真正冲突的正文占用:Ghost 采纳、块试稿、块 composer。
  if (pendingGhostAdoption.value || blockPreview.value || blockComposer.open || writingCompositionActive.value) {
    quickNoteStatus.value = '请先处理当前草稿或输入法组合，再设置续写参考'
    return false
  }
  const content = String(asset?.content || '').trim()
  if (!content) {
    quickNoteStatus.value = '素材内容为空'
    return
  }
  referenceSource.select(asset, { scopeKey: activeDocumentSaveScopeKey() })
  assetInboxOpen.value = false
  quickNoteStatus.value = `已设为续写参考：${asset.title || '未命名素材'}`
  nextTick(() => {
    editorRef.value?.focus()
    syncCursorAndSelection()
    if (copilotEnabled.value) {
      copilotManualTrigger()
    }
  })
}
function syncChapterOutlineToCurrentChapter() {
  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (!chapter) return
  chapter.outlineItems = normalizeChapterOutlineItems(chapterOutlineItems.value)
  saveChapters()
}
function addInboxAssetsToChapterOutline(assets = []) {
  if (!selectedChapterId.value) {
    quickNoteStatus.value = '先选择章节'
    return null
  }
  const result = addAssetsToChapterOutline(chapterOutlineItems.value, assets)
  if (!result.addedItems.length) {
    quickNoteStatus.value = result.skippedCount ? tr('所选素材已在纲要中或内容为空') : tr('先选择素材')
    return result
  }
  chapterOutlineItems.value = result.items
  const addedIds = new Set(result.addedItems.map((item) => item.assetId).filter(Boolean))
  recordChapterAssetSources(assets.filter((asset) => addedIds.has(asset.id)))
  syncChapterOutlineToCurrentChapter()
  return result
}
function addAssetToChapterOutline(asset) {
  const result = addInboxAssetsToChapterOutline([asset])
  if (!result?.addedItems.length) return
  if (!persistInboxAssetStatus([asset.id], 'accepted', '章节纲要已更新')) return
  refreshAssetInbox()
  quickNoteStatus.value = `已加入章节纲要：${result.addedItems[0].title}，会参与续写和章节分镜`
}
function addSelectedAssetsToChapterOutline() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  const result = addInboxAssetsToChapterOutline(selectedAssets)
  if (!result?.addedItems.length) return
  const acceptedIds = result.addedItems.map((item) => item.assetId).filter(Boolean)
  if (!persistInboxAssetStatus(acceptedIds, 'accepted', '章节纲要已更新')) return
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已加入 ${result.addedItems.length} 条章节纲要，会参与续写和章节分镜`
}
function removeChapterOutlineItemFromChapter(itemId) {
  chapterOutlineItems.value = removeChapterOutlineItem(chapterOutlineItems.value, itemId)
  syncChapterOutlineToCurrentChapter()
  quickNoteStatus.value = '已移出章节纲要'
}
function addManualChapterOutlineItem(payload = {}) {
  const content = String(payload.content || '').trim()
  if (!selectedChapterId.value || !content) return
  chapterOutlineItems.value = [...chapterOutlineItems.value, createChapterOutlineItem({
    title: payload.title,
    content,
    source: { type: 'manual' }
  })]
  syncChapterOutlineToCurrentChapter()
  quickNoteStatus.value = '已添加章纲节点'
}
function updateChapterOutlineItem(itemId, updates = {}) {
  chapterOutlineItems.value = chapterOutlineItems.value.map((item) => (
    item.id === itemId
      ? createChapterOutlineItem({ ...item, ...updates, id: item.id, createdAt: item.createdAt, updatedAt: Date.now() })
      : item
  ))
  syncChapterOutlineToCurrentChapter()
  quickNoteStatus.value = '章纲已更新'
}
function moveChapterOutlineItem(index, direction) {
  const target = index + direction
  if (index < 0 || target < 0 || target >= chapterOutlineItems.value.length) return
  const next = [...chapterOutlineItems.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  chapterOutlineItems.value = next
  syncChapterOutlineToCurrentChapter()
}
function insertChapterOutlineItem(item) {
  if (!insertAssetsIntoChapter([{ content: item?.content }])) return
  quickNoteStatus.value = '已插入纲要内容'
}
function insertAssetsIntoChapter(assets = []) {
  const usable = assets.filter((asset) => String(asset?.content || '').trim())
  if (!usable.length) {
    quickNoteStatus.value = '素材内容为空'
    return false
  }
  const snippet = usable.map((asset) => asset.content.trim()).join('\n\n')
  markdownContent.value = markdownContent.value
    ? `${markdownContent.value.trimEnd()}\n\n${snippet}\n`
    : snippet
  recordChapterAssetSources(usable)
  syncMarkdownToEditor()
  onContentChange()
  return true
}
function insertAssetIntoChapter(asset) {
  if (!insertAssetsIntoChapter([asset])) return
  if (!persistInboxAssetStatus([asset.id], 'accepted', '正文已插入')) return
  refreshAssetInbox()
  quickNoteStatus.value = '已插入章节'
}
function saveAssetAsMaterial(asset) {
  const content = String(asset?.content || '').trim()
  if (!content) {
    quickNoteStatus.value = '素材内容为空'
    return false
  }
  try {
    const note = prependWritingNote({
      ...createWritingNoteFromAsset(asset, { fallbackLabel: '素材' }),
      wordCount: quickNoteWordCount(content)
    })
    if (!persistInboxAssetStatus([asset.id], 'accepted', '写作素材已创建')) return false
    refreshAssetInbox()
    quickNoteStatus.value = `已转成素材：${note.title}`
    return true
  } catch (error) {
    quickNoteStatus.value = error?.message || '转成素材失败'
    return false
  }
}
async function ensureWorldbookTarget() {
  // 有显式绑定时优先写入绑定世界书，不再隐式借用全局 active 世界书。
  if (boundWorldbook.value?.id) return boundWorldbook.value
  if (worldStore.activeWorldbook?.id) return worldStore.activeWorldbook
  await worldStore.loadWorldbooksIndex()
  if (worldStore.worldbooksIndex.length === 0) {
    return worldStore.createWorldbook({
      name: '写作素材世界书',
      description: '从写作素材收件箱创建的世界书'
    })
  }
  return worldStore.ensureActiveWorldbook()
}
async function acceptWorldbookDraftAsset(asset) {
  if (!canConvertAssetToWorldbookEntry(asset)) {
    quickNoteStatus.value = formatWorldbookStatus('仅支持将世界书草稿写入世界书。')
    return
  }
  try {
    const worldbook = await ensureWorldbookTarget()
    if (!worldbook?.id) {
      quickNoteStatus.value = formatWorldbookStatus('没有可写入的目标世界书。')
      return
    }
    const entry = buildWorldbookEntryFromAsset(asset)
    await worldStore.addEntry(worldbook.id, entry)
    if (!persistInboxAssetStatus([asset.id], 'accepted', '世界书条目已写入')) return
    refreshAssetInbox()
    quickNoteStatus.value = formatWorldbookStatus(`写入成功：${entry.name}`)
  } catch (error) {
    quickNoteStatus.value = formatWorldbookStatus(`写入失败：${error?.message || '未知错误'}`)
  }
}
async function acceptSelectedWorldbookDraftAssets() {
  const selectedAssets = getSelectedWorldbookDraftAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = formatWorldbookStatus('请先选择世界书草稿素材。')
    return
  }
  try {
    const worldbook = await ensureWorldbookTarget()
    if (!worldbook?.id) {
      quickNoteStatus.value = formatWorldbookStatus('没有可写入的目标世界书。')
      return
    }
    const acceptedIds = []
    for (const asset of selectedAssets) {
      const entry = buildWorldbookEntryFromAsset(asset)
      await worldStore.addEntry(worldbook.id, entry)
      acceptedIds.push(asset.id)
    }
    if (!persistInboxAssetStatus(acceptedIds, 'accepted', '世界书条目已批量写入')) return
    selectedInboxAssetIds.value = selectedInboxAssetIds.value.filter((id) => !acceptedIds.includes(id))
    refreshAssetInbox()
    quickNoteStatus.value = formatWorldbookStatus(`批量写入成功：${acceptedIds.length} 条条目。`)
  } catch (error) {
    quickNoteStatus.value = formatWorldbookStatus(`批量写入失败：${error?.message || '未知错误'}`)
  }
}
function insertSelectedAssetsIntoChapter() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  if (!insertAssetsIntoChapter(selectedAssets)) return
  if (!persistInboxAssetStatus(selectedAssets.map((asset) => asset.id), 'accepted', '正文已插入')) return
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已插入 ${selectedAssets.length} 条素材`
}
function buildChapterStoryboardExcerpt(shots = []) {
  return shots
    .slice(0, 4)
    .map((shot) => String(shot.content || shot.sourceText || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ')
    .slice(0, 240)
}
function recordChapterAssetSources(assets = [], chapter = null) {
  const target = chapter || chapters.value.find((item) => item.id === selectedChapterId.value)
  if (!target) return []
  const refs = assets.flatMap((asset) => [
    ...(Array.isArray(asset?.sourceRefs) ? asset.sourceRefs : []),
    createNarrativeAssetSourceRef(asset)
  ])
  target.sourceRefs = mergeSourceRefs(target.sourceRefs, refs)
  return target.sourceRefs
}
function exportCurrentChapterManuscript() {
  if (!selectedChapterId.value) {
    quickNoteStatus.value = '先选择章节'
    return
  }
  if (!saveCurrentChapter()) {
    quickNoteStatus.value = '当前章节保存失败，已取消导出'
    return
  }
  const book = books.value.find((item) => item.id === selectedBookId.value)
  const chapter = book?.chapters?.find((item) => item.id === selectedChapterId.value)
  try {
    const file = buildChapterManuscriptExport({ book, chapter })
    downloadTextFile(file.content, file.filename, file.mimeType)
    quickNoteStatus.value = `已导出《${chapter?.title || '当前章节'}》`
  } catch (error) {
    quickNoteStatus.value = error?.message || '章节导出失败'
  }
}
function exportCurrentBookManuscript() {
  if (!selectedBookId.value) {
    quickNoteStatus.value = '先选择书籍'
    return
  }
  if (selectedChapterId.value && !saveCurrentChapter()) {
    quickNoteStatus.value = '当前章节保存失败，已取消导出'
    return
  }
  const book = books.value.find((item) => item.id === selectedBookId.value)
  try {
    const file = buildBookManuscriptExport({ book })
    downloadTextFile(file.content, file.filename, file.mimeType)
    quickNoteStatus.value = `已导出《${book?.title || '当前书籍'}》`
  } catch (error) {
    quickNoteStatus.value = error?.message || '整书导出失败'
  }
}
function exportChapterStoryboardDraft() {
  if (!selectedChapterId.value) {
    quickNoteStatus.value = '先选择章节'
    return
  }
  if (!saveCurrentChapter()) {
    quickNoteStatus.value = '当前章节保存失败，已取消导出'
    return
  }
  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  const chapterTitle = currentChapterTitle.value || chapter?.title || '当前章节'
  const shots = extractShotsFromChapter({
    chapter,
    chapterTitle,
    outlineItems: chapterOutlineItems.value
  })
  if (!shots.length) {
    quickNoteStatus.value = '当前章节没有可生成分镜的内容'
    return
  }
  try {
    const result = saveValidatedStoryboardVersion({
      source: {
        sourceType: 'chapter',
        sourceId: selectedChapterId.value,
        title: chapterTitle,
        excerpt: buildChapterStoryboardExcerpt(shots)
      },
      projectId: selectedBookId.value || null,
      sourceRefs: mergeSourceRefs(
        chapter?.sourceRefs,
        [normalizeContentRef({
          refType: 'chapter',
          refId: selectedChapterId.value,
          projectId: selectedBookId.value || null,
          excerpt: buildChapterStoryboardExcerpt(shots)
        }, selectedBookId.value || null)]
      ),
      shots,
      taskType: 'chapter.storyboard-draft',
      parameters: {
        bookId: selectedBookId.value || '',
        chapterId: selectedChapterId.value,
        outlineCount: chapterOutlineItems.value.length,
        wordCount: wordCount.value
      }
    })
    const markdown = toMarkdown(result.shots, {
      title: '章节分镜草稿',
      topic: chapterTitle
    })
    downloadTextFile(markdown, `chapter-storyboard-${Date.now()}.md`, 'text/markdown;charset=utf-8')
    quickNoteStatus.value = `已生成章节分镜，版本 ${result.version.versionId.slice(-6)}`
  } catch (error) {
    quickNoteStatus.value = error?.validation?.errors?.[0] || error?.message || '分镜校验未通过'
  }
}
function archiveAsset(asset) {
  if (!persistInboxAssetStatus([asset.id], 'archived')) return
  refreshAssetInbox()
  quickNoteStatus.value = '已归档素材'
}
function archiveSelectedAssets() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  if (!persistInboxAssetStatus(selectedAssets.map((asset) => asset.id), 'archived')) return
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已归档 ${selectedAssets.length} 条素材`
}
function rejectAsset(asset) {
  if (!persistInboxAssetStatus([asset.id], 'rejected')) return
  refreshAssetInbox()
  quickNoteStatus.value = '已拒绝素材'
}
function rejectSelectedAssets() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  if (!persistInboxAssetStatus(selectedAssets.map((asset) => asset.id), 'rejected')) return
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已拒绝 ${selectedAssets.length} 条素材`
}
watch(assetInboxOpen, (open) => {
  if (open) {
    refreshAssetInbox()
    nextTick(() => {
      if (!assetInboxActiveId.value && inboxAssets.value.length) {
        assetInboxActiveId.value = inboxAssets.value[0].id
      }
    })
    return
  }
  selectedInboxAssetIds.value = []
})
function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}
function recordDestructiveWritingProtection(payload = {}) {
  const documentRole = payload.documentRole === 'exploration' ? 'exploration' : 'manuscript'
  const documentId = String(payload.documentId || payload.chapterId || '')
  const projectId = String(payload.projectId || selectedBookId.value || '')
  const document = payload.document
  if (!projectId || !documentId || !document) return false
  const snapshotKey = documentRole === 'exploration'
    ? authoringDocumentKey({ role: 'exploration', bookId: projectId, documentId })
    : documentId
  const chapter = documentRole === 'manuscript'
    ? chapters.value.find((item) => String(item?.id || '') === documentId)
    : null
  const exploration = documentRole === 'exploration'
    ? wt3ExplorationDocs.value.find((item) => String(item?.id || '') === documentId)
    : null
  const result = authoringHistory.recordProtection({
    chapterId: snapshotKey,
    chapterTitle: String(payload.title || chapter?.title || exploration?.title || ''),
    label: tr('删除前 · 修订 {value0}', { value0: Number(document.revision || 0) }),
    reason: 'before-rewrite',
    document,
    markdown: String(payload.markdown ?? getWritingDocumentMarkdown(document)),
    annotations: Array.isArray(payload.annotations)
      ? payload.annotations
      : documentRole === 'manuscript' ? (chapter?.annotations || []) : (exploration?.annotations || []),
    operation: String(payload.operation || 'delete-selection'),
    transactionId: `delete-selection:${snapshotKey}:${Number(document.revision || 0)}`
  })
  if (!result.ok) {
    snapshotStatus.value = '无法保存删除前版本，本次删除已取消。'
    authoringTask.notify(tr('无法保存删除前版本，本次删除已取消'))
    return false
  }
  if (documentRole === 'manuscript' && documentId === String(selectedChapterId.value || '')) {
    writingSnapshots.value = authoringHistory.refreshSnapshots(documentId)
  }
  return true
}
function protectMainDestructiveEdit(payload = {}) {
  const exploration = wt3ActiveDoc.value
  return recordDestructiveWritingProtection({
    ...payload,
    pane: 'main',
    projectId: selectedBookId.value,
    documentRole: exploration ? 'exploration' : 'manuscript',
    documentId: String(exploration?.id || selectedChapterId.value || ''),
    chapterId: exploration ? '' : String(selectedChapterId.value || ''),
    title: String(exploration?.title || currentChapterTitle.value || ''),
    annotations: exploration ? wt3Annotations.value : chapterAnnotations.value
  })
}
function protectDualDestructiveEdit(payload = {}) {
  return recordDestructiveWritingProtection(payload)
}
function protectCurrentRewrite(candidate) {
  const exploration = wt3ActiveDoc.value
  const persisted = exploration
    ? wt3PersistActiveDoc()?.ok === true
    : saveCurrentChapter({ automaticHistory: false })
  if (!persisted) return false
  const documentId = String(exploration?.id || selectedChapterId.value || '')
  const snapshotKey = exploration
    ? authoringDocumentKey({ role: 'exploration', bookId: selectedBookId.value, documentId })
    : documentId
  const protection = authoringHistory.recordProtection({
    chapterId: snapshotKey,
    chapterTitle: String(exploration?.title || currentChapterTitle.value || ''),
    reason: 'before-rewrite',
    document: writingDocument.value,
    markdown: getWritingDocumentMarkdown(writingDocument.value),
    annotations: exploration ? wt3Annotations.value : chapterAnnotations.value,
    operation: String(candidate?.kind || 'rewrite'),
    transactionId: String(candidate?.id || '')
  })
  if (protection.ok && !exploration) writingSnapshots.value = authoringHistory.refreshSnapshots(documentId)
  return protection.ok
}
// —— 书与世界书绑定（Task 2）——
const bookWorldbookStatus = computed(() => resolveBookWorldbookStatus({
  book: currentBook.value,
  worldbooks: worldStore.worldbooksIndex
}))
const {
  loadBooks,
  saveBooks,
  activateBook,
  openBook,
  selectBook,
  consumeActivationBoundary
} = useAuthoringBookActivation({
  route,
  books,
  chapters,
  selectedBookId,
  selectedChapterId,
  pendingBackJump,
  pendingInsertBack,
  pendingGhostAdoption,
  blockPreview,
  activeExplorationDocument: wt3ActiveDoc,
  persistExplorationBeforeLeaving: wt3PersistBeforeLeaving,
  buildOutgoingBoundary: () => buildChapterBoundaryPayload({
    previousChapterId: selectedChapterId.value,
    previousProjectId: selectedBookId.value,
    text: currentChapterDocumentText(),
    revision: currentDocumentRevision()
  }),
  saveCurrentChapter: () => saveCurrentChapter(),
  dispatchChapterBoundary,
  setAuthoringProjectId: (bookId) => gameStore.setAuthoringProjectId(bookId),
  synchronizeWorldbook: syncBookWorldbook,
  shouldRefreshAssetInbox: () => assetInboxScope.value === 'current-book',
  refreshAssetInbox,
  selectChapter,
  clearEditorDocument: () => {
    selectedChapterId.value = null
    currentChapterTitle.value = ''
    editorContent.value = ''
    markdownContent.value = ''
    clearWritingDocument()
    chapterOutlineItems.value = []
    chapterAnnotations.value = []
    resetAnnotationWorkspaceScope()
    clearCopilotReference({ silent: true })
  },
  cancelWritingAgent: () => writingAgentHost.cancelForScopeChange(),
  dismissAuxiliary: () => authoringTask.dismissAuxiliary(),
  clearPendingPersist: () => authoringTask.clearPendingPersist(),
  closeBlockComposer: () => {
    if (blockComposer.open) closeBlockComposer()
  },
  closeChapterDrawer,
  markSaved: () => { saveStatus.value = 'saved' },
  notify: (message) => authoringTask.notify(message)
})
function selectChapter(chapterId) {
  if (pendingGhostAdoption.value) {
    authoringTask.notify(tr('推演正文尚未保存，请先重试保存或留在当前章节'))
    return false
  }
  if (blockPreview.value) {
    authoringTask.notify(tr('推演草稿尚未处理，请先采用或丢弃'))
    return false
  }
  // Phase 1：离开探索文档先持久化（含批注），再进入章节管线。
  const chapter = chapters.value.find((item) => item.id === chapterId)
  if (!chapter) return false
  if (wt3ActiveDoc.value && !wt3PersistBeforeLeaving()?.ok) return false
  writingAgentHost.cancelForScopeChange()
  if (blockComposer.open) closeBlockComposer()
  // 复验修复 1：activateBook 已按旧书 ID 记过换书 boundary 并保存——
  // 这里若再记一次会把旧章节派生到新书 ID（selectedBookId 已切换）。
  if (!consumeActivationBoundary() && selectedChapterId.value && selectedChapterId.value !== chapterId) {
    // 章节边界：对上一章做一次去重后的有界派生，不重扫整个项目。
    const outgoingBoundary = {
      scopeKey: `chapter:${selectedChapterId.value}`,
      text: currentChapterDocumentText(),
      sourceRefs: [`chapter:${selectedChapterId.value}`],
      revision: currentDocumentRevision(),
      memoryProjectId: selectedBookId.value || ''
    }
    if (!saveCurrentChapter()) {
      authoringTask.notify(tr('当前章节保存失败，未切换章节'))
      return false
    }
    authoringHistory.closeBlockHistorySessions({ chapterId: selectedChapterId.value })
    dispatchChapterBoundary(outgoingBoundary)
  }
  cancelChapterReview()
  writingAgentHost.cancelForScopeChange()
  resetAnnotationWorkspaceScope()
  clearCopilotReference({ silent: true })
  authoringTask.clearPendingPersist()
  // 候选与正文事务一样绑定当前作用域：旧章节的下一步/涌现候选不得跨章插入。
  authoringTask.dismissAuxiliary()
  composerFailure.value = null
  selectedChapterId.value = chapterId
  currentChapterTitle.value = chapter.title || ''
  sceneAnchors.value = normalizeSceneAnchors(chapter.sceneAnchors)
  lastSceneAnchorUndoReceipt.value = null
  const { raw, format } = readChapterSource(chapter)
  const fallbackMarkdown = format === 'md' ? raw : htmlToMarkdown(raw)
  markdownContent.value = loadChapterDocument(chapter, fallbackMarkdown)
  editorContent.value = markdownToHtml(markdownContent.value)
  chapterOutlineItems.value = normalizeChapterOutlineItems(chapter.outlineItems || [])
  chapterAnnotations.value = reconcileWritingAnnotations(
    chapter.annotations,
    writingDocument.value,
    chapter.id
  )
  loadChapterSnapshots(chapter.id)
  editorHistory.clear()
  nextTick(() => {
    if (editorRef.value) editorRef.value.value = markdownContent.value
  })
  closeChapterDrawer()
  return true
}
function createNewBook({ clearRouteIntent = false } = {}) {
  showNewBookModal.value = true
  newBookTitle.value = ''
  newBookLanguage.value = uiLocale.value
  newBookDesc.value = ''
  newBookWorldbookId.value = ''
  void worldStore.loadWorldbooksIndex()
  nextTick(() => newBookInput.value?.focus())
  if (!clearRouteIntent || String(route.query.start || '') !== 'new') return
  const query = { ...route.query }
  delete query.start
  void router.replace({ name: 'authoring', query })
}
function openManuscriptImport({ clearRouteIntent = false } = {}) {
  if (!showManuscriptImport.value) manuscriptImportReturnFocus.value = document.activeElement
  showManuscriptImport.value = true
  if (!clearRouteIntent || String(route.query.start || '') !== 'import') return
  const query = { ...route.query }
  delete query.start
  void router.replace({ name: 'authoring', query })
}
function closeManuscriptImport() {
  showManuscriptImport.value = false
  const returnTarget = manuscriptImportReturnFocus.value
  manuscriptImportReturnFocus.value = null
  nextTick(() => {
    if (returnTarget?.isConnected) returnTarget.focus()
  })
}
function confirmManuscriptImport(book, respond = null) {
  if (!book?.id || !Array.isArray(book.chapters) || !book.chapters.length) {
    authoringTask.notify(tr('书稿结构无效，未执行导入'))
    respond?.(false)
    return false
  }
  const previousBooks = books.value
  books.value = [...books.value, book]
  if (!saveBooks()) {
    books.value = previousBooks
    authoringTask.notify(tr('导入未能保存，请检查浏览器存储空间'))
    respond?.(false)
    return false
  }
  showManuscriptImport.value = false
  manuscriptImportReturnFocus.value = null
  selectBook(book.id)
  authoringTask.notify(tr('已导入《{value0}》· {value1} 章', { value0: book.title, value1: book.chapters.length }))
  respond?.(true)
  return true
}
function setManuscriptLanguage(value) {
  const book = currentBook.value
  if (!book) return
  const previous = book.manuscriptLanguage
  const next = normalizeManuscriptLanguage(value)
  if (next) book.manuscriptLanguage = next
  else delete book.manuscriptLanguage
  if (!saveBooks()) {
    if (previous === undefined) delete book.manuscriptLanguage
    else book.manuscriptLanguage = previous
    authoringTask.notify(tr('作品语言未能保存，请重试。'))
  } else {
    markRewriteCandidatesStale()
    reviewWorkflow.reconcile()
  }
}
function confirmCreateBook() {
  if (!newBookTitle.value.trim()) return
  const createdAt = new Date().toISOString()
  const newBook = createWritingBookRecord({
    title: newBookTitle.value.trim(),
    description: newBookDesc.value.trim(),
    manuscriptLanguage: newBookLanguage.value,
    worldbookId: String(newBookWorldbookId.value || '')
  })
  newBook.chapters = [{
    id: `${Date.now()}-chapter-1`,
    title: newBookLanguage.value === 'en' ? 'Chapter 1' : '第一章',
    content: '',
    contentFormat: 'md',
    outlineItems: [],
    wordCount: 0,
    createdAt,
    updatedAt: createdAt
  }]
  const previousBooks = books.value
  books.value = [...books.value, newBook]
  if (!saveBooks()) {
    books.value = previousBooks
    authoringTask.notify(tr('书稿未能保存，请检查浏览器存储空间'))
    return
  }
  selectBook(newBook.id)
  showNewBookModal.value = false
  nextTick(() => requestAnimationFrame(() => notebookEditorRef.value?.focus?.({ scrollIntoView: false })))
}
// 显式换绑当前书的世界书：有受影响锚点时先请求确认；
// 写入 book.worldbookId 后精确加载该世界书并刷新现场。
async function bindSelectedBookWorldbook(nextId, { confirmed = false } = {}) {
  const book = currentBook.value
  if (!book) return { ok: false, reason: 'no-book' }
  const bookId = String(book.id || '')
  const preview = previewWorldbookRebind({ book, nextWorldbookId: nextId })
  if (preview.requiresConfirmation && !confirmed) {
    return { ok: false, reason: 'confirmation-required', preview }
  }
  const bindingId = String(nextId || '')
  let preloadedWorldbook = null
  if (bindingId) {
    try {
      preloadedWorldbook = await worldStore.loadWorldbookForProject(bindingId)
    } catch {
      preloadedWorldbook = null
    }
    if (!preloadedWorldbook) return { ok: false, reason: 'missing-worldbook' }
  }
  // 选择器打开期间用户可能已切书；异步加载完成后不得改写另一书的绑定。
  if (String(currentBook.value?.id || '') !== bookId) return { ok: false, reason: 'stale' }
  const previousWorldbookId = book.worldbookId
  const previousChapters = book.chapters
  const migration = bindingId
    ? bindUnboundSceneAnchors({ chapters: book.chapters, nextWorldbookId: bindingId })
    : detachSceneAnchorsFromWorldbook({ chapters: book.chapters })
  book.worldbookId = bindingId
  book.chapters = migration.chapters
  if (String(book.id) === String(selectedBookId.value)) chapters.value = book.chapters
  if (saveBooks() === false) {
    book.worldbookId = previousWorldbookId
    book.chapters = previousChapters
    if (String(book.id) === String(selectedBookId.value)) chapters.value = previousChapters
    return { ok: false, reason: 'persist' }
  }
  if ((migration.migratedAnchorCount || migration.clearedReferenceCount) && String(book.id) === String(selectedBookId.value)) {
    const chapter = chapters.value.find((item) => String(item.id) === String(selectedChapterId.value))
    sceneAnchors.value = normalizeSceneAnchors(chapter?.sceneAnchors)
  }
  const synchronized = await syncBookWorldbook(book, book.id)
  const loaded = synchronized || (String(selectedBookId.value || '') === bookId ? preloadedWorldbook : null)
  if (!synchronized && loaded && String(selectedBookId.value || '') === bookId) boundWorldbook.value = loaded
  refreshAuthoringObserverState()
  return {
    ok: Boolean(loaded || !bindingId.trim()),
    worldbook: loaded,
    migratedAnchorCount: migration.migratedAnchorCount || 0,
    clearedReferenceCount: migration.clearedReferenceCount || 0
  }
}
// 绑定选择的内联交互（一行文字 + 文字动作，无卡片）。
const bindingSelectOpen = ref(false)
const bindingDraftWorldbookId = ref('')
async function openBindingSelect() {
  void worldStore.loadWorldbooksIndex()
  bindingDraftWorldbookId.value = selectedBookWorldbookId.value
  bindingSelectOpen.value = true
}
async function confirmBindingSelect() {
  const nextId = String(bindingDraftWorldbookId.value || '')
  let result = await bindSelectedBookWorldbook(nextId)
  if (result.reason === 'confirmation-required') {
    const confirmed = window.confirm(nextId
      ? tr('换绑世界书将使 {value0} 个旧现场需要重新确认，继续？', { value0: result.preview.affectedAnchorCount })
      : tr('解除关联将保留时间，但移除 {value0} 个现场中的人物与地点引用，继续？', { value0: result.preview.affectedAnchorCount }))
    if (!confirmed) return
    result = await bindSelectedBookWorldbook(nextId, { confirmed: true })
  }
  if (!result.ok) {
    authoringTask.notify(result.reason === 'stale'
      ? tr('书稿已切换，本次关联未写入')
      : nextId ? tr('世界书不可用，已保留原关联') : tr('解除关联失败，已保留原关联'))
    return
  }
  bindingSelectOpen.value = false
}
function createNewChapter() {
  if (!selectedBookId.value || pendingGhostAdoption.value || wt3ActiveDoc.value) return false
  const newChapter = {
    id: Date.now().toString(),
    title: '',
    content: '',
    contentFormat: 'md',
    outlineItems: [],
    wordCount: 0,
    createdAt: new Date().toISOString()
  }
  chapters.value.push(newChapter)
  if (!saveChapters()) {
    chapters.value.pop()
    authoringTask.notify(tr('新章节保存失败，请检查存储空间'))
    return false
  }
  return selectChapter(newChapter.id)
}
function deleteChapter(chapterId) {
  if (pendingGhostAdoption.value || wt3ActiveDoc.value) return false
  const previous = chapters.value
  const next = previous.filter((chapter) => chapter.id !== chapterId)
  if (next.length === previous.length) return false
  chapters.value = next
  if (!saveChapters()) {
    chapters.value = previous
    authoringTask.notify(tr('删除章节失败，正文未变更'))
    return false
  }
  authoringHistory.removeChapter(chapterId)
  if (selectedChapterId.value === chapterId) {
    selectedChapterId.value = null
    if (next[0]) selectChapter(next[0].id)
    else {
      currentChapterTitle.value = ''
      editorContent.value = ''
      markdownContent.value = ''
      clearWritingDocument()
      chapterOutlineItems.value = []
      loadChapterSnapshots(null)
    }
  }
  return true
}
function saveChapters() {
  const book = books.value.find(b => b.id === selectedBookId.value)
  if (book) {
    book.chapters = chapters.value
    book.updatedAt = new Date().toISOString()
    return saveBooks()
  }
  return false
}
function saveDualChapter({ chapterId = '', title = '', markdown = '', document = null, wordCount: nextWordCount = 0, automaticHistory = true } = {}) {
  const chapter = chapters.value.find((item) => String(item?.id) === String(chapterId))
  if (!chapter || !document) return false
  const previous = {
    title: chapter.title,
    content: chapter.content,
    contentFormat: chapter.contentFormat,
    editorDocument: chapter.editorDocument,
    editorDocumentSchemaVersion: chapter.editorDocumentSchemaVersion,
    wordCount: chapter.wordCount,
    updatedAt: chapter.updatedAt
  }
  const clonedDocument = JSON.parse(JSON.stringify(document))
  chapter.title = String(title || chapter.title || '')
  chapter.content = String(markdown || '')
  chapter.contentFormat = 'md'
  chapter.editorDocument = clonedDocument
  chapter.editorDocumentSchemaVersion = Number(clonedDocument.schemaVersion || 3)
  chapter.wordCount = Number(nextWordCount || 0)
  chapter.updatedAt = new Date().toISOString()
  if (!saveChapters()) {
    Object.assign(chapter, previous)
    return false
  }
  if (automaticHistory) recordAutomaticHistoryAfterPersist({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    previousDocument: previous.editorDocument,
    previousMarkdown: previous.content,
    persistedDocument: clonedDocument,
    persistedMarkdown: chapter.content,
    annotations: chapter.annotations || []
  })
  // 作家助手桌面双栏允许同一章在两个位置同时打开。Pinax 仍只保留
  // 一个 document handle：副栏编辑时把共享文档投影回主栏，而不是让
  // 两个编辑器各自持久化一份互相覆盖的正文。
  if (!wt3ActiveDoc.value && String(selectedChapterId.value) === String(chapterId)) {
    currentChapterTitle.value = chapter.title
    markdownContent.value = chapter.content
    writingDocument.value = clonedDocument
    editorContent.value = markdownToHtml(chapter.content)
  }
  return true
}
function saveDualExploration({ documentId = '', title = '', markdown = '', document = null } = {}) {
  const target = wt3ExplorationDocs.value.find((doc) => String(doc?.id) === String(documentId))
  if (!target || !document) return false
  const result = saveExplorationDocument(selectedBookId.value, documentId, {
    title: String(title || target.title || ''),
    content: String(markdown || '')
  })
  if (!result?.ok) return false
  wt3RefreshDocs()
  if (String(wt3ActiveDocId.value) === String(documentId)) {
    markdownContent.value = String(markdown || '')
    writingDocument.value = JSON.parse(JSON.stringify(document))
    editorContent.value = markdownToHtml(markdownContent.value)
  }
  return true
}
// 自动保存只负责落盘。语义观察器在章节/页面边界消费这段时间真正改过的
// 稳定文本节点；同一节点连续修改只保留最后版本，避免每秒重扫整章。
const pendingObserverNodesByChapter = new Map()
function observerScheduleAcknowledged(receipt) {
  const schedule = receipt?.observerSchedule
  return Boolean(schedule?.accepted
    || ['duplicate-pending', 'duplicate-executed'].includes(schedule?.reason))
}
// 直接观察与章节边界共享一份 changed-node backlog。这里只确认本次确实
// 已进入观察器队列的 unit/revision；同章其他单元、以及等待期间又编辑出的
// 同单元新 revision 必须继续留给 boundary，不能整章清空。
function acknowledgePendingObserverUnit({ chapterId = '', unitId = '', unitRevision = 0 } = {}) {
  const chapterKey = String(chapterId || '')
  const unitKey = String(unitId || '')
  if (!chapterKey || !unitKey) return 0
  const pending = pendingObserverNodesByChapter.get(chapterKey)
  if (!pending) return 0
  let removed = 0
  for (const [nodeId, item] of pending) {
    if (
      String(item?.unitId || '') === unitKey
      && Number(item?.unitRevision || 0) <= Number(unitRevision || 0)
    ) {
      pending.delete(nodeId)
      removed += 1
    }
  }
  if (!pending.size) pendingObserverNodesByChapter.delete(chapterKey)
  return removed
}
async function commitDirectAuthoringObservation(payload = {}) {
  // 捕获调用时目标，避免 await provider/bridge 期间移动光标后确认错 unit。
  const target = Object.freeze({
    ...payload,
    sourceRefs: Object.freeze([...(Array.isArray(payload.sourceRefs) ? payload.sourceRefs : [])])
  })
  const receipt = await gameStore.commitAuthoringProseResult(target)
  if (
    observerScheduleAcknowledged(receipt)
    && String(target.documentId || '') === String(target.chapterId || '')
  ) {
    acknowledgePendingObserverUnit(target)
  }
  return receipt
}
function collectChangedWritingNodes(previousDocument, nextDocument) {
  const previousById = new Map()
  for (const unit of previousDocument?.content || []) {
    for (const node of unit?.content || []) {
      const nodeId = String(node?.attrs?.nodeId || '')
      if (!nodeId) continue
      previousById.set(nodeId, {
        text: getWritingBlockText(node).trim(),
        unitId: String(unit?.attrs?.unitId || '')
      })
    }
  }
  const changed = []
  for (const unit of nextDocument?.content || []) {
    for (const node of unit?.content || []) {
      const nodeId = String(node?.attrs?.nodeId || '')
      const text = getWritingBlockText(node).trim()
      const unitId = String(unit?.attrs?.unitId || '')
      const previous = previousById.get(nodeId)
      if (!nodeId || !text || (previous?.text === text && previous?.unitId === unitId)) continue
      changed.push({
        nodeId,
        text,
        // NC04：携带改前文本，供 pending delta 裁剪出真实变更切片。
        previousText: previous?.text || '',
        unitId,
        unitRevision: Number(unit?.attrs?.unitRevision || 0)
      })
    }
  }
  return changed
}
// 清空节点、删除节点/单元、或把节点迁到另一单元时都没有可供 observer
// 重算的正文，但旧候选仍需按原 unit 失效。文本改写本身由调度器在重算前
// 统一失效，避免这里与正常 derive 重复做两次。
function collectInvalidatedWritingUnits(previousDocument, nextDocument) {
  const nextById = new Map()
  for (const unit of nextDocument?.content || []) {
    for (const node of unit?.content || []) {
      const nodeId = String(node?.attrs?.nodeId || '')
      if (!nodeId) continue
      nextById.set(nodeId, {
        text: getWritingBlockText(node).trim(),
        unitId: String(unit?.attrs?.unitId || '')
      })
    }
  }
  const invalidated = new Set()
  for (const unit of previousDocument?.content || []) {
    const previousUnitId = String(unit?.attrs?.unitId || '')
    if (!previousUnitId) continue
    for (const node of unit?.content || []) {
      const nodeId = String(node?.attrs?.nodeId || '')
      const previousText = getWritingBlockText(node).trim()
      if (!nodeId || !previousText) continue
      const next = nextById.get(nodeId)
      if (!next?.text || next.unitId !== previousUnitId) invalidated.add(previousUnitId)
    }
  }
  return [...invalidated]
}
// NC04：取前后文本的最长公共前后缀，中间切片即真实变更；
// 全新内容（无改前文本）退化为整段 after。
function trimToChangedSlice(before, after) {
  const beforeText = String(before || '')
  const afterText = String(after || '')
  if (!beforeText) return afterText.trim()
  if (beforeText === afterText) return ''
  let prefix = 0
  const maxPrefix = Math.min(beforeText.length, afterText.length)
  while (prefix < maxPrefix && beforeText[prefix] === afterText[prefix]) prefix += 1
  let suffix = 0
  const maxSuffix = Math.min(beforeText.length - prefix, afterText.length - prefix)
  while (suffix < maxSuffix && beforeText[beforeText.length - 1 - suffix] === afterText[afterText.length - 1 - suffix]) suffix += 1
  const slice = afterText.slice(prefix, afterText.length - suffix)
  return slice.trim()
}

function rememberPendingObserverNodes(chapterId, changedNodes) {
  const key = String(chapterId || '')
  if (!key || !changedNodes.length) return
  const pending = pendingObserverNodesByChapter.get(key) || new Map()
  for (const node of changedNodes) {
    // delete + set 让最新改动排到末尾；后续预算优先保留最近编辑的节点。
    pending.delete(node.nodeId)
    pending.set(node.nodeId, node)
  }
  while (pending.size > 24) pending.delete(pending.keys().next().value)
  pendingObserverNodesByChapter.set(key, pending)
}
function listPendingObserverDeltas(chapterId, maxCharsPerUnit = 5000) {
  const pending = pendingObserverNodesByChapter.get(String(chapterId || ''))
  if (!pending?.size) return []
  const grouped = new Map()
  for (const item of pending.values()) {
    const unitId = String(item?.unitId || '')
    if (!unitId || !String(item?.text || '').trim()) continue
    const items = grouped.get(unitId) || []
    items.push(item)
    grouped.set(unitId, items)
  }
  return [...grouped.entries()].map(([unitId, items]) => {
    // NC04：逐节点裁剪出真实变更切片。有改前文本的节点是真实编辑，
    // 优先派生；新节点（无改前文本，段落拆分等）的整段文本只在没有
    // 真实编辑切片时兜底，避免与本次改动无关的块开头被反复摘成“记忆”。
    const editedSlices = []
    const createdSlices = []
    let used = 0
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      const afterText = String(item.text || '').trim()
      const beforeText = String(item.previousText || '').trim()
      const remaining = Math.max(0, maxCharsPerUnit - used)
      if (!remaining) break
      const slice = trimToChangedSlice(beforeText, afterText)
      if (!slice) continue
      const bounded = slice.length > remaining ? slice.slice(slice.length - remaining) : slice
      if (beforeText) editedSlices.unshift(bounded)
      else createdSlices.unshift(bounded)
      used += Math.min(slice.length, remaining) + 2
    }
    const chosen = editedSlices.length ? editedSlices : createdSlices
    return {
      changedText: chosen.join('\n\n').trim(),
      unitId,
      unitRevision: Math.max(0, ...items.map((item) => Number(item?.unitRevision || 0))),
      // 保存对象快照而不只保存 nodeId：等待异步 boundary 回执期间同一节点
      // 可能再次编辑，确认旧快照时绝不能误删新 revision。
      pendingNodes: Object.freeze([...items])
    }
  }).filter((delta) => delta.changedText)
}
function acknowledgePendingObserverNodes(chapterId, pendingNodes = []) {
  const chapterKey = String(chapterId || '')
  const pending = pendingObserverNodesByChapter.get(chapterKey)
  if (!pending?.size) return 0
  let removed = 0
  for (const expected of pendingNodes) {
    const nodeId = String(expected?.nodeId || '')
    if (!nodeId || pending.get(nodeId) !== expected) continue
    pending.delete(nodeId)
    removed += 1
  }
  if (!pending.size) pendingObserverNodesByChapter.delete(chapterKey)
  return removed
}
function dispatchChapterBoundary(payload) {
  if (!payload) return null
  const chapterId = String(payload.scopeKey || '').replace(/^chapter:/, '')
  const deltas = listPendingObserverDeltas(chapterId)
  if (!deltas.length) return null
  const dispatches = deltas.map((delta) => Promise.resolve(gameStore.noteAuthoringBoundary({
    ...payload,
    scopeKey: `${payload.scopeKey}:unit:${delta.unitId}`,
    changedText: delta.changedText,
    unitId: delta.unitId,
    unitRevision: delta.unitRevision,
    chapterId,
    sourceRefs: [...new Set([...(payload.sourceRefs || []), `unit:${delta.unitId}`])],
    sourceDocumentRevision: payload.revision
  })).then((result) => {
    if (result?.derived) acknowledgePendingObserverNodes(chapterId, delta.pendingNodes)
    return result
  }).catch(() => {
    authoringObserverWarning.value = normalizeAuthoringFailure({
      phase: 'observer',
      code: 'AUTHORING_OBSERVER_BOUNDARY_FAILED',
      message: tr('章节已保存，部分记忆观察将在下次离开章节时重试'),
      retryable: true
    })
    return null
  }))
  return Promise.allSettled(dispatches)
}
function buildCurrentChapterObserverBoundary() {
  return buildChapterBoundaryPayload({
    previousChapterId: selectedChapterId.value,
    previousProjectId: selectedBookId.value,
    text: currentChapterDocumentText(),
    revision: currentDocumentRevision()
  })
}
function saveCurrentChapter({ preservePageOutline = false, automaticHistory = true } = {}) {
  clearPendingDocumentSaveTimers()
  // Phase 1 防御：探索文档激活期间正文保存管线必须离场；
  // 正常离开路径已由 wt3PersistBeforeLeaving 先清 handle 并恢复章内容。
  if (wt3ActiveDoc.value) return false
  if (!selectedChapterId.value) return false
  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (!chapter) return false
  const chapterBeforeSave = {
    title: chapter.title,
    editorDocument: chapter.editorDocument,
    editorDocumentSchemaVersion: chapter.editorDocumentSchemaVersion,
    content: chapter.content,
    contentFormat: chapter.contentFormat,
    outlineItems: chapter.outlineItems,
    annotations: chapter.annotations,
    sceneAnchors: chapter.sceneAnchors,
    wordCount: chapter.wordCount,
    updatedAt: chapter.updatedAt
  }
  const book = books.value.find((item) => item.id === selectedBookId.value)
  const previousBookUpdatedAt = book?.updatedAt
  const previousDocument = chapter.editorDocument || null
  chapter.title = currentChapterTitle.value
  syncFromCurrentEditor()
  const nextDocument = persistChapterDocument(chapter, markdownContent.value)
  chapter.outlineItems = normalizeChapterOutlineItems(chapterOutlineItems.value)
  chapterAnnotations.value = reconcileWritingAnnotations(
    chapterAnnotations.value,
    writingDocument.value,
    chapter.id
  )
  chapter.annotations = normalizeWritingAnnotations(chapterAnnotations.value, chapter.id)
  // 锚点随章节数据一起持久化（Task 4）。
  chapter.sceneAnchors = normalizeSceneAnchors(sceneAnchors.value)
  chapter.wordCount = wordCount.value
  chapter.updatedAt = new Date().toISOString()
  const saved = preservePageOutline ? (() => {
    if (!book) return false
    book.chapters = chapters.value
    book.updatedAt = new Date().toISOString()
    return saveBooks({ preserveOutlineBookId: selectedBookId.value })
  })() : saveChapters()
  if (!saved) {
    Object.assign(chapter, chapterBeforeSave)
    if (book) book.updatedAt = previousBookUpdatedAt
    saveStatus.value = 'error'
    return false
  }
  if (saved) rememberPendingObserverNodes(
    chapter.id,
    collectChangedWritingNodes(previousDocument, nextDocument)
  )
  if (saved && previousDocument) {
    const invalidatedUnitIds = collectInvalidatedWritingUnits(previousDocument, nextDocument)
    if (invalidatedUnitIds.length) {
      void gameStore.handleAuthoringProseUndo({
        sourceRefs: invalidatedUnitIds.map((unitId) => `unit:${unitId}`),
        revision: currentDocumentRevision(),
        reason: 'prose-source-removed'
      }).catch(() => {
        authoringObserverWarning.value = normalizeAuthoringFailure({
          phase: 'observer',
          code: 'AUTHORING_OBSERVER_INVALIDATION_FAILED',
          message: tr('正文已保存，旧记忆来源将在稍后刷新'),
          retryable: true
        })
      })
    }
  }
  if (automaticHistory && previousDocument) {
    recordAutomaticHistoryAfterPersist({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      previousDocument,
      previousMarkdown: chapterBeforeSave.content,
      persistedDocument: nextDocument,
      persistedMarkdown: chapter.content,
      annotations: chapter.annotations
    })
  }
  if (saved && previousDocument) {
    const historyEntries = buildWritingBlockHistoryEntries({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      previousDocument,
      nextDocument,
      source: 'manual-save'
    })
    if (historyEntries.length) {
      authoringHistory.appendBlockEntries(historyEntries)
      writingBlockHistory.value = authoringHistory.refreshBlockHistory(chapter.id)
    }
  }
  cancelRecoveryDraftSchedule()
  authoringHistory.clearRecovery(chapter.id)
  writingRecoveryDraft.value = null
  saveStatus.value = 'saved'
  return true
}
// 插入分隔线
function insertSeparator() {
  if (activeWritingPane.value === 'dual') {
    if (rejectActiveWritingMutation()) return
    dualPaneRef.value?.runCommand?.('insertDivider')
    return
  }
  if (rejectLockedNotebookMutation()) return
  if (notebookEditorActive.value && notebookEditorRef.value) {
    notebookEditorRef.value.insertDivider()
    return
  }
  const editor = editorRef.value
  if (!editor) return
  const start = editor.selectionStart ?? markdownContent.value.length
  const end = editor.selectionEnd ?? markdownContent.value.length
  const sepText = '—— · ——\n\n'
  markdownContent.value = markdownContent.value.slice(0, start) + sepText + markdownContent.value.slice(end)
  nextTick(() => {
    editor.focus()
    const pos = start + sepText.length
    editor.setSelectionRange(pos, pos)
  })
  syncMarkdownToEditor()
  onContentChange()
}
const generatedNameBatches = new Map()
function currentNameBatchKey() {
  if (nameCategory.value !== 'person') return nameCategory.value
  return [nameCategory.value, nameStyle.value, nameLength.value, nameGender.value, fixedSurname.value.trim()].join(':')
}
function doGenerateName() {
  if (nameEntityBusy.value) return
  activeNameEntityMenu.value = ''
  pendingNameEntityCommand.value = null
  nameEntityConflicts.value = []
  nameEntityNotice.value = ''
  nameEntityNoticeKind.value = ''
  lastNameEntityReceipt.value = null
  const batchKey = currentNameBatchKey()
  const recentBatches = generatedNameBatches.get(batchKey) || []
  const recentValues = recentBatches.flat()
  let values = generateWritingNames({
    category: nameCategory.value,
    language: nameStyle.value,
    length: nameLength.value,
    gender: nameGender.value,
    surname: fixedSurname.value,
    exclude: recentValues,
    count: 12
  })
  // 当前分类空间用尽后只清除此筛选组合，不影响其他类型最近十批。
  if (!values.length) {
    generatedNameBatches.delete(batchKey)
    values = generateWritingNames({
      category: nameCategory.value,
      language: nameStyle.value,
      length: nameLength.value,
      gender: nameGender.value,
      surname: fixedSurname.value,
      count: 12
    })
  }
  generatedNameBatches.set(batchKey, [...recentBatches, values].slice(-10))
  generatedNames.value = values.map((value, index) => ({
    value,
    note: explainWritingName({ category: nameCategory.value, value, index })
  }))
}
function openNameGenerator() {
  showFontPanel.value = false
  closeSearchPanel({ restore: false })
  closeReviewPanel({ restore: false })
  showQuickWords.value = false
  showNameGen.value = true
  doGenerateName()
}
function toggleQuickWords() {
  showFontPanel.value = false
  closeSearchPanel({ restore: false })
  closeReviewPanel({ restore: false })
  showNameGen.value = false
  showQuickWords.value = !showQuickWords.value
}
function toggleQuickWord(id) {
  const key = String(id || '')
  if (!quickWordCatalog.value.some((item) => item.id === key)) return false
  quickWordEnabledIds.value = quickWordEnabledIds.value.includes(key)
    ? quickWordEnabledIds.value.filter((item) => item !== key)
    : [...quickWordEnabledIds.value, key]
  return true
}
function insertQuickWord(value) {
  const insertion = String(value || '')
  if (!insertion || writingCompositionActive.value || dualCompositionActive.value) return false
  if (rejectActiveWritingMutation()) return false
  if (activeWritingPane.value === 'dual') return Boolean(dualPaneRef.value?.runCommand?.('insertText', insertion))
  if (!notebookEditorActive.value || !notebookEditorRef.value) return false
  return Boolean(notebookEditorRef.value.insertText(insertion))
}
function recordQuickWordUse(item) {
  const id = String(item?.id || '')
  const bookId = String(selectedBookId.value || '')
  if (!id || !bookId) return
  const current = quickWordRecentIdsByBook.get(bookId) || []
  quickWordRecentIdsByBook.set(bookId, [id, ...current.filter((candidate) => candidate !== id)].slice(0, 24))
}
function completeQuickWord(item) {
  const value = String(item?.text || '')
  const prefix = quickWordPrefix.value
  if (!prefix || !value.startsWith(prefix)) return false
  const inserted = insertQuickWord(value.slice(prefix.length))
  if (inserted) recordQuickWordUse(item)
  return inserted
}
function closeNameGenerator({ force = false } = {}) {
  if (nameEntityBusy.value && !force) return
  showNameGen.value = false
  activeNameEntityMenu.value = ''
  pendingNameEntityCommand.value = null
  nameEntityConflicts.value = []
  nameEntityNotice.value = ''
  nameEntityNoticeKind.value = ''
}
function nameEntityCategoryLabel(category) {
  return nameCategoryOptions.find((item) => item.value === category)?.label || '设定'
}
function createNameEntitySelection(item) {
  const value = typeof item === 'object' ? item?.value : item
  const rationale = typeof item === 'object' ? item?.note : ''
  return createAuthoringEntitySelection({
    text: value,
    category: nameCategory.value,
    projectId: selectedBookId.value,
    rationale
  })
}
function insertNameEntitySelection(selection) {
  if (!selection || String(selection.projectId || '') !== String(selectedBookId.value || '')) return false
  if (activeWritingPane.value === 'dual') {
    if (rejectActiveWritingMutation()) return false
    if (!dualPaneRef.value?.runCommand?.('insertText', selection.text)) return false
    closeNameGenerator({ force: true })
    generatedNames.value = []
    return true
  }
  if (rejectLockedNotebookMutation()) return false
  if (notebookEditorActive.value && notebookEditorRef.value) {
    if (!notebookEditorRef.value.insertText(selection.text)) return false
    closeNameGenerator({ force: true })
    generatedNames.value = []
    return true
  }
  const editor = editorRef.value
  if (!editor) return false
  const name = selection.text
  const start = editor.selectionStart ?? markdownContent.value.length
  const end = editor.selectionEnd ?? markdownContent.value.length
  markdownContent.value = markdownContent.value.slice(0, start) + name + markdownContent.value.slice(end)
  nextTick(() => {
    editor.focus()
    const pos = start + name.length
    editor.setSelectionRange(pos, pos)
  })
  syncMarkdownToEditor()
  onContentChange()
  closeNameGenerator({ force: true })
  generatedNames.value = []
  return true
}
function selectName(item) {
  return insertNameEntitySelection(createNameEntitySelection(item))
}
function toggleNameEntityMenu(item) {
  if (nameEntityBusy.value) return
  const key = String(item?.value || '')
  activeNameEntityMenu.value = activeNameEntityMenu.value === key ? '' : key
  pendingNameEntityCommand.value = null
  nameEntityConflicts.value = []
  nameEntityNotice.value = ''
  nameEntityNoticeKind.value = ''
  lastNameEntityReceipt.value = null
}
function currentNameEntityTarget() {
  const projectId = String(selectedBookId.value || '')
  const worldbookId = String(selectedBookWorldbookId.value || '')
  if (
    !projectId
    || !worldbookId
    || boundWorldbookSyncing.value
    || !boundWorldbookSyncReady()
    || bookWorldbookStatus.value.status !== 'bound'
    || String(currentBook.value?.id || '') !== projectId
    || String(boundWorldbook.value?.id || '') !== worldbookId
  ) return null
  return { projectId, worldbookId, book: currentBook.value, worldbook: boundWorldbook.value }
}
async function requestNameEntityCreation(item) {
  if (nameEntityBusy.value) return false
  const selection = createNameEntitySelection(item)
  const target = currentNameEntityTarget()
  if (!selection || !target) {
    activeNameEntityMenu.value = ''
    nameEntityNoticeKind.value = 'needs-binding'
    nameEntityNotice.value = boundWorldbookSyncing.value ? tr('正在读取当前书的世界书，请稍后再试') : tr('请先为当前书关联世界书')
    return false
  }
  const command = createAuthoringEntityEntryCommand(selection, target)
  if (!command) {
    nameEntityNoticeKind.value = 'error'
    nameEntityNotice.value = tr('当前书或世界书已经变化，请重新选择名称')
    return false
  }
  const conflicts = findAuthoringEntitySelectionConflicts(selection, target.worldbook)
  if (conflicts.length) {
    activeNameEntityMenu.value = ''
    pendingNameEntityCommand.value = command
    nameEntityConflicts.value = conflicts
    nameEntityNotice.value = ''
    nameEntityNoticeKind.value = ''
    nextTick(() => document.querySelector('.quick-name-conflict')?.scrollIntoView({ block: 'nearest' }))
    return false
  }
  return persistNameEntityCommand(command)
}
async function persistNameEntityCommand(command) {
  if (nameEntityBusy.value || command?.kind !== 'create-worldbook-entry') return false
  const target = currentNameEntityTarget()
  if (!target || target.projectId !== command.projectId || target.worldbookId !== command.worldbookId) {
    nameEntityNoticeKind.value = 'error'
    nameEntityNotice.value = tr('当前书或世界书已经变化，本次没有写入')
    return false
  }
  if (!command.allowDuplicate) {
    const liveConflicts = findAuthoringEntitySelectionConflicts(command.selection, target.worldbook)
    if (liveConflicts.length) {
      pendingNameEntityCommand.value = command
      nameEntityConflicts.value = liveConflicts
      nextTick(() => document.querySelector('.quick-name-conflict')?.scrollIntoView({ block: 'nearest' }))
      return false
    }
  }
  const entryDraft = buildAuthoringEntityEntry(command)
  if (!entryDraft) return false
  nameEntityBusy.value = true
  nameEntityNotice.value = ''
  nameEntityNoticeKind.value = ''
  let entry = null
  let recovered = false
  try {
    entry = await worldStore.addEntry(command.worldbookId, entryDraft)
  } catch (error) {
    // 条目正文写成功、索引保存失败时 addEntry 会抛错。按一次性 selection ID
    // 从持久化快照对账，避免作者重试造成第二个同名条目。
    const snapshot = readWorldbookSnapshot(command.worldbookId)
    entry = (snapshot?.entries || []).find((candidate) => (
      String(candidate?.metadata?.authoringSelectionId || '') === String(command.selection.id)
    )) || null
    recovered = Boolean(entry)
    if (!entry) {
      nameEntityNoticeKind.value = 'error'
      nameEntityNotice.value = error?.message || tr('世界书条目创建失败，请稍后重试')
      nameEntityBusy.value = false
      return false
    }
  }
  const receipt = createAuthoringEntitySelectionReceipt(command, { entry })
  lastNameEntityReceipt.value = receipt
  pendingNameEntityCommand.value = null
  nameEntityConflicts.value = []
  activeNameEntityMenu.value = ''
  const stillCurrent = (
    String(selectedBookId.value || '') === command.projectId
    && String(selectedBookWorldbookId.value || '') === command.worldbookId
    && String(currentBook.value?.id || '') === command.projectId
  )
  let refreshed = false
  if (stillCurrent) {
    try {
      const synced = await syncBookWorldbook(currentBook.value, selectedBookId.value)
      refreshed = Boolean((synced?.entries || []).some((candidate) => String(candidate?.id || '') === String(entry.id)))
    } catch {
      refreshed = false
    }
  }
  nameEntityNoticeKind.value = 'success'
  nameEntityNotice.value = refreshed
    ? tr('已建为{value0}条目{value1}', { value0: nameEntityCategoryLabel(command.selection.entityKind), value1: recovered ? '，写入已恢复' : '' })
    : tr('条目已创建，将在重新打开世界书后显示')
  nameEntityBusy.value = false
  return true
}
function cancelNameEntityConflict() {
  pendingNameEntityCommand.value = null
  nameEntityConflicts.value = []
}
function confirmDuplicateNameEntity() {
  const pending = pendingNameEntityCommand.value
  if (!pending) return false
  const command = createAuthoringEntityEntryCommand(pending.selection, {
    projectId: pending.projectId,
    worldbookId: pending.worldbookId,
    allowDuplicate: true
  })
  return persistNameEntityCommand(command)
}
function reuseNameEntityConflict(conflict) {
  const command = pendingNameEntityCommand.value
  if (!command || !conflict?.entryId) return false
  lastNameEntityReceipt.value = createAuthoringEntitySelectionReceipt(command, {
    entry: { id: conflict.entryId },
    reused: true
  })
  closeNameGenerator({ force: true })
  nextTick(() => openWorldbookMentionDetail(conflict.entryId))
  return true
}
function openCreatedNameEntityEntry() {
  const entryId = lastNameEntityReceipt.value?.entryId
  if (!entryId) return
  closeNameGenerator({ force: true })
  nextTick(() => openWorldbookMentionDetail(entryId))
}
function openNameWorldbookBinding() {
  closeNameGenerator({ force: true })
  nextTick(openBindingSelect)
}
function adjustFontSize(delta) {
  writingTypography.adjustFontSize(delta)
  onContentChange()
}
function rejectLockedNotebookMutation() {
  if (!historyInteractionLocked.value) return false
  authoringTask.notify(pendingGhostAdoption.value
    ? tr('推演正文正在提交或等待重试，暂不能改动稿面')
    : tr('正在提交推演正文，请稍候'))
  return true
}
function rejectActiveWritingMutation() {
  if (!activeWritingMutationLocked.value) return false
  authoringTask.notify(pendingGhostAdoption.value
    ? tr('当前文档正在提交推演正文或等待重试，暂不能改动')
    : tr('当前文档正在提交推演正文，请稍候'))
  return true
}
function undoNotebookEdit() {
  if (rejectActiveWritingMutation()) return false
  if (activeWritingPane.value === 'dual') return Boolean(dualPaneRef.value?.runCommand?.('undo'))
  writingAgentHost.notifyHistory('history')
  let result = false
  if (hasStructureUndoBoundary.value) result = undoStructureTransition()
  else if (hasGhostAdoptionUndoBoundary.value) result = undoGhostAdoption()
  else result = Boolean(notebookEditorRef.value?.undo?.())
  // U33：undo 后编辑器可能因事务副作用失去焦点，导致 redo 键盘无法到达。
  if (result) nextTick(() => notebookEditorRef.value?.focus?.({ scrollIntoView: false }))
  return result
}
function redoNotebookEdit() {
  if (rejectActiveWritingMutation()) return false
  if (activeWritingPane.value === 'dual') return Boolean(dualPaneRef.value?.runCommand?.('redo'))
  writingAgentHost.notifyHistory('history')
  if (hasStructureRedoBoundary.value) return redoStructureTransition()
  if (hasGhostAdoptionRedoBoundary.value) return redoGhostAdoption()
  return Boolean(notebookEditorRef.value?.redo?.())
}
function toggleNotebookMark(mark) {
  if (rejectActiveWritingMutation()) return
  if (activeWritingPane.value === 'dual') {
    dualPaneRef.value?.runCommand?.('toggleMark', mark)
    return
  }
  if (!notebookEditorRef.value?.toggleMark?.(mark)) return
  nextTick(refreshNotebookCommandAvailability)
}
// 沉浸三件套（P0c）：打字机滚动 / 段落聚焦 / 专注全屏。
// Zen 态联动 AppShell 全局 chrome（body 级类，离开页面时清理）。
watch(() => writingTypography.zen, (zen) => {
  document.body.classList.toggle('is-writing-zen', Boolean(zen))
}, { immediate: true })
function toggleWritingZen() {
  writingTypography.toggleZen()
}
function handleQuickWordDigitKey(event) {
  if (
    event.repeat
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || event.shiftKey
    || event.getModifierState?.('AltGraph')
    || writingInteractionOwner.value !== 'quick-word'
    || activeQuickWordSelection.value?.empty !== true
    || !/^[1-6]$/.test(String(event.key || ''))
  ) return false
  const editor = event.target?.closest?.('.ProseMirror')
  if (!editor) return false
  const targetsDualPane = Boolean(editor.closest('[data-test="authoring-dual-pane"]'))
  if (targetsDualPane !== (activeWritingPane.value === 'dual')) return false
  const item = quickWordSuggestions.value[Number(event.key) - 1]
  if (!item || !completeQuickWord(item)) return false
  event.preventDefault()
  return true
}
// Zen 下隐藏顶栏/书架/检查器；Esc 或快捷键退出。
function handleWritingFocusKeydown(event) {
  if (event.defaultPrevented || isWritingCompositionKey(event)) return
  if (handleQuickWordDigitKey(event)) return
  if (event.key === 'Escape') {
    if (moreMenuOpen.value || showFontPanel.value || showQuickWords.value || showNameGen.value || shelfContextMenu.value.show) {
      event.preventDefault()
      closeMoreMenu()
      showFontPanel.value = false
      showQuickWords.value = false
      showNameGen.value = false
      closeShelfContextMenu()
      return
    }
    if (writingTypography.zen) {
      event.preventDefault()
      writingTypography.toggleZen()
      return
    }
  }
  if (
    event.repeat
    || event.getModifierState?.('AltGraph')
    || !(event.ctrlKey || event.metaKey)
    || !event.altKey
  ) return
  const key = event.key.toLowerCase()
  if (key === 't') {
    event.preventDefault()
    writingTypography.toggleTypewriter()
  } else if (key === 'f') {
    event.preventDefault()
    writingTypography.toggleFocusParagraph()
  } else if (key === 'z') {
    event.preventDefault()
    toggleWritingZen()
  }
}
function captureSelectionAsAsset() {
  if (!canCaptureSelection.value) return
  const snapshot = getWritingSelectionSnapshot()
  if (!snapshot.hasSelection || !selectedChapterId.value) return
  const result = createAssetFromSelection({
    chapterId: selectedChapterId.value,
    content: snapshot.text,
    offset: snapshot.start,
    length: snapshot.end - snapshot.start,
    snippet: snapshot.text,
    projectId: selectedBookId.value || null
  })
  if (!result.ok) {
    quickNoteStatus.value = result.message || '收为素材失败'
    return
  }
  quickNoteStatus.value = '已收为素材 · 跳转素材页'
  router.push({
    name: 'materials',
    query: {
      assetId: result.assetId,
      from: 'writing-selection',
      chapterId: selectedChapterId.value,
      selectorOffset: String(snapshot.start),
      selectorLength: String(snapshot.end - snapshot.start)
    }
  })
}
function applyBackJumpToTextarea(jump) {
  if (notebookEditorActive.value && notebookEditorRef.value) {
    const offset = Math.max(0, Number(jump.offset) || 0)
    const length = Math.max(0, Number(jump.length) || 0)
    const selected = String(markdownContent.value || '').slice(offset, offset + length)
    notebookEditorRef.value.focus()
    if (selected) notebookEditorRef.value.selectText(selected)
    selectedText.value = selected
    syncCursorAndSelection()
    return
  }
  const ta = editorRef.value
  if (!ta) return
  const text = String(ta.value || markdownContent.value || '')
  if (!text) return
  const maxOffset = text.length
  const start = Math.max(0, Math.min(maxOffset, Number(jump.offset) || 0))
  const length = Math.max(0, Number(jump.length) || 0)
  const end = Math.max(start, Math.min(maxOffset, start + length))
  ta.focus()
  try {
    ta.setSelectionRange(start, end)
  } catch {
    return
  }
  const lineHeight = 28
  const targetLine = text.slice(0, start).split('\n').length
  if (typeof ta.scrollTop === 'number') {
    ta.scrollTop = Math.max(0, (targetLine - 3) * lineHeight)
  }
  selectedText.value = text.slice(start, end)
  syncCursorAndSelection()
}
// 一次性 query（selector/insert/session）消费后清空，但保留 bookId/chapterId
// canonical 定位——工作台标签与刷新/深链都依赖这两个键。
function clearTransientQuery() {
  const nextQuery = { ...route.query }
  if (selectedBookId.value) nextQuery.bookId = String(selectedBookId.value)
  if (selectedChapterId.value) nextQuery.chapterId = String(selectedChapterId.value)
  router.replace({ query: nextQuery })
}
function tryApplyPendingBackJump() {
  const jump = pendingBackJump.value
  if (!jump) return
  const chapter = chapters.value.find((item) => item.id === jump.chapterId)
  if (!chapter) {
    pendingBackJump.value = null
    return
  }
  if (selectedChapterId.value !== jump.chapterId) {
    selectChapter(jump.chapterId)
    nextTick(() => nextTick(() => {
      applyBackJumpToTextarea(jump)
      pendingBackJump.value = null
      clearTransientQuery()
    }))
    return
  }
  nextTick(() => {
    applyBackJumpToTextarea(jump)
    pendingBackJump.value = null
    clearTransientQuery()
  })
}
watch(
  () => chapters.value.length,
  () => {
    if (pendingBackJump.value) tryApplyPendingBackJump()
    if (pendingInsertBack.value) tryApplyPendingInsertBack()
  }
)
// Look up a chapter across every book in localStorage so the insert-back
// query can target a chapter that lives outside the currently selected book
// (the user may have left Writing on book B, opened Notes, then jumped back
// to a chapter in book A).
function findChapterAcrossBooks(chapterId) {
  const cid = String(chapterId || '').trim()
  if (!cid) return null
  for (const book of books.value) {
    const chapter = (Array.isArray(book.chapters) ? book.chapters : [])
      .find((c) => c && c.id === cid)
    if (chapter) return { book, chapter }
  }
  return null
}
// Switch the active book to the one containing the given chapter. Used by
// insert-back when the target chapter is not in the currently selected book.
// Mirrors openBook's behavior (saves the current chapter first) but jumps to
// the specified chapter instead of always opening the first one.
function openBookAtChapter(bookId, chapterId) {
  const book = activateBook(bookId)
  if (!book) return false
  chapters.value = book.chapters || []
  if (chapters.value.some((c) => c.id === chapterId)) {
    if (!selectChapter(chapterId)) return false
  } else if (chapters.value.length > 0) {
    if (!selectChapter(chapters.value[0].id)) return false
  }
  return true
}
// Workspace navigation owns URL ↔ selection sync and volatile return state.
// The page retains the actual book/chapter/editor actions passed into it.
workspaceNavigationController = useAuthoringWorkspaceNavigation({
  router,
  route,
  workspaceTabsStore,
  books,
  chapters,
  selectedBookId,
  selectedChapterId,
  selectedWorldbookId: selectedBookWorldbookId,
  activeWritingUnitId,
  writingDocument,
  notebookEditorRef,
  saveStatus,
  pendingBackJump,
  pendingInsertBack,
  selectBook,
  selectChapter,
  openBookAtChapter,
  getDocumentRevision: currentDocumentRevision,
  captureScrollState: captureWritingScrollState,
  restoreScrollState: restoreWritingScrollState
})
// W1 (2026-06-27) editor source round-trip: handle ?chapterId=...&insertAssetId=...
// fired by Notes.vue's `insertAssetBackToSource`. Loads the asset, finds the
// chapter (potentially across books), inserts the asset's content at the
// asset's original selectorOffset (or appends at chapter end as fallback),
// saves the chapter, then clears the URL query to prevent re-insertion on
// reload. Silently no-ops if the chapter or asset can't be found.
function performInsertAtChapter(chapter, asset) {
  const content = String(asset?.content || '').trim()
  if (!content) {
    quickNoteStatus.value = '素材内容为空,已取消插入'
    return false
  }
  const currentText = String(markdownContent.value || '')
  const offset = resolveInsertOffset({ chapterText: currentText, asset })
  // If appending at the end and the chapter isn't empty, sandwich the asset
  // with blank lines so the inserted prose reads as a fresh paragraph.
  const needsSeparator = offset === currentText.length && currentText.length > 0
    && !/\n\n$/.test(currentText)
  const insertion = (needsSeparator ? '\n\n' : '') + content + (needsSeparator ? '\n' : '')
  const result = spliceTextAt(currentText, insertion, offset)
  markdownContent.value = result.text
  recordChapterAssetSources([asset], chapter)
  syncMarkdownToEditor()
  onContentChange()
  if (!saveCurrentChapter()) {
    quickNoteStatus.value = '素材已插入稿面但保存失败，请先重试保存'
    return false
  }
  if (editorRef.value) {
    nextTick(() => {
      const ta = editorRef.value
      if (!ta) return
      ta.focus()
      try {
        ta.setSelectionRange(result.insertStart, result.insertEnd)
      } catch {
        // detached node — skip selection highlight, content is still saved
      }
      const lineHeight = 28
      const targetLine = result.text.slice(0, result.insertStart).split('\n').length
      if (typeof ta.scrollTop === 'number') {
        ta.scrollTop = Math.max(0, (targetLine - 3) * lineHeight)
      }
      selectedText.value = result.text.slice(result.insertStart, result.insertEnd)
      syncCursorAndSelection()
    })
  }
  const where = offset === currentText.length ? tr('章节末尾') : tr('偏移 {value0}', { value0: offset })
  quickNoteStatus.value = `已插入素材 · ${asset.title || '未命名'} (${where})`
  return true
}
function tryApplyPendingInsertBack() {
  const ins = pendingInsertBack.value
  if (!ins) return
  const found = findChapterAcrossBooks(ins.chapterId)
  if (!found) {
    // Silently ignore — spec: missing chapter is a no-op, not an error.
    pendingInsertBack.value = null
    clearTransientQuery()
    return
  }
  const { book, chapter } = found
  // Load the asset by id regardless of status; listNarrativeAssets with
  // status=null returns all assets (no status filter applied).
  const asset = listNarrativeAssets({ status: null })
    .find((a) => a && a.id === ins.insertAssetId)
  if (!asset) {
    pendingInsertBack.value = null
    clearTransientQuery()
    quickNoteStatus.value = '素材已被删除,已取消插入'
    return
  }
  const run = () => {
    nextTick(() => nextTick(() => {
      const ok = performInsertAtChapter(chapter, asset)
      pendingInsertBack.value = null
      clearTransientQuery()
      return ok
    }))
  }
  if (selectedBookId.value !== book.id) {
    openBookAtChapter(book.id, chapter.id)
    run()
    return
  }
  if (selectedChapterId.value !== chapter.id) {
    selectChapter(chapter.id)
    run()
    return
  }
  run()
}
function captureWritingScrollState() {
  const scrollElement = notebookEditorRef.value?.getScrollElement?.()
  return {
    top: scrollElement?.scrollTop || 0,
    left: scrollElement?.scrollLeft || 0
  }
}
function restoreWritingScrollState(snapshot) {
  if (!snapshot) return
  nextTick(() => requestAnimationFrame(() => {
    const scrollElement = notebookEditorRef.value?.getScrollElement?.()
    if (scrollElement) {
      scrollElement.scrollTop = snapshot.top
      scrollElement.scrollLeft = snapshot.left
    }
  }))
}
function onWritingCompositionEnd() {
  writingAgentHost.notifyCompositionEnd()
}
function onWritingBeforeInput(event) {
  // Teleport 的推演草稿/输入区实际挂在编辑器 widget 内，beforeinput 会沿
  // Editor 根的 capture 监听器经过。中文引号转换只能接管 ProseMirror 正文，
  // 否则在草稿输入引号会 preventDefault 后写进 canonical 正文。
  const eventTarget = event?.target instanceof Element ? event.target : null
  if (!eventTarget?.closest('.ProseMirror') || eventTarget.closest('#authoring-block-gap')) return
  if (['historyUndo', 'historyRedo'].includes(event?.inputType)) {
    const redo = event.inputType === 'historyRedo'
    const ownsHistory = historyInteractionLocked.value
      || (redo
        ? hasGhostAdoptionRedoBoundary.value || hasStructureRedoBoundary.value
        : hasGhostAdoptionUndoBoundary.value || hasStructureUndoBoundary.value)
    if (ownsHistory) {
      event.preventDefault()
      handleNotebookHistoryCommand(redo ? 'redo' : 'undo')
    }
    return
  }
  if (currentBook.value?.manuscriptLanguage === 'en' || (!currentBook.value?.manuscriptLanguage && inferWritingLanguage(getEditorText()) === 'en')) return
  const editor = notebookEditorRef.value
  const selection = editor?.getSelection?.()
  const insertion = buildChineseQuoteInsertion({
    data: event?.data,
    selectedText: selection?.text,
    previousText: selection?.previousText,
    nextText: selection?.nextText,
    from: selection?.from,
    // Safari/iOS 的 final beforeinput 可能已报 isComposing=false，但编辑器
    // 仍处于 compositionend 的 DOMObserver settling 窗口。父层 owner 必须
    // 继续让行，避免智能引号与 IME 最终事务重复写入。
    composing: event?.isComposing || writingCompositionActive.value,
    inputType: event?.inputType
  })
  if (!insertion || !editor) return
  event.preventDefault()
  if (insertion.text && !editor.insertPlainText(insertion.text)) return
  editor.setSelection(insertion.caret, insertion.caret)
}
function onWritingPaste() {
  writingAgentHost.notifyPaste()
}
function handleNotebookScrollOwner(event = {}) {
  // 光标越过视口边缘时浏览器会自动跟随滚动；这仍属于 cursor dwell，
  // 不能把刚排入的联想取消。只有 wheel/touch/滚动条这类显式浏览动作才暂停。
  if (event.source === 'user') writingAgentHost.notifyUserScroll()
}
function onNotebookCompositionChange(active, meta = {}) {
  if (active) {
    writingAgentHost.notifyCompositionStart()
    return
  }
  if (meta?.reason) {
    writingAgentHost.notifyCompositionAborted(meta.reason)
    return
  }
  onWritingCompositionEnd()
}
function onNotebookCommandMenuChange(open) {
  notebookCommandMenuOpen.value = Boolean(open)
  writingAgentHost.notifyCommandMenu(open)
}
function handleBlockedStructureEdit() {
  authoringTask.notify(tr('文本块边界受当前场与批注保护；请用右键菜单显式拆分、合并或移动文本块'))
}
// 行内助手的主来源窄接口:落笔处身份(ghost target)、书与光标只在此读一次,
// 调度 payload 与请求快照(getSnapshot)共用,不再各自读 markdownContent/target。
function readWritingAgentSource(cursorPos = copilotCursorPos.value) {
  const target = currentGhostTarget({ caret: cursorPos })
  const book = books.value.find((item) => String(item.id) === String(target.projectId))
  return { cursorPos, target, book }
}
function buildPassiveAgentInput(cursorPos) {
  const { target, book } = readWritingAgentSource(cursorPos)
  const currentNodeText = notebookEditorActive.value
    ? String(notebookSelection.value?.currentNodeText || '')
    : getWritingParagraphSnapshot(cursorPos).text
  return {
    content: markdownContent.value,
    cursorPos,
    bookId: target.projectId,
    bookTitle: book?.title || '',
    chapterTitle: currentChapterTitle.value,
    documentRole: target.role,
    documentId: target.documentId,
    chapterId: target.chapterId,
    documentRevision: target.documentRevision,
    unitId: target.unitId,
    unitRevision: target.unitRevision,
    nodeId: target.nodeId,
    nodeRevision: target.nodeRevision,
    editorFocused: notebookEditorRef.value?.hasEditorFocus?.() !== false,
    hasSelection: Boolean(selectedText.value),
    currentNodeEmpty: !currentNodeText.trim()
  }
}
function readLiveWritingCursorSnapshot() {
  if (notebookEditorActive.value) {
    const snapshot = readLiveWritingSelectionSnapshot()
    return { end: snapshot.end, text: snapshot.text }
  }
  const editor = editorRef.value
  if (!editor || typeof editor.selectionStart !== 'number') {
    return { end: copilotCursorPos.value, text: selectedText.value }
  }
  const text = markdownContent.value || ''
  const selectionStart = Math.max(0, Math.min(text.length, Math.min(editor.selectionStart, editor.selectionEnd ?? editor.selectionStart)))
  const selectionEnd = Math.max(0, Math.min(text.length, Math.max(editor.selectionStart, editor.selectionEnd ?? editor.selectionStart)))
  const nextCursor = Math.max(0, Math.min(text.length, editor.selectionStart))
  return {
    end: nextCursor,
    text: selectionEnd > selectionStart ? text.slice(selectionStart, selectionEnd) : ''
  }
}
// 光标同步与工具栏选区状态的页面耦合点;调度/取消决策不再进页面。
function syncCursorAndSelection(options = {}) {
  const snapshot = writingAgentHost.syncCursor(options)
  selectedText.value = snapshot.text
  return snapshot
}
function acceptWritingSuggestion(mode = 'all') {
  if (notebookEditorActive.value && notebookEditorRef.value) {
    const inserted = writingAgentPeek(mode)
    if (!inserted) return
    // inline 采纳会成为新的 history 顶层事务；此前长推演/authoring 回执
    // 从此不再能安全地驱动 scene/outline 回滚。两个接缝由现有原子历史
    // owner 在此显式执行,插入→信任 consume→不符回退的顺序契约在
    // host.commitAdoption 内保持。
    const outcome = writingAgentHost.commitAdoption(mode, inserted, {
      editor: notebookEditorRef.value,
      beforeInsert: () => {
        clearNotebookAtomicRedoHistory()
        authoringTask.invalidateReceipt()
      },
      onAdopted: () => {
        notebookCopilotCanUndo.value = true
      },
      afterSync: () => {
        syncCursorAndSelection()
      }
    })
    if (outcome === 'uncertain') {
      authoringTask.notify(tr('采纳结果未确认，请检查正文；可用撤销核对'))
    }
    return
  }
  const editor = editorRef.value
  if (editor) {
    syncCursorAndSelection()
  }
  const result = writingAgentAccept(
    markdownContent.value,
    copilotCursorPos.value,
    mode
  )
  if (!result) return
  markdownContent.value = result.content
  if (editor) {
    editor.value = result.content
    editorHistory.push(editor)
  }
  syncMarkdownToEditor()
  onContentChange()
  nextTick(() => {
    if (notebookEditorActive.value && notebookEditorRef.value) {
      notebookEditorRef.value.focus()
      syncCursorAndSelection()
      return
    }
    if (editorRef.value) {
      editorRef.value.setSelectionRange(result.newCursorPos, result.newCursorPos)
      editorRef.value.focus()
      syncCursorAndSelection()
    }
  })
}
function retryCopilotSuggestion() {
  syncCursorAndSelection()
  if (copilotManualTrigger() === false) return
  nextTick(() => {
    if (notebookEditorActive.value) notebookEditorRef.value?.focus()
    else editorRef.value?.focus()
  })
}
function clipboardReadAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'
}
function refreshNotebookCommandAvailability() {
  const resolved = notebookEditorRef.value?.getCommandAvailability?.() || {}
  notebookCommandAvailability.value = {
    ...emptyNotebookCommandAvailability,
    ...resolved,
    paste: resolved.paste !== false && clipboardReadAvailable()
  }
  return notebookCommandAvailability.value
}
function onNotebookReady() {
  scheduleAnnotationLayout()
  nextTick(refreshNotebookCommandAvailability)
}
function clampContextMenuPosition() {
  const element = contextMenuRef.value
  if (!element || !contextMenu.value.show) return
  const body = document.body
  const cssZoom = Number.parseFloat(window.getComputedStyle(body).zoom) || 1
  const transformedScale = body?.offsetWidth > 0
    ? body.getBoundingClientRect().width / body.offsetWidth
    : 1
  const scale = Math.max(0.1, cssZoom !== 1 ? cssZoom : (transformedScale || 1))
  const viewport = window.visualViewport
  const leftEdge = Number(viewport?.offsetLeft || 0)
  const topEdge = Number(viewport?.offsetTop || 0)
  const rightEdge = leftEdge + Number(viewport?.width || window.innerWidth)
  const bottomEdge = topEdge + Number(viewport?.height || window.innerHeight)
  const margin = 8
  const availableVisualHeight = Math.max(44, bottomEdge - topEdge - margin * 2)
  contextMenu.value.maxHeight = Math.floor(availableVisualHeight / scale)
  const visualWidth = Math.min(
    Math.max(Number(element.getBoundingClientRect?.().width || 0), Number(element.offsetWidth || 0) * scale),
    Math.max(0, rightEdge - leftEdge - margin * 2)
  )
  const visualHeight = Math.min(Number(element.scrollHeight || element.offsetHeight || 0) * scale, availableVisualHeight)
  const desiredVisualX = Number(contextMenu.value.anchorX ?? contextMenu.value.x * scale)
  const desiredVisualY = Number(contextMenu.value.anchorY ?? contextMenu.value.y * scale)
  const clampedVisualX = Math.max(
    leftEdge + margin,
    Math.min(desiredVisualX, rightEdge - visualWidth - margin)
  )
  const clampedVisualY = Math.max(
    topEdge + margin,
    Math.min(desiredVisualY, bottomEdge - visualHeight - margin)
  )
  contextMenu.value.x = Math.round(clampedVisualX / scale)
  contextMenu.value.y = Math.round(clampedVisualY / scale)
}
function handleContextMenuViewportChange() {
  if (contextMenu.value.show) nextTick(clampContextMenuPosition)
}
function contextMenuKeyboardItems() {
  return Array.from(contextMenuRef.value?.querySelectorAll?.('.ctx-item:not(:disabled)') || [])
}
function focusContextMenuItem(index = 0) {
  const items = contextMenuKeyboardItems()
  if (!items.length) {
    contextMenuRef.value?.focus?.({ preventScroll: true })
    return false
  }
  const safeIndex = (index + items.length) % items.length
  items[safeIndex]?.focus?.({ preventScroll: true })
  return true
}
function closeContextMenuFromKeyboard() {
  if (!contextMenu.value.show) return
  const snapshot = { ...contextMenu.value }
  contextMenu.value.show = false
  // 同步恢复：nextTick 恢复有一个“焦点在 BODY”的空窗期，journey/用户
  // 在这个窗口内快照或按键都会丢失焦点。restoreContextMenuTarget 内部
  // 的 restoreSelectionBookmark → view.focus() 已经是同步操作。
  if (!restoreContextMenuTarget(snapshot)) return
  notebookEditorRef.value?.focus?.({ scrollIntoView: false })
}
function handleContextMenuKeydown(event) {
  if (!contextMenu.value.show || isWritingCompositionKey(event)) return
  const items = contextMenuKeyboardItems()
  const currentIndex = items.indexOf(document.activeElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeContextMenuFromKeyboard()
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    if (!items.length) return
    if (event.key === 'Home') return void focusContextMenuItem(0)
    if (event.key === 'End') return void focusContextMenuItem(items.length - 1)
    const direction = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1
    focusContextMenuItem((currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex) + direction)
    return
  }
  // 菜单显示时键盘 owner 必须是菜单。即使浏览器/测试环境没有及时把
  // focus 移到按钮，也不能让 Backspace、正文字符或 Ctrl/Cmd+Z 穿透到
  // 仍保存着旧 selection 的 ProseMirror。
  if (!contextMenuRef.value?.contains?.(event.target)) {
    event.preventDefault()
    event.stopPropagation()
    focusContextMenuItem(0)
    return
  }
  const commandKey = (event.ctrlKey || event.metaKey) && ['z', 'y', 'x', 'v'].includes(event.key.toLowerCase())
  if (commandKey || ['Backspace', 'Delete'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
  }
}
async function writeClipboardText(value) {
  const text = String(value || '')
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text)
    return true
  }
  // 非安全上下文的兼容后备只复制临时 textarea，不再让 execCommand
  // 直接操作 ProseMirror 选区。
  const activeElement = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = Boolean(document.execCommand?.('copy'))
  textarea.remove()
  activeElement?.focus?.()
  if (!copied) throw new Error('clipboard-write-unavailable')
  return true
}
async function readClipboardText() {
  if (!clipboardReadAvailable()) throw new Error('clipboard-read-unavailable')
  return navigator.clipboard.readText()
}
function restoreContextMenuTarget(snapshot, { requireCurrentDocument = true, scrollIntoView = false } = {}) {
  const revisionStale = requireCurrentDocument
    && String(snapshot?.documentRevision || '') !== String(currentDocumentRevision())
  if (revisionStale) {
    notebookEditorRef.value?.focus?.({ scrollIntoView: false })
    authoringTask.notify(tr('正文已变化，请在目标位置重新打开菜单'))
    return false
  }
  if (!snapshot?.selectionBookmark) {
    // 无选区书签时至少归还焦点，不能让 Esc 关菜单后焦点留在浮层/BODY 上。
    notebookEditorRef.value?.focus?.({ scrollIntoView: false })
    return true
  }
  const restored = notebookEditorRef.value?.restoreSelectionBookmark?.(snapshot.selectionBookmark, { scrollIntoView })
  if (!restored) {
    // 书签 resolve 失败（文档结构变了）也归还焦点。
    notebookEditorRef.value?.focus?.({ scrollIntoView: false })
    authoringTask.notify(tr('原选区已失效，请重新选择后操作'))
    return false
  }
  return true
}
function restoreEditorAfterContextMenu(snapshot) {
  const restored = restoreContextMenuTarget(snapshot, { scrollIntoView: false })
  nextTick(() => notebookEditorRef.value?.focus?.({ scrollIntoView: false }))
  return restored
}
function showContextMenu(e, meta = {}) {
  if (editorMode.value !== 'wysiwyg' || !notebookEditorRef.value) return
  writingAgentHost.notifyContextMenuOpen()
  notebookEditorRef.value.closeCommandMenu?.()
  notebookCommandMenuOpen.value = false
  const selection = notebookEditorRef.value.getSelection?.() || {}
  selectedText.value = String(selection.text || '')
  const availability = refreshNotebookCommandAvailability()
  const body = document.body
  const cssZoom = Number.parseFloat(window.getComputedStyle(body).zoom) || 1
  const transformedScale = body?.offsetWidth > 0
    ? body.getBoundingClientRect().width / body.offsetWidth
    : 1
  const scale = Math.max(0.1, cssZoom !== 1 ? cssZoom : (transformedScale || 1))
  const keyboardAnchor = meta?.keyboardTriggered ? meta.anchorRect : null
  const anchorX = Number(keyboardAnchor?.left ?? e.clientX ?? 0)
  const anchorY = Number(keyboardAnchor?.bottom ?? e.clientY ?? 0)
  contextMenu.value = {
    show: true,
    x: Math.round(anchorX / scale),
    y: Math.round(anchorY / scale),
    anchorX,
    anchorY,
    maxHeight: 480,
    selectionBookmark: notebookEditorRef.value.captureSelectionBookmark?.() || null,
    selectedText: String(selection.text || ''),
    documentRevision: currentDocumentRevision(),
    availability: { ...availability }
  }
  notebookEditorRef.value.blur?.()
  nextTick(() => {
    clampContextMenuPosition()
    focusContextMenuItem(0)
  })
}
async function ctxAction(action) {
  if (editorMode.value !== 'wysiwyg' || !notebookEditorRef.value) return false
  const snapshot = { ...contextMenu.value }
  contextMenu.value.show = false
  const mutatesDocument = ['undo', 'redo', 'delete', 'cut', 'paste', 'splitUnit', 'mergePreviousUnit', 'mergeNextUnit', 'moveUnitUp', 'moveUnitDown'].includes(action)
  if (mutatesDocument && rejectLockedNotebookMutation()) {
    restoreEditorAfterContextMenu(snapshot)
    return false
  }
  const availabilityKey = action === 'delete' ? 'deleteSelection' : action
  if (
    ['cut', 'copy', 'paste', 'delete'].includes(action)
    && !snapshot.availability?.[availabilityKey]
  ) {
    restoreEditorAfterContextMenu(snapshot)
    return false
  }
  try {
    if (action === 'copy') {
      await writeClipboardText(snapshot.selectedText)
      return restoreContextMenuTarget(snapshot)
    }
    if (action === 'cut') {
      await writeClipboardText(snapshot.selectedText)
      if (!restoreContextMenuTarget(snapshot)) return false
      return Boolean(notebookEditorRef.value.deleteSelection?.())
    }
    if (action === 'paste') {
      const clipboardText = await readClipboardText()
      if (!clipboardText) {
        authoringTask.notify(tr('剪贴板里没有可粘贴的文本'))
        restoreEditorAfterContextMenu(snapshot)
        return false
      }
      if (!restoreContextMenuTarget(snapshot)) return false
      return Boolean(notebookEditorRef.value.insertPlainText?.(clipboardText, { origin: 'input' }))
    }
  } catch {
    authoringTask.notify(action === 'paste'
      ? tr('浏览器未允许读取剪贴板，请使用系统粘贴快捷键')
      : tr('复制到剪贴板失败，请使用系统快捷键'))
    restoreEditorAfterContextMenu(snapshot)
    return false
  }
  if (action === 'undo') return undoNotebookEdit()
  if (action === 'redo') return redoNotebookEdit()
  if (action === 'selectAll') return Boolean(notebookEditorRef.value.selectAll?.())
  if (!restoreContextMenuTarget(snapshot)) return false
  if (action === 'reviewBlock') { freezeReviewSource(); openReviewPanel({ goalMode: true }); return openInspectorTool('ai') }
  if (action === 'imageBlock') return openIllustrator()
  if (action === 'delete') return Boolean(notebookEditorRef.value.deleteSelection?.())
  if (action === 'splitUnit') return Boolean(notebookEditorRef.value.splitWritingUnit?.())
  if (action === 'mergePreviousUnit') return Boolean(notebookEditorRef.value.mergeWritingUnit?.('previous'))
  if (action === 'mergeNextUnit') return Boolean(notebookEditorRef.value.mergeWritingUnit?.('next'))
  if (action === 'moveUnitUp') return Boolean(notebookEditorRef.value.moveWritingUnit?.('up'))
  if (action === 'moveUnitDown') return Boolean(notebookEditorRef.value.moveWritingUnit?.('down'))
  return false
}
function getEditorText() {
  return markdownToPlainText(markdownContent.value || '')
}
function onNotebookMarkdown(markdown) {
  markdownContent.value = String(markdown || '')
  editorContent.value = markdownToHtml(markdownContent.value)
  onContentChange()
}
function onNotebookDocumentUpdate(document, transition = null) {
  const previousDocument = writingDocument.value
  previousNotebookDocument = previousDocument
  previousNotebookAnnotations = snapshotWritingAnnotationState()
  writingDocument.value = document
  // 结构变更只能从原始批注快照做一次 typed reconcile；不能先按普通
  // 文本编辑模糊重定位、再拿已改过的 offset 处理 split/merge。
  reconcileActiveEditorAnnotations(document, previousDocument, transition)
  markRewriteCandidatesStale()
  scheduleAnnotationLayout()
  nextTick(refreshNotebookCommandAvailability)
}
function onNotebookUnitTransition(transition) {
  const structural = ['split', 'merge', 'move', 'delete', 'clear', 'replace-all'].includes(String(transition?.type || ''))
  const beforeDocument = previousNotebookDocument
  const beforeAnnotations = previousNotebookAnnotations || snapshotWritingAnnotationState()
  const beforeSceneAnchors = normalizeSceneAnchors(sceneAnchors.value)
  // 场景锚点随单元转换迁移（Task 4）：split/merge/delete/move 各有确定性规则。
  // 探索文档没有正文场景锚点，不能拿探索单元 ID 改写当前章节的锚点。
  if (!wt3ActiveDoc.value && transition?.type) {
    const result = reconcileSceneAnchorsForUnitTransition({
      anchors: sceneAnchors.value,
      transition
    })
    if (result.ok) {
      sceneAnchors.value = result.anchors
      // 结构编辑改变了手动锚点撤销所依赖的文档拓扑，旧回执不再安全。
      lastSceneAnchorUndoReceipt.value = null
    }
  }
  if (structural && beforeDocument) {
    const afterAnnotations = snapshotWritingAnnotationState()
    const afterSceneAnchors = normalizeSceneAnchors(sceneAnchors.value)
    pushNotebookAtomicUndoReceipt({
      kind: 'unit-transition',
      transition: Object.freeze({ ...transition }),
      projectId: selectedBookId.value || '',
      documentId: wt3ActiveDoc.value?.id || selectedChapterId.value || '',
      documentRole: wt3ActiveDoc.value ? 'exploration' : 'manuscript',
      chapterId: wt3ActiveDoc.value ? '' : selectedChapterId.value || '',
      beforeDocumentRevision: documentStateRevision(beforeDocument),
      afterDocumentRevision: currentDocumentRevision(),
      beforeBodyRevision: documentBodyStateRevision(beforeDocument),
      afterBodyRevision: currentDocumentBodyRevision(),
      beforeSceneAnchors,
      afterSceneAnchors,
      beforeAnchorFingerprint: fingerprintSceneAnchors(beforeSceneAnchors),
      afterAnchorFingerprint: fingerprintSceneAnchors(afterSceneAnchors),
      beforeAnnotations,
      afterAnnotations,
      beforeAnnotationFingerprint: fingerprintWritingAnnotationState(beforeAnnotations),
      afterAnnotationFingerprint: fingerprintWritingAnnotationState(afterAnnotations)
    })
    authoringTask.invalidateReceipt()
    notebookCopilotCanUndo.value = false
  }
  previousNotebookDocument = null
  previousNotebookAnnotations = null
  markRewriteCandidatesStale()
  scheduleAnnotationLayout()
}
// 文档单元顺序（投影锚点解析用）。
function documentUnitOrder() {
  return (Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : [])
    .map((unit) => unit?.attrs?.unitId)
    .filter(Boolean)
}
function onNotebookSelectionChange(selection) {
  const transactionOwned = writingAgentHost.isAdoptionInFlight() || applyingAtomicNotebookHistory
  notebookSelection.value = selection
  if (!transactionOwned && !blockAdoptionBusy.value) clearAdoptionImpact()
  if (!transactionOwned && !authoringTaskBusy.value && !sceneLaboratory.open && !interventionComposer.open) blockWorkflow.followSelection(selection)
  if (inspectorOpen.value && activeInspectorTool.value === 'ai' && activeWritingPane.value === 'main') {
    const currentInvocation = captureMainKnowledgeAssistantInvocation()
    if (currentInvocation) knowledgeAssistantInvocation.value = currentInvocation
  }
  notebookSelectionScrollTop = document.querySelector('.wall__dossier-scroll')?.scrollTop || 0
  const hasSelectionText = Boolean(selection?.text)
  const selectionSnapshot = writingAgentHost.handleSelectionMoved({ transactionOwned, hasSelectionText })
  selectedText.value = selectionSnapshot.text
  hasSelection.value = hasSelectionText
  refreshNotebookCommandAvailability()
  writingAgentHost.scheduleCursorDwell({ transactionOwned, hasSelectionText, snapshot: selectionSnapshot })
  positionSelectionActions(selection)
  if (annotationComposerOpen.value && selection?.text) {
    annotationComposerContext.value = getAnnotationSelectionContext()
    scheduleAnnotationLayout()
  }
  const selectedNodeId = selection?.nodeId
  if (!inspectorPinned.value && selectedNodeId) {
    activeAnnotationId.value = activeEditorAnnotations.value.find((annotation) => (
      annotation.target?.nodeId === selectedNodeId && annotation.status === 'open'
    ))?.id || null
  }
}
function positionSelectionActions(selection) {
  // 画师是覆盖整个写作工作台的 modal owner。编辑器在失焦和图片加载时
  // 仍可能补发 selectionchange；这些迟到事件不能让正文浮条穿透到画师上层。
  if (illustratorBlocking.value) {
    hideSelectionActions()
    return
  }
  if (selection?.text?.trim() && selection.cursorRect) {
    const rect = selection.cursorRect
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      hideSelectionActions()
      return
    }
    selectionActionsVisible.value = true
    // 浮条宽度随按钮集合变化（B/I/分隔线加入后远超旧估宽）；
    // 先渲染再实测 offsetWidth/Height，交给 resolver 按缩放做视口钳制。
    nextTick(() => {
      if (illustratorBlocking.value) {
        hideSelectionActions()
        return
      }
      const bar = document.querySelector('.writing-selection-actions')
      const bodyZoom = writingUiScale()
      const measuredWidth = Math.max(166, Number(bar?.offsetWidth) || 340)
      const measuredHeight = Math.max(34, Number(bar?.offsetHeight) || 36)
      const manuscriptRect = writingMainRef.value?.querySelector?.('.wall__dossier')?.getBoundingClientRect?.()
      const position = resolveSelectionActionPosition(rect, {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        width: measuredWidth,
        height: measuredHeight,
        scale: bodyZoom,
        containerLeft: manuscriptRect?.left,
        containerRight: manuscriptRect?.right,
        containerTop: manuscriptRect?.top,
        containerBottom: manuscriptRect?.bottom
      })
      if (position) {
        selectionToolbarStyle.value = {
          top: `${position.top}px`,
          left: `${position.left}px`
        }
        selectionActionsVisible.value = true
      }
    })
  } else {
    hideSelectionActions()
  }
}
function handleWritingWorkspaceScroll(event) {
  const scrollTarget = event?.target instanceof Element ? event.target : null
  if (scrollTarget && contextMenuRef.value?.contains?.(scrollTarget)) return
  // fixed 菜单绑定的是打开瞬间的 bookmark；视口滚动后继续悬浮会伪装成
  // 当前屏幕目标，实际却修改已离屏旧段。任何 owner 滚动都先关闭它。
  if (contextMenu.value.show) contextMenu.value.show = false
  positionSelectionActions(notebookEditorRef.value?.getSelection?.())
  scheduleAnnotationLayout()
}
function hideSelectionActions() {
  selectionActionsVisible.value = false
}
function dismissSelectionActions(event) {
  const target = event.target instanceof Element ? event.target : null
  // U03：搜索面板内的点击（含关闭）不视为"放弃选区"——面板关闭后如果
  // 定位产生的文字选区仍在编辑器内，浮条应恢复可操作。
  if (target?.closest('.writing-selection-actions, .writing-notebook-editor__surface, [data-test="authoring-search-panel"]')) return
  hideSelectionActions()
}
function openAnnotationFromSelectionMenu() {
  hideSelectionActions()
  openAnnotationInspector()
}
function captureSelectionFromMenu() {
  hideSelectionActions()
  captureSelectionAsAsset()
}
const quickAiRewriteInstructions = {
  'ai-rewrite-previous': '改写上一段，保持事实、视角和人物语气不变，改善句式、节奏与上下文衔接。',
  'ai-expand-previous': '扩写上一段，补足必要动作、感官和因果信息，不添加无依据的新设定，不重复已有描写。',
  'ai-shorten-previous': '精简上一段，删除重复解释、弱信息和拖沓动作，保留关键事实、人物语气与必要意象。'
}
async function handleNotebookWritingCommand(command = {}) {
  if (command.id === 'ai-continue') {
    openBlockComposer({ ...notebookSelection.value, ...command })
    return
  }
  if (command.id === 'ai-review-chapter') {
    freezeReviewSource()
    openReviewPanel()
    return
  }
  const instruction = quickAiRewriteInstructions[command.id]
  const previousNode = command.previousNode
  const previousNodeId = previousNode?.nodeId
  if (!instruction || !previousNodeId || !String(previousNode.text || '').trim()) {
    quickNoteStatus.value = '上一段没有可交给 AI 修改的正文。'
    return
  }
  const target = getNodeRewriteTarget(previousNodeId)
  if (!target?.text?.trim()) {
    quickNoteStatus.value = '无法定位上一段，请把光标放回正文后重试。'
    return
  }
  resetRewriteState()
  const context = buildFullNodeAnnotationContext(target)
  const annotation = addAnnotation({
    context,
    body: instruction,
    kind: 'comment'
  })
  if (!annotation) return
  if (!openInspectorTool('annotations', { baseView: 'comments' })) return
  rewriteInstruction.value = instruction
  rewriteTarget.value = { ...target, annotationId: annotation.id }
  onContentChange()
  await nextTick()
  scheduleAnnotationLayout()
  await generateRewriteCandidates(rewriteTarget.value)
}
function openAnnotationInspector() {
  const context = getAnnotationSelectionContext()
  const scrollState = captureWritingScrollState()
  if (!openInspectorTool('annotations', { baseView: 'comments' })) return
  if (!selectedText.value.trim() || !context) {
    quickNoteStatus.value = '先选中需要批注的文字'
    return
  }
  annotationComposerContext.value = context
  annotationComposerOpen.value = true
  activeAnnotationId.value = null
  nextTick(() => requestAnimationFrame(() => {
    refreshAnnotationLayout()
    scheduleAnnotationLayout()
    document.querySelector('.writing-annotation-composer textarea')?.focus({ preventScroll: true })
    restoreWritingScrollState(scrollState)
  }))
}
function handleInlineAnnotationClick(annotationId) {
  const annotation = activeEditorAnnotations.value.find((item) => item.id === annotationId)
  if (annotation) locateAnnotation(annotation)
}
function openWorldbookMentionDetail(payload) {
  const entryId = typeof payload === 'object' ? payload?.entryId : payload
  const entryIds = typeof payload === 'object' && Array.isArray(payload?.entryIds)
    ? [...new Set(payload.entryIds.map((id) => String(id || '')).filter(Boolean))]
    : entryId ? [String(entryId)] : []
  if (!entryIds.length) return
  if (payload?.nodeId) {
    // 点击提及只移动 caret，不制造正文选区和悬浮编辑菜单。
    notebookEditorRef.value?.selectNodeRange?.(payload.nodeId, payload.end, payload.nodeId, payload.end)
  }
  inspectorWorldbookEntryId.value = ''
  inspectorWorldbookCandidateIds.value = entryIds.length > 1 ? entryIds : []
  if (!openInspectorTool('worldbook')) return
  if (entryIds.length === 1) nextTick(() => { inspectorWorldbookEntryId.value = entryIds[0] })
}
function getWritingNodeText(node) {
  return (node?.content || []).map((item) => item?.text || '').join('')
}
function getWritingNodeById(nodeId) {
  if (!nodeId) return null
  return (writingDocument.value?.content || [])
    .flatMap((unit) => unit?.content || [])
    .find((node) => node?.attrs?.nodeId === nodeId) || null
}
function getWritingUnitByNodeId(nodeId) {
  return (writingDocument.value?.content || [])
    .find((unit) => (unit.content || []).some((node) => node?.attrs?.nodeId === nodeId)) || null
}
function buildRewriteSelectionNodes(startNodeId, endNodeId, selection) {
  const descriptors = getCurrentWritingNodeDescriptors()
  const startIndex = descriptors.findIndex((node) => node.nodeId === startNodeId)
  const endIndex = descriptors.findIndex((node) => node.nodeId === endNodeId)
  if (startIndex < 0 || endIndex < startIndex) return []
  const notebook = notebookEditorActive.value && notebookSelection.value === selection
  const startEditorNode = notebookEditorRef.value?.findNodeRange?.(startNodeId)
  const endEditorNode = notebookEditorRef.value?.findNodeRange?.(endNodeId)
  const first = descriptors[startIndex]
  const last = descriptors[endIndex]
  const startOffset = notebook
    ? Math.max(0, Number(selection.from || startEditorNode?.from || 0) - Number(startEditorNode?.from || 0))
    : Math.max(0, Number(selection.start || 0) - first.start)
  const endOffset = notebook
    ? Math.max(0, Number(selection.to || endEditorNode?.from || 0) - Number(endEditorNode?.from || 0))
    : Math.max(0, Number(selection.end || 0) - last.start)
  return descriptors.slice(startIndex, endIndex + 1).map((node, index, selectedNodes) => {
    const isFirst = index === 0
    const isLast = index === selectedNodes.length - 1
    const localStart = isFirst ? Math.min(startOffset, node.text.length) : 0
    const localEnd = isLast ? Math.min(endOffset, node.text.length) : node.text.length
    const targetRange = {
      start: node.start + localStart,
      end: node.start + Math.max(localStart, localEnd)
    }
    let editorRange = null
    if (notebook) {
      const editorNode = notebookEditorRef.value?.findNodeRange?.(node.nodeId)
      if (editorNode) {
        editorRange = {
          from: isFirst ? editorNode.from + localStart : editorNode.from,
          to: isLast ? editorNode.from + Math.max(localStart, localEnd) : editorNode.to
        }
      }
    }
    return {
      unitId: node.unitId,
      unitRevision: Number(node.unitRevision || 0),
      nodeId: node.nodeId,
      nodeRevision: Number(node.nodeRevision || 0),
      text: node.text.slice(localStart, localEnd),
      baseText: node.text.slice(localStart, localEnd),
      range: targetRange,
      editorRange,
      startOffset: localStart,
      endOffset: localEnd
    }
  })
}
function getCurrentRewriteTarget() {
  if (!selectedChapterId.value) return null
  const selection = readLiveWritingSelectionSnapshot()
  const block = getWritingBlockAtPosition(selection.start, markdownContent.value)
  if (!block?.nodeId) return null
  if (selection.hasSelection && selection.text.trim()) {
    const notebookRange = notebookEditorActive.value ? notebookSelection.value : null
    const startNodeId = notebookRange?.startNodeId || selection.nodeId || block.nodeId
    const endNodeId = notebookRange?.endNodeId || getWritingBlockAtPosition(Math.max(selection.start, selection.end - 1), markdownContent.value)?.nodeId || startNodeId
    if (startNodeId && endNodeId && startNodeId !== endNodeId) {
      const nodes = buildRewriteSelectionNodes(startNodeId, endNodeId, notebookRange || selection)
      if (nodes.length > 1) {
        return {
          kind: 'multi-selection',
          chapterId: selectedChapterId.value,
          unitId: nodes[0].unitId,
          unitRevision: nodes[0].unitRevision,
          nodeId: startNodeId,
          nodeIds: nodes.map((item) => item.nodeId),
          text: selection.text,
          nodes,
          range: { start: nodes[0].range.start, end: nodes[nodes.length - 1].range.end },
          editorRange: null,
          documentRevision: Number(writingDocument.value?.revision || 0)
        }
      }
    }
    const editorNode = startNodeId === endNodeId
      ? notebookEditorRef.value?.findNodeRange?.(startNodeId)
      : null
    const startOffset = editorNode && Number.isFinite(Number(selection.editorFrom))
      ? Math.max(0, Number(selection.editorFrom) - Number(editorNode.from || 0))
      : null
    const endOffset = editorNode && Number.isFinite(Number(selection.editorTo))
      ? Math.max(startOffset || 0, Number(selection.editorTo) - Number(editorNode.from || 0))
      : null
    return {
      kind: 'selection',
      chapterId: selectedChapterId.value,
      unitId: selection.unitId || block.unitId,
      unitRevision: Number(selection.unitRevision ?? block.unitRevision ?? 0),
      nodeId: startNodeId,
      nodeRevision: Number(selection.nodeRevision ?? block.nodeRevision ?? 0),
      text: selection.text,
      range: { start: selection.start, end: selection.end },
      editorRange: Number.isFinite(Number(selection.editorFrom)) && Number.isFinite(Number(selection.editorTo))
        ? { from: Number(selection.editorFrom), to: Number(selection.editorTo) }
        : null,
      startOffset,
      endOffset,
      documentRevision: Number(writingDocument.value?.revision || 0)
    }
  }
  return {
    kind: 'block',
    chapterId: selectedChapterId.value,
    unitId: block.unitId,
    unitRevision: Number(block.unitRevision || 0),
    nodeId: block.nodeId,
    nodeRevision: Number(block.nodeRevision || 0),
    text: block.text,
    range: { start: block.start, end: block.end },
    editorRange: null,
    documentRevision: currentDocumentRevision()
  }
}
function getNodeRewriteTarget(nodeId) {
  if (!selectedChapterId.value || !nodeId) return null
  const node = getCurrentWritingNodeDescriptors().find((item) => item.nodeId === nodeId)
  if (!node) return null
  return {
    kind: 'block',
    chapterId: selectedChapterId.value,
    unitId: node.unitId,
    unitRevision: Number(node.unitRevision || 0),
    nodeId: node.nodeId,
    nodeRevision: Number(node.nodeRevision || 0),
    text: node.text,
    range: { start: node.start, end: node.end },
    editorRange: null,
    documentRevision: Number(writingDocument.value?.revision || 0)
  }
}
function getRewriteTargetFromAnnotation(annotation) {
  if (!annotation || !selectedChapterId.value) return null
  const resolved = resolveWritingAnnotation(annotation, writingDocument.value)
  if (!resolved || resolved.status === 'orphaned') return null
  const startNodeId = resolved.range?.start?.nodeId || resolved.target?.nodeId
  const endNodeId = resolved.range?.end?.nodeId || startNodeId
  if (!startNodeId || startNodeId !== endNodeId) return null
  const node = getWritingNodeById(startNodeId)
  const unit = getWritingUnitByNodeId(startNodeId)
  const nodeText = getWritingNodeText(node)
  const rawStart = resolved.range?.start?.offset ?? resolved.selector?.start
  const rawEnd = resolved.range?.end?.offset ?? resolved.selector?.end
  if (!Number.isFinite(Number(rawStart)) || !Number.isFinite(Number(rawEnd))) return null
  const startOffset = Math.max(0, Math.min(nodeText.length, Number(rawStart)))
  const endOffset = Math.max(startOffset, Math.min(nodeText.length, Number(rawEnd)))
  if (startOffset === 0 && endOffset === nodeText.length) {
    return getNodeRewriteTarget(startNodeId)
  }
  const start = getWritingMarkdownPosition(writingDocument.value, startNodeId, startOffset)
  const end = getWritingMarkdownPosition(writingDocument.value, startNodeId, endOffset)
  const editorNode = notebookEditorRef.value?.findNodeRange?.(startNodeId)
  return {
    kind: 'selection',
    chapterId: selectedChapterId.value,
    unitId: unit?.attrs?.unitId || resolved.target?.unitId || null,
    unitRevision: Number(unit?.attrs?.unitRevision ?? resolved.target?.unitRevision ?? 0),
    nodeId: startNodeId,
    nodeRevision: Number(node?.attrs?.nodeRevision ?? 0),
    text: nodeText.slice(startOffset, endOffset),
    range: Number.isFinite(start) && Number.isFinite(end)
      ? { start, end }
      : null,
    editorRange: editorNode
      ? { from: editorNode.from + startOffset, to: editorNode.from + endOffset }
      : null,
    startOffset,
    endOffset,
    documentRevision: Number(writingDocument.value?.revision || 0)
  }
}
function getCurrentRewriteComparison(targetOverride = null) {
  const target = targetOverride || rewriteTarget.value
  return compareWritingRewriteTarget({ document: writingDocument.value, target, chapterId: selectedChapterId.value, markdown: markdownContent.value })
}
function buildDualReviewRewriteTarget(invocation, finding) {
  const source = dualPaneRef.value?.captureReviewSource?.()
  if (!source || String(source.documentId) !== String(invocation?.documentId)) return null
  return buildAuthoringReviewRewriteTarget(source, finding)
}
function getDualRewriteComparison(target) {
  const source = dualPaneRef.value?.captureReviewSource?.()
  return compareAuthoringReviewRewriteTarget(source, target)
}
function commitDualRewriteCandidate(candidate, target) {
  if (dualPaneRef.value?.prepareClose?.() === false) return { ok: false, message: tr('副栏原文保存失败，尚未采用候选。') }
  const source = dualPaneRef.value?.captureReviewSource?.()
  if (!source || String(source.documentId) !== String(target.documentId)) return { ok: false, stale: true, message: tr('副栏原文已经变化，请重新审稿。') }
  if (!recordDestructiveWritingProtection({ ...source, operation: 'review-rewrite', transactionId: candidate.id })) {
    return { ok: false, message: tr('无法保存改写前版本，正文没有变化。') }
  }
  const patches = candidate.patches || [{
    nodeId: target.nodeId,
    range: { startOffset: target.startOffset, endOffset: target.endOffset },
    baseText: target.text,
    replacement: candidate.text
  }]
  if (dualPaneRef.value?.replaceReviewRanges?.(patches) !== true) return { ok: false, stale: true, message: tr('副栏没有接受这次修改，请重新审稿。') }
  reviewRewriteSavePending.value = dualPaneRef.value?.prepareClose?.() === false
  if (reviewRewriteSavePending.value) authoringTask.notify(tr('改写已进入副栏，但保存失败；请在审稿结果中重试保存'))
  return { ok: true }
}
function commitRewriteCandidate(candidate, target) {
  if (rejectLockedNotebookMutation()) return { ok: false, silent: true }
  if (!protectCurrentRewrite(candidate)) {
    return { ok: false, message: tr('无法保存改写前版本，正文没有变化。') }
  }
  const before = markdownContent.value
  let applied = false
  if (notebookEditorActive.value && candidate.kind === 'multi-selection') {
    applied = Boolean(notebookEditorRef.value?.replaceNodeRanges?.(candidate.patches, { origin: 'writing-agent' }))
  } else if (notebookEditorActive.value && candidate.kind === 'selection' && target?.editorRange) {
    applied = Boolean(notebookEditorRef.value?.replaceTextRange?.(
      target.editorRange.from,
      target.editorRange.to,
      candidate.text,
      { origin: 'writing-agent' }
    ))
  } else if (notebookEditorActive.value && candidate.kind === 'block') {
    applied = Boolean(notebookEditorRef.value?.replaceNodeText?.(candidate.nodeId, candidate.text, { origin: 'writing-agent' }))
  } else {
    const actions = candidate.patches
      ? candidate.patches.map((patch) => ({
        type: 'text-patch',
        range: patch.targetRange,
        content: patch.replacement,
        baseText: patch.baseText
      }))
      : [{
        type: 'text-patch',
        range: candidate.targetRange,
        content: candidate.text,
        baseText: candidate.baseText
      }]
    if (actions.some((action) => !action.range)) {
      return { ok: false, message: tr('候选缺少可应用的正文范围，请重新生成。') }
    }
    const transactionDocumentId = wt3ActiveDoc.value?.id || selectedChapterId.value
    const transaction = applyWritingAgentTransaction(before, actions, {
      resultId: candidate.id,
      chapterId: transactionDocumentId,
      cursorBefore: readCurrentEditorCursor(before)
    })
    if (!transaction.ok) {
      return {
        ok: false,
        stale: true,
        reason: transaction.reason,
        message: tr('正文已变化，候选没有应用。')
      }
    }
    markdownContent.value = transaction.content
    syncMarkdownToEditor()
    onContentChange()
    applied = true
  }
  return applied
    ? { ok: true }
    : { ok: false, message: tr('编辑器没有接受这次改写，请重新生成。') }
}
function freezeReviewSource() {
  freezeReviewWorkflow(captureActiveReviewSource(), captureCurrentWritingSurface())
}
function beforeInspectorToolSelect(tool) {
  if (tool === 'ai') freezeReviewSource()
  freezeWritingSurfaceBeforeToolSelect(tool)
}
function captureAuthoringSearchLiveSources() {
  const sources = [captureMainDocumentSource(), dualPaneRef.value?.captureSearchSource?.()]
    .filter((source) => source?.document && String(source.projectId || '') === String(selectedBookId.value || ''))
    .map((source) => ({
      ...source,
      // Search 的 source revision 已包含 canonical document 全量签名；这里用
      // schema revision 与 repository 口径对齐，避免同一已落盘文稿被误判为
      // 两个 divergent owner。
      documentRevision: Number(source.document?.revision || 0),
      documentSchemaRevision: Number(source.document?.revision || 0)
    }))
  return sources
}
async function selectMainSearchTarget(finding) {
  const target = finding?.target || {}
  if (target.sourceKind === 'manuscript') {
    if (String(selectedChapterId.value || '') !== String(target.chapterId || '')) {
      if (!selectChapter(target.chapterId)) return false
      await nextTick()
    }
  } else if (target.sourceKind === 'exploration') {
    if (String(wt3ActiveDoc.value?.id || '') !== String(target.documentId || '')) {
      if (!openExplorationDoc(target.documentId)) return false
      await nextTick()
    }
    if (target.field === 'title') return true
  } else {
    return false
  }
  if (!target.nodeId) return true
  const selected = notebookEditorRef.value?.selectNodeRange?.(
    target.nodeId,
    target.startOffset,
    target.nodeId,
    target.endOffset
  )
  if (selected) notebookEditorRef.value?.focus?.()
  return Boolean(selected)
}
function persistSearchEditorsBeforeReplace(setError) {
  if (historyInteractionLocked.value || writingCompositionActive.value || dualCompositionActive.value) {
    setError('正文正在输入或提交，请完成当前操作后再替换。')
    return false
  }
  if (!wt3ActiveDoc.value && selectedChapterId.value && !saveCurrentChapter()) {
    setError('当前章节保存失败，替换没有执行。')
    return false
  }
  if (dualPaneRef.value?.prepareClose?.() === false) {
    setError('副窗正文保存失败，替换没有执行。')
    return false
  }
  return true
}
function createSearchProtectionSnapshots(plan, book, index) {
  for (const chapterPlan of plan.chapters || []) {
    const chapter = (book.chapters || []).find((item) => String(item?.id || '') === String(chapterPlan.chapterId || ''))
    const source = index?.manuscripts?.find((item) => String(item?.chapterId || '') === String(chapterPlan.chapterId || ''))
    if (!chapter || !source?.document) return false
    const protection = authoringHistory.recordProtection({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      reason: 'before-rewrite',
      document: source.document,
      markdown: getWritingDocumentMarkdown(source.document),
      annotations: chapter.annotations || [],
      operation: plan.scope === 'manuscript' ? 'replace-all-book' : 'replace-all-chapter',
      transactionId: plan.id
    })
    if (!protection.ok) return false
  }
  return true
}
function reloadMainChapterAfterSearchReplace(chapter) {
  if (!chapter || wt3ActiveDoc.value) return
  currentChapterTitle.value = chapter.title || ''
  const { raw, format } = readChapterSource(chapter)
  const fallbackMarkdown = format === 'md' ? raw : htmlToMarkdown(raw)
  markdownContent.value = loadChapterDocument(chapter, fallbackMarkdown)
  editorContent.value = markdownToHtml(markdownContent.value)
  chapterOutlineItems.value = normalizeChapterOutlineItems(chapter.outlineItems || [])
  chapterAnnotations.value = reconcileWritingAnnotations(chapter.annotations, writingDocument.value, chapter.id)
  sceneAnchors.value = normalizeSceneAnchors(chapter.sceneAnchors)
  loadChapterSnapshots(chapter.id)
  fenceNotebookHistory()
}
function afterSearchReplace({ applied, latestBook, nextBooks }) {
  for (const chapterReceipt of applied.receipt.chapters || []) {
    const beforeChapter = (latestBook.chapters || []).find((item) => String(item.id) === String(chapterReceipt.chapterId))
    const afterChapter = (applied.nextBook.chapters || []).find((item) => String(item.id) === String(chapterReceipt.chapterId))
    if (!beforeChapter?.editorDocument || !afterChapter?.editorDocument) continue
    const entries = buildWritingBlockHistoryEntries({
      chapterId: chapterReceipt.chapterId,
      chapterTitle: afterChapter.title,
      previousDocument: beforeChapter.editorDocument,
      nextDocument: afterChapter.editorDocument,
      source: 'search-replace'
    })
    if (entries.length) authoringHistory.appendBlockEntries(entries)
    rememberPendingObserverNodes(chapterReceipt.chapterId, (chapterReceipt.changedNodes || []).map((node) => ({
      nodeId: node.nodeId,
      text: node.afterText,
      unitId: node.unitId,
      unitRevision: Number(afterChapter.editorDocument.content.find((unit) => unit?.attrs?.unitId === node.unitId)?.attrs?.unitRevision || 0)
    })))
  }
  books.value = nextBooks
  const nextBook = books.value.find((book) => String(book.id) === String(selectedBookId.value))
  chapters.value = nextBook?.chapters || []
  if (!wt3ActiveDoc.value) {
    reloadMainChapterAfterSearchReplace(chapters.value.find((chapter) => String(chapter.id) === String(selectedChapterId.value)))
  }
  const dualSource = dualPaneRef.value?.getActiveSource?.()
  if (dualSource?.kind === 'chapter') {
    const dualChapter = chapters.value.find((chapter) => String(chapter.id) === String(dualSource.id))
    if (dualChapter?.editorDocument) {
      dualPaneRef.value?.reloadSearchSource?.({
        sourceKind: 'chapter',
        sourceId: dualChapter.id,
        title: dualChapter.title,
        document: dualChapter.editorDocument,
        markdown: dualChapter.content
      })
    }
  }
  writingBlockHistory.value = selectedChapterId.value ? authoringHistory.refreshBlockHistory(selectedChapterId.value) : []
  writingSnapshots.value = selectedChapterId.value ? authoringHistory.refreshSnapshots(selectedChapterId.value) : []
  void gameStore.handleAuthoringProseUndo({
    sourceRefs: applied.receipt.affectedUnitRefs || [],
    revision: currentDocumentRevision(),
    reason: 'search-replace'
  }).catch(() => {})
}
async function restoreSearchSurface(surface) {
  if (surface?.pane === 'dual') return Boolean(await dualPaneRef.value?.restoreSurfaceState?.(surface))
  let previousEditor = null
  if (surface?.sourceKind === 'chapter' && String(selectedChapterId.value || '') !== String(surface.sourceId || '')) {
    previousEditor = notebookEditorRef.value
    if (!selectChapter(surface.sourceId)) return false
  } else if (surface?.sourceKind === 'exploration' && String(wt3ActiveDoc.value?.id || '') !== String(surface.sourceId || '')) {
    previousEditor = notebookEditorRef.value
    if (!openExplorationDoc(surface.sourceId)) return false
  }
  return restoreMainWritingSurfaceWhenReady(surface, { previousEditor })
}
function createAuthoringSearchWorkflow() {
  return useAuthoringSearchWorkflow({
    getSelectedBookId: () => selectedBookId.value,
    getSelectedChapterId: () => selectedChapterId.value,
    getCurrentBook: () => currentBook.value,
    getChapters: () => chapters.value,
    getCurrentChapterTitle: () => currentChapterTitle.value,
    getExplorations: () => wt3ExplorationDocs.value,
    getWorldbook: () => boundWorldbook.value,
    getDualSource: () => activeWritingPane.value === 'dual' ? dualPaneRef.value?.getActiveSource?.() : null,
    captureActiveSource: () => captureActiveDocumentSource(),
    captureMainSource: () => captureMainDocumentSource(),
    captureSurface: () => captureCurrentWritingSurface(),
    captureLiveSources: () => captureAuthoringSearchLiveSources(),
    beforeOpen: () => {
      closeReviewPanel({ restore: false })
      showQuickWords.value = false
      showNameGen.value = false
    },
    notify: (message) => authoringTask.notify(message),
    openWorldbookEntry: (entryId) => openWorldbookMentionDetail(entryId),
    selectTarget: (finding) => selectMainSearchTarget(finding),
    restoreSurface: (surface) => restoreSearchSurface(surface),
    restoreSelectionActions: () => {
      const selection = window.getSelection()
      const editor = document.querySelector('.writing-notebook-editor__surface .ProseMirror')
      if (selection?.rangeCount && editor?.contains(selection.anchorNode) && !selection.isCollapsed) {
        selectionActionsVisible.value = true
      }
    },
    persistEditorsBeforeReplace: (setError) => persistSearchEditorsBeforeReplace(setError),
    createProtectionSnapshots: (plan, book, index) => createSearchProtectionSnapshots(plan, book, index),
    loadBooks: () => loadWritingBooks(),
    saveBooks: (nextBooks) => saveWritingBooksDurable(nextBooks).ok,
    afterReplace: (result) => afterSearchReplace(result)
  })
}
function startRewriteFromAnnotation(annotation) {
  if (!annotation || annotation.status === 'orphaned') return
  const anchoredTarget = getRewriteTargetFromAnnotation(annotation)
  resetRewriteState()
  locateAnnotation(annotation)
  nextTick(() => nextTick(() => {
    const target = anchoredTarget || getCurrentRewriteTarget()
    if (!target?.text?.trim()) {
      rewriteError.value = tr('这条批注已无法定位到可改写正文。')
      rewriteTarget.value = { annotationId: annotation.id, text: '' }
      return
    }
    rewriteTarget.value = { ...target, annotationId: annotation.id }
    rewriteInstruction.value = annotation.body
    scheduleAnnotationLayout()
  }))
}
function closeAnnotationRewrite() {
  resetRewriteState()
  scheduleAnnotationLayout()
}
function locateAnnotation(annotation, { tab = 'comments' } = {}) {
  if (!annotation) return
  closeAnnotationComposer({ restoreFocus: false })
  activeAnnotationId.value = annotation.id
  if (!openInspectorTool('annotations', { baseView: tab })) return
  if (annotation.status === 'orphaned') return
  const exact = annotation.selector?.exact
  const range = annotation.range
  if (!exact && !range?.exact) return
  nextTick(() => {
    let selected = range
      ? notebookEditorRef.value?.selectNodeRange?.(
          range.start.nodeId,
          range.start.offset,
          range.end.nodeId,
          range.end.offset
        )
      : notebookEditorRef.value?.selectText?.(exact, 0, annotation.target?.nodeId)
    if (!selected && range && editorRef.value) {
      const startExact = range.startSelector?.exact || exact
      const endExact = range.endSelector?.exact || startExact
      const start = markdownContent.value.indexOf(startExact)
      const endStart = start >= 0 ? markdownContent.value.indexOf(endExact, start + startExact.length) : -1
      if (start >= 0 && endStart >= start) {
        editorRef.value.focus()
        editorRef.value.setSelectionRange(start, endStart + endExact.length)
        selected = true
      }
    }
    if (!selected) return
    selectedText.value = range?.exact || exact
    hasSelection.value = true
    notebookEditorRef.value?.focus?.()
  })
}
function handleAnnotationKeydown(event, annotation, index) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    locateAnnotation(annotation)
    return
  }
  const annotations = marginAnnotations.value
  if (!annotations.length) return
  let nextIndex = index
  if (event.key === 'ArrowDown') nextIndex = Math.min(annotations.length - 1, index + 1)
  if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = annotations.length - 1
  if (nextIndex === index) return
  event.preventDefault()
  const cards = Array.from(event.currentTarget?.parentElement?.querySelectorAll('.writing-annotation') || [])
  cards[nextIndex]?.focus()
  activeAnnotationId.value = annotations[nextIndex].id
}
function onNotebookInput(payload = {}) {
  // Ghost 采纳窗口内：编辑器插入及其 focus 事务都会以普通 'input' 冒出，
  // 这里只同步光标；任何清候选/失效回执/新联想都会把刚要 consume 的建议清空，
  // 导致 accept 的 consume 校验失败而整段回滚（Tab 采纳静默丢内容）。
  if (applyingAtomicNotebookHistory || writingAgentHost.isAdoptionInFlight()) {
    syncCursorAndSelection()
    return
  }
  syncCursorAndSelection()
  if (payload.inputType !== 'writing-agent') {
    notebookCopilotCanUndo.value = false
    // 新的 forward 编辑会让 ProseMirror 丢弃 redo branch；普通 history
    // undo/redo 只是在 branch 内移动，必须保留 Ghost redo ledger。
    if (!['historyUndo', 'historyRedo'].includes(payload.inputType)) clearNotebookAtomicRedoHistory()
    authoringTask.invalidateReceipt()
  }
  writingAgentHost.notifyEditorInput(payload)
}
function syncMarkdownToEditor({ fenceHistory = true } = {}) {
  editorContent.value = markdownToHtml(markdownContent.value || '')
  if (notebookEditorActive.value) {
    writingDocument.value = syncFromMarkdown(markdownContent.value || '')
    if (fenceHistory) {
      // replace-all 型外部同步不能与既有 ProseMirror steps 共用 history。
      // addToHistory:false 只会映射旧 steps，不会清栈；这里以当前结果为新基线。
      invalidateNotebookAtomicHistory()
      authoringTask.invalidateReceipt()
      fenceNotebookHistory()
    }
  }
}
function syncFromCurrentEditor() {
  if (notebookEditorActive.value) {
    editorContent.value = markdownToHtml(markdownContent.value || '')
    return
  }
  if (editorMode.value === 'markdown') {
    editorContent.value = markdownToHtml(markdownContent.value || '')
  }
}
function markdownToHtml(md) {
  if (!md) return ''
  return sanitizeHtml(marked.parse(md))
}
function htmlToMarkdown(html) {
  if (!html) return ''
  return turndownService.turndown(html).replace(/\n{3,}/g, '\n\n')
}
function markdownToPlainText(md) {
  if (!md) return ''
  if (typeof document === 'undefined') return md
  const div = document.createElement('div')
  div.innerHTML = markdownToHtml(md)
  return div.innerText || ''
}
// 点击其他区域关闭右键菜单
function onGlobalClick() {
  contextMenu.value.show = false
  showFontPanel.value = false
  showQuickWords.value = false
  showNameGen.value = false
  moreMenuOpen.value = false
  closeShelfContextMenu()
  hasSelection.value = false
}
</script>

<style scoped src="./Writing.scoped.css">
</style>

<style src="./Writing.global.css"></style>

<style src="./Authoring.block-native.css"></style>
