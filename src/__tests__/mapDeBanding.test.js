/**
 * P0 de-banding verification.
 *
 * Asserts that:
 *  1. The climate coherent-noise helper exists and is **spatially coherent**
 *     (same input → same output; neighboring inputs → correlated outputs),
 *     unlike `rng()`/alea which is white (cell-independent).
 *  2. The declared numeric knobs are actually READ:
 *     - `realism.climate.noise` → different temp/precip at noise=0 vs noise=0.6
 *       (same seed, same cells).
 *     - `realism.shape.polarMaskFloor` → different heightmap when floor changes.
 *     - `realism.shape.latitudeShaping` → different remap when shaping changes.
 *
 * These guard against a regression where the knobs are declared in `types.ts`
 * but silently ignored (the original "disconnected after declaring" failure).
 */
import { describe, expect, it } from 'vitest'
import { sampleClimateNoise, calculateTemperature, calculatePrecipitation } from '../services/world-map/engine/climate'
import { generateHeightmap } from '../services/world-map/engine/heightmap'
import { adjustSeaLevelTemplateAware } from '../services/world-map/engine/heightmap-template-aware'
import { seedRandom } from '../services/world-map/engine/random'

// ── helpers ────────────────────────────────────────────────────────────

/** Minimal flat grid: N×N cells on a WxH canvas, all land at h=30, flat neighbors. */
function makeFlatGrid(N, W, H) {
  const n = N * N
  const cellW = W / N
  const cellH = H / N
  const p = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / N)
    const c = i % N
    p[i * 2] = (c + 0.5) * cellW
    p[i * 2 + 1] = (r + 0.5) * cellH
  }
  // 4-neighbor adjacency
  const c = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / N)
    const col = i % N
    const nb = []
    if (r > 0) nb.push(i - N)
    if (r < N - 1) nb.push(i + N)
    if (col > 0) nb.push(i - 1)
    if (col < N - 1) nb.push(i + 1)
    c.push(nb)
  }
  const tectonic = {
    plateId: new Uint16Array(n),
    boundaryDist: new Float32Array(n),
    boundaryType: new Uint8Array(n),
    subduction: new Uint8Array(n),
    orogenyAge: new Uint8Array(n),
    volcanoArc: new Uint8Array(n),
  }
  return {
    length: n,
    p,
    c,
    v: Array.from({ length: n }, () => []),
    b: new Uint8Array(n),
    h: new Uint8Array(n).fill(30),
    t: new Int8Array(n),
    f: new Uint16Array(n),
    temp: new Int8Array(n),
    prec: new Uint8Array(n),
    biome: new Uint8Array(n),
    r: new Uint16Array(n),
    fl: new Float32Array(n),
    s: new Float32Array(n),
    pop: new Float32Array(n),
    culture: new Uint16Array(n),
    state: new Uint16Array(n),
    burg: new Uint16Array(n),
    haven: new Uint16Array(n),
    harbor: new Uint8Array(n),
    tectonic,
  }
}

function zeroWind(n) {
  return {
    wx: new Float32Array(n),
    wy: new Float32Array(n),
    ws: new Float32Array(n),
  }
}

// ── 1. coherent noise helper ──────────────────────────────────────────

describe('P0-1 climate coherent noise helper', () => {
  it('sampleClimateNoise is exported', () => {
    expect(typeof sampleClimateNoise).toBe('function')
  })

  it('is deterministic: same input → same output', () => {
    const a = sampleClimateNoise(0.3, 0.4)
    const b = sampleClimateNoise(0.3, 0.4)
    expect(a).toBe(b)
  })

  it('returns values in [-1, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const u = i / 50
      const v = (i * 7) % 50 / 50
      const n = sampleClimateNoise(u, v)
      expect(n).toBeGreaterThanOrEqual(-1)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('is spatially coherent: adjacent cells are correlated, not independent', () => {
    // Two cells 1% apart in normalized coords should produce values within
    // 0.3 of each other (value noise is continuous). White noise (rng) would
    // give independent samples with expected diff ~0.33.
    let maxNeighborDiff = 0
    let maxFarDiff = 0
    for (let i = 0; i < 100; i++) {
      const u = (i * 0.0137) % 1
      const v = (i * 0.0293) % 1
      const near = sampleClimateNoise(u + 0.01, v)
      const here = sampleClimateNoise(u, v)
      const far = sampleClimateNoise((u + 0.5) % 1, (v + 0.5) % 1)
      maxNeighborDiff = Math.max(maxNeighborDiff, Math.abs(near - here))
      maxFarDiff = Math.max(maxFarDiff, Math.abs(far - here))
    }
    // Coherent: neighbor diff must be small (continuity).
    expect(maxNeighborDiff).toBeLessThan(0.25)
    // And there must be actual variation somewhere (far samples differ),
    // otherwise the "noise" is a constant and useless for de-banding.
    expect(maxFarDiff).toBeGreaterThan(0.1)
  })
})

// ── 2. climate.noise knob is actually read ────────────────────────────

describe('P0-1 realism.climate.noise is read', () => {
  it('temperature differs between noise=0 and noise=0.6 at the same seed', () => {
    const W = 200, H = 200
    const grid0 = makeFlatGrid(8, W, H)
    const grid1 = makeFlatGrid(8, W, H)
    const wind = zeroWind(grid0.length)

    calculateTemperature(grid0, W, H, wind, [], 0, { climate: { noise: 0 } })
    calculateTemperature(grid1, W, H, wind, [], 0, { climate: { noise: 0.6 } })

    let diffs = 0
    for (let i = 0; i < grid0.length; i++) {
      if (grid0.temp[i] !== grid1.temp[i]) diffs++
    }
    // At least some cells must differ — proves the knob is wired.
    expect(diffs).toBeGreaterThan(0)
  })

  it('precipitation differs between noise=0 and noise=0.6 at the same seed', () => {
    const W = 200, H = 200
    const grid0 = makeFlatGrid(8, W, H)
    const grid1 = makeFlatGrid(8, W, H)
    const wind = zeroWind(grid0.length)
    // Deterministic rng so the only varying input is the noise knob.
    const rng0 = seedRandom('debanded-precip')
    const rng1 = seedRandom('debanded-precip')

    calculatePrecipitation(grid0, W, H, wind, 1.0, rng0, { climate: { noise: 0 } })
    calculatePrecipitation(grid1, W, H, wind, 1.0, rng1, { climate: { noise: 0.6 } })

    let diffs = 0
    for (let i = 0; i < grid0.length; i++) {
      if (grid0.prec[i] !== grid1.prec[i]) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('noise=0 reproduces the legacy purely-latitudinal behavior (no perturbation)', () => {
    // With noise=0 the noise branch is skipped; temp depends only on
    // latitude + altitude + coast. Two cells at the same latitude (same row)
    // should have identical base temperature (before coastal/altitude effects).
    const W = 200, H = 200
    const grid = makeFlatGrid(8, W, H)
    const wind = zeroWind(grid.length)
    calculateTemperature(grid, W, H, wind, [], 0, { climate: { noise: 0 } })
    // Row 3 (mid-latitude), columns 2 and 5: same latitude, flat land → same temp.
    const a = 3 * 8 + 2
    const b = 3 * 8 + 5
    expect(grid.temp[a]).toBe(grid.temp[b])
  })
})

// ── 3. shape.polarMaskFloor knob is actually read ─────────────────────

describe('P0-2 realism.shape.polarMaskFloor is read', () => {
  it('changing polarMaskFloor changes the heightmap near the poles', () => {
    const W = 200, H = 200
    const plates = [{ i: 0, center: { x: 100, y: 100 }, type: 'continental', direction: 0, speed: 0.5, oceanic: false, cells: 0 }]
    const boundaries = []
    const seed = 'debanded-polar'

    const grid0 = makeFlatGrid(8, W, H)
    const grid1 = makeFlatGrid(8, W, H)

    generateHeightmap(grid0, W, H, seedRandom(seed + ':main'), 0.45, plates, boundaries, 1, { shape: { polarMaskFloor: 0.1 } }, undefined, seed)
    generateHeightmap(grid1, W, H, seedRandom(seed + ':main'), 0.45, plates, boundaries, 1, { shape: { polarMaskFloor: 0.9 } }, undefined, seed)

    // Look at the top row (most polar); different floor should give different heights.
    let polarDiffs = 0
    for (let c = 0; c < 8; c++) {
      const i = c // row 0
      if (grid0.h[i] !== grid1.h[i]) polarDiffs++
    }
    expect(polarDiffs).toBeGreaterThan(0)
  })
})

// ── 4. shape.latitudeShaping knob is actually read ────────────────────

describe('P0-4 realism.shape.latitudeShaping is read', () => {
  it('adjustSeaLevelTemplateAware honors latitudeShaping on polar transition cells', () => {
    // Three rows on a tall canvas (H inferred from max y = 1000):
    //   row 0: y=50   (yFrac≈0.05, deep polar → polarFactor≈0.44, heavy penalty)
    //   row 1: y=500  (yFrac=0.5,  equator → polarFactor=1.0,    NO penalty)
    //   row 2: y=1000 (yFrac=1.0,  far edge → polarFactor=0,     heavy penalty)
    // Row 2 cells are kept OUT of the transition band (h=50) so they don't
    // compete; only rows 0 and 1 are flip candidates.
    //
    // Polar cells (row 0) are placed CLOSER to SEA_LEVEL (h=21, |h-20|=1) than
    // equatorial cells (row 1, h=24, |h-20|=4). transitionFlip ranks by
    //   cost = |h-20| + bias*gain + polarPenalty*scale.
    //  - shaping=0 (scale=1): polar penalty (~100) dwarfs the 3-point height
    //    advantage → equatorial cells are cheaper → they flip first.
    //  - shaping=1 (scale=0): no polar penalty → the 3-point height advantage
    //    wins → polar cells flip first.
    // A target that flips exactly one row's worth of cells therefore picks a
    // DIFFERENT row depending on shaping → heightmaps differ.
    const rows = 3
    const cols = 8
    const total = rows * cols
    const W = 200
    const cellW = W / cols
    const rowY = [50, 500, 1000]
    const p = new Float64Array(total * 2)
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      p[i * 2] = (c + 0.5) * cellW
      p[i * 2 + 1] = rowY[r]
    }
    const cAdj = []
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / cols)
      const col = i % cols
      const nb = []
      if (r > 0) nb.push(i - cols)
      if (r < rows - 1) nb.push(i + cols)
      if (col > 0) nb.push(i - 1)
      if (col < cols - 1) nb.push(i + 1)
      cAdj.push(nb)
    }
    function makeGrid() {
      const g = {
        length: total, p, c: cAdj,
        v: Array.from({ length: total }, () => []),
        b: new Uint8Array(total),
        h: new Uint8Array(total),
        t: new Int8Array(total), f: new Uint16Array(total),
        temp: new Int8Array(total), prec: new Uint8Array(total),
        biome: new Uint8Array(total), r: new Uint16Array(total),
        fl: new Float32Array(total), s: new Float32Array(total),
        pop: new Float32Array(total), culture: new Uint16Array(total),
        state: new Uint16Array(total), burg: new Uint16Array(total),
        haven: new Uint16Array(total), harbor: new Uint8Array(total),
      }
      for (let i = 0; i < total; i++) {
        const r = Math.floor(i / cols)
        // row 0 polar transition (h=21), row 1 equator transition (h=24),
        // row 2 far-edge non-candidate (h=50, above HI=32).
        g.h[i] = r === 0 ? 21 : r === 1 ? 24 : 50
      }
      return g
    }
    const grid0 = makeGrid()
    const grid1 = makeGrid()
    // Flip ~25% of cells (6 of 24). shaping=0 → equatorial (row 1) cells flip;
    // shaping=1 → polar (row 0) cells flip. Different rows → heightmaps differ.
    adjustSeaLevelTemplateAware(grid0, 0.75, undefined, undefined, 0)
    adjustSeaLevelTemplateAware(grid1, 0.75, undefined, undefined, 1)

    let diffs = 0
    for (let i = 0; i < total; i++) {
      if (grid0.h[i] !== grid1.h[i]) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })
})
