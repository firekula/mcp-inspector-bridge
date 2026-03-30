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
            
            // 极值存储器，寿命贯穿探针全程
            const memExtrema = {};

            window.__mcpGetMemoryRanking = function() {
                const eng = window.cc;
                if (!eng || !eng.assetManager || !eng.assetManager.assets) return null;
                
                const assets = eng.assetManager.assets;
                const bundles = eng.assetManager.bundles; // Map<string, Bundle> (2.4+)
                
                const globalResources = [];
                const bundleDataMap = {}; 
                const ownerMap = {}; // texture uuid -> list of parent asset names

                // Pass 1: 建立纹理归属反向映射表
                if (assets.forEach) {
                    assets.forEach((asset, auuid) => {
                        if (!asset) return;
                        try {
                            if ((asset.constructor && asset.constructor.name === 'SpriteFrame') || (eng.SpriteFrame && asset instanceof eng.SpriteFrame)) {
                                let tex = asset._texture;
                                if (!tex && typeof asset.getTexture === 'function') tex = asset.getTexture();
                                if (tex) {
                                    let tid = tex._uuid || tex.id || tex._id;
                                    if (tid) {
                                        if (!ownerMap[tid]) ownerMap[tid] = [];
                                        let sName = asset.name || asset._name;
                                        if (sName && sName !== 'Unnamed' && sName.indexOf(auuid.substring(0,8)) === -1 && ownerMap[tid].indexOf(sName) === -1) {
                                            ownerMap[tid].push(sName);
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    });
                }
                
                // 1. 初始化存在的 bundle 容器
                if (bundles && bundles.forEach) {
                    bundles.forEach((bundle, name) => {
                        bundleDataMap[name] = { name: name, currentMemory: 0, resources: [] };
                    });
                } else if (bundles) {
                    // Fallback for older maps or undefined
                    for (let name in bundles) {
                        if (typeof bundles[name] === 'object') {
                            bundleDataMap[name] = { name: name, currentMemory: 0, resources: [] };
                        }
                    }
                }
                
                // 虚拟兜底区
                bundleDataMap['[Internal/Global]'] = { name: '[Internal/Global]', currentMemory: 0, resources: [] };
                
                // 辅助函数，粗略或精确的计算单个资源的内存字节数
                function getAssetSize(asset) {
                    if (!asset) return 0;
                    // 若有原生标记则非常准确
                    if (asset._nativeSize !== undefined) return asset._nativeSize;
                    if (asset._nativeAsset && asset._nativeAsset.byteLength) return asset._nativeAsset.byteLength;
                    
                    let cName = '';
                    if (asset.__classname__) {
                        cName = asset.__classname__;
                    } else if (eng.js && typeof eng.js.getClassName === 'function') {
                        cName = eng.js.getClassName(asset) || '';
                    }
                    const typeStr = cName || (asset.constructor ? asset.constructor.name : 'Unknown');
                    
                    if (typeStr.indexOf('Texture2D') !== -1 || (eng.Texture2D && asset instanceof eng.Texture2D)) {
                        const w = asset.width || 0;
                        const h = asset.height || 0;
                        let bpp = 4; // 默认 rgba8888 估算
                        return w * h * bpp;
                    }
                    if ((typeStr.indexOf('AudioClip') !== -1 || (eng.AudioClip && asset instanceof eng.AudioClip)) && asset._duration) {
                        // 预估 128kbps 的音频在解压时的体积 (简单粗暴的下限预估)
                        return Math.floor(asset._duration * 128 * 1024 / 8); 
                    }
                    if (typeStr.indexOf('SpriteFrame') !== -1 || (eng.SpriteFrame && asset instanceof eng.SpriteFrame)) {
                        // 引用类资源，其巨大内存本身落在依存的 Texture(图集) 上，切勿重复累积大片 Bytes 导致虚高
                        return 128; // 元数据占位
                    }
                    if (typeStr.indexOf('Skeleton') !== -1 || (eng.sp && eng.sp.SkeletonData && asset instanceof eng.sp.SkeletonData)) {
                        return 2048; // JSON 骨骼点及拓扑
                    }
                    return 512; // 其他微型资源：Prefab/Material/Effect 等
                }
                
                // 2. 遍历所有存活 asset
                if (assets.forEach) {
                    assets.forEach((asset, uuid) => {
                        if (!asset) return;
                        
                        let typeName = (asset.constructor && asset.constructor.name) || (asset.__classname__) || 'Asset';
                        // cc.js.getClassName 更好
                        if (eng.js && typeof eng.js.getClassName === 'function') {
                            const cName = eng.js.getClassName(asset);
                            if (cName) typeName = cName;
                        }
                        
                        // 优先寻找它的 Bundle 归属与原生构建路径 (大幅降低大批 Unnamed 现象)
                        let foundBundle = false;
                        let bNameTarget = '[Internal/Global]';
                        let bundleInfoPath = '';

                        if (bundles && bundles.forEach) {
                            bundles.forEach((bundle, bName) => {
                                if (!foundBundle && bundle.getAssetInfo) {
                                    const info = bundle.getAssetInfo(uuid);
                                    if (info) {
                                        foundBundle = true;
                                        bNameTarget = bName;
                                        if (info.path) {
                                            const parts = info.path.split(/[\/\\]/);
                                            bundleInfoPath = parts[parts.length - 1];
                                        }
                                    }
                                }
                            });
                        }
                        
                        // 多级名称回落策略与污染判定
                        function isUselessName(n, u) {
                            if (!n) return true;
                            if (n === 'Unnamed' || n === 'Unknown') return true;
                            const shortU = u.substring(0, 8);
                            // 包含了原资产 UUID 截断序列的名称往往是引擎底层生成的临时无意义名
                            if (n.indexOf(shortU) !== -1) return true; 
                            if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(n)) return true;
                            return false;
                        }

                        let name = bundleInfoPath;
                        if (isUselessName(name, uuid)) name = asset.name || asset._name;
                        if (isUselessName(name, uuid)) {
                            if (asset.nativeUrl) {
                                const urlParts = String(asset.nativeUrl).split(/[\/\\]/);
                                name = urlParts[urlParts.length - 1]; // 通常是 xxxxxxxx.png，但可能被上方的 shortU 拦下来
                            }
                        }
                        
                        // 依然无意义？使用反向扫描探测到的拥有者名字 (针对依附对象提取)
                        if (isUselessName(name, uuid) && ownerMap[uuid] && ownerMap[uuid].length > 0) {
                            name = '[Tex] ' + ownerMap[uuid][0]; // 借用父层名字
                        }
                        
                        if (isUselessName(name, uuid)) {
                            name = '[Unnamed] ' + uuid.substring(0, 8);
                        }

                        const refCount = asset.refCount || 0;
                        const size = getAssetSize(asset);
                        
                        const resItem = {
                            id: uuid,
                            name: name,
                            type: typeName,
                            memory: size,
                            refCount: refCount
                        };
                        
                        if (bundleDataMap[bNameTarget]) {
                            bundleDataMap[bNameTarget].resources.push(resItem);
                            bundleDataMap[bNameTarget].currentMemory += size;
                        }
                    });
                }
                
                // 3. 构建返回列表、排序，并更新极值记录
                const resultList = [];
                const allRes = []; 
                
                for (let bName in bundleDataMap) {
                    const block = bundleDataMap[bName];
                    
                    if (!memExtrema[bName]) {
                        memExtrema[bName] = { max: block.currentMemory, min: block.currentMemory };
                    } else {
                        // Min 处理：因为初始化或全空期间可能是0，碰到真实有效波谷时才拉低
                        if (memExtrema[bName].min === 0 && block.currentMemory > 0) {
                            memExtrema[bName].min = block.currentMemory;
                        } else if (block.currentMemory < memExtrema[bName].min && block.currentMemory > 0) {
                            memExtrema[bName].min = block.currentMemory;
                        }
                        // Max 无脑上抬
                        if (block.currentMemory > memExtrema[bName].max) {
                            memExtrema[bName].max = block.currentMemory;
                        }
                    }
                    
                    block.maxMemory = memExtrema[bName].max;
                    block.minMemory = memExtrema[bName].min;
                    block.resourceCount = block.resources.length;
                    
                    // Bundle 内部局部倒序
                    block.resources.sort((a,b) => b.memory - a.memory);
                    
                    // 收集汇总
                    for(let i=0; i<block.resources.length; i++){
                        allRes.push(block.resources[i]);
                    }
                    
                    resultList.push(block);
                }
                
                // 全景榜单倒序
                allRes.sort((a,b) => b.memory - a.memory);
                
                return {
                    bundles: resultList,
                    allResources: allRes
                };
            };
            
            // ==========================================
            // [Phase 3: 渲染合批探测器]
            // ==========================================
            window.__mcpRenderDebuggerHook = {
                _isActive: false,
                _originBatcherAddQuad: null,
                _originPushRenderCommand: null,
                _lastPushedNodeName: "Unknown Node",
                _lastQuadInfo: null,

                // --- Frame Snapshot Data ---
                _frames: [],
                _maxFrames: 5,
                _currentFrame: null,
                _isCaptureEnabled: true,
                _originMainLoop: null,
                _originBatcherFlush: null,
                _originDeviceDraw: null,
                _lastSnapshotSendTime: 0,
                
                // --- 画面重绘回放 ---
                _replayLimit: -1,
                _currentReplayDrawCallCount: 0,
                _requestCaptureThisFrame: false,
                _pendingCommands: [], // 收集发往下一个 DrawCall 的 Command 详情

                stepToDrawCall: function(limitIndex: number, frameSnapshotData: any) {
                    this._replayLimit = limitIndex;
                    this._requestCaptureThisFrame = true;
                    // 尝试促使引擎渲染
                    const eng = window.cc || window.editorEngine;
                    if (eng && eng.director && eng.director.isPaused()) {
                        // 强制触发一次绘制以便我们能捕获
                        eng.director.mainLoop(eng.director._deltaTime);
                    }
                },

                injectHooks: function() {
                    const self = this;
                    if (self._isActive) return;

                    let eng: any = null;
                    try {
                        const frm = document.getElementById('GameDiv') as HTMLIFrameElement;
                        if (frm && frm.contentWindow && (frm.contentWindow as any).cc) {
                            eng = (frm.contentWindow as any).cc;
                        }
                    } catch (e) {}
                    if (!eng) eng = window.cc;

                    if (!eng || !eng.RenderComponent) {
                        console.warn("[RenderDebugger] 初始化失败：未找到 cc.RenderComponent");
                        return;
                    }

                    // Cocos 2.4 引擎真实拼写错误：_checkBacth 而非 _checkBatch
                    const methodName = typeof eng.RenderComponent.prototype._checkBacth === 'function' ? '_checkBacth' : '_checkBatch';

                    if (typeof eng.RenderComponent.prototype[methodName] !== 'function') {
                        console.warn(`[RenderDebugger] 无法定位合批检测函数：${methodName}() 不存在`);
                        return;
                    }

                    if (!self._originCheckBatch) {
                        self._originCheckBatch = eng.RenderComponent.prototype[methodName];
                    }

                    eng.RenderComponent.prototype[methodName] = function(batcher: any, cullingMask: number) {
                        if (self._isActive && batcher) {
                            try {
                                const newMaterial = this._materials && this._materials.length > 0 ? this._materials[0] : null;
                                if (newMaterial && batcher.material) {
                                    const newHash = newMaterial.getHash();
                                    const oldHash = batcher.material.getHash();

                                    if (newHash !== oldHash || batcher.cullingMask !== cullingMask) {
                                            if (batcher.material.name !== 'default-material' && batcher.node && batcher.node !== batcher._dummyNode) {
                                                const diffs = [];
                                                if (newMaterial.name !== batcher.material.name) {
                                                    diffs.push(`材质实例不同 [${batcher.material.name} -> ${newMaterial.name}]`);
                                                } else if (newHash !== oldHash) {
                                                    diffs.push(`材质内部参数变动 (疑似纹理或合批未开)`);
                                                }
                                                if (batcher.cullingMask !== cullingMask) {
                                                    diffs.push(`Culling Mask 变动 [${batcher.cullingMask} -> ${cullingMask}]`);
                                                }
                                                
                                                const culpritNode = this.node;
                                                const victimNode = batcher.node;

                                                const culpritName = culpritNode ? culpritNode.name : 'Unknown';
                                                const victimName = victimNode ? victimNode.name : 'Unknown';
                                                const culpritId = culpritNode ? (culpritNode.uuid || culpritNode.id || '') : '';
                                                const victimId = victimNode ? (victimNode.uuid || victimNode.id || '') : '';

                                                // 完全静默原生控制台，废弃控制台警告直出时代的过渡代码：
                                                // console.warn(\`[RenderDebugger] 🚫 <合批被迫中断> ...\`);

                                                // 阶段一改造：增加前缀 JSON 以向外广播
                                                const payload = {
                                                    type: 'render-debugger:batch-break',
                                                    data: {
                                                        culprit: culpritName,
                                                        culpritId: culpritId,
                                                        victim: victimName,
                                                        victimId: victimId,
                                                        reasons: diffs
                                                    }
                                                };
                                                
                                                // [真正静默模式]：寻找宿主 IPC 专线投递避免污染 Console
                                                if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                                    window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                                } else {
                                                    console.debug(`[RenderDebugger]JSON_DATA:${JSON.stringify(payload)}`);
                                                }
                                            }
                                    }
                                }
                            } catch (e) {}

                            // [Phase 4] 收集参与当前正在合批的渲染指令参数
                            if (self._isCaptureEnabled && self._currentFrame) {
                                let mat = this._materials && this._materials.length > 0 ? this._materials[0] : null;
                                let matHash = mat ? mat.getHash() : 'N/A';
                                let bSrc = mat ? mat.getProperty('blendSrc') : undefined;
                                let bDst = mat ? mat.getProperty('blendDst') : undefined;

                                self._pendingCommands.push({
                                    id: self._pendingCommands.length,
                                    type: this.__classname__ || this.constructor.name || 'Component',
                                    name: this.node ? this.node.name : 'Unknown',
                                    nodeUuid: this.node ? (this.node.uuid || this.node.id) : '',
                                    materialHash: matHash,
                                    blendSrc: bSrc,
                                    blendDst: bDst
                                });
                            }
                        }
                        return self._originCheckBatch.call(this, batcher, cullingMask);
                    };

                    // --- 1. mainLoop 钩子 (帧起始/结束) ---
                    if (!self._originMainLoop && eng.Director && eng.Director.prototype.mainLoop) {
                        self._originMainLoop = eng.Director.prototype.mainLoop;
                        eng.Director.prototype.mainLoop = function(dt: number) {
                            self._currentReplayDrawCallCount = 0; // 起始重置计数

                            if (self._isActive && self._isCaptureEnabled) {
                                self._currentFrame = {
                                    frameId: eng.director.getTotalFrames(),
                                    timestamp: performance.now(),
                                    drawCalls: [],
                                    totalQuads: 0,
                                    totalVertices: 0,
                                    totalDrawCalls: 0
                                };
                                self._pendingCommands = [];
                            }
                            
                            self._originMainLoop.call(this, dt);
                            
                            // 回读截屏 (在原本渲染循环刚完毕尚未交换走 Buffer 时提取)
                            if (self._requestCaptureThisFrame) {
                                self._requestCaptureThisFrame = false;
                                try {
                                    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
                                    if (canvas) {
                                        const base64 = canvas.toDataURL('image/jpeg', 0.8);
                                        const payload = {
                                            type: 'render-debugger:replay-result',
                                            data: base64
                                        };
                                        if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                            window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                        }
                                    }
                                } catch (err) {
                                    console.error("[RenderDebugger] 画布回读失败: ", err);
                                }
                            }

                            if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                self._frames.push(self._currentFrame);
                                if (self._frames.length > self._maxFrames) {
                                    self._frames.shift();
                                }

                                // 节流发送快照 (500ms 一次)
                                const now = performance.now();
                                if (!self._lastSnapshotSendTime || now - self._lastSnapshotSendTime > 500) {
                                    self._lastSnapshotSendTime = now;
                                    const payload = {
                                        type: 'render-debugger:snapshot',
                                        data: self._currentFrame
                                    };
                                    if (window.__mcpInspector && window.__mcpInspector.sendRenderDebuggerPayload) {
                                        window.__mcpInspector.sendRenderDebuggerPayload(payload);
                                    } else {
                                        // 兼容降级模式，由宿主主动拦截 console
                                        console.debug(`[RenderDebugger]JSON_DATA:${JSON.stringify(payload)}`);
                                    }
                                }

                                self._currentFrame = null;
                            }
                        };
                    }

                    // 废弃对 pushRenderCommand 的旧版本粗粒度拦截（因为我们现在要在 draw 阶段与 checkBacth 中精确挂载 commands）
                    /*
                    if (!self._originPushRenderCommand && eng.renderer) {
                        self._originPushRenderCommand = eng.renderer.pushRenderCommand;
                        eng.renderer.pushRenderCommand = function(cmd: any) {
                            if (self._originPushRenderCommand) {
                                return self._originPushRenderCommand.call(this, cmd);
                            }
                        };
                    }
                    */

                    // --- 3. flush 和 draw 钩子 (最终 DrawCall) ---
                    if (eng.renderer && eng.renderer._batcher) {
                        if (!self._originBatcherFlush) {
                            self._originBatcherFlush = eng.renderer._batcher.flush;
                            eng.renderer._batcher.flush = function() {
                                if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                    // flush前可以插入拦截逻辑
                                }
                                if (self._originBatcherFlush) {
                                    return self._originBatcherFlush.call(this);
                                }
                            };
                        }
                    }
                    
                    if (eng.gfx && eng.gfx.Device) {
                        if (!self._originDeviceDraw) {
                            self._originDeviceDraw = eng.gfx.Device.prototype.draw;
                            eng.gfx.Device.prototype.draw = function(primitiveType: number, indicesStart: number, indicesCount: number) {
                                
                                // 限制回放阶段的超量渲染
                                if (self._replayLimit !== -1) {
                                    if (self._currentReplayDrawCallCount > self._replayLimit) {
                                        self._currentReplayDrawCallCount++;
                                        return; // 跨阶物理抛弃渲染指令
                                    }
                                }

                                if (self._isActive && self._isCaptureEnabled && self._currentFrame) {
                                    self._currentFrame.drawCalls.push({
                                        id: self._currentFrame.drawCalls.length,
                                        type: 'draw',
                                        primitiveType: primitiveType,
                                        indiceCount: indicesCount,
                                        vertexCount: Math.floor(indicesCount / 1.5), // 粗略估算四边形的顶点数
                                        timestamp: performance.now(),
                                        commands: self._pendingCommands
                                    });
                                    self._pendingCommands = []; // 消费完毕
                                    self._currentFrame.totalDrawCalls++;
                                }

                                self._currentReplayDrawCallCount++;

                                if (self._originDeviceDraw) {
                                    return self._originDeviceDraw.call(this, primitiveType, indicesStart, indicesCount);
                                }
                            };
                        }
                    }

                    self._isActive = true;
                    console.log("[RenderDebugger] MVP 探针已成功注入游戏内渲染管线 ✅");
                },

                restoreHooks: function() {
                    const self = this;
                    if (!self._isActive) return;

                    let eng: any = null;
                    try {
                        const frm = document.getElementById('GameDiv') as HTMLIFrameElement;
                        if (frm && frm.contentWindow && (frm.contentWindow as any).cc) {
                            eng = (frm.contentWindow as any).cc;
                        }
                    } catch (e) {}
                    
                    if (!eng) {
                        eng = window.cc;
                    }

                    if (eng && eng.RenderComponent && self._originCheckBatch) {
                        const methodName = typeof eng.RenderComponent.prototype._checkBacth === 'function' ? '_checkBacth' : '_checkBatch';
                        eng.RenderComponent.prototype[methodName] = self._originCheckBatch;
                    }
                    if (self._originMainLoop && eng.Director) {
                        eng.Director.prototype.mainLoop = self._originMainLoop;
                        self._originMainLoop = null;
                    }
                    if (self._originPushRenderCommand && eng.renderer) {
                        eng.renderer.pushRenderCommand = self._originPushRenderCommand;
                        self._originPushRenderCommand = null;
                    }
                    if (self._originBatcherFlush && eng.renderer && eng.renderer._batcher) {
                        eng.renderer._batcher.flush = self._originBatcherFlush;
                        self._originBatcherFlush = null;
                    }
                    if (self._originDeviceDraw && eng.gfx && eng.gfx.Device) {
                        eng.gfx.Device.prototype.draw = self._originDeviceDraw;
                        self._originDeviceDraw = null;
                    }
                    
                    self._lastQuadInfo = null;
                    self._frames = [];
                    self._currentFrame = null;
                    self._isActive = false;
                    self._replayLimit = -1;
                    self._currentReplayDrawCallCount = 0;
                    self._pendingCommands = [];
                    console.log("[RenderDebugger] MVP 探针已安全撤出，游戏内归还原生管线 🛑");
                }
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
