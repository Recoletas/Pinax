import { defineStore } from 'pinia'
import { STORAGE_KEYS, getItem, setItem } from '../composables/useStorage'

function createNodeId() {
  return 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

function createDefaultRootNode() {
  return {
    id: createNodeId(),
    parentId: null,
    name: '主世界',
    description: '故事发生的主要世界',
    icon: 'world',
    sortOrder: 0,
    mapConfigJSON: null,
    createdAt: Date.now(),
  }
}

export const useGeographyStore = defineStore('geography', {
  state: () => ({
    // ── 地理数据 ──
    overview: '',
    locations: [],

    // ── 世界树 ──
    worldNodes: [],
    activeWorldId: null,

    // ── 地图配置 ──
    voronoiConfig: null,
    markers: [],
  }),

  getters: {
    activeWorldNode: (state) =>
      state.worldNodes.find(n => n.id === state.activeWorldId) || null,

    worldTree: (state) => {
      const map = new Map()
      const roots = []
      for (const n of state.worldNodes) {
        map.set(n.id, { ...n, children: [] })
      }
      for (const n of state.worldNodes) {
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
    },
  },

  actions: {
    // ── 加载/持久化 ──
    loadAll() {
      const data = getItem(STORAGE_KEYS.GEOGRAPHY_DATA)
      if (data) {
        this.overview = data.overview || ''
        this.locations = Array.isArray(data.locations) ? data.locations : []
      }

      const nodes = getItem(STORAGE_KEYS.WORLD_NODES)
      if (Array.isArray(nodes)) {
        this.worldNodes = nodes
      }

      // 确保至少有一个根世界
      if (this.worldNodes.length === 0) {
        const root = createDefaultRootNode()
        this.worldNodes = [root]
        this.activeWorldId = root.id
        this.saveWorldNodes()
      } else if (!this.activeWorldId) {
        const root = this.worldNodes.find(n => !n.parentId)
        this.activeWorldId = root?.id || this.worldNodes[0]?.id || null
      }

      this.loadActiveWorldConfig()
    },

    saveGeography(data) {
      if (data.overview !== undefined) this.overview = data.overview
      if (data.locations !== undefined) this.locations = data.locations
      setItem(STORAGE_KEYS.GEOGRAPHY_DATA, {
        overview: this.overview,
        locations: this.locations,
      })
    },

    saveWorldNodes() {
      setItem(STORAGE_KEYS.WORLD_NODES, this.worldNodes)
    },

    loadActiveWorldConfig() {
      const node = this.worldNodes.find(n => n.id === this.activeWorldId)
      if (node?.mapConfigJSON) {
        try {
          const parsed = JSON.parse(node.mapConfigJSON)
          // 兼容旧格式：如果 parsed 有 voronoiConfig 字段则为新格式
          if (parsed && typeof parsed === 'object' && parsed.voronoiConfig !== undefined) {
            this.voronoiConfig = parsed.voronoiConfig
            this.markers = Array.isArray(parsed.markers) ? parsed.markers : []
          } else {
            // 旧格式：整个 parsed 就是 voronoiConfig
            this.voronoiConfig = parsed
            this.markers = []
          }
        } catch {
          this.voronoiConfig = null
          this.markers = []
        }
      } else {
        this.voronoiConfig = null
        this.markers = []
      }
    },

    // ── 世界树 CRUD ──
    createNode(data) {
      const node = {
        id: createNodeId(),
        parentId: data.parentId || null,
        name: data.name || '新世界',
        description: data.description || '',
        icon: data.icon || 'world',
        sortOrder: data.sortOrder || 0,
        mapConfigJSON: null,
        createdAt: Date.now(),
      }
      this.worldNodes.push(node)
      this.saveWorldNodes()
      return node
    },

    updateNode(id, patch) {
      const idx = this.worldNodes.findIndex(n => n.id === id)
      if (idx >= 0) {
        this.worldNodes[idx] = { ...this.worldNodes[idx], ...patch }
        this.saveWorldNodes()
      }
    },

    deleteNode(id) {
      const toDelete = new Set()
      const collect = (parentId) => {
        toDelete.add(parentId)
        for (const n of this.worldNodes) {
          if (n.parentId === parentId && n.id) collect(n.id)
        }
      }
      collect(id)
      this.worldNodes = this.worldNodes.filter(n => !toDelete.has(n.id))
      if (toDelete.has(this.activeWorldId)) {
        const root = this.worldNodes.find(n => !n.parentId)
        this.activeWorldId = root?.id || this.worldNodes[0]?.id || null
      }
      this.saveWorldNodes()
      this.loadActiveWorldConfig()
    },

    setActiveWorld(id) {
      this.activeWorldId = id
      this.loadActiveWorldConfig()
    },

    saveVoronoiConfig(config) {
      this.voronoiConfig = config
      this.persistMapData()
    },

    persistMapData() {
      if (this.activeWorldId) {
        this.updateNode(this.activeWorldId, {
          mapConfigJSON: JSON.stringify({
            voronoiConfig: this.voronoiConfig,
            markers: this.markers,
          })
        })
      }
    },

    // ── 标记 CRUD ──
    addMarker(marker) {
      this.markers.push(marker)
      this.persistMapData()
    },

    updateMarker(id, patch) {
      const idx = this.markers.findIndex(m => m.id === id)
      if (idx >= 0) {
        this.markers[idx] = { ...this.markers[idx], ...patch }
        this.persistMapData()
      }
    },

    deleteMarker(id) {
      this.markers = this.markers.filter(m => m.id !== id)
      this.persistMapData()
    },
  },
})
