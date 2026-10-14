// @ts-nocheck
import { getCcEngine } from './engine-helper';

export function initProfiler() {
    let lastFrames = 0;
    let lastTime = Date.now();
    let currentFps = 0;

    // 维护一个平滑窗口计算毫秒数
    let accumulatedLogicTime = 0;
    let accumulatedRenderTime = 0;
    let logicFrames = 0;
    let renderFrames = 0;

    // 新增指标累加器
    let accumulatedGpuTime = 0;
    let gpuFrames = 0;
    let gpuStart = 0;

    let accumulatedShaderSwitches = 0;
    let accumulatedTextureBinds = 0;
    let accumulatedVertices = 0;
    let accumulatedTriangles = 0;
    let accumulatedPhysicsTime = 0;
    let physicsFrames = 0;
    let physicsStart = 0;

    let logicStart = 0;
    let renderStart = 0;

    // 帧时间环形缓冲区（≈10 秒窗口 @60fps），用于百分位计算
    const FRAME_TIME_WINDOW = 600;
    const frameDeltas: number[] = [];
    let lastFrameTime = 0;

    let isEventsHooked = false;
    let isRendererHooked = false;
    let isPhysicsHooked = false;

    function tryHookDirectorEvents() {
        if (isEventsHooked) return;
        const ccEng = getCcEngine();
        if (!ccEng || !ccEng.director) return;
        isEventsHooked = true;

        lastFrames = ccEng.director.getTotalFrames ? ccEng.director.getTotalFrames() : 0;

        // 实时逻辑消耗窃听器
        ccEng.director.on(ccEng.Director.EVENT_BEFORE_UPDATE, () => {
            logicStart = performance.now();
            // 记录帧间间隔
            if (lastFrameTime > 0) {
                const delta = logicStart - lastFrameTime;
                frameDeltas.push(delta);
                if (frameDeltas.length > FRAME_TIME_WINDOW) frameDeltas.shift();
            }
            lastFrameTime = logicStart;
        });
        ccEng.director.on(ccEng.Director.EVENT_AFTER_UPDATE, () => {
            accumulatedLogicTime += (performance.now() - logicStart);
            logicFrames++;
        });

        // 实时渲染消耗窃听器
        ccEng.director.on(ccEng.Director.EVENT_BEFORE_DRAW, () => {
            renderStart = performance.now();
        });
        ccEng.director.on(ccEng.Director.EVENT_AFTER_DRAW, () => {
            accumulatedRenderTime += (performance.now() - renderStart);
            renderFrames++;
        });

        // 物理步进耗时窃听器
        if (ccEng.PhysicsManager && ccEng.PhysicsManager.instance) {
            const pm = ccEng.PhysicsManager.instance;
            const originalStep = pm.step;
            pm.step = function (dt: number) {
                physicsStart = performance.now();
                const result = originalStep.apply(this, arguments);
                accumulatedPhysicsTime += (performance.now() - physicsStart);
                physicsFrames++;
                return result;
            };
            isPhysicsHooked = true;
        }
    }

    function tryHookRenderer() {
        if (isRendererHooked) return;
        const ccEng = getCcEngine();
        if (!ccEng || !ccEng.renderer) return;
        
        // 尝试 hook renderer 的关键指标
        const renderer = ccEng.renderer;
        
        // Hook drawCalls 读取时顺便采集其他统计
        // 注意：Cocos Creator 2.4 的 renderer 统计可能在不同属性下
        isRendererHooked = true;
    }

    tryHookDirectorEvents();
    tryHookRenderer();

    // 缓存给主进程轮询拿的变量
    let displayLogicTime = 0;
    let displayRenderTime = 0;
    let displayGpuTime = 0;
    let displayShaderSwitches = 0;
    let displayTextureBinds = 0;
    let displayVertices = 0;
    let displayTriangles = 0;
    let displayPhysicsTime = 0;
    let displayJsHeapUsed = 0;
    let displayJsHeapTotal = 0;

    setInterval(() => {
        tryHookDirectorEvents();
        tryHookRenderer();
        const ccEng = getCcEngine();
        if (!ccEng || !ccEng.director) return;

        const now = Date.now();
        const frames = ccEng.director.getTotalFrames ? ccEng.director.getTotalFrames() : 0;
        const dt = (now - lastTime) / 1000;
        if (dt > 0) {
            currentFps = Math.max(0, Math.round((frames - lastFrames) / dt));
        }
        lastTime = now;
        lastFrames = frames;

        // 平滑计算平均耗时，保留 2 位小数
        displayLogicTime = logicFrames > 0 ? Number((accumulatedLogicTime / logicFrames).toFixed(2)) : 0;
        displayRenderTime = renderFrames > 0 ? Number((accumulatedRenderTime / renderFrames).toFixed(2)) : 0;
        displayGpuTime = gpuFrames > 0 ? Number((accumulatedGpuTime / gpuFrames).toFixed(2)) : 0;
        displayShaderSwitches = Math.round(accumulatedShaderSwitches);
        displayTextureBinds = Math.round(accumulatedTextureBinds);
        displayVertices = Math.round(accumulatedVertices / Math.max(renderFrames, 1));
        displayTriangles = Math.round(accumulatedTriangles / Math.max(renderFrames, 1));
        displayPhysicsTime = physicsFrames > 0 ? Number((accumulatedPhysicsTime / physicsFrames).toFixed(2)) : 0;

        // JS Heap 内存
        if (typeof performance !== 'undefined' && performance.memory) {
            displayJsHeapUsed = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100; // MB
            displayJsHeapTotal = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100; // MB
        }

        // 重置累加器
        accumulatedLogicTime = 0;
        logicFrames = 0;
        accumulatedRenderTime = 0;
        renderFrames = 0;
        accumulatedGpuTime = 0;
        gpuFrames = 0;
        accumulatedShaderSwitches = 0;
        accumulatedTextureBinds = 0;
        accumulatedVertices = 0;
        accumulatedTriangles = 0;
        accumulatedPhysicsTime = 0;
        physicsFrames = 0;

    }, 500); // 也是 500ms，和 FPS 一起刷新平滑

    window.__mcpProfilerTick = function () {
        // 读取 DrawCall: 它是单帧即时数据，可以直接拿 renderer 的
        let drawCall = 0;
        let shaderSwitches = 0;
        let textureBinds = 0;
        let vertices = 0;
        let triangles = 0;
        let gpuTime = 0;
        const ccEng = getCcEngine();

        try {
            if (ccEng && ccEng.renderer) {
                const renderer = ccEng.renderer;
                if (typeof renderer.drawCalls !== 'undefined') {
                    drawCall = renderer.drawCalls;
                }
                // 尝试读取 Cocos Creator 2.4 renderer 的统计信息
                if (renderer.stats) {
                    shaderSwitches = renderer.stats.shaderSwitches || 0;
                    textureBinds = renderer.stats.textureBinds || 0;
                    vertices = renderer.stats.vertices || 0;
                    triangles = renderer.stats.triangles || 0;
                }
                if (renderer.profiler_stats) {
                    shaderSwitches = renderer.profiler_stats.shaderSwitches || shaderSwitches;
                    textureBinds = renderer.profiler_stats.textureBinds || textureBinds;
                    vertices = renderer.profiler_stats.vertices || vertices;
                    triangles = renderer.profiler_stats.triangles || triangles;
                }
                // GPU 时间（如果支持 EXT_disjoint_timer_query）
                if (renderer.device && typeof renderer.device.getTimestamp === 'function') {
                    // 这需要 WebGL2 + EXT_disjoint_timer_query 扩展
                    // 这里仅作预留，实际可用性取决于运行环境
                }
            } else if (ccEng && ccEng.profiler_stats) {
                drawCall = ccEng.profiler_stats.drawCall || 0;
                shaderSwitches = ccEng.profiler_stats.shaderSwitches || 0;
                textureBinds = ccEng.profiler_stats.textureBinds || 0;
                vertices = ccEng.profiler_stats.vertices || 0;
                triangles = ccEng.profiler_stats.triangles || 0;
            }
        } catch (e) { }

        // 累加到区间统计
        accumulatedShaderSwitches += shaderSwitches;
        accumulatedTextureBinds += textureBinds;
        accumulatedVertices += vertices;
        accumulatedTriangles += triangles;

        // 计算帧率分位统计
        let avgFps = 0, fps1pLow = 0, fps01pLow = 0;
        if (frameDeltas.length > 30) {
            const sorted = [...frameDeltas].sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            avgFps = Math.round(1000 / avg * 10) / 10;
            const idx99 = Math.min(Math.ceil(sorted.length * 0.99) - 1, sorted.length - 1);
            const idx999 = Math.min(Math.ceil(sorted.length * 0.999) - 1, sorted.length - 1);
            fps1pLow = Math.round(1000 / Math.max(sorted[idx99], 0.1));
            fps01pLow = Math.round(1000 / Math.max(sorted[idx999], 0.1));
        }

        return {
            fps: currentFps,
            avgFps: avgFps,
            fps1pLow: fps1pLow,
            fps01pLow: fps01pLow,
            drawCall: drawCall,
            logicTime: displayLogicTime,
            renderTime: displayRenderTime,
            gpuTime: displayGpuTime,
            shaderSwitches: displayShaderSwitches,
            textureBinds: displayTextureBinds,
            vertices: displayVertices,
            triangles: displayTriangles,
            physicsTime: displayPhysicsTime,
            jsHeapUsed: displayJsHeapUsed,
            jsHeapTotal: displayJsHeapTotal
        };
    };

    window.__mcpCountNodes = function () {
        const ccEng = getCcEngine();
        const scene = ccEng ? ccEng.director.getScene() : null;
        if (!scene) return 0;
        function count(node: any): number {
            let n = 1;
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    n += count(node.children[i]);
                }
            }
            return n;
        }
        return count(scene);
    };
}
