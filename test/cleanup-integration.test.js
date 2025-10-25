/**
 * 清理功能集成测试
 * 测试真实的TaskManager和CleanupService集成
 */

console.log('Testing Cleanup Integration...');

// 导入真实的类
const TaskManager = require('../src/services/TaskManager');
const CleanupService = require('../src/services/CleanupService');
const Task = require('../src/models/Task');

// Mock ImageGenerator
class MockImageGenerator {
  async generateAndUploadImage(config, taskId) {
    return {
      url: `https://example.com/${taskId}.png`,
      fileName: `charts/${taskId}.png`
    };
  }
}

// Mock OSSClient
class MockOSSClient {
  constructor() {
    this.deletedFiles = [];
  }

  async deleteFile(fileName) {
    this.deletedFiles.push(fileName);
  }

  async deleteFiles(fileNames) {
    for (const fileName of fileNames) {
      await this.deleteFile(fileName);
    }
  }

  getDeletedFiles() {
    return [...this.deletedFiles];
  }
}

async function runIntegrationTest() {
  try {
    console.log('Starting cleanup integration test...');
    
    // 创建服务实例
    const mockImageGenerator = new MockImageGenerator();
    const mockOSSClient = new MockOSSClient();
    
    const taskManager = new TaskManager(mockImageGenerator, mockOSSClient, {
      maxConcurrent: 5,
      taskTimeout: 300,
      retryAttempts: 3,
      taskRetentionDays: 7,
      autoStart: false // 不自动启动处理
    });
    
    const cleanupService = new CleanupService(taskManager, {
      taskRetentionDays: 7,
      autoStart: false // 不自动启动定时清理
    });
    
    console.log('✓ Services created successfully');
    
    // 创建一些测试任务
    const configs = [
      { type: 'png', width: 600, height: 400, option: { title: { text: 'Chart 1' } } },
      { type: 'png', width: 800, height: 600, option: { title: { text: 'Chart 2' } } }
    ];
    
    const tasks = [];
    for (const config of configs) {
      const task = await taskManager.createTask(config);
      tasks.push(task);
    }
    
    console.log(`✓ Created ${tasks.length} tasks`);
    
    // 等待任务自动完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✓ Tasks completed automatically');
    
    // 模拟任务过期（修改创建时间）
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10天前
    for (const task of tasks) {
      const completedTask = taskManager.getTaskStatus(task.taskId);
      if (completedTask) {
        completedTask.createdAt = oldDate;
      }
    }
    
    console.log('✓ Tasks marked as expired');
    
    // 执行清理
    const cleanupResult = await cleanupService.manualCleanup();
    
    console.log('✓ Cleanup executed');
    console.log(`  - Cleaned tasks: ${cleanupResult.cleanedTasks}`);
    console.log(`  - Deleted files: ${cleanupResult.deletedFiles}`);
    console.log(`  - Errors: ${cleanupResult.errors.length}`);
    
    // 验证结果
    if (cleanupResult.cleanedTasks !== tasks.length) {
      throw new Error(`Expected ${tasks.length} cleaned tasks, got ${cleanupResult.cleanedTasks}`);
    }
    
    if (cleanupResult.deletedFiles !== tasks.length) {
      throw new Error(`Expected ${tasks.length} deleted files, got ${cleanupResult.deletedFiles}`);
    }
    
    // 验证OSS文件被删除
    const deletedFiles = mockOSSClient.getDeletedFiles();
    if (deletedFiles.length !== tasks.length) {
      throw new Error(`Expected ${tasks.length} files deleted from OSS, got ${deletedFiles.length}`);
    }
    
    // 验证任务不再存在
    for (const task of tasks) {
      const remainingTask = taskManager.getTaskStatus(task.taskId);
      if (remainingTask) {
        throw new Error(`Task ${task.taskId} should have been cleaned up`);
      }
    }
    
    // 验证清理服务状态
    const cleanupStatus = cleanupService.getStatus();
    if (cleanupStatus.stats.totalTasksCleaned !== tasks.length) {
      throw new Error(`Expected ${tasks.length} total cleaned tasks in stats`);
    }
    
    if (cleanupStatus.stats.totalFilesCleaned !== tasks.length) {
      throw new Error(`Expected ${tasks.length} total cleaned files in stats`);
    }
    
    console.log('✓ All verifications passed');
    console.log('✓ Cleanup integration test completed successfully!');
    
    // 清理资源
    taskManager.destroy();
    cleanupService.destroy();
    
  } catch (error) {
    console.error('✗ Cleanup integration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行集成测试
runIntegrationTest();