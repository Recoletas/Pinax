# A17 故障注入复核(修正树,合并入 host 用例 8–10)

| 故障 | 注入方式 | 断言 | 结果 |
|---|---|---|---|
| provider 迟到 + 作用域取消 | 持久 deferred mock;generate 在途时 agent.cancel('scope-change'),再 resolve | 无候选、不可见、requesting 复位 | ✓(用例 8) |
| surface 销毁 | editor.insertPlainText 抛 'surface destroyed' | 采纳返回 false、不消费、isAdoptionInFlight 复位、可再次采纳 | ✓(用例 9) |
| 采纳窗口互斥(重入) | insert 钩子内再次 commitAdoption | 内层被守卫返回 false,外层成功 | ✓(用例 10) |
| saver 失败(插入/保存拒绝) | 既有链:保存失败拒切 + authoringTask persist 失败回执 | 既有用例与 save-rescue 流覆盖,属持久化 owner 域,不在 host 重建 | 核对结论 |

说明:resolveLate 等待用 `vi.waitFor(() => expect(requestAdvisorTask).toHaveBeenCalled())`(计数断言跨用例累积,Once 会错位);mock 用后恢复默认实现,避免悬挂 once 污染后续用例。
