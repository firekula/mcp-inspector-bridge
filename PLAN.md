# 任务排期与规约计划 (PLAN.md)

本项目开发计划分为以下 4 个阶段，任务总耗时预计在 20 分钟内。

---

## 阶段 1：开发本地模拟验证脚本
*   **任务描述**：在 `scratch/test-script-runner.ts` 中搭建本地沙箱，以模拟 Cocos Creator 编辑器面板侧环境（Mock globalState、gameView、window 等）。
*   **子任务 1.1**：创建 [test-script-runner.ts](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/scratch/test-script-runner.ts) 文件。
*   **子任务 1.2**：编写三种类型的测试用例代码：
    - `OkScript`：带有 `runInGame(() => { cc.log() })` 的合法脚本，预期成功加载。
    - `ErrorScript`：外层写了 `cc.log(...)`，预期拦截报错。
    - `ErrorScript2`：外层写了 `window.cc.log(...)`，预期拦截报错。
*   **预计耗时**：5 分钟
*   **验证命令**：
    ```powershell
    npx -y ts-node scratch/test-script-runner.ts
    ```
    *(注：此时由于还未修改代码，ErrorScript 和 ErrorScript2 会抛出原始的 `ReferenceError` 导致执行中断。)*

---

## 阶段 2：修改 useScriptSystem.ts 核心代码
*   **任务描述**：在脚本引擎核心中引入 `ccProxy` 拦截机制及 `//# sourceURL` 调试源路径注入，并捕获完整调用栈。
*   **子任务 2.1**：在 [useScriptSystem.ts](file:///c:/Users/Firekula/.CocosCreator/packages/mcp-inspector-bridge/src/panel/composables/useScriptSystem.ts) 顶部实现全局对 `window.cc` 的定义与防御（使用 `Object.defineProperty`）。
*   **子任务 2.2**：在 `loadScript` 内部实现 `ccProxy` 实例，并将 `new Function('mcp', 'cc', bodyCode)` 作为遮蔽，传入 `ccProxy`。
*   **子任务 2.3**：在 `bodyCode` 拼接 `//# sourceURL=mcp-script:///${fileName}` 并传入虚拟源地址。
*   **子任务 2.4**：更新 `try-catch` 逻辑以将 `e.stack || e.message` 赋值给 `entry.errorMsg`。
*   **预计耗时**：8 分钟
*   **验证命令**：
    ```powershell
    # 验证 TypeScript 语法能够正常通过编译
    npx tsc --noEmit
    ```

---

## 阶段 3：执行本地自动化回归测试
*   **任务描述**：运行阶段 1 编写的测试脚本，观察三个测试用例的拦截结果和堆栈信息是否完全符合预期。
*   **子任务 3.1**：执行测试命令并分析日志，验证友好提示信息是否正确触发。
*   **子任务 3.2**：验证在控制台打印出的错误堆栈中是否能精确定位到 `mcp-script:///ErrorScript.js` 等虚拟文件名和行号。
*   **预计耗时**：3 分钟
*   **验证命令**：
    ```powershell
    npx -y ts-node scratch/test-script-runner.ts
    ```
    *预期测试完美通过，不会非正常中断，且控制台打印出格式化后的友好错误日志。*

---

## 阶段 4：编译打包与用户最终核实
*   **任务描述**：生成正式的生产代码并提交给用户在 Cocos Creator 面板中手动验证。
*   **子任务 4.1**：运行项目完整的构建构建命令，生成 `dist/` 下的面板代码。
*   **预计耗时**：4 分钟
*   **验证命令**：
    ```powershell
    npm run build
    ```
    *验证 `dist/panel/composables/useScriptSystem.js` 被成功生成，且包含了我们的全部改动逻辑。*
