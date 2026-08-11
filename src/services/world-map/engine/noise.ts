/**
 * 地图引擎共享噪声工具（audit-pass2-plan Phase C2）。
 *
 * 收敛原先散落在 heightmap / heightmap-templates / heightmap-template-aware /
 * coast 中的 hash / value noise / fbm 实现。
 *
 * ⚠️ determinism 护栏：fbm 有两种互不等价的变体，不可混用：
 *   - fbmHash：每层采样 = hash2D(x,y)*2-1（原 heightmap.ts / coast.ts）
 *   - fbmValue：每层采样 = valueNoise2D(x,y)（原 heightmap-templates.ts /
 *     heightmap-template-aware.ts）
 * 跨变体替换会改变整张地图的生成结果（map-seed determinism）。
 * climate.ts 的 climateHash2D / sampleClimateNoise 是带盐化的独立实现，
 * 不在此收敛，见 audit-pass2-plan Phase C3。
 */

/** per-octave 旋转角度（P0-3 de-banding），所有 fbm 变体共用。 */
export const FBM_OCTAVE_ANGLE_DEG = 37

/**
 * 简单确定性 hash（per-call 时用 cell 坐标）。
 * 与原 heightmap.ts / coast.ts / heightmap-templates.ts /
 * heightmap-template-aware.ts 的 hash2D 逐字节一致。
 */
export function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** smoothstep 插值核（valueNoise2D 依赖）。 */
export function smooth01(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 线性插值（valueNoise2D 依赖）。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * value noise：在整数格点用 hash2D 取值，再用 smooth01 双线性插值。
 * 返回 [-1, 1]。与原 heightmap-templates.ts / heightmap-template-aware.ts
 * 的 valueNoise2D 逐字节一致。
 */
export function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth01(x - x0)
  const ty = smooth01(y - y0)
  const a = hash2D(x0, y0)
  const b = hash2D(x0 + 1, y0)
  const c = hash2D(x0, y0 + 1)
  const d = hash2D(x0 + 1, y0 + 1)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty) * 2 - 1
}

/**
 * fbm（hash 变体）：每层采样 hash2D(x,y)*2-1。
 * 替代原 heightmap.ts 的 fbm2D 与 coast.ts 的 fbm。
 * per-octave 按 i·37° 旋转采样坐标（P0-3 de-banding）。
 */
export function fbmHash(x: number, y: number, octaves: number): number {
  const theta = FBM_OCTAVE_ANGLE_DEG * Math.PI / 180
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    const c = i === 0 ? 1 : Math.cos(i * theta)
    const s = i === 0 ? 0 : Math.sin(i * theta)
    const xr = x * c - y * s
    const yr = x * s + y * c
    v += amp * (hash2D(xr * freq, yr * freq) * 2 - 1)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}

/**
 * fbm（value 变体）：每层采样 valueNoise2D(x,y)。
 * 替代原 heightmap-templates.ts / heightmap-template-aware.ts 的 fbm2D。
 * per-octave 按 i·37° 旋转采样坐标（P0-3 de-banding）。
 */
export function fbmValue(x: number, y: number, octaves: number): number {
  const theta = FBM_OCTAVE_ANGLE_DEG * Math.PI / 180
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    const c = i === 0 ? 1 : Math.cos(i * theta)
    const s = i === 0 ? 0 : Math.sin(i * theta)
    const xr = x * c - y * s
    const yr = x * s + y * c
    v += amp * valueNoise2D(xr * freq, yr * freq)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}
