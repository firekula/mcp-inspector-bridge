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
                // --- 性能分析工具 (Phase 4) ---
                {
                    name: "analyze_performance",
                    description: "Analyze game performance data: FPS statistics, frame time distribution, memory usage trends, and leak detection. Returns structured data for performance diagnosis.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            timeRange: {
                                type: "number",
                                description: "Time range in seconds to analyze. Default 60, max 300.",
                                default: 60
                            },
                            includeMemory: {
                                type: "boolean",
                                description: "Include memory analysis and leak detection. Default true.",
                                default: true
                            },
                            includeFrameTimeline: {
                                type: "boolean",
                                description: "Include frame time timeline data. Default true.",
                                default: true
                            }
                        },
                        required: []
                    },
                },
                {
                    name: "get_memory_leak_report",
                    description: "Get detailed memory leak detection report with trend analysis and predictions.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "get_frame_timeline",
                    description: "Get frame time history for timeline visualization and jank analysis.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            limit: {
                                type: "number",
                                description: "Max number of frame samples to return. Default 300.",
                                default: 300
                            }
                        },
                        required: []
                    },
                },
                {
                    name: "get_memory_timeline",
                    description: "Get memory usage history timeline for trend analysis.",
                    inputSchema: { type: "object", properties: {}, required: [] },
                },
                {
                    name: "reset_performance_baseline",
                    description: "Reset performance tracking baseline for comparison measurements.",
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
                {
                    name: "refresh_preview",
                    description: "主动刷新 Cocos Creator 游戏预览窗口，使最新代码和资源在预览中生效。用于用户关闭自动刷新或预览未及时更新时调用。",
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

            // --- 性能分析工具处理 (Phase 4) ---
            if (name === "analyze_performance") {
                const timeRange = Math.min(Number(args.timeRange) || 60, 300);
                const includeMemory = args.includeMemory !== false;
                const includeFrameTimeline = args.includeFrameTimeline !== false;

                // 收集性能数据
                const perfData: any = {
                    timestamp: Date.now(),
                    timeRangeSeconds: timeRange
                };

                // 获取运行时统计
                const runtimeStats = await sendRpcToCocos('get_runtime_stats', {});
                if (runtimeStats && runtimeStats.content && runtimeStats.content[0]) {
                    try {
                        perfData.runtimeStats = JSON.parse(runtimeStats.content[0].text);
                    } catch (e) {
                        perfData.runtimeStats = runtimeStats.content[0].text;
                    }
                }

                // 获取帧时间线
                if (includeFrameTimeline) {
                    const frameData = await sendRpcToCocos('get_frame_timeline', { limit: Math.min(timeRange * 60, 600) });
                    if (frameData && frameData.content && frameData.content[0]) {
                        try {
                            perfData.frameTimeline = JSON.parse(frameData.content[0].text);
                        } catch (e) {
                            perfData.frameTimeline = frameData.content[0].text;
                        }
                    }
                }

                // 获取内存分析
                if (includeMemory) {
                    const memLeakReport = await sendRpcToCocos('get_memory_leak_report', {});
                    if (memLeakReport && memLeakReport.content && memLeakReport.content[0]) {
                        try {
                            perfData.memoryLeakReport = JSON.parse(memLeakReport.content[0].text);
                        } catch (e) {
                            perfData.memoryLeakReport = memLeakReport.content[0].text;
                        }
                    }

                    const memoryTimeline = await sendRpcToCocos('get_memory_timeline', {});
                    if (memoryTimeline && memoryTimeline.content && memoryTimeline.content[0]) {
                        try {
                            perfData.memoryTimeline = JSON.parse(memoryTimeline.content[0].text);
                        } catch (e) {
                            perfData.memoryTimeline = memoryTimeline.content[0].text;
                        }
                    }
                }

                // 生成分析摘要
                const summary = generatePerformanceSummary(perfData);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            summary,
                            data: perfData
                        }, null, 2)
                    }]
                };
            }

            if (name === "get_memory_leak_report") {
                const result = await sendRpcToCocos('get_memory_leak_report', {});
                return result;
            }

            if (name === "get_frame_timeline") {
                const limit = Math.min(Number(args.limit) || 300, 600);
                const result = await sendRpcToCocos('get_frame_timeline', { limit });
                return result;
            }

            if (name === "get_memory_timeline") {
                const result = await sendRpcToCocos('get_memory_timeline', {});
                return result;
            }

            if (name === "reset_performance_baseline") {
                const result = await sendRpcToCocos('reset_performance_baseline', {});
                return result;
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

/**
 * 生成性能分析摘要（供 LLM 快速理解）
 */
function generatePerformanceSummary(perfData: any): string {
    const lines: string[] = [];

    lines.push('## 性能分析摘要\n');

    // FPS 分析
    if (perfData.runtimeStats) {
        const stats = perfData.runtimeStats;
        if (stats.fps !== undefined) {
            lines.push(`### 帧率`);
            lines.push(`- 当前 FPS: ${stats.fps}`);
            if (stats.avgFps !== undefined) lines.push(`- 平均 FPS: ${stats.avgFps}`);
            if (stats.fps1pLow !== undefined) lines.push(`- 1% Low FPS: ${stats.fps1pLow}`);
            if (stats.fps01pLow !== undefined) lines.push(`- 0.1% Low FPS: ${stats.fps01pLow}`);

            // 帧率健康度评估
            const avgFps = stats.avgFps || stats.fps;
            if (avgFps >= 55) {
                lines.push(`- ✅ 帧率表现优秀 (≥55 FPS)`);
            } else if (avgFps >= 30) {
                lines.push(`- ⚠️ 帧率尚可，但有优化空间 (30-55 FPS)`);
            } else {
                lines.push(`- 🚨 帧率过低，需要优化 (<30 FPS)`);
            }
        }

        // 渲染统计
        lines.push(`\n### 渲染`);
        if (stats.drawCall !== undefined) lines.push(`- DrawCall: ${stats.drawCall}`);
        if (stats.logicTime !== undefined) lines.push(`- 逻辑耗时: ${stats.logicTime} ms`);
        if (stats.renderTime !== undefined) lines.push(`- 渲染耗时: ${stats.renderTime} ms`);
        if (stats.gpuTime !== undefined) lines.push(`- GPU 耗时: ${stats.gpuTime} ms`);
        if (stats.vertices !== undefined) lines.push(`- 顶点数: ${stats.vertices.toLocaleString()}`);
        if (stats.triangles !== undefined) lines.push(`- 三角形数: ${stats.triangles.toLocaleString()}`);
        if (stats.shaderSwitches !== undefined) lines.push(`- 着色器切换(每帧): ${stats.shaderSwitches}`);
        if (stats.textureBinds !== undefined) lines.push(`- 纹理绑定(每帧): ${stats.textureBinds}`);

        // 瓶颈判断
        if (stats.logicTime !== undefined && stats.renderTime !== undefined) {
            const logicRatio = stats.logicTime / (stats.logicTime + stats.renderTime);
            if (logicRatio > 0.6) {
                lines.push(`- 📌 瓶颈分析: 逻辑处理占比过高 (${(logicRatio * 100).toFixed(0)}%)，考虑优化游戏逻辑`);
            } else if (logicRatio < 0.4) {
                lines.push(`- 📌 瓶颈分析: 渲染占比过高 (${((1 - logicRatio) * 100).toFixed(0)}%)，考虑优化渲染`);
            } else {
                lines.push(`- 📌 瓶颈分析: 逻辑/渲染负载均衡`);
            }
        }

        // 内存
        lines.push(`\n### 内存`);
        if (stats.jsHeapUsed !== undefined) lines.push(`- JS Heap 已用: ${stats.jsHeapUsed} MB`);
        if (stats.jsHeapTotal !== undefined) lines.push(`- JS Heap 总量: ${stats.jsHeapTotal} MB`);
        if (stats.totalMemory !== undefined) lines.push(`- 资源内存: ${(stats.totalMemory / 1024 / 1024).toFixed(2)} MB`);
    }

    // 泄漏检测
    if (perfData.memoryLeakReport) {
        const leak = perfData.memoryLeakReport;
        lines.push(`\n### 泄漏检测`);
        if (leak.leakDetected !== undefined) {
            lines.push(`- 状态: ${leak.leakDetected ? '🚨 检测到潜在泄漏' : '✅ 内存趋势正常'}`);
        }
        if (leak.trend !== undefined) lines.push(`- 趋势: ${leak.trend}`);
        if (leak.slopeKBPerSample !== undefined) lines.push(`- 增长率: ${leak.slopeKBPerSample} KB/样本`);
        if (leak.confidence !== undefined) lines.push(`- 拟合度: ${(leak.confidence * 100).toFixed(1)}%`);
        if (leak.details) lines.push(`- ${leak.details}`);
    }

    // 帧时间分析
    if (perfData.frameTimeline && Array.isArray(perfData.frameTimeline.frameTimes)) {
        const frameTimes = perfData.frameTimeline.frameTimes;
        if (frameTimes.length > 0) {
            const sorted = [...frameTimes].sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            const jankCount = frameTimes.filter((v: number) => v > 33).length;

            lines.push(`\n### 帧时间分析`);
            lines.push(`- 样本数: ${frameTimes.length}`);
            lines.push(`- 平均帧时间: ${avg.toFixed(2)} ms`);
            lines.push(`- P95 帧时间: ${p95.toFixed(2)} ms`);
            lines.push(`- P99 帧时间: ${p99.toFixed(2)} ms`);
            lines.push(`- 卡顿帧 (>33ms): ${jankCount} (${(jankCount / frameTimes.length * 100).toFixed(1)}%)`);
        }
    }

    // 优化建议
    lines.push(`\n### 优化建议`);
    const suggestions = generateOptimizationSuggestions(perfData);
    if (suggestions.length > 0) {
        suggestions.forEach(s => lines.push(`- ${s}`));
    } else {
        lines.push(`- 性能表现良好，无需优化`);
    }

    return lines.join('\n');
}

/**
 * 生成优化建议
 */
function generateOptimizationSuggestions(perfData: any): string[] {
    const suggestions: string[] = [];

    if (perfData.runtimeStats) {
        const stats = perfData.runtimeStats;

        // FPS 低
        if (stats.fps < 30) {
            suggestions.push('🚨 **帧率过低**: 优先排查 DrawCall、节点数量、复杂计算');
        }

        // DrawCall 过高
        if (stats.drawCall > 100) {
            suggestions.push(`⚠️ **DrawCall 过高 (${stats.drawCall})**: 考虑图集合并、减少节点、使用合批`);
        }

        // 逻辑耗时高
        if (stats.logicTime > 10) {
            suggestions.push(`⚠️ **逻辑耗时高 (${stats.logicTime}ms)**: 检查 update 循环、物理计算、复杂算法`);
        }

        // 渲染耗时高
        if (stats.renderTime > 10) {
            suggestions.push(`⚠️ **渲染耗时高 (${stats.renderTime}ms)**: 检查特效、粒子、阴影、后处理`);
        }

        // Shader 切换频繁
        if (stats.shaderSwitches > 30) {
            suggestions.push(`💡 **着色器切换频繁 (${stats.shaderSwitches} 次/帧)**: 尝试材质合并、排序渲染`);
        }

        // 顶点数过多
        if (stats.vertices > 100000) {
            suggestions.push(`💡 **顶点数过多 (${stats.vertices.toLocaleString()})**: 考虑 LOD、网格简化、遮挡剔除`);
        }

        // JS Heap 使用率高
        if (stats.jsHeapUsed && stats.jsHeapTotal) {
            const usage = stats.jsHeapUsed / stats.jsHeapTotal;
            if (usage > 0.8) {
                suggestions.push(`🚨 **JS Heap 使用率过高 (${(usage * 100).toFixed(0)}%)**: 检查内存泄漏、及时释放资源`);
            }
        }
    }

    // 泄漏检测
    if (perfData.memoryLeakReport && perfData.memoryLeakReport.leakDetected) {
        suggestions.push('🚨 **内存泄漏风险**: 使用 heap snapshot 对比定位泄漏对象');
    }

    // 帧时间抖动大
    if (perfData.frameTimeline && Array.isArray(perfData.frameTimeline.frameTimes)) {
        const frameTimes = perfData.frameTimeline.frameTimes;
        const jankCount = frameTimes.filter((v: number) => v > 33).length;
        if (jankCount > frameTimes.length * 0.1) {
            suggestions.push(`⚠️ **卡顿频繁 (${jankCount} 帧)**: 检查 GC、异步加载、物理碰撞`);
        }
    }

    return suggestions;
}
