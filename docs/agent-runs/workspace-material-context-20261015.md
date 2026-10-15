# 目录密度、二级工具与设定上下文

日期：2026-10-15；主工作区 `main`，本地修改，承接已有未提交工作。未提交、推送或重启服务。

## 调研与本轮边界

这几块是日常工作台，供桌面长时间阅读；手机降为单面板。延续浅灰目录／连续内容面／蓝色动作，正文宽度和原有资源身份不变。

| 参考 | 官方资料中可核对的机制 | 本轮采用 |
| --- | --- | --- |
| [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views) | 简短视图名、既有图标、避免重复能力和过深树层级 | 不另加导航层；调节目录行距，二级操作沿用 Lucide 图标 |
| [VS Code Editor Actions](https://code.visualstudio.com/api/ux-guidelines/editor-actions) | 操作随上下文出现，次要操作进入更多菜单 | 目录更多按钮悬停／聚焦显露，图标提示保持一致 |
| [Apple Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | 导航占用空间，需要适应可用尺寸 | 保留现有可收起、调宽和手机抽屉；不照抄平台的整套导航 |
| [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 材质用来区分前后层次与控件／内容 | 持续阅读面保持纯净，浮层使用既有阴影；不在内容区堆叠模糊玻璃 |
| [Obsidian Backlinks](https://help.obsidian.md/plugins/backlinks) | 正式链接和字面提及分别呈现，可随当前对象切换 | 底栏继续是正文提及；场景及历史单独读取稳定 ID |
| [Obsidian Properties view](https://help.obsidian.md/plugins/properties) | 当前对象属性和全部属性是不同的视图 | 正文编辑／管理／批量表格职责保留，不重建另一套数据 |
| [Scrivener 人物元数据](https://www.literatureandlatte.com/blog/use-custom-metadata-in-scrivener-to-manage-characters) | 把人物等元数据关联至文档，辅助组织与追踪 | 从章节锚点反查出场，而非根据人物小传猜测经历 |
| [Campfire Timeline](https://www.campfirewriting.com/learn/timeline-tutorial) | 故事规划／世界历史可以按事件组织 | 显示已有世界历史引用；本轮不新造时间轴存储和历史编辑器 |

Apple 页面通过官方 `.md` 地址读取。像素、留白和具体布局均为 Pinax 的试排，不声称是上述产品的官方参数。观感仍待作者确认。

### 固定交互约定

1. 左侧保留当前项目默认文件夹和混排归档；目录不成为编辑器或正文副本。
2. 行高由 29 调为 35px，层级缩进由 12 调为 14px；文件名优先，触控保持 44px。搜索、根文件夹有适量分隔。
3. 正文宽度、中央标签、保存守卫与撤销不改变。右侧位置与写作页一致；关系图仍只在右栏。
4. 纯图标继续提供可访问名称和悬停／聚焦提示；实质性命令保留必要文字。
5. 设定增加“场景与经历”工具：本章末段场景、出场记录／发生于此、明确引用的世界历史；地点显示地图绑定状态并可定位到地图。
6. 图谱、表格、管理和属性分别保留既有编辑路径；新增记录面板只读，跳转须先通过原保存／离开检查。
7. 地图以当前作品关联世界书为准；未落图显示核对入口，不按名称建点或修复绑定。
8. 手机仍使用原右栏覆盖面板，关闭返回正文，不新增常驻栏。

## 数据链路

- `ProjectDirectory` 为已绑定世界书派生一条“世界地图”资源，默认在世界书目录里。它打开现有 `map-editor`；目录只保存位置与引用，地图身份与其他入口一致。
- `settingContextModel` 从本书 `writingBooksRepository` 的 `chapter.editorDocument`、`chapter.sceneAnchors` 读取场景；只收当前世界书、有效单元及有效锚点，计划入场不算已在场。
- “本章场景”复用锚点解析器，定位到本章最后一个单元，沿用继承／失效规则。它不是光标所在场，也不是人物跨全书的唯一当前状态。没有依据就显示未记录。
- 出场记录按书稿章节及单元顺序显示，不把章节顺序当作故事时间；每条可回到原正文或地点地图。字面名称命中仍由现有底栏处理。
- 世界历史只读 `worldbook.geoHistory.nodes` 中明确的 `entryIds` 或地点 ID 引用；不按同名参与者自动连人，不读其他作品的跑团运行态或待确认记忆。
- 地点地图状态与链接复用 `buildAuthoringSceneLocationProjection`；原地图 owner 继续执行绑定、版本与定位检查。此轮只改 UI 接入，不改地形算法、worker、生成参数或地图写入合同。
- `SettingContextPanel` 仅打开该工具时挂载，按作品订阅原书稿仓库，卸载取消订阅；不启动模型或后台轮询。

## 本轮范围的限制

尚未新增可手工修改的“人物当前状态账本”或按故事时间裁决冲突的系统。这需要明确时间／分支／作者确认所有者；本轮把已有记录用起来，不由最后出场或词频推算当前位置。既有场景的调整仍在正文推演中完成；世界历史仍由地图的原有流程管理。

## 核查记录

- `npm run build`：exit 0，25.23s。
- `npm run lint:delta`：exit 0，0 error／5条存量warning。
- `npm run architecture:check`：exit 0；Authoring 10899行／124 imports，零生产依赖环，未提高预算。
- `npm run architecture:build-size`：exit 0；Authoring 1,372,693 bytes，限额1,450,000。
- `git diff --check`：exit 0。
- `npm run docs:build`：exit 0，首次9.44s；核查记录写入后再构建。
- 在用户现有5173上使用隔离浏览器上下文和合成作品，逐页截图查看亮／暗、1440×960及390×844：目录、设定管理、右侧图谱、场景与经历、地点地图、助手、参考列表、参数弹窗、日志、批注／编辑和推演当前场。实际打开同一本书的人物→地点→地图→正文，展开批注编辑并取消，未发起模型请求或改用户作品。
- 实页核对发现批注仍由Authoring内联模板渲染，独立InspectorAnnotations组件未接入；撤回对未使用组件的修改，更新实际模板和样式。第一份参数截图早于异步弹窗挂载，重新等待弹窗显示后截图；最终实页操作exit 0，无pageerror。
- 这些是构建、静态检查和浏览器操作证据，不是完整回归测试。本轮未请求运行自动测试，因此没有运行 `verify:full`／Vitest，也未添加测试或真实模型调用。观感等待作者确认。
- 临时截图、官方文档缓存及取景脚本看完后清理，仅保留本文记录。


## 续修：图标与强调色、首页侧栏连续性

后续修订：作者否定下文顶部标签短蓝线，现已移除该线并还原活动标签中性色图标；最新判断及候选方案见[重新定方向](../plan/pinax-color-direction-20261015.md)。其余历史记录不作为已获作者认可的视觉结论。

作者认可目录密度，随后指出图标塑料感、回首页被强制折叠、强调色不足。本轮保留行高／目录结构／正文宽度，只调整符号、颜色职责和宿主显隐规则；无需新增工作流规则，执行已有的“明确用户约束优先”即可。

### 官方依据与适配

- [VS Code Light Modern主题](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/light_modern.json)：白色编辑区、浅灰侧栏，中性灰目录选中；蓝色用于活动栏标记、活动标签边线、焦点、链接、按钮。不是给整个列表染成蓝色。
- [Theme Color合同](https://code.visualstudio.com/api/references/theme-color)：活动态、焦点、悬停、图标和内容面分别定义颜色。
- [Product Icon Reference](https://code.visualstudio.com/api/references/icons-in-labels)：操作图标与文件类型图标区分。Pinax继续使用既有Lucide库，不增加一套图标依赖。

本轮的具体字号、线宽和颜色是Pinax适配，不能当作VS Code官方参数。人物改用单人轮廓，地点改用位置针，章节改用单页文件；扩展由方块组改为平面拼图，默认笔画由1.7收为1.5。右侧工具选中用低浓度底色、蓝色图标与2px边缘标记，不保留大圆角胶囊块。活动资源标签用短蓝线，去除凸起阴影；章节／世界书的小图标用克制蓝色，地图／地点用灰青，来源用低饱和暖色；文件名和目录选中仍保持原中性配色。

桌面侧栏显隐现在随宿主连续保留。`useWorkspaceDirectory`只在从其他页面进入文章／构思或切作品进入文章时展开，普通切章不打断手动收起。回首页保留当前展开／收起，同作品首页沿用目录宽度；记录最近显隐以支持首页刷新。手机抽屉仍独立，不因打开文章而挡住稿面。

隔离实页操作已观察：进入文章为展开，回首页仍展开；首页手动收起后进文章重新展开；文中手动收起后回首页仍收起，再进文章展开。亮暗1440×900与390×844截图已查看，原工作台宽度及目录间距保留。最初取景在异步导航完成前读到了旧状态，改为等待页面更新后记录，未据此误改导航逻辑。本轮`npm run build` exit0（19.58s）、`npm run lint:delta` exit0（0error／5存量warning）、`npm run architecture:check` exit0（零生产依赖环，预算未提高）、`git diff --check` exit0、`npm run docs:build` exit0（6.17s）；浏览器取景操作exit0，无pageerror。未执行自动测试或真实模型，不提交／推送／重启服务。临时图片脚本看完清理。
