import { i18n, uiLocale } from './i18n/index.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useWorkspaceTabsStore } from './stores/workspaceTabsStore'
import { installWorkspaceRouteAdapter } from './services/workspace/workspaceRouteAdapter'
import './styles/main.css'
import './styles/themes/legacy.css'
import './styles/experience-reading.css'
import './styles/workbench-controls.css'
import './styles/interface-language.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
document.documentElement.lang = uiLocale.value
app.use(router)

// 工作台标签会话与路由双向同步：AppShell 只消费 store，导航真源仍是 URL。
installWorkspaceRouteAdapter(useWorkspaceTabsStore(pinia), router)

app.mount('#app')
