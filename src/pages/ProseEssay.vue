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
        <span class="pe-title">卡片画布</span>
      </div>
      <div class="pe-header-center">
        <input
          v-model="currentTopic"
          class="topic-input"
          placeholder="输入场景线索，生成素材节点..."
          @keydown.enter="generateCards"
        />
        <button class="btn-primary generate-btn" @click="generateCards" :disabled="isGenerating || !currentTopic.trim()">
          {{ isGenerating ? generationMessage : '生成节点' }}
        </button>
      </div>
      <div class="pe-header-right">
        <span class="mode-caption">关系与分镜</span>
        <span class="card-count">{{ cards.length }} 个节点</span>
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
            <span class="detail-panel-title">画布节点</span>
            <span v-if="selectedCardTimelineSequence" class="node-index">镜头 #{{ selectedCardTimelineSequence }}</span>
            <span v-else class="node-index muted">未排入时间轴</span>
          </div>

          <div class="node-operations">
            <button v-if="selectedCard.assetId" class="btn-secondary detail-btn" @click="openCardMaterial(selectedCard)">
              查看素材
            </button>
            <button v-else class="btn-secondary detail-btn" @click="sendSelectedCardToMaterials">
              转为素材节点
            </button>
            <button class="btn-secondary detail-btn timeline-detail-btn" :class="{ active: selectedCardInTimeline }" @click="toggleSelectedCardTimeline">
              {{ selectedCardInTimeline ? '移出时间轴' : '加入时间轴' }}
            </button>
            <button class="btn-secondary detail-btn" @click="showCardDetailDialog = true">镜头参数</button>
            <button class="btn-danger node-delete-btn" @click="deleteCard(selectedCard.id)">删除节点</button>
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
          <p>选择节点编辑镜头参数</p>
        </div>

        <CanvasTimeline
          :timeline-items="timelineItems"
          :outline-length="outline.length"
          :selected-card-id="selectedCard?.id || ''"
          :director-mode="currentMode === 'directing'"
          :director-export-status="directorExportStatus"
          :director-export-button-title="directorExportButtonTitle"
          :director-action-disabled="directorTimelineActionDisabled"
          :director-action-label="directorTimelineActionLabel"
          :director-action-title="directorTimelineActionTitle"
          @jump="jumpToTimelineItem"
          @move-up="moveOutlineUp"
          @move-down="moveOutlineDown"
          @remove="removeFromOutline"
          @reorder="onOutlineReorder"
          @drop="onOutlineDrop"
          @clear="clearTimeline"
          @director-action="handleDirectorTimelineAction"
        />
      </aside>

      <!-- Canvas area with absolute positioned cards -->
      <div class="card-wall" ref="cardWallRef" :class="{ 'has-cards': flatCards.length, 'storyboard-mode': currentMode === 'directing' }" @dragover.prevent="onCardWallDragOver" @drop="onCardWallDrop">
        <CanvasEdgeLegend
          v-if="cards.length"
          :edge-types="edgeTypes"
          :linking-active="linkingActive"
          :edge-delete-active="edgeDeleteActive"
          :active-link-type="newEdgeType"
          :get-preview-style="getEdgePreviewStyle"
          @toggle-linking="toggleLinking"
          @toggle-delete="toggleEdgeDeleteMode"
          @activate-type="activateLinkType"
        />
        <svg class="edge-layer" :width="canvasWidth" :height="canvasHeight" aria-hidden="true">
          <defs>
            <marker id="prose-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          <g
            v-for="edge in renderedEdges"
            :key="edge.id"
            class="edge-group"
            :class="{ deletable: edgeDeleteActive }"
          >
            <path
              v-if="edgeDeleteActive"
              class="edge-hit-path"
              :d="edge.d"
              @click.stop="removeEdge(edge.id)"
            />
            <path
              class="edge-path"
              :class="`edge-${edge.type}`"
              :d="edge.d"
              :style="getEdgeStyle(edge)"
              marker-end="url(#prose-edge-arrow)"
            />
          </g>
          <path
            v-if="edgeLinkDraft"
            class="edge-path edge-draft"
            :d="edgeLinkDraftPath"
            :style="getEdgeStyle({ type: newEdgeType })"
          />
        </svg>
        <div v-if="cards.length === 0" class="empty-cards">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
              <path d="M8 8h14v32H8V8zm18 0h14v32H26V8zM12 14h6v4h-6v-4zm0 10h10v4H12v-4zm0 10h8v4h-8v-4z"/>
            </svg>
          </div>
          <p class="empty-title">还没有素材节点</p>
          <p class="empty-desc">
            从素材页加入节点，或输入线索创建新的节点
          </p>
          <p class="empty-hint">
            连线与时间轴用于形成分镜版本
          </p>
        </div>

        <!-- Absolute positioned cards -->
        <div
          v-for="card in flatCards"
          :key="card.id"
          class="writing-card"
          :class="{ selected: selectedCard?.id === card.id, 'link-source': linkSourceCardId === card.id, 'continuation-child': isInSameGroup(card.id), 'storyboard-card': isCardInTimeline(card.id) }"
          :style="{
            position: 'absolute',
            left: card.x + 'px',
            top: card.y + 'px',
            '--card-accent': 'var(--bg-secondary)',
            zIndex: card.zIndex || 1,
            transform: card.rotate ? `rotate(${card.rotate}deg)` : undefined
          }"
          @mouseenter="card.pileId && (hoveredPileId = card.pileId)"
          @mouseleave="card.pileId && (hoveredPileId = null)"
          @click.stop="card.pileId && (expandedPileId = expandedPileId === card.pileId ? null : card.pileId)"
          :data-card-id="card.id"
          :draggable="!linkingActive"
          @pointerdown.stop="onCardPointerDown($event, card)"
          @click="handleCardClick(card)"
          @dblclick="card.assetId && openCardMaterial(card)"
          @dragstart="onCardDragStart(card, $event)"
          @dragover.prevent="onCardDragOver(card, $event)"
          @drop="onCardDrop(card, $event)"
          @dragend="onCardDragEnd"
        >
          <div v-if="getCardTimelineSequence(card.id)" class="card-storyboard-badge">
            <span>#{{ getCardTimelineSequence(card.id) }}</span>
          </div>
          <div class="card-header">
            <span v-if="card.extraFields?.shotType" class="card-shot-badge" :title="'景别: ' + getShotTypeLabel(card.extraFields.shotType)">
              {{ getShotTypeLabel(card.extraFields.shotType) }}
            </span>
            <span v-if="card.extraFields?.duration" class="card-duration-badge">
              {{ card.extraFields.duration }}s
            </span>
            <span v-if="getContinuationGroup(card.id)?.size" class="continuation-indicator" title="已生成延伸卡片">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M5 1v4M3.5 3.5L5 5l1.5-1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </span>
            <span v-else-if="isInSameGroup(card.id)" class="continuation-badge">衍生</span>
          </div>
          <img
            v-if="getCardPreviewImage(card)"
            class="card-preview-thumb"
            :src="getCardPreviewImage(card)"
            :alt="getCardTitle(card)"
          />
          <div class="card-title">{{ getCardTitle(card) }}</div>
          <div v-if="!getCardPreviewImage(card)" class="card-preview-empty" :title="getCardPreview(card)">
            <span class="card-preview-empty-dot"></span>
            <span class="card-preview-empty-text">{{ getCardPreview(card) }}</span>
          </div>
          <div class="card-footer">
            <div class="card-actions" @click.stop>
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
      <button class="toolbar-btn export-btn" :class="directorExportStatus ? `is-${directorExportStatus.kind}` : ''" @click="showExportMenu = !showExportMenu" :title="directorExportButtonTitle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M7 8l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span v-if="directorExportStatus" class="export-btn-badge" :class="`is-${directorExportStatus.kind}`">{{ directorExportStatus.badge }}</span>
      </button>
      <div v-if="showExportMenu" class="export-menu">
        <div v-if="directorExportStatus" class="export-status" :class="`is-${directorExportStatus.kind}`">
          <span class="export-status-dot"></span>
          <div class="export-status-copy">
            <span class="export-status-title">{{ directorExportStatus.title }}</span>
            <span class="export-status-detail">{{ directorExportStatus.detail }}</span>
          </div>
        </div>
        <div v-if="directorExportStatus" class="export-menu-separator"></div>
        <button type="button" @click="exportToMarkdown">{{ currentMode === 'directing' ? '生成/更新分镜版本' : '导出为 Markdown' }}</button>
        <button v-if="currentMode === 'directing' && lastDirectorExportContext" type="button" @click="downloadDirectorMarkdown">下载分镜 Markdown</button>
        <button type="button" @click="exportToTxt">导出为 TXT</button>
        <button type="button" @click="exportToJson">导出完整关系网 JSON</button>
        <button v-if="currentMode === 'directing'" type="button" @click="exportEditingPackage">导出剪辑包 ZIP</button>
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

        <div v-if="storyboardSeedAssets.length > 0" class="image-gen-results material-image-results">
          <div class="image-gen-results-title">分镜种子</div>
          <div class="image-gen-seed-list">
            <button
              v-for="asset in storyboardSeedAssets"
              :key="asset.id"
              class="image-gen-seed-item"
              type="button"
              @click="useStoryboardSeed(asset)"
            >
              <span class="image-gen-seed-title">{{ asset.title || '未命名种子' }}</span>
              <span class="image-gen-seed-preview">{{ asset.content }}</span>
            </button>
          </div>
        </div>

        <div v-if="materialImageAssets.length > 0" class="image-gen-results material-image-results">
          <div class="image-gen-results-title">素材参考图</div>
          <div class="image-gen-grid">
            <button
              v-for="asset in materialImageAssets"
              :key="asset.id"
              class="image-gen-thumb material-image-thumb"
              type="button"
              :title="asset.title || asset.image?.prompt || '参考图'"
              @click="attachMaterialImageToSelectedCard(asset)"
            >
              <img :src="asset.image.data" :alt="asset.title || '素材参考图'" />
            </button>
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
    <Transition name="modal-fade">
      <div v-if="imagePreviewIndex >= 0" class="image-preview-overlay" @click="imagePreviewIndex = -1">
        <Transition name="modal-scale" appear>
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
        </Transition>
      </div>
    </Transition>

    <!-- 模型配置弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showImageConfigDialog && editingModelConfig" class="dialog-overlay" @click="showImageConfigDialog = false">
        <Transition name="modal-scale" appear>
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
        </Transition>
      </div>
    </Transition>

    <!-- 卡片详情对话框（分镜模式） -->
    <Transition name="modal-fade">
      <div v-if="showCardDetailDialog && selectedCard" class="dialog-overlay" @click="showCardDetailDialog = false">
        <Transition name="modal-scale" appear>
          <div class="dialog" @click.stop>
            <div class="dialog-header">镜头参数</div>
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
              <button class="btn-primary" @click="saveCardDetail(); showCardDetailDialog = false">保存</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

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
        :quickQuestions="[
          { label: '检查镜头顺序', question: '检查当前镜头/卡片的排列顺序，指出不连贯之处。', scope: 'chapter', taskType: 'advisor.review.chapter' },
          { label: '分析关系结构', question: '分析素材卡片之间的逻辑关系和结构层次。', scope: 'chapter', taskType: 'advisor.review.chapter' },
          { label: '转场建议', question: '分析卡片之间的转场，给出衔接建议。', scope: 'thread', taskType: 'advisor.close.thread' },
          { label: '遗漏镜头', question: '检查当前分镜，找出遗漏或缺失的镜头。', scope: 'chapter', taskType: 'advisor.review.chapter' }
        ]"
        :emptyText="'创作顾问可帮你分析素材关系、镜头节奏和分镜推进方向。'"
        @close="closeAdvisor"
        @ask="handleAskAdvisor"
      />
    </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { getResolvedApiSettings, recordPreference } from '../services/api'
import { useAdvisor } from '../composables/useAdvisor'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import CanvasEdgeLegend from '../components/canvas/CanvasEdgeLegend.vue'
import CanvasTimeline from '../components/canvas/CanvasTimeline.vue'
import {
  saveValidatedStoryboardVersion
} from '../services/storyboardStore'
import {
  generateProseCardsFromTopic
} from '../services/proseGeneration'
import {
  buildEditingPackage,
  buildEditingPackageZip,
  extractShotsFromProseEssay,
  toMarkdown
} from '../services/shotExporter'
import {
  addNarrativeAsset,
  listNarrativeAssets
} from '../services/narrativeAssets'

const router = useRouter()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const { advisorOpen, advisorMessages, advisorLoading, askAdvisor, openAdvisor, closeAdvisor } = useAdvisor()

// Mode switching
const currentMode = ref('directing')

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
const storyboardSeedAssets = ref([])
const materialImageAssets = ref([])
const canvasAssets = ref([])
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
  { value: 'continuation', label: '前后镜', desc: '镜头顺序推进' },
  { value: 'elaboration', label: '因果', desc: '动作与结果' },
  { value: 'contrast', label: '对照', desc: '对立或反差' },
  { value: 'parallel', label: '同场', desc: '同一空间并置' },
  { value: 'consciousness', label: '视觉呼应', desc: '构图或意象呼应' }
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
const newEdgeType = ref('continuation')
const linkingActive = ref(false)
const edgeDeleteActive = ref(false)
const linkSourceCardId = ref('')
const edgeLinkDraft = ref(null)
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
const timelineItems = computed(() => outline.value
  .map((item, index) => makeTimelineItem(item, index))
  .filter(Boolean))
const timelineTotalDuration = computed(() => timelineItems.value.reduce((sum, item) => sum + item.duration, 0))
const selectedCardTimelineIndex = computed(() => getSelectedCardTimelineIndex())
const selectedCardInTimeline = computed(() => selectedCardTimelineIndex.value >= 0)
const selectedCardTimelineSequence = computed(() => selectedCard.value ? getCardTimelineSequence(selectedCard.value.id) : 0)

function layoutCards(cardsToLayout) {
  if (!cardWallRef.value) return
  const xGap = 252
  const yGap = 174
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
    const sourceRect = sourceEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()
    const wallRect = wall.getBoundingClientRect()
    const sourcePoint = getConnectorPoint(
      rectToLocalRect(sourceRect, wallRect, wall),
      rectToLocalRect(targetRect, wallRect, wall).centerX,
      rectToLocalRect(targetRect, wallRect, wall).centerY
    )
    const targetPoint = getConnectorPoint(
      rectToLocalRect(targetRect, wallRect, wall),
      rectToLocalRect(sourceRect, wallRect, wall).centerX,
      rectToLocalRect(sourceRect, wallRect, wall).centerY
    )
    return {
      ...edge,
      d: makeEdgePath(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y),
      x1: sourcePoint.x, y1: sourcePoint.y, x2: targetPoint.x, y2: targetPoint.y
    }
  }).filter(Boolean)
}

const renderedEdges = ref([])
const edgeLinkDraftPath = computed(() => {
  if (!edgeLinkDraft.value) return ''
  return makeEdgePath(edgeLinkDraft.value.x1, edgeLinkDraft.value.y1, edgeLinkDraft.value.x2, edgeLinkDraft.value.y2)
})

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
  renderedEdges.value = computeEdgePaths()
  canvasWidth.value = Math.max(wall.scrollWidth, wall.clientWidth) + 100
  canvasHeight.value = Math.max(wall.scrollHeight, wall.clientHeight) + 100
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
  loadCanvasAssets()
  loadData()
  apiSettings.value = await getResolvedApiSettings()
  document.addEventListener('keydown', handleKeydown)
  loadImageConfigs()
  loadImageLibrary()
  loadStoryboardSeedAssets()
  loadMaterialImageAssets()
  await nextTick()
  focusAssetCardFromRoute()
})

watch(() => route.query.assetId, () => {
  loadCanvasAssets()
  focusAssetCardFromRoute()
})

// Advisor functions
function collectProseContext() {
  return {
    mode: currentMode.value,
    cards: flatCards.value.map(c => ({
      id: c.id,
      content: c.content,
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

function handleAskAdvisor(input) {
  const action = typeof input === 'string'
    ? { label: input, question: input, scope: 'chapter', taskType: 'advisor.review.chapter' }
    : input
  askAdvisor({ ...action, mode: 'prose' }, collectProseContext)
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
      x: card.x ?? (60 + (idx % 3) * 252),
      y: card.y ?? (60 + Math.floor(idx / 3) * 174),
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

function loadCanvasAssets() {
  canvasAssets.value = listNarrativeAssets({ status: null })
}

function getCardAsset(card) {
  if (!card?.assetId) return null
  return canvasAssets.value.find((asset) => asset.id === card.assetId) || null
}

function getCardFullContent(card) {
  return String(getCardAsset(card)?.content || card?.content || '').trim() || '暂无内容'
}

function getCardTitle(card) {
  const title = String(getCardAsset(card)?.title || card?.content || '未命名节点').trim()
  return title.length > 30 ? `${title.slice(0, 30)}...` : title
}

function getCardPreview(card) {
  const content = getCardFullContent(card).replace(/\s+/g, ' ')
  return content.length > 44 ? `${content.slice(0, 44)}...` : content
}

function getCardPreviewImage(card) {
  return getCardImageEntries(card).find((entry) => entry.data)?.data || ''
}

function getCardImageEntries(card) {
  const entries = []
  const asset = getCardAsset(card)
  if (asset?.image) {
    entries.push(normalizeCardImageEntry(asset.image, {
      source: 'asset',
      assetId: asset.id,
      assetKind: asset.kind,
      title: asset.title
    }))
  }

  if (Array.isArray(card?.attachedImages)) {
    card.attachedImages.forEach((image) => {
      entries.push(normalizeCardImageEntry(image, {
        source: image.source || 'card-attachment',
        assetId: image.assetId || '',
        assetKind: image.assetKind || '',
        title: image.title || ''
      }))
    })
  }

  const seen = new Set()
  return entries.filter((entry) => {
    if (!entry?.data && !entry?.id) return false
    const key = `${entry.source}:${entry.assetId}:${entry.id}:${entry.prompt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeCardImageEntry(image = {}, context = {}) {
  if (!image) return null
  return {
    id: String(image.id || context.assetId || '').trim(),
    assetId: String(image.assetId || context.assetId || '').trim(),
    assetKind: String(image.assetKind || context.assetKind || '').trim(),
    source: String(image.source || context.source || '').trim(),
    title: String(image.title || context.title || '').trim(),
    prompt: String(image.prompt || '').trim(),
    width: Number(image.width) || null,
    height: Number(image.height) || null,
    hasData: Boolean(image.data),
    data: image.data || ''
  }
}

function getCardImageReferences(card) {
  return getCardImageEntries(card).map((entry) => {
    const reference = {
      id: entry.id,
      assetId: entry.assetId,
      assetKind: entry.assetKind,
      source: entry.source,
      title: entry.title,
      prompt: entry.prompt,
      width: entry.width,
      height: entry.height,
      hasData: entry.hasData
    }
    return Object.fromEntries(Object.entries(reference).filter(([, value]) => value !== '' && value !== null && value !== undefined))
  })
}

function openCardMaterial(card) {
  if (!card?.assetId) return
  router.push({ name: 'materials', query: { assetId: card.assetId } })
}

function focusAssetCardFromRoute() {
  const assetId = String(route.query.assetId || '')
  if (!assetId) return
  const card = cards.value.find((item) => item.assetId === assetId)
  if (!card) return
  selectCard(card)
  nextTick(() => jumpToCard(card.id))
}

function createCardFromAsset(asset, emotion = 'calm', extraFields = null) {
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetId: asset.id,
    content: asset.content,
    emotion,
    wordCount: countWords(asset.content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pileId: null,
    zone: 'material',
    x: null,
    y: null,
    extraFields
  }
}

function createMaterialCard(content, emotion = 'calm', extraFields = null, sourceId = '') {
  const normalizedContent = String(content || '').trim()
  if (!normalizedContent) return null
  const asset = addNarrativeAsset({
    title: normalizedContent.slice(0, 24),
    content: normalizedContent,
    kind: 'storyboard-seed',
    status: 'accepted',
    source: {
      type: 'relation-canvas',
      id: sourceId
    }
  })
  canvasAssets.value = [asset, ...canvasAssets.value.filter((item) => item.id !== asset.id)]
  return createCardFromAsset(asset, emotion, extraFields)
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
  if (e.key === 'Escape' && (linkingActive.value || edgeDeleteActive.value)) {
    cancelLinking()
    edgeDeleteActive.value = false
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
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

function getTimelineDuration(item) {
  const extra = getCardExtraFields(item.cardId)
  return extra?.duration || 3
}

function getOutlineCard(item) {
  if (!item) return null
  if (item.cardId) return cards.value.find((card) => card.id === item.cardId) || null
  if (item.pileId) {
    const pile = piles.value.find((entry) => entry.pileId === item.pileId)
    const firstCardId = pile?.cardIds?.[0]
    return cards.value.find((card) => card.id === firstCardId) || null
  }
  return null
}

function makeTimelineItem(item, index) {
  const card = getOutlineCard(item)
  if (!card) return null
  const extra = card.extraFields || {}
  const duration = Math.max(1, Number(extra.duration || item.duration || 3))
  const relationText = getTimelineRelationText(index, card)
  const metaParts = [
    relationText,
    extra.shotType ? getShotTypeLabel(extra.shotType) : '',
    extra.cameraMovement ? getCameraMovementLabel(extra.cameraMovement) : '',
    item.pileId ? '组' : ''
  ].filter(Boolean)
  return {
    raw: item,
    key: item.pileId || item.cardId || `${index}`,
    index,
    cardId: card.id,
    focusCardId: card.id,
    isPile: Boolean(item.pileId),
    title: getCardTitle(card),
    preview: item.preview || getCardPreview(card),
    duration,
    shotTypeLabel: extra.shotType ? getShotTypeLabel(extra.shotType) : '',
    cameraMovementLabel: extra.cameraMovement ? getCameraMovementLabel(extra.cameraMovement) : '',
    relationText,
    metaText: metaParts.join(' · ')
  }
}

function findEdgeBetweenCards(sourceId, targetId) {
  if (!sourceId || !targetId) return null
  return edges.value.find((edge) => (
    (edge.sourceId === sourceId && edge.targetId === targetId)
    || (edge.sourceId === targetId && edge.targetId === sourceId)
  )) || null
}

function getEdgeTypeLabel(edgeType) {
  return edgeTypes.find((item) => item.value === edgeType)?.label || edgeType
}

function getTimelineRelationText(index, card) {
  if (index <= 0 || !card?.id) return ''
  const previousCard = getOutlineCard(outline.value[index - 1])
  if (!previousCard?.id) return ''
  const relation = findEdgeBetweenCards(previousCard.id, card.id)
  return relation ? `接 ${getEdgeTypeLabel(relation.type)}` : ''
}

function jumpToTimelineItem(item) {
  if (!item?.focusCardId) return
  jumpToCard(item.focusCardId)
}

function getCardTimelineSequence(cardId) {
  if (!cardId) return 0
  const card = cards.value.find((item) => item.id === cardId)
  const index = outline.value.findIndex((item) => {
    if (item.cardId === cardId) return true
    return Boolean(card?.pileId && item.pileId === card.pileId)
  })
  return index >= 0 ? index + 1 : 0
}

function isCardInTimeline(cardId) {
  return getCardTimelineSequence(cardId) > 0
}

function getCardExtraFields(cardId) {
  if (!cardId) return null
  const card = cards.value.find(c => c.id === cardId)
  return card?.extraFields || null
}

function selectCard(card) {
  selectedCard.value = card
  editingContent.value = getCardFullContent(card)
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
  if (!card.assetId) {
    card.content = editingContent.value
    card.wordCount = countWords(editingContent.value)
  }
  card.emotion = editingEmotion.value
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

function sendSelectedCardToMaterials() {
  if (!selectedCard.value) return
  const card = selectedCard.value
  const firstImage = Array.isArray(card.attachedImages) ? card.attachedImages[0] : null
  const assetKind = firstImage?.data ? 'reference-image' : 'storyboard-seed'
  const lines = []
  if (currentTopic.value.trim()) {
    lines.push(`主题：${currentTopic.value.trim()}`)
  }
  lines.push(`卡片：${card.content || '未命名卡片'}`)
  if (card.extraFields?.shotType) {
    lines.push(`景别：${getShotTypeLabel(card.extraFields.shotType)}`)
  }
  if (card.extraFields?.cameraMovement) {
    lines.push(`运镜：${getCameraMovementLabel(card.extraFields.cameraMovement)}`)
  }
  if (card.extraFields?.duration) {
    lines.push(`时长：${card.extraFields.duration}s`)
  }

  const asset = addNarrativeAsset({
    title: String(card.content || currentTopic.value || '画布节点').slice(0, 24),
    content: lines.join('；'),
    kind: assetKind,
    status: 'accepted',
    source: {
      type: 'prose-card',
      id: card.id
    },
    image: firstImage?.data ? {
      id: firstImage.id,
      prompt: firstImage.prompt,
      data: firstImage.data
    } : null
  })

  card.assetId = asset.id
  card.wordCount = countWords(asset.content)
  canvasAssets.value = [asset, ...canvasAssets.value.filter((item) => item.id !== asset.id)]
  addTimeline(`转为素材节点：${asset.title}`)
  saveData()
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
    console.error('生成分镜卡片失败:', e)
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
    const extraFields = {
      shotType: item.shotType || '',
      cameraMovement: item.cameraMovement || '',
      duration: item.duration || 3,
      dialogue: item.dialogue || '',
      soundEffects: item.soundEffects || ''
    }
    return createMaterialCard(item.content, emotion, extraFields, topic)
  }).filter(Boolean)

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
      preview: getCardPreview(selectedCard.value)
    })
  }
  createSnapshot('加入大纲')
  saveData()
  trackPreference('adopt_card', selectedCard.value)
}

function getSelectedCardTimelineIndex() {
  if (!selectedCard.value) return -1
  if (selectedCard.value.pileId) {
    return outline.value.findIndex((item) => item.pileId === selectedCard.value.pileId)
  }
  return outline.value.findIndex((item) => item.cardId === selectedCard.value.id)
}

function toggleSelectedCardTimeline() {
  const index = getSelectedCardTimelineIndex()
  if (index >= 0) {
    removeFromOutline(index)
    return
  }
  addToOutline()
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

function onOutlineReorder(fromIndex, toIndex) {
  const items = [...outline.value]
  const dragItem = items.splice(fromIndex, 1)[0]
  items.splice(toIndex, 0, dragItem)
  outline.value = items
}

function onOutlineDrop() {
  addTimeline('大纲拖拽排序')
  saveData()
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

function clearTimeline() {
  if (outline.value.length === 0) return
  outline.value = []
  addTimeline('清空时间轴')
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
function activateLinkType(edgeType) {
  newEdgeType.value = edgeType
  edgeDeleteActive.value = false
  linkingActive.value = true
  linkSourceCardId.value = ''
  edgeLinkDraft.value = null
}

function cancelLinking() {
  linkingActive.value = false
  linkSourceCardId.value = ''
  edgeLinkDraft.value = null
}

function toggleEdgeDeleteMode() {
  if (edgeDeleteActive.value) {
    edgeDeleteActive.value = false
    return
  }
  cancelLinking()
  edgeDeleteActive.value = true
}

function toggleLinking() {
  if (linkingActive.value) {
    cancelLinking()
  } else {
    edgeDeleteActive.value = false
    linkingActive.value = true
    linkSourceCardId.value = ''
    edgeLinkDraft.value = null
  }
}

function handleCardClick(card) {
  selectCard(card)
}

function connectCards(sourceId, targetId, edgeType) {
  if (!sourceId || !targetId || sourceId === targetId) return
  const existing = edges.value.find((edge) => (
    (edge.sourceId === sourceId && edge.targetId === targetId)
    || (edge.sourceId === targetId && edge.targetId === sourceId)
  ))
  if (existing) {
    changeEdgeType(existing.id, edgeType)
    return
  }
  edges.value.push({
    id: `edge_${Date.now()}`,
    sourceId,
    targetId,
    type: edgeType
  })
  addTimeline(`添加「${edgeTypes.find((type) => type.value === edgeType)?.label}」关联`)
  saveData()
}

function rectToLocalRect(rect, wallRect, wall) {
  return {
    left: rect.left - wallRect.left + wall.scrollLeft,
    top: rect.top - wallRect.top + wall.scrollTop,
    width: rect.width,
    height: rect.height,
    centerX: rect.left - wallRect.left + wall.scrollLeft + rect.width / 2,
    centerY: rect.top - wallRect.top + wall.scrollTop + rect.height / 2,
    right: rect.right - wallRect.left + wall.scrollLeft,
    bottom: rect.bottom - wallRect.top + wall.scrollTop
  }
}

function getConnectorPoint(rect, targetX, targetY) {
  const dx = targetX - rect.centerX
  const dy = targetY - rect.centerY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? rect.right : rect.left,
      y: rect.centerY
    }
  }
  return {
    x: rect.centerX,
    y: dy >= 0 ? rect.bottom : rect.top
  }
}

function getCardWallPoint(event) {
  if (!cardWallRef.value) return { x: 0, y: 0 }
  const rect = cardWallRef.value.getBoundingClientRect()
  return {
    x: event.clientX - rect.left + cardWallRef.value.scrollLeft,
    y: event.clientY - rect.top + cardWallRef.value.scrollTop
  }
}

function onCardPointerDown(event, card) {
  if (!linkingActive.value || event.button !== 0) return
  if (event.target instanceof Element && event.target.closest('.card-actions')) return
  event.preventDefault()
  event.stopPropagation()

  const wall = cardWallRef.value
  if (!wall) return
  const sourceEl = wall.querySelector(`[data-card-id="${card.id}"]`)
  if (!sourceEl) return
  const wallRect = wall.getBoundingClientRect()
  const sourceRect = rectToLocalRect(sourceEl.getBoundingClientRect(), wallRect, wall)
  const localPoint = {
    x: event.clientX - wallRect.left + wall.scrollLeft,
    y: event.clientY - wallRect.top + wall.scrollTop
  }
  const anchor = getConnectorPoint(sourceRect, localPoint.x, localPoint.y)

  linkSourceCardId.value = card.id
  edgeLinkDraft.value = {
    sourceId: card.id,
    x1: anchor.x,
    y1: anchor.y,
    x2: anchor.x,
    y2: anchor.y
  }
  window.addEventListener('pointermove', onEdgeDraftMove)
  window.addEventListener('pointerup', onEdgeDraftEnd)
}

function onEdgeDraftMove(event) {
  if (!edgeLinkDraft.value) return
  const point = getCardWallPoint(event)
  const sourceCard = cards.value.find((item) => item.id === edgeLinkDraft.value.sourceId)
  const wall = cardWallRef.value
  if (!sourceCard || !wall) return
  const sourceEl = wall.querySelector(`[data-card-id="${sourceCard.id}"]`)
  if (!sourceEl) return
  const sourceRect = rectToLocalRect(sourceEl.getBoundingClientRect(), wall.getBoundingClientRect(), wall)
  const anchor = getConnectorPoint(sourceRect, point.x, point.y)
  edgeLinkDraft.value = {
    ...edgeLinkDraft.value,
    x1: anchor.x,
    y1: anchor.y,
    x2: point.x,
    y2: point.y
  }
}

function stopEdgeDraft() {
  window.removeEventListener('pointermove', onEdgeDraftMove)
  window.removeEventListener('pointerup', onEdgeDraftEnd)
}

function onEdgeDraftEnd(event) {
  if (!edgeLinkDraft.value) return
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-card-id]')
  const sourceId = edgeLinkDraft.value.sourceId
  const targetId = target?.dataset?.cardId
  if (targetId && targetId !== sourceId) {
    connectCards(sourceId, targetId, newEdgeType.value)
    const targetCard = cards.value.find((item) => item.id === targetId)
    if (targetCard) selectCard(targetCard)
  }
  edgeLinkDraft.value = null
  linkSourceCardId.value = ''
  stopEdgeDraft()
}

function changeEdgeType(edgeId, edgeType) {
  const edge = edges.value.find((item) => item.id === edgeId)
  if (!edge || !edgeTypes.some((item) => item.value === edgeType)) return
  edge.type = edgeType
  addTimeline(`更新为「${edgeTypes.find((item) => item.value === edgeType)?.label}」关联`)
  saveData()
}

function removeEdge(edgeId) {
  const edge = edges.value.find((item) => item.id === edgeId)
  if (!edge) return
  edges.value = edges.value.filter((item) => item.id !== edgeId)
  addTimeline('断开卡片关联')
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
const directorExportStatus = computed(() => {
  if (currentMode.value !== 'directing') return null
  const shotCount = timelineItems.value.length
  const summary = shotCount > 0 ? `${shotCount} 镜 / ${timelineTotalDuration.value}s` : '时间轴为空'
  const statusText = String(directorStoryboardStatus.value || '').trim()

  if (!lastDirectorExportContext.value) {
    const isError = Boolean(statusText && (statusText.includes('未通过') || statusText.includes('失败') || statusText.includes('缺少')))
    return {
      kind: isError ? 'error' : 'empty',
      title: isError ? '分镜未通过' : '未生成版本',
      detail: isError ? '校验失败' : summary,
      tooltip: isError ? statusText : summary,
      badge: isError ? '错' : '未'
    }
  }

  const versionId = lastDirectorExportContext.value.version?.versionId?.slice(-6) || '最新'
  if (!directorStoryboardIsCurrent.value) {
    return {
      kind: 'stale',
      title: `版本 ${versionId}`,
      detail: '需重建',
      tooltip: '画布已更新，需重新生成',
      badge: '更'
    }
  }

  const validation = lastDirectorExportContext.value.validation || lastDirectorExportContext.value.version?.validation
  const warningCount = Array.isArray(validation?.warnings) ? validation.warnings.length : 0
  return {
    kind: warningCount > 0 ? 'warning' : 'current',
    title: `版本 ${versionId}`,
    detail: warningCount > 0 ? `${warningCount} 提示` : '已同步',
    tooltip: warningCount > 0 ? `${warningCount} 条提示，内容已同步` : '内容已同步',
    badge: warningCount > 0 ? '警' : '已'
  }
})

const directorExportButtonTitle = computed(() => {
  if (!directorExportStatus.value) return '导出'
  return `${directorExportStatus.value.title} · ${directorExportStatus.value.tooltip || directorExportStatus.value.detail}`
})

const directorTimelineActionDisabled = computed(() => {
  return currentMode.value !== 'directing' || timelineItems.value.length === 0
})

const directorTimelineActionLabel = computed(() => {
  const kind = directorExportStatus.value?.kind
  if (kind === 'current' || kind === 'warning') return '下载'
  if (kind === 'stale') return '更新'
  return '生成'
})

const directorTimelineActionTitle = computed(() => {
  if (timelineItems.value.length === 0) return '先把节点加入时间轴'
  const kind = directorExportStatus.value?.kind
  if (kind === 'current' || kind === 'warning') return '下载当前分镜 Markdown'
  if (kind === 'stale') return '画布已变化，更新分镜版本'
  return '根据当前时间轴生成分镜版本'
})

function handleDirectorTimelineAction() {
  if (directorTimelineActionDisabled.value) return
  const kind = directorExportStatus.value?.kind
  if (kind === 'current' || kind === 'warning') {
    downloadDirectorMarkdown()
    return
  }
  prepareDirectorStoryboardVersion()
}

function buildDirectorExportTimeline() {
  return outline.value
    .map((item, index) => {
      const card = getOutlineCard(item)
      if (!card) return null
      const ef = card.extraFields || {}
      const previousCard = index > 0 ? getOutlineCard(outline.value[index - 1]) : null
      const relation = previousCard ? findEdgeBetweenCards(previousCard.id, card.id) : null
      const imageReferences = getCardImageReferences(card)
      return {
        cardId: card.id,
        assetId: card.assetId || '',
        order: index,
        emotion: card.emotion || '',
        duration: ef.duration || item.duration || 3,
        relationType: relation?.type || '',
        relationLabel: relation ? getEdgeTypeLabel(relation.type) : '',
        imageReferences
      }
    })
    .filter(Boolean)
}

function buildDirectorExportCards() {
  return cards.value.map((card) => ({
    ...card,
    content: getCardFullContent(card),
    attachedImages: getCardImageReferences(card)
  }))
}

function buildDirectorSourceExcerpt() {
  return outline.value
    .map((item) => {
      const card = getOutlineCard(item)
      return card ? getCardFullContent(card) : ''
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 240)
}

function createDirectorExportFingerprint(shots, topic) {
  return JSON.stringify({
    topic: String(topic || '').trim(),
    shots: (shots || []).map((shot) => [
      shot.sequence,
      shot.assetId,
      shot.content,
      shot.shotType,
      shot.camera,
      shot.duration,
      shot.dialogue,
      shot.sound,
      shot.transition,
      shot.relationType,
      shot.relationLabel,
      shot.tone,
      shot.emotion,
      JSON.stringify(shot.imageReferences || [])
    ])
  })
}

function buildDirectorRawShots() {
  return extractShotsFromProseEssay({
    cards: buildDirectorExportCards(),
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
  const sourceTitle = String(currentTopic.value || '').trim() || '卡片画布'
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
    let md = `# ${currentTopic.value || '卡片画布'}\n\n`
    for (let i = 0; i < outline.value.length; i++) {
      const item = outline.value[i]
      const card = cards.value.find(c => c.id === item.cardId)
      if (card) {
        md += `## ${i + 1}\n\n${card.content}\n\n---\n\n`
      }
    }
    md += '\n**衔接提示**：请在以上留空处补充过渡句，使文章更流畅。\n'
    downloadFile(md, '卡片画布.md', 'text/markdown')
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
  const visuals = {
    consciousness: { stroke: '#7f8ea3', strokeWidth: 1.6, strokeDasharray: '8 5', opacity: 0.65 },
    contrast: { stroke: '#ef5350', strokeWidth: 2.3, strokeDasharray: '3 5', opacity: 0.82 },
    elaboration: { stroke: '#66bb6a', strokeWidth: 2.2, strokeDasharray: 'none', opacity: 0.8 },
    parallel: { stroke: '#ab47bc', strokeWidth: 1.9, strokeDasharray: '5 4', opacity: 0.72 },
    continuation: { stroke: 'var(--accent)', strokeWidth: 2.5, strokeDasharray: '10 4', opacity: 0.9 }
  }
  const visual = visuals[edge.type] || visuals.continuation

  if (currentMode.value === 'directing') {
    const edgeTypeConfig = directorEdgeTypes.find(e => e.value === edge.type)
    return {
      ...visual,
      stroke: edgeTypeConfig?.color || visual.stroke
    }
  }
  return visual
}

function getEdgePreviewStyle(edgeType) {
  const style = getEdgeStyle({ type: edgeType })
  return {
    opacity: style.opacity,
    borderTop: `${Math.max(style.strokeWidth, 2)}px ${style.strokeDasharray && style.strokeDasharray !== 'none' ? 'dashed' : 'solid'} ${style.stroke}`
  }
}

function exportToTxt() {
  showExportMenu.value = false
  let txt = `${currentTopic.value || '卡片画布'}\n${'='.repeat(30)}\n\n`

  for (let i = 0; i < outline.value.length; i++) {
    const item = outline.value[i]
    const card = cards.value.find(c => c.id === item.cardId)
    if (card) {
      txt += `【${i + 1}】\n${card.content}\n\n`
    }
  }

  txt += '\n【衔接提示】请在留空处补充过渡句，使文章更流畅。\n'
  downloadFile(txt, '卡片画布.txt', 'text/plain')
  addTimeline('导出为 TXT')
}

function exportToJson() {
  showExportMenu.value = false
  try {
    if (currentMode.value === 'directing') {
      const directorExport = getDirectorExportContext()
      const exportTimeline = buildDirectorExportTimeline()
      const prompts = directorExport.shots.map((shot) => ({
        index: shot.sequence,
        assetId: shot.assetId || '',
        shotType: shot.shotType || 'medium',
        cameraMovement: shot.camera || 'fixed',
        duration: shot.duration || 3,
        description: shot.content || '',
        dialogue: shot.dialogue || '',
        soundEffects: shot.sound || '',
        referenceImages: Array.isArray(shot.imageReferences) ? shot.imageReferences : []
      }))
      const data = {
        topic: currentTopic.value,
        exportedAt: new Date().toISOString(),
        mode: 'directing',
        storyboardDocumentId: directorExport.document.id,
        storyboardVersionId: directorExport.version.versionId,
        validation: directorExport.version.validation,
        timeline: exportTimeline,
        prompts
      }
      downloadFile(JSON.stringify(data, null, 2), 'AI视频提示词.json', 'application/json')
      directorStoryboardStatus.value = `已导出分镜 JSON，版本 ${directorExport.version.versionId.slice(-6)}`
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
      downloadFile(JSON.stringify(data, null, 2), '卡片画布_关系网.json', 'application/json')
      addTimeline('导出完整关系网 JSON')
    }
  } catch (error) {
    directorStoryboardStatus.value = error?.validation?.errors?.[0] || error?.message || '导出失败'
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

function exportEditingPackage() {
  showExportMenu.value = false
  try {
    const directorExport = getDirectorExportContext()
    const shots = getDirectorStoryboardShots(directorExport)
    const versionId = directorExport.version.versionId
    const packageData = buildEditingPackage(shots, {
      topic: currentTopic.value || '未命名',
      storyboardDocumentId: directorExport.document.id,
      storyboardVersionId: versionId,
      validation: directorExport.version.validation,
      name: currentTopic.value || '卡片画布'
    })
    const zipData = buildEditingPackageZip(packageData)
    downloadFile(zipData, '分镜剪辑包.zip', 'application/zip')
    directorStoryboardStatus.value = `已导出剪辑包 ZIP，版本 ${versionId.slice(-6)}`
    addTimeline('导出统一分镜剪辑包')
  } catch (error) {
    directorStoryboardStatus.value = error?.validation?.errors?.[0] || error?.message || '导出失败'
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

function loadMaterialImageAssets() {
  materialImageAssets.value = listNarrativeAssets({ status: null })
    .filter((asset) => asset.status !== 'rejected' && asset.status !== 'archived')
    .filter((asset) => asset.kind === 'reference-image' && asset.image?.data)
    .slice(0, 12)
}

function loadStoryboardSeedAssets() {
  storyboardSeedAssets.value = listNarrativeAssets({ status: null })
    .filter((asset) => asset.status !== 'rejected' && asset.status !== 'archived')
    .filter((asset) => asset.kind === 'storyboard-seed')
    .slice(0, 10)
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

function useStoryboardSeed(asset) {
  if (!asset) return
  imagePrompt.value = String(asset.content || asset.title || '').trim()
  imageDrawerOpen.value = true
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
  attachImageEntryToCard(selectedCard.value.id, imgEntry)
}

function attachImageEntryToCard(cardId, imgEntry) {
  if (!cardId || !imgEntry?.data) return
  const card = cards.value.find(c => c.id === cardId)
  if (!card) return
  if (!card.attachedImages) card.attachedImages = []
  if (card.attachedImages.length >= 3) {
    alert('最多附加3张图片')
    return
  }
  card.attachedImages.push({
    id: imgEntry.id,
    assetId: imgEntry.assetId || '',
    assetKind: imgEntry.assetKind || '',
    source: imgEntry.source || 'card-attachment',
    title: imgEntry.title || '',
    prompt: imgEntry.prompt,
    data: imgEntry.data,
    width: imgEntry.width || null,
    height: imgEntry.height || null
  })
  saveData()
  imagePreviewIndex.value = -1
}

function attachMaterialImageToSelectedCard(asset) {
  if (!selectedCard.value) {
    alert('请先选择一张卡片')
    return
  }
  attachImageEntryToCard(selectedCard.value.id, {
    id: asset.image?.id || asset.id,
    assetId: asset.id,
    assetKind: asset.kind,
    source: 'asset',
    title: asset.title || '',
    prompt: asset.image?.prompt || asset.content || asset.title || '',
    data: asset.image?.data,
    width: asset.image?.width || null,
    height: asset.image?.height || null
  })
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
  if (!imgEntry?.data) return
  const asset = addNarrativeAsset({
    title: String(imgEntry.prompt || '参考图').slice(0, 24),
    content: imgEntry.prompt || '参考图',
    kind: 'reference-image',
    status: 'accepted',
    source: { type: 'relation-canvas', id: imgEntry.id },
    image: {
      id: imgEntry.id,
      prompt: imgEntry.prompt,
      data: imgEntry.data
    }
  })
  canvasAssets.value = [asset, ...canvasAssets.value.filter((item) => item.id !== asset.id)]
  cards.value.push(createCardFromAsset(asset))
  saveData()
  imagePreviewIndex.value = -1
}

function copyImagePrompt(imgEntry) {
  navigator.clipboard.writeText(imgEntry.prompt)
}

function saveToMaterialLib(imgEntry) {
  if (!imgEntry?.data) return
  addNarrativeAsset({
    title: (imgEntry.prompt || '参考图').slice(0, 24),
    content: imgEntry.prompt || '参考图',
    kind: 'reference-image',
    status: 'inbox',
    source: {
      type: 'prose-image',
      id: imgEntry.id
    },
    image: {
      id: imgEntry.id,
      prompt: imgEntry.prompt,
      data: imgEntry.data,
      negativePrompt: imgEntry.negativePrompt,
      modelName: imgEntry.modelName,
      modelType: imgEntry.modelType,
      width: imgEntry.width,
      height: imgEntry.height
    }
  })
  loadMaterialImageAssets()
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
  color: var(--accent-text);
  font-weight: 600;
}

.mode-label:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  background-color: var(--bg-primary);
  background-image:
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-secondary) 10%, transparent) 1px, transparent 0);
  background-size: 18px 18px;
}

.card-wall.storyboard-mode {
  background-image:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, transparent), transparent 180px),
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-secondary) 10%, transparent) 1px, transparent 0);
  background-size: auto, 18px 18px;
}

.card-wall.has-cards {
  overflow: auto;
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
  width: 224px;
  min-height: 122px;
  background: var(--card-accent, var(--bg-secondary));
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 2;
  color: var(--text-primary);
}

.writing-card.storyboard-card {
  border-left: 3px solid var(--accent);
  min-height: 124px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 10%, transparent);
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

.writing-card.link-source {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
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
  justify-content: flex-start;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 5px;
  gap: 6px;
  flex-shrink: 0;
}

.card-storyboard-badge {
  margin-bottom: 6px;
  display: flex;
  justify-content: flex-start;
}

.card-storyboard-badge span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: 10px;
  line-height: 1.2;
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

.card-preview-thumb {
  display: block;
  width: 100%;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}

.card-title {
  margin-bottom: 3px;
  font-size: 13px;
  line-height: 1.3;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-preview-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  margin: 2px 0 6px;
  padding: 3px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg-primary) 54%, transparent);
  color: var(--text-muted);
}

.card-preview-empty-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 58%, var(--text-muted));
  flex-shrink: 0;
}

.card-preview-empty-text {
  min-width: 0;
  font-size: 11px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 22px;
}

.pile-badge {
  display: flex;
  align-items: center;
  color: var(--accent);
  opacity: 0.7;
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
  color: var(--accent-text);
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

.node-index {
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-soft));
  color: var(--accent);
  font-size: 11px;
}

.node-index.muted {
  background: transparent;
  color: var(--text-muted);
}

.node-operations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.node-operations .detail-btn {
  flex: 1 1 calc(50% - 3px);
  min-width: 0;
  margin-bottom: 0;
  padding: 6px 8px;
  justify-content: center;
  font-size: 12px;
}

.node-operations .timeline-detail-btn {
  flex-basis: 100%;
}

.timeline-detail-btn.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
  color: var(--accent);
}

.node-delete-btn {
  flex-basis: 100%;
  width: 100%;
}

.detail-panel-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 500;
}

.selected-card-preview {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.detail-btn {
  width: 100%;
  justify-content: center;
  margin-bottom: 8px;
}

.edge-type-sample {
  display: block;
  width: 100%;
  height: 4px;
  margin-bottom: 6px;
}

.edge-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: visible;
}

.edge-path {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.78;
  pointer-events: none;
}

.edge-path.edge-draft {
  opacity: 0.9;
}

.edge-hit-path {
  fill: none;
  stroke: rgba(255, 255, 255, 0.001);
  stroke-width: 16;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
  cursor: pointer;
}

.edge-group.deletable:hover .edge-path {
  opacity: 1 !important;
  filter: drop-shadow(0 0 4px rgba(239, 83, 80, 0.35));
}

.relation-add-btn {
  width: 100%;
  justify-content: center;
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
  color: var(--accent-text);
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

.btn-secondary.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-accent {
  background: var(--accent);
  color: var(--accent-text);
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
  color: var(--accent-text);
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


/* Card badges for director mode */
.card-shot-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  line-height: 1.2;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border-radius: 4px;
  font-weight: 500;
  margin-left: 4px;
}

.card-duration-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  line-height: 1.2;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text-secondary);
  border-radius: 4px;
  font-weight: 500;
  margin-left: 4px;
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
  position: relative;
  background: var(--accent);
  color: var(--accent-text);
}

.toolbar-btn.export-btn:hover {
  filter: brightness(1.06);
  color: var(--accent-text);
}

.export-btn-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  border: 2px solid var(--bg-secondary);
  background: color-mix(in srgb, var(--bg-secondary) 70%, var(--accent));
  color: var(--text-primary);
  font-size: 8px;
  line-height: 1;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: none;
}

.export-btn-badge.is-current {
  background: color-mix(in srgb, var(--bg-secondary) 72%, var(--accent));
}

.export-btn-badge.is-stale {
  background: color-mix(in srgb, var(--bg-secondary) 76%, #f59f00);
}

.export-btn-badge.is-warning {
  background: color-mix(in srgb, var(--bg-secondary) 76%, #f59f00);
}

.export-btn-badge.is-empty {
  background: color-mix(in srgb, var(--bg-secondary) 80%, var(--text-muted));
}

.export-btn-badge.is-error {
  background: color-mix(in srgb, var(--bg-secondary) 76%, var(--danger));
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

.export-status {
  display: grid;
  grid-template-columns: 7px 1fr;
  align-items: start;
  gap: 8px;
  padding: 6px 8px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 58%, transparent);
}

.export-status-dot {
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--text-muted);
}

.export-status.is-current .export-status-dot {
  background: var(--accent);
}

.export-status.is-stale .export-status-dot,
.export-status.is-warning .export-status-dot {
  background: #f59f00;
}

.export-status.is-error .export-status-dot {
  background: var(--danger);
}

.export-status-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.export-status-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.export-status-detail {
  font-size: 10px;
  line-height: 1.25;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.export-menu-separator {
  height: 1px;
  margin: 5px 2px;
  background: var(--border);
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
  color: var(--accent-text);
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
  color: var(--accent-text);
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
  color: var(--accent-text);
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
  color: var(--accent-text);
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
  color: var(--accent-text);
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
  padding: 0;
  background: var(--bg-primary);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}

.material-image-results {
  max-height: 150px;
  overflow: auto;
}

.image-gen-seed-list {
  display: grid;
  gap: 6px;
}

.image-gen-seed-item {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.image-gen-seed-item:hover {
  border-color: var(--accent);
}

.image-gen-seed-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-gen-seed-preview {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
