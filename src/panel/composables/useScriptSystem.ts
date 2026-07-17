declare const Editor: any;

const ALLOWED_GRANTS = ['input_simulation', 'cc_api', 'game_state', 'mcp_tool', 'persistent'];

interface ScriptMeta {
    name: string;
    version: string;
    description: string;
    author: string;
    grants: string[];
}

interface ScriptEntry {
    meta: ScriptMeta;
    status: 'running' | 'stopped' | 'error';
    errorMsg: string;
    installedAt: number;
    filePath: string;
    tools: string[];
    timers: number[];
}

function parseMeta(code: string): { meta: ScriptMeta | null; error?: string; bodyStart: number } {
    const headerMatch = code.match(/^\/\/\s*==McpScript==\s*\n([\s\S]*?)\/\/\s*==\/McpScript==\s*\n/);
    if (!headerMatch) {
        return { meta: null, error: '缺少 // ==McpScript== 元数据块', bodyStart: 0 };
    }

    const header = headerMatch[1];
    const meta: ScriptMeta = { name: '', version: '0.0.0', description: '', author: '', grants: [] };

    const lines = header.split('\n');
    for (const line of lines) {
        const m = line.match(/^\/\/\s*@(\w+)\s+(.+)/);
        if (!m) continue;
        const key = m[1];
        const value = m[2].trim();

        switch (key) {
            case 'name': meta.name = value; break;
            case 'version': meta.version = value; break;
            case 'description': meta.description = value; break;
            case 'author': meta.author = value; break;
            case 'grant':
                if (ALLOWED_GRANTS.includes(value)) {
                    meta.grants.push(value);
                }
                break;
        }
    }

    if (!meta.name) {
        return { meta: null, error: '@name 为必填字段', bodyStart: 0 };
    }

    const bodyStart = (headerMatch.index || 0) + headerMatch[0].length;
    return { meta, bodyStart };
}

function hasGrant(entry: ScriptEntry, grant: string): boolean {
    return entry.meta.grants.includes(grant);
}

export function useScriptSystem(
    globalState: any,
    gameView: any,
    registerMcpTool: (tool: any) => void,
    unregisterMcpTool: (name: string) => void
) {
    // 全局注入拦截 window.cc 属性访问，防御外层通过 window.cc 误用引擎 API
    if (typeof window !== 'undefined' && !('cc' in window)) {
        try {
            Object.defineProperty(window, 'cc', {
                get() {
                    throw new Error(`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 window.cc。如需调用 Cocos Creator 引擎 API，请在 mcp.runInGame(...) 闭包中调用。`);
                },
                configurable: true
            });
        } catch (e) {
            // 忽略由于环境限制可能产生的报错
        }
    }

    const _scripts: Map<string, ScriptEntry> = new Map();

    function buildMcpApi(entry: ScriptEntry): any {
        const api: any = {
            log(...args: any[]) {
                if (typeof Editor !== 'undefined') Editor.log(`[Script:${entry.meta.name}]`, ...args);
                else console.log(`[Script:${entry.meta.name}]`, ...args);
            },
            warn(...args: any[]) {
                if (typeof Editor !== 'undefined') Editor.warn(`[Script:${entry.meta.name}]`, ...args);
                else console.warn(`[Script:${entry.meta.name}]`, ...args);
            },
            error(...args: any[]) {
                if (typeof Editor !== 'undefined') Editor.error(`[Script:${entry.meta.name}]`, ...args);
                else console.error(`[Script:${entry.meta.name}]`, ...args);
            },
        };

        if (hasGrant(entry, 'input_simulation')) {
            const wv = gameView?.value;
            api.input = {
                click(x: number, y: number) {
                    if (!wv) return;
                    const code = `(function(){if(window.__mcpCrawler)window.__mcpCrawler.simulateInput({inputType:'click',x:${x},y:${y}});})();`;
                    wv.executeJavaScript(code).catch(() => {});
                },
                doubleClick(x: number, y: number) {
                    if (!wv) return;
                    const code = `(function(){if(window.__mcpCrawler){window.__mcpCrawler.simulateInput({inputType:'click',x:${x},y:${y}});setTimeout(function(){window.__mcpCrawler.simulateInput({inputType:'click',x:${x},y:${y}});},100);}})();`;
                    wv.executeJavaScript(code).catch(() => {});
                },
                longPress(x: number, y: number, duration: number = 500) {
                    if (!wv) return;
                    const code = `(function(){if(window.__mcpCrawler)window.__mcpCrawler.simulateInput({inputType:'long_press',x:${x},y:${y},duration:${duration}});})();`;
                    wv.executeJavaScript(code).catch(() => {});
                },
                swipe(x1: number, y1: number, x2: number, y2: number) {
                    if (!wv) return;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const code = `(function(){if(window.__mcpCrawler)window.__mcpCrawler.simulateInput({inputType:'swipe',x:${x1},y:${y1},swipeDeltaX:${dx},swipeDeltaY:${dy}});})();`;
                    wv.executeJavaScript(code).catch(() => {});
                },
                clickNode(uuid: string) {
                    if (!wv) return;
                    const code = `(function(){if(window.__mcpCrawler)window.__mcpCrawler.simulateInput({inputType:'click',uuid:'${uuid}'});})();`;
                    wv.executeJavaScript(code).catch(() => {});
                },
            };
        }

        if (hasGrant(entry, 'cc_api')) {
            api.runInGame = function(fn: Function): Promise<any> {
                return new Promise((resolve) => {
                    const wv = gameView?.value;
                    if (!wv) { resolve({ error: 'Game view not available' }); return; }
                    const fnStr = fn.toString();
                    const code = `(function(){try{var __r=(${fnStr})();return JSON.stringify({ok:true,val:__r});}catch(e){return JSON.stringify({ok:false,error:e.message});}})();`;
                    const timer = setTimeout(() => resolve({ error: 'runInGame timeout (5s)' }), 5000);
                    wv.executeJavaScript(code).then((raw: string) => {
                        clearTimeout(timer);
                        try { const parsed = JSON.parse(raw); resolve(parsed.ok ? parsed.val : { error: parsed.error }); }
                        catch (_) { resolve(raw); }
                    }).catch((e: any) => {
                        clearTimeout(timer);
                        resolve({ error: e.message });
                    });
                });
            };
        }

        if (hasGrant(entry, 'persistent')) {
            api.setInterval = function(fn: Function, ms: number): number {
                const clamped = Math.max(100, ms);
                const id = window.setInterval(() => {
                    try { fn(); } catch (e) { api.error('Interval error:', (e as any).message); }
                }, clamped);
                entry.timers.push(id);
                return id;
            };
            api.clearInterval = function(id: number) {
                window.clearInterval(id);
                entry.timers = entry.timers.filter(t => t !== id);
            };
            api.setTimeout = function(fn: Function, ms: number): number {
                const id = window.setTimeout(() => {
                    entry.timers = entry.timers.filter(t => t !== id);
                    try { fn(); } catch (e) { api.error('Timeout error:', (e as any).message); }
                }, ms);
                entry.timers.push(id);
                return id;
            };
        }

        if (hasGrant(entry, 'mcp_tool')) {
            api.registerTool = function(toolDef: any) {
                if (entry.tools.includes(toolDef.name)) {
                    api.warn(`MCP 工具 "${toolDef.name}" 已注册，将覆盖`);
                    unregisterMcpTool(toolDef.name);
                }
                entry.tools.push(toolDef.name);
                registerMcpTool(toolDef);
            };
        }

        return api;
    }

    function loadScript(fileName: string, code: string): { success: boolean; error?: string } {
        if (_scripts.has(fileName)) {
            stopScript(fileName);
        }

        const { meta, error, bodyStart } = parseMeta(code);
        if (!meta) {
            return { success: false, error: `元数据解析失败: ${error}` };
        }

        const entry: ScriptEntry = {
            meta,
            status: 'running',
            errorMsg: '',
            installedAt: Date.now(),
            filePath: fileName,
            tools: [],
            timers: [],
        };

        _scripts.set(fileName, entry);

        const mcp = buildMcpApi(entry);

        // 局部变量 cc 拦截代理
        const ccProxy = new Proxy({}, {
            get(target, prop) {
                throw new Error(`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 cc。如需调用 Cocos Creator 引擎 API，请在 mcp.runInGame(...) 闭包中调用。`);
            },
            set(target, prop, value) {
                throw new Error(`[McpScript] 无法在面板侧（脚本外层作用域）直接使用 cc。如需调用 Cocos Creator 引擎 API，请在 mcp.runInGame(...) 闭包中调用。`);
            }
        });

        // 拼接虚拟源映射文件名，方便控制台报错时精确定位错误位置
        const bodyCode = code.slice(bodyStart) + `\n//# sourceURL=mcp-script:///${fileName}`;
        try {
            // 通过 'cc' 形参遮蔽了全局的 cc，传入 ccProxy 进行拦截
            const fn = new Function('mcp', 'cc', bodyCode);
            fn(mcp, ccProxy);
        } catch (e: any) {
            entry.status = 'error';
            // 保留完整的堆栈调用信息，利于用户调试
            entry.errorMsg = e.stack || e.message;
            syncToState();
            return { success: false, error: entry.errorMsg };
        }

        syncToState();
        return { success: true };
    }

    function stopScript(fileName: string) {
        const entry = _scripts.get(fileName);
        if (!entry) return;

        for (const timerId of entry.timers) {
            window.clearInterval(timerId);
            window.clearTimeout(timerId);
        }
        entry.timers = [];

        for (const toolName of entry.tools) {
            unregisterMcpTool(toolName);
        }
        entry.tools = [];

        entry.status = 'stopped';
        syncToState();
    }

    function enableScript(fileName: string, code: string) {
        return loadScript(fileName, code);
    }

    function disableScript(fileName: string) {
        stopScript(fileName);
    }

    function removeScript(fileName: string) {
        stopScript(fileName);
        _scripts.delete(fileName);
        syncToState();
    }

    function syncToState() {
        globalState.scriptList = Array.from(_scripts.entries()).map(([name, entry]) => ({
            name: entry.meta.name,
            version: entry.meta.version,
            description: entry.meta.description,
            author: entry.meta.author,
            grants: entry.meta.grants,
            status: entry.status,
            errorMsg: entry.errorMsg,
            toolCount: entry.tools.length,
            installedAt: entry.installedAt,
            fileName: name,
        }));
    }

    return {
        loadScript,
        stopScript,
        enableScript,
        disableScript,
        removeScript,
        syncToState,
        _scripts,
    };
}
