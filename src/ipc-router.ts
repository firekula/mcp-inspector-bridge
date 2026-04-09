import * as WebSocket from 'ws';
declare const Editor: any;

const TOOL_IPC_MAP: Record<string, string> = {
    'get_selected_node': 'mcp-query-selected-node',
    'capture_runtime_screenshot': 'mcp-capture-screenshot',
    'get_node_detail': 'mcp-query-node-detail',
    'update_node_property': 'mcp-update-property',
    'get_memory_ranking': 'mcp-query-memory',
    'simulate_input': 'mcp-simulate-input',
    'get_node_tree': 'mcp-query-tree',
    'get_runtime_logs': 'mcp-query-logs',
    'get_runtime_stats': 'mcp-query-stats'
};

const CACHE: Record<string, { timestamp: number, data: any }> = {};

function dispatchToPanelWithTimeout(channel: string, args: any, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
        let isTimeout = false;
        const timer = setTimeout(() => {
            isTimeout = true;
            reject(new Error(`RPC_TIMEOUT: 面板在 ${timeoutMs}ms 内未响应`));
        }, timeoutMs);

        Editor.Ipc.sendToPanel('mcp-inspector-bridge', channel, args, (err: any, res: any) => {
            if (isTimeout) return;
            clearTimeout(timer);
            if (err) reject(err);
            else resolve(res);
        }, timeoutMs + 500); 
    });
}

function handleCaptureScreenshot(ws: WebSocket.WebSocket, reqId: string) {
    const { webContents } = require('electron');
    const allWc = webContents.getAllWebContents();
    const targetWc = allWc.find((wc: any) => {
        const url = wc.getURL();
        return url && url.includes('localhost:') && !url.includes('inspector');
    });

    if (!targetWc) {
        const errText = "未能找到活跃的预览画面，请确认预览面板已打开。";
        try { Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', { type: 'err', time: new Date().toLocaleTimeString(), content: `[capture_runtime_screenshot]\nError: ${errText}` }); } catch(e) {}
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: reqId,
            result: { isError: true, content: [{ type: "text", text: errText }] }
        }));
        return;
    }

    const handleImage = (img: any) => {
        if (!img || img.isEmpty()) {
            const errText = "获取画面为空，可能处于后台";
            try { Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', { type: 'err', time: new Date().toLocaleTimeString(), content: `[capture_runtime_screenshot]\nError: ${errText}` }); } catch(e) {}
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { isError: true, content: [{ type: "text", text: errText }] }}));
            return;
        }
        const dataUrl = img.toDataURL();
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        
        try { 
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', { 
                type: 'res', 
                time: new Date().toLocaleTimeString(), 
                content: `[capture_runtime_screenshot]\nResult: { type: "image", data: "${base64Data.substring(0, 100)}...[截断:${base64Data.length} chars]" }` 
            }); 
        } catch(e) {}

        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: reqId,
            result: {
                content: [
                    { type: "image", data: base64Data, mimeType: "image/png" },
                    { type: "text", text: "已截取当前 runtime 游戏视图。" }
                ]
            }
        }));
    };

    const result = targetWc.capturePage();
    if (result && typeof result.then === 'function') {
        result.then(handleImage).catch((e: any) => {
            try { Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', { type: 'err', time: new Date().toLocaleTimeString(), content: `[capture_runtime_screenshot]\nError: 截图异常: ${e.message}` }); } catch(e) {}
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { isError: true, content: [{ type: "text", text: "截图异常: " + e.message }] }}));
        });
    } else if (result) {
        handleImage(result);
    }
}

export function startMcpRouter(onStatusChange: (status: any) => void): { close: () => void } {
    let _wss: WebSocket.Server | null = null;
    let _port = 4456;

    const tryListen = () => {
        try {
            _wss = new WebSocket.Server({ port: _port });
            
            _wss.on('error', (e: any) => {
                if (e.code === 'EADDRINUSE') {
                    _port++;
                    tryListen();
                } else {
                    onStatusChange({ active: false, port: _port, error: e.message || 'Unknown network error' });
                }
            });

            _wss.on('listening', () => {
                onStatusChange({ active: true, port: _port, error: '' });
            });

            _wss.on('connection', (ws) => {
                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        if (data.type === 'ping') {
                            try {
                                Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                    time: new Date().toLocaleTimeString(),
                                    type: 'req',
                                    content: `[System] ping`
                                });
                            } catch (e) {}

                            const projectPath = Editor.Project.path || 'Unknown';
                            const resPayload = { 
                                type: 'pong',
                                port: _port,
                                projectPath: projectPath,
                                projectName: require('path').basename(projectPath)
                            };

                            try {
                                Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                    time: new Date().toLocaleTimeString(),
                                    type: 'res',
                                    content: `[System] pong\nResult: ${JSON.stringify(resPayload)}`
                                });
                            } catch (e) {}

                            ws.send(JSON.stringify(resPayload));
                            return;
                        }
                    
                    if (data.method === 'tools/call' && data.params) {
                        const name = data.params.name;
                        const args = data.params.args || {};
                        const reqId = data.id || Date.now().toString();

                        try {
                            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                time: new Date().toLocaleTimeString(),
                                type: 'req',
                                content: `[${name}]\nArgs: ${JSON.stringify(args, null, 2)}`
                            });
                        } catch (e) {}

                        if (name === 'capture_runtime_screenshot') {
                            handleCaptureScreenshot(ws, reqId);
                            return;
                        }

                        const ipcChannel = TOOL_IPC_MAP[name];
                        if (!ipcChannel) {
                            ws.send(JSON.stringify({
                                jsonrpc: "2.0",
                                id: reqId,
                                result: { content: [{ type: "text", text: `Tool unknown: ${name}` }] }
                            }));
                            return;
                        }

                        // ★ get_runtime_logs 优先走主进程 CDP 数据源（零侵入，无需面板 IPC 中转）
                        if (name === 'get_runtime_logs') {
                            try {
                                const directRes = await new Promise<any>((resolve, reject) => {
                                    const timer = setTimeout(() => reject(new Error('CDP 日志查询超时')), 3500);
                                    Editor.Ipc.sendToMain(
                                        'mcp-inspector-bridge:query-cdp-logs',
                                        args,
                                        (err: any, data: any) => { clearTimeout(timer); err ? reject(err) : resolve(data); },
                                        4000
                                    );
                                });

                                const contentText = JSON.stringify(directRes.result || directRes, null, 2);
                                // ★ 当日志为空时附加诊断信息
                                let finalContent = contentText;
                                if (directRes._debug && (!directRes.result || directRes.result.length === 0)) {
                                    finalContent = JSON.stringify({
                                        logs: directRes.result,
                                        _debug: directRes._debug,
                                        _hint: 'attached=false 表示未找到预览页面或 debugger attach 失败',
                                    }, null, 2);
                                }
                                try {
                                    let resText = finalContent;
                                    if (resText.length > 500) resText = resText.substring(0, 500) + '...[truncated:超长响应已截断]';
                                    Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                        time: new Date().toLocaleTimeString(),
                                        type: 'res',
                                        content: `[${name}]\nResult: ${resText}`
                                    });
                                } catch (e) {}
                                ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { content: [{ type: "text", text: finalContent }] } }));
                                return; // 已处理，不再走面板 IPC
                            } catch (err: any) {
                                // CDP 查询失败时返回错误信息
                                try {
                                    Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                        time: new Date().toLocaleTimeString(),
                                        type: 'err',
                                        content: `[${name}]\nError: ${err.message}`
                                    });
                                } catch (e) {}
                                ws.send(JSON.stringify({
                                    jsonrpc: "2.0", id: reqId,
                                    result: { content: [{ type: "text", text: `CDP 日志不可用: ${err.message}` }], isError: true }
                                }));
                                return;
                            }
                        }

                        // Check cache for specific frequent queries
                        const cacheKey = `${name}_${JSON.stringify(args)}`;
                        if (name === 'get_node_tree' && CACHE[cacheKey] && Date.now() - CACHE[cacheKey].timestamp < 500) {
                            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: CACHE[cacheKey].data }));
                            return;
                        }

                        try {
                            const res = await dispatchToPanelWithTimeout(ipcChannel, args, 3000);
                            let contentText = '';
                            if (!res || res.error) {
                                contentText = JSON.stringify({ error: (res && res.error) || 'Unknown IPC error' });
                            } else {
                                contentText = JSON.stringify(res.result || res, null, 2);
                            }
                            
                            const resultPayload = { content: [{ type: "text", text: contentText }] };
                            
                            if (name === 'get_node_tree') {
                                CACHE[cacheKey] = { timestamp: Date.now(), data: resultPayload };
                            }

                            try {
                                let resText = contentText;
                                if (resText.length > 500) resText = resText.substring(0, 500) + '...[truncated:超长响应已截断]';
                                Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                    time: new Date().toLocaleTimeString(),
                                    type: (!res || res.error) ? 'err' : 'res',
                                    content: `[${name}]\nResult: ${resText}`
                                });
                            } catch (e) {}

                            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: resultPayload }));
                        } catch (err: any) {
                            try {
                                Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-inspector-bridge:mcp-log', {
                                    time: new Date().toLocaleTimeString(),
                                    type: 'err',
                                    content: `[${name}]\nError: ${err.message}`
                                });
                            } catch (e) {}
                            ws.send(JSON.stringify({
                                jsonrpc: "2.0",
                                id: reqId,
                                result: { content: [{ type: "text", text: `Execution failed: ${err.message}` }] }
                            }));
                        }
                    }
                } catch(e) {}
            });
        });
        } catch(err: any) {
            onStatusChange({ active: false, port: _port, error: err.message || 'Unknown error' });
        }
    };

    tryListen();

    return { 
        close: () => {
            if (_wss) {
                try { _wss.close(); } catch(e) {}
                _wss = null;
            }
        } 
    };
}
