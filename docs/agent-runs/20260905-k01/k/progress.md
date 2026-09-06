# K 线 progress — run 20260905-k01（最终状态）

- 任务书：[authoring-overnight-dual-track-20260905.md](../../../plan/authoring-overnight-dual-track-20260905.md)（§5 K线）
- 上位计划：[authoring-parallel-foundation-plan-20260905.md](../../../plan/authoring-parallel-foundation-plan-20260905.md)
- worktree：`/home/recoletas/jiuguan/pinax-night-k-20260905`（独立，不与活动工作区共用 index）
- 分支：`night/knowledge-read-model-20260905-k01`
- BASE SHA：`f03e40f44b382b849527fd8def6e6eb81ce60002`（= 本地 main 发布基线，符合并行计划 §3.3）
- run-id：`20260905-k01`；owner：K 线执行者（本会话）
- 开始 UTC：2026-09-05T15:12:51Z；完成 UTC：2026-09-06T00:15Z 前后（有效工作约 1.5 小时，远短于 8 小时窗口；依据任务书"达到最低交付且全部有界任务结束可提前停止"，未为凑时长扩功能）
- node_modules：symlink 到活动工作区（package.json 两基线一致已确认）；K 未改 package/lock

## 最终状态：K0–K4 全部 done

| 包 | 状态 | 交付 |
| --- | --- | --- |
| K0 实体与来源清单 | done | 字段级盘点（worldStore/gameStore/runtimeEvents/placeIdentity/geoHistory/research/memory/试稿，含 file:line）；legacy+rich 两套合成 fixture（共用世界书两项目、同名三人、旧地点 alias、两段时间、未采纳试稿）；fixtures/README.md 逐字段标记"现存 vs 拟议" |
| K1 合同与纯校验 | done（离线 v1 候选） | contract.js（状态词表/限制/原因码/请求与上下文校验/未知字段拒绝/确定性 hash+freeze）、identity.js（显式别名映射、同名歧义、跨项目 denied）、time.js（声明 timeline、半开区间、unknown end≠open）；最小调用样例见 verification.md 三条命令 |
| K2 只读适配 | done | sourceAdapters.js：worldbook entry（tombstone 识别）、geoHistory（显式边+孤儿）、canonicalFacts（唯一事实来源，时间证据规范化，legacy 诚实 unknown）、research claims（claimIds 显式关联+stale 标记）、memory（无实体绑定不返回）、试稿（默认隔离，显式允许只进 hypotheses） |
| K3 最小查询 | done | query.js：授权前置→实体解析→来源适配（按 caller 声明 scope）→时间过滤（先于排序/截断）→视角过滤→冲突检测→确定性排序→有界截断→依赖指纹；全程 AbortSignal 检查，取消后零内容发布 |
| K4 冻结/矩阵/负载/摘要 | done | eval 46/46（exit 0，安全计数 0/0）；benchmark 1k p95 0.96ms 达标；最终 verify:full exit 0（20/20、200/200）；本目录三份交接文档 |

## 支持能力表（supported / unsupported）

supported（legacy 现有形状）：精确实体查询（entry/runtime char/旧地点显式映射/geo 节点）；entry 摘要+geo 历史摘要+研究 claim 关联+来源定位与 revision；矛盾事实显式 conflict；同名消歧候选；tombstone 识别；试稿隔离与显式非正式参考；有界 scope 依赖指纹；取消；预算截断。
supported（rich 拟议形状）：fact-at-time 区间过滤（含边界点）；unknown end≠open；角色视角（known-by/assertion/public）；作者版本 tip 校验。
unsupported（诚实声明）：旧档角色秘密/时点判断（无字段→unknown+`character-knowledge-unrecorded`）；历史作者版本回放；稿件截止（legacy 无版本→unsupported）；记忆实体归属（无绑定字段）；全文/模糊检索（v1 明确不做，非搜索引擎）；分支合并。

## 已知失败 / 阻断

无阻断。非阻断备注：
- E03–E09 研究文档不在 main 分支，证据指针已从活动工作区核对，代码本体以本 worktree 为准。
- scripts/*.mjs 不在仓库 lint 范围（`eslint src`），npx 直检的 no-console/no-undef 为既有脚本共性误报；src 下 K 模块 eslint 0/0。
- K1 仅离线自审，正式合同签收待晨间集成 owner；夜间未与 U 接线。

## 证据路径

- 本目录：progress.md、verification.md（含三条可复现命令）、summary.md、inputs/（三份上位计划副本，未提交、仅供 worktree 阅读）
- `tmp/authoring-overnight/20260905-k01/k/eval-report.json`、`benchmark-report.json`
- 会话日志：/tmp/k-baseline-verify.log、/tmp/k-eval-final.log、/tmp/k-bench-final.log、/tmp/k-final-verify2.log
