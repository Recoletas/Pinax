# B 线回执：漫画工作台与生产闭环（nightly-20260916-comics）

状态：**已实施 + 分线验证（离线确定性）**。真实模型生成、用户视觉确认、组合验证均未发生，见对应章节的单列声明。执行窗口 2026-09-16 23:20 – 2026-09-17 00:40（实际约 1 小时 20 分，远小于任务书 8 小时预算，P1/P2 未启动）。

## 1. 基线与交付

| 项 | 值 |
| --- | --- |
| base SHA | `b5b2b56`（main，含三线计划提交；已确认 `git status` 干净、与 origin 同步后建分支） |
| 分支 / worktree | `night/comics-20260916` / `/home/recoletas/jiuguan/pinax-comics-b-20260916` |
| 交付 SHA | `1ea561a`（feat(media): harden comic studio production loop，单一 feature commit，未 push） |
| 上游冻结 | storyforge `cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed`（未漂移，未整包引入） |
| 开发服务 | Gate 自起隔离 vite（5273，strictPort，进程组退出即杀）；未触碰用户 5173，未改用户服务 |

### 真实修改文件

- `src/services/media/comicRequestGuard.js`（新增，纯函数请求守卫）
- `src/services/media/comicPageStore.js`（+pendingRequest/pendingGeneration 可空字段、`listComicPagesInOrder`、`adoptComicPageProject`、显式 set/clear API；schema 保持 v5）
- `src/services/media/comicProductionService.js`（请求登记、晚返回围栏、媒资保存失败恢复区、target-missing 处理）
- `src/composables/comics/useComicWorkspaceSelection.js`、`useComicPageThumbnails.js`（新增）
- `src/pages/ComicStudio.vue`（页目录三栏 IA、scope 锁定、隔离区、空态直达、检查器收起、离页 flush、未知请求横幅）
- `src/components/media/ComicPageEditor.vue`（panel 级请求登记/未知恢复、内容签名晚返回围栏、autosize、质检定位、导出快照 + 草稿导出）
- `src/components/media/ComicStageWorkbench.vue`（阶段级结果未知横幅、只重试保存、stale 附带提示、未知时禁用生成）
- `scripts/comics-nightly-check.mjs`（新增 Gate）
- `docs/user-manual/09-comics.md`、`docs/engineering/comics-upstream-reuse.md`、本回执

## 2. 任务完成度

| 任务 | 状态 | 说明 |
| --- | --- | --- |
| B01–B03 | done | 基线冻结、scope 归属核查、合成 fixture（2 书 / 共享世界书 / 6+1+1+2 页） |
| B04–B05 | done | `useComicWorkspaceSelection` 唯一 selection owner；`listComicPagesInOrder` 稳定页序 |
| B06–B09 | done | 页目录（真实格框缩略图 + 懒加载封面）、工具栏收敛、空态一键建页、autosize 长文本 |
| B10 | done | 失焦/换页/beforeunload 三路 flush；Gate J4 实测刷新不丢字 |
| B11 | done | 请求前内容签名快照；晚返回只进候选不覆盖现选（A5）；删格 → 媒资留素材库不复活对象 |
| B12 | done | 持久化 pendingRequest/pendingGeneration；同意图拦截、结果未知不自动重发（A4/A7/J6/J8） |
| B13 | done | 生成失败保旧图；媒资写失败 → 会话内恢复区「只重试保存」零模型调用（A6/J11） |
| B14 | done | 生成结果恒为 review 待审；确认需 expectedInputRevision 匹配（沿用既有围栏 + 新 stale 语义） |
| B15 | partial | 质检条目可点击定位格与字层（实现 + 渲染）；Gate 未单独断言点击旅程 |
| B16 | done | 导出快照一次捕获 + 预解码；缺媒体阻断成品、草稿导出带水印（J11） |
| B17–B18 | done | Gate 30/30（服务合同 7 + 浏览器旅程 23），自起隔离服务，含故障注入 |
| B19 | done | `npm run verify:full` exit 0：20/20 文件 / 200/200 用例、lint 0 warning、Vite/VitePress build、架构预算、diff check 全绿 |
| B20 | done | 手册、复用清单、本回执；单 feature 提交，未 push |
| B21–B27（P1） | not-run | 夜窗不足，未启动（任务书允许 partial，不降格冒充） |
| B28–B31（P2） | deferred | 后续路线 |

## 3. 与任务书的偏差（诚实声明）

1. **G-B03「全局入口」被平台 shell 收编**：共享的 `workspaceRouteAdapter`（O 所有，B 禁写）会把无 `bookId` 的项目 surface URL 规范化为默认书。因此漫画在产品内始终有书归属；全局模式代码保留但常规入口不可达。未归属旧页改为**书内隔离区**（目录底部、默认折叠、只读、显式「归入本书」）；旧世界书关联页（两书共享归属有歧义）只读展示、不提供一键归入，留待 O 的全局入口决策。隔离语义（不混目录、不参与生成/导出、不自动挂靠）全部保持。
2. **媒资持久化失败的恢复区是会话内存**（最多 3 条）：刷新后数据 URL 丢失，只能显式重新生成。跨会话持久恢复需要共享媒资接缝，见下节接缝申请，未私建漫画数据库。
3. **页条（横向）与左目录在桌面端并存**：页条主要服务 <980px 单面板导航，桌面端保留为快速跳转；未删除。

## 4. 给 O 的共享接缝申请

- **媒资持久化失败队列**：`comicProductionService` 的恢复区目前进程内。若 O 认可，可在共享 `mediaAssetStore` 增加一个「待落盘 blob」durable 通道（key = requestId），B 侧仅换存储后端，合同不变（`getComicPersistRetry` / `retryComicStagePersist` 签名不变）。
- **STATUS/任务板**：B 按写集未改 `docs/STATUS.md` 与 `docs/agent-runs/current.md`；O 合并时请补登记（owner、worktree、分支、本回执）。

## 5. G-B01–G-B32 实际结果

Gate：`node scripts/comics-nightly-check.mjs`，30/30（`/tmp/pinax-comics-nightly/gate-results.json`）。

| Gate | 结果 | 证据 |
| --- | --- | --- |
| G-B01 | pass | J1a/J1d：两书目录/来源/候选互不可见，mast 与真实 owner 一致 |
| G-B02 | pass | J1d：两书共用 `wb-shared` 世界书，漫画页不混合 |
| G-B03 | pass | J2：无 bookId 入口按平台合同规范化；未归属页隔离区只读 + 显式归入（存储 projectId 由 null→bookA 仅经作者点击） |
| G-B04 | pass | J3：空书空态一键建页，无模型可编辑 |
| G-B05 | pass | A1 + J1b/J4b：sequence/pageNumber 稳定序，编辑旧页不重排 |
| G-B06 | partial | 长标题省略号 + 目录滚动已实现；40 页压力样本未跑 |
| G-B07 | partial | 三处选择收敛到同一 owner；Gate 覆盖预览+检查器，画布点选未单独断言 |
| G-B08 | pass | J4：输入未失焦直接刷新，flush 后不丢字 |
| G-B09 | pass | J4：刷新后从存储恢复，而非 UI 旧快照 |
| G-B10 | pass | J5：800 字对白自动增高、无内滚、390 无横向溢出 |
| G-B11 | not-run | 实机中文 IME 未测（需真机） |
| G-B12 | pass（回归） | 拆分/合并/重排由核心测试既有断言覆盖（16/16 含漫画段全部通过）；未新增浏览器旅程 |
| G-B13 | pass | A5：生成后改格 → stale；重选后确认被围栏拒绝 |
| G-B14 | partial | 隔离保证同 J1；请求中实时切书的端到端旅程未单独跑 |
| G-B15 | partial | 请求中删格 → 媒资留素材库、不复活对象（服务实现）；未浏览器断言 |
| G-B16 | pass | A4 + J6：同意图第二发被拒且网络计数为 1 |
| G-B17 | pass | A7 + J8：刷新后 outcome-unknown 横幅、生成禁用、显式再生成/清除 |
| G-B18 | partial | outcome-unknown 语义已实现；显式「发送前取消」入口未做（无 abort UI），不假称撤销计费 |
| G-B19 | pass | J7：401 错误可读、原选中图保留、不自动重试（429/500 同路径未逐个跑） |
| G-B20 | pass | A6：媒资写失败 → 只重试保存，fetch 计数不增加 |
| G-B21 | pass（回归） | 换候选仅 review、确认态真实（核心测试既有断言） |
| G-B22 | pass（回归） | 上游变化后继 stale（既有 markPanelStagesStale 断言） |
| G-B23 | pass（回归） | 视觉圣经变化 stale + 参考能力警告（既有断言） |
| G-B24 | not-run | 损坏图/SVG 上传校验为既有链路，本轮未触碰未重验 |
| G-B25 | partial | 质检定位实现（issue→panel/object），浏览器点击旅程未断言 |
| G-B26 | pass | J11：导出走启动时快照 + 预解码；真实下载成功 |
| G-B27 | pass | J11：缺最终画面阻断成品、理由可读、草稿导出带水印文件名 |
| G-B28 | partial | J11 验证 PNG 出口 + 草稿；WebP/PDF/条漫切片未逐个重验（渲染函数为同一快照路径） |
| G-B29 | pass | J9a/b：1440 收起扩展、900/720×450/390 无横向溢出 |
| G-B30 | pass | J9c 暗色截图已查看；reduced-motion/200% 未逐项断言（未新增动画） |
| G-B31 | pass | J10：跨页往返仅一套标签壳 |
| G-B32 | pass | A2：旧 v5 样本往返，ID/顺序/lineage 保持，新字段默认 null，schema 仍为 5 |

## 6. 验证命令与 exit code（本轮真实运行）

```
npm run verify:full            → EXIT=0（20/20 files, 200/200 tests, lint 0 warning, vite build, 架构预算, diff, vitepress）
node scripts/comics-nightly-check.mjs → 30/30 checks passed（exit 0）
npx vitest run src/__tests__/integration.test.js → 16 passed（开发中途多次）
npx eslint <改动文件>           → 0 error / 0 warning
```

没有借用任何上一轮数字；以上全部为本轮在本 worktree 的真实运行。

## 7. 截图（全部由本轮 Gate 生成，合成 fixture 非用户私稿）

`/tmp/pinax-comics-nightly/`：`bookA-1440.png`（默认三栏）、`bookA-collapsed-1440.png`（检查器收起）、`bookA-900.png`、`bookA-720x450.png`、`bookA-390.png`、`bookA-dark-1440.png`（暗色）、`bookB-created-1440.png`（空态建页后）、`global-canonical-1440.png`（规范化入口 + 隔离区）、`outcome-unknown-1440.png`（结果未知态）。

实际查看人：B worker（本 session 逐张查看 1440/390/暗色/空态/收起 5 张，核对八条视觉约束后修复两处：未知横幅跨书泄漏、390 收起按钮文字换行）。O 与用户尚未查看；**视觉未获任何用户确认**。

## 8. 人类复验操作顺序（建议 10 分钟）

1. 首页选一本书 → 漫画：确认目录只显示本书页，左目录缩略图、序列筛选。
2. 目录底部「未归属旧漫画」→ 展开只读 →「归入本书」→ 页面进入主目录。
3. 空书进漫画 → 「新建空白页」→ 直接改第 1 格画面与对白 → 输入中直接刷新 → 字不丢。
4. 对白输入 800 字 → 自动增高；点出版质检条目 → 跳到问题格。
5. 点「生成画面」（需真实渠道授权，未授权则跳过）→ 生成中刷新 → 「结果未知」→ 明确再生成或清除。
6. 导出 PNG（缺画面时应阻断）→ 「分镜草稿」→ 下载带水印文件。
7. 收起检查器 → 画布扩展；900/390 与暗色各看一眼。

## 9. 数据兼容与回滚

- schema 保持 v5；新增字段（`pendingRequest`/`pendingGeneration`）均可空、normalize 默认 null，旧数据往返实测（A2）。未迁移、未删除任何用户数据；未归属/旧世界书页原样保留。
- 回滚：revert 本提交即恢复旧 UI 与生成链；已写入的新字段对旧代码不可见（多余 JSON 字段被 normalize 丢弃），无需数据回填。媒资恢复区为内存态，revert 即消失，无残留。
- 真实渠道：本线 0 次真实模型/付费请求（全部为 playwright route mock 与内存 stub）。

## 10. 没有承诺的能力

完整 12 步专业改编链、不可变发布历史与 Blob pin/GC、跨会话媒体任务队列、跨页角色一致性质量、局部重绘质量、专业印刷输出（B28–B31）均未实现。导出快照是**单次**快照，不是永久版本历史。图片质量未评估（无真实样本）；「分线已通过」不等于「组合验证通过」，合并后须由 O 复验 O-G11/O-G12/O-G13 相关项。
