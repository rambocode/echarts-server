/**
 * API端点测试
 * 测试异步任务API和系统监控API的功能
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.OSS_ACCESS_KEY_ID = 'test_key_id';
process.env.OSS_ACCESS_KEY_SECRET = 'test_key_secret';
process.env.OSS_BUCKET = 'test_bucket';
process.env.PORT = '3003';

const http = require('http');
const App = require('../src/app');

console.log('Testing API endpoints...');

class APITester {
  constructor() {
    this.app = null;
    this.server = null;
    this.baseUrl = 'http://localhost:3003';
  }

  async setup() {
    try {
      this.app = new App();
      await this.app.start();
      console.log('✓ Test server started');
      
      // 等待服务器完全启动
      await this.delay(1000);
    } catch (error) {
      console.error('✗ Failed to start test server:', error.message);
      throw error;
    }
  }

  async teardown() {
    if (this.app) {
      await this.app.stop();
      console.log('✓ Test server stopped');
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3003,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: res.headers['content-type']?.includes('application/json') 
                ? JSON.parse(body) 
                : body
            };
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async testHealthEndpoint() {
    console.log('Testing health endpoint...');
    
    const response = await this.makeRequest('GET', '/health');
    
    if (response.statusCode !== 200) {
      throw new Error(`Health check failed with status ${response.statusCode}`);
    }
    
    if (!response.body.data || response.body.data.status !== 'ok') {
      throw new Error('Health check response invalid');
    }
    
    console.log('✓ Health endpoint works');
  }

  async testSystemHealthEndpoint() {
    console.log('Testing system health endpoint...');
    
    const response = await this.makeRequest('GET', '/api/system/health');
    
    if (response.statusCode !== 200) {
      throw new Error(`System health check failed with status ${response.statusCode}`);
    }
    
    if (!response.body.data || !response.body.data.queueStatus) {
      throw new Error('System health response missing queue status');
    }
    
    console.log('✓ System health endpoint works');
  }

  async testQueueStatusEndpoint() {
    console.log('Testing queue status endpoint...');
    
    const response = await this.makeRequest('GET', '/api/system/queue-status');
    
    if (response.statusCode !== 200) {
      throw new Error(`Queue status failed with status ${response.statusCode}`);
    }
    
    if (typeof response.body.data.pendingTasks !== 'number') {
      throw new Error('Queue status response invalid');
    }
    
    console.log('✓ Queue status endpoint works');
  }

  async testMetricsEndpoint() {
    console.log('Testing metrics endpoint...');
    
    const response = await this.makeRequest('GET', '/api/system/metrics');
    
    if (response.statusCode !== 200) {
      throw new Error(`Metrics failed with status ${response.statusCode}`);
    }
    
    if (!response.body.includes('echarts_queue_pending_total')) {
      throw new Error('Metrics response missing expected metrics');
    }
    
    console.log('✓ Metrics endpoint works');
  }

  async testCreateTaskEndpoint() {
    console.log('Testing create task endpoint...');
    
    const taskData = {
      type: 'png',
      width: 600,
      height: 400,
      option: {
        title: { text: 'Test Chart' },
        xAxis: {
          type: 'category',
          data: ['A', 'B', 'C', 'D', 'E']
        },
        yAxis: {
          type: 'value'
        },
        series: [{
          type: 'line',
          data: [1, 2, 3, 4, 5]
        }]
      }
    };
    
    const response = await this.makeRequest('POST', '/api/charts/generate', taskData);
    
    if (response.statusCode !== 200) {
      throw new Error(`Create task failed with status ${response.statusCode}: ${JSON.stringify(response.body)}`);
    }
    
    if (!response.body.data || !response.body.data.taskId) {
      throw new Error('Create task response missing taskId');
    }
    
    console.log('✓ Create task endpoint works');
    return response.body.data.taskId;
  }

  async testTaskStatusEndpoint(taskId) {
    console.log('Testing task status endpoint...');
    
    const response = await this.makeRequest('GET', `/api/charts/status/${taskId}`);
    
    if (response.statusCode !== 200) {
      throw new Error(`Task status failed with status ${response.statusCode}`);
    }
    
    if (!response.body.data || response.body.data.taskId !== taskId) {
      throw new Error('Task status response invalid');
    }
    
    console.log('✓ Task status endpoint works');
  }

  async testInvalidTaskId() {
    console.log('Testing invalid task ID handling...');
    
    const response = await this.makeRequest('GET', '/api/charts/status/invalid-task-id');
    
    if (response.statusCode !== 404) {
      throw new Error(`Expected 404 for invalid task ID, got ${response.statusCode}`);
    }
    
    console.log('✓ Invalid task ID handling works');
  }

  async testInvalidTaskData() {
    console.log('Testing invalid task data handling...');
    
    const invalidData = {
      type: 'invalid',
      width: -1,
      // missing required option
    };
    
    const response = await this.makeRequest('POST', '/api/charts/generate', invalidData);
    
    if (response.statusCode !== 400) {
      throw new Error(`Expected 400 for invalid data, got ${response.statusCode}`);
    }
    
    console.log('✓ Invalid task data handling works');
  }

  async testConcurrentRequests() {
    console.log('Testing concurrent requests...');
    
    const taskData = {
      type: 'png',
      width: 300,
      height: 200,
      option: {
        title: { text: 'Concurrent Test' },
        xAxis: {
          type: 'category',
          data: ['X', 'Y', 'Z']
        },
        yAxis: {
          type: 'value'
        },
        series: [{
          type: 'bar',
          data: [1, 2, 3]
        }]
      }
    };
    
    // 创建多个并发请求
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(this.makeRequest('POST', '/api/charts/generate', taskData));
    }
    
    const responses = await Promise.all(promises);
    
    // 检查所有请求都成功
    for (const response of responses) {
      if (response.statusCode !== 200) {
        throw new Error(`Concurrent request failed with status ${response.statusCode}`);
      }
    }
    
    console.log('✓ Concurrent requests handling works');
  }

  async runAllTests() {
    try {
      await this.setup();
      
      // 基础端点测试
      await this.testHealthEndpoint();
      await this.testSystemHealthEndpoint();
      await this.testQueueStatusEndpoint();
      await this.testMetricsEndpoint();
      
      // 任务API测试
      const taskId = await this.testCreateTaskEndpoint();
      await this.testTaskStatusEndpoint(taskId);
      
      // 错误处理测试
      await this.testInvalidTaskId();
      await this.testInvalidTaskData();
      
      // 并发测试
      await this.testConcurrentRequests();
      
      console.log('✓ All API endpoint tests passed!');
      
    } catch (error) {
      console.error('✗ API endpoint test failed:', error.message);
      throw error;
    } finally {
      await this.teardown();
    }
  }
}

// 运行测试
async function runTests() {
  const tester = new APITester();
  try {
    await tester.runAllTests();
    console.log('✓ API endpoint testing completed successfully');
  } catch (error) {
    console.error('✗ API endpoint testing failed:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests();
}

module.exports = APITester;