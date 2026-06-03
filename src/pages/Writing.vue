<template>
  <div class="writing-page" @click="onGlobalClick">
    <!-- 顶部标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">写作</span>
      </div>
      <div class="title-center">
        <select v-model="selectedBookId" class="book-selector">
          <option value="">选择书籍...</option>
          <option v-for="book in books" :key="book.id" :value="book.id">
            {{ book.title }}
          </option>
        </select>
      </div>
      <div class="title-right">
        <div class="status-indicator" :class="saveStatus">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
          <span class="status-divider" v-if="saveStatus !== 'saving'">·</span>
          <span class="status-count" v-if="saveStatus !== 'saving'">{{ wordCount.toLocaleString() }} 字</span>
        </div>
        <div v-if="quickNoteStatus" class="action-status-chip" :title="quickNoteStatus">{{ quickNoteStatus }}</div>
        <button class="toolbar-text-btn" type="button" @click.stop="openAssetInbox" title="打开素材收件箱">
          收件箱
        </button>
        <button class="toolbar-text-btn prominent" type="button" @click.stop="openMaterialsPage" title="打开完整素材库">
          素材库
        </button>
        <button class="toolbar-text-btn" type="button" @click.stop="exportChapterStoryboardDraft" title="导出当前章节分镜草稿" :disabled="!selectedChapterId">
          章节分镜
        </button>
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <span class="theme-icon">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
            </svg>
          </span>
          <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
        </button>
      </div>
    </header>

    <div class="content-area">
      <!-- 左侧边栏：作品导航 -->
      <aside class="sidebar books-sidebar" :style="{ width: rightSidebarWidth + 'px' }">
        <div class="sidebar-header">
          <span class="sidebar-title">作品</span>
          <div class="sidebar-actions">
            <button class="icon-btn side-toggle" @click="toggleRightSidebar" :title="isRightCollapsed ? '展开书籍' : '收起书籍'">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path v-if="isRightCollapsed" d="M8 2L4 6l4 4V2z"/>
                <path v-else d="M4 2l4 4-4 4V2z"/>
              </svg>
            </button>
            <button class="add-btn btn-new" @click="createNewBook" title="新建书籍" :disabled="isRightCollapsed">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 0v14M0 7h14"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="book-list" v-show="!isRightCollapsed">
          <div
            v-for="book in books"
            :key="book.id"
            :class="['book-item', { active: selectedBookId === book.id }]"
            @click="selectBook(book.id)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="book-icon">
              <path d="M2 2h5.5v12H2V2zm6 0h6v12H8V2z"/>
            </svg>
            <div class="book-info">
              <span class="book-title">{{ book.title }}</span>
              <span class="book-meta">{{ book.chapters?.length || 0 }} 章</span>
            </div>
            <button class="delete-btn" @click.stop="deleteBook(book.id)" title="删除书籍">×</button>
          </div>
          <div v-if="books.length === 0" class="empty-hint">
            暂无书籍，点击上方 + 新建
          </div>
        </div>
        <template v-if="selectedBookId">
          <div class="sidebar-header chapter-header">
            <span class="sidebar-title">章节</span>
            <button class="add-btn btn-new" @click="createNewChapter" title="新建章节" :disabled="isRightCollapsed">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 0v14M0 7h14"/>
              </svg>
            </button>
          </div>
          <div class="chapter-list" v-show="!isRightCollapsed">
            <div
              v-for="(chapter, index) in chapters"
              :key="chapter.id"
              :class="['chapter-item', { active: selectedChapterId === chapter.id }]"
              @click="selectChapter(chapter.id)"
            >
              <span class="chapter-num">{{ index + 1 }}</span>
              <span class="chapter-title">{{ chapter.title || '无标题章节' }}</span>
              <span class="chapter-words">{{ chapter.wordCount || 0 }}</span>
              <button class="delete-btn" @click.stop="deleteChapter(chapter.id)" title="删除章节">×</button>
            </div>
            <div v-if="chapters.length === 0" class="empty-hint">
              暂无章节，点击 + 添加
            </div>
          </div>
        </template>
      </aside>

      <!-- 左侧分隔栏 -->
      <div class="resize-handle" v-if="!isRightCollapsed" @mousedown="startResizeRight"></div>

      <!-- 主编辑区 -->
      <main class="editor-main">
        <template v-if="!selectedBookId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M6 6h18v36H6V6zm24 0h12v36H30V6zM12 12h6v4h-6v-4zm0 8h12v4H12v-4zm0 8h10v4H12v-4z"/>
            </svg>
            <p class="empty-title">选择或创建书籍</p>
            <p class="empty-desc">从右侧选择一本书籍开始写作</p>
            <button class="btn-primary" @click="createNewBook">新建书籍</button>
          </div>
        </template>

        <template v-else-if="!selectedChapterId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M8 8h32v32H8V8zm4 4v24h24V12H12zm4 4h16v2H16v-2zm0 6h16v2H16v-2zm0 6h10v2H16v-2z"/>
            </svg>
            <p class="empty-title">选择或创建章节</p>
            <p class="empty-desc">从左侧目录中选择一个章节开始编辑</p>
            <button class="btn-primary" @click="createNewChapter">新建章节</button>
          </div>
        </template>

        <template v-else>
          <!-- Copilot 状态指示器 -->
          <div v-if="copilotGenerating || copilotVisible" class="copilot-indicator" :style="copilotIndicatorStyle">
            <span v-if="copilotGenerating" class="copilot-loading">
              <span class="copilot-spinner"></span>
              AI 续写中...
            </span>
            <span v-else-if="copilotVisible" class="copilot-ready">
              <span class="copilot-ready-label">内联建议</span>
              <span v-if="copilotMatchedEntries.length" class="copilot-meta">命中 {{ copilotMatchedEntries.length }} 条设定</span>
              <kbd>Tab</kbd> 采纳 · <kbd>Esc</kbd> 忽略
            </span>
            <div class="copilot-actions">
              <button
                v-if="copilotVisible"
                type="button"
                class="copilot-action"
                @mousedown.prevent
                @click.stop="acceptCopilotSuggestion"
              >采纳</button>
              <button
                v-if="copilotVisible"
                type="button"
                class="copilot-action"
                @mousedown.prevent
                @click.stop="retryCopilotSuggestion"
              >重试</button>
              <button
                type="button"
                class="copilot-action secondary"
                @mousedown.prevent
                @click.stop="copilotCancel"
              >{{ copilotGenerating ? '停止' : '忽略' }}</button>
            </div>
          </div>

          <div class="editor-header">
            <!-- 编辑工具栏 -->
            <div class="editor-toolbar">
              <div class="toolbar-group">
                <button class="tool-btn" @click="autoFormat" title="一键排版">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M1 2h12v1.5H1V2zm0 4h12v1.5H1V6zm0 4h8v1.5H1v-1.5z"/>
                  </svg>
                  排版
                </button>
                <button class="tool-btn" @click="insertSeparator" title="插入分隔线">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M1 7h12" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="7" cy="7" r="2" fill="currentColor"/>
                  </svg>
                  分隔
                </button>
              </div>

              <div class="toolbar-sep"></div>

              <div class="toolbar-group">
                <button class="tool-btn" :class="{ active: showFontPanel }" @click.stop="showFontPanel = !showFontPanel" title="字体">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M2 2h10v2H2V2zm1 3h8v7H3V5zm0 0l2 6h4l2-6"/>
                  </svg>
                  字体
                </button>

                <!-- 字体面板 -->
                <div class="font-panel" v-if="showFontPanel" @click.stop>
                  <div class="fp-row">
                    <span class="fp-label">字体</span>
                    <select class="fp-select" v-model="editorFont">
                      <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                      <option value="'SimSun', serif">宋体</option>
                      <option value="'KaiTi', serif">楷体</option>
                      <option value="'STHeiti', sans-serif">黑体</option>
                      <option value="'MingLiU', serif">细明体</option>
                      <option value="system-ui, sans-serif">系统默认</option>
                    </select>
                  </div>
                  <div class="fp-row">
                    <span class="fp-label">大小</span>
                    <div class="fp-size-btns">
                      <button class="fp-btn" @click="adjustFontSize(-1)" title="缩小">A-</button>
                      <span class="fp-size-val">{{ editorFontSize }}</span>
                      <button class="fp-btn" @click="adjustFontSize(1)" title="放大">A+</button>
                    </div>
                  </div>
                  <div class="fp-row">
                    <span class="fp-label">样式</span>
                    <div class="fp-btns">
                      <button :class="['fp-btn', { active: editorBold }]" @click="editorBold = !editorBold" title="加粗">
                        <strong>B</strong>
                      </button>
                      <button :class="['fp-btn', { active: editorItalic }]" @click="editorItalic = !editorItalic" title="斜体">
                        <em>I</em>
                      </button>
                      <button :class="['fp-btn', { active: editorUnderline }]" @click="editorUnderline = !editorUnderline" title="下划线">
                        <u>U</u>
                      </button>
                    </div>
                  </div>
                </div>

                <button class="tool-btn" :class="{ active: showNameGen }" @click.stop="showNameGen = !showNameGen" title="随机取名">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M7 1a3 3 0 100 6 3 3 0 000-6zm-5 12l1-4h8l1 4H2z"/>
                  </svg>
                  取名
                </button>

                <!-- 取名面板 -->
                <div class="name-gen-panel" v-if="showNameGen" @click.stop>
                  <div class="ng-row">
                    <span class="ng-label">类型</span>
                    <div class="ng-btns">
                      <button :class="['ng-btn', { active: nameType === 'character' }]" @click="nameType = 'character'">人物</button>
                      <button :class="['ng-btn', { active: nameType === 'place' }]" @click="nameType = 'place'">地点</button>
                    </div>
                  </div>
                  <div class="ng-row">
                    <span class="ng-label">风格</span>
                    <div class="ng-btns">
                      <button :class="['ng-btn', { active: nameStyle === 'western' }]" @click="nameStyle = 'western'">西方</button>
                      <button :class="['ng-btn', { active: nameStyle === 'ancient' }]" @click="nameStyle = 'ancient'">古风</button>
                      <button :class="['ng-btn', { active: nameStyle === 'modern' }]" @click="nameStyle = 'modern'">现代</button>
                    </div>
                  </div>
                  <div class="ng-row" v-if="nameType === 'character'">
                    <span class="ng-label">姓氏</span>
                    <input v-model="fixedSurname" class="ng-input ng-sm" placeholder="可留空" />
                  </div>
                  <div class="ng-row" v-if="nameType === 'character'">
                    <span class="ng-label">名字</span>
                    <input v-model="fixedGivenName" class="ng-input ng-sm" placeholder="可留空" />
                  </div>
                  <button class="tool-btn" style="width:100%;justify-content:center;margin-top:8px" @click="doGenerateName">
                    生成
                  </button>
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
                <button class="tool-btn" :class="{ active: showFindReplace }" @click.stop="showFindReplace = !showFindReplace" title="查找替换">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M5 1a4 4 0 014 4c0 1.5-.8 2.8-2 3.5l3 3-1.5 1.5-3-3A4 4 0 115 1zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
                  </svg>
                  查找
                </button>
              </div>

              <div class="toolbar-sep"></div>

              <div class="toolbar-group">
                <button class="tool-btn ai-btn" :class="{ active: showAiPanel }" @click.stop="toggleAiPanel" title="AI 扩展/改写">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm1.5 10.5l-3-2 .5-.75 2.25 1.5 2.25-3 .75.5-2.75 3.75z"/>
                  </svg>
                  AI
                </button>

                <!-- AI 扩展/改写面板 -->
                <div class="ai-panel" v-if="showAiPanel" @click.stop>
                  <div class="ai-panel-tabs">
                    <button :class="['ai-tab', { active: aiPanelMode === 'expand' }]" @click="aiPanelMode = 'expand'">扩展</button>
                    <button :class="['ai-tab', { active: aiPanelMode === 'rewrite' }]" @click="aiPanelMode = 'rewrite'">改写</button>
                  </div>

                  <div class="ai-panel-body">
                    <!-- 扩展模式 -->
                    <div v-if="aiPanelMode === 'expand'" class="ai-options">
                      <div class="ai-row">
                        <span class="ai-label">扩展模式</span>
                        <select class="ai-select" v-model="expandMode">
                          <option v-for="m in expansionModes" :key="m.value" :value="m.value">{{ m.label }}</option>
                        </select>
                      </div>
                      <div class="ai-row">
                        <span class="ai-label">叙事风格</span>
                        <select class="ai-select" v-model="narrativeStyle">
                          <option value="literary">文学性</option>
                          <option value="webnovel">网文风</option>
                          <option value="concise">简洁白描</option>
                          <option value="dramatic">戏剧性</option>
                        </select>
                      </div>
                      <button class="tool-btn ai-action-btn" @click="doExpand" :disabled="aiProcessing || !selectedText">
                        {{ aiProcessing ? '处理中...' : '扩展选中文字' }}
                      </button>
                    </div>

                    <!-- 改写模式 -->
                    <div v-if="aiPanelMode === 'rewrite'" class="ai-options">
                      <div class="ai-row">
                        <span class="ai-label">改写模式</span>
                        <select class="ai-select" v-model="rewriteMode">
                          <option v-for="m in rewriteModes" :key="m.value" :value="m.value">{{ m.label }}</option>
                        </select>
                      </div>
                      <div class="ai-row" v-if="rewriteMode === 'style'">
                        <span class="ai-label">叙事风格</span>
                        <select class="ai-select" v-model="narrativeStyle">
                          <option value="literary">文学性</option>
                          <option value="webnovel">网文风</option>
                          <option value="concise">简洁白描</option>
                          <option value="dramatic">戏剧性</option>
                        </select>
                      </div>
                      <div class="ai-row" v-if="rewriteMode === 'tone'">
                        <span class="ai-label">语气</span>
                        <select class="ai-select" v-model="rewriteTone">
                          <option v-for="t in tonePresets" :key="t.value" :value="t.value">{{ t.label }}</option>
                        </select>
                      </div>
                      <button class="tool-btn ai-action-btn" @click="doRewrite" :disabled="aiProcessing || !selectedText">
                        {{ aiProcessing ? '处理中...' : '改写选中文字' }}
                      </button>
                    </div>

                    <!-- 结果预览 -->
                    <div v-if="aiResult" class="ai-result">
                      <div class="ai-result-header">
                        <span>结果预览</span>
                        <div class="ai-result-actions">
                          <button class="ai-result-btn" @click="applyAiResult">应用</button>
                          <button class="ai-result-btn secondary" @click="aiResult = ''">取消</button>
                        </div>
                      </div>
                      <div class="ai-result-content">{{ aiResult }}</div>
                    </div>

                    <div v-if="!selectedText" class="ai-hint">
                      请先在编辑器中选择要处理的文字
                    </div>
                  </div>
                </div>
              </div>

              <div class="toolbar-spacer"></div>

              <div class="mode-switch">
                <button class="tool-btn" :class="{ active: editorMode === 'wysiwyg' }" @click="switchEditorMode('wysiwyg')" title="所见即所得">
                  编辑
                </button>
                <button class="tool-btn" :class="{ active: editorMode === 'markdown' }" @click="switchEditorMode('markdown')" title="Markdown源码">
                  Markdown
                </button>
                <button class="tool-btn" :class="{ active: editorMode === 'preview' }" @click="switchEditorMode('preview')" title="预览">
                  预览
                </button>
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

            <!-- 查找替换栏 -->
            <div class="find-replace-bar" v-if="showFindReplace" @click.stop>
              <input
                v-model="findText"
                class="find-input"
                placeholder="查找..."
                @keydown.enter="findNext"
              />
              <button class="tool-btn sm" @click="findPrev">↑</button>
              <button class="tool-btn sm" @click="findNext">↓</button>
              <span class="find-count" v-if="findResults.length > 0">{{ findCurrent + 1 }}/{{ findResults.length }}</span>
              <span class="find-count" v-else-if="findText">无匹配</span>
              <div class="fr-divider"></div>
              <input
                v-model="replaceText"
                class="find-input"
                placeholder="替换为..."
              />
              <button class="tool-btn sm" @click="replaceOne">单处</button>
              <button class="tool-btn sm" @click="replaceAll">全部</button>
              <button class="tool-btn sm close" @click="showFindReplace = false">×</button>
            </div>

            <div class="title-row">
              <input
                v-model="currentChapterTitle"
                type="text"
                class="chapter-title-input"
                placeholder="章节标题"
                @input="onTitleChange"
              />
              <div class="editor-stats">
                <span class="stat">{{ wordCount.toLocaleString() }} 字</span>
                <span class="stat-divider">|</span>
                <span class="stat">{{ charCount.toLocaleString() }} 字符</span>
              </div>
            </div>
          </div>

          <!-- 编辑器容器（含 Ghost Text） -->
          <div class="editor-container" v-if="editorMode === 'wysiwyg'">
            <div
              class="editor-ghost-layer"
              v-if="copilotVisible && copilotSuggestion"
              :style="editorTypographyStyle"
              aria-hidden="true"
            >
              <div class="editor-ghost-scroll" :style="copilotGhostScrollStyle">
                <span>{{ copilotGhostBefore }}</span><span class="ghost-text">{{ copilotSuggestion }}</span><span>{{ copilotGhostAfter }}</span>
              </div>
            </div>
            <textarea
              v-model="markdownContent"
              class="editor-textarea prose-textarea"
              :class="{ 'with-copilot-ghost': copilotVisible && copilotSuggestion }"
              placeholder="开始写作..."
              ref="editorRef"
              :style="editorTypographyStyle"
              @input="onMarkdownInput"
              @keydown="onTextAreaKeydown"
              @keyup="syncCopilotCursorFromEditor({ cancelOnMove: true })"
              @click="syncCopilotCursorFromEditor({ cancelOnMove: true })"
              @scroll="onEditorScroll"
            ></textarea>
          </div>
          <textarea
            v-if="editorMode === 'markdown'"
            v-model="markdownContent"
            class="editor-textarea markdown-textarea"
            placeholder="开始写作（Markdown）..."
            @input="onMarkdownInput"
            @keydown="onTextAreaKeydown"
          ></textarea>
          <div
            v-if="editorMode === 'preview'"
            class="editor-textarea editor-preview"
            v-html="previewHtml"
          ></div>


      <!-- 右键菜单 -->
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
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
      </main>
    </div>

    <ImageGenRail
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
          <section class="asset-inbox-modal">
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
          </section>
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

    <button class="advisor-fab" @click="openAdvisorFromAction" title="打开创作顾问">
      <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="5"></circle>
        <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
      </svg>
    </button>

    <AdvisorPanel
      :isOpen="advisorOpen"
      :messages="advisorMessages"
      :results="advisorResults"
      :loading="advisorLoading"
      :quickQuestions="advisorQuickActions"
      :emptyText="'统一智能顾问可帮助你修正选区、收束段落、体检章节，并给出轻量续写建议。'"
      @close="closeAdvisor"
      @ask="handleAskAdvisor"
      @apply-result="applyAdvisorResult"
      @dismiss-result="dismissAdvisorResult"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../utils/sanitize'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useAdvisor } from '../composables/useAdvisor'
import { extractCopilotWindow, useCopilot } from '../composables/useCopilot'
import { useWorldStore } from '../stores/worldStore'
import { expandText, getExpansionModes } from '../services/textExpander'
import { rewriteText, getRewriteModes, getTonePresets } from '../services/textRewriter'
import ImageGenRail from '../components/ImageGenRail.vue'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import {
  ASSET_KINDS,
  getAssetKindExplanation,
  getAssetKindLabel,
  getAssetSourceDetail,
  listNarrativeAssets,
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
import { applyAdvisorReplacement } from '../services/advisorResultApplier'
import { saveValidatedStoryboardVersion } from '../services/storyboardStore'
import { extractShotsFromChapter, toMarkdown } from '../services/shotExporter'
import { formatWorldbookStatus } from '../services/worldbookFeedback'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const {
  advisorOpen,
  advisorMessages,
  advisorResults,
  advisorLoading,
  askAdvisor,
  openAdvisor: openAdvisorPanel,
  closeAdvisor,
  updateAdvisorResultStatus
} = useAdvisor()
const worldStore = useWorldStore()

// AI Copilot 续写
const {
  isGenerating: copilotGenerating,
  suggestion: copilotSuggestion,
  isVisible: copilotVisible,
  error: copilotError,
  matchedEntries: copilotMatchedEntries,
  triggerGeneration: copilotTrigger,
  manualTrigger: copilotManualTrigger,
  acceptSuggestion: copilotAccept,
  rejectSuggestion: copilotReject,
  cancelSuggestion: copilotCancel
} = useCopilot({ debounceMs: 220, autoTrigger: false, maxSuggestionLength: 160 })

const copilotEnabled = ref(true)
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
const editorMode = ref('wysiwyg')
const markdownContent = ref('')

const editorTypographyStyle = computed(() => ({
  fontFamily: editorFont.value,
  fontSize: editorFontSize.value,
  fontWeight: editorBold.value ? 'bold' : 'normal',
  fontStyle: editorItalic.value ? 'italic' : 'normal',
  textDecoration: editorUnderline.value ? 'underline' : 'none'
}))

const copilotGhostBefore = computed(() => markdownContent.value.slice(0, copilotCursorPos.value))
const copilotGhostAfter = computed(() => markdownContent.value.slice(copilotCursorPos.value))
const copilotGhostScrollStyle = computed(() => ({
  transform: `translate(${-copilotScrollLeft.value}px, ${-copilotScrollTop.value}px)`
}))

const rightWidth = ref(210)
const isRightCollapsed = ref(false)
const resizing = ref(null)
const selectedText = ref('')
const canUndo = ref(false)
const canRedo = ref(false)
const contextMenu = ref({ show: false, x: 0, y: 0 })
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

// AI 扩展/改写状态
const showAiPanel = ref(false)
const aiPanelMode = ref('expand') // 'expand' or 'rewrite'
const aiProcessing = ref(false)
const aiResult = ref('')
const expandMode = ref('balanced')
const rewriteMode = ref('style')
const rewriteTone = ref('neutral')
const narrativeStyle = ref('literary')
const expansionModes = getExpansionModes()
const rewriteModes = getRewriteModes()
const tonePresets = getTonePresets()

const saveStatus = ref('saved')
let saveTimeout = null
let titleTimeout = null

const shouldLockPageScroll = computed(() => {
  return assetInboxOpen.value || showNewBookModal.value || advisorOpen.value
})

useBodyScrollLock(shouldLockPageScroll)

onMounted(() => {
  loadBooks()
  refreshAssetInbox()
})

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

function goBack() {
  saveCurrentChapter()
  router.push('/')
}

function getWritingSelectionSnapshot() {
  const editor = editorRef.value
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
  const contextWindow = extractCopilotWindow(markdownContent.value || '', selection.start, {
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
    editorMode: editorMode.value,
    totalBooks: books.value.length,
    totalChapters: selectedBook?.chapters?.length || 0
  }
}

function buildAdvisorActionContext(action = {}) {
  const selection = getWritingSelectionSnapshot()
  const paragraph = getWritingParagraphSnapshot(selection.start)
  const contextWindow = extractCopilotWindow(markdownContent.value || '', selection.start, {
    upstream: 520,
    downstream: 240
  })

  return {
    ...collectWritingContext(),
    advisorAction: {
      scope: action.scope || 'chapter',
      label: action.label || action.question || '',
      question: action.question || ''
    },
    selection,
    paragraph,
    contextWindow,
    chapterOutline: buildChapterOutlineContext(chapterOutlineItems.value),
    referenceAsset: buildCopilotAssetContext(copilotReferenceAsset.value)
  }
}

const advisorQuickActions = computed(() => {
  const hasSelection = Boolean(String(selectedText.value || '').trim())
  const paragraph = getWritingParagraphSnapshot(copilotCursorPos.value)

  return [
    {
      label: '修正选中内容',
      question: '请修正我选中的内容，尽量保持原意和人物语气，不要扩写太多。',
      scope: 'selection',
      disabled: !hasSelection
    },
    {
      label: '修正当前段落',
      question: '请修正当前段落，重点处理语病、重复、节奏和衔接。',
      scope: 'paragraph',
      disabled: !paragraph.hasParagraph
    },
    {
      label: '自动收线',
      question: '请帮我收束当前线索，给出更自然的收线建议，优先考虑当前段落和上下文。',
      scope: 'thread',
      disabled: false
    },
    {
      label: '章节体检',
      question: '请对当前章节做一次简洁体检，指出节奏、人物和结构的主要问题。',
      scope: 'chapter',
      disabled: false
    },
    {
      label: '轻续一句',
      question: '请给出一句轻量续写建议，保持当前语气，尽量可直接接在光标后。',
      scope: 'continue',
      disabled: false
    }
  ]
})

function normalizeAdvisorAction(input) {
  if (typeof input === 'string') {
    return {
      label: input,
      question: input,
      scope: 'chapter',
      disabled: false
    }
  }

  if (!input || typeof input !== 'object') {
    return {
      label: '',
      question: '',
      scope: 'chapter',
      disabled: false
    }
  }

  const label = String(input.label || input.question || '').trim()
  const question = String(input.question || input.label || '').trim()

  return {
    label,
    question,
    scope: String(input.scope || 'chapter').trim() || 'chapter',
    taskType: String(input.taskType || '').trim(),
    disabled: Boolean(input.disabled)
  }
}

function buildAdvisorActionTarget(action, context) {
  const scope = action.scope || 'chapter'
  if (scope === 'selection') {
    return {
      kind: 'selection',
      range: { start: context.selection.start, end: context.selection.end },
      text: context.selection.text
    }
  }

  if (scope === 'paragraph') {
    return {
      kind: 'paragraph',
      range: { start: context.paragraph.start, end: context.paragraph.end },
      text: context.paragraph.text
    }
  }

  if (scope === 'thread' || scope === 'continue') {
    return {
      kind: scope === 'thread' ? 'thread-window' : 'cursor-window',
      paragraph: context.paragraph.text,
      before: context.contextWindow.before,
      after: context.contextWindow.after
    }
  }

  return {
    kind: 'chapter',
    title: context.chapterTitle,
    wordCount: context.wordCount,
    paragraph: context.paragraph.text,
    selectedText: context.selection.text,
    outline: context.chapterOutline
  }
}

async function handleAskAdvisor(input) {
  const action = normalizeAdvisorAction(input)
  if (!action.question || action.disabled) return

  const context = buildAdvisorActionContext(action)
  await askAdvisor({
    label: action.label,
    question: action.question,
    scope: action.scope,
    taskType: action.taskType,
    target: buildAdvisorActionTarget(action, context),
    options: {
      editorMode: editorMode.value,
      chapterId: selectedChapterId.value
    }
  }, () => context)
}

function applyAdvisorResult(result) {
  const applied = applyAdvisorReplacement(markdownContent.value || '', result)
  if (!applied.ok) {
    updateAdvisorResultStatus(result?.id, 'stale', applied.message)
    return
  }

  markdownContent.value = applied.content
  if (editorRef.value) {
    editorRef.value.value = applied.content
  }
  syncMarkdownToEditor()
  onContentChange()

  selectedText.value = ''
  updateAdvisorResultStatus(result.id, 'applied', '修改已应用到正文。')

  nextTick(() => {
    if (!editorRef.value) return
    editorRef.value.focus()
    editorRef.value.setSelectionRange(applied.cursorPos, applied.cursorPos)
    syncCopilotCursorFromEditor()
  })
}

function dismissAdvisorResult(result) {
  if (!result?.id) return
  updateAdvisorResultStatus(result.id, 'dismissed')
}

function openAdvisorFromAction() {
  assetInboxOpen.value = false
  openAdvisorPanel()
}

function openAssetInbox() {
  closeAdvisor()
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

function getCopilotContext() {
  const outlineContext = buildChapterOutlineContext(chapterOutlineItems.value)
  const assetContext = buildCopilotAssetContext(copilotReferenceAsset.value)

  return {
    chapterTitle: currentChapterTitle.value,
    extraContext: [outlineContext, assetContext].filter(Boolean).join('\n\n')
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
    content
  }
  assetInboxOpen.value = false
  quickNoteStatus.value = `已设为续写参考：${asset.title || '未命名素材'}`

  nextTick(() => {
    editorRef.value?.focus()
    syncCopilotCursorFromEditor()
    if (copilotEnabled.value) {
      copilotManualTrigger(markdownContent.value, copilotCursorPos.value, getCopilotContext())
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
    chapterTitle,
    chapterContent: markdownContent.value,
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
    closeAdvisor()
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

watch(advisorOpen, (open) => {
  if (!open) return
  assetInboxOpen.value = false
  selectedInboxAssetIds.value = []
})

function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
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
  localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify(books.value))
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
      chapterOutlineItems.value = []
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
    chapterOutlineItems.value = []
    clearCopilotReference({ silent: true })
  }
  saveStatus.value = 'saved'
}

function selectBook(bookId) {
  openBook(bookId)
}

function selectChapter(chapterId) {
  if (selectedChapterId.value && selectedChapterId.value !== chapterId) {
    saveCurrentChapter()
  }
  copilotCancel()
  clearCopilotReference({ silent: true })
  selectedChapterId.value = chapterId
  const chapter = chapters.value.find(c => c.id === chapterId)
  if (chapter) {
    currentChapterTitle.value = chapter.title || ''
    const raw = chapter.content || ''
    const format = chapter.contentFormat || (looksLikeHtml(raw) ? 'html' : 'md')
    markdownContent.value = format === 'md' ? raw : htmlToMarkdown(raw)
    editorContent.value = markdownToHtml(markdownContent.value)
    chapterOutlineItems.value = normalizeChapterOutlineItems(chapter.outlineItems || [])
    nextTick(() => {
      if (editorRef.value) editorRef.value.value = markdownContent.value
    })
  } else {
    chapterOutlineItems.value = []
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
    }
  }
  saveChapters()
}

function deleteBook(bookId) {
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
    saveBooks()
  }
}

function saveCurrentChapter() {
  if (!selectedChapterId.value) return

  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (chapter) {
    chapter.title = currentChapterTitle.value
    syncFromCurrentEditor()
    chapter.content = markdownContent.value
    chapter.contentFormat = 'md'
    chapter.outlineItems = normalizeChapterOutlineItems(chapterOutlineItems.value)
    chapter.wordCount = wordCount.value
    chapter.updatedAt = new Date().toISOString()
    saveChapters()
  }
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

  const editor = editorRef.value
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
  if (editorMode.value !== 'wysiwyg') return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  if (style === 'bold') document.execCommand('bold')
  if (style === 'italic') document.execCommand('italic')
  if (style === 'underline') document.execCommand('underline')
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
  if (editorMode.value !== 'wysiwyg') return
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
    const pos = findResults.value[findCurrent.value]
    if (editorMode.value === 'markdown') return
    if (!editorRef.value) return
    setSelectionByTextOffsets(pos, pos + findText.value.length)
    editorRef.value.focus()
  })
}

// 替换一处
function replaceOne() {
  if (!findText.value || findResults.value.length === 0) return
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

// AI 扩展/改写面板
function toggleAiPanel() {
  showAiPanel.value = !showAiPanel.value
  if (showAiPanel.value) {
    // 获取当前选中的文字
    const editor = editorRef.value
    if (editor) {
      const start = editor.selectionStart
      const end = editor.selectionEnd
      if (start !== end) {
        selectedText.value = markdownContent.value.slice(start, end)
      }
    }
  }
}

// 执行扩展
async function doExpand() {
  if (!selectedText.value || aiProcessing.value) return

  aiProcessing.value = true
  aiResult.value = ''

  try {
    const result = await expandText(selectedText.value, {
      mode: expandMode.value,
      style: narrativeStyle.value,
      targetLength: 3
    })

    if (result.success) {
      aiResult.value = result.content
    } else {
      aiResult.value = `扩展失败: ${result.error}`
    }
  } catch (err) {
    aiResult.value = `扩展出错: ${err.message}`
  } finally {
    aiProcessing.value = false
  }
}

// 执行改写
async function doRewrite() {
  if (!selectedText.value || aiProcessing.value) return

  aiProcessing.value = true
  aiResult.value = ''

  try {
    const options = {
      mode: rewriteMode.value,
      style: narrativeStyle.value,
      tone: rewriteTone.value
    }

    const result = await rewriteText(selectedText.value, options)

    if (result.success) {
      aiResult.value = result.content
    } else {
      aiResult.value = `改写失败: ${result.error}`
    }
  } catch (err) {
    aiResult.value = `改写出错: ${err.message}`
  } finally {
    aiProcessing.value = false
  }
}

// 应用 AI 结果
function applyAiResult() {
  if (!aiResult.value) return

  const editor = editorRef.value
  if (!editor) return

  const start = editor.selectionStart
  const end = editor.selectionEnd

  // 替换选中文字为 AI 结果
  markdownContent.value = markdownContent.value.slice(0, start) + aiResult.value + markdownContent.value.slice(end)

  // 更新编辑器
  syncMarkdownToEditor()
  onContentChange()

  // 移动光标到插入文本之后
  nextTick(() => {
    const newPos = start + aiResult.value.length
    editor.setSelectionRange(newPos, newPos)
    editor.focus()
  })

  // 清空结果
  aiResult.value = ''
  showAiPanel.value = false
}

function onContentChange() {
  syncFromCurrentEditor()
  saveStatus.value = 'unsaved'
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
    saveCurrentChapter()
    setTimeout(() => { saveStatus.value = 'saved' }, 300)
  }, 1000)
}

function onEditorInput() {
  onContentChange()
}

function onMarkdownInput() {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    markdownContent.value = editorRef.value.value
  }
  syncCopilotCursorFromEditor()
  syncMarkdownToEditor()
  onContentChange()

  // 维持 Copilot 状态，默认不自动续写
  if (copilotEnabled.value && editorRef.value) {
    copilotTrigger(markdownContent.value, copilotCursorPos.value, getCopilotContext())
  }
}

function syncCopilotCursorFromEditor(options = {}) {
  const { cancelOnMove = false } = options
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

function acceptCopilotSuggestion() {
  const editor = editorRef.value
  if (editor) {
    syncCopilotCursorFromEditor()
  }
  const result = copilotAccept(markdownContent.value, copilotCursorPos.value)
  markdownContent.value = result.content
  syncMarkdownToEditor()
  onContentChange()
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.setSelectionRange(result.newCursorPos, result.newCursorPos)
      editorRef.value.focus()
      syncCopilotCursorFromEditor()
    }
  })
}

function retryCopilotSuggestion() {
  syncCopilotCursorFromEditor()
  copilotManualTrigger(markdownContent.value, copilotCursorPos.value, getCopilotContext())
  nextTick(() => editorRef.value?.focus())
}

function onTextAreaKeydown(e) {
  // Tab 采纳 Copilot 建议
  if (e.key === 'Tab' && copilotVisible.value && copilotSuggestion.value) {
    e.preventDefault()
    acceptCopilotSuggestion()
    return
  }

  // Esc 拒绝建议
  if (e.key === 'Escape' && (copilotVisible.value || copilotGenerating.value)) {
    e.preventDefault()
    copilotReject()
    return
  }

  // 原有 Tab 逻辑
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    markdownContent.value = markdownContent.value.slice(0, start) + '\t' + markdownContent.value.slice(end)
    nextTick(() => {
      ta.setSelectionRange(start + 1, start + 1)
    })
    syncMarkdownToEditor()
    onContentChange()
  }
}

function showContextMenu(e) {
  if (editorMode.value !== 'wysiwyg') return
  const sel = window.getSelection()
  selectedText.value = sel ? sel.toString() : ''
  const rect = editorRef.value.getBoundingClientRect()
  contextMenu.value = {
    show: true,
    x: Math.min(e.clientX, rect.right - 160),
    y: Math.min(e.clientY, rect.bottom - 10)
  }
}

function ctxAction(action) {
  if (editorMode.value !== 'wysiwyg') return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()

  switch (action) {
    case 'undo': document.execCommand('undo'); break
    case 'redo': document.execCommand('redo'); break
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
}

function syncFromCurrentEditor() {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    markdownContent.value = editorRef.value.value
    editorContent.value = markdownToHtml(markdownContent.value)
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
  showAiPanel.value = false
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

<style scoped>
.writing-page {
  height: var(--app-viewport-height, 100vh);
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow: hidden;
}

.quick-note-mini-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
}

.quick-note-mini-btn:hover,
.quick-note-mini-btn.primary {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.asset-inbox-list {
  display: grid;
  gap: 8px;
}

.asset-inbox-filter {
  min-width: 78px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 10px;
  padding: 0 6px;
}

.asset-inbox-item {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
}

.asset-inbox-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.asset-inbox-title {
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.asset-inbox-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.asset-inbox-kind {
  flex: 0 0 auto;
  font-size: 9px;
  color: var(--text-secondary);
}

.asset-inbox-kind-explanation {
  margin-bottom: 4px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.asset-inbox-source {
  margin-bottom: 4px;
  font-size: 9px;
  color: var(--text-muted);
}

.asset-inbox-preview {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-secondary);
  max-height: 64px;
  overflow: auto;
}

.asset-inbox-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.asset-inbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: var(--surface-overlay);
  backdrop-filter: blur(8px);
}

.asset-inbox-modal {
  width: min(1180px, calc(100vw - 36px));
  height: min(82vh, 820px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 12px;
  background: var(--surface-panel);
  box-shadow: var(--shadow-elevated);
  padding: 18px;
}

.asset-inbox-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.asset-inbox-modal-kicker {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0;
}

.asset-inbox-modal-title {
  margin: 4px 0 0;
  font-size: 18px;
  line-height: 1.2;
  color: var(--text-primary);
}

.asset-inbox-close {
  margin-top: 2px;
}

.asset-inbox-modal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 10px;
  background: var(--surface-soft);
}

.asset-inbox-toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.asset-inbox-modal-stat {
  font-size: 11px;
  color: var(--text-secondary);
}

.asset-inbox-status {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.asset-inbox-modal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(280px, 0.82fr);
  gap: 14px;
}

.asset-inbox-list-panel,
.asset-inbox-detail-panel {
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 10px;
  background: var(--surface-soft);
}

.asset-inbox-list-panel {
  overflow: auto;
  padding: 10px;
}

.asset-inbox-row {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 11px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.asset-inbox-row:hover {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.asset-inbox-row.active {
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.asset-inbox-row-copy {
  min-width: 0;
  flex: 1;
}

.asset-inbox-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.asset-inbox-detail-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.asset-inbox-detail-kicker {
  font-size: 11px;
  color: var(--text-muted);
}

.asset-inbox-detail-explanation {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.asset-inbox-detail-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.3;
  color: var(--text-primary);
}

.asset-inbox-detail-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.asset-inbox-detail-content {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--text-primary);
  line-height: 1.65;
  white-space: pre-wrap;
  overflow: auto;
  min-height: 0;
  flex: 1;
}

.asset-inbox-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.asset-action-help-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.asset-action-help-item {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: var(--surface-raised);
}

.asset-action-help-item strong {
  font-size: 11px;
  color: var(--text-primary);
}

.asset-action-help-item span {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.asset-inbox-empty-state {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--surface-soft);
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-left .app-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.title-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-status-chip {
  max-width: 280px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 28px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-text-btn {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-text-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface-raised);
}

.toolbar-text-btn.prominent {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-tertiary));
  color: var(--accent);
  font-weight: 600;
}

.toolbar-text-btn.prominent:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 20%, var(--bg-hover));
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.book-selector {
  height: 32px;
  padding: 0 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  min-width: 160px;
}

.book-selector:focus {
  outline: none;
  border-color: var(--accent);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-tertiary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.status-indicator.saving .status-dot {
  background: var(--warning);
}

.status-indicator.unsaved .status-dot {
  background: var(--danger);
}

.status-text {
  color: var(--text-secondary);
}

.status-divider {
  color: var(--text-muted);
  margin: 0 4px;
}

.status-count {
  color: var(--text-muted);
  font-size: 11px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--surface-raised);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 内容区域 */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-primary) 92%, var(--bg-secondary));
}

/* 侧边栏 */
.sidebar {
  background: var(--surface-panel);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.books-sidebar {
  width: 260px;
  min-width: 190px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--surface-panel);
}

/* 可拉伸分隔栏 */
.resize-handle {
  width: 5px;
  cursor: col-resize;
  background: color-mix(in srgb, var(--border) 45%, transparent);
  transition: background 0.15s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: var(--accent);
}

.sidebar-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface-raised);
}

.chapter-header {
  border-top: 1px solid var(--border);
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.side-toggle {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
}

.side-toggle:hover {
  border-color: var(--accent);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.add-btn.prominent {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-text);
}

.add-btn.prominent:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.add-btn.btn-new {
  width: 28px;
  height: 28px;
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-text);
  border-radius: 6px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-btn.btn-new:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-text);
}

.add-btn.btn-new svg {
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

.book-list,
.chapter-list {
  flex: 0 1 auto;
  overflow-y: auto;
  padding: 8px;
}

.book-list {
  max-height: 34%;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.chapter-list {
  flex: 1;
}

.books-sidebar[style*='44px'] .sidebar-title {
  display: none;
}

.book-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.book-item:hover {
  background: var(--bg-hover);
}

.book-item.active {
  background: var(--accent-light);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
}

.book-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.book-item.active .book-icon {
  color: var(--accent);
}

.book-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.book-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-item.active .book-title {
  color: var(--accent);
}

.book-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.chapter-item:hover {
  background: var(--bg-hover);
}

.chapter-item.active {
  background: var(--accent-light);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}

.chapter-num {
  font-size: 11px;
  color: var(--text-muted);
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}

.chapter-item.active .chapter-num {
  color: var(--accent);
}

.chapter-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item.active .chapter-title {
  color: var(--accent);
}

.chapter-words {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.chapter-item .delete-btn,
.book-item .delete-btn {
  opacity: 0;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  margin-left: auto;
}

.chapter-item:hover .delete-btn,
.book-item:hover .delete-btn {
  opacity: 1;
}

.chapter-item .delete-btn:hover,
.book-item .delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.empty-hint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* 主编辑区 */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  min-width: 0;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.3;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-desc {
  font-size: 13px;
}

.btn-primary {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--accent);
  border: none;
  border-radius: 4px;
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.advisor-fab {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  right: 24px;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 40%, transparent);
  z-index: 245;
  transition: transform 0.2s, box-shadow 0.2s;
}

.advisor-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 50%, transparent);
}

.editor-header {
  padding: 14px 24px 12px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
}

.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  max-width: 940px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}

.chapter-title-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
}

.chapter-title-input::placeholder {
  color: var(--text-muted);
}

.editor-stats {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.stat {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-divider {
  color: var(--border);
}

/* 编辑工具栏 */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--bg-tertiary) 88%, var(--bg-primary));
  border: 1px solid var(--border);
  border-radius: 8px;
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  max-width: 940px;
  margin: 0 auto;
  width: 100%;
}

.copilot-reference-bar {
  max-width: 940px;
  width: 100%;
  margin: 10px auto 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
  color: var(--text-secondary);
}

.copilot-reference-kicker {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
}

.copilot-reference-title {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.copilot-reference-preview {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-muted);
}

.copilot-reference-clear {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 5px;
  padding: 2px 6px;
}

.copilot-reference-clear:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.chapter-outline-bar {
  max-width: 940px;
  width: 100%;
  margin: 10px auto 0;
  display: grid;
  gap: 8px;
}

.chapter-outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-secondary);
}

.chapter-outline-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.chapter-outline-count {
  font-size: 11px;
  color: var(--text-muted);
}

.chapter-outline-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.chapter-outline-card {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-primary));
}

.chapter-outline-card-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.chapter-outline-card-main strong,
.chapter-outline-card-main span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-outline-card-main strong {
  font-size: 12px;
  color: var(--text-primary);
}

.chapter-outline-card-main span {
  font-size: 11px;
  color: var(--text-muted);
}

.chapter-outline-kind {
  color: var(--accent) !important;
  font-size: 10px !important;
}

.chapter-outline-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chapter-outline-actions button {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 5px;
  padding: 2px 5px;
}

.chapter-outline-actions button:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 2px;
}

.toolbar-spacer {
  flex: 1;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  gap: 2px;
}

.mode-switch .tool-btn {
  height: 24px;
  padding: 3px 10px;
  border: 1px solid transparent;
  box-shadow: none;
}

.mode-switch .tool-btn.active {
  border-color: var(--accent);
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  height: 26px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.tool-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-primary);
}

.tool-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.tool-btn.sm {
  padding: 4px 8px;
  height: 24px;
  background: var(--bg-primary);
}

.tool-btn.close {
  color: var(--text-muted);
  background: var(--bg-primary);
}

.tool-btn.close:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--bg-primary);
}

.font-selector {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.font-selector:focus {
  outline: none;
  border-color: var(--accent);
}

/* 字体面板 */
.font-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-width: 180px;
  z-index: 100;
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.fp-row:last-child {
  margin-bottom: 0;
}

.fp-label {
  font-size: 11px;
  color: var(--text-muted);
  width: 24px;
  flex-shrink: 0;
}

.fp-select {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
}

.fp-select:focus {
  outline: none;
  border-color: var(--accent);
}

.fp-btns {
  display: flex;
  gap: 3px;
}

.fp-size-btns {
  display: flex;
  align-items: center;
  gap: 4px;
}

.fp-size-val {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
}

.fp-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.fp-select.sm {
  height: 22px;
  font-size: 11px;
  padding: 0 4px;
  min-width: 70px;
}

.selection-toolbar {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.16);
  z-index: 1200;
}

.fp-btn {
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  padding: 0 6px;
}

.fp-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.fp-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

/* 取名面板 */
.name-gen-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-width: 180px;
  z-index: 100;
}

.ng-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ng-row:last-child {
  margin-bottom: 0;
}

.ng-label {
  font-size: 11px;
  color: var(--text-muted);
  width: 24px;
  flex-shrink: 0;
}

.ng-btns {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.ng-btn {
  padding: 3px 7px;
  font-size: 11px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.ng-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ng-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.ng-input {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
}

.ng-input:focus {
  outline: none;
  border-color: var(--accent);
}

.ng-input.ng-sm {
  width: 80px;
  flex: none;
}

.ng-results {
  margin-top: 8px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.ng-result-item {
  padding: 5px 6px;
  font-size: 12px;
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.ng-result-item:hover {
  background: var(--bg-hover);
}

.ng-result-item:active {
  background: var(--accent-light);
}

.ng-name-pair {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ng-cn {
  font-size: 10px;
  color: var(--text-muted);
}

/* 查找替换栏 */
.find-replace-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.find-input {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  min-width: 120px;
}

.find-input:focus {
  outline: none;
  border-color: var(--accent);
}

.fr-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.find-count {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 50px;
  text-align: center;
}

.editor-textarea {
  flex: 1;
  padding: 24px;
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  resize: none;
  outline: none;
  overflow-y: auto;
  box-shadow: 0 10px 24px color-mix(in srgb, #000 7%, transparent);
}

.prose-textarea {
  line-height: 1.9;
}

.markdown-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  line-height: 1.7;
  white-space: pre-wrap;
  width: min(940px, calc(100% - 48px));
  margin: 20px auto 28px;
}

.editor-preview {
  width: min(940px, calc(100% - 48px));
  margin: 20px auto 28px;
}

.editor-preview :deep(h1),
.editor-preview :deep(h2),
.editor-preview :deep(h3) {
  margin: 0.8em 0 0.4em;
}

.editor-preview :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
}

.editor-textarea::placeholder {
  color: var(--text-muted);
}

.editor-textarea:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
}

/* AI 扩展/改写面板 */
.ai-btn {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 80%, #6366f1));
  border-color: var(--accent);
  color: var(--accent-text);
}

.ai-btn:hover {
  background: linear-gradient(135deg, var(--accent-hover), color-mix(in srgb, var(--accent-hover) 80%, #4f46e5));
  color: var(--accent-text);
}

.ai-btn.active {
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 40%, transparent);
}

.ai-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 260px;
  z-index: 100;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}

.ai-panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.ai-tab {
  flex: 1;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.ai-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ai-tab.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
  margin-bottom: -1px;
}

.ai-panel-body {
  padding: 12px;
}

.ai-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-label {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 56px;
}

.ai-select {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
}

.ai-select:focus {
  outline: none;
  border-color: var(--accent);
}

.ai-action-btn {
  width: 100%;
  justify-content: center;
  margin-top: 4px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.ai-action-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-text);
}

.ai-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-hint {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px 0;
}

.ai-result {
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.ai-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ai-result-actions {
  display: flex;
  gap: 4px;
}

.ai-result-btn {
  padding: 3px 8px;
  font-size: 11px;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--accent-text);
  cursor: pointer;
  transition: all 0.15s;
}

.ai-result-btn:hover {
  background: var(--accent-hover);
}

.ai-result-btn.secondary {
  background: transparent;
  border-color: var(--border);
  color: var(--text-secondary);
}

.ai-result-btn.secondary:hover {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

.ai-result-content {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.6;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  max-height: 150px;
  overflow-y: auto;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 440px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px var(--shadow-md);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
}

.modal-close:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 20px;
}

.input-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.input-label:not(:first-child) {
  margin-top: 16px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: var(--accent);
}

.input.textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn:hover {
  background: var(--bg-hover);
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 150px;
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 1000;
}

.ctx-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.ctx-item:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.ctx-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

/* Copilot 状态指示器 */
.copilot-indicator {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 8px 7px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 10px;
}

.copilot-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
}

.copilot-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.copilot-ready {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.copilot-ready-label {
  color: var(--text-secondary);
  font-weight: 600;
}

.copilot-meta {
  color: var(--text-muted);
  padding-right: 2px;
}

.copilot-ready kbd {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
  font-family: inherit;
  color: var(--text-primary);
}

.copilot-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.copilot-action {
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-secondary));
  color: var(--text-primary);
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 12px;
  cursor: pointer;
}

.copilot-action:hover {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-hover));
}

.copilot-action.secondary {
  border-color: var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* 编辑器容器与 Ghost Text */
.editor-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 20px 24px 28px;
}

.editor-container .editor-textarea {
  flex: 1;
  width: min(940px, 100%);
  margin: 0 auto;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
  box-shadow: 0 10px 24px color-mix(in srgb, #000 7%, transparent);
  position: relative;
  z-index: 2;
}

.editor-container .editor-textarea.with-copilot-ghost {
  color: transparent !important;
  background: transparent !important;
  border-color: transparent;
  box-shadow: none;
  caret-color: var(--text-primary);
}

.editor-container .editor-textarea.with-copilot-ghost::selection {
  background: color-mix(in srgb, var(--accent) 26%, transparent);
  color: transparent;
}

.editor-ghost-layer {
  position: absolute;
  top: 20px;
  left: 24px;
  right: 24px;
  bottom: 28px;
  width: min(940px, calc(100% - 48px));
  margin: 0 auto;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--bg-secondary));
  box-shadow: 0 10px 24px color-mix(in srgb, #000 7%, transparent);
  box-sizing: border-box;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
}

.editor-ghost-scroll {
  min-height: 100%;
  transition: transform 0.02s linear;
}

.ghost-text {
  color: color-mix(in srgb, var(--accent) 72%, var(--text-muted));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-radius: 3px;
  opacity: 0.92;
}

@media (max-width: 980px) {
  .asset-inbox-overlay {
    padding: 10px;
  }

  .asset-inbox-modal {
    width: min(100vw - 20px, 100%);
    height: calc(var(--app-viewport-height, 100vh) - 20px);
    padding: 14px;
  }

  .asset-inbox-modal-body {
    grid-template-columns: 1fr;
  }

  .copilot-reference-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .copilot-reference-preview {
    flex-basis: 100%;
  }

  .chapter-outline-list {
    grid-template-columns: 1fr;
  }

  .chapter-outline-card {
    align-items: stretch;
    flex-direction: column;
  }

  .chapter-outline-actions {
    justify-content: flex-end;
  }

  .asset-action-help-grid {
    grid-template-columns: 1fr;
  }

  .advisor-fab {
    right: 16px;
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    width: 52px;
    height: 52px;
  }
}
</style>
