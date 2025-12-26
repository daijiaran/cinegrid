/**
 * ============================================================
 * 中间/右侧主面板组件 (Middle/Right Panel Component)
 * ============================================================
 * 修改说明 (2025-12-26):
 * 1. [集成] 集成 imagFixApi.js，支持 "即梦画面增强" 和 "即梦超清画面"。
 * 2. [预览] 实现 Master Grid 点击全屏纯净预览及滚轮缩放。
 * 3. [工作流] 新增 "视频生成工作流" 入口按钮至输出区域。
 */

import React, { useState, useEffect } from 'react';
import {
    Grid,
    Layers,
    Download,
    Layout,
    Loader2,
    Sparkles,
    BoxSelect,
    Zap,
    ChevronRight,
    ImageDown,
    RefreshCw,
    X,
    Trash2,
    Maximize2,
    Eye,
    Video,
    Clapperboard
} from 'lucide-react';
// 引入下载工具函数
import { downloadFile } from '../utils/utils';
// 引入即梦图像处理 API
import { callJimengEnhance, callJimengSuperResolution } from '../utils/imagFixApi';

export default function MiddlePanel({
                                        config,
                                        genOptions,
                                        outputDirName,
                                        logs,
                                        gridMode,
                                        generatedImage,
                                        slicedImages,
                                        analysisResult,
                                        isGenerating,
                                        onDownloadMaster,
                                        // Props
                                        processingQueue = [],
                                        setProcessingQueue,
                                        upscaledResults = [],
                                        isUpscaling = false,
                                        upscaleModel = 'nano-banana-fast',
                                        setUpscaleModel,
                                        onUpscale,
                                        onDownloadAllOutput,
                                        onClearOutput,
                                        onAddUpscaledResult,
                                        // [新增] 切换到视频生成页面的回调
                                        onSwitchToVideo
                                    }) {
    /**
     * 自定义清晰化提示词 (原有逻辑)
     */
    const CUSTOM_UPSCALE_PROMPT = "将该图片变得更清晰目标分辨率4k，同时保留切割好的比例与尺寸";

    // 计算总网格尺寸和宽高比（用于预览容器）
    const totalGridWidth = parseInt(genOptions.shotWidth) * (gridMode === '2x2' ? 2 : 3);
    const totalGridHeight = parseInt(genOptions.shotHeight) * (gridMode === '2x2' ? 2 : 3);
    const gridAspectRatio = totalGridWidth / totalGridHeight;

    // ============================================================
    // 状态管理
    // ============================================================

    const [currentMasterImage, setCurrentMasterImage] = useState(null);
    const [isJimengProcessing, setIsJimengProcessing] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [previewScale, setPreviewScale] = useState(1);

    useEffect(() => {
        if (generatedImage) {
            setCurrentMasterImage(generatedImage);
        }
    }, [generatedImage]);

    // ============================================================
    // 交互逻辑
    // ============================================================

    const handleSliceClick = (slice) => {
        setCurrentMasterImage(slice.dataUrl);
    };

    const handleMasterGridClick = () => {
        if (currentMasterImage) {
            setPreviewImage({ dataUrl: currentMasterImage, title: 'Preview' });
            setPreviewScale(1);
        }
    };

    const handleResetToOriginal = () => {
        if (generatedImage) {
            setCurrentMasterImage(generatedImage);
        }
    };

    const handlePreviewWheel = (e) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setPreviewScale(prev => {
            const newScale = prev + delta;
            return Math.min(Math.max(newScale, 0.5), 5);
        });
    };

    // ============================================================
    // 队列操作
    // ============================================================

    const addToProcessing = (slice) => {
        if (!processingQueue.find(item => item.id === slice.id)) {
            setProcessingQueue(prev => [...prev, slice]);
        }
    };

    const addAllToProcessing = () => {
        setProcessingQueue(prev => {
            const newItems = slicedImages.filter(slice => !prev.find(p => p.id === slice.id));
            return [...prev, ...newItems];
        });
    };

    const removeFromProcessing = (id) => {
        setProcessingQueue(prev => prev.filter(item => item.id !== id));
    };

    const handleClearProcessing = () => {
        if (window.confirm("确定要清空加工区域的所有图片吗？")) {
            setProcessingQueue([]);
        }
    };

    // ============================================================
    // 即梦 API 处理逻辑
    // ============================================================

    const handleJimengProcessing = async () => {
        if (processingQueue.length === 0) return;
        setIsJimengProcessing(true);

        try {
            for (const item of processingQueue) {
                let resultBase64 = null;
                try {
                    if (upscaleModel === 'jimeng-enhance') {
                        resultBase64 = await callJimengEnhance(item.dataUrl);
                    } else if (upscaleModel === 'jimeng-super') {
                        resultBase64 = await callJimengSuperResolution(item.dataUrl, 'HQ');
                    }
                } catch (apiError) {
                    console.error(`图片 ${item.id} 处理失败:`, apiError);
                    continue;
                }

                if (resultBase64) {
                    const newResult = {
                        id: `upscaled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        dataUrl: resultBase64,
                        aspectRatio: item.aspectRatio,
                        timestamp: Date.now(),
                        sourceId: item.id
                    };
                    if (onAddUpscaledResult) {
                        onAddUpscaledResult(newResult);
                    }
                }
                await new Promise(r => setTimeout(r, 100));
            }
        } catch (error) {
            console.error("批量处理发生错误:", error);
            alert(`处理中断: ${error.message}`);
        } finally {
            setIsJimengProcessing(false);
        }
    };

    const handleUpscaleClick = () => {
        if (upscaleModel === 'jimeng-enhance' || upscaleModel === 'jimeng-super') {
            handleJimengProcessing();
        } else {
            onUpscale(CUSTOM_UPSCALE_PROMPT);
        }
    };

    // ============================================================
    // 下载与拖拽
    // ============================================================

    const handleDownloadProcessingItem = (item, index) => {
        downloadFile(item.dataUrl, `processing_shot_${index + 1}.png`);
    };

    const handleDownloadAllProcessing = async () => {
        if (processingQueue.length === 0) return;
        for (let i = 0; i < processingQueue.length; i++) {
            downloadFile(processingQueue[i].dataUrl, `processing_shot_${i + 1}.png`);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    };

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === dropIndex) return;
        const newQueue = [...processingQueue];
        const [draggedItem] = newQueue.splice(draggedIndex, 1);
        newQueue.splice(dropIndex, 0, draggedItem);
        setProcessingQueue(newQueue);
        setDraggedIndex(null);
    };

    const isBusy = isUpscaling || isJimengProcessing;

    return (
        <div className="flex-grow flex flex-col h-full overflow-hidden bg-[#09090b] relative">
            {/* 全屏预览模态框 */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center overflow-hidden cursor-zoom-out"
                    onClick={() => setPreviewImage(null)}
                    onWheel={handlePreviewWheel}
                >
                    <img
                        src={previewImage.dataUrl}
                        alt="Full Screen Preview"
                        style={{
                            transform: `scale(${previewScale})`,
                            transition: 'transform 0.1s ease-out',
                        }}
                        className="max-w-full max-h-full object-contain select-none"
                    />
                </div>
            )}

            {/* 状态栏 */}
            <div className="h-8 bg-black border-b border-zinc-800 flex items-center px-4 font-mono text-[10px] text-zinc-500 select-none overflow-hidden whitespace-nowrap shrink-0">
                <span className={`mr-2 ${config.useMock ? 'text-blue-500' : 'text-red-500'}`}>
                    ● {config.useMock ? 'MOCK' : 'LIVE'}
                </span>
                <span className="text-zinc-500 mx-2">|</span>
                {genOptions.model} [{genOptions.quality}]
                {outputDirName && (
                    <span className="text-green-500 ml-4 border border-green-900/50 px-1 rounded">
                        Saving to: {outputDirName}
                    </span>
                )}
                {logs[0] && <span className="text-zinc-500 ml-4"> &gt; {logs[0]}</span>}
            </div>

            <div className="flex-grow flex flex-col h-full overflow-y-auto custom-scrollbar">

                {/* 上部：Master Grid & Slices */}
                <div className="flex flex-col md:flex-row min-h-0 border-b border-zinc-800 shrink-0 h-[500px]">
                    {/* MASTER GRID */}
                    <div className="flex-1 flex flex-col p-6 border-r border-zinc-800 bg-[#09090b] relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <div className="flex items-center gap-3">
                                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
                                    <Layout className="w-4 h-4 text-zinc-500" /> MASTER GRID
                                </h2>
                                {generatedImage && currentMasterImage !== generatedImage && (
                                    <button
                                        onClick={handleResetToOriginal}
                                        className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-blue-400 text-[10px] font-bold rounded border border-zinc-700 transition-colors"
                                    >
                                        <Eye className="w-3 h-3" /> 查看原图
                                    </button>
                                )}
                            </div>
                            {currentMasterImage && (
                                <button
                                    onClick={() => onDownloadMaster(currentMasterImage)}
                                    className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <Download className="w-3 h-3" /> Save Current
                                </button>
                            )}
                        </div>

                        <div className="flex-grow flex items-center justify-center min-h-0 relative p-2">
                            <div
                                className="relative shadow-2xl rounded-lg overflow-hidden border border-zinc-800 bg-black max-h-full max-w-full cursor-zoom-in hover:border-blue-500/50 transition-colors"
                                style={{ aspectRatio: `${gridAspectRatio}/1` }}
                                onClick={handleMasterGridClick}
                            >
                                {isGenerating && (
                                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm pointer-events-none">
                                        <Loader2 className={`w-8 h-8 animate-spin mb-3 ${config.useMock ? 'text-blue-500' : 'text-red-600'}`} />
                                        <div className="font-mono text-[10px] text-zinc-400">RENDERING...</div>
                                    </div>
                                )}
                                {currentMasterImage ? (
                                    <img src={currentMasterImage} alt="Master View" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 bg-zinc-900/30">
                                        <BoxSelect className="w-8 h-8 mb-2 opacity-30" />
                                        <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">No Signal</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SLICES */}
                    <div className="flex-1 flex flex-col p-6 bg-[#0c0c0e] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-4 shrink-0 sticky top-0 bg-[#0c0c0e] z-10 pb-2 border-b border-zinc-800/50">
                            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
                                <Grid className="w-4 h-4 text-zinc-500" /> SLICES
                            </h2>
                            <span className="text-[10px] font-mono text-zinc-500">{slicedImages.length} SHOTS</span>
                        </div>
                        <div className={`grid gap-4 ${gridMode === '2x2' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {slicedImages.map((slice, idx) => (
                                <div key={slice.id}
                                     className={`group relative bg-zinc-900 rounded border overflow-hidden shadow-lg cursor-pointer transition-colors ${currentMasterImage === slice.dataUrl ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-zinc-800 hover:border-zinc-500'}`}
                                     onClick={() => handleSliceClick(slice)}
                                     style={{ aspectRatio: `${slice.aspectRatio}/1` }}>
                                    <img src={slice.dataUrl} alt={slice.title} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center pointer-events-none">
                                        <Layout className="w-5 h-5 text-white" />
                                        <span className="text-[8px] text-white mt-1 font-bold">SEND TO MASTER</span>
                                    </div>
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/50 text-[8px] text-white/70 rounded font-mono">#{idx + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Timeline Sequence */}
                <div className="h-44 bg-[#09090b] border-b border-zinc-800 flex flex-col relative shrink-0">
                    <div className="h-8 border-b border-zinc-800 bg-[#0c0c0e] flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            <Layers className="w-3 h-3" /> Timeline Sequence
                        </div>
                        {slicedImages.length > 0 && (
                            <button onClick={addAllToProcessing} className="flex items-center gap-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] font-bold rounded transition-colors uppercase">
                                <RefreshCw className="w-3 h-3" /> 一键添加到加工区域
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-x-auto custom-scrollbar p-4 flex items-center gap-4">
                        {slicedImages.length > 0 ? (
                            slicedImages.map((slice, idx) => (
                                <div key={slice.id} className="relative group flex-shrink-0 flex flex-col items-center gap-1">
                                    <span className="text-[8px] font-mono text-zinc-600">SH{idx + 1}</span>
                                    <div className="relative z-10 h-20 rounded border border-zinc-800 bg-zinc-900 overflow-hidden transition-all hover:border-red-500 hover:scale-105 cursor-pointer"
                                         style={{ aspectRatio: `${slice.aspectRatio}/1` }} onClick={() => addToProcessing(slice)}>
                                        <img src={slice.dataUrl} alt={slice.title} className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="w-full text-center text-[10px] text-zinc-800 font-mono tracking-widest uppercase py-10">Timeline Empty</div>
                        )}
                    </div>
                </div>

                {/* Processing Area */}
                <div className="h-56 bg-[#0c0c0e] border-b border-zinc-800 flex flex-col relative shrink-0">
                    <div className="h-10 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase tracking-widest">
                            <Zap className="w-3 h-3" /> 清晰化加工区域 (Processing)
                        </div>
                        <div className="flex items-center gap-3">
                            <select
                                value={upscaleModel}
                                onChange={(e) => setUpscaleModel(e.target.value)}
                                className="h-7 px-2 bg-black border border-zinc-700 rounded text-[10px] text-zinc-300 outline-none hover:border-zinc-500 transition-colors"
                            >
                                <option value="nano-banana-fast">nano-banana-fast</option>
                                <option value="nano-banana-pro">nano-banana-pro</option>
                                <option value="sora-image">sora-image</option>
                                <option value="jimeng-enhance">即梦画面增强 (Jimeng Enhance)</option>
                                <option value="jimeng-super">即梦超清画面 (Jimeng Super Res)</option>
                            </select>

                            <button
                                onClick={handleUpscaleClick}
                                disabled={isBusy || processingQueue.length === 0}
                                className={`flex items-center gap-2 px-4 py-1.5 text-[10px] font-bold rounded transition-all shadow-lg 
                                    ${isBusy
                                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/20'}`}
                            >
                                {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                {upscaleModel.startsWith('jimeng') ? '执行处理' : '清晰化 (1080P)'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto custom-scrollbar p-4 flex items-center gap-4 pb-12">
                        {processingQueue.length > 0 ? (
                            processingQueue.map((item, idx) => (
                                <div
                                    key={item.id}
                                    className={`relative group flex-shrink-0 transition-all duration-300 ${draggedIndex === idx ? 'opacity-40 scale-95' : 'opacity-100'}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, idx)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleDrop(e, idx)}
                                >
                                    <div
                                        className="h-28 rounded border border-zinc-700 bg-zinc-900 overflow-hidden relative hover:border-white transition-colors cursor-grab active:cursor-grabbing"
                                        style={{ aspectRatio: `${item.aspectRatio}/1` }}
                                        onClick={() => setCurrentMasterImage(item.dataUrl)}
                                    >
                                        <img src={item.dataUrl} alt="" className="w-full h-full object-cover pointer-events-none" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFromProcessing(item.id); }}
                                            className="absolute -top-1 -right-1 bg-zinc-800 text-white p-1 rounded-full border border-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-red-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDownloadProcessingItem(item, idx); }}
                                            className="absolute bottom-1 right-1 bg-black/60 hover:bg-blue-600 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all duration-200 z-30"
                                        >
                                            <Download className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="mt-1 flex justify-between items-center px-1">
                                        <span className="text-[8px] font-mono text-zinc-500 uppercase">Waiting</span>
                                        <span className="text-[8px] font-mono text-zinc-700">#{idx + 1}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="w-full text-center text-[10px] text-zinc-700 font-mono tracking-widest uppercase py-10 border border-dashed border-zinc-800 m-2 rounded">
                                点击上方图片或时间线图片添加到此处
                            </div>
                        )}
                    </div>

                    {processingQueue.length > 0 && (
                        <div className="absolute bottom-2 right-4 z-20 flex gap-2">
                            <button
                                onClick={handleClearProcessing}
                                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-red-900/50 hover:text-red-300 text-zinc-400 text-[10px] font-bold rounded shadow-lg transition-all uppercase border border-zinc-700 hover:border-red-900"
                            >
                                <Trash2 className="w-3 h-3" /> 清空
                            </button>
                            <button
                                onClick={handleDownloadAllProcessing}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded shadow-xl transition-all uppercase group"
                            >
                                <ImageDown className="w-3 h-3 group-hover:animate-bounce" /> 全部下载
                            </button>
                        </div>
                    )}
                </div>

                {/* ============================================================
                    输出区域 (Output Area) - [包含视频工作流入口]
                ============================================================ */}
                <div className="h-60 bg-[#09090b] flex flex-col relative shrink-0">
                    <div className="h-10 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase tracking-widest">
                            <ChevronRight className="w-3 h-3" /> 输出区域 (Output Area)
                        </div>

                        <div className="flex items-center gap-3">
                            {/* [新增] 视频生成入口按钮 */}
                            <button
                                onClick={onSwitchToVideo}
                                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded transition-colors uppercase shadow-lg shadow-indigo-900/20"
                            >
                                <Clapperboard className="w-3 h-3" /> 视频生成工作流
                            </button>

                            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest hidden md:inline ml-2">
                                Target: 1080p / Enhanced
                            </span>

                            {upscaledResults.length > 0 && (
                                <button
                                    onClick={onClearOutput}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 text-zinc-400 text-[9px] font-bold rounded transition-colors uppercase border border-transparent hover:border-red-900/50"
                                >
                                    <Trash2 className="w-3 h-3" /> 清空
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto custom-scrollbar p-4 flex items-center gap-4">
                        {upscaledResults.length > 0 ? (
                            upscaledResults.map((item) => (
                                <div
                                    key={item.id}
                                    className="relative group flex-shrink-0 cursor-zoom-in"
                                    onClick={() => {
                                        setPreviewImage({ dataUrl: item.dataUrl, title: 'Output Result' });
                                        setPreviewScale(1);
                                    }}
                                >
                                    <div className="h-32 rounded border border-green-900/30 bg-zinc-900 overflow-hidden shadow-lg shadow-green-900/10"
                                         style={{ aspectRatio: `${item.aspectRatio}/1` }}>
                                        <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                    </div>
                                    <div className="mt-1 text-center text-[8px] font-mono text-green-600 uppercase">Processed</div>
                                </div>
                            ))
                        ) : (
                            <div className="w-full text-center text-[10px] text-zinc-800 font-mono tracking-widest uppercase py-12">
                                等待清晰化任务完成并在此处展示...
                            </div>
                        )}
                    </div>

                    {upscaledResults.length > 0 && (
                        <div className="absolute bottom-4 right-4 z-20">
                            <button onClick={onDownloadAllOutput} className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded shadow-xl transition-all uppercase group">
                                <ImageDown className="w-4 h-4 group-hover:animate-bounce" /> 一键下载 (Output Area)
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}