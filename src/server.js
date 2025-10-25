/**
 * 服务器启动文件
 */

const App = require('./app');
const logger = require('./utils/logger');

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// 优雅关闭处理
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (app) {
    await app.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (app) {
    await app.stop();
  }
  process.exit(0);
});

// 启动应用
const app = new App();
app.start().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});