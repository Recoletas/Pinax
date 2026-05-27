<template>
  <div class="prose-essay-page">
    <!-- 顶部标题栏 -->
    <header class="pe-header">
      <div class="pe-header-left">
        <button class="icon-btn" @click="router.push('/')" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="pe-title">散文随笔</span>
      </div>
      <div class="pe-header-center">
        <input
          v-model="currentTopic"
          class="topic-input"
          placeholder="输入主题或草稿，生成联想卡片..."
          @keydown.enter="generateCards"
        />
        <button class="btn-primary generate-btn" @click="generateCards" :disabled="isGenerating || !currentTopic.trim()">
          {{ isGenerating ? generationMessage : (currentMode === 'directing' ? '生成分镜卡片' : '生成卡片') }}
        </button>
      </div>
      <div class="pe-header-right">
        <div class="mode-switch" role="group" aria-label="散文工作流">
          <button type="button" class="mode-label" :class="{ active: currentMode === 'writing' }" @click="currentMode = 'writing'">卡片</button>
          <button type="button" class="mode-label" :class="{ active: currentMode === 'directing' }" @click="currentMode = 'directing'">分镜</button>
        </div>
        <span class="mode-caption">
          {{ currentMode === 'directing' ? '从卡片生成分镜草稿' : '生成和整理写作卡片' }}
        </span>
        <span class="card-count">{{ cards.length }} 张{{ currentMode === 'directing' ? '分镜卡片' : '卡片' }}</span>
        <button class="icon-btn" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
          </svg>
        </button>
        <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
      </div>
    </header>

    <div class="pe-main">
      <!-- 左侧面板 -->
      <aside class="left-panel">
        <!-- 选中卡片详情面板 -->
        <div v-if="selectedCard" class="card-detail-panel">
          <div class="detail-panel-header">
            <span class="detail-panel-title">卡片详情</span>
            <span class="detail-panel-badge" :style="{ background: emotionColors[selectedCard.emotion]?.badge }">
              {{ emotionLabels[selectedCard.emotion] }}
            </span>
          </div>

          <div class="detail-panel-section">
            <label class="section-label">情绪</label>
            <div class="emotion-buttons">
              <button
                v-for="(label, key) in emotionLabels"
                :key="key"
                class="emotion-btn"
                :class="{ active: editingEmotion === key }"
                :style="{ '--emotion-color': emotionColors[key]?.badge || '#888' }"
                @click="editingEmotion = key"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <button
            v-if="currentMode === 'directing'"
            class="btn-secondary detail-btn"
            @click="showCardDetailDialog = true"
          >
            详情
          </button>

          <div class="detail-panel-actions">
            <button class="btn-accent expand-btn" @click="expandByEmotion" :disabled="isGenerating">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 6.5v7M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              基于「{{ emotionLabels[editingEmotion] }}」扩展
            </button>
            <div class="action-row">
              <button class="btn-secondary" @click="undoCard" :disabled="!canUndo()" title="撤销 (Ctrl+Z)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="btn-secondary" @click="redoCard" :disabled="!canRedo()" title="重做 (Ctrl+Y)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="btn-primary save-btn" @click="saveCardDetail">保存</button>
              <button class="btn-danger" @click="deleteCard(selectedCard.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="no-selection">
          <div class="no-selection-icon">
            <svg width="36" height="36" viewBox="0 0 48 48" fill="currentColor">
              <rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <line x1="16" y1="20" x2="32" y2="20" stroke="currentColor" stroke-width="1.5"/>
              <line x1="16" y1="28" x2="28" y2="28" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </div>
          <p>点击卡片查看详情</p>
        </div>

        <div v-if="currentMode === 'directing'" class="storyboard-version-panel">
          <div class="storyboard-version-head">
            <span class="storyboard-version-title">分镜版本</span>
            <span v-if="lastDirectorExportContext" class="storyboard-version-badge" :class="{ stale: !directorStoryboardIsCurrent }">
              {{ directorStoryboardIsCurrent ? '已同步' : '需更新' }}
            </span>
          </div>
          <p v-if="!lastDirectorExportContext" class="storyboard-version-copy">
            当前还没有分镜版本。先从卡片或时间轴生成统一分镜版本。
          </p>
          <template v-else>
            <div class="storyboard-version-stats">
              <span>{{ directorStoryboardShotCount }} 镜头</span>
              <span>版本 {{ directorStoryboardVersionLabel }}</span>
              <span>{{ directorStoryboardValidationText }}</span>
            </div>
          </template>
          <div class="storyboard-version-actions">
            <button class="btn-primary" type="button" @click="prepareDirectorStoryboardVersion" :disabled="cards.length === 0">
              生成/更新分镜版本
            </button>
            <button v-if="lastDirectorExportContext" class="btn-secondary" type="button" @click="downloadDirectorMarkdown">
              下载 Markdown
            </button>
          </div>
          <p v-if="directorStoryboardStatus" class="storyboard-version-status">{{ directorStoryboardStatus }}</p>
        </div>

        <div class="outline-section">
          <div class="outline-header">
            <span class="outline-title">{{ currentMode === 'directing' ? '时间轴' : '大纲序列' }}</span>
            <button class="add-btn" @click="addToOutline" :disabled="!selectedCard" :title="currentMode === 'directing' ? '将选中卡片加入时间轴' : '将选中卡片加入大纲'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <!-- Director mode timeline view -->
          <div v-if="currentMode === 'directing'" class="timeline-view">
            <div class="timeline-track">
              <div
                v-for="(item, index) in outline"
                :key="item.pileId || item.cardId"
                class="timeline-card"
                :class="{ active: selectedCard?.id === item.cardId }"
                :style="{ width: getTimelineCardWidth(item) + 'px' }"
                @click="jumpToCard(item.pileId ? piles.find(p => p.pileId === item.pileId)?.cardIds[0] : item.cardId)"
                draggable="true"
                @dragstart="onOutlineDragStart(index, $event)"
                @dragover.prevent="onOutlineDragOver(index)"
                @drop="onOutlineDrop(index)"
                @dragend="onOutlineDragEnd"
              >
                <div class="timeline-card-header">
                  <span class="timeline-index">{{ index + 1 }}</span>
                  <span class="timeline-duration">{{ getTimelineDuration(item) }}s</span>
                </div>
                <div class="timeline-card-content">{{ item.preview }}</div>
                <div class="timeline-card-meta" v-if="getCardExtraFields(item.cardId)">
                  <span v-if="getCardExtraFields(item.cardId).shotType">{{ getShotTypeLabel(getCardExtraFields(item.cardId).shotType) }}</span>
                </div>
              </div>
              <div v-if="outline.length === 0" class="timeline-empty">
                点击 + 将卡片加入时间轴
              </div>
            </div>
            <!-- Audio track layer -->
            <div class="audio-track">
              <div class="audio-track-label">音轨</div>
              <div class="audio-track-content">
                <!-- Placeholder for audio markers -->
              </div>
            </div>
          </div>

          <!-- Writing mode outline list -->
          <div v-else class="outline-list" ref="outlineListRef">
            <div
              v-for="(item, index) in outline"
              :key="item.pileId || item.cardId"
              class="outline-item"
              :class="{ active: selectedCard?.id === item.cardId, 'outline-dragging': draggingOutlineIndex === index, 'is-pile-item': !!item.pileId }"
              :draggable="true"
              @click="jumpToCard(item.pileId ? piles.find(p => p.pileId === item.pileId)?.cardIds[0] : item.cardId)"
              @dragstart="onOutlineDragStart(index, $event)"
              @dragover.prevent="onOutlineDragOver(index)"
              @drop="onOutlineDrop(index)"
              @dragend="onOutlineDragEnd"
              @dblclick="item.pileId ? startPileInlineEdit(piles.find(p => p.pileId === item.pileId), $event) : null"
            >
              <div class="outline-node-col">
                <div class="outline-node-line" :class="{ 'is-last': index === outline.length - 1 }"></div>
                <div class="outline-node-dot"></div>
              </div>
              <span class="drag-handle" title="拖拽排序">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/>
                  <circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/>
                </svg>
              </span>
              <span class="outline-emotion" :style="{ background: emotionColors[item.emotion]?.dot || '#888' }"></span>
              <template v-if="inlineEditingPile?.pileId === item.pileId">
                <input
                  v-model="inlineEditingPileName"
                  class="inline-pile-input"
                  type="text"
                  placeholder="给牌堆添加说明..."
                  @keydown.enter="savePileInlineEdit(); $event.target.blur()"
                  @keydown.escape="cancelPileInlineEdit"
                  @blur="savePileInlineEdit"
                  @click.stop
                />
              </template>
              <span v-else class="outline-text">{{ item.preview }}</span>
              <div class="outline-item-actions">
                <button class="outline-action-btn" @click.stop="moveOutlineUp(index)" :disabled="index === 0" title="上移">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2 8l4-4 4 4"/>
                  </svg>
                </button>
                <button class="outline-action-btn" @click.stop="moveOutlineDown(index)" :disabled="index === outline.length - 1" title="下移">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2 4l4 4 4-4"/>
                  </svg>
                </button>
                <button class="outline-action-btn outline-delete-btn" @click.stop="removeCardFromOutline(item.pileId || item.cardId)" title="移除">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2 2l8 8M10 2l-8 8"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="outline.length === 0" class="outline-empty">
              点击卡片旁的 + 加入大纲
            </div>
          </div>
        </div>
      </aside>

      <!-- Canvas area with absolute positioned cards -->
      <div class="card-wall" ref="cardWallRef" :class="{ 'has-cards': flatCards.length }" @dragover.prevent="onCardWallDragOver" @drop="onCardWallDrop">
        <!-- Edge SVG layer - absolutely positioned to overlay cards -->
        <svg class="edge-layer" :width="canvasWidth" :height="canvasHeight">
          <defs>
            <marker id="prose-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor"/>
            </marker>
          </defs>
          <path
            v-for="edge in renderedEdges"
            :key="edge.id"
            :d="edge.d"
            :class="['edge', `edge-${edge.type}`, getEdgeClass(edge.type)]"
            :style="getEdgeStyle(edge)"
            marker-end="url(#prose-arrow)"
          />
        </svg>

        <div v-if="cards.length === 0" class="empty-cards">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
              <path d="M8 8h14v32H8V8zm18 0h14v32H26V8zM12 14h6v4h-6v-4zm0 10h10v4H12v-4zm0 10h8v4h-8v-4z"/>
            </svg>
          </div>
          <p class="empty-title">{{ currentMode === 'directing' ? '还没有分镜卡片' : '开始卡片构思' }}</p>
          <p class="empty-desc">
            {{ currentMode === 'directing' ? '输入主题或草稿，生成可落入分镜草稿的卡片' : '输入主题或草稿，AI 将生成一组联想卡片' }}
          </p>
          <p class="empty-hint">
            {{ currentMode === 'directing' ? '生成后可加入时间轴并导出统一分镜' : '输入主题或草稿，AI 将生成联想卡片' }}
          </p>
        </div>

        <!-- Absolute positioned cards -->
        <div
          v-for="card in flatCards"
          :key="card.id"
          class="writing-card"
          :class="[`emotion-${card.emotion}`, { selected: selectedCard?.id === card.id, 'inline-editing': inlineEditingCard?.id === card.id, 'continuation-child': isInSameGroup(card.id) }]"
          :style="{
            position: 'absolute',
            left: card.x + 'px',
            top: card.y + 'px',
            '--card-accent': emotionColors[card.emotion]?.bg || '#888',
            zIndex: card.zIndex || 1,
            transform: card.rotate ? `rotate(${card.rotate}deg)` : undefined
          }"
          @mouseenter="card.pileId && (hoveredPileId = card.pileId)"
          @mouseleave="card.pileId && (hoveredPileId = null)"
          @click.stop="card.pileId && (expandedPileId = expandedPileId === card.pileId ? null : card.pileId)"
          :data-card-id="card.id"
          draggable="true"
          @click="selectCard(card)"
          @dblclick="startInlineEdit(card, $event)"
          @dragstart="onCardDragStart(card, $event)"
          @dragover.prevent="onCardDragOver(card, $event)"
          @drop="onCardDrop(card, $event)"
          @dragend="onCardDragEnd"
        >
          <div class="card-header">
            <span class="card-emotion-badge" :style="{ background: emotionColors[card.emotion]?.badge || '#888' }">
              {{ emotionLabels[card.emotion] || card.emotion }}
            </span>
            <span v-if="currentMode === 'directing' && card.extraFields?.shotType" class="card-shot-badge" :title="'景别: ' + getShotTypeLabel(card.extraFields.shotType)">
              {{ getShotTypeLabel(card.extraFields.shotType) }}
            </span>
            <span v-if="currentMode === 'directing' && card.extraFields?.duration" class="card-duration-badge">
              {{ card.extraFields.duration }}s
            </span>
            <span v-if="getContinuationGroup(card.id)?.size" class="continuation-indicator" title="已生成延伸卡片">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M5 1v4M3.5 3.5L5 5l1.5-1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </span>
            <span v-else-if="isInSameGroup(card.id)" class="continuation-badge">衍生</span>
            <span class="card-time">{{ formatTime(card.createdAt) }}</span>
          </div>
          <div v-if="inlineEditingCard?.id === card.id" class="card-inline-edit">
            <textarea
              v-model="inlineEditingContent"
              class="inline-textarea"
              @click.stop
              @keydown="handleInlineKeydown"
              autofocus
            ></textarea>
            <div class="inline-emotion-row">
              <select v-model="inlineEditingEmotion" class="inline-emotion-select">
                <option v-for="(label, key) in emotionLabels" :key="key" :value="key">{{ label }}</option>
              </select>
              <button class="inline-save-btn" @click.stop="saveInlineEdit" title="保存 (Ctrl+Enter)">保存</button>
              <button class="inline-cancel-btn" @click.stop="cancelInlineEdit" title="取消 (Esc)">取消</button>
            </div>
          </div>
          <div v-else class="card-content">{{ card.content }}</div>
          <div v-if="card.attachedImages?.length" class="card-images" @click.stop>
            <div v-for="(img, idx) in card.attachedImages" :key="img.id" class="card-image-item" @click="openImagePreview(card, idx)">
              <img :src="img.data" :alt="'图片' + (idx + 1)" />
            </div>
          </div>
          <div class="card-footer">
            <span class="card-words">{{ card.wordCount }} 字</span>
            <div class="card-actions" @click.stop>
              <button class="card-action-btn" @click.stop="expandFromCard(card)" :disabled="isGenerating" title="基于此卡片生成更多">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 6.5v7M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="card-action-btn" @click.stop="deleteCard(card.id)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M5 6v14a2 2 0 002 2h10a2 2 0 002-2V6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div v-if="card.pileId" class="pile-badge" :title="'牌堆 #' + card.pileId.split('_')[1]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="4" width="10" height="7" rx="1"/><rect x="2" y="2" width="8" height="5" rx="1" opacity="0.7"/><rect x="3" y="0" width="6" height="3" rx="1" opacity="0.4"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右下角悬浮工具栏 -->
    <div class="floating-toolbar">
      <button class="toolbar-btn" @click="confirmClearAll" title="清空所有卡片">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="insertCard" title="新建空白卡片">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn export-btn" @click="showExportMenu = !showExportMenu" title="导出">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M7 8l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div v-if="showExportMenu" class="export-menu">
        <button @click="exportToMarkdown">{{ currentMode === 'directing' ? '生成/更新分镜版本' : '导出为 Markdown' }}</button>
        <button v-if="currentMode === 'directing' && lastDirectorExportContext" @click="downloadDirectorMarkdown">下载分镜 Markdown</button>
        <button @click="exportToTxt">导出为 TXT</button>
        <button @click="exportToJson">导出完整关系网 JSON</button>
        <button v-if="currentMode === 'directing'" @click="exportToPremiereFormat">剪映/Premiere 格式</button>
      </div>
    </div>

    <!-- 生图悬浮按钮 -->
    <aside class="image-gen-rail" aria-label="生图功能">
      <div class="image-gen-drawer" v-if="imageDrawerOpen" @click.stop>
        <div class="image-gen-header">
          <span class="image-gen-title">生图</span>
          <button class="image-gen-config-btn" type="button" @click="openImageConfig" title="模型配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </button>
        </div>

        <div class="image-gen-prompt-row">
          <textarea
            v-model="imagePrompt"
            class="image-gen-prompt-input"
            placeholder="描述你想生成的图片..."
            rows="3"
          ></textarea>
        </div>

        <div class="image-gen-prompt-row" v-if="selectedCard">
          <button class="image-gen-use-card-btn" type="button" @click="useCardContentAsPrompt">
            使用卡片内容
          </button>
        </div>

        <div class="image-gen-section">
          <label class="image-gen-label">模型</label>
          <div class="image-gen-model-row">
            <select v-model="imageSelectedModel" class="image-gen-select">
              <option value="">选择模型...</option>
              <option v-for="cfg in modelConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
            </select>
            <button v-if="imageSelectedModel" class="image-gen-edit-model-btn" type="button" @click="editSelectedModel" title="编辑模型">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="image-gen-section">
          <label class="image-gen-label">尺寸</label>
          <div class="image-gen-sizes">
            <button
              v-for="preset in sizePresets"
              :key="preset.label"
              class="image-gen-size-btn"
              :class="{ active: imageWidth === preset.width && imageHeight === preset.height }"
              type="button"
              @click="imageWidth = preset.width; imageHeight = preset.height"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <div class="image-gen-section">
          <label class="image-gen-label">数量</label>
          <div class="image-gen-count-row">
            <button
              v-for="n in [1,2,3,4]"
              :key="n"
              class="image-gen-count-btn"
              :class="{ active: imageCount === n }"
              type="button"
              @click="imageCount = n"
            >{{ n }}</button>
          </div>
        </div>

        <div class="image-gen-section">
          <label class="image-gen-label">负面提示词（可选）</label>
          <textarea
            v-model="imageNegativePrompt"
            class="image-gen-prompt-input small"
            placeholder="不想出现的内容..."
            rows="2"
          ></textarea>
        </div>

        <div class="image-gen-actions">
          <button
            class="image-gen-generate-btn"
            type="button"
            @click="generateImages"
            :disabled="imageGenerating || !imagePrompt.trim() || !imageSelectedModel"
          >
            <span v-if="imageGenerating" class="spin-icon">⟳</span>
            <span v-else>生成</span>
          </button>
        </div>

        <div v-if="imageLibrary.length > 0" class="image-gen-results">
          <div class="image-gen-results-title">历史记录</div>
          <div class="image-gen-grid">
            <div
              v-for="(img, idx) in imageLibrary"
              :key="img.id"
              class="image-gen-thumb"
              @click="imagePreviewIndex = idx"
            >
              <img :src="img.data" alt="generated" />
            </div>
          </div>
        </div>

        <div class="image-gen-footer">
          <button class="image-gen-link-btn" type="button" @click="goToMaterialsImageGen">去素材内生图 →</button>
        </div>
      </div>

      <button class="image-gen-btn" type="button" @click.stop="imageDrawerOpen = !imageDrawerOpen" title="生图">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      </button>
    </aside>

    <!-- 图片预览弹窗 -->
    <div v-if="imagePreviewIndex >= 0" class="image-preview-overlay" @click="imagePreviewIndex = -1">
      <div class="image-preview-modal" @click.stop>
        <div class="image-preview-header">
          <span>图片预览</span>
          <button class="image-preview-close" @click="imagePreviewIndex = -1">×</button>
        </div>
        <div class="image-preview-body">
          <img :src="imageLibrary[imagePreviewIndex]?.data" alt="preview" />
        </div>
        <div class="image-preview-actions">
          <button v-if="selectedCard" class="image-preview-action-btn" @click="attachImageToCard(imageLibrary[imagePreviewIndex])">
            插入当前卡片
          </button>
          <button class="image-preview-action-btn" @click="saveAsNewCard(imageLibrary[imagePreviewIndex])">
            存为新素材卡片
          </button>
          <button class="image-preview-action-btn" @click="copyImagePrompt(imageLibrary[imagePreviewIndex])">
            复制提示词
          </button>
          <button class="image-preview-action-btn" @click="saveToMaterialLib(imageLibrary[imagePreviewIndex])">
            保存到素材库
          </button>
        </div>
      </div>
    </div>

    <!-- 模型配置弹窗 -->
    <div v-if="showImageConfigDialog && editingModelConfig" class="dialog-overlay" @click="showImageConfigDialog = false">
      <div class="dialog image-config-dialog" @click.stop>
        <div class="dialog-header">
          {{ editingModelConfig.id ? '编辑模型' : '添加模型' }}
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>名称</label>
            <input v-model="editingModelConfig.name" class="input" placeholder="例如：我的SD" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="editingModelConfig.type" class="input">
              <option v-for="t in modelTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="editingModelConfig.baseUrl" class="input" placeholder="http://127.0.0.1:7860" />
          </div>
          <div class="form-group">
            <label>API Key（可选）</label>
            <input v-model="editingModelConfig.apiKey" class="input" type="password" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>默认模型 ID</label>
            <input v-model="editingModelConfig.defaultModel" class="input" placeholder="stable-diffusion-xl-base-1.0" />
          </div>
          <div v-if="editingModelConfig.type === 'http'" class="form-group">
            <label>请求体模板（JSON）</label>
            <textarea v-model="editingModelConfig.requestTemplate" class="input" rows="3" placeholder='{"prompt": "{{prompt}}"}'></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn" type="button" @click="testModelConnection">测试连通性</button>
          <button class="btn" type="button" @click="showImageConfigDialog = false">取消</button>
          <button class="btn-primary" type="button" @click="saveModelConfig">保存</button>
        </div>
      </div>
    </div>

    <!-- 卡片详情对话框（分镜模式） -->
    <div v-if="showCardDetailDialog && selectedCard" class="dialog-overlay" @click="showCardDetailDialog = false">
      <div class="dialog" @click.stop>
        <div class="dialog-header">卡片详情</div>
        <div class="dialog-body">
          <div class="form-group">
            <label>景别</label>
            <select v-model="editingShotType" class="input">
              <option value="">选择景别...</option>
              <option v-for="s in shotTypes" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>运镜</label>
            <select v-model="editingCameraMovement" class="input">
              <option value="">选择运镜...</option>
              <option v-for="m in cameraMovements" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>时长（秒）</label>
            <input v-model.number="editingDuration" type="number" min="1" max="300" class="input" placeholder="3" />
          </div>

          <div class="form-group">
            <label>台词</label>
            <textarea v-model="editingDialogue" class="input" rows="2" placeholder="角色台词..."></textarea>
          </div>

          <div class="form-group">
            <label>音效</label>
            <textarea v-model="editingSoundEffects" class="input" rows="2" placeholder="环境音、音乐..."></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn" @click="showCardDetailDialog = false">关闭</button>
        </div>
      </div>
    </div>

      <!-- 创作顾问悬浮按钮 -->
      <button class="advisor-fab" @click="openAdvisor" title="打开创作顾问">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5"></circle>
          <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
        </svg>
      </button>

      <AdvisorPanel
        :isOpen="advisorOpen"
        :messages="advisorMessages"
        :loading="advisorLoading"
        :quickQuestions="['分析当前节奏', '情绪分布如何', '结构建议', '续写灵感']"
        :emptyText="'创作顾问可帮你分析散文随笔的状态，提供结构、情绪与推进方向的专业建议。'"
        @close="closeAdvisor"
        @ask="handleAskAdvisor"
      />
    </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { getResolvedApiSettings, recordPreference } from '../services/api'
import { useAdvisor } from '../composables/useAdvisor'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import {
  saveValidatedStoryboardVersion
} from '../services/storyboardStore'
import {
  generateProseCardExtensions,
  generateProseCardsFromTopic,
  generateProseEmotionExtensions
} from '../services/proseGeneration'
import {
  extractShotsFromProseEssay,
  toMarkdown,
  toPremiereCSV
} from '../services/shotExporter'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { advisorOpen, advisorMessages, advisorLoading, askAdvisor, openAdvisor, closeAdvisor } = useAdvisor()

// Mode switching
const currentMode = ref('writing') // 'writing' | 'directing'

// Director mode edge types
const directorEdgeTypes = [
  { value: 'jump_cut', label: '跳切', desc: '快速切换场景', color: '#ff7043' },
  { value: 'dissolve', label: '叠化', desc: '画面渐变过渡', color: '#ab47bc' },
  { value: 'fade', label: '淡入淡出', desc: '淡出到黑或白', color: '#78909c' },
  { value: 'contrast_montage', label: '对比蒙太奇', desc: '对比性剪辑', color: '#ef5350' },
  { value: 'cross_cut', label: '交叉剪辑', desc: '平行事件交替', color: '#26c6da' },
  { value: 'match_cut', label: '匹配剪辑', desc: '相似性转场', color: '#66bb6a' }
]

// Director mode shot options
const shotTypes = [
  { value: 'extreme_wide', label: '极远景' },
  { value: 'wide', label: '远景' },
  { value: 'full', label: '全景' },
  { value: 'medium_wide', label: '中远景' },
  { value: 'medium', label: '中景' },
  { value: 'medium_close', label: '中近景' },
  { value: 'close_up', label: '近景' },
  { value: 'extreme_close_up', label: '特写' },
  { value: 'two_shot', label: '双人镜头' },
  { value: 'over_shoulder', label: '过肩镜头' },
  { value: 'pov', label: '主观镜头' },
  { value: 'aerial', label: '航拍' }
]

const cameraMovements = [
  { value: 'static', label: '固定' },
  { value: 'pan', label: '横摇' },
  { value: 'tilt', label: '竖摇' },
  { value: 'dolly', label: '推拉' },
  { value: 'track', label: '轨道' },
  { value: 'crane', label: '升降' },
  { value: 'zoom', label: '变焦' },
  { value: 'handheld', label: '手持' },
  { value: 'steadicam', label: '稳定器' },
  { value: 'spin', label: '旋转' },
  { value: 'tilt_up', label: '仰拍' },
  { value: 'tilt_down', label: '俯拍' }
]

// Image generation
const IMG_LIBRARY_KEY = STORAGE_KEYS.PROSE_IMAGE_LIBRARY
const IMG_MODEL_CONFIGS_KEY = STORAGE_KEYS.IMAGE_MODEL_CONFIGS
const imageDrawerOpen = ref(false)
const imagePrompt = ref('')
const imageNegativePrompt = ref('')
const imageSelectedModel = ref('')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageCount = ref(1)
const imageGenerating = ref(false)
const imageLibrary = ref([])
const imagePreviewIndex = ref(-1)
const previewingCard = ref(null)
const showImageConfigDialog = ref(false)
const showCardDetailDialog = ref(false)
const editingModelConfig = ref(null)
const modelConfigs = ref([])

// Image size presets
const sizePresets = [
  { label: '1:1 方图', width: 1024, height: 1024 },
  { label: '16:9 宽图', width: 1280, height: 720 },
  { label: '9:16 竖图', width: 720, height: 1280 },
  { label: '4:3 横图', width: 1024, height: 768 },
  { label: '3:4 竖图', width: 768, height: 1024 },
]

// Model types
const modelTypes = [
  { value: 'openai_dalle', label: 'OpenAI DALL-E' },
  { value: 'stability', label: 'Stability AI' },
  { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'http', label: '通用 HTTP' },
]

// Storage keys
const CARDS_KEY = STORAGE_KEYS.PROSE_CARDS_V1
const EDGES_KEY = STORAGE_KEYS.PROSE_EDGES_V1
const OUTLINE_KEY = STORAGE_KEYS.PROSE_OUTLINE_V1
const TIMELINE_KEY = STORAGE_KEYS.PROSE_TIMELINE_V1
const PILES_KEY = STORAGE_KEYS.PROSE_PILES_V1
const COMMITS_KEY = STORAGE_KEYS.PROSE_COMMITS_V1
const BRANCHES_KEY = STORAGE_KEYS.PROSE_BRANCHES_V1

// Emotion config
const emotionLabels = {
  joy: '喜悦',
  sorrow: '忧伤',
  calm: '平静',
  anxiety: '焦虑',
  anger: '愤怒',
  surprise: '惊艳',
  nostalgia: '怀旧',
  hope: '希望'
}

const emotionColors = {
  joy: { bg: 'var(--bg-secondary)', badge: '#ffb300', dot: '#ffc107' },
  sorrow: { bg: 'var(--bg-secondary)', badge: '#5c6bc0', dot: '#7986cb' },
  calm: { bg: 'var(--bg-secondary)', badge: '#66bb6a', dot: '#81c784' },
  anxiety: { bg: 'var(--bg-secondary)', badge: '#ec407a', dot: '#f06292' },
  anger: { bg: 'var(--bg-secondary)', badge: '#ef5350', dot: '#e57373' },
  surprise: { bg: 'var(--bg-secondary)', badge: '#ff7043', dot: '#ff8a65' },
  nostalgia: { bg: 'var(--bg-secondary)', badge: '#ab47bc', dot: '#ba68c8' },
  hope: { bg: 'var(--bg-secondary)', badge: '#26c6da', dot: '#4dd0e1' }
}

const edgeColors = {
  consciousness: 'var(--accent)',
  contrast: '#ef5350',
  elaboration: '#66bb6a',
  parallel: '#ab47bc',
  continuation: 'var(--accent)'
}

// Edge types
const edgeTypes = [
  { value: 'consciousness', label: '意识流', desc: '随心联想，跳跃连接' },
  { value: 'contrast', label: '对比', desc: '相互映衬或冲突' },
  { value: 'elaboration', label: '阐释', desc: '观点到事例的深化' },
  { value: 'parallel', label: '平行', desc: '不同时空的并置' },
  { value: 'continuation', label: '延续', desc: '基于某卡片的衍生扩展' }
]

// Cycling messages during generation
const generationMessages = [
  '正在捕捉灵感…',
  '正在组织词句…',
  '正在编织意象…',
  '正在追寻意境…',
  '正在梳理思绪…',
  '正在体察情感…',
  '正在挥洒文墨…',
  '正在沉淀感悟…'
]
let generationMsgIndex = 0
let generationMsgTimer = null

// State
const cards = ref([])
const edges = ref([])
const outline = ref([])
const timeline = ref([])
const currentTopic = ref('')
const selectedCard = ref(null)
const editingContent = ref('')
const editingEmotion = ref('calm')
const isGenerating = ref(false)
const generationMessage = ref('正在捕捉灵感…')
const showEdgeDialog = ref(false)
const newEdgeType = ref('consciousness')
const newEdgeTarget = ref('')
const showExportMenu = ref(false)
const cardWallRef = ref(null)
const edgesSvgRef = ref(null)
const apiSettings = ref(null)
const canvasWidth = ref(1200)
const canvasHeight = ref(800)

// Director mode editing
const editingShotType = ref('')
const editingCameraMovement = ref('')
const editingDuration = ref(3)
const editingDialogue = ref('')
const editingSoundEffects = ref('')

// Piles
const piles = ref([])
const hoveredPileId = ref(null)
const expandedPileId = ref(null)
const draggingCardId = ref(null)

// Git-style commits (renamed to avoid conflicts)
const proseCommits = ref([])
const proseBranches = ref({ current: 'main', list: [{ name: 'main', headCommitId: null }] })

// Flat positioned nodes for rendering
const flatCards = ref([])

function layoutCards(cardsToLayout) {
  if (!cardWallRef.value) return
  const xGap = 320
  const yGap = 200
  const topBase = 60
  const leftBase = 60
  const maxPerRow = Math.floor((cardWallRef.value.scrollWidth - leftBase * 2) / xGap) || 3

  // Group cards by pile - use pile.cardIds order directly
  const pileGroups = {}
  const pileCenters = {}
  piles.value.forEach(pile => {
    if (pile.cardIds && pile.cardIds.length > 0) {
      pileGroups[pile.pileId] = [...pile.cardIds]
      pileCenters[pile.pileId] = { x: pile.pileX, y: pile.pileY }
    }
  })

  return cardsToLayout.map((card, idx) => {
    const col = idx % maxPerRow
    const row = Math.floor(idx / maxPerRow)
    const baseX = card.x ?? (leftBase + col * xGap)
    const baseY = card.y ?? (topBase + row * yGap)

    let zIndex = 1
    let rotate = 0
    let finalX = baseX
    let finalY = baseY

    if (card.pileId && pileGroups[card.pileId]) {
      const cardIdsInPile = pileGroups[card.pileId]
      const posInPile = cardIdsInPile.indexOf(card.id)
      const pileCenter = pileCenters[card.pileId]

      const isHovered = hoveredPileId.value === card.pileId
      const isExpanded = expandedPileId.value === card.pileId

      if (isHovered || isExpanded) {
        // Fan arrangement - host card (pos 0) stays straight, others fan out
        const total = cardIdsInPile.length
        const fanStep = 10 // degrees between cards
        const fanRadius = isExpanded ? 250 : 150
        const startAngle = -((total - 1) / 2) * fanStep
        const angle = startAngle + posInPile * fanStep

        zIndex = 10 + posInPile // first added (pos0) = bottom, last added (top)
        rotate = posInPile === 0 ? 0 : angle // host card stays straight

        const rad = (angle * Math.PI) / 180
        finalX = pileCenter.x + Math.sin(rad) * fanRadius
        finalY = pileCenter.y - Math.cos(rad) * fanRadius + fanRadius
      } else {
        // Collapsed pile - stack near pile center, host card on bottom
        zIndex = 10 + posInPile
        rotate = posInPile === 0 ? 0 : (posInPile % 2 === 0 ? 1 : -1) * (posInPile * 2)
        finalX = pileCenter.x + (posInPile % 3) * 12 - 6
        finalY = pileCenter.y - posInPile * 16
      }
    }

    return { ...card, x: finalX, y: finalY, zIndex, rotate }
  })
}

function makeEdgePath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1)
  const bend = Math.min(120, Math.max(40, dx * 0.4))
  const c1x = x1 + bend
  const c2x = x2 - bend
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}

function computeEdgePaths() {
  const wall = cardWallRef.value
  if (!wall) return []
  return edges.value.map(edge => {
    const sourceEl = wall.querySelector(`[data-card-id="${edge.sourceId}"]`)
    const targetEl = wall.querySelector(`[data-card-id="${edge.targetId}"]`)
    if (!sourceEl || !targetEl) return null
    const sx = sourceEl.offsetLeft + sourceEl.offsetWidth
    const sy = sourceEl.offsetTop + sourceEl.offsetHeight / 2
    const tx = targetEl.offsetLeft
    const ty = targetEl.offsetTop + targetEl.offsetHeight / 2
    return {
      ...edge,
      d: makeEdgePath(sx, sy, tx, ty),
      x1: sx, y1: sy, x2: tx, y2: ty
    }
  }).filter(Boolean)
}

const renderedEdges = ref([])

function updateLayout() {
  flatCards.value = layoutCards(cards.value)
  if (!cards.value.length) {
    renderedEdges.value = []
    return
  }
  nextTick(() => {
    renderedEdges.value = computeEdgePaths()
    const wall = cardWallRef.value
    if (wall) {
      canvasWidth.value = Math.max(wall.scrollWidth, wall.clientWidth) + 100
      canvasHeight.value = Math.max(wall.scrollHeight, wall.clientHeight) + 100
    }
  })
}

watch(cards, () => {
  updateLayout()
}, { deep: true })

watch(hoveredPileId, () => updateLayout())
watch(expandedPileId, () => updateLayout())

// Per-card undo/redo history
const cardHistory = ref({}) // cardId -> { past: [], future: [] }
const inlineEditingCard = ref(null) // card being edited inline
const inlineEditingContent = ref('')
const inlineEditingEmotion = ref('calm')
const inlineEditingPile = ref(null) // pile being edited inline
const inlineEditingPileName = ref('')

// Continuation groups (sourceId -> Set of cardIds)
const continuationGroups = ref({})

function getContinuationGroup(sourceId) {
  return continuationGroups.value[sourceId] || null
}

function isInSameGroup(cardId) {
  if (!selectedCard.value) return false
  const group = continuationGroups.value[selectedCard.value.id]
  if (!group) return false
  return group.has(cardId)
}

function computeEdgePositions() {
  const wall = cardWallRef.value
  if (!wall) return
  const newEdges = []
  edges.value.forEach(edge => {
    const sourceEl = wall.querySelector(`[data-card-id="${edge.sourceId}"]`)
    const targetEl = wall.querySelector(`[data-card-id="${edge.targetId}"]`)
    if (!sourceEl || !targetEl) return
    const sx = sourceEl.offsetLeft + sourceEl.offsetWidth / 2
    const sy = sourceEl.offsetTop + sourceEl.offsetHeight
    const tx = targetEl.offsetLeft + targetEl.offsetWidth / 2
    const ty = targetEl.offsetTop
    newEdges.push({ ...edge, x1: sx, y1: sy, x2: tx, y2: ty })
  })
  renderedEdges.value = newEdges
}

function getRelatedCards(cardId) {
  const related = []
  edges.value.forEach(e => {
    if (e.sourceId === cardId) {
      const target = cards.value.find(c => c.id === e.targetId)
      if (target) related.push(target)
    } else if (e.targetId === cardId) {
      const source = cards.value.find(c => c.id === e.sourceId)
      if (source) related.push(source)
    }
  })
  return related
}

function pushHistory(cardId, content, emotion) {
  if (!cardHistory.value[cardId]) {
    cardHistory.value[cardId] = { past: [], future: [] }
  }
  cardHistory.value[cardId].past.push({ content, emotion })
  cardHistory.value[cardId].future = []
  if (cardHistory.value[cardId].past.length > 50) {
    cardHistory.value[cardId].past.shift()
  }
}

function undoCard() {
  if (!selectedCard.value) return
  const hid = cardHistory.value[selectedCard.value.id]
  if (!hid || hid.past.length === 0) return
  const current = { content: editingContent.value, emotion: editingEmotion.value }
  hid.future.unshift(current)
  const prev = hid.past.pop()
  editingContent.value = prev.content
  editingEmotion.value = prev.emotion
}

function redoCard() {
  if (!selectedCard.value) return
  const hid = cardHistory.value[selectedCard.value.id]
  if (!hid || hid.future.length === 0) return
  const current = { content: editingContent.value, emotion: editingEmotion.value }
  hid.past.push(current)
  const next = hid.future.shift()
  editingContent.value = next.content
  editingEmotion.value = next.emotion
}

function canUndo() {
  if (!selectedCard.value) return false
  const hid = cardHistory.value[selectedCard.value.id]
  return hid && hid.past.length > 0
}

function canRedo() {
  if (!selectedCard.value) return false
  const hid = cardHistory.value[selectedCard.value.id]
  return hid && hid.future.length > 0
}

function startInlineEdit(card, e) {
  e.stopPropagation()
  e.preventDefault()
  inlineEditingCard.value = card
  inlineEditingContent.value = card.content
  inlineEditingEmotion.value = card.emotion
  if (!cardHistory.value[card.id]) {
    cardHistory.value[card.id] = { past: [], future: [] }
  }
}

function saveInlineEdit() {
  if (!inlineEditingCard.value) return
  const card = cards.value.find(c => c.id === inlineEditingCard.value.id)
  if (!card) return
  const previousEmotion = card.emotion
  pushHistory(inlineEditingCard.value.id, card.content, card.emotion)
  card.content = inlineEditingContent.value
  card.emotion = inlineEditingEmotion.value
  card.wordCount = countWords(inlineEditingContent.value)
  card.updatedAt = new Date().toISOString()
  addTimeline('更新卡片')
  saveData()

  if (card.emotion !== previousEmotion) {
    trackPreference('emotion_changed', card)
  }

  inlineEditingCard.value = null
}

function cancelInlineEdit() {
  inlineEditingCard.value = null
}

function startPileInlineEdit(pile, e) {
  e.stopPropagation()
  e.preventDefault()
  inlineEditingPile.value = pile
  inlineEditingPileName.value = pile.name || ''
}

function savePileInlineEdit() {
  if (!inlineEditingPile.value) return
  const pile = piles.value.find(p => p.pileId === inlineEditingPile.value.pileId)
  if (pile) {
    pile.name = inlineEditingPileName.value
    // update outline preview
    outline.value.forEach(o => {
      if (o.pileId === pile.pileId) {
        o.preview = pile.name ? pile.name : `[牌堆 ${pile.cardIds.length}张]`
      }
    })
    createSnapshot('更新牌堆')
    saveData()
  }
  inlineEditingPile.value = null
}

function cancelPileInlineEdit() {
  inlineEditingPile.value = null
}

function handleInlineKeydown(e) {
  if (e.key === 'Escape') {
    cancelInlineEdit()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    saveInlineEdit()
  }
}

onMounted(async () => {
  loadData()
  apiSettings.value = await getResolvedApiSettings()
  document.addEventListener('keydown', handleKeydown)
  loadImageConfigs()
  loadImageLibrary()
})

// Advisor functions
function collectProseContext() {
  return {
    mode: currentMode.value,
    cards: flatCards.value.map(c => ({
      id: c.id,
      content: c.content,
      emotion: c.emotion,
      extraFields: c.extraFields || null
    })),
    edges: edges.value.map(e => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      type: e.type
    })),
    outline: outline.value,
    timeline: currentMode.value === 'directing' ? timeline.value : null
  }
}

function handleAskAdvisor(question) {
  askAdvisor(question, collectProseContext)
}

// Data operations
function inferZone(cardId) {
  return outline.value.some(o => o.cardId === cardId) ? 'editing' : 'material'
}

function loadData() {
  try {
    const rawCards = getItem(CARDS_KEY) || []
    edges.value = getItem(EDGES_KEY) || []
    outline.value = getItem(OUTLINE_KEY) || []
    timeline.value = getItem(TIMELINE_KEY) || []

    cards.value = rawCards.map((card, idx) => ({
      ...card,
      pileId: card.pileId || null,
      zone: card.zone || inferZone(card.id),
      x: card.x ?? (60 + (idx % 3) * 320),
      y: card.y ?? (60 + Math.floor(idx / 3) * 200),
      extraFields: card.extraFields || null
    }))

    piles.value = getItem(PILES_KEY) || []
    proseCommits.value = getItem(COMMITS_KEY) || []
    proseBranches.value = getItem(BRANCHES_KEY) || { current: 'main', list: [{ name: 'main', headCommitId: null }] }
  } catch {
    cards.value = []
    edges.value = []
    outline.value = []
    timeline.value = []
  }
  nextTick(() => updateLayout())
}

function saveData() {
  setItem(CARDS_KEY, cards.value)
  setItem(EDGES_KEY, edges.value)
  setItem(OUTLINE_KEY, outline.value)
  setItem(TIMELINE_KEY, timeline.value)
  setItem(PILES_KEY, piles.value)
  setItem(COMMITS_KEY, proseCommits.value.slice(0, 50))
  setItem(BRANCHES_KEY, proseBranches.value)
  nextTick(() => computeEdgePositions())
}

function addTimeline(action) {
  timeline.value.push({
    id: Date.now(),
    action,
    at: new Date().toISOString()
  })
  saveData()
}

function formatTime(isoString) {
  const d = new Date(isoString)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function countWords(text) {
  return String(text).replace(/\s/g, '').length
}

function trackPreference(action, card) {
  if (!card) return

  const normalizedCard = {
    id: card.id || '',
    content: String(card.content || '').trim(),
    emotion: String(card.emotion || '').trim()
  }

  if (!normalizedCard.content) return

  void recordPreference({
    action,
    card: normalizedCard
  })
}

// Card operations
function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undoCard()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redoCard()
  }
}

function getShotTypeLabel(shotType) {
  const found = shotTypes.find(s => s.value === shotType)
  return found ? found.label : shotType
}

function getTimelineCardWidth(item) {
  const extra = getCardExtraFields(item.cardId)
  const duration = extra?.duration || 3
  return Math.max(80, duration * 20) // 20px per second, minimum 80px
}

function getTimelineDuration(item) {
  const extra = getCardExtraFields(item.cardId)
  return extra?.duration || 3
}

function getCardExtraFields(cardId) {
  if (!cardId) return null
  const card = cards.value.find(c => c.id === cardId)
  return card?.extraFields || null
}

function selectCard(card) {
  selectedCard.value = card
  editingContent.value = card.content;
  editingEmotion.value = card.emotion;
  if (!cardHistory.value[card.id]) {
    cardHistory.value[card.id] = { past: [], future: [] }
  }
  // Load director mode extra fields
  if (card.extraFields) {
    editingShotType.value = card.extraFields.shotType || ''
    editingCameraMovement.value = card.extraFields.cameraMovement || ''
    editingDuration.value = card.extraFields.duration || 3
    editingDialogue.value = card.extraFields.dialogue || ''
    editingSoundEffects.value = card.extraFields.soundEffects || ''
  } else {
    editingShotType.value = ''
    editingCameraMovement.value = ''
    editingDuration.value = 3
    editingDialogue.value = ''
    editingSoundEffects.value = ''
  }
}

function saveCardDetail() {
  if (!selectedCard.value) return
  const card = cards.value.find(c => c.id === selectedCard.value.id)
  if (!card) return
  const previousEmotion = card.emotion
  pushHistory(selectedCard.value.id, card.content, card.emotion)
  card.content = editingContent.value
  card.emotion = editingEmotion.value
  card.wordCount = countWords(editingContent.value)
  card.updatedAt = new Date().toISOString()
  // Save director mode extra fields
  if (currentMode.value === 'directing') {
    card.extraFields = {
      shotType: editingShotType.value,
      cameraMovement: editingCameraMovement.value,
      duration: editingDuration.value,
      dialogue: editingDialogue.value,
      soundEffects: editingSoundEffects.value
    }
  }
  addTimeline('更新卡片')
  saveData()

  if (card.emotion !== previousEmotion) {
    trackPreference('emotion_changed', card)
  }
}

function insertCard() {
  const newCard = {
    id: `card_${Date.now()}`,
    content: '',
    emotion: 'calm',
    wordCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pileId: null,
    zone: 'material',
    x: null,
    y: null
  }
  cards.value.push(newCard)
  selectedCard.value = newCard
  addTimeline('新建空白卡片')
  saveData()
}

function deleteCard(cardId) {
  cards.value = cards.value.filter(c => c.id !== cardId)
  edges.value = edges.value.filter(e => e.sourceId !== cardId && e.targetId !== cardId)
  outline.value = outline.value.filter(o => o.cardId !== cardId)
  if (selectedCard.value?.id === cardId) selectedCard.value = null
  addTimeline('删除卡片')
  saveData()
}

function confirmClearAll() {
  if (!cards.value.length) return
  if (!confirm('确定要清空所有卡片吗？此操作不可撤销。')) return
  cards.value = []
  edges.value = []
  outline.value = []
  timeline.value = []
  selectedCard.value = null
  saveData()
  addTimeline('清空所有卡片')
}

// 基于已有卡片生成更多相关卡片
async function expandFromCard(card) {
  if (!card || isGenerating.value) return

  if (!apiSettings.value?.baseUrl || !apiSettings.value?.apiKey || !apiSettings.value?.model) {
    alert('请先在设置中配置 API')
    return
  }

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const generationResult = await generateProseCardExtensions({
      cardContent: card.content,
      settings: apiSettings.value
    })

    if (generationResult.success && Array.isArray(generationResult.parsed) && generationResult.parsed.length > 0) {
      const validEmotions = ['joy', 'sorrow', 'calm', 'anxiety', 'anger', 'surprise', 'nostalgia', 'hope']

      const newCards = generationResult.parsed.map(item => {
        let emotion = item.emotion || editingEmotion.value
        if (!validEmotions.includes(emotion)) emotion = editingEmotion.value
        return {
          id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          content: item.content || '',
          emotion,
          wordCount: countWords(item.content || ''),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pileId: null,
          zone: 'material',
          x: null,
          y: null
        }
      }).filter(c => c.content.length > 0)

      if (newCards.length === 0) return

      // 与原卡片建立"延续"边
      const newEdges = newCards.map(newCard => ({
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sourceId: card.id,
        targetId: newCard.id,
        type: 'continuation'
      }))

      if (!continuationGroups.value[card.id]) {
        continuationGroups.value[card.id] = new Set()
      }
      newCards.forEach(n => continuationGroups.value[card.id].add(n.id))

      cards.value.push(...newCards)
      edges.value.push(...newEdges)
      addTimeline(`基于「${card.content.slice(0, 15)}...」生成了 ${newCards.length} 张延伸卡片`)
      saveData()
    }
  } catch (e) {
    console.error('生成失败:', e)
  } finally {
    clearInterval(generationMsgTimer)
    generationMsgTimer = null
    isGenerating.value = false
  }
}

// 基于情绪标签扩展内容
async function expandByEmotion() {
  if (!selectedCard.value || isGenerating.value) return

  if (!apiSettings.value?.baseUrl || !apiSettings.value?.apiKey || !apiSettings.value?.model) {
    alert('请先在设置中配置 API')
    return
  }

  const emotionLabel = emotionLabels[editingEmotion.value] || editingEmotion.value

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const generationResult = await generateProseEmotionExtensions({
      content: editingContent.value,
      emotionLabel,
      settings: apiSettings.value
    })

    if (generationResult.success && Array.isArray(generationResult.parsed) && generationResult.parsed.length > 0) {
      const validEmotions = ['joy', 'sorrow', 'calm', 'anxiety', 'anger', 'surprise', 'nostalgia', 'hope']

      const newCards = generationResult.parsed.map(item => {
        let emotion = item.emotion || editingEmotion.value
        if (!validEmotions.includes(emotion)) emotion = editingEmotion.value
        return {
          id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          content: item.content || '',
          emotion,
          wordCount: countWords(item.content || ''),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pileId: null,
          zone: 'material',
          x: null,
          y: null
        }
      }).filter(c => c.content.length > 0)

      if (newCards.length === 0) return

      const newEdges = newCards.map(newCard => ({
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sourceId: selectedCard.value.id,
        targetId: newCard.id,
        type: 'continuation'
      }))

      if (!continuationGroups.value[selectedCard.value.id]) {
        continuationGroups.value[selectedCard.value.id] = new Set()
      }
      newCards.forEach(n => continuationGroups.value[selectedCard.value.id].add(n.id))

      cards.value.push(...newCards)
      edges.value.push(...newEdges)
      addTimeline(`基于「${emotionLabel}」情绪扩展了 ${newCards.length} 张卡片`)
      saveData()
    }
  } catch (e) {
    console.error('生成失败:', e)
  } finally {
    clearInterval(generationMsgTimer)
    generationMsgTimer = null
    isGenerating.value = false
  }
}

// Generate cards from topic
async function generateCards() {
  const topic = currentTopic.value.trim()
  if (!topic || isGenerating.value) return

  if (!apiSettings.value?.baseUrl || !apiSettings.value?.apiKey || !apiSettings.value?.model) {
    alert('请先在设置中配置 API')
    return
  }

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const generationResult = await generateProseCardsFromTopic({
      topic,
      mode: currentMode.value,
      settings: apiSettings.value
    })

    if (generationResult.success && Array.isArray(generationResult.parsed) && generationResult.parsed.length > 0) {
      createNewCards(generationResult.parsed, topic)
      return
    }

    console.error('卡片生成失败，未能解析有效内容')
  } catch (e) {
    console.error('生成卡片失败:', e)
  } finally {
    clearInterval(generationMsgTimer)
    generationMsgTimer = null
    isGenerating.value = false
  }
}

function normalizeEmotionKey(emotion) {
  const rawEmotion = String(emotion || '').trim()
  const lowerEmotion = rawEmotion.toLowerCase()
  const aliasMap = {
    joy: 'joy',
    喜悦: 'joy',
    开心: 'joy',
    高兴: 'joy',
    sorrow: 'sorrow',
    sad: 'sorrow',
    忧伤: 'sorrow',
    悲伤: 'sorrow',
    calm: 'calm',
    平静: 'calm',
    宁静: 'calm',
    anxiety: 'anxiety',
    焦虑: 'anxiety',
    紧张: 'anxiety',
    anger: 'anger',
    愤怒: 'anger',
    生气: 'anger',
    surprise: 'surprise',
    惊艳: 'surprise',
    惊讶: 'surprise',
    nostalgia: 'nostalgia',
    怀旧: 'nostalgia',
    hope: 'hope',
    希望: 'hope'
  }

  return aliasMap[rawEmotion] || aliasMap[lowerEmotion] || 'calm'
}

function createNewCards(generated, topic) {
  const newCards = generated.map(item => {
    const emotion = normalizeEmotionKey(item.emotion)
    const card = {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content: item.content || '',
      emotion,
      wordCount: countWords(item.content || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pileId: null,
      zone: 'material',
      x: null,
      y: null
    }
    // Add director mode extra fields
    if (currentMode.value === 'directing') {
      card.extraFields = {
        shotType: item.shotType || '',
        cameraMovement: item.cameraMovement || '',
        duration: item.duration || 3,
        dialogue: item.dialogue || '',
        soundEffects: item.soundEffects || ''
      }
    }
    return card
  }).filter(c => c.content.length > 0)

  if (newCards.length === 0) return

  cards.value.push(...newCards)
  addTimeline(`根据「${topic.slice(0, 20)}...」生成了 ${newCards.length} 张卡片`)
  currentTopic.value = ''
  saveData()
}

// Outline operations
function addToOutline() {
  if (!selectedCard.value) return

  if (selectedCard.value.pileId) {
    // Pile: add entire pile as one outline entry
    const pileId = selectedCard.value.pileId
    if (outline.value.some(o => o.pileId === pileId)) return
    const pile = piles.value.find(p => p.pileId === pileId)
    if (!pile) return
    outline.value.push({
      pileId,
      emotion: selectedCard.value.emotion,
      preview: pile.name ? pile.name : `[牌堆 ${pile.cardIds.length}张]`
    })
  } else {
    // Single card
    const existing = outline.value.find(o => o.cardId === selectedCard.value.id)
    if (existing) return
    outline.value.push({
      cardId: selectedCard.value.id,
      emotion: selectedCard.value.emotion,
      preview: selectedCard.value.content.slice(0, 20) + '...'
    })
  }
  createSnapshot('加入大纲')
  saveData()
  trackPreference('adopt_card', selectedCard.value)
}

function moveOutlineUp(index) {
  if (index <= 0) return
  const item = outline.value.splice(index, 1)[0]
  outline.value.splice(index - 1, 0, item)
  addTimeline('大纲上移')
  saveData()
}

function moveOutlineDown(index) {
  if (index >= outline.value.length - 1) return
  const item = outline.value.splice(index, 1)[0]
  outline.value.splice(index + 1, 0, item)
  addTimeline('大纲下移')
  saveData()
}

function onOutlineDragStart(index, e) {
  draggingOutlineIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
}

function onOutlineDragOver(index) {
  if (draggingOutlineIndex.value === -1 || draggingOutlineIndex.value === index) return
  outlineDragOverIndex.value = index
  const items = [...outline.value]
  const dragItem = items.splice(draggingOutlineIndex.value, 1)[0]
  items.splice(index, 0, dragItem)
  outline.value = items
  draggingOutlineIndex.value = index
}

function onOutlineDrop(index) {
  draggingOutlineIndex.value = -1
  outlineDragOverIndex.value = -1
  addTimeline('大纲拖拽排序')
  saveData()
}

function onOutlineDragEnd() {
  draggingOutlineIndex.value = -1
  outlineDragOverIndex.value = -1
}

function onCardDragStart(card, e) {
  draggingCardId.value = card.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', card.id)
}

function onCardDragOver(card, e) {
  if (!draggingCardId.value || draggingCardId.value === card.id) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

function onCardDrop(targetCard, e) {
  e.preventDefault()
  const draggedId = draggingCardId.value
  if (!draggedId || draggedId === targetCard.id) {
    draggingCardId.value = null
    return
  }

  const draggedCardInCards = cards.value.find(c => c.id === draggedId)
  if (!draggedCardInCards) {
    draggingCardId.value = null
    return
  }

  const targetPileId = targetCard.pileId
  if (targetPileId) {
    const pile = piles.value.find(p => p.pileId === targetPileId)
    if (pile) pile.cardIds.push(draggedId)
    cards.value.forEach(c => { if (c.id === draggedId) c.pileId = targetPileId })
  } else {
    const newPileId = `pile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    piles.value.push({ pileId: newPileId, name: '', cardIds: [targetCard.id, draggedId], pileX: targetCard.x, pileY: targetCard.y })
    cards.value.forEach(c => {
      if (c.id === draggedId || c.id === targetCard.id) c.pileId = newPileId
    })
  }
  draggingCardId.value = null
  updateLayout()
  addTimeline('卡片加入牌堆')
  saveData()
}

function onCardDragEnd() {
  draggingCardId.value = null
}

function onCardWallDragOver(e) {
  if (!draggingCardId.value) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

function onCardWallDrop(e) {
  e.preventDefault()
  const cardId = draggingCardId.value
  if (!cardId) {
    draggingCardId.value = null
    return
  }

  const card = cards.value.find(c => c.id === cardId)
  if (!card) {
    draggingCardId.value = null
    return
  }

  if (card.pileId) {
    const pile = piles.value.find(p => p.pileId === card.pileId)
    if (pile) {
      pile.cardIds = pile.cardIds.filter(id => id !== cardId)
      if (pile.cardIds.length < 2) {
        cards.value.forEach(c => { if (c.pileId === pile.pileId) c.pileId = null })
        piles.value = piles.value.filter(p => p.pileId !== pile.pileId)
      }
    }
  }

  const rect = e.currentTarget.getBoundingClientRect()
  const dropX = e.clientX - rect.left
  const dropY = e.clientY - rect.top
  const wall = cardWallRef.value
  const scrollX = wall?.scrollLeft || 0
  const scrollY = wall?.scrollTop || 0
  card.x = dropX + scrollX - 140
  card.y = dropY + scrollY - 90
  card.pileId = null
  draggingCardId.value = null
  updateLayout()
  saveData()
}

function removeFromOutline(index) {
  outline.value.splice(index, 1)
  addTimeline(`卡片移出大纲`)
  saveData()
}

function removeCardFromOutline(cardIdOrPileId) {
  const idx = outline.value.findIndex(o => o.cardId === cardIdOrPileId || o.pileId === cardIdOrPileId)
  if (idx !== -1) {
    outline.value.splice(idx, 1)
    createSnapshot('移出大纲')
    saveData()
  }
}

function jumpToCard(cardId) {
  const card = cards.value.find(c => c.id === cardId)
  if (card) {
    selectedCard.value = card
    const el = document.querySelector(`[data-card-id="${cardId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// Edge operations
function addEdge() {
  if (!selectedCard.value || !newEdgeTarget.value) return

  edges.value.push({
    id: `edge_${Date.now()}`,
    sourceId: selectedCard.value.id,
    targetId: newEdgeTarget.value,
    type: newEdgeType.value
  })

  addTimeline(`添加「${edgeTypes.find(t => t.value === newEdgeType.value)?.label}」关联`)
  showEdgeDialog.value = false
  newEdgeTarget.value = ''
  newEdgeType.value = 'consciousness'
  saveData()
}

const lastDirectorExportFingerprint = ref('')
const lastDirectorExportContext = ref(null)
const directorStoryboardStatus = ref('')
const directorStoryboardIsCurrent = computed(() => {
  if (!lastDirectorExportContext.value) return false
  try {
    return lastDirectorExportFingerprint.value === createDirectorExportFingerprint(buildDirectorRawShots(), currentTopic.value)
  } catch {
    return false
  }
})
const directorStoryboardShotCount = computed(() => getDirectorStoryboardShots(lastDirectorExportContext.value).length)
const directorStoryboardVersionLabel = computed(() => {
  const versionId = lastDirectorExportContext.value?.version?.versionId || ''
  return versionId ? versionId.slice(-6) : '-'
})
const directorStoryboardValidationText = computed(() => {
  const validation = getDirectorStoryboardValidation(lastDirectorExportContext.value)
  const errorCount = validation?.errors?.length || 0
  const warningCount = validation?.warnings?.length || 0
  if (errorCount) return `${errorCount} 错误`
  if (warningCount) return `${warningCount} 提醒`
  return '校验通过'
})

function buildDirectorExportTimeline() {
  return outline.value
    .map((item, index) => {
      const card = cards.value.find((c) => c.id === item.cardId)
      if (!card) return null
      const ef = card.extraFields || {}
      return {
        cardId: card.id,
        order: index,
        emotion: card.emotion || '',
        duration: ef.duration || 3
      }
    })
    .filter(Boolean)
}

function buildDirectorSourceExcerpt() {
  return outline.value
    .map((item) => cards.value.find((c) => c.id === item.cardId)?.content || '')
    .filter(Boolean)
    .join('\n')
    .slice(0, 240)
}

function createDirectorExportFingerprint(shots, topic) {
  return JSON.stringify({
    topic: String(topic || '').trim(),
    shots: (shots || []).map((shot) => [
      shot.sequence,
      shot.content,
      shot.shotType,
      shot.camera,
      shot.duration,
      shot.dialogue,
      shot.sound,
      shot.transition,
      shot.tone,
      shot.emotion
    ])
  })
}

function buildDirectorRawShots() {
  return extractShotsFromProseEssay({
    cards: cards.value,
    timeline: buildDirectorExportTimeline()
  })
}

function getDirectorStoryboardShots(result) {
  if (!result) return []
  return result.shots || result.version?.shots || []
}

function getDirectorStoryboardValidation(result) {
  if (!result) return null
  return result.validation || result.version?.validation || null
}

function getDirectorExportContext() {
  const rawShots = buildDirectorRawShots()
  const fingerprint = createDirectorExportFingerprint(rawShots, currentTopic.value)
  if (lastDirectorExportContext.value && lastDirectorExportFingerprint.value === fingerprint) {
    return lastDirectorExportContext.value
  }

  const sourceId = String(currentTopic.value || '').trim() || 'untitled-prose'
  const sourceTitle = String(currentTopic.value || '').trim() || '散文随笔'
  const result = saveValidatedStoryboardVersion({
    source: {
      sourceType: 'prose-card',
      sourceId,
      title: sourceTitle,
      excerpt: buildDirectorSourceExcerpt()
    },
    shots: rawShots,
    taskType: 'prose.directing.export',
    parameters: {
      mode: 'directing',
      topic: currentTopic.value || '',
      outlineCount: outline.value.length,
      cardCount: cards.value.length
    }
  })

  lastDirectorExportFingerprint.value = fingerprint
  lastDirectorExportContext.value = {
    fingerprint,
    shots: result.shots,
    document: result.document,
    version: result.version,
    validation: result.validation
  }
  return lastDirectorExportContext.value
}

function prepareDirectorStoryboardVersion() {
  showExportMenu.value = false
  try {
    const directorExport = getDirectorExportContext()
    directorStoryboardStatus.value = `已生成分镜版本 ${directorExport.version.versionId.slice(-6)}，确认后可下载 Markdown`
    addTimeline('生成统一分镜版本')
    return directorExport
  } catch (error) {
    directorStoryboardStatus.value = error?.validation?.errors?.[0] || error?.message || '分镜校验未通过'
    return null
  }
}

function downloadDirectorMarkdown() {
  showExportMenu.value = false
  try {
    const directorExport = directorStoryboardIsCurrent.value
      ? lastDirectorExportContext.value
      : getDirectorExportContext()
    const md = toMarkdown(getDirectorStoryboardShots(directorExport), {
      title: '分镜脚本',
      topic: currentTopic.value || '未命名'
    })
    downloadFile(md, '分镜脚本.md', 'text/markdown')
    directorStoryboardStatus.value = `已下载分镜 Markdown，版本 ${directorExport.version.versionId.slice(-6)}`
    addTimeline('下载统一分镜脚本 Markdown')
  } catch (error) {
    directorStoryboardStatus.value = error?.validation?.errors?.[0] || error?.message || '分镜校验未通过'
  }
}

// Export operations
function exportToMarkdown() {
  showExportMenu.value = false
  try {
    if (currentMode.value === 'directing') {
      prepareDirectorStoryboardVersion()
      return
    }

    // Writing mode: existing markdown export
    let md = `# ${currentTopic.value || '散文随笔'}\n\n`
    for (let i = 0; i < outline.value.length; i++) {
      const item = outline.value[i]
      const card = cards.value.find(c => c.id === item.cardId)
      if (card) {
        md += `## ${i + 1}\n\n${card.content}\n\n---\n\n`
      }
    }
    md += '\n**衔接提示**：请在以上留空处补充过渡句，使文章更流畅。\n'
    downloadFile(md, '散文随笔.md', 'text/markdown')
    addTimeline('导出为 Markdown')
  } catch (error) {
    alert(`导出失败: ${error?.message || '请检查分镜内容'}`)
  }
}

function getCameraMovementLabel(movement) {
  const found = cameraMovements.find(m => m.value === movement)
  return found ? found.label : movement
}

function getEdgeClass(edgeType) {
  if (currentMode.value === 'directing') {
    return 'director-edge'
  }
  return ''
}

function getEdgeStyle(edge) {
  if (currentMode.value === 'directing') {
    const edgeTypeConfig = directorEdgeTypes.find(e => e.value === edge.type)
    if (edgeTypeConfig) {
      return { stroke: edgeTypeConfig.color }
    }
    return { stroke: 'var(--accent)' }
  }
  return { stroke: edgeColors[edge.type] || 'var(--accent)' }
}

function exportToTxt() {
  showExportMenu.value = false
  let txt = `${currentTopic.value || '散文随笔'}\n${'='.repeat(30)}\n\n`

  for (let i = 0; i < outline.value.length; i++) {
    const item = outline.value[i]
    const card = cards.value.find(c => c.id === item.cardId)
    if (card) {
      txt += `【${i + 1}】\n${card.content}\n\n`
    }
  }

  txt += '\n【衔接提示】请在留空处补充过渡句，使文章更流畅。\n'
  downloadFile(txt, '散文随笔.txt', 'text/plain')
  addTimeline('导出为 TXT')
}

function exportToJson() {
  showExportMenu.value = false
  try {
    if (currentMode.value === 'directing') {
      const directorExport = getDirectorExportContext()
      const prompts = directorExport.shots.map((shot) => ({
        index: shot.sequence,
        shotType: shot.shotType || 'medium',
        cameraMovement: shot.camera || 'fixed',
        duration: shot.duration || 3,
        description: shot.content || '',
        dialogue: shot.dialogue || '',
        soundEffects: shot.sound || ''
      }))
      const data = {
        topic: currentTopic.value,
        exportedAt: new Date().toISOString(),
        mode: 'directing',
        storyboardDocumentId: directorExport.document.id,
        storyboardVersionId: directorExport.version.versionId,
        validation: directorExport.version.validation,
        prompts
      }
      downloadFile(JSON.stringify(data, null, 2), 'AI视频提示词.json', 'application/json')
      addTimeline('导出统一分镜 JSON')
    } else {
      const data = {
        topic: currentTopic.value,
        exportedAt: new Date().toISOString(),
        mode: 'writing',
        cards: cards.value,
        edges: edges.value,
        outline: outline.value,
        timeline: timeline.value
      }
      downloadFile(JSON.stringify(data, null, 2), '散文随笔_关系网.json', 'application/json')
      addTimeline('导出完整关系网 JSON')
    }
  } catch (error) {
    alert(`导出失败: ${error?.message || '请检查分镜内容'}`)
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportToPremiereFormat() {
  showExportMenu.value = false
  try {
    const directorExport = getDirectorExportContext()
    const csv = toPremiereCSV(directorExport.shots)
    downloadFile(csv, '分镜导入_Premiere.csv', 'text/csv')
    addTimeline('导出统一分镜 Premiere 格式')
  } catch (error) {
    alert(`导出失败: ${error?.message || '请检查分镜内容'}`)
  }
}

// Image generation functions
function loadImageConfigs() {
  const loaded = getItem(IMG_MODEL_CONFIGS_KEY)
  modelConfigs.value = Array.isArray(loaded) ? loaded : []
  if (modelConfigs.value.length > 0 && !imageSelectedModel.value) {
    imageSelectedModel.value = modelConfigs.value[0].id
  }
}

function loadImageLibrary() {
  const loaded = getItem(IMG_LIBRARY_KEY)
  imageLibrary.value = Array.isArray(loaded) ? loaded : []
}

function saveImageLibrary() {
  const trimmed = imageLibrary.value.slice(0, 20)
  setItem(IMG_LIBRARY_KEY, trimmed)
}

function useCardContentAsPrompt() {
  if (selectedCard.value) {
    imagePrompt.value = selectedCard.value.content
  }
}

function openImageConfig() {
  editingModelConfig.value = {
    id: '',
    name: '',
    type: 'sd_webui',
    baseUrl: 'http://127.0.0.1:7860',
    apiKey: '',
    defaultModel: '',
    requestTemplate: ''
  }
  showImageConfigDialog.value = true
}

function editSelectedModel() {
  if (!imageSelectedModel.value) return
  const cfg = modelConfigs.value.find(c => c.id === imageSelectedModel.value)
  if (!cfg) return
  editingModelConfig.value = { ...cfg, requestTemplate: cfg.requestTemplate || '' }
  showImageConfigDialog.value = true
}

function saveModelConfig() {
  if (!editingModelConfig.value?.name) return
  const cfg = { ...editingModelConfig.value }
  if (!cfg.id) {
    cfg.id = `model_${Date.now()}`
    modelConfigs.value.push(cfg)
  } else {
    const idx = modelConfigs.value.findIndex(c => c.id === cfg.id)
    if (idx >= 0) modelConfigs.value[idx] = cfg
  }
  setItem(IMG_MODEL_CONFIGS_KEY, modelConfigs.value)
  showImageConfigDialog.value = false
  if (!imageSelectedModel.value) {
    imageSelectedModel.value = cfg.id
  }
}

function deleteModelConfig(modelId) {
  modelConfigs.value = modelConfigs.value.filter(c => c.id !== modelId)
  setItem(IMG_MODEL_CONFIGS_KEY, modelConfigs.value)
  if (imageSelectedModel.value === modelId) {
    imageSelectedModel.value = modelConfigs.value[0]?.id || ''
  }
}

async function testModelConnection() {
  if (!editingModelConfig.value?.baseUrl) {
    alert('请先填写 API 地址')
    return
  }
  try {
    const baseUrl = editingModelConfig.value.baseUrl.replace(/\/$/, '')
    const type = editingModelConfig.value.type

    if (type === 'http') {
      // HTTP 类型用 POST 测试
      const headers = { 'Content-Type': 'application/json' }
      if (editingModelConfig.value.apiKey) {
        headers['Authorization'] = `Bearer ${editingModelConfig.value.apiKey}`
      }
      let body = editingModelConfig.value.requestTemplate || '{"prompt":"test"}'
      body = body.replace(/\{\{prompt\}\}/g, 'test').replace(/\{\{negative_prompt\}\}/g, '')

      const resp = await fetch(baseUrl, { method: 'POST', headers, body })
      if (resp.ok) {
        alert('连接成功！')
      } else {
        const errText = await resp.text().catch(() => '')
        alert(`连接失败: ${resp.status} ${errText}`)
      }
      return
    }

    // 其他类型用 GET 测试
    let testUrl = baseUrl
    if (type === 'sd_webui') {
      testUrl = baseUrl + '/sdapi/v1/progress'
    } else if (type === 'comfyui') {
      testUrl = baseUrl + '/api/system_stats'
    } else if (type === 'openai_dalle') {
      testUrl = 'https://api.openai.com/v1/models'
    } else if (type === 'stability') {
      testUrl = 'https://api.stability.ai/v1/account'
    }
    const opts = { method: 'GET' }
    if (editingModelConfig.value.apiKey && (type === 'openai_dalle' || type === 'stability')) {
      opts.headers = { 'Authorization': `Bearer ${editingModelConfig.value.apiKey}` }
    }
    const resp = await fetch(testUrl, opts)
    if (resp.ok) {
      alert('连接成功！')
    } else {
      alert(`连接失败: ${resp.status} ${resp.statusText}`)
    }
  } catch (e) {
    alert('连接失败: ' + e.message)
  }
}

async function generateImages() {
  if (!imagePrompt.value.trim()) {
    alert('请输入提示词')
    return
  }
  if (!imageSelectedModel.value) {
    alert('请先选择或添加模型')
    return
  }

  const cfg = modelConfigs.value.find(c => c.id === imageSelectedModel.value)
  if (!cfg) {
    alert('未找到选中的模型配置')
    return
  }

  imageGenerating.value = true
  try {
    const results = []
    for (let i = 0; i < imageCount.value; i++) {
      const base64 = await callImageAPI(cfg, imagePrompt.value, imageNegativePrompt.value)
      results.push(base64)
    }

    for (const data of results) {
      const entry = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt: imagePrompt.value,
        negativePrompt: imageNegativePrompt.value,
        modelName: cfg.name,
        modelType: cfg.type,
        width: imageWidth.value,
        height: imageHeight.value,
        data,
        createdAt: new Date().toISOString()
      }
      imageLibrary.value.unshift(entry)
    }
    saveImageLibrary()
  } catch (e) {
    alert('生成失败: ' + e.message)
  } finally {
    imageGenerating.value = false
  }
}

async function callImageAPI(cfg, prompt, negativePrompt) {
  const baseUrl = (cfg.baseUrl || '').replace(/\/$/, '')

  switch (cfg.type) {
    case 'sd_webui': {
      const resp = await fetch(baseUrl + '/sdapi/v1/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          steps: 20,
          width: imageWidth.value,
          height: imageHeight.value
        })
      })
      if (!resp.ok) throw new Error(`SD WebUI error: ${resp.status}`)
      const json = await resp.json()
      if (json.images && json.images[0]) {
        return 'data:image/png;base64,' + json.images[0]
      }
      throw new Error('No image in response')
    }
    case 'openai_dalle': {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.defaultModel || 'dall-e-3',
          prompt,
          n: 1,
          size: `${imageWidth.value}x${imageHeight.value}`
        })
      })
      if (!resp.ok) throw new Error(`DALL-E error: ${resp.status}`)
      const json = await resp.json()
      if (json.data && json.data[0]) {
        const base64 = await fetch(json.data[0].url).then(r => r.blob()).then(b => {
          return new Promise(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(b)
          })
        })
        return base64
      }
      throw new Error('No image in response')
    }
    case 'stability': {
      const resp = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }, ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : [])],
          height: imageHeight.value,
          width: imageWidth.value
        })
      })
      if (!resp.ok) throw new Error(`Stability error: ${resp.status}`)
      const json = await resp.json()
      if (json.artifacts && json.artifacts[0]) {
        return 'data:image/png;base64,' + json.artifacts[0].base64
      }
      throw new Error('No image in response')
    }
    case 'comfyui': {
      const resp = await fetch(baseUrl + '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      if (!resp.ok) throw new Error(`ComfyUI error: ${resp.status}`)
      const json = await resp.json()
      const promptId = json.prompt_id
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000))
        const histResp = await fetch(baseUrl + '/history/' + promptId)
        if (histResp.ok) {
          const hist = await histResp.json()
          if (hist[promptId]?.outputs) {
            const outputs = hist[promptId].outputs
            for (const nodeId of Object.keys(outputs)) {
              const node = outputs[nodeId]
              if (node.images) {
                const img = node.images[0]
                const imgResp = await fetch(baseUrl + '/view?filename=' + img.filename)
                if (imgResp.ok) {
                  const blob = await imgResp.blob()
                  return new Promise(resolve => {
                    const reader = new FileReader()
                    reader.onloadend = () => resolve(reader.result)
                    reader.readAsDataURL(blob)
                  })
                }
              }
            }
          }
        }
      }
      throw new Error('ComfyUI timeout')
    }
    case 'http': {
      let body = cfg.requestTemplate || '{"prompt":"{{prompt}}"}'
      body = body
        .replace(/{{prompt}}/g, prompt.replace(/"/g, '\"'))
        .replace(/{{negative_prompt}}/g, (negativePrompt || '').replace(/"/g, '\"'))
        .replace(/{{width}}/g, imageWidth.value)
        .replace(/{{height}}/g, imageHeight.value)
        .replace(/{{n}}/g, imageCount.value)
        .replace(/{{aspect_ratio}}/g, `${imageWidth.value}:${imageHeight.value}`)

      const headers = { 'Content-Type': 'application/json' }
      if (cfg.apiKey) {
        headers['Authorization'] = `Bearer ${cfg.apiKey}`
      }

      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status}: ${errText}`)
      }

      const json = await resp.json()

      // 先看用户有没有配 responsePath
      let imageData = null
      if (cfg.responsePath) {
        try {
          const keys = cfg.responsePath.split('.')
          let val = json
          for (const key of keys) {
            val = val?.[key]
          }
          imageData = val
        } catch {}
      }

      // 没配或取不到就自动识别常见格式
      if (!imageData) {
        if (json.data?.image_urls?.[0]) {
          const imgResp = await fetch(json.data.image_urls[0])
          if (!imgResp.ok) throw new Error(`下载图片失败: ${imgResp.status}`)
          const blob = await imgResp.blob()
          imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        } else if (json.data?.image_base64?.[0]) {
          imageData = 'data:image/png;base64,' + json.data.image_base64[0]
        } else if (json.images?.[0]) {
          imageData = 'data:image/png;base64,' + json.images[0]
        } else if (json.data?.[0]?.url) {
          const imgResp = await fetch(json.data[0].url)
          const blob = await imgResp.blob()
          imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        } else if (json.artifacts?.[0]?.base64) {
          imageData = 'data:image/png;base64,' + json.artifacts[0].base64
        }
      }

      if (imageData) {
        if (typeof imageData === 'string' && imageData.startsWith('http')) {
          const imgResp = await fetch(imageData)
          const blob = await imgResp.blob()
          imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        }
        return imageData
      }

      throw new Error('未能从响应中提取图片，请检查响应字段映射或模型返回格式')
    }
    default:
      throw new Error('Unknown model type')
  }
}

function attachImageToCard(imgEntry) {
  if (!selectedCard.value) return
  const card = cards.value.find(c => c.id === selectedCard.value.id)
  if (!card) return
  if (!card.attachedImages) card.attachedImages = []
  if (card.attachedImages.length >= 3) {
    alert('最多附加3张图片')
    return
  }
  card.attachedImages.push({
    id: imgEntry.id,
    prompt: imgEntry.prompt,
    data: imgEntry.data
  })
  saveData()
  imagePreviewIndex.value = -1
}

function openImagePreview(card, imageIndex) {
  previewingCard.value = card
  const img = card.attachedImages[imageIndex]
  if (img) {
    imageLibrary.value = [{ id: img.id, prompt: img.prompt, data: img.data }]
    imagePreviewIndex.value = 0
  }
}

function saveAsNewCard(imgEntry) {
  const newCard = {
    id: `card_${Date.now()}`,
    content: `[图片素材] ${imgEntry.prompt}`,
    emotion: 'calm',
    wordCount: imgEntry.prompt.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachedImages: [{
      id: imgEntry.id,
      prompt: imgEntry.prompt,
      data: imgEntry.data
    }]
  }
  cards.value.push(newCard)
  saveData()
  imagePreviewIndex.value = -1
}

function copyImagePrompt(imgEntry) {
  navigator.clipboard.writeText(imgEntry.prompt)
}

function saveToMaterialLib(imgEntry) {
  // Already in library, just close
  imagePreviewIndex.value = -1
}

function goToMaterialsImageGen() {
  if (imagePrompt.value.trim()) {
    localStorage.setItem('notes_image_prompt', imagePrompt.value)
    localStorage.setItem('notes_image_negative', imageNegativePrompt.value)
  }
  router.push('/materials')
}
</script>

<style scoped>
.prose-essay-page {
  height: var(--app-viewport-height, 100vh);
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* Header */
.pe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border);
  gap: 16px;
}

.pe-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 120px;
}

.pe-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.pe-header-center {
  flex: 1;
  max-width: 600px;
  display: flex;
  gap: 8px;
}

.topic-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text-primary);
  font-size: 14px;
}

.topic-input:focus {
  outline: none;
  border-color: var(--accent);
}

.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  white-space: nowrap;
  flex: none;
}

.pe-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 260px;
  justify-content: flex-end;
}

/* Mode Switch */
.mode-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
}

.mode-caption {
  max-width: 160px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.mode-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-label.active {
  background: var(--accent);
  color: #f7fbff;
  font-weight: 600;
}

.card-count {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Main */
.pe-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Card Wall - PoetryLab-style canvas */
.card-wall {
  flex: 1;
  overflow: auto;
  position: relative;
  background: var(--bg-primary);
}

.card-wall.has-cards {
  overflow: auto;
}

.edge-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}

.edge {
  fill: none;
  stroke: #7f8ea3;
  stroke-width: 1.2;
  stroke-opacity: 0.6;
}

.edge-consciousness {
  stroke: #7f8ea3;
  stroke-dasharray: 6 4;
}

.edge-contrast {
  stroke: #ef5350;
  stroke-dasharray: 2 4;
}

.edge-elaboration {
  stroke: #66bb6a;
  stroke-dasharray: none;
}

.edge-parallel {
  stroke: #ab47bc;
  stroke-dasharray: 3 3;
}

.edge-continuation {
  stroke: var(--accent);
  stroke-dasharray: 5 3;
}

.empty-cards {
  width: 100%;
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  opacity: 0.3;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* Writing Card - PoetryLab-style idea node */
.writing-card {
  width: 280px;
  min-height: 180px;
  background: var(--card-accent, var(--bg-secondary));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 2;
  color: var(--text-primary);
}

.writing-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px var(--shadow-md);
}

.writing-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
  z-index: 3;
}

.writing-card.inline-editing {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent);
  z-index: 3;
}

.writing-card.continuation-child {
  border-left: 3px solid var(--accent);
}

.writing-card.emotion-joy,
.writing-card.emotion-sorrow,
.writing-card.emotion-calm,
.writing-card.emotion-anxiety,
.writing-card.emotion-anger,
.writing-card.emotion-surprise,
.writing-card.emotion-nostalgia,
.writing-card.emotion-hope {
  --card-accent: var(--bg-secondary);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 6px;
  flex-shrink: 0;
}

.continuation-indicator {
  display: flex;
  align-items: center;
  color: var(--accent);
  flex-shrink: 0;
}

.continuation-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--text-primary);
  font-weight: 600;
}

.card-emotion-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 500;
}

.card-time {
  font-size: 11px;
  color: var(--text-muted);
}

.card-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.card-images {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.card-image-item {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: transform 0.15s;
}

.card-image-item:hover {
  transform: scale(1.05);
}

.card-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.pile-badge {
  display: flex;
  align-items: center;
  color: var(--accent);
  opacity: 0.7;
}

.card-words {
  font-size: 11px;
  color: var(--text-muted);
}

.card-inline-edit {
  margin-bottom: 10px;
}

.inline-textarea {
  width: 100%;
  min-height: 80px;
  padding: 6px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.inline-textarea:focus {
  outline: none;
}

.inline-emotion-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}

.inline-emotion-select {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.inline-save-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: #f7fbff;
  font-size: 12px;
  cursor: pointer;
}

.inline-cancel-btn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.writing-card:hover .card-actions {
  opacity: 1;
}

.card-action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.card-action-btn:hover {
  background: var(--accent);
  color: var(--text-primary);
}

/* Left Panel */
.left-panel {
  width: 320px;
  background: var(--surface-panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Card Detail Panel - PoetryLab style */
.card-detail-panel {
  margin: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
  padding: 10px;
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  margin-bottom: 8px;
}

.detail-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.detail-panel-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 500;
}

.detail-panel-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  margin-bottom: 0;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.detail-panel-section {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.related-cards {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.related-empty {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px;
}

.related-card-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.related-card-item:hover {
  background: var(--bg-hover);
}

.related-emotion-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.related-preview {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-panel-actions {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.expand-btn {
  width: 100%;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  border-radius: 6px;
}

.action-row {
  display: flex;
  gap: 6px;
}

.btn-primary {
  flex: 1;
  padding: 8px 12px;
  background: var(--accent);
  color: #f7fbff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  font-weight: 600;
}

.btn-primary:hover {
  filter: brightness(1.06);
}

.btn-secondary {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-accent {
  background: var(--accent);
  color: #f7fbff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-weight: 600;
}

.btn-accent:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-accent:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger {
  padding: 8px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger:hover {
  background: var(--danger);
  color: var(--text-primary);
}

/* Timeline Panel - floating card style */
.timeline-panel {
  position: fixed;
  right: 24px;
  top: 80px;
  width: 220px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow-md);
  z-index: 90;
  overflow: hidden;
}

.timeline-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-tertiary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.timeline-count {
  background: var(--accent);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
}

.timeline-panel-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 10px;
}

.timeline-event {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.timeline-event:last-child {
  border-bottom: none;
}

.timeline-event:hover {
  background: var(--bg-hover);
  border-radius: 6px;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-top: 4px;
}

.timeline-event-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Outline Section */
.outline-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
}

.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.outline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.outline-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.outline-item:hover {
  background: var(--bg-hover);
}

.outline-item.active {
  background: var(--accent-light);
}

.outline-item.outline-dragging {
  opacity: 0.5;
  background: var(--bg-hover);
}

.drag-handle {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  cursor: grab;
  flex-shrink: 0;
  padding: 2px;
}

.drag-handle:active {
  cursor: grabbing;
}

.outline-emotion {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.outline-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.outline-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.outline-item:hover .outline-item-actions {
  opacity: 1;
}

.outline-action-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.15s;
  flex-shrink: 0;
}

.outline-action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--accent);
}

.outline-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.outline-delete-btn:hover:not(:disabled) {
  color: var(--danger);
}

/* Director mode timeline view */
.timeline-view {
  padding: 8px;
}

.timeline-track {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 4px;
  min-height: 100px;
}

.timeline-card {
  flex-shrink: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-width: 80px;
}

.timeline-card:hover {
  border-color: var(--accent);
}

.timeline-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.timeline-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.timeline-index {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

.timeline-duration {
  font-size: 10px;
  color: var(--text-muted);
}

.timeline-card-content {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.timeline-card-meta {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-muted);
}

.timeline-empty {
  text-align: center;
  padding: 24px 16px;
  font-size: 12px;
  color: var(--text-muted);
  width: 100%;
}

.audio-track {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  min-height: 32px;
}

.audio-track-label {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.audio-track-content {
  flex: 1;
  height: 16px;
  background: var(--border);
  border-radius: 4px;
}

.prose-essay-page .storyboard-version-panel {
  margin: 0 12px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-soft) 92%, #ffffff 8%);
  padding: 10px;
}

.prose-essay-page .storyboard-version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.prose-essay-page .storyboard-version-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.prose-essay-page .storyboard-version-badge {
  border-radius: 999px;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: 11px;
}

.prose-essay-page .storyboard-version-badge.stale {
  background: color-mix(in srgb, #f39c6b 18%, transparent);
  color: #f39c6b;
}

.prose-essay-page .storyboard-version-copy,
.prose-essay-page .storyboard-version-status {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.prose-essay-page .storyboard-version-stats {
  margin-top: 8px;
  display: grid;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 12px;
}

.prose-essay-page .storyboard-version-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.prose-essay-page .storyboard-version-actions .btn-primary,
.prose-essay-page .storyboard-version-actions .btn-secondary {
  width: 100%;
  justify-content: center;
}

/* Card badges for director mode */
.card-shot-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--accent);
  color: white;
  border-radius: 4px;
  margin-left: 4px;
}

.card-duration-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 4px;
  margin-left: 4px;
}

.outline-empty {
  text-align: center;
  padding: 24px 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.outline-node-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.outline-node-line {
  width: 1px;
  flex: 1;
  min-height: 16px;
  background: var(--border);
  margin-bottom: 2px;
}

.outline-node-line.is-last {
  display: none;
}

.outline-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-primary);
  box-shadow: 0 0 0 1px var(--accent);
  flex-shrink: 0;
  z-index: 1;
}

.is-pile-item .outline-node-dot {
  background: #ab47bc;
  box-shadow: 0 0 0 1px #ab47bc;
}

.inline-pile-input {
  flex: 1;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  min-width: 120px;
}

.inline-pile-input:focus {
  outline: none;
}

/* Floating Toolbar */
.floating-toolbar {
  position: fixed;
  left: 340px;
  bottom: 24px;
  display: flex;
  gap: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 4px 20px var(--shadow-md);
  z-index: 100;
}

.toolbar-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--accent);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.export-btn {
  background: var(--accent);
  color: #f7fbff;
}

.toolbar-btn.export-btn:hover {
  filter: brightness(1.06);
  color: #f7fbff;
}

.toolbar-divider {
  width: 1px;
  background: var(--border);
  margin: 4px 4px;
}

.export-menu {
  position: absolute;
  bottom: 48px;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 4px 16px var(--shadow-md);
  min-width: 160px;
}

.export-menu button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.export-menu button:hover {
  background: var(--bg-hover);
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog {
  background: var(--bg-secondary);
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 32px var(--shadow-md);
}

.dialog-header {
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.dialog-body {
  padding: 20px;
}

.dialog-footer {
  padding: 16px 20px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.edge-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.edge-type-btn {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.edge-type-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
}

.edge-type-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.edge-type-desc {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-muted);
  gap: 12px;
}

.no-selection-icon {
  opacity: 0.4;
}

.no-selection p {
  font-size: 13px;
  color: var(--text-muted);
}

/* Icons & Utils */
.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-soft);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.icon-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-soft);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--surface-raised);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-toggle .theme-label {
  margin-left: 0;
}

.add-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--accent);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f7fbff;
  transition: background 0.15s;
}

.add-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.detail-textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.detail-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.emotion-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.emotion-btn {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.emotion-btn:hover {
  border-color: var(--emotion-color);
  color: var(--emotion-color);
}

.emotion-btn.active {
  background: var(--emotion-color);
  border-color: var(--emotion-color);
  color: var(--text-primary);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Image Generation Rail */
.image-gen-rail {
  position: fixed;
  right: 0;
  top: calc(var(--app-viewport-half-height, 50vh) + 60px);
  transform: translate(34px, -50%);
  z-index: 80;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
}

.image-gen-rail:hover,
.image-gen-rail:focus-within {
  transform: translate(0, -50%);
}

.image-gen-btn {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  border-radius: 12px 0 0 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 18%, transparent);
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.image-gen-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-drawer {
  width: 320px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 8%, transparent);
}

.advisor-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 40%, transparent);
  z-index: 200;
  transition: transform 0.2s, box-shadow 0.2s;
}

.advisor-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 50%, transparent);
}

.image-gen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.image-gen-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-gen-config-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.image-gen-config-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.image-gen-prompt-row {
  margin-bottom: 8px;
}

.image-gen-prompt-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
  font-size: 12px;
  line-height: 1.5;
  resize: none;
  font-family: inherit;
}

.image-gen-prompt-input:focus {
  outline: none;
  border-color: var(--accent);
}

.image-gen-prompt-input.small {
  font-size: 11px;
  padding: 6px;
}

.image-gen-use-card-btn {
  font-size: 11px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
}

.image-gen-use-card-btn:hover {
  text-decoration: underline;
}

.image-gen-section {
  margin-bottom: 10px;
}

.image-gen-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.image-gen-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.image-gen-model-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.image-gen-edit-model-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.image-gen-edit-model-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.image-gen-sizes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.image-gen-size-btn {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-gen-size-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-size-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #f7fbff;
}

.image-gen-count-row {
  display: flex;
  gap: 4px;
}

.image-gen-count-btn {
  width: 32px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-gen-count-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.image-gen-count-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #f7fbff;
}

.image-gen-actions {
  margin: 12px 0 8px;
}

.image-gen-generate-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #f7fbff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.image-gen-generate-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}

.image-gen-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-gen-results {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 8px;
}

.image-gen-results-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.image-gen-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.image-gen-thumb {
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}

.image-gen-thumb:hover {
  border-color: var(--accent);
}

.image-gen-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-gen-footer {
  margin-top: 10px;
  text-align: center;
}

.image-gen-link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}

.image-gen-link-btn:hover {
  text-decoration: underline;
}

/* Image Preview Modal */
.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.image-preview-modal {
  background: var(--bg-secondary);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-preview-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-close:hover {
  background: var(--bg-hover);
}

.image-preview-body {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.image-preview-body img {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
}

.image-preview-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.image-preview-action-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.image-preview-action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 760px) {
  .pe-header {
    flex-wrap: wrap;
  }

  .pe-header-center {
    order: 3;
    flex-basis: 100%;
    max-width: none;
  }

  .pe-header-right {
    min-width: 0;
    gap: 8px;
  }

  .mode-caption,
  .card-count {
    display: none;
  }

  .image-gen-btn {
    width: 46px;
    height: 46px;
    border-radius: 999px;
  }

  .image-gen-drawer {
    width: min(320px, calc(100vw - 24px));
  }

  .image-gen-rail {
    top: auto;
    right: 12px;
    bottom: calc(82px + env(safe-area-inset-bottom, 0px));
    transform: none;
    transition: none;
  }

  .advisor-fab {
    right: 12px;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}

/* Image Config Dialog */
.image-config-dialog {
  width: 420px;
}
</style>
