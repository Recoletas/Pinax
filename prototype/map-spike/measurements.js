/**
 * P1 spike 测量工具：帧率、长帧、堆、挂载/卸载循环、字体。
 * 结果展示在状态栏并可导出 JSON（§9.6：结构化测量报告 1 份）。
 */

const records = {}

export function record(key, value) {
  records[key] = value
  window.__mapSpikeRecords = records
}

export function heapMB() {
  if (performance.memory) return Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10
  return -1
}

/**
 * 连续缩放测帧：animate(view) 在 durationMs 内往返缩放。
 * 返回 { frames, longFrames32, longFrames50, fps }。
 */
export function measureZoomBurst(view, durationMs = 6000) {
  return new Promise((resolve) => {
    const start = performance.now()
    let frames = 0
    let long32 = 0
    let long50 = 0
    let prev = start
    const minRes = view.getMinResolution()
    const maxRes = view.getMaxResolution() / 2
    let phase = 0
    const base = view.getResolution()

    function tick(now) {
      const elapsed = now - prev
      if (elapsed > 32) long32++
      if (elapsed > 50) long50++
      frames++
      prev = now
      const t = (now - start) / durationMs
      if (t >= 1) {
        resolve({ frames, longFrames32: long32, longFrames50: long50, fps: Math.round((frames / durationMs) * 1000) })
        return
      }
      // 平滑往返：res = base * (maxRes/base)^(triangle wave)
      const tri = t < 0.5 ? t * 2 : (1 - t) * 2
      const expo = Math.log2(maxRes / base)
      view.setResolution(Math.min(maxRes, Math.max(minRes, base * Math.pow(2, expo * (tri * 2 - 1) * 0.5))))
      phase++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * 20 次挂载/卸载：create() 返回带 dispose 的实例。
 * 记录 heap 前后与每次 dispose 耗时。
 */
export async function measureMountUnmount(create, times = 20) {
  const disposeTimes = []
  const heapBefore = heapMB()
  const rafBefore = countRaf()
  for (let i = 0; i < times; i++) {
    const inst = create()
    await inst.ready
    const t0 = performance.now()
    inst.dispose()
    disposeTimes.push(Math.round(performance.now() - t0))
    await new Promise((r) => requestAnimationFrame(r))
  }
  await new Promise((r) => setTimeout(r, 500))
  const heapAfter = heapMB()
  return {
    times,
    heapBeforeMB: heapBefore,
    heapAfterMB: heapAfter,
    heapDeltaMB: Math.round((heapAfter - heapBefore) * 10) / 10,
    disposeTimesMs: disposeTimes,
    rafBaseline: rafBefore,
  }
}

function countRaf() {
  return window.__mapSpikeRafCount ?? 0
}

export function installRafCounter() {
  window.__mapSpikeRafCount = 0
  const orig = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => orig((t) => {
    window.__mapSpikeRafCount++
    cb(t)
  })
}

export function exportRecords() {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'map-p1-measurements.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
