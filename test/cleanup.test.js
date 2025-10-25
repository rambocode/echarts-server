/**
 * 清理功能测试
 * 测试过期任务的自动清理和OSS文件的同步删除
 */

console.log('Testing Cleanup functionality...');

// Mock dependencies
const mockTasks = new Map();
const mockOSSFiles = new Set();

// Mock Task class
class MockTask {
  constructor(config, createdAt = new Date()) {
    this.taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.status = 'pending';
    this.config = config;
    this.imageUrl = null;
    this.fileName = null;
    this.createdAt = createdAt;
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.retryCount = 0;
  }

  start() {
    this.status = 'processing';
    this.startedAt = new Date();
  }

  complete(imageUrl, fileName) {
    this.status = 'completed';
    this.imageUrl = imageUrl;
    this.fileName = fileName;
    this.completedAt = new Date();
    this.error = null;
  }

  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.completedAt = new Date();
  }

  isExpired(retentionDays) {
    const now = new Date();
    const elapsedDays = (now - this.createdAt) / (1000 * 60 * 60 * 24);
    return elapsedDays > retentionDays;
  }

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
}

// Mock TaskQueue
class MockTaskQueue {
  constructor() {
    this.completedTasks = new Map();
  }

  cleanupExpiredTasks(retentionDays) {
    const expiredTasks = [];
    
    for (const [taskId, task] of this.completedTasks) {
      if (task.isExpired(retentionDays)) {
        this.completedTasks.delete(taskId);
        expiredTasks.push(task);
      }
    }
    
    return expiredTasks;
  }

  addCompletedTask(task) {
    this.completedTasks.set(task.taskId, task);
  }

  getQueueStatus() {
    return {
      pendingTasks: 0,
      processingTasks: 0,
      completedTasks: this.completedTasks.size,
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0
    };
  }
}

// Mock OSSClient
class MockOSSClient {
  constructor() {
    this.deletedFiles = [];
    this.shouldFailDelete = false;
    this.failedFiles = [];
  }

  async deleteFile(fileName) {
    if (this.shouldFailDelete) {
      throw new Error(`Failed to delete ${fileName}`);
    }
    
    this.deletedFiles.push(fileName);
    mockOSSFiles.delete(fileName);
  }

  async deleteFiles(fileNames) {
    const deletePromises = fileNames.map(fileName => this.deleteFile(fileName));
    await Promise.all(deletePromises);
  }

  setFailMode(shouldFail) {
    this.shouldFailDelete = shouldFail;
  }

  getDeletedFiles() {
    return [...this.deletedFiles];
  }

  reset() {
    this.deletedFiles = [];
    this.shouldFailDelete = false;
    this.failedFiles = [];
  }
}

// Mock TaskManager
class MockTaskManager {
  constructor(ossClient = null) {
    this.taskQueue = new MockTaskQueue();
    this.ossClient = ossClient;
    this.options = {
      taskRetentionDays: 7
    };
  }

  async cleanupExpiredTasks() {
    const startTime = Date.now();
    const result = {
      cleanedTasks: 0,
      deletedFiles: 0,
      errors: []
    };

    try {
      // 清理队列中的过期任务
      const expiredTasks = this.taskQueue.cleanupExpiredTasks(this.options.taskRetentionDays);
      result.cleanedTasks = expiredTasks.length;
      
      // 如果配置了OSS客户端，删除对应的图片文件
      if (this.ossClient && expiredTasks.length > 0) {
        const filesToDelete = expiredTasks
          .filter(task => task.fileName && task.status === 'completed')
          .map(task => task.fileName);
        
        if (filesToDelete.length > 0) {
          const deleteResults = await this.deleteOSSFilesWithErrorHandling(filesToDelete);
          result.deletedFiles = deleteResults.successful;
          result.errors = deleteResults.errors;
        }
      }
      
      return result;
      
    } catch (error) {
      result.errors.push({
        type: 'cleanup_error',
        message: error.message
      });
      
      return result;
    }
  }

  async deleteOSSFilesWithErrorHandling(fileNames) {
    const result = {
      successful: 0,
      errors: []
    };
    
    for (const fileName of fileNames) {
      try {
        await this.ossClient.deleteFile(fileName);
        result.successful++;
      } catch (error) {
        result.errors.push({
          fileName,
          error: error.message
        });
      }
    }
    
    return result;
  }

  getQueueStatus() {
    return this.taskQueue.getQueueStatus();
  }
}

// Mock CleanupService
class MockCleanupService {
  constructor(taskManager, options = {}) {
    this.taskManager = taskManager;
    this.options = {
      cleanupInterval: options.cleanupInterval || 24 * 60 * 60 * 1000,
      taskRetentionDays: options.taskRetentionDays || 7,
      autoStart: options.autoStart !== false,
      ...options
    };
    
    this.cleanupStats = {
      totalRuns: 0,
      totalTasksCleaned: 0,
      totalFilesCleaned: 0,
      totalErrors: 0,
      lastRunDuration: 0
    };
    
    this.isRunning = false;
    this.lastCleanupTime = null;
  }

  async manualCleanup() {
    const startTime = Date.now();
    const result = await this.taskManager.cleanupExpiredTasks();
    const duration = Date.now() - startTime;
    
    // 更新统计信息
    this.cleanupStats.totalTasksCleaned += result.cleanedTasks;
    this.cleanupStats.totalFilesCleaned += result.deletedFiles;
    this.cleanupStats.totalErrors += result.errors.length;
    this.lastCleanupTime = new Date();
    
    return result;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCleanupTime: this.lastCleanupTime ? this.lastCleanupTime.toISOString() : null,
      nextCleanupTime: null,
      stats: { ...this.cleanupStats },
      options: {
        cleanupInterval: this.options.cleanupInterval,
        taskRetentionDays: this.options.taskRetentionDays
      }
    };
  }
}

async function runTests() {
  try {
    console.log('Starting cleanup functionality tests...');
    
    // 测试基本清理功能
    await testBasicCleanup();
    
    // 测试过期任务清理
    await testExpiredTasksCleanup();
    
    // 测试OSS文件删除
    await testOSSFilesDeletion();
    
    // 测试错误处理
    await testErrorHandling();
    
    // 测试清理服务
    await testCleanupService();
    
    console.log('✓ All cleanup functionality tests passed!');
  } catch (error) {
    console.error('✗ Cleanup functionality test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function testBasicCleanup() {
  console.log('Testing basic cleanup functionality...');
  
  const taskManager = new MockTaskManager();
  
  // 创建一些测试任务
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10天前
  const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3天前
  
  const oldTask = new MockTask({ type: 'png' }, oldDate);
  oldTask.complete('https://example.com/old.png', 'old.png');
  
  const recentTask = new MockTask({ type: 'png' }, recentDate);
  recentTask.complete('https://example.com/recent.png', 'recent.png');
  
  taskManager.taskQueue.addCompletedTask(oldTask);
  taskManager.taskQueue.addCompletedTask(recentTask);
  
  // 执行清理
  const result = await taskManager.cleanupExpiredTasks();
  
  // 验证结果
  if (result.cleanedTasks !== 1) {
    throw new Error(`Expected 1 cleaned task, got ${result.cleanedTasks}`);
  }
  
  // 验证只有过期任务被清理
  const remainingTasks = taskManager.getQueueStatus().completedTasks;
  if (remainingTasks !== 1) {
    throw new Error(`Expected 1 remaining task, got ${remainingTasks}`);
  }
  
  console.log('✓ Basic cleanup functionality works correctly');
}

async function testExpiredTasksCleanup() {
  console.log('Testing expired tasks cleanup...');
  
  const taskManager = new MockTaskManager();
  
  // 创建不同状态和时间的任务
  const tasks = [
    // 过期的已完成任务
    { task: new MockTask({ type: 'png' }, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), shouldClean: true },
    // 过期的失败任务
    { task: new MockTask({ type: 'png' }, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)), shouldClean: true },
    // 未过期的已完成任务
    { task: new MockTask({ type: 'png' }, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), shouldClean: false },
    // 未过期的失败任务
    { task: new MockTask({ type: 'png' }, new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)), shouldClean: false }
  ];
  
  // 设置任务状态
  tasks[0].task.complete('https://example.com/1.png', 'file1.png');
  tasks[1].task.fail('Test error');
  tasks[2].task.complete('https://example.com/2.png', 'file2.png');
  tasks[3].task.fail('Test error');
  
  // 添加到队列
  tasks.forEach(({ task }) => {
    taskManager.taskQueue.addCompletedTask(task);
  });
  
  const initialCount = taskManager.getQueueStatus().completedTasks;
  console.log(`Initial task count: ${initialCount}`);
  
  // 执行清理
  const result = await taskManager.cleanupExpiredTasks();
  
  // 验证清理结果
  const expectedCleanedCount = tasks.filter(t => t.shouldClean).length;
  if (result.cleanedTasks !== expectedCleanedCount) {
    throw new Error(`Expected ${expectedCleanedCount} cleaned tasks, got ${result.cleanedTasks}`);
  }
  
  const remainingCount = taskManager.getQueueStatus().completedTasks;
  const expectedRemainingCount = tasks.filter(t => !t.shouldClean).length;
  if (remainingCount !== expectedRemainingCount) {
    throw new Error(`Expected ${expectedRemainingCount} remaining tasks, got ${remainingCount}`);
  }
  
  console.log(`✓ Cleaned ${result.cleanedTasks} expired tasks, ${remainingCount} tasks remaining`);
}

async function testOSSFilesDeletion() {
  console.log('Testing OSS files deletion...');
  
  const mockOSSClient = new MockOSSClient();
  const taskManager = new MockTaskManager(mockOSSClient);
  
  // 创建过期的已完成任务（有OSS文件）
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  
  const tasksWithFiles = [
    { fileName: 'charts/file1.png', url: 'https://example.com/file1.png' },
    { fileName: 'charts/file2.png', url: 'https://example.com/file2.png' },
    { fileName: 'charts/file3.png', url: 'https://example.com/file3.png' }
  ];
  
  tasksWithFiles.forEach(({ fileName, url }) => {
    const task = new MockTask({ type: 'png' }, oldDate);
    task.complete(url, fileName);
    taskManager.taskQueue.addCompletedTask(task);
    mockOSSFiles.add(fileName);
  });
  
  // 创建过期的失败任务（无OSS文件）
  const failedTask = new MockTask({ type: 'png' }, oldDate);
  failedTask.fail('Test error');
  taskManager.taskQueue.addCompletedTask(failedTask);
  
  // 执行清理
  const result = await taskManager.cleanupExpiredTasks();
  
  // 验证结果
  if (result.cleanedTasks !== 4) {
    throw new Error(`Expected 4 cleaned tasks, got ${result.cleanedTasks}`);
  }
  
  if (result.deletedFiles !== 3) {
    throw new Error(`Expected 3 deleted files, got ${result.deletedFiles}`);
  }
  
  // 验证OSS文件确实被删除
  const deletedFiles = mockOSSClient.getDeletedFiles();
  if (deletedFiles.length !== 3) {
    throw new Error(`Expected 3 files deleted from OSS, got ${deletedFiles.length}`);
  }
  
  tasksWithFiles.forEach(({ fileName }) => {
    if (!deletedFiles.includes(fileName)) {
      throw new Error(`File ${fileName} was not deleted from OSS`);
    }
  });
  
  console.log(`✓ Successfully deleted ${result.deletedFiles} OSS files during cleanup`);
}

async function testErrorHandling() {
  console.log('Testing error handling during cleanup...');
  
  const mockOSSClient = new MockOSSClient();
  mockOSSClient.setFailMode(true); // 设置删除失败模式
  
  const taskManager = new MockTaskManager(mockOSSClient);
  
  // 创建过期任务
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  
  const task1 = new MockTask({ type: 'png' }, oldDate);
  task1.complete('https://example.com/success.png', 'success.png');
  
  const task2 = new MockTask({ type: 'png' }, oldDate);
  task2.complete('https://example.com/fail.png', 'fail.png');
  
  taskManager.taskQueue.addCompletedTask(task1);
  taskManager.taskQueue.addCompletedTask(task2);
  
  // 执行清理
  const result = await taskManager.cleanupExpiredTasks();
  
  // 验证任务被清理但文件删除失败
  if (result.cleanedTasks !== 2) {
    throw new Error(`Expected 2 cleaned tasks, got ${result.cleanedTasks}`);
  }
  
  if (result.deletedFiles !== 0) {
    throw new Error(`Expected 0 successfully deleted files, got ${result.deletedFiles}`);
  }
  
  if (result.errors.length !== 2) {
    throw new Error(`Expected 2 errors, got ${result.errors.length}`);
  }
  
  // 验证错误信息
  result.errors.forEach(error => {
    if (!error.fileName || !error.error) {
      throw new Error('Error object should contain fileName and error message');
    }
  });
  
  console.log(`✓ Error handling works correctly: ${result.errors.length} errors recorded`);
}

async function testCleanupService() {
  console.log('Testing CleanupService...');
  
  const mockOSSClient = new MockOSSClient();
  const taskManager = new MockTaskManager(mockOSSClient);
  const cleanupService = new MockCleanupService(taskManager, {
    taskRetentionDays: 7,
    autoStart: false
  });
  
  // 创建测试数据
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const task = new MockTask({ type: 'png' }, oldDate);
  task.complete('https://example.com/test.png', 'test.png');
  taskManager.taskQueue.addCompletedTask(task);
  
  // 执行手动清理
  const result = await cleanupService.manualCleanup();
  
  // 验证结果
  if (result.cleanedTasks !== 1) {
    throw new Error(`Expected 1 cleaned task, got ${result.cleanedTasks}`);
  }
  
  if (result.deletedFiles !== 1) {
    throw new Error(`Expected 1 deleted file, got ${result.deletedFiles}`);
  }
  
  // 验证统计信息更新
  const status = cleanupService.getStatus();
  if (status.stats.totalTasksCleaned !== 1) {
    throw new Error(`Expected 1 total cleaned task in stats, got ${status.stats.totalTasksCleaned}`);
  }
  
  if (status.stats.totalFilesCleaned !== 1) {
    throw new Error(`Expected 1 total cleaned file in stats, got ${status.stats.totalFilesCleaned}`);
  }
  
  if (!status.lastCleanupTime) {
    throw new Error('Last cleanup time should be set');
  }
  
  console.log('✓ CleanupService works correctly');
  console.log(`✓ Stats: ${status.stats.totalTasksCleaned} tasks, ${status.stats.totalFilesCleaned} files cleaned`);
}

// 运行测试
runTests();