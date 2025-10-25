/**
 * MetricsService 测试
 */

const MetricsService = require('../src/services/MetricsService');

describe('MetricsService', () => {
  let metricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  afterEach(() => {
    if (metricsService) {
      metricsService.destroy();
    }
  });

  test('应该正确记录任务创建', () => {
    const taskId = 'test-task-1';
    const config = { type: 'png', width: 600, height: 400 };

    metricsService.recordTaskCreated(taskId, config);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.tasks.created).toBe(1);
  });

  test('应该正确记录任务完成', () => {
    const taskId = 'test-task-1';
    const processingTime = 1500;
    const imageUrl = 'http://example.com/image.png';

    metricsService.recordTaskCompleted(taskId, processingTime, imageUrl);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.tasks.completed).toBe(1);
    expect(metrics.processingTimes.samples).toContain(processingTime);
  });

  test('应该正确记录任务失败', () => {
    const taskId = 'test-task-1';
    const error = 'Test error';

    metricsService.recordTaskFailed(taskId, error, false);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.tasks.failed).toBe(1);
    expect(metrics.tasks.timeout).toBe(0);
  });

  test('应该正确记录超时任务', () => {
    const taskId = 'test-task-1';
    const error = 'Task timeout';

    metricsService.recordTaskFailed(taskId, error, true);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.tasks.failed).toBe(1);
    expect(metrics.tasks.timeout).toBe(1);
  });

  test('应该正确更新队列状态', () => {
    metricsService.updateQueueStatus(5, 2);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.queue.currentPending).toBe(5);
    expect(metrics.queue.currentProcessing).toBe(2);
    expect(metrics.queue.maxPending).toBe(5);
    expect(metrics.queue.maxProcessing).toBe(2);

    // 更新更高的值
    metricsService.updateQueueStatus(8, 3);
    const updatedMetrics = metricsService.getAllMetrics();
    expect(updatedMetrics.queue.maxPending).toBe(8);
    expect(updatedMetrics.queue.maxProcessing).toBe(3);
  });

  test('应该正确记录OSS操作', () => {
    const fileName = 'test.png';
    const fileSize = 1024;
    const uploadTime = 500;

    metricsService.recordOSSUpload(fileName, fileSize, uploadTime, true);
    metricsService.recordOSSDelete(fileName, true);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.oss.uploads).toBe(1);
    expect(metrics.oss.uploadFailures).toBe(0);
    expect(metrics.oss.deletes).toBe(1);
    expect(metrics.oss.deleteFailures).toBe(0);
  });

  test('应该正确记录HTTP请求', () => {
    metricsService.recordHTTPRequest('POST', '/api/charts/generate', 200, 150);
    metricsService.recordHTTPRequest('GET', '/api/charts/status/123', 404, 50);
    metricsService.recordHTTPRequest('POST', '/api/charts/generate', 500, 200);

    const metrics = metricsService.getAllMetrics();
    expect(metrics.http.requests).toBe(3);
    expect(metrics.http.responses['2xx']).toBe(1);
    expect(metrics.http.responses['4xx']).toBe(1);
    expect(metrics.http.responses['5xx']).toBe(1);
  });

  test('应该生成有效的Prometheus格式指标', () => {
    // 添加一些测试数据
    metricsService.recordTaskCreated('test-1', { type: 'png' });
    metricsService.recordTaskCompleted('test-1', 1500, 'http://example.com/image.png');
    metricsService.updateQueueStatus(3, 1);

    const prometheusMetrics = metricsService.generatePrometheusMetrics();

    expect(prometheusMetrics).toContain('echarts_tasks_created_total 1');
    expect(prometheusMetrics).toContain('echarts_tasks_completed_total 1');
    expect(prometheusMetrics).toContain('echarts_queue_pending_tasks 3');
    expect(prometheusMetrics).toContain('echarts_queue_processing_tasks 1');
    expect(prometheusMetrics).toContain('# HELP');
    expect(prometheusMetrics).toContain('# TYPE');
  });

  test('应该正确计算处理时间统计', () => {
    const times = [100, 200, 300, 400, 500];
    
    times.forEach(time => {
      metricsService.addProcessingTime(time);
    });

    const metrics = metricsService.getAllMetrics();
    expect(metrics.processingTimes.min).toBe(100);
    expect(metrics.processingTimes.max).toBe(500);
    expect(metrics.processingTimes.avg).toBe(300);
    expect(metrics.processingTimes.p50).toBe(300);
  });

  test('应该限制样本数量', () => {
    // 添加超过限制的样本
    for (let i = 0; i < 1200; i++) {
      metricsService.addProcessingTime(i);
    }

    const metrics = metricsService.getAllMetrics();
    expect(metrics.processingTimes.samples.length).toBe(1000);
  });
});