# 更新日志 (Update Log)

本项目记录 `mcp-inspector-bridge` 的重大里程碑、架构变更与缺陷修复记录。

## [0.0.1] - 2026-03-27

### ✨ 新特性与架构变更
- **彻底抛弃 Webview 挂载模式 (原生架构跃升)**：
  - 由于 Cocos 插件基于旧版 Chromium 内核，`<webview>` 的默认 `about:blank` 导航锁死了 `webContents.setDevToolsWebContents()`。
  - 采用了更为稳定的底层 `BrowserView` 原生框架层方案。
  - 完成了双分栏视图：游戏画面为 Webview，DevTools 为上层悬浮绝对定位的 `BrowserView` 映射。
- **完善的视图占位引擎**：监听 `resize` 事件与 `getBoundingClientRect()`，实时同步 `BrowserView` 尺寸至左侧 Vue 面板内的伪占位 `<div ref="devtoolsView">`。

### 🐛 缺陷修复
- **修复 DOM Tree 初始化黑屏问题**：根源在于 `<webview>` DOM 生命周期紊乱，切至 `BrowserView` 后彻底解决"有壳无树"的 `DevTools` 连接问题，使 CDP 前端完全捕获目标页面的结构树。
- **捕获并压制 `cc.Scene` Getter 崩溃**：
  - **症状**：Cocos 2.4 当 `node instanceof cc.Scene` 时，任何对其 `node.active` 的求值均会触发内部警告日志不断刷屏。
  - **修复策略**：在探针代码 `src/probe.ts` 与主面板 `src/panel/index.ts` 中加入双重预检防御。如果是引擎 `cc.Scene` 类型对象，直接设置其标识位为 `true`，切断危险属性嗅探，保证 Console 日志清洁无乱码。

---

## [0.0.1-alpha] - 2026-03-26

### ✨ 早期探索历程
- **挂载首测**：测试单栏到双栏的 UI 改造。
- **抢占式探测机制**：通过 Vue 3 引入 20ms 微秒级轮询池 `setInterval` 用于捕获 Webview ID。
- **预加载流建立**：撰写 `preload.ts` 将 IPC 和通信能力安全地注入到 Cocos 原生 `gameWV` 窗口。

### 🐞 遗留问题
- DevTools 会渲染出一个没有 DOM Tree、网络连接状态的死实例（现已全力攻破）。
