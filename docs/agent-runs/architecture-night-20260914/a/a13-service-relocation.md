# A13 根层 service 归域(修正树重证明)

| 文件 | 处置 | 证据(37e0679 树) |
|---|---|---|
| writingAgentReferences.js | 删除(死代码) | 全仓零导入者;动态导入/字符串引用核查干净;自述服务的 Writing.vue getCopilotContext 已被 WritingContextCompiler 替代 |
| writingAgentContext.js | 删除(传递死代码) | 唯一导入者是已删 references;uiControlContract 中的同名仅为局部变量名(已排除误匹配) |
| writingSuggestion.js | 迁入 services/agents/authoring/ | 消费者 useWritingAgent + Authoring.vue,均 A 域 |
| writingSelectionCapture.js | 迁入 services/agents/authoring/ | 唯一消费者 Authoring.vue;内部 ./narrativeAssets 深度已修 |
| writingNotes.js | 迁入 services/agents/authoring/ | 唯一消费者 Authoring.vue;内部 useStorage 深度已修 |

注:两基线间这两文件确有改动(diff f8b7dd0 37e0679 存在),因此按指导在 37e0679 树重新执行了零消费者证明,未沿用旧分支结论。验证:全量 20/200、浏览器加载无错误。
