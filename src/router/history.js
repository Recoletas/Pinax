import { createWebHashHistory, createWebHistory } from 'vue-router'

export function createPinaxRouterHistory(scope = globalThis) {
  return scope?.pinaxDesktop?.platform === 'desktop'
    ? createWebHashHistory()
    : createWebHistory()
}
