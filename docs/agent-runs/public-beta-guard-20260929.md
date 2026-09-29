# 2026-09-29 免登录公测防滥用

## 范围与发现

作者确认保持免登录，公测入口 `http://pinax.cc/`，兼容 `http://8.148.28.156`。本次只补轻量防护，不增加账号、邀请码或日配额。

检查发现：Express 原先全开放 CORS；普通模型 API 没有统一来源限制和调用限流；3001 监听全部 IPv4 地址。更严重的是内置密钥解析通过 URL 子串判断 MiniMax，伪造主机名或路径也可能匹配。代码存在泄露风险，但本次没有证据表明密钥已被盗用，也没有把真实密钥发往测试地址。建议在 MiniMax 控制台轮换旧密钥，更新服务器后重启后端。

## 实施

- 内置密钥仅注入完整匹配的官方 HTTPS 主机：`api.minimaxi.com`、`api.minimax.io`、`api.minimax.chat`；拒绝用户信息、非标准端口、query、fragment；无效目标不返回哨兵密钥。
- 文本、工具调用、图片、MiniMax 视频的鉴权请求不跟随 HTTP 重定向，防止请求转到其他目的地。
- 公网启用 `PINAX_PUBLIC_ORIGINS` 和 `PINAX_PROXY_SECRET`。Nginx 注入私有反代令牌；后端在解析正文之前拒绝缺失/错误令牌的 API 请求，直连端口也不能绕过。
- 写操作必须来自允许的 Origin，或无 Origin 时使用允许的 Referer；显式外站 Origin、跨站 fetch 和缺失来源均返回 403。CORS 同步收窄到两个站点。
- Nginx 对每 IP 写请求限速 60 次/分钟，允许 30 次瞬时突发；每 IP 最多 8 条同时活动的 API 连接，超额返回 429。GET 轮询不计入写请求限速。IP 取 Nginx 连接地址，不信任客户端自报的 X-Forwarded-For。
- 自部署环境不设置这两个变量时保留原行为；只设置其中一个会拒绝启动，避免看似启用实际失效。

## 边界

Origin/Referer 可以被服务端脚本伪造。此方案阻挡直接跨站调用、简单刷接口和直连后端绕过；不能保证免登录网站不会被自动化或反向代理。共享出口的用户共用单 IP 限额。没有账户级额度、验证码或持久总用量账本。

API 3001 仍监听现有地址，以兼容该主机的 Nginx 网络环境；通过私有令牌阻断非 Nginx API 调用，没有改动 SSH、其他服务或云安全组。对用户自带渠道的完整 SSRF/联网抓取审计不在本次修复范围内。

## 验证与部署

- main 代码提交 `f7fe6b8`，生产提交 `5035f79`，均已推送；服务器检出 `release-20260929-guard`。本机构建后上传，服务器没有构建。
- `node scripts/public-access-smoke.mjs`：60 项通过，exit 0，使用合成密钥，没有模型网络调用。
- `npm run verify:full`：exit 0，20/20 files、200/200 tests，lint 无 error（2 个既有 warning），Web/VitePress 构建、结构/体积与 diff 通过。日志 `/tmp/pinax-public-guard-final-verify.log`。
- 生产构建 exit 0；上传 bundle SHA256 `cd7d232ce90f55e278d50832bde6942fb893ffdf859aa9c608916f1448933ac1`，dist 包 SHA256 `a8757e62ae136c979c7d1d072e7eee8a2bb6fe12f1f0a033feecf882376f6b51`，服务端一致。
- Nginx 配置语法检查通过，reload 成功，PM2 后端 online、开发前端 stopped。
- 公网来源检查：本站 Origin/Referer 的空请求穿过防护，到达业务参数校验（400）；外站、无来源、null Origin、cross-site 均 403。
- 隔离浏览器首页、文档、写作页正常加载，无 pageerror；浏览器同站 POST 到达业务参数校验。
- 40 次连续空请求（逐次伪造不同 X-Forwarded-For）得到 32 次 400、8 次 429。空请求不会调用模型。公网脚本 `/tmp/pinax-public-live-check.mjs` exit 0，日志同名 `.log`。
- 主机内直连 `172.18.0.12:3001` 且无私有令牌返回 403；外网直连 `8.148.28.156:3001` 本次超时，不能据此推断所有网络路径都已关闭。
- 公网首页 SHA256 与生产 dist 一致。此次未执行真实模型生成，不能把入口检查当成生成质量验证。

## 运维与回滚

备份 `/root/pinax-backups/20260929-guard/` 保存部署前 server/.env（私有，勿上传）、Nginx 配置、旧 commit 与 dist。新令牌在服务器生成，只存于私有环境文件及 `/etc/aa_nginx/pinax-proxy-secret.conf`，没有写入 Git 或浏览器。

静态入口 `/var/www/pinax` 指向 `/var/www/pinax-releases/5035f79/dist`。上一版本目录 `/var/www/pinax-releases/3ed6dd0/dist` 保留。

回滚时恢复备份的 Nginx 配置和 server/.env，检出 `release-20260928`，恢复旧 dist/静态链接，检查 Nginx 语法后 reload，并重启 `pinax-backend`。不要覆盖其他服务、用户数据库或媒体目录。回滚也会撤销本次安全修复，应只用于紧急恢复。

主机名核对参考：[MiniMax 官方 API 文档](https://platform.minimax.io/docs/api-reference/api-overview)与[官方 MCP 配置示例](https://github.com/MiniMax-AI/MiniMax-MCP-JS/blob/main/.env.example)。
