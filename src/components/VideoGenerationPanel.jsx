// src/components/VideoGenerationPanel.jsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, Play, Pause, Loader2, GripVertical,
    Film, Video, Plus, Wand2, X, AlertCircle // [新增] 引入 AlertCircle 图标
} from 'lucide-react';
import { generateSoraVideo } from '../utils/api';
import { urlToBase64 } from '../utils/utils';

// ==========================================
// 安全提示词后缀
// [新增] 预防方案：增加画面质量描述，引导模型生成更符合审美的内容，
// 减少因画面扭曲(body horror)或低质量纹理导致的误判(output_moderation)。
// ==========================================
const SAFE_PROMPT_SUFFIX = ", high quality, cinematic lighting, aesthetic, 8k resolution, highly detailed, photorealistic";

// ==========================================
// 1. Storyboard Card 组件
// 优化点：固定宽度 (w-[280px])，高度随内容自适应
// ==========================================
const StoryboardCard = React.memo(({ card, index, onDragStart, onDragOver, onUpdatePrompt, onGenerate, onDelete }) => {
    const textareaRef = useRef(null);

    // 文本框高度自适应
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [card.prompt]);

    return (
        <div
            // 关键修改：w-[280px] 固定宽度，shrink-0 防止压缩
            className={`w-[280px] shrink-0 bg-zinc-900 rounded-lg border p-3 transition-all flex flex-col gap-3 group/card relative
                ${card.status === 'loading' ? 'border-indigo-500/50' : 'border-zinc-800 hover:border-zinc-600'}`}
            onDragOver={(e) => onDragOver(e, index)}
        >
            {/* Header: Drag Handle & Delete */}
            <div className="flex justify-between items-center">
                <div
                    className="cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-800 rounded text-zinc-600 hover:text-zinc-300"
                    draggable="true"
                    onDragStart={(e) => onDragStart(e, index)}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <GripVertical className="w-4 h-4" />
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">#{index + 1}</div>
                <button
                    onClick={() => onDelete(index)}
                    className="opacity-0 group-hover/card:opacity-100 p-1 hover:bg-red-500/10 hover:text-red-500 rounded transition-all"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Media Area */}
            <div className="relative w-full aspect-video bg-black rounded overflow-hidden border border-zinc-800 group/media">
                {card.status === 'success' && card.videoUrl ? (
                    <video
                        src={card.videoUrl}
                        className="w-full h-full object-cover"
                        loop
                        muted
                        onMouseOver={e => e.target.play()}
                        onMouseOut={e => e.target.pause()}
                    />
                ) : (
                    <img src={card.imageUrl} className="w-full h-full object-cover opacity-80" alt="ref" />
                )}

                {/* Loading State */}
                {card.status === 'loading' && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-[10px] text-indigo-300 font-mono">{card.progress}%</span>
                    </div>
                )}

                {/* [新增] Error State - 专门处理审核失败等错误 */}
                {card.status === 'error' && (
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md flex flex-col items-center justify-center gap-2 p-4 text-center border border-red-500/30 z-10">
                        <AlertCircle className="w-8 h-8 text-red-500 mb-1" />
                        <span className="text-xs text-red-200 font-bold leading-tight">
                            {card.errorMsg || "生成出错"}
                        </span>
                        <button
                            onClick={() => onGenerate(index)}
                            className="mt-2 text-[10px] bg-red-900/50 hover:bg-red-800 px-3 py-1 rounded text-red-200 border border-red-700 transition-colors"
                        >
                            点击重试
                        </button>
                    </div>
                )}
            </div>

            {/* Controls Area */}
            <div className="flex flex-col gap-2">
                <textarea
                    ref={textareaRef}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded text-[11px] text-zinc-300 p-2 focus:border-indigo-500 outline-none transition-colors min-h-[60px] resize-none overflow-hidden leading-relaxed"
                    placeholder="Describe the motion..."
                    value={card.prompt}
                    onChange={(e) => onUpdatePrompt(index, { prompt: e.target.value })}
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                />

                {card.status === 'loading' && (
                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                            style={{ width: `${card.progress}%` }}
                        />
                    </div>
                )}

                <button
                    onClick={() => onGenerate(index)}
                    disabled={card.status === 'loading'}
                    className={`w-full py-1.5 text-[10px] font-bold rounded uppercase flex items-center justify-center gap-2 transition-all
                        ${card.status === 'success'
                        ? 'bg-zinc-800 text-emerald-500 hover:bg-zinc-700'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                >
                    {card.status === 'loading' ? (
                        "Generating..."
                    ) : card.status === 'success' ? (
                        <><Wand2 className="w-3 h-3" /> Regenerate</>
                    ) : (
                        "Generate Video"
                    )}
                </button>
            </div>
        </div>
    );
});

// ==========================================
// 辅助组件：调整大小的手柄
// ==========================================
const ResizeHandle = ({ cursor, onMouseDown, positionClass }) => (
    <div
        onMouseDown={onMouseDown}
        className={`absolute w-5 h-5 z-50 hover:bg-indigo-500/50 transition-colors rounded-full flex items-center justify-center group ${positionClass}`}
        style={{ cursor: cursor }}
    >
        <div className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-white rounded-full transition-colors" />
    </div>
);

// ==========================================
// 主组件
// ==========================================
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_SENSITIVITY = 0.001;
const CARD_WIDTH = 280; // 卡片固定宽度
const GAP = 16; // 卡片间距

export default function VideoGenerationPanel({ config, initialAssets, onBack }) {
    // 数据状态
    const [cards, setCards] = useState(() =>
        initialAssets.map((asset, index) => ({
            id: asset.id || `card-${Date.now()}-${index}`,
            imageUrl: asset.dataUrl,
            prompt: `Cinematic shot, highly detailed, 8k resolution.`,
            videoUrl: null,
            status: 'idle',
            progress: 0,
            errorMsg: null // [新增] 用于存储具体的错误信息
        }))
    );

    // 面板几何状态
    // 初始宽度设置为足够容纳两列卡片 (280*2 + gaps + padding)
    const [panelRect, setPanelRect] = useState({
        x: 100,
        y: 150,
        width: (CARD_WIDTH * 2) + GAP + 32 + 20, // 约 630px
        height: 600
    });

    const [draggedCardIndex, setDraggedCardIndex] = useState(null);
    const [synthesisState, setSynthesisState] = useState({ isPlaying: false, currentIndex: 0 });

    // 交互 Refs
    const transformRef = useRef({ x: 0, y: 0, scale: 1 });
    const canvasRef = useRef(null);
    const contentRef = useRef(null);
    const connectorRef = useRef(null);
    const organizerRef = useRef(null);
    const synthesisRef = useRef(null);
    const isDraggingCanvas = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // 面板交互 Refs
    const isInteractingPanel = useRef(false);
    const panelInteractionType = useRef(null);
    const panelStartRect = useRef(null);
    const interactionStartMouse = useRef(null);

    // ----------------------------------------------------
    // 1. 初始化高度计算 (根据卡片数量预估)
    // ----------------------------------------------------
    useEffect(() => {
        // 简单的初始高度设置，防止一开始面板太小
        const estimatedHeight = Math.min(window.innerHeight - 250, Math.max(500, cards.length * 200));
        setPanelRect(prev => ({ ...prev, height: estimatedHeight }));
    }, []); // 仅挂载时执行一次

    // ----------------------------------------------------
    // 2. 画布变换逻辑 (Zoom & Pan)
    // ----------------------------------------------------
    const applyTransform = useCallback(() => {
        if (contentRef.current) {
            const { x, y, scale } = transformRef.current;
            contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
            if (canvasRef.current) {
                canvasRef.current.style.backgroundPosition = `${x}px ${y}px`;
                canvasRef.current.style.backgroundSize = `${20 * scale}px ${20 * scale}px`;
            }
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheelNative = (e) => {
            if (e.target.closest('.overflow-y-auto')) return;
            e.preventDefault();

            const { x, y, scale } = transformRef.current;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = -e.deltaY * ZOOM_SENSITIVITY;
            const newScale = Math.min(Math.max(scale + delta, MIN_SCALE), MAX_SCALE);

            const ratio = newScale / scale;
            const newX = mouseX - (mouseX - x) * ratio;
            const newY = mouseY - (mouseY - y) * ratio;

            transformRef.current = { x: newX, y: newY, scale: newScale };
            requestAnimationFrame(applyTransform);
        };

        canvas.addEventListener('wheel', handleWheelNative, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheelNative);
    }, [applyTransform]);

    const handleCanvasMouseDown = useCallback((e) => {
        if (e.button === 0 && !isInteractingPanel.current) {
            isDraggingCanvas.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            canvasRef.current.style.cursor = 'grabbing';
        }
    }, []);

    // ----------------------------------------------------
    // 3. 面板交互逻辑 (拖拽 & 调整大小)
    // ----------------------------------------------------
    const handlePanelInteractionStart = (e, type) => {
        e.stopPropagation();
        e.preventDefault();

        isInteractingPanel.current = true;
        panelInteractionType.current = type;
        panelStartRect.current = { ...panelRect };
        interactionStartMouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleGlobalMouseMove = useCallback((e) => {
        // 画布拖拽
        if (isDraggingCanvas.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            transformRef.current.x += dx;
            transformRef.current.y += dy;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            requestAnimationFrame(applyTransform);
            return;
        }

        // 面板操作
        if (isInteractingPanel.current && panelStartRect.current) {
            const currentScale = transformRef.current.scale;
            const dx = (e.clientX - interactionStartMouse.current.x) / currentScale;
            const dy = (e.clientY - interactionStartMouse.current.y) / currentScale;

            const start = panelStartRect.current;
            const type = panelInteractionType.current;
            let newRect = { ...start };

            // 最小尺寸限制 (至少容纳一张卡片 + Padding)
            const MIN_WIDTH = CARD_WIDTH + 64;
            const MIN_HEIGHT = 200;

            if (type === 'move') {
                newRect.x = start.x + dx;
                newRect.y = start.y + dy;
            } else {
                if (type.includes('e')) newRect.width = Math.max(MIN_WIDTH, start.width + dx);
                if (type.includes('s')) newRect.height = Math.max(MIN_HEIGHT, start.height + dy);
                if (type.includes('w')) {
                    const wDelta = Math.min(start.width - MIN_WIDTH, dx);
                    newRect.x = start.x + wDelta;
                    newRect.width = start.width - wDelta;
                }
                if (type.includes('n')) {
                    const hDelta = Math.min(start.height - MIN_HEIGHT, dy);
                    newRect.y = start.y + hDelta;
                    newRect.height = start.height - hDelta;
                }
            }
            setPanelRect(newRect);
        }
    }, [applyTransform]);

    const handleGlobalMouseUp = useCallback(() => {
        isDraggingCanvas.current = false;
        isInteractingPanel.current = false;
        panelInteractionType.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [handleGlobalMouseMove, handleGlobalMouseUp]);

    // ----------------------------------------------------
    // 4. 连线更新
    // ----------------------------------------------------
    const updateConnector = useCallback(() => {
        if (!organizerRef.current || !synthesisRef.current || !connectorRef.current) return;
        const synEl = synthesisRef.current;

        // 使用 panelRect 确定起点，保证拖动时的平滑度
        const startX = panelRect.x + panelRect.width;
        const startY = panelRect.y + 50; // 连接到 Header 附近

        const endX = synEl.offsetLeft;
        const endY = synEl.offsetTop + 25;

        const dist = Math.abs(endX - startX) * 0.5;
        const pathData = `M ${startX} ${startY} C ${startX + dist} ${startY}, ${endX - dist} ${endY}, ${endX} ${endY}`;
        connectorRef.current.setAttribute('d', pathData);
    }, [panelRect]);

    useEffect(() => {
        const timer = setTimeout(updateConnector, 10);
        return () => clearTimeout(timer);
    }, [updateConnector, panelRect]);

    // ----------------------------------------------------
    // 5. 业务逻辑 (CRUD, Drag & Drop)
    // ----------------------------------------------------
    const updateCard = (index, updates) => {
        setCards(prev => {
            const newCards = [...prev];
            newCards[index] = { ...newCards[index], ...updates };
            return newCards;
        });
    };

    const deleteCard = (index) => {
        setCards(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerateVideo = async (index) => {
        const card = cards[index];
        if (!config.apiKey) return alert("API Key missing.");

        // [修改] 重置状态，清空之前的错误信息
        updateCard(index, { status: 'loading', progress: 0, errorMsg: null });

        try {
            let finalImageUrl = card.imageUrl;
            if (card.imageUrl && card.imageUrl.startsWith('blob:')) {
                const { fullDataUrl } = await urlToBase64(card.imageUrl);
                finalImageUrl = fullDataUrl;
            }

            // [新增] 拼接安全提示词，规避画面违规或低质量
            const enhancedPrompt = `${card.prompt}${SAFE_PROMPT_SUFFIX}`;

            const videoUrl = await generateSoraVideo(
                config,
                {
                    prompt: enhancedPrompt, // 使用增强后的提示词
                    imageUrl: finalImageUrl
                },
                (msg) => {
                    const match = msg.match(/Progress:\s*(\d+)%/i);
                    if (match && match[1]) updateCard(index, { progress: parseInt(match[1], 10) });
                }
            );
            updateCard(index, { status: 'success', videoUrl, progress: 100 });
        } catch (error) {
            console.error(error);
            // [新增] 错误信息判断逻辑
            let errorMsg = "生成失败，请重试";
            const errorString = error.toString() || error.message || "";

            // 检测特定的审核错误代码
            if (errorString.includes('output_moderation')) {
                errorMsg = "生成的视频未过审核请重试";
            }

            updateCard(index, {
                status: 'error',
                progress: 0,
                errorMsg: errorMsg // 将具体错误信息存入 state
            });
        }
    };

    const handleDragStart = useCallback((e, index) => {
        setDraggedCardIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
    }, []);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedCardIndex === null || draggedCardIndex === index) return;
        setCards(prev => {
            const newCards = [...prev];
            const item = newCards.splice(draggedCardIndex, 1)[0];
            newCards.splice(index, 0, item);
            return newCards;
        });
        setDraggedCardIndex(index);
    }, [draggedCardIndex]);

    // ----------------------------------------------------
    // 6. 视频预览逻辑
    // ----------------------------------------------------
    const generatedVideos = useMemo(() => cards.filter(c => c.status === 'success' && c.videoUrl), [cards]);
    const playNext = useCallback(() => {
        setSynthesisState(prev => {
            if (prev.currentIndex < generatedVideos.length - 1) return { ...prev, currentIndex: prev.currentIndex + 1 };
            return { ...prev, isPlaying: false, currentIndex: 0 };
        });
    }, [generatedVideos.length]);

    return (
        <div className="w-full h-full bg-[#09090b] relative overflow-hidden font-sans text-zinc-300 select-none">
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-14 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 z-50 flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="font-bold text-sm text-white flex items-center gap-2">
                        <Video className="w-4 h-4 text-indigo-500" /> Studio Workflow
                    </h1>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-600">
                    <span>Wheel: Zoom • Drag Title: Move Panel • Corners: Resize Panel</span>
                </div>
            </div>

            {/* Infinite Canvas */}
            <div
                ref={canvasRef}
                className="w-full h-full cursor-default"
                onMouseDown={handleCanvasMouseDown}
                style={{
                    backgroundImage: 'radial-gradient(circle, #3f3f46 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                    backgroundColor: '#09090b'
                }}
            >
                <div ref={contentRef} className="w-full h-full origin-top-left will-change-transform">
                    {/* Connection Lines Layer */}
                    <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-0">
                        <defs>
                            <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
                                <stop offset="50%" stopColor="#818cf8" stopOpacity="1" />
                                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.2" />
                            </linearGradient>
                        </defs>
                        <path
                            ref={connectorRef}
                            fill="none"
                            stroke="url(#line-gradient)"
                            strokeWidth="2"
                            className="drop-shadow-lg"
                        />
                    </svg>

                    {/* ======================================================== */}
                    {/* Storyboard Panel (Draggable & Resizable) */}
                    {/* ======================================================== */}
                    <div
                        ref={organizerRef}
                        className="absolute bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10 group/panel"
                        style={{
                            left: panelRect.x,
                            top: panelRect.y,
                            width: panelRect.width,
                            height: panelRect.height,
                            // 交互时移除过渡，保证跟手
                            transition: isInteractingPanel.current ? 'none' : 'box-shadow 0.2s'
                        }}
                        // 允许通过点击面板空白处拖动
                        onMouseDown={(e) => {
                            if (!['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
                                handlePanelInteractionStart(e, 'move');
                            }
                        }}
                    >
                        {/* Resize Handles */}
                        <ResizeHandle cursor="nw-resize" positionClass="-top-2 -left-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-nw')} />
                        <ResizeHandle cursor="ne-resize" positionClass="-top-2 -right-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-ne')} />
                        <ResizeHandle cursor="sw-resize" positionClass="-bottom-2 -left-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-sw')} />
                        <ResizeHandle cursor="se-resize" positionClass="-bottom-2 -right-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-se')} />

                        {/* Panel Header */}
                        <div
                            className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-4 rounded-t-xl cursor-move flex-shrink-0"
                            onMouseDown={(e) => handlePanelInteractionStart(e, 'move')}
                        >
                            <GripVertical className="w-4 h-4 text-zinc-600 mr-2" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Storyboard</span>
                            <span className="ml-auto bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full">
                                {cards.length} Clips
                            </span>
                        </div>

                        {/* Content Area - Flex Layout
                            使用 flex-wrap 实现流式布局
                            卡片宽度固定，容器宽度变化时自动换行
                        */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="flex flex-wrap content-start items-start gap-4">
                                {cards.map((card, index) => (
                                    <StoryboardCard
                                        key={card.id}
                                        index={index}
                                        card={card}
                                        onDragStart={handleDragStart}
                                        onDragOver={handleDragOver}
                                        onUpdatePrompt={updateCard}
                                        onGenerate={handleGenerateVideo}
                                        onDelete={deleteCard}
                                    />
                                ))}
                                {/* Add Button 也作为一个卡片，保持尺寸一致 */}
                                <button
                                    className="shrink-0 h-[240px] border border-dashed border-zinc-800 rounded-lg text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex flex-col items-center justify-center gap-2 text-xs uppercase font-bold"
                                    style={{ width: `${CARD_WIDTH}px` }}
                                >
                                    <Plus className="w-6 h-6" />
                                    <span>Add Scene</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Synthesis Panel */}
                    <div
                        ref={synthesisRef}
                        className="absolute left-[900px] top-[150px] w-[400px] bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-4 rounded-t-xl">
                            <Film className="w-4 h-4 text-indigo-500 mr-2" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Preview</span>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="aspect-video bg-black rounded-lg border border-zinc-800 relative overflow-hidden">
                                {generatedVideos.length > 0 ? (
                                    <video
                                        key={generatedVideos[synthesisState.currentIndex]?.id}
                                        src={generatedVideos[synthesisState.currentIndex]?.videoUrl}
                                        className="w-full h-full object-contain"
                                        autoPlay={synthesisState.isPlaying}
                                        onEnded={playNext}
                                        controls={false}
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 space-y-2">
                                        <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                                            <Video className="w-6 h-6 opacity-50" />
                                        </div>
                                        <span className="text-xs font-mono">Waiting for render...</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSynthesisState(p => ({...p, isPlaying: !p.isPlaying}))}
                                    disabled={generatedVideos.length === 0}
                                    className="p-2 bg-indigo-600 rounded text-white disabled:opacity-50"
                                >
                                    {synthesisState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>
                                <div className="text-xs text-zinc-500 font-mono">
                                    {generatedVideos.length} / {cards.length} Ready
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx="true">{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
            `}</style>
        </div>
    );
}