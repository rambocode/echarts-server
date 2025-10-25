/**
 * Express应用程序主文件
 * 异步图片生成服务器
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');

// 导入服务类
const TaskManager = require('./services/TaskManager');
const OSSClient = require('./services/OSSClient');
const ImageGenerator = require('./services/ImageGenerator');
const CleanupService = require('./services/CleanupService');

class App {
  constructor() {
    this.app = express();
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * 初始化服务实例
   */
  initializeServices() {
    try {
      // 初始化OSS客户端（如果配置了OSS）
      this.ossClient = null;
      
      if (config.isOSSConfigured()) {
        const ossConfig = config.getOSSConfig();
        // OSS客户端将在TaskManager初始化后设置MetricsService
        this.ossClient = new OSSClient(ossConfig);
        logger.info('OSS client initialized');
      } else {
        logger.warn('OSS not configured, images will not be uploaded to OSS');
      }

      // 初始化图片生成器
      this.imageGenerator = new ImageGenerator(this.ossClient);
      logger.info('Image generator initialized');

      // 初始化任务管理器
      const queueConfig = config.getQueueConfig();
      const storageConfig = config.getStorageConfig();
      this.taskManager = new TaskManager(this.imageGenerator, this.ossClient, {
        ...queueConfig,
        taskRetentionDays: storageConfig.taskRetentionDays
      });
      
      // 将MetricsService传递给OSS客户端
      if (this.ossClient && this.taskManager.metricsService) {
        this.ossClient.metricsService = this.taskManager.metricsService;
      }
      
      logger.info('Task manager initialized');

      // 初始化清理服务
      this.cleanupService = new CleanupService(this.taskManager, {
        cleanupInterval: queueConfig.cleanupInterval,
        taskRetentionDays: storageConfig.taskRetentionDays,
        autoStart: true
      });
      logger.info('Cleanup service initialized');

    } catch (error) {
      logger.error('Failed to initialize services', { error: error.message });
      throw error;
    }
  }

  setupMiddleware() {
    // CORS支持
    this.app.use(cors());

    // JSON解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 请求日志和性能监控
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      
      // 监听响应完成事件
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        // 记录HTTP请求指标
        if (this.taskManager && this.taskManager.metricsService) {
          this.taskManager.metricsService.recordHTTPRequest(
            req.method,
            req.path,
            res.statusCode,
            responseTime
          );
        }
        
        logger.debug('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime
        });
      });
      
      next();
    });
  }

  setupRoutes() {
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({
        code: 200,
        msg: 'Server is healthy',
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: require('../package.json').version
        }
      });
    });

    // API路由
    this.setupAPIRoutes();

    // 向后兼容的同步API（保留原有功能）
    this.setupLegacyRoutes();

    // 404处理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        code: 404,
        msg: 'Endpoint not found',
        data: null
      });
    });
  }

  /**
   * 设置API路由
   */
  setupAPIRoutes() {
    // 异步任务API端点
    this.app.post('/api/charts/generate', 
      this.validateChartRequest.bind(this),
      this.createChartTask.bind(this)
    );
    this.app.get('/api/charts/status/:taskId', 
      this.validateTaskId.bind(this),
      this.getTaskStatus.bind(this)
    );
    
    // 系统监控API端点
    this.app.get('/api/system/queue-status', this.getQueueStatus.bind(this));
    this.app.get('/api/system/health', this.getSystemHealth.bind(this));
    this.app.get('/api/system/metrics', this.getSystemMetrics.bind(this));
    this.app.get('/api/system/performance', this.getPerformanceMetrics.bind(this));
    
    // 清理管理API端点
    this.app.get('/api/system/cleanup-status', this.getCleanupStatus.bind(this));
    this.app.post('/api/system/cleanup/manual', this.triggerManualCleanup.bind(this));
  }

  /**
   * 验证图表生成请求
   */
  validateChartRequest(req, res, next) {
    const { type, width, height, option } = req.body;
    const errors = [];

    // 验证必需参数
    if (!option) {
      errors.push('option is required');
    } else if (typeof option !== 'object') {
      errors.push('option must be an object');
    }

    // 验证可选参数
    if (type && !['png', 'jpeg', 'jpg', 'svg', 'pdf'].includes(type.toLowerCase())) {
      errors.push('type must be one of: png, jpeg, jpg, svg, pdf');
    }

    if (width && (typeof width !== 'number' || width < 1 || width > 4000)) {
      errors.push('width must be a number between 1 and 4000');
    }

    if (height && (typeof height !== 'number' || height < 1 || height > 4000)) {
      errors.push('height must be a number between 1 and 4000');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        code: 400,
        msg: 'Validation failed',
        data: null,
        error: {
          type: 'VALIDATION_ERROR',
          details: errors.join(', ')
        }
      });
    }

    next();
  }

  /**
   * 验证任务ID参数
   */
  validateTaskId(req, res, next) {
    const { taskId } = req.params;

    if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        msg: 'Invalid task ID',
        data: null,
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Task ID must be a non-empty string'
        }
      });
    }

    next();
  }

  /**
   * 创建图片生成任务
   */
  async createChartTask(req, res) {
    try {
      const { type, width, height, option, ossPath, base64, download } = req.body;

      // 构建任务配置（验证已在中间件中完成）
      const taskConfig = {
        type: type || 'png',
        width: width || 600,
        height: height || 400,
        option,
        ossPath,
        base64: base64 === true,
        download: download === true
      };

      // 创建任务
      const task = await this.taskManager.createTask(taskConfig);

      // 返回任务信息
      res.json({
        code: 200,
        msg: 'Task created successfully',
        data: {
          taskId: task.taskId,
          status: task.status,
          statusUrl: `/api/charts/status/${task.taskId}`,
          createdAt: task.createdAt
        }
      });

      logger.info('Chart generation task created', {
        taskId: task.taskId,
        type: taskConfig.type,
        dimensions: `${taskConfig.width}x${taskConfig.height}`
      });

    } catch (error) {
      logger.error('Failed to create chart task', {
        error: error.message,
        body: req.body
      });

      res.status(500).json({
        code: 500,
        msg: 'Failed to create task',
        data: null,
        error: {
          type: 'PROCESSING_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 查询任务状态
   */
  async getTaskStatus(req, res) {
    try {
      const { taskId } = req.params;

      // 获取任务状态（验证已在中间件中完成）
      const task = this.taskManager.getTaskStatus(taskId);

      if (!task) {
        return res.status(404).json({
          code: 404,
          msg: 'Task not found',
          data: null,
          error: {
            type: 'NOT_FOUND_ERROR',
            details: `Task ${taskId} does not exist`
          }
        });
      }

      // 构建响应数据
      const responseData = {
        taskId: task.taskId,
        status: task.status,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt
      };

      // 根据状态添加额外信息
      if (task.status === 'completed' && task.imageUrl) {
        responseData.imageUrl = task.imageUrl;
        responseData.fileName = task.fileName;
      }

      if (task.status === 'failed' && task.error) {
        responseData.error = task.error;
      }

      res.json({
        code: 200,
        msg: 'success',
        data: responseData
      });

    } catch (error) {
      logger.error('Failed to get task status', {
        error: error.message,
        taskId: req.params.taskId
      });

      res.status(500).json({
        code: 500,
        msg: 'Failed to get task status',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus(req, res) {
    try {
      const queueStatus = this.taskManager.getQueueStatus();

      res.json({
        code: 200,
        msg: 'success',
        data: queueStatus
      });

    } catch (error) {
      logger.error('Failed to get queue status', { error: error.message });

      res.status(500).json({
        code: 500,
        msg: 'Failed to get queue status',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth(req, res) {
    try {
      const statistics = this.taskManager.getStatistics();
      
      // 测试OSS连接（如果配置了）
      let ossStatus = 'not_configured';
      let ossError = null;
      if (this.ossClient) {
        try {
          await this.ossClient.testConnection();
          ossStatus = 'healthy';
        } catch (error) {
          ossStatus = 'error';
          ossError = error.message;
        }
      }

      // 检查系统整体健康状态
      // OSS错误不应该影响整体健康状态，因为OSS是可选的
      const isHealthy = statistics.pendingTasks < 1000;
      const statusCode = isHealthy ? 200 : 503;

      res.status(statusCode).json({
        code: statusCode,
        msg: isHealthy ? 'System is healthy' : 'System has issues',
        data: {
          status: isHealthy ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          version: require('../package.json').version,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          queueStatus: statistics,
          oss: {
            status: ossStatus,
            error: ossError
          },
          checks: {
            queue: statistics.pendingTasks < 1000 ? 'ok' : 'warning',
            memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning', // 500MB
            oss: ossStatus
          }
        }
      });

    } catch (error) {
      logger.error('Health check failed', { error: error.message });

      res.status(503).json({
        code: 503,
        msg: 'System unhealthy',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 获取系统指标（Prometheus格式）
   */
  async getSystemMetrics(req, res) {
    try {
      // 使用新的MetricsService生成Prometheus格式指标
      const metrics = this.taskManager.getPrometheusMetrics();

      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);

    } catch (error) {
      logger.error('Failed to get system metrics', { error: error.message });

      res.status(500).json({
        code: 500,
        msg: 'Failed to get system metrics',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 获取详细的性能指标（JSON格式）
   */
  async getPerformanceMetrics(req, res) {
    try {
      const metrics = this.taskManager.getMetrics();

      res.json({
        code: 200,
        msg: 'success',
        data: {
          ...metrics,
          server: {
            version: require('../package.json').version,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get performance metrics', { error: error.message });

      res.status(500).json({
        code: 500,
        msg: 'Failed to get performance metrics',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  setupLegacyRoutes() {
    // 保留原有的同步API以确保向后兼容性
    const legacyHandler = require('./legacy/syncHandler');

    this.app.get('/', legacyHandler);
    this.app.post('/', legacyHandler);
  }

  setupErrorHandling() {
    // 全局错误处理中间件
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        code: 500,
        msg: 'Internal server error',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    });
  }

  async start() {
    try {
      // 验证配置
      logger.info('Starting server with configuration', {
        port: config.getServerConfig().port,
        nodeEnv: config.getServerConfig().nodeEnv,
        ossRegion: config.getOSSConfig().region,
        ossBucket: config.getOSSConfig().bucket
      });

      // 测试OSS连接（如果配置了）
      if (this.ossClient) {
        try {
          await this.ossClient.testConnection();
          logger.info('OSS connection test successful');
        } catch (error) {
          logger.warn('OSS connection test failed', { error: error.message });
        }
      }

      const port = config.getServerConfig().port;

      this.server = this.app.listen(port, () => {
        logger.info(`Server started successfully on port ${port}`);
        console.log(`ECharts Export Server is running on port ${port}`);
        console.log(`Health check: http://localhost:${port}/health`);
      });

    } catch (error) {
      logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 获取清理服务状态
   */
  async getCleanupStatus(req, res) {
    try {
      const cleanupStatus = this.cleanupService.getStatus();

      res.json({
        code: 200,
        msg: 'success',
        data: cleanupStatus
      });

    } catch (error) {
      logger.error('Failed to get cleanup status', { error: error.message });

      res.status(500).json({
        code: 500,
        msg: 'Failed to get cleanup status',
        data: null,
        error: {
          type: 'SYSTEM_ERROR',
          details: error.message
        }
      });
    }
  }

  /**
   * 触发手动清理
   */
  async triggerManualCleanup(req, res) {
    try {
      logger.info('Manual cleanup triggered via API');
      
      const result = await this.cleanupService.manualCleanup();

      res.json({
        code: 200,
        msg: 'Manual cleanup completed',
        data: {
          cleanedTasks: result.cleanedTasks,
          deletedFiles: result.deletedFiles,
          errors: result.errors,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Manual cleanup failed', { error: error.message });

      res.status(500).json({
        code: 500,
        msg: 'Manual cleanup failed',
        data: null,
        error: {
          type: 'PROCESSING_ERROR',
          details: error.message
        }
      });
    }
  }

  async stop() {
    if (this.server) {
      // 停止清理服务
      if (this.cleanupService) {
        this.cleanupService.destroy();
      }
      
      // 停止任务管理器
      if (this.taskManager) {
        this.taskManager.destroy();
      }
      
      this.server.close();
      logger.info('Server stopped');
    }
  }
}

module.exports = App;