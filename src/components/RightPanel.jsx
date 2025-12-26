/**
 * ============================================================
 * 右侧面板组件 (Right Panel Component)
 * ============================================================
 * 功能：
 * 1. 展示图片生成任务列表 (队列)
 * 2. 显示任务状态 (加载中/成功/失败)
 * 3. 点击任务可回溯历史记录到中间面板
 */

import React, { useState } from 'react';
import { 
    ChevronRight, 
    ChevronLeft, 
    Loader2, 
    CheckCircle2, 
    AlertCircle, 
    Clock, 
    Trash2,
    Image as ImageIcon
} from 'lucide-react';

export default function RightPanel({ 
    tasks, 
    currentTaskId,
    onTaskSelect, 
    onDeleteTask 
}) {
    // 控制面板展开/收起状态
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div 
            className={`transition-all duration-300 ease-in-out border-l border-zinc-800 bg-[#0c0c0e] flex flex-col relative shrink-0 ${
                isExpanded ? 'w-64' : 'w-12'
            }`}
        >
            {/* 顶部折叠按钮 */}
            <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-[#121214]">
                {isExpanded && (
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">
                        Process List
                    </span>
                )}
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 transition-colors"
                >
                    {isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* 任务列表区域 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {tasks.length === 0 && isExpanded && (
                    <div className="text-center py-10 text-zinc-600 text-xs">
                        暂无生成任务
                    </div>
                )}

                {tasks.map((task) => (
                    <div 
                        key={task.id}
                        onClick={() => task.status === 'success' && onTaskSelect(task)}
                        className={`
                            relative group rounded-md border transition-all cursor-pointer overflow-hidden
                            ${task.id === currentTaskId ? 'border-blue-500 bg-blue-900/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600'}
                            ${!isExpanded ? 'aspect-square flex items-center justify-center p-0' : 'p-2'}
                        `}
                    >
                        {/* 状态图标逻辑 */}
                        {task.status === 'loading' ? (
                            <div className={`${isExpanded ? 'absolute right-2 top-2' : ''}`}>
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            </div>
                        ) : task.status === 'error' ? (
                            <div className={`${isExpanded ? 'absolute right-2 top-2' : ''}`}>
                                <AlertCircle className="w-4 h-4 text-red-500" />
                            </div>
                        ) : !isExpanded ? (
                            // 收起状态下的成功图标（或者是缩略图）
                            task.imageUrl ? (
                                <img src={task.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )
                        ) : null}

                        {/* 展开状态下的详细内容 */}
                        {isExpanded && (
                            <div className="flex gap-2">
                                {/* 缩略图区域 */}
                                <div className="w-12 h-12 rounded bg-black shrink-0 overflow-hidden border border-zinc-700 flex items-center justify-center">
                                    {task.imageUrl ? (
                                        <img src={task.imageUrl} alt="Result" className="w-full h-full object-cover" />
                                    ) : (
                                        <ImageIcon className="w-5 h-5 text-zinc-700" />
                                    )}
                                </div>

                                {/* 文本信息 */}
                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <div className="flex items-start justify-between">
                                        <span className="text-[10px] font-bold text-zinc-300 truncate w-full">
                                            {task.gridMode} Grid
                                        </span>
                                    </div>
                                    <div className="text-[9px] text-zinc-500 truncate" title={task.prompt}>
                                        {task.prompt}
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[8px] text-zinc-600 flex items-center gap-1">
                                            <Clock className="w-2 h-2" /> {task.time}
                                        </span>
                                        {/* 删除按钮 */}
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteTask(task.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-500 transition-opacity"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

