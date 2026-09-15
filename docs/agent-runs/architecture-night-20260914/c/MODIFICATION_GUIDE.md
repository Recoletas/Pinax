# C 线修改指导（O 独立验收，2026-09-15）

状态：**首轮指导已部分完成；最新独立复验仍为 fix-required。**

> 继续修改请以
> [O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md](./O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md)
> 为准。首轮“不同 id 切换失败保护”已经修正，但 `loadNotes()` 仍把目录刷新与编辑器重装
> 绑定，同 id 重载、删除其他素材及若干异步回调仍可能覆盖未保存输入。本文件以下内容保留为
> 首轮审计记录，不再代表当前完整修改范围。

## 已确认成果

- merge-base 为共同基线 `37e0679`。
- Notes 从 5,583 行降至约 4,380 行，catalog/editor/advisor 和 notes services 均有生产调用。
- O 独立运行 `node scripts/notes-journeys-smoke.mjs` 通过，J1–J5 全链可复现；C3 修复的“异步结果写错素材/劫持导航”成立。

## P0：保存失败后切换仍可能丢编辑器输入

当前 `useNotesAssetEditor.saveCurrentChapter()` 捕获异常后只设置 `saveStatus='failed'`，不返回失败；`useNotesAssetCatalog.selectChapter()` 无条件继续改 `selectedChapterId` 并 `loadAsset(next)`。因此配额失败时，旧素材未持久化的编辑器内容会被下一素材覆盖。“失败不阻断切换、输入保留”这一摘要结论不成立。

同时，save 在 try 前直接修改 catalog 中的 `chapter.title/content`，`flushVisualPresentation(chapter)` 也可能改变对象；这不是持久化成功前的原子更新。

## 必修补丁

1. 让保存动作返回明确结果，例如 `{ ok, reason, assetId }`，而不是只改状态。
2. 保存时先构造待提交 patch，避免在正式写成功前把 catalog 投影当成已保存真源。若视觉呈现必须先落到对象，失败时恢复原字段或把未保存草稿留在 editor owner。
3. `selectChapter`、上一项/下一项、改变类型、归档、合并、删除、送画布等在操作当前 dirty 素材前检查保存结果：
   - 保存失败则保持当前素材、标题、正文和焦点；
   - 不执行破坏性动作或导航；
   - 给作者可理解的失败反馈，可再次保存或复制正文。
4. 增加一个现有脚本内的故障旅程：让 `updateNarrativeAsset`/storage 写入抛配额错误，输入一段新文字后尝试切换；断言选择未变、编辑器文字仍在、storage 仍是旧值、状态为 failed。恢复存储后重试，才允许切换。
5. 补 `pagehide` 和 `visibilitychange(hidden)` 的 flush，监听必须成对注册/卸载；避免移动端后台只依赖 beforeunload。失败时仍遵守上面的留稿语义。
6. `uiControlContract.test.js` 属 O 共享写集：将 C 的修改单列成补丁说明，由 O 检查它是在验证生产接线而不是迁就文件名；不要把该提交视为自动获批。
7. 更新 summary：修正后明确“保存失败阻止切换并保留输入”，不要继续写“失败不阻断切换”。时间按提交可观察区间 00:21–01:02 回填，原文 01:55–03:35 与提交时间不一致。
8. 完成 C8/C13 的前置不等于必须硬拆组件；先把源码字符串断言改为行为断言，再选择目录批量栏或编辑头一个高内聚 surface。若仍会镜像状态，维持 not-started 并写下一轮入口。

## O 重点复核

- catalog 和 editor 互相注入是否形成初始化顺序/TDZ 风险。
- 顾问 apply/undo 是否以 asset id + revision 为真源，而非当前 selected id。
- C9 删除的 494 行需结合模板事件、动态调用和兼容入口复核；不能仅依赖 grep。
- 插画 DOM 仍在页面是有意边界，不应为了减行立即抽成 callback 密集组件。

## 修正验收

- 配额失败 → 切素材/归档/删除/送画布均不丢未保存文字。
- 恢复存储后重试可继续，且没有重复画布卡或错误素材。
- notes smoke 在 Node 22 exit 0，新增失败旅程真实走生产 adapter。
- focused、`verify:full` 在修正 HEAD 通过；最终组合再由 O 复跑。
