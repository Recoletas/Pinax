/**
 * 地理/世界地图 — 集中式类型与标签定义
 *
 * 这些枚举值与 src/services/world-map/engine/types.ts 中的 TS 联合类型
 * （MarkerType / HeightmapTemplate / NamingStyle / LayerVisibility）保持同步。
 * 在 JS/TS 边界处手工维护一致性；如需新增枚举，请同时更新两边。
 */

/** 地图标记点类型（对应 MarkerType 联合类型） */
export const MARKER_TYPES = [
  { value: 'capital',    label: '首都/皇城' },
  { value: 'city',       label: '城市' },
  { value: 'town',       label: '城镇' },
  { value: 'village',    label: '村庄' },
  { value: 'sect',       label: '宗门/门派' },
  { value: 'fortress',   label: '要塞/城堡' },
  { value: 'port',       label: '港口' },
  { value: 'academy',    label: '学院' },
  { value: 'ruin',       label: '废墟' },
  { value: 'dungeon',    label: '地下城' },
  { value: 'oasis',      label: '绿洲' },
  { value: 'bridge',     label: '桥梁' },
  { value: 'lighthouse', label: '灯塔' },
  { value: 'mine',       label: '矿山' },
  { value: 'shrine',     label: '神殿/祠堂' },
  { value: 'custom',     label: '自定义' },
]

/** 地点类型（树状图/列表用） */
export const LOCATION_TYPES = [
  { value: 'continent',  label: '大陆',     color: '#f59e0b' },
  { value: 'country',    label: '国家',     color: '#6366f1' },
  { value: 'city',       label: '城市',     color: '#22c55e' },
  { value: 'sect',       label: '门派驻地', color: '#ec4899' },
  { value: 'secret',     label: '秘境',     color: '#a78bfa' },
  { value: 'ruin',       label: '遗迹',     color: '#94a3b8' },
  { value: 'battlefield',label: '战场',     color: '#ef4444' },
  { value: 'nature',     label: '自然景观', color: '#14b8a6' },
  { value: 'building',   label: '建筑',     color: '#60a5fa' },
  { value: 'other',      label: '其他',     color: '#94a3b8' },
]

/** 地图图层显隐（对应 LayerVisibility 接口） */
export const LAYER_LABELS = {
  terrain: '地形',
  coastlines: '海岸线',
  continents: '大陆轮廓',
  rivers: '河流',
  borders: '国界',
  provinces: '省界',
  roads: '道路',
  stateLabels: '国名',
  burgIcons: '城镇',
  burgLabels: '地名',
  scaleBar: '比例尺',
  vignette: '暗角',
  oceanCurrents: '洋流',
  wind: '风场',
  tectonics: '板块边界',
}

/** 高度图模板（对应 HeightmapTemplate 联合类型） */
export const VALID_TEMPLATES = [
  'continents', 'pangea', 'archipelago', 'volcano', 'isthmus',
  'peninsula', 'mediterranean', 'atoll', 'shattered', 'highland',
]

/** 命名风格（对应 NamingStyle 联合类型） */
export const VALID_NAMING = [
  'chinese', 'japanese', 'european', 'arabic', 'highFantasy', 'darkFantasy',
]
