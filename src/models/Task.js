/**
 * Task数据模型
 * 表示图片生成任务的状态和信息
 */

const { v4: uuidv4 } = require('uuid');

class Task {
  constructor(config) {
    this.taskId = uuidv4();
    this.status = 'pending'; // pending|processing|completed|failed
    this.config = config;
    this.imageUrl = null;
    this.fileName = null;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.retryCount = 0;
  }

  /**
   * 开始处理任务
   */
  start() {
    this.status = 'processing';
    this.startedAt = new Date();
  }

  /**
   * 完成任务
   * @param {string} imageUrl - OSS图片URL
   * @param {string} fileName - OSS文件名
   */
  complete(imageUrl, fileName) {
    this.status = 'completed';
    this.imageUrl = imageUrl;
    this.fileName = fileName;
    this.completedAt = new Date();
    this.error = null;
  }

  /**
   * 任务失败
   * @param {string} error - 错误信息
   */
  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.completedAt = new Date();
  }

  /**
   * 重试任务
   */
  retry() {
    this.retryCount++;
    this.status = 'pending';
    this.error = null;
  }

  /**
   * 检查任务是否超时
   * @param {number} timeoutSeconds - 超时时间（秒）
   * @returns {boolean}
   */
  isTimeout(timeoutSeconds) {
    if (this.status !== 'processing' || !this.startedAt) {
      return false;
    }
    
    const now = new Date();
    const elapsedSeconds = (now - this.startedAt) / 1000;
    return elapsedSeconds > timeoutSeconds;
  }

  /**
   * 检查任务是否过期（用于清理）
   * @param {number} retentionDays - 保留天数
   * @returns {boolean}
   */
  isExpired(retentionDays) {
    const now = new Date();
    const elapsedDays = (now - this.createdAt) / (1000 * 60 * 60 * 24);
    return elapsedDays > retentionDays;
  }

  /**
   * 获取任务处理时间（毫秒）
   * @returns {number|null}
   */
  getProcessingTime() {
    if (!this.startedAt || !this.completedAt) {
      return null;
    }
    return this.completedAt - this.startedAt;
  }

  /**
   * 转换为API响应格式
   * @returns {object}
   */
  toJSON() {
    return {
      taskId: this.taskId,
      status: this.status,
      imageUrl: this.imageUrl,
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      completedAt: this.completedAt ? this.completedAt.toISOString() : null,
      error: this.error,
      retryCount: this.retryCount
    };
  }

  /**
   * 验证任务配置
   * @param {object} config - 任务配置
   * @returns {object} 验证结果 {valid: boolean, errors: string[]}
   */
  static validateConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push('Config must be an object');
      return { valid: false, errors };
    }

    if (!config.option || typeof config.option !== 'object') {
      errors.push('Config.option is required and must be an object');
    }

    if (config.width && (typeof config.width !== 'number' || config.width <= 0)) {
      errors.push('Config.width must be a positive number');
    }

    if (config.height && (typeof config.height !== 'number' || config.height <= 0)) {
      errors.push('Config.height must be a positive number');
    }

    if (config.type && !['png', 'jpeg', 'svg', 'pdf'].includes(config.type)) {
      errors.push('Config.type must be one of: png, jpeg, svg, pdf');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = Task;