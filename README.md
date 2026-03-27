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

- **🎛️ 灵活的窗口分辨率适配**
  支持横/竖屏动态切换、自定义多端尺寸模拟，无缝处理 BrowserView 在面板缩放和重布局时的动态占位叠加（DOM Rect 同步）。

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
