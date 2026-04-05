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

// 通过短连接发送请求给 WebSocket (4456)
function sendRpcToCocos(methodName: string, args: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        let isDone = false;
        const reqId = Date.now().toString();
        const ws = new WebSocket('ws://localhost:4456');

        const timeout = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                ws.close();
                reject(new Error("Timeout: Cocos Bridge does not respond in time."));
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
                        ws.close();
                        resolve({ type: 'pong' });
                    }
                } else {
                    // For JSON-RPC response from main.ts
                    if (msg.id === reqId && msg.jsonrpc === "2.0") {
                        isDone = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve(msg.result);
                    }
                }
            } catch (e: any) {
                // Ignore parsing errors of other broadcasts
            }
        });

        ws.on('error', (err) => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeout);
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
