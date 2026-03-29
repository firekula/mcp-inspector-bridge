# 更新日志 (Update Log)

本项目记录 `mcp-inspector-bridge` 的重大里程碑、架构变更与缺陷修复记录。

## [0.0.3] - 2026-03-29

### ✨ 新特性与架构变更
- **节点树搜索能力全面跃升 (Node Tree Search Evolution)**:
  - **多关键词 AND 逻辑**: 搜索栏现已支持通过空格分割多个关键词。算法将验证节点是否同时包含所有切片词汇，极大提高了庞大场景下标定复数特征节点的准确率。
  - **组件类名穿透搜索 (Component Deep Match)**: 搜索机制打破了仅比对层级节点 `name` 的局限。现已深度接管探针底层序列化的组件列表（如 `cc.Animation`, `cc.Sprite`），真正实现对不可见特征的跨层即搜即得。
  - **命中组件可视化反哺**: 针对纯组件名命中但在节点名上无法直观体现的节点，搜索面板会在右侧的徽章前部，自适应贴敷灰色的直列标记注释（如 `(cc.Animation)`）供用户确认，体验对标生产级 IDE 环境。
- **面板右侧分栏响应式适配 (Right Panel Narrow Optimization)**:
  - 增强了主视图下方的分栏区域布局逻辑。当面板通过拖拉缩进至极窄空间阈值时，顶部的“Main/开发者/Cocos/扩展”文字标签群将自动卸下文本累赘而保留纯图标体系 (Icon-Only Text-Hidden)，彻底阻断因断崖式溢出的多行竖文霸屏现象。
  - 为整个组件展示区域的数值属性修饰了强力的柔性挤压抗体。即便在宽度极小的情况下，带有绝对定长文字内容的组件名称输入框 (`Main Camera` 等) 也能乖巧回缩而绝不再超出界面边缘划出乱阵。
- **全局基础配置持久化扩容 (Global Layout & Toggles Auto-Save)**:
  - **动态面板拖拽记录**：彻底击碎每次重启时侧边栏无理复原的尴尬，实现了鼠标拉扯放手即抓的 IPC 记录。结合越级 `Clamp` 钳制阀防御由于不同显示器更换而可能招致的反噬越界。
  - **工具图标状态自适应**：原生 FPS 分析盖板不复呆板文本展示，更替为“状态”及带有 `📊` 和 `📉` 微动效展现；静音设置亦随之接管存档，享受长效维持体验。
- **无侵入的原生级媒体闭环拦截器 (Native Webview Audio Gate)**:
  - 增设全局“音效”截流快关。不渗入任何关于 `cc.audioEngine` 的控制权，通过 Chromium Webview 原生指令进行强有力的全域静音切断。同时配防 `dom-ready` 下刷新的状态逆回防线，屏蔽了一切不可预测的轰鸣重播音。

### 🐛 缺陷修复
- **修复跨组件坐标拖拽对峙崩溃 (Docked Mouse Misalignment Fix)**:
  - 针对分栏中轴手柄在原本脱位时依靠全屏绝对偏移减去定长产生的漂移闪跳计算做出了彻底根治。在 `startDrag` 新增记录瞬间快照起点，并将渲染偏移改为只吸收 `deltaX` 的增量捕获计算，使在何等嵌套深度的 Cocos 插槽里，拉拽始终拥有紧密顺滑的像素级同步跟随。
- **修复 cc.Node.rotation 被弃用产生的警告风暴 (Deprecated Rotation Fallback)**:
  - 将所有在运行时读取以及覆盖角度属性的路径全面接合了 `('angle' in node)` 特性的无感预热嗅探倒逼。实现了在适配新版本的 Cocos 引擎时原生使用 `-angle` 属性下发数值，完美兼容旧版的冗余 `rotation` 遗孤字段并自动执行了严格的镜像数值倒置逻辑，彻底扑灭了调试控制面板疯狂堆积废弃 Getter 的刺点黄字。

### 🧹 代码整理与优化
- **全域隔离测试日志与情绪废注清理 (Log & Comment Cleanup)**:
  - 主动清除了早期在探针层 (`probe.ts`)、桥接通道 (`preload.ts`)、IPC 侦听 (`main.ts`) 及前端控制台 (`panel/index.ts`) 中存留的大量嗅探级 `console` 输出与 `Editor.log` 占位符。
  - 彻底移除了 `postToConsole` 等向游戏内 DevTools 发送“已更新”、“测试 Ping”等刷屏级通信干扰。确立了运行时日志的极简纯净态，不再对正常的业务联调产生可见干扰。
  - 删减去除了历史重构迭代中遗留的包含主观情感、冗长或不再具有架构推敲价值的多行注释段落。增强了整个插槽插件源码层的可读性与信噪比。

## [0.0.2] - 2026-03-28

### ✨ 新特性与架构变更
- **面板窄视图响应式重构 (Responsive Narrow Panel UI)**:
  - 全面解构并增强了主控制上方的工具栏区域。在左右侧板被用户挤压导致极限空间时，含有说明文字的主操作按键（如：刷新、播放、FPS等）将自动启动隐蔽模式，无缝切入“纯图标(Icon-Only)”展现模式。
  - 其余长文本标签区域将利用 Flex Shrink 特性与文本溢出工具类强制维持单行运作，彻底粉碎了生硬的换行换排重叠乱局。
- **后台死寂场景的安全嗅探拦截与自愈系统 (Ghost Scene Safe-Connection & Auto-Recovery)**:
  - 核心痛点击破：彻底消灭了当插件由于记忆布局随着编辑器开局启动时，因后台不可见的 Scene Panel 还未建档而引爆底层 `TypeError: Cannot read property 'name' of null at Object.stashScene` 大停电报错。
  - 前台 Webview 转为动态惰性加载（Lazy Load）。在嗅探确认存活前呈现巨幕场记板 🎬 进行引导阻断。
  - 创建了高可用性轮询与焦点响应（Focus Event）唤醒的复合验证侦测防线，通过对 Editor 发送无副作用的低开销 IPC `scene:query-hierarchy` 请求，能自发判定出编辑器主背景是否就绪并瞬息内剥除遮罩完成连接闭环。
- **全局引擎资源解析与下拉控件拓展 (Global Asset Crawler & Dynamic Dropdowns)**:
  - 重组了 `typeof val === "object"` 的前端爬虫逻辑拦截网，打破了之前只有 `cc.Node` 才能被记录的限制，现已开放并全局接管了所有派生自 `cc.Asset` 的骨骼、纹理和音频等各类素材引用。在属性列表内以带有类名前缀的专属样式（`asset_ref`）安全呈现，彻底弥合因复杂数据类型退化导致的属性显示盲地。
  - **Spine 针对性体验升维**：自 `sp.SkeletonData` 突破封锁正常上报后，爬虫脚本更进一步发起了向其内部数据源 `getRuntimeData()` 的向下窥探，精准提炼出引擎已实例化的动画与皮肤表单，合成并随对象抛出 `enumList` 枚举。前台拦截此附加标记后，完美将 `defaultSkin` 与 `animation` 从危险且盲目的 `<input>` 型文本录板，涅槃重生为极度安全的下拉甄选器（`<select>`），体验全面比肩甚至超越原生系统。
- **持久化用户偏好配置 (User Preference Persistence)**:
  - 新增了分辨率边界宽高的本地记忆功能。依靠 `Editor.Profile` 与主进程建立专线存储（严格保存在独立工程的 `settings/mcp-inspector-bridge.json` 专属环境内），彻底终结了每次重载插件均需手动复原设备窗口比例的冗余操作。
  - FPS 高级分析面板检测同步加入归档阵列。原先的按钮开关状态已全面转正为受控长效状态机制，不仅持久锁定选择，更在因重载、热更导致引擎内核发生下层 `handshake` 重握手的毫秒级瞬间主动将截获状态强势逆注覆写回运行时系统层，提供永不断档即开即见的高级顺滑体验。
- **纯运行时级数据注入 (Pure Runtime Data Injection)**:
  - 彻底移除了原先基于 Editor IPC（`scene-script.js` 和 Undo Group）的属性跨进程修改架构。
  - 现在 Inspector 的所有属性修改（包括节点 Transform 和所有 Components）将完全绕过编辑器序列化管线，通过在 `gameView` (Webview) 中原生执行 JavaScript 直接对内存中的 `cc.Node` 与 `cc.Component` 实例进行赋值。
  - **核心收益**：大幅度提升属性同步率与真实表现一致性；彻底解决了修改属性后引发编辑器“场景已修改，是否保存”的误拦截弹窗；彻底根除撤销系统抛出的 `Unknown object to record` 致命警告。
- **组件通用启停控制器 (Universal Component Enable/Disable Toggle)**:
  - 在 Node Inspector 的所有组件（如 `cc.Widget`, `cc.Sprite` 等）名称旁，新增了全局统一的复选框层。
  - 玩家现在可以实时勾选控制运行沙盒中针对该组件的 `enabled` 状态，实现运行时引擎排版或重渲染的强行唤醒与休眠，极大提升了调试时的状态流转控制能力。
- **引擎时钟与单步帧控制 (Global Frame Step & Pause Sync)**:
  - 增强了主控制面板栏上的“单帧运行”逻辑。当游戏正在运行时点击该按钮，系统将在下发单步命令前，自动下令挂起主循环 (`cc.game.pause()`)，实现了先定格再推帧的精确干预。
  - 面板接入了游戏暂停状态的双向响应。通过 `probe.ts` 持续轮询附带 `cc.game.isPaused()` 的心跳回传，控制栏按钮能够实时流转变为动态绑定的“⏸ 暂停”和“▶️ 播放”响应态；并具备点击瞬间立刻生效的乐观预测覆写，消除网络传递的视觉阻回感。

### 🐛 缺陷修复
- **修复 Widget 属性修改后页面表现无响应问题**：由于绕过了同步流的副作用，目前所有的 `cc.Widget` 变更操作后，执行链会自动追猎调用 `comp.updateAlignment()` 以驱动 Cocos 的流式排版强制刷新边距，实现视觉对齐。
- **修复面板后台挂起切回时的动画抖动 (Webview Resize Bounce Fix)**：
  - 针对带有物理限定的测试分辨率预览框，在面板切至后台隐藏而失去宽度为 0 随后再次切回时，因 CSS 过度滥用造成的容器尺寸从 100% 回弹的扭曲形变。
  - 通过在探针挂起时对 `ResizeObserver` 及旧版 `window.resize` 添加强制防零短路，并结合 `index.html` 内移除 `transition: all`，完美遏制恢复显示时的闪烁错视。
- **修复重载刷新丢失暂停同步标记的 Bug**：填埋漏洞，强行在触发 `refreshGame()` 初始化重载的时刻并入 `globalState.isGamePaused = false` 归零指令，使重启后的操作拦恢复稳定，清缴了当游戏停歇时按刷新依旧错误残留的“▶️ 播放”表象。

---

## [0.0.1] - 2026-03-27
### ✨ 新特性与架构变更
- **运行时节点树 (Runtime Node Tree)**:
  - 实现类似 Unity 的场景节点实时监察面板。通过插入爬虫预加载器（`runtime-crawler.js`），每秒以 JSON 序列化形式通过 IPC 推送最新的节点树结构。
  - **动态组件图标与染色支持**：增加预制体 (Prefab) 以及深层级解构支持，深度渲染不同的文本颜色以反映潜逃等级（深蓝、海蓝、紫粉等），根 Scene 节点使用专属 🌐 图标。
  - **搜索与定位增强**：新增树状结构的名称过滤（包含高亮），并在一键清除搜索时能够准确留存路径祖先（`ancestorIds`），防止列表暴力重折叠。
- **节点属性审查器 (Node Inspector)**：
  - **装饰器属性精准映射**：深入剖析并打通了 Cocos 2.4 原生 `@property` 注册机制。优先遍历 `__props__` 及内置 `hiddenBuiltins` 黑名单过滤 `_objFlags` 等字段，并通过读取 `__attrs__.visible` 以及检查私有下划线前缀确保暴露层的绝对安全。
  - **基础与数组类型的跨域处理**：实现 `string`, `number`, `boolean` 的双端响应式挂载及编辑；完成对 `Array` 类型的降级只读序列化（防回环卡死），并实现了特殊资源 `[cc.Prefab]` 等格式的名字提取及可视化罗列展示。
  - **内置隔离的控制台 Debug 日志浮窗**：在 `runtime-crawler` 前端引入静默工作制，在控制面板上加装 Checkbox 开关。开启后即可在画面左上角挂载半透绿色骇客级防刷屏输出台，实时打出 `__attrs__` 序列诊断日记，用完即关。
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
- **修复游戏预览区域不可控的滚动条问题**：
  - **症状**：在部分特殊的分辨率模拟模式下（例如 iPhone X / Android 1080p），或者拖动窗口缩放导致产生浮点比例时，预览区会不自主地爆出原生水平或垂直的滚动轴，且可以直接干预游戏画面中心点。
  - **修复策略**：重构了 `gameContainerStyle` 取回基于 `Math.floor()` 的亚像素下取整安全宽度保障；在面板 `index.html` 层级全面增加 `overflow: hidden;`；并且利用 `insertCSS` 对 `webview` 生命周期发起了跨域样式篡写，深度摧毁隐藏了原生的 `body` 以及 Cocos 测试壳底层的 `.contentWrap` 自动溢出属性与 Webkit 控制杆。

---

## [0.0.1-alpha] - 2026-03-26

### ✨ 早期探索历程
- **挂载首测**：测试单栏到双栏的 UI 改造。
- **抢占式探测机制**：通过 Vue 3 引入 20ms 微秒级轮询池 `setInterval` 用于捕获 Webview ID。
- **预加载流建立**：撰写 `preload.ts` 将 IPC 和通信能力安全地注入到 Cocos 原生 `gameWV` 窗口。

### 🐞 遗留问题
- DevTools 会渲染出一个没有 DOM Tree、网络连接状态的死实例（现已全力攻破）。
