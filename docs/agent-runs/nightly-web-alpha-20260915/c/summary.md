# C 线交付回执 · 完整工作区 ZIP 备份与恢复（nightly-web-alpha-20260915）

- Worker：第二号（第一波 C 线）；worktree `pinax-walpha-c-20260915`；分支 `night/web-alpha-c`
- 基线：`e69a8a8`（main，与计划编制一致，工作树干净）；交付 HEAD：见最新 commit（单 handoff 提交）
- 实际区间：2026-09-15/16 夜间；active 约 3.5 小时（含调试），无 blocked/waiting 空转

## 主包状态

| 包 | 状态 | 交付物 |
| --- | --- | --- |
| C0 存储实体盘点 | done | `c/c0-storage-inventory.md`（实测四域事实 + 实现输入） |
| C1 bundle v3 | done | `services/storage/workspaceBackupBundle.js`：固定目录结构、manifest（format/version/app/域计数与字节/逐文件 SHA-256/excludedSecretKeys/warnings） |
| C2 两个 IDB adapter | done | source archive：`loadAllSourceArchiveRecords`/`restoreSourceArchiveRecords`/`replaceAllSourceArchiveRecords`（含 64MB 容量合同、memory 回落）；media：`listMediaBinaryIds`/`getMediaBinaryById`/`putMediaBinaryById` |
| C3 预览与校验 | done | `inspectWorkspaceBackup`：路径白名单（`../`、绝对路径、未知文件拒绝）、manifest/版本/app 校验、逐文件 SHA-256（不一致整包拒绝）、secret 键默认拒绝导入、source/media schema 校验、五类计数（新增/覆盖/相同/缺失 binary/无法恢复） |
| C4 恢复与回滚 | done | `restoreWorkspaceBackupBundle`：source → media → localStorage 顺序；恢复前快照捕获；任一步失败反向补偿回滚；逐域 `{ ok, written, skipped, rolledBack, rollbackFailed, reason }`；幂等（第二次全部 skip） |
| C5 SettingsPopup | done | 三入口固定：`导出完整工作区（ZIP）`（busy 状态+大小/缺失媒体数反馈）、`导出轻量备份（JSON）`（原名保留 data-test）、`恢复备份`（ZIP/JSON 同入口先预览）；文案含密钥边界/外链边界/覆盖范围；恢复成功且持久化确认后自动刷新 |
| C6 测试 + Gate | done | `backupExport.test.js` 3 用例块内扩展（预算 20/200 不变）：v2 全保留 + v3 构建/哈希对拍/secret 排除/缺二进制/版本与应用错误拒绝；`workspace-backup-check.mjs` 真浏览器八步（播种→导出捕获→记录 ID→清空→导入预览→恢复→刷新核对→幂等→IDB 写失败注入） |
| C8 压力样本 | done | `scripts/workspace-backup-stress-sample.mjs`；实测见下 |

## C8 实测记录（Chromium/Playwright）

- 体量：100 章书稿 + 20 世界书条目 + 来源归档 128 chunk ≈ 63MB（贴近 64MB 上限合同）+ 20MB PNG Blob
- ZIP 20.08MB（DEFLATE）；导出 6,141ms；inspect 6,189ms；恢复 7,795ms
- 刷新核对全部一致：章节 100、世界书条目 20、来源 chunk 128、媒体 20,971,520 字节精确
- 统计文件：`tmp/workspace-stress/stress-stats.json`（未提交任何大产物）
- 一个真实边界发现：种子若超 64MB 上限，恢复被 `assertArchiveCapacity` 依合同拒绝——校准至“上限附近”后全链成功

## 关键实现决策

1. **SHA-256 自包含纯实现**（`services/storage/backupHash.js`）：jsdom 测试环境无 `crypto.subtle`，三端一致性必需；测试与 Node crypto 对拍。
2. **ZIP 条目编码**：jsdom 下 JSZip 以 Uint8Array 直写的条目读不回——文本条目以字符串、二进制以 base64 写入/读取（浏览器行为一致，代价仅压缩率）。
3. **C4 回滚语义**：不声称跨存储 ACID；本次可识别写入按相反顺序补偿（source 快照替换 / media prior blob 恢复 / LS 由 v2 owner 自带键级回滚）。回滚自身失败如实标记 `rollbackFailed`。
4. **容量合同复用**：恢复走 `assertArchiveCapacity`（64MB 上限），超限失败由 bundle 统一转补偿回滚。
5. **JSZip 显式声明**：原为传递依赖，按“三线确有需要”加入 dependencies（3.10.1，精确版本）。

## 命令与退出码（最终树实测）

```text
npx vitest run src/__tests__/backupExport.test.js   # 3/3 通过（含 v3 全部新增断言）
node scripts/authoring-ui/workspace-backup-check.mjs  # exit 0，八步全过（含失败注入）
node scripts/workspace-backup-stress-sample.mjs       # exit 0，PASS（统计见上）
npm run test:run                                      # 20 文件/200 用例
npm run verify:full                                   # exit 0（最终提交前复核）
```

## 边界与未做

- 旧 v1/v2 JSON 兼容：`buildBackup/createRestorePlan/restoreBackup` 未改行为（测试断言保留）。
- C7 储备项（CI smoke、v1/v2 一键转 v3、退役 key 清理、用户手册更新）未开始——按波次配置留给第三波或后续。
- 真实 provider、实体设备、跨浏览器（Firefox/Safari 的 IDB 容量行为）未测。
- `exportWorkspaceBackupBundle` 的下载依赖 `URL.createObjectURL`（与 v2 相同的浏览器前提）。

## 2026-09-16 独立组合验收修正

- 修正来源 adapter 返回 shape 接线，恢复回执不再产生 `NaN/null` 计数；压力样本实测来源写入 129 条。
- 媒体补偿回滚对恢复前不存在的 binary 执行真实 delete，不再留下空 Blob。
- localStorage 非预期异常与取消路径会反向回滚已经写入的媒体和来源。
- inspect 阶段新增 ZIP 原始路径穿越、source/media manifest schema 与来源容量校验；相关断言并入既有 3 个测试块，测试预算不变。
- manifest 的 warnings 在 ZIP 写入前冻结，返回对象与归档内 manifest 保持一致。
