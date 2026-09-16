<script>
export default {
  name: 'NotesEditorWorkspace',
  props: { controller: { type: Object, required: true } },
  setup(props) { return props.controller }
}
</script>

<template>
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
</template>

<style scoped src="../../pages/Notes.scoped.css"></style>

