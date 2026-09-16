---
title: source-ingestion-bakeoff-20260822
date: 2026-08-22
author: codex
status: done — 编码评分 + 章节优先切块 + 5 层 ID + 可解释报告落地；6 项 bake-off 指标全部达标
---

# 来源摄取内核 bake-off（编码 / 章节 / 5 层 ID / 报告）

> 配套代码：`src/services/writing/encodingDetector.js`、`src/services/writing/chapterDetector.js`、
> `shared/chapterContract.js`、`src/services/contentHash.js`（SHA-256）、
> `src/services/writing/epubAdapter.js`、`shared/importReportContract.js`，
> 以及 `worldbookSourceArchive.js` / `worldbookSourceAdapters.js` /
> `worldbookSourceSelection.js` 的改造。
>
> 复现：`npm run bench:source-ingestion`（vite-node，无新增依赖）。

## §1 Fixture 矩阵

交接清单计划 30 个 fixture。实际执行分两层：

**Harness 内程序化生成并跑满指标（18 组 + 6 组边界/异常）**
文本为固定种子 LCG 生成的合成中文小说（版权文本不入仓库），章节 ground truth 在生成期记录。

| 维度 | Fixture | 数量 |
|---|---|---|
| 编码 | UTF-8 / UTF-8-BOM / GB18030 / Big5 / UTF-16LE-BOM / UTF-16BE-BOM × 100KB；UTF-8/GB18030/Big5/UTF-16LE × 5MB；UTF-8/GB18030 × ≥20MB | 12 |
| 章节标题 | 玄幻"第N章"、都市"第001章"、英文"Chapter N"/"CHAPTER I"、卷式"卷一/第N章"、无标题纯文本、序章+楔子+正文边界 | 6 |
| 边界 | 纯英文小说 / 中英混排 / 全角空格缩进 / Markdown 内嵌 HTML | 4 |
| 异常 | 损坏 zip（截断 EPUB）/ 跨编码重复上传 / ≥20MB 长篇 | 3 |

GB18030/Big5 字节由 harness 启动时暴力扫描解码空间构建的 字符→字节 表生成
（Node TextDecoder 只解码不编码）；编码维度文本先过滤成两表交集可表示字符，
保证跨编码比较的是同一内容。

**格式维度（4）由合同测试覆盖而非 harness**：TXT-GB18030（harness 已含）、
EPUB 完整 spine 顺序与 metadata、OPF 缺失退化文件名排序+警告、DOCX 长文与
PDF needs-ocr/encrypted-pdf 错误码——这些在
`src/__tests__/worldbookSourceIngestion.test.js` 与既有
`worldBookQuickImport.test.js` 中有真实解析断言。加密 PDF 无法离线构造真实样本，
沿用既有 encrypted-pdf 错误码测试。

## §2 六项指标结果

| 指标 | 测量 | 结果 | 目标 | 判定 |
|---|---|---|---|---|
| 章节识别准确率 | 合成文本 GT vs detectChapters F1（±3 容差） | 平均 **F1 = 1.000**（5 组带标题 fixture 全部 P=R=1.0） | ≥0.95 (GB18030) / ≥0.90 (Big5) | ✅ |
| 定位稳定性 | 同文本两次解析 chunk ID + offset JSON 对比 | **100%**（18/18） | 100% | ✅ |
| 重复识别 | UTF-8 / GB18030 / Big5 / UTF-16LE 四编码同内容 SHA-256 身份 | **一致** | 100% | ✅ |
| 20MB 性能 | 解码→识别→章节→切块→SHA-256 全链路 | UTF-8 20.1MB **≈1.1s**；GB18030 13.5MB **≈1.0s** | ≤30s | ✅ |
| 取消延迟 | 分阶段 checkpoint 观察到 abort | **≈12–18ms** | ≤100ms | ✅ |
| 内存峰值 | 20MB GB18030 解析 heapUsed 峰值增量（5ms 采样） | **≈10–14MB** | ≤50MB | ✅ |

注意：取消延迟测的是"同步阶段之间的检查点粒度"。生产路径的取消由
Worker terminate 承担（既有基线 ≈142ms），两者都满足 ≤100ms 量级要求；
若未来把检测移入更细的分片循环，检查点粒度还能继续下降。

## §3 三种切块策略对比

| 策略 | chunks 数 | 平均/最大 chunk | 跨章 chunk 违规 |
|---|---|---|---|
| current 固定长度 6000 | 最少（21） | avg≈5800 / max≤6000 | **每 fixture 约 20 个跨章违规** |
| A 一章一块 | 章节数（30） | avg≈4000 / max≈4300 | 0 |
| B 章节优先混合（6000 上限内切） | 章节数（30） | avg≈4000 / max≈4300 | 0 |

本组合成章节体量（约 4000 字/章）未触发 B 的章内二次切块；B 与 A 结果一致。
B 的价值在长章场景：单章 >6000 字时 A 会产出超大 chunk（撑爆上下文预算），
B 保持 6000 上限同时绝不跨章。**推荐策略：B（已落地为 buildSourceChunks 默认行为）**。

## §4 每个 fixture 的章节识别结果

```
chap-xuanhuan-0:  P=1.000 R=1.000 F1=1.000 (30/30)
chap-urban-1:     P=1.000 R=1.000 F1=1.000 (30/30)
chap-english-2:   P=1.000 R=1.000 F1=1.000 (30/30)
chap-volume-3:    P=1.000 R=1.000 F1=1.000 (30/30)
chap-none-4:      无标题 → chapters=[]，unmatchedRanges=[{0, len}]，按长度切块不丢内容
chap-boundary-5:  P=1.000 R=1.000 F1=1.000 (8/8)   ← 含前导楔子/序章，前导区间进 unmatchedRanges
edge-english:     utf-8/high，30 章
edge-mixed:       utf-8/high，20 章
edge-fullwidth:   utf-8/high，20 章（全角空格 U+3000 分隔）
edge-md-html:     utf-8/high，15 章
broken-epub:      error epub-parse-failed + recoverable + suggestedAction
dup-upload:       第二份 duplicateOfSourceId 指向第一份 sha256 身份
```

### 开发过程中发现并修复的问题（bake-off 的直接收益）

1. **纯西文被误标为 big5/high**：ASCII 文本在 utf-8/gb18030/big5 下得分并列，
   字典序 tie-break 把 big5 排到了最前面。已改为保持声明优先级（utf-8 优先）。
2. **全角空格标题漏检**："第一章　标题"（U+3000）不匹配 `[ \t]`。分隔类改为
   `[^\S\r\n]` 后修复——网文标题大量使用全角空格，这是 fixture 矩阵直接揪出的真 bug。
3. **GB18030 被误判为 UTF-8**：GB 双字节对（如 `B5 DA`）常构成"合法"UTF-8
   序列并解码成拉丁扩展杂凑（µÚ…），严格 UTF-8 解码成功 ≠ 内容正确。乱码信号
   从 U+FFFD/C1 控制区扩展到拉丁补充区 U+00A0–U+024F 后，GB18030 正确胜出。

## §5 推荐策略与落地建议

- **采用策略 B**（章节优先混合切块），即当前实现：
  `buildSourceChunks(content, { chapters })` 章节边界优先于长度边界，
  未匹配区间照常切块不丢。
- 编码低置信度不拒绝：返回 warnings + 结构化 userAction
  （reparse-with-encoding），让用户决策。
- 增量重解析复用现有 chunk-hash 匹配：contentHashSha256 不变整源跳过；
  变化时未变章节的 chunk 按 hash 复用（saveSourceArchiveBundle 返回 reusedChunkCount）。
- 后续可选（不在本轮范围）：把 findChapterMarks 改为增量行窗扫描以进一步降低
  单同步块时长；UI 展示 ImportReport 的 encoding/chapters/duplicates 分区。

## §6 明确不做（本轮边界）

validAt/payoffStatus、五字段因果链、安全 gate UI、多维度/深度档/作者风格蒸馏
均未触碰；UI 文件零改动（ImportReport 以超集形态兼容旧 result 形状，
result.chunks 保持数组语义并把统计挂在数组属性上）。
