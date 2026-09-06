# U/K 夜间交付合并回执 · 2026-09-06

**最终收敛**：前轮因 U 并发修改暂停。本轮用户确认全部完成，冻结最终树 `9fe8e0639ce44b5f825a9be8f941be72d9eea86c`，接收 composer 展开布局和更新后的 U 摘要；保留集成人物 ID、失效书签、DOM 选区和 payload 修复。原 worker 将结构断言改成段落数的做法未采用，继续精确校验写作单元数量。下文前轮验证保留为历史，本轮结果另列。

## 范围与保全

最终页面复验：acceptance 19/19、V2 5/5，命令均 exit 0；最终全量验证 `resume-final-verify.log` exit 0。已验证代码未再改动。开发服务曾提示 prototype 的 ol 扫描依赖无法解析，但 Authoring 页面、J10 和双 build 均通过；没有为此改动原型或安装依赖。

本轮恢复合并验证：`verify:full` exit 0（20/20、200/200、双 build/diff）；K eval 46/46、benchmark exit 0（1k p95 最大 1.644ms）；`JOURNEYS=local ONLY=j10` exit 0。最终展开布局 1440/390 已重新截图检查，无横向溢出；图片为 `tmp/authoring-rollout/final-composer-{1440,390}.png`。下表完整 journey 的 J9/J11 失败是前轮证据，本轮没有宣称修复或重跑全矩阵。运行日志为原日志目录下 `resume-*`。

- 基线：main / origin/main `f03e40f`（本轮 fetch 后确认）。
- U：从原 `integration/consolidation-20260823@da7eda1` 冻结包含未跟踪文件的真实树 `83b0396b30c7ed9bf6a6855da620c08c713c3b8e`，相对 main 提取增量；不重新合并旧长历史。
- K：`night/knowledge-read-model-20260905-k01@5498bf5`，源实现 `e5486ce`；独立模块、合成 fixture、eval/benchmark 与三份交接文档。修正进度文档指向未提交 inputs 副本的链接。
- main 工作区：`/home/recoletas/jiuguan/pinax-integration-20260906`。按 U、K 两个 concern 收口提交，并快进本地 main；原活动工作区和 K 工作区保留，无 push / server-version 同步。
- K 仅纳入仓库，不接资料助手、工具注册、store 或数据库；I0、历史写入及真实旧档合同签收仍未完成。

## 集成复核修复

首次合成树全量测试为 196/200；U 摘要的全绿不对应最终文件。实际已存在 composer“调整方式”和试稿“调整结构”折叠布局，不能沿用“未实施 A3”的说法。

1. 人物 option 恢复稳定 ID，修复对话/内心提交；重写指令恢复对应标签。
2. 右键菜单正文 revision 或书签失效时返回 false，不能以“归还焦点成功”放行编辑动作。
3. ProseMirror 使用 selection.head 而非不存在的 focus；DOM 选区用 setBaseAndExtent 保留反向方向；延迟点击回调避开已销毁 view。
4. payload 预算取消 1000 字符保底；静态前缀耗尽空间时，短 payload / initial 复用也必须 typed 拒绝，断言并入现有用例。
5. 删除重复追加的同一段 CSS；更新已变文案断言，保留提交/人物/结构断言；“写作单元”不误标成“段落”。

## 验证

验证源码为上述两线与集成修复的合成树，不使用原目录 5173 的页面冒充。测试自建 5196 服务，结束后仅停止该服务。

| 命令/检查 | 本轮结果 | 边界 |
|---|---|---|
| `npm run verify:full` | exit 0；20/20 文件、200/200 用例、Vite / VitePress build、diff 通过 | 核心门禁，不代表全部交互绿 |
| `node scripts/knowledge-read-model/eval.mjs` | exit 0；46/46；storage write / network 计数均 0 | 合成 legacy/rich 资料，非生产接线 |
| `node scripts/knowledge-read-model/benchmark.mjs` | exit 0；1k 查询最大 p95 0.971ms，10k 约 10.7ms | 本机样例，不是线上性能承诺 |
| `BASE=http://127.0.0.1:5196 node scripts/authoring-ui/rollout-fixture.mjs` | exit 0 | 隔离浏览器合成资料 |
| 同 BASE 的 `rollout-acceptance.mjs` / `rollout-v2-check.mjs` | exit 0 / 0；19/19、5/5 | 手机/新视觉尚待用户确认 |
| `BASE=http://127.0.0.1:5196 JOURNEYS=local node scripts/authoring-journeys-smoke.mjs` | **exit 1；12 条中 J9/J11 失败，其余未报失败** | 与 U 报告同类遗留，不能写 journey 全绿 |
| `node scripts/narrative-production-smoke.mjs --dry-run --count 6` | exit 0；6 个场景合同检查 | 不证明生成质量 |
| 1440/390 composer 截图与溢出检查 | 两尺寸可见、无横向溢出；人工看图 | 生成接口拦截，非真实生成验收 |

过程说明：最初 acceptance/V2 缺 fixture，生成后重跑通过；首次/第二次全量测试 196/200、199/200，修复后全量通过。第一轮 journey 未显式选择 local，脚本会探测后端并执行 J6/J7 非确定性路径；已中止，不能计为完整通过、纯 mock 或真实模型质量验收。后续单独跑 local 得到上表明确结果。

## 遗留与下一步

- J9：compositionend 后等待函数 4000ms 超时；J11：查找定位后选区浮条不可见。保留失败截图/事件，先复现和明确搜索面板关闭后的焦点合同。
- J1 本轮未报失败，但单次通过不能证明原间歇性右键问题彻底消除。
- A3 折叠布局可纳入开发分支，不标记视觉冻结；A2-2 手机详情优先仍未获选择，保持堆叠。
- K 接线前需单 owner 审授权快照、旧档 unsupported 和生命周期；不要把 rich fixture 能力宣称为现有数据已具备。
- “8h”任务容量不足及后续连续队列规则见 [任务书 §9](../plan/authoring-overnight-dual-track-20260905.md)。本轮只复盘，不自动启动下一夜。

## 本机证据

- 命令日志：`/tmp/pinax-merge-20260906-wVxa0a/`。
- 工作区内 `tmp/authoring-rollout/acceptance/report.json`、`v2-check-report.json`、`merge-composer-{1440,390}.png`。
- local journey：工作区内 `tmp/authoring-journeys/20260906T124035Z_f03e40f4_2170725/`。目录名 SHA 是提交前基线，合成源码还有当时未提交增量；不能只凭目录 SHA 复原源码。
- 图片/日志未提交，文档保留可复跑命令；worker 原始摘要作为历史，不替代本回执。
