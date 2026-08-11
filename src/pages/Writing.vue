<template>
  <div class="writing-page wall" @click="onGlobalClick">
    <!-- 软木顶栏 — 单行 64-80px 功能薄条: 书选择 / 保存状态 / 4 个功能 tab + 返回 + 主题 -->
    <div class="wall__cork">
      <label class="wall__book-pill" :class="{ 'is-empty': !selectedBookId }">
        <span class="wall__book-pill-mark" aria-hidden="true">书</span>
        <select
          v-model="selectedBookId"
          class="wall__book-select"
          aria-label="选择书籍"
          @change="handleHeroBookChange"
        >
          <option value="">未选书</option>
          <option v-for="book in books" :key="book.id" :value="book.id">
            {{ book.title }}
          </option>
        </select>
        <svg class="wall__book-pill-arrow" width="8" height="5" viewBox="0 0 8 5" fill="currentColor" aria-hidden="true">
          <path d="M0 0h8L4 5z"/>
        </svg>
      </label>

      <div class="wall__save-chip" :class="`is-${saveStatus}`" :aria-label="`保存状态`">
        <span class="wall__save-chip-state">{{ stampStateText }}</span>
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
        <span>{{ currentChapterTitle || '章节' }}</span>
      </button>

      <div class="wall__tabs">
        <button class="wall__tab" type="button" @click.stop="openAssetInbox" title="打开素材收件箱">收件箱</button>
        <button class="wall__tab" type="button" @click.stop="openMaterialsPage" title="打开完整素材库">素材库</button>
        <template v-if="isKao">
          <button class="wall__tab" type="button" @click.stop="exportChapterStoryboardDraft" title="导出当前章节分镜草稿" :disabled="!selectedChapterId">分镜</button>
          <button class="wall__tab" type="button" @click.stop="goToAdventure" title="回到冒险">冒险</button>
          <button class="wall__back" type="button" @click="goBack" title="返回首页" aria-label="返回">← 返回</button>
        </template>
        <details v-else class="wall__more" @click.stop>
          <summary class="wall__tab" aria-label="更多写作操作" title="更多写作操作">
            <WorkbenchIcon name="more" :size="16" />
            <span>更多</span>
          </summary>
          <div class="wall__more-menu">
            <button type="button" :aria-pressed="copilotEnabled.toString()" @click="toggleAgentRuntime">
              智能 Agent：{{ copilotEnabled ? '开' : '关' }}
            </button>
            <button type="button" @click="exportChapterStoryboardDraft" :disabled="!selectedChapterId">导出章节分镜</button>
            <button type="button" @click="goToAdventure">回到冒险</button>
            <button type="button" @click="goBack">返回首页</button>
          </div>
        </details>
        <button class="wall__tab wall__tab--mode" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换亮色' : '切换暗色'">
          <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
          </svg>
        </button>
      </div>
    </div>

    <button
      v-if="chapterDrawerOpen"
      class="wall__chapter-overlay"
      type="button"
      aria-label="关闭章节列表"
      @click="closeChapterDrawer"
    ></button>

    <!-- 墙主区 — 248px 书架 + 1fr 中央卷宗 -->
    <main class="wall__main">
      <!-- 左：5 层书架 + 章节档案夹 -->
      <aside id="writing-chapter-shelf" ref="chapterShelfRef" class="wall__shelf" :class="{ 'is-mobile-open': chapterDrawerOpen }" :tabindex="chapterDrawerOpen ? -1 : undefined" aria-label="章节书架">
        <div
          v-for="book in books.slice(0, 4)"
          :key="book.id"
          class="wall__folder wall__folder--book"
          :class="{ 'is-active': selectedBookId === book.id }"
          :style="{ '--folder-pin': chapterPinColor(book.chapters?.length || 0) }"
          @click="selectBook(book.id)"
          role="button"
          :aria-label="`书 ${book.title}`"
        >
          <span class="wall__folder-tab">书</span>
          <span class="wall__folder-title">{{ book.title }}</span>
          <span class="wall__folder-meta">{{ book.chapters?.length || 0 }} 章 · {{ chapterWordTotal(book) }} 字</span>
        </div>

        <div
          v-for="(chapter, index) in chapters.slice(0, 6)"
          :key="chapter.id"
          class="wall__folder wall__folder--chapter"
          :class="{
            'is-active': selectedChapterId === chapter.id,
            'is-dragging': dragIndex === index,
            'is-drop-target': dropTargetIndex === index && dropTargetIndex !== dragIndex
          }"
          :style="{ '--folder-pin': chapterPinColor(chapter.wordCount || 0) }"
          draggable="true"
          @click="selectChapter(chapter.id)"
          @dragstart="onChapterDragStart($event, index)"
          @dragover.prevent="onChapterDragOver($event, index)"
          @dragleave="onChapterDragLeave(index)"
          @drop="onChapterDrop($event, index)"
          @dragend="onChapterDragEnd"
          role="button"
          :aria-label="`第 ${index + 1} 章 ${chapter.title || '无标题章节'} · 拖拽排序`"
          :aria-grabbed="dragIndex === index ? 'true' : 'false'"
          :aria-dropeffect="dropTargetIndex === index ? 'move' : 'none'"
        >
          <span class="wall__folder-move-stack" @click.stop>
            <button
              v-if="index > 0"
              class="wall__folder-step wall__folder-step--up"
              type="button"
              @click="reorderChapter(index, index - 1)"
              :aria-label="`第 ${index + 1} 章上移`"
              title="上移"
            >▴</button>
            <button
              v-if="index < chapters.length - 1"
              class="wall__folder-step wall__folder-step--down"
              type="button"
              @click="reorderChapter(index, index + 1)"
              :aria-label="`第 ${index + 1} 章下移`"
              title="下移"
            >▾</button>
          </span>
          <span class="wall__folder-tab">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="wall__folder-title">{{ chapter.title || '无标题章节' }}</span>
          <span class="wall__folder-meta">{{ (chapter.wordCount || 0).toLocaleString() }} 字</span>
        </div>

        <div class="wall__shelf-actions">
          <button class="wall__shelf-pin-btn" type="button" @click="createNewBook" title="新建书籍">+ 新书</button>
          <button class="wall__shelf-pin-btn" type="button" @click="createNewChapter" :disabled="!selectedBookId" title="新建章节">+ 新章</button>
        </div>

        <div class="wall__shelf-roll" aria-hidden="true">
          <div class="wall__shelf-scroll"></div>
          <div class="wall__shelf-note"></div>
          <span class="wall__shelf-roll-label">未展开稿纸卷</span>
        </div>

        <div class="wall__shelf-board" aria-hidden="true"></div>
      </aside>

      <!-- 中：卷宗稿纸（中央主线） -->
      <section class="wall__dossier" aria-label="章节正文卷宗">
        <span class="wall__dossier-tape wall__dossier-tape--left" aria-hidden="true"></span>
        <span class="wall__dossier-tape wall__dossier-tape--right" aria-hidden="true"></span>

        <header class="wall__dossier-head">
          <span class="wall__dossier-num">{{ chapterNumberLabel }}</span>
          <input
            v-model="currentChapterTitle"
            type="text"
            class="wall__dossier-title"
            placeholder="章节标题"
            @input="onTitleChange"
            aria-label="章节标题"
          />
        </header>

        <template v-if="!selectedBookId">
          <div class="wall__dossier-empty">
            <div class="wall__empty-copy">
              <span class="wall__empty-kicker">空白书稿</span>
              <strong>尚未建立书稿</strong>
            </div>
            <div class="wall__empty-actions">
              <button class="wall__pin-cta" type="button" @click="createNewBook">建立第一本书</button>
            </div>
          </div>
        </template>

        <template v-else-if="!selectedChapterId">
          <div class="wall__dossier-empty">
            <div class="wall__empty-copy">
              <span class="wall__empty-kicker">空白章节</span>
              <strong>尚未建立章节</strong>
            </div>
            <div class="wall__empty-actions">
              <button class="wall__pin-cta" type="button" @click="createNewChapter">建立第一章</button>
            </div>
          </div>
        </template>

        <template v-else>
          <WritingInlineCompletion
            :generating="copilotGenerating"
            :visible="copilotVisible"
            :can-undo="writingAgentCanUndo"
            :error="copilotError"
            :cooling-down="writingAgentCoolingDown"
            :matched-count="copilotMatchedEntries.length"
            :style="copilotIndicatorStyle"
            @accept-unit="acceptWritingSuggestion('unit')"
            @accept-all="acceptWritingSuggestion('all')"
            @retry="retryCopilotSuggestion"
            @undo="undoWritingSuggestionApply"
            @dismiss="copilotCancel"
          />

          <div class="wall__dossier-body">
            <div class="editor-toolbar">
              <div class="toolbar-group">
                <button class="tool-btn" @click="autoFormat" title="一键排版">排版</button>
                <button class="tool-btn" @click="insertSeparator" title="插入分隔线">分隔</button>
              </div>
              <div class="toolbar-sep"></div>
              <div class="toolbar-group">
                <button class="tool-btn" :class="{ active: showFontPanel }" @click.stop="showFontPanel = !showFontPanel" title="字体">字体</button>
                <div class="font-panel" v-if="showFontPanel" @click.stop>
                  <div class="fp-row"><span class="fp-label">字体</span>
                    <select class="fp-select" v-model="editorFont">
                      <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                      <option value="'SimSun', serif">宋体</option>
                      <option value="'KaiTi', serif">楷体</option>
                      <option value="'STHeiti', sans-serif">黑体</option>
                      <option value="'MingLiU', serif">细明体</option>
                      <option value="system-ui, sans-serif">系统默认</option>
                    </select>
                  </div>
                  <div class="fp-row"><span class="fp-label">大小</span>
                    <div class="fp-size-btns">
                      <button class="fp-btn" @click="adjustFontSize(-1)" title="缩小">A-</button>
                      <span class="fp-size-val">{{ editorFontSize }}</span>
                      <button class="fp-btn" @click="adjustFontSize(1)" title="放大">A+</button>
                    </div>
                  </div>
                  <div class="fp-row"><span class="fp-label">样式</span>
                    <div class="fp-btns">
                      <button :class="['fp-btn', { active: editorBold }]" @click="editorBold = !editorBold"><strong>B</strong></button>
                      <button :class="['fp-btn', { active: editorItalic }]" @click="editorItalic = !editorItalic"><em>I</em></button>
                      <button :class="['fp-btn', { active: editorUnderline }]" @click="editorUnderline = !editorUnderline"><u>U</u></button>
                    </div>
                  </div>
                </div>
                <button class="tool-btn" :class="{ active: showNameGen }" @click.stop="showNameGen = !showNameGen" title="随机取名">取名</button>
                <div class="name-gen-panel" v-if="showNameGen" @click.stop>
                  <div class="ng-row"><span class="ng-label">类型</span>
                    <div class="ng-btns">
                      <button :class="['ng-btn', { active: nameType === 'character' }]" @click="nameType = 'character'">人物</button>
                      <button :class="['ng-btn', { active: nameType === 'place' }]" @click="nameType = 'place'">地点</button>
                    </div>
                  </div>
                  <div class="ng-row"><span class="ng-label">风格</span>
                    <div class="ng-btns">
                      <button :class="['ng-btn', { active: nameStyle === 'western' }]" @click="nameStyle = 'western'">西方</button>
                      <button :class="['ng-btn', { active: nameStyle === 'ancient' }]" @click="nameStyle = 'ancient'">古风</button>
                      <button :class="['ng-btn', { active: nameStyle === 'modern' }]" @click="nameStyle = 'modern'">现代</button>
                    </div>
                  </div>
                  <div class="ng-row" v-if="nameType === 'character'"><span class="ng-label">姓氏</span>
                    <input v-model="fixedSurname" class="ng-input ng-sm" placeholder="可留空" />
                  </div>
                  <div class="ng-row" v-if="nameType === 'character'"><span class="ng-label">名字</span>
                    <input v-model="fixedGivenName" class="ng-input ng-sm" placeholder="可留空" />
                  </div>
                  <button class="tool-btn" style="width:100%;justify-content:center;margin-top:8px" @click="doGenerateName">生成</button>
                  <div class="ng-results" v-if="generatedNames.length > 0">
                    <div class="ng-result-item" v-for="(item, idx) in generatedNames" :key="idx" @click="selectName(item)">
                      <span v-if="typeof item === 'string'">{{ item }}</span>
                      <span v-else class="ng-name-pair">{{ item.en }}<span class="ng-cn">{{ item.cn }}</span></span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="toolbar-sep"></div>
              <div class="toolbar-group">
                <button
                  class="tool-btn capture-selection-btn"
                  type="button"
                  :disabled="!canCaptureSelection"
                  title="把选中的文字收为素材"
                  data-test="capture-selection"
                  @click="captureSelectionAsAsset"
                >收为素材</button>
                <button
                  v-if="!isKao"
                  class="tool-btn annotation-toolbar-btn"
                  :class="{ active: inspectorOpen && inspectorTab === 'comments' }"
                  type="button"
                  :disabled="!selectedText"
                  title="为选中文字添加批注"
                  @click="openAnnotationInspector"
                >
                  批注<span v-if="openAnnotationCount" class="annotation-toolbar-count">{{ openAnnotationCount }}</span>
                </button>
              </div>
              <div class="toolbar-sep"></div>
              <div class="toolbar-group">
                <button class="tool-btn" :class="{ active: showFindReplace }" @click.stop="showFindReplace = !showFindReplace" title="查找替换">查找</button>
              </div>
              <div class="toolbar-spacer"></div>
              <div class="mode-switch">
                <button class="tool-btn" :class="{ active: editorMode === 'wysiwyg' }" @click="switchEditorMode('wysiwyg')" title="在同一编辑面实时渲染 Markdown">实时</button>
                <button class="tool-btn" :class="{ active: editorMode === 'markdown' }" @click="switchEditorMode('markdown')" title="Markdown">Markdown</button>
                <button class="tool-btn" :class="{ active: editorMode === 'preview' }" @click="switchEditorMode('preview')" title="预览">预览</button>
              </div>
            </div>

            <div v-if="copilotReferenceAsset" class="copilot-reference-bar">
              <span class="copilot-reference-kicker">续写参考</span>
              <span class="copilot-reference-title">{{ copilotReferenceLabel }}</span>
              <span class="copilot-reference-preview">{{ copilotReferencePreview }}</span>
              <button class="copilot-reference-clear" type="button" @click="clearCopilotReference">清除</button>
            </div>

            <section v-if="chapterOutlineItems.length" class="chapter-outline-bar">
              <div class="chapter-outline-head">
                <span class="chapter-outline-title">章节纲要</span>
                <span class="chapter-outline-count">{{ chapterOutlineItems.length }} 条参与续写与章节分镜</span>
              </div>
              <div class="chapter-outline-list">
                <article v-for="item in chapterOutlineItems" :key="item.id" class="chapter-outline-card">
                  <div class="chapter-outline-card-main">
                    <span class="chapter-outline-kind">{{ getAssetKindLabel(item.assetKind) }}</span>
                    <strong>{{ item.title || '未命名纲要' }}</strong>
                    <span>{{ getChapterOutlinePreview(item) }}</span>
                  </div>
                  <div class="chapter-outline-actions">
                    <button type="button" @click="insertChapterOutlineItem(item)">插入</button>
                    <button type="button" @click="removeChapterOutlineItemFromChapter(item.id)">移除</button>
                  </div>
                </article>
              </div>
            </section>

            <div class="find-replace-bar" v-if="showFindReplace" @click.stop>
              <input v-model="findText" class="find-input" placeholder="查找..." @keydown.enter="findNext" />
              <button class="tool-btn sm" @click="findPrev">↑</button>
              <button class="tool-btn sm" @click="findNext">↓</button>
              <span class="find-count" v-if="findResults.length > 0">{{ findCurrent + 1 }}/{{ findResults.length }}</span>
              <span class="find-count" v-else-if="findText">无匹配</span>
              <div class="fr-divider"></div>
              <input v-model="replaceText" class="find-input" placeholder="替换为..." />
              <button class="tool-btn sm" @click="replaceOne">单处</button>
              <button class="tool-btn sm" @click="replaceAll">全部</button>
              <button class="tool-btn sm close" @click="showFindReplace = false">×</button>
            </div>

            <WritingNotebookEditor
              v-if="editorMode === 'wysiwyg'"
              ref="notebookEditorRef"
              :model-value="markdownContent"
              :document="writingDocument"
              :annotations="chapterAnnotations"
              :active-annotation-id="activeAnnotationId"
              :style="notebookEditorStyle"
              @update:modelValue="onNotebookMarkdown"
              @update:document="onNotebookDocumentUpdate"
              @selection-change="onNotebookSelectionChange"
              @annotation-click="handleInlineAnnotationClick"
              @input="onNotebookInput"
              @context-menu="showContextMenu"
            />
            <div v-if="editorMode === 'markdown'" class="markdown-editor-container">
              <textarea
                v-model="markdownContent"
                ref="editorRef"
                class="wall__dossier-textarea markdown-textarea"
                placeholder="开始写作（Markdown）..."
                @input="onMarkdownInput"
                @keydown="onTextAreaKeydown"
                @keyup="syncCopilotCursorFromEditor({ cancelOnMove: true })"
                @click="syncCopilotCursorFromEditor({ cancelOnMove: true })"
                @scroll="onEditorScroll"
              ></textarea>
            </div>
            <div
              v-if="editorMode === 'preview'"
              class="wall__dossier-textarea editor-preview"
              v-html="previewHtml"
            ></div>

            <div class="dossier-footer">
              <span class="dossier-footer-stat">{{ wordCount.toLocaleString() }} 字</span>
              <span class="dossier-footer-stat-divider">·</span>
              <span class="dossier-footer-stat">{{ charCount.toLocaleString() }} 字符</span>
              <span class="dossier-footer-stat-divider">·</span>
              <span class="dossier-footer-stat">修订 {{ revisionLabel }}</span>
            </div>
          </div>

          <!-- 右键菜单 -->
          <div v-if="contextMenu.show" class="context-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }" @click.stop>
            <button class="ctx-item" @click="ctxAction('undo')" :disabled="!canUndo">撤销</button>
            <button class="ctx-item" @click="ctxAction('redo')" :disabled="!canRedo">重做</button>
            <div class="ctx-divider"></div>
            <button class="ctx-item" @click="ctxAction('cut')" :disabled="!selectedText">剪切</button>
            <button class="ctx-item" @click="ctxAction('copy')" :disabled="!selectedText">复制</button>
            <button class="ctx-item" @click="ctxAction('paste')">粘贴</button>
            <button class="ctx-item" @click="ctxAction('delete')" :disabled="!selectedText">删除</button>
            <div class="ctx-divider"></div>
            <button class="ctx-item" @click="ctxAction('selectAll')">全选</button>
          </div>
        </template>
      </section>

      <aside
        v-if="!isKao"
        class="writing-inspector"
        :class="{ 'is-open': inspectorOpen, 'is-pinned': inspectorPinned }"
        aria-label="写作检查器"
      >
        <header class="writing-inspector__head">
          <div>
            <strong>边注</strong>
            <span v-if="openAnnotationCount" class="writing-inspector__head-count">{{ openAnnotationCount }} 条待处理</span>
          </div>
          <div class="writing-inspector__head-actions">
            <button
              class="writing-inspector__icon-btn"
              type="button"
              :class="{ active: inspectorPinned }"
              :aria-pressed="inspectorPinned.toString()"
              title="固定检查器"
              @click="inspectorPinned = !inspectorPinned"
            >⌖</button>
            <button class="writing-inspector__icon-btn" type="button" title="关闭检查器" @click="inspectorOpen = false">×</button>
          </div>
        </header>

        <nav class="writing-inspector__tabs" aria-label="检查器视图">
          <button type="button" :class="{ active: inspectorTab === 'comments' }" @click="inspectorTab = 'comments'">批注 <span v-if="openAnnotationCount">{{ openAnnotationCount }}</span></button>
          <button type="button" :class="{ active: inspectorTab === 'rewrite' }" @click="inspectorTab = 'rewrite'">改写</button>
          <button type="button" :class="{ active: inspectorTab === 'version' }" @click="inspectorTab = 'version'">版本</button>
        </nav>

        <div v-if="inspectorTab === 'comments'" class="writing-inspector__body">
          <div class="writing-inspector__density">
            <button type="button" :class="{ active: annotationScope === 'block' }" @click="annotationScope = 'block'">块</button>
            <button type="button" :class="{ active: annotationScope === 'scene' }" @click="annotationScope = 'scene'">场景</button>
            <button type="button" :class="{ active: annotationScope === 'chapter' }" @click="annotationScope = 'chapter'">全章</button>
            <span class="writing-inspector__density-spacer" aria-hidden="true"></span>
            <button type="button" class="writing-review-trigger" :disabled="reviewLoading || !selectedChapterId" @click="runChapterReview">
              {{ reviewLoading ? `审查中 ${reviewCompletedBatches}/${reviewTotalBatches}` : '章节审查' }}
            </button>
            <button v-if="reviewLoading" type="button" class="writing-review-trigger is-quiet" @click="cancelChapterReview">停止</button>
          </div>
          <p v-if="reviewError" class="writing-review-status is-error" role="alert">{{ reviewError }}</p>
          <p v-else-if="reviewStatus" class="writing-review-status">{{ reviewStatus }}</p>

          <div class="writing-inspector__list" :class="`is-${annotationDensity}`">
            <article
              v-for="annotation in activeBlockAnnotations"
              :key="annotation.id"
              class="writing-annotation"
              :class="[`is-${annotation.status}`, { 'is-active': activeAnnotationId === annotation.id, 'is-reply': Boolean(annotation.parentId) }]"
              role="button"
              tabindex="0"
              :aria-label="`${getWritingAnnotationLabel(annotation)}：${annotation.body}`"
              @click="locateAnnotation(annotation)"
              @focus="activeAnnotationId = annotation.id"
              @keydown="handleAnnotationKeydown($event, annotation, activeBlockAnnotations.indexOf(annotation))"
            >
              <header>
                <span>{{ annotation.reviewType ? `${annotation.reviewType} · ` : '' }}{{ getWritingAnnotationLabel(annotation) }}</span>
                <time>{{ annotation.status === 'orphaned' ? '需处理' : annotation.status === 'resolved' ? '已解决' : '待处理' }}</time>
              </header>
              <p>{{ annotation.body }}</p>
              <div v-if="annotationDensity === 'expanded'" class="writing-annotation__quote">“{{ annotation.range?.exact || annotation.selector?.exact || '无选区' }}”</div>
              <footer>
                <button v-if="annotation.status !== 'orphaned'" type="button" @click.stop="startAnnotationReply(annotation)">回复</button>
                <button v-if="annotation.status === 'open'" type="button" @click.stop="setAnnotationStatus(annotation.id, 'resolved')">标记解决</button>
                <button v-else type="button" @click.stop="setAnnotationStatus(annotation.id, 'open')">恢复</button>
                <button v-if="annotation.kind === 'review-finding' && annotation.status !== 'orphaned'" type="button" @click.stop="startRewriteFromAnnotation(annotation)">进入改写</button>
                <button v-if="annotation.status === 'orphaned'" type="button" @click.stop="reanchorAnnotation(annotation)">用当前选区重关联</button>
              </footer>
            </article>
            <div v-if="!activeBlockAnnotations.length" class="writing-inspector__empty">这段还没有批注。</div>
          </div>

          <div v-if="selectedText || replyTargetAnnotation" class="writing-inspector__composer">
            <div v-if="replyTargetAnnotation" class="writing-inspector__reply-target">
              回复：{{ replyTargetAnnotation.body.slice(0, 56) }}{{ replyTargetAnnotation.body.length > 56 ? '…' : '' }}
              <button type="button" @click="replyTargetAnnotationId = null">取消回复</button>
            </div>
            <div v-if="selectedText" class="writing-inspector__selection">选中：{{ selectedText.slice(0, 90) }}{{ selectedText.length > 90 ? '…' : '' }}</div>
            <textarea v-model="annotationDraft" rows="3" placeholder="写下对这段文字的批注、疑问或修改要求" @keydown.meta.enter.prevent="createAnnotationFromSelection" @keydown.ctrl.enter.prevent="createAnnotationFromSelection"></textarea>
            <button type="button" :disabled="!canCreateAnnotation" @click="createAnnotationFromSelection">{{ replyTargetAnnotation ? '回复' : '添加批注' }}</button>
          </div>
          <div v-else class="writing-inspector__composer-hint">选中正文中的一小段，批注会贴在片段旁边。</div>
        </div>

        <div v-else-if="inspectorTab === 'rewrite'" class="writing-inspector__body writing-rewrite-panel">
          <div v-if="rewriteTarget" class="writing-rewrite-panel__context">
            <strong>{{ rewriteTarget.text }}</strong>
            <small v-if="rewriteTarget">修订 {{ rewriteTarget.documentRevision }} · {{ rewriteTarget.kind === 'multi-selection' ? `跨块选区（${rewriteTarget.blocks?.length || 0}块）` : rewriteTarget.kind === 'selection' ? '选区' : '当前块' }}</small>
          </div>
          <textarea
            v-model="rewriteInstruction"
            class="writing-rewrite-panel__input"
            rows="3"
            placeholder="告诉改写要保留或解决什么，例如：压缩重复动作，保留冷静语气"
            @keydown.meta.enter.prevent="generateRewriteCandidates"
            @keydown.ctrl.enter.prevent="generateRewriteCandidates"
          ></textarea>
          <div class="writing-rewrite-panel__actions">
            <button type="button" :disabled="rewriteLoading || !canGenerateRewrite" @click="generateRewriteCandidates">
              {{ rewriteLoading ? '生成中…' : '生成候选' }}
            </button>
            <button v-if="rewriteLoading" type="button" class="is-quiet" @click="cancelRewriteGeneration">取消</button>
            <button v-if="rewriteError && !rewriteLoading && rewriteTarget" type="button" class="is-quiet" @click="retryRewriteCandidates">重试</button>
            <button v-if="selectedText && rewriteTarget && rewriteTarget.kind !== 'multi-selection'" type="button" class="is-quiet" @click="lockCurrentRewriteSelection">锁定选中片段</button>
            <button v-if="rewriteUndoReceipt" type="button" class="is-quiet" @click="undoRewriteCandidate">撤销采用</button>
          </div>
          <p v-if="rewriteError" class="writing-rewrite-panel__error" role="alert">{{ rewriteError }}</p>
          <div v-if="rewriteLockedSegments.length" class="writing-rewrite-panel__locks">
            <span>已锁定</span>
            <em v-for="segment in rewriteLockedSegments" :key="`${segment.start}-${segment.end}`">{{ segment.text }}</em>
          </div>
          <div v-if="rewriteCandidates.length" class="writing-rewrite-panel__candidates">
            <article
              v-for="candidate in rewriteCandidates"
              :key="candidate.id"
              class="writing-rewrite-candidate"
              :class="{ 'is-selected': selectedRewriteCandidateId === candidate.id, 'is-stale': candidate.status === 'stale', 'is-applied': candidate.status === 'applied' }"
              @click="selectedRewriteCandidateId = candidate.id"
            >
              <header>
                <button type="button" class="writing-rewrite-candidate__select" @click.stop="selectedRewriteCandidateId = candidate.id">
                  {{ candidate.label }}
                </button>
                <span>{{ candidate.status === 'stale' ? '已过期' : candidate.status === 'applied' ? '已采用' : '待审阅' }}</span>
              </header>
              <p v-if="candidate.rationale">{{ candidate.rationale }}</p>
              <div v-if="candidate.patches?.length" class="writing-rewrite-patches" aria-label="跨块改写差异">
                <section v-for="(patch, patchIndex) in candidate.patches" :key="`${candidate.id}-${patch.blockId}`" class="writing-rewrite-patch">
                  <small>块 {{ patchIndex + 1 }}</small>
                  <div class="writing-rewrite-diff">
                    <div><small>原文</small><span v-for="(part, index) in patch.diff.before" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                    <div><small>候选</small><span v-for="(part, index) in patch.diff.after" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                  </div>
                </section>
              </div>
              <div v-else class="writing-rewrite-diff" aria-label="改写差异">
                <div><small>原文</small><span v-for="(part, index) in candidate.diff.before" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                <div><small>候选</small><span v-for="(part, index) in candidate.diff.after" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
              </div>
              <footer>
                <button type="button" :disabled="candidate.status !== 'ready'" @click.stop="applyRewriteCandidate(candidate)">{{ candidate.patches?.length ? '整批采用' : '采用' }}</button>
                <button type="button" class="is-quiet" :disabled="candidate.status === 'applied'" @click.stop="dismissRewriteCandidate(candidate)">忽略</button>
              </footer>
            </article>
          </div>
          <div v-else-if="!rewriteLoading" class="writing-rewrite-panel__empty">
            选中正文后生成候选。
          </div>
        </div>

        <div v-else class="writing-inspector__body writing-version-panel">
          <div class="writing-version-panel__current">
            <div>
              <span>当前章节</span>
              <strong>{{ currentChapterTitle || '未命名章节' }}</strong>
            </div>
            <div class="writing-version-panel__revision" aria-label="当前修订">
              <small>修订</small>
              <b>{{ writingDocument?.revision || 0 }}</b>
            </div>
          </div>
          <section class="writing-quality-panel" aria-label="章节质量检查">
            <header class="writing-quality-panel__head">
              <div>
                <span class="writing-quality-panel__eyebrow">发布前检查</span>
                <strong>章节质量</strong>
              </div>
              <span class="writing-quality-panel__state" :class="`is-${writingQualityReport.status}`">
                {{ writingQualityReport.status === 'blocked' ? '暂不可发布' : writingQualityReport.status === 'attention' ? '建议处理' : '可以发布' }}
              </span>
            </header>
            <div class="writing-quality-panel__metrics" aria-label="质量检查统计">
              <span><b>{{ writingQualityReport.summary.blockers }}</b> 阻断</span>
              <span><b>{{ writingQualityReport.summary.warnings }}</b> 警告</span>
              <span><b>{{ writingQualityReport.summary.info }}</b> 提示</span>
            </div>
            <p class="writing-quality-panel__hint">
              {{ writingQualityReport.status === 'ready' ? '当前正文、批注与保存状态没有阻断项。' : '先处理阻断项，再将章节交给出版或分镜流程。' }}
            </p>
            <div v-if="writingQualityReport.issues.length" class="writing-quality-panel__issues">
              <article v-for="item in writingQualityReport.issues" :key="item.id" class="writing-quality-issue" :class="`is-${item.severity}`">
                <div class="writing-quality-issue__mark" aria-hidden="true"></div>
                <div class="writing-quality-issue__copy">
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <button v-if="item.annotationId || item.blockId" type="button" class="writing-quality-issue__locate" @click="locateQualityIssue(item)">定位</button>
              </article>
            </div>
            <p v-else class="writing-quality-panel__empty">没有发现需要处理的质量问题。</p>
          </section>
          <div class="writing-version-panel__create">
            <input v-model="snapshotLabel" type="text" maxlength="80" placeholder="给这次快照命名" @keydown.enter.prevent="createCurrentWritingSnapshot()">
            <button type="button" :disabled="!selectedChapterId" @click="createCurrentWritingSnapshot()">保存快照</button>
          </div>
          <p v-if="snapshotStatus" class="writing-version-panel__status" role="status">{{ snapshotStatus }}</p>
          <section v-if="writingRecoveryDraft" class="writing-recovery-entry" aria-label="未保存草稿">
            <header>
              <div>
                <strong>发现未保存草稿</strong>
                <small>修订 {{ writingRecoveryDraft.documentRevision }} · {{ formatWritingSnapshotTime(writingRecoveryDraft.createdAt) }}</small>
              </div>
              <span>未写入章节</span>
            </header>
            <p>这份草稿是在正文保存前留下的恢复副本，恢复会先保留当前正文。</p>
            <footer>
              <button type="button" @click="restoreWritingRecoveryDraft">恢复草稿</button>
              <button type="button" class="is-quiet" @click="discardWritingRecoveryDraft">丢弃</button>
            </footer>
          </section>
          <div v-if="writingSnapshots.length" class="writing-version-panel__list" aria-label="章节快照列表">
            <article v-for="snapshot in writingSnapshots" :key="snapshot.id" class="writing-version-entry">
              <header>
                <div>
                  <strong>{{ snapshot.label }}</strong>
                  <small>{{ getWritingSnapshotReasonLabel(snapshot.reason) }} · 修订 {{ snapshot.documentRevision }}</small>
                </div>
                <time :datetime="snapshot.createdAt">{{ formatWritingSnapshotTime(snapshot.createdAt) }}</time>
              </header>
              <p>{{ snapshot.wordCount.toLocaleString() }} 字 · {{ snapshot.chapterTitle || '未命名章节' }}</p>
              <footer>
                <button type="button" @click="restoreWritingSnapshot(snapshot)">恢复到这里</button>
                <button type="button" class="is-quiet" @click="removeWritingSnapshot(snapshot)">删除</button>
              </footer>
            </article>
          </div>
          <div v-else class="writing-version-panel__empty">
            当前章节还没有快照。保存关键改写前的版本，之后可以从这里恢复。
          </div>
          <section v-if="writingBlockHistory.length" class="writing-block-history">
            <header class="writing-block-history__head">
              <strong>块历史</strong>
              <small>只记录已保存的块变更</small>
            </header>
            <article v-for="entry in writingBlockHistory" :key="entry.id" class="writing-block-history__entry">
              <header>
                <div>
                  <strong>{{ entry.blockKind === 'scene-heading' ? '场景标题' : '正文块' }}</strong>
                  <small>修订 {{ entry.fromDocumentRevision }} → {{ entry.toDocumentRevision }} · {{ formatWritingSnapshotTime(entry.createdAt) }}</small>
                </div>
                <span>{{ entry.previousText.length.toLocaleString() }} 字</span>
              </header>
              <p>{{ entry.previousText.slice(0, 120) }}{{ entry.previousText.length > 120 ? '…' : '' }}</p>
              <button type="button" :disabled="!canRestoreWritingBlockHistory(entry)" @click="restoreWritingBlockHistory(entry)">{{ canRestoreWritingBlockHistory(entry) ? '恢复此块' : '块已不存在' }}</button>
            </article>
          </section>
        </div>
      </aside>

      <button v-if="!isKao && !inspectorOpen" class="writing-inspector__reopen" type="button" title="打开检查器" @click="inspectorOpen = true">批注 <span v-if="openAnnotationCount">{{ openAnnotationCount }}</span></button>
    </main>

    <MediaGenerationDrawer
      storage-key="writing_image_library_v1"
      side="right"
      :vertical-offset="62"
      :horizontal-offset="12"
      :mobile-bottom-offset="82"
      drawer-title="小说生图"
      selected-prompt-label="选中文本"
      :selected-text="selectedText"
    />

    <Transition name="modal-fade">
      <div v-if="assetInboxOpen" class="asset-inbox-overlay" @click.self="closeAssetInbox">
        <Transition name="modal-scale" appear>
          <FolioSurface as="article" variant="paper" :decorated="true" class="asset-inbox-modal writing-asset-inbox">
            <header class="asset-inbox-modal-header">
              <div>
                <div class="asset-inbox-modal-kicker">写作素材</div>
                <h3 class="asset-inbox-modal-title">素材收件箱</h3>
              </div>
              <button class="modal-close asset-inbox-close" type="button" @click="closeAssetInbox" aria-label="关闭素材面板">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </header>

            <div class="asset-inbox-modal-toolbar">
              <div class="asset-inbox-toolbar-group">
                <span class="asset-inbox-modal-stat">{{ inboxAssets.length }} 条待处理</span>
                <span class="asset-inbox-modal-stat">已选 {{ selectedInboxAssetIds.length }} 条</span>
              </div>
              <div class="asset-inbox-toolbar-group">
                <select v-model="assetInboxScope" class="asset-inbox-filter" @change="refreshAssetInbox">
                  <option value="all">全部素材</option>
                  <option value="current-book" :disabled="!selectedBookId">当前书</option>
                  <option value="unbound">未绑定</option>
                </select>
                <select v-model="assetInboxKind" class="asset-inbox-filter" @change="refreshAssetInbox">
                  <option value="">全部类型</option>
                  <option v-for="kind in assetKindOptions" :key="kind.value" :value="kind.value">
                    {{ kind.label }} · {{ kind.explanation }}
                  </option>
                </select>
                <button class="quick-note-mini-btn" type="button" @click="refreshAssetInbox">刷新</button>
              </div>
              <div class="asset-inbox-toolbar-group">
                <button class="quick-note-mini-btn" type="button" @click="selectAllInboxAssets">全选</button>
                <button class="quick-note-mini-btn" type="button" @click="clearInboxAssetSelection">清空</button>
                <button class="quick-note-mini-btn primary" type="button" :disabled="!selectedInboxAssetIds.length" @click="insertSelectedAssetsIntoChapter">插入正文</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="addSelectedAssetsToChapterOutline">加入纲要</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="acceptSelectedWorldbookDraftAssets">入世界书</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="archiveSelectedAssets">归档</button>
                <button class="quick-note-mini-btn" type="button" :disabled="!selectedInboxAssetIds.length" @click="rejectSelectedAssets">拒绝</button>
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
                      <span class="asset-inbox-title">{{ asset.title || '未命名素材' }}</span>
                      <span class="asset-inbox-kind">{{ getAssetKindLabel(asset.kind) }}</span>
                    </div>
                    <div class="asset-inbox-source">{{ getAssetSourceDetail(asset.source) }}</div>
                    <div class="asset-inbox-kind-explanation">{{ getAssetKindExplanation(asset.kind) }}</div>
                    <p class="asset-inbox-preview">{{ asset.content }}</p>
                  </div>
                </button>
                <div v-if="!inboxAssets.length" class="asset-inbox-empty-state">
                  当前没有待处理素材
                </div>
              </div>

              <aside class="asset-inbox-detail-panel">
                <template v-if="activeInboxAsset">
                  <div class="asset-inbox-detail-kicker">{{ getAssetKindLabel(activeInboxAsset.kind) }}</div>
                  <div class="asset-inbox-detail-explanation">{{ getAssetKindExplanation(activeInboxAsset.kind) }}</div>
                  <h4 class="asset-inbox-detail-title">{{ activeInboxAsset.title || '未命名素材' }}</h4>
                  <div class="asset-inbox-detail-meta">{{ getAssetSourceDetail(activeInboxAsset.source) }}</div>
                  <div class="asset-inbox-detail-content">{{ activeInboxAsset.content }}</div>
                  <div class="asset-inbox-detail-actions">
                    <button class="quick-note-mini-btn primary" type="button" :title="assetActionHelpMap.insert" @click="insertAssetIntoChapter(activeInboxAsset)">插入正文</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.reference" @click="useAssetAsCopilotContext(activeInboxAsset)">续写参考</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.outline" @click="addAssetToChapterOutline(activeInboxAsset)">加入纲要</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.material" @click="saveAssetAsMaterial(activeInboxAsset)">转成素材</button>
                    <button
                      v-if="canConvertAssetToWorldbookEntry(activeInboxAsset)"
                      class="quick-note-mini-btn"
                      type="button"
                      :title="assetActionHelpMap.worldbook"
                      @click="acceptWorldbookDraftAsset(activeInboxAsset)"
                    >入世界书</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.archive" @click="archiveAsset(activeInboxAsset)">归档</button>
                    <button class="quick-note-mini-btn" type="button" :title="assetActionHelpMap.reject" @click="rejectAsset(activeInboxAsset)">拒绝</button>
                  </div>
                  <div class="asset-action-help-grid">
                    <div v-for="item in assetActionHelpEntries" :key="item.key" class="asset-action-help-item">
                      <strong>{{ item.label }}</strong>
                      <span>{{ item.description }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="asset-inbox-empty-state">
                  选择一条素材查看详情
                </div>
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
          <div class="modal">
            <div class="modal-header">
              <h3>新建书籍</h3>
              <button class="modal-close" @click="showNewBookModal = false">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="input-label">书名</label>
              <input
                v-model="newBookTitle"
                type="text"
                class="input"
                placeholder="输入书籍名称"
                ref="newBookInput"
              />
              <label class="input-label">简介（可选）</label>
              <textarea
                v-model="newBookDesc"
                class="input textarea"
                placeholder="输入书籍简介"
              ></textarea>
            </div>
            <div class="modal-footer">
              <button class="btn" @click="showNewBookModal = false">取消</button>
              <button class="btn-primary" @click="confirmCreateBook" :disabled="!newBookTitle.trim()">创建</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../utils/sanitize'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { extractWritingSuggestionWindow } from '../services/writingSuggestion'
import { useWritingAgent } from '../composables/useWritingAgent'
import { useWorldStore } from '../stores/worldStore'
import { useGameStore } from '../stores/gameStore'
import { useEditorHistory } from '../composables/useEditorHistory'
import MediaGenerationDrawer from '../components/media/MediaGenerationDrawer.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import BookmarkButton from '../components/folio/BookmarkButton.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import WritingInlineCompletion from '../components/writing/WritingInlineCompletion.vue'
import WritingNotebookEditor from '../components/writing/WritingNotebookEditor.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import {
  ASSET_KINDS,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  addNarrativeAsset,
  createNarrativeAssetSourceRef,
  listNarrativeAssets,
  mergeSourceRefs,
  normalizeContentRef,
  sourceRefsToEvidenceRefs,
  setNarrativeAssetsStatus,
  setNarrativeAssetStatus
} from '../services/narrativeAssets'
import {
  buildWorldbookEntryFromAsset,
  canConvertAssetToWorldbookEntry
} from '../services/worldbookDraftAssets'
import {
  createWritingNoteFromAsset,
  prependWritingNote
} from '../services/writingNotes'
import {
  addAssetsToChapterOutline,
  buildChapterOutlineContext,
  normalizeChapterOutlineItems,
  removeChapterOutlineItem
} from '../services/chapterOutline'
import { requestAdvisorTask } from '../services/advisorTaskService'
import {
  applyWritingAgentTransaction,
  undoWritingAgentTransaction
} from '../services/agents/writingAgentTransaction'
import { saveValidatedStoryboardVersion } from '../services/storyboardStore'
import { extractShotsFromChapter, toMarkdown } from '../services/shotExporter'
import { formatWorldbookStatus } from '../services/worldbookFeedback'
import {
  createAssetFromSelection,
  parseInsertBackQuery,
  parseSelectionBackJump,
  resolveInsertOffset,
  spliceTextAt
} from '../services/writingSelectionCapture'
import { wrapMarkdownSelection } from '../services/markdownWrap'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useWritingDocument } from '../composables/useWritingDocument'
import {
  createWritingAnnotation,
  createWritingSelector,
  getWritingAnnotationLabel,
  normalizeWritingAnnotations,
  reconcileWritingAnnotations,
  updateWritingAnnotationStatus
} from '../services/writing/writingAnnotations.js'
import {
  buildWritingCandidateDiff,
  createWritingCandidateRequest,
  getWritingCandidateStaleReason,
  normalizeWritingCandidateResponse
} from '../services/writing/writingCandidates.js'
import { normalizeWritingReviewFindings } from '../../shared/writingReviewContract.js'
import {
  cloneWritingSnapshotDocument,
  createWritingSnapshot,
  getWritingSnapshotReasonLabel,
  getWritingSnapshotRestoreGuard
} from '../../shared/writingSnapshotContract.js'
import {
  deleteWritingSnapshot,
  deleteWritingSnapshotsForChapter,
  listWritingSnapshots,
  saveWritingSnapshot
} from '../services/writing/writingSnapshots.js'
import {
  appendWritingBlockHistory,
  deleteWritingBlockHistoryForChapter,
  listWritingBlockHistory
} from '../services/writing/writingBlockHistory.js'
import {
  clearWritingRecoveryDraft,
  listWritingRecoveryDrafts,
  saveWritingRecoveryDraft
} from '../services/writing/writingRecovery.js'
import { buildWritingBlockHistoryEntries } from '../../shared/writingBlockHistoryContract.js'
import { buildWritingQualityReport } from '../../shared/writingQualityContract.js'

const router = useRouter()
const route = useRoute()
const { isDark, isKao, toggleTheme } = useTheme()
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

const copilotIndicatorStyle = ref({ bottom: '24px', right: '90px' })
const copilotCursorPos = ref(0)
const copilotScrollTop = ref(0)
const copilotScrollLeft = ref(0)

const books = ref([])
const selectedBookId = ref('')
const chapters = ref([])
const selectedChapterId = ref(null)
const currentChapterTitle = ref('')
const editorContent = ref('')
const showNewBookModal = ref(false)
const newBookTitle = ref('')
const newBookDesc = ref('')
const newBookInput = ref(null)
const editorRef = ref(null)
const notebookEditorRef = ref(null)
const notebookSelection = ref(null)
const editorMode = ref('wysiwyg')
const markdownContent = ref('')
const notebookEditorActive = computed(() => editorMode.value === 'wysiwyg')

const notebookEditorStyle = computed(() => ({
  '--notebook-font-family': editorFont.value,
  '--notebook-font-size': editorFontSize.value,
  '--notebook-font-weight': editorBold.value ? '700' : '400',
  '--notebook-font-style': editorItalic.value ? 'italic' : 'normal',
  '--notebook-text-decoration': editorUnderline.value ? 'underline' : 'none'
}))

const rightWidth = ref(210)
const isRightCollapsed = ref(false)
const resizing = ref(null)
const selectedText = ref('')
const chapterAnnotations = ref([])
const activeAnnotationId = ref(null)
const replyTargetAnnotationId = ref(null)
const annotationDraft = ref('')
const annotationScope = ref('block')
const rewriteInstruction = ref('')
const rewriteTarget = ref(null)
const rewriteCandidates = ref([])
const selectedRewriteCandidateId = ref(null)
const rewriteLockedSegments = ref([])
const rewriteLoading = ref(false)
const rewriteError = ref('')
const rewriteUndoReceipt = ref(null)
const reviewLoading = ref(false)
const reviewError = ref('')
const reviewStatus = ref('')
const reviewCompletedBatches = ref(0)
const reviewTotalBatches = ref(0)
const writingSnapshots = ref([])
const writingBlockHistory = ref([])
const writingRecoveryDraft = ref(null)
const snapshotLabel = ref('')
const snapshotStatus = ref('')
let rewriteRequestVersion = 0
let rewriteAbortController = null
let reviewAbortController = null
let recoveryTimeout = null
const inspectorTab = ref('comments')
const inspectorOpen = ref(true)
const inspectorPinned = ref(false)
const annotationDensity = ref('compact')
const editorHistory = useEditorHistory()
const canUndo = editorHistory.canUndo
const canRedo = editorHistory.canRedo
const contextMenu = ref({ show: false, x: 0, y: 0 })
const dragIndex = ref(-1)
const dropTargetIndex = ref(-1)
function reorderChapter(fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= chapters.value.length || toIdx >= chapters.value.length) return
  const list = [...chapters.value]
  const [moved] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, moved)
  chapters.value = list
  saveChapters()
}
function onChapterDragStart(e, idx) {
  dragIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}
function onChapterDragOver(e, idx) {
  dropTargetIndex.value = idx
}
function onChapterDragLeave(_idx) {
  dropTargetIndex.value = -1
}
function onChapterDrop(e, idx) {
  dropTargetIndex.value = -1
  if (dragIndex.value < 0 || dragIndex.value === idx) return
  reorderChapter(dragIndex.value, idx)
}
function onChapterDragEnd() {
  dragIndex.value = -1
  dropTargetIndex.value = -1
}
const editorFont = ref("'Microsoft YaHei', sans-serif")
const showFindReplace = ref(false)
const findText = ref('')
const replaceText = ref('')
const findResults = ref([])
const findCurrent = ref(0)
const showNameGen = ref(false)
const nameType = ref('character')
const nameStyle = ref('chinese')
const fixedSurname = ref('')
const fixedGivenName = ref('')
const generatedNames = ref([])
const showFontPanel = ref(false)
const editorFontSize = ref('16px')
const editorBold = ref(false)
const editorItalic = ref(false)
const editorUnderline = ref(false)
const hasSelection = ref(false)
const selectionFontSize = ref('16px')
const selectionToolbarStyle = ref({ top: '100px', left: '100px' })
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
const copilotReferenceAsset = ref(null)
const chapterOutlineItems = ref([])
const {
  enabled: copilotEnabled,
  setEnabled: setWritingAgentEnabled,
  generating: copilotGenerating,
  suggestion: copilotSuggestion,
  visible: copilotVisible,
  error: copilotError,
  matchedEntries: copilotMatchedEntries,
  canUndoApply: writingAgentCanUndo,
  coolingDown: writingAgentCoolingDown,
  onInput: writingAgentOnInput,
  manualTrigger: copilotManualTrigger,
  accept: writingAgentAccept,
  cancel: copilotCancel,
  suppress: suppressWritingAgent,
  finishComposition: finishWritingAgentComposition,
  undoLastApply: writingAgentUndo
} = useWritingAgent({
  debounceMs: 900,
  getContext: getWritingAgentPageContext,
  getSnapshot: () => ({
    content: markdownContent.value,
    cursorPos: copilotCursorPos.value,
    documentRevision: Number(writingDocument.value?.revision || 0),
    blockTarget: getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
  })
})

function toggleAgentRuntime() {
  setWritingAgentEnabled(!copilotEnabled.value)
}

const saveStatus = ref('saved')
const chapterDrawerOpen = ref(false)
const chapterDrawerTriggerRef = ref(null)
const chapterShelfRef = ref(null)
let saveTimeout = null
let titleTimeout = null

const shouldLockPageScroll = computed(() => {
  return assetInboxOpen.value || showNewBookModal.value
})

useBodyScrollLock(shouldLockPageScroll)

onMounted(() => {
  pendingBackJump.value = parseSelectionBackJump(route.query)
  pendingInsertBack.value = parseInsertBackQuery(route.query)
  if (window.matchMedia?.('(max-width: 720px)').matches) {
    inspectorOpen.value = false
  }
  loadBooks()
  refreshAssetInbox()
  if (pendingBackJump.value) tryApplyPendingBackJump()
  if (pendingInsertBack.value) tryApplyPendingInsertBack()
  document.addEventListener('keydown', handleChapterDrawerKeydown)
  document.addEventListener('keydown', handleWritingInspectorKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleChapterDrawerKeydown)
  document.removeEventListener('keydown', handleWritingInspectorKeydown)
  if (recoveryTimeout) {
    clearTimeout(recoveryTimeout)
    recoveryTimeout = null
  }
  if (saveStatus.value === 'unsaved') writeCurrentWritingRecoveryDraft()
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

function handleChapterDrawerKeydown(event) {
  if (event.key !== 'Escape' || !chapterDrawerOpen.value) return
  event.preventDefault()
  closeChapterDrawer()
}

function handleWritingInspectorKeydown(event) {
  if (event.key !== 'Escape' || !inspectorOpen.value) return
  if (!event.target?.closest?.('.writing-inspector')) return
  event.preventDefault()
  inspectorOpen.value = false
  nextTick(() => notebookEditorRef.value?.focus?.())
}

const previewHtml = computed(() => markdownToHtml(markdownContent.value))
const copilotReferenceLabel = computed(() => {
  if (!copilotReferenceAsset.value) return ''
  const title = String(copilotReferenceAsset.value.title || '').trim() || '未命名素材'
  return `${getAssetKindLabel(copilotReferenceAsset.value.kind)} · ${title}`
})
const copilotReferencePreview = computed(() => {
  const content = String(copilotReferenceAsset.value?.content || '').replace(/\s+/g, ' ').trim()
  return content.length > 64 ? `${content.slice(0, 64)}...` : content
})
const collapsedSidebarWidth = 44
const rightSidebarWidth = computed(() => (isRightCollapsed.value ? collapsedSidebarWidth : rightWidth.value))
const activeWritingBlock = computed(() => {
  const selection = notebookSelection.value
  if (notebookEditorActive.value && selection?.blockId) {
    return getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
  }
  return getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
})
function getAnnotationBlockIds(annotation) {
  return Array.from(new Set([
    annotation?.blockId,
    ...(Array.isArray(annotation?.range?.blockIds) ? annotation.range.blockIds : []),
    annotation?.range?.start?.blockId,
    annotation?.range?.end?.blockId
  ].filter(Boolean)))
}
const sceneIndex = computed(() => {
  const nodes = Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : []
  if (!nodes.length) return []

  const scenes = []
  let current = null
  nodes.forEach((node, index) => {
    const attrs = node?.attrs || {}
    const text = (node?.content || []).map((item) => item?.text || '').join('').trim()
    const blockId = attrs.blockId || `scene-block-${index}`
    const kind = attrs.kind || 'prose'
    if (kind === 'scene-heading') {
      current = {
        id: blockId,
        blockId,
        title: text || `未命名场景 ${scenes.length + 1}`,
        anchorText: text,
        blockIds: [],
        blockCount: 0,
        openCount: 0,
        annotationCount: 0
      }
      scenes.push(current)
    } else if (!current) {
      current = {
        id: `scene-intro-${selectedChapterId.value || 'chapter'}`,
        blockId,
        title: '开篇',
        anchorText: text,
        blockIds: [],
        blockCount: 0,
        openCount: 0,
        annotationCount: 0
      }
      scenes.push(current)
    }

    current.blockIds.push(blockId)
    current.blockCount += 1
  })
  return scenes.map((scene) => {
    const sceneAnnotations = chapterAnnotations.value.filter((annotation) => (
      getAnnotationBlockIds(annotation).some((blockId) => scene.blockIds.includes(blockId))
    ))
    return {
      ...scene,
      annotationCount: sceneAnnotations.length,
      openCount: sceneAnnotations.filter((annotation) => annotation.status !== 'resolved').length
    }
  })
})
const activeScene = computed(() => {
  const blockId = activeWritingBlock.value?.blockId
  return sceneIndex.value.find((scene) => scene.blockIds.includes(blockId))
    || sceneIndex.value[0]
    || null
})
const activeBlockAnnotations = computed(() => {
  if (annotationScope.value === 'chapter') return chapterAnnotations.value

  const blockId = inspectorPinned.value
    ? chapterAnnotations.value.find((annotation) => annotation.id === activeAnnotationId.value)?.blockId
    : activeWritingBlock.value?.blockId
  if (annotationScope.value === 'scene') {
    const blockIds = new Set(activeScene.value?.blockIds || [])
    return chapterAnnotations.value.filter((annotation) => getAnnotationBlockIds(annotation).some((id) => blockIds.has(id)))
  }
  if (!blockId) return chapterAnnotations.value
  return chapterAnnotations.value.filter((annotation) => getAnnotationBlockIds(annotation).includes(blockId))
})
const replyTargetAnnotation = computed(() => chapterAnnotations.value.find(
  (annotation) => annotation.id === replyTargetAnnotationId.value
))
const openAnnotationCount = computed(() => chapterAnnotations.value.filter((annotation) => annotation.status === 'open').length)
const orphanAnnotationCount = computed(() => chapterAnnotations.value.filter((annotation) => annotation.status === 'orphaned').length)
const writingQualityReport = computed(() => buildWritingQualityReport({
  document: writingDocument.value,
  annotations: chapterAnnotations.value,
  recoveryDraft: writingRecoveryDraft.value,
  saveStatus: saveStatus.value,
  snapshots: writingSnapshots.value,
  blockHistory: writingBlockHistory.value
}))
const canGenerateRewrite = computed(() => Boolean(
  selectedChapterId.value && getCurrentRewriteTarget()?.text?.trim()
))
const canCreateAnnotation = computed(() => Boolean(
  selectedChapterId.value
  && annotationDraft.value.trim()
  && (replyTargetAnnotation.value
    ? replyTargetAnnotation.value.status !== 'orphaned'
    : selectedText.value.trim() && activeWritingBlock.value?.blockId)
))

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

const wordCount = computed(() => {
  const text = getEditorText().trim()
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
})

const statusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '已保存'
    case 'saving': return '保存中...'
    case 'unsaved': return '未保存'
    default: return ''
  }
})
const selectedBookSummary = computed(() => {
  const book = books.value.find((item) => item.id === selectedBookId.value)
  if (!book) return ''
  return book.title || '未命名书籍'
})
const selectedChapterSummary = computed(() => {
  const chapter = chapters.value.find((item) => item.id === selectedChapterId.value)
  if (!chapter) return selectedBookSummary.value
  const title = String(chapter.title || '无标题章节').trim()
  const count = Number(chapter.wordCount || 0)
  return `${title} · ${count.toLocaleString()} 字`
})

// UI-W2: Pinax Wall computeds. project title derives from selected book
// or default "未命名作品"; pin strip encodes chapter status (gold=已完稿,
// olive=在写, rose=草稿, ink=未动) for the cork-board color band.
const projectTitle = computed(() => {
  const book = books.value.find((item) => item.id === selectedBookId.value)
  return book?.title || '未命名作品'
})

const stampStateText = computed(() => {
  if (saveStatus.value === 'saving') return '盖印中'
  if (saveStatus.value === 'unsaved') return '待签'
  return '已签'
})

const chapterNumberLabel = computed(() => {
  const idx = chapters.value.findIndex((item) => item.id === selectedChapterId.value)
  if (idx < 0) return 'No.'
  return String(idx + 1).padStart(2, '0')
})

const revisionLabel = computed(() => {
  const stamp = new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return stamp
})

function chapterPinColor(count) {
  const c = Number(count || 0)
  if (c >= 3000) return 'var(--archive-gold)'
  if (c >= 500) return 'var(--archive-olive)'
  if (c > 0) return 'var(--archive-rose)'
  return 'var(--archive-ink-soft)'
}

function chapterWordTotal(book) {
  const list = Array.isArray(book?.chapters) ? book.chapters : []
  return list.reduce((sum, c) => sum + (Number(c.wordCount || 0) || 0), 0).toLocaleString()
}

function handleHeroBookChange() {
  if (!selectedBookId.value) return
  selectBook(selectedBookId.value)
}

function goToAdventure() {
  const hasSession = gameStore.currentSessionId
    && gameStore.sessions.some(s => s.id === gameStore.currentSessionId)
  if (hasSession) {
    router.push({ name: 'experience' })
  } else {
    router.push({ name: 'opening' })
  }
}

function goBack() {
  saveCurrentChapter()
  router.push('/')
}

function readLiveWritingSelectionSnapshot() {
  if (notebookEditorActive.value && notebookSelection.value) {
    const selection = notebookSelection.value
    const selected = String(selection.text || '')
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
    wordCount: editorContent.value.replace(/\s/g, '').length,
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

function buildWritingTaskContext(task = {}) {
  const selection = getWritingSelectionSnapshot()
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
    referenceAsset: buildCopilotAssetContext(copilotReferenceAsset.value)
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

function openMaterialsPage() {
  saveCurrentChapter()
  router.push({ name: 'materials' })
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
    asset.title ? `标题：${asset.title}` : '',
    `类型：${getAssetKindLabel(asset.kind)}`,
    asset.source ? `来源：${getAssetSourceDetail(asset.source)}` : '',
    '',
    content
  ]

  return parts.filter((part) => part !== '').join('\n')
}

function getWritingAgentPageContext() {
  const selectedBook = books.value.find((book) => book.id === selectedBookId.value)
  const currentChapter = selectedBook?.chapters?.find((chapter) => chapter.id === selectedChapterId.value)
  const blockTarget = getWritingBlockAtPosition(copilotCursorPos.value, markdownContent.value)
  return {
    content: markdownContent.value,
    cursorPos: copilotCursorPos.value,
    bookId: selectedBookId.value || null,
    bookTitle: selectedBook?.title || '',
    chapterId: selectedChapterId.value || null,
    chapterTitle: currentChapterTitle.value,
    documentRevision: Number(writingDocument.value?.revision || 0),
    blockTarget,
    sourceRefs: sourceRefsToEvidenceRefs(currentChapter?.sourceRefs || []),
    outlineItems: chapterOutlineItems.value,
    referenceAsset: copilotReferenceAsset.value,
    inboxAssets: inboxAssets.value,
    selectedInboxIds: selectedInboxAssetIds.value,
    worldbook: worldStore.activeWorldbook || null
  }
}

function clearCopilotReference(options = {}) {
  const { silent = false } = options
  if (!copilotReferenceAsset.value) return
  copilotReferenceAsset.value = null
  copilotCancel()
  if (!silent) {
    quickNoteStatus.value = '已清除续写参考'
  }
}

function useAssetAsCopilotContext(asset) {
  const content = String(asset?.content || '').trim()
  if (!content) {
    quickNoteStatus.value = '素材内容为空'
    return
  }

  copilotReferenceAsset.value = {
    id: asset.id,
    title: asset.title || '',
    kind: asset.kind,
    source: asset.source,
    content,
    sourceRefs: Array.isArray(asset.sourceRefs) ? asset.sourceRefs : []
  }
  assetInboxOpen.value = false
  quickNoteStatus.value = `已设为续写参考：${asset.title || '未命名素材'}`

  nextTick(() => {
    editorRef.value?.focus()
    syncCopilotCursorFromEditor()
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
    quickNoteStatus.value = result.skippedCount ? '所选素材已在纲要中或内容为空' : '先选择素材'
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

  setNarrativeAssetStatus(asset.id, 'accepted')
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
  setNarrativeAssetsStatus(acceptedIds, 'accepted')
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已加入 ${result.addedItems.length} 条章节纲要，会参与续写和章节分镜`
}

function removeChapterOutlineItemFromChapter(itemId) {
  chapterOutlineItems.value = removeChapterOutlineItem(chapterOutlineItems.value, itemId)
  syncChapterOutlineToCurrentChapter()
  quickNoteStatus.value = '已移出章节纲要'
}

function insertChapterOutlineItem(item) {
  if (!insertAssetsIntoChapter([{ content: item?.content }])) return
  quickNoteStatus.value = '已插入纲要内容'
}

function getChapterOutlinePreview(item) {
  const content = String(item?.content || '').replace(/\s+/g, ' ').trim()
  return content.length > 54 ? `${content.slice(0, 54)}...` : content
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
  setNarrativeAssetStatus(asset.id, 'accepted')
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
    setNarrativeAssetStatus(asset.id, 'accepted')
    refreshAssetInbox()
    quickNoteStatus.value = `已转成素材：${note.title}`
    return true
  } catch (error) {
    quickNoteStatus.value = error?.message || '转成素材失败'
    return false
  }
}

async function ensureWorldbookTarget() {
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
    setNarrativeAssetStatus(asset.id, 'accepted')
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

    setNarrativeAssetsStatus(acceptedIds, 'accepted')
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
  setNarrativeAssetsStatus(selectedAssets.map((asset) => asset.id), 'accepted')
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

function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportChapterStoryboardDraft() {
  if (!selectedChapterId.value) {
    quickNoteStatus.value = '先选择章节'
    return
  }

  saveCurrentChapter()
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
  setNarrativeAssetStatus(asset.id, 'archived')
  refreshAssetInbox()
  quickNoteStatus.value = '已归档素材'
}

function archiveSelectedAssets() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  setNarrativeAssetsStatus(selectedAssets.map((asset) => asset.id), 'archived')
  selectedInboxAssetIds.value = []
  refreshAssetInbox()
  quickNoteStatus.value = `已归档 ${selectedAssets.length} 条素材`
}

function rejectAsset(asset) {
  setNarrativeAssetStatus(asset.id, 'rejected')
  refreshAssetInbox()
  quickNoteStatus.value = '已拒绝素材'
}

function rejectSelectedAssets() {
  const selectedAssets = getSelectedInboxAssets()
  if (!selectedAssets.length) {
    quickNoteStatus.value = '先选择素材'
    return
  }
  setNarrativeAssetsStatus(selectedAssets.map((asset) => asset.id), 'rejected')
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

function resetRewriteState() {
  rewriteRequestVersion += 1
  rewriteAbortController?.abort()
  rewriteAbortController = null
  rewriteLoading.value = false
  rewriteError.value = ''
  rewriteTarget.value = null
  rewriteCandidates.value = []
  selectedRewriteCandidateId.value = null
  rewriteLockedSegments.value = []
  rewriteUndoReceipt.value = null
}

function loadChapterSnapshots(chapterId) {
  writingSnapshots.value = chapterId ? listWritingSnapshots(chapterId) : []
  writingBlockHistory.value = chapterId ? listWritingBlockHistory(chapterId) : []
  const recoveryDraft = chapterId ? listWritingRecoveryDrafts(chapterId)[0] : null
  if (recoveryDraft) {
    const recoveryGuard = getWritingSnapshotRestoreGuard(recoveryDraft, {
      chapterId,
      documentRevision: writingDocument.value?.revision || 0,
      markdown: markdownContent.value
    })
    if (!recoveryGuard) {
      clearWritingRecoveryDraft(chapterId)
      writingRecoveryDraft.value = null
    } else {
      writingRecoveryDraft.value = recoveryDraft
    }
  } else {
    writingRecoveryDraft.value = null
  }
  snapshotStatus.value = ''
}

function formatWritingSnapshotTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function createCurrentWritingSnapshot({ label = snapshotLabel.value, reason = 'manual', quiet = false } = {}) {
  if (!selectedChapterId.value) return null
  if (!saveCurrentChapter()) {
    snapshotStatus.value = '当前正文保存失败，未创建快照。'
    return null
  }
  const snapshot = createWritingSnapshot({
    chapterId: selectedChapterId.value,
    chapterTitle: currentChapterTitle.value,
    label: label || (reason === 'manual' ? `修订 ${writingDocument.value?.revision || 0}` : ''),
    reason,
    document: writingDocument.value,
    markdown: markdownContent.value,
    annotations: chapterAnnotations.value
  })
  if (!snapshot) {
    snapshotStatus.value = '当前章节过大或结构无效，未能创建快照。'
    return null
  }

  const result = saveWritingSnapshot(snapshot)
  if (!result.ok) {
    snapshotStatus.value = result.reason === 'storage-budget-exceeded'
      ? '快照空间已达到上限，请删除旧版本后重试。'
      : '快照保存失败，当前正文未受影响。'
    return null
  }

  writingSnapshots.value = listWritingSnapshots(selectedChapterId.value)
  snapshotLabel.value = ''
  if (!quiet) snapshotStatus.value = `已保存「${snapshot.label}」`
  return snapshot
}

function restoreWritingSnapshot(snapshot) {
  if (!snapshot || !selectedChapterId.value) return false
  const guard = getWritingSnapshotRestoreGuard(snapshot, {
    chapterId: selectedChapterId.value,
    documentRevision: writingDocument.value?.revision || 0,
    markdown: markdownContent.value
  })
  if (guard === 'chapter-mismatch') {
    snapshotStatus.value = '这个快照不属于当前章节，未执行恢复。'
    return false
  }
  if (guard && typeof window !== 'undefined' && !window.confirm('当前章节在此快照之后已有修改。恢复会先保存一个“恢复前”检查点，继续吗？')) {
    return false
  }

  const checkpoint = createCurrentWritingSnapshot({
    label: `恢复前 · 修订 ${writingDocument.value?.revision || 0}`,
    reason: 'before-restore',
    quiet: true
  })
  if (!checkpoint) {
    snapshotStatus.value = '恢复已停止：无法先保存当前正文的恢复前检查点。'
    return false
  }

  const document = cloneWritingSnapshotDocument(snapshot)
  const chapter = chapters.value.find((item) => item.id === selectedChapterId.value)
  if (!document || !chapter) {
    snapshotStatus.value = '快照结构无效，未执行恢复。'
    return false
  }

  chapter.editorDocument = document
  chapter.editorDocumentSchemaVersion = document.schemaVersion
  chapter.content = snapshot.markdown
  chapter.contentFormat = 'md'
  chapter.annotations = normalizeWritingAnnotations(snapshot.annotations, chapter.id)
  if (!saveChapters()) {
    snapshotStatus.value = '恢复失败：章节正文无法写入，原正文仍保留在当前页面。'
    return false
  }
  selectChapter(selectedChapterId.value)
  snapshotStatus.value = `已恢复「${snapshot.label}」 · 当前修订 ${document.revision}`
  saveStatus.value = 'saved'
  return true
}

function restoreWritingRecoveryDraft() {
  if (!writingRecoveryDraft.value) return
  if (!restoreWritingSnapshot(writingRecoveryDraft.value)) return
  clearWritingRecoveryDraft(selectedChapterId.value)
  writingRecoveryDraft.value = null
  snapshotStatus.value = '已恢复未保存草稿，并保留恢复前检查点。'
}

function discardWritingRecoveryDraft() {
  if (!selectedChapterId.value) return
  clearWritingRecoveryDraft(selectedChapterId.value)
  writingRecoveryDraft.value = null
  snapshotStatus.value = '已丢弃未保存草稿，当前正文未改变。'
}

function canRestoreWritingBlockHistory(entry) {
  return Boolean(
    entry?.blockId &&
    writingDocument.value?.content?.some((node) => node?.attrs?.blockId === entry.blockId)
  )
}

function restoreWritingBlockHistory(entry) {
  if (!canRestoreWritingBlockHistory(entry)) {
    snapshotStatus.value = '这个块已经不存在，无法单独恢复。'
    return
  }
  if (!notebookEditorActive.value || !notebookEditorRef.value) {
    snapshotStatus.value = '块级恢复请先切回所见即所得编辑面。'
    return
  }
  const checkpoint = createCurrentWritingSnapshot({
    label: `块恢复前 · 修订 ${writingDocument.value?.revision || 0}`,
    reason: 'before-restore',
    quiet: true
  })
  if (!checkpoint) {
    snapshotStatus.value = '恢复已停止：无法保存块恢复前检查点。'
    return
  }
  if (!notebookEditorRef.value.replaceBlockText(entry.blockId, entry.previousText)) {
    snapshotStatus.value = '编辑器未接受这次块恢复。'
    return
  }
  snapshotStatus.value = `已恢复块历史 · 修订 ${entry.fromDocumentRevision}`
}

function writeCurrentWritingRecoveryDraft() {
  if (!selectedChapterId.value || !writingDocument.value) return null
  const draft = createWritingSnapshot({
    chapterId: selectedChapterId.value,
    chapterTitle: currentChapterTitle.value,
    label: '未保存草稿',
    reason: 'crash-recovery',
    document: writingDocument.value,
    markdown: markdownContent.value,
    annotations: chapterAnnotations.value
  })
  if (!draft) return null
  const result = saveWritingRecoveryDraft(draft)
  if (result.ok) writingRecoveryDraft.value = draft
  return result.ok ? draft : null
}

function scheduleWritingRecoveryDraft() {
  if (recoveryTimeout) clearTimeout(recoveryTimeout)
  recoveryTimeout = setTimeout(() => {
    recoveryTimeout = null
    writeCurrentWritingRecoveryDraft()
  }, 250)
}

function removeWritingSnapshot(snapshot) {
  if (!snapshot?.id) return
  if (typeof window !== 'undefined' && !window.confirm(`删除「${snapshot.label}」？正文不会改变。`)) return
  const result = deleteWritingSnapshot(snapshot.id)
  if (!result.ok) {
    snapshotStatus.value = '删除快照失败。'
    return
  }
  writingSnapshots.value = listWritingSnapshots(selectedChapterId.value)
  snapshotStatus.value = `已删除「${snapshot.label}」`
}

function loadBooks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WRITING_BOOKS)
    books.value = stored ? JSON.parse(stored) : []
  } catch (e) {
    books.value = []
  }

  ensureInitialBookSelection()
}

function saveBooks() {
  try {
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify(books.value))
    return true
  } catch {
    saveStatus.value = 'error'
    return false
  }
}

function ensureInitialBookSelection() {
  if (selectedBookId.value || books.value.length === 0) return
  openBook(books.value[0].id, { fromInitialLoad: true })
}

function openBook(bookId, options = {}) {
  const { fromInitialLoad = false } = options
  saveCurrentChapter()
  selectedBookId.value = bookId
  if (assetInboxScope.value === 'current-book') {
    refreshAssetInbox()
  }

  const book = books.value.find((item) => item.id === bookId)
  if (!book) {
    if (fromInitialLoad) {
      selectedChapterId.value = null
      currentChapterTitle.value = ''
      editorContent.value = ''
      markdownContent.value = ''
      clearWritingDocument()
      chapterOutlineItems.value = []
      chapterAnnotations.value = []
      activeAnnotationId.value = null
      replyTargetAnnotationId.value = null
      annotationDraft.value = ''
      resetRewriteState()
      clearCopilotReference({ silent: true })
    }
    return
  }

  chapters.value = book.chapters || []
  if (chapters.value.length > 0) {
    selectChapter(chapters.value[0].id)
  } else {
    selectedChapterId.value = null
    currentChapterTitle.value = ''
    editorContent.value = ''
    markdownContent.value = ''
    clearWritingDocument()
    chapterOutlineItems.value = []
    chapterAnnotations.value = []
    activeAnnotationId.value = null
    replyTargetAnnotationId.value = null
    annotationDraft.value = ''
    resetRewriteState()
    clearCopilotReference({ silent: true })
  }
  saveStatus.value = 'saved'
}

function selectBook(bookId) {
  openBook(bookId)
  closeChapterDrawer()
}

function selectChapter(chapterId) {
  if (selectedChapterId.value && selectedChapterId.value !== chapterId) {
    saveCurrentChapter()
  }
  cancelChapterReview()
  copilotCancel()
  resetRewriteState()
  clearCopilotReference({ silent: true })
  annotationScope.value = 'block'
  selectedChapterId.value = chapterId
  const chapter = chapters.value.find(c => c.id === chapterId)
  if (chapter) {
    currentChapterTitle.value = chapter.title || ''
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
    activeAnnotationId.value = null
    replyTargetAnnotationId.value = null
    annotationDraft.value = ''
    editorHistory.clear()
    nextTick(() => {
      if (editorRef.value) editorRef.value.value = markdownContent.value
    })
  } else {
    chapterOutlineItems.value = []
    chapterAnnotations.value = []
    activeAnnotationId.value = null
    replyTargetAnnotationId.value = null
    annotationDraft.value = ''
    clearWritingDocument()
    loadChapterSnapshots(null)
  }
  closeChapterDrawer()
}

function locateQualityIssue(issue) {
  if (!issue) return
  if (issue.annotationId) {
    const annotation = chapterAnnotations.value.find((item) => item.id === issue.annotationId)
    if (annotation && annotation.status !== 'orphaned') {
      locateAnnotation(annotation)
      return
    }
  }
  if (!issue.blockId) return

  inspectorOpen.value = true
  inspectorTab.value = 'comments'
  const focused = notebookEditorActive.value
    ? Boolean(notebookEditorRef.value?.focusBlock?.(issue.blockId))
    : false
  if (focused) return

  const block = writingDocument.value?.content?.find((node) => node?.attrs?.blockId === issue.blockId)
  const blockText = (block?.content || []).map((item) => item?.text || '').join('')
  const offset = blockText ? markdownContent.value.indexOf(blockText) : -1
  if (editorRef.value) {
    const position = offset >= 0 ? offset : 0
    editorRef.value.focus()
    editorRef.value.setSelectionRange(position, position + blockText.length)
  }
}

function createNewBook() {
  showNewBookModal.value = true
  newBookTitle.value = ''
  newBookDesc.value = ''
  nextTick(() => newBookInput.value?.focus())
}

function confirmCreateBook() {
  if (!newBookTitle.value.trim()) return

  const newBook = {
    id: Date.now().toString(),
    title: newBookTitle.value.trim(),
    description: newBookDesc.value.trim(),
    createdAt: new Date().toISOString(),
    chapters: []
  }

  books.value.push(newBook)
  saveBooks()
  selectBook(newBook.id)
  showNewBookModal.value = false
}

function createNewChapter() {
  if (!selectedBookId.value) return

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
  saveChapters()
  selectChapter(newChapter.id)
}

function deleteChapter(chapterId) {
  deleteWritingSnapshotsForChapter(chapterId)
  deleteWritingBlockHistoryForChapter(chapterId)
  clearWritingRecoveryDraft(chapterId)
  chapters.value = chapters.value.filter(c => c.id !== chapterId)
  if (selectedChapterId.value === chapterId) {
    selectedChapterId.value = chapters.value.length > 0 ? chapters.value[0].id : null
    if (selectedChapterId.value) {
      selectChapter(selectedChapterId.value)
    } else {
      currentChapterTitle.value = ''
      editorContent.value = ''
      markdownContent.value = ''
      chapterOutlineItems.value = []
      loadChapterSnapshots(null)
    }
  }
  saveChapters()
}

function deleteBook(bookId) {
  const bookToDelete = books.value.find((book) => book.id === bookId)
  for (const chapter of bookToDelete?.chapters || []) {
    deleteWritingSnapshotsForChapter(chapter.id)
    deleteWritingBlockHistoryForChapter(chapter.id)
    clearWritingRecoveryDraft(chapter.id)
  }
  books.value = books.value.filter(b => b.id !== bookId)
  saveBooks()
  if (selectedBookId.value === bookId) {
    selectedBookId.value = books.value.length > 0 ? books.value[0].id : null
    if (selectedBookId.value) {
      selectBook(selectedBookId.value)
    } else {
      chapters.value = []
      selectedChapterId.value = null
      currentChapterTitle.value = ''
      editorContent.value = ''
      markdownContent.value = ''
      chapterOutlineItems.value = []
    }
  }
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

function saveCurrentChapter() {
  if (!selectedChapterId.value) return false

  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (!chapter) return false

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
  chapter.wordCount = wordCount.value
  chapter.updatedAt = new Date().toISOString()
  const saved = saveChapters()
  if (saved && previousDocument) {
    const historyEntries = buildWritingBlockHistoryEntries({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      previousDocument,
      nextDocument,
      source: 'manual-save'
    })
    if (historyEntries.length) {
      appendWritingBlockHistory(historyEntries)
      writingBlockHistory.value = listWritingBlockHistory(chapter.id)
    }
  }
  return saved
}

function onTitleChange() {
  saveStatus.value = 'unsaved'
  if (titleTimeout) clearTimeout(titleTimeout)
  titleTimeout = setTimeout(() => {
    saveCurrentChapter()
    saveStatus.value = 'saving'
    setTimeout(() => { saveStatus.value = 'saved' }, 300)
  }, 500)
}

// 一键排版：规范段落分隔
function autoFormat() {
  let text = markdownContent.value
  // 替换多个换行为双换行（段落分隔）
  text = text.replace(/\n{3,}/g, '\n\n')
  // 移除行首行尾多余空格
  text = text.split('\n').map(line => line.trim()).join('\n')
  // 移除全角空格
  text = text.replace(/　/g, ' ').trim()
  markdownContent.value = text
  syncMarkdownToEditor()
  onContentChange()
}

// 插入分隔线
function insertSeparator() {
  if (notebookEditorActive.value && notebookEditorRef.value) {
    notebookEditorRef.value.insertDivider()
    onContentChange()
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

// 随机取名
function doGenerateName() {
  // 中文字符池
  const charPool = '瑾言清晚长风昭华知意逾白屿森念卿知行听澜挽棠墨深绾绾晏礼言蹊如故未歇星野映之清欢妄惊鸿云深瑶霜露璃萤雪'
  const ancientCharPool = '寻欢孤城吹雪小凤留香浪中棠十一郎不凡清扬我行问天慕白未央紫轩飞羽寒江孤鸿寒烟凝蝶落霞凌霜白露秋璃夏萤冬雪云浅萧默'

  generatedNames.value = []

  if (nameType.value === 'place') {
    const places = {
      western: ['Willowbrook', 'Ironforge', 'Silvermoon', 'DragonSpine', 'Stormwind', 'Darkwood', 'Brightport', 'Goldshire', 'Misty Valley', 'Sunnyridge', 'CrystalLake', 'Ravencliff', 'Thornwood', 'Stonehaven', 'Duskwood'],
      ancient: ['长安城', '洛阳城', '扬州城', '成都府', '苏州城', '杭州城', '汴京城', '金陵城', '燕京城', '临安府', '襄阳城', '荆州城', '泉州城', '广州城', '福州城'],
      modern: ['朝阳区', '海淀区', '浦东新区', '天河区', '南山区', '江汉区', '玄武区', '西城区', '东城区', '西湖区', '静安区', '黄浦区', '南开区', '和平区', '江岸区']
    }
    const list = places[nameStyle.value] || places.modern
    for (let i = 0; i < 5; i++) {
      generatedNames.value.push(list[Math.floor(Math.random() * list.length)])
    }
    generatedNames.value = [...new Set(generatedNames.value)]
    return
  }

  const hasSurname = fixedSurname.value.trim()
  const hasGivenName = fixedGivenName.value.trim()

  if (nameStyle.value === 'western') {
    const firstNames = ['Oliver', 'Emma', 'Liam', 'Sophia', 'Noah', 'Isabella', 'James', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia', 'Mason', 'Harper', 'Ethan', 'Evelyn', 'Alexander', 'Abigail', 'Henry', 'Emily', 'William', 'Ava', 'Michael', 'Ella', 'Daniel', 'Scarlett', 'Matthew', 'Grace', 'Sebastian', 'Chloe', 'Jack', 'Victoria', 'Owen', 'Aria', 'Luke', 'Lily', 'Dylan', 'Hannah', 'Gabriel', 'Zoey']
    const lastNames = ['Anderson', 'Thompson', 'White', 'Mitchell', 'Clark', 'Roberts', 'Taylor', 'Martinez', 'Harris', 'Robinson', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins']
    const firstCn = ['奥利弗', '艾玛', '利亚姆', '索菲亚', '诺亚', '伊莎贝拉', '詹姆斯', '米娅', '本杰明', '夏洛特', '卢卡斯', '艾米莉亚', '梅森', '哈珀', '伊桑', '伊芙琳', '亚历山大', '阿比盖尔', '亨利', '艾米丽', '威廉', '艾娃', '迈克尔', '艾拉', '丹尼尔', '斯嘉丽', '马修', '格蕾丝', '塞巴斯蒂安', '克洛伊', '杰克', '维多利亚', '欧文', '艾瑞亚', '卢克', '莉莉', '迪伦', '汉娜', '加布里埃尔', '佐伊']
    const lastCn = ['安德森', '汤普森', '怀特', '米切尔', '克拉克', '罗伯茨', '泰勒', '马丁内斯', '哈里斯', '鲁宾逊', '李', '沃克', '霍尔', '艾伦', '扬', '金', '赖特', '洛佩兹', '希尔', '斯科特', '格林', '亚当斯', '贝克', '纳尔逊', '卡特', '米切尔', '佩雷斯', '罗伯茨', '特纳', '菲利普斯', '坎贝尔', '帕克', '埃文斯', '爱德华兹', '柯林斯']

    // 尝试匹配用户输入
    let fixedFirst = null, fixedLast = null
    if (hasGivenName) {
      const idx = firstCn.indexOf(fixedGivenName.value.trim())
      if (idx >= 0) fixedFirst = firstNames[idx]
      else fixedFirst = fixedGivenName.value.trim()
    }
    if (hasSurname) {
      const idx = lastCn.indexOf(fixedSurname.value.trim())
      if (idx >= 0) fixedLast = lastNames[idx]
      else fixedLast = fixedSurname.value.trim()
    }

    const seen = new Set()
    for (let i = 0; i < 8 && seen.size < 8; i++) {
      let f = fixedFirst || firstNames[Math.floor(Math.random() * firstNames.length)]
      let l = fixedLast || lastNames[Math.floor(Math.random() * lastNames.length)]
      let enName = f + ' ' + l
      if (seen.has(enName)) continue
      seen.add(enName)
      let fIdx = firstNames.indexOf(f)
      let lIdx = lastNames.indexOf(l)
      let cnName = (fIdx >= 0 ? firstCn[fIdx] : f) + '·' + (lIdx >= 0 ? lastCn[lIdx] : l)
      generatedNames.value.push({ en: enName, cn: cnName })
    }
  } else {
    // 算法化生成中文姓名
    const surnames = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕', '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎', '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜', '范', '方', '石', '姚', '谭', '廖', '邹', '熊', '金', '陆', '郝', '孔', '白', '崔', '康', '毛', '邱', '秦', '江', '史', '顾', '侯', '邵', '孟', '龙', '万', '段', '漕', '钱', '汤', '尹', '黎', '易', '常', '武', '乔', '贺', '赖', '龚', '文']
    const pool = nameStyle.value === 'ancient' ? ancientCharPool : charPool

    const seen = new Set()
    const getName = () => {
      let surname = hasSurname ? fixedSurname.value.trim() : surnames[Math.floor(Math.random() * surnames.length)]
      let given = hasGivenName ? fixedGivenName.value.trim() : ''
      if (!given) {
        // 随机生成1-2个汉字的名字
        const len = Math.random() < 0.6 ? 1 : 2
        for (let i = 0; i < len; i++) {
          given += pool[Math.floor(Math.random() * pool.length)]
        }
      }
      return surname + given
    }

    for (let i = 0; i < 20 && seen.size < 10; i++) {
      const name = getName()
      if (seen.has(name)) continue
      seen.add(name)
      generatedNames.value.push(name)
    }
  }
}

function selectName(item) {
  if (notebookEditorActive.value && notebookEditorRef.value) {
    notebookEditorRef.value.insertText(typeof item === 'string' ? item : item.en)
    onContentChange()
    showNameGen.value = false
    generatedNames.value = []
    return
  }

  const editor = editorRef.value
  if (!editor) return
  const name = typeof item === 'string' ? item : item.en
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
  showNameGen.value = false
  generatedNames.value = []
}

// 查找下一个
function findNext() {
  if (!findText.value) return
  if (findResults.value.length === 0) {
    searchFind()
  }
  if (findResults.value.length > 0) {
    findCurrent.value = (findCurrent.value + 1) % findResults.value.length
    highlightFind()
  }
}

// 更新选区状态
function updateSelectionStyle() {
  if (editorMode.value !== 'wysiwyg') {
    hasSelection.value = false
    return
  }

  const editor = notebookEditorActive.value
    ? notebookEditorRef.value?.getRootElement?.()
    : editorRef.value
  if (!editor) {
    hasSelection.value = false
    return
  }

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    hasSelection.value = false
    return
  }

  const range = sel.getRangeAt(0)
  if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
    hasSelection.value = false
    syncSelectionCommandState()
    return
  }

  const rangeRect = range.getBoundingClientRect()
  if (!rangeRect || (!rangeRect.width && !rangeRect.height)) {
    hasSelection.value = false
    return
  }

  hasSelection.value = true
  syncSelectionCommandState()

  const toolbarWidth = 280
  const toolbarHeight = 36
  const margin = 8
  let left = rangeRect.left + rangeRect.width / 2 - toolbarWidth / 2
  let top = rangeRect.top - toolbarHeight - margin

  if (top < 8) {
    top = rangeRect.bottom + margin
  }

  left = Math.max(12, Math.min(left, window.innerWidth - toolbarWidth - 12))

  selectionToolbarStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`
  }
}

function toggleStyle(style) {
  if (style === 'bold') editorBold.value = !editorBold.value
  else if (style === 'italic') editorItalic.value = !editorItalic.value
  else if (style === 'underline') editorUnderline.value = !editorUnderline.value
}

function applyStyleToSelection(style) {
  if (notebookEditorActive.value && notebookEditorRef.value) {
    if (['bold', 'italic', 'strike', 'code'].includes(style)) {
      notebookEditorRef.value.toggleMark(style)
      onContentChange()
    }
    return
  }

  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  const commandMap = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline'
  }
  const command = commandMap[style]
  if (!command) return
  const selection = {
    start: editor.selectionStart ?? markdownContent.value.length,
    end: editor.selectionEnd ?? markdownContent.value.length
  }
  const result = wrapMarkdownSelection(markdownContent.value, selection, command)
  if (!result.changed) return
  markdownContent.value = result.text
  syncMarkdownToEditor()
  nextTick(() => {
    const ta = editorRef.value
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(result.selection.start, result.selection.end)
    selectedText.value = result.text.slice(result.selection.start, result.selection.end)
  })
  onContentChange()
}

function adjustSelectionFont(delta) {
  const sizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24]
  const current = parseInt(selectionFontSize.value)
  const idx = sizes.indexOf(current)
  const newIdx = Math.max(0, Math.min(sizes.length - 1, idx + delta))
  selectionFontSize.value = sizes[newIdx] + 'px'
  const sel = window.getSelection()
  if (editorMode.value === 'wysiwyg' && sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
    applyStyleToRange({ fontSize: selectionFontSize.value })
    onContentChange()
  }
}

function clearSelectionStyle() {
  // TODO(undo-redo): document.execCommand('removeFormat') is contenteditable-only
  // and does not work on textarea.
  if (editorMode.value !== 'wysiwyg') return
  if (notebookEditorActive.value && notebookEditorRef.value) {
    notebookEditorRef.value.clearMarks()
    onContentChange()
    return
  }
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  document.execCommand('removeFormat')
  onContentChange()
}

function toggleRightSidebar() {
  isRightCollapsed.value = !isRightCollapsed.value
}

function adjustFontSize(delta) {
  const sizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]
  const currentStr = editorFontSize.value
  const current = parseInt(currentStr.replace('px', ''))
  const idx = sizes.indexOf(current)
  const newIdx = Math.max(0, Math.min(sizes.length - 1, idx + delta))
  editorFontSize.value = sizes[newIdx] + 'px'
  onContentChange()
}

// 查找上一个
function findPrev() {
  if (!findText.value) return
  if (findResults.value.length === 0) {
    searchFind()
  }
  if (findResults.value.length > 0) {
    findCurrent.value = (findCurrent.value - 1 + findResults.value.length) % findResults.value.length
    highlightFind()
  }
}

// 执行搜索
function searchFind() {
  findResults.value = []
  findCurrent.value = 0
  if (!findText.value) return
  const text = editorMode.value === 'markdown' ? markdownContent.value : getEditorText()
  const regex = new RegExp(findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let match
  while ((match = regex.exec(text)) !== null) {
    findResults.value.push(match.index)
  }
}

// 高亮当前匹配并滚动
function highlightFind() {
  nextTick(() => {
    if (findResults.value.length === 0) return
    if (editorMode.value === 'markdown') return
    if (notebookEditorActive.value && notebookEditorRef.value) {
      notebookEditorRef.value.selectText(findText.value, findCurrent.value)
      notebookEditorRef.value.focus()
      return
    }
    const pos = findResults.value[findCurrent.value]
    if (!editorRef.value) return
    setSelectionByTextOffsets(pos, pos + findText.value.length)
    editorRef.value.focus()
  })
}

// 替换一处
function replaceOne() {
  if (!findText.value || findResults.value.length === 0) return
  if (notebookEditorActive.value && notebookEditorRef.value) {
    const replaced = notebookEditorRef.value.replaceText(findText.value, replaceText.value, findCurrent.value)
    if (!replaced) return
    searchFind()
    onContentChange()
    return
  }
  const text = editorMode.value === 'markdown' ? markdownContent.value : getEditorText()
  const pos = findResults.value[findCurrent.value]
  const nextText = text.substring(0, pos) + replaceText.value + text.substring(pos + findText.value.length)
  if (editorMode.value === 'markdown') {
    markdownContent.value = nextText
    syncMarkdownToEditor()
  } else {
    setEditorPlainText(nextText)
  }
  searchFind()
  onContentChange()
}

// 替换全部
function replaceAll() {
  if (!findText.value) return
  if (notebookEditorActive.value && notebookEditorRef.value) {
    const replaced = notebookEditorRef.value.replaceAll(findText.value, replaceText.value)
    if (!replaced) return
    findResults.value = []
    findCurrent.value = 0
    onContentChange()
    return
  }
  const text = editorMode.value === 'markdown' ? markdownContent.value : getEditorText()
  const regex = new RegExp(findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
  const nextText = text.replace(regex, replaceText.value)
  if (editorMode.value === 'markdown') {
    markdownContent.value = nextText
    syncMarkdownToEditor()
  } else {
    setEditorPlainText(nextText)
  }
  findResults.value = []
  findCurrent.value = 0
  onContentChange()
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
    syncCopilotCursorFromEditor()
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
  syncCopilotCursorFromEditor()
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
      router.replace({ query: {} })
    }))
    return
  }
  nextTick(() => {
    applyBackJumpToTextarea(jump)
    pendingBackJump.value = null
    router.replace({ query: {} })
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
  saveCurrentChapter()
  selectedBookId.value = bookId
  const book = books.value.find((b) => b.id === bookId)
  if (!book) return false
  chapters.value = book.chapters || []
  if (chapters.value.some((c) => c.id === chapterId)) {
    selectChapter(chapterId)
  } else if (chapters.value.length > 0) {
    selectChapter(chapters.value[0].id)
  }
  saveChapters()
  return true
}

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
  saveCurrentChapter()

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
      syncCopilotCursorFromEditor()
    })
  }

  const where = offset === currentText.length ? '章节末尾' : `偏移 ${offset}`
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
    router.replace({ query: {} })
    return
  }
  const { book, chapter } = found

  // Load the asset by id regardless of status; listNarrativeAssets with
  // status=null returns all assets (no status filter applied).
  const asset = listNarrativeAssets({ status: null })
    .find((a) => a && a.id === ins.insertAssetId)
  if (!asset) {
    pendingInsertBack.value = null
    router.replace({ query: {} })
    quickNoteStatus.value = '素材已被删除,已取消插入'
    return
  }

  const run = () => {
    nextTick(() => nextTick(() => {
      const ok = performInsertAtChapter(chapter, asset)
      pendingInsertBack.value = null
      router.replace({ query: {} })
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

function onContentChange() {
  syncFromCurrentEditor()
  saveStatus.value = 'unsaved'
  scheduleWritingRecoveryDraft()
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
    const saved = saveCurrentChapter()
    if (saved) {
      clearWritingRecoveryDraft(selectedChapterId.value)
      writingRecoveryDraft.value = null
    }
    setTimeout(() => { saveStatus.value = saved ? 'saved' : 'error' }, 300)
  }, 1000)
}

function onEditorInput() {
  onContentChange()
}

function onMarkdownInput(event) {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    markdownContent.value = editorRef.value.value
    editorHistory.push(editorRef.value)
  }
  syncCopilotCursorFromEditor()
  syncMarkdownToEditor()
  onContentChange()

  // Only ordinary typing may schedule an inline completion. Paste, drop,
  // history operations, and IME composition are explicitly suppressed.
  if (copilotEnabled.value && editorRef.value) {
    writingAgentOnInput({
      content: markdownContent.value,
      cursorPos: copilotCursorPos.value,
      hasSelection: Boolean(selectedText.value),
      inputType: event?.inputType || '',
      composing: Boolean(event?.isComposing)
    })
  }
}

function onWritingCompositionStart() {
  suppressWritingAgent('composition')
}

function onWritingCompositionEnd() {
  finishWritingAgentComposition()
}

function onWritingPaste() {
  suppressWritingAgent('paste')
}

function syncCopilotCursorFromEditor(options = {}) {
  const { cancelOnMove = false } = options
  if (notebookEditorActive.value) {
    const snapshot = readLiveWritingSelectionSnapshot()
    if (cancelOnMove && copilotVisible.value && snapshot.end !== copilotCursorPos.value) {
      copilotCancel()
    }
    copilotCursorPos.value = snapshot.end
    selectedText.value = snapshot.text
    return
  }
  const editor = editorRef.value
  if (!editor || typeof editor.selectionStart !== 'number') return
  const text = markdownContent.value || ''
  const selectionStart = Math.max(0, Math.min(text.length, Math.min(editor.selectionStart, editor.selectionEnd ?? editor.selectionStart)))
  const selectionEnd = Math.max(0, Math.min(text.length, Math.max(editor.selectionStart, editor.selectionEnd ?? editor.selectionStart)))
  const nextCursor = Math.max(0, Math.min(text.length, editor.selectionStart))
  if (cancelOnMove && copilotVisible.value && nextCursor !== copilotCursorPos.value) {
    copilotCancel()
  }
  copilotCursorPos.value = nextCursor
  selectedText.value = selectionEnd > selectionStart
    ? text.slice(selectionStart, selectionEnd)
    : ''
  copilotScrollTop.value = editor.scrollTop || 0
  copilotScrollLeft.value = editor.scrollLeft || 0
}

function onEditorScroll(event) {
  copilotScrollTop.value = event.target?.scrollTop || 0
  copilotScrollLeft.value = event.target?.scrollLeft || 0
}

function acceptWritingSuggestion(mode = 'all') {
  const editor = editorRef.value
  if (editor) {
    syncCopilotCursorFromEditor()
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
      syncCopilotCursorFromEditor()
      return
    }
    if (editorRef.value) {
      editorRef.value.setSelectionRange(result.newCursorPos, result.newCursorPos)
      editorRef.value.focus()
      syncCopilotCursorFromEditor()
    }
  })
}

function undoWritingSuggestionApply() {
  const result = writingAgentUndo(markdownContent.value)
  if (!result.ok) return
  markdownContent.value = result.content
  if (editorRef.value) {
    editorRef.value.value = result.content
    editorHistory.push(editorRef.value)
  }
  syncMarkdownToEditor()
  onContentChange()
  nextTick(() => {
    if (notebookEditorActive.value && notebookEditorRef.value) {
      notebookEditorRef.value.focus()
      syncCopilotCursorFromEditor()
      return
    }
    editorRef.value?.setSelectionRange(result.cursorPos, result.cursorPos)
    editorRef.value?.focus()
    syncCopilotCursorFromEditor()
  })
}

function retryCopilotSuggestion() {
  syncCopilotCursorFromEditor()
  copilotManualTrigger()
  nextTick(() => {
    if (notebookEditorActive.value) notebookEditorRef.value?.focus()
    else editorRef.value?.focus()
  })
}

function onTextAreaKeydown(e) {
  // Ctrl/Cmd+Z — undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
    e.preventDefault()
    suppressWritingAgent('history')
    editorHistory.undo(e.target)
    return
  }
  // Ctrl/Cmd+Shift+Z or Ctrl+Y — redo
  if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
      ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'y')) {
    e.preventDefault()
    suppressWritingAgent('history')
    editorHistory.redo(e.target)
    return
  }

  // Tab 采纳 Copilot 建议
  if (e.key === 'Tab' && copilotVisible.value && copilotSuggestion.value) {
    e.preventDefault()
    acceptWritingSuggestion('all')
    return
  }

  // Esc 拒绝建议
  if (e.key === 'Escape' && (copilotVisible.value || copilotGenerating.value)) {
    e.preventDefault()
    copilotCancel()
    return
  }

  // Keep indentation in the textarea first. onContentChange reads the
  // live editor value, so updating only the Vue ref would be overwritten.
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const selected = value.slice(lineStart, end)
    const lines = selected.split('\n')
    let nextValue
    let nextStart
    let nextEnd

    if (e.shiftKey) {
      const removals = lines.map((line) => line.startsWith('\t') ? 1 : Math.min(line.match(/^ {0,2}/)?.[0].length || 0, 2))
      const adjusted = lines.map((line, index) => line.slice(removals[index])).join('\n')
      nextValue = value.slice(0, lineStart) + adjusted + value.slice(end)
      nextStart = Math.max(lineStart, start - removals[0])
      nextEnd = Math.max(nextStart, end - removals.reduce((sum, count) => sum + count, 0))
    } else {
      const adjusted = lines.map((line) => `\t${line}`).join('\n')
      nextValue = value.slice(0, lineStart) + adjusted + value.slice(end)
      nextStart = start + 1
      nextEnd = end + lines.length
    }

    ta.value = nextValue
    markdownContent.value = nextValue
    editorHistory.push(ta)
    syncMarkdownToEditor()
    onContentChange()
    nextTick(() => {
      ta.setSelectionRange(nextStart, nextEnd)
      syncCopilotCursorFromEditor({ cancelOnMove: true })
    })
  }
}

function showContextMenu(e) {
  if (editorMode.value !== 'wysiwyg') return
  const sel = window.getSelection()
  selectedText.value = sel ? sel.toString() : ''
  const root = notebookEditorActive.value
    ? notebookEditorRef.value?.getRootElement?.()
    : editorRef.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  contextMenu.value = {
    show: true,
    x: Math.min(e.clientX, rect.right - 160),
    y: Math.min(e.clientY, rect.bottom - 10)
  }
}

function ctxAction(action) {
  if (editorMode.value !== 'wysiwyg') return
  if (notebookEditorActive.value && notebookEditorRef.value) {
    switch (action) {
      case 'undo': notebookEditorRef.value.undo(); break
      case 'redo': notebookEditorRef.value.redo(); break
      case 'delete': notebookEditorRef.value.deleteSelection(); onContentChange(); break
      case 'selectAll': notebookEditorRef.value.selectAll(); break
      case 'copy': document.execCommand('copy'); break
      case 'cut': document.execCommand('cut'); onContentChange(); break
      case 'paste': document.execCommand('paste'); break
    }
    contextMenu.value.show = false
    return
  }
  const editor = editorRef.value
  if (!editor) return
  editor.focus()

  switch (action) {
    case 'undo': editorHistory.undo(editorRef.value); break
    case 'redo': editorHistory.redo(editorRef.value); break
    // TODO(undo-redo): cut/copy/paste/delete below use document.execCommand
    // which is deprecated and unreliable on textarea. Replace with
    // native Clipboard API + direct textarea manipulation in a follow-up.
    case 'cut':
      document.execCommand('cut')
      selectedText.value = ''
      break
    case 'copy':
      document.execCommand('copy')
      break
    case 'paste':
      document.execCommand('paste')
      break
    case 'delete':
      document.execCommand('delete')
      onContentChange()
      break
    case 'selectAll':
      document.execCommand('selectAll')
      break
  }
  contextMenu.value.show = false
}

function applyStyleToRange(styleMap) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (range.collapsed) return

  const span = document.createElement('span')
  Object.entries(styleMap).forEach(([k, v]) => {
    span.style[k] = v
  })

  try {
    range.surroundContents(span)
  } catch {
    const fragment = range.extractContents()
    span.appendChild(fragment)
    range.insertNode(span)
  }

  sel.removeAllRanges()
  const newRange = document.createRange()
  newRange.selectNodeContents(span)
  sel.addRange(newRange)
}

function getEditorText() {
  return markdownToPlainText(markdownContent.value || '')
}

function setEditorPlainText(text) {
  markdownContent.value = text
  if (editorRef.value) {
    editorRef.value.value = text
  }
  editorContent.value = markdownToHtml(text)
}

function onNotebookMarkdown(markdown) {
  markdownContent.value = String(markdown || '')
  editorContent.value = markdownToHtml(markdownContent.value)
  onContentChange()
}

function onNotebookDocumentUpdate(document) {
  const previousDocument = writingDocument.value
  writingDocument.value = document
  chapterAnnotations.value = reconcileWritingAnnotations(
    chapterAnnotations.value,
    document,
    selectedChapterId.value,
    previousDocument
  )
  markRewriteCandidatesStale()
}

function onNotebookSelectionChange(selection) {
  notebookSelection.value = selection
  const snapshot = readLiveWritingSelectionSnapshot()
  copilotCursorPos.value = snapshot.end
  selectedText.value = snapshot.text
  hasSelection.value = Boolean(selection?.text)
  if (!inspectorPinned.value && selection?.blockId) {
    activeAnnotationId.value = chapterAnnotations.value.find((annotation) => (
      annotation.blockId === selection.blockId && annotation.status === 'open'
    ))?.id || null
  }
}

function openAnnotationInspector() {
  inspectorOpen.value = true
  inspectorTab.value = 'comments'
  if (!selectedText.value.trim()) {
    quickNoteStatus.value = '先选中需要批注的文字'
    return
  }
  nextTick(() => {
    document.querySelector('.writing-inspector__composer textarea')?.focus()
  })
}

function handleInlineAnnotationClick(annotationId) {
  const annotation = chapterAnnotations.value.find((item) => item.id === annotationId)
  if (annotation) locateAnnotation(annotation)
}

function getWritingNodeText(node) {
  return (node?.content || []).map((item) => item?.text || '').join('')
}

function getCurrentWritingBlockDescriptors() {
  const nodes = Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : []
  const descriptors = []
  let probe = 0
  for (const node of nodes) {
    const blockId = node?.attrs?.blockId
    const text = getWritingNodeText(node)
    let descriptor = null
    if (blockId) {
      for (let position = probe; position <= markdownContent.value.length; position += 1) {
        const candidate = getWritingBlockAtPosition(position, markdownContent.value)
        if (candidate?.blockId === blockId) {
          descriptor = { ...candidate, text }
          break
        }
      }
    }
    descriptor ||= {
      blockId: blockId || null,
      blockRevision: Number(node?.attrs?.revision || 0),
      start: probe,
      end: probe + text.length,
      text
    }
    descriptors.push(descriptor)
    probe = Math.max(probe + 1, descriptor.end + 1)
  }
  return descriptors
}

function buildRewriteSelectionBlocks(startBlockId, endBlockId, selection) {
  const descriptors = getCurrentWritingBlockDescriptors()
  const startIndex = descriptors.findIndex((block) => block.blockId === startBlockId)
  const endIndex = descriptors.findIndex((block) => block.blockId === endBlockId)
  if (startIndex < 0 || endIndex < startIndex) return []

  const notebook = notebookEditorActive.value && notebookSelection.value === selection
  const startEditorBlock = notebookEditorRef.value?.findBlockRange?.(startBlockId)
  const endEditorBlock = notebookEditorRef.value?.findBlockRange?.(endBlockId)
  const first = descriptors[startIndex]
  const last = descriptors[endIndex]
  const startOffset = notebook
    ? Math.max(0, Number(selection.from || startEditorBlock?.from || 0) - Number(startEditorBlock?.from || 0))
    : Math.max(0, Number(selection.start || 0) - first.start)
  const endOffset = notebook
    ? Math.max(0, Number(selection.to || endEditorBlock?.from || 0) - Number(endEditorBlock?.from || 0))
    : Math.max(0, Number(selection.end || 0) - last.start)

  return descriptors.slice(startIndex, endIndex + 1).map((block, index, selectedBlocks) => {
    const isFirst = index === 0
    const isLast = index === selectedBlocks.length - 1
    const localStart = isFirst ? Math.min(startOffset, block.text.length) : 0
    const localEnd = isLast ? Math.min(endOffset, block.text.length) : block.text.length
    const targetRange = {
      start: block.start + localStart,
      end: block.start + Math.max(localStart, localEnd)
    }
    let editorRange = null
    if (notebook) {
      const editorBlock = notebookEditorRef.value?.findBlockRange?.(block.blockId)
      if (editorBlock) {
        editorRange = {
          from: isFirst ? editorBlock.from + localStart : editorBlock.from,
          to: isLast ? editorBlock.from + Math.max(localStart, localEnd) : editorBlock.to
        }
      }
    }
    return {
      blockId: block.blockId,
      blockRevision: Number(block.blockRevision || 0),
      text: block.text.slice(localStart, localEnd),
      baseText: block.text.slice(localStart, localEnd),
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
  if (!block?.blockId) return null

  if (selection.hasSelection && selection.text.trim()) {
    const notebookRange = notebookEditorActive.value ? notebookSelection.value : null
    const startBlockId = notebookRange?.startBlockId || selection.blockId || block.blockId
    const endBlockId = notebookRange?.endBlockId || getWritingBlockAtPosition(Math.max(selection.start, selection.end - 1), markdownContent.value)?.blockId || startBlockId
    if (startBlockId && endBlockId && startBlockId !== endBlockId) {
      const blocks = buildRewriteSelectionBlocks(startBlockId, endBlockId, notebookRange || selection)
      if (blocks.length > 1) {
        return {
          kind: 'multi-selection',
          chapterId: selectedChapterId.value,
          blockId: startBlockId,
          blockIds: blocks.map((item) => item.blockId),
          text: selection.text,
          blocks,
          range: { start: blocks[0].range.start, end: blocks[blocks.length - 1].range.end },
          editorRange: null,
          documentRevision: Number(writingDocument.value?.revision || 0)
        }
      }
    }
    return {
      kind: 'selection',
      chapterId: selectedChapterId.value,
      blockId: selection.blockId || block.blockId,
      blockRevision: Number(selection.blockRevision ?? block.blockRevision ?? 0),
      text: selection.text,
      range: { start: selection.start, end: selection.end },
      editorRange: Number.isFinite(Number(selection.editorFrom)) && Number.isFinite(Number(selection.editorTo))
        ? { from: Number(selection.editorFrom), to: Number(selection.editorTo) }
        : null,
      documentRevision: Number(writingDocument.value?.revision || 0)
    }
  }

  return {
    kind: 'block',
    chapterId: selectedChapterId.value,
    blockId: block.blockId,
    blockRevision: Number(block.blockRevision || 0),
    text: block.text,
    range: { start: block.start, end: block.end },
    editorRange: null,
    documentRevision: Number(writingDocument.value?.revision || 0)
  }
}

function getCurrentRewriteComparison(targetOverride = null) {
  const target = targetOverride || rewriteTarget.value
  if (!target) return null
  if (target.kind === 'multi-selection') {
    const blocks = (target.blocks || []).map((targetBlock) => {
      const node = writingDocument.value?.content?.find((item) => item?.attrs?.blockId === targetBlock.blockId)
      const fullText = getWritingNodeText(node)
      const text = fullText.slice(
        Math.max(0, Number(targetBlock.startOffset || 0)),
        Math.max(Number(targetBlock.startOffset || 0), Number(targetBlock.endOffset ?? fullText.length))
      )
      return {
        blockId: targetBlock.blockId,
        blockRevision: Number(node?.attrs?.revision || 0),
        text
      }
    })
    return {
      chapterId: selectedChapterId.value,
      documentRevision: Number(writingDocument.value?.revision || 0),
      blocks
    }
  }
  const block = writingDocument.value?.content?.find((item) => item?.attrs?.blockId === target.blockId)
  const blockText = getWritingNodeText(block)
  const text = target.kind === 'selection'
    ? markdownContent.value.slice(target.range.start, target.range.end)
    : blockText
  return {
    chapterId: selectedChapterId.value,
    documentRevision: Number(writingDocument.value?.revision || 0),
    blockId: target.blockId,
    blockRevision: Number(block?.attrs?.revision || 0),
    text
  }
}

function markRewriteCandidatesStale() {
  const current = getCurrentRewriteComparison()
  if (!current) return
  rewriteCandidates.value = rewriteCandidates.value.map((candidate) => {
    if (candidate.status === 'applied' || candidate.status === 'dismissed') return candidate
    const reason = getWritingCandidateStaleReason(candidate, current)
    return reason
      ? { ...candidate, status: 'stale', statusDetail: reason }
      : candidate
  })
}

function lockCurrentRewriteSelection() {
  const target = rewriteTarget.value
  const selection = readLiveWritingSelectionSnapshot()
  if (!target || !selection.hasSelection || !selection.text.trim()) return
  if (target.kind === 'multi-selection') {
    rewriteError.value = '跨块改写暂不支持锁定片段，请先改写单个块。'
    return
  }
  if (selection.start < target.range.start || selection.end > target.range.end) {
    rewriteError.value = '锁定片段必须位于当前改写目标内。'
    return
  }
  if (selection.start === target.range.start && selection.end === target.range.end) {
    rewriteError.value = '请在当前改写目标内再选中一小段，不能锁定整个目标。'
    return
  }
  const segment = {
    text: selection.text,
    start: selection.start - target.range.start,
    end: selection.end - target.range.start
  }
  if (!rewriteLockedSegments.value.some((item) => item.text === segment.text && item.start === segment.start)) {
    rewriteLockedSegments.value = [...rewriteLockedSegments.value, segment].slice(0, 8)
    rewriteCandidates.value = rewriteCandidates.value.map((candidate) => ({
      ...candidate,
      lockedSegments: [...(candidate.lockedSegments || []), segment]
    }))
  }
  rewriteError.value = ''
}

function isRewriteTargetStillCurrent(target) {
  if (!target || target.chapterId !== selectedChapterId.value) return false
  if (Number(target.documentRevision) !== Number(writingDocument.value?.revision || 0)) return false
  if (target.kind === 'multi-selection') {
    const current = getCurrentRewriteComparison(target)
    return Boolean(current?.blocks?.length === target.blocks?.length
      && current.blocks.every((block, index) => (
        block.blockId === target.blocks[index]?.blockId
        && block.text === target.blocks[index]?.text
      )))
  }
  const block = writingDocument.value?.content?.find((item) => item?.attrs?.blockId === target.blockId)
  if (!block) return false
  const blockText = (block.content || []).map((item) => item?.text || '').join('')
  const currentText = target.kind === 'selection'
    ? markdownContent.value.slice(target.range.start, target.range.end)
    : blockText
  return currentText === target.text
}

async function generateRewriteCandidates(targetOverride = null) {
  if (targetOverride && !isRewriteTargetStillCurrent(targetOverride)) {
    rewriteError.value = '原改写目标已经变化，请重新选中正文后再生成。'
    return
  }

  const target = targetOverride || getCurrentRewriteTarget()
  if (!target?.text?.trim()) {
    rewriteError.value = '先把光标放入正文块，或选中需要改写的文字。'
    return
  }

  rewriteAbortController?.abort()
  const abortController = new AbortController()
  rewriteAbortController = abortController
  const requestVersion = ++rewriteRequestVersion
  rewriteLoading.value = true
  rewriteError.value = ''
  rewriteTarget.value = target
  rewriteCandidates.value = []
  selectedRewriteCandidateId.value = null

  const scope = target.kind === 'block' ? 'paragraph' : 'selection'
  const taskType = target.kind === 'block' ? 'writing.fix.paragraph' : 'writing.fix.selection'
  const question = rewriteInstruction.value.trim() || (target.kind === 'block'
    ? '请修正当前正文块，处理重复、语病和衔接，但不要无依据扩写。'
    : '请改写当前选区，保持原意、视角和人物语气，减少重复并改善节奏。')
  const request = createWritingCandidateRequest({
    target,
    documentRevision: target.documentRevision,
    chapterId: selectedChapterId.value,
    question
  })

  try {
    const context = buildWritingTaskContext({ scope, question, taskType })
    const taskResult = await requestAdvisorTask({
      context,
      question,
      scope,
      taskType,
      target: request.target,
      options: {
        editorMode: editorMode.value,
        chapterId: selectedChapterId.value,
        candidateCount: 3,
        lockedSegments: rewriteLockedSegments.value,
        multiBlock: target.kind === 'multi-selection',
        targetBlocks: target.blocks || []
      },
      signal: abortController.signal
    })
    if (requestVersion !== rewriteRequestVersion) return

    const targetBlocksById = new Map((target.blocks || []).map((block) => [block.blockId, block]))
    const candidates = normalizeWritingCandidateResponse(taskResult.result, request).map((candidate) => {
      const patches = candidate.patches?.map((patch) => {
        const targetBlock = targetBlocksById.get(patch.blockId)
        return {
          ...patch,
          baseText: targetBlock?.baseText || patch.baseText,
          targetRange: targetBlock?.range || patch.targetRange,
          editorRange: targetBlock?.editorRange || patch.editorRange,
          startOffset: targetBlock?.startOffset,
          endOffset: targetBlock?.endOffset,
          diff: buildWritingCandidateDiff(targetBlock?.baseText || patch.baseText, patch.replacement)
        }
      })
      return {
        ...candidate,
        kind: target.kind,
        chapterId: selectedChapterId.value,
        documentRevision: target.documentRevision,
        blockId: target.blockId,
        blockRevision: target.blockRevision,
        targetRange: target.range,
        lockedSegments: rewriteLockedSegments.value,
        patches,
        status: 'ready',
        diff: target.kind === 'multi-selection'
          ? null
          : buildWritingCandidateDiff(target.text, candidate.text)
      }
    })
    if (!candidates.length) throw new Error('模型未返回可审阅的改写候选')
    rewriteCandidates.value = candidates
    selectedRewriteCandidateId.value = candidates[0].id
  } catch (error) {
    if (requestVersion === rewriteRequestVersion) {
      rewriteError.value = error?.code === 'AGENT_REQUEST_ABORTED'
        ? '本次生成已取消，可重新生成。'
        : error?.message || '改写候选生成失败'
    }
  } finally {
    if (requestVersion === rewriteRequestVersion) {
      rewriteLoading.value = false
      if (rewriteAbortController === abortController) rewriteAbortController = null
    }
  }
}

function cancelRewriteGeneration() {
  rewriteRequestVersion += 1
  rewriteAbortController?.abort()
  rewriteAbortController = null
  rewriteLoading.value = false
  rewriteError.value = '本次生成已取消，可重新生成。'
}

function retryRewriteCandidates() {
  if (rewriteLoading.value || !rewriteTarget.value) return
  generateRewriteCandidates(rewriteTarget.value)
}

function applyRewriteCandidate(candidate) {
  if (!candidate || candidate.status !== 'ready') return
  const current = getCurrentRewriteComparison()
  const staleReason = getWritingCandidateStaleReason(candidate, current)
  if (staleReason) {
    candidate.status = 'stale'
    candidate.statusDetail = staleReason
    rewriteError.value = '正文或目标块已经变化，这条候选已过期，请重新生成。'
    return
  }

  const lockedSegments = candidate.lockedSegments || []
  if (!candidate.patches && lockedSegments.some((segment) => !candidate.text.includes(segment.text))) {
    rewriteError.value = '候选没有保留全部锁定片段，不能采用。'
    return
  }

  createCurrentWritingSnapshot({
    label: `改写前 · 修订 ${writingDocument.value?.revision || 0}`,
    reason: 'before-rewrite',
    quiet: true
  })

  const before = markdownContent.value
  let applied = false
  let fallbackAfter = ''
  if (notebookEditorActive.value && candidate.kind === 'multi-selection') {
    applied = Boolean(notebookEditorRef.value?.replaceBlockRanges?.(candidate.patches))
  } else if (notebookEditorActive.value && candidate.kind === 'selection' && rewriteTarget.value?.editorRange) {
    applied = Boolean(notebookEditorRef.value?.replaceTextRange?.(
      rewriteTarget.value.editorRange.from,
      rewriteTarget.value.editorRange.to,
      candidate.text
    ))
  } else if (notebookEditorActive.value && candidate.kind === 'block') {
    applied = Boolean(notebookEditorRef.value?.replaceBlockText?.(candidate.blockId, candidate.text))
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
      rewriteError.value = '候选缺少可应用的正文范围，请重新生成。'
      return
    }
    const transaction = applyWritingAgentTransaction(before, actions, {
      resultId: candidate.id,
      chapterId: selectedChapterId.value,
      cursorBefore: readCurrentEditorCursor(before)
    })
    if (!transaction.ok) {
      candidate.status = 'stale'
      candidate.statusDetail = transaction.reason
      rewriteError.value = '正文已变化，候选没有应用。'
      return
    }
    fallbackAfter = transaction.content
    markdownContent.value = transaction.content
    syncMarkdownToEditor()
    onContentChange()
    applied = true
  }

  if (!applied) {
    rewriteError.value = '编辑器没有接受这次改写，请重新生成。'
    return
  }

  candidate.status = 'applied'
  rewriteError.value = ''
  rewriteCandidates.value = rewriteCandidates.value.map((item) => item.id === candidate.id ? candidate : item)
  nextTick(() => {
    rewriteUndoReceipt.value = {
      chapterId: selectedChapterId.value,
      before,
      after: fallbackAfter || markdownContent.value,
      editorTransaction: notebookEditorActive.value && !fallbackAfter
    }
    notebookEditorRef.value?.focus?.()
    syncCopilotCursorFromEditor()
  })
}

function dismissRewriteCandidate(candidate) {
  if (!candidate) return
  candidate.status = 'dismissed'
  rewriteCandidates.value = rewriteCandidates.value.map((item) => item.id === candidate.id ? candidate : item)
}

function undoRewriteCandidate() {
  const receipt = rewriteUndoReceipt.value
  if (!receipt || receipt.chapterId !== selectedChapterId.value || markdownContent.value !== receipt.after) {
    rewriteError.value = '正文已经继续变化，不能撤销这次采用。'
    return
  }
  if (receipt.editorTransaction && notebookEditorRef.value?.undo?.()) {
    rewriteUndoReceipt.value = null
    return
  }
  const undone = undoWritingAgentTransaction(markdownContent.value, {
    type: 'writing-agent-transaction',
    chapterId: receipt.chapterId,
    before: receipt.before,
    after: receipt.after,
    cursorBefore: readCurrentEditorCursor(receipt.before)
  }, selectedChapterId.value)
  if (!undone.ok) {
    rewriteError.value = '正文已经继续变化，不能撤销这次采用。'
    return
  }
  markdownContent.value = undone.content
  syncMarkdownToEditor()
  onContentChange()
  rewriteUndoReceipt.value = null
}

function buildAnnotationRangeContext({ startBlock, endBlock, localStart, localEnd, exact }) {
  if (!startBlock?.blockId || !endBlock?.blockId || !exact) return null
  const startExact = startBlock.text.slice(localStart, Math.min(startBlock.text.length, localStart + 48)) || (startBlock.text ? exact.slice(0, 48) : '')
  const endExact = endBlock.text.slice(Math.max(0, localEnd - 48), localEnd) || (endBlock.text ? exact.slice(-48) : '')
  const startSelector = createWritingSelector({
    text: startExact,
    start: localStart,
    end: localStart + startExact.length,
    fullText: startBlock.text
  })
  const endSelector = createWritingSelector({
    text: endExact,
    start: Math.max(0, localEnd - endExact.length),
    end: localEnd,
    fullText: endBlock.text
  })
  const nodes = Array.isArray(writingDocument.value?.content) ? writingDocument.value.content : []
  const startIndex = nodes.findIndex((node) => node?.attrs?.blockId === startBlock.blockId)
  const endIndex = nodes.findIndex((node) => node?.attrs?.blockId === endBlock.blockId)
  const blockIds = startIndex >= 0 && endIndex >= startIndex
    ? nodes.slice(startIndex, endIndex + 1).map((node) => node?.attrs?.blockId).filter(Boolean)
    : [startBlock.blockId, endBlock.blockId]

  return {
    block: startBlock,
    selector: startSelector,
    range: {
      start: {
        blockId: startBlock.blockId,
        blockRevision: startBlock.blockRevision,
        offset: localStart
      },
      end: {
        blockId: endBlock.blockId,
        blockRevision: endBlock.blockRevision,
        offset: localEnd
      },
      blockIds,
      exact,
      ...(startExact ? { startSelector } : {}),
      ...(endExact ? { endSelector } : {})
    }
  }
}

function getAnnotationSelectionContext() {
  if (!selectedChapterId.value) return null

  if (notebookEditorActive.value && notebookSelection.value?.text) {
    const selection = notebookSelection.value
    const startBlockId = selection.startBlockId || selection.blockId
    const endBlockId = selection.endBlockId || startBlockId
    const startNode = writingDocument.value?.content?.find((node) => node?.attrs?.blockId === startBlockId)
    const endNode = writingDocument.value?.content?.find((node) => node?.attrs?.blockId === endBlockId)
    const startRange = notebookEditorRef.value?.findBlockRange?.(startBlockId)
    const endRange = notebookEditorRef.value?.findBlockRange?.(endBlockId)
    if (!startNode || !endNode || !startRange || !endRange) return null
    const startBlock = {
      blockId: startBlockId,
      blockRevision: Number(startNode.attrs?.revision || 0),
      text: (startNode.content || []).map((item) => item?.text || '').join('')
    }
    const endBlock = {
      blockId: endBlockId,
      blockRevision: Number(endNode.attrs?.revision || 0),
      text: (endNode.content || []).map((item) => item?.text || '').join('')
    }
    return buildAnnotationRangeContext({
      startBlock,
      endBlock,
      localStart: Math.max(0, Number(selection.from) - startRange.from),
      localEnd: Math.max(0, Number(selection.to) - endRange.from),
      exact: selection.text
    })
  }

  const snapshot = readLiveWritingSelectionSnapshot()
  if (!snapshot?.hasSelection) return null
  const startBlock = getWritingBlockAtPosition(snapshot.start, markdownContent.value)
  const endBlock = getWritingBlockAtPosition(Math.max(snapshot.start, snapshot.end - 1), markdownContent.value)
  if (!startBlock?.blockId || !endBlock?.blockId) return null
  const localStart = Math.max(0, snapshot.start - startBlock.start)
  const localEnd = Math.max(0, snapshot.end - endBlock.start)
  const exact = snapshot.text || (startBlock.blockId === endBlock.blockId
    ? startBlock.text.slice(localStart, localEnd)
    : [startBlock.text.slice(localStart), endBlock.text.slice(0, localEnd)].join('\n'))
  return buildAnnotationRangeContext({ startBlock, endBlock, localStart, localEnd, exact })
}

function getAnnotationReplyContext(annotation) {
  const node = writingDocument.value?.content?.find((item) => item?.attrs?.blockId === annotation?.blockId)
  if (!node || !annotation?.selector?.exact) return null
  const text = (node.content || []).map((item) => item?.text || '').join('')
  return {
    block: {
      blockId: annotation.blockId,
      blockRevision: Number(node.attrs?.revision || 0),
      text
    },
    selector: { ...annotation.selector }
  }
}

function createAnnotationFromSelection() {
  const body = annotationDraft.value.trim()
  const replyTarget = replyTargetAnnotation.value
  const context = replyTarget
    ? getAnnotationReplyContext(replyTarget)
    : getAnnotationSelectionContext()
  if (!context) {
    quickNoteStatus.value = replyTarget ? '原批注已失去定位，无法回复' : '请先在正文中选中需要批注的片段'
    return
  }
  if (!body) return

  const annotation = createWritingAnnotation({
    chapterId: selectedChapterId.value,
    blockId: context.block.blockId,
    blockRevision: context.block.blockRevision,
    selector: context.selector,
    range: context.range,
    body,
    kind: 'comment',
    parentId: replyTarget?.id || null
  })
  chapterAnnotations.value = [annotation, ...chapterAnnotations.value]
  activeAnnotationId.value = annotation.id
  replyTargetAnnotationId.value = null
  annotationDraft.value = ''
  inspectorOpen.value = true
  inspectorTab.value = 'comments'
  quickNoteStatus.value = '批注已添加'
  onContentChange()
}

function startAnnotationReply(annotation) {
  if (!annotation || annotation.status === 'orphaned') return
  activeAnnotationId.value = annotation.id
  replyTargetAnnotationId.value = annotation.id
  annotationDraft.value = ''
  inspectorOpen.value = true
  inspectorTab.value = 'comments'
  nextTick(() => document.querySelector('.writing-inspector__composer textarea')?.focus())
}

function setAnnotationStatus(annotationId, status) {
  chapterAnnotations.value = updateWritingAnnotationStatus(
    chapterAnnotations.value,
    annotationId,
    status
  )
  if (status === 'open') activeAnnotationId.value = annotationId
  onContentChange()
}

function buildChapterReviewBatches() {
  const blocks = getCurrentWritingBlockDescriptors()
    .filter((block) => block?.blockId && String(block.text || '').trim())
    .map((block) => ({
      blockId: block.blockId,
      blockRevision: Number(block.blockRevision || 0),
      kind: block.kind || 'prose',
      text: String(block.text || '')
    }))
  const batches = []
  for (let index = 0; index < blocks.length; index += 6) {
    batches.push(blocks.slice(index, index + 6))
  }
  return batches
}

function createReviewAnnotation(finding, reviewBlocks, reviewBatchId) {
  const startBlock = reviewBlocks.find((block) => block.blockId === finding.start.blockId)
  const endBlock = reviewBlocks.find((block) => block.blockId === finding.end.blockId)
  if (!startBlock || !endBlock) return null
  const context = buildAnnotationRangeContext({
    startBlock,
    endBlock,
    localStart: finding.start.offset,
    localEnd: finding.end.offset,
    exact: finding.exact
  })
  if (!context) return null
  return createWritingAnnotation({
    chapterId: selectedChapterId.value,
    blockId: context.block.blockId,
    blockRevision: context.block.blockRevision,
    selector: context.selector,
    range: context.range,
    body: finding.body,
    kind: 'review-finding',
    createdBy: 'agent',
    reviewType: finding.kind,
    severity: finding.severity,
    reviewBatchId
  })
}

function reviewAnnotationFingerprint(annotation) {
  return [
    annotation?.kind,
    annotation?.reviewType,
    annotation?.range?.start?.blockId || annotation?.blockId,
    annotation?.range?.start?.offset ?? annotation?.selector?.start,
    annotation?.range?.end?.blockId || annotation?.blockId,
    annotation?.range?.end?.offset ?? annotation?.selector?.end,
    annotation?.body
  ].join('|')
}

async function runChapterReview() {
  if (reviewLoading.value || !selectedChapterId.value) return
  const reviewChapterId = selectedChapterId.value
  const reviewDocumentRevision = Number(writingDocument.value?.revision || 0)
  const batches = buildChapterReviewBatches()
  if (!batches.length) {
    reviewError.value = '当前章节没有可审查的正文块。'
    reviewStatus.value = ''
    return
  }

  reviewAbortController?.abort()
  const controller = new AbortController()
  reviewAbortController = controller
  reviewLoading.value = true
  reviewError.value = ''
  reviewStatus.value = ''
  reviewCompletedBatches.value = 0
  reviewTotalBatches.value = batches.length
  const findings = []
  let failedBatches = 0

  try {
    for (let index = 0; index < batches.length; index += 1) {
      if (controller.signal.aborted) break
      const reviewBlocks = batches[index]
      const question = '审查这批正文，只返回有明确定位的高价值问题；不要改写正文。优先指出重复、衔接断裂、视角/角色连续性、时间或设定冲突。'
      try {
        const taskResult = await requestAdvisorTask({
          context: {
            chapterTitle: currentChapterTitle.value,
            wordCount: wordCount.value,
            chapterOutline: buildChapterOutlineContext(chapterOutlineItems.value),
            reviewBlocks
          },
          question,
          scope: 'chapter',
          taskType: 'writing.chapter.health',
          target: {
            kind: 'chapter-review',
            id: reviewChapterId,
            revision: String(reviewDocumentRevision),
            blockIds: reviewBlocks.map((block) => block.blockId)
          },
          options: {
            chapterId: reviewChapterId,
            chapterReview: true,
            reviewBlocks
          },
          signal: controller.signal
        })
        const batchFindings = normalizeWritingReviewFindings(taskResult.result?.findings, {
          blocks: reviewBlocks,
          maxFindings: 8
        })
        findings.push(...batchFindings.map((finding) => ({ finding, reviewBlocks, batchIndex: index })))
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'AGENT_REQUEST_ABORTED') break
        failedBatches += 1
      } finally {
        reviewCompletedBatches.value = index + 1
      }
    }

    if (selectedChapterId.value !== reviewChapterId
      || Number(writingDocument.value?.revision || 0) !== reviewDocumentRevision) {
      reviewError.value = '章节或正文已变化，本次审查结果已丢弃，请重新审查。'
      return
    }

    const existing = new Set(chapterAnnotations.value.map(reviewAnnotationFingerprint))
    const annotations = findings
      .map(({ finding, reviewBlocks, batchIndex }) => createReviewAnnotation(
        finding,
        reviewBlocks,
        `${reviewChapterId}:review:${reviewDocumentRevision}:${batchIndex}`
      ))
      .filter((annotation) => annotation && !existing.has(reviewAnnotationFingerprint(annotation)))

    if (annotations.length) {
      chapterAnnotations.value = [...annotations, ...chapterAnnotations.value]
      annotationScope.value = 'chapter'
      inspectorOpen.value = true
      inspectorTab.value = 'comments'
      onContentChange()
    }

    if (controller.signal.aborted) {
      reviewError.value = annotations.length ? `已停止，保留 ${annotations.length} 条审查发现。` : '章节审查已停止。'
    } else if (failedBatches && annotations.length) {
      reviewError.value = `已完成 ${batches.length - failedBatches}/${batches.length} 批，保留 ${annotations.length} 条发现；失败批次可重试。`
    } else if (failedBatches) {
      reviewError.value = `${failedBatches} 批审查失败，未写入无定位建议。`
    } else {
      reviewStatus.value = annotations.length
        ? `审查完成，新增 ${annotations.length} 条可定位发现。`
        : '审查完成，当前批次没有发现明确问题。'
    }
  } finally {
    reviewLoading.value = false
    if (reviewAbortController === controller) reviewAbortController = null
  }
}

function cancelChapterReview() {
  reviewAbortController?.abort()
}

function startRewriteFromAnnotation(annotation) {
  if (!annotation || annotation.status === 'orphaned') return
  locateAnnotation(annotation, { tab: 'rewrite' })
}

function locateAnnotation(annotation, { tab = 'comments' } = {}) {
  if (!annotation) return
  activeAnnotationId.value = annotation.id
  inspectorOpen.value = true
  inspectorTab.value = tab
  if (annotation.status === 'orphaned') return

  const exact = annotation.selector?.exact
  const range = annotation.range
  if (!exact && !range?.exact) return
  nextTick(() => {
    let selected = range
      ? notebookEditorRef.value?.selectBlockRange?.(
          range.start.blockId,
          range.start.offset,
          range.end.blockId,
          range.end.offset
        )
      : notebookEditorRef.value?.selectText?.(exact, 0, annotation.blockId)
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
    if (tab === 'rewrite') {
      rewriteTarget.value = getCurrentRewriteTarget()
      rewriteInstruction.value = annotation.body
    }
  })
}

function handleAnnotationKeydown(event, annotation, index) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    locateAnnotation(annotation)
    return
  }

  const annotations = activeBlockAnnotations.value
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

function reanchorAnnotation(annotation) {
  const context = getAnnotationSelectionContext()
  if (!context) {
    quickNoteStatus.value = '先选中新的对应文字，再重新关联批注'
    return
  }

  chapterAnnotations.value = chapterAnnotations.value.map((item) => {
    if (item.id !== annotation?.id) return item
    return {
      ...item,
      blockId: context.block.blockId,
      blockRevision: context.block.blockRevision,
      selector: context.selector,
      ...(context.range ? { range: context.range } : {}),
      status: 'open',
      resolution: 'manually-reanchored',
      updatedAt: new Date().toISOString()
    }
  })
  activeAnnotationId.value = annotation.id
  quickNoteStatus.value = '批注已重新关联'
  onContentChange()
}

function onNotebookInput(payload = {}) {
  syncCopilotCursorFromEditor()
  if (!copilotEnabled.value || payload.composing || payload.inputType !== 'input') return
  writingAgentOnInput({
    content: markdownContent.value,
    cursorPos: copilotCursorPos.value,
    hasSelection: Boolean(selectedText.value),
    inputType: payload.inputType,
    composing: false
  })
}

function switchEditorMode(mode) {
  if (editorMode.value === mode) return
  copilotCancel()
  syncFromCurrentEditor()
  editorMode.value = mode
  if (mode !== 'wysiwyg') {
    hasSelection.value = false
  }
  if (mode === 'wysiwyg') {
    nextTick(() => {
      if (editorRef.value) editorRef.value.value = markdownContent.value
    })
  }
}

function syncMarkdownToEditor() {
  editorContent.value = markdownToHtml(markdownContent.value || '')
  if (notebookEditorActive.value) {
    writingDocument.value = syncFromMarkdown(markdownContent.value || '')
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

function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text)
}

function markdownToPlainText(md) {
  if (!md) return ''
  if (typeof document === 'undefined') return md
  const div = document.createElement('div')
  div.innerHTML = markdownToHtml(md)
  return div.innerText || ''
}

function setSelectionByTextOffsets(start, end) {
  const root = editorRef.value
  if (!root) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  let offset = 0
  let startNode = null
  let endNode = null
  let startOffset = 0
  let endOffset = 0

  while ((node = walker.nextNode())) {
    const len = node.textContent.length
    if (!startNode && offset + len >= start) {
      startNode = node
      startOffset = Math.max(0, start - offset)
    }
    if (offset + len >= end) {
      endNode = node
      endOffset = Math.max(0, end - offset)
      break
    }
    offset += len
  }

  if (!startNode || !endNode) return
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// 点击其他区域关闭右键菜单
function onGlobalClick() {
  contextMenu.value.show = false
  showFontPanel.value = false
  showNameGen.value = false
  showFindReplace.value = false
  hasSelection.value = false
}

function syncSelectionCommandState() {
  try {
    editorBold.value = document.queryCommandState('bold')
    editorItalic.value = document.queryCommandState('italic')
    editorUnderline.value = document.queryCommandState('underline')
  } catch {
    // ignore unsupported environments
  }
}

function startResizeRight(e) {
  if (isRightCollapsed.value) return
  resizing.value = 'right'
  document.addEventListener('mousemove', onResizeRight)
  document.addEventListener('mouseup', stopResizeRight)
  e.preventDefault()
}

function onResizeRight(e) {
  if (resizing.value !== 'right') return
  const newWidth = Math.max(190, Math.min(420, e.clientX))
  rightWidth.value = newWidth
}

function stopResizeRight() {
  resizing.value = null
  document.removeEventListener('mousemove', onResizeRight)
  document.removeEventListener('mouseup', stopResizeRight)
}

</script>

<style scoped src="./Writing.scoped.css"></style>

<style src="./Writing.global.css"></style>
