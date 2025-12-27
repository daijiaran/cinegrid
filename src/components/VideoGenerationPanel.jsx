// src/components/VideoGenerationPanel.jsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, Play, Pause, Loader2, GripVertical,
    Film, Video, Plus, Wand2, X, AlertCircle, Download, Layers, CheckCircle2
} from 'lucide-react';
import { generateSoraVideo } from '../utils/api';
import { urlToBase64 } from '../utils/utils';

// ==========================================
// 安全提示词后缀
// ==========================================
const SAFE_PROMPT_SUFFIX = ", high quality, cinematic lighting, aesthetic, 8k resolution, highly detailed, photorealistic";

// ==========================================
// 工具函数：下载文件
// ==========================================
const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// ==========================================
// Storyboard Card 组件
// ==========================================
const StoryboardCard = React.memo(({ card, index, onDragStart, onDragOver, onUpdatePrompt, onGenerate, onDelete }) => {
    const textareaRef = useRef(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [card.prompt]);

    return (
        <div
            className={`w-[280px] shrink-0 bg-zinc-900 rounded-lg border p-3 transition-all flex flex-col gap-3 group/card relative
                ${card.status === 'loading' ? 'border-indigo-500/50' : 'border-zinc-800 hover:border-zinc-600'}`}
            onDragOver={(e) => onDragOver(e, index)}
        >
            {/* Header */}
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
                        crossOrigin="anonymous"
                        onMouseOver={e => e.target.play()}
                        onMouseOut={e => e.target.pause()}
                    />
                ) : (
                    <img src={card.imageUrl} className="w-full h-full object-cover opacity-80" alt="ref" />
                )}

                {card.status === 'loading' && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-[10px] text-indigo-300 font-mono">{card.progress}%</span>
                    </div>
                )}

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

                {/* Buttons Row */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onGenerate(index)}
                        disabled={card.status === 'loading'}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded uppercase flex items-center justify-center gap-2 transition-all
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

                    {/* [新增] 单个视频下载按钮 */}
                    {card.status === 'success' && card.videoUrl && (
                        <button
                            onClick={() => downloadFile(card.videoUrl, `clip-${index + 1}.mp4`)}
                            className="w-8 shrink-0 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded transition-colors"
                            title="Download Clip"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
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
const CARD_WIDTH = 280;
const GAP = 16;
const LOCAL_STORAGE_KEY = 'cinegrid_video_cards';

export default function VideoGenerationPanel({ config, initialAssets, onBack }) {
    // ============================================================
    // 1. 数据状态与持久化逻辑
    // ============================================================
    const [cards, setCards] = useState(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("读取本地缓存失败:", error);
            return [];
        }
    });

    // 监听：initialAssets (来自 MiddlePanel 的新图片)
    useEffect(() => {
        const mergeAssets = async () => {
            if (!initialAssets || initialAssets.length === 0) return;
            const newItemsToProcess = initialAssets.filter(asset =>
                !cards.some(card => card.id === asset.id)
            );

            if (newItemsToProcess.length === 0) return;

            const processedCards = [];
            for (const asset of newItemsToProcess) {
                let finalImageUrl = asset.dataUrl;
                if (finalImageUrl && finalImageUrl.startsWith('blob:')) {
                    try {
                        const res = await urlToBase64(finalImageUrl);
                        finalImageUrl = res.fullDataUrl || res;
                    } catch (e) {
                        console.error("Blob to Base64 conversion failed:", e);
                    }
                }

                processedCards.push({
                    id: asset.id || `card-${Date.now()}-${Math.random()}`,
                    imageUrl: finalImageUrl,
                    prompt: `Cinematic shot, highly detailed, 8k resolution.`,
                    videoUrl: null,
                    status: 'idle',
                    progress: 0,
                    errorMsg: null
                });
            }

            if (processedCards.length > 0) {
                setCards(prev => [...prev, ...processedCards]);
            }
        };

        mergeAssets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialAssets]);

    useEffect(() => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cards));
        } catch (error) {
            console.error("写入本地缓存失败 (可能超出配额):", error);
        }
    }, [cards]);


    // ============================================================
    // 2. UI 交互状态
    // ============================================================
    const [panelRect, setPanelRect] = useState({
        x: 100, y: 150, width: (CARD_WIDTH * 2) + GAP + 32 + 20, height: 600
    });

    const [draggedCardIndex, setDraggedCardIndex] = useState(null);
    const [synthesisState, setSynthesisState] = useState({ isPlaying: false, currentIndex: 0 });

    // [新增] 合并相关状态
    const [mergeState, setMergeState] = useState({
        isMerging: false,
        progress: 0,
        mergedUrl: null
    });

    // 交互 Refs
    const transformRef = useRef({ x: 0, y: 0, scale: 1 });
    const canvasRef = useRef(null);
    const contentRef = useRef(null);
    const connectorRef = useRef(null);
    const organizerRef = useRef(null);
    const synthesisRef = useRef(null);
    const isDraggingCanvas = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const isInteractingPanel = useRef(false);
    const panelInteractionType = useRef(null);
    const panelStartRect = useRef(null);
    const interactionStartMouse = useRef(null);

    // ----------------------------------------------------
    // 合并视频逻辑 (核心算法)
    // ----------------------------------------------------
    const handleMergeVideos = async () => {
        const validCards = cards.filter(c => c.status === 'success' && c.videoUrl);
        if (validCards.length < 1) return alert("至少需要一个生成的视频才能合并。");

        setMergeState({ isMerging: true, progress: 0, mergedUrl: null });

        try {
            // 1. 创建离屏画布和视频元素
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const video = document.createElement('video');
            video.crossOrigin = "anonymous";
            video.muted = true; // 必须静音才能自动播放

            // 默认分辨率 (假设所有视频都是 16:9 且尺寸类似，取第一个的尺寸或固定)
            // 实际生产中应动态获取第一个视频的尺寸
            canvas.width = 1280;
            canvas.height = 720;

            // 2. 设置 MediaRecorder
            const stream = canvas.captureStream(30); // 30 FPS
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.start();

            // 3. 串行播放并录制
            for (let i = 0; i < validCards.length; i++) {
                const card = validCards[i];

                await new Promise((resolve, reject) => {
                    video.src = card.videoUrl;
                    video.currentTime = 0;

                    video.onloadedmetadata = () => {
                        // 如果是第一个视频，调整画布大小匹配视频
                        if (i === 0) {
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                        }
                    };

                    video.onplay = () => {
                        const draw = () => {
                            if (video.paused || video.ended) return;
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            requestAnimationFrame(draw);
                        };
                        draw();
                    };

                    video.onended = () => {
                        resolve();
                    };

                    video.onerror = (e) => {
                        console.error("Video play error", e);
                        resolve(); // 出错跳过，继续下一个
                    };

                    video.play().catch(e => {
                        console.error("Play failed", e);
                        resolve();
                    });
                });

                // 更新进度
                setMergeState(prev => ({
                    ...prev,
                    progress: Math.round(((i + 1) / validCards.length) * 100)
                }));
            }

            // 4. 完成录制
            mediaRecorder.stop();
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const mergedUrl = URL.createObjectURL(blob);
                setMergeState({ isMerging: false, progress: 100, mergedUrl });
            };

        } catch (error) {
            console.error("Merge failed:", error);
            setMergeState({ isMerging: false, progress: 0, mergedUrl: null });
            alert("合并失败，请检查浏览器兼容性或网络跨域设置。");
        }
    };


    // ----------------------------------------------------
    // 初始化与 Canvas 变换逻辑
    // ----------------------------------------------------
    useEffect(() => {
        const estimatedHeight = Math.min(window.innerHeight - 250, Math.max(500, cards.length * 200));
        setPanelRect(prev => ({ ...prev, height: estimatedHeight }));
    }, []);

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
    // 面板交互逻辑
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
        if (isDraggingCanvas.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            transformRef.current.x += dx;
            transformRef.current.y += dy;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            requestAnimationFrame(applyTransform);
            return;
        }

        if (isInteractingPanel.current && panelStartRect.current) {
            const currentScale = transformRef.current.scale;
            const dx = (e.clientX - interactionStartMouse.current.x) / currentScale;
            const dy = (e.clientY - interactionStartMouse.current.y) / currentScale;

            const start = panelStartRect.current;
            const type = panelInteractionType.current;
            let newRect = { ...start };

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
    // 连线与业务逻辑
    // ----------------------------------------------------
    const updateConnector = useCallback(() => {
        if (!organizerRef.current || !synthesisRef.current || !connectorRef.current) return;
        const synEl = synthesisRef.current;
        const startX = panelRect.x + panelRect.width;
        const startY = panelRect.y + 50;
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

    const updateCard = (index, updates) => {
        setCards(prev => {
            const newCards = [...prev];
            newCards[index] = { ...newCards[index], ...updates };
            return newCards;
        });
        // 重置合并状态，因为源视频变了
        if(mergeState.mergedUrl) setMergeState({ isMerging: false, progress: 0, mergedUrl: null });
    };

    const deleteCard = (index) => {
        setCards(prev => prev.filter((_, i) => i !== index));
        if(mergeState.mergedUrl) setMergeState({ isMerging: false, progress: 0, mergedUrl: null });
    };

    const handleGenerateVideo = async (index) => {
        const card = cards[index];
        if (!config.apiKey) return alert("API Key missing.");

        updateCard(index, { status: 'loading', progress: 0, errorMsg: null });

        try {
            let finalImageUrl = card.imageUrl;
            if (card.imageUrl && card.imageUrl.startsWith('blob:')) {
                const { fullDataUrl } = await urlToBase64(card.imageUrl);
                finalImageUrl = fullDataUrl;
            }

            const enhancedPrompt = `${card.prompt}${SAFE_PROMPT_SUFFIX}`;

            const videoUrl = await generateSoraVideo(
                config,
                { prompt: enhancedPrompt, imageUrl: finalImageUrl },
                (msg) => {
                    const match = msg.match(/Progress:\s*(\d+)%/i);
                    if (match && match[1]) updateCard(index, { progress: parseInt(match[1], 10) });
                }
            );
            updateCard(index, { status: 'success', videoUrl, progress: 100 });
        } catch (error) {
            console.error(error);
            let errorMsg = "生成失败，请重试";
            const errorString = error.toString() || error.message || "";
            if (errorString.includes('output_moderation')) errorMsg = "生成的视频未过审核请重试";
            updateCard(index, { status: 'error', progress: 0, errorMsg: errorMsg });
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
    // 视频预览逻辑
    // ----------------------------------------------------
    const generatedVideos = useMemo(() => cards.filter(c => c.status === 'success' && c.videoUrl), [cards]);

    // 播放列表逻辑
    const playNext = useCallback(() => {
        if(mergeState.mergedUrl) return; // 如果在播放合成视频，则不自动跳下一个
        setSynthesisState(prev => {
            if (prev.currentIndex < generatedVideos.length - 1) return { ...prev, currentIndex: prev.currentIndex + 1 };
            return { ...prev, isPlaying: false, currentIndex: 0 };
        });
    }, [generatedVideos.length, mergeState.mergedUrl]);

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

                    {/* Storyboard Panel */}
                    <div
                        ref={organizerRef}
                        className="absolute bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10 group/panel"
                        style={{
                            left: panelRect.x,
                            top: panelRect.y,
                            width: panelRect.width,
                            height: panelRect.height,
                            transition: isInteractingPanel.current ? 'none' : 'box-shadow 0.2s'
                        }}
                        onMouseDown={(e) => {
                            if (!['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
                                handlePanelInteractionStart(e, 'move');
                            }
                        }}
                    >
                        <ResizeHandle cursor="nw-resize" positionClass="-top-2 -left-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-nw')} />
                        <ResizeHandle cursor="ne-resize" positionClass="-top-2 -right-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-ne')} />
                        <ResizeHandle cursor="sw-resize" positionClass="-bottom-2 -left-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-sw')} />
                        <ResizeHandle cursor="se-resize" positionClass="-bottom-2 -right-2" onMouseDown={(e) => handlePanelInteractionStart(e, 'resize-se')} />

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

                    {/* Preview / Synthesis Panel */}
                    <div
                        ref={synthesisRef}
                        className="absolute left-[900px] top-[150px] w-[400px] bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-4 rounded-t-xl">
                            <Film className="w-4 h-4 text-indigo-500 mr-2" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Preview & Merge</span>
                        </div>
                        <div className="p-4 space-y-4">

                            {/* 视频播放区域 */}
                            <div className="aspect-video bg-black rounded-lg border border-zinc-800 relative overflow-hidden shadow-inner">
                                {mergeState.mergedUrl ? (
                                    // 显示合并后的视频
                                    <video
                                        src={mergeState.mergedUrl}
                                        className="w-full h-full object-contain"
                                        controls
                                        autoPlay
                                    />
                                ) : generatedVideos.length > 0 ? (
                                    // 显示播放列表
                                    <>
                                        <video
                                            key={generatedVideos[synthesisState.currentIndex]?.id}
                                            src={generatedVideos[synthesisState.currentIndex]?.videoUrl}
                                            className="w-full h-full object-contain"
                                            autoPlay={synthesisState.isPlaying}
                                            onEnded={playNext}
                                            controls={false}
                                        />
                                        {/* Overlay Info */}
                                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur rounded text-[10px] text-zinc-400 font-mono">
                                            Clip {synthesisState.currentIndex + 1} / {generatedVideos.length}
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 space-y-2">
                                        <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                                            <Video className="w-6 h-6 opacity-50" />
                                        </div>
                                        <span className="text-xs font-mono">No videos generated yet</span>
                                    </div>
                                )}

                                {/* 合并过程中的遮罩层 */}
                                {mergeState.isMerging && (
                                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                                        <div className="text-xs text-indigo-200 font-bold">Processing... {mergeState.progress}%</div>
                                    </div>
                                )}
                            </div>

                            {/* 播放控制与合并进度条 */}
                            <div className="space-y-3">
                                {/* 可视化合成进度条 */}
                                {mergeState.isMerging && (
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 transition-all duration-200 ease-linear"
                                            style={{ width: `${mergeState.progress}%` }}
                                        />
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    {/* 左侧：播放控制 (仅在非合并结果模式下显示) */}
                                    <div className="flex items-center gap-2">
                                        {!mergeState.mergedUrl && (
                                            <>
                                                <button
                                                    onClick={() => setSynthesisState(p => ({...p, isPlaying: !p.isPlaying}))}
                                                    disabled={generatedVideos.length === 0}
                                                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-white disabled:opacity-50 transition-colors"
                                                >
                                                    {synthesisState.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className="text-xs text-zinc-500 font-mono">
                                                    {generatedVideos.length} clips ready
                                                </span>
                                            </>
                                        )}
                                        {mergeState.mergedUrl && (
                                            <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Merged
                                            </span>
                                        )}
                                    </div>

                                    {/* 右侧：合并与下载 */}
                                    <div className="flex items-center gap-2">
                                        {mergeState.mergedUrl ? (
                                            <button
                                                onClick={() => downloadFile(mergeState.mergedUrl, 'full_movie.webm')}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20"
                                            >
                                                <Download className="w-3 h-3" /> Download Merged
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleMergeVideos}
                                                disabled={generatedVideos.length < 2 || mergeState.isMerging}
                                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all"
                                            >
                                                <Layers className="w-3 h-3" /> Merge Videos
                                            </button>
                                        )}
                                    </div>
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