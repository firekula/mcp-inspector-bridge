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
                    }
                });

                return {
                    activeTab,
                    globalState,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    nodeTreeRef,

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
                        if (event.reply) event.reply(null, { reqId, error: "Execution failed in promise: " + e.message });
                    });
                } else {
                    if (event.reply) event.reply(null, { reqId, error: "executeJavaScript did not return a promise" });
                }
            } catch (e: any) {
                if (event.reply) event.reply(null, { reqId, error: "executeJavaScript sync throw: " + e.message });
            }
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
