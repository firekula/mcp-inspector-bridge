import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export function setupPrompts(server: Server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
            prompts: [
                {
                    name: "analyze_performance",
                    description: "深度性能诊断：分析帧率、渲染、内存等指标，识别瓶颈并生成优化建议",
                    arguments: [
                        {
                            name: "focus",
                            description: "重点关注领域：fps（帧率）、render（渲染）、memory（内存）、all（全部）",
                            required: false
                        }
                    ]
                },
                {
                    name: "diagnose_frame_drop",
                    description: "帧率下降诊断：分析卡顿帧、定位性能瓶颈",
                    arguments: [
                        {
                            name: "timeRange",
                            description: "分析时间范围（秒），默认 60",
                            required: false
                        }
                    ]
                },
                {
                    name: "memory_leak_analysis",
                    description: "内存泄漏分析：趋势检测、泄漏定位、修复建议",
                    arguments: []
                },
                {
                    name: "optimization_suggestions",
                    description: "获取针对性优化建议：基于当前性能数据生成优化方案",
                    arguments: [
                        {
                            name: "target",
                            description: "优化目标：fps（帧率）、memory（内存）、drawcall（渲染调用）",
                            required: false
                        }
                    ]
                }
            ]
        };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        switch (name) {
            case "analyze_performance":
                const focus = (args?.focus as string) || 'all';
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `请帮我进行深度性能诊断，重点关注：${focus === 'all' ? '所有方面' : focus}。

请按以下步骤进行：
1. 调用 analyze_performance 工具获取当前性能数据
2. 分析帧率表现（FPS、1% Low、0.1% Low）
3. 分析渲染瓶颈（DrawCall、Logic/Render/GPU 耗时）
4. 分析内存使用（JS Heap、资源内存、泄漏风险）
5. 分析帧时间分布（卡顿帧、P95/P99）
6. 识别主要瓶颈并给出优先级排序
7. 生成具体可执行的优化建议

请用中文回复，使用清晰的结构和数据支撑。`
                            }
                        }
                    ]
                };

            case "diagnose_frame_drop":
                const timeRange = (args?.timeRange as string) || '60';
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `游戏出现帧率下降，请帮我诊断原因。

请执行以下操作：
1. 调用 analyze_performance（timeRange: ${timeRange}）获取性能数据
2. 调用 get_frame_timeline 获取帧时间历史
3. 分析卡顿帧分布（哪些帧超过 33ms/50ms/100ms）
4. 识别帧率下降的模式（持续性、间歇性、突发性）
5. 结合 Logic/Render/GPU 耗时判断瓶颈
6. 给出根本原因和修复建议

请重点分析：
- 是 CPU 瓶颈还是 GPU 瓶颈
- 是逻辑问题还是渲染问题
- 是否与内存/GC 相关
- 是否有特定触发条件`
                            }
                        }
                    ]
                };

            case "memory_leak_analysis":
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `请帮我分析是否存在内存泄漏。

请执行以下操作：
1. 调用 get_memory_leak_report 获取泄漏检测报告
2. 调用 analyze_performance（includeMemory: true）获取内存历史
3. 分析 JS Heap 增长趋势
4. 分析资源内存变化
5. 评估泄漏风险等级
6. 提供定位泄漏的方法（heap snapshot 对比等）
7. 给出修复建议

请特别关注：
- 内存增长率（KB/样本）
- 趋势拟合度（R²）
- 是否存在持续增长模式
- 预测未来内存使用`
                            }
                        }
                    ]
                };

            case "optimization_suggestions":
                const target = (args?.target as string) || 'all';
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `请为我提供性能优化建议，优化目标：${target === 'all' ? '整体性能' : target}。

请执行以下操作：
1. 调用 analyze_performance 获取当前性能数据
2. 分析当前性能瓶颈
3. 根据优化目标生成建议：
   - FPS 优化：逻辑优化、渲染优化、GC 优化
   - 内存优化：资源管理、对象池、及时释放
   - DrawCall 优化：图集、合批、节点精简
4. 按优先级排序建议
5. 估算优化效果

请提供：
- 具体可执行的代码示例（如适用）
- 预期性能提升
- 实施难度评估`
                            }
                        }
                    ]
                };

            default:
                throw new Error(`Prompt not found: ${name}`);
        }
    });
}
