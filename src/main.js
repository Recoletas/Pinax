import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useWorkspaceTabsStore } from './stores/workspaceTabsStore'
import { installWorkspaceRouteAdapter } from './services/workspace/workspaceRouteAdapter'
import './styles/main.css'
import './styles/themes/kao.css' // kao is the default variant — bundle into initial CSS chunk to avoid FOUC

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 工作台标签会话与路由双向同步：AppShell 只消费 store，导航真源仍是 URL。
installWorkspaceRouteAdapter(useWorkspaceTabsStore(pinia), router)

app.mount('#app')