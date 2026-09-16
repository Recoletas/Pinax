# 首页工作台设计 · 2026-09-16

状态：第二轮实施，用户视觉确认待定。首轮书卡虽然功能通过，用户否定其专业度；不能以测试通过代替设计验收。
更新：用户已认可第二轮首页，现作为其他页面的统一基准。

## 跨页面统一（2026-09-16）

- 全局只保留一条浏览器式标签栏；原 Pinax / 当前模块 mast 移除，导航菜单、设置与异常存储提示并入标签栏末端。
- Authoring 不再重复列出全部书稿。顶部标签/首页承担换书，现有目录承担换章，新建书稿仍在目录和更多菜单可达；正文内章节标题仍可编辑。
- 设定、地图、高级条目共用资料选择与分区按钮样式。关联资料不是另一本书，不移除其身份；项目模式仍禁止在这里换绑。
- 结构化设定使用左侧目录和右侧唯一分区标题、明确字段输入边界。移除重复 PROJECT/CURRENT SECTION、装饰纹理与总是显示的自动保存宣传，不更改真实字段状态、AI 草稿/审阅或写入 owner。
- 素材、漫画、画布共享公共工具条/索引样式；未重写各自业务工作区或画布坐标。正文与专业媒体编辑器保持原有排版能力。
- 验收补充：`scripts/workspace-consistency-smoke.mjs` 覆盖字段保存/刷新、四分区、导航、移动章节目录及三类页面；已有 settings-linkage Gate 验证项目归属/回程/失效。本轮不运行真实模型。

## 参考与边界

主要参考为用户提供的作家助手桌面截图：常驻首页标签、可关闭作品标签、左侧分组导航、带图标的快捷操作和作品封面书架。上一轮 [Atticus 官方指南](https://www.atticus.io/quick-start-guide/)只用于验证书库搜索、排序、视图切换路径。未复制商业截图、广告、签到、积分或第三方封面。

桌面为工具入口，不是宣传页：244px 逻辑侧栏 + 连续主工作面；书卡 2:3，书名与数据为真实文本。手机为 Pinax 适配而非参考产品已验证行为：常驻首页与当前标签、折叠导航、双列快捷操作与书卡。

## 交互合同

- 首页是不可关闭的常驻标签；既有作品标签继续由 workspaceTabsStore 管理，按项目/页面去重。首页不写入作品标签持久化表。
- URL 决定高亮；回首页清除作品活动焦点但不删除标签。关闭后台作品标签不离开首页，关闭最后一个活动作品回首页。Enter/Space 激活，方向键移动焦点。
- 标签不复制编辑器或正文；离页保存、章节恢复继续使用已有 Authoring owner。浏览器门禁覆盖刚输入后立即回首页再回作品。
- 左栏项目工具明确选择所属作品并携带 bookId；空库禁用项目工具。跑团和联机是既有独立入口，联机标注试验。视频没有独立正式工作区，不虚构入口。
- 新建/导入复用原入口与首次指引；新建附简短下拉，Escape 关闭并回到触发器。没有虚构的模板中心、统计或回收站。
- 搜索、排序、视图切换不写作品。备份/记忆/模型设置复用原设置弹窗。
- 更详细数据库工作推迟，未在本轮启动或调度夜间任务。

## 默认封面资产

资产：`public/pinax-cover-fold.png`。使用内置 imagegen 生成，非第三方素材复制。书名由 Vue 覆盖，图像没有固定文字；封面的固定深色与象牙色属于图像美术，不随界面明暗主题反转。

生成提示词（实际调用）：

> Use case: logo-brand. Asset type: original default book cover background for Pinax, a professional Chinese novelist writing desktop app. Create a premium editorial book cover art, vertical 2:3 composition, flat front cover only, no book mockup, no desk, no outside margin. Deep ink navy and muted mineral blue matte paper. In the LOWER TWO THIRDS an oversized sophisticated sculptural ivory paper ribbon folds into an abstract capital P shape, reminiscent of a turning page. Integrate the folded shape into the cover composition, NOT a small app icon, NO black rounded-square badge. Subtle paper grain, controlled embossing, elegant directional soft light, quiet literary publishing design. The TOP THIRD must be clean dark navy negative space for real dynamic Chinese book titles to be overlaid in the app. No text, no lettering, no logos, no watermark, no borders. Avoid cartoon, shiny plastic, stock 3D app icon, neon, excessive ornament.

图标复用已安装的 `lucide-vue-next`（ISC）与 WorkbenchIcon，不新增手绘图标库或菜单状态框架。封面上传/选择尚未加入，本轮仅替换默认封面。

## 验收

`node scripts/welcome-library-smoke.mjs`：空库、多书、长书名、搜索/无结果/焦点、排序、两种视图、数据不变、刷新、标签往返保存、后台关闭、项目工具作用域、菜单及手机导航。完整门禁为 `npm run verify:full`，维持 20 文件/200 用例预算。

截图位于 `/tmp/pinax-home-v2-desktop.png`、`/tmp/pinax-home-v2-mobile.png`、`/tmp/pinax-home-v2-mobile-nav.png`；正式回执见 STATUS/LOG。

本轮不需要新规则：现有 ui-style-check 已要求参考合同及视觉验收，重点是执行而非继续堆规范。
# 2026-09-16 工作区一致性与切页修订

用户继续指出页面不协调、标签与切换奇怪、设定右侧空白。定位为桌面生产工具工作区而非展示页，保留手机布局；蓝白档案语言不变。硬约束：设定填满可用宽度；标签激活不改变相邻标签尺寸；当前标签可见；切页不播放旧侧栏方向动画；工作条/按钮共享尺寸；素材不叠加胶带/稿纸/斜纹；正文、画布坐标、保存和路由归属不变。

原因与修改：设定 `max-width:1140px` 叠加应用 85% 缩放留下右空区，现解除；AppShell 原 `out-in` 先退旧页再进新页且按旧活动栏方向滑动，与标签语义冲突，现直接替换 RouterView，不用 KeepAlive 改写生命周期。标签固定桌面宽度、统一高度与分隔，保留完整书名/模块提示，激活后滚入视口但不抢正文焦点；全部标签用下拉箭头。先查看标签/设定切片再处理媒体表面：共享工具栏尺度，素材移除胶带/横线/厚影/底层 Folio 斜纹，漫画解除额外窄列，文档保留阅读行长但侧栏/头栏与工作台统一。写作正文行宽和画布坐标不被全局强行拉满。

这不是所有深层编辑器的完成声明：地图、运行时体验与联机内部面板未逐页重构。修的是共用导航与当前创作工作区的可见不一致。无需新规则，落实已有跨页视觉与实际容量检查。

# 2026-09-16 设定密度与控件精修

用户继续否定长文首版的空旷与粗糙，上一轮不能视为视觉验收。本轮为扫描与编辑并重的桌面工具面，保持蓝白档案主题，手机重新排布。先用实际短文和空字段做 CSS 切片 `/tmp/pinax-settings-density-prototype.png` 并查看，再扩展控件。

调研证据：

- [Dabble 官方界面导览](https://www.dabblewriter.com/docs/getting-started/tour-of-the-interface)：左侧文件树与筛选、中间编辑、顶部常用操作、底部状态各自承担明确职责；手机侧栏另行适配。继承导航/动作/正文的信息分工，不复制其全部功能。
- [Novelcrafter 官方 Codex](https://www.novelcrafter.com/features/codex)：区分长文详情、短属性、标签和引用。已实际查看其官方 Elysia 示例截图；短属性使用横向标签和值，长文单独占行。继承按内容类型分配空间，不复制头像、品牌或商业代码，不恢复用户已拒绝的长文框。
- 上轮 Notion 参考仍只支撑连续编辑，不再以「移除边框」作为美观完成标准。

七条约束：正文靠近目录；短内容不强制大空白；分区图标/已填写数量/本节内容构成目录层级；批量操作位于标题区；单项按钮统一尺寸/hover/focus/disabled；真实保存状态与字数共用一行；长文保留 Autosize 无内滚。世界书条目与模型协议不变；新增搜索只读本地已载入的分区名称、字段名称和正文，跨分区跳转后聚焦，不调用模型、不产生写入。移动端保留查找和分区行，短属性改回纵向，按钮扩大触控区。原生输入/撤销边界不变。

空白由紧凑布局解决，不添加虚构指标或装饰。分区计数只代表非空字段数，不代表已保存或质量完成度。字段脚注不再为 pristine 标签项预留空状态行。未改数据库，也未把兼容结构化角色字段替换成第二套人物库。

不需要新规则：本次是在执行既有密度随任务变化、真实容量和视觉截图要求。

# 2026-09-16 设定长文与文档标签修订

用户否定上一轮设定卡片：组合测试通过不代表视觉验收通过。本轮不需要新规则，落实既有「容量检查、连续工作面、真实长文截图」要求。

参考证据：[Notion 官方编辑说明](https://www.notion.com/help/writing-and-editing-basics)确认页面正文、标题、目录和可调页面宽度；本轮借鉴连续文档结构，不宣称复刻其块编辑器。实现直接依赖 MIT Autosize 6.0.1，处理文本高度与浏览器细节，不引入新的存储格式。

定位：长时间写作的编辑面；桌面/笔记本优先、手机适配；安静的蓝白档案；用长文而非空字段检查容量。

硬约束：单列正文；不包卡片；长文本自动增高无内部滚动；正文 16px/1.95 行高；桌面本节目录直接定位；文档只有一套工作区标签与品牌；手机不横溢；保存/撤销/AI 草稿及书籍归属不变。原生输入保持选择与焦点，目录定位不产生写入；页面滚动承载长文。文档仍只读，章节切换更新同一标签路由，原深链接和刷新继续有效。桌面目录在手机收为横排分区，本节细目录不挤占正文。
