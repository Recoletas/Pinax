# Experience Authenticity Production Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验证的降 AI 腔与关系真实性规则接入 Experience 正式叙事 prompt，同时保持单次主生成链和现有运行时数据模型。

**Architecture:** 扩展现有 `narrativeVoicePolicy`，让静态真实性规则继续由首条 system contract 承载，并让第二条 system turn note 从 NarrativeKernel 的 continuity block 提取最多三条已确认关系。Orchestrator 继续调用同一 `buildNarrativeVoiceContract()` / `buildNarrativeTurnNote()`，不新增 provider 调用或持久化状态。

**Tech Stack:** Vue 3 application services, JavaScript ES modules, Vitest, existing NarrativeKernel and narrative agent transcript contracts.

---

### Task 1: 正式行文契约接入降 AI 腔规则

**Files:**
- Modify: `src/__tests__/integration.test.js`
- Modify: `src/services/agents/narrativeVoicePolicy.js`

- [ ] **Step 1: 写入失败合同断言**

在现有 `keeps stable ids and one prompt format contract` 用例中加入：

```js
const voiceContract = buildNarrativeVoiceContract()
expect(voiceContract).toContain('不用列举数项后再用破折号短句揭晓')
expect(voiceContract).toContain('一个结论只表达一次')
expect(voiceContract).toContain('神秘信息必须来自')
expect(voiceContract).toContain('关系不要写成标签或心理说明')
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: FAIL，缺少第一条新规则文本；其余既有断言保持通过。

- [ ] **Step 3: 最小实现静态真实性规则**

在 `buildNarrativeVoiceContract()` 的现有五条规则后加入：

```js
'不用列举数项后再用破折号短句揭晓结论；让人物通过观察、判断或动作直接指出差异。',
'一个结论只表达一次；不要再用同义短句、解释性比喻或格言重复说明它意味着什么。',
'神秘信息必须来自已有事实、人物隐瞒或当前因果，并在本拍产生可观察影响；否则直接写清楚。',
'关系不要写成标签或心理说明；只在与当前互动有关时，通过惯常选择、照顾的成本、回避、纠正、默契或遗漏显现。',
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: PASS，测试文件内全部用例通过。

### Task 2: 将当前有效关系压入下一轮作者注释

**Files:**
- Modify: `src/__tests__/integration.test.js`
- Modify: `src/__tests__/agentContracts.test.js`
- Modify: `src/services/agents/narrativeVoicePolicy.js`

- [ ] **Step 1: 写入关系提示失败测试**

从 `narrativeVoicePolicy` 导入 `buildNarrativeTurnNote`，在现有 prompt 合同用例中构造最小 Kernel：

```js
const relationshipNote = buildNarrativeTurnNote({
  blocks: [{
    kind: 'continuity',
    content: {
      causality: {
        relationships: [
          { subjectId: 'character-daughter', objectId: 'character-mother', kind: 'guardian', status: 'confirmed' },
          { subjectId: 'character-a', objectId: 'character-b', kind: 'rival', status: 'confirmed' },
          { subjectId: 'character-c', objectId: 'character-d', kind: 'debtor', status: 'confirmed' },
          { subjectId: 'character-e', objectId: 'character-f', kind: 'ally', status: 'confirmed' }
        ]
      }
    }
  }]
}, { intent: 'respond' })

expect(relationshipNote).toContain('本场有效关系（只作行为依据，不照抄标签）')
expect(relationshipNote).toContain('character-daughter → character-mother（guardian）')
expect(relationshipNote).not.toContain('character-e → character-f')
```

另对空 `relationships` 调用断言不包含 `本场有效关系`。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: FAIL，作者注释中尚无关系提示。

- [ ] **Step 3: 实现有界关系提示**

在 `narrativeVoicePolicy.js` 新增内部裁剪函数与公开 builder：

```js
export function buildNarrativeRelationshipNote(kernel) {
  const relationships = findBlock(kernel, 'continuity')?.causality?.relationships
  if (!Array.isArray(relationships)) return ''
  const cues = relationships
    .filter((relation) => clean(relation?.subjectId) && clean(relation?.objectId) && clean(relation?.kind))
    .slice(0, 3)
    .map((relation) => `${clip(relation.subjectId, 48)} → ${clip(relation.objectId, 48)}（${clip(relation.kind, 32)}）`)
  return cues.length
    ? `本场有效关系（只作行为依据，不照抄标签）：${cues.join('；')}`
    : ''
}
```

在 `buildNarrativeTurnNote()` 的 `instructions` 中加入：

```js
const relationshipNote = buildNarrativeRelationshipNote(kernel)
// ...
relationshipNote,
relationshipNote
  ? '若上述关系与眼前互动有关，让它通过已经形成的习惯、成本、回避、纠正、默契或遗漏自然显现；不要解释关系名称。'
  : '',
```

- [ ] **Step 4: 验证正式 agent transcript 使用同一作者注释**

在 `agentContracts.test.js` 现有 Narrative Agent 大用例捕获第一次 `decisionRunner` 请求，断言：

```js
expect(firstRequest.messages[0].content).toContain('不用列举数项后再用破折号短句揭晓')
expect(firstRequest.messages.some((message) => (
  message.role === 'system' && message.content.includes('本场有效关系（只作行为依据，不照抄标签）')
))).toBe(true)
```

测试复用该用例已有 `narrativeKernel`，不新增测试数量或 provider 调用。

- [ ] **Step 5: 运行定向测试并确认 GREEN**

Run: `npm run test:run -- src/__tests__/integration.test.js src/__tests__/agentContracts.test.js`

Expected: 2 test files PASS，正式请求包含静态真实性 contract 与有界关系 note。

### Task 3: 文档交接、全量验证与集成

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/LOG.md`

- [ ] **Step 1: 更新共享状态**

在 `docs/STATUS.md` 记录：Experience 正式 system contract 已包含四类真实性规则，作者注释最多携带三条现有因果关系；没有二次模型调用，局部编辑器仍为显式 CLI。

在 `docs/LOG.md` 追加同一行为变更及验证命令。

- [ ] **Step 2: 运行全量门禁**

Run: `npm run verify:full`

Expected: 25 个测试文件 / 436 个用例全部通过，Vite build、`git diff --check` 和 VitePress build 均 exit 0；若测试总数因现有用例结构变化，以实际输出更新基线。

- [ ] **Step 3: 审查提交范围**

Run: `git status --short && git diff --check && git diff --stat`

Expected: 仅本计划列出的 policy、两个测试文件、设计/计划和状态文档发生变化，无临时工件、provider 密钥或 `/tmp` 运行结果进入提交。

- [ ] **Step 4: 创建完成提交**

```bash
git add src/services/agents/narrativeVoicePolicy.js \
  src/__tests__/integration.test.js \
  src/__tests__/agentContracts.test.js \
  docs/STATUS.md docs/LOG.md \
  docs/superpowers/specs/2026-08-21-experience-authenticity-production-design.md \
  docs/superpowers/plans/2026-08-21-experience-authenticity-production.md
git commit -m "feat(experience): apply authenticity rules to narration"
```

- [ ] **Step 5: 安全集成回最新分支**

在主工作区执行：

```bash
git merge --ff-only feature/experience-authenticity-production
```

Expected: `integration/online-agents-canvas-video-f` 快进到完成提交；主工作区原有未提交研究与计划文件保持不变。
