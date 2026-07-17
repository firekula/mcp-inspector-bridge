// Mock 全局 window 对象，以防止 useScriptSystem 加载时报错
const mockWindow: any = {
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
};
(global as any).window = mockWindow;

import { useScriptSystem } from '../src/panel/composables/useScriptSystem';

// 模拟面板所需的 globalState 和 gameView 实例
const globalState = { scriptList: [] as any[] };
const gameView = {
    value: {
        executeJavaScript(code: string) {
            console.log(`\x1b[36m[WebView Mock] 执行代码 (runInGame 投递):\x1b[0m\n${code}\n`);
            return Promise.resolve(JSON.stringify({ ok: true, val: "WebView 执行成功" }));
        }
    }
};

const registerMcpTool = (tool: any) => {
    console.log(`[MCP Tool Mock] 注册工具: ${tool.name}`);
};

const unregisterMcpTool = (name: string) => {
    console.log(`[MCP Tool Mock] 反注册工具: ${name}`);
};

// 初始化脚本系统
const { loadScript, _scripts } = useScriptSystem(
    globalState,
    gameView,
    registerMcpTool,
    unregisterMcpTool
);

// ----------------------------------------------------
// 测试用例 1: 合法脚本，在 runInGame 闭包中调用 cc.log
// ----------------------------------------------------
const okScript = `// ==McpScript==
// @name OkScript
// @grant cc_api
// ==/McpScript==
mcp.log("脚本加载中...");
mcp.runInGame(() => {
    cc.log("这应当被序列化并在 WebView 侧运行");
});`;

console.log("\n\x1b[32m=== [测试用例 1] 运行合法脚本 ===\x1b[0m");
const res1 = loadScript("OkScript.js", okScript);
console.log("用例 1 结果:", res1);

// ----------------------------------------------------
// 测试用例 2: 错误脚本，脚本外层（同步段）直接调用 cc.log
// ----------------------------------------------------
const errorScript = `// ==McpScript==
// @name ErrorScript
// @grant cc_api
// ==/McpScript==
mcp.log("错误脚本 1 载入中...");
cc.log("外层直接调用 cc.log，预期触发拦截！");`;

console.log("\n\x1b[31m=== [测试用例 2] 运行外层误用 cc 脚本 ===\x1b[0m");
const res2 = loadScript("ErrorScript.js", errorScript);
console.log("用例 2 结果:", res2);
const scriptEntry2 = _scripts.get("ErrorScript.js");
if (scriptEntry2) {
    console.log("\x1b[33m[验证] ErrorScript 状态:\x1b[0m", scriptEntry2.status);
    console.log("\x1b[33m[验证] 捕获到的错误信息:\x1b[0m\n", scriptEntry2.errorMsg);
}

// ----------------------------------------------------
// 测试用例 3: 错误脚本，脚本外层（同步段）调用 window.cc.log
// ----------------------------------------------------
const errorScript2 = `// ==McpScript==
// @name ErrorScript2
// @grant cc_api
// ==/McpScript==
mcp.log("错误脚本 2 载入中...");
window.cc.log("外层调用 window.cc.log，预期触发拦截！");`;

console.log("\n\x1b[31m=== [测试用例 3] 运行外层误用 window.cc 脚本 ===\x1b[0m");
const res3 = loadScript("ErrorScript2.js", errorScript2);
console.log("用例 3 结果:", res3);
const scriptEntry3 = _scripts.get("ErrorScript2.js");
if (scriptEntry3) {
    console.log("\x1b[33m[验证] ErrorScript2 状态:\x1b[0m", scriptEntry3.status);
    console.log("\x1b[33m[验证] 捕获到的错误信息:\x1b[0m\n", scriptEntry3.errorMsg);
}
