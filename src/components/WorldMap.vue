<template>
  <div class="world-map">
    <div class="map-header">
      <span class="map-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1L1 4v6l6 3 6-3V4L7 1zm0 1.5l4.5 2.5v5L7 12.5 2.5 10v-5L7 2.5z"/>
        </svg>
      </span>
      <span>地图</span>
    </div>

    <!-- 当前位置 -->
    <div class="current-loc" @click="showDetail = true">
      <div class="loc-marker"></div>
      <div class="loc-info">
        <span class="loc-value">{{ currentLocationPath || '点击设置' }}</span>
      </div>
      <svg class="expand-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M2 3.5L5 6.5L8 3.5" stroke-width="1.5"/>
      </svg>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <span>地图详情</span>
          <button class="close-btn" @click="showDetail = false">×</button>
        </div>

        <div class="modal-body">
          <div class="section">
            <div class="section-header">
              <span>国家</span>
              <button class="add-small" @click="showAddCountry = true">+</button>
            </div>
            <div class="item-list">
              <div
                v-for="country in mapData.countries"
                :key="country.id"
                :class="['list-item', { active: editingCountry?.id === country.id }]"
                @click="selectCountry(country)"
              >
                <span>{{ country.name }}</span>
                <button class="delete-btn" @click.stop="deleteCountry(country)">×</button>
              </div>
            </div>
          </div>

          <div class="section" v-if="editingCountry">
            <div class="section-header">
              <span>城市</span>
              <button class="add-small" @click="showAddCity = true">+</button>
            </div>
            <div class="item-list">
              <div
                v-for="city in editingCountry.cities"
                :key="city.id"
                :class="['list-item', { active: editingCity?.id === city.id }]"
                @click="selectCity(city)"
              >
                <span>{{ city.name }}</span>
                <button class="delete-btn" @click.stop="deleteCity(city)">×</button>
              </div>
            </div>
          </div>

          <div class="section" v-if="editingCity">
            <div class="section-header">
              <span>主要场景</span>
              <button class="add-small" @click="showAddScene = true">+</button>
            </div>
            <div class="item-list">
              <div
                v-for="scene in editingCity.scenes"
                :key="scene.id"
                :class="['list-item', { active: isCurrentScene(scene) }]"
                @click="setAsCurrent(scene)"
              >
                <span>{{ scene.name }}</span>
                <span v-if="isCurrentScene(scene)" class="current-tag">当前</span>
                <button class="delete-btn" @click.stop="deleteScene(scene)">×</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn danger" @click="deleteCurrent" v-if="currentScene">删除当前</button>
          <button class="btn" @click="showDetail = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 添加弹窗 -->
    <div v-if="showAddModal" class="detail-overlay" @click.self="closeAddModal">
      <div class="detail-modal small">
        <div class="modal-header">
          <span>{{ addModalTitle }}</span>
          <button class="close-btn" @click="closeAddModal">×</button>
        </div>

        <div class="modal-body">
          <!-- 添加国家 -->
          <div v-if="addType === 'country'" class="add-form">
            <div class="preset-section">
              <div class="preset-label">或选择预设：</div>
              <div class="preset-grid">
                <button v-for="p in presetCountries" :key="p" class="preset-btn" @click="newItemName = p">
                  {{ p }}
                </button>
              </div>
            </div>
            <input v-model="newItemName" type="text" class="name-input" placeholder="输入国家名称" @keyup.enter="confirmAdd" />
          </div>

          <!-- 添加城市 -->
          <div v-if="addType === 'city'" class="add-form">
            <div class="preset-section">
              <div class="preset-label">或选择预设：</div>
              <div class="preset-grid">
                <button v-for="p in presetCities" :key="p" class="preset-btn" @click="newItemName = p">
                  {{ p }}
                </button>
              </div>
            </div>
            <input v-model="newItemName" type="text" class="name-input" placeholder="输入城市名称" @keyup.enter="confirmAdd" />
          </div>

          <!-- 添加场景 -->
          <div v-if="addType === 'scene'" class="add-form">
            <div class="preset-section">
              <div class="preset-label">或选择预设：</div>
              <div class="preset-grid">
                <button v-for="p in presetScenes" :key="p" class="preset-btn" @click="newItemName = p">
                  {{ p }}
                </button>
              </div>
            </div>
            <input v-model="newItemName" type="text" class="name-input" placeholder="输入场景名称" @keyup.enter="confirmAdd" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn" @click="closeAddModal">取消</button>
          <button class="btn primary" @click="confirmAdd" :disabled="!newItemName.trim()">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const showDetail = ref(false)
const showAddModal = ref(false)
const addType = ref('')
const newItemName = ref('')
const showAddCountry = ref(false)
const showAddCity = ref(false)
const showAddScene = ref(false)

const editingCountry = ref(null)
const editingCity = ref(null)
const currentCountry = computed({
  get: () => gameStore.worldMapState?.currentCountry || '',
  set: (value) => {
    gameStore.worldMapState.currentCountry = value || ''
  }
})
const currentCity = computed({
  get: () => gameStore.worldMapState?.currentCity || '',
  set: (value) => {
    gameStore.worldMapState.currentCity = value || ''
  }
})
const currentScene = computed({
  get: () => gameStore.worldMapState?.currentScene || '',
  set: (value) => {
    gameStore.worldMapState.currentScene = value || ''
  }
})

const mapData = computed(() => gameStore.worldMapState?.map || { countries: [] })

const presetCountries = ['中国', '日本', '美国']
const presetCities = ['北京', '上海', '东京', '纽约']
const presetScenes = ['家里', '公司', '咖啡馆', '公园']

const addModalTitle = computed(() => {
  switch (addType.value) {
    case 'country': return '添加国家'
    case 'city': return '添加城市'
    case 'scene': return '添加场景'
    default: return '添加'
  }
})

const currentLocationPath = computed(() => {
  const parts = []
  if (currentCountry.value) parts.push(currentCountry.value)
  if (currentCity.value) parts.push(currentCity.value)
  if (currentScene.value) parts.push(currentScene.value)
  return parts.join(' - ')
})

onMounted(() => {
  loadMapData()
})

function loadMapData() {
  if (typeof gameStore.loadWorldMapState === 'function') {
    gameStore.loadWorldMapState()
  }
  syncEditingSelection()
}

function saveMapData() {
  if (typeof gameStore.saveWorldMapState !== 'function') return
  gameStore.saveWorldMapState({
    map: mapData.value,
    currentCountry: currentCountry.value,
    currentCity: currentCity.value,
    currentScene: currentScene.value
  })
  syncEditingSelection()
}

function syncEditingSelection() {
  if (editingCountry.value) {
    const nextCountry = mapData.value.countries.find(c => c.id === editingCountry.value.id)
    editingCountry.value = nextCountry || null
  }

  if (!editingCountry.value) {
    editingCity.value = null
    return
  }

  if (editingCity.value) {
    const nextCity = (editingCountry.value.cities || []).find(c => c.id === editingCity.value.id)
    editingCity.value = nextCity || null
  }
}

function selectCountry(country) {
  editingCountry.value = country
  editingCity.value = null
}

function selectCity(city) {
  editingCity.value = city
}

function setAsCurrent(scene) {
  if (editingCountry.value && editingCity.value) {
    currentCountry.value = editingCountry.value.name
    currentCity.value = editingCity.value.name
    currentScene.value = scene.name
    saveMapData()
  }
}

function isCurrentScene(scene) {
  return currentScene.value === scene.name
}

function deleteCountry(country) {
  mapData.value.countries = mapData.value.countries.filter(c => c.id !== country.id)
  if (editingCountry.value?.id === country.id) {
    editingCountry.value = null
    editingCity.value = null
  }
  if (currentCountry.value === country.name) {
    currentCountry.value = ''
    currentCity.value = ''
    currentScene.value = ''
  }
  saveMapData()
}

function deleteCity(city) {
  if (!editingCountry.value) return
  editingCountry.value.cities = editingCountry.value.cities.filter(c => c.id !== city.id)
  if (editingCity.value?.id === city.id) {
    editingCity.value = null
  }
  if (currentCity.value === city.name) {
    currentCity.value = ''
    currentScene.value = ''
  }
  saveMapData()
}

function deleteScene(scene) {
  if (!editingCity.value) return
  editingCity.value.scenes = editingCity.value.scenes.filter(s => s.id !== scene.id)
  if (currentScene.value === scene.name) {
    currentScene.value = ''
  }
  saveMapData()
}

function closeAddModal() {
  showAddModal.value = false
  showAddCountry.value = false
  showAddCity.value = false
  showAddScene.value = false
  newItemName.value = ''
}

function confirmAdd() {
  const name = newItemName.value.trim()
  if (!name) return

  if (addType.value === 'country') {
    const newCountry = {
      id: 'c_' + Date.now(),
      name: name,
      cities: []
    }
    mapData.value.countries.push(newCountry)
    selectCountry(newCountry)
  } else if (addType.value === 'city' && editingCountry.value) {
    const newCity = {
      id: 'ci_' + Date.now(),
      name: name,
      scenes: []
    }
    editingCountry.value.cities.push(newCity)
    selectCity(newCity)
  } else if (addType.value === 'scene' && editingCity.value) {
    const newScene = {
      id: 's_' + Date.now(),
      name: name
    }
    editingCity.value.scenes.push(newScene)
    setAsCurrent(newScene)
  }

  closeAddModal()
  saveMapData()
}

function deleteCurrent() {
  if (!currentScene.value) return
  currentScene.value = ''
  saveMapData()
}

// Watch for add buttons
watch(showAddCountry, (val) => {
  if (val) {
    addType.value = 'country'
    showAddModal.value = true
    showAddCountry.value = false
  }
})

watch(showAddCity, (val) => {
  if (val) {
    addType.value = 'city'
    showAddModal.value = true
    showAddCity.value = false
  }
})

watch(showAddScene, (val) => {
  if (val) {
    addType.value = 'scene'
    showAddModal.value = true
    showAddScene.value = false
  }
})

watch(() => gameStore.worldMapState, () => {
  syncEditingSelection()
}, { deep: true })
</script>

<style scoped>
.world-map {
  color: var(--text-primary);
}

.map-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.map-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

/* 当前位置 */
.current-loc {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 8px;
}

.current-loc:hover {
  background: var(--bg-hover);
}

.loc-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.loc-info {
  flex: 1;
  min-width: 0;
}

.loc-label {
  font-size: 10px;
  color: var(--text-muted);
  display: block;
  margin-bottom: 2px;
}

.loc-value {
  font-size: 12px;
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
  width: 420px;
  max-width: 95%;
  max-height: 80vh;
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
  padding: 16px;
  display: flex;
  gap: 12px;
}

.section {
  flex: 1;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.add-small {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.add-small:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.list-item:hover {
  background: var(--bg-hover);
}

.list-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.current-tag {
  font-size: 9px;
  padding: 2px 6px;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
}

.delete-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
}

.list-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
}

/* 添加表单 */
.add-form {
  width: 100%;
}

.preset-section {
  margin-bottom: 12px;
}

.preset-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.preset-btn {
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.name-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.name-input:focus {
  outline: none;
  border-color: var(--accent);
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

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.danger {
  color: var(--danger);
  margin-right: auto;
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
