/**
 * 任务队列系统
 * 基于内存的FIFO队列实现，支持并发控制
 */

const EventEmitter = require('events');

class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConcurrent: options.maxConcurrent || 10,
      taskTimeout: options.taskTimeout || 300, // 5分钟
      retryAttempts: options.retryAttempts || 3,
      ...options
    };
    
    // 队列存储
    this.pendingQueue = []; // 等待处理的任务
    this.processingTasks = new Map(); // 正在处理的任务 taskId -> task
    this.completedTasks = new Map(); // 已完成的任务 taskId -> task
    
    // 统计信息
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      processingTimes: []
    };
    
    // 定时器
    this.timeoutCheckInterval = null;
    
    this.startTimeoutChecker();
  }

  /**
   * 添加任务到队列
   * @param {Task} task - 任务对象
   * @returns {boolean} 是否成功添加
   */
  enqueue(task) {
    if (!task || !task.taskId) {
      throw new Error('Invalid task object');
    }
    
    // 检查任务是否已存在
    if (this.hasTask(task.taskId)) {
      return false;
    }
    
    this.pendingQueue.push(task);
    this.emit('taskEnqueued', task);
    
    // 尝试处理下一个任务
    this.processNext();
    
    return true;
  }

  /**
   * 处理下一个任务
   */
  processNext() {
    // 检查是否达到并发限制
    if (this.processingTasks.size >= this.options.maxConcurrent) {
      return;
    }
    
    // 检查是否有待处理任务
    if (this.pendingQueue.length === 0) {
      return;
    }
    
    const task = this.pendingQueue.shift();
    this.startProcessing(task);
  }

  /**
   * 开始处理任务
   * @param {Task} task - 任务对象
   */
  startProcessing(task) {
    task.start();
    this.processingTasks.set(task.taskId, task);
    
    this.emit('taskStarted', task);
  }

  /**
   * 完成任务处理
   * @param {string} taskId - 任务ID
   * @param {string} imageUrl - 图片URL
   * @param {string} fileName - 文件名
   */
  completeTask(taskId, imageUrl, fileName) {
    const task = this.processingTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in processing queue`);
    }
    
    task.complete(imageUrl, fileName);
    
    // 移动到已完成队列
    this.processingTasks.delete(taskId);
    this.completedTasks.set(taskId, task);
    
    // 更新统计信息
    this.updateStats(task);
    
    this.emit('taskCompleted', task);
    
    // 处理下一个任务
    this.processNext();
  }

  /**
   * 任务失败处理
   * @param {string} taskId - 任务ID
   * @param {string} error - 错误信息
   */
  failTask(taskId, error) {
    const task = this.processingTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in processing queue`);
    }
    
    // 检查是否需要重试
    if (task.retryCount < this.options.retryAttempts) {
      task.retry();
      this.processingTasks.delete(taskId);
      this.pendingQueue.unshift(task); // 重试任务优先处理
      
      this.emit('taskRetry', task);
      
      // 处理下一个任务
      this.processNext();
    } else {
      // 达到最大重试次数，标记为失败
      task.fail(error);
      
      this.processingTasks.delete(taskId);
      this.completedTasks.set(taskId, task);
      
      this.stats.totalFailed++;
      
      this.emit('taskFailed', task);
      
      // 处理下一个任务
      this.processNext();
    }
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Task|null}
   */
  getTask(taskId) {
    // 检查正在处理的任务
    if (this.processingTasks.has(taskId)) {
      return this.processingTasks.get(taskId);
    }
    
    // 检查已完成的任务
    if (this.completedTasks.has(taskId)) {
      return this.completedTasks.get(taskId);
    }
    
    // 检查等待队列
    const pendingTask = this.pendingQueue.find(task => task.taskId === taskId);
    if (pendingTask) {
      return pendingTask;
    }
    
    return null;
  }

  /**
   * 检查任务是否存在
   * @param {string} taskId - 任务ID
   * @returns {boolean}
   */
  hasTask(taskId) {
    return this.getTask(taskId) !== null;
  }

  /**
   * 获取队列状态
   * @returns {object}
   */
  getQueueStatus() {
    return {
      pendingTasks: this.pendingQueue.length,
      processingTasks: this.processingTasks.size,
      completedTasks: this.completedTasks.size,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      averageProcessingTime: this.stats.averageProcessingTime,
      maxConcurrent: this.options.maxConcurrent
    };
  }

  /**
   * 获取所有等待中的任务
   * @returns {Array<Task>}
   */
  getPendingTasks() {
    return [...this.pendingQueue];
  }

  /**
   * 获取所有正在处理的任务
   * @returns {Array<Task>}
   */
  getProcessingTasks() {
    return Array.from(this.processingTasks.values());
  }

  /**
   * 清理过期任务
   * @param {number} retentionDays - 保留天数
   * @returns {Array<Task>} 被清理的任务列表
   */
  cleanupExpiredTasks(retentionDays = 7) {
    const expiredTasks = [];
    
    for (const [taskId, task] of this.completedTasks) {
      if (task.isExpired(retentionDays)) {
        this.completedTasks.delete(taskId);
        expiredTasks.push(task);
      }
    }
    
    if (expiredTasks.length > 0) {
      this.emit('tasksCleanedUp', expiredTasks);
    }
    
    return expiredTasks;
  }

  /**
   * 启动超时检查器
   */
  startTimeoutChecker() {
    if (this.timeoutCheckInterval) {
      return;
    }
    
    this.timeoutCheckInterval = setInterval(() => {
      this.checkTimeouts();
    }, 30000); // 每30秒检查一次
  }

  /**
   * 停止超时检查器
   */
  stopTimeoutChecker() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
  }

  /**
   * 检查超时任务
   */
  checkTimeouts() {
    const timeoutTasks = [];
    
    for (const [taskId, task] of this.processingTasks) {
      if (task.isTimeout(this.options.taskTimeout)) {
        timeoutTasks.push(taskId);
      }
    }
    
    // 处理超时任务
    timeoutTasks.forEach(taskId => {
      // 发出超时事件，让TaskManager记录指标
      this.emit('taskTimeout', this.processingTasks.get(taskId));
      this.failTask(taskId, 'Task timeout');
    });
  }

  /**
   * 更新统计信息
   * @param {Task} task - 已完成的任务
   */
  updateStats(task) {
    this.stats.totalProcessed++;
    
    const processingTime = task.getProcessingTime();
    if (processingTime !== null) {
      this.stats.processingTimes.push(processingTime);
      
      // 保持最近1000个处理时间用于计算平均值
      if (this.stats.processingTimes.length > 1000) {
        this.stats.processingTimes.shift();
      }
      
      // 计算平均处理时间
      const sum = this.stats.processingTimes.reduce((a, b) => a + b, 0);
      this.stats.averageProcessingTime = sum / this.stats.processingTimes.length;
    }
  }

  /**
   * 暂停队列处理
   */
  pause() {
    this.stopTimeoutChecker();
    this.emit('queuePaused');
  }

  /**
   * 恢复队列处理
   */
  resume() {
    this.startTimeoutChecker();
    this.processNext();
    this.emit('queueResumed');
  }

  /**
   * 清空队列
   */
  clear() {
    this.pendingQueue.length = 0;
    this.processingTasks.clear();
    this.completedTasks.clear();
    
    // 重置统计信息
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      processingTimes: []
    };
    
    this.emit('queueCleared');
  }

  /**
   * 销毁队列
   */
  destroy() {
    this.stopTimeoutChecker();
    this.clear();
    this.removeAllListeners();
  }
}

module.exports = TaskQueue;