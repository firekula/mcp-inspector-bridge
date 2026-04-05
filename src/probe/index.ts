// @ts-nocheck
import { Logger } from './logger';
import { initConsoleHijacker } from './console-hijacker';
import { initCrawler, syncNodeTree } from './crawler';
import { initHighlighter, startHighlighterHook } from './highlighter';
import { initProfiler } from './profiler';
import { initMemory } from './memory';
import { initRenderDebugger } from './render-debugger';
import { initPicker } from './picker';

(function () {
    // 幂等性防护：防止 webview 刷新后探针被重复注入导致定时器累积
    if (window.__mcpProbeInitialized) {
        return;
    }

    // 初始化全局模块暴露区
    initConsoleHijacker();
    initCrawler();
    initHighlighter();
    initProfiler();
    initMemory();
    initRenderDebugger();
    initPicker();

    const DEBUG_INTERVAL = 1000;

    function initProbe() {
        try {
            if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene()) {
                setTimeout(initProbe, 500);
                return;
            }

            window.__mcpGetEnvInfo = function () {
                const info: any = {
                    version: cc.ENGINE_VERSION,
                    isNative: cc.sys.isNative,
                    isMobile: cc.sys.isMobile,
                    language: cc.sys.language,
                };
                try {
                    if (cc.assetManager && cc.assetManager.downloader) {
                        info.downloader = { ...cc.assetManager.downloader };
                    }
                } catch (e) {}
          
                try {
                    if (cc.dynamicAtlasManager) {
                        info.dynamicAtlas = {
                            enabled: cc.dynamicAtlasManager.enabled,
                            maxFrameSize: cc.dynamicAtlasManager.maxFrameSize,
                            minFrameSize: cc.dynamicAtlasManager.minFrameSize,
                            textureSize: cc.dynamicAtlasManager.textureSize,
                            maxAtlasCount: cc.dynamicAtlasManager.maxAtlasCount,
                            atlasCount: cc.dynamicAtlasManager.atlasCount,
                            textureBleeding: cc.dynamicAtlasManager.textureBleeding
                        };
                    }
                } catch (e) {}
          
                try {
                    if (cc.director.getPhysicsManager) {
                        const phys = cc.director.getPhysicsManager();
                        let drawFlags = {
                            aabb: false, pair: false, centerOfMass: false, joint: false, shape: false, raw: phys.debugDrawFlags || 0
                        };
                        try {
                            if (cc.PhysicsManager && cc.PhysicsManager.DrawBits && phys.debugDrawFlags) {
                                const bits = cc.PhysicsManager.DrawBits;
                                const f = phys.debugDrawFlags;
                                drawFlags.aabb = !!(f & bits.e_aabbBit);
                                drawFlags.pair = !!(f & bits.e_pairBit);
                                drawFlags.centerOfMass = !!(f & bits.e_centerOfMassBit);
                                drawFlags.joint = !!(f & bits.e_jointBit);
                                drawFlags.shape = !!(f & bits.e_shapeBit);
                            }
                        } catch(e) {}
                        
                        info.physics = {
                            enabled: phys.enabled,
                            allowSleep: phys.allowSleep,
                            maxSubSteps: phys.maxSubSteps,
                            fixedTimeStep: phys.fixedTimeStep,
                            gravity: phys.gravity ? `${phys.gravity.x}, ${phys.gravity.y}` : 'N/A',
                            drawFlags: drawFlags
                        };
                    }
                } catch (e) {}
          
                try {
                    if (cc.director.getCollisionManager) {
                        const col = cc.director.getCollisionManager();
                        info.collision = {
                            enabled: col.enabled,
                            drawBoundingBox: col.enabledDrawBoundingBox,
                            debugDraw: col.enabledDebugDraw
                        };
                    }
                } catch (e) {}
                
                return info;
            };

            // 通知中控面板握手完成
            if (window.__mcpInspector && window.__mcpInspector.sendHandshake) {
                try {
                    window.__mcpInspector.sendHandshake(JSON.stringify(window.__mcpGetEnvInfo()));
                } catch(e) {}
            }
            
            window.__mcpSyncNodeTree = syncNodeTree;

            // 设立每 3 秒的环境变量同步
            setInterval(() => {
                if (window.__mcpActiveTab !== undefined && window.__mcpActiveTab !== 2) return;
                if (window.__mcpInspector && window.__mcpInspector.updateEnv) {
                    try {
                        window.__mcpInspector.updateEnv(JSON.stringify(window.__mcpGetEnvInfo()));
                    } catch(e) {}
                }
            }, 3000);

            // 第一次立刻拉取节点数据并回传，消除等待延迟
            syncNodeTree();
            
            // 定期提取节点树 (可优化为脏检测机制，此处暂以 interval 替代)
            setInterval(() => {
                if (window.__mcpActiveTab !== undefined && window.__mcpActiveTab !== 0) return;
                syncNodeTree();
            }, DEBUG_INTERVAL);

            // 标记探针已初始化完成，防止重复注入
            window.__mcpProbeInitialized = true;

            // 启动高亮悬停侦听生命周期
            startHighlighterHook();

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

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initProbe();
    } else {
        window.addEventListener('DOMContentLoaded', initProbe);
    }
})();
