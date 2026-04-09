declare const Editor: any;
import * as fs from 'fs';
import * as path from 'path';

const { createApp, ref, onMounted, watch } = require('vue');
const { NodeTree } = require('./components/NodeTree');
const { NodeInspector } = require('./components/NodeInspector');
const { RenderDebugger } = require('./components/RenderDebugger');

const templateRaw = fs.readFileSync(path.join(__dirname, '../../src/panel/index.html'), 'utf-8');
const preloadUrlResolved = 'file:///' + Editor.url('packages://mcp-inspector-bridge/dist/preload.js').replace(/\\/g, '/');
const templateStr = templateRaw.replace('PRELOAD_PLACEHOLDER', preloadUrlResolved);

const http = require('http');

const { globalState } = require('./store');
const { useLayout } = require('./composables/useLayout');
const { useTabs } = require('./composables/useTabs');
const { useGameView } = require('./composables/useGameView');
const { useDevTools } = require('./composables/useDevTools');
const { useProfiler } = require('./composables/useProfiler');
const { useNodeSystem } = require('./composables/useNodeSystem');

module.exports = Editor.Panel.extend({
    style: `
        :host { display: flex; flex-direction: column; width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    `,
    template: templateStr,

    $: {
        app: '#app',
        gameView: '#game-view'
    },

    ready() {
        const panelAppElement = this.$app;

        const app = createApp({
            components: { NodeTree, 'node-inspector': NodeInspector, 'render-debugger': RenderDebugger },
            setup() {
                const activeTab = ref(0);
                const wrapperSize = ref({ width: 0, height: 0 });

                // Vue Refs
                const gameView = ref(null);
                const devtoolsView = ref(null);
                const wrapMount = ref(null);
                const nodeTreeRef = ref(null);

                // Initialize Composables
                const layoutSystem = useLayout(globalState, wrapMount, wrapperSize);
                const tabSystem = useTabs();
                const profilerSystem = useProfiler(globalState, gameView, activeTab);
                
                const nodeSystem = useNodeSystem(globalState, gameView, nodeTreeRef, activeTab);

                const gameViewSystem = useGameView(
                    globalState, 
                    gameView, 
                    nodeTreeRef, 
                    layoutSystem.rightPanelWidth, 
                    layoutSystem.selectedResolution,
                    (payload: any, auto: boolean) => nodeSystem.onNodeSelect(payload, auto)
                );

                const devToolsSystem = useDevTools(globalState, gameView, devtoolsView, activeTab, layoutSystem.rightPanelWidth);

                const electron = require('electron');
                const savedScale = window.localStorage.getItem('mcp-ui-scale');
                if (savedScale && !isNaN(parseFloat(savedScale))) {
                    globalState.uiScale = parseFloat(savedScale);
                }
                const savedFontSize = window.localStorage.getItem('mcp-base-font-size');
                if (savedFontSize && !isNaN(parseInt(savedFontSize))) {
                    globalState.baseFontSize = parseInt(savedFontSize, 10);
                }
                const savedLayout = window.localStorage.getItem('mcp-inspector-layout');
                if (savedLayout === 'vertical' || savedLayout === 'horizontal') {
                    globalState.inspectorLayout = savedLayout;
                }

                watch(() => globalState.inspectorLayout, (newVal: string) => {
                    try {
                        window.localStorage.setItem('mcp-inspector-layout', newVal);
                    } catch(e) {}
                });

                watch(() => globalState.baseFontSize, (newVal: number) => {
                    try {
                        if (panelAppElement) panelAppElement.style.setProperty('--base-font-size', `${newVal}px`);
                        window.localStorage.setItem('mcp-base-font-size', newVal.toString());
                    } catch(e) {}
                });

                watch(() => globalState.uiScale, (newVal: number) => {
                    try {
                        if (typeof Editor !== 'undefined') {
                            Editor.log('[MCP Inspector] -> Executing scale:', newVal, '| target:', !!panelAppElement);
                        } else {
                            console.log('[MCP Inspector] -> Executing scale:', newVal, '| target:', !!panelAppElement);
                        }
                        
                        // 直接通过插件生命周期的 this.$app 句柄施加原生缩放设置，突破 Shadow DOM 与 Vue 挂载盲区。
                        if (panelAppElement) {
                            panelAppElement.style.zoom = newVal.toString();
                        }
                        window.localStorage.setItem('mcp-ui-scale', newVal.toString());

                        setTimeout(() => {
                            if (devToolsSystem.updateBrowserViewBounds) {
                                devToolsSystem.updateBrowserViewBounds();
                            }
                        }, 20);
                    } catch(e) {}
                });

                watch(activeTab, (newVal: number) => {
                    try {
                        const wv: any = gameView.value;
                        if (wv && typeof wv.executeJavaScript === 'function') {
                            wv.executeJavaScript(`
                                window.__mcpActiveTab = ${newVal};
                                if(${newVal} === 0 && window.__mcpProbeInitialized && typeof window.__mcpSyncNodeTree === 'function') {
                                    window.__mcpSyncNodeTree();
                                }
                                if(${newVal} === 2 && window.__mcpProbeInitialized && typeof window.__mcpGetEnvInfo === 'function') {
                                    if (window.__mcpInspector && window.__mcpInspector.updateEnv) window.__mcpInspector.updateEnv(JSON.stringify(window.__mcpGetEnvInfo()));
                                }
                            `).catch((e:any)=>{});
                        }
                    } catch (e) {}
                });

                onMounted(() => {
                    layoutSystem.setupResizeObserver();
                    gameViewSystem.setupGameViewListeners();
                    devToolsSystem.setupDevToolsWatchers();
                    profilerSystem.setupProfilerWatchers();
                    if (panelAppElement) {
                        panelAppElement.style.zoom = globalState.uiScale.toString();
                        panelAppElement.style.setProperty('--base-font-size', globalState.baseFontSize + 'px');
                    }
                    
                    window.addEventListener('mcp-status-changed', ((e: CustomEvent) => {
                        globalState.mcpStatus = e.detail;
                    }) as EventListener);
                    
                    if (typeof Editor !== 'undefined') {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-mcp-status', (err: any, status: any) => {
                            if (status) {
                                globalState.mcpStatus = status;
                            }
                        });
                        
                        refreshMcpClients();
                        fetchMcpPayload();
                    }
                });

                const refreshMcpClients = () => {
                    globalState.mcpScanning = true;
                    if (typeof Editor !== 'undefined') {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:mcp-scan-clients', (err: any, list: any[]) => {
                            globalState.mcpScanning = false;
                            if (!err && list) {
                                globalState.mcpClientList = list;
                            }
                        });
                    }
                };
                
                const fetchMcpPayload = () => {
                    if (typeof Editor !== 'undefined') {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:mcp-get-payload', (err: any, pl: string) => {
                            if (!err && pl) {
                                globalState.mcpPayload = pl;
                            }
                        });
                    }
                };

                let _mcpToastTimer: any = null;
                const showMcpToast = (msg: string) => {
                    globalState.mcpInjectLog = msg;
                    if (_mcpToastTimer !== null) clearTimeout(_mcpToastTimer);
                    _mcpToastTimer = setTimeout(() => {
                        globalState.mcpInjectLog = "";
                        _mcpToastTimer = null;
                    }, 1000);
                };

                const configureMcpClient = (clientId: number = -1) => {
                    globalState.mcpScanning = true;
                    if (typeof Editor !== 'undefined') {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:mcp-inject-client', clientId, (err: any, log: string) => {
                            if (err) {
                                showMcpToast("写入由于主进程故障失败: " + err.message);
                            } else {
                                showMcpToast(log);
                            }
                            // Inject完成之后由于可能更新了其它依赖状态，执行一次重新拉取
                            refreshMcpClients();
                        });
                    } else {
                        showMcpToast("请在 Cocos Editor 环境中使用。");
                        globalState.mcpScanning = false;
                    }
                };

                const copyMcpPayload = () => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(globalState.mcpPayload).then(() => {
                            showMcpToast("已复制配置文本至剪贴板。");
                        }).catch(e => {
                            showMcpToast("复制失败: " + e);
                        });
                    } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = globalState.mcpPayload;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try {
                            document.execCommand('copy');
                            showMcpToast("已复制配置文本至剪贴板(Fallback)。");
                        } catch (err: any) {
                            showMcpToast("复制失败(Fallback): " + err);
                        }
                        document.body.removeChild(textArea);
                    }
                }
                
                const copyMcpPath = (path: string) => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(path);
                    } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = path;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try { document.execCommand('copy'); } catch (err) {}
                        document.body.removeChild(textArea);
                    }
                    showMcpToast("已复制路径至剪贴板。");
                }

                const isAtlasModalOpen = ref(false);
                const isCapturingAtlas = ref(false);
                const atlasImages = ref([] as string[]);
                const selectedAtlasIndex = ref(0);
                const atlasZoom = ref(1);
                const atlasTranslateX = ref(0);
                const atlasTranslateY = ref(0);
                const isDraggingAtlas = ref(false);
                let lastMouseX = 0;
                let lastMouseY = 0;

                const toggleAtlasModal = () => {
                    isAtlasModalOpen.value = !isAtlasModalOpen.value;
                };

                const captureAtlases = () => {
                    if (isCapturingAtlas.value) {
                        return;
                    }
                    isCapturingAtlas.value = true;
                    showMcpToast("开始提取图集缓冲...");
                    

                    const wv: any = gameView.value;
                    if (wv && typeof wv.executeJavaScript === 'function') {
                        // WebGL texture extraction code that runs inside webview context
                        const extractCode = `
                            function __mcpExtractAtlases() {
                                try {
                                    if(!window.cc || !cc.dynamicAtlasManager) return JSON.stringify({error: "引擎对象不存在"});
                                    
                                    // Hack: We cannot access the closure variables directly.
                                    // But the engine's showDebug(true) will create a node DYNAMIC_ATLAS_DEBUG_NODE
                                    // in the scene root, which iterates the closures and creates sprites for each.
                                    cc.dynamicAtlasManager.showDebug(true);
                                    
                                    var scene = cc.director.getScene();
                                    var dbgNode = scene && scene.getChildByName("DYNAMIC_ATLAS_DEBUG_NODE");
                                    if (!dbgNode) {
                                        if (cc.dynamicAtlasManager.showDebug) cc.dynamicAtlasManager.showDebug(false);
                                        return JSON.stringify({error: "目前还没有动态图集产生"});
                                    }
                                    
                                    // find CONTENT node
                                    var content = dbgNode.getChildByName("CONTENT");
                                    if (!content && dbgNode.children.length > 0) content = dbgNode.children[0];

                                    if (!content || !content.children || content.children.length === 0) {
                                        cc.dynamicAtlasManager.showDebug(false);
                                        return JSON.stringify({error: "目前还没有动态图集产生"});
                                    }
                                    
                                    function readTexture(texture) {
                                        var gl = cc.game._renderContext;
                                        var textureImpl = texture._texture || texture.getHtmlElementObj && texture.getHtmlElementObj();
                                        if (!textureImpl) return null;
                                        
                                        var glID = textureImpl._glID || texture._glID;
                                        if (!glID) return null;

                                        var fbo = gl.createFramebuffer();
                                        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                                        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glID, 0);
                                        
                                        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
                                        if (status !== gl.FRAMEBUFFER_COMPLETE) {
                                            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                                            gl.deleteFramebuffer(fbo);
                                            return null;
                                        }

                                        var w = texture.width;
                                        var h = texture.height;
                                        var pixels = new Uint8Array(w * h * 4);
                                        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                                        gl.deleteFramebuffer(fbo);
                                        
                                        var canvas = document.createElement('canvas');
                                        canvas.width = w;
                                        canvas.height = h;
                                        var ctx = canvas.getContext('2d');
                                        if (!ctx) return null;
                                        var imgData = ctx.createImageData(w, h);
                                        imgData.data.set(pixels);
                                        ctx.putImageData(imgData, 0, 0);
                                        return canvas.toDataURL('image/jpeg', 0.85); // Compress for IPC
                                    }

                                    var results = [];
                                    for(var i = 0; i < content.children.length; i++) {
                                        var atlasNode = content.children[i];
                                        if (atlasNode && atlasNode.name === "ATLAS") {
                                            var sprite = atlasNode.getComponent(cc.Sprite);
                                            if (sprite && sprite.spriteFrame) {
                                                var tex = sprite.spriteFrame.getTexture();
                                                if (tex) {
                                                    var dataUrl = readTexture(tex);
                                                    if (dataUrl) results.push(dataUrl);
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 提取完毕，立即销毁调试节点以保持侵入零污染
                                    cc.dynamicAtlasManager.showDebug(false);
                                    
                                    if(results.length === 0) return JSON.stringify({error: "已拦截引擎DOM但底层的 WebGL 解析不可用"});
                                    return JSON.stringify(results);
                                } catch(e) {
                                    return JSON.stringify({error: "引擎内执行报错: " + e.stack});
                                }
                            }
                            __mcpExtractAtlases();
                        `;

                        let timeoutId = setTimeout(() => {
                            isCapturingAtlas.value = false;
                            if (typeof Editor !== 'undefined') Editor.log("[Bridge] 提取耗时过长，内存通讯阻塞");
                            showMcpToast("提取由于超时被中止");
                        }, 4000);

                        try {
                            const capturePromise = wv.executeJavaScript(extractCode);
                            Promise.race([capturePromise, new Promise((_, r) => setTimeout(() => r('TIMEOUT'), 3900))])
                                .then((resStr: any) => {
                                    clearTimeout(timeoutId);
                                    if (resStr === 'TIMEOUT') return; // Handled by timeoutId above
                                    
                                    isCapturingAtlas.value = false;
                                    try {
                                        const res = (typeof resStr === 'string') ? JSON.parse(resStr) : resStr;
                                        if(res && res.error) {
                                            if (typeof Editor !== 'undefined') Editor.log("[Bridge] 提取图集失败: " + res.error);
                                            showMcpToast("提取图集失败: " + res.error);
                                            return;
                                        }
                                        if(Array.isArray(res)) {
                                            if (typeof Editor !== 'undefined') Editor.log("[Bridge] 成功提取图集数量: " + res.length);
                                            atlasImages.value = res.filter(Boolean);
                                            selectedAtlasIndex.value = 0;
                                            isAtlasModalOpen.value = true;
                                        } else {
                                            if (typeof Editor !== 'undefined') Editor.log("[Bridge] 未能识别的图集数据格式: " + typeof res);
                                        }
                                    } catch (e: any) {
                                        if (typeof Editor !== 'undefined') Editor.log("[Bridge] 解析失败: " + e.message);
                                    }
                                }).catch((err: any) => {
                                    clearTimeout(timeoutId);
                                    isCapturingAtlas.value = false;
                                    if (typeof Editor !== 'undefined') Editor.log("[Bridge] Webview 注入发生底层错误: " + err);
                                });
                        } catch(syncErr: any) {
                            clearTimeout(timeoutId);
                            isCapturingAtlas.value = false;
                            if (typeof Editor !== 'undefined') Editor.log("[Bridge] executeJavaScript 同步调用崩溃: " + syncErr);
                        }
                    } else {
                        isCapturingAtlas.value = false;
                    }
                };

                const copyMcpLogs = () => {
                    const text = globalState.mcpLogs.map((l: any) => `[${l.time}] [${l.type.toUpperCase()}] ${l.content}`).join('\\n');
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(() => {
                            showMcpToast("已复制全部日志");
                        }).catch((e:any) => showMcpToast("复制日志失败: " + e));
                    } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try { document.execCommand('copy'); showMcpToast("已复制全部日志"); } catch (err) {}
                        document.body.removeChild(textArea);
                    }
                };

                return {
                    activeTab,
                    globalState,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    nodeTreeRef,
                    isAtlasModalOpen,
                    atlasImages,
                    selectedAtlasIndex,
                    isCapturingAtlas,
                    atlasZoom,
                    atlasTranslateX,
                    atlasTranslateY,
                    isDraggingAtlas,
                    toggleAtlasModal,
                    captureAtlases,
                    handleAtlasWheel: (e: WheelEvent) => {
                        const zoomSpeed = 0.1;
                        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
                        atlasZoom.value = Math.max(0.1, Math.min(atlasZoom.value + delta * atlasZoom.value, 10));
                    },
                    startDragAtlas: (e: MouseEvent) => {
                        if (e.button === 0 || e.button === 1) { // 左键或中键拖拽
                            isDraggingAtlas.value = true;
                            lastMouseX = e.clientX;
                            lastMouseY = e.clientY;
                        }
                    },
                    onDragAtlas: (e: MouseEvent) => {
                        if (!isDraggingAtlas.value) return;
                        atlasTranslateX.value += (e.clientX - lastMouseX);
                        atlasTranslateY.value += (e.clientY - lastMouseY);
                        lastMouseX = e.clientX;
                        lastMouseY = e.clientY;
                    },
                    endDragAtlas: () => {
                        isDraggingAtlas.value = false;
                    },
                    resetAtlasView: () => {
                        atlasZoom.value = 1;
                        atlasTranslateX.value = 0;
                        atlasTranslateY.value = 0;
                    },
                    selectAtlas: (idx: number) => {
                        selectedAtlasIndex.value = idx;
                        atlasZoom.value = 1;
                        atlasTranslateX.value = 0;
                        atlasTranslateY.value = 0;
                    },
                    onAtlasImageLoad: (e: Event) => {
                        const img = e.target as HTMLImageElement;
                        const container = img.parentElement?.parentElement;
                        if (container && img.naturalWidth && img.naturalHeight) {
                            const padding = 40; // 20px edge padding
                            const scaleX = (container.clientWidth - padding) / img.naturalWidth;
                            const scaleY = (container.clientHeight - padding) / img.naturalHeight;
                            const fitScale = Math.min(scaleX, scaleY, 1);
                            
                            atlasZoom.value = fitScale;
                        }
                    },

                    refreshMcpClients,
                    configureMcpClient,
                    copyMcpPayload,
                    copyMcpPath,
                    copyMcpLogs,
                    
                    ...layoutSystem,
                    ...tabSystem,
                    ...gameViewSystem,
                    ...devToolsSystem,
                    ...profilerSystem,
                    ...nodeSystem
                };
            }
        });

        app.mount(this.$app);
    },

    messages: {
        'mcp-query-selected-node'(this: any, event: any, reqId: string) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if (!wv) {
                if (event.reply) event.reply(null, { reqId, error: "Game view not found" });
                return;
            }
            const code = `
                (function(){
                    if(!window.__mcpHighlightData || !window.__mcpHighlightData.selectId) return null;
                    if(!window.__mcpCrawler || typeof window.__mcpCrawler.getSimplifiedNode !== 'function') return null;
                    return JSON.stringify(window.__mcpCrawler.getSimplifiedNode(window.__mcpHighlightData.selectId));
                })();
            `;
            try {
                const promise = wv.executeJavaScript(code);
                if (promise && promise.then) {
                    promise.then((res: any) => {
                        if (event.reply) event.reply(null, { reqId, result: res ? JSON.parse(res) : null });
                    }).catch((e: any) => {
                        if (event.reply) event.reply(null, { reqId, error: "Execution failed: " + e.message });
                    });
                }
            } catch (e: any) {}
        },
        'mcp-query-node-detail'(this: any, event: any, args: any) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
            const code = `
                (function(){
                    try {
                        if(!window.__mcpCrawler) return JSON.stringify({ error: 'Crawler not injected' });
                        var n = window.__mcpCrawler.findNodeByUuid('${args.uuid}');
                        if(!n) return JSON.stringify({ error: 'NODE_NOT_FOUND', msg: 'Node destroyed or not found' });
                        return JSON.stringify(window.__mcpCrawler.getNodeDetail('${args.uuid}'));
                    } catch(e) { return JSON.stringify({ error: 'EXECUTION_FAILED', msg: e.message }); }
                })();
            `;
            wv.executeJavaScript(code).then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); }).catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'mcp-update-property'(this: any, event: any, args: any) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
            const code = `
                (function(){
                    try {
                        if(!window.__mcpCrawler) return JSON.stringify({ error: 'Crawler not injected' });
                        var n = window.__mcpCrawler.findNodeByUuid('${args.uuid}');
                        if(!n) return JSON.stringify({ error: 'NODE_NOT_FOUND', msg: 'Node destroyed or not found' });
                        var ok = window.__mcpCrawler.updateNodeProperty('${args.uuid}', '${args.compName || "null"}', '${args.propKey}', ${JSON.stringify(args.value)}, ${args.compIndex ?? -1});
                        return JSON.stringify({ success: ok });
                    } catch(e) { return JSON.stringify({ error: 'EXECUTION_FAILED', msg: e.message }); }
                })();
            `;
            wv.executeJavaScript(code).then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); }).catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'mcp-simulate-input'(this: any, event: any, args: any) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
            const code = `
                (function(){
                    try {
                        if(!window.__mcpCrawler) return JSON.stringify({ error: 'Crawler not injected' });
                        if(typeof window.__mcpCrawler.simulateInput !== 'function') return JSON.stringify({ error: 'simulateInput not implemented in probe' });
                        return JSON.stringify(window.__mcpCrawler.simulateInput(${JSON.stringify(args)}));
                    } catch(e) { return JSON.stringify({ error: 'EXECUTION_FAILED', msg: e.message }); }
                })();
            `;
            wv.executeJavaScript(code).then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); }).catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'mcp-query-memory'(this: any, event: any, args: any) {
             const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
             if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
             const code = `
                 (function(){
                     try {
                         if(typeof window.__mcpGetMemoryRanking !== 'function') return JSON.stringify({ error: 'Memory agent not injected' });
                         return JSON.stringify(window.__mcpGetMemoryRanking());
                     } catch(e) { return JSON.stringify({ error: 'EXECUTION_FAILED', msg: e.message }); }
                 })();
             `;
             wv.executeJavaScript(code).then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); }).catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'mcp-query-tree'(this: any, event: any, args: any) {
            if (!event.reply) return;
            if (typeof Editor !== 'undefined') Editor.log("[mcp-query-tree] Received request, tree exists:", !!globalState.nodeTree);
            if (!globalState.nodeTree) {
                event.reply(null, { error: 'Node tree data is empty or not yet initialized.' });
                return;
            }
            const maxDepth = (args && typeof args.depth === 'number') ? args.depth : 3;
            
            let rawTree: any = null;
            try {
                rawTree = JSON.parse(JSON.stringify(globalState.nodeTree));
            } catch(e: any) {
                event.reply(null, { error: 'Tree parse error: ' + e.message });
                return;
            }

            const trimTree = (node: any, currentDepth: number): any => {
                if (!node) return node;
                const cloned = { ...node };
                if (currentDepth >= maxDepth) {
                    if (cloned.children && cloned.children.length > 0) {
                        cloned.children = [`__TRUNCATED__ (hidden ${cloned.children.length} items, use depth > ${maxDepth} to view)`];
                    }
                } else if (cloned.children && Array.isArray(cloned.children)) {
                    cloned.children = cloned.children.map((c: any) => trimTree(c, currentDepth + 1));
                }
                return cloned;
            };
            
            const trimmedTree = trimTree(rawTree, 1);
            if (typeof Editor !== 'undefined') Editor.log("[mcp-query-tree] Trimmed tree, replying...");
            event.reply(null, trimmedTree);
        },
        'mcp-query-logs'(this: any, event: any, args: any) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
            
            const tailCount = Math.min(args?.tail || 50, 100);
            const filterLevel = args?.level || 'all';

            const code = `
                (function(){
                    try {
                        if(!window.__mcpRuntimeLogs) return JSON.stringify({ error: 'Logs not intercepted' });
                        var list = window.__mcpRuntimeLogs;
                        if ('${filterLevel}' !== 'all') {
                            list = list.filter(l => l.type === '${filterLevel}');
                        }
                        return JSON.stringify(list.slice(-${tailCount}));
                    } catch(e) { return JSON.stringify({ error: e.message }); }
                })();
            `;
            wv.executeJavaScript(code)
              .then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); })
              .catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'mcp-query-stats'(this: any, event: any, args: any) {
            const wv: any = this.shadowRoot ? this.shadowRoot.querySelector('#game-view') : null;
            if(!wv) { if (event.reply) event.reply(null, { error: 'No WebView' }); return; }
            
            const code = `
                (function(){
                    try {
                        if(typeof window.__mcpProfilerTick !== 'function') return JSON.stringify({ error: 'Profiler not injected' });
                        return JSON.stringify(window.__mcpProfilerTick());
                    } catch(e) { return JSON.stringify({ error: 'EXECUTION_FAILED', msg: e.message }); }
                })();
            `;
            wv.executeJavaScript(code)
              .then((r:any) => { if(event.reply) event.reply(null, typeof r === 'string' ? JSON.parse(r) : r); })
              .catch((e:any) => { if(event.reply) event.reply(null, { error: e.message }); });
        },
        'scene-status-changed'(event: any, payload: any) {
            window.dispatchEvent(new CustomEvent('scene-status-changed', { detail: payload }));
        },
        'mcp-inspector-bridge:mcp-log'(event: any, logItem: any) {
            globalState.mcpLogs.push(logItem);
            if (globalState.mcpLogs.length > 200) {
                globalState.mcpLogs.shift();
            }
        },
        'mcp-status-changed'(event: any, payload: any) {
            window.dispatchEvent(new CustomEvent('mcp-status-changed', { detail: payload }));
        }
    },

    show() {
        window.dispatchEvent(new CustomEvent('panel-show'));
    },

    hide() {
        window.dispatchEvent(new CustomEvent('panel-hide'));
    },

    close() {
        window.dispatchEvent(new CustomEvent('panel-close'));
    }
});
