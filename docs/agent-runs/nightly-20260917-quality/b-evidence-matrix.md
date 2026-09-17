# N-B 证据采纳矩阵（NB02）

核实时间：2026-09-17 22:40–23:10（本机 WebFetch）。规则：JS 渲染拿不到正文的来源记「未完成深核」，不以通识冒充已审。

| 来源 | 状态 | 关键证据 | Pinax 采纳 | 不适用/未采纳 | 验收钩子 |
| --- | --- | --- | --- | --- | --- |
| Fluent 2 Button usage（一手复核 ✓） | 已深核 | 单一 primary；次要动作降权；标签=下一个动作（动词+宾语）；Close≠Cancel（错误页不用 OK）；禁用须解释原因；文字 4.5:1 / 图标 3:1 | NB04 对比度批次；后续标签文案审查的判据 | Split/Compound button 组件不引入 | 普查 contrast=0 |
| IBM Carbon Button usage（本次完整拿到 ✓，修复上夜超时） | 已深核 | primary 每屏一个（临时流例外）；secondary 只与 primary 配对；ghost 用于工具条补充动作；图标按钮须 tooltip、危险动作禁纯图标；组内同宽；加载内联 | 工具条家族审查判据（NB06/07）；「记入/收进稿件」等具体标签原则 | Fluid 对齐、Tearsheet 模式不适用 | NB06 家族矩阵 |
| W3C WCAG 2.4.7 Focus Visible + WAI Forms Labels（✓） | 已深核 | 焦点必须可见（F78 失败=去 focus outline）；label 包裹即可命名；图文按钮用 alt | 普查按此口径判定 unnamed；codex 触发器重构保留可见焦点 | 2.4.13 Focus Appearance 为 AAA，不作硬门禁 | ui-controls-audit named 检查 |
| Apple HIG（toolbars/buttons） | 未完成深核 | 页面 JS 渲染，WebFetch 仅得导航壳 | 不引用；改用 Carbon/WCAG 侧等效结论 | — | 白天可重试 |
| Google Material 3（buttons guidelines） | 未完成深核 | 同上 | 不引用 | 触屏 44px 目标沿用既有原语 | 白天可重试 |
| Notion / Linear 文档 | 未审 | 未拉取 | — | — | — |

深核 ≥3 达标（Fluent、Carbon、W3C）。
