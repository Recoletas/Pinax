# Authoring F3-0 因果故事沙盒调研与离线对照

**观察日期：** 2026-09-02
**范围：** 只判断“改变一个故事条件后，怎样找到有依据的后续影响并安全排演”；不评估价格，不复制产品外观，不把互动叙事运行时直接搬进正文编辑器。

## 1. 一手资料观察

| 来源 | 可见事实 | Pinax 复用点 | 不照搬点 |
|---|---|---|---|
| [Scrivener Overview](https://www.literatureandlatte.com/scrivener/overview) | section 与 index card 同源；在 Corkboard 移动卡片会同时重排 manuscript；synopsis 与正文分离但在 Editor/Corkboard/Outliner 共用；split editor 可同时打开多个项目文档。 | 一个稳定正文 section 可以有多个投影；位置和重排必须回到同一个文档身份。 | 不把每个自然段升格为 Binder 文件，不复制拟物卡片墙。 |
| [Plottr Timeline](https://docs.plottr.com/article/54-timeline-overview) | scene card 位于 chapter 与 plotline 交叉点，可关联 character/place/tag，并按这些维度筛选；Outline 由 Timeline 自动生成。 | 场景、人物和地点关系适合成为可筛选投影；影响结果可以按目标位置归组。 | Timeline 与正文存在导出边界，不能作为 Pinax 的第二正文真源；不要求每场一张永久卡。 |
| [Novelcrafter Revision History](https://docs.novelcrafter.com/en/articles/8677729-revision-history/) 与 [2025-06 更新](https://feedback.novelcrafter.com/changelog/june-11-2025) | scene、summary、Codex 字段分别保留 revision；scene beat 会消费 Codex，上下文重复和跨 beat 误带是产品实际修复项；小屏 panel 可 pin。 | intervention/影响组必须冻结 revision；beat、证据和正文需要精确上下文边界。 | 不从名称命中直接断言因果，不让 Codex 嵌套扩张成全量上下文。 |
| [Sudowrite 文档目录](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS) 与 [Importing Files](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/importing-files/rbGUgrZM6tNuXFG1hjDFyS) | Write/Rewrite/Canvas 与 Story Bible/Scenes 分工；导入可从稿件生成 Story Bible，也提供不经 AI 改写的 CSV outline 路径。 | 排演结果先作为非正文分支；从正文提取的关系必须可审阅，确定性输入优先。 | 不让模型导入结果直接成为世界事实，不以整章生成替代局部影响审阅。 |
| [inkle/ink](https://github.com/inkle/ink) 与 [Writing with ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) | Inky 支持边写边运行；choice、divert、变量与条件是显式可执行结构；全局变量可由运行时读写。 | “排演”与“正式稿”应是两个状态；明确条件/结果关系比语义相似更可靠。 | 不把小说正文改造成 Ink 源码，不要求作者维护全局变量或完整分支图。 |
| [Failbetter StoryNexus/QBN](https://www.failbettergames.com/news/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing) | storylet 的出现由 qualities 控制，outcome 再改变 qualities；它在纯分支与完整世界模型之间取中间层。 | 采用小而明确的 intervention operation 与有界 outcome，不做任意图遍历。 | 不建立通用规则引擎，不让隐式相似度成为 storylet 条件。 |
| [Wildermyth Event](https://wildermyth.com/wiki/Event)、[Story Inputs and Outputs](https://wildermyth.com/wiki/Story_Inputs_and_Outputs) | event 由人物属性、hook、关系等 targeting criteria 匹配；结果可改变关系/人物发展；重复见过的事件会显著降权。 | 排演方向必须由当前人物/关系/条件约束，并真正产生不同后果；候选需要去重和降噪。 | 不把随机事件池或跨周目概率系统塞进首期写作沙盒。 |
| [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) | canvas 只定义 node/edge、位置、尺寸与少量视觉元数据；file node 通过路径/subpath 引用外部文件。 | 未来场景/因果视图应保存布局与稳定引用，而不是复制正文内容。 | `edge.label` 不是事实证明；自由连线不能自动升级为 established 因果。 |

## 2. 决策

1. 正文、世界书和历史继续是事实真源；因果图是可重建的内存投影。
2. `NarrativeIntervention` 每次只允许一种操作，冻结目标位置、前后条件和精确证据。
3. `TypedNarrativeLink` 区分明确依赖与弱候选：`mentions/similar-to` 永远不默认入选，`precedes` 单独存在也不能证明因果。
4. 影响发现只沿当前 operation 的关系白名单扩展两跳，不做通用 BFS；默认最多三组，展开最多五组。
5. 每个 established 影响必须同时具有稳定正文 target、可读理由和 F2 `EvidenceEnvelope` 内的精确证据。
6. 排演至少给出“最小修补”和“连锁推演”两种因果范围；二者仍是草稿，不产生正式写入。

## 3. 四组离线对照结果

运行：`npm run eval:authoring-causal-sandbox`

| Fixture | A 普通聊天代理误报 | B 关键词误报 | C 类型化因果误报 | C 漏报 |
|---|---:|---:|---:|---:|
| 当前场加入人物 | 2 | 2 | 0 | 0 |
| 暴雨改为停电 | 2 | 3 | 0 | 0 |
| 钥匙烧毁改为藏起 | 2 | 3 | 0 | 0 |
| 事件提前三天 | 2 | 3 | 0 | 0 |

C 在 4/4 fixture 中误报都少于 A/B；所有 established 项均可回到精确正文证据，无关相似文本只进入展开候选。每组均产生两个目标集合不同的排演方向，revision 改变后 intervention 被标 stale。对照中的 A 是可重复的“无关系依据、只看邻近后文”代理，不宣称代表任何特定模型的真实质量。

## 4. 实现边界

- 已冻结纯内存合同与离线 Gate，不写 `localStorage`，不修改 `writingUnit` schema，也不需要向量库。
- F3-1 才把作者的单一改动转成 intervention；页面不得自己拼另一套证据或位置。
- F3-2 才在可见界面展示影响组；弱候选默认折叠且不勾选。
- 未执行真实 provider 趣味性评估；模型以后只能补候选，不能自行把关系提升为 established。
