const { defineComponent, ref, onMounted, onUnmounted, watch, computed, toRefs } = require('vue');

/**
 * 帧时间波形图组件
 * 使用 Canvas 2D 渲染帧时间历史曲线，支持：
 * - 60fps / 30fps 参考线
 * - 卡顿帧（>33ms）红色高亮
 * - 实时刷新动画
 * - 自动缩放 Y 轴
 */
export const FrameTimeline = defineComponent({
    name: 'FrameTimeline',
    props: {
        frameTimes: {
            type: Array,
            default: () => []
        },
        width: {
            type: Number,
            default: 600
        },
        height: {
            type: Number,
            default: 180
        }
    },
    setup(props: any) {
        const { frameTimes, width, height } = toRefs(props);

        const canvasRef = ref(null as any);
        let animationId: any = null;

        // 统计信息
        const stats = computed(() => {
            const arr = frameTimes.value as number[];
            if (!arr || arr.length === 0) {
                return { avg: 0, min: 0, max: 0, p95: 0, p99: 0, jankCount: 0, total: 0 };
            }
            const sorted = [...arr].sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];
            const p99 = sorted[Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1)];
            // 卡顿帧：超过 33ms (30fps 以下)
            const jankCount = arr.filter(v => v > 33).length;
            return {
                avg: Math.round(avg * 10) / 10,
                min: Math.round(min * 10) / 10,
                max: Math.round(max * 10) / 10,
                p95: Math.round(p95 * 10) / 10,
                p99: Math.round(p99 * 10) / 10,
                jankCount,
                total: arr.length
            };
        });

        const drawChart = () => {
            const canvas = canvasRef.value;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const w = width.value;
            const h = height.value;
            const arr = frameTimes.value as number[];

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
                ctx.fillText('等待帧数据...', w / 2, h / 2);
                return;
            }

            const padding = { top: 15, bottom: 25, left: 40, right: 10 };
            const chartW = w - padding.left - padding.right;
            const chartH = h - padding.top - padding.bottom;

            // Y 轴范围：自适应或固定 0-100ms
            const maxTime = Math.max(...arr, 50); // 至少 50ms 范围
            const yMin = 0;
            const yMax = Math.ceil(maxTime / 10) * 10;

            // 绘制网格和参考线
            const drawLine = (yValue: number, color: string, lineWidth: number, dash: number[]) => {
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
                ctx.fillText(yValue.toFixed(0) + 'ms', padding.left - 5, y + 3);
            };

            // 网格线（每 20ms）
            for (let y = 0; y <= yMax; y += 20) {
                drawLine(y, '#333', 1, [2, 4]);
            }

            // 60fps 参考线 (16.7ms)
            drawLine(16.7, '#4caf50', 1.5, [5, 5]);
            // 30fps 参考线 (33.3ms)
            drawLine(33.3, '#ff9800', 1.5, [5, 5]);

            // 绘制帧时间曲线
            const stepX = chartW / Math.max(arr.length - 1, 1);

            // 填充区域
            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top + chartH);
            for (let i = 0; i < arr.length; i++) {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH * (1 - (arr[i] - yMin) / (yMax - yMin));
                ctx.lineTo(x, y);
            }
            ctx.lineTo(padding.left + (arr.length - 1) * stepX, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
            ctx.fill();

            // 绘制折线
            ctx.beginPath();
            for (let i = 0; i < arr.length; i++) {
                const x = padding.left + i * stepX;
                const y = padding.top + chartH * (1 - (arr[i] - yMin) / (yMax - yMin));
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.strokeStyle = '#2196f3';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 高亮卡顿帧点（>33ms）
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] > 33) {
                    const x = padding.left + i * stepX;
                    const y = padding.top + chartH * (1 - (arr[i] - yMin) / (yMax - yMin));
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = '#f44336';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // X 轴标签
            ctx.fillStyle = '#888';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${arr.length} 帧`, w / 2, h - 8);
            ctx.textAlign = 'left';
            ctx.fillText('← 最旧', padding.left, h - 8);
            ctx.textAlign = 'right';
            ctx.fillText('最新 →', w - padding.right, h - 8);
        };

        // 重绘循环
        let lastDataLen = 0;
        const animate = () => {
            const arr = frameTimes.value as number[];
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

        watch(frameTimes, () => {
            drawChart();
        }, { deep: true });

        return {
            canvasRef,
            stats
        };
    },
    template: `
        <div class="frame-timeline-wrap">
            <div class="frame-timeline-stats">
                <div class="stat-item">
                    <span class="stat-label">样本</span>
                    <span class="stat-value">{{ stats.total }}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">平均</span>
                    <span class="stat-value">{{ stats.avg }} ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">最低</span>
                    <span class="stat-value">{{ stats.min }} ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">最高</span>
                    <span class="stat-value" :style="{ color: stats.max > 33 ? '#f44336' : '#4caf50' }">{{ stats.max }} ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">P95</span>
                    <span class="stat-value">{{ stats.p95 }} ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">P99</span>
                    <span class="stat-value">{{ stats.p99 }} ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">卡顿帧</span>
                    <span class="stat-value" :style="{ color: stats.jankCount > 0 ? '#f44336' : '#4caf50' }">{{ stats.jankCount }}</span>
                </div>
            </div>
            <canvas ref="canvasRef" class="frame-timeline-canvas"></canvas>
        </div>
    `
});
