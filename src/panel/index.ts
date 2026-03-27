declare const Editor: any;
import * as fs from 'fs';
import * as path from 'path';

// Note: 因为它是插件运行时，可以直接使用 requrie 导入 npm 模块 Vue
const { createApp, ref, computed, onMounted, reactive, watch, nextTick } = require('vue');
const { remote } = require('electron');

const templateRaw = fs.readFileSync(path.join(__dirname, '../../src/panel/index.html'), 'utf-8');
const preloadUrlResolved = 'file:///' + Editor.url('packages://mcp-inspector-bridge/dist/preload.js').replace(/\\/g, '/');
const templateStr = templateRaw.replace('PRELOAD_PLACEHOLDER', preloadUrlResolved);

module.exports = Editor.Panel.extend({
    style: `
        :host { display: flex; flex-direction: column; width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    `,
    template: templateStr,

    $ : {
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
            devToolsError: null as string | null
        });

        const app = createApp({
            setup() {
                // 当前活跃的 Tab (0=main, 1=devtools, 2=cocos, 3=ext)
                const activeTab = ref(0);
                
                // 分辨率控制
                const selectedResolution = ref('FIT');
                const isLandscape = ref(false);
                const wrapperSize = ref({ width: 0, height: 0 });

                // Vue Ref
                const gameView = ref(null);
                const devtoolsView = ref(null);
                const wrapMount = ref(null);

                // Split Pane Dragger State
                const rightPanelWidth = ref(400);
                const isDragging = ref(false);

                const startDrag = () => {
                    isDragging.value = true;
                    const onMouseMove = (e: MouseEvent) => {
                        if (!isDragging.value) return;
                        // Cocos Panel Body 内部坐标可能有一些偏移，安全起见采用基于 Movement 差值或者 clientX 推算
                        const newWidth = document.body.clientWidth - e.clientX;
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

                // DevTools 幂等标志（在 onMounted 内的 dom-ready 回调中使用）
                let isDevToolsSetup = false;

                onMounted(() => {
                    const wrap = wrapMount.value;
                    if (wrap) {
                        try {
                            new ResizeObserver(entries => {
                                wrapperSize.value.width = entries[0].contentRect.width;
                                wrapperSize.value.height = entries[0].contentRect.height;
                            }).observe(wrap);
                        } catch (e) {
                            // Electron 版本过低兜底
                            wrapperSize.value.width = wrap.clientWidth;
                            wrapperSize.value.height = wrap.clientHeight;
                            window.addEventListener('resize', () => {
                                wrapperSize.value.width = wrap.clientWidth;
                                wrapperSize.value.height = wrap.clientHeight;
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
                                Editor.info('[Bridge] 收到 Webview 握手:\n', event.args[0]);
                                gameViewDynamic.send('ping-pong-reply', 'Pong from Electron Tab Panel');
                            } else if (event.channel === 'handshake') {
                                Editor.info('[Bridge] 核心探针就绪，握手成功. Cocos:', event.args[0].version);
                                globalState.cocosInfo = event.args[0];
                            } else if (event.channel === 'update-tree') {
                                try {
                                    globalState.nodeTree = JSON.parse(event.args[0]);
                                    globalState.lastTreeUpdate = Date.now();
                                } catch(e) {}
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
                                                        var result = { tree: serializeNode(scene), version: eng.ENGINE_VERSION };
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
                                                    if (parsed.version && !globalState.cocosInfo) {
                                                        globalState.cocosInfo = { version: parsed.version, isNative: false, isMobile: false, language: 'unknown (fallback)' };
                                                    }
                                                    globalState.lastTreeUpdate = Date.now();
                                                } catch(e) {}
                                            }
                                        }).catch(()=>{});
                                    } catch(err) {}
                                }
                            }, 2000);
                        };

                        // dom-ready 后 5 秒超时启动降级轮询（如果探针的正常数据流还没建立的话）
                        gameViewDynamic.addEventListener('dom-ready', () => {
                            Editor.info('[Bridge] Webview dom-ready 触发，5 秒后检查探针状态...');
                            setTimeout(() => {
                                if (!globalState.cocosInfo) {
                                    Editor.warn('[Bridge] 5 秒超时：探针握手仍未收到，启动降级轮询');
                                    startFallbackPolling();
                                } else {
                                    Editor.info('[Bridge] 探针已正常工作，降级轮询不启动');
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
                        Editor.info('[Bridge-P7] activeTab === 1，启动 Phase 7 BrowserView 方案...');
                        
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
                                Editor.error('[Bridge-P7] 失败：超时。');
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

                                Editor.info(`[Bridge-P7] 游戏 WebContents ID: ${gid}，开始创建 BrowserView...`);

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

                                Editor.info('[Bridge-P7] √ setDevToolsWebContents + openDevTools 执行完毕！');

                                // 定位 BrowserView
                                updateBrowserViewBounds();
                                
                                isDevToolsSetup = true;
                                globalState.devToolsError = null;
                                Editor.info('[Bridge-P7] √ BrowserView DevTools 挂载完成！');

                            } catch (e: any) {
                                Editor.error('[Bridge-P7] 异常: ' + e.message);
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
                            } catch (e) {}
                            await nextTick();
                            updateBrowserViewBounds();
                        } else {
                            // 切出 DevTools Tab => 隐藏 BrowserView
                            try {
                                currentWindow.removeBrowserView(devToolsBV);
                            } catch (e) {}
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
                        return { width: '100%', height: '100%', position: 'relative' };
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
                        width: targetW + 'px',
                        height: targetH + 'px',
                        left: '50%',
                        top: '50%',
                        position: 'absolute',
                        transform: `translate(-50%, -50%) scale(${scale})`,
                        transformOrigin: 'center center'
                    };
                });

                const rotateScreen = () => { isLandscape.value = !isLandscape.value; };
                const refreshGame = () => {
                    const wv: any = gameView.value;
                    if (wv) wv.reload();
                };

                const executeMacro = (command: string) => {
                    Editor.info(`[Bridge] 面板发出宏命令: ${command}`);
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
                                        eng.game.step();
                                    } else if ('${command}' === 'fps') {
                                        eng.debug.setDisplayStats(!eng.debug.isDisplayStats());
                                    }
                                }
                            `;
                            wv.executeJavaScript(code);
                        } catch(e) {}
                    }
                    else Editor.warn('[Bridge] 找不到 game-view，宏发送失败');
                };

                const togglePause = () => { executeMacro('pause'); };
                const stepGame = () => { executeMacro('step'); };
                const toggleFPS = () => { executeMacro('fps'); };

                // 回退方案：在独立窗口中打开 DevTools
                const openDevToolsExternal = () => {
                    try {
                        const gameViewEl: any = gameView.value;
                        if (gameViewEl) {
                            const gid = gameViewEl.getWebContentsId();
                            const gWC = remote.webContents.fromId(gid);
                            if (gWC) {
                                gWC.openDevTools({ mode: 'undocked' });
                                Editor.info('[Bridge] 已在独立窗口中打开 DevTools');
                            }
                        }
                    } catch (err: any) {
                        Editor.error('[Bridge] 独立窗口 DevTools 也无法打开:', err.message);
                    }
                };

                return {
                    activeTab,
                    selectedResolution,
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
