# 部署到公网

> 这一节是这个项目说明书区别于其他 LLM 应用的核心。先把"密钥模型"那一段读完再上手。

## 部署模型

服务器对公网**完全开放**：

- 没有登录、没有鉴权、没有 token 校验
- CORS 全开，任何域名的前端都能调
- 任何人能访问 `/api/*`

这不是 bug，是设计。fork 这个项目的人大多是想自己 host 出来给朋友 / 小圈子用，而不是做商业 SaaS。所以省掉了所有账号系统。

这个设计的代价是：**唯一要守的安全边界是"一个用户的 key 不能出现在另一台机器 / 另一个用户能读到的地方"**。下面解释怎么守。

## 密钥模型

你的 LLM API key 和 Mem0 API key，**只**存在你自己浏览器的 `localStorage` 里：

| 键名 | 存什么 |
| --- | --- |
| `apiSettings` | provider / baseUrl / apiKey / model |
| `mem0_settings` | Mem0 apiKey / host |

**服务器永远不存这些 key**。每次前端要调 LLM / Mem0 时，会把 key 塞到 HTTP 请求体里：

```
POST /api/chat/stream
{
  "messages": [...],
  "provider": "deepseek",
  "apiKey": "sk-xxx",        // ← 每次请求都带，从 localStorage 读
  "model": "deepseek-v4-flash"
}
```

服务端只是把这个请求原样转发到上游 LLM，把响应原样吐回前端。**不会**写盘、**不会**打 log、**不会**存到任何数据库。

代码里：

- 没有 `secrets.json`
- 没有 `process.env.OPENAI_API_KEY` 兜底
- 没有 `PINAX_TOKEN` 这种鉴权头
- 没有 `secrets` 端点

服务器上的 `.env` 只配 `PORT` 和 OpenClaw 相关的几个变量，**不**配任何用户级别的 key。

## 为什么这样设计

历史上这个项目曾经把用户的 key 落到 `server/data/secrets.json`。本地单用户玩的时候没问题，但一旦公网部署就完了：所有用户的 key 全在一台机器的一个 JSON 文件里，访问 `/chat/secrets/read` 端点（虽然现在没了）就能读到。

新设计把这个面缩到最小：用户自己的 key 只在自己浏览器里，服务器**根本看不到**用户的 key 长什么样（它只是个透传的中转站）。

攻击者能拿到一个用户 key 的唯一路径是：拿到那个用户**自己电脑 / 浏览器**的访问权。这跟 GitHub、Notion 这些 SaaS 是同样的边界条件。

## 部署到公网前必须做三件事

### 1. 轮换上游 key

如果你（或你的朋友）在历史上往这个项目的 `secrets.json` 里写过 LLM key，**那条 key 必须去上游轮换一次**。git history 里的 `secrets.json` 已经删了，但 key 值可能已经泄露了。

具体步骤：

1. 去 LLM provider 后台（DeepSeek / OpenAI / ...）
2. 找到那条 key，删掉或重置
3. 生成新 key
4. 在你自己的浏览器 **设置 → AI API** 里填新 key
5. 让所有曾经用过这个项目的朋友也换 key

### 2. 关掉反代的请求体 log

默认的 nginx access log 会记请求体，里头就有 `apiKey`。生产部署必须关掉。

nginx 配置里：

```nginx
log_format main '$remote_addr - $remote_user [$time_local] '
                '"$request" $status $body_bytes_sent '
                '"$http_referer" "$http_user_agent"';
# 注意：上面没有 $request_body，这是关键
```

**不要**用 `log_format` 里有 `$request_body` 的配置。

或者直接关 access log：

```nginx
access_log off;
```

### 3. 加 rate limit

LLM 中转是按 token 收钱的，被人刷爆你就破产了。nginx 加一层限速：

```nginx
# 每个 IP 每秒最多 5 个请求
limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;

server {
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://127.0.0.1:3001;
        # ... 其他配置
    }
}
```

`burst=10` 允许短时突发，`nodelay` 是超出的请求立即 503 而不排队。

## 部署步骤（生产）

仓库根目录有现成的：

- `ecosystem.config.js` —— PM2 配置
- `deploy/nginx-pinax.conf` —— nginx 站点配置
- `deploy/setup.sh` —— 一键安装脚本（**注意**：这个脚本硬编码了 `/root/Pinax/` 路径，要在你的服务器上跑得先改）

### 简化版流程

假设你已经有一台 Linux 服务器（Ubuntu 22.04+），跑：

```bash
# 1. 装 Node.js 20、nginx、PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nginx
sudo npm install -g pm2

# 2. 把项目代码放到服务器
sudo mkdir -p /opt/wrias
sudo chown $USER:$USER /opt/wrias
git clone <仓库地址> /opt/wrias
cd /opt/wrias
npm ci
npm run build

# 3. 起后端（PM2）
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 跟着提示跑 sudo 命令

# 4. 配 nginx
sudo cp deploy/nginx-pinax.conf /etc/nginx/sites-available/wrias
# 编辑 /etc/nginx/sites-available/wrias：
#   - root 改成 /opt/wrias/dist
#   - proxy_pass 保持 127.0.0.1:3001
#   - access_log 改成 off（或自定义 log_format 不带 $request_body）
#   - 加上 limit_req
sudo ln -s /etc/nginx/sites-available/wrias /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 5. 配 HTTPS（强烈建议用 Let's Encrypt）
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 服务器 `.env`

```bash
PORT=3001
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<你的 token，没有就留空>
OPENCLAW_AGENT_ID=main
```

**不要**在 `.env` 里写 `OPENAI_API_KEY` / `MEM0_API_KEY` 之类的用户级 key。这个文件是服务器配置，不是用户配置。

## 部署后运维

### 看日志

```bash
pm2 logs pinax          # 实时
pm2 logs pinax --lines 200  # 最近 200 行
```

### 重启

```bash
pm2 restart pinax
```

### 升级

```bash
cd /opt/wrias
git pull
npm ci
npm run build
pm2 restart pinax
```

### 监控建议

至少挂个 uptime 监控（UptimeRobot / 自己的 status page），免得挂了几天自己不知道。LLM 中转被打爆也是从监控报警里看最直接。

## 反向代理时容易踩的坑

### SSE 流被缓冲

`/api/chat/stream` 是 Server-Sent Events，反代会默认 buffer 住，导致流式输出变成一次性返回。nginx 必须关 buffer：

```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:3001;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;  # 长连接
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}
```

仓库的 `deploy/nginx-pinax.conf` 已经配好了，你照搬就行。

### WebSocket 超时（如果用 OpenClaw 直连）

OpenClaw 是 WebSocket。nginx 默认 60s 断开，要加：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
```
