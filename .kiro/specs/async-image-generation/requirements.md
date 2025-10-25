# 需求文档

## 介绍

扩展现有的ECharts导出服务器，从同步图片生成模式改为异步图片生成模式，并将生成的图片存储到阿里云OSS（对象存储服务）上，提供更好的性能和可扩展性。

## 术语表

- **ECharts_Export_Server**: 当前的ECharts图表导出服务器
- **OSS_Client**: 阿里云对象存储服务客户端
- **Task_Queue**: 图片生成任务队列系统
- **Image_Generator**: 图片生成处理器
- **Task_ID**: 唯一的任务标识符
- **Image_URL**: 存储在OSS上的图片访问地址

## 需求

### 需求 1

**用户故事:** 作为API调用者，我希望提交图片生成请求后立即获得任务ID，这样我就不需要等待图片生成完成。

#### 验收标准

1. WHEN 用户提交图片生成请求时，THE ECharts_Export_Server SHALL 立即返回包含Task_ID的响应
2. THE ECharts_Export_Server SHALL 在3秒内响应图片生成请求
3. THE Task_ID SHALL 是全局唯一的标识符
4. THE ECharts_Export_Server SHALL 将任务信息存储到Task_Queue中
5. THE 响应 SHALL 包含任务状态查询的API端点信息

### 需求 2

**用户故事:** 作为API调用者，我希望能够查询任务状态，这样我就能知道图片是否已经生成完成。

#### 验收标准

1. WHEN 用户使用Task_ID查询任务状态时，THE ECharts_Export_Server SHALL 返回当前任务状态
2. THE 任务状态 SHALL 包含以下值之一：pending（等待中）、processing（处理中）、completed（已完成）、failed（失败）
3. WHILE 任务状态为completed时，THE ECharts_Export_Server SHALL 返回OSS上的Image_URL
4. IF 任务状态为failed时，THEN THE ECharts_Export_Server SHALL 返回错误信息
5. THE ECharts_Export_Server SHALL 在1秒内响应状态查询请求

### 需求 3

**用户故事:** 作为系统管理员，我希望图片能够自动上传到OSS，这样我就能提供稳定的图片访问服务。

#### 验收标准

1. WHEN Image_Generator完成图片生成时，THE ECharts_Export_Server SHALL 自动将图片上传到OSS_Client
2. THE ECharts_Export_Server SHALL 使用唯一的文件名存储图片到OSS
3. THE ECharts_Export_Server SHALL 支持PNG和JPEG格式的图片上传
4. WHILE 图片上传过程中，THE 任务状态 SHALL 保持为processing
5. THE ECharts_Export_Server SHALL 在上传完成后更新任务状态为completed

### 需求 4

**用户故事:** 作为系统管理员，我希望系统能够处理并发请求，这样我就能支持多个用户同时使用服务。

#### 验收标准

1. THE ECharts_Export_Server SHALL 支持同时处理至少10个图片生成任务
2. THE Task_Queue SHALL 按照先进先出（FIFO）的顺序处理任务
3. WHEN 系统负载过高时，THE ECharts_Export_Server SHALL 将新任务加入队列等待处理
4. THE ECharts_Export_Server SHALL 提供队列状态查询接口
5. IF 任务在队列中等待超过5分钟时，THEN THE ECharts_Export_Server SHALL 将任务状态标记为failed

### 需求 5

**用户故事:** 作为API调用者，我希望能够配置OSS存储参数，这样我就能将图片存储到指定的OSS bucket中。

#### 验收标准

1. THE ECharts_Export_Server SHALL 支持通过环境变量配置OSS访问密钥
2. THE ECharts_Export_Server SHALL 支持通过环境变量配置OSS bucket名称和区域
3. THE ECharts_Export_Server SHALL 支持自定义OSS文件路径前缀
4. WHERE 配置了自定义域名时，THE ECharts_Export_Server SHALL 使用自定义域名生成Image_URL
5. THE ECharts_Export_Server SHALL 在启动时验证OSS连接配置

### 需求 6

**用户故事:** 作为系统管理员，我希望系统能够自动清理过期的任务和图片，这样我就能控制存储成本。

#### 验收标准

1. THE ECharts_Export_Server SHALL 支持配置任务记录的保留时间
2. THE ECharts_Export_Server SHALL 每天自动清理超过保留时间的任务记录
3. WHERE 配置了图片自动清理时，THE ECharts_Export_Server SHALL 同时删除OSS上的对应图片文件
4. THE ECharts_Export_Server SHALL 记录清理操作的日志
5. THE 默认任务保留时间 SHALL 为7天