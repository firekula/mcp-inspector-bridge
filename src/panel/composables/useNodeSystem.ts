const { nextTick, onUnmounted } = require('vue');
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

    const isWebViewReady = (wv: any): boolean => {
        if (!wv) return false;
        if (typeof wv.isConnected === 'boolean' && !wv.isConnected) return false;
        try {
            const id = wv.getWebContentsId();
            if (!id || id <= 0) return false;
            return true;
        } catch (e) {
            return false;
        }
    };

    const onNodeSelect = (node: any, isAutoRefresh: boolean = false) => {
        console.log(`[Vue Store Update] onNodeSelect triggered: id=${node ? node.id : 'null'}, autoRefresh=${isAutoRefresh}`);
        console.log(`[Selection-Debug] Trigger: Panel-onNodeSelect | NodeID: ${node ? node.id : 'null'} | AutoRefresh: ${isAutoRefresh} -> Sending setSelectionTarget to WebView`);
        const wv: any = gameView.value;
        if (isWebViewReady(wv)) {
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
        if (isWebViewReady(wv)) {
            try {
                const hoverId = node ? node.id : '';
                const code = `if(window.__mcpCrawler && window.__mcpCrawler.setHoverTarget){ window.__mcpCrawler.setHoverTarget('${hoverId}'); }`;
                wv.executeJavaScript(code).catch(() => {});
            } catch (e) {}
        }
    };

    const onUpdateNodeProp = (payload: any) => {
        const wv: any = gameView.value;
        if (isWebViewReady(wv)) {
            const { uuid, compName, propKey, value, compIndex, arrayIndex } = payload;
            let valStr: string;
            if (typeof value === 'string') {
                valStr = JSON.stringify(value);
            } else if (typeof value === 'object' && value !== null) {
                valStr = JSON.stringify(value);
            } else {
                valStr = String(value);
            }
            const compStr = compName ? '"' + compName + '"' : 'null';
            const arrIdxStr = arrayIndex !== undefined ? arrayIndex : -1;
            
            const code = `
                if (window.__mcpCrawler && typeof window.__mcpCrawler.updateNodeProperty === 'function') {
                    window.__mcpCrawler.updateNodeProperty('${uuid}', ${compStr}, '${propKey}', ${valStr}, ${compIndex !== undefined ? compIndex : -1}, ${arrIdxStr});
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
        if (isWebViewReady(wv)) {
            const method = globalState.isNodePickerActive ? 'enable' : 'disable';
            const code = `if(window.__mcpNodePicker) window.__mcpNodePicker.${method}();`;
            const p = wv.executeJavaScript(code);
            if (p && p.catch) p.catch(()=>{});
        }
    };

    const onRenderDebuggerToggle = (newVal: boolean) => {
        const wv: any = gameView.value;
        if (!isWebViewReady(wv)) return;
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
                let targetUuid = uuid;
                if (uuid.length === 22 || uuid.length === 23) {
                    if (typeof Editor !== 'undefined' && Editor.Utils && Editor.Utils.UuidUtils && Editor.Utils.UuidUtils.decompressUuid) {
                        try {
                            targetUuid = Editor.Utils.UuidUtils.decompressUuid(uuid);
                        } catch (err) {}
                    } else {
                        // Fallback pure JS decompression if Editor.Utils is unavailable in this context
                        try {
                            const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
                            const values = new Array(123);
                            for (let i = 0; i < 123; ++i) values[i] = 0;
                            for (let i = 0; i < 64; ++i) values[BASE64_KEYS.charCodeAt(i)] = i;
                            const HexChars = '0123456789abcdef'.split('');
                            let str = uuid;
                            let hexChars = [];
                            let start = str.length === 23 ? 5 : 2;
                            for (let i = start; i < str.length; i += 2) {
                                let lhs = values[str.charCodeAt(i)];
                                let rhs = values[str.charCodeAt(i + 1)];
                                hexChars.push(HexChars[lhs >> 2]);
                                hexChars.push(HexChars[((lhs & 3) << 2) | Math.floor(rhs / 16)]);
                                hexChars.push(HexChars[rhs & 0xF]);
                            }
                            str = str.slice(0, start) + hexChars.join('');
                            targetUuid = str.slice(0, 8) + '-' + str.slice(8, 12) + '-' + str.slice(12, 16) + '-' + str.slice(16, 20) + '-' + str.slice(20);
                        } catch (err) {}
                    }
                }
                if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToAll('assets:hint', targetUuid);
            } catch (e: any) {
                console.warn(`[Bridge] IPC 发送失败: ${e.message}`);
            }
        }, 300);
    };

    const onPrintComp = (uuid: string, compIndex: number) => {
        const wv: any = gameView.value;
        if (isWebViewReady(wv)) {
            const code = `
                if (window.__mcpCrawler && typeof window.__mcpCrawler.printComponentData === 'function') {
                    window.__mcpCrawler.printComponentData('${uuid}', ${compIndex});
                }
            `;
            const __p = wv.executeJavaScript(code);
            if (__p && __p.catch) __p.catch(() => {});
        }
    };

    const onPrintNode = (uuid: string) => {
        const wv: any = gameView.value;
        if (isWebViewReady(wv)) {
            const code = `
                if (window.__mcpCrawler && typeof window.__mcpCrawler.printNodeData === 'function') {
                    window.__mcpCrawler.printNodeData('${uuid}');
                }
            `;
            const __p = wv.executeJavaScript(code);
            if (__p && __p.catch) __p.catch(() => {});
        }
    };

    // 自动刷新逻辑
    let autoRefreshTimer: any = null;
    let autoRefreshPaused = false;

    const startAutoRefresh = () => {
        if (autoRefreshTimer) return;
        autoRefreshTimer = setInterval(() => {
            if (autoRefreshPaused) return;
            // 前置拦截：如果在悬停 inspector 面板、未选中节点或者当前选项卡并非游戏视图场景，放弃请求
            if (globalState.isInspectorHovered) return;
            if (globalState.isInspectorFocused) return;
            if (!globalState.nodeDetail || !globalState.nodeDetail.id) return;
            if (activeTab && activeTab.value !== 0) return;

            onNodeSelect({ id: globalState.nodeDetail.id }, true);
        }, 500);
    };

    const stopAutoRefresh = () => {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    };

    startAutoRefresh();

    const _onPanelHide = () => { autoRefreshPaused = true; };
    const _onPanelShow = () => { autoRefreshPaused = false; };
    window.addEventListener('panel-hide', _onPanelHide);
    window.addEventListener('panel-show', _onPanelShow);

    onUnmounted(() => {
        stopAutoRefresh();
        window.removeEventListener('panel-hide', _onPanelHide);
        window.removeEventListener('panel-show', _onPanelShow);
    });

    const exportNodeAsPsd = async (uuid: string, nodeName: string) => {
        const wv: any = gameView.value;
        if (!isWebViewReady(wv)) {
            if (typeof Editor !== 'undefined') Editor.warn('[PSD Export] WebView 未就绪');
            return;
        }

        if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 1. 开始导出节点: ${nodeName} (${uuid})`);

        const code = `window.__mcpCrawler ? window.__mcpCrawler.exportNodeAsPsdData('${uuid}') : null`;
        try {
            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 2. 正在向 WebView 发送脚本抓取节点数据...`);
            const res = await wv.executeJavaScript(code);
            if (!res) {
                if (typeof Editor !== 'undefined') Editor.warn('[PSD Export] 获取节点栅格化数据失败：WebView 返回空数据');
                return;
            }
            
            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 3. 成功获取 WebView 数据, 字节长度: ${res.length}`);
            const parsedData = JSON.parse(res);
            const { width, height, layers } = parsedData;
            if (!layers || layers.length === 0) {
                if (typeof Editor !== 'undefined') Editor.warn('[PSD Export] 没有可以导出的图层（可能图层没有渲染组件或未激活）');
                return;
            }

            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 4. 解析图层结构成功: 设计分辨率为 ${width}x${height}, 图层数量: ${layers.length}`);

            // 1. 异步加载所有图层 Base64 图片
            const loadImg = (base64Str: string, name: string): Promise<HTMLImageElement | null> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] - 成功加载图片数据: ${name} (尺寸: ${img.width}x${img.height})`);
                        resolve(img);
                    };
                    img.onerror = (e) => {
                        if (typeof Editor !== 'undefined') Editor.error(`[PSD Export] - 图片数据加载失败: ${name}`);
                        resolve(null);
                    };
                    img.src = base64Str;
                });
            };

            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 5. 正在异步载入所有 Base64 图片资源...`);
            const loadedLayers = await Promise.all(layers.map(async (layer: any, idx: number) => {
                if (layer.imageBase64) {
                    const img = await loadImg(layer.imageBase64, `${layer.name || 'Unnamed'}[${idx}]`);
                    return { ...layer, img };
                }
                return { ...layer, img: null };
            }));

            // 2. 引入 ag-psd 进行打包装包
            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 6. 正在构建 PSD 树形图层结构...`);
            const { writePsd } = require('ag-psd');
            const psdChildren: any[] = [];
            const stack = [psdChildren];

            let imageCount = 0;
            let groupCount = 0;

            for (const item of loadedLayers) {
                if (item.type === 'group') {
                    groupCount++;
                    const groupNode = {
                        name: item.name,
                        opened: true,
                        children: [] as any[],
                        opacity: item.opacity / 255
                    };
                    stack[stack.length - 1].push(groupNode);
                    stack.push(groupNode.children);
                } else if (item.type === 'group_end') {
                    stack.pop();
                } else if (item.type === 'image') {
                    if (!item.img) {
                        if (typeof Editor !== 'undefined') Editor.warn(`[PSD Export] 忽略空图像图层: ${item.name}`);
                        continue;
                    }
                    imageCount++;
                    const canvas = document.createElement('canvas');
                    canvas.width = item.width;
                    canvas.height = item.height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(item.img, 0, 0);
                    }
                    
                    if (typeof Editor !== 'undefined') {
                        Editor.log(`[PSD Export] - 放置图片图层: ${item.name}, left: ${item.left}, top: ${item.top}, width: ${item.width}, height: ${item.height}`);
                    }
                    
                    stack[stack.length - 1].push({
                        name: item.name,
                        canvas: canvas,
                        left: item.left,
                        top: item.top,
                        opacity: item.opacity / 255
                    });
                }
            }

            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 7. 树形构建完成: 图层组(文件夹)数: ${groupCount}, 图像图层数: ${imageCount}`);

            const psdConfig = {
                width: width,
                height: height,
                children: psdChildren
            };

            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 8. 正在通过 ag-psd 序列化为 PSD ArrayBuffer...`);
            const psdBuffer = writePsd(psdConfig);
            if (typeof Editor !== 'undefined') Editor.log(`[PSD Export] 9. 序列化成功, Buffer 大小: ${psdBuffer.byteLength} 字节`);
            
            // 3. 将 Uint8Array/Buffer 发送给主进程完成系统对话框保存
            if (typeof Editor !== 'undefined') {
                const arr = Array.from(new Uint8Array(psdBuffer));
                Editor.log(`[PSD Export] 10. 正在发送保存指令到主进程...`);
                Editor.Ipc.sendToMain('mcp-inspector-bridge:psd-save-file', 
                    { defaultName: `${nodeName}.psd`, bufferArray: arr }, 
                    (err: any, reply: any) => {
                        if (err) {
                            Editor.error('[PSD Export] 保存文件时主进程报错:', err.message || err);
                            return;
                        }
                        if (reply && reply.success) {
                            Editor.log(`[PSD Export] 11. PSD 成功保存至: ${reply.filePath}`);
                        } else if (reply && reply.canceled) {
                            Editor.log(`[PSD Export] 用户取消了保存操作`);
                        }
                    }
                );
            }
        } catch (e: any) {
            if (typeof Editor !== 'undefined') Editor.error('[PSD Export] 导出异常:', e.stack || e.message || e);
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
        onPrintComp,
        onPrintNode,
        exportNodeAsPsd
    };
}
