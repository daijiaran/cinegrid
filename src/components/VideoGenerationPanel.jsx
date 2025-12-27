// src/components/VideoGenerationPanel.jsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, Play, Pause, Loader2, GripVertical,
    Film, Video, Plus, Wand2, X, AlertCircle, Download, Layers, CheckCircle2,
    FileText, ArrowRightFromLine, Save, DownloadCloud
} from 'lucide-react';
import { generateSoraVideo, callOpenAIStyleApi } from '../utils/api';
import { urlToBase64 } from '../utils/utils';

// ==========================================
// IndexedDB 数据库管理工具 (保持不变)
// ==========================================
const DB_NAME = 'CineGridDB';
const DB_VERSION = 1;
const STORE_NAME = 'video_cards_store';

const dbHelper = {
    open: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    saveAll: async (cards) => {
        const db = await dbHelper.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const clearReq = store.clear();

            clearReq.onsuccess = () => {
                let completed = 0;
                if (cards.length === 0) resolve();

                cards.forEach(card => {
                    const req = store.put(card);
                    req.onsuccess = () => {
                        completed++;
                        if (completed === cards.length) resolve();
                    };
                    req.onerror = (e) => reject(e.target.error);
                });
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    getAll: async () => {
        const db = await dbHelper.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }
};

// ==========================================
// 常量与工具函数
// ==========================================
const SAFE_PROMPT_SUFFIX = ", high quality, cinematic lighting, aesthetic, 8k resolution, highly detailed, photorealistic";

const downloadFile = async (url, filename) => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.warn("自动下载失败，尝试在新窗口打开:", error);
        window.open(url, '_blank');
    }
};

const robustJSONParse = (jsonString) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn("标准 JSON 解析失败，尝试修复模式...", e);
        try {
            const matches = jsonString.match(/"((?:[^"\\]|\\.)*)"/g);
            if (matches) {
                const result = matches.map(m => {
                    let content = m.slice(1, -1);
                    content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    return content;
                });
                return result;
            }
        } catch (err2) {
            console.error("修复解析也失败了", err2);
        }
        throw e;
    }
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

                <div className="flex gap-2">
                    <button
                        onClick={() => onGenerate(index)}
                        disabled={card.status === 'loading'}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded uppercase flex items-center justify-center gap-2 transition-all
                            ${card.status === 'success'
                            ? 'bg-zinc-800 text-emerald-500 hover:bg-zinc-700'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                    >
                        {card.status === 'loading' ? "Generating..." : card.status === 'success' ? <><Wand2 className="w-3 h-3" /> Regenerate</> : "Generate Video"}
                    </button>
                    {card.status === 'success' && card.videoUrl && (
                        <button
                            onClick={() => downloadFile(card.videoUrl, `clip-${index + 1}.mp4`)}
                            className="w-8 shrink-0 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded transition-colors"
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
// 主组件配置
// ==========================================
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_SENSITIVITY = 0.001;

// [配置] 布局常量
const SIDEBAR_WIDTH = 240;
const CARD_WIDTH = 280;
const GAP = 16;
// 估算卡片垂直高度（包含内容和预估的文本区域）用于正方形计算
const EST_CARD_HEIGHT = 450;
const CONTAINER_PADDING = 32; // p-4 * 2

export default function VideoGenerationPanel({ config, initialAssets, onBack }) {
    // 数据状态
    const [cards, setCards] = useState([]);
    const [isDbLoaded, setIsDbLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    // 交互状态
    const [panelRect, setPanelRect] = useState({
        x: 100, y: 150, width: 1000, height: 'auto'
    });

    const [draggedCardIndex, setDraggedCardIndex] = useState(null);
    const [synthesisState, setSynthesisState] = useState({ isPlaying: false, currentIndex: 0 });
    const [mergeState, setMergeState] = useState({ isMerging: false, progress: 0, mergedUrl: null });
    const [totalScript, setTotalScript] = useState("");
    const [isSplitting, setIsSplitting] = useState(false);

    // Refs
    const transformRef = useRef({ x: 0, y: 0, scale: 1 });
    const canvasRef = useRef(null);
    const contentRef = useRef(null);
    const connectorRef = useRef(null);
    const organizerRef = useRef(null);
    const synthesisRef = useRef(null);
    const isDraggingCanvas = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const isInteractingPanel = useRef(false);
    const panelStartRect = useRef(null);
    const interactionStartMouse = useRef(null);
    const isSpacePressed = useRef(false);

    // ============================================================
    // 初始化与数据加载
    // ============================================================
    useEffect(() => {
        const loadData = async () => {
            try {
                const savedCards = await dbHelper.getAll();
                if (savedCards && savedCards.length > 0) setCards(savedCards);
            } catch (error) {
                console.error("加载 IndexedDB 数据失败:", error);
            } finally {
                setIsDbLoaded(true);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const mergeAssets = async () => {
            if (!isDbLoaded || !initialAssets || initialAssets.length === 0) return;
            const newItemsToProcess = initialAssets.filter(asset => !cards.some(card => card.id === asset.id));
            if (newItemsToProcess.length === 0) return;

            const processedCards = [];
            for (const asset of newItemsToProcess) {
                let finalImageUrl = asset.dataUrl;
                if (finalImageUrl && finalImageUrl.startsWith('blob:')) {
                    try {
                        const res = await urlToBase64(finalImageUrl);
                        finalImageUrl = res.fullDataUrl || res;
                    } catch (e) {
                        console.error("Blob to Base64 failed:", e);
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
            if (processedCards.length > 0) setCards(prev => [...prev, ...processedCards]);
        };
        mergeAssets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialAssets, isDbLoaded]);

    useEffect(() => {
        if (!isDbLoaded) return;
        const timer = setTimeout(async () => {
            setIsSaving(true);
            try { await dbHelper.saveAll(cards); } catch (e) { console.error(e); } finally { setIsSaving(false); }
        }, 1000);
        return () => clearTimeout(timer);
    }, [cards, isDbLoaded]);

    // ============================================================
    // [核心] 自适应正方形布局算法
    // ============================================================
    useEffect(() => {
        // 如果没有卡片，保持一个默认宽度
        if (cards.length === 0) {
            setPanelRect(prev => ({ ...prev, width: SIDEBAR_WIDTH + CARD_WIDTH * 2 + GAP * 3 }));
            return;
        }

        const totalItems = cards.length + 1; // 卡片数量 + 1个添加按钮

        // 寻找最佳列数 (Best Columns) 使得整个面板接近 1:1 正方形
        let bestCols = 2; // 至少2列
        let bestDiff = Infinity;

        // 暴力枚举 1 到 totalItems 的列数，通常 item 不会特别多，计算量可忽略
        for (let cols = 1; cols <= totalItems; cols++) {
            // 计算当前列数下的行数
            const rows = Math.ceil(totalItems / cols);

            // 计算总宽度: 侧边栏 + (列数 * 卡片宽) + (间隙) + 内边距
            const currentWidth = SIDEBAR_WIDTH + (cols * CARD_WIDTH) + ((cols + 1) * GAP);

            // 计算预估高度: 标题栏(40) + (行数 * 卡片高) + (行间隙) + 内边距
            const currentHeight = 40 + (rows * EST_CARD_HEIGHT) + ((rows + 1) * GAP);

            // 计算宽高比 (目标是 1.0)
            const ratio = currentWidth / currentHeight;
            const diff = Math.abs(1 - ratio);

            // 如果当前配置更接近正方形，记录下来
            if (diff < bestDiff) {
                bestDiff = diff;
                bestCols = cols;
            }
        }

        // 修正：如果计算出1列，且总数大于1，为了美观强制至少2列（除非真的很长）
        if (bestCols < 2 && totalItems > 3) bestCols = 2;

        // 根据最佳列数计算最终面板宽度
        const finalWidth = SIDEBAR_WIDTH + (bestCols * CARD_WIDTH) + ((bestCols) * GAP) + CONTAINER_PADDING;

        setPanelRect(prev => ({
            ...prev,
            width: finalWidth
        }));

    }, [cards.length]); // 仅当卡片数量变化时重新计算布局


    // ============================================================
    // 键盘与鼠标交互逻辑 (缩放/拖拽)
    // ============================================================
    useEffect(() => {
        const handleKeyDown = (e) => { if (e.code === 'Space') isSpacePressed.current = true; };
        const handleKeyUp = (e) => { if (e.code === 'Space') isSpacePressed.current = false; };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
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
            if (e.target.id === 'master-script-input') return;
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
        window.addEventListener('wheel', handleWheelNative, { passive: false });
        return () => window.removeEventListener('wheel', handleWheelNative);
    }, [applyTransform]);

    useEffect(() => {
        const handleGlobalMouseDown = (e) => {
            if (isSpacePressed.current && e.button === 0) {
                isDraggingCanvas.current = true;
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
                return;
            }
            if (e.target === canvasRef.current && e.button === 0 && !isInteractingPanel.current) {
                isDraggingCanvas.current = true;
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                canvasRef.current.style.cursor = 'grabbing';
            }
        };

        const handleGlobalMouseMove = (e) => {
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
                setPanelRect(prev => ({
                    ...prev,
                    x: panelStartRect.current.x + dx,
                    y: panelStartRect.current.y + dy
                }));
            }
        };

        const handleGlobalMouseUp = () => {
            isDraggingCanvas.current = false;
            isInteractingPanel.current = false;
            if (canvasRef.current) canvasRef.current.style.cursor = 'default';
        };

        const handleContextMenu = (e) => {
            if (isSpacePressed.current) e.preventDefault();
        };

        window.addEventListener('mousedown', handleGlobalMouseDown);
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('contextmenu', handleContextMenu);

        return () => {
            window.removeEventListener('mousedown', handleGlobalMouseDown);
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [applyTransform]);

    // ============================================================
    // 业务逻辑函数
    // ============================================================
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setCards(prev => [...prev, {
                id: `card-${Date.now()}-${Math.random()}`,
                imageUrl: event.target.result,
                prompt: `Cinematic shot, highly detailed, 8k resolution.`,
                videoUrl: null, status: 'idle', progress: 0, errorMsg: null
            }]);
        };
        reader.readAsDataURL(file);
        e.target.value = null;
    };

    const handleSplitScript = async () => {
        if (!totalScript.trim()) return alert("请输入分镜脚本内容");
        if (cards.length === 0) return alert("当前没有分镜卡片，请先添加图片");
        setIsSplitting(true);
        try {
            const systemPrompt = `你是一个专业的影视分镜师。请根据用户提供的完整剧本，将其拆分为 ${cards.length} 个独立的视觉提示词（Prompts）。输出纯 JSON 字符串数组。`;
            const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: totalScript }];
            const responseText = await callOpenAIStyleApi(config, messages, "gemini-2.5-flash");

            let jsonString = responseText;
            const firstOpen = responseText.indexOf('[');
            const lastClose = responseText.lastIndexOf(']');
            if (firstOpen !== -1 && lastClose !== -1) jsonString = responseText.substring(firstOpen, lastClose + 1);
            else jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            const prompts = robustJSONParse(jsonString);
            if (!Array.isArray(prompts)) throw new Error("API 返回格式错误，非数组");

            setCards(prev => prev.map((card, i) => ({ ...card, prompt: prompts[i] || card.prompt })));
        } catch (error) {
            console.error("Split failed:", error);
            alert(`拆分失败: ${error.message}`);
        } finally {
            setIsSplitting(false);
        }
    };

    const handleMergeVideos = async () => {
        const validCards = cards.filter(c => c.status === 'success' && c.videoUrl);
        if (validCards.length < 1) return alert("至少需要一个生成的视频才能合并。");
        setMergeState({ isMerging: true, progress: 0, mergedUrl: null });

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const video = document.createElement('video');
            video.crossOrigin = "anonymous"; video.muted = true;
            canvas.width = 1280; canvas.height = 720;
            const stream = canvas.captureStream(30);
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
            const chunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.start();

            for (let i = 0; i < validCards.length; i++) {
                await new Promise((resolve) => {
                    video.src = validCards[i].videoUrl;
                    video.currentTime = 0;
                    video.onloadedmetadata = () => { if (i === 0) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }};
                    video.onplay = () => {
                        const draw = () => {
                            if (video.paused || video.ended) return;
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            requestAnimationFrame(draw);
                        };
                        draw();
                    };
                    video.onended = resolve;
                    video.onerror = resolve;
                    video.play().catch(resolve);
                });
                setMergeState(prev => ({ ...prev, progress: Math.round(((i + 1) / validCards.length) * 100) }));
            }
            mediaRecorder.stop();
            mediaRecorder.onstop = () => {
                setMergeState({ isMerging: false, progress: 100, mergedUrl: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })) });
            };
        } catch (error) {
            console.error("Merge failed:", error);
            setMergeState({ isMerging: false, progress: 0, mergedUrl: null });
            alert("合并失败。");
        }
    };

    const updateCard = (index, updates) => {
        setCards(prev => {
            const newCards = [...prev];
            newCards[index] = { ...newCards[index], ...updates };
            return newCards;
        });
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
            const videoUrl = await generateSoraVideo(
                config,
                { prompt: `${card.prompt}${SAFE_PROMPT_SUFFIX}`, imageUrl: finalImageUrl },
                (msg) => {
                    const match = msg.match(/Progress:\s*(\d+)%/i);
                    if (match) updateCard(index, { progress: parseInt(match[1], 10) });
                }
            );
            updateCard(index, { status: 'success', videoUrl, progress: 100 });
        } catch (error) {
            updateCard(index, { status: 'error', progress: 0, errorMsg: "生成失败" });
        }
    };

    const handleDragStart = useCallback((e, index) => {
        setDraggedCardIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.stopPropagation();
    }, []);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault(); e.stopPropagation();
        if (draggedCardIndex === null || draggedCardIndex === index) return;
        setCards(prev => {
            const newCards = [...prev];
            const item = newCards.splice(draggedCardIndex, 1)[0];
            newCards.splice(index, 0, item);
            return newCards;
        });
        setDraggedCardIndex(index);
    }, [draggedCardIndex]);

    const handleDownloadAll = useCallback(async () => {
        const successCards = cards.filter(c => c.status === 'success' && c.videoUrl);
        if (successCards.length === 0) return alert("无视频可下载。");
        // eslint-disable-next-line no-restricted-globals
        if (!confirm(`准备下载 ${successCards.length} 个视频片段？`)) return;

        let downloadCount = 0;
        const dateStr = new Date().toISOString().split('T')[0];
        cards.forEach((card, i) => {
            if (card.status === 'success' && card.videoUrl) {
                setTimeout(() => downloadFile(card.videoUrl, `${dateStr}—分镜#${i + 1}.mp4`), downloadCount * 500);
                downloadCount++;
            }
        });
    }, [cards]);

    const generatedVideos = useMemo(() => cards.filter(c => c.status === 'success' && c.videoUrl), [cards]);

    const playNext = useCallback(() => {
        if(mergeState.mergedUrl) return;
        setSynthesisState(prev => {
            if (prev.currentIndex < generatedVideos.length - 1) return { ...prev, currentIndex: prev.currentIndex + 1 };
            return { ...prev, isPlaying: false, currentIndex: 0 };
        });
    }, [generatedVideos.length, mergeState.mergedUrl]);

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
    }, [updateConnector, panelRect, cards.length]);

    const handlePanelInteractionStart = (e) => {
        e.stopPropagation(); e.preventDefault();
        isInteractingPanel.current = true;
        panelStartRect.current = { ...panelRect };
        interactionStartMouse.current = { x: e.clientX, y: e.clientY };
    };

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
                    <span className={`flex items-center gap-1.5 transition-colors ${isSaving ? 'text-indigo-400' : 'text-zinc-600'}`}>
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {isSaving ? "Saving..." : "Auto-saved"}
                    </span>
                    <span className="w-px h-3 bg-zinc-800 mx-2"></span>
                    <span>Hold Space + Right Click: Pan Canvas • Wheel: Zoom</span>
                </div>
            </div>

            {/* Infinite Canvas */}
            <div
                ref={canvasRef}
                className="w-full h-full cursor-default"
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
                        <path ref={connectorRef} fill="none" stroke="url(#line-gradient)" strokeWidth="2" className="drop-shadow-lg" />
                    </svg>

                    {/* Storyboard Panel */}
                    <div
                        ref={organizerRef}
                        className="absolute bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10 group/panel transition-all duration-300 ease-out"
                        style={{
                            left: panelRect.x,
                            top: panelRect.y,
                            width: panelRect.width,
                            height: 'auto', // 自适应高度
                            minHeight: '200px',
                        }}
                    >
                        {/* Title Bar */}
                        <div
                            className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-4 rounded-t-xl cursor-move flex-shrink-0"
                            onMouseDown={handlePanelInteractionStart}
                        >
                            <GripVertical className="w-4 h-4 text-zinc-600 mr-2" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Storyboard</span>
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDownloadAll(); }}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-[10px] font-bold transition-colors border border-zinc-700/50"
                                >
                                    <DownloadCloud className="w-3 h-3" />
                                    <span>Download All</span>
                                </button>
                                <span className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-1 rounded-full border border-zinc-700/50">
                                    {cards.length} Clips
                                </span>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex flex-1 items-stretch">
                            {/* 左侧面板：总脚本输入 */}
                            <div className="w-[240px] border-r border-zinc-800 flex flex-col bg-zinc-900/30 shrink-0">
                                <div className="p-3 flex-col gap-2 flex flex-1">
                                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                                        <FileText className="w-3.5 h-3.5" />
                                        <label className="text-[10px] font-bold uppercase">总的分镜提示词</label>
                                    </div>
                                    <textarea
                                        id="master-script-input"
                                        className="w-full flex-1 min-h-[150px] bg-zinc-950/50 border border-zinc-800 rounded p-2 text-[11px] text-zinc-300 resize-none focus:border-indigo-500/50 outline-none leading-relaxed placeholder:text-zinc-700"
                                        placeholder="请在此输入完整的故事脚本或分镜描述..."
                                        value={totalScript}
                                        onChange={e => setTotalScript(e.target.value)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div className="p-3 border-t border-zinc-800 bg-zinc-900/50 mt-auto">
                                    <button
                                        onClick={handleSplitScript}
                                        disabled={isSplitting || !totalScript || cards.length === 0}
                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                                    >
                                        {isSplitting ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <ArrowRightFromLine className="w-3.5 h-3.5" />}
                                        拆分分镜脚本
                                    </button>
                                </div>
                            </div>

                            {/* 右侧内容：卡片列表 */}
                            <div className="flex-1 p-4 bg-zinc-900/10">
                                {!isDbLoaded ? (
                                    <div className="flex h-[200px] items-center justify-center gap-2 text-zinc-500 text-xs">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Loading assets...
                                    </div>
                                ) : (
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
                                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="shrink-0 h-[240px] border border-dashed border-zinc-800 rounded-lg text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex flex-col items-center justify-center gap-2 text-xs uppercase font-bold"
                                            style={{ width: `${CARD_WIDTH}px` }}
                                        >
                                            <Plus className="w-6 h-6" />
                                            <span>Add Scene</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Preview / Synthesis Panel (保持相对位置，稍微调整X偏移) */}
                    <div
                        ref={synthesisRef}
                        className="absolute w-[400px] bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-10 transition-transform duration-300"
                        style={{
                            // 总是保持在主面板右侧一定距离
                            left: panelRect.x + panelRect.width + 100,
                            top: panelRect.y
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="h-10 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-4 rounded-t-xl">
                            <Film className="w-4 h-4 text-indigo-500 mr-2" />
                            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Preview & Merge</span>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="aspect-video bg-black rounded-lg border border-zinc-800 relative overflow-hidden shadow-inner">
                                {mergeState.mergedUrl ? (
                                    <video src={mergeState.mergedUrl} className="w-full h-full object-contain" controls autoPlay />
                                ) : generatedVideos.length > 0 ? (
                                    <>
                                        <video
                                            key={generatedVideos[synthesisState.currentIndex]?.id}
                                            src={generatedVideos[synthesisState.currentIndex]?.videoUrl}
                                            className="w-full h-full object-contain"
                                            autoPlay={synthesisState.isPlaying}
                                            onEnded={playNext}
                                            controls={false}
                                        />
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
                                {mergeState.isMerging && (
                                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                                        <div className="text-xs text-indigo-200 font-bold">Processing... {mergeState.progress}%</div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                {mergeState.isMerging && (
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-200 ease-linear" style={{ width: `${mergeState.progress}%` }} />
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
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
                                                <span className="text-xs text-zinc-500 font-mono">{generatedVideos.length} clips ready</span>
                                            </>
                                        )}
                                        {mergeState.mergedUrl && (
                                            <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Merged
                                            </span>
                                        )}
                                    </div>
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
        </div>
    );
}