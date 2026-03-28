declare const Editor: any;
import * as fs from 'fs';
import * as path from 'path';

const { createApp, ref, computed, onMounted, reactive, watch, nextTick } = require('vue');
const { remote } = require('electron');
const { NodeTree } = require('./components/NodeTree');
const { NodeInspector } = require('./components/NodeInspector');

const templateRaw = fs.readFileSync(path.join(__dirname, '../../src/panel/index.html'), 'utf-8');
const preloadUrlResolved = 'file:///' + Editor.url('packages://mcp-inspector-bridge/dist/preload.js').replace(/\\/g, '/');
const templateStr = templateRaw.replace('PRELOAD_PLACEHOLDER', preloadUrlResolved);

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
        Editor.info('[mcp-inspector-bridge] 启动 Vue 3 并挂载双分栏系统');

        // ==== 1. Vue 3 初始化 ====
        const globalState = reactive({
            cocosInfo: null as any,
            nodeTree: null as any,
            lastTreeUpdate: 0 as number,
            isFallbackMode: false as boolean,
            devToolsError: null as string | null,
            nodeDetail: null as any,
            isGamePaused: false as boolean,
            isNarrow: false as boolean,
            webviewSrc: '' as string,
            isPreviewReady: false as boolean
        });

        const app = createApp({
            components: { NodeTree, 'node-inspector': NodeInspector },
            setup() {
                // 当前活跃的 Tab (0=main, 1=devtools, 2=cocos, 3=ext)
                const activeTab = ref(0);

                // 分辨率控制
                const selectedResolution = ref('FIT');
                const isShowFPS = ref(false);
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
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                };

                // 处理节点树选中事件
                const onNodeSelect = (node: any) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        const code = `window.__mcpCrawler ? JSON.stringify(window.__mcpCrawler.getNodeDetail('${node.id}')) : null`;
                        wv.executeJavaScript(code).then((res: string) => {
                            if (res) {
                                globalState.nodeDetail = JSON.parse(res);
                            } else {
                                globalState.nodeDetail = null;
                            }
                        }).catch(() => {
                            globalState.nodeDetail = null;
                        });
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
                        const code = `
                            if (window.__mcpCrawler) {
                                window.__mcpCrawler.updateNodeProperty('${uuid}', ${compStr}, '${propKey}', ${valStr});
                            }
                        `;
                        wv.executeJavaScript(code);

                        // 真实场景数据持久化同步 (Scene Persistence)
                        try {
                            const postToConsole = (msg: string, isError: boolean = false) => {
                                if (wv) {
                                    const c = isError ? `console.error(${JSON.stringify(msg)});` : `console.log('%c[Bridge Info]', 'color: #00ff00', ${JSON.stringify(msg)});`;
                                    wv.executeJavaScript(c);
                                }
                            };

                            Editor.Ipc.sendToPanel('scene', 'scene:query-node', uuid, (err: any, dumpObj: any) => {
                                if (err) {
                                    postToConsole('[dump] query-node error: ' + String(err), true);
                                    return;
                                }
                                try {
                                    const dump = typeof dumpObj === 'string' ? JSON.parse(dumpObj) : dumpObj;
                                    const comps = dump.value.__comps__ || dump.value.components || dump.__comps__ || dump.components || dump;
                                    const fs = require('fs');
                                    const p = require('path').join(__dirname, '../../memory/dump.json');
                                    fs.writeFileSync(p, JSON.stringify(comps, null, 2));
                                    postToConsole('[dump] Successfully wrote to memory/dump.json');
                                } catch (e: any) {
                                    postToConsole('[dump] write fail: ' + e.message, true);
                                }
                            });

                            if (compName) {
                                postToConsole(`[Webview Update] ${compName}.${propKey} = ${value} (Index: ${compIndex})`);
                                if (wv) {
                                    wv.executeJavaScript(`
                                        (function(){
                                            if (!window.__mcpCrawler) return 'No Crawler';
                                            const node = window.__mcpCrawler.findNodeByUuid('${uuid}');
                                            if (node && node._components && node._components[${compIndex}]) {
                                                node._components[${compIndex}]['${propKey}'] = ${JSON.stringify(value)};
                                                if (typeof node._components[${compIndex}].updateAlignment === 'function') {
                                                    node._components[${compIndex}].updateAlignment();
                                                }
                                                return 'OK';
                                            }
                                            return 'Node or Component Not Found';
                                        })();
                                    `).then((res: any) => {
                                        postToConsole(`[Webview Result] Component updated: ${res}`);
                                    }).catch((err: any) => {
                                        postToConsole(`[Webview Error] ${err.message}`, true);
                                    });
                                }
                            } else {
                                postToConsole(`[Webview Update] Node.${propKey} = ${value}`);
                                if (wv) {
                                    wv.executeJavaScript(`
                                        (function(){
                                            if (!window.__mcpCrawler) return 'No Crawler';
                                            const node = window.__mcpCrawler.findNodeByUuid('${uuid}');
                                            if (node) {
                                                if ('${propKey}' === 'rotation' && 'angle' in node) {
                                                    node.angle = -${JSON.stringify(value)};
                                                } else {
                                                    node['${propKey}'] = ${JSON.stringify(value)};
                                                }
                                                return 'OK';
                                            }
                                            return 'Node Not Found';
                                        })();
                                    `).then((res: any) => {
                                        postToConsole(`[Webview Result] Node updated: ${res}`);
                                    }).catch((err: any) => {
                                        postToConsole(`[Webview Error] ${err.message}`, true);
                                    });
                                }
                            }
                        } catch (e) {
                            console.error('[Bridge Webview Error] Failed to execute JS on game webview:', e);
                            Editor.error('[Bridge] Failed to execute JS on game webview', e);
                        }
                    }
                };

                const onToggleCrawlerDebug = (enabled: boolean) => {
                    const wv: any = gameView.value;
                    if (wv) {
                        wv.executeJavaScript(`if(window.__mcpCrawler) window.__mcpCrawler.toggleDebugConsole(${enabled});`);
                    }
                };

                // DevTools 幂等标志（在 onMounted 内的 dom-ready 回调中使用）
                let isDevToolsSetup = false;

                // 自动嗅探重连
                let autoConnectTimer: any = null;
                const tryAutoConnect = () => {
                    if (globalState.isPreviewReady) {
                        if (autoConnectTimer) clearInterval(autoConnectTimer);
                        return;
                    }
                    try {
                        // 利用 query-hierarchy 安全嗅探：若场景面板活跃，该 IPC 调用会正确回调，否则报错或超时，不会引发引擎底层崩溃。
                        Editor.Ipc.sendToPanel('scene', 'scene:query-hierarchy', (err: any, res: any) => {
                            if (!err && res) {
                                refreshGame();
                            }
                        }, 500);
                    } catch (e) { }
                };

                onMounted(() => {
                    tryAutoConnect();
                    autoConnectTimer = setInterval(tryAutoConnect, 2000);
                    window.addEventListener('focus', tryAutoConnect);

                    // 组件挂载时首先向主进程请求最新的树数据
                    try {
                        Editor.Ipc.sendToMain('mcp-inspector-bridge:query-node-tree');
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
                    } catch (e) { }

                    const wrap = wrapMount.value;
                    if (wrap) {
                        try {
                            new ResizeObserver(entries => {
                                if (entries[0].contentRect.width <= 0 || entries[0].contentRect.height <= 0) return;
                                wrapperSize.value.width = entries[0].contentRect.width;
                                wrapperSize.value.height = entries[0].contentRect.height;
                                globalState.isNarrow = entries[0].contentRect.width < 500;
                            }).observe(wrap);
                        } catch (e) {
                            // Electron 版本过低兜底
                            if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
                                wrapperSize.value.width = wrap.clientWidth;
                                wrapperSize.value.height = wrap.clientHeight;
                            }
                            window.addEventListener('resize', () => {
                                if (wrap.clientWidth <= 0 || wrap.clientHeight <= 0) return;
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

                        // 监听来自 gameView 的消息，特别是 ping 测试
                        gameViewDynamic.addEventListener('ipc-message', (event: any) => {
                            if (event.channel === 'ping-pong') {
                                gameViewDynamic.send('ping-pong-reply', 'Pong from Electron Tab Panel');
                            } else if (event.channel === 'handshake') {
                                globalState.cocosInfo = event.args[0];
                                setTimeout(() => {
                                    executeMacro(isShowFPS.value ? 'fps:true' : 'fps:false');
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
                                } catch (e) { }
                            }
                        });

                        // ==== 主动降级容错机制 (Fallback Polling) ====
                        // 基于 dom-ready 超时触发，不再依赖 cocosInfo（它可能因探针注入失败而永远为 null）
                        let fallbackStarted = false;
                        const startFallbackPolling = () => {
                            if (fallbackStarted) return;
                            fallbackStarted = true;

                            setInterval(() => {
                                // 如果已经收到了探针的正常数据流，无需降级
                                if (globalState.cocosInfo && globalState.lastTreeUpdate > 0 && (Date.now() - globalState.lastTreeUpdate < 3000)) {
                                    return;
                                }
                                const wv: any = gameView.value;
                                if (wv) {
                                    try {
                                        const code = `
                                            (function(){
                                                function serializeNode(node) {
                                                    if (!node) return null;
                                                    var isActive = true;
                                                    var isActiveInHierarchy = true;
                                                    if (typeof eng !== 'undefined' && eng.Scene && node instanceof eng.Scene) {
                                                        isActive = true;
                                                        isActiveInHierarchy = true;
                                                    } else {
                                                        try {
                                                            isActive = node.active !== false;
                                                            isActiveInHierarchy = node.activeInHierarchy !== false;
                                                        } catch (e) {}
                                                    }
                                                    var data = {
                                                        id: node.uuid,
                                                        name: node.name,
                                                        active: isActive,
                                                        activeInHierarchy: isActiveInHierarchy,
                                                        childrenCount: node.childrenCount,
                                                        components: node._components ? node._components.length : 0,
                                                        children: []
                                                    };
                                                    if (node.children) {
                                                        for (var i = 0; i < node.children.length; i++) {
                                                            data.children.push(serializeNode(node.children[i]));
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
                                                        var result = { tree: serializeNode(scene), version: eng.ENGINE_VERSION, isPaused: isP };
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

                            // [Fix] 强行注入 CSS 屏蔽 Webview 内部的滚动条 (加强版：涵盖 Cocos 内核的 .contentWrap 和隐藏原生 scrollbar)
                            try {
                                gameViewDynamic.insertCSS('html, body, .contentWrap, .content, .wrapper, #GameDiv, #GameCanvas { overflow: hidden !important; margin: 0 !important; padding: 0 !important; } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }');
                            } catch (e) {
                                Editor.warn('[Bridge] Webview 注入屏蔽滚动条 CSS 失败', e);
                            }

                            setTimeout(() => {
                                if (!globalState.cocosInfo) {
                                    Editor.warn('[Bridge] 5 秒超时：探针握手仍未收到，启动降级轮询');
                                    startFallbackPolling();
                                } else {
                                }
                            }, 5000);

                            // ==== DevTools 绑定从这里移除，改为由 setInterval 抢占式完成（避免 dom-ready 时已经 navigate） ====
                        });
                    } // 此处闭合 if (gameViewDynamic)

                    // ==== 【Phase 5.5 拦截方案】彻底移除 onMounted 中无脑轮询，依靠首次点击开发者工具 Tab 的瞬间来拦截 ====
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
                    globalState.isGamePaused = false;
                    const wv: any = gameView.value;
                    if (!globalState.isPreviewReady) {
                        globalState.isPreviewReady = true;
                        globalState.webviewSrc = 'http://localhost:7456';
                    } else if (wv) {
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
                            `;
                            wv.executeJavaScript(code);
                        } catch (e) { }
                    } else {
                        Editor.warn('[Bridge] 找不到 game-view，宏发送失败');
                    }
                };

                const togglePause = () => { globalState.isGamePaused = !globalState.isGamePaused; executeMacro('pause'); };
                const stepGame = () => { globalState.isGamePaused = true; executeMacro('step'); };
                const toggleFPS = () => { isShowFPS.value = !isShowFPS.value; };

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

                return {
                    onNodeSelect,
                    onUpdateNodeProp,
                    onToggleCrawlerDebug,
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
                    globalState,
                    gameView,
                    devtoolsView,
                    wrapMount,
                    openDevToolsExternal
                };
            }
        });

        app.mount(this.$app);

        // Vue mount 已经包含了对 webview 的监听和预设，外部不需要再次获取 DOM。
    },

    messages: {
    }
});
