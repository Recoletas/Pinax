# B 线逐包状态（night-sf-alpha-20260913）

状态：queued / running / ready-for-review / accepted（B 不自标 accepted——本表 `accepted` 指 B 线自审+门禁通过，最终 accepted 由 O 复验）/ blocked-local / blocked-external / not-started。
全部在 worktree `/home/recoletas/jiuguan/pinax-night-sf-b-20260913`，分支 `night/public-alpha-20260913`，基线 main@5152aad。

| 包 | 状态 | 依赖 | 产出/commit | 验证 | 未做原因 |
|---|---|---|---|---|---|
| B00 公开面/运行环境/清单 | accepted | O00(未在场,自核基线) | `public-readiness.md` | 实测 HEAD/Node/refs/tracked/CI/README/代理 | — |
| B01 凭据/隐私扫描（当前树+历史+二进制） | accepted | B00 | §3a 明细；gitleaks 8.30.1 redact | 20 refs 全历史 14 命中+当前树 3 命中全为同一占位串（哈希比对）；6 张关键图人工查看 | 远端 refs 未抓取（不 push 原则）；二进制仅精选人工 |
| B02 来源许可与开放定位 | accepted | B00 | THIRD_PARTY_NOTICES 补充（26 依赖实装核验+资产权属表）；`docs/engineering/public-alpha-license-notes.md` | 依赖许可证按 node_modules 实装版本读取 | unknown 素材 3 类待作者决策（未猜、未删） |
| B03 Node 统一+代理参数化+doctor | accepted | B00 | 425d448（engines/.nvmrc/ci node-version-file）；vite.config.js 代理；scripts/doctor.mjs | 代理对 3012 后端真实回环；默认 3001 不变；ws/尾斜杠边界；doctor 四场景；Node20 正确报错；干净 clone npm ci | — |
| B04 lint 降噪+窄基线门禁 | accepted | B03 | eslint.config.js 重写；scripts/lint-{baseline.json,delta.mjs}；集成窗口清除剩余错误 | 最终 0 errors / 265 warnings；error 基线为空，新 error 会阻断 | warning 债务后续按触达文件渐进清理 |
| B05 CI 作者主路径 | accepted | B03/B04 | scripts/ci/authoring-smoke.mjs；ci.yml 三 job；.gitattributes；index.html 字体外链移除 | smoke 六步本地 PASS、网络守卫 0 拦截、增量空白检查 5152aad→HEAD 0 项；YAML 校验过 | GitHub Actions 实跑待 push（blocked-external） |
| B06 贡献与安全入口 | accepted | B02 | CONTRIBUTING/SECURITY、issue 模板×2、PR 模板、good-first-issues-draft.md×5（仅本地） | 链接检查脚本覆盖 | GitHub 私密报告未启用→如实列为公开前设置项；未虚构渠道 |
| B07 公共 README+能力分级 | accepted | B02/B03/C 截图(自产) | README 重写；docs/screenshots×2（合成实拍） | 全部链接目标实测存在；clone 路径纠错；未称 OSI 开源 | C 的手册内容更新未发生（C 线权）；README 与现有手册无链接冲突 |
| B08 构建身份+诊断 | accepted | B03 | scripts/lib/resolve-build-info.mjs、src/utils/buildInfo.js、betaDiagnostic build 块 | 实树=HEAD+dirty；zip 无 .git→unknown；异源可区分；白名单四字段；backupExport 测试 3/3；产物含注入 commit | Settings 显示绑定留给 C（不动 UI 文件） |
| B09 干净环境+候选封板 | accepted | B00–B08 | 分线干净 clone 已实测；旧分线 tar 作废 | 集成树重新跑 verify/smoke/link/audit | 最终 archive 只在发布决策后从 main 生成 |
| B10 画布 createSnapshot 修复 | accepted | O 窄写权 | 三处迁移到现有 `addTimeline` owner | 全量 lint no-undef 清零、核心回归通过 | — |
| B11 首访初载诊断 | accepted（诊断半包） | B05 | 冷载 0.85MB/4 chunk；ol/pdfjs/mammoth/tiptap 均不在冷载 | dist 实测 | 诊断无错误依赖关系→按包定义不重排打包，不修 |
| B12 依赖小修 | accepted | — | 4bdeebaa7：audit 41(9H/32M)→0；tiptap 3.31.3；qs override | vitest 200/200+lint+build+smoke 全绿复验 | — |
| B13 公共文档加深 | accepted（链接检查半包） | B07 | scripts/check-public-links.mjs（6 入口/35 链接/0 断链） | 实跑通过 | 1 分钟演示脚本+英文短入口未做（依赖 C 最终截图与素材决策；剩余量优先给晨间交付） |

估算对照：主包 B00–B09 计划 405–555 分钟；本夜 B 主包实际约 70 分钟墙钟（单会话无等待），
储备 B11-lite/B12/B13-lite 约 25 分钟。
