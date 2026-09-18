# N-B 全入口审查清单（NB01）

自动普查：`node scripts/ui-controls-audit.mjs`（12 路由 × 1440/390 × 亮/暗，axe serious/critical + 无名控件 + 嵌套交互 + 计数）。
基线报告：/tmp/pinax-ui-controls-audit/report.md（修复前 20 条违规记录保留在 git 历史 8a035af^ 的运行输出）。

| 入口 | 桌面 | 窄屏 | 暗色 | 键盘 | 状态 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 首页/书架 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（tabs 嵌套/aria 子女） | 无 serious 残留 |
| 体验/跑团 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（hero 对比度、codex 嵌套）+ 上夜 a11y 2/2 | 无 serious 残留 |
| 世界书首页 | ✓扫 | ✓扫 | ✓扫 | ✓ | S0 已修（select-name） | 无 serious 残留 |
| 创建工作区 | ✓扫 | ✓扫 | ✓扫 | ✓ | S0 已修（file/paste/名称标签） | 无 serious 残留 |
| 高级世界书 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（kicker/标签对比度、组 selects） | 无 serious 残留 |
| 结构化设定 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（hint 对比度、dark p） | 无 serious 残留 |
| 地图 | ✓扫 | ✓扫 | ✓扫 | ✓ | tabs 家族修复覆盖 | 无 serious 残留 |
| 创作工作区 | ✓扫 | ✓扫 | ✓扫 | ✓ | tabs 家族修复覆盖 | 无 serious 残留 |
| 素材/速记 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（modes active、empty 对比度） | 无 serious 残留 |
| 画布/散文 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（eyebrow/region/empty/no-selection/timeline、topic 输入） | 无 serious 残留 |
| 漫画 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（两个 textarea 标签） | 无 serious 残留 |
| 文档 | ✓扫 | ✓扫 | ✓扫 | ✓ | S1 已修（chapter caption 暗色） | 无 serious 残留 |
| 弹层/菜单 | 部分 | 部分 | ✓ | 部分 | 走查状态（连续导航）下 axe 覆盖；逐弹层人工深查未做 → not-run | 下一窗口 |
| 联机兼容页 | not-run | not-run | not-run | not-run | 需要房间上下文 | 下一窗口 |

最终普查（全部修复后）：serious/critical = 0（12×2×2 全矩阵）。
