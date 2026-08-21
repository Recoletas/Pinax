# Experience 真实性约束正式接入设计

## 目标

把小说截面实验中已经得到用户反馈支持的低成本规则接入 Experience 正式叙事生成，使角色关系更容易通过互动惯性显现，并减少列举后破折号揭晓、重复解释和无效神秘化等机器腔。

## 边界

- 只修改现有叙事 prompt 与作者注释，不新增页面、设置项或运行时真源。
- 复用 NarrativeKernel 已有的 `continuity.causality.relationships`、cast、角色卡与 voice profile。
- 不把实验 fixture、评分字段或条件名称发送给生产模型。
- 不自动调用真实性局部编辑器；每轮仍只有现有主生成链，shadow critic 仍不改写可见正文。
- 没有有效关系资料时不伪造关系细节，也不要求每个场景都强塞关系动作。

## 生成契约

`buildNarrativeVoiceContract()` 增加四类正式规则：

1. 不使用“若干项都对，唯独某项——错了”式列举揭晓，改写为人物观察、判断或动作。
2. 一个结论只表达一次，不再用同义短句、比喻或格言解释其意义。
3. 神秘信息必须来自现有事实、人物隐瞒或当前因果，并在本拍产生可观察影响；否则直接写清楚。
4. 关系不写成标签或心理说明；只在与当前互动有关时，通过惯常选择、照顾的成本、回避、纠正、默契或遗漏显现。

这些规则与现有五条行文契约、场景模式指导共同进入 Experience system message。

## 有界关系提示

`buildNarrativeTurnNote()` 从 Kernel continuity block 中读取最多三条未结束、已由因果层过滤的关系。提示只包含 `subjectId → objectId（kind）`，并声明它只能作为行为依据、不得照抄标签。

关系提示有以下限制：

- 最多三条，每个 ID 和关系 kind 都裁剪长度。
- 没有有效关系时完全省略该行。
- 不引入新的关系推断，不读取实验 relation-pack fixture。
- 关系只影响下一次正文，不写回 runtimeState。

## 验证

- 合同测试先证明新规则在修改前缺失。
- 单元测试覆盖关系提示的有界输出与无关系省略。
- Agent 合同测试捕获正式首轮请求，确认 system message 包含降 AI 腔规则、user turn note 包含关系提示。
- 最后运行 `npm run verify:full`，并更新 `docs/STATUS.md` 与 `docs/LOG.md`。

