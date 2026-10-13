# 节点拾取器定位失效修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 🎯 节点拾取器选中后"自动切节点树 Tab + 展开 + 高亮 + 滚动居中"定位链路失效的问题：让滚动定位穿透 Shadow DOM 真正生效，并为树缓存未命中的动态节点补上"重同步后自动重试定位"闭环。

**Architecture:** 根因 1 是面板运行在 Shadow DOM 中而 `NodeTree.expandToNode` 用 `document.querySelector` 查找目标行（永远落空），改为组件内容器内查询 + `nextTick` 精确等待渲染。根因 2 是树缓存未命中后只兜底不重试，在 `useNodeSystem` 增加挂起定位状态与 `lastTreeUpdate` 监听重试（上限 3 次）。顺手修复 `useLayout` 中引用不存在元素的同类死查询。

**Tech Stack:** TypeScript, Vue 3 (Composition API - `ref`/`computed`/`nextTick`/`watch`), Cocos Creator 2.4.x Panel (Shadow DOM), Electron webview IPC。

**设计规范:** `docs/superpowers/specs/2026-10-13-node-picker-locate-fix-design.md`

## Global Constraints

- 所有代码注释、提交信息必须使用简体中文（章程红线）。
- 全部改动仅限 `.ts` 文件与 `index.html` 模板，不新增 `.js` 裸文件，不引入任何新第三方依赖。
- 每次修改 TypeScript 代码后必须执行 `npm run build` 刷新编译，零错误才算通过（章程强制）。
- 面板运行于 Shadow DOM：面板组件内部查找面板元素禁止使用 `document.querySelector`，一律经 Vue template ref / 组件内容器查询。
- 向游戏环境发指令只用 `gameView.executeJavaScript(...)`，禁止 `Editor.Ipc` 直达游戏运行时。
- 补定位重试上限固定为 3 次，后到拾取覆盖旧挂起（防无限循环、防错位定位）。
- 本项目无自动化测试框架且章程禁止引入依赖：每个任务的验证 = `npm run build` 零错误 + 下列手工/控制台验证步骤逐条核对。

---

### Task 1: `NodeTree` 滚动定位穿透 Shadow DOM 修复

**Files:**
- Modify: `src/panel/components/NodeTree.ts`（模板 `.tree-content` 行、setup 导入与状态、`expandToNode` 尾部滚动块、`return` 导出块）

**Interfaces:**
- Consumes: 无（组件自闭环）。
- Produces: `treeContentRef: Ref<HTMLElement | null>`（组件内部滚动容器引用，供 `expandToNode` 查询目标行）；`expandToNode(targetId: string): boolean` 签名不变，向后兼容 `useNodeSystem` 既有调用。

- [ ] **Step 1: 给滚动容器加 template ref**

在 `NodeTree.ts` 组件模板中，将：

```html
            <div class="tree-content" style="padding-bottom: 0;">
```

改为：

```html
            <div class="tree-content" ref="treeContentRef" style="padding-bottom: 0;">
```

- [ ] **Step 2: setup 增加容器引用与 `nextTick` 导入**

第 1 行导入改为：

```typescript
const { ref, computed, nextTick } = require('vue');
```

setup 内状态区（现有 `searchQuery`/`selectedId` 之后）追加：

```typescript
        // 滚动定位容器：面板运行于 Shadow DOM，必须从组件内部容器查询目标行
        const treeContentRef = ref(null);
```

- [ ] **Step 3: 替换 `expandToNode` 尾部滚动块（修复根因 1 + 搜索态兼容）**

将 `expandToNode` 中的：

```typescript
                // 3. 将元素滑向视野中央
                setTimeout(() => {
                    const el = document.querySelector('.tree-node.active');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
```

替换为：

```typescript
                // 3. 若搜索过滤把目标行藏住了，先清空搜索关键字让目标行渲染可见
                if (searchQuery.value) {
                    searchQuery.value = '';
                }

                // 4. 等展开/选中/清搜索渲染完成后，从组件内容器查询目标行并滑向视野中央
                // 注意：面板运行在 Shadow DOM 中，document.querySelector 穿不透 Shadow 边界，必须使用组件内容器查询
                nextTick(() => {
                    const container: any = treeContentRef.value;
                    const el = container ? container.querySelector('.tree-node.active') : null;
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
```

- [ ] **Step 4: 在 setup 返回对象中导出 `treeContentRef`**

将返回对象：

```typescript
        return {
            searchQuery,
            selectedId,
            visibleNodes,
```

改为：

```typescript
        return {
            searchQuery,
            selectedId,
            treeContentRef,
            visibleNodes,
```

（其余返回键保持不变。）

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: TypeScript 编译与 esbuild 打包零错误、零警告退出。

- [ ] **Step 6: 手工验证滚动居中生效**

1. 打开面板，在节点树 Tab 用 🎯 拾取一个位于折叠深层的节点。
2. 预期：树自动展开到目标节点、目标行蓝色高亮（`.tree-node.active`），且**目标行平滑滚动至树视口中央**（修复前永不滚动）。
3. 面板 DevTools 控制台出现 `[Selection-Debug] Trigger: Panel-Tree-ExpandToNode | TargetID: ...`。
4. 在搜索框输入一个过滤词把目标节点隐藏后再次拾取同一节点：预期搜索框自动清空、目标行可见并滚动居中。

- [ ] **Step 7: 提交**

```bash
git add src/panel/components/NodeTree.ts
git commit -m "fix(panel): 节点树滚动定位改用组件内容器查询穿透 Shadow DOM

- expandToNode 滚动查询由 document.querySelector 改为 treeContentRef 容器内查询，修复 Shadow DOM 下永远落空的问题
- setTimeout 盲等 100ms 改为 nextTick 精确等待渲染完成
- 定位时若搜索过滤隐藏目标行则自动清空搜索关键字"
```

---

### Task 2: `useNodeSystem` 缓存未命中补定位重试闭环

**Files:**
- Modify: `src/panel/composables/useNodeSystem.ts`（第 1 行导入、`locateAndExpandNode` 函数体、其后新增 `watch` 重试块）

**Interfaces:**
- Consumes: `NodeTree.expandToNode(targetId: string): boolean`（Task 1 保证其滚动副作用已修复）；`globalState.lastTreeUpdate: number`（`update-tree` 处理器每次刷新的时间戳，现成信号）。
- Produces: `locateAndExpandNode(uuid: string): void` 签名不变（`useGameView` 入参、`onRenderDebuggerLocate` 复用处无需改动）；内部新增闭包状态 `pendingLocateUuid: string | null`、`locateRetryCount: number`、常量 `MAX_LOCATE_RETRY = 3`。

- [ ] **Step 1: 导入 `watch` 并定义补定位状态**

第 1 行导入改为：

```typescript
const { nextTick, onUnmounted, watch } = require('vue');
```

在 `locateAndExpandNode` 定义之前插入状态区：

```typescript
    // ===== 补定位状态：树缓存未命中时挂起，等待重同步数据到达后自动重试 =====
    let pendingLocateUuid: string | null = null; // 挂起待补定位的节点 UUID
    let locateRetryCount = 0;                    // 当前挂起定位已重试次数
    const MAX_LOCATE_RETRY = 3;                  // 重试上限，防止无限循环
```

- [ ] **Step 2: 重写 `locateAndExpandNode`（成功清挂起 / 未命中挂起+兜底）**

将现有 `locateAndExpandNode` 整体替换为：

```typescript
    /**
     * 定位并展开指定 UUID 的节点（包含自动切换至节点树 Tab 逻辑）
     * 树缓存未命中时挂起 pendingLocateUuid，待重同步数据到达后由 watch 自动重试补定位
     * @param uuid 目标节点 UUID
     */
    const locateAndExpandNode = (uuid: string) => {
        if (!uuid) return;
        activeTab.value = 0; // 自动切换至节点树 Tab
        nextTick(() => {
            const nt: any = nodeTreeRef.value;
            const success = nt && typeof nt.expandToNode === 'function' && nt.expandToNode(uuid);
            if (success) {
                // 定位成功：清空挂起状态（最新定位覆盖旧挂起）
                pendingLocateUuid = null;
                locateRetryCount = 0;
                return;
            }
            console.warn(`[Bridge] 节点树缓存中未找到节点(UUID: ${uuid})，启用属性兜底同步`);
            // 记录挂起定位（含树组件未挂载场景），后到拾取覆盖旧挂起
            pendingLocateUuid = uuid;
            locateRetryCount = 0;
            onNodeSelect({ id: uuid }, true);
            try {
                const syncCode = "if(window.__mcpSyncNodeTree) { window.__mcpSyncNodeTree(); }";
                const wv: any = gameView.value;
                if (wv && typeof wv.executeJavaScript === 'function') {
                    wv.executeJavaScript(syncCode).catch(() => {});
                }
            } catch(err) {}
        });
    };
```

（与现状差异：命中时不再继续走兜底；未命中时统一走"挂起 + 属性兜底 + 请求重同步"，树组件未挂载也视作未命中。）

- [ ] **Step 3: 新增 `lastTreeUpdate` 监听重试块**

在 `locateAndExpandNode` 定义之后、`onRenderDebuggerLocate` 之前插入：

```typescript
    /**
     * 监听节点树重同步完成（update-tree 回流刷新 globalState.lastTreeUpdate），
     * 若存在挂起的补定位请求则自动重试展开；最多重试 MAX_LOCATE_RETRY 次后可见告警放弃
     */
    watch(() => globalState.lastTreeUpdate, () => {
        if (!pendingLocateUuid) return;
        try {
            const nt: any = nodeTreeRef.value;
            const success = nt && typeof nt.expandToNode === 'function' && nt.expandToNode(pendingLocateUuid);
            if (success) {
                pendingLocateUuid = null;
                locateRetryCount = 0;
                return;
            }
        } catch (err) {
            console.warn('[Bridge] 补定位重试发生异常:', err);
        }
        locateRetryCount++;
        if (locateRetryCount >= MAX_LOCATE_RETRY) {
            const msg = `[Bridge] 节点树重同步后仍未找到节点(UUID: ${pendingLocateUuid})，已放弃补定位`;
            if (typeof Editor !== 'undefined' && Editor.warn) Editor.warn(msg);
            else console.warn(msg);
            pendingLocateUuid = null;
            locateRetryCount = 0;
        }
    });
```

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 零错误退出。

- [ ] **Step 5: 手工验证补定位闭环**

1. 运行游戏预览并进入有动态创建节点的场景（或用测试按钮动态 `new cc.Node`）。
2. 切到「渲染诊断」Tab，用 🎯 拾取一个刚动态创建的节点。
3. 预期时序：Tab 立即切回节点树 → 属性面板先更新（兜底）→ 控制台先出现 `[Bridge] 节点树缓存中未找到节点(UUID: ...)` → 1~2 秒内树重同步到达后**自动展开高亮并滚动居中目标节点**。
4. 同一场景快速连续拾取 A、B 两节点：预期最终定位停在 B（后到优先），无错位。
5. 拾取一个确定不存在于场景树的 UUID 场景（可通过控制台手动触发 `locateAndExpandNode('不存在的id')` 验证）：预期 3 次重试后出现可见警告 `节点树重同步后仍未找到节点...已放弃补定位`，且无无限循环。
6. 渲染诊断 Tab 的「定位」按钮点击后同样获得滚动居中效果（复用同一入口）。

- [ ] **Step 6: 提交**

```bash
git add src/panel/composables/useNodeSystem.ts
git commit -m "fix(panel): 节点树缓存未命中后自动重同步重试补定位

- locateAndExpandNode 未命中时挂起 pendingLocateUuid 并请求 __mcpSyncNodeTree 重同步
- 新增 lastTreeUpdate 监听，重同步数据到达后自动重试 expandToNode，上限 3 次，失败可见告警
- 后到拾取覆盖旧挂起，命中时清空挂起状态"
```

---

### Task 3: `useLayout` 拖拽上限死查询同类修复

**Files:**
- Modify: `src/panel/composables/useLayout.ts`（函数签名、`startNodeTreeDrag` 垂直分支）
- Modify: `src/panel/index.html`（Tab 0 布局容器加 template ref）
- Modify: `src/panel/index.ts`（setup 定义 `inspectorWrapRef`、传参、返回导出）

**Interfaces:**
- Consumes: Tab 0 承载"节点树 + 拖拽条 + 属性面板"的 flex 布局容器（`inspectorLayout` 控制横竖排列的包裹层）。
- Produces: `useLayout(globalState, wrapMount, wrapperSize, inspectorWrapRef)` —— 第 4 参为新增可选参数 `Ref<HTMLElement | null>`，现有调用方仅 `src/panel/index.ts` 一处。

- [ ] **Step 1: `useLayout` 签名加参并替换死查询**

签名改为：

```typescript
export function useLayout(globalState: any, wrapMount: any, wrapperSize: any, inspectorWrapRef?: any) {
```

`startNodeTreeDrag` 的 `onMouseMove` 垂直分支中，将：

```typescript
                const wrapCtx = document.querySelector('.right-panel-wrap-ctx') || document.body;
                const maxH = wrapCtx.clientHeight - 150;
```

改为：

```typescript
                // 高度上限取自 Tab 0 布局容器（面板运行于 Shadow DOM，且旧查询类名在模板中已不存在，禁止 document 查询）
                const wrapCtx: any = inspectorWrapRef && inspectorWrapRef.value ? inspectorWrapRef.value : null;
                const maxH = wrapCtx ? (wrapCtx.clientHeight - 150) : 9999;
```

- [ ] **Step 2: `index.html` 布局容器加 template ref**

将 Tab 0 内的 flex 包裹层：

```html
                <div
                    :style="{ flex: 1, display: 'flex', flexDirection: globalState.inspectorLayout === 'vertical' ? 'column' : 'row', minHeight: 0 }">
```

改为：

```html
                <div ref="inspectorWrapRef"
                    :style="{ flex: 1, display: 'flex', flexDirection: globalState.inspectorLayout === 'vertical' ? 'column' : 'row', minHeight: 0 }">
```

- [ ] **Step 3: `index.ts` 定义并传入 `inspectorWrapRef`**

setup 内与 `nodeTreeRef` 声明并列处增加：

```typescript
                    const inspectorWrapRef = ref(null);
```

`useLayout` 调用处改为：

```typescript
                const layoutSystem = useLayout(globalState, wrapMount, wrapperSize, inspectorWrapRef);
```

setup 返回对象中（与 `wrapMount` 同列）增加导出键 `inspectorWrapRef`，确保 template ref 绑定生效。

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 零错误退出。

- [ ] **Step 5: 手工验证拖拽上限**

1. 设置面板切换为垂直布局（`inspectorLayout = 'vertical'`）。
2. 拖拽节点树与属性面板之间的水平拖拽条向下拉。
3. 预期：节点树面板高度上限被 Tab 0 容器高度约束（拖到容器底部附近即停止，不再按整个编辑器 body 高度放开）。
4. 回切水平布局，拖拽宽度行为与现状一致（该分支未改动）。

- [ ] **Step 6: 提交**

```bash
git add src/panel/composables/useLayout.ts src/panel/index.html src/panel/index.ts
git commit -m "fix(layout): 垂直布局树面板拖拽上限改用布局容器引用

- 移除对不存在类名 right-panel-wrap-ctx 的 document 死查询（叠加 Shadow DOM 穿透问题，实际永远走 body 兜底）
- 新增 inspectorWrapRef 容器引用，高度上限按 Tab 0 布局容器计算"
```

---

### Task 4: UPDATE_LOG 登记与全量回归验证

**Files:**
- Modify: `UPDATE_LOG.md`

**Interfaces:**
- Consumes: Task 1-3 的全部修复行为。
- Produces: 面向用户的缺陷修复记录（章程 7.2 格式）。

- [ ] **Step 1: 登记缺陷修复条目**

在 `UPDATE_LOG.md` 最上方版本章节（`## [Unreleased]`）内新增 `### 🐛 缺陷修复` 小节（若无则新建），按章程格式追加两条：

```markdown
### 🐛 缺陷修复

- **修复节点拾取器滚动定位从未生效 (Fix Node Picker Locate Scroll)**
  **问题**：面板运行于 Shadow DOM，`expandToNode` 经 `document.querySelector` 查找目标行永远落空，滚动居中从未执行。
  **方案**：改用组件内容器查询 + `nextTick` 精确等待渲染；搜索过滤隐藏目标行时自动清空搜索。

- **修复动态节点拾取定位静默失败 (Fix Node Picker Locate Retry)**
  **问题**：节点树缓存未命中时仅属性兜底并请求重同步，同步数据到达后从不重试展开，动态节点定位必然失败。
  **方案**：未命中挂起定位请求，监听 `lastTreeUpdate` 于重同步后自动重试（上限 3 次），失败输出可见警告。
```

- [ ] **Step 2: 全量手工回归清单（对应 spec §6.2）**

逐条执行并核对：

1. 切到非节点树 Tab → 🎯 拾取静态节点 → 自动切 Tab、展开祖先、高亮、滚动居中。
2. 节点树 Tab 内拾取不同深度节点 → 定位表现一致。
3. 拾取运行时动态实例化的节点 → 属性面板立即更新，树重同步到达后自动补定位。
4. 搜索过滤状态下拾取被过滤的目标 → 自动清空搜索并完成定位。
5. 拾取空白区域 → 仅退出拾取、清空选中，不切换 Tab。
6. 快速连续拾取多个节点 → 以最后一次为准，无错位定位。
7. 渲染诊断跨视图定位 → 同步获得滚动居中效果。
8. 回归确认：节点树手动展开/折叠、搜索、点击选中、属性面板联动、垂直布局拖拽均不受影响。

- [ ] **Step 3: 最终构建与提交**

Run: `npm run build`
Expected: 零错误退出。

```bash
git add UPDATE_LOG.md
git commit -m "docs(changelog): 登记节点拾取器定位失效修复条目"
```
