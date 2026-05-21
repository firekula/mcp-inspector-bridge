# Selection Clear Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three selection UX issues: toggle-deselect on second click, clear highlight on scene change/node destroy, and clear selection on picker empty click.

**Architecture:** Five surgical changes across 4 source files. Panel-side (NodeTree, useGameView) handles UI state; probe-side (highlighter, picker, preload) handles game-view highlight and IPC. No new files or abstractions.

**Tech Stack:** TypeScript (injected probe scripts), Vue 3 reactivity, Electron IPC (ipcRenderer.sendToHost)

---

### Task 1: NodeTree toggle deselect — second click clears selection

**Files:**
- Modify: `src/panel/components/NodeTree.ts:205-215`

- [ ] **Step 1: Add toggle logic in selectNode**

Replace the current `selectNode` function body. The change adds an early-return branch at the top: if the clicked node's id matches the current `selectedId`, clear it instead of re-selecting.

```ts
// src/panel/components/NodeTree.ts — lines 205-215
// REPLACE the existing selectNode function with:

const selectNode = (node: any) => {
    // 切换取消选中：再次点击已选中节点则清除选中
    if (node.id === selectedId.value) {
        console.log(`[Selection-Debug] Trigger: Panel-Tree-ToggleDeselect | NodeID: ${node.id}`);
        selectedId.value = '';
        emit('select', null);
        return;
    }
    console.log(`[Selection-Debug] Trigger: Panel-Tree-Click | NodeID: ${node.id} | Name: ${node.name || 'Unknown'}`);
    selectedId.value = node.id;
    // 记录下所有的祖先级 ID 以便清除搜索后能自动连级展开
    if (node.ancestorIds) {
        node.ancestorIds.forEach((pid: string) => {
            expandedState.value[pid] = true;
        });
    }
    emit('select', node);
};
```

- [ ] **Step 2: Build the panel**

```powershell
npm run build
```

- [ ] **Step 3: Manual verification**

1. Open a Cocos Creator project with the extension active
2. In the node tree, click any node → verify highlight box appears in game view
3. Click the same node again → verify highlight box disappears AND tree selection clears
4. Click a different node → verify it selects normally
5. Toggle between two nodes → verify switching works

- [ ] **Step 4: Commit**

```powershell
git add src/panel/components/NodeTree.ts dist/panel/components/NodeTree.js
git commit -m "feat: node tree toggle deselect — second click clears selection"
```

---

### Task 2: Picker empty click — normalize to null for consistency

**Files:**
- Modify: `src/probe/picker.ts:66-97`

The picker already clears selection on empty click, but uses empty string `''` while the rest of the system uses `null`. Normalize for consistency and correctness.

- [ ] **Step 1: Change empty-hit handling to use null**

In `_onClick`, change the hitUuid fallback from `''` to `null`, and the setSelectionTarget call to pass `null` explicitly:

```ts
// src/probe/picker.ts — lines 78-96
// In _onClick, replace the hit-test and IPC section:

const hitNode = self.hitTest(e.clientX, e.clientY);
let hitUuid: string | null = null;
if (hitNode) {
    hitUuid = hitNode.uuid || hitNode.id;
}

Logger.log(`[Picker Trigger] 鼠标点击完成，决议抛出的 hitUuid 值为: ${hitUuid || 'null'} (Node: ${hitNode ? hitNode.name : 'Unknown'})`);

// 同步持久化高亮框焦点（null 表示清除选中）
if (window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget) {
    window.__mcpCrawler.setSelectionTarget(hitUuid);
}

// 通知面板（null 表示清除选中）
if (window.__mcpInspector && window.__mcpInspector.sendNodeSelected) {
    Logger.log(`[Selection-Debug] Trigger: Probe-Picker-sendNodeSelected | HitUuid: ${hitUuid || 'null'} | Broadcasting to IPC channel...`);
    window.__mcpInspector.sendNodeSelected(hitUuid || '');
}

self.disable();
```

- [ ] **Step 2: Build**

```powershell
npm run build
```

- [ ] **Step 3: Manual verification**

1. Activate the node picker (pick tool)
2. Click on a visible node in game view → verify selection
3. Click on empty space in game view → verify BOTH highlight AND tree selection are cleared

- [ ] **Step 4: Commit**

```powershell
git add src/probe/picker.ts dist/probe/picker.js
git commit -m "fix: normalize picker empty-hit to null, ensure selection clears consistently"
```

---

### Task 3: Highlighter — scene launch clears selection + render-frame validity guard

**Files:**
- Modify: `src/probe/highlighter.ts:22-25` (scene launch handler)
- Modify: `src/probe/highlighter.ts:36-44` (AFTER_UPDATE validity check)

Two changes in one file, applied together.

- [ ] **Step 1: Modify EVENT_AFTER_SCENE_LAUNCH handler**

Replace the existing handler (lines 22-25) to clear selection state before reinitializing the overlay:

```ts
// src/probe/highlighter.ts — lines 22-25
// REPLACE the existing EVENT_AFTER_SCENE_LAUNCH handler:

window.cc.director.on(window.cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    Logger.log('[Highlighter] EVENT_AFTER_SCENE_LAUNCH 触发 — 清除旧场景选中状态');
    // 清除旧场景的选中/悬停状态（节点已随旧场景销毁）
    window.__mcpHighlightData.selectId = null;
    window.__mcpHighlightData.hoverId = null;
    _initHighlightLayer();
    // 通知面板同步清除树选中状态
    if (window.__mcpInspector && window.__mcpInspector.sendClearSelection) {
        window.__mcpInspector.sendClearSelection();
    }
});
```

- [ ] **Step 2: Modify EVENT_AFTER_UPDATE isValid guard**

Replace the existing guard block (lines 36-44) to clear IDs when nodes are invalid:

```ts
// src/probe/highlighter.ts — lines 36-44
// REPLACE the existing isValid guard block:

const data = window.__mcpHighlightData;
const eng = window.cc;
if (!data.hoverGraphics || !data.hoverNode || !data.hoverNode.isValid ||
    !data.selectGraphics || !data.selectNode || !data.selectNode.isValid) {
    // 兜底清除：节点已销毁则清空对应 ID
    if (data.selectNode && !data.selectNode.isValid && data.selectId) {
        Logger.log('[Highlighter] 选中节点已销毁，清除 selectId');
        data.selectId = null;
        if (window.__mcpInspector && window.__mcpInspector.sendClearSelection) {
            window.__mcpInspector.sendClearSelection();
        }
    }
    if (data.hoverNode && !data.hoverNode.isValid && data.hoverId) {
        data.hoverId = null;
    }
    if (eng && eng.director && eng.director.getScene()) {
        _initHighlightLayer();
    }
    return;
}
```

- [ ] **Step 3: Build**

```powershell
npm run build
```

- [ ] **Step 4: Manual verification**

Scene change test:
1. Select a node in the tree → highlight appears
2. In Cocos Creator editor, switch to a different scene → highlight should disappear, tree selection should clear

Node destroy test:
1. Select a node in the tree → highlight appears
2. Execute a script that destroys that node at runtime
3. Within 1 frame, the highlight should disappear

- [ ] **Step 5: Commit**

```powershell
git add src/probe/highlighter.ts dist/probe/highlighter.js
git commit -m "fix: clear selection highlight on scene change and node destroy"
```

---

### Task 4: IPC bridge — add sendClearSelection to preload and panel handler

**Files:**
- Modify: `src/preload.ts:78-97` (main __mcpInspector object)
- Modify: `src/preload.ts:127-134` (subframe bootstrap mirror)
- Modify: `src/panel/composables/useGameView.ts:415-446` (IPC message handler)

- [ ] **Step 1: Add sendClearSelection to main __mcpInspector**

Insert `sendClearSelection` after `sendNodeSelected` in the main inspector object:

```ts
// src/preload.ts — inside window.__mcpInspector object, after sendNodeSelected (line 96):

        sendClearSelection: () => {
            ipcRenderer.sendToHost('clear-selection');
        }
```

The full `window.__mcpInspector` block becomes:

```ts
    (window as any).__mcpInspector = {
        updateTree: (treeData: string) => {
            ipcRenderer.sendToHost('update-tree', treeData);
        },
        updateEnv: (envData: any) => {
            ipcRenderer.sendToHost('update-env', envData);
        },
        sendLog: (logData: string) => {
            ipcRenderer.sendToHost('send-log', logData);
        },
        sendHandshake: (info: any) => {
            ipcRenderer.sendToHost('handshake', info);
        },
        sendRenderDebuggerPayload: (payload: any) => {
            ipcRenderer.sendToHost('render-debugger-payload', payload);
        },
        sendNodeSelected: (uuid: string) => {
            ipcRenderer.sendToHost('node-picker-selected', uuid);
        },
        sendClearSelection: () => {
            ipcRenderer.sendToHost('clear-selection');
        }
    };
```

- [ ] **Step 2: Add sendClearSelection to subframe bootstrap**

Add the same method to the subframe fallback `window.__mcpInspector` (around line 133):

```ts
// src/preload.ts — inside the subframeBootstrap string, after sendNodeSelected:
                            sendClearSelection: function() { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'clear-selection', args: [] }, '*'); }
```

The full subframe `window.__mcpInspector` block becomes:

```ts
                        window.__mcpInspector = {
                            updateTree: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'update-tree', args: [data] }, '*'); },
                            updateEnv: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'update-env', args: [data] }, '*'); },
                            sendLog: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'send-log', args: [data] }, '*'); },
                            sendHandshake: function(info) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'handshake', args: [info] }, '*'); },
                            sendRenderDebuggerPayload: function(payload) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'render-debugger-payload', args: [payload] }, '*'); },
                            sendNodeSelected: function(uuid) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'node-picker-selected', args: [uuid] }, '*'); },
                            sendClearSelection: function() { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'clear-selection', args: [] }, '*'); }
                        };
```

- [ ] **Step 3: Add clear-selection IPC handler in useGameView**

Add a new `else if` branch in the `setupGameViewListeners` ipc-message handler, after the `node-picker-selected` branch (after line 446):

```ts
// src/panel/composables/useGameView.ts — inside setupGameViewListeners, 
// after the node-picker-selected handler block, add:

                } else if (event.channel === 'clear-selection') {
                    console.log('[IPC Received] <- clear-selection: clearing panel selection state');
                    globalState.nodeDetail = null;
                    const nt: any = nodeTreeRef.value;
                    if (nt && typeof nt.selectedId !== 'undefined') {
                        nt.selectedId = '';
                    }
                }
```

- [ ] **Step 4: Build**

```powershell
npm run build
```

- [ ] **Step 5: Manual integration test**

Full flow test:
1. Select a node → highlight in game view + tree highlights
2. Switch scenes → both clear automatically
3. Select node → destroy it via script → both clear automatically  
4. Click selected node again → both clear
5. Use picker, click empty space → both clear

- [ ] **Step 6: Commit**

```powershell
git add src/preload.ts dist/preload.js src/panel/composables/useGameView.ts dist/panel/composables/useGameView.js
git commit -m "feat: add clear-selection IPC channel — panel syncs with probe on scene change / node destroy"
```
