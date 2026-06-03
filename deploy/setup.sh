#!/bin/bash
set -e

echo "=== Pinax 服务器初始化脚本 ==="

# 1. 安装 Nginx
if ! command -v nginx &> /dev/null; then
    echo "[1/5] 安装 Nginx..."
    apt update && apt install -y nginx
else
    echo "[1/5] Nginx 已安装"
fi

# 2. 安装 Node.js 18+
if ! command -v node &> /dev/null; then
    echo "[2/5] 安装 Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo "[2/5] Node.js 已安装: $(node --version)"
fi

# 3. 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "[3/5] 安装 PM2..."
    npm install -g pm2
else
    echo "[3/5] PM2 已安装"
fi

# 4. 配置 Nginx
echo "[4/5] 配置 Nginx..."
cp /root/Pinax/deploy/nginx-pinax.conf /etc/nginx/sites-available/pinax
ln -sf /etc/nginx/sites-available/pinax /etc/nginx/sites-enabled/pinax
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 5. PM2 启动 + 开机自启
echo "[5/5] 启动 PM2..."
cd /root/Pinax
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo ""
echo "=== 部署完成！访问 http://<IP> 后在设置页填写 API Key ==="