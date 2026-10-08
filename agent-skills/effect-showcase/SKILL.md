---
name: effect-showcase
description: 交付 UI/功能效果实拍文档给作者评审时使用——隔离栈起服务、Playwright 真浏览器按真实用户流造数据、逐界面采集真截图、磁盘产物取证，产出「md（相对路径图片，入库）+ 自包含 HTML（截图 base64 内嵌，零路径依赖）」双版效果文档。凡作者说"看下效果 / 做个文档带截图 / 效果验收 / showcase / 实拍"，或完成一波 UI/功能交付需要可视评审时都用——即使没明说"截图"。
---

# effect-showcase — 效果实拍交付

把"做完了"变成"看得见"：真浏览器跑真实用户流、逐界面截图、磁盘产物取证，产出两种版本的评审文档。**截图必须是真实运行的画面，不许摆拍或伪造。**

## 交付物四件

1. `docs/plan/<topic>-showcase-<date>.md` —— 评审文档（图片相对路径 `../screenshots/<topic>-<date>/`，随分支入库）
2. 同名 `.html` —— 自包含版（截图 base64 内嵌，任何查看器/浏览器零路径依赖；跨工作区查看必配）
3. `docs/screenshots/<topic>-<date>/*.png` —— 原始截图
4. 采集脚本 `scripts/tmp-*-capture*.mjs`（tmp- 前缀，正式化或移除待作者令）

## 流程

1. **隔离栈**：在交付 worktree 换端口起服务（如 `PORT=3011 node server/index.js` + `PINAX_DEV_BACKEND_ORIGIN=http://127.0.0.1:3011 npx vite --port 5175`）。绝不与主工作区/其他会话的在途服务共端口、共进程；npm ci 失败可 junction 主安装（`cmd //c "mklink /J node_modules <path>"`，lock 未变时合法）。
2. **真实用户流造数**：Playwright headless 按用户路径点击/填写（新建/导入/编辑/保存），不用摆拍数据。UI 导入流绕不过时用 localStorage 种子（schema 对齐 store 的加载规范化；种完 reload）。
3. **逐界面截图**：viewport 1440×900，每界面存 `docs/screenshots/<topic>-<date>/NN-name.png`。
4. **磁盘产物取证**：双写/生成的文件树 + 关键文件全文，以代码块进文档——这是"落盘正确"的直接证据。
5. **真实编辑保存**：至少触发一次真实写路径（改内容→保存），验证落盘产物由真实链路产生。
6. **组文档**：效果总览 → 逐节截图+一句话说明 → 磁盘实拍 → 已知瑕疵（如实列出）→ 复现方式（命令级）。
7. **生成自包含 HTML**：`scripts/md-to-selfcontained-html.mjs <repo-root>`（本技能自带），并把 .html 与截图复制到主工作区同相对路径（跨工作区查看器按各自根解析）。
8. **入库**：md + 截图 + 脚本提交到交付分支；.html 通常不入库（体积），按需。

## 陷阱清单（每条都真实踩过）

- **headless 每次 launch = 全新 localStorage**：跨步骤数据必须单会话完成，或 `context.storageState({ path })` 存档复用；绑定性数据 UI 流绕不过时用 localStorage 种子手术（先读后写，schema 对齐，种前不必快照但种后必须 reload）。
- **IAB 内嵌浏览器会被宿主窗口遮挡**：点击"拿不到坐标"、截图 3000ms 超时——直接换 Playwright headless，不在 IAB 上耗（`--no-ui` 的 GCM/工具控制台输出同样可能被吞）。
- **写采集脚本用 Write 工具**：bash heredoc / node -e 会吃模板字面量 `${}`、反斜杠与引号，脚本必坏。
- **shell 管道吞退出码**：`cmd | tail` 永远 0。门禁命令单独跑，或 `> log 2>&1; echo exit=$?`。
- **"存量失败"必须在干净基线实证**（基线 checkout 或 stash 复跑同用例），worker 自报不算数；修复导致的断言漂移要改断言并注释理由，不许静默。
- **项目文件夹/注册表残留会让新建静默回落**：重跑前清注册表（`POST /api/localmirror/projects/remove`）+ 删文件夹。
- **截图必须 Read 亲看再写文档**：渲染缺陷（i18n 占位符未插值、字段映射错、组件未接线）就是在这一步抓的；抓到即修或如实列入"已知瑕疵"。
- **图片路径**：md 用相对路径（`../screenshots/<topic>-<date>/`）；GitHub/VS Code 正常，跨工作区查看器会裂——所以必须配 HTML 版。

## 复用脚本

- `scripts/md-to-selfcontained-html.mjs <repo-root>`：md → 自包含 HTML（内嵌 base64 图片、极简样式）。若不在，按 `tmp-worldbook-showcase-html.mjs` 的模式重建（≤80 行：逐行 md 渲染 + 图片 resolve(dirname(md), rel) → base64 data URI）。
