# C 线：漫画连续性、分镜转换与可发布样张（48 项）

> 上级计划：[跑团 / 联机 / 漫画夜间总计划](./nightly-20260919-roleplay-online-comics.md)  
> 范围：现有 ComicStudio/page store/composition/image request guard/lettering/publication 链；不另建媒体库，不重写全局工作台。  
> 完成定义：不是“能调用生图”，而是从有来源的故事生成可编辑、可恢复、可检查、可发布的多页漫画，并诚实标注真实图像能力边界。

## C0. 基线、样张与复用审计（C01–C06）

| ID | 任务 | 验收证据 |
|---|---|---|
| C01 | 从当时 main 建独立工作树，记录 base/tip/dirty，不改用户 WIP；运行当前 comics nightly check 与相关核心测试 | exit code、通过项、耗时；基线失败先分类/修复 |
| C02 | 画出生产链：来源/改编→page plan→visual bible→layout→image request/result→lettering→QA→release/export→backup | 每阶段唯一 owner/数据结构/生产 consumer；发现第二真源先收口 |
| C03 | 核对 M2–M6 已有能力和 M7 真缺口：不得重做页面目录、请求围栏、只重试保存或已有导出 | 差距清单指向文件、用户入口和反例 |
| C04 | 审计 StoryForge 固定 SHA 的 durable production、QA、release book、renderers 与 complete workflow tests | 复用表含 URL/SHA/路径/许可/direct-adapt-reference-reject；不搬 React UI/Dexie store |
| C05 | 冻结一份原创短故事 fixture：2 页目标、8–12 格、2 个角色、2 个地点、1 个关键道具、页转悬念和明确 sourceRefs | fixture 不含用户私稿/受限 IP；source revision/hash 稳定 |
| C06 | 准备可离线使用的合规占位图/仓库 fixture 或作者导入图，以及媒体能力清单（text-only/reference/seed/inpaint） | 无额度仍可完成排版/恢复/导出；能力未知默认 unsupported |

阶段 Gate：当前主链、差距、fixture 和媒体能力边界齐全后进入 C1；只写界面研究不算完成。

## C1. 连续性真源与可解释 QA（C07–C12）

| ID | 任务 | 验收证据 |
|---|---|---|
| C07 | 建立/补齐每个画格的 ContinuitySnapshot：角色外观/服装/伤势/手持物、地点/时间/天气、关键道具、空间方向及来源 | 结构含稳定 entity/source refs，不只存自由文本提示词 |
| C08 | 从 visual bible 与前一画格确定性投影硬约束/软倾向/未知；作者覆盖单独保存 provenance，不改写原来源 | 相同输入结果稳定；未知不臆造，覆盖可撤销 |
| C09 | 连续性检查区分 structural pass、metadata warning、requires-visual-review；没有真实图片不能标“画面一致” | 无图、损坏图、占位图、真实图四种状态显示正确 |
| C10 | 检测角色/道具/地点/时间、左右方向和伤势状态的显式矛盾；每条问题指向两端画格与证据 | 至少 18 个正反 fixture，低误报原因可解释 |
| C11 | 相邻页和页转连续性：上一页最后格、下一页首格共享状态；新场景必须有明确 transition，不因换页重置全部状态 | 2 页 fixture 与跨页反例通过 |
| C12 | 问题状态支持 open/accepted/fixed/obsolete；源 revision 改变后旧 QA stale，不把已修问题重新悄悄标 pass | 编辑来源、换图、重排、删格后的状态矩阵 |

阶段 Gate：结构化 fixture 能稳定发现矛盾并给来源；视觉无法判断的项目明确留给人工，不伪自动化。

## C2. 正文到分镜的稳定转换（C13–C18）

| ID | 任务 | 验收证据 |
|---|---|---|
| C13 | 从选定章节/单元生成 AdaptationSource：精确 book/chapter/unit/range/revision/hash，不默认吞全书 | 选择/取消/换书/源删除结果明确，跨书不能引用 |
| C14 | 将故事拆为 beats，再映射 page/panel；每格保存 sourceRefs、剧情功能、可见行动/对白和连续性输入 | 8–12 格全部可回到原文；无来源的新事实标作者补充 |
| C15 | 页数、每页格数、页转与阅读顺序有界；自动建议不制造不可读碎格或一格塞完整章 | 长/短/对白/动作 fixture 的页格统计与人工复核 |
| C16 | 作者可增删/合并/拆分/移动画格；操作单事务，稳定 panel id 或有显式 remap，相关图片/文字/QA 不串格 | 撤销/重做、跨页移动、删除有图画格的反例 |
| C17 | 源正文 revision 改变时给差异/重同步选择：保留当前分镜、仅更新来源、重新建议；不自动覆盖作者改动 | 三种策略各有结果和可撤销性，旧生成请求 stale |
| C18 | 分镜转换中途取消、刷新、存储失败、切书和迟到模型结果不会留下半套新真源 | 故障注入后回到旧版本或明确可恢复 draft |

阶段 Gate：fixture 从正文生成两页分镜，手工调整后重开仍一致；源变化不吞作者修改。

## C3. 图片请求、批量生产与跨刷新恢复（C19–C24）

| ID | 任务 | 验收证据 |
|---|---|---|
| C19 | 每次图片请求冻结 panel/source/visual bible/style/reference capability/input hash/provider/attempt；先持久化 intent 再调用 | 刷新后区分 running/unknown/result-returned/save-pending/completed/failed |
| C20 | provider 成功、媒体保存失败时保留可恢复候选并只重试保存；绝不自动再次发起可能收费请求 | quota/transaction abort/写入超时故障矩阵与调用计数 |
| C21 | 迟到结果必须过 book/page/panel/revision/request fence；换图/删格/切书后结果进入隔离恢复区或丢弃，不覆盖当前图 | 迟到、重复、取消后返回、两个 tab 并发四类反例 |
| C22 | 批量生成按画格独立状态：有限并发、可取消、单格失败不回滚已保存图片、仅重试选中失败项 | 12 格中混合成功/失败/取消，调用数和最终状态准确 |
| C23 | 实测已授权 MiniMax 生图/图文渠道；reference image/seed/inpainting 只在 provider 明确支持且回执可验证时发送，否则 UI/合同清楚降级为文本约束或人工导入 | 能力矩阵、真实请求快照与至少 24 次生图调用；不出现“显示已用参考图但实际没传” |
| C24 | 媒体原件、缩略图、候选与当前选择的引用/回收策略明确；受 release 使用的媒体不可误删，孤儿可预览后清理 | 删除/撤销/切换候选/清理/备份恢复矩阵 |

阶段 Gate：离线 adapter 下 12 格批量混合故障可恢复；若有授权，再跑最多 4 张真实图，成绩独立记录。

## C4. 视觉检查与定向修复（C25–C30）

| ID | 任务 | 验收证据 |
|---|---|---|
| C25 | 提供逐页人工检查清单：人物识别、服装/伤势、道具、场景、昼夜、方向、构图、文字安全区、品牌/水印和敏感内容 | 检查结果绑定具体 image/panel revision，不是全项目一个勾 |
| C26 | 媒体完整性检查：MIME/尺寸/解码/透明度/方向/文件大小；损坏图片不能进入 publication pass | 损坏、0 字节、错误 MIME、超大、旋转 metadata fixture |
| C27 | 结构 QA 与人工视觉 QA 分栏，状态和责任人可见；替换图片后旧视觉结论 stale | UI/数据矩阵；不能仅因图片存在自动 pass |
| C28 | 问题修复默认只针对当前格和明确约束；provider 支持局部修复才用 reference/inpaint，否则新候选不替换旧图 | 旧候选保留、对比、采用/撤销；调用前显示实际能力 |
| C29 | 对话/旁白与画面矛盾检测只基于明确实体/时间/动作字段，不用脆弱关键词宣称理解全部画面 | 正反 fixture 与 false-positive 说明 |
| C30 | 形成 2 页 continuity report：硬错误必须 0 才可发布；warning 可带作者接受理由；未视觉检查不能伪 pass | report 可导出/随 release 冻结，仍不包含 provider 密钥/原始 reasoning |

阶段 Gate：用实际查看过的 fixture 图片完成一次人工 QA；自动检查与人眼结论边界清晰。

## C5. 排字、阅读顺序与发布冻结（C31–C36）

| ID | 任务 | 验收证据 |
|---|---|---|
| C31 | 气泡/旁白/拟声保持独立文字层和稳定 reading order，不烘焙进原图真源；编辑/移动/删除可撤销 | 导出前后文本可编辑；屏幕阅读顺序可检查 |
| C32 | 长中文、英文、标点、竖排/横排当前支持范围、字体 fallback、溢出、safe area 和遮挡提示 | 边界 fixture + 1440/390 编辑；unsupported 明示而非错排 |
| C33 | 画格裁切、出血、页面尺寸、分辨率与颜色/透明策略由 publication preset 决定，预览与导出一致 | 代表页面像素尺寸/边距/裁切检查 |
| C34 | release manifest 冻结 source/page/panel/image/text/font/preset/QA revision 与 hash；后续编辑形成新 release，不暗改旧版 | release v1/v2 对比，旧版可重新导出相同结果 |
| C35 | PNG/WebP/PDF 走现有真实实现并检查页序、尺寸、文字、空页、错误；不支持的 CBZ/印刷特性不临时承诺 | 每种现有格式打开检查；浏览器打印若非真 PDF engine 要准确说明 |
| C36 | 导出中断、单页失败、磁盘/下载拒绝时不给成功提示；已有 release 与编辑草稿不损坏 | 故障注入、重试与取消结果 |

阶段 Gate：两页样张形成冻结 release 并导出当前支持格式，人工打开逐页检查，而不只验证文件存在。

## C6. ComicStudio 产品表面（C37–C42）

| ID | 任务 | 验收证据 |
|---|---|---|
| C37 | 页面缩略图、主画布、画格检查器、连续性/生产/QA 状态形成清楚层级；不把所有控制塞左侧或重复全局标签 | 首访可理解；当前页/格/任务焦点唯一 |
| C38 | 空项目、无图片、有候选、生成中、保存失败、恢复中、QA warning、已发布等状态有真实操作，不用大面积空白/占位卡 | 状态截图与动作结果 |
| C39 | 批量动作和单格动作视觉/语义区分；危险删除、重新生成和发布需要恰当确认，普通保存不弹窗打断 | 防误触旅程；键盘触发与忙碌禁用正确 |
| C40 | 1440、1024/900、390 与亮/暗主题；窄屏采用线性页面/检查器而非压扁三栏，长提示/中文不溢出 | 实际截图人工检查 + browser journey |
| C41 | 键盘导航、焦点返回、可访问名称、状态播报、200% 缩放、减少动画；拖拽有键盘替代 | a11y 脚本和人工键盘旅程；真机未跑项如实标注 |
| C42 | 页面切换/切书/返回工作台/刷新不丢当前安全进度；迟到媒体结果不污染新页面 | 两书多页与刷新矩阵；状态恢复耗时记录 |

阶段 Gate：从正文进入漫画、创建两页、调整一格、恢复失败图片、QA、发布、返回正文的完整浏览器旅程通过。

## C7. 样张、压力、回执与封板（C43–C48）

| ID | 任务 | 验收证据 |
|---|---|---|
| C43 | 使用 MiniMax 完成 C05 fixture 的真实 2 页/8–12 格样张；每格有来源、连续性快照、真实图片和文字层，并让图文模型复核人物/道具/场景连续性后由 agent 实看确认 | 样张截图、manifest、逐格状态、模型审查与人工结论分列；失败格修复仍保留旧候选 |
| C44 | 做 50 页/300 格元数据压力与代表媒体压力：切页、保存、恢复、QA、缩略图、导出清单不出现无界阻塞/内存增长 | 耗时、内存/存储估计、最大记录和清理结果；无需生成 300 张付费图 |
| C45 | 备份→清空→恢复 current draft、生产任务、媒体 refs、QA 与 release；未来 schema/损坏媒体/部分包失败得正确 | 真实 ZIP 往返、补偿、拒绝和旧 release 重导出证据 |
| C46 | 运行 comics nightly check、浏览器 Gate、相关核心测试与 `npm run verify:full`；测试预算仍 ≤20/200 | 准确 exit code；build/lint/结构/diff/docs 全绿 |
| C47 | diff/复用/许可证自审，清理调试资产与孤儿接口，提交干净且可独立 cherry-pick 的 commit，不推送 | SHA、文件清单、媒体/迁移/回滚边界，工作树干净 |
| C48 | 写最终回执：工程样张/真实图片样张分别定性、任务状态、截图、导出、风险和明日首条命令；本地项未完继续做 | 不把“图像 API 返回”写成漫画成熟，不因额度缺失提前停 |

## MiniMax 临时不可用时的继续队列

用户已授权现有 MiniMax 生图/图文渠道，C23/C43 是必跑真实 Gate。渠道临时不可用时先用固定图/作者导入图完成：12 格混合生产状态、只重试保存、连续性 snapshot、人工 QA、文字层、安全区、跨刷新、release manifest、PNG/WebP/PDF、备份恢复、50 页压力和三尺寸 UI；渠道恢复后补齐真实样张。不得生成一批纯色占位图后宣称视觉一致性通过。

## C 线拒收条件

- 重新造一套页面/媒体/图片请求 store，绕开现有 page store 和 request guard。
- provider 没有 reference/seed/inpaint 能力，却在 UI 或回执写“已参考角色图”。
- 图片存在就自动把视觉 QA 标通过，或用 prompt 文本检查冒充看过图片。
- 保存失败自动重新生图；迟到结果可覆盖已换图/删格/切书后的画格。
- release 不冻结 revision/hash，后续编辑会暗改已发布版。
- 只验证文件下载成功，不打开检查页序、尺寸、裁切、文字和损坏。
- 因没有图片额度而跳过可用 fixture 完成的 C19–C48 本地任务。
