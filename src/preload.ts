const { ipcRenderer } = require('electron');

// ===== 全局拦截 Web Audio 节点，以旁路捕获游戏所有的声音轨道 =====
let globalAudioDestination: any = null;
if (typeof AudioNode !== 'undefined' && AudioNode.prototype) {
    const originalConnect = AudioNode.prototype.connect;
    (AudioNode.prototype as any).connect = function(destination: any, output?: number, input?: number) {
        // 执行原始连接以防破坏物理输出
        const result = originalConnect.apply(this, arguments as any);
        
        // 当节点连接到扬声器 (context.destination) 时，双路连接至我们的录音节点
        if (destination && this.context && destination === this.context.destination) {
            try {
                if (!globalAudioDestination) {
                    globalAudioDestination = (this.context as any).createMediaStreamDestination();
                }
                originalConnect.call(this, globalAudioDestination);
            } catch (e) {
                // 忽略异常，防重复连接等问题
            }
        }
        return result;
    };
}

/**
 * 注入到 Webview 的预加载脚本 (Preload.js)
 * 在沙盒环境与主/面板进程间充当网桥
 *
 * 【Phase 4 重构】移除了错误的 isTopFrame 分流逻辑。
 * Cocos Creator 2.4.x 的预览页面没有子 iframe，cc 引擎直接运行在顶层 window 中。
 * Therefore preload 必须在顶层直接挂载通信桥 + 注入探针。
 */
window.addEventListener('DOMContentLoaded', () => {
    // ===== 1. 隐藏 Cocos 预览页多余的工具栏 =====
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
        .toolbar { display: none !important; opacity: 0 !important; height: 0 !important; }
        .content { top: 0px !important; bottom: 0px !important; padding: 0 !important; border: none !important; margin: 0 !important; height: 100% !important; }
        body, html { overflow: hidden !important; background: transparent !important; }
        .content, .contentWrap, .wrapper, #GameDiv {
            width: 100% !important;
            height: 100% !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
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
        }
    `;
    if (document.head) {
        document.head.appendChild(style);
    }

    // ===== 2. 兼容性后备：监听可能存在的子 iframe 的 postMessage =====
    // 如果未来有旧版 Cocos 预览页使用 <iframe id="GameDiv"> 包裹器，
    // 子框架中的探针可以通过 postMessage 跳板到此处转发。
    window.addEventListener('message', (e) => {
        if (e.data && e.data.__mcp_ipc_proxy) {
            ipcRenderer.sendToHost(e.data.channel, ...e.data.args);
        }
    });

    // ===== 5. 接收面板的跨层宏通信 =====
    ipcRenderer.on('macro-command', (_event: any, cmd: string) => {
        // @ts-ignore
        if (typeof window.cc === 'undefined' || !window.cc.game) {
            console.warn('[Webview Preload] 引擎 cc 尚未就绪，忽略指令', cmd);
            return;
        }

        // @ts-ignore
        const engine = window.cc;

        switch (cmd) {
            case 'pause':
                if (engine.game.isPaused()) engine.game.resume();
                else engine.game.pause();
                break;
            case 'step':
                engine.game.step();
                break;
            case 'fps':
                engine.debug.setDisplayStats(!engine.debug.isDisplayStats());
                break;
        }
    });

    // ===== 6. 在顶层直接挂载通信接口 (不再等待不存在的子 iframe) =====
    (window as any).__mcpInspector = {
        updateTree: (treeData: string) => {
            ipcRenderer.sendToHost('update-tree', treeData);
        },
        updateEnv: (envData: any) => {
            ipcRenderer.sendToHost('update-env', envData);
        },
        sendLog: (logData: string) => {
            ipcRenderer.sendToHost('send-log', logData);
        },
        sendHandshake: (info: any) => {
            ipcRenderer.sendToHost('handshake', info);
        },
        sendRenderDebuggerPayload: (payload: any) => {
            ipcRenderer.sendToHost('render-debugger-payload', payload);
        },
        sendNodeSelected: (uuid: string) => {
            ipcRenderer.sendToHost('node-picker-selected', uuid);
        },
        sendClearSelection: () => {
            ipcRenderer.sendToHost('clear-selection');
        }
    };

    // ===== 7. 在顶层直接注入运行树爬虫 probe.js =====
    try {
        const fs = require('fs');
        const path = require('path');
        const crawlerContent = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf-8');
        const crawlerScript = document.createElement('script');
        crawlerScript.textContent = crawlerContent;
        if (document.head) {
            document.head.appendChild(crawlerScript);
        } else {
            console.error('[Webview Preload] document.head 不存在，无法注入 probe.js');
        }
    } catch (err) {
        console.error('[Webview Preload] 无法注入 probe.js:', err);
    }

    // ===== 8. 子 iframe 兼容嗅探 (旧版 Cocos 预览页) =====
    // 某些旧版 Cocos Creator 可能使用 <iframe id="GameDiv"> 包裹游戏。
    // 检测并额外向子框架注入探针（如果存在的话）。
    setTimeout(() => {
        try {
            const gameDiv = document.getElementById('GameDiv') as HTMLIFrameElement | null;
            if (gameDiv && gameDiv.tagName === 'IFRAME' && gameDiv.contentWindow) {

                // 在子 iframe 中挂载跳板版通信接口（通过 postMessage 回传到顶层）
                const subframeBootstrap = `
                    (function() {
                        if (window.__mcpInspector) return; // 已有，跳过
                        window.__mcpInspector = {
                            updateTree: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'update-tree', args: [data] }, '*'); },
                            updateEnv: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'update-env', args: [data] }, '*'); },
                            sendLog: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'send-log', args: [data] }, '*'); },
                            sendHandshake: function(info) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'handshake', args: [info] }, '*'); },
                            sendRenderDebuggerPayload: function(payload) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'render-debugger-payload', args: [payload] }, '*'); },
                            sendNodeSelected: function(uuid) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'node-picker-selected', args: [uuid] }, '*'); },
                            sendClearSelection: function() { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'clear-selection', args: [] }, '*'); }
                        };
                    })();
                `;

                // 注入通信桥
                const bridgeScript = gameDiv.contentWindow.document.createElement('script');
                bridgeScript.textContent = subframeBootstrap;
                gameDiv.contentWindow.document.head.appendChild(bridgeScript);

                // 注入树节点爬虫
                const fs2 = require('fs');
                const path2 = require('path');
                const crawlerContent2 = fs2.readFileSync(path2.join(__dirname, 'probe.js'), 'utf-8');
                const crawlerScript2 = gameDiv.contentWindow.document.createElement('script');
                crawlerScript2.textContent = crawlerContent2;
                gameDiv.contentWindow.document.head.appendChild(crawlerScript2);
            }
        } catch (err) {
        }
    }, 1000); // 延迟 1 秒等待子 iframe 加载

    // ===== 9. 录屏功能底层捕获与生命周期调度 =====
    let mediaRecorder: any = null;
    let recordedChunks: any[] = [];
    let recordAnimFrameId: number | null = null;

    function startRecording(fps: number, scale: number) {
        const MAX_SIZE = 4096; // 4096px 物理边界截断保护
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            ipcRenderer.sendToHost('record-error', '未找到游戏画板 GameCanvas');
            return;
        }

        let recordStream;
        let isDrawing = true;

        if (scale !== 1.0) {
            const offscreen = document.createElement('canvas');
            let w = canvas.width * scale;
            let h = canvas.height * scale;
            if (w > MAX_SIZE || h > MAX_SIZE) {
                const minRatio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
                w = Math.round(w * minRatio);
                h = Math.round(h * minRatio);
                console.warn(`[Record] 录制缩放超限，已限缩至最高分辨率边界: ${w}x${h}`);
            }
            offscreen.width = w;
            offscreen.height = h;
            const ctx = offscreen.getContext('2d');
            
            const drawFrame = () => {
                if (!isDrawing) return;
                if (ctx) {
                    ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
                }
                recordAnimFrameId = requestAnimationFrame(drawFrame);
            };
            drawFrame();

            try {
                recordStream = (offscreen as any).captureStream(fps);
            } catch (e) {
                recordStream = (offscreen as any).captureStream();
            }
        } else {
            try {
                recordStream = (canvas as any).captureStream(fps);
            } catch (e) {
                recordStream = (canvas as any).captureStream();
            }
        }

        // 尝试混入游戏声音轨道
        if (globalAudioDestination && globalAudioDestination.stream) {
            const audioTracks = globalAudioDestination.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                try {
                    const combinedStream = new MediaStream();
                    const videoTracks = recordStream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        combinedStream.addTrack(videoTracks[0]);
                    }
                    combinedStream.addTrack(audioTracks[0]);
                    recordStream = combinedStream;
                } catch (mixErr) {
                    // 默默忽略，不干扰控制台
                }
            }
        }

        recordedChunks = [];
        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm;codecs=vp8' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }

        try {
            mediaRecorder = new MediaRecorder(recordStream, options);
            mediaRecorder.ondataavailable = (event: any) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            mediaRecorder.onstop = () => {
                isDrawing = false;
                if (recordAnimFrameId) {
                    cancelAnimationFrame(recordAnimFrameId);
                    recordAnimFrameId = null;
                }
                const blob = new Blob(recordedChunks, { type: options.mimeType });
                const reader = new FileReader();
                reader.onload = () => {
                    ipcRenderer.sendToHost('record-complete', reader.result);
                };
                reader.readAsArrayBuffer(blob);
            };
            mediaRecorder.start(1000);
            ipcRenderer.sendToHost('record-status-changed', { recording: true });
        } catch (e: any) {
            isDrawing = false;
            if (recordAnimFrameId) cancelAnimationFrame(recordAnimFrameId);
            ipcRenderer.sendToHost('record-error', '录制初始化失败: ' + e.message);
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    ipcRenderer.on('record-command', (_event: any, args: any) => {
        const data = typeof args === 'string' ? { action: args } : args;
        if (data.action === 'start') {
            startRecording(data.fps || 30, data.scale || 1.0);
        } else if (data.action === 'stop') {
            stopRecording();
        }
    });
});
