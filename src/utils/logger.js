/**
 * 日志工具
 * 使用Winston进行结构化日志记录
 */

const winston = require('winston');
const path = require('path');

// 创建日志目录（如果不存在）
const logDir = 'logs';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'echarts-export-server' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // 所有日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 在开发环境下同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 添加便捷方法
logger.logTaskCreated = (taskId, config) => {
  logger.info('Task created', {
    taskId,
    type: config.type,
    width: config.width,
    height: config.height
  });
};

logger.logTaskStarted = (taskId) => {
  logger.info('Task processing started', { taskId });
};

logger.logTaskCompleted = (taskId, processingTime, imageUrl) => {
  logger.info('Task completed successfully', {
    taskId,
    processingTime,
    imageUrl
  });
};

logger.logTaskFailed = (taskId, error) => {
  logger.error('Task failed', {
    taskId,
    error: error.message,
    stack: error.stack
  });
};

logger.logOSSUpload = (fileName, size) => {
  logger.info('OSS upload successful', {
    fileName,
    size
  });
};

logger.logOSSError = (operation, error) => {
  logger.error('OSS operation failed', {
    operation,
    error: error.message
  });
};

logger.logQueueStatus = (pendingTasks, processingTasks) => {
  logger.debug('Queue status', {
    pendingTasks,
    processingTasks
  });
};

module.exports = logger;