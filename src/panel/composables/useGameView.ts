const { ref, watch } = require('vue');
declare const Editor: any;

export function useGameView(
    globalState: any,
    gameView: any,
    nodeTreeRef: any,
    rightPanelWidth: any,
    selectedResolution: any,
    onNodeSelectFallback: any,
    onStartPolling?: () => void,
    onStopPolling?: () => void
) {
    const isShowFPS = ref(false);
    const isAudioMuted = ref(false);

    let hasInitialRefreshed = false;
    let isEnvInitialized = false;
    let pendingRefresh = false;

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
            console.warn('[Bridge] 找不到 game-view，宏发送失败');
        }
    };

    function refreshGame() {
        if (!globalState.isEditorSceneActive) {
            console.warn('[Bridge] 场景未激活，刷新操作暂被拦截以防报错。');
            return;
        }

        const wv: any = gameView.value;
        if (wv && (wv.clientWidth === 0 || wv.clientHeight === 0)) {
            console.log('[Bridge] 面板处于后台或可见区域为零，当前刷新请求已被防黑屏机制挂起 (Pending Refresh)...');
            pendingRefresh = true;
            return;
        }

        console.log('[Bridge] 触发手动刷新重载游戏视图...');
        pendingRefresh = false;

        globalState.isGamePaused = false;
        globalState.nodeTree = null;
        globalState.lastTreeUpdate = 0;

        if (!globalState.webviewSrc || !globalState.webviewSrc.includes('localhost:')) {
            globalState.webviewSrc = `http://localhost:${globalState.previewPort}`;
        } else if (wv && typeof wv.reload === 'function') {
            try { wv.reload(); } catch (e) { }
        }
    }

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

    const takeScreenshot = () => {
        const wv: any = gameView.value;
        if (!wv) {
            console.warn('[Bridge] 找不到 game-view，截图失败');
            return;
        }
        // 深拷贝：Vue reactive Proxy 对象无法通过 Electron IPC 结构化克隆传递
        const rawDr = globalState.cocosInfo?.designResolution;
        const dr = (rawDr && rawDr.width) ? { width: Number(rawDr.width), height: Number(rawDr.height) } : { width: 0, height: 0 };
        if (typeof Editor !== 'undefined') {
            Editor.Ipc.sendToMain('mcp-inspector-bridge:screenshot-capture', { designResolution: dr });
        }
    };

    const isRecording = ref(false);
    let recordStartTime = 0;

    const fixWebmDuration = (blob: Blob, durationMs: number): Promise<Blob> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const buffer = reader.result as ArrayBuffer;
                const view = new DataView(buffer);
                
                let infoPos = -1;
                const len = buffer.byteLength;
                for (let i = 0; i < len - 4; i++) {
                    if (view.getUint8(i) === 0x15 && 
                        view.getUint8(i+1) === 0x49 && 
                        view.getUint8(i+2) === 0xA9 && 
                        view.getUint8(i+3) === 0x66) {
                        infoPos = i;
                        break;
                    }
                }
                
                if (infoPos === -1) {
                    resolve(blob);
                    return;
                }
                
                let durationPos = -1;
                const searchLimit = Math.min(infoPos + 150, len - 4);
                for (let i = infoPos; i < searchLimit; i++) {
                    if (view.getUint8(i) === 0x44 && view.getUint8(i+1) === 0x89) {
                        durationPos = i;
                        break;
                    }
                }
                
                if (durationPos === -1) {
                    resolve(blob);
                    return;
                }
                
                const lenByte = view.getUint8(durationPos + 2);
                let dataLen = 0;
                let valPos = 0;
                
                if ((lenByte & 0x80) === 0x80) {
                    dataLen = lenByte & 0x7F;
                    valPos = durationPos + 3;
                } else if ((lenByte & 0x40) === 0x40) {
                    dataLen = ((lenByte & 0x3F) << 8) | view.getUint8(durationPos + 3);
                    valPos = durationPos + 4;
                }
                
                if (dataLen === 4 && valPos + 4 <= len) {
                    view.setFloat32(valPos, durationMs, false);
                } else if (dataLen === 8 && valPos + 8 <= len) {
                    view.setFloat64(valPos, durationMs, false);
                }
                
                resolve(new Blob([buffer], { type: blob.type }));
            };
            reader.readAsArrayBuffer(blob);
        });
    };

    const startRecord = () => {
        const wv: any = gameView.value;
        if (!wv) {
            console.warn('[Bridge] 找不到 game-view，录屏失败');
            return;
        }
        recordStartTime = Date.now();
        wv.send('record-command', {
            action: 'start',
            fps: globalState.recordFps || 30,
            scale: globalState.recordScale || 1.0
        });
    };

    const stopRecord = () => {
        const wv: any = gameView.value;
        if (!wv) return;
        wv.send('record-command', { action: 'stop' });
    };

    const getFfmpegPath = (): string => {
        const path = require('path');
        const fs = require('fs');
        
        let rootPath = '';
        if (typeof Editor !== 'undefined' && typeof Editor.url === 'function') {
            try {
                rootPath = Editor.url('packages://mcp-inspector-bridge');
            } catch (e) {}
        }
        
        if (!rootPath) {
            try {
                rootPath = path.join(__dirname, '..', '..');
            } catch (e) {}
        }

        const isWin = process.platform === 'win32';
        const pathsToTry = isWin ? [
            path.join(rootPath, 'bin', 'win32', 'ffmpeg.exe'),
            path.join(rootPath, 'bin', 'ffmpeg.exe'),
            path.join(rootPath, 'ffmpeg.exe')
        ] : [
            path.join(rootPath, 'bin', 'darwin', 'ffmpeg'),
            path.join(rootPath, 'bin', 'ffmpeg'),
            path.join(rootPath, 'ffmpeg')
        ];

        for (const p of pathsToTry) {
            if (p && fs.existsSync(p)) {
                return p;
            }
        }
        
        return 'ffmpeg';
    };

    const handleSaveVideo = (arrayBuffer: ArrayBuffer) => {
        if (typeof Editor === 'undefined') return;
        
        const duration = Date.now() - recordStartTime;
        const blob = new Blob([arrayBuffer], { type: 'video/webm' });
        
        fixWebmDuration(blob, duration).then((fixedBlob) => {
            const reader = new FileReader();
            reader.onload = () => {
                const fixedBuffer = reader.result as ArrayBuffer;
                const targetFormat = globalState.recordFormat || 'webm';
                
                if (targetFormat === 'mp4') {
                    Editor.Ipc.sendToMain('mcp-inspector-bridge:show-save-video-dialog', { ext: 'mp4' }, (err: any, result: any) => {
                        if (err) {
                            Editor.warn('[Record] 弹出保存框失败:', err.message || err);
                            return;
                        }
                        if (result && !result.canceled && result.filePath) {
                            const ffmpegPath = getFfmpegPath();
                            const { exec } = require('child_process');
                            
                            const checkCmd = ffmpegPath === 'ffmpeg' ? 'ffmpeg -version' : `"${ffmpegPath}" -version`;
                            exec(checkCmd, (ffmpegErr: any) => {
                                if (ffmpegErr) {
                                    const webmPath = result.filePath.replace(/\.mp4$/i, '.webm');
                                    try {
                                        const fs = require('fs');
                                        fs.writeFileSync(webmPath, Buffer.from(fixedBuffer));
                                        Editor.warn('[Record] 未检测到本地或系统安装的 FFmpeg 命令行工具（在插件根目录 bin/win32/ffmpeg.exe 亦未找到），无法自动转为 MP4。已将录像保存为进度条和寻道完美修复的 WebM 视频：', webmPath);
                                    } catch (e: any) {
                                        Editor.warn('[Record] 写入本地视频失败:', e.message);
                                    }
                                } else {
                                    const fs = require('fs');
                                    const path = require('path');
                                    const tempWebmPath = path.join(require('os').tmpdir(), `temp-record-${Date.now()}.webm`);
                                    try {
                                        fs.writeFileSync(tempWebmPath, Buffer.from(fixedBuffer));
                                        
                                        const ffmpegCmd = (c: string) => ffmpegPath === 'ffmpeg' 
                                            ? `ffmpeg -y -i "${tempWebmPath}" ${c} "${result.filePath}"`
                                            : `"${ffmpegPath}" -y -i "${tempWebmPath}" ${c} "${result.filePath}"`;
                                            
                                        const fps = globalState.recordFps || 30;
                                        
                                        // 尝试 1: 使用 libx264 编码器 (H.264)
                                        const cmdX264 = ffmpegCmd(`-vf "fps=${fps}" -c:v libx264 -pix_fmt yuv420p`);
                                        exec(cmdX264, (errX264: any) => {
                                            if (errX264) {
                                                // 尝试 2: 使用 FFmpeg 内置的原生 mpeg4 编码器
                                                const cmdMpeg4 = ffmpegCmd(`-vf "fps=${fps}" -c:v mpeg4 -q:v 3 -pix_fmt yuv420p`);
                                                exec(cmdMpeg4, (errMpeg4: any) => {
                                                    try { fs.unlinkSync(tempWebmPath); } catch (e) {}
                                                    if (errMpeg4) {
                                                        const webmPath = result.filePath.replace(/\.mp4$/i, '.webm');
                                                        try {
                                                            fs.writeFileSync(webmPath, Buffer.from(fixedBuffer));
                                                            Editor.warn('[Record] FFmpeg 转换 MP4 失败，已保存为已修复 WebM 格式。错误信息：', errMpeg4.message);
                                                        } catch (e: any) {
                                                            Editor.warn('[Record] 写入本地视频失败:', e.message);
                                                        }
                                                    } else {
                                                        Editor.log('录屏文件已保存到:', result.filePath);
                                                    }
                                                });
                                            } else {
                                                try { fs.unlinkSync(tempWebmPath); } catch (e) {}
                                                Editor.log('录屏文件已保存到:', result.filePath);
                                            }
                                        });
                                    } catch (e: any) {
                                        try { fs.unlinkSync(tempWebmPath); } catch (err) {}
                                        Editor.warn('[Record] 写入临时文件失败:', e.message);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    Editor.Ipc.sendToMain('mcp-inspector-bridge:show-save-video-dialog', { ext: 'webm' }, (err: any, result: any) => {
                        if (err) {
                            Editor.warn('[Record] 弹出保存框失败:', err.message || err);
                            return;
                        }
                        if (result && !result.canceled && result.filePath) {
                            try {
                                const fs = require('fs');
                                fs.writeFileSync(result.filePath, Buffer.from(fixedBuffer));
                                Editor.log('录屏文件已保存到:', result.filePath);
                            } catch (e: any) {
                                Editor.warn('[Record] 写入本地视频失败:', e.message);
                            }
                        }
                    });
                }
            };
            reader.readAsArrayBuffer(fixedBlob);
        });
    };

    watch(isShowFPS, (newVal: boolean) => {
        if (newVal) {
            onStartPolling?.();
        } else {
            onStopPolling?.();
        }
        try {
            Editor.Ipc.sendToMain('mcp-inspector-bridge:save-fps', newVal);
        } catch (e) { }
    });

    watch(isAudioMuted, (newVal: boolean) => {
        try {
            Editor.Ipc.sendToMain('mcp-inspector-bridge:save-audio-mute', newVal);
        } catch (e) { }
    });

    const initializePreviewEnvironment = () => {
        if (isEnvInitialized) return;
        isEnvInitialized = true;

        try {
            const probeAlivePort = async (startPort: number): Promise<number> => {
                for (let p = startPort; p <= startPort + 10; p++) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 800);
                        await fetch(`http://localhost:${p}/settings.js`, { mode: 'no-cors', signal: controller.signal });
                        clearTimeout(timeoutId);
                        console.log(`[Bridge] 成功嗅探到当前真正活跃的预览服务器端口: ${p}`);
                        return p;
                    } catch (e) { }
                }
                console.warn(`[Bridge] 端口自增探针测底失败，被迫退回起始分配端口: ${startPort}`);
                return startPort;
            };

            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                Editor.Ipc.sendToMain('mcp-inspector-bridge:query-preview-port', async (err: any, res: number) => {
                    if (!err && res) {
                        const alivePort = await probeAlivePort(res);
                        globalState.previewPort = alivePort;
                        if (globalState.webviewSrc === 'http://localhost:7456' && alivePort !== 7456) {
                            globalState.webviewSrc = `http://localhost:${alivePort}`;
                        }
                    }
                    refreshGame();
                });
                Editor.Ipc.sendToMain('mcp-inspector-bridge:query-resolution', (err: any, res: string) => {
                    if (!err && res) selectedResolution.value = res;
                });
                Editor.Ipc.sendToMain('mcp-inspector-bridge:query-fps', (err: any, res: boolean) => {
                    if (!err && res !== undefined) isShowFPS.value = res;
                });
                Editor.Ipc.sendToMain('mcp-inspector-bridge:query-audio-mute', (err: any, res: boolean) => {
                    if (!err && res !== undefined) {
                        isAudioMuted.value = res;
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
            } else {
                refreshGame();
            }
        } catch (e) {
            refreshGame();
        }
    };

    let fallbackStarted = false;
    const startFallbackPolling = () => {
        if (fallbackStarted) return;
        fallbackStarted = true;

        setInterval(() => {
            if (globalState.lastTreeUpdate > 0 && (Date.now() - globalState.lastTreeUpdate < 3000)) return;
            const wv: any = gameView.value;
            if (!wv) return;
            if (typeof wv.isConnected === 'boolean' && !wv.isConnected) return;
            try { wv.getWebContentsId(); } catch(e) { return; }
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
                                    if (typeof window.__mcpGetEnvInfo !== 'undefined') {
                                        result.env = window.__mcpGetEnvInfo();
                                    }
                                    return JSON.stringify(result);
                                }
                            }
                            return null;
                        })();
                    `;
                    wv.executeJavaScript(code).then((result: string) => {
                        if (result) {
                            if (!globalState.isFallbackMode) {
                                if (typeof Editor !== 'undefined') {
                                    Editor.warn('[Bridge] 探针 IPC 通道超时，自动切入降级轮询模式 (Fallback Active)');
                                }
                                globalState.isFallbackMode = true;
                            }
                            try {
                                const parsed = JSON.parse(result);
                                globalState.nodeTree = parsed.tree;
                                if (parsed.isPaused !== undefined) {
                                    globalState.isGamePaused = !!parsed.isPaused;
                                }
                                if (parsed.env && globalState.cocosInfo) {
                                    globalState.cocosInfo.downloader = parsed.env.downloader;
                                    globalState.cocosInfo.dynamicAtlas = parsed.env.dynamicAtlas;
                                    globalState.cocosInfo.physics = parsed.env.physics;
                                    globalState.cocosInfo.collision = parsed.env.collision;
                                    
                                    // 保证向下兼容的 fallback
                                    if (parsed.env.dynamicAtlas && parsed.env.dynamicAtlas.atlasCount !== undefined) {
                                        globalState.cocosInfo.dynamicAtlas.atlasCount = parsed.env.dynamicAtlas.atlasCount;
                                    }
                                }
                                if (parsed.version && !globalState.cocosInfo) {
                                    globalState.cocosInfo = { version: parsed.version, isNative: false, isMobile: false, language: 'unknown (fallback)' };
                                }
                                globalState.lastTreeUpdate = Date.now();
                            } catch (e) { }
                        }
                    }).catch(() => { });
            } catch (err) { }
        }, 2000);
    };

    const setupGameViewListeners = () => {
        const gameViewDynamic: any = gameView.value;

        if (typeof window.ResizeObserver !== 'undefined' && gameViewDynamic) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                        if (pendingRefresh) {
                            pendingRefresh = false;
                            console.log('[Bridge] 【防黑屏机制】面板恢复有效视窗尺寸，执行此前拦截的挂起刷新...');
                            refreshGame();
                        }
                    }
                }
            });
            resizeObserver.observe(gameViewDynamic);
        }

        window.addEventListener('scene-status-changed', (e: any) => {
            const wasActive = globalState.isEditorSceneActive;
            globalState.isEditorSceneActive = e.detail && e.detail.active !== false;

            if (wasActive !== globalState.isEditorSceneActive) {
                if (globalState.isEditorSceneActive && !hasInitialRefreshed) {
                    hasInitialRefreshed = true;
                    globalState.lastTreeUpdate = 0;
                    initializePreviewEnvironment();
                }
            }
        });

        try {
            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                Editor.Ipc.sendToMain('mcp-inspector-bridge:query-scene-active', (err: any, isActive: boolean) => {
                    if (!err && isActive !== undefined) {
                        globalState.isEditorSceneActive = isActive;
                        if (isActive && !hasInitialRefreshed) {
                            hasInitialRefreshed = true;
                            globalState.lastTreeUpdate = 0;
                            initializePreviewEnvironment();
                        }
                    }
                });
            } else {
                globalState.isEditorSceneActive = true;
                if (!hasInitialRefreshed) {
                    hasInitialRefreshed = true;
                    globalState.lastTreeUpdate = 0;
                    initializePreviewEnvironment();
                }
            }
        } catch (e) { }

        if (gameViewDynamic) {
            gameViewDynamic.addEventListener('ipc-message', (event: any) => {
                if (event.channel === 'handshake') {
                    try {
                        globalState.cocosInfo = typeof event.args[0] === 'string' ? JSON.parse(event.args[0]) : event.args[0];
                    } catch (e) {
                        globalState.cocosInfo = event.args[0];
                    }
                    setTimeout(() => {
                        // 强制关闭引擎内置 stats（改用插件叠加框展示）
                        try {
                            const __wv: any = gameView.value;
                            if (__wv) {
                                __wv.executeJavaScript(`
                                    try {
                                        if (window.cc && window.cc.debug && typeof window.cc.debug.setDisplayStats === 'function') {
                                            window.cc.debug.setDisplayStats(false);
                                        }
                                    } catch (e) { /* 引擎未完全初始化，静默跳过 */ }
                                `).catch(() => {});
                            }
                        } catch (e) {}
                        // 若叠加框已开启但轮询因 webview 未就绪而失败，此时重试
                        if (isShowFPS.value) {
                            onStartPolling?.();
                        }
                        executeMacro(isAudioMuted.value ? 'mute:true' : 'mute:false');
                    }, 500);
                } else if (event.channel === 'update-tree') {
                    // console.log(`[IPC Received] <- update-tree: size=${event.args[0] ? event.args[0].length : 0}`);
                    try {
                        const parsed = JSON.parse(event.args[0]);
                        if (parsed && typeof parsed.tree !== 'undefined') {
                            globalState.nodeTree = parsed.tree;
                            globalState.isGamePaused = !!parsed.isPaused;
                        } else {
                            globalState.nodeTree = parsed;
                        }
                        globalState.lastTreeUpdate = Date.now();
                        // Removed disruptive onNodeSelectFallback that causes erratic Vue selection bouncing
                    } catch (e) { }
                } else if (event.channel === 'update-env') {
                    try {
                        const parsed = event.args && typeof event.args[0] === 'string' ? JSON.parse(event.args[0]) : event.args[0];
                        if (parsed && globalState.cocosInfo) {
                            globalState.cocosInfo.downloader = parsed.downloader;
                            globalState.cocosInfo.dynamicAtlas = parsed.dynamicAtlas;
                            globalState.cocosInfo.physics = parsed.physics;
                            globalState.cocosInfo.collision = parsed.collision;
                        }
                    } catch(e) {}
                } else if (event.channel === 'render-debugger-payload') {
                    try {
                        const payload = event.args[0];
                        if (payload && payload.type === 'render-debugger:snapshot') {
                            globalState.renderDebugger.snapshots.push(payload.data);
                            if (globalState.renderDebugger.snapshots.length > 5) {
                                globalState.renderDebugger.snapshots.shift();
                            }
                        }
                        window.dispatchEvent(new CustomEvent('render-debugger-payload', { detail: payload }));
                    } catch (err) { }
                } else if (event.channel === 'node-picker-selected') {
                    const uuid = event.args[0];
                    console.log(`[IPC Received] <- node-picker-selected: uuid=${uuid || 'null'}`);
                    console.log(`[Selection-Debug] Trigger: IPC-GameView-node-picker-selected | NodeID: ${uuid} | Proceeding to sync expandToNode...`);
                    try {
                        globalState.isNodePickerActive = false;
                        if (uuid) {
                            const nt: any = nodeTreeRef.value;
                            if (nt && typeof nt.expandToNode === 'function') {
                                const success = nt.expandToNode(uuid);
                                if (!success) {
                                    console.warn(`[Bridge] 节点树缓存中未找到节点(UUID: ${uuid})，启用属性兜底同步`);
                                    onNodeSelectFallback({ id: uuid }, true);
                                    
                                    try {
                                        const syncCode = "if(window.__mcpSyncNodeTree) { window.__mcpSyncNodeTree(); }";
                                        const wv: any = gameView.value;
                                        if (wv && typeof wv.executeJavaScript === 'function') {
                                            wv.executeJavaScript(syncCode).catch(() => {});
                                        }
                                    } catch(err) {}
                                }
                            } else {
                                onNodeSelectFallback({ id: uuid }, true);
                            }
                        } else {
                            globalState.nodeDetail = null;
                            const nt: any = nodeTreeRef.value;
                            if (nt) nt.selectedId = '';
                        }
                    } catch (err) { }
                } else if (event.channel === 'clear-selection') {
                    console.log('[IPC Received] <- clear-selection: clearing panel selection state');
                    globalState.nodeDetail = null;
                    const nt: any = nodeTreeRef.value;
                    if (nt && typeof nt.selectedId !== 'undefined') {
                        nt.selectedId = '';
                    }
                } else if (event.channel === 'record-status-changed') {
                    isRecording.value = !!event.args[0]?.recording;
                } else if (event.channel === 'record-log') {
                    if (typeof Editor !== 'undefined') Editor.log('[Record] ' + event.args[0]);
                } else if (event.channel === 'record-error') {
                    isRecording.value = false;
                    if (typeof Editor !== 'undefined') Editor.warn('[Record] 底层录屏发生异常: ' + event.args[0]);
                } else if (event.channel === 'record-complete') {
                    isRecording.value = false;
                    if (event.args[0]) {
                        handleSaveVideo(event.args[0]);
                    }
                }
            });

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

            window.addEventListener('render-debugger:send-macro', ((e: any) => {
                if (e.detail && gameViewDynamic) {
                    try {
                        gameViewDynamic.executeJavaScript(e.detail).catch(() => { });
                    } catch (err) { }
                }
            }) as EventListener);

            gameViewDynamic.addEventListener('did-start-loading', () => {
                isRecording.value = false;
            });

            gameViewDynamic.addEventListener('dom-ready', () => {
                if (isAudioMuted.value && typeof gameViewDynamic.setAudioMuted === 'function') {
                    try { gameViewDynamic.setAudioMuted(isAudioMuted.value); } catch (e) { }
                }
                executeMacro(isAudioMuted.value ? 'mute:true' : 'mute:false');

                // 强制关闭引擎内置 stats
                try {
                    gameViewDynamic.executeJavaScript(`
                        try {
                            if (window.cc && window.cc.debug && typeof window.cc.debug.setDisplayStats === 'function') {
                                window.cc.debug.setDisplayStats(false);
                            }
                        } catch (e) { /* 引擎未完全初始化，静默跳过 */ }
                    `).catch(() => {});
                } catch (e) {}

                // 若叠加框在 webview 就绪前已开启，补启动轮询
                if (isShowFPS.value) {
                    onStartPolling?.();
                }

                try {
                    const __pIns = gameViewDynamic.insertCSS(`
                        html, body, .content, .contentWrap, .wrapper, #GameDiv {
                            overflow: hidden !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                            max-width: 100vw !important;
                            max-height: 100vh !important;
                            box-sizing: border-box !important;
                        }
                        #GameCanvas {
                            max-width: 100% !important;
                            max-height: 100% !important;
                        }
                        *::-webkit-scrollbar {
                            display: none !important;
                            width: 0 !important;
                            height: 0 !important;
                            background: transparent !important;
                        }
                    `);
                    if (__pIns && __pIns.catch) __pIns.catch(() => { });
                } catch (e) { }

                setTimeout(() => {
                    if (!globalState.cocosInfo && globalState.webviewSrc && globalState.webviewSrc.includes('localhost:')) {
                        if (typeof Editor !== 'undefined') {
                            Editor.warn('[Bridge] 5 秒超时：探针握手仍未收到，启动降级轮询');
                        }
                        startFallbackPolling();
                    }
                }, 5000);
            });
        }
    };

    return {
        isShowFPS,
        isAudioMuted,
        executeMacro,
        refreshGame,
        togglePause,
        stepGame,
        toggleFPS,
        toggleMute,
        takeScreenshot,
        isRecording,
        startRecord,
        stopRecord,
        setupGameViewListeners
    };
}
