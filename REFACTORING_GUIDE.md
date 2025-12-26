# CineGrid 重构总结与维护指南

## 📋 目录

1. [重构概述](#重构概述)
2. [项目结构](#项目结构)
3. [模块说明](#模块说明)
4. [组件说明](#组件说明)
5. [数据流](#数据流)
6. [维护指南](#维护指南)
7. [常见问题](#常见问题)

---

## 🔄 重构概述

### 重构目标

本次重构的主要目标是：
1. **降低耦合度**：将原本集中在单个文件中的代码拆分为多个模块和组件
2. **提高可维护性**：通过清晰的模块划分和详细注释，便于后续维护和扩展
3. **增强可复用性**：将通用功能提取为独立模块，便于在其他项目中复用

### 重构内容

- ✅ 提取提示词构建逻辑为独立模块 (`utils/promptBuilder.js`)
- ✅ 提取工具函数为独立模块 (`utils/utils.js`)
- ✅ 提取 API 调用逻辑为独立模块 (`utils/api.js`)
- ✅ 拆分左侧面板为独立组件 (`components/LeftPanel.jsx`)
- ✅ 拆分右侧面板为独立组件 (`components/MiddlePanel.jsx`)
- ✅ 重构主组件为父组件 (`StoryboardApp.jsx`)
- ✅ 添加详细的中文注释

---

## 📁 项目结构

```
src/
├── components/              # React 组件目录
│   ├── LeftPanel.jsx      # 左侧控制面板组件
│   └── MiddlePanel.jsx     # 右侧显示面板组件
├── utils/                  # 工具模块目录
│   ├── promptBuilder.js   # 提示词构建模块
│   ├── utils.js           # 通用工具函数
│   └── api.js             # API 调用模块
├── StoryboardApp.jsx       # 主应用组件（父组件）
├── App.js                  # 应用入口包装
└── index.js                # React 入口文件
```

---

## 📦 模块说明

### 1. `utils/promptBuilder.js` - 提示词构建模块

**功能**：负责构建用于图像生成的基础提示词

**主要函数**：

- `calculateImageDimensions(params)` - 计算图像尺寸和比例信息
  - 输入：生成参数（单镜头尺寸、网格模式、质量级别）
  - 输出：尺寸计算结果（宽度、高度、比例、描述等）

- `buildPositivePrompt(dims)` - 生成正向强化提示词
  - 用于指导模型生成符合要求的图像

- `buildNegativePrompt()` - 生成反向强化提示词
  - 用于禁止模型生成不符合要求的元素

- `buildExplicitInstructions(dims)` - 生成明确的指令说明
  - 以清晰的文本形式告诉模型必须遵循的规则

- `buildFullPrompt(params, qualityDesc)` - 构建完整的提示词
  - 组合用户输入、指令、正向和反向提示词

**使用示例**：
```javascript
import { buildFullPrompt } from './utils/promptBuilder';

const params = {
    prompt: '用户输入的提示词',
    grid: '2x2',
    shotSize: { w: 1080, h: 1920 },
    quality: '1k'
};

const { fullPrompt, negativePrompt, dimensions } = buildFullPrompt(params);
```

---

### 2. `utils/utils.js` - 工具函数模块

**功能**：包含应用程序中使用的通用工具函数

**主要函数**：

- `urlToBase64(url, mimeType)` - 将图片 URL 转换为 Base64 编码
  - 支持跨域图片（需要服务器支持 CORS）
  - 返回：`{ base64Only, fullDataUrl }`

- `downloadFile(dataUrl, filename)` - 下载文件到本地
  - 通过创建临时链接并触发点击来实现下载

**使用示例**：
```javascript
import { urlToBase64, downloadFile } from './utils/utils';

// 转换图片为 Base64
const { base64Only, fullDataUrl } = await urlToBase64('https://example.com/image.jpg');

// 下载文件
downloadFile('data:image/png;base64,...', 'image.png');
```

---

### 3. `utils/api.js` - API 调用模块

**功能**：包含所有与后端 API 交互的函数

**主要函数**：

- `callOpenAIStyleApi(config, messages, model)` - 文本与多模态分析 API
  - 用于分析上传的图片并提取风格关键词

- `generateSoraImage(config, params, signal, addLog)` - Sora Image 生成 API
  - 工作流程：提交任务 → 轮询状态 → 下载结果
  - 支持取消操作（通过 AbortSignal）

- `generateGrsaiImage(config, params, signal, addLog)` - Grsai/Gemini 图像生成 API
  - 支持流式响应和 JSON 响应两种格式
  - 支持取消操作（通过 AbortSignal）

- `mockGenerateStoryboard(params)` - Mock 生成函数
  - 用于测试，生成占位图片 URL

**使用示例**：
```javascript
import { generateSoraImage } from './utils/api';

const config = {
    baseUrl: 'https://api.example.com',
    apiKey: 'your-api-key'
};

const params = {
    prompt: '用户提示词',
    grid: '2x2',
    shotSize: { w: 1080, h: 1920 },
    quality: '1k'
};

const controller = new AbortController();
const imageUrl = await generateSoraImage(
    config,
    params,
    controller.signal,
    (msg) => console.log(msg)
);
```

---

## 🧩 组件说明

### 1. `components/LeftPanel.jsx` - 左侧控制面板

**功能**：渲染应用程序的左侧控制面板

**主要区域**：
- **头部**：应用标题和配置切换按钮
- **配置区域**：API 配置和 Mock 模式切换
- **输出设置**：自动保存、模型选择、尺寸预设、质量级别
- **输入区域**：提示词、布局选择、资源上传
- **生成按钮**：触发图片生成

**Props**：
```typescript
interface LeftPanelProps {
    config: {
        useMock: boolean;
        baseUrl: string;
        apiKey: string;
    };
    onConfigChange: (config: Config) => void;
    genOptions: {
        model: string;
        quality: string;
        shotWidth: number;
        shotHeight: number;
    };
    onGenOptionsChange: (options: GenOptions) => void;
    // ... 其他 props
}
```

---

### 2. `components/MiddlePanel.jsx` - 右侧显示面板

**功能**：渲染应用程序的右侧显示面板

**主要区域**：
- **状态栏**：显示当前模式、模型、日志等
- **主网格预览**：显示生成的大图
- **切片网格**：显示切割后的单个镜头
- **时间线序列**：显示所有切片的缩略图
- **批量下载按钮**：下载所有切片

**Props**：
```typescript
interface RightPanelProps {
    config: Config;
    genOptions: GenOptions;
    outputDirName: string | null;
    logs: string[];
    gridMode: '2x2' | '3x3';
    generatedImage: string | null;
    slicedImages: Slice[];
    analysisResult: string;
    isGenerating: boolean;
    onDownloadMaster: () => void;
    onDownloadSlice: (dataUrl: string, index: number) => void;
    onDownloadAll: () => void;
}
```

---

### 3. `StoryboardApp.jsx` - 主应用组件

**功能**：应用程序的根组件，负责状态管理和业务逻辑

**主要职责**：
- 管理全局状态（配置、生成选项、图片数据等）
- 协调左侧控制面板和右侧显示面板
- 处理图片生成、切割、保存等核心业务逻辑
- 管理文件系统访问（自动保存功能）

**核心函数**：
- `handleGenerate()` - 生成图片的核心函数
- `sliceImage()` - 切割图片函数
- `handleAnalyzeAssets()` - 分析资源函数
- `saveSlicesToDisk()` - 保存切片到磁盘函数

---

## 🔄 数据流

### 用户操作流程

```
用户输入提示词和配置
    ↓
点击生成按钮
    ↓
StoryboardApp.handleGenerate()
    ↓
调用 API 模块生成图片
    ↓
设置 generatedImage 状态
    ↓
触发 useEffect 自动切割图片
    ↓
设置 slicedImages 状态
    ↓
MiddlePanel 显示结果
```

### 状态管理

```
StoryboardApp (父组件)
    ├── config (API 配置)
    ├── genOptions (生成选项)
    ├── prompt (提示词)
    ├── gridMode (网格模式)
    ├── assets (上传的资源)
    ├── generatedImage (生成的图片)
    ├── slicedImages (切割后的图片)
    └── logs (日志)
        ↓
    LeftPanel (控制面板)
        ↓ (通过 props 传递状态和回调)
    MiddlePanel (显示面板)
```

---

## 🛠️ 维护指南

### 添加新功能

#### 1. 添加新的提示词构建规则

**位置**：`utils/promptBuilder.js`

**步骤**：
1. 在 `buildPositivePrompt()` 或 `buildNegativePrompt()` 中添加新的提示词规则
2. 确保新规则与现有规则兼容
3. 更新函数注释说明新规则的作用

**示例**：
```javascript
export const buildPositivePrompt = (dims) => {
    // ... 现有代码 ...
    
    // 添加新规则
    const newRule = `(your new rule:1.5)`;
    
    return `
        ${existingRules}
        ${newRule}
    `.replace(/\s+/g, ' ').trim();
};
```

#### 2. 添加新的 API 端点

**位置**：`utils/api.js`

**步骤**：
1. 创建新的 API 函数（参考现有函数的结构）
2. 使用 `promptBuilder` 模块构建提示词
3. 处理错误和取消信号
4. 添加日志记录

**示例**：
```javascript
export const generateNewApiImage = async (config, params, signal, addLog) => {
    // 1. 验证配置
    // 2. 构建提示词
    const promptData = buildFullPrompt(params);
    // 3. 发送请求
    // 4. 处理响应
    // 5. 返回结果
};
```

#### 3. 添加新的 UI 组件

**位置**：`components/` 目录

**步骤**：
1. 创建新的组件文件
2. 定义组件的 Props 接口
3. 在父组件中导入并使用
4. 通过 props 传递必要的状态和回调

**示例**：
```javascript
// components/NewComponent.jsx
export default function NewComponent({ prop1, prop2, onAction }) {
    // 组件实现
}

// StoryboardApp.jsx
import NewComponent from './components/NewComponent';

// 在 render 中使用
<NewComponent prop1={value1} prop2={value2} onAction={handleAction} />
```

### 修改现有功能

#### 1. 修改提示词构建逻辑

**位置**：`utils/promptBuilder.js`

**注意事项**：
- 修改后需要测试不同参数组合的效果
- 确保修改不会破坏现有的提示词结构
- 更新相关注释

#### 2. 修改 UI 布局

**位置**：`components/LeftPanel.jsx` 或 `components/MiddlePanel.jsx`

**注意事项**：
- 保持组件的 Props 接口稳定（避免破坏父组件）
- 如需新增状态，通过 props 从父组件传递
- 保持样式一致性

#### 3. 修改业务逻辑

**位置**：`StoryboardApp.jsx`

**注意事项**：
- 确保状态更新正确触发重新渲染
- 注意副作用（useEffect）的依赖项
- 保持错误处理逻辑完整

### 调试技巧

#### 1. 查看日志

所有 API 调用和关键操作都会通过 `addLog()` 函数记录日志，可以在右侧面板的状态栏查看。

#### 2. 使用浏览器开发者工具

- **Console**：查看 JavaScript 错误和警告
- **Network**：查看 API 请求和响应
- **React DevTools**：查看组件状态和 Props

#### 3. 测试 Mock 模式

切换到 Mock 模式可以快速测试 UI 和业务逻辑，无需真实的 API 调用。

---

## ❓ 常见问题

### Q1: 如何添加新的模型支持？

**A**: 
1. 在 `LeftPanel.jsx` 的模型选择下拉框中添加新选项
2. 在 `StoryboardApp.jsx` 的 `handleGenerate()` 函数中添加新模型的处理逻辑
3. 如果新模型需要特殊的 API 调用，在 `utils/api.js` 中添加新的生成函数

### Q2: 如何修改图片切割逻辑？

**A**: 
修改 `StoryboardApp.jsx` 中的 `sliceImage()` 函数。注意：
- 保持函数签名不变（useCallback 依赖）
- 确保切割后的图片尺寸和比例正确
- 更新相关的验证逻辑

### Q3: 如何自定义提示词模板？

**A**: 
修改 `utils/promptBuilder.js` 中的相关函数：
- `buildPositivePrompt()` - 正向提示词
- `buildNegativePrompt()` - 反向提示词
- `buildExplicitInstructions()` - 指令说明

### Q4: 如何处理新的错误类型？

**A**: 
1. 在 API 函数中添加错误处理逻辑
2. 使用 `setErrorModal()` 显示错误信息
3. 通过 `addLog()` 记录错误日志

### Q5: 如何优化性能？

**A**: 
1. **图片切割**：使用 `useCallback` 避免不必要的重新创建
2. **状态更新**：合并多个状态更新，减少重新渲染
3. **图片加载**：使用懒加载或虚拟滚动（如果切片数量很大）
4. **API 请求**：实现请求缓存和去重

### Q6: 如何添加新的文件格式支持？

**A**: 
1. 修改 `utils/utils.js` 中的 `urlToBase64()` 函数，支持新的 MIME 类型
2. 更新文件上传的 `accept` 属性（在 `LeftPanel.jsx` 中）
3. 确保 API 支持新的文件格式

---

## 📝 代码规范

### 命名规范

- **文件命名**：使用 PascalCase（组件）或 camelCase（工具函数）
- **函数命名**：使用 camelCase，动词开头（如 `handleGenerate`, `buildPrompt`）
- **变量命名**：使用 camelCase，名词或形容词（如 `generatedImage`, `isGenerating`）
- **常量命名**：使用 UPPER_SNAKE_CASE（如 `MAX_ATTEMPTS`）

### 注释规范

- **文件头部**：说明文件功能和主要导出
- **函数注释**：使用 JSDoc 格式，说明参数和返回值
- **复杂逻辑**：添加行内注释说明

### 代码组织

- **导入顺序**：React → 第三方库 → 本地模块 → 组件
- **函数顺序**：状态 → 副作用 → 工具函数 → 事件处理 → 渲染
- **组件结构**：Props 定义 → 状态 → 副作用 → 函数 → 渲染

---

## 🔗 相关资源

- **React 文档**：https://react.dev/
- **File System Access API**：https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
- **Canvas API**：https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API

---

## 📅 更新日志

### 2024-XX-XX - 重构完成
- ✅ 提取提示词构建逻辑为独立模块
- ✅ 提取工具函数为独立模块
- ✅ 提取 API 调用逻辑为独立模块
- ✅ 拆分左侧和右侧面板为独立组件
- ✅ 重构主组件为父组件
- ✅ 添加详细的中文注释

---

## 👥 贡献指南

1. **Fork 项目**
2. **创建功能分支**：`git checkout -b feature/your-feature`
3. **提交更改**：`git commit -m 'Add some feature'`
4. **推送到分支**：`git push origin feature/your-feature`
5. **提交 Pull Request**

---

## 📄 许可证

[在此添加许可证信息]

---

**最后更新**：2024-XX-XX  
**维护者**：[您的名字]

