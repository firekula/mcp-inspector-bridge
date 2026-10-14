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
    let isWebGLHooked = false;
    let isPhysicsHooked = false;

    // WebGL 统计计数器（每帧重置）
    let frameShaderSwitches = 0;
    let frameTextureBinds = 0;
    let frameVertices = 0;
    let frameTriangles = 0;
    let frameDrawCalls = 0;

    // 着色器切换详情记录
    const shaderSwitchDetails: Map<any, { count: number, lastUsed: number, id: number }> = new Map();
    // 纹理绑定详情记录
    const textureBindDetails: Map<any, { count: number, lastUsed: number, size: string, id: number }> = new Map();
    // 自增 ID 计数器
    let shaderIdCounter = 0;
    let textureIdCounter = 0;
    // WebGL 上下文引用（用于查询信息）
    let cachedGL: any = null;

    // 资源关联映射：WebGL 纹理对象 -> Cocos 资源信息
    const textureToAssetMap: Map<any, { uuid: string, name: string, type: string }> = new Map();
    // 着色器关联映射：WebGL Program -> Material/Effect 信息
    const shaderToAssetMap: Map<any, { uuid: string, name: string, type: string }> = new Map();
    // 名称映射：用于显示
    const textureNameMap: Map<number, { name: string, uuid: string, type: string }> = new Map();
    const shaderNameMap: Map<number, { name: string, uuid: string, type: string }> = new Map();

    // 构建资源关联映射 - 改进版本
    function buildAssetMapping() {
        const ccEng = getCcEngine();
        if (!ccEng || !ccEng.assetManager || !ccEng.assetManager.assets) return;

        try {
            // 遍历所有纹理资源，尝试多种方式获取底层 WebGL 纹理
            ccEng.assetManager.assets.forEach((asset: any, uuid: string) => {
                if (!asset) return;

                const isTexture = asset instanceof ccEng.Texture2D ||
                    (asset.constructor && asset.constructor.name === 'Texture2D');

                if (isTexture) {
                    const name = asset.name || 'Unnamed';

                    // 深度遍历查找 WebGL 纹理对象
                    const findWebGLTexture = (obj: any, depth: number = 0): any => {
                        if (!obj || depth > 3) return null;

                        // 检查是否是 WebGL 纹理对象
                        if (obj.constructor && obj.constructor.name === 'WebGLTexture') {
                            return obj;
                        }

                        // 检查常见属性
                        const props = ['_texture', '_webglObj', '_glTexture', '_glID', 'texture', '_impl', 'impl'];
                        for (const prop of props) {
                            if (obj[prop]) {
                                const result = findWebGLTexture(obj[prop], depth + 1);
                                if (result) return result;
                            }
                        }

                        // 检查 gfx 纹理对象的 _glTexture
                        if (obj._glTexture !== undefined) {
                            return obj._glTexture;
                        }

                        return null;
                    };

                    const webglTexture = findWebGLTexture(asset);
                    if (webglTexture) {
                        textureToAssetMap.set(webglTexture, {
                            uuid: uuid,
                            name: name,
                            type: 'Texture2D'
                        });
                    }

                    // 也记录到名称映射，用于调试
                    if (asset._nativeAsset) {
                        // 有些纹理有原生资源引用
                        const nativeAsset = asset._nativeAsset;
                        if (nativeAsset && nativeAsset.__uuid) {
                            // 记录 UUID 关联
                        }
                    }
                }

                // 关联 SpriteFrame 的纹理
                const isSpriteFrame = asset instanceof ccEng.SpriteFrame ||
                    (asset.constructor && asset.constructor.name === 'SpriteFrame');

                if (isSpriteFrame) {
                    const name = asset.name || 'Unnamed';
                    const tex = asset._texture || (asset.getTexture && asset.getTexture());
                    if (tex) {
                        const findWebGLTexture = (obj: any, depth: number = 0): any => {
                            if (!obj || depth > 3) return null;
                            if (obj.constructor && obj.constructor.name === 'WebGLTexture') {
                                return obj;
                            }
                            const props = ['_texture', '_webglObj', '_glTexture', '_glID', 'texture', '_impl', 'impl'];
                            for (const prop of props) {
                                if (obj[prop]) {
                                    const result = findWebGLTexture(obj[prop], depth + 1);
                                    if (result) return result;
                                }
                            }
                            return null;
                        };

                        const webglTexture = findWebGLTexture(tex);
                        if (webglTexture) {
                            textureToAssetMap.set(webglTexture, {
                                uuid: uuid,
                                name: name,
                                type: 'SpriteFrame'
                            });
                        }
                    }
                }
            });

            if (window.__MCP_DEBUG__) {
                console.log('[Profiler] Asset mapping built:', {
                    textures: textureToAssetMap.size,
                    shaders: shaderToAssetMap.size
                });
            }
        } catch (e) {
            if (window.__MCP_DEBUG__) {
                console.warn('[Profiler] buildAssetMapping error:', e);
            }
        }
    }

    // 每 5 秒更新一次资源映射
    setInterval(buildAssetMapping, 5000);
    // 立即构建一次
    setTimeout(buildAssetMapping, 1000);

    function tryHookWebGL() {
        if (isWebGLHooked) return;

        // 获取 WebGL 上下文（从 canvas）
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (!gl) return;

        isWebGLHooked = true;
        cachedGL = gl;

        // Hook useProgram - Shader 切换
        const originalUseProgram = gl.useProgram.bind(gl);
        gl.useProgram = function (program: any) {
            frameShaderSwitches++;
            if (program) {
                let info = shaderSwitchDetails.get(program);
                if (!info) {
                    info = { count: 0, lastUsed: 0, id: ++shaderIdCounter };
                    shaderSwitchDetails.set(program, info);
                }
                info.count++;
                info.lastUsed = Date.now();
            }
            return originalUseProgram(program);
        };

        // Hook createTexture - 追踪纹理创建
        const originalCreateTexture = gl.createTexture.bind(gl);
        gl.createTexture = function () {
            const texture = originalCreateTexture();
            if (texture) {
                // 记录创建的纹理，用于后续关联
                if (!texture.__mcpId) {
                    texture.__mcpId = ++textureIdCounter;
                }
            }
            return texture;
        };

        // Hook texImage2D - 纹理上传时建立资源关联
        const originalTexImage2D = gl.texImage2D.bind(gl);
        gl.texImage2D = function (...args: any[]) {
            // 当前绑定的纹理
            const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
            if (currentTexture && !textureToAssetMap.has(currentTexture)) {
                // 尝试从调用栈或参数推断资源来源
                // 对于 Cocos，纹理数据通常来自 Image/Canvas/Video 元素
                const source = args[5] || args[6]; // pixels 参数
                if (source) {
                    // 记录来源信息
                    const sourceInfo = {
                        uuid: '',
                        name: source.__assetName || source.src || 'Unknown',
                        type: source.constructor ? source.constructor.name : 'Unknown'
                    };
                    // 尝试关联到最近创建的资源
                    // 这里可以添加更精确的关联逻辑
                }
            }
            return originalTexImage2D.apply(gl, args);
        };

        // Hook bindTexture - 纹理绑定
        const originalBindTexture = gl.bindTexture.bind(gl);
        gl.bindTexture = function (target: number, texture: any) {
            if (texture) {
                frameTextureBinds++;
                // 确保纹理有 ID
                if (!texture.__mcpId) {
                    texture.__mcpId = ++textureIdCounter;
                }

                let info = textureBindDetails.get(texture);
                if (!info) {
                    info = { count: 0, lastUsed: 0, size: '', id: texture.__mcpId };
                    textureBindDetails.set(texture, info);
                    // 调试：记录新纹理对象
                    if (window.__MCP_DEBUG__) {
                        const isMapped = textureToAssetMap.has(texture);
                        console.log(`[Profiler] New texture bound: #${info.id}, mapped=${isMapped}`);
                    }
                }
                info.count++;
                info.lastUsed = Date.now();
                // 尝试获取纹理尺寸
                try {
                    const level = 0;
                    const width = gl.getTexLevelParameter(target, level, gl.TEXTURE_WIDTH);
                    const height = gl.getTexLevelParameter(target, level, gl.TEXTURE_HEIGHT);
                    if (width && height) info.size = `${width}x${height}`;
                } catch (e) { }
            }
            return originalBindTexture(target, texture);
        };

        // Hook drawArrays - 统计顶点和三角形
        const originalDrawArrays = gl.drawArrays.bind(gl);
        gl.drawArrays = function (mode: number, first: number, count: number) {
            frameDrawCalls++;
            frameVertices += count;
            if (mode === gl.TRIANGLES) frameTriangles += count / 3;
            else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) frameTriangles += Math.max(0, count - 2);
            return originalDrawArrays(mode, first, count);
        };

        // Hook drawElements - 统计顶点和三角形
        const originalDrawElements = gl.drawElements.bind(gl);
        gl.drawElements = function (mode: number, count: number, type: number, offset: number) {
            frameDrawCalls++;
            frameVertices += count;
            if (mode === gl.TRIANGLES) frameTriangles += count / 3;
            else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) frameTriangles += Math.max(0, count - 2);
            return originalDrawElements(mode, count, type, offset);
        };
    }

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
            // 每帧开始时重置 WebGL 统计
            frameShaderSwitches = 0;
            frameTextureBinds = 0;
            frameVertices = 0;
            frameTriangles = 0;
            frameDrawCalls = 0;
        });
        ccEng.director.on(ccEng.Director.EVENT_AFTER_DRAW, () => {
            accumulatedRenderTime += (performance.now() - renderStart);
            renderFrames++;
            // 累加 WebGL 统计
            accumulatedShaderSwitches += frameShaderSwitches;
            accumulatedTextureBinds += frameTextureBinds;
            accumulatedVertices += frameVertices;
            accumulatedTriangles += frameTriangles;
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

    tryHookDirectorEvents();
    tryHookWebGL();

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
        tryHookWebGL();
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

        // JS Heap 内存 - 尝试多种方式
        if (typeof performance !== 'undefined') {
            // 方式1: performance.memory (Chrome/Electron)
            if ((performance as any).memory) {
                displayJsHeapUsed = Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024 * 100) / 100;
                displayJsHeapTotal = Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024 * 100) / 100;
            }
            // 方式2: performance.measureUserAgentSpecificMemory (需要 await，异步)
            // 方式3: process.memoryUsage (Node.js/Electron renderer)
            else if (typeof process !== 'undefined' && process.memoryUsage) {
                try {
                    const mem = process.memoryUsage();
                    displayJsHeapUsed = Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100;
                    displayJsHeapTotal = Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100;
                } catch (e) { }
            }
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
        // 读取 DrawCall: 优先从 WebGL hook 获取，回退到 renderer
        let drawCall = frameDrawCalls;
        const ccEng = getCcEngine();

        try {
            if (drawCall === 0 && ccEng && ccEng.renderer && typeof ccEng.renderer.drawCalls !== 'undefined') {
                drawCall = ccEng.renderer.drawCalls;
            }
        } catch (e) { }

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

    // 着色器与纹理绑定详情接口
    window.__mcpGetShaderTextureDetails = function () {
        // 转换 Map 为数组，按调用次数排序
        const shaders = Array.from(shaderSwitchDetails.entries())
            .map(([program, info]) => {
                // 获取关联的资源信息
                const assetInfo = shaderToAssetMap.get(program);
                let name = `Shader #${info.id}`;
                let assetUuid = '';
                let assetName = '';
                let assetType = '';

                if (assetInfo) {
                    assetUuid = assetInfo.uuid;
                    assetName = assetInfo.name;
                    assetType = assetInfo.type;
                    name = `${assetInfo.name}`;
                } else {
                    // 尝试获取着色器源码片段
                    try {
                        if (cachedGL && program) {
                            const attachedShaders = cachedGL.getAttachedShaders(program);
                            if (attachedShaders && attachedShaders.length > 0) {
                                const source = cachedGL.getShaderSource(attachedShaders[0]);
                                if (source) {
                                    const lines = source.split('\n').slice(0, 2).join(' ');
                                    name = `Shader #${info.id} [${lines.substring(0, 25)}...]`;
                                }
                            }
                        }
                    } catch (e) { }
                }

                return {
                    id: name,
                    rawId: info.id,
                    count: info.count,
                    lastUsed: info.lastUsed,
                    assetUuid: assetUuid,
                    assetName: assetName,
                    assetType: assetType
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 50);

        const textures = Array.from(textureBindDetails.entries())
            .map(([texture, info]) => {
                // 获取关联的资源信息
                const assetInfo = textureToAssetMap.get(texture);
                let name = `Texture #${info.id}`;
                let assetUuid = '';
                let assetName = '';
                let assetType = '';

                if (assetInfo) {
                    assetUuid = assetInfo.uuid;
                    assetName = assetInfo.name;
                    assetType = assetInfo.type;
                    name = assetInfo.name;
                }

                return {
                    id: name,
                    rawId: info.id,
                    count: info.count,
                    size: info.size,
                    lastUsed: info.lastUsed,
                    assetUuid: assetUuid,
                    assetName: assetName,
                    assetType: assetType
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 50);

        return {
            shaderCount: shaderSwitchDetails.size,
            textureCount: textureBindDetails.size,
            shaders,
            textures,
            summary: {
                totalShaderSwitches: Array.from(shaderSwitchDetails.values()).reduce((s, v) => s + v.count, 0),
                totalTextureBinds: Array.from(textureBindDetails.values()).reduce((s, v) => s + v.count, 0)
            }
        };
    };

    // 清空详情记录
    window.__mcpClearShaderTextureDetails = function () {
        shaderSwitchDetails.clear();
        textureBindDetails.clear();
        return { success: true };
    };

    // 帧时间历史数据接口：用于绘制帧时间波形图
    window.__mcpGetFrameTimeline = function () {
        // 返回最近的帧时间数组（ms）以及对应的统计信息
        return {
            frameTimes: [...frameDeltas],
            capacity: FRAME_TIME_WINDOW
        };
    };

    // ============ 内存时间轴与泄漏检测 ============

    // 内存历史环形缓冲区（≈5 分钟 @2s 采样一次 = 150 样本）
    const MEMORY_HISTORY_CAPACITY = 150;
    const memoryHistory: Array<{ time: number; jsHeapUsed: number; jsHeapTotal: number; totalMemory: number; nodeCount: number }> = [];

    // 泄漏检测基线：连续采样对比
    let leakDetectionBaseline: any = null;
    let leakDetectionSamples: Array<{ time: number; jsHeapUsed: number; totalMemory: number }> = [];
    const LEAK_DETECTION_WINDOW = 30; // 30 个样本用于趋势分析

    // 采样内存数据
    function sampleMemory() {
        const now = Date.now();
        let jsHeapUsed = 0;
        let jsHeapTotal = 0;

        if (typeof performance !== 'undefined' && (performance as any).memory) {
            jsHeapUsed = (performance as any).memory.usedJSHeapSize;
            jsHeapTotal = (performance as any).memory.totalJSHeapSize;
        } else if (typeof process !== 'undefined' && process.memoryUsage) {
            try {
                const mem = process.memoryUsage();
                jsHeapUsed = mem.heapUsed;
                jsHeapTotal = mem.heapTotal;
            } catch (e) { }
        }

        // 获取资源内存总量
        let totalMemory = 0;
        try {
            const ccEng = getCcEngine();
            if (ccEng && ccEng.assetManager && ccEng.assetManager.assets) {
                ccEng.assetManager.assets.forEach((asset: any, uuid: string) => {
                    if (!asset) return;
                    // 简化计算：只计算纹理和音频等大资源
                    if (asset._nativeAsset && asset._nativeAsset.byteLength) {
                        totalMemory += asset._nativeAsset.byteLength;
                    }
                });
            }
        } catch (e) { }

        const sample = {
            time: now,
            jsHeapUsed: jsHeapUsed,
            jsHeapTotal: jsHeapTotal,
            totalMemory: totalMemory,
            nodeCount: 0
        };

        memoryHistory.push(sample);
        if (memoryHistory.length > MEMORY_HISTORY_CAPACITY) {
            memoryHistory.shift();
        }

        // 泄漏检测采样
        leakDetectionSamples.push({ time: now, jsHeapUsed: jsHeapUsed, totalMemory: totalMemory });
        if (leakDetectionSamples.length > LEAK_DETECTION_WINDOW) {
            leakDetectionSamples.shift();
        }

        return sample;
    }

    // 内存历史数据接口
    window.__mcpGetMemoryTimeline = function () {
        return {
            history: [...memoryHistory],
            capacity: MEMORY_HISTORY_CAPACITY
        };
    };

    // 泄漏检测接口：基于线性回归趋势分析
    window.__mcpDetectMemoryLeak = function () {
        if (leakDetectionSamples.length < 10) {
            return { leakDetected: false, confidence: 0, trend: 'insufficient_data', details: '采样数据不足，至少需要 10 个样本' };
        }

        // 线性回归分析 jsHeapUsed 趋势
        const n = leakDetectionSamples.length;
        const xs = leakDetectionSamples.map((_, i) => i);
        const ys = leakDetectionSamples.map(s => s.jsHeapUsed);

        const sumX = xs.reduce((s, v) => s + v, 0);
        const sumY = ys.reduce((s, v) => s + v, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, v) => s + v * v, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // 计算 R² 决定系数（拟合度）
        const meanY = sumY / n;
        const ssTotal = ys.reduce((s, v) => s + (v - meanY) * (v - meanY), 0);
        const ssResidual = ys.reduce((s, y, i) => {
            const predicted = slope * xs[i] + intercept;
            return s + (y - predicted) * (y - predicted);
        }, 0);
        const rSquared = 1 - (ssResidual / ssTotal);

        // 判断是否存在泄漏
        // 条件：斜率持续为正（内存持续增长）且拟合度高
        const slopeKB = slope / 1024; // 转换为 KB/样本
        const isLeakDetected = slope > 1024 && rSquared > 0.7; // 斜率 > 1KB/样本 且 R² > 0.7

        // 趋势分类
        let trend = 'stable';
        if (Math.abs(slopeKB) > 10) {
            trend = slopeKB > 0 ? 'increasing' : 'decreasing';
        }

        // 预测未来内存使用
        const futurePredictedMB = (slope * n * 30 + intercept) / 1024 / 1024; // 30 个样本后

        return {
            leakDetected: isLeakDetected,
            confidence: Math.min(Math.max(rSquared, 0), 1),
            trend: trend,
            slopeKBPerSample: Math.round(slopeKB * 100) / 100,
            rSquared: Math.round(rSquared * 1000) / 1000,
            futurePredictedMB: Math.round(futurePredictedMB * 100) / 100,
            sampleCount: n,
            details: isLeakDetected
                ? `检测到潜在内存泄漏：每采样周期增长 ${slopeKB.toFixed(2)} KB，趋势拟合度 ${(rSquared * 100).toFixed(1)}%`
                : `内存趋势稳定，增长率 ${slopeKB.toFixed(2)} KB/样本`
        };
    };

    // 手动设置泄漏检测基线
    window.__mcpSetLeakBaseline = function () {
        leakDetectionBaseline = sampleMemory();
        leakDetectionSamples = []; // 重置采样窗口
        return { success: true, baseline: leakDetectionBaseline };
    };

    // 定时采样内存数据（每 2 秒）
    setInterval(() => {
        sampleMemory();
    }, 2000);

    // 立即采样一次
    sampleMemory();
}
