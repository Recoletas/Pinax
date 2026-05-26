# 06 - 编导模式

状态：待做

## 目标

把诗歌、散文、小说体验片段统一转换成可导出、可版本化的 storyboard schema。

## 未完成任务

- 定义统一 storyboard schema。
- 让诗歌、散文、体验片段共用同一结构。
- 做版本化存储，避免覆盖旧分镜。
- 增加导出前校验。
- 导出失败时返回明确原因。

## 建议 schema

- `shotId`
- `sourceText`
- `scene`
- `shotSize`
- `cameraMovement`
- `duration`
- `visual`
- `dialogue`
- `sound`
- `music`
- `transition`
- `emotion`
- `notes`

## 验收标准

- 诗歌、散文、体验片段能生成同一结构。
- 导出前有校验。
- 历史版本可恢复。
