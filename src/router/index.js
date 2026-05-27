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
      title: '体验'
    }
  },
  {
    path: 'experience/worldbook',
    name: 'experience-worldbook',
    component: WorldBookQuickImport,
    meta: {
      activityKey: 'worldbook',
      title: '设定导入'
    }
  },
  {
    path: 'experience/worldbook/advanced',
    name: 'experience-worldbook-advanced',
    component: WorldBookEditor,
    meta: {
      activityKey: 'worldbook',
      title: '设定编辑'
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
      title: '写作'
    }
  },
  {
    path: 'materials',
    name: 'materials',
    component: Notes,
    meta: {
      activityKey: 'writing',
      title: '素材'
    }
  },
  {
    path: 'poetry-lab',
    name: 'poetry-lab',
    component: PoetryLab,
    meta: {
      activityKey: 'storyboard',
      title: '分镜 - 诗歌入口'
    }
  },
  {
    path: 'prose-essay',
    name: 'prose-essay',
    component: ProseEssay,
    meta: {
      activityKey: 'storyboard',
      title: '分镜 - 散文入口'
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
  { path: '/materials', redirect: { name: 'materials' } },
  { path: '/notes', redirect: { name: 'materials' } },
  { path: '/poetry-lab', redirect: { name: 'poetry-lab' } },
  { path: '/prose-essay', redirect: { name: 'prose-essay' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
