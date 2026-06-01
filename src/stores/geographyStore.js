import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { STORAGE_KEYS, getItem, setItem } from '../composables/useStorage'

export const useGeographyStore = defineStore('geography', () => {
  // ── 地理数据 ──
  const overview = ref('')
  const locations = ref([])

  // ── 世界树 ──
  const worldNodes = ref([])
  const activeWorldId = ref(null)

  // ── 地图配置 ──
  const voronoiConfig = ref(null)
  const markers = ref([])

  // ── 加载全部数据 ──
  function loadAll() {
    const data = getItem(STORAGE_KEYS.GEOGRAPHY_DATA)
    if (data) {
      overview.value = data.overview || ''
      locations.value = Array.isArray(data.locations) ? data.locations : []
    }

    const nodes = getItem(STORAGE_KEYS.WORLD_NODES)
    if (Array.isArray(nodes)) {
      worldNodes.value = nodes
    }

    // 确保至少有一个根世界
    if (worldNodes.value.length === 0) {
      const root = createDefaultRootNode()
      worldNodes.value = [root]
      activeWorldId.value = root.id
      saveWorldNodes()
    } else if (!activeWorldId.value) {
      const root = worldNodes.value.find(n => !n.parentId)
      activeWorldId.value = root?.id || worldNodes.value[0]?.id || null
    }

    // 加载活跃世界的地图配置
    loadActiveWorldConfig()
  }

  function saveGeography(data) {
    if (data.overview !== undefined) overview.value = data.overview
    if (data.locations !== undefined) locations.value = data.locations
    setItem(STORAGE_KEYS.GEOGRAPHY_DATA, {
      overview: overview.value,
      locations: locations.value,
    })
  }

  function saveWorldNodes() {
    setItem(STORAGE_KEYS.WORLD_NODES, worldNodes.value)
  }

  // ── 加载活跃世界的地图配置 ──
  function loadActiveWorldConfig() {
    const node = worldNodes.value.find(n => n.id === activeWorldId.value)
    if (node?.mapConfigJSON) {
      try {
        const parsed = JSON.parse(node.mapConfigJSON)
        // 兼容旧格式：如果 parsed 有 voronoiConfig 字段则为新格式
        if (parsed && typeof parsed === 'object' && parsed.voronoiConfig !== undefined) {
          voronoiConfig.value = parsed.voronoiConfig
          markers.value = Array.isArray(parsed.markers) ? parsed.markers : []
        } else {
          // 旧格式：整个 parsed 就是 voronoiConfig
          voronoiConfig.value = parsed
          markers.value = []
        }
      } catch {
        voronoiConfig.value = null
        markers.value = []
      }
    } else {
      voronoiConfig.value = null
      markers.value = []
    }
  }

  // ── 世界树 CRUD ──
  function createNode(data) {
    const node = {
      id: 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      parentId: data.parentId || null,
      name: data.name || '新世界',
      description: data.description || '',
      icon: data.icon || 'world',
      sortOrder: data.sortOrder || 0,
      mapConfigJSON: null,
      createdAt: Date.now(),
    }
    worldNodes.value.push(node)
    saveWorldNodes()
    return node
  }

  function updateNode(id, patch) {
    const idx = worldNodes.value.findIndex(n => n.id === id)
    if (idx >= 0) {
      worldNodes.value[idx] = { ...worldNodes.value[idx], ...patch }
      saveWorldNodes()
    }
  }

  function deleteNode(id) {
    const toDelete = new Set()
    function collect(parentId) {
      toDelete.add(parentId)
      for (const n of worldNodes.value) {
        if (n.parentId === parentId && n.id) collect(n.id)
      }
    }
    collect(id)
    worldNodes.value = worldNodes.value.filter(n => !toDelete.has(n.id))
    if (toDelete.has(activeWorldId.value)) {
      const root = worldNodes.value.find(n => !n.parentId)
      activeWorldId.value = root?.id || worldNodes.value[0]?.id || null
    }
    saveWorldNodes()
    loadActiveWorldConfig()
  }

  function setActiveWorld(id) {
    activeWorldId.value = id
    loadActiveWorldConfig()
  }

  function saveVoronoiConfig(config) {
    voronoiConfig.value = config
    persistMapData()
  }

  function persistMapData() {
    if (activeWorldId.value) {
      updateNode(activeWorldId.value, {
        mapConfigJSON: JSON.stringify({
          voronoiConfig: voronoiConfig.value,
          markers: markers.value,
        })
      })
    }
  }

  // ── 标记 CRUD ──
  function addMarker(marker) {
    markers.value.push(marker)
    persistMapData()
  }

  function updateMarker(id, patch) {
    const idx = markers.value.findIndex(m => m.id === id)
    if (idx >= 0) {
      markers.value[idx] = { ...markers.value[idx], ...patch }
      persistMapData()
    }
  }

  function deleteMarker(id) {
    markers.value = markers.value.filter(m => m.id !== id)
    persistMapData()
  }

  // ── 树形结构（computed） ──
  const worldTree = computed(() => {
    const map = new Map()
    const roots = []
    for (const n of worldNodes.value) {
      map.set(n.id, { ...n, children: [] })
    }
    for (const n of worldNodes.value) {
      const node = map.get(n.id)
      if (!node) continue
      if (!n.parentId) {
        roots.push(node)
      } else {
        const parent = map.get(n.parentId)
        if (parent) parent.children.push(node)
        else roots.push(node)
      }
    }
    return roots
  })

  // ── 当前活跃世界节点 ──
  const activeWorldNode = computed(() =>
    worldNodes.value.find(n => n.id === activeWorldId.value) || null
  )

  return {
    // state
    overview,
    locations,
    worldNodes,
    activeWorldId,
    voronoiConfig,
    markers,
    // computed
    worldTree,
    activeWorldNode,
    // actions
    loadAll,
    saveGeography,
    createNode,
    updateNode,
    deleteNode,
    setActiveWorld,
    saveVoronoiConfig,
    addMarker,
    updateMarker,
    deleteMarker,
  }
})

function createDefaultRootNode() {
  return {
    id: 'wn_' + Date.now(),
    parentId: null,
    name: '主世界',
    description: '故事发生的主要世界',
    icon: 'world',
    sortOrder: 0,
    mapConfigJSON: null,
    createdAt: Date.now(),
  }
}
