# C 线任务状态(c-ux-20260914)

树:`night/authoring-ux-20260913`(基线 main@5152aad),工作区 `/home/recoletas/jiuguan/pinax-night-sf-c-20260913`,前端 5213。实施为单会话顺序执行;没有 O/A/B 同跑,写锁按计划自守。

| 包 | 状态 | 提交 | 验证 | 说明 |
|---|---|---|---|---|
| C00 基线 | done | 2ab1ec3(含截图工具) | 12 张基线图 + c00-baseline.md | 6 项缺口定位;导入预览/空库/保存安静态 verified-existing |
| C01 指引按书归属 | done | 2ab1ec3 | 单测 6/6 + first-run-ownership-check 9/9 + web-beta Gate | useAuthoringFirstRun;创建 run 不再冒充完成;回应后提示归右栏;菜单重开 |
| C02 回访回到作品 | done | ded7d9b | welcome-returning-check 6/6(J02) | 继续书名成首要动作,390 首屏可点;空库路径不回归 |
| C03 导入保护 | done | cfee1ba | manuscript-import-guard-check 13/13(J03/J04) | 读取一次性身份;书名/章名手改保护+撤销;手动编码常驻折叠;quota 错误入框 |
| C04 备份作者语言 | done | ed55140 | backup-language-check 8/8(J12) | 分区重排;真实 metadata;恢复直达回程;失败给下一步 |
| C05 保存自救 | done | 715355b | save-rescue-check 9/9(J12) | 自救条三动作;导出实时正文;刷新后恢复稿入口可达;成功退场 |
| C07 键盘焦点 | done | a2782a7 | settings-focus-check 10/10(J14) | useTransientLayer 层栈(嵌套 Esc 只关顶层+IME 守卫+卸载补焦点恢复);SettingsPopup Tab 圈/焦点返回/方向键;52px 触控 |
| C08 精修+手册 | done | 602cfd8 | 视口矩阵图 1280/1024/900暗色 | 长章名省略号可供性+title 全名;更多菜单 备份与恢复;两份手册同步;reduced-motion verified-existing |
| C06 后果对照 | partial | 21dedca | 浏览器验证(推演失败回程) | 失败就地回程完成:中文错误+重试+检查模型连接+焦点回程+草稿保留 |
| C06 后果 DTO 接线/补充本次条件 | blocked-external | — | — | A 线缺席,无 baseline 冻结接口与后果 DTO;按计划不用自由文本冒充结构化后果、不造假接口 |
| C09 封板 | done(本线范围) | 见 verification.md | verify:full exit 0 | 五条旅程中四条完整走通;推演对照旅程的 A 依赖段阻塞 |
| C10 示例书 | not-started | — | — | 依赖 B07 演示物料,时间用于封板 |
| C11 目录小屏 | not-started | — | — | 主包完成后时间不足 |
| C12 历史面板抽取 | not-started | — | — | 同上 |
| C13 记忆逐项记住 | blocked-external | — | — | 需 A11 共同窗口;浮动“记忆·N 条”胶囊在移动端遮挡问题记录待 O 裁决(MemoryIndicator 为全局文件,不在 C 写集) |

## Gate 维护记录(最少必要增量)

- `web-beta-onboarding-check.mjs`:GB18030 断言收窄到摘要行(C03 常驻折叠层使选项文本常驻 DOM);恢复成功断言改 C04 新文案+直达链接(813d7f2)。其余流程未动。
- `rehearsal-panel-check.mjs`:无改动,304/304 通过(含 first-run hint、失败块共存)。
- `settings-linkage-check.mjs`:无改动,20/20 通过(useTransientLayer 层栈无回归)。
