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
          <button class="manuscript-top__mode" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换亮色' : '切换暗色'">
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

    <div class="content-area notes-content-area">
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
              <button class="selection-action-btn material-action-btn primary" type="button" @click="importCheckedToCanvas">导入</button>
              <button v-if="checkedAssetIds.length > 1" class="selection-action-btn material-action-btn" type="button" @click="mergeCheckedAssets">合并</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('accepted')">采纳</button>
              <button class="selection-action-btn material-action-btn" type="button" @click="setCheckedAssetsState('archived')">归档</button>
              <button class="selection-action-btn material-action-btn danger" type="button" @click="deleteCheckedAssets">删除</button>
            </div>
          </div>
        </Transition>
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
                       红线 + Writing.vue wall__dossier 同源. -->
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
              <span class="sidekick-slip__kind">{{ getAssetKindLabel(asset.kind) }}</span>
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
            暂无相关素材
          </div>
        </div>
        <footer class="notes-sidekick__strip" aria-label="素材缩略目录">
          <ArchiveStrip
            :items="archiveStripItems"
            :image="firstImageDataUrl"
            aria-label="素材缩略目录"
          />
        </footer>
        </template>
        <ImageGenerationWorkbench
          v-else
          class="notes-sidekick__illustration"
          presentation="inline"
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
      @open="openAdvisor"
    />

    <AdvisorPanel
      :isOpen="advisorOpen"
      :messages="advisorMessages"
      :loading="advisorLoading"
      :quickQuestions="[
        { label: '素材整理建议', question: '分析当前素材的组织结构，给出整理和分类建议。', scope: 'chapter', taskType: 'advisor.review.chapter' },
        { label: '关联发现', question: '基于当前素材内容，发现并建议素材间的关联。', scope: 'chapter', taskType: 'advisor.review.chapter' },
        { label: '扩展写作方向', question: '从当前素材延伸出可写的创作方向。', scope: 'thread', taskType: 'advisor.close.thread' },
        { label: '分类体系优化', question: '分析当前分类体系，建议优化方向。', scope: 'chapter', taskType: 'advisor.review.chapter' }
      ]"
      :emptyText="'创作顾问可帮你梳理灵感、组织素材，发现素材间的关联与创作方向。'"
      @close="closeAdvisor"
      @ask="handleAskAdvisor"
    />

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { sanitizeHtml } from '../utils/sanitize'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useAdvisor } from '../composables/useAdvisor'
import { useCanvasBoard } from '../composables/useCanvasBoard'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import GmPersonaLauncher from '../components/gm-persona/GmPersonaLauncher.vue'
import ArchiveStrip from '../components/folio/ArchiveStrip.vue'
import CharacterPortrait from '../components/folio/CharacterPortrait.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import ImageGenerationWorkbench from '../components/media/ImageGenerationWorkbench.vue'
import { STORAGE_KEYS } from '../composables/useStorage'
import { useGameStore } from '../stores/gameStore'
import {
  addNarrativeAsset,
  buildNarrativeAssetContentHash,
  DEFAULT_IMAGE_PRESENTATION,
  deleteNarrativeAsset,
  getAssetKindLabel,
  listActiveNarrativeAssets,
  mergeNarrativeAssets,
  normalizeImagePresentation,
  setNarrativeAssetsStatus,
  updateNarrativeAsset
} from '../services/narrativeAssets'
import {
  addNarrativeImageAsset,
  getMediaImagePresentation,
  hydrateNarrativeImageAssets,
  migrateNarrativeImageAssets,
  updateMediaImagePresentation,
  updateNarrativeImagePresentation
} from '../services/media/narrativeImageAssetBridge'
import {
  createMarkdownMediaReference,
  hydrateMarkdownMediaContent,
  migrateMarkdownMediaContent
} from '../services/media/markdownMediaBridge'
import { listImageProviderConfigs } from '../services/media/imageProviderConfigStore'
import {
  deleteAssetCanvasReferences,
  ensureAssetCanvasCard,
  ensureAssetCanvasCardWithExtra,
  findAssetCanvasCard
} from '../services/relationCanvas'
import { generateProfessionalInfoForAsset } from '../services/professionalInfoGenerator'

const router = useRouter()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const { advisorOpen, advisorMessages, advisorLoading, askAdvisor, openAdvisor, closeAdvisor } = useAdvisor()
const gameStore = useGameStore()

const chapters = ref([])
const selectedChapterId = ref(null)
const currentChapterTitle = ref('')
const editorContent = ref('')
const showNewNoteModal = ref(false)
const newNoteTitle = ref('')
const newNoteInput = ref(null)
const editorRef = ref(null)
const previewRef = ref(null)
const editorMode = ref('wysiwyg')
const markdownContent = ref('')
const renderedMarkdownContent = ref('')
const renderedMarkdownSource = ref('')
const sidekickWorkspace = ref('materials')
const illustrationPreview = ref(null)
const sidekickImageModelConfigs = ref([])
const sidekickImageModelId = ref('')
const checkedAssetIds = ref([])
const canvasImportRevision = ref(0)
const collapsedAssetKinds = ref({})

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
const MAX_HINTED_SLIPS = 6 // 多于此数才显示底部 cross 翻页提示
const pinnedSlipIds = ref([])
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

// K3 (2026-06-27): 副阅读台 (notes-sidekick) 显示列表.
// 选中态 → 同类 (排除 active) 优先, 不足再补近期; 上限 4 张.
// 非选中态 → 按 chapters 已有的 status-priority + recency 排序 (loadNotes
// 已排序), 取前 4. 不实现真实拖拽, 只做点击切换 (selectChapter).
// 跟 N10 multi-canvas__slips 的拖拽并行: 多卡画布保留 useCanvasBoard
// 的 1.55fr 主卡 + 1fr slip 拖拽舞台; 副阅读台是右列静态列表, 提供
// "一次能看到 2-4 张" 的快读, 跟"一次只能看一个"的中央主卡互补.
const SIDEKICK_MAX_ITEMS = 4
const sidekickItems = computed(() => {
  if (chapters.value.length === 0) return []
  const selectedId = selectedChapterId.value
  const selected = selectedId
    ? chapters.value.find((a) => a.id === selectedId)
    : null
  if (selected) {
    const sameKind = chapters.value.filter((a) =>
      a.id !== selectedId && a.kind === selected.kind)
    const otherKind = chapters.value.filter((a) =>
      a.id !== selectedId && a.kind !== selected.kind)
    return [...sameKind, ...otherKind].slice(0, SIDEKICK_MAX_ITEMS)
  }
  return chapters.value.slice(0, SIDEKICK_MAX_ITEMS)
})

// useCanvasBoard 提供 6 个 drag/drop handler + layoutItems + styleFor
// items 走 computed, positions 走 reactive (持久化到 localStorage)
// UI-N9: 新增 bringToFront + focusedZId, 点击/拖拽时把 slip 浮到最上层
const {
  draggingId,
  isDragging,
  onItemDragStart,
  onItemDragOver,
  onItemDragEnd,
  onBoardDragOver,
  onBoardDrop,
  layoutItems: layoutItemsFn,
  styleFor,
  bringToFront,
} = useCanvasBoard({
  boardRef,
  items: pinnedSlipAssets,
  positions: pinnedSlipPositions
})

// 包装成 computed, 避免模板里 v-for="slip in layoutItems()" 每次渲染
// 都调用函数返回新数组导致的无限循环
const layoutItems = computed(() => layoutItemsFn())

// UI-N10: slipStyleFor — 在 useCanvasBoard 的 styleFor 基础上偏移到
// slip-stack 容器内 (主卡占 main 区, slip 围绕). 位置用绝对 + left/top
// 表达自由拖拽 (来自 persisted positions); 默认 grid 来自 useCanvasBoard.
function slipStyleFor(slip) {
  return styleFor(slip)
}

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
const isGeneratingProfessionalInfo = ref(false)
const selectionFontSize = ref('16px')
const selectionToolbarStyle = ref({ top: '100px', left: '100px' })

const saveStatus = ref('saved')
let saveTimeout = null
let titleTimeout = null

onMounted(() => {
  loadSidekickImageModels()
  loadNotesPinnedSlipsPref()
  loadNotes(String(route.query.assetId || ''))
  void migrateNarrativeImageAssets().then(() => {
    loadNotes(selectedChapterId.value || String(route.query.assetId || ''))
  })
  // K3c (2026-06-27): 初始 auto-grow (loadNotes 触发 selectChapter,
  // selectChapter 里已调 autoResizeTextarea, 这里是 belt-and-suspenders)
  nextTick(() => autoResizeTextarea())
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
}

let markdownMediaRenderRevision = 0
watch(markdownContent, (content) => {
  const revision = ++markdownMediaRenderRevision
  renderedMarkdownSource.value = content
  renderedMarkdownContent.value = content
  void hydrateMarkdownMediaContent(content).then((hydrated) => {
    if (revision === markdownMediaRenderRevision) {
      renderedMarkdownContent.value = hydrated
      if (editorMode.value === 'wysiwyg' && document.activeElement !== editorRef.value) {
        nextTick(renderCurrentEditor)
      }
    }
  })
}, { immediate: true })

const previewHtml = computed(() => markdownToHtml(renderedMarkdownContent.value))
watch(previewHtml, () => {
  if (editorMode.value === 'preview') nextTick(renderPreviewSurface)
})
const selectedAsset = computed(() => chapters.value.find((asset) => asset.id === selectedChapterId.value) || null)
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

function imageBaseWidth(wrap) {
  if (wrap === 'inline') return 32
  if (wrap === 'top-bottom') return 68
  return 42
}

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
    updateNarrativeAsset(target.id, {
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

const mediaGenerationSourceAssets = computed(() => {
  if (checkedAssetIds.value.length > 0) {
    const checked = new Set(checkedAssetIds.value)
    return chapters.value.filter((asset) => checked.has(asset.id))
  }
  return selectedAsset.value ? [selectedAsset.value] : []
})
const mediaGenerationProjectId = computed(() => {
  const projectIds = [...new Set(mediaGenerationSourceAssets.value.map((asset) => asset.projectId ?? null))]
  return projectIds.length === 1 ? projectIds[0] : null
})
const mediaGenerationSourceRefs = computed(() => mediaGenerationSourceAssets.value.map((asset) => ({
  refType: 'narrative-asset',
  refId: asset.id,
  projectId: asset.projectId ?? null,
  excerpt: asset.content
})))
const assetKindOrder = [
  'storyboard-seed',
  'reference-image',
  'draft-prose',
  'event',
  'character-fact',
  'worldbook-draft',
  'inspiration'
]
const groupedChapters = computed(() => assetKindOrder
  .map((kind) => ({
    kind,
    label: getAssetKindLabel(kind),
    color: getAssetKindColor(kind),
    items: chapters.value.filter((asset) => asset.kind === kind)
  }))
  .filter((group) => group.items.length > 0))

// N5C: ArchiveStrip 3 entry collage state
const currentKindForArchiveStrip = ref(null)
const archiveStripItems = computed(() => {
  const kind = currentKindForArchiveStrip.value
    || chapters.value.find((a) => a.status === 'accepted' || a.status === 'inbox')?.kind
    || chapters.value[0]?.kind
    || null
  if (!kind) return []
  return chapters.value
    .filter((a) => a.kind === kind)
    .slice(0, 3)
    .map((a) => ({ label: a.title || '无标题', position: 'center' }))
})
// N5C: when user picks an asset, switch ArchiveStrip to that asset's kind
watch(() => selectedAsset.value?.kind, (k) => {
  if (k) currentKindForArchiveStrip.value = k
})
const firstImageDataUrl = computed(() => {
  const ref = chapters.value.find((a) => a.image?.data)
  return ref?.image?.data || ''
})
// N2: page-flip navigation for active card (reading deck prev/next).
const currentAssetIndex = computed(() => {
  if (!selectedChapterId.value) return -1
  return chapters.value.findIndex((a) => a.id === selectedChapterId.value)
})
const canGoPrev = computed(() => currentAssetIndex.value > 0)
const canGoNext = computed(() => {
  const i = currentAssetIndex.value
  return i >= 0 && i < chapters.value.length - 1
})
function goPrevAsset() {
  const i = currentAssetIndex.value
  if (i > 0) selectChapter(chapters.value[i - 1].id)
}
function goNextAsset() {
  const i = currentAssetIndex.value
  if (i >= 0 && i < chapters.value.length - 1) selectChapter(chapters.value[i + 1].id)
}

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
  saveCurrentChapter()
  router.push('/')
}

function goToWriting() {
  saveCurrentChapter()
  router.push({ name: 'writing' })
}

function goToAssetSource() {
  const asset = selectedAsset.value
  const src = asset?.source
  if (!src || src.type !== 'chapter' || !src.chapterId) return
  saveCurrentChapter()
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
  saveCurrentChapter()
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

function getAssetWordCount(asset) {
  const text = String(asset?.content || '').trim()
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

function collectNotesContext() {
  return {
    totalNotes: chapters.value.length,
    selectedNoteId: selectedChapterId.value,
    noteTitle: currentChapterTitle.value || '',
    noteContent: editorContent.value || '',
    selectedText: '',
    wordCount: editorContent.value.replace(/\s/g, '').length
  }
}

async function handleAskAdvisor(input) {
  const action = typeof input === 'string'
    ? { label: input, question: input, scope: 'chapter', taskType: 'advisor.review.chapter' }
    : input
  await askAdvisor({ ...action, mode: 'notes' }, collectNotesContext)
}

let notesMediaLoadRevision = 0

function sortNoteAssets(assets) {
  return [...assets].sort((a, b) => {
    const rank = { accepted: 0, inbox: 1 }
    const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (diff !== 0) return diff
    return Number(b.createdAt || 0) - Number(a.createdAt || 0)
  })
}

function loadNotes(preferredChapterId = '') {
  const revision = ++notesMediaLoadRevision
  chapters.value = sortNoteAssets(listActiveNarrativeAssets())
  void hydrateNarrativeImageAssets(chapters.value).then((hydrated) => {
    if (revision !== notesMediaLoadRevision) return
    const hydratedImages = new Map(hydrated.map((asset) => [asset.id, asset.image]))
    chapters.value = sortNoteAssets(chapters.value.map((asset) => (
      hydratedImages.get(asset.id)
        ? { ...asset, image: hydratedImages.get(asset.id) }
        : asset
    )))
  })

  // UI-N10: 默认所有素材 visible on canvas (避免 0 张时大空 void)
  // 仅在 prefs 没保存过时默认全开; 否则尊重 user 选择
  if (pinnedSlipIds.value.length === 0 && chapters.value.length > 0) {
    pinnedSlipIds.value = chapters.value.map((a) => a.id)
  }

  const nextChapterId = preferredChapterId && chapters.value.some((asset) => asset.id === preferredChapterId)
    ? preferredChapterId
    : chapters.value[0]?.id || null

  if (nextChapterId) {
    selectChapter(nextChapterId)
  } else {
    selectedChapterId.value = null
    currentChapterTitle.value = ''
    editorContent.value = ''
    markdownContent.value = ''
  }
}

function selectChapter(chapterId) {
  if (selectedChapterId.value && selectedChapterId.value !== chapterId) {
    saveCurrentChapter()
  }
  selectedIllustrationTarget.value = null
  illustrationSelected.value = false
  imageContextMenu.value.show = false
  selectedChapterId.value = chapterId
  const chapter = chapters.value.find(c => c.id === chapterId)
  if (chapter) {
    currentChapterTitle.value = chapter.title || ''
    const raw = chapter.content || ''
    const format = chapter.contentFormat || (looksLikeHtml(raw) ? 'html' : 'md')
    const nextMarkdown = format === 'md' ? raw : htmlToMarkdown(raw)
    markdownContent.value = nextMarkdown
    editorContent.value = markdownToHtml(markdownContent.value)
    void migrateSelectedChapterMarkdownMedia(chapter, nextMarkdown)
    nextTick(() => {
      renderCurrentEditor()
      renderPreviewSurface()
    })
  }
}

async function migrateSelectedChapterMarkdownMedia(chapter, sourceMarkdown) {
  const result = await migrateMarkdownMediaContent(sourceMarkdown, {
    projectId: chapter.projectId ?? null,
    purpose: 'illustration',
    sourceRefs: [{
      refType: 'narrative-asset',
      refId: chapter.id,
      projectId: chapter.projectId ?? null,
      excerpt: chapter.content
    }]
  })
  if (!result.changed) return
  if (selectedChapterId.value !== chapter.id || markdownContent.value !== sourceMarkdown) return

  markdownContent.value = result.content
  editorContent.value = markdownToHtml(result.content)
  chapter.content = result.content
  chapter.contentFormat = 'md'
  chapter.embeddedImagePresentations = remapEmbeddedImagePresentations(
    chapter.embeddedImagePresentations,
    sourceMarkdown,
    result.content
  )
  updateNarrativeAsset(chapter.id, {
    content: result.content,
    contentFormat: 'md',
    embeddedImagePresentations: chapter.embeddedImagePresentations
  })
  nextTick(() => {
    renderCurrentEditor()
    renderPreviewSurface()
  })
}

function remapEmbeddedImagePresentations(presentations, previousMarkdown, nextMarkdown) {
  const current = presentations && typeof presentations === 'object' ? presentations : {}
  const previous = markdownImageDescriptors(previousMarkdown)
  const next = markdownImageDescriptors(nextMarkdown)
  const remapped = { ...current }
  previous.forEach((descriptor, index) => {
    const replacement = next[index]
    if (!replacement || replacement.key === descriptor.key || !current[descriptor.key]) return
    remapped[replacement.key] = current[descriptor.key]
    delete remapped[descriptor.key]
  })
  return remapped
}

function createNewNote() {
  showNewNoteModal.value = true
  newNoteTitle.value = ''
  nextTick(() => newNoteInput.value?.focus())
}

function confirmCreateNote() {
  if (!newNoteTitle.value.trim()) return

  const newNote = addNarrativeAsset({
    title: newNoteTitle.value.trim(),
    content: newNoteTitle.value.trim(),
    kind: 'inspiration',
    status: 'inbox',
    source: {
      type: 'manual'
    }
  })

  loadNotes(newNote.id)
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

function openSelectedAssetInCanvas() {
  if (!selectedAsset.value) return
  saveCurrentChapter()
  ensureAssetCanvasCard(selectedAsset.value)
  canvasImportRevision.value += 1
  router.push({ name: 'prose-essay', query: { assetId: selectedAsset.value.id } })
}

async function generateAndImportToCanvas() {
  if (!selectedAsset.value) return
  saveCurrentChapter()

  isGeneratingProfessionalInfo.value = true
  try {
    const result = await generateProfessionalInfoForAsset({
      asset: selectedAsset.value,
      settings: null,
      assetKind: selectedAsset.value.kind
    })

    const extraFields = result.success ? result.extraFields : null
    ensureAssetCanvasCardWithExtra(selectedAsset.value, extraFields)
  } catch (err) {
    console.error('生成专业信息失败:', err)
    ensureAssetCanvasCardWithExtra(selectedAsset.value, null)
  } finally {
    isGeneratingProfessionalInfo.value = false
    canvasImportRevision.value += 1
    router.push({ name: 'prose-essay', query: { assetId: selectedAsset.value.id } })
  }
}

function isAssetOnCanvas(assetId) {
  canvasImportRevision.value
  return Boolean(findAssetCanvasCard(assetId))
}

// UI-N6: Pinned slip methods
function isPinned(assetId) {
  return pinnedSlipIds.value.includes(assetId)
}

function togglePinSlip(assetId) {
  if (!assetId) return
  if (pinnedSlipIds.value.includes(assetId)) {
    unpinSlip(assetId)
    return
  }
  // UI-N10: 无 MAX cap — 加新张到列表尾部, 默认位置由 useCanvasBoard 网格决定
  const nextIds = [...pinnedSlipIds.value, assetId]
  pinnedSlipIds.value = nextIds
  saveNotesPinnedSlipsPref()
}

function unpinSlip(assetId) {
  pinnedSlipIds.value = pinnedSlipIds.value.filter((id) => id !== assetId)
  delete pinnedSlipPositions[assetId]
  saveNotesPinnedSlipsPref()
}

// UI-N9: 点击画布上的 slip: 先 z-index 浮到最上, 再切到主卡编辑
function onSlipClick(slip) {
  if (!slip?.id) return
  bringToFront(slip.id)
  selectChapter(slip.id)
}

// UI-N10: 批量钉入 — 移除 MAX cap, 所有勾选都钉入画布
function importCheckedToPinboard() {
  const targets = getCheckedAssets().filter((asset) => !isPinned(asset.id))
  if (targets.length === 0) return
  for (const asset of targets) {
    togglePinSlip(asset.id)
  }
  checkedAssetIds.value = []
}

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

// K3b (2026-06-27): scrollCanvasToBottom 保留作 useCanvasBoard 兼容,
// K3b 删了 multi-canvas__bottom-cross footer, 函数 no-op.
function scrollCanvasToBottom() {
  const board = boardRef?.value
  if (!board) return
  board.scrollTo({ top: board.scrollHeight, behavior: 'smooth' })
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

function toggleCheckedAsset(assetId) {
  checkedAssetIds.value = checkedAssetIds.value.includes(assetId)
    ? checkedAssetIds.value.filter((id) => id !== assetId)
    : [...checkedAssetIds.value, assetId]
}

function getCheckedAssets() {
  const checked = new Set(checkedAssetIds.value)
  return chapters.value.filter((asset) => checked.has(asset.id))
}

function importCurrentToCanvas() {
  openSelectedAssetInCanvas()
}

function importCheckedToCanvas() {
  getCheckedAssets()
    .forEach((asset) => ensureAssetCanvasCard(asset))
  canvasImportRevision.value += 1
  checkedAssetIds.value = []
}

function importAllToCanvas() {
  chapters.value
    .forEach((asset) => ensureAssetCanvasCard(asset))
  canvasImportRevision.value += 1
}

function setSelectedAssetKind(kind) {
  if (!selectedAsset.value) return
  saveCurrentChapter()
  updateNarrativeAsset(selectedAsset.value.id, { kind })
  loadNotes(selectedAsset.value.id)
}

function setCheckedAssetsState(status) {
  const targets = getCheckedAssets()
  if (targets.length === 0) return
  saveCurrentChapter()
  const targetIds = targets.map((asset) => asset.id)
  setNarrativeAssetsStatus(targetIds, status)
  checkedAssetIds.value = []

  const targetSet = new Set(targetIds)
  const selectedId = selectedChapterId.value
  const hidesFromActiveList = status === 'archived' || status === 'rejected'
  const nextId = hidesFromActiveList && targetSet.has(selectedId)
    ? chapters.value.find((asset) => !targetSet.has(asset.id))?.id || null
    : selectedId || targetIds[0] || null
  loadNotes(nextId)
}

function mergeCheckedAssets() {
  const targets = getCheckedAssets()
  if (targets.length < 2) return

  saveCurrentChapter()
  const selectedId = selectedChapterId.value
  const targetId = targets.some((asset) => asset.id === selectedId) ? selectedId : targets[0].id
  const removableIds = targets.map((asset) => asset.id).filter((id) => id !== targetId)
  const canvasAttached = removableIds.filter((id) => isAssetOnCanvas(id))
  if (canvasAttached.length > 0) {
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? false
      : window.confirm(`有 ${canvasAttached.length} 项素材已在画布中。继续合并会移除这些旧画布节点，是否继续？`)
    if (!confirmed) return
  }

  const result = mergeNarrativeAssets(targets.map((asset) => asset.id), { targetId })
  if (!result) return

  canvasAttached.forEach((assetId) => deleteAssetCanvasReferences(assetId))
  checkedAssetIds.value = []
  canvasImportRevision.value += 1
  loadNotes(result.asset.id)
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
  loadNotes(imgEntry.mode === 'comic' && currentAssetId ? currentAssetId : asset.id)
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

function deleteChapter(chapterId) {
  if (selectedChapterId.value === chapterId) {
    saveCurrentChapter()
  }

  const asset = chapters.value.find((item) => item.id === chapterId)
  const ok = typeof window === 'undefined' || typeof window.confirm !== 'function'
    ? true
    : window.confirm(`删除素材「${asset?.title || '无标题素材'}」？如果它已导入画布，对应节点、连线和时间轴引用也会移除。`)
  if (!ok) return

  const nextId = selectedChapterId.value === chapterId
    ? chapters.value.find((item) => item.id !== chapterId)?.id || null
    : selectedChapterId.value
  const deleted = deleteNarrativeAsset(chapterId)
  if (deleted) {
    deleteAssetCanvasReferences(chapterId)
    checkedAssetIds.value = checkedAssetIds.value.filter((id) => id !== chapterId)
    canvasImportRevision.value += 1
  }
  loadNotes(nextId)
}

function deleteCheckedAssets() {
  const targets = getCheckedAssets()
  if (targets.length === 0) return

  saveCurrentChapter()
  const titles = targets
    .slice(0, 3)
    .map((asset) => `「${asset.title || '无标题素材'}」`)
    .join('、')
  const preview = titles ? `（${titles}${targets.length > 3 ? ' 等' : ''}）` : ''
  const ok = typeof window === 'undefined' || typeof window.confirm !== 'function'
    ? true
    : window.confirm(`删除选中的 ${targets.length} 个素材${preview}？如果它们已导入画布，对应节点、连线和时间轴引用也会移除。`)
  if (!ok) return

  const targetIds = new Set(targets.map((asset) => asset.id))
  const nextId = targetIds.has(selectedChapterId.value)
    ? chapters.value.find((asset) => !targetIds.has(asset.id))?.id || null
    : selectedChapterId.value
  let deletedCount = 0

  targetIds.forEach((assetId) => {
    const deleted = deleteNarrativeAsset(assetId)
    if (!deleted) return
    deleteAssetCanvasReferences(assetId)
    deletedCount += 1
  })

  checkedAssetIds.value = []
  if (deletedCount > 0) {
    canvasImportRevision.value += 1
  }
  loadNotes(nextId)
}

function saveCurrentChapter() {
  if (!selectedChapterId.value) return

  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (chapter) {
    chapter.title = currentChapterTitle.value
    syncFromCurrentEditor()
    chapter.content = markdownContent.value
    const presentation = mainVisualPreview.value?.presentation
    const generated = illustrationPreview.value
    if (presentation && generated?.sourceAssetId === chapter.id && generated.entry?.mediaAssetId) {
      updateMediaImagePresentation(generated.entry.mediaAssetId, presentation)
    } else if (presentation && chapter.image) {
      chapter.image = { ...chapter.image, presentation }
      updateNarrativeImagePresentation(chapter.id, presentation)
    }
    updateNarrativeAsset(chapter.id, {
      title: chapter.title,
      content: chapter.content
    })
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
  editorContent.value = markdownToHtml(text)
  renderCurrentEditor()
}

function switchEditorMode(mode) {
  if (editorMode.value === mode) return
  syncFromCurrentEditor()
  editorMode.value = mode
  if (mode !== 'wysiwyg') {
    hasSelection.value = false
  }
  if (mode === 'wysiwyg') {
    nextTick(renderCurrentEditor)
  }
  if (mode === 'preview') {
    nextTick(renderPreviewSurface)
  }
}

function syncMarkdownToEditor() {
  editorContent.value = markdownToHtml(markdownContent.value || '')
  if (editorMode.value === 'wysiwyg') renderCurrentEditor()
}

function syncFromCurrentEditor() {
  if (editorMode.value === 'wysiwyg' && editorRef.value) {
    const anchorOffset = getIllustrationAnchorOffset(editorRef.value)
    if (anchorOffset !== null && mainVisualPreview.value) {
      applyImagePresentation({ anchorOffset }, false, false, { source: 'primary', key: '' })
    }
    const cleanHtml = getEditorHtmlWithoutIllustration(editorRef.value)
    markdownContent.value = htmlToMarkdown(cleanHtml)
    editorContent.value = markdownToHtml(markdownContent.value)
    return
  }
  if (editorMode.value === 'markdown') {
    editorContent.value = markdownToHtml(markdownContent.value || '')
  }
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
  const figure = document.createElement(presentation.wrap === 'inline' ? 'span' : 'figure')
  const selectedTarget = selectedIllustrationTarget.value
  const selected = illustrationSelected.value
    && selectedTarget?.source === source
    && (source !== 'embedded' || selectedTarget.key === key)
  figure.dataset.narrativeIllustration = 'true'
  figure.dataset.imageSource = source
  if (key) figure.dataset.imageKey = key
  figure.contentEditable = 'false'
  figure.className = [
    'narrative-illustration',
    `illustration-wrap--${presentation.wrap}`,
    `illustration-align--${presentation.align}`,
    interactive ? 'is-editable' : '',
    interactive && selected ? 'is-selected' : ''
  ].filter(Boolean).join(' ')
  figure.setAttribute('aria-label', `${label}，${layoutLabel(presentation)}`)
  if (interactive) figure.title = '拖动图片移动，拖动右下角缩放，右键设置文字环绕'

  const baseWidth = imageBaseWidth(presentation.wrap)
  figure.style.width = `${Math.min(100, Math.max(16, baseWidth * presentation.scale))}%`
  figure.style.setProperty('--illustration-gap', `${presentation.textGap}px`)
  if (['behind', 'front'].includes(presentation.wrap)) {
    figure.style.left = `${presentation.positionX}%`
    figure.style.top = `${presentation.positionY}%`
  }
  if (presentation.wrap === 'tight') {
    figure.style.shapeOutside = `url(${JSON.stringify(image.src)})`
    figure.style.shapeImageThreshold = '0.12'
    figure.style.shapeMargin = `${presentation.textGap}px`
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

function markdownImageDescriptors(markdown) {
  const descriptors = []
  const occurrences = new Map()
  const visit = (tokens = []) => {
    tokens.forEach((token) => {
      if (token?.type === 'image') {
        const href = String(token.href || '')
        const mediaId = href.match(/^pinax-media:\/\/([a-zA-Z0-9_-]+)/)?.[1]
        const baseKey = mediaId
          ? `media:${mediaId}`
          : `src:${buildNarrativeAssetContentHash(href)}`
        const occurrence = occurrences.get(baseKey) || 0
        occurrences.set(baseKey, occurrence + 1)
        descriptors.push({
          key: occurrence === 0 ? baseKey : `${baseKey}:${occurrence}`,
          href,
          alt: String(token.text || '')
        })
      }
      if (Array.isArray(token?.tokens)) visit(token.tokens)
      if (Array.isArray(token?.items)) token.items.forEach((item) => visit(item.tokens || []))
    })
  }
  try {
    visit(marked.lexer(String(markdown || '')))
  } catch {
    return []
  }
  return descriptors
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

function layoutLabel(presentation) {
  const labels = {
    inline: '嵌入文字',
    square: `四周型 · ${presentation.align === 'left' ? '左' : '右'}`,
    tight: `紧密型 · ${presentation.align === 'left' ? '左' : '右'}`,
    'top-bottom': '上下型',
    behind: '衬于文字下方',
    front: '浮于文字上方'
  }
  return labels[presentation.wrap] || '图片版式'
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
  imageContextMenu.value.show = false
  selectedIllustrationTarget.value = null
  illustrationSelected.value = false
  editorRef.value?.querySelectorAll('[data-narrative-illustration]').forEach((item) => item.classList.remove('is-selected'))
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

/* ============================================================
   UI-N2: Notes Archive Drawer 局部骨架
   视觉由 kao.css 中 .theme-kao .material-drawer 等规则覆写
   ============================================================ */

.notes-content-area {
  position: relative;
  display: grid;
  /* K3 (2026-06-27): 3-col grid — drawer 260px / reading-deck 1fr /
     副阅读台 340px. 副阅读台 替代原 archive-pin 浮卡, 升为正式列. */
  grid-template-columns: 260px minmax(0, 1fr) 340px;
  flex: 1;
  overflow: hidden;
  /* UI-N3 unified paper wall — drawer / deck / sidekick all sit on
     this surface so dark mode doesn't split into "light cream drawer +
     dark center gap". Archive tokens stay cream in both light/dark,
     so this wall is the constant visual ground. */
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--archive-paper-soft) 88%, var(--archive-paper)) 0%,
      color-mix(in srgb, var(--archive-paper) 80%, var(--archive-paper-strong)) 100%);
}

.material-drawer {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* K4 (2026-06-27): .keeper-corner block removed (decorative
   档案员 role framing — CharacterPortrait + 卷数 + +号 add button).
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
    linear-gradient(105deg, color-mix(in srgb, var(--archive-paper) 32%, transparent), transparent 42%),
    var(--archive-paper-soft);
  box-shadow: 0 3px 8px color-mix(in srgb, var(--archive-ink) 11%, transparent);
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
  top: -2px;
  left: 50%;
  width: 28px;
  height: 4px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--archive-gold) 34%, var(--archive-paper));
  box-shadow: 0 1px 1px color-mix(in srgb, var(--archive-ink) 12%, transparent);
  opacity: 0.72;
  transform: translateX(-50%);
  pointer-events: none;
}

.index-card:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 70%, var(--archive-ink));
  box-shadow: 0 5px 12px color-mix(in srgb, var(--archive-ink) 15%, transparent);
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
    0 5px 12px color-mix(in srgb, var(--archive-ink) 14%, transparent);
  transform: rotate(0deg) translateY(-1px);
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
  padding: 28px 32px 24px;
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
  min-height: 460px;
  overflow: hidden;
}

.empty-archive__grid {
  display: grid;
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
  /* UI-N4: 移除旧的 border / opacity 让 kao.css 接管（@layer kao 优先级低于 scoped） */
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
  left: 32%;
  transform: translate(-50%, -50%) rotate(-3deg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 260px;
  max-width: 70%;
  padding: 32px 22px 24px;
  text-align: center;
  z-index: 4;
  background: var(--bg-secondary);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 60%, transparent);
  box-shadow:
    6px 6px 0 color-mix(in srgb, var(--archive-ink) 18%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 22%, transparent);
}

.empty-archive__tape {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 96px;
  height: 20px;
  border: 1px dashed currentColor;
  opacity: 0.5;
}

.empty-archive__title {
  font-size: 22px;
  font-weight: 400;
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
   透明 textarea 让 ruled lines 透出. 跟 Writing.vue wall__dossier
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
  /* 默认主题 (无 .theme-kao) 走 paper-soft 蓝白档案册底;
     kao.css .theme-kao .active-card 接管暖色 + ruled lines 装饰. */
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
   素材摘要 (sidekick-slip) + 小 ArchiveStrip 缩略目录. */
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

/* K3: 副阅读台底部 — 小 ArchiveStrip 缩略目录 (保留 UI-N2 archive-pin
   既有契约; 列底下的小图签, 不再是右下浮卡) */
.notes-sidekick__strip {
  border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 40%, transparent);
  padding: 10px 10px 12px;
  background: color-mix(in srgb, var(--archive-paper) 78%, transparent);
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
  /* K3 (2026-06-27): 中等屏 副阅读台 收窄到 280px, 主阅读台留更多空间 */
  .notes-content-area {
    grid-template-columns: 240px minmax(0, 1fr) 280px;
  }
}

@media (max-width: 980px) {
  /* 窄屏压缩索引列，但保留素材入口与漫画副工作台。 */
  .notes-content-area {
    grid-template-columns: 180px minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr);
  }
  .material-drawer {
    display: flex;
    width: 180px;
  }
  .archive-pin {
    grid-column: 3;
    min-height: 0;
    max-height: none;
    border-top: 0;
    border-left: 1px solid color-mix(in srgb, var(--archive-olive) 28%, transparent);
  }
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
</style>
