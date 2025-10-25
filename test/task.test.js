/**
 * Task模型测试
 */

const Task = require('../src/models/Task');

console.log('Testing Task model...');

try {
  // 测试任务创建
  const config = {
    type: 'png',
    width: 600,
    height: 400,
    option: { title: { text: 'Test Chart' } }
  };

  const task = new Task(config);
  console.log('✓ Task created with ID:', task.taskId);
  console.log('✓ Initial status:', task.status);

  // 测试状态转换
  task.start();
  console.log('✓ Task started, status:', task.status);

  task.complete('https://example.com/image.png', 'test_image.png');
  console.log('✓ Task completed, status:', task.status);
  console.log('✓ Image URL:', task.imageUrl);

  // 测试JSON序列化
  const json = task.toJSON();
  console.log('✓ Task JSON:', JSON.stringify(json, null, 2));

  // 测试配置验证
  const validation = Task.validateConfig(config);
  console.log('✓ Config validation:', validation);

  // 测试无效配置
  const invalidValidation = Task.validateConfig({ invalid: true });
  console.log('✓ Invalid config validation:', invalidValidation);

  console.log('✓ All Task model tests passed!');
} catch (error) {
  console.error('✗ Task model test failed:', error.message);
  process.exit(1);
}