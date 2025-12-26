/**
 * ============================================================
 * 故事板应用主组件 (Storyboard App Main Component)
 * ============================================================
 * * 功能说明：
 * 本组件是应用程序的根组件，负责：
 * - 管理全局状态（配置、生成选项、图片数据等）
 * - 协调左侧控制面板和右侧显示面板
 * - 处理图片生成、切割、保存等核心业务逻辑
 * - 管理文件系统访问（自动保存功能）
 * * 架构设计：
 * - 左侧面板（LeftPanel）：用户输入和控制
 * - 右侧面板（MiddlePanel）：结果展示和预览
 * - 工具模块（utils/）：提示词构建、API 调用、工具函数
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

// 导入工具模块
import { urlToBase64, downloadFile } from './utils/utils';
import {
    callOpenAIStyleApi,
    generateSoraImage,
    generateGrsaiImage,
    mockGenerateStoryboard
} from './utils/api';
// 导入新的即梦接口 (保留引用，用于 App 内部逻辑兼容)
import { callJimengEnhance } from './utils/imagFixApi';

// 导入组件
import LeftPanel from './components/LeftPanel';
import MiddlePanel from './components/MiddlePanel';
import RightPanel from  './components/RightPanel';

/**
 * 主应用组件
 */
export default function App() {
    // ============================================================
    // 状态管理
    // ============================================================

    /**
     * API 配置状态
     * - useMock: 是否使用 Mock 模式（用于测试）
     * - baseUrl: API 服务器地址
     * - apiKey: API 密钥
     */
    const [config, setConfig] = useState({
        useMock: false,
        apiKey: '',
        baseUrl: 'https://grsai.dakka.com.cn'
    });

    /**
     * 生成选项状态
     * - model: 使用的模型名称
     * - quality: 质量级别（'1k', '2k', '4k'）
     * - shotWidth: 单镜头宽度（像素）
     * - shotHeight: 单镜头高度（像素）
     */
    const [genOptions, setGenOptions] = useState({
        model: 'nano-banana-pro',
        quality: '4k',
        shotWidth: 1920,
        shotHeight: 1080
    });

    /**
     * 文件系统访问相关状态
     * - outputDirName: 输出目录名称（用于显示）
     * - outputDirHandleRef: 目录句柄引用（用于文件操作）
     * - outputSequenceRef: 输出序列号（用于自动命名）
     */
    const [outputDirName, setOutputDirName] = useState(null);
    const outputDirHandleRef = useRef(null);
    const outputSequenceRef = useRef(1);

    /**
     * 标记当前图片是否为新生成且未保存
     * 用于防止切换布局时重复保存
     */
    const isNewImageRef = useRef(false);

    /**
     * UI 状态
     * - showConfig: 是否显示配置区域
     * - assets: 上传的资源数组
     * - gridMode: 网格模式 '2x2' 或 '3x3'
     * - prompt: 用户输入的提示词
     */
    const [showConfig, setShowConfig] = useState(true);
    const [assets, setAssets] = useState([]);
    const [gridMode, setGridMode] = useState('3x3');
    const [prompt, setPrompt] = useState('赛博朋克风格，雨夜街道，霓虹灯光，孤独的黑客背影');

    /**
     * 数据和状态
     * - isGenerating: 是否正在生成图片（用于 UI 显示，不再阻塞）
     * - isAnalyzing: 是否正在分析资源
     * - generatedImage: 生成的图片 URL（当前在中间面板显示的）
     * - slicedImages: 切割后的图片数组（当前在中间面板显示的）
     * - analysisResult: 资源分析结果文本
     * - logs: 日志数组
     * - errorModal: 错误模态框状态
     * - tasks: 任务队列数组
     * - currentTaskId: 当前在中间面板展示的任务 ID
     */
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [slicedImages, setSlicedImages] = useState([]);
    const [analysisResult, setAnalysisResult] = useState('');
    const [logs, setLogs] = useState([]);
    const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
    const [tasks, setTasks] = useState([]); // 存储所有生成任务
    const [currentTaskId, setCurrentTaskId] = useState(null); // 当前在 MiddlePanel 展示的任务 ID

    /**
     * 清晰化加工相关状态
     * - processingQueue: 待处理的图片队列
     * - upscaledResults: 清晰化后的结果数组
     * - isUpscaling: 是否正在执行清晰化
     * - upscaleModel: 清晰化使用的模型
     */
    const [processingQueue, setProcessingQueue] = useState([]);
    const [upscaledResults, setUpscaledResults] = useState([]);
    const [isUpscaling, setIsUpscaling] = useState(false);
    const [upscaleModel, setUpscaleModel] = useState('jimeng-enhance'); // 默认选中即梦增强

    /**
     * 请求取消控制器引用
     * 用于取消正在进行的 API 请求
     */
    const abortControllerRef = useRef(null);

    /**
     * 日志记录函数
     * 添加带时间戳的日志，并限制日志数量（最多 50 条）
     * * @param {string} msg - 日志消息
     */
    const addLog = (msg) => {
        setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ${msg}`,
            ...prev.slice(0, 49)
        ]);
    };

    // ============================================================
    // 副作用处理
    // ============================================================

    // 1. 创建一个 Ref 来追踪最新的 assets，以便在卸载时访问
    const assetsRef = useRef(assets);

    // 每次 assets 变化时更新 ref，但不触发清理逻辑
    useEffect(() => {
        assetsRef.current = assets;
    }, [assets]);

    /**
     * 清理资源
     * 仅当组件【卸载】时，释放所有 Blob URL 以释放内存
     * 避免在添加新图片时错误地销毁了旧图片的 URL
     */
    useEffect(() => {
        return () => {
            // 组件卸载时，释放所有当前存在的 Blob URL
            if (assetsRef.current) {
                assetsRef.current.forEach((a) => {
                    if (a.url && a.url.startsWith('blob:')) {
                        URL.revokeObjectURL(a.url);
                    }
                });
            }
        };
    }, []); // 依赖数组为空，确保只在卸载时执行

    // ============================================================
    // 文件系统访问 API 逻辑
    // ============================================================

    /**
     * 选择输出文件夹
     * 使用 File System Access API 让用户选择保存目录
     * 注意：此功能仅在支持 File System Access API 的浏览器中可用（Chrome、Edge）
     */
    const handleSelectOutputFolder = async () => {
        // 检查浏览器支持
        if (!('showDirectoryPicker' in window)) {
            setErrorModal({
                visible: true,
                message:
                    '您的浏览器不支持 File System Access API，无法使用自动保存功能。建议使用 Chrome 或 Edge 桌面版。'
            });
            return;
        }

        try {
            // 打开目录选择对话框
            const handle = await window.showDirectoryPicker();
            outputDirHandleRef.current = handle;
            setOutputDirName(handle.name);
            addLog(`存储目录已设定: ${handle.name}`);
        } catch (e) {
            // 用户取消选择时不显示错误
            if (e.name !== 'AbortError') {
                setErrorModal({
                    visible: true,
                    message: `无法访问目录: ${e.message}`
                });
            }
        }
    };

    /**
     * 保存切片到磁盘
     * 将切割后的图片保存到用户选择的目录中
     * * @param {Array} slices - 切片数组
     */
    const saveSlicesToDisk = async (slices) => {
        const rootHandle = outputDirHandleRef.current;
        if (!rootHandle) return;

        try {
            // 创建序列文件夹
            const seqId = outputSequenceRef.current;
            const folderName = `分镜文件_${seqId}`;
            const dirHandle = await rootHandle.getDirectoryHandle(folderName, {
                create: true
            });

            addLog(`正在保存 ${slices.length} 张图片到: ${folderName}...`);

            // 逐个保存切片
            for (let i = 0; i < slices.length; i++) {
                const slice = slices[i];

                // 从 Data URL 获取 Blob
                const response = await fetch(slice.dataUrl);
                const blob = await response.blob();

                // 创建文件并写入
                const fileName = `镜头_${i + 1}.png`;
                const fileHandle = await dirHandle.getFileHandle(fileName, {
                    create: true
                });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }

            addLog(`✅ 保存完成: ${folderName}`);
            outputSequenceRef.current += 1;
        } catch (e) {
            console.error(e);
            addLog(`❌ 保存失败: ${e.message}`);
        }
    };

    /**
     * 批量下载所有切片
     * 逐个下载切片文件（添加延迟以避免浏览器拦截）
     */
    const downloadAllSlices = async () => {
        if (slicedImages.length === 0) return;
        addLog('Batch download started...');

        for (let i = 0; i < slicedImages.length; i++) {
            downloadFile(slicedImages[i].dataUrl, `CineGrid_Shot_${i + 1}.png`);
            // 添加延迟，避免浏览器拦截连续下载
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        addLog('Batch download complete.');
    };

    // ============================================================
    // 图片处理逻辑
    // ============================================================

    /**
     * 切割图片（返回 Promise，用于任务队列）
     * 将生成的大图按照网格模式切割成多个小图
     * * @param {string} imageUrl - 图片 URL
     * @param {string} mode - 网格模式 '2x2' 或 '3x3'
     * @param {Object} shotSize - 单镜头尺寸 {w: number, h: number}
     * @returns {Promise<Array>} 返回切片数组的 Promise
     */
    const performSlicing = useCallback((imageUrl, mode, shotSize) => {
        return new Promise((resolve, reject) => {
            addLog(`Processing Grid: ${mode}`);

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = imageUrl;

            img.onload = () => {
                // 验证图片尺寸
                console.log(`[验证] 生成的图片尺寸: ${img.width}x${img.height}`);
                console.log(
                    `[验证] 期望总尺寸: ${shotSize.w * (mode === '2x2' ? 2 : 3)}x${
                        shotSize.h * (mode === '2x2' ? 2 : 3)
                    }`
                );

                const rows = mode === '2x2' ? 2 : 3;
                const cols = mode === '2x2' ? 2 : 3;
                const expectedRatio = (shotSize.w * cols) / (shotSize.h * rows);
                const actualRatio = img.width / img.height;
                const ratioDeviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;

                console.log(
                    `[验证] 期望比例: ${expectedRatio.toFixed(2)}:1, 实际比例: ${actualRatio.toFixed(
                        2
                    )}:1`
                );

                // 检查比例偏差
                if (ratioDeviation > 0.1) {
                    console.warn(
                        `[警告] 图片比例偏差过大! 期望: ${expectedRatio.toFixed(2)}, 实际: ${actualRatio.toFixed(
                            2
                        )}`
                    );
                    addLog(`⚠️ 图片比例可能不正确 (${img.width}x${img.height})`);
                }

                // 计算每个切片的尺寸（使用实际图片尺寸）
                const pieceWidth = img.width / cols;
                const pieceHeight = img.height / rows;
                const newSlices = [];

                // 切割图片
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        // 创建 Canvas 用于切割
                        const canvas = document.createElement('canvas');
                        canvas.width = pieceWidth;
                        canvas.height = pieceHeight;
                        const ctx = canvas.getContext('2d');

                        // 从原图中提取切片
                        ctx.drawImage(
                            img,
                            x * pieceWidth,
                            y * pieceHeight,
                            pieceWidth,
                            pieceHeight,
                            0,
                            0,
                            pieceWidth,
                            pieceHeight
                        );

                        // 转换为 Data URL 并添加到数组
                        newSlices.push({
                            id: `slice-${y}-${x}-${Date.now()}-${Math.random()}`,
                            dataUrl: canvas.toDataURL('image/jpeg', 0.95),
                            title: `Shot ${y * cols + x + 1}`,
                            aspectRatio: shotSize.w / shotSize.h
                        });
                    }
                }

                addLog(`Slicing complete: ${newSlices.length} shots`);
                resolve(newSlices);
            };

            img.onerror = (e) => {
                if (!config.useMock) {
                    const error = new Error('图片加载失败 (CORS)。请检查 API 返回的链接。');
                    reject(error);
                } else {
                    reject(e);
                }
            };
        });
    }, [config.useMock, addLog]);

    /**
     * 当生成的图片或网格模式变化时，自动切割图片（保留用于直接调用场景）
     */
    useEffect(() => {
        if (generatedImage && currentTaskId === null) {
            // 只有在没有选中任务时才自动切割（兼容旧逻辑）
            performSlicing(generatedImage, gridMode, {
                w: genOptions.shotWidth,
                h: genOptions.shotHeight
            }).then((slices) => {
                setSlicedImages(slices);
                // 如果设置了自动保存目录且是新生成的图片，自动保存
                if (outputDirHandleRef.current && isNewImageRef.current) {
                    saveSlicesToDisk(slices);
                    isNewImageRef.current = false; // 保存后重置标记
                }
            }).catch((e) => {
                setErrorModal({
                    visible: true,
                    message: e.message || '图片切割失败'
                });
            });
        }
    }, [generatedImage, gridMode, genOptions.shotWidth, genOptions.shotHeight, currentTaskId, performSlicing]);

    // ============================================================
    // 用户操作处理函数
    // ============================================================

    /**
     * 分析资源
     * 使用 AI 分析上传的图片，提取风格关键词
     */
    const handleAnalyzeAssets = async () => {
        if (!config.apiKey || assets.length === 0) {
            return setErrorModal({
                visible: true,
                message: 'Check Config / Assets'
            });
        }

        setIsAnalyzing(true);
        try {
            // 将所有资源转换为 Base64
            const imageContent = await Promise.all(
                assets.map((a) =>
                    urlToBase64(a.url).then((res) => ({
                        type: 'image_url',
                        image_url: { url: res.fullDataUrl }
                    }))
                )
            );

            // 构建消息
            const messages = [
                { role: 'system', content: 'Visual Director.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analyze style keywords (English).' },
                        ...imageContent
                    ]
                }
            ];

            // 调用分析 API
            const result = await callOpenAIStyleApi(config, messages, 'gemini-2.5-flash');
            setAnalysisResult(result);
            addLog('Analysis Complete');
        } catch (e) {
            addLog(`Analyze Error: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    /**
     * 生成图片（重构为异步队列模式）
     * 不再阻塞 UI，而是创建一个后台任务
     */
    const handleGenerate = async () => {
        // 验证输入
        if (!prompt) {
            return setErrorModal({ visible: true, message: 'Empty Prompt' });
        }
        if (!config.useMock && (!config.baseUrl || !config.apiKey)) {
            setShowConfig(true);
            return setErrorModal({ visible: true, message: 'Config Missing' });
        }

        // 1. 创建新任务对象
        const newTaskId = Date.now();
        const newTask = {
            id: newTaskId,
            status: 'loading', // loading | success | error
            prompt: prompt,
            gridMode: gridMode,
            time: new Date().toLocaleTimeString(),
            imageUrl: null,
            slices: [],
            params: { 
                ...genOptions, 
                prompt, 
                grid: gridMode, 
                assets: [...assets] // 保存当时参数快照
            }
        };

        // 2. 添加到队列
        setTasks(prev => [newTask, ...prev]);
        
        // 3. 短暂显示提交状态（可选）
        setIsGenerating(true);
        setTimeout(() => setIsGenerating(false), 500);
        
        // 4. 异步执行生成逻辑 (不阻塞 UI)
        processGenerationTask(newTask);
    };

    /**
     * 新增：后台处理生成任务
     */
    const processGenerationTask = async (task) => {
        // 创建独立的 AbortController (支持多任务并行)
        const controller = new AbortController();
        
        try {
            // 处理参考图片
            let imageParts = [];
            if (task.params.assets && task.params.assets.length > 0) {
                addLog(`[Task ${task.id}] Processing ${task.params.assets.length} assets...`);

                // 将资源转换为 API 需要的格式
                imageParts = await Promise.all(
                    task.params.assets.map(async (asset) => {
                        // 如果是 Blob URL，转换为 Base64（用于 Gemini 模型）
                        if (asset.url && asset.url.startsWith('blob:')) {
                            const { base64Only } = await urlToBase64(asset.url);
                            return {
                                inlineData: { mimeType: 'image/jpeg', data: base64Only },
                                url: asset.url // 同时保留 URL（用于 Sora 模型）
                            };
                        }
                        // 如果已经是 HTTP URL，直接传递
                        return { url: asset.url };
                    })
                );
            }

            // 构建生成参数（使用 task 中保存的快照）
            const apiParams = {
                prompt: task.params.prompt,
                promptText: task.params.prompt,
                grid: task.params.grid,
                model: task.params.model,
                quality: task.params.quality,
                shotSize: { w: task.params.shotWidth, h: task.params.shotHeight },
                imageParts
            };

            // 根据配置选择生成方式
            let imageUrl;
            if (config.useMock) {
                imageUrl = await mockGenerateStoryboard(apiParams);
            } else {
                if (task.params.model === 'sora-image') {
                    imageUrl = await generateSoraImage(
                        config,
                        apiParams,
                        controller.signal,
                        (msg) => addLog(`[Task ${task.id}] ${msg}`)
                    );
                } else {
                    imageUrl = await generateGrsaiImage(
                        config,
                        apiParams,
                        controller.signal,
                        (msg) => addLog(`[Task ${task.id}] ${msg}`)
                    );
                }
            }

            // 生成成功后，立即执行切割
            const slices = await performSlicing(
                imageUrl, 
                task.params.grid, 
                { w: task.params.shotWidth, h: task.params.shotHeight }
            );

            // 更新任务状态为成功
            setTasks(prev => prev.map(t => {
                if (t.id === task.id) {
                    return { ...t, status: 'success', imageUrl, slices };
                }
                return t;
            }));

            // 如果是最新生成的任务，自动展示到中间面板
            setCurrentTaskId(task.id);
            setGeneratedImage(imageUrl);
            setSlicedImages(slices);
            setGridMode(task.params.grid);
            isNewImageRef.current = true; // 标记为新生成的图片
            
            // 如果设置了自动保存目录，自动保存
            if (outputDirHandleRef.current) {
                saveSlicesToDisk(slices);
                isNewImageRef.current = false;
            }
            
            addLog(`[Task ${task.id}] Completed.`);

        } catch (error) {
            console.error(`[Task ${task.id}] Error:`, error);
            setTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, status: 'error' } : t
            ));
            addLog(`[Task ${task.id}] Failed: ${error.message}`);
            
            // 如果是用户取消，不显示错误模态框
            if (error.message !== '已取消' && error.message !== '用户取消') {
                setErrorModal({ visible: true, message: error.message });
            }
        }
    };

    /**
     * 新增：当点击右侧任务列表时
     */
    const handleTaskSelect = (task) => {
        if (task.status !== 'success') return;
        
        setCurrentTaskId(task.id);
        // 更新中间面板显示的数据
        setGeneratedImage(task.imageUrl);
        setSlicedImages(task.slices);
        // 同步一些显示用的状态（如 gridMode），让 UI 保持一致
        setGridMode(task.gridMode);
    };

    /**
     * 新增：删除任务
     */
    const handleDeleteTask = (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        if (currentTaskId === taskId) {
            setGeneratedImage(null);
            setSlicedImages([]);
            setCurrentTaskId(null);
        }
    };

    /**
     * 处理文件上传
     * * @param {Array} newAssets - 新上传的资源数组
     */
    const handleFileUpload = (newAssets) => {
        setAssets((prev) => [...prev, ...newAssets]);
    };

    /**
     * 移除资源
     * * @param {string} id - 资源 ID
     */
    const removeAsset = (id) => {
        setAssets((prev) => {
            const target = prev.find((a) => a.id === id);
            if (target) {
                URL.revokeObjectURL(target.url); // 释放 Blob URL
            }
            return prev.filter((a) => a.id !== id);
        });
    };

    /**
     * 下载主网格图片
     */
    const handleDownloadMaster = () => {
        if (generatedImage) {
            downloadFile(generatedImage, 'master_grid.png');
        }
    };

    /**
     * 下载单个切片
     * * @param {string} dataUrl - 切片的 Data URL
     * @param {number} index - 切片索引
     */
    const handleDownloadSlice = (dataUrl, index) => {
        downloadFile(dataUrl, `shot_${index + 1}.png`);
    };

    /**
     * [新增] 处理从 MiddlePanel 返回的清晰化结果
     * 当 MiddlePanel 内部调用即梦 API 成功后，会调用此函数更新 UI
     */
    const handleAddUpscaledResult = (newResult) => {
        setUpscaledResults((prev) => [...prev, newResult]);
        // addLog(`✅ 收到清晰化结果: ${newResult.id}`); // 可选：添加日志
    };

    /**
     * 清晰化处理函数 (针对旧模型或 App 侧直接调用)
     * 注意：MiddlePanel 中的即梦模型现在可能直接在 MiddlePanel 内部处理，
     * 但保留此函数逻辑以兼容旧的调用方式或作为兜底。
     * * @param {string} customPrompt - 自定义提示词
     */
    const handleUpscale = async (customPrompt) => {
        if (processingQueue.length === 0) {
            return setErrorModal({ visible: true, message: '加工队列为空' });
        }

        setIsUpscaling(true);
        addLog(`开始清晰化处理 ${processingQueue.length} 张图片 (模式: ${upscaleModel})...`);

        // 创建队列副本
        const queue = [...processingQueue];

        try {
            const finalPrompt = customPrompt || 'enhance image quality, upscale to 1080p';

            // 串行循环处理
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];

                // 如果不是第一张，延迟 2 秒
                if (i > 0) {
                    addLog(`⏳ 等待 2 秒 (冷却中)...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                addLog(`Processing (${i + 1}/${queue.length}): ${upscaleModel}...`);

                try {
                    let imageUrl;

                    if (upscaleModel === 'jimeng') {
                        // === 调用即梦接口 (App 侧实现) ===
                        let base64Str = "";
                        if (item.dataUrl.startsWith('data:')) {
                            base64Str = item.dataUrl.split(',')[1];
                        } else {
                            const { base64Only } = await urlToBase64(item.dataUrl);
                            base64Str = base64Only;
                        }

                        imageUrl = await callJimengEnhance(base64Str);

                    } else if (config.useMock) {
                        await new Promise(r => setTimeout(r, 1000));
                        imageUrl = item.dataUrl;
                    } else {
                        // 原有 API 调用
                        const params = {
                            prompt: finalPrompt,
                            promptText: finalPrompt,
                            grid: '1x1',
                            model: upscaleModel,
                            quality: '1k',
                            shotSize: { w: 1920, h: 1080 },
                            imageParts: [{ inlineData: { mimeType: 'image/jpeg', data: item.dataUrl.split(',')[1] } }]
                        };

                        if (upscaleModel === 'sora-image') {
                            const controller = new AbortController();
                            imageUrl = await generateSoraImage(config, params, controller.signal, addLog);
                        } else {
                            const controller = new AbortController();
                            imageUrl = await generateGrsaiImage(config, params, controller.signal, addLog);
                        }
                    }

                    // 结果处理
                    let finalDataUrl = imageUrl;
                    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
                        // 简单的容错
                    } else if (!imageUrl.startsWith('data:')) {
                        try {
                            const { fullDataUrl } = await urlToBase64(imageUrl);
                            finalDataUrl = fullDataUrl;
                        } catch (e) {
                            finalDataUrl = imageUrl;
                        }
                    }

                    const newResult = {
                        id: `upscaled-${item.id}-${Date.now()}`,
                        dataUrl: finalDataUrl,
                        aspectRatio: item.aspectRatio,
                        originalId: item.id
                    };

                    setUpscaledResults((prev) => [...prev, newResult]);

                } catch (error) {
                    addLog(`❌ 处理失败 (${i + 1}/${queue.length}): ${error.message}`);
                }
            }

            setProcessingQueue([]);
            addLog(`✅ 所有图片清晰化完成`);

        } catch (error) {
            addLog(`清晰化流程错误: ${error.message}`);
            setErrorModal({ visible: true, message: `系统错误: ${error.message}` });
        } finally {
            setIsUpscaling(false);
        }
    };

    /**
     * 批量下载所有输出结果
     */
    const handleDownloadAllOutput = async () => {
        if (upscaledResults.length === 0) return;

        addLog('开始批量下载输出结果...');
        for (let i = 0; i < upscaledResults.length; i++) {
            downloadFile(upscaledResults[i].dataUrl, `CineGrid_Upscaled_${i + 1}.png`);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        addLog('批量下载完成.');
    };

    /**
     * 清空所有输出结果
     * 在清空前会显示确认对话框
     */
    const handleClearOutput = () => {
        if (upscaledResults.length === 0) return;

        if (window.confirm('确定要清空所有输出结果吗？')) {
            setUpscaledResults([]);
            addLog('已清空所有输出结果');
        }
    };

    // ============================================================
    // 渲染
    // ============================================================

    return (
        <div className="flex h-screen w-full bg-[#09090b] text-zinc-300 font-sans overflow-hidden">
            {/* 左侧控制面板 */}
            <LeftPanel
                config={config}
                onConfigChange={setConfig}
                genOptions={genOptions}
                onGenOptionsChange={setGenOptions}
                outputDirName={outputDirName}
                onSelectOutputFolder={handleSelectOutputFolder}
                prompt={prompt}
                onPromptChange={setPrompt}
                gridMode={gridMode}
                onGridModeChange={setGridMode}
                assets={assets}
                onFileUpload={handleFileUpload}
                onRemoveAsset={removeAsset}
                onAnalyzeAssets={handleAnalyzeAssets}
                isAnalyzing={isAnalyzing}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                showConfig={showConfig}
                onToggleConfig={() => setShowConfig(!showConfig)}
            />

            {/* 中间显示面板 */}
            <MiddlePanel
                config={config}
                genOptions={genOptions}
                outputDirName={outputDirName}
                logs={logs}
                gridMode={gridMode}
                generatedImage={generatedImage}
                slicedImages={slicedImages}
                analysisResult={analysisResult}
                isGenerating={isGenerating}
                onDownloadMaster={handleDownloadMaster}
                onDownloadSlice={handleDownloadSlice}
                onDownloadAll={downloadAllSlices}
                processingQueue={processingQueue}
                setProcessingQueue={setProcessingQueue}
                upscaledResults={upscaledResults}
                isUpscaling={isUpscaling}
                upscaleModel={upscaleModel}
                setUpscaleModel={setUpscaleModel}
                onUpscale={handleUpscale} // 传递原有的处理函数 (兼容旧模型)
                onAddUpscaledResult={handleAddUpscaledResult} // [关键修复] 传递新增的回调函数 (给即梦新模型)
                onDownloadAllOutput={handleDownloadAllOutput}
                onClearOutput={handleClearOutput}
            />

            {/* 最右侧进程列表面板 */}
            <RightPanel 
                tasks={tasks}
                currentTaskId={currentTaskId}
                onTaskSelect={handleTaskSelect}
                onDeleteTask={handleDeleteTask}
            />

            {/* 错误模态框 */}
            {errorModal.visible && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-[#18181b] border border-red-900/50 p-6 rounded max-w-md w-full shadow-2xl">
                        <div className="flex items-center gap-2 text-red-500 font-bold mb-4 text-lg">
                            <AlertTriangle className="w-6 h-6" /> SYSTEM ERROR
                        </div>
                        <p className="text-zinc-300 mb-6 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {errorModal.message}
                        </p>
                        <button
                            onClick={() => setErrorModal({ visible: false, message: '' })}
                            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-bold border border-zinc-700"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}

            {/* 自定义滚动条样式 */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #09090b; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
            `}</style>
        </div>
    );
}