# K 线摘要 — run 20260905-k01（只读知识能力最小纵切）

**做了什么**：在独立 worktree（BASE=f03e40f=main，分支 `night/knowledge-read-model-20260905-k01`）完成 K0–K4 全部最低+目标交付。新增 `src/services/project/knowledgeReadModel/`（contract/identity/time/sourceAdapters/query/index 六个纯模块，冻结 v1）与 `scripts/knowledge-read-model/`（eval.mjs 验证矩阵、benchmark.mjs 负载、legacy/rich 两套合成 fixtures+字段清单）。能力：指定实体→已授权资料→明确时间可用性→来源与不足说明；身份（`{worldbookId, entryId}`+显式旧地点映射，同名不合并）；权限前置（请求不能自报项目/视角/分支扩权）；facts/excerpts/hypotheses 分离；有界时间过滤（半开区间、unknown end≠open）；冲突显式报告；≤8 实体/24 项/12000 字符；取消；依赖指纹（有界 scope revision）。

**没做什么**：零生产接线（import 消费者=0，等 I0）；不改 UI/store/shared/存储/package/CI/既有测试；无模型调用、无数据迁移、无 SQLite、无浏览器；正式合同签收留给晨间集成 owner。

**是否安全**：只读。storage 写入 0、真实网络调用 0、activeWorldbook 不碰；冻结与非冻结输入查询前后 hash 不变；隐藏资料在 ID/标题/数量/诊断零泄露；跨项目/越权视角 fail-closed。K1 是离线 v1 候选，夜间未让 U 依赖。

**怎么验**（worktree 根目录）：
1. `node scripts/knowledge-read-model/eval.mjs` → exit 0，46/46（12 类矩阵：身份/来源/时间/视角/权限/冲突/因果/生命周期/限制/兼容/纯净性）。
2. `node scripts/knowledge-read-model/benchmark.mjs` → exit 0；1,000 条查询 p95 0.96ms（门槛 100ms），10,000 条 p95 13.7ms。
3. `npm run verify:full` → exit 0，20/20 文件、200/200 用例（预算未动）。
4. 三条样例查询（正常冲突查询/未知时间/拒绝越权）见 verification.md，可直接复制运行。

**诚实边界**：legacy 旧形状答不了角色秘密与时点判断（unknown，不冒充）；rich fixture 证明的是"数据存在时能答什么"，不代表现有存档已有该数据。

**回退**：独立未接入模块，删除对应提交/目录即可，用户数据零变化。

证据：`eval-report.json`、`benchmark-report.json`（tmp/authoring-overnight/20260905-k01/k/）；progress/verification 同目录。
