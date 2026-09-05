/**
 * 原型 ①——当前 Canvas 基线（模拟 WorldMapVoronoi 的单画布方案）：
 * 完整渲染到离屏画布，视口缩放/平移只做整体拉伸。标签、图标随图缩放，
 * 无 LOD、无重新避让。此原型用于测量对照，不修改旧组件本身。
 */

export function renderLegacyCanvasPrototype(container, shared) {
  container.innerHTML = ''
  const { fullCanvas, doc } = shared
  const W = doc.baseAsset.width
  const H = doc.baseAsset.height

  const canvas = document.createElement('canvas')
  canvas.className = 'base'
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d').drawImage(fullCanvas, 0, 0)
  container.appendChild(canvas)

  let scale = Math.min(container.clientWidth / W, container.clientHeight / H)
  let tx = (container.clientWidth - W * scale) / 2
  let ty = (container.clientHeight - H * scale) / 2
  const apply = () => {
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }
  apply()

  let dragging = false
  let last = null
  canvas.addEventListener('pointerdown', (e) => { dragging = true; last = [e.clientX, e.clientY] })
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', () => { dragging = false })
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    tx = px - (px - tx) * factor
    ty = py - (py - ty) * factor
    scale *= factor
    apply()
  }, { passive: false })

  function onMove(e) {
    if (!dragging) return
    tx += e.clientX - last[0]
    ty += e.clientY - last[1]
    last = [e.clientX, e.clientY]
    apply()
  }

  return {
    ready: Promise.resolve(),
    getView: null, // 整体拉伸方案没有真正的 view；测帧按钮将提示不支持
    dispose() {
      window.removeEventListener('pointermove', onMove)
      container.innerHTML = ''
    },
  }
}
