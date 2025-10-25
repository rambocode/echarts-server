/**
 * 配置管理模块
 * 支持环境变量配置和默认值
 */

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    return {
      // 服务器配置
      server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development'
      },

      // OSS配置
      oss: {
        accessKeyId: process.env.OSS_ACCESS_KEY_ID,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
        bucket: process.env.OSS_BUCKET,
        region: process.env.OSS_REGION || 'oss-cn-hangzhou',
        customDomain: process.env.OSS_CUSTOM_DOMAIN,
        pathPrefix: process.env.OSS_PATH_PREFIX || 'charts/'
      },

      // 队列配置
      queue: {
        maxConcurrent: parseInt(process.env.QUEUE_MAX_CONCURRENT) || 10,
        taskTimeout: parseInt(process.env.QUEUE_TASK_TIMEOUT) || 300, // 5分钟
        retryAttempts: parseInt(process.env.QUEUE_RETRY_ATTEMPTS) || 3,
        cleanupInterval: (parseInt(process.env.CLEANUP_INTERVAL_HOURS) || 24) * 60 * 60 * 1000 // 24小时转换为毫秒
      },

      // 存储配置
      storage: {
        taskRetentionDays: parseInt(process.env.TASK_RETENTION_DAYS) || 7
      },

      // 图片生成配置
      chart: {
        defaultWidth: 600,
        defaultHeight: 400,
        supportedFormats: ['png', 'jpeg', 'svg', 'pdf'],
        maxRequestSize: 1e6 // 1MB
      }
    };
  }

  validateConfig() {
    const errors = [];

    // 验证服务器配置
    const port = this.config.server.port;
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('PORT must be a valid port number (1-65535)');
    }

    // 验证队列配置
    if (this.config.queue.maxConcurrent < 1 || this.config.queue.maxConcurrent > 100) {
      errors.push('QUEUE_MAX_CONCURRENT must be between 1 and 100');
    }

    if (this.config.queue.taskTimeout < 30 || this.config.queue.taskTimeout > 3600) {
      errors.push('QUEUE_TASK_TIMEOUT must be between 30 and 3600 seconds');
    }

    if (this.config.queue.retryAttempts < 0 || this.config.queue.retryAttempts > 10) {
      errors.push('QUEUE_RETRY_ATTEMPTS must be between 0 and 10');
    }

    // 验证存储配置
    if (this.config.storage.taskRetentionDays < 1 || this.config.storage.taskRetentionDays > 365) {
      errors.push('TASK_RETENTION_DAYS must be between 1 and 365');
    }

    // OSS配置是可选的，但如果提供了部分配置，则需要完整
    const { oss } = this.config;
    const hasPartialOSSConfig = oss.accessKeyId || oss.accessKeySecret || oss.bucket;
    const hasCompleteOSSConfig = oss.accessKeyId && oss.accessKeySecret && oss.bucket;
    
    if (hasPartialOSSConfig && !hasCompleteOSSConfig) {
      errors.push('OSS configuration is incomplete. Please set all required OSS environment variables: OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, and OSS_BUCKET.');
    }

    // 验证OSS区域格式
    if (oss.region && !oss.region.startsWith('oss-')) {
      errors.push('OSS_REGION must be in format "oss-region-name" (e.g., "oss-cn-hangzhou")');
    }

    // 验证路径前缀格式
    if (oss.pathPrefix && !oss.pathPrefix.endsWith('/')) {
      this.config.oss.pathPrefix = oss.pathPrefix + '/';
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
  }

  /**
   * 检查OSS是否已配置
   * @returns {boolean}
   */
  isOSSConfigured() {
    const { oss } = this.config;
    return !!(oss.accessKeyId && oss.accessKeySecret && oss.bucket);
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], this.config);
  }

  getOSSConfig() {
    return this.config.oss;
  }

  getQueueConfig() {
    return this.config.queue;
  }

  getServerConfig() {
    return this.config.server;
  }

  getStorageConfig() {
    return this.config.storage;
  }

  getChartConfig() {
    return this.config.chart;
  }

  /**
   * 获取所有配置信息（用于调试）
   * @returns {object}
   */
  getAllConfig() {
    // 返回配置的副本，隐藏敏感信息
    const config = JSON.parse(JSON.stringify(this.config));
    if (config.oss.accessKeySecret) {
      config.oss.accessKeySecret = '***';
    }
    return config;
  }

  /**
   * 检查必需的环境变量
   * @returns {object} 检查结果
   */
  static checkEnvironmentVariables() {
    const required = [];
    const optional = [
      'PORT',
      'NODE_ENV',
      'LOG_LEVEL',
      'OSS_ACCESS_KEY_ID',
      'OSS_ACCESS_KEY_SECRET', 
      'OSS_BUCKET',
      'OSS_REGION',
      'OSS_CUSTOM_DOMAIN',
      'OSS_PATH_PREFIX',
      'QUEUE_MAX_CONCURRENT',
      'QUEUE_TASK_TIMEOUT',
      'QUEUE_RETRY_ATTEMPTS',
      'CLEANUP_INTERVAL_HOURS',
      'TASK_RETENTION_DAYS'
    ];

    const missing = required.filter(key => !process.env[key]);
    const present = [...required, ...optional].filter(key => process.env[key]);

    return {
      missing,
      present,
      isValid: missing.length === 0
    };
  }

  /**
   * 生成配置报告
   * @returns {string}
   */
  generateConfigReport() {
    const envCheck = ConfigManager.checkEnvironmentVariables();
    const config = this.getAllConfig();
    
    let report = '=== 配置报告 ===\n\n';
    
    report += '环境变量状态:\n';
    report += `  已设置: ${envCheck.present.length} 个\n`;
    report += `  缺失: ${envCheck.missing.length} 个\n`;
    
    if (envCheck.missing.length > 0) {
      report += `  缺失变量: ${envCheck.missing.join(', ')}\n`;
    }
    
    report += '\n当前配置:\n';
    report += `  服务器端口: ${config.server.port}\n`;
    report += `  运行环境: ${config.server.nodeEnv}\n`;
    report += `  OSS状态: ${this.isOSSConfigured() ? '已配置' : '未配置'}\n`;
    report += `  队列并发数: ${config.queue.maxConcurrent}\n`;
    report += `  任务超时: ${config.queue.taskTimeout}秒\n`;
    report += `  任务保留: ${config.storage.taskRetentionDays}天\n`;
    
    return report;
  }
}

module.exports = new ConfigManager();