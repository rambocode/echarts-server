# 设计文档

## 概述

将现有的同步ECharts导出服务器重构为异步架构，引入任务队列系统和OSS存储集成。新架构将提供更好的并发处理能力和可扩展性，同时保持向后兼容性。

## 架构

### 整体架构图

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTTP Client   │───▶│  Express Server  │───▶│   Task Queue    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Status Storage  │    │ Image Generator │
                       └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │   OSS Client    │
                                                └─────────────────┘
```

### 核心组件

1. **Express Server**: 替换原生HTTP服务器，提供RESTful API
2. **Task Queue**: 基于内存的任务队列（可扩展为Redis）
3. **Image Generator**: 异步图片生成工作器
4. **OSS Client**: 阿里云OSS SDK集成
5. **Status Storage**: 任务状态存储（内存/Redis）

## 组件和接口

### API 端点

#### 1. 提交图片生成任务
```
POST /api/charts/generate
Content-Type: application/json

Request Body:
{
  "type": "png",
  "width": 600,
  "height": 400,
  "option": { ... },
  "ossPath": "charts/2024/01/"  // 可选的OSS路径前缀
}

Response:
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
```
GET /api/charts/status/{taskId}

Response:
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "uuid-v4-string",
    "status": "completed|pending|processing|failed",
    "imageUrl": "https://your-bucket.oss-region.aliyuncs.com/path/to/image.png",
    "createdAt": "2024-01-01T00:00:00Z",
    "completedAt": "2024-01-01T00:00:05Z",
    "error": "error message if failed"
  }
}
```

#### 3. 查询队列状态
```
GET /api/system/queue-status

Response:
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

### 核心类设计

#### TaskManager
```javascript
class TaskManager {
  constructor(ossClient, imageGenerator) {}
  
  async createTask(config) {}
  async getTaskStatus(taskId) {}
  async processNextTask() {}
  async cleanupExpiredTasks() {}
}
```

#### ImageGenerator
```javascript
class ImageGenerator {
  async generateImage(config) {}
  async uploadToOSS(imageBuffer, fileName) {}
}
```

#### OSSClient
```javascript
class OSSClient {
  constructor(config) {}
  
  async uploadFile(buffer, fileName, contentType) {}
  async deleteFile(fileName) {}
  generatePublicUrl(fileName) {}
}
```

## 数据模型

### Task 对象
```javascript
{
  taskId: String,           // UUID v4
  status: String,           // pending|processing|completed|failed
  config: Object,           // 原始图表配置
  imageUrl: String,         // OSS图片URL
  fileName: String,         // OSS文件名
  createdAt: Date,
  startedAt: Date,
  completedAt: Date,
  error: String,
  retryCount: Number
}
```

### 配置对象
```javascript
{
  oss: {
    accessKeyId: String,
    accessKeySecret: String,
    bucket: String,
    region: String,
    customDomain: String,    // 可选
    pathPrefix: String       // 可选
  },
  queue: {
    maxConcurrent: Number,   // 默认10
    taskTimeout: Number,     // 默认300秒
    retryAttempts: Number,   // 默认3
    cleanupInterval: Number  // 默认24小时
  },
  storage: {
    taskRetentionDays: Number // 默认7天
  }
}
```

## 错误处理

### 错误类型和处理策略

1. **配置错误**: 启动时验证OSS配置，失败则拒绝启动
2. **任务超时**: 超过5分钟的任务自动标记为失败
3. **OSS上传失败**: 重试3次，仍失败则标记任务失败
4. **图片生成失败**: 记录错误信息，标记任务失败
5. **队列满载**: 返回503状态码，建议客户端稍后重试

### 错误响应格式
```javascript
{
  "code": 400|500|503,
  "msg": "Error description",
  "data": null,
  "error": {
    "type": "VALIDATION_ERROR|PROCESSING_ERROR|SYSTEM_ERROR",
    "details": "Detailed error information"
  }
}
```

## 测试策略

### 单元测试
- TaskManager的任务创建和状态管理
- ImageGenerator的图片生成逻辑
- OSSClient的上传和删除操作
- 配置验证逻辑

### 集成测试
- 完整的异步任务流程
- OSS集成测试（使用测试bucket）
- 并发任务处理测试
- 错误恢复测试

### 性能测试
- 并发任务处理能力
- 内存使用情况
- OSS上传性能
- 队列处理效率

## 部署和配置

### 环境变量
```bash
# OSS配置
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_secret_key
OSS_BUCKET=your_bucket_name
OSS_REGION=oss-cn-hangzhou
OSS_CUSTOM_DOMAIN=your_custom_domain  # 可选
OSS_PATH_PREFIX=charts/               # 可选

# 队列配置
QUEUE_MAX_CONCURRENT=10
QUEUE_TASK_TIMEOUT=300
QUEUE_RETRY_ATTEMPTS=3

# 存储配置
TASK_RETENTION_DAYS=7
CLEANUP_INTERVAL_HOURS=24

# 服务器配置
PORT=3000
NODE_ENV=production
```

### 向后兼容性

保留原有的同步API端点作为兼容模式：
- 原有的POST请求如果包含`async=false`参数，则使用同步模式
- 默认情况下，所有请求都使用新的异步模式
- 提供迁移指南帮助现有用户升级

### 监控和日志

- 使用Winston进行结构化日志记录
- 记录任务创建、处理、完成的关键事件
- 提供Prometheus metrics端点用于监控
- 记录OSS操作的成功率和延迟