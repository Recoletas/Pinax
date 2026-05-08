<template>
  <div class="inventory">
    <div class="panel-header">
      <span>场景</span>
    </div>

    <!-- 当前位置 -->
    <div class="current-scene" @click="showDetail = true">
      <div class="scene-marker"></div>
      <div class="scene-info">
        <span class="scene-name">{{ currentScene?.name || '点击设置场景' }}</span>
      </div>
      <svg class="expand-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M2 3.5L5 6.5L8 3.5" stroke-width="1.5"/>
      </svg>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <span>场景详情</span>
          <button class="close-btn" @click="showDetail = false">×</button>
        </div>

        <div class="modal-body">
          <div class="detail-section">
            <div class="scene-preview">
              <div class="preview-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
                  <path d="M16 4L4 10v12l12 6 12-6V10L16 4zm0 3l9 4.5v9L16 25l-9-4.5v-9L16 7z"/>
                </svg>
              </div>
              <div class="preview-info">
                <h3>{{ currentScene?.name || '无场景' }}</h3>
                <p v-if="currentScene?.position" class="preview-meta">
                  <span class="meta-icon">📍</span> {{ currentScene?.position }}
                </p>
                <p v-if="currentScene?.action" class="preview-meta action">
                  {{ currentScene?.action }}
                </p>
                <p class="preview-desc">{{ currentScene?.description || '暂无描述' }}</p>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="currentScene">
            <h3>场景描述</h3>
            <textarea
              v-model="sceneDescription"
              class="desc-textarea"
              placeholder="描述这个场景的氛围、环境..."
            ></textarea>
          </div>

          <div class="detail-section" v-if="currentScene">
            <h3>角色位置</h3>
            <input
              v-model="scenePosition"
              type="text"
              class="desc-input"
              placeholder="角色在场景中的具体位置，如：窗边、角落..."
            />
          </div>

          <div class="detail-section" v-if="currentScene">
            <h3>角色动作</h3>
            <input
              v-model="sceneAction"
              type="text"
              class="desc-input"
              placeholder="角色正在做什么，如：沉思、观察..."
            />
          </div>

          <div class="detail-actions">
            <button class="btn danger" @click="deleteScene" v-if="currentScene">
              删除场景
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="showDetail = false">取消</button>
          <button class="btn primary" @click="saveScene">保存</button>
        </div>
      </div>
    </div>

    <!-- 添加场景弹窗 -->
    <div v-if="showAddModal" class="detail-overlay" @click.self="showAddModal = false">
      <div class="detail-modal small">
        <div class="modal-header">
          <span>添加场景</span>
          <button class="close-btn" @click="showAddModal = false">×</button>
        </div>

        <div class="modal-body">
          <div class="input-group">
            <label>场景名称</label>
            <input
              v-model="newSceneName"
              type="text"
              class="scene-input"
              placeholder="输入场景名称"
              @keyup.enter="confirmAdd"
            />
          </div>

          <div class="preset-hint">或从预设中选择：</div>
          <div class="preset-grid">
            <button
              v-for="preset in presetScenes"
              :key="preset.id"
              class="preset-btn"
              @click="addPreset(preset)"
            >
              {{ preset.name }}
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="showAddModal = false">取消</button>
          <button class="btn primary" @click="confirmAdd" :disabled="!newSceneName.trim()">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const showDetail = ref(false)
const showAddModal = ref(false)
const showPresets = ref(false)
const scenes = ref([])
const currentSceneId = ref(null)
const newSceneName = ref('')
const sceneDescription = ref('')
const scenePosition = ref('')
const sceneAction = ref('')

const presetScenes = [
  { id: 'room', name: '室内', description: '温暖的室内空间，柔和的光线从窗户透进来。' },
  { id: 'street', name: '街道', description: '繁忙的城市街道，行人来来往往。' },
  { id: 'park', name: '公园', description: '宁静的公园，绿树成荫，有长椅和步道。' },
  { id: 'cafe', name: '咖啡馆', description: '舒适的咖啡馆，弥漫着咖啡的香气。' },
  { id: 'office', name: '办公室', description: '现代的办公空间，有办公桌和电脑设备。' },
  { id: 'library', name: '图书馆', description: '安静的图书馆，书架排列整齐。' }
]

const currentScene = computed(() => {
  return scenes.value.find(s => s.id === currentSceneId.value)
})

onMounted(() => {
  loadScenes()
})

function loadScenes() {
  const saved = localStorage.getItem('writing_scenes')
  if (saved) {
    const data = JSON.parse(saved)
    scenes.value = data.scenes || []
    currentSceneId.value = data.currentId || null
  }
}

function saveScenes() {
  localStorage.setItem('writing_scenes', JSON.stringify({
    scenes: scenes.value,
    currentId: currentSceneId.value
  }))
}

function selectScene(scene) {
  currentSceneId.value = scene.id
  sceneDescription.value = scene.description || ''
  scenePosition.value = scene.position || ''
  sceneAction.value = scene.action || ''
  showPresets.value = false
  saveScenes()
}

function addPreset(preset) {
  // 检查是否已存在
  if (scenes.value.some(s => s.id === preset.id)) {
    selectScene(scenes.value.find(s => s.id === preset.id))
  } else {
    scenes.value.push({ ...preset })
    selectScene(scenes.value[scenes.value.length - 1])
  }
  showAddModal.value = false
  showPresets.value = false
}

function confirmAdd() {
  const name = newSceneName.value.trim()
  if (!name) return

  const newScene = {
    id: 'custom_' + Date.now(),
    name: name,
    description: '',
    position: '',
    action: ''
  }

  scenes.value.push(newScene)
  selectScene(newScene)
  newSceneName.value = ''
  showAddModal.value = false
}

function saveScene() {
  if (!currentScene.value) return

  currentScene.value.description = sceneDescription.value
  currentScene.value.position = scenePosition.value
  currentScene.value.action = sceneAction.value
  saveScenes()
  showDetail.value = false
}

function deleteScene() {
  if (!currentScene.value) return

  scenes.value = scenes.value.filter(s => s.id !== currentSceneId.value)
  currentSceneId.value = scenes.value.length > 0 ? scenes.value[0].id : null
  saveScenes()
  showDetail.value = false
}
</script>

<style scoped>
.inventory {
  color: var(--text-primary);
}

.panel-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 当前位置 */
.current-scene {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 10px;
}

.current-scene:hover {
  background: var(--bg-hover);
}

.scene-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.scene-info {
  flex: 1;
  min-width: 0;
}

.scene-label {
  font-size: 10px;
  color: var(--text-muted);
  display: block;
  margin-bottom: 2px;
}

.scene-name {
  font-size: 13px;
  color: var(--text-primary);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expand-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 弹窗 */
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.detail-modal {
  width: 400px;
  max-width: 95%;
  max-height: 85vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-modal.small {
  width: 360px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-hover);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

/* 场景预览 */
.scene-preview {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.preview-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 8px;
  flex-shrink: 0;
}

.preview-info h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  text-transform: none;
}

.preview-info p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  margin-bottom: 4px;
  font-size: 13px;
}

.preview-meta.action {
  color: var(--text-secondary);
  font-style: italic;
}

.preview-desc {
  color: var(--text-muted);
  font-size: 12px;
}

.desc-textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.desc-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.desc-textarea::placeholder {
  color: var(--text-muted);
}

.desc-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.desc-input:focus {
  outline: none;
  border-color: var(--accent);
}

.desc-input::placeholder {
  color: var(--text-muted);
}

.detail-actions {
  margin-top: 16px;
}

/* 添加弹窗 */
.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.scene-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.scene-input:focus {
  outline: none;
  border-color: var(--accent);
}

.preset-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.preset-btn {
  padding: 8px 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:hover {
  background: var(--bg-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.danger {
  color: var(--danger);
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
