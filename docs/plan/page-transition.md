# 页面过渡动画执行方案

状态：当前 P2 视觉 polish 执行文档

## 1. 目标

给主工作台的页面切换补一层克制的内容区过渡，让体验、世界书、写作、素材、画布等路由之间的切换不再瞬时跳变，同时不改变导航骨架、业务状态或路由结构。

本方案只解决页面间衔接和反馈一致性，不扩展新的交互模式。

## 2. 范围

只动画 `.shell-content` 内部的路由页面：

- `ActivityBar` 不参与动画。
- `SidePanel` 不参与动画。
- 移动端底部导航不参与动画。
- 桌面与移动端都只切换内容区。

原因：

- 导航和侧栏是稳定工作台骨架，切页时不应该闪烁或位移。
- 用户需要感知“内容页换了”，而不是“整个应用重新加载了”。
- 移动端底部导航承担定位作用，切页时保持稳定更符合工具型应用习惯。

## 3. 动画决策

采用 `opacity + translateY(8px)` 的轻量过渡：

| 阶段 | 效果 | 时长 | 缓动 |
| --- | --- | --- | --- |
| enter | `opacity: 0 -> 1`，`translateY(8px) -> 0` | `0.2s` | `ease` |
| leave | `opacity: 1 -> 0` | `0.15s` | `ease` |

说明：

- 进入态轻微上移淡入，和现有 `fadeIn` 的方向一致。
- 离开态只淡出，不做位移，避免页面切换显得像 modal 或抽屉。
- `0.2s` 与现有 toast / fade 节奏一致，`0.15s` 与 hover 反馈接近。
- 过渡属性只包含 `opacity` 和 `transform`，避免触发布局重排。

## 4. 明确不做

- 不做左右 slide。工具型页面横向滑动容易暗示层级或前后关系，但当前路由是平级模块。
- 不做 scale。缩放更像弹窗或卡片展开，对完整页面过渡过重。
- 不做全屏遮罩。页面切换不应阻塞或制造加载感。
- 不引入 JS 动画库。Vue `<transition>` 和 CSS 足够完成当前需求。
- 不新增动画状态 store。路由切换状态不需要进入业务状态层。
- 不改 router 配置。动画只在 layout 层包裹当前 `RouterView`。

## 5. 实现形态

### 5.1 `src/layouts/AppShell.vue`

把 `.shell-content` 内的普通 `<RouterView />` 改为 scoped slot，并用 `mode="out-in"` 包住动态组件：

```vue
<RouterView v-slot="{ Component, route }">
  <transition name="page-route" mode="out-in">
    <component :is="Component" :key="route.name || route.fullPath" />
  </transition>
</RouterView>
```

关键点：

- `transition` 包裹的动态组件需要成为 `.shell-content` 的直接内容，不额外包卡片或页面容器。
- `:key` 使用 `route.name || route.fullPath`，避免 unnamed route 切换时不触发动画。
- `mode="out-in"` 让旧页面先离开、新页面再进入，防止快速连续切换时双页面堆叠。
- `.shell-content` 保持现有 grid 布局和 `overflow: auto`，不要为了动画改成 fixed 或 hidden。

### 5.2 `src/styles/main.css`

在现有 `fadeIn` 相关样式附近添加 route transition 类：

```css
.page-route-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-route-leave-active {
  transition: opacity 0.15s ease;
}

.page-route-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-route-leave-to {
  opacity: 0;
}
```

不需要给 leave 添加 `transform`。页面离开时只淡出，可以减少纵向滚动页在离场时产生的视觉漂移。

## 6. Reduced Motion

必须补 `prefers-reduced-motion: reduce` 分支：

```css
@media (prefers-reduced-motion: reduce) {
  .page-route-enter-active,
  .page-route-leave-active {
    transition: opacity 0.01s ease;
  }

  .page-route-enter-from {
    opacity: 0;
    transform: none;
  }

  .page-route-leave-to {
    opacity: 0;
  }
}
```

验收口径：

- reduced motion 下不出现明显位移动画。
- 可以保留极短淡入淡出，也可以后续改为完全取消动画。
- 不影响其他已有 hover、toast、panel 动画策略。

## 7. 布局注意点

- `.shell-content` 继续承担内容滚动，保持 `overflow: auto`。
- 不给 `.shell-content` 添加新的 `position: fixed`、全屏遮罩或额外高度锁定。
- 页面组件自身的滚动策略不因 transition 改变。
- 过渡组件不要包住 `ActivityBar`、`SidePanel` 或移动端导航。
- 在 360px、768px、1280px 下检查动画期间是否产生横向滚动。

## 8. 验收

构建检查：

```bash
npm run build
```

手动检查：

1. 在体验、世界书、写作、素材、画布之间切换，只有内容区过渡。
2. `ActivityBar`、`SidePanel` 和移动端底部导航不闪烁、不位移。
3. 快速连续点击导航时不出现双页面堆叠。
4. 360px、768px、1280px 视口下内容区不因动画产生横向滚动。
5. 系统开启 reduced motion 时无明显位移动画。

## 9. 后续实施边界

后续落地时改动集中在：

- `src/layouts/AppShell.vue`
- `src/styles/main.css`

不需要：

- 新增依赖。
- 新增 store。
- 改 router。
- 改页面数据流。
- 调整业务状态。
