#!/usr/bin/env node

/**
 * 配置验证脚本
 * 验证环境变量配置是否正确
 */

const path = require('path');
const fs = require('fs');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ConfigManager = require('../src/config');

console.log('🔍 验证配置...\n');

try {
  // 验证基本配置
  console.log('✅ 基本配置验证通过');
  console.log(`   - 端口: ${ConfigManager.get('server.port')}`);
  console.log(`   - 环境: ${ConfigManager.get('server.nodeEnv')}`);
  console.log(`   - 队列并发数: ${ConfigManager.get('queue.maxConcurrent')}`);
  console.log(`   - 任务超时: ${ConfigManager.get('queue.taskTimeout')}秒`);
  console.log(`   - 任务保留天数: ${ConfigManager.get('storage.taskRetentionDays')}天\n`);

  // 验证OSS配置
  if (ConfigManager.isOSSConfigured()) {
    console.log('✅ OSS配置验证通过');
    console.log(`   - 区域: ${ConfigManager.get('oss.region')}`);
    console.log(`   - 存储桶: ${ConfigManager.get('oss.bucket')}`);
    console.log(`   - 路径前缀: ${ConfigManager.get('oss.pathPrefix')}`);
    if (ConfigManager.get('oss.customDomain')) {
      console.log(`   - 自定义域名: ${ConfigManager.get('oss.customDomain')}`);
    }
  } else {
    console.log('⚠️  OSS配置未设置 - 将使用本地存储模式');
    console.log('   如需使用OSS存储，请设置以下环境变量:');
    console.log('   - OSS_ACCESS_KEY_ID');
    console.log('   - OSS_ACCESS_KEY_SECRET');
    console.log('   - OSS_BUCKET');
  }

  console.log('\n🎉 配置验证完成！');
  process.exit(0);

} catch (error) {
  console.error('❌ 配置验证失败:');
  console.error(`   ${error.message}\n`);
  
  console.log('💡 解决方案:');
  console.log('   1. 检查 .env 文件是否存在');
  console.log('   2. 确保所有必需的环境变量都已设置');
  console.log('   3. 运行 `npm run setup` 创建示例配置文件');
  
  process.exit(1);
}