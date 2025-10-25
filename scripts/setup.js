#!/usr/bin/env node

/**
 * 项目设置脚本
 * 创建必要的配置文件和目录
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setup() {
  console.log('🚀 ECharts Export Server 设置向导\n');

  // 检查 .env 文件是否存在
  const envPath = path.join(__dirname, '../.env');
  const envExamplePath = path.join(__dirname, '../.env.example');

  if (fs.existsSync(envPath)) {
    const overwrite = await question('⚠️  .env 文件已存在，是否覆盖？(y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('✅ 保持现有配置文件');
      rl.close();
      return;
    }
  }

  console.log('📝 创建配置文件...\n');

  // 询问基本配置
  const port = await question('服务器端口 (默认: 3000): ') || '3000';
  const nodeEnv = await question('运行环境 (development/production, 默认: development): ') || 'development';

  // 询问是否配置OSS
  const useOSS = await question('是否配置阿里云OSS存储？(y/N): ');
  
  let ossConfig = {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: 'oss-cn-hangzhou',
    customDomain: '',
    pathPrefix: 'charts/'
  };

  if (useOSS.toLowerCase() === 'y') {
    console.log('\n🔧 配置OSS参数:');
    ossConfig.accessKeyId = await question('OSS Access Key ID: ');
    ossConfig.accessKeySecret = await question('OSS Access Key Secret: ');
    ossConfig.bucket = await question('OSS Bucket 名称: ');
    ossConfig.region = await question(`OSS 区域 (默认: ${ossConfig.region}): `) || ossConfig.region;
    ossConfig.customDomain = await question('自定义域名 (可选): ');
    ossConfig.pathPrefix = await question(`文件路径前缀 (默认: ${ossConfig.pathPrefix}): `) || ossConfig.pathPrefix;
  }

  // 询问队列配置
  console.log('\n⚙️  配置队列参数:');
  const maxConcurrent = await question('最大并发任务数 (默认: 10): ') || '10';
  const taskTimeout = await question('任务超时时间/秒 (默认: 300): ') || '300';
  const retentionDays = await question('任务保留天数 (默认: 7): ') || '7';

  // 生成 .env 文件内容
  const envContent = `# 服务器配置
PORT=${port}
NODE_ENV=${nodeEnv}
LOG_LEVEL=info

# OSS配置 ${useOSS.toLowerCase() === 'y' ? '(已配置)' : '(未配置)'}
OSS_ACCESS_KEY_ID=${ossConfig.accessKeyId}
OSS_ACCESS_KEY_SECRET=${ossConfig.accessKeySecret}
OSS_BUCKET=${ossConfig.bucket}
OSS_REGION=${ossConfig.region}
OSS_CUSTOM_DOMAIN=${ossConfig.customDomain}
OSS_PATH_PREFIX=${ossConfig.pathPrefix}

# 队列配置
QUEUE_MAX_CONCURRENT=${maxConcurrent}
QUEUE_TASK_TIMEOUT=${taskTimeout}
QUEUE_RETRY_ATTEMPTS=3
CLEANUP_INTERVAL_HOURS=24

# 存储配置
TASK_RETENTION_DAYS=${retentionDays}
`;

  // 写入 .env 文件
  fs.writeFileSync(envPath, envContent);

  // 创建必要的目录
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('📁 创建 logs 目录');
  }

  console.log('\n✅ 设置完成！');
  console.log('\n📋 下一步操作:');
  console.log('   1. 运行 `npm run validate-config` 验证配置');
  console.log('   2. 运行 `npm run dev` 启动开发服务器');
  console.log('   3. 运行 `npm start` 启动生产服务器');

  if (useOSS.toLowerCase() !== 'y') {
    console.log('\n💡 提示: 当前未配置OSS，图片将存储在本地');
    console.log('   如需使用OSS存储，请重新运行设置或手动编辑 .env 文件');
  }

  rl.close();
}

setup().catch(console.error);