'use strict';
declare const Editor: any;

/**
 * mcp-inspector-bridge: 主进程入口
 */
module.exports = {
    load() {
        Editor.log('[mcp-inspector-bridge] 主进程已启动，插件已加载。');
    },

    unload() {
        Editor.log('[mcp-inspector-bridge] 插件卸载。');
    },

    // 注册跨进程 IPC 消息侦听器
    messages: {
        'open'() {
            // 收到菜单指令，打开主面板
            Editor.Panel.open('mcp-inspector-bridge');
        },
        'ping-pong-test'(event: any, msg: string) {
            Editor.info('[mcp-inspector-bridge] 主进程收到来自 Webview / 面板的内容:', msg);
            // 这里可以回传数据给原发件人或做其他处理
        }
    },
};
