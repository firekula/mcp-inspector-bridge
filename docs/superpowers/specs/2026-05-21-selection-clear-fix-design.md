# Selection Clear Fix — Design Spec

**Date**: 2026-05-21  
**Status**: Approved

## Problem

1. 选取器或节点树选中节点后，场景切换或节点被销毁时，选择框（高亮框）不会清除，残留在游戏画面中。
2. 取消选中只能点击节点树的空白区域，无法通过再次点击已选中节点来取消选中。
3. 选取器模式下点击空白区域不清除已有选中状态。

## Solution Overview

4 个文件，5 处修改：

| # | 文件 | 改动 |
|---|------|------|
| ① | `src/panel/components/NodeTree.ts` | 切换取消选中 |
| ② | `src/probe/picker.ts` | 选取器空白命中时清除选中 |
| ③ | `src/probe/highlighter.ts` | 场景切换主动清除 selectId/hoverId |
| ④ | `src/probe/highlighter.ts` | 渲染帧 isValid 校验失败时兜底清除 |
| ⑤ | `src/panel/composables/useGameView.ts` | 新增 IPC 通道 `clear-selection` 同步面板 |

## Detailed Changes

### ① NodeTree 切换取消选中 (`NodeTree.ts:205-215`)

`selectNode()` 增加切换逻辑：若 `node.id === selectedId.value`，则清空 selectedId 并 emit null。

```
selectNode(node):
  if node.id === selectedId:
    selectedId = ''
    emit('select', null)
    return
  // ... existing logic ...
```

emit null 会被 `useNodeSystem.onNodeSelect(null)` 处理，调用 `setSelectionTarget(null)` 清除游戏高亮框。

### ② 选取器空白命中清除 (`picker.ts:66-97`)

确保 `_onClick` 中 hitNode 为 null 时也调用 `setSelectionTarget('')` 和 `sendNodeSelected('')`（当前代码已基本满足，需确认空字符串处理逻辑一致，统一为 null）。

### ③ 场景切换主动清除 (`highlighter.ts:22-25`)

`EVENT_AFTER_SCENE_LAUNCH` 回调中增加清除逻辑：

```
on EVENT_AFTER_SCENE_LAUNCH:
  __mcpHighlightData.selectId = null
  __mcpHighlightData.hoverId = null
  _initHighlightLayer()
  sendClearSelection() to panel via IPC
```

### ④ 渲染帧有效性兜底 (`highlighter.ts:36-44`)

已有的 `isValid` 检查补齐清除逻辑：当 selectNode 或 hoverNode 已销毁时，同步清除对应的 ID 并通知面板。

```
if selectNode && !selectNode.isValid && selectId:
  selectId = null
  sendClearSelection() to panel
if hoverNode && !hoverNode.isValid && hoverId:
  hoverId = null
```

### ⑤ 面板端同步 (`useGameView.ts`)

- 探针端新增 `window.__mcpInspector.sendClearSelection()` IPC 发送函数
- 面板端在 `setupGameViewListeners` 中新增 `clear-selection` IPC 消息处理：

```
on 'clear-selection':
  globalState.nodeDetail = null
  nodeTreeRef.selectedId = ''
```

## Coverage Matrix

| 场景 | 处理机制 |
|------|----------|
| 再次点击树中已选中节点 | ① 切换取消 |
| 点击树空白区域 | 已有 `onContainerClick` |
| 选取器点击空白 | ② picker 空白清除 |
| 场景切换（用户主动切换场景） | ③ EVENT_AFTER_SCENE_LAUNCH |
| 节点运行时被脚本销毁 | ④ 渲染帧 isValid 兜底 |
| 场景切换后面板树状态 | ⑤ IPC 同步清除 |
