# 项目核心章程 (mcp-inspector-bridge)

## 第一条：产物强制要求 (The Artifact Mandate)
**AI 智能体在没有生成可见产物（文件记录）的情况下不得擅自执行工作。**
- 每一个规划阶段都必须产出一个 Markdown 格式的实体文件 (Plan, Spec, 或 Checklist)。
- 严禁仅仅依赖“聊天记忆”连续执行复合任务。任何重大的上下文或决定，都必须落实在文件中予以固化。
- **语言强制约定 (绝对红线)**: 所有的开发阶段文档（项目计划、任务流、验收记录）、代码内部说明（DocStrings、行内注释）、AI 思考推理回答、以及**所有 Git 提交信息（Commit Messages，包含 feat/fix 标头）均必须且只能使用简体中文 (Simplified Chinese)**。

## 第二条：技术栈与代码规范 (Tech Stack & Standards)
**严格遵守当前确立的技术体系与编码模式。**
- **技术栈**: 基于 Cocos Creator 2.4.x Extension 扩展规则，Electron（主进程），Vue.js 3 / HTML 拼接（前端面板），IPC 桥接通信机制。
- **脚本语言限定**: 所有新创建或重构的脚本**必须且只能使用 TypeScript (`.ts`)**。严厉禁止向项目中新增任何 `.js` 裸文件。
- **注释完善性**: 必须确保所有经手的脚本无论改动大小都拥有详尽贴切的注释。类库和接口信息使用标准的 JSDoc 格式标注。复杂的逻辑块必须以人类易读的方式解释其“业务目的”与“运行逻辑”。
- **强制编译机制**: 本项目运行依赖于编译后的产物。在每次修改任何 TypeScript 代码之后，**智能体必须主动在终端调用 `npm run build` 刷新编译**，借机确保语法的正确性，并防止遇到修改未在编辑器中生效的困局。

## 第三条：项目架构与一致性 (Architecture & Consistency)
**遵循 Cocos Creator 原生的插件开发范式体系。**
- **架构完整性维持**: 必须严格遵循现有项目的预设架构思路。
- **明令禁止**: 未经用户的最高授权批准，严禁自创所谓的“全新架构模式”、擅自变更项目基架设定、或随意通过 npm 安装引入重量级的第三方外部依赖库。
- **必须执行**: 在实现新功能前，优先侦测并复用现有的管理器（managers）、工具类（utils）和各类基类（base classes）。

## 第四条：智能体互斥与独立性原则 (Agent Independence)
**为并行的开发流程奠定基础。**
- 切割派发的验证任务必须具备原子特性 (Atomic)。
- 假若负责后端爬虫或主进程的逻辑尚未到位，前端研发部分要求使用自主构建的假数据 (Mock IPC/API) 保障顺利测试渲染脱壳。
- 绝对不要挂起并无限期等待其它外部依赖就绪才开始开发工作。

## 第五条：目标环境架构认知 (Target Environment Architecture)
**严禁混淆“编辑器原生 Scene 进程”与“游戏预览 Webview”的运行时环境。**
- **架构定性**: `mcp-inspector-bridge` 监控与调试的目标是**运行在浮动面板 `<webview src="http://localhost:7456">` 内的预览态游戏**，绝不是编辑器处于 Edit 模式的静态 Scene。
- **环境隔离**: 
  - `src/scene-script.ts` 仅用于少部分必须触达编辑器原生窗口的操作，**不可用于游戏运行时状态的拦截或逻辑回调**。
  - 对于所有的游戏管线拦截、逻辑探针，必须注入到 `src/probe.ts` (爬虫对象) 中，由 `src/preload.ts` 负责将其自动挂载至 Webview 网页的 `<head>`。
- **通信铁律**: 前端 Vue 面板组件若需向游戏环境发送指令，**严禁使用** `Editor.Ipc` 或 `Editor.Scene.callSceneScript`，必须通过获取 DOM 实例执行脚本：`document.querySelector('webview').executeJavaScript(...)`。

## 第六条：异步时序与状态竞态预防 (Async Timing & Race Conditions)
**跨进程交互和生命周期中的状态管理必须秉持“防御性编程”姿态。**
- **拒绝预先武断判决**：对于需要向主进程通过 `Editor.Ipc.sendToMain(...)` 异步远端查询状态（如场景是否激活 `query-scene-active` 等）的情况，**绝对禁止**使用主观预测的初始值 `true / false` 进而去**同步、越权放行**后续敏感逻辑。
- **强制结果回调驱动**：后续的诸如画面重载（`refreshGame`）、场景分析或数据注入等依赖外部系统状态的行为，必须且只能被延后挂起，直到真正拿到安全的异步 IPC Callback 返回结果或监听事件后才能判定触发。
- **安全的初始状态起手**：切忌将本地静态变量和未知的远端系统（如 Creator 编辑器底层引擎或 Webview 容器）环境混为一谈，本地控制器的起手状态应当基于最安全的退让原则（如 `false` 或 `null`）而不是激进值起手。防范在宿主尚未初始化完全时对其发起越级操作，从而诱发底层如 `Cannot read property 'name' of null` 等恶性级崩溃。