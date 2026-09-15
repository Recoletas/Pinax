# `src/` 代码放置速查

完整边界见 [`docs/engineering/current-architecture.md`](../docs/engineering/current-architecture.md)。

- `pages/`：路由级组合层，不在这里新建持久 schema、provider retry 或纯算法。
- `components/<domain>/`：可复用 UI；只通过 props/emits 或明确 composable 交互。
- `composables/`：Vue 生命周期与单页/跨组件交互会话。
- `services/<domain>/`：纯合同、投影、事务、repository 与生成编排；领域与生命周期分类见 [`services/README.md`](./services/README.md)。
- `stores/`：确实需要跨页响应式共享的唯一 owner；不要把页面临时状态都升格成 store。
- `router/`：唯一正式页面注册表；旧 URL 用 redirect，不保留平行页面树。
- `__tests__/`：核心合同测试；浏览器旅程在仓库根 `scripts/`。

当前例外：`src/services/` 根层保留高 fan-in 或跨域历史文件，新代码不要继续堆在根层。`Authoring.vue` 是组合根；书稿激活、检查器切换和主要生成工作流已有 owner，不允许再把业务事务写回页面。
