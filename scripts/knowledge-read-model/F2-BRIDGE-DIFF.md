# K23 桥接与旧 F2 的差异表

模块：`src/services/project/knowledgeReadModel/authoringEvidenceBridge.js`。
旧 F2 链路：`authoringKnowledgeQuerySession.prepare` → catalog → 检索 → evidence envelope → 回答/对账。桥接**不替换**这条链，只是在"已有授权目录的明确子集"与 K 只读查询之间做双向映射。

## 接入实际增加了什么

| 能力 | 旧 F2（现状） | 经 K 桥接后 | 差异性质 |
| --- | --- | --- | --- |
| 实体级精确查询 | 按 intent 检索排序（narrativeResourceIndex），无"指定实体"概念 | 按授权 sourceRef 精确指定实体集，检索排序不参与结果构成 | 新增 |
| 确定性 | 同问题同目录可能因检索排序变化 | 同输入（ref 集+预算）结果与指纹完全确定 | 新增 |
| 时间可用性 | 无时间概念 | 无时间声明时诚实 unknown + missingInformation 文本；rich 数据存在时可做半开区间过滤（桥接路径不携带 rich 数据，诚实按 legacy 处理） | 语义明确化 |
| 依赖/失效 | projectRevision 全目录指纹（任一来源变化即失效） | 有界 scope revision：只有被查实体相关来源变化才失效，无关来源新增不误伤 | 新增 |
| 冲突呈现 | 无事实概念，只有证据块 | 授权目录内不存在 canonicalFacts，桥接不产生 facts——若出现按 typed note 报告 | 保持 |
| 证据格式 | envelope 证据块 | 回映射**原样** produce sourceRef/locator/revision，通过 normalizeAuthoringEvidence 复验，reconcile/stale 链路零改动 | 保持 |
| 未采纳试稿 | suggestion authority 可被检索 | 桥接 typed 拒绝 suggestion；快照无 drafts，hypotheses 恒空 | 收紧 |
| 正文/大纲/现场 | manuscript/scene/outline 证据 | typed 拒绝（K v1 无适配器），明确列入 rejected，不伪装 | 明确边界 |
| 角色秘密/知识 | 无 | 桥接快照无知识依据 → character 视角诚实 unknown（rich 能力不因桥接出现） | 保持诚实 |
| 越权 | sourceAuthorization exact-read-only | 桥外 ref 查询 → source-not-authorized，零存在性提示；locator.worldbookId 必须等于绑定 | 新增防线 |

## 接入没有改变什么

- provider 调用链、任务目录、工具注册：零改动（K24 才在 session 接缝接线，default-off）。
- evidence envelope / answer / stale 对账合同：零改动（桥接输出即 F2 证据）。
- 存储、worldStore、UI：零触碰。
- 检索器：不复制、不绕过（K 查询按精确 ref，不做第二套全文检索）。

## legacy / rich 分开声明

- **桥接矩阵全部运行在 legacy（F2 目录证据）形状上**：这是生产唯一存在的输入。
- rich fixture（validDuring/visibility/knowledgeAssertions）能力仍只在独立 K eval 中（46+6 场景），**不代表现有存档具备**；桥接不会把 rich 字段"顺手"带进 F2。

## 复跑

```
node scripts/knowledge-read-model/eval-bridge.mjs          # 13/13
node scripts/knowledge-read-model/eval.mjs                 # 52/52（主矩阵，含 v1.1 记忆显式引用）
```
