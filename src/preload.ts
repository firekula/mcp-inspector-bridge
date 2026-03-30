const { ipcRenderer } = require('electron');

/**
 * 注入到 Webview 的预加载脚本 (Preload.js)
 * 在沙盒环境与主/面板进程间充当网桥
 *
 * 【Phase 4 重构】移除了错误的 isTopFrame 分流逻辑。
 * Cocos Creator 2.4.x 的预览页面没有子 iframe，cc 引擎直接运行在顶层 window 中。
 * 因此 preload 必须在顶层直接挂载通信桥 + 注入探针。
 */
window.addEventListener('DOMContentLoaded', () => {
    // ===== 1. 隐藏 Cocos 预览页多余的工具栏 =====
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
        .toolbar { display: none !important; opacity: 0 !important; height: 0 !important; }
        .content { top: 0px !important; bottom: 0px !important; padding: 0 !important; border: none !important; margin: 0 !important; height: 100% !important; }
        body, html { overflow: hidden !important; background: transparent !important; }
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
        sendLog: (logData: string) => {
            ipcRenderer.sendToHost('send-log', logData);
        },
        sendHandshake: (info: any) => {
            ipcRenderer.sendToHost('handshake', info);
        },
        sendRenderDebuggerPayload: (payload: any) => {
            ipcRenderer.sendToHost('render-debugger-payload', payload);
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
                            sendLog: function(data) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'send-log', args: [data] }, '*'); },
                            sendHandshake: function(info) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'handshake', args: [info] }, '*'); },
                            sendRenderDebuggerPayload: function(payload) { window.parent.postMessage({ __mcp_ipc_proxy: true, channel: 'render-debugger-payload', args: [payload] }, '*'); }
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
});
