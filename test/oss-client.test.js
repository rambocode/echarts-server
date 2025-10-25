/**
 * OSS客户端测试
 * 测试文件上传、删除和URL生成功能
 * 模拟OSS错误情况的处理
 */

console.log('Testing OSSClient...');

// 模拟OSS SDK
class MockOSS {
  constructor(config) {
    this.config = config;
    this.shouldFail = false;
    this.failCount = 0;
    this.maxFails = 0;
  }

  // 设置失败模式
  setFailMode(shouldFail, maxFails = 1) {
    this.shouldFail = shouldFail;
    this.failCount = 0;
    this.maxFails = maxFails;
  }

  async put(fileName, buffer, options) {
    if (this.shouldFail && this.failCount < this.maxFails) {
      this.failCount++;
      throw new Error('Mock OSS upload error');
    }
    
    return {
      name: fileName,
      url: `https://${this.config.bucket}.${this.config.region}.aliyuncs.com/${fileName}`
    };
  }

  async delete(fileName) {
    if (this.shouldFail && this.failCount < this.maxFails) {
      this.failCount++;
      if (fileName === 'not-found.png') {
        const error = new Error('NoSuchKey');
        error.code = 'NoSuchKey';
        throw error;
      }
      throw new Error('Mock OSS delete error');
    }
  }

  async getBucketInfo() {
    if (this.shouldFail && this.failCount < this.maxFails) {
      this.failCount++;
      throw new Error('Mock OSS connection error');
    }
    
    return { bucket: this.config.bucket };
  }
}

// 创建全局mock实例
const mockOSS = new MockOSS({
  bucket: 'test-bucket',
  region: 'oss-cn-hangzhou'
});

// Mock ali-oss module
require.cache[require.resolve('ali-oss')] = {
  exports: function(config) {
    mockOSS.config = config;
    return mockOSS;
  }
};

// 现在导入OSSClient
const OSSClient = require('../src/services/OSSClient');

async function runTests() {
  try {
    // 测试配置
    const config = {
      accessKeyId: 'test_key',
      accessKeySecret: 'test_secret',
      bucket: 'test-bucket',
      region: 'oss-cn-hangzhou',
      pathPrefix: 'charts/',
      customDomain: 'cdn.example.com'
    };

    const ossClient = new OSSClient(config);
    console.log('✓ OSSClient created successfully');

    // 测试文件上传
    await testFileUpload(ossClient);
    
    // 测试文件删除
    await testFileDelete(ossClient);
    
    // 测试URL生成
    testUrlGeneration(ossClient);
    
    // 测试文件名生成
    testFileNameGeneration(ossClient);
    
    // 测试连接测试
    await testConnection(ossClient);
    
    // 测试重试机制
    await testRetryMechanism(ossClient);
    
    // 测试批量操作
    await testBatchOperations(ossClient);

    console.log('✓ All OSSClient tests passed!');
  } catch (error) {
    console.error('✗ OSSClient test failed:', error.message);
    process.exit(1);
  }
}

async function testFileUpload(ossClient) {
  console.log('Testing file upload...');
  
  const buffer = Buffer.from('test image data');
  const fileName = 'test-image.png';
  const contentType = 'image/png';
  
  mockOSS.setFailMode(false);
  const result = await ossClient.uploadFile(buffer, fileName, contentType);
  
  console.log('✓ File uploaded successfully:', result);
  
  if (!result.url || !result.fileName) {
    throw new Error('Upload result missing required fields');
  }
  
  if (!result.fileName.includes('charts/')) {
    throw new Error('Path prefix not applied correctly');
  }
}

async function testFileDelete(ossClient) {
  console.log('Testing file delete...');
  
  mockOSS.setFailMode(false);
  await ossClient.deleteFile('charts/test-image.png');
  console.log('✓ File deleted successfully');
  
  // 测试删除不存在的文件（应该不抛出错误）
  await ossClient.deleteFile('not-found.png');
  console.log('✓ Non-existent file delete handled gracefully');
}

function testUrlGeneration(ossClient) {
  console.log('Testing URL generation...');
  
  // 测试自定义域名
  const customUrl = ossClient.generatePublicUrl('test/image.png');
  if (!customUrl.includes('cdn.example.com')) {
    throw new Error('Custom domain not used in URL generation');
  }
  console.log('✓ Custom domain URL generated:', customUrl);
  
  // 测试默认域名
  const ossClientNoCustom = new OSSClient({
    bucket: 'test-bucket',
    region: 'oss-cn-hangzhou'
  });
  const defaultUrl = ossClientNoCustom.generatePublicUrl('test/image.png');
  if (!defaultUrl.includes('test-bucket.oss-cn-hangzhou.aliyuncs.com')) {
    throw new Error('Default URL format incorrect');
  }
  console.log('✓ Default URL generated:', defaultUrl);
}

function testFileNameGeneration(ossClient) {
  console.log('Testing file name generation...');
  
  const taskId = 'test-task-123';
  const extension = 'png';
  
  const fileName1 = ossClient.generateFileName(taskId, extension);
  const fileName2 = ossClient.generateFileName(taskId, extension);
  
  if (fileName1 === fileName2) {
    throw new Error('Generated file names should be unique');
  }
  
  if (!fileName1.includes(taskId) || !fileName1.endsWith('.png')) {
    throw new Error('File name format incorrect');
  }
  
  console.log('✓ Unique file names generated:', fileName1, fileName2);
}

async function testConnection(ossClient) {
  console.log('Testing connection...');
  
  mockOSS.setFailMode(false);
  const result = await ossClient.testConnection();
  
  if (result !== true) {
    throw new Error('Connection test should return true');
  }
  
  console.log('✓ Connection test passed');
}

async function testRetryMechanism(ossClient) {
  console.log('Testing retry mechanism...');
  
  // 测试上传重试
  mockOSS.setFailMode(true, 2); // 前2次失败，第3次成功
  
  const buffer = Buffer.from('retry test data');
  const result = await ossClient.uploadFile(buffer, 'retry-test.png', 'image/png');
  
  if (mockOSS.failCount !== 2) {
    throw new Error(`Expected 2 failures before success, got ${mockOSS.failCount}`);
  }
  
  console.log('✓ Upload retry mechanism works correctly');
  
  // 测试最大重试次数
  mockOSS.setFailMode(true, 5); // 超过最大重试次数
  
  try {
    await ossClient.uploadFile(buffer, 'fail-test.png', 'image/png');
    throw new Error('Should have failed after max retries');
  } catch (error) {
    if (!error.message.includes('failed after 3 attempts')) {
      throw new Error('Error message should indicate retry attempts');
    }
    console.log('✓ Max retry limit enforced correctly');
  }
}

async function testBatchOperations(ossClient) {
  console.log('Testing batch operations...');
  
  mockOSS.setFailMode(false);
  
  // 测试批量上传
  const files = [
    { buffer: Buffer.from('file1'), fileName: 'batch1.png', contentType: 'image/png' },
    { buffer: Buffer.from('file2'), fileName: 'batch2.png', contentType: 'image/png' }
  ];
  
  const results = await ossClient.uploadFiles(files);
  
  if (results.length !== 2) {
    throw new Error('Batch upload should return 2 results');
  }
  
  console.log('✓ Batch upload completed:', results.length, 'files');
  
  // 测试批量删除
  const fileNames = results.map(r => r.fileName);
  await ossClient.deleteFiles(fileNames);
  
  console.log('✓ Batch delete completed:', fileNames.length, 'files');
}

// 运行测试
runTests();