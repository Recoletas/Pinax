# A/B/C 架构三线集成验收（2026-09-15）

## 结论

三条修正线已从共同基线 `37e0679` 验收，并按 B → C → A 压缩合入 `main`：

- B / Experience session runtime：`c52256b`
- C / Notes catalog-editor lifecycle：`b7de2e5`
- A / Authoring inline-agent lifecycle：`a40521e`

本轮验收不是照抄分线回执。代码审查发现两处回执未覆盖的耐久性缺口，并在组合树修复：

1. 普通 Experience 生成失败或取消时，runtime 虽已回滚，但清理后的最终一致态没有立即写入 session；现在只在 generation owner 完成 loading/controller 清理后提交。重新生成中的临时候选分支仍由外层 `switchBranch` 提交，避免半事务存档。
2. `useAI=false` 时 `regenerateFrom()` 原先仍会先改 runtime、分支和 superseded；现在入口严格 no-op。故障矩阵增加真实 store 旅程，覆盖 no-op、失败回旧分支和 fresh reload。
3. Notes 旧 Markdown 媒体迁移与参考图新建仍使用不报告 `setItem` 失败的旧 API；现在先通过 durable 结果确认写入，再推进 editor/catalog 投影。失败不会显示为已迁移或已创建。

三线原阻断也已逐项成立：A 的参考 scope 使用当前真实文档键，IME 结束保持 nextTick 时序，临时取消可重臂，采纳异常可观察；B 的 runtime projection 保持纯内存、最终提交归外层事务；C 的 catalog refresh 不再重装编辑器，同 id 激活 no-op，异步结果以 generation/source identity 拒绝迟到覆盖。

## 验证证据

- `npm run verify:full`：exit 0；20/20 files、200/200 tests、lint delta、Vite build、diff check、VitePress build 全部通过。
- `node scripts/experience-session-fault-matrix.mjs`：Node 22 为 20/20；Node 20.20.2 为 20/20。
- `node scripts/experience-store-api-surface.mjs`：73 → 73 state keys；136 → 137 actions；唯一新增 action 是 `commitCurrentSessionNow`。
- `node scripts/notes-journeys-smoke.mjs`：J1–J6d 通过；覆盖立即切换、刷新、批量归档、同 id no-op、异步来源归属、配额失败保留输入与 mutation 不假成功。
- focused Vitest：Authoring workflow + UI contract + narrative assets，3 files / 35 tests 通过。
- `node scripts/authoring-ui/rehearsal-panel-check.mjs`：304/304。
- `BASE=http://127.0.0.1:5198 node scripts/authoring-ui/f2-review-search-history-check.mjs`：33/33。
- agent infrastructure：`.agents` / `.claude` 的 14 个 shim 均解析到仓库内 `agent-skills/`；7 个 canonical `SKILL.md` 均有 name/description frontmatter。

推演 Gate 首次在空端口执行得到 `ERR_CONNECTION_REFUSED`；按脚本合同启动 5198 临时 Vite 后原样重跑为 304/304。F2 首次使用默认 5173 同样是缺少既有服务，显式指定同一 5198 后为 33/33。二者均是前置条件失败，不计作产品断言失败；临时服务已关闭。

## 明确保留的边界

- A12 跨工具关闭顺序仍为 partial。
- B12 的 `extractCharacterChanges`、`extractActivityEvents` 仍留在 store，未冒称完成。
- 本轮证明代码合同、离线故障与浏览器 fixture 旅程；没有新增真实模型质量结论，也没有代替用户做真实作品体验确认。
- Notes smoke 启动 Vite 时会扫描 `prototype/map-spike` 并报告未安装的可选 `ol/*` 依赖，但生产页面旅程仍完成并 exit 0；这不是本轮引入的运行时失败，后续可单独收紧 Vite 扫描范围。

## 复盘规则

B 分线回执曾写“失败/取消 catch 已有最终提交”，但最终源提交并没有对应代码，矩阵也没有失败出口旅程。现有 `testing-verification` 已明确要求证据先于完成声明，因此不新增重复 skill 规则；本轮直接补生产实现与可复现旅程，并在 summary 中纠正数字和表述。
