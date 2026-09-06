# K 线 verification — run 20260905-k01

BASE `f03e40f44b382b849527fd8def6e6eb81ce60002`（= main）；worktree `/home/recoletas/jiuguan/pinax-night-k-20260905`；分支 `night/knowledge-read-model-20260905-k01`。全部验证在本 worktree 独立运行，node_modules 为指向活动工作区的 symlink（package.json 两基线一致）。

## 验证命令与真实退出码

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 基线 `npm run verify:full`（改动前） | exit 0，`20/20 files, 200/200 tests`，Vite/diff/VitePress 通过 | `/tmp/k-baseline-verify.log` |
| `node scripts/knowledge-read-model/eval.mjs` | **exit 0，通过 46/46**（12 类矩阵），storage 写入 0、网络调用 0 | `eval-report.json`（同目录 tmp 证据）/ `/tmp/k-eval-final.log` |
| `node scripts/knowledge-read-model/benchmark.mjs` | exit 0，1,000 条查询 p95 最大 0.958ms（门槛 100ms） | `benchmark-report.json` / `/tmp/k-bench-final.log` |
| 最终 `npm run verify:full`（最终树） | exit 0，`20/20 files, 200/200 tests`，build/diff/docs 通过 | `/tmp/k-final-verify2.log` |
| `npx eslint src/services/project/knowledgeReadModel` | 0 error / 0 warning | 会话内执行 |

最终 verify:full 摘要行：`verify:full: 20/20 files / 200/200 tests / build OK / diff clean / docs OK`（log：`/tmp/k-final-verify2.log`）。

## eval 矩阵覆盖（46 场景，12 类）

- **身份（8）**：entryId 精确命中；同名三人（2 entry + 1 runtime）只给消歧候选不合并；旧 `place:` 字符串仅经 geoHistory `placeRefs`+`entryBindings` 显式映射到 `{worldbookId, entryId}`；无映射旧地点保持 unresolved（不发明第三套地点 ID）；跨项目 ref/请求整体 denied 且零内容零计数；tombstone 不复活；缺失条目 entity-not-found。
- **来源（5）**：正文只作 excerpt 不拆"已确认事实"；研究 claim 经 `entry.metadata.claimIds` 显式关联、stale 打标；记忆无实体绑定→不伪造归属；试稿默认隔离（仅政策性计数），显式允许后只进 hypotheses（informal），永不升级为事实。
- **时间（7）**：legacy 无时间声明→不伪造纪年、全部时间未知；rich 纪元窗口按 declared timeline 过滤；半开区间边界（起点含/独占终点不含）逐点验证；`unknown end` ≠ `open`（起始早于窗口+终点未知→返回但适用性计未知+诊断）；跨 timeline→timeline-mismatch，时间问题整体不可答（coverage 记满）；作者旧版本→unsupported（仅支持实际保存版本）；legacy 无稿件版本→manuscriptCutoff unsupported。
- **视角（6）**：作者可见已授权秘密；被明确告知的角色可见（assertion+known-by 双通道）；无依据角色不可见且**序列化结果零泄露**（无 ID/标题/数量/值痕迹）；legacy 无知识依据→排除并标 `character-knowledge-unrecorded`（不冒称"他不知道"），自身状态事实可见；不存在的视角角色→unknown；跨项目视角→denied。
- **权限（3）**：共用世界书的两本书 runtime 事实互相隔离（同 factId 值相反、指纹不同）；runtimeBranchId 不符→runtime 排除（不报错不越权）；请求形状升级全部被拒（未知来源类型、未知 ref 字段、schemaVersion 2）。
- **冲突（3）**：legacy 同主体同谓词矛盾→`conflict` 状态双方保留（不被 authority 吞）；rich 时间不重叠的同谓词事实**不是**冲突；disputed 事实保留但既不冒充 confirmed 也不进冲突对。
- **因果（1）**：history-causes 只沿显式 `leads-to` 入边、≤2 跳/24 项；孤儿边与环分别诊断；causes/consequences 散文串只作标签不作遍历边。
- **生命周期（5）**：预先取消/中途取消→`aborted` 且零内容发布；同输入结果与指纹完全一致；新增矛盾事实改变有界 scope revision→指纹变化；**无关条目变化不使指纹失效**（有界依赖范围）。
- **限制（3）**：>8 实体→unsupported；预算内截断→coverage.truncated+诊断；预算试图放大→denied。
- **兼容（2）**：legacy 存档诚实回答不了角色秘密而 rich 能——分开统计不冒充；无 geoHistory 快照做因果查询安全返回。
- **纯净性（3）**：冻结与非冻结输入查询前后 hash 不变（零变异）；全程 storage 写入 0、真实网络调用 0；K 模块源码无存储/网络/activeWorldbook 引用（静态扫描）。

## 性能口径（详见 benchmark-report.json）

- 环境：Node v20.20.2，linux x64（WSL2）。内存口径：`process.memoryUsage()`，rss=进程常驻集合、heapUsed=V8 活跃堆，单次读数、无跨规模 GC 同步。
- 100 条：冷建 scope 0.9ms，查询 p95 0.35ms；1,000 条：冷建 5.4ms，查询 p95 0.97ms；10,000 条：冷建 28.2ms，查询 p95 13.7ms。
- 预取消请求 p95 ≤0.03ms；单次结果序列化有界（1632 chars）。
- 1,000 条门槛（p95 ≤100ms）达标，余量约 100 倍。未引入缓存/Worker。

## 晨间验收三条可复现命令

在 worktree 根目录运行：

```bash
# 1) 正常查询：作者视角查临江城 → conflict（两条矛盾事实都保留）+ 摘要/依据
node --input-type=module -e "
import { createLegacySnapshotA, LEGACY_FIXTURE_IDS as L } from './scripts/knowledge-read-model/fixtures/legacySnapshot.js'
import { queryKnowledge, freezeKnowledgeSnapshot } from './src/services/project/knowledgeReadModel/index.js'
const r = queryKnowledge({ schemaVersion:1, projectId:L.projectAId, entityRefs:[{kind:'worldbook-entry',id:L.entryLincheng}], questionKind:'entity-context' }, { snapshot: freezeKnowledgeSnapshot(createLegacySnapshotA()) })
console.log(r.status, r.facts.map(f=>f.factId+':'+f.value), r.conflicts.length, '条冲突')"

# 2) 未知时间：legacy 无时间声明 → 不伪造纪年，时间适用性全部未知
node --input-type=module -e "
import { createLegacySnapshotA, LEGACY_FIXTURE_IDS as L } from './scripts/knowledge-read-model/fixtures/legacySnapshot.js'
import { queryKnowledge, freezeKnowledgeSnapshot } from './src/services/project/knowledgeReadModel/index.js'
const r = queryKnowledge({ schemaVersion:1, projectId:L.projectAId, entityRefs:[{kind:'worldbook-entry',id:L.entryLincheng}], questionKind:'fact-at-time', storyTime:{timelineId:'timeline:any',eraId:'age-strife',ordinal:3} }, { snapshot: freezeKnowledgeSnapshot(createLegacySnapshotA()) })
console.log(r.status, 'timeUnknown:', r.coverage.timeUnknownCount + '/' + r.facts.length)"

# 3) 拒绝越权：请求自报另一项目 → denied，零内容零计数
node --input-type=module -e "
import { createLegacySnapshotA, LEGACY_FIXTURE_IDS as L } from './scripts/knowledge-read-model/fixtures/legacySnapshot.js'
import { queryKnowledge, freezeKnowledgeSnapshot } from './src/services/project/knowledgeReadModel/index.js'
const r = queryKnowledge({ schemaVersion:1, projectId:'book_other_999', entityRefs:[{kind:'worldbook-entry',id:L.entryLincheng}], questionKind:'entity-context' }, { snapshot: freezeKnowledgeSnapshot(createLegacySnapshotA()) })
console.log(r.status, JSON.stringify(r.diagnostics), '内容数:', r.facts.length + r.excerpts.length)"
```

预期输出依次为：`conflict [fact_a_001:商会, fact_a_004:城主府] 1 条冲突`；`conflict timeUnknown: 2/2`（该实体本身存在矛盾事实故状态为 conflict；时间问题不可答以 coverage 计数完整表达，事实全部返回且无伪造纪年）；`denied [{"code":"project-mismatch"}] 内容数: 0`。

## 生产 import 消费者

`src/services/project/knowledgeReadModel/` 的预期生产 import 消费者数量：**0**（grep 全 src/shared/electron/server 无引用）。该模块是离线 v1 候选，接入由 I0 决定。

## 已知边界（不是缺陷，是诚实 unsupported 清单）

- 旧档（legacy 形状）无 validDuring/visibility/knowledgeAssertions：角色秘密、时点判断、角色视角资料均诚实 unknown/`character-knowledge-unrecorded`，不冒称现有存档能回答。
- 作者版本仅支持当前实际保存版本（rich fixture 的 `revision.author` 位置）；历史版本回放 unsupported。
- 世界书条目摘要无时间维度（条目是"恒可查阅的作者参考"）；fact-at-time 的时间过滤只作用于有 validDuring 的事实与有 ageId 的历史节点。
- 记忆（memory）无实体绑定字段，v1 不返回、只计数并诊断。
