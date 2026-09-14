# B 线晨间摘要（night-sf-alpha-20260913）

B 线 worker 单会话实施；实际开始 2026-09-14 00:15（Asia/Shanghai），本摘要写于 01:40。
分支 `night/public-alpha-20260913` 最终为 `ff673dc`；2026-09-14 已由 O 集成进 `main`，本文件中的旧候选包不再作为可发布身份。

## 1. 先看：失败、未做与待决策项

**失败项：无。** 最终候选上 vitest 20/20 文件 200/200 用例、lint 差分门禁、Vite 构建、
diff 检查、VitePress 构建、无密钥浏览器 smoke、生产依赖 audit 全部通过。

未做/受限项（逐项原因）：

| 项 | 状态 | 原因 |
|---|---|---|
| B10 画布 createSnapshot ×3 未定义（ProseEssay.vue） | **resolved-integration** | O 确认旧 `createSnapshot` 已无 owner，三处改用当前 `addTimeline` 合同；运行时 no-undef 清除 |
| lint error 存量 | **resolved-integration** | O 串行修复共享测试、双栏模板、导入正则、档案条与散文画布；全量 lint 为 **0 errors / 265 warnings**，error 基线清空 |
| GitHub Actions 实际运行 | **blocked-external** | 本轮不允许 push；ci.yml 为本地等价验证通过，**GitHub 运行待作者 push 后首次触发** |
| stores/gameStore.js 两处行尾空格 | 未动 | `src/stores/*` 非自由写集；首次 push 的全树空白检查会报这 2 条，属可解释存量（其余已修/豁免） |
| C 线接口（Authoring.vue、面板、用户手册更新） | 未做 | C 线写权；B 仅核对 README 与手册链接目标存在 |
| 演示素材 unknown 权属 | **partially-resolved** | Kao 美术、旧主题截图/概念图与带水印参考图已在 O 后续清理中删除；当前树只剩 `authoring-image-style-presets.webp` 的生成来源/授权待确认 |

## 2. 本夜作者可感知变化（B 线范围内）

- **陌生开发者可以照 README 跑通**：clone→`npm ci`→`npm run doctor`→dev/server→无 Key 写作/导入/备份，
  全链在最终 main 的干净 clone 实测。安装不要求 SSH 凭据；npm 仍会对 Electron 上游 `@electron/node-gyp` 的 lock 元数据给出“跳过 git 依赖完整性检查”警告，不应表述成“零 git+ssh 条目”。
- **多工作树不再互相打架**：`PINAX_DEV_BACKEND_ORIGIN` 参数化 dev 代理（默认 3001 不变），
  O/A/B/C 各树可指向各自后端；实测代理真实回环，不是前端 200 假象。
- **环境问题可自助定位**：`npm run doctor`（只读）——Node 版本、原生模块 ABI、端口、密钥存在性；
  无 Key 时明确"普通写作可用，AI 待配置"，不阻断首次写作。
- **README 可对外**：真实截图（合成项目实拍）、能力分级表（可用/实验+依据）、数据边界、
  贡献与安全入口；删掉了会挂起的 Google Fonts 外链（网络守卫抓到的真实外发，样式层早已迁本地字体，零视觉变化）。
- **CI 有效**：三 job（测试+lint 差分+显式 base 空白检查 / 构建 / 无密钥作者旅程 smoke+网络守卫）；
  本地 `npm run ci:authoring-smoke` 与 CI 同命令可复跑。
- **依赖安全清零**：生产依赖 advisory 41 项（9 high，含编辑器核心 tiptap ReDoS/原型链注入）→ **0**；
  全量测试/smoke 复验无回归。

## 3. 候选身份与复验命令

- 来源分支：`night/public-alpha-20260913` @ `ff673dc`；集成候选以当前 `main` 的 `git rev-parse HEAD` 与应用诊断导出的 build commit 为准
- 实际验证环境：Node v22.22.3 / npm 10.9.8（nvm；engines 声明 `>=22.13 <23`）
- 旧 `/tmp/pinax-b-candidate/Pinax-alpha-4bdeebaa7.tar.gz` 已作废；发布时必须从最终 `main` 重新 `git archive` 并现场生成 SHA256，避免用夜间分线包冒充集成候选
- 复验入口：
  ```bash
  npm ci && npm run doctor
  npm run verify:full        # 测试+预算+lint门禁+双构建+diff
  npm run ci:authoring-smoke # 无Key作者旅程+网络外发守卫
  node scripts/check-public-links.mjs
  npm audit --omit=dev       # 0 vulnerabilities（需官方 registry，镜像不支持 audit 端点）
  ```

## 4. 公开决策清单（作者需要拍板的，全部集中在 public-readiness.md §4/§5）

1. 仓库可见性/公开时间与 refs 集合（backup/night/integration 分支去留）。
2. 许可证：保持 PolyForm NC / 换 AGPL / Apache-MIT——对照材料在
   `docs/engineering/public-alpha-license-notes.md`；当前未称 OSI 开源。
3. unknown 素材处理（§1 表）。
4. SECURITY 渠道设置：GitHub 私密漏洞报告未启用、无维护邮箱——SECURITY.md 已如实标注为公开前设置项。
5. push 后观察 CI 首跑（尤其 authoring-smoke job 的 Playwright 安装）。

## 5. B 线证据截图索引

均由本夜合成项目实际交互产生（`tmp/authoring-smoke/` 与 `docs/screenshots/`）：

| 截图 | 状态 |
|---|---|
| `docs/screenshots/welcome-1440.png` | 欢迎页实拍（已入 README，候选版本） |
| `docs/screenshots/authoring-editor-import-1440.png` | 导入合成稿+改章名+刷新后的编辑器实拍（已入 README） |
| `tmp/authoring-smoke/01-diagnostic-exported.png` | smoke：备份/诊断面板导出隐私合规 JSON |
| `tmp/authoring-smoke/02-import-preview.png` | smoke：GB18030 导入预览（章名替换） |
| `tmp/authoring-smoke/03-after-reload.png` | smoke：刷新后内容与作者改章名持久 |
