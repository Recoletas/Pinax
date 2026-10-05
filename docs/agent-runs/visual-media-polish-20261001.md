# 漫画与插画打磨

2026-10-01，main 本地工作区。接续作品跨页联动；作者要求调研市场产品、统一 UI 并接通功能。本页记录本轮施工和证据，产品长期路线仍在 PLAN。

## 调研与取舍

已阅读官方资料和现有调用链，不把产品宣传当作生成质量测评。

| 参照 | 可核实的做法 | 本轮采用 |
| --- | --- | --- |
| [Firefly 统一工作区](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generate-and-edit-content.html)、[Krea 工作说明](https://www.krea.ai/blog/krea-2-deep-dive-walkthrough) | 生成参数与参考靠近描述，候选、当前图和资产操作有层级 | 插画以图为主；描述、模型、比例和生成常驻，其余按需展开；生成图保留来源和参数 |
| [Midjourney V8 编辑公告，2026-08-27](https://updates.midjourney.com/edit-model-for-v8/) | 从选中图继续编辑，有明确的参考/局部编辑能力 | 保留选图与参数复用；仅开放适配器实际能调用的参考能力 |
| [Canva 漫画](https://www.canva.com/create/comic-strips/)、[Clip Studio 导出](https://www.clipstudio.net/en/comics-manga/tool/exporting-printing/) | 空白格、图片、独立文字气泡和导出构成编辑链 | 手写画面不要求小说素材；整页预览、选图和导出使用同一张图，气泡继续独立编辑 |
| [Dashtoon 2024 历史发布说明](https://insiders.dashtoon.com/dashtoon-studio-august-2024-release/) | 先编排逐格脚本，再生成和修当前格 | 保留已有分页、视觉规则与阶段制作，收拢当前格编辑；不据历史页面声称其 2026 UI |
| [MiniMax 人像参考 schema](https://platform.minimax.cn/docs/api-reference/image-generation-i2i) | character 支持 JPG/PNG 的公网 URL 或 Base64 Data URL，小于 10 MB | 接通内置和自带密钥两条请求；当前适配一次一张人物参考，不把它声明成构图编辑或蒙版能力 |

调研原件：`/tmp/pinax-comic-current-audit.md`、`/tmp/pinax-illustration-current-audit.md`、`/tmp/pinax-visual-media-ownership-audit.md`。初始截图：`/tmp/pinax-visual-media-20261001/illustrator-before.png`、`comic-before.png`；root 已查看。

## 施工约束

- 插画是当前文本的临时工作台，漫画是整页编辑器；二者延续正文/资料的作品归属，不新增独立的项目系统。
- 插画桌面约 340px 参数栏加主图/候选区；漫画左页目录、中间真实整页画布、右侧当前格。手机分区切换，44px 触控区。
- 沿用工作台主题面层、无衬线工具字级和轻选中反馈；亮暗主题保持层级。空态不显示假生成图，风格用文字预设。
- 不重写漫画格框、人物框、运动线、焦点、气泡坐标；阶段产物与直出图保留各自 lineage，但统一当前显示图。
- 生成结果冻结书、来源、目标和请求；切书/切格的旧返回不得更新新目标或清掉新请求。
- 保存素材与正文插入明确接纳媒体，真实引用阻止删掉二进制；图库按书和用途管理，不先全局截断。
- 本轮不新增或运行测试、不调用模型、不提交、部署或重启服务。用隔离虚构作品和合成图片观察交互与截图，不据此评价模型画质。

## 写集

| Owner | 写集 |
| --- | --- |
| root | 图片适配器、MiniMax 共享校验及服务端代理、文档、集成与最终检查 |
| ui_consistency_audit | ImageGenerationWorkbench、ImageModelPicker、AuthoringIllustratorDrawer |
| secondary_workspace_polish | ComicStudio、ComicPageEditor/Canvas/Preview、漫画页存储/显示 helper/缩略图 |
| workspace_linkage_audit | 媒资与素材桥、图片任务、Notes 保存/插入、漫画生产请求所有权 |

## 状态

已完成调研、分线实施与组合工程检查，代码已冻结；仅本地工作区，视觉仍待作者确认。插画常用参数已移到首屏，手机生成按钮常驻；root 看过第一轮 1440 亮暗/390/320 英文并据此修了强轮廓、参数藏在下沿和空态重复原文。

root 隔离浏览器实际走了人物 PNG 上传→两张候选→保存两次→插入正文→刷新：请求携带一张 character Data URL，浏览器没有密钥；两张分别存入原书，实际图片 832×1248 与请求 1024×1024 分开记录；仅建立一个素材条目。发现正文此前只渲染媒体引用标题，已补媒体节点 view 从 IndexedDB 解析图片，临时 Blob URL 在销毁/切换时释放；刷新后仍显示图，文稿 JSON 保留资产 ID。观察与已查看截图在 `/tmp/pinax-visual-media-20261001/root-illustration-observations.json`、`root-illustration-result-dark.png`、`root-manuscript-image-reloaded-dark.png`。合成图片明确标注非模型生成，不据此判断画质。

速记实际页面观察采用 A 选中/B 勾选：合成生成结果保存两次只建一个 A 素材；回到 A 插入，刷新前后都只显示一张可解码图片，B 正文未改。修复 HTML 净化吞掉内部媒体引用，以及插入后临时预览与正文重复显示。结果在 `/tmp/pinax-notes-media-20261001/observations.json`，root 已查看 `notes-inserted-refreshed-dark.png`。

漫画空白页已能只填画面描述和模型生成；直接图和阶段图保留各自来源记录，共用当前图解析。未确认、中间阶段或失效图片可以预览，成品导出会说明阻塞原因，分镜草稿仍可导出。文字采用画布逻辑 px，气泡形状和尾巴共用几何；溢出会阻断，不再静默截掉后半句。最终隔离页面观察在 1440 亮暗和 390 暗色各点击生成四格、添加对白、上传并确认粗稿、下载 PNG；无 pageerror 或整页横向溢出。粗稿成品导出与超量对白均有阻断。root 已查看整页、手机检查器、阶段状态及实际导出 PNG；记录在 `/tmp/pinax-visual-media-20261001/comic-final-observations.json`，截图为 `comic-final-{dark,light,mobile}-{blank,filled,inspector-entry,inspector,stage-gate,export}.png`。手机工具行 52px；22 逻辑 px 在桌面整页缩为约 13.85px，在 111×150 的单格小图缩为约 4.28px。临界字宽下浏览器缩放文字与 Canvas 仍可能换行不同，内容完整，不宣称逐像素排版一致。

本轮还补 ComfyUI API 工作流 JSON 模板→排队→历史→下载，缺模板明确不可生成；正向描述必须连接到标准采样与 SaveImage/PreviewImage 输出，能力判断与发送前共用图连接校验，取图只读这些已验证输出；未知自定义节点明确提示，未自动转换。停止仅结束客户端等待，已提交的 ComfyUI 后台任务可能继续。真实 ComfyUI 环境尚未连接。MiniMax 共用人物图类型、大小、模型和尺寸校验，浏览器不发送服务器密钥；内置请求附比例兼容旧后端。新增 `GET /api/media/images/capabilities` 返回参考支持与数量，参考生成前读取；旧后端不支持时明确提示并阻止发出模型 POST，避免参考被忽略。隔离旧后端观察在 `/tmp/pinax-visual-media-20261001/root-old-image-backend-observation.json`，请求数 0、无 pageerror。服务端代码未重启或部署。

## 最终工程检查

| 命令 | 结果 |
| --- | --- |
| `npm run build` | exit 0，12.20s；日志 `/tmp/pinax-media-final-build-20261001.log` |
| `npm run docs:build` | exit 0；日志 `/tmp/pinax-media-final-docs-20261001.log` |
| `npm run lint:delta` | exit 0，0 error / 2 存量 warning；日志 `/tmp/pinax-media-final-lint-20261001.log` |
| `npm run architecture:check` | exit 0；Authoring 10,900 行 / 119 imports，Notes 1,530 / 18，production cycles / experimental edges 均 0；日志 `/tmp/pinax-media-final-architecture-20261001.log` |
| `npm run architecture:build-size` | exit 0；Authoring-B8ku5u4w.js 1,405,822 bytes，上限 1,450,000 |
| `node --check`（MiniMax helper、图片 provider/router、正文媒体 node view） | exit 0 |
| `git diff --check` | exit 0 |

仍有 Vite 大 chunk 提示；上述结构和体积硬预算均通过。未新增/运行自动测试或 `verify:full`，本轮合成页面观察不能证明真实模型画质或供应商端到端成功。
