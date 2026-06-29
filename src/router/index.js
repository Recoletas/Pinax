import { createRouter, createWebHistory } from 'vue-router'

// 懒加载页面组件
const AppShell = () => import('../layouts/AppShell.vue')
const ThemeVariantView = () => import('../components/theme/ThemeVariantView.vue')
const WorldBookQuickImport = () => import('../pages/WorldBookQuickImport.vue')
const WorldBookEditor = () => import('../pages/WorldBookEditor.vue')
const StructuredSettings = () => import('../pages/StructuredSettings.vue')
const WorldMapPage = () => import('../pages/WorldMapPage.vue')
const Writing = () => import('../pages/Writing.vue')
const Notes = () => import('../pages/Notes.vue')
const ProseEssay = () => import('../pages/ProseEssay.vue')

const workbenchChildren = [
  {
    path: '',
    name: 'welcome',
    component: ThemeVariantView,
    props: { view: 'welcome' },
    meta: {
      immersiveShell: true,
      hideActivityBar: true,
      hideSidePanel: true
    }
  },
  {
    path: 'opening',
    name: 'opening',
    component: ThemeVariantView,
    props: { view: 'opening' },
    meta: {
      immersiveShell: true,
      hideActivityBar: true,
      hideSidePanel: true,
      hideGlobalMemory: true,
      activityKey: 'experience',
      title: '开场'
    }
  },
  {
    path: 'experience',
    name: 'experience',
    component: ThemeVariantView,
    props: { view: 'experience' },
    meta: {
      activityKey: 'experience',
      title: '体验'
    }
  },
  {
    path: 'settings/worldbook',
    name: 'settings-worldbook',
    component: WorldBookQuickImport,
    meta: {
      hideGlobalMemory: true,
      activityKey: 'worldbook',
      title: '设定 · 快速导入'
    }
  },
  {
    path: 'settings/worldbook/advanced',
    name: 'settings-worldbook-advanced',
    component: WorldBookEditor,
    meta: {
      activityKey: 'worldbook',
      title: '世界书 · 高级设置'
    }
  },
  {
    path: 'settings/structured',
    name: 'settings-structured',
    component: StructuredSettings,
    meta: {
      activityKey: 'worldbook',
      title: '设定 · 结构化设定'
    }
  },
  {
    path: 'settings/world-map',
    name: 'settings-world-map',
    component: WorldMapPage,
    meta: {
      activityKey: 'worldbook',
      title: '世界地图'
    }
  },
  {
    path: 'writing',
    name: 'writing',
    component: Writing,
    meta: {
      activityKey: 'writing',
      title: '写作'
    }
  },
  {
    path: 'materials',
    name: 'materials',
    component: Notes,
    meta: {
      activityKey: 'materials',
      title: '素材'
    }
  },
  {
    path: 'prose-essay',
    name: 'prose-essay',
    component: ProseEssay,
    meta: {
      activityKey: 'storyboard',
      title: '卡片画布'
    }
  }
]

const routes = [
  {
    path: '/',
    component: AppShell,
    children: workbenchChildren
  },
  { path: '/writing', redirect: { name: 'writing' } },
  { path: '/materials', redirect: { name: 'materials' } },
  { path: '/notes', redirect: { name: 'materials' } },
  { path: '/poetry-lab', redirect: { name: 'prose-essay' } },
  { path: '/experience/worldbook/advanced', redirect: { name: 'settings-worldbook-advanced' } },
  { path: '/experience/worldbook', redirect: { name: 'settings-worldbook' } },
  { path: '/experience/settings/structured', redirect: { name: 'settings-structured' } },
  { path: '/experience/world-map', redirect: { name: 'settings-world-map' } },
  { path: '/prose-essay', redirect: { name: 'prose-essay' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 捕获懒加载 chunk 失败，自动刷新重试一次
router.onError((error, to) => {
  const isChunkError = error?.message?.includes('Failed to fetch dynamically imported module')
    || error?.message?.includes('Importing a module script failed')
    || error?.message?.includes('Loading chunk')
    || error?.name === 'ChunkLoadError'

  if (isChunkError) {
    const reloadKey = `chunk-reload-${to?.fullPath || 'unknown'}`
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.href = to?.fullPath || window.location.href
    }
  }
})

export default router
