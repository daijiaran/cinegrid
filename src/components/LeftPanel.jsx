/**
 * ============================================================
 * 左侧面板组件 (Left Panel Component)
 * ============================================================
 * * 修改说明：
 * 1. 引入了 imagFixApi 中的 callJimengSuperResolution
 * 2. 在模型选择中增加了 "即梦超分辨率" 选项
 * 3. 拦截了 Generate 按钮事件，当选择超分模型时，调用 imagFixApi 接口
 */

import React, { useState } from 'react';
import {
    Settings,
    Upload,
    Play,
    X,
    Aperture,
    Loader2,
    Sparkles,
    ToggleLeft,
    ToggleRight,
    Monitor,
    Smartphone,
    MonitorPlay,
    Square,
    FolderOpen,
    Save
} from 'lucide-react';

// 引入 API (修正了路径)
import { callJimengSuperResolution } from '../utils/imagFixApi';

export default function LeftPanel({
                                      config,
                                      onConfigChange,
                                      genOptions,
                                      onGenOptionsChange,
                                      outputDirName,
                                      onSelectOutputFolder,
                                      prompt,
                                      onPromptChange,
                                      gridMode,
                                      onGridModeChange,
                                      assets,
                                      onFileUpload,
                                      onRemoveAsset,
                                      onAnalyzeAssets,
                                      isAnalyzing,
                                      onGenerate,
                                      isGenerating,
                                      showConfig,
                                      onToggleConfig
                                  }) {
    // UI 辅助状态：当前激活的尺寸预设
    const [activePreset, setActivePreset] = useState('16:9');

    // 新增：本地处理状态 (用于超分接口调用的 loading)
    const [localProcessing, setLocalProcessing] = useState(false);
    // 新增：提交防抖状态（防止用户1秒内狂点10次）
    const [isSubmitting, setIsSubmitting] = useState(false);

    /**
     * 应用尺寸预设
     */
    const applyShotPreset = (preset) => {
        setActivePreset(preset);
        if (preset === '9:16') {
            onGenOptionsChange({ ...genOptions, shotWidth: 1080, shotHeight: 1920 });
        } else if (preset === '16:9') {
            onGenOptionsChange({ ...genOptions, shotWidth: 1920, shotHeight: 1080 });
        } else if (preset === '1:1') {
            onGenOptionsChange({ ...genOptions, shotWidth: 1024, shotHeight: 1024 });
        }
    };

    /**
     * 处理自定义尺寸输入
     */
    const handleCustomDimension = (key, value) => {
        setActivePreset('custom');
        onGenOptionsChange({ ...genOptions, [key]: value });
    };

    /**
     * 处理文件上传
     */
    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        const newAssets = files.map(f => ({
            id: Math.random(),
            url: URL.createObjectURL(f),
            name: f.name
        }));
        onFileUpload(newAssets);
        e.target.value = '';
    };

    /**
     * 新增：统一生成按钮点击处理
     * 如果选择了 "即梦超分辨率"，则拦截请求调用 API
     * 否则执行原本的 onGenerate（现在是异步队列模式，不会阻塞）
     */
    const handleGenerateClick = async () => {
        // 防抖：防止用户快速连续点击
        if (isSubmitting) return;
        setIsSubmitting(true);
        setTimeout(() => setIsSubmitting(false), 1000); // 1秒防抖

        // 1. 判断当前模型是否为超分模型
        if (genOptions.model === 'jimeng-super-res') {
            // 校验是否上传了图片
            if (!assets || assets.length === 0) {
                alert('请先上传需要增强的图片 (Please upload an image first)');
                setIsSubmitting(false);
                return;
            }

            try {
                setLocalProcessing(true);

                // 取第一张图片进行处理
                const targetAsset = assets[0];

                // 将 Blob URL 转换为 Base64
                const response = await fetch(targetAsset.url);
                const blob = await response.blob();

                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                // 映射质量参数 (UI上的 4k/2k/1k -> API的 HQ/MQ/LQ)
                let quality = 'MQ';
                if (genOptions.quality === '4k') quality = 'HQ';
                if (genOptions.quality === '1k') quality = 'LQ';

                // 调用 API
                const resultUrl = await callJimengSuperResolution(base64, quality);

                console.log('超分结果:', resultUrl);
                // 这里简单弹窗提示，实际项目中你可以将 resultUrl 传给父组件展示
                alert('超分成功！结果已打印在控制台');

            } catch (error) {
                console.error('超分处理失败:', error);
                alert(`处理失败: ${error.message}`);
            } finally {
                setLocalProcessing(false);
                setIsSubmitting(false);
            }
        } else {
            // 2. 如果是其他模型，走原有逻辑（现在是异步队列，立即返回）
            onGenerate();
        }
    };

    // 合并 loading 状态（现在主要用于显示提交瞬间的状态，不再长时间锁定）
    const isBusy = isSubmitting || localProcessing;

    return (
        <div className="w-96 flex-shrink-0 border-r border-zinc-800 bg-[#121214] flex flex-col custom-scrollbar overflow-y-auto">
            {/* 头部区域 */}
            <div className="p-4 border-b border-zinc-800 sticky top-0 bg-[#121214] z-20 flex justify-between items-center">
                <div className="flex items-center gap-2 font-bold text-white">
                    <Aperture className="w-5 h-5 text-red-500" />
                    <span>CineGrid <span className="text-red-500 text-xs px-1 border border-red-500 rounded">PRO</span></span>
                </div>
                <button onClick={onToggleConfig} className={`p-2 rounded hover:bg-zinc-800 ${showConfig ? 'text-red-400' : 'text-zinc-400'}`}>
                    <Settings className="w-4 h-4" />
                </button>
            </div>

            {/* 配置区域 */}
            <div className={`border-b border-zinc-800 transition-all ${showConfig ? 'block' : 'hidden'}`}>
                <div className="p-4 space-y-4 bg-zinc-900/50">
                    <div className="flex items-center justify-between bg-black p-2 rounded border border-zinc-800">
                        <span className="text-xs font-bold text-zinc-300">Mode</span>
                        <button
                            onClick={() => onConfigChange({ ...config, useMock: !config.useMock })}
                            className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${config.useMock ? 'bg-blue-900/50 text-blue-300' : 'bg-red-900/50 text-red-300'}`}
                        >
                            {config.useMock ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                            {config.useMock ? 'MOCK' : 'GRSAI'}
                        </button>
                    </div>

                    {!config.useMock && (
                        <div className="space-y-3 pt-2">
                            <div>
                                <label className="text-[10px] text-zinc-400 block mb-1">Host</label>
                                <input
                                    type="text"
                                    value={config.baseUrl}
                                    onChange={(e) => onConfigChange({ ...config, baseUrl: e.target.value })}
                                    className="w-full h-8 px-2 bg-black border border-zinc-700 rounded text-xs text-green-500 outline-none"
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-400 block mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={config.apiKey}
                                    onChange={(e) => onConfigChange({ ...config, apiKey: e.target.value })}
                                    className="w-full h-8 px-2 bg-black border border-zinc-700 rounded text-xs text-zinc-300 outline-none"
                                    placeholder="sk-..."
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 输出设置区域 */}
            <div className="p-4 border-b border-zinc-800 bg-[#121214]">
                <div className="flex items-center text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
                    <Monitor className="w-3 h-3 mr-2" /> Output Settings
                </div>
                <div className="space-y-4">
                    {/* 自动保存文件夹 */}
                    <div className="bg-zinc-900/50 p-2 rounded border border-zinc-700/50">
                        <label className="text-[10px] text-zinc-400 block mb-2 flex items-center">
                            <Save className="w-3 h-3 mr-1" /> Auto-Save Folder
                        </label>
                        {outputDirName ? (
                            <div className="flex items-center justify-between bg-black/50 p-2 rounded text-[10px] border border-green-900/30">
                                <div className="flex items-center text-green-400 truncate max-w-[120px]">
                                    <FolderOpen className="w-3 h-3 mr-2 flex-shrink-0" />
                                    {outputDirName}
                                </div>
                                <button onClick={onSelectOutputFolder} className="text-zinc-500 hover:text-white ml-2">Change</button>
                            </div>
                        ) : (
                            <button onClick={onSelectOutputFolder} className="w-full flex items-center justify-center py-2 border border-dashed border-zinc-600 rounded text-[10px] text-zinc-400 hover:text-white hover:border-zinc-400 transition-colors">
                                <FolderOpen className="w-3 h-3 mr-1" /> Select Folder
                            </button>
                        )}
                    </div>

                    {/* 模型选择 */}
                    <div>
                        <label className="text-[10px] text-zinc-400 block mb-1">Model</label>
                        <select
                            value={genOptions.model}
                            onChange={(e) => onGenOptionsChange({ ...genOptions, model: e.target.value })}
                            className="w-full h-8 px-2 bg-black border border-zinc-700 rounded text-xs text-white outline-none"
                        >
                            <option value="jimeng-super-res">即梦超分辨率 (Jimeng Super Res)</option>
                            <option value="nano-banana-fast">nano-banana-fast (Fastest)</option>
                            <option value="nano-banana">nano-banana</option>
                            <option value="nano-banana-pro">nano-banana-pro (Quality)</option>
                            <option value="sora-image">sora-image (Sora)</option>
                        </select>
                    </div>

                    {/* 尺寸设置 */}
                    <div>
                        <label className="text-[10px] text-zinc-400 block mb-2">Single Shot Dimension</label>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            <button onClick={() => applyShotPreset('9:16')} className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${activePreset === '9:16' ? 'bg-red-900/30 border-red-500 text-white' : 'bg-black border-zinc-700 text-zinc-500 hover:bg-zinc-900'}`}>
                                <Smartphone className="w-4 h-4 mb-1" /> <span className="text-[9px]">1080x1920</span>
                            </button>
                            <button onClick={() => applyShotPreset('16:9')} className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${activePreset === '16:9' ? 'bg-red-900/30 border-red-500 text-white' : 'bg-black border-zinc-700 text-zinc-500 hover:bg-zinc-900'}`}>
                                <MonitorPlay className="w-4 h-4 mb-1" /> <span className="text-[9px]">1920x1080</span>
                            </button>
                            <button onClick={() => applyShotPreset('1:1')} className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${activePreset === '1:1' ? 'bg-red-900/30 border-red-500 text-white' : 'bg-black border-zinc-700 text-zinc-500 hover:bg-zinc-900'}`}>
                                <Square className="w-4 h-4 mb-1" /> <span className="text-[9px]">1024x1024</span>
                            </button>
                        </div>
                        <div className="flex gap-2 items-center bg-black p-2 rounded border border-zinc-800">
                            <span className="text-[9px] text-zinc-500 uppercase font-bold w-12">Custom</span>
                            <div className="relative flex-1">
                                <input type="number" value={genOptions.shotWidth} onChange={(e) => handleCustomDimension('shotWidth', e.target.value)} className={`w-full h-6 bg-transparent border-b ${activePreset === 'custom' ? 'border-red-500 text-white' : 'border-zinc-700 text-zinc-500'} text-xs outline-none text-center`} />
                            </div>
                            <span className="text-zinc-600 text-xs">x</span>
                            <div className="relative flex-1">
                                <input type="number" value={genOptions.shotHeight} onChange={(e) => handleCustomDimension('shotHeight', e.target.value)} className={`w-full h-6 bg-transparent border-b ${activePreset === 'custom' ? 'border-red-500 text-white' : 'border-zinc-700 text-zinc-500'} text-xs outline-none text-center`} />
                            </div>
                        </div>
                    </div>

                    {/* 质量选择 */}
                    <div>
                        <label className="text-[10px] text-zinc-400 block mb-1">Quality Level</label>
                        <div className="grid grid-cols-3 gap-1">
                            {['1k', '2k', '4k'].map((q) => (
                                <button key={q} onClick={() => onGenOptionsChange({ ...genOptions, quality: q })} className={`py-1 text-[10px] border rounded ${genOptions.quality === q ? 'bg-red-900/30 border-red-500 text-red-200' : 'bg-black border-zinc-800 text-zinc-500'}`}>{q}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 提示词和资源区域 */}
            <div className="p-4 space-y-6 flex-grow">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400">PROMPT</label>
                    <textarea value={prompt} onChange={(e) => onPromptChange(e.target.value)} className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded p-3 text-sm text-white outline-none resize-none" placeholder="Describe shots..." />
                </div>

                <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-2">LAYOUT</label>
                    <div className="grid grid-cols-2 gap-2">
                        {['2x2', '3x3'].map((m) => (
                            <button key={m} onClick={() => onGridModeChange(m)} className={`py-2 text-xs font-bold rounded border ${gridMode === m ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>{m}</button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-2">ASSETS</label>
                    <div className="grid grid-cols-4 gap-2">
                        {assets.map((a) => (
                            <div key={a.id} className="aspect-square relative group bg-zinc-900 rounded border border-zinc-800">
                                <img src={a.url} alt="" className="w-full h-full object-cover rounded opacity-70 group-hover:opacity-100" />
                                <button onClick={() => onRemoveAsset(a.id)} className="absolute top-0 right-0 bg-red-900/80 p-1 rounded-bl text-white opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        <label className="aspect-square flex flex-col items-center justify-center border border-dashed border-zinc-700 hover:border-zinc-500 rounded cursor-pointer text-zinc-600 hover:text-zinc-400">
                            <Upload className="w-4 h-4 mb-1" />
                            <span className="text-[9px]">ADD</span>
                            <input type="file" onChange={handleFileUpload} multiple accept="image/*" className="hidden" />
                        </label>
                    </div>
                    {assets.length > 0 && (
                        <button onClick={onAnalyzeAssets} disabled={isAnalyzing} className="mt-2 w-full py-1.5 bg-zinc-900 border border-zinc-800 text-blue-400 text-xs rounded hover:bg-zinc-800 flex items-center justify-center gap-2">
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Analyze
                        </button>
                    )}
                </div>
            </div>

            {/* 生成按钮 */}
            <div className="p-4 border-t border-zinc-800 sticky bottom-0 bg-[#121214]">
                <button onClick={handleGenerateClick} disabled={isBusy} className={`w-full py-3 text-white font-bold rounded flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${config.useMock ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {isBusy ? 'PROCESSING...' : config.useMock ? 'GENERATE (MOCK)' : 'GENERATE (PRO)'}
                </button>
            </div>
        </div>
    );
}