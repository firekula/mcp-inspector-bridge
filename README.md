# MCP Inspector Bridge

> 专为 **Cocos Creator 2.4.x** 打造的现代化运行时节点审查与 DevTools 桥接插件。

基于 Vue 3 + Electron BrowserView 架构，提供双分栏沉浸式调试体验：左侧游戏预览、右侧节点树/属性检查/DevTools/性能分析，彻底解决原版内嵌 Chromium DevTools 的挂起死锁问题。

---

## 🚀 快速开始

### 环境要求

- Cocos Creator **2.4.x**
- Node.js ≥ 14

### 安装

将本项目克隆或复制到 Cocos Creator 的插件目录中：

```bash
# 全局插件目录
~/.CocosCreator/packages/mcp-inspector-bridge/

# 或项目级插件目录
your-project/packages/mcp-inspector-bridge/
```

### 构建

```bash
# 安装依赖（包含 esbuild）
npm install

# 编译 TypeScript + 打包探针模块
npm run build
```

### 使用

1. 在 Cocos Creator 中打开任意场景
2. 菜单栏 → **MCP 桥接器** → **开启运行时面板**
3. 点击 **预览运行** 按钮，插件面板将自动捕获游戏预览并加载节点树

---

## ✨ 核心特性

### 🖥️ 双分栏工作流

采用 Vue 3 构建主面板，左侧 Webview 渲染游戏视口，右侧集成多功能调试标签页，实现"边玩边审"的沉浸式体验。

### ⚡ 运行时探针与节点树

基于预加载脚本 (`preload.ts`) 无侵入注入探针至游戏运行时，实时截获完整节点树结构。

- **多关键词穿透搜索**：支持空格分词的 AND 逻辑匹配，可穿透至组件类名层级搜索（如输入 `Animation` 定位所有挂载该组件的节点）
- **严格路径过滤**：搜索结果仅展示命中节点及其直系祖先，自动隐藏无关分支
- **空白区域取消选中**：点击空白即可清除所有焦点，联动属性面板归零与高亮退场

### 🎯 节点高亮与屏幕拾取

- **包围盒高亮**：鼠标悬停/选中节点时，游戏画面实时渲染精准的贴边多边形轮廓，零宽高节点自动降级为十字准星
- **屏幕拾取器**：直接在游戏画面中点击选取节点，基于多摄像机阵列扫描 + CullingMask 分组继承 + 面积权重透层算法，完美适配多镜头、多分组、Fit 缩放等复杂场景

### 🤖 AI MCP 集成桥 (New)

为 LLM (大模型如 Claude/Cursor) 提供双端通信与跨进程的游戏引擎交互视界。
- **WebSocket 中控**：内置宿主的 `4456` 端口 WebSocket 桥接器，在不影响编辑器性能的基础上完成局域网互通。
- **JSON-RPC 只读探针**：提供专为空手脱离上下文开发的 `get_selected_node` (Stage 2) 指令，将冗长繁杂的树形字典归纳为纯净节点序列化结构以应对 Context 溢出与幻觉。
- **IPC 异步防洪**：主进程代理 RPC 通信，面板 `executeJavaScript` 异步安全获取并搭载脱靶与 Shadow DOM 崩溃的防线守护。

### 🔍 属性检查器

选中节点后实时展示完整的组件属性面板：

- **双向属性编辑**：`number` / `string` / `boolean` 及 `Anchor`、`Color`、`Opacity`、`Skew`、`Group` 等全景属性的实时修改
- **纯运行时注入**：所有修改直接操作内存实例，不脏化编辑器 Scene 数据，无"是否保存"弹窗
- **组件启停控制**：统一的 `enabled` 开关，一键休眠/唤醒组件
- **引用追踪定位 🎯**：节点引用、资源引用、预制件均可一键定位至节点树或编辑器资源管理器
- **智能枚举下拉**：自动提取 Spine 动画/皮肤等运行时数据，生成安全的 `<select>` 控件
- **JSON 一键导出**：防循环引用的安全序列化，直出控制台

### 📉 内存剖析器

按 Bundle 分域聚合的资源内存排行榜：

- **极值水位追踪**：实时记录每个 Bundle 的历史最高/最低内存，趋势箭头（↑↓）即时预警
- **UUID 逆向解码**：自动将混淆的 UUID 还原为 `db://assets/textures/...` 可读路径
- **一键资源定位 🎯**：点击即可在编辑器资源管理器中高亮对应文件
- **宏观内存汇总**：榜单头部实时聚合由底层探针累加的总体内存消耗

### 🩺 渲染调试器

运行时 DrawCall 合批断流诊断：

- **静默拦截**：AOP 劫持渲染管线，零控制台污染
- **频次聚合**：Hash 去重 + 触发次数徽章，60FPS 连环断流也不卡
- **帧快照三栏分析**：渲染命令树 / 单步回绘画布 / 管线参数明细
- **逆向节点定位 📌**：从 DrawCall 直接跳转至游戏节点

### ⏭️ 引擎控制

- 暂停/恢复游戏引擎
- 单帧步进
- FPS 显示开关
- 全局静音

### 🎛️ 响应式界面

- **分辨率模拟**：内置 iPhone / Android 等多种预设，支持横竖屏切换
- **预制体资源定位器 (Prefab Asset Locator 🎯)**：自动侦测组件所在预制体并提供跳转捷径。
- **响应式渲染诊断面板**：流体自适应的三列布局代替硬性百分比，并辅以无原生括号的极简说明文本。
- **UI 无极缩放与字号解耦**：右侧特设“⚙️ 设置”，支持分别操控全局缩放比例（Zoom）以统御框架，或调节基础字号（Base Font）打磨排版，根除 1080P 或低分辨率下的拥挤死锁。
- **检查器多维排版**：支持“横向/纵向”双模式切换，解除固有排版约束；节点树/属性面板尺寸任您拖动并自动持久保存。
- **拖拽排序标签页**：自定义标签顺序，重启保持
- **紧凑图标工具栏**：极窄面板下也不变形，悬浮提示补全信息
- **防溢出画面**：双层 CSS 注入锁死滚动条，横竖屏均无杂物

### 💾 偏好持久化

分辨率、FPS 开关、静音状态、面板宽度等设置自动保存至项目级 `settings/` 目录，重启即恢复。

### 🧼 零噪音调试

默认静默所有探针日志，控制台 100% 留给游戏业务。需要排障时设置 `window.__MCP_DEBUG__ = true` 即可开启底层追踪。

---

## 🛡️ 稳定性保障

| 机制 | 说明 |
|------|------|
| **场景校验沙盒** | 以 IPC `isEditorSceneActive` 为唯一放行条件，未就绪时完全不访问预览服务器，根治 `stashScene` 崩溃 |
| **后台挂起复原** | `ResizeObserver` + `pendingRefresh` 标记，后台切回自动恢复画面 |
| **多实例端口适配** | 自动探测 `7456~7466` 活跃端口，多开编辑器不串台 |
| **IPC 降级容错** | 原生通道失联时自动切入 DOM 轮询，2 秒后静默警告 |
| **单向数据流** | 严格杜绝面板↔探针的 IPC 递归循环 |
| **Scene 节点只读** | 自动拦截 `cc.Scene` 属性访问，防止引擎报错 |

---

## 📦 项目结构

```text
mcp-inspector-bridge/
├── package.json               # 插件清单与脚本定义
├── main.js                    # Cocos 插件主进程入口
├── dist/                      # 编译产物目录
├── src/
│   ├── main.ts                # 主进程逻辑 (IPC 注册、BrowserView 管理)
│   ├── preload.ts             # Webview 预加载脚本 (IPC 桥接 + 探针注入)
│   ├── scene-script.ts        # 编辑器 Scene 进程脚本 (仅用于少量原生操作)
│   ├── panel/
│   │   ├── index.ts           # 面板入口，Vue 3 应用挂载
│   │   ├── index.html         # 面板 HTML 模板与样式
│   │   ├── store.ts           # 全局响应式状态
│   │   ├── composables/       # Vue Composable 模块
│   │   │   ├── useLayout.ts   # 分辨率/布局/拖拽
│   │   │   ├── useGameView.ts # 游戏视图生命周期
│   │   │   ├── useDevTools.ts # DevTools BrowserView 管理
│   │   │   ├── useNodeSystem.ts # 节点选择/属性系统
│   │   │   ├── useProfiler.ts # 性能数据采集
│   │   │   └── useTabs.ts     # 标签页排序
│   │   └── components/        # Vue 组件
│   │       ├── NodeTree.ts    # 节点树组件
│   │       ├── NodeInspector.ts # 属性检查器
│   │       ├── RenderDebugger.ts # 渲染调试器
│   │       └── WidgetVisualizer.ts # Widget 可视化
│   └── probe/                 # 探针模块 (esbuild → dist/probe.js)
│       ├── index.ts           # 探针主入口与生命周期
│       ├── crawler.ts         # 节点树爬虫
│       ├── highlighter.ts     # 高亮渲染层
│       ├── picker.ts          # 屏幕拾取器
│       ├── profiler.ts        # 帧率/耗时采集
│       ├── memory.ts          # 内存资源扫描
│       ├── render-debugger.ts # 渲染管线劫持
│       └── logger.ts          # 调试日志门控
├── memory/                    # 项目章程文档
└── specs/                     # 功能规范文档
```

---

## 💡 开发说明

- **技术栈**：TypeScript + Vue 3 + Electron BrowserView + Cocos Creator 2.4.x Extension API
- **构建工具**：`tsc` (主面板) + `esbuild` (探针模块 IIFE 打包)
- **监听模式**：`npm run watch` 可同时启动 tsc 和 esbuild 的文件监听
- **调试开关**：在游戏预览的控制台中执行 `window.__MCP_DEBUG__ = true` 开启探针详细日志
- **详细更新记录**：参见 [UPDATE_LOG.md](./UPDATE_LOG.md)
