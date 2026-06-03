/**
 * 构造最小可用的 GridCells 给 `computeTectonicData` 用。
 *  - 链式邻居表（cell i 邻 cell i-1 与 i+1），足够 BFS 扩散
 *  - 坐标线性 (i*10, 0)
 *  - h 用 Int8Array（与 nations.test.js 的实际用法保持一致）
 *  - 只暴露 tectonic-data.ts 实际读取的字段
 */
export function makeCells(n) {
  const length = n
  const p = new Float64Array(length * 2)
  for (let i = 0; i < length; i++) { p[i * 2] = i * 10; p[i * 2 + 1] = 0 }
  const c = new Array(length)
  for (let i = 0; i < length; i++) {
    c[i] = []
    if (i > 0) c[i].push(i - 1)
    if (i + 1 < length) c[i].push(i + 1)
  }
  return {
    length,
    p,
    c,
    h: new Int8Array(length).fill(50),
    s: new Float32Array(length).fill(10),
    state: new Uint16Array(length),
  }
}
