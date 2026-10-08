# kit 运行时落地：方案重梳 + 可行性 / 风险 / 工单（2026-10-08）

> 触发指令：「重新梳理方案，细化可行性，风险和工单」
> 本文把 `kit-runtime-plan-revision-20261008.md`（P1-a…P1-f / P2-a…P2-e / R1–R4）与 `kit-microservice-forms-20261008.md`（M1–M6）合并重排成 **3 波 15 张工单**，每张带可行性取证、风险、范围与文件归属、验收命令、依赖。
> 基准裁定：**Q1 = ③（维持子进程形态）**，依据见微服务调研 §5.3；若改选 ①，差异集中在 §6。
> 纯文档，未改代码、未起服务。`kit/` = `D:\storyflow-kit\`（兄弟仓），其余相对路径 = `D:\pinax-storyharness\`。

---

## §0 结论先行

**一、重排后的施工顺序是「先止血、再证路、后铺满」，而不是原 PRD 的「先内嵌、再切片」。** 原因是本次复测推翻了修订版 PRD 的三个前提（下面第二条），而剩下真正卡脖子的只有一件事：kit 自己的 agent 循环没有系统提示折叠层。这件事的修复成本比原先估的低得多，但它现在是**在跑的风险**，不是理论风险，所以从「P1-f 的前置」提升为**第一张工单**。

**二、三处前提被本次实测推翻，工单据此重定范围。**

1. **P1-e「三代表切片切 kit 通道」在传输层已经做完了。** 四条漏斗入口今天全部指向 kit：`chat.js:574`（`forwardComplete`）、`chat.js:925`（`forwardCompleteStream`）、`generationAgent.js:93`（`runKitFunnelProviderTurn`）、`structuredGenerationRunner.js:260`（`createKitFunnelFetchImpl`，仅 `routing.mode === 'kernel'` 时），连 fail-open 层自己也是先试漏斗（`textModelAgentProvider.js:223`）。路由判定在 `modelRouting.js:24-40`：服务器持有 key 且任务面探测通 → `kernel`。所以剩下的不是「切通道」，而是**循环归属**——B 链的多回合循环仍在 Pinax 进程里跑，kit 只当传输管。这比原描述重得多，工单 W1-1 因此改成「评估 + 单点试点」，不是「三条一起切」。

2. **P1-b「49 项能力目录派生成注册表、断言 49/49 相等」不可行，而且没必要。** 不可行：kit 的 `capability-manifest@1` 是**工具声明面**契约，`id` 的 pattern 是 `^[a-z][a-z0-9_]*$`（`kit/contracts/capability-manifest.schema.json:23`），而 49 项 canonical id 全带点（`settings.foundation.generate`、`canvas.relate`），实测 **0/49 匹配**；契约还 `additionalProperties: false`，装不下 `workflowKind / contextProfile / inputSchema / resultSchema / effectPolicy` 这五个字段。没必要：kit 的任务面**不做能力注册**，能力规格是**每请求内联传进去的**——`capabilityTaskRunner.js:43-46` 把 `systemPrompt` + `submitTool{name,description,parameters}` 直接放请求体，kit 侧 `runner.ts:97` 读 `req.capability`、`server.ts:82` 校验它只能出现在 `taskKind=capability`。真正存在的重复风险在 **Pinax 仓内部**：`shared/agentCapabilityContract.js` 49 项 canonical 与 `shared/capabilityToolContracts.js` 21 项工具规格，**交集 19**、只在工具侧 2（`experience.next-actions`、`experience.emergence`）、只在 canonical 侧 30。工单 W1-2 据此重写。

3. **R1 比原估的便宜，也比原估的紧急——而且它的根因很可能被记错了，详见下面结论五。** 便宜：pi-ai 0.87.1 的 `ProviderRequestOptions` 就带 `fetch?` 与 `onPayload?`（`kit/storyharness/node_modules/@earendil-works/pi-ai/dist/types.d.ts:57,67,78`），`SimpleStreamOptions extends StreamOptions extends ProviderRequestOptions`（`types.d.ts:224`、`:111`），`models.streamSimple` 把除 `transformHeaders` 之外的全部选项原样透传（`dist/models.js:377-378`、`:392-398`），openai-completions 适配器在 dispatch 前调用 `onPayload(params, model)` 并采纳返回值（`dist/api/openai-completions.js:186-191`）。也就是说**折叠层能直接挂在 kit 自己的 `makeStreamFn` 上，不改 pi-agent-core、不改 createProvider、不升依赖**。紧急：`capabilityTaskRunner.js` 与叙事回合走的是 `POST /v1/pinax/tasks` → kit 的 agent 循环 → `runner.ts:128` 的 `initialState.systemPrompt`，这条路**今天就在裸发**，2026-10-08 早间那次空补全之所以没变成用户可见故障，靠的是 `capabilityTaskRunner` 抛错后调用方回落漏斗直连（双层 fail-open）。缓冲还在，但它是运气不是设计。

**三、门禁现状比上一版记录宽松，给了 Wave 1 一点余量。** 实测 `node scripts/architecture/structure-budget-check.mjs`：`src/pages/Authoring.vue` **10591/124**（上限 10900/125）、`src/services` 根层 JS **16/20**、**production cycles 0/0**（此前记录的 4 条已随 `b8fd25e` 清零）、exit 0。vitest 预算仍是 `MAX_TEST_FILES = 20` / `MAX_TEST_CASES = 200`，当前 20 文件 / 200/200 全绿（旧「198 过 / 2 红存量」已由 `1d50307` 断言同步收口）。**含义**：服务端加工单不占前端格位，但**新增测试文件已经顶格**——所有工单的验收必须以「合并置换现有用例」为原则，不能新增文件。

**四、有一道门禁是纸面的。** `scripts/check-bridge-sync.mjs` 存在、当前跑通（实测 `[sync] 全部一致（2/2 对检查）`、exit 0），`docs/engineering/current-architecture.md:173` 也引用了它，但**它没被任何 npm script 调用**——`verify:full` 的链条是 `vitest → lint:delta → vite build → architecture:build-size → architecture:check → git diff --check → vitepress build`，中间没有它，`package.json` 里也没有 `bridge-sync` 这个 script 名。两份桥副本（Pinax `src/services/agents/storyagent/piNarrativeAgentBridge.js` ⇄ kit `storyharness/src/pinax/pinax-side/pinaxNarrativeAgentBridge.js`）今天一致，但没有任何机制阻止它们明天漂移。工单 W0-2 就是把它接进去，成本一行。

**五、R1 的根因可能不是「网关拒绝 system 消息」，而是「kit 把 system 发成了 developer」——这条已运行时确证，且修法比折叠更便宜。**

10-08 早间事故的记录口径是「dots3-note-prev 网关对任何带 system 消息的请求返 400」。本次用 **stub fetch 离线探针**（不发网络请求、不起服务、不需要真 key）实测了 kit 在当前配置下真正发出的请求体，结果与那条口径不一致：

```
provider=openai compat={maxTokensField:max_tokens} (kit 通用回落)  | roles: ["developer","user"] | store: false | reasoning_effort: undefined
provider=dots   compat=dots profile(全旗标)                        | roles: ["system","user"]    | store: undefined | reasoning_effort: undefined
provider=openai compat={maxTokensField:max_tokens} + reasoning=medium | roles: ["developer","user"] | reasoning_effort: medium
provider=dots   compat=dots profile + reasoning=medium                | roles: ["system","user"]    | reasoning_effort: undefined
```

链条是这样的：当前生效配置是 `provider: "openai"`、`model: "dots3-note-prev"`、`baseUrl: https://note3-prev-api.askdiandian.com/v1`、`thinking: "off"`（读自 `adapters/pinax-adapter/.external/pinax-adapter.json`，**只读了 provider/model/baseUrl/thinking 四个非敏感键，apiKey 未读**）；`/healthz` 回显的 `openai.dots3-note-prev` 正是 `server.ts:166` 的 `${cfg.provider}.${cfg.model}` 拼法，可反推 provider id 就是 `openai`。而 kit 的 `PROVIDER_PROFILES` 只有 `dots` 与 `minimax` 两个键（`llm.ts:38-46`），**`openai` 不在表里**，于是 `makeModels` 走 `llm.ts:63` 的通用回落 `{ maxTokensField: "max_tokens" }`——这个回落**只钉了 maxTokensField，没钉 supportsDeveloperRole**。pi-ai 的 `getCompat` 是逐字段 `model.compat.X ?? detected.X`（`dist/api/openai-completions.js:1307-1312`），未钉的字段就落到 `detectCompat`；而 `detectCompat` 的 `isNonStandard` 名单里**没有 `askdiandian.com`**（只有 nvidia/cerebras/xai/together/chutes/deepseek/zai/moonshot/opencode/cloudflare/ant-ling，`:1218-1247`），于是 `supportsDeveloperRole = !isNonStandard && !isOpenRouter = true`；再叠加 `llm.ts:88` 写死的 `reasoning: true`，`convertMessages` 的 `instructionRole = model.reasoning && compat.supportsDeveloperRole ? "developer" : "system"` 就取了 **`"developer"`**。

**而 kit 自己的源码注释早就记了这个坑**：`llm.ts:18-20`「dots.ai 等国产端点实测：**拒绝 developer 角色（400 provider.client_bad_request）**、不发 reasoning_effort」。`PROVIDER_PROFILES.dots` 那三个 `false` 就是为它设的——**但因为 provider id 配成了 `openai` 而不是 `dots`，这份 profile 从来没被选中过。**

这同时给了 10-08 事故一个更自洽的解释：一个 OpenAI 兼容网关拒绝 `role:"system"` 是很反常的，拒绝 `role:"developer"` 则正是 kit 注释里记录的行为。Pinax 的 `foldSystemIntoPrompt` 之所以"修好了"漏斗三入口，不是因为折叠本身有什么魔力，而是**删掉 system 消息就等于删掉了那个 `developer` 轮**；kit 的 agent 循环保留 systemPrompt，于是保留 `developer`，于是失败。

**证据分级（必须分清）**：
- **已运行时确证**：当前配置下 kit 发出的首个消息角色是 `"developer"`，且带 `store: false`；`thinking` 非 off 时还会带 `reasoning_effort`。这三项都是 stub fetch 抓到的真实请求体字段。
- **未确证（属推断）**：`askdiandian.com` 这个具体网关是否真的对 `developer` 返 400。依据是 kit `llm.ts:18-20` 对同族端点的实测记录 + 10-08 事故症状吻合，**我没有发过真请求**。这条要由 W0-1 的第一步验掉。**→ 已由 W1-1 的 8 形状离线探针收口（2026-10-08）：真正的拒绝面是「独立 system 轮」（`system` 与 `developer` 同拒），顶层症状是空补全/立即 `[DONE]` 而非 HTTP 400；详见 W1-1 落地记录。**
- **顺带发现的第二处潜在分歧**：`thinking` 的 kit 缺省值是 `"medium"`（`pinax/config.ts` DEFAULTS），当前配置文件显式写了 `"off"` 才把 `reasoning_effort` 压住。**谁要是删掉那行 thinking 覆写，就会开始向这个端点发 `reasoning_effort`**——而 dots profile 明确把它设为不支持。

**对方案的影响**：R1 现在有两个修法，**B 比 A 便宜且是根因**，W0-1 因此改成「先 B 后 A」，详见该工单。而且这个 stub fetch 探针本身就是**可复用的离线验收手段**——它绕开了 CR-6（agent 会话进程树不能起长驻服务）对 W0-1 验收的阻塞。

---

## §1 波次总览

| 波 | 目标 | 工单 | 依赖 | 是否动业务逻辑 |
|---|---|---|---|---|
| **Wave 0** 止血 + 门禁 | 把「靠运气没炸」变成「结构上炸不了」，把纸面门禁变成真门禁 | W0-1 ✅ / W0-2 ✅ / W0-3 ✅ / W0-4 ✅ / W0-5 ✅（均 2026-10-08） | 无，可立即并行 | **否**（W0-1 改的是 kit 的 provider profile 命中轴，不改 Pinax 业务分支；W0-2 只加 npm script 与链条） |
| **Wave 1** 证路 | 单点证明 kit 循环能承接生产任务，同时把两份目录收成单源 | W1-1 ✅ / W1-2 ✅ / W1-3 ✅ / W1-4 ✅ / W1-5 ✅（均 2026-10-08，W1-5 出口=零删除裁定） | W1-5 硬依赖 W0-1；W1-1 依赖 W0-1（已满足） | 是 |
| **Wave 2** 铺满 | 全量搬迁 + 退役 + 文档收口 | W2-1 … W2-5 | 依赖 Wave 1 全部出口 | 是 |

**两波之间不留间隔这条纪律保留**（原 PRD 判断正确：双循环形态长期化会让合同测试各自漂移）。但 Wave 0 与 Wave 1 之间**必须**留一个验证窗口——W0-1 落地后要等一次真实的模型调用留证，才允许动 W1-5 的删除。

---

## §2 Wave 0：止血与门禁

### W0-1 · ✅ 已落地（2026-10-08）· 修掉 kit agent 循环的上游 400：实际修法是「补齐 profile 命中轴」；折叠层（纵深）降为可选

**可行性：高。两步都已取证到可执行程度，第二步还逐层取证到了上游 dist 源码。第一步的验证手段是离线的，不需要起服务。**

**✅ 已落地（2026-10-08）——实际修法是第三变体，B 的两个候选都没走。** 开工预检把前两条路都证伪了：

- **候选 1（改配置）废**：`src/services/textProviderConfigStore.js:20-30` 的 `TEXT_PROVIDER_TYPES` 九条目录里**没有 dots**；`ApiSettingsPanel.vue:70` 把选中配置的 `providerId` 原样塞进 patch（回退默认值就是 `openai`），`:135-145` 的 `onMounted` 在引擎探活成功后**自动**调 `applySelectedToEngine()`，POST 到 `/api/storyagent/model`；kit `modelFunnel.ts:40-42` 收下 `provider` 并**持久化进配置文件**。所以活配置里的 `"openai"` 不是手滑写错的，是这条链唯一能产出的值——改配置文件会在下次打开设置面板时被静默覆盖。
- **候选 2（改通用回落）废**：`kit/storyharness/test/llm-profiles.test.ts:32-37` 有一条断言把 generic 回落钉死成 `{ maxTokensField: "max_tokens" }`，断言消息原文「兼容面缺省：OpenAI 兼容中转普遍只认 max_tokens」；`llm.ts:61-62` 的注释明写作者是**刻意**不让 generic 带 dots 旗标。单方面改等于回退上游一个有测试保护的决定 → 只能当上游建议提，不在本单。
- **根因另找**：不是「回落缺旗标」，而是「`PROVIDER_PROFILES` 只能按 **provider id** 命中，而 pi-ai 自己的 `detectCompat` 是按 `provider === X || baseUrl.includes(域名)` **双轴**命中」（`pi-ai/dist/api/openai-completions.js:1221-1247`；`api.ant-ling.com` / `chutes.ai` / `opencode.ai` 这类单家小域名都在表里）。设置面板的 provider 是**厂商预设**，用户把 baseUrl 手填到别家端点后预设 id 表达不了真实端点——这才是缺口。
- **实际改法（kit 仓，约 15 行）**：`ProviderProfile` 加 `hosts?: string[]`；新增 `resolveProfile(provider, baseUrl)` 先按 id 查、未登记再按域名兜底；`dots` 加 `hosts: ["askdiandian.com"]`；id 命中时压过域名推断。与 pi-ai 自己的双轴判别同构，不碰那条被钉住的断言，也不改 Pinax 的 UI 目录（用户已明确「不加 dots 预设」）。
- **验证**：`test/llm-profiles.test.ts` 新增 3 例（命中域名取 dots 旗标 / 不命中仍走 generic / id 压过域名）→ **9/9 过**；**离线 stub-fetch 探针已固化为常驻测试 `test/llm-request-shape.test.ts`**（不再用完即删）——两例钉住最终发出的请求形状：dots 域 `roles:["system","user"] store:undefined`、generic 端 `roles:["developer","user"] store:false`（把这个已知坑也钉住，改前先读该测试）；`npm run typecheck` 干净；全量 `npm test` **131/131 过**。
- **副作用**：这条改动顺带把 `store` 分歧一起压掉了（三处都在同一份 profile 里钉着），`reasoning_effort` 同理——原计划留给「修法 A 之后」的第二、三处分歧，现在一并解决。**修法 A（折叠层）因此降级**：根因修掉后它只剩「对将来别的怪网关的保险」价值，不再是 W1-5 删除的硬前置，是否还做由后续裁定。

**✅ 已收口（2026-10-08，W1-1 实测）**：真网关那一测已由 W1-1 的真实调用完成——拒绝面确认为**独立 system 轮**（system 与 developer 同拒），顶层症状=空补全/立即 `[DONE]`（非 HTTP 400）；临时实例真实调用成功落盘 `task-pcap_muz9aqil_68f36c12.jsonl`，生产实例真实调用 completed（`task-pcap_muzakkb7_1bcfd7d9`）。两仓症状记录的矛盾据此统一：`kitModelGateway.js:43` 的「空补全」是顶层真相，`llm.ts:19` 的「400」只对「单独 system 轮」这一内层面成立。hosts 修复（本单）+ Pinax 侧折叠层（既有）组合随真实调用共同验证。

**修法 A（纵深，后做）：在 kit 侧镜像 `foldSystemIntoPrompt`。**

- 折叠层在 Pinax 侧的现成实现：`server/services/kitModelGateway.js:45-58`，四条漏斗入口全覆盖（`:61` `forwardComplete` 首行即 `const folded = foldSystemIntoPrompt(payload)`、`:83` `forwardCompleteStream` 同、`:171` `runKitFunnelProviderTurn` 经 `forwardComplete` 间接受覆盖、`:202` `createKitFunnelFetchImpl` 自带 HTTP body 级第二道）。
- kit 侧**零命中** `foldSystemIntoPrompt`；相反，`kit/storyharness/src/pinax/modelFunnel.ts:164-197` 的 `toPiContext` 做的是**反方向**的事——把 `role === 'system'` 的消息合并进 `systemPrompt` 字段，于是那条消息照发（只是换了个位置存放）。
- **为什么 B 修好了还要 A**：B 只修「这一个网关拒绝 developer 角色」这一种失败形态。A 让 kit 不再依赖任何单一网关的角色处理——**这才是 W1-5 能删掉 `textModelAgentProvider` 的前提**，因为删掉缓冲的正当性来自「kit 自己对上游抖动免疫」，而不是「我们把已知的这一个抖动修了」。
- 注入点确认存在且可达：
  - `pi-ai/dist/types.d.ts:57` `interface ProviderRequestOptions`，`:67` `fetch?: FetchFunction`，`:78` `onPayload?: (payload, model) => unknown | undefined | Promise<...>`（注释原文：「Optional callback for inspecting or replacing provider payloads before sending. Return undefined to keep the payload unchanged.」）
  - `pi-ai/dist/types.d.ts:111` `StreamOptions extends ProviderRequestOptions`、`:224` `SimpleStreamOptions extends StreamOptions`
  - `pi-ai/dist/models.d.ts:46` `ModelsSimpleStreamOptions = SimpleStreamOptions & ModelsRequestTransforms`、`:143` `completeSimple(model, context, options?: ModelsSimpleStreamOptions)`
  - `pi-ai/dist/models.js:377-378` `const { transformHeaders: _transformHeaders, ...providerOptions } = options ?? {}; const requestOptions = { ...providerOptions, apiKey, headers, env }` —— **`onPayload` / `fetch` 原样透传**
  - `pi-ai/dist/api/openai-completions.js:186-191` `let params = buildParams(...); const nextParams = await options?.onPayload?.(params, model); if (nextParams !== undefined) params = nextParams;` —— `params` 就是 `client.chat.completions.create(params, ...)` 的请求体
- kit 侧的收口点是 `makeStreamFn`（`kit/storyharness/src/llm.ts:128-131`），它已经把 options 展开透传：`models.streamSimple(model, context, { ...options, maxTokens, timeoutMs })`。在这里塞一个 `onPayload` 缺省值，`chat.ts:289` 与 `executor.ts:192` 两个调用点自动受益。
- **但 `runner.ts` 的两处不走 `makeStreamFn`**：`:134-135` 与 `:259-260` 各自内联 `models.streamSimple(m, context, { ...options, maxTokens: …, timeoutMs: … })`。所以要么把这两处改成调 `makeStreamFn(models, maxTokens, timeoutMs)`（签名已经支持这两个参数），要么在两处各加同一个 `onPayload`。**推荐前者**：一处收口，四处受益，且删掉重复的 maxTokens/timeoutMs 表达式。
- **一个必须注意的细节：systemPrompt 会在运行中被改写。** `runner.ts:290` 在 BeatPlan 规划轮受理后就地追加内容——`(agent.state as {systemPrompt:string}).systemPrompt = \`${agent.state.systemPrompt}\n\n== 本轮计划已提交…==\``。这意味着折叠层**不能在任务开始时算一次就缓存**，必须每回合从当次 `params.messages` 现算。`onPayload` 天然是每次 dispatch 前调用（`openai-completions.js:188`），正好满足这个要求；这也是**优先选 `onPayload` 而不是在 `toPiContext` 里折叠**的理由之一——后者只在请求入口跑一次，覆盖不到运行中的改写。
- **折叠层必须同时认 `"system"` 和 `"developer"` 两个角色。** `pi-ai/dist/utils/transcript.js:19` 的注释是「Fold `Context.systemPrompt` and `Context.tools` into a leading system message」，即 `systemPrompt` 先被 `normalizeContext` 转成首条 system 消息；随后 `convertMessages`（`api/openai-completions.js:866`）按 `instructionRole = model.reasoning && compat.supportsDeveloperRole ? "developer" : "system"` 决定**最终发出的角色**。修法 B 落地后当前配置会发 `"system"`，但这是个**随 compat 旗标变化的移动靶**——只认 `"system"` 的折叠层会在旗标翻转时静默失效。

**风险**

| 风险 | 等级 | 缓解 |
|---|---|---|
| **修法 B 的候选 2 影响所有自定义 baseUrl 端点**，可能把某个真支持 developer 角色的端点降级 | 中 | 降级只是「少发一个字段、角色用 system」，`system` 是 OpenAI 兼容面的通用角色，不存在「因为收到 system 而 400」的端点；反过来 `store:false` 与 `reasoning_effort` 的抑制同理。风险不对称：保守缺省的代价是零，乐观缺省的代价是 400 |
| **修法 B 的候选 1（改 provider id 为 `dots`）可能连带影响 auth 解析与 healthz 回显** | 中 | 先 `grep -rn '"openai"'` 盘 kit `pinax/` 与 Pinax 侧有无字面匹配；不确定就用候选 2 |
| 修法 A 的折叠改变 prompt 语义（system 内容变成 user 轮开头），可能影响模型对指令层级的服从度 | 中 | Pinax 侧同一套折叠已在生产跑了整个 10-08，未见服从度回归；kit 侧照抄同一份文本拼接顺序（`[systemPrompt, ...systemInMessages].join('\n\n')` 前置到首个 user 轮），不自创变体 |
| 折叠层只认 `"system"` 而在旗标翻转后静默失效 | 中 | 同时认 `"system"` 与 `"developer"`；在 `PROVIDER_PROFILES` 上方留注释说明这个耦合 |
| `onPayload` 只对 openai-completions 适配器验证过；kit 若将来接 anthropic-messages 等别的 api，折叠位置不同 | 低 | 当前 `llm.ts:85`（模型描述符 `api: "openai-completions"`）与 `:97`（`api: openAICompletionsApi()`）都是单一 api，全仓无第二种；在 `onPayload` 实现里按 `payload.messages` 存在性判定，缺失即原样返回 |
| BeatPlan 规划轮（`runner.ts:256-260`）折叠后 prompt 变长，撞 maxTokens 900 的规划轮上限 | 低 | 规划轮 `systemPrompt = buildBeatPlannerPrompt()`（`:257`）是固定长度模板，折叠不引入新内容，只换位置 |
| 改的是兄弟仓，Pinax 侧无法用本仓测试覆盖 | 中 | 见下面验收第 1 条：**离线 stub fetch 探针**已经把「kit 发出什么」变成可在 Pinax 侧断言的东西，不必依赖起服务 |

**范围与文件归属**

- 修法 B：`kit/storyharness/src/llm.ts:63`（通用回落的缺省旗标）**或** `adapters/pinax-adapter/.external/pinax-adapter.json` 的 `provider` 键（Pinax 侧，**该文件含 apiKey，改动时不要把值写进任何提交或报告**）
- 修法 A：`kit/storyharness/src/llm.ts` 新增并导出 `foldSystemPayload(params)`，在 `makeStreamFn` 里作为 `onPayload` 缺省值挂上（调用方显式传了 `onPayload` 时串接而非覆盖）；`kit/storyharness/src/pinax/runner.ts:134-135`、`:259-260` 两处内联 streamFn 改调 `makeStreamFn`
- `kit/storyharness/src/pinax/modelFunnel.ts:164-197` 的 `toPiContext`：**建议不改**。它服务 `/v1/pinax/complete` 这条一次性补全路径，而该路径的调用方（Pinax `forwardComplete`）已在自己侧折叠过，再折一次是空操作；改了反而制造「谁负责折叠」的歧义。在其上方加一行注释说明分工即可。

**验收**

1. **离线探针（不需要服务、不需要网络、不需要真 key）**：用 stub fetch 抓取 kit 实际发出的请求体，断言 `messages.map(m => m.role)` 不含 `"developer"`、不含 `store` 字段、`thinking` 非 off 时不含 `reasoning_effort`。本次已跑通这套探针（§0 结论五的四行输出就是它的产物），可直接固化成 `scripts/*.mjs` 挂进 `architecture:check`——**它同时绕开了 CR-6 对验收的阻塞**。
2. `cd kit/storyharness && npm run typecheck` 通过
3. 起 8451（**用户在独立终端起，不由 agent 会话进程树起**——kit `AGENTS.md:61`、`kit/scripts/ops/README.md:35`），`curl --noproxy "*" http://127.0.0.1:8451/healthz` 回 `ok:true`
4. 用 `taskKind=capability` 发一个真实任务（可复用 `capabilityTaskRunner.js:38-50` 的请求体形状），断言：SSE 收到 `task.completed`、`capabilityResult` 非空、`usage.totalTokens > 0`（**usage 全 0 正是空补全的指纹**）
5. **验掉 §0 结论五里那条未确证的推断**：若第 4 步在只做修法 B 之后就通过，则「网关拒绝 developer 角色」得到确证，10-08 事故的记录口径应据此改写（`docs/LOG.md` / `docs/src/known-issues.md`）；若仍失败，则原口径「拒绝 system 消息」另有其因，修法 A 是唯一出路，且要把新证据记下来。**→ 两种分支均未走（修法 B 作废）：已由 W1-1 的 8 形状离线探针收口——拒绝面是「独立 system 轮」（system 与 developer 同拒）、顶层症状=空补全；10-08 事故口径已按此统一（见该单「已收口」）。**
6. Pinax 侧回归：`npm run verify:contract` 保持 20 文件 / ≤200 用例全绿

**依赖**：无。**这是全案第一张工单**，且是 W1-5 的硬前置。修法 B 与 A 可分两次提交，B 先行。

---

### W0-2 · ✅ 已落地（2026-10-08）· 把 `check-bridge-sync` 接进门禁

**可行性：极高，脚本已存在且当前通过。** 实测 `node scripts/check-bridge-sync.mjs` → `[sync] 全部一致（2/2 对检查）`、exit 0。脚本本身设计得也对：kit 仓不在场时**显式提示并跳过**（`:38-42`，环境性豁免），在场漂移才 exit 1（`:79-82`）；锚点模式只比对锚点行以下（`:53-64`），允许两副本的 import 前缀不同。

**风险**：几乎为零。唯一要注意的是它**必须保持环境性豁免**——CI 上没有兄弟仓，如果改成硬失败会把所有 CI 打红。现脚本已经是这个行为，接线时不要顺手改。

**范围**：`package.json` scripts 增 `"bridge-sync": "node scripts/check-bridge-sync.mjs"`，并把它插进 `verify:full` 链条（建议放在 `architecture:check` 之后、`git diff --check` 之前——它和结构门禁同属「不变量检查」，且比 build 快）。

**验收**（已跑完，除第 3 步外）：`npm run bridge-sync` exit 0（实测输出 `[sync] 全部一致（2/2 对检查）`）；负测——往 kit 副本追加一行后报「副本已漂移」并指出第 130 行起不一致，从备份还原后复验通过；`npm run verify:full` 的链条里已插入 `npm run bridge-sync`（`architecture:check` 之后、`git diff --check` 之前，见 `package.json`）。

**依赖**：无。

---

### W0-3 · ✅ 已落地（2026-10-08）· 清理适配器遗留任务目录

**可行性：高，纯删除，且目标全部 gitignored。** 实测 `adapters/pinax-adapter/` 下 `git ls-files` 只有 3 个文件（`README.md`、`.gitignore`、`.external/pinax-adapter.json.example`），所以 `tasks*` 全是本地产物。

**精确清单**（本次实测，此前记录的「82」是把活的 `tasks` 目录一起数进去了）：

| 路径 | 数量 | 最新 mtime | 处置 |
|---|---|---|---|
| `adapters/pinax-adapter/tasks-*/` | **81** 个目录（`tasks-bridge-*` + `tasks-test-*`） | — | 删 |
| `adapters/pinax-adapter/tasks/` | 1 个目录、**24** 个 `task-*.jsonl` | Oct 6 17:37 | 删（迁移前的旧落点） |
| `kit/storyharness/tasks-*/` | **59** 个目录（`tasks-bridge-*` + `tasks-test-*` + `tasks-test-accounting*`，2026-10-08 补测；此前漏记） | — | 删（kit 仓，未跟踪） |
| `kit/storyharness/tasks/` | **31** 个 `task-*.jsonl` | Oct 8 08:44 | **保留**（当前活落点） |

合计待删 **140 个目录 + 24 个 jsonl**。kit 那 59 个的后缀三族（bridge / test / test-accounting）说明它们来自 `web.ts` 那条开发态链路与 tsc/test 夹具，与 Pinax 任务面同源但另一条链产出——**删除前值得先看一个目录里有没有别处还在引用**（本单第一步加一条 `grep -rn "tasks-test-accounting" kit/`）。

活落点的判定依据：配置 `adapters/pinax-adapter/.external/pinax-adapter.json` 的 `tasksDir` 值是相对路径 `tasks`，而 `storyAgentRuntime.js:41-45` spawn 时 `cwd` 是 kit 的 storyharness 目录，所以相对路径解析到 `kit/storyharness/tasks/`；该目录 mtime Oct 8 08:44 也与 8451 当前活着一致。

**风险**：中——**删的是历史任务快照，删了不可恢复**。缓解：(a) 先确认 `kit/storyharness/tasks/` 确实是活落点（上面已取证）；(b) 删除前把这 105 个 jsonl 打成一个压缩包移到 `_staging/`（不入库），留一个可回退窗口；(c) 这是**需要用户点头的动作**，不在 agent 自主范围内。

**范围**：仅 `adapters/pinax-adapter/`，不动 kit 仓、不动 `.external/`（凭据源）。

**验收**：`ls -d adapters/pinax-adapter/tasks* | wc -l` = 0；`git status` 无变化（因为本来就 gitignored）；起一次 8451 跑一个任务，新 jsonl 落在 `kit/storyharness/tasks/`。

**依赖**：无。与 W1-4（日志对齐）解耦——先清垃圾，再谈布局。

**落地记录（2026-10-08）**：按本单取证先打包备份 `_staging/w0-3-task-cleanup-20261008`（含 105 个 jsonl），再删除 `adapters/pinax-adapter/tasks*`（82）+ kit `tasks-*`（59）共 140 个目录与 `adapters/pinax-adapter/tasks/` 旧落点。事后复核 `ls -d adapters/pinax-adapter/tasks*` 为零。清理后 kit 测试运行会再生成同名同族的 `tasks-bridge-*` / `tasks-test-*` 夹具目录（属测试产物，随用随清，不属于本单遗漏）。

---

### W0-4 · ✅ 已落地（2026-10-08）· 8451 的 CORS 从反射 `*` 收成白名单（= M4）

**可行性：高，改配置不改代码。** `kit/storyharness/src/pinax/config.ts:26-27` 的注释就是自述：「CORS 允许来源；空 = 反射 `*`（开发态）」，缺省值在 `:43` `allowedOrigins: []`。配置面支持文件覆写（`PINAX_ADAPTER_CONFIG` 指向的 json，`storyAgentRuntime.js:24-25`），所以**可以在 Pinax 侧的配置文件里填白名单，不必改 kit 代码**。

**风险**：中——**有一个已知不能删的直连方**。`src/components/authoring/StoryAgentBetaPanel.vue:31,195,223` 是全仓唯一直连 8451 的浏览器代码，实测 0 importer，但 `docs/plan/worldbook-unification-abc-20261008.md:9` 记录上游作者刻意以新契约（「校验/测试专用，不写入书稿/世界书」）保留它并写明「**勿再删**」。所以收窄 CORS 后，这个面板若被手工挂载使用会被 CORS 挡。**缓解**：白名单里显式放入 Pinax 的 dev/prod 源（`http://localhost:3001` 等实际使用的源），面板走的就是同源，不受影响；不要试图用「删组件」来收窄（M6 已裁定撤掉那行移除矩阵）。

**范围**：`adapters/pinax-adapter/.external/pinax-adapter.json` 加 `allowedOrigins`（**注意这个文件含 apiKey，改动时要小心不要把值写进任何提交或报告**）；或者退一步，改 kit `config.ts:43` 的缺省值——但那会影响所有 kit 使用者，属上游口径，建议走配置文件。

**验收**：从白名单外的 Origin 发预检请求被拒；从 Pinax 源发同一请求通过；`StoryAgentBetaPanel` 若手工挂载仍可连通。

**依赖**：无。**8421 的同类问题（`kit/core/src/http.ts:21` `cors({origin:true})` 全反射）不在本单**，属上游，另记为已知问题。

**落地记录（2026-10-08）**：与原文「改配置不改代码」的前提不同——kit 侧配置旋钮 `allowedOrigins` 早已存在，但 server.ts 里 `json()` / `sseHead()` / OPTIONS 三处是硬编码 `access-control-allow-origin: *`，光改配置不生效。实际修法：kit 加单点判定 `corsOriginFor(allowed, origin)`（`storyharness/src/pinax/server.ts:33-36`，空名单=开发态反射 `*`、非空=仅回显名单内来源），请求入口统一 setHeader 并补 `Vary: Origin`（`:163-166`），三处硬编码撤除；新增 `test/pinax-cors.test.ts`。Pinax 侧 `adapters/pinax-adapter/.external/pinax-adapter.json` 已填 `allowedOrigins` 四个开发来源（localhost/127.0.0.1 的 3001/5173）。8421 全反射已登记 [known-issues](../src/known-issues.md)。

---

### W0-5 · ✅ 已落地（2026-10-08）· 监督拓扑入档 + kit-guard 失效登记（= Q7 落地 + M3）

**可行性：高，纯文档。** 需要写进去的事实本次已全部取证：

- **三套监督器互不知情**：`kit/storyharness/src/web.ts:41-66`（进程内声明式 `RuntimeSpec`，从 `<ws>/.storyharness.json` 的 `runtime.kernel` 读，**该文件两仓均不存在**，故全走缺省）；`kit/scripts/ops/`（Windows 计划任务 `kit-guard`，每 5 分钟 HTTP 探针）；`server/services/storyAgentRuntime.js:22-59`（宿主侧探测 + spawn + 等健康 + 失败回落 + 总开关）。
- **分层建议**：8451 归 Pinax 监督（宿主才知道自己要不要 agent 能力，且现有 fail-open 正是依赖这个探测结果）；8421/8431 归 kit 守护（**但要先修好**）；`web.ts` 保留为 kit 开发态一键起。
- **kit-guard 当前不工作**，实测 2026-10-08 12:23：计划任务 `LastRunTime 12:23:01`、`LastTaskResult 0`、`State Ready`，而 `:8421`/`:8431`/`:30142` 三探针全 down，`%TEMP%\kit-core.log`（10-05 01:53）与 `kit-web.log`（10-06 05:37）两天多零增长。`LastTaskResult 0` **不能当巡检成功的证据**：`kit-guard.vbs` 用 `Run "...", 0, False`，第三参 `False` = 不等待，wscript 立刻退出、任务立刻报 0，`.bat` 作为孤儿继续跑——**返回码与巡检结果完全解耦**。三条候选根因（作业对象回收孤儿 / 计划任务上下文缺 PATH / `.vbs` 关联被改）都**未确证**，验法需要用户亲手起长驻服务，本文不编故事。
- **一个反证性观察值得写进文档**：8451 是全栈里唯一活着的服务，而它恰好是唯一由宿主自己 spawn 并轮询健康的那个。这是「监督权留在 Pinax 侧」的现场证据。

**范围**：`docs/engineering/current-architecture.md` 新增一节「运行时监督拓扑」（**注意 `:167-173`「运行时归属（P2 口径统一）」现状描述是准确的，在内嵌落地前不要改，只追加**）；`docs/src/known-issues.md` 登记 kit-guard 失效 + 8421 CORS 反射两条。

**验收**：文档里能对「8451 挂了谁拉起」「8421 挂了谁拉起」「web.ts 什么时候用」三问各给一句有 `path:line` 支撑的答案。

**依赖**：无。

**落地记录（2026-10-08）**：三问答案已入档 [current-architecture.md](../engineering/current-architecture.md) 新增「运行时监督拓扑」节：8451 → `storyAgentRuntime.js:13/23/33/44/54/64-66`；8421/8431 → kit `scripts/ops/` 守护（当前失效）；web.ts → kit 开发态一键起（`:41-42/:49/:60-61`）。两条🟡已登记 [known-issues](../src/known-issues.md)（kit-guard 失效 + 8421 CORS 全反射）。追加时未动 `:167-173` 现状节。

---

## §3 Wave 1：证路

### W1-1 · ✅ 已落地（2026-10-08）· 循环归属：单点试点，不是三条一起切（原 P1-e 重定范围）

**可行性：中。传输层已通，循环层未动。**

现状精确定位：

| 切片 | 文件 | 行数 | 传输 | 循环归属 |
|---|---|---|---|---|
| ① 助手对话 | `server/routes/chat.js` | 1340 | kit 漏斗（`:574`、`:925`） | **Pinax**（单回合 + 工具由浏览器/服务端持有） |
| ② 单发改写 | `server/services/structuredGenerationRunner.js` | 286 | kit 漏斗 fetchImpl（`:9,260`） | **Pinax**（结构化输出 + 修复重试在本仓） |
| ②b agent-step | `server/routes/generationAgent.js` | 132 | `runKitFunnelProviderTurn`（`:93`） | **Pinax**（`kitModelGateway.js:130` 注释明写「浏览器仍拥有工具执行与多回合循环」） |
| ③ 叙事回合 | `piNarrativeAgentBridge.js` + `routes/storyagent.js` | 339 + 51 | 8451 任务面 | **kit**（`runner.ts:126` 真 agent 循环） |
| ④ 能力任务 | `capabilityTaskRunner.js` | 113 | 8451 任务面 | **kit**（`taskKind=capability`，submit 即终态） |

**所以「切 kit 通道」这个说法只对 ①②②b 成立，而它们要切的不是通道是循环。** 把循环搬进 kit 意味着：结构化输出的修复重试逻辑（`structuredGenerationRunner.js` 的核心价值）、工具执行位置、以及 `generationAgent` 的浏览器侧工具环，都要重新归属。这不是一个工单能装下的，而且**在 W0-1 落地前绝对不能做**——搬进去就等于把 Pinax 的折叠缓冲撤掉。

**建议的证路方式**：只挑 ②（单发改写）做试点，因为它是三者里最窄的——无工具环、无多回合、单发结构化输出，`taskKind=capability` 的现成形状（强制 submit 工具、回执即终态）几乎就是为它设计的。试点通过后再谈 ①②b。

**风险**

| 风险 | 等级 | 缓解 |
|---|---|---|
| 结构化输出的三模式（native-json-schema / forced-tool / json-object）在 kit 侧不等价。`kitModelGateway.js:202` 的注释明写「内核不保证遵守 native json_schema / forced tool_choice」，所以 Pinax 侧是**统一抽 schema + 追加显式指令 + responseFormat=json_object** 绕过的 | 高 | 试点必须把这段绕过逻辑一并搬进 kit，不能只搬调用。kit 侧落点存在：`modelFunnel.ts:200` `runComplete` 的 `:211` 已有 `samplingParams: { response_format: { type: request.responseFormat } }` 逃生舱（`:199` 的注释自述「responseFormat 走 samplingParams 逃生舱」） |
| 修复重试（schema 校验失败后重试）的归属：留在 Pinax 则每次重试一个 kit 任务（任务快照膨胀），搬进 kit 则要在 `runner.ts` 加校验环 | 中 | 试点阶段**留在 Pinax**，接受任务快照膨胀，把「重试该归谁」列为试点出口的裁定项 |
| 200 用例预算顶格，试点的等价测试无处放 | 中 | 用现有冒烟脚本承载：`scripts/storyagent-{beta,integration,ui}-smoke.mjs` 已在，加一条 structured 冒烟而非新增 vitest 文件 |
| 试点期间 ①②b 仍走 Pinax 循环，形成「同仓两种循环归属」的中间态 | 低 | 原 PRD 已承认这是合法态；文档里显式标注试点范围，避免下一个人误以为全切了 |

**范围**：`server/services/structuredGenerationRunner.js`（改调用形态）、`server/services/capabilityTaskRunner.js`（可能复用其请求体构造）、kit `storyharness/src/pinax/runner.ts`（若需加 schema 绕过）。**不动** `chat.js`、`generationAgent.js`。

**验收**：跑一次真实模型调用的单发改写，产出通过既有 schema 校验；`scripts/storyagent-integration-smoke.mjs` 保持绿；`npm run verify:contract` 保持 20 文件预算内（**用例合并置换，不新增文件**）。

**依赖**：**W0-1 必须先落地并留证**。

**落地记录（2026-10-08）**：试点切片确认为 ②（单发改写），落地分三部分。

1. **kit 侧折叠层（根因修复，开工先破的现场故障）**：开工即发现 capability 任务面全族失败已存在两日（`tasks/task-pcap_*.jsonl` 29 个文件里 21 failed，19 个带 `400 status code` 或「未产出正文」守卫消息，最早 10-07）。经运行中 kit 的 `/v1/pinax/complete`（非流式 6 形状）与 `/complete/stream`（流式 2 形状）共 8 种形状变异离线探针实测（systemPrompt 字段 / messages 内 system / developer / 有无 tools / 折叠形态），锁定根因：**dots3-note-prev 端点拒绝任何「独立 system 轮」**——非流式返回空补全（finishReason=error、usage 全 0）、流式立即 `[DONE]` 零内容、pi-agent-core 链路（runner 走流式）落盘即守卫报错/`400`；与 tools、流式与否均无关；折进首条 user 后全通（含工具调用）。**此前两仓对 10-08 事故的症状记录分歧（Pinax 记「空补全」、kit 记「400」）就此统一**：同一根因的两个观测面（顶层响应空补全 → 链路面守卫报错）。修复落 kit `storyharness/src/llm.ts`：`ProviderProfile.foldSystemIntoUser` 旗标（dots profile 置 true）+ `foldSystemIntoUserPayload()`（全部 system/developer 轮文本并入首条 user；user 的 text 块数组与 string 两种形状都处理；无 system 返回 undefined 保持 payload）+ `withSystemFolding()` 在 `makeModels` 出口经 pi-ai 官方 `onPayload` 钩子注入（`streamSimple`/`complete`/`completeSimple` 三方法；调用方自带 onPayload 链式保留）——**一处安装覆盖全部消费方**（runner Agent 循环 / planningAgent / modelFunnel / makeStreamFn），非命中 profile 零开销。kit 验收：`npm run typecheck` 干净、全量 `npm test` **141/141**（`llm-request-shape.test.ts` 折叠断言与边界例 + `llm-profiles.test.ts` 旗标钉）。

2. **Pinax 侧调用形态改造（循环归属切换）**：`kitModelGateway.js:327-364` 新增 `createKitStructuredCapabilityFetchImpl()`——把 `structuredOutputAdapter` 的上游请求体抽成 capability 任务（`taskKind=capability`）：系统文本 + 会话轮 + Schema 显式指令 + 提交方式指令折成 `capability.systemPrompt`；**Schema 同时进 `submitTool.parameters`**（强制提交工具即 native-json-schema / forced-tool / json-object 三模式的绕过等价物）；submit 回执经 `renderStructuredResponse` 合成为三协议超集响应（既有函数复用）。`capabilityTaskRunner.js:35-139` 抽出低层 `submitCapabilityTask()`（advisor 路径 `runCapabilityTaskAgent` 同步改走它，两处请求体构造合一）。接线点 `structuredGenerationRunner.js:258-262`：`routing.mode === 'kernel'` 时注入 capability 版 fetchImpl；`runStructuredGeneration` 的**修复重试两轮循环未动**（按本单风险表预案留在 Pinax，每次重试=一个新任务）。**双层 fail-open 保持**：层1=任务面探测不可达（`capabilityPlaneAvailable`，3s 超时 5s 缓存）直走漏斗；层2=任务失败/未提交在同一请求回落 `createKitFunnelFetchImpl()`（原因留 `console.warn`）；abort 不回落直接抛。

3. **验收证据（真实模型调用）**：临时实例（8463 端口，带新代码的 kit）经单发改写 handler 全链（`resolveModelRouting(kernel)` → 哨兵 → capability fetchImpl → 8451 capability 任务 → schema 校验）实跑：产出合法 draft，usage 699/454/1153，**无回落警告**（capability 本路成功）；kit 任务盘落盘 `task-pcap_muz9aqil_68f36c12.jsonl` = `completed` / steps 1 / toolCalls 1（`submit_structured_generation`）/ `capabilityResult` present。对照：修复前同族任务为 failed（`task-pcap_muz91p5v_2dd5db84.jsonl` 等）。门禁：`storyagent-integration-smoke` 19/19、capability-task-check 32/32、`npm run verify:full` EXIT=0（vitest 20/20 文件、200/200 用例顶格不破；**未新增测试文件**，等价断言走既有脚本与用例改写）。

**试点范围（显式标注，防误读为全切）**：本单只切 ② 单发改写；**①②b（助手对话 `chat.js`、agent-step `generationAgent.js`）仍走 Pinax 循环**——「同仓两种循环归属」是原 PRD 承认的合法中间态，`current-architecture.md` 已同步标注。

**遗留**：① ~~生产 8451 实例仍跑旧代码~~ **已收口（2026-10-08 16:44–16:46，用户授权重启）**——旧树（后端 11124 + tsx 10080 + kit 21936）`taskkill /F /T` 清理、端口释放后，新后端以分离进程重启（`node server/index.js`，cwd=本仓，日志仍为 `%LOCALAPPDATA%\pinax-probe\server.{out,err}`，旧日志存档 `*.boot1019`）；新栈 = 后端 9320（0.0.0.0:3001）+ kit 23776（127.0.0.1:8451，`/healthz` 回 `{"ok":true,"model":"openai.dots3-note-prev"}`）。**生产全链复验（真实模型调用）**：`POST /api/generate/structured`（空 key → kernel → capability）HTTP=200、5.87s、mode=`native-json-schema`，任务盘新落 `task-pcap_muzakkb7_1bcfd7d9.jsonl` = capability / completed / toolCalls 1 / usage 665/542/1207（与响应 meta 同值）；两端日志（server.err / server.out）零回落警告、零错误；5173 preview 仍 200（dist/index.html 16:12:25 构建，此后无前端改动）。注：`storyAgentRuntime.js:33` 只在 healthz 不通时 spawn——重启顺序必须先杀 kit 再杀后端，否则新后端会复用旧 kit。② D9（修复重试归属）待试点出口裁定，当前形态「每次重试=一个新任务」已接受任务快照膨胀；③ W0-1 遗留的「askdiandian.com 是否真对 developer 返 400」由本次实测收口——真正的拒绝面是「独立 system 轮」（system 与 developer 同拒），顶层症状是空补全而非 HTTP 400。

---

### W1-2 · ✅ 已落地（2026-10-08）· Pinax 双目录单源化（原 P1-b 重定范围）

**可行性：高，但范围与原描述完全不同。**

实测事实：

- `shared/agentCapabilityContract.js`（116 行）：`rows` 数组 → `CANONICAL_AGENT_TASKS`，**49 项**，字段 `id / owner / workflowKind / contextProfile / inputSchema / resultSchema / effectPolicy / capability / maxContextChars`（后两个由 `deriveCapability` 与 `AGENT_CONTEXT_PROFILES` 确定性推导，`:66-88` 的注释明写「只追加派生只读元数据，不改动任何 id / workflowKind / contextProfile / schema / effectPolicy」）。owner 分布：settings 13 / authoring 20 / observer 7 / materials 4 / canvas 3 / storyboard 2。
- `shared/capabilityToolContracts.js`（369 行）：`CAPABILITY_TOOL_SPECS`，**21 项**，形状 `{toolName, description, schema}`。
- **交集 19**；只在工具侧 2：`experience.next-actions`、`experience.emergence`；只在 canonical 侧 30。
- kit 侧**不需要**这两个目录中的任何一个：能力规格由 `capabilityTaskRunner.js:43-46` 每请求内联传入。
- kit 的 `capability-manifest@1`（`kit/storyharness/src/pinax/capabilities.json`，11 项，1583 字节）是**第三个**目录，装的是 agent 工具环的只读查询工具（`world_lookup`/`geo_lookup`/`history_lookup`/`memory_lookup`/`politics_lookup`/`manuscript_search`/`manuscript_get`/`notes_search`/`outline_lookup`/`calc_evaluate`/`submit_narrative_beat_plan`），与前两者**不同轴**，不该合并。

**所以真正的工单是**：把 `agentCapabilityContract.js` 与 `capabilityToolContracts.js` 之间那 19 项重叠的 id 建立**显式派生关系**（谁是源、谁派生、派生规则是什么），并把「2 项只在工具侧、30 项只在 canonical 侧」这个不对称**显式记录**——它可能是有意的（体验页任务不进 canonical 目录），也可能是漏登记，需要 owner 裁定，不能靠猜。

**风险**：中。**最大的风险是把三个不同轴的目录强行合并成一个**，那会同时破坏 kit 的 `capability-manifest@1` 契约（id pattern 不允许点）和 Pinax 的 canonical 冻结语义（`:66-70` 的注释是集成 owner 授权的修订边界）。缓解：本单**只做单源化与差集登记，不做合并**。

**范围**：`shared/agentCapabilityContract.js`、`shared/capabilityToolContracts.js`；新增一个**脚本**（不是 vitest 文件，避开 20 文件顶格）做差集断言，挂进 `architecture:check` 或独立 `npm run` 目标。

**验收**：脚本输出三份数字（49 / 21 / 交集 19）并断言「工具侧每个 id 要么在 canonical 里、要么在显式豁免清单里」；豁免清单里的 2 项各带一句 owner 授权理由。

**依赖**：无（可与 Wave 0 并行）。

**落地记录（2026-10-08）**：新增 `scripts/check-capability-catalog-sync.mjs`：输出目录账 canonical=49 / tools=21 / 交集=19 / 只在工具侧=2 / 只在 canonical 侧=30，断言「工具侧每个 id 要么命中共 49 项 canonical、要么列入显式豁免清单」。2 项豁免各带理由行：「体验页任务不入 canonical；经别名表解析到 authoring.*（D7 前提，待 owner 复核）」——若 owner 裁定为漏登记，则补进 canonical（49→51）并删豁免行。反向验证：注入孤儿 id `foo.orphan` 被 [1] 段拦截（门禁能红）。已挂 `npm run catalog-sync` 并接入 `verify:full`；两共享文件头部注释已建立显式派生关系。未做合并（三轴目录各自保持）。

**D7 收口（同日）**：做链路取证后发现原两个选项（「有意维持豁免」vs「补进 canonical」）均不成立——这两把 `experience.*` 工具键实为**不可达死键**：服务侧 `validateServerTaskType` 先解析 canonical 再查工具表（`advisor.js:153`、`capabilityTaskRunner.js:143`），`experience.*` 永不命中；且 `authoring.emergence` 从未进表（emergence 永远走漏斗，与 next-actions 不对等，`git log -S` 证三键同 commit `83c1d1a` 引入时即如此）。裁定=死键替换为 canonical 键：删 `experience.next-actions`/`experience.emergence`、保留 `authoring.next-actions`、新增 `authoring.emergence`（emergence 首获能力路径）；49 项 canonical 不动。脚本豁免清零、[1] 改逐项直查（49/20/交集 20/只在工具侧 0），**21/21 绿**；`capability-task-check.mjs` 对应换键并新增 emergence/零死键断言，**34/34 绿**。附加探针：`createAdvisorTaskResponse({taskType:'authoring.emergence', advice: JSON.stringify({actions:[{type:'runtime-candidate',…}]})})` 产出 `result.typedActions` 正常——submit 回执→既有解析链闭合（与 next-actions 同形）。

---

### W1-3 · ✅ 已落地（2026-10-08）· provider 注册表补 MiniMax 条目（原 P1-c）

**可行性：高，落点已存在。** `kit/storyharness/src/llm.ts:38-48` 已有 `PROVIDER_PROFILES` 表（`:42-43` 就是 `minimax: { baseUrl: "https://api.minimaxi.com/v1", thinking: "off" }`，另有一个 `compat: { supportsDeveloperRole:false, supportsStore:false, supportsReasoningEffort:false, maxTokensField:"max_tokens" }` 条目），`makeModels(t)` 在 `:57` 按 `t.provider` 查表（`:59`）。要升格的是 `kit/storyharness/src/pinax/config.ts:73-82` 里那段环境变量分支——`MINIMAX_API_KEY` 单独存在时自动切 minimax 内建档，这是**配置层的特例**，应该沉到 provider 表里。

顺带一个已取证的历史漂移，本单一并收掉：`llm.ts:50-55` 的 `THINKING_BUDGETS` 注释自述「storyharness 两份 32768 与 pinax-adapter 一份 32384 并存——统一取 32768」。

**风险**：低-中。渠道特例（DeepSeek thinking-off 等）目前在 Pinax 侧的引用点需要先盘清，否则「特例表在 Pinax 侧引用数归零」这个出口判据无法验证。**本单第一步应该是盘点，不是改代码。**

**范围**：kit `storyharness/src/llm.ts` + `storyharness/src/pinax/config.ts`；Pinax 侧待盘点后确定。

**验收**：同一次请求在 minimax 与 dots 两个 provider 下都出活（服务面实测，两次 `/healthz` 的 `model` 字段不同）；`grep -rn` 确认 Pinax 侧 provider 特例引用数归零或有显式豁免。

**依赖**：无强依赖，但**建议排在 W0-1 之后**——两者都改 `llm.ts`，避免写集冲突。

**落地记录（2026-10-08）**：盘点先行已完成——Pinax 侧特例引用分四轴：①密钥主机约定 `shared/textModelKeys.js`（本次导出 `MINIMAX_OFFICIAL_HOSTS` 单源，`kitModelGateway.js` 与 `ApiSettingsPanel.vue` 的重复字面量/重复 Set 收编）；②漏斗门控 `kitModelGateway.js`（同一判定轴，归 ①）；③媒体端点与原生链（另轴，不动）；④脚本夹具（不动）。kit 侧：`PROVIDER_PROFILES` 增 `envKey`/`defaultModel` 字段，minimax 档带 `MINIMAX_API_KEY` / `MiniMax-Text-01`；`config.ts` 删除硬编码 minimax 常量、改用 `resolveBuiltinProfile()` 查表（env > 文件 > 内置档 > 缺省）；`storyAgentRuntime.js:29` 门旁加同步指针注释。`THINKING_BUDGETS` 注释改为「历史漂移已收口」，全仓代码 32384 零残留（kit `test/llm-profiles.test.ts` 钉住 32768）。新增 kit `test/pinax-config.test.ts`（4 例：内置档生效/被 ZAI_API_KEY 阻断/文件 apiKey 压过/显式 env 压过）+ llm-profiles 增 2 例。真实双 provider 出活留待有凭据环境复验。

---

### W1-4 · ✅ 已落地（2026-10-08）· 日志与会话维度对齐（原 P1-d 的对齐半边）

**可行性：中。任务维度已通，会话维度不存在。**

- **任务维度已在 kit 侧落盘**：`kit/storyharness/src/pinax/store.ts:41-48`，`tasksDir` + `task-<taskId>.jsonl`；`bookId` 是快照里的**字段**（`:24`），用于 `list(limit, {bookId})` 过滤（`:74-82`），**不是目录分区**。实测活落点 `kit/storyharness/tasks/` 31 个文件、最新 Oct 8 08:44。
- **会话维度是 8431 协议面的东西，8451 用不到**：`kit/storyharness/src/sessions.ts:2` 自述位置是 `<projectDir>/<corpus.sessionsDir>/<sid>.jsonl`，首行 `session_start`（`:102-106`），带 1-based 行号读取（`:187-191`，注释「B9 对账：收据里每个数字都要能指回 `<sid>.jsonl` 第 N 行」）。这套依赖 `projectDir` + `CorpusLayout`，而 **8451 任务面完全不读工作区环境变量**（微服务调研 §1.3 实测：`grep -rn "resolveWorkspaceRoot|workspaceRoot|STORYHARNESS_WORKSPACE" kit/storyharness/src/pinax/` 零命中，所有路径从 `pkgRoot()` 解析，`config.ts:48-50`）。
- **所以原 P1-d 的「Pinax 的 bookId/会话维度映射到 kit 的 projectDir/corpus.sessionsDir」是把两个不同面的机制混在一起了。** 8451 要引入会话维度，得先决定它要不要认识 `projectDir`——而认识它就等于把 `STORYHARNESS_WORKSPACE` 这个已知坑（kit `AGENTS.md:61`：用户环境变量指向 storymasterv4，漏 set 会静默落到 v4）引进 Pinax 链路。**当前不引进是更安全的选择。**

**建议范围收缩为**：(a) 确认并文档化「8451 的日志维度 = 任务，不是会话；`bookId` 是过滤字段不是分区键」；(b) 给 `task-<id>.jsonl` 补一条 Pinax 侧可读性说明（首帧是什么、`TokenUsage` 在哪一行）；(c) 清理部分已拆到 W0-3。**不做** sessions.ts 接线。

**风险**：低（收缩后）。原方案的风险是把工作区路径语义引进一个刻意不读工作区的进程面。

**验收**：跑一次真实回合后，能在 `kit/storyharness/tasks/` 找到该 taskId 的 jsonl，且文档里能指出「哪一帧是任务开始、哪一帧携带 usage」的行号或字段名。

**依赖**：W0-3（先清垃圾再谈布局）。

**落地记录（2026-10-08）**：按收缩方案执行 (a)+(b)，未做 sessions.ts 接线（D11：8451 日志维度 = 任务不是会话，`bookId` 是过滤字段不是分区键——已入档 [current-architecture.md](../engineering/current-architecture.md)「8451 任务落盘与日志维度」）。帧结构核对：首帧 `server.ts:118`（`status:"running"`、usage 全零占位，提交路径 `:242-245`），终态帧 `:132-135`；`usage.{inputTokens,outputTokens,totalTokens}` 在每帧顶层、**终态行才真实**。真实样例：`kit/storyharness/tasks/task-pa_e63a7cf2a7558e1ad04d9d3f_final1.jsonl` 末帧 `completed`，usage 1899/114/2013，steps 2、toolCalls 1。

---

### W1-5 · 删退役件（原 P1-f）

**可行性：低（当前），中（W0-1 落地并留证后）。这是全案风险最高的一单。**

精确的删除面与引用面（本次实测）：

| 目标 | 行数 | 生产引用 |
|---|---|---|
| `server/services/providers/` 8 个文件 | **1795** | 待逐文件盘点（含 `structuredOutputAdapter.js` 509、`narrativeCapabilityProbe.js` 423、`anthropicToolAdapter.js` 219、`openAiToolAdapter.js` 206、`openAiResponsesToolAdapter.js` 194、`providerCapabilityResolver.js` 129、`structuredCapabilityResolver.js` 71、`minimaxToolAdapter.js` 44） |
| `server/services/textModelAgentProvider.js` | **241** | **只有 1 处**：`server/services/advisorAgentRunner.js:4`。（`server/loadEnv.js:6` 只是注释里提到名字，不是 import。`src/__tests__/agentContracts.test.js` 是测试。） |

**风险**

| 风险 | 等级 | 说明与缓解 |
|---|---|---|
| **撤掉唯一的第二层 fail-open** | **极高** | 2026-10-08 早间事故：dots3-note-prev 网关对任何带 system 消息的请求返空补全，漏斗三入口靠 `foldSystemIntoPrompt` 修好，**唯独 kit 进程的 agent 循环不经过它**，当时是 fail-open 回落救的（`provider=text-model` 留痕）。W0-1 修的是这个洞，但**修完不等于可以删缓冲**——上游还会有别的抖动形态（超时、限流、模型下线），fail-open 的价值不只在 system 折叠这一件事上。缓解：删除前必须有一次**真实上游抖动的演练记录**（把 `/model` 热切到一个已知会失败的档，验证 advisor / chat / generate 三条链在 kit 不可用时仍能出活），演练不过就不删。 |
| `structuredOutputAdapter.js`（509 行）可能是 W1-1 试点的依赖而非退役件 | 高 | 删除前必须先做**逐文件盘点**：8 个文件里哪些是「provider 协议适配器」（可随直连退役）、哪些是「结构化输出基础设施」（W1-1 试点还要用）。原 PRD 把 1795 行当成一个整体删是过粗的。 |
| 200 用例顶格，删除会连带删测试，但等价覆盖无处新增 | 中 | 出口判据用「合同测试**合并置换**而非新增」；删除后 `npm run verify:contract` 的文件数应 ≤20、用例数应 ≤200 且全绿。 |
| advisor 的双层 fail-open（`5b91c38` 修过第二层）依赖这条链 | 中 | 删除前读 `advisorAgentRunner.js` 全文，确认它的回落目标改成什么 |

**范围**：`server/services/providers/`、`server/services/textModelAgentProvider.js`、`server/services/advisorAgentRunner.js`（改回落目标）。

**出口判据（可跑）**

1. `grep -rln "textModelAgentProvider" server/ src/ shared/ scripts/` 只剩测试与迁移说明
2. `advisor` / `chat` / `generate` 三条冒烟在 **kit 任务面 down** 的条件下仍出真实回执（这是 fail-open 演练，不是常规冒烟）
3. `npm run verify:full` 保持 20 文件 / 200 用例预算内
4. `npm run architecture:check` exit 0，Authoring.vue 与 services 根层格位不因删除而超限

**依赖**：**W0-1（硬前置）+ W1-1（试点证明 kit 循环能承接生产任务）+ 一次 fail-open 演练留证**。三个条件缺一个都不动。

**落地记录（2026-10-08，零删除裁定）**：四个前置（W0-1 + W1-1 + fail-open 演练留证 + D10 盘点）全部满足后执行，结论是**零删除**——原「删除面」经逐文件盘点全部为活体，退役前提（kit 全面承接）目前只在 W1-1 单点（②单发改写）成立，Wave 2 铺满之前删除等于拆掉仍在服役的链。逐项判据：

1. **D10 盘点 → 8 文件全部活体，不删**：
   - narrative 传输族 4 件（`anthropicToolAdapter.js` 219 / `openAiToolAdapter.js` 206 / `openAiResponsesToolAdapter.js` 194 / `minimaxToolAdapter.js` 44）← `toolCallingProviderAdapter.js`（:8-20 四处 import）接线，上溯 `generationAgent → generate.js → src/services/api.js:170 → generationService.js:84 → narrativeAgentOrchestrator.js:7`。**归 W2-3**，随 narrativeAgentOrchestrator 退役时一并评估。
   - 结构化基建 2 件（`structuredOutputAdapter.js` 509 / `structuredCapabilityResolver.js` 71）← `structuredGenerationRunner.js` 直连/漏斗分支（W1-1 的兜底路径）。**保留**。
   - 探测 2 件（`narrativeCapabilityProbe.js` 423 ← `chat.js /test` 设置页探测；`providerCapabilityResolver.js` 129 ← 前两者）。**保留**。
2. **fail-open 演练留证（要求：真实上游抖动下三链出活）**：新脚本 `scripts/failopen-drill.mjs` 可复跑。架构：stub 代理 8464 只拦 `/v1/pinax/tasks*` → 502（记录拦截数），其余（`/model`、`/v1/pinax/complete`）透传真实 8451；测试实例 8465 指向 stub。**不能用「`/model` 热切失败档」**——`modelFunnel.ts` 证明 `/tasks` 与 `/complete` 共用同一 cfg，热切做不出「任务面挂、漏斗活」的分离。v2 全绿：advisor / structured / chat 三链各 1 次 HTTP attempt 即回 200（advisor 回落 `provider=text-model` 出答；structured 回落 native-json-schema 出草稿、innerAttemptCount=1；chat 与任务面无关直连出活），任务面拦截 2 次（advisor/structured 各 1）、回落警告各 1 条（`[Advisor]` / `[Structured]`）。证据 `%LOCALAPPDATA%\pinax-probe\failopen-drill-evidence.json`；v1 抖动记录另存 `failopen-drill-evidence-run1-flaky.json`（模型瞬态：dots3-note-prev 空补全 / 推理吞预算，非结构问题，有取证价值）。
3. **`textModelAgentProvider.js` 保留**：advisor 唯一 L2 回落目标（2026-10-08 早间事故的救命机制）；其 direct 分支 = 自带 key 用户正常路径（audit 待裁定 #4 未裁）。`advisorAgentRunner.js` 全文复核：回落机制（`fallbackProviderId` + `retryable` 判定）正确，无需改。**【追记 2026-10-08（用户裁定，见 §10）：直连已全退役——direct 分支删除，现为纯 kit 载体；保留理由改为「任务面失败 → `/complete` 面」双层 fail-open 的错误合同载体。】**
4. **出口判据重释（按「零删除」基准跑）**：#1 grep 判据 N/A——未删除，`textModelAgentProvider` 仍被 `advisorAgentRunner.js:4` 引用属预期；#2 演练留证完成（见 2）；#3/#4 门禁见下条。
5. **门禁记录（串行调度 + 分段跑齐）**：串行 vitest **20/20 文件、200/200 用例**全绿；`lint:delta` 0 新增；`npm run build` 过（22.18s）；architecture:build-size（Authoring chunk 1,397,843 ≤ 1,450,000）与 architecture:check exit 0；bridge-sync（2/2）、catalog-sync（21/21，含 D7 新断言）、`git diff --check`、docs build 全过。**注**：默认并行调度的 `npm run verify:full` 本次两连红为一例存量环境性 flake——`settingsAgentWorkflows`「settings place workflow」5000ms 超时（单跑 7/7 过、556ms；09-14/09-18 先例），未触 src/、非本批改动引入。

---

## §4 Wave 2：铺满

Wave 2 的五张工单在 Wave 1 全部出口之前**不展开细化**——因为它们的可行性判断依赖 Wave 1 的实际结果（尤其 W1-1 试点会决定「循环搬迁」这件事的真实成本，而 W2-1/W2-3 都是它的放大版）。此处只固化范围、依赖与已知接缝。

| 工单 | 范围 | 已知接缝（本次取证） | 依赖 |
|---|---|---|---|
| **W2-1** 体验页各会话切 kit 循环（原 P2-a） | 推演 / 知识问答 / 校对 / 画师 / 干预、settings 五工作流、observers 派生、体验页循环 | A/B 接缝在 `src/services/agents/storyagent/experienceAgentRoute.js:5,85-88`（94 行），旗标 `pinax_experience_pi_agent_enabled`，`!enabled || args.taskContract` 时回原生环；`:1,:84` 注释明写「严格任务合同仍归原生 review/repair owner」。调用点 `src/services/experience/experienceTurnCoordinator.js:1,291` | W1-1 |
| **W2-2** 批量类进 flow 通道（原 P2-b） | 校对分批 / 设定分区，七动词 + AND-join + 并发锁 + dry | 七动词 = `flow_list/run/next/submit/resume/gate/rerun`（`kit/core/src/kernel-run.ts:1,67`），总表 27 动词 / 7 组（`kit/core/src/verbs.ts:102`），CLI/HTTP/MCP 三面同源（`cli.ts:42`）。**但 Pinax 今天不消费 8421/8431**（全仓零引用），要进 flow 通道得先决定走哪条：直连 8421（无鉴权、CORS 全反射）还是 8431 的 `POST /api/kernel-verb` 白名单代理（有 HMAC 鉴权，白名单已含 `flow_init/run/next`，`serve.ts:25`）。**建议走 8431 代理**，见 M5 | W0-5（拓扑裁定）、W1-1 |
| **W2-3** 退役 `narrativeAgentOrchestrator.js`（原 P2-c） | 1946 行 + narrative 传输族 | 删除面已量，引用面待盘点 | W1-5 |
| **W2-4** 依赖转正 + 供应链审计（原 P2-d） | `@storyflow/core` / `storyharness` / `@earendil-works/*` 进 Pinax 依赖体系 | **在 ③ 基准下这张单的性质变了**：Pinax 不 import kit，只 spawn 它，所以「依赖转正」不是 npm 依赖问题而是**部署契约问题**——`storyAgentRuntime.js:26-27` 硬编码兄弟仓相对路径 `<pinax>/../storyflow-kit/storyharness/src/pinax/serve.ts`，`:36-40` 硬编码 kit 自己的 `node_modules/tsx/dist/cli.mjs`。要审的是这两个假设（兄弟仓在相邻目录、kit 的 node_modules 已入库含 tsx）在部署环境是否成立。kit 入库 node_modules 是仓库保证（微服务调研 §0 结论 4：`git ls-files` core 6470 / storyharness 11861，含 tsx 30 个文件） | W0-5 |
| **W2-5** 文档收口 D1–D4（原 P2-e） | `docs/engineering/` | 按修订版 PRD §5 的处置表执行：D1 补三小节（上行协议 / 双通道 / 日志会话层）、D2 画现状并标注未落地项、**D3 暂缓**（第 1、4 问指向不存在的物件，写出来是幻觉文档）、D4 登记 | Wave 1+2 全部出口 |

---

## §5 跨工单的公共风险

| # | 风险 | 影响面 | 缓解 |
|---|---|---|---|
| **CR-1** | **供应链面扩大**。`@earendil-works/pi-agent-core` + `pi-ai` 0.87.1 已经在 kit 的入库 node_modules 里，而 8451 是 Pinax spawn 的——**内嵌那一刻没发生，但依赖已经引进来了**。原 PRD 把审计放 Plan 2 是错的时点 | 全案 | W2-4 提前做**只读审计**（列包清单 + 版本 + 是否有 postinstall），不等依赖转正 |
| **CR-2** | **测试预算顶格**。vitest `MAX_TEST_FILES = 20` 已满，`MAX_TEST_CASES = 200` 当前 200/200 全绿（旧 2 红已由 `1d50307` 收口） | 所有需要新增覆盖的工单 | 一律「合并置换现有用例」；结构性断言用**脚本**承载（`scripts/` 下的 `.mjs`，挂 `architecture:check` 或独立 npm script），不占 vitest 格位——W0-2、W1-2 已按此设计 |
| **CR-3** | **前端格位**。Authoring.vue **10591/10900 行、124/125 import**，只剩 309 行 / 1 import | W2-1（体验页会话要动 Authoring 内的入口） | W2-1 开工前先做减法；服务端工单（Wave 0/1 全部）不占这个格位 |
| **CR-4** | **跨仓写集冲突**。W0-1 与 W1-3 都改 `kit/storyharness/src/llm.ts`；W0-1 与 W1-1 都改 `kit/storyharness/src/pinax/runner.ts` | kit 侧全部工单 | 串行，不并行；每张工单开工前 `git -C /d/storyflow-kit status` 确认无他人在途 |
| **CR-5** | **端口两套真相**。8451 在 Pinax 侧有 5 处引用（4 服务端 + 1 浏览器默认值） | W0-4、W1-1、W2-2 | ③ 基准下 8451 仍是唯一消费面，收口成一处常量应该在 W0-4 顺手做掉，别拖到 Wave 2 |
| **CR-6** | **agent 会话进程树不能起长驻服务**（kit `AGENTS.md:61`、`kit/scripts/ops/README.md:35`：会被环境周期性回收） | 所有需要服务面实测的验收（W0-1、W0-4、W1-1、W1-3、W1-5） | 验收命令由**用户在独立终端**执行；agent 侧只做只读探针（`curl --noproxy "*"`，本机系统代理会截 127.0.0.1 的请求）。**（2026-10-08 例外记录：用户明确授权下 agent 侧完成生产栈杀树+重启，见 W1-1 遗留①；参照数据：本机旧后端由会话 shell 启动后存活 6.5 小时未遭回收，新栈经 PowerShell `Start-Process` 分离启动。此例外不改变验收纪律——常规验收仍按本行执行）** |

---

## §6 分支：若裁定改选 ①（内嵌）

选 ① 意味着 Pinax 进程内 `import` kit，不再 spawn。以下工单**作废或改形**：

| 工单 | ③ 基准（本文） | ① 基准下的变化 |
|---|---|---|
| W0-1 | 改 kit `llm.ts` + `runner.ts`，服务面验收 | **不变**（折叠层与进程形态无关），但验收从「起 8451 发任务」变成「Pinax 进程内直接调 `createRun`」 |
| W0-3 | 清 Pinax 侧遗留，活落点在 kit | **改形**：`tasksDir` 会变成 Pinax 进程内的路径，落点要重新决定 |
| W0-4 | 8451 CORS 收白名单 | **作废**：没有 8451 了，CORS 面消失 |
| W0-5 | 三套监督器分层 | **大幅简化**：8451 那套监督消失，只剩 kit 守护 + web.ts |
| W1-5 | 删退役件，保留 fail-open 到 kit 任务面 | **风险升级**：fail-open 的回落目标从「另一个进程」变成「同进程另一条路径」，进程崩溃不再隔离 |
| W2-4 | 部署契约（兄弟仓路径 + tsx 假设） | **变成真 npm 依赖问题**，且必须先完成上游 PR：给 `storyharness` 补 `build` + `dist` + `exports`（当前**全无**，只有 `typecheck/start/serve:pinax/test/verify:pack` 五个 script）。`core` 虽有 `build: tsc -p tsconfig.json` 与 `bin.miniflow: ./dist/cli.js`，但 `core/.gitignore:1` = `dist/` 所以产物不入库，且缺 `main`/`exports`/`files`（实测 `node -e` 均为 `undefined`），**即便 build 了也不能被 `import '@storyflow/core'` 正常解析** |
| **新增** | — | **CR-1 从「审计」升级为「阻塞」**：`@earendil-works/*` 直接进 Pinax 依赖树 |

**① 的真实工作量集中在上游那一个 PR（给 storyharness 补构建），而它比「给 core 补 exports」重得多**——要处理 `pinax/` 子树的 `.ts → .js`，以及它对 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 的依赖形态。**这就是本文建议 ③ 的核心理由：不要把 Pinax 侧的收口卡在一件上游构建工程上。**

---

## §7 待裁定（合并去重后的单张清单）

| # | 问题 | 选项 | 建议 | 阻塞哪张工单 |
|---|---|---|---|---|
| **D1** | 耦合形态（= 原 Q1 / M1） | ① 上游补 build 后内嵌 ② Pinax 生产依赖 tsx ③ 维持子进程 + 扶正文档 | **③**；① 转独立上游项；② 排除（付成本拿不到收益：storyharness 无 `exports`，import 路径仍是深链源码树） | 全案基准 |
| **D2** | 监督权归属（= 原 Q7 / M2） | 全归 kit 守护 / 全归 Pinax / 分层 | **分层**（8451 归 Pinax，8421+8431 归 kit 守护，`web.ts` 留 kit 开发态），拓扑写进 `docs/engineering/` | W0-5 |
| **D3** | kit-guard 当前不工作，谁修（= M3） | Pinax 侧记为已知问题 / 提上游修 / 用户本机手工修 | **先记录**（本文纯调研），修法需用户亲手起服务验，三条候选根因见微服务调研 §3 | W0-5 |
| **D4** | CORS 反射收不收（= M4） | 8451 收（Pinax 可自主改配置）/ 8421 走上游 / 都不收 | **8451 收，8421 提上游另记** | W0-4 |
| **D5** | Pinax 要不要开始消费 8421 或 8431（= M5） | 只留 8451 / 加 8431 的 `/api/kernel-verb` 白名单代理 / 加 8421 直连 | **暂只留 8451**；W2-2 若要 flow 编排，**优先走 8431 代理**（它有 HMAC 鉴权，8421 没有且 CORS 全反射） | W2-2 |
| **D6** | `rightdock-prd-20261008.md` §4 移除矩阵撤掉 `StoryAgentBetaPanel.vue` 那一行（= M6） | 撤 / 保留待上游再确认 | **撤**（依据 `worldbook-unification-abc-20261008.md:9` 的「勿再删」）。注意该文件已被并行 session 移到 `_staging/untracked-backup/docs/plan/`，改的时候要改到位 | W0-4 |
| **D7** | **新增**：`experience.next-actions` / `experience.emergence` 这 2 项只在工具规格侧、不在 49 项 canonical 里，是有意的还是漏登记 | 有意（体验页任务不进 canonical）/ 漏登记（补进 canonical，49 → 51） | **已裁定并落地（2026-10-08），两个原选项均作废**：这两键实为**不可达死键**——服务侧经 `validateServerTaskType` 先解析 canonical 再查工具表（`advisor.js:153`、`capabilityTaskRunner.js:143`），`experience.*` 工具键永不命中；且 `authoring.emergence` 从未进表，emergence 任务永远走漏斗。裁定=死键替换为 canonical 键：删 `experience.next-actions`/`experience.emergence`、保留 `authoring.next-actions`、新增 `authoring.emergence`（emergence 由此首获能力路径，与 next-actions 对等）；49 项 canonical 不动。W1-2 脚本豁免清零、改逐项直查（49/20/交集 20/只在工具侧 0） | W1-2 |
| **D8** | **新增**：W1-1 试点选哪条切片 | ② 单发改写（最窄，无工具环无多回合）/ ① 助手对话（面最大）/ ②b agent-step（浏览器持工具环，最难） | **②**，理由见 W1-1。**→ 已选定并落地（2026-10-08）** | W1-1 |
| **D9** | **新增**：结构化输出的修复重试归属（W1-1 试点出口必须回答） | 留 Pinax（任务快照膨胀）/ 搬进 kit `runner.ts`（要加校验环） | **出口裁定（2026-10-08）：留 Pinax**。理由：① kit capability 路径已有 submit 校验环（W1-1 已证 submit 参数即 schema）；② 漏斗/直连路径 kit 无 schema 视图，搬移需把 Pinax 的协议降级策略（native-json-schema→forced-tool→text-json、预算 ×1.5+800）耦合进 kit runner，收益小于耦合成本。实测膨胀量：正常路径 0 次重试（drill v2 innerAttemptCount=1、生产 probe attemptCount=1）；仅异常触发，每次 +1 轮（+1 个 kit 任务快照）。机制见 `structuredGenerationRunner.js:86` 两轮循环，ABORTED/TIMEOUT 不重试 | W1-1 → W2-1 |
| **D10** | **新增**：`server/services/providers/` 8 个文件 1795 行，哪些是 provider 协议适配器（可随直连退役）、哪些是结构化输出基础设施（W1-1 还要用） | 逐文件盘点后分类 | **盘点完成（2026-10-08）：8 文件全部活体，零删除**。分类：narrative 传输族 4 件（anthropic/openAi/openAiResponses/minimax ToolAdapter ← `toolCallingProviderAdapter.js:8-20`）→ W2-3 随 narrativeAgentOrchestrator 评估；structured 基建 2 件（`structuredOutputAdapter`/`structuredCapabilityResolver`）→ W1-1 漏斗兜底保留；探测 2 件（`narrativeCapabilityProbe`/`providerCapabilityResolver`）→ 设置页探测保留。明细见 W1-5 落地记录 | W1-5 |
| **D11** | **新增**：8451 要不要引入会话维度（`sessions.ts` 那套） | 引入（要先让任务面认识 `projectDir`，把 `STORYHARNESS_WORKSPACE` 坑引进 Pinax 链）/ 不引入（日志维度 = 任务，`bookId` 是过滤字段） | **不引入**，理由见 W1-4 | W1-4 |

---

## §8 施工顺序（可直接照做）

```
Wave 0（可立即并行，除标注外互不依赖）
  W0-1  ✅ 已落地 kit 上游 400 修复 ← 修法=补齐 profile 命中轴（hosts 域名兜底）。
                                        离线探针已验（同一形状 developer→system、store 消失，generic 不变）
                                        kit typecheck 干净 + 131/131 过（含固化后的请求形状测试 llm-request-shape.test.ts）
                                        ✅ 真网关那一测已由 W1-1 真实调用收口（临时实例落盘 + 生产 completed），见该单「已收口」
  W0-2  ✅ 已落地 bridge-sync 接门禁 ← 正测/负测/还原 三态实跑，环境性豁免未动
  W0-4  ✅ 已落地 8451 CORS 收白名单 ← 实现走 kit 单点 corsOriginFor（空名单=开发态反射）+ 配置文件四个来源；8421 全反射另登 known-issues
  W0-5  ✅ 已落地 监督拓扑入档        ← 三问进 current-architecture「运行时监督拓扑」；kit-guard 失效 + 8421 CORS 已登 known-issues
  W0-3  ✅ 已落地 清遗留任务目录      ← 先备份 _staging/w0-3-task-cleanup-20261008 后删除（140 目录 + 24 jsonl）

  ── 验证窗口：W0-1 落地后等一次真实模型调用留证；同时据结果改写 10-08 事故的记录口径 ──
  （已满足：W1-1 临时实例真实调用成功落盘 task-pcap_muz9aqil_68f36c12.jsonl；事故口径已按实测统一为「独立 system 轮被拒」）

Wave 1
  W1-2  ✅ 已落地 双目录单源化        ← scripts/check-capability-catalog-sync.mjs（49/20/交集 20/只在工具侧 0）入 verify:full；D7 裁定后豁免清零（死键替换为 canonical）
  W1-3  ✅ 已落地 provider 补 MiniMax ← 内置档沉表（envKey/defaultModel）+ THINKING_BUDGETS 收口；kit 测试钉住；真网关双 provider 出活待验
  W1-4  ✅ 已落地 日志维度对齐（收缩版）← 已入档 current-architecture「8451 任务落盘与日志维度」；sessions.ts 不接线（D11）
  W1-1  ✅ 已落地 循环归属单点试点（②）← kit 折叠层（foldSystemIntoUser/onPayload）+ capability fetchImpl 接线；真实调用 completed；
                                          ①②b 仍 Pinax 循环（试点范围显式标注）；D9 已出口裁定（留 Pinax，实测膨胀=每次重试+1 任务、正常路径 0）；
                                          生产 8451 已重启复验（16:45，task-pcap_muzakkb7_1bcfd7d9 completed）
  W1-5  ✅ 已落地 删退役件 → 零删除裁定 ← D10 盘点=8 文件全活体（narrative 族→W2-3；structured 2 件→W1-1 兜底保留；探测 2 件活）；
                                          fail-open 演练留证=scripts/failopen-drill.mjs 三链全绿（stub 8464 拦任务面→advisor/structured/chat 均出真回执）；
                                          textModelAgentProvider 保留为 advisor 的 kit 侧 L2 回落载体（【追记 2026-10-08：直连已全退役，见 §10——direct 分支删除，仅「任务面→/complete 面」回落保留】）；出口判据重释见该单落地记录

Wave 2（Wave 1 全部出口后再细化）
  W2-1 → W2-2 → W2-3 → W2-4（只读审计可提前）→ W2-5
```

---

## §9 本文的边界

- **已运行时确证的**（本次用 stub fetch 离线探针实跑，不发网络请求、不起服务、不用真 key）：当前生效配置下 kit 发出的首个消息角色是 `"developer"`、请求体带 `store: false`、`thinking` 非 off 时带 `reasoning_effort`；换成 `dots` profile 后三者分别变为 `"system"`、无 `store`、无 `reasoning_effort`。四行原始输出见 §0 结论五。**修复落地后复跑探针**：`openai` + `askdiandian.com` 端点输出为 `roles: ["system","user"] | store: undefined | reasoning_effort: undefined`（修复生效）；`openai` + `api.example.invalid` 泛域仍为 `developer` + `store: false`（无误伤）。
- **fail-open 演练已留证（2026-10-08，对真实网关）**：stub 代理 8464 令 `/v1/pinax/tasks*` 一律 502（其余透传真实 8451）、测试实例 8465 指向 stub 的条件下，advisor / structured / chat 三链各 1 次请求即回 200 真实回执（advisor 回落 `provider=text-model`；structured 回落 native-json-schema、innerAttemptCount=1；chat 与任务面无关直连）；证据 `%LOCALAPPDATA%\pinax-probe\failopen-drill-evidence.json`，可复跑脚本 `scripts/failopen-drill.mjs`。此演练即 W1-5 的 fail-open 前置条件，结论汇总见 W1-5 落地记录。
- **D7/D9/D10 裁定落地（2026-10-08）**：D7=两把 `experience.*` 工具键为不可达死键，替换为 canonical 键（`authoring.emergence` 首获能力路径）、工具侧 20 项零豁免；D9=结构化修复重试留 Pinax（kit 已有 submit 校验环；正常路径 0 重试，异常 +1 轮）；D10=providers/ 8 文件全活体、W1-5 零删除。明细见 §7 表与 W1-5 落地记录。
- **未确证的**：
  - ~~**`askdiandian.com` 这个具体网关是否真的对 `developer` 角色返 400。**~~ **已由 W1-1 的 8 形状离线探针收口（2026-10-08）**：拒绝面是「独立 system 轮」（`system` 与 `developer` 同拒），顶层症状为空补全/立即 `[DONE]`，而非 HTTP 400。原「developer 假设」与实测的分歧点仅剩状态码表象，行为结论一致。
  - kit-guard 失效的根因（三条候选，见微服务调研 §3，验法需用户亲手起长驻服务）。
  - `storyAgentRuntime.js:44` 的 `stdio: 'ignore'` 是否会在 8451 链上复现 `web.ts` 警告的 Windows `0xC0000142`（该链是否 spawn python 孙进程未查）。
- **未实测的**：~~W0-1 修法 A 的折叠层没有真跑过~~ **折叠层已随 W1-1 落地并经真实模型调用验证**（临时实例 8463 产出合法 draft、任务盘 completed、无回落警告）；~~**实际落地的 hosts 修复改完之后也没有对真网关发过请求**~~ **hosts 修复 + 折叠层的组合已在 W1-1 真实调用中验证**（capability 本路成功即依赖两者同时生效）；~~W1-1 的 schema 绕过在 kit 侧的等价性没有实测~~ **已实测**：submit 工具参数即 schema，回执经既有 `normalizeStructuredDraftPayload` 校验通过。
- **未读的**：`adapters/pinax-adapter/.external/pinax-adapter.json` 只读了 `provider` / `model` / `baseUrl` / `thinking` / `tasksDir` 五个非敏感键与「apiKey 是否存在」这个布尔，**`apiKey` 的值未读、未打印、未写入本文任何位置**；`~\.dsh\.credentials.yaml` 未读。
- **本文不改的**：`docs/engineering/current-architecture.md:167-173`「运行时归属（P2 口径统一）」的现状描述是准确的，在内嵌落地前只追加不修改。
- **三处自我更正**（都是「推断当结论」栽的跟头，开工后逐条被实测推翻）：① 初稿断言「当前所有 provider 下推出的角色都是 `"system"`」——只读了 `PROVIDER_PROFILES` 表，没跟进 `getCompat` 的 `?? detected.X` 逐字段回落；② 推荐修法「把配置 provider 改成 `dots`」——没追过谁在写这个配置，`ApiSettingsPanel.vue:144` 每次面板挂载自动覆盖，改了必被冲掉，且 `TEXT_PROVIDER_TYPES` 里根本没有 dots 条目；③ 断言「baseUrl 不参与兼容判定，所以按域名兜底不可行」——`detectCompat` 的每个谓词都是 `provider === X || baseUrl.includes(域名)` 双轴，原话正好说反。**否定句和肯定句一样会漂移**，凡「X 不会发生」的断言都要跑到运行时才算数；三处更正最终合流成的落地修法（hosts 域名轴）正是被 ③ 这个错判拦下来的。

---

## §10 追记：文本直连全退役（2026-10-08，用户裁定，已落地）

用户裁定：「未来不会有直连了，也需要干掉所有写死 minimax 的，用户配的模型就是所有服务用的模型」——原「自带 key 直连政策未裁」的待定项就此关闭；本文 §3-W1-5、§4、§8 中与直连 / 自带 key 相关的表述以本节为准。

1. **路由两态化**：`server/services/modelRouting.js` 只有 `kernel`（探测 kit `/model`，5s 缓存）/`none` 两态，无直连档；`none` 统一报 `MODEL_ROUTING_ERROR_MESSAGE`（“未检测到可用模型。请先启动 pi-agent 任务面（serve:pinax），并在设置中选择模型。”）。
2. **四条生产链无条件内核**：`chat.js`（/chat、/stream）、`structuredGenerationRunner.js` 无条件走 kit；`generationAgent.js` 默认 runner 由 `runToolCallingProviderTurn` 换为 `runKitFunnelProviderTurn`（多回合循环仍归 Pinax）；`textModelAgentProvider.js` 删 direct 分支（缺内核即 `AGENT_PROVIDER_CONFIG_INVALID`/retryable:false）。**对 §3-W1-5 的修正**：`textModelAgentProvider` 的「保留」理由变更——不再含 direct 路径，仅存「任务面→`/complete` 面」双层 fail-open 的错误合同载体；narrative 传输族生产调用方清零（`runToolCallingProviderTurn` 仅剩测试引用 + `NarrativeProviderError` 被 generationAgent 引用），W2-3 评估面收窄，零删除结论不变。
3. **key 面收口**：`resolveTextApiKey` 从 `shared/textModelKeys.js` 删除（该文件自此媒体链专用）；用户 key 仅剩设置页探测（`chat.js:725` `/models`、`chat.js:812` `/test`）与「选中即热切内核」（`ApiSettingsPanel.applySelectedToEngine` → `POST /api/storyagent/model` → kit `/model`；公网部署 403 ERR_LOCAL_ONLY）两个用途。合同占位 `textProviderConfigStore.js:54-59` `SERVER_MODEL_PLACEHOLDER`。
4. **内容生成之外的保留边界**：media 链（image/video）不受影响——仍用服务器 `MINIMAX_API_KEY`（`resolveMiniMaxApiKey`、sentinel、ImageModelPicker/VideoModelPicker、`routes/image.js`、`media/adapters/minimaxVideo.js`）；anthropic 协议配置不进内核（kit 仅支持 OpenAI-completions），仅作本机探测，面板显式提示无法作为全局模型。
5. **验证**（本批复跑）：capability-task-check 34/34；local-funnel 3/3；public-access 40；structured-settings 双模式；narrative stream/recovery；bakeoff dry-run；kit typecheck 干净 + 139/139；vitest 20/20 文件、200/200 用例；`verify:full` exit 0。
