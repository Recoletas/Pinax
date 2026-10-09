# Agent 运行包发布

PR #6 将文本请求出口统一到 Storyflow。仅上传 `dist` 无法运行文本生成，还必须携带运行包。

## 本机构建

使用 Node 22，在 Pinax 仓库执行：

```sh
npm ci
npm run build:agent-runtime
npm run build
```

运行器源版本固定在 `shared/storyagentRuntimeSource.json`；构建脚本只导出源代码和锁文件，使用 `npm ci` 编译并移除开发依赖，不带入上游配置或上游已安装依赖。输出 `.runtime/storyagent/runtime-source.json` 记录源提交、依赖锁和 Pinax 扩展指纹。此目录被 Git 忽略，需要随发布包上传。

## 服务器运行

服务器使用同平台 Node 22；发布包含 `dist/`、`server/`、`shared/`、必要的服务端生产依赖和 `.runtime/storyagent/`。服务器启动 Express 时自动拉起编译后的运行器，监听 loopback，浏览器只能通过 Express 代理访问。运行器任务目录要使用持久目录，不能随着版本目录一起删除。

保留服务器已有环境配置和模型密钥。只有 `MINIMAX_API_KEY` 且没有显式 Kit 模型配置时，启动器使用 MiniMax-M2.7 的 Anthropic 接口；有显式配置时尊重显式配置。公网必须设置已有的 `PINAX_PUBLIC_ORIGINS`，由服务端关闭本机文件能力和模型写接口。不得上传本地 `.env`，也不要把运行器端口暴露到公网。

发布前检查 `/api/storyagent/healthz`、模型状态、真实助手检索与生成；采用动作应在浏览器执行，不能让运行器直接修改正式作品。运行器缺失时会明确返回不可用，不自动切换另一套文本引擎。

## 回滚

保留上一版完整前端、后端和运行包，通过现有进程管理器一起切回，保留原环境配置和任务目录。不要只回滚前端或只覆盖运行器依赖。

本轮已经在 1871 MiB 的现有服务器上做临时运行包内存检查：运行器空闲约 91 MiB，两个合成任务并发峰值约 103 MiB，测试进程合计约 180 MiB。临时目录已清理；该检查没有部署或重启生产服务。真实模型质量和整站负载不能由该内存结果推定。
