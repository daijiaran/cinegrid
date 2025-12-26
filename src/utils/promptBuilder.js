/**
 * ============================================================
 * 提示词构建模块 (Prompt Builder Module)
 * ============================================================
 * 
 * 功能说明：
 * 本模块负责构建用于图像生成的基础提示词（Prompt），包括：
 * - 计算图像尺寸和比例
 * - 生成正向强化提示词（Positive Prompt）
 * - 生成反向强化提示词（Negative Prompt）
 * - 生成明确的指令说明
 * - 组合完整的提示词字符串
 * 
 * 设计目的：
 * 将提示词构建逻辑从 API 调用函数中解耦，提高代码可维护性和复用性
 */

/**
 * 计算最大公约数（GCD）
 * 用于简化宽高比例，生成更精确的比例字符串
 * 
 * @param {number} a - 第一个数字
 * @param {number} b - 第二个数字
 * @returns {number} - 最大公约数
 */
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);

/**
 * 计算图像尺寸和比例信息
 * 修改版：基于整体大图的分辨率和比例进行计算，Grid 仅用于内部切分
 * 
 * @param {Object} params - 参数对象
 * @param {Object} params.shotSize - 用于计算比例 (如 1920x1080)
 * @param {string} params.grid - 网格模式 '1x1', '2x2' 或 '3x3'
 * @param {string} params.quality - 质量级别 '1k', '2k', '4k'
 * @returns {Object} 尺寸计算结果
 * @returns {number} returns.shotW - 单镜头宽度（反向计算得出）
 * @returns {number} returns.shotH - 单镜头高度（反向计算得出）
 * @returns {number} returns.cols - 列数
 * @returns {number} returns.rows - 行数
 * @returns {number} returns.rawTotalW - 原始总宽度（与 finalW 一致）
 * @returns {number} returns.rawTotalH - 原始总高度（与 finalH 一致）
 * @returns {number} returns.finalW - 最终宽度（对齐到8的倍数）
 * @returns {number} returns.finalH - 最终高度（对齐到8的倍数）
 * @returns {string} returns.ratioStr - 比例字符串（如 "9:16"）
 * @returns {string} returns.orientationDesc - 方向描述（横屏/竖屏/方形）
 * @returns {string} returns.gridDesc - 网格描述
 */
export const calculateImageDimensions = (params) => {
    // 1. 确定网格结构
    let cols = 3;
    let rows = 3;
    if (params.grid === '1x1') {
        cols = 1; rows = 1;
    } else if (params.grid === '2x2') {
        cols = 2; rows = 2;
    }

    // 2. 确定基础长边像素 (Base Long Edge)
    // 这里定义您的"大图"对应的分辨率标准
    let longEdge = 1920; // 默认 2k
    if (params.quality === '4k') {
        longEdge = 3840; // 4K 标准长边
    } else if (params.quality === '2k') {
        longEdge = 1920; // 2K/FHD 标准长边 (也可以设为 2560)
    } else if (params.quality === '1k') {
        longEdge = 1024; // 1K 长边
    }

    // 3. 计算目标宽高比 (Aspect Ratio)
    // 使用左侧面板传入的 shotSize 来计算用户想要的比例
    // 例如：16:9 (1920/1080 ≈ 1.77) 或 9:16 (1080/1920 ≈ 0.56)
    const inputW = parseFloat(params.shotSize.w) || 1920;
    const inputH = parseFloat(params.shotSize.h) || 1080;
    const aspectRatio = inputW / inputH;

    // 4. 计算最终大图尺寸 (Final Master Dimensions)
    let finalW, finalH;

    if (aspectRatio >= 1) {
        // 横屏或正方形 (Landscape / Square)
        // 逻辑：宽度 = 长边，高度 = 宽度 / 比例
        finalW = longEdge;
        finalH = longEdge / aspectRatio;
    } else {
        // 竖屏 (Portrait)
        // 逻辑：高度 = 长边，宽度 = 高度 * 比例
        finalH = longEdge;
        finalW = longEdge * aspectRatio;
    }

    // 5. 对齐到 8 的倍数 (Model Requirement)
    finalW = Math.round(finalW / 8) * 8;
    finalH = Math.round(finalH / 8) * 8;

    // 6. [关键] 反向计算单镜头尺寸 (Reverse calculate shot size)
    // 这只是为了写进 Prompt 告诉 AI "每个格子画多大"，不影响画布物理尺寸
    const shotW = Math.floor(finalW / cols);
    const shotH = Math.floor(finalH / rows);

    // 7. 生成比例字符串
    const divisor = gcd(finalW, finalH);
    const ratioStr = `${finalW / divisor}:${finalH / divisor}`;

    // 8. 生成描述
    const isWide = finalW > finalH;
    const isTall = finalH > finalW;
    const orientationDesc = isWide
        ? "wide angle, panoramic view (landscape layout)"
        : isTall
            ? "tall portrait view (vertical layout)"
            : "square layout";

    let gridDesc = "";
    if (params.grid === '1x1') {
        gridDesc = "single full frame image, detailed masterpiece, (no grid), (no split screen)";
    } else if (params.grid === '2x2') {
        gridDesc = "2x2 uniform grid, exactly 4 panels, (2 rows by 2 columns), symmetric matrix layout";
    } else {
        gridDesc = "3x3 uniform grid, exactly 9 panels, (3 rows by 3 columns), symmetric matrix layout";
    }

    // rawTotalW/rawTotalH 保持与 final 一致
    return {
        shotW, // 单个小格子的近似尺寸
        shotH,
        cols,
        rows,
        rawTotalW: finalW,
        rawTotalH: finalH,
        finalW,
        finalH,
        ratioStr,
        orientationDesc,
        gridDesc
    };
};

/**
 * 生成正向强化提示词（Positive Prompt）
 * 用于指导模型生成符合要求的图像
 * 修改说明：增加了对单图模式的兼容，避免强制网格词汇
 * 
 * @param {Object} dims - 尺寸计算结果（来自 calculateImageDimensions）
 * @returns {string} 正向提示词字符串
 */
export const buildPositivePrompt = (dims) => {
    const {
        ratioStr,
        finalW,
        finalH,
        orientationDesc,
        gridDesc,
        shotW,
        shotH,
        cols,
        rows
    } = dims;

    // 如果是单图 (1x1)，使用精简版提示词
    if (cols === 1 && rows === 1) {
        return `
            (strict aspect ratio ${ratioStr}:1.8), (resolution ${finalW}x${finalH}), 
            --ar ${ratioStr}, --w ${finalW} --h ${finalH},
            ${orientationDesc}, ${gridDesc},
            (full canvas), (no crop), (exact dimensions),
            (high fidelity:1.5), (sharp focus:1.5)
        `.replace(/\s+/g, ' ').trim();
    }

    // 原有的网格模式提示词保持不变
    return `
        (strict aspect ratio ${ratioStr}:1.8), (resolution ${finalW}x${finalH}), 
        --ar ${ratioStr}, --w ${finalW} --h ${finalH},
        ${orientationDesc}, ${gridDesc},
        (full canvas), (no crop), (exact dimensions),
        (single shot dimension: ${shotW}x${shotH}:1.8),
        (each panel size: ${shotW}x${shotH}),
        (grid layout: ${cols} columns by ${rows} rows:2.0),
        (exactly ${cols * rows} panels:2.0),
        (uniform distribution:1.5),
        (equal size panels:1.5),
        (seamless grid:2.0), (zero gap:2.0), (edge to edge panels:2.0),
        (touching panels:2.0), (no dividers:2.0),
        (storyboard sheet:1.8)
    `.replace(/\s+/g, ' ').trim();
};

/**
 * 生成反向强化提示词（Negative Prompt）
 * 用于禁止模型生成不符合要求的元素
 * 
 * @returns {string} 反向提示词字符串
 */
export const buildNegativePrompt = () => {
    return `
        (square image:2.0), (1:1 aspect ratio:2.0), (1:1 ratio:2.0),
        (cropped:1.8), (cut off:1.8), (out of frame:1.8),
        (letterbox:2.0), (pillarbox:2.0), 
        (borders:2.0), (frames:2.0), (padding:2.0), (margins:2.0),
        (white borders:2.0), (black borders:2.0), (grid lines:2.0), (gutters:2.0), (separators:2.0), (spacing:2.0),
        (single image:2.0), (merged panels:2.0), 
        (wrong grid:2.0), (incorrect layout:2.0),
        (irregular grid:2.0), (uneven grid:2.0),
        (5 rows:2.0), (5 columns:2.0), (4 rows:2.0), (4 columns:2.0),
        (extra panels:2.0), (missing panels:1.8),
        (text:1.5), (watermark:1.5), (logo:1.5),
        (distorted:1.5), (blur:1.5), 
        (low quality:1.5), (bad anatomy:1.5),
        (incorrect aspect ratio:2.0),
        (wrong dimensions:2.0)
    `.replace(/\s+/g, ' ').trim();
};

/**
 * 生成明确的指令说明
 * 以清晰的文本形式告诉模型必须遵循的规则
 * 修改说明：增加了对单图模式的支持
 * 
 * @param {Object} dims - 尺寸计算结果
 * @returns {string} 指令说明字符串
 */
export const buildExplicitInstructions = (dims) => {
    const { gridDesc, cols, rows, shotW, shotH, finalW, finalH, ratioStr } = dims;

    // 如果是单图模式，使用不同的指令
    if (cols === 1 && rows === 1) {
        return `
            IMPORTANT INSTRUCTIONS (MUST FOLLOW):
            1. Generate a single full frame image (NO GRID, NO SPLIT SCREEN)
            2. Image must be a complete, unified composition
            3. NO multiple panels, NO grid layout, NO divided sections
            4. Final image dimensions: ${finalW}x${finalH} (${ratioStr} aspect ratio)
            5. Maintain high quality and sharp focus throughout
        `.trim();
    }

    // 网格模式：强调总分辨率
    return `
        IMPORTANT INSTRUCTIONS (MUST FOLLOW):
        1. Generate a ${gridDesc} with EXACTLY ${cols * rows} panels
        2. Layout MUST be ${rows} rows and ${cols} columns
        3. Overall Canvas Resolution: ${finalW}x${finalH} (Essential)
        4. All panels must be equal size (approx ${shotW}x${shotH}) and TOUCHING
        5. NO WHITE SPACE, NO GUTTERS, NO BORDERS between panels
    `.trim();
};

/**
 * 构建完整的提示词
 * 组合用户输入、指令、正向和反向提示词
 * 
 * @param {Object} params - 参数对象
 * @param {string} params.prompt - 用户输入的提示词
 * @param {string} params.promptText - 提示词文本（备用）
 * @param {Object} params.shotSize - 单镜头尺寸
 * @param {string} params.grid - 网格模式
 * @param {string} params.quality - 质量级别
 * @param {string} [qualityDesc] - 质量描述（可选，用于某些模型）
 * @returns {Object} 完整的提示词对象
 * @returns {string} returns.fullPrompt - 完整提示词
 * @returns {string} returns.negativePrompt - 反向提示词
 * @returns {Object} returns.dimensions - 尺寸计算结果
 */
export const buildFullPrompt = (params, qualityDesc = '') => {
    // 计算尺寸和比例
    const dimensions = calculateImageDimensions(params);

    // 构建各个部分
    const explicitInstructions = buildExplicitInstructions(dimensions);
    const strictPositive = buildPositivePrompt(dimensions);
    const strictNegative = buildNegativePrompt();

    // 获取用户提示词
    const userPrompt = params.promptText || params.prompt;

    // 组合完整提示词
    let fullPrompt = `${explicitInstructions} ${strictPositive}`;
    if (qualityDesc) {
        fullPrompt += `, ${qualityDesc}`;
    }
    fullPrompt += `, ${userPrompt} . Negative prompt: ${strictNegative}`;

    return {
        fullPrompt,
        negativePrompt: strictNegative,
        dimensions
    };
};

