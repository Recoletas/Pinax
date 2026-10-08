// 项目资料面板（全局单例）：新建 / 编辑 / 导入绑定 / 导入项目 四模式共用的统一面板。
// open({mode, book, onCreated}) —— onCreated 供宿主页面（如 Authoring）接管创建后的选书与助手衔接；
// 未传 onCreated 时默认导航到 authoring?bookId=（跨路由重挂载后 query 生效）。
import { ref } from 'vue'

const isOpen = ref(false)
const mode = ref('create')
const book = ref(null)
const onCreated = ref(null)

export function useProjectInfoPanel() {
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
    void import('../router/index.js').then(({ default: router }) => {
      void router.push({ name: 'authoring', query: { bookId: createdBook.id } })
    })
  }
  return { isOpen, mode, book, open, close, finishCreated }
}
