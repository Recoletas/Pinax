# C0 · 存储实体盘点（实测于 e69a8a8 工作树）

## 1. localStorage 域（`src/utils/backupExport.js`）

- v2 JSON：`buildBackup()` 打包 60+ 静态键（`PINAX_BACKUP_KEYS`）+ 动态前缀
  `worldbook_`、`worldbook:brief:`；`STORAGE_KEY_POLICY` 中 `secret-config` 类
  （API/模型配置）默认排除并列入 `excludedSecretKeys`；`includesIndexedDb: false`；
  附 experience 摘要（回合/检查点/记忆 revision，低敏）。
- 恢复：`createRestorePlan()` 校验 app==='Pinax'、版本 1–2、add/overwrite/skip、
  checkpoint/memoryRevision/branch 三类风险提示；`restoreBackup()` 对本次写入键做
  补偿回滚（quota/storage-error/rolledBack/rollbackFailed）。
- `MEDIA_ASSETS`（媒体元数据 JSON）已是备份键之一。

## 2. 来源归档 IndexedDB（`src/services/worldbook/worldbookSourceArchive.js`）

- DB `pinax-source-archive` v1；3 个 store：`artifacts` / `chunks` / `workspaces`，
  keyPath `'id'`；容量上限 64MB（48MB 警告）。
- 已有：`loadAllStoreRecords(store)`（私有，getAll）、`hasIndexedDb()`、
  `openSourceArchiveDb()`、`estimateSourceArchiveUsage()`、
  `saveSourceArchiveBundle()`（单 artifact 增量写，内容哈希去重）。
- 无 IndexedDB 时回落 `memoryArchive`（模块内 Map）。**缺恢复/批量导出 adapter → C2 补。**

## 3. 媒体 IndexedDB（`src/services/media/mediaAssetStore.js`）

- DB `pinax-media`，二进制 store `assets`（**线外键 = asset.id**，Blob 形态）；
  元数据在 localStorage `MEDIA_ASSETS`（schemaVersion 1）。
- 已有：`createIndexedDbBinaryStore({put,get,delete})`（无 keys 枚举）、
  `listMediaAssets()`、`getMediaAsset(id)→{asset,blob}`、
  `getMediaAssetDataUrl(id)`；`externalUrl` 资产无本地二进制（只记录引用）。
  **缺枚举/批量导入 adapter → C2 补。**

## 4. SettingsPopup（`src/components/workbench/SettingsPopup.vue`）

- 存储区现有：`导出本地作品备份`（data-test backup-export-button）、
  `导入备份`（backup-import-button）→ plan 预览 → 风险勾选 → 确认恢复；
  边界文案明说“不包含来源文件和媒体的 IndexedDB 原件”（本夜改为完整工作区后需更新）。
- 诊断导出（beta-diagnostic-export）与备份区相互独立，不受影响。

## 5. 实现输入

- JSZip 3.10.1 已在依赖树（传递）；已按“三线确有需要”显式加入 dependencies。
- SHA-256：`crypto.subtle` 在 jsdom 测试环境不可依赖（jsdom 无 subtle），
  采用自包含纯实现 `services/storage/backupHash.js`，测试中与 Node crypto 对拍。
- 测试预算 20 文件/200 用例已满：v3 覆盖按仓库“合并 N 例”惯例并入
  `backupExport.test.js` 现有 3 个用例块，不增加用例总数。
- 集成验证新增 `scripts/authoring-ui/workspace-backup-check.mjs`（真浏览器，
  自起服务+网络守卫+真实播种/导出/清空/恢复/幂等/失败注入）。
