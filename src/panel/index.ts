declare const Editor: any;
import * as fs from 'fs';
import * as path from 'path';

const { createApp, ref, computed, onMounted, onUnmounted, reactive, watch, nextTick } = require('vue');
const { remote } = require('electron');
const { NodeTree } = require('./components/NodeTree');
const { NodeInspector } = require('./components/NodeInspector');
const { RenderDebugger } = require('./components/RenderDebugger');

const templateRaw = fs.readFileSync(path.join(__dirname, '../../src/panel/index.html'), 'utf-8');
const preloadUrlResolved = 'file:///' + Editor.url('packages://mcp-inspector-bridge/dist/preload.js').replace(/\\/g, '/');
const templateStr = templateRaw.replace('PRELOAD_PLACEHOLDER', preloadUrlResolved);

// [Phase 4] 无害化 HTTP 探针，绕开脆弱的 IPC
const http = require('http');

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

        // ==== 1. Vue 3 初始化 ====
        const globalState = reactive({
            cocosInfo: null as any,
            nodeTree: null as any,
            lastTreeUpdate: 0 as number,
            isFallbackMode: false as boolean,
            showFallbackWarning: false as boolean,
            devToolsError: null as string | null,
            nodeDetail: null as any,
            isGamePaused: false as boolean,
            isNarrow: false as boolean,
            webviewSrc: '' as string,
            profiler: {
                tick: { fps: 0, drawCall: 0, logicTime: 0, renderTime: 0 },
                memoryStats: null as any,
                expandedBundles: {} as any
            },
            renderDebugger: {
                snapshots: [] as any[],
                batchBreaks: [] as any[]
            },
            isInspectorHovered: false as boolean,
            isEditorSceneActive: false as boolean
        });

        const app = createApp({
            components: { NodeTree, 'node-inspector': NodeInspector, 'render-debugger': RenderDebugger },
            setup() {
                // 当前活跃的 Tab (0=main, 1=devtools, 2=cocos, 3=ext)
                const activeTab = ref(0);
                
                // 首次场景激活刷新锁定志
                let hasInitialRefreshed = false;

                // 2 秒警告栏的自动隐藏控制
                let fallbackWarningTimeout: any = null;
                watch(() => globalState.isFallbackMode, (newVal: boolean) => {
                    if (newVal) {
                        globalState.showFallbackWarning = true;
                        if (fallbackWarningTimeout) {
                            clearTimeout(fallbackWarningTimeout);
                        }
                        fallbackWarningTimeout = setTimeout(() => {
                            globalState.showFallbackWarning = false;
                        }, 2000);
                    }
                });

                onUnmounted(() => {
                    if (fallbackWarningTimeout) {
                        clearTimeout(fallbackWarningTimeout);
                    }
                });

                // 标签页管理模型与持久化
                const baseTabsTemplate = [
                    { id: 0, name: '节点树', icon: '🌲' },
                    { id: 1, name: '开发者工具', icon: '🛠' },
                    { id: 4, name: '性能分析', icon: '💡' },
                    { id: 5, name: '渲染诊断', icon: '🔮' },
                    { id: 2, name: 'Cocos信息', icon: 'ℹ️' },
                    { id: 3, name: '扩展', icon: '🔌' }
                ];

                const loadTabsOrder = () => {
                    try {
                        let saved = window.localStorage.getItem('mcp-inspector-tabs-order');
                        if (saved) {
                            const savedIds = JSON.parse(saved);
                            const finalTabs = [];
                            const availableIds = new Set(baseTabsTemplate.map(t => t.id));
                            // 排列已存在的保存项
                            for (let sid of savedIds) {
                                let found = baseTabsTemplate.find(t => t.id === sid);
                                if (found) {
                                    finalTabs.push(found);
                                    availableIds.delete(sid);
                                }
                            }
                            // 追加新版中未存入的新功能标签
                            for (let missingId of availableIds) {
                                let found = baseTabsTemplate.find(t => t.id === missingId);
                                if (found) finalTabs.push(found);
                            }
                            return finalTabs;
                        }
                    } catch (e) { }
                    return [...baseTabsTemplate];
                };

                const tabsList = ref(loadTabsOrder());
                const draggingTabId = ref(null as number | null);
                const hoverTargetId = ref(null as number | null);
                const hoverDropPos = ref(null as 'left' | 'right' | null);
                let dragSrcIndex = -1;

                const onDragStart = (tab: any, index: number, event: DragEvent) => {
                    dragSrcIndex = index;
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', tab.id.toString());
                    }
                    setTimeout(() => {
                        draggingTabId.value = tab.id;
                    }, 0);
                };

                const onDragOver = (tab: any, event: DragEvent) => {
                    if (draggingTabId.value === null) return;
                    if (draggingTabId.value === tab.id) {
                        hoverTargetId.value = null;
                        hoverDropPos.value = null;
                        return;
                    }
                    hoverTargetId.value = tab.id;
                    const rect = (event.target as HTMLElement).getBoundingClientRect();
                    const midX = rect.left + rect.width / 2;
                    hoverDropPos.value = event.clientX < midX ? 'left' : 'right';
                };

                const onDragLeave = (tab: any, event: DragEvent) => {
                    if (hoverTargetId.value === tab.id) {
                        // 防止鼠标在内部元素微小移动时闪烁触发
                        hoverTargetId.value = null;
                        hoverDropPos.value = null;
                    }
                };

                const onDrop = (tab: any, index: number, event: DragEvent) => {
                    event.preventDefault();
                    if (draggingTabId.value === null || draggingTabId.value === tab.id) {
                        onDragEnd(); // 如果原地放下则取消拖拽
                        return;
                    }
                    let targetIndex = index;
                    if (hoverDropPos.value === 'right') {
                        targetIndex++;
                    }
                    const movingTab = tabsList.value.splice(dragSrcIndex, 1)[0];
                    if (dragSrcIndex < targetIndex) targetIndex--;
                    tabsList.value.splice(targetIndex, 0, movingTab);

                    try {
                        const idList = tabsList.value.map((t: any) => t.id);
                        window.localStorage.setItem('mcp-inspector-tabs-order', JSON.stringify(idList));
                    } catch (e) { }
                    onDragEnd();
                };

                const onDragEnd = () => {
                    draggingTabId.value = null;
                    hoverTargetId.value = null;
                    hoverDropPos.value = null;
                    dragSrcIndex = -1;
                };

                // 分辨率控制
                const selectedResolution = ref('FIT');
                const isShowFPS = ref(false);
                const isAudioMuted = ref(false);
                const isLandscape = ref(false);
                const wrapperSize = ref({ width: 0, height: 0 });

                // Vue Ref
                const gameView = ref(null);
                const devtoolsView = ref(null);
                const wrapMount = ref(null);

                // Split Pane Dragger State
                const rightPanelWidth = ref(400);
                const isDragging = ref(false);

                const startDrag = (downEvent: MouseEvent) => {
                    isDragging.value = true;
                    const startX = downEvent.clientX;
                    const startWidth = rightPanelWidth.value;

                    const onMouseMove = (e: MouseEvent) => {
                        if (!isDragging.value) return;
                        // 增量式计算，跨越绝对坐标差值陷阱
                        const deltaX = e.clientX - startX;
                        const newWidth = startWidth - deltaX;

                        if (newWidth > 200 && newWidth < document.body.clientWidth - 300) {
                            rightPanelWidth.value = newWidth;
                        }
                    };
                    const onMouseUp = () => {
                        isDragging.value = false;
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        try {
                            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                                Editor.Ipc.sendToMain('mcp-inspector-bridge:save-panel-width', rightPanelWidth.value);
                            }
                        } catch (e) { }
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                };

                // Node Tree Split Pane Dragger State
                const nodeTreePanelWidth = ref(250);
                const isNodeTreeDragging = ref(false);

                try {
                    const savedW = window.localStorage.getItem('mcp-inspector-nodetree-width');
                    if (savedW) {
                        const wNum = parseInt(savedW, 10);
                        if (!isNaN(wNum) && wNum >= 150) {
                            nodeTreePanelWidth.value = wNum;
                        }
                    }
                } catch(e) {}

                const startNodeTreeDrag = (downEvent: MouseEvent) => {
                    isNodeTreeDragging.value = true;
                    // Prevent text selection during drag
                    if (downEvent.preventDefault) downEvent.preventDefault();
                    
                    const startX = downEvent.clientX;
                    const startWidth = nodeTreePanelWidth.value;

                    const onMouseMove = (e: MouseEvent) => {
                        if (!isNodeTreeDragging.value) return;
                        const deltaX = e.clientX - startX;
                        const newWidth = startWidth + deltaX;

                        // Clamp: min 150px, max depends on total available space to keep right panel at least 250px
                        const maxW = rightPanelWidth.value - 250;
                        if (newWidth > 150 && newWidth < (maxW > 150 ? maxW : 9999)) {
                            nodeTreePanelWidth.value = newWidth;
                        }
                    };
                    const onMouseUp = () => {
                        isNodeTreeDragging.value = false;
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        try {
                            window.localStorage.setItem('mcp-inspector-nodetree-width', nodeTreePanelWidth.value.toString());
                        } catch (e) { }
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                };

                const syncNodeDetail = (oldObj: any, newObj: any) => {
                    if (!oldObj || oldObj.id !== newObj.id) return newObj;
                    // 更新顶层基础属性
                    for (let key in newObj) {
                        if (key !== 'components') oldObj[key] = newObj[key];
                    }
                    // 更新组件结构
                    if (oldObj.components && newObj.components && oldObj.components.length === newObj.components.length) {
                        for (let i = 0; i < newObj.components.length; i++) {
                            const oComp = oldObj.components[i];
                            const nComp = newObj.components[i];
                            oComp.enabled = nComp.enabled;
                            oComp.name = nComp.name;
                            if (oComp.properties && nComp.properties) {
                                const pMap: Record<string, any> = {};
                                oComp.properties.forEach((p: any) => pMap[p.key] = p);
                                nComp.properties.forEach((np: any) => {
                                    if (pMap[np.key]) {
                                        pMap[np.key].value = np.value;
                                    } else {
                                        oComp.properties.push(np); // fallback
                                    }
                                });
                            }
                        }
                    } else {
                        oldObj.components = newObj.components;
                    }
                    return oldObj;
                };

                // 处理节点树选中事件 (支持主/被动刷新重载)
                const onNodeSelect = (node: any, isAutoRefresh: boolean = false) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        try {
                            const selCode = `if(window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget){ window.__mcpCrawler.setSelectionTarget('${node.id}'); }`;
                            wv.executeJavaScript(selCode).catch(() => {});
                        } catch (e) {}

                        const code = `window.__mcpCrawler ? JSON.stringify(window.__mcpCrawler.getNodeDetail('${node.id}')) : null`;
                        wv.executeJavaScript(code).then((res: string) => {
                            if (res) {
                                const newObj = JSON.parse(res);
                                if (isAutoRefresh && globalState.nodeDetail && globalState.nodeDetail.id === newObj.id) {
                                    syncNodeDetail(globalState.nodeDetail, newObj);
                                } else {
                                    globalState.nodeDetail = newObj;
                                }
                            } else {
                                if (!isAutoRefresh) globalState.nodeDetail = null;
                            }
                        }).catch(() => {
                            if (!isAutoRefresh) globalState.nodeDetail = null;
                        });
                    }
                };

                const onNodeHover = (node: any) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        try {
                            const hoverId = node ? node.id : '';
                            const code = `if(window.__mcpCrawler && window.__mcpCrawler.setHoverTarget){ window.__mcpCrawler.setHoverTarget('${hoverId}'); }`;
                            wv.executeJavaScript(code).catch(() => {});
                        } catch (e) {}
                    }
                };

                const onUpdateNodeProp = (payload: any) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        const { uuid, compName, propKey, value, compIndex } = payload;
                        let valStr = value;
                        if (typeof value === 'string') {
                            valStr = '"' + value.replace(/"/g, '\\"') + '"';
                        }
                        const compStr = compName ? '"' + compName + '"' : 'null';
                        
                        // 直接通过探针注入的统一下发通道去修改引擎底层真实数据
                        const code = `
                            if (window.__mcpCrawler && typeof window.__mcpCrawler.updateNodeProperty === 'function') {
                                window.__mcpCrawler.updateNodeProperty('${uuid}', ${compStr}, '${propKey}', ${valStr}, ${compIndex !== undefined ? compIndex : -1});
                            } else {
                                console.error("[MCP Bridge] 致命错误: window.__mcpCrawler.updateNodeProperty 未就绪或丢失。");
                            }
                        `;
                        const __p1 = wv.executeJavaScript(code);
                        if (__p1 && __p1.catch) __p1.catch(() => { });

                        try {
                            if (!globalState.isEditorSceneActive) {
                                console.warn('[Bridge] 场景未激活，拦截了向 Editor 的底层 IPC 调用以防报错');
                                return;
                            }
                            Editor.Ipc.sendToPanel('scene', 'scene:query-node', uuid, (err: any, dumpObj: any) => {
                                if (err) { return; }
                                try {
                                    const dump = typeof dumpObj === 'string' ? JSON.parse(dumpObj) : dumpObj;
                                    const comps = dump.value.__comps__ || dump.value.components || dump.__comps__ || dump.components || dump;
                                    const fs = require('fs');
                                    const p = require('path').join(__dirname, '../../memory/dump.json');
                                    fs.writeFileSync(p, JSON.stringify(comps, null, 2));
                                } catch (e: any) {}
                            });
                        } catch (e) {
                            console.error('[Bridge Webview Error] Failed to query scene node info:', e);
                        }
                    }
                };


                // DevTools 幂等标志（在 onMounted 内的 dom-ready 回调中使用）
                let isDevToolsSetup = false;

                onMounted(() => {
                    window.addEventListener('scene-status-changed', (e: any) => {
                        const wasActive = globalState.isEditorSceneActive;
                        globalState.isEditorSceneActive = e.detail && e.detail.active !== false;

                        // 状态发生切换
                        if (wasActive !== globalState.isEditorSceneActive) {
                            if (!globalState.isEditorSceneActive) {
                                // 失去焦点：仅标记状态，不再切断 webview 引起频繁重载和白屏
                            } else {
                                // 场景重回激活，仅在首次捕获时触发重置和渲染
                                if (!hasInitialRefreshed) {
                                    hasInitialRefreshed = true;
                                    globalState.lastTreeUpdate = 0;
                                    refreshGame(); // 直接自动刷新，无需 ping
                                }
                            }
                        }
                    });

                    // 面板启动时主动查询一次当前场景激活态
                    try {
                        if (typeof Editor !== 'undefined' && Editor.Ipc) {
                            Editor.Ipc.sendToMain('mcp-inspector-bridge:query-scene-active', (err: any, isActive: boolean) => {
                                if (!err && isActive !== undefined) {
                                    globalState.isEditorSceneActive = isActive;
                                    // 根据后置结果安全决定是否触发初次刷新
                                    if (isActive && !hasInitialRefreshed) {
                                        hasInitialRefreshed = true;
                                        globalState.lastTreeUpdate = 0;
                                        refreshGame();
                                    }
                                }
                            });
                        } else {
                            // 纯浏览器无 IPC 环境的兼容
                            globalState.isEditorSceneActive = true;
                            if (!hasInitialRefreshed) {
                                hasInitialRefreshed = true;
                                globalState.lastTreeUpdate = 0;
                                refreshGame();
                            }
                        }
                    } catch (e) { }

                    // 启动拉取持久化的偏好设置
                    try {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-resolution', (err: any, res: string) => {
                            if (!err && res) {
                                selectedResolution.value = res;
                            }
                        });
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-fps', (err: any, res: boolean) => {
                            if (!err && res !== undefined) {
                                isShowFPS.value = res;
                            }
                        });
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-audio-mute', (err: any, res: boolean) => {
                            if (!err && res !== undefined) {
                                isAudioMuted.value = res;
                                // 拉取后立即尝试强行施加静音拦截（补救真空期）
                                const wv: any = gameView.value;
                                if (wv && typeof wv.setAudioMuted === 'function') {
                                    try { wv.setAudioMuted(res); } catch (e) { }
                                }
                            }
                        });
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-panel-width', (err: any, res: number) => {
                            if (!err && res !== undefined) {
                                const maxW = document.body.clientWidth - 300;
                                rightPanelWidth.value = Math.max(200, Math.min(res, maxW > 200 ? maxW : 200));
                            }
                        });
                    } catch (e) { }

                    const wrap = wrapMount.value;
                    if (wrap) {
                        try {
                            new ResizeObserver(entries => {
                                window.requestAnimationFrame(() => {
                                    if (!entries.length) return;
                                    const rect = entries[0].contentRect;
                                    if (rect.width <= 0 || rect.height <= 0) {
                                        if (!(globalState as any).isHidden) {
                                            (globalState as any).isHidden = true;
                                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                                        }
                                        return;
                                    } else {
                                        if ((globalState as any).isHidden) {
                                            (globalState as any).isHidden = false;
                                            window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                                        }
                                    }
                                    wrapperSize.value.width = rect.width;
                                    wrapperSize.value.height = rect.height;
                                    globalState.isNarrow = rect.width < 500;
                                });
                            }).observe(wrap);
                        } catch (e) {
                            // Electron 版本过低兜底
                            if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
                                wrapperSize.value.width = wrap.clientWidth;
                                wrapperSize.value.height = wrap.clientHeight;
                            }
                            window.addEventListener('resize', () => {
                                const isHidden = wrap.clientWidth <= 0 || wrap.clientHeight <= 0;
                                if (isHidden) {
                                    if (!(globalState as any).isHidden) {
                                        (globalState as any).isHidden = true;
                                        window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: true } }));
                                    }
                                    return;
                                } else {
                                    if ((globalState as any).isHidden) {
                                        (globalState as any).isHidden = false;
                                        window.dispatchEvent(new CustomEvent('panel-visibility-change', { detail: { hidden: false } }));
                                    }
                                }
                                wrapperSize.value.width = wrap.clientWidth;
                                wrapperSize.value.height = wrap.clientHeight;
                                globalState.isNarrow = wrap.clientWidth < 500;
                            });
                        }
                    }

                    // ==== 2. 注入 Preload & 监听组件通信 ====
                    const gameViewDynamic: any = gameView.value;
                    if (gameViewDynamic) {
                        // 不再强制剥除套壳页面，因为直接改变 webview.src 会导致 underlying WebContents 重生、引爆 dom-ready 的状态错误，并引发黑屏。
                        // 这里仅保留事件监听。

                        // 监听来自 gameView 的消息
                        gameViewDynamic.addEventListener('ipc-message', (event: any) => {
                            if (event.channel === 'handshake') {
                                globalState.cocosInfo = event.args[0];
                                setTimeout(() => {
                                    executeMacro(isShowFPS.value ? 'fps:true' : 'fps:false');
                                    executeMacro(isAudioMuted.value ? 'mute:true' : 'mute:false');
                                }, 500);
                            } else if (event.channel === 'update-tree') {
                                try {
                                    const parsed = JSON.parse(event.args[0]);
                                    if (parsed && typeof parsed.tree !== 'undefined') {
                                        globalState.nodeTree = parsed.tree;
                                        globalState.isGamePaused = !!parsed.isPaused;
                                    } else {
                                        globalState.nodeTree = parsed;
                                    }
                                    globalState.lastTreeUpdate = Date.now();

                                    // 自动刷新当前选中节点的属性数据 (如果存在有效节点 && 且鼠标未在修改参数)
                                    if (!globalState.isInspectorHovered && globalState.nodeDetail && globalState.nodeDetail.id) {
                                        onNodeSelect({ id: globalState.nodeDetail.id }, true);
                                    }
                                } catch (e) { }
                            }
                        });

                        // 阶段二改造：监听 Webview 内部真正的静默 IPC 转发 (推荐)
                        gameViewDynamic.addEventListener('ipc-message', (e: any) => {
                            if (e.channel === 'render-debugger-payload') {
                                try {
                                    const payload = e.args[0];
                                    if (payload && payload.type === 'render-debugger:snapshot') {
                                        globalState.renderDebugger.snapshots.push(payload.data);
                                        if (globalState.renderDebugger.snapshots.length > 5) {
                                            globalState.renderDebugger.snapshots.shift();
                                        }
                                    }
                                    window.dispatchEvent(new CustomEvent('render-debugger-payload', { detail: payload }));
                                } catch (err) { }
                            }
                        });

                        // 备用降级信道：监听 Webview 内部的 console 转发
                        gameViewDynamic.addEventListener('console-message', (e: any) => {
                            if (e.message && e.message.startsWith('[RenderDebugger]JSON_DATA:')) {
                                const jsonStr = e.message.substring('[RenderDebugger]JSON_DATA:'.length);
                                try {
                                    const payload = JSON.parse(jsonStr);
                                    if (payload && payload.type === 'render-debugger:snapshot') {
                                        globalState.renderDebugger.snapshots.push(payload.data);
                                        if (globalState.renderDebugger.snapshots.length > 5) {
                                            globalState.renderDebugger.snapshots.shift();
                                        }
                                    }
                                    if (payload.type === 'render-debugger:batch-break' || payload.type === 'render-debugger:snapshot') {
                                        window.dispatchEvent(new CustomEvent('render-debugger-payload', { detail: payload }));
                                    }
                                } catch (err) { }
                            }
                        });

                        // Phase 3: 监听前端面板发来的游戏宏执行请求 (步进回看命令)
                        window.addEventListener('render-debugger:send-macro', ((e: any) => {
                            if (e.detail && gameViewDynamic) {
                                try {
                                    gameViewDynamic.executeJavaScript(e.detail).catch(() => { });
                                } catch (err) { }
                            }
                        }) as EventListener);

                        // ==== 主动降级容错机制 (Fallback Polling) ====
                        // 基于 dom-ready 超时触发，不再依赖 cocosInfo（它可能因探针注入失败而永远为 null）
                        let fallbackStarted = false;
                        const startFallbackPolling = () => {
                            if (fallbackStarted) return;
                            fallbackStarted = true;

                            setInterval(() => {
                                // 如果已经收到了探针的正常数据流，无需降级（移除对 cocosInfo 的严苛前置要求以防双轨竞态死锁）
                                if (globalState.lastTreeUpdate > 0 && (Date.now() - globalState.lastTreeUpdate < 3000)) {
                                    return;
                                }
                                const wv: any = gameView.value;
                                if (wv) {
                                    try {
                                        const code = `
                                            (function(){
                                                function serializeNode(node, currentPrefabDepth) {
                                                    if (!node) return null;
                                                    if (node.name === '__mcp_hover_overlay__' || node.name === '__mcp_select_overlay__') return null;
                                                    var isActive = true;
                                                    var isActiveInHierarchy = true;
                                                    var isScene = false;
                                                    if (typeof eng !== 'undefined' && eng.Scene && node instanceof eng.Scene) {
                                                        isActive = true;
                                                        isActiveInHierarchy = true;
                                                        isScene = true;
                                                    } else {
                                                        try {
                                                            isActive = node.active !== false;
                                                            isActiveInHierarchy = node.activeInHierarchy !== false;
                                                        } catch (e) {}
                                                    }
                                                    
                                                    var isPrefab = !!node._prefab;
                                                    var prefabRoot = isPrefab && node._prefab.root === node;
                                                    var nextPrefabDepth = currentPrefabDepth || 0;
                                                    if (prefabRoot) nextPrefabDepth++;
                                                    var componentNames = [];
                                                    if (node._components) {
                                                        for (var k = 0; k < node._components.length; k++) {
                                                            var comp = node._components[k];
                                                            var cClass = comp.name || (comp.constructor ? comp.constructor.name : '');
                                                            if (typeof eng !== 'undefined' && eng.js && typeof eng.js.getClassName === 'function') {
                                                                var cName = eng.js.getClassName(comp);
                                                                if (cName) cClass = cName;
                                                            }
                                                            if (cClass) {
                                                                var m = cClass.match(/<(.+)>/);
                                                                componentNames.push(m ? m[1] : cClass);
                                                            }
                                                        }
                                                    }
                                                    var data = {
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
                                                        for (var i = 0; i < node.children.length; i++) {
                                                            var childData = serializeNode(node.children[i], nextPrefabDepth);
                                                            if (childData) data.children.push(childData);
                                                        }
                                                    }
                                                    return data;
                                                }
                                                var eng = window.cc;
                                                if (!eng) {
                                                    var frm = document.getElementById('GameDiv');
                                                    if (frm && frm.contentWindow) eng = frm.contentWindow.cc;
                                                }
                                                if (eng && eng.director) {
                                                    var scene = eng.director.getScene();
                                                    if (scene) {
                                                        var isP = (eng.game && typeof eng.game.isPaused === 'function') ? eng.game.isPaused() : false;
                                                        var result = { tree: serializeNode(scene, 0), version: eng.ENGINE_VERSION, isPaused: isP };
                                                        return JSON.stringify(result);
                                                    }
                                                }
                                                return null;
                                            })();
                                        `;
                                        wv.executeJavaScript(code).then((result: string) => {
                                            if (result) {
                                                if (!globalState.isFallbackMode) {
                                                    Editor.warn('[Bridge] 探针 IPC 通道超时，自动切入降级轮询模式 (Fallback Active)');
                                                    globalState.isFallbackMode = true;
                                                }
                                                try {
                                                    const parsed = JSON.parse(result);
                                                    globalState.nodeTree = parsed.tree;
                                                    if (parsed.isPaused !== undefined) {
                                                        globalState.isGamePaused = !!parsed.isPaused;
                                                    }
                                                    if (parsed.version && !globalState.cocosInfo) {
                                                        globalState.cocosInfo = { version: parsed.version, isNative: false, isMobile: false, language: 'unknown (fallback)' };
                                                    }
                                                    globalState.lastTreeUpdate = Date.now();
                                                } catch (e) { }
                                            }
                                        }).catch(() => { });
                                    } catch (err) { }
                                }
                            }, 2000);
                        };

                        // dom-ready 后 5 秒超时启动降级轮询（如果探针的正常数据流还没建立的话）
                        gameViewDynamic.addEventListener('dom-ready', () => {

                            // [BugFix] 强制补录音频控制状态以防场景重置导致白噪声泄露
                            if (isAudioMuted.value && typeof gameViewDynamic.setAudioMuted === 'function') {
                                try { gameViewDynamic.setAudioMuted(isAudioMuted.value); } catch (e) { }
                            }
                            executeMacro(isAudioMuted.value ? 'mute:true' : 'mute:false');

                            // 强行注入 CSS 屏蔽 Webview 内部的滚动条以及外壳元素的溢出
                            try {
                                const __pIns = gameViewDynamic.insertCSS('html, body, .contentWrap, .content, .wrapper, #GameDiv, #GameCanvas { overflow: hidden !important; margin: 0 !important; padding: 0 !important; } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }');
                                if (__pIns && __pIns.catch) __pIns.catch(() => { });
                            } catch (e) {
                                Editor.warn('[Bridge] Webview 注入屏蔽滚动条 CSS 失败', e);
                            }

                            setTimeout(() => {
                                // [BugFix] 不要因为 src='' 的 about:blank 页面初始化就误触发降级，仅在实际加载场景时检测
                                // [Robust] 支持多开编辑器时临时递增的本地端（如 7457, 7458）
                                if (!globalState.cocosInfo && globalState.webviewSrc && globalState.webviewSrc.includes('localhost:')) {
                                    Editor.warn('[Bridge] 5 秒超时：探针握手仍未收到，启动降级轮询');
                                    startFallbackPolling();
                                } else {
                                }
                            }, 5000);

                        });
                    } // 此处闭合 if (gameViewDynamic)

                });

                // Phase 7: 使用 BrowserView（与原版 CocosInspector 完全对齐）
                // 关键发现：原版根本不用 <webview>，而是用 BrowserView，
                // 因为 BrowserView.webContents 不会自动导航到 about:blank，
                // 所以 setDevToolsWebContents 才能生效。
                const { BrowserView } = remote;
                let devToolsBV: any = null;

                /**
                 * 计算 DevTools BrowserView 应在编辑器窗口中的绝对位置。
                 * 需要从 DevTools 占位容器的 DOM 位置推导出在整个窗口中的坐标。
                 */
                const updateBrowserViewBounds = () => {
                    if (!devToolsBV) return;
                    const container = devtoolsView.value as any;
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    // BrowserView 的坐标是相对于原生窗口的，在 Cocos Creator 的 Panel 中
                    // getBoundingClientRect 返回的是相对于 panel webContents 的坐标
                    // 需要加上当前 webContents 在原生窗口中的偏移
                    try {
                        devToolsBV.setBounds({
                            x: Math.round(rect.left),
                            y: Math.round(rect.top),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height)
                        });
                    } catch (e) {
                        // setBounds 失败时静默
                    }
                };

                watch(activeTab, async (newVal: number) => {
                    if (newVal === 1 && !isDevToolsSetup) {
                        await nextTick();

                        // 等待游戏的 WebContents ID 就绪
                        let attempts = 0;
                        const captureInterval = setInterval(() => {
                            attempts++;
                            if (isDevToolsSetup) {
                                clearInterval(captureInterval);
                                return;
                            }
                            if (attempts > 150) {
                                clearInterval(captureInterval);
                                globalState.devToolsError = 'BrowserView: 游戏 WebContents 获取超时';
                                return;
                            }

                            try {
                                const gameWV: any = gameView.value;
                                if (!gameWV) return;
                                const gid = gameWV.getWebContentsId();
                                if (!gid) return;

                                clearInterval(captureInterval);

                                const gWC = remote.webContents.fromId(gid);
                                if (!gWC) {
                                    globalState.devToolsError = '游戏 WebContents fromId 失败';
                                    return;
                                }


                                // 创建 BrowserView（完全模仿原版 CocosInspector）
                                const currentWindow = remote.getCurrentWindow();

                                devToolsBV = new BrowserView({
                                    webPreferences: {
                                        nodeIntegration: true,
                                        contextIsolation: false
                                    }
                                });

                                // 将 BrowserView 附加到当前编辑器窗口
                                currentWindow.addBrowserView(devToolsBV);

                                // 核心绑定：将游戏的 DevTools 输出定向到 BrowserView
                                const bvWC = devToolsBV.webContents;
                                gWC.setDevToolsWebContents(bvWC);
                                gWC.openDevTools();


                                // 定位 BrowserView
                                updateBrowserViewBounds();

                                isDevToolsSetup = true;
                                globalState.devToolsError = null;

                            } catch (e: any) {
                                Editor.error('[Bridge] 异常: ' + e.message);
                            }
                        }, 20);
                    }

                    // 切入/切出 DevTools Tab 时，控制 BrowserView 的显隐
                    if (devToolsBV) {
                        const currentWindow = remote.getCurrentWindow();
                        if (newVal === 1) {
                            // 切入 DevTools Tab => 确保 BrowserView 可见且位置正确
                            try {
                                // 先移除再添加，保证在最顶层
                                currentWindow.removeBrowserView(devToolsBV);
                                currentWindow.addBrowserView(devToolsBV);
                            } catch (e) { }
                            await nextTick();
                            updateBrowserViewBounds();
                        } else {
                            // 切出 DevTools Tab => 隐藏 BrowserView
                            try {
                                currentWindow.removeBrowserView(devToolsBV);
                            } catch (e) { }
                        }
                    }
                });

                // 监听窗口 resize，更新 BrowserView 位置
                window.addEventListener('resize', () => {
                    if (activeTab.value === 1 && devToolsBV) {
                        nextTick().then(updateBrowserViewBounds);
                    }
                });

                const gameContainerStyle = computed(() => {
                    if (selectedResolution.value === 'FIT' || wrapperSize.value.width === 0) {
                        return { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' };
                    }
                    const parts = selectedResolution.value.split('x');
                    let targetW = parseInt(parts[0]);
                    let targetH = parseInt(parts[1]);

                    if (isLandscape.value) {
                        const tmp = targetW; targetW = targetH; targetH = tmp;
                    }

                    // 缩放适应灰色外壳的 95% 空间防止挨得太紧
                    const scale = Math.min(
                        (wrapperSize.value.width * 0.95) / targetW,
                        (wrapperSize.value.height * 0.95) / targetH
                    );

                    return {
                        width: Math.floor(targetW) + 'px',
                        height: Math.floor(targetH) + 'px',
                        left: '50%',
                        top: '50%',
                        position: 'absolute',
                        overflow: 'hidden',
                        transform: `translate(-50%, -50%) scale(${scale})`,
                        transformOrigin: 'center center'
                    };
                });

                const rotateScreen = () => { isLandscape.value = !isLandscape.value; };
                function refreshGame() {
                    if (!globalState.isEditorSceneActive) {
                        console.warn('[Bridge] 场景未激活，刷新操作暂被拦截以防报错。');
                        return;
                    }
                    console.log('[Bridge] 触发手动刷新重载游戏视图...');
                    globalState.isGamePaused = false;
                    globalState.nodeTree = null;
                    globalState.lastTreeUpdate = 0;
                    
                    const wv: any = gameView.value;

                    // [Robust] 只有地址不再包含 localhost 时 (例如空字符串或 about:blank)，才重新赋予初始的预览服务器地址
                    if (!globalState.webviewSrc || !globalState.webviewSrc.includes('localhost:')) {
                        globalState.webviewSrc = 'http://localhost:7456';
                    } else if (wv && typeof wv.reload === 'function') {
                        try { wv.reload(); } catch (e) { }
                    }
                }

                const executeMacro = (command: string) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        try {
                            const code = `
                                var eng = window.cc;
                                if (!eng) {
                                    var frm = document.getElementById('GameDiv');
                                    if (frm) eng = frm.contentWindow.cc;
                                }
                                if (eng && eng.game) {
                                    if ('${command}' === 'pause') {
                                        if (eng.game.isPaused()) eng.game.resume(); else eng.game.pause();
                                    } else if ('${command}' === 'step') {
                                        if (!eng.game.isPaused()) eng.game.pause();
                                        eng.game.step();
                                    } else if ('${command}' === 'fps:true') {
                                        eng.debug.setDisplayStats(true);
                                    } else if ('${command}' === 'fps:false') {
                                        eng.debug.setDisplayStats(false);
                                    }
                                }
                                if (eng && eng.audioEngine) {
                                    if ('${command}' === 'mute:true') {
                                        if (typeof eng.audioEngine.setMusicVolume === 'function') eng.audioEngine.setMusicVolume(0);
                                        if (typeof eng.audioEngine.setEffectsVolume === 'function') eng.audioEngine.setEffectsVolume(0);
                                    } else if ('${command}' === 'mute:false') {
                                        if (typeof eng.audioEngine.setMusicVolume === 'function') eng.audioEngine.setMusicVolume(1);
                                        if (typeof eng.audioEngine.setEffectsVolume === 'function') eng.audioEngine.setEffectsVolume(1);
                                    }
                                }
                            `;
                            const __p4 = wv.executeJavaScript(code);
                            if (__p4 && __p4.catch) __p4.catch(() => { });
                        } catch (e) { }
                    } else {
                        Editor.warn('[Bridge] 找不到 game-view，宏发送失败');
                    }
                };

                const togglePause = () => { globalState.isGamePaused = !globalState.isGamePaused; executeMacro('pause'); };
                const stepGame = () => { globalState.isGamePaused = true; executeMacro('step'); };
                const toggleFPS = () => { isShowFPS.value = !isShowFPS.value; };
                const toggleMute = () => {
                    isAudioMuted.value = !isAudioMuted.value;
                    const wv: any = gameView.value;
                    if (wv && typeof wv.setAudioMuted === 'function') {
                        try { wv.setAudioMuted(isAudioMuted.value); } catch (e) { }
                    }
                    executeMacro(isAudioMuted.value ? 'mute:true' : 'mute:false');
                };

                // 回退方案：在独立窗口中打开 DevTools
                const openDevToolsExternal = () => {
                    try {
                        const gameViewEl: any = gameView.value;
                        if (gameViewEl) {
                            const gid = gameViewEl.getWebContentsId();
                            const gWC = remote.webContents.fromId(gid);
                            if (gWC) {
                                gWC.openDevTools({ mode: 'undocked' });
                            }
                        }
                    } catch (err: any) {
                        Editor.error('[Bridge] 独立窗口 DevTools 也无法打开:', err.message);
                    }
                };

                watch(selectedResolution, (newVal: string) => {
                    try {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:save-resolution', newVal);
                    } catch (e) { }
                });

                watch(isShowFPS, (newVal: boolean) => {
                    executeMacro(newVal ? 'fps:true' : 'fps:false');
                    try {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:save-fps', newVal);
                    } catch (e) { }
                });

                watch(isAudioMuted, (newVal: boolean) => {
                    try {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:save-audio-mute', newVal);
                    } catch (e) { }
                });

                // Phase 1: 简易数据抽取心跳与厚重内存排行抽取
                let profilerTickTimer: any = null;
                let memoryRankTimer: any = null;
                watch(activeTab, (newVal: number) => {
                    const wv: any = gameView.value;
                    if (newVal === 4 && wv) {
                        if (!profilerTickTimer) {
                            profilerTickTimer = setInterval(() => {
                                // [Fix Phase 2] 使用 probe.js 基础高频统计
                                const expr = `window.__mcpProfilerTick ? JSON.stringify(window.__mcpProfilerTick()) : null`;

                                wv.executeJavaScript(expr).then((res: string) => {
                                    if (res) {
                                        try {
                                            const data = JSON.parse(res);
                                            Object.assign(globalState.profiler.tick, data);
                                        } catch (e) { }
                                    }
                                }).catch(() => { });
                            }, 150);
                        }

                        // 专门隔离的低频内存探测，防止 IPC 臃肿导致面板卡顿
                        if (!memoryRankTimer) {
                            // 为了对抗底层探针完全无法获取某些资源原名的问题，在面板层利用主进程 API 进行反向解析缓存
                            let uuidNameCache: Record<string, string> = {};

                            memoryRankTimer = setInterval(() => {
                                const expr = `window.__mcpGetMemoryRanking ? JSON.stringify(window.__mcpGetMemoryRanking()) : null`;
                                wv.executeJavaScript(expr).then((res: string) => {
                                    if (res) {
                                        try {
                                            const data = JSON.parse(res);

                                            const Editor = (window as any).Editor;
                                            const resolveRealName = (item: any) => {
                                                // 使用强力缓存避免每秒 1000 次查询瞬间击穿 IPC 主进程通讯
                                                if (uuidNameCache[item.id]) {
                                                    item.name = uuidNameCache[item.id];
                                                    return;
                                                }

                                                // 无差别对所有资源尝试动用 Editor 获取它的官方 db:// 全路径
                                                const remoteDb = Editor && Editor.assetdb && Editor.assetdb.remote;
                                                if (remoteDb && typeof remoteDb.uuidToUrl === 'function') {
                                                    const url = remoteDb.uuidToUrl(item.id);
                                                    if (url && typeof url === 'string') {
                                                        let cleanUrl = url.replace('db://assets/', '');
                                                        // 如果仍然带有 internal 头，可以净化一下
                                                        cleanUrl = cleanUrl.replace('db://internal/', '[Internal] ');
                                                        item.name = cleanUrl;
                                                        uuidNameCache[item.id] = item.name;
                                                        return;
                                                    }
                                                }

                                                // 如果确实是运行时动态资源或者是孤儿未查到，那就认可它本来的妥协名字
                                                uuidNameCache[item.id] = item.name;
                                            };

                                            if (data.allResources) {
                                                data.allResources.forEach(resolveRealName);
                                            }
                                            if (data.bundles) {
                                                // 提取过去一帧的旧的 bundles 参考线
                                                const oldBundles = globalState.profiler.memoryStats && globalState.profiler.memoryStats.bundles;
                                                const oldMemMap: Record<string, number> = {};
                                                if (oldBundles) {
                                                    oldBundles.forEach((ob: any) => {
                                                        oldMemMap[ob.name] = ob.currentMemory;
                                                    });
                                                }

                                                data.bundles.forEach((b: any) => {
                                                    if (b.resources) b.resources.forEach(resolveRealName);

                                                    // 计算内存涨跌走向趋势
                                                    const oldMem = oldMemMap[b.name];
                                                    if (oldMem !== undefined) {
                                                        if (b.currentMemory > oldMem) b.trend = 'up';
                                                        else if (b.currentMemory < oldMem) b.trend = 'down';
                                                        else b.trend = 'flat';
                                                    } else {
                                                        b.trend = 'flat';
                                                    }
                                                });

                                                // 根据 bundle 当前占用内存进行从高到低倒序排序
                                                data.bundles.sort((a: any, b: any) => b.currentMemory - a.currentMemory);
                                            }

                                            globalState.profiler.memoryStats = data;
                                        } catch (e) { }
                                    }
                                }).catch(() => { });
                            }, 1000);
                        }
                    } else {
                        if (profilerTickTimer) {
                            clearInterval(profilerTickTimer);
                            profilerTickTimer = null;
                        }
                        if (memoryRankTimer) {
                            clearInterval(memoryRankTimer);
                            memoryRankTimer = null;
                        }
                    }
                });

                // 辅助函数暴露给模板，用于字节换算展示
                const formatBytes = (bytes: number) => {
                    if (bytes === 0) return '0 B';
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                };

                const onRenderDebuggerToggle = (newVal: boolean) => {
                    const wv: any = gameView.value;
                    if (!wv) {
                        console.error("[RenderDebugger] gameView ref 为空，无法派发指令");
                        return;
                    }
                    if (typeof wv.executeJavaScript === 'function') {
                        console.log(`[RenderDebugger] 准备向 WebView 执行 JS 指令，参数 newVal=${newVal}`);
                        wv.executeJavaScript(`
                            var targetWin = window;
                            var frm = document.getElementById('GameDiv');
                            if (frm && frm.contentWindow && frm.contentWindow.__mcpRenderDebuggerHook) {
                                targetWin = frm.contentWindow;
                            }
                            console.log("[Webview 调度层] 路由目标:", targetWin === window ? "Top Window" : "GameDiv Iframe");
                            if (targetWin.__mcpRenderDebuggerHook) {
                                if (${newVal}) {
                                    targetWin.__mcpRenderDebuggerHook.injectHooks();
                                } else {
                                    targetWin.__mcpRenderDebuggerHook.restoreHooks();
                                }
                            } else {
                                console.error("[Webview 内核] 严重异常：即便穿透 iframe 也未发现 __mcpRenderDebuggerHook 对象！");
                            }
                        `).catch((err: any) => console.error("[RenderDebugger] executeJavaScript 抛出异常:", err));
                    } else {
                        console.error("[RenderDebugger] gameView 尚未准备完毕 (typeof wv.executeJavaScript != function)");
                    }
                };

                const nodeTreeRef = ref(null);

                let locateResourceTimer: any = null;
                const locateResource = (res: any) => {
                    if (!res || !res.id) return;
                    const uuid: string = res.id;
                    // 过滤内部或不合法资源 UUID
                    if (uuid.length < 5) return;
                    if (uuid.startsWith('default-') || uuid.indexOf('preview-') !== -1) {
                        console.log(`[Bridge] 已过滤针对内置资源的定位请求: ${uuid}`);
                        return;
                    }

                    if (locateResourceTimer) clearTimeout(locateResourceTimer);
                    locateResourceTimer = setTimeout(() => {
                        if (typeof Editor !== 'undefined' && Editor.Ipc) {
                            Editor.Ipc.sendToAll('assets:hint', uuid);
                            console.log(`[Bridge] 已请求定位资源: ${uuid} (${res.name})`);
                        }
                    }, 300);
                };

                const onRenderDebuggerLocate = (id: string) => {
                    activeTab.value = 0;
                    nextTick(() => {
                        const nt: any = nodeTreeRef.value;
                        if (nt && nt.expandToNode) {
                            const success = nt.expandToNode(id);
                            if (!success) {
                                Editor.warn(`[ RenderDebugger ] 跨视图定位失败：查找不到 UUID 为 ${id} 的节点，它有可能刚刚由于游戏内部机制已被销毁。`);
                            }
                        }
                    });
                };

                // --- DevTools 生命周期清理拦截 ---
                let wasExternalDevToolsOpened = false;
                let externalDevToolsWinId: number | null = null;

                const _onPanelHide = () => {
                    if (devToolsBV) {
                        try {
                            const currentWindow = remote.getCurrentWindow();
                            currentWindow.removeBrowserView(devToolsBV);
                        } catch (e) { }
                    }
                    try {
                        const gameViewEl: any = gameView.value;
                        if (gameViewEl) {
                            const gid = gameViewEl.getWebContentsId();
                            if (gid) {
                                const gWC = remote.webContents.fromId(gid);
                                if (gWC && gWC.isDevToolsOpened()) {
                                    const devToolsWC = gWC.devToolsWebContents;
                                    if (devToolsWC) {
                                        const dtWin = remote.BrowserWindow.fromWebContents(devToolsWC);
                                        if (dtWin) {
                                            externalDevToolsWinId = dtWin.id;
                                            dtWin.hide();
                                            return;
                                        }
                                    }
                                    // Fallback if we cannot get the BrowserWindow
                                    wasExternalDevToolsOpened = true;
                                    gWC.closeDevTools();
                                }
                            }
                        }
                    } catch (err) { }
                };

                const _onPanelShow = () => {
                    if (activeTab.value === 1 && devToolsBV) {
                        try {
                            const currentWindow = remote.getCurrentWindow();
                            currentWindow.removeBrowserView(devToolsBV);
                            currentWindow.addBrowserView(devToolsBV);
                            nextTick(updateBrowserViewBounds);
                        } catch (e) { }
                    }
                    if (externalDevToolsWinId !== null) {
                        try {
                            const dtWin = remote.BrowserWindow.fromId(externalDevToolsWinId);
                            if (dtWin) {
                                dtWin.show();
                            } else {
                                // Window destroyed independently
                                openDevToolsExternal();
                            }
                        } catch (e) {
                            openDevToolsExternal();
                        }
                        externalDevToolsWinId = null;
                    } else if (wasExternalDevToolsOpened) {
                        wasExternalDevToolsOpened = false;
                        openDevToolsExternal();
                    }
                };

                const _onPanelClose = () => {
                    _onPanelHide();
                    if (devToolsBV) {
                        try {
                            (devToolsBV.webContents as any).destroy();
                        } catch (e) { }
                        devToolsBV = null;
                        isDevToolsSetup = false;
                    }
                };

                const _onVisibilityChange = (e: any) => {
                    if (e.detail && e.detail.hidden) {
                        _onPanelHide();
                    } else {
                        _onPanelShow();
                    }
                };

                window.addEventListener('panel-hide', _onPanelHide);
                window.addEventListener('panel-show', _onPanelShow);
                window.addEventListener('panel-close', _onPanelClose);
                window.addEventListener('panel-visibility-change', _onVisibilityChange);

                if (onUnmounted) {
                    onUnmounted(() => {
                        window.removeEventListener('panel-hide', _onPanelHide);
                        window.removeEventListener('panel-show', _onPanelShow);
                        window.removeEventListener('panel-close', _onPanelClose);
                        window.removeEventListener('panel-visibility-change', _onVisibilityChange);
                    });
                }

                const onLocateNode = (uuid: string) => {
                    if (nodeTreeRef.value) {
                        const targetId = uuid;
                        const success = (nodeTreeRef.value as any).expandToNode(targetId);
                        if (!success) {
                            console.warn(`[Bridge] 树组件未能展开节点：${targetId}`);
                        }
                    }
                };

                let locateAssetTimeout: any = null;
                const onLocateAsset = (uuid: string) => {
                    if (!uuid) return;
                    if (locateAssetTimeout) clearTimeout(locateAssetTimeout);
                    locateAssetTimeout = setTimeout(() => {
                        try {
                            Editor.Ipc.sendToAll('assets:hint', uuid);
                            console.log(`[Bridge] IPC 资源定位指令已发出：${uuid}`);
                        } catch (e: any) {
                            console.warn(`[Bridge] IPC 发送失败: ${e.message}`);
                        }
                    }, 300);
                };

                const onPrintComp = (uuid: string, compIndex: number) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        const code = `
                            if (window.__mcpCrawler && typeof window.__mcpCrawler.printComponentData === 'function') {
                                window.__mcpCrawler.printComponentData('${uuid}', ${compIndex});
                            } else {
                                console.error("[MCP Bridge] 致命错误: window.__mcpCrawler.printComponentData 未就绪。");
                            }
                        `;
                        const __p = wv.executeJavaScript(code);
                        if (__p && __p.catch) __p.catch(() => {});
                    }
                };

                return {
                    onLocateNode,
                    onLocateAsset,
                    onPrintComp,
                    onNodeSelect,
                    onNodeHover,
                    onUpdateNodeProp,
                    nodeTreePanelWidth,
                    isNodeTreeDragging,
                    startNodeTreeDrag,
                    onRenderDebuggerToggle,
                    onRenderDebuggerLocate,
                    locateResource,
                    nodeTreeRef,

                    activeTab,
                    selectedResolution,
                    isShowFPS,
                    isLandscape,
                    gameContainerStyle,
                    rightPanelWidth,
                    isDragging,
                    startDrag,
                    rotateScreen,
                    refreshGame,
                    togglePause,
                    stepGame,
                    toggleFPS,
                    toggleMute,
                    isAudioMuted,
                    globalState,
                    formatBytes,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    openDevToolsExternal,
                    tabsList,
                    draggingTabId,
                    hoverTargetId,
                    hoverDropPos,
                    onDragStart,
                    onDragOver,
                    onDragLeave,
                    onDrop,
                    onDragEnd
                };
            }
        });

        app.mount(this.$app);

        // Vue mount 已经包含了对 webview 的监听和预设，外部不需要再次获取 DOM。
    },

    messages: {
        'scene-status-changed'(event: any, payload: any) {
            window.dispatchEvent(new CustomEvent('scene-status-changed', { detail: payload }));
        }
    },

    show() {
        // [BugFix] 发布 panel-show 事件恢复内部悬浮窗
        window.dispatchEvent(new CustomEvent('panel-show'));
    },

    hide() {
        // [BugFix] 发布 panel-hide 事件隐藏/关闭残留 DevTools
        window.dispatchEvent(new CustomEvent('panel-hide'));
    },

    close() {
        // [BugFix] 面板被彻底关闭时进行最终销毁
        window.dispatchEvent(new CustomEvent('panel-close'));
    }
});
