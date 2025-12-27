/**
 * ============================================================
 * API 调用模块 (API Module)
 * ============================================================
 * 
 * 功能说明：
 * 本模块包含所有与后端 API 交互的函数，包括：
 * - 文本与多模态分析 API
 * - Sora Image 生成 API（轮询模式）
 * - Grsai/Gemini 图像生成 API（流式）
 * - Mock 生成函数（用于测试）
 * 
 * 设计目的：
 * 将 API 调用逻辑集中管理，便于维护和测试
 */

import { buildFullPrompt } from './promptBuilder';

/**
 * 辅助函数：根据宽高计算官方支持的 aspectRatio 字符串
 * @param {number} w - 宽度
 * @param {number} h - 高度
 * @returns {string} 宽高比字符串（如 "16:9", "9:16" 等）
 */
const getAspectRatioString = (w, h) => {
    const ratio = w / h;
    // 允许一定的误差范围
    if (Math.abs(ratio - 1) < 0.1) return "1:1";
    if (Math.abs(ratio - 16/9) < 0.1) return "16:9";
    if (Math.abs(ratio - 9/16) < 0.1) return "9:16";
    if (Math.abs(ratio - 4/3) < 0.1) return "4:3";
    if (Math.abs(ratio - 3/4) < 0.1) return "3:4";
    if (Math.abs(ratio - 3/2) < 0.1) return "3:2";
    if (Math.abs(ratio - 2/3) < 0.1) return "2:3";
    if (Math.abs(ratio - 21/9) < 0.1) return "21:9";
    return "auto"; // 默认兜底
};

/**
 * 文本与多模态分析 API
 * 用于分析上传的图片并提取风格关键词
 * 
 * @param {Object} config - API 配置
 * @param {string} config.baseUrl - API 基础 URL
 * @param {string} config.apiKey - API 密钥
 * @param {Array} messages - 消息数组（OpenAI 格式）
 * @param {string} model - 模型名称，默认为 "gemini-2.5-flash"
 * @returns {Promise<string>} 返回分析结果文本
 * @throws {Error} 当 API 调用失败时抛出错误
 */
export const callOpenAIStyleApi = async (config, messages, model = "gemini-2.5-flash") => {
    const { baseUrl, apiKey } = config;
    
    // 验证 API Key
    if (!apiKey) {
        throw new Error("未配置 API Key");
    }

    // 清理基础 URL（移除末尾的斜杠）
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const apiUrl = `${cleanBaseUrl}/v1/chat/completions`;

    // 发送请求
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages
        })
    });

    // 检查响应状态
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chat API Error (${response.status}): ${errText}`);
    }

    // 解析响应
    const result = await response.json();
    return result?.choices?.[0]?.message?.content;
};

/**
 * Sora Image 生成 API（轮询模式）
 * 
 * 工作流程：
 * 1. 提交生成任务，获取 Task ID
 * 2. 轮询查询任务状态
 * 3. 当任务完成时，下载生成的图片
 * 
 * @param {Object} config - API 配置
 * @param {string} config.baseUrl - API 基础 URL
 * @param {string} config.apiKey - API 密钥
 * @param {Object} params - 生成参数
 * @param {string} params.prompt - 用户提示词
 * @param {string} params.grid - 网格模式 '2x2' 或 '3x3'
 * @param {Object} params.shotSize - 单镜头尺寸 {w: number, h: number}
 * @param {string} params.quality - 质量级别 '1k', '2k', '4k'
 * @param {Array} params.imageParts - 参考图片数组
 * @param {AbortSignal} signal - 取消信号
 * @param {Function} addLog - 日志记录函数
 * @returns {Promise<string>} 返回生成的图片 URL（Blob URL 或 HTTP URL）
 * @throws {Error} 当生成失败时抛出错误
 */
export const generateSoraImage = async (config, params, signal, addLog) => {
    const { baseUrl, apiKey } = config;
    
    // 验证配置
    if (!baseUrl || !apiKey) {
        throw new Error("配置缺失: Host 或 API Key");
    }

    // 清理基础 URL
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    
    // API 端点
    const completionUrl = `${cleanBaseUrl}/v1/draw/completions`; // 提交任务
    const resultUrl = `${cleanBaseUrl}/v1/draw/result`; // 查询结果

    // 使用 promptBuilder 模块构建提示词
    const promptData = buildFullPrompt(params);
    const { fullPrompt, dimensions } = promptData;
    const { cols, rows, rawTotalW, rawTotalH } = dimensions;

    // 计算 API 尺寸参数（Sora API 使用简化的尺寸标识）
    const ratio = rawTotalW / rawTotalH;
    let apiSize = "1:1";
    if (ratio > 1.3) apiSize = "3:2";
    else if (ratio < 0.8) apiSize = "2:3";
    else apiSize = "1:1";

    addLog(`Sora Mapping: Grid ${cols}x${rows} (${rawTotalW}x${rawTotalH}) -> Size param "${apiSize}"`);

    // 处理参考图（Sora API 需要 HTTP URL，不支持本地 Blob）
    const validUrls = params.imageParts
        ? params.imageParts
            .filter(part => part.url && part.url.startsWith('http'))
            .map(part => part.url)
        : [];

    if (params.imageParts && params.imageParts.length > 0 && validUrls.length === 0) {
        addLog("⚠️ Warning: Local assets ignored. Sora API requires public HTTP URLs.");
    }

    // --- 步骤 1: 提交任务 ---
    const payload = {
        model: "sora-image",
        prompt: fullPrompt,
        size: apiSize,
        variants: 1,
        urls: validUrls,
        webHook: "-1",
        shutProgress: false
    };

    addLog("Sora: Submitting task...");

    const submitResp = await fetch(completionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal
    });

    if (!submitResp.ok) {
        const err = await submitResp.text();
        throw new Error(`Sora Submit Error (${submitResp.status}): ${err}`);
    }

    const submitJson = await submitResp.json();
    const taskId = submitJson?.data?.id;
    
    if (!taskId) {
        throw new Error(`Sora Submit Failed: No Task ID returned. Msg: ${submitJson.msg}`);
    }

    addLog(`Sora: Task ID ${taskId} received. Polling result...`);

    // --- 步骤 2: 轮询结果 ---
    const MAX_ATTEMPTS = 450; // 最多轮询 60 次
    const DELAY_MS = 2000;   // 每次间隔 2 秒

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // 检查是否被取消
        if (signal?.aborted) {
            throw new Error("User cancelled.");
        }

        // 等待指定时间
        await new Promise(r => setTimeout(r, DELAY_MS));

        // 查询任务状态
        const resultResp = await fetch(resultUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ id: taskId }),
            signal
        });

        if (!resultResp.ok) {
            console.warn(`Polling failed (${resultResp.status}), retrying...`);
            continue;
        }

        const resultJson = await resultResp.json();
        const taskData = resultJson?.data;
        const status = taskData?.status;

        // 任务成功完成
        if (status === 'succeeded') {
            const finalUrl = taskData?.results?.[0]?.url || taskData?.url;
            if (!finalUrl) {
                throw new Error("Status succeeded but no URL found.");
            }

            try {
                // 尝试将图片下载到本地 Blob（避免 CORS 问题）
                addLog("Sora: Downloading image to local blob...");
                const imgResp = await fetch(finalUrl);
                const blob = await imgResp.blob();
                return URL.createObjectURL(blob);
            } catch (e) {
                // 如果下载失败，直接返回 URL（切片可能会因 CORS 失败）
                addLog("⚠️ Failed to proxy image, using direct URL (Slicing might fail due to CORS).");
                return finalUrl;
            }
        } 
        // 任务失败
        else if (status === 'failed') {
            throw new Error(`Sora Task Failed: ${taskData?.failure_reason || taskData?.error || 'Unknown error'}`);
        } 
        // 任务进行中
        else {
            // 每 5 次轮询记录一次日志（避免日志过多）
            if (i % 5 === 0) {
                addLog(`Sora: Status is ${status} (${taskData?.progress || 0}%)...`);
            }
        }
    }

    // 超时
    throw new Error("Sora Task Timeout: Max polling attempts reached.");
};

/**
 * 核心修改：Grsai/Nano Banana 图像生成 API
 * 根据模型名称自动切换：
 * 1. 如果包含 'nano-banana'，使用新的官方接口协议。
 * 2. 否则，使用旧的 Gemini 协议。
 * 
 * @param {Object} config - API 配置
 * @param {string} config.baseUrl - API 基础 URL
 * @param {string} config.apiKey - API 密钥
 * @param {Object} params - 生成参数
 * @param {string} params.model - 模型名称
 * @param {string} params.prompt - 用户提示词
 * @param {string} params.grid - 网格模式
 * @param {Object} params.shotSize - 单镜头尺寸
 * @param {string} params.quality - 质量级别
 * @param {Array} params.imageParts - 参考图片数组
 * @param {AbortSignal} signal - 取消信号
 * @param {Function} addLog - 日志记录函数
 * @returns {Promise<string>} 返回生成的图片 URL 或 Data URL
 * @throws {Error} 当生成失败时抛出错误
 */
export const generateGrsaiImage = async (config, params, signal, addLog) => {
    const { baseUrl, apiKey } = config;
    
    // 验证配置
    if (!baseUrl || !apiKey) {
        throw new Error("配置缺失");
    }

    // 清理基础 URL
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

    // =========================================================
    // 分支 A: Nano Banana 专用协议 (匹配官方文档)
    // =========================================================
    if (params.model && params.model.includes('nano-banana')) {
        addLog(`检测到 Nano Banana 模型，使用专用接口协议...`);
        
        const apiUrl = `${cleanBaseUrl}/v1/draw/nano-banana`;

        // 1. 构建 Prompt (使用 promptBuilder)
        // 注意：Nano Banana 不需要过多的 Gemini 式的 prompt hacking，保持纯净即可
        const promptData = buildFullPrompt(params);
        const { fullPrompt, dimensions } = promptData;
        const { finalW, finalH } = dimensions;

        // 2. 映射参数
        // 映射 imageSize (1K/2K/4K)
        let imageSize = "1K";
        if (params.quality === '4k') imageSize = "4K";
        else if (params.quality === '2k') imageSize = "2K";
        
        // 映射 aspectRatio (16:9 等)
        const aspectRatio = getAspectRatioString(finalW, finalH);

        // 映射 urls
        const urls = params.imageParts 
            ? params.imageParts.filter(p => p.url && p.url.startsWith('http')).map(p => p.url) 
            : [];

        // 3. 构造官方文档要求的请求体
        const payload = {
            model: params.model, // e.g., "nano-banana-pro"
            prompt: fullPrompt,
            aspectRatio: aspectRatio,
            imageSize: imageSize, // 关键：这里传 "4K" 才能生效！
            urls: urls,
            webHook: "-1", // 使用 -1 开启轮询 ID 模式
            shutProgress: false
        };

        addLog(`Request Params: Size=${imageSize}, Ratio=${aspectRatio}, Model=${params.model}`);

        // 4. 发送请求
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload),
            signal
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Nano API Error (${response.status}): ${errText}`);
        }

        // 5. 处理响应 (处理 webHook="-1" 返回的 ID)
        // 官方文档：如果不使用回调，webHook填"-1"，会立即返回一个id
        const initResult = await response.json();
        
        // 检查是否有 data.id
        const taskId = initResult?.data?.id || initResult?.id;
        
        if (!taskId) {
            // 也许是直接流式返回了？如果 content-type 是 stream
            // 但根据 webHook="-1" 的说明，应该返回 JSON
            console.error("Nano Response:", initResult);
            throw new Error("API 未返回 Task ID，请检查参数或 Model 名称");
        }

        addLog(`Task ID: ${taskId}, 开始轮询结果...`);

        // 6. 轮询结果 (逻辑与 Sora 类似，因为都是异步任务)
        // 假设轮询接口也是 /v1/draw/result (通常同一套系统的查询接口通用)
        const resultUrl = `${cleanBaseUrl}/v1/draw/result`; 

        const MAX_ATTEMPTS = 450;
        const DELAY_MS = 2000;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (signal?.aborted) throw new Error("用户取消");
            await new Promise(r => setTimeout(r, DELAY_MS));

            const checkResp = await fetch(resultUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ id: taskId }),
                signal
            });

            if (!checkResp.ok) continue;

            const checkJson = await checkResp.json();
            const taskData = checkJson?.data;
            const status = taskData?.status;

            if (status === 'succeeded') {
                // 提取结果 URL
                const finalUrl = taskData?.results?.[0]?.url || taskData?.url;
                if (!finalUrl) throw new Error("任务成功但未返回图片 URL");
                
                // 尝试转 Blob 解决 CORS
                try {
                    addLog("Nano: Downloading image to local blob...");
                    const imgResp = await fetch(finalUrl);
                    const blob = await imgResp.blob();
                    return URL.createObjectURL(blob);
                } catch (e) {
                    addLog("⚠️ Failed to proxy image, using direct URL.");
                    return finalUrl;
                }
            } else if (status === 'failed') {
                throw new Error(`生成失败: ${taskData?.failure_reason || taskData?.error || 'Unknown error'}`);
            } else {
                if (i % 5 === 0) addLog(`Processing: ${status} ${taskData?.progress || 0}%`);
            }
        }
        throw new Error("生成超时");
    }

    // =========================================================
    // 分支 B: Gemini 协议 (旧逻辑，用于兼容其他模型)
    // =========================================================
    else {
        const apiUrl = `${cleanBaseUrl}/v1beta/models/${params.model}:streamGenerateContent?key=${apiKey}`;

        // 使用 promptBuilder 模块构建提示词
        const qualityDesc = params.quality === '4k' ? "4k resolution, 8k, masterpiece, best quality" : "high quality, detailed";
        const promptData = buildFullPrompt(params, qualityDesc);
        const { fullPrompt, negativePrompt, dimensions } = promptData;
        const { finalW, finalH } = dimensions;

        // 构建请求体
        const parts = [{ text: fullPrompt }];
        if (params.imageParts && params.imageParts.length > 0) {
            parts.push(...params.imageParts);
        }

        const payload = {
            contents: [{ parts: parts }],
            generationConfig: {
                width: finalW,
                height: finalH,
                temperature: 0.7
            },
            // 兼容性字段
            width: finalW,
            height: finalH,
            modelInputs: {
                width: finalW,
                height: finalH,
                num_inference_steps: 30,
                guidance_scale: 7.5,
                negative_prompt: negativePrompt
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        let lastError = null;
        const MAX_RETRIES = 1;

        // 重试逻辑
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            // 检查是否被取消
            if (signal?.aborted) {
                throw new Error("用户取消请求");
            }

            try {
                // 重试时增加延迟
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                }

                // 发送请求
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal
                });

                // 处理错误响应
                if (!response.ok) {
                    const status = response.status;
                    const errorText = await response.text();
                    
                    if (status >= 400 && status < 500) {
                        if (status === 404) {
                            throw new Error(`端点 404: 检查 Host 设置`);
                        }
                        if (status === 429) {
                            throw new Error(`API 限流 (429): 请稍后`);
                        }
                        throw new Error(`客户端错误 (${status}): ${errorText}`);
                    }
                    throw new Error(`服务端错误 (${status})`);
                }

                // 解析响应（支持流式和 JSON 两种格式）
                const rawText = await response.text();
                let allCandidates = [];

                try {
                    // 尝试解析为 JSON
                    const jsonBody = JSON.parse(rawText);
                    if (Array.isArray(jsonBody)) {
                        jsonBody.forEach(item => {
                            if (item.candidates) {
                                allCandidates.push(...item.candidates);
                            }
                        });
                    } else {
                        if (jsonBody.candidates) {
                            allCandidates = jsonBody.candidates;
                        }
                    }
                } catch (e) {
                    // 如果不是 JSON，尝试解析为流式格式（SSE）
                    const lines = rawText.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data:')) {
                            const jsonStr = trimmed.substring(5).trim();
                            if (jsonStr === '[DONE]') continue;
                            try {
                                const chunk = JSON.parse(jsonStr);
                                if (chunk.candidates) {
                                    allCandidates.push(...chunk.candidates);
                                }
                            } catch (err) {
                                console.warn("Skipping invalid chunk:", jsonStr);
                            }
                        }
                    }
                }

                // 验证是否有有效内容
                if (allCandidates.length === 0) {
                    console.warn("Raw Response:", rawText.substring(0, 200));
                    throw new Error("未解析到有效内容 (Candidates Empty)");
                }

                // 从候选结果中提取图片
                for (const candidate of allCandidates) {
                    // 跳过被安全过滤器阻止的结果
                    if (candidate.finishReason === 'SAFETY') continue;

                    // 查找内联图片数据
                    const textPart = candidate?.content?.parts?.[0]?.text;
                    const inlineData = candidate?.content?.parts?.find(p => p.inlineData);

                    // 优先返回内联数据
                    if (inlineData) {
                        return `data:${inlineData.inlineData.mimeType};base64,${inlineData.inlineData.data}`;
                    }

                    // 从文本中提取 URL
                    if (textPart) {
                        // 尝试匹配 Markdown 格式的图片链接
                        const mdMatch = textPart.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
                        if (mdMatch) return mdMatch[1];

                        // 尝试匹配普通 URL
                        const urlMatch = textPart.match(/(https?:\/\/[^\s"'<>\)\]]+)/);
                        if (urlMatch) return urlMatch[1];

                        // 检查是否是 Data URL
                        if (textPart.startsWith('data:image')) return textPart;
                    }
                }

                throw new Error("响应解析完成，但未发现图片数据");

            } catch (error) {
                // 处理取消错误
                if (error.name === 'AbortError') {
                    throw new Error("已取消");
                }
                
                console.warn(`Attempt ${attempt} failed:`, error.message);
                lastError = error;
                
                // 某些错误不需要重试
                if (error.message.includes("404") || 
                    error.message.includes("429") || 
                    error.message.includes("客户端错误")) {
                    break;
                }
            }
        }
        
        throw lastError;
    }
};

/**
 * Mock 生成函数（用于测试）
 * 生成一个占位图片 URL
 * 
 * @param {Object} params - 生成参数
 * @param {Object} params.shotSize - 单镜头尺寸
 * @param {string} params.grid - 网格模式
 * @returns {Promise<string>} 返回占位图片 URL
 */
export const mockGenerateStoryboard = async (params) => {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 计算尺寸
    const shotW = parseInt(params.shotSize.w);
    const shotH = parseInt(params.shotSize.h);
    const cols = params.grid === '2x2' ? 2 : 3;
    const rows = params.grid === '2x2' ? 2 : 3;
    const scale = Math.min(1500 / (shotW * cols), 1500 / (shotH * rows));
    const totalW = Math.floor(shotW * cols * scale);
    const totalH = Math.floor(shotH * rows * scale);
    
    // 生成占位图片 URL
    const text = encodeURIComponent(`${params.grid}\n${totalW}x${totalH}`);
    return `https://placehold.co/${totalW}x${totalH}/1e293b/a5b4fc?text=${text}&font=roboto`;
};

/**
 * [新增] Sora 视频生成 API
 * 对应文档：/v1/video/sora-video
 * * @param {Object} config - API 配置
 * @param {Object} params - 视频生成参数
 * @param {string} params.prompt - 提示词
 * @param {string} params.imageUrl - 参考图 (Base64 或 HTTP URL)
 * @param {Function} addLog - 日志回调
 * @returns {Promise<string>} 返回生成的视频 URL
 */
export const generateSoraVideo = async (config, params, addLog = console.log) => {
    const { baseUrl, apiKey } = config;

    if (!baseUrl || !apiKey) throw new Error("API Config Missing");

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    // 接口路径
    const completionUrl = `${cleanBaseUrl}/v1/video/sora-video`;
    // 轮询接口
    const resultUrl = `${cleanBaseUrl}/v1/draw/result`;

    // 1. 提交任务
    // 参数构建
    const payload = {
        model: "sora-2",
        prompt: params.prompt,
        url: params.imageUrl, // 参考图
        aspectRatio: "16:9", // 默认比例
        duration: 15,         // 默认时长 (根据文档支持 5/10/15，这里取5秒演示)
        webHook: "-1",       // 开启轮询模式
        shutProgress: false
    };

    addLog("Sora Video: Submitting task...");

    const submitResp = await fetch(completionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}` // 认证
        },
        body: JSON.stringify(payload)
    });

    if (!submitResp.ok) {
        const errText = await submitResp.text();
        throw new Error(`Submit Failed: ${errText}`);
    }

    const submitJson = await submitResp.json();
    const taskId = submitJson?.data?.id;

    if (!taskId) throw new Error("No Task ID returned from Sora Video API");

    addLog(`Sora Video Task ID: ${taskId}, Polling...`);

    // 2. 轮询结果
    const MAX_ATTEMPTS = 600; // 视频生成较慢，增加轮询次数
    const DELAY_MS = 3000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, DELAY_MS));

        const resultResp = await fetch(resultUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ id: taskId })
        });

        if (!resultResp.ok) continue;

        const resultJson = await resultResp.json();
        const taskData = resultJson?.data;
        const status = taskData?.status;

        // 成功状态判断
        if (status === 'succeeded') {
            const videoUrl = taskData?.results?.[0]?.url;
            if (!videoUrl) throw new Error("Success but no video URL");
            return videoUrl;
        } else if (status === 'failed') {
            throw new Error(`Video Failed: ${taskData?.failure_reason}`);
        } else {
            if (i % 5 === 0) addLog(`Video Progress: ${taskData?.progress || 0}%`);
        }
    }

    throw new Error("Video Generation Timeout");
};