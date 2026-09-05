# P1.6 Gate 报告：世界档视觉层级与写作语义覆盖

日期：2026-08-30
状态：**P1 完成**（用户视觉验收通过，2026-08-29/30 两轮）
环境：Chromium（playwright），spike 独立入口 `prototype/map-spike/`
fixture：固定 seed `pinax-fixture-dense-12000-001`（真实生成，12,000 cells）
验收图：`map-p1-assets/light-world-base-1440.png`、`light-world-writing-1440.png`（同 seed 同机位，产品态）
失败证据：`map-p1-assets/p15-light-world-1440.png`（手写几何路径，已废弃，保留）

## 1. 本轮解决的问题（P1.6A 用户否决项 → P1.6B 交付）

| P1.6A 否决点 | P1.6B 交付 |
|---|---|
| 聚落/国名锚点漂在海色区域 | 落陆采样器：柔化后画布上按 `g-b+0.5(r-b)` 判陆/水，8 方向确定性内推；Gate 实测渲染后屏幕采样**落陆率 100%** |
| 国名与首都标签贴靠 | 规划器 per-candidate 碰撞边距 + 国名多候选锚点（最深点/深内陆质心/全陆质心，只动国名不动城市）；Gate 实测 **bbox 间隙 60.5px ≥ 8** |
| 浅海白色云团 | 烘焙时水体高光压缩（亮度 >168 向 168 半强），白边收窄、云团消解；完整海岸 token 留 P4 |
| 51 条河流毛细血管 | 河网按汇流树归并入海系统（干流=无父河流出海口），按系统流量取前 12 + **局部密度配额**（网格单格 ≤2 干流）；Gate 实测局部密度 max 2 |
| 柔化过度发糊 | 降采样 0.55x→0.8x、模糊减半；cell 格纹退为细纹理，大块地貌可辨 |
| base 态仍受写作上下文影响 | labelKind(地理等级) 与 overlayState(写作状态) 正交分离：**base 写作覆盖 0、writing 1**（地理首都承带引用计入 contextMarked，不占地理配额） |
| 硬编码 Gate | 全部真实测量：聚合 source 构造遍历、路线 feature 遍历、锚点屏幕采样审计、标签 bbox 间隙、局部密度网格、**base/writing 非语义像素差异 0**（整图逐像素对比，仅两个语义信号矩形豁免） |

## 2. 最终 Gate 读数（25 项全过）

```text
地形/几何:    terrainPresent ✓  land 10  rivers 51(矢量干流 12 系统)
聚合/路线:    numericClusters 0  visibleRoutes 0
密度上限:     国名 ≤3  首都/主城文字 4(3-6)  普通地点文字 0  上下文 marked 3(3-5)
语义覆盖:     base contextOverlay 0  writing contextOverlay 1  当前场 owner 1
标签质量:     重叠对 0  maxOverlapRatio 0  国名-首都间隙 60.5px  国名层级 16>12.5>11.5
锚点落陆:     base 100%  writing 100%
像素隔离:     非语义差异像素 0 / 1,186,560
页面健康:     pageErrors 0  无横向溢出  无 OL 默认控件  产品态无调试条
```

## 3. 架构决定（本轮沉淀）

1. **feature 几何存投影空间数据坐标**，不缓存屏幕像素——修复画布 resize 后全部标签漂移的真 bug；
2. **labelKind 与 overlayState 正交**——"为什么能显示"与"承担什么写作状态"分离；
3. **单一标签碰撞权威**（`map-label-plan.js` 纯函数）——地理名与上下文名同碰撞空间，OL declutter 不再启用；
4. **语义投影确定性绑定真实 feature**（`semantic-projection.js`）——当前场/章节引用/隐藏状态全部来自固定 seed 生成结果，不手摆坐标。

## 4. 遗留（已排期，不阻塞）

- P4 style pack：浅海完整 token、苔原/海面格纹材质、河流河口与支流样式、政治疆域层；
- P1.7：region/local LOD（次级河流/城市/聚落展开 + 缩放往返稳定性），本轮代码已预留 tier 迟滞与文字规则表。
