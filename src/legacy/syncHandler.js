/**
 * 向后兼容的同步处理器
 * 保留原有的同步API功能
 */

const url = require('url');
const ImageGenerator = require('../services/ImageGenerator');
const logger = require('../utils/logger');

const imageGenerator = new ImageGenerator();

function processConfig(request, response, callback) {
  if (typeof callback !== 'function') {
    return null;
  }
  
  if (request.method === 'GET') {
    // 解析URL参数
    let params = url.parse(request.url, true).query;
    if (!params.config) {
      response.status(400).json({
        code: 400,
        msg: 'request parameter "config" invalid!',
        data: null
      });
      return;
    }
    request.config = params.config;
    callback();
  } else {
    // 解析body参数
    let body = '';
    request.on('data', function (chunk) {
      body += chunk;
      if (body.length > 1e6) {
        response.status(400).json({
          code: 400,
          msg: 'request body too large!',
          data: null
        });
      }
    });
    request.on('end', function () {
      request.config = body;
      callback();
    });
  }
}

async function syncHandler(req, res) {
  try {
    await new Promise((resolve, reject) => {
      processConfig(req, res, resolve);
    });

    let config;
    try {
      config = JSON.parse(req.config);
    } catch (e) {
      return res.status(400).json({
        code: 400,
        msg: 'request parameter "config" format invalid, is not JSON!',
        data: null
      });
    }

    if (!config || !config.option) {
      return res.status(400).json({
        code: 400,
        msg: 'request parameter "config" format invalid, option is required!',
        data: null
      });
    }

    // 设置默认值
    config.width = config.width || 600;
    config.height = config.height || 400;
    config.type = config.type || 'png';
    config.base64 = (config.base64 === true);
    config.download = (config.download === true);

    // 验证类型
    if (!['png', 'jpeg', 'svg', 'pdf'].includes(config.type)) {
      config.type = 'png';
    }

    logger.info('Processing sync request', {
      type: config.type,
      width: config.width,
      height: config.height,
      base64: config.base64
    });

    let result;
    let contentType;

    if (config.base64) {
      // 生成Base64格式
      result = await imageGenerator.generateBase64(config);
      contentType = 'application/json;charset=UTF-8';
      
      res.setHeader('Content-Type', contentType);
      res.json({
        code: 200,
        msg: 'success',
        data: result
      });
    } else {
      // 生成二进制格式
      const imageResult = await imageGenerator.generateImage(config);
      result = imageResult.buffer;
      contentType = imageResult.contentType;

      res.setHeader('Content-Type', contentType);
      
      if (config.download) {
        res.setHeader('Content-Disposition', `attachment; filename="chart.${config.type}"`);
      }

      res.send(result);
    }

    logger.info('Sync request completed successfully', {
      type: config.type,
      size: result.length || result.length
    });

  } catch (error) {
    logger.error('Sync request failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      code: 500,
      msg: 'Error: Canvas rendering failed! The content of the request parameter "option" may be invalid!',
      data: null,
      error: {
        type: 'PROCESSING_ERROR',
        details: error.message
      }
    });
  }
}

module.exports = syncHandler;