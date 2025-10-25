# 部署指南

## 部署环境要求

### 系统要求
- **操作系统**: Linux (推荐 Ubuntu 18.04+, CentOS 7+), macOS, Windows
- **Node.js**: >= 12.0.0 (推荐 16.x 或 18.x LTS)
- **内存**: >= 1GB (推荐 2GB+)
- **CPU**: 多核心处理器 (推荐 2 核心+)
- **存储**: >= 10GB 可用空间
- **网络**: 稳定的网络连接（如使用 OSS）

### 依赖安装

#### Ubuntu/Debian
```bash
# 更新包管理器
sudo apt update

# 安装系统依赖
sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# 安装 Node.js (使用 NodeSource 仓库)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装中文字体
sudo apt install -y fonts-wqy-microhei fonts-wqy-zenhei
```

#### CentOS/RHEL
```bash
# 安装系统依赖
sudo yum groupinstall -y "Development Tools"
sudo yum install -y cairo-devel pango-devel libjpeg-turbo-devel giflib-devel

# 安装 Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 安装中文字体
sudo yum install -y wqy-microhei-fonts wqy-zenhei-fonts
```

## 生产环境部署

### 1. 准备部署包

```bash
# 克隆项目
git clone https://github.com/xiaomaigou/echarts-export-server.git
cd echarts-export-server

# 安装依赖
npm ci --production

# 或使用国内镜像加速
npm ci --production --canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas/
```

### 2. 配置环境

```bash
# 复制配置文件
cp .env.example .env

# 编辑配置文件
vim .env
```

**生产环境配置示例**:
```bash
# 服务器配置
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# OSS配置
OSS_ACCESS_KEY_ID=your_production_key_id
OSS_ACCESS_KEY_SECRET=your_production_key_secret
OSS_BUCKET=your_production_bucket
OSS_REGION=oss-cn-hangzhou
OSS_CUSTOM_DOMAIN=cdn.yourdomain.com
OSS_PATH_PREFIX=charts/

# 队列配置
QUEUE_MAX_CONCURRENT=20
QUEUE_TASK_TIMEOUT=300
QUEUE_RETRY_ATTEMPTS=3
CLEANUP_INTERVAL_HOURS=6

# 存储配置
TASK_RETENTION_DAYS=3
```

### 3. 验证配置

```bash
# 验证配置
npm run validate-config

# 健康检查
npm run health-check
```

### 4. 启动服务

```bash
# 使用 PM2 启动
npm start

# 查看状态
npm run status

# 查看日志
npm run logs
```

## Docker 部署

### 1. 创建 Dockerfile

```dockerfile
FROM node:18-alpine

# 安装系统依赖
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    ttf-dejavu \
    fontconfig

# 创建应用目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production --canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas/

# 复制应用代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "foreground"]
```

### 2. 构建镜像

```bash
# 构建镜像
docker build -t echarts-export-server:latest .

# 运行容器
docker run -d \
  --name echarts-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e OSS_ACCESS_KEY_ID=your_key_id \
  -e OSS_ACCESS_KEY_SECRET=your_key_secret \
  -e OSS_BUCKET=your_bucket \
  -v /path/to/logs:/app/logs \
  echarts-export-server:latest
```

### 3. Docker Compose

```yaml
version: '3.8'

services:
  echarts-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - OSS_ACCESS_KEY_ID=${OSS_ACCESS_KEY_ID}
      - OSS_ACCESS_KEY_SECRET=${OSS_ACCESS_KEY_SECRET}
      - OSS_BUCKET=${OSS_BUCKET}
      - OSS_REGION=oss-cn-hangzhou
      - QUEUE_MAX_CONCURRENT=20
      - TASK_RETENTION_DAYS=3
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "scripts/health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - echarts-server
    restart: unless-stopped
```

## 负载均衡配置

### Nginx 配置

```nginx
upstream echarts_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name your-domain.com;

    # 请求大小限制
    client_max_body_size 10M;

    # 超时配置
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    location / {
        proxy_pass http://echarts_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查
    location /health {
        proxy_pass http://echarts_backend/api/system/queue-status;
        access_log off;
    }
}
```

### 多实例部署

```bash
# 启动多个实例
PORT=3000 npm start
PORT=3001 npm start  
PORT=3002 npm start

# 或使用 PM2 集群模式
pm2 start ecosystem.config.js
```

**ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'echarts-server',
    script: './src/server.js',
    instances: 'max', // 或指定数量
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
```

## 监控和日志

### 1. 日志配置

```bash
# 配置日志轮转
sudo vim /etc/logrotate.d/echarts-server
```

```
/path/to/echarts-export-server/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 node node
    postrotate
        pm2 reload echarts-server
    endscript
}
```

### 2. 系统监控

```bash
# 安装监控工具
npm install -g pm2-logrotate
pm2 install pm2-logrotate

# 配置监控
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 3. 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3000/api/system/queue-status"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "Service is healthy"
    exit 0
else
    echo "Service is unhealthy (HTTP $RESPONSE)"
    exit 1
fi
```

## 性能优化

### 1. 系统优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化内核参数
echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
sysctl -p
```

### 2. Node.js 优化

```bash
# 设置 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=2048"

# 启用 V8 优化
export NODE_OPTIONS="--optimize-for-size"
```

### 3. PM2 优化

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'echarts-server',
    script: './src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

## 安全配置

### 1. 防火墙设置

```bash
# Ubuntu/Debian
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

### 2. SSL/TLS 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://echarts_backend;
        # ... 其他配置
    }
}
```

## 故障排除

### 常见问题

1. **Canvas 安装失败**
   ```bash
   # 重新安装 canvas
   npm rebuild canvas
   
   # 或使用预编译版本
   npm install @napi-rs/canvas
   ```

2. **字体渲染问题**
   ```bash
   # 检查字体安装
   fc-list | grep -i "微软雅黑\|microsoft"
   
   # 重新生成字体缓存
   fc-cache -fv
   ```

3. **内存泄漏**
   ```bash
   # 监控内存使用
   pm2 monit
   
   # 设置内存重启
   pm2 start --max-memory-restart 1G
   ```

4. **OSS 连接问题**
   ```bash
   # 测试网络连接
   curl -I https://oss-cn-hangzhou.aliyuncs.com
   
   # 检查 OSS 配置
   npm run validate-config
   ```

### 日志分析

```bash
# 查看错误日志
tail -f logs/error.log

# 查看访问日志
tail -f logs/combined.log

# 搜索特定错误
grep -i "error\|fail" logs/combined.log
```