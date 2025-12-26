/**
 * 图像处理接口调用工具类
 * 对应后端: ImageEnhanceController.java
 */

// ===================== 配置区域 =====================

// 1. 画质增强接口地址
    //本地调试
const ENHANCE_API_URL = 'http://localhost:8081/api/enhance';
    //生产部署
// const ENHANCE_API_URL = '/api/enhance';


// 2. 通用超分接口地址 (对应后端 /api/super-resolution)
    //本地调试
const SUPER_RES_API_URL = 'http://localhost:8081/api/super-resolution';
    //生产部署
// const SUPER_RES_API_URL = '/api/super-resolution';

// ===================== 接口方法 =====================

/**
 * [原有接口] 调用画质增强接口
 * @param {string} base64Data - 图片的 Base64 字符串 (包含或不包含 data:image 前缀均可)
 * @returns {Promise<string>} - 返回处理后的图片 URL 或 Base64
 */
export async function callJimengEnhance(base64Data) {
    try {
        console.log('正在请求后端画质增强接口...');

        // 1. 数据清洗：后端要求去掉 data:image/*;base64, 前缀
        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

        // 2. 发起请求
        const response = await fetch(ENHANCE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "image_base64": cleanBase64
            })
        });

        // 3. 处理响应
        return await handleApiResponse(response, '画质增强');

    } catch (error) {
        console.error('画质增强调用失败:', error);
        throw error;
    }
}

/**
 * [新增接口] 调用通用超分接口 (x2放大)
 * @param {string} base64Data - 图片的 Base64 字符串
 * @param {string} modelQuality - (可选) 模型质量，支持 "HQ"(高), "MQ"(中-默认), "LQ"(低)
 * @returns {Promise<string>} - 返回处理后的图片 URL 或 Base64
 */
export async function callJimengSuperResolution(base64Data, modelQuality = 'MQ') {
    try {
        console.log(`正在请求后端超分接口 (质量: ${modelQuality})...`);

        // 1. 数据清洗
        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

        // 2. 发起请求
        const response = await fetch(SUPER_RES_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "image_base64": cleanBase64,
                "model_quality": modelQuality // 传递画质参数
            })
        });

        // 3. 处理响应
        return await handleApiResponse(response, '通用超分');

    } catch (error) {
        console.error('通用超分调用失败:', error);
        throw error;
    }
}

// ===================== 内部通用逻辑 =====================

/**
 * 统一处理后端响应的辅助函数
 * @param {Response} response - fetch 返回的 response 对象
 * @param {string} actionName - 操作名称，用于报错提示
 */
async function handleApiResponse(response, actionName) {
    // 1. 网络层错误处理
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${actionName}后端请求失败 (${response.status}): ${errorText}`);
    }

    // 2. 业务层响应解析
    const result = await response.json();

    // 检查后端业务状态码 (10000 为成功)
    if (result.code === 10000) {
        // 后端将火山引擎的原始响应放在 result.data 中
        const volcResponse = result.data;

        if (volcResponse && volcResponse.data) {
            // A. 优先检查是否有返回 URL
            if (volcResponse.data.image_urls && volcResponse.data.image_urls.length > 0) {
                return volcResponse.data.image_urls[0];
            }
            // B. 其次检查是否有返回 Base64
            if (volcResponse.data.binary_data_base64 && volcResponse.data.binary_data_base64.length > 0) {
                // 补全前缀以便前端直接展示
                return `data:image/png;base64,${volcResponse.data.binary_data_base64[0]}`;
            }
        }
        throw new Error(`服务端(${actionName})未返回有效的图片数据`);
    } else {
        throw new Error(result.message || `${actionName}后端处理异常`);
    }
}