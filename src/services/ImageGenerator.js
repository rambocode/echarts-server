/**
 * 图片生成器
 * 负责ECharts图表的渲染和图片生成
 * 支持异步处理和OSS上传
 */

const echarts = require('echarts');
const { createCanvas } = require('@napi-rs/canvas');
const { v4: uuidv4 } = require('uuid');

class ImageGenerator {
  constructor(ossClient = null) {
    this.ossClient = ossClient;
    
    // 设置ECharts平台API
    echarts.setPlatformAPI({
      createCanvas(width = 600, height = 400) {
        return createCanvas(width, height);
      }
    });
  }

  /**
   * 生成图片（异步版本，基于原renderChart函数重构）
   * @param {object} config - 图表配置
   * @returns {Promise<{buffer: Buffer, contentType: string, extension: string}>}
   */
  async generateImage(config) {
    try {
      // 验证配置
      if (!this.validateChartOption(config.option)) {
        throw new Error('Invalid chart option provided');
      }

      // 设置默认值
      const width = config.width || 600;
      const height = config.height || 400;
      const type = config.type || 'png';
      
      // 创建画布和图表实例
      const canvas = createCanvas(width, height);
      const chart = echarts.init(canvas);
      
      // 设置图表选项
      chart.setOption(config.option);
      
      // 生成图片
      let buffer;
      let contentType;
      let extension;
      
      switch (type.toLowerCase()) {
        case 'png':
          buffer = canvas.toBuffer('image/png');
          contentType = 'image/png';
          extension = 'png';
          break;
        case 'jpeg':
        case 'jpg':
          buffer = canvas.toBuffer('image/jpeg');
          contentType = 'image/jpeg';
          extension = 'jpeg';
          break;
        case 'svg':
          // SVG格式需要特殊处理 - 使用SVG canvas
          const { SvgExportFlag } = require('@napi-rs/canvas');
          const svgCanvas = createCanvas(width, height, SvgExportFlag.ConvertTextToPaths);
          const svgChart = echarts.init(svgCanvas);
          svgChart.setOption(config.option);
          buffer = Buffer.from(svgCanvas.getContent(), 'utf8');
          svgChart.dispose();
          contentType = 'image/svg+xml';
          extension = 'svg';
          break;
        case 'pdf':
          // PDF格式暂时使用PNG代替
          buffer = canvas.toBuffer('image/png');
          contentType = 'image/png';
          extension = 'png';
          break;
        default:
          throw new Error(`Unsupported image type: ${type}`);
      }
      
      // 清理资源
      chart.dispose();
      
      return {
        buffer,
        contentType,
        extension
      };
      
    } catch (error) {
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /**
   * 生成图片并上传到OSS
   * @param {object} config - 图表配置
   * @param {string} taskId - 任务ID
   * @returns {Promise<{url: string, fileName: string, buffer: Buffer, contentType: string}>}
   */
  async generateAndUploadImage(config, taskId) {
    if (!this.ossClient) {
      throw new Error('OSS client not configured');
    }

    try {
      // 生成图片
      const imageResult = await this.generateImage(config);
      
      // 生成唯一文件名
      const fileName = this.ossClient.generateFileName(taskId, imageResult.extension);
      
      // 上传到OSS
      const uploadResult = await this.ossClient.uploadFile(
        imageResult.buffer,
        fileName,
        imageResult.contentType
      );
      
      return {
        url: uploadResult.url,
        fileName: uploadResult.fileName,
        buffer: imageResult.buffer,
        contentType: imageResult.contentType
      };
      
    } catch (error) {
      throw new Error(`Image generation and upload failed: ${error.message}`);
    }
  }

  /**
   * 渲染图表（兼容原renderChart函数）
   * @param {object} config - 图表配置
   * @returns {Buffer|string} - 图片buffer或base64字符串
   */
  renderChart(config) {
    try {
      const canvas = createCanvas(config.width, config.height);
      const chart = echarts.init(canvas);
      chart.setOption(config.option);
      
      let result;
      if (config.base64) {
        const base64 = canvas.toDataURL(config.formatType);
        result = JSON.stringify({
          code: 200,
          msg: 'success',
          data: base64
        });
      } else {
        result = canvas.toBuffer(config.formatType);
      }
      
      chart.dispose();
      return result;
      
    } catch (error) {
      throw new Error(`Chart rendering failed: ${error.message}`);
    }
  }

  /**
   * 生成Base64格式图片
   * @param {object} config - 图表配置
   * @returns {Promise<string>}
   */
  async generateBase64(config) {
    try {
      const width = config.width || 600;
      const height = config.height || 400;
      const type = config.type || 'png';
      
      const canvas = createCanvas(width, height);
      const chart = echarts.init(canvas);
      
      chart.setOption(config.option);
      
      const formatType = type === 'jpeg' ? 'image/jpeg' : 'image/png';
      const base64 = canvas.toDataURL(formatType);
      
      chart.dispose();
      
      return base64;
    } catch (error) {
      throw new Error(`Base64 generation failed: ${error.message}`);
    }
  }

  /**
   * 验证图表配置
   * @param {object} option - ECharts配置对象
   * @returns {boolean}
   */
  validateChartOption(option) {
    if (!option || typeof option !== 'object') {
      return false;
    }
    
    // 基本的ECharts配置验证
    // 检查是否有基本的图表配置
    if (!option.series && !option.dataset) {
      return false;
    }
    
    return true;
  }

  /**
   * 批量生成图片
   * @param {Array<{config: object, taskId: string}>} tasks - 任务列表
   * @returns {Promise<Array<{taskId: string, result: object, error: string}>>}
   */
  async generateBatchImages(tasks) {
    const results = [];
    
    for (const task of tasks) {
      try {
        let result;
        if (this.ossClient) {
          result = await this.generateAndUploadImage(task.config, task.taskId);
        } else {
          result = await this.generateImage(task.config);
        }
        
        results.push({
          taskId: task.taskId,
          result,
          error: null
        });
      } catch (error) {
        results.push({
          taskId: task.taskId,
          result: null,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 设置OSS客户端
   * @param {OSSClient} ossClient - OSS客户端实例
   */
  setOSSClient(ossClient) {
    this.ossClient = ossClient;
  }

  /**
   * 获取支持的图片格式
   * @returns {Array<string>}
   */
  getSupportedFormats() {
    return ['png', 'jpeg', 'jpg', 'svg', 'pdf'];
  }
}

module.exports = ImageGenerator;