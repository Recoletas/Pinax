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
          {{ isGenerating ? generationMessage : '生成卡片' }}
        </button>
      </div>
      <div class="pe-header-right">
        <span class="card-count">{{ cards.length }} 张卡片</span>
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

          <div class="detail-panel-meta">
            <span class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              {{ formatTime(selectedCard.createdAt) }}
            </span>
            <span class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 6h16M4 10h16M4 14h8"/>
              </svg>
              {{ selectedCard.wordCount }} 字
            </span>
          </div>

          <div class="detail-panel-section">
            <label class="section-label">内容</label>
            <textarea
              v-model="editingContent"
              class="detail-textarea"
              placeholder="编辑卡片内容..."
            ></textarea>
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

          <div class="detail-panel-section">
            <label class="section-label">关联</label>
            <div class="related-cards">
              <div v-if="getRelatedCards(selectedCard.id).length === 0" class="related-empty">暂无关联</div>
              <div
                v-for="rel in getRelatedCards(selectedCard.id)"
                :key="rel.id"
                class="related-card-item"
                @click="jumpToCard(rel.id)"
              >
                <span class="related-emotion-dot" :style="{ background: emotionColors[rel.emotion]?.dot }"></span>
                <span class="related-preview">{{ rel.content.slice(0, 20) }}...</span>
              </div>
            </div>
          </div>

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

        <div class="outline-section">
          <div class="outline-header">
            <span class="outline-title">大纲序列</span>
            <button class="add-btn" @click="addToOutline" :disabled="!selectedCard" title="将选中卡片加入大纲">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="outline-list" ref="outlineListRef">
            <div
              v-for="(item, index) in outline"
              :key="item.cardId"
              class="outline-item"
              :class="{ active: selectedCard?.id === item.cardId, 'outline-dragging': draggingOutlineIndex === index }"
              :draggable="true"
              @click="jumpToCard(item.cardId)"
              @dragstart="onOutlineDragStart(index, $event)"
              @dragover.prevent="onOutlineDragOver(index)"
              @drop="onOutlineDrop(index)"
              @dragend="onOutlineDragEnd"
            >
              <span class="drag-handle" title="拖拽排序">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/>
                  <circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/>
                </svg>
              </span>
              <span class="outline-emotion" :style="{ background: emotionColors[item.emotion]?.dot || '#888' }"></span>
              <span class="outline-text">{{ item.preview }}</span>
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
                <button class="outline-action-btn outline-delete-btn" @click.stop="removeFromOutline(index)" title="移除">
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
      <div class="card-wall" ref="cardWallRef" :class="{ 'has-cards': flatCards.length }">
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
            :class="['edge', `edge-${edge.type}`]"
            marker-end="url(#prose-arrow)"
          />
        </svg>

        <div v-if="cards.length === 0" class="empty-cards">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
              <path d="M8 8h14v32H8V8zm18 0h14v32H26V8zM12 14h6v4h-6v-4zm0 10h10v4H12v-4zm0 10h8v4h-8v-4z"/>
            </svg>
          </div>
          <p class="empty-title">开始你的自由写作</p>
          <p class="empty-desc">输入主题或草稿，AI 将生成一组联想卡片</p>
          <p class="empty-hint">每张卡片会自动获得情绪标签和关联关系</p>
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
            '--card-accent': emotionColors[card.emotion]?.bg || '#888'
          }"
          :data-card-id="card.id"
          @click="selectCard(card)"
          @dblclick="startInlineEdit(card, $event)"
        >
          <div class="card-header">
            <span class="card-emotion-badge" :style="{ background: emotionColors[card.emotion]?.badge || '#888' }">
              {{ emotionLabels[card.emotion] || card.emotion }}
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
      <button class="toolbar-btn" @click="showEdgeDialog = true" :disabled="!selectedCard" title="添加关联">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 6.5v7M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
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
        <button @click="exportToMarkdown">导出为 Markdown</button>
        <button @click="exportToTxt">导出为 TXT</button>
        <button @click="exportToJson">导出完整关系网 JSON</button>
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
      <button class="toolbar-btn" @click="showEdgeDialog = true" :disabled="!selectedCard" title="添加关联">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 6.5v7M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
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
        <button @click="exportToMarkdown">导出为 Markdown</button>
        <button @click="exportToTxt">导出为 TXT</button>
        <button @click="exportToJson">导出完整关系网 JSON</button>
      </div>
    </div>

    <!-- 快捷笔记侧边栏 -->
    <aside class="quick-notes-rail" aria-label="快捷入口">
      <div class="quick-notes-drawer" v-if="quickNoteOpen" @click.stop>
        <div class="quick-note-row">
          <textarea
            ref="quickNoteInputRef"
            v-model="quickNoteDraft"
            class="quick-note-input"
            placeholder="随手记一段..."
            @input="handleQuickNoteInput"
          ></textarea>
          <div class="quick-note-actions">
            <button class="quick-note-icon-btn quick-note-save" type="button" @click="saveQuickNote" title="保存到笔记" aria-label="保存到笔记">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7.5 12.2l2.5 2.5 6-6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToNotes" title="去笔记" aria-label="去笔记">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 5.5h8a1 1 0 011 1v11a1 1 0 01-1 1H8a1 1 0 01-1-1v-11a1 1 0 011-1z" stroke="currentColor" stroke-width="1.25"/>
                <path d="M10 9.5h4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="quick-note-icon-btn" type="button" @click="jumpToWriting" title="去小说" aria-label="去小说">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6.5 7h4.8c1.2 0 2.2.9 2.2 2v8H9c-1 0-1.9.4-2.5 1V7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                <path d="M17.5 7h-4.8c-1.2 0-2.2.9-2.2 2v8H15c1 0 1.9.4 2.5 1V7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div v-if="quickNoteStatus" class="quick-note-tip">{{ quickNoteStatus }}</div>
      </div>
      <button class="quick-notes-btn" type="button" @click.stop="quickNoteOpen = !quickNoteOpen" title="打开速记">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 18.5l2.9-.7 8.1-8.1-2.2-2.2-8.1 8.1-.7 2.9z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M13.2 8.8l2.2 2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </aside>

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
          <select v-model="imageSelectedModel" class="image-gen-select">
            <option value="">选择模型...</option>
            <option v-for="cfg in modelConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
          </select>
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
          <button class="image-gen-link-btn" type="button" @click="goToNotesImageGen">去笔记内生图 →</button>
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

    <!-- 添加关联边对话框 -->
    <div v-if="showEdgeDialog" class="dialog-overlay" @click="showEdgeDialog = false">
      <div class="dialog" @click.stop>
        <div class="dialog-header">添加关联</div>
        <div class="dialog-body">
          <div class="form-group">
            <label>关联类型</label>
            <div class="edge-type-grid">
              <button
                v-for="type in edgeTypes"
                :key="type.value"
                class="edge-type-btn"
                :class="{ active: newEdgeType === type.value }"
                @click="newEdgeType = type.value"
              >
                <span class="edge-type-label">{{ type.label }}</span>
                <span class="edge-type-desc">{{ type.desc }}</span>
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>目标卡片</label>
            <select v-model="newEdgeTarget" class="input">
              <option value="">选择一张卡片...</option>
              <option v-for="card in cards.filter(c => c.id !== selectedCard?.id)" :key="card.id" :value="card.id">
                {{ card.content.slice(0, 30) }}...
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn" @click="showEdgeDialog = false">取消</button>
          <button class="btn-primary" @click="addEdge" :disabled="!newEdgeTarget">确认</button>
        </div>
      </div>
    </div>

      </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { getApiSettings, sendChat } from '../services/api'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()

// Quick note
const QUICK_NOTE_DRAFT_KEY = 'prose_quick_note_draft'
const QUICK_NOTE_STORE_KEY = 'writing_notes'
const quickNoteOpen = ref(false)
const quickNoteDraft = ref(loadQuickNoteDraft())
const quickNoteStatus = ref('')
const quickNoteInputRef = ref(null)
const quickNoteImportOpen = ref(false)

// Image generation
const IMG_LIBRARY_KEY = 'prose_image_library'
const IMG_MODEL_CONFIGS_KEY = 'image_model_configs'
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
const showImageConfigDialog = ref(false)
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
const CARDS_KEY = 'prose_cards_v1'
const EDGES_KEY = 'prose_edges_v1'
const OUTLINE_KEY = 'prose_outline_v1'
const TIMELINE_KEY = 'prose_timeline_v1'

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

// Flat positioned nodes for rendering
const flatCards = ref([])

function layoutCards(cardsToLayout) {
  if (!cardWallRef.value) return
  const xGap = 320
  const yGap = 200
  const topBase = 60
  const leftBase = 60
  const maxPerRow = Math.floor((cardWallRef.value.scrollWidth - leftBase * 2) / xGap) || 3

  return cardsToLayout.map((card, idx) => {
    const col = idx % maxPerRow
    const row = Math.floor(idx / maxPerRow)
    return {
      ...card,
      x: leftBase + col * xGap,
      y: topBase + row * yGap
    }
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

// Per-card undo/redo history
const cardHistory = ref({}) // cardId -> { past: [], future: [] }
const inlineEditingCard = ref(null) // card being edited inline
const inlineEditingContent = ref('')
const inlineEditingEmotion = ref('calm')

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
  visibleEdges.value = newEdges
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
  pushHistory(inlineEditingCard.value.id, card.content, card.emotion)
  card.content = inlineEditingContent.value
  card.emotion = inlineEditingEmotion.value
  card.wordCount = countWords(inlineEditingContent.value)
  card.updatedAt = new Date().toISOString()
  addTimeline('更新卡片')
  saveData()
  inlineEditingCard.value = null
}

function cancelInlineEdit() {
  inlineEditingCard.value = null
}

function handleInlineKeydown(e) {
  if (e.key === 'Escape') {
    cancelInlineEdit()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    saveInlineEdit()
  }
}

onMounted(() => {
  loadData()
  resolveApiSettings()
  document.addEventListener('keydown', handleKeydown)
  loadImageConfigs()
  loadImageLibrary()
})

async function resolveApiSettings() {
  const localRaw = JSON.parse(localStorage.getItem('apiSettings') || '{}')
  if (localRaw.baseUrl && localRaw.apiKey && localRaw.model) {
    apiSettings.value = localRaw
    return
  }
  try {
    const remoteRaw = await getApiSettings()
    if (remoteRaw.baseUrl && remoteRaw.apiKey && remoteRaw.model) {
      apiSettings.value = remoteRaw
    }
  } catch {
    // ignore
  }
}

// Data operations
function loadData() {
  try {
    cards.value = JSON.parse(localStorage.getItem(CARDS_KEY) || '[]')
    edges.value = JSON.parse(localStorage.getItem(EDGES_KEY) || '[]')
    outline.value = JSON.parse(localStorage.getItem(OUTLINE_KEY) || '[]')
    timeline.value = JSON.parse(localStorage.getItem(TIMELINE_KEY) || '[]')
  } catch {
    cards.value = []
    edges.value = []
    outline.value = []
    timeline.value = []
  }
  nextTick(() => updateLayout())
}

function saveData() {
  localStorage.setItem(CARDS_KEY, JSON.stringify(cards.value))
  localStorage.setItem(EDGES_KEY, JSON.stringify(edges.value))
  localStorage.setItem(OUTLINE_KEY, JSON.stringify(outline.value))
  localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline.value))
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

function selectCard(card) {
  selectedCard.value = card
  editingContent.value = card.content;
  editingEmotion.value = card.emotion;
  if (!cardHistory.value[card.id]) {
    cardHistory.value[card.id] = { past: [], future: [] }
  }
}

function saveCardDetail() {
  if (!selectedCard.value) return
  const card = cards.value.find(c => c.id === selectedCard.value.id)
  if (!card) return
  pushHistory(selectedCard.value.id, card.content, card.emotion)
  card.content = editingContent.value
  card.emotion = editingEmotion.value
  card.wordCount = countWords(editingContent.value)
  card.updatedAt = new Date().toISOString()
  addTimeline('更新卡片')
  saveData()
}

function insertCard() {
  const newCard = {
    id: `card_${Date.now()}`,
    content: '',
    emotion: 'calm',
    wordCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
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

  const generationSettings = {
    ...apiSettings.value,
    max_tokens: 2000,
    temperature: 0.8
  }

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const systemPrompt = [
      '你是散文随笔写作助手。基于给定的卡片内容，生成 2-3 张相关的延伸卡片。',
      '要求：',
      '1. 每张卡片是一段完整的文字（80-150字），与原卡片有逻辑关联',
      '2. 为每张卡片选择一个情绪标签：喜悦、忧伤、平静、焦虑、愤怒、惊艳、怀旧、希望',
      '3. 新卡片与原卡片之间是阐释或平行关系',
      '4. 必须用 JSON 数组格式输出，每项包含 content 和 emotion',
      '5. 只输出 JSON，不要任何解释',
      '6. 用 BEGIN_CARDS 和 END_CARDS 包裹数组'
    ].join('\n')

    const response = await sendChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `原卡片：${card.content}` }
    ], null, null, generationSettings)

    const content = String(response?.content || '')
    console.info('[ProseEssay expand]', content.slice(0, 500))

    try {
      const parsed = parseCardBlock(content)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const validEmotions = ['joy', 'sorrow', 'calm', 'anxiety', 'anger', 'surprise', 'nostalgia', 'hope']

        const newCards = parsed.map(item => {
          let emotion = item.emotion || 'calm'
          if (!validEmotions.includes(emotion)) emotion = 'calm'
          return {
            id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            content: item.content || '',
            emotion,
            wordCount: countWords(item.content || ''),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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
      console.error('解析失败:', e)
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
  const generationSettings = {
    ...apiSettings.value,
    max_tokens: 2000,
    temperature: 0.8
  }

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const systemPrompt = [
      'You are a prose essay writing assistant. Generate 2-3 extended cards.',
      'Requirements: Each card 80-150 chars, JSON output with content and emotion.',
      'Wrap array with BEGIN_CARDS and END_CARDS.'
    ].join('\n')

    const response = await sendChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Original card: ' + editingContent.value + ', Emotion: ' + emotionLabel }
    ], null, null, generationSettings)

    const content = String(response?.content || '')
    console.info('[ProseEssay expandByEmotion]', content.slice(0, 500))

    try {
      const parsed = parseCardBlock(content)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const validEmotions = ['joy', 'sorrow', 'calm', 'anxiety', 'anger', 'surprise', 'nostalgia', 'hope']

        const newCards = parsed.map(item => {
          let emotion = item.emotion || editingEmotion.value
          if (!validEmotions.includes(emotion)) emotion = editingEmotion.value
          return {
            id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            content: item.content || '',
            emotion,
            wordCount: countWords(item.content || ''),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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
      console.error('解析失败:', e)
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

  const generationSettings = {
    ...apiSettings.value,
    max_tokens: 3000,
    temperature: 0.8
  }

  isGenerating.value = true
  generationMsgIndex = 0
  generationMessage.value = generationMessages[0]
  generationMsgTimer = setInterval(() => {
    generationMsgIndex = (generationMsgIndex + 1) % generationMessages.length
    generationMessage.value = generationMessages[generationMsgIndex]
  }, 1500)
  try {
    const systemPrompt = [
      '你是散文随笔写作助手。根据给定的主题，生成一组自由联想的写作卡片。',
      '要求：',
      '1. 每张卡片是一段完整的文字（80-200字），文笔优美有意境',
      '2. 为每张卡片选择一个情绪标签：喜悦、忧伤、平静、焦虑、愤怒、惊艳、怀旧、希望',
      '3. 必须用 JSON 数组格式输出，每项包含 content 和 emotion',
      '4. 只输出 JSON，不要任何解释',
      '5. 用 BEGIN_CARDS 和 END_CARDS 包裹数组',
      '示例：',
      'BEGIN_CARDS',
      '[{"content":"...","emotion":"平静"},{"content":"...","emotion":"喜悦"}]',
      'END_CARDS'
    ].join('\n')

    const response = await sendChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `主题：${topic}` }
    ], null, null, generationSettings)

    const content = String(response?.content || '')
    console.info('[ProseEssay LLM]', content.slice(0, 500))

    try {
      const parsed = parseCardBlock(content)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        createNewCards(parsed, topic)
        return
      }
    } catch (e) {
      console.error('解析失败:', e)
    }

    // Retry
    const retry = await sendChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `主题：${topic}` },
      { role: 'user', content: '上一条输出格式不合规。请严格用 BEGIN_CARDS 和 END_CARDS 包裹 JSON 数组输出。' }
    ], null, null, generationSettings)

    const retryContent = String(retry?.content || '')
    console.info('[ProseEssay LLM retry]', retryContent.slice(0, 500))

    try {
      const parsed = parseCardBlock(retryContent)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        createNewCards(parsed, topic)
        return
      }
    } catch (e) {
      console.error('重试解析失败:', e)
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

function parseCardBlock(text) {
  const block = extractCardBlock(text)
  if (!block) return null

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(block)
    if (Array.isArray(parsed)) return parsed
  } catch { }

  // Try to extract content/emotion pairs from text format
  const items = []
  const lines = block.split('\n').filter(l => l.trim())
  let current = null

  for (const line of lines) {
    const contentMatch = line.match(/["']?content["']?\s*[:：]\s*["'](.+?)["']/)
    const emotionMatch = line.match(/["']?emotion["']?\s*[:：]\s*["'](.+?)["']/)

    if (contentMatch) {
      current = { content: contentMatch[1], emotion: '' }
    } else if (emotionMatch && current) {
      current.emotion = emotionMatch[1]
      items.push(current)
      current = null
    }
  }

  return items.length > 0 ? items : null
}

function extractCardBlock(text) {
  const blockMatch = text.match(/BEGIN_CARDS([\s\S]*?)END_CARDS/)
  if (blockMatch) return blockMatch[1].trim()

  // Fallback: try to find JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]

  return null
}

function createNewCards(generated, topic) {
  const validEmotions = ['joy', 'sorrow', 'calm', 'anxiety', 'anger', 'surprise', 'nostalgia', 'hope']

  const newCards = generated.map(item => {
    let emotion = item.emotion || 'calm'
    if (!validEmotions.includes(emotion)) emotion = 'calm'
    return {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content: item.content || '',
      emotion,
      wordCount: countWords(item.content || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }).filter(c => c.content.length > 0)

  if (newCards.length === 0) return

  // 建立初始关联（意识流和对比）
  const newEdges = []
  for (let i = 0; i < newCards.length - 1; i++) {
    for (let j = i + 1; j < newCards.length; j++) {
      if (Math.random() > 0.5) {
        newEdges.push({
          id: `edge_${Date.now()}_${i}_${j}`,
          sourceId: newCards[i].id,
          targetId: newCards[j].id,
          type: Math.random() > 0.6 ? 'contrast' : 'consciousness'
        })
      }
    }
  }

  cards.value.push(...newCards)
  edges.value.push(...newEdges)
  addTimeline(`根据「${topic.slice(0, 20)}...」生成了 ${newCards.length} 张卡片`)
  currentTopic.value = ''
  saveData()
}

// Outline operations
function addToOutline() {
  if (!selectedCard.value) return
  const existing = outline.value.find(o => o.cardId === selectedCard.value.id)
  if (existing) return

  outline.value.push({
    cardId: selectedCard.value.id,
    emotion: selectedCard.value.emotion,
    preview: selectedCard.value.content.slice(0, 20) + '...'
  })
  addTimeline(`卡片加入大纲`)
  saveData()
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

function removeFromOutline(index) {
  outline.value.splice(index, 1)
  addTimeline(`卡片移出大纲`)
  saveData()
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

// Export operations
function exportToMarkdown() {
  showExportMenu.value = false
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
  const data = {
    topic: currentTopic.value,
    exportedAt: new Date().toISOString(),
    cards: cards.value,
    edges: edges.value,
    outline: outline.value,
    timeline: timeline.value
  }
  downloadFile(JSON.stringify(data, null, 2), '散文随笔_关系网.json', 'application/json')
  addTimeline('导出完整关系网 JSON')
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

// Quick note functions
function loadQuickNoteDraft() {
  try {
    return localStorage.getItem(QUICK_NOTE_DRAFT_KEY) || ''
  } catch {
    return ''
  }
}

function persistQuickNoteDraft() {
  try {
    localStorage.setItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
  } catch {
    // ignore
  }
}

function resizeQuickNoteInput(el = quickNoteInputRef.value) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 104) + 'px'
}

function handleQuickNoteInput(event) {
  persistQuickNoteDraft()
  resizeQuickNoteInput(event?.target)
}

function clearQuickNoteDraft() {
  quickNoteDraft.value = ''
  try {
    localStorage.removeItem(QUICK_NOTE_DRAFT_KEY)
  } catch {
    // ignore localStorage failures
  }
  nextTick(() => resizeQuickNoteInput())
}

watch(quickNoteOpen, (open) => {
  if (!open) {
    quickNoteImportOpen.value = false
    return
  }
  nextTick(() => resizeQuickNoteInput())
})

function quickNoteWordCount(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const chineseChars = (normalized.match(/[一-龥]/g) || []).length
  const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
}

function buildQuickNoteTitle(text) {
  const firstLine = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (firstLine) return firstLine.slice(0, 18)
  return '速记'
}

function saveQuickNote() {
  const content = quickNoteDraft.value.trim()
  if (!content) {
    quickNoteStatus.value = '先写点内容再保存'
    return false
  }

  let notes = []
  try {
    notes = JSON.parse(localStorage.getItem(QUICK_NOTE_STORE_KEY) || '[]')
    if (!Array.isArray(notes)) notes = []
  } catch {
    notes = []
  }

  notes.unshift({
    id: Date.now().toString(),
    title: buildQuickNoteTitle(content),
    content,
    contentFormat: 'md',
    wordCount: quickNoteWordCount(content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  localStorage.setItem(QUICK_NOTE_STORE_KEY, JSON.stringify(notes))
  clearQuickNoteDraft()
  quickNoteStatus.value = '已保存到笔记'
  return true
}

function jumpToNotes() {
  if (quickNoteDraft.value.trim()) saveQuickNote()
  router.push('/notes')
}

function jumpToWriting() {
  if (quickNoteDraft.value.trim()) saveQuickNote()
  router.push('/writing')
}

// Image generation functions
function loadImageConfigs() {
  try {
    const raw = localStorage.getItem(IMG_MODEL_CONFIGS_KEY)
    if (raw) {
      modelConfigs.value = JSON.parse(raw)
      if (modelConfigs.value.length > 0 && !imageSelectedModel.value) {
        imageSelectedModel.value = modelConfigs.value[0].id
      }
    }
  } catch {
    modelConfigs.value = []
  }
}

function loadImageLibrary() {
  try {
    const raw = localStorage.getItem(IMG_LIBRARY_KEY)
    if (raw) {
      imageLibrary.value = JSON.parse(raw)
    }
  } catch {
    imageLibrary.value = []
  }
}

function saveImageLibrary() {
  const trimmed = imageLibrary.value.slice(0, 20)
  localStorage.setItem(IMG_LIBRARY_KEY, JSON.stringify(trimmed))
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
  localStorage.setItem(IMG_MODEL_CONFIGS_KEY, JSON.stringify(modelConfigs.value))
  showImageConfigDialog.value = false
  if (!imageSelectedModel.value) {
    imageSelectedModel.value = cfg.id
  }
}

function deleteModelConfig(modelId) {
  modelConfigs.value = modelConfigs.value.filter(c => c.id !== modelId)
  localStorage.setItem(IMG_MODEL_CONFIGS_KEY, JSON.stringify(modelConfigs.value))
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

function goToNotesImageGen() {
  if (imagePrompt.value.trim()) {
    localStorage.setItem('notes_image_prompt', imagePrompt.value)
    localStorage.setItem('notes_image_negative', imageNegativePrompt.value)
  }
  router.push('/notes')
}
</script>

<style scoped>
.prose-essay-page {
  height: 100vh;
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
  background: var(--bg-secondary);
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
  background: var(--bg-primary);
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
  gap: 12px;
  min-width: 120px;
  justify-content: flex-end;
}

.card-count {
  font-size: 13px;
  color: var(--text-secondary);
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

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  background: var(--bg-secondary);
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
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff 8%);
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

.outline-empty {
  text-align: center;
  padding: 24px 16px;
  font-size: 12px;
  color: var(--text-muted);
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
  background: var(--bg-secondary);
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
  background: var(--bg-secondary);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.theme-toggle:hover {
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

/* Quick Notes Rail */
.quick-notes-rail {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translate(34px, -50%);
  z-index: 80;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
}

.quick-notes-rail:hover,
.quick-notes-rail:focus-within {
  transform: translate(0, -50%);
}

.quick-notes-btn {
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

.quick-notes-drawer {
  width: 262px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
  box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 8%, transparent);
}

.quick-note-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.quick-note-input {
  flex: 1;
  width: auto;
  min-height: 30px;
  height: 30px;
  max-height: 104px;
  resize: none;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 5px 11px;
  font-size: 11px;
  line-height: 1.45;
  outline: none;
}

.quick-note-input:focus {
  border-color: var(--accent);
}

.quick-note-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.quick-note-icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  padding: 0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-note-icon-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.quick-note-tip {
  margin-top: 4px;
  font-size: 9px;
  color: var(--text-secondary);
}

.quick-notes-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Image Generation Rail */
.image-gen-rail {
  position: fixed;
  right: 0;
  top: calc(50% + 60px);
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
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
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

/* Image Config Dialog */
.image-config-dialog {
  width: 420px;
}
</style>