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
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: reqId,
            result: { isError: true, content: [{ type: "text", text: "未能找到活跃的预览画面，请确认预览面板已打开。" }] }
        }));
        return;
    }

    const handleImage = (img: any) => {
        if (!img || img.isEmpty()) {
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { isError: true, content: [{ type: "text", text: "获取画面为空，可能处于后台" }] }}));
            return;
        }
        const dataUrl = img.toDataURL();
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
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
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: { isError: true, content: [{ type: "text", text: "截图异常: " + e.message }] }}));
        });
    } else if (result) {
        handleImage(result);
    }
}

export function startMcpRouter(port: number): { wss: WebSocket.Server, status: any } {
    let _wss: WebSocket.Server | null = null;
    let _mcpStatus = { active: false, port, error: 'Initializing...' };

    try {
        _wss = new WebSocket.Server({ port });
        _wss.on('connection', (ws) => {
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                        return;
                    }
                    
                    if (data.method === 'tools/call' && data.params) {
                        const name = data.params.name;
                        const args = data.params.args || {};
                        const reqId = data.id || Date.now().toString();

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

                            ws.send(JSON.stringify({ jsonrpc: "2.0", id: reqId, result: resultPayload }));
                        } catch (err: any) {
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
        _mcpStatus = { active: true, port, error: '' };
    } catch(err: any) {
        _mcpStatus = { active: false, port, error: err.message || 'Unknown error' };
    }

    return { wss: _wss!, status: _mcpStatus };
}
