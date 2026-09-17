import { reactive } from 'vue'
import { getComicCanvasSize, getComicPanelRect } from '../../services/media/comicLayout'
import { getMediaAssetDataUrl } from '../../services/media/mediaAssetStore'

// 页目录缩略图（约束 3）：无图时用真实格框几何拼出可辨轮廓，
// 有图时懒加载该页第一个已选画面的数据 URL，不在挂载时全量拉取。
export function useComicPageThumbnails() {
  const covers = reactive({})
  const loading = reactive({})
  let observer = null
  let watchTargets = new Map()
  let sequence = 0

  function coverPanel(page) {
    return (page.panels || []).find((panel) => panel.selectedTakeId && panel.imageTakes?.some((take) => take.id === panel.selectedTakeId))
      || (page.panels || []).find((panel) => panel.selectedTakeId)
      || null
  }

  function frameGeometry(page) {
    const canvas = getComicCanvasSize(page?.canvas)
    const panels = (page?.panels || []).map((panel) => {
      const rect = getComicPanelRect(page, panel.order)
      if (!rect) return null
      return {
        id: panel.id,
        left: `${(rect.x / canvas.width) * 100}%`,
        top: `${(rect.y / canvas.height) * 100}%`,
        width: `${(rect.width / canvas.width) * 100}%`,
        height: `${(rect.height / canvas.height) * 100}%`,
        filled: Boolean(panel.selectedTakeId)
      }
    }).filter(Boolean)
    return { panels, aspect: `${canvas.width} / ${canvas.height}` }
  }

  function observeElement(pageId, element) {
    if (!element) return
    watchTargets.set(pageId, element)
    ensureObserver()
    observer.observe(element)
  }

  function unobserveElement(pageId) {
    const element = watchTargets.get(pageId)
    if (element && observer) observer.unobserve(element)
    watchTargets.delete(pageId)
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return
    const ticket = sequence
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const pageId = entry.target?.dataset?.comicThumbId
        if (!pageId) continue
        observer.unobserve(entry.target)
        void loadCover(pageId, ticket)
      }
    }, { rootMargin: '120px' })
  }

  async function loadCover(pageId, ticket) {
    if (covers[pageId] || loading[pageId]) return
    const element = watchTargets.get(pageId)
    const takeId = element?.dataset?.comicThumbTake
    if (!takeId) return
    loading[pageId] = true
    try {
      const data = await getMediaAssetDataUrl(takeId)
      if (ticket !== sequence) return
      if (data) covers[pageId] = data
    } catch {
      // 无图缩略图继续展示真实格框轮廓。
    } finally {
      if (ticket === sequence) loading[pageId] = false
    }
  }

  function reset() {
    sequence += 1
    for (const key of Object.keys(covers)) delete covers[key]
    for (const key of Object.keys(loading)) delete loading[key]
    if (observer) {
      for (const element of watchTargets.values()) observer.unobserve(element)
    }
    watchTargets = new Map()
  }

  return { covers, loading, frameGeometry, coverPanel, observeElement, unobserveElement, reset }
}
