# Round 2 - Visible Entry / Canvas / Advisor / Comic

本轮由用户手动启动四个 agent。Codex 只负责架构、任务边界、最终审查和合并，不主动启动 worker。

## 冻结基线

- 产品代码共同基线：`635a439038a16a3306ab9b30c45c4d3412250957`
- 四个 worktree 只允许在上述提交之后包含本目录与 `docs/agent-runs/current.md` 的调度文档提交；开始业务修改前不得存在其他代码提交或未提交文件。
- 禁止从 `main`、旧 feature branch、stash 或其他 worktree 复制整页文件。
- 禁止 `git reset --hard`、`git stash pop`、切换到别的 branch，或把其他窗口 commit 提前合入自己的分支。

开始时必须执行：

```bash
git branch --show-current
git status --short
git merge-base --is-ancestor 635a439038a16a3306ab9b30c45c4d3412250957 HEAD
git log --oneline -3
```

如 branch、基线或工作区不符合各 prompt，停止并报告，不自行修复 git 历史。

## 窗口

| ID | Worktree | Branch | Prompt | 独占区域 |
|---|---|---|---|---|
| R2-A | `/tmp/pinax-r2-entry` | `round2/visible-online-entry` | [联机入口](./prompt-a-entry.md) | AppShell / workbench nav |
| R2-B | `/tmp/pinax-r2-canvas` | `round2/canvas-video` | [画布与视频](./prompt-b-canvas-video.md) | ProseEssay / canvas |
| R2-C | `/tmp/pinax-r2-advisor` | `round2/advisor-lifecycle` | [顾问生命周期](./prompt-c-advisor.md) | Advisor shared core |
| R2-D | `/tmp/pinax-r2-comic` | `round2/comic-production` | [漫画制作](./prompt-d-comic.md) | Notes / Comic |

## 共享约束

1. 不启动 dev server，不重启用户后端，不调用真实 LLM、图片或视频 provider。
2. 不修改 `docs/STATUS.md`、`docs/PLAN.md`、`docs/LOG.md`、`docs/agent-runs/current.md`、`AGENTS.md`、主 store 或其他窗口文件。
3. 不新增测试用例数量。需要覆盖新行为时，把断言合入 prompt 指定的现有 test body；项目总量必须维持核心 188 + 视觉 12。
4. 每个窗口先定位根因，再实现；不得用整页旧版本覆盖当前文件。
5. 每个窗口必须运行定向验证、`npm run build` 和 `git diff --check`，自审后创建一个 conventional commit，不写 `Co-Authored-By`。
6. 结果摘要不超过 400 个汉字，只写改动文件、行为、验证和残余风险；不提交原始日志。

## 交付与合并

每个 agent 完成后只向用户报告：commit hash、结果文件、验证状态。Codex 后续按 `R2-A -> R2-B -> R2-C -> R2-D` 顺序审查并 cherry-pick；任何越界修改先剔除或退回，不直接合并。

用户可分别对四个窗口发送：

```text
进入指定 worktree，阅读 AGENTS.md、docs/STATUS.md、LOCAL.md（若非空）以及该窗口 prompt，严格执行并提交。不要调用其他 agent。
```
