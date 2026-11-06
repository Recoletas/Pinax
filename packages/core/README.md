# 历史 Core 测试兼容目录

实现已迁入独立 `Recoletas/pinax-core`。本目录的 `src` 仅将历史测试路径转向宿主锁定的 `@pinax/core` 包，不含第二份实现，也不能用于打包。业务变更及新合同测试应在独立仓库完成。现有测试暂留作 Web 消费回归，`npm run test:core` 仍检查实际安装的包。
