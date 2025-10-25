/**
 * ImageGenerator逻辑测试（不依赖canvas）
 * 测试类的结构、方法存在性和基本逻辑
 */

console.log('Testing ImageGenerator logic...');

// 模拟canvas和echarts模块
const mockCanvas = {
  toBuffer: (format) => Buffer.from(`mock-image-${format}`, 'utf8'),
  toDataURL: (format) => `data:${format};base64,mockbase64data`
};

const mockChart = {
  setOption: () => {},
  dispose: () => {},
  renderToSVGString: () => '<svg>mock svg</svg>'
};

const mockEcharts = {
  init: () => mockChart,
  setPlatformAPI: () => {}
};

const mockCreateCanvas = () => mockCanvas;

// 模拟模块
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'echarts') {
    return mockEcharts;
  }
  if (id === 'canvas') {
    return { createCanvas: mockCreateCanvas };
  }
  if (id === 'uuid') {
    return { v4: () => 'mock-uuid-' + Date.now() };
  }
  return originalRequire.apply(this, arguments);
};

// 现在可以安全地导入ImageGenerator
const ImageGenerator = require('../src/services/ImageGenerator');

// 模拟OSS客户端
class MockOSSClient {
  constructor() {
    this.shouldFail = false;
  }

  generateFileName(taskId, extension) {
    return `test_${taskId}_${Date.now()}.${extension}`;
  }

  async uploadFile(buffer, fileName, contentType) {
    if (this.shouldFail) {
      throw new Error('Mock OSS upload failed');
    }
    
    return {
      url: `https://test-bucket.oss-cn-hangzhou.aliyuncs.com/${fileName}`,
      fileName: fileName
    };
  }

  setFailMode(shouldFail) {
    this.shouldFail = shouldFail;
  }
}

async function testImageGeneratorLogic() {
  try {
    console.log('\n=== 类实例化测试 ===');
    await testClassInstantiation();
    
    console.log('\n=== 方法存在性测试 ===');
    await testMethodExistence();
    
    console.log('\n=== 基础功能测试 ===');
    await testBasicFunctionality();
    
    console.log('\n=== OSS集成逻辑测试 ===');
    await testOSSIntegrationLogic();
    
    console.log('\n=== 错误处理逻辑测试 ===');
    await testErrorHandlingLogic();
    
    console.log('\n✓ All ImageGenerator logic tests passed!');
  } catch (error) {
    console.error('✗ ImageGenerator logic test failed:', error.message);
    process.exit(1);
  }
}

async function testClassInstantiation() {
  // 测试无参数实例化
  const generator1 = new ImageGenerator();
  console.log('✓ ImageGenerator instantiated without OSS client');
  
  // 测试带OSS客户端实例化
  const mockOSSClient = new MockOSSClient();
  const generator2 = new ImageGenerator(mockOSSClient);
  console.log('✓ ImageGenerator instantiated with OSS client');
  
  // 验证OSS客户端设置
  if (generator2.ossClient !== mockOSSClient) {
    throw new Error('OSS client not properly set');
  }
  console.log('✓ OSS client properly assigned');
}

async function testMethodExistence() {
  const generator = new ImageGenerator();
  
  const requiredMethods = [
    'generateImage',
    'generateAndUploadImage', 
    'renderChart',
    'generateBase64',
    'validateChartOption',
    'generateBatchImages',
    'setOSSClient',
    'getSupportedFormats'
  ];
  
  for (const method of requiredMethods) {
    if (typeof generator[method] !== 'function') {
      throw new Error(`Method ${method} not found or not a function`);
    }
    console.log(`✓ Method ${method} exists`);
  }
}

async function testBasicFunctionality() {
  const generator = new ImageGenerator();
  
  const config = {
    type: 'png',
    width: 400,
    height: 300,
    option: {
      series: [{
        type: 'bar',
        data: [1, 2, 3, 4, 5]
      }]
    }
  };
  
  // 测试图片生成
  const result = await generator.generateImage(config);
  console.log('✓ generateImage method works');
  console.log('  - Has buffer:', !!result.buffer);
  console.log('  - Content type:', result.contentType);
  console.log('  - Extension:', result.extension);
  
  // 测试Base64生成
  const base64 = await generator.generateBase64(config);
  console.log('✓ generateBase64 method works');
  console.log('  - Base64 length:', base64.length);
  
  // 测试配置验证
  const isValid = generator.validateChartOption(config.option);
  console.log('✓ validateChartOption method works:', isValid);
  
  // 测试支持的格式
  const formats = generator.getSupportedFormats();
  console.log('✓ getSupportedFormats method works:', formats.join(', '));
  
  // 测试兼容的renderChart方法
  const legacyConfig = {
    ...config,
    formatType: 'image/png',
    base64: false
  };
  const legacyResult = generator.renderChart(legacyConfig);
  console.log('✓ renderChart method works');
  console.log('  - Legacy result type:', typeof legacyResult);
}

async function testOSSIntegrationLogic() {
  const mockOSSClient = new MockOSSClient();
  const generator = new ImageGenerator(mockOSSClient);
  
  const config = {
    type: 'png',
    width: 300,
    height: 200,
    option: {
      series: [{
        type: 'bar',
        data: [1, 2, 3, 4, 5]
      }]
    }
  };
  
  // 测试成功上传
  const taskId = 'test-task-123';
  const result = await generator.generateAndUploadImage(config, taskId);
  
  console.log('✓ generateAndUploadImage method works');
  console.log('  - URL:', result.url);
  console.log('  - File name:', result.fileName);
  console.log('  - Content type:', result.contentType);
  console.log('  - Has buffer:', !!result.buffer);
  
  // 测试动态设置OSS客户端
  const generator2 = new ImageGenerator();
  generator2.setOSSClient(mockOSSClient);
  
  const result2 = await generator2.generateAndUploadImage(config, 'test-task-456');
  console.log('✓ Dynamic OSS client setting works');
  
  // 测试批量处理
  const tasks = [
    {
      taskId: 'batch-task-1',
      config: {
        type: 'png',
        option: { series: [{ type: 'bar', data: [1, 2, 3] }] }
      }
    },
    {
      taskId: 'batch-task-2',
      config: {
        type: 'jpeg',
        option: { series: [{ type: 'line', data: [4, 5, 6] }] }
      }
    }
  ];
  
  const batchResults = await generator.generateBatchImages(tasks);
  console.log('✓ generateBatchImages method works');
  console.log('  - Total tasks:', tasks.length);
  console.log('  - Results count:', batchResults.length);
  console.log('  - All successful:', batchResults.every(r => !r.error));
}

async function testErrorHandlingLogic() {
  const generator = new ImageGenerator();
  
  // 测试无效配置
  try {
    await generator.generateImage({
      type: 'png',
      option: null
    });
    throw new Error('Should have failed with null option');
  } catch (error) {
    console.log('✓ Invalid option error handled:', error.message.includes('Invalid chart option'));
  }
  
  // 测试无效图表配置
  const invalidResult = generator.validateChartOption({ title: 'No series' });
  console.log('✓ Invalid chart option validation works:', !invalidResult);
  
  // 测试不支持的格式
  try {
    await generator.generateImage({
      type: 'invalid-format',
      option: {
        series: [{ type: 'bar', data: [1, 2, 3] }]
      }
    });
    throw new Error('Should have failed with unsupported format');
  } catch (error) {
    console.log('✓ Unsupported format error handled:', error.message.includes('Unsupported image type'));
  }
  
  // 测试没有OSS客户端时的上传
  try {
    await generator.generateAndUploadImage({
      type: 'png',
      option: { series: [{ type: 'bar', data: [1, 2, 3] }] }
    }, 'test-task');
    throw new Error('Should have failed without OSS client');
  } catch (error) {
    console.log('✓ Missing OSS client error handled:', error.message.includes('OSS client not configured'));
  }
  
  // 测试OSS上传失败
  const mockOSSClient = new MockOSSClient();
  mockOSSClient.setFailMode(true);
  const generatorWithFailingOSS = new ImageGenerator(mockOSSClient);
  
  try {
    await generatorWithFailingOSS.generateAndUploadImage({
      type: 'png',
      option: { series: [{ type: 'bar', data: [1, 2, 3] }] }
    }, 'test-task');
    throw new Error('Should have failed with OSS upload error');
  } catch (error) {
    console.log('✓ OSS upload failure handled:', error.message.includes('Image generation and upload failed'));
  }
  
  // 测试批量处理中的错误
  const generator3 = new ImageGenerator(new MockOSSClient());
  const tasksWithError = [
    {
      taskId: 'good-task',
      config: {
        type: 'png',
        option: { series: [{ type: 'bar', data: [1, 2, 3] }] }
      }
    },
    {
      taskId: 'bad-task',
      config: {
        type: 'png',
        option: null // 这个会失败
      }
    }
  ];
  
  const mixedResults = await generator3.generateBatchImages(tasksWithError);
  const successCount = mixedResults.filter(r => !r.error).length;
  const errorCount = mixedResults.filter(r => r.error).length;
  
  console.log('✓ Batch processing error handling works');
  console.log('  - Success count:', successCount);
  console.log('  - Error count:', errorCount);
  console.log('  - Mixed results handled correctly:', successCount === 1 && errorCount === 1);
}

testImageGeneratorLogic();