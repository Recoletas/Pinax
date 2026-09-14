# `src/` 代码放置速查

完整边界见 [`docs/engineering/current-architecture.md`](../docs/engineering/current-architecture.md)。

- `pages/`：路由级组合层，不在这里新建持久 schema、provider retry 或纯算法。
- `components/<domain>/`：可复用 UI；只通过 props/emits 或明确 composable 交互。
- `composables/`：Vue 生命周期与单页/跨组件交互会话。
- `services/<domain>/`：纯合同、投影、事务、repository 与生成编排。
- `stores/`：确实需要跨页响应式共享的唯一 owner；不要把页面临时状态都升格成 store。
- `router/`：唯一正式页面注册表；旧 URL 用 redirect，不保留平行页面树。
- `__tests__/`：核心合同测试；浏览器旅程在仓库根 `scripts/`。

当前例外：`src/services/` 根层仍有较多历史文件。新代码不要继续堆在根层；移动旧文件时只做路径迁移，不与行为修改混在同一片。`Authoring.vue` 是待按 owner 渐进拆分的组合根，不允许再把大块纯逻辑直接写回页面。

