import { createRouter } from 'vue-router'
import { AUTHORING_REHEARSAL_INVITE_ROUTE_PATH, COLLABORATION_INVITE_ROUTE_PATH } from '../services/collaboration/endpoint'
import { createPinaxRouterHistory } from './history'

// 懒加载页面组件
const AppShell = () => import('../layouts/AppShell.vue')
const AuthoringWelcomeView = () => import('../views/AuthoringWelcomeView.vue')
const Experience = () => import('../pages/Experience.vue')
const WorldBookQuickImport = () => import('../pages/WorldBookQuickImport.vue')
const WorldbookCreationWorkspace = () => import('../pages/WorldbookCreationWorkspace.vue')
const WorldBookEditor = () => import('../pages/WorldBookEditor.vue')
const StructuredSettings = () => import('../pages/StructuredSettings.vue')
const WorldMapPage = () => import('../pages/WorldMapPage.vue')
const Authoring = () => import('../pages/Authoring.vue')
const Notes = () => import('../pages/Notes.vue')
const ProseEssay = () => import('../pages/ProseEssay.vue')
const ComicStudio = () => import('../pages/ComicStudio.vue')
const OnlineExperience = () => import('../pages/OnlineExperience.vue')
const CollaborationReview = () => import('../pages/CollaborationReview.vue')
const DocsPage = () => import('../pages/DocsPage.vue')

const workbenchChildren = [
  {
    path: 'docs/:chapterId?',
    name: 'docs',
    component: DocsPage,
    meta: { hideGlobalMemory: true, title: '使用指南' }
  },
  {
    path: '',
    name: 'welcome',
    component: AuthoringWelcomeView,
    meta: {
      immersiveShell: true,
      hideActivityBar: true,
      hideSidePanel: true
    }
  },
  {
    path: 'opening',
    name: 'opening',
    redirect: (to) => ({ name: 'experience', query: to.query }),
    meta: {
      immersiveShell: true,
      hideActivityBar: true,
      hideSidePanel: true,
      hideGlobalMemory: true,
      activityKey: 'authoring',
      title: '开场'
    }
  },
  {
    path: 'experience',
    name: 'experience',
    component: Experience,
    meta: {
      activityKey: 'authoring',
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
    path: 'settings/worldbook/create',
    name: 'settings-worldbook-create',
    component: WorldbookCreationWorkspace,
    meta: {
      hideGlobalMemory: true,
      activityKey: 'worldbook',
      title: '设定 · 创建工作区'
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
    path: 'authoring',
    name: 'authoring',
    component: Authoring,
    meta: {
      // Authoring 已有项目级低干扰记忆通知与审阅入口；全局浮动记忆按钮
      // 会遮挡移动端工具带和现场 sheet，且形成第二个状态 owner。
      hideGlobalMemory: true,
      activityKey: 'authoring',
      title: '创作'
    }
  },
  {
    // 兼容别名：旧的写作子路由与站内 name: 'writing' 跳转统一进入 Authoring。
    path: 'writing',
    name: 'writing',
    redirect: { name: 'authoring' }
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
  },
  {
    path: 'comics',
    name: 'comics',
    component: ComicStudio,
    meta: {
      activityKey: 'materials',
      title: '漫画制作'
    }
  },
  {
    path: COLLABORATION_INVITE_ROUTE_PATH,
    name: 'online-experience',
    component: OnlineExperience,
    meta: {
      activityKey: 'authoring',
      title: '联机'
    }
  },
  ...(import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true' ? [{
    path: AUTHORING_REHEARSAL_INVITE_ROUTE_PATH,
    name: 'collaboration-review',
    component: CollaborationReview,
    meta: {
      hideGlobalMemory: true,
      hideActivityBar: true,
      hideSidePanel: true,
      activityKey: 'authoring',
      title: '协作审阅'
    }
  }] : [])
]

const routes = [
  {
    path: '/',
    component: AppShell,
    children: workbenchChildren
  },
  { path: '/writing', redirect: { name: 'authoring' } },
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
  history: createPinaxRouterHistory(),
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
