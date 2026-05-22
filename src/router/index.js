import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'
import Game from '../pages/Game.vue'
import Writing from '../pages/Writing.vue'
import Notes from '../pages/Notes.vue'
import PoetryLab from '../pages/PoetryLab.vue'
import ProseEssay from '../pages/ProseEssay.vue'
import WelcomeView from '../views/WelcomeView.vue'

const workbenchChildren = [
  {
    path: '',
    name: 'welcome',
    component: WelcomeView
  },
  {
    path: 'fit',
    redirect: { name: 'game' }
  },
  {
    path: 'game',
    name: 'game',
    component: Game,
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
  { path: '/fit', redirect: { name: 'game' } },
  { path: '/game', redirect: { name: 'game' } },
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