# 迁移指南

本文档帮助您从旧版本的同步 ECharts Export Server 迁移到新的异步版本。

## 🔄 版本对比

| 特性 | 旧版本 (同步) | 新版本 (异步) |
|------|---------------|---------------|
| 处理模式 | 同步阻塞 | 异步队列 |
| 并发能力 | 有限 | 高并发 |
| 存储方式 | 本地临时文件 | OSS云存储 + 本地 |
| API 接口 | 单一同步接口 | 异步 + 兼容同步 |
| 任务管理 | 无 | 完整的任务生命周期 |
| 监控支持 | 基础日志 | 完整监控体系 |
| 错误处理 | 简单 | 完善的重试机制 |

## 🚀 迁移策略

### 策略 1: 渐进式迁移（推荐）

保持现有代码不变，逐步迁移到异步 API。

#### 阶段 1: 部署新版本
1. 部署新版本服务器
2. 现有客户端代码无需修改
3. 验证功能正常

#### 阶段 2: 逐步迁移
1. 新功能使用异步 API
2. 旧功能保持同步 API
3. 监控性能改善

#### 阶段 3: 完全迁移
1. 所有客户端迁移到异步 API
2. 关闭同步 API（可选）

### 策略 2: 一次性迁移

适合小型项目或新项目。

## 📋 迁移检查清单

### 部署前准备

- [ ] 备份现有配置和数据
- [ ] 准备 OSS 配置（可选）
- [ ] 测试环境验证
- [ ] 性能基准测试

### 部署步骤

- [ ] 停止旧版本服务
- [ ] 部署新版本代码
- [ ] 运行配置向导：`npm run setup`
- [ ] 验证配置：`npm run validate-config`
- [ ] 启动新服务：`npm start`
- [ ] 健康检查：`npm run health-check`

### 部署后验证

- [ ] 同步 API 兼容性测试
- [ ] 异步 API 功能测试
- [ ] 性能对比测试
- [ ] 监控指标检查

## 🔧 配置迁移

### 旧版本配置
```javascript
// 旧版本只有基本配置
const config = {
  port: 3000,
  // 其他配置较少
};
```

### 新版本配置
```bash
# .env 文件
PORT=3000
NODE_ENV=production

# OSS 配置（新增）
OSS_ACCESS_KEY_ID=your_key_id
OSS_ACCESS_KEY_SECRET=your_key_secret
OSS_BUCKET=your_bucket

# 队列配置（新增）
QUEUE_MAX_CONCURRENT=10
QUEUE_TASK_TIMEOUT=300
TASK_RETENTION_DAYS=7
```

### 配置映射

| 旧配置项 | 新配置项 | 说明 |
|----------|----------|------|
| `port` | `PORT` | 服务器端口 |
| 无 | `OSS_*` | OSS 存储配置 |
| 无 | `QUEUE_*` | 队列系统配置 |
| 无 | `TASK_RETENTION_DAYS` | 任务保留配置 |

## 📡 API 迁移

### 同步 API（保持兼容）

**旧版本请求**:
```javascript
const response = await fetch('http://localhost:3000/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'png',
    width: 600,
    height: 400,
    option: chartOption
  })
});

// 直接获取图片数据
const imageBlob = await response.blob();
```

**新版本兼容**:
```javascript
// 完全相同的代码，无需修改
const response = await fetch('http://localhost:3000/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'png',
    width: 600,
    height: 400,
    async: false,  // 可选：显式指定同步模式
    option: chartOption
  })
});

const imageBlob = await response.blob();
```

### 异步 API（推荐迁移）

**新的异步实现**:
```javascript
// 1. 提交任务
const taskResponse = await fetch('http://localhost:3000/api/charts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'png',
    width: 600,
    height: 400,
    option: chartOption
  })
});

const { taskId } = (await taskResponse.json()).data;

// 2. 轮询状态
const pollStatus = async () => {
  const statusResponse = await fetch(`http://localhost:3000/api/charts/status/${taskId}`);
  const { status, imageUrl } = (await statusResponse.json()).data;
  
  if (status === 'completed') {
    return imageUrl;
  } else if (status === 'failed') {
    throw new Error('Task failed');
  } else {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return pollStatus();
  }
};

const imageUrl = await pollStatus();
```

## 🛠️ 客户端代码迁移

### JavaScript/Node.js 客户端

#### 封装兼容层
```javascript
class EChartsClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  // 同步模式（兼容旧版本）
  async generateSync(config) {
    const response = await fetch(`${this.baseUrl}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, async: false })
    });
    return response.blob();
  }

  // 异步模式（推荐）
  async generateAsync(config) {
    // 1. 提交任务
    const taskResponse = await fetch(`${this.baseUrl}/api/charts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const { taskId } = (await taskResponse.json()).data;

    // 2. 等待完成
    return this.waitForCompletion(taskId);
  }

  async waitForCompletion(taskId, maxWait = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const statusResponse = await fetch(`${this.baseUrl}/api/charts/status/${taskId}`);
      const { status, imageUrl, error } = (await statusResponse.json()).data;
      
      if (status === 'completed') {
        return imageUrl;
      } else if (status === 'failed') {
        throw new Error(error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Task timeout');
  }
}

// 使用示例
const client = new EChartsClient('http://localhost:3000');

// 兼容旧代码
const imageBlob = await client.generateSync(config);

// 新的异步方式
const imageUrl = await client.generateAsync(config);
```

### Java 客户端

#### 兼容层实现
```java
public class EChartsClient {
    private final String baseUrl;
    private final HttpClient httpClient;
    
    public EChartsClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newHttpClient();
    }
    
    // 同步模式（兼容）
    public byte[] generateSync(ChartConfig config) throws Exception {
        String requestBody = buildSyncRequest(config);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build();
            
        HttpResponse<byte[]> response = httpClient.send(request, 
            HttpResponse.BodyHandlers.ofByteArray());
            
        return response.body();
    }
    
    // 异步模式（推荐）
    public String generateAsync(ChartConfig config) throws Exception {
        // 1. 提交任务
        String taskId = submitTask(config);
        
        // 2. 等待完成
        return waitForCompletion(taskId);
    }
    
    private String submitTask(ChartConfig config) throws Exception {
        String requestBody = buildAsyncRequest(config);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/charts/generate"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody))
            .build();
            
        HttpResponse<String> response = httpClient.send(request, 
            HttpResponse.BodyHandlers.ofString());
            
        // 解析响应获取 taskId
        return parseTaskId(response.body());
    }
    
    private String waitForCompletion(String taskId) throws Exception {
        int maxAttempts = 60;
        
        for (int i = 0; i < maxAttempts; i++) {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/charts/status/" + taskId))
                .GET()
                .build();
                
            HttpResponse<String> response = httpClient.send(request, 
                HttpResponse.BodyHandlers.ofString());
                
            TaskStatus status = parseTaskStatus(response.body());
            
            if ("completed".equals(status.getStatus())) {
                return status.getImageUrl();
            } else if ("failed".equals(status.getStatus())) {
                throw new RuntimeException("Task failed: " + status.getError());
            }
            
            Thread.sleep(1000);
        }
        
        throw new RuntimeException("Task timeout");
    }
}
```

## 🔍 测试和验证

### 功能测试脚本

```bash
#!/bin/bash
# test-migration.sh

BASE_URL="http://localhost:3000"

echo "测试同步 API 兼容性..."
curl -X POST $BASE_URL/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "png",
    "width": 600,
    "height": 400,
    "async": false,
    "option": {
      "xAxis": {"type": "category", "data": ["A", "B", "C"]},
      "yAxis": {"type": "value"},
      "series": [{"data": [1, 2, 3], "type": "line"}]
    }
  }' \
  -o test-sync.png

echo "测试异步 API..."
TASK_ID=$(curl -s -X POST $BASE_URL/api/charts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "png",
    "width": 600,
    "height": 400,
    "option": {
      "xAxis": {"type": "category", "data": ["A", "B", "C"]},
      "yAxis": {"type": "value"},
      "series": [{"data": [1, 2, 3], "type": "line"}]
    }
  }' | jq -r '.data.taskId')

echo "任务ID: $TASK_ID"

# 轮询任务状态
while true; do
  STATUS=$(curl -s $BASE_URL/api/charts/status/$TASK_ID | jq -r '.data.status')
  echo "任务状态: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    IMAGE_URL=$(curl -s $BASE_URL/api/charts/status/$TASK_ID | jq -r '.data.imageUrl')
    echo "图片URL: $IMAGE_URL"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "任务失败"
    break
  fi
  
  sleep 1
done
```

### 性能对比测试

```javascript
// performance-test.js
const axios = require('axios');

async function testSync() {
  const start = Date.now();
  
  const promises = Array(10).fill().map(() => 
    axios.post('http://localhost:3000/', {
      type: 'png',
      width: 600,
      height: 400,
      async: false,
      option: { /* chart config */ }
    })
  );
  
  await Promise.all(promises);
  
  console.log(`同步模式: ${Date.now() - start}ms`);
}

async function testAsync() {
  const start = Date.now();
  
  // 提交所有任务
  const taskPromises = Array(10).fill().map(() => 
    axios.post('http://localhost:3000/api/charts/generate', {
      type: 'png',
      width: 600,
      height: 400,
      option: { /* chart config */ }
    })
  );
  
  const tasks = await Promise.all(taskPromises);
  const taskIds = tasks.map(t => t.data.data.taskId);
  
  // 等待所有任务完成
  const statusPromises = taskIds.map(waitForCompletion);
  await Promise.all(statusPromises);
  
  console.log(`异步模式: ${Date.now() - start}ms`);
}

async function waitForCompletion(taskId) {
  while (true) {
    const response = await axios.get(`http://localhost:3000/api/charts/status/${taskId}`);
    const { status } = response.data.data;
    
    if (status === 'completed' || status === 'failed') {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 运行测试
testSync().then(() => testAsync());
```

## 🚨 注意事项

### 兼容性说明

1. **API 兼容性**: 新版本完全兼容旧版本 API
2. **响应格式**: 同步 API 响应格式保持不变
3. **错误处理**: 错误响应格式保持兼容
4. **配置参数**: 所有旧参数继续支持

### 性能影响

1. **内存使用**: 异步模式可能使用更多内存
2. **并发能力**: 显著提升并发处理能力
3. **响应时间**: 异步模式响应更快
4. **资源利用**: 更好的 CPU 和 I/O 利用率

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 配置错误 | 服务启动失败 | 使用配置验证工具 |
| OSS 连接问题 | 图片上传失败 | 提供本地存储降级 |
| 内存使用增加 | 系统资源不足 | 监控和调优 |
| 客户端兼容性 | 功能异常 | 充分测试验证 |

## 📞 获取帮助

如果在迁移过程中遇到问题：

1. **查看日志**: `npm run logs`
2. **运行诊断**: `npm run health-check`
3. **验证配置**: `npm run validate-config`
4. **提交 Issue**: [GitHub Issues](https://github.com/xiaomaigou/echarts-export-server/issues)

---

💡 **建议**: 在生产环境迁移前，请在测试环境充分验证所有功能。