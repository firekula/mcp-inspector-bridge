# 设计规约：MCP 脚本系统加载与调试体验优化 (DESIGN.md)

本设计文档旨在解决用户在编写 MCP 脚本时，误在面板侧（外层作用域）使用 `cc` 全局变量而导致的 `ReferenceError: cc is not defined` 报错，并提升脚本执行出错时的调试定位体验。

---

## 1. 根本问题与优化目标

### 根本问题
1. **双端上下文混淆**：Cocos Creator 插件有“面板侧”（主/渲染进程）和“游戏侧”（网页端 WebView 进程）之分。MCP 脚本外层在面板侧执行，而真正的 `cc` 引擎运行时只在游戏侧。外层直接调用 `cc` 必然报错。
2. **错误提示不友好**：当直接调用 `cc` 时，抛出的 `ReferenceError: cc is not defined` 会让不熟悉多端架构的开发者感到困惑。同时，报错堆栈中的 `eval at loadScript` 无法定位脚本的具体行号。

### 优化目标
1. **拦截与友好报错**：在脚本外层试图访问 `cc` 时进行精准拦截，并提示正确的用法（引导使用 `mcp.runInGame`）。
2. **精确定位行号**：使脚本报错堆栈能够准确映射到脚本文件名和具体出错行号。

---

## 2. 技术设计方案

### 方案 A：面板侧 cc 拦截代理 (Proxy Interceptor)
在执行 `loadScript` 时，不引入繁重的 AST 解析库，而是采用“形参遮蔽 + 代理拦截”的轻量化方案。

1. **定义拦截代理 `ccProxy`**：
   ```typescript
   const ccProxy = new Proxy({}, {
       get(target, prop) {
           throw new Error(`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 cc。如需调用 Cocos Creator 引擎 API，请在 mcp.runInGame(...) 闭包中调用。`);
       },
       set(target, prop, value) {
           throw new Error(`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 cc。如需调用 Cocos Creator 引擎 API，请在 mcp.runInGame(...) 闭包中调用。`);
       }
   });
   ```

2. **形参遮蔽执行**：
   将 `new Function` 的声明改造为接收 `'mcp'` 和 `'cc'` 两个参数：
   ```diff
   - const fn = new Function('mcp', bodyCode);
   - fn(mcp);
   + const fn = new Function('mcp', 'cc', bodyCode);
   + fn(mcp, ccProxy);
   ```
   *   **外层执行**：外层所有直接访问 `cc` 的代码都会访问到我们传入的局部变量 `cc`（即 `ccProxy`），从而触发拦截抛出友好报错。
   *   **游戏侧执行**：由于 `mcp.runInGame(fn)` 采用的是 `fn.toString()` 序列化字符串并发送至 WebView 侧重新解析执行，在 WebView 侧该闭包在全局作用域下运行，会自动绑定至 WebView 内真正的全局 `cc` 对象，不受面板侧局部形参的约束。

### 方案 B：调试源映射优化 (Source URL Injection)
通过在执行的脚本代码尾部追加 `//# sourceURL` 注释，赋予动态脚本一个清晰的虚拟文件路径。

1. **注入虚拟路径**：
   ```typescript
   const bodyCode = code.slice(bodyStart) + `\n//# sourceURL=mcp-script:///${fileName}`;
   ```
2. **效果**：
   当脚本发生运行时错误时，控制台堆栈将由：
   `at eval (eval at loadScript (useScriptSystem.js:200:24), <anonymous>:6:21)`
   转变为：
   `at mcp-script:///my_script.js:6:21`
   不仅清晰美观，还支持直接在 DevTools 的 Sources 面板中查看、打断点。

---

## 3. 待确认的实施方案与验证

### 自动测试与手动验证方案
1. **测试用例 1：外层误用 cc 拦截测试**
   *   **脚本代码**：
       ```javascript
       // ==McpScript==
       // @name ErrorScript
       // @grant cc_api
       // ==/McpScript==
       cc.log("外层直接调用");
       ```
   *   **期望结果**：脚本加载失败，报错面板提示：`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 cc...`。

2. **测试用例 2：runInGame 内使用 cc 正常运行测试**
   *   **脚本代码**：
       ```javascript
       // ==McpScript==
       // @name OkScript
       // @grant cc_api
       // ==/McpScript==
       mcp.runInGame(() => {
           cc.log("游戏内调用成功");
       });
       ```
   *   **期望结果**：脚本成功加载并运行，控制台正确输出游戏内的日志。

3. **测试用例 3：报错行号定位测试**
   *   **脚本代码**：
       ```javascript
       // ==McpScript==
       // @name LineErrorScript
       // ==/McpScript==
       mcp.log("行 1");
       throw new Error("测试抛出错误"); // 行 6
       ```
   *   **期望结果**：报错堆栈包含 `at mcp-script:///LineErrorScript:6`，能够精确定位到第 6 行。
