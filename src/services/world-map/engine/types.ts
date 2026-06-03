/**
 * Voronoi 地图引擎 — 核心类型定义
 * 基于 TypedArray 实现高性能网格数据
 */

/** 性能分析元数据：随 worker 响应一起返回 */
export interface GenerationMeta {
  /** 各阶段耗时（毫秒） */
  timings: Array<{ stage: string; durationMs: number }>
  /** 整次生成的总耗时（毫秒） */
  totalMs: number
  /** 触发本次生成的 seed */
  seed: string
}

/** 网格单元格数据（并行数组，按 cellId 索引） */
export interface GridCells {
  /** 单元格数量 */
  length: number
  /** 每个单元格的坐标 [x, y] */
  p: Float64Array
  /** 每个单元格的邻居列表 */
  c: number[][]
  /** 每个单元格的顶点列表 */
  v: number[][]
  /** 是否为边界单元格 */
  b: Uint8Array
  /** 高度 0-100（0-19 水域，20+ 陆地） */
  h: Uint8Array
  /** 到海岸距离（正=陆地深度，负=水域深度） */
  t: Int8Array
  /** 所属地理特征 ID */
  f: Uint16Array
  /** 温度（°C） */
  temp: Int8Array
  /** 降水量 */
  prec: Uint8Array
  /** 生态群落 ID */
  biome: Uint8Array
  /** 河流 ID（0=无河流） */
  r: Uint16Array
  /** 水流量 */
  fl: Float32Array
  /** 适宜度评分 */
  s: Float32Array
  /** 人口 */
  pop: Float32Array
  /** 文化 ID */
  culture: Uint16Array
  /** 国家 ID */
  state: Uint16Array
  /** 城镇 ID（0=无城镇） */
  burg: Uint16Array
  /** 最近水域单元格（港口朝向） */
  haven: Uint16Array
  /** 相邻水域单元格数量 */
  harbor: Uint8Array
  /** 板块数据（plateId/boundaryDist/boundaryType/subduction/orogenyAge/volcanoArc 6 个并行数组） */
  tectonic?: TectonicData
  /** 火山类型（0=无 1=strato 2=shield） */
  volcano?: Uint8Array
  /** 河流 ID（0=无，>0=河流编号） */
  riverId?: Uint16Array
}

/** 顶点数据 */
export interface GridVertices {
  /** 顶点数量 */
  length: number
  /** 坐标 [x, y]（交替存储） */
  p: Float64Array
  /** 每个顶点的相邻顶点 */
  v: number[][]
  /** 每个顶点的相邻单元格（三角形的 3 个顶点） */
  c: number[][]
}

/** 地理特征（岛屿/湖泊/海洋） */
export interface Feature {
  i: number
  type: 'ocean' | 'sea' | 'lake' | 'island' | 'continent'
  cells: number
  /** 特征包含的单元格 */
  cellIds: number[]
  /** 海岸线单元格 */
  border: number[]
  /** 湖泊/海洋的平均高度 */
  height?: number
}

/** 河流 */
export interface River {
  i: number
  name: string
  /** 河流经过的单元格 */
  cells: number[]
  /** 渲染用的路径点 */
  points: [number, number][]
  /** 宽度（沿路径变化） */
  widths: number[]
  /** 入海口单元格 */
  mouth: number
  /** 源头单元格 */
  source: number
  /** 父河流（汇入的河流 ID） */
  parent?: number
  /** 河流长度（cells.length 派生；与 cells 数组保持同步） */
  length?: number
}

/** 城镇 */
export interface Burg {
  i: number
  name: string
  cell: number
  x: number
  y: number
  state: number
  /** 是否为首都 */
  capital: boolean
  /** 是否为港口 */
  port: boolean
  /** 人口 */
  population: number
}

/** 国家 */
export interface State {
  i: number
  name: string
  color: string
  /** 首都 burg ID */
  capital: number
  /** 扩张系数 */
  expansionism: number
  /** 包含的单元格数 */
  cells: number
  /** 领土面积 */
  area: number
  /** 总人口 */
  totalPopulation: number
}

/** 省份 */
export interface Province {
  i: number
  name: string
  color: string
  /** 所属国家 */
  state: number
  /** 省会城镇 burg ID */
  capital: number
  /** 包含的单元格数 */
  cells: number
}

/** 道路段 */
export interface Road {
  i: number
  name: string
  /** 道路类型 */
  type: 'major' | 'minor' | 'trade' | 'sea'
  /** 路径经过的单元格 */
  cells: number[]
  /** 渲染用的路径点 */
  points: [number, number][]
}

/** 文化 */
export interface Culture {
  i: number
  name: string
  color: string
  center: number
  type: 'generic' | 'nomadic' | 'highland' | 'lake' | 'naval' | 'river' | 'hunting'
  expansionism: number
}

/** 生态群落定义 */
export interface BiomeDef {
  id: number
  name: string
  color: string
  habitability: number
  moveCost: number
}

/** 构造板块 */
export interface Plate {
  i: number
  /** 板块中心单元格 */
  center: number
  /** 运动方向弧度（0=东，π/2=南） */
  direction: number
  /** 运动速度 0-1 */
  speed: number
  /** 是否为海洋板块 */
  oceanic: boolean
  /** 包含的单元格数 */
  cells: number
}

/** 板块边界段 */
export interface PlateBoundary {
  /** 边界类型 */
  type: 'convergent' | 'divergent' | 'transform'
  /** 涉及的两个板块 */
  plateA: number
  plateB: number
  /** 边界经过的单元格 */
  cellIds: number[]
  /** 俯冲侧 plate.i（仅 convergent + 洋-陆碰撞时有） */
  subductionSide?: number
}

/** 洋流段 */
export interface OceanCurrent {
  i: number
  /** 洋流类型 */
  type: 'warm' | 'cold'
  /** 路径点 */
  points: [number, number][]
  /** 强度 0-1 */
  strength: number
}

/** 风场数据（按单元格存储） */
export interface WindData {
  /** 风向 X 分量（正=东） */
  wx: Float32Array
  /** 风向 Y 分量（正=南） */
  wy: Float32Array
  /** 风速 0-1 */
  ws: Float32Array
}

/** 完整的地图数据 */
export interface VoronoiMapData {
  /** 画布宽高 */
  width: number
  height: number
  /** 随机种子 */
  seed: string
  /** 单元格数据 */
  cells: GridCells
  /** 顶点数据 */
  vertices: GridVertices
  /** 地理特征 */
  features: Feature[]
  /** 河流 */
  rivers: River[]
  /** 城镇 */
  burgs: Burg[]
  /** 国家 */
  states: State[]
  /** 文化 */
  cultures: Culture[]
  /** 省份 */
  provinces: Province[]
  /** 道路 */
  roads: Road[]
  /** 板块 */
  plates: Plate[]
  /** 板块边界 */
  boundaries: PlateBoundary[]
  /** 洋流 */
  oceanCurrents: OceanCurrent[]
  /** 风场数据 */
  wind: WindData
  /** 地图名称 */
  name: string
}

/** 高度图模板 */
export type HeightmapTemplate =
  | 'continents'    // 多大陆（默认）
  | 'pangea'        // 盘古大陆（单块大陆）
  | 'archipelago'   // 群岛
  | 'volcano'       // 火山岛
  | 'isthmus'       // 地峡（两块陆地窄桥相连）
  | 'peninsula'     // 半岛
  | 'mediterranean' // 内海（大陆包围海域）
  | 'atoll'         // 环礁
  | 'shattered'     // 碎裂大陆
  | 'highland'      // 高原

/** 文化命名风格 */
export type NamingStyle =
  | 'chinese'       // 中文古风（默认）
  | 'japanese'      // 日式和风
  | 'european'      // 欧洲中世纪
  | 'arabic'        // 阿拉伯/沙漠
  | 'highFantasy'   // 高魔奇幻（精灵/矮人风）
  | 'darkFantasy'   // 暗黑奇幻

/** 渲染风格预设 */
export type MapStylePreset =
  | 'topographic'   // 等高线地形图（默认）
  | 'parchment'     // 羊皮纸古典
  | 'watercolor'    // 水彩手绘
  | 'dark'          // 暗黑风格
  | 'clean'         // 简洁现代
  | 'atlas'         // 地图集风格

/** 图层显隐配置 */
export interface LayerVisibility {
  terrain?: boolean    // 地形着色
  coastlines?: boolean // 海岸线
  continents?: boolean // 大陆轮廓
  rivers?: boolean     // 河流
  borders?: boolean    // 国界线
  provinces?: boolean  // 省界线
  roads?: boolean      // 道路
  stateLabels?: boolean // 国家标签
  burgIcons?: boolean  // 城镇图标
  burgLabels?: boolean // 城镇标签
  scaleBar?: boolean   // 比例尺
  vignette?: boolean   // 边缘暗角
  oceanCurrents?: boolean  // 洋流
  wind?: boolean           // 风场
  tectonics?: boolean      // 板块边界
}

/** 自定义生态群落配色（可选覆盖默认） */
export interface BiomeOverride {
  id: number
  color?: string
  habitability?: number
  moveCost?: number
}

/** 板块数据结构（cells 上的并行数组） */
export interface TectonicData {
  /** 板块编号（Voronoi 划分结果） */
  plateId: Int16Array
  /** 到最近板块边界的 cell 数（255 = 内陆） */
  boundaryDist: Uint8Array
  /** 边界类型：0=无 1=convergent 2=divergent 3=transform */
  boundaryType: Uint8Array
  /** 0=无 1=洋→陆俯冲带邻接 */
  subduction: Uint8Array
  /** 0=新 255=老（山影色调） */
  orogenyAge: Uint8Array
  /** 0=无 1=火山弧位置 */
  volcanoArc: Uint8Array
}

/** 火山类型 */
export const VOLCANO_NONE = 0
export const VOLCANO_STRATO = 1
export const VOLCANO_SHIELD = 2

/** 现实化配置（控制板块/海岸/水系/渲染的视觉强度） */
export interface MapRealism {
  /** 总开关 */
  level: 'classic' | 'azgaar' | 'geologic'
  tectonics?: {
    plateCount?: number
    rangeWidth?: number      // 山带宽度 1-8
    riftDepth?: number       // 裂谷深度
    volcanoDensity?: number  // 0-1
  }
  rivers?: {
    style?: 'straight' | 'meandering' | 'deltaic'
    meanderAmplitude?: number  // 0-5
  }
  coast?: {
    noiseScale?: number       // 默认 0.012
    noiseAmplitude?: number   // 默认 6
    headlandFreq?: number     // 0-1
  }
  political?: {
    borderStyle?: 'simple' | 'azgaar'
    borderlandWidth?: number  // 0-3
    factionTexture?: boolean
  }
}

/** 世界书强约束（可选） */
export interface MapConstraints {
  mountains?: Array<{
    name: string
    cells: number[]
    type: 'range' | 'volcano' | 'ridge'
  }>
  rivers?: Array<{
    name: string
    sourceCell: number
    mouthHint?: string
  }>
  stateSeeds?: Array<{
    name: string
    centerCell: number
    radius?: number
    color?: string
  }>
}

/** 地图生成配置（可由 AI 控制） */
export interface MapGenConfig {
  /** 画布宽度 */
  width?: number
  /** 画布高度 */
  height?: number
  /** 随机种子 */
  seed?: string
  /** 网格点数量（越大越精细，默认 10000） */
  pointCount?: number
  /** 海陆比例 0-1（默认 0.5） */
  landRatio?: number
  /** 大陆数量 1-5 */
  continentCount?: number
  /** 国家数量 */
  stateCount?: number
  /** 城市密度 0-1 */
  burgDensity?: number
  /** 温度偏移（正=更热，负=更冷） */
  temperatureShift?: number
  /** 降水量倍率 */
  precipitationFactor?: number

  // ── 新增配置项 ──

  /** 高度图模板（默认 continents） */
  heightmapTemplate?: HeightmapTemplate
  /** 文化命名风格（默认 chinese） */
  namingStyle?: NamingStyle
  /** 渲染风格预设（默认 topographic） */
  stylePreset?: MapStylePreset
  /** 图层显隐配置 */
  layers?: LayerVisibility
  /** 板块数量 2-12（默认 6） */
  plateCount?: number
  /** 板块运动速率倍率（默认 1） */
  plateSpeedFactor?: number
  /** 自定义生态群落配色 */
  biomeOverrides?: BiomeOverride[]
  /** 是否生成省份（默认 true） */
  generateProvinces?: boolean
  /** 是否生成道路（默认 true） */
  generateRoads?: boolean

  // ── AI 指定的名称（可选） ──
  /** 地图名称 */
  mapName?: string
  /** 国家名称列表（按重要度排列） */
  stateNames?: string[]
  /** 城市名称列表（按重要度排列） */
  burgNames?: string[]
  /** 河流名称列表 */
  riverNames?: string[]
  /** 现实化配置（默认 { level: 'azgaar' }） */
  realism?: MapRealism
  /** 世界书强约束（可选） */
  constraints?: MapConstraints
}
