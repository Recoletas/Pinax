/**
 * 地图轨道 ⇄ Authoring 轨道 intent/result 合同草案（计划 §6.1/§7.3）。
 *
 * P0–P5 阶段此文件只是类型合同 + mock 消费方；不修改任何 Authoring 文件。
 * Authoring 只负责发 intent 和消费结果；地图轨道负责打开项目级 surface、
 * 定位/落图、产生 binding receipt。两边不共享组件 ref 或临时 boolean。
 */

export type OpenMapMode = 'locate' | 'place' | 'repair-binding'

/** Authoring → 地图轨道的打开意图（typed，不走临时 boolean）。 */
export interface OpenMapIntent {
  projectId: string
  bookId: string
  worldbookId: string
  worldbookEntryId?: string
  mode: OpenMapMode
  returnTo?: MapReturnBookmark
}

/** 返回书签存 session-level workspace state，不编码进 URL（计划 §6.2）。 */
export interface MapReturnBookmark {
  chapterId: string
  writingUnitId: string
  documentRevision: number
  caretBookmark?: unknown
  scrollBookmark?: unknown
}

/** 地图 → Authoring 的结果。 */
export interface MapIntentResult {
  kind: 'located' | 'binding-committed' | 'cancelled'
  mapAssetId?: string
  mapRevision?: number
  bindingReceipt?: import('../model/mapBindingV2').MapBindingReceipt
  /** cancelled 时必须成立：无任何真源写入（计划 §9.4 旅程 2）。 */
  wroteNothing: boolean
}

/** 项目级地图路由参数（§6.2）。caret 等大对象绝不进 URL。 */
export interface MapRouteQuery {
  bookId: string
  worldbookId: string
  entryId?: string
  mapAssetId?: string
  mode?: OpenMapMode
}

/** workspace tab key（§6.2）：两本书打开两张独立地图标签。 */
export function mapWorkspaceTabKey(bookId: string): string {
  return `project:${bookId}:map`
}

/**
 * P0–P5 mock 消费方：真实 Authoring 接线推迟到 P6 共享集成窗口。
 * 返回 null 表示当前环境没有 Authoring 侧消费方。
 */
export type OpenMapIntentDispatcher = (intent: OpenMapIntent) => Promise<MapIntentResult>

export const mockOpenMapIntentDispatcher: OpenMapIntentDispatcher = async (intent) => {
  if (import.meta.env?.DEV) {
    console.info('[map-intent:mock] OpenMapIntent received', {
      bookId: intent.bookId,
      mode: intent.mode,
      entryId: intent.worldbookEntryId ?? null,
    })
  }
  return { kind: 'cancelled', wroteNothing: true }
}
