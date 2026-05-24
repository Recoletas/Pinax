import { createRouter, createWebHistory } from 'vue-router'

// 懒加载页面组件
const AppShell = () => import('../layouts/AppShell.vue')
const WelcomeView = () => import('../views/WelcomeView.vue')
const Experience = () => import('../pages/Experience.vue')
const WorldBookQuickImport = () => import('../pages/WorldBookQuickImport.vue')
const WorldBookEditor = () => import('../pages/WorldBookEditor.vue')
const Writing = () => import('../pages/Writing.vue')
const Notes = () => import('../pages/Notes.vue')
const PoetryLab = () => import('../pages/PoetryLab.vue')
const ProseEssay = () => import('../pages/ProseEssay.vue')

const workbenchChildren = [
  {
    path: '',
    name: 'welcome',
    component: WelcomeView
  },
  {
    path: 'fit',
    redirect: { name: 'experience' }
  },
  {
    path: 'experience',
    name: 'experience',
    component: Experience,
    meta: {
      activityKey: 'experience',
      title: '小说体验'
    }
  },
  {
    path: 'experience/worldbook',
    name: 'experience-worldbook',
    component: WorldBookQuickImport,
    meta: {
      activityKey: 'experience',
      title: '世界书快速导入'
    }
  },
  {
    path: 'experience/worldbook/advanced',
    name: 'experience-worldbook-advanced',
    component: WorldBookEditor,
    meta: {
      activityKey: 'experience',
      title: '世界书编辑器'
    }
  },
  {
    path: 'game',
    name: 'game',
    redirect: { name: 'experience' },
    meta: {
      activityKey: 'experience',
      title: '小说体验'
    }
  },
  {
    path: 'writing',
    name: 'writing',
    component: Writing,
    meta: {
      activityKey: 'writing',
      title: '小说'
    }
  },
  {
    path: 'notes',
    name: 'notes',
    component: Notes,
    meta: {
      activityKey: 'writing',
      title: '笔记'
    }
  },
  {
    path: 'poetry-lab',
    name: 'poetry-lab',
    component: PoetryLab,
    meta: {
      activityKey: 'poetry',
      title: '诗歌灵感工坊'
    }
  },
  {
    path: 'prose-essay',
    name: 'prose-essay',
    component: ProseEssay,
    meta: {
      activityKey: 'prose',
      title: '散文随笔'
    }
  }
]

const routes = [
  {
    path: '/',
    component: AppShell,
    children: workbenchChildren
  },
  { path: '/fit', redirect: { name: 'experience' } },
  { path: '/game', redirect: { name: 'experience' } },
  { path: '/writing', redirect: { name: 'writing' } },
  { path: '/notes', redirect: { name: 'notes' } },
  { path: '/poetry-lab', redirect: { name: 'poetry-lab' } },
  { path: '/prose-essay', redirect: { name: 'prose-essay' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router