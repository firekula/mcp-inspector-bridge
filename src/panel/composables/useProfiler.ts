const { watch } = require('vue');

export function useProfiler(globalState: any, gameView: any, activeTab: any) {
    let tickTimer: any = null;
    let memoryRankTimer: any = null;
    let memoryTimer: any = null;
    let nodeCountTimer: any = null;
    let frameTimelineTimer: any = null;
    let memoryTimelineTimer: any = null;

    const startTickPolling = () => {
        if (tickTimer) return;
        const wv: any = gameView.value;
        if (!wv) return;
        tickTimer = setInterval(() => {
            const wvNow: any = gameView.value;
            if (!wvNow) return;
            // 确保 webview 已挂载 DOM 且 dom-ready 已触发
            if (typeof wvNow.isConnected === 'boolean' && !wvNow.isConnected) return;
            try { wvNow.getWebContentsId(); } catch (e) { return; }
            try {
                wvNow.executeJavaScript(
                    'window.__mcpProfilerTick ? JSON.stringify(window.__mcpProfilerTick()) : null'
                ).then((res: string) => {
                    if (res) {
                        try { Object.assign(globalState.profiler.tick, JSON.parse(res)); } catch (e) {}
                    }
                }).catch(() => {});
            } catch (e) { /* webview 未就绪，静默跳过 */ }
        }, 200);

        // 内存轮询：1s 间隔，仅取 totalMemory 供叠加框展示
        if (!memoryTimer) {
            memoryTimer = setInterval(() => {
                const wvNow: any = gameView.value;
                if (!wvNow || (typeof wvNow.isConnected === 'boolean' && !wvNow.isConnected)) return;
                try { wvNow.getWebContentsId(); } catch (e) { return; }
                try {
                    wvNow.executeJavaScript(
                        'window.__mcpGetMemoryRanking ? JSON.stringify(window.__mcpGetMemoryRanking()) : null'
                    ).then((res: string) => {
                        if (res) {
                            try {
                                const data = JSON.parse(res);
                                globalState.profiler.tick.totalMemory = data.totalMemory || 0;
                            } catch (e) {}
                        }
                    }).catch(() => {});
                } catch (e) {}
            }, 1000);
        }

        // 节点计数轮询：2s 间隔，降低 O(n) 遍历开销
        if (!nodeCountTimer) {
            nodeCountTimer = setInterval(() => {
                const wvNow: any = gameView.value;
                if (!wvNow || (typeof wvNow.isConnected === 'boolean' && !wvNow.isConnected)) return;
                try { wvNow.getWebContentsId(); } catch (e) { return; }
                try {
                    wvNow.executeJavaScript(
                        'window.__mcpCountNodes ? window.__mcpCountNodes() : 0'
                    ).then((res: number) => {
                        globalState.profiler.tick.nodeCount = typeof res === 'number' ? res : 0;
                    }).catch(() => {});
                } catch (e) {}
            }, 2000);
        }

        // 帧时间历史轮询：500ms 间隔，更新帧时间波形图
        if (!frameTimelineTimer) {
            frameTimelineTimer = setInterval(() => {
                const wvNow: any = gameView.value;
                if (!wvNow || (typeof wvNow.isConnected === 'boolean' && !wvNow.isConnected)) return;
                try { wvNow.getWebContentsId(); } catch (e) { return; }
                try {
                    wvNow.executeJavaScript(
                        'window.__mcpGetFrameTimeline ? JSON.stringify(window.__mcpGetFrameTimeline()) : null'
                    ).then((res: string) => {
                        if (res) {
                            try {
                                const data = JSON.parse(res);
                                globalState.profiler.frameTimeline.frameTimes = data.frameTimes || [];
                                globalState.profiler.frameTimeline.capacity = data.capacity || 600;
                                globalState.profiler.frameTimeline.lastUpdate = Date.now();
                            } catch (e) {}
                        }
                    }).catch(() => {});
                } catch (e) {}
            }, 500);
        }

        // 内存时间轴轮询：2s 间隔，更新内存趋势图与泄漏检测
        if (!memoryTimelineTimer) {
            memoryTimelineTimer = setInterval(() => {
                const wvNow: any = gameView.value;
                if (!wvNow || (typeof wvNow.isConnected === 'boolean' && !wvNow.isConnected)) return;
                try { wvNow.getWebContentsId(); } catch (e) { return; }
                try {
                    // 获取内存历史
                    wvNow.executeJavaScript(
                        'window.__mcpGetMemoryTimeline ? JSON.stringify(window.__mcpGetMemoryTimeline()) : null'
                    ).then((res: string) => {
                        if (res) {
                            try {
                                const data = JSON.parse(res);
                                globalState.profiler.memoryTimeline.history = data.history || [];
                                globalState.profiler.memoryTimeline.capacity = data.capacity || 150;
                                globalState.profiler.memoryTimeline.lastUpdate = Date.now();
                            } catch (e) {}
                        }
                    }).catch(() => {});

                    // 获取泄漏检测结果
                    wvNow.executeJavaScript(
                        'window.__mcpDetectMemoryLeak ? JSON.stringify(window.__mcpDetectMemoryLeak()) : null'
                    ).then((res: string) => {
                        if (res) {
                            try {
                                const data = JSON.parse(res);
                                Object.assign(globalState.profiler.leakDetection, data);
                                globalState.profiler.leakDetection.lastCheck = Date.now();
                            } catch (e) {}
                        }
                    }).catch(() => {});

                    // 获取着色器/纹理详情
                    wvNow.executeJavaScript(
                        'window.__mcpGetShaderTextureDetails ? JSON.stringify(window.__mcpGetShaderTextureDetails()) : null'
                    ).then((res: string) => {
                        if (res) {
                            try {
                                const data = JSON.parse(res);
                                Object.assign(globalState.profiler.shaderTextureDetails, data);
                                globalState.profiler.shaderTextureDetails.lastUpdate = Date.now();
                            } catch (e) {}
                        }
                    }).catch(() => {});
                } catch (e) {}
            }, 2000);
        }
    };

    const stopTickPolling = () => {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (memoryTimer) { clearInterval(memoryTimer); memoryTimer = null; }
        if (nodeCountTimer) { clearInterval(nodeCountTimer); nodeCountTimer = null; }
        if (frameTimelineTimer) { clearInterval(frameTimelineTimer); frameTimelineTimer = null; }
        if (memoryTimelineTimer) { clearInterval(memoryTimelineTimer); memoryTimelineTimer = null; }
    };

    const setupProfilerWatchers = () => {
        watch(activeTab, (newVal: number) => {
            const wv: any = gameView.value;
            if (newVal === 4 && wv) {
                startTickPolling();

                if (!memoryRankTimer) {
                    let uuidNameCache: Record<string, string> = {};

                    memoryRankTimer = setInterval(() => {
                        const expr = `window.__mcpGetMemoryRanking ? JSON.stringify(window.__mcpGetMemoryRanking()) : null`;
                        wv.executeJavaScript(expr).then((res: string) => {
                            if (res) {
                                try {
                                    const data = JSON.parse(res);
                                    const EditorContext = (window as any).Editor;

                                    const resolveRealName = (item: any) => {
                                        if (uuidNameCache[item.id]) {
                                            item.name = uuidNameCache[item.id];
                                            return;
                                        }
                                        const remoteDb = EditorContext && EditorContext.assetdb && EditorContext.assetdb.remote;
                                        if (remoteDb && typeof remoteDb.uuidToUrl === 'function') {
                                            const url = remoteDb.uuidToUrl(item.id);
                                            if (url && typeof url === 'string') {
                                                let cleanUrl = url.replace('db://assets/', '');
                                                cleanUrl = cleanUrl.replace('db://internal/', '[Internal] ');
                                                item.name = cleanUrl;
                                                uuidNameCache[item.id] = item.name;
                                                return;
                                            }
                                        }
                                        uuidNameCache[item.id] = item.name;
                                    };

                                    if (data.allResources) data.allResources.forEach(resolveRealName);

                                    if (data.bundles) {
                                        const oldBundles = globalState.profiler.memoryStats && globalState.profiler.memoryStats.bundles;
                                        const oldMemMap: Record<string, number> = {};
                                        if (oldBundles) {
                                            oldBundles.forEach((ob: any) => {
                                                oldMemMap[ob.name] = ob.currentMemory;
                                            });
                                        }

                                        data.bundles.forEach((b: any) => {
                                            if (b.resources) b.resources.forEach(resolveRealName);
                                            const oldMem = oldMemMap[b.name];
                                            if (oldMem !== undefined) {
                                                if (b.currentMemory > oldMem) b.trend = 'up';
                                                else if (b.currentMemory < oldMem) b.trend = 'down';
                                                else b.trend = 'flat';
                                            } else {
                                                b.trend = 'flat';
                                            }
                                        });

                                        data.bundles.sort((a: any, b: any) => b.currentMemory - a.currentMemory);
                                    }

                                    globalState.profiler.memoryStats = data;
                                } catch (e) { }
                            }
                        }).catch(() => { });
                    }, 1000);
                }
            } else {
                // 离开 Tab 4：仅当叠加框也不需要时才停止 tick 轮询
                // stopTickPolling 由 useGameView 通过 isShowFPS 控制，此处不强制停止
                if (memoryRankTimer) {
                    clearInterval(memoryRankTimer);
                    memoryRankTimer = null;
                }
            }
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
        setupProfilerWatchers,
        formatBytes,
        startTickPolling,
        stopTickPolling
    };
}
