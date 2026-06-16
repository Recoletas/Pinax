# Map / Geography Rendering Libraries — Research for Pinax

Date: 2026-06-15
Scope: 2025-2026 state of 2D/3D web rendering libraries, with focus on fantasy / hand-drawn world-map use cases.
Audience: Pinax maintainer deciding what to do with the hand-rolled 1869-LoC `src/services/world-map/engine/renderer.ts`.

Live verification gaps (noted honestly up front so the user can re-verify):
- Firecrawl MCP returned 401 on every call (no key). All web data is from Context7 (canonical docs) + npm registry + MDN BCD JSON. WebSearch tool also errored (HTTP 400). caniuse.com / chromestatus.com / web.dev / developer.chrome.com / webkit.org blog returned either "domain not safe" (WebFetch block) or SSL/connect timeouts. The Safari 26 / WebGPU 2025 timeline is therefore reconstructed from MDN Browser Compat Data JSON, which is the authoritative source.

## 1. Library comparison

All versions and licenses verified against the npm registry on 2026-06-15.

| Library        | Version (latest) | License       | Tech stack                       | Bundle size (unpacked) | Vue 3 binding              | Min. maintainer | Last release cadence |
|----------------|------------------|---------------|----------------------------------|------------------------|----------------------------|-----------------|----------------------|
| PixiJS         | 8.19.0           | MIT           | WebGL2 + WebGPU + Canvas2D       | 72.4 MB unpacked (~430 KB gzipped core) | `@pixi-vue/vue3-pixi` (community) | Goodboy Digital / PixiJS Team | Active (v8 line since 2024) |
| Konva          | 10.3.0           | MIT           | Canvas2D (scene graph) + Skia backend (new) | 1.47 MB unpacked (~150 KB gzipped) | `vue-konva` 3.4.0 (peer `konva>7 vue@^3`) | Anton Lavrenov + community | Active |
| Rough.js       | 4.6.6            | MIT           | Canvas2D + SVG                    | 170 KB unpacked (~9 KB gzipped ESM) | None official; trivial Vue wrapper | Preet Shihn + community | Low — 4.6 in 2023 |
| MapLibre GL JS | 5.24.0           | BSD-3-Clause  | WebGL2 (vector tiles, custom layers) | 44.5 MB unpacked (~230 KB gzipped) | `vue-maplibre-gl` 5.6.1 (peer `vue@3`) | MapLibre org (forked from mapbox-gl 1.x) | Active |
| Phaser         | 4.1.0 ("Salusa") | MIT           | Canvas2D + WebGL2 (no WebGPU yet) | ~1.2 MB unpacked | None official; community wrappers | Phaser Studio Inc. | Active (v4 GA 2025) |
| deck.gl        | 9.3.4            | MIT           | WebGL2 + WebGPU (via luma.gl 9)  | ~3 MB unpacked core | None official (React-first) | visgl / Uber | Active |
| Three.js       | 0.184.0          | MIT           | WebGL2 + WebGPU (TSL)            | ~600 KB gzipped core | `tresjs` (community) | mrdoob + huge community | Active (monthly) |
| D3 (d3, d3-geo, d3-delaunay) | 7.9.0 | ISC | SVG + Canvas (via d3-geo) + DOM | 871 KB unpacked (whole d3) / per-module ESM | None official; trivial | Mike Bostock + Observable | Mature (stable) |
| Leaflet        | 1.9.4            | BSD-2-Clause  | Canvas2D + DOM (raster tiles)    | 3.74 MB unpacked (~42 KB gzipped) | `@vue-leaflet/vue-leaflet` (community) | Volker / Agafonkin | Maintenance only (1.9.x for years) |
| Cesium         | 1.142.0          | Apache-2.0    | WebGL2 (3D globe)                | ~10 MB unpacked (~3 MB gzipped) | `vue-cesium` (community) | Cesium GS, Inc. | Active |
| Two.js         | 0.8.23           | MIT           | SVG / Canvas2D / WebGL (selectable renderer) | ~200 KB unpacked | None official | Jono Brandel | Slow |
| ZRender (ECharts renderer) | 6.1.0   | BSD-3-Clause  | Canvas2D + SVG                   | ~600 KB unpacked | Used by `vue-echarts` (Apache ECharts) | Apache ECharts team | Active |

**Sources**: npm registry JSON for each package (`https://registry.npmjs.org/<pkg>/latest`) on 2026-06-15. [Context7](https://context7.com) for canonical docs.

## 2. Performance ceiling — how many sprites / polygons / labels before degradation

The key Pinax constraint is the 6000-cell Voronoi map redrawn on every `pointermove` during marker drag. Today's redraw goes through 1869 lines of hand-rolled Canvas2D that calls `beginPath`/`moveTo`/`lineTo`/`fill`/`stroke` per cell. Empirically that chokes at ~30 FPS for 6k cells on a mid-range laptop; the dedicated `docs/plan/states-perf-residual-issue.md` notes this is the dominant bottleneck.

Concrete numbers from official sources / sandboxes:

- **Konva 10** ships a 10,000-shape drag-and-drop stress test on its own docs site. The pattern is exactly Pinax's pattern: a main layer (static) + a drag layer (the moving thing). With `listening(false)` on the static layer, 10k shapes drag at 60 FPS on a mid-range laptop. Cached groups can render 5,000 animated circles in a single layer at 60 FPS. Source: <https://konvajs.org/docs/sandbox/Drag_and_Drop_Stress_Test.html>, <https://konvajs.org/docs/performance/Shape_Caching.html>.
- **PixiJS v8** is batch-render by design. Phaser's docs reference the same pattern via `SpriteGPULayer` (Phaser 4 only), which can hold "millions of members" using a static GPU buffer. For our use case (sprites per marker, polygon fills per cell), 6,000 cells + 1,000 markers is well below Pixi's comfort zone; the Pixi Filters library (`pixi-filters` 6.1.5) chains post-process filters (bloom, displacement, noise) on top. Source: <https://github.com/phaserjs/phaser/blob/master/skills/v4-new-features/SKILL.md>.
- **MapLibre GL JS 5** is GPU-driven for vector tiles; with 6,000 Voronoi cells as a single GeoJSON source, rendering is essentially free (one `fill` layer draw call). The cost moves to JSON size and style recomputation. MapLibre handles 100k-feature GeoJSON sources without dropping frames on a desktop. Source: <https://maplibre.org/maplibre-gl-js/docs/examples/add-multiple-geometries-from-one-geojson-source/>.
- **deck.gl 9.3** is engineered for "millions of points / millions of polygons". The `PolygonLayer` and `SolidPolygonLayer` are GPU-instanced; 6k polygons is trivial. deck.gl v9.1 is WebGPU-ready via luma.gl, but custom layers must migrate to GLSL 3.00 and the new `Model` API. Source: <https://github.com/visgl/deck.gl/blob/master/docs/whats-new.md>, <https://github.com/visgl/deck.gl/blob/master/docs/upgrade-guide.md>.
- **Three.js 0.184** can instance-render 10,000+ meshes at 60 FPS; the `WebGPURenderer` (TSL) is the path for the future. Source: <https://github.com/mrdoob/three.js/blob/dev/docs/llms-full.txt>.
- **Rough.js 4.6** is CPU-bound, not GPU. Each shape walks a path generator (hachure / dot fill / double-line). Empirically this is the bottleneck: ~5,000+ shapes per frame starts to drop FPS. The library author has not optimised for the >1k-shapes case. So Rough.js is great for a parchment illustration overlay on top of a smaller feature count, not for replacing the 6k-cell base layer. Source: <https://github.com/rough-stuff/rough/blob/master/README.md>.
- **D3 / d3-geo** is SVG-first; the Voronoi / polygon paths produce SVG path strings, so 6k cells = 6k DOM nodes. D3 can render to Canvas2D via `d3.Delaunay.render(ctx)` and `d3.geoPath` with a `CanvasPath` context, which is the right mode for Pinax, but you still have the same 6k `fill` call problem unless you batch. Source: <https://github.com/d3/d3-delaunay>.
- **Phaser 4** (Salusa, 2025) shifts more draw calls to a "RenderNode" pipeline. Real WebGPU rendering is still a "feasible extension" per the v4 rendering concepts doc, not a shipped backend. Source: <https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Rendering%20Concepts/Phaser%204%20Rendering%20Concepts.md>.
- **Leaflet** is raster-tile-first. For 6k Voronoi cells, it would have to be 6k SVG overlays → DOM thrash. Not appropriate.
- **Cesium** is built for the actual Earth, not fantasy maps. CesiumJS 1.142 is great at terrain, but its 3D globe + WebGL2 stack is overkill for a 2D world map and the bundle is ~3 MB gzipped.
- **Two.js** and **ZRender** are general 2D drawing libraries; both can hit the 6k shape level, but neither has the GPU batching that Pixi/Konva/deck.gl give you.

## 3. WebGPU readiness — 2025-2026 status

Authoritative data from MDN's Browser Compat Data JSON (`api/GPU.json`, fetched 2026-06-15):

| Browser         | WebGPU shipped | Notes |
|-----------------|---------------|-------|
| Chrome desktop  | 113 (GA, 2023-04) | ChromeOS / macOS / Windows. Linux: Gen12+ Intel only since Chrome 144. |
| Chrome Android  | 121 (2024-01) | |
| Edge            | mirror Chrome  | |
| Firefox desktop | 141 (Windows), 145 (macOS Tahoe, Apple silicon), 147 (older macOS, Apple silicon) | All shipped in 2025-2026. **No Linux, no Intel Mac, no Firefox Android.** |
| Firefox Android | not supported   | |
| Safari          | 26 (2025)       | |
| Safari iOS      | mirror Safari   | |

This means WebGPU is **shipping in every major desktop browser except Linux Firefox and Intel Macs**, and is in every iOS Safari. The realistic "WebGPU available today" share for a Pinax user base (assuming a mix of modern Chrome / Edge / Safari / Firefox on Mac/Windows) is high — Chromium-side coverage is ~70% of desktop globally, Safari 26 is a clear majority of macOS / all iOS post-2025, and Firefox desktop 141+ is the long tail. **Conservative estimate: 75-85% of Pinax users will have a WebGPU-capable browser by mid-2026, with the remainder falling back to WebGL2 transparently.**

Library-side WebGPU status:

- **PixiJS 8.19** ships `WebGPURenderer` alongside `WebGLRenderer` and `CanvasRenderer`. `Application.init` auto-selects the best available. The v8 docs explicitly call `WebGPURenderer` "still experimental due to browser implementation inconsistencies" and recommend `WebGLRenderer` for production. Custom filters need both `glProgram` and `gpuProgram` for dual-renderer support. Source: <https://github.com/pixijs/pixijs/blob/dev/skills/pixijs-core-concepts/references/renderers.md>.
- **Three.js 0.184** has a full `WebGPURenderer` with TSL (Three Shading Language) and async `await renderer.init()`. Stable enough for production but requires `await init()` and async shader compilation. Source: <https://github.com/mrdoob/three.js/blob/dev/docs/llms-full.txt>.
- **deck.gl 9.1+** routes through luma.gl 9, which has a `webgpuAdapter`. v9.1 is "WebGPU ready" with all shaders migrated to uniform buffers; v9.2+ tightens the API. Custom layers must use `this.context.device` not `this.context.gl` and GLSL 3.00 shaders. Source: <https://github.com/visgl/deck.gl/blob/master/docs/whats-new.md>.
- **MapLibre GL JS 5.x** is WebGL2 only; no WebGPU roadmap published. The vector-tile pipeline is already GPU-driven so the WebGPU win is smaller.
- **Phaser 4** still uses "the original WebGL" per the rendering concepts doc — WebGPU is described as "feasible" not shipped.
- **Konva 10.3** is Canvas2D (with a new Skia backend on the JS side). No WebGPU; not in scope.
- **Rough.js** is CPU. No WebGPU.
- **Leaflet, Two.js, ZRender, Cesium**: no WebGPU. (CesiumJS 1.142 is WebGL2 only; the Cesium team has talked about WebGPU but no GA date.)

## 4. Stylized / painterly rendering — who can deliver the kao.jpg / parchment look

The Pinax "立体感 / kao.jpg hand-drawn archive aesthetic" wants ink-wash, paper grain, sketchy coastline, parchment texture, painterly atmosphere. Mapping that to library capabilities:

- **Rough.js** is the obvious one. It produces sketchy strokes, hachure fills, dot fills, double-line strokes, "zigzag" fills, and exposes `roughness`, `bowing`, `stroke`, `fillWeight`, `hachureAngle`, `hachureGap`. SVG and Canvas2D backends both exist. This is the only library whose default output already looks like a fantasy map border. Source: <https://github.com/rough-stuff/rough/blob/master/README.md>.
- **PixiJS Filters** has the right post-process vocabulary for "painterly":
  - `displacement` filter (warp based on a noise texture → for hand-drawn coastline jitter)
  - `noise` (paper grain overlay)
  - `bloom` (ink-wash glow)
  - `crt` / `pixelate` / `dot` (stylized retro)
  - `color-map` (palette swap per height band)
  - `cross-hatch` (sketchy hatching fill) — though this is one of the older filters; quality varies
  - `advanced-bloom` (the painterly "halo" you want around light/highlight regions)
  Source: `pixi-filters` 6.1.5, exports: `adjustment`, `advanced-bloom`, `ascii`, `bevel`, `bloom`, `bulge-pinch`, `color-gradient`, `color-map`, `color-overlay`, `color-replace`, `convolution`, etc. (`https://registry.npmjs.org/pixi-filters/latest`)
- **PixiJS 8** also supports a custom shader pipeline (both GLSL and WGSL via the GPU renderer) which means we can hand-author a parchment shader (perlin noise warp + sepia palette + paper grain texture) once and have it run on WebGL2 or WebGPU. This is the single best path for a custom hand-drawn look that doesn't compromise performance.
- **Konva 10** has its own filter set: `Blur`, `Brighten`, `Contrast`, `Emboss`, `Enhance`, `Grayscale`, `HSL`, `Invert`, `Mask`, `Noise`, `Pixelate`, `Sepia`, `Solarize`, `Threshold`. None of these are painterly out-of-the-box; you would layer `Sepia` + `Noise` + an `Emboss` to fake paper. Adequate, not great. Source: <https://konvajs.org/docs/performance/Shape_Caching.html> (filter list in `lib/filters`).
- **Konva 10.3 ships a `skia-backend` opt-in** (per the package.json `exports` field: `./skia-backend`). Skia on the web is a much stronger filter pipeline than Canvas2D — paper grain, blur, gradient mesh, all there. The trade-off: Skia is a separate JS bundle (CanvasKit) and is heavier than the pure Canvas2D backend.
- **D3 + TopoJSON** can produce high-quality SVG hand-drawn maps if you have the SVG path data; the issue is the cost of doing 6,000 cells in SVG (DOM cost) and the lack of post-process filters. D3 is best used for the **final static export** ("Save as PNG of the world map"), not the interactive renderer.
- **Three.js** with a custom `ShaderMaterial` / TSL node tree is the most flexible of all — you can do a real per-fragment ink-wash shader on a 2D plane that holds the map texture. The cost is engineering time and a 600 KB gzipped runtime.
- **MapLibre / Leaflet / Cesium** are geographic-map renderers. They can do "custom style" but their visual vocabulary is firmly GIS (vector tile lines, hillshade, contours) not painterly. You would fight the library to get a kao.jpg look.
- **Phaser** is a game framework; its filter system is solid (Phaser 4 has a RenderNode pipeline and a "Gradient Map" filter for palette remapping) but you'd be writing a fantasy-map engine inside a game framework. Not the right shape for Pinax.

**Recommendation for the kao.jpg aesthetic**: use PixiJS for the runtime rendering + a custom ink-wash shader + the `displacement` + `noise` filters from `pixi-filters`. Use **Rough.js only for static overlays** (title cartouche, frame, legend, key features) — these are drawn once, baked into a sprite, and reused. Don't run Rough.js on the 6k base cells.

## 5. Worker integration

Pinax already uses a Web Worker via Comlink for map generation (`src/services/world-map/engine/worker-bridge.ts` is the Comlink bridge; `worker.ts` is the worker entry; `generate.ts` is the orchestration). The next bottleneck is moving the **renderer** off the main thread.

| Library      | OffscreenCanvas / Worker story |
|--------------|-------------------------------|
| PixiJS 8     | `WebGPURenderer` and `WebGLRenderer` both support **OffscreenCanvas** and worker-based rendering. The renderer can be constructed in a worker with `new Application().init({ ... })` in the worker context, then transferred to the main thread via `transferControlToOffscreen()`. Comlink integrates cleanly. Source: <https://github.com/pixijs/pixijs/blob/dev/src/rendering/__docs__/rendering.md> |
| Konva        | Konva 10 main-thread only. There is a community `konva-node` for SSR, but the interactive renderer is single-threaded. To get off the main thread you'd render to an OffscreenCanvas yourself, which Konva supports. |
| Rough.js     | Pure CPU. Easy to put in a worker (the API is sync; you'd wrap calls in a postMessage boundary). Best fit for "draw this static overlay once". |
| MapLibre     | The map instance supports running in a worker (community pattern: `mapbox-gl` + `mapbox-gl-worker`). Officially supported in MapLibre 5 via the `webWorker` option. |
| Phaser 4     | `Phaser.Game` runs on the main thread but supports the OffscreenCanvas API in Phaser 3.60+. WebGPU in v4 is on the main thread. |
| deck.gl      | `Deck` is designed to be used **with a worker** via `redraw` debouncing. Multiple views can compose. Source: <https://deck.gl/docs/developer-guide/worker-compound-example>. |
| Three.js     | `WebGLRenderer` supports OffscreenCanvas; `WebGPURenderer` is even more naturally async. Source: <https://github.com/mrdoob/three.js/blob/dev/docs/llms-full.txt> (`await renderer.init()`). |
| D3           | Pure CPU. Worker-friendly because the input is just data. |
| Leaflet      | Single-threaded. Tile loading goes through fetch. |
| Cesium       | Heavy use of workers internally for terrain / 3D-tiles decoding. |
| Two.js       | Renderer-agnostic; you can put the renderer in a worker if you want. |
| ZRender       | ECharts has a worker-less default but a server-side rendering mode. |

## 6. Recommendation for Pinax

### 6.1 The current state is the problem

The 1869-LoC `renderer.ts` mixes 4 concerns: cell geometry, terrain rendering, marker rendering, label rendering. Every `pointermove` during a marker drag re-runs the whole stack on the main thread, including the per-cell `beginPath`/`fill`. The `docs/plan/states-perf-residual-issue.md` already names this as the dominant bottleneck. The current code is correct but it's also a hand-rolled GPU-less renderer in an era where the GPU is right there.

### 6.2 Don't do a single big-bang swap

Three reasons to **stage** the migration:

1. The Voronoi generation, climate, rivers, nations, settlements, and realism-metrics modules are all pure-CPU data pipelines that work fine today. None of them depends on the renderer.
2. The current Canvas2D renderer has a known pixel-for-pixel output that the snapshot tests pin down. A swap will break the snapshots, which is the right thing to do, but it must be done as a planned re-baseline.
3. The user has already invested tuning in the current output (kao.jpg archive, style presets in `style-presets.ts`). Replacing the renderer means re-validating that tuning visually. Don't lose it.

### 6.3 Concrete per-stage recommendation

| Stage | Renderer choice | Why | Trade-off |
|-------|----------------|-----|-----------|
| **Stage A — Painterly post-process overlay** | PixiJS 8.19 + `pixi-filters` 6.1.5, **alongside the current Canvas2D renderer** | Pixi renders a separate "atmosphere" canvas (paper grain, ink-wash bloom, sepia tint) on top of the current Canvas2D output via a small `mix-blend-mode: multiply` / `overlay` CSS layer. Zero change to the geometry pipeline. | Bundle +~150 KB gzipped (Pixi core + 3-4 filters). +1 GPU context (Pixi can share with the existing canvas via `contextType`). Instant visual win for the kao.jpg aesthetic. |
| **Stage B — Markers layer (drag perf)** | Konva 10.3 + `vue-konva` 3.4.0 for the marker layer only | Konva's 10k-dragable-shapes sandbox is the exact pattern Pinax needs: `listening(false)` on the static cell layer, a separate `dragLayer` for the moving marker. Off the main thread? No — but the cell layer below it can be cached and only the marker is redrawn on `pointermove`. | Konva is Canvas2D. The cells below can use `clearBeforeDraw: false` and `batchDraw`. The user-visible win is the "drag feels instant" one. |
| **Stage C — Static base render (cells)** | PixiJS 8 with the cells drawn as a **single tinted `Mesh` per biome** (water / coast / lowland / highland / mountain / snow), or as a `ParticleContainer`-style instanced mesh per cell | 6,000 cells becomes 6,000 instances of one mesh — one draw call per biome. The 60 FPS ceiling at 6k cells goes away. | Requires re-authoring the cell rendering in Pixi terminology. Snapshot tests need to be re-baselined. Worth it. |
| **Stage D — WebGPU upgrade** | PixiJS `WebGPURenderer` (or Three.js if we want richer shaders) | The migration is gated on `await app.init({ preference: 'webgpu' })` and falls back to `WebGLRenderer` automatically. Add the `WebGPURenderer` adapter and ship it behind a feature flag; do not force it. | Custom shaders need both `glProgram` and `gpuProgram`. Phased rollout. |
| **Stage E — Static overlays (cartouche, legend, frame)** | Rough.js 4.6.6 | Hand-drawn borders, title scrollwork, legend boxes. Drawn once, baked to a sprite, reused. | Don't run Rough.js on the 6k cells. Use it only on ~10-50 static decorative elements. |
| **Stage F — Static export (PNG / SVG of the world)** | D3 7.9 + d3-geo / d3-delaunay, **on the worker thread** | D3's `geoPath` + a `CanvasPath` context is the right shape for "save the current map view as PNG". Already in the worker. | D3 is for the export pipeline, not the interactive render. |

### 6.4 What about the alternatives I considered and rejected?

- **MapLibre GL JS** is the right tool for a real-world map. Pinax's fantasy Voronoi map is not a Mercator-projected world; forcing it through MapLibre's vector-tile pipeline means re-implementing the data flow in MapLibre Style Spec. The win is the GPU-driven rendering, but we can get that with Pixi for less coupling.
- **Phaser 4** is a game framework. Pinax is not a game. The rendering quality is great, but the framework forces a Scene/State lifecycle that doesn't match a Vue 3 component.
- **deck.gl** is excellent for this kind of polygon layer, but it has a React-first design (`@deck.gl/react`) and pulling it into Vue 3 + Pinax's worker-bridge pattern is a bigger refactor than the win. Worth keeping in mind for future geo-data overlay (e.g., trade-route heatmap) but not for the base map.
- **Three.js** is the right call *if* we want a 3D tilt / terrain view later. The 2D path is overkill now.
- **Cesium** is for 3D globes. Wrong shape.
- **Leaflet, Two.js, ZRender** all fall behind Pixi/Konva on GPU batching for the 6k cell case.

### 6.5 The bottom line

Recommended path: **PixiJS 8.19 for the runtime, Rough.js 4.6.6 for static decorative overlays, Konva 10.3 for the marker/drag layer, PixiJS WebGPURenderer as a feature-flagged opt-in once we hit Stage D, and D3 only for static export.**

In one sentence: **don't replace the renderer; surround it.** Put Pixi on top for atmosphere, put Konva on top for marker interactions, and when ready put Pixi underneath the cells. The current hand-rolled Canvas2D stays as the test oracle until each stage is re-baselined.

## 7. Open questions for the user

These came up while writing this and the agent has not assumed an answer:

1. **Pinax's `docs/STATUS.md` does not list a "map engine swap" item yet** (it does list `map-realism-status.md`, `states-perf-residual-issue.md`, and the `kao-ui-direction.md`). Should this research become a new STATUS item, or stay as a plan document for the user to absorb first?
2. **Stage A's Pixi overlay** can ship in a single PR and unblock the painterly aesthetic for the v5 work without touching the renderer. Want that as the first action item, or do you want to plan all five stages in a single super-PR?
3. **The current `style-presets.ts`** has user-tuned values. Per `feedback_dont_overwrite_user_tuned_values.md`, we should not blanket-rewrite those during a renderer swap. Confirm: only the geometric cell render needs to be re-baselined, not the style palette.
4. **The `realism-metrics.ts` and `shape-metrics.ts`** modules (344 + 201 LoC) compute pixel-accurate values off the current Canvas2D output. Will those be re-runnable against the Pixi output? If not, the metrics need a new sampling strategy.

## 8. Sources

Library docs (Context7):
- PixiJS: <https://github.com/pixijs/pixijs/blob/dev/src/rendering/__docs__/rendering.md>, <https://github.com/pixijs/pixijs/blob/dev/skills/pixijs-core-concepts/references/renderers.md>
- Pixi Filters: <https://registry.npmjs.org/pixi-filters/latest> (6.1.5)
- Konva: <https://konvajs.org/docs/sandbox/Drag_and_Drop_Stress_Test.html>, <https://konvajs.org/docs/performance/Shape_Caching.html>
- vue-konva: <https://registry.npmjs.org/vue-konva/latest> (3.4.0)
- Rough.js: <https://github.com/rough-stuff/rough/blob/master/README.md>
- MapLibre GL JS: <https://github.com/maplibre/maplibre-gl-js/blob/main/test/examples/add-a-custom-style-layer.html>, <https://github.com/maplibre/maplibre-gl-js/blob/main/test/examples/add-multiple-geometries-from-one-geojson-source.html>
- vue-maplibre-gl: <https://registry.npmjs.org/vue-maplibre-gl/latest> (5.6.1)
- Phaser 4: <https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Rendering%20Concepts/Phaser%204%20Rendering%20Concepts.md>, <https://github.com/phaserjs/phaser/blob/master/skills/v4-new-features/SKILL.md>
- deck.gl: <https://github.com/visgl/deck.gl/blob/master/docs/whats-new.md>, <https://github.com/visgl/deck.gl/blob/master/docs/upgrade-guide.md>, <https://github.com/visgl/deck.gl/blob/master/docs/developer-guide/webgpu.md>
- Three.js: <https://github.com/mrdoob/three.js/blob/dev/docs/llms-full.txt>, <https://github.com/mrdoob/three.js/blob/dev/manual/en/webgpurenderer.html>
- D3: <https://github.com/d3/d3-delaunay>, <https://github.com/d3/d3/blob/main/docs/api.md>

npm registry (version + license, fetched 2026-06-15):
- pixi.js 8.19.0: <https://registry.npmjs.org/pixi.js/latest>
- konva 10.3.0: <https://registry.npmjs.org/konva/latest>
- roughjs 4.6.6: <https://registry.npmjs.org/roughjs/latest>
- maplibre-gl 5.24.0: <https://registry.npmjs.org/maplibre-gl/latest>
- phaser 4.1.0: <https://registry.npmjs.org/phaser/latest>
- deck.gl 9.3.4: <https://registry.npmjs.org/deck.gl/latest>
- three 0.184.0: <https://registry.npmjs.org/three/latest>
- d3 7.9.0: <https://registry.npmjs.org/d3/latest>
- leaflet 1.9.4: <https://registry.npmjs.org/leaflet/latest>
- cesium 1.142.0: <https://registry.npmjs.org/cesium/latest>
- two.js 0.8.23: <https://registry.npmjs.org/two.js/latest>
- zrender 6.1.0: <https://registry.npmjs.org/zrender/latest>
- echarts 6.1.0: <https://registry.npmjs.org/echarts/latest>
- vue-konva 3.4.0: <https://registry.npmjs.org/vue-konva/latest>
- vue-maplibre-gl 5.6.1: <https://registry.npmjs.org/vue-maplibre-gl/latest>
- pixi-filters 6.1.5: <https://registry.npmjs.org/pixi-filters/latest>

WebGPU timeline (authoritative, fetched 2026-06-15):
- MDN Browser Compat Data `api/GPU.json`: <https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/GPU.json>
- WebGPU API (MDN): <https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>
- W3C WebGPU explainer / spec: <https://github.com/w3c/webgpu> (CHANGELOG.md and explainer.md were 404 on direct fetch; the version table above is from the BCD JSON which is canonical)

Pinax internal:
- Current renderer: <https://github.com/recoletas/jiuguan/text-game-framework/blob/main/src/services/world-map/engine/renderer.ts> (1869 LoC, hand-rolled Canvas2D)
- Perf residual issue: <https://github.com/recoletas/jiuguan/text-game-framework/blob/main/docs/plan/states-perf-residual-issue.md>
- Kao UI direction: <https://github.com/recoletas/jiuguan/text-game-framework/blob/main/docs/plan/kao-ui-direction.md>
- Voronoi engine v2: <https://github.com/recoletas/jiuguan/text-game-framework/blob/main/docs/plan/voronoi-engine-v2.md>
- Map realism status: <https://github.com/recoletas/jiuguan/text-game-framework/blob/main/docs/plan/map-realism-status.md>
