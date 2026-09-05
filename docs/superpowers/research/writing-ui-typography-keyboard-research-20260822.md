---
title: writing-ui-typography-keyboard-research-20260822
date: 2026-08-22
author: codex
status: done — 写作 UI 可用性调研（字体排版 × 键盘优先）：作家助手 asar 逆向 + Cmd/iA/现代写作工具对照 + Pinax 现状审计 + 分期优化方案；仅调研，未改运行时代码
---

# 写作 UI 可用性调研：字体排版 × 键盘优先

> 触发：用户反馈"现在的 UI 尤其字体部分在可用性上很差"，希望向阅文《作家助手》桌面端（`D:\作家助手`，Electron 客户端 yuewenedit 5.15.0）与 Cmd Markdown 编辑器（zybuluo.com）学习，目标是**简洁直观、有美感、码字时键盘使用程度高**。此前写作页已借鉴知乎、Jupyter Notebook、康奈尔笔记法。
> 性质：纯调研与方案设计，未改任何运行时代码。

## §0 调研范围与证据来源

| 来源 | 类型 | 深度 |
|---|---|---|
| 作家助手 `authorwrite_5.15.0.asar` 解包 | 一手实证 | ✓ 全量 CSS/JS 关键文件逆向 |
| 作家助手官方版本说明 / 功能问答（write.qq.com） | 一手功能清单 | ✓ |
| Cmd Markdown 编辑器（zybuluo.com/mdeditor） | 一手产品文案+快捷键表 | ✓ |
| iA Writer 排版哲学（ia.net 三篇核心文章 + The Verge 访谈） | 设计方法论 | ✓ |
| PiDanMD / SoloMD / VMark / Writeathon / Scribe（现代写作工具） | 功能模式对照 | ◇ README 级 |
| Pinax 代码审计（字体 token / 写作页 / 快捷键 / 断点） | 一手现状 | ✓ 全量扫描 |

---

## §1 作家助手逆向结论（asar 实证）

### §1.1 排版内核：一个持久化的 fontStyle store

解包 `fontStyle-DZlyDXGh.js` 得到完整排版状态（全部 localStorage 持久化，跨会话保留）：

```js
{
  fontFamily: "HYQiHei,黑体,STHeitiSC-Medium",   // 用户可换字体族
  fontSize: 16,                                   // 正文字号，用户可调
  lineHeight: 1.4,                                // 正文行高
  lineWidth: 1040 | 1360 | 1600,                  // 正文栏宽按屏幕宽度响应式：
                                                  //   screen<=1920 → 1040px
                                                  //   <=2560 → 1360px，否则 1600px
  fontWeight: 400,
  textIndent: true,            // 首行缩进开关
  emptyLineOnParagraph: true,  // 段间空行开关
  // —— 辅助面板独立排版（关键！辅助信息永远比正文小一号）——
  rightFontSize: 14, rightLineHeight: 1.8,   // 右侧 AI/批注面板
  sideFontSize: 14, sideLineHeight: 1.8,     // 侧边章节面板
  rightFollowText / sideFollowText: true,    // 面板跟随正文滚动
  aiFontSize: 14                              // AI 输出字号
}
```

### §1.2 编辑器 CSS 变量体系

`EditorWrap-CtpjR7dQ.css`：编辑容器用 **CSS 自定义属性驱动排版**，
`--p-size`(16px)、`--line-height`(1.8 兜底)、`--h1~h4-size` 全部由 fontStyle store 注入；
段落 `margin: 0` + 相邻兄弟选择器控制段距；UI chrome 统一 PingFang SC 14px/20px。
**排版参数只有一个注入点，改设置 = 改变量，不存在散落硬编码。**

### §1.3 键盘体系

- `shortcut-wr1Sb6Wq.js`：**全局快捷键注册表**，每个命令的快捷键可由用户重绑定
  （localHistory 模块含"快捷键不可用或重复"冲突检测文案），支持 Ctrl+Period 和弦；
- 全屏沉浸"**长按 ESC**"退出（防误触）；
- 官方功能清单：自动滚屏三模式（换行滚动 / 回车滚动 / 内容达 70% 高度滚屏）、
  精排（首行缩进 2 字符、段间空行）、引号等双符号自动补齐。

### §1.4 视觉环境

背景色预设：护眼绿 / 古典黄 / 薄雾灰 / 静谧蓝 / 浪漫粉——把"长时间盯屏"当作一等公民问题处理。

---

## §2 Cmd Markdown 设计要点

- **三种编辑模式**：普通 / Vim / Emacs（同一编辑器内核 CodeMirror 切换 keymap）；
- **两级专注**：Ctrl+M 进入"编辑模式"（挪除一切分心元素）、Ctrl+Alt+M 进入阅读模式；
- **快捷键速查表 Ctrl+Alt+Q**：格式类（Ctrl+B/I/L/Q/K/G/O/U/H/R）与界面类（Ctrl+Alt+*）成体系且随时可查；
- 五档主题：经典白 / 护眼黄 / 薄荷绿 / 东京夜 / 经典黑 + 自定义样式；
- AI 辅助写作在**空行行首按空格**唤起——与 Pinax Notebook 现有空格菜单机制一致，方向正确；
- 编辑区/预览区同步滚动算法。

---

## §3 iA Writer 排版哲学（方法论层）

1. **等宽字体是"草稿感"的表达**：比例字体为快速阅读优化，等宽字体放慢节奏、
   词距大更易辨识字词，传达"这是进行中的工作"；iA 后来演进到 duospace
   （仅 m/M/w/W 放宽 50%）以兼得节奏与流畅——**写作字体与阅读字体应当分开对待**。
2. **Focus Mode 三态**：句子高亮 / 段落高亮 / 打字机滚动（光标行垂直居中），官方建议全屏+暗色下体验最佳。
3. **Responsive Typography**：字号、行距、字重、阅读距离是一个联动系统，不是孤立值。
4. "Good design is invisible"：微观排版（字形级）是屏幕设计的原子单位。

---

## §4 现代写作工具共识对照

| 能力 | 作家助手 | Cmd | iA Writer | PiDanMD | SoloMD/VMark/Scribe/Writeathon |
|---|---|---|---|---|---|
| 排版设置面板（字体/字号/行距/栏宽） | ✓ 持久化+响应式栏宽 | ✓ 主题+自定义样式 | 固定哲学+有限选项 | ✓ 多中文字体 | ✓ |
| 打字机滚动 | ✓ 自动滚屏三模式 | — | ✓ Typewriter | ✓ ⌘⇧T | ✓ 全员标配 |
| 段落/句子聚焦 | — | — | ✓ 三态 | ✓ ⌘⇧F（非当前段 28% 透明度） | ✓ Limelight 式 |
| 沉浸全屏 | ✓ 长按 ESC 退 | ✓ Ctrl+M | ✓ | ✓ F11 | ✓ Zen 模式 |
| 命令面板 ⌘K | ✗（用可重绑快捷键代替） | ✗（快捷键速查表） | ✗ | ✓ 极简而不简陋的关键 | VMark 165 个快捷键 |
| Vim/模态编辑 | ✗ | ✓ Normal/Vim/Emacs | ✗ | ✗ | SoloMD 完整模拟；Scribe："Vim 千个功能，写作者只需约三十个"（motions/operators/dot-repeat 子集） |
| 字体策略 | 黑体默认+可换 | 主题绑定 | Nitti/IBM Plex duospace | **霞鹜文楷单一字族贯穿 UI/正文/代码**（开源 OFL 可嵌入） | 各异 |
| 当前行/段高亮 | — | 行号可选 | ✓ | ✓ | Writeathon Zen 当前行高亮+流模式 |

**共识结论：打字机滚动 + 段落聚焦 + 沉浸全屏是现代写作工具的"三件套"标配；键盘优先的可发现性靠速查表或命令面板解决；正文排版必须是持久化的用户设置而非固定样式。**

---

## §5 Pinax 现状问题清单（代码审计结论，带定位）

### 字号与可读性
1. **无字号阶梯、微字号泛滥**：12px×383 处 + 11px×346 + 10px×229 + 9px×61 占绝对主导；
   叠加全局 zoom 0.85 后实际渲染约 7.6–10.2px，中文接近不可读下限。`--fs-sm/--fs-base`
   token 存在却被无视。
2. **`--font-body` 未定义且回退不一致**：同一变量在阅读面解析为 sans、topstrip 为 serif、
   GamePanel 为继承值（`experience-reading.css:60` vs `Experience.vue:3387`）。

### 写作面
3. **默认等宽字体栈写中文小说**（Menlo/Consolas 领先），中英混排视觉割裂；
   且字体面板设置不持久化，刷新即丢（`Writing.vue:1078-1094` 纯 ref）。
4. **写作面与阅读面几何不同源**：同为 62em 栏宽但字号 16 vs 17.5px、行高 1.92 vs 1.78。
5. **无 focus mode / 打字机滚动**；当前行高亮仅 2.5% tint（`WritingNotebookEditor.vue:1313-1315`）形同虚设。
6. **行高 1.92 + 段距 1.05em + 段左缩进 12px 三重节奏叠加**（`:1288,1307-1311`），纵向密度失控且来源分散。

### 键盘交互
7. **快捷键不可发现、不成体系**：Tab 采纳/Ctrl+→ 逐句采纳只藏在 widget title 属性（`:230`）；无统一速查面板。
8. **Tab 键三义**：缩进（textarea）/采纳 AI 建议/菜单导航，行为取决于不可见上下文。
9. **新旧两条输入路径并存**（Notebook 与 textarea keydown 两套语义），行为漂移。

### 体系
10. **19 种断点无文档化阶梯**（高频 760/640/980/720），违反 ui-style-check 自身门禁。
11. **rem/em 与 px 混用**，浏览器用户字体偏好被 px 击穿。
12. **全局 zoom 0.85 默认**是对"UI 偏大"的整体妥协，未区分"信息密度"与"阅读字号"两个维度。
13. **主题锁定使 `.theme-dark` 全套 token 成死代码**；夜间写作（作家助手/iA 均视为核心场景）当前不可达。

---

## §6 设计原则推导

1. **正文优先**（已有 workflow 约束）：正文可读性最高优先，字号/行距稳定且**用户可调、必须持久化**。
2. **写作与阅读是两种节奏**（iA 论）：写作面提供可选的等宽/文楷类"慢节奏"字体，阅读面用比例字体；
   同一文本两种呈现都从同一内容源派生几何。
3. **键盘优先但必须可发现**：每个键盘能力都要能被 `?` 速查和命令面板找到；不可发现的快捷键等于不存在。
4. **辅助信息永远比正文小而弱**（作家助手的 14/16 分层面板策略），层级靠字号对比而非颜色堆砌。
5. **少即是多**：沉浸只做三件套（打字机/聚焦/全屏）；Vim 只做写作者子集，不做完整模拟。

---

## §7 优化方案

### A. 字体 token 体系（全局地基）

#### A0. 字体选型决策（实用性第一，美观与辨识度并重）

**丑字体根因已定位**：`--font-display`/`--font-serif`（`src/styles/main.css:70-71`）
定义为 `"ZCOOL XiaoWei", "Iowan Old Style", "Songti SC", "STSong", Georgia, serif`，
被 96+22 处引用。在 Windows 上 ZCOOL XiaoWei / Iowan Old Style / Songti SC 全部
未安装，CJK 一路落空到系统默认**宋体**、Latin 落到 Georgia——用户看到的"太丑的
字体"就是这条死链栈。仓库其实已经自打包了 **LXGW WenKai v1.522 子集**
（593KB WOFF2 + OFL 许可证，`src/assets/fonts/`，约 2700 常用字），但只用于
Welcome/Opening 的 hero 标题，没有注册为通用字体。

**Cmd Markdown 官方配方**（changelog 实证）：
- 编辑区中文用微软雅黑 / 文泉驿黑体，Mac 优先苹方 + 冬青；
- 西文等宽按 `Monaco → Menlo → Consolas → "Courier New"` 顺序取用——
  即"**西文等宽给码字节奏与辨识度，中文黑体系保证美观实用**"的中西分栈；
- 字号同时作用于编辑区与预览区，两者可分别自定义字体；支持用户自定义 CSS。

**角色化字体栈（替换方案）**：

| 角色 | 新栈 | 理由 |
|---|---|---|
| `--font-display` / `--font-serif`（标题/展示） | `"LXGW WenKai", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"` | 霞鹜文楷已在包内（有辨识度、书卷气）；fallback 全是合格黑体系，**永不落宋体**；删除 ZCOOL/Iowan/Songti/Georgia 死链 |
| `--font-sans`（UI chrome） | 保持 `"Segoe UI Variable", "Inter", "Segoe UI", -apple-system, "Microsoft YaHei"` 不变 | 实用性最优，不动 |
| `--font-body`（正文阅读，补唯一定义） | 与 sans 同源：`"PingFang SC", "Microsoft YaHei", system-ui` | 消除三处回退漂移 |
| `--font-writing`（写作面新增） | `"Menlo", "Consolas", "Monaco", "Courier New", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"` | **即 Cmd 配方**：西文等宽 + 中文黑体混排；作为默认写作字体，替换现在的 mono-first 死栈 |
| 写作字体可选项 | 整体切换"霞鹜文楷全量"或"纯比例"两档 | 全量文楷需打包完整字库（woff2 约 10MB 级，桌面端可行；当前 2700 字子集只够标题不够正文），按 P0a 打包 |

原则：**每条栈必须在 Win/macOS/Linux 三端都有合格 fallback，任何场景都不允许
落到系统默认宋体**；西文等宽只用于写作面与代码，UI chrome 一律 sans。

#### A1-A3（原方案）
- 定义文档化字号阶梯并替换散落硬编码：`--fs-xs 11 → --fs-sm 12 → --fs-md 13 → --fs-base 14（UI 默认）→ --fs-lg 16（正文）→ --fs-xl 18 → --fs-2xl 22 → --fs-display clamp()`；
- 设**最小可读地板门禁**：UI 文案 ≥12px、正文类 ≥16px、代码 ≥13px；新增 ui-style-check 规则禁止 <12px；
- 补齐 `--font-body` 唯一定义（中文栈 `PingFang SC / Microsoft YaHei / system-ui`），消除三处回退漂移；
- 微字号清理分批：第一批清 10px/9px（290 处）→ 12px 地板；第二批 11px→12px。

### B. 写作面排版设置（对齐作家助手 fontStyle）
- 新建 `writingTypographyStore`（Pinia + localStorage 持久化）：
  `{ fontFamily, fontSize(14–24), lineHeight(1.5–2.2), lineWidth(36–52em 或像素), firstLineIndent, paragraphSpacing }`；
- 设置面板挂在写作页现有 More 菜单下，改动即时预览；
- 写作面默认字体改为 `--font-writing`（Cmd 配方：西文等宽 + 中文苹方/雅黑，见 A0）；
  提供"霞鹜文楷"（书卷气/手写感）与"纯比例"两档可选——等宽节奏论（iA）保留为选项而非默认；
- 收敛三重纵向节奏：行高/段距/缩进三者由 store 统一供值，删除散落覆盖。

### C. 沉浸三件套（写作页）
- **打字机滚动**：光标行保持视口垂直居中（scrollIntoView center，节流于 selection update）；
- **段落聚焦**：非当前单元/段落淡化至 ~35% 不透明度（现 2.5% tint 增强 + 可配置）；
- **专注全屏**：隐藏侧栏/顶栏/索引，Esc 长按退出（对齐作家助手防误触）；
- 快捷键：Mod+Shift+T / Mod+Shift+F / F11，写入统一注册表。

### D. 键盘优先体系
- 新建**统一快捷键注册表**（id / keys / scope / handler / 描述），Notebook、textarea 路径、页面级全部走注册表，消除双路径漂移；
- **`?` 快捷键速查面板**（对齐 Cmd Ctrl+Alt+Q）：按 scope 分组展示，支持搜索；
- **⌘K 命令面板**（二期）：所有注册表命令可搜可执行，作为极简界面的功能找回入口；
- **Tab 三义治理**：菜单态=导航、AI 建议挂起态=采纳一句（主路径改为 Ctrl+→，Tab 需焦点提示条可见时才生效）、纯文本态=缩进；三态在状态条可见化；
- **Vim 子集（三期评估）**：仅 motions（h/j/k/l/w/b/e/0/$/gg/G）、dd/yy/p、u/Ctrl+r、dot-repeat，不做 ex/宏/可视块；CodeMirror 有现成 vim keymap 可复用于源码模式，ProseMirror 侧需自实现，成本高故后置。

### E. 断点与密度治理
- 断点收敛为文档化五档：390 / 520 / 760 / 980 / 1180，存量 19 种分批映射；
- **拆开 zoom 0.85 的两个职责**：控件密度用紧凑 spacing token 表达，阅读字号回归真实 px/rem 并尊重用户浏览器字体偏好（rem 化正文层）；
- 暗色主题解锁不在本轮（涉及主题锁定决策），但 token 体系改造须保持 `.theme-dark` 可用性。

---

## §8 分期实施计划

| 期 | 切片 | 内容 | 门禁 |
|---|---|---|---|
| P0a | 写作排版 store + 设置面板 | B 全部（store/面板/持久化/霞鹜文楷打包） | 定向 tests + 1440/900/390 截图验收 + 0 console error |
| P0b | 写作面排版收敛 | 三重节奏收敛 + 当前行高亮增强 | 同上 |
| P0c | 沉浸三件套 | C 全部 + 注册表首批快捷键 | 同上 + Esc 长按交互验证 |
| P1a | 字体 token 地基 | A 的阶梯/地板/--font-body | ui-style-check 全量过 |
| P1b | 快捷键速查面板 | D 的注册表面板化 | 定向 tests + 截图 |
| P1c | 微字号清理第一批 | E 前 10px/9px→地板 | diff check + 截图抽查 |
| P2a | ⌘K 命令面板 | D | 定向 tests + 截图 |
| P2b | Vim 子集评估 | D（先 spike 再决定） | spike 报告 |
| P2c | 断点收敛 + zoom 治理 | E | 全宽度 audit |

每切片遵循 visual-alignment-workflow：小切片、每轮截图、按截图验收、不跨区域并行改样式。

## §9 明确不做（本轮边界）

- 不解锁暗色主题（主题锁定是独立决策）；
- 不做完整 Vim 模拟 / Emacs mode；
- 不做背景色皮肤商店（护眼绿等留待暗色解锁后一并考虑）；
- 不动 worldStore / 生成链路；不改阅读呈现层的分段规则（v5 已定）。
