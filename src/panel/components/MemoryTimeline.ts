const { defineComponent, ref, onMounted, onUnmounted, watch, computed, toRefs } = require('vue');

/**
 * 内存时间轴组件
 * 使用 Canvas 2D 渲染内存使用趋势曲线，支持：
 * - JS Heap Used / Total 双线
 * - 资源内存曲线
 * - 泄漏检测状态指示
 * - 历史极值统计
 */
export const MemoryTimeline = defineComponent({
    name: 'MemoryTimeline',
    props: {
        memoryHistory: {
            type: Array,
            default: () => []
        },
        leakDetection: {
            type: Object,
            default: () => ({ leakDetected: false, confidence: 0, trend: 'stable', slopeKBPerSample: 0, rSquared: 0, sampleCount: 0, details: '' })
        },
        width: {
            type: Number,
            default: 600
        },
        height: {
            type: Number,
            default: 200
        }
    },
    setup(props: any) {
        const { memoryHistory, leakDetection, width, height } = toRefs(props);

        const canvasRef = ref(null as any);
        let animationId: any = null;

        // 统计信息
        const stats = computed(() => {
            const arr = memoryHistory.value as Array<{ time: number; jsHeapUsed: number; jsHeapTotal: number; totalMemory: number }>;
            if (!arr || arr.length === 0) {
                return {
                    currentJsHeapUsed: 0,
                    currentJsHeapTotal: 0,
                    currentTotalMemory: 0,
                    maxJsHeapUsed: 0,
                    maxTotalMemory: 0,
                    minJsHeapUsed: 0,
                    avgJsHeapUsed: 0,
                    samples: 0
                };
            }

            const jsHeapUsedValues = arr.map(s => s.jsHeapUsed);
            const totalMemoryValues = arr.map(s => s.totalMemory);

            return {
                currentJsHeapUsed: arr[arr.length - 1].jsHeapUsed,
                currentJsHeapTotal: arr[arr.length - 1].jsHeapTotal,
                currentTotalMemory: arr[arr.length - 1].totalMemory,
                maxJsHeapUsed: Math.max(...jsHeapUsedValues),
                maxTotalMemory: Math.max(...totalMemoryValues),
                minJsHeapUsed: Math.min(...jsHeapUsedValues),
                avgJsHeapUsed: jsHeapUsedValues.reduce((s, v) => s + v, 0) / jsHeapUsedValues.length,
                samples: arr.length
            };
        });

        // 格式化字节
        const formatBytes = (bytes: number) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const drawChart = () => {
            const canvas = canvasRef.value;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const w = width.value;
            const h = height.value;
            const arr = memoryHistory.value as Array<{ time: number; jsHeapUsed: number; jsHeapTotal: number; totalMemory: number }>;

            // 设置 Canvas 高分屏
            const dpr = window.devicePixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.scale(dpr, dpr);

            // 背景
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, w, h);

            if (!arr || arr.length === 0) {
                ctx.fillStyle = '#666';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('等待内存采样数据...', w / 2, h / 2);
                return;
            }

            const padding = { top: 20, bottom: 30, left: 60, right: 10 };
            const chartW = w - padding.left - padding.right;
            const chartH = h - padding.top - padding.bottom;

            // 计算 Y 轴范围（自动缩放到 MB）
            const allValues = arr.flatMap(s => [s.jsHeapUsed, s.jsHeapTotal, s.totalMemory]);
            const maxValue = Math.max(...allValues);
            const yMin = 0;
            const yMax = Math.ceil(maxValue / (1024 * 1024)) * 1024 * 1024; // 对齐到 MB

            // 绘制网格
            const drawGridLine = (yValue: number, color: string, lineWidth: number, dash: number[]) => {
                const y = padding.top + chartH * (1 - (yValue - yMin) / (yMax - yMin));
                ctx.beginPath();
                ctx.setLineDash(dash);
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.moveTo(padding.left, y);
                ctx.lineTo(w - padding.right, y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Y 轴标签
                ctx.fillStyle = color;
                ctx.font = '10px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(formatBytes(yValue), padding.left - 5, y + 3);
            };

            // 网格线（每 25%）
            for (let i = 0; i <= 4; i++) {
                const yValue = yMax * i / 4;
                drawGridLine(yValue, '#333', 1, [2, 4]);
            }

            // 绘制填充区域（JS Heap Used）
            const stepX = chartW / Math.max(arr.length - 1, 1);

            // JS Heap Used 填充
            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top + chartH);
            for (let i = 0; i < arr.length; i++) {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH * (1 - (arr[i].jsHeapUsed - yMin) / (yMax - yMin));
                ctx.lineTo(x, y);
            }
            ctx.lineTo(padding.left + (arr.length - 1) * stepX, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(33, 150, 243, 0.15)';
            ctx.fill();

            // JS Heap Total 线
            ctx.beginPath();
            for (let i = 0; i < arr.length; i++) {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH * (1 - (arr[i].jsHeapTotal - yMin) / (yMax - yMin));
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.strokeStyle = '#9c27b0';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // JS Heap Used 线
            ctx.beginPath();
            for (let i = 0; i < arr.length; i++) {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH * (1 - (arr[i].jsHeapUsed - yMin) / (yMax - yMin));
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.strokeStyle = '#2196f3';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 资源内存线（橙色）
            if (arr.some(s => s.totalMemory > 0)) {
                ctx.beginPath();
                for (let i = 0; i < arr.length; i++) {
                    const x = padding.left + i * stepX;
                    const y = padding.top + chartH * (1 - (arr[i].totalMemory - yMin) / (yMax - yMin));
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.strokeStyle = '#ff9800';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // 图例
            const legendY = 12;
            const legendItems = [
                { color: '#2196f3', label: 'JS Heap Used' },
                { color: '#9c27b0', label: 'JS Heap Total' },
                { color: '#ff9800', label: '资源内存' }
            ];

            ctx.font = '10px sans-serif';
            let legendX = padding.left;
            legendItems.forEach(item => {
                ctx.fillStyle = item.color;
                ctx.fillRect(legendX, legendY - 4, 12, 8);
                ctx.fillStyle = '#ccc';
                ctx.textAlign = 'left';
                ctx.fillText(item.label, legendX + 15, legendY);
                legendX += ctx.measureText(item.label).width + 30;
            });

            // X 轴标签
            ctx.fillStyle = '#888';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${arr.length} 样本`, w / 2, h - 8);
            ctx.textAlign = 'left';
            ctx.fillText('← 最旧', padding.left, h - 8);
            ctx.textAlign = 'right';
            ctx.fillText('最新 →', w - padding.right, h - 8);
        };

        // 重绘循环
        let lastDataLen = 0;
        const animate = () => {
            const arr = memoryHistory.value as Array<any>;
            if (arr && arr.length !== lastDataLen) {
                drawChart();
                lastDataLen = arr.length;
            }
            animationId = requestAnimationFrame(animate);
        };

        onMounted(() => {
            drawChart();
            animationId = requestAnimationFrame(animate);
        });

        onUnmounted(() => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        });

        watch(memoryHistory, () => {
            drawChart();
        }, { deep: true });

        return {
            canvasRef,
            stats,
            formatBytes
        };
    },
    template: `
        <div class="memory-timeline-wrap">
            <!-- 泄漏检测状态 -->
            <div class="leak-detection-panel" :style="{ borderColor: leakDetection.leakDetected ? '#f44336' : '#4caf50' }">
                <div class="leak-status">
                    <span class="leak-icon">{{ leakDetection.leakDetected ? '🚨' : '✅' }}</span>
                    <span class="leak-text" :style="{ color: leakDetection.leakDetected ? '#f44336' : '#4caf50' }">
                        {{ leakDetection.leakDetected ? '检测到潜在内存泄漏' : '内存趋势正常' }}
                    </span>
                </div>
                <div class="leak-details">
                    <span class="leak-item">趋势: {{ leakDetection.trend === 'increasing' ? '📈 增长' : leakDetection.trend === 'decreasing' ? '📉 下降' : '➡️ 稳定' }}</span>
                    <span class="leak-item">增长率: {{ leakDetection.slopeKBPerSample }} KB/样本</span>
                    <span class="leak-item">拟合度: {{ (leakDetection.confidence * 100).toFixed(1) }}%</span>
                </div>
            </div>

            <!-- 统计面板 -->
            <div class="memory-timeline-stats">
                <div class="stat-item">
                    <span class="stat-label">当前 JS Heap</span>
                    <span class="stat-value">{{ formatBytes(stats.currentJsHeapUsed) }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">JS Heap 上限</span>
                    <span class="stat-value">{{ formatBytes(stats.currentJsHeapTotal) }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">资源内存</span>
                    <span class="stat-value">{{ formatBytes(stats.currentTotalMemory) }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">JS Heap 峰值</span>
                    <span class="stat-value" style="color: #ff9800;">{{ formatBytes(stats.maxJsHeapUsed) }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">资源内存峰值</span>
                    <span class="stat-value" style="color: #ff9800;">{{ formatBytes(stats.maxTotalMemory) }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">采样数</span>
                    <span class="stat-value">{{ stats.samples }}</span>
                </div>
            </div>

            <!-- Canvas 图表 -->
            <canvas ref="canvasRef" class="memory-timeline-canvas"></canvas>
        </div>
    `
});
