/** 城市/标记点类型 */
export type MarkerType =
  | 'capital' | 'city' | 'town' | 'village'
  | 'sect' | 'fortress' | 'port' | 'academy'
  | 'ruin' | 'dungeon' | 'oasis' | 'bridge'
  | 'lighthouse' | 'mine' | 'shrine' | 'custom'

/** 城市/标记点 */
export interface MapMarker {
  id: string
  name: string
  x: number
  y: number
  type: MarkerType
  faction?: string
  note?: string
  icon?: string
  importance: number
  userAdded?: boolean
  /** 由世界书地点条目派生的地图标记 */
  source?: 'worldbook' | 'geography' | 'manual'
  sourceEntryId?: string
  worldbookEntryId?: string
  worldbookId?: string
  /** 候选实际对应的地图单元与地图对象，不代表已经确认。 */
  cellId?: number
  mapObjectId?: string
  /** 世界书地点与当前地图对象的绑定审阅状态 */
  bindingStatus?: 'unbound' | 'auto-matched' | 'confirmed' | 'conflict' | 'stale'
  bindingMethod?: 'exact' | 'alias' | 'relation' | 'manual' | 'fallback'
  bindingReason?: string
}
