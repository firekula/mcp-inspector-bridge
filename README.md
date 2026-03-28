# MCP Inspector Bridge

`mcp-inspector-bridge` 是专为 **Cocos Creator 2.4.x** 打造的现代化运行节点审查与 DevTools 桥接插件。
本项目旨在原版 `CocosInspector` 机制的基础上，提供更可靠、更先进的双分栏调试体验，并彻底解决内嵌 Chromium DevTools 时常见的挂起死锁问题。

## ✨ 核心特性

- **🚀 双分栏工作流 (Dual-Pane Layout)**
  采用现代化的 Vue 3 构建插件主面板。左侧保留原生 Webview 渲染游戏视口，右侧原生集成 Chrome DevTools，实现“边玩边审”的沉浸式体验。
  
- **🛡️ 稳态 BrowserView 底层架构**
  彻底规避了 `webContents.setDevToolsWebContents()` 在 `<webview>` 标签上的 `about:blank` 导航死锁问题。通过逆向深入还原，采用 Electron 原生 `BrowserView` 作为 DevTools 容器，确立了绝对稳固的 CDP (Chrome DevTools Protocol) 链路。

- **⚡ 智能运行时探针 (Runtime Probe)**
  基于预加载脚本 (`preload.js`) 动态无侵入地向游戏运行时注入核心探针。不仅能瞬时截获游戏 DOM 树，更深度适配了 Cocos Creator 2.4 引擎底层的属性陷阱（完美跨越 `cc.Scene` 对 `active` 的 getter 报错劫持）。

- **🔍 组件属性检查器 (Node Inspector)**
  选中实时树节点后，完美复现了引擎原生层级的 Inspector。
  - **组件通用启停管控**：为所有组件引入层级通用的 `enabled` 开关，实现组件运行沙盒期的一键强行休眠与防报错重排版唤醒。
  - **纯运行时级无痕注入**：所有增删改查交互指令直接通过 WebContents JavaScript 原生注入，**绝对不脏化原编辑器 Scene 数据（彻底告别退出保存弹窗阻断）**。
  - **基础类型跨屏双向修改**：打通 `number`, `string`, `boolean` 型属性在 Vue UI 层和原生游戏运行实例层级的实时修改通道。
  - **精准过滤引擎私有属性**：深入 `__props__` 和 `__attrs__` 数据流，完美识别 `@property({ visible: false })` 以及下划线开头私有变量，只呈现允许暴露给用户的安全属性。
  - **数组与全量资源安全展示**：突破了运行时序列化的屏障，目前已支持全局识别拦截任意由 `cc.Asset` 派生的引擎资源（如 `cc.SpriteFrame`, `sp.SkeletonData`, `cc.Prefab` 等），并以专属只读引用形式直观呈现，彻底消除了由类型过滤错误产生的关键属性显示盲区。
  - **智能化枚举控件衍生 (Dropdowns)**：自带深层数据挖掘补丁。针对诸如 `sp.Skeleton` 等具有复杂内部资源的组件，爬虫能够穿透解构其挂载的运行时数据，自动抽离出所有可用的 `animations` 和 `skins` 列表。到达 Vue 渲染端后自动将传统的无约束字符串文本框升格为原生下拉选框（`<select>`），绝不留给用户手动拼写出错的机会。
  - **注入态临时日志控制器**：自带防止刷屏的黑客级浮动调试框，一键开关，用于深层排查由于隐去某些属性导致的显示偏差。

- **⏭️ 引擎时钟与单步控制 (Clock & Step Control)**
  全局单帧步进与暂停状态的双向同步。无论是通过控制面板下发暂停指令，还是监听引擎底层的 `cc.game` 状态变化，面板都能实时动态切换“⏸ 暂停”与“▶️ 播放”的视图表现。在运行时游戏点击“单帧运行”，将自动拦截定格引擎并精确推演下一帧。

- **🎛️ 灵活的窗口分辨率适配**
  支持横/竖屏动态切换、自定义多端尺寸模拟，无缝处理 BrowserView 在面板缩放和重布局时的动态占位叠加（DOM Rect 同步）。
  - **防溢出与沉浸式画面**：底层严格处理了各种异形窗口及极端缩放带来的 DOM 亚像素（Sub-pixel）运算精度误差，并通过 Webview 拦截器动态注入断绝一切原生滚动条展现的强力 CSS 锁，保障画面边界100%纯净。

## 📦 项目结构

```text
mcp-inspector-bridge/
├── package.json          # 插件清单与命令定义
├── main.js               # Cocos 插件主进程入口
├── dist/                 # 编译后的产物
├── src/
│   ├── panel/
│   │   ├── index.ts      # 插件渲染进程，Vue 3 双栏逻辑核心（负责挂载 BrowserView）
│   │   └── index.html    # 插件主面板视图骨架
│   ├── probe.ts          # 探针源码（负责注入到游戏页面提取节点树）
│   └── preload.ts        # Electron 预加载中转枢纽，打通 IPC
```

## 🛠️ 构建与编译

本项目采用纯 TypeScript 进行核心逻辑开发，并使用原生 `tsc` 进行打包编译。

```bash
# 新装依赖
npm install

# TypeScript 编译
npm run build
```
*(注：编译后请确保按 Cocos 插件机制刷新编辑器即可看到最新效果)*

## 💡 开发参考

有关插件核心挂载问题演进与双分栏注入机制的研究记录，请参考源码注释。
