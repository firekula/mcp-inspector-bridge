'use strict';
import * as WebSocket from 'ws';
declare const Editor: any;

let _isSceneActive = false;

let _wss: WebSocket.Server | null = null;
let _mcpStatus = { active: false, port: 4456, error: 'Initializing...' };

/**
 * mcp-inspector-bridge: 主进程入口
 */
module.exports = {
    load() {
        // [Backend] 启动时假定场景还未完全就绪，等待 scene:ready
        _isSceneActive = false;
        
        try {
            _wss = new WebSocket.Server({ port: 4456 });
            _wss.on('connection', (ws) => {
                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        if (data.type === 'ping') {
                            ws.send(JSON.stringify({ type: 'pong' }));
                        } else if (data.method === 'tools/call' && data.params && data.params.name === 'get_selected_node') {
                            const reqId = data.id || Date.now().toString();
                            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-query-selected-node', reqId, (err: any, res: any) => {
                                let contentText = '';
                                if (err || !res || res.error) {
                                    contentText = JSON.stringify({ error: err || (res && res.error) || 'Unknown IPC error' });
                                } else if (!res.result) {
                                    contentText = "未选中任何节点。";
                                } else {
                                    contentText = JSON.stringify(res.result, null, 2) + "\n\n*注意：修改此节点请使用 execute_cocos_script 工具，并调用 cc.find('...') 获取引用。*";
                                }
                                ws.send(JSON.stringify({
                                    jsonrpc: "2.0",
                                    id: reqId,
                                    result: {
                                        content: [{ type: "text", text: contentText }]
                                    }
                                }));
                            }, 2000);
                        }
                    } catch(e) {}
                });
            });
            _mcpStatus = { active: true, port: 4456, error: '' };
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-status-changed', _mcpStatus);
            Editor.log('[MCP] Bridge started on ws://localhost:4456');
        } catch(err: any) {
            _mcpStatus = { active: false, port: 4456, error: err.message || 'Unknown error' };
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-status-changed', _mcpStatus);
            Editor.error('[MCP] Failed to start WebSocket server:', err);
        }
    },

    unload() {
        if (_wss) {
            _wss.close();
            _wss = null;
        }
    },

    // 注册跨进程 IPC 消息侦听器
    messages: {
        'scene:ready'() {
            _isSceneActive = true;
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'scene-status-changed', { active: true });
        },
        'scene:reloading'() {
            _isSceneActive = false;
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'scene-status-changed', { active: false });
        },
        'scene:closed'() {
            _isSceneActive = false;
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'scene-status-changed', { active: false });
        },
        'open'() {
            // 收到菜单指令，打开主面板
            Editor.Panel.open('mcp-inspector-bridge');
        },
        'query-scene-active'(event: any) {
            if (event.reply) {
                // 也可通过向 scene 面板发信检查双保险
                const active = _isSceneActive !== false;
                event.reply(null, active);
            }
        },
        'query-mcp-status'(event: any) {
            if (event.reply) {
                event.reply(null, _mcpStatus);
            }
        },
        'query-node-tree'(event: any) {
            // 目前已经通过 probe/crawler 脚本使用了 setInterval 自动轮询并通过
            // __mcpInspector.updateTree 自动推送。
            // 这里保留该接口为下阶段“按需主动拉取”做能力支持，当面板明确通知主进程强制刷新时，从此处处理。
            // 由于当前插件直接使用 <webview> 或前端控制的 BrowserView，主进程暂只作转发标记即可。
            // 后续如有明确需求，此处可直接获取对应 webContents ID 执行 JS.
            if (event.reply) {
                event.reply(null, { status: "polling_active", msg: "已经由注入的爬虫自动同步数据" });
            }
        },
        'query-resolution'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('last-resolution') || 'FIT';
            if (event.reply) {
                event.reply(null, res);
            }
        },
        'save-resolution'(event: any, value: string) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('last-resolution', value);
            profile.save();
        },
        'query-fps'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('show-fps');
            if (event.reply) {
                event.reply(null, res === undefined ? false : res);
            }
        },
        'save-fps'(event: any, value: boolean) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('show-fps', value);
            profile.save();
        },
        'query-audio-mute'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('audio-mute');
            if (event.reply) {
                event.reply(null, res === undefined ? false : res);
            }
        },
        'save-audio-mute'(event: any, value: boolean) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('audio-mute', value);
            profile.save();
        },
        'query-panel-width'(event: any) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            const res = profile.get('panel-width');
            if (event.reply) {
                event.reply(null, res === undefined ? 400 : res);
            }
        },
        'save-panel-width'(event: any, value: number) {
            const profile = Editor.Profile.load('profile://project/mcp-inspector-bridge.json', 'mcp-inspector-bridge');
            profile.set('panel-width', value);
            profile.save();
        },
        'query-preview-port'(event: any) {
            let port = 7456;
            
            try {
                if (typeof Editor !== 'undefined' && Editor.PreviewServer) {
                    if ((Editor.PreviewServer as any)._previewPort) {
                        port = (Editor.PreviewServer as any)._previewPort;
                    }
                }
            } catch(e) {}
            
            // 策略 2: profile 取值备用
            if (port === 7456) {
                try {
                    const profile = Editor.Profile.load('profile://global/settings.json');
                    if (profile && profile.data && profile.data['preview-port']) {
                        port = profile.data['preview-port'];
                    }
                } catch (e) {}
            }

            if (event.reply) {
                event.reply(null, port);
            }
        }
    },
};
