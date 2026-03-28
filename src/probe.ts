// @ts-nocheck
(function () {
    // 幂等性防护：防止 webview 刷新后探针被重复注入导致定时器累积
    if (window.__mcpProbeInitialized) {
        console.warn('[Probe] 探针已初始化过，跳过重复注入');
        return;
    }

    const DEBUG_INTERVAL = 1000;
    
    function initProbe() {
        try {
            if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene()) {
                setTimeout(initProbe, 500);
                return;
            }
            
            console.log('[Probe] Cocos 引擎已就绪，探针初始化完成: v' + cc.ENGINE_VERSION);
            
            // 通知中控面板握手完成
            window.__mcpInspector.sendHandshake({
                version: cc.ENGINE_VERSION,
                isNative: cc.sys.isNative,
                isMobile: cc.sys.isMobile,
                language: cc.sys.language
            });

            // 定期提取节点树 (可优化为脏检测机制，此处暂以 interval 替代)
            setInterval(syncNodeTree, DEBUG_INTERVAL);

            // 标记探针已初始化完成，防止重复注入
            window.__mcpProbeInitialized = true;
        } catch (err) {
            console.error('[Probe] 初始化探针发生致命异常:', err);
            const envData = {
                url: window.location.href,
                hasCC: typeof cc !== 'undefined',
                error: err.message || err.toString(),
                stack: err.stack
            };
            if (window.__mcpInspector && window.__mcpInspector.sendLog) {
                window.__mcpInspector.sendLog('[Probe Crash] ' + JSON.stringify(envData));
            }
        }
    }
    
    function syncNodeTree() {
        const scene = cc.director.getScene();
        if (!scene) return;
        
        const treeData = serializeNode(scene);
        const pauseStatus = (typeof cc.game !== 'undefined' && cc.game.isPaused) ? cc.game.isPaused() : false;
        window.__mcpInspector.updateTree(JSON.stringify({ tree: treeData, isPaused: pauseStatus }));
    }
    
    function serializeNode(node) {
        if (!node) return null;
        let isActive = true;
        let isActiveInHierarchy = true;
        
        // 彻底规避 cc.Scene 会在 getter 内部直接用 cc.error 打印日志的问题
        // 无论是否包裹在 catch 中，只要触发 getter 都会有红字报错
        if (typeof cc !== 'undefined' && node instanceof cc.Scene) {
            isActive = true;
            isActiveInHierarchy = true;
        } else {
            try {
                isActive = node.active !== false;
                isActiveInHierarchy = node.activeInHierarchy !== false;
            } catch (e) {}
        }

        const data = {
            id: node.uuid,
            name: node.name,
            active: isActive,
            activeInHierarchy: isActiveInHierarchy,
            childrenCount: node.childrenCount,
            components: node._components ? node._components.length : 0,
            children: []
        };
        
        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                data.children.push(serializeNode(node.children[i]));
            }
        }
        return data;
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initProbe();
    } else {
        window.addEventListener('DOMContentLoaded', initProbe);
    }
})();
