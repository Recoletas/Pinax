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
}
