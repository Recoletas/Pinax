<template>
  <div class="writing-page" @click="onGlobalClick">
    <FolioSurface as="header" variant="chrome" :decorated="false" class="writing-page__hero">
      <div class="manuscript-top material-top">
        <div class="manuscript-top__left">
          <button class="manuscript-top__back" @click="goBack" title="返回" aria-label="返回">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
          <div class="manuscript-top__book">
            <span class="manuscript-top__no">素材</span>
            <span class="material-top__count">{{ chapters.length }} 卷 · {{ groupedChapters.length }} 类</span>
          </div>
          <span v-if="selectedAssetSummary" class="manuscript-top__chapter">
            {{ selectedAssetSummary }}
          </span>
          <span v-else-if="checkedAssetIds.length" class="manuscript-top__chapter">
            已选 {{ checkedAssetIds.length }} 项
          </span>
        </div>

        <div class="manuscript-top__right">
          <span class="manuscript-top__chip">{{ statusText }}<template v-if="saveStatus !== 'saving'"> · {{ wordCount.toLocaleString() }} 字</template></span>
          <button class="manuscript-top__tab" type="button" @click.stop="goToAdventure" title="回到冒险">
            冒险
          </button>
          <button class="manuscript-top__tab" type="button" @click.stop="goToWriting" title="返回写作">
            写作
          </button>
          <button class="manuscript-top__tab" type="button" @click="createNewNote" title="新建素材">
            新素材
          </button>
          <!-- 全局锁定主题2亮色：亮/暗切换隐藏（用户要求） -->
          <button v-if="false" class="manuscript-top__mode" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换亮色' : '切换暗色'">
              <svg v-if="isDark" width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
              </svg>
              <svg v-else width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
              </svg>
          </button>
        </div>
      </div>
    </FolioSurface>

    <WorkspacePaneSwitch
      v-model="mobilePane"
      :items="materialMobilePanes"
      label="素材工作区"
      :breakpoint="1100"
    />

    <div class="content-area notes-content-area" :data-mobile-pane="mobilePane">
      <!-- K3 (2026-06-27): notes-content-area 升为 3 列 grid —
           drawer 260px / reading-deck 1fr / 副阅读台 340px.
           副阅读台承担了原 archive-pin 浮卡的位置 + 角色 (列而非角落小标),
           老的 archive-pin 浮卡被新列吞并 (类名沿用以满足既有 UI-N2 契约). -->
      <!-- 左：档案抽屉 (Archive Drawer) -->
      <aside class="material-drawer">
        <!-- 7 类抽屉盒 -->
        <div class="drawer-units">
          <section v-for="(group, idx) in groupedChapters" :key="group.kind" class="drawer-unit" :class="{ 'is-collapsed': isAssetKindCollapsed(group.kind) }">
            <button class="drawer-handle" type="button" @click="toggleAssetKindGroup(group.kind)" :aria-expanded="!isAssetKindCollapsed(group.kind)">
              <span class="drawer-handle__spine" :style="{ background: group.color }" aria-hidden="true"></span>
              <span class="drawer-handle__roman">{{ groupIndexLabel(idx) }}</span>
              <span class="drawer-handle__title">{{ group.label }}</span>
              <span class="drawer-handle__count">{{ group.items.length }}</span>
              <span class="drawer-handle__chevron" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                  <path v-if="isAssetKindCollapsed(group.kind)" d="M3 1.5L6 4.5L3 7.5"/>
                  <path v-else d="M1.5 3L4.5 6L7.5 3"/>
                </svg>
              </span>
            </button>
            <div v-show="!isAssetKindCollapsed(group.kind)" class="drawer-body">
              <!--
                R2-D.2: replace outer <button class="index-card"> with a div
                to remove the nested-button Vite warning. Inner <input>
                (checkbox) + <button class="index-card__delete"> stay
                independently focusable. The card-level click keeps the
                same selectChapter semantics via @click + keyboard
                handlers (Enter / Space).
              -->
              <div
                v-for="(note, i) in group.items"
                :key="note.id"
                class="index-card"
                :class="{
                  'is-selected': selectedChapterId === note.id,
                  'is-checked': checkedAssetIds.includes(note.id)
                }"
                :style="{
                  '--card-tilt': ((idx + i) % 3 === 0 ? -1.2 : (idx + i) % 3 === 1 ? 0.65 : -0.35) + 'deg',
                  '--card-shift': ((idx + i) % 2 === 0 ? 0 : 2) + 'px'
                }"
                role="button"
                tabindex="0"
                :aria-label="`素材：${note.title || '无标题素材'}（点击选择）`"
                :aria-selected="selectedChapterId === note.id"
                @click="selectChapter(note.id)"
                @keydown.enter.prevent="selectChapter(note.id)"
                @keydown.space.prevent="selectChapter(note.id)"
              >
                <input
                  class="index-card__check"
                  type="checkbox"
                  :checked="checkedAssetIds.includes(note.id)"
                  :aria-label="`选择 ${note.title || '无标题素材'}`"
                  @click.stop
                  @change="toggleCheckedAsset(note.id)"
                />
                <div class="index-card__body">
                  <span class="index-card__title">{{ note.title || '无标题素材' }}</span>
                  <span class="index-card__meta">{{ getAssetStatusLabel(note.status) }}</span>
                </div>
                <span v-if="isAssetOnCanvas(note.id)" class="index-card__canvas-mark" title="已入画布">✓</span>
                <button class="index-card__delete" @click.stop="deleteChapter(note.id)" title="删除素材">×</button>
              </div>
            </div>
          </section>
          <div v-if="groupedChapters.length === 0" class="drawer-empty">
            <span class="drawer-empty__text">抽屉全空 · 等待卷宗</span>
          </div>
        </div>

        <!-- 票根（batch 态） -->
        <Transition name="modal-fade">
          <div v-if="checkedAssetIds.length > 0" class="material-selection-stamp">
            <div class="material-selection-stamp__rail">
              <span class="material-selection-stamp-tick" aria-hidden="true"></span>
              <span class="material-selection-stamp-text">已选 {{ checkedAssetIds.length }} 项 · 批量</span>
              <span class="material-selection-stamp-tick" aria-hidden="true"></span>
            </div>
            <div class="selection-actions" role="group" aria-label="批量处理勾选素材">
              <button class="selection-action-btn material-action-btn primary" type="button" :disabled="checkedAssetIds.length === 0" @click="sendCheckedAssetsToCanvas">送入画布</button>
              <button v-if="checkedAssetIds.length > 1" class="selection-action-btn material-action-btn" type="button" @click="mergeCheckedAssets">合并</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('accepted')">采纳</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('archived')">归档</button>
              <button class="selection-action-btn material-action-btn danger" type="button" @click="deleteCheckedAssets">删除</button>
            </div>
          </div>
        </Transition>
        <p v-if="canvasTransferFeedback" class="canvas-transfer-feedback" role="status" aria-live="polite">
          {{ canvasTransferFeedback }}
        </p>
      </aside>

      <!-- 中：阅读台 (Reading Deck) -->
      <FolioSurface variant="paper" decorated>
        <section class="reading-deck">
          <!-- UI-N4 空档案柜：完整柜面蓝图，7 类 + 5 候补格 + 档案员印章 + 状态 footer -->
          <template v-if="!selectedChapterId">
            <div class="empty-archive">
              <div class="empty-archive__grid" aria-hidden="true">
                <!-- 7 类抽屉格 -->
                <span
                  v-for="(kind, idx) in assetKindOrder"
                  :key="'k-' + kind"
                  class="empty-archive__cell empty-archive__cell--kind"
                  :style="{ '--cell-color': getAssetKindColor(kind) }"
                >
                  <span class="empty-archive__cell-roman">{{ groupIndexLabel(idx) }}</span>
                  <span class="empty-archive__cell-label">{{ getAssetKindLabel(kind) }}</span>
                </span>
                <!-- 5 候补扩展格 -->
                <span
                  v-for="n in 5"
                  :key="'e-' + n"
                  class="empty-archive__cell empty-archive__cell--empty"
                  aria-hidden="true"
                ></span>
              </div>

              <!-- 中央 memo 卡 -->
              <div class="empty-archive__card">
                <span class="empty-archive__tape" aria-hidden="true"></span>
                <p class="empty-archive__title">尚无素材</p>
                <button class="material-action-btn primary empty-archive__cta" @click="createNewNote">新建第一条</button>
              </div>
            </div>
          </template>

          <!-- UI-N10: 多卡画布 (multi-card canvas) — 主卡 + 多张 slip 同屏,
               借鉴 Lusion 项目列表分层舞台/强空间占位思路:
               1) 主卡 active-card 居中大卡 (1fr 60%) — 完整编辑 + toolbar
               2) 右侧 multi-canvas__slips 区 — 2-4 张相关 slip 自由拖拽
               3) 画布结构始终填满 (空状态 7 类占位格 + cross prompt)
               4) 借鉴 Lusion project-item 双行结构 (kind-color header bar + footer 状态)
               5) 借鉴 Lusion cross scroll prompt (画布底部 + 翻页提示)
               保留 N6/N9 拖拽 + z-index + 持久化, 不破坏 useCanvasBoard composable. -->
          <template v-else>
            <div
              class="multi-canvas"
              ref="boardRef"
              @dragover.prevent="onBoardDragOver($event)"
              @drop="onBoardDrop($event)"
              :aria-label="`多卡画布 · 主卡 + ${slipItemsOnCanvas.length} 张相关素材`"
            >
              <header class="multi-canvas__chrome">
                <span class="multi-canvas__chrome-label">素材</span>
                <span class="multi-canvas__chrome-meta">第 {{ currentAssetIndex + 1 }} / {{ chapters.length }} 张 · 副阅读台 {{ sidekickItems.length }} 张</span>
                <span v-if="checkedAssetIds.length > 0" class="multi-canvas__chrome-meta">
                  · 已勾选 {{ checkedAssetIds.length }} 张 ·
                </span>
              </header>

              <!-- K3 (2026-06-27): multi-canvas 简化为 1 列 (just main card).
                   原 N6/N9/N10 multi-canvas__slips 已被副阅读台 (notes-sidekick)
                   吸收 — 用户原话: "可以吸收纸条贴板/画布拖拽的构思".
                   中央主卡保持 1 张 (K0 §6.1 锁), 右侧 2-4 张副阅读台取代
                   原 1fr 拖拽列, 不再有 position:absolute 的 pinned-slip
                   溢出到 副阅读台 列. 拖拽 + 持久化接口 (useCanvasBoard
                   6 handlers + pinnedSlipPositions reactive) 仍保留,
                   但 boardRef 现在绑定 main card 编辑区, 没视觉元素
                   触发拖拽. 副阅读台 是真正的"右列 2-4 张"语义. -->
              <!-- 主卡区 — active-card 居中大卡 (1fr 100%, K3 升为 1 列) -->
              <section class="multi-canvas__main">
                <article class="active-card multi-canvas__main-card">
                  <span class="active-card__tape" aria-hidden="true"></span>
                  <!-- K3c (2026-06-27): 稿纸横线 (ruled lines) 装饰,
                       让 textarea 文字视觉上"写在稿纸上". 跟 ::before
                       红线 + Authoring 稿面 dossier 同源. -->
                  <div class="active-card__ruled-lines" aria-hidden="true"></div>
                  <div class="active-card__header">
                    <input
                      v-model="currentChapterTitle"
                      type="text"
                      class="chapter-title-input"
                      placeholder="素材标题"
                      @input="onTitleChange"
                    />
                    <div class="active-card__stats">
                      <span class="stat">{{ wordCount.toLocaleString() }} 字</span>
                      <span class="stat-divider">|</span>
                      <span class="stat">{{ charCount.toLocaleString() }} 字符</span>
                    </div>
                  </div>
                  <button
                    v-if="hasChapterSource"
                    type="button"
                    class="material-action-btn asset-source-chip"
                    :aria-label="`跳回来源章节 ${selectedAsset.source.chapterId}`"
                    :title="selectedAsset.source.selectorSnippet ? `原文选区：${selectedAsset.source.selectorSnippet}` : `跳回章节 ${selectedAsset.source.chapterId}`"
                    @click="goToAssetSource"
                  >
                    <span class="asset-source-chip__index" aria-hidden="true">◆</span>
                    来源章节 · {{ sourceRangeLabel }}
                  </button>
                  <div class="deck-toolbar" aria-label="素材操作">
                    <label class="asset-control deck-toolbar__kind">
                      <span>素材类型</span>
                      <select :value="selectedAsset?.kind" @change="setSelectedAssetKind($event.target.value)">
                        <option value="inspiration">灵感</option>
                        <option value="draft-prose">正文候选</option>
                        <option value="event">剧情事件</option>
                        <option value="character-fact">人物事实</option>
                        <option value="worldbook-draft">世界书草稿</option>
                        <option value="storyboard-seed">分镜种子</option>
                        <option value="reference-image">参考图</option>
                      </select>
                    </label>
                    <button class="material-action-btn deck-toolbar__btn deck-toolbar__btn--canvas" type="button" @click="importCurrentToCanvas">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="4" y="4" width="6" height="6" stroke="currentColor" stroke-width="1.5"/>
                        <rect x="14" y="14" width="6" height="6" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M10 7h4a3 3 0 013 3v4" stroke="currentColor" stroke-width="1.5"/>
                      </svg>
                      <span>{{ isAssetOnCanvas(selectedAsset?.id) ? '打开画布节点' : '导当前到画布' }}</span>
                    </button>
                    <button
                      v-if="selectedAsset"
                      class="material-action-btn deck-toolbar__btn deck-toolbar__btn--generate"
                      type="button"
                      :disabled="isGeneratingProfessionalInfo"
                      @click="generateAndImportToCanvas"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                        <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" fill="currentColor"/>
                      </svg>
                      <span>{{ isGeneratingProfessionalInfo ? '生成中…' : '生成专业信息' }}</span>
                    </button>
                    <button
                      v-if="hasChapterSource"
                      type="button"
                      class="material-action-btn deck-toolbar__btn"
                      :aria-label="`把素材插回章节 ${selectedAsset.source.chapterId}`"
                      :title="`跳到章节 ${selectedAsset.source.chapterId} 并插入本素材`"
                      @click="insertAssetBackToSource"
                    >
                      插回来源章节
                    </button>
                    <div class="deck-toolbar__spacer"></div>
                    <div class="mode-switch">
                      <button class="tool-btn" :class="{ active: editorMode === 'wysiwyg' }" @click="switchEditorMode('wysiwyg')" title="所见即所得">编辑</button>
                      <button class="tool-btn" :class="{ active: editorMode === 'markdown' }" @click="switchEditorMode('markdown')" title="Markdown源码">Markdown</button>
                      <button class="tool-btn" :class="{ active: editorMode === 'preview' }" @click="switchEditorMode('preview')" title="预览">预览</button>
                    </div>
                  </div>
                  <div
                    v-if="editorMode === 'wysiwyg'"
                    class="editor-textarea prose-rich-editor"
                    ref="editorRef"
                    contenteditable="true"
                    role="textbox"
                    aria-multiline="true"
                    data-placeholder="开始记录..."
                    :style="{
                      fontFamily: editorFont,
                      fontSize: editorFontSize,
                      fontWeight: editorBold ? 'bold' : 'normal',
                      fontStyle: editorItalic ? 'italic' : 'normal',
                      textDecoration: editorUnderline ? 'underline' : 'none'
                    }"
                    @input="onRichEditorInput"
                    @keydown="onRichEditorKeydown"
                    @pointerdown="startIllustrationDrag"
                    @pointermove="moveIllustrationDrag"
                    @pointerup="finishIllustrationDrag"
                    @pointercancel="cancelIllustrationDrag"
                    @click="selectIllustrationFromEvent"
                    @contextmenu="showEditorContextMenu"
                  ></div>
                  <textarea
                    v-if="editorMode === 'markdown'"
                    v-model="markdownContent"
                    class="editor-textarea markdown-textarea"
                    placeholder="开始记录（Markdown）..."
                    @input="onMarkdownInput"
                    @keydown="onTextAreaKeydown"
                  ></textarea>
                  <div
                    v-if="editorMode === 'preview'"
                    ref="previewRef"
                    class="editor-textarea editor-preview"
                  ></div>
                  <div class="page-controls">
                    <button class="page-controls__btn" type="button" :disabled="!canGoPrev" @click="goPrevAsset" title="上一张">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6.5 1.5L3 5l3.5 3.5"/>
                      </svg>
                      上一张
                    </button>
                    <span class="page-controls__count">共 {{ chapters.length }} 卷 · 第 {{ currentAssetIndex + 1 }} 张</span>
                    <button class="page-controls__btn" type="button" :disabled="!canGoNext" @click="goNextAsset" title="下一张">
                      下一张
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3.5 1.5L7 5l-3.5 3.5"/>
                      </svg>
                    </button>
                  </div>
                </article>
              </section>

              <!-- K3 (2026-06-27): multi-canvas__slips aside + bottom-cross 已删.
                   原 N6/N9/N10 拖拽 1fr 列 由 副阅读台 (notes-sidekick)
                   吸收, 见 src/pages/Notes.vue L383+ 副阅读台 aside.
                   主卡 active-card 现在占满 reading-deck 宽度 (1fr),
                   不再有 position:absolute 的 pinned-slip 溢出.
                   useCanvasBoard 6 handlers 仍 wired 在 multi-canvas
                   元素上 (boardRef), 兼容旧持久化 pinnedSlipPositions
                   但没视觉元素触发 (no-op drag). -->
            </div>
          </template>

          <div
            v-if="imageContextMenu.show"
            class="context-menu illustration-context-menu"
            :style="{ top: imageContextMenu.y + 'px', left: imageContextMenu.x + 'px' }"
            role="menu"
            aria-label="图片文字环绕"
            @click.stop
          >
            <span class="illustration-context-menu__title">文字环绕</span>
            <button
              v-for="layout in imageLayoutOptions"
              :key="layout.value"
              class="ctx-item illustration-layout-item"
              :class="{ active: imageLayoutValue === layout.value }"
              type="button"
              role="menuitemradio"
              :aria-checked="imageLayoutValue === layout.value"
              @click="chooseImageLayout(layout.value)"
            >
              <span class="illustration-layout-item__mark" aria-hidden="true">{{ imageLayoutValue === layout.value ? '✓' : '' }}</span>
              <span>{{ layout.label }}</span>
            </button>
          </div>
        </section>
      </FolioSurface>

      <!-- 右：副阅读台 (K3 2026-06-27, 替代原 archive-pin 浮卡).
           archive-pin 类名保留以满足 UI-N2 既有契约; 实际语义升级为
           3rd-column 副阅读台 (notes-sidekick), 展示 2-4 张素材摘要.
           旧"一次只看一个"被吸收: 选中态展示同类相关 (排除 active),
           非选中态展示 4 张近期, 都可点击切换. 不实现真实拖拽 (如
           N6/N9/N10 multi-canvas 那样), 只做视觉/交互骨架 -->
      <aside class="archive-pin notes-sidekick" aria-label="副阅读台">
        <span class="archive-pin__nail" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" fill="currentColor"/>
            <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.4" opacity="0.55"/>
          </svg>
        </span>
        <header class="notes-sidekick__header">
          <span class="notes-sidekick__title">副阅读台</span>
          <span class="notes-sidekick__count">
            {{ sidekickWorkspace === 'illustration'
              ? '插画生成'
              : `${sidekickItems.length} 张 · 可点击` }}
          </span>
        </header>
        <nav class="notes-sidekick__modes" aria-label="副工作台模式">
          <button type="button" :class="{ active: sidekickWorkspace === 'materials' }" @click="setSidekickWorkspace('materials')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M3 2.5h10v4H3zM3 9.5h10v4H3z"/>
            </svg>
            相关素材
          </button>
          <button type="button" :class="{ active: sidekickWorkspace === 'illustration' }" @click="setSidekickWorkspace('illustration')">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1"/>
              <circle cx="6" cy="6" r="1.2"/>
              <path d="M3.5 12l3.2-3 2.1 1.8 1.7-1.6 2 2"/>
            </svg>
            插画生成
          </button>
          <button type="button" @click="goToComics">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
            </svg>
            漫画制作
          </button>
        </nav>
        <template v-if="sidekickWorkspace === 'materials'">
        <div class="notes-sidekick__list" role="list" aria-label="相关素材列表">
          <button
            v-for="asset in sidekickItems"
            :key="asset.id"
            type="button"
            class="sidekick-slip"
            :class="{ 'is-active': selectedChapterId === asset.id }"
            :aria-label="`打开 ${asset.title || '无标题素材'}`"
            :aria-current="selectedChapterId === asset.id ? 'true' : 'false'"
            @click="selectChapter(asset.id)"
            role="listitem"
          >
            <span class="sidekick-slip__tab" :style="{ background: getAssetKindColor(asset.kind) }" aria-hidden="true"></span>
            <div class="sidekick-slip__line-1">
              <span class="sidekick-slip__kind">
                {{ getAssetKindLabel(asset.kind) }}
                <span v-if="asset.sidekickReason === 'same-source'" class="sidekick-slip__reason">同来源</span>
              </span>
              <span class="sidekick-slip__status-dot" :style="{ background: getStatusColor(asset.status) }" aria-hidden="true"></span>
            </div>
            <span class="sidekick-slip__title">{{ asset.title || '无标题素材' }}</span>
            <span class="sidekick-slip__preview">{{ (asset.preview || asset.content || '').slice(0, 96) }}<template v-if="(asset.preview || asset.content || '').length > 96">…</template></span>
            <div class="sidekick-slip__line-2">
              <span class="sidekick-slip__status">{{ getAssetStatusLabel(asset.status) }}</span>
              <span class="sidekick-slip__stat">{{ (asset.content || '').length }} 字</span>
            </div>
          </button>
          <div v-if="sidekickItems.length === 0" class="notes-sidekick__empty" role="status">
            暂无同来源素材
          </div>
        </div>
        </template>
        <ImageGenerationWorkbench
          v-else
          class="notes-sidekick__illustration"
          :showHeader="false"
          :storageKey="STORAGE_KEYS.PROSE_IMAGE_LIBRARY"
          :selectedText="selectedAsset?.content || currentChapterTitle"
          :sourceTitle="selectedAsset?.title || currentChapterTitle"
          :projectId="selectedAsset?.projectId || null"
          :sourceRefs="selectedAsset ? [{ refType: 'narrative-asset', refId: selectedAsset.id, projectId: selectedAsset.projectId ?? null, excerpt: selectedAsset.content }] : []"
          :referenceCandidates="imageReferenceCandidates"
          :modes="['reference', 'illustration']"
          defaultMode="illustration"
          mediaPurpose="storyboard-reference"
          selectedPromptLabel="当前素材"
          :allowInsertImageToEditor="true"
          @image-preview="showMainVisualPreview"
          @insert-image="insertImageMarkdown"
          @save-to-material="saveGeneratedImageAsset"
          @configs-updated="loadSidekickImageModels"
        />
      </aside>
    </div>

    <!-- 新建素材弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showNewNoteModal" class="modal-overlay" @click.self="showNewNoteModal = false">
        <Transition name="modal-scale" appear>
          <FolioSurface variant="paper" decorated as="div">
          <div class="modal">
            <div class="modal-header">
              <h3>新建素材</h3>
              <button class="modal-close" @click="showNewNoteModal = false">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="input-label">素材标题</label>
              <input
                v-model="newNoteTitle"
                type="text"
                class="input"
                placeholder="输入素材标题"
                ref="newNoteInput"
              />
            </div>
            <div class="modal-footer">
              <button class="btn" @click="showNewNoteModal = false">取消</button>
              <button class="btn-primary" @click="confirmCreateNote" :disabled="!newNoteTitle.trim()">创建</button>
            </div>
          </div>
          </FolioSurface>
        </Transition>
      </div>
    </Transition>

    <GmPersonaLauncher
      kicker="素材顾问"
      title="先收一条线索，再决定导向哪里"
      body="我先看当前素材、状态和画布去向，再帮你判断该采纳、导画布还是继续扩。"
      avatarLabel="材"
      caption="素材顾问"
      captionHint="素材入口"
      :pendingCount="pendingReminderVisible ? pendingReviewCount : 0"
      @open="openAdvisor"
    />

    <AdvisorPanel
      :isOpen="advisorOpen"
      :messages="advisorMessages"
      :results="advisorResults"
      :loading="advisorLoading"
      :quickQuestions="materialAdvisorActions"
      :notice="consistencyNotice"
      :emptyText="'创作顾问可帮你梳理灵感、组织素材，发现素材间的关联与创作方向。'"
      @close="closeAdvisor"
      @ask="handleAskAdvisor"
      @apply-result="applyMaterialAdvisorResult"
      @undo-result="undoMaterialAdvisorResult"
      @dismiss-result="dismissResult($event.id)"
    />

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { sanitizeHtml } from '../utils/sanitize'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useAdvisor } from '../composables/useAdvisor'
import { useCanvasBoard } from '../composables/useCanvasBoard'
import { useNotesAssetEditor } from '../composables/useNotesAssetEditor'
import { useNotesAssetCatalog } from '../composables/useNotesAssetCatalog'
import { useNotesMaterialAdvisor } from '../composables/useNotesMaterialAdvisor'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import GmPersonaLauncher from '../components/gm-persona/GmPersonaLauncher.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import ImageGenerationWorkbench from '../components/media/ImageGenerationWorkbench.vue'
import WorkspacePaneSwitch from '../components/workbench/WorkspacePaneSwitch.vue'
import { STORAGE_KEYS, getItem } from '../composables/useStorage'
import { useTipState } from '../composables/useTipState'
import { useGameStore } from '../stores/gameStore'
import { htmlToMarkdown, markdownImageDescriptors, markdownToHtml } from '../services/notes/assetMarkdown'
import {
  computeIllustrationFigureView,
  imageBaseWidth
} from '../services/notes/illustrationPresentation'
import {
  buildNarrativeAssetContentHash,
  DEFAULT_IMAGE_PRESENTATION,
  getAssetKindLabel,
  normalizeImagePresentation,
  updateNarrativeAssetDurable
} from '../services/narrativeAssets'
import { createExplorationDocument } from '../services/writing/authoringDocumentRepository.js'
import { findAssetsByContentRefs } from '../services/narrativeAssetRetrieval'
import {
  addNarrativeImageAsset,
  getMediaImagePresentation,
  migrateNarrativeImageAssets,
  updateMediaImagePresentation,
  updateNarrativeImagePresentation
} from '../services/media/narrativeImageAssetBridge'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'

const router = useRouter()
const tip = useTipState()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const {
  advisorOpen,
  advisorMessages,
  advisorResults,
  advisorLoading,
  pendingReviewCount,
  pendingReminderVisible,
  consistencyNotice,
  askAdvisor,
  dismissResult,
  updateAdvisorResultStatus,
  openAdvisor,
  closeAdvisor
} = useAdvisor()
const gameStore = useGameStore()

const showNewNoteModal = ref(false)
const newNoteTitle = ref('')
const newNoteInput = ref(null)
const editorRef = ref(null)
const previewRef = ref(null)
const sidekickWorkspace = ref('materials')
const mobilePane = ref('content')
const materialMobilePanes = [
  { value: 'index', label: '索引' },
  { value: 'content', label: '内容' },
  { value: 'tools', label: '工具' }
]
const illustrationPreview = ref(null)
const sidekickImageModelConfigs = ref([])
const sidekickImageModelId = ref('')

// UI-N10: Multi-card canvas — 取消 N6 的 MAX_PINNED_SLIPS=3 硬限,
// 改为 Infinity (实际 9999), 默认所有素材 visible on canvas.
// 借鉴 Lusion project-list "分层舞台/强空间占位" 思路:
// 1) 主卡 active-card 居中大卡 (1fr 60%)
// 2) slip 区 2-4 张相关素材围绕
// 3) 画布结构始终填满 (空状态 7 类占位 + cross prompt)
// 4) 不再需要 user 点"钉入"按钮 — 选素材就自动入画布
// 保留 N6/N9 拖拽 + z-index + 持久化 (pinnedSlipPositions / NOTES_PINNED_SLIPS_KEY),
// 不破坏 useCanvasBoard composable 签名.
const MAX_PINNED_SLIPS = 9999 // was 3; N10 removes hard cap
const pinnedSlipIds = ref([])
const explicitPinnedSlipIds = ref([])
const pinnedSlipPositions = reactive({})
const boardRef = ref(null)
const NOTES_PINNED_SLIPS_KEY = 'pinax_notes_pinned_slips_v1'

// 钉住素材的资产 (pinned = 用户主动钉, 跟 selectedChapterId 解耦)
// UI-N10: 默认所有素材 visible on canvas — 当 pinnedSlipIds 为空时
// 把 chapters 全部视为 on-canvas (避免大空白).
const pinnedSlipAssets = computed(() => {
  // 空 pinned 列表 → 用 chapters 全部当作默认 on-canvas
  const sourceIds = pinnedSlipIds.value.length > 0
    ? pinnedSlipIds.value
    : chapters.value.map((a) => a.id)
  return sourceIds
    .map((id) => chapters.value.find((a) => a.id === id))
    .filter(Boolean)
})

// UI-N10: slipItemsOnCanvas = 在画布上 + 不为主卡 (selectedChapterId)
// 用于 slip-stack v-for 和 cross-prompt "还有 N 张" 计数
const slipItemsOnCanvas = computed(() => {
  return pinnedSlipAssets.value.filter((a) => a.id !== selectedChapterId.value)
})

const SIDEKICK_MAX_ITEMS = 4
const exactRelatedAssets = computed(() => {
  const selected = chapters.value.find((asset) => asset.id === selectedChapterId.value)
  if (!selected) return []
  const result = findAssetsByContentRefs(selected.sourceRefs, {
    projectId: selected.projectId,
    assets: chapters.value
  })
  return result.exactMatches
    .map((item) => item.asset)
    .filter((asset) => asset.id !== selected.id)
})
const explicitPinnedSlipAssets = computed(() => explicitPinnedSlipIds.value
  .map((id) => chapters.value.find((asset) => asset.id === id))
  .filter((asset) => asset && asset.id !== selectedChapterId.value))
const sidekickItems = computed(() => {
  const items = []
  const seen = new Set()
  for (const asset of explicitPinnedSlipAssets.value) {
    if (seen.has(asset.id)) continue
    seen.add(asset.id)
    items.push({ ...asset, sidekickReason: 'pinned' })
  }
  for (const asset of exactRelatedAssets.value) {
    if (seen.has(asset.id)) continue
    seen.add(asset.id)
    items.push({ ...asset, sidekickReason: 'same-source' })
  }
  return items.slice(0, SIDEKICK_MAX_ITEMS)
})

// useCanvasBoard 提供 6 个 drag/drop handler + layoutItems + styleFor
// items 走 computed, positions 走 reactive (持久化到 localStorage)
// UI-N9: 新增 bringToFront + focusedZId, 点击/拖拽时把 slip 浮到最上层
const {
  onBoardDragOver,
  onBoardDrop
} = useCanvasBoard({
  boardRef,
  items: pinnedSlipAssets,
  positions: pinnedSlipPositions
})

const imageContextMenu = ref({ show: false, x: 0, y: 0 })
const illustrationSelected = ref(false)
const selectedIllustrationTarget = ref(null)
const imageLayoutOptions = [
  { value: 'inline-center', label: '嵌入文字' },
  { value: 'square-left', label: '四周型 · 左侧' },
  { value: 'square-right', label: '四周型 · 右侧' },
  { value: 'tight-left', label: '紧密型 · 左侧' },
  { value: 'tight-right', label: '紧密型 · 右侧' },
  { value: 'top-bottom-center', label: '上下型' },
  { value: 'behind-center', label: '衬于文字下方' },
  { value: 'front-center', label: '浮于文字上方' }
]
const editorFont = ref("'Microsoft YaHei', sans-serif")
const editorFontSize = ref('16px')
const editorBold = ref(false)
const editorItalic = ref(false)
const editorUnderline = ref(false)
const isGeneratingProfessionalInfo = ref(false)

// ---- C1/C2/C3 owner 接线：目录与批量（catalog）、编辑与保存（editor） ----
// editor 只通过窄接口依赖 catalog 的选中态；extractEditorMarkdown/flushVisualPresentation
// 是页面插画域的两个接缝（C7 将随图片呈现一并归位）。
const editorApi = useNotesAssetEditor({
  getSelectedAsset: () => catalogApi.selectedAsset.value,
  getSelectedChapterId: () => catalogApi.selectedChapterId.value,
  extractEditorMarkdown,
  flushVisualPresentation,
  editorRef,
  renderWysiwyg: renderCurrentEditor,
  renderPreview: renderPreviewSurface
})
const catalogApi = useNotesAssetCatalog({
  editor: editorApi,
  onAssetDeselected: resetIllustrationSelection,
  onSelectionChanged: () => { mobilePane.value = 'content' },
  navigate: (location) => router.push(location),
  colorForKind: getAssetKindColor
})
const {
  assetKindOrder,
  chapters,
  selectedChapterId,
  selectedAsset,
  checkedAssetIds,
  collapsedAssetKinds,
  groupedChapters,
  currentAssetIndex,
  canGoPrev,
  canGoNext,
  canvasTransferFeedback,
  mediaGenerationProjectId,
  mediaGenerationSourceRefs,
  refreshCatalog,
  replaceEditorFromPersisted,
  selectChapter,
  goPrevAsset,
  goNextAsset,
  toggleCheckedAsset,
  createAsset,
  setSelectedAssetKind,
  setCheckedAssetsState,
  mergeCheckedAssets,
  deleteChapter,
  deleteCheckedAssets,
  isAssetOnCanvas,
  openSelectedAssetInCanvas,
  sendCheckedAssetsToCanvas,
  generateAndImportToCanvas
} = catalogApi
const {
  currentChapterTitle,
  editorMode,
  markdownContent,
  renderedMarkdownSource,
  renderedMarkdownContent,
  saveStatus,
  statusText,
  previewHtml,
  saveCurrentChapter,
  onContentChange,
  onTitleChange,
  switchEditorMode: switchEditorModeInternal,
  syncMarkdownToEditor,
  getEditorPlainText: getEditorText,
  createMarkdownMediaReference
} = editorApi

// C6：素材顾问结果采用/撤销 owner（第二条异步来源身份链）
const {
  materialAdvisorActions,
  handleAskAdvisor,
  applyMaterialAdvisorResult,
  undoMaterialAdvisorResult
} = useNotesMaterialAdvisor({
  catalog: catalogApi,
  editor: editorApi,
  advisor: { updateAdvisorResultStatus, askAdvisor }
})

onMounted(() => {
  const initialWorkspace = String(route.query.workspace || 'materials')
  setSidekickWorkspace(initialWorkspace)
  mobilePane.value = initialWorkspace === 'illustration' ? 'tools' : 'content'
  loadSidekickImageModels()
  loadNotesPinnedSlipsPref()
  // C-R2：首次初始化允许显式重装编辑器；迁移晚到只刷新目录/图片投影，不再重装
  refreshCatalog()
  {
    const preferredAssetId = String(route.query.assetId || '')
    const initialAssetId = preferredAssetId && chapters.value.some((asset) => asset.id === preferredAssetId)
      ? preferredAssetId
      : chapters.value[0]?.id || null
    replaceEditorFromPersisted(initialAssetId)
  }
  void migrateNarrativeImageAssets().then(() => {
    refreshCatalog()
  })
  // K3c (2026-06-27): 初始 auto-grow (replaceEditorFromPersisted 触发 selectChapter 同路径,
  // 这里是 belt-and-suspenders)
  nextTick(() => autoResizeTextarea())

  // Phase C6: 首次进入素材库, 若画布空, 弹 "素材入画布" tip
  try {
    const cards = getItem(STORAGE_KEYS.PROSE_CARDS_V1)
    const hasCanvas = Array.isArray(cards) && cards.length > 0
    if (!hasCanvas && !tip.isSeen('materials-to-canvas')) {
      setTimeout(() => {
        tip.showTip({
          id: 'materials-to-canvas',
          title: '素材入画布',
          body: '右上角 "导当前到画布" 可导入选中素材; 勾选多项后用 "送入画布" 批量入画布。',
          cta: {
            label: '去看画布',
            action: () => router.push('/prose-essay')
          },
          variant: 'info',
          autoHide: false,
          category: 'nav'
        })
      }, 800)
    }
  } catch (e) {
    console.warn('[Notes] C6 tip check failed:', e)
  }
})

function loadSidekickImageModels(configs = null) {
  const next = Array.isArray(configs) ? configs : listImageProviderConfigs()
  sidekickImageModelConfigs.value = next
  if (!next.some((config) => config.id === sidekickImageModelId.value)) {
    sidekickImageModelId.value = next[0]?.id || ''
  }
}

function setSidekickWorkspace(workspace) {
  const allowedWorkspaces = ['materials', 'illustration']
  sidekickWorkspace.value = allowedWorkspaces.includes(workspace) ? workspace : 'materials'
  if (sidekickWorkspace.value !== 'materials') loadSidekickImageModels()
  mobilePane.value = 'tools'
}

function goToComics() {
  router.push({
    name: 'comics',
    query: selectedChapterId.value ? { assetId: selectedChapterId.value } : {}
  })
}

const mainVisualPreview = computed(() => {
  const generated = illustrationPreview.value
  if (generated?.sourceAssetId === selectedChapterId.value && generated.entry?.data) {
    const entry = generated.entry
    return {
      data: entry.data,
      alt: entry.prompt || selectedAsset.value?.title || '插画',
      label: entry.mediaPurpose === 'storyboard-reference' ? '参考图草稿' : '插画草稿',
      size: entry.width && entry.height ? `${entry.width}×${entry.height}` : '生成图片',
      presentation: normalizeImagePresentation(entry.presentation)
    }
  }

  const image = selectedAsset.value?.image
  if (!image?.data) return null
  return {
    data: image.data,
    alt: selectedAsset.value?.title || '素材图片',
    label: image.purpose === 'comic-panel'
      ? '漫画格'
      : image.purpose === 'illustration'
        ? '插画'
        : '参考图',
    size: image.width && image.height ? `${image.width}×${image.height}` : '素材图片',
    presentation: normalizeImagePresentation(image.presentation)
  }
})
const activeIllustrationPresentation = computed(() => {
  const target = selectedIllustrationTarget.value
  if (target?.source === 'embedded' && target.key) {
    return normalizeImagePresentation(selectedAsset.value?.embeddedImagePresentations?.[target.key])
  }
  return mainVisualPreview.value?.presentation || DEFAULT_IMAGE_PRESENTATION
})
const imageLayoutValue = computed(() => {
  const presentation = activeIllustrationPresentation.value
  return `${presentation.wrap}-${presentation.align}`
})
watch([
  () => selectedChapterId.value,
  () => mainVisualPreview.value?.data || '',
  () => sidekickWorkspace.value
], () => {
  nextTick(() => {
    if (editorMode.value === 'wysiwyg') renderCurrentEditor()
    if (editorMode.value === 'preview') renderPreviewSurface()
  })
})
// C11 + UI-N10：目录变化后先恢复“默认全部上画布”（仅 prefs 为空时），再裁剪已消失 id
watch(chapters, () => {
  if (pinnedSlipIds.value.length === 0 && chapters.value.length > 0) {
    pinnedSlipIds.value = chapters.value.map((asset) => asset.id)
  }
  nextTick(prunePinnedSlipReferences)
})

const imageReferenceCandidates = computed(() => chapters.value
  .filter((asset) => asset.image?.data)
  .map((asset) => ({
    id: `asset_${asset.id}`,
    mediaAssetId: asset.image.mediaAssetId || '',
    title: asset.title || '素材参考图',
    data: asset.image.data,
    mediaPurpose: asset.image.purpose || 'storyboard-reference'
  })))

function showMainVisualPreview(entry) {
  if (!entry?.data || !selectedChapterId.value) return
  const storedPresentation = getMediaImagePresentation(entry.mediaAssetId)
  illustrationPreview.value = {
    sourceAssetId: selectedChapterId.value,
    entry: {
      ...entry,
      presentation: storedPresentation || normalizeImagePresentation(entry.presentation)
    }
  }
  nextTick(refreshIllustrationSurfaces)
}

let illustrationDrag = null

function illustrationTargetFromFigure(figure) {
  if (!figure) return null
  return {
    source: figure.dataset.imageSource === 'embedded' ? 'embedded' : 'primary',
    key: figure.dataset.imageKey || ''
  }
}

function activateIllustrationFigure(figure, root = editorRef.value) {
  const target = illustrationTargetFromFigure(figure)
  if (target?.source !== 'embedded' || !target.key || !selectedAsset.value) return target
  const stored = selectedAsset.value.embeddedImagePresentations?.[target.key]
  if (!stored) {
    setCurrentImagePresentation(normalizeImagePresentation({
      ...DEFAULT_IMAGE_PRESENTATION,
      anchorOffset: getFigureTextOffset(root, figure)
    }), target)
  }
  return target
}

function presentationForTarget(target = selectedIllustrationTarget.value) {
  if (target?.source === 'embedded' && target.key) {
    return normalizeImagePresentation(selectedAsset.value?.embeddedImagePresentations?.[target.key])
  }
  return mainVisualPreview.value?.presentation || null
}

function setCurrentImagePresentation(presentation, illustrationTarget) {
  if (illustrationTarget?.source === 'embedded' && illustrationTarget.key) {
    const asset = selectedAsset.value
    if (!asset) return null
    asset.embeddedImagePresentations = {
      ...(asset.embeddedImagePresentations || {}),
      [illustrationTarget.key]: presentation
    }
    return { type: 'embedded', id: asset.id, key: illustrationTarget.key }
  }
  const generated = illustrationPreview.value
  if (generated?.sourceAssetId === selectedChapterId.value && generated.entry?.data) {
    illustrationPreview.value = {
      ...generated,
      entry: { ...generated.entry, presentation }
    }
    return { type: 'media', id: generated.entry.mediaAssetId || '' }
  }
  const asset = selectedAsset.value
  if (!asset?.image) return null
  asset.image = { ...asset.image, presentation }
  return { type: 'narrative', id: asset.id }
}

function persistCurrentImagePresentation(target, presentation) {
  if (!target?.id) return
  if (target.type === 'media') updateMediaImagePresentation(target.id, presentation)
  if (target.type === 'narrative') updateNarrativeImagePresentation(target.id, presentation)
  if (target.type === 'embedded') {
    updateNarrativeAssetDurable(target.id, {
      embeddedImagePresentations: selectedAsset.value?.embeddedImagePresentations || {}
    })
  }
}

function applyImagePresentation(patch = {}, persist = true, refresh = true, illustrationTarget = selectedIllustrationTarget.value) {
  const currentPresentation = presentationForTarget(illustrationTarget)
  if (!currentPresentation) return
  const presentation = normalizeImagePresentation({
    ...currentPresentation,
    ...patch
  })
  const target = setCurrentImagePresentation(presentation, illustrationTarget)
  if (persist) persistCurrentImagePresentation(target, presentation)
  if (refresh) nextTick(refreshIllustrationSurfaces)
}

function startIllustrationDrag(event) {
  if (event.button !== 0) return
  const figure = event.target.closest?.('[data-narrative-illustration]')
  if (!figure) return
  const target = activateIllustrationFigure(figure, event.currentTarget)
  const presentation = presentationForTarget(target)
  if (!presentation) return
  event.preventDefault()
  event.stopPropagation()
  const root = event.currentTarget
  const mode = event.target.closest?.('[data-illustration-resize]') ? 'resize' : 'move'
  illustrationDrag = {
    pointerId: event.pointerId,
    root,
    figure,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startWidth: figure.getBoundingClientRect().width,
    mode,
    target,
    presentation,
    moved: false
  }
  selectedIllustrationTarget.value = target
  illustrationSelected.value = true
  figure.classList.add('is-selected')
  figure.classList.add(mode === 'resize' ? 'is-resizing' : 'is-dragging')
  figure.setPointerCapture?.(event.pointerId)
}

function moveIllustrationDrag(event) {
  if (!illustrationDrag || illustrationDrag.pointerId !== event.pointerId) return
  const dx = event.clientX - illustrationDrag.startClientX
  const dy = event.clientY - illustrationDrag.startClientY
  illustrationDrag.moved ||= Math.hypot(dx, dy) > 3
  if (illustrationDrag.mode === 'resize') {
    const rootWidth = illustrationDrag.root.getBoundingClientRect().width || 1
    const basePercent = imageBaseWidth(illustrationDrag.presentation.wrap)
    const minWidth = rootWidth * basePercent * 0.5 / 100
    const maxWidth = rootWidth * Math.min(100, basePercent * 2) / 100
    const width = Math.min(maxWidth, Math.max(minWidth, illustrationDrag.startWidth + dx))
    illustrationDrag.figure.style.width = `${width}px`
    return
  }
  const base = ['behind', 'front'].includes(illustrationDrag.presentation.wrap)
    ? 'translate(-50%, -50%) '
    : ''
  illustrationDrag.figure.style.transform = `${base}translate(${dx}px, ${dy}px)`
}

function finishIllustrationDrag(event) {
  if (!illustrationDrag || illustrationDrag.pointerId !== event.pointerId) return
  const drag = illustrationDrag
  drag.figure.releasePointerCapture?.(event.pointerId)
  illustrationDrag = null
  if (!drag.moved) {
    drag.figure.classList.remove('is-dragging')
    drag.figure.classList.remove('is-resizing')
    drag.figure.style.transform = ''
    return
  }

  const presentation = drag.presentation
  const rect = drag.root.getBoundingClientRect()
  if (drag.mode === 'resize') {
    const widthPercent = (drag.figure.getBoundingClientRect().width / Math.max(1, rect.width)) * 100
    applyImagePresentation({
      scale: widthPercent / imageBaseWidth(presentation.wrap)
    }, true, true, drag.target)
    return
  }
  if (['behind', 'front'].includes(presentation.wrap)) {
    applyImagePresentation({
      positionX: ((event.clientX - rect.left) / rect.width) * 100,
      positionY: ((event.clientY - rect.top) / rect.height) * 100
    }, true, true, drag.target)
    return
  }

  const previousPointerEvents = drag.figure.style.pointerEvents
  drag.figure.style.pointerEvents = 'none'
  const anchorOffset = getTextOffsetFromPoint(
    drag.root,
    event.clientX,
    event.clientY,
    presentation.anchorOffset
  )
  drag.figure.style.pointerEvents = previousPointerEvents
  const align = ['square', 'tight'].includes(presentation.wrap)
    ? (event.clientX < rect.left + rect.width / 2 ? 'left' : 'right')
    : presentation.align
  applyImagePresentation({ anchorOffset, align }, true, true, drag.target)
}

function cancelIllustrationDrag(event) {
  if (!illustrationDrag || illustrationDrag.pointerId !== event.pointerId) return
  illustrationDrag.figure.classList.remove('is-dragging')
  illustrationDrag.figure.classList.remove('is-resizing')
  illustrationDrag.figure.style.transform = ''
  illustrationDrag = null
}

function selectIllustrationFromEvent(event) {
  const figure = event.target.closest?.('[data-narrative-illustration]')
  if (!figure) {
    selectedIllustrationTarget.value = null
    illustrationSelected.value = false
    editorRef.value?.querySelectorAll('[data-narrative-illustration]').forEach((item) => item.classList.remove('is-selected'))
    return
  }
  event.stopPropagation()
  selectedIllustrationTarget.value = activateIllustrationFigure(figure)
  illustrationSelected.value = true
  figure.classList.add('is-selected')
}

function showEditorContextMenu(event) {
  const figure = event.target.closest?.('[data-narrative-illustration]')
  if (!figure) {
    imageContextMenu.value.show = false
    return
  }
  event.preventDefault()
  event.stopPropagation()
  selectedIllustrationTarget.value = activateIllustrationFigure(figure)
  illustrationSelected.value = true
  figure.classList.add('is-selected')
  imageContextMenu.value = {
    show: true,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330))
  }
}

function setImageLayout(value) {
  const separator = value.lastIndexOf('-')
  const wrap = value.slice(0, separator)
  const align = value.slice(separator + 1)
  const target = selectedIllustrationTarget.value
  const current = presentationForTarget(target)
  if (!current) return
  const patch = { wrap, align }
  if (target?.source !== 'embedded') {
    patch.anchorOffset = getCurrentEditorCaretOffset() ?? current.anchorOffset
  }
  applyImagePresentation(patch, true, true, target)
}

function chooseImageLayout(value) {
  setImageLayout(value)
  imageContextMenu.value.show = false
}

const charCount = computed(() => getEditorText().length)

const wordCount = computed(() => {
  const text = getEditorText().trim()
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
})

const selectedAssetSummary = computed(() => {
  if (!selectedAsset.value) return ''
  const title = String(selectedAsset.value.title || '无标题素材').trim()
  return `${getAssetKindLabel(selectedAsset.value.kind)} · ${title}`
})

const hasChapterSource = computed(() => {
  const src = selectedAsset.value?.source
  return Boolean(src && src.type === 'chapter' && src.chapterId)
})

const sourceRangeLabel = computed(() => {
  const src = selectedAsset.value?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return ''
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && Number.isFinite(length) && length > 0) {
    return `${offset}-${offset + length}`
  }
  if (Number.isFinite(offset) && offset >= 0) {
    return `${offset}+`
  }
  return String(src.chapterId)
})

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
  if (!catalogApi.saveOrBlock('返回首页')) return
  router.push('/')
}

function goToWriting() {
  if (!catalogApi.saveOrBlock('返回写作')) return
  router.push({ name: 'writing' })
}

function goToAssetSource() {
  const asset = selectedAsset.value
  const src = asset?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return
  if (!catalogApi.saveOrBlock('前往正文来源')) return
  const query = {
    chapterId: src.chapterId,
    sourceAssetId: asset.id
  }
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && offset >= 0) query.selectorOffset = offset
  if (Number.isFinite(length) && length > 0) query.selectorLength = length
  router.push({ name: 'writing', query })
}

function insertAssetBackToSource() {
  const asset = selectedAsset.value
  const src = asset?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return
  if (!catalogApi.saveOrBlock('回填正文来源')) return
  const query = {
    chapterId: src.chapterId,
    insertAssetId: asset.id
  }
  const offset = Number(src.selectorOffset)
  const length = Number(src.selectorLength)
  if (Number.isFinite(offset) && offset >= 0) query.selectorOffset = offset
  if (Number.isFinite(length) && length > 0) query.selectorLength = length
  router.push({
    name: 'writing',
    query
  })
}

function createNewNote() {
  showNewNoteModal.value = true
  newNoteTitle.value = ''
  nextTick(() => newNoteInput.value?.focus())
}

function confirmCreateNote() {
  if (!newNoteTitle.value.trim()) return

  // Phase 11：有明确项目上下文的纯文字试写归 Authoring exploration 所有；
  // 素材页继续保留图片、音频、文件及已有 narrative asset 的整理能力。
  const bookId = String(route.query.bookId || '').trim()
  if (bookId) {
    const created = createExplorationDocument(bookId, {
      title: newNoteTitle.value.trim(),
      content: newNoteTitle.value.trim(),
      sourceRefs: ['materials:text-capture']
    })
    if (created.ok) {
      showNewNoteModal.value = false
      router.push({ name: 'authoring', query: { bookId, explorationId: created.document.id, wt3: '1' } })
      return
    }
  }

  const created = createAsset({
    title: newNoteTitle.value.trim(),
    content: newNoteTitle.value.trim(),
    kind: 'inspiration',
    status: 'inbox',
    source: {
      type: 'manual'
    }
  })
  if (!created.ok) {
    canvasTransferFeedback.value = '新建素材未保存（存储写入失败）'
    showNewNoteModal.value = false
    return
  }

  refreshCatalog()
  selectChapter(created.asset.id)
  showNewNoteModal.value = false
}

function getAssetStatusLabel(status) {
  switch (status) {
    case 'accepted':
      return '已采纳'
    case 'archived':
      return '归档'
    case 'rejected':
      return '拒绝'
    default:
      return '待处理'
  }
}

function isAssetKindCollapsed(kind) {
  return Boolean(collapsedAssetKinds.value[kind])
}

function toggleAssetKindGroup(kind) {
  collapsedAssetKinds.value = {
    ...collapsedAssetKinds.value,
    [kind]: !collapsedAssetKinds.value[kind]
  }
}

const GROUP_INDEX_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function groupIndexLabel(idx) {
  return GROUP_INDEX_ROMAN[idx] || String(idx + 1).padStart(2, '0')
}

// UI-N6: Pinned slip methods
// UI-N10: 状态色 (Lusion data-color-bg 三件套的简化版 — 用 archive token)
function getStatusColor(status) {
  switch (status) {
    case 'accepted':
      return 'var(--archive-olive)'
    case 'archived':
      return 'var(--archive-ink-soft)'
    case 'rejected':
      return 'var(--archive-rose)'
    case 'inbox':
    default:
      return 'var(--archive-gold)'
  }
}


// C11：素材目录变化后裁剪钉住引用——已删除/已归档的 id 不再长期留在 localStorage 偏好里
function prunePinnedSlipReferences() {
  const valid = new Set(chapters.value.map((asset) => asset.id))
  const nextIds = pinnedSlipIds.value.filter((id) => valid.has(id))
  const nextExplicit = explicitPinnedSlipIds.value.filter((id) => valid.has(id))
  const stalePositionIds = Object.keys(pinnedSlipPositions).filter((id) => !valid.has(id))
  for (const id of stalePositionIds) delete pinnedSlipPositions[id]
  if (nextIds.length === pinnedSlipIds.value.length
    && nextExplicit.length === explicitPinnedSlipIds.value.length
    && stalePositionIds.length === 0) return
  pinnedSlipIds.value = nextIds
  explicitPinnedSlipIds.value = nextExplicit
  saveNotesPinnedSlipsPref()
}

function loadNotesPinnedSlipsPref() {
  try {
    const raw = localStorage.getItem(NOTES_PINNED_SLIPS_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data?.ids)) {
      pinnedSlipIds.value = data.ids
        .filter((id) => typeof id === 'string')
        .slice(0, MAX_PINNED_SLIPS)
      explicitPinnedSlipIds.value = [...pinnedSlipIds.value]
    }
    if (data?.positions && typeof data.positions === 'object') {
      for (const [id, pos] of Object.entries(data.positions)) {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          pinnedSlipPositions[id] = { x: pos.x, y: pos.y }
        }
      }
    }
  } catch (err) {
    console.warn('[Notes] pinned slips prefs load failed:', err)
  }
}

function saveNotesPinnedSlipsPref() {
  try {
    explicitPinnedSlipIds.value = [...pinnedSlipIds.value]
    localStorage.setItem(
      NOTES_PINNED_SLIPS_KEY,
      JSON.stringify({
        ids: pinnedSlipIds.value,
        positions: { ...pinnedSlipPositions }
      })
    )
  } catch (err) {
    console.warn('[Notes] pinned slips prefs save failed:', err)
  }
}

function importCurrentToCanvas() {
  openSelectedAssetInCanvas()
}

function getAssetKindColor(kind) {
  switch (kind) {
    case 'draft-prose':
      return '#5b8def'
    case 'event':
      return '#ef5350'
    case 'character-fact':
      return '#f59e0b'
    case 'worldbook-draft':
      return '#66bb6a'
    case 'inspiration':
      return '#ab47bc'
    case 'storyboard-seed':
      return '#26c6da'
    case 'reference-image':
      return '#ff7043'
    default:
      return '#7c92ff'
  }
}

async function saveGeneratedImageAsset(imgEntry) {
  if (!imgEntry?.data) return
  const previewEntry = illustrationPreview.value?.entry
  const presentation = previewEntry && (
    previewEntry.mediaAssetId === imgEntry.mediaAssetId || previewEntry.id === imgEntry.id
  )
    ? previewEntry.presentation
    : imgEntry.presentation
  const currentAssetId = selectedChapterId.value
  const asset = await addNarrativeImageAsset({
    title: (imgEntry.prompt || '素材参考图').slice(0, 24),
    content: imgEntry.prompt || '素材参考图',
    kind: 'reference-image',
    status: 'accepted',
    projectId: mediaGenerationProjectId.value,
    sourceRefs: [...mediaGenerationSourceRefs.value, ...(imgEntry.sourceRefs || [])],
    source: {
      type: 'note-image',
      id: imgEntry.id
    },
    image: {
      id: imgEntry.id,
      mediaAssetId: imgEntry.mediaAssetId,
      storageRef: imgEntry.storageRef,
      purpose: imgEntry.mediaPurpose || 'illustration',
      prompt: imgEntry.prompt,
      data: imgEntry.data,
      negativePrompt: imgEntry.negativePrompt,
      modelName: imgEntry.modelName,
      modelId: imgEntry.modelId,
      modelType: imgEntry.modelType,
      width: imgEntry.width,
      height: imgEntry.height,
      presentation: normalizeImagePresentation(presentation)
    }
  })
  refreshCatalog()
  if (imgEntry.mode === 'comic' && currentAssetId) {
    // 保留当前编辑对象，只刷新目录
  } else {
    selectChapter(asset.id)
  }
}

function insertImageMarkdown(imgEntry) {
  if (!imgEntry?.data && !imgEntry?.mediaAssetId) return
  const alt = String(imgEntry.prompt || selectedAsset.value?.title || '图片').trim() || '图片'
  const reference = imgEntry.mediaAssetId
    ? createMarkdownMediaReference(alt, imgEntry.mediaAssetId)
    : `![${alt}](${imgEntry.data})`
  const imageMarkdown = `\n\n${reference}\n`
  const editor = editorRef.value
  if (editor && typeof editor.selectionStart === 'number' && typeof editor.selectionEnd === 'number') {
    const start = editor.selectionStart
    const end = editor.selectionEnd
    markdownContent.value = `${markdownContent.value.slice(0, start)}${imageMarkdown}${markdownContent.value.slice(end)}`
    nextTick(() => {
      const pos = start + imageMarkdown.length
      editor.focus()
      editor.setSelectionRange(pos, pos)
    })
  } else {
    markdownContent.value = `${markdownContent.value}${imageMarkdown}`
  }
  syncMarkdownToEditor()
  onContentChange()
}

function onRichEditorInput() {
  onContentChange()
  if (mainVisualPreview.value && !editorRef.value?.querySelector('[data-narrative-illustration]')) {
    nextTick(refreshIllustrationSurfaces)
  }
}

function onMarkdownInput() {
  syncMarkdownToEditor()
  onContentChange()
}

function autoResizeTextarea() {
  const ta = editorRef.value
  if (!ta || ta.tagName !== 'TEXTAREA') return
  // 跳过 native field-sizing: content 支持的浏览器 (CSS 已接管)
  const cs = window.getComputedStyle(ta)
  if (cs.fieldSizing === 'content') return
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
}

function onRichEditorKeydown(event) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  document.execCommand('insertText', false, '\t')
}

function onTextAreaKeydown(e) {
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

function switchEditorMode(mode) {
  switchEditorModeInternal(mode)
}

// ---- 页面插画域接缝（editor/catalog 通过窄接口回调到这里） ----

// WYSIWYG DOM → 净 markdown（剥离主图/还原内嵌图，保持插画锚点同步）
function extractEditorMarkdown() {
  const anchorOffset = getIllustrationAnchorOffset(editorRef.value)
  if (anchorOffset !== null && mainVisualPreview.value) {
    applyImagePresentation({ anchorOffset }, false, false, { source: 'primary', key: '' })
  }
  const cleanHtml = getEditorHtmlWithoutIllustration(editorRef.value)
  return htmlToMarkdown(cleanHtml)
}

// 保存时把当前插画版式落盘（生成图→媒体仓储；素材图→叙事图片；投影同步）
function flushVisualPresentation(chapter) {
  const presentation = mainVisualPreview.value?.presentation
  const generated = illustrationPreview.value
  if (presentation && generated?.sourceAssetId === chapter.id && generated.entry?.mediaAssetId) {
    updateMediaImagePresentation(generated.entry.mediaAssetId, presentation)
  } else if (presentation && chapter.image) {
    chapter.image = { ...chapter.image, presentation }
    updateNarrativeImagePresentation(chapter.id, presentation)
  }
}

// 切换/清空选择时清理插画选择态（catalog 的 onAssetDeselected 接缝）
function resetIllustrationSelection() {
  selectedIllustrationTarget.value = null
  illustrationSelected.value = false
  imageContextMenu.value.show = false
  editorRef.value?.querySelectorAll('[data-narrative-illustration]').forEach((item) => item.classList.remove('is-selected'))
}

function renderCurrentEditor() {
  if (editorMode.value !== 'wysiwyg' || !editorRef.value) return
  const renderSource = renderedMarkdownSource.value === markdownContent.value
    ? renderedMarkdownContent.value
    : markdownContent.value
  editorRef.value.innerHTML = markdownToHtml(renderSource)
  injectIllustrationIntoSurface(editorRef.value, true)
}

function renderPreviewSurface() {
  if (!previewRef.value) return
  previewRef.value.innerHTML = previewHtml.value || ''
  injectIllustrationIntoSurface(previewRef.value, false)
}

function getEditorHtmlWithoutIllustration(root) {
  const clone = root.cloneNode(true)
  clone.querySelectorAll('[data-narrative-illustration]').forEach((element) => {
    if (element.dataset.imageSource !== 'embedded') {
      element.remove()
      return
    }
    const image = element.querySelector('img')
    if (!image) {
      element.remove()
      return
    }
    const markdownSrc = image.dataset.markdownSrc
    if (markdownSrc) image.setAttribute('src', markdownSrc)
    image.removeAttribute('data-markdown-src')
    element.replaceWith(image)
  })
  return sanitizeHtml(clone.innerHTML)
}

function refreshIllustrationSurfaces() {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    injectIllustrationIntoSurface(editorRef.value, true)
  }
  if (editorMode.value === 'preview' && previewRef.value) {
    injectIllustrationIntoSurface(previewRef.value, false)
  }
}

function injectIllustrationIntoSurface(root, interactive) {
  root.querySelectorAll('[data-image-source="primary"]').forEach((element) => element.remove())
  restoreEmbeddedIllustrations(root)
  enhanceEmbeddedIllustrations(root, interactive)

  const visual = mainVisualPreview.value
  if (!visual?.data) return

  const presentation = visual.presentation
  const image = document.createElement('img')
  image.src = visual.data
  image.alt = visual.alt
  const figure = createIllustrationFigure({
    image,
    presentation,
    interactive,
    source: 'primary',
    label: visual.label
  })
  insertIllustrationAtTextOffset(root, figure, presentation.anchorOffset, presentation.wrap)
}

function restoreEmbeddedIllustrations(root) {
  root.querySelectorAll('[data-image-source="embedded"]').forEach((figure) => {
    const image = figure.querySelector('img')
    if (!image) {
      figure.remove()
      return
    }
    figure.replaceWith(image)
  })
}

function enhanceEmbeddedIllustrations(root, interactive) {
  const descriptors = markdownImageDescriptors(markdownContent.value)
  const images = [...root.querySelectorAll('img')]
    .filter((image) => !image.closest('[data-narrative-illustration]'))
  images.forEach((image, index) => {
    const existingKey = image.dataset.imageKey || ''
    const descriptor = descriptors.find((item) => item.key === existingKey)
      || descriptors[index]
      || fallbackImageDescriptor(image, index)
    const storedPresentation = selectedAsset.value?.embeddedImagePresentations?.[descriptor.key]
    const presentation = normalizeImagePresentation(storedPresentation)
    image.dataset.markdownSrc = descriptor.href
    image.dataset.imageKey = descriptor.key
    image.draggable = false
    const figure = createIllustrationFigure({
      image,
      presentation,
      interactive,
      source: 'embedded',
      key: descriptor.key,
      label: descriptor.alt || image.alt || '正文图片'
    })
    image.replaceWith(figure)
    figure.insertBefore(image, figure.firstChild)
    if (storedPresentation) {
      insertIllustrationAtTextOffset(root, figure, presentation.anchorOffset, presentation.wrap)
    }
  })
}

function createIllustrationFigure({ image, presentation, interactive, source, key = '', label }) {
  const selectedTarget = selectedIllustrationTarget.value
  const isSelected = illustrationSelected.value
    && selectedTarget?.source === source
    && (source !== 'embedded' || selectedTarget.key === key)
  // C7：类名/aria/样式为纯视图模型（services/notes/illustrationPresentation），页面只做 DOM 构建
  const view = computeIllustrationFigureView({ presentation, interactive, selected: isSelected, label, src: image.src })

  const figure = document.createElement(view.tagName)
  figure.dataset.narrativeIllustration = 'true'
  figure.dataset.imageSource = source
  if (key) figure.dataset.imageKey = key
  figure.contentEditable = 'false'
  figure.className = view.className
  figure.setAttribute('aria-label', view.ariaLabel)
  if (interactive) figure.title = '拖动图片移动，拖动右下角缩放，右键设置文字环绕'
  for (const [prop, value] of Object.entries(view.style)) {
    if (prop === 'width' || prop === 'left' || prop === 'top') figure.style[prop] = value
    else figure.style.setProperty(prop, value)
  }

  image.draggable = false
  if (source === 'primary') figure.appendChild(image)
  if (interactive) {
    const resizeHandle = document.createElement('span')
    resizeHandle.dataset.illustrationResize = 'true'
    resizeHandle.className = 'illustration-resize-handle'
    resizeHandle.setAttribute('aria-hidden', 'true')
    figure.appendChild(resizeHandle)
  }
  return figure
}

function fallbackImageDescriptor(image, index) {
  const href = image.getAttribute('src') || ''
  return {
    key: `src:${buildNarrativeAssetContentHash(href)}:${index}`,
    href,
    alt: image.alt || ''
  }
}

function insertIllustrationAtTextOffset(root, figure, requestedOffset, wrap) {
  if (['behind', 'front'].includes(wrap)) {
    root.prepend(figure)
    return
  }

  const anchor = findTextAnchor(root, requestedOffset)
  if (!anchor?.node) {
    root.appendChild(figure)
    return
  }
  if (wrap === 'inline') {
    const tail = anchor.node.splitText(anchor.offset)
    tail.parentNode.insertBefore(figure, tail)
    return
  }

  let block = anchor.node.parentNode
  while (block.parentNode && block.parentNode !== root) block = block.parentNode
  root.insertBefore(figure, block)
}

function findTextAnchor(root, requestedOffset) {
  const targetOffset = Math.max(0, Number(requestedOffset) || 0)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  let consumed = 0
  let lastNode = null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('[data-narrative-illustration]')) continue
    lastNode = node
    const length = node.textContent.length
    if (consumed + length >= targetOffset) {
      return { node, offset: Math.max(0, targetOffset - consumed) }
    }
    consumed += length
  }
  return lastNode ? { node: lastNode, offset: lastNode.textContent.length } : null
}

function getIllustrationAnchorOffset(root) {
  const figure = root.querySelector('[data-image-source="primary"]')
  if (!figure || ['behind', 'front'].includes(mainVisualPreview.value?.presentation.wrap)) return null
  return getFigureTextOffset(root, figure)
}

function getFigureTextOffset(root, figure) {
  if (!root || !figure) return 0
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEndBefore(figure)
    return range.toString().length
  } catch {
    return 0
  }
}

function getCurrentEditorCaretOffset() {
  const root = editorRef.value
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  if (!root || !selection?.rangeCount) return null
  const activeRange = selection.getRangeAt(0)
  if (!root.contains(activeRange.startContainer)) return null
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(activeRange.startContainer, activeRange.startOffset)
    return range.toString().length
  } catch {
    return null
  }
}

function getTextOffsetFromPoint(root, clientX, clientY, fallbackOffset = 0) {
  let node = null
  let offset = 0
  const caretPosition = document.caretPositionFromPoint?.(clientX, clientY)
  if (caretPosition) {
    node = caretPosition.offsetNode
    offset = caretPosition.offset
  } else {
    const caretRange = document.caretRangeFromPoint?.(clientX, clientY)
    if (caretRange) {
      node = caretRange.startContainer
      offset = caretRange.startOffset
    }
  }
  if (!node || !root.contains(node)) return fallbackOffset
  try {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return fallbackOffset
  }
}

// 点击其他区域关闭右键菜单
function onGlobalClick() {
  imageContextMenu.value.show = false
  selectedIllustrationTarget.value = null
  illustrationSelected.value = false
  editorRef.value?.querySelectorAll('[data-narrative-illustration]').forEach((item) => item.classList.remove('is-selected'))
}

</script>

<style scoped>
.writing-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow: hidden;
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
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface-raised);
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
  background: var(--surface-soft);
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


.book-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.material-selection-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 8px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
}

.material-selection-bar.active {
  grid-template-columns: minmax(0, 1fr);
  border-color: var(--border);
  background: var(--surface-soft);
}

.selection-summary {
  min-height: 18px;
  display: flex;
  align-items: center;
  padding: 0 2px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selection-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.selection-action-btn {
  min-width: 0;
  height: 28px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selection-action-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-light);
}

.selection-action-btn.danger {
  border-color: color-mix(in srgb, var(--danger) 32%, var(--border));
  color: var(--danger);
}

.selection-action-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.selection-action-btn.danger:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 9%, transparent);
}

.selection-action-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.canvas-transfer-feedback {
  margin: 0;
  padding: 8px 12px;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 35%, transparent);
  color: var(--archive-ink-soft);
  font-size: 11px;
  line-height: 1.45;
}

.material-group {
  margin-bottom: 5px;
}

.material-group-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 6px 3px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.material-group-header:hover {
  background: var(--surface-soft);
}

.material-group-header-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.material-group-color {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.material-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.material-group-count,
.material-group-toggle {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.material-group-spine {
  width: 3px;
  align-self: stretch;
  flex-shrink: 0;
  margin-right: 6px;
}

.material-group-number {
  font-size: 10px;
  font-style: italic;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  min-width: 16px;
  text-align: right;
}

.material-group-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.material-group-toggle svg {
  display: block;
}

.material-group-list {
  margin-top: 2px;
  display: grid;
  gap: 2px;
}

.material-selection-stamp {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 4px;
  margin-bottom: 4px;
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
}

.material-selection-stamp-tick {
  flex: 1;
  height: 1px;
  background: var(--text-muted);
  opacity: 0.45;
}

.material-selection-stamp-text {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  white-space: nowrap;
}

.books-sidebar[style*='44px'] .sidebar-title {
  display: none;
}

.book-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.book-check {
  width: 11px;
  height: 11px;
  margin: 0;
  accent-color: var(--accent);
  flex-shrink: 0;
}

.book-item:hover {
  background: var(--surface-raised);
}

.book-item.active {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-panel));
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
}

.book-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.book-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-item.active .book-title {
  color: var(--accent);
}

.book-kind-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.book-meta {
  display: flex;
  align-items: center;
  margin-top: 2px;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.2;
}

.canvas-linked {
  margin-left: auto;
  color: var(--accent);
  font-size: 9px;
}

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

.book-item:hover .delete-btn {
  opacity: 1;
}

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

.prose-rich-editor,
.editor-preview {
  isolation: isolate;
  overflow: visible;
}

.prose-rich-editor::after,
.editor-preview::after {
  content: '';
  display: block;
  clear: both;
}

.prose-rich-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--archive-ink-soft);
  opacity: 0.65;
  pointer-events: none;
}

.prose-rich-editor :deep(p),
.prose-rich-editor :deep(li),
.prose-rich-editor :deep(h1),
.prose-rich-editor :deep(h2),
.prose-rich-editor :deep(h3),
.editor-preview :deep(p),
.editor-preview :deep(li),
.editor-preview :deep(h1),
.editor-preview :deep(h2),
.editor-preview :deep(h3) {
  position: relative;
  z-index: 1;
}

.prose-rich-editor :deep(.narrative-illustration),
.editor-preview :deep(.narrative-illustration) {
  box-sizing: border-box;
  max-width: 100%;
  margin: 0;
  line-height: 0;
}

.prose-rich-editor :deep(.narrative-illustration.is-editable) {
  position: relative;
  cursor: grab;
  touch-action: none;
}

.prose-rich-editor :deep(.narrative-illustration.is-selected) {
  outline: 1px solid color-mix(in srgb, var(--archive-olive) 78%, transparent);
  outline-offset: 2px;
}

.prose-rich-editor :deep(.narrative-illustration.is-dragging) {
  cursor: grabbing;
  opacity: 0.76;
  z-index: 6;
}

.prose-rich-editor :deep(.narrative-illustration.is-resizing) {
  cursor: nwse-resize;
  z-index: 6;
}

.prose-rich-editor :deep(.narrative-illustration img),
.editor-preview :deep(.narrative-illustration img) {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
  border-radius: 0;
  user-select: none;
  pointer-events: none;
}

.prose-rich-editor :deep(.illustration-resize-handle) {
  position: absolute;
  right: 3px;
  bottom: 3px;
  display: none;
  width: 12px;
  height: 12px;
  border: 1px solid var(--archive-olive);
  border-radius: 1px;
  background: var(--archive-paper-soft);
  cursor: nwse-resize;
  pointer-events: auto;
  z-index: 8;
}

.prose-rich-editor :deep(.narrative-illustration.is-selected .illustration-resize-handle) {
  display: block;
}

.prose-rich-editor :deep(.illustration-wrap--square.illustration-align--left),
.prose-rich-editor :deep(.illustration-wrap--tight.illustration-align--left),
.editor-preview :deep(.illustration-wrap--square.illustration-align--left),
.editor-preview :deep(.illustration-wrap--tight.illustration-align--left) {
  float: left;
  margin: 0 var(--illustration-gap) var(--illustration-gap) 0;
}

.prose-rich-editor :deep(.illustration-wrap--square.illustration-align--right),
.prose-rich-editor :deep(.illustration-wrap--tight.illustration-align--right),
.editor-preview :deep(.illustration-wrap--square.illustration-align--right),
.editor-preview :deep(.illustration-wrap--tight.illustration-align--right) {
  float: right;
  margin: 0 0 var(--illustration-gap) var(--illustration-gap);
}

.prose-rich-editor :deep(.illustration-wrap--inline),
.editor-preview :deep(.illustration-wrap--inline) {
  display: inline-block;
  margin: 0 calc(var(--illustration-gap) / 2);
  vertical-align: middle;
}

.prose-rich-editor :deep(.illustration-wrap--top-bottom),
.editor-preview :deep(.illustration-wrap--top-bottom) {
  display: block;
  clear: both;
  margin: var(--illustration-gap) auto;
}

.prose-rich-editor :deep(.illustration-wrap--behind),
.prose-rich-editor :deep(.illustration-wrap--front),
.editor-preview :deep(.illustration-wrap--behind),
.editor-preview :deep(.illustration-wrap--front) {
  position: absolute;
  float: none;
  margin: 0;
  transform: translate(-50%, -50%);
}

.prose-rich-editor :deep(.illustration-wrap--behind),
.editor-preview :deep(.illustration-wrap--behind) {
  opacity: 0.28;
  z-index: 0;
}

.prose-rich-editor :deep(.illustration-wrap--front),
.editor-preview :deep(.illustration-wrap--front) {
  z-index: 4;
}

.editor-preview :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 8px 0;
  border-radius: 6px;
}

.stat {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-divider {
  color: var(--border);
}

/* 素材操作栏 */
.asset-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
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

.asset-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--archive-ink-soft);
}

.asset-control select {
  height: 30px;
  padding: 0 28px 0 9px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 46%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: var(--archive-ink);
  font-size: 12px;
}

.material-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft) 76%, transparent);
  color: var(--archive-ink-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.material-action-btn:hover:not(:disabled) {
  border-color: var(--archive-olive);
  background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft));
  color: var(--archive-ink);
}

.material-action-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive) 42%, transparent);
  outline-offset: 2px;
}

.material-action-btn:disabled {
  opacity: 0.48;
  cursor: wait;
}

.toolbar-spacer {
  flex: 1;
}

/* 主题切换 + 工具栏文字按钮 (N5C C1 fix: restored from cc5c0d8^) */
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

.toolbar-text-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-text-btn:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

/* 侧栏 + 新建按钮 (N5C C1 fix: restored from cc5c0d8^) */
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

/* 画布操作按钮 (N5C C1 fix: restored from cc5c0d8^) */
.asset-canvas-primary {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 12px;
  cursor: pointer;
}

.asset-canvas-primary:hover {
  background: var(--accent-hover);
}

.asset-canvas-secondary {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.asset-canvas-secondary:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.asset-canvas-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 模式切换 + 工具按钮 (N5C C1 fix: restored from cc5c0d8^) */
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

/* K3c (2026-06-27): 素材 textarea 升为档案册 卷宗 视觉.
   之前是 SaaS 圆角白底 textbox (flex: 1 + overflow-y: auto + 24px shadow),
   用户反馈 "素材文字也不要是普通文本框" + "框大小固定了导致文字稍微
   多一点就要滑滚轮, 明明下面还有很多空间, 做成自适应的". 修复:
   1) background / border / shadow / border-radius 全删, 让
      .active-card (卷宗) 透出; 视觉上 textarea 是"写在稿纸上的文字"
   2) flex: 1 + overflow-y: auto 全删, 改 field-sizing: content
      (modern auto-grow) + JS autoResizeTextarea fallback
   3) 跟 active-card 稿纸横线 (30px repeating) 对齐, line-height 1.8 */
.editor-textarea {
  position: relative;
  z-index: 2;  /* 盖在 .active-card__ruled-lines 装饰之上, 文字可读 */
  width: 100%;
  min-height: 240px;
  padding: 4px 0;
  margin: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.8;
  color: var(--archive-ink);
  resize: none;
  outline: none;
  overflow: hidden;  /* K3c: 0 内部滚动条, auto-grow 让 height 跟内容 */
  /* K3c: 现代浏览器原生 auto-grow (Chrome 123+ / Firefox 122+ / Safari 17.5+).
     旧浏览器靠 JS autoResizeTextarea fallback. */
  field-sizing: content;
}

.prose-textarea {
  line-height: 1.8;  /* 跟 .active-card__ruled-lines 30px 横线对齐 (按 1.8×15=27 ≈ 30) */
}

.markdown-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  line-height: 1.7;
  white-space: pre-wrap;
}

.editor-preview {
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 240px;
  padding: 4px 0;
  color: var(--archive-ink);
  overflow: visible;
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

.illustration-context-menu {
  width: 184px;
  padding: 5px;
  border-radius: 5px;
  background: var(--archive-paper-soft);
  border-color: color-mix(in srgb, var(--archive-gold) 48%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--archive-ink) 18%, transparent);
}

.illustration-context-menu__title {
  display: block;
  padding: 5px 9px 6px;
  color: var(--archive-ink-soft);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.illustration-layout-item {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding: 5px 9px 5px 6px;
  border-radius: 3px;
  color: var(--archive-ink);
  font-size: 12px;
}

.illustration-layout-item.active {
  background: color-mix(in srgb, var(--archive-olive) 10%, transparent);
  font-weight: 600;
}

.illustration-layout-item__mark {
  width: 14px;
  color: var(--archive-olive);
  text-align: center;
}

.material-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 10px 24px 11px 64px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.material-top .manuscript-top__left,
.material-top .manuscript-top__right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.material-top .manuscript-top__left {
  flex: 1 1 auto;
}

.material-top .manuscript-top__back,
.material-top .manuscript-top__mode {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 999px;
  background: var(--archive-paper-soft);
  color: var(--archive-ink-soft);
  cursor: pointer;
}

.material-top .manuscript-top__book {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding-left: 10px;
  border-left: 2px solid var(--archive-gold);
}

.material-top .manuscript-top__no {
  color: var(--archive-ink);
  font-size: 13px;
  font-weight: 700;
}

.material-top .manuscript-top__chapter {
  max-width: 32ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--archive-ink-soft);
  font-size: 12px;
  font-style: italic;
}

.material-top .manuscript-top__chip,
.material-top .manuscript-top__tab {
  color: var(--archive-ink-soft);
  font-size: 12px;
}

/* W5c UX sweep: per-state chip colors for the Notes save status.
   Before this, "已保存 / 保存中 / 未保存" rendered identically and
   users couldn't tell at a glance whether their edits were saved. */
.material-top .manuscript-top__chip.is-saved {
  color: var(--text-secondary, #5d5247);
}
.material-top .manuscript-top__chip.is-saving {
  color: var(--warning, #b37213);
  font-weight: 600;
}
.material-top .manuscript-top__chip.is-unsaved {
  color: var(--danger, #b34d3a);
  font-weight: 600;
  border-color: var(--danger, #b34d3a);
}

.material-top .manuscript-top__tab {
  border: none;
  background: transparent;
  cursor: pointer;
}

.material-top__count {
  color: var(--archive-ink-soft);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.notes-content-area {
  position: relative;
  display: grid;
  /* K3 (2026-06-27): 3-col grid — drawer 260px / reading-deck 1fr /
     副阅读台 340px. 副阅读台 替代原 archive-pin 浮卡, 升为正式列. */
  grid-template-columns: 224px minmax(0, 1fr) 300px;
  flex: 1;
  overflow: hidden;
  /* UI-N3 unified paper wall — drawer / deck / sidekick all sit on
     this surface so dark mode doesn't split into "light cream drawer +
     dark center gap". Archive tokens stay cream in both light/dark,
     so this wall is the constant visual ground. */
  isolation: isolate;
  background: linear-gradient(
    112deg,
    color-mix(in srgb, var(--archive-olive) 2%, var(--archive-paper-soft)) 0%,
    var(--archive-paper-soft) 58%,
    color-mix(in srgb, var(--archive-paper-strong) 24%, var(--archive-paper-soft)) 100%
  );
}

.notes-content-area::before,
.notes-content-area::after {
  content: "";
  position: absolute;
  pointer-events: none;
  z-index: 0;
}

.notes-content-area::before {
  right: 12%;
  bottom: -14%;
  width: 58%;
  height: 62%;
  background: repeating-radial-gradient(
    ellipse 76% 58% at 72% 104%,
    transparent 0 42px,
    color-mix(in srgb, var(--archive-olive) 8%, transparent) 43px 44px,
    transparent 45px 62px
  );
  mask-image: linear-gradient(135deg, transparent 0%, black 32%, black 86%, transparent 100%);
  opacity: 0.34;
}

.notes-content-area::after {
  right: 0;
  bottom: 0;
  width: 42%;
  height: 38%;
  background-image: radial-gradient(
    circle at 1px 1px,
    color-mix(in srgb, var(--archive-ink-soft) 16%, transparent) 1px,
    transparent 1.2px
  );
  background-size: 20px 20px;
  mask-image: linear-gradient(135deg, transparent 0%, transparent 24%, black 82%, black 100%);
  opacity: 0.24;
}

.notes-content-area > * {
  position: relative;
  z-index: 1;
}

.writing-page .notes-content-area {
  background: linear-gradient(
    112deg,
    color-mix(in srgb, var(--archive-olive) 2%, var(--archive-paper-soft)) 0%,
    var(--archive-paper-soft) 58%,
    color-mix(in srgb, var(--archive-paper-strong) 24%, var(--archive-paper-soft)) 100%
  );
}

.writing-page .drawer-units {
  background: transparent;
  mix-blend-mode: normal;
}

.writing-page .reading-deck::before {
  display: none;
}

.material-drawer {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* K4 (2026-06-27): .keeper-corner block removed (decorative
   档案员 role framing — 卷数 + +号 add button).
   The + add entry point is preserved in the top "新素材" tab + the
   0-state "新建第一条" CTA. */

.drawer-units {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 12px;
}

.drawer-unit {
  margin: 0 0 10px;
}

.drawer-handle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--archive-ink);
}

.drawer-handle__spine {
  width: 4px;
  align-self: stretch;
  flex-shrink: 0;
  margin-right: 4px;
}

.drawer-handle__roman {
  font-size: 11px;
  font-style: italic;
  letter-spacing: 0.06em;
  min-width: 18px;
  color: var(--archive-ink-soft);
}

.drawer-handle__title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-handle__count {
  font-size: 11px;
  color: var(--archive-ink-soft);
}

.drawer-handle__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--archive-ink-soft);
}

.drawer-handle__chevron svg {
  display: block;
}

.drawer-body {
  display: grid;
  gap: 7px;
  padding: 2px 12px 6px;
}

.index-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 48px;
  margin-inline: var(--card-shift, 0) 2px;
  padding: 8px 8px 7px 9px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
  background:
    linear-gradient(225deg, color-mix(in srgb, var(--archive-paper-strong) 72%, transparent) 0 7px, transparent 7.5px) top right / 11px 11px no-repeat,
    linear-gradient(105deg, color-mix(in srgb, var(--archive-paper) 30%, transparent), transparent 44%),
    var(--archive-paper-soft);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 88%, transparent),
    2px 3px 0 color-mix(in srgb, var(--archive-ink) 7%, transparent),
    0 7px 14px color-mix(in srgb, var(--archive-ink) 9%, transparent);
  cursor: pointer;
  text-align: left;
  color: var(--archive-ink);
  transform: rotate(var(--card-tilt, 0deg));
  transform-origin: 50% 12%;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.index-card::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 50%;
  width: 36px;
  height: 6px;
  border-radius: 1px 1px 0 0;
  background: linear-gradient(
    90deg,
    transparent 0 4px,
    color-mix(in srgb, var(--archive-gold) 40%, var(--archive-paper)) 4px 30px,
    transparent 30px 100%
  );
  box-shadow: 0 1px 0 color-mix(in srgb, var(--archive-ink) 14%, transparent);
  opacity: 0.82;
  transform: translateX(-50%);
  pointer-events: none;
}

.index-card::after {
  content: "";
  position: absolute;
  left: 4px;
  right: -3px;
  bottom: -4px;
  height: 4px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft) 12%, transparent);
  border-top: 0;
  background: color-mix(in srgb, var(--archive-paper-strong) 52%, var(--archive-paper-soft));
  clip-path: polygon(0 0, 100% 0, calc(100% - 5px) 100%, 3px 100%);
  pointer-events: none;
}

.index-card:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 70%, var(--archive-ink));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 90%, transparent),
    3px 4px 0 color-mix(in srgb, var(--archive-ink) 8%, transparent),
    0 10px 18px color-mix(in srgb, var(--archive-ink) 12%, transparent);
  transform: rotate(0deg) translate(2px, -1px);
}

/* R2-D.2: focus-visible ring on the row-level selector (now a div
   with role=button). */
.index-card:focus-visible {
  outline: 2px solid var(--archive-gold);
  outline-offset: 2px;
}

.index-card.is-selected {
  border-color: color-mix(in srgb, var(--archive-gold) 72%, var(--archive-ink));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--archive-gold) 16%, transparent), transparent 38%),
    var(--archive-paper-soft);
  box-shadow:
    inset 3px 0 0 color-mix(in srgb, var(--archive-gold) 76%, var(--archive-ink)),
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 88%, transparent),
    3px 4px 0 color-mix(in srgb, var(--archive-ink) 8%, transparent),
    0 9px 18px color-mix(in srgb, var(--archive-ink) 12%, transparent);
  transform: rotate(0deg) translateY(-1px);
}
.notes-content-area .index-card {
  background:
    linear-gradient(225deg, color-mix(in srgb, var(--archive-paper-strong) 72%, transparent) 0 7px, transparent 7.5px) top right / 11px 11px no-repeat,
    linear-gradient(105deg, color-mix(in srgb, var(--archive-paper) 30%, transparent), transparent 44%),
    var(--archive-paper-soft);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 88%, transparent),
    2px 3px 0 color-mix(in srgb, var(--archive-ink) 7%, transparent),
    0 7px 14px color-mix(in srgb, var(--archive-ink) 9%, transparent);
}

.notes-content-area .index-card:hover {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 90%, transparent),
    3px 4px 0 color-mix(in srgb, var(--archive-ink) 8%, transparent),
    0 10px 18px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.notes-content-area .index-card.is-selected {
  background:
    linear-gradient(225deg, color-mix(in srgb, var(--archive-paper-strong) 72%, transparent) 0 7px, transparent 7.5px) top right / 11px 11px no-repeat,
    linear-gradient(90deg, color-mix(in srgb, var(--archive-gold) 13%, transparent), transparent 38%),
    var(--archive-paper-soft);
  box-shadow:
    inset 3px 0 0 color-mix(in srgb, var(--archive-gold) 76%, var(--archive-ink)),
    inset 0 1px 0 color-mix(in srgb, var(--archive-paper-soft) 88%, transparent),
    3px 4px 0 color-mix(in srgb, var(--archive-ink) 8%, transparent),
    0 9px 18px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.index-card.is-checked {
  border-color: var(--archive-rose);
}

.index-card__check {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--archive-gold);
}

.index-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.index-card__title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-card__meta {
  font-size: 10px;
  margin-top: 1px;
  color: var(--archive-ink-soft);
}

.index-card__canvas-mark {
  font-size: 10px;
  color: var(--archive-rose);
}

.index-card__delete {
  opacity: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--archive-ink-soft);
}

.index-card:hover .index-card__delete,
.index-card:focus-within .index-card__delete {
  opacity: 1;
}

.index-card__delete:hover {
  color: var(--danger);
}

.drawer-empty {
  padding: 18px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--archive-ink-soft);
  font-style: italic;
}

/* 票根 (batch 态) 离开 book-list 后在 drawer 顶部贴 */
.material-selection-stamp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 50%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 50%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 44%, transparent);
  flex-shrink: 0;
}

.material-selection-stamp__rail {
  display: flex;
  align-items: center;
  gap: 6px;
}

.material-selection-stamp-tick {
  flex: 1;
  height: 1px;
  background: var(--archive-gold);
  opacity: 0.45;
}

.material-selection-stamp-text {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--archive-ink);
  white-space: nowrap;
  font-weight: 600;
}

.selection-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.selection-action-btn {
  min-width: 0;
  height: 26px;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
  border-radius: 0;
  background: var(--archive-paper-soft);
  color: var(--archive-ink-soft);
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selection-action-btn.primary {
  border-color: var(--archive-gold);
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-gold) 14%, var(--archive-paper-soft));
}

.selection-action-btn.danger {
  border-color: color-mix(in srgb, var(--danger) 32%, var(--border));
  color: var(--danger);
}

.selection-action-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.selection-action-btn.danger:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 9%, transparent);
}

.selection-action-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

/* 中央阅读台 */
.reading-deck {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 22px 24px 20px;
  overflow: auto;
  position: relative;
}

/* UI-N9: 主卡 + 副阅读台画布 — 真实可用的多素材并列阅读布局.
   主卡在左 (flex 1), 副阅读台在右 (固定 320px).
   空档案柜态保留原 column 布局, 7×3 grid 占满整宽. */
.reading-deck__main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: 0;
}

.reading-deck > .reading-deck__main:not(:only-child) {
  margin-right: 24px;
}

.reading-deck:has(.canvas-pinboard) {
  flex-direction: row;
  align-items: stretch;
}

/* UI-N9: 副阅读台 — 右侧画布, 1-3 张钉入素材在此列堆叠 */
.canvas-pinboard {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 320px;
  padding: 14px 12px 12px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 55%, transparent);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper) 84%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper-soft) 88%, transparent) 100%);
  position: relative;
  overflow: hidden;
}

.canvas-pinboard__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 40%, transparent);
  padding-bottom: 6px;
}

.canvas-pinboard__title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--archive-ink);
}

.canvas-pinboard__count {
  font-family: var(--font-sans);
  font-size: 10px;
  font-style: italic;
  letter-spacing: 0.12em;
  color: var(--archive-ink-soft);
  white-space: nowrap;
}

.canvas-pinboard__hint {
  margin: 0;
  font-family: var(--font-display);
  font-size: 11px;
  line-height: 1.45;
  color: var(--archive-ink-soft);
  padding: 0 2px;
}

.canvas-pinboard__batch-btn {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  color: var(--archive-gold);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  padding: 0;
}

.canvas-pinboard__batch-btn:hover:not(:disabled) {
  color: var(--accent);
}

.canvas-pinboard__batch-btn:disabled {
  color: var(--archive-ink-soft);
  cursor: not-allowed;
  text-decoration: none;
}

.canvas-pinboard__slip-stack {
  position: relative;
  flex: 1 1 auto;
  min-height: 240px;
  overflow: auto;
  /* 拖拽边界让 slip 不溢出画布: 用 inset 留 8px padding,
     让 onBoardDrop 的 clientX/clientY 翻译到 board-local 时保留余量. */
}

.canvas-pinboard__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--archive-ink-soft);
  opacity: 0.5;
}

/* UI-N4 空档案柜：完整柜面蓝图（不再是"空 + 中央一张卡"，而是"7 类 + 5 候补格 + 档案员印章 + footer 状态"）。
   结构在，资产没到位 —— empty but complete。 */
.empty-archive {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  position: relative;
  padding: 0;
  min-height: 360px;
  overflow: hidden;
}

.empty-archive__grid {
  display: none;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 56px 32px 60px;
  width: 100%;
  height: 100%;
  /* UI-N4: grid 占满 reading-deck 内空，4×3 覆盖到右侧边缘，消除 right side void */
}

.empty-archive__cell {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  position: relative;
  padding: 0;
  min-height: 0;
}

.empty-archive__cell-roman {
  display: block;
  padding: 6px 0 0 10px;
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.06em;
  line-height: 1;
}

.empty-archive__cell-label {
  display: block;
  padding: 0 10px 6px 10px;
  margin-top: auto;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-align: left;
}

/* K4 (2026-06-27): .empty-archive__stamp (档案员 · 值班中 印章) +
   .empty-archive__footer (档案柜 · 7 类 · 12 格 · 等候中) deleted —
   decorative role framing. */

.empty-archive__card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: min(320px, 78%);
  max-width: 70%;
  padding: 32px 22px 24px;
  text-align: center;
  z-index: 4;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.empty-archive__tape {
  position: static;
  width: 34px;
  height: 3px;
  border: 0;
  background: linear-gradient(90deg, var(--archive-gold) 0 28%, var(--archive-ink) 28% 78%, var(--archive-olive) 78%);
  opacity: 0.82;
}

.empty-archive__title {
  font-size: 24px;
  font-weight: 600;
  color: var(--archive-ink);
}

/* .empty-archive__desc removed in K4 (2026-06-27) — the 0-state
   card now shows only title + CTA, no extra explanation paragraph. */

.empty-archive__cta {
  margin-top: 8px;
  font-size: 13px;
}

/* 被推上来的卡 (K3c 2026-06-27): 升为 archive-folio 卷宗 (纸感 + 红线
   稿纸 + 30px 横线 + 撕角胶带). 文字直接写在 active-card 内部,
   透明 textarea 让 ruled lines 透出. 跟 Authoring 稿面 dossier
   视觉同源 (paper + 44px 红线 + 30px 横线 + tape). */
.active-card {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 14px;
  max-width: 760px;
  margin: 8px auto 4px;
  padding: 28px 28px 16px 60px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper-soft) 96%, var(--archive-paper)) 0%,
      color-mix(in srgb, var(--archive-paper) 92%, var(--archive-paper-strong)) 100%);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 70%, transparent);
  box-shadow:
    8px 8px 0 color-mix(in srgb, var(--archive-ink) 18%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 22%, transparent);
}

/* K3c: red margin rule (稿纸红线) — vertical line at 44px from left. */
.active-card::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 44px;
  width: 1px;
  background: color-mix(in srgb, var(--archive-rose) 56%, transparent);
  pointer-events: none;
  z-index: 1;
}

/* K3c: horizontal ruled lines (稿纸横线) — repeating gradient at
   line-height 30px, behind textarea. */
.active-card__ruled-lines {
  position: absolute;
  inset: 64px 12px 12px 60px;
  background:
    repeating-linear-gradient(180deg,
      transparent 0 29px,
      color-mix(in srgb, var(--archive-olive) 18%, transparent) 29px 30px);
  pointer-events: none;
  opacity: 0.45;
  z-index: 0;
}

.active-card::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10px;
  transform: translateX(-50%) rotate(-2deg);
  width: 80px;
  height: 18px;
  border: 1px dashed currentColor;
  opacity: 0.45;
  pointer-events: none;
}

.active-card__tape {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(-1deg);
  width: 110px;
  height: 22px;
  border: 1px dashed currentColor;
  opacity: 0.5;
}

.active-card__header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.active-card__stats {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.active-card .chapter-title-input {
  flex: 1;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: 0.04em;
  background: transparent;
  border: none;
  color: var(--archive-ink);
  outline: none;
  padding: 4px 0;
}

.active-card .chapter-title-input::placeholder {
  color: var(--archive-ink-soft);
  font-style: italic;
}

.deck-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 0;
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 42%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 42%, transparent);
  flex-wrap: wrap;
  background: transparent;
}

.deck-toolbar__kind {
  padding-right: 10px;
  margin-right: 2px;
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 34%, transparent);
}

.deck-toolbar__spacer {
  flex: 1;
}

.deck-toolbar__btn {
  height: 30px;
}

.deck-toolbar__btn--canvas {
  border-color: color-mix(in srgb, var(--archive-olive) 45%, transparent);
  color: color-mix(in srgb, var(--archive-olive) 78%, var(--archive-ink));
}

.deck-toolbar__btn--generate {
  border-color: color-mix(in srgb, var(--archive-rose) 36%, var(--archive-gold));
  background: color-mix(in srgb, var(--archive-rose) 7%, var(--archive-paper-soft));
  color: color-mix(in srgb, var(--archive-rose) 68%, var(--archive-ink));
}

.page-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0 4px;
}

.page-controls__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold) 50%, transparent);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: var(--archive-ink-soft);
}

.page-controls__btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-controls__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-controls__count {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--archive-ink-soft);
}

/* K3 (2026-06-27): 副阅读台 (was 右下浮卡). archive-pin 类名保留
   以满足既有 UI-N2 契约 (anti-micro-tweak 仍 5/5 命中), 但实际
   角色从右下浮卡升为 notes-content-area 第 3 列, 容纳 2-4 张
   素材摘要 (sidekick-slip). */
.archive-pin {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--archive-olive) 28%, transparent);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--archive-paper) 86%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper-soft) 92%, transparent) 100%);
  overflow: hidden;
}

/* K3: 原本钉在浮卡左上角的图钉, 改为副阅读台 header 左上角装饰 */
.archive-pin__nail {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  color: var(--accent);
  pointer-events: none;
}

/* K3 (2026-06-27): 副阅读台 header — 标题 + 数量 */
.notes-sidekick__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 18px 16px 10px 36px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 45%, transparent);
}

.notes-sidekick__title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--archive-ink);
}

.notes-sidekick__count {
  font-family: var(--font-sans);
  font-size: 10px;
  font-style: italic;
  letter-spacing: 0.1em;
  color: var(--archive-ink-soft);
  white-space: nowrap;
}

.notes-sidekick__modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 0 12px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 38%, transparent);
}

.notes-sidekick__modes button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 5px 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
  font-size: 11px;
  cursor: pointer;
}

.notes-sidekick__modes button:hover {
  color: var(--archive-ink);
}

.notes-sidekick__modes button.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.notes-sidekick__illustration {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

/* K3: 副阅读台主体 — 2-4 张 sidekick-slip 列表 */
.notes-sidekick__list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
  overflow-y: auto;
  min-height: 0;
}

.notes-sidekick__empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  font-style: italic;
  color: var(--archive-ink-soft);
  opacity: 0.7;
}

/* K3: 单张素材摘要 — 复刻 pinned-slip 双行 + status-dot 视觉,
   但改成 button 语义 (点击切到主卡), 静态布局 (不拖拽) */
.sidekick-slip {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 10px 8px 18px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 45%, transparent);
  background: var(--archive-paper-soft);
  text-align: left;
  cursor: pointer;
  color: var(--archive-ink);
  font-family: inherit;
  font-size: inherit;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.sidekick-slip:hover {
  border-color: var(--archive-gold);
  background: color-mix(in srgb, var(--archive-gold) 8%, var(--archive-paper-soft));
  transform: translateY(-1px);
}

.sidekick-slip.is-active {
  border-color: var(--archive-olive);
  background: color-mix(in srgb, var(--archive-olive) 10%, var(--archive-paper-soft));
}

.asset-source-chip {
  align-self: flex-start;
  margin: 0;
  font-size: 11px;
  line-height: 1;
  padding: 0 12px;
  height: 24px;
}

.asset-source-chip__index {
  margin-right: 6px;
  font-size: 9px;
  opacity: 0.78;
}

.sidekick-slip:focus-visible {
  outline: 2px solid var(--archive-gold);
  outline-offset: 2px;
}

.sidekick-slip__tab {
  position: absolute;
  top: 0;
  left: 0;
  width: 5px;
  height: 100%;
}

.sidekick-slip__line-1,
.sidekick-slip__line-2 {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidekick-slip__line-1 {
  justify-content: space-between;
}

.sidekick-slip__line-2 {
  justify-content: space-between;
  margin-top: 2px;
}

.sidekick-slip__kind {
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--archive-ink-soft);
}

.sidekick-slip__reason {
  margin-left: 5px;
  color: var(--accent);
  letter-spacing: 0.08em;
}

.sidekick-slip__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidekick-slip__title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--archive-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidekick-slip__preview {
  font-family: var(--font-display);
  font-size: 11px;
  line-height: 1.42;
  color: var(--archive-ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sidekick-slip__status {
  font-family: var(--font-sans);
  font-size: 9px;
  font-style: italic;
  letter-spacing: 0.08em;
  color: var(--archive-ink-soft);
}

.sidekick-slip__stat {
  font-family: var(--font-sans);
  font-size: 9px;
  font-style: italic;
  color: var(--archive-ink-soft);
}

/* UI-N6: Pinned material slips — 贴板纸, 在 canvas-pinboard 内绝对定位
   UI-N9: 宽度从 220px → 280px, 在副阅读台列里更易阅读 preview */
.pinned-slip {
  position: absolute; width: 280px; min-height: 130px;
  display: flex; flex-direction: column; gap: 6px;
  padding: 14px 14px 10px 24px;
  cursor: grab; user-select: none; z-index: 1;
}
.pinned-slip:active { cursor: grabbing; }
.pinned-slip:focus-visible {
  outline: 2px solid var(--archive-gold, var(--accent));
  outline-offset: 2px;
}
.pinned-slip__tab { position: absolute; top: 0; left: 0; width: 6px; height: 100%; }
.pinned-slip__kind,
.pinned-slip__title,
.pinned-slip__preview { font-family: var(--font-display); margin: 0; }
.pinned-slip__kind {
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--archive-ink-soft, var(--text-secondary));
}
.pinned-slip__title {
  font-size: 13px; font-weight: 600;
  color: var(--archive-ink, var(--text-primary));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pinned-slip__preview {
  font-size: 11px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden;
}
.pinned-slip__stat {
  font-size: 9px; font-style: italic; letter-spacing: 0.06em;
  align-self: flex-end;
}
.pinned-slip__unpin {
  position: absolute; top: 4px; right: 4px;
  width: 18px; height: 18px; border: none; background: transparent;
  cursor: pointer; font-size: 14px; line-height: 1;
  border-radius: 0; padding: 0;
}
@media (max-width: 1100px) {
  .notes-content-area {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .notes-content-area .archive-pin {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 8;
    display: none;
    width: min(340px, calc(100% - 220px));
    min-height: 0;
    max-height: none;
    border-top: 0;
    border-left: 1px solid color-mix(in srgb, var(--archive-olive) 28%, transparent);
    box-shadow: -16px 0 32px color-mix(in srgb, var(--archive-ink) 12%, transparent);
  }
  .notes-content-area[data-mobile-pane="tools"] .archive-pin { display: flex; }
}

@media (max-width: 980px) {
  .notes-content-area {
    grid-template-columns: 180px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  .material-drawer {
    display: flex;
    width: 180px;
  }
  .notes-content-area .archive-pin { width: min(340px, calc(100% - 180px)); }
  .notes-sidekick__list {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 10px;
  }
  .sidekick-slip {
    flex: 0 0 auto;
  }
  .drawer-body {
    padding-inline: 8px;
  }
  .index-card {
    padding-inline: 7px;
  }
  .reading-deck:has(.canvas-pinboard) {
    flex-direction: column;
  }
  .reading-deck > .reading-deck__main:not(:only-child) {
    margin-right: 0;
    margin-bottom: 16px;
  }
  .canvas-pinboard {
    flex: 0 0 auto;
    width: 100%;
    min-height: 200px;
  }
  .canvas-pinboard__slip-stack {
    display: flex;
    flex-direction: row;
    gap: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    min-height: 0;
  }
  .pinned-slip {
    position: relative; width: 240px;
    left: auto; top: auto; transform: none;
    flex: 0 0 240px;
  }
}

@media (max-width: 760px) {
  :global(.theme-legacy) .material-top {
    align-items: stretch;
    flex-direction: column;
    gap: 7px;
    padding: 8px 10px;
  }
  :global(.theme-legacy) .material-top .manuscript-top__left,
  :global(.theme-legacy) .material-top .manuscript-top__right {
    width: 100%;
    gap: 9px;
  }
  :global(.theme-legacy) .material-top .manuscript-top__right {
    justify-content: flex-end;
  }
  :global(.theme-legacy) .material-top .manuscript-top__chip {
    margin-right: auto;
    white-space: nowrap;
  }
  :global(.theme-legacy) .material-top .manuscript-top__chapter {
    flex: 1 1 auto;
    max-width: none;
  }
  :global(.theme-legacy) .material-top__count {
    letter-spacing: 0;
    white-space: nowrap;
  }
  .notes-content-area {
    display: block;
    min-height: 0;
  }
  .notes-content-area > * {
    width: 100%;
    height: 100%;
  }
  .notes-content-area .material-drawer,
  .notes-content-area > :deep(.folio-surface),
  .notes-content-area .archive-pin {
    display: none;
  }
  .notes-content-area[data-mobile-pane="index"] .material-drawer,
  .notes-content-area[data-mobile-pane="content"] > :deep(.folio-surface),
  .notes-content-area[data-mobile-pane="tools"] .archive-pin {
    position: relative;
    inset: auto;
    display: flex;
    width: 100%;
    max-width: none;
    border-left: 0;
    box-shadow: none;
  }
  .notes-content-area[data-mobile-pane="content"] > :deep(.folio-surface) { min-height: 0; }
  .notes-content-area[data-mobile-pane="content"] .reading-deck { height: 100%; }
  .notes-content-area[data-mobile-pane="content"] .empty-archive {
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .notes-content-area[data-mobile-pane="content"] .empty-archive__grid { display: none; }
}

@media (max-width: 420px) {
  :global(html.theme-legacy .material-top .manuscript-top__right .manuscript-top__tab:nth-of-type(-n + 2)) {
    display: none;
  }
}
</style>
