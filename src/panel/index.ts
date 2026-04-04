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

                return {
                    activeTab,
                    globalState,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    nodeTreeRef,

                    refreshMcpClients,
                    configureMcpClient,
                    copyMcpPayload,
                    copyMcpPath,
                    
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
