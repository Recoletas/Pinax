# 固定 Core 消费产物

Web 通过 `package.json` 与 `package-lock.json` 引用此目录中版本固定的 `@pinax/core` tarball。它来自独立仓库，不从宿主 `packages/core` 打包。产物随宿主代码分发，安装不依赖本机存在兄弟仓库，也不需要私有 registry 凭据。正式 registry 尚未配置。

当前版本：0.8.0；源提交、仓库地址、SHA-256、npm integrity 见同名 `.provenance.json`。不在宿主修改或覆盖同版本包；业务修改应进入独立仓库、升级版本后再更新消费端。

更新方式（不是验证命令）：

```bash
npm run core:pack -- /path/to/pinax-core
npm install ./vendor/core/pinax-core-<new-version>.tgz --save-exact --ignore-scripts
```

`core:pack` 要求来源为无未提交改动的独立 git 仓库，会生成来源记录；它不会自动修改依赖或发布 npm 包。安装后需显式更新锁文件。`core:smoke` 已改为消费宿主锁定产物，不再从旧源码副本重新打包；本轮未执行该检查。

宿主旧 `packages/core` 暂留大纲端点存在性校验 WIP 与历史合同用例，不再被应用源码消费，尚未完成退役。独立包目前未含该 WIP，不能把切包称为所有业务规则已合并。
