<template>
  <div class="poetry-lab-page">
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">诗歌灵感工坊</span>
      </div>
      <div class="title-right">
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
        <div class="mode-toggle-group">
          <span class="mode-label" :class="{ active: currentMode === 'writing' }" @click="currentMode = 'writing'">写作</span>
          <button class="mode-toggle" @click="currentMode = currentMode === 'writing' ? 'directing' : 'writing'" :class="{ 'is-directing': currentMode === 'directing' }">
            <span class="mode-toggle-dot"></span>
          </button>
          <span class="mode-label" :class="{ active: currentMode === 'directing' }" @click="currentMode = 'directing'">编导</span>
        </div>
      </div>
    </header>

    <div class="layout">
      <aside class="control-panel">
        <h2>提示词</h2>

        <textarea
          v-model="prompt"
          class="prompt-input"
          placeholder="例如：雨夜的路灯，孤独与希望并存"
        ></textarea>

        <div class="param-row">
          <div class="param-item inline">
            <label>一级</label>
            <input v-model.number="branchCount" type="number" min="3" max="8" />
          </div>
          <div class="param-item inline">
            <label>层数</label>
            <input v-model.number="depthLimit" type="number" min="2" max="4" />
          </div>
          <div class="param-item inline">
            <label>续写分支</label>
            <input v-model.number="continueCount" type="number" min="2" max="6" />
          </div>
        </div>

        <div class="btn-row">
          <button class="btn-primary" :disabled="isGenerating || isSnapshotReadonly" @click="generateTree">
            {{ isGenerating ? '生成中...' : (currentMode === 'directing' ? '生成分镜图' : '生成灵感树') }}
          </button>
          <button class="btn-secondary" :disabled="isSnapshotReadonly" @click="clearTree">清空</button>
        </div>

        <div class="btn-row">
          <button class="btn-secondary" @click="exportMarkdown" :disabled="flatNodes.length === 0 || isSnapshotReadonly">导出 Markdown</button>
          <button class="btn-secondary" @click="exportTxt" :disabled="flatNodes.length === 0 || isSnapshotReadonly">导出 TXT</button>
        </div>

        <div class="export-panel" v-if="flatNodes.length">
          <div class="export-panel-head">
            <h3>导出设置</h3>
          </div>
          <div class="control-row">
            <label>导出范围</label>
            <select v-model="exportScope" :disabled="isSnapshotReadonly">
              <option value="all">全树</option>
              <option value="custom">自定义勾选节点</option>
            </select>
          </div>
          <div class="control-row">
            <label>连接顺序</label>
            <select v-model="exportOrder" :disabled="isSnapshotReadonly">
              <option value="dfs">深度优先</option>
              <option value="bfs">广度优先</option>
            </select>
          </div>
          <div v-if="exportScope === 'custom'" class="pick-list">
            <div class="pick-toolbar">
              <div class="pick-actions">
                <button class="small-btn" :disabled="isSnapshotReadonly" @click="selectAllExportNodes">全选节点</button>
                <button class="small-btn" :disabled="isSnapshotReadonly" @click="clearExportNodes">清空节点</button>
              </div>
            </div>
            <p class="meta">单击画布节点即可切换导出；未选节点会置灰。已选 {{ exportNodeSelectedCount }} 个节点。</p>
          </div>
        </div>

        <div v-if="flatNodes.length" class="tool-panel">
          <div class="export-panel-head">
            <h3>画布工具</h3>
          </div>
          <div class="mode-switch-row">
            <button
              v-for="mode in interactionModes"
              :key="mode.value"
              class="small-btn"
              :class="{ active: interactionMode === mode.value }"
              :disabled="isSnapshotReadonly && mode.value !== 'pointer'"
              @click="interactionMode = mode.value"
            >
              {{ mode.label }}
            </button>
          </div>
          <div class="control-row" v-if="interactionMode === 'link'">
            <label>边类型</label>
            <select v-model="edgeDraftType" :disabled="isSnapshotReadonly">
              <option v-for="edgeType in editableEdgeTypes" :key="edgeType" :value="edgeType">
                {{ edgeTypeLabels[edgeType] }}
              </option>
            </select>
          </div>
          <p class="meta">
            {{ interactionModeHint }}
          </p>
        </div>

        <div class="status" v-if="statusText">{{ statusText }}</div>
        <div class="status sub" v-if="lastSourceLabel">本次来源：{{ lastSourceLabel }}</div>
        <div v-if="isSnapshotReadonly" class="status snapshot-readonly">
          正在查看快照 {{ currentSnapshotLabel }}，当前画布只读。
        </div>

        <div v-if="snapshots.length" class="history-panel">
          <div class="export-panel-head" style="cursor: pointer;" @click="historyExpanded = !historyExpanded">
            <h3>版本历史 ({{ snapshots.length }})</h3>
            <span class="collapse-arrow" :class="{ expanded: historyExpanded }">▼</span>
          </div>
          <div v-if="historyExpanded" class="history-list" style="max-height: 180px; overflow-y: auto;">
            <div
              v-for="snapshot in snapshots"
              :key="snapshot.id"
              class="history-item"
              :class="{ active: snapshotViewId === snapshot.id }"
              @click="previewSnapshot(snapshot.id)"
            >
              <span>{{ snapshot.label }}</span>
              <div class="history-item-right">
                <small>{{ formatSnapshotTime(snapshot.createdAt) }}</small>
                <button v-if="!isSnapshotReadonly" class="small-btn danger" @click.stop="deleteSnapshot(snapshot.id)" title="删除">✕</button>
              </div>
            </div>
          </div>
          <div v-if="currentSnapshot" class="history-actions">
            <button class="small-btn" @click="continueFromSnapshot(currentSnapshot.id)">从快照继续编辑</button>
            <button class="small-btn" @click="exitSnapshotPreview">退出查看</button>
          </div>
        </div>

        <div v-if="displayedSelectedNode" class="node-detail">
          <h3>当前灵感</h3>
          <p class="node-text">{{ displayedSelectedNode.text }}</p>
          <p class="meta">层级：{{ displayedSelectedNode.depth + 1 }} · 子节点：{{ displayedSelectedNode.children.length }} · 反馈分：{{ displayedSelectedNode.feedbackScore || 0 }}</p>

          <button class="btn-secondary detail-btn" @click="showNodeDetailDialog = true">详情</button>

          <div v-if="selectedNodeGroups.length" class="group-panel">
            <h4>{{ currentMode === 'directing' ? '所属场景组' : '所属意象群' }}</h4>
            <div class="group-list compact">
              <div v-for="group in selectedNodeGroups" :key="group.id" class="group-chip">{{ group.name }}</div>
            </div>
          </div>

          <div v-if="displayedImageryGroups.length" class="group-panel">
            <h4>{{ currentMode === 'directing' ? '场景组' : '意象群' }}</h4>
            <div class="group-list">
              <div v-for="group in displayedImageryGroups" :key="group.id" class="group-card">
                <strong>{{ group.name }}</strong>
                <span>{{ group.nodeIds.length }} 节点</span>
              </div>
            </div>
          </div>

          <!-- Director mode extra fields -->
          <template v-if="currentMode === 'directing'">
            <div class="detail-panel-section">
              <label>景别</label>
              <select v-model="editingShotType" class="input">
                <option value="">选择景别...</option>
                <option v-for="s in shotTypes" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
            <div class="detail-panel-section">
              <label>运镜</label>
              <select v-model="editingCameraMovement" class="input">
                <option value="">选择运镜...</option>
                <option v-for="m in cameraMovements" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div class="detail-panel-section">
              <label>时长（秒）</label>
              <input v-model.number="editingDuration" type="number" min="1" max="300" class="input" placeholder="3" />
            </div>
            <div class="detail-panel-section">
              <label>色调描述</label>
              <textarea v-model="editingToneDescription" class="input" rows="2" placeholder="冷色调、低饱和..."></textarea>
            </div>
            <div class="detail-panel-section">
              <label>声音描述</label>
              <textarea v-model="editingSoundDescription" class="input" rows="2" placeholder="雨声、背景音乐..."></textarea>
            </div>
            <button class="btn-primary save-btn" @click="saveNodeExtraFields" :disabled="isSnapshotReadonly">保存字段</button>
          </template>

          <div class="feedback-panel">
            <h4>反馈与进一步生成</h4>
            <textarea
              v-model="feedbackText"
              class="feedback-input"
              placeholder="例如：想更冷峻、更具体，减少抒情空话"
              :disabled="isSnapshotReadonly"
            ></textarea>
            <div class="feedback-actions">
              <button class="small-btn" :class="{ active: feedbackMode === 'positive' }" :disabled="isSnapshotReadonly" @click="feedbackMode = 'positive'">正向</button>
              <button class="small-btn" :class="{ active: feedbackMode === 'negative' }" :disabled="isSnapshotReadonly" @click="feedbackMode = 'negative'">负向</button>
              <button class="small-btn" :class="{ active: feedbackMode === 'neutral' }" :disabled="isSnapshotReadonly" @click="feedbackMode = 'neutral'">中性</button>
            </div>
            <div class="meta">当前模式：{{ feedbackMode === 'positive' ? '正向' : feedbackMode === 'negative' ? '负向' : '中性' }}</div>
            <div class="feedback-main-actions">
              <button class="btn-primary action-btn" :disabled="isGenerating || isSnapshotReadonly" @click="continueGenerateFromNode">继续生成</button>
              <button class="small-btn danger" :disabled="isSnapshotReadonly" @click="deleteSelectedNode">删除当前节点</button>
            </div>
          </div>
        </div>
      </aside>

      <main class="canvas-panel">
        <div class="canvas-legend" v-if="flatNodes.length">
          <div v-for="item in edgeLegendItems" :key="item.type" class="legend-item">
            <span class="legend-line" :class="`edge-${item.type.toLowerCase()}`"></span>
            <span>{{ item.label }}</span>
          </div>
        </div>
        <div v-if="flatNodes.length === 0" class="empty-state">
          <div class="empty-title">还没有灵感树</div>
          <div class="empty-desc">输入提示词后点击“生成灵感树”。</div>
        </div>

        <div v-else class="mind-canvas" ref="canvasRef" @pointerdown="onCanvasPointerDown">
          <svg class="edge-layer" :class="{ interactive: interactionMode === 'scissor' }" :width="canvasWidth" :height="canvasHeight">
            <defs>
              <marker id="edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
              </marker>
            </defs>
            <path
              v-for="edge in renderedEdges"
              :key="edge.id"
              :d="edge.d"
              :class="['edge', `edge-${edge.type.toLowerCase()}`, { removable: interactionMode === 'scissor' && !edge.builtIn }]"
              :style="getEdgeSvgStyle(edge.type)"
              @click.stop="onEdgeClick(edge)"
              marker-end="url(#edge-arrow)"
            />
            <path
              v-if="interactionMode === 'scissor'"
              v-for="edge in renderedEdges"
              :key="'hit-' + edge.id"
              :d="edge.d"
              stroke="transparent"
              stroke-width="12"
              fill="none"
              style="cursor: pointer;"
              @click.stop="onEdgeClick(edge)"
            />
            <path
              v-if="edgeLinkDraft"
              class="edge edge-draft"
              :d="edgeLinkDraftPath"
            />
          </svg>

          <div
            v-if="groupDraft"
            class="selection-rect"
            :style="selectionRectStyle"
          ></div>

          <div
            v-for="node in flatNodes"
            :key="node.id"
            class="idea-node"
            :class="[
              `depth-${Math.min(node.depth, 3)}`,
              {
                active: displayedSelectedNode && displayedSelectedNode.id === node.id,
                muted: exportScope === 'custom' && !isNodeExportSelected(node.id),
                'import-picked': quickNoteImportOpen && isNodeExportSelected(node.id),
                grouped: isNodeInGroup(node.id),
                readonly: isSnapshotReadonly,
                'scissor-pending': scissorDeletePendingNodeId === node.id
              }
            ]"
            :data-node-id="node.id"
            :style="{
              left: `${node.x}px`,
              top: `${node.y}px`
            }"
            @click="onNodeClick(node)"
            @pointerdown.stop="onNodePointerDown($event, node)"
            :title="nodeTitle(node)"
          >
            <label v-if="exportScope === 'custom' && !isSnapshotReadonly" class="node-check" @click.stop>
              <input
                type="checkbox"
                :checked="isNodeExportSelected(node.id)"
                @change="toggleExportNodeSelection(node.id)"
              />
            </label>
            <div class="node-main">{{ node.text }}</div>
            <div v-if="node.examples && node.examples[0]" class="node-sub">{{ node.examples[0] }}</div>
            <div v-if="quickNoteImportOpen && !node.children?.length && isNodeExportSelected(node.id)" class="import-mark">选中</div>
          </div>
        </div>
      </main>
    </div>

    <!-- 节点详情对话框 -->
    <div v-if="showNodeDetailDialog && displayedSelectedNode" class="dialog-overlay" @click="showNodeDetailDialog = false">
      <div class="dialog" @click.stop>
        <div class="dialog-header">节点详情</div>
        <div class="dialog-body">
          <div class="form-group">
            <label>标题</label>
            <div class="dialog-node-text">{{ displayedSelectedNode.text }}</div>
          </div>
          <div v-if="displayedSelectedNode.examples && displayedSelectedNode.examples.length" class="form-group">
            <label>例句</label>
            <div v-for="(ex, i) in displayedSelectedNode.examples" :key="i" class="dialog-example">{{ ex }}</div>
          </div>
          <div class="form-group">
            <label>元数据</label>
            <div class="dialog-meta">层级：{{ displayedSelectedNode.depth + 1 }} · 子节点：{{ displayedSelectedNode.children.length }} · 反馈分：{{ displayedSelectedNode.feedbackScore || 0 }}</div>
          </div>
          <template v-if="currentMode === 'directing'">
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
              <input v-model.number="editingDuration" type="number" min="1" max="300" class="input" />
            </div>
            <div class="form-group">
              <label>色调描述</label>
              <textarea v-model="editingToneDescription" class="input" rows="2"></textarea>
            </div>
            <div class="form-group">
              <label>声音描述</label>
              <textarea v-model="editingSoundDescription" class="input" rows="2"></textarea>
            </div>
          </template>
        </div>
        <div class="dialog-footer">
          <button class="btn" @click="showNodeDetailDialog = false">关闭</button>
          <button v-if="currentMode === 'directing'" class="btn-primary" @click="saveNodeExtraFields">保存</button>
        </div>
      </div>
    </div>

    <ImageGenRail
      storage-key="poetry_image_library_v1"
      side="left"
      :vertical-offset="0"
      :horizontal-offset="340"
      drawer-title="诗歌生图"
      selected-prompt-label="节点及例句"
      :selected-text="selectedNodePrompt"
    />

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
            <button class="quick-note-icon-btn" type="button" @click="toggleQuickNoteImport" title="导入" aria-label="导入">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 6.5v7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                <path d="M9.5 11l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
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
        <div v-if="quickNoteImportOpen" class="quick-note-import-panel">
          <div class="quick-note-import-toolbar">
            <span class="quick-note-import-title">导入叶节点</span>
            <button class="quick-note-mini-btn primary" type="button" @click="importSelectedLeafNodes">导入</button>
            <button class="quick-note-mini-btn" type="button" @click="clearLeafImports">清空</button>
          </div>
          <div class="quick-note-import-body">
            <div class="quick-note-import-left">
              <div class="quick-note-import-empty">请直接在树节点区域点击叶节点进行选择。</div>
            </div>
            <aside class="quick-note-import-side">
              <div class="quick-note-stat"><span>总叶数</span><strong>{{ leafImportStats.totalCount }}</strong></div>
              <div class="quick-note-stat"><span>已选</span><strong>{{ leafImportStats.selectedCount }}</strong></div>
              <div class="quick-note-stat"><span>总字数</span><strong>{{ leafImportStats.totalWords }}</strong></div>
              <div class="quick-note-stat"><span>已选字</span><strong>{{ leafImportStats.selectedWords }}</strong></div>
            </aside>
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

    <!-- 创作顾问悬浮按钮 -->
    <button class="advisor-fab" @click="openAdvisor" title="打开创作顾问">
      <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="5"></circle>
        <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"/>
      </svg>
    </button>

    <AdvisorPanel
      :isOpen="advisorOpen"
      :onGetAdvice="handleGetAdviceAI"
      :contextProvider="collectPoetryContext"
      @close="closeAdvisor"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getApiSettings, sendChat } from '../services/api'
import { runGenerationRetryPlan } from '../services/generationRetry'
import { useTheme } from '../composables/useTheme'
import ImageGenRail from '../components/ImageGenRail.vue'
import AdvisorPanel from '../components/AdvisorPanel.vue'
import { getItem, getTextItem, removeItem, setItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'

const TREE_KEY = STORAGE_KEYS.POETRY_IDEA_TREE_V2
const POS_KEY = STORAGE_KEYS.POETRY_IDEA_POSITIONS_V2
const ADAPT_KEY = STORAGE_KEYS.POETRY_ADAPT_PROFILE_V2
const GRAPH_EDGE_KEY = STORAGE_KEYS.POETRY_GRAPH_EDGES_V1
const GROUP_KEY = STORAGE_KEYS.POETRY_IMAGERY_GROUPS_V1
const SNAPSHOT_KEY = STORAGE_KEYS.POETRY_SNAPSHOTS_V1
const LLM_DEBUG_PREFIX = '[PoetryLab LLM]'
const EDGE_TYPE_LABELS = {
  HIERARCHY: '层级',
  METAPHOR: '隐喻',
  JUXTAPOSE: '并置',
  RUPTURE: '断裂',
  ECHO: '回声'
}

// Director mode edge types
const DIRECTING_EDGE_TYPES = {
  VISUAL_METAPHOR: { label: '视觉隐喻', color: '#9c27b0', dashArray: null },
  PARALLEL_SHOT: { label: '并列镜头', color: '#2196f3', dashArray: null },
  JUMP_CUT: { label: '跳切', color: '#ff5722', dashArray: '6,4' },
  VISUAL_ECHO: { label: '视觉回声', color: '#00bcd4', dashArray: '3,3' },
  DETAIL_INSERT: { label: '细节切入', color: '#8bc34a', dashArray: null }
}

const INTERACTION_MODES = [
  { value: 'pointer', label: '指针' },
  { value: 'link', label: '连线' },
  { value: 'scissor', label: '剪刀' },
  { value: 'group', label: '成组' }
]

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const advisorOpen = ref(false)
const advisorPanelRef = ref(null)
const currentMode = ref('writing') // 'writing' | 'directing'

// Director mode shot types
const shotTypes = [
  { value: 'extreme_wide', label: '远景' },
  { value: 'wide', label: '全景' },
  { value: 'medium', label: '中景' },
  { value: 'close_up', label: '近景' },
  { value: 'extreme_close_up', label: '特写' }
]

const cameraMovements = [
  { value: 'push', label: '推' },
  { value: 'pull', label: '拉' },
  { value: 'pan', label: '摇' },
  { value: 'track', label: '移' },
  { value: 'follow', label: '跟' },
  { value: 'fixed', label: '固定' }
]

const QUICK_NOTE_DRAFT_KEY = STORAGE_KEYS.QUICK_NOTE_DRAFT
const QUICK_NOTE_STORE_KEY = STORAGE_KEYS.WRITING_NOTES

const prompt = ref('')
const branchCount = ref(5)
const depthLimit = ref(3)
const continueCount = ref(3)
const isGenerating = ref(false)
const statusText = ref('')
const lastSourceLabel = ref('')
const exportScope = ref('all')
const exportOrder = ref('dfs')
const exportPickedNodeIds = ref([])

const feedbackText = ref('')
const feedbackMode = ref('neutral')
const editingShotType = ref('')
const editingCameraMovement = ref('')
const editingDuration = ref(3)
const editingToneDescription = ref('')
const editingSoundDescription = ref('')
const quickNoteOpen = ref(false)
const quickNoteDraft = ref(loadQuickNoteDraft())
const quickNoteStatus = ref('')
const quickNoteInputRef = ref(null)
const quickNoteImportOpen = ref(false)
const exportScopeBeforeImport = ref('all')
const graphEdges = ref(loadGraphEdges())
const imageryGroups = ref(loadImageryGroups())
const snapshots = ref(loadSnapshots())
const interactionMode = ref('pointer')
const edgeDraftType = ref('METAPHOR')
const showNodeDetailDialog = ref(false)
const edgeLinkDraft = ref(null)
const groupDraft = ref(null)
const snapshotViewId = ref('')
const snapshotSelectedNodeId = ref('')
const historyExpanded = ref(false)

const rootTree = ref(loadSavedTree())
const selectedNode = ref(null)
const manualPositions = ref(loadSavedPositions())
const dragState = ref(null)

const adaptState = ref(loadAdaptState())

const canvasWidth = 1680
const canvasHeight = 1040
const canvasRef = ref(null)

const interactionModes = INTERACTION_MODES
const editableEdgeTypes = computed(() => {
  if (currentMode.value === 'directing') {
    return Object.keys(DIRECTING_EDGE_TYPES)
  }
  return ['METAPHOR', 'JUXTAPOSE', 'RUPTURE', 'ECHO', 'HIERARCHY']
})
const edgeTypeLabels = computed(() => {
  if (currentMode.value === 'directing') {
    return Object.fromEntries(Object.entries(DIRECTING_EDGE_TYPES).map(([k, v]) => [k, v.label]))
  }
  return EDGE_TYPE_LABELS
})
const edgeLegendItems = computed(() => {
  if (currentMode.value === 'directing') {
    return Object.entries(DIRECTING_EDGE_TYPES).map(([k, v]) => ({ type: k, label: v.label }))
  }
  return [
    { type: 'HIERARCHY', label: '层级' },
    { type: 'METAPHOR', label: '隐喻' },
    { type: 'JUXTAPOSE', label: '并置' },
    { type: 'RUPTURE', label: '断裂' },
    { type: 'ECHO', label: '回声' }
  ]
})

const scissorDeletePendingNodeId = ref('')
const scissorDeletePendingAt = ref(0)

if (rootTree.value && !selectedNode.value) {
  selectedNode.value = rootTree.value
  syncAuxiliaryState()
}

const currentSnapshot = computed(() => snapshots.value.find((item) => item.id === snapshotViewId.value) || null)
const isSnapshotReadonly = computed(() => Boolean(currentSnapshot.value))
const displayedRootTree = computed(() => currentSnapshot.value?.tree || rootTree.value)
const displayedGraphEdges = computed(() => currentSnapshot.value?.graphEdges || graphEdges.value)
const displayedImageryGroups = computed(() => currentSnapshot.value?.imageryGroups || imageryGroups.value)
const displayedSelectedNode = computed(() => {
  if (currentSnapshot.value) {
    return findNodeById(displayedRootTree.value, snapshotSelectedNodeId.value) || displayedRootTree.value
  }
  return selectedNode.value
})
const selectedNodePrompt = computed(() => {
  if (!displayedSelectedNode.value) return ''
  const node = displayedSelectedNode.value
  const lines = [node.text]
  if (node.examples?.[0]) lines.push(node.examples[0])
  return lines.join(' ').replace(/\n+/g, ' ').trim()
})
const currentSnapshotLabel = computed(() => currentSnapshot.value?.label || '')
const interactionModeHint = computed(() => {
  if (interactionMode.value === 'link') return '从一个节点拖到另一个节点，按当前边类型创建关系。'
  if (interactionMode.value === 'scissor') return '点击关系线删除关系，点击节点删除节点并自动记录快照。'
  if (interactionMode.value === 'group') return '在画布空白区域拖出框选，松手后为选中节点命名成组。'
  return '指针模式下可正常选择、拖动节点并保留原有生成/导出流程。'
})

watch(exportScope, (scope) => {
  if (isSnapshotReadonly.value) return
  if (scope !== 'custom') return
  if (exportPickedNodeIds.value.length) return
  if (selectedNode.value?.id) {
    exportPickedNodeIds.value = [selectedNode.value.id]
  } else if (rootTree.value?.id) {
    exportPickedNodeIds.value = [rootTree.value.id]
  }
})

function defaultAdaptState() {
  return {
    generator: {
      imagery: 0.58,
      rhythm: 0.52,
      contrast: 0.5,
      novelty: 0.55
    },
    loraLike: {
      keywordBias: {}
    },
    critic: {
      lastScore: 0.5,
      history: []
    }
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function percent(v) {
  return `${Math.round(v * 100)}%`
}

function randomId() {
  return `n_${Math.random().toString(36).slice(2, 10)}`
}

function goBack() {
  router.push('/')
}

function loadQuickNoteDraft() {
  return getTextItem(QUICK_NOTE_DRAFT_KEY)
}

function persistQuickNoteDraft() {
  setTextItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
}

function resizeQuickNoteInput(el = quickNoteInputRef.value) {
  if (!el) return
  const minHeight = 30
  const maxHeight = 104
  el.style.height = `${minHeight}px`
  const nextHeight = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${Math.max(minHeight, nextHeight)}px`
  el.style.borderRadius = nextHeight > 44 ? '12px' : '999px'
}

function handleQuickNoteInput(event) {
  persistQuickNoteDraft()
  resizeQuickNoteInput(event?.target)
}

function toggleQuickNoteImport() {
  if (!ensureEditable()) return
  if (!leafImportCandidates.value.length) {
    quickNoteStatus.value = '当前没有可导入的叶节点'
    return
  }
  quickNoteImportOpen.value = !quickNoteImportOpen.value
  if (quickNoteImportOpen.value) {
    exportScopeBeforeImport.value = exportScope.value
    exportScope.value = 'custom'
  } else {
    exportPickedNodeIds.value = []
    exportScope.value = exportScopeBeforeImport.value || 'all'
  }
}

function clearLeafImports() {
  if (!ensureEditable()) return
  exportPickedNodeIds.value = []
}

function importSelectedLeafNodes() {
  const picked = leafImportCandidates.value.filter((item) => isNodeExportSelected(item.id))
  if (!picked.length) {
    quickNoteStatus.value = '先选叶节点再导入'
    return
  }
  const text = picked.map((item) => item.text).join('\n\n')
  quickNoteDraft.value = quickNoteDraft.value ? `${quickNoteDraft.value}\n\n${text}` : text
  persistQuickNoteDraft()
  quickNoteImportOpen.value = false
  exportPickedNodeIds.value = []
  exportScope.value = exportScopeBeforeImport.value || 'all'
  quickNoteStatus.value = `已导入 ${picked.length} 个叶节点`
  nextTick(() => resizeQuickNoteInput())
}

function clearQuickNoteDraft() {
  quickNoteDraft.value = ''
  removeItem(QUICK_NOTE_DRAFT_KEY)
  nextTick(() => resizeQuickNoteInput())
}

watch(quickNoteOpen, (open) => {
  if (!open) {
    quickNoteImportOpen.value = false
    exportPickedNodeIds.value = []
    exportScope.value = exportScopeBeforeImport.value || 'all'
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

  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `速记 ${mm}-${dd} ${hh}:${mi}`
}

function saveQuickNote() {
  const content = quickNoteDraft.value.trim()
  if (!content) {
    quickNoteStatus.value = '先写点内容再保存'
    return false
  }

  let notes = []
  notes = getItem(QUICK_NOTE_STORE_KEY) || []
  if (!Array.isArray(notes)) notes = []

  notes.unshift({
    id: Date.now().toString(),
    title: buildQuickNoteTitle(content),
    content,
    contentFormat: 'md',
    wordCount: quickNoteWordCount(content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })

  setItem(QUICK_NOTE_STORE_KEY, notes)
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

function nodeTitle(node) {
  const sample = node.examples?.[0] || ''
  return sample ? `${node.text}\n${sample}` : node.text
}

function clearTree() {
  if (!ensureEditable()) return
  rootTree.value = null
  selectedNode.value = null
  feedbackText.value = ''
  manualPositions.value = {}
  graphEdges.value = []
  imageryGroups.value = []
  statusText.value = '已清空灵感树'
  lastSourceLabel.value = ''
}

function loadSavedTree() {
  return getItem(TREE_KEY)
}

function loadSavedPositions() {
  const stored = getItem(POS_KEY)
  return stored && typeof stored === 'object' ? stored : {}
}

function loadAdaptState() {
  const stored = getItem(ADAPT_KEY)
  if (!stored || typeof stored !== 'object') return defaultAdaptState()
  return {
    ...defaultAdaptState(),
    ...stored
  }
}

function loadGraphEdges() {
  const stored = getItem(GRAPH_EDGE_KEY)
  return Array.isArray(stored) ? stored : []
}

function loadImageryGroups() {
  const stored = getItem(GROUP_KEY)
  return Array.isArray(stored) ? stored : []
}

function loadSnapshots() {
  const stored = getItem(SNAPSHOT_KEY)
  return Array.isArray(stored) ? stored : []
}

function ensureEditable(message = '当前为快照只读视图，请先从版本历史继续编辑') {
  if (!isSnapshotReadonly.value) return true
  statusText.value = message
  return false
}

function cloneGraphEdges(edges = graphEdges.value) {
  return (edges || []).map((edge) => ({ ...edge }))
}

function cloneImageryGroups(groups = imageryGroups.value) {
  return (groups || []).map((group) => ({ ...group, nodeIds: [...(group.nodeIds || [])] }))
}

function makeEdgePath(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1))
  const bend = Math.min(160, dx * 0.42)
  const c1x = x1 + bend
  const c2x = x2 - bend
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}

function getEdgeSvgStyle(type) {
  if (currentMode.value === 'directing' && DIRECTING_EDGE_TYPES[type]) {
    const cfg = DIRECTING_EDGE_TYPES[type]
    return { stroke: cfg.color, 'stroke-dasharray': cfg.dashArray || 'none' }
  }
  return {}
}

function syncAuxiliaryState() {
  const validIds = new Set(flattenTree(rootTree.value).map((node) => node.id))
  graphEdges.value = graphEdges.value.filter((edge) => validIds.has(edge.sourceId) && validIds.has(edge.targetId))
  imageryGroups.value = imageryGroups.value
    .map((group) => ({ ...group, nodeIds: (group.nodeIds || []).filter((id) => validIds.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2)
  exportPickedNodeIds.value = exportPickedNodeIds.value.filter((id) => validIds.has(id))
  if (selectedNode.value && !validIds.has(selectedNode.value.id)) {
    selectedNode.value = rootTree.value || null
  }
}

function recordSnapshot(label) {
  if (!rootTree.value) return
  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  snapshots.value = [
    {
      id: snapshotId,
      label,
      createdAt: new Date().toISOString(),
      tree: cloneTree(rootTree.value),
      graphEdges: cloneGraphEdges(),
      imageryGroups: cloneImageryGroups(),
      selectedNodeId: selectedNode.value?.id || rootTree.value?.id || ''
    },
    ...snapshots.value
  ].slice(0, 20)
}

function clearScissorPending() {
  scissorDeletePendingNodeId.value = ''
  scissorDeletePendingAt.value = 0
}

function previewSnapshot(snapshotId) {
  const snapshot = snapshots.value.find((item) => item.id === snapshotId)
  if (!snapshot) return
  snapshotViewId.value = snapshot.id
  snapshotSelectedNodeId.value = snapshot.selectedNodeId || snapshot.tree?.id || ''
  quickNoteImportOpen.value = false
  statusText.value = `正在查看快照：${snapshot.label}`
}

function exitSnapshotPreview() {
  snapshotViewId.value = ''
  snapshotSelectedNodeId.value = ''
  statusText.value = '已退出快照查看'
}

function continueFromSnapshot(snapshotId) {
  const snapshot = snapshots.value.find((item) => item.id === snapshotId)
  if (!snapshot) return
  rootTree.value = reindexTree(cloneTree(snapshot.tree))
  graphEdges.value = cloneGraphEdges(snapshot.graphEdges)
  imageryGroups.value = cloneImageryGroups(snapshot.imageryGroups)
  selectedNode.value = findNodeById(rootTree.value, snapshot.selectedNodeId) || rootTree.value
  snapshotViewId.value = ''
  snapshotSelectedNodeId.value = ''
  historyExpanded.value = false
  statusText.value = `已从快照恢复：${snapshot.label}`
}

function deleteSnapshot(snapshotId) {
  snapshots.value = snapshots.value.filter(s => s.id !== snapshotId)
  if (snapshotViewId.value === snapshotId) {
    snapshotViewId.value = ''
    snapshotSelectedNodeId.value = ''
  }
  statusText.value = '已删除快照'
}

function formatSnapshotTime(value) {
  const date = value ? new Date(value) : new Date()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function createGraphEdge(sourceId, targetId, type = edgeDraftType.value, weight = 1) {
  if (!ensureEditable()) return
  if (!sourceId || !targetId || sourceId === targetId) return
  const exists = graphEdges.value.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId && edge.type === type)
  if (exists) {
    statusText.value = `已存在 ${EDGE_TYPE_LABELS[type]} 关系`
    return
  }
  graphEdges.value = [
    ...graphEdges.value,
    {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId,
      targetId,
      type,
      weight
    }
  ]
  statusText.value = `已新增 ${EDGE_TYPE_LABELS[type]} 关系`
}

function removeGraphEdge(edgeId) {
  if (!ensureEditable()) return
  const targetEdge = graphEdges.value.find((edge) => edge.id === edgeId)
  if (!targetEdge) return
  recordSnapshot(`删除 ${EDGE_TYPE_LABELS[targetEdge.type] || '关系'}`)
  graphEdges.value = graphEdges.value.filter((edge) => edge.id !== edgeId)
  statusText.value = '已删除关系线'
}

function isNodeInGroup(nodeId) {
  return displayedImageryGroups.value.some((group) => (group.nodeIds || []).includes(nodeId))
}

function nodeGroupLabels(nodeId) {
  return displayedImageryGroups.value.filter((group) => (group.nodeIds || []).includes(nodeId)).map((group) => group.name)
}

watch(rootTree, (newTree) => {
  if (newTree) {
    setItem(TREE_KEY, newTree)
  } else {
    removeItem(TREE_KEY)
  }
  syncAuxiliaryState()
}, { deep: true })

watch(manualPositions, (newPos) => {
  setItem(POS_KEY, newPos)
}, { deep: true })

watch(adaptState, (state) => {
  setItem(ADAPT_KEY, state)
}, { deep: true })

watch(graphEdges, (edges) => {
  setItem(GRAPH_EDGE_KEY, edges)
}, { deep: true })

watch(imageryGroups, (groups) => {
  setItem(GROUP_KEY, groups)
}, { deep: true })

watch(snapshots, (items) => {
  setItem(SNAPSHOT_KEY, items)
}, { deep: true })

watch(selectedNode, (node) => {
  if (node) {
    editingShotType.value = node.extraFields?.shotType || ''
    editingCameraMovement.value = node.extraFields?.cameraMovement || ''
    editingDuration.value = node.extraFields?.duration || 3
    editingToneDescription.value = node.extraFields?.toneDescription || ''
    editingSoundDescription.value = node.extraFields?.soundDescription || ''
  }
})

function normalizeApiSettingsShape(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    provider: src.provider || src.providerId || 'openai',
    baseUrl: src.baseUrl || src.base_url || '',
    apiKey: src.apiKey || src.api_key || src.api_key_openai || '',
    model: src.model || src.openai_model || ''
  }
}

function maskKey(key) {
  const s = String(key || '')
  if (!s) return 'missing'
  if (s.length <= 8) return `${s.slice(0, 2)}***`
  return `${s.slice(0, 3)}***${s.slice(-3)}`
}

async function resolveApiSettings() {
  const localRaw = getItem(STORAGE_KEYS.API_SETTINGS) || {}
  const local = normalizeApiSettingsShape(localRaw)

  let merged = { ...local }
  let source = 'localStorage(apiSettings)'

  if (!merged.baseUrl || !merged.apiKey || !merged.model) {
    try {
      const remoteRaw = await getApiSettings()
      const remote = normalizeApiSettingsShape(remoteRaw)
      merged = {
        provider: local.provider || remote.provider || 'openai',
        baseUrl: local.baseUrl || remote.baseUrl || '',
        apiKey: local.apiKey || remote.apiKey || '',
        model: local.model || remote.model || ''
      }
      source = 'localStorage + backend secrets'
    } catch (e) {
      console.warn(`${LLM_DEBUG_PREFIX} 拉取后端密钥失败，将只使用本地配置`, e)
    }
  }

  console.info(`${LLM_DEBUG_PREFIX} 配置摘要`, {
    source,
    provider: merged.provider || 'openai',
    baseUrl: merged.baseUrl,
    model: merged.model,
    apiKeyMasked: maskKey(merged.apiKey),
    hasApiKey: Boolean(merged.apiKey)
  })

  return merged
}

// Advisor functions
function collectPoetryContext() {
  return {
    mode: currentMode.value,
    nodes: flatNodes.value.map(n => ({
      id: n.id,
      text: n.text,
      emotion: n.emotion,
      extraFields: n.extraFields || null
    })),
    edges: displayedGraphEdges.value.map(e => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      type: e.type
    })),
    outline: displayedRootTree.value ? [displayedRootTree.value.text] : []
  }
}

async function handleGetAdviceAI(question) {
  const apiSettings = await resolveApiSettings()
  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    throw new Error('未配置 AI，请先在设置中填写 API 信息')
  }
  const context = collectPoetryContext()
  const messages = [
    { role: 'system', content: '你是一位资深的文学创作顾问，擅长为作者提供精准、实用的叙事建议。\n\n【核心原则】\n1. 简洁直接：每个建议聚焦一点，优先针对用户当前困境，不冗言铺陈\n2. 专业精准：运用叙事学专业术语（节奏、视角、张力、弧光等），分析到位不模糊\n3. 可操作：建议须具体可执行，避免空泛的"要加油"类表达\n4. 克制废话：不多次重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌开场\n\n【回复规范】\n- 优先分析当前创作状态的核心问题，再给出具体建议\n- 如涉及情绪、节奏、结构等维度，需指出具体位置或问题所在\n- 用 *动作* 格式描述角色动作，用"对话"格式描述对话，段落分明\n- 单次建议不超过 150 字，除非用户明确要求展开\n- 不重复上下文已提供的信息\n\n【用户问题类型】\n- 分析节奏/情绪分布：直接指出当前节奏或情绪的问题，给出调整方向\n- 结构建议：指出当前结构的核心问题，给出优化路径\n- 续写灵感：给出 1-2 个具体推进方向，避免发散过多\n- 自定义问题：针对问题直接作答，不答非所问' },
    { role: 'user', content: `当前创作上下文：\n${JSON.stringify(context, null, 2)}\n\n用户的问题：${question}` }
  ]
  const result = await sendChat(messages, null, null, apiSettings, { max_tokens: 1500 })
  return result?.content || result?.message?.content || '未获取到有效回复'
}

function openAdvisor() {
  advisorOpen.value = true
}

function closeAdvisor() {
  advisorOpen.value = false
}

function extractLineBlock(text) {
  const raw = String(text || '')
  const markerMatch = raw.match(/BEGIN_LINES([\s\S]*?)END_LINES/i)
  if (markerMatch?.[1]) return markerMatch[1]
  return raw
}

function sanitizeIdeaTitle(input, maxLen = 36) {
  let title = String(input || '').trim()
  if (!title) return ''

  title = title
    .replace(/^L\d+\s*[|｜]\s*N[\d.]+\s*[|｜]\s*P[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N[\d.]+\s*[|｜]\s*N?[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N[\d.]+\s*[|｜]\s*P?[\d.]+\s*[|｜]\s*/i, '')
    .replace(/^N\d+\s*P\d+\s*/i, '')
    .replace(/^[-*\d.、\s]+/, '')
    .trim()

  if (title.includes('|') || title.includes('｜')) {
    const parts = title.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length) title = parts[parts.length - 1]
  }

  return title.slice(0, maxLen).trim()
}

function isMetaNarrationTitle(title) {
  const s = String(title || '').trim()
  if (!s) return true
  if (s.length < 2) return true
  const lead = /^(我们|你|请|以下|根据|基于|现在|本次|用户反馈|继续|由于|为了)/
  const meta = /(根据用户反馈|继续生成|生成分支|输出|说明|子节点|分支如下|标题如下|请输出|我们将)/
  return lead.test(s) || meta.test(s)
}

function parseLineTree(text) {
  const block = extractLineBlock(text)
  const lines = String(block || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const items = []
  let autoId = 1
  const lastByLevel = new Map()

  for (const line of lines) {
    let depth
    let idNum
    let parentNum
    let title

    const strict = line.match(/^L(\d+)\s*[|｜]\s*N(\d+)\s*[|｜]\s*P(\d+)\s*[|｜]\s*(.+)$/i)
    if (strict) {
      depth = Number(strict[1]) - 1
      idNum = Number(strict[2])
      parentNum = Number(strict[3])
      title = String(strict[4] || '').trim()
    } else {
      const loose = line.match(/^L(\d+)\s*[:：|｜-]\s*(.+)$/i)
      if (!loose) continue
      depth = Number(loose[1]) - 1
      title = String(loose[2] || '').trim()
      idNum = autoId
      autoId += 1
      if (depth <= 0) {
        parentNum = 0
      } else {
        const parentId = lastByLevel.get(depth - 1)
        parentNum = Number.isFinite(parentId) ? parentId : 0
      }
    }

    title = sanitizeIdeaTitle(title, 36)

    if (!title) continue
    if (isMetaNarrationTitle(title)) continue
    if (depth < 0 || depth > 5) continue

    items.push({ depth, idNum, parentNum, title })
    lastByLevel.set(depth, idNum)
  }

  if (!items.length) {
    throw new Error('未解析到有效分步行格式，请稍后重试')
  }

  // Build in stream order to tolerate duplicate IDs and avoid self-cycles.
  const latestNodeBySourceId = new Map()
  const roots = []
  let root = null

  for (const item of items) {
    const parent = item.parentNum === 0 ? null : latestNodeBySourceId.get(item.parentNum)
    const node = {
      title: item.title,
      children: []
    }

    if (parent && parent !== node) {
      parent.children.push(node)
    } else {
      roots.push(node)
      if (!root || item.depth === 0) root = node
    }

    latestNodeBySourceId.set(item.idNum, node)
  }

  if (!root) root = roots[0]

  // Preserve information: if the model emits multiple root-level/orphan segments,
  // keep them by attaching under the primary root instead of dropping them.
  if (root) {
    const extraRoots = roots.filter((n) => n !== root)
    if (extraRoots.length) {
      root.children = [...(root.children || []), ...extraRoots]
    }
  }

  const parsedNodeCount = flattenRawTree(root).length
  console.info(`${LLM_DEBUG_PREFIX} 分步行解析统计`, {
    inputLineCount: lines.length,
    parsedItemCount: items.length,
    parsedNodeCount
  })

  return root
}

function extractLooseTitlesFromText(text, limit = 6) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const ban = /(解释|分析|思考|要求|约束|格式|输出|BEGIN_|END_|L\d+\|N\d+\|P\d+)/i
  const out = []

  for (const raw of lines) {
    let t = raw
      .replace(/^[-*\d.、\s]+/, '')
      .replace(/^L\d+\s*[:：|｜-]\s*/i, '')
      .replace(/[，。；：,.!！?？].*$/, '')
      .trim()

    t = sanitizeIdeaTitle(t, 18)

    if (!t) continue
    if (ban.test(t)) continue
    if (isMetaNarrationTitle(t)) continue
    if (t.length < 2) continue
    if (!out.includes(t)) out.push(t)
    if (out.length >= limit) break
  }

  return out
}

function flattenRawTree(raw, out = [], seen = new Set()) {
  if (!raw) return out
  if (seen.has(raw)) return out
  seen.add(raw)
  out.push(raw)
  const children = Array.isArray(raw.children) ? raw.children : []
  for (const child of children) flattenRawTree(child, out, seen)
  return out
}

async function buildTitleTreeByLines(promptText, count, depth, apiSettings) {
  const generationSettings = {
    ...apiSettings,
    max_tokens: 3200,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是诗歌灵感树结构生成器。',
    '请严格使用分步行格式输出，不要输出 JSON。',
    '每一行格式必须是：L<层级>|N<编号>|P<父编号>|<标题>',
    '约束：层级从1开始；根节点唯一；标题不超过18字；只能输出行，不要解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹所有行。',
    '示例：',
    'BEGIN_LINES',
    'L1|N1|P0|雨夜',
    'L2|N2|P1|路灯下的水纹',
    'L3|N3|P2|伞沿滴落',
    'END_LINES'
  ].join('\n')

  const userPrompt = [
    `主题：${promptText}`,
    `一级分支数量：${count}`,
    `最大层数：${depth}`,
    '请覆盖不同意象方向，避免同义重复。'
  ].join('\n')

  const strictRetryPrompt = [
    '上一条格式不合规。',
    '请重新输出，且只能输出分步行格式。',
    '不要任何解释文字。',
    '每行必须匹配：L<层级>|N<编号>|P<父编号>|<标题>',
    '必须用 BEGIN_LINES 开始，END_LINES 结束。'
  ].join('\n')

  const hardSystemPrompt = [
    '只做格式转换任务。',
    '输出必须是分步行格式。',
    '禁止解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹。'
  ].join('\n')

  const hardUserPrompt = [
    `主题：${promptText}`,
    `一级分支数量：${count}`,
    `最大层数：${depth}`,
    '严格输出：',
    'BEGIN_LINES',
    'L1|N1|P0|<主题>',
    'L2|N2|P1|<分支标题>',
    'L3|N3|P2|<子分支标题>',
    'END_LINES'
  ].join('\n')

  const generationResult = await runGenerationRetryPlan({
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseLineTree,
    isValidParsed: (parsed) => Boolean(parsed),
    attempts: [
      {
        name: '分步行首轮'
      },
      {
        name: '分步行二轮',
        appendMessages: [{ role: 'user', content: strictRetryPrompt }]
      },
      {
        name: '分步行三轮',
        messages: [
          { role: 'system', content: hardSystemPrompt },
          { role: 'user', content: hardUserPrompt }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  if (generationResult.success && generationResult.parsed) {
    return generationResult.parsed
  }

  throw new Error('分步行解析失败，请重试')
}

function applyExamplesByTitle(rawTree, mapping) {
  const list = flattenRawTree(rawTree)
  for (const node of list) {
    const key = sanitizeIdeaTitle(String(node.title || node.text || ''), 36)
    const got = mapping.get(key) || mapping.get(String(node.title || node.text || ''))
    if (got && got.length >= 2) {
      if (node.title) node.title = key
      if (node.text) node.text = key
      node.examples = got.slice(0, 2)
    }
  }
}

function assertAllNodesHaveExamples(rawTree) {
  const list = flattenRawTree(rawTree)
  const invalid = list.filter((node) => {
    const examples = Array.isArray(node.examples) ? node.examples.filter(Boolean) : []
    return examples.length < 2
  })

  if (invalid.length) {
    const names = invalid.slice(0, 5).map((n) => String(n.title || n.text || '未命名')).join('、')
    throw new Error(`以下节点缺少模型例句：${names}`)
  }
}

async function repairExamplesBatchByLLM(titles, apiSettings) {
  if (!titles.length) return new Map()

  const generationSettings = {
    ...apiSettings,
    max_tokens: 1800,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  }

  const systemPrompt = [
    '你是诗句补全器。',
    '我会给你一组标题。',
    '请为每个标题写2句明显不同、具体有画面感的诗句。',
    '仅输出 JSON 对象，不要解释。',
    '格式：{"items":[{"title":"...","examples":["句1","句2"]}]}'
  ].join('\n')

  const userPrompt = JSON.stringify({ titles })

  const parseExamplesJsonMap = (content) => {
    const text = String(content || '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const candidate = jsonMatch?.[0] || text

    try {
      const parsed = JSON.parse(candidate)
      const arr = Array.isArray(parsed?.items) ? parsed.items : []
      const out = new Map()
      for (const item of arr) {
        const title = sanitizeIdeaTitle(String(item?.title || '').trim(), 36)
        const examples = Array.isArray(item?.examples) ? item.examples.filter(Boolean).slice(0, 2) : []
        if (title && examples.length === 2) {
          out.set(title, examples)
        }
      }
      return out
    } catch (e) {
      return new Map()
    }
  }

  const collectExamplesMap = (attempts = []) => {
    const merged = new Map()
    for (const attempt of attempts) {
      if (attempt?.parsed instanceof Map) {
        for (const [k, v] of attempt.parsed.entries()) {
          merged.set(k, v)
        }
      }
    }
    return merged
  }

  const generationResult = await runGenerationRetryPlan({
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseExamplesJsonMap,
    isValidParsed: (parsed, { history }) => {
      const merged = collectExamplesMap([...history, { parsed }])
      return merged.size >= titles.length
    },
    attempts: [
      {
        name: '例句JSON首轮'
      },
      {
        name: '例句JSON重试',
        appendMessages: [
          {
            role: 'user',
            content: [
              '上一条 JSON 不完整或格式不正确。',
              '请仅输出 JSON 对象：{"items":[{"title":"...","examples":["句1","句2"]}] }。',
              '不要额外解释。'
            ].join('\n')
          }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 280))
  }

  return collectExamplesMap(generationResult.attempts)
}

function parseExampleLineBlock(text) {
  const raw = String(text || '')
  const blockMatch = raw.match(/BEGIN_EXAMPLES([\s\S]*?)END_EXAMPLES/i)
  const block = blockMatch?.[1] || raw
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const out = new Map()
  for (const line of lines) {
    const normalized = line.replace(/[｜]/g, '|')
    const m = normalized.match(/^T\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/)
    if (!m) continue
    const title = sanitizeIdeaTitle(String(m[1] || '').trim(), 36)
    const e1 = String(m[2] || '').trim()
    const e2 = String(m[3] || '').trim()
    if (title && e1 && e2) {
      out.set(title, [e1, e2])
    }
  }

  return out
}

async function fillExamplesForMissingTitles(missingTitles, apiSettings) {
  if (!missingTitles.length) return new Map()

  const generationSettings = {
    ...apiSettings,
    max_tokens: 2000,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是诗句补全器。',
    '只输出行格式，不要输出 JSON，不要解释。',
    '必须输出：BEGIN_EXAMPLES 和 END_EXAMPLES 包裹内容。',
    '每行格式：T|标题|句子1|句子2',
    '句子必须具体有画面感，句1和句2不能同义改写。'
  ].join('\n')

  const userPrompt = [
    `标题数量：${missingTitles.length}`,
    '请覆盖下列标题：',
    ...missingTitles.map((t) => `- ${t}`)
  ].join('\n')

  const collectExamplesMap = (attempts = []) => {
    const merged = new Map()
    for (const attempt of attempts) {
      if (attempt?.parsed instanceof Map) {
        for (const [k, v] of attempt.parsed.entries()) {
          merged.set(k, v)
        }
      }
    }
    return merged
  }

  const generationResult = await runGenerationRetryPlan({
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: (content) => parseExampleLineBlock(content || ''),
    isValidParsed: (parsed, { history }) => {
      const merged = collectExamplesMap([...history, { parsed }])
      return merged.size >= missingTitles.length
    },
    attempts: [
      {
        name: '例句首轮'
      },
      {
        name: '例句补齐重试',
        buildMessages: ({ baseMessages, history }) => {
          const merged = collectExamplesMap(history)
          const stillMissing = missingTitles.filter((t) => !merged.has(t))
          if (!stillMissing.length) return baseMessages
          return [
            ...baseMessages,
            {
              role: 'user',
              content: [
                '上一条格式或覆盖不完整。',
                '请只输出缺失标题的行。',
                '必须使用 BEGIN_EXAMPLES/END_EXAMPLES。',
                '缺失标题：',
                ...stillMissing.map((t) => `- ${t}`)
              ].join('\n')
            }
          ]
        }
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  const mergedMap = collectExamplesMap(generationResult.attempts)
  const finalMissing = missingTitles.filter((t) => !mergedMap.has(t))
  if (!finalMissing.length) return mergedMap

  // Last LLM-only fallback: one-by-one prompts for stubborn titles.
  for (const title of finalMissing) {
    try {
      const singleResult = await runGenerationRetryPlan({
        baseMessages: [
          {
            role: 'system',
            content: '你是诗句补全器。仅输出一行：T|标题|句子1|句子2，不要解释。'
          },
          {
            role: 'user',
            content: `标题：${title}`
          }
        ],
        settings: generationSettings,
        parseContent: (content) => parseExampleLineBlock(String(content || 'BEGIN_EXAMPLES\nEND_EXAMPLES')),
        isValidParsed: (parsed) => parsed instanceof Map && parsed.size > 0,
        attempts: [
          {
            name: '单标题兜底首轮'
          },
          {
            name: '单标题兜底重试',
            appendMessages: [
              {
                role: 'user',
                content: '上一条格式不正确。仅输出一行：T|标题|句子1|句子2。不要解释。'
              }
            ]
          }
        ]
      })

      const singleMap = collectExamplesMap(singleResult.attempts)
      if (singleMap.has(title)) {
        mergedMap.set(title, singleMap.get(title))
        continue
      }

      const fallbackText = singleResult.attempts
        .map((attempt) => String(attempt.content || ''))
        .join('\n')
        .trim()

      const oneLine = fallbackText.replace(/[｜]/g, '|')
      const m = oneLine.match(/^T\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/)
      if (m) {
        const t = String(m[1] || '').trim()
        const e1 = String(m[2] || '').trim()
        const e2 = String(m[3] || '').trim()
        if (t && e1 && e2) mergedMap.set(t, [e1, e2])
      }
    } catch (e) {
      console.warn(`${LLM_DEBUG_PREFIX} 单标题兜底失败`, { title, error: e?.message || e })
    }
  }

  return mergedMap
}

async function postProcessExamplesByLLM(rawTree, apiSettings) {
  const nodes = flattenRawTree(rawTree)
  const titles = [...new Set(nodes.map((node) => sanitizeIdeaTitle(String(node.title || ''), 36)).filter(Boolean))].slice(0, 120)

  const fixed = new Map()
  const chunkSize = 24

  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize)
    const part = await repairExamplesBatchByLLM(chunk, apiSettings)
    for (const [k, v] of part.entries()) fixed.set(k, v)
  }

  const missing = titles.filter((t) => !fixed.has(t))
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize)
    const filled = await fillExamplesForMissingTitles(chunk, apiSettings)
    for (const [k, v] of filled.entries()) fixed.set(k, v)
  }

  applyExamplesByTitle(rawTree, fixed)
}

function normalizeNode(raw, depth = 0, parentId = null, seen = new Set()) {
  if (raw && typeof raw === 'object') {
    if (seen.has(raw)) {
      return {
        id: randomId(),
        parentId,
        depth,
        text: String(raw?.text || raw?.title || '循环节点').slice(0, 36),
        examples: [],
        feedbackScore: 0,
        children: []
      }
    }
    seen.add(raw)
  }

  const text = String(raw?.text || raw?.title || '未命名灵感').slice(0, 36)
  const fromRaw = Array.isArray(raw?.examples) ? raw.examples : []
  const examples = fromRaw.filter(Boolean).slice(0, 2)
  const children = Array.isArray(raw?.children) ? raw.children : []

  return {
    id: randomId(),
    parentId,
    depth,
    text,
    examples,
    feedbackScore: Number(raw?.feedbackScore || 0),
    children: children.map((child) => normalizeNode(child, depth + 1, null, seen))
  }
}

function reindexTree(node, depth = 0, parentId = null, seen = new Set()) {
  if (!node) return null
  if (seen.has(node)) return node
  seen.add(node)
  node.depth = depth
  node.parentId = parentId
  node.children = (node.children || []).map((child) => reindexTree(child, depth + 1, node.id, seen))
  return node
}

async function generateByLLM(promptText, count, depth) {
  const apiSettings = await resolveApiSettings()
  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    throw new Error('未配置可用模型，请先在设置里填写 baseUrl / apiKey / model')
  }

  const titleTree = await buildTitleTreeByLines(promptText, count, depth, apiSettings)
  await postProcessExamplesByLLM(titleTree, apiSettings)
  assertAllNodesHaveExamples(titleTree)
  return titleTree
}

function findNodeById(node, id) {
  if (!node) return null
  if (node.id === id) return node
  for (const child of node.children || []) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

function flattenTree(tree) {
  if (!tree) return []
  const result = []
  const queue = [tree]
  const seen = new Set()
  while (queue.length) {
    const node = queue.shift()
    if (!node || seen.has(node)) continue
    seen.add(node)
    result.push(node)
    if (node.children?.length) {
      for (const child of node.children) queue.push(child)
    }
  }
  return result
}

function flattenTreeByOrder(tree, order = 'dfs') {
  if (!tree) return []

  if (order === 'bfs') return flattenTree(tree)

  const out = []
  const seen = new Set()

  function walk(node) {
    if (!node || seen.has(node)) return
    seen.add(node)
    out.push(node)
    for (const child of node.children || []) walk(child)
  }

  walk(tree)
  return out
}

function cloneTree(node) {
  if (!node) return null
  return {
    id: node.id,
    parentId: node.parentId || null,
    depth: Number(node.depth || 0),
    text: String(node.text || ''),
    examples: Array.isArray(node.examples) ? [...node.examples] : [],
    feedbackScore: Number(node.feedbackScore || 0),
    children: Array.isArray(node.children) ? node.children.map((child) => cloneTree(child)) : []
  }
}

function buildExportTree() {
  if (!rootTree.value) return null

  return cloneTree(rootTree.value)
}

function exportScopeLabel() {
  if (exportScope.value === 'all') return '全树'
  return '自定义勾选节点'
}

function removeNodeById(node, id) {
  if (!node || !node.children) return false
  const idx = node.children.findIndex((child) => child.id === id)
  if (idx >= 0) {
    const removed = node.children[idx]
    const ids = flattenTree(removed).map((item) => item.id)
    for (const rid of ids) {
      delete manualPositions.value[rid]
    }
    node.children.splice(idx, 1)
    return true
  }
  return node.children.some((child) => removeNodeById(child, id))
}

function selectNode(node) {
  selectedNode.value = node
}

function toggleExportNodeSelection(nodeId) {
  if (!ensureEditable()) return
  const list = [...exportPickedNodeIds.value]
  const idx = list.indexOf(nodeId)
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    list.push(nodeId)
  }
  exportPickedNodeIds.value = list
}

function isNodeExportSelected(nodeId) {
  return exportPickedNodeIds.value.includes(nodeId)
}

function onNodeClick(node) {
  if (isSnapshotReadonly.value) {
    snapshotSelectedNodeId.value = node.id
    return
  }
  selectedNode.value = node
  if (interactionMode.value === 'scissor') {
    if (node.id === rootTree.value?.id) {
      statusText.value = '根节点不能删除，可使用“清空”'
      return
    }
    const now = Date.now()
    const pendingSameNode = scissorDeletePendingNodeId.value === node.id && (now - scissorDeletePendingAt.value) <= 2500
    if (!pendingSameNode) {
      scissorDeletePendingNodeId.value = node.id
      scissorDeletePendingAt.value = now
      statusText.value = `再次点击确认删除：${node.text}`
      return
    }
    recordSnapshot(`剪刀删除节点：${node.text}`)
    const ok = removeNodeById(rootTree.value, node.id)
    if (ok) {
      rootTree.value = reindexTree(rootTree.value)
      selectedNode.value = rootTree.value
      statusText.value = `已删除节点：${node.text}`
    }
    clearScissorPending()
    return
  }
  if (interactionMode.value === 'link' || interactionMode.value === 'group') {
    return
  }
  if (quickNoteImportOpen.value) {
    if (node.children?.length) {
      quickNoteStatus.value = '导入模式下仅可选择叶节点'
      return
    }
    toggleExportNodeSelection(node.id)
    return
  }
  if (exportScope.value === 'custom') {
    toggleExportNodeSelection(node.id)
  }
}

function selectAllExportNodes() {
  if (!ensureEditable()) return
  exportPickedNodeIds.value = flattenTree(rootTree.value).map((node) => node.id)
}

function clearExportNodes() {
  if (!ensureEditable()) return
  exportPickedNodeIds.value = []
}

function buildCustomExportGraph() {
  const allNodes = flattenTree(rootTree.value)
  const pickedSet = new Set(exportPickedNodeIds.value)
  const picked = allNodes.filter((node) => pickedSet.has(node.id))
  const cloneMap = new Map()

  for (const node of picked) {
    cloneMap.set(node.id, {
      id: node.id,
      parentId: null,
      depth: Number(node.depth || 0),
      text: node.text,
      examples: Array.isArray(node.examples) ? [...node.examples] : [],
      feedbackScore: Number(node.feedbackScore || 0),
      children: []
    })
  }

  for (const node of picked) {
    const cur = cloneMap.get(node.id)
    const pid = node.parentId
    if (pid && cloneMap.has(pid)) {
      cur.parentId = pid
      cloneMap.get(pid).children.push(cur)
    }
  }

  const roots = [...cloneMap.values()].filter((node) => !node.parentId)
  return {
    nodes: [...cloneMap.values()],
    roots
  }
}

function orderCustomExportNodes(graph, order = 'dfs') {
  if (!graph?.nodes?.length) return []
  if (order === 'bfs') {
    const out = []
    const queue = [...graph.roots]
    const seen = new Set()
    while (queue.length) {
      const node = queue.shift()
      if (!node || seen.has(node.id)) continue
      seen.add(node.id)
      out.push(node)
      for (const child of node.children || []) queue.push(child)
    }
    return out
  }

  const out = []
  const seen = new Set()
  function walk(node) {
    if (!node || seen.has(node.id)) return
    seen.add(node.id)
    out.push(node)
    for (const child of node.children || []) walk(child)
  }
  for (const root of graph.roots) walk(root)
  return out
}

function keywordList(text) {
  return text
    .split(/[，。！？；、\s\n]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .slice(0, 8)
}

function clampBias(v) {
  return Math.max(-5, Math.min(5, v))
}

function applyFeedback(mode, text = '', options = {}) {
  if (!selectedNode.value) return
  const { silent = false } = options
  const normalizedText = String(text || '').trim()
  const meaningful = normalizedText.length > 0 || mode !== 'neutral'
  if (!meaningful) return false

  const score = mode === 'positive' ? 1 : mode === 'negative' ? -1 : 0
  selectedNode.value.feedbackScore = Number(selectedNode.value.feedbackScore || 0) + score

  const g = adaptState.value.generator
  if (mode === 'positive') {
    g.imagery = clamp01(g.imagery + 0.06)
    g.rhythm = clamp01(g.rhythm + 0.03)
    g.novelty = clamp01(g.novelty + 0.02)
  } else if (mode === 'negative') {
    g.contrast = clamp01(g.contrast + 0.06)
    g.novelty = clamp01(g.novelty + 0.05)
    g.rhythm = clamp01(g.rhythm - 0.03)
  } else {
    g.imagery = clamp01(g.imagery * 0.99)
    g.rhythm = clamp01(g.rhythm * 0.99)
  }

  const kws = keywordList(normalizedText)
  for (const kw of kws) {
    const old = adaptState.value.loraLike.keywordBias[kw] || 0
    const delta = mode === 'negative' ? -1 : 1
    adaptState.value.loraLike.keywordBias[kw] = clampBias(old + delta)
  }

  const criticDelta = mode === 'positive' ? 0.08 : mode === 'negative' ? -0.09 : 0.01
  adaptState.value.critic.lastScore = clamp01(adaptState.value.critic.lastScore + criticDelta)
  adaptState.value.critic.history.unshift({
    mode,
    text: normalizedText,
    score: adaptState.value.critic.lastScore,
    at: Date.now()
  })
  adaptState.value.critic.history = adaptState.value.critic.history.slice(0, 20)

  if (!silent) {
    statusText.value = `已记录${mode === 'positive' ? '正向' : mode === 'negative' ? '负向' : '中性'}反馈，生成参数已微调`
  }

  return true
}

async function generateContinueByLLM(node, count, mode = 'neutral', feedback = '') {
  const apiSettings = await resolveApiSettings()
  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    throw new Error('未配置可用模型，无法继续生成')
  }

  const generationSettings = {
    ...apiSettings,
    max_tokens: 900,
    temperature: 0.2
  }

  const systemPrompt = [
    '你是诗歌分支扩展器。',
    '请输出分步行格式，不要输出 JSON。',
    '每行格式：L<层级>|N<编号>|P<父编号>|<标题>',
    '本次只输出子节点及其子树，根父编号统一写 P1。',
    '标题必须是意象短语，不得出现“我们根据用户反馈”“请输出”等说明句。',
    '不要解释。'
  ].join('\n')

  const userPrompt = [
    `父节点主题：${node.text}`,
    `生成数量：${count}`,
    `反馈模式：${mode}`,
    `用户反馈：${feedback || '无'}`,
    '输出层级从 L2 开始。'
  ].join('\n')

  const parseChildrenFromLineText = (rawText = '') => {
    const parsed = parseLineTree(`L1|N1|P0|${node.text}\n${rawText}`)
    const children = Array.isArray(parsed?.children) ? parsed.children : []
    return children
      .map((c) => ({ ...c, title: sanitizeIdeaTitle(c?.title || '', 18) }))
      .filter((c) => c.title && !isMetaNarrationTitle(c.title))
  }

  const generationResult = await runGenerationRetryPlan({
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseChildrenFromLineText,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      {
        name: '续写首轮'
      },
      {
        name: '续写格式重试',
        messages: [
          {
            role: 'system',
            content: [
              '你是诗歌分支扩展器。',
              '请只输出分步行格式，不要解释。',
              '每行必须是：L2|N<编号>|P1|<标题> 或 L3|N<编号>|P<父编号>|<标题>',
              '必须使用 BEGIN_LINES 和 END_LINES 包裹。'
            ].join('\n')
          },
          { role: 'user', content: userPrompt }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  let children = Array.isArray(generationResult.parsed) ? generationResult.parsed : []

  if (!children.length) {
    const combinedText = generationResult.attempts.map((item) => String(item.content || '')).join('\n')
    const looseTitles = extractLooseTitlesFromText(combinedText, count)
    children = looseTitles
      .map((title) => sanitizeIdeaTitle(title, 18))
      .filter((title) => title && !isMetaNarrationTitle(title))
      .map((title) => ({ title, children: [] }))
  }

  if (!children.length) {
    throw new Error('模型未返回可用续写分支')
  }

  const wrapper = { title: 'tmp', children }
  await postProcessExamplesByLLM(wrapper, apiSettings)
  for (const child of children) {
    assertAllNodesHaveExamples(child)
  }

  return children
}

async function continueGenerateFromNode() {
  if (!ensureEditable()) return
  if (!rootTree.value || !selectedNode.value) {
    statusText.value = '请先选中一个节点'
    return
  }

  isGenerating.value = true
  statusText.value = '正在根据反馈继续生成...'

  try {
    const target = findNodeById(rootTree.value, selectedNode.value.id)
    if (!target) {
      statusText.value = '目标节点不存在'
      return
    }

    const feedbackInput = feedbackText.value.trim()
    const feedbackApplied = applyFeedback(feedbackMode.value, feedbackInput, { silent: true })

    const llmChildren = await generateContinueByLLM(
      target,
      continueCount.value,
      feedbackMode.value,
      feedbackInput
    )
    if (!Array.isArray(llmChildren) || llmChildren.length === 0) {
      throw new Error('模型未返回可用续写分支')
    }

    const normalizedChildren = llmChildren.map((child) => normalizeNode(child, target.depth + 1, target.id))
    target.children.push(...normalizedChildren)
    rootTree.value = reindexTree(rootTree.value)
    selectedNode.value = target
    feedbackText.value = ''

    statusText.value = feedbackApplied
      ? '已应用反馈并生成新分支（分步行格式）'
      : '已生成新分支（分步行格式）'
    lastSourceLabel.value = '大模型'
  } catch (e) {
    statusText.value = `继续生成失败：${e.message || '请检查模型配置或网络'}`
    lastSourceLabel.value = '未生成'
  } finally {
    isGenerating.value = false
  }
}

async function generateTree() {
  if (!ensureEditable()) return
  const promptText = prompt.value.trim()
  if (!promptText) {
    statusText.value = '请先输入提示词'
    return
  }

  isGenerating.value = true
  statusText.value = currentMode.value === 'directing' ? '正在生成分镜图...' : '正在生成灵感树（分步行格式）...'

  try {
    if (currentMode.value === 'directing') {
      const llmResult = await generateDirectingTree(promptText, branchCount.value, depthLimit.value)
      const normalized = normalizeNode(llmResult)
      rootTree.value = reindexTree(normalized)
      const nodeCount = flattenTree(rootTree.value).length
      if (nodeCount < 2) throw new Error('模型仅返回根节点，未生成有效分支，请重试')
      selectedNode.value = rootTree.value
      statusText.value = `分镜图生成成功，共 ${nodeCount} 个节点`
    } else {
      const llmResult = await generateByLLM(promptText, branchCount.value, depthLimit.value)
      const normalized = normalizeNode(llmResult)
      rootTree.value = reindexTree(normalized)
      const nodeCount = flattenTree(rootTree.value).length
      if (nodeCount < 2) throw new Error('模型仅返回根节点，未生成有效分支，请重试')
      selectedNode.value = rootTree.value
      statusText.value = `大模型生成成功，共 ${nodeCount} 个节点（分步行格式）`
    }
    lastSourceLabel.value = '大模型'
  } catch (e) {
    rootTree.value = null
    selectedNode.value = null
    statusText.value = `生成失败：${e.message || '请检查模型配置或网络'}`
    lastSourceLabel.value = '未生成'
  } finally {
    isGenerating.value = false
  }
}

async function generateDirectingTree(promptText, count, depth) {
  const apiSettings = await resolveApiSettings()
  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    throw new Error('未配置可用模型，请先在设置里填写 baseUrl / apiKey / model')
  }

  const generationSettings = {
    ...apiSettings,
    max_tokens: 3200,
    temperature: 0.2,
    response_format: null
  }

  const systemPrompt = [
    '你是分镜图生成器。',
    '请严格使用分步行格式输出，不要输出 JSON。',
    '每一行格式必须是：L<层级>|N<编号>|P<父编号>|<镜头描述>',
    '约束：层级从1开始；根节点唯一；每个节点描述一个分镜画面；需包含景别、运镜、色调、声音建议；只能输出行，不要解释。',
    '必须用 BEGIN_LINES 和 END_LINES 包裹所有行。',
    '示例：',
    'BEGIN_LINES',
    'L1|N1|P0|雨夜街道全景，固定镜头，冷蓝色调',
    'L2|N2|P1|路灯特写，推镜头，暖黄光晕，雨声',
    'END_LINES'
  ].join('\n')

  const userPrompt = [
    `场景主题：${promptText}`,
    `一级分镜数量：${count}`,
    `最大层数：${depth}`,
    '请按叙事逻辑生成分镜序列，每节点包含画面描述、建议景别和运镜、色调情绪。'
  ].join('\n')

  const generationResult = await runGenerationRetryPlan({
    baseMessages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    settings: generationSettings,
    parseContent: parseLineTree,
    isValidParsed: (parsed) => Boolean(parsed),
    attempts: [
      {
        name: '分镜图首轮'
      },
      {
        name: '分镜图二轮',
        appendMessages: [
          {
            role: 'user',
            content: '上一条格式不合规。请重新输出分步行格式，不要解释，每行匹配：L<层级>|N<编号>|P<父编号>|<镜头描述>。'
          }
        ]
      }
    ]
  })

  for (const attempt of generationResult.attempts) {
    console.info(`${LLM_DEBUG_PREFIX} ${attempt.name}预览`, String(attempt.content || '').slice(0, 300))
  }

  if (generationResult.success && generationResult.parsed) {
    return generationResult.parsed
  }

  throw new Error('分镜图解析失败，请重试')
}

function saveNodeExtraFields() {
  if (!selectedNode.value) return
  if (!selectedNode.value.extraFields) selectedNode.value.extraFields = {}
  selectedNode.value.extraFields.shotType = editingShotType.value
  selectedNode.value.extraFields.cameraMovement = editingCameraMovement.value
  selectedNode.value.extraFields.duration = editingDuration.value
  selectedNode.value.extraFields.toneDescription = editingToneDescription.value
  selectedNode.value.extraFields.soundDescription = editingSoundDescription.value
  statusText.value = '已保存字段'
}

function getShotTypeLabel(value) {
  return shotTypes.find(s => s.value === value)?.label || value
}

function getCameraMovementLabel(value) {
  return cameraMovements.find(m => m.value === value)?.label || value
}

function deleteSelectedNode() {
  if (!ensureEditable()) return
  if (!rootTree.value || !selectedNode.value) return
  if (selectedNode.value.id === rootTree.value.id) {
    statusText.value = '根节点不能删除，可使用“清空”'
    return
  }
  clearScissorPending()
  recordSnapshot(`删除节点：${selectedNode.value.text}`)
  const ok = removeNodeById(rootTree.value, selectedNode.value.id)
  if (ok) {
    rootTree.value = reindexTree(rootTree.value)
    selectedNode.value = rootTree.value
    statusText.value = '已删除节点'
  }
}

const flatNodes = computed(() => {
  const nodes = flattenTree(displayedRootTree.value)
  if (!nodes.length) return []

  const laidOut = layoutMap(nodes)

  return laidOut.map((node) => {
    const manual = manualPositions.value[node.id]
    if (!manual) return node
    return { ...node, x: manual.x, y: manual.y }
  })
})

const leafImportCandidates = computed(() => {
  return flatNodes.value
    .filter((node) => !node.children?.length)
    .map((node) => ({
      id: node.id,
      depth: node.depth,
      text: node.examples?.[0] ? `${node.text}\n${node.examples[0]}` : node.text,
      preview: (node.examples?.[0] ? `${node.text} / ${node.examples[0]}` : node.text).replace(/\s+/g, ' ').slice(0, 42)
    }))
})

const leafImportStats = computed(() => {
  const totalCount = leafImportCandidates.value.length
  const selectedCount = leafImportCandidates.value.filter((item) => isNodeExportSelected(item.id)).length
  const totalWords = leafImportCandidates.value.reduce((sum, item) => sum + quickNoteWordCount(item.text), 0)
  const selectedWords = leafImportCandidates.value
    .filter((item) => isNodeExportSelected(item.id))
    .reduce((sum, item) => sum + quickNoteWordCount(item.text), 0)
  return { totalCount, selectedCount, totalWords, selectedWords }
})

const selectedNodeGroups = computed(() => {
  if (!displayedSelectedNode.value) return []
  return displayedImageryGroups.value.filter((group) => (group.nodeIds || []).includes(displayedSelectedNode.value.id))
})

function layoutMap(nodes) {
  const depthRows = new Map()
  for (const node of nodes) {
    if (!depthRows.has(node.depth)) depthRows.set(node.depth, [])
    depthRows.get(node.depth).push(node)
  }

  const xGap = 320
  const yGap = 124
  const topBase = 80
  const leftBase = 90

  const positioned = []
  for (const [depth, list] of [...depthRows.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((node, idx) => {
      positioned.push({
        ...node,
        x: leftBase + depth * xGap,
        y: topBase + idx * yGap
      })
    })
  }
  return positioned
}

const renderedEdges = computed(() => {
  const nodeMap = new Map(flatNodes.value.map((node) => [node.id, node]))
  const lineList = []

  for (const node of flatNodes.value) {
    if (!node.parentId) continue
    const parent = nodeMap.get(node.parentId)
    if (!parent) continue

    lineList.push({
      id: `hier_${parent.id}_${node.id}`,
      builtIn: true,
      sourceId: parent.id,
      targetId: node.id,
      type: 'HIERARCHY',
      weight: 1,
      x1: parent.x + 86,
      y1: parent.y + 36,
      x2: node.x + 6,
      y2: node.y + 36,
      d: makeEdgePath(parent.x + 86, parent.y + 36, node.x + 6, node.y + 36)
    })
  }

  for (const edge of displayedGraphEdges.value) {
    const source = nodeMap.get(edge.sourceId)
    const target = nodeMap.get(edge.targetId)
    if (!source || !target) continue
    lineList.push({
      ...edge,
      builtIn: false,
      x1: source.x + 86,
      y1: source.y + 36,
      x2: target.x + 6,
      y2: target.y + 36,
      d: makeEdgePath(source.x + 86, source.y + 36, target.x + 6, target.y + 36)
    })
  }

  return lineList
})

watch(interactionMode, () => {
  clearScissorPending()
  edgeLinkDraft.value = null
  groupDraft.value = null
})

const exportNodeSelectedCount = computed(() => exportPickedNodeIds.value.length)

const edgeLinkDraftPath = computed(() => {
  if (!edgeLinkDraft.value) return ''
  return makeEdgePath(edgeLinkDraft.value.x1, edgeLinkDraft.value.y1, edgeLinkDraft.value.x2, edgeLinkDraft.value.y2)
})

function startDrag(event, node) {
  if (!ensureEditable()) return
  dragState.value = {
    id: node.id,
    offsetX: event.clientX - node.x,
    offsetY: event.clientY - node.y
  }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag)
}

function onDragMove(event) {
  if (!dragState.value) return
  const { id, offsetX, offsetY } = dragState.value

  manualPositions.value = {
    ...manualPositions.value,
    [id]: {
      x: Math.max(20, Math.min(canvasWidth - 180, event.clientX - offsetX)),
      y: Math.max(20, Math.min(canvasHeight - 90, event.clientY - offsetY))
    }
  }
}

function stopDrag() {
  dragState.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
}

function canvasPointFromEvent(event) {
  if (!canvasRef.value) return { x: 0, y: 0 }
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

function onNodePointerDown(event, node) {
  if (interactionMode.value === 'pointer') {
    startDrag(event, node)
    return
  }
  if (!ensureEditable()) return
  if (interactionMode.value === 'link') {
    const point = canvasPointFromEvent(event)
    edgeLinkDraft.value = {
      sourceId: node.id,
      x1: node.x + 86,
      y1: node.y + 36,
      x2: point.x,
      y2: point.y
    }
    window.addEventListener('pointermove', onEdgeDraftMove)
    window.addEventListener('pointerup', onEdgeDraftEnd)
  }
}

function onEdgeDraftMove(event) {
  if (!edgeLinkDraft.value) return
  const point = canvasPointFromEvent(event)
  edgeLinkDraft.value = {
    ...edgeLinkDraft.value,
    x2: point.x,
    y2: point.y
  }
}

function onEdgeDraftEnd(event) {
  if (!edgeLinkDraft.value) return
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-node-id]')
  const sourceId = edgeLinkDraft.value.sourceId
  const targetId = target?.dataset?.nodeId
  if (targetId) createGraphEdge(sourceId, targetId, edgeDraftType.value, 1)
  edgeLinkDraft.value = null
  window.removeEventListener('pointermove', onEdgeDraftMove)
  window.removeEventListener('pointerup', onEdgeDraftEnd)
}

function onCanvasPointerDown(event) {
  if (interactionMode.value !== 'group') return
  if (!ensureEditable()) return
  if (event.target.closest('.idea-node')) return
  const point = canvasPointFromEvent(event)
  groupDraft.value = {
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y
  }
  window.addEventListener('pointermove', onGroupDraftMove)
  window.addEventListener('pointerup', onGroupDraftEnd)
}

function onGroupDraftMove(event) {
  if (!groupDraft.value) return
  const point = canvasPointFromEvent(event)
  groupDraft.value = {
    ...groupDraft.value,
    currentX: point.x,
    currentY: point.y
  }
}

const selectionRectStyle = computed(() => {
  if (!groupDraft.value) return {}
  const left = Math.min(groupDraft.value.startX, groupDraft.value.currentX)
  const top = Math.min(groupDraft.value.startY, groupDraft.value.currentY)
  const width = Math.abs(groupDraft.value.currentX - groupDraft.value.startX)
  const height = Math.abs(groupDraft.value.currentY - groupDraft.value.startY)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`
  }
})

function onGroupDraftEnd() {
  if (!groupDraft.value) return
  const left = Math.min(groupDraft.value.startX, groupDraft.value.currentX)
  const right = Math.max(groupDraft.value.startX, groupDraft.value.currentX)
  const top = Math.min(groupDraft.value.startY, groupDraft.value.currentY)
  const bottom = Math.max(groupDraft.value.startY, groupDraft.value.currentY)
  const picked = flatNodes.value
    .filter((node) => node.x >= left && node.x + 172 <= right && node.y >= top && node.y + 72 <= bottom)
    .map((node) => node.id)
  if (picked.length >= 2) {
    const name = window.prompt('为这组意象命名', `意象群 ${imageryGroups.value.length + 1}`)?.trim()
    if (name) {
      imageryGroups.value = [
        ...imageryGroups.value,
        {
          id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          nodeIds: picked,
          createdAt: new Date().toISOString()
        }
      ]
      statusText.value = `已创建意象群：${name}`
    }
  }
  groupDraft.value = null
  window.removeEventListener('pointermove', onGroupDraftMove)
  window.removeEventListener('pointerup', onGroupDraftEnd)
}

function onEdgeClick(edge) {
  if (interactionMode.value !== 'scissor') return
  removeGraphEdge(edge.id)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointermove', onEdgeDraftMove)
  window.removeEventListener('pointerup', onEdgeDraftEnd)
  window.removeEventListener('pointermove', onGroupDraftMove)
  window.removeEventListener('pointerup', onGroupDraftEnd)
})

function exportMarkdown() {
  if (exportScope.value === 'custom') {
    const graph = buildCustomExportGraph()
    const orderedNodes = orderCustomExportNodes(graph, exportOrder.value)
    if (!orderedNodes.length) {
      statusText.value = '请先在画布中勾选要导出的节点'
      return
    }

    const lines = []
    lines.push('导出范围：自定义勾选节点')
    lines.push(`连接顺序：${exportOrder.value === 'dfs' ? '深度优先' : '广度优先'}`)
    lines.push('')

    for (const node of orderedNodes) {
      lines.push(`### ${node.text}`)
      if (node.examples?.[0]) lines.push(`例句一：${node.examples[0]}`)
      if (node.examples?.[1]) lines.push(`例句二：${node.examples[1]}`)
      lines.push('')
    }

    lines.push('连接关系：')
    let edgeIndex = 1
    for (const node of orderedNodes) {
      for (const child of node.children || []) {
        lines.push(`连接${String(edgeIndex).padStart(2, '0')}：${node.text} -> ${child.text}`)
        edgeIndex += 1
      }
    }
    if (edgeIndex === 1) lines.push('连接00：未形成父子连接')
    lines.push('')

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poetry-idea-tree-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
    statusText.value = `已导出：自定义勾选节点，共 ${orderedNodes.length} 个`
    return
  }

  const exportTree = buildExportTree()
  if (!exportTree) return
  reindexTree(exportTree)

  const lines = []
  lines.push(`导出范围：${exportScopeLabel()}`)
  lines.push(`连接顺序：${exportOrder.value === 'dfs' ? '深度优先' : '广度优先'}`)
  lines.push('')

  function walk(node, level = 1) {
    const hashes = '#'.repeat(Math.min(6, level + 1))
    lines.push(`${hashes} ${node.text}`)
    if (node.examples?.length) {
      if (node.examples[0]) lines.push(`例句一：${node.examples[0]}`)
      if (node.examples[1]) lines.push(`例句二：${node.examples[1]}`)
    }
    lines.push('')
    node.children?.forEach((child) => walk(child, level + 1))
  }

  walk(exportTree)

  const orderedNodes = flattenTreeByOrder(exportTree, exportOrder.value)
  lines.push('连接关系：')
  let edgeIndex = 1
  for (const node of orderedNodes) {
    if (!node.children?.length) continue
    for (const child of node.children) {
      lines.push(`连接${String(edgeIndex).padStart(2, '0')}：${node.text} -> ${child.text}`)
      edgeIndex += 1
    }
  }
  lines.push('')

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `poetry-idea-tree-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function exportTxt() {
  if (exportScope.value === 'custom') {
    const graph = buildCustomExportGraph()
    const orderedNodes = orderCustomExportNodes(graph, exportOrder.value)
    if (!orderedNodes.length) {
      statusText.value = '请先在画布中勾选要导出的节点'
      return
    }

    const lines = []
    lines.push('导出范围：自定义勾选节点')
    lines.push(`连接顺序：${exportOrder.value === 'dfs' ? '深度优先' : '广度优先'}`)
    lines.push('')
    for (const node of orderedNodes) {
      lines.push(node.text)
      if (node.examples?.[0]) lines.push(`  例句一：${node.examples[0]}`)
      if (node.examples?.[1]) lines.push(`  例句二：${node.examples[1]}`)
    }
    lines.push('')
    lines.push('连接关系：')
    let edgeIndex = 1
    for (const node of orderedNodes) {
      for (const child of node.children || []) {
        lines.push(`连接${String(edgeIndex).padStart(2, '0')}：${node.text} -> ${child.text}`)
        edgeIndex += 1
      }
    }
    if (edgeIndex === 1) lines.push('连接00：未形成父子连接')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poetry-idea-tree-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    statusText.value = `已导出：自定义勾选节点，共 ${orderedNodes.length} 个`
    return
  }

  const exportTree = buildExportTree()
  if (!exportTree) return
  reindexTree(exportTree)

  const exportNodes = flattenTreeByOrder(exportTree, exportOrder.value)
  if (!exportNodes.length) return
  const lines = []
  lines.push(`导出范围：${exportScopeLabel()}`)
  lines.push(`连接顺序：${exportOrder.value === 'dfs' ? '深度优先' : '广度优先'}`)
  lines.push('')
  for (const node of exportNodes) {
    lines.push(node.text)
    if (node.examples?.[0]) lines.push(`  例句一：${node.examples[0]}`)
    if (node.examples?.[1]) lines.push(`  例句二：${node.examples[1]}`)
  }
  lines.push('')
  lines.push('连接关系：')
  let edgeIndex = 1
  for (const node of exportNodes) {
    for (const child of node.children || []) {
      lines.push(`连接${String(edgeIndex).padStart(2, '0')}：${node.text} -> ${child.text}`)
      edgeIndex += 1
    }
  }
  if (edgeIndex === 1) lines.push('连接00：仅根节点')

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `poetry-idea-tree-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
  statusText.value = `已导出：${exportScopeLabel()}，顺序${exportOrder.value === 'dfs' ? '深度优先' : '广度优先'}`
}
</script>

<style scoped>
.poetry-lab-page {
  height: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
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

.title-right {
  display: flex;
  align-items: center;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.mode-toggle-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.mode-label {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
}

.mode-label.active {
  color: var(--accent);
  font-weight: 500;
}

.mode-toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.mode-toggle.is-directing {
  background: var(--accent);
  border-color: var(--accent);
}

.mode-toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition: all 0.2s;
}

.mode-toggle.is-directing .mode-toggle-dot {
  left: calc(100% - 16px);
  background: white;
}

.layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 340px 1fr;
}

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

.quick-note-import-panel {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.quick-note-import-body {
  display: grid;
  grid-template-columns: 1fr 96px;
  gap: 8px;
}

.quick-note-import-left {
  min-width: 0;
}

.quick-note-import-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.quick-note-import-title {
  flex: 1;
  font-size: 10px;
  color: var(--text-secondary);
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

.quick-note-import-side {
  border-left: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  padding-left: 8px;
  display: grid;
  align-content: start;
  gap: 6px;
}

.quick-note-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--text-secondary);
}

.quick-note-stat strong {
  color: var(--text-primary);
  font-weight: 600;
}

.quick-note-import-empty {
  color: var(--text-secondary);
  font-size: 9px;
  line-height: 1.4;
}

.idea-node.import-picked {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 32%, transparent);
}

.import-mark {
  margin-top: 5px;
  font-size: 10px;
  color: var(--accent);
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

.control-panel {
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.control-panel h2 {
  margin: 0;
  font-size: 16px;
}

.prompt-input,
.feedback-input {
  width: 100%;
  margin-top: 12px;
  min-height: 96px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 10px;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.feedback-input {
  min-height: 72px;
}

.prompt-input:focus,
.feedback-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.control-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 86px;
  align-items: center;
  gap: 8px;
}

.control-row label {
  color: var(--text-secondary);
  font-size: 13px;
}

.control-row input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 6px 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.control-row select {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 6px 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.control-row input:focus,
.control-row select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.param-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.param-item {
  display: grid;
  gap: 6px;
}

.param-item.inline {
  grid-template-columns: auto 56px;
  align-items: center;
  gap: 6px;
}

.param-item label {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.param-item input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 6px 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.param-item input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.export-panel {
  margin-top: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-primary) 90%, #ffffff 10%);
  padding: 12px;
  box-shadow: 0 6px 14px color-mix(in srgb, var(--accent) 10%, transparent);
}

.export-panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.export-panel-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.pick-list {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.pick-toolbar {
  display: grid;
  gap: 8px;
}

.pick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.pick-item {
  border: 1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 30%);
  border-radius: 10px;
  padding: 8px;
  display: grid;
  gap: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 85%, #ffffff 15%);
}

.pick-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.tool-panel,
.history-panel {
  margin-top: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-primary) 94%, #ffffff 6%);
  padding: 12px;
}

.mode-switch-row {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.snapshot-readonly {
  color: #ffb36b;
}

.history-list {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.history-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.history-item.active {
  border-color: var(--accent);
}

.export-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.collapse-arrow {
  font-size: 10px;
  color: var(--text-secondary);
  transition: transform 0.2s;
}

.collapse-arrow.expanded {
  transform: rotate(180deg);
}

.history-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-actions {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.group-panel {
  margin-top: 12px;
}

.group-list {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.group-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.group-list.compact {
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
}

.group-chip {
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--accent);
  text-align: center;
}

.btn-row {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.detail-btn {
  margin-top: 10px;
  width: 100%;
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
  max-height: 80vh;
  overflow-y: auto;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  font-weight: 600;
}

.dialog-body {
  padding: 16px 20px;
}

.dialog-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-node-text {
  font-size: 14px;
  line-height: 1.6;
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.dialog-example {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  margin-bottom: 4px;
}

.dialog-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-primary,
.btn-secondary,
.small-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #f7fbff;
  font-weight: 600;
}

.btn-primary:hover {
  filter: brightness(1.06);
}

.btn-secondary:hover,
.small-btn:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--bg-tertiary) 84%, #ffffff 16%);
}

.small-btn.active {
  border-color: var(--accent);
  color: var(--accent);
}

.status {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status.sub {
  margin-top: 4px;
  color: var(--accent);
}

.node-detail {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff 8%);
  padding: 10px;
}

.node-detail h3 {
  margin: 0;
  font-size: 13px;
}

.detail-panel-section {
  margin-top: 10px;
}

.extra-fields-list {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.extra-fields-list > div {
  display: flex;
  gap: 4px;
}

.extra-fields-list > div > span {
  color: var(--text-primary);
}

.extra-example {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.detail-panel-section label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.detail-panel-section .input {
  width: 100%;
  box-sizing: border-box;
}

.save-btn {
  margin-top: 10px;
  width: 100%;
}

.meta {
  margin-top: 6px;
  margin-bottom: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.node-text {
  margin-top: 8px;
  margin-bottom: 0;
  font-size: 13px;
  line-height: 1.6;
}

.feedback-panel h4 {
  margin: 0;
  font-size: 12px;
}

.feedback-panel {
  margin-top: 12px;
}

.feedback-actions {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.action-btn {
  margin-top: 8px;
  width: 100%;
  min-width: 0;
  justify-self: stretch;
}

.feedback-main-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: center;
}

.small-btn.danger {
  color: #ff7a7a;
  border-color: #7b3f3f;
}

.canvas-panel {
  position: relative;
  overflow: auto;
  background: radial-gradient(circle at 20% 20%, rgba(90, 118, 160, 0.18), transparent 42%),
              radial-gradient(circle at 80% 80%, rgba(133, 90, 160, 0.15), transparent 40%),
              var(--bg-primary);
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--text-secondary);
}

.empty-title {
  font-size: 18px;
  color: var(--text-primary);
}

.empty-desc {
  margin-top: 8px;
  font-size: 13px;
}

.mind-canvas {
  position: relative;
  width: 1680px;
  height: 1040px;
}

.canvas-legend {
  position: fixed;
  top: 72px;
  right: 16px;
  background: color-mix(in srgb, var(--bg-secondary) 95%, #ffffff 5%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 10;
  pointer-events: none;
}

.edge-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.edge-layer.interactive {
  pointer-events: auto;
}

.edge {
  fill: none;
  stroke: #7f8ea3;
  stroke-width: 1.2;
  stroke-opacity: 0.52;
}

.edge-hierarchy {
  color: #7f8ea3;
}

.edge-metaphor {
  color: #ef8f6a;
  stroke: #ef8f6a;
  stroke-dasharray: 6 4;
}

.edge-juxtapose {
  color: #62b6cb;
  stroke: #62b6cb;
  stroke-dasharray: 2 4;
}

.edge-rupture {
  color: #ff6b6b;
  stroke: #ff6b6b;
  stroke-dasharray: 10 4;
}

.edge-echo {
  color: #9b8cff;
  stroke: #9b8cff;
  stroke-dasharray: 3 3;
}

.edge-visual_metaphor {
  color: #9c27b0;
  stroke: #9c27b0;
}

.edge-parallel_shot {
  color: #2196f3;
  stroke: #2196f3;
}

.edge-jump_cut {
  color: #ff5722;
  stroke: #ff5722;
  stroke-dasharray: 6 4;
}

.edge-visual_echo {
  color: #00bcd4;
  stroke: #00bcd4;
  stroke-dasharray: 3 3;
}

.edge-detail_insert {
  color: #8bc34a;
  stroke: #8bc34a;
}

.edge.removable {
  cursor: pointer;
  stroke-width: 2;
}

.edge-draft {
  color: color-mix(in srgb, var(--accent) 80%, #ffffff 20%);
  stroke: color-mix(in srgb, var(--accent) 80%, #ffffff 20%);
  stroke-width: 1.8;
  stroke-dasharray: 5 5;
}

.edge-legend {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-line {
  width: 26px;
  height: 0;
  border-top: 2px solid currentColor;
  border-radius: 999px;
}

.legend-line.edge-hierarchy {
  color: #7f8ea3;
}

.legend-line.edge-metaphor {
  color: #ef8f6a;
  border-top-style: dashed;
}

.legend-line.edge-juxtapose {
  color: #62b6cb;
  border-top-style: dotted;
}

.legend-line.edge-rupture {
  color: #ff6b6b;
  border-top-style: dashed;
}

.legend-line.edge-echo {
  color: #9b8cff;
  border-top-style: dashed;
}

.legend-line.edge-visual_metaphor {
  color: #9c27b0;
}

.legend-line.edge-parallel_shot {
  color: #2196f3;
}

.legend-line.edge-jump_cut {
  color: #ff5722;
}

.legend-line.edge-visual_echo {
  color: #00bcd4;
}

.legend-line.edge-detail_insert {
  color: #8bc34a;
}

.selection-rect {
  position: absolute;
  border: 1px dashed color-mix(in srgb, var(--accent) 72%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
}

.idea-node {
  position: absolute;
  width: 172px;
  min-height: 72px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  cursor: grab;
  user-select: none;
  box-shadow: 0 8px 20px var(--shadow);
  transition: border-color 0.15s, transform 0.15s;
}

.idea-node:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.idea-node.active {
  border-color: var(--accent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 28%, transparent);
}

.idea-node.scissor-pending {
  border-color: #ffb36b;
  box-shadow: 0 0 0 2px color-mix(in srgb, #ffb36b 28%, transparent);
}

.idea-node.grouped {
  box-shadow: 0 8px 22px color-mix(in srgb, #4bc0a7 18%, transparent);
}

.idea-node.readonly {
  cursor: default;
}

.idea-node.muted {
  opacity: 0.36;
  filter: grayscale(0.35);
}

.node-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg-primary) 82%, #ffffff 18%);
  border: 1px solid var(--border);
}

.node-check input {
  width: 12px;
  height: 12px;
  margin: 0;
}

.group-badge {
  display: inline-flex;
  max-width: 100%;
  padding: 2px 6px;
  margin-bottom: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, #4bc0a7 20%, var(--bg-primary));
  color: #4bc0a7;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.idea-node.depth-0 {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-secondary));
}

.idea-node.depth-1 {
  background: color-mix(in srgb, #42b883 16%, var(--bg-secondary));
}

.idea-node.depth-2 {
  background: color-mix(in srgb, #f39c6b 15%, var(--bg-secondary));
}

.idea-node.depth-3 {
  background: color-mix(in srgb, #8da7ff 14%, var(--bg-secondary));
}

.node-main {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.node-sub {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .control-panel {
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 48vh;
  }

  .param-row {
    grid-template-columns: 1fr;
  }

  .param-item.inline {
    grid-template-columns: auto 72px;
  }

  .quick-notes-rail {
    top: auto;
    right: 12px;
    bottom: 14px;
    transform: none;
    transition: none;
    flex-direction: column-reverse;
    align-items: flex-end;
  }

  .quick-notes-btn {
    width: 46px;
    height: 46px;
    border-radius: 999px;
  }

  .quick-notes-drawer {
    width: min(280px, calc(100vw - 24px));
  }
}
</style>
