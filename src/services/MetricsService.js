/**
 * 性能监控服务
 * 收集和管理系统性能指标，提供Prometheus格式输出
 */

const logger = require('../utils/logger');

class MetricsService {
  constructor() {
    // 基础指标
    this.metrics = {
      // 任务相关指标
      tasks: {
        created: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        timeout: 0
      },
      
      // 处理时间指标
      processingTimes: {
        samples: [],
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      
      // 队列指标
      queue: {
        maxPending: 0,
        maxProcessing: 0,
        currentPending: 0,
        currentProcessing: 0
      },
      
      // OSS操作指标
      oss: {
        uploads: 0,
        uploadFailures: 0,
        deletes: 0,
        deleteFailures: 0,
        uploadSizes: [],
        uploadTimes: []
      },
      
      // 系统资源指标
      system: {
        startTime: Date.now(),
        lastUpdate: Date.now(),
        memoryPeakUsage: 0,
        cpuUsage: 0
      },
      
      // HTTP请求指标
      http: {
        requests: 0,
        responses: {
          '2xx': 0,
          '4xx': 0,
          '5xx': 0
        },
        responseTimes: []
      }
    };
    
    // 启动系统监控
    this.startSystemMonitoring();
    
    logger.info('MetricsService initialized');
  }

  /**
   * 记录任务创建
   * @param {string} taskId - 任务ID
   * @param {object} config - 任务配置
   */
  recordTaskCreated(taskId, config) {
    this.metrics.tasks.created++;
    
    logger.debug('Task creation recorded', {
      taskId,
      totalCreated: this.metrics.tasks.created
    });
  }

  /**
   * 记录任务完成
   * @param {string} taskId - 任务ID
   * @param {number} processingTime - 处理时间（毫秒）
   * @param {string} imageUrl - 图片URL
   */
  recordTaskCompleted(taskId, processingTime, imageUrl) {
    this.metrics.tasks.completed++;
    
    // 记录处理时间
    if (processingTime && processingTime > 0) {
      this.addProcessingTime(processingTime);
    }
    
    logger.debug('Task completion recorded', {
      taskId,
      processingTime,
      totalCompleted: this.metrics.tasks.completed
    });
  }

  /**
   * 记录任务失败
   * @param {string} taskId - 任务ID
   * @param {string} error - 错误信息
   * @param {boolean} isTimeout - 是否为超时失败
   */
  recordTaskFailed(taskId, error, isTimeout = false) {
    this.metrics.tasks.failed++;
    
    if (isTimeout) {
      this.metrics.tasks.timeout++;
    }
    
    logger.debug('Task failure recorded', {
      taskId,
      error,
      isTimeout,
      totalFailed: this.metrics.tasks.failed
    });
  }

  /**
   * 记录任务重试
   * @param {string} taskId - 任务ID
   * @param {number} retryCount - 重试次数
   */
  recordTaskRetry(taskId, retryCount) {
    this.metrics.tasks.retried++;
    
    logger.debug('Task retry recorded', {
      taskId,
      retryCount,
      totalRetried: this.metrics.tasks.retried
    });
  }

  /**
   * 更新队列状态
   * @param {number} pendingTasks - 等待任务数
   * @param {number} processingTasks - 处理中任务数
   */
  updateQueueStatus(pendingTasks, processingTasks) {
    this.metrics.queue.currentPending = pendingTasks;
    this.metrics.queue.currentProcessing = processingTasks;
    
    // 更新峰值
    if (pendingTasks > this.metrics.queue.maxPending) {
      this.metrics.queue.maxPending = pendingTasks;
    }
    
    if (processingTasks > this.metrics.queue.maxProcessing) {
      this.metrics.queue.maxProcessing = processingTasks;
    }
  }

  /**
   * 记录OSS上传操作
   * @param {string} fileName - 文件名
   * @param {number} fileSize - 文件大小（字节）
   * @param {number} uploadTime - 上传时间（毫秒）
   * @param {boolean} success - 是否成功
   */
  recordOSSUpload(fileName, fileSize, uploadTime, success = true) {
    if (success) {
      this.metrics.oss.uploads++;
      
      // 记录文件大小和上传时间
      this.addOSSUploadSize(fileSize);
      this.addOSSUploadTime(uploadTime);
    } else {
      this.metrics.oss.uploadFailures++;
    }
    
    logger.debug('OSS upload recorded', {
      fileName,
      fileSize,
      uploadTime,
      success
    });
  }

  /**
   * 记录OSS删除操作
   * @param {string} fileName - 文件名
   * @param {boolean} success - 是否成功
   */
  recordOSSDelete(fileName, success = true) {
    if (success) {
      this.metrics.oss.deletes++;
    } else {
      this.metrics.oss.deleteFailures++;
    }
    
    logger.debug('OSS delete recorded', {
      fileName,
      success
    });
  }

  /**
   * 记录HTTP请求
   * @param {string} method - HTTP方法
   * @param {string} path - 请求路径
   * @param {number} statusCode - 响应状态码
   * @param {number} responseTime - 响应时间（毫秒）
   */
  recordHTTPRequest(method, path, statusCode, responseTime) {
    this.metrics.http.requests++;
    
    // 按状态码分类
    if (statusCode >= 200 && statusCode < 300) {
      this.metrics.http.responses['2xx']++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.metrics.http.responses['4xx']++;
    } else if (statusCode >= 500) {
      this.metrics.http.responses['5xx']++;
    }
    
    // 记录响应时间
    this.addResponseTime(responseTime);
    
    logger.debug('HTTP request recorded', {
      method,
      path,
      statusCode,
      responseTime
    });
  }

  /**
   * 添加处理时间样本
   * @param {number} time - 处理时间（毫秒）
   */
  addProcessingTime(time) {
    this.metrics.processingTimes.samples.push(time);
    
    // 保持最近1000个样本
    if (this.metrics.processingTimes.samples.length > 1000) {
      this.metrics.processingTimes.samples.shift();
    }
    
    // 更新统计值
    this.updateProcessingTimeStats();
  }

  /**
   * 添加OSS上传大小样本
   * @param {number} size - 文件大小（字节）
   */
  addOSSUploadSize(size) {
    this.metrics.oss.uploadSizes.push(size);
    
    // 保持最近500个样本
    if (this.metrics.oss.uploadSizes.length > 500) {
      this.metrics.oss.uploadSizes.shift();
    }
  }

  /**
   * 添加OSS上传时间样本
   * @param {number} time - 上传时间（毫秒）
   */
  addOSSUploadTime(time) {
    this.metrics.oss.uploadTimes.push(time);
    
    // 保持最近500个样本
    if (this.metrics.oss.uploadTimes.length > 500) {
      this.metrics.oss.uploadTimes.shift();
    }
  }

  /**
   * 添加HTTP响应时间样本
   * @param {number} time - 响应时间（毫秒）
   */
  addResponseTime(time) {
    this.metrics.http.responseTimes.push(time);
    
    // 保持最近1000个样本
    if (this.metrics.http.responseTimes.length > 1000) {
      this.metrics.http.responseTimes.shift();
    }
  }

  /**
   * 更新处理时间统计
   */
  updateProcessingTimeStats() {
    const samples = this.metrics.processingTimes.samples;
    if (samples.length === 0) return;
    
    const sorted = [...samples].sort((a, b) => a - b);
    
    this.metrics.processingTimes.min = sorted[0];
    this.metrics.processingTimes.max = sorted[sorted.length - 1];
    this.metrics.processingTimes.avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // 计算百分位数
    this.metrics.processingTimes.p50 = this.getPercentile(sorted, 0.5);
    this.metrics.processingTimes.p95 = this.getPercentile(sorted, 0.95);
    this.metrics.processingTimes.p99 = this.getPercentile(sorted, 0.99);
  }

  /**
   * 计算百分位数
   * @param {Array<number>} sortedArray - 已排序的数组
   * @param {number} percentile - 百分位数（0-1）
   * @returns {number}
   */
  getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * 启动系统监控
   */
  startSystemMonitoring() {
    // 每30秒更新一次系统指标
    this.systemMonitorInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);
    
    // 初始更新
    this.updateSystemMetrics();
  }

  /**
   * 更新系统指标
   */
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    // 更新内存峰值使用量
    if (memUsage.heapUsed > this.metrics.system.memoryPeakUsage) {
      this.metrics.system.memoryPeakUsage = memUsage.heapUsed;
    }
    
    // 更新CPU使用率（简单估算）
    const cpuUsage = process.cpuUsage();
    this.metrics.system.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // 转换为秒
    
    this.metrics.system.lastUpdate = Date.now();
  }

  /**
   * 获取所有指标
   * @returns {object}
   */
  getAllMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      uptime: Date.now() - this.metrics.system.startTime
    };
  }

  /**
   * 生成Prometheus格式的指标
   * @returns {string}
   */
  generatePrometheusMetrics() {
    const metrics = [];
    const timestamp = Date.now();
    
    // 任务指标
    metrics.push(
      '# HELP echarts_tasks_created_total Total number of tasks created',
      '# TYPE echarts_tasks_created_total counter',
      `echarts_tasks_created_total ${this.metrics.tasks.created}`,
      '',
      '# HELP echarts_tasks_completed_total Total number of tasks completed',
      '# TYPE echarts_tasks_completed_total counter',
      `echarts_tasks_completed_total ${this.metrics.tasks.completed}`,
      '',
      '# HELP echarts_tasks_failed_total Total number of tasks failed',
      '# TYPE echarts_tasks_failed_total counter',
      `echarts_tasks_failed_total ${this.metrics.tasks.failed}`,
      '',
      '# HELP echarts_tasks_retried_total Total number of task retries',
      '# TYPE echarts_tasks_retried_total counter',
      `echarts_tasks_retried_total ${this.metrics.tasks.retried}`,
      '',
      '# HELP echarts_tasks_timeout_total Total number of tasks that timed out',
      '# TYPE echarts_tasks_timeout_total counter',
      `echarts_tasks_timeout_total ${this.metrics.tasks.timeout}`,
      ''
    );
    
    // 处理时间指标
    if (this.metrics.processingTimes.samples.length > 0) {
      metrics.push(
        '# HELP echarts_task_processing_time_seconds Task processing time statistics',
        '# TYPE echarts_task_processing_time_seconds gauge',
        `echarts_task_processing_time_seconds{quantile="0.5"} ${this.metrics.processingTimes.p50 / 1000}`,
        `echarts_task_processing_time_seconds{quantile="0.95"} ${this.metrics.processingTimes.p95 / 1000}`,
        `echarts_task_processing_time_seconds{quantile="0.99"} ${this.metrics.processingTimes.p99 / 1000}`,
        `echarts_task_processing_time_seconds{stat="min"} ${this.metrics.processingTimes.min / 1000}`,
        `echarts_task_processing_time_seconds{stat="max"} ${this.metrics.processingTimes.max / 1000}`,
        `echarts_task_processing_time_seconds{stat="avg"} ${this.metrics.processingTimes.avg / 1000}`,
        ''
      );
    }
    
    // 队列指标
    metrics.push(
      '# HELP echarts_queue_pending_tasks Current number of pending tasks',
      '# TYPE echarts_queue_pending_tasks gauge',
      `echarts_queue_pending_tasks ${this.metrics.queue.currentPending}`,
      '',
      '# HELP echarts_queue_processing_tasks Current number of processing tasks',
      '# TYPE echarts_queue_processing_tasks gauge',
      `echarts_queue_processing_tasks ${this.metrics.queue.currentProcessing}`,
      '',
      '# HELP echarts_queue_max_pending_tasks Maximum number of pending tasks seen',
      '# TYPE echarts_queue_max_pending_tasks gauge',
      `echarts_queue_max_pending_tasks ${this.metrics.queue.maxPending}`,
      '',
      '# HELP echarts_queue_max_processing_tasks Maximum number of processing tasks seen',
      '# TYPE echarts_queue_max_processing_tasks gauge',
      `echarts_queue_max_processing_tasks ${this.metrics.queue.maxProcessing}`,
      ''
    );
    
    // OSS指标
    metrics.push(
      '# HELP echarts_oss_uploads_total Total number of OSS uploads',
      '# TYPE echarts_oss_uploads_total counter',
      `echarts_oss_uploads_total ${this.metrics.oss.uploads}`,
      '',
      '# HELP echarts_oss_upload_failures_total Total number of OSS upload failures',
      '# TYPE echarts_oss_upload_failures_total counter',
      `echarts_oss_upload_failures_total ${this.metrics.oss.uploadFailures}`,
      '',
      '# HELP echarts_oss_deletes_total Total number of OSS deletes',
      '# TYPE echarts_oss_deletes_total counter',
      `echarts_oss_deletes_total ${this.metrics.oss.deletes}`,
      '',
      '# HELP echarts_oss_delete_failures_total Total number of OSS delete failures',
      '# TYPE echarts_oss_delete_failures_total counter',
      `echarts_oss_delete_failures_total ${this.metrics.oss.deleteFailures}`,
      ''
    );
    
    // HTTP指标
    metrics.push(
      '# HELP echarts_http_requests_total Total number of HTTP requests',
      '# TYPE echarts_http_requests_total counter',
      `echarts_http_requests_total ${this.metrics.http.requests}`,
      '',
      '# HELP echarts_http_responses_total Total number of HTTP responses by status class',
      '# TYPE echarts_http_responses_total counter',
      `echarts_http_responses_total{status_class="2xx"} ${this.metrics.http.responses['2xx']}`,
      `echarts_http_responses_total{status_class="4xx"} ${this.metrics.http.responses['4xx']}`,
      `echarts_http_responses_total{status_class="5xx"} ${this.metrics.http.responses['5xx']}`,
      ''
    );
    
    // 系统指标
    const memUsage = process.memoryUsage();
    metrics.push(
      '# HELP echarts_memory_usage_bytes Memory usage in bytes',
      '# TYPE echarts_memory_usage_bytes gauge',
      `echarts_memory_usage_bytes{type="rss"} ${memUsage.rss}`,
      `echarts_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}`,
      `echarts_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}`,
      `echarts_memory_usage_bytes{type="external"} ${memUsage.external}`,
      `echarts_memory_usage_bytes{type="peak"} ${this.metrics.system.memoryPeakUsage}`,
      '',
      '# HELP echarts_uptime_seconds Process uptime in seconds',
      '# TYPE echarts_uptime_seconds counter',
      `echarts_uptime_seconds ${process.uptime()}`,
      '',
      '# HELP echarts_info Information about the ECharts export server',
      '# TYPE echarts_info gauge',
      `echarts_info{version="${require('../../package.json').version}",node_version="${process.version}"} 1`,
      ''
    );
    
    return metrics.join('\n');
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      tasks: {
        created: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        timeout: 0
      },
      processingTimes: {
        samples: [],
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      queue: {
        maxPending: 0,
        maxProcessing: 0,
        currentPending: 0,
        currentProcessing: 0
      },
      oss: {
        uploads: 0,
        uploadFailures: 0,
        deletes: 0,
        deleteFailures: 0,
        uploadSizes: [],
        uploadTimes: []
      },
      system: {
        startTime: Date.now(),
        lastUpdate: Date.now(),
        memoryPeakUsage: 0,
        cpuUsage: 0
      },
      http: {
        requests: 0,
        responses: {
          '2xx': 0,
          '4xx': 0,
          '5xx': 0
        },
        responseTimes: []
      }
    };
    
    logger.info('Metrics reset');
  }

  /**
   * 销毁监控服务
   */
  destroy() {
    if (this.systemMonitorInterval) {
      clearInterval(this.systemMonitorInterval);
      this.systemMonitorInterval = null;
    }
    
    logger.info('MetricsService destroyed');
  }
}

module.exports = MetricsService;