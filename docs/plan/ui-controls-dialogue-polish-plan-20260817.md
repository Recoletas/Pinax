# Pinax 控件减框与体验页对话呈现优化计划

> 状态：待执行
>
> 范围：主题2亮色；优先完成体验页，再迁移写作、素材和画布的高频控件。主题1只保留兼容，不参与本轮视觉设计。

**目标：** 建立一套克制、可复用的工作区控件层级，并在不改动叙事数据契约的前提下重做体验页对白阅读层级。

**实现边界：** 共享 CSS 负责按钮与命令组语义，页面组件负责布局，`experience-reading.css` 独占正文呈现；角色色调只消费已有可信 speaker 字段，不介入识别与持久化。

**技术栈：** Vue 3、主题 CSS tokens、Vitest 静态/纯函数契约、现有 Playwright UI audit。

## 1. 目标

本轮解决两个相互关联的问题：

1. 大量按钮、标签、分组和面板都依赖闭合边框表达层级，页面出现“每个东西都像按钮、每个按钮都像输入框”的视觉噪音。
2. 体验页的叙述、角色对白、玩家行动和系统状态虽然已经结构化，但视觉层级仍由零散规则控制，角色存在感、连续阅读和操作入口没有形成稳定秩序。

最终目标不是简单执行 `border: 0`，而是把边界从“每个控件一圈框”迁移到四种更清晰的信号：

- 排版：字号、字重、文字颜色和内容宽度；
- 节奏：间距、对齐、分组和留白；
- 状态：小面积色标、底线、淡背景或图标；
- 容器：一个区域最多保留一层必要的闭合边界。

## 2. 调研结论

### 2.1 当前代码根因

对体验页相关文件的静态盘点显示：

- `Experience.vue` 有 22 个按钮、约 142 处边框声明；
- `InputArea.vue` 有 19 个按钮、约 86 处边框声明；
- `NarrativeTurn.vue` 有 7 个按钮、约 16 处边框声明；
- `GamePanel.vue`、联机面板和状态组件又分别维护自己的按钮与边界规则；
- 全项目至少有 112 处 `action-btn / tool-btn / quick-btn / ghost-btn / icon-btn / tavern-btn` 等按钮类使用点。

这些数字不能直接作为删除指标，因为其中包含输入框和必要面板边界，但能说明当前样式不是由统一层级控制，而是多年局部覆盖累积出来的。

主要结构问题：

1. `src/styles/main.css` 仍保留通用 `.btn` 的圆角、背景和完整边框语法，同时把十余类按钮的文字颜色绑在同一个选择器组里。
2. `InputArea.vue` 自己定义快捷按钮、发送按钮、信息按钮、关闭按钮、角色列表按钮和弹窗标签页，局部样式数量过多。
3. `GamePanel.vue` 同时存在普通选择器和 `:deep()` 两套 narrative block 规则；当前主题2的阅读样式又由 `experience-reading.css` 接管，职责发生重叠。
4. `NarrativeTurn.vue` 的编辑按钮、消息操作菜单与正文排版放在同一个组件样式块中，交互 chrome 容易反过来影响阅读面。
5. 顶栏中的阅读节奏、索引、设定、会话信息和切换都以独立带框控件出现，缺少“导航 / 状态 / 命令”的视觉区分。

### 2.2 外部产品与规范启示

本轮只提炼交互原则，不复制平台皮肤：

- Apple 工具栏规范强调只常驻高频命令，窄空间将次要命令收入 More 菜单，并限制工具栏分组数量。[Apple Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- Apple 菜单规范强调按频率和逻辑分组，过长菜单应拆分，并优先让常用动作出现在前面。[Apple Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- 图标按钮的可点击边界可以大于可见图标，不需要依赖可见边框表达可点击性。[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- W3C WCAG 2.2 要求触控目标和间距可用；视觉去框不能缩小真实命中区域或删除焦点反馈。[WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- 本地 SillyTavern 的可借鉴点是“角色消息保持连续、消息操作默认低透明并在需要时出现”，而不是照搬头像气泡和半透明背景。

### 2.3 Pinax 的定位

四个定位问题的答案如下：

| 问题 | 决策 |
|---|---|
| 页面角色 | 体验页是沉浸式叙事阅读与行动工作面，不是聊天记录后台 |
| 观看距离 | 同时覆盖桌面长读和手机近距离阅读；正文优先级高于工具 |
| 视觉温度 | 安静、现代、略带档案与文化感；蓝白为底，少量低饱和异色信号 |
| 容量 | 长正文、连续对白、输入区和现场索引必须共存，不能靠增加卡片解决拥挤 |

因此本轮不采用常见 AI 聊天气泡、玻璃卡片、彩色圆角胶囊或大面积渐变。Pinax 的差异性继续来自纸面层次、等高线背景、小面积色条和编辑出版式排版。

## 3. 统一视觉契约

### 3.1 边框预算

每个局部区域遵循以下规则：

1. 一个工具栏可以有底部 hairline，但内部按钮默认无闭合边框。
2. 一个输入区可以有一层外边界，输入框、发送按钮和辅助图标不能再各套一圈同强度边框。
3. 一个弹窗或 sheet 可以有外边界，内部标签页使用文字、底线或色标，不再每个标签独立成框。
4. 列表项使用间距、分隔线和选中背景，默认不使用逐项卡片边框。
5. 只有系统通知、危险确认、显式选择器容器和真正独立的工具表面可以保留闭合框。

### 3.2 按钮语义层级

| 类型 | 使用场景 | 静止状态 | 激活/悬停 | 示例 |
|---|---|---|---|---|
| `primary` | 当前区域唯一主动作 | 小面积实色或高对比色块 | 轻微明度变化 | 发送、保存、确认生成 |
| `secondary` | 与主动作并列但优先级较低 | 淡背景，无闭合框或极弱 hairline | 背景增强 | 保存素材、应用修改 |
| `quiet` | 普通命令 | 透明，无边框 | 文字和淡背景变化 | 清空、查看、切换 |
| `icon` | 熟悉的工具命令 | 只有图标，命中区 32-44px | 图标色/淡底变化 | 设置、关闭、更多、撤销 |
| `toggle` | 模式与开关 | 透明文字/图标 | 2px 色标或淡背景，使用 `aria-pressed` | 对话模式、半自动 |
| `danger` | 破坏性动作 | 收进菜单，静止时不抢眼 | 聚焦后出现低饱和危险色 | 删除、离开房间 |

禁止继续使用“所有按钮同一圈 1px 蓝边，只靠文字不同”的做法。一个区域同时最多出现一个实色主按钮。

### 3.3 对话呈现契约

| 内容类型 | 呈现方式 | 禁止方式 |
|---|---|---|
| 叙述 | 连续正文、正常字重、稳定段距和首行缩进 | 每段卡片、色块、说话人标签 |
| 角色对白 | 角色切换处显示姓名与短色标；对白轻斜体或略深字重；同一角色连续对白合并视觉组 | 每句话单独气泡、所有对白可点击、整段蓝底 |
| 玩家行动 | 小型“主角/你”标签 + 略强字重或轻缩进；不做聊天气泡 | 大色块、与 NPC 对白完全同形 |
| 动作 | 正体或极轻斜体、弱化墨色，以段距区分 | 灰色框、整段括号化 |
| 心理 | 温和异色 + 轻斜体，只作为辅助层 | 与对白使用相同颜色和字重 |
| 系统/压缩/错误 | 允许使用一层淡背景、短色条或状态行 | 混入普通叙事排版、巨大警告卡 |

角色颜色只从 3-4 个低饱和主题 token 中稳定映射，用于姓名和 2-3px 色标，不染整段正文。未知发言者显示“未署名”或不显示姓名，不用颜色暗示错误身份。

## 4. 文件职责

### 新增

- `src/styles/workbench-controls.css`
  - 只定义主题2使用的控制 token、按钮层级、图标按钮、命令组和 segmented/toggle 语法。
  - 不定义页面布局，不覆盖正文排版。

- `src/services/experienceSpeakerTone.js`
  - 将可信 speaker ID/name 稳定映射为有限的视觉 tone；未知说话人返回 neutral。
  - 不参与角色识别，不修改消息数据。

- `src/__tests__/experienceSpeakerTone.test.js`
  - 覆盖稳定映射、未知说话人、空值和颜色数量上限。

- `src/__tests__/uiControlContract.test.js`
  - 静态检查主题2控件类、`:focus-visible`、coarse pointer 命中区和禁止 `transition: all` 的约束。

### 修改

- `src/components/theme/ThemeAssets.vue`
  - 主题2加载 `workbench-controls.css`，避免把新规则写进庞大的 `legacy.css`。

- `src/styles/themes/legacy.css`
  - 删除已经迁到共享控件层的体验页按钮覆盖，只保留 palette、surface 和主题特有状态。

- `src/styles/main.css`
  - 停止让全局 `.btn` 和巨型按钮选择器组影响主题2工作区；保留旧页面兼容范围。

- `src/pages/Experience.vue`
  - 顶栏、索引、速记、详情弹层改用统一控制语法；减少逐控件局部边框。

- `src/components/InputArea.vue`
  - 重排快捷命令、模式开关、输入框辅助动作和角色选择器；输入区只保留一层边界。

- `src/components/GamePanel.vue`
  - 删除已由 `experience-reading.css` 管理的重复 narrative 样式，只保留消息流布局和空状态。

- `src/components/experience/NarrativeTurn.vue`
  - 负责按 block 顺序计算连续 speaker 组，并传递 `speakerTone / speakerGroupStart / speakerGroupEnd`；同时管理玩家行动和消息操作 chrome，不再拥有正文类型样式。

- `src/components/experience/NarrativeBlock.vue`
  - 只消费 speaker tone 与连续组属性并输出 class/data 属性；正文结构不增加气泡容器。

- `src/styles/experience-reading.css`
  - 成为主题2唯一的叙述、对白、动作、心理、系统状态视觉 owner。

- `src/components/experience/NarrativeAgentStatus.vue`
- `src/components/experience/OnlineChatOverlay.vue`
- `src/components/experience/OnlineRoomPanel.vue`
  - 使用相同按钮层级和边框预算。

- `scripts/ui-audit.mjs`
  - 增加 dialogue-heavy、editing、error 和 online 状态；记录可见按钮类型、闭合边框和焦点可见性。

## 5. 分阶段实施

### U0：建立当前视觉基线与按钮清单

- [ ] 在现有服务可用时截取 `1440 / 1280 / 980 / 390` 四个宽度。
- [ ] 覆盖空会话、普通长文、连续多角色对白、玩家输入、编辑消息、生成中、错误、索引打开、速记打开和联机十种状态。
- [ ] 记录每个可见按钮的语义、常驻频率、是否有闭合边框、是否有重复入口。
- [ ] 标记“必须保留边框 / 应去框 / 应收进菜单 / 应改为 toggle / 应改为图标”的决策。
- [ ] 记录当前正文计算样式：font-family、font-size、line-height、font-weight、color、margin、padding、border、background。

验收：形成一张按钮语义清单和一组截图，不依据旧截图直接动代码。

### U1：建立共享控件语法

- [ ] 新建 `workbench-controls.css`，定义以下 token：

```css
.theme-legacy {
  --control-fg: var(--archive-ink-soft);
  --control-fg-strong: var(--archive-ink);
  --control-accent: var(--archive-olive-strong);
  --control-hover: color-mix(in srgb, var(--archive-olive) 8%, transparent);
  --control-active: color-mix(in srgb, var(--archive-olive) 12%, var(--archive-paper-soft));
  --control-danger: color-mix(in srgb, var(--archive-rose) 72%, var(--archive-ink));
  --control-focus: color-mix(in srgb, var(--archive-olive) 70%, transparent);
}
```

- [ ] 定义 `.control-primary / .control-secondary / .control-quiet / .control-icon / .control-toggle / .control-danger`，所有类型共享 disabled、focus-visible 和 coarse pointer 命中区。
- [ ] 定义 `.control-group`：组本身允许一个 hairline 或底边，子按钮不再逐个带框。
- [ ] 禁止 `transition: all`，只过渡 color、background、opacity 和 transform。
- [ ] 在 `ThemeAssets.vue` 中仅对当前主题2加载该文件。
- [ ] 新建 `src/__tests__/uiControlContract.test.js`，断言核心 class 存在，主要按钮、图标按钮、toggle 都有 `:focus-visible`，并防止重新引入 `transition: all`。

验收：控件原语可以单独使用，但此阶段不大规模迁移页面。

### U2：体验页顶部工具和现场索引减框

- [ ] 顶栏保留页面名与会话短名作为文字信息，不再做 chip 边框。
- [ ] “索引、设定”使用图标或图标+短文字的 quiet control；阅读节奏使用菜单，不显示独立矩形选择框。
- [ ] “切换会话”并入会话菜单，桌面和移动端使用同一命令 owner。
- [ ] 顶栏最多保留一条底部 hairline，不再让每个按钮各有一圈边框。
- [ ] 右侧索引 section 改成连续列表：section 之间用间距/hairline，展开项使用 2px 色标和轻背景。
- [ ] 数量与 `+N` 使用排版和小色标，不再分别做两个小框。
- [ ] “查看、速记、关闭”分别映射到 quiet/icon 类型；关闭按钮保持 44px 命中区但无常驻外框。

验收：顶栏第一眼是标题和当前会话，索引/设定是工具；索引栏第一眼是现场信息，不是卡片堆。

### U3：输入区和对话模式控件重构

- [ ] 输入区只保留一层整体边界，textarea 与右侧辅助动作共享同一 surface。
- [ ] “继续、场景、对话、心理”改成无闭合框的 command rail；高频“继续”保持第一位，但不与发送按钮争夺主 CTA。
- [ ] “对话模式、半自动”使用 `aria-pressed` toggle，激活态采用小色标或淡背景，不使用蓝框加蓝底双重强调。
- [ ] 发送是输入区唯一实色主按钮；停止生成在同一位置替换发送，避免布局跳动。
- [ ] 提示词详情和导演注改成现有 `WorkbenchIcon` 图标按钮，tooltip/aria-label 保留。
- [ ] API Key 提示改为单行状态 + quiet link，不使用虚线警告框。
- [ ] 角色选择器由卡片列表改为分隔列表；选中角色使用姓名、状态标记和轻背景，不逐项描边。
- [ ] 提示词详情弹窗的 tabs 使用底线/色标，弹窗内不再出现“外框 + tabs 框 + 内容框”三层嵌套。

验收：输入区任意状态下只有一个高对比主动作；模式开关能被识别，但不会像六个并列 CTA。

### U4：体验页叙事与对白重排

- [ ] 为 `NarrativeBlock` 增加 `speakerTone`、`speakerGroupStart`、`speakerGroupEnd` 展示属性；不改变持久化 schema。
- [ ] 同一 speaker 连续 block 只在组首显示姓名；说话人切换增加 0.8-1em 节奏，不增加气泡框。
- [ ] 叙述保持正文主轴，采用正常字重与稳定段距；取消重复 selector owner。
- [ ] 角色对白使用姓名 + 2-3px 色标 + 轻斜体/略深字重；正文颜色保持接近主墨色。
- [ ] 玩家回合使用小型“你/角色名”标签和轻微缩进，不做左右聊天气泡。
- [ ] 动作恢复正体或极弱斜体；心理使用另一低饱和 tone 和轻斜体；二者均无框。
- [ ] 系统、错误和“压缩完成”保留一层特殊状态表面，但尺寸收敛为状态行。
- [ ] 只有具有真实 `sourceRef` 的触发片段可点击；普通对白不出现详情 affordance。
- [ ] 消息编辑/删除/重写/切换版本收进一个 borderless more menu，桌面 hover/focus 出现，触屏点按当前回合出现。
- [ ] 编辑态使用一层明确编辑 surface，保存为 primary、取消为 quiet，移除按钮各自外框。

验收：遮住所有工具后仍能从排版识别叙述、玩家、不同角色对白、动作、心理和系统状态；恢复工具后也不破坏阅读流。

### U5：弹层、速记与联机控件统一

- [ ] 速记面板保留外层 sheet 边界，内部两栏靠标题、间距和分隔线组织，不再每栏再套卡。
- [ ] 批量动作只保留一个 primary，其余使用 quiet；破坏性操作进入更多菜单或 danger text。
- [ ] inline detail、NarrativeAgentStatus 和错误重试使用同一状态/命令语法。
- [ ] 联机聊天保持透明轻量；发送和折叠使用 input/icon control。
- [ ] 房间面板中的复制链接、离开、提案、接受等动作按频率和风险分层，离开默认不作为醒目红框常驻。
- [ ] 所有 modal/sheet 的关闭按钮统一图标、命中区、焦点和 Esc 行为。

验收：体验页所有浮层看起来属于同一产品，关闭、保存、取消、危险操作位置一致。

### U6：向其他核心工作区迁移

本阶段只迁移首屏和高频操作，不追求一次消灭全部旧类：

- [ ] 写作页：编辑器工具栏、查找替换、选区批注、检查器关闭/保存/采用。
- [ ] 素材页：主工具栏、批量选择条、插画/漫画入口和预览动作。
- [ ] 画布页：节点工具、视频生成入口、缩放和导出。
- [ ] 设定页：顶部导航、AI 生成/保存、列表行操作。
- [ ] 迁移后删除确认无调用的局部按钮 CSS；保留未迁移页面兼容规则。

验收：四个核心工作区的 primary、quiet、icon、toggle 和 danger 语义一致，不要求它们拥有完全相同的布局。

### U7：验证、清理与状态同步

- [ ] 扩展 `scripts/ui-audit.mjs` fixture，加入多角色连续对白、玩家行动、编辑态和错误态。
- [ ] 在 `1440 / 1280 / 980 / 390` 下运行体验、写作、素材、画布截图。
- [ ] 检查横向溢出、文本裁切、焦点不可见、触控目标、菜单遮挡和弹层滚动锁。
- [ ] 使用 computed style 记录体验页可见按钮中带闭合边框的元素，确保只剩主 CTA、输入 surface 和必要独立工具；不设置脱离语义的全站百分比指标。
- [ ] 检查 `prefers-reduced-motion`、键盘导航和 coarse pointer。
- [ ] 运行：

```bash
npm run verify:full
UI_AUDIT_ROUTES=experience,writing,materials,comics UI_AUDIT_WIDTHS=1440,980,390 npm run audit:ui
git diff --check
```

- [ ] 更新 `docs/STATUS.md`，记录完成阶段、剩余页面和真实设备问题。

## 6. 截图验收矩阵

| 页面/状态 | 1440 | 980 | 390 |
|---|---:|---:|---:|
| 体验空会话 | 必须 | 必须 | 必须 |
| 体验长叙述 | 必须 | 必须 | 必须 |
| 三角色连续对白 | 必须 | 必须 | 必须 |
| 玩家行动 + NPC 回应 | 必须 | 可选 | 必须 |
| 消息编辑/操作菜单 | 必须 | 可选 | 必须 |
| 输入区生成中/失败 | 必须 | 可选 | 必须 |
| 现场索引/速记 | 必须 | 必须 | 必须 |
| 联机聊天/房间信息 | 必须 | 可选 | 必须 |
| 写作/素材/画布主工作面 | 必须 | 可选 | 必须 |

每张截图按五个维度审核：

1. Pinax 视觉语言是否仍然成立；
2. 第一主内容和第一主动作是否明确；
3. 边框、间距、字体和颜色是否一致；
4. 所有控件是否真正有用且可达；
5. 是否重新滑向通用 SaaS、聊天气泡或 AI 渐变模板。

## 7. 完成标准

只有同时满足以下条件，本计划才算完成：

- 体验页顶部工具、输入区、索引和弹层不再表现为连续矩形按钮阵列；
- 一个局部区域不出现两层以上同强度闭合边框；
- 每个区域最多一个实色主按钮；
- 图标按钮无常驻边框，但焦点和 32-44px 命中区完整；
- 角色对白无气泡框，角色切换清晰，同角色连续发言不重复标签；
- 叙述、玩家、对白、动作、心理和系统状态可以仅靠排版层级区分；
- 普通对白不会错误显示可点击详情；
- 桌面、平板、移动端都无横向溢出、文本遮挡和操作菜单失联；
- 现有主题2蓝白档案语言、等高线背景和小面积异色色条得到保留；
- 核心测试、构建、文档构建和 UI audit 通过。

## 8. 明确不做

- 不把体验页改成微信式左右气泡聊天。
- 不重新开放主题切换，也不同时重设计主题1。
- 不为每种按钮创建一个 Vue 组件；首轮使用共享 CSS 语义，只有确有复杂行为的控件才组件化。
- 不为了“统一”把所有页面布局做成相同工具栏。
- 不用更多阴影、圆角、玻璃、渐变或装饰填补删框后的空白。
- 不改叙事 parser、角色识别、消息存储和 Agent 运行时；本轮只消费现有可信展示字段。

## 9. 建议提交顺序

1. `style(controls): establish workbench control hierarchy`
2. `style(experience): simplify toolbar and composer controls`
3. `style(experience): refine dialogue reading hierarchy`
4. `style(experience): align sheets and online controls`
5. `style(workspaces): migrate primary workbench controls`
6. `test(ui): close visual polish acceptance gates`

每个提交必须带对应桌面和 390px 截图；U4 对话呈现必须单独提交，便于在视觉方向不对时独立调整，而不回退按钮系统。
