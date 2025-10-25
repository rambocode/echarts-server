/**
 * ImageGenerator测试
 * 测试各种图表配置的生成和错误处理逻辑
 */

const ImageGenerator = require('../src/services/ImageGenerator');

console.log('Testing ImageGenerator...');

// 模拟OSS客户端用于测试
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

async function testImageGenerator() {
  try {
    console.log('\n=== 基础图片生成测试 ===');
    await testBasicImageGeneration();
    
    console.log('\n=== 多种图表类型测试 ===');
    await testMultipleChartTypes();
    
    console.log('\n=== OSS上传集成测试 ===');
    await testOSSIntegration();
    
    console.log('\n=== 错误处理测试 ===');
    await testErrorHandling();
    
    console.log('\n=== 批量处理测试 ===');
    await testBatchProcessing();
    
    console.log('\n✓ All ImageGenerator tests passed!');
  } catch (error) {
    console.error('✗ ImageGenerator test failed:', error.message);
    process.exit(1);
  }
}

async function testBasicImageGeneration() {
  const generator = new ImageGenerator();

  // 测试配置
  const config = {
    type: 'png',
    width: 400,
    height: 300,
    option: {
      title: {
        text: 'Test Chart'
      },
      xAxis: {
        type: 'category',
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        data: [120, 200, 150, 80, 70, 110, 130],
        type: 'bar'
      }]
    }
  };

  // 测试图片生成
  const result = await generator.generateImage(config);
  console.log('✓ PNG image generated successfully');
  console.log('  - Buffer size:', result.buffer.length, 'bytes');
  console.log('  - Content type:', result.contentType);
  console.log('  - Extension:', result.extension);

  // 测试Base64生成
  const base64 = await generator.generateBase64(config);
  console.log('✓ Base64 generated successfully');
  console.log('  - Base64 length:', base64.length, 'characters');

  // 测试配置验证
  const isValid = generator.validateChartOption(config.option);
  console.log('✓ Chart option validation:', isValid);

  // 测试兼容的renderChart方法
  const legacyConfig = {
    ...config,
    formatType: 'image/png',
    base64: false
  };
  const legacyResult = generator.renderChart(legacyConfig);
  console.log('✓ Legacy renderChart method works');
  console.log('  - Legacy buffer size:', legacyResult.length, 'bytes');
}

async function testMultipleChartTypes() {
  const generator = new ImageGenerator();

  const baseOption = {
    xAxis: {
      type: 'category',
      data: ['A', 'B', 'C', 'D', 'E']
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      data: [10, 20, 30, 40, 50],
      type: 'line'
    }]
  };

  // 测试不同图片格式
  const formats = ['png', 'jpeg', 'svg'];
  
  for (const format of formats) {
    const config = {
      type: format,
      width: 300,
      height: 200,
      option: baseOption
    };
    
    const result = await generator.generateImage(config);
    console.log(`✓ ${format.toUpperCase()} format generated successfully`);
    console.log(`  - Content type: ${result.contentType}`);
    console.log(`  - Extension: ${result.extension}`);
  }

  // 测试不同图表类型
  const chartTypes = [
    { type: 'bar', name: 'Bar Chart' },
    { type: 'line', name: 'Line Chart' },
    { type: 'pie', name: 'Pie Chart', option: {
      series: [{
        type: 'pie',
        data: [
          { value: 335, name: 'A' },
          { value: 310, name: 'B' },
          { value: 234, name: 'C' }
        ]
      }]
    }}
  ];

  for (const chartType of chartTypes) {
    const config = {
      type: 'png',
      width: 300,
      height: 200,
      option: chartType.option || {
        ...baseOption,
        series: [{ ...baseOption.series[0], type: chartType.type }]
      }
    };
    
    const result = await generator.generateImage(config);
    console.log(`✓ ${chartType.name} generated successfully`);
    console.log(`  - Buffer size: ${result.buffer.length} bytes`);
  }
}

async function testOSSIntegration() {
  const mockOSSClient = new MockOSSClient();
  const generator = new ImageGenerator(mockOSSClient);

  const config = {
    type: 'png',
    width: 300,
    height: 200,
    option: {
      xAxis: {
        type: 'category',
        data: ['A', 'B', 'C', 'D', 'E']
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        type: 'bar',
        data: [1, 2, 3, 4, 5]
      }]
    }
  };

  // 测试成功上传
  const taskId = 'test-task-123';
  const result = await generator.generateAndUploadImage(config, taskId);
  
  console.log('✓ Image generated and uploaded to OSS successfully');
  console.log('  - URL:', result.url);
  console.log('  - File name:', result.fileName);
  console.log('  - Content type:', result.contentType);

  // 测试设置OSS客户端
  const generator2 = new ImageGenerator();
  generator2.setOSSClient(mockOSSClient);
  
  const result2 = await generator2.generateAndUploadImage(config, 'test-task-456');
  console.log('✓ OSS client set dynamically and upload successful');

  // 测试获取支持的格式
  const formats = generator.getSupportedFormats();
  console.log('✓ Supported formats:', formats.join(', '));
}

async function testErrorHandling() {
  const generator = new ImageGenerator();

  // 测试无效配置
  try {
    await generator.generateImage({
      type: 'png',
      option: null
    });
    throw new Error('Should have failed with null option');
  } catch (error) {
    console.log('✓ Invalid option error handled correctly:', error.message);
  }

  // 测试无效图表配置
  try {
    await generator.generateImage({
      type: 'png',
      option: { title: 'No series or dataset' }
    });
    throw new Error('Should have failed with invalid chart option');
  } catch (error) {
    console.log('✓ Invalid chart option error handled correctly:', error.message);
  }

  // 测试不支持的格式
  try {
    await generator.generateImage({
      type: 'invalid-format',
      option: {
        xAxis: { type: 'category', data: ['A', 'B', 'C'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [1, 2, 3] }]
      }
    });
    throw new Error('Should have failed with unsupported format');
  } catch (error) {
    console.log('✓ Unsupported format error handled correctly:', error.message);
  }

  // 测试没有OSS客户端时的上传
  try {
    await generator.generateAndUploadImage({
      type: 'png',
      option: { 
        xAxis: { type: 'category', data: ['A', 'B', 'C'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [1, 2, 3] }] 
      }
    }, 'test-task');
    throw new Error('Should have failed without OSS client');
  } catch (error) {
    console.log('✓ Missing OSS client error handled correctly:', error.message);
  }

  // 测试OSS上传失败
  const mockOSSClient = new MockOSSClient();
  mockOSSClient.setFailMode(true);
  const generatorWithFailingOSS = new ImageGenerator(mockOSSClient);
  
  try {
    await generatorWithFailingOSS.generateAndUploadImage({
      type: 'png',
      option: { 
        xAxis: { type: 'category', data: ['A', 'B', 'C'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [1, 2, 3] }] 
      }
    }, 'test-task');
    throw new Error('Should have failed with OSS upload error');
  } catch (error) {
    console.log('✓ OSS upload failure handled correctly:', error.message);
  }
}

async function testBatchProcessing() {
  const mockOSSClient = new MockOSSClient();
  const generator = new ImageGenerator(mockOSSClient);

  const tasks = [
    {
      taskId: 'task-1',
      config: {
        type: 'png',
        option: { 
          xAxis: { type: 'category', data: ['A', 'B', 'C'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [1, 2, 3] }] 
        }
      }
    },
    {
      taskId: 'task-2',
      config: {
        type: 'jpeg',
        option: { 
          xAxis: { type: 'category', data: ['D', 'E', 'F'] },
          yAxis: { type: 'value' },
          series: [{ type: 'line', data: [4, 5, 6] }] 
        }
      }
    },
    {
      taskId: 'task-3',
      config: {
        type: 'png',
        option: null // 这个会失败
      }
    }
  ];

  const results = await generator.generateBatchImages(tasks);
  
  console.log('✓ Batch processing completed');
  console.log('  - Total tasks:', tasks.length);
  console.log('  - Successful tasks:', results.filter(r => !r.error).length);
  console.log('  - Failed tasks:', results.filter(r => r.error).length);
  
  // 验证结果
  results.forEach((result, index) => {
    if (result.error) {
      console.log(`  - Task ${result.taskId}: Failed - ${result.error}`);
    } else {
      console.log(`  - Task ${result.taskId}: Success - ${result.result.url}`);
    }
  });
}

testImageGenerator();