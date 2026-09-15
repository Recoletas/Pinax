# C10 · 画布兼容与素材交接 — absorbed 证据

结论：**absorbed by C1/C9**（21f0319 + 7573347）。逐项对照计划要求：

| C10 要求 | 现状 | 证据 |
| --- | --- | --- |
| `scrollCanvasToBottom` 兼容 | 已删除：K3b 注释自述 no-op，全仓零调用者 | 7573347 cut 记录 + `grep -r scrollCanvasToBottom` 仅历史注释 |
| `useCanvasBoard` 兼容入口收敛 | 页面解构收窄为模板真实绑定的 `onBoardDragOver/onBoardDrop`；`draggingId/isDragging/onItemDrag*/layoutItems/styleFor/bringToFront` 均零消费者，不再解构 | Notes.vue useCanvasBoard 调用点 |
| 合并时画布节点确认 | `mergeCheckedAssets` 保留原 confirm 文案与 `deleteAssetCanvasReferences` 行为，迁入 catalog | `useNotesAssetCatalog.js` |
| 幂等 source refs / 重复送入 | `ensureAssetCanvasCards` 去重逻辑（relationCanvas 服务，冻结不动）+ 冒烟 J4 两次送入断言画布卡=1 | `scripts/notes-journeys-smoke.mjs` J4 |
| 跳转反馈 | `canvasTransferFeedback`（含“其中 N 项已存在”）+ C3 的不劫持导航反馈 | catalog + J4/J5 |
| Notes 只发交接意图 | 页面已无直接 relationCanvas 调用；全部经 catalog 的 open/send/generate 动作 | `grep -c relationCanvas src/pages/Notes.vue` → 0 |

未做与理由：画布协议、布局算法、节点归属未触碰（计划禁令）；ProseEssay 侧边界属 C14（第四层，未启用）。
