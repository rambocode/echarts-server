# API 文档

## 概述

ECharts Export Server 提供 RESTful API 接口，支持异步和同步两种模式的图表生成。

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **字符编码**: UTF-8

## 异步 API

### 1. 创建图片生成任务

创建一个异步图片生成任务。

**请求**
```http
POST /api/charts/generate
Content-Type: application/json
```

**请求参数**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | string | 否 | 图片格式：png, jpeg, svg, pdf（默认：png） |
| width | number | 否 | 图片宽度（默认：600） |
| height | number | 否 | 图片高度（默认：400） |
| option | object | 是 | ECharts 配置对象 |
| ossPath | string | 否 | OSS 存储路径前缀 |

**请求示例**
```json
{
  "type": "png",
  "width": 800,
  "height": 600,
  "option": {
    "backgroundColor": "#fff",
    "animation": false,
    "xAxis": {
      "type": "category",
      "data": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    "yAxis": {
      "type": "value"
    },
    "series": [{
      "data": [820, 932, 901, 934, 1290, 1330, 1720],
      "type": "line",
      "label": {
        "show": true
      }
    }]
  },
  "ossPath": "charts/2024/01/"
}
```

**响应**
```json
{
  "code": 200,
  "msg": "Task created successfully",
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "statusUrl": "/api/charts/status/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 2. 查询任务状态

根据任务ID查询任务处理状态。

**请求**
```http
GET /api/charts/status/{taskId}
```

**路径参数**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**响应**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "imageUrl": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/charts/2024/01/550e8400-e29b-41d4-a716-446655440000.png",
    "createdAt": "2024-01-01T10:00:00.000Z",
    "startedAt": "2024-01-01T10:00:01.000Z",
    "completedAt": "2024-01-01T10:00:05.000Z",
    "error": null
  }
}
```

**任务状态说明**
- `pending`: 任务已创建，等待处理
- `processing`: 任务正在处理中
- `completed`: 任务已完成，图片生成成功
- `failed`: 任务处理失败

### 3. 查询系统状态

获取队列系统的当前状态信息。

**请求**
```http
GET /api/system/queue-status
```

**响应**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "pendingTasks": 5,
    "processingTasks": 2,
    "totalProcessed": 1000,
    "averageProcessingTime": 2.5,
    "queueLength": 7,
    "maxConcurrent": 10
  }
}
```

## 同步 API（兼容模式）

### 直接生成图片

兼容原有同步 API，直接返回图片数据。

**请求**
```http
POST /
Content-Type: application/json
```

**请求参数**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | string | 否 | 图片格式（默认：png） |
| width | number | 否 | 图片宽度（默认：600） |
| height | number | 否 | 图片高度（默认：400） |
| base64 | boolean | 否 | 是否返回 Base64 格式（默认：false） |
| download | boolean | 否 | 是否添加下载头（默认：false） |
| async | boolean | 否 | 是否使用异步模式（默认：true） |
| option | object | 是 | ECharts 配置对象 |

**请求示例**
```json
{
  "type": "png",
  "width": 600,
  "height": 400,
  "base64": false,
  "download": false,
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
}
```

**响应**
- 如果 `base64: false`：直接返回图片二进制数据
- 如果 `base64: true`：返回 JSON 格式的 Base64 数据

```json
{
  "code": 200,
  "msg": "success",
  "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA..."
}
```

## 错误处理

### 错误响应格式

```json
{
  "code": 400,
  "msg": "Invalid request parameters",
  "data": null,
  "error": {
    "type": "VALIDATION_ERROR",
    "details": "Missing required parameter: option"
  }
}
```

### 常见错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 404 | 任务不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（队列满载） |

### 错误类型

- `VALIDATION_ERROR`: 参数验证错误
- `PROCESSING_ERROR`: 图片处理错误
- `OSS_ERROR`: OSS 上传错误
- `SYSTEM_ERROR`: 系统错误

## 限制说明

1. **请求大小**: 最大 1MB
2. **并发限制**: 默认最大 10 个并发任务
3. **超时时间**: 单个任务最大处理时间 5 分钟
4. **图片尺寸**: 建议不超过 4096x4096 像素
5. **任务保留**: 默认保留 7 天

## 最佳实践

1. **异步处理**: 推荐使用异步 API 以获得更好的性能
2. **轮询间隔**: 建议 1-2 秒轮询一次任务状态
3. **错误重试**: 实现指数退避重试机制
4. **资源清理**: 及时处理完成的任务，避免资源浪费
5. **监控告警**: 监控队列长度和处理时间，设置合理告警