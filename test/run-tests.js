#!/usr/bin/env node

/**
 * 测试运行器
 * 运行所有测试文件并生成报告
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();

console.log('🧪 运行测试套件...\n');
console.log(`发现 ${testFiles.length} 个测试文件:\n`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`📋 运行: ${testFile}`);
    
    const child = spawn('node', [path.join(testDir, testFile)], {
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      const success = code === 0;
      const testCount = (output.match(/✅|❌/g) || []).length;
      const passCount = (output.match(/✅/g) || []).length;
      const failCount = testCount - passCount;

      totalTests += testCount;
      passedTests += passCount;
      failedTests += failCount;

      results.push({
        file: testFile,
        success,
        testCount,
        passCount,
        failCount,
        output: success ? output : errorOutput || output
      });

      if (success) {
        console.log(`   ✅ 通过 (${passCount}/${testCount})`);
      } else {
        console.log(`   ❌ 失败 (${passCount}/${testCount})`);
      }

      resolve();
    });
  });
}

async function runAllTests() {
  for (const testFile of testFiles) {
    await runTest(testFile);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(50));
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests} ✅`);
  console.log(`失败: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`成功率: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);

  if (failedTests > 0) {
    console.log('\n❌ 失败的测试详情:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`\n📁 ${result.file}:`);
      console.log(result.output.split('\n').map(line => `   ${line}`).join('\n'));
    });
  }

  console.log('\n' + '='.repeat(50));
  
  if (failedTests === 0) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('💥 部分测试失败，请检查上述错误信息');
    process.exit(1);
  }
}

runAllTests().catch(console.error);