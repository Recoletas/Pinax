# Oh Story story-review 复用来源清单

上游仓库：<https://github.com/zenstory-ai/oh-story-claudecode>
固定版本：`0ffe7db4fa02489f5d1989e58a22ce62d040a850`（root LICENSE：MIT，
全文与 Pinax 改造说明见 `public/third-party/oh-story-claudecode-LICENSE.txt`）。
依据 `docs/plan/assistant-writing-skills-20260919.md` §2.2 的取舍执行；
本清单随实际复用同批维护，未列出的上游文件一律未复制、未运行、未继承运行时指令。

## 本批（S02）实际复制与改造

| 上游路径（相对仓库根） | 本仓库落点 | 复制/改造方式 |
|---|---|---|
| `skills/story-review/scripts/check-degeneration.js` | `scripts/writing-skills/upstream/check-degeneration.cjs` | 逐字参照（仅加来源头注释、去 shebang、改 `.cjs`），只作为对照 fixture，应用代码禁止引用 |
| 同上（检测语义） | `src/services/agents/authoring/writingSkillChecks/checkDegeneration.js` | 纯函数适配：去 fs/path/process/CLI；findings 增加 UTF-16 offset locator（start/end/exact 逐字切片）；行/列诊断字段与上游保持一致 |
| 同上（验收） | `scripts/writing-skills/fixtures/*.txt` + `scripts/writing-skills-degeneration-eval.mjs` | 上游 CLI `--json` 与适配模块同输入对照（行/列/类型/严重度逐条相等）；正例 4（含 CRLF）、反例 3（台词豁免/标题行豁免/front-matter 与围栏跳过） |

## 上游其余文件状态（本批未复制）

`SKILL.md` 的 Findings Schema 与跨批审查、`references/review-quality.md`、
`references/style-resolution.md`、`references/tracking-transaction.md`、
`scripts/check-ai-patterns.js`、`scripts/style-whitelist.js`、
`scripts/normalize-punctuation.js`、`tracking_commit.py`、`author_memory_commit.py`：
按计划暂缓或排除（不搬追踪数据库、不建 `.deslop-whitelist`、标点优先复用
Pinax 既有校对实现）。后续批次（S04+）复用时先在本清单登记，再随代码
适配同批更新 `public/third-party/`。
