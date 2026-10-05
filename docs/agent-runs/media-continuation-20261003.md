# 媒体制作第二轮 · 2026-10-03

状态：已本地实施并通过组合核查（10 月 4 日凌晨收口），视觉待作者确认。第一轮任务与验证见[媒体核心区续修](./media-core-20261003.md)。本轮沿用已通过的实现，继续检查此前没有覆盖的改编、历史结果与制作细节。

## 本轮分工

| Owner | 写集 | 工作 |
|---|---|---|
| root | ComicCompositionCanvas、ComicPageEditor/Preview、lettering、公共媒体仓储、文档 | 中央页面预览与排字、组合验收 |
| video_workspace | StoryboardVideoPanel、视频结果专用组件/服务、视频检查脚本 | 找回各镜头已有结果、预览/过期/错误状态 |
| comic_workspace | ComicAdaptationPlanner、ComicStudio、comicAdaptationService、漫画页选择 | 来源到可编辑方案，再进入实际制作页 |
| media_backend | Notes、useNotesAssetCatalog、relationCanvas | 先隔离复现，再修保存门禁、书籍路由、画布写盘回执 |

## 视觉与交互边界

这些都是制作工作区。保留真实画面与已有编辑功能；桌面便于看整页/比较，手机按当前步骤展开；继续使用中性工作面、系统字体、统一按钮和细分隔。工具必须说明当前操作的对象，保存状态和候选选择必须对应实际落盘。

不重启用户服务，不调用收费模型，不提交/部署。已有 WIP 全量快照：`/tmp/pinax-media-continuation-20261003/before`。

## 结果与核查

### 已落地的改动

- 视频面板按作品、分镜文档、镜头读取已有结果，显示最近四项并可展开。单一播放区可切换历史；保留原视频和当时描述。旧记录通过原版本的节点身份映射，重排镜头不会凭序号串用。
- 过期链接和播放错误独立于生成状态；打开历史不重发生成、不重复归档，其他素材更新也不抢走当前选项。视频仍只保存外部链接。
- 漫画方案新增逐页脚本编辑；候选修改带入新序列，已建立页面通过明确的保存回执更新标题、剧情、画面、对白和旁白。版本冲突与写盘失败保留草稿；制作页的候选图、阶段与在途请求保留。
- 漫画中央画布增加整页、适应宽度、缩放。只改变浏览尺寸，导出和构图数据不变；换页清理拖动状态，卸载释放尺寸监听。预览与导出调整中文标点断行，短句的句号不再单独挤成一行。
- 速记到漫画先保存，再按所选素材的实际书籍归属路由。导入画布写盘失败不导航、不报告成功，专业信息与新卡片一次写入。

### 组合核查

root 已复跑核心合同 20/20 文件、200/200 用例，exit 0；专项脚本：视频任务 23/23、视频客户端 28/28、漫画服务 32/32、分页 30/30，均 exit 0。画布实际构建实页 40 项检查通过，覆盖 1440 亮暗、1024、390、320：整页可见、宽度适配、缩放不改数据、超宽画布左边可达、控件可达、无整页横向溢出及 pageerror。桌面亮暗和手机原尺寸截图已查看。

- `npm run verify:full`：exit 0，20/20 文件、200/200 用例；Vite 12.95s、VitePress 3.56s；lint 0 error / 2 条原有 warning（i18n console、Authoring 未用函数），结构/体积/diff 通过。Authoring 1,402,793 bytes，限额 1,450,000；Notes 1527 行 / 18 imports。最终日志 `/tmp/pinax-media-continuation-20261003/verify-final.log`。
- 分页实际页面：48/48。桌面 1440、手机 390，候选编辑/切换、建三页、存储失败保留/重试、直达第二页、视觉规则保存/确认、刷新保留；延迟结果、来源换序、停止等待、同组件素材深链和切书隔离。320 暗色补模式选择器的宽度与换行。脚本 `/tmp/pinax-comic-planning-20261003/browser.mjs`。
- 视频实际页面：108/108，1440 亮暗、390、320，共 20 张截图。可解码的本地 MP4 验证播放，另查历史选择、到期、播放错误/重试、原视频新页、刷新、多镜头归属、零重复生成/归档。模型/接口由离线 fixture 替代。脚本 `/tmp/pinax-video-history-browser-20261003.mjs`。
- 漫画上传至导出：root 25/25，1440/390 上传、对白排入、第二页、返回/刷新、缺图阻断、草稿下载、四格齐全成品 PNG；320 无整页溢出。实际下载 PNG 已查看，短句尾部“了。”同在一行，未丢字。脚本 `/tmp/pinax-media-continuation-20261003/comic-export-browser.mjs`。
- 画布上述 40 项已对最终 `dist` 复跑，exit 0。
- 素材交接：隔离故障脚本 25/25（worker），核心断言并入原 narrativeAssets 用例并通过全量门禁。root 用实际构建复验 5/5：A 书入口选 B 书素材正确进入 B，所选来源可见，写盘失败留素材页、保输入、旧持久值不变。脚本 `/tmp/pinax-media-continuation-20261003/handoff-browser.mjs`。

分页脚本的对白与画面排字保持分离：保存脚本不会覆盖作者已经排好的气泡，制作时需核对文字。这一边界已写入手册。没有增加 Vitest 文件或用例。

### 视觉与预览

root 已实际查看桌面/手机画布、分页脚本、视频历史、暗色到期状态及导出的 PNG。构图区可见整页，脚本区使用页序加表单，视频历史复用一处播放器；手机内容在各自工作区内滚动，底部操作可达。测试截图中的素材与视频只用作流程核查。

- [漫画整页桌面](../design/media-continuation-20261003/canvas-desktop.png)、[手机](../design/media-continuation-20261003/canvas-mobile.png)
- [分页脚本桌面](../design/media-continuation-20261003/comic-plan-desktop.png)、[手机](../design/media-continuation-20261003/comic-plan-mobile.png)
- [视频历史桌面](../design/media-continuation-20261003/video-history-desktop.png)、[手机](../design/media-continuation-20261003/video-history-mobile.png)、[暗色到期](../design/media-continuation-20261003/video-history-expired-dark.png)
- [实际导出 PNG（合成输入）](../design/media-continuation-20261003/comic-export-fixture.png)

既有 `http://localhost:5180/` 静态预览已更新，没有重启服务；HTTP 页面与两份新手册均 200，内容哈希与本次产物/源码一致。


## 保留的边界

本轮使用隔离浏览器和合成素材核查交互，模型响应由离线 fixture 提供，不代表真实画质或供应商在线可用性。服务进程重启后的任务恢复、永久视频文件、多页漫画批量出版与通用插画蒙版仍未完成。公共画布仍是既有共享工作区，没有改成每书独立画布。

本地预览需作者继续确认视觉。没有新增工程规则，不调用模型，不提交、推送或部署。
