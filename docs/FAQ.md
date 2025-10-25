# 常见问题解答 (FAQ)

## 🚀 快速开始

### Q: 如何快速启动服务？

A: 按以下步骤操作：
```bash
git clone https://github.com/xiaomaigou/echarts-export-server
cd echarts-export-server
npm install
npm run setup  # 运行配置向导
npm run dev    # 启动开发服务器
```

### Q: 是否需要配置 OSS？

A: OSS 配置是可选的：
- **不配置 OSS**: 图片将保存在本地 `logs/` 目录，适合开发和测试
- **配置 OSS**: 图片自动上传到阿里云 OSS，适合生产环境

## ⚙️ 配置相关

### Q: 如何验证配置是否正确？

A: 使用内置的配置验证工具：
```bash
npm run validate-config
```

### Q: 配置文件在哪里？

A: 配置文件位置：
- 主配置文件：`.env`
- 示例配置：`.env.example`
- 配置管理器：`src/config/index.js`

### Q: 如何修改服务器端口？

A: 在 `.env` 文件中设置：
```bash
PORT=8080
```

### Q: OSS 配置参数说明？

A: OSS 必需参数：
```bash
OSS_ACCESS_KEY_ID=your_access_key_id      # 访问密钥ID
OSS_ACCESS_KEY_SECRET=your_access_key_secret  # 访问密钥Secret
OSS_BUCKET=your_bucket_name               # 存储桶名称
OSS_REGION=oss-cn-hangzhou               # 区域
```

可选参数：
```bash
OSS_CUSTOM_DOMAIN=cdn.yourdomain.com     # 自定义域名
OSS_PATH_PREFIX=charts/                  # 文件路径前缀
```

## 🔄 API 使用

### Q: 异步 API 和同步 API 有什么区别？

A: 
- **异步 API** (推荐): 立即返回任务ID，支持高并发，适合生产环境
- **同步 API**: 等待图片生成完成后返回，兼容旧版本

### Q: 如何使用异步 API？

A: 分两步操作：
```javascript
// 1. 提交任务
const response = await fetch('/api/charts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'png', width: 600, height: 400, option: chartOption })
});
const { taskId } = response.data;

// 2. 查询状态
const statusResponse = await fetch(`/api/charts/status/${taskId}`);
const { status, imageUrl } = statusResponse.data;
```

### Q: 任务状态有哪些？

A: 任务状态说明：
- `pending`: 等待处理
- `processing`: 正在处理
- `completed`: 已完成
- `failed`: 处理失败

### Q: 如何处理任务失败？

A: 检查任务状态中的错误信息：
```javascript
const statusResponse = await fetch(`/api/charts/status/${taskId}`);
const { status, error } = statusResponse.data;

if (status === 'failed') {
  console.error('任务失败:', error);
  // 根据错误类型进行重试或其他处理
}
```

## 🖼️ 图片生成

### Q: 支持哪些图片格式？

A: 支持以下格式：
- `png` (默认)
- `jpeg`
- `svg`
- `pdf`

### Q: 如何设置图片尺寸？

A: 在请求中指定 width 和 height：
```json
{
  "type": "png",
  "width": 1200,
  "height": 800,
  "option": { ... }
}
```

### Q: 图片尺寸有限制吗？

A: 建议限制：
- 最大尺寸：4096x4096 像素
- 最小尺寸：100x100 像素
- 考虑服务器内存和处理时间

### Q: 中文字体显示异常怎么办？

A: 安装中文字体：

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install fonts-wqy-microhei fonts-wqy-zenhei

# CentOS/RHEL
sudo yum install wqy-microhei-fonts wqy-zenhei-fonts

# 手动安装微软雅黑
mkdir -p /usr/share/fonts/truetype
cp msyh.ttf /usr/share/fonts/truetype/
fc-cache -fv
```

**macOS:**
```bash
cp yourFont.ttf ~/Library/Fonts/
```

## 🚦 性能和并发

### Q: 如何提高并发处理能力？

A: 调整以下配置：
```bash
QUEUE_MAX_CONCURRENT=20    # 增加并发数
QUEUE_TASK_TIMEOUT=180     # 调整超时时间
```

### Q: 服务器资源要求？

A: 推荐配置：
- **CPU**: 2核心以上
- **内存**: 2GB以上
- **存储**: 根据图片数量确定
- **网络**: 稳定连接（使用OSS时）

### Q: 如何监控服务性能？

A: 使用内置监控：
```bash
# 查看队列状态
curl http://localhost:3000/api/system/queue-status

# 查看服务状态
npm run status

# 查看日志
npm run logs
```

## 🔧 部署和运维

### Q: 如何在生产环境部署？

A: 推荐使用 PM2：
```bash
# 设置生产环境配置
NODE_ENV=production

# 启动服务
npm start

# 查看状态
npm run status
```

### Q: 如何实现负载均衡？

A: 使用 Nginx + 多实例：
```bash
# 启动多个实例
PORT=3000 npm start
PORT=3001 npm start
PORT=3002 npm start
```

Nginx 配置：
```nginx
upstream echarts_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
```

### Q: 如何备份和恢复？

A: 需要备份的内容：
- 配置文件：`.env`
- 日志文件：`logs/`
- 本地图片：`logs/` (如未使用OSS)

### Q: 如何升级版本？

A: 升级步骤：
```bash
# 1. 备份配置
cp .env .env.backup

# 2. 停止服务
npm stop

# 3. 更新代码
git pull origin main
npm install

# 4. 验证配置
npm run validate-config

# 5. 启动服务
npm start
```

## 🐛 故障排除

### Q: 服务启动失败怎么办？

A: 按以下步骤排查：
```bash
# 1. 检查配置
npm run validate-config

# 2. 查看错误日志
npm run logs

# 3. 检查端口占用
lsof -i :3000

# 4. 检查依赖安装
npm install
```

### Q: Canvas 安装失败？

A: 尝试以下解决方案：
```bash
# 方案1: 重新安装
npm rebuild canvas

# 方案2: 使用预编译版本
npm install @napi-rs/canvas

# 方案3: 使用镜像源
npm install --canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas/

# 方案4: 安装系统依赖 (Linux)
sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Q: OSS 上传失败？

A: 检查以下项目：
1. **网络连接**: `ping oss-cn-hangzhou.aliyuncs.com`
2. **配置正确性**: `npm run validate-config`
3. **权限设置**: 确保 OSS 账号有上传权限
4. **存储桶设置**: 检查存储桶是否存在且可访问

### Q: 内存使用过高？

A: 优化措施：
```bash
# 1. 设置内存限制
export NODE_OPTIONS="--max-old-space-size=1024"

# 2. 启用内存重启
pm2 start --max-memory-restart 1G

# 3. 调整任务保留时间
TASK_RETENTION_DAYS=1

# 4. 减少并发数
QUEUE_MAX_CONCURRENT=5
```

### Q: 任务处理缓慢？

A: 优化建议：
1. **增加并发数**: `QUEUE_MAX_CONCURRENT=20`
2. **检查服务器资源**: CPU、内存使用情况
3. **优化图片尺寸**: 避免过大的图片
4. **使用 SSD 存储**: 提高 I/O 性能

## 📞 获取帮助

### Q: 在哪里可以获得更多帮助？

A: 获取帮助的途径：
1. **查看文档**: [API文档](API.md), [部署指南](DEPLOYMENT.md)
2. **提交 Issue**: [GitHub Issues](https://github.com/xiaomaigou/echarts-export-server/issues)
3. **查看 Wiki**: [项目 Wiki](https://github.com/xiaomaigou/echarts-export-server/wiki)
4. **运行诊断**: `npm run health-check`

### Q: 如何报告 Bug？

A: 报告 Bug 时请提供：
1. **错误描述**: 详细的错误现象
2. **复现步骤**: 如何重现问题
3. **环境信息**: 操作系统、Node.js 版本
4. **配置信息**: 相关配置（隐藏敏感信息）
5. **错误日志**: 相关的错误日志

### Q: 如何贡献代码？

A: 贡献流程：
1. Fork 项目
2. 创建功能分支
3. 提交代码
4. 创建 Pull Request
5. 等待代码审查

---

💡 **提示**: 如果您的问题没有在这里找到答案，请查看 [GitHub Issues](https://github.com/xiaomaigou/echarts-export-server/issues) 或创建新的 Issue。