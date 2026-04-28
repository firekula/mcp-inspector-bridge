import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getActiveInstance, setActiveInstance, scanActiveInstances } from "./index";

export function setupTools(server: Server, sendRpcToCocos: (method: string, args?: any) => Promise<any>) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "ping",
                    description: "Test the connection to the Cocos Inspector Bridge",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "get_selected_node",
                    description: "Query the currently selected node's properties.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "capture_runtime_screenshot",
                    description: "Capture the real-time screen of the game, including game UI and rendering elements. Return it as an image.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                // --- 多开与通讯增强 ---
                {
                    name: "get_active_instances",
                    description: "Scan local ports (4456-4556) to find all running Cocos Creator instances and return their project paths and connection ports.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "set_active_instance",
                    description: "Manually bind the MCP client to a specific Cocos Creator instance's port. Call this before using other tools when multiple instances are running.",
                    inputSchema: { 
                        type: "object", 
                        properties: { port: { type: "number", description: "The port number of the target instance to connect to." } }, 
                        required: ["port"] 
                    },
                },
                // --- 资产与组件交互 ---
                {
                    name: "get_node_detail",
                    description: "Get detailed information about a node by UUID.",
                    inputSchema: { 
                        type: "object", 
                        properties: { uuid: { type: "string" } }, 
                        required: ["uuid"] 
                    },
                },
                {
                    name: "update_node_property",
                    description: "Update node/component properties.",
                    inputSchema: { 
                        type: "object", 
                        properties: { 
                            uuid: { type: "string" },
                            compName: { type: "string" },
                            propKey: { type: "string" },
                            value: { description: "The new value to set (can be any JSON type)" },
                            compIndex: { type: "number" }
                        }, 
                        required: ["uuid", "propKey", "value"] 
                    },
                },
                {
                    name: "get_memory_ranking",
                    description: "Get memory stats of assets.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "simulate_input",
                    description: "Simulate a touch input on a button, node, or specific coordinate.",
                    inputSchema: { 
                        type: "object", 
                        properties: { 
                            inputType: { type: "string", description: "Interaction type: 'click', 'swipe', 'long_press'", enum: ['click', 'swipe', 'long_press'] },
                            uuid: { type: "string", description: "Optional. UUID of target node." },
                            x: { type: "number", description: "Optional. Screen X coordinate to touch. If uuid is skipped, uses this." },
                            y: { type: "number", description: "Optional. Screen Y coordinate to touch." },
                            duration: { type: "number", description: "Duration in ms for long_press or swipe. Default 100." },
                            swipeDeltaX: { type: "number", description: "X offset for swipe." },
                            swipeDeltaY: { type: "number", description: "Y offset for swipe." }
                        }, 
                        required: [] 
                    },
                },
                {
                    name: "get_node_tree",
                    description: "Get the scene node tree hierarchy. To prevent context explosion, use 'depth' to limit nesting.",
                    inputSchema: { 
                        type: "object", 
                        properties: { 
                            depth: { type: "number", description: "Max depth, defaults to 3." }
                        }, 
                        required: [] 
                    },
                },
                {
                    name: "get_runtime_logs",
                    description: "Get recent runtime logs (console/game errors). Supports limiting output count.",
                    inputSchema: { 
                        type: "object", 
                        properties: { 
                            tail: { type: "number", description: "How many lines from the end to retrieve. Default and maximum is 50." },
                            level: { type: "string", description: "Filter by log level: 'all', 'error', 'warn'. Defaults to 'all'." }
                        }, 
                        required: [] 
                    },
                },
                {
                    name: "get_runtime_stats",
                    description: "Get current game runtime performance stats including FPS, DrawCall and CPU logic/render times.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "install_script",
                    description: "安装或更新用户脚本。传入完整脚本内容（含 // ==McpScript== 元数据块）。脚本将获得声明的 @grant 权限并立即启用。",
                    inputSchema: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "脚本文件名，如 my-script.user.js" },
                            code: { type: "string", description: "脚本完整内容（包含 // ==McpScript== 元数据头部）" }
                        },
                        required: ["name", "code"]
                    },
                },
                {
                    name: "enable_script",
                    description: "启用一个已安装的脚本，恢复其 MCP 工具和定时器。",
                    inputSchema: {
                        type: "object",
                        properties: { name: { type: "string", description: "脚本文件名" } },
                        required: ["name"]
                    },
                },
                {
                    name: "disable_script",
                    description: "停用一个正在运行的脚本，注销其 MCP 工具并清除定时器。",
                    inputSchema: {
                        type: "object",
                        properties: { name: { type: "string", description: "脚本文件名" } },
                        required: ["name"]
                    },
                },
                {
                    name: "list_scripts",
                    description: "列出所有已安装的用户脚本及其运行状态。",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
            ],
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name } = request.params;
        const args = request.params.arguments || {};
        try {
            if (name === "ping") {
                await sendRpcToCocos('ping');
                return { content: [{ type: "text", text: `来自 Cocos 插件的响应：pong (MCP 协议已打通，当前焦点端口: ${getActiveInstance() || '默认'})` }] };
            }
            if (name === "get_active_instances") {
                const instances = await scanActiveInstances();
                return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
            }
            if (name === "set_active_instance") {
                const port = Number(args.port);
                if (port >= 4456 && port <= 65535) {
                    setActiveInstance(port);
                    return { content: [{ type: "text", text: `焦点已切换至端口: ${port}` }] };
                }
                throw new Error(`Invalid port: ${port}`);
            }
            // For others, simply proxy to Cocos via general RPC
            const result = await sendRpcToCocos(name, args);
            if (result && result.content) {
                return { content: result.content };
            }
            return {
                isError: true,
                content: [{ type: "text", text: "Invalid response from Cocos plugin." }],
            };
        } catch (e: any) {
            let msg = e.message;
            if (msg.includes('ECONNREFUSED')) {
                msg = "无法连接到 Cocos Plugin 的底层端口，请确保相关项目在 Cocos 编辑器内已打开并且插件已正确加载！";
            }
            return {
                isError: true,
                content: [{ type: "text", text: `Tool ${name} failed: ${msg}` }],
            };
        }
    });
}
