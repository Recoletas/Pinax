import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Fit from '../pages/Fit.vue'
import Game from '../pages/Game.vue'
import Writing from '../pages/Writing.vue'
import Notes from '../pages/Notes.vue'
import PoetryLab from '../pages/PoetryLab.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/fit', name: 'fit', component: Fit },
  { path: '/game', name: 'game', component: Game },
  { path: '/writing', name: 'writing', component: Writing },
  { path: '/notes', name: 'notes', component: Notes },
  { path: '/poetry-lab', name: 'poetry-lab', component: PoetryLab }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router