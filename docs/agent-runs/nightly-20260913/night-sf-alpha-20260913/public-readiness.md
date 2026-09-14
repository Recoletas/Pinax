# Public Alpha 公开准备清单（B 线，B00 建立）

run-id：`night-sf-alpha-20260913`（若 O00 另定 run-id，本文件可整体迁移，内容不变）。
建立时间：2026-09-14（Asia/Shanghai），由 B 线 worker 建立并持续更新；最终状态以 B09 封板版为准。

## 0. 证据约定

状态三档：`verified`（本轮实际执行并留有输出）/ `pending`（已识别、待扫描或待做）/
`user-decision`（公开、许可、素材权属、安全渠道等由作者决定）。
README/文档里的 check mark 不算验证；只有本文件记录了实际命令与结果才算 verified。

## 1. 基线事实（B00 实测）

| 项 | 值 | 证据 |
|---|---|---|
| 编制基线 commit | `main@5152aad`（feat(settings): close settings-authoring linkage loop） | `git log -1` 于 B 工作树 |
| B 线工作树 | `/home/recoletas/jiuguan/pinax-night-sf-b-20260913`，分支 `night/public-alpha-20260913`，基于 5152aad | `git worktree list` |
| 本机 Node | 默认 v20.20.2；nvm 另有 v22.22.3 | `node --version`、`nvm ls` |
| npm | 10.8.2（Node 20 下）；Node 22 侧以 B03 验证记录为准 | `npm --version` |
| tracked 文件 | 1069 个 | `git ls-files \| wc -l` |
| 本地分支 | 20 个（含 backup/、integration/、night/、publish/、server-version） | `git for-each-ref refs/heads` |
| remote | `git@github.com:Recoletas/Pinax.git`（SSH，URL 无凭据；仅记录 host/repo 标识） | `git remote -v`（redact 复核） |
| tracked 敏感名文件 | 仅 `.env.example`、`server/.env.example`（模板，非真实值） | `git ls-files \| grep -iE ...` |
| tracked 演示图 | `docs/demo/` 的历史图片/媒体已从当前树删除，只保留 1 个原创合成 md | `git ls-files docs/demo` |
| 现有第三方说明 | `THIRD_PARTY_NOTICES.md`（Dependency / Adapted source 分级，OpenLayers BSD-2、Azgaar MIT 镜像）；字体 OFL | 文件实读 |
| LICENSE | PolyForm Noncommercial（保持原样，B 不改正文） | `LICENSE` |
| 版本标识 | `package.json` version `1.0.0`；诊断导出仅含该版本，无 commit | `src/utils/betaDiagnosticExport.js` |
| CI | `.github/workflows/ci.yml`：两 job（vitest run、vite build），Node **20**，无 lint、无浏览器 smoke、PR 无 base diff 检查 | 文件实读 |
| README Node 声明 | “Node.js 22.x（≥22.13）”；与 CI 的 20 不一致 | README.md:19 |
| dev 代理 | `vite.config.js` 将 `/api`、`/ws`、`/docs/user-manual` 硬编码到 `127.0.0.1:3001` | vite.config.js:14-29 |
| server 端口 | `PORT` 环境变量，默认 3001 | server/index.js:33 |

## 2. 公开面盘点

### 当前 refs 与公开范围

| refs 组 | 内容 | 公开风险评估 |
|---|---|---|
| `main` | 主开发线 | 拟公开主体 |
| `server-version` | 部署线 | 待作者决策是否随源公开 |
| `backup/*`（2 个） | 发布前备份点 | 建议不推或推后删除；待作者决策 |
| `integration/*`（3 个） | 历史集成分支 | 历史长，含中间态；待作者决策 |
| `night/*`（6 个） | 夜间工作分支 | 建议不作为公开默认分支；待作者决策 |
| `feature/*`（3 个）、`publish/main-20260905` | 历史功能/发布准备 | 待作者决策 |

注意：**公开源仓库会带全部所选 refs 的历史**；本清单只盘点，不执行任何 push/可见性变更。

### tracked/ignored 目录

- tracked 顶层：`src/ server/ shared/ scripts/ docs/ deploy/ electron/ prototype/ agent-skills/` 等（详见 git）。
- `docs/demo/` 当前只保留原创合成文字演示；历史图片已在 2026-09-14 清理。
- `deploy/`：README 已声明含 `/root/Pinax` 固定路径、Node 18 与系统级 Nginx 修改，不能当通用安装器（README.md:59），公开时保留该警示。

### 扫描范围定义（B01 执行）

1. `current-tree`：全部 1069 个 tracked 文件内容。
2. `history`：拟公开 refs 的完整提交历史（工具支持范围内），不是仅当前树。
3. `binary-assets`：tracked 图片/媒体逐一人工检查（无法文字扫描）。
输出一律 redact：只给规则 ID、文件、commit、分类；不回显命中值或上下文。

## 3. 任务级状态板（随包更新）

| 项 | 状态 | Owner | 证据/备注 |
|---|---|---|---|
| 基线事实表（上文 §1） | verified | B00 | 本文件 §1 |
| refs/tracked 盘点 | verified | B00 | 本文件 §2 |
| 当前树凭据/隐私扫描 | verified（0 真实凭据） | B01 | gitleaks 8.30.1，1055 文件归档扫描：3 命中均为同一 8 字符低熵占位串（fixtures/测试），按哈希比对与历史命中同一值；判定假阳性 |
| 历史 refs 扫描 | verified（0 真实凭据） | B01 | `gitleaks git --log-opts="--all"` 覆盖全部 20 个本地 refs：14 命中 / 同一占位串；redact 模式，报告存 /tmp/gitleaks-history-all.json |
| 二进制/演示图人工检查 | verified（1 类 unknown 待作者决策） | B01/B02/O | Kao 美术、旧主题截图/概念图和带水印参考图已从当前树删除；剩余项见 THIRD_PARTY_NOTICES.md |
| 依赖许可覆盖核查 | verified | B02 | 26 个生产依赖按实装版本核验并登记 THIRD_PARTY_NOTICES.md；devDeps 不随发行分发（已注明） |
| 演示图/示例文本来源归类 | verified | B02/O | Kao 及旧 demo 二进制已删除；只剩生产中使用的 `authoring-image-style-presets.webp` 待确认 |
| 许可决策对照页 | verified | B02 | docs/engineering/public-alpha-license-notes.md（不改 LICENSE） |
| Node 22 统一（engines/.nvmrc/CI） | verified | B03 | engines `>=22.13 <23`、.nvmrc 22.22.3（实装验证）、CI `node-version-file: .nvmrc`；Node 20 下 doctor 正确报 MISS |
| dev 后端代理参数化 | verified | B03 | `PINAX_DEV_BACKEND_ORIGIN`（默认 3001 不变）；实测代理 /api 真实回环到 3012 后端；ws/http 派生与尾斜杠边界验证 |
| doctor 环境诊断 | verified | B03 | scripts/doctor.mjs；四场景实测（正确/Node20 过低/端口占用/无 Key）；原生模块检查要求真实实例化（防 ABI 假阳性） |
| lint 降噪 + 窄基线门禁 | verified | B04 | 259E→14E（全部登记 owner）；lint-delta 门禁两探针实测失败路径；接入 verify:full 与 CI |
| 重复 import 修复 | verified | B04 | authoringWorldbookBinding.test.js 三处（saveWritingBooks/installWorkspaceRouteAdapter/vi）修复后 200/200 全绿 |
| CI 作者主路径 smoke + base diff | verified（本地等价；**GitHub 运行待 push**） | B05 | scripts/ci/authoring-smoke.mjs 本地 PASS（网络守卫零拦截）；ci.yml 三 job + 显式 base 解析；空白检查对 5152aad 增量 0 项 |
| CONTRIBUTING/SECURITY/模板 | verified | B06 | CONTRIBUTING/SECURITY + bug/feature 模板 + PR 模板；SECURITY 如实标注"私密报告渠道未启用"为公开前设置项；5 个 good-first-issue 草稿仅存 run 目录 |
| 公共 README + 能力分级 | verified | B07 | 重写：真实截图（合成项目实拍）、能力表（可用/实验+依据）、数据边界、贡献/安全入口；全部链接实测存在 |
| 构建身份（commit/channel）注入 | verified | B08 | vite define 白名单注入；实测：本树 commit=HEAD+dirty、zip 无 .git→unknown、异源可区分；诊断导出已接 build 块 |
| 干净环境验证 + 本地候选封板 | verified | B09/O | 最终 main 干净 clone：`npm ci` 无需 SSH 凭据、doctor 全过、`verify:full` 全绿（20/20 文件、200/200 用例、lint 门禁、Vite、diff、VitePress）；公共链接 35/35、官方 npm registry 生产依赖 audit 为 0。npm 会对 Electron 上游 `@electron/node-gyp` 的 git lock 元数据给出完整性检查警告，已登记而非隐藏。 |

## §3a B01 扫描结果明细（redact）

- 工具：gitleaks 8.30.1（linux x64 二进制），`--redact` 模式。
- current-tree：`git archive HEAD` 精确 tracked 内容（1055 文件）→ 3 命中 `generic-api-key`。
- history：`--log-opts="--all"` 覆盖全部 20 个本地分支全部历史 → 14 命中。
- 全部命中经哈希比对为**同一个 8 字符低熵占位串**（len=8、entropy 2.5、含占位词、hex=false），
  只出现在 `shared/collaboration/fixtures.js`、collaboration/f2 测试脚本、历史版 Settings.vue、
  已删除的 `test-minimal-connect.mjs`、历史版 memoryService.js —— 合成 fixture，非真实凭据。
- 端点扫描：无非本机私有端点；`api.minimaxi.com`/`api.openai.com` 为公开 API 引用文档。
- 无 tracked `.log/.dump/.bak`；`.env.example`×2 全部空值/占位。
- 结论（B01 用语）：**"当前树与全部本地 refs 历史的自动化凭据扫描完成，未发现真实凭据"**；
  范围限制：二进制不做文字扫描（已人工检查精选图），远端 refs 未重新抓取（origin 与本地 refs 对齐以本地盘点为准）。

## §3b B05/B09 验证命令与结果（同一冻结候选 4bdeebaa7）

| 命令 | 结果 |
|---|---|
| `npm run verify:full`（0e3ea97 树） | 全绿：20/20 文件、200/200 用例、lint:delta 通过、vite build、git diff --check、vitepress build |
| `npm run test:run`（4bdeebaa7 依赖更新后） | 200/200 通过 |
| `npm run lint:delta`（4bdeebaa7） | 通过（基线 9 键，无新增） |
| `npm run build`（4bdeebaa7） | ✓ built in 15.5s |
| `npm run ci:authoring-smoke`（4bdeebaa7） | PASS：六步旅程全过、网络守卫 0 拦截、进程清理正常 |
| `node scripts/check-public-links.mjs`（4bdeebaa7） | 6 个公共入口、35 条本地链接、0 断链 |
| 最终 main 干净 clone `npm ci` | 退出 0，无需 SSH 凭据，better-sqlite3 原生模块 Node 22 下可用；存在 Electron 上游 git 依赖完整性警告 |
| `npm audit --omit=dev`（4bdeebaa7） | **0 vulnerabilities**（修复前 41 项：9 high + 32 moderate） |

## 4. 公开阻断项与用户决策项（持续累积）

| 类别 | 项 | 说明 |
|---|---|---|
| user-decision | 仓库何时公开、可见性 | 本轮不执行任何 GitHub 操作 |
| user-decision | 许可证选择 | 当前 PolyForm NC 保留；B02 只出对照材料 |
| user-decision | refs 公开集合（backup/night/integration 分支去留） | §2 表 |
| user-decision | 历史若含疑似敏感内容时的处理（轮换/重写范围） | B01 只列疑似项，不自动处理 |
| pending | GitHub 私密安全报告是否启用、维护联系渠道 | B06 落 SECURITY 时只写已存在渠道 |
| resolved-local | `docs/demo/` 图片权属 | 旧主题与概念图已从当前树删除；历史提交是否重写另行决策 |

## 5. 已声明的边界

- B 不修改 LICENSE 正文、不公开仓库、不 push/tag、不改历史。
- 远端 GitHub Actions 是否实际运行取决于作者 push；本地等价命令通过时明确标注“GitHub 运行待 push”。
- 本文件不预填未产生的结果；每项状态变化时附实际命令与输出路径。

## 6. 2026-09-14 O 集成纠正

- A/B/C 已在 `main` 组合验证；分线 `4bdeebaa7` 的 tarball 与哈希不再是发布候选。最终源码包必须在作者完成许可/素材决策后从干净 `main` 重建。
- lint 的 10 个剩余 error 已全部清除（含三处真实 `createSnapshot` 运行时错误），当前为 0 errors / 265 warnings；`lint:delta` error 基线已清空。
- `doctor` 的缺少 `.env`、前后端未启动状态改成与事实一致的标签，不再一边写“已在监听/存在”一边提示缺失。
- 仍未解除的公开闸门只有外部项：三类素材权属、许可证/仓库可见性与公开 refs、GitHub 私密漏洞报告渠道、push 后 Actions 首跑。它们不得由本地验证代替。
