# 设计规范：节点拾取器定位失效修复 (Node Picker Locate Fix)

## 1. 概述 (Overview)

2026-08-05 的功能提交 `997bfc5` 为 🎯 节点拾取器加入了"选中后自动切换节点树 Tab 并展开定位"能力（`locateAndExpandNode` 统一定位链路），当前该能力失效。

经排查：**不是后续改动引入的回归**——功能提交之后源码零改动（其后 3 个提交均为文档/杂项清理），`dist` 编译产物与源码同步。失效源于实现自带的两个缺陷，其中滚动定位从功能上线第一天起就从未生效。

本设计修复两个根因，恢复并补全定位链路：拾取选中 → 自动切节点树 Tab → 展开祖先 → 高亮 → 滚动居中；动态节点缓存未命中时经重同步后自动补定位。

## 2. 根因分析 (Root Cause Analysis)

### 2.1 根因 1（主因）：滚动定位查询穿不透 Shadow DOM

- 面板整个 Vue 应用挂在 Cocos Creator 的 Shadow DOM 内（`src/panel/index.ts:944` 等处获取 webview 必须使用 `this.shadowRoot.querySelector`）。
- `src/panel/components/NodeTree.ts:272` 的滚动定位使用 `document.querySelector('.tree-node.active')`。`document.querySelector` 不进入 Shadow 边界，该查询**永远返回 `null`**，`scrollIntoView` 永不执行。
- 表现：切 Tab、展开祖先、高亮均正常工作，唯独目标节点不会滚进视野；树较长时用户看不到目标节点，体感为"定位失效"。

### 2.2 根因 2（次因）：树缓存未命中缺少重同步后重试闭环

- `src/probe/index.ts:138` 的节点树自动同步存在门控：`window.__mcpActiveTab !== 0` 时跳过同步。用户在非节点树 Tab 使用拾取器时（本功能的核心场景），树缓存处于冻结状态。
- `locateAndExpandNode` 对 `expandToNode` 未命中的处理仅为：加载属性面板兜底 + 请求 `__mcpSyncNodeTree()` 重同步。**重同步数据到达后从不重试展开**。
- 表现：拾取运行时动态实例化的节点（`UPDATE_LOG.md` 已记录的高频场景）时，树中查无此节点，定位静默失败，仅属性面板更新。

### 2.3 同类缺陷（顺手修复）：`useLayout` 查询引用了不存在的元素

- `src/panel/composables/useLayout.ts:114` 的 `document.querySelector('.right-panel-wrap-ctx')` 存在双重问题：该 class 在模板中**根本不存在**（永远查空）；即便存在也穿不透 Shadow DOM。实际永远走 `document.body` 兜底，导致垂直布局下节点树面板拖拽高度上限计算失准（按整个编辑器 body 高度放开上限）。

## 3. 需求与交互行为 (Requirements & Behavior)

1. **跨 Tab 拾取定位**：在任意 Tab 使用 🎯 拾取器选中节点后，自动切换至节点树 Tab，展开全部祖先节点，高亮目标行并平滑滚动居中。
2. **同 Tab 拾取**：节点树 Tab 内直接拾取不同深度节点，展开、高亮、滚动居中表现一致。
3. **搜索态兼容**：若搜索过滤将目标行隐藏，定位时自动清空搜索关键字，确保目标行渲染可见后再滚动定位。
4. **缓存未命中的补定位**：未命中时保留现有属性兜底 + 请求重同步；节点树重同步数据到达后自动重试 `expandToNode`，最多 3 次；仍失败则输出可见警告（不静默、不无限重试）。
5. **后到优先**：重试挂起期间用户再次拾取新节点，以最新一次拾取为准，旧的挂起定位作废。
6. **点空白行为不变**：拾取空白区域仅退出拾取状态并清空选中信息，不切换 Tab（保持现状）。
7. **统一定位入口不变**：渲染调试器的跨视图定位（`onRenderDebuggerLocate`）继续复用 `locateAndExpandNode`，自动获得全部修复。

## 4. 架构与组件改动 (Architecture & Implementation Details)

### 4.1 `src/panel/components/NodeTree.ts`

- 给 `.tree-content` 滚动容器增加 template ref（`treeContentRef`），在 `setup` 返回值中暴露。
- `expandToNode` 的滚动查询改为容器内查询：`treeContentRef.value.querySelector('.tree-node.active')`。Shadow 树内部的普通父子查询不受 Shadow 边界影响，可正常命中目标行。
- 查找成功后：若 `searchQuery.value` 非空则先清空；`setTimeout(100)` 的盲等改为 Vue `nextTick`，确保展开状态、选中高亮、搜索清空均已渲染完成再执行 `scrollIntoView({ behavior: 'smooth', block: 'center' })`。
- 查找失败路径保持现状（返回 `false`，不做滚动）。

### 4.2 `src/panel/composables/useNodeSystem.ts`

- 增加闭包状态：`pendingLocateUuid`（挂起待补定位的节点 UUID）、`locateRetryCount`（已重试次数）。
- `locateAndExpandNode` 调整：
  - `expandToNode` 成功：清空 `pendingLocateUuid` 与重试计数（最新定位覆盖旧挂起）。
  - `expandToNode` 未命中：记录 `pendingLocateUuid = uuid`、重置计数，随后执行现有兜底（`onNodeSelect({ id: uuid }, true)` + 请求 `__mcpSyncNodeTree()`）。
  - 每次新的 `locateAndExpandNode` 调用均覆盖挂起状态并重置计数。
- 新增 `watch(() => globalState.lastTreeUpdate, ...)`（`update-tree` 处理器每次都会刷新该时间戳）：
  - 无挂起定位则直接返回。
  - `nodeTreeRef.value.expandToNode(pendingLocateUuid)` 成功则清空挂起状态。
  - 失败则 `locateRetryCount++`；达到 3 次上限时清空挂起状态并输出警告：优先 `Editor.warn`（经 `typeof Editor !== 'undefined'` 守卫），否则 `console.warn`。警告文案包含目标 UUID。
  - 回调整体包裹 `try/catch`，符合章程"防御性编程"要求。

### 4.3 `src/panel/composables/useLayout.ts`（同类缺陷顺手修复）

- 给 Tab 0 承载"节点树 + 拖拽条 + 属性面板"的布局容器（`src/panel/index.html` 中 `inspectorLayout` 控制横竖排列的 flex 包裹层）增加 template ref，传入 `useLayout`。
- `startNodeTreeDrag` 垂直分支的高度上限改用该容器的 `clientHeight` 计算；移除死查询 `.right-panel-wrap-ctx` 与 `document.body` 兜底。

### 4.4 数据流 (Data Flow)

```
拾取器点击 (probe/picker.ts)
  → sendNodeSelected(uuid) → sendToHost('node-picker-selected')
  → useGameView IPC 处理器
  → locateAndExpandNode(uuid)                        [useNodeSystem]
      ├─ activeTab = 0（切节点树 Tab）
      ├─ expandToNode(uuid) 命中
      │    ├─ 清搜索（如有）→ nextTick → 容器内查询 .tree-node.active → scrollIntoView 居中
      │    └─ 清空挂起定位状态
      └─ 未命中
           ├─ 记录 pendingLocateUuid
           ├─ 属性面板兜底 + __mcpSyncNodeTree() 请求
           └─ update-tree 回流 → lastTreeUpdate 变化
                → watch 触发重试 expandToNode（≤3 次，失败可见警告）
```

## 5. 错误处理 (Error Handling)

| 场景 | 处理 |
| --- | --- |
| `expandToNode` 树中未命中 | 属性兜底 + 重同步 + 自动重试（≤3 次） |
| 重试 3 次仍未命中 | `Editor.warn` / `console.warn` 可见警告，含目标 UUID，放弃本次定位 |
| 重试回调内部异常 | `try/catch` 吞掉并警告，不影响其他面板功能 |
| 重试挂起期间发生新拾取 | 新拾取覆盖旧挂起（后到优先） |
| 滚动查询未找到目标行 | 不执行滚动（与现状一致），不影响展开/高亮 |
| 拾取空白（uuid 为空） | 仅退出拾取、清空选中，不切 Tab（保持现状） |

## 6. 验证计划 (Verification Plan)

1. **构建**：改动后执行 `npm run build`，确认 TypeScript 编译与打包零错误（章程强制要求）。
2. **手工清单**：
   - 切到非节点树 Tab → 🎯 拾取静态节点 → 自动切 Tab、展开祖先、高亮、滚动居中。
   - 节点树 Tab 内拾取不同深度节点 → 定位表现一致。
   - 拾取运行时动态实例化的节点 → 属性面板立即更新，树重同步到达后自动补定位。
   - 搜索过滤状态下拾取被过滤的目标 → 自动清空搜索并完成定位。
   - 拾取空白区域 → 仅退出拾取，不切换 Tab。
   - 快速连续拾取多个节点 → 以最后一次为准，无错位定位。
   - 渲染调试器跨视图定位 → 同步获得滚动居中修复效果。
3. **回归确认**：节点树手动展开/折叠、搜索、点击选中、属性面板联动不受影响。

## 7. 范围边界 (Scope)

- 仅修复定位链路的三个文件（`NodeTree.ts`、`useNodeSystem.ts`、`useLayout.ts`），不重构树组件渲染方式、不改动探针同步频率与 IPC 协议。
- 不处理"拾取命中检测（`hitTest`）本身失败"的假设场景；若实测连 Tab 都不切换，另行排查拾取命中链路。
