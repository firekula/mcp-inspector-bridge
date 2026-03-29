// @ts-nocheck
(function () {
    // 幂等性防护：防止 webview 刷新后探针被重复注入导致定时器累积
    if (window.__mcpProbeInitialized) {
        return;
    }
    
    // 注册向外部供血的全局 API 对象
    window.__mcpCrawler = {

        findNodeByUuid: function (uuid, root) {
            const eng = window.cc;
            if (!eng || !eng.director) return null;
            const startNode = root || eng.director.getScene();
            if (!startNode) return null;
            if (startNode.uuid === uuid || startNode.id === uuid) return startNode;
            for (let i = 0; i < startNode.childrenCount; i++) {
                const found = this.findNodeByUuid(uuid, startNode.children[i]);
                if (found) return found;
            }
            return null;
        },
        getNodeDetail: function (uuid) {
            const node = this.findNodeByUuid(uuid);
            if (!node) return null;
            const detail = {
                id: node.uuid || node.id,
                name: node.name,
                active: node.active !== false,
                x: node.x || 0,
                y: node.y || 0,
                rotation: ('angle' in node) ? -node.angle : (node.rotation || 0),
                scaleX: node.scaleX || 1,
                scaleY: node.scaleY || 1,
                width: node.width || 0,
                height: node.height || 0,
                anchorX: node.anchorX !== undefined ? node.anchorX : 0.5,
                anchorY: node.anchorY !== undefined ? node.anchorY : 0.5,
                components: [],
            };
            
            if (node._components) {
                for (let i = 0; i < node._components.length; i++) {
                    const comp = node._components[i];
                    let cname = comp.name || comp.__classname__ || "UnknownComponent";
                    const match = cname.match(/<([^>]+)>/);
                    if (match) cname = match[1];
                    const props = [];
                    
                    let propKeys = [];
                    if (comp.constructor && Array.isArray(comp.constructor.__props__)) {
                        propKeys = comp.constructor.__props__;
                    } else {
                        propKeys = Object.keys(comp);
                    }
                    
                    const hiddenBuiltins = ["name","uuid","node","enabled","enabledInHierarchy","_scriptAsset","__scriptAsset","_isOnLoadCalled","_objFlags"];
                    
                    for (let j = 0; j < propKeys.length; j++) {
                        const key = propKeys[j];
                        try {
                            if (hiddenBuiltins.indexOf(key) !== -1) continue;
                            
                            let isVisible = true;
                            if (comp.constructor && comp.constructor.__attrs__) {
                                const visibleAttr = comp.constructor.__attrs__[key + "|visible"];
                                if (visibleAttr !== undefined) {
                                    isVisible = typeof visibleAttr === "function" ? !!visibleAttr.call(comp) : !!visibleAttr;
                                } else if (key.startsWith("_")) {
                                    isVisible = false;
                                }
                            } else if (key.startsWith("_")) {
                                isVisible = false;
                            }
                            if (!isVisible) continue;
                            
                            const val = comp[key];
                            if (typeof val === "function") continue;
                            
                            let type = "unsupported";
                            let exportValue = val;
                            if (val === null || val === undefined) type = "unsupported";
                            else if (typeof val === "number") type = "number";
                            else if (typeof val === "string") type = "string";
                            else if (typeof val === "boolean") type = "boolean";
                            else if (Array.isArray(val)) {
                                type = "array";
                                exportValue = val.map((item) => {
                                    if (item === null) return "null";
                                    if (item === undefined) return "undefined";
                                    if (typeof item === "number" || typeof item === "string" || typeof item === "boolean") return item;
                                    if (item.__classname__ || item.name) return `[${item.__classname__ || "对象"}] ${item.name || ""}`;
                                    return "[复杂对象]";
                                });
                            }
                            else if (typeof val === "object") {
                                const eng = window.cc;
                                if (eng && eng.Node && val instanceof eng.Node) {
                                    type = "node_ref";
                                    exportValue = { uuid: val.uuid || val.id, name: val.name };
                                } else if (eng && eng.Asset && val instanceof eng.Asset) {
                                    type = "asset_ref";
                                    let clsName = "cc.Asset";
                                    if (val.__classname__) clsName = val.__classname__;
                                    else if (val.constructor && val.constructor.name) clsName = val.constructor.name;
                                    exportValue = { uuid: val._uuid || val.uuid || val.id || "unknown", name: val.name || "Unnamed Asset", className: clsName };
                                }
                            }
                            
                            if (type !== "unsupported") {
                                let enumList = null;
                                if (cname === "sp.Skeleton" || cname === "Skeleton") {
                                    if ((key === "animation" || key === "defaultAnimation") && comp.skeletonData) {
                                        try {
                                            const rd = comp.skeletonData.getRuntimeData();
                                            if (rd && rd.animations) enumList = ["<None>"].concat(rd.animations.map((a) => a.name));
                                        } catch (e) {}
                                    } else if (key === "defaultSkin" && comp.skeletonData) {
                                        try {
                                            const rd = comp.skeletonData.getRuntimeData();
                                            if (rd && rd.skins) enumList = rd.skins.map((s) => s.name);
                                        } catch (e) {}
                                    }
                                }
                                const propData = { key, value: exportValue, type };
                                if (enumList) propData.enumList = enumList;
                                props.push(propData);
                            }
                        } catch (e) { }
                    }
                    detail.components.push({
                        name: cname,
                        realIndex: i,
                        enabled: comp.enabled !== false,
                        properties: props,
                    });
                }
            }
            return detail;
        }
    };



    const DEBUG_INTERVAL = 1000;
    
    function initProbe() {
        try {
            if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene()) {
                setTimeout(initProbe, 500);
                return;
            }
            
            
            // 通知中控面板握手完成
            window.__mcpInspector.sendHandshake({
                version: cc.ENGINE_VERSION,
                isNative: cc.sys.isNative,
                isMobile: cc.sys.isMobile,
                language: cc.sys.language
            });

            // 定期提取节点树 (可优化为脏检测机制，此处暂以 interval 替代)
            setInterval(syncNodeTree, DEBUG_INTERVAL);

            // 标记探针已初始化完成，防止重复注入
            window.__mcpProbeInitialized = true;
            
            // ==========================================
            // [Phase 2.5: 跨越黑盒引擎 Hook] 提取真实 Logic/Render
            // ==========================================
            let lastFrames = cc.director.getTotalFrames();
            let lastTime = Date.now();
            let currentFps = 0;

            // 维护一个平滑窗口计算毫秒数
            let accumulatedLogicTime = 0;
            let accumulatedRenderTime = 0;
            let logicFrames = 0;
            let renderFrames = 0;
            
            let logicStart = 0;
            let renderStart = 0;
            
            // 实时逻辑消耗窃听器
            cc.director.on(cc.Director.EVENT_BEFORE_UPDATE, () => {
                logicStart = performance.now();
            });
            cc.director.on(cc.Director.EVENT_AFTER_UPDATE, () => {
                accumulatedLogicTime += (performance.now() - logicStart);
                logicFrames++;
            });
            
            // 实时渲染消耗窃听器
            cc.director.on(cc.Director.EVENT_BEFORE_DRAW, () => {
                renderStart = performance.now();
            });
            cc.director.on(cc.Director.EVENT_AFTER_DRAW, () => {
                accumulatedRenderTime += (performance.now() - renderStart);
                renderFrames++;
            });

            // 缓存给主进程轮询拿的变量
            let displayLogicTime = 0;
            let displayRenderTime = 0;

            setInterval(() => {
                const now = Date.now();
                const frames = cc.director.getTotalFrames();
                const dt = (now - lastTime) / 1000;
                if (dt > 0) {
                    currentFps = Math.max(0, Math.round((frames - lastFrames) / dt));
                }
                lastTime = now;
                lastFrames = frames;
                
                // 平滑计算平均耗时，保留 2 位小数
                displayLogicTime = logicFrames > 0 ? Number((accumulatedLogicTime / logicFrames).toFixed(2)) : 0;
                displayRenderTime = renderFrames > 0 ? Number((accumulatedRenderTime / renderFrames).toFixed(2)) : 0;
                
                // 重置累加器
                accumulatedLogicTime = 0;
                logicFrames = 0;
                accumulatedRenderTime = 0;
                renderFrames = 0;

            }, 500); // 也是 500ms，和 FPS 一起刷新平滑

            window.__mcpProfilerTick = function() {
                // 读取 DrawCall: 它是单帧即时数据，可以直接拿 renderer 的
                let drawCall = 0;

                try {
                    if (cc.renderer && typeof cc.renderer.drawCalls !== 'undefined') {
                        drawCall = cc.renderer.drawCalls;
                    } else if (cc.profiler_stats) {
                        drawCall = cc.profiler_stats.drawCall || 0;
                    }
                } catch(e) {}

                return {
                    fps: currentFps,
                    drawCall: drawCall,
                    logicTime: displayLogicTime,
                    renderTime: displayRenderTime
                };
            };
            
        } catch (err) {
            console.error('[Probe] 初始化探针发生致命异常:', err);
            const envData = {
                url: window.location.href,
                hasCC: typeof cc !== 'undefined',
                error: err.message || err.toString(),
                stack: err.stack
            };
            if (window.__mcpInspector && window.__mcpInspector.sendLog) {
                window.__mcpInspector.sendLog('[Probe Crash] ' + JSON.stringify(envData));
            }
        }
    }
    
    function syncNodeTree() {
        const scene = cc.director.getScene();
        if (!scene) return;
        
        const treeData = serializeNode(scene, 0);
        const pauseStatus = (typeof cc.game !== 'undefined' && cc.game.isPaused) ? cc.game.isPaused() : false;
        window.__mcpInspector.updateTree(JSON.stringify({ tree: treeData, isPaused: pauseStatus }));
    }
    
    function serializeNode(node, currentPrefabDepth = 0) {
        if (!node) return null;
        let isActive = true;
        let isActiveInHierarchy = true;
        let isScene = false;
        
        // 彻底规避 cc.Scene 会在 getter 内部直接用 cc.error 打印日志的问题
        // 无论是否包裹在 catch 中，只要触发 getter 都会有红字报错
        if (typeof cc !== 'undefined' && node instanceof cc.Scene) {
            isActive = true;
            isActiveInHierarchy = true;
            isScene = true;
        } else {
            try {
                isActive = node.active !== false;
                isActiveInHierarchy = node.activeInHierarchy !== false;
            } catch (e) {}
        }
        
        let isPrefab = !!node._prefab;
        let prefabRoot = isPrefab && node._prefab.root === node;
        let nextPrefabDepth = currentPrefabDepth;
        if (prefabRoot) {
            nextPrefabDepth++;
        }

        const componentNames = [];
        if (node._components) {
            for (let k = 0; k < node._components.length; k++) {
                const comp = node._components[k];
                let cClass = comp.name || (comp.constructor ? comp.constructor.name : '');
                if (typeof cc !== 'undefined' && cc.js && typeof cc.js.getClassName === 'function') {
                    const cName = cc.js.getClassName(comp);
                    if (cName) cClass = cName;
                }
                if (cClass) {
                    const m = cClass.match(/<(.+)>/);
                    componentNames.push(m ? m[1] : cClass);
                }
            }
        }

        const data = {
            id: node.uuid || node.id,
            name: node.name,
            active: isActive,
            activeInHierarchy: isActiveInHierarchy,
            childrenCount: node.childrenCount || 0,
            components: node._components ? node._components.length : 0,
            componentNames: componentNames,
            children: [],
            isScene: isScene,
            isPrefab: isPrefab,
            prefabRoot: prefabRoot,
            prefabDepth: nextPrefabDepth
        };
        
        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                const childData = serializeNode(node.children[i], nextPrefabDepth);
                if (childData) {
                    data.children.push(childData);
                }
            }
        }
        return data;
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initProbe();
    } else {
        window.addEventListener('DOMContentLoaded', initProbe);
    }
})();
