# Apache ECharts 异步导出服务器

基于 Node.js 的高性能异步图表导出服务，支持将 [Apache ECharts](https://echarts.apache.org/) 图表渲染为图片（PNG、JPG、SVG、PDF）并自动上传到阿里云 OSS 存储。

## ✨ 特性

- 🚀 **异步处理**: 支持异步任务队列，提高并发处理能力
- ☁️ **云存储集成**: 自动上传图片到阿里云 OSS，提供稳定的访问链接
- 🔄 **向后兼容**: 完全兼容原有同步 API，无缝升级
- 📊 **任务管理**: 实时查询任务状态和处理进度
- 🛡️ **错误处理**: 完善的错误处理和重试机制
- 📈 **监控支持**: 内置性能监控和日志系统
- ⚙️ **灵活配置**: 支持环境变量配置，适应不同部署环境

## 🏗️ 架构概述

新版本采用异步架构，将图表生成任务放入队列处理，支持高并发请求：

```
客户端请求 → Express服务器 → 任务队列 → 图片生成器 → OSS上传 → 返回图片URL
```

## 📋 系统要求

- **Node.js**: >= 12.0.0
- **内存**: 建议 >= 1GB
- **CPU**: 多核心处理器（推荐）
- **存储**: 根据使用量确定
- **网络**: 如使用 OSS 需要稳定的网络连接

## 🚀 快速开始

### 1. 安装

确保已安装 Node.js (>= 12.0.0)，然后克隆项目并安装依赖：

```bash
git clone https://github.com/xiaomaigou/echarts-export-server
cd echarts-export-server
npm install

# 如果 canvas 下载较慢，可使用国内镜像
npm install --unsafe-perm --canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas/
```

### 2. 配置

运行设置向导创建配置文件：

```bash
npm run setup
```

或者手动复制并编辑配置文件：

```bash
cp .env.example .env
# 编辑 .env 文件，配置必要的参数
```

### 3. 验证配置

```bash
npm run validate-config
```

### 4. 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式（PM2 守护进程）
npm start

# 前台运行（查看日志）
npm run foreground
```

## 📖 API 文档

### 异步 API（推荐）

#### 1. 提交图片生成任务

```http
POST /api/charts/generate
Content-Type: application/json

{
  "type": "png",
  "width": 600,
  "height": 400,
  "option": {
    // ECharts 配置对象
  },
  "ossPath": "charts/2024/01/"  // 可选：OSS路径前缀
}
```

**响应：**
```json
{
  "code": 200,
  "msg": "Task created successfully",
  "data": {
    "taskId": "uuid-v4-string",
    "status": "pending",
    "statusUrl": "/api/charts/status/{taskId}"
  }
}
```

#### 2. 查询任务状态

```http
GET /api/charts/status/{taskId}
```

**响应：**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "uuid-v4-string",
    "status": "completed",
    "imageUrl": "https://your-bucket.oss-region.aliyuncs.com/path/to/image.png",
    "createdAt": "2024-01-01T00:00:00Z",
    "completedAt": "2024-01-01T00:00:05Z"
  }
}
```

**任务状态说明：**
- `pending`: 等待处理
- `processing`: 正在处理
- `completed`: 已完成
- `failed`: 处理失败

#### 3. 查询系统状态

```http
GET /api/system/queue-status
```

**响应：**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "pendingTasks": 5,
    "processingTasks": 2,
    "totalProcessed": 1000,
    "averageProcessingTime": 2.5
  }
}
```

### 同步 API（兼容模式）

为保持向后兼容，原有的同步 API 仍然可用：

```http
POST /
Content-Type: application/json

{
  "type": "png",
  "width": 600,
  "height": 400,
  "async": false,  // 显式指定同步模式
  "option": {
    // ECharts 配置对象
  }
}
```



## ⚙️ 配置说明

### 环境变量配置

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `PORT` | 服务器端口 | 3000 | 否 |
| `NODE_ENV` | 运行环境 | development | 否 |
| `OSS_ACCESS_KEY_ID` | OSS访问密钥ID | - | 否* |
| `OSS_ACCESS_KEY_SECRET` | OSS访问密钥Secret | - | 否* |
| `OSS_BUCKET` | OSS存储桶名称 | - | 否* |
| `OSS_REGION` | OSS区域 | oss-cn-hangzhou | 否 |
| `OSS_CUSTOM_DOMAIN` | 自定义域名 | - | 否 |
| `OSS_PATH_PREFIX` | 文件路径前缀 | charts/ | 否 |
| `QUEUE_MAX_CONCURRENT` | 最大并发任务数 | 10 | 否 |
| `QUEUE_TASK_TIMEOUT` | 任务超时时间(秒) | 300 | 否 |
| `TASK_RETENTION_DAYS` | 任务保留天数 | 7 | 否 |

*注：OSS配置为可选，如不配置将使用本地存储*

### 配置示例

```bash
# 基本配置
PORT=3000
NODE_ENV=production

# OSS配置（可选）
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
OSS_REGION=oss-cn-hangzhou
OSS_PATH_PREFIX=charts/

# 队列配置
QUEUE_MAX_CONCURRENT=10
QUEUE_TASK_TIMEOUT=300
TASK_RETENTION_DAYS=7
```

## 🔧 运维管理

### 常用命令

```bash
# 服务管理
npm start          # 启动服务（PM2守护进程）
npm stop           # 停止服务
npm restart        # 重启服务
npm run status     # 查看服务状态
npm run logs       # 查看日志

# 开发调试
npm run dev        # 开发模式启动
npm run foreground # 前台运行
npm test           # 运行测试

# 配置管理
npm run setup           # 运行设置向导
npm run validate-config # 验证配置
npm run health-check    # 健康检查
```

### 监控和日志

服务提供多种监控方式：

1. **健康检查端点**: `GET /api/system/queue-status`
2. **日志文件**: `logs/combined.log`, `logs/error.log`
3. **PM2 监控**: `npm run status`, `npm run logs`
4. **配置验证**: `npm run validate-config`

### 性能优化建议

1. **并发设置**: 根据服务器性能调整 `QUEUE_MAX_CONCURRENT`
2. **内存管理**: 定期清理过期任务，设置合理的 `TASK_RETENTION_DAYS`
3. **OSS配置**: 使用 CDN 加速图片访问
4. **负载均衡**: 高并发场景下可部署多个实例

## 📚 迁移指南

### 从同步版本升级

如果您正在使用旧版本的同步 API，可以按以下步骤升级：

#### 1. 保持现有代码不变（推荐）

新版本完全兼容原有 API，无需修改现有代码：

```javascript
// 原有代码继续工作
const response = await fetch('/api/charts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'png',
    width: 600,
    height: 400,
    option: chartOption
  })
});
```

#### 2. 逐步迁移到异步 API（推荐）

```javascript
// 新的异步 API
// 1. 提交任务
const taskResponse = await fetch('/api/charts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'png',
    width: 600,
    height: 400,
    option: chartOption
  })
});
const { taskId } = taskResponse.data;

// 2. 轮询任务状态
const checkStatus = async () => {
  const statusResponse = await fetch(`/api/charts/status/${taskId}`);
  const { status, imageUrl } = statusResponse.data;
  
  if (status === 'completed') {
    return imageUrl;
  } else if (status === 'failed') {
    throw new Error('Task failed');
  } else {
    // 继续轮询
    setTimeout(checkStatus, 1000);
  }
};

const imageUrl = await checkStatus();
```

### 配置迁移

1. **备份现有配置**
2. **运行设置向导**: `npm run setup`
3. **验证新配置**: `npm run validate-config`
4. **测试服务**: `npm run health-check`

## 🛠️ 字体安装

ECharts 使用系统字体渲染图表，请根据操作系统安装所需字体：

### Linux
```bash
# 安装中文字体（解决中文乱码）
mkdir -p /usr/share/fonts/truetype
cp msyh.ttf /usr/share/fonts/truetype/  # 微软雅黑
fc-cache -fv

# 安装系统依赖（CentOS/RHEL）
yum install gcc-c++ cairo-devel libjpeg-turbo-devel pango-devel giflib-devel
```

### macOS
```bash
# 使用 Font Book 应用安装，或复制到字体目录
cp yourFont.ttf ~/Library/Fonts/
```

### Windows
```bash
# 复制字体文件到系统字体目录
copy yourFont.ttf C:\Windows\Fonts\
```

## 💡 使用示例

### 异步 API 示例

#### JavaScript/Node.js

```javascript
const axios = require('axios');

async function generateChart() {
  // 1. 提交任务
  const taskResponse = await axios.post('http://localhost:3000/api/charts/generate', {
    type: 'png',
    width: 800,
    height: 600,
    option: {
      backgroundColor: '#fff',
      animation: false,
      xAxis: {
        type: 'category',
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        data: [820, 932, 901, 934, 1290, 1330, 1720],
        type: 'line',
        label: { show: true }
      }]
    }
  });

  const { taskId } = taskResponse.data.data;
  console.log('任务已提交:', taskId);

  // 2. 轮询任务状态
  while (true) {
    const statusResponse = await axios.get(`http://localhost:3000/api/charts/status/${taskId}`);
    const { status, imageUrl, error } = statusResponse.data.data;

    if (status === 'completed') {
      console.log('图片生成完成:', imageUrl);
      return imageUrl;
    } else if (status === 'failed') {
      throw new Error(`任务失败: ${error}`);
    } else {
      console.log('任务状态:', status);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    }
  }
}

generateChart().catch(console.error);
```

#### cURL 示例

```bash
# 1. 提交任务
TASK_ID=$(curl -s -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/charts/generate \
  -d '{
    "type": "png",
    "width": 600,
    "height": 400,
    "option": {
      "backgroundColor": "#fff",
      "xAxis": {
        "type": "category",
        "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      },
      "yAxis": {
        "type": "value"
      },
      "series": [{
        "data": [820, 932, 901, 934, 1290, 1330, 1720],
        "type": "line"
      }]
    }
  }' | jq -r '.data.taskId')

echo "任务ID: $TASK_ID"

# 2. 查询任务状态
curl -s http://localhost:3000/api/charts/status/$TASK_ID | jq '.'
```

### 同步 API 示例（兼容模式）

```bash
# 直接获取图片（同步模式）
curl -H "Content-Type: application/json" \
  -X POST http://localhost:3000/ \
  -o chart.png \
  -d '{
    "type": "png",
    "width": 600,
    "height": 400,
    "async": false,
    "option": {
      "backgroundColor": "#fff",
      "xAxis": {
        "type": "category",
        "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      },
      "yAxis": {
        "type": "value"
      },
      "series": [{
        "data": [820, 932, 901, 934, 1290, 1330, 1720],
        "type": "line"
      }]
    }
  }'
```

### Java 客户端示例

使用 [ECharts Java](https://github.com/ECharts-Java/ECharts-Java) 生成图表配置：

```java
import com.github.abel533.echarts.Bar;
import com.github.abel533.echarts.Engine;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import com.fasterxml.jackson.databind.ObjectMapper;

public class EChartsExportClient {
    private static final String SERVER_URL = "http://localhost:3000";
    private static final HttpClient client = HttpClient.newHttpClient();
    private static final ObjectMapper mapper = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        // 1. 创建图表配置
        Bar bar = new Bar()
            .setLegend()
            .setTooltip("item")
            .addXAxis(new String[] { "Matcha Latte", "Milk Tea", "Cheese Cocoa", "Walnut Brownie" })
            .addYAxis()
            .addSeries("2015", new Number[] { 43.3, 83.1, 86.4, 72.4 })
            .addSeries("2016", new Number[] { 85.8, 73.4, 65.2, 53.9 })
            .addSeries("2017", new Number[] { 93.7, 55.1, 82.5, 39.1 });

        Engine engine = new Engine();
        String optionJson = engine.renderJsonOption(bar);

        // 2. 提交异步任务
        String taskId = submitTask(optionJson);
        System.out.println("任务已提交: " + taskId);

        // 3. 轮询任务状态
        String imageUrl = waitForCompletion(taskId);
        System.out.println("图片生成完成: " + imageUrl);
    }

    private static String submitTask(String optionJson) throws Exception {
        String requestBody = String.format("""
            {
                "type": "png",
                "width": 800,
                "height": 600,
                "option": %s
            }
            """, optionJson);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(SERVER_URL + "/api/charts/generate"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        // 解析响应获取 taskId
        // ... 省略 JSON 解析代码
        return taskId;
    }

    private static String waitForCompletion(String taskId) throws Exception {
        while (true) {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(SERVER_URL + "/api/charts/status/" + taskId))
                .GET()
                .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            // 解析响应检查状态
            // ... 省略状态检查逻辑
            
            Thread.sleep(1000); // 等待1秒后重试
        }
    }
}
```

## 🔍 故障排除

### 常见问题

1. **服务启动失败**
   ```bash
   npm run validate-config  # 检查配置
   npm run logs             # 查看错误日志
   ```

2. **OSS 上传失败**
   - 检查 OSS 配置是否正确
   - 验证网络连接和权限设置
   - 查看错误日志获取详细信息

3. **任务处理缓慢**
   - 调整 `QUEUE_MAX_CONCURRENT` 参数
   - 检查服务器资源使用情况
   - 考虑增加服务器配置

4. **中文字体显示异常**
   ```bash
   # Linux 系统安装中文字体
   mkdir -p /usr/share/fonts/truetype
   cp msyh.ttf /usr/share/fonts/truetype/
   fc-cache -fv
   ```

### 日志分析

```bash
# 查看实时日志
npm run logs

# 查看错误日志
tail -f logs/error.log

# 查看完整日志
tail -f logs/combined.log
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发环境设置

```bash
git clone https://github.com/xiaomaigou/echarts-export-server
cd echarts-export-server
npm install
npm run setup
npm run dev
```

### 运行测试

```bash
npm test                # 运行所有测试
npm run test:watch      # 监视模式运行测试
```

## 📄 许可证

[Apache License 2.0](LICENSE)

## 🔗 相关链接

- [Apache ECharts](https://echarts.apache.org/) - 图表库
- [Node Canvas](https://github.com/Automattic/node-canvas) - 服务端渲染
- [阿里云 OSS](https://www.aliyun.com/product/oss) - 对象存储服务
- [PM2](https://pm2.keymetrics.io/) - 进程管理器
- [ECharts Java](https://github.com/ECharts-Java/ECharts-Java) - Java 客户端

## 📞 支持

如果您在使用过程中遇到问题，可以通过以下方式获取帮助：

1. 查看 [FAQ 文档](docs/FAQ.md)
2. 提交 [GitHub Issue](https://github.com/xiaomaigou/echarts-export-server/issues)
3. 查看项目 [Wiki](https://github.com/xiaomaigou/echarts-export-server/wiki)

---

⭐ 如果这个项目对您有帮助，请给我们一个 Star！

