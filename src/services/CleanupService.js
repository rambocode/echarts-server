/**
 * 清理服务
 * 负责管理定时清理任务和维护功能
 */

const logger = require('../utils/logger');

class CleanupService {
  constructor(taskManager, options = {}) {
    this.taskManager = taskManager;
    
    this.options = {
      // 清理间隔（毫秒）
      cleanupInterval: options.cleanupInterval || 24 * 60 * 60 * 1000, // 24小时
      // 任务保留天数
      taskRetentionDays: options.taskRetentionDays || 7,
      // 是否自动启动
      autoStart: options.autoStart !== false,
      // 清理时间（小时，24小时制）
      cleanupHour: options.cleanupHour || 2, // 凌晨2点
      // 最大清理重试次数
      maxRetries: options.maxRetries || 3,
      ...options
    };
    
    this.cleanupTimer = null;
    this.isRunning = false;
    this.lastCleanupTime = null;
    this.cleanupStats = {
      totalRuns: 0,
      totalTasksCleaned: 0,
      totalFilesCleaned: 0,
      totalErrors: 0,
      lastRunDuration: 0
    };
    
    if (this.options.autoStart) {
      this.start();
    }
    
    logger.info('CleanupService initialized', {
      cleanupInterval: this.options.cleanupInterval,
      taskRetentionDays: this.options.taskRetentionDays,
      cleanupHour: this.options.cleanupHour,
      autoStart: this.options.autoStart
    });
  }

  /**
   * 启动清理服务
   */
  start() {
    if (this.cleanupTimer) {
      logger.warn('CleanupService is already running');
      return;
    }
    
    // 计算下次清理时间
    const nextCleanupTime = this.calculateNextCleanupTime();
    const delay = nextCleanupTime - Date.now();
    
    logger.info('CleanupService starting', {
      nextCleanupTime: new Date(nextCleanupTime).toISOString(),
      delayMinutes: Math.round(delay / (1000 * 60))
    });
    
    // 设置定时器
    this.cleanupTimer = setTimeout(() => {
      this.runCleanupCycle();
    }, delay);
    
    this.isRunning = true;
  }

  /**
   * 停止清理服务
   */
  stop() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.isRunning = false;
    
    logger.info('CleanupService stopped');
  }

  /**
   * 重启清理服务
   */
  restart() {
    this.stop();
    this.start();
  }

  /**
   * 运行清理周期
   */
  async runCleanupCycle() {
    const startTime = Date.now();
    
    try {
      logger.info('Starting cleanup cycle', {
        cycle: this.cleanupStats.totalRuns + 1,
        retentionDays: this.options.taskRetentionDays
      });
      
      // 执行清理
      const result = await this.executeCleanupWithRetry();
      
      // 更新统计信息
      this.updateStats(result, Date.now() - startTime);
      
      // 记录清理结果
      logger.info('Cleanup cycle completed', {
        cycle: this.cleanupStats.totalRuns,
        duration: this.cleanupStats.lastRunDuration,
        cleanedTasks: result.cleanedTasks,
        deletedFiles: result.deletedFiles,
        errors: result.errors.length
      });
      
    } catch (error) {
      logger.error('Cleanup cycle failed', {
        error: error.message,
        stack: error.stack,
        cycle: this.cleanupStats.totalRuns + 1
      });
      
      this.cleanupStats.totalErrors++;
    }
    
    // 设置下次清理
    if (this.isRunning) {
      this.scheduleNextCleanup();
    }
  }

  /**
   * 带重试的清理执行
   * @returns {Promise<object>} 清理结果
   */
  async executeCleanupWithRetry() {
    let lastError;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await this.taskManager.cleanupExpiredTasks();
      } catch (error) {
        lastError = error;
        
        logger.warn('Cleanup attempt failed', {
          attempt,
          maxRetries: this.options.maxRetries,
          error: error.message
        });
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.options.maxRetries) {
          await this.delay(5000 * attempt); // 递增延迟
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 计算下次清理时间
   * @returns {number} 时间戳
   */
  calculateNextCleanupTime() {
    const now = new Date();
    const nextCleanup = new Date();
    
    // 设置为今天的清理时间
    nextCleanup.setHours(this.options.cleanupHour, 0, 0, 0);
    
    // 如果今天的清理时间已过，设置为明天
    if (nextCleanup <= now) {
      nextCleanup.setDate(nextCleanup.getDate() + 1);
    }
    
    return nextCleanup.getTime();
  }

  /**
   * 安排下次清理
   */
  scheduleNextCleanup() {
    const nextCleanupTime = this.calculateNextCleanupTime();
    const delay = nextCleanupTime - Date.now();
    
    this.cleanupTimer = setTimeout(() => {
      this.runCleanupCycle();
    }, delay);
    
    logger.debug('Next cleanup scheduled', {
      nextCleanupTime: new Date(nextCleanupTime).toISOString(),
      delayHours: Math.round(delay / (1000 * 60 * 60))
    });
  }

  /**
   * 更新统计信息
   * @param {object} result - 清理结果
   * @param {number} duration - 执行时间
   */
  updateStats(result, duration) {
    this.cleanupStats.totalRuns++;
    this.cleanupStats.totalTasksCleaned += result.cleanedTasks;
    this.cleanupStats.totalFilesCleaned += result.deletedFiles;
    this.cleanupStats.totalErrors += result.errors.length;
    this.cleanupStats.lastRunDuration = duration;
    this.lastCleanupTime = new Date();
  }

  /**
   * 手动执行清理
   * @returns {Promise<object>} 清理结果
   */
  async manualCleanup() {
    logger.info('Manual cleanup requested');
    
    const startTime = Date.now();
    const result = await this.executeCleanupWithRetry();
    const duration = Date.now() - startTime;
    
    // 更新统计信息（但不计入总运行次数）
    this.cleanupStats.totalTasksCleaned += result.cleanedTasks;
    this.cleanupStats.totalFilesCleaned += result.deletedFiles;
    this.cleanupStats.totalErrors += result.errors.length;
    
    logger.info('Manual cleanup completed', {
      duration,
      cleanedTasks: result.cleanedTasks,
      deletedFiles: result.deletedFiles,
      errors: result.errors.length
    });
    
    return result;
  }

  /**
   * 获取清理服务状态
   * @returns {object}
   */
  getStatus() {
    const nextCleanupTime = this.isRunning ? this.calculateNextCleanupTime() : null;
    
    return {
      isRunning: this.isRunning,
      lastCleanupTime: this.lastCleanupTime ? this.lastCleanupTime.toISOString() : null,
      nextCleanupTime: nextCleanupTime ? new Date(nextCleanupTime).toISOString() : null,
      stats: { ...this.cleanupStats },
      options: {
        cleanupInterval: this.options.cleanupInterval,
        taskRetentionDays: this.options.taskRetentionDays,
        cleanupHour: this.options.cleanupHour
      }
    };
  }

  /**
   * 更新配置
   * @param {object} newOptions - 新配置
   */
  updateOptions(newOptions) {
    const oldOptions = { ...this.options };
    Object.assign(this.options, newOptions);
    
    logger.info('CleanupService options updated', {
      oldOptions,
      newOptions: this.options
    });
    
    // 如果清理间隔或时间发生变化，重启服务
    if (newOptions.cleanupInterval || newOptions.cleanupHour !== undefined) {
      if (this.isRunning) {
        this.restart();
      }
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 销毁清理服务
   */
  destroy() {
    this.stop();
    
    logger.info('CleanupService destroyed', {
      totalStats: this.cleanupStats
    });
  }
}

module.exports = CleanupService;