# Authoring C1 最终页面证据

2026-08-31 的 C1-7 只保留以下三张真实 Authoring 页面证据；均由隔离 fixture 和浏览器内确定性 provider 生成，不含用户项目数据。

- [`c1-scene-reference-1440.png`](./c1-scene-reference-1440.png)：当前场同时展示世界书地点、人物、三种意图与两条“本次参考”。
- [`c1-ghost-context-1440.png`](./c1-ghost-context-1440.png)：目标 writingUnit 下方的可编辑非正文 Ghost，以及生成后“实际参考”。
- [`c1-scene-sheet-390.png`](./c1-scene-sheet-390.png)：移动端右侧详情降为底部 sheet，“本次参考”可独立滚动到达。

可重复 Gate：

```bash
BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-c1-final-audit.mjs
```

Gate 还覆盖 1024 覆盖层、左右工具区域固定、详情开关前后的正文 `scrollTop` 与 selection、Ghost/正文内容轴、44px 逻辑触控高度、零横向滚动以及 page/console error。运行报告写入忽略的 `tmp/authoring-rollout/c1-final/report.json`。
