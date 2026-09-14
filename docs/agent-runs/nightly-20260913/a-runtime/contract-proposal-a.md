# A→C/O 合同提案（O01 冻结材料）

状态：api-ready。字段命名可随仓库风格微调，语义以本文为准。基线 `night/sf-runtime-20260913@d46efbf`。

## 1. 后果 wire 段（模型输出 → 服务端归一化 → 客户端）

服务端对 `authoring.rehearsal.step` 返回 `result.rehearsal`：

```js
{
  response, change, choices, evidenceRefs,          // 既有四字段，不变
  consequenceVersion: 1,                            // 段版本
  consequenceStatus: 'committed' | 'needs-review',
  consequenceIssues: ['原因（可展示，无协议名/堆栈）'],
  consequences: [ /* 仅 committed 时非空 */ ]
}
```

knowledge（作者行动或回应让某人确实得知已登记事实）：

```js
{ kind: 'knowledge', version: 1, knowerRef, factKey, state: 'learned',
  source: { kind: 'action' | 'response', evidenceRefs: [], quote } }
```

commitment（回应中承诺/有条件承诺/拒绝/撤回）：

```js
{ kind: 'commitment', version: 1, commitmentKey, issueKey,
  promisorRef, beneficiaryRef: '' | ref,
  content, condition: '' | 文本, state: 'promised'|'conditioned'|'refused'|'withdrawn',
  source: { kind: 'response', evidenceRefs: [], quote } }
```

规则（共享合同 `shared/authoringRehearsalConsequenceContract.js` 强制）：
- 每步 ≤2 条；`quote` 必须逐字存在于请求时捕获的对应原文（action→作者行动原文，response→本次回应文本）；ref 只认 `allowedRefs`；factKey 只认 `allowedFactKeys`（本次冻结条件 + 本路已学得）；更新承诺必须回显已登记 `commitmentKey`；新承诺 key 由应用分配，议题（issueKey）锚定触发它的作者行动原文——**同一起点两路同文请求 → 同一 issueKey，可直接对照**。
- 任一条非法 → 整批 `needs-review`（consequences 置空 + issues），response 仍返回。客户端保留输入，作者重试或弃掉；旧已提交步不动。

## 2. 会话条件冻结（C06 轻入口的数据侧）

`rehearsal.freezeConditions({ facts: [{ text, knowerRefs: [ref], unawareRefs: [ref] }, ...], commitments?: [...] })`
- 一条事实、已知者、作者明确不知情者；未指定者=unrecorded（不展示“尚未获知”）。
- factKey 应用生成（文本确定性），整包标 `assumption/author-declared`，不伪造正式世界书 evidenceRef。
- 生成新 baseline/generation：**空路线升级到新代次可继续用；已有旧步的路线保留可读但不可续写**（提示作者从新条件重开）。
- `busy` 时返回 false。

## 3. 给 C 的读模型（composable 新增导出）

| 字段/方法 | 语义 |
|---|---|
| `rehearsal.conditions` | 本次冻结条件（null=尚未声明） |
| `rehearsal.routeState` | 当前路投影 `{ facts, commitments, enteredRefs, stateFingerprint }`；fact 有 `knowerRefs/unawareRefs/learnedInStep` |
| `rehearsal.lastRejected` | `{ routeId, action, response, issues }`；配 `discardRejected()` |
| `rehearsal.compareRoutes(otherId?)` | `{ differences[] }`：knowledge 按 factKey+knowerRef、commitment 按 issueKey；每项 `{ kind, label, personName, a:{status,statusLabel,condition,stepId}, b:{...} }`；状态用 `consequenceStatusLabel()` 直接展示 |
| `rehearsal.createDraftSource()` | 点击“写成试稿”时调用，冻结快照 |
| `rehearsal.draftSourceIsCurrent(source)` | 生成/采纳前核对；false 不得落稿 |
| `rehearsal.refreshSettings()` | 设置弹窗保存后调用 |

C 呈现约束（既有）：不在模板累计知识、不从自然语言猜变化、对照不额外调模型；知情三态展示为 `已得知 / 作者声明暂不知情 / 未记录`。

## 4. 行动意图（advance 输入）

```js
advance({ text, actor?, targets?, actorRef?, targetRefs?, enteringRefs? })
```
- ref 主键优先；name 兼容但必须唯一命中（同名→可处理错误，面板应提供按人选择：`planRehearsalRequest()` 返回 `participants[{ref,name,status}]` 可直接作选择器数据源）。
- `enteringRefs`：本步授权入场的 planned 人物；本步提交后生效，下一步起有回应权。
- 未指明行动者保持既有行为（现场视角）。

## 5. 测试归属现状

- 核心套件 20/200 顶格：A 的协议断言在 `authoringTurnComposer.test.js`（A 独占）内更新，新增矩阵在 `scripts/authoring-rehearsal-consequence-matrix.mjs`（13 组，plain node 可跑）。C 的 UI 断言仍归 `uiControlContract.test.js`；共享测试变更走 O 串行窗口。

## 6. 正例 / 拒绝例（O01 要求）

- 正例：`normalizeRehearsalConsequences([{kind:'knowledge',knowerRef, factKey, source:{kind:'action',quote:'告诉艾德加'}}], {actionText:'莉娜把账册被调包的事告诉艾德加', allowedRefs:[edgar], allowedFactKeys:[factKey], ...})` → ok，state stamped learned。
- 拒绝例：同一批次 quote='引文不存在' → `{ok:false, consequences:[], issues:['引文在作者行动原文中不存在']}`，客户端 needs-review。
