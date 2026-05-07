import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Fit from '../pages/Fit.vue'
import Game from '../pages/Game.vue'
import Writing from '../pages/Writing.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/fit', name: 'fit', component: Fit },
  { path: '/game', name: 'game', component: Game },
  { path: '/writing', name: 'writing', component: Writing }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router