'use strict';
declare const Editor: any;

let _isSceneActive = false;

/**
 * mcp-inspector-bridge: 主进程入口
 */
module.exports = {
    load() {
        // [Backend] 启动时假定场景还未完全就绪，等待 scene:ready
        _isSceneActive = false;
    },

    unload() {
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
        }
    },
};
