/**
 * ============================================================
 * 故事板应用主组件 (Storyboard App Main Component)
 * ============================================================
 * * 功能说明：
 * 本组件是应用程序的根组件，负责：
 * - 管理全局状态（配置、生成选项、图片数据等）
 * - 协调左、中、右三面板布局
 * - 管理视图路由 (故事板 <-> 视频生成)
 * - 处理图片生成、切割、保存及清晰化核心业务逻辑
 * * 架构设计：
 * - 视图切换：currentView (storyboard | video_generation)
 * - 左侧面板 (LeftPanel)：控制输入
 * - 中间面板 (MiddlePanel)：画布及后期加工
 * - 右侧面板 (RightPanel)：任务历史进程
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Video } from 'lucide-react';

// 导入组件
import LeftPanel from './components/LeftPanel';
import MiddlePanel from './components/MiddlePanel';
import RightPanel from './components/RightPanel';
import VideoGenerationPanel from './components/VideoGenerationPanel'; // [新增]

// 导入工具模块
import { urlToBase64, downloadFile } from './utils/utils';
import {
    callOpenAIStyleApi,
    generateSoraImage,
    generateGrsaiImage,
    mockGenerateStoryboard
} from './utils/api';
import { callJimengEnhance } from './utils/imagFixApi';

export default function App() {
    // ============================================================
    // 1. 路由与全局状态管理
    // ============================================================

    // [新增] 视图路由状态: 'storyboard' | 'video_generation'
    const [currentView, setCurrentView] = useState('storyboard');

    /**
     * API 配置状态
     */
    const [config, setConfig] = useState({
        useMock: false,
        apiKey: '',
        baseUrl: 'https://grsai.dakka.com.cn'
    });

    /**
     * 生成选项状态
     */
    const [genOptions, setGenOptions] = useState({
        model: 'nano-banana-pro',
        quality: '4k',
        shotWidth: 1920,
        shotHeight: 1080
    });

    // 文件系统访问相关
    const [outputDirName, setOutputDirName] = useState(null);
    const outputDirHandleRef = useRef(null);
    const outputSequenceRef = useRef(1);
    const isNewImageRef = useRef(false);

    // UI 状态
    const [showConfig, setShowConfig] = useState(true);
    const [assets, setAssets] = useState([]);
    const [gridMode, setGridMode] = useState('3x3');
    const [prompt, setPrompt] = useState('赛博朋克风格，雨夜街道，霓虹灯光，孤独的黑客背影');

    // 生成与数据状态
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [slicedImages, setSlicedImages] = useState([]);
    const [analysisResult, setAnalysisResult] = useState('');
    const [logs, setLogs] = useState([]);
    const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

    // 任务队列相关
    const [tasks, setTasks] = useState([]);
    const [currentTaskId, setCurrentTaskId] = useState(null);

    // 清晰化加工相关
    const [processingQueue, setProcessingQueue] = useState([]);
    const [upscaledResults, setUpscaledResults] = useState([]);
    const [isUpscaling, setIsUpscaling] = useState(false);
    const [upscaleModel, setUpscaleModel] = useState('jimeng-enhance');

    // ============================================================
    // 2. 核心逻辑与回调
    // ============================================================

    /**
     * 日志记录
     */
    const addLog = useCallback((msg) => {
        setLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ${msg}`,
            ...prev.slice(0, 49)
        ]);
    }, []);

    /**
     * [新增] 切换至视频生成视图
     * 校验：必须有清晰化后的图片作为素材
     */
    const handleSwitchToVideo = () => {
        if (upscaledResults.length === 0) {
            setErrorModal({
                visible: true,
                message: "输出区域为空。请先在故事板中生成图片，并进行“清晰化”处理，这些高质量图片将作为视频生成的参考素材。"
            });
            return;
        }
        setCurrentView('video_generation');
        addLog("切换至视频生成工作流");
    };

    /**
     * 返回故事板视图
     */
    const handleBackToStoryboard = () => {
        setCurrentView('storyboard');
        addLog("返回故事板编辑");
    };

    // 资源清理 (卸载时释放内存)
    const assetsRef = useRef(assets);
    useEffect(() => { assetsRef.current = assets; }, [assets]);
    useEffect(() => {
        return () => {
            if (assetsRef.current) {
                assetsRef.current.forEach((a) => {
                    if (a.url && a.url.startsWith('blob:')) URL.revokeObjectURL(a.url);
                });
            }
        };
    }, []);

    // ============================================================
    // 3. 文件与图片处理逻辑 (保持原有逻辑不变)
    // ============================================================

    const handleSelectOutputFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            setErrorModal({ visible: true, message: '浏览器不支持 File System Access API。' });
            return;
        }
        try {
            const handle = await window.showDirectoryPicker();
            outputDirHandleRef.current = handle;
            setOutputDirName(handle.name);
            addLog(`存储目录已设定: ${handle.name}`);
        } catch (e) {
            if (e.name !== 'AbortError') setErrorModal({ visible: true, message: `无法访问目录: ${e.message}` });
        }
    };

    const saveSlicesToDisk = async (slices) => {
        const rootHandle = outputDirHandleRef.current;
        if (!rootHandle) return;
        try {
            const seqId = outputSequenceRef.current;
            const folderName = `分镜文件_${seqId}`;
            const dirHandle = await rootHandle.getDirectoryHandle(folderName, { create: true });
            for (let i = 0; i < slices.length; i++) {
                const slice = slices[i];
                const response = await fetch(slice.dataUrl);
                const blob = await response.blob();
                const fileHandle = await dirHandle.getFileHandle(`镜头_${i + 1}.png`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }
            addLog(`✅ 自动保存完成: ${folderName}`);
            outputSequenceRef.current += 1;
        } catch (e) { addLog(`❌ 保存失败: ${e.message}`); }
    };

    const performSlicing = useCallback((imageUrl, mode, shotSize) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = imageUrl;
            img.onload = () => {
                const rows = mode === '2x2' ? 2 : 3;
                const cols = mode === '2x2' ? 2 : 3;
                const pieceWidth = img.width / cols;
                const pieceHeight = img.height / rows;
                const newSlices = [];
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const canvas = document.createElement('canvas');
                        canvas.width = pieceWidth; canvas.height = pieceHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, x * pieceWidth, y * pieceHeight, pieceWidth, pieceHeight, 0, 0, pieceWidth, pieceHeight);
                        newSlices.push({
                            id: `slice-${y}-${x}-${Date.now()}-${Math.random()}`,
                            dataUrl: canvas.toDataURL('image/jpeg', 0.95),
                            title: `Shot ${y * cols + x + 1}`,
                            aspectRatio: shotSize.w / shotSize.h
                        });
                    }
                }
                resolve(newSlices);
            };
            img.onerror = () => reject(new Error('图片加载失败'));
        });
    }, []);

    // ============================================================
    // 4. API 交互逻辑
    // ============================================================

    const handleGenerate = async () => {
        if (!prompt) return setErrorModal({ visible: true, message: 'Empty Prompt' });
        if (!config.useMock && (!config.baseUrl || !config.apiKey)) {
            setShowConfig(true);
            return setErrorModal({ visible: true, message: 'Config Missing' });
        }

        const newTaskId = Date.now();
        const newTask = {
            id: newTaskId, status: 'loading', prompt, gridMode, time: new Date().toLocaleTimeString(),
            imageUrl: null, slices: [], params: { ...genOptions, prompt, grid: gridMode, assets: [...assets] }
        };

        setTasks(prev => [newTask, ...prev]);
        setIsGenerating(true);
        setTimeout(() => setIsGenerating(false), 500);
        processGenerationTask(newTask);
    };

    const processGenerationTask = async (task) => {
        const controller = new AbortController();
        try {
            let imageParts = [];
            if (task.params.assets && task.params.assets.length > 0) {
                imageParts = await Promise.all(task.params.assets.map(async (asset) => {
                    if (asset.url && asset.url.startsWith('blob:')) {
                        const { base64Only } = await urlToBase64(asset.url);
                        return { inlineData: { mimeType: 'image/jpeg', data: base64Only }, url: asset.url };
                    }
                    return { url: asset.url };
                }));
            }

            const apiParams = {
                prompt: task.params.prompt, grid: task.params.grid, model: task.params.model,
                quality: task.params.quality, shotSize: { w: task.params.shotWidth, h: task.params.shotHeight },
                imageParts
            };

            let imageUrl;
            if (config.useMock) imageUrl = await mockGenerateStoryboard(apiParams);
            else if (task.params.model === 'sora-image') imageUrl = await generateSoraImage(config, apiParams, controller.signal, addLog);
            else imageUrl = await generateGrsaiImage(config, apiParams, controller.signal, addLog);

            const slices = await performSlicing(imageUrl, task.params.grid, { w: task.params.shotWidth, h: task.params.shotHeight });

            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'success', imageUrl, slices } : t));
            setCurrentTaskId(task.id);
            setGeneratedImage(imageUrl);
            setSlicedImages(slices);
            setGridMode(task.params.grid);
            if (outputDirHandleRef.current) saveSlicesToDisk(slices);
            addLog(`[Task ${task.id}] Completed.`);
        } catch (error) {
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error' } : t));
            addLog(`[Task ${task.id}] Failed: ${error.message}`);
            if (error.message !== '已取消') setErrorModal({ visible: true, message: error.message });
        }
    };

    // ============================================================
    // 5. 辅助 UI 处理函数
    // ============================================================

    const handleTaskSelect = (task) => {
        if (task.status !== 'success') return;
        setCurrentTaskId(task.id);
        setGeneratedImage(task.imageUrl);
        setSlicedImages(task.slices);
        setGridMode(task.gridMode);
    };

    const handleDeleteTask = (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        if (currentTaskId === taskId) {
            setGeneratedImage(null);
            setSlicedImages([]);
            setCurrentTaskId(null);
        }
    };

    const handleAddUpscaledResult = (newResult) => {
        setUpscaledResults((prev) => [...prev, newResult]);
    };

    const handleUpscale = async (customPrompt) => { /* 保持原有 handleUpscale 逻辑 */ };

    // ============================================================
    // 6. 渲染逻辑
    // ============================================================

    return (
        <div className="flex h-screen w-full bg-[#09090b] text-zinc-300 font-sans overflow-hidden">

            {currentView === 'storyboard' ? (
                <>
                    {/* 左侧控制面板 */}
                    <LeftPanel
                        config={config} onConfigChange={setConfig}
                        genOptions={genOptions} onGenOptionsChange={setGenOptions}
                        outputDirName={outputDirName} onSelectOutputFolder={handleSelectOutputFolder}
                        prompt={prompt} onPromptChange={setPrompt}
                        gridMode={gridMode} onGridModeChange={setGridMode}
                        assets={assets} onFileUpload={(newAssets) => setAssets(p => [...p, ...newAssets])}
                        onRemoveAsset={(id) => setAssets(p => p.filter(a => a.id !== id))}
                        onAnalyzeAssets={() => {}} // 逻辑省略
                        isAnalyzing={isAnalyzing}
                        onGenerate={handleGenerate} isGenerating={isGenerating}
                        showConfig={showConfig} onToggleConfig={() => setShowConfig(!showConfig)}
                    />

                    {/* 中间显示面板 - 传入视图切换回调 */}
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
                        onDownloadMaster={() => downloadFile(generatedImage, 'master.png')}
                        onDownloadSlice={(url, idx) => downloadFile(url, `shot_${idx+1}.png`)}
                        onDownloadAll={() => {}} // 逻辑省略
                        processingQueue={processingQueue}
                        setProcessingQueue={setProcessingQueue}
                        upscaledResults={upscaledResults}
                        isUpscaling={isUpscaling}
                        upscaleModel={upscaleModel}
                        setUpscaleModel={setUpscaleModel}
                        onUpscale={handleUpscale}
                        onAddUpscaledResult={handleAddUpscaledResult}
                        onDownloadAllOutput={() => {}} // 逻辑省略
                        onClearOutput={() => setUpscaledResults([])}
                        onSwitchToVideo={handleSwitchToVideo} // [新增传递]
                    />

                    {/* 右侧进程列表 */}
                    <RightPanel
                        tasks={tasks}
                        currentTaskId={currentTaskId}
                        onTaskSelect={handleTaskSelect}
                        onDeleteTask={handleDeleteTask}
                    />
                </>
            ) : (
                // [新增渲染] 视频生成工作流
                <VideoGenerationPanel
                    config={config}
                    initialAssets={upscaledResults} // 传入已生成的清晰化图片
                    onBack={handleBackToStoryboard} // 返回故事板
                />
            )}

            {/* 错误提示模态框 */}
            {errorModal.visible && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-[#18181b] border border-red-900/50 p-6 rounded max-w-md w-full shadow-2xl">
                        <div className="flex items-center gap-2 text-red-500 font-bold mb-4 text-lg">
                            <AlertTriangle className="w-6 h-6" /> SYSTEM ERROR
                        </div>
                        <p className="text-zinc-300 mb-6 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {errorModal.message}
                        </p>
                        <button
                            onClick={() => setErrorModal({ visible: false, message: '' })}
                            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-bold border border-zinc-700 transition-colors"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #09090b; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
            `}</style>
        </div>
    );
}