# 自定义预览分辨率 — 设计文档

> 日期：2026-07-10 | 状态：已批准

## 1. 目标

在偏好设置面板（Tab 6）中新增"自定义预览分辨率"管理区域，允许用户创建、编辑、删除自定义分辨率，这些分辨率会出现在预览窗口的分辨率下拉菜单中。

## 2. 需求摘要

- 用户可在设置界面添加自定义分辨率：名称（选填） + 宽度 × 高度
- 支持编辑和删除已有自定义分辨率
- 名称未填写时，下拉菜单和列表中显示为 `自定义分辨率（1920x1080）` 格式
- 自定义分辨率出现在分辨率下拉菜单中，作为独立的 `optgroup`（标签："自定义"）
- 全局级别持久化（`Editor.Profile` `profile://global/`，跨项目共享）

## 3. 数据结构

```ts
interface CustomResolution {
  id: string;       // 唯一标识，Date.now().toString(36)
  name: string;     // 用户输入名称，可为空字符串
  width: number;    // 像素宽度，正整数
  height: number;   // 像素高度，正整数
}
```

存储于 `profile://global/mcp-inspector-bridge.json`，key 为 `custom-resolutions`，值类型 `CustomResolution[]`。

选项的 value 沿用现有格式 `"WIDTHxHEIGHT"`（如 `"1920x1080"`），与 `gameContainerStyle` 解析逻辑完全兼容。

## 4. 涉及文件（4 个）

### 4.1 `src/main.ts` — IPC handlers

新增 2 个 IPC handler：

- `query-custom-resolutions` — 读取 profile 中的 `custom-resolutions` 数组，返回 `CustomResolution[]`
- `save-custom-resolutions` — 接收 `CustomResolution[]`，全量写入 profile 并 save

与其他 handler（`query-resolution`、`save-fps` 等）风格一致。

### 4.2 `src/panel/composables/useLayout.ts` — 核心逻辑

新增：

| 成员 | 类型 | 说明 |
|---|---|---|
| `customResolutions` | `Ref<CustomResolution[]>` | 当前自定义分辨率列表 |
| `resolutionOptions` | `computed` | 返回统一选项数组 `{label, options: {value, text}[]}[]`，用于 v-for 渲染 `<optgroup>` |
| `addCustomResolution(name, w, h)` | 方法 | 添加，生成 id，自动 IPC 持久化 |
| `editCustomResolution(id, name, w, h)` | 方法 | 编辑，自动 IPC 持久化 |
| `deleteCustomResolution(id)` | 方法 | 删除，自动 IPC 持久化 |
| `loadCustomResolutions()` | 内部方法 | 初始化时通过 IPC 加载 |
| `editingResId` | `Ref<string \| null>` | 当前正在编辑的分辨率 id（UI 状态） |
| `newResName / newResWidth / newResHeight` | `Ref<string>` | 新增/编辑表单绑定值 |

`resolutionOptions` 结构：

```ts
[
  { label: null, options: [{ value: 'FIT', text: '自动充满 (Fit Window)' }] },
  { label: 'iOS/iPadOS 阵营', options: [{ value: '1290x2796', text: 'iPhone 16 Pro Max...' }, ...] },
  { label: '安卓直板手机', options: [...] },
  { label: '折叠屏全形态', options: [...] },
  { label: '平板游戏横态', options: [...] },
  // 仅在 customResolutions 非空时出现
  { label: '自定义', options: customResolutions 映射 }
]
```

显示文本逻辑：
- `name` 非空 → `name（WIDTH×HEIGHT）`
- `name` 为空 → `自定义分辨率（WIDTH×HEIGHT）`

### 4.3 `src/panel/index.html` — UI 改动

#### A. 分辨率下拉菜单（行 505-545）

将现有硬编码 `<option>` + `<optgroup>` 替换为基于 `resolutionOptions` computed 的动态渲染：

```html
<select v-model="selectedResolution" ...>
  <template v-for="group in resolutionOptions">
    <optgroup v-if="group.label" :label="group.label">
      <option v-for="opt in group.options" :value="opt.value">{{ opt.text }}</option>
    </optgroup>
    <template v-else>
      <option v-for="opt in group.options" :value="opt.value">{{ opt.text }}</option>
    </template>
  </template>
</select>
```

#### B. 设置面板（Tab 6，在现有区域之后、`</div>` 闭合之前）

新增一个 card 区域：

- 区域标题：`📐 自定义预览分辨率`
- 添加表单：名称输入框(placeholder:"选填") + 宽输入框 + `×` + 高输入框 + `添加` 按钮
- 已有列表：每行显示 `名称（WxH）` + 编辑按钮 + 删除按钮
- 编辑模式：行内替换为输入框 + 保存/取消按钮

### 4.4 `src/panel/index.ts` — 连接

`useLayout` 返回值已经通过 `...layoutSystem` 展开到模板上下文，新增的导出项自动可用，无需额外修改。

唯一需要的是：在 `onMounted` 中调用 `loadCustomResolutions()`，在 `layoutSystem.setupResizeObserver()` 之前。

## 5. 验证计划

1. **构建通过** — `npm run build` 零错误
2. **下拉菜单** — 无自定义分辨率时，下拉菜单与原版完全一致；添加后出现"自定义" optgroup
3. **CRUD 操作** — 添加/编辑/删除后下拉菜单实时同步
4. **持久化** — 关闭面板后重新打开，自定义分辨率仍存在
5. **跨项目** — 切换项目后自定义分辨率仍然可用
6. **分辨率生效** — 选中自定义分辨率后，预览窗口按该分辨率缩放显示
7. **名称为空** — 名称留空时，显示为 `自定义分辨率（1920x1080）` 格式
