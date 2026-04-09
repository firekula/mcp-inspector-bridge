'use strict';
import * as WebSocket from 'ws';
// Removed Node path import; using custom getBaseName function
import { startMcpRouter } from './ipc-router';
declare const Editor: any;

let _isSceneActive = false;

/**
 * 跨平台路径 Basename 提取工具（不依赖 Node.js path 模块）
 * 用于在编辑器不同环境（Main/Render）下安全获取工程目录名
 * @param p 待处理的完整路径字符串
 * @returns 路径的最后一个片段（项目文件夹名称）
 */
function getBaseName(p: string): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

let _wss: WebSocket.Server | null = null;
let _mcpStatus = { active: false, port: 4456, error: 'Initializing...' };
let _logHeartbeatTimer: any = null;

/**
 * mcp-inspector-bridge: 主进程入口
 */
module.exports = {
    load() {
        // [Backend] 启动时假定场景还未完全就绪，等待 scene:ready
        _isSceneActive = false;
        try {
            const router = startMcpRouter((status: any) => {
                _mcpStatus = { ...status, projectName: getBaseName(Editor.Project.path || ''), projectPath: Editor.Project.path || '' };
                Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-status-changed', _mcpStatus);
                if (status.active) {
                    Editor.log(`[MCP] Bridge started on ws://localhost:${status.port}`);
                } else if (status.error) {
                    Editor.error(`[MCP] WebSocket server error on port ${status.port}:`, status.error);
                }
            });
            (_wss as any) = router;
        } catch(err: any) {
            _mcpStatus = { active: false, port: 4456, error: err.message || 'Unknown error' };
            Editor.Ipc.sendToPanel('mcp-inspector-bridge', 'mcp-status-changed', _mcpStatus);
            Editor.error('[MCP] Failed to start WebSocket server:', err);
        }


        // 立即进入激进的全天候日志监听器自动注入探测（用于彻底捕获极早期的报错）
        _logHeartbeatTimer = setInterval(async () => {
            try {
                const { initCdpLogListener, getCdpStatus } = require('./cdp-log-listener');
                const status = getCdpStatus();
                if (!status.attached) {
                    await initCdpLogListener(true);
                }
            } catch (e) {}
        }, 1000);
    },

    unload() {
        if (_wss) {
            _wss.close();
            _wss = null;
        }
        if (_logHeartbeatTimer) {
            clearInterval(_logHeartbeatTimer);
            _logHeartbeatTimer = null;
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
        },
        'mcp-scan-clients'(event: any) {
            try {
                const { scanMcpClients } = require('./mcp-client/configurator');
                const list = scanMcpClients();
                if (event.reply) event.reply(null, list);
            } catch(e: any) {
                if (event.reply) event.reply(new Error("scan 出错: " + e.message));
            }
        },
        'mcp-get-payload'(event: any) {
            try {
                const { getPayload } = require('./mcp-client/configurator');
                const pl = getPayload();
                if (event.reply) event.reply(null, pl);
            } catch(e: any) {
                if (event.reply) event.reply(new Error("payload 出错: " + e.message));
            }
        },
        'mcp-inject-client'(event: any, clientId: number) {
            try {
                const { injectMcpConfig } = require('./mcp-client/configurator');
                const log = injectMcpConfig(clientId === -1 ? undefined : clientId);
                if (event.reply) event.reply(null, log);
            } catch (e: any) {
                if (event.reply) event.reply(null, "配置写入报错: " + e.message);
            }
        },
        'query-cdp-logs'(event: any, args: any) {
            // 懒启动 CDP 监听器（首次查询时自动 attach）
            async function handle() {
                try {
                    const { initCdpLogListener, getCdpLogs, getCdpStatus } = require('./cdp-log-listener');

                    const status = getCdpStatus();
                    if (!status.attached) {
                        const ok = await initCdpLogListener();
                        if (!ok) {
                            Editor.log('[CDP Log] 懒启动未找到预览页面 WebContents');
                        }
                    }

                    if (event.reply) {
                        const logs = await getCdpLogs(args?.tail || 50, args?.level || 'all');
                        // ★ 返回诊断信息：CDP 连接状态 + 日志数据
                        event.reply(null, {
                            _debug: { ...getCdpStatus(), ts: Date.now() },
                            result: logs,
                        });
                    }
                } catch (e: any) {
                    if (event.reply) {
                        event.reply(null, { error: e.message, _debug: { attached: false, size: 0 } });
                    }
                }
            }
            handle();
        }
    },
};
