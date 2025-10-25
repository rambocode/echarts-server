#!/usr/bin/env node

/**
 * 健康检查脚本
 * 检查服务器状态和配置
 */

const http = require('http');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ConfigManager = require('../src/config');

async function healthCheck() {
  console.log('🏥 执行健康检查...\n');

  const port = ConfigManager.get('server.port');
  const host = 'localhost';

  // 检查服务器是否运行
  try {
    await checkServerHealth(host, port);
    console.log('✅ 服务器运行正常');
  } catch (error) {
    console.log('❌ 服务器未运行或无响应');
    console.log(`   错误: ${error.message}`);
    process.exit(1);
  }

  // 检查队列状态
  try {
    const queueStatus = await getQueueStatus(host, port);
    console.log('✅ 队列系统正常');
    console.log(`   - 等待任务: ${queueStatus.pendingTasks}`);
    console.log(`   - 处理中任务: ${queueStatus.processingTasks}`);
    console.log(`   - 总处理数: ${queueStatus.totalProcessed}`);
  } catch (error) {
    console.log('⚠️  队列状态检查失败');
    console.log(`   错误: ${error.message}`);
  }

  // 检查OSS连接
  if (ConfigManager.isOSSConfigured()) {
    console.log('✅ OSS配置已启用');
    // 这里可以添加OSS连接测试
  } else {
    console.log('ℹ️  OSS未配置，使用本地存储');
  }

  console.log('\n🎉 健康检查完成！');
}

function checkServerHealth(host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: host,
      port: port,
      path: '/api/system/queue-status',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('请求超时')));
    req.end();
  });
}

function getQueueStatus(host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: host,
      port: port,
      path: '/api/system/queue-status',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 200) {
            resolve(result.data);
          } else {
            reject(new Error(result.msg));
          }
        } catch (error) {
          reject(new Error('响应解析失败'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('请求超时')));
    req.end();
  });
}

healthCheck().catch(console.error);