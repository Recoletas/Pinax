# A 线摘要(修正树):写作 Agent 与行内联想收口

> 本文件替换错误基线(f8b7dd0)上的旧 summary;旧分支 `night/arch-a-20260914`(542e0eb..3fa1be0)按 O 指导冻结,仅作迁移来源。旧截图仅代表错误基线证据,不作为最终旅程证据。

- **共同基线 SHA**:`37e0679`(main 已核验快照;merge-base 已核验为 37e0679)
- **最终源分支 HEAD**：`ed12a0c`；按共同基线压缩合入 main 的领域提交为 `a40521e`
- **实际时间**:2026-09-14 夜间首建于错误基线(O 验收拒收);2026-09-15 按修正指导在共同基线重建,当日封板
- **实施/验证耗时**:重建轮实施约 3 小时、验证约 2 小时(含两轮全量、两 Gate、fixture、四轮浏览器旅程与故障注入)

## 主包状态(对共同基线重做)

| 包 | 状态 | 说明 |
|---|---|---|
| A0 | done | 生命周期图重建(12,823 行树;清单 1–13 已抽取,14 缺口确认) |
| A1 | done | useInlineWritingAgentHost:语义事件路由/光标/组合/互斥(afca9c4) |
| A2 | done | commitAdoption 采纳提交契约;peek 留页面使共享断言自然成立 |
| A3 | done | readWritingAgentSource 窄接口 + 职责前后表 |
| A4 | done | host 合同用例(合并7例,预算内:合并 2 旧例) |
| A6 | done | 参考来源 owner+收件箱死路径修复(不恢复已删参考 UI) |
| A7 | verified-existing | surface 合同已在基线成立(含 captureWritingSurface 能力注入) |
| A8/A9 | done | 依赖方向图;迁移孤儿 0;基线遗留 import 清扫按触及行内原则处理 |
| A10 | absorbed by A1 | 路由表入档 |
| A11 | verified-existing | 切换失效顺序核验(保存拒切→派生→取消→参考→scope 级联) |
| A12 | **partial** | 所有权语义单源已核;跨工具关闭顺序表未迁出(入口已写) |
| A13 | done | 重证明后删除 2 死模块(-1,014 行);3 个单消费者服务归域 |
| A17 | done | 三故障注入(host 用例 8–10)+ saver 域核对结论 |
| S2 | done | ui-style-check 六点纠偏(独立移植;frontmatter 未动) |
| D1/D4/D6 | done | 供稿含 current-architecture 清单 14 与 code-map L66 补丁 |

## before / after(对共同基线)

| 指标 | 37e0679 | 修正树 |
|---|---|---|
| Authoring.vue | 12,823 | 12,822 |
| 页面行内请求直调点(cancel/suppress) | 19 | 0(host 注入绑定除外) |
| 采纳标志/组合双写/光标双写点 | 各 1–3 处页面散布 | 唯一 host owner |
| services 死代码 | 1,014 行 | 0(删除) |
| 新模块 | 0 | host 248 行 + reference 57 行 |
| 全量测试 | 200/200 | 200/200(合并 2 旧例 + 新增合并 7 例) |

## 旧职责 → 新 owner → 生产调用

见 `a3-responsibility-table.md`(触发/取消/scope/候选失效/采用/卸载全覆盖);关键点:workflow 注入 `cancelCopilot` 改走 host 工具接管语义;两处上下文装配读 `readForScope`;采纳接缝(清原子 redo、失效回执)由页面 hooks 显式参与。

## 验证与已知失败(修正树实际退出码)

- `npm run verify:full` **exit 0**(20/200、lint:delta、双 build、diff、docs)
- rehearsal-panel Gate **304/304**;f2 review/search/history **33/33**;fixture **13/13**
- authoringAgentWorkflows **25/25**(含 host 7 例:A17 故障 8–10、参考 owner 7)
- 浏览器旅程(修正树,行为证据以可复现请求截获为准):输入/Esc/撤销无错误;跨章同拍断言=章 A 选参考后同章请求含参考文本、切章 B 后 cursor-dwell 请求已发出且参考文本/asset ref 为零、回章 A 不复活(生产页面函数驱动,非 composable 直调)
- 已知未通过/未归因:`rollout-c1-reference-check.mjs` 超时——属计划 §2 记录的历史基线缺口,尚未归因,不计为本线通过项;其余全量与已列 Gate 通过
- 截图标注:`fix-a6-reference-selected.png` 为请求 500 错误态调试截图,不能作为 A6 成功视觉证据(A6 成功证据=请求截获 JSON 与用例 7);`fix-a1-editor-journey.png` 仅证明页面可打开

## 自审复查增补(2026-09-15)

- **A13 搬迁落地纠偏**:首 Commit(afca9c4)仅删除死模块,三个单消费者服务的 `git mv` 实际未执行(误报完成)。自检 diff 走查发现后已真实搬迁并修正全部导入(含带/不带 `.js` 两种写法)与内部相对深度,全量 20/200 复跑通过。
- **组合结束时序保真**:原页面在组合结束后经 nextTick 再排入 dwell(等编辑器最终合成事务);host 初版同步调度,已还原为页面 nextTick 时序。
- **四项修复**:①undo 增加 surface 销毁保护(尽力回退,失败不掩盖主结果);②IME 组合中不从收件箱发起参考选择(保留原 gate 的组合安全意图,文案拆分);③持久化 workflow 注入的 cancelCopilot 统一走 host 工具接管语义;④移除页面未用的 resolveWritingInteractionOwner 导入。
- dismiss 事件签名核实:编辑器 emit 无参数,notifyDismiss 与原 copilotCancel() 行为逐位一致。

## 自审问答

- 两份可变状态?无(光标/组合/采纳标志唯一 owner 在 host;页面无直写,grep 验证)
- callback 业务回流?commitAdoption 三 hook 均为页面所有域(历史/undo 状态/光标工具栏)的接缝
- 持久化失败保持输入?切换保存拒切未动;本轮未触碰持久化 owner
- 旧请求写入新对象?scope 双门禁未动;用例 8 复核迟到丢弃
- 新接口真被生产调用?host 注入三点、commitAdoption、referenceSource 五调用点全在生产路径;A7 为 verified-existing 无新模块

## O 二次验收(P0/P1)修复记录

| 项 | 修复 | 验证 |
|---|---|---|
| P0 参考 scope 未绑真实文档 | 唯一窄读 `readCurrentCopilotReference()`(内部 `readForScope(activeDocumentSaveScopeKey())`);五处生产点(知识 references/getWritingAgentPageContext/buildWritingTaskContext/selectedCopilotReferenceAssets/参考选择)全部 fail-closed | 跨章同拍断言:章 B 请求零泄漏、回章 A 不复活(浏览器请求截获) |
| P1 IME 结束时序 | host.notifyCompositionEnd 内 nextTick 延迟调度,执行前复核 enabled/composition/owner;页面回归纯转发 | 用例:组合后 payload 读到组合后文本(待补页面级,现有 composable 级断言) |
| P1 取消语义分层 | scope-change/tool-takeover 传各自 reason,useWritingAgent 按临时取消清请求去重、不写 dismissedFingerprint | 重臂用例:cursor/scope/tool 三类可重触发,user 仍抑制 |
| P1 采纳异常边界 | 窗口先于 beforeInsert;consume 抛错尽力 undo→uncertain;undo 抛错→uncertain(可观察);onAdopted/afterSync 隔离;页面 uncertain 时提示检查正文 | 用例:consume 抛/undo 抛/重入三条子断言 |

A12 维持 partial;A14–A16 未做,不阻止合并亦不冒称完成。
