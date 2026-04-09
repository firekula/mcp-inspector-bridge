# 更新日志 (Update Log)

本项目记录 `mcp-inspector-bridge` 的重大里程碑、架构变更与缺陷修复记录。

---

## [0.1.5] - 2026-04-09

### ✨ 新特性

- **MCP 多实例支持及动态端口寻址 (Multi-Instance Support & Dynamic Port Allocation)**: 为解决同时运行多个 Cocos Creator 项目时发生的端口冲突 (`EADDRINUSE`) 这一阻碍痛点，重构了底层中控网关，为 AI 开启了能够掌控多开平行宇宙的钥匙。
  - **动态端口递推注入**: 彻底解放硬编码端口（默认 4456），当端口被占用时实现无限自动累加探测直至锁定可用端口。
  - **基于项目身份的握手协议 (Project Identity Handshake)**: 拦截并扩展底层探测的 Ping/Pong 心跳回执，向心跳回包中注入包括 `projectName` 与 `projectPath` 在内的项目特征元数据，确保端口与对应编辑器实例 1v1 绑定。
  - **AI 动态路由系统与扫描截获 (AI Dynamic Routing & Scanning)**: 当 AI 未明确目标时自动拦截并要求指定具体通讯端口；新增广域端口扫描能力，同时实装两个重要的 MCP 路由工具：
    - `get_active_instances`: 主动探测并返回当前运行中所有的 Cocos Creator 实例及其对应端口和名称等身份信息。
    - `set_active_instance`: 允许 AI 锁定目标实例的通讯端口，保障 RPC 通令的定向送达。

### 🧹 代码整理

- **重构与清理 (Refactor & Cleanup)**
  - 删除多实例验证用测试死代码 `test-multi-instance.js`，保持代码库整洁。
  - 为 `main.ts` 中的 `getBaseName` 补充标准的 JSDoc 注释。
  - 更新 README 特性说明和项目结构，补全多实例机制文档。

---

## [0.1.4] - 2026-04-08

### ✨ 新特性

- **优化 (Optimization)**: 重构了 WebView 环境下的运行时日志底层拦截架构，使用 `Proxy` 特性降低直接重写 `console` API 带来的栈指针偏移问题。辅助 DevTools 黑盒 (Ignore List) 配置，实现完美的原生日志溯源体验。
- **日志采集架构重构 — 迁移至 CDP 被动监听与主动注入防御 (Active CDP Log Listener)**: 彻底废弃 console-hijacker 的 Monkey-Patching 方案，采用双轨制混合模式零侵入式捕获引擎全量日志。
  - 新增 `cdp-log-listener.ts` 主进程模块，针对原生预览器开启 CDP Native 监听；对于特殊渲染构建的基于 Webview 架构，运用隐式 `Proxy` 和自底向上异步策略捕获对象通道。
  - **全天候主动注入 (Eager Injection)**: 主进程守护常驻 1000ms 心跳扫描，不依赖 AI 交互被动唤醒，一旦检测到游戏窗口初始化，首帧启动前即刻植入钩子，彻底终结早期的生命周期丢失错误。
  - 提升了队列缓冲容灾上限至 `1000` 条记录，拓印超长错误边界放宽到 `2000` 字符软截断保护。
  - 游戏代码的 console.log/warn/error 和 cc.log/warn/error 不再被任何中间层破坏堆栈，DevTools 显示真实文件名和行号（不再显示 VM497）。
  - `console-hijacker.ts` 保留为空壳 @deprecated 占位函数。

---

## [0.1.3] - 2026-04-08

### ✨ 新特性

- **运行时日志来源追踪增强 (Runtime Log Source Tracking)**: 解决了预览环境开发者工具控制台日志均显示为 VMxxx:N 虚拟路径而无法定位原始调用位置的问题。通过在 console-hijacker 劫持层引入 Error.stack 堆栈捕获与帧解析机制，自动提取调用者的真实文件名与行号，并注入到日志消息前缀及内部 RingBuffer 存储的 source/rawStack 扩展字段中。
  - 新增 `parseCallerSource()` 工具函数，支持 V8 引擎两种标准堆栈帧格式解析
  - 日志消息自动注入 `[file:line]` 来源前缀，DevTools 中可直接辨识
  - MCP `get_runtime_logs` 工具返回值扩展 `source`（结构化位置）和 `rawStack`（截断堆栈）可选字段
  - 向后兼容，旧 schema 消费方不受影响

---

## [0.1.2] - 2026-04-08

### ✨ 新特性

- **MCP 增强：模拟物理交互视觉动效注入 (Simulate Input Visual Feedback)**: 为了解决大语言模型在使用 `simulate_input` 触发场景点击/长按/滑动交互时缺乏直观视觉调试反馈的痛点，创新性地运用透明挂载机制将基于 CSS3 原生 `animation` 驱动的动效容器注入到了游戏渲染画布之上层。现在，所有的跨越时空的模拟行为（单次的涟漪点击、带时效的圆环渲染、跟随轨迹的漂移发光点）都会自动渲染呈现，并且能够在完全不污染游戏本身层叠上下文 (Stacking Context) 下实现“阅后即焚”的安全销毁。

---

## [0.1.1] - 2026-04-05

### ✨ 新特性

- **实现属性编辑器自动同步及防输入冲突保护 (Inspector Auto-Refresh with Hover Guard)**: 为节点属性面板引入 0.5 秒频率的静默增量同步重载策略。当节点在场景中随游戏主循环变化（如动画、位移或刚体模拟）时，面板数值会精准追平实时状态；且通过鼠标悬空 `Hover` 检测在用户处于编辑交互意图时挂起刷新动作，彻底杜绝了数据刷新对光标及未落库录入值的暴力覆盖或打断。
- **现代化组件属性面板设计重构 (Modern Component Inspector UI)**: 将组件渲染的内嵌临时样式全面替换为遵循 `.inspector-card` 设计范式的 CSS Variable 体态体系，包含悬浮发光交互、渐变深色背景的 `asset-link`、以及更为紧凑整洁的层级表现，视觉更加统一和舒适。
- **现代化数组专属排版渲染 (Modern Array Layout UI)**: 设计分岔 DOM 约束，针对 `array` 类型的字段启用分离的换层下潜弹性布局结构（附带斜体表头及元素计数信息），彻底解决原生单一横轴排列对于多数组成员产生的局促推挤和换行截断乱象。
- **节点基础属性区风格统一 (Node Basics UI Modernization)**: 彻底消除了顶部节点基础数据区（Position, Scale, Color）与组件属性区之间的风格割裂，将基础区完全接入 `.inspector-card` 和 `.component-header`，并使用全局通用 CSS 变量格式化输入框。
- **属性编辑器支持拉取核心组件原生枚举级联下拉 (Enum Dropdown Support in Inspector)**: 完全重构并兼容渲染继承自 `cc.Component` 的枚举类型，将编辑器原有的单纯数字化表单升级为基于 Web `<select>` 标签构建的可读性选项。并成功向下植入了超 40 种如 `Sprite.type`, `Label.horizontalAlign` 的下拉元数据。
- **节点属性名称实际字段关联一致化 (Align Node Properties)**: 彻底标准化了 Node Basics 面板属性显示的视觉元素名称，将历史以大写首字母简写的占位符如 Pos/Rot/Size 等全面替换为符合真实载体的 position/contentSize/width/height 小写原生属性命名规范；并且针对旋转轴属性特别植入了针对探针底层的特性嗅探逻辑，能够在 `rotation` 与 `angle` 名称间自适应切换，向使用者传达最精准的环境绑定感知。
- **Global Info Categorization**: Enhanced the 'Cocos Environment' tab to support dynamically categorized global metrics with `<details>` accordions. Captures exhaustive context including Downloader settings, Dynamic Atlas parameters, 2D Physics metrics, and Collision system configurations.
- **Preview Resolution Options**: Added 32+ new comprehensive device resolution presets encompassing iOS/iPadOS flagships, standard Android phones, multi-form foldables, and tablets to support thorough UI boundary tests。

### 🐛 缺陷修复

- **动态图集高性能查看器升维重构 (High Performance Dynamic Atlas Viewer)**: 攻关由于巨幅缓冲纹理在 Electron 缩放时引发的重排（Reflow）性能瓶颈与原生 `zoom` 导致容器 Flex Box 越界卷轴塌陷问题。将传统 DOM 自适应流改造为受控的二维中心抛拽视口结构 (2D Viewport) — 以 CSS transform 为轴驱动无限画布的矩阵平移与无极滚轮缩放，并剥除外网格幽灵拖拽打断，从而支持像平底锅一样顺滑地拖着成千上万像素的显存级原始图集查看。
- **废弃图集属性报错清除及视图增强 (Dynamic Atlas Fix & Debug UI)**: 彻底移除了因为 `minFrameSize` 在引擎升级后引起的日志刷屏异常；在面板中对该废弃字段同步进行了降级补偿提示。同时补全拓展了图集相关的全局统计指标，并在工具栏新增一键注入开启/关闭动态图集网格可视化的调试选项 (`showDebug`)，方便性能排查。
- **修复组件数据日志导出失效 (Print Component Data Fix)**: 修复了在未开启全局日志调试变量 `__MCP_DEBUG__` 期间，点击属性面板中组件头部的 🖨️（导出/打印）按钮无法向控制台输送信息的问题。已针对用户显式触发的功能指令还原高优先级独立打印逻辑。
- **修复预制体资源跳转按钮在静态场景下失效的问题 (Static Prefab Asset Locator Fix)**
  - **问题**：在 v0.0.8 引入的 🎯 按钮，遇到了巨大的运行时剥离阻碍：编辑器直接放置在场景内的静态预制体实例，在预览运行期间，其内部真正的 `uuid` 与 `_prefab.asset` 引用均被引擎为了内存考虑压缩剔除了，导致底层探针无法获取。
  - **方案**：在面板前端通讯层引进“桥接回退提取机制 (Editor Fallback)”：一旦查明 WebView 无法提供合法预制体 uuid，即刻向编辑器发送 `scene:query-node` 读取未阉割的编辑态 JSON Dump 结构数据。并内置了一套高防御性的递归解析器解开所有序列化包裹屏障，精准提取深埋在 `v.prefab` 内原始的 uuid，让跳转功能重焕生机并且覆盖 100% 全场景树实例。

- **模板闭合缺失修复 (Template Tag Fix)**: 修复了重构期间由于替换失误导致的 HTML 标签未闭合产生的 Vue 编译器警告。
- **修复面板数组列表宽度溢出 (Array List Overflow Fix)**: 修复了属性检查器中，数组型属性（如 Sprite 的 materials 列表）因为缺失盒模型导致整体外向撑开，使得名称长文本资源被截断失效并且遮盖压扁外部靠右定位按钮或显示异常的问题。

## [0.1.0] - 2026-04-04

### ✨ 新特性

- **增加多渠道 MCP 自动配置支持 (Multi-channel MCP configuration support)**
  - 面板新增支持一键识别并配置 Claude Desktop、Windsurf、Zed、VS Code (Cline / Roo Code)、Trae / Trae CN、Cherry Studio 等主流智能体宿主环境。

- **MCP 基础资源与性能分析加强**
  - 接入 `@modelcontextprotocol/sdk` 中的 `resources` 接口，暴露出 `scene://hierarchy` 的数据源。
  - 引入 `prompts` 支持，定义了 `cocos-api-24x` 防幻觉提示词。
  - 新增工具 `get_runtime_stats` 以配合性能面板监测当前游戏的帧率、渲染耗时和并发的 DrawCall。

### 🐛 缺陷修复

- **修复高级版 Electron 引起的 IPC 克隆崩溃与探针初始化挂起假死 (IPC Structured Clone Exception Fix)**
  - **问题**：新版 Electron 的 IPC `sendToHost` 强制基于安全对象结构化克隆 (`structuredClone`)，在收到探针上传的不纯洁对象（包含函数闭包或原生引用，如 `cc.assetManager.downloader` 等全局属性）时，在执行期间直接引发异常被阻断。致使初始化后续轮询逻辑完全腰斩，只有在超时告警后 `Fallback` 退化机制登场才能拉得取到场景树。
  - **方案**：改由 Webview 直接通过安全的 `JSON.stringify` 在沙盒内侧字符串化抹掉函数，主进程接收后按需 `JSON.parse` 还原。

- **修复部分魔改高版本 Electron 下 `remote` 未定义导致的白屏崩溃 (Electron 14+ remote polyfill/fallback)**
  - **问题**：在部分已经将引擎内置 Electron 升级到 v14 以上（如 16.5.0 原生去除了 remote 模块）的环境下，对 `electron.remote` 的解构直接导致 DevTools 初始化异常阻塞甚至面板渲染致命白屏崩溃。
  - **方案**：采用 `try-catch` 包裹下沉的安全获取逻辑，自动判断并回落至 `@electron/remote`，同时增加内部深层级方法如提取 `BrowserView` 阶段的安全非空拦截。

---

## [0.0.9] - 2026-04-02

### ✨ 新特性

- **暴露节点树遍历能力 (Expose Node Tree API)**
- **原生屏幕坐标系交互劫持 (simulate_input 强化)**：废弃了之前强绑定具体组件发号施令的落后行为（盲人摸象），完全重构了 `simulateInput` 模块，通过 Web 相机的逆向投影捕获，以真正的全局 DOM 级 `MouseEvent` 对 GameCanvas 发起多态交互（兼容任意 X/Y 点击、长时间按压、滑动擦除等复杂用户实体行为），使 AI 模型获得更接近常人的游戏游玩体感。
- **获取游戏运行时日志 (get_runtime_logs)**：为 AI 大模型增加探测游戏运行期间所抛出的错误日志和业务日志的功能 (`capture engine cc.error and window.console`)。为预防内存溢出及上下文长度爆炸，探针拦截底层采用 RingBuffer 限流（最高缓存 500 条），且 IPC 透传层强控制单次提取上限不得超过 100 条。
- **获取节点树 (get_node_tree)**：新增 MCP 工具，允许 AI Agent 主动下发获取全局节点树命令，通过 `depth` 入参实行服务端剪裁，安全暴露宏观场景结构而不撑爆大语言模型上下文。

- **MCP 架构化与巨无霸模块重构 (MCP Architectural Refactoring)**
  - 弃用臃肿的 `main.ts` 与 `if-else` 分支，拆解并引入 `TOOL_IPC_MAP` 字典路由系统 (`ipc-router.ts`)。
  - 为底层向插件面板的分发引入了原子化的延时熔断机制（Promise 带 3s 超时抛出），一举根治 WebView 无响应导致的 AI 客户端死锁宕机。
  - 将 460余行的 `crawler.ts` 前端探针文件重构解耦，抽离探针与序列化模块。

- **AI 节点全周期操控闭环 (AI Advanced Control Capabilities)**
  - **原子预检沙盒**：在 WebView JavaScript 执行层面包裹由 `findNodeByUuid` 构建的有效性安全预检，阻拦悬空指针。
  - 新增深度观测功能：探测节点包围盒坐标 (`worldPolygon`) 及交互性 (`interactable`)。
  - 暴露节点操控工具：`get_node_detail`, `update_node_property`, `get_memory_ranking`, `simulate_input`，实现了从读取、诊断、修改到交互模拟的全图景能力。

- **MCP 接入第三阶段 (MCP Integration Stage 3)**
  - **AI 视觉检查支持**：在主进程级横向拓展 MCP 截图能力的支持，让 AI 能够获得游戏界面的视觉截图供排版核对与布局验证。
  - 主进程静默寻址 WebContents 进行网络通信并处理图像 Base64 编码，无需任何面板层的 UI 大动干戈。

- **MCP 接入第二阶段 (MCP Integration Stage 2)**
  - **JSON-RPC 只读探针**：增加基于 JSON-RPC 规范的节点读取操作，为 AI 开启只读探针视镜并防幻觉泛化。
  - 优化底层探针序列化管线，部署专为大语言模型打造的精简字典提炼接口。

- **MCP 接入第一阶段 (MCP Integration Stage 1)**
  - 架构更新：增加了依赖建立于 `4456` 端口连接的 MCP-Inspector WebSocket 通信桥。
  - 新增 `mcp-client` 作为纯 Node 探针客户端，负责和中控建立双向验证闭环。

- **MCP 接入标准升级与自动化挂载 (MCP Protocol & Auto Config)**
  - 引进原生 `@modelcontextprotocol/sdk`，对 `mcp-client` 进行标准 Stdio Server 化重构。
  - 在偏好设置界面新增【AI 伴侣集成】栏目，实现了高级的可视化客户端管理配置系统，摒弃了一键盲注黑盒。
  - 支持了自动扫描检测多宿主 AI 环境（如 Cline / Claude Desktop），采用状态指示灯并在可折叠的【Manual Configuration】中向所有级别人群直白展示欲挂载的 JSON 结构并支持一键 Copy。
  - **交互体验 (UI Fixes):** 全量替换了配置界面的硬编码英文至中文本土化显示，并加入高级 `Toast` 防重点击延时器（消隐挂载日志）。

- **支持全局 UI 缩放与设置面板 (Global UI Scaling and Settings Panel)**
  - 在右侧标签栏增加了专属的“设置 (⚙️)”入口。
  - 通过操作 `#app` DOM 容器级的独立 CSS `zoom` 取代全局 `webFrame` 倍率，防范了缩放对其他编辑器面板的跨界污染。
  - 通过注入基于除法 `uiScale` 基数的拖曳像素对冲，修复了因 zoom 引发的侧边手柄原生坐标断轴偏移问题。

- **全局基础字号适配 (Base Font Size System)**
  - 新增独立的基础字号系统，采用 CSS Variables 加 `calc()` 接管绝大部分面板内文本字号。
  - 有效分离于 UI Zoom 机制，支持持久化的局域化字号独立调节，解决了字体在小屏幕下依然过大的痛点。
  - 精简了性能面板中的中英混杂注释后缀（如 `(Tick)`，`(TOP)`），将孤立的硬编码字号全数重构并推入 `calc(var(--base-font-size))` 公式树。
  - 在资源排行的头部拓展并新增了底层所有探针采集的 `totalMemory` 汇聚值，便于在宏观上把控整体内存负荷。

- **检查器专属排版选项 (Inspector Layout Toggle)**
  - 偏好设置中增加“检查器排布方向”控制，支持“横向并排”与“纵向并排”。
  - 将节点树和检查器的固定水平排布解锁，增加了垂直方向拖曳控制 `nodeTreePanelHeight` 及专属手柄样式。
  - 用户偏好的排版将即时存入 localStorage 并在热重载时平滑恢复。

- **渲染诊断面板响应式适应 (Render Debugger Responsive UI)**
  - 弃用固定的按百分比硬性切割 `width` 方案。
  - 引入原生 Flexbox 的 `flex-wrap: wrap` 以及 `flex-basis`/`min-width` 折行响应策略。
  - 极窄视窗下，诊断三栏将优雅折断为上下平铺的三重堆叠层级，防范文本重叠失真。
  - 全面精简渲染面板的说明：剔除括号内冗余的英文释义，将“前进一步”收缩为纯极简的图示控制。

### 🐛 缺陷修复

- **修复拾取器无法过滤零缩放节点问题 (Picker Scale=0 Filtration Fix)**
  - **问题**：在原射线命中算法中仅检测了 `active` 和 `opacity`，未跳过物理外显尺寸被压成 0 甚至由于 `scaleX/scaleY=0` 退化为伪影的节点，导致鼠标悬停经常死锁捕获隐身子代而脱靶。
  - **方案**：增加在深搜遍历前置期使用容错运算直接剪枝 `scale === 0` 或 `scaleX/scaleY === 0` 的判断树，免于注入后置的几何矩阵 `NaN` 越界逆推运算。

- **修复 UI 缩放与面板宽边界变动时开发者工具视图未同步裁切对齐问题 (BrowserView Out-of-Sync Fix)**
  - **问题**：原生脱离 DOM 的 BrowserView 没有主动响应 CSS `zoom` 和窗体宽窄拖拉的机制；且在 Chromium 59 旧内核下，带有 `zoom` 属性的容器调用 `getBoundingClientRect()` 会返回被虚假拉伸放大的不标准坐标，导致包围盒投影不仅没有收缩对齐，反而向外越界漂移穿模。
  - **方案**：引入 `rightPanelWidth` 侦听绑定，以及 `setTimeout(20ms)` 的脱管空窗补偿；并在最终包围盒校准环节废除锚点求差法，直接将返回的 `rect` 属性执行 `* uiScale` 重组为纯粹的绝对物理屏幕像素轴。

- **修复 Vue Shadow DOM 下的 IPC 调用失效与超时崩溃 (IPC Shadow DOM Fix)**
  - **问题**：`get_selected_node` 时面板上的 `document.querySelector('#game-view')` 无法突破 Vue 在插件面板创建的隔离树，并因为同步抛回错误导致 `Editor.Ipc.sendToPanel` 漏接 Promise `catch` 而出现 `ETIMEOUT` 事件死循环。
  - **方案**：使用原生的 `this.shadowRoot.querySelector` 强行击穿隔离直接捞取底层活跃 Webview，同时在周边使用严密的 `try-catch` 防止同步调用漏斗崩溃。

- **修复极窄面板下分辨率选择框不可读 (Toolbar Responsive Wrap)**
  - **问题**：操作栏固定 `height: 35px` + `overflow: hidden`，极窄时分辨率 `<select>` 被压扁到 0px
  - **方案**：`min-height` + `flex-wrap: wrap` 自动折行 + `min-width: 120px` 保护 + CSS `order` 重排窄模式元素布局

- **修复节点属性提取短路导致缩放置零失效及引擎缩放适配问题 (Inspector Scale Panel Nullification Fix)**
  - **问题**：原先用于安全回退的 `scaleX || 1` 在遇到合法的 `0` 值时引发 JS 短路错误，导致缩小到 0 的节点在面板错误展示为 1。同时未适配部分引擎版本的 `Vec3` 类型 `scale` 属性导致直接写入 `scaleX` 无效。
  - **方案**：改用精确的 `!== undefined` 取代 `||` 判断，修复了包括坐标、宽高、旋转及缩放等全面数值的 Falsy 截断漏洞。并在探针写入侧拦截 `scaleX/scaleY` 的单轴事件，当检测到纯对象形式的 `scale` 存在时代理重组为整体赋值触发 Setter，无缝向下兼容引擎缩放内核逻辑。

- **修复 NodeInspector 模板闭合标签缺失 (Fix Missing End Tag in NodeInspector Template)**
  - **问题**：`NodeInspector` 组件的 `v-for` 循环容器 `<div class="comp-section">` 缺少 `</div>` 闭合标签，导致 Vue 模板编译器报出 `Element is missing end tag` 警告
  - **方案**：在 comp-body 闭合标签后补充遗漏的 `</div>` 闭合标签

---

## [0.0.8] - 2026-04-02

### ✨ 新特性

- **紧凑型图标工具栏 (Compact Icon-Only Toolbar)**
  - 移除工具栏按钮文字标签，统一为 `26x26` 纯图标矩阵
  - 通过 HTML5 原生 `title` 属性提供悬浮提示，支持引擎状态感知的动态提示文案（如 "▶️ 恢复播放"）
  - 释放大量横向空间，极窄面板下也不变形

- **全局调试日志开关 (Debug Log Toggle)**
  - 新增 `src/probe/logger.ts` 统一日志代理，废弃各模块散乱的 `isDebug` 判断
  - 基于 `window.__MCP_DEBUG__` 门禁，默认静默所有探针日志
  - 非致命警告自动降级，控制台 100% 留给游戏业务

- **包围盒渲染重构 (Bounding Box Overhaul)**
  - 弃用不稳定的 `getWorldMatrix` 提取法，改用 `convertToWorldSpaceAR` + 锚点逆推生成 4 角多边形
  - 零宽高节点自动降级为十字准星标记
  - 完美处理父级嵌套旋转、倾斜等复杂变换

- **Scene 节点只读保护 (Scene Node Readonly Shield)**
  - 探针前置拦截 `cc.Scene`，属性面板展示"[场景] 不可直接编辑"占位 UI
  - 根治 `active is not defined in the Scene` 报错

- **预制体资源定位器 (Prefab Asset Locator 🎯)**
  - 挂载预制体的节点头部新增 `🎯` 按钮，一键跳转至编辑器资源管理器定位 `.prefab` 文件

- **节点树空白取消选中 (Blank Area Deselection)**
  - 点击节点树空白区域即可清除选中，联动属性面板归零 + 高亮退场

### 🐛 缺陷修复

- **修复多摄像机 CullingMask 遍历断层 (CullingMask Traversal Fix)**
  - **问题**：UI 相机只渲染特定分组时，父节点（如 Canvas）不满足掩码会导致整棵子树被剪枝
  - **方案**：取消前置拦截，引入 `parentValidated` 递归基因继承；`default` 分组子节点允许继承父级的相机放行特权
  - 新增交互组件白名单：`Button` / `ScrollView` / `BlockInputEvents` 等
  - 剔除排版组件：`Widget` / `TiledObjectGroup`

- **修复视口映射偏置导致的选取脱靶 (Dual-Scale Offset Fix)**
  - **问题**：`camera.getScreenToWorldPoint` 实际需要设计分辨率坐标而非屏幕坐标，导致拾取区域整体下移
  - **方案**：剥离黑边偏移和全局缩放，提取纯净的 `BaseWorldPos` 后喂给摄像机逆投影

- **修复高亮引擎跨相机对齐 (Highlighter Cross-Camera Alignment)**
  - 子相机角点转交 `InspectorCamera` 时追加跨域逆投影校准

- **修复热重载后高亮相机断链 (Hot-Reload Camera Reuse Fix)**
  - **问题**：节点复用分支遗漏了 `__mcpInspectorCamera` 绑定，导致包围盒坐标偏至屏幕外
  - **方案**：复用分支强制执行 `camNode.getComponent(cc.Camera)` 闭环绑定

- **修复后台切回黑屏 (Background Preview Black Screen Fix)**
  - **问题**：面板后台时 Webview 尺寸为 0x0，强行刷新导致黑屏
  - **方案**：`clientWidth/Height === 0` 前置拦截 + `pendingRefresh` 挂起标记 + `ResizeObserver` 切回自动恢复

- **修复横屏滚动条复发 (Landscape Scrollbar Fix)**
  - **问题**：横屏宽高互换后（如 750x1334 → 1334x750），Cocos 模板容器绝对宽度溢出
  - **方案**：`preload.ts` + `useGameView.ts` 双层 CSS 注入，全容器 `width/height: 100%` + `max-width/max-height: 100vw/100vh` + `*::-webkit-scrollbar` 全局隐藏

---

## [0.0.7] - 2026-04-01

### ✨ 新特性

- **探针架构模块化拆分 (Probe Architecture Decoupling)**
  - 将 1700+ 行的单文件 `probe.ts` 拆分为 7 个高内聚子模块：
    `index.ts` / `crawler.ts` / `highlighter.ts` / `profiler.ts` / `memory.ts` / `render-debugger.ts` / `picker.ts`

- **ESBuild 集成 (Fast-Bundler Integration)**
  - 引入 `esbuild` 将探针子模块打包为单一 IIFE 闭包 (`dist/probe.js`)
  - `npm run build` 同时执行 tsc + esbuild，`preload.ts` 调用方式不变

### 🐛 缺陷修复

- **修复 IPC 递归死循环 (IPC Bouncing Loop Fix)**
  - **问题**：面板选中节点 → `setSelectionTarget` → 探针反弹 `sendNodeSelected` → 面板再次展开 → 无限循环
  - **方案**：严格单向数据流，移除 `setSelectionTarget` 接收端的反弹反馈；仅物理拾取器触发上行广播

- **修复多摄像机 + Fit 缩放下的拾取偏移 (Multi-Camera Viewport Fix)**
  - **问题**：`camera.getScreenToWorldPoint` 未计入 Viewport 缩放与黑边裁剪
  - **方案**：通过 `cc.view.getViewportRect()` + `getScale()` 提取物理算子，降维到纯净 `BaseWorldPos` 后喂给摄像机

---

## [0.0.6] - 2026-03-31

### ✨ 新特性

- **全景节点属性扩展 (Node Transform Properties Completion)**
  - 新增 `Anchor`（锚点）、`Color`（颜色）、`Opacity`（透明度）、`Skew`（倾斜度）、`Group`（渲染分层）编辑支持
  - `Color` 支持 Hex ↔ `cc.Color` 安全互译；`Group` 自动提取 `cc.game.groupList` 生成下拉框

- **组件数据 JSON 导出 (Component Data JSON Export)**
  - 组件头部新增 🖨️ 打印按钮
  - 定制 `replacer` 代理拦截 `cc.Node` / `cc.Asset` 循环引用，降维为 `[ cc.Node: path/to/name ]`
  - `WeakSet` 防环路 + 已销毁实例自动标记 `(Destroyed)`

- **可拖拽排序标签页 (Draggable Data-Driven Tabs)**
  - Vue `v-for` 数据驱动 + HTML5 原生拖放 API + 蓝色插入指示器
  - 排序结果持久化至 `localStorage`，新增标签自动追加兼容

- **横向双栏布局 (Horizontal Split Pane)**
  - 节点树/属性面板并排展示，中缝可拖拽分割线
  - 基于 `deltaX` 增量追踪的亚像素级平滑拖拽 + `150px` 最小宽度钳制 + 宽度持久化

- **IPC 降级容错自毁 (Fallback Toast Auto-Dismiss)**
  - 降级轮询模式的浮窗警告 2 秒后自动消失

- **节点高亮系统 (Node Highlight Overlay System)**
  - 悬停蓝框 + 选中橙框双轨独立图层
  - 使用 `convertToWorldSpaceAR` 防矩阵 NaN 崩溃
  - 双管线 (`__mcp_hover_overlay__` / `__mcp_select_overlay__`) 自动嗅探最顶层摄像机分组，保证置顶显示

- **屏幕节点拾取器 (Preview Node Picker)**
  - 面积权重候选池算法，穿透全屏遮罩层（ClickGuard / Mask）
  - `BaseWorldPos` 清洗 + `_hitTest(worldPos)` / `convertToNodeSpaceAR` 双路降级
  - DOM 追踪准星辅助校准 + `expandToNode(uuid)` 双通道同步 + 选中框驻守

### 🐛 缺陷修复

- **修复 Picker 全境设备射线脱靶 (Ultimate Picker Raycast Offset Fix)**
  - 修正 `_hitTest(screenPt)` → `_hitTest(worldPos)` 参数错误，剔除浏览器黑边

- **修复启动时 `stashScene` 崩溃 (Startup Probe Crash Recovery)**
  - 将抢跑嗅探封装至 `initializePreviewEnvironment` 沙盒
  - 以 `query-scene-active` IPC 回调为唯一放行条件 + 防抖锁

- **修复双数据源节点树闪烁 (Dual-Source Tree Flickering Fix)**
  - 以 `lastTreeUpdate` 时间戳为活跃基准，阻断降级轮询与探针心跳的冲突

- **修复刷新按钮无响应 (Refresh Button Freeze Fix)**
  - 点击即刻清零 `globalState.nodeTree = null`，引擎未激活时输出终端警告

- **修复静音穿透失效 (Engine-Level Audio Gate Injection)**
  - 通过 `executeMacro` 直降引擎层 `cc.audioEngine.setMusicVolume(0)`
  - 绑定至 `dom-ready` 生命周期，跨场景持久静音

- **修复属性修改报错 (`updateNodeProperty` Fix)**
  - 移除前端拼接 JS 的意大利面条式代码
  - 探针层原生构建 `updateNodeProperty` 方法，含 `compIndex` 寻址 + `updateAlignment` 布局刷新

- **修复多实例端口串台 (Multi-Instance Port Alignment)**
  - 逆向提取引擎 `_previewPort` 私有变量 + `probeAlivePort` 10 次递增重试

---

## [0.0.5] - 2026-03-30

### ✨ 新特性

- **渲染合批断流诊断器 (Render Batch Debugger)**
  - AOP 劫持 `RenderComponent._checkBatch`，零 `console` 污染
  - Hash 三元组 (肇事者+受害者+原因) 聚合去重 + 触发次数徽章
  - `[📌]` 按钮跨面板跳转至肇事节点

- **帧快照三栏分析 (Frame Debugger)**
  - 左栏：`DrawCall` → `RenderCommand` 多级指令树 + 组件类型图标
  - 中栏：离屏单步回绘，劫持 `device.draw` + 100ms 防抖，逐步复现渲染过程
  - 右栏：`BlendSrc/BlendDst` 枚举直译 + 索引总计 + 材质 Hash + `[📌]` 逆向定位

- **内存资源反向导航 (Asset Manager Quick Locator 🎯)**
  - 内存排行榜 + Bundle 分类列表旁新增 `🎯` 定位按钮
  - 内置前缀拦截矩阵，自动屏蔽 `default-` / `preview-` 等引擎内建资源
  - 高频点击 Debounce 节流

- **属性检查器引用追踪 (Inspector Deep Navigation)**
  - `node_ref` 点击 → 节点树展开聚焦；`asset_ref` 点击 → 编辑器资源管理器定位
  - 突破 `Array` 属性的扁平化渲染，逐个提取实体类型并生成专属色板 + 定位锚点

- **节点树搜索优化 (Node Tree Search Optimization)**
  - 严格路径过滤：仅展示命中节点 + 直系祖先，隐藏无关分支
  - 组件类名穿透搜索时，祖先节点不做名称高亮，避免误导

### 🐛 缺陷修复

- **修复快照数据 Vue 解析崩溃** — `commands` 移入 `drawCalls[i]` 后旧路径 `length` 越界，改用 `reduce` 安全聚合
- **重构断批层级截断算法** — AOP 拦截 `batcher._flush` 族方法 + `.shift()` 逐次出库消费，实现 DrawCall ↔ 组件 1:1 映射
- **修复 Blend 混合参数丢失** — 补充 `srcBlendFactor` 降级回退 + WebGL 枚举常量字典直译
- **修复独立窗口启动死锁** — 弃用 `tryAutoConnect` 的 IPC 依赖，改用 `localhost` 网络心跳轮询
- **修复多标签切换 DevTools 残留** — 内嵌模式用 `ResizeObserver` 探测隐藏；独立模式用 `win.hide()/show()` 保持上下文
- **修复空场景 `stashScene` 崩溃** — `isEditorSceneActive` 为唯一真相源 + `about:blank` 剥离 + `scene-status-changed` 自愈

---

## [0.0.4] - 2026-03-29

### ✨ 新特性

- **内存剖析器 (Memory Profiler)**
  - 低频(1000ms)独立采集通道，与 FPS 探测隔离
  - 按 `Bundle` 分仓聚合 + 极值状态机（Min/Max 持久追踪）+ 趋势箭头 ↑↓

- **资源深层解混淆 (Deep Asset Deobfuscation)**
  - `SpriteFrame` → `Texture2D` 所有权反向溯源：`[Tex] icon_newgift`
  - 终极手段：`Editor.assetdb.remote.uuidToUrl()` 跨界解码 + `uuidNameCache` 防重复查询

### 🐛 缺陷修复

- **修复内建 Bundle `internal` 导致的面板崩溃** — 顶链空洞防御填充

---

## [0.0.3] - 2026-03-29

### ✨ 新特性

- **节点树搜索增强 (Node Tree Search Evolution)**
  - 多关键词 AND 逻辑（空格分词）
  - 组件类名穿透搜索（如输入 `Animation` 定位挂载该组件的节点）
  - 命中组件自动标注灰色副文本 `(cc.Animation)`

- **右侧面板响应式适配** — 极窄宽度时标签自动切为纯图标模式，组件属性框柔性收缩不溢出

- **全局配置持久化扩容**
  - 面板分割线宽度拖拽即存 + Clamp 钳制防越界
  - FPS/静音状态自动存档，引擎重握手时逆注覆写

- **原生级音频静音** — Chromium Webview 原生静音 + `dom-ready` 状态保持

### 🐛 缺陷修复

- **修复拖拽分割线漂移** — 用 `deltaX` 增量替代全局绝对偏移减法
- **修复 `cc.Node.rotation` 废弃警告** — 自动检测 `angle` 属性存在性，使用 `-angle` 倒置映射

### 🧹 代码整理

- 清除探针/桥接/IPC/面板中的调试日志和 `postToConsole` 刷屏通信
- 移除历史重构遗留的冗长注释段落

---

## [0.0.2] - 2026-03-28

### ✨ 新特性

- **面板窄视图响应式重构** — 工具栏极窄时自动切为纯图标模式 + Flex Shrink 防溢出
- **空场景安全拦截与自愈** — 惰性加载 + 🎬 引导遮罩 + IPC `scene:query-hierarchy` 轮询检测就绪
- **全局资源引用解析** — `cc.Asset` 派生类（骨骼/纹理/音频）统一识别展示
- **Spine 枚举下拉框** — 自动提取 `getRuntimeData()` 的 animations/skins 列表，`<input>` 升级为 `<select>`
- **用户偏好持久化** — 分辨率、FPS 面板状态存入 `Editor.Profile` 项目级配置
- **纯运行时属性注入** — 绕过编辑器序列化管线，直接操作内存实例，消灭"是否保存"弹窗
- **组件 enabled 开关** — 所有组件统一复选框，运行时控制启停
- **引擎暂停/单步控制** — 先 `pause()` 再推帧 + `isPaused()` 心跳双向同步

### 🐛 缺陷修复

- **修复 Widget 修改无响应** — 变更后自动调用 `updateAlignment()` 触发排版刷新
- **修复面板切回动画抖动** — `ResizeObserver` 防零短路 + 移除 `transition: all`
- **修复刷新后暂停状态残留** — `refreshGame()` 时同步重置 `isGamePaused = false`

---

## [0.0.1] - 2026-03-27

### ✨ 新特性

- **运行时节点树** — 预加载爬虫 JSON 序列化推送 + 深层级染色 + 搜索高亮 + 祖先折叠记忆
- **节点属性审查器** — `__props__` / `__attrs__` 精准映射 + `string`/`number`/`boolean` 双端编辑 + 内置 Debug 浮窗
- **BrowserView 架构** — 弃用 `<webview>` 挂载 DevTools，改用 Electron 原生 `BrowserView` 解决 `about:blank` 死锁
- **视图占位引擎** — `resize` + `getBoundingClientRect()` 实时同步 BrowserView 尺寸

### 🐛 缺陷修复

- **修复 DevTools 初始化黑屏** — 切至 `BrowserView` 后 CDP 连接正常
- **修复 `cc.Scene.active` 刷屏警告** — 双重预检防御，Scene 对象直接短路返回标识位
- **修复预览区滚动条** — `Math.floor()` 亚像素取整 + 多层 `overflow: hidden` + `insertCSS` 跨域样式注入

---

## [0.0.1-alpha] - 2026-03-26

### ✨ 早期探索

- 测试单栏到双栏的 UI 改造
- Vue 3 引入 20ms 微秒级轮询池捕获 Webview ID
- 撰写 `preload.ts` 建立 IPC 通信桥

### 🐞 遗留问题

- DevTools 会渲染出没有 DOM Tree 的死实例（后续版本已攻克）
