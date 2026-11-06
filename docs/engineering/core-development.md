# 修改一次 Core，让各端复用

共享业务的源码只放在独立 `pinax-core` 仓库。Web、Pinix 安装同一个 `@pinax/core` 包；页面、平台存储和网络适配仍属于各端。兼容现有接口的 Core 修改，各端更新依赖并重新构建后即可使用，不需要复制业务代码。新增端口或改变接口时，仍需适配调用端。

## 在任一端开发

先检出独立 Core 仓库，并在其中运行 `npm ci`。在正在开发的 Web 或 Pinix 根目录执行：

```sh
npm run core:dev -- /path/to/pinax-core
npm run core:status
```

重启相关开发服务，编辑 **独立仓库的 `src/`**。当前宿主通过标准包路径直接读取该源码；Vite 可读取链接后的源码，Node 服务需要按其重载方式重启。已经打包的助手运行器仍需重新构建运行包，不会自动改写运行中的产物。

连接仅影响本机 `node_modules`，不修改 package.json 或 lockfile，不使用全局 npm link。不要编辑宿主的历史 `packages/core` 转发文件或压缩包。Core 的改动在 Core 仓库查看、测试、提交；各端 UI 或平台改动在各自仓库提交。

调试完成，先停下或重启相关开发服务，再恢复固定依赖：

```sh
npm run core:restore
```

恢复不会删除 Core 源码及改动。开发期间不要再运行 npm install/ci；若已运行导致安装状态被替换，按命令提示检查 `node_modules/.pinax-core-dev.json` 和 `node_modules/@pinax/.core-installed`，确认后用 `npm ci` 重建依赖。不要把这些本机记录提交。

## 让其他端用上修改

在独立 Core 仓库完成测试、升级版本并提交。每个版本对应一个固定提交，不覆盖已经交付的同版本包。需要跨机器协作时，先推送 Core 提交，再在另一机器拉取；本命令不替你推送或发布。

在每个需要更新的宿主运行：

```sh
npm run core:update -- /path/to/pinax-core
```

命令从干净的独立 Core 提交打包，记录提交和校验值，再安装固定产物并更新 package.json/lockfile。已存在的产物必须与同一提交和校验值一致才能复用，不能用相同版本偷偷换内容。各端可以独立决定更新时间，不会被另一端正在调试的源码影响。

运行该端适用的检查、构建，然后将新产物及 provenance、package.json、package-lock.json 随该端提交。其他开发者拉取宿主后执行 `npm ci` 即可复现，不需要本机也有 Core 源码。部署、APK 和已打包的运行器仍按各端正常更新流程处理。

## 当前范围

Web 与 Pinix 都提供 `core:dev`、`core:restore`、`core:status`、`core:update`，使用同一份工具逻辑。Core 目前为 0.16.0，仍用仓库内固定 tarball 分发；私有 npm registry 尚未配置。本轮不更新 Next，也不自动推送、发布或部署。

`npm run core:workflow:smoke` 使用临时 Core 仓库和两个临时宿主验证开发连接、Vite 读取、固定版本隔离、恢复、更新与 npm ci，不碰真实稿件或用户服务。
