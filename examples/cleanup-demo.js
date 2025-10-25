/**
 * 清理功能演示
 * 展示如何使用自动清理和维护功能
 */

const TaskManager = require('../src/services/TaskManager');
const CleanupService = require('../src/services/CleanupService');

// Mock ImageGenerator for demo
class DemoImageGenerator {
  async generateAndUploadImage(config, taskId) {
    // 模拟图片生成和上传
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      url: `https://demo-bucket.oss-cn-hangzhou.aliyuncs.com/charts/${taskId}.png`,
      fileName: `charts/${taskId}.png`
    };
  }
}

// Mock OSSClient for demo
class DemoOSSClient {
  constructor() {
    this.files = new Set();
  }

  async deleteFile(fileName) {
    console.log(`  🗑️  Deleting OSS file: ${fileName}`);
    this.files.delete(fileName);
  }

  async deleteFiles(fileNames) {
    for (const fileName of fileNames) {
      await this.deleteFile(fileName);
    }
  }

  // 模拟文件存在
  addFile(fileName) {
    this.files.add(fileName);
  }
}

async function runDemo() {
  console.log('🧹 清理功能演示');
  console.log('================\n');

  try {
    // 1. 创建服务实例
    console.log('1️⃣ 初始化服务...');
    const imageGenerator = new DemoImageGenerator();
    const ossClient = new DemoOSSClient();
    
    const taskManager = new TaskManager(imageGenerator, ossClient, {
      maxConcurrent: 5,
      taskTimeout: 300,
      retryAttempts: 3,
      taskRetentionDays: 3, // 3天保留期（演示用）
      autoStart: false
    });

    const cleanupService = new CleanupService(taskManager, {
      taskRetentionDays: 3,
      cleanupHour: 2, // 凌晨2点清理
      autoStart: false // 演示中不自动启动
    });

    console.log('✅ 服务初始化完成\n');

    // 2. 创建一些测试任务
    console.log('2️⃣ 创建测试任务...');
    const configs = [
      { type: 'png', width: 600, height: 400, option: { title: { text: '销售报表' } } },
      { type: 'png', width: 800, height: 600, option: { title: { text: '用户分析' } } },
      { type: 'png', width: 1200, height: 800, option: { title: { text: '财务图表' } } }
    ];

    const tasks = [];
    for (let i = 0; i < configs.length; i++) {
      const task = await taskManager.createTask(configs[i]);
      tasks.push(task);
      console.log(`  📊 创建任务 ${i + 1}: ${task.taskId}`);
    }

    // 等待任务完成
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ 所有任务已完成\n');

    // 3. 显示当前状态
    console.log('3️⃣ 当前系统状态:');
    const queueStatus = taskManager.getQueueStatus();
    console.log(`  📋 已完成任务: ${queueStatus.completedTasks}`);
    console.log(`  📈 总处理数: ${queueStatus.totalProcessed}`);
    
    const cleanupStatus = cleanupService.getStatus();
    console.log(`  🧹 清理统计: ${cleanupStatus.stats.totalTasksCleaned} 任务, ${cleanupStatus.stats.totalFilesCleaned} 文件`);
    console.log('');

    // 4. 模拟任务过期
    console.log('4️⃣ 模拟任务过期（修改创建时间为5天前）...');
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    for (const task of tasks) {
      const completedTask = taskManager.getTaskStatus(task.taskId);
      if (completedTask) {
        completedTask.createdAt = oldDate;
        // 模拟OSS文件存在
        if (completedTask.fileName) {
          ossClient.addFile(completedTask.fileName);
        }
      }
    }
    console.log('✅ 任务已标记为过期\n');

    // 5. 执行手动清理
    console.log('5️⃣ 执行手动清理...');
    const cleanupResult = await cleanupService.manualCleanup();
    
    console.log('📊 清理结果:');
    console.log(`  🗂️  清理任务数: ${cleanupResult.cleanedTasks}`);
    console.log(`  🗑️  删除文件数: ${cleanupResult.deletedFiles}`);
    console.log(`  ❌ 错误数量: ${cleanupResult.errors.length}`);
    
    if (cleanupResult.errors.length > 0) {
      console.log('  错误详情:');
      cleanupResult.errors.forEach(error => {
        console.log(`    - ${error.fileName}: ${error.error}`);
      });
    }
    console.log('');

    // 6. 显示清理后状态
    console.log('6️⃣ 清理后系统状态:');
    const finalQueueStatus = taskManager.getQueueStatus();
    console.log(`  📋 剩余已完成任务: ${finalQueueStatus.completedTasks}`);
    
    const finalCleanupStatus = cleanupService.getStatus();
    console.log(`  🧹 累计清理统计: ${finalCleanupStatus.stats.totalTasksCleaned} 任务, ${finalCleanupStatus.stats.totalFilesCleaned} 文件`);
    console.log(`  ⏰ 上次清理时间: ${finalCleanupStatus.lastCleanupTime}`);
    console.log('');

    // 7. 演示定时清理配置
    console.log('7️⃣ 清理服务配置:');
    console.log(`  ⏰ 清理时间: 每天凌晨 ${cleanupStatus.options.cleanupHour} 点`);
    console.log(`  📅 任务保留期: ${cleanupStatus.options.taskRetentionDays} 天`);
    console.log(`  🔄 清理间隔: ${Math.round(cleanupStatus.options.cleanupInterval / (1000 * 60 * 60))} 小时`);
    console.log('');

    // 8. API端点演示
    console.log('8️⃣ 可用的API端点:');
    console.log('  GET  /api/system/cleanup-status    - 查询清理服务状态');
    console.log('  POST /api/system/cleanup/manual    - 触发手动清理');
    console.log('  GET  /api/system/queue-status      - 查询队列状态');
    console.log('');

    console.log('✅ 清理功能演示完成！');
    console.log('');
    console.log('💡 提示:');
    console.log('  - 清理服务会自动在配置的时间运行');
    console.log('  - 可以通过API手动触发清理');
    console.log('  - 清理操作会删除过期任务和对应的OSS文件');
    console.log('  - 所有清理操作都有详细的日志记录');

    // 清理资源
    taskManager.destroy();
    cleanupService.destroy();

  } catch (error) {
    console.error('❌ 演示失败:', error.message);
    process.exit(1);
  }
}

// 运行演示
if (require.main === module) {
  runDemo();
}

module.exports = { runDemo };