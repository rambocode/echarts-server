/**
 * 任务管理器
 * 集成TaskQueue和ImageGenerator，提供完整的任务管理功能
 * 包括任务创建、状态查询、处理逻辑和清理机制
 */

const Task = require('../models/Task');
const TaskQueue = require('./TaskQueue');
const MetricsService = require('./MetricsService');
const logger = require('../utils/logger');

class TaskManager {
  constructor(imageGenerator, ossClient = null, options = {}) {
    this.imageGenerator = imageGenerator;
    this.ossClient = ossClient;
    
    // 初始化性能监控服务
    this.metricsService = new MetricsService();
    
    // 初始化任务队列
    this.taskQueue = new TaskQueue(options);
    
    // 配置选项
    this.options = {
      cleanupInterval: options.cleanupInterval || 24 * 60 * 60 * 1000, // 24小时
      taskRetentionDays: options.taskRetentionDays || 7,
      autoStart: options.autoStart !== false, // 默认自动开始处理
      ...options
    };
    
    // 清理定时器
    this.cleanupTimer = null;
    
    // 绑定队列事件
    this.bindQueueEvents();
    
    // 启动自动清理
    if (this.options.autoStart) {
      this.startCleanupTimer();
    }
    
    // 启动队列状态监控
    this.startQueueMonitoring();
    
    logger.info('TaskManager initialized', {
      maxConcurrent: this.taskQueue.options.maxConcurrent,
      taskTimeout: this.taskQueue.options.taskTimeout,
      retryAttempts: this.taskQueue.options.retryAttempts
    });
  }

  /**
   * 创建新任务
   * @param {object} config - 任务配置
   * @returns {Promise<Task>}
   */
  async createTask(config) {
    try {
      // 验证配置
      const validation = Task.validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid task config: ${validation.errors.join(', ')}`);
      }
      
      // 创建任务对象
      const task = new Task(config);
      
      // 添加到队列
      const success = this.taskQueue.enqueue(task);
      if (!success) {
        throw new Error('Failed to enqueue task');
      }
      
      // 记录任务创建指标
      this.metricsService.recordTaskCreated(task.taskId, config);
      
      logger.info('Task created', {
        taskId: task.taskId,
        status: task.status,
        config: {
          type: config.type,
          width: config.width,
          height: config.height
        }
      });
      
      return task;
      
    } catch (error) {
      logger.error('Failed to create task', { error: error.message, config });
      throw error;
    }
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Task|null}
   */
  getTaskStatus(taskId) {
    const task = this.taskQueue.getTask(taskId);
    
    if (task) {
      logger.debug('Task status retrieved', {
        taskId,
        status: task.status,
        retryCount: task.retryCount
      });
    }
    
    return task;
  }

  /**
   * 获取队列状态
   * @returns {object}
   */
  getQueueStatus() {
    const status = this.taskQueue.getQueueStatus();
    
    logger.debug('Queue status retrieved', status);
    
    return status;
  }

  /**
   * 处理任务（由队列事件触发）
   * @param {Task} task - 要处理的任务
   */
  async processTask(task) {
    try {
      logger.info('Processing task started', {
        taskId: task.taskId,
        retryCount: task.retryCount
      });
      
      let result;
      
      if (this.ossClient) {
        // 生成图片并上传到OSS
        result = await this.imageGenerator.generateAndUploadImage(
          task.config,
          task.taskId
        );
        
        // 完成任务
        this.taskQueue.completeTask(task.taskId, result.url, result.fileName);
        
        // 记录任务完成指标
        this.metricsService.recordTaskCompleted(task.taskId, task.getProcessingTime(), result.url);
        
        logger.info('Task completed with OSS upload', {
          taskId: task.taskId,
          imageUrl: result.url,
          fileName: result.fileName,
          processingTime: task.getProcessingTime()
        });
        
      } else {
        // 仅生成图片（无OSS上传）
        result = await this.imageGenerator.generateImage(task.config);
        
        // 生成本地URL或base64
        const imageUrl = task.config.base64 
          ? await this.imageGenerator.generateBase64(task.config)
          : 'data:image/png;base64,' + result.buffer.toString('base64');
        
        this.taskQueue.completeTask(task.taskId, imageUrl, null);
        
        // 记录任务完成指标
        this.metricsService.recordTaskCompleted(task.taskId, task.getProcessingTime(), imageUrl);
        
        logger.info('Task completed without OSS', {
          taskId: task.taskId,
          processingTime: task.getProcessingTime()
        });
      }
      
    } catch (error) {
      logger.error('Task processing failed', {
        taskId: task.taskId,
        error: error.message,
        retryCount: task.retryCount
      });
      
      // 记录任务失败指标
      this.metricsService.recordTaskFailed(task.taskId, error.message, false);
      
      this.taskQueue.failTask(task.taskId, error.message);
    }
  }

  /**
   * 绑定队列事件
   */
  bindQueueEvents() {
    // 任务开始处理
    this.taskQueue.on('taskStarted', (task) => {
      this.processTask(task);
    });
    
    // 任务完成
    this.taskQueue.on('taskCompleted', (task) => {
      logger.info('Task completed event', {
        taskId: task.taskId,
        imageUrl: task.imageUrl
      });
    });
    
    // 任务失败
    this.taskQueue.on('taskFailed', (task) => {
      logger.warn('Task failed event', {
        taskId: task.taskId,
        error: task.error,
        retryCount: task.retryCount
      });
    });
    
    // 任务重试
    this.taskQueue.on('taskRetry', (task) => {
      // 记录任务重试指标
      this.metricsService.recordTaskRetry(task.taskId, task.retryCount);
      
      logger.info('Task retry event', {
        taskId: task.taskId,
        retryCount: task.retryCount
      });
    });
    
    // 任务入队
    this.taskQueue.on('taskEnqueued', (task) => {
      logger.debug('Task enqueued', {
        taskId: task.taskId,
        queueLength: this.taskQueue.pendingQueue.length
      });
    });
    
    // 任务超时
    this.taskQueue.on('taskTimeout', (task) => {
      // 记录超时任务指标
      this.metricsService.recordTaskFailed(task.taskId, 'Task timeout', true);
      
      logger.warn('Task timeout event', {
        taskId: task.taskId,
        processingTime: task.getProcessingTime()
      });
    });
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTasks();
    }, this.options.cleanupInterval);
    
    logger.info('Cleanup timer started', {
      interval: this.options.cleanupInterval,
      retentionDays: this.options.taskRetentionDays
    });
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Cleanup timer stopped');
    }
  }

  /**
   * 清理过期任务
   * @returns {Promise<{cleanedTasks: number, deletedFiles: number, errors: Array}>} 清理结果
   */
  async cleanupExpiredTasks() {
    const startTime = Date.now();
    const result = {
      cleanedTasks: 0,
      deletedFiles: 0,
      errors: []
    };

    try {
      logger.info('Starting expired tasks cleanup', {
        retentionDays: this.options.taskRetentionDays,
        timestamp: new Date().toISOString()
      });
      
      // 获取清理前的统计信息
      const beforeStats = this.getQueueStatus();
      
      // 清理队列中的过期任务
      const expiredTasks = this.taskQueue.cleanupExpiredTasks(this.options.taskRetentionDays);
      result.cleanedTasks = expiredTasks.length;
      
      // 记录清理的任务详情
      if (expiredTasks.length > 0) {
        const tasksByStatus = expiredTasks.reduce((acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        }, {});
        
        logger.info('Tasks cleaned up by status', {
          tasksByStatus,
          totalCleaned: expiredTasks.length
        });
      }
      
      // 如果配置了OSS客户端，删除对应的图片文件
      if (this.ossClient && expiredTasks.length > 0) {
        const filesToDelete = expiredTasks
          .filter(task => task.fileName && task.status === 'completed')
          .map(task => task.fileName);
        
        if (filesToDelete.length > 0) {
          logger.info('Starting OSS files deletion', {
            fileCount: filesToDelete.length
          });
          
          // 批量删除文件，但要处理单个文件的错误
          const deleteResults = await this.deleteOSSFilesWithErrorHandling(filesToDelete);
          result.deletedFiles = deleteResults.successful;
          result.errors = deleteResults.errors;
          
          logger.info('OSS files deletion completed', {
            totalFiles: filesToDelete.length,
            successful: deleteResults.successful,
            failed: deleteResults.errors.length
          });
          
          // 记录删除失败的文件
          if (deleteResults.errors.length > 0) {
            logger.warn('Some OSS files failed to delete', {
              errors: deleteResults.errors
            });
          }
        }
      }
      
      // 获取清理后的统计信息
      const afterStats = this.getQueueStatus();
      const cleanupDuration = Date.now() - startTime;
      
      logger.info('Expired tasks cleanup completed', {
        duration: cleanupDuration,
        cleanedTasks: result.cleanedTasks,
        deletedFiles: result.deletedFiles,
        errors: result.errors.length,
        beforeStats: {
          completedTasks: beforeStats.completedTasks
        },
        afterStats: {
          completedTasks: afterStats.completedTasks
        }
      });
      
      return result;
      
    } catch (error) {
      logger.error('Cleanup operation failed', { 
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });
      
      result.errors.push({
        type: 'cleanup_error',
        message: error.message
      });
      
      return result;
    }
  }

  /**
   * 删除OSS文件并处理单个文件的错误
   * @param {Array<string>} fileNames - 文件名列表
   * @returns {Promise<{successful: number, errors: Array}>}
   */
  async deleteOSSFilesWithErrorHandling(fileNames) {
    const result = {
      successful: 0,
      errors: []
    };
    
    // 分批处理文件删除，避免一次性删除太多文件
    const batchSize = 10;
    
    for (let i = 0; i < fileNames.length; i += batchSize) {
      const batch = fileNames.slice(i, i + batchSize);
      
      // 并行删除当前批次的文件
      const deletePromises = batch.map(async (fileName) => {
        try {
          await this.ossClient.deleteFile(fileName);
          result.successful++;
          
          logger.debug('OSS file deleted successfully', { fileName });
          
        } catch (error) {
          result.errors.push({
            fileName,
            error: error.message
          });
          
          logger.warn('Failed to delete OSS file', {
            fileName,
            error: error.message
          });
        }
      });
      
      await Promise.all(deletePromises);
      
      // 在批次之间添加小延迟，避免对OSS造成过大压力
      if (i + batchSize < fileNames.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return result;
  }

  /**
   * 手动触发清理操作
   * @returns {Promise<object>} 清理结果
   */
  async manualCleanup() {
    logger.info('Manual cleanup triggered');
    return await this.cleanupExpiredTasks();
  }

  /**
   * 批量创建任务
   * @param {Array<object>} configs - 任务配置数组
   * @returns {Promise<Array<Task>>}
   */
  async createBatchTasks(configs) {
    const tasks = [];
    const errors = [];
    
    for (let i = 0; i < configs.length; i++) {
      try {
        const task = await this.createTask(configs[i]);
        tasks.push(task);
      } catch (error) {
        errors.push({
          index: i,
          config: configs[i],
          error: error.message
        });
      }
    }
    
    logger.info('Batch tasks created', {
      total: configs.length,
      successful: tasks.length,
      failed: errors.length
    });
    
    if (errors.length > 0) {
      logger.warn('Some batch tasks failed', { errors });
    }
    
    return tasks;
  }

  /**
   * 获取任务统计信息
   * @returns {object}
   */
  getStatistics() {
    const queueStatus = this.taskQueue.getQueueStatus();
    
    return {
      ...queueStatus,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 暂停任务处理
   */
  pause() {
    this.taskQueue.pause();
    this.stopCleanupTimer();
    logger.info('TaskManager paused');
  }

  /**
   * 恢复任务处理
   */
  resume() {
    this.taskQueue.resume();
    this.startCleanupTimer();
    logger.info('TaskManager resumed');
  }

  /**
   * 重新配置TaskManager
   * @param {object} newOptions - 新的配置选项
   */
  reconfigure(newOptions) {
    // 更新选项
    Object.assign(this.options, newOptions);
    
    // 重启清理定时器
    this.stopCleanupTimer();
    if (this.options.autoStart) {
      this.startCleanupTimer();
    }
    
    logger.info('TaskManager reconfigured', newOptions);
  }

  /**
   * 强制处理下一个任务（用于测试）
   */
  forceProcessNext() {
    this.taskQueue.processNext();
  }

  /**
   * 启动队列状态监控
   */
  startQueueMonitoring() {
    // 每10秒更新一次队列状态指标
    this.queueMonitorInterval = setInterval(() => {
      const queueStatus = this.taskQueue.getQueueStatus();
      this.metricsService.updateQueueStatus(
        queueStatus.pendingTasks,
        queueStatus.processingTasks
      );
    }, 10000);
  }

  /**
   * 停止队列状态监控
   */
  stopQueueMonitoring() {
    if (this.queueMonitorInterval) {
      clearInterval(this.queueMonitorInterval);
      this.queueMonitorInterval = null;
    }
  }

  /**
   * 获取性能指标
   * @returns {object}
   */
  getMetrics() {
    return this.metricsService.getAllMetrics();
  }

  /**
   * 生成Prometheus格式指标
   * @returns {string}
   */
  getPrometheusMetrics() {
    return this.metricsService.generatePrometheusMetrics();
  }

  /**
   * 销毁TaskManager
   */
  destroy() {
    logger.info('Destroying TaskManager');
    
    this.stopCleanupTimer();
    this.stopQueueMonitoring();
    
    if (this.metricsService) {
      this.metricsService.destroy();
    }
    
    this.taskQueue.destroy();
    
    logger.info('TaskManager destroyed');
  }
}

module.exports = TaskManager;