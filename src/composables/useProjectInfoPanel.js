// 项目资料面板（全局单例）：新建 / 编辑 / 导入绑定 / 导入项目 四模式共用的统一面板。
// open({mode, book, onCreated}) —— onCreated 供宿主页面（如 Authoring）接管创建后的选书与助手衔接；
// 未传 onCreated 时用注入的 navigate（面板宿主组件经 useRouter 注入，见 ProjectInfoPanel.vue）
// 导航到 authoring?bookId=。导航注入是为了斩断本模块对 router 的静态依赖
// （useProjectInfoPanel → router → AuthoringWelcomeView → Authoring → 本模块，结构门禁 4 连环）。
import { ref } from 'vue'

const isOpen = ref(false)
const mode = ref('create')
const book = ref(null)
const onCreated = ref(null)
let navigateToBook = null

export function useProjectInfoPanel(options = {}) {
  if (typeof options.navigate === 'function') navigateToBook = options.navigate
  function open(options = {}) {
    mode.value = options.mode || 'create'
    book.value = options.book || null
    onCreated.value = typeof options.onCreated === 'function' ? options.onCreated : null
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
    book.value = null
    onCreated.value = null
  }
  function finishCreated(createdBook) {
    const callback = onCreated.value
    close()
    if (callback) {
      callback(createdBook)
      return
    }
    navigateToBook?.(createdBook)
  }
  return { isOpen, mode, book, open, close, finishCreated }
}
