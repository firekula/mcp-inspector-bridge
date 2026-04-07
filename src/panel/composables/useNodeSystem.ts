const { nextTick } = require('vue');
declare const Editor: any;

export function useNodeSystem(globalState: any, gameView: any, nodeTreeRef: any, activeTab: any) {
    
    const syncNodeDetail = (oldObj: any, newObj: any) => {
        if (!oldObj || oldObj.id !== newObj.id) return newObj;
        for (let key in newObj) {
            if (key !== 'components') oldObj[key] = newObj[key];
        }
        if (oldObj.components && newObj.components && oldObj.components.length === newObj.components.length) {
            for (let i = 0; i < newObj.components.length; i++) {
                const oComp = oldObj.components[i];
                const nComp = newObj.components[i];
                oComp.enabled = nComp.enabled;
                oComp.name = nComp.name;
                if (oComp.properties && nComp.properties) {
                    const pMap: Record<string, any> = {};
                    oComp.properties.forEach((p: any) => pMap[p.key] = p);
                    nComp.properties.forEach((np: any) => {
                        if (pMap[np.key]) {
                            pMap[np.key].value = np.value;
                        } else {
                            oComp.properties.push(np); 
                        }
                    });
                }
            }
        } else {
            oldObj.components = newObj.components;
        }
        return oldObj;
    };

    const onNodeSelect = (node: any, isAutoRefresh: boolean = false) => {
        console.log(`[Vue Store Update] onNodeSelect triggered: id=${node ? node.id : 'null'}, autoRefresh=${isAutoRefresh}`);
        console.log(`[Selection-Debug] Trigger: Panel-onNodeSelect | NodeID: ${node ? node.id : 'null'} | AutoRefresh: ${isAutoRefresh} -> Sending setSelectionTarget to WebView`);
        const wv: any = gameView.value;
        if (wv) {
            try {
                const selCode = `if(window.__mcpCrawler && window.__mcpCrawler.setSelectionTarget){ window.__mcpCrawler.setSelectionTarget(${node ? "'" + node.id + "'" : "null"}); }`;
                wv.executeJavaScript(selCode).catch(() => {});
            } catch (e) {}

            if (!node) {
                if (!isAutoRefresh) globalState.nodeDetail = null;
                return;
            }

            const code = `window.__mcpCrawler ? JSON.stringify(window.__mcpCrawler.getNodeDetail('${node.id}')) : null`;
            wv.executeJavaScript(code).then((res: string) => {
                if (res) {
                    const newObj = JSON.parse(res);
                    const updateState = (finalObj: any) => {
                        if (isAutoRefresh && globalState.nodeDetail && globalState.nodeDetail.id === finalObj.id) {
                            syncNodeDetail(globalState.nodeDetail, finalObj);
                        } else {
                            globalState.nodeDetail = Object.assign({}, finalObj);
                        }
                    };

                    if (!newObj.prefabUuid && typeof Editor !== 'undefined' && Editor.Ipc) {
                        try {
                            Editor.Ipc.sendToPanel('scene', 'scene:query-node', node.id, (err: any, dumpObj: any) => {
                                console.log('[Editor Fallback] scene:query-node result for ' + node.id, { err, dumpObj });
                                if (!err && dumpObj) {
                                    try {
                                        const parsedDump = typeof dumpObj === 'string' ? JSON.parse(dumpObj) : dumpObj;
                                        const v = parsedDump.value || parsedDump;
                                        
                                        // A reliable deep search function to locate the asset uuid within the prefab structure
                                        const findUuid = (obj: any, depth = 0): string | null => {
                                            if (!obj || typeof obj !== 'object' || depth > 6) return null;
                                            
                                            // 预制体引用通常存在 asset 节点下，提取其中的 uuid 值 (同时规避提取到当前节点的自身 uuid 或者是 fileId)
                                            if (obj.uuid && typeof obj.uuid === 'string' && obj.uuid.length > 10 && obj.uuid.indexOf('-') !== -1 && obj.uuid !== node.id) {
                                                return obj.uuid;
                                            }
                                            if (obj._uuid && typeof obj._uuid === 'string' && obj._uuid.length > 10 && obj._uuid.indexOf('-') !== -1 && obj._uuid !== node.id) {
                                                return obj._uuid;
                                            }
                                            
                                            // 遍历对象，特别是我们要往 .value, .asset 等深入
                                            for (let key in obj) {
                                                if (key === 'fileId' || key === 'root' || key === 'sync') continue; // 跳过不相关的
                                                const res = findUuid(obj[key], depth + 1);
                                                if (res) return res;
                                            }
                                            return null;
                                        };

                                        // Start looking in the prefab property of the node dump
                                        const prefabDump = v.__prefab__ || (v.prefab && v.prefab.value) || v._prefab;
                                        if (prefabDump) {
                                            const foundId = findUuid(prefabDump);
                                            if (foundId) {
                                                newObj.prefabUuid = foundId;
                                                console.log('[Editor Fallback] Successfully located true prefabUuid:', foundId);
                                            } else {
                                                console.warn('[Editor Fallback] Could not find a valid UUID inside the prefab dump object!', prefabDump);
                                            }
                                        }

                                    } catch (e) {
                                        console.error('[Editor Fallback] Error parsing dump:', e);
                                    }
                                }
                                updateState(newObj);
                            });
                        } catch (e) {
                            console.error('[Editor Fallback] sendToPanel error:', e);
                            updateState(newObj);
                        }
                    } else {
                        updateState(newObj);
                    }
                } else {
                    if (!isAutoRefresh) globalState.nodeDetail = null;
                }
            }).catch(() => {
                if (!isAutoRefresh) globalState.nodeDetail = null;
            });
        }
    };

    const onNodeHover = (node: any) => {
        const wv: any = gameView.value;
        if (wv) {
            try {
                const hoverId = node ? node.id : '';
                const code = `if(window.__mcpCrawler && window.__mcpCrawler.setHoverTarget){ window.__mcpCrawler.setHoverTarget('${hoverId}'); }`;
                wv.executeJavaScript(code).catch(() => {});
            } catch (e) {}
        }
    };

    const onUpdateNodeProp = (payload: any) => {
        const wv: any = gameView.value;
        if (wv) {
            const { uuid, compName, propKey, value, compIndex } = payload;
            let valStr = value;
            if (typeof value === 'string') {
                valStr = '"' + value.replace(/"/g, '\\"') + '"';
            }
            const compStr = compName ? '"' + compName + '"' : 'null';
            
            const code = `
                if (window.__mcpCrawler && typeof window.__mcpCrawler.updateNodeProperty === 'function') {
                    window.__mcpCrawler.updateNodeProperty('${uuid}', ${compStr}, '${propKey}', ${valStr}, ${compIndex !== undefined ? compIndex : -1});
                } else {
                    console.error("[MCP Bridge] 致命错误: window.__mcpCrawler.updateNodeProperty 未就绪或丢失。");
                }
            `;
            const __p1 = wv.executeJavaScript(code);
            if (__p1 && __p1.catch) __p1.catch(() => { });

            try {
                if (!globalState.isEditorSceneActive) {
                    console.warn('[Bridge] 场景未激活，拦截了向 Editor 的底层 IPC 调用以防报错');
                    return;
                }
                if (typeof Editor !== 'undefined' && Editor.Ipc) {
                    Editor.Ipc.sendToPanel('scene', 'scene:query-node', uuid, (err: any, dumpObj: any) => {
                        if (err) { return; }
                        try {
                            const dump = typeof dumpObj === 'string' ? JSON.parse(dumpObj) : dumpObj;
                            const comps = dump.value.__comps__ || dump.value.components || dump.__comps__ || dump.components || dump;
                            const fs = require('fs');
                            const p = require('path').join(__dirname, '../../../memory/dump.json');
                            fs.writeFileSync(p, JSON.stringify(comps, null, 2));
                        } catch (e: any) {}
                    });
                }
            } catch (e) {
                console.error('[Bridge Webview Error] Failed to query scene node info:', e);
            }
        }
    };

    const toggleNodePicker = () => {
        globalState.isNodePickerActive = !globalState.isNodePickerActive;
        const wv: any = gameView.value;
        if (wv) {
            const method = globalState.isNodePickerActive ? 'enable' : 'disable';
            const code = `if(window.__mcpNodePicker) window.__mcpNodePicker.${method}();`;
            const p = wv.executeJavaScript(code);
            if (p && p.catch) p.catch(()=>{});
        }
    };

    const onRenderDebuggerToggle = (newVal: boolean) => {
        const wv: any = gameView.value;
        if (!wv) return;
        if (typeof wv.executeJavaScript === 'function') {
            wv.executeJavaScript(`
                var targetWin = window;
                var frm = document.getElementById('GameDiv');
                if (frm && frm.contentWindow && frm.contentWindow.__mcpRenderDebuggerHook) {
                    targetWin = frm.contentWindow;
                }
                if (targetWin.__mcpRenderDebuggerHook) {
                    if (${newVal}) {
                        targetWin.__mcpRenderDebuggerHook.injectHooks();
                    } else {
                        targetWin.__mcpRenderDebuggerHook.restoreHooks();
                    }
                }
            `).catch((err: any) => console.error("[RenderDebugger] executeJavaScript 抛出异常:", err));
        }
    };

    const onRenderDebuggerLocate = (id: string) => {
        activeTab.value = 0;
        nextTick(() => {
            const nt: any = nodeTreeRef.value;
            if (nt && nt.expandToNode) {
                const success = nt.expandToNode(id);
                if (!success && typeof Editor !== 'undefined') {
                    Editor.warn(`[ RenderDebugger ] 跨视图定位失败：查找不到 UUID 为 ${id} 的节点。`);
                }
            }
        });
    };

    let locateResourceTimer: any = null;
    const locateResource = (res: any) => {
        if (!res || !res.id) return;
        const uuid: string = res.id;
        if (uuid.length < 5 || uuid.startsWith('default-') || uuid.indexOf('preview-') !== -1) return;

        if (locateResourceTimer) clearTimeout(locateResourceTimer);
        locateResourceTimer = setTimeout(() => {
            if (typeof Editor !== 'undefined' && Editor.Ipc) {
                Editor.Ipc.sendToAll('assets:hint', uuid);
            }
        }, 300);
    };

    const onLocateNode = (uuid: string) => {
        if (nodeTreeRef.value) {
            const targetId = uuid;
            const success = (nodeTreeRef.value as any).expandToNode(targetId);
            if (!success) console.warn(`[Bridge] 树组件未能展开节点：${targetId}`);
        }
    };

    let locateAssetTimeout: any = null;
    const onLocateAsset = (uuid: string) => {
        if (!uuid) return;
        if (locateAssetTimeout) clearTimeout(locateAssetTimeout);
        locateAssetTimeout = setTimeout(() => {
            try {
                if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToAll('assets:hint', uuid);
            } catch (e: any) {
                console.warn(`[Bridge] IPC 发送失败: ${e.message}`);
            }
        }, 300);
    };

    const onPrintComp = (uuid: string, compIndex: number) => {
        const wv: any = gameView.value;
        if (wv) {
            const code = `
                if (window.__mcpCrawler && typeof window.__mcpCrawler.printComponentData === 'function') {
                    window.__mcpCrawler.printComponentData('${uuid}', ${compIndex});
                }
            `;
            const __p = wv.executeJavaScript(code);
            if (__p && __p.catch) __p.catch(() => {});
        }
    };

    return {
        onNodeSelect,
        onNodeHover,
        onUpdateNodeProp,
        toggleNodePicker,
        onRenderDebuggerToggle,
        onRenderDebuggerLocate,
        locateResource,
        onLocateNode,
        onLocateAsset,
        onPrintComp
    };
}
