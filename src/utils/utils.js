/**
 * ============================================================
 * 工具函数模块 (Utils Module)
 * ============================================================
 * 
 * 功能说明：
 * 本模块包含应用程序中使用的通用工具函数，包括：
 * - 图片格式转换（URL 转 Base64）
 * - 文件下载功能
 * 
 * 设计目的：
 * 将通用工具函数集中管理，便于复用和维护
 */

/**
 * 将图片 URL 转换为 Base64 编码
 * 支持跨域图片（需要服务器支持 CORS）
 * 
 * @param {string} url - 图片 URL（可以是 blob URL 或 HTTP URL）
 * @param {string} mimeType - MIME 类型，默认为 'image/jpeg'
 * @returns {Promise<Object>} 返回包含 base64 编码的对象
 * @returns {string} returns.base64Only - 仅 Base64 字符串（不含 data: 前缀）
 * @returns {string} returns.fullDataUrl - 完整的 Data URL（包含 data: 前缀）
 * 
 * @example
 * const { base64Only, fullDataUrl } = await urlToBase64('https://example.com/image.jpg');
 */
export const urlToBase64 = (url, mimeType = 'image/jpeg') => {
    return new Promise((resolve, reject) => {
        // 创建图片对象
        const img = new Image();
        
        // 设置跨域属性（允许加载跨域图片）
        img.crossOrigin = 'Anonymous';
        
        // 图片加载成功回调
        img.onload = () => {
            try {
                // 创建 Canvas 元素
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 获取 2D 渲染上下文
                const ctx = canvas.getContext('2d');
                
                // 将图片绘制到 Canvas
                ctx.drawImage(img, 0, 0);
                
                // 转换为 Data URL
                const dataUrl = canvas.toDataURL(mimeType);
                
                // 分离出纯 Base64 字符串（去掉 "data:image/jpeg;base64," 前缀）
                const base64 = dataUrl.split(',')[1];
                
                resolve({ base64Only: base64, fullDataUrl: dataUrl });
            } catch (error) {
                reject(new Error(`图片转换失败: ${error.message}`));
            }
        };
        
        // 图片加载失败回调
        img.onerror = () => {
            reject(new Error("图片加载或转换失败"));
        };
        
        // 设置图片源（触发加载）
        img.src = url;
    });
};

/**
 * 下载文件到本地
 * 通过创建临时链接并触发点击来实现下载
 * 
 * @param {string} dataUrl - 文件的 Data URL 或 Blob URL
 * @param {string} filename - 下载的文件名
 * 
 * @example
 * downloadFile('data:image/png;base64,...', 'image.png');
 * downloadFile('blob:http://...', 'image.png');
 */
export const downloadFile = (dataUrl, filename) => {
    // 创建临时 <a> 元素
    const link = document.createElement('a');
    
    // 设置下载链接和文件名
    link.href = dataUrl;
    link.download = filename;
    
    // 将链接添加到 DOM（某些浏览器需要）
    document.body.appendChild(link);
    
    // 触发点击事件（开始下载）
    link.click();
    
    // 清理：从 DOM 中移除临时链接
    document.body.removeChild(link);
};

