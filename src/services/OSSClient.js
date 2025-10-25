/**
 * 阿里云OSS客户端封装
 * 提供文件上传、删除和URL生成功能
 * 包含错误处理和重试机制
 */

const OSS = require('ali-oss');
const path = require('path');
const logger = require('../utils/logger');

class OSSClient {
  constructor(config, metricsService = null) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
    
    this.metricsService = metricsService;
    
    this.client = new OSS({
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      region: this.config.region
    });
  }

  /**
   * 上传文件到OSS（带重试机制）
   * @param {Buffer} buffer - 文件内容
   * @param {string} fileName - 文件名
   * @param {string} contentType - 文件类型
   * @returns {Promise<{url: string, fileName: string}>}
   */
  async uploadFile(buffer, fileName, contentType) {
    const startTime = Date.now();
    
    try {
      const result = await this.retryOperation(async () => {
        const fullPath = this.getFullPath(fileName);
        
        const result = await this.client.put(fullPath, buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000' // 1年缓存
          }
        });

        const publicUrl = this.generatePublicUrl(fullPath);
        
        return {
          url: publicUrl,
          fileName: fullPath
        };
      }, 'upload');
      
      // 记录成功的上传指标
      const uploadTime = Date.now() - startTime;
      if (this.metricsService) {
        this.metricsService.recordOSSUpload(fileName, buffer.length, uploadTime, true);
      }
      
      logger.debug('OSS upload successful', {
        fileName,
        fileSize: buffer.length,
        uploadTime
      });
      
      return result;
      
    } catch (error) {
      // 记录失败的上传指标
      const uploadTime = Date.now() - startTime;
      if (this.metricsService) {
        this.metricsService.recordOSSUpload(fileName, buffer.length, uploadTime, false);
      }
      
      logger.error('OSS upload failed', {
        fileName,
        error: error.message,
        uploadTime
      });
      
      throw error;
    }
  }

  /**
   * 删除OSS文件（带重试机制）
   * @param {string} fileName - 文件名（包含路径）
   * @returns {Promise<void>}
   */
  async deleteFile(fileName) {
    try {
      await this.retryOperation(async () => {
        await this.client.delete(fileName);
      }, 'delete', (error) => {
        // 如果文件不存在，不需要重试
        return error.code === 'NoSuchKey';
      });
      
      // 记录成功的删除指标
      if (this.metricsService) {
        this.metricsService.recordOSSDelete(fileName, true);
      }
      
      logger.debug('OSS delete successful', { fileName });
      
    } catch (error) {
      // 记录失败的删除指标
      if (this.metricsService) {
        this.metricsService.recordOSSDelete(fileName, false);
      }
      
      logger.error('OSS delete failed', {
        fileName,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * 生成公共访问URL
   * @param {string} fileName - 文件名（包含路径）
   * @returns {string}
   */
  generatePublicUrl(fileName) {
    if (this.config.customDomain) {
      return `https://${this.config.customDomain}/${fileName}`;
    }
    
    return `https://${this.config.bucket}.${this.config.region}.aliyuncs.com/${fileName}`;
  }

  /**
   * 获取完整的文件路径
   * @param {string} fileName - 原始文件名
   * @returns {string}
   */
  getFullPath(fileName) {
    const prefix = this.config.pathPrefix || '';
    return path.posix.join(prefix, fileName);
  }

  /**
   * 生成唯一的文件名
   * @param {string} taskId - 任务ID
   * @param {string} extension - 文件扩展名
   * @returns {string}
   */
  generateFileName(taskId, extension) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${taskId}_${timestamp}_${randomSuffix}.${extension}`;
  }

  /**
   * 测试OSS连接
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    return this.retryOperation(async () => {
      await this.client.getBucketInfo();
      return true;
    }, 'connection test');
  }

  /**
   * 重试操作的通用方法
   * @param {Function} operation - 要执行的操作
   * @param {string} operationType - 操作类型（用于错误日志）
   * @param {Function} shouldSkipRetry - 判断是否跳过重试的函数
   * @returns {Promise<any>}
   */
  async retryOperation(operation, operationType, shouldSkipRetry = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // 如果有跳过重试的条件且满足，直接跳过
        if (shouldSkipRetry && shouldSkipRetry(error)) {
          return;
        }
        
        // 如果是最后一次尝试，抛出错误
        if (attempt === this.config.maxRetries) {
          break;
        }
        
        // 等待后重试
        await this.delay(this.config.retryDelay * attempt);
      }
    }
    
    throw new Error(`OSS ${operationType} failed after ${this.config.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 批量上传文件
   * @param {Array<{buffer: Buffer, fileName: string, contentType: string}>} files - 文件列表
   * @returns {Promise<Array<{url: string, fileName: string}>>}
   */
  async uploadFiles(files) {
    const results = [];
    
    for (const file of files) {
      const result = await this.uploadFile(file.buffer, file.fileName, file.contentType);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 批量删除文件
   * @param {Array<string>} fileNames - 文件名列表
   * @returns {Promise<void>}
   */
  async deleteFiles(fileNames) {
    const deletePromises = fileNames.map(fileName => this.deleteFile(fileName));
    await Promise.all(deletePromises);
  }
}

module.exports = OSSClient;