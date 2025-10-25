/**
 * 配置管理器测试
 */

// 设置测试环境变量
process.env.OSS_ACCESS_KEY_ID = 'test_key_id';
process.env.OSS_ACCESS_KEY_SECRET = 'test_key_secret';
process.env.OSS_BUCKET = 'test_bucket';
process.env.PORT = '3001';

const config = require('../src/config');

console.log('Testing ConfigManager...');

try {
  // 测试基本配置获取
  const serverConfig = config.getServerConfig();
  console.log('✓ Server config:', serverConfig);

  const ossConfig = config.getOSSConfig();
  console.log('✓ OSS config:', ossConfig);

  const queueConfig = config.getQueueConfig();
  console.log('✓ Queue config:', queueConfig);

  // 测试路径获取
  const port = config.get('server.port');
  console.log('✓ Port from path:', port);

  console.log('✓ All configuration tests passed!');
} catch (error) {
  console.error('✗ Configuration test failed:', error.message);
  process.exit(1);
}