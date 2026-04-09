import WebSocket from 'ws';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupTools } from './tools';
import { setupResources } from './resources';
// import { setupPrompts } from './prompts';

const server = new Server(
    {
        name: "cocos-inspector-bridge",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {},
            resources: {},
            // prompts: {},
        },
    }
);

let _activePort: number | null = null;

export function setActiveInstance(port: number) {
    _activePort = port;
}

export function getActiveInstance(): number | null {
    return _activePort;
}

export async function scanActiveInstances(startPort = 4456, endPort = 4556): Promise<any[]> {
    const promises: Promise<any>[] = [];
    for (let p = startPort; p <= endPort; p++) {
        promises.push(new Promise((resolve) => {
            let isDone = false;
            const ws = new WebSocket(`ws://localhost:${p}`);
            const timer = setTimeout(() => {
                if (!isDone) { isDone = true; try { ws.close(); } catch(e){} resolve(null); }
            }, 600);

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'ping' }));
            });
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'pong') {
                        isDone = true;
                        clearTimeout(timer);
                        try { ws.close(); } catch(e){}
                        resolve({ port: p, projectName: msg.projectName, projectPath: msg.projectPath });
                    }
                } catch(e) {}
            });
            ws.on('error', () => {
                if (!isDone) { isDone = true; clearTimeout(timer); resolve(null); }
            });
        }));
    }
    
    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
}

// 通过短连接发送请求给 WebSocket
async function sendRpcToCocos(methodName: string, args: any = {}): Promise<any> {
    if (!_activePort && methodName !== 'ping') {
        const instances = await scanActiveInstances();
        if (instances.length > 1) {
            throw new Error(`[拦截] 检测到多个运行中的游戏项目实例，请先调用 set_active_instance 指定目标工程的端口。\n当前存活实例为:\n${instances.map(i => `- 端口 ${i.port} | 项目 [${i.projectName}] (${i.projectPath})`).join('\n')}`);
        } else if (instances.length === 1) {
            _activePort = instances[0].port;
        } else {
            throw new Error("未能找到任何运行中且挂载了 mcp-inspector-bridge 的 Cocos Creator 项目（已扫描端口 4456-4556未能发现）。");
        }
    }
    
    const targetPort = _activePort || 4456;

    return new Promise((resolve, reject) => {
        let isDone = false;
        const reqId = Date.now().toString();
        const ws = new WebSocket(`ws://localhost:${targetPort}`);

        const timeout = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                try { ws.close(); } catch(e) {}
                reject(new Error(`Timeout: Cocos Bridge at port ${targetPort} does not respond in time.`));
            }
        }, 5000);

        ws.on('open', () => {
            if (methodName === 'ping') {
                ws.send(JSON.stringify({ type: 'ping', id: reqId }));
            } else {
                ws.send(JSON.stringify({ 
                    jsonrpc: "2.0",
                    method: 'tools/call', 
                    params: { name: methodName, args }, 
                    id: reqId 
                }));
            }
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (methodName === 'ping') {
                    if (msg.type === 'pong') {
                        isDone = true;
                        clearTimeout(timeout);
                        try { ws.close(); } catch(e){}
                        resolve(msg); // Return the full pong object which now contains projectName
                    }
                } else {
                    // For JSON-RPC response from main.ts
                    if (msg.id === reqId && msg.jsonrpc === "2.0") {
                        isDone = true;
                        clearTimeout(timeout);
                        try { ws.close(); } catch(e){}
                        resolve(msg.result);
                    }
                }
            } catch (e: any) {
                // Ignore parsing errors of other broadcasts
            }
        });

        ws.on('error', (err: any) => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeout);
                // 解除可能由由于目标游戏异常退出导致的死锁
                if (err.code === 'ECONNREFUSED') {
                    _activePort = null;
                }
                reject(err);
            }
        });
    });
}

setupTools(server, sendRpcToCocos);
setupResources(server, sendRpcToCocos);
// setupPrompts(server); // Uncomment when adding new prompts in the future

async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

runServer().catch(console.error);
