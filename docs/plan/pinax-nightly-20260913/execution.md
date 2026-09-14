# 夜间调度、集成与启动指令

本文件执行[总任务书](../pinax-nightly-storyforge-public-alpha-20260913.md)。用户请求当前轮编制计划，尚未启动实施。后续收到“开始夜间执行”后，owner按本文件推进，不再逐包征询已经明确的常规实现选择。

## 1. 四个角色与工作区

默认配置为一个Codex集成owner、三个实施worker。按项目约定优先让Claude Code CLI worker实施，Codex保留架构、续派、独立复验和集成。CLI不可用时可使用产品提供的独立agent，角色和写集保持一致；不得因为换执行工具就改变功能目标。

实施中最大并发四个角色。A/B/C可自行分解本线任务，但不再各自起一组重叠worker，不能让共享环境超出资源或模型预算。不得让Claude反向调用Codex承担自己的实现或最终验收。

计划工作树名称（启动时若已存在先检查owner，不能覆盖）：

| 角色 | branch建议 | worktree建议 | 端口建议 |
|---|---|---|---|
| O | `integration/night-sf-alpha-20260913` | `/home/recoletas/jiuguan/pinax-night-sf-o-20260913` | 前端5210，后端3010 |
| A | `night/sf-runtime-20260913` | `/home/recoletas/jiuguan/pinax-night-sf-a-20260913` | 前端5211，后端3011 |
| B | `night/public-alpha-20260913` | `/home/recoletas/jiuguan/pinax-night-sf-b-20260913` | 前端5212，后端3012 |
| C | `night/authoring-ux-20260913` | `/home/recoletas/jiuguan/pinax-night-sf-c-20260913` | 前端5213，后端3013 |

端口只是候选，先查占用；不要停止用户已有5173/5175或其他服务。每个进程记录cwd、PID、用途、端口；只清理本run创建者。依赖缓存、Vite/Vitest输出与浏览器profile隔离；B的干净安装验证不能使用共享node_modules。

当前Vite代理硬编码3001。O00先让B03交`PINAX_DEV_BACKEND_ORIGIN`参数化首片，A/C/O带入后才把/API测试指向各自后端；参数化前只做有网络拦截的纯前端基线。检查监听PID/cwd、前端代理和后端请求归属，不用“前端能打开”冒充后端隔离成功。

所有线从**同一已核对的main基线**启动，不从旧U/K/night分支拼历史。编制时main是5152aad，执行时以实际HEAD为准。若main有用户WIP，记录差异和精确范围，在独立候选保全需要的增量；不reset/clean、不整支旧integration合回。

## 2. 续接方式与时间语义

八小时从O00通过并实际派出工作开始计算。记录真实UTC时间和本地时区、T+6:30功能冻结、T+8:00截止；不能把用户发计划请求的时间当夜间开始时间。

owner必须在worker返回后继续工作：

```text
读取看板与当前时间
  → 收取worker短摘要、diff/patch、证据
  → 独立检查已完成切片，accepted或needs-fix
  → 检查下一ready包（依赖满足、写锁可用、剩余时间够）
  → 同一worker续派；worker失联则从现有工作树恢复
  → 并行继续其他线，按时进行组合验证
  → 到冻结窗口停止扩范围，到截止形成候选和回执
```

不用一次发“工作八小时”然后假定完成。每次派发建议是一个45–90分钟行为切片，或两三个紧密依赖小包；不按十分钟机械切碎。短摘要是交接点，不能被解释为整条线结束。

### 调度机制的验证

优先使用本产品已有长任务/续接能力，或保持owner活跃并等待工具/worker结果。使用CLI时记录session/process ID、可恢复工作树和结果路径；不得启动子进程后立即结束根会话，假定它会自动获新任务。

实际留下一次“第一个短包结束→owner读取状态→派发第二包”的证据，并确认非零退出/没有产物不会被当成accepted。可以复用O00/O01自然发生的两个短包，不额外造调度测试平台。

如果平台无法维持owner，可用已有安全的任务队列/周期机制；只有确实缺一小段胶水时允许最多20–30分钟写本run专用薄调度。仍不支持时，明确标“当前是单次长会话，无自动续接保证”，继续已授权的独立实现并报告限制；不能把编排工具故障变成整晚零产品进展，也不能宣称无人值守已安排。

非零退出先检查现有diff和日志是否有可恢复成果，同一原因最多两次有限重启；第三次转其他ready包并保留阻断。不能不断创建新worktree丢掉未提交结果。

owner至少每10分钟检查worker PID/session与lastProgress，每个切片交接更新落盘resume。没有新摘要先检查是否仍在工具调用/测试，不按沉默直接杀进程；鉴权/配额耗尽记录准确原因，转已声明可用执行方式或其他就绪任务。第一次续派成功只证明启动，不证明剩余八小时已经运行。

## 3. 队列和看板规则

共享入口在`docs/agent-runs/current.md`，本run专属目录为`docs/agent-runs/nightly-20260913/<run-id>/`。O单写共享板，worker只写自己摘要/样本。静态计划不当实时看板。

每包最少字段：

```text
id / line / dependencies / owner / worktree / base
allowedFiles / status / start / lastProgress / end
candidateTree / evidence / checks / failure / nextTask
```

状态：`queued → running → ready-for-review → accepted`；接口可另外附O确认的`api-ready`证据，供依赖包先接线，不能等同产品accepted。拒收`needs-fix`回原worker；遇依赖为`blocked-local`或`blocked-external`；基线已有为`verified-existing`；截止未开始为`not-started`。worker不能自己写accepted或替用户写视觉认可。

### 队列优先级

1. 数据丢失、错书、串路、stale绕过、凭据输出等已复现问题先处理。
2. 主包按各线依赖推进，保证最小完整产品链；已有能力核对完即跳下一包，不重新包装成果。
3. 主队列完成，或当前没有可推进的主包时，按A10→A11→A12→A13、B10→B11→B12→B13、C10→C11→C12→C13领取满足各自前置的储备；主包依赖恢复后优先返回主包。跨线包缺接口时转下一独立项，不空等。
4. A11+C13为可共同提优先级的扩展：O在T+3:30看到A06/C06基本稳定、其余高优先主包已可控时，可在T+5:00前共同启动，替代后续低优先储备。前置“有对应入口”指接口/写锁已约定，不是互等实现完成。没有这一条件则明确本夜不进入，不能单边enqueue无人能审阅的记忆。
5. 同问题连续25–30分钟无新证据换一种诊断；累计60–90分钟仍受外部限制，保存最小反例转下一独立包。明确的数据安全缺陷仍阻断相应切片合入，不能靠跳过测试消掉。
6. T+5:30只领能在冻结前收口的小包；T+6:30后修复、组合验证与回执。剩十分钟不开新协议/新页面。

主包提前结束但储备还有价值时不得结束整轮；所有就绪包耗尽、达到截止或所有包都确实依赖外部条件，才可终止。退出时记录每个剩余包的原因和实际时间，不把挂起/睡眠算开发产出。

## 4. 六项owner职责

### O00 · 基线、进程与启动证据

先读STATUS/LOCAL/AGENTS、相关skills，核对HEAD、dirty、worktree/端口/依赖；保留已有活跃任务信息。创建本run工作区和看板，派出A00/B00/C00；把第一轮next-task实际续派记录进去。

先生成本run浏览器fixture；三个相关Gate均依赖它，不只是模型采样。生成脚本在每个worktree固定输出`tmp/authoring-context-closure`，查看`fixture-verification.json`实际通过后再使用；不能复用旧/tmp并假定内容仍匹配新代码。前端基线与最终组合树分别核对fixture身份。

主分支基线没有必要恢复旧2h任务书未完成标记；旧任务的已实现状态以当前代码和用户确认优先。留存计划文件hash和运行开始时间，恢复时能知道执行的是哪一版。

完成标准：三个实际运行或明确ready的worker、准确写集/工作区、root仍可继续调度。只创建三份branch未发任务不能算夜间已启动。

### O01 · 45分钟内冻结边界与共享协议

审A的人物时点/两种后果/兼容和预算；确认C读模型、first-run归属、错误动作与draftSource接线；B给Node/lint/CI支持口径。输出短`contract.md`，必须带一个正例一个拒绝例。

共享schema的批准在本计划范围内，不再向睡眠用户逐字段请示；O做本地审查决定。若需要永久世界书字段或新规则引擎，超出本夜可用范围，改用会话内方案或转储备。

测试文件写锁：A→authoringTurnComposer；C→uiControlContract；B→authoringWorldbookBinding的解析修复。还需其他文件时O分配，禁止把所有新增assert拼进一个巨型用例或绕预算改后缀。

### O02 · T+2h接口回收，T+3.5h第一次纵切

收A可传输后果DTO、C代表片和B环境/CI配置，检查“新增字段是否真的从server返回”。A/C用同一合成场景，从正常UI产生回应→临时后果→下一步→对照；必要时先在O候选组合树跑，不等待各线全部完成。

只集成已自审的独立切片。C需要A的合同可cherry-pick明确提交到自己worktree，记录依赖SHA；后续O合并时利用共同commit避免重复拼接。不能让C复制A整套服务临时代码形成第二实现。

阶段提交不等到O04：接口首片完成后worker短暂释放其工作树写锁，O按commit skill与必要验证创建明确检查点commit，记录SHA后立即续派。以B03代理配置、A02合同、A05/A06接线接口这几个真实依赖边界为主，不每个小函数一个commit。最后封板再按同一规则整理候选。

owner看UI代表截图后给精确修复位置和状态。不在无截图时批准全页扩展。发现问题退给owner对应line，同时其余两线继续。

### O03 · T+5.5h第二次组合与能力取舍

核验主包残余、模型attempt预算、C页面已消费A真实结果、B新clone能执行当前命令。完整“秘密两路→条件承诺→B路试稿→编辑采用→撤销”至少走一次；不只检查API或mock模块。

数据安全红项优先修，不继续加新类型。判断A11/C13是否已具备完整实现前置；若开始太晚或来源定位不安全，整片留作后续，继续独立B/C小包。

确认C对Authoring.vue最终写权释放时间；O此时不抢写热点文件。共享文档由O吸收摘要，避免三线各改STATUS。

### O04 · 冻结候选与最后验证

T+6:30冻结新增范围，收各线最终文件清单和SHA/patch；按A合同→C接线→B公共配置（必要时B环境基底先行）的依赖顺序构造O候选。每次冲突由确切领域owner解释，不能ours/theirs整文件覆盖。

各worker按项目要求自审/定向验证，分线封板需`verify:full`；O在最终组合树执行一次`npm run verify:full`，再按受影响路径跑推演、F1/IF、设定联动、Web beta/J1/J9/J11。B本地CI smoke与最终包使用同一源码身份。

先看失败、再看总数；新增文档本地链接单独核对。截图必须从最终或与最终UI tree完全相同的版本产生；旧图不可当新状态。

常规scoped commit由O遵循commit-conventions创建，先验证再提交；worker可交patch和tree供O封装，避免多owner替彼此提交。合成候选停在integration/night分支，不自动推进main、server-version或远端。

### O05 · 晨间回执与进程交还

交`morning-review.md`、任务板、验证、精选截图、合成真实样本和公开清单。先列仍失败/未实施/用户需要决定项，再说明新行为。记录实际墙钟开始结束、三线工作/阻塞时间和停止理由。

只停止自己起的进程，保留worktree、分支、样本和失败可复现输入；不清理用户服务和缓存，不删除工作树当“整理”。STATUS/PLAN/LOG更新最新事实，旧计划入口明确已被接管但保留历史证据。

晨间用户只需对候选的产品体验与公开决定做判断，不再承担“把三份未对齐成果合起来跑”的工作。

## 5. 现有验证命令与参数

以下是编制时真实脚本参数。运行前由各线确认未改名；只有自己的服务ready后才执行。不把建议端口误当现存服务。

```bash
npm run verify:full
```

```bash
PINAX_BASE_URL=http://127.0.0.1:5210 node scripts/authoring-ui/web-beta-onboarding-check.mjs
```

先在目标worktree、对应前端dev服务上运行fixture生成器；当前脚本不支持OUT_DIR，产物固定在该树`tmp/authoring-context-closure`。必须确认其verification后才跑后面三条Gate：

```bash
BASE=http://127.0.0.1:5210 node scripts/authoring-ui/context-closure-fixture.mjs
```

```bash
BASE=http://127.0.0.1:5210 FIXTURE_DIR=tmp/authoring-context-closure OUT_DIR=/tmp/pinax-night-sf-ui node scripts/authoring-ui/rehearsal-panel-check.mjs
```

```bash
BASE=http://127.0.0.1:5210 FIXTURE_DIR=tmp/authoring-context-closure OUT_DIR=/tmp/pinax-night-sf-linkage node scripts/authoring-ui/settings-linkage-check.mjs
```

```bash
BASE=http://127.0.0.1:5210 FIXTURE_DIR=tmp/authoring-context-closure OUT_DIR=/tmp/pinax-night-sf-real REAL_DRAFT=1 node scripts/authoring-ui/rehearsal-real-sample.mjs
```

最后一条是真实付费请求，只有A08调度且已记录预算/合成fixture时运行，统一指向已经组合A+C的O服务5210并记录组合SHA，不能在缺C接线的纯A树声称生产UI采样。A在O工作树运行本脚本但仍是唯一付费请求owner，运行期间O冻结该候选代码；fixture须来自同一树，不偷偷切旧项目。B的doctor/lint-delta/CI smoke命令是待实现成果，在B交付前不写成已存在脚本。

## 6. 可复制的启动brief

### 发给总owner

```text
执行 docs/plan/pinax-nightly-storyforge-public-alpha-20260913.md 与 execution.md。
目标约8小时墙钟，A/B/C三线并行，Codex持续负责续派、接口、独立复验和本地候选。
先O00核对实际main/dirty/端口，别从旧text-game-framework integration开发。
不因worker交summary结束；主包完成继续就绪储备，T+6:30冻新功能，T+8:00交晨间候选。
派Claude CLI或可用独立worker实施，写集严格分离；Authoring.vue全夜只C写。
先实际验证一轮任务结束后的续派；工具限制不能假称无人值守已安排，也不要把整晚耗在调度脚本。
本轮允许计划内代码/文档修复、独立worktree、自己服务、合成样本和本地验证/候选提交。
不换许可证、不公开仓库、不push/tag/rewrite历史/部署，不自动合main或生产适配分支。
最终先报告红项和未完成项，给可复验源码身份、8–12张图、模型分母和公开决策清单。
```

### 发给A

```text
你是A线，读取总任务书和 runtime.md，实施A00–A09，完成后续A10–A13的就绪包。
仓库/基线以O派发的独立worktree为准。只写A获准service/composable/shared/server/样本与测试文件。
核心是knowledge+commitment走通真实server→client→route→下一步→draftSource，C负责所有Vue接线。
45分钟内交DTO和正反fixture，约2小时交第一份可接线合同；别等整线结束才交。
保持角色稳定ref、planned时点、不可变前缀、stale和零正式写入；不能只有离线模块。
真实模型合成样本最多30次总attempt，由你统一记账，失败分母保留；无凭据时转独立包。
每个切片自审并交≤500字summary/patch/证据，O验收后领取下一包；不自己标整轮accepted。
不要改Authoring.vue、C的面板/Gate、package、STATUS/PLAN/LOG，不调用Codex当你的子工人。
```

### 发给B

```text
你是B线，读取总任务书和 public-alpha.md，实施B00–B09并按优先级续B10–B13。
独占package/lock/Node/CI/lint/build-info和公共贡献文档；C提供UI Gate入口、截图和手册。
先修README与CI Node不一致、降噪后阻断新lint错误、无Key干净安装与作者smoke。
当前PolyForm许可证保持，只交决策材料；来源不明资产列unknown，不猜许可、不删用户文件。
扫描需区分当前树/全部refs历史/二进制，redact输出；不要回显.env值或真稿。
CI本地可重跑、无未拦截provider外发；不把ignoreDeadLinks下docs build当链接检查。
每片自审交短summary，主包完继续储备的真实缺陷修复/初载优化，不等待发布决定空转。
不改C的Authoring/Settings/面板、不自行公开repo、push、tag、改历史或写生产分支。
```

### 发给C

```text
你是C线，读取总任务书和 authoring-ux.md，独占Authoring.vue及本线UI/局部样式/Gate。
实施C00–C09，完成后续C10–C13就绪包；先基线，不重做已交付的布局。
修指引run刚创建就结束、按书归属、导入竞态/人工标题、自救入口、备份作者语言、modal焦点。
消费A同版DTO把后果放现有局面变化和对照；draftSource由A冻结，你做唯一生产页面接线。
正文和章名主视觉，≤1180保留顺序流，切路/对照零额外模型请求；不加新工作区或满屏卡片。
接口未就绪先做C03–C05/C07，不空等；合同double只用于代表片，最后必须正常服务链。
完整行为切片后集中截图/验证；最终精选8–12张，1440/390/720x450及暗色关键态可复验。
分线自审与封板按skill；不重写保存/撤销/stale事务，不改A的composable或B的package。
```

## 7. 只有两个worker时的压缩方案

优先三worker，因为A与C需要不同owner、B有独立价值。资源只有两个worker时，A仍专注推演，第二worker优先C；O承担B03/B04/B05/B06/B08及集成，把B01/B02/B07/B09分段交给空闲worker或在C第一纵切后续派。

这种模式吞吐低于默认三线，必须在看板明确变更，优先交完整A+C与开放最低清单；不能维持“全部42包仍承诺同晚完成”的说法。是否启用哪条储备由实际剩余时间决定，主任务不能被大量文档工作挤掉。
